const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');

// Clone of the automation site's "Tender Insights" analytics pair —
// Competitor Portfolio Tracking (/insights/Company-Profile) and Compare
// Competitors (/insights/Compare-Bidders). Both derive entirely from the
// migrated `contracts` table (GeM-awarded contracts) keyed by seller_name —
// there's no dedicated bidders/competitors table in the original either.
// total_value/unit_price/ordered_quantity are scraped as free-text strings
// (sometimes with thousands-separator commas), same NUM/UP cast pattern the
// original used.
const NUM = (col) => `CAST(REPLACE(IFNULL(${col}, '0'), ',', '') AS DECIMAL(15,2))`;

// @route GET /api/analytics/sellers
exports.getSellers = async (req, res) => {
  try {
    const rows = await sequelize.query(
      "SELECT DISTINCT seller_name FROM contracts WHERE seller_name IS NOT NULL AND seller_name != '' ORDER BY seller_name ASC",
      { type: QueryTypes.SELECT },
    );
    res.json({ success: true, data: rows.map((r) => r.seller_name) });
  } catch (err) {
    console.error('getSellers error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch sellers' });
  }
};

// @route GET /api/analytics/company-profile?seller=<name>
// Competitor Portfolio Tracking — KPIs + state/brand/product breakdowns for
// one seller. The original computed these client-side from up to 1000 raw
// contract rows; done here as direct SQL aggregation instead (same output
// shape, no 1000-row payload).
exports.getCompanyProfile = async (req, res) => {
  try {
    const { seller } = req.query;
    if (!seller) return res.status(400).json({ success: false, message: 'seller is required' });

    const [[kpis], stateRows, brandRows, productRows] = await Promise.all([
      sequelize.query(
        `SELECT COUNT(*) AS totalContracts,
                SUM(${NUM('total_value')}) AS totalRevenue,
                AVG(${NUM('total_value')}) AS avgContractValue,
                COUNT(DISTINCT state) AS statesCovered,
                COUNT(DISTINCT brand) AS brandsSupplied,
                SUM(IF(buying_mode = 'Direct', 1, 0)) AS directCount
         FROM contracts WHERE seller_name = :seller`,
        { replacements: { seller }, type: QueryTypes.SELECT },
      ),
      sequelize.query(
        `SELECT state, COUNT(*) AS contracts, SUM(${NUM('total_value')}) AS revenue
         FROM contracts WHERE seller_name = :seller AND state IS NOT NULL AND state != ''
         GROUP BY state ORDER BY revenue DESC LIMIT 100`,
        { replacements: { seller }, type: QueryTypes.SELECT },
      ),
      sequelize.query(
        `SELECT brand, COUNT(*) AS contracts, SUM(${NUM('total_value')}) AS revenue
         FROM contracts WHERE seller_name = :seller AND brand IS NOT NULL AND brand != ''
         GROUP BY brand ORDER BY revenue DESC LIMIT 100`,
        { replacements: { seller }, type: QueryTypes.SELECT },
      ),
      sequelize.query(
        `SELECT product, brand, SUM(${NUM('ordered_quantity')}) AS qtySold,
                SUM(${NUM('total_value')}) AS revenue, AVG(${NUM('unit_price')}) AS avgUnitPrice
         FROM contracts WHERE seller_name = :seller AND product IS NOT NULL AND product != ''
         GROUP BY product, brand ORDER BY revenue DESC LIMIT 200`,
        { replacements: { seller }, type: QueryTypes.SELECT },
      ),
    ]);

    const totalContracts = Number(kpis.totalContracts) || 0;
    res.json({
      success: true,
      data: {
        kpis: {
          totalContracts,
          totalRevenue: Number(kpis.totalRevenue) || 0,
          avgContractValue: Number(kpis.avgContractValue) || 0,
          statesCovered: Number(kpis.statesCovered) || 0,
          brandsSupplied: Number(kpis.brandsSupplied) || 0,
          directSupplyPct: totalContracts ? Math.round(((Number(kpis.directCount) || 0) / totalContracts) * 1000) / 10 : 0,
        },
        stateWise: stateRows.map((r) => ({ state: r.state, contracts: Number(r.contracts), revenue: Number(r.revenue) || 0 })),
        brandWise: brandRows.map((r) => ({ brand: r.brand, contracts: Number(r.contracts), revenue: Number(r.revenue) || 0 })),
        products: productRows.map((r) => ({
          product: r.product, brand: r.brand,
          qtySold: Number(r.qtySold) || 0, revenue: Number(r.revenue) || 0, avgUnitPrice: Number(r.avgUnitPrice) || 0,
        })),
      },
    });
  } catch (err) {
    console.error('getCompanyProfile error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch company profile' });
  }
};

