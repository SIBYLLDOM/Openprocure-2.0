import React, { useState } from 'react';
import { Download, Mail, X, FileText, File as FileIcon } from 'lucide-react';

// Matches the existing small "ghost" action-button look used across
// WorkspaceDocPrep / WorkspaceMyDocs / Library (white bg, thin border).
const btnStyle = {
  background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 7,
  padding: '0.4rem 0.75rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem',
  display: 'inline-flex', alignItems: 'center', gap: 5,
};
const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};
const modalStyle = {
  background: '#fff', borderRadius: 12, padding: '1.5rem', width: 420, maxWidth: '90vw',
  boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
};
const titleStyle = { margin: '0 0 1rem', fontSize: '1.0625rem', fontWeight: 700, color: '#111827' };
const cardStyle = {
  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
  padding: '1.5rem 1rem', border: '1.5px solid #d1d5db', borderRadius: 10,
  background: '#f8fafc', cursor: 'pointer',
};
const inputStyle = {
  width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #d1d5db', borderRadius: 8,
  fontSize: '0.875rem', boxSizing: 'border-box', marginBottom: '1rem',
};

/**
 * One "Download" + "Share" pair, reused everywhere a document can leave the
 * app — Doc Prep's generated annexures, My Docs' drafted/uploaded documents,
 * etc. Given more than one format, Download opens the same two-card picker
 * pattern used elsewhere for Computer/Library choices (icon + label +
 * one-line description); given exactly one, it downloads/shares directly —
 * an uploaded file that's already a PDF has nothing to pick between.
 *
 * formats: [{ key, label, description?, icon?, iconColor?,
 *   onDownload: () => Promise<void>,
 *   onShare: (email) => Promise<{ success: boolean, message?: string }> }]
 */
export default function DownloadShareButtons({
  formats, downloadLabel = 'Download', shareLabel = 'Share', disabled = false, disabledTitle,
  downloadButtonStyle, shareButtonStyle, hideShare = false,
}) {
  const [busyKey, setBusyKey] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareFormatKey, setShareFormatKey] = useState(null);
  const [shareEmail, setShareEmail] = useState('');
  const [sharing, setSharing] = useState(false);
  const [shareMsg, setShareMsg] = useState(null);

  const single = formats.length === 1;
  const shareFormat = formats.find(f => f.key === shareFormatKey) || formats[0];

  const doDownload = async (fmt) => {
    setBusyKey(fmt.key);
    setPickerOpen(false);
    try {
      await fmt.onDownload();
    } catch (e) {
      alert('Download failed: ' + (e?.message || e));
    } finally {
      setBusyKey(null);
    }
  };

  // One popup, straight to the email field — if there's more than one
  // format, its choice sits inline at the top instead of being its own
  // separate screen first.
  const openShare = () => {
    setShareMsg(null);
    setShareEmail('');
    setShareFormatKey(formats[0].key);
    setShareOpen(true);
  };

  const closeShare = () => {
    if (sharing) return;
    setShareOpen(false);
  };

  const doShare = async () => {
    if (!shareEmail.trim()) return;
    setSharing(true);
    setShareMsg(null);
    try {
      const result = await shareFormat.onShare(shareEmail.trim());
      if (result?.success) {
        setShareMsg({ ok: true, text: result.message || `Sent to ${shareEmail.trim()}` });
      } else {
        setShareMsg({ ok: false, text: result?.message || 'Failed to send' });
      }
    } catch (e) {
      setShareMsg({ ok: false, text: e?.message || 'Failed to send' });
    } finally {
      setSharing(false);
    }
  };

  const dlStyle = { ...btnStyle, ...downloadButtonStyle };
  const shStyle = { ...btnStyle, ...shareButtonStyle };

  return (
    <>
      <button
        style={(busyKey || disabled) ? { ...dlStyle, opacity: 0.5, cursor: 'not-allowed' } : dlStyle}
        disabled={!!busyKey || disabled}
        title={disabled ? disabledTitle : undefined}
        onClick={() => (single ? doDownload(formats[0]) : setPickerOpen(true))}
      >
        <Download size={13} /> {busyKey ? 'Downloading…' : downloadLabel}
      </button>
      {!hideShare && (
        <button
          style={disabled ? { ...shStyle, opacity: 0.5, cursor: 'not-allowed' } : shStyle}
          disabled={disabled}
          title={disabled ? disabledTitle : undefined}
          onClick={openShare}
        >
          <Mail size={13} /> {shareLabel}
        </button>
      )}

      {/* Format picker (only shown when there's more than one format) */}
      {pickerOpen && (
        <div style={overlayStyle} onClick={() => setPickerOpen(false)}>
          <div style={modalStyle} onClick={e => e.stopPropagation()}>
            <h3 style={titleStyle}>Download as…</h3>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              {formats.map(fmt => {
                const Icon = fmt.icon || FileText;
                return (
                  <button key={fmt.key} style={cardStyle} onClick={() => doDownload(fmt)}>
                    <Icon size={26} color={fmt.iconColor || '#2563eb'} />
                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1f2937' }}>{fmt.label}</span>
                    {fmt.description && (
                      <span style={{ fontSize: '0.75rem', color: '#6b7280', textAlign: 'center' }}>{fmt.description}</span>
                    )}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button onClick={() => setPickerOpen(false)} style={btnStyle}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Share modal — one screen: email field, plus an inline format toggle
          when there's more than one format to choose from. */}
      {shareOpen && (
        <div style={overlayStyle} onClick={closeShare}>
          <div style={modalStyle} onClick={e => e.stopPropagation()}>
            <h3 style={titleStyle}>Share document</h3>

            {!single && (
              <>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>
                  Format
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                  {formats.map(fmt => {
                    const active = fmt.key === shareFormatKey;
                    return (
                      <button
                        key={fmt.key}
                        onClick={() => setShareFormatKey(fmt.key)}
                        style={{
                          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          padding: '0.5rem 0.75rem', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.825rem',
                          border: active ? '1.5px solid #2563eb' : '1.5px solid #d1d5db',
                          background: active ? '#eff6ff' : '#f8fafc',
                          color: active ? '#1d4ed8' : '#374151',
                        }}
                      >
                        {React.createElement(fmt.icon || FileText, { size: 15, color: active ? '#1d4ed8' : (fmt.iconColor || '#6b7280') })}
                        {fmt.label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: '0.375rem' }}>
              Recipient email
            </label>
            <input
              style={inputStyle}
              type="email"
              value={shareEmail}
              onChange={e => setShareEmail(e.target.value)}
              placeholder="name@company.com"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && doShare()}
            />
            {shareMsg && (
              <p style={{ margin: '-0.5rem 0 1rem', fontSize: '0.8125rem', color: shareMsg.ok ? '#166534' : '#dc2626' }}>
                {shareMsg.text}
              </p>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={closeShare} disabled={sharing} style={btnStyle}>Cancel</button>
              <button
                onClick={doShare}
                disabled={sharing || !shareEmail.trim()}
                style={{ ...btnStyle, background: '#2563eb', color: '#fff', border: 'none', opacity: sharing || !shareEmail.trim() ? 0.6 : 1 }}
              >
                {sharing ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export { FileText as PdfIcon, FileIcon as WordIcon };
