const db = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// =====================================================================
// Ensure the workdesk_documents table exists (auto-migration)
// =====================================================================
const ensureTable = async () => {
    await db.query(`
        CREATE TABLE IF NOT EXISTS \`workdesk_documents\` (
          \`id\`              INT NOT NULL AUTO_INCREMENT,
          \`bid_no\`          VARCHAR(255) NOT NULL COLLATE utf8mb4_unicode_ci,
          \`business_unit\`   ENUM('Endo','Diagno','Other') DEFAULT 'Other',
          \`workspace_dept\`  VARCHAR(255) DEFAULT NULL COLLATE utf8mb4_unicode_ci,
          \`document_name\`   VARCHAR(500) NOT NULL,
          \`file_path\`       VARCHAR(1000) NOT NULL,
          \`description\`     TEXT DEFAULT NULL,
          \`category\`        VARCHAR(255) DEFAULT NULL,
          \`uploaded_by\`     INT DEFAULT NULL,
          \`created_at\`      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          KEY \`idx_bid_no\` (\`bid_no\`),
          KEY \`idx_business_unit\` (\`business_unit\`),
          KEY \`idx_workspace_dept\` (\`workspace_dept\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
};
ensureTable().catch(err => console.error('workdesk_documents table init failed:', err));


const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Sanitise the tender ID so it works as a folder name
        const tenderId = (req.params.tenderId || 'unknown').replace(/[^a-zA-Z0-9_\-]/g, '_');
        const dir = path.join(__dirname, '../../uploads/workdesk', tenderId);
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
        const ext = path.extname(file.originalname);
        cb(null, unique + ext);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50 MB max
});

// Export the multer middleware so the router can use it
exports.upload = upload.single('file');

// =====================================================================
// Controllers
// =====================================================================

// POST /api/workdesk-docs/:tenderId/upload
exports.uploadDocument = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const tenderId = req.params.tenderId;                         // raw bid_no e.g. GEM/2026/B/7209438
        const uploadedBy = req.user?.id || null;
        const { business_unit = 'Other', workspace_dept = null, description = null, category = null } = req.body;

        const filePath = req.file.path;

        await db.query(
            `INSERT INTO workdesk_documents
             (bid_no, business_unit, workspace_dept, document_name, file_path, description, category, uploaded_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [tenderId, business_unit, workspace_dept, req.file.originalname, filePath, description, category, uploadedBy]
        );

        const [rows] = await db.query(
            `SELECT w.*, u.name as uploader_name 
             FROM workdesk_documents w 
             LEFT JOIN users u ON w.uploaded_by = u.id 
             WHERE w.id = LAST_INSERT_ID()`
        );

        res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
        console.error('uploadDocument error:', err);
        res.status(500).json({ error: 'Failed to upload document' });
    }
};

