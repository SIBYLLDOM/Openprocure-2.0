import api from './api';
import { API_ORIGIN } from '../utils/apiBase';

// Thin wrapper around /api/purchases — Purchases > Purchases Hub.
// See backend/controllers/purchaseController.js.

export interface PurchaseItem {
  name: string; hsn?: string; gstRate: number; qty: number; unit: string; rate: number;
  amount: number; cgst: number; sgst: number; total: number; description?: string;
}
export interface ShippingAddress {
  warehouse?: string; sameAsBusiness?: boolean; sameAsClient?: boolean; name?: string;
  country?: string; address?: string; city?: string; postalCode?: string; state?: string; gstin?: string;
}
export interface Discount { type: 'flat' | 'percent'; value: number; amount?: number }
export interface AdditionalCharge { label: string; amount: number }

export interface PurchaseRow {
  id: number;
  source: 'created' | 'uploaded';
  purchaseNo: string;
  invoiceNo: string | null;
  poNumber: string | null;
  title: string;
  subtitle: string | null;
  purchaseDate: string;
  dueDate: string | null;
  logoPath: string | null;
  vendorId: number | null;
  vendor?: { id: number; businessName: string; logoPath: string | null } | null;
  currency: string;
  shippingEnabled: boolean;
  shippingFrom: ShippingAddress | null;
  shippingTo: ShippingAddress | null;
  items: PurchaseItem[] | null;
  discount: Discount | null;
  additionalCharges: AdditionalCharge[] | null;
  subtotal: string;
  cgstTotal: string;
  sgstTotal: string;
  grandTotal: string;
  totalQuantity: string;
  notes: string | null;
  terms: string | null;
  isRecurring: boolean;
  status: 'Draft' | 'Sent' | 'Accepted' | 'Rejected';
  uploadedFilePath: string | null;
  uploadedFileName: string | null;
  createdAt: string;
}

export const resolvePurchaseLogoUrl = (p: string | null) => (p ? `${API_ORIGIN}${p}` : null);

export const PURCHASE_STATUS_COLORS: Record<PurchaseRow['status'], string> = {
  Draft: 'bg-gray-100 text-gray-600', Sent: 'bg-blue-50 text-blue-700', Accepted: 'bg-success-50 text-success-700', Rejected: 'bg-danger-50 text-danger-700',
};

export interface PurchaseListParams {
  page?: number; limit?: number; search?: string; status?: string; vendorId?: string; dateFrom?: string; dateTo?: string;
}

export const getPurchases = (params: PurchaseListParams) =>
  api.get('/purchases', { params }).then((r) => r.data as { success: boolean; data: PurchaseRow[]; total: number; page: number; limit: number; totalPages: number });

export const getNextPurchaseNumber = () => api.get('/purchases/next-number').then((r) => r.data as { success: boolean; purchaseNo: string });

export const getPurchase = (id: number) => api.get(`/purchases/${id}`).then((r) => r.data as { success: boolean; data: PurchaseRow });

export const createPurchase = (formData: FormData) =>
  api.post('/purchases', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data as { success: boolean; data: PurchaseRow });

export const updatePurchase = (id: number, formData: FormData) =>
  api.patch(`/purchases/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data as { success: boolean; data: PurchaseRow });

export const setPurchaseStatus = (id: number, status: PurchaseRow['status']) =>
  api.patch(`/purchases/${id}/status`, { status }).then((r) => r.data as { success: boolean; data: PurchaseRow });

export const deletePurchase = (id: number) => api.delete(`/purchases/${id}`).then((r) => r.data as { success: boolean });

export const uploadPurchaseFile = (formData: FormData) =>
  api.post('/purchases/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data as { success: boolean; data: PurchaseRow });

async function downloadBlob(url: string, filename: string) {
  const r = await api.get(url, { responseType: 'blob' });
  const blobUrl = URL.createObjectURL(r.data as Blob);
  const a = document.createElement('a');
  a.href = blobUrl; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
}

export const downloadPurchasePdf = (id: number, purchaseNo: string) => downloadBlob(`/purchases/${id}/pdf`, `${purchaseNo}.pdf`);
export const downloadPurchaseFile = (id: number, fileName: string) => downloadBlob(`/purchases/${id}/file`, fileName);

export const getPurchaseStats = () => api.get('/purchases/stats').then((r) => r.data as { success: boolean; total: number; draft: number });
