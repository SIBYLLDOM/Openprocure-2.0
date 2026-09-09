import { useEffect, useRef, useState } from 'react';
import { X, Plus, Upload, Download, Trash2, FileText } from 'lucide-react';
import {
  getClient, getAvailableContacts, linkContact, unlinkContact, addShippingDetail, deleteShippingDetail,
  uploadClientAttachment, downloadClientAttachment, deleteClientAttachment, getClientInvoices, resolveLogoUrl,
} from '../../../services/clientsApi';
import type { ClientDetail, AvailableContact } from '../../../services/clientsApi';
import { Button, Select } from '../../../components/ui';
import { useToast } from '../../../context/ToastContext';

type Tab = 'details' | 'contacts' | 'invoices';

const formatSize = (bytes: number | null) => {
  if (!bytes) return '';
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
};

const ClientDetailDrawer = ({ clientId, onClose, onChanged }: { clientId: number; onClose: () => void; onChanged: () => void }) => {
  const { show } = useToast();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('details');
  const [availableContacts, setAvailableContacts] = useState<AvailableContact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [showShippingForm, setShowShippingForm] = useState(false);
  const [shipForm, setShipForm] = useState({ name: '', country: '', state: '', city: '', postalCode: '', streetAddress: '' });
  const [invoices, setInvoices] = useState<unknown[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    getClient(clientId).then((r) => setClient(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); getAvailableContacts().then((r) => setAvailableContacts(r.data)); }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'invoices') getClientInvoices(clientId).then((r) => setInvoices(r.data)); }, [tab, clientId]);

  const doLinkContact = async () => {
    if (!selectedContactId) return;
    try { await linkContact(clientId, Number(selectedContactId)); setSelectedContactId(''); load(); onChanged(); } catch { show('Failed to link contact.', 'error'); }
  };
  const doUnlinkContact = async (linkId: number) => {
    try { await unlinkContact(clientId, linkId); load(); } catch { show('Failed to unlink.', 'error'); }
  };
  const doAddShipping = async () => {
    if (!shipForm.name.trim()) return;
    try { await addShippingDetail(clientId, shipForm); setShipForm({ name: '', country: '', state: '', city: '', postalCode: '', streetAddress: '' }); setShowShippingForm(false); load(); } catch { show('Failed to add shipping detail.', 'error'); }
  };
  const doRemoveShipping = async (id: number) => {
    try { await deleteShippingDetail(clientId, id); load(); } catch { show('Failed to remove.', 'error'); }
  };
  const doUploadAttachment = async (file: File) => {
    try { await uploadClientAttachment(clientId, file); show('Attachment uploaded.', 'success'); load(); } catch { show('Upload failed.', 'error'); }
  };
  const doDeleteAttachment = async (attachmentId: number) => {
    try { await deleteClientAttachment(clientId, attachmentId); load(); } catch { show('Failed to delete.', 'error'); }
  };

  const linkedIds = new Set((client?.contactLinks || []).map((l) => l.contact.id));
  const unlinkedContacts = availableContacts.filter((c) => !linkedIds.has(c.id));

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-2xl h-full bg-white shadow-2xl overflow-y-auto">
        {loading || !client ? (
          <div className="py-20 text-center text-sm text-gray-400">Loading…</div>
        ) : (
          <>
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 z-10">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-gray-900">{client.businessName}</h2>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => show('No invoicing system yet — statements will be available once invoices exist.', 'error')}>View Statement</Button>
                  <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
                </div>
              </div>
              <div className="flex gap-1 mt-3">
                {(['details', 'contacts', 'invoices'] as Tab[]).map((t) => (
                  <button key={t} onClick={() => setTab(t)} className={`px-3.5 py-2 rounded-lg text-sm font-semibold capitalize transition-colors ${tab === t ? 'bg-primary-950 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                    {t === 'details' ? 'Client Details' : t}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-6">
              {tab === 'details' && (
                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-xl bg-primary-50 text-primary-700 font-bold text-xl flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {client.logoPath ? <img src={resolveLogoUrl(client.logoPath)!} alt="" className="w-full h-full object-cover" /> : client.businessName.charAt(0)}
                    </div>
                    <div>
                      <p className="text-base font-bold text-gray-900">{client.businessName}</p>
                      <p className="text-xs text-gray-500">{client.clientKind}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] font-bold text-gray-500 uppercase">Address</label>
                      <p className="text-sm text-gray-800 mt-1">{[client.city, client.country].filter(Boolean).join(', ') || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-gray-500 uppercase">Unique Key</label>
                      <p className="text-sm text-gray-800 mt-1 font-mono">{client.uniqueKey}</p>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-gray-500 uppercase">Alias</label>
                      <p className="text-sm text-gray-800 mt-1">{client.businessAlias || '-'}</p>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-gray-500 uppercase">Created On</label>
                      <p className="text-sm text-gray-800 mt-1">{new Date(client.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[11px] font-bold text-gray-500 uppercase mb-2">Tax Information</h3>
                    <div className="grid grid-cols-3 gap-4 rounded-lg border border-gray-100 p-3">
                      <div><label className="text-[10px] text-gray-400 uppercase">GSTIN</label><p className="text-sm text-gray-800">{client.gstin || 'N/A'}</p></div>
                      <div><label className="text-[10px] text-gray-400 uppercase">PAN</label><p className="text-sm text-gray-800">{client.pan || 'N/A'}</p></div>
                      <div><label className="text-[10px] text-gray-400 uppercase">Client Type</label><p className="text-sm text-gray-800">{client.clientType}</p></div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[11px] font-bold text-gray-500 uppercase mb-2">Address</h3>
                    <p className="text-sm text-gray-800 rounded-lg border border-gray-100 p-3">
                      {[client.streetAddress, client.city, client.state, client.postalCode, client.country].filter(Boolean).join(', ') || 'No address on file.'}
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-[11px] font-bold text-gray-500 uppercase">Shipping Details</h3>
                      <button onClick={() => setShowShippingForm((o) => !o)} className="text-xs font-semibold text-primary-600 hover:underline flex items-center gap-1"><Plus size={12} /> Add Shipping Details</button>
                    </div>
                    {showShippingForm && (
                      <div className="rounded-lg border border-gray-100 p-3 mb-2 grid grid-cols-2 gap-2">
                        <input className="input !py-1.5 !text-sm" placeholder="Name" value={shipForm.name} onChange={(e) => setShipForm({ ...shipForm, name: e.target.value })} />
                        <input className="input !py-1.5 !text-sm" placeholder="Country" value={shipForm.country} onChange={(e) => setShipForm({ ...shipForm, country: e.target.value })} />
                        <input className="input !py-1.5 !text-sm" placeholder="City" value={shipForm.city} onChange={(e) => setShipForm({ ...shipForm, city: e.target.value })} />
                        <input className="input !py-1.5 !text-sm" placeholder="Postal Code" value={shipForm.postalCode} onChange={(e) => setShipForm({ ...shipForm, postalCode: e.target.value })} />
                        <input className="input !py-1.5 !text-sm col-span-2" placeholder="Street Address" value={shipForm.streetAddress} onChange={(e) => setShipForm({ ...shipForm, streetAddress: e.target.value })} />
                        <div className="col-span-2 flex justify-end"><Button size="sm" onClick={doAddShipping}>Save</Button></div>
                      </div>
                    )}
                    {client.shippingDetails.length === 0 ? (
                      <p className="text-sm text-gray-400">No shipping details yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {client.shippingDetails.map((s) => (
                          <div key={s.id} className="rounded-lg border border-gray-100 p-3 flex items-center justify-between">
                            <div>
                              <p className="text-sm font-semibold text-gray-800">{s.name}</p>
                              <p className="text-xs text-gray-500">{[s.streetAddress, s.city, s.country].filter(Boolean).join(', ')}</p>
                            </div>
                            <button onClick={() => doRemoveShipping(s.id)} className="text-gray-300 hover:text-danger-600"><Trash2 size={14} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-[11px] font-bold text-gray-500 uppercase">Attachments</h3>
                      <button onClick={() => fileRef.current?.click()} className="text-xs font-semibold text-primary-600 hover:underline flex items-center gap-1"><Upload size={12} /> Upload</button>
                      <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) doUploadAttachment(f); e.target.value = ''; }} />
                    </div>
                    {client.attachments.length === 0 ? (
                      <p className="text-sm text-gray-400">No attachments yet.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {client.attachments.map((a) => (
                          <div key={a.id} className="rounded-lg border border-gray-100 p-2.5 flex items-center justify-between">
                            <span className="flex items-center gap-2 text-sm text-gray-800 truncate"><FileText size={13} className="text-gray-400 flex-shrink-0" /> {a.fileName} <span className="text-xs text-gray-400">{formatSize(a.fileSize)}</span></span>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button onClick={() => downloadClientAttachment(clientId, a.id, a.fileName)} className="p-1 text-gray-400 hover:text-primary-600"><Download size={14} /></button>
                              <button onClick={() => doDeleteAttachment(a.id)} className="p-1 text-gray-400 hover:text-danger-600"><Trash2 size={14} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {tab === 'contacts' && (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Select wrapperClassName="flex-1" value={selectedContactId} onChange={(e) => setSelectedContactId(e.target.value)} options={[{ value: '', label: 'Select Contact to Link…' }, ...unlinkedContacts.map((c) => ({ value: String(c.id), label: c.name || `Contact #${c.id}` }))]} />
                    <Button size="sm" disabled={!selectedContactId} onClick={doLinkContact}>Link</Button>
                  </div>
                  {client.contactLinks.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-8">No contacts linked yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {client.contactLinks.map((l) => (
                        <div key={l.id} className="rounded-lg border border-gray-100 p-3 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-gray-800">{l.contact.name || 'Unnamed'}</p>
                            <p className="text-xs text-gray-500">{l.contact.designation} {l.contact.email ? `· ${l.contact.email}` : ''}</p>
                          </div>
                          <button onClick={() => doUnlinkContact(l.id)} className="text-gray-300 hover:text-danger-600"><Trash2 size={14} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tab === 'invoices' && (
                <div>
                  {invoices.length === 0 ? (
                    <div className="py-16 text-center">
                      <p className="text-sm font-semibold text-gray-500">No Invoice Found</p>
                      <p className="text-xs text-gray-400 mt-1">Invoices will appear here once this app's invoicing module is built.</p>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ClientDetailDrawer;
