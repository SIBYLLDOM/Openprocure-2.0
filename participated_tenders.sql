-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1:3306
-- Generation Time: Feb 28, 2026 at 05:07 AM
-- Server version: 9.1.0
-- PHP Version: 8.3.14

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `tender_automation_with_ai`
--

-- --------------------------------------------------------

--
-- Table structure for table `participated_tenders`
--

DROP TABLE IF EXISTS `participated_tenders`;
CREATE TABLE IF NOT EXISTS `participated_tenders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `bid_no` varchar(100) NOT NULL,
  `won_status` enum('won','lost','pending','on-hold') DEFAULT 'pending',
  `won_date` date DEFAULT NULL,
  `emd_status` enum('Received','Not Received','Pending') DEFAULT 'Not Received',
  `emd_amt` decimal(15,2) DEFAULT NULL,
  `loa_status` enum('Received','Not Received','Pending') DEFAULT 'Not Received',
  `loa_file_path` varchar(500) DEFAULT NULL,
  `buying_mode` enum('Direct','Bid/RA') NOT NULL,
  `buying_origin` enum('GEM','OPEN') NOT NULL,
  `tender_value` decimal(15,2) DEFAULT NULL,
  `buyer_name` varchar(255) DEFAULT NULL,
  `buyer_address` text,
  `consignee_mail_id` varchar(70) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `state` varchar(100) DEFAULT NULL,
  `zone` varchar(100) DEFAULT NULL,
  `zone_head` varchar(100) DEFAULT NULL,
  `flsp` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `bid_no` (`bid_no`),
  KEY `idx_bid_no` (`bid_no`),
  KEY `idx_won_status` (`won_status`),
  KEY `idx_won_date` (`won_date`),
  KEY `idx_buying_origin` (`buying_origin`)
) ENGINE=MyISAM AUTO_INCREMENT=45 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `participated_tenders`
--

INSERT INTO `participated_tenders` (`id`, `bid_no`, `won_status`, `won_date`, `emd_status`, `emd_amt`, `loa_status`, `loa_file_path`, `buying_mode`, `buying_origin`, `tender_value`, `buyer_name`, `buyer_address`, `consignee_mail_id`, `created_at`, `updated_at`, `state`, `zone`, `zone_head`, `flsp`) VALUES
(1, 'GEM/2025/B/7036059', 'won', '2026-02-16', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 41827.07, 'Medical store', 'Esic hospital plot no h 3012, 500 quarters road, gidc, ankleshwar', 'stevejerald632@gmail.com', '2026-02-27 15:37:57', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(2, 'GEM/2026/B/7170912', 'won', NULL, 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 20790.00, 'Computer operator', 'Raisen by pass road karond bhopal', 'stevejerald632@gmail.com', '2026-02-27 15:37:57', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(3, 'GEM/2025/B/6921278', 'won', NULL, 'Received', 25000.00, 'Not Received', NULL, '', 'GEM', 33264.00, 'Oic dglp', 'Military hospital, trivandrum thirumala post, pin-695006', 'stevejerald632@gmail.com', '2026-02-27 15:37:57', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(4, 'GEM/2025/B/6392215', '', '2026-01-20', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 617.88, 'Gm technical', '1st floor, commercial complex, housing board complex, sector-27, atal nagar, nava raipur, chhattisgarh', 'stevejerald632@gmail.com', '2026-02-27 15:38:26', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(5, 'GEM/2025/B/6877513', '', '2026-01-15', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 116655.00, 'George thomas', 'Sree chitra tirunal institute for medical science and technology,medical college po, triavndrum', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(6, 'GEM/2025/B/6815889', '', '2026-01-09', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 335160.00, 'George thomas', 'Sree chitra tirunal institute for medical science and technology,medical college po, triavndrum', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:48:36', 'Kerala', 'South', 'EMP002-N', '[{\"name\":\"Sibyll Dominic\",\"email_id\":\"sibylldominic@gmail.com\",\"emp_id\":\"EMP002-S\"}]'),
(7, 'GEM/2025/B/6416312', '', '2025-12-16', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 11882455.50, 'Inderjeet yadav agm', 'Second floor , viswa yuvak kendra , chanakyapuri new delhi -110021', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(8, 'GEM/2025/B/6409972', 'won', NULL, 'Received', NULL, 'Not Received', NULL, '', 'GEM', 102400.00, 'George thomas', 'Sree chitra tirunal institute for medical science and technology,medical college po, triavndrum', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(9, 'GEM/2025/B/6409345', '', '2025-10-30', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 11648.40, 'George thomas', 'Sree chitra tirunal institute for medical science and technology,medical college po, triavndrum', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(10, 'GEM/2025/B/6494756', '', '2025-10-29', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 882000.00, 'Astt manager materials1', 'Alumina refinery nalco, damanjodi', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(11, 'GEM/2025/B/6066028', '', '2025-10-06', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 23520.00, 'Store keeper yj', 'Central store, aiims rishikesh, virbhadra road, near bairaj lake, rishikesh, uttarakhand-249203', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(12, 'GEM/2025/B/6257240', 'won', NULL, 'Received', NULL, 'Received', '', '', 'GEM', 193795.20, 'George thomas', 'Sree chitra tirunal institute for medical science and technology,medical college po, triavndrum', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(13, 'GEM/2025/B/6171496', '', '2025-09-16', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 118540.80, 'George thomas', 'Sree chitra tirunal institute for medical science and technology,medical college po, triavndrum', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(14, 'GEM/2025/B/6307118', '', '2025-09-02', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 75600.00, 'George thomas', 'Sree chitra tirunal institute for medical science and technology,medical college po, triavndrum', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(15, 'GEM/2025/B/6169718', '', '2025-08-14', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 10035.60, 'George thomas', 'Sree chitra tirunal institute for medical science and technology,medical college po, triavndrum', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(16, 'GEM/2025/B/5911606', '', '2025-07-25', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 59807.88, 'Cmo', 'Esic medical college and hospital, sanathanagar, hyderabad', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(17, 'GEM/2025/B/6307349', 'won', NULL, 'Received', NULL, 'Not Received', NULL, '', 'GEM', 11289.60, 'George thomas', 'Sree chitra tirunal institute for medical science and technology,medical college po, triavndrum', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(18, 'GEM/2024/B/5413884', '', '2025-07-15', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 11345071.50, 'Inderjeet yadav agm', 'Second floor , viswa yuvak kendra , chanakyapuri new delhi -110021', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(19, 'GEM/2025/B/6005008', '', '2025-06-12', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 110250.00, 'Imo grade 2', 'Esic medical college and hospital, sanathnagar, hyderabad', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(20, 'GEM/2025/B/6091936', '', '2025-06-03', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 302400.00, 'George thomas', 'Sree chitra tirunal institute for medical science and technology,medical college po, triavndrum', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(21, 'GEM/2025/B/6115104', '', '2025-06-02', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 131040.00, 'George thomas', 'Sree chitra tirunal institute for medical science and technology,medical college po, triavndrum', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(22, 'GEM/2025/B/6145666', '', '2025-05-23', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 88480.00, 'Smo', 'Esic model & super specialty hospital, asramam', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(23, 'GEM/2025/B/5867111', '', '2025-05-21', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 11970.00, 'Oic mspc', 'Mh hisar, hisar cantt hisar', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(24, 'GEM/2025/B/5825757', '', '2025-05-07', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 156804.00, 'George thomas', 'Sree chitra tirunal institute for medical science and technology,medical college po, triavndrum', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(25, 'GEM/2025/B/6025048', '', '2025-04-04', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 190401.00, 'George thomas', 'Sree chitra tirunal institute for medical science and technology,medical college po, triavndrum', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(26, 'GEM/2025/B/5878590', '', '2025-03-27', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 47040.00, 'George thomas', 'Sree chitra tirunal institute for medical science and technology,medical college po, triavndrum', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(27, 'GEM/2025/B/5878185', '', '2025-03-25', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 120401.60, 'George thomas', 'Sree chitra tirunal institute for medical science and technology,medical college po, triavndrum', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(28, 'GEM/2025/B/5903928', '', '2025-02-18', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 36960.00, 'Oic mslp cell', 'Mslp cell, military hospital ambala, ambala cantt, haryana', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(29, 'GEM/2024/B/5352643', '', '2025-02-04', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 67200.00, 'Amm medical hajipur', 'O/o principal chief material manager, ground floor, old g.m. building, east central railway, hajipur, vaishali (bihar), pin-844101', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(30, 'GEM/2024/B/5423043', '', '2024-12-18', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 20160.00, 'Surgical stores incharge', 'Esic super speciality hospital sanathnagar hyderabad', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(31, 'GEM/2024/B/5421847', '', '2024-12-18', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 16799.40, 'Surgical stores incharge', 'Esic super speciality hospital sanathnagar hyderabad', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(32, 'GEM/2024/B/5488149', '', '2024-12-16', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 67200.00, 'George thomas', 'Sree chitra tirunal institute for medical science and technology,medical college po, triavndrum', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(33, 'GEM/2024/B/4979908', '', '2024-08-08', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 112896.00, 'Store in charge', 'Esic hospital, pathalam junction, udyogamandal p.o., ernakulam', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(34, 'GEM/2024/B/4856418', '', '2024-06-15', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 347196.00, 'Upper division clerk syamlal ms', 'Sree chitra tirunal institute for medical science and technology,medical college po, triavndrum', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(35, 'GEM/2023/B/4373746', '', '2024-04-16', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 60480.00, 'Upper division clerk syamlal ms', 'Sree chitra tirunal institute for medical science and technology,medical college po, triavndrum', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(36, 'GEM/2023/B/3542801', '', '2024-03-26', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 372960.00, 'Upper division clerk syamlal ms', 'Sree chitra tirunal institute for medical science and technology,medical college po, triavndrum', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(37, 'GEM/2023/B/4333105', '', '2024-03-22', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 907200.00, 'Upper division clerk syamlal ms', 'Sree chitra tirunal institute for medical science and technology,medical college po, triavndrum', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(38, 'GEM/2023/B/4379373', '', '2024-03-20', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 262080.00, 'Upper division clerk syamlal ms', 'Sree chitra tirunal institute for medical science and technology,medical college po, triavndrum', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(39, 'GEM/2023/B/3813073', '', '2024-03-15', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 8444479.20, 'Inderjeet yadav agm', 'Second floor , viswa yuvak kendra , chanakyapuri new delhi -110021', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(40, 'GEM/2023/B/3526421', '', '2024-03-11', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 504000.00, 'Upper division clerk syamlal ms', 'Sree chitra tirunal institute for medical science and technology,medical college po, triavndrum', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:52:35', 'Kerala', 'South', 'EMP002-N', '[{\"name\":\"Sibyll Dominic\",\"email_id\":\"sibylldominic@gmail.com\",\"emp_id\":\"EMP002-S\"}]'),
(41, 'GEM/2024/B/4554265', '', '2024-03-09', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 28000.00, 'Chief pharmacist', 'J j hospital compaund, anatomy dept. byculla mumbai', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(42, 'GEM/2023/B/4369801', '', '2024-01-12', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 31080.00, 'Amm/g', 'Principal cheif material manager office, administrative building rail coach factory, kapurthala', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL),
(44, 'GEM/2022/B/2346241', '', '2022-09-30', 'Not Received', NULL, 'Not Received', NULL, '', 'GEM', 354480.00, 'Syamlal ms', 'Sree chitra tirunal institute for medical science and technology,medical college po, triavndrum', 'stevejerald632@gmail.com', '2026-02-27 15:38:47', '2026-02-27 18:21:48', NULL, NULL, NULL, NULL);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
