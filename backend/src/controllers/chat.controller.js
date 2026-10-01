'use strict';
const { getTenders, getTenderDetails } = require('./tenders.controller');
const { getUserScope, canAccessTender } = require('../utils/userScope');
const { callOllama, parseJsonResponse } = require('../utils/ollama');

// A Sales/Tender/Admin role browses tenders under /Admin, everyone else
// under /User — same split navbar.jsx uses to build its own links.
const ADMIN_ROLES = ['Admin', 'Tender Admin', 'Office Administrator', 'Tender Executive', 'Zonal Head', 'Sales', 'Finance Team', 'Legal', 'Documentation'];
const basePathFor = (role) => (ADMIN_ROLES.includes(role) ? '/Admin' : '/User');

/**
 * Calls an existing Express handler (getTenders / getTenderDetails) directly,
 * without going back through HTTP — they're already fully role-scoped, so
 * this reuses that logic exactly instead of re-implementing tender queries.
 */
function invoke(fn, { query = {}, params = {}, user }) {
  return new Promise((resolve) => {
    const req = { query, params, user };
    const res = {
      _status: 200,
      status(code) { this._status = code; return this; },
      json(payload) { resolve({ status: this._status, body: payload }); },
    };
    Promise.resolve(fn(req, res)).catch((err) => resolve({ status: 500, body: { success: false, message: err.message } }));
  });
}

// 3+ segments separated by / or _ (e.g. GEM/2024/B/123, 2024_GEM_123456),
// or a bare 6+ digit run — matches the shape tenders.controller.js's own
// search already treats as a tender id, not free text.
function extractBidNumberCandidate(text) {
  const segmented = text.match(/[A-Za-z0-9]{2,}(?:[\/_][A-Za-z0-9]{1,}){2,}/);
  if (segmented) return segmented[0];
  const bare = text.match(/\b\d{6,}\b/);
  return bare ? bare[0] : null;
}

async function tryBidNumberLookup(candidate, req, scope) {
  const { status, body } = await invoke(getTenderDetails, { params: { bidNumber: candidate }, user: req.user });
  if (status !== 200 || !body.success) return null;

  const allowed = await canAccessTender(scope, candidate);
  if (!allowed) {
    return { reply: "You don't have access to that tender.", actions: [] };
  }

  const d = body.data || {};
  const title = d.tender_title || d.items || candidate;
  const portal = body.open_source ? (d.state ? `the ${d.state} eProcurement portal` : 'a state eProcurement portal') : 'GeM';
  const basePath = basePathFor(req.user.role);
  const url = `${basePath}/tenderdetails/${encodeURIComponent(candidate)}`;

  return {
    reply: `Found it — "${title}" on ${portal}.`,
    actions: [{ label: 'Open tender', subtitle: candidate, url }],
  };
}

const FILTER_EXTRACTION_SYSTEM = `You convert a user's tender-search question into structured search filters for an Indian government tender database. Respond with ONLY a JSON object, no markdown, no explanation.`;

function filterExtractionPrompt(question) {
  return `Extract search filters from this question: "${question}"

Return exactly this shape:
{"search": "<free-text keyword to search tender titles for, or empty string if none>", "state": "<Indian state name if one is mentioned, else null>", "dept": "<'Endo' if about endoscopy/endo-surgery tenders, 'Diagno' if about diagnostics tenders, else null>", "count_only": <true if the question is asking "how many"/for a count rather than a list, else false>}

Examples:
"suture tenders in Rajasthan" -> {"search":"suture","state":"Rajasthan","dept":null,"count_only":false}
"how many endo tenders are open" -> {"search":"","state":null,"dept":"Endo","count_only":true}
"diagno tenders in Gujarat" -> {"search":"","state":"Gujarat","dept":"Diagno","count_only":false}`;
}

async function naturalLanguageSearch(question, req) {
  let filters = { search: '', state: null, dept: null, count_only: false };
  try {
    const raw = await callOllama(FILTER_EXTRACTION_SYSTEM, filterExtractionPrompt(question), 0.1, 300);
    const parsed = parseJsonResponse(raw);
    filters = { ...filters, ...parsed };
  } catch (e) {
    console.warn('[chat] filter extraction failed, searching with raw question:', e.message);
    filters.search = question;
  }

  const baseQuery = {
    limit: 5, page: 1,
    search: filters.search || '',
    state: filters.state || '',
    dept: filters.dept || '',
  };

  const [gem, open] = await Promise.all([
    invoke(getTenders, { query: { ...baseQuery, tenderType: 'GEM' }, user: req.user }),
    invoke(getTenders, { query: { ...baseQuery, tenderType: 'Open' }, user: req.user }),
  ]);

  const gemData = gem.body?.success ? gem.body : { data: [], total: 0 };
  const openData = open.body?.success ? open.body : { data: [], total: 0 };
  const total = (gemData.total || 0) + (openData.total || 0);

  const basePath = basePathFor(req.user.role);
  const toAction = (t, portalLabel) => ({
    label: t.tender_title || t.items || t.bid_number || t.tender_id,
    subtitle: [t.state, portalLabel].filter(Boolean).join(' · '),
    url: `${basePath}/tenderdetails/${encodeURIComponent(t.bid_number || t.tender_id)}`,
  });
  const actions = [
    ...(gemData.data || []).slice(0, 3).map((t) => toAction(t, 'GeM')),
    ...(openData.data || []).slice(0, 3).map((t) => toAction(t, t.state || 'State portal')),
  ].slice(0, 5);

  if (!total) {
    return { reply: "I couldn't find any tenders matching that.", actions: [] };
  }

  const descriptor = [filters.dept, filters.search].filter(Boolean).join(' ') || 'matching';
  const location = filters.state ? ` in ${filters.state}` : '';

  if (filters.count_only) {
    return { reply: `There are ${total} ${descriptor} tender(s) open${location}.`, actions };
  }
  return { reply: `Found ${total} tender(s) ${descriptor === 'matching' ? 'matching that' : `for "${descriptor}"`}${location}. Here are a few:`, actions };
}

/**
 * POST /api/chat
 * Body: { messages: [{role, content}, ...] }
 * Response: { reply: string, actions: [{label, subtitle?, url}] }
 */
exports.chat = async (req, res) => {
  try {
    const { messages } = req.body;
    const lastUser = [...(messages || [])].reverse().find((m) => m.role === 'user');
    const question = (lastUser?.content || '').trim();
    if (!question) {
      return res.status(400).json({ success: false, message: 'No question provided' });
    }

    const scope = await getUserScope(req.user.id);

    const candidate = extractBidNumberCandidate(question);
    if (candidate) {
      const result = await tryBidNumberLookup(candidate, req, scope);
      if (result) return res.json({ success: true, ...result });
      // Fast-path match but no such tender — fall through to NL search on
      // the full question rather than dead-ending the conversation.
    }

    const result = await naturalLanguageSearch(question, req);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[chat] chat:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
