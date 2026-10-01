// src/pages/Dealers/DealerAuthorizationLetter.jsx
// Route: /dealers/authorization-letter

import { useState, useEffect, useRef, useMemo } from 'react';
import '../../assets/css/DealerAuthorizationLetter.css';
import API_BASE_URL from '../../config/api';
import LetterdHeader from '../../assets/img/endo-letterhead-logo.png';

// Divisions this authorization letter can be issued under — each has its own
// legal entity name, registered address and product phrase, matching the
// real "Authority Letter" format issued by Meril for supply authorisations.
// Signatory name/title/signature image are NOT set here — the backend's
// /doc-prep/export-pdf always appends the one canonical, correct signature
// block per division (getEndoSignatureHtml / getLetterheadSignatureHtml),
// same as every Doc Prep export. Duplicating it here previously used a
// different name/title and dropped it for Diagno's real scanned signature.
const DIVISIONS = {
  Endo: {
    companyName: 'Meril Endo Surgery Pvt. Ltd.',
    companyAddress: 'E1-E3, Meril Park, Survey No. 135/2/B &amp; 174/2, Muktanand Marg, Chala, Vapi – 396191, Gujarat',
    productPhrase: 'Endo Surgery products',
  },
  Diagno: {
    companyName: 'Meril Diagnostics Pvt. Ltd.',
    companyAddress: 'Survey No. 135/139, Bilakhia House, Muktanand Marg, Chala, Vapi – 396 191, Gujarat, India',
    productPhrase: 'diagnostic products and instruments',
  },
};

