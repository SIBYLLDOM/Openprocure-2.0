-- Post-Tender Management System Database Schema
-- Run this script to create the necessary tables

-- Create database
CREATE DATABASE IF NOT EXISTS posttender_db;
USE posttender_db;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('Admin','Post','Finance','Tender','Logistics','QC') DEFAULT 'Tender',
  status ENUM('Active','Inactive') DEFAULT 'Active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Participated Tenders table
CREATE TABLE IF NOT EXISTS participated_tenders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bid_no VARCHAR(100) UNIQUE NOT NULL,
  won_status ENUM('Won','Lost','Pending') DEFAULT 'Pending',
  won_date DATE,
  emd_status ENUM('Received','Not Received','Pending') DEFAULT 'Not Received',
  emd_amt DECIMAL(15,2),
  loa_status ENUM('Received','Not Received','Pending') DEFAULT 'Not Received',
  loa_file_path VARCHAR(500),
  buying_mode ENUM('Direct','Bid/RA') NOT NULL,
  buying_origin ENUM('GEM','OPEN') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_bid_no (bid_no),
  INDEX idx_won_status (won_status),
  INDEX idx_won_date (won_date),
  INDEX idx_buying_origin (buying_origin)
);

-- EMD Received table
CREATE TABLE IF NOT EXISTS emd_received (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bid_no VARCHAR(100) NOT NULL,
  emd_amt DECIMAL(15,2),
  submitted_date DATE,
  requested_date DATE,
  emd_status ENUM('Submitted','Pending','Refunded','Forfeited') DEFAULT 'Pending',
  item_category VARCHAR(255),
  bank_detail TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (bid_no) REFERENCES participated_tenders(bid_no) ON DELETE CASCADE,
  INDEX idx_bid_no (bid_no),
  INDEX idx_emd_status (emd_status),
  INDEX idx_submitted_date (submitted_date)
);


-- PBG (Performance Bank Guarantee) table
CREATE TABLE IF NOT EXISTS pbg_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bid_no VARCHAR(100) NOT NULL,
  contract_no VARCHAR(100),
  pbg_amount DECIMAL(15,2),
  pbg_percentage DECIMAL(5,2),
  validity_period VARCHAR(50),
  issue_date DATE,
  expiry_date DATE,
  bank_name VARCHAR(255),
  branch_name VARCHAR(255),
  reference_number VARCHAR(100),
  status ENUM('Draft','Submitted','Approved','Active','Expired') DEFAULT 'Draft',
  document_path VARCHAR(500),
  remarks TEXT,
  uploaded_by_user_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (bid_no) REFERENCES participated_tenders(bid_no) ON DELETE CASCADE,
  INDEX idx_status (status),
  INDEX idx_expiry_date (expiry_date)
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bid_no VARCHAR(100) NOT NULL,
  order_number VARCHAR(100) UNIQUE,
  order_date DATE,
  order_value DECIMAL(15,2),
  delivery_date DATE,
  status ENUM('Pending','In Progress','Completed','Cancelled') DEFAULT 'Pending',
  items_json JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (bid_no) REFERENCES participated_tenders(bid_no) ON DELETE CASCADE,
  INDEX idx_order_number (order_number),
  INDEX idx_status (status)
);

-- Logistics/Dispatch table
CREATE TABLE IF NOT EXISTS dispatch_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  dispatch_date DATE,
  courier_name VARCHAR(255),
  tracking_number VARCHAR(100),
  delivery_status ENUM('Pending','In Transit','Delivered','Failed') DEFAULT 'Pending',
  delivery_date DATE,
  recipient_name VARCHAR(255),
  recipient_address TEXT,
  remarks TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  INDEX idx_tracking_number (tracking_number),
  INDEX idx_delivery_status (delivery_status)
);

-- LOA (Letter of Acceptance) table
CREATE TABLE IF NOT EXISTS loa_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bid_no VARCHAR(100) NOT NULL,
  loa_number VARCHAR(100),
  loa_date DATE,
  received_date DATE,
  status ENUM('Requested','Received','Pending') DEFAULT 'Requested',
  document_path VARCHAR(500),
  remarks TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (bid_no) REFERENCES participated_tenders(bid_no) ON DELETE CASCADE,
  INDEX idx_status (status)
);

