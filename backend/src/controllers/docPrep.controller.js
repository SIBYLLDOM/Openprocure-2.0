'use strict';
const db        = require('../config/db');
const fs        = require('fs');
const path      = require('path');
const multer    = require('multer');
const pdfParse  = require('pdf-parse');
const { execFile } = require('child_process');
const { callClaudeCLI } = require('../utils/claudeCLI');
const { callOllama }    = require('../utils/ollama');
const { getTenderDept } = require('../utils/tenderDept');
const { marked }        = require('marked');
const { convertToPdf, isAlreadyPdf, isConvertible } = require('../utils/officeConvert');
const { sendMail } = require('../utils/mailer');

// Extensions that arrive as Word/Excel/PowerPoint and get their displayed
// `name` swapped to a .pdf extension once converted at upload — deliberately
// narrower than officeConvert's full CONVERTIBLE_EXTS (which also covers
// images) since a photo's name shouldn't be relabeled just because it also
// gets wrapped into a PDF for consistent viewing.
const CONVERT_SOURCE_EXTS = new Set(['.doc', '.docx', '.odt', '.rtf', '.xls', '.xlsx', '.ods', '.csv', '.ppt', '.pptx', '.odp']);

// Overridable, and falls back to a local model when the cloud quota is spent.
const GEMMA_MODEL = process.env.OLLAMA_VISION_MODEL || 'gemma4:31b-cloud';

/* ─── callClaude: thin wrapper around the existing claudeCLI utility ─────────
   claudeCLI.js already resolves the correct exe path on Windows (.cmd / .exe)
   and uses stdin for the prompt, so there are no command-line length limits.

   Retries on failure — seen in production: a big annexure-discovery call
   died with "Claude CLI exited with code 1" and empty stderr right after
   114 back-to-back per-page CLI calls in the same run, but the exact same
   call succeeded immediately on manual retry (not a size or rate-limit
   issue either — both were ruled out directly). Whatever it was, transient
   one-off CLI hiccups shouldn't force a full manual re-run of a multi-
   minute analysis, so give it 2 retries with a short backoff first.
*/
async function callClaude(prompt, attempts = 4, timeoutMs = 180000) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await callClaudeCLI(prompt, timeoutMs);
    } catch (e) {
      if (attempt >= attempts) throw e;
      console.warn(`[doc-prep] callClaude attempt ${attempt}/${attempts} failed: ${e.message} — retrying...`);
      await new Promise(r => setTimeout(r, 5000 * attempt));
    }
  }
}

function parseJsonResponse(raw) {
  let cleaned = raw.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const arr = cleaned.match(/\[[\s\S]*\]/);
  if (arr) try { return JSON.parse(arr[0]); } catch { /* fall through */ }
  const obj = cleaned.match(/\{[\s\S]*\}/);
  if (obj) try { return JSON.parse(obj[0]); } catch { /* fall through */ }
  throw new Error('No JSON found in Claude response');
}

const COMPANY_PATH       = path.join(__dirname, '../asset/meril_company.json');
// Meril Diagnostics (COMPANY_PATH) and Meril Endo Surgery are separate legal
// entities with their own GSTIN/PAN/CIN/bank details — a tender's division
// (getTenderDept) decides which one signs its annexures/letters.
const ENDO_COMPANY_PATH  = path.join(__dirname, '../asset/meril_endo_company.json');
function getCompanyProfile(division) {
  const p = division === 'Endo' ? ENDO_COMPANY_PATH : COMPANY_PATH;
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}
const DOC_PREP_DIR       = path.join(__dirname, '../../uploads/doc-prep');
const LOGO_PATH          = path.join(__dirname, '../../../Frontend/src/assets/img/diagno-letterhead-logo.png');
const LETTERHEAD_DOCX_PATH      = path.join(__dirname, '../../../Frontend/public/letterhead.docx');
// Endo letterhead — assets extracted from the canonical endo_letterhead_generator.html
// design (also used on-screen by MerilLetterhead.jsx). Unlike Diagno, Endo PDF/DOCX
// generation builds its own header/footer from these pieces rather than cloning a .docx
// template — see buildEndoDocxFromLetterhead / buildEndoHeaderTemplateHtml /
// buildEndoFooterTemplateHtml below. Keep in sync if that source file changes.
const ENDO_HEADER_LOGO_PATH = path.join(__dirname, '../../../Frontend/src/assets/img/endo-letterhead-logo.png');
const ENDO_FOOTER_BAND_PATH = path.join(__dirname, '../../../Frontend/src/assets/img/endo-letterhead-footer.png');
const ENDO_SIGNATURE_PATH   = path.join(__dirname, '../../../Frontend/src/assets/img/endo-letterhead-signature.png');
const ENDO_SIGNATORY_NAME   = 'Gelivi Kiran Kumar';
const ENDO_SIGNATORY_TITLE  = 'Additional General Manager - Tender Business';

/* ─── DB bootstrap ───────────────────────────────────────────────────────── */
const ensureTable = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS doc_prep_sessions (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      bid_no           VARCHAR(255) NOT NULL,
      bid_doc_path     VARCHAR(1000) DEFAULT NULL,
      status           ENUM('idle','processing','done','error') DEFAULT 'idle',
      annexures        JSON,
      formats          JSON,
      filled_templates JSON,
      processing_log   TEXT,
      created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_bid_no (bid_no)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  try {
    await db.query('ALTER TABLE doc_prep_sessions ADD COLUMN additional_docs JSON NULL');
  } catch (e) { if (!e.message.includes('Duplicate column')) throw e; }
  try {
    await db.query('ALTER TABLE doc_prep_sessions ADD COLUMN extracted_files JSON NULL');
  } catch (e) { if (!e.message.includes('Duplicate column')) throw e; }
  try {
    await db.query('ALTER TABLE doc_prep_sessions ADD COLUMN detected_docs JSON NULL');
  } catch (e) { if (!e.message.includes('Duplicate column')) throw e; }
  try {
    await db.query('ALTER TABLE doc_prep_sessions ADD COLUMN gem_detected_at TIMESTAMP NULL DEFAULT NULL');
  } catch (e) { if (!e.message.includes('Duplicate column')) throw e; }
  try {
    await db.query('ALTER TABLE doc_prep_sessions ADD COLUMN uploaded_docs JSON NULL');
  } catch (e) { if (!e.message.includes('Duplicate column')) throw e; }
  try {
    await db.query('ALTER TABLE doc_prep_sessions ADD COLUMN drive_matches JSON NULL');
  } catch (e) { if (!e.message.includes('Duplicate column')) throw e; }
  try {
    await db.query('ALTER TABLE doc_prep_sessions ADD COLUMN drive_matched_at TIMESTAMP NULL DEFAULT NULL');
  } catch (e) { if (!e.message.includes('Duplicate column')) throw e; }
  try {
    // Set on every "download all as zip" — the only real signal Active
    // Workspaces has for "documents were downloaded" in its progress bar.
    await db.query('ALTER TABLE doc_prep_sessions ADD COLUMN zip_downloaded_at TIMESTAMP NULL DEFAULT NULL');
  } catch (e) { if (!e.message.includes('Duplicate column')) throw e; }
  try {
    // The tender's checklist (e.g. RMSCL's Annexure-V "CHECK LIST") — rows
    // seeded from AI-discovered annexures and/or parsed from a checklist
    // document the user uploads, each auto-matched to a My Documents file
    // and auto-stamped with that file's page range once My Documents' order
    // is known (see recomputeChecklist below).
    await db.query('ALTER TABLE doc_prep_sessions ADD COLUMN checklist JSON NULL');
  } catch (e) { if (!e.message.includes('Duplicate column')) throw e; }
  // Extend status ENUM to include pending_selection (safe no-op if already present)
  try {
    await db.query(
      `ALTER TABLE doc_prep_sessions MODIFY COLUMN status
       ENUM('idle','processing','done','error','pending_selection') DEFAULT 'idle'`
    );
  } catch (e) { console.warn('[doc-prep] ENUM alter:', e.message); }
};
ensureTable().catch(err => console.error('[doc-prep] table init failed:', err));

// Remembers every field value a user has typed/confirmed for an annexure,
// scoped per department (Diagno vs Endo have different signatories, banks,
// etc.) — so the next tender in the same department comes pre-filled.
const ensureFieldMemoryTable = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS doc_prep_field_memory (
      id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      department   VARCHAR(16) NOT NULL,
      field_key    VARCHAR(128) NOT NULL,
      field_value  TEXT,
      updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_dept_field (department, field_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};
ensureFieldMemoryTable().catch(err => console.error('[doc-prep] field memory table init failed:', err));

/* ─── Multer ─────────────────────────────────────────────────────────────── */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const safe = (req.params.bidNo || 'unknown').replace(/[^a-zA-Z0-9_\-]/g, '_');
    const dir  = path.join(__dirname, '../../uploads/doc-prep', safe);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
});
exports.uploadMiddleware = upload.single('file');

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function parseCol(v) {
  if (!v) return null;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
  return v;
}

// OCR fallback for scanned PDFs (no text layer) — government NIT/tender PDFs
// are frequently scans, not digitally authored (see 2026_SMSMC_571079_1: 42
// pages, 41 chars from pdf-parse; 2026_RMSCL_548079_1: 114 pages where the
// only "text" was a repeated eSign/DSC watermark stamp, not real content).
//
// Uses Claude (via the same CLI wrapper the rest of doc-prep already uses)
// to read each rendered page image directly, rather than Tesseract — Claude
// is far more reliable on messy scans, tables, non-English text, and
// correctly separates real content from watermark noise instead of
// transcribing it all as one undifferentiated blob (verified directly: a
// Hindi/English NIT page with a repeated eSign stamp came back as clean
// structured text with the watermark clearly set apart, not mixed in).
// Slower and has real per-page cost, so it's still only used when the text
// layer is empty/near-empty, and pages are read with limited concurrency
// (PAGE_OCR_CONCURRENCY) rather than one Claude CLI process per page serially.
const RENDER_SCRIPT_PATH = path.join(__dirname, '..', '..', 'scripts', 'render_pdf_pages.py');
const PAGE_OCR_CONCURRENCY = 5;

// maxPages/startPage/endPage/dpi/format all forward straight through to the
// script's own positional args (render_pdf_pages.py) — omit any of them to
// keep that arg's default (whole document, 200 DPI, PNG).
function renderPdfPages(filePath, outDir, maxPages, startPage, endPage, dpi, format) {
  const args = [RENDER_SCRIPT_PATH, filePath, outDir];
  if (maxPages !== undefined) args.push(String(maxPages));
  if (startPage !== undefined) args.push(String(startPage));
  if (endPage !== undefined) args.push(String(endPage));
  if (dpi !== undefined) args.push(String(dpi));
  if (format !== undefined) args.push(String(format));
  return new Promise((resolve, reject) => {
    execFile(
      'python',
      args,
      { maxBuffer: 20 * 1024 * 1024, timeout: 5 * 60 * 1000 },
      (err, stdout) => {
        if (err) return reject(new Error(`Page rendering failed: ${err.message}`));
        resolve(stdout.trim().split('\n').map(l => l.trim()).filter(Boolean));
      }
    );
  });
}

// Targeted, not verbatim: full-page transcription of every page (including
// the ~80% of a tender that's boilerplate T&C/price schedules/instructions)
// is what made the 114-page RMSCL document take 15-20 minutes for output
// nobody needed. The actual goal is narrower — what documents/certificates
// must a bidder submit to participate, and if the tender prescribes an exact
// format for one, what does that format say verbatim — so ask for exactly
// that per page instead of everything, and let irrelevant pages return
// almost nothing (fast to generate) instead of a full transcript (slow).
const PAGE_EXTRACT_PROMPT = (imagePath) =>
  `Look at this tender/bid document page (image at ${imagePath}) and extract ONLY:\n` +
  `1. Any list or mention of documents/certificates a bidder must submit to participate ` +
  `(e.g. turnover certificate, manufacturing license, ISO/quality certification, authorization ` +
  `letter, experience certificate, EMD, solvency certificate, PAN/GST, undertaking, declaration, etc.)\n` +
  `2. Any annexure/form/proforma that shows a PRESCRIBED FORMAT bidders must fill and submit — ` +
  `if found, transcribe that format VERBATIM (headings, blanks, numbering, signature lines, all of it).\n\n` +
  `If this page has NEITHER of the above — e.g. it's general terms & conditions, a price schedule, ` +
  `table of contents, generic instructions with no specific document list, boilerplate, or blank/` +
  `watermark-only — respond with EXACTLY: SKIP\n\n` +
  `Output ONLY the extracted content (or SKIP), nothing else — no preamble, no explanation.`;

async function extractRequirementsFromPage(imagePath) {
  return callClaude(PAGE_EXTRACT_PROMPT(imagePath), 2);
}

async function ocrPdf(filePath, onProgress) {
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
  let kept = 0;
  let cursor = 0;
  const nextIdx = () => (cursor < total ? cursor++ : -1);

  async function worker() {
    for (let i = nextIdx(); i !== -1; i = nextIdx()) {
      try {
        const text = (await extractRequirementsFromPage(imagePaths[i])).trim();
        if (text && text.toUpperCase() !== 'SKIP') {
          results[i] = `\n${'─'.repeat(60)}\n[Page ${i + 1}]\n${text}`;
          kept++;
        } else {
          results[i] = '';
        }
      } catch (e) {
        results[i] = `\n[page ${i + 1} extraction failed: ${e.message}]`;
      }
      done++;
      if (onProgress) {
        onProgress(`Scanning page ${done}/${total} for required documents/formats (${kept} relevant so far)…`);
      }
    }
  }

  const workerCount = Math.min(PAGE_OCR_CONCURRENCY, total);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  try { fs.rmSync(outDir, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }

  return results.filter(Boolean).join('\n');
}

async function extractDocText(filePath, maxChars = 80000, onProgress = null) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.docx' || ext === '.doc') {
    const mammoth = require('mammoth');
    const result  = await mammoth.extractRawText({ path: filePath });
    return result.value.slice(0, maxChars);
  }
  if (['.xlsx', '.xls', '.zip', '.rar', '.7z', '.tar', '.gz',
       '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tif', '.tiff'].includes(ext)) {
    return `[Uploaded file (${ext}) cannot be parsed as text. The file has been saved for reference.]`;
  }
  // PDF and other text-like types
  try {
    const buf  = fs.readFileSync(filePath);
    const data = await pdfParse(buf);
    const text = data.text.trim();

    // A raw length check alone isn't enough — a scanned PDF can still carry
    // a few thousand characters of pure noise (e.g. a repeated eSign/DSC
    // watermark stamped on every page) while having ZERO real page content.
    // Seen in production: 114 pages / 24MB / 4025 chars, all of it the same
    // "RajKaj Ref No... eSign DSC" stamp repeated — passed the >=30 check,
    // fed pure noise to the annexure-discovery prompt, and correctly found
    // 0 annexures because there was nothing real to find. Chars-per-page is
    // a much better signal: a genuinely text-based page runs several
    // hundred to thousand+ chars; a scanned page's "text" is just whatever
    // stamp/overlay happens to be selectable, which stays roughly constant
    // per page regardless of how many pages there are.
    const charsPerPage = text.length / (data.numpages || 1);
    if (text.length >= 30 && charsPerPage >= 150) return text.slice(0, maxChars);

    // Text layer is empty/near-empty (or noise-only) — this is very likely
    // a scanned PDF.
    console.log(`[doc-prep] extractDocText: ${path.basename(filePath)} — `
      + `${data.numpages} page(s), ${text.length} char(s) (${charsPerPage.toFixed(1)}/page) — falling back to OCR`);
    if (onProgress) onProgress('Bid document has no real text layer (scanned PDF) — running OCR…');
    const ocrText = await ocrPdf(filePath, onProgress);
    return ocrText.slice(0, maxChars);
  } catch (e) {
    return `[Could not extract text from file: ${e.message}]`;
  }
}

/**
 * The letterhead-merge (below) used to only splice <w:body> text across two
 * independently-generated docx packages and stop there — it never merged
 * word/_rels/document.xml.rels, word/numbering.xml, or referenced media, and
 * never touched [Content_Types].xml for anything but styles. Two packages
 * generated independently both number their relationships from rId1, so any
 * reference inside the spliced body content (a numbered/bulleted list, an
 * inline image, a hyperlink) either COLLIDED with one of letterhead.docx's
 * own rId1–rId12 (silently resolving to the wrong part — e.g. a numbering
 * reference pointing at the header's logo image) or pointed at an rId that
 * simply doesn't exist in the merged package at all.
 *
 * Modern Word and WPS both auto-repair a package like that on open, silently
 * dropping or reinterpreting the broken reference — which is why it "worked"
 * there. Word 2007's opener is far less forgiving of exactly this kind of
 * internal inconsistency and refuses to open the file outright. This merges
 * every relationship bodyContent actually uses (and, for numbering.xml, the
 * whole numbering definition — letterhead.docx has no numbering.xml of its
 * own, so there's nothing to collide with) into the output package under
 * fresh, guaranteed-unique IDs, rewriting bodyContent's references to match.
 *
 * Mutates outputZip in place. Returns bodyContent with rIds rewritten.
 */
function mergeContentPackageIntoLetterhead(outputZip, contentZip, bodyContent) {
  let contentRelsXml;
  try {
    contentRelsXml = contentZip.readAsText('word/_rels/document.xml.rels');
  } catch {
    return bodyContent; // content package has no external references at all
  }
  if (!contentRelsXml) return bodyContent;

  const contentRels = {};
  for (const m of contentRelsXml.matchAll(/<Relationship\s+Id="([^"]+)"\s+Type="([^"]+)"\s+Target="([^"]+)"(?:\s+TargetMode="([^"]+)")?\s*\/>/g)) {
    contentRels[m[1]] = { type: m[2], target: m[3], mode: m[4] };
  }

  // Only the rIds bodyContent (the part we're actually keeping) references —
  // content.xml's <w:sectPr> etc. were already stripped before this runs.
  const usedIds = new Set([...bodyContent.matchAll(/r:(?:id|embed)="([^"]+)"/g)].map(m => m[1]));

  // Numbering (lists) is the one relationship type that ISN'T referenced by
  // r:id inside the body at all — <w:numPr><w:numId w:val="1"/></w:numPr>
  // looks the definition up by VALUE against whatever numbering.xml is wired
  // in via a package-level relationship of that Type, not by id. So this has
  // to be detected and merged independently of the usedIds scan above, or a
  // bulleted/numbered list's numId always ends up dangling in the output.
  const needsNumbering = /<w:numId\b/.test(bodyContent);

  if (usedIds.size === 0 && !needsNumbering) return bodyContent;

  let outRelsXml;
  try {
    outRelsXml = outputZip.readAsText('word/_rels/document.xml.rels');
  } catch {
    return bodyContent; // shouldn't happen for a real letterhead.docx, but don't crash
  }
  const existingNumericIds = [...outRelsXml.matchAll(/Id="rId(\d+)"/g)].map(m => parseInt(m[1], 10));
  let nextId = (existingNumericIds.length ? Math.max(...existingNumericIds) : 0) + 1;

  const idMap = {};
  const newRelEntries = [];
  const newContentTypeOverrides = [];

  if (needsNumbering && contentZip.getEntry('word/numbering.xml')) {
    const numberingXml = contentZip.readAsText('word/numbering.xml');
    outputZip.addFile('word/numbering.xml', Buffer.from(numberingXml, 'utf-8'));
    newContentTypeOverrides.push(
      '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>'
    );
    newRelEntries.push(
      `<Relationship Id="rId${nextId++}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>`
    );
  }

  for (const oldId of usedIds) {
    const rel = contentRels[oldId];
    if (!rel || rel.target.endsWith('numbering.xml')) continue; // numbering handled above; unknown ids left as-is

    const newId = `rId${nextId++}`;
    idMap[oldId] = newId;

    if (rel.type.endsWith('/image')) {
      try {
        const mediaBuf = contentZip.readFile(`word/${rel.target}`);
        if (mediaBuf) {
          const ext = (rel.target.split('.').pop() || 'png').toLowerCase();
          const newMediaName = `media/imported_${newId}.${ext}`;
          outputZip.addFile(`word/${newMediaName}`, mediaBuf);
          newRelEntries.push(`<Relationship Id="${newId}" Type="${rel.type}" Target="${newMediaName}"/>`);
        }
      } catch { /* unreadable — reference stays dangling, same as before this fix */ }
      continue;
    }

    // Hyperlinks and anything else with no local file to copy.
    newRelEntries.push(
      `<Relationship Id="${newId}" Type="${rel.type}" Target="${rel.target}"${rel.mode ? ` TargetMode="${rel.mode}"` : ''}/>`
    );
  }

  let mergedBody = bodyContent;
  for (const [oldId, newId] of Object.entries(idMap)) {
    mergedBody = mergedBody.replace(new RegExp(`(r:(?:id|embed)=")${oldId}(")`, 'g'), `$1${newId}$2`);
  }

  if (newRelEntries.length) {
    outRelsXml = outRelsXml.replace('</Relationships>', newRelEntries.join('') + '</Relationships>');
    outputZip.updateFile('word/_rels/document.xml.rels', Buffer.from(outRelsXml, 'utf-8'));
  }
  if (newContentTypeOverrides.length) {
    let ctXml = outputZip.readAsText('[Content_Types].xml');
    ctXml = ctXml.replace('</Types>', newContentTypeOverrides.join('') + '</Types>');
    outputZip.updateFile('[Content_Types].xml', Buffer.from(ctXml, 'utf-8'));
  }

  return mergedBody;
}

/**
 * Ollama/Claude-drafted HTML (from draftWithOllama/generateRepresentationLetter
 * etc.) routinely contains a literal "&" in running text — e.g. "Terms &
 * Conditions" — that the model never escapes to "&amp;", because "write
 * clean HTML" doesn't reliably make an LLM entity-escape stray ampersands.
 * A bare "&" makes the eventual word/document.xml invalid XML: WPS and
 * modern Word silently repair it on open, but Word 2007 refuses the file
 * outright with "problems with the content" — this was still happening on
 * the Draft-with-OpenProcure/representation-letter path even after fixing
 * the equivalent issue on the Auto-Fill path (buildDocx/contentToHtml),
 * because that path builds real HTML with actual tags to preserve, not
 * plain text — so escaping must skip "&" that's already part of a tag or a
 * valid entity, and skip "<"/">" entirely since those ARE real markup here.
 */
// Common named HTML entities used throughout this file's own generated
// markup (&nbsp; for a blank table cell/paragraph placeholder is by far the
// most common — see the many `|| '&nbsp;'` fallbacks in this file and in
// Frontend/src/utils/univerConverter.js) and occasionally produced by the
// AI extraction (typographic quotes/dashes). None of these are valid on
// their own in XML/OOXML (only the 5 predefined XML entities and numeric
// character references are) — decoded to their real Unicode character here,
// BEFORE the stray-ampersand escaping below, so they render as the actual
// character instead of tripping the "unrecognized entity" catch-all and
// coming out as literal, visible text like "&nbsp;" in the downloaded Word
// document (a real bug users hit on every annexure with any blank cell).
const NAMED_ENTITY_MAP = {
  nbsp: ' ', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  hellip: '…', copy: '©', reg: '®', trade: '™',
};

function sanitizeStrayAmpersands(html) {
  let out = String(html).replace(
    /&(nbsp|mdash|ndash|lsquo|rsquo|ldquo|rdquo|hellip|copy|reg|trade);/g,
    (_, name) => NAMED_ENTITY_MAP[name]
  );
  return out.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;');
}

/**
 * html-to-docx computes table column widths as `maximumWidth / columnCount`
 * with no rounding and writes the raw float straight into the XML (e.g.
 * w:w="5021.333333333333" for a 6-column table where the page width doesn't
 * divide evenly) — an upstream bug, not something our HTML input controls.
 * OOXML width attributes (w:w on gridCol/tcW/tblW, and w:gutter) are defined
 * as integers; Word 2007 rejects the file outright over this, newer Word/WPS
 * silently round it. Applied as the final step on the finished buffer so it
 * catches every table regardless of which path generated it.
 */
