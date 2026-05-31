const db = require('../config/db');
const path = require('path');
const fs = require('fs');

// Fetch pending PBGs (Drafts that are not yet in PBG Records)
const getPendingUploads = async (req, res) => {
    try {
        console.log('[PBG Upload] Fetching pending uploads...');

        // Query logic: Select bid_no from pbg_drafts where it does not exist in pbg_records
        const query = `
            SELECT 
                d.bid_no, 
                COALESCE(c.contract_no, 'TBD') as contract_no, 
                t.won_date as contract_date, 
                d.submitted_at
            FROM pbg_drafts d
            JOIN participated_tenders t ON d.bid_no = t.bid_no
            LEFT JOIN orders_rows c ON d.bid_no = c.bid_no
            WHERE d.bid_no NOT IN (SELECT bid_no FROM pbg_records)
        `;

        const [rows] = await db.query(query);

        const data = rows.map(row => ({
            bidNo: row.bid_no,
            contractNo: row.contract_no || 'NA', // Need actual column if exists, derived for now
            contractDate: row.contract_date,
            draftSubmittedAt: row.submitted_at
        }));

        res.status(200).json({
            success: true,
            data: data
        });

    } catch (error) {
        console.error('Error fetching pending PBGs:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching pending PBGs',
            error: error.message
        });
    }
};

// Upload PBG Document
const uploadPBG = async (req, res) => {
    try {
        const {
            bidNo, userId, contract_no
        } = req.body;
        const file = req.file;

        if (!bidNo || !file) {
            return res.status(400).json({
                success: false,
                message: 'Bid Number and File are required'
            });
        }

        console.log(`[PBG Upload] Uploading for Bid: ${bidNo}, User: ${userId}`);

        // Fetch draft details to inherit existing metadata
        const [drafts] = await db.query('SELECT * FROM pbg_drafts WHERE bid_no = ?', [bidNo]);
        const draft = drafts.length > 0 ? drafts[0] : {};

        // Construct file path to store in DB
        const documentPath = file.path;

        // Insert into pbg_records
        const insertQuery = `
            INSERT INTO pbg_records (
                bid_no, contract_no, document_path, uploaded_by_user_id, status,
                pbg_amount, pbg_percentage, validity_period,
                issue_date, expiry_date, bank_name, branch_name, reference_number, remarks
            )
            VALUES (?, ?, ?, ?, 'Submitted', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const finalUserId = userId || 1; // Fallback

        await db.query(insertQuery, [
            bidNo, contract_no || null, documentPath, finalUserId,
            draft.pbg_amount || null, draft.pbg_percentage || null, draft.validity_period || null,
            draft.issue_date || null, draft.expiry_date || null, draft.bank_name || null, draft.branch_name || null, draft.reference_number || null, draft.remarks || null
        ]);

        res.status(201).json({
            success: true,
            message: 'PBG uploaded and recorded successfully'
        });

    } catch (error) {
        console.error('Error uploading PBG:', error);
        res.status(500).json({
            success: false,
            message: 'Error uploading PBG',
            error: error.message
        });
    }
};

// Fetch List of Banks
const getBanks = async (req, res) => {
    try {
        const query = 'SELECT DISTINCT bank_name FROM banks ORDER BY bank_name ASC';
        const [rows] = await db.query(query);
        res.status(200).json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching banks:', error);
        res.status(500).json({ success: false, message: 'Error fetching banks' });
    }
};

// Fetch Branches for a Bank
const getBranches = async (req, res) => {
    try {
        const { bankName } = req.query;
        if (!bankName) return res.status(400).json({ success: false, message: 'Bank name required' });

        const query = 'SELECT branch_name, ifsc_code FROM banks WHERE bank_name = ? ORDER BY branch_name ASC';
        const [rows] = await db.query(query, [bankName]);
        res.status(200).json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching branches:', error);
        res.status(500).json({ success: false, message: 'Error fetching branches' });
    }
};

module.exports = {
    getPendingUploads,
    uploadPBG,
    getBanks,
    getBranches
};