-- Compliance/Certificates table
CREATE TABLE IF NOT EXISTS compliance_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  certificate_type ENUM('COA','NABL','DCC','Other') NOT NULL,
  issue_date DATE,
  expiry_date DATE,
  status ENUM('Pending','Submitted','Approved','Rejected') DEFAULT 'Pending',
  document_path VARCHAR(500),
  remarks TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  INDEX idx_certificate_type (certificate_type),
  INDEX idx_status (status)
);

-- Contracts table
CREATE TABLE IF NOT EXISTS contracts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bid_no VARCHAR(100) NOT NULL,
  contract_no VARCHAR(100) UNIQUE NOT NULL,
  contract_date DATE,
  validity_period VARCHAR(50),
  contract_value DECIMAL(15,2),
  status ENUM('Active','Expired','Terminated') DEFAULT 'Active',
  document_path VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (bid_no) REFERENCES participated_tenders(bid_no) ON DELETE CASCADE,
  INDEX idx_contract_no (contract_no)
);

-- Insert default admin user (password: admin123)
-- Password hash generated with: bcrypt.hashSync('admin123', 10)
INSERT INTO users (name, email, password, role) VALUES
('Admin User', 'admin@posttender.com', '$2a$10$rQZ9vXqZ9vXqZ9vXqZ9vXO7K7K7K7K7K7K7K7K7K7K7K7K7K7K7K7', 'Admin')
ON DUPLICATE KEY UPDATE name=name;

-- Insert test users for different roles
INSERT INTO users (name, email, password, role) VALUES
('Post User', 'post@posttender.com', '$2a$10$rQZ9vXqZ9vXqZ9vXqZ9vXO7K7K7K7K7K7K7K7K7K7K7K7K7K7K7K7', 'Post'),
('Finance User', 'finance@posttender.com', '$2a$10$rQZ9vXqZ9vXqZ9vXqZ9vXO7K7K7K7K7K7K7K7K7K7K7K7K7K7K7K7', 'Finance'),
('Tender User', 'tender@posttender.com', '$2a$10$rQZ9vXqZ9vXqZ9vXO7K7K7K7K7K7K7K7K7K7K7K7K7K7K7K7', 'Tender'),
('Logistics User', 'logistics@posttender.com', '$2a$10$rQZ9vXqZ9vXqZ9vXqZ9vXO7K7K7K7K7K7K7K7K7K7K7K7K7K7K7K7', 'Logistics')
ON DUPLICATE KEY UPDATE name=name;


-- GeM Tenders table (for storing tender details and URLs)
CREATE TABLE IF NOT EXISTS gem_tenders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bid_number VARCHAR(100) UNIQUE NOT NULL,
  title VARCHAR(255),
  description TEXT,
  detail_url VARCHAR(500) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_bid_number (bid_number)
);

-- PBG Drafts table (for storing intermediate drafts)
CREATE TABLE IF NOT EXISTS pbg_drafts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bid_no VARCHAR(100) NOT NULL,
  content LONGTEXT,
  submitted BOOLEAN DEFAULT 0,
  submitted_by VARCHAR(50),
  submitted_at TIMESTAMP NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (bid_no) REFERENCES participated_tenders(bid_no) ON DELETE CASCADE,
  UNIQUE KEY unique_bid_draft (bid_no)
);

-- Agreement Drafts table
CREATE TABLE IF NOT EXISTS agreement_drafts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bid_no VARCHAR(100) NOT NULL,
  content LONGTEXT,
  submitted BOOLEAN DEFAULT 0,
  submitted_by VARCHAR(50),
  submitted_at TIMESTAMP NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (bid_no) REFERENCES participated_tenders(bid_no) ON DELETE CASCADE,
  UNIQUE KEY unique_bid_agreement (bid_no)
);

-- Agreement Submission table (for signed agreements uploaded by legal team)
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
  UNIQUE KEY unique_bid_submission (bid_no)
);


-- Banks table for dropdowns
CREATE TABLE IF NOT EXISTS banks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bank_name VARCHAR(100) NOT NULL,
  branch_name VARCHAR(100) NOT NULL,
  ifsc_code VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_bank_name (bank_name)
);

