import api from './api';

// Thin wrapper around /api/tenders/workspaces (Active Workspaces) and
// /api/library (Library) — clones of the automation site's Workdesk pages.

export interface WorkspaceRow {
  bidNumber: string;
  urlId: string;
  title: string;
  dept: string | null;
  state: string | null;
  bidEndDate: string | null;
  hoursLeft: number | null;
  markedAt: string;
  daysSinceMarked: number;
  remarks: string | null;
  status: 'active' | 'urgent' | 'review';
}

export const getActiveWorkspaces = (params: { search?: string; status?: string }) =>
  api.get('/tenders/workspaces', { params }).then((r) => r.data as { success: boolean; data: WorkspaceRow[] });

export interface LibraryItemRow {
  id: number;
  parentId: number | null;
  division: 'diagno' | 'endo' | null;
  type: 'folder' | 'file';
  name: string;
  fileSize: number | null;
  mimeType: string | null;
  expiryDate: string | null;
  fileCount: number | null;
  expiry: { days: number; expired: boolean } | null;
  createdAt: string;
  updatedAt: string;
  pathLabel?: string;
}

export const getLibraryItems = (parentId: number | null) =>
  api.get('/library', { params: parentId ? { parent_id: parentId } : {} })
    .then((r) => r.data as { success: boolean; data: LibraryItemRow[]; breadcrumb: { id: number; name: string }[]; parentId: number | null });

export const searchLibrary = (q: string) =>
  api.get('/library/search', { params: { q } }).then((r) => r.data as { success: boolean; data: LibraryItemRow[] });

export const createLibraryFolder = (name: string, parentId: number) =>
  api.post('/library/folder', { name, parentId }).then((r) => r.data as { success: boolean; data: LibraryItemRow });

export const uploadLibraryFile = (file: File, parentId: number, onProgress?: (pct: number) => void) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('parentId', String(parentId));
  return api.post('/library/file', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => { if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100)); },
  }).then((r) => r.data as { success: boolean; data: LibraryItemRow });
};

export const renameLibraryItem = (id: number, name: string) =>
  api.patch(`/library/${id}`, { name }).then((r) => r.data as { success: boolean; data: LibraryItemRow });

export const updateLibraryExpiry = (id: number, expiryDate: string | null) =>
  api.patch(`/library/${id}/expiry`, { expiryDate }).then((r) => r.data as { success: boolean; data: { expiryDate: string | null } });

export const deleteLibraryItem = (id: number) =>
  api.delete(`/library/${id}`).then((r) => r.data as { success: boolean });

// Downloads/views are behind auth (Bearer token), which a plain <a href>
// can't carry — fetched as a blob through the authenticated axios instance
// instead, then handed to the browser via a throwaway object URL.
async function fetchAsBlobUrl(path: string) {
  const r = await api.get(path, { responseType: 'blob' });
  return URL.createObjectURL(r.data as Blob);
}

export const downloadLibraryFile = async (id: number, name: string) => {
  const url = await fetchAsBlobUrl(`/library/file/${id}/download`);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};

export const viewLibraryFile = async (id: number) => {
  const url = await fetchAsBlobUrl(`/library/file/${id}/view`);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};
