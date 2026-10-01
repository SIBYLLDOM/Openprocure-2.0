'use strict';
// "Letter Generate" — a per-tender file manager (folders + search) whose
// documents are produced by chat: "create a letter for Extension of
// Validity of Rate Contract" matches one of the client's own real letter
// formats (utils/letterTemplates.js) and fills it in with this tender's own
// details, the same way Doc Prep's chat-edit already drafts/edits documents
// via Ollama — see docPrep.controller.js's chatEdit for the sibling pattern.
const db = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { callOllama } = require('../utils/ollama');
const { matchTemplate } = require('../utils/letterTemplates');

const UPLOAD_DIR = path.join(__dirname, '../../uploads/letter-generate');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({ dest: UPLOAD_DIR, limits: { fileSize: 25 * 1024 * 1024 } });
exports.uploadMiddleware = upload.single('file');

const ensureTables = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS letter_folders (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      bid_number  VARCHAR(255) NOT NULL,
      name        VARCHAR(255) NOT NULL,
      created_by  INT NULL,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_bid_folder (bid_number, name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS letter_documents (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      bid_number    VARCHAR(255) NOT NULL,
      folder        VARCHAR(255) NOT NULL DEFAULT '',
      title         VARCHAR(500) NOT NULL,
      html_content  MEDIUMTEXT NULL,
      file_path     VARCHAR(1000) NULL,
      file_name     VARCHAR(500) NULL,
      source        ENUM('ai','upload') NOT NULL DEFAULT 'ai',
      template_used VARCHAR(500) NULL,
      created_by    INT NULL,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_bid (bid_number, folder)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};
ensureTables().catch((err) => console.error('[letter-generate] table init failed:', err));

/** Pulls whatever real fields this tender has on record — GEM or Open,
 * whichever exists — for the AI to draw on when filling a template. Not
 * every field will exist for every tender; that's fine, the prompt just
 * tells the AI to leave a bracketed placeholder rather than invent a value. */
async function getTenderContext(bidNumber) {
  const underscored = String(bidNumber).replace(/\//g, '_');
  const slashed = String(bidNumber).replace(/_/g, '/');

  const [[gem]] = await db.query(
    `SELECT bid_number, items, department, dept, start_date, end_date, emd_amount, bid_value, state, district
     FROM gem_tenders WHERE bid_number IN (?, ?) LIMIT 1`,
    [slashed, underscored]
  );
  if (gem) return { source: 'gem', ...gem };

  const [[open]] = await db.query(
    `SELECT tender_id AS bid_number, tender_title, organisation_name, organisation_chain, state,
            emd_amount, tender_value, bid_submission_end_date, bid_opening_date, tender_refno, location
     FROM open_tender_details WHERE tender_id IN (?, ?) LIMIT 1`,
    [underscored, slashed]
  );
  if (open) return { source: 'open', ...open };

  return { source: null, bid_number: bidNumber };
}

/** GET /api/letters/:bidNumber/folders */
exports.listFolders = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, name, created_at FROM letter_folders WHERE bid_number = ? ORDER BY name',
      [req.bidNumber]
    );
    res.json({ success: true, folders: rows });
  } catch (err) {
    console.error('[letter-generate] listFolders:', err);
    res.status(500).json({ success: false, message: 'Failed to load folders' });
  }
};

/** POST /api/letters/:bidNumber/folders  { name } */
exports.createFolder = async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'Folder name is required' });
    await db.query(
      'INSERT IGNORE INTO letter_folders (bid_number, name, created_by) VALUES (?, ?, ?)',
      [req.bidNumber, name, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[letter-generate] createFolder:', err);
    res.status(500).json({ success: false, message: 'Failed to create folder' });
  }
};

