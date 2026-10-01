/**
 * GeM process tracker with TAT.
 *
 * `process_steps` holds the definition — the ordered process, its TAT per
 * participation mode, and which role owns it. It is seeded from the process
 * matrix but kept as data, not code, so TATs can be corrected without a deploy.
 *
 * `tender_process_progress` holds one row per (tender, step) as it moves.
 *
 * TAT is measured from when the PREVIOUS step completed: each step's clock
 * starts on hand-off, so a breach points at the step that actually stalled
 * rather than smearing across everything downstream.
 *
 * `applies_to` follows the matrix literally — a step with a TAT in only one
 * column is treated as belonging to that mode. Adjust the rows if a step
 * actually runs in both.
 */
const db = require('../config/db');

// [code, name, seq, applies_to, tat_minutes, owner_role, auto_source]
// tat_minutes null = no fixed TAT ("Depends", "Process Repeat").
const STEPS = [
  ['product_matching', 'Product matching after searching', 10, 'both', 10, 'Tender Executive', 'suggestions'],
  ['decoding_received', 'Decoding received from Sales + participation mode, with Zonal Head & approvals', 20, 'both', 1440, 'Sales', 'decode_approved'],
  ['product_upload', 'Product upload (if acceptable deviation)', 30, 'both', 30, 'Tender Executive', null],
  ['rework_repeat', 'If rejected — process repeats until accepted', 40, 'both', 30, 'Sales', null],

  ['authorization', 'Authorization: format → legal finalisation → DSC sign', 50, 'db', 1440, 'Tender Admin', null],
  ['oem_approval', 'OEM approval & GeM link to sales team', 60, 'db', 10, 'Tender Admin', null],
  ['docs_to_sales', 'Required tender documents shared with Sales', 70, 'db', 60, 'Tender Admin', null],

  ['document_reading', 'Tender document reading (GeM bid / ATC / additional specs)', 80, 'direct', 30, 'Tender Executive', 'docs_read'],
  ['decode_review', 'Decode review & representation (within 4 days of publish)', 90, 'direct', 30, 'Tender Executive', 'representation'],
  ['pricing', 'Pricing', 100, 'direct', 1440, 'Finance Team', 'pricing_done'],
  ['emd_request', 'EMD request on CRM with all approvals', 110, 'direct', 1440, 'Finance Team', null],
  ['annexure_common', 'Annexure — common', 120, 'direct', 15, 'Tender Executive', null],
  ['annexure_vapi', 'Annexure (Vapi)', 130, 'direct', 1440, 'Tender Executive', null],
  ['emd_receival', 'EMD receival (Vapi) — BG max', 140, 'direct', 5760, 'Finance Team', null],
  ['common_documents', 'Common documents (financial, legal, licences) signed & stamped', 150, 'direct', 15, 'Tender Executive', null],
  ['notary_affidavits', 'Notary & affidavits', 160, 'direct', 120, 'Tender Executive', null],
  ['po_processing', 'PO — hide price / search / highlight / data entry', 170, 'direct', 30, 'Tender Executive', null],
  ['rearrangement', 'Rearrangement & numbering', 180, 'direct', 10, 'Tender Executive', null],
  ['technical_financial', 'Technical & financial (BOQ / online)', 190, 'direct', 15, 'Tender Executive', null],
  ['corrigendum', 'Tender corrigendum (process repeats)', 200, 'direct', null, 'Tender Executive', null],
  ['post_participation', 'Post-participation tracker entry (decodes / rates)', 210, 'direct', 10, 'Tender Executive', null],
  ['boq_comparative', 'BOQ comparative, share & tracker update (L1/L2/L3)', 220, 'direct', 30, 'Tender Executive', null],
  ['ra_case', 'In case of RA', 230, 'direct', null, 'Tender Admin', null],
];

async function up() {
  console.log('· add_process_tracker.js skipped: superseded by add_tender_flow_steps.js');
}

module.exports = { up, STEPS };

if (require.main === module) {
  up().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}