// Body-only HTML for the official PDF — the backend's /doc-prep/export-pdf
// endpoint wraps this with the Meril letterhead (logo header + address
// footer) and appends the scanned signature + company stamp pulled from
// Frontend/public/letterhead.docx underneath whatever we render here.
const buildLetterBodyHtml = ({ alSerial, institutionName, institutionAddress, dealer, dealerAddress, division, validUntil, date }) => {
  const d = DIVISIONS[division] || DIVISIONS.Endo;
  const formattedDate = date.toLocaleDateString('en-GB').replace(/\//g, '/');
  const fyStartYear = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1; // FY starts April
  const fy = `${fyStartYear}-${String((fyStartYear + 1) % 100).padStart(2, '0')}`;
  const refNo = `MEPL/${fy}/AL-${alSerial}`;
  const validUntilFormatted = validUntil
    ? new Date(validUntil).toLocaleDateString('en-GB').split('/').join('-')
    : '';
  const institutionAddressHtml = (institutionAddress || '').split('\n').filter(Boolean).join('<br />');
  const dealerFullAddress = [dealerAddress, dealer?.cityName, dealer?.state].filter(Boolean).join(', ');

  return `
    <table style="width:100%;border:none;margin:0 0 18px;">
      <tr>
        <td style="border:none;padding:0;font-size:10.5pt;text-align:left;">Ref. No.: ${refNo}</td>
        <td style="border:none;padding:0;font-size:10.5pt;text-align:right;">${formattedDate}</td>
      </tr>
    </table>

    <p class="label-line">
      To<br />
      ${institutionName || ''}<br />
      ${institutionAddressHtml}
    </p>

    <p class="label-line"><strong><u>Sub. : Supply Authorisation</u></strong></p>

    <p>Dear Sir,</p>

    <p>
      We <strong>M/s. ${d.companyName}</strong>, based at ${d.companyAddress}, manufacturers of Medical Devices,
      hereby authorize <strong>M/s ${dealer?.companyName || ''}</strong>${dealerFullAddress ? `, ${dealerFullAddress},` : ','}
      to supply ${d.productPhrase} manufactured &amp; marketed by us to your esteemed institution.
    </p>

    <p><strong>This authorization letter is valid up to ${validUntilFormatted}.</strong></p>

    <p style="margin-top:24px;">Regards,</p>
  `;
};

const DealerAuthorizationLetter = () => {
  const [dealers, setDealers] = useState([]);
  const [loadingDealers, setLoadingDealers] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [division, setDivision] = useState('Endo');
  const [alSerial, setAlSerial] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [institutionAddress, setInstitutionAddress] = useState('');
  const [dealerId, setDealerId] = useState('');
  const [dealerAddress, setDealerAddress] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [formError, setFormError] = useState('');
  const [generated, setGenerated] = useState(null);

  useEffect(() => {
    const fetchDealers = async () => {
      setLoadingDealers(true);
      setLoadError('');
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE_URL}/distributors`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const json = await res.json();
        if (json.success) {
          setDealers(json.data);
        } else {
          setLoadError(json.message || 'Failed to load dealers');
        }
      } catch {
        setLoadError('Failed to load dealers');
      } finally {
        setLoadingDealers(false);
      }
    };
    fetchDealers();
  }, []);

  const selectedDealer = dealers.find(d => String(d.id) === String(dealerId));
  const letterRef = useRef(null);
  const bodyRef = useRef(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [edited, setEdited] = useState(false);

  const handleGenerate = () => {
    setGenerated(null);
    setSubmitError('');
    setSubmitted(false);
    setEdited(false);
    if (!alSerial.trim()) {
      setFormError('Please enter the authorization letter serial number.');
      return;
    }
    if (!institutionName.trim()) {
      setFormError('Please enter the institution / tender authority name.');
      return;
    }
    if (!institutionAddress.trim()) {
      setFormError('Please enter the institution address.');
      return;
    }
    if (!dealerId) {
      setFormError('Please select a dealer.');
      return;
    }
    if (!validUntil) {
      setFormError('Please select the validity date for this authorization.');
      return;
    }
    setFormError('');
    setGenerated({
      alSerial: alSerial.trim(),
      institutionName: institutionName.trim(),
      institutionAddress: institutionAddress.trim(),
      dealer: selectedDealer,
      dealerAddress: dealerAddress.trim(),
      division,
      validUntil,
      date: new Date(),
    });
  };

  // Populate the editable letter body whenever a fresh letter is generated.
  // We set innerHTML imperatively (instead of rendering it via JSX) so that
  // the user's in-place edits inside the contentEditable region survive
  // unrelated re-renders (e.g. toggling the "Downloaded" ribbon).
  useEffect(() => {
    if (generated && bodyRef.current) {
      bodyRef.current.innerHTML = buildLetterBodyHtml(generated);
    }
  }, [generated]);

  const handleResetEdits = () => {
    if (generated && bodyRef.current) {
      bodyRef.current.innerHTML = buildLetterBodyHtml(generated);
      setEdited(false);
    }
  };

  // No signature is applied here anymore — this only creates a pending
  // request. It's routed to the Legal Team, then Admin (Ravi Kiran), each
  // signing via an emailed OTP; the signed PDF only becomes available once
  // both have signed. See /dealers/signatures.
  const handleSubmitForSignature = async () => {
    if (!generated || !bodyRef.current) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const token = localStorage.getItem('token');
      const d = DIVISIONS[generated.division] || DIVISIONS.Endo;
      const res = await fetch(`${API_BASE_URL}/dealer-auth-letters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          division: generated.division,
          companyName: d.companyName,
          htmlContent: bodyRef.current.innerHTML,
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.message || `Server error ${res.status}`);
      }
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err.message || 'Failed to send for signature.');
    } finally {
      setSubmitting(false);
    }
  };

  const stepState = (step) => {
    if (step === 1) return dealerId && alSerial.trim() && institutionName.trim() && institutionAddress.trim() && validUntil ? 'done' : 'active';
    if (step === 2) return generated ? (submitted ? 'done' : 'active') : '';
    if (step === 3) return submitted ? 'done' : '';
    return '';
  };

  return (
    <div className="dal-page">
      <div className="dal-shell">
        {/* Header */}
        <div className="dal-header">
          <div className="dal-header-inner">
            <div className="dal-header-icon">📜</div>
            <div>
              <div className="dal-breadcrumb">Dealer Management / Authorization Letter</div>
              <h1>Dealer Authorization Letter</h1>
              <p>Fill in the institution and dealer details to generate a ready-to-send, letterhead-branded supply authorization letter.</p>
            </div>
          </div>
          <div className="dal-header-badges">
            <span className="dal-header-badge">✅ Legal + Admin e-Signed PDF</span>
            <span className="dal-header-badge">🏢 {dealers.length} Dealers on File</span>
          </div>
        </div>

        {/* Step indicator */}
        <div className="dal-steps">
          <Step n={1} title="Fill Details" sub="Institution & Dealer" state={stepState(1)} />
          <div className={`dal-step-connector ${stepState(2) ? 'done' : ''}`} />
          <Step n={2} title="Preview Letter" sub="Review before export" state={stepState(2)} />
          <div className={`dal-step-connector ${stepState(3) ? 'done' : ''}`} />
          <Step n={3} title="Send for Signature" sub="Legal → Admin (OTP)" state={stepState(3)} />
        </div>

        <div className="dal-grid">
          {/* Left: Form */}
          <div className="dal-card">
            <h3 className="dal-card-title">
              <span className="badge-num">1</span>
              Letter Details
            </h3>
            <p className="dal-card-subtitle">Tell us the division, institution and dealer this authorization covers.</p>

            {formError && (
              <div className="dal-alert">
                <span>⚠️</span>
                <span>{formError}</span>
              </div>
            )}

            <div className="dal-field">
              <label htmlFor="division">Product Division <span className="req">*</span></label>
              <select
                id="division"
                className="dal-select"
                value={division}
                onChange={(e) => setDivision(e.target.value)}
              >
                <option value="Endo">Meril Endo Surgery Pvt. Ltd.</option>
                <option value="Diagno">Meril Diagnostics Pvt. Ltd.</option>
              </select>
              <div className="dal-hint">Determines the issuing company entity, address and signatory on the letter.</div>
            </div>

            <div className="dal-field">
              <label htmlFor="al-serial">AL Serial No. <span className="req">*</span></label>
              <div className="dal-input-wrap">
                <span className="field-icon">🔖</span>
                <input
                  id="al-serial"
                  type="text"
                  className="dal-input"
                  value={alSerial}
                  onChange={(e) => setAlSerial(e.target.value)}
                  placeholder="e.g. 44"
                />
              </div>
              <div className="dal-hint">Used to build the Ref. No., e.g. MEPL/2026-27/AL-44.</div>
            </div>

            <div className="dal-field">
              <label htmlFor="institution-name">Institution / Tender Authority Name <span className="req">*</span></label>
              <div className="dal-input-wrap">
                <span className="field-icon">🏥</span>
                <input
                  id="institution-name"
                  type="text"
                  className="dal-input"
                  value={institutionName}
                  onChange={(e) => setInstitutionName(e.target.value)}
                  placeholder="e.g. The Amrit Pharmacy C/o HLL Lifecare LTD"
                />
              </div>
            </div>

            <div className="dal-field">
              <label htmlFor="institution-address">Institution Address <span className="req">*</span></label>
              <textarea
                id="institution-address"
                className="dal-input"
                rows={3}
                value={institutionAddress}
                onChange={(e) => setInstitutionAddress(e.target.value)}
                placeholder={'e.g. All India Institute of Medical Sciences (AIIMS),\nKhanderi, Para Pipaliya, Rajkot, Gujarat, India, 360006'}
              />
              <div className="dal-hint">One line per address line — shown exactly as typed on the letter.</div>
            </div>

            <div className="dal-field">
              <label htmlFor="dealer-search">Dealer Name <span className="req">*</span></label>
              <DealerSearchSelect
                dealers={dealers}
                value={dealerId}
                onChange={setDealerId}
                loading={loadingDealers}
                error={loadError}
              />
              {loadError ? (
                <div className="dal-error">{loadError}</div>
              ) : (
                <div className="dal-hint">Dealers are pulled live from your Distributors list.</div>
              )}
            </div>

            <div className="dal-field">
              <label htmlFor="dealer-address">Dealer Address</label>
              <div className="dal-input-wrap">
                <span className="field-icon">📍</span>
                <input
                  id="dealer-address"
                  type="text"
                  className="dal-input"
                  value={dealerAddress}
                  onChange={(e) => setDealerAddress(e.target.value)}
                  placeholder="e.g. Shop No. 117, Auto Point, Sardar Vallabhbhai Patel Road, Near Lodhawad Police Station, Lodhawad Chowk"
                />
              </div>
              <div className="dal-hint">Optional — the dealer's city/state are appended automatically. Leave blank to use city/state only.</div>
            </div>

            <div className="dal-field">
              <label htmlFor="valid-until">Valid Up To <span className="req">*</span></label>
              <input
                id="valid-until"
                type="date"
                className="dal-input"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
              <div className="dal-hint">The date up to which this authorization letter remains valid.</div>
            </div>

            <button className="dal-generate-btn" onClick={handleGenerate}>
              ✨ Generate Authorization Letter
            </button>

            <hr className="dal-divider" />
            <p className="dal-section-label">Why teams trust this</p>
            <div className="dal-info-strip">
              <InfoCard icon="🏢" title={`${dealers.length} Dealers`} desc="Available for authorization" />
              <InfoCard icon="🖋️" title="Real Signature" desc="Scanned signatory & company stamp" />
              <InfoCard icon="🔒" title="Secure" desc="Backed by your dealer database" />
            </div>
          </div>

          {/* Right: Live preview */}
          <div className="dal-preview">
            <div className="dal-card">
              <div className="dal-preview-header">
                <h3 className="dal-card-title" style={{ margin: 0 }}>
                  <span className="badge-num">2</span>
                  Letter Preview
                </h3>
                {generated && (
                  <button
                    className={`dal-print-btn ${submitted ? 'downloaded' : ''}`}
                    onClick={handleSubmitForSignature}
                    disabled={submitting || submitted}
                    type="button"
                  >
                    {submitting ? '⏳ Sending…' : submitted ? '✓ Sent for Signature' : '📨 Send for Signature (Legal → Admin)'}
                  </button>
                )}
              </div>
              <p className={`dal-preview-status ${submitted ? 'ready' : ''}`} style={generated ? { paddingLeft: 34 } : { display: 'none' }}>
                {submitted
                  ? '🟢 Sent to the Legal Team for OTP signature — the signed PDF will be available on Pending Signatures once both Legal and Admin have signed'
                  : edited
                    ? '✏️ Edited — click Send for Signature to route your changes to Legal for signing'
                    : '🔵 Draft ready — click into the letter to edit, or send it for Legal + Admin OTP signature'}
                {edited && !submitted && (
                  <button type="button" className="dal-reset-link" onClick={handleResetEdits}>↺ Reset to original</button>
                )}
              </p>

              {submitError && (
                <div className="dal-alert" style={{ marginBottom: 16 }}>
                  <span>⚠️</span>
                  <span>{submitError}</span>
                </div>
              )}

              {generated ? (
                <div className="al-sheet-wrap">
                  {submitted && (
                    <div className="al-ribbon-clip">
                      <div className="al-downloaded-ribbon">Sent for Signature</div>
                    </div>
                  )}
                  <div className="al-sheet" ref={letterRef}>
                    {!submitted && <span className="al-watermark">DRAFT</span>}
                    <div className="al-letterhead">
                      <img src={LetterdHeader} alt="Meril" />
                      <div className="al-company-block">
                        <strong>{(DIVISIONS[division] || DIVISIONS.Endo).companyName}</strong>
                        Muktanand Marg, Chala, Vapi – 396 191,<br />
                        Gujarat, India · www.merillife.com
                      </div>
                    </div>

                    {/* Editable letter body — this exact HTML (with any edits) is what
                        gets sent to the backend for the official PDF. */}
                    <div
                      className="al-sheet-body"
                      contentEditable
                      suppressContentEditableWarning
                      ref={bodyRef}
                      onInput={() => setEdited(true)}
                      spellCheck
                    />

                    <div className="al-sig-hint">
                      ✍️ No signature is applied yet — click anywhere above to edit the letter text first, then
                      Send for Signature. Legal signs via emailed OTP, then Admin (Ravi Kiran) signs the same way;
                      the fully signed PDF appears once both are done.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="dal-preview-empty">
                  <div className="icon">🗒️</div>
                  <h3>Nothing generated yet</h3>
                  <p>Fill in the tender number and select a dealer, then hit Generate to see the letterhead preview here.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Step = ({ n, title, sub, state }) => (
  <div className={`dal-step ${state}`}>
    <div className="dal-step-circle">{state === 'done' ? '✓' : n}</div>
    <div className="dal-step-label">
      <span className="t">{title}</span>
      <span className="s">{sub}</span>
    </div>
  </div>
);

const DealerSearchSelect = ({ dealers, value, onChange, loading, error }) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef(null);

  const selected = dealers.find(d => String(d.id) === String(value));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return dealers;
    return dealers.filter(d =>
      d.companyName.toLowerCase().includes(q) ||
      (d.cityName || '').toLowerCase().includes(q) ||
      (d.personName || '').toLowerCase().includes(q)
    );
  }, [dealers, query]);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const selectDealer = (d) => {
    onChange(String(d.id));
    setQuery('');
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlight]) selectDealer(filtered[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  };

  const placeholder = loading ? 'Loading dealers...' : error ? 'Failed to load dealers' : 'Search dealer by name or city...';

  return (
    <div className="dal-combobox" ref={wrapRef}>
      <div className={`dal-select dal-combobox-control ${open ? 'open' : ''}`} onClick={() => !loading && !error && setOpen(true)}>
        <span className="dal-combobox-icon">🔍</span>
        <input
          id="dealer-search"
          type="text"
          className="dal-combobox-input"
          value={open ? query : (selected?.companyName || '')}
          onChange={(e) => { setQuery(e.target.value); setHighlight(0); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={selected && !open ? selected.companyName : placeholder}
          disabled={loading || !!error}
          autoComplete="off"
        />
        {selected && !open && (
          <button
            type="button"
            className="dal-combobox-clear"
            onClick={(e) => { e.stopPropagation(); onChange(''); setQuery(''); }}
            aria-label="Clear selected dealer"
          >
            ×
          </button>
        )}
        <span className="dal-combobox-arrow">▾</span>
      </div>

      {open && !loading && !error && (
        <div className="dal-combobox-list">
          {filtered.length === 0 ? (
            <div className="dal-combobox-empty">No dealers match "{query}"</div>
          ) : (
            filtered.map((d, i) => (
              <div
                key={d.id}
                className={`dal-combobox-option ${String(d.id) === String(value) ? 'selected' : ''} ${i === highlight ? 'highlighted' : ''}`}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => selectDealer(d)}
              >
                <div className="dal-combobox-option-main">{d.companyName}</div>
                <div className="dal-combobox-option-sub">{d.personName} · {d.cityName}{d.state ? `, ${d.state}` : ''}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

const InfoCard = ({ icon, title, desc }) => (
  <div className="dal-info-card">
    <div className="icon">{icon}</div>
    <div>
      <h4>{title}</h4>
      <p>{desc}</p>
    </div>
  </div>
);

export default DealerAuthorizationLetter;
