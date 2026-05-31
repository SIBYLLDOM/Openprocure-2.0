// src/controllers/pbg.controller.js
const db = require('../config/db');

// Get PBG overview
const getPBGOverview = async (req, res) => {
    try {
        const [records] = await db.query(`
      SELECT p.*, pt.buying_origin, pt.buying_mode, pt.won_date
      FROM pbg_records p
      JOIN participated_tenders pt ON p.bid_no = pt.bid_no
      ORDER BY p.created_at DESC
    `);

        res.status(200).json({
            success: true,
            count: records.length,
            data: records
        });
    } catch (error) {
        console.error('Error fetching PBG overview:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching PBG overview',
            error: error.message
        });
    }
};

// Get PBG tracker
const getPBGTracker = async (req, res) => {
    try {
        const [records] = await db.query(`
      SELECT p.*, pt.buying_origin
      FROM pbg_records p
      JOIN participated_tenders pt ON p.bid_no = pt.bid_no
      WHERE p.status != 'Expired'
      ORDER BY p.expiry_date ASC
    `);

        res.status(200).json({
            success: true,
            count: records.length,
            data: records
        });
    } catch (error) {
        console.error('Error fetching PBG tracker:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching PBG tracker',
            error: error.message
        });
    }
};

// Upload/Create PBG
const uploadPBG = async (req, res) => {
    try {
        const {
            bid_no,
            pbg_amount,
            pbg_percentage,
            validity_period,
            issue_date,
            expiry_date,
            bank_name,
            branch_name,
            reference_number,
            status,
            document_path,
            remarks
        } = req.body;

        const [result] = await db.query(
            `INSERT INTO pbg_records 
       (bid_no, pbg_amount, pbg_percentage, validity_period, issue_date, expiry_date, bank_name, branch_name, reference_number, status, document_path, remarks) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [bid_no, pbg_amount, pbg_percentage, validity_period, issue_date, expiry_date, bank_name, branch_name, reference_number, status || 'Draft', document_path, remarks]
        );

        res.status(201).json({
            success: true,
            message: 'PBG record created successfully',
            data: {
                id: result.insertId,
                bid_no
            }
        });
    } catch (error) {
        console.error('Error creating PBG record:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating PBG record',
            error: error.message
        });
    }
};

module.exports = {
    getPBGOverview,
    getPBGTracker,
    uploadPBG
};