CREATE TABLE IF NOT EXISTS `orders_rows` (
  `id` int NOT NULL AUTO_INCREMENT,
  `contract_no` varchar(100) DEFAULT NULL,
  `contract_date` varchar(50) DEFAULT NULL,
  `status` varchar(100) DEFAULT NULL,
  `buyer_designation` text,
  `department` text,
  `location` text,
  `total_order_value` varchar(100) DEFAULT NULL,
  `quantity` varchar(100) DEFAULT NULL,
  `no_of_consignees` varchar(50) DEFAULT NULL,
  `contract_url` text,
  `invoice_doc` text,
  `receipt_doc` text,
  `contract_json` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `contract_no` (`contract_no`)
) ENGINE=MyISAM AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `zone_data`;
CREATE TABLE IF NOT EXISTS `zone_data` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `emp_id` varchar(50) NOT NULL,
  `email_id` varchar(191) NOT NULL,
  `state` enum('Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Andaman and Nicobar Islands','Chandigarh','Dadra and Nagar Haveli and Daman and Diu','Delhi','Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry') NOT NULL,
  `zone` enum('North','South','East','West') NOT NULL,
  `role` enum('Leader','FLSP') NOT NULL,
  `reporting_to_leader_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_emp_id` (`emp_id`),
  KEY `fk_reporting_leader` (`reporting_to_leader_id`)
)

INSERT INTO `zone_data` (`id`, `name`, `emp_id`, `email_id`, `state`, `zone`, `role`, `reporting_to_leader_id`) VALUES
(1, 'Bhaskar Sekar', 'EMP002-N', 'stevejerald632@gmail.com', 'Tamil Nadu', 'North', 'FLSP', 1),
(2, 'Sibyll Dominic', 'EMP002-S', 'stevejerald632@gmail.com', 'Tamil Nadu', 'South', 'FLSP', 1),
(3, 'Sibyll Dominic', 'EMP002-E', 'stevejerald632@gmail.com', 'Tamil Nadu', 'East', 'FLSP', 1),
(4, 'Sibyll Dominic', 'EMP002-W', 'stevejerald632@gmail.com', 'Tamil Nadu', 'West', 'FLSP', 1);

CREATE TABLE IF NOT EXISTS `orders_rows` (
  `id` int NOT NULL AUTO_INCREMENT,
  `dept` enum('endo','diagno') DEFAULT NULL,
  `contract_no` varchar(100) DEFAULT NULL,
  `contract_date` varchar(50) DEFAULT NULL,
  `status` varchar(100) DEFAULT NULL,
  `buyer_designation` text,
  `department` text,
  `location` text,
  `total_order_value` varchar(100) DEFAULT NULL,
  `quantity` varchar(100) DEFAULT NULL,
  `no_of_consignees` varchar(50) DEFAULT NULL,
  `contract_url` text,
  `invoice_doc` text,
  `receipt_doc` text,
  `contract_json` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `order_prog_status` enum('Accepted','Declined') DEFAULT NULL,
  `opi_generation` enum('not yet created','pending for creation','created','sent for verification','verified') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'not yet created',
  `sap_order_no` varchar(100) DEFAULT NULL,
  `punched_by` varchar(100) DEFAULT NULL,
  `punched_date` date DEFAULT NULL,
  `opi_file_path` varchar(255) DEFAULT NULL,
  `flsp_email` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `contract_no` (`contract_no`)
) 

