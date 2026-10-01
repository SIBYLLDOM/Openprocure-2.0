const path = require('path');
const db = require('./src/config/db');

// Read categories directly from JSON files — single source of truth
const diagnoRaw = require(path.join(__dirname, '../scrapper/diagno_cat.json'));
const endoRaw   = require(path.join(__dirname, '../scrapper/endo_cat.json'));

function dedupe(raw) {
  const seen = new Set();
  const out = [];
  for (const row of raw) {
    const key = (row.item_category || '').trim().toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(row.item_category.trim());
    }
  }
  return out;
}

const SOURCES = [
  { dept: 'diagnostic', categories: dedupe(diagnoRaw) },
  { dept: 'endo',       categories: dedupe(endoRaw) },
];

async function run() {
  try {
    console.log('Creating product_categories table if not exists...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS product_categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        dept VARCHAR(100) NOT NULL,
        keywords TEXT NOT NULL,
        category ENUM('Perfect', 'Open') NOT NULL DEFAULT 'Perfect',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_dept (dept),
        INDEX idx_category (category)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('Table ready.');

    for (const { dept, categories } of SOURCES) {
      const [[{ existing }]] = await db.query(
        'SELECT COUNT(*) AS existing FROM product_categories WHERE dept = ?', [dept]
      );
      if (existing > 0) {
        await db.query('DELETE FROM product_categories WHERE dept = ?', [dept]);
        console.log(`[${dept}] Removed ${existing} old entries.`);
      }

      const rows = categories.map(kw => [dept, kw, 'Perfect']);
      await db.query('INSERT INTO product_categories (dept, keywords, category) VALUES ?', [rows]);
      console.log(`[${dept}] Inserted ${rows.length} categories.`);
    }

    console.log('Done.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

run();
