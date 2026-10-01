'use strict';
const db = require('../config/db');
const { getUserScope } = require('../utils/userScope');
const { createRequest } = require('./approvals.controller');

/**
 * Finance pricing — modules 2 (Pricing Requests), 3 (Tender Pricing),
 * 4 (Price Approval) and 5 (Price Calculation).
 *
 * A pricing sheet hangs off an approved Process Decode sheet: Sales decides
 * what to bid and at what dealer rate, Finance turns that into a quoted price.
 * Seeding from the decode payload avoids re-keying the item list.
 *
 * All arithmetic lives in calcLine/calcTotals below and is recomputed
 * server-side on every read, so a stale or hand-edited client can never make
 * the stored numbers disagree with the quoted total.
 */

/**
 * POST /api/pricing/predict
 * Mock endpoint for pricing prediction
 */
const predictPrice = async (req, res) => {
    try {
        const { product, quantity } = req.body;
        console.log(`[Pricing Stub] Prediction requested for: ${product} (Qty: ${quantity})`);

        // Return dummy data to satisfy frontend
        res.json({
            success: true,
            low_price: 15000,
            high_price: 25000,
            confidence: 'Medium',
            basis: 'Historical Data (Mock)',
            competitors_analyzed: 5,
            top_competitors: [
                { seller_name: "Mock Seller A", average_bidding_price: 18000, inflation_rate_percent: 2.5, last_l1_price: 17500, least_quoted_price: 16000 },
                { seller_name: "Mock Seller B", average_bidding_price: 21000, inflation_rate_percent: 4.0, last_l1_price: 20000, least_quoted_price: 19500 }
            ]
        });
    } catch (err) {
        console.error('[Pricing Stub] Error:', err);
        res.status(500).json({ message: 'Pricing prediction failed' });
    }
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Per-line maths.
 *   effective  = basic − line discount
 *   taxable    = effective × qty
 *   gst        = taxable × gst%
 *   total      = taxable + gst
 *   margin     = (effective − landed cost) × qty
 */
function calcLine(line) {
  const qty = Number(line.qty) || 0;
  const basic = Number(line.basic_price) || 0;
  const discountPct = Number(line.discount_pct) || 0;
  const gstPct = Number(line.gst_pct) || 0;
  const landed = Number(line.landed_cost) || 0;

  const effective = round2(basic * (1 - discountPct / 100));
  const taxable = round2(effective * qty);
  const gstAmount = round2(taxable * (gstPct / 100));
  const total = round2(taxable + gstAmount);
  const margin = round2((effective - landed) * qty);
  const marginPct = taxable > 0 ? round2((margin / taxable) * 100) : 0;

  return { ...line, effective_price: effective, taxable, gst_amount: gstAmount, line_total: total, margin, margin_pct: marginPct };
}

/** Header-level totals: line totals plus freight/other charges, less an overall discount. */
function calcTotals(lines, header) {
  const taxable = round2(lines.reduce((s, l) => s + l.taxable, 0));
  const gst = round2(lines.reduce((s, l) => s + l.gst_amount, 0));
  const lineTotal = round2(taxable + gst);

  const freight = Number(header.freight) || 0;
  const other = Number(header.other_charges) || 0;
  const overallDiscountPct = Number(header.discount_pct) || 0;
  const overallDiscount = round2(lineTotal * (overallDiscountPct / 100));

  const bidValue = round2(lineTotal + freight + other - overallDiscount);
  const margin = round2(lines.reduce((s, l) => s + l.margin, 0) - freight - other - overallDiscount);
  const marginPct = bidValue > 0 ? round2((margin / bidValue) * 100) : 0;

  const l1Target = header.l1_target === null || header.l1_target === undefined || header.l1_target === ''
    ? null : Number(header.l1_target);

  return {
    taxable_value: taxable,
    gst_amount: gst,
    line_total: lineTotal,
    freight: round2(freight),
    other_charges: round2(other),
    overall_discount: overallDiscount,
    total_bid_value: bidValue,
    expected_margin: margin,
    expected_margin_pct: marginPct,
    l1_target: l1Target,
    // Positive means we are quoting above the price we think wins.
    l1_gap: l1Target === null ? null : round2(bidValue - l1Target),
  };
}

async function audit(pricingId, bidNumber, action, userId, extra = {}) {
  try {
    await db.query(
      `INSERT INTO tender_pricing_audit (pricing_id, bid_number, action, field, old_value, new_value, note, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [pricingId, bidNumber, action, extra.field || null,
        extra.oldValue ?? null, extra.newValue ?? null, extra.note || null, userId]
    );
  } catch (err) {
    console.error('[pricing] audit failed:', err.message);
  }
}

const parsePayload = (p) => {
  if (!p) return null;
  if (typeof p === 'string') { try { return JSON.parse(p); } catch { return null; } }
  return p;
};

/* ============================ handlers ============================ */

/**
 * GET /api/pricing/requests
 * Module 2 — tenders waiting on Finance. A decode sheet that reached the
 * finance stage (or was approved outright) needs a price.
 */
const listRequests = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT a.id AS request_id, a.bid_number, a.stage, a.status AS request_status,
              a.payload, a.created_at, a.reference,
              u.name AS submitted_by, u.email AS submitted_by_email,
              p.id AS pricing_id, p.status AS pricing_status, p.updated_at AS pricing_updated_at
       FROM approval_requests a
       LEFT JOIN users u ON u.id = a.requested_by
       LEFT JOIN tender_pricing p ON p.bid_number = a.bid_number
       WHERE a.type = 'process_decode'
         AND (a.stage = 'finance' OR a.status = 'approved')
       ORDER BY a.created_at DESC
       LIMIT 200`
    );

    const data = rows.map(r => {
      const payload = parsePayload(r.payload);
      return {
        request_id: r.request_id,
        bid_number: r.bid_number,
        stage: r.stage,
        request_status: r.request_status,
        submitted_by: r.submitted_by,
        submitted_by_email: r.submitted_by_email,
        created_at: r.created_at,
        rates_for: payload?.ratesFor || r.reference || null,
        participation: payload?.participation || null,
        distributor_name: payload?.distributorName || null,
        item_count: Array.isArray(payload?.rows) ? payload.rows.length : 0,
        pricing_id: r.pricing_id,
        pricing_status: r.pricing_status || 'not_started',
        pricing_updated_at: r.pricing_updated_at,
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error('pricing.listRequests:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch pricing requests' });
  }
};

/**
 * GET /api/pricing/:bidNumber
 * Module 3 — the pricing sheet, seeded from the decode sheet the first time it
 * is opened. Seeding happens in memory; nothing is written until Finance saves.
 */
const getPricing = async (req, res) => {
  try {
    const bidNumber = decodeURIComponent(req.params.bidNumber).replace(/_/g, '/');

    const [[header]] = await db.query('SELECT * FROM tender_pricing WHERE bid_number = ?', [bidNumber]);

    // The decode sheet this pricing is based on — also the source for seeding.
    const [[decode]] = await db.query(
      `SELECT id, payload, requested_by FROM approval_requests
       WHERE type = 'process_decode' AND bid_number = ?
       ORDER BY id DESC LIMIT 1`,
      [bidNumber]
    );
    const decodePayload = parsePayload(decode?.payload);

    // Sales often leaves the decode sheet's Tender Qty blank, which would seed
    // every line at qty 0 and make the whole sheet compute to zero. Fall back
    // to the tender's own quantity, then to 1.
    const [[gem]] = await db.query('SELECT quantity FROM gem_tenders WHERE bid_number = ? LIMIT 1', [bidNumber]);
    const fallbackQty = Number(gem?.quantity) > 0 ? Number(gem.quantity) : 1;

    let lines = [];
    if (header) {
      const [stored] = await db.query(
        'SELECT * FROM tender_pricing_lines WHERE pricing_id = ? ORDER BY line_no',
        [header.id]
      );
      lines = stored;
    } else if (decodePayload?.rows?.length) {
      // Seed: carry item, code, qty and the dealer rate across as landed cost.
      lines = decodePayload.rows.map((r, i) => ({
        id: null,
        line_no: i + 1,
        item_key: r.tenderSl ? `item_${r.tenderSl}` : null,
        item_name: r.item || '',
        product_code: r.code || '',
        specification: r.addlSpec || r.ourSpec || '',
        qty: Number(String(r.qty || '').replace(/[^0-9.]/g, '')) || fallbackQty,
        basic_price: Number(String(r.quoteRate || r.netRate || '').replace(/[^0-9.]/g, '')) || 0,
        gst_pct: Number(String(r.gst || '').replace(/[^0-9.]/g, '')) || 0,
        discount_pct: 0,
        landed_cost: Number(String(r.netRate || '').replace(/[^0-9.]/g, '')) || 0,
        remarks: '',
      }));
    }

    const headerOut = header || {
      id: null,
      bid_number: bidNumber,
      status: 'draft',
      participation: decodePayload?.participation || null,
      distributor_id: decodePayload?.distributorId || null,
      freight: 0,
      other_charges: 0,
      discount_pct: 0,
      l1_target: null,
      remarks: null,
      source_request: decode?.id || null,
    };

    const computed = lines.map(calcLine);

    res.json({
      success: true,
      seeded: !header,
      data: {
        header: headerOut,
        lines: computed,
        totals: calcTotals(computed, headerOut),
        decode: decodePayload ? {
          request_id: decode.id,
          rates_for: decodePayload.ratesFor || null,
          participation: decodePayload.participation || null,
          distributor_name: decodePayload.distributorName || null,
          rows: decodePayload.rows || [],
        } : null,
      },
    });
  } catch (err) {
    console.error('pricing.getPricing:', err);
    res.status(500).json({ success: false, message: 'Failed to load pricing' });
  }
};

/**
 * PUT /api/pricing/:bidNumber
 * Saves the sheet. Refused once the pricing has been approved — at that point
 * it is the quoted price and changing it silently would break the audit trail.
 */
const savePricing = async (req, res) => {
  try {
    const bidNumber = decodeURIComponent(req.params.bidNumber).replace(/_/g, '/');
    const { header = {}, lines = [] } = req.body;

    const scope = await getUserScope(req.user.id);
    if (!['Admin', 'Finance Team'].includes(scope.role)) {
      return res.status(403).json({ success: false, message: 'Only the Finance Team can enter pricing.' });
    }

    const [[existing]] = await db.query('SELECT * FROM tender_pricing WHERE bid_number = ?', [bidNumber]);
    if (existing && existing.status === 'approved') {
      return res.status(409).json({
        success: false,
        message: 'This pricing is approved and can no longer be edited.',
      });
    }

    let pricingId = existing?.id;
    if (existing) {
      await db.query(
        `UPDATE tender_pricing
         SET freight = ?, other_charges = ?, discount_pct = ?, l1_target = ?,
             remarks = ?, participation = ?, distributor_id = ?, updated_by = ?,
             status = IF(status = 'rejected', 'draft', status)
         WHERE id = ?`,
        [header.freight || 0, header.other_charges || 0, header.discount_pct || 0,
          header.l1_target || null, header.remarks || null,
          header.participation || null, header.distributor_id || null,
          req.user.id, pricingId]
      );
    } else {
      const [ins] = await db.query(
        `INSERT INTO tender_pricing
           (bid_number, source_request, participation, distributor_id, freight,
            other_charges, discount_pct, l1_target, remarks, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [bidNumber, header.source_request || null, header.participation || null,
          header.distributor_id || null, header.freight || 0, header.other_charges || 0,
          header.discount_pct || 0, header.l1_target || null, header.remarks || null,
          req.user.id, req.user.id]
      );
      pricingId = ins.insertId;
      await audit(pricingId, bidNumber, 'created', req.user.id);
    }

    // Lines are replaced wholesale — the sheet is edited as a unit, and
    // diffing rows the user may have reordered adds no value here.
    await db.query('DELETE FROM tender_pricing_lines WHERE pricing_id = ?', [pricingId]);
    if (lines.length) {
      await db.query(
        `INSERT INTO tender_pricing_lines
           (pricing_id, line_no, item_key, item_name, product_code, specification,
            qty, basic_price, gst_pct, discount_pct, landed_cost, remarks)
         VALUES ?`,
        [lines.map((l, i) => [
          pricingId, i + 1, l.item_key || null, l.item_name || null, l.product_code || null,
          l.specification || null, l.qty || 0, l.basic_price || 0, l.gst_pct || 0,
          l.discount_pct || 0, l.landed_cost || 0, l.remarks || null,
        ])]
      );
    }

    const computed = lines.map(calcLine);
    const totals = calcTotals(computed, header);
    await audit(pricingId, bidNumber, 'updated', req.user.id, {
      field: 'total_bid_value',
      oldValue: existing ? null : '0',
      newValue: String(totals.total_bid_value),
    });

    res.json({ success: true, message: 'Pricing saved', data: { pricing_id: pricingId, totals } });
  } catch (err) {
    console.error('pricing.savePricing:', err);
    res.status(500).json({ success: false, message: 'Failed to save pricing' });
  }
};

/**
 * POST /api/pricing/:bidNumber/submit
 * Module 4 — sends the priced sheet up for approval, reusing the same approval
 * pipeline as everything else rather than inventing a second one.
 */
const submitPricing = async (req, res) => {
  try {
    const bidNumber = decodeURIComponent(req.params.bidNumber).replace(/_/g, '/');
    const scope = await getUserScope(req.user.id);
    if (!['Admin', 'Finance Team'].includes(scope.role)) {
      return res.status(403).json({ success: false, message: 'Only the Finance Team can submit pricing.' });
    }

    const [[header]] = await db.query('SELECT * FROM tender_pricing WHERE bid_number = ?', [bidNumber]);
    if (!header) return res.status(404).json({ success: false, message: 'Save the pricing before submitting.' });
    if (header.status === 'pending_approval') {
      return res.status(409).json({ success: false, message: 'This pricing is already awaiting approval.' });
    }
    if (header.status === 'approved') {
      return res.status(409).json({ success: false, message: 'This pricing is already approved.' });
    }

    const [lines] = await db.query('SELECT * FROM tender_pricing_lines WHERE pricing_id = ? ORDER BY line_no', [header.id]);
    if (!lines.length) return res.status(400).json({ success: false, message: 'Add at least one priced item.' });

    const computed = lines.map(calcLine);
    const totals = calcTotals(computed, header);

    const requestId = await createRequest({
      type: 'pricing',
      bidNumber,
      reference: `Bid value ₹${totals.total_bid_value}`,
      remarks: req.body.remarks || `Pricing — ${lines.length} item${lines.length === 1 ? '' : 's'}`,
      payload: { header, lines: computed, totals },
      userId: req.user.id,
      scope,
    });

    await db.query("UPDATE tender_pricing SET status = 'pending_approval', updated_by = ? WHERE id = ?",
      [req.user.id, header.id]);
    await audit(header.id, bidNumber, 'submitted', req.user.id, {
      newValue: String(totals.total_bid_value),
      note: req.body.remarks || null,
    });

    res.status(201).json({ success: true, message: 'Pricing sent for approval', requestId, totals });
  } catch (err) {
    console.error('pricing.submitPricing:', err);
    res.status(500).json({ success: false, message: 'Failed to submit pricing' });
  }
};

/** GET /api/pricing/:bidNumber/audit — module 15 for this tender. */
const getAudit = async (req, res) => {
  try {
    const bidNumber = decodeURIComponent(req.params.bidNumber).replace(/_/g, '/');
    const [rows] = await db.query(
      `SELECT a.*, u.name AS user_name
       FROM tender_pricing_audit a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.bid_number = ?
       ORDER BY a.id DESC LIMIT 200`,
      [bidNumber]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('pricing.getAudit:', err);
    res.status(500).json({ success: false, message: 'Failed to load audit trail' });
  }
};

module.exports = {
  predictPrice,           // pre-existing mock endpoint, kept as-is
  listRequests, getPricing, savePricing, submitPricing, getAudit,
  calcLine, calcTotals,
};
