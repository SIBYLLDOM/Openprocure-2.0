const db = require('../config/db');
const { getUserScope, deptColumnSql } = require('../utils/userScope');

/**
 * GET /api/contracts
 * Query Params: page, limit
 * Returns paginated contracts ordered by contract date
 *
 * Contracts are all GeM-sourced, so a caller without GEM in their assigned
 * sources sees none (deptColumnSql fails closed the same way tender listings
 * do), and dept-scoped callers only see their own division's contracts.
 */
const getContracts = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = '',
            referenceNo = '',
            state = '',
            departmentType = '', // Diagno or Endo
            category = '',
            seller_name = '',
            // status = '', // Removed
            contractDateFrom = '',
            contractDateTo = '',
            valueFrom = '',
            valueTo = '',
            valueUnit = 'Lakh',
            valueOperator = '>=',
            qtyValue = '',
            qtyOperator = '>=',
            sortBy = 'contract_date',
            sortOrder = 'desc'
        } = req.query;

        const offset = (page - 1) * limit;
        const scope = await getUserScope(req.user.id);
        const deptScope = deptColumnSql(scope, 'dept', 'GEM');
        let where = `WHERE ${deptScope.sql}`;
        const params = [...deptScope.params];

        // Global Search
        if (search) {
            where += ` AND (contract_no LIKE ? OR product LIKE ? OR brand LIKE ? OR organization_name LIKE ? OR hospital_name LIKE ? OR seller_name LIKE ? OR category_name LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }

        // Reference No (contract_no or bid_no)
        if (referenceNo) {
            where += ` AND (contract_no LIKE ? OR bid_no LIKE ?)`;
            params.push(`%${referenceNo}%`, `%${referenceNo}%`);
        }

        // State Filter (hospital_state — `state` holds the buying ministry, not a geographic state)
        if (state && state !== 'All States') {
            where += ` AND UPPER(hospital_state) = UPPER(?)`;
            params.push(state);
        }

        // Department Type Filter (Diagno/Endo)
        if (departmentType && departmentType !== 'All') {
            where += ` AND dept = ?`;
            params.push(departmentType);
        }

        // Category Filter
        if (category) {
            where += ` AND category_name LIKE ?`;
            params.push(`%${category}%`);
        }

        // Contract Date Filter (contract_date is stored as 'd/m/Y H:i')
        if (contractDateFrom || contractDateTo) {
            const contractDateSQL = `STR_TO_DATE(contract_date, '%d/%m/%Y %H:%i')`;
            if (contractDateFrom && contractDateTo) {
                where += ` AND ${contractDateSQL} BETWEEN ? AND ?`;
                params.push(`${contractDateFrom} 00:00`, `${contractDateTo} 23:59`);
            } else if (contractDateFrom) {
                where += ` AND ${contractDateSQL} >= ?`;
                params.push(`${contractDateFrom} 00:00`);
            } else if (contractDateTo) {
                where += ` AND ${contractDateSQL} <= ?`;
                params.push(`${contractDateTo} 23:59`);
            }
        }

        // Seller Name Filter
        if (seller_name) {
            where += ` AND seller_name = ?`;
            params.push(seller_name);
        }

        // Quantity Filter
        if (qtyValue) {
            const operator = ['>=', '<=', '='].includes(qtyOperator) ? qtyOperator : '>=';
            where += ` AND CAST(ordered_quantity AS DECIMAL(10,2)) ${operator} ?`;
            params.push(qtyValue);
        }

        // Value Filter
        if (valueFrom || valueTo) {
            const multiplier = valueUnit === 'Crore' ? 10000000 : 100000;
            const cleanValueSQL = `CAST(REPLACE(REPLACE(total_value, ',', ''), ' ', '') AS DECIMAL(15,2))`;

            if (valueFrom && valueTo) {
                // Range
                const min = parseFloat(valueFrom) * multiplier;
                const max = parseFloat(valueTo) * multiplier;
                where += ` AND ${cleanValueSQL} BETWEEN ? AND ?`;
                params.push(min, max);
            } else if (valueFrom) {
                // Operator + From
                const val = parseFloat(valueFrom) * multiplier;
                const operator = ['>=', '<=', '='].includes(valueOperator) ? valueOperator : '>=';
                where += ` AND ${cleanValueSQL} ${operator} ?`;
                params.push(val);
            }
        }

        // Sorting
        const validSortFields = {
            'contract_date': 'contract_date',
            'total_value': `CAST(REPLACE(REPLACE(total_value, ',', ''), ' ', '') AS DECIMAL(15,2))`
        };
        const sortColumn = validSortFields[sortBy] || 'contract_date';
        const order = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        // Data Query
        const dataQuery = `
            SELECT contracts.*, 
            (CASE 
                WHEN EXISTS (SELECT 1 FROM dealers WHERE dealers.gem_seller_id = contracts.seller_id) 
                THEN 'Yes' 
                ELSE 'No' 
            END) as is_meril_db
            FROM contracts
            ${where}
            ORDER BY ${sortColumn} ${order}
            LIMIT ? OFFSET ?
        `;

        // Count + total value across every matching row (not just this page) —
        // one query, same WHERE, so the summary card always matches the filters.
        const summaryQuery = `
            SELECT
                COUNT(*) AS total,
                SUM(CAST(REPLACE(REPLACE(IFNULL(total_value,'0'), ',', ''), ' ', '') AS DECIMAL(15,2))) AS total_value
            FROM contracts ${where}
        `;

        const [rows] = await db.query(dataQuery, [...params, +limit, +offset]);
        const [[summary]] = await db.query(summaryQuery, params);

        res.json({
            success: true,
            page: +page,
            limit: +limit,
            total: summary.total,
            totalValue: summary.total_value || 0,
            totalPages: Math.ceil(summary.total / limit),
            data: rows
        });
    } catch (err) {
        console.error('Error fetching contracts:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch contracts' });
    }
};

/**
 * GET /api/contracts/meta/categories
 * Distinct category_name values, for filter dropdowns
 */
const getContractCategories = async (req, res) => {
    try {
        const { departmentType = '' } = req.query;
        const scope = await getUserScope(req.user.id);
        const deptScope = deptColumnSql(scope, 'dept', 'GEM');
        let where = `WHERE category_name IS NOT NULL AND category_name <> '' AND ${deptScope.sql}`;
        const params = [...deptScope.params];

        if (departmentType && departmentType !== 'All') {
            where += ` AND dept = ?`;
            params.push(departmentType);
        }

        const [rows] = await db.query(
            `SELECT DISTINCT category_name FROM contracts ${where} ORDER BY category_name ASC`,
            params
        );
        res.json({ success: true, data: rows.map(r => r.category_name) });
    } catch (err) {
        console.error('Error fetching contract categories:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch categories' });
    }
};

/**
 * GET /api/contracts/:id
 * Get single contract by ID
 */
const getContractById = async (req, res) => {
    try {
        const { id } = req.params;

        const query = `SELECT * FROM contracts WHERE id = ?`;
        const [rows] = await db.query(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Contract not found' });
        }

        res.json({
            success: true,
            data: rows[0]
        });
    } catch (err) {
        console.error('Error fetching contract:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch contract' });
    }
};

/**
 * POST /api/contracts
 * Create new contract
 */
const createContract = async (req, res) => {
    try {
        const {
            serial_no,
            category_name,
            bid_no,
            product,
            brand,
            model,
            ordered_quantity,
            price,
            total_value,
            buyer_dept_org,
            organization_name,
            buyer_designation,
            state,
            buyer_department,
            office_zone,
            buying_mode,
            contract_date,
            order_status,
            download_link
        } = req.body;

        const query = `
      INSERT INTO contracts (
        serial_no, category_name, bid_no, product, brand, model,
        ordered_quantity, price, total_value, buyer_dept_org,
        organization_name, buyer_designation, state, buyer_department,
        office_zone, buying_mode, contract_date, order_status, download_link
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

        const [result] = await db.query(query, [
            serial_no, category_name, bid_no, product, brand, model,
            ordered_quantity, price, total_value, buyer_dept_org,
            organization_name, buyer_designation, state, buyer_department,
            office_zone, buying_mode, contract_date, order_status, download_link
        ]);

        res.status(201).json({
            success: true,
            message: 'Contract created successfully',
            data: { id: result.insertId }
        });
    } catch (err) {
        console.error('Error creating contract:', err);
        res.status(500).json({ success: false, message: 'Failed to create contract' });
    }
};

