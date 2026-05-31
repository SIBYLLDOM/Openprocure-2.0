-- =====================================================
-- COURIER TRACKING TABLE
-- Stores courier booking information for shipments
-- =====================================================

CREATE TABLE IF NOT EXISTS courier (
    id INT PRIMARY KEY AUTO_INCREMENT,
    contract_no VARCHAR(100) NOT NULL,
    awb_no VARCHAR(100),
    shipment_id VARCHAR(100),
    order_id VARCHAR(100),
    courier_name VARCHAR(200),
    pickup_status VARCHAR(50),
    label_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_contract_no (contract_no),
    INDEX idx_awb_no (awb_no),
    INDEX idx_shipment_id (shipment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
