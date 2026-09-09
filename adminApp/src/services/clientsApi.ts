import api from './api';
import { API_ORIGIN } from '../utils/apiBase';

// Thin wrapper around /api/clients — Sales & Invoices > Our Clients.
// See backend/controllers/clientController.js.

export interface ClientRow {
  id: number;
  logoPath: string | null;
  businessName: string;
  clientKind: 'Prospect' | 'Client';
  clientType: 'Individual' | 'Company';
  industry: string | null;
  taxTreatment: string | null;
  gstin: string | null;
  pan: string | null;
  businessAlias: string | null;
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
  lastCommunicationDate: string | null;
  customFields: Record<string, string> | null;
  createdAt: string;
}

export interface ClientShippingDetail {
  id: number; name: string | null; country: string | null; state: string | null; city: string | null;
  postalCode: string | null; streetAddress: string | null;
}
export interface ClientContact {
  id: number; contact: { id: number; name: string | null; designation: string | null; email: string | null; mobile: string | null };
}
export interface ClientAttachment { id: number; fileName: string; fileSize: number | null; createdAt: string }

export interface ClientDetail extends ClientRow {
  shippingDetails: ClientShippingDetail[];
  contactLinks: ClientContact[];
  attachments: ClientAttachment[];
}

export interface ClientListParams {
  page?: number; limit?: number; search?: string; clientKind?: string; industry?: string; country?: string; status?: string;
}

// logoPath comes back as a server-relative path (e.g. /uploads/clients/logos/x.jpg) — resolve against the backend origin.
export const resolveLogoUrl = (logoPath: string | null) => (logoPath ? `${API_ORIGIN}${logoPath}` : null);

export const getClients = (params: ClientListParams) =>
  api.get('/clients', { params }).then((r) => r.data as { success: boolean; data: ClientRow[]; total: number; page: number; limit: number; totalPages: number });

export const getClientFilters = () =>
  api.get('/clients/filters').then((r) => r.data as { success: boolean; industries: string[]; countries: string[] });

export const getClient = (id: number) => api.get(`/clients/${id}`).then((r) => r.data as { success: boolean; data: ClientDetail });

export const createClient = (formData: FormData) =>
  api.post('/clients', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data as { success: boolean; data: ClientRow });

export const updateClient = (id: number, formData: FormData) =>
  api.patch(`/clients/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data as { success: boolean; data: ClientRow });

export const setClientArchived = (id: number, archive: boolean) =>
  api.patch(`/clients/${id}/archive`, { archive }).then((r) => r.data as { success: boolean; data: ClientRow });

export const deleteClient = (id: number) => api.delete(`/clients/${id}`).then((r) => r.data as { success: boolean });

export const addShippingDetail = (id: number, payload: Partial<ClientShippingDetail>) =>
  api.post(`/clients/${id}/shipping`, payload).then((r) => r.data as { success: boolean; data: ClientShippingDetail });
export const deleteShippingDetail = (id: number, shippingId: number) =>
  api.delete(`/clients/${id}/shipping/${shippingId}`).then((r) => r.data as { success: boolean });

export interface AvailableContact { id: number; name: string | null; designation: string | null; email: string | null; mobile: string | null }
export const getAvailableContacts = () => api.get('/clients/contacts/available').then((r) => r.data as { success: boolean; data: AvailableContact[] });
export const linkContact = (id: number, partnerContactId: number) =>
  api.post(`/clients/${id}/contacts`, { partnerContactId }).then((r) => r.data as { success: boolean });
export const unlinkContact = (id: number, linkId: number) =>
  api.delete(`/clients/${id}/contacts/${linkId}`).then((r) => r.data as { success: boolean });

export const uploadClientAttachment = (id: number, file: File) => {
  const fd = new FormData();
  fd.append('file', file);
  return api.post(`/clients/${id}/attachments`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data as { success: boolean; data: ClientAttachment });
};
export const downloadClientAttachment = async (id: number, attachmentId: number, name: string) => {
  const r = await api.get(`/clients/${id}/attachments/${attachmentId}/download`, { responseType: 'blob' });
  const url = URL.createObjectURL(r.data as Blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};
export const deleteClientAttachment = (id: number, attachmentId: number) =>
  api.delete(`/clients/${id}/attachments/${attachmentId}`).then((r) => r.data as { success: boolean });

export const getClientInvoices = (id: number) => api.get(`/clients/${id}/invoices`).then((r) => r.data as { success: boolean; data: unknown[] });

export const exportClientsCsv = async () => {
  const r = await api.get('/clients/export.csv', { responseType: 'blob' });
  const url = URL.createObjectURL(r.data as Blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'clients.csv'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};
