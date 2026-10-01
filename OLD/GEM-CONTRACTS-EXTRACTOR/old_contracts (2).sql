-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1:3306
-- Generation Time: Feb 26, 2026 at 08:36 PM
-- Server version: 8.3.0
-- PHP Version: 8.2.18

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
-- Table structure for table `old_contracts`
--

DROP TABLE IF EXISTS `old_contracts`;
CREATE TABLE IF NOT EXISTS `old_contracts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `serial_no` int DEFAULT NULL,
  `category_name` varchar(255) DEFAULT NULL,
  `contract_no` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `bid_no` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `product` text,
  `brand` varchar(255) DEFAULT NULL,
  `model` varchar(255) DEFAULT NULL,
  `ordered_quantity` varchar(50) DEFAULT NULL,
  `price` varchar(50) DEFAULT NULL,
  `total_value` varchar(50) DEFAULT NULL,
  `buyer_dept_org` text,
  `organization_name` text,
  `buyer_designation` text,
  `state` varchar(100) DEFAULT NULL,
  `buyer_department` text,
  `office_zone` text,
  `buying_mode` varchar(100) DEFAULT NULL,
  `contract_date` varchar(100) DEFAULT NULL,
  `order_status` varchar(100) DEFAULT NULL,
  `download_link` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `seller_id` varchar(100) DEFAULT NULL,
  `seller_name` text,
  `seller_email` varchar(255) DEFAULT NULL,
  `unit_price` varchar(50) DEFAULT NULL,
  `dept` enum('diagno','endo') NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_contracts_seller_id` (`seller_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