// @route GET /api/analytics/compare-bidders?seller1=<name>&seller2=<name>
// Compare Competitors — same 4-query shape as the original's compareSellers.
exports.compareBidders = async (req, res) => {
  try {
    const { seller1, seller2 } = req.query;
    if (!seller1 || !seller2) return res.status(400).json({ success: false, message: 'seller1 and seller2 are required' });
    if (seller1 === seller2) return res.status(400).json({ success: false, message: 'Choose two different sellers' });

    const [kpiRows, priceRows, stateRows, recentRows] = await Promise.all([
      sequelize.query(
        `SELECT seller_name, COUNT(*) AS totalContracts, SUM(${NUM('total_value')}) AS totalRevenue,
                AVG(${NUM('total_value')}) AS avgValue, SUM(IF(buying_mode = 'Direct', 1, 0)) AS directCount
         FROM contracts WHERE seller_name IN (:seller1, :seller2) GROUP BY seller_name`,
        { replacements: { seller1, seller2 }, type: QueryTypes.SELECT },
      ),
      sequelize.query(
        `SELECT product, brand,
                AVG(IF(seller_name = :seller1, ${NUM('unit_price')}, NULL)) AS seller1AvgPrice,
                AVG(IF(seller_name = :seller2, ${NUM('unit_price')}, NULL)) AS seller2AvgPrice
         FROM contracts WHERE seller_name IN (:seller1, :seller2) AND product IS NOT NULL AND product != ''
         GROUP BY product, brand
         HAVING seller1AvgPrice > 0 OR seller2AvgPrice > 0
         LIMIT 100`,
        { replacements: { seller1, seller2 }, type: QueryTypes.SELECT },
      ),
      sequelize.query(
        `SELECT state,
                SUM(IF(seller_name = :seller1, ${NUM('total_value')}, 0)) AS seller1Revenue,
                SUM(IF(seller_name = :seller2, ${NUM('total_value')}, 0)) AS seller2Revenue
         FROM contracts WHERE seller_name IN (:seller1, :seller2) AND state IS NOT NULL AND state != ''
         GROUP BY state ORDER BY (seller1Revenue + seller2Revenue) DESC LIMIT 15`,
        { replacements: { seller1, seller2 }, type: QueryTypes.SELECT },
      ),
      sequelize.query(
        `SELECT contract_no, seller_name, state, brand, total_value, contract_date
         FROM contracts WHERE seller_name IN (:seller1, :seller2) ORDER BY id DESC LIMIT 10`,
        { replacements: { seller1, seller2 }, type: QueryTypes.SELECT },
      ),
    ]);

    const kpiFor = (name) => {
      const row = kpiRows.find((r) => r.seller_name === name);
      const totalContracts = Number(row?.totalContracts) || 0;
      return {
        sellerName: name,
        totalContracts,
        totalRevenue: Number(row?.totalRevenue) || 0,
        avgValue: Number(row?.avgValue) || 0,
        directSupplyPct: totalContracts ? Math.round(((Number(row?.directCount) || 0) / totalContracts) * 1000) / 10 : 0,
      };
    };

    res.json({
      success: true,
      data: {
        seller1: kpiFor(seller1),
        seller2: kpiFor(seller2),
        priceComparison: priceRows.map((r) => ({
          product: r.product, brand: r.brand,
          seller1AvgPrice: Number(r.seller1AvgPrice) || 0, seller2AvgPrice: Number(r.seller2AvgPrice) || 0,
        })),
        stateComparison: stateRows.map((r) => ({
          state: r.state, seller1Revenue: Number(r.seller1Revenue) || 0, seller2Revenue: Number(r.seller2Revenue) || 0,
        })),
        recentContracts: recentRows.map((r) => ({
          contractNo: r.contract_no, sellerName: r.seller_name, state: r.state, brand: r.brand,
          totalValue: r.total_value, contractDate: r.contract_date,
        })),
      },
    });
  } catch (err) {
    console.error('compareBidders error:', err);
    res.status(500).json({ success: false, message: 'Failed to compare sellers' });
  }
};
