const db = require('../config/db');
const OpenAI = require('openai');
const axios = require('axios');
const fs = require('fs');

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Helper: Download file to buffer
const downloadFile = async (url) => {
    // In real implementation, validate URL and handle errors thoroughly
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return response.data;
};

// Draft PBG by fetching tender document and using AI
const draftPBG = async (req, res) => {
    try {
        // Change: Get bidNo from body to handle slashes safely
        const { bidNo } = req.body;

        if (!bidNo) {
            return res.status(400).json({
                success: false,
                message: 'Bid Number is required'
            });
        }

        console.log(`[PBG Draft] Request Body:`, req.body);
        console.log(`[PBG Draft] Request received for Bid No: ${bidNo}`);

        // 1. Fetch Detail URL from gem_tenders
        // const [tenders] = await db.query('SELECT detail_url FROM gem_tenders WHERE bid_number = ?', [bidNo]);

        let detailUrl = 'https://gem.gov.in/mock-tender-document.pdf'; // Fallback / Mock

        // Mock DB check (uncomment when data is inserted)
        /*
        if (tenders.length > 0) {
            detailUrl = tenders[0].detail_url;
        } else {
            console.log(`[PBG Draft] No record found in gem_tenders for ${bidNo}. Using mock URL.`);
        }
        */

        console.log(`[PBG Draft] Found Detail URL: ${detailUrl}`);

        // 2. Download Document Context (Simulated extraction for now)
        // In production: download file, parse text using pdf-parse or similar
        const documentText = `This is a tender document for Bid Number ${bidNo}. The item required is generic items. The PBG required is 3% of the contract value. The buyer is the Department of Procurement.`;

        // Check for API Key
        if (!process.env.OPENAI_API_KEY) {
            console.warn('[PBG Draft] No API Key provided. Returning mock response.');
            return res.status(200).json({
                success: true,
                message: 'PBG Draft generated (MOCK - Set API Key for Real AI)',
                data: {
                    bidNo,
                    draftText: `[MOCK DRAFT START]\nPBG for ${bidNo}...\n(Real AI generation skipped due to missing API key)\n[MOCK DRAFT END]`,
                    sourceUrl: detailUrl
                }
            });
        }

        // 3. Call OpenAI API with specific model
        console.log(`[PBG Draft] Sending content to AI (Model: 4.1-nano)...`);

        const completion = await openai.chat.completions.create({
            model: "gpt-4.1-nano", // Specific model requested by user
            messages: [
                {
                    role: "system",
                    content: "You are a legal expert assistant. Draft a formal Performance Bank Guarantee (PBG) based on the tender document details provided."
                },
                {
                    role: "user",
                    content: `Draft a Performance Bank Guarantee for Bid No: ${bidNo}.\n\nContext extracted from tender: ${documentText}`
                }
            ],
            temperature: 0.7,
        });

        const draftText = completion.choices[0].message.content;

        res.status(200).json({
            success: true,
            message: 'PBG Draft generated successfully',
            data: {
                bidNo,
                draftText,
                sourceUrl: detailUrl
            }
        });

    } catch (error) {
        console.error('Error drafting PBG:', error);

        // Handle specific OpenAI errors
        if (error.code === 'model_not_found') {
            return res.status(400).json({
                success: false,
                message: 'Model "4.1-nano" not found or not accessible with current API key.',
                error: error.message
            });
        }

        // Handle OpenAI 400 Bad Request (invalid model often returns 400 too)
        if (error.status === 400) {
            return res.status(400).json({
                success: false,
                message: `OpenAI API Error: ${error.message}`,
                error: error
            });
        }

        res.status(500).json({
            success: false,
            message: 'Error drafting PBG',
            error: error.message
        });
    }
};

// Save PBG Draft
const saveDraft = async (req, res) => {
    try {
        const {
            bidNo, content,
            pbg_amount, pbg_percentage, validity_period,
            issue_date, expiry_date, bank_name, branch_name, reference_number, remarks
        } = req.body;

        if (!bidNo || !content) {
            return res.status(400).json({
                success: false,
                message: 'Bid Number and Content are required'
            });
        }

        console.log(`[PBG Draft] Saving draft for Bid No: ${bidNo}`);

        // Upsert draft into pbg_drafts table
        const query = `
            INSERT INTO pbg_drafts (
                bid_no, content,
                pbg_amount, pbg_percentage, validity_period,
                issue_date, expiry_date, bank_name, branch_name, reference_number, remarks
            ) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
            ON DUPLICATE KEY UPDATE 
                content = VALUES(content),
                pbg_amount = VALUES(pbg_amount),
                pbg_percentage = VALUES(pbg_percentage),
                validity_period = VALUES(validity_period),
                issue_date = VALUES(issue_date),
                expiry_date = VALUES(expiry_date),
                bank_name = VALUES(bank_name),
                branch_name = VALUES(branch_name),
                reference_number = VALUES(reference_number),
                remarks = VALUES(remarks)
        `;

        // Execute DB Query
        await db.query(query, [
            bidNo, content,
            pbg_amount || null, pbg_percentage || null, validity_period || null,
            issue_date || null, expiry_date || null, bank_name || null, branch_name || null, reference_number || null, remarks || null
        ]);

        console.log(`[PBG Draft] Saved content length: ${content.length}`);

        res.status(200).json({
            success: true,
            message: 'Draft saved successfully'
        });

    } catch (error) {
        console.error('Error saving draft:', error);
        res.status(500).json({
            success: false,
            message: 'Error saving draft',
            error: error.message
        });
    }
};

// Get Saved PBG Draft
const getDraft = async (req, res) => {
    try {
        const { bidNo } = req.params;

        console.log(`[PBG Draft] Fetching saved draft for Bid No: ${bidNo}`);

        const [rows] = await db.query('SELECT * FROM pbg_drafts WHERE bid_no = ?', [bidNo]);

        // const rows = []; // Emulate empty if not found, or populate if testing persistence

        if (rows.length > 0) {
            res.status(200).json({
                success: true,
                data: rows[0]
            });
        } else {
            res.status(200).json({
                success: false, // Not found is strictly not an error, just no draft
                message: 'No saved draft found'
            });
        }

    } catch (error) {
        console.error('Error fetching draft:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching draft',
            error: error.message
        });
    }
};

// Submit PBG Draft
const submitDraft = async (req, res) => {
    try {
        const { bidNo, empId } = req.body;

        if (!bidNo || !empId) {
            return res.status(400).json({
                success: false,
                message: 'Bid Number and Employee ID are required'
            });
        }

        console.log(`[PBG Draft] Submitting draft for Bid No: ${bidNo} by ${empId}`);

        // Update submission status
        const query = `
            UPDATE pbg_drafts 
            SET submitted = 1, submitted_by = ?, submitted_at = NOW() 
            WHERE bid_no = ?
        `;

        const [result] = await db.query(query, [empId, bidNo]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Draft not found to submit'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Draft submitted successfully to financial team'
        });

    } catch (error) {
        console.error('Error submitting draft:', error);
        res.status(500).json({
            success: false,
            message: 'Error submitting draft',
            error: error.message
        });
    }
};

module.exports = {
    draftPBG,
    saveDraft,
    getDraft,
    submitDraft
};
