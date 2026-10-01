const db = require('../config/db');
const { DEFAULT_MODEL } = require('../utils/ollama');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { Ollama } = require('ollama');
const pdfParse = require('pdf-parse');
const ExcelJS = require('exceljs');
const mammoth = require('mammoth');
const AdmZip = require('adm-zip');

/* ─── DB table bootstrap ─────────────────────────────────────────── */
const ensureTable = async () => {
    await db.query(`
        CREATE TABLE IF NOT EXISTS tender_document_analysis (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            tender_id   VARCHAR(255) NOT NULL UNIQUE,
            required_documents JSON,
            templates   JSON,
            filled_templates   JSON,
            created_by  INT,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);
};

/* ─── Multer config ─────────────────────────────────────────────── */
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '../../uploads/tender-doc-analysis', req.params.tenderId);
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.originalname}`);
    }
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } }).array('files');

/* ─── Text extractors ───────────────────────────────────────────── */
const extractPdf = async (filePath) => {
    const buf = fs.readFileSync(filePath);
    const data = await pdfParse(buf);
    return data.text.slice(0, 20000);
};

const extractDocx = async (filePath) => {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value.slice(0, 20000);
};

const extractXlsx = async (filePath) => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const lines = [];
    workbook.eachSheet((sheet) => {
        sheet.eachRow((row) => {
            const cells = row.values.filter(Boolean).map(v => String(v)).join('\t');
            if (cells.trim()) lines.push(cells);
        });
    });
    return lines.join('\n').slice(0, 20000);
};

const extractText = async (filePath) => {
    return fs.readFileSync(filePath, 'utf-8').slice(0, 20000);
};

const extractFromFile = async (filePath, originalName) => {
    const ext = path.extname(originalName).toLowerCase();
    try {
        if (ext === '.pdf') return await extractPdf(filePath);
        if (ext === '.docx') return await extractDocx(filePath);
        if (ext === '.xlsx' || ext === '.xls') return await extractXlsx(filePath);
        return await extractText(filePath);
    } catch {
        return '';
    }
};

/* Extract all text from a ZIP — recurse one level */
const extractZip = async (zipPath, workDir) => {
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();
    let combined = '';
    for (const entry of entries) {
        if (entry.isDirectory) continue;
        const entryExt = path.extname(entry.entryName).toLowerCase();
        const outPath = path.join(workDir, `zip_${Date.now()}_${entry.name}`);
        zip.extractEntryTo(entry, workDir, false, true);
        const extracted = await extractFromFile(outPath, entry.name);
        combined += `\n\n=== ${entry.name} ===\n${extracted}`;
        try { fs.unlinkSync(outPath); } catch { /* ignore */ }
        if (combined.length > 60000) break;
    }
    return combined;
};

/* ─── Ollama helper ─────────────────────────────────────────────── */
const callOllama = async (systemPrompt, userPrompt) => {
    const ollama = new Ollama({ host: process.env.OLLAMA_HOST || 'https://api.openprocure.ai' });
    const resp = await ollama.chat({
        model: DEFAULT_MODEL,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        options: { temperature: 0.1, num_predict: 16000 }
    });
    return resp.message.content;
};

/* Strip markdown fences and parse JSON — mirrors deviationRepresentation.controller.js:149-169 */
const parseJsonResponse = (raw) => {
    let cleaned = raw.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
    try { return JSON.parse(cleaned); } catch { /* fall through */ }
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) return JSON.parse(objMatch[0]);
    throw new Error('No JSON found in model response');
};

/* ─── Controllers ───────────────────────────────────────────────── */

/**
 * POST /api/tender-doc-analysis/:tenderId/upload
 * Accepts files (including ZIP), extracts text, calls Ollama, persists result.
 */
