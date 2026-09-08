import { useEffect, useMemo, useState } from 'react';
import { Plus, FileSignature, X, Building2, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  getOemOptions, getOemCategories, getOemSubCategories, getOemProducts, createAuthRequest,
  getSentRequests, getReceivedRequests, getRequestDetail, getResellerProfile, approveRequest, rejectRequest,
} from '../../services/dealerAuthRequestApi';
import type { DealerAuthRequestRow, ResellerProfileData } from '../../services/dealerAuthRequestApi';
import { Button, Modal } from '../../components/ui';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { useToast } from '../../context/ToastContext';
import { usePageHeader } from '../../context/PageHeaderContext';

const STATUS_STYLE: Record<DealerAuthRequestRow['status'], string> = {
  pending: 'bg-amber-50 text-amber-700',
  approved: 'bg-success-50 text-success-700',
  rejected: 'bg-danger-50 text-danger-700',
};

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A');

// ---- New Request wizard (reseller side) ----
const NewRequestModal = ({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) => {
  const { show } = useToast();
  const [oemQuery, setOemQuery] = useState('');
  const [oemOptions, setOemOptions] = useState<{ value: string; label: string }[]>([]);
  const [toUserId, setToUserId] = useState('');

  const [categories, setCategories] = useState<{ value: string; label: string }[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [subCategories, setSubCategories] = useState<{ value: string; label: string }[]>([]);
  const [subCategoryId, setSubCategoryId] = useState('');
  const [products, setProducts] = useState<{ value: string; label: string; custom?: boolean }[]>([]);
  const [productId, setProductId] = useState('');

  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [conditions, setConditions] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const previewRefNo = useMemo(() => `${new Date().getFullYear()}_auth_XXXX`, []);

  useEffect(() => {
    getOemOptions(oemQuery).then((r) => setOemOptions(r.data.map((o) => ({ value: String(o.userId), label: o.name }))));
  }, [oemQuery]);

  useEffect(() => {
    setCategoryId(''); setSubCategoryId(''); setProductId(''); setSubCategories([]); setProducts([]);
    if (!toUserId) { setCategories([]); return; }
    getOemCategories(Number(toUserId)).then((r) => setCategories(r.data.map((c) => ({ value: String(c.id), label: c.name }))));
  }, [toUserId]);

  useEffect(() => {
    setSubCategoryId(''); setProductId(''); setProducts([]);
    if (!toUserId || !categoryId) { setSubCategories([]); return; }
    getOemSubCategories(Number(toUserId), Number(categoryId)).then((r) => setSubCategories(r.data.map((c) => ({ value: String(c.id), label: c.name }))));
  }, [toUserId, categoryId]);

  useEffect(() => {
    setProductId('');
    if (!toUserId || !subCategoryId) { setProducts([]); return; }
    getOemProducts(Number(toUserId), Number(subCategoryId)).then((r) => setProducts(r.data.map((p) => ({ value: p.productId ? String(p.productId) : `custom:${p.name}`, label: p.name, custom: p.custom }))));
  }, [toUserId, subCategoryId]);

  const canSubmit = toUserId && productId && validFrom && validTo;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const isCustom = productId.startsWith('custom:');
      await createAuthRequest({
        toUserId: Number(toUserId),
        categoryId: categoryId ? Number(categoryId) : undefined,
        subCategoryId: subCategoryId ? Number(subCategoryId) : undefined,
        productId: isCustom ? null : Number(productId),
        customProductName: isCustom ? productId.slice(7) : undefined,
        validFrom, validTo, conditions, reason,
      });
      show('Authorization request sent.', 'success');
      onCreated();
    } catch (err: any) {
      show(err?.response?.data?.message || 'Failed to submit request.', 'error');
    } finally { setSubmitting(false); }
  };

  return (
    <Modal open onClose={onClose} title="New Authorization Request" size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={submitting} disabled={!canSubmit} onClick={submit}>Send Request</Button></>}>
      <div className="space-y-4">
        <div>
          <label className="label">Authorization Serial No.</label>
          <input className="input bg-gray-50 text-gray-400 cursor-not-allowed" value={previewRefNo} readOnly disabled />
          <p className="text-[11px] text-gray-400 mt-1">Assigned automatically when the request is sent.</p>
        </div>

        <div>
          <label className="label">1. Select OEM *</label>
          <SearchableSelect className="w-full" value={toUserId} onChange={setToUserId} options={oemOptions} placeholder="Select an OEM…" searchPlaceholder="Search OEMs…" />
        </div>

        <div>
          <label className="label">2. Choose Product *</label>
          <div className="grid sm:grid-cols-3 gap-3">
            <SearchableSelect value={categoryId} onChange={setCategoryId} options={categories} placeholder={toUserId ? (categories.length ? 'Category…' : 'No categories') : 'Select OEM first'} searchPlaceholder="Search…" />
            <SearchableSelect value={subCategoryId} onChange={setSubCategoryId} options={subCategories} placeholder={categoryId ? (subCategories.length ? 'Sub-category…' : 'No sub-categories') : 'Select category first'} searchPlaceholder="Search…" />
            <SearchableSelect value={productId} onChange={setProductId} options={products} placeholder={subCategoryId ? (products.length ? 'Product…' : 'No products') : 'Select sub-category first'} searchPlaceholder="Search…" />
          </div>
          <p className="text-[11px] text-gray-400 mt-1">One product per authorization request.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">3. Validity From *</label>
            <input type="date" className="input" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">Validity To *</label>
            <input type="date" className="input" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label">4. Conditions</label>
          <textarea rows={3} className="input" placeholder="e.g. Price range ₹1,000 – ₹2,000 per unit, minimum order quantity, territory restrictions…" value={conditions} onChange={(e) => setConditions(e.target.value)} />
        </div>

        <div>
          <label className="label">5. Reason for Authorization</label>
          <textarea rows={3} className="input" placeholder="e.g. I have a GeM tender opportunity and need authorization to bid on your behalf…" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
};

