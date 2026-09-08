import api from './api';

// Thin wrapper around /api/reseller-products — Product Management > Our
// Products (reseller-only). See backend/controllers/resellerProductController.js.

export interface ResellerProductRow {
  id: number;
  dealerAuthRequestId: number | null;
  authSerialNo: string | null;
  productName: string;
  decode: string | null;
  technicalSpecification: string | null;
  oemBy: string | null;
  validFrom: string | null;
  validTo: string | null;
  catalogFilePath: string | null;
  catalogFileName: string | null;
  createdAt: string;
}

export const getProducts = (params: { search?: string; oemBy?: string; status?: string }) =>
  api.get('/reseller-products', { params }).then((r) => r.data as { success: boolean; data: ResellerProductRow[] });

export const getProductOems = () =>
  api.get('/reseller-products/oems').then((r) => r.data as { success: boolean; data: string[] });

export interface ApprovedAuthorization {
  id: number;
  refNo: string;
  productName: string | null;
  oemBy: string | null;
  validFrom: string;
  validTo: string;
}
export const getApprovedAuthorizations = () =>
  api.get('/reseller-products/approved-authorizations').then((r) => r.data as { success: boolean; data: ApprovedAuthorization[] });

export const createProduct = (payload: Partial<ResellerProductRow> & { productName: string; dealerAuthRequestId?: number }) =>
  api.post('/reseller-products', payload).then((r) => r.data as { success: boolean; data: ResellerProductRow });

export const updateProduct = (id: number, payload: Partial<ResellerProductRow>) =>
  api.patch(`/reseller-products/${id}`, payload).then((r) => r.data as { success: boolean; data: ResellerProductRow });

export const deleteProduct = (id: number) =>
  api.delete(`/reseller-products/${id}`).then((r) => r.data as { success: boolean });

export const uploadCatalog = (id: number, file: File) => {
  const fd = new FormData();
  fd.append('file', file);
  return api.post(`/reseller-products/${id}/catalog`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    .then((r) => r.data as { success: boolean; data: ResellerProductRow });
};

export const downloadCatalog = async (id: number, name: string) => {
  const r = await api.get(`/reseller-products/${id}/catalog/download`, { responseType: 'blob' });
  const url = URL.createObjectURL(r.data as Blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};
