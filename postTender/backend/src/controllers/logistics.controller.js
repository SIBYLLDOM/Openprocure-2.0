// src/controllers/logistics.controller.js
const db = require('../config/db');

// Get logistics dispatch data
const getDispatchData = async (req, res) => {
    try {
        const [dispatches] = await db.query(`
            SELECT 
                o.id, 
                o.contract_no, 
                o.contract_no as po_no, 
                o.sap_order_no, 
                l.invoice_no,
                l.dispatch_date, 
                l.dispatch_ref, 
                l.transporter,
                COALESCE(l.status, 'Not Dispatched') as status, 
                l.remarks,
                l.invoice_file,
                l.eway_bill,
                l.packing_list,
                l.dispatch_challan,
                d.status as dcc_status
            FROM orders_rows o
            LEFT JOIN logistics l ON o.id = l.order_id
            LEFT JOIN dcc d ON o.contract_no = d.contract_no
            WHERE o.sap_order_no IS NOT NULL
            ORDER BY 
                CASE WHEN l.dispatch_date IS NULL THEN 0 ELSE 1 END,
                l.dispatch_date DESC
        `);

        // Helper to parse JSON file fields
        const parseFile = (field) => {
            if (!field) return null;
            if (typeof field === 'string') {
                try { return JSON.parse(field); } catch (e) { return null; }
            }
            return field;
        };

        // Transform data to match frontend expectations
        const formattedDispatches = dispatches.map(d => {
            return {
                id: d.id,
                contractNo: d.contract_no,
                poNo: d.po_no,
                sapOrderNo: d.sap_order_no,

                invoiceNo: d.invoice_no || "",
                dispatchDate: d.dispatch_date ? new Date(d.dispatch_date).toISOString().split('T')[0] : "",
                dispatchRef: d.dispatch_ref || "", // LR/AWB
                transporter: d.transporter || "",

                invoiceFile: parseFile(d.invoice_file),
                ewayBill: parseFile(d.eway_bill),
                packingList: parseFile(d.packing_list),
                dispatchChallan: parseFile(d.dispatch_challan),

                status: d.status,
                dccStatus: d.dcc_status || "not", // "not", "created", "verified", "declined"
                remarks: d.remarks || ""
            };
        });

        res.status(200).json({
            success: true,
            count: formattedDispatches.length,
            data: formattedDispatches
        });
    } catch (error) {
        console.error('Error fetching dispatch data:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching dispatch data',
            error: error.message
        });
    }
};

