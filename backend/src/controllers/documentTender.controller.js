'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const AdmZip = require('adm-zip');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { execFile } = require('child_process');
const db = require('../config/db');
const { callOllama, parseJsonResponse } = require('../utils/ollama');
const { callClaudeCLI } = require('../utils/claudeCLI');

const STAGING_DIR = path.join(__dirname, '../../uploads/document-tender-staging');
const TENDER_DOC_DIR = path.join(__dirname, '../../uploads/tender-documents');
fs.mkdirSync(STAGING_DIR, { recursive: true });

// A scanned multi-page document can take several minutes to OCR — far
// longer than IIS's reverse-proxy will hold a request open (a held-open
// connection that gets killed mid-response shows up in the browser as a
// misleading CORS error, not a timeout). So this runs as a background job:
// the POST returns immediately with a job id, and the frontend polls
// GET /document-tender/:jobId for status.
const ensureJobsTable = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS document_tender_jobs (
      id          VARCHAR(64) PRIMARY KEY,
      status      ENUM('processing','done','error') DEFAULT 'processing',
      progress    TEXT,
      result      JSON,
      error       TEXT,
      created_by  INT NULL,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};
ensureJobsTable().catch(err => console.error('[document-tender] jobs table init failed:', err));

async function setJobProgress(jobId, progress) {
  await db.query('UPDATE document_tender_jobs SET progress = ? WHERE id = ?', [progress, jobId]).catch(() => {});
}

/* ─── OCR fallback for scanned PDFs — same mechanism docPrep.controller.js
   uses (render each page to an image, have Claude read it), but with a
   full-transcription prompt instead of docPrep's targeted "documents to
   submit" extraction, since Document Tender needs every field (dates,
   values, org names, eligibility, etc.) which can appear on any page. ──── */
const RENDER_SCRIPT_PATH = path.join(__dirname, '..', '..', 'scripts', 'render_pdf_pages.py');
const PAGE_OCR_CONCURRENCY = 5;
const MIN_CHARS_PER_PAGE = 150; // below this, treat the PDF as scanned — same threshold docPrep uses

function renderPdfPages(filePath, outDir) {
  return new Promise((resolve, reject) => {
    execFile(
      'python',
      [RENDER_SCRIPT_PATH, filePath, outDir],
      { maxBuffer: 20 * 1024 * 1024, timeout: 5 * 60 * 1000 },
      (err, stdout) => {
        if (err) return reject(new Error(`Page rendering failed: ${err.message}`));
        resolve(stdout.trim().split('\n').map(l => l.trim()).filter(Boolean));
      }
    );
  });
}

const PAGE_TRANSCRIBE_PROMPT = (imagePath) =>
  `Transcribe ALL visible text on this tender/bid document page (image at ${imagePath}) exactly as written — ` +
  `headings, paragraphs, tables (row by row), dates, amounts, names, everything. Preserve the original ` +
  `structure and order. Do not summarize, skip, or omit anything, including boilerplate/terms & conditions — ` +
  `every page's content matters for this. If the page is blank or unreadable, respond with EXACTLY: BLANK\n\n` +
  `Output ONLY the transcribed text (or BLANK), nothing else — no preamble, no explanation, no markdown fences.`;

async function transcribePage(imagePath) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await callClaudeCLI(PAGE_TRANSCRIBE_PROMPT(imagePath));
    } catch (e) {
      if (attempt >= 2) throw e;
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

async function ocrPdfFull(filePath, onProgress) {
  const outDir = filePath.replace(/\.[^.]+$/, '') + '_ocr_pages';
  let imagePaths;
  try {
    imagePaths = await renderPdfPages(filePath, outDir);
  } catch (e) {
    throw new Error(`OCR failed: ${e.message}`);
  }
  if (!imagePaths.length) throw new Error('OCR failed: no pages rendered');

  const total = imagePaths.length;
  const results = new Array(total);
  let done = 0;
  let cursor = 0;
  const nextIdx = () => (cursor < total ? cursor++ : -1);

  async function worker() {
    for (let i = nextIdx(); i !== -1; i = nextIdx()) {
      try {
        const text = (await transcribePage(imagePaths[i])).trim();
        results[i] = (text && text.toUpperCase() !== 'BLANK') ? `\n\n[Page ${i + 1}]\n${text}` : '';
      } catch (e) {
        results[i] = `\n\n[Page ${i + 1} transcription failed: ${e.message}]`;
      }
      done++;
      if (onProgress) onProgress(`OCR: transcribed ${done}/${total} page(s)…`);
    }
  }

  const workerCount = Math.min(PAGE_OCR_CONCURRENCY, total);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  try { fs.rmSync(outDir, { recursive: true, force: true }); } catch { /* best effort */ }

  return results.filter(Boolean).join('\n');
}

/* ─── Multer — files land in a per-request staging folder; a .zip among them
   is extracted (flattened) alongside the rest, same convention as
   library.controller.js's zip-upload handling. ─────────────────────────── */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!req._stagingId) req._stagingId = crypto.randomBytes(8).toString('hex');
    const dir = path.join(STAGING_DIR, req._stagingId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9_\-. ]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});
