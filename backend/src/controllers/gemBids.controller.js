const db = require('../config/db');
const { getUserScope, deptColumnSql, stateScopeSql } = require('../utils/userScope');

// RA Date and Remarks on the Participated Tenders screen are plain
// user-entered fields — neither exists as a scraped column anywhere (gem_bids
// only has an RA *number*, no date), so they live in their own small table
// keyed by bid_no rather than being bolted onto a scraped table.
const ensureNotesTable = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS participated_tender_notes (
      bid_no      VARCHAR(255) NOT NULL PRIMARY KEY,
      ra_date     DATE NULL,
      remarks     TEXT NULL,
      updated_by  INT NULL,
      updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
};
ensureNotesTable().catch((err) => console.error('[gem-bids] notes table init failed:', err));

/**
 * GET /api/gem-bids
 * Query Params: search, bid_status, bid_ra_status, start_date, end_date, department, source ('gem' | 'open')
 *
 * Historically this read straight from `gem_bids`, a table populated by a per-bid
 * portal scraper that stopped running long ago (stuck at 275 rows from one day).
 * It now lists every currently-relevant ("proceed") GeM tender live from
 * gem_tenders + tender_processing_results (unchanged from before — nothing
 * drops off this list), enriched with `gem_bids` scraped status fields where
 * that per-bid scrape actually happened. On top of that, any tender (GeM or
 * Open) whose latest tender_status_history entry is 'close' is added in too —
 * an Open tender never appeared here before, so it only shows up once it's
 * marked Close from the tender status panel. Every row carries closed_date/
 * close_remarks from that history when it has since been closed.
 *
 * Both branches are scoped to the caller's division+source assignment via
 * userScope.deptColumnSql — an Endo/GeM+Open user only sees Endo rows from
 * either source; a user missing an axis (or unassigned) sees nothing for that
 * source, same fail-closed rule the rest of the app uses. Only Admin is
 * unrestricted here.
 */
