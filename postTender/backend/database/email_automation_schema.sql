-- Email Automation System Database Tables

-- Email Archive Table (stores all fetched emails)
CREATE TABLE IF NOT EXISTS email_archive (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email_id VARCHAR(255) UNIQUE NOT NULL,
  from_email VARCHAR(255),
  to_email VARCHAR(255),
  subject TEXT,
  body_text LONGTEXT,
  body_html LONGTEXT,
  received_date DATETIME,
  category ENUM('Tender Won', 'Order', 'EMD', 'PBG', 'NABL', 'LOA', 'DCC', 'Other') DEFAULT 'Other',
  processed BOOLEAN DEFAULT 0,
  extracted_data JSON,
  confidence_score DECIMAL(3,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email_id (email_id),
  INDEX idx_category (category),
  INDEX idx_processed (processed),
  INDEX idx_received_date (received_date)
);

-- Email Processing Log (tracks processing status and errors)
CREATE TABLE IF NOT EXISTS email_processing_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email_id VARCHAR(255),
  category VARCHAR(50),
  status ENUM('Success', 'Failed', 'Pending', 'Manual Review') DEFAULT 'Pending',
  error_message TEXT,
  processing_time_ms INT,
  processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (email_id) REFERENCES email_archive(email_id) ON DELETE CASCADE,
  INDEX idx_status (status),
  INDEX idx_processed_at (processed_at)
);

-- Email Attachments (stores attachment metadata)
CREATE TABLE IF NOT EXISTS email_attachments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email_id VARCHAR(255),
  filename VARCHAR(255),
  file_path VARCHAR(500),
  file_size INT,
  mime_type VARCHAR(100),
  extracted_text LONGTEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (email_id) REFERENCES email_archive(email_id) ON DELETE CASCADE,
  INDEX idx_email_id (email_id)
);
