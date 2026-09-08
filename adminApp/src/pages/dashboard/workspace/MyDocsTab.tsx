import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, StickyNote, Loader2 } from 'lucide-react';
import { getMyDocs, createMyDoc, updateMyDoc, deleteMyDoc } from '../../../services/workspaceApi';
import type { MyDocRow } from '../../../services/workspaceApi';
import { Button } from '../../../components/ui';
import { useToast } from '../../../context/ToastContext';

// Tender Hub > My Docs — a lightweight per-tender notes/draft space,
// autosaved on pause. Simpler than the original's editor (which was backed
// by a much larger doc-prep-linked system), but same core idea: freeform
// working notes tied to this tender.
const MyDocsTab = ({ bidUrlId }: { bidUrlId: string }) => {
  const { show } = useToast();
  const [docs, setDocs] = useState<MyDocRow[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = (selectFirst = false) => {
    setLoading(true);
    getMyDocs(bidUrlId).then((r) => {
      setDocs(r.data);
      if (selectFirst && r.data.length > 0) selectDoc(r.data[0]);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(true); }, [bidUrlId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectDoc = (doc: MyDocRow) => {
    setActiveId(doc.id);
    setTitle(doc.title);
    setContent(doc.content || '');
  };

  const addDoc = async () => {
    try {
      const r = await createMyDoc(bidUrlId);
      setDocs((prev) => [r.data, ...prev]);
      selectDoc(r.data);
    } catch { show('Failed to create document.', 'error'); }
  };

  const removeDoc = async (id: number) => {
    try {
      await deleteMyDoc(bidUrlId, id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
      if (activeId === id) setActiveId(null);
    } catch { show('Failed to delete.', 'error'); }
  };

  const scheduleSave = (nextTitle: string, nextContent: string) => {
    if (!activeId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await updateMyDoc(bidUrlId, activeId, { title: nextTitle, content: nextContent });
        setDocs((prev) => prev.map((d) => (d.id === activeId ? { ...d, title: nextTitle, content: nextContent } : d)));
      } catch { show('Failed to save.', 'error'); } finally { setSaving(false); }
    }, 800);
  };

  if (loading) return <p className="text-sm text-gray-400">Loading My Docs…</p>;

  const activeDoc = docs.find((d) => d.id === activeId);

  return (
    <div className="grid lg:grid-cols-[240px_1fr] gap-4">
      <div className="rounded-xl border border-gray-100 bg-white overflow-hidden flex flex-col">
        <div className="p-3 border-b border-gray-50">
          <Button size="sm" className="w-full" icon={Plus} onClick={addDoc}>New Document</Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {docs.length === 0 ? (
            <p className="text-xs text-gray-400 p-4 text-center">No documents yet.</p>
          ) : (
            docs.map((doc) => (
              <button
                key={doc.id}
                onClick={() => selectDoc(doc)}
                className={`w-full text-left px-3.5 py-2.5 border-b border-gray-50 flex items-center justify-between gap-2 group ${activeId === doc.id ? 'bg-primary-50' : 'hover:bg-gray-50'}`}
              >
                <span className={`flex items-center gap-2 text-sm truncate ${activeId === doc.id ? 'font-semibold text-primary-700' : 'text-gray-700'}`}>
                  <StickyNote size={13} className="flex-shrink-0" /> {doc.title}
                </span>
                <Trash2 size={13} onClick={(e) => { e.stopPropagation(); removeDoc(doc.id); }} className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-danger-600" />
              </button>
            ))
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-5">
        {!activeDoc ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-400 py-16">Select or create a document to start writing.</div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <input
                value={title}
                onChange={(e) => { setTitle(e.target.value); scheduleSave(e.target.value, content); }}
                className="text-lg font-bold text-gray-900 flex-1 outline-none"
                placeholder="Untitled document"
              />
              {saving && <span className="flex items-center gap-1 text-xs text-gray-400"><Loader2 size={12} className="animate-spin" /> Saving…</span>}
            </div>
            <textarea
              value={content}
              onChange={(e) => { setContent(e.target.value); scheduleSave(title, e.target.value); }}
              placeholder="Start writing your notes…"
              className="w-full min-h-[420px] resize-y outline-none text-sm text-gray-800 leading-relaxed"
            />
          </>
        )}
      </div>
    </div>
  );
};

export default MyDocsTab;
