import QuotationsListPage from './QuotationsListPage';

// Sales & Invoices > Proforma Invoice — same exact feature set and logic as
// Quotations (see QuotationsListPage), but a fully separate record set: own
// numbering sequence (PI00001...), own list, own stats. Driven entirely by
// docType="proforma" threaded through the shared components/API.
const ProformaInvoicePage = () => (
  <QuotationsListPage docType="proforma" label="Proforma Invoice" labelPlural="Proforma Invoices" pageDescription="Create, track and share proforma invoices with your clients." />
);

export default ProformaInvoicePage;
