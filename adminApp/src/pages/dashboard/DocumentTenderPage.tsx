import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { UploadCloud, FileText, X, CheckCircle2 } from 'lucide-react';
import { createTenderFromDocuments } from '../../services/documentTenderApi';
import type { DocumentTenderResult } from '../../services/documentTenderApi';
import { Button } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { usePageHeader } from '../../context/PageHeaderContext';

const SOURCE_OPTIONS = [{ value: 'auto', label: "Let it decide" }, { value: 'gem', label: 'GeM' }, { value: 'open', label: 'Open Tender' }];
const DIVISION_OPTIONS = [{ value: 'auto', label: "Let it decide" }, { value: 'endo', label: 'EndoSurgery' }, { value: 'diagno', label: 'Diagnostic' }, { value: 'both', label: 'Both' }];

// Tenders > Offline Tender — clone of the AUTOMATION SITE reference's
// "Document Tender" upload page. See backend/controllers/documentTenderController.js
// for the scope this was deliberately trimmed to (no scanned-PDF OCR
// pipeline — only PDFs with a real text layer, .docx, .txt/.csv).
const DocumentTenderPage = () => {
  usePageHeader('Offline Tender', 'Create a tender record directly from documents you already have.');
  const { show } = useToast();
  const navigate = useNavigate();
  const { name, id } = useParams();
  const base = `/${window.location.pathname.split('/')[1]}/${name}/${id}/tenders`;

  const [files, setFiles] = useState<File[]>([]);
  const [tenderRef, setTenderRef] = useState('');
  const [source, setSource] = useState('auto');
  const [division, setDivision] = useState('auto');
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<DocumentTenderResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles((f) => [...f, ...Array.from(list)]);
  };
  const removeFile = (idx: number) => setFiles((f) => f.filter((_, i) => i !== idx));

  const submit = async () => {
    if (!files.length) { show('Please attach at least one document.', 'error'); return; }
    setSubmitting(true);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      if (tenderRef) fd.append('tenderRef', tenderRef);
      fd.append('source', source);
      fd.append('division', division);
      const r = await createTenderFromDocuments(fd);
      setResult(r.data);
      show('Tender created from documents.', 'success');
    } catch (err: any) {
      show(err?.response?.data?.message || 'Failed to create tender from documents.', 'error');
    } finally { setSubmitting(false); }
  };

  const reset = () => { setFiles([]); setTenderRef(''); setSource('auto'); setDivision('auto'); setResult(null); };

  if (result) {
    return (
      <div className="max-w-xl mx-auto rounded-2xl border border-gray-100 bg-white p-8 text-center space-y-4">
        <CheckCircle2 size={40} className="mx-auto text-success-500" />
        <h2 className="text-lg font-bold text-gray-900">Tender created</h2>
        <p className="text-sm text-gray-500">
          <span className="font-semibold">{result.tenderRef}</span> was saved as a{' '}
          <span className="font-semibold uppercase">{result.source}</span> tender
          {result.division ? <> under <span className="font-semibold capitalize">{result.division}</span></> : null}.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button variant="secondary" onClick={reset}>Add Another</Button>
          {result.source === 'gem' && (
            <Button onClick={() => navigate(`${base}/${result.tenderRef.split('/').join('_')}`)}>View Tender</Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
        onClick={() => fileRef.current?.click()}
        className={`rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors ${dragOver ? 'border-primary-400 bg-primary-50/40' : 'border-gray-200 hover:border-primary-300'}`}
      >
        <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.txt,.csv" className="hidden" onChange={(e) => addFiles(e.target.files)} />
        <UploadCloud size={30} className="mx-auto text-gray-300 mb-3" />
        <p className="text-sm font-semibold text-gray-600">Click to select or drop tender documents here</p>
        <p className="text-xs text-gray-400 mt-1">PDF (with real text, not scanned), DOCX, TXT or CSV — up to 10 files, 30MB each</p>
      </div>

      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((f, idx) => (
            <div key={idx} className="rounded-lg border border-gray-100 p-2.5 flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-gray-800 truncate"><FileText size={14} className="text-gray-400 flex-shrink-0" /> {f.name}</span>
              <button type="button" onClick={() => removeFile(idx)} className="p-1 text-gray-400 hover:text-danger-600 flex-shrink-0"><X size={14} /></button>
            </div>
          ))}
        </div>
      )}

      <div>
        <label className="label">Tender ID / Reference Number (optional)</label>
        <input className="input" value={tenderRef} onChange={(e) => setTenderRef(e.target.value)} placeholder="Leave blank to extract it from the documents" />
      </div>

      <div>
        <label className="label">Source</label>
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 p-1 w-fit">
          {SOURCE_OPTIONS.map((o) => (
            <button key={o.value} type="button" onClick={() => setSource(o.value)} className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${source === o.value ? 'bg-primary-950 text-white' : 'text-gray-600'}`}>{o.label}</button>
          ))}
        </div>
      </div>

      <div>
        <label className="label">Division</label>
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 p-1 w-fit">
          {DIVISION_OPTIONS.map((o) => (
            <button key={o.value} type="button" onClick={() => setDivision(o.value)} className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${division === o.value ? 'bg-primary-950 text-white' : 'text-gray-600'}`}>{o.label}</button>
          ))}
        </div>
      </div>

      <Button className="w-full" loading={submitting} disabled={!files.length} onClick={submit}>Create Tender from Documents</Button>
    </div>
  );
};

export default DocumentTenderPage;
