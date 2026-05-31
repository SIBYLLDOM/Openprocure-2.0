const db = require('../config/db');

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

module.exports = {
    getDashboardStats
};
