import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck, Clock, ThumbsUp, ThumbsDown, Volume2, VolumeX } from 'lucide-react';
import bellSound from '../../assets/text_bell.mp3';

/**
 * Notification bell.
 *
 * Live via server-sent events: /api/notifications/stream pushes each new
 * notification the moment it is created, so the bell updates without a reload.
 * The 60s poll is kept purely as a safety net for when the stream drops (sleep,
 * network blip, proxy timeout) — EventSource reconnects on its own, and the
 * poll reconciles anything missed in between.
 *
 * Emails are sent server-side alongside each notification; this component only
 * ever reads.
 */

const ICONS = {
  approval_requested: { Icon: Clock, color: '#d97706' },
  approval_approved: { Icon: ThumbsUp, color: '#15803d' },
  approval_rejected: { Icon: ThumbsDown, color: '#dc2626' },
};

const POLL_MS = 60000;
const MUTE_KEY = 'notif_sound_muted';

const relativeTime = (value) => {
  if (!value) return '';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return days < 30 ? `${days}d ago` : new Date(value).toLocaleDateString();
};

const NotificationBell = () => {
  const navigate = useNavigate();
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(() => localStorage.getItem(MUTE_KEY) === '1');
  const ref = useRef(null);

  // Chime setup. The audio element is created once and reused; browsers block
  // playback until the user has interacted with the page, so play() rejections
  // are swallowed rather than logged as errors.
  const audioRef = useRef(null);
  const prevUnreadRef = useRef(null);
  const mutedRef = useRef(muted);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  useEffect(() => {
    const el = new Audio(bellSound);
    el.preload = 'auto';
    el.volume = 0.55;
    audioRef.current = el;
    return () => { el.pause(); audioRef.current = null; };
  }, []);

  const playChime = useCallback(() => {
    if (mutedRef.current || !audioRef.current) return;
    try {
      audioRef.current.currentTime = 0;
      const p = audioRef.current.play();
      if (p && typeof p.catch === 'function') p.catch(() => { /* autoplay blocked */ });
    } catch { /* ignore */ }
  }, []);

  const load = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    try {
      const res = await fetch(`${API_BASE_URL}/notifications?limit=20`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setItems(data.data || []);
        const count = data.unread_count || 0;

        // Chime only when the unread count actually grows. prevUnread starts
        // null so the first poll after a page load stays silent — otherwise
        // every navigation would replay the sound for old notifications.
        if (prevUnreadRef.current !== null && count > prevUnreadRef.current) {
          playChime();
        }
        prevUnreadRef.current = count;
        setUnread(count);
      }
    } catch {
      /* offline or server down — keep whatever we already showed */
    } finally {
      setLoading(false);
    }
  }, [API_BASE_URL, playChime]);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  // Live stream. EventSource cannot send an Authorization header, so the token
  // goes in the query string (verified server-side the same way).
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const es = new EventSource(
      `${API_BASE_URL}/notifications/stream?token=${encodeURIComponent(token)}`
    );

    es.onmessage = (e) => {
      let n;
      try { n = JSON.parse(e.data); } catch { return; }
      if (!n || !n.id) return;

      setItems(prev => (prev.some(x => x.id === n.id) ? prev : [n, ...prev].slice(0, 20)));
      setUnread(u => {
        const next = u + 1;
        prevUnreadRef.current = next; // keep the poll from re-chiming for this one
        return next;
      });
      playChime();
    };

    // On error the browser retries automatically using the server's `retry`
    // interval; the poll covers the gap, so nothing to do here but stay quiet.
    es.onerror = () => { };

    return () => es.close();
  }, [API_BASE_URL, playChime]);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const markRead = async (id) => {
    try {
      await fetch(`${API_BASE_URL}/notifications/${id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
    } catch { /* best effort */ }
  };

  const markAllRead = async () => {
    setItems(prev => prev.map(n => ({ ...n, is_read: 1 })));
    setUnread(0);
    try {
      await fetch(`${API_BASE_URL}/notifications/read-all`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
    } catch { /* best effort */ }
    load();
  };

  const openItem = async (n) => {
    if (!n.is_read) {
      setItems(prev => prev.map(x => (x.id === n.id ? { ...x, is_read: 1 } : x)));
      setUnread(u => Math.max(0, u - 1));
      await markRead(n.id);
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <style>{`
        @keyframes nb-in { from { opacity:0; transform: translateY(-6px) } to { opacity:1; transform:none } }
        .nb-panel { animation: nb-in .14s ease-out }
        .nb-item { transition: background .12s }
        .nb-item:hover { background: #f8fafc }
        .nb-btn:hover { background: rgba(255,255,255,.14) }
      `}</style>

      <button
        className="nb-btn"
        onClick={() => setOpen(o => !o)}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-haspopup="true"
        aria-expanded={open}
        style={{
          position: 'relative', background: 'none', border: 'none', cursor: 'pointer',
          width: '36px', height: '36px', borderRadius: '9px', color: 'inherit',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Bell size={19} />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: '3px', right: '3px', minWidth: '17px', height: '17px',
            padding: '0 4px', borderRadius: '999px', background: '#dc2626', color: '#fff',
            fontSize: '10.5px', fontWeight: 700, lineHeight: '17px', textAlign: 'center',
            boxShadow: '0 0 0 2px rgba(8,79,154,.9)',
          }}>{unread > 99 ? '99+' : unread}</span>
        )}
      </button>

      {open && (
        <div
          className="nb-panel"
          style={{
            position: 'absolute', right: 0, top: 'calc(100% + 10px)', width: 'min(370px, 92vw)',
            background: '#fff', borderRadius: '12px', border: '1px solid #e6ecf5',
            boxShadow: '0 18px 40px -12px rgba(15,23,42,.3)', zIndex: 1200, overflow: 'hidden',
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px', borderBottom: '1px solid #eef2f7',
          }}>
            <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>
              Notifications {unread > 0 && <span style={{ color: '#64748b', fontWeight: 500 }}>({unread} new)</span>}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  style={{
                    border: 'none', background: 'none', cursor: 'pointer', color: '#084f9a',
                    fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px',
                  }}
                >
                  <CheckCheck size={13} /> Mark all read
                </button>
              )}
              <button
                onClick={() => {
                  const next = !muted;
                  setMuted(next);
                  localStorage.setItem(MUTE_KEY, next ? '1' : '0');
                  if (!next) playChime(); // preview when switching sound back on
                }}
                title={muted ? 'Sound off — click to enable' : 'Sound on — click to mute'}
                aria-label={muted ? 'Enable notification sound' : 'Mute notification sound'}
                style={{
                  border: 'none', background: 'none', cursor: 'pointer',
                  color: muted ? '#cbd5e1' : '#084f9a', display: 'flex', alignItems: 'center',
                }}
              >
                {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
            </div>
          </div>

          <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
            {loading && (
              <div style={{ padding: '18px 14px', fontSize: '13px', color: '#94a3b8' }}>Loading…</div>
            )}

            {!loading && items.length === 0 && (
              <div style={{ padding: '28px 16px', textAlign: 'center' }}>
                <Bell size={22} style={{ color: '#cbd5e1' }} />
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#475569', marginTop: '8px' }}>You're all caught up</div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>Approval activity will show up here.</div>
              </div>
            )}

            {!loading && items.map(n => {
              const meta = ICONS[n.type] || { Icon: Bell, color: '#084f9a' };
              const NIcon = meta.Icon;
              return (
                <button
                  key={n.id}
                  className="nb-item"
                  onClick={() => openItem(n)}
                  style={{
                    display: 'flex', gap: '10px', width: '100%', textAlign: 'left',
                    padding: '11px 14px', border: 'none', cursor: 'pointer',
                    borderBottom: '1px solid #f4f7fb',
                    background: n.is_read ? '#fff' : '#f5f9ff',
                  }}
                >
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                    background: `${meta.color}14`, color: meta.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <NIcon size={14} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '13px', fontWeight: n.is_read ? 500 : 700,
                      color: '#0f172a', lineHeight: 1.35,
                    }}>{n.title}</div>
                    {n.body && (
                      <div
                        style={{ fontSize: '12px', color: '#64748b', marginTop: '2px', lineHeight: 1.4 }}
                        // Bodies are built server-side from our own templates
                        // (names/bid numbers wrapped in <b>), never user HTML.
                        dangerouslySetInnerHTML={{ __html: n.body }}
                      />
                    )}
                    <div style={{ fontSize: '11px', color: '#a3b0c2', marginTop: '3px' }}>
                      {relativeTime(n.created_at)}
                    </div>
                  </div>

                  {!n.is_read && (
                    <span style={{
                      width: '7px', height: '7px', borderRadius: '50%',
                      background: '#084f9a', flexShrink: 0, marginTop: '6px',
                    }} />
                  )}
                </button>
              );
            })}
          </div>

          {items.length > 0 && (
            <button
              onClick={() => { setOpen(false); navigate('/Admin/approvals'); }}
              style={{
                width: '100%', padding: '10px', border: 'none', borderTop: '1px solid #eef2f7',
                background: '#fbfcfe', color: '#084f9a', fontSize: '12.5px', fontWeight: 600,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
              }}
            >
              <Check size={13} /> View all approvals
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
