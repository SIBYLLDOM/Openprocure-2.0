import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Folder, FileText, Search, FolderPlus, Upload, Download, Eye, Pencil, Trash2,
  CalendarClock, Home, ChevronRight, Loader2, Stethoscope, Syringe,
} from 'lucide-react';
import {
  getLibraryItems, searchLibrary, createLibraryFolder, uploadLibraryFile,
  renameLibraryItem, updateLibraryExpiry, deleteLibraryItem, downloadLibraryFile, viewLibraryFile,
} from '../../services/workdeskApi';
import type { LibraryItemRow } from '../../services/workdeskApi';
import { Modal, Button } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { usePageHeader } from '../../context/PageHeaderContext';

const formatSize = (bytes: number | null) => {
  if (!bytes) return '—';
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
};

const NewFolderModal = ({ parentId, onClose, onCreated }: { parentId: number; onClose: () => void; onCreated: () => void }) => {
  const { show } = useToast();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const create = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createLibraryFolder(name.trim(), parentId);
      show('Folder created.', 'success');
      onCreated();
    } catch {
      show('Failed to create folder.', 'error');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="New Folder" size="sm" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} disabled={!name.trim()} onClick={create}>Create</Button></>}>
      <label className="label">Folder Name</label>
      <input autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} placeholder="e.g. ISO Certificates" />
    </Modal>
  );
};

const RenameModal = ({ item, onClose, onDone }: { item: LibraryItemRow; onClose: () => void; onDone: () => void }) => {
  const { show } = useToast();
  const [name, setName] = useState(item.name);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await renameLibraryItem(item.id, name.trim());
      show('Renamed.', 'success');
      onDone();
    } catch {
      show('Failed to rename.', 'error');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={`Rename ${item.type}`} size="sm" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} disabled={!name.trim()} onClick={save}>Save</Button></>}>
      <label className="label">Name</label>
      <input autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
    </Modal>
  );
};

