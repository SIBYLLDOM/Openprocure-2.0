import QuotationsListPage from './QuotationsListPage';

// Sales & Invoices > Delivery Challan — same exact feature set and logic as
// Quotations/Invoices/Proforma Invoice/Sales Order (see QuotationsListPage),
// but a fully separate record set: own numbering sequence (DC00001...), own
// list, own stats, and "Delivered By"/"Delivered To" wording. No second
// date field (delivery challans only carry a single delivery date).
const DeliveryChallanPage = () => (
  <QuotationsListPage
    docType="delivery_challan"
    label="Delivery Challan"
    labelPlural="Delivery Challans"
    pageDescription="Create, track and share delivery challans with your clients."
    fromLabel="Delivered By"
    toLabel="Delivered To"
    showDueDate={false}
  />
);

export default DeliveryChallanPage;
