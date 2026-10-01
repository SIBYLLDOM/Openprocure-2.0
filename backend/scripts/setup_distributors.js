// One-off script: creates the `distributors` table and seeds dummy rows if empty.
// Run with: node backend/scripts/setup_distributors.js
require('dotenv').config();
const db = require('../src/config/db');

const DUMMY_ROWS = [
  ['MedSupply India Pvt Ltd', 'Rajesh Kumar', '+91-9876543210', 'rajesh@medsupply.in', 'Mumbai', 'Maharashtra', '2023-01-15', 'Active'],
  ['HealthCare Distributors', 'Priya Sharma', '+91-9876543211', 'priya@healthcare.in', 'Delhi', 'Delhi', '2023-02-20', 'Active'],
  ['Global Medical Solutions', 'Amit Patel', '+91-9876543212', 'amit@globalmeds.in', 'Ahmedabad', 'Gujarat', '2023-03-10', 'Inactive'],
  ['Sunrise Pharma Traders', 'Sunita Reddy', '+91-9876543213', 'sunita@sunrise.in', 'Hyderabad', 'Telangana', '2023-04-05', 'Active'],
  ['Metro Medical Supplies', 'Vikram Singh', '+91-9876543214', 'vikram@metro.in', 'Bangalore', 'Karnataka', '2023-05-18', 'Active'],
  ['Eastern Healthcare Ltd', 'Ananya Das', '+91-9876543215', 'ananya@eastern.in', 'Kolkata', 'West Bengal', '2023-06-22', 'Active'],
  ['Southern Medical Corp', 'Karthik Iyer', '+91-9876543216', 'karthik@southern.in', 'Chennai', 'Tamil Nadu', '2023-07-11', 'Active'],
  ['Northern Distributors', 'Manpreet Kaur', '+91-9876543217', 'manpreet@northern.in', 'Chandigarh', 'Punjab', '2023-08-30', 'Inactive'],
  ['Coastal Medical Trading', 'Arjun Nair', '+91-9876543218', 'arjun@coastal.in', 'Kochi', 'Kerala', '2023-09-14', 'Active'],
  ['Central Healthcare Hub', 'Neha Gupta', '+91-9876543219', 'neha@central.in', 'Indore', 'Madhya Pradesh', '2023-10-07', 'Active'],
  ['Western Medical Enterprises', 'Rohan Desai', '+91-9876543220', 'rohan@western.in', 'Pune', 'Maharashtra', '2023-11-19', 'Active'],
  ['Prime Healthcare Solutions', 'Kavita Joshi', '+91-9876543221', 'kavita@prime.in', 'Jaipur', 'Rajasthan', '2023-12-03', 'Active'],
];

(async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS distributors (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_name VARCHAR(255) NOT NULL,
        person_name VARCHAR(255) NOT NULL,
        contact_no VARCHAR(50) NOT NULL,
        email VARCHAR(255) NOT NULL,
        city_name VARCHAR(100) NOT NULL,
        state VARCHAR(100) NOT NULL,
        registration_date DATE NOT NULL,
        status ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('distributors table ready');

    const [[{ count }]] = await db.query('SELECT COUNT(*) AS count FROM distributors');
    if (count === 0) {
      await db.query(
        `INSERT INTO distributors
         (company_name, person_name, contact_no, email, city_name, state, registration_date, status)
         VALUES ?`,
        [DUMMY_ROWS]
      );
      console.log(`Seeded ${DUMMY_ROWS.length} dummy distributors`);
    } else {
      console.log(`Table already has ${count} rows, skipping seed`);
    }
  } catch (err) {
    console.error('setup_distributors failed:', err);
  } finally {
    process.exit(0);
  }
})();
