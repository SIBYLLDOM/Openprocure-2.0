'use strict';
// Ported from the standalone targeting-system/server (Express app on its own
// port, no auth, no shared storage) into this app's own backend — same
// upload -> parse -> pick names -> generate PDF flow, now behind this app's
// own JWT auth and living in the shared uploads/ tree instead of a separate
// unhosted process nobody was running.
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const AdmZip = require('adm-zip');
const crypto = require('crypto');
const puppeteer = require('puppeteer');
const { parseWorkbook, normalizeNameKey } = require('../utils/budgetTargetingExcelParser');
const { renderLetterHtml, renderBusinessTableHtml, wrapDocument } = require('../utils/budgetTargetingPdfTemplate');
const { lookupEmailExact, lookupEmailForCc } = require('../utils/budgetTargetingEmailDirectory');
const { sendMail, layout } = require('../utils/mailer');

const BASE_DIR = path.join(__dirname, '../../uploads/budget-targeting');
const UPLOAD_DIR = path.join(BASE_DIR, 'staging');
const GENERATED_DIR = path.join(BASE_DIR, 'generated');
const CACHE_FILE = path.join(BASE_DIR, 'dataset-cache.json');
const ASSETS_DIR = path.join(__dirname, '../asset/budget-targeting');
// Bundled fallback workbook — ships with the app so the page opens with a
// dataset already loaded (nobody has to upload the yearly budget workbook
// themselves before they can use the page); "Upload New Excel" replaces it.
const DEFAULT_WORKBOOK_PATH = path.join(ASSETS_DIR, 'default-workbook.xlsx');
const DEFAULT_WORKBOOK_NAME = 'ZH - Government Budget 2026-27.xlsx';
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(GENERATED_DIR, { recursive: true });

const upload = multer({ dest: UPLOAD_DIR, limits: { fileSize: 200 * 1024 * 1024 } });
exports.uploadMiddleware = upload.single('file');

// In-memory, persisted to disk so a server restart doesn't force a re-upload —
// same tradeoff the standalone version made; this is a single-instance
// low-traffic internal tool, not something that needs a real DB table.
let dataset = null; // { mepl, mdpl, names, fileName }
const generatedDocs = new Map(); // id -> { id, key, displayName, fileName, filePath, createdAt }

async function initDataset() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      dataset = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      // Backfill fileName for a cache written before this field existed.
      if (!dataset.fileName) dataset.fileName = DEFAULT_WORKBOOK_NAME;
      console.log(`[budget-targeting] Loaded cached workbook (${dataset.names.length} names) from ${CACHE_FILE}`);
      return;
    }
    if (fs.existsSync(DEFAULT_WORKBOOK_PATH)) {
      const parsed = await parseWorkbook(DEFAULT_WORKBOOK_PATH);
      dataset = { ...parsed, fileName: DEFAULT_WORKBOOK_NAME };
      fs.writeFile(CACHE_FILE, JSON.stringify(dataset), (err) => {
        if (err) console.error('[budget-targeting] Failed to persist dataset cache:', err.message);
      });
      console.log(`[budget-targeting] Parsed bundled default workbook (${dataset.names.length} names)`);
    }
  } catch (err) {
    console.error('[budget-targeting] Failed to load dataset:', err.message);
  }
}
initDataset();

/* ─── PDF rendering (ported from pdfGenerator.js) ──────────────────────── */

// Format matches the client's reference letter exactly: "Date: - 01st April 2026,"
// (trailing comma), "Subject: Sales Target F.Y. 2026-27" (full 4-digit start year
// in the subject only — every other mention of the FY in the body uses the short
// "26-27" form, e.g. "goals for FY 26-27").
const LETTER_DATE = '01st April 2026,';
const FY_LABEL = '2026-27';
const FY_SHORT = '26-27';

