const db = require('../config/db');

const getPBGOverview = async (req, res) => {
    try {
        // Query to join orders_rows and pbg_records based on contract_no
        // This effectively filters orders that have a PBG record
        // Query to fetch all confirmed PBG records and UNION ALL with submitted yet-to-be-recorded PBG Drafts
        const query = `
            SELECT 
                o.id,
                COALESCE(o.contract_no, p.contract_no) as contract_no,
                o.contract_date,
                o.total_order_value,
                o.contract_url,
                o.invoice_doc,
                o.receipt_doc,
                p.pbg_amount, 
                p.bid_no,
                p.bank_name, 
                p.issue_date as pbgIssueDate, 
                p.expiry_date as pbgExpiryDate, 
                p.pbg_percentage, 
                p.validity_period, 
                p.status as pbgStatus, 
                p.reference_number,
                p.remarks as pbgRemarks,
                p.uploaded_by_user_id,
                p.document_path,
                p.created_at
            FROM pbg_records p
            LEFT JOIN orders_rows o ON p.contract_no = o.contract_no

            UNION ALL

            SELECT 
                o.id,
                COALESCE(o.contract_no, c.contract_no, 'Pending Allocation') as contract_no,
                COALESCE(o.contract_date, t.won_date) as contract_date,
                o.total_order_value,
                o.contract_url,
                o.invoice_doc,
                o.receipt_doc,
                d.pbg_amount, 
                d.bid_no,
                d.bank_name, 
                d.issue_date as pbgIssueDate, 
                d.expiry_date as pbgExpiryDate, 
                d.pbg_percentage, 
                d.validity_period, 
                'Pending Upload' as pbgStatus, 
                d.reference_number,
                d.remarks as pbgRemarks,
                d.submitted_by as uploaded_by_user_id,
                NULL as document_path,
                d.updated_at as created_at
            FROM pbg_drafts d
            LEFT JOIN participated_tenders t ON d.bid_no = t.bid_no
            LEFT JOIN contracts c ON d.bid_no = c.bid_no
            LEFT JOIN orders_rows o ON d.bid_no = o.bid_no
            WHERE d.submitted = 1 
              AND d.bid_no NOT IN (SELECT bid_no FROM pbg_records)

            ORDER BY created_at DESC
        `;

        const [rows] = await db.query(query);

        res.status(200).json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error fetching PBG Overview data:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch PBG Overview data',
            error: error.message
        });
    }
};

const downloadDocument = async (req, res) => {
    try {
        const { orderId, docType } = req.params;

        if (!['invoice', 'receipt'].includes(docType)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid document type. Must be invoice or receipt.'
            });
        }

        const query = 'SELECT invoice_doc, receipt_doc FROM orders_rows WHERE id = ?';
        const [rows] = await db.query(query, [orderId]);

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Order record not found'
            });
        }

        let filePath = docType === 'invoice' ? rows[0].invoice_doc : rows[0].receipt_doc;

        if (!filePath) {
            return res.status(404).json({
                success: false,
                message: 'Document not found for this record'
            });
        }

        // Clean path: remove surrounding quotes if present
        filePath = filePath.replace(/^["']|["']$/g, '');

        // For local development, we assume the path is accessible
        res.download(filePath, (err) => {
            if (err) {
                console.error(`Error downloading file ${filePath}:`, err);
                if (!res.headersSent) {
                    res.status(500).json({
                        success: false,
                        message: 'Error downloading file',
                        error: err.message
                    });
                }
            }
        });

    } catch (error) {
        console.error('Error in downloadDocument:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during download',
            error: error.message
        });
    }
};

module.exports = {
    getPBGOverview,
    downloadDocument
};
