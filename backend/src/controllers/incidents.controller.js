const db = require('../config/db');

/**
 * GET /api/incidents
 * Query Params:
 * page, limit, search, status, severity, incident_type
 */
const getIncidents = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = '',
            status = '',
            severity = '',
            incident_type = '',
            division = '',
            sortBy = 'incident_date',
            sortOrder = 'desc'
        } = req.query;

        const offset = (page - 1) * limit;

        let where = `WHERE 1=1`;
        const params = [];

        // Search filter (incident_id, raised_against, organisation_name)
        if (search) {
            where += ` AND (incident_id LIKE ? OR raised_against LIKE ? OR organisation_name LIKE ? OR incident_for LIKE ? OR seller_organisation_name LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }

        // Status filter
        if (status && status !== 'All') {
            where += ` AND status = ?`;
            params.push(status);
        }

        // Severity filter
        if (severity && severity !== 'All') {
            where += ` AND severity = ?`;
            params.push(severity);
        }

        // Incident Type filter
        if (incident_type && incident_type !== 'All') {
            where += ` AND incident_type = ?`;
            params.push(incident_type);
        }

        // Division filter (Diagno vs Endo) - using 'dept' column
        if (division) {
            if (division === 'Diagno') {
                where += ` AND dept = 'diagno'`;
            } else if (division === 'Endo') {
                where += ` AND dept = 'endo'`;
            }
        }

        // Build ORDER BY clause
        const validSortFields = ['incident_date', 'escalated_date', 'created_at', 'status', 'severity'];
        const sortField = validSortFields.includes(sortBy) ? sortBy : 'incident_date';
        const order = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        const dataQuery = `
      SELECT *
      FROM incidents
      ${where}
      ORDER BY ${sortField} ${order}
      LIMIT ? OFFSET ?
    `;

        const countQuery = `
      SELECT COUNT(*) as total
      FROM incidents
      ${where}
    `;

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
        console.error('Error fetching incidents:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch incidents' });
    }
};

/**
 * GET /api/incidents/:id
 * Get single incident by ID
 */
const getIncidentById = async (req, res) => {
    try {
        const { id } = req.params;

        const query = `SELECT * FROM incidents WHERE id = ?`;
        const [rows] = await db.query(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Incident not found' });
        }

        res.json({
            success: true,
            data: rows[0]
        });
    } catch (err) {
        console.error('Error fetching incident:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch incident' });
    }
};

/**
 * POST /api/incidents
 * Create new incident
 */
const createIncident = async (req, res) => {
    try {
        const {
            type, incident_type, incident_id, severity, reason,
            product_category, status, escalated_date, incident_date,
            raised_against, organisation_name, seller_organisation_name,
            product_id, incident_for, scn_sent_date, scn_end_date,
            last_modified_role, last_modified_date, maker_role
        } = req.body;

        const query = `
      INSERT INTO incidents (
        type, incident_type, incident_id, severity, reason,
        product_category, status, escalated_date, incident_date,
        raised_against, organisation_name, seller_organisation_name,
        product_id, incident_for, scn_sent_date, scn_end_date,
        last_modified_role, last_modified_date, maker_role
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

        const [result] = await db.query(query, [
            type, incident_type, incident_id, severity, reason,
            product_category, status, escalated_date, incident_date,
            raised_against, organisation_name, seller_organisation_name,
            product_id, incident_for, scn_sent_date, scn_end_date,
            last_modified_role, last_modified_date, maker_role
        ]);

        res.status(201).json({
            success: true,
            message: 'Incident created successfully',
            data: { id: result.insertId }
        });
    } catch (err) {
        console.error('Error creating incident:', err);
        res.status(500).json({ success: false, message: 'Failed to create incident' });
    }
};

/**
 * PUT /api/incidents/:id
 * Update incident
 */
const updateIncident = async (req, res) => {
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

        const query = `UPDATE incidents SET ${setClause} WHERE id = ?`;
        const [result] = await db.query(query, [...values, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Incident not found' });
        }

        res.json({
            success: true,
            message: 'Incident updated successfully'
        });
    } catch (err) {
        console.error('Error updating incident:', err);
        res.status(500).json({ success: false, message: 'Failed to update incident' });
    }
};

/**
 * DELETE /api/incidents/:id
 * Delete incident
 */
const deleteIncident = async (req, res) => {
    try {
        const { id } = req.params;

        const query = `DELETE FROM incidents WHERE id = ?`;
        const [result] = await db.query(query, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Incident not found' });
        }

        res.json({
            success: true,
            message: 'Incident deleted successfully'
        });
    } catch (err) {
        console.error('Error deleting incident:', err);
        res.status(500).json({ success: false, message: 'Failed to delete incident' });
    }
};

module.exports = {
    getIncidents,
    getIncidentById,
    createIncident,
    updateIncident,
    deleteIncident
};