exports.uploadMiddleware = multer({
  storage,
  limits: { fileSize: 150 * 1024 * 1024 },
}).array('files', 30);

const TEXT_EXTRACTABLE_EXT = new Set(['.pdf', '.docx', '.doc', '.txt', '.csv']);

// Ollama's extracted values are free text and can run well past the target
// varchar column's length (seen live: item_category alone blew past
// varchar(255)) — truncate defensively rather than let the INSERT 500.
const trunc = (v, max) => (v ? String(v).slice(0, max) : v);

/**
 * Best-effort conversion of an AI-extracted "as printed" date/time string
 * (wildly inconsistent — dots, dashes or slashes, "@" instead of a space,
 * unpadded hours, "P.M" vs "PM"…) into the exact "DD-MM-YYYY h:mm AM/PM"
 * string gem_tenders.start_date/end_date are stored as everywhere else in
 * the app — that's the literal format
 * STR_TO_DATE(REPLACE(end_date,'/','-'), '%d-%m-%Y %h:%i %p') expects, and
 * what every date-based filter, sort, and dashboard countdown relies on.
 * Leaving these NULL (the previous behaviour) silently hid every
 * document-uploaded tender from anything date-scoped — the "Active
 * Tenders" list/dashboard, closing-soon sort, etc. Returns null rather than
 * guess wrong on an unrecognized format: a blank date is honest, a wrong
 * one would silently corrupt every feature that reads it.
 */
function parseExtractedDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const m = s.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4}).*?(\d{1,2})[.:](\d{2})\s*([AaPp]\.?[Mm]\.?)/);
  if (!m) return null;
  let [, d, mo, y, h, mi, ap] = m;
  if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31) return null;
  d = d.padStart(2, '0');
  mo = mo.padStart(2, '0');
  h = String(parseInt(h, 10));
  ap = ap.replace(/\./g, '').toUpperCase();
  return `${d}-${mo}-${y} ${h}:${mi} ${ap}`;
}

const SOFFICE_PATH = 'C:\\Program Files\\LibreOffice\\program\\soffice.exe';

function convertDocToText(filePath) {
  return new Promise((resolve) => {
    const outDir = path.dirname(filePath) + '_doc_convert_' + Date.now();
    fs.mkdirSync(outDir, { recursive: true });
    execFile(
      SOFFICE_PATH,
      ['--headless', '--convert-to', 'txt:Text', '--outdir', outDir, filePath],
      { timeout: 60 * 1000 },
      (err) => {
        try {
          const base = path.basename(filePath, path.extname(filePath));
          const txtPath = path.join(outDir, `${base}.txt`);
          const text = fs.existsSync(txtPath) ? fs.readFileSync(txtPath, 'utf8') : '';
          if (err && !text) console.warn('[document-tender] .doc conversion failed for', filePath, err.message);
          resolve(text);
        } catch (e) {
          console.warn('[document-tender] .doc conversion read failed for', filePath, e.message);
          resolve('');
        } finally {
          try { fs.rmSync(outDir, { recursive: true, force: true }); } catch { /* best effort */ }
        }
      }
    );
  });
}

