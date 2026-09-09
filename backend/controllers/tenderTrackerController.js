const ExcelJS = require('exceljs');
const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

// Tenders > Tender Tracker — clone of the AUTOMATION SITE reference's
// "Tender Tracker" page (Frontend/src/pages/Tenders/TenderTracker.jsx).
// Sources real, already-migrated tender data (gem_tenders + tender_processing_results
// for GeM, open_tender_details for Open/CPPP) — the exact same "classified +
// relevant" scoping tenderController.js already uses elsewhere in this app
// — and layers the manual tracking fields on top via tender_tracker_overrides
// (see that model for why it's scoped per-partner here, and why the
// reference's L1/L2/L3 pricing + roster-driven ZH/FLSP dropdown were
// intentionally dropped rather than faked: this system has no financial-
// evaluation table or staff-roster table with real data to back them).

const CLASSIFIED_SQL = "LOWER(gt.dept) IN ('diagno', 'endo')";
const GEM_RELEVANT_SQL = "(gt.ra_no IS NULL OR TRIM(gt.ra_no) = '') AND gt.perfect_cat = 1";

function fyYear(dateStr) {
  if (!dateStr) return null;
  let y; let m;
  // gem_tenders' start_date is stored as "DD-MM-YYYY h:mm AM/PM", which
  // `new Date()` cannot reliably parse (ambiguous with MM-DD-YYYY) —
  // extract the numeric day/month/year directly instead.
  const numeric = String(dateStr).match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (numeric) { m = Number(numeric[2]); y = Number(numeric[3]); }
  else {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return null;
    y = d.getFullYear(); m = d.getMonth() + 1;
  }
  return m >= 4 ? `FY${y}-${String(y + 1).slice(2)}` : `FY${y - 1}-${String(y).slice(2)}`;
}

// @route GET /api/tender-tracker
exports.listTracker = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 40));
    const offset = (page - 1) * limit;
    const { search, dept, source, remarks } = req.query;
    const userId = req.user.id;

    const gemWhere = [CLASSIFIED_SQL, GEM_RELEVANT_SQL];
    const openWhere = ["relevency_checker IN ('proceed_futher', 'files_downloaded', 'yes')"];
    const replacements = { userId };

    if (dept && ['diagno', 'endo'].includes(dept.toLowerCase())) {
      gemWhere.push('LOWER(gt.dept) = :dept');
      openWhere.push('LOWER(dept) = :dept');
      replacements.dept = dept.toLowerCase();
    }
    if (search) {
      gemWhere.push('(gt.bid_number LIKE :search OR gt.dept LIKE :search OR gt.state LIKE :search)');
      openWhere.push('(tender_refno LIKE :search OR dept LIKE :search OR state LIKE :search)');
      replacements.search = `%${search}%`;
    }

    const gemSql = `
      SELECT gt.bid_number AS tender_no, 'gem' AS source, gt.state, gt.district AS location,
             gt.dept, NULL AS customer_name, gt.items AS title, gt.end_date_dt AS due_date,
             gt.start_date AS start_date, gt.emd_amount
      FROM gem_tenders gt
      WHERE ${gemWhere.join(' AND ')}`;
    const openSql = `
      SELECT tender_refno AS tender_no, 'open' AS source, state, location,
             dept, organisation_name AS customer_name, tender_title AS title, closing_date AS due_date,
             e_published_date AS start_date, emd_amount
      FROM open_tender_details
      WHERE ${openWhere.join(' AND ')}`;

    const unionParts = [];
    if (!source || source === 'all' || source === 'gem') unionParts.push(gemSql);
    if (!source || source === 'all' || source === 'open') unionParts.push(openSql);
    const unionSql = unionParts.join(' UNION ALL ');

    let havingRemarks = '';
    if (remarks === '__blank__') havingRemarks = "WHERE (o.final_remarks IS NULL OR o.final_remarks = '')";
    else if (remarks) { havingRemarks = 'WHERE o.final_remarks = :remarks'; replacements.remarks = remarks; }

    const baseSql = `
      SELECT u.*, o.zh, o.flsp, o.db_ho_dp_np, o.db_name, o.sap_material_code, o.emd_override,
             o.final_remarks, o.zm, o.ho_person, o.zone, o.feedback_response
      FROM (${unionSql}) u
      LEFT JOIN tender_tracker_overrides o ON o.tender_no = u.tender_no AND o.source = u.source AND o.user_id = :userId
      ${havingRemarks}`;

    const [rows, [{ total }]] = await Promise.all([
      sequelize.query(`${baseSql} ORDER BY u.start_date DESC LIMIT :limit OFFSET :offset`, { replacements: { ...replacements, limit, offset }, type: QueryTypes.SELECT }),
      sequelize.query(`SELECT COUNT(*) AS total FROM (${baseSql}) x`, { replacements, type: QueryTypes.SELECT }),
    ]);

    res.json({
      success: true,
      data: rows.map((r) => ({ ...r, fy_year: fyYear(r.start_date) })),
      total: Number(total),
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(Number(total) / limit)),
    });
  } catch (err) {
    console.error('listTracker error:', err);
    res.status(500).json({ success: false, message: 'Failed to load tender tracker' });
  }
};

