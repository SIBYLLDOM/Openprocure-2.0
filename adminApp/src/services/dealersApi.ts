import api from './api';

// Thin wrapper around /api/dealers — the real dealer report plus this
// partner's own distributor list. The cross-tenant "Request Authorization"
// workflow lives in dealerAuthRequestApi.ts instead.

export interface ContractDealerRow {
  sellerName: string;
  sellerState: string | null;
  sellerLocation: string | null;
  sellerContactNo: string | null;
  sellerEmail: string | null;
  dept: string | null;
  contractCount: number;
  totalValue: number;
}

export interface DealerReportParams {
  page?: number; limit?: number; search?: string; state?: string; dept?: string;
  category?: string; contractDateFrom?: string; contractDateTo?: string; sort?: string;
}

export const getContractDealers = (params: DealerReportParams) =>
  api.get('/dealers/report', { params }).then((r) => r.data as { success: boolean; data: ContractDealerRow[]; total: number; page: number; limit: number; totalPages: number });

export const getDealerSuggestions = (q: string) =>
  api.get('/dealers/report/suggestions', { params: { q } }).then((r) => r.data as { success: boolean; data: string[] });

export const getDealerStates = () =>
  api.get('/dealers/report/states').then((r) => r.data as { success: boolean; data: string[] });

export const getDealerCategories = () =>
  api.get('/dealers/report/categories').then((r) => r.data as { success: boolean; data: string[] });

export interface DealerContractRow {
  contract_no: string | null; contract_date: string | null; hospital_name: string | null; hospital_state: string | null;
  category_name: string | null; product: string | null; ordered_quantity: string | null; total_value: string | null; order_status: string | null;
}
export const getDealerContracts = (sellerName: string) =>
  api.get('/dealers/report/contracts', { params: { seller_name: sellerName } }).then((r) => r.data as { success: boolean; data: DealerContractRow[] });

// ---- Your own distributor network (used by Authorization Letter) ----

export interface DistributorRow {
  id: number;
  companyName: string;
  personName: string | null;
  contactNo: string | null;
  email: string | null;
  cityName: string | null;
  state: string | null;
  registrationDate: string | null;
  status: 'Active' | 'Inactive';
  createdAt: string;
}

export const getDistributors = (params: { search?: string; state?: string; status?: string; sort?: string }) =>
  api.get('/dealers/distributors', { params }).then((r) => r.data as { success: boolean; data: DistributorRow[] });

export const getDistributorStates = () =>
  api.get('/dealers/distributors/states').then((r) => r.data as { success: boolean; data: string[] });

export const createDistributor = (payload: Partial<DistributorRow> & { companyName: string }) =>
  api.post('/dealers/distributors', payload).then((r) => r.data as { success: boolean; data: DistributorRow });

export const updateDistributor = (id: number, payload: Partial<DistributorRow>) =>
  api.patch(`/dealers/distributors/${id}`, payload).then((r) => r.data as { success: boolean; data: DistributorRow });

export const deleteDistributor = (id: number) =>
  api.delete(`/dealers/distributors/${id}`).then((r) => r.data as { success: boolean });

export const importDistributors = (rows: Record<string, unknown>[]) =>
  api.post('/dealers/distributors/import', { rows }).then((r) => r.data as { success: boolean; imported: number; skipped: number });
