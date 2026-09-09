import api from './api';

// Thin wrapper around /api/tenders (see backend/controllers/tenderController.js)
// — real GeM/Open tender data migrated from the tender-automation system's DB.

export interface TenderRow {
  id?: number;
  bid_number: string;
  url_id: string;
  items: string | null;
  department: string | null;
  organisation_chain?: string | null;
  dept: string | null;
  state: string | null;
  district: string | null;
  start_date: string | null;
  end_date: string | null;
  emd_amount: string | null;
  bid_value: string | null;
  quantity: string | null;
  detail_url: string | null;
  sub_cat?: string | null;
  hours_left: number | null;
  is_interested?: boolean | number;
  has_representation?: boolean | number;
  has_corrigendum?: boolean | number;
}

export interface TenderListParams {
  page?: number;
  limit?: number;
  search?: string;
  state?: string;
  dept?: string;
  status?: 'active' | 'closed' | 'all';
  tenderType?: 'GEM' | 'Open';
  departmentName?: string;
  subCat?: string;
  perfectCat?: 'perfect' | 'all';
  closingFrom?: string;
  closingTo?: string;
  sort?: string;
}

export const getTenders = (params: TenderListParams) =>
  api.get('/tenders', { params }).then((r) => r.data as { success: boolean; source: 'gem' | 'open'; data: TenderRow[]; total: number; page: number; limit: number; totalPages: number });

export const getTenderFilters = () =>
  api.get('/tenders/filters').then((r) => r.data as { success: boolean; states: string[]; departments: string[] });

export interface ParticipatedTenderRow {
  bid_number: string;
  url_id: string;
  state: string | null;
  quantity: string | null;
  start_date: string | null;
  end_date: string | null;
  dept: string | null;
  items: string | null;
  ra_date: string | null;
  remarks: string | null;
}

export interface ParticipatedTenderParams {
  page?: number;
  limit?: number;
  search?: string;
  state?: string;
  dept?: string;
  startDate?: string;
  endDate?: string;
}

export const getParticipatedTenders = (params: ParticipatedTenderParams) =>
  api.get('/tenders/participated', { params }).then((r) => r.data as { success: boolean; data: ParticipatedTenderRow[]; total: number; page: number; limit: number; totalPages: number });

export const updateParticipatedTenderNote = (urlId: string, payload: { raDate?: string | null; remarks?: string | null }) =>
  api.put(`/tenders/${urlId}/participated-note`, payload).then((r) => r.data as { success: boolean; data: { raDate: string | null; remarks: string | null } });

export const getTenderSubCategories = () =>
  api.get('/tenders/subcategories').then((r) => r.data as { success: boolean; subCategories: string[] });

export const getTenderDetails = (urlId: string) =>
  api.get(`/tenders/${urlId}`).then((r) => r.data as { success: boolean; source: 'gem' | 'open'; data: any });

// Per-partner tender actions — see backend/models/TenderPartnerState.js for
// why these live outside the shared gem_tenders row.
export const toggleTenderInterest = (urlId: string) =>
  api.patch(`/tenders/${urlId}/interest`).then((r) => r.data as { success: boolean; isInterested: boolean });

export const setTenderNotRelevant = (urlId: string, payload: { relevant: true } | { relevant: false; reason: string }) =>
  api.patch(`/tenders/${urlId}/not-relevant`, payload).then((r) => r.data as { success: boolean; notRelevant: boolean });

export interface TenderStatusEntry {
  id: number;
  status: 'proceed' | 'win' | 'lose' | 'close';
  remarks: string | null;
  createdAt: string;
}

export const getTenderStatusHistory = (urlId: string) =>
  api.get(`/tenders/${urlId}/status/history`).then((r) => r.data as { success: boolean; data: TenderStatusEntry[] });

export const postTenderStatus = (urlId: string, status: TenderStatusEntry['status'], remarks: string) =>
  api.post(`/tenders/${urlId}/status`, { status, remarks }).then((r) => r.data as { success: boolean; data: TenderStatusEntry });

export interface SuggestedProduct {
  item: string;
  itemCategory: string | null;
  tenderItemName: string | null;
  productCode: string | null;
  productName: string | null;
  relevancyScore: number | null;
  isSelected: boolean;
}

export const getSuggestedProducts = (urlId: string) =>
  api.get(`/tenders/${urlId}/suggestions`).then((r) => r.data as { success: boolean; data: SuggestedProduct[] });

export const selectSuggestedProduct = (urlId: string, item: string, productCode: string) =>
  api.post(`/tenders/${urlId}/suggestions/select`, { item, productCode }).then((r) => r.data as { success: boolean; data: { item: string; productCode: string } });

export const generateSuggestedProducts = (urlId: string) =>
  api.post(`/tenders/${urlId}/suggestions/generate`).then((r) => r.data as { success: boolean; data?: unknown; message?: string });

export interface DashboardStats {
  activeTenders: number;
  closingSoon: number;
  openTenders: number;
  contracts: { count: number; totalValue: number };
  incidents: { total: number; pendingResponse: number };
  deptSplit: { diagno: number; endo: number };
  pipelineValue: number;
  emdLocked: number;
  topStates: { state: string; count: number }[];
  supportTickets: { open: number; inProgress: number; resolved: number; closed: number; total: number };
  distributors: { total: number; active: number };
  resellersCount: number;
  contractsTrend: { month: string; count: number; value: number }[];
  userActivity: {
    activeNow: number;
    loginsToday: number;
    loginsWeek: number;
    avgSessionSeconds: number;
    trend: { day: string; count: number }[];
  };
  topSellers: { sellerName: string; revenue: number; count: number }[];
  upcomingDeadlines: { bid_number: string; url_id: string; title: string; dept: string | null; end_date: string | null; hoursLeft: number | null }[];
  recentActivity: { bid_number: string; url_id: string; title: string; dept: string | null; processing_date: string | null; status: string | null }[];
}

export const getDashboardStats = () =>
  api.get('/tenders/stats/summary').then((r) => r.data as { success: boolean; data: DashboardStats });
