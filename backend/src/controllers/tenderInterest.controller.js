const db = require("../config/db");

// Toggle tender interest status
exports.toggleTenderInterest = async (req, res) => {
  try {
    const { tenderId } = req.params;
    
    // Convert tender ID format: GEM_2025_B_XXXX -> GEM/2025/B/XXXX
    const bidNumber = tenderId.replace(/_/g, "/");

    // Check if tender exists
    const [tenderRows] = await db.query(
      "SELECT is_interested FROM gem_tenders WHERE bid_number = ? LIMIT 1",
      [bidNumber]
    );

    if (tenderRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Tender not found"
      });
    }

    // Toggle the interest status (0 -> 1, 1 -> 0)
    const currentStatus = tenderRows[0].is_interested || 0;
    const newStatus = currentStatus === 1 ? 0 : 1;

    // Update the interest status
    await db.query(
      "UPDATE gem_tenders SET is_interested = ? WHERE bid_number = ?",
      [newStatus, bidNumber]
    );

    res.json({
      success: true,
      message: `Tender marked as ${newStatus === 1 ? 'interested' : 'not interested'}`,
      data: {
        bid_number: bidNumber,
        is_interested: newStatus,
        previous_status: currentStatus
      }
    });

  } catch (err) {
    console.error("Error toggling tender interest:", err);
    res.status(500).json({
      success: false,
      message: "Failed to update tender interest status"
    });
  }
};

// Get tender interest status
exports.getTenderInterest = async (req, res) => {
  try {
    const { tenderId } = req.params;
    
    // Convert tender ID format
    const bidNumber = tenderId.replace(/_/g, "/");

    const [rows] = await db.query(
      "SELECT is_interested FROM gem_tenders WHERE bid_number = ? LIMIT 1",
      [bidNumber]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Tender not found"
      });
    }

    res.json({
      success: true,
      data: {
        bid_number: bidNumber,
        is_interested: rows[0].is_interested || 0
      }
    });

  } catch (err) {
    console.error("Error fetching tender interest:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch tender interest status"
    });
  }
};

// Update tender interest status (set specific value)
exports.updateTenderInterest = async (req, res) => {
  try {
    const { tenderId } = req.params;
    const { is_interested } = req.body;
    
    // Convert tender ID format
    const bidNumber = tenderId.replace(/_/g, "/");

    // Validate input
    if (is_interested !== 0 && is_interested !== 1) {
      return res.status(400).json({
        success: false,
        message: "is_interested must be 0 (not interested) or 1 (interested)"
      });
    }

    // Check if tender exists
    const [tenderRows] = await db.query(
      "SELECT is_interested FROM gem_tenders WHERE bid_number = ? LIMIT 1",
      [bidNumber]
    );

    if (tenderRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Tender not found"
      });
    }

    // Update the interest status
    await db.query(
      "UPDATE gem_tenders SET is_interested = ? WHERE bid_number = ?",
      [is_interested, bidNumber]
    );

    res.json({
      success: true,
      message: `Tender marked as ${is_interested === 1 ? 'interested' : 'not interested'}`,
      data: {
        bid_number: bidNumber,
        is_interested: is_interested,
        previous_status: tenderRows[0].is_interested || 0
      }
    });

  } catch (err) {
    console.error("Error updating tender interest:", err);
    res.status(500).json({
      success: false,
      message: "Failed to update tender interest status"
    });
  }
};
