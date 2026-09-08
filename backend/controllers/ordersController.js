const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');

// Clone of the automation site's "Order Management" pair — GeM Contracts
// (a filterable/sortable list of every awarded contract) and Carting
// Dashboard (aggregated Meril-vs-Others totals by state/month). Both read
// the same migrated `contracts` table.
//
// The original's "is Meril DB" flag came from an EXISTS join against a
// `dealers` table that was never migrated into this DB — but contracts
// itself already carries that same classification directly on
// `meril_or_others`/`meril_db` (set at scrape time), so this uses those
// columns instead of reintroducing the dealers table.
const MERIL_SQL = "contracts.meril_or_others = 'Meril'";

const NUM = (col) => `CAST(REPLACE(REPLACE(IFNULL(${col}, '0'), ',', ''), ' ', '') AS DECIMAL(15,2))`;
const CONTRACT_DATE_DT = "STR_TO_DATE(contracts.contract_date, '%d/%m/%Y %H:%i')";

// @route GET /api/orders/gem-contracts
exports.getGemContracts = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const offset = (page - 1) * limit;
    const { search, state, dept, category, buyingMode, contractDateFrom, contractDateTo, sort } = req.query;

    const conditions = ["LOWER(contracts.dept) IN ('diagno', 'endo')"];
    const replacements = { limit, offset };

    if (search) {
      conditions.push(`(contracts.contract_no LIKE :search OR contracts.product LIKE :search OR contracts.brand LIKE :search
        OR contracts.organization_name LIKE :search OR contracts.hospital_name LIKE :search
        OR contracts.seller_name LIKE :search OR contracts.category_name LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (state) { conditions.push('contracts.hospital_state = :state'); replacements.state = state; }
    if (dept) { conditions.push('LOWER(contracts.dept) = :dept'); replacements.dept = dept.toLowerCase(); }
    if (category) { conditions.push('contracts.category_name = :category'); replacements.category = category; }
    if (buyingMode) { conditions.push('contracts.buying_mode = :buyingMode'); replacements.buyingMode = buyingMode; }
    if (contractDateFrom) { conditions.push(`${CONTRACT_DATE_DT} >= :contractDateFrom`); replacements.contractDateFrom = contractDateFrom; }
    if (contractDateTo) { conditions.push(`${CONTRACT_DATE_DT} <= :contractDateTo`); replacements.contractDateTo = contractDateTo; }

    const whereSql = conditions.join(' AND ');

    const sortMap = {
      'contractDate-desc': `${CONTRACT_DATE_DT} DESC`,
      'contractDate-asc': `${CONTRACT_DATE_DT} ASC`,
      'contractValue-desc': `${NUM('contracts.total_value')} DESC`,
      'contractValue-asc': `${NUM('contracts.total_value')} ASC`,
    };
    const orderBySql = sortMap[sort] || sortMap['contractDate-desc'];

    const [rows, [summary]] = await Promise.all([
      sequelize.query(
        `SELECT contracts.id, contracts.contract_no, contracts.bid_no, contracts.buying_mode, contracts.order_status,
                contracts.contract_date, contracts.zonal_head, contracts.hospital_name, contracts.hospital_state,
                contracts.organization_name, contracts.seller_name, contracts.seller_state, contracts.meril_db,
                contracts.category_name, contracts.decode_code, contracts.meril_or_others, contracts.company_name,
                contracts.ordered_quantity, contracts.unit_price, contracts.total_value, contracts.download_link, contracts.dept
         FROM contracts
         WHERE ${whereSql}
         ORDER BY ${orderBySql}
         LIMIT :limit OFFSET :offset`,
        { replacements, type: QueryTypes.SELECT },
      ),
      sequelize.query(
        `SELECT COUNT(*) AS total, SUM(${NUM('contracts.total_value')}) AS totalValue
         FROM contracts WHERE ${whereSql}`,
        { replacements, type: QueryTypes.SELECT },
      ),
    ]);

    res.json({
      success: true,
      data: rows,
      total: Number(summary.total),
      totalValue: Number(summary.totalValue) || 0,
      page,
      limit,
      totalPages: Math.ceil(Number(summary.total) / limit),
    });
  } catch (err) {
    console.error('getGemContracts error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch contracts' });
  }
};

// @route GET /api/orders/gem-contracts/categories
exports.getContractCategories = async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT DISTINCT category_name FROM contracts
       WHERE category_name IS NOT NULL AND category_name != '' AND LOWER(dept) IN ('diagno', 'endo')
       ORDER BY category_name ASC`,
      { type: QueryTypes.SELECT },
    );
    res.json({ success: true, data: rows.map((r) => r.category_name) });
  } catch (err) {
    console.error('getContractCategories error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch categories' });
  }
};