// GET /api/workdesk-docs/:tenderId?workspace_dept=Finance
exports.getDocuments = async (req, res) => {
    try {
        const tenderId = req.params.tenderId;
        const { workspace_dept } = req.query;

        let query = `
            SELECT w.*, u.name as uploader_name 
            FROM workdesk_documents w
            LEFT JOIN users u ON w.uploaded_by = u.id
            WHERE w.bid_no = ?
        `;
        const params = [tenderId];

        if (workspace_dept) {
            query += ' AND w.workspace_dept = ?';
            params.push(workspace_dept);
        }

        query += ' ORDER BY w.created_at DESC';

        const [rows] = await db.query(query, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('getDocuments error:', err);
        res.status(500).json({ error: 'Failed to fetch documents' });
    }
};

// DELETE /api/workdesk-docs/:docId
exports.deleteDocument = async (req, res) => {
    try {
        const { docId } = req.params;

        const [rows] = await db.query('SELECT * FROM workdesk_documents WHERE id = ?', [docId]);
        if (!rows.length) return res.status(404).json({ error: 'Document not found' });

        const doc = rows[0];

        // Delete from disk
        if (fs.existsSync(doc.file_path)) {
            fs.unlinkSync(doc.file_path);
        }

        await db.query('DELETE FROM workdesk_documents WHERE id = ?', [docId]);

        res.json({ success: true, message: 'Document deleted' });
    } catch (err) {
        console.error('deleteDocument error:', err);
        res.status(500).json({ error: 'Failed to delete document' });
    }
};

// GET /api/workdesk-docs/download/:docId
exports.downloadDocument = async (req, res) => {
    try {
        const { docId } = req.params;

        const [rows] = await db.query('SELECT * FROM workdesk_documents WHERE id = ?', [docId]);
        if (!rows.length) return res.status(404).json({ error: 'Document not found' });

        const doc = rows[0];

        if (!fs.existsSync(doc.file_path)) {
            return res.status(404).json({ error: 'File missing from disk' });
        }

        // Send the file as an attachment with its original name
        res.download(doc.file_path, doc.document_name);
    } catch (err) {
        console.error('downloadDocument error:', err);
        res.status(500).json({ error: 'Failed to download document' });
    }
};
const pdf = require('pdf-parse');

// =====================================================================
// AI Document Analysis
// =====================================================================

// POST /api/workdesk-docs/analyze/:docId
exports.analyzeDocument = async (req, res) => {
    try {
        const { docId } = req.params;

        // 1. Get the document metadata
        const [rows] = await db.query('SELECT * FROM workdesk_documents WHERE id = ?', [docId]);
        if (!rows.length) return res.status(404).json({ error: 'Document not found' });
        const doc = rows[0];

        if (!fs.existsSync(doc.file_path)) {
            return res.status(404).json({ error: 'File missing from disk' });
        }

        // 2. Extract text if it's a PDF
        let extractedText = '';
        if (doc.document_name.toLowerCase().endsWith('.pdf')) {
            const dataBuffer = fs.readFileSync(doc.file_path);
            const pdfData = await pdf(dataBuffer);
            extractedText = pdfData.text.substring(0, 15000); // Limit to 15k chars for prompt space
        } else {
            extractedText = `(Note: Direct text extraction not available for ${path.extname(doc.document_name)} files yet. Analysis based on metadata only.)`;
        }

        // 3. Gather Context: Tender Data
        let tenderContext = 'Unknown Tender';
        const [gemRows] = await db.query('SELECT items, end_date, bid_value FROM gem_tenders WHERE bid_number = ?', [doc.bid_no]);
        if (gemRows.length > 0) {
            tenderContext = `Tender: ${gemRows[0].items}\nDeadline: ${gemRows[0].end_date}\nBudget: ${gemRows[0].bid_value}`;
        }

        // 4. Gather Context: Other Workspace Documents
        const [otherDocs] = await db.query('SELECT document_name, category, description FROM workdesk_documents WHERE bid_no = ? AND id != ?', [doc.bid_no, docId]);
        const otherDocsList = otherDocs.map(d => `- ${d.document_name} (${d.category || 'N/A'})`).join('\n');

        // 5. Build AI Prompt
        const prompt = [
            'You are an AI Tender Expert specializing in document compliance and mistake detection.',
            '',
            '=== TENDER CONTEXT ===',
            tenderContext,
            '',
            '=== OTHER UPLOADED DOCUMENTS ===',
            otherDocsList || 'None',
            '',
            '=== ANALYZED DOCUMENT METADATA ===',
            `Name: ${doc.document_name}`,
            `Category: ${doc.category || 'N/A'}`,
            `Description: ${doc.description || 'N/A'}`,
            '',
            '=== DOCUMENT CONTENT (Snippet) ===',
            extractedText || 'No text extracted.',
            '',
            '=== TASK ===',
            '1. Analyze if this document matches the requirements of the tender mentioned above.',
            '2. Check for potential mistakes, missing sections, or inconsistencies.',
            '3. Provide actionable feedback to the user.',
            '',
            'Return your response in a clear, professional style with bullet points. Use bold text for key warnings.'
        ].join('\n');

        // 6. Call AI (using the standard gpt-4o-mini pattern as established)
        const API_KEY = process.env.OPENAI_API_KEY;
        const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: 'You are a professional tender compliance assistant.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.4
            })
        });

        if (!aiResponse.ok) {
            return res.status(500).json({ error: 'AI Analysis failed at origin' });
        }

        const aiData = await aiResponse.json();
        const feedback = aiData.choices[0].message.content;

        res.json({ success: true, feedback });

    } catch (err) {
        console.error('analyzeDocument error:', err);
        res.status(500).json({ error: 'Failed to analyze document' });
    }
};
