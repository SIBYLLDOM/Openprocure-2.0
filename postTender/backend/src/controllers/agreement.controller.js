const db = require('../config/db');
const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');
const pdf = require('pdf-parse');

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Generate Agreement Draft from Tender Document + LOA
const generateAgreement = async (req, res) => {
    try {
        const { bidNo } = req.body;
        const tenderDoc = req.files?.tender_document?.[0];
        const loaDoc = req.files?.loa_document?.[0];

        console.log(`[Agreement Gen] Request for Bid No: ${bidNo}`);
        console.log(`[Agreement Gen] Tender Doc: ${tenderDoc?.originalname || 'missing'}`);
        console.log(`[Agreement Gen] LOA Doc: ${loaDoc?.originalname || 'missing'}`);

        // Validate both files are present
        if (!bidNo || !tenderDoc || !loaDoc) {
            return res.status(400).json({
                success: false,
                message: 'Bid Number, Tender Document, and LOA Document are all required'
            });
        }

        // 1. Extract text from Tender Document
        let tenderText = '';
        try {
            const tenderBuffer = fs.readFileSync(tenderDoc.path);
            const tenderData = await pdf(tenderBuffer);
            tenderText = tenderData.text;
            console.log(`[Agreement Gen] Tender text extracted: ${tenderText.length} chars`);
        } catch (error) {
            console.error('Error parsing Tender PDF:', error);
            fs.unlinkSync(tenderDoc.path);
            if (loaDoc) fs.unlinkSync(loaDoc.path);
            return res.status(500).json({
                success: false,
                message: 'Failed to read Tender Document PDF'
            });
        }

        // 2. Extract text from LOA Document
        let loaText = '';
        try {
            const loaBuffer = fs.readFileSync(loaDoc.path);
            const loaData = await pdf(loaBuffer);
            loaText = loaData.text;
            console.log(`[Agreement Gen] LOA text extracted: ${loaText.length} chars`);
        } catch (error) {
            console.error('Error parsing LOA PDF:', error);
            fs.unlinkSync(tenderDoc.path);
            fs.unlinkSync(loaDoc.path);
            return res.status(500).json({
                success: false,
                message: 'Failed to read LOA Document PDF'
            });
        }

        // Clean up uploaded files
        fs.unlinkSync(tenderDoc.path);
        fs.unlinkSync(loaDoc.path);

        // Limit text length for GPT (combined limit)
        const MAX_LENGTH = 50000;
        if (tenderText.length > MAX_LENGTH) {
            tenderText = tenderText.substring(0, MAX_LENGTH) + '...[truncated]';
        }
        if (loaText.length > MAX_LENGTH) {
            loaText = loaText.substring(0, MAX_LENGTH) + '...[truncated]';
        }

        // 3. Call OpenAI with enhanced prompt
        console.log(`[Agreement Gen] Sending to AI (Tender: ${tenderText.length}, LOA: ${loaText.length})...`);

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "You are an expert legal contract specialist. Generate a comprehensive formal agreement between Buyer and Supplier based on the tender document and LOA provided. Extract ALL critical information including pricing, GST percentages, payment terms, delivery schedules, penalties, and any specific format requirements mentioned in the documents."
                },
                {
                    role: "user",
                    content: `Generate a comprehensive formal agreement for Bid No: ${bidNo}

**TENDER DOCUMENT:**
${tenderText}

**LOA (Letter of Acceptance):**
${loaText}

**CRITICAL REQUIREMENTS:**
1. Extract and include ALL pricing details with exact amounts
2. Extract and include GST percentage and tax details
3. Follow any specific format requirements mentioned in the tender
4. Include all payment terms, milestones, and schedules
5. Include delivery terms, timelines, and penalties for delays
6. Include warranty, quality standards, and specifications
7. Ensure consistency between tender terms and LOA acceptance
8. **STAMP PAPER**: If the tender mentions stamp paper requirements (e.g., "INDIAN NON JUDICIAL STAMP PAPER OF RS. 100"), include this EXACTLY at the beginning of the agreement with blank placeholders using underscores (____) for fields to be filled in
9. Format the output as professional HTML for a rich text editor

**OUTPUT FORMAT:**
- If stamp paper is mentioned, start with: "This Agreement is executed on INDIAN NON JUDICIAL STAMP PAPER OF RS. ____ on this ____ day of ____ 20__"
- Use proper HTML formatting with headings, paragraphs, lists
- Organize into clear sections (Parties, Terms, Pricing, Delivery, etc.)
- Highlight critical terms like pricing and GST in appropriate formatting
- Use underscores (____) for blank fields that need to be filled manually
- Ensure the agreement is legally sound and comprehensive`
                }
            ],
            temperature: 0.5,
        });

        const draftText = completion.choices[0].message.content;

        // Auto-save draft
        await db.query(`
            INSERT INTO agreement_drafts (bid_no, content) VALUES (?, ?)
            ON DUPLICATE KEY UPDATE content = VALUES(content)
        `, [bidNo, draftText]);

        console.log(`[Agreement Gen] ✅ Agreement generated successfully for ${bidNo}`);

        res.status(200).json({
            success: true,
            data: {
                bidNo,
                draftText
            }
        });

    } catch (error) {
        console.error('Error generating agreement:', error);
        res.status(500).json({ success: false, message: 'Server Error: ' + error.message });
    }
};

