import db from '../config/database.js';

/* =====================================================
   SAVE COURIER TRACKING INFO TO DATABASE
===================================================== */
export const saveCourierTracking = async (courierData) => {
    try {
        const {
            contract_no,
            awb_no,
            shipment_id,
            order_id,
            courier_name,
            pickup_status,
            label_url
        } = courierData;

        const query = `
            INSERT INTO courier (
                contract_no, 
                awb_no, 
                shipment_id, 
                order_id, 
                courier_name, 
                pickup_status, 
                label_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        const [result] = await db.execute(query, [
            contract_no,
            awb_no || null,
            shipment_id || null,
            order_id || null,
            courier_name || null,
            pickup_status || 'pending',
            label_url || null
        ]);

        console.log('✅ Courier tracking saved to database:', result.insertId);
        return { success: true, id: result.insertId };

    } catch (error) {
        console.error('❌ Failed to save courier tracking:', error.message);
        return { success: false, error: error.message };
    }
};

/* =====================================================
   UPDATE COURIER TRACKING INFO
===================================================== */
export const updateCourierTracking = async (shipment_id, updates) => {
    try {
        const updateFields = [];
        const values = [];

        if (updates.awb_no) {
            updateFields.push('awb_no = ?');
            values.push(updates.awb_no);
        }
        if (updates.courier_name) {
            updateFields.push('courier_name = ?');
            values.push(updates.courier_name);
        }
        if (updates.pickup_status) {
            updateFields.push('pickup_status = ?');
            values.push(updates.pickup_status);
        }
        if (updates.label_url) {
            updateFields.push('label_url = ?');
            values.push(updates.label_url);
        }

        if (updateFields.length === 0) {
            return { success: false, error: 'No fields to update' };
        }

        values.push(shipment_id);

        const query = `
            UPDATE courier 
            SET ${updateFields.join(', ')} 
            WHERE shipment_id = ?
        `;

        const [result] = await db.execute(query, values);

        console.log('✅ Courier tracking updated:', shipment_id);
        return { success: true, affectedRows: result.affectedRows };

    } catch (error) {
        console.error('❌ Failed to update courier tracking:', error.message);
        return { success: false, error: error.message };
    }
};

/* =====================================================
   GET COURIER STATUS BY CONTRACT NUMBER
===================================================== */
export const getCourierStatus = async (req, res) => {
    try {
        const { contract_no } = req.params;

        if (!contract_no) {
            return res.status(400).json({
                success: false,
                message: 'contract_no is required'
            });
        }

        const query = `
            SELECT * FROM courier 
            WHERE contract_no = ? 
            ORDER BY created_at DESC 
            LIMIT 1
        `;

        const [rows] = await db.execute(query, [contract_no]);

        if (rows.length > 0) {
            return res.json({
                success: true,
                exists: true,
                data: rows[0]
            });
        } else {
            return res.json({
                success: true,
                exists: false,
                data: null
            });
        }

    } catch (error) {
        console.error('❌ Failed to get courier status:', error.message);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
