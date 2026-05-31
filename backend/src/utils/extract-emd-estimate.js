const fs = require("fs");
const mysql = require("mysql2/promise");
require("dotenv").config();

// DB CONNECTION (FROM .env)
(async () => {
  const db = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  // FETCH RECORDS THAT NEED EXTRACTION
  const [rows] = await db.query(`
    SELECT id, bid_number, json_path
    FROM gem_tender_docs
    WHERE json_path IS NOT NULL
      AND (emd_amount IS NULL OR estimated_value IS NULL)
  `);

  console.log(`🔍 Found ${rows.length} records to process`);

  for (const rec of rows) {
    try {
      if (!fs.existsSync(rec.json_path)) {
        console.warn(`❌ File not found: ${rec.json_path}`);
        continue;
      }

      const raw = fs.readFileSync(rec.json_path, "utf8");
      const json = JSON.parse(raw);

      let emdAmount = null;
      let estimatedValue = null;

      const pages = Array.isArray(json.pages) ? json.pages : [];

      for (const page of pages) {
        for (const table of page.tables || []) {
          for (const row of table) {
            if (!Array.isArray(row)) continue;

            const [key, value] = row;
            if (!key || !value) continue;

            const k = String(key).toLowerCase();
            const v = String(value);

            // 🔹 EMD AMOUNT
            if (!emdAmount && k.includes("emd") && k.includes("amount")) {
              const num = v.replace(/[^\d]/g, "");
              if (num) emdAmount = Number(num);
            }

            // 🔹 ESTIMATED BID VALUE
            if (
              !estimatedValue &&
              (k.includes("estimated bid value") || k.includes("estimated value"))
            ) {
              const num = v.replace(/[^\d]/g, "");
              if (num) estimatedValue = Number(num);
            }

            if (emdAmount && estimatedValue) break;
          }
        }
        if (emdAmount && estimatedValue) break;
      }

      await db.query(
        `
        UPDATE gem_tender_docs
        SET emd_amount = ?, estimated_value = ?
        WHERE id = ?
        `,
        [emdAmount, estimatedValue, rec.id]
      );

      console.log(
        `✅ ${rec.bid_number} | EMD: ${emdAmount ?? "N/A"} | EST: ${estimatedValue ?? "N/A"}`
      );

    } catch (err) {
      console.error(`❌ Error processing ${rec.bid_number}:`, err.message);
    }
  }

  console.log("🎉 Extraction completed");
  process.exit(0);
})();