const ExpiryModal = ({ item, onClose, onDone }: { item: LibraryItemRow; onClose: () => void; onDone: () => void }) => {
  const { show } = useToast();
  const [date, setDate] = useState(item.expiryDate || '');
  const [saving, setSaving] = useState(false);
  const save = async (clear?: boolean) => {
    setSaving(true);
    try {
      await updateLibraryExpiry(item.id, clear ? null : date || null);
      show(clear ? 'Expiry cleared.' : 'Expiry date saved.', 'success');
      onDone();
    } catch {
      show('Failed to update expiry.', 'error');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Set Expiry Date" size="sm"
      footer={<>
        {item.expiryDate && <Button variant="secondary" loading={saving} onClick={() => save(true)}>Clear</Button>}
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button loading={saving} onClick={() => save(false)}>Save</Button>
      </>}>
      <label className="label">Expiry Date</label>
      <input type="date" autoFocus className="input" value={date} onChange={(e) => setDate(e.target.value)} />
    </Modal>
  );
};

const DeleteConfirmModal = ({ item, onClose, onDone }: { item: LibraryItemRow; onClose: () => void; onDone: () => void }) => {
  const { show } = useToast();
  const [deleting, setDeleting] = useState(false);
  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteLibraryItem(item.id);
      show('Deleted.', 'success');
      onDone();
    } catch {
      show('Failed to delete.', 'error');
    } finally {
      setDeleting(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={`Delete this ${item.type}?`} size="sm" footer={<><Button variant="secondary" onClick={onClose} disabled={deleting}>Cancel</Button><Button variant="danger" loading={deleting} onClick={confirmDelete}>Delete</Button></>}>
      <p className="text-sm text-gray-600">
        {item.type === 'folder'
          ? <>This permanently deletes <strong className="text-gray-900">{item.name}</strong> and everything inside it.</>
          : <>This permanently deletes <strong className="text-gray-900">{item.name}</strong>.</>}
      </p>
    </Modal>
  );
};

// Clone of the automation site's Workdesk > Library — a private per-partner
// document tree (see backend/models/LibraryItem.js for why it's scoped per
// partner instead of the original's shared internal tool), with the same
// two-division root structure, folder navigation, upload, search, rename,
// expiry tracking, and delete.
const LibraryPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const folderId = searchParams.get('folder_id') ? Number(searchParams.get('folder_id')) : null;

  const [items, setItems] = useState<LibraryItemRow[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LibraryItemRow[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [uploading, setUploading] = useState<number | null>(null);

  const [showNewFolder, setShowNewFolder] = useState(false);
  const [renameTarget, setRenameTarget] = useState<LibraryItemRow | null>(null);
  const [expiryTarget, setExpiryTarget] = useState<LibraryItemRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LibraryItemRow | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { show } = useToast();

  const load = () => {
    setLoading(true);
    getLibraryItems(folderId).then((r) => { setItems(r.data); setBreadcrumb(r.breadcrumb); }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [folderId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!query.trim()) { setSearchResults(null); return; }
    setSearching(true);
    const t = setTimeout(() => {
      searchLibrary(query.trim()).then((r) => setSearchResults(r.data)).finally(() => setSearching(false));
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  usePageHeader('Library', breadcrumb.length > 0 ? breadcrumb.map((b) => b.name).join(' / ') : 'Your private document library.');

  const openFolder = (id: number | null) => setSearchParams(id ? { folder_id: String(id) } : {});

  const handleUpload = async (file: File) => {
    if (!folderId) { show('Open a folder before uploading.', 'error'); return; }
    setUploading(0);
    try {
      await uploadLibraryFile(file, folderId, setUploading);
      show('File uploaded.', 'success');
      load();
    } catch (err: any) {
      show(err?.response?.data?.message || 'Upload failed.', 'error');
    } finally {
      setUploading(null);
    }
  };

  const displayItems = searchResults ?? items;
  const isSearchMode = searchResults !== null;

  return (
    <div className="space-y-5">
      {/* Breadcrumb + actions */}
      <div className="rounded-xl border border-gray-100 bg-white p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-sm min-w-0 overflow-x-auto">
          <button onClick={() => openFolder(null)} className="flex items-center gap-1 text-gray-500 hover:text-primary-700 font-semibold flex-shrink-0">
            <Home size={14} /> Root
          </button>
          {breadcrumb.map((b) => (
            <span key={b.id} className="flex items-center gap-1.5 flex-shrink-0">
              <ChevronRight size={13} className="text-gray-300" />
              <button onClick={() => openFolder(b.id)} className="text-gray-600 hover:text-primary-700 font-semibold truncate max-w-[160px]">{b.name}</button>
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {folderId && (
            <>
              <Button size="sm" variant="secondary" icon={FolderPlus} onClick={() => setShowNewFolder(true)}>New Folder</Button>
              <Button size="sm" icon={Upload} loading={uploading !== null} onClick={() => fileInputRef.current?.click()}>
                {uploading !== null ? `Uploading ${uploading}%` : 'Upload File'}
              </Button>
              <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }} />
            </>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search files and folders by name…"
          className="input w-full !pl-9"
        />
        {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />}
      </div>

      {/* Division root cards — only shown at the true root */}
      {!folderId && !isSearchMode && (
        <div className="grid sm:grid-cols-2 gap-4">
          {items.map((item) => {
            const DivIcon = item.division === 'endo' ? Syringe : Stethoscope;
            return (
              <button
                key={item.id}
                onClick={() => openFolder(item.id)}
                className="rounded-xl border border-gray-100 bg-white p-6 flex items-center gap-4 hover:shadow-md hover:border-primary-200 transition-all text-left"
              >
                <div className="w-12 h-12 rounded-2xl bg-primary-50 text-primary-700 flex items-center justify-center flex-shrink-0">
                  <DivIcon size={22} />
                </div>
                <div>
                  <p className="text-base font-bold text-gray-900">{item.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{item.fileCount ?? 0} file{item.fileCount === 1 ? '' : 's'}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Folder contents / search results */}
      {(folderId || isSearchMode) && (
        <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
          {loading && !isSearchMode ? (
            <div className="py-16 text-center text-sm text-gray-400">Loading…</div>
          ) : displayItems.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">{isSearchMode ? 'No matches found.' : 'This folder is empty.'}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-2.5">Name</th>
                    {isSearchMode && <th className="px-4 py-2.5">Location</th>}
                    <th className="px-4 py-2.5">Size</th>
                    <th className="px-4 py-2.5">Expiry</th>
                    <th className="px-4 py-2.5">Modified</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayItems.map((item) => (
                    <tr key={item.id} className="border-t border-gray-50 hover:bg-gray-50/60">
                      <td className="px-4 py-2.5">
                        {item.type === 'folder' ? (
                          <button onClick={() => { setQuery(''); openFolder(item.id); }} className="flex items-center gap-2 font-semibold text-gray-800 hover:text-primary-700">
                            <Folder size={16} className="text-amber-500 flex-shrink-0" /> {item.name}
                          </button>
                        ) : (
                          <span className="flex items-center gap-2 text-gray-800">
                            <FileText size={15} className="text-primary-500 flex-shrink-0" /> {item.name}
                          </span>
                        )}
                      </td>
                      {isSearchMode && <td className="px-4 py-2.5 text-gray-500 text-xs">{item.pathLabel}</td>}
                      <td className="px-4 py-2.5 text-gray-500">{item.type === 'file' ? formatSize(item.fileSize) : `${item.fileCount ?? 0} items`}</td>
                      <td className="px-4 py-2.5">
                        {item.expiry ? (
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${item.expiry.expired ? 'bg-danger-50 text-danger-600' : item.expiry.days <= 30 ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-gray-600'}`}>
                            {item.expiry.expired ? `Expired ${Math.abs(item.expiry.days)}d ago` : `${item.expiry.days}d left`}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">{new Date(item.updatedAt).toLocaleDateString('en-IN')}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          {item.type === 'file' && (
                            <>
                              <button onClick={() => viewLibraryFile(item.id)} title="View" className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-md"><Eye size={14} /></button>
                              <button onClick={() => downloadLibraryFile(item.id, item.name)} title="Download" className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-md"><Download size={14} /></button>
                              <button onClick={() => setExpiryTarget(item)} title="Set expiry" className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-md"><CalendarClock size={14} /></button>
                            </>
                          )}
                          <button onClick={() => setRenameTarget(item)} title="Rename" className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-md"><Pencil size={14} /></button>
                          <button onClick={() => setDeleteTarget(item)} title="Delete" className="p-1.5 text-gray-400 hover:text-danger-600 hover:bg-danger-50 rounded-md"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showNewFolder && folderId && <NewFolderModal parentId={folderId} onClose={() => setShowNewFolder(false)} onCreated={() => { setShowNewFolder(false); load(); }} />}
      {renameTarget && <RenameModal item={renameTarget} onClose={() => setRenameTarget(null)} onDone={() => { setRenameTarget(null); load(); }} />}
      {expiryTarget && <ExpiryModal item={expiryTarget} onClose={() => setExpiryTarget(null)} onDone={() => { setExpiryTarget(null); load(); }} />}
      {deleteTarget && <DeleteConfirmModal item={deleteTarget} onClose={() => setDeleteTarget(null)} onDone={() => { setDeleteTarget(null); load(); }} />}
    </div>
  );
};

export default LibraryPage;
