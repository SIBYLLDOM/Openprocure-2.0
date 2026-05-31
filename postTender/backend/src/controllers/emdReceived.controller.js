// src/controllers/emdReceived.controller.js
const db = require('../config/db');
const { transporter, generateEMDRequestEmail } = require('../../scripts/request_emd');

// Get all EMD received records
const getAllEMDReceived = async (req, res) => {
    try {
        const [records] = await db.query(`
      SELECT er.*, pt.won_status, pt.buying_origin 
      FROM emd_received er
      LEFT JOIN participated_tenders pt ON er.bid_no = pt.bid_no
      ORDER BY er.submitted_date DESC
    `);

        res.status(200).json({
            success: true,
            count: records.length,
            data: records
        });
    } catch (error) {
        console.error('Error fetching EMD received records:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching EMD received records',
            error: error.message
        });
    }
};

// Get EMD received by bid_no
const getEMDReceivedByBidNo = async (req, res) => {
    try {
        const { bidNo } = req.params;

        const [records] = await db.query(
            `SELECT er.*, pt.won_status, pt.buying_origin 
       FROM emd_received er
       LEFT JOIN participated_tenders pt ON er.bid_no = pt.bid_no
       WHERE er.bid_no = ?`,
            [bidNo]
        );

        if (records.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'EMD record not found'
            });
        }

        res.status(200).json({
            success: true,
            data: records[0]
        });
    } catch (error) {
        console.error('Error fetching EMD record:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching EMD record',
            error: error.message
        });
    }
};

// Create new EMD received record
const createEMDReceived = async (req, res) => {
    try {
        const {
            bid_no,
            emd_amt,
            submitted_date,
            requested_date,
            emd_status,
            item_category,
            bank_detail
        } = req.body;

        const [result] = await db.query(
            `INSERT INTO emd_received 
       (bid_no, emd_amt, submitted_date, requested_date, emd_status, item_category, bank_detail) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [bid_no, emd_amt, submitted_date, requested_date, emd_status, item_category, bank_detail]
        );

        res.status(201).json({
            success: true,
            message: 'EMD record created successfully',
            data: {
                id: result.insertId,
                bid_no
            }
        });
    } catch (error) {
        console.error('Error creating EMD record:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating EMD record',
            error: error.message
        });
    }
};

// Update EMD received record
const updateEMDReceived = async (req, res) => {
    try {
        const { id } = req.params;
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
        values.push(id);

        const [result] = await db.query(
            `UPDATE emd_received SET ${setClause} WHERE id = ?`,
            values
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'EMD record not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'EMD record updated successfully'
        });
    } catch (error) {
        console.error('Error updating EMD record:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating EMD record',
            error: error.message
        });
    }
};

// Delete EMD received record
const deleteEMDReceived = async (req, res) => {
    try {
        const { id } = req.params;

        const [result] = await db.query(
            'DELETE FROM emd_received WHERE id = ?',
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'EMD record not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'EMD record deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting EMD record:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting EMD record',
            error: error.message
        });
    }
};

// Get EMD summary/dashboard data
const getEMDSummary = async (req, res) => {
    try {
        const [summary] = await db.query(`
      SELECT 
        COUNT(*) as total_records,
        SUM(CASE WHEN emd_status = 'Submitted' THEN 1 ELSE 0 END) as submitted_count,
        SUM(CASE WHEN emd_status = 'Pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN emd_status = 'Refunded' THEN 1 ELSE 0 END) as refunded_count,
        SUM(emd_amt) as total_emd_amount
      FROM emd_received
    `);

        res.status(200).json({
            success: true,
            data: summary[0]
        });
    } catch (error) {
        console.error('Error fetching EMD summary:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching EMD summary',
            error: error.message
        });
    }
};

// Get dashboard data with custom join query
const getEMDDashboardData = async (req, res) => {
    try {
        const [records] = await db.query(`
            SELECT 
                pt.id,
                pt.bid_no,
                pt.buyer_name,
                pt.buyer_address,
                pt.consignee_mail_id as email_id,
                pt.state,
                pt.zone_head,
                pt.flsp,
                pt.created_at,
                (SELECT received_date FROM email_archive WHERE extracted_data LIKE CONCAT('%', pt.bid_no, '%') AND category = 'EMD' ORDER BY received_date DESC LIMIT 1) as returned_date,
                er.item_category,
                er.submitted_date,
                er.bank_detail as remarks
            FROM participated_tenders pt
            LEFT JOIN emd_received er ON pt.bid_no = er.bid_no
            ORDER BY pt.created_at DESC
        `);

        res.status(200).json({
            success: true,
            count: records.length,
            data: records
        });
    } catch (error) {
        console.error('Error fetching EMD dashboard data:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching EMD dashboard data',
            error: error.message
        });
    }
};

// Assign EMD Details
const assignEMDDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const { state, zone, zone_head, flsp, email_id } = req.body;

        const [result] = await db.query(
            `UPDATE participated_tenders 
             SET state = ?, zone = ?, zone_head = ?, flsp = ?, consignee_mail_id = ? 
             WHERE id = ?`,
            [state, zone, zone_head, flsp ? JSON.stringify(flsp) : null, email_id, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Tender record not found' });
        }

        res.status(200).json({ success: true, message: 'EMD assignments updated successfully' });
    } catch (error) {
        console.error('Error updating EMD assignments:', error);
        res.status(500).json({ success: false, message: 'Error updating assignments', error: error.message });
    }
};

// Mark EMD as Received
const markEMDReceived = async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await db.query(
            `UPDATE participated_tenders SET emd_status = 'Received' WHERE id = ?`,
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Tender record not found' });
        }

        res.status(200).json({ success: true, message: 'EMD marked as received successfully' });
    } catch (error) {
        console.error('Error marking EMD as received:', error);
        res.status(500).json({ success: false, message: 'Error marking EMD as received', error: error.message });
    }
};

// Send EMD Return Request Mail manually
const sendEMDMail = async (req, res) => {
    try {
        const { id } = req.params;

        // Fetch the tender details
        const [rows] = await db.query(
            `SELECT bid_no, emd_amt, consignee_mail_id, buyer_name 
             FROM participated_tenders 
             WHERE id = ?`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Tender not found' });
        }

        const tender = rows[0];

        if (!tender.consignee_mail_id || !tender.consignee_mail_id.includes('@')) {
            return res.status(400).json({ success: false, message: 'No valid consignee email address found for this tender.' });
        }

        const emailContent = generateEMDRequestEmail(tender);

        await transporter.sendMail({
            from: `"OpenProcure" <${process.env.EMAIL_USER}>`,
            to: tender.consignee_mail_id,
            subject: emailContent.subject,
            html: emailContent.html
        });

        res.status(200).json({ success: true, message: 'Email sent successfully via Transporter' });
    } catch (error) {
        console.error('Error sending single EMD mail:', error);
        res.status(500).json({ success: false, message: 'Error sending EMD mail', error: error.message });
    }
};

module.exports = {
    getAllEMDReceived,
    getEMDReceivedByBidNo,
    createEMDReceived,
    updateEMDReceived,
    deleteEMDReceived,
    getEMDSummary,
    getEMDDashboardData,
    assignEMDDetails,
    markEMDReceived,
    sendEMDMail
};