/**
 * PUT /api/contracts/:id
 * Update contract
 */
const updateContract = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Build dynamic UPDATE query
        const fields = Object.keys(updates).filter(key => key !== 'id');
        if (fields.length === 0) {
            return res.status(400).json({ success: false, message: 'No fields to update' });
        }

        const setClause = fields.map(field => `${field} = ?`).join(', ');
        const values = fields.map(field => updates[field]);

        const query = `UPDATE contracts SET ${setClause} WHERE id = ?`;
        const [result] = await db.query(query, [...values, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Contract not found' });
        }

        res.json({
            success: true,
            message: 'Contract updated successfully'
        });
    } catch (err) {
        console.error('Error updating contract:', err);
        res.status(500).json({ success: false, message: 'Failed to update contract' });
    }
};

/**
 * DELETE /api/contracts/:id
 * Delete contract
 */
const deleteContract = async (req, res) => {
    try {
        const { id } = req.params;

        const query = `DELETE FROM contracts WHERE id = ?`;
        const [result] = await db.query(query, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Contract not found' });
        }

        res.json({
            success: true,
            message: 'Contract deleted successfully'
        });
    } catch (err) {
        console.error('Error deleting contract:', err);
        res.status(500).json({ success: false, message: 'Failed to delete contract' });
    }
};

