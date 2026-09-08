import api from './api';

// Thin wrapper around /api/orders — clones of the automation site's
// "Order Management" pair (GeM Contracts list + Carting Dashboard), both
// derived from the migrated `contracts` table (see backend/controllers/ordersController.js).

export interface ContractRow {
  id: number;
  contract_no: string | null;
  bid_no: string | null;
  buying_mode: string | null;
  order_status: string | null;
  contract_date: string | null;
  zonal_head: string | null;
  hospital_name: string | null;
  hospital_state: string | null;
  organization_name: string | null;
  seller_name: string | null;
  seller_state: string | null;
  meril_db: string | null;
  category_name: string | null;
  decode_code: string | null;
  meril_or_others: string | null;
  company_name: string | null;
  ordered_quantity: string | null;
  unit_price: string | null;
  total_value: string | null;
  download_link: string | null;
  dept: string | null;
}

export interface GemContractsParams {
  page?: number;
  limit?: number;
  search?: string;
  state?: string;
  dept?: string;
  category?: string;
  buyingMode?: string;
  contractDateFrom?: string;
  contractDateTo?: string;
  sort?: string;
}

export const getGemContracts = (params: GemContractsParams) =>
  api.get('/orders/gem-contracts', { params }).then((r) => r.data as { success: boolean; data: ContractRow[]; total: number; totalValue: number; page: number; limit: number; totalPages: number });

export const getContractCategories = () =>
  api.get('/orders/gem-contracts/categories').then((r) => r.data as { success: boolean; data: string[] });

export const getContractStates = () =>
  api.get('/orders/gem-contracts/states').then((r) => r.data as { success: boolean; data: string[] });

export interface CartingParams {
  buyingMode?: string;
  dept?: string;
  month?: string;
  year?: string;
  seller?: string;
  state?: string;
  category?: string;
}

export const getCartingSellers = () => api.get('/orders/carting/sellers').then((r) => r.data as { success: boolean; data: string[] });
export const getCartingStates = () => api.get('/orders/carting/states').then((r) => r.data as { success: boolean; data: string[] });
export const getCartingCategories = (department?: string) =>
  api.get('/orders/carting/categories', { params: { department } }).then((r) => r.data as { success: boolean; data: string[] });

export const getCartingKpi = (params: CartingParams) =>
  api.get('/orders/carting/kpi', { params }).then((r) => r.data as { success: boolean; data: { total: number; meril: number; others: number } });

export const getCartingPivot = (params: CartingParams) =>
  api.get('/orders/carting/pivot', { params }).then((r) => r.data as { success: boolean; data: { state: string; month: string | null; total: number; meril: number; others: number }[] });

export const getCartingMap = (params: CartingParams) =>
  api.get('/orders/carting/map', { params }).then((r) => r.data as { success: boolean; data: { state: string; total: number; meril: number; others: number }[] });
