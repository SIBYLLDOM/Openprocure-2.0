const db = require("../config/db");
const fs = require("fs");
const path = require("path");
const { getUserScope, tenderScopeSql } = require("../utils/userScope");
const { requiresApproval, createRequest } = require("./approvals.controller");
const { setupProceedWorkspace, resetDocPrepForFreshStart } = require("../utils/workspaceSetup");
const { findZsmForBid } = require("../utils/zsmStateMap");
const { notifyUsers } = require("../utils/notify");

// Who actually marked a tender 'proceed' — never recorded before. Active
// Workspaces shows this instead of a fake "Unassigned" placeholder.
(async () => {
  try {
    await db.query('ALTER TABLE tender_status_history ADD COLUMN marked_by INT NULL');
  } catch (e) { if (!e.message.includes('Duplicate column')) console.error('[tender-status] marked_by column init failed:', e.message); }
  try {
    // Manual override of the auto-resolved ZSM shown in the Tender Status modal.
    await db.query('ALTER TABLE tender_status_history ADD COLUMN assigned_zsm_id INT NULL');
  } catch (e) { if (!e.message.includes('Duplicate column')) console.error('[tender-status] assigned_zsm_id column init failed:', e.message); }
  try {
    // Tender Executives assigned to work a tender's documentation once it is
    // proceeded — restricts who besides the assigner sees it in Active Workspaces.
    await db.query(`CREATE TABLE IF NOT EXISTS tender_assigned_executives (
      id INT AUTO_INCREMENT PRIMARY KEY,
      bid_number VARCHAR(191) NOT NULL,
      user_id INT NOT NULL,
      assigned_by INT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_bid_user (bid_number, user_id)
    )`);
  } catch (e) { console.error('[tender-status] tender_assigned_executives table init failed:', e.message); }
})();

