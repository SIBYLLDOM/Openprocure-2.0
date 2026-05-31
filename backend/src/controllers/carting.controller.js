const db = require('../config/db');

// Helper to get filter clauses
const getFilterClauses = (buyingMode, department, month, year, seller, state, category) => {
    let clause = '';

    // Buying Mode
    if (buyingMode) {
        if (buyingMode.toLowerCase() === 'bid') clause += ` AND c.buying_mode LIKE '%Bid%'`;
        if (buyingMode.toLowerCase() === 'direct') clause += ` AND c.buying_mode = 'Direct'`;
    }

    // Department
    if (department) {
        if (department.toLowerCase() === 'endo') clause += ` AND c.dept = 'endo'`;
        if (department.toLowerCase() === 'diagno') clause += ` AND c.dept = 'diagno'`;
    }

    // Month
    if (month) {
        clause += ` AND MONTH(STR_TO_DATE(c.contract_date, '%d/%m/%Y')) = ${month}`;
    }

    // Year
    if (year) {
        clause += ` AND YEAR(STR_TO_DATE(c.contract_date, '%d/%m/%Y')) = ${year}`;
    }

    // Seller
    if (seller) {
        clause += ` AND c.seller_name = '${seller}'`;
    }

    // State
    if (state) {
        clause += ` AND c.state = '${state}'`;
    }

    // Category
    if (category) {
        clause += ` AND c.category_name = '${category}'`;
    }

    console.log('Filters:', { buyingMode, department, month, year, seller, state, category, clause });
    return clause;
};

/**
 * GET /api/carting/kpi
 * Get Total, Meril, and Others carting values
 */
const getCartingKPIs = async (req, res) => {
    try {
        const { buyingMode, department, month, year, seller, state, category } = req.query;
        const filterClause = getFilterClauses(buyingMode, department, month, year, seller, state, category);

        console.log('Fetching carting KPIs...');

        console.time('CartingQuery');
        // Optimized query with LEFT JOIN and Direct CAST
        const totalQuery = `SELECT SUM(CAST(total_value AS DECIMAL(15,2))) as val FROM contracts c WHERE 1=1 ${filterClause}`;
        const [[totalRow]] = await db.query(totalQuery);
        const total = parseFloat(totalRow.val || 0);

        const merilQuery = `
            SELECT SUM(CAST(c.total_value AS DECIMAL(15,2))) as val 
            FROM contracts c 
            INNER JOIN (SELECT DISTINCT gem_seller_id FROM dealers) d ON c.seller_id = d.gem_seller_id
            WHERE 1=1 ${filterClause}
        `;
        const [[merilRow]] = await db.query(merilQuery);
        const meril = parseFloat(merilRow.val || 0);

        const others = total - meril;

        console.timeEnd('CartingQuery');
        console.log('Carting KPI Result:', { total, meril, others });

        res.json({
            success: true,
            data: {
                total,
                meril,
                others
            }
        });
    } catch (err) {
        console.error('Error fetching carting KPIs:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch carting KPIs' });
    }
};

/**
 * GET /api/carting/pivot
 * Get Pivot Table data (grouped by State and Month)
 */
const getPivotCarting = async (req, res) => {
    try {
        const { buyingMode, department, month, year, seller, state, category } = req.query;
        const filterClause = getFilterClauses(buyingMode, department, month, year, seller, state, category);

        console.log('Fetching pivot carting data...');

        const query = `
            SELECT 
                c.state,
                DATE_FORMAT(STR_TO_DATE(c.contract_date, '%d/%m/%Y'), '%b') as month,
                SUM(CAST(c.total_value AS DECIMAL(15,2))) as total,
                SUM(CASE WHEN d.gem_seller_id IS NOT NULL THEN CAST(c.total_value AS DECIMAL(15,2)) ELSE 0 END) as meril
            FROM contracts c
            LEFT JOIN (SELECT DISTINCT gem_seller_id FROM dealers) d ON c.seller_id = d.gem_seller_id
            WHERE c.contract_date IS NOT NULL AND c.state IS NOT NULL ${filterClause}
            GROUP BY c.state, DATE_FORMAT(STR_TO_DATE(c.contract_date, '%d/%m/%Y'), '%b'), MONTH(STR_TO_DATE(c.contract_date, '%d/%m/%Y'))
            ORDER BY c.state, MONTH(STR_TO_DATE(c.contract_date, '%d/%m/%Y')) DESC
        `;

        console.time('PivotQuery');
        const [rows] = await db.query(query);
        console.timeEnd('PivotQuery');

        // Transform numeric values and calculate others
        const data = rows.map((row, index) => {
            const total = parseFloat(row.total || 0);
            const meril = parseFloat(row.meril || 0);
            const others = total - meril;
            return {
                id: index + 1,
                state: row.state,
                month: row.month || 'N/A',
                total: total,
                meril: meril,
                others: others
            };
        });

        res.json({
            success: true,
            data: data
        });
    } catch (err) {
        console.error('Error fetching pivot data:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch pivot data' });
    }
};

