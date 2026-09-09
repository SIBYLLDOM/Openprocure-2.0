const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');
const { ollamaChat, parseJsonResponse, isOllamaAvailable } = require('../utils/ollamaClient');

// Tenders > Offline Tender — clone of the AUTOMATION SITE reference's
// "Document Tender" page (Admin/User > document-tender), which lets a user
// hand-upload a tender's documents instead of waiting for the scraper to
// find it, and creates a real row in gem_tenders / open_tender_details from
// the extracted text.
//
// Deliberately scoped down from the reference: the reference OCRs scanned
// (image-only) PDFs by rendering each page and transcribing it through the
// Claude CLI — that's a whole extra pipeline (a Python render script + a
// CLI binary) this system doesn't have installed, so scanned/image PDFs
// aren't supported here; only PDFs with a real text layer, .docx, and
// .txt/.csv are. Processing also runs synchronously in the request rather
// than the reference's background-job-with-polling model, since text-only
// extraction is fast enough not to need it. If either limitation becomes a
// real problem, the job-table/polling shape can be added later without
// changing the upload contract.

const MAX_CHARS = 200000;

async function extractText(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  if (ext === '.pdf') {
    const data = await pdfParse(fs.readFileSync(filePath));
    return data.text || '';
  }
  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value || '';
  }
  if (ext === '.doc') {
    throw new Error('Legacy .doc files are not supported — please save as .docx or PDF and re-upload.');
  }
  return fs.readFileSync(filePath, 'utf8');
}

const EXTRACTION_SYSTEM_PROMPT = `You are extracting structured tender information from raw tender document text.
Return ONLY a JSON object with these exact keys (use null for anything not found):
{
  "tender_ref": string|null,       // tender reference/bid number as printed in the document
  "title": string|null,            // short tender title / item description
  "organisation_name": string|null,
  "state": string|null,
  "closing_date": string|null,     // as printed, do not reformat
  "opening_date": string|null,
  "emd_amount": string|null,
  "tender_value": string|null,
  "item_category": string|null,
  "eligibility_summary": string|null,
  "source_guess": "gem"|"open",    // "gem" if this looks like a GeM (Government e-Marketplace) bid, else "open"
  "division_guess": "endo"|"diagno"|"both"|null
}`;

// @route POST /api/tenders/document-tender   (multipart, field "files", up to 10)
exports.createFromDocuments = async (req, res) => {
  const files = req.files || [];
  try {
    if (!files.length) return res.status(400).json({ success: false, message: 'Please attach at least one document.' });

    let combinedText = '';
    for (const f of files) {
      try {
        const text = await extractText(f.path, f.originalname);
        combinedText += `\n\n--- ${f.originalname} ---\n${text}`;
      } catch (err) {
        return res.status(400).json({ success: false, message: `${f.originalname}: ${err.message}` });
      }
    }
    combinedText = combinedText.trim().slice(0, MAX_CHARS);
    if (!combinedText) return res.status(400).json({ success: false, message: 'No extractable text found in the uploaded document(s) — scanned/image-only PDFs are not supported here.' });

    let extracted = {};
    if (await isOllamaAvailable()) {
      const raw = await ollamaChat(EXTRACTION_SYSTEM_PROMPT, combinedText.slice(0, 12000));
      extracted = parseJsonResponse(raw) || {};
    }

    const tenderRef = (req.body.tenderRef || '').trim() || extracted.tender_ref || `OFFLINE-${Date.now()}`;
    const sourceChoice = req.body.source && req.body.source !== 'auto' ? req.body.source : (extracted.source_guess === 'gem' ? 'gem' : 'open');
    const divisionChoice = req.body.division && req.body.division !== 'auto' ? req.body.division : (extracted.division_guess || null);
    const deptValue = divisionChoice === 'both' ? 'endo' : (divisionChoice || null);

    const permDir = path.join(process.env.UPLOAD_DIR || 'uploads', 'tender-documents', tenderRef.replace(/[^a-zA-Z0-9._-]/g, '_'));
    if (!fs.existsSync(permDir)) fs.mkdirSync(permDir, { recursive: true });
    const savedFiles = files.map((f) => {
      const dest = path.join(permDir, path.basename(f.path));
      fs.renameSync(f.path, dest);
      return f.originalname;
    });

    let insertedId;
    if (sourceChoice === 'gem') {
      await sequelize.query(
        `INSERT INTO gem_tenders (bid_number, items, department, dept, state, emd_amount, bid_value, start_date, end_date, perfect_cat, json_data, created_at, updated_at)
         VALUES (:bid, :items, :organisation, :dept, :state, :emd, :value, :opening, :closing, 1, :json, NOW(), NOW())
         ON DUPLICATE KEY UPDATE items = VALUES(items), state = VALUES(state), emd_amount = VALUES(emd_amount), bid_value = VALUES(bid_value), perfect_cat = 1, updated_at = NOW()`,
        {
          replacements: {
            bid: tenderRef,
            items: extracted.title || tenderRef,
            organisation: extracted.organisation_name || null,
            dept: deptValue,
            state: extracted.state || null,
            emd: extracted.emd_amount || null,
            value: extracted.tender_value || null,
            opening: extracted.opening_date || null,
            closing: extracted.closing_date || null,
            json: JSON.stringify({ ...extracted, uploaded_files: savedFiles, source: 'offline-upload', uploaded_by: req.user.id }),
          },
        },
      );
      const [[row]] = await sequelize.query('SELECT id FROM gem_tenders WHERE bid_number = :bid', { replacements: { bid: tenderRef }, type: QueryTypes.SELECT }).then((r) => [r]);
      insertedId = row?.id;
    } else {
      await sequelize.query(
        `INSERT INTO open_tender_details (tender_id, tender_title, tender_refno, organisation_name, state, closing_date, opening_date, emd_amount, tender_value, product_category, dept, tender_details, downloaded_documents, relevency_checker, created_at, updated_at)
         VALUES (:tenderId, :title, :ref, :organisation, :state, :closing, :opening, :emd, :value, :category, :dept, :details, :docs, 'yes', NOW(), NOW())
         ON DUPLICATE KEY UPDATE tender_title = VALUES(tender_title), state = VALUES(state), emd_amount = VALUES(emd_amount), tender_value = VALUES(tender_value), relevency_checker = 'yes', updated_at = NOW()`,
        {
          replacements: {
            tenderId: tenderRef,
            title: extracted.title || tenderRef,
            ref: tenderRef,
            organisation: extracted.organisation_name || null,
            state: extracted.state || null,
            closing: extracted.closing_date || null,
            opening: extracted.opening_date || null,
            emd: extracted.emd_amount || null,
            value: extracted.tender_value || null,
            category: extracted.item_category || null,
            dept: deptValue,
            details: extracted.eligibility_summary || null,
            docs: JSON.stringify(savedFiles),
          },
        },
      );
      const [[row]] = await sequelize.query('SELECT row_id FROM open_tender_details WHERE tender_refno = :ref', { replacements: { ref: tenderRef }, type: QueryTypes.SELECT }).then((r) => [r]);
      insertedId = row?.row_id;
    }

    res.json({
      success: true,
      data: { id: insertedId, tenderRef, source: sourceChoice, division: divisionChoice, extracted },
    });
  } catch (err) {
    console.error('createFromDocuments error:', err);
    for (const f of files) { if (fs.existsSync(f.path)) fs.unlink(f.path, () => {}); }
    res.status(500).json({ success: false, message: err.message || 'Failed to create tender from documents' });
  }
};
