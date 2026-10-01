const db = require('../config/db');
const ExcelJS = require('exceljs');

const ZONE_ABBR = { North: 'NR', East: 'ER', West: 'WR', South: 'SR' };

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// Tender due dates come from GeM/CPPP scrapers in varying formats
// ("21-02-2026 5:00 PM", "21-Feb-2026 05:00 PM"), so this only needs the month/year.
function parseMonthYear(dateStr) {
  if (!dateStr) return null;
  const m = String(dateStr).match(/(\d{1,2})[-\/]([A-Za-z]{3}|\d{1,2})[-\/](\d{4})/);
  if (!m) return null;
  const [, , monRaw, yearRaw] = m;
  const year = Number(yearRaw);
  const month = /^\d+$/.test(monRaw) ? Number(monRaw) - 1 : MONTHS[monRaw.toLowerCase()];
  if (month === undefined || Number.isNaN(month) || Number.isNaN(year)) return null;
  return { month, year };
}

function deriveFyYear(dateStr) {
  const my = parseMonthYear(dateStr);
  if (!my) return null;
  // Indian financial year: Apr–Mar
  const fyStart = my.month >= 3 ? my.year : my.year - 1;
  return `${fyStart}-${fyStart + 1}`;
}

function cleanPrice(raw) {
  if (raw === null || raw === undefined) return null;
  const cleaned = String(raw).replace(/\(.*?\)/g, '').replace(/[^\d.]/g, '').trim();
  return cleaned || null;
}