// Get tender status history
exports.getTenderStatusHistory = async (req, res) => {
  try {
    const { tenderId } = req.params;

    // Convert tender ID format: GEM_2025_B_XXXX -> GEM/2025/B/XXXX
    const bidNumber = tenderId.replace(/_/g, "/");

    const [rows] = await db.query(
      // created_date is second-precision, so two updates made in the same
      // second tie and come back in arbitrary order — id breaks the tie so the
      // newest entry is reliably first (the UI shows history[0] as current).
      `SELECT id, status, remarks, created_date, updated_date
       FROM tender_status_history
       WHERE bid_number = ?
       ORDER BY created_date DESC, id DESC`,
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
    if (req.user.role === 'Sales') {
      return res.status(403).json({
        success: false,
        message: "Sales cannot change tender status"
      });
    }

    const { tenderId } = req.params;
    const { status, remarks, assignedZsmId, assignedExecutiveIds } = req.body;

    // Convert tender ID format
    const bidNumber = tenderId.replace(/_/g, "/");

    // Validate status
    const validStatuses = ['proceed', 'win', 'lose', 'close'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be one of: proceed, win, lose, close"
      });
    }

    // A Tender Executive cannot mark a tender 'proceed' directly — it becomes a
    // request routed to a Tender Admin in their department, and the status is
    // only written once that request is approved (approvals.controller.js).
    const scope = await getUserScope(req.user.id);
    if (status === 'proceed' && requiresApproval(scope)) {
      if (!scope.divisions.length || !scope.sources.length) {
        return res.status(400).json({
          success: false,
          message: 'You have no department assigned, so there is no Tender Admin to approve this.',
        });
      }

      const [[pending]] = await db.query(
        `SELECT id, status FROM approval_requests
         WHERE type = 'tender_proceed' AND bid_number = ? AND requested_by = ?
         ORDER BY created_at DESC LIMIT 1`,
        [bidNumber, req.user.id]
      );
      if (pending && pending.status === 'pending') {
        return res.status(409).json({
          success: false,
          message: 'Approval for this tender is already pending with your Tender Admin.',
        });
      }

      const id = await createRequest({
        type: 'tender_proceed', bidNumber, remarks,
        userId: req.user.id, scope,
      });
      return res.status(202).json({
        success: true,
        pendingApproval: true,
        message: 'Sent to your Tender Admin for approval. The tender will be marked Proceed once approved.',
        data: { approvalRequestId: id, bid_number: bidNumber, status: 'pending_approval' },
      });
    }

    // Insert new status record
    const [result] = await db.query(
      `INSERT INTO tender_status_history
       (bid_number, status, remarks, marked_by, assigned_zsm_id, created_date, updated_date)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      [bidNumber, status, remarks, req.user.id, assignedZsmId || null]
    );

    // Same bootstrap as the approval path, so a directly-marked tender gets
    // its Sales and Finance departments too — and always starts Doc Prep
    // completely fresh, even if this bid was analyzed before (proceeded
    // previously, moved off, and is proceeding again).
    if (status === 'proceed') {
      await resetDocPrepForFreshStart(bidNumber);
      await setupProceedWorkspace(bidNumber, {
        division: scope.divisions[0] || null,
        source: scope.sources[0] || null,
      });

      // Assign chosen Tender Executives to this tender's documentation work.
      // Only they (plus whoever assigned them) will see this tender in Active
      // Workspaces — everyone else in the department is excluded (see
      // getAllTenderStatusHistory below).
      if (Array.isArray(assignedExecutiveIds) && assignedExecutiveIds.length) {
        const ids = [...new Set(assignedExecutiveIds.map(Number).filter(Boolean))];
        if (ids.length) {
          await db.query('DELETE FROM tender_assigned_executives WHERE bid_number = ?', [bidNumber]);
          const values = ids.map(id => [bidNumber, id, req.user.id]);
          await db.query(
            'INSERT INTO tender_assigned_executives (bid_number, user_id, assigned_by) VALUES ?',
            [values]
          );

          const [executives] = await db.query(
            `SELECT id, name, email FROM users WHERE id IN (${ids.map(() => '?').join(',')}) AND status = 'Active'`,
            ids
          );
          notifyUsers(executives, {
            type: 'tender_assigned',
            title: 'New tender assigned to you',
            body: `Tender ${bidNumber} has been marked Proceed and assigned to you. Start documentation preparation in Active Workspaces.`,
            link: `/Admin/workdesk/active-workspaces`,
            refType: 'tender',
            refId: bidNumber,
            emailSubject: `Tender ${bidNumber} assigned to you — start documentation`,
          }).catch(err => console.error('[tender-status] notifyUsers failed:', err.message));
        }
      }
    }

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

    // Department scoping (division Endo/Diagno x source GEM/Open). Admin is
    // unrestricted; a Tender Admin sees only their own department and sees
    // nothing if unassigned. Shared with the Admin lists via utils/userScope.js.
    const scope = await getUserScope(userId);

    let query = `SELECT
           t1.bid_number, t1.status, t1.remarks, t1.updated_date,
           marker.name AS marked_by_name,
           marker.email AS marked_by_email,
           dps.zip_downloaded_at,
           EXISTS (SELECT 1 FROM tender_summaries ts WHERE ts.tender_id = t1.bid_number) AS has_summary,
           ar.status AS decode_status,
           ar.stage AS decode_stage,
           COALESCE(
             (SELECT gt2.end_date FROM gem_tenders gt2
              WHERE gt2.bid_number = t1.bid_number
              LIMIT 1),
             (SELECT otd2.closing_date FROM open_tender_details otd2
              WHERE otd2.tender_id = t1.bid_number OR otd2.tender_id = REPLACE(t1.bid_number, '/', '_')
              LIMIT 1)
           ) AS bid_end_date
       FROM tender_status_history t1
       JOIN (
           SELECT bid_number, MAX(created_date) as max_date
           FROM tender_status_history
           GROUP BY bid_number
       ) t2 ON t1.bid_number = t2.bid_number AND t1.created_date = t2.max_date
       LEFT JOIN (
           SELECT h.bid_number, h.marked_by
           FROM tender_status_history h
           JOIN (
               SELECT bid_number, MIN(created_date) AS first_proceed
               FROM tender_status_history
               WHERE status = 'proceed'
               GROUP BY bid_number
           ) fp ON fp.bid_number = h.bid_number AND h.created_date = fp.first_proceed
           WHERE h.status = 'proceed'
       ) proceed_row ON proceed_row.bid_number = t1.bid_number
       LEFT JOIN users marker ON marker.id = proceed_row.marked_by
       LEFT JOIN doc_prep_sessions dps ON dps.bid_no COLLATE utf8mb4_0900_ai_ci = t1.bid_number
       LEFT JOIN (
           SELECT a1.bid_number, a1.status, a1.stage
           FROM approval_requests a1
           JOIN (
               SELECT bid_number, MAX(created_at) AS max_created
               FROM approval_requests
               WHERE type = 'process_decode'
               GROUP BY bid_number
           ) a2 ON a2.bid_number = a1.bid_number AND a1.created_at = a2.max_created
           WHERE a1.type = 'process_decode'
       ) ar ON ar.bid_number = t1.bid_number`;

    const scoped = tenderScopeSql(scope, 't1.bid_number');
    const queryParams = [...scoped.params];
    const whereClauses = [scoped.sql];

    // A Tender Executive only sees tenders they were specifically assigned to
    // work on (via the "Assign Tender Executive" field on the Tender Status
    // modal), or ones they themselves marked Proceed — not the whole
    // department. Every other role keeps the existing department scoping.
    if (scope.isExecutive) {
      whereClauses.push(
        `(EXISTS (SELECT 1 FROM tender_assigned_executives tae WHERE tae.bid_number = t1.bid_number AND tae.user_id = ?)
          OR proceed_row.marked_by = ?)`
      );
      queryParams.push(userId, userId);
    }

    if (whereClauses.length) {
      query += ` WHERE ${whereClauses.join(' AND ')}`;
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

// Delete a workspace (removes all status history for a bid_number) — Admin only
/**
 * DELETE /api/tender-status/tender-status-history/:bidNumber (Admin only)
 * Deleting a workspace card wipes the whole workspace, not just this history
 * row — otherwise re-opening the same tender ID resurrects the old Doc Prep
 * session, My Documents, tasks, deadlines, etc., which isn't a "fresh start".
 * Every table below is either keyed directly by bid/tender id, or (the
 * workspace_* tables) by workspaces.id via tender_id — both formats use real
 * "/" separators here, matching how doc_prep_sessions.bid_no is stored.
 */
exports.deleteTenderWorkspace = async (req, res) => {
  try {
    if (req.user.role !== 'Admin' && req.user.role !== 'Tender Admin' && req.user.role !== 'Office Administrator') {
      return res.status(403).json({
        success: false,
        message: "Only Admins and Tender Admins can delete workspaces"
      });
    }

    const { bidNumber } = req.params;
    // bidNumber already has real "/" separators (see route regex comment above),
    // unlike other endpoints in this codebase that receive "_"-joined tenderIds.
    const decodedBidNumber = decodeURIComponent(bidNumber);

    const [result] = await db.query(
      `DELETE FROM tender_status_history WHERE bid_number = ?`,
      [decodedBidNumber]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Workspace not found"
      });
    }

    // Cascade-wipe everything else this tender's workspace touched.
    const [[ws]] = await db.query(`SELECT id FROM workspaces WHERE tender_id = ?`, [decodedBidNumber]);
    if (ws) {
      const workspaceId = ws.id;
      await db.query(`DELETE FROM workspace_tasks WHERE workspace_id = ?`, [workspaceId]).catch(() => {});
      await db.query(`DELETE FROM workspace_deadlines WHERE workspace_id = ?`, [workspaceId]).catch(() => {});
      await db.query(`DELETE FROM workspace_employees WHERE workspace_id = ?`, [workspaceId]).catch(() => {});
      await db.query(`DELETE FROM workspace_analytics_data WHERE workspace_id = ?`, [workspaceId]).catch(() => {});
      await db.query(`DELETE FROM workspace_departments WHERE workspace_id = ?`, [workspaceId]).catch(() => {});
      await db.query(`DELETE FROM workspaces WHERE id = ?`, [workspaceId]).catch(() => {});
    }

    await db.query(`DELETE FROM doc_prep_sessions WHERE bid_no = ?`, [decodedBidNumber]).catch(() => {});
    await db.query(`DELETE FROM tender_summaries WHERE tender_id = ?`, [decodedBidNumber]).catch(() => {});
    await db.query(`DELETE FROM workdesk_documents WHERE bid_no = ?`, [decodedBidNumber]).catch(() => {});
    await db.query(`DELETE FROM tender_document_analysis WHERE tender_id = ?`, [decodedBidNumber]).catch(() => {});
    await db.query(`DELETE FROM tender_processing_results WHERE bid_no = ?`, [decodedBidNumber]).catch(() => {});
    await db.query(`DELETE FROM tender_document_reads WHERE bid_number = ?`, [decodedBidNumber]).catch(() => {});

    // Uploaded bid documents / annexures on disk for this tender's Doc Prep session.
    const safe = decodedBidNumber.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const docPrepFolder = path.join(__dirname, '../../uploads/doc-prep', safe);
    if (fs.existsSync(docPrepFolder)) {
      try { fs.rmSync(docPrepFolder, { recursive: true, force: true }); } catch { /* best effort */ }
    }

    res.json({
      success: true,
      message: "Workspace deleted successfully"
    });

  } catch (err) {
    console.error("Error deleting tender workspace:", err);
    res.status(500).json({
      success: false,
      message: "Failed to delete workspace"
    });
  }
};

// Who is set to receive the tender's assignment mail — the ZSM auto-resolved
// from the tender's state (zsmStateMap.js), or a manually chosen override
// already saved on the latest status row for this bid. Also returns the full
// active-ZSM list so the UI can offer an Edit dropdown.
exports.getTenderZsm = async (req, res) => {
  try {
    const { tenderId } = req.params;
    const bidNumber = tenderId.replace(/_/g, "/");

    const [allZsms] = await db.query(
      `SELECT id, name, email FROM users WHERE role = 'Zonal Head' AND status = 'Active' ORDER BY name`
    );

    const [[latest]] = await db.query(
      `SELECT assigned_zsm_id FROM tender_status_history
       WHERE bid_number = ? ORDER BY created_date DESC, id DESC LIMIT 1`,
      [bidNumber]
    );

    let selected = null;
    if (latest?.assigned_zsm_id) {
      selected = allZsms.find(z => z.id === latest.assigned_zsm_id) || null;
    }

    let autoResolved = [];
    if (!selected) {
      autoResolved = await findZsmForBid(bidNumber);
      selected = autoResolved[0] || null;
    }

    res.json({
      success: true,
      data: {
        zsm: selected,
        autoResolved,
        isOverridden: !!latest?.assigned_zsm_id,
        allZsms,
      },
    });
  } catch (err) {
    console.error("Error resolving tender ZSM:", err);
    res.status(500).json({ success: false, message: "Failed to resolve ZSM" });
  }
};

// Search Tender Executives for the "Assign Tender Executive" field — a plain
// name/email search, capped at 5 results by default so the field shows a
// short starter list until the user types.
exports.searchTenderExecutives = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const limit = Math.min(parseInt(req.query.limit, 10) || 5, 25);

    let rows;
    if (q) {
      [rows] = await db.query(
        `SELECT id, name, email FROM users
         WHERE role = 'Tender Executive' AND status = 'Active'
           AND (name LIKE ? OR email LIKE ?)
         ORDER BY name LIMIT ?`,
        [`%${q}%`, `%${q}%`, limit]
      );
    } else {
      [rows] = await db.query(
        `SELECT id, name, email FROM users
         WHERE role = 'Tender Executive' AND status = 'Active'
         ORDER BY name LIMIT ?`,
        [limit]
      );
    }

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Error searching tender executives:", err);
    res.status(500).json({ success: false, message: "Failed to search tender executives" });
  }
};

// Which Tender Executives are currently assigned to this tender.
exports.getTenderExecutives = async (req, res) => {
  try {
    const { tenderId } = req.params;
    const bidNumber = tenderId.replace(/_/g, "/");

    const [rows] = await db.query(
      `SELECT u.id, u.name, u.email
       FROM tender_assigned_executives tae
       JOIN users u ON u.id = tae.user_id
       WHERE tae.bid_number = ?
       ORDER BY u.name`,
      [bidNumber]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Error fetching assigned tender executives:", err);
    res.status(500).json({ success: false, message: "Failed to fetch assigned executives" });
  }
};
