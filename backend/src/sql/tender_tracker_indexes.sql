-- Tender Tracker query performance: these tables get filtered on every page load.
-- Without them, tender_processing_results.result and open_tender_details.relevency_checker
-- were full-table-scanned (~118k and ~400 rows respectively) on every request.
ALTER TABLE tender_processing_results ADD INDEX idx_result_bidno (result, bid_no);
ALTER TABLE open_tender_details ADD INDEX idx_relevency_checker (relevency_checker);
ALTER TABLE tender_tracker ADD UNIQUE INDEX idx_bid_number (bid_number);