// Exported for reuse by other upload-and-extract flows (e.g. Suggested
// Products' "upload any document" — see tenders.controller.js) so PDF/DOCX/
// DOC text extraction and the scanned-PDF OCR fallback live in exactly one
// place rather than being re-implemented per feature.
exports.extractFileText = extractFileText;
async function extractFileText(filePath, onProgress = null) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    if (!fs.existsSync(filePath)) return '';
    if (ext === '.pdf') {
      const data = await pdfParse(fs.readFileSync(filePath));
      const text = (data.text || '').trim();
      const charsPerPage = text.length / (data.numpages || 1);

      // Same signal docPrep uses: a genuinely text-based page runs several
      // hundred+ chars; a scanned page's "text" is at most a stray stamp/
      // watermark, roughly constant per page regardless of page count.
      if (text.length >= 30 && charsPerPage >= MIN_CHARS_PER_PAGE) return text;

      console.log(`[document-tender] ${path.basename(filePath)} — ${data.numpages} page(s), `
        + `${text.length} char(s) (${charsPerPage.toFixed(1)}/page) — falling back to OCR`);
      if (onProgress) onProgress(`${path.basename(filePath)} has no real text layer (scanned) — running OCR…`);
      return await ocrPdfFull(filePath, onProgress);
    }
    if (ext === '.docx') {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value || '';
    }
    if (ext === '.doc') {
      // Legacy binary Word format — mammoth only reads .docx (OOXML), so this was
      // silently falling through to '' and producing a blank extraction for every
      // .doc upload despite '.doc' being listed as a supported extension. LibreOffice
      // (already installed on this box) converts it to plain text instead.
      return await convertDocToText(filePath);
    }
    if (ext === '.txt' || ext === '.csv') {
      return fs.readFileSync(filePath, 'utf8');
    }
    return '';
  } catch (e) {
    console.warn('[document-tender] extractFileText failed for', filePath, e.message);
    return '';
  }
}

const EXTRACTION_SYSTEM_PROMPT = `You are analyzing scanned/uploaded Indian government tender documents (bid document, BOQ, ATC, or similar) to populate a tender-management system. Read the combined document text and extract structured data. Respond with ONLY a single JSON object, no markdown fences, no commentary, matching exactly this shape (use "" for any field you cannot find, never omit a key):

{
  "tender_ref": "the tender/bid reference number as printed in the document (e.g. GEM/2026/B/1234567 or a NIT/tender number) — empty string if genuinely absent",
  "title": "short descriptive title of what is being procured",
  "organisation_name": "",
  "department_org": "the department or ministry name",
  "office_name": "",
  "state": "Indian state the buyer/consignee is in, if determinable",
  "closing_date": "bid submission end date/time, as printed",
  "opening_date": "bid opening date/time, as printed",
  "offer_validity": "bid offer validity period, as printed",
  "estimated_value": "estimated tender/bid value, as printed (with currency if shown)",
  "emd_amount": "EMD amount, as printed — \\"0\\" or \\"NIL\\" if EMD is explicitly exempted",
  "item_category": "comma-separated list of item categories / products being procured",
  "document_required": "brief comma-separated list of documents/certificates bidders must submit",
  "evaluation_method": "",
  "eligibility_summary": "2-4 sentence summary of key eligibility criteria",
  "source": "\\"gem\\" if this looks like a GeM (Government e-Marketplace) portal bid, \\"open\\" if it looks like a general/open e-procurement tender (CPPP, state portal, NIT, etc.) — your best guess",
  "division": "\\"Endo\\" if this tender is for endoscopy/surgical/laparoscopic devices, \\"Diagno\\" if for diagnostic/IVD/pathology devices, \\"both\\" if it spans both, \\"unknown\\" if you can't tell from the content"
}`;

/**
 * POST /api/tenders/document-tender
 * Multipart: files[] (one or more; a .zip among them is extracted), plus
 * optional body fields `source` ('gem'|'open') and `division`
 * ('Endo'|'Diagno'|'both') — when omitted, Ollama's best guess from the
 * document content is used instead.
 *
 * Returns { jobId } immediately — the real work (text/OCR extraction,
 * Ollama, the DB insert) runs in the background and can take several
 * minutes for a scanned multi-page document, far longer than a request can
 * safely stay open through the IIS reverse proxy. Poll
 * GET /document-tender/:jobId for status.
 */
