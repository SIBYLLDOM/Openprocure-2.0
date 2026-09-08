'use strict';

// Shared local-Ollama wrapper — used by both productMatcher.js (Suggested
// Products matching) and docPrepController.js (annexure discovery/drafting).
// Points at whatever model the user has pulled locally (see
// productMatcher.js's history: the original's cloud-hosted 'gemma4:31b-cloud'
// isn't realistic here, so this defaults to a small local model instead).

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const MODEL_NAME = process.env.OLLAMA_MODEL || 'qwen2.5:1.5b';

function parseJsonResponse(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try { return JSON.parse(raw.trim()); } catch (_) {}
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1].trim()); } catch (_) {} }
  const arr = raw.match(/\[[\s\S]*\]/);
  if (arr) { try { return JSON.parse(arr[0]); } catch (_) {} }
  const obj = raw.match(/\{[\s\S]*\}/);
  if (obj) { try { return JSON.parse(obj[0]); } catch (_) {} }
  return null;
}

async function ollamaChat(systemPrompt, userContent, { json = true, numPredict = 8192, temperature = 0.1 } = {}) {
  const body = {
    model: MODEL_NAME,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    stream: false,
    keep_alive: -1,
    options: { temperature, num_predict: numPredict },
  };
  if (json) body.format = 'json';

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resp = await fetch(`${OLLAMA_HOST}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(180000),
      });
      if (!resp.ok) throw new Error(`Ollama HTTP ${resp.status}: ${await resp.text()}`);
      const data = await resp.json();
      return data.message?.content || '';
    } catch (e) {
      if (attempt >= maxAttempts) throw e;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

async function isOllamaAvailable() {
  try {
    const resp = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!resp.ok) return false;
    const data = await resp.json();
    return Array.isArray(data.models) && data.models.some((m) => m.name === MODEL_NAME || m.model === MODEL_NAME);
  } catch (_) {
    return false;
  }
}

module.exports = { ollamaChat, parseJsonResponse, isOllamaAvailable, MODEL_NAME };
