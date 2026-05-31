import mysql from "mysql2/promise";

// 🔹 DB connection
const db = await mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "tender_automation_with_ai"
});

// 🔹 Keyword arrays
const endoKeywords = [
  "endoscope",
  "laparoscop",
  "robotic surg",
  "stapler"
];

const diagnoKeywords = [
  "pcr machine",
  "elisa test",
  "hba1c",
  "diagnostic kit"
];

// 🔹 Prepare bulk insert data
const values = [
  ...endoKeywords.map(k => [k.toLowerCase(), "endo"]),
  ...diagnoKeywords.map(k => [k.toLowerCase(), "diagno"])
];

// 🔹 Insert query (ignore duplicates safely)
const sql = `
  INSERT IGNORE INTO keyword_category (keyword, category)
  VALUES ?
`;

await db.query(sql, [values]);

console.log("✅ Keywords inserted successfully");

await db.end();