// Save Draft
const saveDraft = async (req, res) => {
    try {
        const { bidNo, content } = req.body;
        if (!bidNo || !content) return res.status(400).json({ success: false, message: 'Missing fields' });

        await db.query(`
            INSERT INTO agreement_drafts (bid_no, content) VALUES (?, ?)
            ON DUPLICATE KEY UPDATE content = VALUES(content)
        `, [bidNo, content]);

        res.status(200).json({ success: true, message: 'Draft saved' });
    } catch (error) {
        console.error('Error saving draft:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// Get Draft
const getDraft = async (req, res) => {
    try {
        const { bidNo } = req.params;
        const [rows] = await db.query('SELECT content, submitted FROM agreement_drafts WHERE bid_no = ?', [bidNo]);

        if (rows.length > 0) {
            res.status(200).json({
                success: true,
                data: {
                    content: rows[0].content,
                    submitted: rows[0].submitted
                }
            });
        } else {
            res.status(200).json({ success: false, message: 'No draft found' });
        }
    } catch (error) {
        console.error('Error fetching draft:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// Submit Agreement
const submitAgreement = async (req, res) => {
    try {
        const { bidNo, submittedBy } = req.body;
        if (!bidNo) return res.status(400).json({ success: false, message: 'Bid Number is required' });

        // Check if draft exists
        const [draft] = await db.query('SELECT id, submitted FROM agreement_drafts WHERE bid_no = ?', [bidNo]);

        if (draft.length === 0) {
            return res.status(404).json({ success: false, message: 'No draft found to submit' });
        }

        if (draft[0].submitted) {
            return res.status(400).json({ success: false, message: 'Agreement already submitted' });
        }

        // Update to submitted
        await db.query(`
            UPDATE agreement_drafts 
            SET submitted = 1, submitted_by = ?, submitted_at = NOW()
            WHERE bid_no = ?
        `, [submittedBy || 'Unknown', bidNo]);

        res.status(200).json({ success: true, message: 'Agreement submitted successfully' });
    } catch (error) {
        console.error('Error submitting agreement:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// Get Submitted Agreements (for Legal/Licensing page)
const getSubmittedAgreements = async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT 
                ad.*,
                asub.id as submission_id,
                asub.file_name,
                asub.status as submission_status,
                asub.uploaded_at as file_uploaded_at
            FROM agreement_drafts ad
            LEFT JOIN agreement_submission asub ON ad.bid_no = asub.bid_no
            WHERE ad.submitted = 1 
            ORDER BY ad.submitted_at DESC
        `);

        res.status(200).json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error fetching submitted agreements:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// Download Agreement Draft as Word-compatible HTML
const downloadAgreement = async (req, res) => {
    try {
        const { bidNo } = req.params;
        const [rows] = await db.query('SELECT content, bid_no FROM agreement_drafts WHERE bid_no = ?', [bidNo]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Agreement not found' });
        }

        const htmlContent = rows[0].content;
        const fileName = `Agreement_${bidNo.replace(/\//g, '_')}.doc`;

        // Create a complete HTML document that Word can open
        const fullHtml = `
<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.5; margin: 1in; }
        p { margin: 0 0 10px 0; }
    </style>
</head>
<body>
    ${htmlContent}
</body>
</html>`;

        res.setHeader('Content-Type', 'application/msword');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.send(fullHtml);

    } catch (error) {
        console.error('Error downloading agreement:', error);
        res.status(500).json({ success: false, message: 'Server Error: ' + error.message });
    }
};

// Upload Signed Agreement (by Legal Team)
const uploadSignedAgreement = async (req, res) => {
    try {
        const { bidNo, uploadedBy } = req.body;
        const file = req.file;

        if (!bidNo || !file) {
            return res.status(400).json({ success: false, message: 'Bid Number and file are required' });
        }

        // Save file info to database
        await db.query(`
            INSERT INTO agreement_submission (bid_no, file_path, file_name, uploaded_by)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
                file_path = VALUES(file_path),
                file_name = VALUES(file_name),
                uploaded_by = VALUES(uploaded_by),
                uploaded_at = CURRENT_TIMESTAMP
        `, [bidNo, file.path, file.filename, uploadedBy || 'Legal Team']);

        res.status(200).json({ success: true, message: 'Signed agreement uploaded successfully' });
    } catch (error) {
        console.error('Error uploading signed agreement:', error);
        res.status(500).json({ success: false, message: 'Server Error: ' + error.message });
    }
};

// Verify Signed Agreement (Mark as Verified)
const verifyAgreement = async (req, res) => {
    try {
        const { bidNo, verifiedBy } = req.body;

        if (!bidNo) {
            return res.status(400).json({ success: false, message: 'Bid Number is required' });
        }

        // Check if submission exists
        const [submission] = await db.query('SELECT id, status FROM agreement_submission WHERE bid_no = ?', [bidNo]);

        if (submission.length === 0) {
            return res.status(404).json({ success: false, message: 'No signed agreement found to verify' });
        }

        if (submission[0].status === 'Verified') {
            return res.status(400).json({ success: false, message: 'Agreement already verified' });
        }

        // Update to verified
        await db.query(`
            UPDATE agreement_submission 
            SET status = 'Verified', verified_by = ?, verified_at = NOW()
            WHERE bid_no = ?
        `, [verifiedBy || 'Admin', bidNo]);

        res.status(200).json({ success: true, message: 'Agreement verified successfully' });
    } catch (error) {
        console.error('Error verifying agreement:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

module.exports = {
    generateAgreement,
    saveDraft,
    getDraft,
    submitAgreement,
    getSubmittedAgreements,
    downloadAgreement,
    uploadSignedAgreement,
    verifyAgreement
};
