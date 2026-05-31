const db = require("../config/db");

// Get tender status history
exports.getTenderStatusHistory = async (req, res) => {
  try {
    const { tenderId } = req.params;

    // Convert tender ID format: GEM_2025_B_XXXX -> GEM/2025/B/XXXX
    const bidNumber = tenderId.replace(/_/g, "/");

    const [rows] = await db.query(
      `SELECT status, remarks, created_date, updated_date 
       FROM tender_status_history 
       WHERE bid_number = ? 
       ORDER BY created_date DESC`,
      [bidNumber]
    );

    res.json({
      success: true,
      data: rows
    });

  } catch (err) {
    console.error("Error fetching tender status history:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch tender status history"
    });
  }
};

// Update tender status
exports.updateTenderStatus = async (req, res) => {
  try {
    const { tenderId } = req.params;
    const { status, remarks } = req.body;

    // Convert tender ID format
    const bidNumber = tenderId.replace(/_/g, "/");

    // Validate status
    const validStatuses = ['proceed', 'win', 'lose', 'on-hold'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be one of: proceed, win, lose, on-hold"
      });
    }

    // Insert new status record
    const [result] = await db.query(
      `INSERT INTO tender_status_history 
       (bid_number, status, remarks, created_date, updated_date) 
       VALUES (?, ?, ?, NOW(), NOW())`,
      [bidNumber, status, remarks]
    );

    res.json({
      success: true,
      message: "Tender status updated successfully",
      data: {
        id: result.insertId,
        bid_number: bidNumber,
        status,
        remarks,
        created_date: new Date(),
        updated_date: new Date()
      }
    });

  } catch (err) {
    console.error("Error updating tender status:", err);
    res.status(500).json({
      success: false,
      message: "Failed to update tender status"
    });
  }
};

// Get current tender status
exports.getCurrentTenderStatus = async (req, res) => {
  try {
    const { tenderId } = req.params;

    // Convert tender ID format
    const bidNumber = tenderId.replace(/_/g, "/");

    const [rows] = await db.query(
      `SELECT status, remarks, created_date, updated_date 
       FROM tender_status_history 
       WHERE bid_number = ? 
       ORDER BY created_date DESC 
       LIMIT 1`,
      [bidNumber]
    );

    if (rows.length === 0) {
      return res.json({
        success: true,
        data: null
      });
    }

    res.json({
      success: true,
      data: rows[0]
    });

  } catch (err) {
    console.error("Error fetching current tender status:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch current tender status"
    });
  }
};

// Get ALL tender status history (latest status per bid_number for Workdesk)
exports.getAllTenderStatusHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    let query = `SELECT t1.bid_number, t1.status, t1.remarks, t1.updated_date
       FROM tender_status_history t1
       JOIN (
           SELECT bid_number, MAX(created_date) as max_date
           FROM tender_status_history
           GROUP BY bid_number
       ) t2 ON t1.bid_number = t2.bid_number AND t1.created_date = t2.max_date`;

    let queryParams = [];

    if (userRole !== 'Admin') {
      query += `
       JOIN workspaces w ON w.tender_id COLLATE utf8mb4_unicode_ci = t1.bid_number COLLATE utf8mb4_unicode_ci
       JOIN workspace_employees we ON we.workspace_id = w.id
       JOIN users u ON u.email COLLATE utf8mb4_unicode_ci = we.email COLLATE utf8mb4_unicode_ci
       WHERE u.id = ?`;
      queryParams.push(userId);
    }

    query += ` ORDER BY t1.updated_date DESC`;

    const [rows] = await db.query(query, queryParams);

    res.json({
      success: true,
      data: rows
    });

  } catch (err) {
    console.error("Error fetching all tender status history:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch all tender status history"
    });
  }
};