// ---- Reject reason modal (OEM side) ----
const RejectModal = ({ request, onClose, onDone }: { request: DealerAuthRequestRow; onClose: () => void; onDone: () => void }) => {
  const { show } = useToast();
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!remarks.trim()) return;
    setSaving(true);
    try { await rejectRequest(request.id, remarks.trim()); show('Request rejected.', 'success'); onDone(); } catch { show('Failed to reject.', 'error'); } finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} title="Reject Authorization Request" size="sm" footer={<><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button variant="danger" loading={saving} disabled={!remarks.trim()} onClick={submit}>Reject</Button></>}>
      <p className="text-sm text-gray-600 mb-3">This notifies <strong className="text-gray-900">{request.fromCompanyName}</strong> that their request ({request.refNo}) was rejected, along with your reason.</p>
      <label className="label">Reason for Rejection *</label>
      <textarea autoFocus rows={3} className="input" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Explain why this request can't be approved…" />
    </Modal>
  );
};

// ---- Reseller full profile drawer (OEM side) ----
const ResellerProfileDrawer = ({ requestId, onClose }: { requestId: number; onClose: () => void }) => {
  const [data, setData] = useState<ResellerProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { getResellerProfile(requestId).then((r) => setData(r.data)).finally(() => setLoading(false)); }, [requestId]);

  const info = data?.profile?.companyInfo || {};
  const address = data?.profile?.registeredAddress || {};

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg h-full bg-white shadow-2xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2"><Building2 size={16} /> Reseller Profile</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
        </div>
        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400"><Loader2 size={18} className="animate-spin inline-block" /></div>
        ) : (
          <div className="p-6 space-y-5">
            <div>
              <p className="text-lg font-bold text-gray-900">{info.legalName || data?.user.name}</p>
              <p className="text-xs text-gray-500">{info.tradeName}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-[11px] font-bold text-gray-500 uppercase">Email</label><p className="text-sm text-gray-800">{data?.user.email}</p></div>
              <div><label className="text-[11px] font-bold text-gray-500 uppercase">GSTIN</label><p className="text-sm text-gray-800">{info.gstin || 'N/A'}</p></div>
              <div><label className="text-[11px] font-bold text-gray-500 uppercase">PAN</label><p className="text-sm text-gray-800">{info.pan || 'N/A'}</p></div>
              <div><label className="text-[11px] font-bold text-gray-500 uppercase">Year Established</label><p className="text-sm text-gray-800">{info.yearEstablished || 'N/A'}</p></div>
              <div><label className="text-[11px] font-bold text-gray-500 uppercase">GeM Seller ID</label><p className="text-sm text-gray-800">{info.gemSellerId || 'N/A'}</p></div>
              <div><label className="text-[11px] font-bold text-gray-500 uppercase">Website</label><p className="text-sm text-gray-800 truncate">{info.website || 'N/A'}</p></div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase">Registered Address</label>
              <p className="text-sm text-gray-800 mt-1">{[address.line1, address.city, address.district, address.state, address.pincode].filter(Boolean).join(', ') || 'N/A'}</p>
            </div>

            {info.description && (
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase">About</label>
                <p className="text-sm text-gray-700 mt-1 leading-relaxed">{info.description}</p>
              </div>
            )}

            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase mb-2 block">Contacts</label>
              {data?.profile?.contacts?.length ? (
                <div className="space-y-2">
                  {data.profile.contacts.map((c) => (
                    <div key={c.id} className="rounded-lg border border-gray-100 p-3">
                      <p className="text-sm font-semibold text-gray-800">{c.name || 'Unnamed'} <span className="text-xs font-normal text-gray-400">— {c.contactType}</span></p>
                      <p className="text-xs text-gray-500">{c.designation || ''}</p>
                      <p className="text-xs text-gray-500">{c.email} {c.mobile ? `· ${c.mobile}` : ''}</p>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-gray-400">No contacts on file.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ---- Formal letter detail view (shared by both roles) ----
const RequestDetailModal = ({ request, isOem, onClose, onChanged }: { request: DealerAuthRequestRow; isOem: boolean; onClose: () => void; onChanged: () => void }) => {
  const { show } = useToast();
  const [showProfile, setShowProfile] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [approving, setApproving] = useState(false);

  const doApprove = async () => {
    setApproving(true);
    try { await approveRequest(request.id); show('Request approved.', 'success'); onChanged(); onClose(); } catch { show('Failed to approve.', 'error'); } finally { setApproving(false); }
  };

  return (
    <>
      <Modal open onClose={onClose} title={`Authorization Request — ${request.refNo}`} size="lg"
        footer={
          isOem && request.status === 'pending' ? (
            <>
              <Button variant="secondary" onClick={() => setShowProfile(true)}>View Profile</Button>
              <Button variant="danger" onClick={() => setShowReject(true)}>Reject</Button>
              <Button loading={approving} onClick={doApprove}>Approve</Button>
            </>
          ) : isOem ? (
            <Button variant="secondary" onClick={() => setShowProfile(true)}>View Profile</Button>
          ) : (
            <Button variant="secondary" onClick={onClose}>Close</Button>
          )
        }>
        <div className="rounded-xl border border-gray-100 p-6 bg-gray-50/60">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-gray-900">DEALER AUTHORIZATION LETTER</h3>
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${STATUS_STYLE[request.status]}`}>{request.status}</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div><label className="text-[11px] font-bold text-gray-500 uppercase">Ref No.</label><p className="font-mono text-gray-800">{request.refNo}</p></div>
            <div><label className="text-[11px] font-bold text-gray-500 uppercase">Date</label><p className="text-gray-800">{fmtDate(request.createdAt)}</p></div>
            <div><label className="text-[11px] font-bold text-gray-500 uppercase">From (Reseller)</label><p className="font-semibold text-gray-800">{request.fromCompanyName}</p></div>
            <div><label className="text-[11px] font-bold text-gray-500 uppercase">To (OEM)</label><p className="font-semibold text-gray-800">{request.toCompanyName}</p></div>
            <div><label className="text-[11px] font-bold text-gray-500 uppercase">Product</label><p className="text-gray-800">{request.productName || 'N/A'}</p></div>
            <div><label className="text-[11px] font-bold text-gray-500 uppercase">Category</label><p className="text-gray-800">{request.category?.name || 'N/A'} {request.subCategory?.name ? `/ ${request.subCategory.name}` : ''}</p></div>
            <div><label className="text-[11px] font-bold text-gray-500 uppercase">Valid From</label><p className="text-gray-800">{fmtDate(request.validFrom)}</p></div>
            <div><label className="text-[11px] font-bold text-gray-500 uppercase">Valid To</label><p className="text-gray-800">{fmtDate(request.validTo)}</p></div>
          </div>
          <div className="mt-4">
            <label className="text-[11px] font-bold text-gray-500 uppercase">Conditions</label>
            <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{request.conditions || 'None specified.'}</p>
          </div>
          <div className="mt-4">
            <label className="text-[11px] font-bold text-gray-500 uppercase">Reason for Authorization</label>
            <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{request.reason || 'None specified.'}</p>
          </div>
          {request.status === 'rejected' && request.rejectionRemarks && (
            <div className="mt-4 rounded-lg bg-danger-50 border border-danger-100 p-3">
              <label className="text-[11px] font-bold text-danger-600 uppercase">Rejection Remarks</label>
              <p className="text-sm text-danger-700 mt-1">{request.rejectionRemarks}</p>
            </div>
          )}
        </div>
      </Modal>
      {showProfile && <ResellerProfileDrawer requestId={request.id} onClose={() => setShowProfile(false)} />}
      {showReject && <RejectModal request={request} onClose={() => setShowReject(false)} onDone={() => { setShowReject(false); onChanged(); onClose(); }} />}
    </>
  );
};

const RequestTable = ({ rows, isOem, onOpen }: { rows: DealerAuthRequestRow[]; isOem: boolean; onOpen: (r: DealerAuthRequestRow) => void }) => (
  <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
    {rows.length === 0 ? (
      <div className="py-16 text-center text-sm text-gray-400 flex flex-col items-center gap-2">
        <FileSignature size={26} className="text-gray-300" />
        {isOem ? 'No authorization requests received yet.' : 'No authorization requests sent yet.'}
      </div>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3">Ref No.</th>
              <th className="px-4 py-3">{isOem ? 'Reseller' : 'OEM'}</th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Validity</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} onClick={() => onOpen(r)} className="border-t border-gray-50 hover:bg-gray-50/60 cursor-pointer">
                <td className="px-4 py-3 font-mono text-xs text-gray-700">{r.refNo}</td>
                <td className="px-4 py-3 font-semibold text-gray-800">{isOem ? r.fromCompanyName : r.toCompanyName}</td>
                <td className="px-4 py-3 text-gray-600">{r.productName || 'N/A'}</td>
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(r.validFrom)} – {fmtDate(r.validTo)}</td>
                <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-bold ${STATUS_STYLE[r.status]}`}>{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

// Dealer Management > Request Authorization — a reseller requests
// permission from a specific OEM to sell one of that OEM's own products;
// the OEM approves or rejects (with remarks). Both sides land on this same
// page, seeing the view relevant to their role. See
// backend/controllers/dealerAuthRequestController.js for the full flow.
const DealerAuthLetterPage = () => {
  usePageHeader('Request Authorization', 'Cross-partner product authorization requests.');
  const { user } = useAuth();
  const isOem = user?.partnerType === 'oem';
  const { show } = useToast();
  const [rows, setRows] = useState<DealerAuthRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [opened, setOpened] = useState<DealerAuthRequestRow | null>(null);

  const load = () => {
    setLoading(true);
    (isOem ? getReceivedRequests() : getSentRequests()).then((r) => setRows(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [isOem]); // eslint-disable-line react-hooks/exhaustive-deps

  const openRow = async (r: DealerAuthRequestRow) => {
    try { const fresh = await getRequestDetail(r.id); setOpened(fresh.data); } catch { show('Failed to load request.', 'error'); }
  };

  return (
    <div className="space-y-5">
      {!isOem && (
        <div className="flex justify-end">
          <Button icon={Plus} onClick={() => setShowNew(true)}>New Request</Button>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-gray-100 bg-white py-16 text-center text-sm text-gray-400">Loading…</div>
      ) : (
        <RequestTable rows={rows} isOem={isOem} onOpen={openRow} />
      )}

      {showNew && <NewRequestModal onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} />}
      {opened && <RequestDetailModal request={opened} isOem={isOem} onClose={() => setOpened(null)} onChanged={load} />}
    </div>
  );
};

export default DealerAuthLetterPage;
