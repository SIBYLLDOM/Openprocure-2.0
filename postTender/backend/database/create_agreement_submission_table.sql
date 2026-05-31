-- Agreement Submission Table
-- This table stores the final signed agreements uploaded by the legal team

CREATE TABLE IF NOT EXISTS agreement_submission (
    id INT AUTO_INCREMENT PRIMARY KEY,
    bid_no VARCHAR(100) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    uploaded_by VARCHAR(50),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('Pending', 'Verified') DEFAULT 'Pending',
    verified_by VARCHAR(50),
    verified_at TIMESTAMP NULL,
    remarks TEXT,
    FOREIGN KEY (bid_no) REFERENCES agreement_drafts(bid_no) ON DELETE CASCADE,
    UNIQUE KEY unique_bid_submission (bid_no)
);