// Standing Cc's for the "Send via Mail" feature, on top of each person's own
// RSM/Zonal Head — added by whichever division(s) the person has a target in.
const DIAGNOSTICS_FIXED_CC = ['shaiju.varghese@merillife.com', 'rana.nandy@merillife.com'];
const ENDO_FIXED_CC = ['harish.gulati@merillife.com', 'rana.nandy@merillife.com'];
// Cc'd on every real send, regardless of division — not the sample-mail
// test send, which is deliberately isolated to just the typed-in address.
const ALWAYS_FIXED_CC = ['omkar.chavan@merillife.com'];

// Puppeteer is already a dependency here (used by doc-prep's own PDF export)
// — reuse the same lazy-launch-and-keep-alive pattern rather than spinning up
// a second browser instance per request.
let browserPromise = null;
async function getBrowser() {
  if (browserPromise) {
    const existing = await browserPromise;
    if (existing.connected) return existing;
    browserPromise = null;
  }
  browserPromise = puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  return browserPromise;
}

// A4 landscape (297x210mm) minus 10mm top/bottom margins, in CSS px at 96dpi, with a small safety buffer.
const PAGE_HEIGHT_PX = Math.floor((210 - 20) * (96 / 25.4) * 0.97);
const MIN_TABLE_FONT_PX = 3.5;
const MAX_TABLE_FONT_PX = 8;

// Was the actual bottleneck for a large batch — not PDF export itself, but
// this loop: up to 20 iterations, each TWO separate page.evaluate() round
// trips (read scrollHeight, then set the font size), per table, per person —
// up to 80 Chrome DevTools round trips (each forcing a layout reflow) for
// one PDF. A binary search that sets-and-measures in a single round trip per
// iteration gets the same visual result in ~8 round trips per table instead.
async function shrinkToFit(page, sectionId) {
  const exists = await page.$(`#${sectionId}`);
  if (!exists) return;

  const measureAt = (fontSize) => page.evaluate((id, fs) => {
    const el = document.getElementById(id);
    if (!el) return 0;
    el.style.setProperty('--tfs', `${fs}px`);
    return el.scrollHeight;
  }, sectionId, fontSize);

  // Common case: the table already fits at full size — skip the search
  // entirely (this is most people's Endo Surgery table, and often Diagnostics too).
  const maxHeight = await measureAt(MAX_TABLE_FONT_PX);
  if (maxHeight <= PAGE_HEIGHT_PX) return;

  let lo = MIN_TABLE_FONT_PX, hi = MAX_TABLE_FONT_PX;
  // 7 iterations narrows the range from ~4.5px to <0.04px — far finer than
  // the eye (or the old 0.25px linear step) can tell apart.
  for (let i = 0; i < 7; i++) {
    const mid = (lo + hi) / 2;
    const height = await measureAt(mid);
    if (height <= PAGE_HEIGHT_PX) lo = mid; else hi = mid;
  }
  await measureAt(lo); // leave the section rendered at the largest size that fit
}

const imageDataUriCache = {};
function getImageDataUri(fileName) {
  if (!imageDataUriCache[fileName]) {
    const filePath = path.join(ASSETS_DIR, fileName);
    const b64 = fs.readFileSync(filePath).toString('base64');
    imageDataUriCache[fileName] = `data:image/png;base64,${b64}`;
  }
  return imageDataUriCache[fileName];
}

