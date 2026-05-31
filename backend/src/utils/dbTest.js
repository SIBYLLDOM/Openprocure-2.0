// src/utils/dbTest.js
const db = require('../config/db');

async function testQuery() {
  const [rows] = await db.execute('SELECT 1 + 1 AS result');
  console.log(rows);
}

testQuery();
