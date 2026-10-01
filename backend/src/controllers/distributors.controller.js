const db = require('../config/db');

const ROW = `id, company_name AS companyName, person_name AS personName, contact_no AS contactNo,
  email, city_name AS cityName, state, registration_date AS registrationDate, status`;

// GET /api/distributors
const getDistributors = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT ${ROW} FROM distributors ORDER BY company_name ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('getDistributors:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch distributors' });
  }
};

// POST /api/distributors
const createDistributor = async (req, res) => {
  try {
    const { companyName, personName, contactNo, email, cityName, state, registrationDate, status } = req.body;
    if (!companyName || !personName || !contactNo || !email || !cityName || !state || !registrationDate) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    const [result] = await db.query(
      `INSERT INTO distributors (company_name, person_name, contact_no, email, city_name, state, registration_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [companyName, personName, contactNo, email, cityName, state, registrationDate, status || 'Active']
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    console.error('createDistributor:', err);
    res.status(500).json({ success: false, message: 'Failed to create distributor' });
  }
};

// PUT /api/distributors/:id
const updateDistributor = async (req, res) => {
  try {
    const { id } = req.params;
    const { companyName, personName, contactNo, email, cityName, state, registrationDate, status } = req.body;
    const fields = [];
    const params = [];
    if (companyName)      { fields.push('company_name = ?');      params.push(companyName); }
    if (personName)       { fields.push('person_name = ?');       params.push(personName); }
    if (contactNo)        { fields.push('contact_no = ?');        params.push(contactNo); }
    if (email)            { fields.push('email = ?');             params.push(email); }
    if (cityName)         { fields.push('city_name = ?');         params.push(cityName); }
    if (state)            { fields.push('state = ?');             params.push(state); }
    if (registrationDate) { fields.push('registration_date = ?'); params.push(registrationDate); }
    if (status)           { fields.push('status = ?');            params.push(status); }
    if (!fields.length) return res.status(400).json({ success: false, message: 'Nothing to update' });
    params.push(id);
    await db.query(`UPDATE distributors SET ${fields.join(', ')} WHERE id = ?`, params);
    res.json({ success: true });
  } catch (err) {
    console.error('updateDistributor:', err);
    res.status(500).json({ success: false, message: 'Failed to update distributor' });
  }
};

// POST /api/distributors/import
const importDistributors = async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || !rows.length) {
      return res.status(400).json({ success: false, message: 'No rows to import' });
    }

    const today = new Date().toISOString().slice(0, 10);
    const values = [];
    let skipped = 0;

    for (const r of rows) {
      const companyName = (r.companyName || '').trim();
      const personName = (r.personName || '').trim();
      const contactNo = (r.contactNo || '').trim();
      const email = (r.email || '').trim();
      const cityName = (r.cityName || '').trim();
      if (!companyName || !personName || !contactNo || !email || !cityName) {
        skipped++;
        continue;
      }
      values.push([
        companyName, personName, contactNo, email, cityName,
        (r.state || '').trim(),
        r.registrationDate || today,
        r.status === 'Inactive' ? 'Inactive' : 'Active'
      ]);
    }

    if (!values.length) {
      return res.status(400).json({ success: false, message: 'No valid rows to import', skipped });
    }

    const [result] = await db.query(
      `INSERT INTO distributors (company_name, person_name, contact_no, email, city_name, state, registration_date, status)
       VALUES ?`,
      [values]
    );

    res.json({ success: true, imported: result.affectedRows, skipped });
  } catch (err) {
    console.error('importDistributors:', err);
    res.status(500).json({ success: false, message: 'Failed to import distributors' });
  }
};

// DELETE /api/distributors/:id
const deleteDistributor = async (req, res) => {
  try {
    await db.query('DELETE FROM distributors WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('deleteDistributor:', err);
    res.status(500).json({ success: false, message: 'Failed to delete distributor' });
  }
};

module.exports = { getDistributors, createDistributor, importDistributors, updateDistributor, deleteDistributor };
