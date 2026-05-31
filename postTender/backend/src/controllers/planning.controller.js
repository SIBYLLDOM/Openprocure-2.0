const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { sendPlanningRequestEmail, sendPlanningResponseEmail } = require('../utils/email.utils');
const fs = require('fs');
const path = require('path');

/**
 * POST /api/planning/send/:opiToken
 * Called from OPI form when FLSP fills Manufacturing Remarks
 */
const sendToPlanningTeam = async (req, res) => {
    try {
        const { opiToken } = req.params;
        const { manufacturingRemarks } = req.body;

        if (!manufacturingRemarks || !manufacturingRemarks.trim()) {
            return res.status(400).json({ success: false, message: 'Manufacturing remarks are required.' });
        }

        // 1. Get OPI token record
        const [tokenRows] = await db.query(
            `SELECT contract_no, opi_file_path, status FROM opi_access_tokens WHERE token = ?`,
            [opiToken]
        );
        if (!tokenRows.length) {
            return res.status(404).json({ success: false, message: 'Invalid OPI token.' });
        }
        const { contract_no, opi_file_path } = tokenRows[0];

        // 2. Get FLSP email and accepted_by email from orders_rows
        const [orderRows] = await db.query(
            `SELECT flsp_email FROM orders_rows WHERE contract_no = ?`,
            [contract_no]
        );
        const flspEmail = orderRows[0]?.flsp_email || null;

        // 3. Get all planning team emails
        const [planningUsers] = await db.query(
            `SELECT email FROM users WHERE role = 'planning'`
        );
        if (!planningUsers.length) {
            return res.status(404).json({ success: false, message: 'No planning team users found.' });
        }
        const planningEmails = planningUsers.map(u => u.email);

        // 4. Read current OPI JSON (to include summary in email)
        let opiData = {};
        if (opi_file_path) {
            const absPath = path.resolve(opi_file_path);
            if (fs.existsSync(absPath)) {
                try { opiData = JSON.parse(fs.readFileSync(absPath, 'utf8')); } catch (_) { }
            }
        }

        // 5. Generate planning token and insert request
        const planningToken = uuidv4();
        await db.query(
            `INSERT INTO planning_requests 
             (opi_token, planning_token, contract_no, manufacturing_remarks, flsp_email)
             VALUES (?, ?, ?, ?, ?)`,
            [opiToken, planningToken, contract_no, manufacturingRemarks.trim(), flspEmail]
        );

        // 6. Send email to all planning team members
        await sendPlanningRequestEmail(planningEmails, contract_no, planningToken, manufacturingRemarks.trim(), opiData, opi_file_path);

        console.log(`Planning request sent for ${contract_no} to: ${planningEmails.join(', ')}`);

        res.status(200).json({
            success: true,
            message: `Planning team notified successfully (${planningEmails.length} recipient(s)).`
        });

    } catch (error) {
        console.error('Error sending to planning team:', error);
        res.status(500).json({ success: false, message: 'Error sending to planning team.', error: error.message });
    }
};

/**
 * GET /api/planning/request/:planningToken
 * Planning team fetches the request details
 */
const getPlanningRequest = async (req, res) => {
    try {
        const { planningToken } = req.params;

        const [rows] = await db.query(
            `SELECT pr.*, ot.opi_file_path 
             FROM planning_requests pr
             LEFT JOIN opi_access_tokens ot ON pr.opi_token = ot.token
             WHERE pr.planning_token = ?`,
            [planningToken]
        );

        if (!rows.length) {
            return res.status(404).json({ success: false, message: 'Invalid or expired planning token.' });
        }

        const request = rows[0];

        // Read OPI data from file
        let opiData = {};
        if (request.opi_file_path) {
            const absPath = path.resolve(request.opi_file_path);
            if (fs.existsSync(absPath)) {
                try { opiData = JSON.parse(fs.readFileSync(absPath, 'utf8')); } catch (_) { }
            }
        }

        res.status(200).json({
            success: true,
            data: {
                contract_no: request.contract_no,
                manufacturing_remarks: request.manufacturing_remarks,
                status: request.status,
                planning_remarks: request.planning_remarks,
                delivery_date: request.delivery_date,
                created_at: request.created_at,
                opiData
            }
        });

    } catch (error) {
        console.error('Error fetching planning request:', error);
        res.status(500).json({ success: false, message: 'Error fetching planning request.', error: error.message });
    }
};

/**
 * POST /api/planning/respond/:planningToken
 * Planning team submits delivery date + remarks
 */
const submitPlanningResponse = async (req, res) => {
    try {
        const { planningToken } = req.params;
        const { planningRemarks, deliveryDate } = req.body;

        if (!deliveryDate) {
            return res.status(400).json({ success: false, message: 'Delivery date is required.' });
        }

        // Fetch the request
        const [rows] = await db.query(
            `SELECT * FROM planning_requests WHERE planning_token = ? AND status = 'pending'`,
            [planningToken]
        );
        if (!rows.length) {
            return res.status(404).json({ success: false, message: 'This request has already been responded to or does not exist.' });
        }

        const request = rows[0];

        // Get all planning emails for cc
        const [planningUsers] = await db.query(`SELECT email FROM users WHERE role = 'planning'`);
        const planningEmails = planningUsers.map(u => u.email);

        // Build recipient list: flsp + any accepted_by emails + planning team
        const recipients = [];
        if (request.flsp_email) {
            request.flsp_email.split(',').forEach(e => { if (e.trim()) recipients.push(e.trim()); });
        }
        if (request.accepted_by_email) {
            request.accepted_by_email.split(',').forEach(e => { if (e.trim()) recipients.push(e.trim()); });
        }
        // also CC planning team
        planningEmails.forEach(e => { if (!recipients.includes(e)) recipients.push(e); });

        // Update request
        await db.query(
            `UPDATE planning_requests SET planning_remarks = ?, delivery_date = ?, status = 'responded' WHERE planning_token = ?`,
            [planningRemarks || '', deliveryDate, planningToken]
        );

        // Send response email
        await sendPlanningResponseEmail(recipients, request.contract_no, deliveryDate, planningRemarks || '');

        res.status(200).json({
            success: true,
            message: 'Response submitted successfully. Confirmation emails have been sent.'
        });

    } catch (error) {
        console.error('Error submitting planning response:', error);
        res.status(500).json({ success: false, message: 'Error submitting response.', error: error.message });
    }
};

module.exports = { sendToPlanningTeam, getPlanningRequest, submitPlanningResponse };
