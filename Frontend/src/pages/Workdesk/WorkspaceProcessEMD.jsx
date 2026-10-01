import React, { useState, useEffect } from 'react';
import { Home, Lock, Upload, FileText, ChevronDown, Save, ArrowRight, CheckCircle2, Eye } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

// Fixed list of Meril legal entities an EMD can be raised under — not
// scraped from anywhere, this is the real list of registered entities the
// user gave us; kept here until/unless it needs to live in a shared config.
const LEGAL_COMPANY_OPTIONS = [
  'Meril Life Science India Private Limited',
  'Meril Endosurgery Private Limited',
  'Meril Diagnostics Private Limited',
  'Meril Healthcare Private Limited',
  'Micro Life Sciences Private Limited',
  'Merai Newage Private Limited',
];

const DIVISION_TO_LEGAL_COMPANY = {
  Endo: 'Meril Endosurgery Private Limited',
  Diagno: 'Meril Diagnostics Private Limited',
};

// Known procurement agencies — given as a fixed reference list, but treated
// as suggestions (via <datalist>) rather than a closed dropdown, since a new
// tender can easily come from an agency not yet in this list and the form
// shouldn't block on that.
const PROCUREMENT_AGENCY_OPTIONS = [
  'Directorate Of Animal Husbandry',
  'Government Doon Medical College',
  'Assam Medical College and Hospital',
  'POSTGRADUATE INSTITUTE OF MEDICAL EDUCATION AND RESEARCH,',
  'Panchayats And Rural Housing Department Gujarat',
  'Karnataka Public Procurement',
  'All India Institute of Medical Sciences-Rishikesh',
  'Esic Hospital Kk Nagar',
  'Gujarat Medical Services Corporation Limited (gmscl)',
  'Dg Armed Forces Medical Servic',
  'Indian Army Nashik',
];

const TENDER_HEAD_APPROVAL_OPTIONS = [
  'Anjul Jain',
  'Gaurav Sharma',
  'Manjaly Shaiju Varghese',
  'Rajendra Jagtap',
];

const emptyStep2 = {
  procurementAgency: '',
  address: '',
  contactPersonName: '',
  zone: '',
  country: 'India',
  reverseAuctionEnable: '-None-',
  tenderHeadApproval: '-None-',
  flspEmail: '',
  rsmEmail: '',
  zsmEmail: '',
  division: '-None-',
  procurementEmail: '',
  contactNumber: '',
  financeEmail: '',
  msmeNo: '',
  stateName: '',
  supplies: '-None-',
  tenderId: '',
  remarks: '',
};

