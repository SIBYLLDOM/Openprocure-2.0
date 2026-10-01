const db = require('../config/db');
const { getUserScope, isBlocked, CLASSIFIED } = require('../utils/userScope');

/**
 * GET /api/admin/dashboard-stats
 * Get Admin Dashboard Stats from summary_dash table
 * Query Params: ?dept=diagno (or endo)
 */
const getDashboardStats = async (req, res) => {
    try {
        const { dept } = req.query;

        // Mapping new project names to old department names for database compatibility
        const deptMapping = {
            'participated-tender': 'diagno',
            'workdesk': 'diagno',
            'active-workspaces': 'diagno',
            'gem-contracts': 'endo',
            'carting-dashboard': 'endo'
        };

        // Default to 'diagno' if not provided or if mapping not found
        const targetDept = deptMapping[dept] || dept || 'diagno';

        console.log(`Fetching dashboard stats for dept: ${dept} -> mapped to: ${targetDept}`);

        // Query summary_dash table for Bids, Orders, and Products
        const [rows] = await db.query(
            `SELECT 
                total_bids, bids_won, bids_lost, total_charges,
                total_orders, pending_acceptance, pending_delivery,
                total_products, published_products, pending_approval_products,
                total_incidents, pending_response, pending_resolution
             FROM summary_dash 
             WHERE dept = ? 
             LIMIT 1`,
            [targetDept]
        );

        // Default data if summary_dash is empty for this dept
        let data = {
            total_bids: 0, bids_won: 0, bids_lost: 0, total_charges: 0,
            total_orders: 0, pending_acceptance: 0, pending_delivery: 0,
            total_products: 0, published_products: 0, pending_approval_products: 0
        };

        if (rows.length > 0) {
            data = rows[0];
        }

        // Calculate completed orders safely
        const totalOrders = parseInt(data.total_orders) || 0;
        const pendingAcc = parseInt(data.pending_acceptance) || 0;
        const pendingDel = parseInt(data.pending_delivery) || 0;
        const completedOrders = totalOrders - pendingAcc - pendingDel;

        // Incident Queries
        // 1. Total Incidents
        const [totalIncidentsRows] = await db.query(
            `SELECT COUNT(*) as count FROM incidents WHERE dept = ?`,
            [targetDept]
        );
        const totalIncidents = totalIncidentsRows[0].count;

        // 2. Pending Response (Active/Open) - User definition: status NOT IN ('closed', 'Rejected')
        // Using lower/mixed case handling just in case, though dump shows 'Closed', 'Rejected'
        const [pendingResponseRows] = await db.query(
            `SELECT COUNT(*) as count FROM incidents WHERE dept = ? AND status NOT IN ('Closed', 'Rejected', 'closed', 'rejected')`,
            [targetDept]
        );
        const pendingResponse = pendingResponseRows[0].count;

        // 3. Closed/Rejected (Resolved) - User definition: status IN ('closed', 'Rejected')
        const [closedRejectedRows] = await db.query(
            `SELECT COUNT(*) as count FROM incidents WHERE dept = ? AND status IN ('Closed', 'Rejected', 'closed', 'rejected')`,
            [targetDept]
        );
        const closedRejected = closedRejectedRows[0].count;

        // 4. Incident Trend (Monthly)
        // Group by Month (using incident_date dd/mm/yyyy) and Status
        const [trendRows] = await db.query(
            `SELECT 
                DATE_FORMAT(STR_TO_DATE(incident_date, '%d/%m/%Y'), '%b') as month,
                DATE_FORMAT(STR_TO_DATE(incident_date, '%d/%m/%Y'), '%m') as monthNum,
                status,
                COUNT(*) as count 
             FROM incidents 
             WHERE dept = ? 
             GROUP BY month, monthNum, status
             ORDER BY monthNum`,
            [targetDept]
        );

        // Process trend rows into backend-structure for graph
        // Frontend expects array of objects: { month: 'Jul', resolved: 12, pendingResponse: 3, pendingResolution: 2, total: 17 }
        // We will map:
        // 'resolved' -> Closed + Rejected
        // 'pendingResponse' -> NOT IN ('Closed', 'Rejected') aka Open
        // 'pendingResolution' -> (User didn't specify distinct logic, so maybe 0 or split? For now we'll put 0 to avoid duplicates or map 'Rejected' here if preferred? 
        // Let's stick to: Resolved = Closed, PendingRes = Open, PendingResolution = Rejected? 
        // User asked for "Incident raised, pending response, closed, rejected" in graph.
        // I will return specific keys for these and update frontend chart to use them.

        const trendMap = {};
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        // Initialize map
        trendRows.forEach(row => {
            if (!trendMap[row.month]) {
                trendMap[row.month] = { month: row.month, raised: 0, pendingResponse: 0, closed: 0, rejected: 0, monthNum: row.monthNum };
            }
            const count = row.count;
            const status = row.status; // 'Closed', 'Rejected', 'Open' etc.

            trendMap[row.month].raised += count; // Total raised

            if (['Closed', 'closed'].includes(status)) {
                trendMap[row.month].closed += count;
            } else if (['Rejected', 'rejected'].includes(status)) {
                trendMap[row.month].rejected += count;
            } else {
                trendMap[row.month].pendingResponse += count;
            }
        });

        // Convert map to sorted array
        const incidentTrend = Object.values(trendMap).sort((a, b) => a.monthNum - b.monthNum);

        const responseData = {
            bids: {
                total: data.total_bids || "0",
                won: data.bids_won || "0",
                lost: data.bids_lost || "0",
                totalCharges: data.total_charges || "0"
            },
            incidents: {
                total: totalIncidents.toString(),
                pendingResponse: pendingResponse.toString(),
                pendingResolution: closedRejected.toString(), // Mapping Closed/Rejected to this field as requested wrapper
                // Extra metadata for graph or specific display
                closed: closedRejected.toString()
            },
            incidentTrend: incidentTrend, // New graph data
            tenderProcessing: {
                totalOrders: data.total_orders || "0",
                pendingAcceptance: data.pending_acceptance || "0",
                pendingDelivery: data.pending_delivery || "0",
                completedOrders: completedOrders.toString()
            },
            products: {
                total: data.total_products || "0",
                published: data.published_products || "0",
                pendingApproval: data.pending_approval_products || "0"
            }
        };

        res.json({
            success: true,
            data: responseData
        });

    } catch (err) {
        console.error('Error fetching dashboard stats:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch dashboard stats' });
    }
};

