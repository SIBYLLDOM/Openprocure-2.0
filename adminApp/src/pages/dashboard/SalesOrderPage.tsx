import QuotationsListPage from './QuotationsListPage';

// Sales & Invoices > Sales Order — same exact feature set and logic as
// Quotations/Invoices/Proforma Invoice (see QuotationsListPage), but a
// fully separate record set: own numbering sequence (SO00001...), own
// list, own stats.
const SalesOrderPage = () => (
  <QuotationsListPage docType="sales_order" label="Sales Order" labelPlural="Sales Orders" pageDescription="Create, track and share sales orders with your clients." showDueDate={false} />
);

export default SalesOrderPage;
