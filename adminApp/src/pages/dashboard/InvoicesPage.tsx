import QuotationsListPage from './QuotationsListPage';

// Sales & Invoices > Invoices — same exact feature set and logic as
// Quotations/Proforma Invoice (see QuotationsListPage), but a fully
// separate record set: own numbering sequence (INV00001...), own list, own
// stats, and "Billed By"/"Billed To"/"Due Date" wording instead of
// "Quotation From"/"Quotation For"/"Valid Till Date".
const InvoicesPage = () => (
  <QuotationsListPage
    docType="invoice"
    label="Invoice"
    labelPlural="Invoices"
    pageDescription="Create, track and share invoices with your clients."
    fromLabel="Billed By"
    toLabel="Billed To"
    dueDateLabel="Due Date"
  />
);

export default InvoicesPage;