function roundDecimalDxaWidths(xml) {
  return xml.replace(/(\bw:w="|\bw:gutter=")(-?\d+\.\d+)(")/g, (_, pre, num, post) => `${pre}${Math.round(parseFloat(num))}${post}`);
}

async function fixDocxXmlIssues(buf) {
  const AdmZip = require('adm-zip');
  const zip = new AdmZip(buf);
  for (const name of ['word/document.xml', 'word/header1.xml', 'word/footer1.xml']) {
    const entry = zip.getEntry(name);
    if (!entry) continue;
    const fixed = roundDecimalDxaWidths(zip.readAsText(name));
    zip.updateFile(name, Buffer.from(fixed, 'utf-8'));
  }
  return zip.toBuffer();
}

/* ─── Build DOCX by cloning letterhead.docx and injecting body content ───────
   This preserves the exact Word header (logo + Diagnostics) and footer
   (company details, CIN, golden bar) from the actual letterhead.docx file.
   Endo has no equivalent .docx template — it's built entirely from
   endo_letter_head.html assets via buildEndoDocxFromLetterhead instead.
*/
async function buildDocxFromLetterhead(htmlContent, skipAutoSignature = false, division = 'Diagno') {
  // Runs for BOTH branches below (Endo returns immediately after) — this is
  // the one choke point every DOCX-generation caller passes through.
  htmlContent = sanitizeStrayAmpersands(htmlContent);

  if (division === 'Endo') {
    return buildEndoDocxFromLetterhead(htmlContent, skipAutoSignature);
  }

  const AdmZip     = require('adm-zip');
  const HTMLtoDOCX = require('html-to-docx');
  const letterheadPath = LETTERHEAD_DOCX_PATH;

  // 1. Strip any text-based signature block — letterhead appends the real one with images.
  let cleanHtml = stripTextSignature(htmlContent);
  console.log('[buildDocxFromLetterhead] cleanHtml length:', cleanHtml.length, '| first 200:', cleanHtml.slice(0, 200));

  // 2. Generate body content as a DOCX buffer (no header/footer)
  const contentBuf = await HTMLtoDOCX(cleanHtml, null, {
    pageSize: { width: 12240, height: 15840 }, // matches letterhead sectPr
    // gutter is required even though we don't use it — html-to-docx's own
    // margin defaults include gutter:0, but supplying a custom margins
    // object entirely REPLACES that default rather than merging with it,
    // so without this the library literally writes w:gutter="undefined"
    // into the page setup — invalid XML that Word 2007 refuses to open
    // (newer Word/WPS silently drop the malformed attribute instead).
    margins:  { top: 1440, right: 758, bottom: 1440, left: 1440, gutter: 0 },
    font:     'Bookman Old Style',
    fontSize: 24,
    table:    { row: { cantSplit: true } },
    header:   false,
    footer:   false,
  });

  // 3. Extract body XML from the generated docx — strip <w:sectPr> then take the rest
  const contentZip    = new AdmZip(contentBuf);
  const contentDocXml = contentZip.readAsText('word/document.xml');
  // Greedy match: get ALL content between <w:body> and last </w:body>
  const bodyMatch     = contentDocXml.match(/<w:body>([\s\S]*)<\/w:body>/);
  let   bodyContent   = bodyMatch ? bodyMatch[1] : '';
  // Remove page-setup/section properties (we use the letterhead's instead)
  bodyContent = bodyContent.replace(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g, '').trim();
  console.log('[buildDocxFromLetterhead] bodyContent length:', bodyContent.length, '| bodyMatch:', !!bodyMatch);

  // 3. Clone letterhead.docx — gives us header, footer, images, relationships
  const outputZip       = new AdmZip(letterheadPath);
  const lhDocXml        = outputZip.readAsText('word/document.xml');

  // 3b. Merge in whatever relationships (lists, images, hyperlinks) bodyContent
  // actually references, under fresh non-colliding IDs — see the function's
  // own comment for why this matters (Word 2007 compatibility specifically).
  bodyContent = mergeContentPackageIntoLetterhead(outputZip, contentZip, bodyContent);

  // 4. Keep the letterhead's sectPr (which references rId9=header, rId10=footer)
  const sectPrMatch = lhDocXml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/);
  const sectPr      = sectPrMatch ? sectPrMatch[0] : '';

  // 5. Extract signature block from letterhead body (paragraphs from "For MERIL" to before address)
  //    Skipped entirely when the caller's HTML already supplies its own signature.
  let sigBlock = '';
  if (!skipAutoSignature) {
    const lhParas  = lhDocXml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [];
    const sigStart = lhParas.findIndex(p => p.includes('For MERIL'));
    const sigEnd   = sigStart >= 0
      ? lhParas.findIndex((p, i) => i > sigStart && (p.includes('Corporate Office') || p.includes('Mumbai Sales Office')))
      : -1;
    sigBlock = sigStart >= 0
      ? lhParas.slice(sigStart, sigEnd >= 0 ? sigEnd : sigStart + 3).join('')
      : '';
  }

  // 6. Replace body content in the letterhead document.xml (inject content + signature)
  const newDocXml = lhDocXml.replace(
    /<w:body>[\s\S]*?<\/w:body>/,
    `<w:body>${bodyContent}${sigBlock}${sectPr}</w:body>`
  );
  outputZip.updateFile('word/document.xml', Buffer.from(newDocXml, 'utf-8'));

  // 7. Merge styles: add Heading/List styles from html-to-docx that letterhead lacks
  try {
    const contentStyles  = contentZip.readAsText('word/styles.xml');
    const lhStyles       = outputZip.readAsText('word/styles.xml');
    const existingIds    = new Set([...lhStyles.matchAll(/w:styleId="([^"]+)"/g)].map(m => m[1]));
    const newStyleBlocks = [...contentStyles.matchAll(/<w:style\b[^>]*\/?>[\s\S]*?<\/w:style>/g)]
      .filter(m => {
        const id = (m[0].match(/w:styleId="([^"]+)"/) || [])[1];
        return id && !existingIds.has(id);
      })
      .map(m => m[0]);
    if (newStyleBlocks.length) {
      const merged = lhStyles.replace('</w:styles>', newStyleBlocks.join('') + '</w:styles>');
      outputZip.updateFile('word/styles.xml', Buffer.from(merged, 'utf-8'));
    }
  } catch (e) {
    console.warn('[doc-prep] style merge:', e.message);
  }

  return fixDocxXmlIssues(outputZip.toBuffer());
}

/* ─── Letterhead signature block as HTML (for PDF export) ─────────────────────
   Reads image1.png/image2.png fresh from letterhead.docx on every call —
   deliberately NOT cached, so replacing that file (e.g. a letterhead/branding
   update) takes effect immediately without a server restart. */
function getLetterheadSignatureHtml() {
  try {
    const AdmZip = require('adm-zip');
    const zip    = new AdmZip(LETTERHEAD_DOCX_PATH);
    // rId6 → image1.png (signatory composite sig), rId7 → image2.png (stamp)
    const sigBuf   = zip.readFile('word/media/image1.png');
    const stampBuf = zip.readFile('word/media/image2.png');
    const sigB64   = sigBuf   ? sigBuf.toString('base64')   : null;
    const stampB64 = stampBuf ? stampBuf.toString('base64') : null;

    return `
<div id="lh-sig" style="margin-top:16px;padding-top:12px;border-top:2px solid #002060;page-break-before:avoid;">
  <div style="display:flex;align-items:flex-start;gap:48px;margin-bottom:6px;">
    ${sigB64   ? `<img src="data:image/png;base64,${sigB64}"   style="height:90px;object-fit:contain;" />`  : ''}
    ${stampB64 ? `<img src="data:image/png;base64,${stampB64}" style="height:90px;object-fit:contain;" />`  : ''}
  </div>
  <p style="margin:6px 0 2px;font-size:10pt;color:#374151;">Encls: As above</p>
</div>`;
  } catch (e) {
    console.warn('[docPrep] getLetterheadSignatureHtml:', e.message);
    return '';
  }
}

/* ─── Endo sign-off block as HTML (for PDF export) — sourced from the
   SIGNATURE_HTML constant in endo_letter_head.html: signature image plus
   the named signatory (Gelivi Kiran Kumar) and title as real text, not
   baked into the image. ──────────────────────────────────────────────── */
let _endoSignatureHtml = null; // cached after first load

function getEndoSignatureHtml() {
  if (_endoSignatureHtml !== null) return _endoSignatureHtml;
  const sigBase64 = imageToBase64(ENDO_SIGNATURE_PATH);
  _endoSignatureHtml = sigBase64
    ? `
<div id="lh-sig" style="margin-top:4pt;page-break-before:avoid;">
  <img src="${sigBase64}" style="width:1.6in;height:auto;display:block;margin:4pt 0;" />
  <p style="font-weight:bold;font-size:11pt;margin:0;">${ENDO_SIGNATORY_NAME}</p>
  <p style="font-size:11pt;margin:0;">${ENDO_SIGNATORY_TITLE}</p>
</div>`
    : '';
  return _endoSignatureHtml;
}

/* ─── Endo header/footer — reproduces endo_letterhead_generator.html's
   .letterhead-header / .letterhead-footer exactly (logo image top-right,
   single full-width footer band image), so PDF (Puppeteer header/footer
   templates) and DOCX (html-to-docx native header/footer) both show the
   same branding on every page, unlike the source file which only renders
   it once. ─────────────────────────────────────────────────────────────── */
function buildEndoHeaderTemplateHtml() {
  const logoBase64 = imageToBase64(ENDO_HEADER_LOGO_PATH);
  return `<div style="width:100%;padding:6px 25.4mm 0 25.4mm;box-sizing:border-box;">
  <div style="display:flex;justify-content:flex-end;">
    ${logoBase64 ? `<img src="${logoBase64}" style="height:42px;object-fit:contain;" />` : ''}
  </div>
</div>`;
}

function buildEndoFooterTemplateHtml() {
  const footerBase64 = imageToBase64(ENDO_FOOTER_BAND_PATH);
  return `<div style="width:100%;padding:0;box-sizing:border-box;">
  ${footerBase64 ? `<img src="${footerBase64}" style="width:100%;height:auto;display:block;" />` : ''}
</div>`;
}

function buildEndoHeaderDocxHtml() {
  const logoBase64 = imageToBase64(ENDO_HEADER_LOGO_PATH);
  // html-to-docx's header converter doesn't reliably honor CSS width/height
  // on <img> (it was rendering the logo at native pixel size — ~5in wide,
  // spanning the full page) — explicit HTML width/height attributes (source
  // is 488x203px; scaled to 130px wide keeps the 2.4:1 aspect ratio) are
  // what it actually respects. align="right" likewise backs up text-align
  // for the same reason.
  return `<p align="right" style="text-align:right;margin:0;">${logoBase64 ? `<img src="${logoBase64}" width="130" height="54" style="width:130px;height:54px;" />` : ''}</p>`;
}

function buildEndoFooterDocxHtml() {
  const footerBase64 = imageToBase64(ENDO_FOOTER_BAND_PATH);
  return `<p style="margin:0;">${footerBase64 ? `<img src="${footerBase64}" style="width:100%;height:auto;" />` : ''}</p>`;
}

/* ─── Build Endo DOCX using html-to-docx's native header/footer (repeats on
   every page) instead of cloning a .docx template — there is no Endo
   equivalent of letterhead.docx, only endo_letter_head.html. ───────────── */
async function buildEndoDocxFromLetterhead(htmlContent, skipAutoSignature = false) {
  const HTMLtoDOCX = require('html-to-docx');
  const cleanHtml  = stripTextSignature(htmlContent);
  const bodyHtml   = skipAutoSignature ? cleanHtml : `${cleanHtml}${getEndoSignatureHtml()}`;

  const buf = await HTMLtoDOCX(
    bodyHtml,
    buildEndoHeaderDocxHtml(),
    {
      pageSize: { width: 11909, height: 16834 }, // A4 — matches endo_letter_head.html's 8.27in x 11.69in
      // left/right symmetric (1in each) so the body text sits centered on the page.
      // bottom/footer sized for the ~1.25in-tall footer band image so it doesn't
      // overlap the last line of body text.
      margins:  { top: 1440, right: 1440, bottom: 2880, left: 1440, header: 720, footer: 720, gutter: 0 },
      font:     'Calibri',
      fontSize: 22,
      table:    { row: { cantSplit: true } },
      header:   true,
      footer:   true,
    },
    buildEndoFooterDocxHtml()
  );
  return fixDocxXmlIssues(buf);
}

/* ─── Plain DOCX, no letterhead / no auto-signature — for Stamp Paper /
   Affidavit annexures. These must be printed on an actual (non-judicial)
   stamp paper and wet-signed/notarized, so neither Meril's letterhead nor
   the auto-inserted digital signature belong here; the template's own
   signature/attestation block (blank line, notary box, etc.) is left exactly
   as extracted — stripTextSignature is deliberately NOT called. ──────────── */
async function buildPlainDocxNoLetterhead(htmlContent) {
  const HTMLtoDOCX = require('html-to-docx');
  const buf = await HTMLtoDOCX(
    htmlContent,
    null,
    {
      pageSize: { width: 11909, height: 16834 }, // A4
      margins:  { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 0, footer: 0, gutter: 0 },
      font:     'Calibri',
      fontSize: 22,
      table:    { row: { cantSplit: true } },
      header:   false,
      footer:   false,
    },
    null
  );
  return fixDocxXmlIssues(buf);
}

/* ─── Strip text-based signature from HTML (shared by PDF + DOCX) ───────────── */
// Letters close with "Yours faithfully"; declarations/undertakings/annexures
// instead close with a "Signature of the Bidder ..." line (with seal, with
// stamp, etc.) — either is the placeholder instructing where to sign, which
// is redundant (and looks duplicated) once the real signature/stamp image is
// appended right after it, so both are recognized as cut points.
const SIGNATURE_MARKER_RE = /Yours\s+faithfully|Signature\s+of\s+the\s+Bidder\b/i;

function stripTextSignature(html) {
  // Find the signature block — could be <hr> before the marker, or just the marker itself.
  const hrBeforeMarker = html.search(new RegExp(`<hr[^>]*>\\s*(?:<[^>]+>\\s*)*(?:${SIGNATURE_MARKER_RE.source})`, 'i'));
  if (hrBeforeMarker >= 0) return html.slice(0, hrBeforeMarker).trimEnd();
  const markerIdx = html.search(SIGNATURE_MARKER_RE);
  if (markerIdx < 0) return html;
  const before  = html.slice(0, markerIdx);
  const lastTag = Math.max(before.lastIndexOf('<p'), before.lastIndexOf('<div'), before.lastIndexOf('<hr'));
  // Safety: if nothing was found before the signature, return the original (don't strip everything)
  if (lastTag < 20) return html;
  return html.slice(0, lastTag).trimEnd();
}

/* ─── DOCX generation (plain text → letterhead template) ────────────────────── */
// A row of a GitHub-Flavored-Markdown pipe table, e.g. "| Sr.No | Particulars |".
// Requires at least one interior pipe so a stray line that merely starts and
// ends with "|" for other reasons isn't misdetected as a table row.
const MD_TABLE_ROW = /^\s*\|.*\|.*\|\s*$|^\s*\|[^|]*\|\s*$/;
const MD_TABLE_SEPARATOR_ROW = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/;

// Non-table lines are wrapped in <p> as raw text, not parsed as HTML/Markdown
// — so any literal &, <, or > in the extracted tender text (very common,
// e.g. "Drug Licence & renewal...") must be escaped first. An unescaped "&"
// makes word/document.xml invalid XML: lenient readers (WPS, modern Word)
// silently repair it, but Word 2007 rejects the file outright — this was
// the actual cause of real annexures still failing there after the
// relationship/numbering merge fix, which only covered a different defect.
function escapeXmlText(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Plain HTML collapses leading spaces/tabs, which silently de-indents any
// line that used them for alignment in the original tender text (indented
// sub-clauses, "   Place: ____" / "   Date: ____" signature lines, etc.).
// Converting leading whitespace to explicit &nbsp; before escaping the rest
// keeps that indentation intact through to the rendered/exported document.
function escapeXmlTextPreserveIndent(s) {
  const str = String(s);
  const leading = str.match(/^[ \t]+/);
  if (!leading) return escapeXmlText(str);
  const nbsp = leading[0].replace(/\t/g, '    ').split('').map(() => '&nbsp;').join('');
  return nbsp + escapeXmlText(str.slice(leading[0].length));
}

/**
 * Converts a template's plain text/Markdown body into HTML, one block at a
 * time: contiguous Markdown pipe-table lines become a real <table> (via
 * `marked`, which `html-to-docx` downstream turns into a native, editable
 * Word table); everything else is wrapped as its own <p> exactly as before.
 * This is the minimum change to stop tables from being flattened into
 * pipe-delimited paragraph text — non-table content's rendering is
 * untouched so existing drafts don't shift.
 */
function contentToHtml(content) {
  const lines = content.split('\n');
  const htmlParts = [];
  let i = 0;

  while (i < lines.length) {
    if (MD_TABLE_ROW.test(lines[i])) {
      // Collect the contiguous run of table-row lines (header + separator + body rows).
      const start = i;
      while (i < lines.length && (MD_TABLE_ROW.test(lines[i]) || MD_TABLE_SEPARATOR_ROW.test(lines[i]))) i++;
      const tableBlock = lines.slice(start, i).join('\n');

      // Only treat it as a table if it actually has a valid header-separator
      // row (real GFM tables do; a false-positive run of pipe-containing
      // prose lines won't) — otherwise fall back to per-line paragraphs.
      const hasSeparator = lines.slice(start, i).some(l => MD_TABLE_SEPARATOR_ROW.test(l));
      if (hasSeparator) {
        htmlParts.push(marked.parse(tableBlock));
      } else {
        htmlParts.push(lines.slice(start, i).map(l => `<p>${l ? escapeXmlTextPreserveIndent(l) : '&nbsp;'}</p>`).join(''));
      }
    } else {
      htmlParts.push(`<p>${lines[i] ? escapeXmlTextPreserveIndent(lines[i]) : '&nbsp;'}</p>`);
      i++;
    }
  }

  return htmlParts.join('');
}

async function buildDocx(title, content, division = 'Diagno') {
  const bodyHtml = contentToHtml(content);
  return buildDocxFromLetterhead(bodyHtml, false, division === 'Endo' ? 'Endo' : 'Diagno');
}

async function buildPdfBufferFromHtml(htmlContent, division = 'Diagno') {
  let headerTemplate, footerTemplate;
  if (division === 'Endo') {
    headerTemplate = buildEndoHeaderTemplateHtml();
    footerTemplate = buildEndoFooterTemplateHtml();
  } else {
    const logoBase64 = getLogoBase64();
    headerTemplate = `<div style="width:100%;padding:6px 20mm 0 20mm;box-sizing:border-box;font-family:Verdana,Arial,sans-serif;">
  <div style="display:flex;justify-content:flex-end;align-items:flex-end;">
    ${logoBase64 ? `<img src="${logoBase64}" style="height:42px;object-fit:contain;" />` : ''}
  </div>
  <div style="text-align:right;font-size:9px;font-weight:bold;color:#002060;margin-top:1px;">Diagnostics</div>
  <div style="height:2px;background:#002060;margin-top:3px;"></div>
</div>`;

    footerTemplate = `<div style="width:100%;padding:0 20mm 4px 20mm;box-sizing:border-box;font-family:Verdana,Arial,sans-serif;text-align:center;line-height:1.55;">
  <div style="height:1px;background:#cccccc;margin-bottom:3px;"></div>
  <div style="font-size:8px;font-weight:bold;color:#111;">Meril Diagnostics Private Limited</div>
  <div style="font-size:7px;color:#333;">CIN No. U33110GJ2011PTC064994</div>
  <div style="font-size:7px;color:#333;">Regd. Office: Survey No. 135/139, Bilakhia House, Muktanand Marg, Chala, Vapi-396 191, Gujarat, India</div>
  <div style="font-size:7px;color:#333;">Mumbai Office: 601, Midas, Sahar Plaza, JB Nagar, Andheri East, Mumbai &#8211; 400059</div>
  <div style="font-size:7px;color:#333;">Tel: +91 260 2408000 &nbsp; Email: tender.merildiagno@merillife.com &nbsp; website: www.merillife.com</div>
  <div style="font-size:8px;font-weight:bold;color:#FFC000;margin-top:2px;">Cardiovascular | Orthopedic | Diagnostics | Endo-Surgery | ENT</div>
</div>`;
  }

  const cleanBody = stripTextSignature(htmlContent);
  const sigBlock = division === 'Endo' ? getEndoSignatureHtml() : getLetterheadSignatureHtml();

  const bodyHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { font-family: 'Bookman Old Style', 'Times New Roman', serif; font-size: 12pt; color: #1f2937; line-height: 1.7; margin: 0; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; }
  th, td { border: 1px solid #d1d5db; padding: 6px 10px; font-size: 11pt; text-align: left; }
  th { background: #f1f5f9; font-weight: 600; text-align: center; }
  h1 { font-size: 15pt; margin: 10px 0 5px; text-align: center; }
  h2 { font-size: 13pt; margin: 8px 0 4px; text-align: center; }
  h3 { font-size: 12pt; margin: 6px 0 3px; text-align: left; }
  p  { margin: 0 0 6px; text-align: justify; }
  ul, ol { padding-left: 20px; margin: 4px 0; }
  li { margin-bottom: 3px; text-align: justify; }
  blockquote { border-left: 3px solid #002060; padding: 4px 12px; margin: 8px 0; }
  hr { border: none; border-top: 1px solid #ccc; margin: 12px 0; }
</style>
</head>
<body><div id="lh-content">${cleanBody}</div>${sigBlock}</body>
</html>`;

  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(bodyHtml, { waitUntil: 'networkidle0' });
    const pdfMargin = division === 'Endo'
      ? { top: '25.4mm', right: '25.4mm', bottom: '46mm', left: '25.4mm' }
      : { top: '32mm', right: '13.4mm', bottom: '48mm', left: '25.4mm' };

    // Pin the signature block to the bottom of whichever printed page it
    // lands on, instead of letting it float right under wherever the body
    // content happens to end (which left a mostly-blank final page on long
    // documents like the checklist). Puppeteer prints at 96 CSS px/inch
    // regardless of the physical A4 size, so the content area in px is
    // derivable straight from the page height minus the print margins.
    const MM_TO_PX = 96 / 25.4;
    const pageAreaPx = (297 - parseFloat(pdfMargin.top) - parseFloat(pdfMargin.bottom)) * MM_TO_PX;
    const spacerPx = await page.evaluate((pageAreaPx) => {
      const sig = document.getElementById('lh-sig');
      if (!sig) return 0;
      const sigTop    = sig.offsetTop;
      const sigHeight = sig.getBoundingClientRect().height;
      if (!sigHeight) return 0;
      const offsetWithinPage    = sigTop % pageAreaPx;
      const remainingOnThisPage = pageAreaPx - offsetWithinPage;
      return sigHeight <= remainingOnThisPage
        ? remainingOnThisPage - sigHeight
        : (remainingOnThisPage + pageAreaPx) - sigHeight;
    }, pageAreaPx);
    if (spacerPx > 0) {
      await page.evaluate((h) => {
        const sig = document.getElementById('lh-sig');
        const spacer = document.createElement('div');
        spacer.style.height = `${h}px`;
        sig.parentNode.insertBefore(spacer, sig);
      }, spacerPx);
    }

    const pdf = await page.pdf({
      format:                'A4',
      printBackground:       true,
      displayHeaderFooter:   true,
      headerTemplate,
      footerTemplate,
      margin: pdfMargin,
    });
    return pdf;
  } finally {
    await browser.close().catch(() => {});
  }
}

/* ─── Image → base64 data URL, for embedding in Puppeteer header/footer templates ── */
function imageToBase64(filePath) {
  if (fs.existsSync(filePath)) {
    return `data:image/png;base64,${fs.readFileSync(filePath).toString('base64')}`;
  }
  return '';
}

function getLogoBase64() {
  return imageToBase64(LOGO_PATH);
}

/* ─── GEM document auto-detection ───────────────────────────────────────────
   Reads json_data.links from gem_tenders / gem_tender_docs json file,
   downloads ATC / GTC / OMPPD files, returns them as additional_docs entries.
*/
function classifyGemLink(uri) {
  if (/showbidDocument|BidPlus_Documentdownload/i.test(uri)) return null;  // main bid doc
  if (/showCatalogue|catalog_data|BoqDocument|BOQDocument/i.test(uri)) return null; // skip
  if (/ATCF|atcf/i.test(uri) || /fileDownloadPath=.*ATC/i.test(uri)) return 'ATC';
  if (/fulfilment\.gem\.gov\.in\/contract\//i.test(uri)) return 'ATC';
  if (/downloadOmppdfile/i.test(uri)) return 'OMPPD';
  // NOTE: gtc/pdfByDate and shared_doc/gtc are GeM's platform-wide General Terms &
  // Conditions PDF (versioned only by publish date, not bid number) — the same file
  // is embedded in every tender's PDF, so it is never actually specific to this bid.
  // Do not auto-add it as a tender document.
  return null;
}

function guessExt(uri) {
  const m = uri.match(/\.(docx|doc|pdf)(\?|$)/i);
  if (m) return '.' + m[1].toLowerCase();
  if (/downloadOmppdfile|gtc\/pdfByDate/i.test(uri)) return '.pdf';
  return '.pdf';
}

async function downloadGemFile(uri, destPath) {
  try {
    const resp = await fetch(uri, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept':     'application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,*/*',
        'Referer':    'https://bidplus.gem.gov.in/',
      },
      signal: AbortSignal.timeout(30000),
    });
    if (!resp.ok) return false;
    const ct  = resp.headers.get('content-type') || '';
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length < 500) return false; // too small → likely error HTML
    // Reject HTML error pages
    if ((ct.includes('html') || ct.includes('text/')) && !ct.includes('pdf')) return false;
    fs.writeFileSync(destPath, buf);
    return true;
  } catch (e) {
    console.warn(`[doc-prep] download failed for ${uri}:`, e.message);
    return false;
  }
}

async function resolveGemAdditionalDocs(bidNo) {
  const safe      = bidNo.replace(/[^a-zA-Z0-9_-]/g, '_');
  const uploadDir = path.join(DOC_PREP_DIR, safe);
  fs.mkdirSync(uploadDir, { recursive: true });

  // Pull json_data: prefer file on disk, fallback to DB column
  let links = [];
  try {
    const [rows] = await db.query(
      `SELECT d.json_path, t.json_data
       FROM gem_tenders t
       LEFT JOIN gem_tender_docs d ON d.bid_number = t.bid_number
       WHERE t.bid_number = ? LIMIT 1`,
      [bidNo]
    );
    if (!rows.length) return [];
    let jd = null;
    if (rows[0].json_path && fs.existsSync(rows[0].json_path)) {
      jd = JSON.parse(fs.readFileSync(rows[0].json_path, 'utf-8'));
    } else if (rows[0].json_data) {
      jd = typeof rows[0].json_data === 'string' ? JSON.parse(rows[0].json_data) : rows[0].json_data;
    }
    links = jd?.links || [];
  } catch (e) {
    console.warn('[doc-prep] resolveGemAdditionalDocs failed to read json_data:', e.message);
    return [];
  }

  // Deduplicate URIs and classify
  const seen = new Set();
  const relevant = [];
  for (const lnk of links) {
    const uri = lnk?.uri;
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    const label = classifyGemLink(uri);
    if (!label) continue;
    relevant.push({ uri, label });
  }

  // Download in parallel (cap at 5)
  const results = await Promise.all(
    relevant.slice(0, 5).map(async ({ uri, label }) => {
      const ext      = guessExt(uri);
      const safeName = `${label}_${Date.now()}_${Math.round(Math.random() * 1e4)}${ext}`;
      const filePath = path.join(uploadDir, safeName);
      const ok       = await downloadGemFile(uri, filePath);
      if (!ok) return null;
      return {
        id:        `gem_${Date.now()}_${Math.round(Math.random() * 1e5)}`,
        name:      safeName,
        path:      filePath,
        doc_label: label,
        source:    'gem',
        uri,
      };
    })
  );

  return results.filter(Boolean);
}

/* Auto-detected GEM docs are staged into `detected_docs` for the user to review —
   they are NEVER merged into `additional_docs` (and therefore never fed into
   analysis) until explicitly accepted via acceptDetectedDoc. This is what stops a
   bad auto-detection (e.g. the platform-wide GTC PDF) from silently polluting a
   tender's document set the way it used to. */
async function detectAndAddGemDocs(bidNo) {
  const gemDocs = await resolveGemAdditionalDocs(bidNo);

  // Mark detection as attempted regardless of outcome, so getOrCreateSession
  // doesn't keep re-scanning (and re-downloading) on every page load.
  await db.query(`UPDATE doc_prep_sessions SET gem_detected_at = NOW() WHERE bid_no = ?`, [bidNo]);
  if (!gemDocs.length) return;

  const [rows] = await db.query(
    `SELECT additional_docs, detected_docs FROM doc_prep_sessions WHERE bid_no = ?`, [bidNo]
  );
  const existingAdditional = parseCol(rows[0]?.additional_docs) || [];
  const existingDetected   = parseCol(rows[0]?.detected_docs)   || [];
  const knownUris = new Set(
    [...existingAdditional, ...existingDetected].map(d => d.uri).filter(Boolean)
  );
  const toAdd = gemDocs.filter(d => !knownUris.has(d.uri)).map(d => ({ ...d, confirmed: false }));
  if (!toAdd.length) return;

  await db.query(
    `UPDATE doc_prep_sessions SET detected_docs = ? WHERE bid_no = ?`,
    [JSON.stringify([...existingDetected, ...toAdd]), bidNo]
  );
  console.log(`[doc-prep] staged ${toAdd.length} GEM doc(s) for review on ${bidNo}:`, toAdd.map(d => d.doc_label));
}

/* ─── AI Drive auto-matching ─────────────────────────────────────────────────
   Annexures with no prescribed format (e.g. "MSE Relaxation — Udyam
   Certificate") have nothing to fill in — but the company's AI Drive archive
   may already hold a ready-made document that satisfies them (e.g. an actual
   Udyam registration certificate). Runs once per session (guarded by
   drive_matched_at) so it doesn't re-call the LLM on every page load. */
async function matchDriveForSession(bidNo, annexures) {
  const toMatch = (annexures || []).filter(a => !a.has_prescribed_format);
  const driveMatches = {};

  if (toMatch.length) {
    try {
      const [driveRows] = await db.query(
        `SELECT id, doc_name, title, doc_type, tags, ai_summary FROM company_drive ORDER BY use_count DESC LIMIT 50`
      );
      if (driveRows.length) {
        const docsSummary = driveRows.map(r => ({
          id: r.id, doc_name: r.title || r.doc_name, doc_type: r.doc_type,
          tags: parseCol(r.tags) || [], ai_summary: r.ai_summary,
        }));

        await Promise.all(toMatch.map(async (ann) => {
          try {
            const system = `You are matching a company's document archive to Indian government tender requirements for Meril Life Sciences, a medical device company. Return ONLY valid JSON.`;
            const user = `The tender requires this document, but no fillable template/format exists for it — a ready-made supporting document from the archive is needed instead:
Title: ${ann.title}
Type: ${ann.type}
Reference: ${ann.annexure_ref}
Page hint: ${ann.page_hint || ''}

Available company documents in the archive:
${JSON.stringify(docsSummary, null, 2)}

Which ONE archive document (if any) satisfies this requirement? Only match if genuinely relevant — most tender items have nothing in the archive.
Return ONLY this JSON (no markdown):
{ "matched": true, "id": 12, "reason": "one sentence" }
or
{ "matched": false, "id": null, "reason": "" }`;

            const raw    = await callOllama(system, user, 0.2, 800);
            const parsed = parseJsonResponse(raw);
            if (parsed?.matched && parsed.id) {
              const doc = driveRows.find(d => d.id === parsed.id);
              if (doc) {
                driveMatches[ann.id] = {
                  drive_doc_id: doc.id,
                  doc_name:     doc.title || doc.doc_name,
                  reason:       parsed.reason || '',
                };
              }
            }
          } catch (e) {
            console.warn(`[doc-prep] drive match failed for ${ann.annexure_ref}:`, e.message);
          }
        }));
      }
    } catch (e) {
      console.warn('[doc-prep] matchDriveForSession skipped:', e.message);
    }
  }

  await db.query(
    `UPDATE doc_prep_sessions SET drive_matches = ?, drive_matched_at = NOW() WHERE bid_no = ?`,
    [JSON.stringify(driveMatches), bidNo]
  );
  return driveMatches;
}

async function setLog(bidNo, msg) {
  await db.query(
    `UPDATE doc_prep_sessions SET processing_log = ? WHERE bid_no = ?`,
    [msg, bidNo]
  );
}

/* ─── GEM PDF resolution ─────────────────────────────────────────────────── */
async function resolveGemPdf(bidNo) {
  // 1. Check gem_tender_docs for a PDF path
  try {
    const [docRows] = await db.query(
      `SELECT pdf_path FROM gem_tender_docs WHERE bid_number = ? LIMIT 1`,
      [bidNo]
    );
    if (docRows.length > 0 && docRows[0].pdf_path && fs.existsSync(docRows[0].pdf_path)) {
      return { path: docRows[0].pdf_path, status: 'available' };
    }
  } catch { /* table may not exist */ }

  // 2. Check gem_tenders for detail_url
  try {
    const [gemRows] = await db.query(
      `SELECT detail_url FROM gem_tenders WHERE bid_number = ? LIMIT 1`,
      [bidNo]
    );
    if (gemRows.length > 0 && gemRows[0].detail_url) {
      return { path: null, status: 'needs_scrape', detail_url: gemRows[0].detail_url };
    }
  } catch { /* table may not exist */ }

  return { path: null, status: 'not_found' };
}

/* ─── Controllers ────────────────────────────────────────────────────────── */

/**
 * GET /api/doc-prep/:bidNo/session
 */
exports.getOrCreateSession = async (req, res) => {
  const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  try {
    await ensureTable();

    // Upsert row
    await db.query(
      `INSERT INTO doc_prep_sessions (bid_no) VALUES (?) ON DUPLICATE KEY UPDATE bid_no = bid_no`,
      [bidNo]
    );

    const [rows] = await db.query(
      `SELECT * FROM doc_prep_sessions WHERE bid_no = ? LIMIT 1`,
      [bidNo]
    );
    const session = rows[0];

    // Try to resolve GEM PDF if no bid doc yet
    let gemPdfStatus = null;
    let detailUrl    = null;
    if (!session.bid_doc_path) {
      const resolved = await resolveGemPdf(bidNo);
      gemPdfStatus = resolved.status;
      detailUrl    = resolved.detail_url || null;
      if (resolved.path) {
        await db.query(
          `UPDATE doc_prep_sessions SET bid_doc_path = ? WHERE bid_no = ?`,
          [resolved.path, bidNo]
        );
        session.bid_doc_path = resolved.path;
        gemPdfStatus = 'available';
      }
    } else {
      gemPdfStatus = 'available';
    }

    // Auto-detect GEM additional docs (ATC, OMPPD) in the background, once per session.
    // Results land in detected_docs for review — never auto-merged into additional_docs.
    if (!session.gem_detected_at) {
      detectAndAddGemDocs(bidNo).catch(e =>
        console.warn('[doc-prep] background GEM doc detection failed:', e.message)
      );
    }

    // Sessions analyzed before AI Drive auto-matching existed won't have
    // drive_matches yet — backfill once in the background, same pattern as above.
    const sessionAnnexures = parseCol(session.annexures);
    if (session.status === 'done' && sessionAnnexures?.length && !session.drive_matched_at) {
      matchDriveForSession(bidNo, sessionAnnexures).catch(e =>
        console.warn('[doc-prep] background AI Drive matching failed:', e.message)
      );
    }

    const rawUploadedDocs = parseCol(session.uploaded_docs) || [];
    let uploadedDocsDirty = false;
    for (const doc of rawUploadedDocs) {
      if ((doc.from_library || doc.push_source === 'library') && !doc.library_path) {
        try {
          const [matches] = await db.query(
            `SELECT id, name, parent_id FROM library_items WHERE (name = ? OR file_path LIKE ?) AND type = 'file' LIMIT 1`,
            [doc.file_name || doc.name, `%${doc.file_name || doc.name}%`]
          );
          if (matches.length) {
            const lib = matches[0];
            doc.library_item_id = lib.id;
            doc.library_folder_id = lib.parent_id || null;
            const trail = await getLibraryBreadcrumb(lib.parent_id);
            doc.library_path = ['Library', ...trail.map(t => t.name), lib.name].join(' / ');
            doc.library_folder_path = ['Library', ...trail.map(t => t.name)].join(' / ');
          } else {
            doc.library_path = `Library / ${doc.file_name || doc.name}`;
            doc.library_folder_path = 'Library';
          }
        } catch (e) {
          doc.library_path = `Library / ${doc.file_name || doc.name}`;
          doc.library_folder_path = 'Library';
        }
      }

      // One-time self-heal: library-sourced docs saved before the "stage in
      // Doc Prep until explicitly pushed" behavior existed have no
      // pushed_to_mydocs field at all (undefined), which My Documents'
      // `!== false` check treats as visible — same as an actual push. Back
      // then every library import went straight to My Documents, so that's
      // exactly the "still showing up automatically" bug being fixed here:
      // default those older records to staged, matching current behavior.
      if ((doc.from_library || doc.push_source === 'library') && doc.pushed_to_mydocs === undefined) {
        doc.pushed_to_mydocs = false;
        uploadedDocsDirty = true;
      }
    }

    if (uploadedDocsDirty) {
      await db.query(
        `UPDATE doc_prep_sessions SET uploaded_docs = ? WHERE bid_no = ?`,
        [JSON.stringify(rawUploadedDocs), bidNo]
      );
    }

    return res.json({
      success: true,
      data: {
        ...session,
        annexures:        sessionAnnexures,
        formats:          parseCol(session.formats),
        filled_templates: parseCol(session.filled_templates),
        additional_docs:  parseCol(session.additional_docs) || [],
        extracted_files:  parseCol(session.extracted_files) || [],
        detected_docs:    parseCol(session.detected_docs)   || [],
        uploaded_docs:    rawUploadedDocs,
        drive_matches:    parseCol(session.drive_matches)   || {},
        checklist:        parseCol(session.checklist)       || [],
        gemPdfStatus,
        detail_url: detailUrl,
      },
    });
  } catch (err) {
    console.error('[doc-prep] getOrCreateSession:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/doc-prep/:bidNo/upload-bid
 * Accepts any file. ZIP files are extracted and the file list is returned for
 * the user to assign roles (bid doc / additional / ignore) before analysis.
 */
exports.uploadBidDoc = async (req, res) => {
  const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  try {
    await ensureTable();
    const ext = path.extname(req.file.originalname).toLowerCase();

    if (ext === '.zip') {
      const AdmZip    = require('adm-zip');
      let zip;
      try { zip = new AdmZip(req.file.path); }
      catch (e) { return res.status(400).json({ success: false, message: 'Could not open ZIP file: ' + e.message }); }

      const extractDir = req.file.path + '_extracted';
      fs.mkdirSync(extractDir, { recursive: true });
      zip.extractAllTo(extractDir, true);

      const entries = zip.getEntries()
        .filter(e => !e.isDirectory && e.entryName && !path.basename(e.entryName).startsWith('.'))
        .map(e => {
          const filePath = path.join(extractDir, e.entryName);
          return {
            name:     e.entryName,
            basename: path.basename(e.entryName),
            ext:      path.extname(e.entryName).toLowerCase() || '',
            size:     e.header.size,
            path:     filePath,
          };
        })
        .filter(f => fs.existsSync(f.path));

      await db.query(
        `INSERT INTO doc_prep_sessions (bid_no, extracted_files, status, bid_doc_path)
         VALUES (?, ?, 'pending_selection', NULL)
         ON DUPLICATE KEY UPDATE extracted_files = VALUES(extracted_files), status = 'pending_selection',
           bid_doc_path = NULL, processing_log = NULL, annexures = NULL, formats = NULL`,
        [bidNo, JSON.stringify(entries)]
      );

      return res.json({ success: true, isZip: true, extractedFiles: entries });
    }

    // Non-ZIP: store directly as bid document
    await db.query(
      `INSERT INTO doc_prep_sessions (bid_no, bid_doc_path, status)
       VALUES (?, ?, 'idle')
       ON DUPLICATE KEY UPDATE bid_doc_path = VALUES(bid_doc_path), status = 'idle',
         processing_log = NULL, extracted_files = NULL`,
      [bidNo, req.file.path]
    );
    return res.json({ success: true, message: 'Bid document uploaded', bid_doc_path: req.file.path });
  } catch (err) {
    console.error('[doc-prep] uploadBidDoc:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/doc-prep/:bidNo/import-from-workspace
 * Body: { items: [{ source: 'uploaded_doc', id, name } | { source: 'tender_document', path, name }] }
 * Lets "Upload Bid Document" pull from documents already on file for this
 * tender — My Documents uploads, or official Tender Documents that live on
 * our own disk (external tender-portal links aren't resolvable here) —
 * instead of re-uploading the same file from the computer. The first item
 * becomes the bid document; the rest become additional documents, matching
 * the existing upload-bid / upload-additional shapes exactly so the rest of
 * the analysis pipeline is unaffected.
 */
exports.importFromWorkspace = async (req, res) => {
  const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!items.length) return res.status(400).json({ success: false, message: 'No documents selected' });

  try {
    await ensureTable();
    const [rows] = await db.query(
      `SELECT uploaded_docs, additional_docs FROM doc_prep_sessions WHERE bid_no = ? LIMIT 1`,
      [bidNo]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Session not found. Load the Doc Prep tab first.' });
    }

    const uploadedDocs = parseCol(rows[0].uploaded_docs) || [];
    const additionalDocs = parseCol(rows[0].additional_docs) || [];

    const safe = bidNo.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const destDir = path.join(__dirname, '../../uploads/doc-prep', safe);
    fs.mkdirSync(destDir, { recursive: true });

    const resolved = [];
    for (const item of items) {
      let srcPath = null;
      let name = item.name || 'document';
      if (item.source === 'uploaded_doc') {
        const doc = uploadedDocs.find(d => d.id === item.id);
        if (doc && fs.existsSync(doc.path)) { srcPath = doc.path; name = doc.file_name || doc.name; }
      } else if (item.source === 'tender_document') {
        if (item.path && fs.existsSync(item.path)) { srcPath = item.path; name = item.name || path.basename(item.path); }
      }
      if (!srcPath) continue;
      const ext = path.extname(srcPath) || '';
      const destPath = path.join(destDir, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
      fs.copyFileSync(srcPath, destPath);
      resolved.push({ path: destPath, name });
    }

    if (!resolved.length) {
      return res.status(400).json({ success: false, message: 'None of the selected documents could be found on disk' });
    }

    const [bidDoc, ...rest] = resolved;
    const newAdditional = rest.map(r => ({
      id:        `adoc_${Date.now()}_${Math.round(Math.random() * 1e5)}`,
      name:      r.name,
      path:      r.path,
      doc_label: r.name,
      source:    'workspace',
    }));
    const mergedAdditional = [...additionalDocs, ...newAdditional];

    await db.query(
      `UPDATE doc_prep_sessions SET bid_doc_path = ?, additional_docs = ?, status = 'idle', extracted_files = NULL WHERE bid_no = ?`,
      [bidDoc.path, JSON.stringify(mergedAdditional), bidNo]
    );

    return res.json({ success: true, bid_doc_path: bidDoc.path, additional_docs: mergedAdditional });
  } catch (err) {
    console.error('[doc-prep] importFromWorkspace:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/doc-prep/:bidNo/analyze
 * Non-blocking — returns immediately, runs analysis in background.
 */
exports.analyzeBidDoc = async (req, res) => {
  const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  try {
    await ensureTable();
    const [rows] = await db.query(
      `SELECT bid_doc_path, status, additional_docs, detected_docs FROM doc_prep_sessions WHERE bid_no = ? LIMIT 1`,
      [bidNo]
    );
    if (!rows.length || !rows[0].bid_doc_path) {
      return res.status(400).json({ success: false, message: 'No bid document on file. Please upload one first.' });
    }
    if (rows[0].status === 'processing') {
      return res.json({ success: true, status: 'processing', message: 'Analysis already running.' });
    }
    const pendingDetected = parseCol(rows[0].detected_docs) || [];
    if (pendingDetected.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Please accept or reject ${pendingDetected.length} detected document(s) before running analysis.`,
      });
    }

    const bidDocPath     = rows[0].bid_doc_path;
    const additionalDocs = parseCol(rows[0].additional_docs) || [];

    // Set status to processing immediately
    await db.query(
      `UPDATE doc_prep_sessions SET status = 'processing', processing_log = 'Starting PDF extraction…', annexures = NULL, formats = NULL WHERE bid_no = ?`,
      [bidNo]
    );

    // Respond immediately — client will poll
    res.json({ success: true, status: 'processing', message: 'Analysis started. Poll /session for updates.' });

    // ── Background pipeline ───────────────────────────────────────────────
    runAnalysis(bidNo, bidDocPath, additionalDocs).catch(async (err) => {
      console.error('[doc-prep] background analysis failed:', err);
      await db.query(
        `UPDATE doc_prep_sessions SET status = 'error', processing_log = ? WHERE bid_no = ?`,
        [`Error: ${err.message}`, bidNo]
      ).catch(() => {});
    });

  } catch (err) {
    console.error('[doc-prep] analyzeBidDoc:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Extracts and concatenates text from the bid doc + additional docs, ATC-first,
 * capped at 260k chars. Shared by runAnalysis (full discovery) and
 * extractTemplate (single on-demand template pull), so both see the same text.
 */
async function buildCombinedText(bidDocPath, additionalDocs = [], onProgress = null) {
  const docCount = 1 + additionalDocs.length;

  // Annexure formats conventionally sit at the END of a tender document —
  // this was previously capped at 80,000 chars (~30 pages), which silently
  // dropped every annexure body in anything longer than that, even though
  // the annexure was correctly *discovered* (referenced by name earlier in
  // the doc). Raised generously — the model host is a large-context cloud
  // model, so a ~200k-char document is not a problem.
  const pdfText = await extractDocText(bidDocPath, 200000, onProgress);
  if (!pdfText.trim()) throw new Error('Could not extract text from bid document (including OCR)');

  const sortedAdditional = [
    ...additionalDocs.filter(d => /atc/i.test(d.doc_label)),
    ...additionalDocs.filter(d => !/atc/i.test(d.doc_label)),
  ];

  const extraTexts = await Promise.all(
    sortedAdditional.map(async (d) => {
      try {
        const t = await extractDocText(d.path, 100000);
        return `\n\n===== ${d.doc_label.toUpperCase()} =====\n${t}`;
      } catch (e) {
        console.warn(`[doc-prep] could not extract text from additional doc "${d.name}":`, e.message);
        return '';
      }
    })
  );

  const combinedText = (pdfText + extraTexts.join('')).slice(0, 260000);
  const multiDocNote = additionalDocs.length
    ? `This tender package has ${docCount} documents: the main Bid Document plus ${sortedAdditional.map(d => d.doc_label).join(', ')}. Annexures may appear in ANY section.\n\n`
    : '';

  return { combinedText, multiDocNote, docCount };
}

/**
 * Extracts the verbatim template text for ONE annexure from the tender text.
 * Pulled out of the old analysis batch loop so it can run on demand (Auto
 * Fill) instead of for every has_prescribed_format item up front.
 */
// Shared between the text-based and vision-based extraction below, so the
// HTML formatting contract stays identical regardless of which one runs.
// Earlier version asked for plain text with [FILL:*] markers, then ran it
// through a naive line->`<p>` converter downstream — that flattened every
// tender template into left-aligned paragraphs, losing the centered bold
// titles, bold "Sub:"/"Ref:" labels, indented address blocks, underlined
// blank fields and right-aligned signature line the original document
// actually has (confirmed side-by-side against a real Annexure I). Asking
// the model for HTML output directly — instead of a second formatting
// pass — lets it reproduce that structure itself while it still has the
// source layout in front of it.
function templateHtmlRules(ann) {
  return `Reproduce the COMPLETE template as clean HTML that visually matches how it is laid out in the source. Rules, in priority order:

1. HIGHEST PRIORITY — TABLES: if this item contains ANY table (a checklist, schedule, or any
   content laid out in rows and columns — e.g. "Sr.No | Name of Item | Year wise period | ..."),
   it MUST be reproduced as a real HTML <table> with <tr>/<td> (or <th> for header rows) cells and
   a 1px solid border on the table and every cell. Use rowspan/colspan to reproduce merged header
   cells exactly as the source shows them (e.g. a header cell spanning two sub-columns). Every row
   and every column from the source MUST appear in full — do not drop, merge, summarize, blank out,
   or truncate any row or cell, including empty data rows meant for the bidder to fill in by hand.
   If the source table has 10 rows, your table must also have 10 rows. NEVER omit a table to save
   space — if you are running low on output budget, shorten or drop non-table prose lines instead,
   but a table must always be emitted in full. This is the single most common source of drafting
   errors, so get it exactly right.
2. Preserve all headings, numbering, clauses, signature blocks, witness sections, stamp notes — do NOT summarize, shorten or rewrite any clause. Keep all wording character-for-character.
3. Reproduce the VISUAL LAYOUT using plain inline-styled HTML tags, matching the source as closely as possible:
   - A title/heading line (e.g. "ANNEXURE-I") -> <p style="text-align:center;font-weight:bold;">...</p>
   - A subtitle directly under the title -> <p style="text-align:center;font-weight:bold;">...</p> (or add font-style:italic if the source uses it)
   - A bold label at the start of a line (e.g. "Sub:", "Ref:", "To:") -> keep the rest of the line normal, wrap only the label in <b>...</b>
   - An indented block (e.g. an addressee's name + registered office lines) -> <p style="margin-left:2em;">...</p> per line, matching the source's indentation
   - A right-aligned closing line (e.g. "Yours faithfully,") -> <p style="text-align:right;">...</p>
   - Everything else -> a plain <p>...</p> per line/paragraph exactly as in the source
4. Replace every blank / underscore sequence / fill-in space for the bidder with an underlined placeholder span:
   <span style="border-bottom:1px solid #000;padding:0 4px;">[FILL:field_name]</span>
   Use ONLY these field names, exactly as spelled — company/regulatory facts the system already
   knows and will auto-fill:
   [FILL:company_name], [FILL:address], [FILL:gstin], [FILL:pan], [FILL:cin],
   [FILL:authorized_signatory], [FILL:designation], [FILL:date], [FILL:place],
   [FILL:contact_number], [FILL:email], [FILL:bank_name], [FILL:bank_account],
   [FILL:bank_ifsc], [FILL:tender_reference], [FILL:tender_name],
   [FILL:drug_license_no], [FILL:drug_license_validity], [FILL:schedule_m_compliance_date],
   [FILL:non_conviction_certificate_date], [FILL:market_standing_certificate_date],
   [FILL:manufacturing_license_no], [FILL:who_gmp_certificate_no], [FILL:iso_certificate_no],
   [FILL:other_{descriptive_name}] only for something genuinely not covered by the list above.
   CRITICAL — never invent a combined/merged field name (e.g. never write
   [FILL:company_name_and_address] or [FILL:name_and_designation]): when a single blank in the
   source stands for more than one of the concepts above (e.g. "Name of firm and address:"), emit
   one span per concept back-to-back using their own exact names from the list, e.g.
   [FILL:company_name], [FILL:address] — never merge them into one new key. This is the ONLY use of
   <span> — never wrap non-blank text in a bordered span. Do NOT put a [FILL:*] span inside a table
   cell meant to stay blank for the bidder to write in by hand — leave that cell as an empty <td></td>.
5. Use ONLY the tags/styles named above — no <html>/<head>/<body>, no external CSS, no class names,
   no markdown.
6. If ${ann.annexure_ref} cannot be found, respond with exactly: NOT_FOUND

Respond with ONLY the HTML between these exact markers, nothing else — no explanation, no markdown fences:
===TEMPLATE_START===
(the html goes here)
===TEMPLATE_END===`;
}

function parseTemplateResponse(ann, raw) {
  const match = raw.match(/===TEMPLATE_START===([\s\S]*?)===TEMPLATE_END===/);
  const verbatim = match ? match[1].trim() : raw.trim();
  if (!verbatim || /^NOT_FOUND$/i.test(verbatim)) return null;
  return {
    id: ann.id,
    annexure_ref: ann.annexure_ref,
    title: ann.title,
    type: ann.type,
    verbatim_content: verbatim,
    is_html: true,
  };
}

async function extractOneTemplate(ann, combinedText) {
  const systemPrompt = `You are an expert at locating and transcribing exact document templates from Indian government tender documents, and at reproducing their visual layout as clean HTML.`;
  const userPrompt = `From the tender document text below, locate ${ann.annexure_ref} — "${ann.title}".

${templateHtmlRules(ann)}

Tender document text:
${combinedText}`;

  // 8000 was sized for the old plain-text output; HTML markup (tags, inline
  // styles, <table>/<tr>/<td> per cell) is far more tokens per line for the
  // same content, and a table-heavy annexure was observed getting cut off
  // before the table — losing the table entirely rather than just trimming
  // trailing prose. Raised generously; the model host is a large-context
  // cloud model, so this is not a cost concern.
  const raw = await callOllama(systemPrompt, userPrompt, 0.05, 16000);
  return parseTemplateResponse(ann, raw);
}

/**
 * Every page number mentioned in discovery's own page_hint (e.g. the Doc Prep
 * UI shows "Page 10, 70" for Annexure-8.3), most-likely-correct page LAST.
 *
 * A hint with more than one number is near-universally "<checklist
 * cross-reference page>, <the annexure's own page>" — e.g. a bidder's
 * checklist table on page 10 has a row reading "...Annexure-8.3" alongside
 * the ACTUAL Annexure-8.3 format printed on page 70. Rendering only the
 * first number (the old behaviour) grabbed that one-line checklist mention
 * instead of the real annexure, producing a near-empty extraction that
 * looked like "blank content" once filled in — this was the exact bug
 * behind Annexure-8.3 coming out blank. Trying candidates last-first (and
 * falling back through the rest if the top candidate's extraction looks too
 * thin — see extractOneTemplateFromPage) makes this resilient even if a
 * future tender's hint order differs.
 */
function resolveAnnexurePages(ann) {
  const nums = [...(ann.page_hint || '').matchAll(/(\d+)/g)].map(m => parseInt(m[1], 10));
  if (!nums.length) return [];
  // De-dupe while preserving order, then reverse so the last-mentioned
  // (usually correct) page is tried first.
  return [...new Set(nums)].reverse();
}

// How many pages past the hinted start page to also render — an annexure
// routinely spills onto a second (or third) page (e.g. RMSCL/DMER's
// "ANNEXURE – I" running pages 14-15: sections 1-3 on page 14, sections
// 4-7 — Bidder Category, Authorized Contact Person, Manufacturing Units,
// Declaration — on page 15), and reading only the hinted page silently
// truncated the template at whatever fit on that one page.
const ANNEXURE_PAGE_LOOKAHEAD = 2;

// A real annexure format — even a short one-row table — reliably comes back
// as more than this once reproduced as styled HTML with its heading
// paragraph. A result shorter than this is almost always a checklist's
// one-line CROSS-REFERENCE to the annexure rather than the annexure itself
// (see resolveAnnexurePages), so it's treated as a miss and the next
// candidate page is tried instead of accepting a near-blank result.
const MIN_TEMPLATE_CONTENT_LENGTH = 400;

/**
 * Renders one candidate page (+ lookahead) and has the vision-capable
 * GEMMA_MODEL read it directly off the images — far more reliable for a
 * table than pdf-parse's flattened text, whose row/column structure isn't
 * recoverable once flattened. Rendered small (110 DPI, JPEG) — an earlier
 * 200-DPI PNG attempt got rejected by Ollama as too large a request body.
 */
async function extractOneTemplateFromPageNum(ann, bidDocPath, pageNum) {
  const outDir = bidDocPath.replace(/\.[^.]+$/, '') + `_ann_${ann.id}_p${pageNum}_pages`;
  let imagePaths;
  try {
    imagePaths = await renderPdfPages(bidDocPath, outDir, 200, pageNum, pageNum + ANNEXURE_PAGE_LOOKAHEAD, 110, 'jpg');
  } catch (e) {
    console.warn('[doc-prep] extractOneTemplateFromPageNum render failed:', e.message);
    return null;
  }
  if (!imagePaths.length) return null;

  try {
    const images = imagePaths.map((p) => fs.readFileSync(p).toString('base64'));
    const systemPrompt = `You are an expert at reading Indian government tender document pages directly from images — including their tables — and reproducing them as clean HTML.`;
    const userPrompt = `The attached images show ${imagePaths.length} CONSECUTIVE pages of a tender document, starting at page ${pageNum}. Locate ${ann.annexure_ref} — "${ann.title}" — it starts on the first image.

IMPORTANT: This document/annexure very often continues onto the following image(s) — read ALL of it end-to-end across every image provided, not just the first page. Include every numbered/lettered section, table, and field all the way through to this annexure's own closing signature/declaration block. Stop including content only once you reach a DIFFERENT annexure's heading (e.g. "ANNEXURE – II") or a clearly unrelated document — do not include that next document's content.

IMPORTANT: A different document (e.g. a bidder's checklist) may merely MENTION or CROSS-REFERENCE "${ann.annexure_ref}" in a table row or list item (e.g. a checklist row naming it alongside a page/clause number) — that mention is NOT the annexure itself. Only transcribe the page(s) where ${ann.annexure_ref} is the actual heading/title of the content that follows, with its own full body (fields, table, declaration, signature block). If everything on these images is just such a cross-reference/mention and not the annexure's own body, respond with exactly: NOT_FOUND

Read layout — including any table's rows, columns, and merged header cells — directly from what you SEE in the images. Do not guess column boundaries from memory of similar forms; transcribe exactly what is printed. If ${ann.annexure_ref} is not on any of these images, respond with exactly: NOT_FOUND

${templateHtmlRules(ann)}`;

    const raw = await callOllama(systemPrompt, userPrompt, 0.05, 16000, GEMMA_MODEL, images);
    return parseTemplateResponse(ann, raw);
  } finally {
    try { fs.rmSync(outDir, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
  }
}

/**
 * Vision-based counterpart to extractOneTemplate: tries every page number
 * mentioned in discovery's page_hint (see resolveAnnexurePages), most-likely
 * page first, and keeps the first result that looks like a real extraction
 * rather than a thin cross-reference. Falls back to null (caller retries
 * with extractOneTemplate, the text-based path) if no candidate page can be
 * located/rendered, or every candidate comes back thin/NOT_FOUND.
 */
async function extractOneTemplateFromPage(ann, bidDocPath) {
  const pages = resolveAnnexurePages(ann);
  if (!pages.length) return null;

  let best = null;
  for (const pageNum of pages) {
    const result = await extractOneTemplateFromPageNum(ann, bidDocPath, pageNum);
    if (result && result.verbatim_content.length >= MIN_TEMPLATE_CONTENT_LENGTH) {
      return result; // good enough — stop here
    }
    if (result && (!best || result.verbatim_content.length > best.verbatim_content.length)) {
      best = result; // keep the longest thin result in case every page is thin
    }
  }
  return best;
}

/** The static company-field mapping shared by fillTemplate and the field-review popup. */
function staticFieldMap(company, bidNo) {
  return {
    company_name:       company.company_name,
    address:            company.address,
    gstin:              company.gstin,
    pan:                company.pan,
    cin:                company.cin,
    authorized_signatory: company.authorized_person,
    designation:        company.designation,
    email:              company.email,
    contact_number:     company.phone,
    bank_name:          company.bank_name,
    bank_account:       company.bank_account_no,
    bank_ifsc:          company.bank_ifsc,
    tender_reference:   bidNo,
    // Regulatory/certificate facts — same company-wide value every tender,
    // so once filled in once (via meril_company.json / meril_endo_company.json)
    // they auto-fill on every annexure that asks for them, the same way
    // gstin/pan/cin already do.
    drug_license_no:                 company.drug_license_no,
    drug_license_validity:           company.drug_license_validity,
    schedule_m_compliance_date:      company.schedule_m_compliance_date,
    non_conviction_certificate_date: company.non_conviction_certificate_date,
    market_standing_certificate_date: company.market_standing_certificate_date,
    manufacturing_license_no:        company.manufacturing_license_no,
    who_gmp_certificate_no:          company.who_gmp_certificate_no,
    iso_certificate_no:              company.iso_certificate_no,
  };
}

/** "authorized_signatory" -> "Authorized Signatory"; "other_scheme_name" -> "Scheme Name". */
function humanizeFieldKey(key) {
  return key.replace(/^other_/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * POST /api/doc-prep/:bidNo/extract-template
 * Body: { annexure_id, page? }
 * On-demand counterpart to the old up-front batch extraction: pulls the
 * verbatim template for ONE has_prescribed_format annexure, the moment the
 * user clicks Auto Fill on it, saves it into the session's `formats`, and
 * returns every [FILL:*] field it needs — pre-filled from prior answers
 * remembered for this department, then the department's company profile,
 * then sensible defaults — for the user to review before generating.
 *
 * `page` is an optional manual override: when the automatic page_hint
 * candidates all come back thin/wrong (a future tender's discovery step
 * points at the wrong page, or has no page_hint at all), the user can look
 * at the bid document themselves, see which page the format is actually
 * printed on, and re-run extraction targeted at exactly that page — without
 * re-running the whole tender analysis. See resolveAnnexurePages' doc
 * comment for why the automatic guess can be wrong in the first place.
 */
exports.extractTemplate = async (req, res) => {
  const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  const { annexure_id, page } = req.body;
  if (!annexure_id) return res.status(400).json({ success: false, message: 'annexure_id is required' });
  const manualPage = page ? parseInt(page, 10) : null;

  try {
    const [rows] = await db.query(
      `SELECT bid_doc_path, additional_docs, annexures, formats FROM doc_prep_sessions WHERE bid_no = ? LIMIT 1`,
      [bidNo]
    );
    if (!rows.length || !rows[0].bid_doc_path) {
      return res.status(400).json({ success: false, message: 'No bid document on file.' });
    }

    const annexures = parseCol(rows[0].annexures) || [];
    const ann = annexures.find(a => a.id === annexure_id);
    if (!ann) return res.status(404).json({ success: false, message: 'Annexure not found' });
    if (!ann.has_prescribed_format) {
      return res.status(400).json({ success: false, message: 'This item has no prescribed format to extract.' });
    }

    let extracted = null;
    if (manualPage) {
      // User-specified page — bypass page_hint entirely and trust them.
      try {
        extracted = await extractOneTemplateFromPageNum(ann, rows[0].bid_doc_path, manualPage);
      } catch (e) {
        console.warn(`[doc-prep] manual-page extraction failed for ${ann.annexure_ref} p.${manualPage}:`, e.message);
      }
      if (!extracted) {
        return res.status(404).json({ success: false, message: `${ann.annexure_ref} was not found on page ${manualPage} (or the page(s) after it). Double-check the page number and try again.` });
      }
    } else {
      // Vision first: we already know which page the format is on (discovery's
      // own page_hint), so render just that page and have the vision-capable
      // model read the table off the image directly — far more reliable than
      // reconstructing a table's structure from pdf-parse's flattened text.
      // Falls back to text-based extraction only if the page can't be located
      // or rendered (e.g. no usable page_hint, non-PDF bid doc).
      try {
        extracted = await extractOneTemplateFromPage(ann, rows[0].bid_doc_path);
      } catch (e) {
        console.warn(`[doc-prep] vision extraction failed for ${ann.annexure_ref}, falling back to text:`, e.message);
      }
      if (!extracted) {
        const additionalDocs = parseCol(rows[0].additional_docs) || [];
        const { combinedText } = await buildCombinedText(rows[0].bid_doc_path, additionalDocs);
        extracted = await extractOneTemplate(ann, combinedText);
      }
      if (!extracted) {
        return res.status(404).json({ success: false, message: `Could not locate ${ann.annexure_ref} in the tender text.` });
      }
    }

    // Flag a suspiciously short result instead of silently saving it as if it
    // were a normal success — this is exactly what a wrong-page extraction
    // looks like (see MIN_TEMPLATE_CONTENT_LENGTH), and the frontend uses
    // this to prompt "specify the correct page" rather than the user only
    // noticing once they see near-empty fields in the review popup.
    const thin = extracted.verbatim_content.length < MIN_TEMPLATE_CONTENT_LENGTH;

    const formats = parseCol(rows[0].formats) || [];
    const next = [...formats.filter(f => f.id !== annexure_id), extracted];
    await db.query(`UPDATE doc_prep_sessions SET formats = ? WHERE bid_no = ?`, [JSON.stringify(next), bidNo]);

    // ── Build the field list from the [FILL:*] markers just extracted ──────
    const division = (await getTenderDept(bidNo)) === 'Endo' ? 'Endo' : 'Diagno';
    const company  = getCompanyProfile(division);
    const statics  = staticFieldMap(company, bidNo);

    const [memRows] = await db.query(
      `SELECT field_key, field_value FROM doc_prep_field_memory WHERE department = ?`, [division]
    );
    const memory = Object.fromEntries(memRows.map(r => [r.field_key, r.field_value]));

    const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    const place = company.place || 'Vapi, Gujarat';
    const defaults = { date: today, place };

    const keys = [...new Set([...extracted.verbatim_content.matchAll(/\[FILL:([a-zA-Z0-9_]+)\]/g)].map(m => m[1]))];
    const fields = keys.map(key => ({
      key,
      label: humanizeFieldKey(key),
      value: memory[key] ?? statics[key] ?? defaults[key] ?? '',
    }));

    return res.json({ success: true, format: extracted, division, fields, thin });
  } catch (err) {
    console.error('[doc-prep] extractTemplate:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

async function runAnalysis(bidNo, bidDocPath, additionalDocs = []) {
  const docCount = 1 + additionalDocs.length;

  // ── Extract text from all documents ──────────────────────────────────────
  await setLog(bidNo, `Extracting text from bid document${additionalDocs.length ? ` + ${additionalDocs.length} additional doc(s)` : ''}…`);

  const { combinedText, multiDocNote } = await buildCombinedText(
    bidDocPath, additionalDocs, (msg) => { setLog(bidNo, msg).catch(() => {}); }
  );

  // ── Step 1: Discover all annexures / formats ──────────────────────────────
  await setLog(bidNo, `Discovering annexures and formats (${GEMMA_MODEL})…`);
  const discoverySystemPrompt = `You are an expert at reading Indian government tender documents and cataloguing every submission item they require.`;
  const discoveryPrompt = `${multiDocNote}Analyze this Indian government tender document and find EVERY item that requires a submission:
- Annexures (Annexure A, Annexure I, Form-1, etc.)
- Affidavits, Declarations, Undertakings, Authorization letters
- Agreements, Checklists, Technical / Financial / Sample submission formats

ALSO — separately from the submission items above — look for the tender's OWN document checklist
page: a page the tender itself provides listing every document the bidder must upload, usually with
a "Page No." or "Yes/No" column, commonly titled "CHECK LIST OF THE TENDER DOCUMENTS", "Checklist of
Documents", "List of Documents to be Uploaded", or similar (this is DIFFERENT from a Checklist-type
ANNEXURE the bidder fills and submits back — this is the tender's own reference table of what to
submit). If such a page exists, you MUST include it as its own item — the FIRST object in the
returned array — with: "id": "ann_checklist", "annexure_ref": "Checklist", "title": "Checklist of
Tender Documents", "type": "tender_checklist", "category": "letter", "doc_group": "annexure",
"dept": "tender_admin", "mandatory": true, "has_prescribed_format": true, and its own accurate
"page_hint". If no such page exists anywhere in the document, simply omit this item.

For EACH item assign:
1. "type" — one of: affidavit | declaration | undertaking | authorization | agreement | checklist | financial | technical | sample_submission | other
2. "category" — one of: letter | certificate
3. "dept" — one of: financial | tender_admin | technical | legal | hr | other
4. "mandatory" — true/false
5. "has_prescribed_format" — true if the tender provides a filled-in template / format page for this item
6. "doc_group" — one of: annexure | license | certificate
   - "annexure": a numbered/lettered annexure, form, or schedule referenced by the tender
     (e.g. "Annexure I", "Form-1", "Schedule B") — the primary bucket.
   - "license": a statutory license/registration the BIDDER must already hold and submit proof
     of (drug license, manufacturing license, import license, trade license, GST/PAN registration, etc.)
   - "certificate": a standalone certificate that is NOT itself a numbered annexure
     (ISO/CE/BIS certificate, experience certificate, turnover certificate, etc.)
   Most items are "annexure". Only use "license"/"certificate" for items that are genuinely
   just a supporting proof/certificate, not a tender-numbered format the bidder must fill out.
7. "annexure_ref" — the annexure/form/schedule number or letter EXACTLY as printed in the tender
   (e.g. "Annexure I", "Form-1"). If the tender does NOT give this item a formal number/letter,
   do NOT leave this blank — instead set it to a short descriptive label based on where it appears
   in the document, e.g. "Section D-2(i) Requirement" or "Checklist Item 17", so every item still
   has a usable title.

Return ONLY this JSON array (no markdown, no explanation):
[
  {
    "id": "ann_1",
    "annexure_ref": "Annexure A",
    "title": "Manufacturer Authorization Certificate",
    "type": "authorization",
    "category": "certificate",
    "doc_group": "annexure",
    "dept": "tender_admin",
    "mandatory": true,
    "has_prescribed_format": true,
    "page_hint": "approximate section or page reference"
  }
]

Tender document text:
${combinedText}`;

  // This single call is the whole analysis's point of failure — no per-page
  // isolation like OCR has — so it gets more attempts and a longer timeout
  // than the default (combinedText can run up to 260k chars).
  const rawDiscovery = await callOllama(discoverySystemPrompt, discoveryPrompt, 0.05, 12000, GEMMA_MODEL);
  let annexures;
  try {
    annexures = parseJsonResponse(rawDiscovery);
    if (!Array.isArray(annexures)) annexures = [];
  } catch {
    annexures = [];
  }

  // Auto-suggest Stamp Paper / Affidavit for items the discovery step itself
  // typed as "affidavit" — a strong signal it needs physical stamp paper +
  // wet signature/notarization, not Meril's letterhead. This is only a
  // starting default: the user can toggle it on/off per-item afterward
  // (updateAnnexure), and declaration/undertaking are deliberately left off
  // by default since they don't as reliably require stamp paper.
  annexures = annexures.map(a => (
    a.type === 'affidavit'
      ? { ...a, requires_stamp_paper: true, stamp_status: 'pending' }
      : a
  ));

  // The tender's own document checklist (type: 'tender_checklist') always
  // leads the Annexure Generator listing, whether or not the model happened
  // to place it first in its own output.
  const checklistIdx = annexures.findIndex(a => a.type === 'tender_checklist');
  if (checklistIdx > 0) {
    const [checklistItem] = annexures.splice(checklistIdx, 1);
    annexures.unshift(checklistItem);
  }

  // Verbatim template extraction for has_prescribed_format items no longer
  // runs here — it happens on demand (per-annexure) when the user actually
  // clicks Auto Fill, so `formats` starts empty. has_prescribed_format is
  // still discovered above; that flag alone is what the Auto Fill button
  // uses to know a prescribed format exists to extract.
  const formats = [];

  await db.query(
    `UPDATE doc_prep_sessions SET annexures = ?, processing_log = ? WHERE bid_no = ?`,
    [JSON.stringify(annexures), `Found ${annexures.length} annexures.`, bidNo]
  );

  // ── Step 1b: Auto-populate the Checklist tab from the tender's own
  //    checklist page (found above as the "tender_checklist" item), so
  //    every tender gets a working Checklist without the user having to
  //    upload anything by hand. Best-effort — a render/vision failure here
  //    must never fail the whole analysis; the user can still use "Sync
  //    from Annexures" or "Upload Checklist Document" manually afterward.
  const checklistItem = annexures.find(a => a.type === 'tender_checklist');
  if (checklistItem) {
    // The checklist's own page_hint is a page RANGE (e.g. "Page 8-13"), not a
    // cross-reference pair like an annexure's — its first number is where the
    // checklist starts, so take the first number rather than resolveAnnexurePages'
    // last-first order (which is tuned for annexure hints like "Page 10, 70").
    const pageNums = [...(checklistItem.page_hint || '').matchAll(/(\d+)/g)].map(m => parseInt(m[1], 10));
    const pageNum = pageNums[0] || null;
    if (pageNum) {
      let outDir;
      try {
        await setLog(bidNo, `Reading the tender's own checklist (page ${pageNum})…`);
        outDir = bidDocPath.replace(/\.[^.]+$/, '') + `_ann_${checklistItem.id}_pages`;
        const imagePaths = await renderPdfPages(bidDocPath, outDir, 200, pageNum, pageNum + ANNEXURE_PAGE_LOOKAHEAD, 130, 'jpg');
        if (imagePaths.length) {
          const images = imagePaths.map(p => fs.readFileSync(p).toString('base64'));
          const newRows = await extractChecklistRowsFromImages(images, 'tender_checklist');
          if (newRows.length) {
            await ensureTable();
            const next = recomputeChecklistRows(newRows, []);
            await db.query(`UPDATE doc_prep_sessions SET checklist = ? WHERE bid_no = ?`, [JSON.stringify(next), bidNo]);
          }
        }
      } catch (e) {
        console.warn('[doc-prep] auto checklist extraction failed:', e.message);
      } finally {
        if (outDir) { try { fs.rmSync(outDir, { recursive: true, force: true }); } catch { /* best effort */ } }
      }
    }
  }

  // ── Step 2: Match "no prescribed format" items against the AI Drive ──────
  const noFormatCount = annexures.filter(a => !a.has_prescribed_format).length;
  if (noFormatCount) {
    await setLog(bidNo, `Checking AI Drive for ${noFormatCount} document(s) with no prescribed format…`);
  }
  const driveMatches = await matchDriveForSession(bidNo, annexures);

  // 3. Save results
  await db.query(
    `UPDATE doc_prep_sessions
     SET status = 'done', annexures = ?, formats = ?, filled_templates = '{}', processing_log = ?
     WHERE bid_no = ?`,
    [
      JSON.stringify(annexures),
      JSON.stringify(formats),
      `Done — ${annexures.length} annexures found, ${Object.keys(driveMatches).length} matched from AI Drive. (${docCount} doc${docCount > 1 ? 's' : ''} analysed)`,
      bidNo,
    ]
  );
}

/**
 * POST /api/doc-prep/:bidNo/fill-template
 * Body: { annexure_id, verbatim_content }
 */
exports.fillTemplate = async (req, res) => {
  const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  const { annexure_id, verbatim_content } = req.body;
  if (!verbatim_content) return res.status(400).json({ success: false, message: 'verbatim_content is required' });

  try {
    const division = (await getTenderDept(bidNo)) === 'Endo' ? 'Endo' : 'Diagno';
    const company  = getCompanyProfile(division);

    // Pass 1 — static fill of known fields
    const staticMap = staticFieldMap(company, bidNo);
    let prefilled = verbatim_content;
    for (const [key, value] of Object.entries(staticMap)) {
      if (value) prefilled = prefilled.split(`[FILL:${key}]`).join(value);
    }

    // Pass 2 — Claude CLI fills remaining [FILL:*] markers contextually
    const today   = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    const place   = company.place || 'Vapi, Gujarat';
    const fillPrompt = `Fill this tender document template for ${company.company_name}.

Replace any remaining [FILL:*] markers with suitable values:
- [FILL:date] → ${today}
- [FILL:place] → ${place}
- Any other [FILL:*] → infer from context or company details below.

Company details:
${JSON.stringify(company, null, 2)}

Template:
${prefilled}

Return ONLY the filled text. No explanation. No markdown. Preserve every character, punctuation mark, and line break exactly.`;

    const filled = await callClaude(fillPrompt);
    return res.json({ success: true, filled_content: filled.trim(), annexure_id });

  } catch (err) {
    console.error('[doc-prep] fillTemplate:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/doc-prep/:bidNo/save-filled
 * Body: { annexure_id, filled_content }
 */
exports.saveFilledTemplate = async (req, res) => {
  const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  const { annexure_id, filled_content } = req.body;
  if (!annexure_id || !filled_content) {
    return res.status(400).json({ success: false, message: 'annexure_id and filled_content are required' });
  }
  try {
    const [rows] = await db.query(
      `SELECT filled_templates FROM doc_prep_sessions WHERE bid_no = ? LIMIT 1`,
      [bidNo]
    );
    const existing = parseCol(rows[0]?.filled_templates) || {};
    existing[annexure_id] = filled_content;
    await db.query(
      `UPDATE doc_prep_sessions SET filled_templates = ? WHERE bid_no = ?`,
      [JSON.stringify(existing), bidNo]
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('[doc-prep] saveFilledTemplate:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/doc-prep/:bidNo/generate-annexure
 * Body: { annexure_id, fields: { key: value, ... } }
 *
 * The user-reviewed counterpart to the old AI-guesses-the-rest fillTemplate:
 * every [FILL:*] marker was already surfaced to the user by extractTemplate,
 * so this does a plain deterministic substitution — no AI call, nothing left
 * to guess. Also remembers every submitted value per department so the next
 * tender in the same department comes pre-filled.
 */
exports.generateAnnexure = async (req, res) => {
  const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  const { annexure_id, fields } = req.body;
  if (!annexure_id || !fields || typeof fields !== 'object') {
    return res.status(400).json({ success: false, message: 'annexure_id and fields are required' });
  }

  try {
    const [rows] = await db.query(
      `SELECT formats, filled_templates FROM doc_prep_sessions WHERE bid_no = ? LIMIT 1`,
      [bidNo]
    );
    const formats = parseCol(rows[0]?.formats) || [];
    const fmt = formats.find(f => f.id === annexure_id);
    if (!fmt) return res.status(404).json({ success: false, message: 'Template not found — extract it first.' });

    let filled_content = fmt.verbatim_content;
    for (const [key, value] of Object.entries(fields)) {
      // The template is HTML now, so a value containing &, < or > must be
      // escaped or it would corrupt the surrounding markup.
      const safeValue = fmt.is_html ? escapeXmlText(value ?? '') : (value ?? '');
      filled_content = filled_content.split(`[FILL:${key}]`).join(safeValue);
    }

    const existing = parseCol(rows[0]?.filled_templates) || {};
    existing[annexure_id] = filled_content;
    await db.query(
      `UPDATE doc_prep_sessions SET filled_templates = ? WHERE bid_no = ?`,
      [JSON.stringify(existing), bidNo]
    );

    const division = (await getTenderDept(bidNo)) === 'Endo' ? 'Endo' : 'Diagno';
    const memRows = Object.entries(fields).map(([key, value]) => [division, key, value ?? '']);
    if (memRows.length) {
      await db.query(
        `INSERT INTO doc_prep_field_memory (department, field_key, field_value) VALUES ?
         ON DUPLICATE KEY UPDATE field_value = VALUES(field_value)`,
        [memRows]
      );
    }

    // Already real HTML from the extraction step — running it through the
    // plain-text converter again would escape its own tags into visible text.
    const html_content = fmt.is_html ? filled_content : contentToHtml(filled_content);
    return res.json({
      success: true, filled_content, html_content, division,
      annexure_ref: fmt.annexure_ref, annexure_id,
    });
  } catch (err) {
    console.error('[doc-prep] generateAnnexure:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/doc-prep/:bidNo/assign-extracted
 * After a ZIP is uploaded, the user assigns each extracted file a role.
 * Body: { bid_doc_path: string, additional_files: [{path, name, label}] }
 */
exports.assignExtractedFiles = async (req, res) => {
  const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  const { bid_doc_path, additional_files = [] } = req.body;
  if (!bid_doc_path) return res.status(400).json({ success: false, message: 'bid_doc_path is required' });
  try {
    await ensureTable();

    const additionalDocs = additional_files.map((f, i) => ({
      id:        `ext_${Date.now()}_${i}`,
      name:      f.name || path.basename(f.path),
      path:      f.path,
      doc_label: (f.label || 'Additional').trim(),
      source:    'upload',
    }));

    await db.query(
      `UPDATE doc_prep_sessions
       SET bid_doc_path = ?, additional_docs = ?, status = 'idle',
           processing_log = NULL, extracted_files = NULL
       WHERE bid_no = ?`,
      [bid_doc_path, JSON.stringify(additionalDocs), bidNo]
    );

    return res.json({ success: true, message: 'Files assigned successfully' });
  } catch (err) {
    console.error('[doc-prep] assignExtractedFiles:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/doc-prep/:bidNo/upload-additional
 * Body: multipart file + doc_label (e.g. "ATC")
 */
exports.uploadAdditionalDoc = async (req, res) => {
  const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  const docLabel = (req.body.doc_label || 'Additional').trim();
  try {
    await ensureTable();
    const [rows] = await db.query(
      `SELECT additional_docs FROM doc_prep_sessions WHERE bid_no = ? LIMIT 1`,
      [bidNo]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Session not found. Load the Doc Prep tab first.' });
    }
    const existing = parseCol(rows[0].additional_docs) || [];
    const newDoc = {
      id:        `adoc_${Date.now()}_${Math.round(Math.random() * 1e5)}`,
      name:      req.file.originalname,
      path:      req.file.path,
      doc_label: docLabel,
      source:    'manual',
    };
    existing.push(newDoc);
    await db.query(
      `UPDATE doc_prep_sessions SET additional_docs = ?, status = 'idle' WHERE bid_no = ?`,
      [JSON.stringify(existing), bidNo]
    );
    return res.json({ success: true, data: newDoc, additional_docs: existing });
  } catch (err) {
    console.error('[doc-prep] uploadAdditionalDoc:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * DELETE /api/doc-prep/:bidNo/additional/:docId
 */
exports.deleteAdditionalDoc = async (req, res) => {
  if (req.user.role !== 'Admin' && req.user.role !== 'Tender Admin' && req.user.role !== 'Office Administrator') {
    return res.status(403).json({ success: false, message: 'Only Admins and Tender Admins can delete documents' });
  }
  const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  const docId = req.params.docId;
  try {
    const [rows] = await db.query(
      `SELECT additional_docs FROM doc_prep_sessions WHERE bid_no = ? LIMIT 1`,
      [bidNo]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Session not found' });
    let docs = parseCol(rows[0].additional_docs) || [];
    const target = docs.find(d => d.id === docId);
    if (target) {
      try { fs.unlinkSync(target.path); } catch { /* already gone */ }
      docs = docs.filter(d => d.id !== docId);
      await db.query(
        `UPDATE doc_prep_sessions SET additional_docs = ?, status = 'idle' WHERE bid_no = ?`,
        [JSON.stringify(docs), bidNo]
      );
    }
    return res.json({ success: true, additional_docs: docs });
  } catch (err) {
    console.error('[doc-prep] deleteAdditionalDoc:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/doc-prep/:bidNo/upload-document
 * Body: multipart file + name (defaults to the file's own name) + description (optional)
 * User-supplied reference documents (any file type) shown as their own read-only
 * cards next to the AI-discovered annexures — not fed into analysis, no Draft/
 * Generate actions, just stored and downloadable.
 */
exports.uploadUserDocument = async (req, res) => {
  const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  const name        = (req.body.name || req.file.originalname || 'Document').trim();
  const description = (req.body.description || '').trim();
  // Set when this upload is the PDF pushed from a Doc Prep annexure ("Push to
  // My Docs" / AI Drive push), or added via a specific annexure category
  // section's own "Add Document" button — lets My Documents trace a deleted
  // upload back to the annexure/section it came from (annexure_id resets that
  // annexure's Auto Fill availability; category tags which section it's under).
  const annexureId  = (req.body.annexure_id || '').trim() || null;
  const category     = (req.body.category || '').trim() || null;
  const pushSource   = (req.body.push_source || '').trim() || null;
  // True only for the combined-PDF output of My Documents' "Merge File" —
  // the "Uploaded" tab there shows merge results only, not every
  // individually-added file, so this is what that filter checks.
  const isMerged     = req.body.is_merged === 'true';
  // Anything added through Doc Prep's own "Add Document" (a section header,
  // or its flat "Uploaded Documents" list) stages here first — it does NOT
  // show up in the workspace's My Documents tab until explicitly selected
  // and pushed there. Uploads from My Documents' own "Add Document" never
  // send this, so they stay immediately visible as before.
  const stageOnly    = req.body.stage_only === 'true';
  // Which source document each page range of a merged PDF came from — set
  // by "Merge to PDF" and kept up to date by the merged-document page
  // editor — lets the checklist stay accurate after pages are reordered or
  // removed without knowing anything about PDF internals itself.
  let pageMap = null;
  if (req.body.page_map) {
    try { pageMap = JSON.parse(req.body.page_map); if (!Array.isArray(pageMap)) pageMap = null; } catch { pageMap = null; }
  }
  try {
    await ensureTable();
    const [rows] = await db.query(
      `SELECT uploaded_docs FROM doc_prep_sessions WHERE bid_no = ? LIMIT 1`,
      [bidNo]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Session not found. Load the Doc Prep tab first.' });
    }
    const existing = parseCol(rows[0].uploaded_docs) || [];

    // My Documents is PDF-only — a Word/Excel/PPT upload (including a
    // stamp-paper signed scan saved as .docx) is converted here, once, at
    // upload time, so every stored file (and the "View" blob it opens) is
    // always a real PDF. The original is discarded once conversion succeeds;
    // if conversion fails, the original is kept rather than losing the file.
    let storedPath     = req.file.path;
    let storedFileName = req.file.originalname;
    let storedName      = name;
    if (!isAlreadyPdf(storedPath) && isConvertible(storedPath)) {
      try {
        const pdfBuf = await convertToPdf(storedPath);
        const pdfPath = storedPath.slice(0, -path.extname(storedPath).length) + '.pdf';
        fs.writeFileSync(pdfPath, pdfBuf);
        fs.unlinkSync(storedPath);
        storedPath = pdfPath;
        const origExt = path.extname(storedFileName);
        storedFileName = (origExt ? storedFileName.slice(0, -origExt.length) : storedFileName) + '.pdf';
        const nameExt = path.extname(storedName);
        if (nameExt && CONVERT_SOURCE_EXTS.has(nameExt.toLowerCase())) {
          storedName = storedName.slice(0, -nameExt.length) + '.pdf';
        }
      } catch (convErr) {
        console.error('[doc-prep] uploadUserDocument PDF conversion failed, keeping original file:', convErr.message);
      }
    }

    // Re-uploading a signed stamp-paper scan (or "Replace Signed Copy")
    // replaces the previous copy for this annexure rather than stacking a
    // new row alongside it — only one signed copy should ever exist per
    // annexure. Old file on disk is removed once the new one has replaced it.
    let uploadedDocs = existing;
    if (pushSource === 'stamp_signed' && annexureId) {
      const prior = uploadedDocs.filter(d => d.annexure_id === annexureId && d.push_source === pushSource);
      for (const p of prior) {
        try { if (p.path && fs.existsSync(p.path)) fs.unlinkSync(p.path); } catch { /* best effort */ }
      }
      uploadedDocs = uploadedDocs.filter(d => !(d.annexure_id === annexureId && d.push_source === pushSource));
    }

    // The regenerated, page-number-filled checklist document REPLACES
    // whatever previously represented this annexure in My Documents —
    // regardless of how that got there (the original blank "Push to My
    // Docs" copy, an earlier regenerate, etc.) — since only one checklist
    // document should ever exist at a time. Without matching on annexure_id
    // alone (not also push_source), the old blank copy stuck around
    // alongside the new filled one and a merge could pick up either/both.
    if (pushSource === 'checklist_filled' && annexureId) {
      const prior = uploadedDocs.filter(d => d.annexure_id === annexureId);
      for (const p of prior) {
        try { if (p.path && fs.existsSync(p.path)) fs.unlinkSync(p.path); } catch { /* best effort */ }
      }
      uploadedDocs = uploadedDocs.filter(d => d.annexure_id !== annexureId);
    }

    // A fresh "Merge to PDF" run REPLACES the previous merged output rather
    // than stacking another copy in the Uploaded tab every time the user
    // re-merges (e.g. after reordering) — only one current merged file
    // should exist at a time.
    if (isMerged) {
      const prior = uploadedDocs.filter(d => d.is_merged);
      for (const p of prior) {
        try { if (p.path && fs.existsSync(p.path)) fs.unlinkSync(p.path); } catch { /* best effort */ }
      }
      uploadedDocs = uploadedDocs.filter(d => !d.is_merged);
    }

    // Cached once here so the checklist's page-range recompute (run on every
    // My Documents reorder) never has to re-parse a PDF just to count pages.
    let pageCount = null;
    try { pageCount = (await pdfParse(fs.readFileSync(storedPath))).numpages || null; } catch { /* best effort */ }

    const newDoc = {
      id:          `udoc_${Date.now()}_${Math.round(Math.random() * 1e5)}`,
      name:        storedName,
      description,
      file_name:   storedFileName,
      path:        storedPath,
      uploaded_at: new Date().toISOString(),
      annexure_id: annexureId,
      category,
      push_source: pushSource,
      is_merged: isMerged,
      pages: pageCount,
      page_map: pageMap,
      pushed_to_mydocs: !stageOnly,
    };
    uploadedDocs.push(newDoc);

    // Stamp Paper / Affidavit: this upload IS the physically signed/stamped/
    // notarized scan going back onto its annexure — mark that annexure
    // "uploaded" and link it, in the same request, rather than a second
    // round trip via updateAnnexure.
    let annexuresOut;
    if (pushSource === 'stamp_signed' && annexureId) {
      const [annRows] = await db.query(
        `SELECT annexures FROM doc_prep_sessions WHERE bid_no = ? LIMIT 1`,
        [bidNo]
      );
      const annexures = parseCol(annRows[0]?.annexures) || [];
      const idx = annexures.findIndex(a => a.id === annexureId);
      if (idx !== -1) {
        annexures[idx].stamp_status = 'uploaded';
        annexures[idx].stamp_uploaded_doc_id = newDoc.id;
        annexuresOut = annexures;
      }
    }

    // A genuine new upload for an item that also has an AI Drive match
    // REPLACES that match — the user is supplying their own file instead,
    // so the stale "Found in AI Drive" suggestion shouldn't linger alongside
    // it. Not cleared for push_source 'drive' or 'stamp_signed': those ARE
    // the drive match being saved/signed, not a replacement of it.
    let driveMatchesOut = null;
    if (annexureId && pushSource !== 'drive' && pushSource !== 'stamp_signed') {
      const [[dmRow]] = await db.query(`SELECT drive_matches FROM doc_prep_sessions WHERE bid_no = ? LIMIT 1`, [bidNo]);
      const driveMatches = parseCol(dmRow?.drive_matches) || {};
      if (driveMatches[annexureId]) {
        delete driveMatches[annexureId];
        driveMatchesOut = driveMatches;
      }
    }

    if (annexuresOut || driveMatchesOut) {
      const sets = ['uploaded_docs = ?'];
      const params = [JSON.stringify(uploadedDocs)];
      if (annexuresOut) { sets.push('annexures = ?'); params.push(JSON.stringify(annexuresOut)); }
      if (driveMatchesOut) { sets.push('drive_matches = ?'); params.push(JSON.stringify(driveMatchesOut)); }
      params.push(bidNo);
      await db.query(`UPDATE doc_prep_sessions SET ${sets.join(', ')} WHERE bid_no = ?`, params);
    } else {
      await db.query(
        `UPDATE doc_prep_sessions SET uploaded_docs = ? WHERE bid_no = ?`,
        [JSON.stringify(uploadedDocs), bidNo]
      );
    }
    return res.json({ success: true, data: newDoc, uploaded_docs: uploadedDocs, annexures: annexuresOut, drive_matches: driveMatchesOut });
  } catch (err) {
    console.error('[doc-prep] uploadUserDocument:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * DELETE /api/doc-prep/:bidNo/drive-match/:annexureId
 * "Cut" on a Found-in-AI-Drive chip — detaches that suggestion from this
 * annexure without touching the document itself in AI Drive/Company Drive,
 * so the row goes back to needing a manual upload.
 */
exports.removeDriveMatch = async (req, res) => {
  const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  const { annexureId } = req.params;
  try {
    const [[row]] = await db.query(`SELECT drive_matches FROM doc_prep_sessions WHERE bid_no = ? LIMIT 1`, [bidNo]);
    if (!row) return res.status(404).json({ success: false, message: 'Session not found' });
    const driveMatches = parseCol(row.drive_matches) || {};
    delete driveMatches[annexureId];
    await db.query(`UPDATE doc_prep_sessions SET drive_matches = ? WHERE bid_no = ?`, [JSON.stringify(driveMatches), bidNo]);
    return res.json({ success: true, drive_matches: driveMatches });
  } catch (err) {
    console.error('[doc-prep] removeDriveMatch:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/doc-prep/:bidNo/import-from-library
 * Body: { fileIds: [libraryItemId, ...] }
/** Recursively resolves the folder trail back to root for a library folder id. */
async function getLibraryBreadcrumb(parentId) {
  let cursor = parentId;
  const trail = [];
  while (cursor) {
    try {
      const [[row]] = await db.query(`SELECT id, name, parent_id FROM library_items WHERE id = ?`, [cursor]);
      if (!row) break;
      trail.unshift({ id: row.id, name: row.name });
      cursor = row.parent_id;
    } catch (e) {
      break;
    }
  }
  return trail;
}

/**
 * POST /api/doc-prep/:bidNo/import-from-library
 * Copies the picked Library files into this tender's uploaded_docs (same
 * shape/behaviour as a direct upload) so they show up in My Documents and
 * are included in the ZIP — copied rather than referenced so deleting the
 * Library original later can't break this tender's document set.
 */
exports.importFromLibrary = async (req, res) => {
  const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  const fileIds = Array.isArray(req.body.fileIds) ? req.body.fileIds.map(Number).filter(Boolean) : [];
  const category = (req.body.category || '').trim() || null;
  const annexureId = (req.body.annexure_id || '').trim() || null;
  const stageOnly = req.body.stage_only === true || req.body.stage_only === 'true';
  if (!fileIds.length) return res.status(400).json({ success: false, message: 'No files selected' });
  try {
    await ensureTable();
    const [rows] = await db.query(
      `SELECT uploaded_docs FROM doc_prep_sessions WHERE bid_no = ? LIMIT 1`,
      [bidNo]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Session not found. Load the Doc Prep tab first.' });
    }
    const existing = parseCol(rows[0].uploaded_docs) || [];

    const [libFiles] = await db.query(
      `SELECT id, name, file_path, parent_id FROM library_items WHERE id IN (?) AND type = 'file'`,
      [fileIds]
    );

    const safe = bidNo.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const destDir = path.join(__dirname, '../../uploads/doc-prep', safe);
    fs.mkdirSync(destDir, { recursive: true });

    const added = [];
    for (const lib of libFiles) {
      if (!lib.file_path || !fs.existsSync(lib.file_path)) continue;
      const ext = path.extname(lib.file_path) || path.extname(lib.name) || '.bin';
      let destPath = path.join(destDir, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
      fs.copyFileSync(lib.file_path, destPath);

      // My Documents is PDF-only — convert a Word/Excel/PPT library file to
      // PDF the same way a direct upload is, so it stays consistent whether
      // it arrived via upload or via Library import.
      let libName = lib.name;
      if (!isAlreadyPdf(destPath) && isConvertible(destPath)) {
        try {
          const pdfBuf = await convertToPdf(destPath);
          const pdfPath = destPath.slice(0, -path.extname(destPath).length) + '.pdf';
          fs.writeFileSync(pdfPath, pdfBuf);
          fs.unlinkSync(destPath);
          destPath = pdfPath;
          const nameExt = path.extname(libName);
          if (nameExt && CONVERT_SOURCE_EXTS.has(nameExt.toLowerCase())) {
            libName = libName.slice(0, -nameExt.length) + '.pdf';
          }
        } catch (convErr) {
          console.error('[doc-prep] importFromLibrary PDF conversion failed, keeping original file:', convErr.message);
        }
      }

      const trail = await getLibraryBreadcrumb(lib.parent_id);
      const pathSegments = ['Library', ...trail.map(t => t.name), lib.name];
      const libraryPath = pathSegments.join(' / ');
      const libraryFolderPath = ['Library', ...trail.map(t => t.name)].join(' / ');

      let libPageCount = null;
      try { libPageCount = (await pdfParse(fs.readFileSync(destPath))).numpages || null; } catch { /* best effort */ }

      const newDoc = {
        id:                  `udoc_${Date.now()}_${Math.round(Math.random() * 1e5)}`,
        name:                libName,
        description:         '',
        file_name:           libName,
        path:                destPath,
        pages:               libPageCount,
        uploaded_at:         new Date().toISOString(),
        from_library:        true,
        library_item_id:     lib.id,
        library_folder_id:   lib.parent_id || null,
        library_path:        libraryPath,
        library_folder_path: libraryFolderPath,
        annexure_id:         annexureId,
        push_source:         annexureId ? 'annexure_upload' : 'library',
        category,
        pushed_to_mydocs:    !stageOnly,
      };
      existing.push(newDoc);
      added.push(newDoc);
    }

    if (added.length) {
      await db.query(
        `UPDATE doc_prep_sessions SET uploaded_docs = ? WHERE bid_no = ?`,
        [JSON.stringify(existing), bidNo]
      );
    }

    return res.json({ success: true, added, uploaded_docs: existing });
  } catch (err) {
    console.error('[doc-prep] importFromLibrary:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/doc-prep/:bidNo/uploaded/:docId/download
 */
exports.downloadUserDocument = async (req, res) => {
  const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  const docId = req.params.docId;
  try {
    const [rows] = await db.query(
      `SELECT uploaded_docs FROM doc_prep_sessions WHERE bid_no = ? LIMIT 1`,
      [bidNo]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Session not found' });
    const docs = parseCol(rows[0].uploaded_docs) || [];
    const target = docs.find(d => d.id === docId);
    if (!target || !fs.existsSync(target.path)) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }
    return res.download(target.path, target.file_name || target.name);
  } catch (err) {
    console.error('[doc-prep] downloadUserDocument:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/doc-prep/:bidNo/uploaded/:docId/pdf
 * Same file as /download, but converted to PDF via LibreOffice if it isn't
 * one already — used by the "Download as ZIP" picker's "all PDF" mode so
 * every file in the bundle, drafted or uploaded, ends up a PDF.
 */
exports.downloadUserDocumentAsPdf = async (req, res) => {
  const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  const docId = req.params.docId;
  try {
    const [rows] = await db.query(
      `SELECT uploaded_docs FROM doc_prep_sessions WHERE bid_no = ? LIMIT 1`,
      [bidNo]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Session not found' });
    const docs = parseCol(rows[0].uploaded_docs) || [];
    const target = docs.find(d => d.id === docId);
    if (!target || !fs.existsSync(target.path)) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const { convertToPdf } = require('../utils/officeConvert');
    let pdfBuf;
    try {
      pdfBuf = await convertToPdf(target.path);
    } catch (convErr) {
      console.error('[doc-prep] downloadUserDocumentAsPdf conversion failed:', convErr.message);
      return res.status(422).json({ success: false, message: `Could not convert "${target.name}" to PDF: ${convErr.message}` });
    }

    const base = (target.file_name || target.name || 'document').replace(/\.[^.]+$/, '');
    const safeName = base.replace(/[^a-zA-Z0-9 _\-.]/g, '_') + '.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.send(pdfBuf);
  } catch (err) {
    console.error('[doc-prep] downloadUserDocumentAsPdf:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/doc-prep/:bidNo/uploaded/:docId/share
 * Body: { email, format: 'original'|'pdf' }
 * Same file resolution as /download and /pdf above, emailed as an attachment
 * instead of streamed — the "Share" half of an uploaded/library-imported
 * document's Download/Share pair.
 */
exports.shareUserDocument = async (req, res) => {
  const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  const docId = req.params.docId;
  const { email, format } = req.body;
  if (!email || !email.trim()) return res.status(400).json({ success: false, message: 'Recipient email is required' });

  try {
    const [rows] = await db.query(
      `SELECT uploaded_docs FROM doc_prep_sessions WHERE bid_no = ? LIMIT 1`,
      [bidNo]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Session not found' });
    const docs = parseCol(rows[0].uploaded_docs) || [];
    const target = docs.find(d => d.id === docId);
    if (!target || !fs.existsSync(target.path)) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const displayName = target.file_name || target.name || 'document';
    let attachment;
    if (format === 'pdf') {
      const { convertToPdf } = require('../utils/officeConvert');
      let pdfBuf;
      try {
        pdfBuf = await convertToPdf(target.path);
      } catch (convErr) {
        return res.status(422).json({ success: false, message: `Could not convert "${displayName}" to PDF: ${convErr.message}` });
      }
      const base = displayName.replace(/\.[^.]+$/, '');
      attachment = { filename: `${base.replace(/[^a-zA-Z0-9 _\-.]/g, '_')}.pdf`, content: pdfBuf };
    } else {
      attachment = { filename: displayName, path: target.path };
    }

    const result = await sendMail({
      to: email.trim(),
      subject: `Shared file: ${displayName}`,
      html: `<p>A file has been shared with you from OpenProcure:</p><p><strong>${displayName}</strong></p>`,
      attachments: [attachment],
    });
    if (!result.ok) return res.status(502).json({ success: false, message: result.error || 'Failed to send email' });
    res.json({ success: true, message: `Sent to ${email.trim()}` });
  } catch (err) {
    console.error('[doc-prep] shareUserDocument:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * DELETE /api/doc-prep/:bidNo/uploaded/:docId
 */
exports.deleteUserDocument = async (req, res) => {
  // My Documents delete is open to every user (not just Admin/Tender Admin) —
  // unlike deleteAdditionalDoc/deleteAnnexure, which stay restricted.
  const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  const docId = req.params.docId;
  try {
    const [rows] = await db.query(
      `SELECT uploaded_docs FROM doc_prep_sessions WHERE bid_no = ? LIMIT 1`,
      [bidNo]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Session not found' });
    let docs = parseCol(rows[0].uploaded_docs) || [];
    const target = docs.find(d => d.id === docId);
    if (target) {
      try { fs.unlinkSync(target.path); } catch { /* already gone */ }
      docs = docs.filter(d => d.id !== docId);
      await db.query(
        `UPDATE doc_prep_sessions SET uploaded_docs = ? WHERE bid_no = ?`,
        [JSON.stringify(docs), bidNo]
      );
    }
    return res.json({ success: true, uploaded_docs: docs });
  } catch (err) {
    console.error('[doc-prep] deleteUserDocument:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/doc-prep/:bidNo/uploaded/push-to-mydocs
 * Body: { ids: [docId, ...] }
 * Flips pushed_to_mydocs -> true for the given staged documents (added via
 * Doc Prep's own "Add Document"/Library-import, category-tagged or not),
 * making them visible in the workspace's My Documents tab.
 */
exports.pushUserDocumentsToMyDocs = async (req, res) => {
  const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
  if (!ids.length) return res.status(400).json({ success: false, message: 'No documents selected' });
  try {
    const [rows] = await db.query(
      `SELECT uploaded_docs FROM doc_prep_sessions WHERE bid_no = ? LIMIT 1`,
      [bidNo]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Session not found' });
    const docs = parseCol(rows[0].uploaded_docs) || [];
    let changed = 0;
    for (const doc of docs) {
      if (ids.includes(doc.id) && !doc.pushed_to_mydocs) {
        doc.pushed_to_mydocs = true;
        changed += 1;
      }
    }
    if (changed) {
      await db.query(
        `UPDATE doc_prep_sessions SET uploaded_docs = ? WHERE bid_no = ?`,
        [JSON.stringify(docs), bidNo]
      );
    }
    return res.json({ success: true, uploaded_docs: docs, pushed: changed });
  } catch (err) {
    console.error('[doc-prep] pushUserDocumentsToMyDocs:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * PATCH /api/doc-prep/:bidNo/uploaded/:docId
 * Body: { name }
 */
exports.renameUserDocument = async (req, res) => {
  const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  const docId = req.params.docId;
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ success: false, message: 'Name is required' });
  try {
    const [rows] = await db.query(
      `SELECT uploaded_docs FROM doc_prep_sessions WHERE bid_no = ? LIMIT 1`,
      [bidNo]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Session not found' });
    const docs = parseCol(rows[0].uploaded_docs) || [];
    const target = docs.find(d => d.id === docId);
    if (!target) return res.status(404).json({ success: false, message: 'Document not found' });
    target.name = name;
    target.modified_at = new Date().toISOString();
    await db.query(
      `UPDATE doc_prep_sessions SET uploaded_docs = ? WHERE bid_no = ?`,
      [JSON.stringify(docs), bidNo]
    );
    return res.json({ success: true, uploaded_docs: docs });
  } catch (err) {
    console.error('[doc-prep] renameUserDocument:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/doc-prep/:bidNo/detected/:docId/accept
 * Moves an auto-detected document from the pending-review list into additional_docs,
 * making it part of the document set that analysis will use.
 */
exports.acceptDetectedDoc = async (req, res) => {
  const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  const docId = req.params.docId;
  try {
    const [rows] = await db.query(
      `SELECT additional_docs, detected_docs FROM doc_prep_sessions WHERE bid_no = ? LIMIT 1`,
      [bidNo]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Session not found' });

    const detected   = parseCol(rows[0].detected_docs)   || [];
    const additional = parseCol(rows[0].additional_docs) || [];
    const target      = detected.find(d => d.id === docId);
    if (!target) return res.status(404).json({ success: false, message: 'Detected document not found' });

    const remainingDetected = detected.filter(d => d.id !== docId);
    const { confirmed, ...docToAdd } = target;
    const newAdditional = [...additional, docToAdd];

    await db.query(
      `UPDATE doc_prep_sessions SET additional_docs = ?, detected_docs = ? WHERE bid_no = ?`,
      [JSON.stringify(newAdditional), JSON.stringify(remainingDetected), bidNo]
    );
    return res.json({ success: true, additional_docs: newAdditional, detected_docs: remainingDetected });
  } catch (err) {
    console.error('[doc-prep] acceptDetectedDoc:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/doc-prep/:bidNo/detected/:docId/reject
 * Discards an auto-detected document — deletes the downloaded file and drops it
 * from the pending-review list. It will not be re-detected (detection runs once).
 */
exports.rejectDetectedDoc = async (req, res) => {
  const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  const docId = req.params.docId;
  try {
    const [rows] = await db.query(
      `SELECT detected_docs FROM doc_prep_sessions WHERE bid_no = ? LIMIT 1`,
      [bidNo]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Session not found' });

    let detected = parseCol(rows[0].detected_docs) || [];
    const target = detected.find(d => d.id === docId);
    if (target) { try { fs.unlinkSync(target.path); } catch { /* already gone */ } }
    detected = detected.filter(d => d.id !== docId);

    await db.query(`UPDATE doc_prep_sessions SET detected_docs = ? WHERE bid_no = ?`, [JSON.stringify(detected), bidNo]);
    return res.json({ success: true, detected_docs: detected });
  } catch (err) {
    console.error('[doc-prep] rejectDetectedDoc:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * DELETE /api/doc-prep/:bidNo/annexure/:annexureId
 * Removes one AI-discovered annexure the user doesn't want to see anymore
 * (e.g. a certificate with no prescribed format that doesn't apply to them).
 * Also drops any format/filled-content already generated for it.
 */
exports.deleteAnnexure = async (req, res) => {
  if (req.user.role !== 'Admin' && req.user.role !== 'Tender Admin' && req.user.role !== 'Office Administrator') {
    return res.status(403).json({ success: false, message: 'Only Admins and Tender Admins can delete documents' });
  }
  const bidNo      = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  const annexureId = req.params.annexureId;
  try {
    const [rows] = await db.query(
      `SELECT annexures, formats, filled_templates FROM doc_prep_sessions WHERE bid_no = ? LIMIT 1`,
      [bidNo]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Session not found' });

    const annexures = (parseCol(rows[0].annexures) || []).filter(a => a.id !== annexureId);
    const formats    = (parseCol(rows[0].formats)   || []).filter(f => f.id !== annexureId);
    const filledMap  = parseCol(rows[0].filled_templates) || {};
    delete filledMap[annexureId];

    await db.query(
      `UPDATE doc_prep_sessions SET annexures = ?, formats = ?, filled_templates = ? WHERE bid_no = ?`,
      [JSON.stringify(annexures), JSON.stringify(formats), JSON.stringify(filledMap), bidNo]
    );
    return res.json({ success: true, annexures, formats, filled_templates: filledMap });
  } catch (err) {
    console.error('[doc-prep] deleteAnnexure:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/doc-prep/:bidNo/reset
 * "Start fresh" — deletes the doc-prep session (discovered annexures,
 * extracted formats, filled templates, uploaded/additional docs), the
 * uploaded bid document folder on disk, and the cached AI Tender Summary.
 * Used when a tender ID is being reused for a new workspace and old
 * analysis from the previous use shouldn't carry over.
 */
exports.resetWorkspace = async (req, res) => {
  const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  try {
    await db.query(`DELETE FROM doc_prep_sessions WHERE bid_no = ?`, [bidNo]);
    await db.query(`DELETE FROM tender_summaries WHERE tender_id = ?`, [bidNo]).catch(() => {});

    const folder = path.join(DOC_PREP_DIR, bidNo.replace(/[^a-zA-Z0-9_\-]/g, '_'));
    if (fs.existsSync(folder)) {
      fs.rmSync(folder, { recursive: true, force: true });
    }

    return res.json({ success: true, message: 'Workspace reset. Upload a bid document to start a fresh analysis.' });
  } catch (err) {
    console.error('[doc-prep] resetWorkspace:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * PATCH /api/doc-prep/:bidNo/annexure/:annexureId
 * Body: { annexure_ref?, title?, doc_group? }
 * Lets the user correct the AI's discovery — e.g. the tender doesn't label an
 * item "Annexure X" and the synthesized title needs cleaning up, or an item
 * was bucketed into the wrong of the three (annexure/license/certificate)
 * sections.
 */
exports.updateAnnexure = async (req, res) => {
  const bidNo      = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  const annexureId = req.params.annexureId;
  const { annexure_ref, title, doc_group, requires_stamp_paper } = req.body || {};
  try {
    const [rows] = await db.query(
      `SELECT annexures FROM doc_prep_sessions WHERE bid_no = ? LIMIT 1`,
      [bidNo]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Session not found' });

    const annexures = parseCol(rows[0].annexures) || [];
    const idx = annexures.findIndex(a => a.id === annexureId);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Annexure not found' });

    if (annexure_ref !== undefined) annexures[idx].annexure_ref = annexure_ref;
    if (title !== undefined) annexures[idx].title = title;
    if (doc_group !== undefined) annexures[idx].doc_group = doc_group;
    // Stamp Paper / Affidavit toggle — these need a plain (no letterhead, no
    // auto-signature) Word download for physical printing/signing/notarizing,
    // then the scanned signed copy uploaded back. Turning it off clears the
    // upload-status fields so a stale "signed copy uploaded" state can't
    // survive an accidental toggle-off/on.
    if (requires_stamp_paper !== undefined) {
      annexures[idx].requires_stamp_paper = !!requires_stamp_paper;
      if (!requires_stamp_paper) {
        annexures[idx].stamp_status = null;
        annexures[idx].stamp_uploaded_doc_id = null;
      } else if (!annexures[idx].stamp_status) {
        annexures[idx].stamp_status = 'pending';
      }
    }

    await db.query(`UPDATE doc_prep_sessions SET annexures = ? WHERE bid_no = ?`, [JSON.stringify(annexures), bidNo]);
    return res.json({ success: true, annexure: annexures[idx] });
  } catch (err) {
    console.error('[doc-prep] updateAnnexure:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/doc-prep/:bidNo/generate
 * Body: { annexure_id, filled_content? }
 * If filled_content is provided, use it directly (in-panel, without saving first).
 * Otherwise read from filled_templates[annexure_id] in DB (card button).
 */
exports.generateDocument = async (req, res) => {
  const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  const { annexure_id, filled_content } = req.body;
  if (!annexure_id) return res.status(400).json({ success: false, message: 'annexure_id required' });

  try {
    const [rows] = await db.query(
      `SELECT filled_templates, formats, uploaded_docs FROM doc_prep_sessions WHERE bid_no = ? LIMIT 1`,
      [bidNo]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Session not found' });

    const filledMap = parseCol(rows[0].filled_templates) || {};
    const content   = filled_content || filledMap[annexure_id];
    if (!content) {
      return res.status(400).json({ success: false, message: 'No filled content. Fill the template first.' });
    }

    const formats = parseCol(rows[0].formats) || [];
    const fmt     = formats.find(f => f.id === annexure_id);
    const title   = fmt ? `${fmt.annexure_ref} — ${fmt.title}` : annexure_id;
    const safeRef = (fmt?.annexure_ref || annexure_id).replace(/[^a-zA-Z0-9_\-]/g, '_');

    const division = await getTenderDept(bidNo);
    const resolvedDivision = division === 'Endo' ? 'Endo' : 'Diagno';
    const isHtml = /<[a-zA-Z][\s\S]*?>/m.test(content);
    const bodyHtml = isHtml ? content : contentToHtml(content);
    const buf = await buildPdfBufferFromHtml(bodyHtml, resolvedDivision);

    // Auto-add the generated document to "My Documents" so the user doesn't
    // have to separately re-upload the file they just downloaded. Re-running
    // Generate for the same annexure replaces its previous entry rather than
    // piling up duplicates.
    try {
      const safeBid = bidNo.replace(/[^a-zA-Z0-9_\-]/g, '_');
      const destDir = path.join(__dirname, '../../uploads/doc-prep', safeBid);
      fs.mkdirSync(destDir, { recursive: true });
      const fileName = `${safeRef}_filled.pdf`;
      const destPath = path.join(destDir, `${Date.now()}-${Math.round(Math.random() * 1e6)}-${fileName}`);
      fs.writeFileSync(destPath, buf);

      let existingDocs = parseCol(rows[0].uploaded_docs) || [];
      const prior = existingDocs.find(d => d.generated_from === annexure_id);
      if (prior?.path) { try { fs.unlinkSync(prior.path); } catch { /* already gone */ } }
      existingDocs = existingDocs.filter(d => d.generated_from !== annexure_id);
      existingDocs.push({
        id:             `udoc_${Date.now()}_${Math.round(Math.random() * 1e5)}`,
        name:           title,
        description:    '',
        file_name:      fileName,
        path:           destPath,
        uploaded_at:    new Date().toISOString(),
        generated_from: annexure_id,
      });
      await db.query(
        `UPDATE doc_prep_sessions SET uploaded_docs = ? WHERE bid_no = ?`,
        [JSON.stringify(existingDocs), bidNo]
      );
    } catch (saveErr) {
      console.warn('[doc-prep] generateDocument: failed to auto-add to My Documents:', saveErr.message);
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeRef}_filled.pdf"`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(buf);
  } catch (err) {
    console.error('[doc-prep] generateDocument:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/doc-prep/:bidNo/download/:annexureId
 */
exports.downloadFilledTemplate = async (req, res) => {
  const bidNo      = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  const annexureId = req.params.annexureId;
  try {
    const [rows] = await db.query(
      `SELECT filled_templates, formats FROM doc_prep_sessions WHERE bid_no = ? LIMIT 1`,
      [bidNo]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Session not found' });

    const filled  = parseCol(rows[0].filled_templates) || {};
    const formats = parseCol(rows[0].formats) || [];
    const content = filled[annexureId];
    if (!content) return res.status(404).json({ success: false, message: 'No filled template found for this annexure. Fill it first.' });

    const fmt      = formats.find(f => f.id === annexureId);
    const filename = `${(fmt?.annexure_ref || annexureId).replace(/[^a-zA-Z0-9_\-]/g, '_')}_filled.txt`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(content);

  } catch (err) {
    console.error('[doc-prep] downloadFilledTemplate:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/doc-prep/:bidNo/draft-claude
 * Body: { annexure_id, verbatim_content }
 * Uses the Claude CLI (execFile "claude -p") with cwd set to the bid doc directory
 * so Claude can read the tender PDF directly for context.
 */
exports.draftWithClaude = async (req, res) => {
  const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  const { annexure_id, verbatim_content } = req.body;
  if (!annexure_id || !verbatim_content) {
    return res.status(400).json({ success: false, message: 'annexure_id and verbatim_content are required' });
  }

  try {
    const company = JSON.parse(fs.readFileSync(COMPANY_PATH, 'utf-8'));

    const [sessionRows] = await db.query(
      `SELECT bid_doc_path, filled_templates FROM doc_prep_sessions WHERE bid_no = ? LIMIT 1`,
      [bidNo]
    );
    if (!sessionRows.length) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }
    const bidDocPath = sessionRows[0].bid_doc_path;

    // Embed PDF text in the prompt — more reliable than cwd file-reading
    let tenderContext = '';
    if (bidDocPath && fs.existsSync(bidDocPath)) {
      try {
        const pdfText = await extractDocText(bidDocPath, 30000);
        if (pdfText.trim()) tenderContext = `\nTender document context:\n"""\n${pdfText.slice(0, 30000)}\n"""\n`;
      } catch (e) {
        console.warn('[doc-prep] draftWithClaude: PDF extraction failed:', e.message);
      }
    }

    // Pass 1 — static fill of known fields
    const staticMap = {
      company_name:         company.company_name,
      address:              company.address,
      gstin:                company.gstin,
      pan:                  company.pan,
      cin:                  company.cin,
      authorized_signatory: company.authorized_person,
      designation:          company.designation,
      email:                company.email,
      contact_number:       company.phone,
      bank_name:            company.bank_name,
      bank_account:         company.bank_account_no,
      bank_ifsc:            company.bank_ifsc,
      tender_reference:     bidNo,
    };
    let prefilled = verbatim_content;
    for (const [key, value] of Object.entries(staticMap)) {
      if (value) prefilled = prefilled.split(`[FILL:${key}]`).join(value);
    }

    const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

    // Pass 2 — Claude CLI drafts the complete document as HTML
    const draftPrompt = `You are a professional tender document writer for ${company.company_name}, a leading Indian medical device company bidding on Indian government tenders.

Company details:
${JSON.stringify(company, null, 2)}
${tenderContext}
Today's date: ${today}.
Tender reference: ${bidNo}.

Fill the following document template completely. Replace every remaining [FILL:*] placeholder with appropriate formal content. Use formal Indian government tender language.

Template:
${prefilled}

Return ONLY clean semantic HTML. No markdown, no code fences, no explanatory text:
- <h1> for title, <h2>/<h3> for sections
- <p> for paragraphs, <ul>/<ol>/<li> for lists
- <strong>/<em> for bold/italic, <table><tr><th><td> for tables
- NO style attributes`;

    const rawOutput   = await callClaude(draftPrompt);
    // Strip any markdown fences Claude might add
    const stripped    = rawOutput.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
    // If Claude wrapped in full HTML, extract body content only
    const bodyMatch   = stripped.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const htmlContent = bodyMatch ? bodyMatch[1].trim() : stripped;

    // Save to filled_templates
    const existing = parseCol(sessionRows[0].filled_templates) || {};
    existing[annexure_id] = htmlContent;
    await db.query(
      `UPDATE doc_prep_sessions SET filled_templates = ? WHERE bid_no = ?`,
      [JSON.stringify(existing), bidNo]
    );

    return res.json({ success: true, html_content: htmlContent, annexure_id });
  } catch (err) {
    console.error('[doc-prep] draftWithClaude:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/doc-prep/:bidNo/export-rich
 * Body: { annexure_id, html_content }
 * Prepends company letterhead, converts to A4 DOCX and streams to client.
 */
exports.exportRichDocx = async (req, res) => {
  const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  const { annexure_id, html_content } = req.body;
  if (!annexure_id || !html_content) {
    return res.status(400).json({ success: false, message: 'annexure_id and html_content are required' });
  }

  try {
    const [rows] = await db.query(
      `SELECT formats FROM doc_prep_sessions WHERE bid_no = ? LIMIT 1`,
      [bidNo]
    );
    const formats = parseCol(rows[0]?.formats) || [];
    const fmt     = formats.find(f => f.id === annexure_id);
    const safeRef = (fmt?.annexure_ref || annexure_id).replace(/[^a-zA-Z0-9_\-]/g, '_');

    // Build DOCX using letterhead.docx as template (preserves exact Word header/footer) —
    // pick the Endo or Diagno letterhead based on this tender's actual division.
    const division = await getTenderDept(bidNo);
    const buf = await buildDocxFromLetterhead(html_content, false, division === 'Endo' ? 'Endo' : 'Diagno');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${safeRef}_filled.docx"`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(buf);
  } catch (err) {
    console.error('[doc-prep] exportRichDocx:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Resolves the Endo/Diagno division for a standalone export request.
 * Callers may pass `division` directly (e.g. the bidNo-aware Deviation
 * Representation editor already knows it) or a `bidNo` for DocsEditor,
 * which has no division context of its own and needs it looked up.
 */
async function resolveStandaloneDivision(division, bidNo) {
  if (division === 'Endo' || division === 'Diagno') return division;
  if (bidNo) {
    const dept = await getTenderDept(bidNo);
    if (dept === 'Endo') return 'Endo';
  }
  return 'Diagno';
}

/**
 * POST /api/doc-prep/export-docx
 * Body: { title, html_content, division?, bidNo? }
 * Standalone DOCX export — used by DocsEditor. `division` is used if given,
 * otherwise `bidNo` (the tender this draft belongs to) is looked up.
 */
exports.exportDocxStandalone = async (req, res) => {
  const { title, html_content, skipAutoSignature, division, bidNo, plainExport } = req.body;
  if (!html_content) return res.status(400).json({ success: false, message: 'html_content is required' });
  try {
    const safeTitle = (title || 'document').replace(/[^a-zA-Z0-9_\- ]/g, '_');
    // plainExport (Stamp Paper / Affidavit annexures): no letterhead, no
    // auto-signature, template's own signature block left intact.
    const buf = plainExport
      ? await buildPlainDocxNoLetterhead(html_content)
      : await buildDocxFromLetterhead(html_content, !!skipAutoSignature, await resolveStandaloneDivision(division, bidNo));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.docx"`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(buf);
  } catch (err) {
    console.error('[doc-prep] exportDocxStandalone:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/doc-prep/export-pdf
 * Body: { title, html_content }
 * Standalone PDF export — used by DocsEditor (no bidNo context needed).
 */
// Memory storage (no bidNo/disk destination needed — chat attachments are
// read once for their text/image content and discarded, never persisted).
const chatAttachmentUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
exports.chatEditUploadMiddleware = chatAttachmentUpload.single('file');
exports.shareBlobUploadMiddleware = chatAttachmentUpload.single('file');

/**
 * POST /api/doc-prep/share-blob
 * Multipart: file, email, filename?
 * Generic "email whatever bytes the browser already built" endpoint — for
 * downloads assembled client-side (a ZIP archive of several documents, a
 * merged PDF before it's saved server-side) there's no single server-side
 * record to re-render from, so the browser just uploads the same bytes it
 * was about to save locally and this mails them instead. Nothing is
 * persisted — the upload is read from memory and discarded once sent.
 */
exports.shareBlob = async (req, res) => {
  const { email, filename } = req.body;
  if (!email || !email.trim()) return res.status(400).json({ success: false, message: 'Recipient email is required' });
  if (!req.file) return res.status(400).json({ success: false, message: 'No file received' });

  try {
    const displayName = filename || req.file.originalname || 'document';
    const result = await sendMail({
      to: email.trim(),
      subject: `Shared file: ${displayName}`,
      html: `<p>A file has been shared with you from OpenProcure:</p><p><strong>${displayName}</strong></p>`,
      attachments: [{ filename: displayName, content: req.file.buffer }],
    });
    if (!result.ok) return res.status(502).json({ success: false, message: result.error || 'Failed to send email' });
    res.json({ success: true, message: `Sent to ${email.trim()}` });
  } catch (err) {
    console.error('[doc-prep] shareBlob:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const CHAT_IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

// Reads an attached photo/PDF/Word/Excel/CSV and turns it into either an
// image (for the vision model) or extracted text to fold into the prompt —
// same per-type extraction this project already uses elsewhere (pdf-parse,
// mammoth, exceljs), just applied to an in-memory chat upload instead of a
// file on disk.
async function extractChatAttachment(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (CHAT_IMAGE_EXTS.includes(ext)) {
    return { images: [file.buffer.toString('base64')], block: `\n\nThe user attached an image ("${file.originalname}") — use what's shown in it to inform this edit.` };
  }
  try {
    if (ext === '.pdf') {
      const data = await pdfParse(file.buffer);
      return { images: null, block: `\n\n--- ATTACHED FILE: ${file.originalname} ---\n${data.text.slice(0, 20000)}` };
    }
    if (ext === '.docx') {
      const mammoth = require('mammoth');
      const result  = await mammoth.extractRawText({ buffer: file.buffer });
      return { images: null, block: `\n\n--- ATTACHED FILE: ${file.originalname} ---\n${result.value.slice(0, 20000)}` };
    }
    if (['.xlsx', '.xls'].includes(ext)) {
      const ExcelJS = require('exceljs');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(file.buffer);
      let text = '';
      wb.eachSheet(sheet => {
        text += `=== Sheet: ${sheet.name} ===\n`;
        sheet.eachRow(row => { text += row.values.slice(1).join(', ') + '\n'; });
      });
      return { images: null, block: `\n\n--- ATTACHED FILE: ${file.originalname} ---\n${text.slice(0, 20000)}` };
    }
    if (ext === '.csv' || ext === '.txt') {
      return { images: null, block: `\n\n--- ATTACHED FILE: ${file.originalname} ---\n${file.buffer.toString('utf8').slice(0, 20000)}` };
    }
  } catch (e) {
    return { images: null, block: `\n\n(Could not read attached file "${file.originalname}": ${e.message})` };
  }
  return { images: null, block: `\n\n(Attached file "${file.originalname}" is an unsupported type and could not be read.)` };
}

/**
 * POST /api/doc-prep/chat-edit
 * OpenProcure AI chat — user sends a message, Ollama updates the document accordingly.
 * Body: { html_content, message, history: [{role, content}] } — JSON normally,
 * or multipart/form-data (same fields, history JSON-stringified) when an
 * attachment (photo/PDF/Word/Excel/CSV) is included as `file`.
 */
exports.chatEdit = async (req, res) => {
  const { html_content, message } = req.body;
  const history = Array.isArray(req.body.history) ? req.body.history : JSON.parse(req.body.history || '[]');
  if (!html_content || !message) {
    return res.status(400).json({ success: false, message: 'html_content and message are required' });
  }
  try {
    const { callOllama } = require('../utils/ollama');

    let attachmentBlock = '';
    let attachmentImages = null;
    if (req.file) {
      const { images, block } = await extractChatAttachment(req.file);
      attachmentImages = images;
      attachmentBlock  = block;
    }

    // Build recent history context (last 6 turns max to keep prompt size manageable)
    const recentHistory = history.slice(-6);
    const historyText = recentHistory.length
      ? '\n\nPrevious conversation context:\n' +
        recentHistory.map(h => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join('\n')
      : '';

    const systemPrompt = `You are OpenProcure AI, an expert document editor for Indian government tender submissions.

CURRENT DOCUMENT (HTML):
---BEGIN DOCUMENT---
${html_content}
---END DOCUMENT---

Instructions:
1. The user will ask you to make changes to the document above.
2. Return the COMPLETE updated document as HTML body content (no <html>/<head>/<body> wrapper tags).
3. Make ONLY the changes the user requests — preserve all other content, formatting, tables, and structure exactly.
4. Keep professional, formal language appropriate for government tender submissions.
5. Do NOT add a signature block — the document already has one.
6. After the HTML, write exactly this separator on its own line: |||REPLY|||
7. After the separator, write a brief 1-2 sentence summary of the changes you made.

Output format:
[Complete updated HTML here]
|||REPLY|||
[Brief summary of changes]`;

    const userPrompt = `${historyText}\n\nCurrent request: ${message}${attachmentBlock}`;

    // An attached photo needs the vision-capable model; text attachments
    // (PDF/Word/Excel/CSV) are already folded into the prompt as plain text
    // above and work fine with the default model.
    const raw = attachmentImages
      ? await callOllama(systemPrompt, userPrompt, 0.1, 8000, GEMMA_MODEL, attachmentImages)
      : await callOllama(systemPrompt, userPrompt, 0.1, 8000);

    // Parse updated HTML and reply
    const sepIdx = raw.indexOf('|||REPLY|||');
    let updatedHtml, reply;
    if (sepIdx >= 0) {
      updatedHtml = raw.slice(0, sepIdx).trim();
      reply       = raw.slice(sepIdx + '|||REPLY|||'.length).trim();
    } else {
      // Fallback: if separator missing, treat full response as HTML
      updatedHtml = raw.trim();
      reply       = 'Document updated.';
    }

    // Strip any stray markdown fences
    updatedHtml = updatedHtml.replace(/^```html?\s*/i, '').replace(/```\s*$/, '').trim();

    return res.json({ success: true, updated_html: updatedHtml, reply });
  } catch (err) {
    console.error('[doc-prep] chatEdit:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Builds the same letterhead-wrapped PDF buffer exportPdfStandalone streams
 * to the browser — pulled out so the new export-share endpoint (which emails
 * the buffer instead of downloading it) doesn't have to duplicate the whole
 * header/footer/orphan-signature-shrink pipeline.
 */
async function renderStandalonePdfBuffer(body) {
  const { title, html_content, skipAutoSignature, headerLogoDataUrl, hideHeaderLabel, division, bidNo, plainExport } = body;
  if (!html_content) throw new Error('html_content is required');

  let browser;
  try {
    const safeTitle = (title || 'document').replace(/[^a-zA-Z0-9_\- ]/g, '_');
    const resolvedDivision = await resolveStandaloneDivision(division, bidNo);

    // Stamp Paper / Affidavit: no Meril letterhead header, no auto-signature —
    // just a small, centered, professional page-number footer (the document
    // otherwise has none at all, which reads as unfinished on a multi-page
    // legal document going onto physical stamp paper).
    let headerTemplate, footerTemplate;
    if (plainExport) {
      headerTemplate = '<div></div>';
      footerTemplate = `<div style="width:100%;font-family:Verdana,Arial,sans-serif;font-size:9px;color:#6b7280;text-align:center;padding-bottom:6mm;">
  <span class="pageNumber"></span> / <span class="totalPages"></span>
</div>`;
    } else if (resolvedDivision === 'Endo') {
      // Same header/footer used by the bidNo-aware exportPdf's Endo branch and
      // built from endo_letter_head.html assets — see buildEndoHeaderTemplateHtml.
      headerTemplate = buildEndoHeaderTemplateHtml();
      footerTemplate = buildEndoFooterTemplateHtml();
    } else {
      const logoBase64 = headerLogoDataUrl || getLogoBase64();
      const logoHeight = headerLogoDataUrl ? 64 : 42;

      headerTemplate = `<div style="width:100%;padding:${headerLogoDataUrl ? '10px' : '6px'} 20mm 0 20mm;box-sizing:border-box;font-family:Verdana,Arial,sans-serif;">
  <div style="display:flex;justify-content:flex-end;align-items:flex-end;">
    ${logoBase64 ? `<img src="${logoBase64}" style="height:${logoHeight}px;object-fit:contain;" />` : ''}
  </div>
  ${hideHeaderLabel ? '' : '<div style="text-align:right;font-size:9px;font-weight:bold;color:#002060;margin-top:1px;">Diagnostics</div>'}
  <div style="height:2px;background:#002060;margin-top:3px;"></div>
</div>`;

      footerTemplate = `<div style="width:100%;padding:0 20mm 4px 20mm;box-sizing:border-box;font-family:Verdana,Arial,sans-serif;text-align:center;line-height:1.55;">
  <div style="height:1px;background:#cccccc;margin-bottom:3px;"></div>
  <div style="font-size:8px;font-weight:bold;color:#111;">Meril Diagnostics Private Limited</div>
  <div style="font-size:7px;color:#333;">CIN No. U33110GJ2011PTC064994</div>
  <div style="font-size:7px;color:#333;">Regd. Office: Survey No. 135/139, Bilakhia House, Muktanand Marg, Chala, Vapi-396 191, Gujarat, India</div>
  <div style="font-size:7px;color:#333;">Mumbai Office: 601, Midas, Sahar Plaza, JB Nagar, Andheri East, Mumbai &#8211; 400059</div>
  <div style="font-size:7px;color:#333;">Tel: +91 260 2408000 &nbsp; Email: tender.merildiagno@merillife.com &nbsp; website: www.merillife.com</div>
  <div style="font-size:8px;font-weight:bold;color:#FFC000;margin-top:2px;">Cardiovascular | Orthopedic | Diagnostics | Endo-Surgery | ENT</div>
</div>`;
    }

    // plainExport keeps the template's own signature/attestation block exactly
    // as extracted (blank line, notary box, etc.) — never stripped, never
    // replaced with Meril's digital signature, since this gets wet-signed.
    const cleanBody  = plainExport ? html_content : stripTextSignature(html_content);
    const sigBlock   = plainExport ? '' : (skipAutoSignature ? '' : (resolvedDivision === 'Endo' ? getEndoSignatureHtml() : getLetterheadSignatureHtml()));

    // Font size is parameterised so we can shrink content if the sig would land on an empty page
    const buildHtml = (fs) => `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { font-family: 'Bookman Old Style', 'Times New Roman', serif; font-size: ${fs}pt; color: #1f2937; line-height: 1.7; margin: 0; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; }
  th, td { border: 1px solid #d1d5db; padding: 6px 10px; font-size: ${fs - 1}pt; text-align: left; }
  th { background: #f1f5f9; font-weight: 600; text-align: center; }
  h1 { font-size: ${Math.round(fs * 1.25)}pt; margin: 10px 0 5px; text-align: center; }
  h2 { font-size: ${Math.round(fs * 1.08)}pt; margin: 8px 0 4px; text-align: center; }
  h3 { font-size: ${fs}pt; margin: 6px 0 3px; text-align: left; }
  p  { margin: 0 0 6px; text-align: justify; }
  ul, ol { padding-left: 20px; margin: 4px 0; }
  li { margin-bottom: 3px; text-align: justify; }
  blockquote { border-left: 3px solid #002060; padding: 4px 12px; margin: 8px 0; }
  hr { border: none; border-top: 1px solid #ccc; margin: 12px 0; }
  .label-line { text-align: left; }
</style>
</head>
<body>${cleanBody}${sigBlock}</body>
</html>`;

    const puppeteer = require('puppeteer');
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();

    // A4 usable body per page: (297 - top - bottom) mm × 3.7795 px/mm, matching
    // whichever margin set this division ends up using (see pdfMargin below).
    // After rendering, check if #lh-sig starts within the first 60 px of a new
    // page — meaning it landed alone on an empty page. If so, shrink font until it fits.
    const pageHForDivision = resolvedDivision === 'Endo'
      ? Math.round((297 - 25.4 - 46) * 3.7795)
      : Math.round((297 - 32 - 48) * 3.7795);
    const checkSigOrphan = () => page.evaluate((PAGE_H) => {
      const sig = document.getElementById('lh-sig');
      if (!sig) return false;
      let top = 0, el = sig;
      while (el) { top += el.offsetTop; el = el.offsetParent; }
      return top >= PAGE_H && (top % PAGE_H) < 60;
    }, pageHForDivision);

    await page.setContent(buildHtml(12), { waitUntil: 'networkidle0' });

    if (await checkSigOrphan()) {
      for (const fs of [11, 10.5, 10, 9.5]) {
        await page.setContent(buildHtml(fs), { waitUntil: 'networkidle0' });
        if (!(await checkSigOrphan())) break;
      }
    }

    // Endo's margins are symmetric (left = right) so the body text sits centered
    // on the page, matching endo_letterhead_generator.html's `padding: 1in 1in`.
    // Diagno keeps its original asymmetric margins (matches letterhead.docx).
    // plainExport needs no room for a letterhead band — just standard page
    // margins plus a little extra at the bottom for the page-number footer.
    const pdfMargin = plainExport
      ? { top: '20mm', right: '20mm', bottom: '18mm', left: '20mm' }
      : resolvedDivision === 'Endo'
      ? { top: '25.4mm', right: '25.4mm', bottom: '46mm', left: '25.4mm' }
      : { top: '32mm', right: '13.4mm', bottom: '48mm', left: '25.4mm' };

    const pdf = await page.pdf({
      format:              'A4',
      printBackground:     true,
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
      margin: pdfMargin,
    });

    return { buf: pdf, safeTitle };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

exports.exportPdfStandalone = async (req, res) => {
  try {
    const { buf, safeTitle } = await renderStandalonePdfBuffer(req.body);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.pdf"`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(buf);
  } catch (err) {
    console.error('[doc-prep] exportPdfStandalone:', err);
    return res.status(err.message === 'html_content is required' ? 400 : 500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/doc-prep/export-share
 * Body: same as export-pdf/export-docx, plus { format: 'pdf'|'docx', email }
 * Renders the same generated document (drafted annexure, etc.) either format
 * already supports, then emails it as an attachment instead of downloading —
 * the "Share" half of the Download/Share pair used by Doc Prep and My Docs.
 */
exports.shareGeneratedDoc = async (req, res) => {
  const { email, format } = req.body;
  if (!email || !email.trim()) return res.status(400).json({ success: false, message: 'Recipient email is required' });
  if (format !== 'pdf' && format !== 'docx') return res.status(400).json({ success: false, message: 'format must be "pdf" or "docx"' });

  try {
    const { title, skipAutoSignature, division, bidNo, plainExport } = req.body;
    let buf, safeTitle;
    if (format === 'pdf') {
      ({ buf, safeTitle } = await renderStandalonePdfBuffer(req.body));
    } else {
      safeTitle = (title || 'document').replace(/[^a-zA-Z0-9_\- ]/g, '_');
      buf = plainExport
        ? await buildPlainDocxNoLetterhead(req.body.html_content)
        : await buildDocxFromLetterhead(req.body.html_content, !!skipAutoSignature, await resolveStandaloneDivision(division, bidNo));
    }

    const filename = `${safeTitle}.${format}`;
    const result = await sendMail({
      to: email.trim(),
      subject: `Shared document: ${title || safeTitle}`,
      html: `<p>A document has been shared with you from OpenProcure:</p><p><strong>${title || safeTitle}</strong></p>`,
      attachments: [{ filename, content: buf }],
    });
    if (!result.ok) return res.status(502).json({ success: false, message: result.error || 'Failed to send email' });
    res.json({ success: true, message: `Sent to ${email.trim()}` });
  } catch (err) {
    console.error('[doc-prep] shareGeneratedDoc:', err);
    res.status(err.message === 'html_content is required' ? 400 : 500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/doc-prep/print-html-pdf
 * Body: { html, filename }
 * Renders an already fully-styled, self-contained HTML document to PDF via
 * headless Chrome exactly as given — no Meril letterhead wrapper, no
 * auto-signature block, no header/footer template (unlike exportPdfStandalone,
 * which adds all of those). For standalone document popups (e.g. notary.html)
 * that already define their own complete page layout/margins/branding and
 * just need a real PDF file instead of routing through window.print(), which
 * can't suppress the browser's own date/URL/page-number print header-footer.
 */
exports.printHtmlToPdf = async (req, res) => {
  const { html, filename, format, margin } = req.body;
  if (!html) return res.status(400).json({ success: false, message: 'html is required' });

  let browser;
  try {
    const safeFilename = (filename || 'document.pdf').replace(/[^a-zA-Z0-9_.\- ]/g, '_');

    const puppeteer = require('puppeteer');
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdf = await page.pdf({
      format:              format || 'Letter',
      printBackground:     true,
      displayHeaderFooter: false,
      // Puppeteer's own margin option is authoritative for the output PDF —
      // it does not read the page's @page CSS margin — so callers whose
      // document uses a non-default page size/margin (e.g. A4 with an
      // asymmetric right margin) must pass it explicitly here.
      margin: margin || { top: '1in', right: '1in', bottom: '1in', left: '1in' },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(pdf);
  } catch (err) {
    console.error('[doc-prep] printHtmlToPdf:', err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
};

/**
 * POST /api/doc-prep/:bidNo/draft-ollama
 * Body: { annexure_id, verbatim_content }
 * Generates a fully-drafted HTML document using Ollama (gemma4 model).
 */
exports.draftWithOllama = async (req, res) => {
  const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  const { annexure_id, verbatim_content } = req.body;
  if (!annexure_id || !verbatim_content) {
    return res.status(400).json({ success: false, message: 'annexure_id and verbatim_content are required' });
  }

  try {
    const company = JSON.parse(fs.readFileSync(COMPANY_PATH, 'utf-8'));

    const [sessionRows] = await db.query(
      `SELECT bid_doc_path, filled_templates FROM doc_prep_sessions WHERE bid_no = ? LIMIT 1`,
      [bidNo]
    );
    if (!sessionRows.length) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }
    const bidDocPath = sessionRows[0].bid_doc_path;

    // Embed PDF text in the prompt for context
    let tenderContext = '';
    if (bidDocPath && fs.existsSync(bidDocPath)) {
      try {
        const pdfText = await extractDocText(bidDocPath, 30000);
        if (pdfText.trim()) tenderContext = `\nTender document context:\n"""\n${pdfText.slice(0, 30000)}\n"""\n`;
      } catch (e) {
        console.warn('[doc-prep] draftWithOllama: PDF extraction failed:', e.message);
      }
    }

    // Pass 1 — static fill of known fields
    const staticMap = {
      company_name:         company.company_name,
      address:              company.address,
      gstin:                company.gstin,
      pan:                  company.pan,
      cin:                  company.cin,
      authorized_signatory: company.authorized_person,
      designation:          company.designation,
      email:                company.email,
      contact_number:       company.phone,
      bank_name:            company.bank_name,
      bank_account:         company.bank_account_no,
      bank_ifsc:            company.bank_ifsc,
      tender_reference:     bidNo,
    };
    let prefilled = verbatim_content;
    for (const [key, value] of Object.entries(staticMap)) {
      if (value) prefilled = prefilled.split(`[FILL:${key}]`).join(value);
    }

    const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

    // Pass 2 — converts the verbatim template to HTML. This is a FORMATTING
    // pass, not a rewriting pass: the template text (extracted verbatim from
    // the actual tender document in Step 2 of analysis) must come through
    // unchanged, just wrapped in semantic HTML tags. Tables especially must
    // keep every row/column — a smaller model was previously used here and
    // was observed paraphrasing/dropping table rows, so this uses the same
    // higher-fidelity model as the rest of the AI drafting pipeline.
    const systemPrompt = `You are a formatting engine, not a writer. You convert an already-finalized tender document template into clean semantic HTML for ${company.company_name}, a leading Indian medical device company. You NEVER rewrite, rephrase, summarize, shorten, or reorganize the wording you are given — your only job is to wrap the EXACT text you receive in the correct HTML tags and fill in [FILL:*] placeholders.

Your output must be clean semantic HTML with professional formatting:
- Use <h1> for the document title (CSS will center it automatically)
- Use <h2> for major section headings (CSS will center them automatically)
- Use <h3> for sub-headings (left-aligned)
- Use <p> for all body paragraphs (CSS will justify them automatically — do NOT add style attributes)
- For label-value pairs like "GeM Bid No:", "Subject:", "Reference:", use: <p><strong>GeM Bid No:</strong> [value]</p>
- For the "To," address block, use separate <p> tags for each line: <p><strong>To,</strong></p><p>[Name]</p><p>[Designation/Org]</p><p>[Address line 1],</p><p>[Address line 2].</p>
- Use <strong> for inline bold emphasis only
- Use <ul>/<ol>/<li> for lists
- Use <hr> to separate major sections visually
- DO NOT add any style="" attributes — CSS handles all alignment globally
- DO NOT generate any signature block, "Yours faithfully", signatory, seal, date, or place lines — the signature is appended automatically. End your HTML just before where a signature would normally appear.

TABLES ARE CRITICAL — read this carefully:
- If the template below contains a Markdown table (rows starting with "|"), it MUST become an HTML <table> with the EXACT SAME number of rows and columns, and EXACT SAME cell text — <table><thead><tr><th>…</th></tr></thead><tbody><tr><td>…</td></tr>…</tbody></table>.
- Do NOT drop, merge, summarize, paraphrase, or reduce any row. If the Markdown table has 20 rows, your HTML table must have 20 <tr> rows. Copy every cell's text verbatim.
- Never turn a table into prose paragraphs. Never invent your own summary of what the table says instead of reproducing it.

Return ONLY the HTML fragment — no <!DOCTYPE>, no <html>, no <body>, no markdown, no code fences.`;

    const userPrompt = `Company details:
${JSON.stringify(company, null, 2)}
${tenderContext}
Today's date: ${today}.
Tender reference: ${bidNo}.

Convert the following template into HTML. This text is FINAL — do not change any wording, do not rewrite it "more formally", do not shorten it. Only: (1) wrap it in the correct HTML tags per the rules above, and (2) replace any remaining [FILL:*] placeholder with appropriate formal content.

STRICT FORMATTING RULES:
1. Document title → <h1> (CSS centers automatically — no style attribute needed)
2. All body text → <p> (CSS justifies automatically — no style attribute needed)
3. Section headings → <h2> (major, CSS centers) or <h3> (sub-sections, left-aligned)
4. Label-value pairs → <p><strong>Label:</strong> value</p>
5. "To," address → one <p> per line of the address
6. Every Markdown table below → an HTML <table> with <thead>/<tbody>, <th>/<td>, preserving every row and column exactly — see TABLES ARE CRITICAL above
7. Do NOT add style="" attributes anywhere — CSS handles all alignment globally
8. Do NOT add a signature block — stop content just before where a signature would go

Template (reproduce this content exactly, just as HTML):
${prefilled}`;

    const rawOutput = await callOllama(systemPrompt, userPrompt, 0.1, 12000);

    // Strip any markdown fences the model might add
    const stripped  = rawOutput.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
    const bodyMatch = stripped.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const rawHtml   = bodyMatch ? bodyMatch[1].trim() : stripped;

    // Strip any AI-generated signature/sign-off block (model sometimes ignores the instruction)
    const SIG_STRIP = /<(?:p|div)[^>]*>\s*(?:Yours faithfully|Yours sincerely|Authorized Signatory|Authorised Signatory|<strong>Seal|<strong>Date|<strong>Name|<strong>Designation|<strong>Company)[^<]*/i;
    const sigIdx    = rawHtml.search(SIG_STRIP);
    const bodyOnly  = sigIdx >= 0 ? rawHtml.slice(0, sigIdx).trimEnd() : rawHtml;

    // Append a static signature block matching the deviation letter format
    const signatureBlock = `
<hr>
<p>Yours faithfully,</p>
<p>&nbsp;</p>
<p>&nbsp;</p>
<p>&nbsp;</p>
<p><strong>Authorised Signatory</strong></p>
<p>${company.company_name}</p>`;

    const htmlContent = bodyOnly + signatureBlock;

    // Save to filled_templates
    const existing = parseCol(sessionRows[0].filled_templates) || {};
    existing[annexure_id] = htmlContent;
    await db.query(
      `UPDATE doc_prep_sessions SET filled_templates = ? WHERE bid_no = ?`,
      [JSON.stringify(existing), bidNo]
    );

    return res.json({ success: true, html_content: htmlContent, annexure_id });
  } catch (err) {
    console.error('[doc-prep] draftWithOllama:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/doc-prep/:bidNo/export-pdf
 * Body: { annexure_id, html_content }
 * Renders letterhead + content HTML → A4 PDF via Puppeteer headless Chrome.
 */
exports.exportPdf = async (req, res) => {
  const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  const { annexure_id, html_content } = req.body;
  if (!annexure_id || !html_content) {
    return res.status(400).json({ success: false, message: 'annexure_id and html_content are required' });
  }

  let browser;
  try {
    const [rows] = await db.query(
      `SELECT formats FROM doc_prep_sessions WHERE bid_no = ? LIMIT 1`,
      [bidNo]
    );
    const formats = parseCol(rows[0]?.formats) || [];
    const fmt     = formats.find(f => f.id === annexure_id);
    const safeRef = (fmt?.annexure_ref || annexure_id).replace(/[^a-zA-Z0-9_\-]/g, '_');

    // Build PDF header/footer templates matching the tender's actual division —
    // Endo uses endo_letter_head.html's branding (see buildEndoHeaderTemplateHtml);
    // everything else keeps the Diagno letterhead.
    const division = await getTenderDept(bidNo);

    let headerTemplate, footerTemplate;
    if (division === 'Endo') {
      headerTemplate = buildEndoHeaderTemplateHtml();
      footerTemplate = buildEndoFooterTemplateHtml();
    } else {
      const logoBase64 = getLogoBase64();
      headerTemplate = `<div style="width:100%;padding:6px 20mm 0 20mm;box-sizing:border-box;font-family:Verdana,Arial,sans-serif;">
  <div style="display:flex;justify-content:flex-end;align-items:flex-end;">
    ${logoBase64 ? `<img src="${logoBase64}" style="height:42px;object-fit:contain;" />` : ''}
  </div>
  <div style="text-align:right;font-size:9px;font-weight:bold;color:#002060;margin-top:1px;">Diagnostics</div>
  <div style="height:2px;background:#002060;margin-top:3px;"></div>
</div>`;

      footerTemplate = `<div style="width:100%;padding:0 20mm 4px 20mm;box-sizing:border-box;font-family:Verdana,Arial,sans-serif;text-align:center;line-height:1.55;">
  <div style="height:1px;background:#cccccc;margin-bottom:3px;"></div>
  <div style="font-size:8px;font-weight:bold;color:#111;">Meril Diagnostics Private Limited</div>
  <div style="font-size:7px;color:#333;">CIN No. U33110GJ2011PTC064994</div>
  <div style="font-size:7px;color:#333;">Regd. Office: Survey No. 135/139, Bilakhia House, Muktanand Marg, Chala, Vapi-396 191, Gujarat, India</div>
  <div style="font-size:7px;color:#333;">Mumbai Office: 601, Midas, Sahar Plaza, JB Nagar, Andheri East, Mumbai &#8211; 400059</div>
  <div style="font-size:7px;color:#333;">Tel: +91 260 2408000 &nbsp; Email: tender.merildiagno@merillife.com &nbsp; website: www.merillife.com</div>
  <div style="font-size:8px;font-weight:bold;color:#FFC000;margin-top:2px;">Cardiovascular | Orthopedic | Diagnostics | Endo-Surgery | ENT</div>
</div>`;
    }

    // Endo gets the real named signature (Gelivi Kiran Kumar) in place of whatever
    // generic text sign-off the AI draft appended — same treatment buildDocxFromLetterhead
    // already applies for DOCX, so PDF and DOCX outputs match.
    const bodyContent = division === 'Endo'
      ? `${stripTextSignature(html_content)}${getEndoSignatureHtml()}`
      : html_content;

    const bodyHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { font-family: 'Bookman Old Style', 'Times New Roman', serif; font-size: 12pt; color: #1f2937; line-height: 1.7; margin: 0; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; }
  th, td { border: 1px solid #d1d5db; padding: 6px 10px; font-size: 11pt; text-align: left; }
  th { background: #f1f5f9; font-weight: 600; text-align: center; }
  h1 { font-size: 15pt; margin: 10px 0 5px; text-align: center; }
  h2 { font-size: 13pt; margin: 8px 0 4px; text-align: center; }
  h3 { font-size: 12pt; margin: 6px 0 3px; text-align: left; }
  p  { margin: 0 0 6px; text-align: justify; }
  ul, ol { padding-left: 20px; margin: 4px 0; }
  li { margin-bottom: 3px; text-align: justify; }
  blockquote { border-left: 3px solid #002060; padding: 4px 12px; margin: 8px 0; }
  hr { border: none; border-top: 1px solid #ccc; margin: 12px 0; }
</style>
</head>
<body>${bodyContent}</body>
</html>`;

    const puppeteer = require('puppeteer');
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    await page.setContent(bodyHtml, { waitUntil: 'networkidle0' });
    const pdfMargin = division === 'Endo'
      ? { top: '25.4mm', right: '25.4mm', bottom: '46mm', left: '25.4mm' }
      : { top: '32mm', right: '13.4mm', bottom: '48mm', left: '25.4mm' };
    const pdf = await page.pdf({
      format:                'A4',
      printBackground:       true,
      displayHeaderFooter:   true,
      headerTemplate,
      footerTemplate,
      margin: pdfMargin,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeRef}_filled.pdf"`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(pdf);
  } catch (err) {
    console.error('[doc-prep] exportPdf:', err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
};

/**
 * POST /api/doc-prep/:bidNo/download-all-zip
 * Body: { items: [{ type: 'annexure' | 'uploaded', id: string }, ...] }
 */
exports.downloadAllZip = async (req, res) => {
  const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  try {
    const [rows] = await db.query(
      `SELECT filled_templates, formats, annexures, uploaded_docs FROM doc_prep_sessions WHERE bid_no = ? LIMIT 1`,
      [bidNo]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    const filledMap    = parseCol(rows[0].filled_templates) || {};
    const formats       = parseCol(rows[0].formats)          || [];
    const annexures     = parseCol(rows[0].annexures)        || [];
    const uploadedDocs  = parseCol(rows[0].uploaded_docs)     || [];

    const bodyItems = Array.isArray(req.body?.items) ? req.body.items : null;
    const items = bodyItems || Object.keys(filledMap).map(id => ({ type: 'annexure', id }));

    if (!items.length) {
      return res.status(404).json({
        success: false,
        message: 'No documents selected. Fill or draft at least one document, or upload one, first.',
      });
    }

    // Fire-and-forget — must not delay the zip response.
    db.query(`UPDATE doc_prep_sessions SET zip_downloaded_at = NOW() WHERE bid_no = ?`, [bidNo]).catch(() => {});

    const division = await getTenderDept(bidNo);
    const letterheadDivision = division === 'Endo' ? 'Endo' : 'Diagno';

    const AdmZip = require('adm-zip');
    const zip    = new AdmZip();

    await Promise.all(items.map(async (item, idx) => {
      const position = idx + 1;

      if (item.type === 'uploaded') {
        const doc = uploadedDocs.find(d => d.id === item.id);
        if (!doc || !fs.existsSync(doc.path)) return;
        zip.addLocalFile(doc.path, '', `${position}.${doc.file_name || doc.name}`);
        return;
      }

      // Default / 'annexure': a filled or drafted template
      const annexureId = item.id;
      const content = filledMap[annexureId];
      if (!content) return;

      const fmt   = formats.find(f   => f.id === annexureId);
      const ann   = annexures.find(a => a.id === annexureId);
      const ref   = fmt?.annexure_ref || ann?.annexure_ref || annexureId;
      const title = fmt?.title || ann?.title || ref;
      const safeRef = ref.replace(/[^a-zA-Z0-9_\-]/g, '_');

      try {
        // Detect HTML vs plain-text content
        const isHtml = /<[a-zA-Z][\s\S]*?>/m.test(content);
        let bodyHtml;
        if (isHtml) {
          bodyHtml = content;
        } else {
          // Wrap plain text in minimal HTML then run through the same letterhead pipeline
          const lines   = content.split('\n');
          bodyHtml = `<h1>${title}</h1>` +
            lines.map(l => `<p>${l || '&nbsp;'}</p>`).join('');
        }
        const pdfBuf = await buildPdfBufferFromHtml(bodyHtml, letterheadDivision);
        zip.addFile(`${position}.${safeRef}.pdf`, pdfBuf);
      } catch (e) {
        // If PDF generation fails for one document, add a plain-text fallback
        console.warn(`[doc-prep] downloadAllZip: PDF build failed for ${annexureId}:`, e.message);
        zip.addFile(`${position}.${safeRef}.txt`, Buffer.from(content, 'utf-8'));
      }
    }));

    const safeBid = bidNo.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const zipBuf  = zip.toBuffer();

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeBid}_documents.zip"`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(zipBuf);
  } catch (err) {
    console.error('[doc-prep] downloadAllZip:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ─── Checklist ──────────────────────────────────────────────────────────────
   Mirrors a tender's own checklist annexure (e.g. RMSCL's Annexure-V "CHECK
   LIST": Section | Details of requirement | Document Type | Yes/No, page No.)
   Rows come from two places — auto-seeded from the AI-discovered annexures
   list, or parsed out of a checklist document the user uploads (format varies
   tender to tender) — and every row is auto-matched to whatever's actually
   sitting in My Documents, then stamped with that document's page range
   inside the current merge order. Recomputed on every My Documents reorder
   so the page numbers never drift from the real merged PDF. */

function normalizeForChecklistMatch(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Token-overlap similarity (0..1) — good enough for "Market Standing Certificate" vs "Market_Standing_Certi_2025.pdf". */
function checklistFuzzyScore(a, b) {
  const ta = new Set(normalizeForChecklistMatch(a).split(' ').filter(w => w.length > 2));
  const tb = new Set(normalizeForChecklistMatch(b).split(' ').filter(w => w.length > 2));
  if (!ta.size || !tb.size) return 0;
  let overlap = 0;
  for (const w of ta) if (tb.has(w)) overlap += 1;
  return overlap / Math.max(ta.size, tb.size);
}

/**
 * Re-derives every row's matched document, Yes/No, and page range from the
 * CURRENT My Documents order. A row's matched_doc_id is only re-guessed if
 * it isn't manually pinned (match_method !== 'manual') or if that pin no
 * longer resolves to a real document (e.g. the file was deleted) — a manual
 * pick always wins over auto-matching once made.
 */
function recomputeChecklistRows(checklist, orderedDocs) {
  let cursor = 1;
  const ranges = new Map();
  for (const doc of orderedDocs) {
    const pages = Number(doc.pages) > 0 ? Number(doc.pages) : 1;
    ranges.set(doc.id, { start: cursor, end: cursor + pages - 1 });
    cursor += pages;
  }
  const byId = new Map(orderedDocs.map(d => [d.id, d]));

  return (checklist || []).map(row => {
    let matchedId   = row.matched_doc_id || null;
    let matchMethod = row.match_method   || null;

    if (matchMethod !== 'manual' || !matchedId || !byId.has(matchedId)) {
      matchedId = null;
      matchMethod = null;
      if (row.annexure_id) {
        const byAnnexure = orderedDocs.find(d => d.annexure_id === row.annexure_id);
        if (byAnnexure) { matchedId = byAnnexure.id; matchMethod = 'annexure'; }
      }
      if (!matchedId) {
        let best = null, bestScore = 0;
        for (const doc of orderedDocs) {
          const score = checklistFuzzyScore(row.document_type, doc.name || doc.file_name);
          if (score > bestScore) { bestScore = score; best = doc; }
        }
        if (best && bestScore >= 0.4) { matchedId = best.id; matchMethod = 'fuzzy'; }
      }
    }

    const range = matchedId ? ranges.get(matchedId) : null;
    return {
      ...row,
      matched_doc_id:   matchedId,
      match_method:     matchMethod,
      matched_doc_name: matchedId ? (byId.get(matchedId)?.name || byId.get(matchedId)?.file_name || null) : null,
      status:           range ? 'yes' : 'no',
      page_range:       range ? (range.start === range.end ? `${range.start}` : `${range.start} - ${range.end}`) : null,
    };
  });
}

/** Loads uploaded_docs + checklist for a bid, ordered per `order` (doc ids) when given, else stored array order. Real files only — a merge's own output isn't a checklist target. */
async function loadChecklistContext(bidNo, order) {
  const [rows] = await db.query(
    `SELECT uploaded_docs, checklist, annexures FROM doc_prep_sessions WHERE bid_no = ? LIMIT 1`,
    [bidNo]
  );
  if (!rows.length) return null;
  const uploadedDocs = (parseCol(rows[0].uploaded_docs) || []).filter(d => !d.is_merged);
  const checklist    = parseCol(rows[0].checklist) || [];
  const annexures    = parseCol(rows[0].annexures) || [];

  let orderedDocs = uploadedDocs;
  if (Array.isArray(order) && order.length) {
    const byId = new Map(uploadedDocs.map(d => [d.id, d]));
    const seen = new Set();
    orderedDocs = order.map(id => byId.get(id)).filter(Boolean);
    orderedDocs.forEach(d => seen.add(d.id));
    for (const d of uploadedDocs) if (!seen.has(d.id)) orderedDocs.push(d);
  }
  return { uploadedDocs, checklist, annexures, orderedDocs };
}

/**
 * POST /api/doc-prep/:bidNo/checklist/sync-annexures
 * Adds one checklist row per AI-discovered annexure not already represented
 * (matched by annexure_id) — existing rows (manual or from an uploaded
 * checklist doc) are left untouched.
 */
exports.syncChecklistFromAnnexures = async (req, res) => {
  const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  try {
    await ensureTable();
    const ctx = await loadChecklistContext(bidNo);
    if (!ctx) return res.status(404).json({ success: false, message: 'Session not found' });

    const existingAnnexureIds = new Set(ctx.checklist.filter(r => r.annexure_id).map(r => r.annexure_id));
    const added = [];
    for (const ann of ctx.annexures) {
      if (existingAnnexureIds.has(ann.id)) continue;
      added.push({
        id:            `chk_${Date.now()}_${Math.round(Math.random() * 1e5)}`,
        section:       ann.mandatory ? 'A' : 'B',
        details:       ann.mandatory ? 'Mandatory documents' : 'Other documents',
        document_type: ann.annexure_ref ? `${ann.annexure_ref} - ${ann.title}` : (ann.title || 'Annexure'),
        source:        'annexure',
        annexure_id:   ann.id,
        matched_doc_id: null,
        match_method:  null,
        status:        'no',
        page_range:    null,
      });
    }
    const next = recomputeChecklistRows([...ctx.checklist, ...added], ctx.orderedDocs);
    await db.query(`UPDATE doc_prep_sessions SET checklist = ? WHERE bid_no = ?`, [JSON.stringify(next), bidNo]);
    return res.json({ success: true, checklist: next, added: added.length });
  } catch (err) {
    console.error('[doc-prep] syncChecklistFromAnnexures:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Reads Section/Details/Document Type checklist rows directly off rendered
 * page images via the vision model — shared by the manual "Upload Checklist
 * Document" flow and the automatic tender_checklist extraction that runs at
 * analysis time. Yes/No and page numbers are ignored from the source; those
 * are always recomputed from the real My Documents state, never trusted
 * from a scan. `source` tags where these rows came from (surfaced in the UI).
 */
async function extractChecklistRowsFromImages(images, source) {
  const systemPrompt = `You are an expert at reading checklist tables out of Indian government tender documents directly from images.`;
  const userPrompt = `These images show a bidder's document checklist (columns typically like Section, Details of requirement, Document Type, and a Yes/No + Page No. column).

Extract EVERY row as a JSON array, one object per row:
[{"section": "A", "details": "Mandatory documents", "document_type": "Manufacturing License"}, ...]

Rules:
- "section" is the section label/heading if the table has one (e.g. "A", "Mandatory documents") — use the nearest one above the row if cells are merged; use "" if there truly is none.
- "details" is the requirement description column (may be blank/repeated for grouped rows — use "" if genuinely empty).
- "document_type" is the actual document name/type required for that row — this is the important field, never leave it blank.
- IGNORE any Yes/No column and any page-number column entirely — do not include them.
- Skip header rows and empty rows.
- Respond with ONLY the JSON array, no other text.`;

  const raw = await callOllama(systemPrompt, userPrompt, 0.05, 8000, GEMMA_MODEL, images);
  let parsedRows;
  try { parsedRows = parseJsonResponse(raw); } catch { parsedRows = []; }
  if (!Array.isArray(parsedRows)) parsedRows = [];

  return parsedRows
    .filter(r => r && (r.document_type || '').trim())
    .map(r => ({
      id:             `chk_${Date.now()}_${Math.round(Math.random() * 1e5)}`,
      section:        (r.section || '').trim(),
      details:        (r.details || '').trim(),
      document_type:  r.document_type.trim(),
      source,
      annexure_id:    null,
      matched_doc_id: null,
      match_method:   null,
      status:         'no',
      page_range:     null,
    }));
}

/**
 * POST /api/doc-prep/:bidNo/checklist/import
 * Body: multipart file — a checklist document the user has for this tender
 * (format/columns vary tender to tender). Rendered and read by the
 * vision-capable model to pull out Section/Details/Document Type rows;
 * Yes/No and page numbers are ignored from the source — those are always
 * recomputed from the real My Documents state, never trusted from a scan.
 */
exports.importChecklistDocument = async (req, res) => {
  const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  let outDir;
  try {
    await ensureTable();
    let pdfPath = req.file.path;
    if (!isAlreadyPdf(pdfPath) && isConvertible(pdfPath)) {
      const pdfBuf = await convertToPdf(pdfPath);
      const converted = pdfPath.slice(0, -path.extname(pdfPath).length) + '.pdf';
      fs.writeFileSync(converted, pdfBuf);
      pdfPath = converted;
    }

    outDir = pdfPath.replace(/\.[^.]+$/, '') + '_checklist_pages';
    const imagePaths = await renderPdfPages(pdfPath, outDir, 5, undefined, undefined, 130, 'jpg');
    if (!imagePaths.length) {
      return res.status(400).json({ success: false, message: 'Could not read this file as a document.' });
    }
    const images = imagePaths.map(p => fs.readFileSync(p).toString('base64'));

    const newRows = await extractChecklistRowsFromImages(images, 'uploaded_checklist');

    if (!newRows.length) {
      return res.status(422).json({ success: false, message: 'No checklist rows could be read from this file.' });
    }

    const ctx = await loadChecklistContext(bidNo);
    if (!ctx) return res.status(404).json({ success: false, message: 'Session not found' });
    const next = recomputeChecklistRows([...ctx.checklist, ...newRows], ctx.orderedDocs);
    await db.query(`UPDATE doc_prep_sessions SET checklist = ? WHERE bid_no = ?`, [JSON.stringify(next), bidNo]);
    return res.json({ success: true, checklist: next, added: newRows.length });
  } catch (err) {
    console.error('[doc-prep] importChecklistDocument:', err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    if (outDir) { try { fs.rmSync(outDir, { recursive: true, force: true }); } catch { /* best effort */ } }
  }
};

/**
 * POST /api/doc-prep/:bidNo/checklist/recompute
 * Body: { order?: [uploadedDocId, ...] } — the current My Documents order
 * (frontend calls this every time that order changes, not just on merge).
 */
exports.recomputeChecklist = async (req, res) => {
  const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  const order = Array.isArray(req.body.order) ? req.body.order : undefined;
  try {
    await ensureTable();
    const ctx = await loadChecklistContext(bidNo, order);
    if (!ctx) return res.status(404).json({ success: false, message: 'Session not found' });
    const next = recomputeChecklistRows(ctx.checklist, ctx.orderedDocs);
    await db.query(`UPDATE doc_prep_sessions SET checklist = ? WHERE bid_no = ?`, [JSON.stringify(next), bidNo]);
    return res.json({ success: true, checklist: next });
  } catch (err) {
    console.error('[doc-prep] recomputeChecklist:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/** Sr.No/Particulars/Page No table HTML for the tender's own checklist, built from its current computed rows — same shape as the original tender-provided checklist page, just with the Page No. column actually filled in. */
function buildChecklistTableHtml(rows) {
  const tableRows = rows.map((r, i) => `
    <tr>
      <td style="border:1px solid #333; padding:4px 6px; text-align:center;">${i + 1}</td>
      <td style="border:1px solid #333; padding:4px 6px;">${(r.document_type || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
      <td style="border:1px solid #333; padding:4px 6px; text-align:center;">${r.status === 'yes' ? (r.page_range || 'Yes') : ''}</td>
    </tr>`).join('');
  return `
    <p style="text-align:center;font-weight:bold;">CHECK LIST OF THE TENDER DOCUMENTS</p>
    <p>List of Documents/Information uploaded/submitted with this Tender, with the page number on which each appears in the merged submission.</p>
    <table style="width:100%; border-collapse:collapse; border:1px solid #333;">
      <thead>
        <tr>
          <th style="border:1px solid #333; padding:4px 6px;">Sr. No.</th>
          <th style="border:1px solid #333; padding:4px 6px;">Particulars</th>
          <th style="border:1px solid #333; padding:4px 6px;">Page No.</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>`;
}

/**
 * POST /api/doc-prep/:bidNo/checklist/render-pdf
 * Body: { order?: [uploadedDocId, ...] } — the exact document order about to
 * be merged. Recomputes the checklist against that order (same as
 * /recompute) and returns the FILLED checklist as a ready-to-merge PDF
 * directly — this is what lets "Merge to PDF" bake real page numbers into
 * the checklist page automatically, with no separate manual step or
 * document sitting in My Documents.
 */
exports.renderChecklistPdf = async (req, res) => {
  const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  const order = Array.isArray(req.body.order) ? req.body.order : undefined;
  try {
    await ensureTable();
    const ctx = await loadChecklistContext(bidNo, order);
    if (!ctx) return res.status(404).json({ success: false, message: 'Session not found' });
    if (!ctx.checklist.length) return res.status(404).json({ success: false, message: 'No checklist rows for this tender' });

    const next = recomputeChecklistRows(ctx.checklist, ctx.orderedDocs);
    await db.query(`UPDATE doc_prep_sessions SET checklist = ? WHERE bid_no = ?`, [JSON.stringify(next), bidNo]);

    const division = (await getTenderDept(bidNo)) === 'Endo' ? 'Endo' : 'Diagno';
    const pdfBuf = await buildPdfBufferFromHtml(buildChecklistTableHtml(next), division);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.send(pdfBuf);
  } catch (err) {
    console.error('[doc-prep] renderChecklistPdf:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/doc-prep/:bidNo/checklist/apply-page-map
 * Body: { pageMap: [{ docId, start, end }, ...] }
 * Called by the merged-document page editor after a reorder/delete/insert —
 * it doesn't understand documents, only pages, so it computes (from the
 * merge's own stored page_map) which of the survivING pages still belong to
 * each source document and passes that back here as new 1-based ranges.
 * Only rows already matched to one of the given doc ids are touched — a doc
 * missing from pageMap (removed from the merge) is left as-is rather than
 * guessed at.
 */
exports.applyChecklistPageMap = async (req, res) => {
  const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  const pageMap = Array.isArray(req.body.pageMap) ? req.body.pageMap : [];
  if (!pageMap.length) return res.json({ success: true, checklist: null });
  try {
    await ensureTable();
    const ctx = await loadChecklistContext(bidNo);
    if (!ctx) return res.status(404).json({ success: false, message: 'Session not found' });

    const byDocId = new Map(pageMap.map(m => [m.docId, m]));
    const next = ctx.checklist.map(row => {
      const m = row.matched_doc_id ? byDocId.get(row.matched_doc_id) : null;
      if (!m) return row;
      return {
        ...row,
        status: 'yes',
        page_range: m.start === m.end ? `${m.start}` : `${m.start} - ${m.end}`,
      };
    });
    await db.query(`UPDATE doc_prep_sessions SET checklist = ? WHERE bid_no = ?`, [JSON.stringify(next), bidNo]);
    return res.json({ success: true, checklist: next });
  } catch (err) {
    console.error('[doc-prep] applyChecklistPageMap:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/doc-prep/:bidNo/page-to-html
 * Body: multipart file — a ONE-PAGE PDF (the merged-document page editor
 * extracts a single page client-side before calling this). Transcribes it
 * into clean, editable HTML via the vision model — same "read the page
 * image directly" approach used for annexure templates, just generic
 * (arbitrary already-filled content, not a blank format to fill in) — so a
 * page from a finished merged PDF can be opened in the real document editor
 * (tables and all) instead of only being annotatable.
 */
exports.pageToHtml = async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  let outDir;
  try {
    outDir = req.file.path + '_page_render';
    const imagePaths = await renderPdfPages(req.file.path, outDir, 1, 1, 1, 150, 'jpg');
    if (!imagePaths.length) {
      return res.status(400).json({ success: false, message: 'Could not render this page.' });
    }
    const images = [fs.readFileSync(imagePaths[0]).toString('base64')];

    const systemPrompt = `You are an expert at transcribing document page images into clean, editable HTML that reproduces the page's exact content and layout.`;
    const userPrompt = `The attached image is one page from a finished document. Transcribe it completely and exactly as clean HTML.

Rules:
- Reproduce EVERY word, number, and value exactly as shown — this is already-filled content, not a blank template, so do not invent or omit anything.
- Any table MUST be reproduced as a real HTML <table> with <tr>/<td> (or <th> for header rows) and a 1px solid border on the table and every cell — preserve every row and column exactly, including empty cells.
- Preserve headings, paragraph breaks, bold/italic emphasis, and alignment (centered titles, right-aligned signature lines, etc.) using plain inline-styled tags (<p style="text-align:center;font-weight:bold;">, <table>, <b>, etc.) — no external CSS, no class names, no markdown, no <html>/<head>/<body>.
- Ignore any letterhead logo/footer graphics — just the body content.

Respond with ONLY the HTML, nothing else — no explanation, no markdown fences.`;

    const raw = await callOllama(systemPrompt, userPrompt, 0.05, 12000, GEMMA_MODEL, images);
    const html = raw.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
    if (!html) return res.status(422).json({ success: false, message: 'Could not read this page.' });
    return res.json({ success: true, html_content: html });
  } catch (err) {
    console.error('[doc-prep] pageToHtml:', err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    try { if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); } catch { /* best effort */ }
    if (outDir) { try { fs.rmSync(outDir, { recursive: true, force: true }); } catch { /* best effort */ } }
  }
};

/**
 * POST /api/doc-prep/:bidNo/checklist
 * Body: { section?, details?, document_type }
 */
exports.addChecklistRow = async (req, res) => {
  const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  const documentType = (req.body.document_type || '').trim();
  if (!documentType) return res.status(400).json({ success: false, message: 'document_type is required' });
  try {
    await ensureTable();
    const ctx = await loadChecklistContext(bidNo);
    if (!ctx) return res.status(404).json({ success: false, message: 'Session not found' });
    const row = {
      id:             `chk_${Date.now()}_${Math.round(Math.random() * 1e5)}`,
      section:        (req.body.section || '').trim(),
      details:        (req.body.details || '').trim(),
      document_type:  documentType,
      source:         'manual',
      annexure_id:    null,
      matched_doc_id: null,
      match_method:   null,
      status:         'no',
      page_range:     null,
    };
    const next = recomputeChecklistRows([...ctx.checklist, row], ctx.orderedDocs);
    await db.query(`UPDATE doc_prep_sessions SET checklist = ? WHERE bid_no = ?`, [JSON.stringify(next), bidNo]);
    return res.json({ success: true, checklist: next });
  } catch (err) {
    console.error('[doc-prep] addChecklistRow:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * PATCH /api/doc-prep/:bidNo/checklist/:rowId
 * Body: any of { section, details, document_type, matched_doc_id, status, page_range }
 * Setting matched_doc_id here pins the row (match_method: 'manual') — future
 * recomputes keep that pick instead of re-guessing, unless the file is
 * deleted. Setting status/page_range directly lets the user hand-correct a
 * row entirely (e.g. a document that's physically inserted outside the
 * software's own merge) without needing a matched document at all.
 */
exports.updateChecklistRow = async (req, res) => {
  const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  const rowId = req.params.rowId;
  try {
    await ensureTable();
    const ctx = await loadChecklistContext(bidNo);
    if (!ctx) return res.status(404).json({ success: false, message: 'Session not found' });
    const idx = ctx.checklist.findIndex(r => r.id === rowId);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Checklist row not found' });

    const patch = {};
    for (const key of ['section', 'details', 'document_type']) {
      if (typeof req.body[key] === 'string') patch[key] = req.body[key].trim();
    }
    let manualOverride = false;
    if ('matched_doc_id' in req.body) {
      patch.matched_doc_id = req.body.matched_doc_id || null;
      patch.match_method   = patch.matched_doc_id ? 'manual' : null;
      manualOverride = true;
    }
    // A hand-typed status/page_range (no matched document) is a full manual
    // override — recompute must not silently clobber it back to "No".
    if ('status' in req.body || 'page_range' in req.body) {
      if (typeof req.body.status === 'string') patch.status = req.body.status;
      if (typeof req.body.page_range === 'string' || req.body.page_range === null) patch.page_range = req.body.page_range;
      if (!manualOverride && !patch.matched_doc_id) {
        patch.match_method = 'manual';
        patch.matched_doc_id = ctx.checklist[idx].matched_doc_id || null;
      }
    }

    const updatedRow = { ...ctx.checklist[idx], ...patch };
    const merged = [...ctx.checklist];
    merged[idx] = updatedRow;

    // Only re-derive via recompute when the edit didn't hand-set status/page_range
    // directly — otherwise trust exactly what the user typed.
    const next = ('status' in patch || 'page_range' in patch)
      ? merged
      : recomputeChecklistRows(merged, ctx.orderedDocs);

    await db.query(`UPDATE doc_prep_sessions SET checklist = ? WHERE bid_no = ?`, [JSON.stringify(next), bidNo]);
    return res.json({ success: true, checklist: next });
  } catch (err) {
    console.error('[doc-prep] updateChecklistRow:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * DELETE /api/doc-prep/:bidNo/checklist/:rowId
 */
exports.deleteChecklistRow = async (req, res) => {
  const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
  const rowId = req.params.rowId;
  try {
    await ensureTable();
    const ctx = await loadChecklistContext(bidNo);
    if (!ctx) return res.status(404).json({ success: false, message: 'Session not found' });
    const next = ctx.checklist.filter(r => r.id !== rowId);
    await db.query(`UPDATE doc_prep_sessions SET checklist = ? WHERE bid_no = ?`, [JSON.stringify(next), bidNo]);
    return res.json({ success: true, checklist: next });
  } catch (err) {
    console.error('[doc-prep] deleteChecklistRow:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