// Get single dispatch by ID
const getDispatchById = async (req, res) => {
    try {
        const { id } = req.params;
        // Fetch logistics details
        const [rows] = await db.query(`
            SELECT 
                o.id, 
                o.contract_no, 
                o.sap_order_no,
                l.invoice_no,
                l.dispatch_date, 
                l.dispatch_ref, 
                l.transporter,
                l.invoice_file,
                l.eway_bill,
                l.packing_list,
                l.dispatch_challan,
                l.status, 
                l.remarks
            FROM orders_rows o
            LEFT JOIN logistics l ON o.id = l.order_id
            WHERE o.id = ?
        `, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const d = rows[0];

        // Helper to parse JSON file fields
        const parseFile = (field) => {
            if (!field) return null;
            if (typeof field === 'string') {
                try { return JSON.parse(field); } catch (e) { return null; }
            }
            return field; // Assuming driver returns object if it's JSON type
        };

        const data = {
            id: d.id,
            contractNo: d.contract_no,
            sapOrderNo: d.sap_order_no,

            invoiceNo: d.invoice_no || "",
            dispatchDate: d.dispatch_date ? new Date(d.dispatch_date).toISOString().split('T')[0] : "",
            dispatchRef: d.dispatch_ref || "",
            transporter: d.transporter || "", // Added transporter

            invoiceFile: parseFile(d.invoice_file),
            ewayBill: parseFile(d.eway_bill),
            packingList: parseFile(d.packing_list),
            dispatchChallan: parseFile(d.dispatch_challan),

            status: d.status || "Not Dispatched",
            remarks: d.remarks || ""
        };

        res.status(200).json({ success: true, data });

    } catch (error) {
        console.error('Error fetching single dispatch:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// Update dispatch status (Upsert into logistics table)
const updateDispatch = async (req, res) => {
    try {
        const { id } = req.params; // order_id
        const {
            invoice_no,
            dispatch_date,
            dispatch_ref,
            transporter,
            status,
            remarks
        } = req.body;

        console.log("Update Dispatch Body:", req.body);
        console.log("Update Dispatch Files:", req.files);

        // Check if record exists
        const [existing] = await db.query("SELECT * FROM logistics WHERE order_id = ?", [id]);

        // Helper to get file path from req.files
        const getFilePath = (fieldName) => {
            if (req.files && req.files[fieldName] && req.files[fieldName][0]) {
                return `/uploads/logistics/${req.files[fieldName][0].filename}`;
            }
            return null;
        };

        // Prepare values
        // If file is uploaded, use new path. 
        // If not uploaded, KEEP existing path (if record exists), or NULL (if inserting).
        // Implementation detail: We need to know if we should overwrite.
        // If the user didn't upload a new file, req.files[fieldName] will be undefined.
        // So simply: if getFilePath returns null, do not update that column (use COALESCE logic in SQL or variable).

        // Actually, for UPDATE, we only update columns if we have a value. But for INSERT, we need value or null.

        let existingRecord = existing.length > 0 ? existing[0] : {};

        const dbInvoiceNo = invoice_no || existingRecord.invoice_no || null;
        const dbDispatchDate = dispatch_date || existingRecord.dispatch_date || null;
        const dbDispatchRef = dispatch_ref || existingRecord.dispatch_ref || null;
        const dbTransporter = transporter || existingRecord.transporter || null;
        const dbStatus = status || existingRecord.status || 'Not Dispatched';
        const dbRemarks = remarks || existingRecord.remarks || null;

        const dbInvoiceFile = getFilePath('invoice_file');
        const dbEwayBill = getFilePath('eway_bill');
        const dbPackingList = getFilePath('packing_list');
        const dbDispatchChallan = getFilePath('dispatch_challan');

        // Logic: if new file exists, use it. Else keep existing.
        // Note: existing fields are JSON in DB but here we store string path inside JSON? 
        // User schema says `invoice_file JSON`. 
        // Let's store object { name: "filename", path: "/..." } as JSON.

        const createFileJson = (fieldName, newPath, oldJson) => {
            if (newPath) {
                // New upload
                const fileObj = req.files[fieldName][0];
                return JSON.stringify({
                    name: fileObj.originalname,
                    path: newPath,
                    type: fileObj.mimetype
                });
            }
            // No new upload — return existing value, always as a JSON string
            if (!oldJson) return null;
            if (typeof oldJson === 'string') return oldJson;
            return JSON.stringify(oldJson); // mysql2 auto-parses JSON columns into objects; re-stringify
        };

        const finalInvoiceFile = createFileJson('invoice_file', dbInvoiceFile, existingRecord.invoice_file);
        const finalEwayBill = createFileJson('eway_bill', dbEwayBill, existingRecord.eway_bill);
        const finalPackingList = createFileJson('packing_list', dbPackingList, existingRecord.packing_list);
        const finalDispatchChallan = createFileJson('dispatch_challan', dbDispatchChallan, existingRecord.dispatch_challan);

        if (existing.length === 0) {
            // Insert
            await db.query(`
                INSERT INTO logistics (
                    order_id, 
                    invoice_no, dispatch_date, dispatch_ref, transporter,
                    invoice_file, eway_bill, packing_list, dispatch_challan,
                    status, remarks
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                id,
                dbInvoiceNo, dbDispatchDate, dbDispatchRef, dbTransporter,
                finalInvoiceFile, finalEwayBill, finalPackingList, finalDispatchChallan,
                dbStatus, dbRemarks
            ]);
        } else {
            // Update
            // We update all fields. If file didn't change, finalX is the old value.
            await db.query(`
                UPDATE logistics SET
                    invoice_no = ?, dispatch_date = ?, dispatch_ref = ?, transporter = ?,
                    invoice_file = ?, eway_bill = ?, packing_list = ?, dispatch_challan = ?,
                    status = ?, remarks = ?
                WHERE order_id = ?
            `, [
                dbInvoiceNo, dbDispatchDate, dbDispatchRef, dbTransporter,
                finalInvoiceFile, finalEwayBill, finalPackingList, finalDispatchChallan,
                dbStatus, dbRemarks,
                id
            ]);
        }

        res.status(200).json({
            success: true,
            message: 'Logistics updated successfully'
        });

    } catch (error) {
        console.error('Error updating logistics:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating logistics',
            error: error.message
        });
    }
};

module.exports = {
    getDispatchData,
    getDispatchById,
    updateDispatch
};
