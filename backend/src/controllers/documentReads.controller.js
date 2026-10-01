'use strict';
const db = require('../config/db');
const { getUserScope } = require('../utils/userScope');

/**
 * Tender document reading sign-off.
 *
 * After Finance settles the pricing, the tender team must read the bid
 * documents and mark them read. The three documents are fixed; their URLs are
 * derived from the tender rather than stored, because the scraper already
 * captures every link inside the bid document.
 */

const DOCS = [
  { type: 'gem_bid', label: 'GeM Bid Document' },
  { type: 'atc', label: 'ATC (Additional Terms & Conditions)' },
  { type: 'additional_specs', label: 'Additional Specifications' },
];

/** Roles expected to sign off — the people who actually prepare the bid. */
const READER_ROLES = ['Admin', 'Tender Admin', 'Office Administrator', 'Tender Executive'];

/**
 * Picks a URL for each document out of the tender row and the links the
 * scraper extracted from the bid PDF. Returns null where nothing matches, so
 * the UI can show the item as unavailable rather than a dead link.
 */
function resolveLinks(tender) {
  let links = [];
  try {
    const jd = typeof tender.json_data === 'string' ? JSON.parse(tender.json_data) : tender.json_data;
    links = [...new Set((jd?.links || []).map(l => l.uri).filter(Boolean))];
  } catch { /* malformed json_data — fall back to detail_url only */ }

  const find = (re) => links.find(u => re.test(u)) || null;

  return {
    gem_bid: tender.detail_url || find(/showbidDocument/i),
    // The ATC is served from the fulfilment host under an SLA upload path.
    atc: find(/ATC_|SLA_UPLOAD_PATH|slafds/i),
    // Catalogue / drive attachments carry the extra specification sheets.
    additional_specs: find(/showCatalogue/i) || find(/drive\.google\.com/i),
  };
}

// GET /api/document-reads/:bidNumber
const getReads = async (req, res) => {
  try {
    const bidNumber = decodeURIComponent(req.params.bidNumber).replace(/_/g, '/');

    const [[tender]] = await db.query(
      'SELECT bid_number, detail_url, json_data FROM gem_tenders WHERE bid_number = ? LIMIT 1',
      [bidNumber]
    );

    const [rows] = await db.query(
      `SELECT r.doc_type, r.user_id, r.note, r.read_at, u.name AS user_name, u.role AS user_role
       FROM tender_document_reads r
       LEFT JOIN users u ON u.id = r.user_id
       WHERE r.bid_number = ?
       ORDER BY r.read_at`,
      [bidNumber]
    );

    // Is the pricing settled? Reading is only expected once it is.
    const [[decode]] = await db.query(
      `SELECT status, ack_required FROM approval_requests
       WHERE type = 'process_decode' AND bid_number IN (?, ?)
       ORDER BY id DESC LIMIT 1`,
      [bidNumber, bidNumber.replace(/\//g, '_')]
    );
    const pricingDone = !!decode && decode.status === 'approved' && !decode.ack_required;

    const links = tender ? resolveLinks(tender) : {};
    const scope = await getUserScope(req.user.id);

    const data = DOCS.map(d => {
      const readers = rows.filter(r => r.doc_type === d.type);
      return {
        ...d,
        url: links[d.type] || null,
        readers: readers.map(r => ({
          user_id: r.user_id, name: r.user_name, role: r.user_role,
          read_at: r.read_at, note: r.note,
        })),
        read_by_me: readers.some(r => r.user_id === req.user.id),
      };
    });

    res.json({
      success: true,
      pricingDone,
      canMark: READER_ROLES.includes(scope.role),
      data,
    });
  } catch (err) {
    console.error('documentReads.getReads:', err);
    res.status(500).json({ success: false, message: 'Failed to load document reading status' });
  }
};

// POST /api/document-reads/:bidNumber  { docType, note }
const markRead = async (req, res) => {
  try {
    const bidNumber = decodeURIComponent(req.params.bidNumber).replace(/_/g, '/');
    const { docType, note } = req.body;

    if (!DOCS.some(d => d.type === docType)) {
      return res.status(400).json({
        success: false,
        message: `docType must be one of ${DOCS.map(d => d.type).join(', ')}`,
      });
    }

    const scope = await getUserScope(req.user.id);
    if (!READER_ROLES.includes(scope.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only the tender team marks documents as read.',
      });
    }

    // Re-marking is a no-op rather than an error — the unique key absorbs it.
    await db.query(
      `INSERT INTO tender_document_reads (bid_number, doc_type, user_id, note)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE note = VALUES(note), read_at = NOW()`,
      [bidNumber, docType, req.user.id, note || null]
    );

    res.json({ success: true, message: 'Marked as read' });
  } catch (err) {
    console.error('documentReads.markRead:', err);
    res.status(500).json({ success: false, message: 'Failed to record the reading' });
  }
};

// DELETE /api/document-reads/:bidNumber/:docType — undo one's own mark
const unmarkRead = async (req, res) => {
  try {
    const bidNumber = decodeURIComponent(req.params.bidNumber).replace(/_/g, '/');
    await db.query(
      'DELETE FROM tender_document_reads WHERE bid_number = ? AND doc_type = ? AND user_id = ?',
      [bidNumber, req.params.docType, req.user.id]
    );
    res.json({ success: true, message: 'Reading mark removed' });
  } catch (err) {
    console.error('documentReads.unmarkRead:', err);
    res.status(500).json({ success: false, message: 'Failed to remove the mark' });
  }
};

module.exports = { getReads, markRead, unmarkRead, DOCS };
