const db = require('../config/db');

// GET /api/product-categories
const getCategories = async (req, res) => {
  try {
    const { dept, category, search, page = 1, limit = 100 } = req.query;
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];

    if (dept)     { conditions.push('dept = ?');           params.push(dept); }
    if (category) { conditions.push('category = ?');       params.push(category); }
    if (search)   { conditions.push('keywords LIKE ?');    params.push(`%${search}%`); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [rows] = await db.query(
      `SELECT id, dept, keywords, category, created_at, updated_at
       FROM product_categories ${where}
       ORDER BY dept, category, keywords
       LIMIT ? OFFSET ?`,
      [...params, +limit, +offset]
    );
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM product_categories ${where}`, params
    );

    res.json({ success: true, data: rows, total, page: +page, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('getCategories:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch categories' });
  }
};

// POST /api/product-categories
const createCategory = async (req, res) => {
  try {
    const { dept, keywords, category } = req.body;
    if (!dept || !keywords || !category) {
      return res.status(400).json({ success: false, message: 'dept, keywords and category are required' });
    }
    if (!['Perfect', 'Open'].includes(category)) {
      return res.status(400).json({ success: false, message: 'category must be Perfect or Open' });
    }
    const [result] = await db.query(
      'INSERT INTO product_categories (dept, keywords, category) VALUES (?, ?, ?)',
      [dept.trim(), keywords.trim(), category]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    console.error('createCategory:', err);
    res.status(500).json({ success: false, message: 'Failed to create category' });
  }
};

// PUT /api/product-categories/:id
const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { dept, keywords, category } = req.body;
    if (category && !['Perfect', 'Open'].includes(category)) {
      return res.status(400).json({ success: false, message: 'category must be Perfect or Open' });
    }
    const fields = [];
    const params = [];
    if (dept)     { fields.push('dept = ?');     params.push(dept.trim()); }
    if (keywords) { fields.push('keywords = ?'); params.push(keywords.trim()); }
    if (category) { fields.push('category = ?'); params.push(category); }
    if (!fields.length) return res.status(400).json({ success: false, message: 'Nothing to update' });
    params.push(id);
    await db.query(`UPDATE product_categories SET ${fields.join(', ')} WHERE id = ?`, params);
    res.json({ success: true });
  } catch (err) {
    console.error('updateCategory:', err);
    res.status(500).json({ success: false, message: 'Failed to update category' });
  }
};

// DELETE /api/product-categories/:id
const deleteCategory = async (req, res) => {
  try {
    await db.query('DELETE FROM product_categories WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('deleteCategory:', err);
    res.status(500).json({ success: false, message: 'Failed to delete category' });
  }
};

module.exports = { getCategories, createCategory, updateCategory, deleteCategory };