/**
 * GET /api/admin/tender-dashboard
 * Tender-focused dashboard, scoped to a department.
 * Query Params: ?dept=Diagno|Endo|Both
 */
const getTenderDashboardStats = async (req, res) => {
    try {
        // The ?dept= query param is a *narrowing* filter only — it can never
        // widen what the caller is entitled to. A Tender Admin is hard-limited
        // to their assigned division(s); Admin may pick any. See utils/userScope.js.
        const scope = await getUserScope(req.user.id);
        // isBlocked() deliberately exempts Tender Executives (they browse every
        // division, no assignment required) — so an executive with zero
        // user_departments rows reaches here with scope.divisions = [], which
        // would otherwise make `allowed` empty and deptSql() build an invalid
        // "WHERE ()" predicate. Same empty-divisions -> CLASSIFIED fallback
        // used everywhere else in utils/userScope.js (tenderScopeSql, deptColumnSql).
        const allowed = (scope.isAdmin || !scope.divisions.length)
            ? CLASSIFIED.map(d => d === 'endo' ? 'Endo' : 'Diagno')
            : scope.divisions;
        if (isBlocked(scope)) {
            return res.status(403).json({
                success: false,
                message: 'No department assigned. Ask an Admin to assign your division and source.',
            });
        }

        const requested = req.query.dept || 'Both';
        const dept = allowed.includes(requested) ? requested : 'Both';
        const isBoth = dept === 'Both';
        const deptLower = dept.toLowerCase();

        // When not narrowed to one division, "Both" means every division the
        // caller is allowed to see — not every division in the system.
        const effective = isBoth ? allowed : [dept];

        // Every relevant table (gem_tenders, gem_bids, contracts, incidents,
        // open_tender_details) uses a column literally named `dept`, so one
        // helper covers all of them. Only tender_processing_results.dept is
        // free-text/messy and is deliberately not filtered this way.
        // Unclassified tenders (dept NULL/'360'/'unknown') match no division and
        // are therefore hidden from everyone, Admin included. dept = 'both' is a
        // real, legitimate value (relevant to every division) and is always
        // included regardless of which division(s) the caller is narrowed to.
        const deptSql = (col = 'dept') =>
            `(${effective.map(() => `LOWER(${col}) = ?`).join(' OR ')} OR LOWER(${col}) = 'both')`;
        const deptParams = effective.map(d => d.toLowerCase());

        const strToDateEnd = "STR_TO_DATE(REPLACE(end_date, '/', '-'), '%d-%m-%Y %h:%i %p')";
        const activeGemWhere = `
            WHERE ${deptSql()}
              AND (ra_no IS NULL OR TRIM(ra_no) = '')
              AND (marked_not_relevant IS NULL OR marked_not_relevant = 0)
              AND perfect_cat = 1
        `;

        const [
            [[activeRow]],
            [[closingSoonRow]],
            [upcomingDeadlines],
            [[openTendersRow]],
            [[contractsRow]],
            [[incidentsRow]],
            [[pendingResponseRow]],
            [recentActivity],
            deptSplitResult,
            [[pipelineValueRow]],
            [topStates],
            [ticketStatusRows],
            [[distributorsRow]],
            [contractsTrendRows],
            [[activeNowRow]],
            [[loginsTodayRow]],
            [[loginsWeekRow]],
            [[avgSessionRow]],
            [loginTrendRows],
            [topSellers]
        ] = await Promise.all([
            db.query(
                `SELECT COUNT(*) AS c FROM gem_tenders ${activeGemWhere} AND ${strToDateEnd} >= NOW()`,
                deptParams
            ),
            db.query(
                `SELECT COUNT(*) AS c FROM gem_tenders ${activeGemWhere}
                 AND ${strToDateEnd} BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 7 DAY)`,
                deptParams
            ),
            db.query(
                `SELECT bid_number, LEFT(items, 140) AS title, dept, end_date, emd_amount, bid_value, detail_url,
                        TIMESTAMPDIFF(HOUR, NOW(), ${strToDateEnd}) AS hoursLeft
                 FROM gem_tenders ${activeGemWhere} AND ${strToDateEnd} >= NOW()
                 ORDER BY ${strToDateEnd} ASC
                 LIMIT 8`,
                deptParams
            ),
            db.query(
                `SELECT COUNT(*) AS c FROM open_tender_details
                 WHERE relevency_checker IN ('proceed_futher', 'files_downloaded', 'yes')
                   AND ${deptSql()}
                   AND (STR_TO_DATE(closing_date, '%d-%M-%Y %h:%i %p') >= NOW() OR closing_date IS NULL OR closing_date = '')`,
                deptParams
            ),
            db.query(
                `SELECT COUNT(*) AS c, COALESCE(SUM(CAST(total_value AS DECIMAL(18,2))), 0) AS total
                 FROM contracts WHERE ${deptSql()}`,
                deptParams
            ),
            db.query(
                `SELECT COUNT(*) AS c FROM incidents WHERE ${deptSql()}`,
                deptParams
            ),
            db.query(
                `SELECT COUNT(*) AS c FROM incidents
                 WHERE ${deptSql()} AND status NOT IN ('Closed', 'Rejected', 'closed', 'rejected')`,
                deptParams
            ),
            db.query(
                `SELECT gt.bid_number, LEFT(gt.items, 140) AS title, gt.dept, tpr.processing_date, tpr.status
                 FROM tender_processing_results tpr
                 JOIN gem_tenders gt ON gt.bid_number = tpr.bid_no
                 WHERE tpr.result = 'yes' AND ${deptSql('gt.dept')}
                 ORDER BY tpr.processing_date DESC
                 LIMIT 6`,
                deptParams
            ),
            isBoth
                ? db.query(
                    `SELECT LOWER(dept) AS dept, COUNT(*) AS c FROM gem_tenders
                     ${activeGemWhere} AND ${strToDateEnd} >= NOW()
                     GROUP BY LOWER(dept)`,
                    deptParams
                )
                : Promise.resolve([[]]),
            db.query(
                `SELECT COALESCE(SUM(CAST(bid_value AS DECIMAL(18,2))), 0) AS bidValueSum,
                        COALESCE(SUM(CAST(emd_amount AS DECIMAL(18,2))), 0) AS emdSum
                 FROM gem_tenders ${activeGemWhere} AND ${strToDateEnd} >= NOW()`,
                deptParams
            ),
            db.query(
                `SELECT state, COUNT(*) AS c FROM gem_tenders ${activeGemWhere}
                 AND ${strToDateEnd} >= NOW() AND state IS NOT NULL AND state != ''
                 GROUP BY state ORDER BY c DESC LIMIT 6`,
                deptParams
            ),
            db.query(
                `SELECT COALESCE(status, 'Open') AS status, COUNT(*) AS c FROM support_tickets GROUP BY status`
            ),
            db.query(
                `SELECT COUNT(*) AS total,
                        SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) AS activeCount
                 FROM distributors`
            ),
            db.query(
                `SELECT DATE_FORMAT(contract_date, '%b %y') AS month,
                        COUNT(*) AS c,
                        COALESCE(SUM(CAST(total_value AS DECIMAL(18,2))), 0) AS val
                 FROM contracts
                 WHERE ${deptSql()} AND contract_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
                 GROUP BY DATE_FORMAT(contract_date, '%Y-%m'), month
                 ORDER BY DATE_FORMAT(contract_date, '%Y-%m') ASC`,
                deptParams
            ),
            db.query(
                `SELECT COUNT(*) AS c FROM user_sessions WHERE is_active = 1 AND last_heartbeat_at >= DATE_SUB(NOW(), INTERVAL 2 MINUTE)`
            ),
            db.query(
                `SELECT COUNT(*) AS c FROM user_login_history WHERE DATE(logged_in_at) = CURDATE()`
            ),
            db.query(
                `SELECT COUNT(*) AS c FROM user_login_history WHERE logged_in_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`
            ),
            db.query(
                `SELECT AVG(total_active_seconds) AS avgSeconds FROM user_sessions WHERE total_active_seconds > 0`
            ),
            db.query(
                `SELECT DATE(logged_in_at) AS day, COUNT(*) AS c FROM user_login_history
                 WHERE logged_in_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
                 GROUP BY DATE(logged_in_at) ORDER BY day ASC`
            ),
            db.query(
                `SELECT seller_name, COALESCE(SUM(CAST(total_value AS DECIMAL(18,2))), 0) AS revenue, COUNT(*) AS c
                 FROM contracts
                 WHERE ${deptSql()} AND seller_name IS NOT NULL AND seller_name != ''
                 GROUP BY seller_name ORDER BY revenue DESC LIMIT 5`,
                deptParams
            )
        ]);

        const deptSplit = isBoth
            ? { diagno: 0, endo: 0, ...Object.fromEntries((deptSplitResult[0] || []).map(r => [r.dept, Number(r.c)])) }
            : null;

        const supportTickets = { open: 0, inProgress: 0, resolved: 0, closed: 0 };
        ticketStatusRows.forEach(r => {
            const c = Number(r.c);
            const s = String(r.status || '').toLowerCase();
            if (s === 'open') supportTickets.open += c;
            else if (s === 'in progress' || s === 'in-progress') supportTickets.inProgress += c;
            else if (s === 'resolved') supportTickets.resolved += c;
            else if (s === 'closed') supportTickets.closed += c;
        });
        supportTickets.total = supportTickets.open + supportTickets.inProgress + supportTickets.resolved + supportTickets.closed;

        res.json({
            success: true,
            data: {
                dept,
                activeTenders: activeRow.c,
                closingSoon: closingSoonRow.c,
                openTenders: openTendersRow.c,
                contracts: { count: contractsRow.c, totalValue: Number(contractsRow.total) },
                incidents: { total: incidentsRow.c, pendingResponse: pendingResponseRow.c },
                deptSplit,
                pipelineValue: Number(pipelineValueRow.bidValueSum),
                emdLocked: Number(pipelineValueRow.emdSum),
                topStates: topStates.map(r => ({ state: r.state, count: Number(r.c) })),
                supportTickets,
                distributors: { total: distributorsRow.total, active: Number(distributorsRow.activeCount) || 0 },
                contractsTrend: contractsTrendRows.map(r => ({ month: r.month, count: Number(r.c), value: Number(r.val) })),
                userActivity: {
                    activeNow: activeNowRow.c,
                    loginsToday: loginsTodayRow.c,
                    loginsWeek: loginsWeekRow.c,
                    avgSessionSeconds: Math.round(Number(avgSessionRow.avgSeconds) || 0),
                    trend: loginTrendRows.map(r => ({ day: r.day, count: Number(r.c) }))
                },
                topSellers: topSellers.map(r => ({ sellerName: r.seller_name, revenue: Number(r.revenue), count: Number(r.c) })),
                upcomingDeadlines,
                recentActivity
            }
        });
    } catch (err) {
        console.error('Error fetching tender dashboard stats:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch tender dashboard stats' });
    }
};

module.exports = {
    getDashboardStats,
    getTenderDashboardStats
};
