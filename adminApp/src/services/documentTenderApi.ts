import api from './api';

// Tenders > Offline Tender — see backend/controllers/documentTenderController.js.

export interface DocumentTenderResult {
  id: number | null;
  tenderRef: string;
  source: 'gem' | 'open';
  division: string | null;
  extracted: Record<string, unknown>;
}

export const createTenderFromDocuments = (formData: FormData) =>
  api.post('/document-tender', formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 180000 })
    .then((r) => r.data as { success: boolean; data: DocumentTenderResult; message?: string });
