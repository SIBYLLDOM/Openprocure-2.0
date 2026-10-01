import { useEffect, useRef } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL;
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

export function useActivityTracker() {
  const hasActivityRef = useRef(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const sessionId = localStorage.getItem('sessionId');
    if (!token || !sessionId) return;

    const markActivity = () => { hasActivityRef.current = true; };
    window.addEventListener('mousemove', markActivity);
    window.addEventListener('keydown', markActivity);
    window.addEventListener('click', markActivity);
    window.addEventListener('scroll', markActivity);

    intervalRef.current = setInterval(async () => {
      if (!hasActivityRef.current) return;
      hasActivityRef.current = false;
      try {
        await fetch(`${API_BASE}/monitoring/session/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
          body: JSON.stringify({ sessionId: Number(sessionId) }),
        });
      } catch (_) {}
    }, HEARTBEAT_INTERVAL);

    const handleUnload = () => {
      const sid = localStorage.getItem('sessionId');
      const tok = localStorage.getItem('token');
      if (!sid || !tok) return;
      navigator.sendBeacon(
        `${API_BASE}/monitoring/session/end`,
        new Blob([JSON.stringify({ sessionId: Number(sid) })], { type: 'application/json' })
      );
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearInterval(intervalRef.current);
      window.removeEventListener('mousemove', markActivity);
      window.removeEventListener('keydown', markActivity);
      window.removeEventListener('click', markActivity);
      window.removeEventListener('scroll', markActivity);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, []);
}
