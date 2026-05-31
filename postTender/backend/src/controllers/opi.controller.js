const db = require('../config/db');
const fs = require('fs');
const path = require('path');

const verifyToken = async (req, res) => {
    try {
        const { token } = req.params;

        if (!token) {
            return res.status(400).json({
                success: false,
                message: 'Token is required'
            });
        }

        // 1. Verify token — accept both Active (editable) and Closed (submitted/read-only)
        const [tokens] = await db.query(`
            SELECT contract_no, opi_file_path, status 
            FROM opi_access_tokens 
            WHERE token = ? AND status IN ('Active', 'Closed')
        `, [token]);

        if (tokens.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Invalid or expired token'
            });
        }

        const contractNo = tokens[0].contract_no;
        const opiFilePath = tokens[0].opi_file_path;
        const isSubmitted = tokens[0].status === 'Closed';

        if (!opiFilePath) {
            return res.status(404).json({
                success: false,
                message: 'OPI file path not found in token record'
            });
        }

        let absolutePath = path.resolve(opiFilePath);

        if (!fs.existsSync(absolutePath)) {
            const dir = path.dirname(absolutePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(absolutePath, JSON.stringify({}, null, 2), 'utf8');
            console.log(`Created new empty OPI file at: ${absolutePath}`);
        }

        const fileContent = fs.readFileSync(absolutePath, 'utf8');
        const jsonData = JSON.parse(fileContent);

        res.status(200).json({
            success: true,
            contract_no: contractNo,
            submitted: isSubmitted,
            data: jsonData
        });

    } catch (error) {
        console.error('Error verifying OPI token:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying token',
            error: error.message
        });
    }
};

const updateOpiData = async (req, res) => {
    try {
        const { token } = req.params;
        const data = req.body;

        if (!token) {
            return res.status(400).json({ success: false, message: 'Token is required' });
        }
        if (!data) {
            return res.status(400).json({ success: false, message: 'Data is required' });
        }

        // 1. Verify token and get file path
        const [tokens] = await db.query(`
            SELECT contract_no, opi_file_path, status 
            FROM opi_access_tokens 
            WHERE token = ? AND status = 'Active'
        `, [token]);

        if (tokens.length === 0) {
            return res.status(404).json({ success: false, message: 'Invalid or expired token' });
        }

        const opiFilePath = tokens[0].opi_file_path;
        if (!opiFilePath) {
            return res.status(404).json({ success: false, message: 'OPI file path not found' });
        }

        // 2. Resolve Path
        let absolutePath = path.resolve(opiFilePath);

        // 3. Write data to file
        fs.writeFileSync(absolutePath, JSON.stringify(data, null, 2), 'utf8');

        res.status(200).json({
            success: true,
            message: 'OPI data updated successfully'
        });

    } catch (error) {
        console.error('Error updating OPI data:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating OPI data',
            error: error.message
        });
    }
};

const submitOpiVerification = async (req, res) => {
    try {
        const { token } = req.params;

        if (!token) {
            return res.status(400).json({ success: false, message: 'Token is required' });
        }

        // 1. Verify token
        const [tokens] = await db.query(`
            SELECT contract_no, status 
            FROM opi_access_tokens 
            WHERE token = ? AND status = 'Active'
        `, [token]);

        if (tokens.length === 0) {
            return res.status(404).json({ success: false, message: 'Invalid or expired token' });
        }

        const contractNo = tokens[0].contract_no;

        // 2. Update Token Status to 'Closed'
        await db.query(`
            UPDATE opi_access_tokens 
            SET status = 'Closed' 
            WHERE token = ?
        `, [token]);

        // 3. Update Order Row OPI Generation Status to 'verified'
        await db.query(`
            UPDATE orders_rows 
            SET opi_generation = 'verified' 
            WHERE contract_no = ?
        `, [contractNo]);

        res.status(200).json({
            success: true,
            message: 'OPI verification submitted successfully'
        });

    } catch (error) {
        console.error('Error submitting OPI verification:', error);
        res.status(500).json({
            success: false,
            message: 'Error submitting verification',
            error: error.message
        });
    }
};



const downloadOpiFile = async (req, res) => {
    try {
        const { contractNo } = req.params;

        if (!contractNo) {
            return res.status(400).json({ success: false, message: 'Contract Number is required' });
        }

        // 1. Get file path from orders_rows
        const [rows] = await db.query(`
            SELECT opi_file_path 
            FROM orders_rows 
            WHERE contract_no = ?
        `, [contractNo]);

        if (rows.length === 0 || !rows[0].opi_file_path) {
            return res.status(404).json({ success: false, message: 'OPI file not found for this contract' });
        }

        const opiFilePath = rows[0].opi_file_path;
        const absolutePath = path.resolve(opiFilePath);

        if (!fs.existsSync(absolutePath)) {
            return res.status(404).json({ success: false, message: 'File not found on server' });
        }

        res.download(absolutePath);

    } catch (error) {
        console.error('Error downloading OPI file:', error);
        res.status(500).json({
            success: false,
            message: 'Error downloading file',
            error: error.message
        });
    }
};



const viewOpiFile = async (req, res) => {
    try {
        const { contractNo } = req.params;

        if (!contractNo) {
            return res.status(400).json({ success: false, message: 'Contract Number is required' });
        }

        // Get file path from opi_access_tokens (most recent active or closed token)
        const [tokens] = await db.query(`
            SELECT opi_file_path 
            FROM opi_access_tokens 
            WHERE contract_no = ? 
            ORDER BY created_at DESC 
            LIMIT 1
        `, [contractNo]);

        if (tokens.length === 0 || !tokens[0].opi_file_path) {
            return res.status(404).json({ success: false, message: 'OPI file not found for this contract' });
        }

        const opiFilePath = tokens[0].opi_file_path;
        const absolutePath = path.resolve(opiFilePath);

        if (!fs.existsSync(absolutePath)) {
            return res.status(404).json({ success: false, message: 'OPI file not found on server' });
        }

        // Return parsed JSON so the frontend (OpiView.jsx) can render it
        const fileContent = fs.readFileSync(absolutePath, 'utf8');
        const jsonData = JSON.parse(fileContent);

        res.status(200).json(jsonData);

    } catch (error) {
        console.error('Error viewing OPI file:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading OPI data',
            error: error.message
        });
    }
};

module.exports = {
    verifyToken,
    updateOpiData,
    submitOpiVerification,
    downloadOpiFile,
    viewOpiFile
};
