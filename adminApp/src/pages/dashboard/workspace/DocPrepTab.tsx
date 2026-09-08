import { useEffect, useState } from 'react';
import { Sparkles, FileText, Download, RotateCcw, AlertTriangle, CheckCircle2, Circle, PenLine } from 'lucide-react';
import {
  getDocPrepSession, analyzeDocPrep, draftAnnexure, updateAnnexureStatus, resetDocPrep, downloadAnnexureExport,
} from '../../../services/workspaceApi';
import type { Annexure, DocPrepSession } from '../../../services/workspaceApi';
import { Button, Modal } from '../../../components/ui';
import { useToast } from '../../../context/ToastContext';

const STATUS_STYLE: Record<Annexure['status'], string> = {
  pending: 'bg-gray-100 text-gray-600',
  drafted: 'bg-amber-50 text-amber-700',
  done: 'bg-success-50 text-success-700',
};

const DraftPreviewModal = ({ annexure, onClose, onExport }: { annexure: Annexure; onClose: () => void; onExport: () => void }) => (
  <Modal open onClose={onClose} title={annexure.name} size="lg" footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button icon={Download} onClick={onExport}>Export as .doc</Button></>}>
    <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-sm text-gray-800 font-mono bg-gray-50 rounded-lg p-4">
      {annexure.draftContent}
    </div>
  </Modal>
);

// Tender Hub > Doc Prep — AI-assisted document checklist. Analyze detects
// the annexures/supporting documents this tender likely needs (via local
// Ollama); Draft generates ready-to-use text for one. See
// WorkspaceDocPrepSession.js for why this is a scoped-down version of the
// original's much larger drafting pipeline — built so it can grow into that
// once a real local model is online, per the user's explicit direction.
const DocPrepTab = ({ bidUrlId }: { bidUrlId: string }) => {
  const { show } = useToast();
  const [session, setSession] = useState<DocPrepSession | null>(null);
  const [ollamaReady, setOllamaReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [draftingId, setDraftingId] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<Annexure | null>(null);
  const [showReset, setShowReset] = useState(false);

  const load = () => {
    setLoading(true);
    getDocPrepSession(bidUrlId).then((r) => { setSession(r.data); setOllamaReady(r.ollamaReady); }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [bidUrlId]); // eslint-disable-line react-hooks/exhaustive-deps

  const analyze = async () => {
    setAnalyzing(true);
    try {
      const r = await analyzeDocPrep(bidUrlId);
      setSession(r.data);
      show('Document checklist generated.', 'success');
    } catch (err: any) {
      show(err?.response?.data?.message || 'Analysis failed.', 'error');
    } finally { setAnalyzing(false); }
  };

  const draft = async (annexureId: string) => {
    setDraftingId(annexureId);
    try {
      const r = await draftAnnexure(bidUrlId, annexureId);
      setSession((prev) => prev ? { ...prev, annexures: prev.annexures.map((a) => (a.id === annexureId ? r.data : a)) } : prev);
      show('Draft generated.', 'success');
    } catch (err: any) {
      show(err?.response?.data?.message || 'Drafting failed.', 'error');
    } finally { setDraftingId(null); }
  };

  const markDone = async (annexure: Annexure) => {
    const next = annexure.status === 'done' ? 'pending' : 'done';
    try {
      await updateAnnexureStatus(bidUrlId, annexure.id, { status: next });
      setSession((prev) => prev ? { ...prev, annexures: prev.annexures.map((a) => (a.id === annexure.id ? { ...a, status: next } : a)) } : prev);
    } catch { show('Failed to update.', 'error'); }
  };

  const doReset = async () => {
    try {
      const r = await resetDocPrep(bidUrlId);
      setSession(r.data);
      show('Doc Prep reset.', 'success');
    } catch { show('Reset failed.', 'error'); } finally { setShowReset(false); }
  };

  if (loading) return <p className="text-sm text-gray-400">Loading Doc Prep…</p>;

  const annexures = session?.annexures || [];

  return (
    <div className="space-y-5">
      {!ollamaReady && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-800">Local AI model not detected</p>
            <p className="text-xs text-amber-700 mt-0.5">Analyze and Draft need a local Ollama model pulled and running. They'll work automatically once one is available — no other setup needed here.</p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-100 bg-white p-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold text-gray-900">Document Checklist</h2>
          <p className="text-xs text-gray-500 mt-0.5">AI-detected supporting documents this tender likely requires.</p>
        </div>
        <div className="flex items-center gap-2">
          {annexures.length > 0 && (
            <Button size="sm" variant="secondary" icon={RotateCcw} onClick={() => setShowReset(true)}>Reset</Button>
          )}
          <Button size="sm" icon={Sparkles} loading={analyzing} onClick={analyze}>{annexures.length > 0 ? 'Re-Analyze' : 'Analyze Tender'}</Button>
        </div>
      </div>

      {annexures.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-white py-16 text-center text-sm text-gray-400">
          Click "Analyze Tender" to generate a document checklist for this tender.
        </div>
      ) : (
        <div className="rounded-xl border border-gray-100 bg-white divide-y divide-gray-50">
          {annexures.map((a) => (
            <div key={a.id} className="p-4 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <button onClick={() => markDone(a)} className={a.status === 'done' ? 'text-success-600 mt-0.5' : 'text-gray-300 mt-0.5'}>
                  {a.status === 'done' ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                </button>
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${a.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{a.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{a.description}</p>
                  <span className={`inline-block mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLE[a.status]}`}>{a.status}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {a.draftContent ? (
                  <>
                    <Button size="sm" variant="secondary" onClick={() => setPreviewing(a)}>View Draft</Button>
                    <Button size="sm" variant="secondary" icon={Download} onClick={() => downloadAnnexureExport(bidUrlId, a.id, a.name)} />
                  </>
                ) : (
                  <Button size="sm" icon={PenLine} loading={draftingId === a.id} onClick={() => draft(a.id)}>Draft</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {previewing && (
        <DraftPreviewModal
          annexure={previewing}
          onClose={() => setPreviewing(null)}
          onExport={() => downloadAnnexureExport(bidUrlId, previewing.id, previewing.name)}
        />
      )}

      {showReset && (
        <Modal open onClose={() => setShowReset(false)} title="Reset Doc Prep?" size="sm"
          footer={<><Button variant="secondary" onClick={() => setShowReset(false)}>Cancel</Button><Button variant="danger" onClick={doReset}>Reset</Button></>}>
          <p className="text-sm text-gray-600 flex items-start gap-2">
            <FileText size={16} className="text-danger-500 flex-shrink-0 mt-0.5" />
            This clears the whole document checklist and any drafts for this tender. Tasks, departments, and deadlines are not affected.
          </p>
        </Modal>
      )}
    </div>
  );
};

export default DocPrepTab;