INSERT INTO `orders_rows` (`id`, `dept`, `contract_no`, `contract_date`, `status`, `buyer_designation`, `department`, `location`, `total_order_value`, `quantity`, `no_of_consignees`, `contract_url`, `invoice_doc`, `receipt_doc`, `contract_json`, `created_at`, `updated_at`, `order_prog_status`, `opi_generation`, `sap_order_no`, `punched_by`, `punched_date`, `opi_file_path`, `flsp_email`) VALUES
(1, 'endo', 'GEMC-511687791861786', '11/12/2025', 'In Progress', 'Oic', 'Department of health and family welfare', 'Office of the medical superintendent safdarjung hospital new delhi-110029', '₹ 35,28,000.00', '24000 nos', '1', 'https://fulfilment.gem.gov.in/contract/fds?contractId=WTZjM05PamJOeWF6Zmc4WDlnd0dJWFQxQVBrNmRUNjFINGN4SXE0Ni93Yz0=', 'D:\\Tender System\\orders\\GEMC-511687791861786_invoice.pdf', 'D:\\Tender System\\orders\\GEMC-511687791861786_receipt.pdf', 'D:\\Tender System\\orders\\GEMC-511687791861786.json', '2026-02-05 22:58:00', '2026-02-08 17:18:34', 'Accepted', '', NULL, NULL, NULL, 'opi_output/OPI_GEMC-511687791861786.json', NULL),
(2, 'endo', 'GEMC-511687728507778', '06/10/2025', 'In Progress', 'Store keeper yj', 'Department of health and family welfare', 'Central store, aiims rishikesh, virbhadra road, near bairaj lake, rishikesh, uttarakhand-249203', '₹ 1,43,200.00', '20 nos', '1', 'https://fulfilment.gem.gov.in/contract/fds?contractId=em4waXd4aEZHWUtQS2xIMExqVFBrWEJuM01aUVhoL0JURnFDRno0TjNCQT0=', '', '', 'D:\\Tender System\\orders\\GEMC-511687728507778.json', '2026-02-05 22:58:00', '2026-02-08 00:26:08', NULL, 'not yet created', NULL, NULL, NULL, NULL, NULL),
(3, 'endo', 'GEMC-511687754402000', '06/10/2025', 'In Progress', 'Store keeper yj', 'Department of health and family welfare', 'Central store, aiims rishikesh, virbhadra road, near bairaj lake, rishikesh, uttarakhand-249203', '₹ 2,14,800.00', '30 nos', '1', 'https://fulfilment.gem.gov.in/contract/fds?contractId=bGJLWWFnYmRSa2tncnpjQ2lhUUpJcGhWNG12TTFBWXZDYW9EM3BVY1lWOD0=', '', '', 'D:\\Tender System\\orders\\GEMC-511687754402000.json', '2026-02-05 22:58:00', '2026-02-08 00:26:08', NULL, 'not yet created', NULL, NULL, NULL, NULL, NULL),
(4, 'endo', 'GEMC-511687740561457', '06/10/2025', 'In Progress', 'Store keeper yj', 'Department of health and family welfare', 'Central store, aiims rishikesh, virbhadra road, near bairaj lake, rishikesh, uttarakhand-249203', '₹ 35,244.00', '3 nos', '1', 'https://fulfilment.gem.gov.in/contract/fds?contractId=Qm5Fei9HelJlSm9EREFmZldUZXlZQ3A0LzBCRjh3WG1IbG1vOGEwc3VCZz0=', '', '', 'D:\\Tender System\\orders\\GEMC-511687740561457.json', '2026-02-05 22:58:00', '2026-02-08 00:26:08', NULL, 'not yet created', NULL, NULL, NULL, NULL, NULL),
(5, 'endo', 'GEMC-511687712980380', '06/10/2025', 'In Progress', 'Store keeper yj', 'Department of health and family welfare', 'Central store, aiims rishikesh, virbhadra road, near bairaj lake, rishikesh, uttarakhand-249203', '₹ 3,35,550.00', '150 nos', '1', 'https://fulfilment.gem.gov.in/contract/fds?contractId=ci9NbDg3WlY0d1hkaWdUNmpVbUZFMzA0VzkvRXdJNFVqTm5JTHZPZkFBcz0=', '', '', 'D:\\Tender System\\orders\\GEMC-511687712980380.json', '2026-02-05 22:58:00', '2026-02-08 00:26:08', NULL, 'not yet created', NULL, NULL, NULL, NULL, NULL),
(6, 'endo', 'GEMC-511687731041496', '06/10/2025', 'In Progress', 'Store keeper yj', 'Department of health and family welfare', 'Central store, aiims rishikesh, virbhadra road, near bairaj lake, rishikesh, uttarakhand-249203', '₹ 4,69,800.00', '200 nos', '1', 'https://fulfilment.gem.gov.in/contract/fds?contractId=aFFvWFJEM0Y2WEhtNFJxM2hjcU1tSG11N1E4OGorNDhxeWs4citGVXdNQT0=', '', '', 'D:\\Tender System\\orders\\GEMC-511687731041496.json', '2026-02-05 22:58:00', '2026-02-08 00:26:08', NULL, 'not yet created', NULL, NULL, NULL, NULL, NULL),
(7, 'endo', 'GEMC-511687783452236', '06/10/2025', 'In Progress', 'Store keeper yj', 'Department of health and family welfare', 'Central store, aiims rishikesh, virbhadra road, near bairaj lake, rishikesh, uttarakhand-249203', '₹ 6,71,000.00', '100 nos', '1', 'https://fulfilment.gem.gov.in/contract/fds?contractId=Um9uZmU3S1p1OU13UTB4OXkwK0JPR2lBbnh3aHVCTVcva2hyNzA5aWRPbz0=', '', '', 'D:\\Tender System\\orders\\GEMC-511687783452236.json', '2026-02-05 22:58:00', '2026-02-08 00:26:08', NULL, 'not yet created', NULL, NULL, NULL, NULL, NULL),
(8, 'endo', 'GEMC-511687753873393', '06/10/2025', 'In Progress', 'Store keeper yj', 'Department of health and family welfare', 'Central store, aiims rishikesh, virbhadra road, near bairaj lake, rishikesh, uttarakhand-249203', '₹ 1,34,200.00', '20 nos', '1', 'https://fulfilment.gem.gov.in/contract/fds?contractId=ZXArcHkzS0VEN3pVRVVRT29hVU9zVllJL1hqR3VGclcvSTY5MUowcFRYRT0=', '', '', 'D:\\Tender System\\orders\\GEMC-511687753873393.json', '2026-02-05 22:58:00', '2026-02-08 00:26:08', NULL, 'not yet created', NULL, NULL, NULL, NULL, NULL),
(9, 'endo', 'GEMC-511687740185275', '06/10/2025', 'In Progress', 'Store keeper yj', 'Department of health and family welfare', 'Central store, aiims rishikesh, virbhadra road, near bairaj lake, rishikesh, uttarakhand-249203', '₹ 20,13,000.00', '300 nos', '1', 'https://fulfilment.gem.gov.in/contract/fds?contractId=Y0poUEFDU3loTlY2bUdDL0dlM2R3V0l3WUhwbXI4QlBiSDVqSHQwQVBZQT0=', 'D:\\Tender System\\orders\\GEMC-511687740185275_invoice.pdf', 'D:\\Tender System\\orders\\GEMC-511687740185275_receipt.pdf', 'D:\\Tender System\\orders\\GEMC-511687740185275.json', '2026-02-05 22:58:00', '2026-02-08 00:26:08', NULL, 'not yet created', NULL, NULL, NULL, NULL, NULL),
(10, 'endo', 'GEMC-511687747533994', '13/06/2025', 'In Progress', 'Cmo', 'Employees state insuarnce corporation', 'Esic medical college and hospital, sanathanagar, hyderabad', '₹ 88,224.00', '1920 nos', '1', 'https://fulfilment.gem.gov.in/contract/fds?contractId=MlZWT3FYdG1qZWpXU2pRUnVURC9tM0NNMnBBb1RzbDliampsWWxHMllIcz0=', '', '', 'D:\\Tender System\\orders\\GEMC-511687747533994.json', '2026-02-05 22:58:00', '2026-02-08 00:26:08', NULL, 'not yet created', NULL, NULL, NULL, NULL, NULL),
(11, 'endo', 'GEMC-511687775908866', '22/02/2025', 'Completed', 'Oic mslp cell', 'Department of military affairs', 'Mslp cell, military hospital ambala, ambala cantt, haryana', '₹ 55,600.00', '4 nos', '1', 'https://fulfilment.gem.gov.in/contract/fds?contractId=NzdlR0dhTGI2SGFTSVVmOGRGamhCcFpmSlYxVkNZZEc2N2xLNnFvZ0dSRT0=', 'D:\\Tender System\\orders\\GEMC-511687775908866_invoice.pdf', 'D:\\Tender System\\orders\\GEMC-511687775908866_receipt.pdf', 'D:\\Tender System\\orders\\GEMC-511687775908866.json', '2026-02-05 22:58:52', '2026-02-08 16:49:03', 'Accepted', 'created', '784519', '1', '2026-02-08', 'opi_output/OPI_GEMC-511687775908866.json', NULL),
(12, 'endo', 'GEMC-511687731315354', '01/10/2024', 'Completed', 'Oicprocurementcell', 'Department of military affairs', 'Military hospital namkum', '₹ 34,950.00', '150 nos', '1', 'https://fulfilment.gem.gov.in/contract/fds?contractId=ajBXbDNwOE9GSlF4Q1VBYUR2Z29ucHk5cE5SOVY3K2U2TWpFci90Skdabz0=', '', '', 'D:\\Tender System\\orders\\GEMC-511687731315354.json', '2026-02-05 22:58:52', '2026-02-08 00:26:08', NULL, 'not yet created', NULL, NULL, NULL, NULL, NULL),
(13, 'endo', 'GEMC-511687771237692', '08/08/2024', 'Cancelled', 'Pb2pa4', 'Education department chandigarh', 'Government medical college & hospital sector 32, chandigarh, 160031', '₹ 20,160.00', '1200 nos', '1', 'https://fulfilment.gem.gov.in/contract/fds?contractId=ZmEwd0FETUdVMTV1aWZGekJQTWZLT215U25pbXIycDQyNmd3KzNqN0NDRT0=', '', '', 'D:\\Tender System\\orders\\GEMC-511687771237692.json', '2026-02-05 22:58:52', '2026-02-08 00:26:08', NULL, 'not yet created', NULL, NULL, NULL, NULL, NULL),
(14, 'endo', 'GEMC-511687754914858', '13/02/2024', 'Completed', 'Deputy superintendent', 'Medical education & research department haryana', 'Kalpana chawla govt. medical college, karnal', '₹ 3,68,000.00', '2000 nos', '1', 'https://fulfilment.gem.gov.in/contract/fds?contractId=Z2ZoZWNZcTUyYlpnNDlPeitnOXNhZmtiaGFXMUdoTkZPeHowYlZVZmdGaz0=', '', '', 'D:\\Tender System\\orders\\GEMC-511687754914858.json', '2026-02-05 22:58:52', '2026-02-08 17:28:38', 'Accepted', '', NULL, NULL, NULL, 'opi_output/OPI_GEMC-511687754914858.json', NULL),
(15, 'endo', 'GEMC-511687769172892', '04/01/2024', 'Completed', 'Dr naresh', 'Medical education & research department haryana', 'Shkm govt medical college, nalhar,nuh (mewat)haryana,122107', '₹ 26,104.00', '800 nos', '1', 'https://fulfilment.gem.gov.in/contract/fds?contractId=RUh6ZnZxQVpPNmpTdGcwVlo0TnYxWk8zbmovam95SFh6ZFpLV1F3WGVsND0=', '', '', 'D:\\Tender System\\orders\\GEMC-511687769172892.json', '2026-02-05 22:58:52', '2026-02-08 00:26:08', NULL, 'not yet created', NULL, NULL, NULL, NULL, NULL),
(16, 'endo', 'GEMC-511687715750322', '11/05/2023', 'In Progress', 'Vinod kumar', 'Health department haryana', 'Director bps government medical college for women khanpur kalan', '₹ 6,120.00', '240 nos', '1', 'https://fulfilment.gem.gov.in/contract/fds?contractId=eGZnZWlORGhwc0NSZ1VnV0xkcnJBSGQ1emFza2poOUJCN1dRMCtwUXI0Yz0=', '', '', '', '2026-02-05 22:58:52', '2026-02-08 00:26:08', NULL, 'not yet created', NULL, NULL, NULL, NULL, NULL);


CREATE TABLE IF NOT EXISTS coa_certificate (
  id INT NOT NULL AUTO_INCREMENT,
  contract_no VARCHAR(150) NOT NULL,

  coa_file JSON DEFAULT NULL,
  nabl_certificate JSON DEFAULT NULL,

  status ENUM('onprocess', 'completed') DEFAULT 'onprocess',

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_contract (contract_no)
);

CREATE TABLE IF NOT EXISTS dcc (
  id INT NOT NULL AUTO_INCREMENT,

  contract_no VARCHAR(150) NOT NULL,

  status ENUM('not', 'created', 'verified', 'declined') DEFAULT 'not',
  email_status ENUM('not sent', 'sent') DEFAULT 'not sent',

  created_by INT DEFAULT NULL,
  verified_by INT DEFAULT NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  verified_at TIMESTAMP NULL DEFAULT NULL,

  PRIMARY KEY (id),
  UNIQUE KEY uk_contract (contract_no)
);
