// controllers/tenderMeta.controller.js

const db = require('../config/db');

/**
 * GET /api/tenders/:bidNumber/meta
 * Fetch RA No and Interest status (NO relevancy filters)
 */
const getTenderMeta = async (req, res) => {
    const { bidNumber } = req.params;

    try {
        const [[row]] = await db.query(
            `SELECT ra_no, is_interested, Corrigendum_json, Representation_json
       FROM gem_tenders
       WHERE bid_number = ?`,
            [bidNumber]
        );

        if (!row) {
            return res.json({ success: false, data: null });
        }

        res.json({
            success: true,
            data: {
                ra_no: row.ra_no,
                is_interested: !!row.is_interested,
                Corrigendum_json: row.Corrigendum_json,
                Representation_json: row.Representation_json
            }
        });
    } catch (err) {
        console.error('getTenderMeta error:', err);
        res.status(500).json({ success: false });
    }
};

module.exports = { getTenderMeta };
