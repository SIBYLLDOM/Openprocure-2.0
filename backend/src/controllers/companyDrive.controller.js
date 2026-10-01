'use strict';
const db       = require('../config/db');
const fs       = require('fs');
const path     = require('path');
const multer   = require('multer');
const pdfParse = require('pdf-parse');
const { callOllama, parseJsonResponse } = require('../utils/ollama');
const { sendMail } = require('../utils/mailer');

/* ─── Email ──────────────────────────────────────────────────────────────── */
async function notifyAdminsAboutDoc(docTitle, aiQuestions, uploaderName) {
  try {
    const [admins] = await db.query(
      "SELECT email FROM users WHERE role = 'Admin' AND status = 'Active'"
    );
    if (!admins.length) return;
    const emails = admins.map(a => a.email).filter(Boolean);
    if (!emails.length) return;
    await sendMail({
      to: emails,
      subject: `[AI Drive] Document Review Needed: "${docTitle}"`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#333">
        <h2 style="color:#084f9a">AI Drive — Document Requires Review</h2>
        <p>A newly uploaded document could not be fully understood by the AI and requires human review.</p>
        <table style="border-collapse:collapse;width:100%;max-width:580px">
          <tr><td style="padding:8px 12px;font-weight:bold;background:#f0f6ff;border:1px solid #dce8fb">Document</td><td style="padding:8px 12px;border:1px solid #dce8fb">${docTitle}</td></tr>
          <tr><td style="padding:8px 12px;font-weight:bold;background:#f0f6ff;border:1px solid #dce8fb">Uploaded by</td><td style="padding:8px 12px;border:1px solid #dce8fb">${uploaderName}</td></tr>
          <tr><td style="padding:8px 12px;font-weight:bold;background:#f0f6ff;border:1px solid #dce8fb">AI Questions / Uncertainties</td><td style="padding:8px 12px;border:1px solid #dce8fb">${aiQuestions}</td></tr>
        </table>
        <p style="margin-top:20px;font-size:12px;color:#999">Login to OpenProcure → Support Tools → AI Drive to review this document.</p>
      </div>`,
    });
  } catch (e) {
    console.warn('[company-drive] admin email failed:', e.message);
  }
}

/* ─── DB bootstrap ───────────────────────────────────────────────────────── */
const ensureTable = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS company_drive (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      doc_name     VARCHAR(500)  NOT NULL,
      title        VARCHAR(500)  NULL,
      file_path    VARCHAR(1000) NOT NULL,
      doc_type     VARCHAR(100)  DEFAULT 'other',
      category     ENUM('Endo','Diagno','Both','General') NOT NULL DEFAULT 'General',
      tags         JSON,
      description  TEXT,
      ai_summary   TEXT,
      ai_questions TEXT,
      ai_confidence TINYINT UNSIGNED NOT NULL DEFAULT 100,
      due_date     DATE NULL,
      uploaded_by  INT,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      use_count    INT DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Add new columns to existing tables (catch duplicate-column errors for idempotency)
  const alterCols = [
    "ALTER TABLE company_drive ADD COLUMN title          VARCHAR(500) NULL AFTER doc_name",
    "ALTER TABLE company_drive ADD COLUMN category       ENUM('Endo','Diagno','Both','General') NOT NULL DEFAULT 'General' AFTER doc_type",
    "ALTER TABLE company_drive ADD COLUMN due_date       DATE NULL",
    "ALTER TABLE company_drive ADD COLUMN ai_questions   TEXT NULL",
    "ALTER TABLE company_drive ADD COLUMN ai_confidence  TINYINT UNSIGNED NOT NULL DEFAULT 100",
  ];
  for (const sql of alterCols) {
    try { await db.query(sql); } catch (e) { if (!e.message.includes('Duplicate column')) throw e; }
  }
  try {
    await db.query("UPDATE company_drive SET title = doc_name WHERE title IS NULL");
  } catch { /* ignore */ }
};
ensureTable().catch(err => console.error('[company-drive] table init failed:', err));

/* ─── Multer ─────────────────────────────────────────────────────────────── */
const DRIVE_DIR = path.join(__dirname, '../../uploads/company-drive');
fs.mkdirSync(DRIVE_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DRIVE_DIR),
  filename:    (req, file, cb) => {
    const ext  = path.extname(file.originalname);
    const safe = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_\-]/g, '_');
    cb(null, `${Date.now()}-${safe}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Unsupported file type. Allowed: PDF, DOC, DOCX, JPG, PNG'));
  },
});
exports.uploadMiddleware = upload.single('file');

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function parseCol(v) {
  if (!v) return null;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
  return v;
}

async function extractSnippet(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  try {
    if (ext === '.pdf') {
      const buf  = fs.readFileSync(filePath);
      const data = await pdfParse(buf);
      return data.text.slice(0, 5000);
    }
    if (ext === '.docx') {
      const mammoth = require('mammoth');
      const result  = await mammoth.extractRawText({ path: filePath });
      return result.value.slice(0, 5000);
    }
    return fs.readFileSync(filePath, 'utf-8').slice(0, 5000);
  } catch {
    return '';
  }
}

/* ─── Controllers ────────────────────────────────────────────────────────── */

/**
 * POST /api/company-drive/upload
 */
exports.uploadDriveDoc = async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

  const {
    title       = '',
    doc_type    = 'other',
    category    = 'General',
    description = '',
    due_date    = '',
  } = req.body;

  const docName    = req.file.originalname;
  const filePath   = req.file.path;
  const docTitle   = title.trim() || docName;
  const dueDateVal = due_date && due_date.trim() ? due_date.trim() : null;

  try {
    await ensureTable();

    const snippet = await extractSnippet(filePath, docName);

    let tags = [], aiSummary = '', aiQuestions = null, aiConfidence = 100;

    if (snippet) {
      try {
        const system = `You are a document classifier for a medical device company's global archive used for Indian government tender submissions. Analyze the document and return ONLY valid JSON.`;
        const user   = `Document title: ${docTitle}
Document type: ${doc_type}
Category: ${category}
Description: ${description || 'none'}
Content sample:
${snippet}

Return ONLY this JSON:
{
  "tags": ["tag1", "tag2", "tag3"],
  "summary": "One or two sentence summary of what this document certifies or covers.",
  "questions": "One paragraph describing any ambiguities, missing information, unreadable content, or things requiring human verification. Return null (actual JSON null) if the document is clear and fully understood.",
  "confidence": <integer 0-100: 90-100=very clear, 70-89=minor uncertainties, below 70=significant gaps>
}

Tags must be lowercase and relevant to Indian government tender compliance (e.g. "iso-9001", "msme", "gst-registration", "manufacturer-auth", "quality-cert", "past-performance", "affidavit", "undertaking").`;

        const raw    = await callOllama(system, user, 0.1, 1500);
        const parsed = parseJsonResponse(raw);

        tags         = Array.isArray(parsed.tags)             ? parsed.tags            : [];
        aiSummary    = typeof parsed.summary    === 'string'  ? parsed.summary         : '';
        aiConfidence = typeof parsed.confidence === 'number'  ? Math.min(100, Math.max(0, Math.round(parsed.confidence))) : 100;

        // Guard against Ollama returning string "null" instead of JSON null
        if (parsed.questions !== null && parsed.questions !== undefined) {
          const q = String(parsed.questions);
          aiQuestions = (q.toLowerCase() === 'null' || q.trim() === '') ? null : q;
        }
      } catch (e) {
        console.warn('[company-drive] AI tagging failed:', e.message);
      }
    }

    const [result] = await db.query(
      `INSERT INTO company_drive
         (doc_name, title, file_path, doc_type, category, tags, description,
          ai_summary, ai_questions, ai_confidence, due_date, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        docName, docTitle, filePath, doc_type, category,
        JSON.stringify(tags), description,
        aiSummary, aiQuestions, aiConfidence,
        dueDateVal,
        req.user?.id || null,
      ]
    );

    // Notify admins if AI has questions or confidence is low
    if (aiQuestions || aiConfidence < 80) {
      let uploaderName = 'Unknown';
      try {
        if (req.user?.id) {
          const [[u]] = await db.query('SELECT name FROM users WHERE id = ?', [req.user.id]);
          if (u) uploaderName = u.name;
        }
      } catch { /* non-fatal */ }
      const questionText = aiQuestions || `Low AI confidence score: ${aiConfidence}%`;
      notifyAdminsAboutDoc(docTitle, questionText, uploaderName); // fire-and-forget
    }

    return res.json({
      success: true,
      data: {
        id: result.insertId, doc_name: docName, title: docTitle, doc_type, category,
        tags, ai_summary: aiSummary, ai_questions: aiQuestions,
        ai_confidence: aiConfidence, description, due_date: dueDateVal,
      },
    });

  } catch (err) {
    console.error('[company-drive] uploadDriveDoc:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/company-drive
 * Query: doc_type, category, search
 */
exports.listDriveDocs = async (req, res) => {
  const { doc_type, category, search } = req.query;
  try {
    await ensureTable();
    let sql = `SELECT id, doc_name, title, doc_type, category, tags, description,
                      ai_summary, ai_questions, ai_confidence,
                      due_date, uploaded_by, created_at, use_count
               FROM company_drive WHERE 1=1`;
    const vals = [];
    if (doc_type && doc_type !== 'all') { sql += ` AND doc_type = ?`;  vals.push(doc_type); }
    if (category && category !== 'All') { sql += ` AND category = ?`;  vals.push(category); }
    if (search) {
      sql += ` AND (title LIKE ? OR doc_name LIKE ? OR description LIKE ? OR ai_summary LIKE ?)`;
      const like = `%${search}%`;
      vals.push(like, like, like, like);
    }
    sql += ` ORDER BY use_count DESC, created_at DESC`;
    const [rows] = await db.query(sql, vals);
    return res.json({
      success: true,
      data: rows.map(r => ({ ...r, tags: parseCol(r.tags) || [] })),
    });
  } catch (err) {
    console.error('[company-drive] listDriveDocs:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/company-drive/nl-search
 * Body: { query: string }
 * Natural-language search against the document catalogue via Ollama.
 */
exports.nlSearchDriveDocs = async (req, res) => {
  const { query } = req.body;
  if (!query || !query.trim()) {
    return res.status(400).json({ success: false, message: 'query is required' });
  }
  try {
    await ensureTable();
    const [rows] = await db.query(
      `SELECT id, title, doc_name, doc_type, category, tags, ai_summary, due_date, created_at
       FROM company_drive ORDER BY use_count DESC, created_at DESC LIMIT 100`
    );
    if (!rows.length) return res.json({ success: true, data: [] });

    const catalogue = rows.map(r => ({
      id:         r.id,
      title:      r.title || r.doc_name,
      doc_type:   r.doc_type,
      category:   r.category,
      tags:       parseCol(r.tags) || [],
      ai_summary: r.ai_summary,
      due_date:   r.due_date ? String(r.due_date).slice(0, 10) : null,
      uploaded:   String(r.created_at).slice(0, 10),
    }));

    const system = `You are a document retrieval assistant for a medical device company's global document archive. The archive is used for Indian government tender compliance. Match documents to the user's natural-language query. Return ONLY valid JSON.`;
    const user   = `User query: "${query}"

Available documents:
${JSON.stringify(catalogue, null, 2)}

Return ONLY a JSON array of the best matching document IDs, ordered by relevance (best first), max 10 results. If nothing matches, return [].
[
  {
    "id": <number>,
    "reason": "One sentence explaining why this document matches the query."
  }
]`;

    const raw = await callOllama(system, user, 0.15, 2000);
    let matches;
    try { matches = parseJsonResponse(raw); }
    catch { matches = []; }
    if (!Array.isArray(matches)) matches = [];

    // Hydrate with full row data + attach nl_reason
    const idOrder   = matches.map(m => Number(m.id));
    const reasonMap = Object.fromEntries(matches.map(m => [Number(m.id), m.reason]));
    const matched   = rows.filter(r => idOrder.includes(r.id));
    matched.sort((a, b) => idOrder.indexOf(a.id) - idOrder.indexOf(b.id));

    // Fetch full rows (with ai_questions, ai_confidence, description)
    let fullRows = [];
    if (idOrder.length) {
      const placeholders = idOrder.map(() => '?').join(',');
      const [fr] = await db.query(
        `SELECT id, doc_name, title, doc_type, category, tags, description,
                ai_summary, ai_questions, ai_confidence, due_date, uploaded_by, created_at, use_count
         FROM company_drive WHERE id IN (${placeholders})`,
        idOrder
      );
      // Preserve relevance order
      fullRows = idOrder
        .map(id => fr.find(r => r.id === id))
        .filter(Boolean)
        .map(r => ({ ...r, tags: parseCol(r.tags) || [], nl_reason: reasonMap[r.id] || '' }));
    }

    // Increment use_count for matched docs
    if (idOrder.length) {
      await db.query(
        `UPDATE company_drive SET use_count = use_count + 1 WHERE id IN (${idOrder.map(() => '?').join(',')})`,
        idOrder
      );
    }

    return res.json({ success: true, data: fullRows });
  } catch (err) {
    console.error('[company-drive] nlSearchDriveDocs:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/company-drive/suggest
 * Body: { annexure_title, annexure_type, context }
 * Used by WorkspaceDocPrep — unchanged logic.
 */
exports.suggestDriveDocs = async (req, res) => {
  const { annexure_title, annexure_type, context = '' } = req.body;
  try {
    await ensureTable();
    const [rows] = await db.query(
      `SELECT id, doc_name, title, doc_type, category, tags, ai_summary
       FROM company_drive ORDER BY use_count DESC LIMIT 50`
    );
    if (!rows.length) return res.json({ success: true, data: [] });

    const docsSummary = rows.map(r => ({
      id: r.id, doc_name: r.title || r.doc_name, doc_type: r.doc_type,
      tags: parseCol(r.tags) || [], ai_summary: r.ai_summary,
    }));

    const system = `You are matching a company's document archive to Indian government tender requirements for Meril Life Sciences, a medical device company. Return ONLY valid JSON.`;
    const user   = `The tender requires this document/format:
Title: ${annexure_title}
Type:  ${annexure_type}
Template preview: ${context.slice(0, 1000)}

Available company documents in the archive:
${JSON.stringify(docsSummary, null, 2)}

Which documents from the archive are most relevant to help complete this tender format?
Return ONLY this JSON array (max 5 items, omit irrelevant ones):
[
  {
    "id": <number>,
    "doc_name": "...",
    "relevance_reason": "One sentence explaining why this is relevant."
  }
]`;

    const raw  = await callOllama(system, user, 0.2, 2000);
    let suggestions;
    try { suggestions = parseJsonResponse(raw); }
    catch { suggestions = []; }
    if (!Array.isArray(suggestions)) suggestions = [];

    if (suggestions.length > 0) {
      const ids = suggestions.map(s => s.id).filter(Boolean);
      if (ids.length) {
        await db.query(
          `UPDATE company_drive SET use_count = use_count + 1 WHERE id IN (${ids.map(() => '?').join(',')})`,
          ids
        );
      }
    }

    return res.json({ success: true, data: suggestions });
  } catch (err) {
    console.error('[company-drive] suggestDriveDocs:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * DELETE /api/company-drive/:id
 */
exports.deleteDriveDoc = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query(`SELECT file_path FROM company_drive WHERE id = ?`, [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Document not found' });
    try { fs.unlinkSync(rows[0].file_path); } catch { /* file already gone */ }
    await db.query(`DELETE FROM company_drive WHERE id = ?`, [id]);
    return res.json({ success: true });
  } catch (err) {
    console.error('[company-drive] deleteDriveDoc:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/company-drive/download/:id
 */
exports.downloadDriveDoc = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query(`SELECT doc_name, file_path FROM company_drive WHERE id = ?`, [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Document not found' });
    const { doc_name, file_path } = rows[0];
    if (!fs.existsSync(file_path)) return res.status(404).json({ success: false, message: 'File not found on disk' });
    res.download(file_path, doc_name);
  } catch (err) {
    console.error('[company-drive] downloadDriveDoc:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