module.exports = {
    getContracts,
    getContractById,
    getContractCategories,
    createContract,
    updateContract,
    deleteContract,
    getDealers,
    getDealerSuggestions
};

/**
 * GET /api/contracts/dealers/suggestions?q=medi
 * Returns distinct seller_names matching the query (for autocomplete)
 * Source: contracts WHERE meril_db = 'YES'
 */
async function getDealerSuggestions(req, res) {
    try {
        const { q = '' } = req.query;
        if (!q || q.trim().length < 2) return res.json({ success: true, data: [] });

        const [rows] = await db.query(
            `SELECT DISTINCT seller_name
             FROM contracts
             WHERE meril_db = 'YES'
               AND seller_name LIKE ?
             ORDER BY seller_name
             LIMIT 15`,
            [`%${q.trim()}%`]
        );
        res.json({ success: true, data: rows.map(r => r.seller_name) });
    } catch (err) {
        console.error('getDealerSuggestions error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch suggestions' });
    }
}

/**
 * GET /api/contracts/dealers
 * Returns aggregated dealer rows from contracts WHERE meril_db = 'YES'
 * Each row = one unique seller_name with contract count, total value, etc.
 *
 * Query params:
 *   page, limit, sortBy (seller_name|contract_count|total_value), sortOrder (asc|desc)
 *   sellerName, state, dept, category, dateFrom, dateTo
 */
async function getDealers(req, res) {
    try {
        const {
            page = 1,
            limit = 25,
            sortBy = 'contract_count',
            sortOrder = 'desc',
            sellerName = '',
            state = '',
            dept = '',
            category = '',
            dateFrom = '',
            dateTo = '',
        } = req.query;

        const offset = (page - 1) * limit;

        // Whitelist sort columns to prevent SQL injection
        const validSortCols = {
            seller_name: 'seller_name',
            contract_count: 'contract_count',
            total_value: 'total_value_raw',
        };
        const sortCol = validSortCols[sortBy] || 'contract_count';
        const order = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        const scope = await getUserScope(req.user.id);
        const deptScope = deptColumnSql(scope, 'c.dept', 'GEM');
        let where = `WHERE c.meril_db = 'YES' AND ${deptScope.sql}`;
        const params = [...deptScope.params];

        if (sellerName) {
            where += ` AND c.seller_name LIKE ?`;
            params.push(`%${sellerName}%`);
        }
        if (state && state !== 'All States') {
            where += ` AND UPPER(c.seller_state) = UPPER(?)`;
            params.push(state);
        }
        if (dept && dept !== 'All') {
            where += ` AND c.dept = ?`;
            params.push(dept);
        }
        if (category) {
            where += ` AND c.category_name LIKE ?`;
            params.push(`%${category}%`);
        }
        if (dateFrom) {
            where += ` AND STR_TO_DATE(c.contract_date, '%d/%m/%Y %H:%i') >= ?`;
            params.push(`${dateFrom} 00:00`);
        }
        if (dateTo) {
            where += ` AND STR_TO_DATE(c.contract_date, '%d/%m/%Y %H:%i') <= ?`;
            params.push(`${dateTo} 23:59`);
        }

        const dataQuery = `
            SELECT
                c.seller_name,
                MAX(c.seller_state)       AS seller_state,
                MAX(c.seller_location)    AS seller_location,
                MAX(c.seller_contact_no)  AS seller_contact_no,
                MAX(c.seller_email)       AS seller_email,
                MAX(c.dept)               AS dept,
                COUNT(*)                  AS contract_count,
                SUM(CAST(REPLACE(REPLACE(IFNULL(c.total_value,'0'),',',''),' ','') AS DECIMAL(15,2))) AS total_value_raw
            FROM contracts c
            ${where}
            GROUP BY c.seller_name
            ORDER BY ${sortCol} ${order}
            LIMIT ? OFFSET ?
        `;

        const countQuery = `
            SELECT COUNT(DISTINCT seller_name) AS total
            FROM contracts c
            ${where}
        `;

        const [rows] = await db.query(dataQuery, [...params, +limit, +offset]);
        const [[countRow]] = await db.query(countQuery, params);

        res.json({
            success: true,
            page: +page,
            limit: +limit,
            total: countRow.total,
            totalPages: Math.ceil(countRow.total / limit),
            data: rows.map(r => ({
                seller_name: r.seller_name,
                seller_state: r.seller_state,
                seller_location: r.seller_location,
                seller_contact_no: r.seller_contact_no,
                seller_email: r.seller_email,
                dept: r.dept,
                contract_count: r.contract_count,
                total_value: r.total_value_raw,
            })),
        });
    } catch (err) {
        console.error('getDealers error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch dealers' });
    }
}