/** GET /api/letters/:bidNumber/documents?folder=&search= */
exports.listDocuments = async (req, res) => {
  try {
    const { folder = '', search = '' } = req.query;
    const conditions = ['bid_number = ?'];
    const params = [req.bidNumber];
    conditions.push('folder = ?');
    params.push(folder);
    if (search) {
      conditions.push('title LIKE ?');
      params.push(`%${search}%`);
    }
    const [rows] = await db.query(
      `SELECT id, folder, title, file_name, source, template_used, created_at
       FROM letter_documents WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
      params
    );
    res.json({ success: true, documents: rows });
  } catch (err) {
    console.error('[letter-generate] listDocuments:', err);
    res.status(500).json({ success: false, message: 'Failed to load documents' });
  }
};

/** GET /api/letters/:bidNumber/documents/:id */
exports.getDocument = async (req, res) => {
  try {
    const [[doc]] = await db.query(
      'SELECT * FROM letter_documents WHERE id = ? AND bid_number = ?',
      [req.params.id, req.bidNumber]
    );
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, document: doc });
  } catch (err) {
    console.error('[letter-generate] getDocument:', err);
    res.status(500).json({ success: false, message: 'Failed to load document' });
  }
};

/** GET /api/letters/:bidNumber/documents/:id/download?format=docx|html */
exports.downloadDocument = async (req, res) => {
  try {
    const [[doc]] = await db.query(
      'SELECT * FROM letter_documents WHERE id = ? AND bid_number = ?',
      [req.params.id, req.bidNumber]
    );
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });

    if (doc.source === 'upload' && doc.file_path) {
      if (!fs.existsSync(doc.file_path)) return res.status(404).json({ success: false, message: 'File missing on disk' });
      return res.download(doc.file_path, doc.file_name || doc.title);
    }

    if (!doc.html_content) return res.status(404).json({ success: false, message: 'Nothing to download' });

    const format = req.query.format === 'html' ? 'html' : 'docx';
    if (format === 'html') {
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Disposition', `attachment; filename="${(doc.title || 'letter').replace(/[^a-z0-9]+/gi, '_')}.html"`);
      return res.send(doc.html_content);
    }

    const HTMLtoDOCX = require('html-to-docx');
    const buffer = await HTMLtoDOCX(doc.html_content, null, {
      margins: { top: 1440, right: 1440, bottom: 1440, left: 1440, gutter: 0 },
      font: 'Calibri',
      fontSize: 22,
      table: { row: { cantSplit: true } },
      header: false,
      footer: false,
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${(doc.title || 'letter').replace(/[^a-z0-9]+/gi, '_')}.docx"`);
    res.send(buffer);
  } catch (err) {
    console.error('[letter-generate] downloadDocument:', err);
    res.status(500).json({ success: false, message: 'Failed to build download' });
  }
};

/** DELETE /api/letters/:bidNumber/documents/:id */
exports.deleteDocument = async (req, res) => {
  try {
    const [[doc]] = await db.query(
      'SELECT file_path FROM letter_documents WHERE id = ? AND bid_number = ?',
      [req.params.id, req.bidNumber]
    );
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    await db.query('DELETE FROM letter_documents WHERE id = ?', [req.params.id]);
    if (doc.file_path) fs.unlink(doc.file_path, () => {});
    res.json({ success: true });
  } catch (err) {
    console.error('[letter-generate] deleteDocument:', err);
    res.status(500).json({ success: false, message: 'Failed to delete' });
  }
};

/** POST /api/letters/:bidNumber/upload  multipart: file, folder */
exports.uploadFile = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const folder = req.body?.folder || '';
    const [result] = await db.query(
      `INSERT INTO letter_documents (bid_number, folder, title, file_path, file_name, source, created_by)
       VALUES (?, ?, ?, ?, ?, 'upload', ?)`,
      [req.bidNumber, folder, req.file.originalname, req.file.path, req.file.originalname, req.user.id]
    );
    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) {
    console.error('[letter-generate] uploadFile:', err);
    res.status(500).json({ success: false, message: 'Failed to upload file' });
  }
};

/**
 * POST /api/letters/:bidNumber/chat  { message, folder, history }
 * Matches the request to one of the ~7 real letter formats by keyword
 * overlap against each format's Subject line, pulls whatever real data this
 * tender has on record, and asks the model to produce a complete new letter
 * in that same house style — same Ollama call + HTML/reply-separator
 * contract as docPrep.controller.js's chatEdit, just generating a fresh
 * document instead of editing the currently-open one.
 */
