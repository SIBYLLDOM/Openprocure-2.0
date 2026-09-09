import api from './api';

// Thin wrapper around /api/payment-receipts — Sales & Invoices > Payment
// Receipts. See backend/controllers/paymentReceiptController.js.

export type PaymentType = 'receipt' | 'advance';

export interface PaymentRecord {
  paymentMethod: string;
  depositedTo: string;
  ledger: string;
  amountReceived: number;
  tdsPercent: number;
  tdsAmount: number;
  transactionCharge: number;
  referenceId?: string;
  notes?: string;
  netAmount: number;
}

export interface PaymentAllocationInput { invoiceId: number; amount: number }

export interface PaymentAllocationRow {
  id: number;
  invoiceId: number;
  amount: string;
  invoice?: { id: number; quotationNo: string; grandTotal: string } | null;
}

export interface PaymentReceiptRow {
  id: number;
  receiptNo: string;
  paymentType: PaymentType;
  clientId: number | null;
  client?: { id: number; businessName: string; logoPath: string | null } | null;
  receivedFrom: string | null;
  receiptDate: string;
  currency: string;
  paymentRecords: PaymentRecord[] | null;
  allocations?: PaymentAllocationRow[];
  totalReceived: string;
  totalAllocated: string;
  advanceAmount: string;
  notes: string | null;
  status: 'Draft' | 'Saved';
  createdAt: string;
}

export interface UnpaidInvoice {
  invoiceId: number;
  quotationNo: string;
  quotationDate: string;
  grandTotal: number;
  paid: number;
  remaining: number;
}

export interface PaymentReceiptListParams {
  page?: number; limit?: number; search?: string; status?: string; clientId?: string; paymentType?: string; dateFrom?: string; dateTo?: string;
}

export const getPaymentReceipts = (params: PaymentReceiptListParams) =>
  api.get('/payment-receipts', { params }).then((r) => r.data as { success: boolean; data: PaymentReceiptRow[]; total: number; page: number; limit: number; totalPages: number });

export const getPaymentReceiptStats = () => api.get('/payment-receipts/stats').then((r) => r.data as { success: boolean; total: number; draft: number });

export const getNextReceiptNumber = () => api.get('/payment-receipts/next-number').then((r) => r.data as { success: boolean; receiptNo: string });

export const getUnpaidInvoices = (clientId: number) =>
  api.get('/payment-receipts/unpaid-invoices', { params: { clientId } }).then((r) => r.data as { success: boolean; data: UnpaidInvoice[] });

export const getPaymentReceipt = (id: number) => api.get(`/payment-receipts/${id}`).then((r) => r.data as { success: boolean; data: PaymentReceiptRow });

export interface PaymentReceiptPayload {
  receiptNo: string;
  paymentType: PaymentType;
  clientId: number | string;
  receivedFrom?: string;
  receiptDate: string;
  currency: string;
  paymentRecords: Partial<PaymentRecord>[];
  allocations: PaymentAllocationInput[];
  notes?: string;
  status: 'Draft' | 'Saved';
}

export const createPaymentReceipt = (payload: PaymentReceiptPayload) =>
  api.post('/payment-receipts', payload).then((r) => r.data as { success: boolean; data: PaymentReceiptRow });

export const updatePaymentReceipt = (id: number, payload: PaymentReceiptPayload) =>
  api.patch(`/payment-receipts/${id}`, payload).then((r) => r.data as { success: boolean; data: PaymentReceiptRow });

export const deletePaymentReceipt = (id: number) => api.delete(`/payment-receipts/${id}`).then((r) => r.data as { success: boolean });

export const PAYMENT_RECEIPT_STATUS_COLORS: Record<PaymentReceiptRow['status'], string> = {
  Draft: 'bg-gray-100 text-gray-600', Saved: 'bg-success-50 text-success-700',
};
