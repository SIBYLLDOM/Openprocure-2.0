const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const db = require("../config/db");

// Path to Python script
const SCRAPER_Script = "d:\\Tender System\\ERP\\UtilApplications\\MITE-SCRAPPER-SYSTEM\\auto_scraper.py";
const PYTHON_CMD = "d:\\Tender System\\ERP\\UtilApplications\\MITE-SCRAPPER-SYSTEM\\venv\\Scripts\\python.exe";

exports.getTenderDocumentJson = async (req, res) => {
  try {
    let { tenderId } = req.params;

    // 🔥 FIX: convert GEM_2025_B_6994590 → GEM/2025/B/6994590
    const bidNumber = tenderId.replace(/_/g, "/");

    const [rows] = await db.query(
      "SELECT json_path FROM gem_tender_docs WHERE bid_number = ? LIMIT 1",
      [bidNumber]
    );

    if (!rows.length) {
      return res.status(404).json({
        message: "JSON path not found",
        bid_number: bidNumber
      });
    }

    const jsonPath = rows[0].json_path;

    if (!jsonPath || !fs.existsSync(jsonPath)) {
      return res.status(404).json({
        message: "JSON file not found on disk",
        path: jsonPath
      });
    }

    const jsonData = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));

    res.json({
      bid_number: bidNumber,
      data: jsonData
    });

  } catch (err) {
    console.error("JSON fetch error:", err);
    res.status(500).json({ message: "Failed to load tender JSON" });
  }
};

exports.getTenderDocumentPath = async (req, res) => {
  try {
    let { tenderId } = req.params;
    const bidNumber = tenderId.replace(/_/g, "/");

    // 1. Check existing record
    const [rows] = await db.query(
      "SELECT json_path FROM gem_tender_docs WHERE bid_number = ? LIMIT 1",
      [bidNumber]
    );

    // If found and valid, return it
    if (rows.length > 0 && rows[0].json_path && fs.existsSync(rows[0].json_path)) {
      const stats = fs.statSync(rows[0].json_path);
      if (stats.size > 0) {
        return res.json({
          message: "JSON Found and picked (Cached)",
          bid_number: bidNumber,
          json_path: rows[0].json_path
        });
      }
    }

    // 2. Not found or invalid -> Trigger Scraping
    console.log(`[Backend] JSON missing for ${bidNumber}. Attempting auto-scrape...`);

    // Get detail_url (needed for scraping)
    const [tenders] = await db.query(
      "SELECT detail_url FROM gem_tenders WHERE bid_number = ? LIMIT 1",
      [bidNumber]
    );

    if (!tenders.length || !tenders[0].detail_url) {
      console.log(`[Backend] detail_url not found for ${bidNumber}`);
      return res.status(404).json({
        message: "JSON path not found and cannot scrape (missing detail_url)",
        bid_number: bidNumber
      });
    }

    const detailUrl = tenders[0].detail_url;

    // Command: python auto_scraper.py <bid> <url>
    // Adjust cwd to python env if needed? No, we use absolute path.
    // Ensure we are using the correct python environment if possible or just system python.
    // Assuming 'python' is in PATH.

    const cmd = `"${PYTHON_CMD}" "${SCRAPER_Script}" "${bidNumber}" "${detailUrl}"`;
    console.log(`[Backend] Running: ${cmd}`);

    exec(cmd, {
      cwd: path.dirname(SCRAPER_Script) // Run from scraper directory to find 'extractor' module
    }, async (error, stdout, stderr) => {
      if (error) {
        console.error(`[Scraper Error] ${error.message}`);
        return res.status(500).json({ message: "Scraping failed", error: error.message });
      }

      // Parse STDOUT for "JSON_RESULT:{...}"
      const match = stdout.match(/JSON_RESULT:(.*)/);
      if (!match) {
        console.error(`[Scraper Output] ${stdout}`);
        return res.status(500).json({ message: "Scraper finished but returned no result", output: stdout });
      }

      try {
        const result = JSON.parse(match[1]);
        /* 
           result = { status, bid_number, pdf_url, pdf_path, json_path }
        */

        // 3. Update DB
        await db.query(`
          INSERT INTO gem_tender_docs (bid_number, detail_url, pdf_url, pdf_path, json_path)
          VALUES (?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            detail_url = VALUES(detail_url),
            pdf_url = VALUES(pdf_url),
            pdf_path = VALUES(pdf_path),
            json_path = VALUES(json_path)
        `, [
          bidNumber,
          detailUrl,
          result.pdf_url,
          result.pdf_path,
          result.json_path
        ]);

        return res.json({
          message: "JSON Scraped and Created",
          bid_number: bidNumber,
          json_path: result.json_path
        });

      } catch (parseErr) {
        console.error("Failed to parse scraper output", parseErr);
        return res.status(500).json({ message: "Failed to parse scraper result" });
      }
    });

  } catch (err) {
    console.error("JSON path fetch error:", err);
    res.status(500).json({ message: "Failed to lookup tender JSON path" });
  }
};
