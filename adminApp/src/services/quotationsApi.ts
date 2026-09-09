import api from './api';
import { API_ORIGIN } from '../utils/apiBase';

// Thin wrapper around /api/quotations — backs Sales & Invoices > Quotations,
// > Invoices, > Proforma Invoice, > Sales Order, > Delivery Challan, and
// > Credit Note. All six share this exact endpoint set and record shape;
// every call takes a `docType` so they stay entirely separate record sets
// (own numbering sequence, own list, own stats) even though they're the
// same table under the hood — see backend/controllers/quotationController.js.

export type QuotationDocType = 'quotation' | 'invoice' | 'proforma' | 'sales_order' | 'delivery_challan' | 'credit_note';

export interface QuotationItem {
  name: string; hsn?: string; gstRate: number; qty: number; unit: string; rate: number;
  amount: number; cgst: number; sgst: number; total: number; description?: string;
}
export interface ShippingAddress {
  warehouse?: string; sameAsBusiness?: boolean; sameAsClient?: boolean; name?: string;
  country?: string; address?: string; city?: string; postalCode?: string; state?: string; gstin?: string;
}
export interface Discount { type: 'flat' | 'percent'; value: number; amount?: number }
export interface AdditionalCharge { label: string; amount: number }

export interface QuotationRow {
  id: number;
  docType: QuotationDocType;
  source: 'created' | 'uploaded';
  quotationNo: string;
  poNumber: string | null;
  title: string;
  subtitle: string | null;
  quotationDate: string;
  validTillDate: string | null;
  logoPath: string | null;
  clientId: number | null;
  client?: { id: number; businessName: string; logoPath: string | null } | null;
  linkedInvoiceId: number | null;
  linkedInvoice?: { id: number; quotationNo: string; grandTotal: string } | null;
  reason: string | null;
  currency: string;
  shippingEnabled: boolean;
  shippingFrom: ShippingAddress | null;
  shippingTo: ShippingAddress | null;
  items: QuotationItem[] | null;
  discount: Discount | null;
  additionalCharges: AdditionalCharge[] | null;
  subtotal: string;
  cgstTotal: string;
  sgstTotal: string;
  grandTotal: string;
  totalQuantity: string;
  notes: string | null;
  terms: string | null;
  accentColor: string;
  status: 'Draft' | 'Sent' | 'Accepted' | 'Rejected';
  uploadedFilePath: string | null;
  uploadedFileName: string | null;
  createdAt: string;
}

export const resolveQuotationLogoUrl = (p: string | null) => (p ? `${API_ORIGIN}${p}` : null);

export const QUOTATION_STATUS_COLORS: Record<QuotationRow['status'], string> = {
  Draft: 'bg-gray-100 text-gray-600', Sent: 'bg-blue-50 text-blue-700', Accepted: 'bg-success-50 text-success-700', Rejected: 'bg-danger-50 text-danger-700',
};

export interface QuotationListParams {
  docType: QuotationDocType;
  page?: number; limit?: number; search?: string; status?: string; clientId?: string; dateFrom?: string; dateTo?: string;
}

export const getQuotations = (params: QuotationListParams) =>
  api.get('/quotations', { params }).then((r) => r.data as { success: boolean; data: QuotationRow[]; total: number; page: number; limit: number; totalPages: number });

export const getNextQuotationNumber = (docType: QuotationDocType) =>
  api.get('/quotations/next-number', { params: { docType } }).then((r) => r.data as { success: boolean; quotationNo: string });

export const getQuotation = (id: number) => api.get(`/quotations/${id}`).then((r) => r.data as { success: boolean; data: QuotationRow });

export const createQuotation = (formData: FormData) =>
  api.post('/quotations', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data as { success: boolean; data: QuotationRow });

export const updateQuotation = (id: number, formData: FormData) =>
  api.patch(`/quotations/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data as { success: boolean; data: QuotationRow });

export const setQuotationStatus = (id: number, status: QuotationRow['status']) =>
  api.patch(`/quotations/${id}/status`, { status }).then((r) => r.data as { success: boolean; data: QuotationRow });

export const deleteQuotation = (id: number) => api.delete(`/quotations/${id}`).then((r) => r.data as { success: boolean });

export const uploadQuotationFile = (formData: FormData) =>
  api.post('/quotations/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data as { success: boolean; data: QuotationRow });

async function downloadBlob(url: string, filename: string) {
  const r = await api.get(url, { responseType: 'blob' });
  const blobUrl = URL.createObjectURL(r.data as Blob);
  const a = document.createElement('a');
  a.href = blobUrl; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
}

export const downloadQuotationPdf = (id: number, quotationNo: string) => downloadBlob(`/quotations/${id}/pdf`, `${quotationNo}.pdf`);
export const downloadQuotationFile = (id: number, fileName: string) => downloadBlob(`/quotations/${id}/file`, fileName);

export const getQuotationStats = (docType: QuotationDocType) =>
  api.get('/quotations/stats', { params: { docType } }).then((r) => r.data as { success: boolean; total: number; draft: number });

export const emailQuotation = (id: number) => api.post(`/quotations/${id}/email`).then((r) => r.data as { success: boolean; message?: string });
