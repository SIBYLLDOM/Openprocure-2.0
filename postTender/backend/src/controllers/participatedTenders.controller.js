// src/controllers/participatedTenders.controller.js
const db = require('../config/db');

// Get all participated tenders
// Get all participated tenders
const getAllParticipatedTenders = async (req, res) => {
    try {
        // Support filtering by won_status (e.g., ?status=Won)
        const { status } = req.query;

        let query = `
            SELECT t.*, 
                   CASE WHEN p.id IS NOT NULL THEN 1 ELSE 0 END as is_drafted,
                   p.submitted 
            FROM participated_tenders t
            LEFT JOIN pbg_drafts p ON t.bid_no = p.bid_no
        `;
        const queryParams = [];

        if (status) {
            query += ' WHERE t.won_status = ?';
            queryParams.push(status);
        }

        query += ' ORDER BY t.won_date DESC';

        const [tenders] = await db.query(query, queryParams);

        res.status(200).json({
            success: true,
            count: tenders.length,
            data: tenders
        });
    } catch (error) {
        console.error('Error fetching participated tenders:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching participated tenders',
            error: error.message
        });
    }
};

// Get participated tender by bid_no
const getParticipatedTenderByBidNo = async (req, res) => {
    try {
        const { bidNo } = req.params;

        const [tenders] = await db.query(
            'SELECT * FROM participated_tenders WHERE bid_no = ?',
            [bidNo]
        );

        if (tenders.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Tender not found'
            });
        }

        res.status(200).json({
            success: true,
            data: tenders[0]
        });
    } catch (error) {
        console.error('Error fetching tender:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching tender',
            error: error.message
        });
    }
};

// Create new participated tender
const createParticipatedTender = async (req, res) => {
    try {
        const {
            bid_no,
            won_status,
            won_date,
            emd_status,
            emd_amt,
            loa_status,
            loa_file_path,
            buying_mode,
            buying_origin
        } = req.body;

        const [result] = await db.query(
            `INSERT INTO participated_tenders 
       (bid_no, won_status, won_date, emd_status, emd_amt, loa_status, loa_file_path, buying_mode, buying_origin) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [bid_no, won_status, won_date, emd_status, emd_amt, loa_status, loa_file_path, buying_mode, buying_origin]
        );

        res.status(201).json({
            success: true,
            message: 'Tender created successfully',
            data: {
                id: result.insertId,
                bid_no
            }
        });
    } catch (error) {
        console.error('Error creating tender:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating tender',
            error: error.message
        });
    }
};

// Update participated tender
const updateParticipatedTender = async (req, res) => {
    try {
        const { bidNo } = req.params;
        const updateData = req.body;

        // Build dynamic update query
        const fields = Object.keys(updateData);
        const values = Object.values(updateData);

        if (fields.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }

        const setClause = fields.map(field => `${field} = ?`).join(', ');
        values.push(bidNo);

        const [result] = await db.query(
            `UPDATE participated_tenders SET ${setClause} WHERE bid_no = ?`,
            values
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Tender not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Tender updated successfully'
        });
    } catch (error) {
        console.error('Error updating tender:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating tender',
            error: error.message
        });
    }
};

// Delete participated tender
const deleteParticipatedTender = async (req, res) => {
    try {
        const { bidNo } = req.params;

        const [result] = await db.query(
            'DELETE FROM participated_tenders WHERE bid_no = ?',
            [bidNo]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Tender not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Tender deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting tender:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting tender',
            error: error.message
        });
    }
};

module.exports = {
    getAllParticipatedTenders,
    getParticipatedTenderByBidNo,
    createParticipatedTender,
    updateParticipatedTender,
    deleteParticipatedTender
};