function parseFinancialEval(raw) {
  if (!raw) return [];
  let rows = raw;
  if (typeof raw === 'string') {
    try { rows = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(rows)) return [];
  return rows.map(r => ({
    rank: (r.Rank || r.rank || '').toUpperCase(),
    company: r['Seller Name'] || r.seller_name || null,
    price: cleanPrice(r['Total Price'] || r.total_price),
  }));
}

async function loadZoneRoster() {
  const [rows] = await db.query(
    `SELECT id, name, emp_id, state, zone, role, reporting_to_leader_id FROM zone_data`
  );
  const leadersById = new Map();
  const flspByState = new Map();
  rows.forEach(r => {
    if (r.role === 'Leader') leadersById.set(r.id, r);
    if (r.role === 'FLSP' && r.state) flspByState.set(r.state, r);
  });
  return { leadersById, flspByState };
}

function resolveAllocation(roster, state) {
  if (!state) return { zh: null, flsp: null, zone: null };
  const flsp = roster.flspByState.get(state);
  if (!flsp) return { zh: null, flsp: null, zone: null };
  const leader = flsp.reporting_to_leader_id ? roster.leadersById.get(flsp.reporting_to_leader_id) : null;
  return {
    zh: leader ? leader.name : null,
    flsp: flsp.name,
    zone: flsp.zone ? (ZONE_ABBR[flsp.zone] || flsp.zone) : null,
  };
}

async function loadOverrides(tenderNos) {
  if (!tenderNos.length) return new Map();
  const [rows] = await db.query(
    `SELECT * FROM tender_tracker_overrides WHERE tender_no IN (${tenderNos.map(() => '?').join(',')})`,
    tenderNos
  );
  const map = new Map();
  rows.forEach(r => map.set(r.tender_no, r));
  return map;
}

// Applies the Final Remarks filter (exact match, or the "__blank__" sentinel for unset)
// against whatever the effective remarks expression is for a branch.
function applyRemarksFilter(where, params, remarksExpr, remarks) {
  if (!remarks) return where;
  if (remarks === '__blank__') {
    return `${where} AND ${remarksExpr} IS NULL`;
  }
  params.push(remarks);
  return `${where} AND ${remarksExpr} = ?`;
}

// GeM tenders: relevancy is decided by tender_processing_results.result = 'yes'.
// gem_tenders' own relevance/MainRelevencyModelStatus flags are effectively unused/unpopulated.
function buildGemBranch({ dept, search, onlyWithPricing, remarks }) {
  const params = [];
  let where = `WHERE tpr.result = 'yes'`;

  if (dept && dept !== 'all') {
    where += ` AND LOWER(COALESCE(tpr.dept, gt.dept)) LIKE ?`;
    params.push(`%${dept.toLowerCase()}%`);
  }
  if (search) {
    where += ` AND (gt.bid_number LIKE ? OR gt.department LIKE ? OR gt.state LIKE ? OR gt.district LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (onlyWithPricing) {
    where += ` AND tt.financial_evaluvation IS NOT NULL AND JSON_LENGTH(tt.financial_evaluvation) > 0`;
  }
  where = applyRemarksFilter(where, params, `COALESCE(ovr.final_remarks, tt.remarks, tt.status)`, remarks);

  const sql = `
    SELECT
      'GEM'                                                             AS source,
      CONVERT(gt.bid_number USING utf8mb4) COLLATE utf8mb4_unicode_ci    AS tender_no,
      CONVERT(COALESCE(ovr.state, gt.state) USING utf8mb4) COLLATE utf8mb4_unicode_ci AS state,
      CONVERT(gt.district USING utf8mb4) COLLATE utf8mb4_unicode_ci      AS location,
      CONVERT(gt.end_date USING utf8mb4) COLLATE utf8mb4_unicode_ci      AS due_date,
      CONVERT(gt.emd_amount USING utf8mb4) COLLATE utf8mb4_unicode_ci    AS emd_amount,
      CONVERT(COALESCE(tt.buyer_organisation, gt.department) USING utf8mb4) COLLATE utf8mb4_unicode_ci AS customer_name,
      tt.financial_evaluvation                                          AS financial_evaluvation,
      CONVERT(tt.remarks USING utf8mb4) COLLATE utf8mb4_unicode_ci       AS tracker_remarks,
      CONVERT(tt.status USING utf8mb4) COLLATE utf8mb4_unicode_ci        AS tracker_status,
      STR_TO_DATE(gt.end_date, '%d-%m-%Y %h:%i %p')                     AS sort_date
    FROM gem_tenders gt
    JOIN tender_processing_results tpr ON tpr.bid_no = gt.bid_number
    LEFT JOIN tender_tracker tt ON tt.bid_number = gt.bid_number COLLATE utf8mb4_unicode_ci
    LEFT JOIN tender_tracker_overrides ovr ON ovr.tender_no = gt.bid_number COLLATE utf8mb4_unicode_ci
    ${where}
  `;
  return { sql, params };
}

// Open/CPPP tenders: relevancy is decided by open_tender_details.relevency_checker = 'proceed_futher'.
// They never have GeM-style L1/L2/L3 bid results, so "only with pricing" excludes this branch entirely.
function buildOpenBranch({ dept, search, onlyWithPricing, remarks }) {
  if (onlyWithPricing) return null;

  const params = [];
  let where = `WHERE otd.relevency_checker = 'proceed_futher'`;

  if (dept && dept !== 'all') {
    where += ` AND LOWER(otd.dept) LIKE ?`;
    params.push(`%${dept.toLowerCase()}%`);
  }
  if (search) {
    where += ` AND (otd.tender_id LIKE ? OR otd.organisation_name LIKE ? OR otd.state LIKE ? OR otd.location LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  where = applyRemarksFilter(where, params, `ovr.final_remarks`, remarks);

  const sql = `
    SELECT
      'OPEN'                                                              AS source,
      CONVERT(otd.tender_id USING utf8mb4) COLLATE utf8mb4_unicode_ci     AS tender_no,
      CONVERT(COALESCE(ovr.state, otd.state) USING utf8mb4) COLLATE utf8mb4_unicode_ci AS state,
      CONVERT(otd.location USING utf8mb4) COLLATE utf8mb4_unicode_ci      AS location,
      CONVERT(otd.closing_date USING utf8mb4) COLLATE utf8mb4_unicode_ci  AS due_date,
      CONVERT(otd.emd_amount USING utf8mb4) COLLATE utf8mb4_unicode_ci    AS emd_amount,
      CONVERT(otd.organisation_name USING utf8mb4) COLLATE utf8mb4_unicode_ci AS customer_name,
      CAST(NULL AS JSON)                                                  AS financial_evaluvation,
      CAST(NULL AS CHAR) COLLATE utf8mb4_unicode_ci                       AS tracker_remarks,
      CAST(NULL AS CHAR) COLLATE utf8mb4_unicode_ci                       AS tracker_status,
      STR_TO_DATE(otd.closing_date, '%d-%M-%Y %h:%i %p')                  AS sort_date
    FROM open_tender_details otd
    LEFT JOIN tender_tracker_overrides ovr ON ovr.tender_no = otd.tender_id COLLATE utf8mb4_unicode_ci
    ${where}
  `;
  return { sql, params };
}

// Shared by the paginated list endpoint and the Excel export — runs the filtered
// UNION query, merges in the roster/overrides, and returns fully-formatted rows.
async function queryTenderTracker({ dept, search, source, onlyWithPricing, remarks, limit, offset }) {
  const branches = [];
  if (source === 'gem') {
    branches.push(buildGemBranch({ dept, search, onlyWithPricing, remarks }));
  } else if (source === 'open') {
    branches.push(buildOpenBranch({ dept, search, onlyWithPricing, remarks }));
  } else {
    branches.push(buildGemBranch({ dept, search, onlyWithPricing, remarks }));
    branches.push(buildOpenBranch({ dept, search, onlyWithPricing, remarks }));
  }
  const activeBranches = branches.filter(Boolean);

  if (!activeBranches.length) return { rows: [], total: 0 };

  const unionSql = activeBranches.map(b => b.sql).join(' UNION ALL ');
  const unionParams = activeBranches.flatMap(b => b.params);

  const dataQuery = `
    SELECT * FROM (${unionSql}) combined
    ORDER BY combined.sort_date IS NULL, combined.sort_date DESC
    LIMIT ? OFFSET ?
  `;
  const countQuery = `SELECT COUNT(*) AS total FROM (${unionSql}) combined`;

  const [[rawRows], [[{ total }]]] = await Promise.all([
    db.query(dataQuery, [...unionParams, limit, offset]),
    db.query(countQuery, unionParams),
  ]);

  const [roster, overrides] = await Promise.all([
    loadZoneRoster(),
    loadOverrides(rawRows.map(r => r.tender_no)),
  ]);

  const rows = rawRows.map((r, idx) => {
    const alloc = resolveAllocation(roster, r.state);
    const evalRows = parseFinancialEval(r.financial_evaluvation);
    const byRank = rank => evalRows.find(e => e.rank === rank) || {};
    const ov = overrides.get(r.tender_no) || {};

    return {
      sno: offset + idx + 1,
      source: r.source,
      tenderNo: r.tender_no,
      fyYear: deriveFyYear(r.due_date),
      state: r.state || null,
      zh: ov.zh || alloc.zh,
      flsp: ov.flsp || alloc.flsp,
      location: r.location || null,
      customerName: r.customer_name || null,
      dueDate: r.due_date || null,
      dbHoDpNp: ov.db_ho_dp_np || null,
      dbName: ov.db_name || null,
      sapMaterialCode: ov.sap_material_code || null,
      emdAmt: ov.emd_amt || r.emd_amount || null,
      l1Company: byRank('L1').company || null,
      l1Price: byRank('L1').price || null,
      l2Company: byRank('L2').company || null,
      l2Price: byRank('L2').price || null,
      l3Company: byRank('L3').company || null,
      l3Price: byRank('L3').price || null,
      finalRemarks: ov.final_remarks || r.tracker_remarks || r.tracker_status || null,
      zm: ov.zm || null,
      hoPerson: ov.ho_person || null,
      zone: ov.zone || alloc.zone,
      feedbackResponse: ov.feedback_response || null,
    };
  });

  return { rows, total };
}

// GET /api/tender-tracker?page=&limit=&search=&dept=all|endo|diagno&source=all|gem|open&onlyWithPricing=true&remarks=
const getTenderTracker = async (req, res) => {
  try {
    const { page = 1, limit = 25, search = '', dept = 'all', source = 'all', remarks = '' } = req.query;
    const onlyWithPricing = req.query.onlyWithPricing === 'true';
    const offset = (Number(page) - 1) * Number(limit);

    const { rows: data, total } = await queryTenderTracker({
      dept, search, source, onlyWithPricing, remarks, limit: Number(limit), offset,
    });

    res.json({
      success: true,
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
      data,
    });
  } catch (error) {
    console.error('Error fetching tender tracker data:', error);
    res.status(500).json({ success: false, message: 'Server error fetching tender tracker data.', error: error.message });
  }
};

const EXPORT_COLUMNS = [
  { header: 'S.No', key: 'sno', width: 8 },
  { header: 'Source', key: 'source', width: 10 },
  { header: 'Tender No', key: 'tenderNo', width: 26 },
  { header: 'FY Year', key: 'fyYear', width: 12 },
  { header: 'State', key: 'state', width: 18 },
  { header: 'ZH', key: 'zh', width: 18 },
  { header: 'FLSP', key: 'flsp', width: 18 },
  { header: 'Location', key: 'location', width: 20 },
  { header: 'Customer Name', key: 'customerName', width: 32 },
  { header: 'Due Date', key: 'dueDate', width: 20 },
  { header: 'DB/ HO/ DP/ NP', key: 'dbHoDpNp', width: 14 },
  { header: 'DB Name', key: 'dbName', width: 24 },
  { header: 'SAP Material Code', key: 'sapMaterialCode', width: 18 },
  { header: 'EMD Amt', key: 'emdAmt', width: 14 },
  { header: 'L1 Company Name', key: 'l1Company', width: 26 },
  { header: 'L1 Quoted Price', key: 'l1Price', width: 16 },
  { header: 'L2 Company Name', key: 'l2Company', width: 26 },
  { header: 'L2 Quoted Price', key: 'l2Price', width: 16 },
  { header: 'L3 Company Name', key: 'l3Company', width: 26 },
  { header: 'L3 Quoted Price', key: 'l3Price', width: 16 },
  { header: 'Final Remarks', key: 'finalRemarks', width: 20 },
  { header: 'ZM', key: 'zm', width: 18 },
  { header: 'HO Person', key: 'hoPerson', width: 18 },
  { header: 'Zone (NR/ER/WR/SR)', key: 'zone', width: 12 },
  { header: 'Feedback Response - Strategy (July)', key: 'feedbackResponse', width: 34 },
];

// Hard cap so a runaway/unfiltered export can't try to stream an unbounded workbook.
const EXPORT_ROW_LIMIT = 20000;

// GET /api/tender-tracker/export?...same filters as the list endpoint
const exportTenderTracker = async (req, res) => {
  try {
    const { search = '', dept = 'all', source = 'all', remarks = '' } = req.query;
    const onlyWithPricing = req.query.onlyWithPricing === 'true';

    const { rows } = await queryTenderTracker({
      dept, search, source, onlyWithPricing, remarks, limit: EXPORT_ROW_LIMIT, offset: 0,
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Tender Tracker');
    worksheet.columns = EXPORT_COLUMNS;
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B3D73' } };
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    rows.forEach(row => worksheet.addRow(row));

    const filename = `tender_tracker_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting tender tracker:', error);
    res.status(500).json({ success: false, message: 'Server error exporting tender tracker.', error: error.message });
  }
};

const EDITABLE_FIELDS = {
  state: 'state',
  zh: 'zh',
  flsp: 'flsp',
  dbHoDpNp: 'db_ho_dp_np',
  dbName: 'db_name',
  sapMaterialCode: 'sap_material_code',
  emdAmt: 'emd_amt',
  finalRemarks: 'final_remarks',
  zm: 'zm',
  hoPerson: 'ho_person',
  zone: 'zone',
  feedbackResponse: 'feedback_response',
};

// PUT /api/tender-tracker/override
// Body: { tenderNo, source, <any subset of EDITABLE_FIELDS keys> }
// Only the fields present in the body are written; omitted fields keep their stored value.
const saveTenderTrackerOverride = async (req, res) => {
  try {
    const { tenderNo, source } = req.body;
    if (!tenderNo) {
      return res.status(400).json({ success: false, message: 'tenderNo is required.' });
    }

    const columns = ['tender_no', 'source'];
    const values = [tenderNo, source || null];
    Object.entries(EDITABLE_FIELDS).forEach(([key, column]) => {
      columns.push(column);
      values.push(req.body[key] !== undefined ? req.body[key] : null);
    });

    const updateClause = columns
      .filter(c => c !== 'tender_no')
      .map(c => `${c} = COALESCE(VALUES(${c}), ${c})`)
      .join(', ');

    await db.query(
      `INSERT INTO tender_tracker_overrides (${columns.join(', ')})
       VALUES (${columns.map(() => '?').join(', ')})
       ON DUPLICATE KEY UPDATE ${updateClause}`,
      values
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error saving tender tracker override:', error);
    res.status(500).json({ success: false, message: 'Server error saving override.', error: error.message });
  }
};

// GET /api/tender-tracker/remark-options
// Distinct Final Remarks values currently in use (scraped status + manual overrides),
// so the filter dropdown only ever shows real, matchable values.
const getRemarkOptions = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT DISTINCT value FROM (
        SELECT status AS value FROM tender_tracker WHERE status IS NOT NULL AND status != ''
        UNION
        SELECT remarks AS value FROM tender_tracker WHERE remarks IS NOT NULL AND remarks != ''
        UNION
        SELECT final_remarks AS value FROM tender_tracker_overrides WHERE final_remarks IS NOT NULL AND final_remarks != ''
      ) combined
      ORDER BY value ASC
    `);
    res.json({ success: true, options: rows.map(r => r.value) });
  } catch (error) {
    console.error('Error fetching remark options:', error);
    res.status(500).json({ success: false, message: 'Server error fetching remark options.', error: error.message });
  }
};

module.exports = { getTenderTracker, saveTenderTrackerOverride, getRemarkOptions, exportTenderTracker };
