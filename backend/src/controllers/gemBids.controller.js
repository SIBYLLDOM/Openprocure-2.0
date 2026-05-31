const db = require('../config/db');

/**
 * GET /api/gem-bids
 * Query Params: search, bid_status, bid_ra_status, start_date, end_date, department
 */
const getGemBids = async (req, res) => {
    try {
        const {
            search = '',
            bid_status = '',
            bid_ra_status = '',
            start_date = '',
            end_date = '',
            department = ''
        } = req.query;

        // Build WHERE clause dynamically
        let where = 'WHERE 1=1';
        const params = [];

        // Search filter (bid_no or ra_no)
        if (search) {
            where += ' AND (bid_no LIKE ? OR ra_no LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        // Bid Status filter
        if (bid_status && bid_status !== 'all') {
            where += ' AND bid_status = ?';
            params.push(bid_status);
        }

        // RA Status filter
        if (bid_ra_status && bid_ra_status !== 'all') {
            where += ' AND bid_ra_status = ?';
            params.push(bid_ra_status);
        }

        // Department filter (Diagno or Endo)
        if (department && department !== 'all') {
            where += ' AND dept = ?';
            params.push(department);
        }

        // Start date filter (bids starting on or after this date)
        if (start_date) {
            where += ' AND start_date >= ?';
            params.push(start_date);
        }

        // End date filter (bids ending on or before this date)
        if (end_date) {
            where += ' AND end_date <= ?';
            params.push(end_date);
        }

        const query = `SELECT * FROM gem_bids ${where} ORDER BY scraped_at DESC`;
        const [rows] = await db.query(query, params);

        res.json({
            success: true,
            total: rows.length,
            data: rows
        });
    } catch (err) {
        console.error('Error fetching gem bids:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch gem bids' });
    }
};

/**
 * GET /api/gem-bids/:id
 * Get single gem bid by ID
 */
const getGemBidById = async (req, res) => {
    try {
        const { id } = req.params;

        const query = `SELECT * FROM gem_bids WHERE id = ?`;
        const [rows] = await db.query(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Gem bid not found' });
        }

        res.json({
            success: true,
            data: rows[0]
        });
    } catch (err) {
        console.error('Error fetching gem bid:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch gem bid' });
    }
};

/**
 * GET /api/gem-bids/stats
 * Get statistics about gem bids
 */
const getGemBidsStats = async (req, res) => {
    try {
        const statsQuery = `
      SELECT 
        COUNT(*) as total_bids,
        COUNT(DISTINCT bid_status) as unique_statuses,
        SUM(CASE WHEN bid_status = 'Evaluation' THEN 1 ELSE 0 END) as evaluation_count,
        SUM(CASE WHEN bid_status = 'Not Evaluated' THEN 1 ELSE 0 END) as not_evaluated_count,
        SUM(CASE WHEN bid_status = 'Bid / RA Award' THEN 1 ELSE 0 END) as award_count,
        SUM(CASE WHEN bid_status = 'Bid Award' THEN 1 ELSE 0 END) as bid_award_count,
        SUM(CASE WHEN bid_status = 'Financial Evaluation' THEN 1 ELSE 0 END) as financial_eval_count,
        SUM(CASE WHEN bid_status = 'Technical Evaluation' THEN 1 ELSE 0 END) as technical_eval_count,
        SUM(CASE WHEN bid_ra_status = 'Active' THEN 1 ELSE 0 END) as active_ra_count,
        SUM(CASE WHEN bid_ra_status = 'Closed' THEN 1 ELSE 0 END) as closed_ra_count
      FROM gem_bids
    `;

        const [stats] = await db.query(statsQuery);

        res.json({
            success: true,
            data: stats[0]
        });
    } catch (err) {
        console.error('Error fetching gem bids stats:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch gem bids statistics' });
    }
};

module.exports = {
    getGemBids,
    getGemBidById,
    getGemBidsStats
};