exports.createDocumentTender = async (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ success: false, message: 'No files uploaded' });

  await ensureJobsTable();
  const jobId = crypto.randomBytes(12).toString('hex');
  await db.query(
    'INSERT INTO document_tender_jobs (id, status, progress, created_by) VALUES (?, ?, ?, ?)',
    [jobId, 'processing', 'Starting…', req.user?.id || null]
  );

  res.status(202).json({ success: true, jobId });

  const userSource = (req.body.source || '').trim().toLowerCase();
  const userDivision = (req.body.division || '').trim();
  const userTenderRef = (req.body.tenderRef || '').trim();
  processDocumentTenderJob(jobId, files, userSource, userDivision, userTenderRef).catch(async (err) => {
    console.error('[document-tender] background job failed:', err);
    await db.query(
      'UPDATE document_tender_jobs SET status = ?, error = ? WHERE id = ?',
      ['error', err.message || 'Failed to create tender from documents', jobId]
    ).catch(() => {});
  });
};

/**
 * GET /api/tenders/document-tender/:jobId
 */
exports.getDocumentTenderJob = async (req, res) => {
  try {
    await ensureJobsTable();
    const [[row]] = await db.query('SELECT * FROM document_tender_jobs WHERE id = ?', [req.params.jobId]);
    if (!row) return res.status(404).json({ success: false, message: 'Job not found' });
    res.json({
      success: true,
      status: row.status,
      progress: row.progress,
      result: row.result,
      error: row.error,
    });
  } catch (err) {
    console.error('[document-tender] getDocumentTenderJob:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

async function processDocumentTenderJob(jobId, files, userSource, userDivision, userTenderRef) {
  const stagingDir = path.dirname(files[0].path);

  try {
    // ── Expand any .zip among the uploads, flattened into the same staging dir ──
    let allFiles = [...files.map(f => ({ path: f.path, name: f.originalname }))];
    for (const f of files) {
      if (path.extname(f.originalname).toLowerCase() === '.zip') {
        try {
          const zip = new AdmZip(f.path);
          const entries = zip.getEntries().filter(e => !e.isDirectory);
          for (const entry of entries) {
            const entryName = path.basename(entry.entryName);
            if (!entryName) continue;
            const safe = entryName.replace(/[^a-zA-Z0-9_\-.]/g, '_');
            const outPath = path.join(stagingDir, `${Date.now()}-${Math.random().toString(36).slice(2)}-${safe}`);
            fs.writeFileSync(outPath, entry.getData());
            allFiles.push({ path: outPath, name: entryName });
          }
          allFiles = allFiles.filter(af => af.path !== f.path);
          try { fs.unlinkSync(f.path); } catch { /* best effort */ }
        } catch (e) {
          console.warn('[document-tender] zip extraction failed:', e.message);
        }
      }
    }

    if (!allFiles.length) {
      throw new Error('No usable files found (the ZIP may be empty or corrupt)');
    }

    // ── Extract text from every document, concatenated for Ollama ──────────
    // One at a time (not Promise.all) — each PDF needing OCR already fans
    // out several concurrent Claude CLI page-reads on its own; doing that
    // for multiple files at once risks starving the machine.
    const texts = [];
    for (const f of allFiles) {
      const t = await extractFileText(f.path, (msg) => setJobProgress(jobId, `${f.name}: ${msg}`));
      texts.push(t ? `\n\n===== ${f.name} =====\n${t}` : '');
    }
    const combinedText = texts.join('').slice(0, 260000).trim();

    await setJobProgress(jobId, 'Extracting tender details…');
    let extracted = {};
    if (combinedText) {
      try {
        const raw = await callOllama(EXTRACTION_SYSTEM_PROMPT, combinedText, 0.05, 4000);
        extracted = parseJsonResponse(raw);
      } catch (e) {
        console.warn('[document-tender] Ollama extraction failed, continuing with blank fields:', e.message);
      }
    }

    const finalSource = (userSource === 'gem' || userSource === 'open')
      ? userSource
      : (extracted.source === 'gem' || extracted.source === 'open') ? extracted.source : 'open';

    const finalDivision = ['Endo', 'Diagno', 'both'].includes(userDivision)
      ? userDivision
      : ['Endo', 'Diagno', 'both'].includes(extracted.division) ? extracted.division : 'unknown';
    const deptValue = finalDivision.toLowerCase();

    // ── Move every file into its permanent home under this tender's own ID ──
    const rawRef = userTenderRef || (extracted.tender_ref || '').trim();
    const timestamp = Date.now();

    let bidNumber, tenderId, safeFolder;
    if (finalSource === 'gem') {
      bidNumber = rawRef || `MANUAL/${timestamp}`;
      safeFolder = bidNumber.replace(/[^a-zA-Z0-9_\-]/g, '_');
    } else {
      tenderId = (rawRef || `MANUAL_${timestamp}`).replace(/\//g, '_').replace(/[^a-zA-Z0-9_\-]/g, '_');
      safeFolder = tenderId;
    }

    const destDir = path.join(TENDER_DOC_DIR, safeFolder);
    fs.mkdirSync(destDir, { recursive: true });
    const movedFiles = allFiles.map((f) => {
      const ext = path.extname(f.name) || '';
      const destPath = path.join(destDir, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
      fs.copyFileSync(f.path, destPath);
      return { name: f.name, path: destPath };
    });
    try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch { /* best effort */ }

    const apiBase = process.env.API_BASE_URL || 'https://api.openprocure.ai/api';
    let jobResult;

    if (finalSource === 'gem') {
      const links = movedFiles.map(f => ({
        uri: `${apiBase}/tenders/download?path=${encodeURIComponent(f.path)}`,
        text: f.name,
        label: 'Document',
      }));

      const tableRows = [
        ['Organisation Name', extracted.organisation_name || ''],
        ['Office Name', extracted.office_name || ''],
        ['Department Name Or Ministry Name', extracted.department_org || ''],
        ['Bid End Date/Time', extracted.closing_date || ''],
        ['Bid Opening Date/Time', extracted.opening_date || ''],
        ['Bid Offer Validity (From End Date)', extracted.offer_validity || ''],
        ['Estimated Bid Value', extracted.estimated_value || ''],
        ['EMD Amount', extracted.emd_amount || ''],
        ['Item Category', extracted.item_category || ''],
        ['Document required from seller', extracted.document_required || ''],
        ['Evaluation Method', extracted.evaluation_method || ''],
      ].filter(([, v]) => v);

      const jsonData = {
        pages: [{ tables: [tableRows] }],
        links,
        eligibility_summary: extracted.eligibility_summary || '',
        source: 'document_tender',
      };

      await setJobProgress(jobId, 'Saving tender…');
      // Re-uploading/re-processing the same document (same bid number) is a
      // normal thing to do — refreshing the extraction, fixing a bad OCR
      // read, etc. — so this upserts instead of failing on the bid_number
      // unique key: ON DUPLICATE KEY UPDATE refreshes the existing row's
      // content in place rather than erroring the whole job out.
      // id = LAST_INSERT_ID(id) is the standard MySQL trick that makes
      // result.insertId report the EXISTING row's id on an update too, not 0.
      // perfect_cat = 1: an internal scraper artifact meaning "passed AI
      // relevancy classification" — a tender someone deliberately uploaded
      // and extracted has no such ambiguity, but leaving it at its default
      // (0) made these rows invisible from every normal listing/dashboard,
      // findable only by typing the exact bid number.
      const startDate = parseExtractedDate(extracted.opening_date);
      const endDate = parseExtractedDate(extracted.closing_date);

      const [result] = await db.query(
        `INSERT INTO gem_tenders (bid_number, items, department, dept, state, json_data, emd_amount, bid_value, start_date, end_date, perfect_cat, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())
         ON DUPLICATE KEY UPDATE
           items = VALUES(items),
           department = VALUES(department),
           dept = VALUES(dept),
           state = VALUES(state),
           json_data = VALUES(json_data),
           emd_amount = VALUES(emd_amount),
           bid_value = VALUES(bid_value),
           start_date = VALUES(start_date),
           end_date = VALUES(end_date),
           perfect_cat = 1,
           updated_at = NOW(),
           id = LAST_INSERT_ID(id)`,
        [
          trunc(bidNumber, 100),
          // items is what every list/detail view actually reads as the tender's title
          // for GeM rows — leaving it blank is what made earlier document-tender rows
          // show up empty everywhere despite Ollama having extracted a real title.
          extracted.title || extracted.item_category || bidNumber, // TEXT column — no length cap
          extracted.department_org || extracted.organisation_name || '', // TEXT column — no length cap
          deptValue,
          trunc(extracted.state, 100) || '',
          JSON.stringify(jsonData),
          trunc(extracted.emd_amount, 50) || '',
          trunc(extracted.estimated_value, 50) || '',
          startDate,
          endDate,
        ]
      );

      jobResult = {
        success: true, source: 'gem', bid_number: bidNumber, id: result.insertId,
        redirect: `/tenders/tenderdetails/${encodeURIComponent(bidNumber)}`,
      };
    } else {
      // ── Open tender ──────────────────────────────────────────────────────
      const downloadedDocuments = movedFiles.map(f => ({ type: 'Document', file_name: f.name, local_path: f.path }));
      const tenderDetailsBlob = {
        eligibility_summary: extracted.eligibility_summary || '',
        document_required: extracted.document_required || '',
        evaluation_method: extracted.evaluation_method || '',
        offer_validity: extracted.offer_validity || '',
        source: 'document_tender',
      };

      await setJobProgress(jobId, 'Saving tender…');
      // Same upsert reasoning as the GeM branch above — tender_refno is the
      // table's unique key here, so a re-upload with the same extracted ref
      // refreshes that row instead of erroring as a duplicate. A blank ref
      // is stored as NULL (below), which MySQL never treats as a duplicate
      // of another NULL, so this only kicks in for a genuine repeat ref.
      // relevency_checker defaults to NULL, which getTenders' Open-tender
      // listing explicitly excludes (only 'proceed_futher'/'files_downloaded'/
      // 'yes' show) — same invisibility bug as gem_tenders.perfect_cat above,
      // just a different gating column for this table. A manually uploaded
      // tender is unambiguously relevant, so mark it 'yes' outright.
      const [result] = await db.query(
        `INSERT INTO open_tender_details
          (tender_id, tender_title, tender_refno, organisation_name, state, closing_date, opening_date,
           emd_amount, tender_value, product_category, dept, tender_details, downloaded_documents, relevency_checker, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'yes', NOW(), NOW())
         ON DUPLICATE KEY UPDATE
           tender_id = VALUES(tender_id),
           tender_title = VALUES(tender_title),
           organisation_name = VALUES(organisation_name),
           state = VALUES(state),
           closing_date = VALUES(closing_date),
           opening_date = VALUES(opening_date),
           emd_amount = VALUES(emd_amount),
           tender_value = VALUES(tender_value),
           product_category = VALUES(product_category),
           dept = VALUES(dept),
           tender_details = VALUES(tender_details),
           downloaded_documents = VALUES(downloaded_documents),
           relevency_checker = 'yes',
           updated_at = NOW(),
           row_id = LAST_INSERT_ID(row_id)`,
        [
          trunc(tenderId, 100),
          extracted.title || extracted.organisation_name || tenderId, // TEXT column — no length cap
          // tender_refno is UNIQUE and nullable — an empty string from a
          // document with no discernible reference would collide with any
          // other row that also came up blank, so use NULL instead.
          trunc(rawRef, 255) || null,
          trunc(extracted.organisation_name, 255) || '',
          trunc(extracted.state, 255) || '',
          trunc(extracted.closing_date, 100) || '',
          trunc(extracted.opening_date, 100) || '',
          trunc(extracted.emd_amount, 50) || '',
          trunc(extracted.estimated_value, 50) || '',
          trunc(extracted.item_category, 255) || '',
          deptValue,
          JSON.stringify(tenderDetailsBlob),
          JSON.stringify(downloadedDocuments),
        ]
      );

      jobResult = {
        success: true, source: 'open', tender_id: tenderId, id: result.row_id || result.insertId,
        redirect: `/tenders/tenderdetails/${encodeURIComponent(tenderId)}`,
      };
    }

    await db.query(
      'UPDATE document_tender_jobs SET status = ?, result = ?, progress = ? WHERE id = ?',
      ['done', JSON.stringify(jobResult), 'Done', jobId]
    );
  } catch (err) {
    try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch { /* best effort */ }
    throw err;
  }
}