// @route GET /api/orders/gem-contracts/states
exports.getContractStates = async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT DISTINCT hospital_state FROM contracts
       WHERE hospital_state IS NOT NULL AND hospital_state != '' AND LOWER(dept) IN ('diagno', 'endo')
       ORDER BY hospital_state ASC`,
      { type: QueryTypes.SELECT },
    );
    res.json({ success: true, data: rows.map((r) => r.hospital_state) });
  } catch (err) {
    console.error('getContractStates error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch states' });
  }
};

// ---- Carting Dashboard ----
// Filters shared by kpi/pivot/map — all parameterized (the original's
// carting.controller.js built these via raw string interpolation, a SQL
// injection hole; fixed here).
function buildCartingFilters(query) {
  const { buyingMode, dept, month, year, seller, state, category } = query;
  const conditions = ["LOWER(contracts.dept) IN ('diagno', 'endo')"];
  const replacements = {};

  if (buyingMode) { conditions.push('contracts.buying_mode = :buyingMode'); replacements.buyingMode = buyingMode; }
  if (dept) { conditions.push('LOWER(contracts.dept) = :dept'); replacements.dept = dept.toLowerCase(); }
  if (year) { conditions.push(`YEAR(${CONTRACT_DATE_DT}) = :year`); replacements.year = year; }
  if (month) { conditions.push(`MONTH(STR_TO_DATE(contracts.contract_date, '%d/%m/%Y %H:%i')) = :month`); replacements.month = month; }
  if (seller) { conditions.push('contracts.seller_name = :seller'); replacements.seller = seller; }
  if (state) { conditions.push('contracts.state = :state'); replacements.state = state; }
  if (category) { conditions.push('contracts.category_name = :category'); replacements.category = category; }

  return { whereSql: conditions.join(' AND '), replacements };
}

// @route GET /api/orders/carting/sellers
exports.getCartingSellers = async (req, res) => {
  try {
    const rows = await sequelize.query(
      "SELECT DISTINCT seller_name FROM contracts WHERE seller_name IS NOT NULL AND seller_name != '' AND LOWER(dept) IN ('diagno', 'endo') ORDER BY seller_name ASC",
      { type: QueryTypes.SELECT },
    );
    res.json({ success: true, data: rows.map((r) => r.seller_name) });
  } catch (err) {
    console.error('getCartingSellers error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch sellers' });
  }
};

// @route GET /api/orders/carting/states
exports.getCartingStates = async (req, res) => {
  try {
    const rows = await sequelize.query(
      "SELECT DISTINCT state FROM contracts WHERE state IS NOT NULL AND state != '' AND LOWER(dept) IN ('diagno', 'endo') ORDER BY state ASC",
      { type: QueryTypes.SELECT },
    );
    res.json({ success: true, data: rows.map((r) => r.state) });
  } catch (err) {
    console.error('getCartingStates error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch states' });
  }
};

// @route GET /api/orders/carting/categories?department=
exports.getCartingCategories = async (req, res) => {
  try {
    const { department } = req.query;
    const conditions = ["category_name IS NOT NULL", "category_name != ''", "LOWER(dept) IN ('diagno', 'endo')"];
    const replacements = {};
    if (department) { conditions.push('LOWER(dept) = :department'); replacements.department = department.toLowerCase(); }
    const rows = await sequelize.query(
      `SELECT DISTINCT category_name FROM contracts WHERE ${conditions.join(' AND ')} ORDER BY category_name ASC`,
      { replacements, type: QueryTypes.SELECT },
    );
    res.json({ success: true, data: rows.map((r) => r.category_name) });
  } catch (err) {
    console.error('getCartingCategories error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch categories' });
  }
};

// @route GET /api/orders/carting/kpi
exports.getCartingKpi = async (req, res) => {
  try {
    const { whereSql, replacements } = buildCartingFilters(req.query);
    const [[totalRow], [merilRow]] = await Promise.all([
      sequelize.query(`SELECT SUM(${NUM('contracts.total_value')}) AS val FROM contracts WHERE ${whereSql}`, { replacements, type: QueryTypes.SELECT }),
      sequelize.query(`SELECT SUM(${NUM('contracts.total_value')}) AS val FROM contracts WHERE ${whereSql} AND ${MERIL_SQL}`, { replacements, type: QueryTypes.SELECT }),
    ]);
    const total = Number(totalRow.val) || 0;
    const meril = Number(merilRow.val) || 0;
    res.json({ success: true, data: { total, meril, others: total - meril } });
  } catch (err) {
    console.error('getCartingKpi error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch carting KPIs' });
  }
};

// @route GET /api/orders/carting/pivot
exports.getCartingPivot = async (req, res) => {
  try {
    const { whereSql, replacements } = buildCartingFilters(req.query);
    const rows = await sequelize.query(
      `SELECT contracts.state,
              DATE_FORMAT(${CONTRACT_DATE_DT}, '%b') AS month,
              MONTH(${CONTRACT_DATE_DT}) AS monthNum,
              SUM(${NUM('contracts.total_value')}) AS total,
              SUM(CASE WHEN ${MERIL_SQL} THEN ${NUM('contracts.total_value')} ELSE 0 END) AS meril
       FROM contracts
       WHERE contracts.contract_date IS NOT NULL AND contracts.state IS NOT NULL AND contracts.state != '' AND ${whereSql}
       GROUP BY contracts.state, month, monthNum
       ORDER BY contracts.state ASC, monthNum DESC`,
      { replacements, type: QueryTypes.SELECT },
    );
    res.json({
      success: true,
      data: rows.map((r) => ({
        state: r.state, month: r.month,
        total: Number(r.total) || 0, meril: Number(r.meril) || 0, others: (Number(r.total) || 0) - (Number(r.meril) || 0),
      })),
    });
  } catch (err) {
    console.error('getCartingPivot error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch carting pivot' });
  }
};

// @route GET /api/orders/carting/map
exports.getCartingMap = async (req, res) => {
  try {
    const { whereSql, replacements } = buildCartingFilters(req.query);
    const rows = await sequelize.query(
      `SELECT contracts.state,
              SUM(${NUM('contracts.total_value')}) AS total,
              SUM(CASE WHEN ${MERIL_SQL} THEN ${NUM('contracts.total_value')} ELSE 0 END) AS meril
       FROM contracts
       WHERE contracts.state IS NOT NULL AND contracts.state != '' AND ${whereSql}
       GROUP BY contracts.state
       ORDER BY total DESC`,
      { replacements, type: QueryTypes.SELECT },
    );
    res.json({
      success: true,
      data: rows.map((r) => ({
        state: r.state, total: Number(r.total) || 0, meril: Number(r.meril) || 0, others: (Number(r.total) || 0) - (Number(r.meril) || 0),
      })),
    });
  } catch (err) {
    console.error('getCartingMap error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch carting map data' });
  }
};
