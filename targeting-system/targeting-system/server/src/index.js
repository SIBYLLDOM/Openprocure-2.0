import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { ZipArchive } from "archiver";
import { parseWorkbook, normalizeNameKey } from "./excelParser.js";
import { generatePersonPdf } from "./pdfGenerator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, "..", "uploads");
const dataDir = path.join(__dirname, "..", "data");
const generatedDir = path.join(__dirname, "..", "generated");
const cacheFile = path.join(dataDir, "dataset-cache.json");
fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(generatedDir, { recursive: true });

// In-memory registry of PDFs generated this session, keyed by id, so the UI can list
// and re-open them without re-generating. Files live under server/generated/.
const generatedDocs = new Map(); // id -> { id, key, displayName, fileName, filePath, createdAt }

const upload = multer({ dest: uploadDir, limits: { fileSize: 200 * 1024 * 1024 } });

const app = express();
app.use(cors());
app.use(express.json());

// In-memory store of the most recently uploaded/parsed workbook, persisted to disk
// so a server restart (crash, redeploy, dev auto-reload) doesn't force a re-upload.
let dataset = null; // { mepl, mdpl, names }

function loadCachedDataset() {
  try {
    if (fs.existsSync(cacheFile)) {
      dataset = JSON.parse(fs.readFileSync(cacheFile, "utf-8"));
      console.log(`Loaded cached workbook (${dataset.names.length} names) from ${cacheFile}`);
    }
  } catch (err) {
    console.error("Failed to load cached dataset:", err.message);
  }
}
loadCachedDataset();

app.post("/api/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  try {
    const parsed = await parseWorkbook(req.file.path);
    dataset = parsed;
    fs.writeFile(cacheFile, JSON.stringify(parsed), (err) => {
      if (err) console.error("Failed to persist dataset cache:", err.message);
    });
    res.json({ count: parsed.names.length, names: parsed.names });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to parse workbook: " + err.message });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

app.get("/api/names", (req, res) => {
  if (!dataset) return res.status(404).json({ error: "No workbook uploaded yet" });
  res.json({ names: dataset.names });
});

app.get("/api/person/:key", (req, res) => {
  if (!dataset) return res.status(404).json({ error: "No workbook uploaded yet" });
  const key = normalizeNameKey(req.params.key);
  const mdpl = dataset.mdpl.byName[key];
  const mepl = dataset.mepl.byName[key];
  if (!mdpl && !mepl) return res.status(404).json({ error: "Person not found" });
  res.json({ key, mdpl, mepl });
});

app.get("/api/pdf/:key", async (req, res) => {
  if (!dataset) return res.status(404).json({ error: "No workbook uploaded yet" });
  const key = normalizeNameKey(req.params.key);
  try {
    const pdfBuffer = await generatePersonPdf({ personKey: key, mdpl: dataset.mdpl, mepl: dataset.mepl });
    const person = dataset.mdpl.byName[key] || dataset.mepl.byName[key];
    const safeName = (person?.displayName || "target").replace(/[^a-z0-9]+/gi, "_");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}_Sales_Target.pdf"`);
    res.send(Buffer.from(pdfBuffer));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate PDF: " + err.message });
  }
});

app.post("/api/generate", async (req, res) => {
  if (!dataset) return res.status(404).json({ error: "No workbook uploaded yet" });
  const keys = Array.isArray(req.body?.keys) ? req.body.keys : [];
  if (keys.length === 0) return res.status(400).json({ error: "No names provided" });

  const results = [];
  const errors = [];

  for (const rawKey of keys) {
    const key = normalizeNameKey(rawKey);
    const person = dataset.mdpl.byName[key] || dataset.mepl.byName[key];
    if (!person) {
      errors.push({ key: rawKey, error: "Person not found" });
      continue;
    }
    try {
      const pdfBuffer = await generatePersonPdf({ personKey: key, mdpl: dataset.mdpl, mepl: dataset.mepl });
      const id = crypto.randomUUID();
      const safeName = person.displayName.replace(/[^a-z0-9]+/gi, "_");
      const fileName = `${safeName}_Sales_Target.pdf`;
      const filePath = path.join(generatedDir, `${id}.pdf`);
      fs.writeFileSync(filePath, Buffer.from(pdfBuffer));

      const doc = { id, key, displayName: person.displayName, fileName, filePath, createdAt: Date.now() };
      generatedDocs.set(id, doc);
      results.push({ id, key, displayName: person.displayName, fileName, viewUrl: `/api/generated/${id}`, downloadUrl: `/api/generated/${id}?download=1` });
    } catch (err) {
      console.error(`Failed to generate PDF for ${rawKey}:`, err.message);
      errors.push({ key: rawKey, error: err.message });
    }
  }

  res.json({ generated: results, errors });
});

app.get("/api/generated/:id", (req, res) => {
  const doc = generatedDocs.get(req.params.id);
  if (!doc || !fs.existsSync(doc.filePath)) return res.status(404).json({ error: "Document not found" });
  const disposition = req.query.download ? "attachment" : "inline";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${disposition}; filename="${doc.fileName}"`);
  fs.createReadStream(doc.filePath).pipe(res);
});

app.get("/api/generated", (req, res) => {
  res.json({
    generated: [...generatedDocs.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((d) => ({ id: d.id, key: d.key, displayName: d.displayName, fileName: d.fileName, viewUrl: `/api/generated/${d.id}`, downloadUrl: `/api/generated/${d.id}?download=1` })),
  });
});

app.post("/api/pdf/bulk", async (req, res) => {
  if (!dataset) return res.status(404).json({ error: "No workbook uploaded yet" });
  const keys = Array.isArray(req.body?.keys) ? req.body.keys : [];
  if (keys.length === 0) return res.status(400).json({ error: "No names provided" });

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="Sales_Target_Letters.zip"`);

  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.on("error", (err) => {
    console.error("Archive error:", err);
    res.status(500).end();
  });
  archive.pipe(res);

  const usedNames = new Set();
  for (const rawKey of keys) {
    const key = normalizeNameKey(rawKey);
    const person = dataset.mdpl.byName[key] || dataset.mepl.byName[key];
    if (!person) continue;
    try {
      const pdfBuffer = await generatePersonPdf({ personKey: key, mdpl: dataset.mdpl, mepl: dataset.mepl });
      let safeName = person.displayName.replace(/[^a-z0-9]+/gi, "_");
      if (usedNames.has(safeName)) safeName += `_${key.length}`;
      usedNames.add(safeName);
      archive.append(Buffer.from(pdfBuffer), { name: `${safeName}_Sales_Target.pdf` });
    } catch (err) {
      console.error(`Failed to generate PDF for ${rawKey}:`, err.message);
    }
  }

  await archive.finalize();
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
