-- Manual edits for Tender Tracker fields that have no source-of-truth table
-- (ZH/FLSP correction, DB/HO/DP/NP, DB Name, SAP Material Code, EMD Amt override,
-- Final Remarks, ZM, HO Person, Zone override, Feedback Response - Strategy).
CREATE TABLE IF NOT EXISTS tender_tracker_overrides (
  tender_no VARCHAR(150) COLLATE utf8mb4_unicode_ci NOT NULL PRIMARY KEY,
  source VARCHAR(10) DEFAULT NULL,
  state VARCHAR(100) DEFAULT NULL,
  zh VARCHAR(150) DEFAULT NULL,
  flsp VARCHAR(150) DEFAULT NULL,
  db_ho_dp_np VARCHAR(20) DEFAULT NULL,
  db_name VARCHAR(255) DEFAULT NULL,
  sap_material_code VARCHAR(100) DEFAULT NULL,
  emd_amt VARCHAR(50) DEFAULT NULL,
  final_remarks TEXT,
  zm VARCHAR(150) DEFAULT NULL,
  ho_person VARCHAR(150) DEFAULT NULL,
  zone VARCHAR(10) DEFAULT NULL,
  feedback_response TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