const uploadAndAnalyze = async (req, res) => {
    upload(req, res, async (uploadErr) => {
        if (uploadErr) {
            return res.status(400).json({ success: false, message: uploadErr.message });
        }
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, message: 'No files uploaded' });
        }

        const { tenderId } = req.params;
        const workDir = path.join(__dirname, '../../uploads/tender-doc-analysis', tenderId);

        try {
            await ensureTable();

            /* Extract text from every uploaded file */
            let combinedText = '';
            for (const file of req.files) {
                const ext = path.extname(file.originalname).toLowerCase();
                let text = '';
                if (ext === '.zip') {
                    text = await extractZip(file.path, workDir);
                } else {
                    text = await extractFromFile(file.path, file.originalname);
                }
                combinedText += `\n\n=== ${file.originalname} ===\n${text}`;
                if (combinedText.length > 80000) break;
            }

            if (!combinedText.trim()) {
                return res.status(422).json({ success: false, message: 'Could not extract any text from the uploaded files.' });
            }

            const systemPrompt = `You are an expert tender compliance analyst for Meril Life Sciences, a medical device company. Analyze tender documents and extract all required submissions and exact format templates. Return ONLY valid JSON, no markdown, no explanation.`;

            const userPrompt = `Analyze the following tender document text and return a JSON object with exactly two keys:

1. "required_documents": array of objects, each with:
   - "name": string (document name)
   - "description": string (what it should contain / purpose)
   - "type": one of "certificate" | "declaration" | "technical" | "financial" | "format"
   - "is_template": boolean (true if a fillable format/template is provided in the document)

2. "templates": array of objects for every form/format/template found in the document, each with:
   - "name": string (form/annexure name)
   - "description": string (brief purpose)
   - "verbatim_content": string — COPY THE EXACT TEXT of the template verbatim, character for character, comma for comma, line break for line break. Replace every blank line / underscores / fill-in space meant for the bidder with a [FILL:field_name] marker using a descriptive field_name. Do NOT paraphrase or summarise the template — preserve it completely.

Tender document text:
${combinedText.slice(0, 70000)}

Return ONLY the JSON object. No markdown, no explanation.`;

            const raw = await callOllama(systemPrompt, userPrompt);
            const parsed = parseJsonResponse(raw);

            const required_documents = Array.isArray(parsed.required_documents) ? parsed.required_documents : [];
            const templates = Array.isArray(parsed.templates) ? parsed.templates : [];

            /* Upsert into DB */
            await db.query(`
                INSERT INTO tender_document_analysis (tender_id, required_documents, templates, filled_templates, created_by)
                VALUES (?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    required_documents = VALUES(required_documents),
                    templates = VALUES(templates),
                    filled_templates = '[]',
                    updated_at = NOW()
            `, [tenderId, JSON.stringify(required_documents), JSON.stringify(templates), '[]', req.user?.id || null]);

            return res.json({ success: true, required_documents, templates });

        } catch (err) {
            console.error('uploadAndAnalyze error:', err);
            return res.status(500).json({ success: false, message: err.message });
        }
    });
};

/**
 * POST /api/tender-doc-analysis/:tenderId/fill-template
 * Body: { template_index, verbatim_content }
 * Fills [FILL:*] markers with Meril data using Ollama. Does NOT save — user edits first.
 */
const fillTemplate = async (req, res) => {
    const { tenderId } = req.params;
    const { verbatim_content, template_index } = req.body;

    if (!verbatim_content) {
        return res.status(400).json({ success: false, message: 'verbatim_content is required' });
    }

    try {
        const companyPath = path.join(__dirname, '../asset/meril_company.json');
        const company = JSON.parse(fs.readFileSync(companyPath, 'utf-8'));

        const systemPrompt = `You are filling in a tender document template for ${company.company_name}. You must preserve EVERY character, every comma, every punctuation mark, and every line break of the template exactly. Only replace [FILL:field_name] markers with appropriate data.`;

        const userPrompt = `Fill the following tender template for our company. Replace each [FILL:field_name] marker with the correct value from our company details below. Preserve all other text, spacing, and formatting exactly — do not change a single character outside the markers.

Company Details:
${JSON.stringify(company, null, 2)}

Tender Reference: ${tenderId}

Template to fill:
${verbatim_content}

Return ONLY the filled template text. No explanation, no markdown wrapping.`;

        const filled = await callOllama(systemPrompt, userPrompt);

        return res.json({ success: true, filled_content: filled.trim(), template_index });

    } catch (err) {
        console.error('fillTemplate error:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * POST /api/tender-doc-analysis/:tenderId/save
 * Body: { required_documents?, templates?, filled_templates? }
 */
const saveAnalysis = async (req, res) => {
    const { tenderId } = req.params;
    const { required_documents, templates, filled_templates } = req.body;

    try {
        await ensureTable();
        await db.query(`
            INSERT INTO tender_document_analysis (tender_id, required_documents, templates, filled_templates, created_by)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                required_documents = COALESCE(VALUES(required_documents), required_documents),
                templates          = COALESCE(VALUES(templates), templates),
                filled_templates   = COALESCE(VALUES(filled_templates), filled_templates),
                updated_at = NOW()
        `, [
            tenderId,
            required_documents ? JSON.stringify(required_documents) : null,
            templates ? JSON.stringify(templates) : null,
            filled_templates ? JSON.stringify(filled_templates) : null,
            req.user?.id || null
        ]);

        return res.json({ success: true, message: 'Analysis saved successfully' });
    } catch (err) {
        console.error('saveAnalysis error:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * GET /api/tender-doc-analysis/:tenderId
 */
const getAnalysis = async (req, res) => {
    const { tenderId } = req.params;
    try {
        await ensureTable();
        const [rows] = await db.query(
            `SELECT required_documents, templates, filled_templates, updated_at FROM tender_document_analysis WHERE tender_id = ?`,
            [tenderId]
        );

        if (rows.length === 0) {
            return res.json({ success: false, message: 'No analysis found' });
        }

        const row = rows[0];
        const parse = (v) => {
            if (!v) return [];
            if (typeof v === 'string') return JSON.parse(v);
            return v;
        };

        return res.json({
            success: true,
            data: {
                required_documents: parse(row.required_documents),
                templates: parse(row.templates),
                filled_templates: parse(row.filled_templates),
                updated_at: row.updated_at
            }
        });
    } catch (err) {
        console.error('getAnalysis error:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = { uploadAndAnalyze, fillTemplate, saveAnalysis, getAnalysis };
