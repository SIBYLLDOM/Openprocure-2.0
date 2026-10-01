import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { renderLetterHtml, renderBusinessTableHtml, wrapDocument } from "./pdfTemplate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LETTER_DATE = "01st April 2026";
const FY_LABEL = "26-27";

let browserPromise = null;
async function getBrowser() {
  if (browserPromise) {
    const existing = await browserPromise;
    if (existing.connected) return existing;
    browserPromise = null;
  }
  browserPromise = puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  return browserPromise;
}

// A4 landscape (297x210mm) minus 10mm top/bottom margins, in CSS px at 96dpi, with a small safety buffer.
const PAGE_HEIGHT_PX = Math.floor((210 - 20) * (96 / 25.4) * 0.97);
const MIN_TABLE_FONT_PX = 3.5;
const MAX_TABLE_FONT_PX = 8;

async function shrinkToFit(page, sectionId) {
  const exists = await page.$(`#${sectionId}`);
  if (!exists) return;

  let fontSize = MAX_TABLE_FONT_PX;
  for (let i = 0; i < 20; i++) {
    const height = await page.evaluate((id) => document.getElementById(id)?.scrollHeight ?? 0, sectionId);
    if (height <= PAGE_HEIGHT_PX || fontSize <= MIN_TABLE_FONT_PX) break;
    fontSize = Math.max(MIN_TABLE_FONT_PX, fontSize - 0.25);
    await page.evaluate(
      (id, fs) => {
        document.getElementById(id).style.setProperty("--tfs", `${fs}px`);
      },
      sectionId,
      fontSize
    );
  }
}

const imageDataUriCache = {};
function getImageDataUri(fileName) {
  if (!imageDataUriCache[fileName]) {
    const filePath = path.join(__dirname, "assets", fileName);
    const b64 = fs.readFileSync(filePath).toString("base64");
    imageDataUriCache[fileName] = `data:image/png;base64,${b64}`;
  }
  return imageDataUriCache[fileName];
}

export async function generatePersonPdf({ personKey, mdpl, mepl }) {
  const dMdpl = mdpl.byName[personKey];
  const dMepl = mepl.byName[personKey];
  const person = dMdpl || dMepl;
  if (!person) throw new Error("Person not found");

  let html = renderLetterHtml(person, {
    fyLabel: FY_LABEL,
    dateStr: LETTER_DATE,
    logoDataUri: getImageDataUri("logo.png"),
    anjulSignUri: getImageDataUri("anjulsign.png"),
    shailSignUri: getImageDataUri("shalsign.png"),
    anandSignUri: getImageDataUri("anandsign.png"),
  });

  if (dMdpl) {
    html += renderBusinessTableHtml({
      id: "table-page-diagnostics",
      title: "SALES TARGET - DIAGNOSTICS",
      nameLabel: "Name :",
      personName: person.displayName,
      target: dMdpl.total,
      rsm: dMdpl.rsm,
      zonalHead: dMdpl.zonalHead,
      groupOrder: Object.keys(dMdpl.groups).sort(),
      groups: dMdpl.groups,
      footerRoles: ["FLSP/ASM", "RSM / Dy. ZSM", "ZSM / ZH", "Business Head"],
      businessLabel: "Business",
      categoryLabel: "Business Group",
      logoDataUri: getImageDataUri("logo.png"),
      businessHeadSignUri: getImageDataUri("buisnessheadsign.png"),
    });
  }

  if (dMepl) {
    html += renderBusinessTableHtml({
      id: "table-page-endosurgery",
      title: "SALES TARGET - ENDO SURGERY",
      nameLabel: "Employee Name :",
      personName: person.displayName,
      target: dMepl.total,
      rsm: dMepl.rsm,
      zonalHead: dMepl.zonalHead,
      groupOrder: Object.keys(dMepl.groups).sort(),
      groups: dMepl.groups,
      footerRoles: ["FLSP/ASM", "RSM / Dy. ZSM", "ZSM / ZH", "Business Head"],
      businessLabel: "Portfolio",
      categoryLabel: "Category",
      logoDataUri: getImageDataUri("logo.png"),
      businessHeadSignUri: getImageDataUri("buisnessheadsign.png"),
    });
  }

  const doc = wrapDocument(html);
  return renderPdfWithRetry(doc);
}

async function renderPdfWithRetry(doc, attempt = 0) {
  let browser;
  try {
    browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(doc, { waitUntil: "networkidle0" });
      await shrinkToFit(page, "table-page-diagnostics");
      await shrinkToFit(page, "table-page-endosurgery");
      return await page.pdf({
        format: "A4",
        landscape: true,
        printBackground: true,
        margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
      });
    } finally {
      await page.close().catch(() => {});
    }
  } catch (err) {
    if (attempt === 0) {
      browserPromise = null; // force relaunch on retry
      return renderPdfWithRetry(doc, attempt + 1);
    }
    throw err;
  }
}

export async function closeBrowser() {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
  }
}
