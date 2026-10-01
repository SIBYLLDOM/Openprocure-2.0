-- Migration: add new columns to open_tender_details
-- Run once against tender_automation_with_ai database
-- Safe to re-run: uses ADD COLUMN IF NOT EXISTS (MySQL 8.0+ / MariaDB 10.0+)

USE `tender_automation_with_ai`;

ALTER TABLE `open_tender_details`
  -- base new columns
  ADD COLUMN IF NOT EXISTS `dept`                 VARCHAR(50)   DEFAULT NULL AFTER `suggested_product`,
  ADD COLUMN IF NOT EXISTS `tender_page_link`     TEXT          DEFAULT NULL AFTER `file_link`,
  ADD COLUMN IF NOT EXISTS `downloaded_documents` LONGTEXT      DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `searched_keyword`     VARCHAR(500)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `found_date`           DATETIME      DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `corrigendum`          LONGTEXT      DEFAULT NULL,

  -- NICGEP extracted fields
  ADD COLUMN IF NOT EXISTS `withdrawal_allowed`                    VARCHAR(20)   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `tender_type`                           VARCHAR(100)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `form_of_contract`                      VARCHAR(100)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `tender_category`                       VARCHAR(100)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `no_of_covers`                          VARCHAR(20)   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `general_technical_evaluation_allowed`  VARCHAR(20)   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `itemwise_technical_evaluation_allowed` VARCHAR(20)   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `payment_mode`                          VARCHAR(100)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `multi_currency_allowed_boq`            VARCHAR(20)   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `multi_currency_allowed_fee`            VARCHAR(20)   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `two_stage_bidding_allowed`             VARCHAR(20)   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `emd_amount`                            VARCHAR(100)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `work_item_title`                       TEXT          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `work_description`                      LONGTEXT      DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `nda_pre_qualification`                 TEXT          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `independent_external_monitor_remarks`  TEXT          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `tender_value`                          VARCHAR(100)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `product_category`                      VARCHAR(255)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `sub_category`                          VARCHAR(255)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `contract_type`                         VARCHAR(100)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `bid_validity_days`                     VARCHAR(20)   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `period_of_work_days`                   VARCHAR(20)   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `location`                              VARCHAR(255)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `pincode`                               VARCHAR(20)   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `pre_bid_meeting_place`                 VARCHAR(500)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `pre_bid_meeting_address`               TEXT          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `pre_bid_meeting_date`                  VARCHAR(100)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `bid_opening_place`                     VARCHAR(255)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `nda_tender_allowed`                    VARCHAR(20)   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `preferential_bidder_allowed`           VARCHAR(20)   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `nicgep_published_date`                 VARCHAR(100)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `bid_opening_date`                      VARCHAR(100)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `doc_download_start_date`               VARCHAR(100)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `doc_download_end_date`                 VARCHAR(100)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `clarification_start_date`              VARCHAR(100)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `clarification_end_date`                VARCHAR(100)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `bid_submission_start_date`             VARCHAR(100)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `bid_submission_end_date`               VARCHAR(100)  DEFAULT NULL;

-- Verify
SELECT COLUMN_NAME, COLUMN_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'tender_automation_with_ai'
  AND TABLE_NAME   = 'open_tender_details'
ORDER BY ORDINAL_POSITION;
