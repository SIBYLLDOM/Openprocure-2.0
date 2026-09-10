import api from './api';

// Thin wrapper around /api/dealer-requests — cross-tenant Authorization
// Request workflow (reseller -> OEM). See backend/controllers/dealerAuthRequestController.js.

export interface OemOption { userId: number; name: string; email: string }
export const getOemOptions = (q?: string) =>
  api.get('/dealer-requests/oems', { params: { q } }).then((r) => r.data as { success: boolean; data: OemOption[] });

export interface NamedOption { id: number; name: string }
export const getOemCategories = (oemUserId: number) =>
  api.get(`/dealer-requests/oems/${oemUserId}/categories`).then((r) => r.data as { success: boolean; data: NamedOption[] });
export const getOemSubCategories = (oemUserId: number, categoryId: number) =>
  api.get(`/dealer-requests/oems/${oemUserId}/subcategories`, { params: { categoryId } }).then((r) => r.data as { success: boolean; data: NamedOption[] });

export interface ProductOption { productId: number | null; name: string; custom?: boolean }
export const getOemProducts = (oemUserId: number, categoryId: number) =>
  api.get(`/dealer-requests/oems/${oemUserId}/products`, { params: { categoryId } }).then((r) => r.data as { success: boolean; data: ProductOption[] });

export interface DealerAuthRequestItem {
  id: number;
  sortOrder: number;
  categoryId: number | null;
  subCategoryId: number | null;
  productId: number | null;
  customProductName: string | null;
  productCode: string | null;
  conditionBullets: string[] | null;
  productName: string | null;
  category?: { name: string } | null;
  subCategory?: { name: string } | null;
}

export interface DealerAuthRequestRow {
  id: number;
  refNo: string;
  authCode: string | null;
  fromUserId: number;
  toUserId: number;
  fromCompanyName: string;
  toCompanyName: string;
  productName: string | null;
  items: DealerAuthRequestItem[];
  validFrom: string;
  validTo: string;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  rejectionRemarks: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface AuthRequestItemInput {
  categoryId?: number; subCategoryId?: number; productId?: number | null; customProductName?: string;
  productCode?: string; conditionBullets?: string[];
}

export const createAuthRequest = (payload: {
  toUserId: number; validFrom: string; validTo: string; reason?: string; items: AuthRequestItemInput[];
}) => api.post('/dealer-requests', payload).then((r) => r.data as { success: boolean; data: DealerAuthRequestRow; message?: string });

export const getSentRequests = () => api.get('/dealer-requests/sent').then((r) => r.data as { success: boolean; data: DealerAuthRequestRow[] });
export const getReceivedRequests = () => api.get('/dealer-requests/received').then((r) => r.data as { success: boolean; data: DealerAuthRequestRow[] });
export const getRequestDetail = (id: number) => api.get(`/dealer-requests/${id}`).then((r) => r.data as { success: boolean; data: DealerAuthRequestRow });

export interface ResellerProfileData {
  user: { id: number; name: string; email: string; partnerType: string };
  profile: {
    companyInfo?: Record<string, any>;
    registeredAddress?: Record<string, any>;
    businessDetails?: Record<string, any>;
    contacts?: { id: number; name: string | null; designation: string | null; email: string | null; mobile: string | null; contactType: string | null }[];
    certificates?: { id: number; name?: string; certificateType?: string; fileUrl?: string }[];
    taxRegistrations?: { id: number; type?: string; number?: string }[];
  } | null;
}
export const getResellerProfile = (requestId: number) =>
  api.get(`/dealer-requests/${requestId}/reseller-profile`).then((r) => r.data as { success: boolean; data: ResellerProfileData });

export const approveRequest = (id: number) => api.post(`/dealer-requests/${id}/approve`).then((r) => r.data as { success: boolean; data: DealerAuthRequestRow; message?: string });
export const rejectRequest = (id: number, remarks: string) => api.post(`/dealer-requests/${id}/reject`, { remarks }).then((r) => r.data as { success: boolean; data: DealerAuthRequestRow; message?: string });
