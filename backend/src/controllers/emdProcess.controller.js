const db = require('../config/db');
const { findZsmForBid } = require('../utils/zsmStateMap');

// One row per tender, holding whichever wizard steps have been filled so
// far as JSON — same "just persist the whole form as JSON" pattern used by
// process_decode's approval payload, but this isn't an approval yet (EMD
// is still being built step by step), so it gets its own lightweight table
// rather than being shoehorned into the approvals flow prematurely.
const ensureTable = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS tender_emd_process (
      bid_no        VARCHAR(255) NOT NULL PRIMARY KEY,
      current_step  INT NOT NULL DEFAULT 1,
      step1         JSON NULL,
      step2         JSON NULL,
      updated_by    INT NULL,
      updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
  // Table pre-dates step2 — add the column for anyone who already has it.
  const [cols] = await db.query(`SHOW COLUMNS FROM tender_emd_process LIKE 'step2'`);
  if (!cols.length) {
    await db.query(`ALTER TABLE tender_emd_process ADD COLUMN step2 JSON NULL AFTER step1`);
  }
};
ensureTable().catch((err) => console.error('[emd-process] table init failed:', err));

// GET /api/tenders/:bidNumber/emd-process
const getEmdProcess = async (req, res) => {
  try {
    const bidNo = decodeURIComponent(req.params.bidNumber).replace(/_/g, '/');
    const [[row]] = await db.query(
      'SELECT current_step, step1, step2 FROM tender_emd_process WHERE bid_no = ?',
      [bidNo]
    );
    if (!row) {
      return res.json({ success: true, data: { currentStep: 1, step1: null, step2: null } });
    }
    res.json({
      success: true,
      data: {
        currentStep: row.current_step,
        step1: typeof row.step1 === 'string' ? JSON.parse(row.step1) : row.step1,
        step2: typeof row.step2 === 'string' ? JSON.parse(row.step2) : row.step2,
      },
    });
  } catch (err) {
    console.error('getEmdProcess:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch EMD process' });
  }
};

// PUT /api/tenders/:bidNumber/emd-process
// Body: { step1: {...}, currentStep?: number }
const saveEmdProcess = async (req, res) => {
  try {
    const bidNo = decodeURIComponent(req.params.bidNumber).replace(/_/g, '/');
    const { step1, step2, currentStep = 1 } = req.body;

    // Each step is only overwritten when the caller actually sends it —
    // saving step2 from the step-2 screen must not wipe out step1's data
    // (and vice versa), since only one step's fields are in scope per call.
    const [[existing]] = await db.query('SELECT step1, step2 FROM tender_emd_process WHERE bid_no = ?', [bidNo]);
    const parseJsonCol = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
    const nextStep1 = step1 !== undefined ? step1 : (existing ? parseJsonCol(existing.step1) : null);
    const nextStep2 = step2 !== undefined ? step2 : (existing ? parseJsonCol(existing.step2) : null);

    await db.query(
      `INSERT INTO tender_emd_process (bid_no, current_step, step1, step2, updated_by)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE current_step = VALUES(current_step), step1 = VALUES(step1), step2 = VALUES(step2), updated_by = VALUES(updated_by)`,
      [bidNo, currentStep, JSON.stringify(nextStep1), JSON.stringify(nextStep2), req.user.id]
    );

    res.json({ success: true, bid_no: bidNo, currentStep, step1: nextStep1, step2: nextStep2 });
  } catch (err) {
    console.error('saveEmdProcess:', err);
    res.status(500).json({ success: false, message: 'Failed to save EMD process' });
  }
};

// GET /api/tenders/:bidNumber/zsm-candidates — same state->ZSM routing used
// by Process Decode approvals, reused here so the EMD form's ZSM Email ID
// can be autofilled (and offered as a dropdown for the multi-ZSM states)
// instead of typed by hand.
const getZsmCandidates = async (req, res) => {
  try {
    const bidNo = decodeURIComponent(req.params.bidNumber).replace(/_/g, '/');
    const candidates = await findZsmForBid(bidNo);
    res.json({ success: true, data: candidates });
  } catch (err) {
    console.error('getZsmCandidates:', err);
    res.status(500).json({ success: false, message: 'Failed to resolve ZSM for this tender' });
  }
};

module.exports = { getEmdProcess, saveEmdProcess, getZsmCandidates };