async function generatePersonPdf({ personKey, mdpl, mepl }) {
  const dMdpl = mdpl.byName[personKey];
  const dMepl = mepl.byName[personKey];
  const person = dMdpl || dMepl;
  if (!person) throw new Error('Person not found');

  let html = renderLetterHtml(person, {
    fyLabel: FY_LABEL,
    fyShort: FY_SHORT,
    dateStr: LETTER_DATE,
    logoDataUri: getImageDataUri('logo.png'),
    anjulSignUri: getImageDataUri('anjulsign.png'),
    shailSignUri: getImageDataUri('shalsign.png'),
    anandSignUri: getImageDataUri('anandsign.png'),
  });

  if (dMdpl) {
    html += renderBusinessTableHtml({
      id: 'table-page-diagnostics',
      title: `SALES TARGET FY ${FY_LABEL}`,
      divisionLabel: 'Diagnostics',
      nameLabel: 'Name :',
      personName: person.displayName,
      target: dMdpl.total,
      rsm: dMdpl.rsm,
      zonalHead: dMdpl.zonalHead,
      // Real pivot row order from the source workbook, not alphabetical
      // (e.g. "Instrument", "Instrument - Others", "Reagent", "Rapid & Elisa").
      groupOrder: mdpl.groupOrder ? mdpl.groupOrder.filter((g) => dMdpl.groups[g]) : Object.keys(dMdpl.groups).sort(),
      groups: dMdpl.groups,
      categoryOrder: mdpl.categoryOrder,
      footerRoles: ['FLSP/ASM', 'RSM / Dy. ZSM', 'ZSM / ZH', 'Business Head'],
      businessLabel: 'Business',
      categoryLabel: 'Business Group',
      logoDataUri: getImageDataUri('logo.png'),
      businessHeadSignUri: getImageDataUri('buisnessheadsign.png'),
    });
  }

  if (dMepl) {
    html += renderBusinessTableHtml({
      id: 'table-page-endosurgery',
      title: `SALES TARGET FY ${FY_LABEL}`,
      divisionLabel: 'Endo-Surgery',
      nameLabel: 'Employee Name :',
      personName: person.displayName,
      target: dMepl.total,
      rsm: dMepl.rsm,
      zonalHead: dMepl.zonalHead,
      groupOrder: mepl.groupOrder ? mepl.groupOrder.filter((g) => dMepl.groups[g]) : Object.keys(dMepl.groups).sort(),
      groups: dMepl.groups,
      categoryOrder: mepl.categoryOrder,
      footerRoles: ['FLSP/ASM', 'RSM / Dy. ZSM', 'ZSM / ZH', 'Business Head'],
      businessLabel: 'Portfolio',
      categoryLabel: 'Category',
      logoDataUri: getImageDataUri('logo.png'),
      businessHeadSignUri: getImageDataUri('buisnessheadsign.png'),
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
      await page.setContent(doc, { waitUntil: 'networkidle0' });
      await shrinkToFit(page, 'table-page-diagnostics');
      await shrinkToFit(page, 'table-page-endosurgery');
      return await page.pdf({
        format: 'A4',
        landscape: true,
        printBackground: true,
        margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
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

/* ─── Routes ─────────────────────────────────────────────────────────────── */

/**
 * POST /api/budget-targeting/upload
 * Multipart: file (.xlsx)
 */
exports.uploadWorkbook = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const parsed = await parseWorkbook(req.file.path);
    // "Upload New Excel" replacing the bundled/previous workbook — this
    // becomes the new default from here on (persisted to the same cache the
    // server loads at boot, same as before).
    dataset = { ...parsed, fileName: req.file.originalname };
    fs.writeFile(CACHE_FILE, JSON.stringify(dataset), (err) => {
      if (err) console.error('[budget-targeting] Failed to persist dataset cache:', err.message);
    });
    res.json({ count: parsed.names.length, names: parsed.names, fileName: dataset.fileName });
  } catch (err) {
    console.error('[budget-targeting] upload:', err);
    res.status(500).json({ error: 'Failed to parse workbook: ' + err.message });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
};

/** GET /api/budget-targeting/names */
exports.listNames = (req, res) => {
  if (!dataset) return res.status(404).json({ error: 'No workbook uploaded yet' });
  res.json({ names: dataset.names, fileName: dataset.fileName || null });
};

/** GET /api/budget-targeting/person/:key */
exports.getPerson = (req, res) => {
  if (!dataset) return res.status(404).json({ error: 'No workbook uploaded yet' });
  const key = normalizeNameKey(req.params.key);
  const mdpl = dataset.mdpl.byName[key];
  const mepl = dataset.mepl.byName[key];
  if (!mdpl && !mepl) return res.status(404).json({ error: 'Person not found' });
  res.json({ key, mdpl, mepl });
};

/**
 * POST /api/budget-targeting/generate
 * Body: { keys: string[] }
 */
// Runs `fn` over `items` with at most `limit` in flight at once — plain
// sequential generation (one puppeteer page at a time) was the main reason a
// big batch took minutes and then blew through the browser's/proxy's request
// timeout with nothing to show for it. Order of results doesn't matter here
// (each result already carries its own key), so a simple worker pool is
// enough — no need for a queueing library for this one call site.
async function runWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function generateOnePdf(rawKey) {
  // Every field this pulls (dMdpl/dMepl, groups, rsm, zonalHead...) is read
  // fresh from `dataset` keyed by this exact person's normalized name, and
  // generatePersonPdf/renderPdfWithRetry open their own isolated puppeteer
  // page per call — nothing here is shared *mutable* state between
  // concurrent calls, so running several of these in parallel (below) can't
  // cross-contaminate one person's letter with another's data.
  const key = normalizeNameKey(rawKey);
  const person = dataset.mdpl.byName[key] || dataset.mepl.byName[key];
  if (!person) return { rawKey, error: 'Person not found' };

  try {
    const pdfBuffer = await generatePersonPdf({ personKey: key, mdpl: dataset.mdpl, mepl: dataset.mepl });
    const id = crypto.randomUUID();
    const safeName = person.displayName.replace(/[^a-z0-9]+/gi, '_');
    const fileName = `${safeName}_Sales_Target.pdf`;
    const filePath = path.join(GENERATED_DIR, `${id}.pdf`);
    fs.writeFileSync(filePath, Buffer.from(pdfBuffer));

    const doc = { id, key, displayName: person.displayName, fileName, filePath, createdAt: Date.now() };
    generatedDocs.set(id, doc);
    return {
      rawKey,
      ok: { id, key, displayName: person.displayName, fileName, viewUrl: `/budget-targeting/generated/${id}`, downloadUrl: `/budget-targeting/generated/${id}?download=1` },
    };
  } catch (err) {
    console.error(`[budget-targeting] Failed to generate PDF for ${rawKey}:`, err.message);
    return { rawKey, error: err.message };
  }
}

exports.generatePdfs = async (req, res) => {
  if (!dataset) return res.status(404).json({ error: 'No workbook uploaded yet' });
  const keys = Array.isArray(req.body?.keys) ? req.body.keys : [];
  if (keys.length === 0) return res.status(400).json({ error: 'No names provided' });

  // 4 pages in flight at once — puppeteer/Chrome handles several concurrent
  // pages on one browser fine, and this is what actually cuts a 71-person
  // batch from ~5 minutes down to a bit over a minute (as opposed to trying
  // to render faster per-PDF, which was never really the bottleneck).
  const outcomes = await runWithConcurrency(keys, 4, generateOnePdf);

  const results = outcomes.filter((o) => o.ok).map((o) => o.ok);
  const errors = outcomes.filter((o) => o.error).map((o) => ({ key: o.rawKey, error: o.error }));

  res.json({ generated: results, errors });
};

/** GET /api/budget-targeting/generated/:id?download=1 */
exports.downloadGenerated = (req, res) => {
  const doc = generatedDocs.get(req.params.id);
  if (!doc || !fs.existsSync(doc.filePath)) return res.status(404).json({ error: 'Document not found' });
  const disposition = req.query.download ? 'attachment' : 'inline';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${disposition}; filename="${doc.fileName}"`);
  fs.createReadStream(doc.filePath).pipe(res);
};

/** GET /api/budget-targeting/generated */
exports.listGenerated = (req, res) => {
  res.json({
    generated: [...generatedDocs.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((d) => ({ id: d.id, key: d.key, displayName: d.displayName, fileName: d.fileName, viewUrl: `/budget-targeting/generated/${d.id}`, downloadUrl: `/budget-targeting/generated/${d.id}?download=1` })),
  });
};

/**
 * POST /api/budget-targeting/send-mail
 * Body: { ids: string[] } — ids of already-generated docs (from /generate).
 * Sends each PDF to the person's own email (exact match only — a miss is
 * reported as an error rather than guessed), Cc'ing their RSM and Zonal Head
 * from whichever division(s) they appear in (deduped; a Cc miss is silently
 * omitted rather than blocking the send — see budgetTargetingEmailDirectory.js).
 */
/** Subject + body shared by both the real send and the sample-mail test send
 * — same letter, same wording, only the recipient(s) differ. */
function buildLetterMail(doc) {
  return {
    subject: `Sales Target F.Y. ${FY_LABEL} - ${doc.displayName}`,
    html: layout({
      heading: `Sales Target F.Y. ${FY_LABEL}`,
      // layout() wraps `intro` in its own single <p>, so paragraph breaks
      // here are <br><br> rather than nested <p> tags (which most email
      // clients render inconsistently).
      intro: `Dear ${doc.displayName},<br><br>`
        + `<strong>A target is not a limit—it's a starting point.</strong><br><br>`
        + `As we step into FY ${FY_LABEL}, let's aim higher, push beyond expectations, and turn every challenge into an opportunity to achieve more. `
        + `With determination, consistency, and the right mindset, every ambitious goal can become a remarkable achievement.<br><br>`
        + `<strong>Don't just reach the target—go beyond it and create a milestone of your own.</strong><br><br>`
        + `Let's make FY ${FY_LABEL} a year of extraordinary growth, success, and achievements!<br><br>`
        + `Best Regards,<br>`
        + `Omkar Kishor Chavan`,
      footer: 'This is an automated message from OpenProcure — Budget Targeting System.',
    }),
  };
}

/**
 * POST /api/budget-targeting/send-sample-mail
 * Body: { id, email } — sends the already-generated PDF to ONLY the given
 * test address, no RSM/Zonal Head/division Cc's at all. For checking the
 * letter/formatting before the real batch send, without touching anyone's
 * real inbox.
 */
exports.sendSampleMail = async (req, res) => {
  const { id, email } = req.body || {};
  if (!id || !email) return res.status(400).json({ error: 'id and email are required' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'That doesn\'t look like a valid email address' });

  const doc = generatedDocs.get(id);
  if (!doc || !fs.existsSync(doc.filePath)) {
    return res.status(404).json({ error: 'Document not found — generate it again first' });
  }

  const { subject, html } = buildLetterMail(doc);
  const result = await sendMail({
    to: email,
    // No cc at all — a sample send is deliberately isolated to just the one
    // test address the caller typed in.
    subject: `[Sample] ${subject}`,
    html,
    attachments: [{ filename: doc.fileName, path: doc.filePath }],
  });

  if (!result.ok) return res.status(502).json({ error: result.error || 'Send failed' });
  res.json({ ok: true, to: email });
};

async function sendOneMail(id) {
  const doc = generatedDocs.get(id);
  if (!doc || !fs.existsSync(doc.filePath)) {
    return { id, error: 'Document not found — generate it again first' };
  }

  try {
    const toEmail = await lookupEmailExact(doc.displayName);
    if (!toEmail) {
      return { id, key: doc.key, displayName: doc.displayName, error: `No email on file for "${doc.displayName}"` };
    }

    // A person can appear in both Diagnostics and Endo Surgery with
    // different RSM/Zonal Head per division — collect from both, dedupe.
    const dMdpl = dataset.mdpl.byName[doc.key];
    const dMepl = dataset.mepl.byName[doc.key];
    const ccNames = [dMdpl?.rsm, dMdpl?.zonalHead, dMepl?.rsm, dMepl?.zonalHead].filter(Boolean);
    const ccEmailsResolved = await Promise.all([...new Set(ccNames)].map((n) => lookupEmailForCc(n)));
    // Fixed Cc's by division, on top of RSM/Zonal Head — both if the person
    // has targets in both divisions.
    const fixedCc = [
      ...(dMdpl ? DIAGNOSTICS_FIXED_CC : []),
      ...(dMepl ? ENDO_FIXED_CC : []),
      ...ALWAYS_FIXED_CC,
    ];
    // An RSM's own letter lists them as their own "RSM" (and likewise a
    // Zonal Head as their own "Zonal Head") — same convention as an FLSP
    // row, so that resolves to their own email; drop it from Cc rather
    // than have someone Cc'd on their own letter.
    const ccEmails = [...new Set([...ccEmailsResolved.filter(Boolean), ...fixedCc])]
      .filter((e) => e.toLowerCase() !== toEmail.toLowerCase());

    const { subject, html } = buildLetterMail(doc);
    const result = await sendMail({
      to: toEmail,
      cc: ccEmails,
      subject,
      html,
      attachments: [{ filename: doc.fileName, path: doc.filePath }],
    });

    if (result.ok) {
      return { id, ok: { id, key: doc.key, displayName: doc.displayName, to: toEmail, cc: ccEmails } };
    }
    return { id, key: doc.key, displayName: doc.displayName, error: result.error || 'Send failed' };
  } catch (err) {
    console.error(`[budget-targeting] sendGeneratedMail failed for ${id}:`, err.message);
    return { id, key: doc.key, displayName: doc.displayName, error: err.message };
  }
}

exports.sendGeneratedMail = async (req, res) => {
  if (!dataset) return res.status(404).json({ error: 'No workbook uploaded yet' });
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (ids.length === 0) return res.status(400).json({ error: 'No documents specified' });

  // Gmail's SMTP relay returns 550-5.4.5 "Daily user sending limit exceeded"
  // when it sees rapid-fire parallel connections from the same account — even
  // well below the actual 500/day quota — because it interprets the burst as
  // abusive behaviour. The only reliable fix is strictly sequential sends with
  // a short pause between each one, which looks like a normal human sending
  // pattern rather than a script hammering the relay.
  const sent = [];
  const errors = [];
  for (let i = 0; i < ids.length; i++) {
    const outcome = await sendOneMail(ids[i]);
    if (outcome.ok) sent.push(outcome.ok);
    else errors.push({ id: outcome.id, key: outcome.key, displayName: outcome.displayName, error: outcome.error });
    // 1.5 s gap between sends — enough to stay under Gmail's burst detection
    // without making a 84-person batch take more than ~2 minutes total.
    if (i < ids.length - 1) await new Promise((r) => setTimeout(r, 1500));
  }

  res.json({ sent, errors });
};

/**
 * POST /api/budget-targeting/pdf/bulk
 * Body: { keys: string[] }
 * Same generate step as /generate, but streamed back as one ZIP instead of
 * being individually registered — used by "download all selected" rather
 * than the one-by-one Generated Documents list.
 */
exports.bulkDownload = async (req, res) => {
  if (!dataset) return res.status(404).json({ error: 'No workbook uploaded yet' });
  const keys = Array.isArray(req.body?.keys) ? req.body.keys : [];
  if (keys.length === 0) return res.status(400).json({ error: 'No names provided' });

  try {
    const zip = new AdmZip();
    const usedNames = new Set();
    for (const rawKey of keys) {
      const key = normalizeNameKey(rawKey);
      const person = dataset.mdpl.byName[key] || dataset.mepl.byName[key];
      if (!person) continue;
      const pdfBuffer = await generatePersonPdf({ personKey: key, mdpl: dataset.mdpl, mepl: dataset.mepl });
      let safeName = person.displayName.replace(/[^a-z0-9]+/gi, '_');
      if (usedNames.has(safeName)) safeName += `_${key.length}`;
      usedNames.add(safeName);
      zip.addFile(`${safeName}_Sales_Target.pdf`, Buffer.from(pdfBuffer));
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="Sales_Target_Letters.zip"`);
    res.send(zip.toBuffer());
  } catch (err) {
    console.error('[budget-targeting] bulkDownload:', err);
    res.status(500).json({ error: 'Failed to build ZIP: ' + err.message });
  }
};