const getGemBids = async (req, res) => {
    try {
        const {
            search = '',
            bid_status = '',
            bid_ra_status = '',
            start_date = '',
            end_date = '',
            department = '',
            source = '',
            state = ''
        } = req.query;

        const scope = await getUserScope(req.user.id);
        const gemScope = deptColumnSql(scope, 'gt.dept', 'GEM');
        const openScope = deptColumnSql(scope, 'ot.dept', 'Open');
        // Sales/Zonal Head are additionally limited to their working states —
        // same rule tenders.controller.js's getTenders already applies; this
        // list previously skipped it.
        const gemStateScope = stateScopeSql(scope, 'gt.state');
        const openStateScope = stateScopeSql(scope, 'ot.state');

        let where = 'WHERE 1=1';
        const params = [];

        if (search) {
            where += ' AND (combined.bid_no LIKE ? OR ra_no LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }
        if (bid_status && bid_status !== 'all') {
            where += ' AND bid_status = ?';
            params.push(bid_status);
        }
        if (bid_ra_status && bid_ra_status !== 'all') {
            where += ' AND bid_ra_status = ?';
            params.push(bid_ra_status);
        }
        if (department && department !== 'all') {
            where += ' AND LOWER(dept) = ?';
            params.push(department.toLowerCase());
        }
        if (source && source !== 'all') {
            where += ' AND source = ?';
            params.push(source);
        }
        if (state && state !== 'all') {
            where += ' AND combined.state = ?';
            params.push(state);
        }
        if (start_date) {
            where += ' AND start_date >= ?';
            params.push(start_date);
        }
        if (end_date) {
            where += ' AND end_date <= ?';
            params.push(end_date);
        }

        const query = `
            SELECT
                combined.*,
                ptn.ra_date  AS ra_date,
                ptn.remarks  AS user_remarks
            FROM (
                SELECT
                    CONCAT('gem-', gt.id)                        AS id,
                    'gem'                                        AS source,
                    gt.bid_number                                AS bid_no,
                    gt.state                                     AS state,
                    COALESCE(NULLIF(gb.ra_no, ''), NULLIF(gt.ra_no, '')) AS ra_no,
                    COALESCE(gb.bid_status, 'Not Evaluated')     AS bid_status,
                    gb.bid_ra_status                             AS bid_ra_status,
                    COALESCE(gb.quantity, gt.quantity)           AS quantity,
                    gt.start_date                                AS start_date,
                    gt.end_date                                  AS end_date,
                    gt.start_date                                AS opening_date,
                    COALESCE(tpr.dept, gt.dept)                  AS dept,
                    tsh.remarks                                  AS close_remarks,
                    tsh.updated_date                             AS closed_date,
                    COALESCE(gb.scraped_at, gt.created_at)       AS scraped_at
                FROM gem_tenders gt
                JOIN tender_processing_results tpr ON tpr.bid_no = gt.bid_number
                LEFT JOIN gem_bids gb ON gb.bid_no = gt.bid_number
                LEFT JOIN (
                    SELECT t1.bid_number, t1.status, t1.remarks, t1.updated_date
                    FROM tender_status_history t1
                    JOIN (
                        SELECT bid_number, MAX(created_date) AS max_date
                        FROM tender_status_history
                        GROUP BY bid_number
                    ) t2 ON t1.bid_number = t2.bid_number AND t1.created_date = t2.max_date
                    WHERE t1.status = 'close'
                ) tsh ON tsh.bid_number = gt.bid_number
                WHERE tpr.result = 'yes' AND ${gemScope.sql} AND ${gemStateScope.sql}

                UNION ALL

                SELECT
                    CONCAT('open-', ot.row_id)                   AS id,
                    'open'                                       AS source,
                    ot.tender_id                                 AS bid_no,
                    ot.state                                     AS state,
                    NULL                                         AS ra_no,
                    'Not Evaluated'                               AS bid_status,
                    NULL                                         AS bid_ra_status,
                    NULL                                         AS quantity,
                    ot.e_published_date                          AS start_date,
                    ot.closing_date                              AS end_date,
                    COALESCE(ot.opening_date, ot.bid_opening_date) AS opening_date,
                    ot.dept                                      AS dept,
                    tsh2.remarks                                 AS close_remarks,
                    tsh2.updated_date                            AS closed_date,
                    ot.created_at                                AS scraped_at
                FROM open_tender_details ot
                JOIN (
                    SELECT t1.bid_number, t1.status, t1.remarks, t1.updated_date
                    FROM tender_status_history t1
                    JOIN (
                        SELECT bid_number, MAX(created_date) AS max_date
                        FROM tender_status_history
                        GROUP BY bid_number
                    ) t2 ON t1.bid_number = t2.bid_number AND t1.created_date = t2.max_date
                    WHERE t1.status = 'close'
                ) tsh2 ON tsh2.bid_number = ot.tender_id
                WHERE ${openScope.sql} AND ${openStateScope.sql}
            ) combined
            LEFT JOIN participated_tender_notes ptn ON ptn.bid_no = combined.bid_no
            ${where}
            ORDER BY scraped_at DESC
        `;
        const queryParams = [
            ...gemScope.params, ...gemStateScope.params,
            ...openScope.params, ...openStateScope.params,
            ...params,
        ];
        const [rows] = await db.query(query, queryParams);

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
 * Get statistics about currently-relevant GeM bids (same live source as getGemBids)
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
            FROM (
                SELECT
                    COALESCE(gb.bid_status, 'Not Evaluated') AS bid_status,
                    gb.bid_ra_status                         AS bid_ra_status
                FROM gem_tenders gt
                JOIN tender_processing_results tpr ON tpr.bid_no = gt.bid_number
                LEFT JOIN gem_bids gb ON gb.bid_no = gt.bid_number
                WHERE tpr.result = 'yes'
            ) combined
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

/**
 * PUT /api/gem-bids/:bidNo/notes
 * Body: { ra_date?: 'YYYY-MM-DD' | null, remarks?: string }
 * Upserts the user-entered RA Date / Remarks for one bid — any authenticated
 * user can edit these directly from the Participated Tenders table.
 */
const updateBidNotes = async (req, res) => {
    try {
        const bidNo = decodeURIComponent(req.params.bidNo).replace(/_/g, '/');
        const { ra_date = null, remarks = null } = req.body;

        await db.query(
            `INSERT INTO participated_tender_notes (bid_no, ra_date, remarks, updated_by)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE ra_date = VALUES(ra_date), remarks = VALUES(remarks), updated_by = VALUES(updated_by)`,
            [bidNo, ra_date || null, remarks, req.user.id]
        );

        res.json({ success: true, bid_no: bidNo, ra_date, remarks });
    } catch (err) {
        console.error('Error updating bid notes:', err);
        res.status(500).json({ success: false, message: 'Failed to update notes' });
    }
};

module.exports = {
    getGemBids,
    getGemBidById,
    getGemBidsStats,
    updateBidNotes
};
