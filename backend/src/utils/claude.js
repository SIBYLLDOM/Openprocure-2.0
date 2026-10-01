'use strict';
const Anthropic = require('@anthropic-ai/sdk');

let _client = null;
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

async function callClaude(system, user, maxTokens = 4096) {
  const msg = await getClient().messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: maxTokens,
    system,
    messages:   [{ role: 'user', content: user }],
  });
  return msg.content[0].text;
}

module.exports = { callClaude };
