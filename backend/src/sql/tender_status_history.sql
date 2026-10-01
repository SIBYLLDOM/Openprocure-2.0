-- Create tender status history table
CREATE TABLE IF NOT EXISTS tender_status_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bid_number VARCHAR(100) NOT NULL,
  status ENUM('proceed', 'win', 'lose', 'close') NOT NULL,
  remarks TEXT,
  created_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_bid_number (bid_number),
  INDEX idx_created_date (created_date)
);

-- Add foreign key constraint if gem_tender_docs table exists
-- ALTER TABLE tender_status_history 
-- ADD CONSTRAINT fk_tender_status_bid_number 
-- FOREIGN KEY (bid_number) REFERENCES gem_tender_docs(bid_number) 
-- ON DELETE CASCADE;