/**
 * GET /api/carting/map
 * Get Map Data (grouped by State)
 */
const getMapCarting = async (req, res) => {
    try {
        const { buyingMode, department, month, year, seller, state, category } = req.query;
        const filterClause = getFilterClauses(buyingMode, department, month, year, seller, state, category);

        console.log('Fetching map carting data...');

        const query = `
            SELECT 
                c.state,
                SUM(CAST(c.total_value AS DECIMAL(15,2))) as total,
                SUM(CASE WHEN d.gem_seller_id IS NOT NULL THEN CAST(c.total_value AS DECIMAL(15,2)) ELSE 0 END) as meril
            FROM contracts c
            LEFT JOIN (SELECT DISTINCT gem_seller_id FROM dealers) d ON c.seller_id = d.gem_seller_id
            WHERE c.state IS NOT NULL ${filterClause}
            GROUP BY c.state
        `;

        const [rows] = await db.query(query);

        // Transform numeric values and calculate others
        const data = rows.map(row => {
            const total = parseFloat(row.total || 0);
            const meril = parseFloat(row.meril || 0);
            const others = total - meril;
            return {
                name: row.state, // State name from DB
                total: total,
                meril: meril,
                others: others
            };
        });

        res.json({
            success: true,
            data: data
        });
    } catch (err) {
        console.error('Error fetching map data:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch map data' });
    }
};

/**
 * GET /api/carting/sellers
 * Get Distinct Seller Names for Filter
 */
const getCartingSellers = async (req, res) => {
    try {
        console.log('Fetching carting sellers...');
        const [rows] = await db.query('SELECT DISTINCT seller_name FROM contracts WHERE seller_name IS NOT NULL ORDER BY seller_name');

        const sellers = rows.map(r => ({ value: r.seller_name, label: r.seller_name }));

        res.json({
            success: true,
            data: sellers
        });
    } catch (err) {
        console.error('Error fetching sellers:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch sellers' });
    }
};

/**
 * GET /api/carting/states
 * Get Distinct States for Filter
 */
const getCartingStates = async (req, res) => {
    try {
        console.log('Fetching carting states...');
        const [rows] = await db.query('SELECT DISTINCT state FROM contracts WHERE state IS NOT NULL ORDER BY state');

        const states = rows.map(r => ({ value: r.state, label: r.state }));

        res.json({
            success: true,
            data: states
        });
    } catch (err) {
        console.error('Error fetching states:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch states' });
    }
};

/**
 * GET /api/carting/categories
 * Get Distinct Categories for Filter
 */
const getCartingCategories = async (req, res) => {
    try {
        const { department } = req.query;
        console.log('Fetching carting categories...', { department });

        let query = 'SELECT DISTINCT category_name FROM contracts WHERE category_name IS NOT NULL';
        const params = [];

        if (department) {
            query += ' AND dept = ?';
            params.push(department);
        }

        query += ' ORDER BY category_name';

        const [rows] = await db.query(query, params);

        const categories = rows.map(r => ({ value: r.category_name, label: r.category_name }));

        res.json({
            success: true,
            data: categories
        });
    } catch (err) {
        console.error('Error fetching categories:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch categories' });
    }
};

module.exports = {
    getCartingKPIs,
    getPivotCarting,
    getMapCarting,
    getCartingSellers,
    getCartingStates,
    getCartingCategories
};
