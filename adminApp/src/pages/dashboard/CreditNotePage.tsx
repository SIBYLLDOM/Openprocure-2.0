import QuotationsListPage from './QuotationsListPage';

// Sales & Invoices > Credit Note — same feature set and logic as the other
// document types (see QuotationsListPage), but a fully separate record set:
// own numbering sequence (CN00001...), own list, own stats,
// "Issued By"/"Issued To" wording, no shipping section (a credit note
// isn't a shipment), no second date field, and a required Link Invoice +
// Reason pair (enforced both client-side and server-side).
const CreditNotePage = () => (
  <QuotationsListPage
    docType="credit_note"
    label="Credit Note"
    labelPlural="Credit Notes"
    pageDescription="Issue credit notes against invoices for returns, corrections or discounts."
    fromLabel="Issued By"
    toLabel="Issued To"
    showDueDate={false}
  />
);

export default CreditNotePage;