exports.chatGenerate = async (req, res) => {
  const { message, folder = '' } = req.body || {};
  const history = Array.isArray(req.body?.history) ? req.body.history : [];
  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, message: 'message is required' });
  }

  try {
    const { template, matched } = await matchTemplate(message);
    const tender = await getTenderContext(req.bidNumber);

    const recentHistory = history.slice(-6);
    const historyText = recentHistory.length
      ? '\n\nPrevious conversation context:\n' +
        recentHistory.map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join('\n')
      : '';

    const tenderLines = Object.entries(tender)
      .filter(([k, v]) => k !== 'source' && v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');

    const systemPrompt = `You are OpenProcure AI, drafting a formal tender-related letter for an Indian government procurement submission, on behalf of Meril.

REFERENCE FORMAT — an actual letter this company has sent before, in the exact house style (reference number style, salutation, tone, closing signature block, and — if present — table structure) to follow:
---BEGIN REFERENCE LETTER---
${template ? template.body : '(no matching reference format found — use standard formal Indian government-tender correspondence style)'}
---END REFERENCE LETTER---

THIS TENDER'S KNOWN DETAILS (use these to fill in the letter — bid number, dates, buyer, EMD, etc.):
---BEGIN TENDER DATA---
${tenderLines || '(no tender data on record for this bid number)'}
---END TENDER DATA---

Instructions:
1. Produce a COMPLETE new letter as HTML (a single well-formed set of <p>/<table> elements — no <html>/<head>/<body> wrapper tags).
2. Follow the reference format's exact structure: Ref No./Date line, "To," addressee block, Subject line, salutation, body, closing ("Yours faithfully," / signature block) — reuse the reference letter's own signature block (company name, signatory name and title) verbatim unless the tender data clearly indicates a different division.
3. Fill in real values from THIS TENDER'S KNOWN DETAILS wherever the reference format has an equivalent field (bid/tender number, dates, buyer organisation, EMD amount, etc.).
4. Where a specific value the letter needs isn't available in the tender data (e.g. a bank UTR number, an exact rupee figure only the user knows), leave a clearly bracketed placeholder like [INSERT AMOUNT] rather than inventing one.
5. Keep the formal, professional tone of the reference letter.
6. After the HTML, write exactly this separator on its own line: |||REPLY|||
7. After the separator, write a brief 1-2 sentence note about what letter was drafted and which reference format it followed.

Output format:
[Complete letter HTML here]
|||REPLY|||
[Brief note]`;

    const userPrompt = `${historyText}\n\nRequest: ${message}`;

    // The model occasionally returns an empty/near-empty response for no
    // clear reason — never happened with a real error, so there's nothing
    // for the normal error path to catch. One retry before giving up rather
    // than silently saving a blank "letter" (which was actually observed
    // once during testing).
    let html = '';
    let reply = '';
    for (let attempt = 0; attempt < 2 && html.length < 40; attempt++) {
      const raw = await callOllama(systemPrompt, userPrompt, 0.15, 8000);
      const sepIdx = raw.indexOf('|||REPLY|||');
      if (sepIdx >= 0) {
        html = raw.slice(0, sepIdx).trim();
        reply = raw.slice(sepIdx + '|||REPLY|||'.length).trim();
      } else {
        html = raw.trim();
        reply = 'Letter drafted.';
      }
      html = html.replace(/^```html?\s*/i, '').replace(/```\s*$/, '').trim();
    }
    if (html.length < 40) {
      return res.status(502).json({ success: false, message: 'The AI returned an empty draft — please try again.' });
    }

    const subjectMatch = html.match(/Subject\s*:?\s*([^<\n]+)/i);
    const title = (subjectMatch ? subjectMatch[1] : message).trim().slice(0, 200) || 'Untitled letter';

    const [result] = await db.query(
      `INSERT INTO letter_documents (bid_number, folder, title, html_content, source, template_used, created_by)
       VALUES (?, ?, ?, ?, 'ai', ?, ?)`,
      [req.bidNumber, folder, title, html, template ? template.subject : null, req.user.id]
    );

    res.json({
      success: true,
      reply,
      matchedFormat: template ? template.subject : null,
      matchConfident: matched,
      document: { id: result.insertId, title, html_content: html, folder, source: 'ai' },
    });
  } catch (err) {
    console.error('[letter-generate] chatGenerate:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};
