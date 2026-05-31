const db = require('../config/db');

/**
 * GET /api/contracts
 * Query Params: page, limit
 * Returns paginated contracts ordered by contract date
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
            department = '',
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
        let where = `WHERE 1=1`;
        const params = [];

        // Global Search
        if (search) {
            where += ` AND (bid_no LIKE ? OR product LIKE ? OR brand LIKE ? OR organization_name LIKE ? OR serial_no LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }

        // Reference No (bid_no or serial_no)
        if (referenceNo) {
            where += ` AND (bid_no LIKE ? OR serial_no LIKE ?)`;
            params.push(`%${referenceNo}%`, `%${referenceNo}%`);
        }

        // State Filter
        if (state && state !== 'All States') {
            where += ` AND state = ?`;
            params.push(state);
        }

        // Department Type Filter (Diagno/Endo)
        if (departmentType && departmentType !== 'All') {
            where += ` AND dept = ?`;
            params.push(departmentType);
        }

        // Department Filter
        if (department) {
            where += ` AND buyer_department LIKE ?`;
            params.push(`%${department}%`);
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

        // Count Query
        const countQuery = `SELECT COUNT(*) as total FROM contracts ${where}`;

        const [rows] = await db.query(dataQuery, [...params, +limit, +offset]);
        const [[count]] = await db.query(countQuery, params);

        res.json({
            success: true,
            page: +page,
            limit: +limit,
            total: count.total,
            totalPages: Math.ceil(count.total / limit),
            data: rows
        });
    } catch (err) {
        console.error('Error fetching contracts:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch contracts' });
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
    createContract,
    updateContract,
    deleteContract
};
