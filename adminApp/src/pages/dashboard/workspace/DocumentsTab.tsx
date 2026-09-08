import { useEffect, useRef, useState } from 'react';
import { Upload, Download, Trash2, FileText, ExternalLink } from 'lucide-react';
import { getTenderDetails } from '../../../services/tenderApi';
import {
  getWorkspaceDocuments, uploadWorkspaceDocument, deleteWorkspaceDocument, downloadWorkspaceDocument,
} from '../../../services/workspaceApi';
import type { WorkspaceDocumentRow } from '../../../services/workspaceApi';
import { Button } from '../../../components/ui';
import { useToast } from '../../../context/ToastContext';

const formatSize = (bytes: number | null) => {
  if (!bytes) return '—';
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
};

// Tender Hub > Documents — official scraped GeM documents (read-only, same
// data the Tender Details page already parses) plus files the partner adds
// themselves for this tender.
const DocumentsTab = ({ bidUrlId }: { bidUrlId: string }) => {
  const { show } = useToast();
  const [officialDocs, setOfficialDocs] = useState<{ label: string; url: string }[]>([]);
  const [docs, setDocs] = useState<WorkspaceDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      getTenderDetails(bidUrlId).then((r) => setOfficialDocs(r.data.documents || [])).catch(() => {}),
      getWorkspaceDocuments(bidUrlId).then((r) => setDocs(r.data)),
    ]).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [bidUrlId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      await uploadWorkspaceDocument(bidUrlId, file);
      show('Document uploaded.', 'success');
      load();
    } catch (err: any) {
      show(err?.response?.data?.message || 'Upload failed.', 'error');
    } finally { setUploading(false); }
  };

  const remove = async (id: number) => {
    try { await deleteWorkspaceDocument(bidUrlId, id); setDocs((prev) => prev.filter((d) => d.id !== id)); } catch { show('Failed to delete.', 'error'); }
  };

  if (loading) return <p className="text-sm text-gray-400">Loading documents…</p>;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
        <h2 className="px-5 pt-5 pb-3 text-[13px] font-bold text-gray-900">Official Tender Documents</h2>
        {officialDocs.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-gray-400">No official documents found for this tender.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {officialDocs.map((doc, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <span className="flex items-center gap-2 text-sm font-semibold text-gray-800"><FileText size={15} className="text-primary-500" /> {doc.label}</span>
                <a href={doc.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-primary-700 hover:underline"><ExternalLink size={13} /> Open</a>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-[13px] font-bold text-gray-900">Your Documents</h2>
          <Button size="sm" icon={Upload} loading={uploading} onClick={() => fileInputRef.current?.click()}>Add Document</Button>
          <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }} />
        </div>
        {docs.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-gray-400">No documents added yet.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {docs.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{doc.name}</p>
                  <p className="text-xs text-gray-400">{formatSize(doc.fileSize)} · {new Date(doc.createdAt).toLocaleDateString('en-IN')}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => downloadWorkspaceDocument(bidUrlId, doc.id, doc.name)} className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-md"><Download size={14} /></button>
                  <button onClick={() => remove(doc.id)} className="p-1.5 text-gray-400 hover:text-danger-600 hover:bg-danger-50 rounded-md"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentsTab;
