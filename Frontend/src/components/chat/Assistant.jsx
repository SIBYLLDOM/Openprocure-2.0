import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_BASE_URL;

const GREETING = {
  role: 'assistant',
  content: "Hi. Give me a tender number and I'll tell you which portal it's on and open it — "
    + "GeM or any state. You can also ask things like \"suture tenders in Rajasthan\" "
    + "or \"how many endo tenders are open\".",
};

export default function Assistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([GREETING]);
  const [actions, setActions] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, actions, busy]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    // The buttons belong to the answer that produced them; a new question
    // invalidates them, so clear rather than leave stale ones on screen.
    setActions([]);
    const next = [...messages, { role: 'user', content: q }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        // The greeting is ours, not part of the conversation the model needs.
        body: JSON.stringify({ messages: next.filter(m => m !== GREETING) }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || 'Assistant unavailable');
      setMessages(m => [...m, { role: 'assistant', content: j.reply }]);
      setActions(j.actions || []);
    } catch (e) {
      setMessages(m => [...m, { role: 'assistant', content: `Sorry — ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  };

  const go = (a) => {
    navigate(a.url);
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open assistant"
        style={{
          position: 'fixed', right: 22, bottom: 22, zIndex: 1200,
          width: 54, height: 54, borderRadius: '50%', border: 0, cursor: 'pointer',
          background: '#1f4e8c', color: '#fff', fontSize: 22,
          boxShadow: '0 6px 18px rgba(15,23,42,.28)',
        }}
      >💬</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', right: 22, bottom: 22, zIndex: 1200,
      width: 390, maxWidth: 'calc(100vw - 32px)', height: 560, maxHeight: 'calc(100vh - 60px)',
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
      boxShadow: '0 12px 40px rgba(15,23,42,.22)', display: 'flex', flexDirection: 'column',
      fontFamily: 'inherit',
    }}>
      <div style={{
        background: '#1f4e8c', color: '#fff', padding: '11px 14px',
        borderRadius: '12px 12px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>OpenProcure Assistant</div>
          <div style={{ fontSize: 11, opacity: .8 }}>Finds tenders across GeM and all states</div>
        </div>
        <button onClick={() => setOpen(false)} aria-label="Close"
          style={{ background: 'transparent', border: 0, color: '#fff', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 14, background: '#f8fafc' }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
            <div style={{
              maxWidth: '85%', padding: '9px 12px', borderRadius: 10, fontSize: 13.5, lineHeight: 1.5,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              background: m.role === 'user' ? '#1f4e8c' : '#fff',
              color: m.role === 'user' ? '#fff' : '#1a1d21',
              border: m.role === 'user' ? 0 : '1px solid #e2e8f0',
            }}>{m.content}</div>
          </div>
        ))}

        {actions.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {actions.map((a, i) => (
              <button key={i} onClick={() => go(a)} style={{
                textAlign: 'left', background: '#fff', border: '1px solid #1f4e8c',
                borderRadius: 8, padding: '9px 12px', cursor: 'pointer',
              }}>
                <div style={{ color: '#1f4e8c', fontWeight: 600, fontSize: 13 }}>{a.label}</div>
                {a.subtitle && <div style={{ color: '#64748b', fontSize: 11.5, marginTop: 2 }}>{a.subtitle}</div>}
              </button>
            ))}
          </div>
        )}

        {busy && <div style={{ color: '#64748b', fontSize: 13, padding: '4px 2px' }}>Looking…</div>}
        <div ref={endRef} />
      </div>

      <div style={{ borderTop: '1px solid #e2e8f0', padding: 10, display: 'flex', gap: 8 }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Tender number, or ask a question…"
          disabled={busy}
          style={{
            flex: 1, border: '1px solid #e2e8f0', borderRadius: 8,
            padding: '9px 11px', fontSize: 13.5, outline: 'none',
          }}
        />
        <button onClick={() => send()} disabled={busy || !input.trim()} style={{
          background: busy || !input.trim() ? '#e2e8f0' : '#1f4e8c',
          color: busy || !input.trim() ? '#94a3b8' : '#fff',
          border: 0, borderRadius: 8, padding: '0 16px', fontSize: 13,
          fontWeight: 600, cursor: busy || !input.trim() ? 'default' : 'pointer',
        }}>Send</button>
      </div>
    </div>
  );
}