const emptyStep1 = {
  tenderProcessOwner: '',
  typeOfTender: '-None-',
  tenderRefNo: '',
  tenderPublishedDate: '',
  bidOpeningDate: '',
  bidOpeningTime: '',
  bidExtensionDate: '',
  bidExtensionTime: '',
  legalCompanyName: '-None-',
  division: '-None-',
  preBidMeetingDate: '',
  preBidMeetingTime: '',
  bidClosingDate: '',
  bidClosingTime: '',
  tenderExpiryDate: '',
  tenderDocumentSource: null, // { type: 'existing', uri, text } | { type: 'upload', name, file }
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// Scraped tender dates arrive in several inconsistent formats depending on
// source (GEM vs the various Open tender portals) — "DD-MM-YYYY HH:mm[:ss]",
// "DD-MM-YYYY h:mm AM/PM", "DD-Mon-YYYY hh:mm AM/PM" — none of which
// JS's native Date() parses correctly (it silently returns Invalid Date for
// DD-first formats). Parsed manually here rather than trusting Date().
function parseFlexibleDate(value) {
  if (!value) return null;
  const str = String(value).trim();

  // DD-MM-YYYY or DD-Mon-YYYY, optional time with optional AM/PM
  const m = str.match(/^(\d{1,2})-([A-Za-z]{3}|\d{1,2})-(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
  if (m) {
    const [, dd, monRaw, yyyy, hh, min, , ampm] = m;
    const month = /^\d+$/.test(monRaw) ? parseInt(monRaw, 10) - 1 : MONTHS.indexOf(monRaw.toLowerCase().slice(0, 3));
    let hour = hh ? parseInt(hh, 10) : 0;
    if (ampm) {
      if (/PM/i.test(ampm) && hour !== 12) hour += 12;
      if (/AM/i.test(ampm) && hour === 12) hour = 0;
    }
    const d = new Date(parseInt(yyyy, 10), month, parseInt(dd, 10), hour, min ? parseInt(min, 10) : 0);
    if (!Number.isNaN(d.getTime())) return d;
  }

  // Fall back to whatever the native parser can make of it (ISO, etc.)
  const native = new Date(str);
  return Number.isNaN(native.getTime()) ? null : native;
}

// Splits a scraped datetime string into native <input type="date">/type="time">
// values ("YYYY-MM-DD" / "HH:mm", 24h) — best-effort only, unparseable input
// just leaves the field blank rather than showing something wrong.
function splitDateTime(value) {
  const d = parseFlexibleDate(value);
  if (!d) return { date: '', time: '' };
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return { date, time };
}

const Field = ({ label, error, children }) => (
  <div style={{ marginBottom: '12px' }}>
    <label style={{
      display: 'block', fontSize: '12px', color: '#5b6472',
      fontWeight: 600, marginBottom: '4px',
    }}>
      {label}
    </label>
    {children}
    {error && (
      <div style={{ marginTop: '2px', fontSize: '11px', color: '#dc2626' }}>
        {error}
      </div>
    )}
  </div>
);

const inputStyle = {
  width: '100%', padding: '7px 10px', fontSize: '13px', borderRadius: '6px',
  border: '1px solid #d0d5dd', outline: 'none', color: '#1f2937', background: '#fff',
  boxSizing: 'border-box',
};

const lockedInputStyle = { ...inputStyle, background: '#f1f3f6', color: '#5b6472', cursor: 'not-allowed' };

const selectStyle = { ...inputStyle, appearance: 'none', cursor: 'pointer', paddingRight: '32px' };

const WorkspaceProcessEMD = ({ tenderId, documentLinks = [] }) => {
  const cleanBidNumber = tenderId.replace(/_/g, '/');
  const token = localStorage.getItem('token');

  let currentUser = null;
  try { currentUser = JSON.parse(localStorage.getItem('user')); } catch { /* ignore */ }

  const [step1, setStep1] = useState(emptyStep1);
  const [step2, setStep2] = useState(emptyStep2);
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [zsmCandidates, setZsmCandidates] = useState([]);

  const setField = (key, value) => setStep1((prev) => ({ ...prev, [key]: value }));
  const setField2 = (key, value) => setStep2((prev) => ({ ...prev, [key]: value }));

  // Loads whatever was already saved for this tender's EMD process, then
  // autofills anything still blank from the tender's own basic details —
  // saved answers always win over autofill so re-opening this tab never
  // clobbers something the user already typed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const headers = { Authorization: `Bearer ${token}` };
      let savedStep1 = null;
      let savedStep2 = null;
      try {
        const res = await fetch(`${API_BASE_URL}/tenders/${encodeURIComponent(cleanBidNumber)}/emd-process`, { headers });
        const data = await res.json();
        if (data.success) {
          if (data.data?.step1) savedStep1 = data.data.step1;
          if (data.data?.step2) savedStep2 = data.data.step2;
        }
      } catch { /* ignore — fall through to autofill-only */ }

      let autofill1 = {};
      let autofill2 = {};
      let refNo = tenderId.replace(/_/g, '/');
      try {
        const [detailsRes, metaRes] = await Promise.all([
          fetch(`${API_BASE_URL}/tenders/${encodeURIComponent(cleanBidNumber)}`, { headers }),
          fetch(`${API_BASE_URL}/tenders/${encodeURIComponent(cleanBidNumber)}/meta`, { headers }),
        ]);
        const details = (await detailsRes.json())?.data || {};
        const meta = (await metaRes.json())?.data || {};

        const isOpen = details.open_source || false;
        refNo = isOpen ? (details.ref_no || '') : (details.bid_number || refNo);
        const published = splitDateTime(details.start_date);
        const closing = splitDateTime(details.end_date);
        const opening = splitDateTime(details.opening_date);
        const preBid = splitDateTime(details.tender_details?.critical_dates?.['Pre Bid Meeting Date']);

        const deptLower = String(meta.dept || '').toLowerCase();
        const division = deptLower === 'endo' ? 'Endo' : deptLower === 'diagno' ? 'Diagno' : deptLower === '360' ? '360' : '-None-';

        autofill1 = {
          typeOfTender: isOpen ? 'Open' : 'GEM',
          tenderRefNo: refNo,
          tenderPublishedDate: published.date,
          bidOpeningDate: opening.date,
          bidOpeningTime: opening.time,
          bidClosingDate: closing.date,
          bidClosingTime: closing.time,
          preBidMeetingDate: preBid.date,
          preBidMeetingTime: preBid.time,
          division,
          legalCompanyName: DIVISION_TO_LEGAL_COMPANY[division] || '-None-',
        };
        autofill2 = {
          division,
          stateName: details.state || '',
          tenderId: refNo,
        };
      } catch { /* ignore — leave fields blank rather than block the page */ }

      // ZSM candidates are resolved from the tender's own state via the same
      // state->ZSM routing Process Decode approvals use — first match
      // autofills the field, all matches populate the dropdown (some states,
      // e.g. West Bengal, are genuinely covered by two ZSMs).
      let candidates = [];
      try {
        const zsmRes = await fetch(`${API_BASE_URL}/tenders/${encodeURIComponent(cleanBidNumber)}/zsm-candidates`, { headers });
        const zsmData = await zsmRes.json();
        if (zsmData.success) candidates = zsmData.data || [];
      } catch { /* ignore — leave ZSM field for manual entry */ }
      if (candidates.length) autofill2.zsmEmail = candidates[0].email;

      if (cancelled) return;
      setZsmCandidates(candidates);
      setStep1({
        ...emptyStep1,
        ...autofill1,
        ...(savedStep1 || {}),
        // Owner is always the currently logged-in user — never something
        // saved earlier by someone else, and never editable.
        tenderProcessOwner: currentUser?.name || '',
      });
      setStep2({ ...emptyStep2, ...autofill2, ...(savedStep2 || {}) });
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenderId]);

  // Saves whichever step is currently on screen — only that step's key is
  // sent, so the backend's merge logic leaves the other step's data alone.
  const handleSave = async (advanceStep) => {
    setSaving(true);
    setSaved(false);
    try {
      const body = currentStep === 1
        ? { step1, currentStep: advanceStep ? 2 : 1 }
        : { step2, currentStep: 2 };
      const res = await fetch(`${API_BASE_URL}/tenders/${encodeURIComponent(cleanBidNumber)}/emd-process`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
        if (currentStep === 1 && advanceStep) setCurrentStep(2);
      }
    } catch (err) {
      console.error('[WorkspaceProcessEMD] save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Object URL created once at selection time and reused on every "View"
    // click — cheaper than re-creating it per click, and fine to leave
    // un-revoked for a short-lived form like this one.
    setField('tenderDocumentSource', { type: 'upload', name: file.name, file, objectUrl: URL.createObjectURL(file) });
  };

  const viewDocument = () => {
    const src = step1.tenderDocumentSource;
    if (!src) return;
    let url = src.type === 'existing' ? src.uri : src.objectUrl;
    if (!url) return;
    // Our own /tenders/download endpoint defaults to forcing a save-as
    // (res.download always sets Content-Disposition: attachment) — passing
    // inline=1 switches it to res.sendFile with Content-Disposition: inline
    // instead, so the browser renders the PDF/doc in the new tab rather than
    // downloading it. window.open also can't attach an auth header, so the
    // token travels as a query param — the route accepts it that way.
    if (url.startsWith(`${API_BASE_URL}/tenders/download`)) {
      if (!url.includes('inline=')) url += (url.includes('?') ? '&' : '?') + 'inline=1';
      if (!url.includes('token=')) url += `&token=${encodeURIComponent(token)}`;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const pickExistingDoc = (link) => {
    setField('tenderDocumentSource', { type: 'existing', uri: link.uri, text: link.text || link.label || 'Document' });
    setShowDocPicker(false);
  };

  // First preference: auto-pull the tender's own document if nothing has
  // been picked yet and at least one exists — the user only has to step in
  // when there's genuinely nothing to pull from.
  useEffect(() => {
    if (!loading && !step1.tenderDocumentSource && documentLinks.length > 0) {
      const first = documentLinks[0];
      setField('tenderDocumentSource', { type: 'existing', uri: first.uri, text: first.text || first.label || 'Tender Document' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, documentLinks]);

  const DateTimeField = (dateKey, timeKey) => (
    <div style={{ display: 'flex', gap: '8px' }}>
      <input
        type="date"
        lang="en-GB"
        value={step1[dateKey] || ''}
        onChange={(e) => setField(dateKey, e.target.value)}
        style={{ ...inputStyle, flex: 1.3 }}
      />
      <input
        type="time"
        value={step1[timeKey] || ''}
        onChange={(e) => setField(timeKey, e.target.value)}
        style={{ ...inputStyle, flex: 1 }}
      />
    </div>
  );

  if (loading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
        Loading tender details…
      </div>
    );
  }

  return (
    <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e5e9f0' }}>
      {/* Step tabs */}
      <div style={{ display: 'flex', gap: '10px', padding: '12px 22px', borderBottom: '1px solid #eef1f6' }}>
        {[1, 2].map((step) => (
          <button
            key={step}
            type="button"
            onClick={() => setCurrentStep(step)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 16px',
              borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '13.5px',
              border: currentStep === step ? '1px solid #f0a03c' : '1px solid #e5e9f0',
              background: currentStep === step ? '#fff8ee' : '#fff',
              color: currentStep === step ? '#b5610f' : '#6b7280',
            }}
          >
            {step === 1 && <Home size={15} />} Tender Basic Details-{step}
          </button>
        ))}
      </div>

      <div style={{ padding: '16px 22px', display: currentStep === 1 ? 'block' : 'none' }}>
        <h4 style={{ fontSize: '12px', fontWeight: 700, color: '#1f2937', marginBottom: '12px', letterSpacing: '0.2px' }}>
          Segment Title
        </h4>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', columnGap: '20px' }}>
          <Field label="Tender Process Owner">
            <div style={{ position: 'relative' }}>
              <input type="text" value={step1.tenderProcessOwner} readOnly disabled style={lockedInputStyle} />
              <Lock size={14} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9aa4b2' }} />
            </div>
          </Field>

          <Field label="Type of Tender">
            <div style={{ position: 'relative' }}>
              <select value={step1.typeOfTender} onChange={(e) => setField('typeOfTender', e.target.value)} style={selectStyle}>
                <option value="-None-">-None-</option>
                <option value="GEM">GEM</option>
                <option value="Open">Open</option>
              </select>
              <ChevronDown size={14} style={chevronStyle} />
            </div>
          </Field>

          <Field label="Tender Reference Number">
            <input type="text" value={step1.tenderRefNo} onChange={(e) => setField('tenderRefNo', e.target.value)} style={inputStyle} />
          </Field>

          <Field label="Legal Company Name">
            <div style={{ position: 'relative' }}>
              <select value={step1.legalCompanyName} onChange={(e) => setField('legalCompanyName', e.target.value)} style={selectStyle}>
                <option value="-None-">-None-</option>
                {LEGAL_COMPANY_OPTIONS.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
              <ChevronDown size={14} style={chevronStyle} />
            </div>
          </Field>

          <Field label="Division">
            <div style={{ position: 'relative' }}>
              <select
                value={step1.division}
                onChange={(e) => {
                  const division = e.target.value;
                  setField('division', division);
                  if (DIVISION_TO_LEGAL_COMPANY[division]) setField('legalCompanyName', DIVISION_TO_LEGAL_COMPANY[division]);
                }}
                style={selectStyle}
              >
                <option value="-None-">-None-</option>
                <option value="Endo">Endo</option>
                <option value="Diagno">Diagno</option>
                <option value="360">360</option>
              </select>
              <ChevronDown size={14} style={chevronStyle} />
            </div>
          </Field>

          <Field label="Tender Published date">
            <input type="date" lang="en-GB" value={step1.tenderPublishedDate} onChange={(e) => setField('tenderPublishedDate', e.target.value)} style={inputStyle} />
          </Field>

          <Field label="Bid Opening date and time">
            {DateTimeField('bidOpeningDate', 'bidOpeningTime')}
          </Field>

          <Field label="Bid Closing date and time">
            {DateTimeField('bidClosingDate', 'bidClosingTime')}
          </Field>

          <Field label="Pre Bid Meeting date & time">
            {DateTimeField('preBidMeetingDate', 'preBidMeetingTime')}
          </Field>

          <Field label="Bid Extension date">
            {DateTimeField('bidExtensionDate', 'bidExtensionTime')}
          </Field>

          <Field label="Tender Expiry date">
            <input type="date" lang="en-GB" value={step1.tenderExpiryDate} onChange={(e) => setField('tenderExpiryDate', e.target.value)} style={inputStyle} />
          </Field>

          <Field label="Tender Document">
            <div>
              {step1.tenderDocumentSource ? (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px',
                  border: '1px solid #d0d5dd', borderRadius: '6px', fontSize: '13px', color: '#1f2937',
                }}>
                  <FileText size={14} color="#0b5cab" style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {step1.tenderDocumentSource.text || step1.tenderDocumentSource.name}
                  </span>
                  {step1.tenderDocumentSource.type === 'existing' && (
                    <span style={{ fontSize: '10.5px', color: '#12b76a', fontWeight: 600, flexShrink: 0 }}>AUTO</span>
                  )}
                  <button type="button" onClick={viewDocument}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0,
                      border: '1px solid #a7c5e8', background: '#f5f9ff', color: '#0b5cab',
                      borderRadius: '5px', padding: '4px 9px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                    }}>
                    <Eye size={13} /> View
                  </button>
                  <button type="button" onClick={() => setField('tenderDocumentSource', null)}
                    style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', flexShrink: 0 }}>
                    ✕
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" onClick={() => setShowDocPicker(true)}
                    style={{ ...pickerBtnStyle, flex: 1 }}>
                    <FileText size={14} /> Select from Documents
                  </button>
                  <label style={{ ...pickerBtnStyle, flex: 1, cursor: 'pointer' }}>
                    <Upload size={14} /> Upload File
                    <input type="file" accept=".pdf,.doc,.docx" onChange={handleFileUpload} style={{ display: 'none' }} />
                  </label>
                </div>
              )}
            </div>
          </Field>
        </div>
      </div>

      <div style={{ padding: '16px 22px', display: currentStep === 2 ? 'block' : 'none' }}>
        <h4 style={{ fontSize: '12px', fontWeight: 700, color: '#1f2937', marginBottom: '12px', letterSpacing: '0.2px' }}>
          Segment Title
        </h4>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', columnGap: '20px' }}>
          <Field label="Procurement Agency">
            <input
              type="text"
              list="procurement-agency-options"
              placeholder="Search or type agency name"
              value={step2.procurementAgency}
              onChange={(e) => setField2('procurementAgency', e.target.value)}
              style={inputStyle}
            />
            <datalist id="procurement-agency-options">
              {PROCUREMENT_AGENCY_OPTIONS.map((name) => <option key={name} value={name} />)}
            </datalist>
          </Field>

          <Field label="Division">
            <div style={{ position: 'relative' }}>
              <select value={step2.division} onChange={(e) => setField2('division', e.target.value)} style={selectStyle}>
                <option value="-None-">-None-</option>
                <option value="Endo">Endo</option>
                <option value="Diagno">Diagno</option>
                <option value="360">360</option>
              </select>
              <ChevronDown size={14} style={chevronStyle} />
            </div>
          </Field>

          <Field label="Tender ID">
            <input type="text" value={step2.tenderId} onChange={(e) => setField2('tenderId', e.target.value)} style={inputStyle} />
          </Field>

          <Field label="Address">
            <input type="text" value={step2.address} onChange={(e) => setField2('address', e.target.value)} style={inputStyle} />
          </Field>

          <Field label="State Name">
            <input type="text" value={step2.stateName} onChange={(e) => setField2('stateName', e.target.value)} style={inputStyle} />
          </Field>

          <Field label="Zone">
            <input type="text" value={step2.zone} onChange={(e) => setField2('zone', e.target.value)} style={inputStyle} />
          </Field>

          <Field label="Country">
            <input type="text" value={step2.country} onChange={(e) => setField2('country', e.target.value)} style={inputStyle} />
          </Field>

          <Field label="Contact Person Name">
            <input type="text" value={step2.contactPersonName} onChange={(e) => setField2('contactPersonName', e.target.value)} style={inputStyle} />
          </Field>

          <Field label="Contact Number">
            <input type="text" value={step2.contactNumber} onChange={(e) => setField2('contactNumber', e.target.value)} style={inputStyle} />
          </Field>

          <Field label="Reverse Auction Enable">
            <div style={{ position: 'relative' }}>
              <select value={step2.reverseAuctionEnable} onChange={(e) => setField2('reverseAuctionEnable', e.target.value)} style={selectStyle}>
                <option value="-None-">-None-</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
              <ChevronDown size={14} style={chevronStyle} />
            </div>
          </Field>

          <Field label="Supplies">
            <div style={{ position: 'relative' }}>
              <select value={step2.supplies} onChange={(e) => setField2('supplies', e.target.value)} style={selectStyle}>
                <option value="-None-">-None-</option>
                <option value="Single Location">Single Location</option>
                <option value="Multiple Location">Multiple Location</option>
              </select>
              <ChevronDown size={14} style={chevronStyle} />
            </div>
          </Field>

          <Field label="Tender Head Approval">
            <div style={{ position: 'relative' }}>
              <select value={step2.tenderHeadApproval} onChange={(e) => setField2('tenderHeadApproval', e.target.value)} style={selectStyle}>
                <option value="-None-">-None-</option>
                {TENDER_HEAD_APPROVAL_OPTIONS.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
              <ChevronDown size={14} style={chevronStyle} />
            </div>
          </Field>

          <Field label="MSME No">
            <input type="text" value={step2.msmeNo} onChange={(e) => setField2('msmeNo', e.target.value)} style={inputStyle} />
          </Field>

          <Field label="ZSM Email ID">
            <div style={{ position: 'relative' }}>
              <select
                value={step2.zsmEmail}
                onChange={(e) => setField2('zsmEmail', e.target.value)}
                style={selectStyle}
              >
                {!step2.zsmEmail && <option value="">-None-</option>}
                {zsmCandidates.map((c) => (
                  <option key={c.email} value={c.email}>{c.name} ({c.email})</option>
                ))}
                {step2.zsmEmail && !zsmCandidates.some((c) => c.email === step2.zsmEmail) && (
                  <option value={step2.zsmEmail}>{step2.zsmEmail}</option>
                )}
              </select>
              <ChevronDown size={14} style={chevronStyle} />
            </div>
            {zsmCandidates.length > 0 && (
              <div style={{ fontSize: '10.5px', color: '#12b76a', fontWeight: 600, marginTop: '3px' }}>
                AUTO — resolved from tender state
              </div>
            )}
          </Field>

          <Field label="RSM Email ID">
            <input type="email" value={step2.rsmEmail} onChange={(e) => setField2('rsmEmail', e.target.value)} style={inputStyle} />
          </Field>

          <Field label="FLSP Email ID">
            <input type="email" value={step2.flspEmail} onChange={(e) => setField2('flspEmail', e.target.value)} style={inputStyle} />
          </Field>

          <Field label="Procurement email ID">
            <input type="email" value={step2.procurementEmail} onChange={(e) => setField2('procurementEmail', e.target.value)} style={inputStyle} />
          </Field>

          <Field label="Finance email ID">
            <input type="email" value={step2.financeEmail} onChange={(e) => setField2('financeEmail', e.target.value)} style={inputStyle} />
          </Field>

          <Field label="Remarks(Pls specify location)">
            <textarea
              value={step2.remarks}
              onChange={(e) => setField2('remarks', e.target.value)}
              rows={1}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </Field>
        </div>
      </div>

      {/* Footer actions */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 22px', borderTop: '1px solid #eef1f6', background: '#fafbfc',
      }}>
        <div style={{ fontSize: '12.5px', color: saved ? '#12b76a' : '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {saved && <><CheckCircle2 size={14} /> Saved</>}
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {currentStep === 2 && (
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              style={secondaryBtnStyle}
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={saving}
            style={{ ...secondaryBtnStyle, opacity: saving ? 0.6 : 1 }}
          >
            <Save size={14} /> Save as Draft
          </button>
          {currentStep === 1 ? (
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={saving}
              style={{ ...primaryBtnStyle, opacity: saving ? 0.6 : 1 }}
            >
              Next <ArrowRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={saving}
              style={{ ...primaryBtnStyle, opacity: saving ? 0.6 : 1 }}
            >
              <Save size={14} /> Save
            </button>
          )}
        </div>
      </div>

      {/* Document picker modal — first preference is always the tender's own documents */}
      {showDocPicker && (
        <div
          onClick={() => setShowDocPicker(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{
            background: '#fff', borderRadius: '10px', width: '480px', maxHeight: '70vh',
            overflowY: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
          }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #eef1f6', fontWeight: 700, fontSize: '14px', color: '#1f2937' }}>
              Select Tender Document
            </div>
            {documentLinks.length === 0 ? (
              <div style={{ padding: '30px 20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                No documents found in this tender's Documents section.
                <br />Close this and use "Upload File" instead.
              </div>
            ) : (
              <div style={{ padding: '8px' }}>
                {documentLinks.map((link, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => pickExistingDoc(link)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
                      padding: '10px 12px', border: 'none', background: 'none', textAlign: 'left',
                      borderRadius: '6px', cursor: 'pointer', fontSize: '13px', color: '#1f2937',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                  >
                    <FileText size={14} color="#0b5cab" style={{ flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {link.text || link.label || link.uri?.split('/').pop()}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const chevronStyle = { position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280', pointerEvents: 'none' };

const pickerBtnStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
  padding: '9px 12px', fontSize: '12.5px', fontWeight: 600, color: '#0b5cab',
  border: '1px dashed #a7c5e8', background: '#f5f9ff', borderRadius: '6px', cursor: 'pointer',
};

const secondaryBtnStyle = {
  display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px', fontSize: '13px',
  fontWeight: 600, color: '#374151', background: '#fff', border: '1px solid #d0d5dd',
  borderRadius: '7px', cursor: 'pointer',
};

const primaryBtnStyle = {
  display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 20px', fontSize: '13px',
  fontWeight: 600, color: '#fff', background: '#0b5cab', border: 'none',
  borderRadius: '7px', cursor: 'pointer',
};

export default WorkspaceProcessEMD;
