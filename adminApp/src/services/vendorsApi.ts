import api from './api';
import { API_ORIGIN } from '../utils/apiBase';

// Thin wrapper around /api/vendors — Purchases & Expenses > Our Vendors.
// See backend/controllers/vendorController.js.

export interface VendorBankAccount {
  accountHolderName: string; bankName: string; accountNumber: string; ifsc: string; branch: string;
}

export interface VendorRow {
  id: number;
  logoPath: string | null;
  businessName: string;
  vendorType: 'Individual' | 'Company';
  industry: string | null;
  taxTreatment: string | null;
  gstin: string | null;
  pan: string | null;
  displayName: string | null;
  uniqueKey: string;
  email: string | null;
  showEmailInInvoice: boolean;
  phone: string | null;
  showPhoneInInvoice: boolean;
  defaultDueDays: number | null;
  country: string | null;
  state: string | null;
  city: string | null;
  postalCode: string | null;
  streetAddress: string | null;
  status: 'Active' | 'Archived';
  customFields: Record<string, string> | null;
  bankAccounts: VendorBankAccount[] | null;
  createdAt: string;
}

export interface VendorContact {
  id: number; contact: { id: number; name: string | null; designation: string | null; email: string | null; mobile: string | null };
}
export interface VendorAttachment { id: number; fileName: string; fileSize: number | null; createdAt: string }

export interface VendorDetail extends VendorRow {
  contactLinks: VendorContact[];
  attachments: VendorAttachment[];
}

export interface VendorListParams {
  page?: number; limit?: number; search?: string; industry?: string; country?: string; status?: string;
}

export const resolveVendorLogoUrl = (logoPath: string | null) => (logoPath ? `${API_ORIGIN}${logoPath}` : null);

export const getVendors = (params: VendorListParams) =>
  api.get('/vendors', { params }).then((r) => r.data as { success: boolean; data: VendorRow[]; total: number; page: number; limit: number; totalPages: number });

export const getVendorFilters = () =>
  api.get('/vendors/filters').then((r) => r.data as { success: boolean; industries: string[]; countries: string[] });

export const getVendor = (id: number) => api.get(`/vendors/${id}`).then((r) => r.data as { success: boolean; data: VendorDetail });

export const createVendor = (formData: FormData) =>
  api.post('/vendors', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data as { success: boolean; data: VendorRow });

export const updateVendor = (id: number, formData: FormData) =>
  api.patch(`/vendors/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data as { success: boolean; data: VendorRow });

export const setVendorArchived = (id: number, archive: boolean) =>
  api.patch(`/vendors/${id}/archive`, { archive }).then((r) => r.data as { success: boolean; data: VendorRow });

export const deleteVendor = (id: number) => api.delete(`/vendors/${id}`).then((r) => r.data as { success: boolean });

export interface AvailableContact { id: number; name: string | null; designation: string | null; email: string | null; mobile: string | null }
export const getAvailableContacts = () => api.get('/vendors/contacts/available').then((r) => r.data as { success: boolean; data: AvailableContact[] });
export const linkContact = (id: number, partnerContactId: number) =>
  api.post(`/vendors/${id}/contacts`, { partnerContactId }).then((r) => r.data as { success: boolean });
export const unlinkContact = (id: number, linkId: number) =>
  api.delete(`/vendors/${id}/contacts/${linkId}`).then((r) => r.data as { success: boolean });

export const uploadVendorAttachment = (id: number, file: File) => {
  const fd = new FormData();
  fd.append('file', file);
  return api.post(`/vendors/${id}/attachments`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data as { success: boolean; data: VendorAttachment });
};
export const downloadVendorAttachment = async (id: number, attachmentId: number, name: string) => {
  const r = await api.get(`/vendors/${id}/attachments/${attachmentId}/download`, { responseType: 'blob' });
  const url = URL.createObjectURL(r.data as Blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};
export const deleteVendorAttachment = (id: number, attachmentId: number) =>
  api.delete(`/vendors/${id}/attachments/${attachmentId}`).then((r) => r.data as { success: boolean });

export const exportVendorsCsv = async () => {
  const r = await api.get('/vendors/export.csv', { responseType: 'blob' });
  const url = URL.createObjectURL(r.data as Blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'vendors.csv'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};
