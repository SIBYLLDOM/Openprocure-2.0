import api from './api';

// Tenders > Tender Tracker — see backend/controllers/tenderTrackerController.js.

export interface TenderTrackerRow {
  tender_no: string;
  source: 'gem' | 'open';
  state: string | null;
  location: string | null;
  dept: string | null;
  customer_name: string | null;
  title: string | null;
  due_date: string | null;
  start_date: string | null;
  emd_amount: string | null;
  fy_year: string | null;
  zh: string | null;
  flsp: string | null;
  db_ho_dp_np: string | null;
  db_name: string | null;
  sap_material_code: string | null;
  emd_override: string | null;
  final_remarks: string | null;
  zm: string | null;
  ho_person: string | null;
  zone: string | null;
  feedback_response: string | null;
}

export interface TenderTrackerParams {
  page?: number; limit?: number; search?: string; dept?: string; source?: string; remarks?: string;
}

export const getTenderTracker = (params: TenderTrackerParams) =>
  api.get('/tender-tracker', { params }).then((r) => r.data as { success: boolean; data: TenderTrackerRow[]; total: number; page: number; limit: number; totalPages: number });

export const getRemarkOptions = () => api.get('/tender-tracker/remark-options').then((r) => r.data as { success: boolean; data: string[] });

export interface TenderTrackerOverridePayload {
  tenderNo: string; source: 'gem' | 'open';
  zh?: string; flsp?: string; dbHoDpNp?: string; dbName?: string; sapMaterialCode?: string;
  emdOverride?: string; finalRemarks?: string; zm?: string; hoPerson?: string; zone?: string; feedbackResponse?: string;
}

export const saveTenderTrackerOverride = (payload: TenderTrackerOverridePayload) =>
  api.put('/tender-tracker/override', payload).then((r) => r.data as { success: boolean });

export const exportTenderTrackerCsv = async (params: TenderTrackerParams) => {
  const r = await api.get('/tender-tracker/export', { params, responseType: 'blob' });
  const url = URL.createObjectURL(r.data as Blob);
  const a = document.createElement('a');
  a.href = url; a.download = `tender_tracker_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};
