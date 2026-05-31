const db = require('../config/db');
const fs = require('fs');
const path = require('path');

// Get all QC records (dispatched orders with QC status)
const getQcRecords = async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT 
                o.id,
                o.contract_no,
                o.sap_order_no,
                o.opi_generation,
                l.invoice_no,
                l.dispatch_date,
                c.id AS coa_id,
                c.coa_file,
                c.status AS upload_status,
                COALESCE(c.lab_status, 'Not Sent') AS lab_status,
                c.nabl_certificate,
                c.updated_at
            FROM orders_rows o
            JOIN logistics l ON o.id = l.order_id
            LEFT JOIN coa_certificate c ON o.contract_no = c.contract_no
            ORDER BY l.dispatch_date DESC
        `);

        // Parse JSON fields
        const data = rows.map(r => ({
            id: r.id,
            contractNo: r.contract_no,
            opiGeneration: r.opi_generation,
            sapOrderNo: r.sap_order_no,
            invoiceNo: r.invoice_no,
            dispatchDate: r.dispatch_date,
            coaId: r.coa_id,
            coaFile: typeof r.coa_file === 'string' ? JSON.parse(r.coa_file) : r.coa_file,
            labStatus: r.lab_status,
            nablCertificate: typeof r.nabl_certificate === 'string' ? JSON.parse(r.nabl_certificate) : r.nabl_certificate,
            updatedAt: r.updated_at
        }));

        res.status(200).json({
            success: true,
            count: data.length,
            data: data
        });
    } catch (error) {
        console.error('Error fetching QC records:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// Upload COA File
const uploadCoa = async (req, res) => {
    try {
        const { contractNo } = req.body;

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const coaFile = JSON.stringify({
            name: req.file.originalname,
            path: `/uploads/qc/${req.file.filename}`,
            type: req.file.mimetype
        });

        // Check if record exists
        const [existing] = await db.query("SELECT * FROM coa_certificate WHERE contract_no = ?", [contractNo]);

        if (existing.length > 0) {
            // Update
            await db.query(`
                UPDATE coa_certificate 
                SET coa_file = ?, status = 'onprocess' 
                WHERE contract_no = ?
            `, [coaFile, contractNo]);
        } else {
            // Insert
            await db.query(`
                INSERT INTO coa_certificate (contract_no, coa_file, status)
                VALUES (?, ?, 'onprocess')
            `, [contractNo, coaFile]);
        }

        res.status(200).json({ success: true, message: 'COA Uploaded Successfully' });

    } catch (error) {
        console.error('Error uploading COA:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
// Send to Lab
const sendToLab = async (req, res) => {
    try {
        const { contractNo } = req.body;
        const labEmail = 'stevejerald632@gmail.com';

        // Fetch record to get file path
        const [rows] = await db.query(`
            SELECT contract_no, coa_file 
            FROM coa_certificate 
            WHERE contract_no = ?
        `, [contractNo]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Record not found' });
        }

        const record = rows[0];

        if (!record.coa_file) {
            return res.status(400).json({ success: false, message: 'COA file not uploaded yet' });
        }

        let coaFile = record.coa_file;
        if (typeof coaFile === 'string') {
            coaFile = JSON.parse(coaFile);
        }
        // Send Email
        const emailUtils = require('../utils/email.utils');
        const { tableData } = req.body;
        await emailUtils.sendCoaToLab(labEmail, record.contract_no, coaFile.path, tableData);

        // Update Status
        await db.query(`
            UPDATE coa_certificate 
            SET lab_status = 'Sent to Lab' 
            WHERE contract_no = ?
        `, [contractNo]);

        res.status(200).json({ success: true, message: 'Sent to Lab successfully' });

    } catch (error) {
        console.error('Error sending to lab:', error);
        res.status(500).json({ success: false, message: 'Server Error: ' + error.message });
    }
};

// Get DCC Records (NABL Received Contracts)
const getDCCRecords = async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT 
                c.contract_no,
                o.contract_json,
                o.sap_order_no,
                c.status AS upload_status,
                c.lab_status,
                c.nabl_certificate,
                c.coa_file,
                d.status AS dcc_status
            FROM coa_certificate c
            JOIN orders_rows o ON c.contract_no = o.contract_no
            LEFT JOIN dcc d ON c.contract_no = d.contract_no
            WHERE c.lab_status = 'NABL Received'
        `);

        // Helper to parse buyer details from contract_json
        const parseBuyerDetails = (input) => {
            try {
                if (!input) return { name: 'Unknown', email: 'N/A', state: 'N/A' };

                let data;
                try {
                    data = JSON.parse(input);
                } catch (e) {
                    // contract_json might be a raw file path (Windows or Unix)
                    const resolvedPath = path.resolve(String(input));
                    const tryPath = fs.existsSync(input) ? input : fs.existsSync(resolvedPath) ? resolvedPath : null;

                    if (tryPath) {
                        try {
                            const fileContent = fs.readFileSync(tryPath, 'utf8');
                            data = JSON.parse(fileContent);
                        } catch (readErr) {
                            // File exists but can't be parsed — return safe default silently
                            return { name: 'Unknown', email: 'N/A', state: 'N/A' };
                        }
                    } else {
                        // Path doesn't exist on this machine — return safe default silently
                        return { name: 'Unknown', email: 'N/A', state: 'N/A' };
                    }
                }

                const content = data.pages?.[0]?.content || '';

                // Simple regex extraction based on the provided format
                // |Designation :\noic
                // |Contact No. :\n011-26730512-0512
                // |Email ID :\nprocuresurgical@vmmc-sjh.nic.in
                // |Address :\nOFFICE OF THE MEDICAL SUPERINTENDENT...

                const designationMatch = content.match(/\|Designation\s*:\s*\n(.*)/);
                const contactMatch = content.match(/\|Contact No\.\s*:\s*\n(.*)/);
                const emailMatch = content.match(/\|Email ID\s*:\s*\n(.*)/);
                const addressMatch = content.match(/\|Address\s*:\s*\n([\s\S]*?)(\n\s*[a-zA-Z]+\s*\||$)/);

                const designation = designationMatch ? designationMatch[1].trim() : '';
                const email = emailMatch ? emailMatch[1].trim() : 'N/A';
                const address = addressMatch ? addressMatch[1].replace(/\n/g, ' ').trim() : '';

                // Extract possible hospital/buyer name from address (first line often contains it)
                const name = address.split(',')[0] || 'Unknown Buyer';

                // Extract state from address (usually near the end)
                const stateMatch = address.match(/([a-zA-Z\s]+)-\d{6}/);
                const state = stateMatch ? stateMatch[1].trim() : 'India';

                return {
                    name: name,
                    email: email,
                    state: state,
                    designation: designation,
                    fullAddress: address
                };

            } catch (e) {
                console.error('Error parsing buyer details:', e);
                return { name: 'Parse Error', email: 'N/A', state: 'N/A' };
            }
        };

        const data = rows.map((r, index) => {
            const buyer = parseBuyerDetails(r.contract_json);
            return {
                id: index + 1, // Frontend specific ID
                contractNo: r.contract_no,
                // poNo: r.sap_order_no, // User removed this column
                // orderDate: r.order_date, // User removed this column
                buyer: buyer,
                docs: {
                    nabl: !!r.nabl_certificate,
                    coa: !!r.coa_file,
                    dc: true
                },
                status: r.dcc_status || "Not Created"
            };
        });

        res.status(200).json({
            success: true,
            count: data.length,
            data: data
        });

    } catch (error) {
        console.error('Error fetching DCC records:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// Get DCC Documents
const getDCCDocuments = async (req, res) => {
    try {
        const { contractNo } = req.params;
        const [rows] = await db.query(`
            SELECT
                c.coa_file,
                c.nabl_certificate,
                l.invoice_file,
                l.eway_bill,
                l.packing_list,
                l.dispatch_challan
            FROM orders_rows o
            LEFT JOIN coa_certificate c 
                ON o.contract_no = c.contract_no
            LEFT JOIN logistics l 
                ON o.id = l.order_id
            WHERE o.contract_no = ?
        `, [contractNo]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Documents not found' });
        }

        const record = rows[0];

        // Parse JSON file paths
        const parseFile = (fileData) => {
            if (!fileData) return null;

            // Handle Buffer
            if (Buffer.isBuffer(fileData)) {
                fileData = fileData.toString('utf8');
            }

            // If it's already an object (JSON type in MySQL), return it
            if (typeof fileData === 'object') {
                return fileData;
            }

            try {
                // If string starts with { or [, try parsing as JSON
                if (typeof fileData === 'string' && (fileData.trim().startsWith('{') || fileData.trim().startsWith('['))) {
                    const parsed = JSON.parse(fileData);
                    // If parsed is string (e.g. JSON string "foo"), wrap it. Else return object.
                    return typeof parsed === 'string' ? { path: parsed } : parsed;
                }
                return { path: String(fileData) }; // Treat as raw path string
            } catch (e) {
                return { path: String(fileData) };
            }
        };

        const data = {
            coa: parseFile(record.coa_file),
            nabl: parseFile(record.nabl_certificate),
            invoice: parseFile(record.invoice_file),
            eway: parseFile(record.eway_bill),
            packing: parseFile(record.packing_list),
            challan: parseFile(record.dispatch_challan)
        };

        res.status(200).json({ success: true, data });

    } catch (error) {
        console.error('Error fetching DCC documents:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// Download DCC Document
const downloadDocument = (req, res) => {
    try {
        const { path: filePath } = req.query;
        if (!filePath) {
            return res.status(400).json({ success: false, message: 'File path required' });
        }

        // Basic security check: ensure no directory traversal attempt
        if (filePath.includes('..') && !fs.existsSync(filePath)) {
            return res.status(403).json({ success: false, message: 'Invalid file path' });
        }

        if (fs.existsSync(filePath)) {
            res.download(filePath);
        } else {
            console.error('File not found:', filePath);
            res.status(404).json({ success: false, message: 'File not found on server' });
        }
    } catch (error) {
        console.error('Error downloading document:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// Create DCC Record and Send Email
const createDCC = async (req, res) => {
    try {
        const { contractNo } = req.body;
        console.log('Received DCC Creation Request for:', contractNo);

        if (!contractNo) {
            return res.status(400).json({ success: false, message: 'Contract No is required' });
        }

        // 1. Check if DCC already exists
        const [existing] = await db.query("SELECT * FROM dcc WHERE contract_no = ?", [contractNo]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'DCC already created for this contract' });
        }

        // 2. Fetch contract details to find state
        const [rows] = await db.query("SELECT contract_json FROM orders_rows WHERE contract_no = ?", [contractNo]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Contract not found' });
        }

        const contractJson = rows[0].contract_json;
        let buyerState = 'Unknown State';
        let buyerName = 'Unknown Buyer';

        // Reuse parsing logic (simplified/duplicated for safety)
        try {
            let data;
            try {
                data = JSON.parse(contractJson);
            } catch (e) {
                if (typeof contractJson === 'string' && fs.existsSync(contractJson)) {
                    const fileContent = fs.readFileSync(contractJson, 'utf8');
                    data = JSON.parse(fileContent);
                }
            }

            const content = data?.pages?.[0]?.content || '';
            const addressMatch = content.match(/\|Address\s*:\s*\n([\s\S]*?)(\n\s*[a-zA-Z]+\s*\||$)/);
            const address = addressMatch ? addressMatch[1].replace(/\n/g, ' ').trim() : '';

            buyerName = address.split(',')[0] || 'Unknown Buyer';

            // Extract state
            const stateMatch = address.match(/([a-zA-Z\s]+)-\d{6}/);
            if (stateMatch) {
                buyerState = stateMatch[1].trim();
            }
        } catch (e) {
            console.error('Error parsing buyer details for DCC creation:', e);
        }

        console.log(`Identified State: ${buyerState}, Buyer: ${buyerName}`);

        // 3. Find Zone Head Email
        // We use LIKE for loose matching
        const [zoneRows] = await db.query("SELECT email_id FROM zone_data WHERE state LIKE ?", [`%${buyerState}%`]);

        // Default email: user requested 'stevejerald632@gmail.com' in sample data
        let recipientEmail = 'stevejerald632@gmail.com';

        if (zoneRows.length > 0) {
            recipientEmail = zoneRows[0].email_id;
            console.log(`Found Zone Head Email: ${recipientEmail}`);
        } else {
            console.warn(`No Zone Head found for state: ${buyerState}. Using default: ${recipientEmail}`);
        }

        // 4. Insert into DCC
        // Status: 'created', Email Status: 'sent' (optimistic)
        await db.query(`
            INSERT INTO dcc (contract_no, status, email_status, created_at) 
            VALUES (?, 'created', 'sent', CURRENT_TIMESTAMP)
        `, [contractNo]);

        // 5. Send Email
        const emailUtils = require('../utils/email.utils');
        await emailUtils.sendDCCEmail(recipientEmail, contractNo, buyerName, buyerState);

        res.status(200).json({ success: true, message: 'DCC Created Successfully and Email Sent' });

    } catch (error) {
        console.error('Error creating DCC:', error);
        res.status(500).json({ success: false, message: 'Server Error: ' + error.message });
    }
};

// Verify DCC
const verifyDCC = async (req, res) => {
    try {
        const { contractNo } = req.query; // Use query params for GET request from email
        if (!contractNo) {
            return res.status(400).send('Contract No is required');
        }

        await db.query(`
            UPDATE dcc 
            SET status = 'verified', verified_at = CURRENT_TIMESTAMP 
            WHERE contract_no = ?
        `, [contractNo]);

        res.status(200).send(`
            <h1>DCC Verified Successfully</h1>
            <p>Contract: ${contractNo}</p>
            <p>You can close this window.</p>
        `);

    } catch (error) {
        console.error('Error verifying DCC:', error);
        res.status(500).send('Server Error');
    }
};

// Decline DCC
const declineDCC = async (req, res) => {
    try {
        const { contractNo } = req.query; // Use query params for GET request from email
        if (!contractNo) {
            return res.status(400).send('Contract No is required');
        }

        await db.query(`
            UPDATE dcc 
            SET status = 'declined' 
            WHERE contract_no = ?
        `, [contractNo]);

        res.status(200).send(`
            <h1>DCC Declined</h1>
            <p>Contract: ${contractNo} has been marked as declined.</p>
            <p>You can close this window.</p>
        `);

    } catch (error) {
        console.error('Error declining DCC:', error);
        res.status(500).send('Server Error');
    }
};

module.exports = {
    getQcRecords,
    uploadCoa,
    sendToLab,
    getDCCRecords,
    getDCCDocuments,
    downloadDocument,
    createDCC,
    verifyDCC,
    declineDCC
};
