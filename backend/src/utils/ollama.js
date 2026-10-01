'use strict';
const { Ollama } = require('ollama');

/**
 * Cloud models are metered per account — when the quota runs out Ollama
 * answers 429 and every AI feature stops. FALLBACK_MODEL is a locally
 * installed model that needs no quota, used automatically in that case.
 * Both are overridable via .env.
 */
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'gpt-oss:120b-cloud';
const FALLBACK_MODEL = process.env.OLLAMA_FALLBACK_MODEL || 'qwen2.5:7b';

/** Quota / rate-limit refusals worth retrying on a local model. */
function isQuotaError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return err?.status_code === 429
    || msg.includes('usage limit')
    || msg.includes('rate limit')
    || msg.includes('upgrade for higher limits');
}

/**
 * Shared Ollama helper — keeps model name and host in one place.
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {number} [temperature=0.05]
 * @param {number} [numPredict=16000]
 * @param {string} [model]  override the default model
 * @param {string[]} [images]  base64-encoded page images, for a vision-capable model
 */
async function callOllama(systemPrompt, userPrompt, temperature = 0.05, numPredict = 16000, model = DEFAULT_MODEL, images = null) {
  const ollama = new Ollama({ host: process.env.OLLAMA_HOST || 'https://api.openprocure.ai' });
  const userMessage = { role: 'user', content: userPrompt };
  if (images && images.length) userMessage.images = images;
  const messages = [
    { role: 'system', content: systemPrompt },
    userMessage,
  ];

  try {
    const resp = await ollama.chat({ model, messages, options: { temperature, num_predict: numPredict } });
    return resp.message.content;
  } catch (err) {
    if (!isQuotaError(err) || model === FALLBACK_MODEL) throw err;

    console.warn(`[ollama] ${model} refused (${err.status_code || 'quota'}) — retrying on ${FALLBACK_MODEL}`);
    const resp = await ollama.chat({
      model: FALLBACK_MODEL,
      messages,
      options: { temperature, num_predict: numPredict },
    });
    return resp.message.content;
  }
}

/**
 * Strip markdown fences and extract the first JSON object or array from raw text.
 */
function parseJsonResponse(raw) {
  let cleaned = raw.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const arr = cleaned.match(/\[[\s\S]*\]/);
  if (arr) try { return JSON.parse(arr[0]); } catch { /* fall through */ }
  const obj = cleaned.match(/\{[\s\S]*\}/);
  if (obj) try { return JSON.parse(obj[0]); } catch { /* fall through */ }
  throw new Error('No JSON found in model response');
}

module.exports = {
  DEFAULT_MODEL,
  FALLBACK_MODEL,
  isQuotaError, callOllama, parseJsonResponse };
