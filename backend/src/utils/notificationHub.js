'use strict';

/**
 * In-process pub/sub for live notification delivery over SSE.
 *
 * Kept separate from notify.js so the controller can subscribe and the notify
 * service can publish without importing each other. State is per-process: with
 * multiple backend instances behind a load balancer this would need Redis, but
 * this app runs a single node process.
 */
const clients = new Map(); // userId -> Set<res>

function subscribe(userId, res) {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);
  return () => unsubscribe(userId, res);
}

function unsubscribe(userId, res) {
  const set = clients.get(userId);
  if (!set) return;
  set.delete(res);
  if (!set.size) clients.delete(userId);
}

/** Pushes an event to every open connection for this user. Never throws. */
function publish(userId, payload) {
  const set = clients.get(Number(userId));
  if (!set || !set.size) return 0;

  const frame = `data: ${JSON.stringify(payload)}\n\n`;
  let delivered = 0;
  for (const res of set) {
    try {
      res.write(frame);
      delivered += 1;
    } catch {
      unsubscribe(userId, res); // dead socket
    }
  }
  return delivered;
}

const connectionCount = () => [...clients.values()].reduce((n, s) => n + s.size, 0);

module.exports = { subscribe, unsubscribe, publish, connectionCount };
