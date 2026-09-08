import api from './api';

// Thin wrapper around /api/workspace/:bidNumber/* — the Tender Hub that
// opens from Active Workspaces' "Open Workspace" button.

export interface WorkspaceOverview {
  tender: { bidNumber: string; title: string | null; department: string | null; dept: string | null; state: string | null; endDate: string | null; bidValue: string | null; status: string | null };
  summary: { departments: number; totalTasks: number; tasksDone: number; documents: number; myDocs: number };
  timeline: { type: string; label: string; detail: string | null; at: string }[];
}

export const getWorkspaceOverview = (bidUrlId: string) =>
  api.get(`/workspace/${bidUrlId}/overview`).then((r) => r.data as { success: boolean; data: WorkspaceOverview });

export interface WorkspaceDepartmentRow { id: number; name: string; }
export const getDepartments = (bidUrlId: string) => api.get(`/workspace/${bidUrlId}/departments`).then((r) => r.data as { success: boolean; data: WorkspaceDepartmentRow[] });
export const createDepartment = (bidUrlId: string, name: string) => api.post(`/workspace/${bidUrlId}/departments`, { name }).then((r) => r.data);
export const renameDepartment = (bidUrlId: string, id: number, name: string) => api.patch(`/workspace/${bidUrlId}/departments/${id}`, { name }).then((r) => r.data);
export const deleteDepartment = (bidUrlId: string, id: number) => api.delete(`/workspace/${bidUrlId}/departments/${id}`).then((r) => r.data);

export interface WorkspaceTaskRow {
  id: number; departmentId: number | null; assignedContactId: number | null;
  title: string; status: 'todo' | 'in_progress' | 'done'; dueDate: string | null; createdAt: string;
}
export const getTasks = (bidUrlId: string) => api.get(`/workspace/${bidUrlId}/tasks`).then((r) => r.data as { success: boolean; data: WorkspaceTaskRow[] });
export const createTask = (bidUrlId: string, payload: Partial<WorkspaceTaskRow> & { title: string }) => api.post(`/workspace/${bidUrlId}/tasks`, payload).then((r) => r.data);
export const updateTask = (bidUrlId: string, id: number, payload: Partial<WorkspaceTaskRow>) => api.patch(`/workspace/${bidUrlId}/tasks/${id}`, payload).then((r) => r.data);
export const deleteTask = (bidUrlId: string, id: number) => api.delete(`/workspace/${bidUrlId}/tasks/${id}`).then((r) => r.data);

export interface WorkspaceDeadlineRow { id: number; title: string; dueDate: string; }
export const getDeadlines = (bidUrlId: string) => api.get(`/workspace/${bidUrlId}/deadlines`).then((r) => r.data as { success: boolean; data: WorkspaceDeadlineRow[] });
export const createDeadline = (bidUrlId: string, title: string, dueDate: string) => api.post(`/workspace/${bidUrlId}/deadlines`, { title, dueDate }).then((r) => r.data);
export const deleteDeadline = (bidUrlId: string, id: number) => api.delete(`/workspace/${bidUrlId}/deadlines/${id}`).then((r) => r.data);

export interface WorkspaceDocumentRow { id: number; name: string; fileSize: number | null; mimeType: string | null; createdAt: string; }
export const getWorkspaceDocuments = (bidUrlId: string) => api.get(`/workspace/${bidUrlId}/documents`).then((r) => r.data as { success: boolean; data: WorkspaceDocumentRow[] });
export const uploadWorkspaceDocument = (bidUrlId: string, file: File) => {
  const fd = new FormData();
  fd.append('file', file);
  return api.post(`/workspace/${bidUrlId}/documents`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
};
export const deleteWorkspaceDocument = (bidUrlId: string, id: number) => api.delete(`/workspace/${bidUrlId}/documents/${id}`).then((r) => r.data);
export const downloadWorkspaceDocument = async (bidUrlId: string, id: number, name: string) => {
  const r = await api.get(`/workspace/${bidUrlId}/documents/${id}/download`, { responseType: 'blob' });
  const url = URL.createObjectURL(r.data as Blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};

export interface MyDocRow { id: number; title: string; content: string | null; updatedAt: string; }
export const getMyDocs = (bidUrlId: string) => api.get(`/workspace/${bidUrlId}/mydocs`).then((r) => r.data as { success: boolean; data: MyDocRow[] });
export const createMyDoc = (bidUrlId: string, title?: string) => api.post(`/workspace/${bidUrlId}/mydocs`, { title }).then((r) => r.data as { success: boolean; data: MyDocRow });
export const updateMyDoc = (bidUrlId: string, id: number, payload: { title?: string; content?: string }) => api.patch(`/workspace/${bidUrlId}/mydocs/${id}`, payload).then((r) => r.data);
export const deleteMyDoc = (bidUrlId: string, id: number) => api.delete(`/workspace/${bidUrlId}/mydocs/${id}`).then((r) => r.data);

export interface Annexure { id: string; name: string; description: string; status: 'pending' | 'drafted' | 'done'; draftContent: string | null; }
export interface DocPrepSession { id: number; status: 'idle' | 'processing' | 'done' | 'error'; annexures: Annexure[]; errorMessage?: string | null; }

export const getDocPrepSession = (bidUrlId: string) => api.get(`/workspace/${bidUrlId}/doc-prep`).then((r) => r.data as { success: boolean; data: DocPrepSession; ollamaReady: boolean });
export const analyzeDocPrep = (bidUrlId: string) => api.post(`/workspace/${bidUrlId}/doc-prep/analyze`).then((r) => r.data as { success: boolean; data: DocPrepSession; message?: string });
export const draftAnnexure = (bidUrlId: string, annexureId: string) => api.post(`/workspace/${bidUrlId}/doc-prep/${annexureId}/draft`).then((r) => r.data as { success: boolean; data: Annexure; message?: string });
export const updateAnnexureStatus = (bidUrlId: string, annexureId: string, payload: { status?: string; draftContent?: string }) => api.patch(`/workspace/${bidUrlId}/doc-prep/${annexureId}`, payload).then((r) => r.data);
export const resetDocPrep = (bidUrlId: string) => api.post(`/workspace/${bidUrlId}/doc-prep/reset`).then((r) => r.data);
export const exportAnnexureUrl = (bidUrlId: string, annexureId: string) => `${api.defaults.baseURL}/workspace/${bidUrlId}/doc-prep/${annexureId}/export`;
export const downloadAnnexureExport = async (bidUrlId: string, annexureId: string, name: string) => {
  const r = await api.get(`/workspace/${bidUrlId}/doc-prep/${annexureId}/export`, { responseType: 'blob' });
  const url = URL.createObjectURL(r.data as Blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${name}.doc`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};

export interface TeamContact { id: number; name: string | null; designation: string | null; email: string | null; mobile: string | null; }
export const getTeam = (bidUrlId: string) => api.get(`/workspace/${bidUrlId}/team`).then((r) => r.data as { success: boolean; data: TeamContact[] });