// @route GET /api/tender-tracker/remark-options
exports.getRemarkOptions = async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT DISTINCT final_remarks FROM tender_tracker_overrides WHERE user_id = :userId AND final_remarks IS NOT NULL AND final_remarks != '' ORDER BY final_remarks ASC`,
      { replacements: { userId: req.user.id }, type: QueryTypes.SELECT },
    );
    res.json({ success: true, data: rows.map((r) => r.final_remarks) });
  } catch (err) {
    console.error('getRemarkOptions error:', err);
    res.status(500).json({ success: false, message: 'Failed to load remark options' });
  }
};

const EDITABLE_FIELDS = ['zh', 'flsp', 'dbHoDpNp', 'dbName', 'sapMaterialCode', 'emdOverride', 'finalRemarks', 'zm', 'hoPerson', 'zone', 'feedbackResponse'];

// @route PUT /api/tender-tracker/override   { tenderNo, source, ...EDITABLE_FIELDS }
exports.saveOverride = async (req, res) => {
  try {
    const { TenderTrackerOverride } = require('../models');
    const { tenderNo, source } = req.body;
    if (!tenderNo || !['gem', 'open'].includes(source)) return res.status(400).json({ success: false, message: 'tenderNo and a valid source are required' });

    const [row] = await TenderTrackerOverride.findOrCreate({
      where: { userId: req.user.id, tenderNo, source },
      defaults: { userId: req.user.id, tenderNo, source },
    });
    for (const f of EDITABLE_FIELDS) if (req.body[f] !== undefined) row[f] = req.body[f] || null;
    await row.save();
    res.json({ success: true, data: row.toJSON() });
  } catch (err) {
    console.error('saveOverride error:', err);
    res.status(500).json({ success: false, message: 'Failed to save' });
  }
};

// @route GET /api/tender-tracker/export
exports.exportExcel = async (req, res) => {
  try {
    req.query.limit = '5000';
    req.query.page = '1';
    const fakeRes = { json: (payload) => { fakeRes.payload = payload; } };
    await exports.listTracker(req, fakeRes);
    const rows = fakeRes.payload?.data || [];

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Tender Tracker');
    sheet.columns = [
      { header: 'Tender No', key: 'tender_no', width: 22 },
      { header: 'Source', key: 'source', width: 10 },
      { header: 'FY Year', key: 'fy_year', width: 12 },
      { header: 'State', key: 'state', width: 16 },
      { header: 'Location', key: 'location', width: 16 },
      { header: 'Department', key: 'dept', width: 12 },
      { header: 'Customer Name', key: 'customer_name', width: 24 },
      { header: 'Title', key: 'title', width: 40 },
      { header: 'Due Date', key: 'due_date', width: 14 },
      { header: 'EMD Amount', key: 'emd_amount', width: 14 },
      { header: 'ZH', key: 'zh', width: 14 },
      { header: 'FLSP', key: 'flsp', width: 14 },
      { header: 'DB/HO/DP/NP', key: 'db_ho_dp_np', width: 14 },
      { header: 'DB Name', key: 'db_name', width: 18 },
      { header: 'SAP Material Code', key: 'sap_material_code', width: 16 },
      { header: 'Final Remarks', key: 'final_remarks', width: 20 },
      { header: 'ZM', key: 'zm', width: 14 },
      { header: 'HO Person', key: 'ho_person', width: 16 },
      { header: 'Zone', key: 'zone', width: 12 },
      { header: 'Feedback Response', key: 'feedback_response', width: 24 },
    ];
    sheet.addRows(rows);
    sheet.getRow(1).font = { bold: true };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="tender_tracker_export_${new Date().toISOString().slice(0, 10)}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('exportExcel error:', err);
    res.status(500).json({ success: false, message: 'Export failed' });
  }
};
