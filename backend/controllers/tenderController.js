const { QueryTypes } = require('sequelize');
const {
  sequelize, GemTender, GemTenderDoc, OpenTenderDetail, TenderPartnerState, TenderStatusEntry,
  TenderProcessingResult, TenderProductSelection, ParticipatedTenderNote,
} = require('../models');

// gem_tenders.end_date is stored as a free-text string like "27-01-2026
// 9:00 AM" (scraped as-is from GeM). Computing STR_TO_DATE(...) inline on
// every request forces a full-table scan (measured ~2.5s+ on 460k rows —
// exactly why the Tenders page felt permanently stuck on "Loading…").
// `end_date_dt` is a VIRTUAL generated column with a real index
// (see migration in backend/scripts, or run once via MySQL:
//   ALTER TABLE gem_tenders
//     ADD COLUMN end_date_dt DATETIME GENERATED ALWAYS AS
//       (STR_TO_DATE(REPLACE(end_date, '/', '-'), '%d-%m-%Y %h:%i %p')) VIRTUAL,
//     ADD INDEX idx_end_date_dt (end_date_dt);
// ) so filtering/sorting by it is an index range scan (~0.05s) instead.
// MySQL's optimizer under-estimates this index vs. idx_not_relevant's
// (misleadingly low) cardinality, so FORCE INDEX is required, not optional.
// This partner portal only ever deals in Meril's two classified divisions —
// Diagno and Endo. Tenders with any other/blank `dept` (unclassified,
// scraped-but-not-yet-triaged, etc.) are noise for an external partner and
// are excluded everywhere, not just default-filtered.
const CLASSIFIED_DEPTS = ['Diagno', 'Endo'];
const CLASSIFIED_SQL = "LOWER(gem_tenders.dept) IN ('diagno', 'endo')";

// A tender only counts as genuinely "relevant" (matches the tender-automation
// staff dashboard's own definition) when it's:
//   - perfect_cat = 1        — AI/keyword-matched as a confident product fit,
//                              not just scraped-and-unreviewed
//   - ra_no empty             — hasn't already moved to a Reverse Auction
//                              (RA'd tenders are past the "should we bid"
//                              stage and no longer an open opportunity)
// Dropping these was why this portal showed 27,408 "active" tenders against
// the staff dashboard's 200 for the same divisions.
const RELEVANT_SQL = '(gem_tenders.ra_no IS NULL OR TRIM(gem_tenders.ra_no) = \'\') AND gem_tenders.perfect_cat = 1';

const ACTIVE_WHERE = `gem_tenders.end_date_dt >= NOW() AND (gem_tenders.marked_not_relevant IS NULL OR gem_tenders.marked_not_relevant = 0) AND ${CLASSIFIED_SQL} AND ${RELEVANT_SQL}`;

const toUrlId = (bidNumber) => (bidNumber || '').split('/').join('_');
const fromUrlId = (id) => decodeURIComponent(id || '').replace(/_/g, '/');

const normKey = (s) => (s || '').toString().toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// gem_tenders.json_data is a raw PDF-table scrape — { pages: [{ tables: [[[cell,cell],...]] }], links: [...] }
// with no field names at all (this mirrors the original tender-automation
// site's client-side parser, which does the same substring matching against
// these unstructured [key, value] table rows rather than relying on any
// structured DB columns, because none exist for these fields).
function parseGemJsonData(jsonData) {
  const extracted = {};
  const itemCategories = new Set();
  const consigneeRows = [];
  const techSpecTables = [];
  let documentRequired = null;
  let sampleRequired = false;

  const pages = jsonData?.pages || [];
  for (const page of pages) {
    for (const table of page.tables || []) {
      if (!Array.isArray(table)) continue;

      for (const row of table) {
        if (!Array.isArray(row)) continue;
        const key = normKey(row[0]);
        const value = (row[1] || '').toString().trim();
        if (!key || !value) continue;

        if (key.includes('bid end')) extracted.bidEndDate = value;
        else if (key.includes('bid opening')) extracted.bidOpeningDate = value;
        else if (key.includes('offer validity')) extracted.bidOfferValidity = value;
        else if (key.includes('estimated bid value')) extracted.estimatedBidValue = value;
        else if (key.includes('organisation name')) extracted.organisationName = value;
        else if (key.includes('office name')) extracted.officeName = value;
        else if (key.includes('department name')) extracted.departmentOrg = value;
        else if (key.includes('total quantity')) extracted.totalQty = value;
        else if (key.includes('item category')) itemCategories.add(value);
        else if (key.includes('document required')) documentRequired = value;
        else if (key.includes('evaluation method')) extracted.evaluationMethod = value;
        else if (key.includes('emd amount')) extracted.emdAmount = value;
        else if (key.includes('advisory bank')) extracted.advisoryBank = value;
        else if (key.includes('epbg percentage')) extracted.epbgPercentage = value;
        else if (key.includes('duration of epbg')) extracted.epbgDuration = value;
        else if (key.includes('bid to ra')) extracted.bidToRA = value;
        else if (key.includes('pre bid date') || key.includes('prebid date')) extracted.preBidDate = value;
        else if (key.includes('pre bid time') || key.includes('prebid time')) extracted.preBidTime = value;
        else if (key.includes('pre bid venue') || key.includes('prebid venue')) extracted.preBidVenue = value;

        if (key.includes('sample') || value.toLowerCase().includes('sample submission') || value.toLowerCase().includes('submit sample')) {
          sampleRequired = true;
        }
      }

      const header = (table[0] || []).map((c) => normKey(c));
      const headerText = header.join(' ');
      if (headerText.includes('consignee')) {
        for (const row of table) {
          if (Array.isArray(row) && row.some((c) => c && c.toString().trim())) consigneeRows.push(row);
        }
      }
      if (header.length >= 3 && headerText.includes('specification') && (headerText.includes('allowed') || headerText.includes('requirement'))) {
        techSpecTables.push(table);
      }
    }
  }

  const emdRequired = extracted.emdAmount && extracted.emdAmount !== 'N/A' && extracted.emdAmount !== '0' ? 'Yes' : 'No';

  const eligibilityCriteria = documentRequired
    ? [...new Set(
        documentRequired.split(',')
          .map((s) => s.trim().split('*')[0].trim())
          .filter((s) => s && s.length <= 60),
      )]
    : [];

  return {
    ...extracted,
    itemCategories: [...itemCategories],
    emdRequired,
    sampleRequired: sampleRequired ? 'Yes' : 'No',
    consigneeRows,
    techSpecTables,
    eligibilityCriteria,
  };
}
exports.parseGemJsonData = parseGemJsonData;

// Every downloadable document on a GeM tender comes through as a raw link
// URL with no label — the original site infers a human label purely from
// substrings in the URI itself.
function parseGemDocuments(jsonData) {
  const links = jsonData?.links || [];
  const seen = new Set();
  const docs = [];
  let resourceCount = 1;
  for (const link of links) {
    const uri = link?.uri || '';
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    let label;
    if (uri.includes('/BoqDocument/') || uri.includes('/BoqLineItemsDocument/') || uri.includes('/BOQDocument/')) label = 'BOQ Document';
    else if (uri.includes('/downloadOmppdfile/')) label = 'OMPPD';
    else if (uri.toLowerCase().includes('atc')) label = 'ATC';
    else if (uri.includes('fulfilment.gem.gov.in/contract/')) label = 'ATC';
    else if (uri.includes('shared_doc/gtc') || uri.includes('pdfByDate')) label = 'Gem Contract';
    else label = `Resources${resourceCount++}`;
    docs.push({ label, url: uri });
  }
  return docs;
}

// Maps the automation site's sort keys onto an ORDER BY expression over a
// given "end datetime" / "start datetime" SQL fragment — same key names as
// its own sort dropdown (startDateLatest, endDateOldest, ...) so the two
// UIs stay interchangeable.
const sortToOrderBy = (sort, startDt, endDt) => {
  switch (sort) {
    case 'startDateLatest': return `${startDt} DESC`;
    case 'startDateOldest': return `${startDt} ASC`;
    case 'endDateLatest': return `${endDt} DESC`;
    case 'endDateOldest': return `${endDt} ASC`;
    default: return `(${endDt} IS NULL) ASC, ${endDt} ASC`; // soonest-closing first
  }
};

// @route GET /api/tenders
// Lists real tenders — GEM (gem_tenders) or Open/CPPP (open_tender_details)
// depending on `tenderType` — with the same filter set as the
// tender-automation site's Tenders page: search, state, division, sub-category,
// perfect-match toggle, closing-date range, and sort. No department/role
// scoping (this app's partners aren't split into internal divisions the way
// the tender-automation system's staff are), so every logged-in partner
// sees the same full list.
exports.getTenders = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const search = (req.query.search || '').trim();
    const state = (req.query.state || '').trim();
    const dept = (req.query.dept || '').trim();
    const status = (req.query.status || 'active').trim(); // active | closed | all
    const tenderType = (req.query.tenderType || 'GEM').trim(); // GEM | Open
    const departmentName = (req.query.departmentName || '').trim();
    const subCat = (req.query.subCat || '').trim();
    const perfectCat = (req.query.perfectCat || 'perfect').trim(); // perfect | all
    const closingFrom = (req.query.closingFrom || '').trim();
    const closingTo = (req.query.closingTo || '').trim();
    const sort = (req.query.sort || '').trim();

    if (tenderType === 'Open') {
      const startDt = "STR_TO_DATE(open_tender_details.e_published_date, '%d-%M-%Y %h:%i %p')";
      const endDt = "STR_TO_DATE(open_tender_details.closing_date, '%d-%M-%Y %h:%i %p')";
      const where = ["relevency_checker IN ('proceed_futher', 'files_downloaded', 'yes')"];
      const params = {};

      if (search) {
        where.push('(tender_id LIKE :search OR tender_title LIKE :search OR organisation_name LIKE :search OR tender_refno LIKE :search)');
        params.search = `%${search}%`;
      }
      if (state) { where.push('state = :state'); params.state = state; }
      if (dept && CLASSIFIED_DEPTS.some((d) => d.toLowerCase() === dept.toLowerCase())) {
        where.push('LOWER(dept) LIKE :dept');
        params.dept = `%${dept.toLowerCase()}%`;
      }
      if (departmentName) { where.push('organisation_name LIKE :departmentName'); params.departmentName = `%${departmentName}%`; }
      if (closingFrom) { where.push(`${endDt} >= :closingFrom`); params.closingFrom = closingFrom; }
      if (closingTo) { where.push(`${endDt} <= :closingTo`); params.closingTo = `${closingTo} 23:59:59`; }
      if (status === 'active') where.push(`(${endDt} >= NOW() OR closing_date IS NULL OR closing_date = '')`);
      else if (status === 'closed') where.push(`${endDt} < NOW()`);

      const whereSql = where.join(' AND ');
      const orderBy = sortToOrderBy(sort, startDt, endDt);

      const [rows, [{ total }]] = await Promise.all([
        sequelize.query(
          `SELECT tender_id AS bid_number, tender_title AS items, organisation_name AS department, organisation_chain,
                  dept, state, e_published_date AS start_date, closing_date AS end_date,
                  TIMESTAMPDIFF(HOUR, NOW(), ${endDt}) AS hours_left
           FROM open_tender_details WHERE ${whereSql}
           ORDER BY ${orderBy} LIMIT :limit OFFSET :offset`,
          { replacements: { ...params, limit, offset }, type: QueryTypes.SELECT }
        ),
        sequelize.query(`SELECT COUNT(*) AS total FROM open_tender_details WHERE ${whereSql}`, { replacements: params, type: QueryTypes.SELECT }),
      ]);

      return res.json({
        success: true,
        source: 'open',
        data: rows.map((r) => ({ ...r, url_id: toUrlId(r.bid_number), emd_amount: null, bid_value: null, quantity: null, detail_url: null })),
        total: Number(total), page, limit, totalPages: Math.max(1, Math.ceil(Number(total) / limit)),
      });
    }

    // FORCE INDEX only makes sense once end_date_dt is actually part of the
    // filter — for 'all' (no date filter at all) let the optimizer choose.
    const useDateIndex = status === 'active' || status === 'closed' || closingFrom || closingTo || sort.startsWith('endDate');
    const where = [
      '(gem_tenders.marked_not_relevant IS NULL OR gem_tenders.marked_not_relevant = 0)',
      CLASSIFIED_SQL,
    ];
    const params = {};

    // "Perfect Match" (default) restricts to AI-confirmed relevant tenders
    // not already gone to Reverse Auction — see RELEVANT_SQL. "All Matches"
    // widens the net to anything the pipeline has processed at all.
    if (perfectCat === 'all') {
      where.push("gem_tenders.bid_number IN (SELECT bid_no FROM tender_processing_results WHERE result = 'yes')");
    } else {
      where.push(RELEVANT_SQL);
    }

    if (search) {
      where.push('(gem_tenders.bid_number LIKE :search OR gem_tenders.items LIKE :search OR gem_tenders.department LIKE :search OR gem_tenders.keyword LIKE :search)');
      params.search = `%${search}%`;
    }
    if (state) {
      where.push('gem_tenders.state = :state');
      params.state = state;
    }
    if (dept && CLASSIFIED_DEPTS.some((d) => d.toLowerCase() === dept.toLowerCase())) {
      where.push('LOWER(gem_tenders.dept) = LOWER(:dept)');
      params.dept = dept;
    }
    if (departmentName) {
      where.push('gem_tenders.department LIKE :departmentName');
      params.departmentName = `%${departmentName}%`;
    }
    if (subCat) {
      const list = subCat.split(',').map((s) => s.trim()).filter(Boolean);
      if (list.length) {
        const placeholders = list.map((_, i) => `:subCat${i}`).join(',');
        where.push(`(gem_tenders.sub_cat IN (${placeholders}) OR gem_tenders.keyword IN (${placeholders}))`);
        list.forEach((v, i) => { params[`subCat${i}`] = v; });
      }
    }
    if (closingFrom) {
      where.push('gem_tenders.end_date_dt >= :closingFrom');
      params.closingFrom = closingFrom;
    }
    if (closingTo) {
      where.push('gem_tenders.end_date_dt <= :closingTo');
      params.closingTo = `${closingTo} 23:59:59`;
    }
    if (status === 'active') {
      where.push('gem_tenders.end_date_dt >= NOW()');
    } else if (status === 'closed') {
      where.push('gem_tenders.end_date_dt < NOW()');
    }

    const whereSql = where.join(' AND ');
    const indexHint = useDateIndex ? 'FORCE INDEX (idx_end_date_dt)' : '';
    const orderBy = sortToOrderBy(sort, 'gem_tenders.end_date_dt', 'gem_tenders.end_date_dt');
    // startDate sorting needs the actual start-date expression, not end_date_dt twice.
    const finalOrderBy = sort.startsWith('startDate')
      ? sortToOrderBy(sort, "STR_TO_DATE(REPLACE(gem_tenders.start_date, '/', '-'), '%d-%m-%Y %h:%i %p')", 'gem_tenders.end_date_dt')
      : orderBy;

    // LEFT JOINed so a partner's own Interested/Not-Relevant call (see
    // TenderPartnerState) shows on the row and — for not-relevant — hides
    // it from just that partner's list, without touching the shared row.
    const [rows, [{ total }]] = await Promise.all([
      sequelize.query(
        `SELECT gem_tenders.id, gem_tenders.bid_number, gem_tenders.items, gem_tenders.department, gem_tenders.dept,
                gem_tenders.state, gem_tenders.district, gem_tenders.start_date, gem_tenders.end_date,
                gem_tenders.emd_amount, gem_tenders.bid_value, gem_tenders.quantity, gem_tenders.detail_url, gem_tenders.sub_cat,
                gem_tenders.end_date_dt AS end_datetime,
                TIMESTAMPDIFF(HOUR, NOW(), gem_tenders.end_date_dt) AS hours_left,
                COALESCE(tps.is_interested, 0) AS is_interested,
                (gem_tenders.Representation_json IS NOT NULL AND JSON_LENGTH(gem_tenders.Representation_json) > 0) AS has_representation,
                (gem_tenders.Corrigendum_json IS NOT NULL AND JSON_LENGTH(gem_tenders.Corrigendum_json) > 0) AS has_corrigendum
         FROM gem_tenders ${indexHint}
         LEFT JOIN tender_partner_states tps ON tps.bid_number = gem_tenders.bid_number AND tps.user_id = :userId
         WHERE ${whereSql} AND (tps.not_relevant IS NULL OR tps.not_relevant = 0)
         ORDER BY ${finalOrderBy}
         LIMIT :limit OFFSET :offset`,
        { replacements: { ...params, limit, offset, userId: req.user.id }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT COUNT(*) AS total FROM gem_tenders ${indexHint}
         LEFT JOIN tender_partner_states tps ON tps.bid_number = gem_tenders.bid_number AND tps.user_id = :userId
         WHERE ${whereSql} AND (tps.not_relevant IS NULL OR tps.not_relevant = 0)`,
        { replacements: { ...params, userId: req.user.id }, type: QueryTypes.SELECT }
      ),
    ]);

    res.json({
      success: true,
      source: 'gem',
      data: rows.map((r) => ({ ...r, url_id: toUrlId(r.bid_number) })),
      total: Number(total),
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(Number(total) / limit)),
    });
  } catch (err) {
    console.error('getTenders error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch tenders' });
  }
};

// @route GET /api/tenders/subcategories
// Distinct GeM sub-categories (+ AI keywords used the same way) for the
// listing page's sub-category multi-select — same fields the automation
// site's sub-cat filter matches against (sub_cat OR keyword).
exports.getSubCategories = async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT DISTINCT sub_cat FROM gem_tenders WHERE sub_cat IS NOT NULL AND sub_cat != '' AND ${CLASSIFIED_SQL} ORDER BY sub_cat ASC LIMIT 200`,
      { type: QueryTypes.SELECT }
    );
    res.json({ success: true, subCategories: rows.map((r) => r.sub_cat) });
  } catch (err) {
    console.error('getSubCategories error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch sub-categories' });
  }
};

// @route GET /api/tenders/filters
// Distinct state/department lists for the listing page's filter dropdowns.
exports.getFilters = async (req, res) => {
  try {
    const states = await sequelize.query(
      `SELECT DISTINCT state FROM gem_tenders WHERE state IS NOT NULL AND state != '' AND ${CLASSIFIED_SQL} ORDER BY state ASC`,
      { type: QueryTypes.SELECT }
    );
    res.json({
      success: true,
      states: states.map((r) => r.state),
      // Only ever Diagno/Endo — see CLASSIFIED_DEPTS above.
      departments: CLASSIFIED_DEPTS,
    });
  } catch (err) {
    console.error('getFilters error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch filters' });
  }
};

// @route GET /api/tenders/:bidNumber
// Bid number arrives URL-safe (slashes swapped for underscores, e.g.
// GEM_2026_B_7989511) — same convention the tender-automation frontend uses.
// Falls back to open_tender_details for non-GEM tenders, same as that
// system's getTenderDetails.
exports.getTenderDetails = async (req, res) => {
  try {
    const bidNumber = fromUrlId(req.params.bidNumber);

    const tender = await GemTender.findOne({ where: { bidNumber } });
    if (tender) {
      const [doc, partnerState] = await Promise.all([
        GemTenderDoc.findOne({ where: { bidNumber } }),
        TenderPartnerState.findOne({ where: { userId: req.user.id, bidNumber } }),
      ]);
      const tenderJson = tender.toJSON();
      const parsed = tenderJson.jsonData ? parseGemJsonData(tenderJson.jsonData) : null;
      const documents = tenderJson.jsonData ? parseGemDocuments(tenderJson.jsonData) : [];
      return res.json({
        success: true,
        source: 'gem',
        data: {
          ...tenderJson,
          document: doc ? doc.toJSON() : null,
          isInterested: partnerState?.isInterested || false,
          notRelevant: partnerState?.notRelevant || false,
          notRelevantReason: partnerState?.notRelevantReason || null,
          parsed,
          documents,
        },
      });
    }

    const openBidId = bidNumber.replace(/\//g, '_');
    const openTender = await OpenTenderDetail.findOne({ where: { tenderId: openBidId } });
    if (openTender) {
      const partnerState = await TenderPartnerState.findOne({ where: { userId: req.user.id, bidNumber } });
      return res.json({
        success: true,
        source: 'open',
        data: {
          ...openTender.toJSON(),
          isInterested: partnerState?.isInterested || false,
          notRelevant: partnerState?.notRelevant || false,
          notRelevantReason: partnerState?.notRelevantReason || null,
        },
      });
    }

    res.status(404).json({ success: false, message: 'Tender not found' });
  } catch (err) {
    console.error('getTenderDetails error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch tender details' });
  }
};

// @route PATCH /api/tenders/:bidNumber/interest
// Toggles the caller's own "Interested" flag on a tender — see
// TenderPartnerState for why this can't just be a column on gem_tenders.
exports.toggleInterest = async (req, res) => {
  try {
    const bidNumber = fromUrlId(req.params.bidNumber);
    const [state] = await TenderPartnerState.findOrCreate({
      where: { userId: req.user.id, bidNumber },
      defaults: { userId: req.user.id, bidNumber },
    });
    state.isInterested = !state.isInterested;
    await state.save();
    res.json({ success: true, isInterested: state.isInterested });
  } catch (err) {
    console.error('toggleInterest error:', err);
    res.status(500).json({ success: false, message: 'Failed to update interest' });
  }
};

// @route PATCH /api/tenders/:bidNumber/not-relevant
// Marks (or unmarks, when `relevant: true` is sent) a tender as not
// relevant — for the caller only, per TenderPartnerState.
exports.setNotRelevant = async (req, res) => {
  try {
    const bidNumber = fromUrlId(req.params.bidNumber);
    const { reason, relevant } = req.body;
    if (!relevant && !reason?.trim()) {
      return res.status(400).json({ success: false, message: 'A reason is required.' });
    }
    const [state] = await TenderPartnerState.findOrCreate({
      where: { userId: req.user.id, bidNumber },
      defaults: { userId: req.user.id, bidNumber },
    });
    state.notRelevant = !relevant;
    state.notRelevantReason = relevant ? null : reason.trim();
    await state.save();
    res.json({ success: true, notRelevant: state.notRelevant });
  } catch (err) {
    console.error('setNotRelevant error:', err);
    res.status(500).json({ success: false, message: 'Failed to update relevance' });
  }
};

// @route GET /api/tenders/:bidNumber/status/history
// The caller's own pipeline-status log for this tender (Proceed/Win/Lose/Close).
exports.getStatusHistory = async (req, res) => {
  try {
    const bidNumber = fromUrlId(req.params.bidNumber);
    const rows = await TenderStatusEntry.findAll({
      where: { userId: req.user.id, bidNumber },
      order: [['createdAt', 'DESC']],
    });
    res.json({ success: true, data: rows.map((r) => r.toJSON()) });
  } catch (err) {
    console.error('getStatusHistory error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch status history' });
  }
};

// @route POST /api/tenders/:bidNumber/status
// Logs a new pipeline-status entry for the caller on this tender.
exports.postStatus = async (req, res) => {
  try {
    const bidNumber = fromUrlId(req.params.bidNumber);
    const { status, remarks } = req.body;
    if (!['proceed', 'win', 'lose', 'close'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    const entry = await TenderStatusEntry.create({ userId: req.user.id, bidNumber, status, remarks: remarks || null });
    res.json({ success: true, data: entry.toJSON() });
  } catch (err) {
    console.error('postStatus error:', err);
    res.status(500).json({ success: false, message: 'Failed to save status' });
  }
};

// @route GET /api/tenders/workspaces
// Clone of the automation site's "Active Workspaces" — there, a workspace is
// derived from tender_status_history (staff-side, shared) joined against
// several internal approval/doc-prep tables this portal doesn't have. Here
// it's the equivalent per-partner concept: any tender THIS partner's most
// recent status entry marked 'proceed' (and hasn't since been closed) is an
// open workspace. No separate "workspaces" table — same reasoning as every
// other derived-list page in this app.
exports.getActiveWorkspaces = async (req, res) => {
  try {
    const { search, status: statusFilter } = req.query;

    const latestPerBid = await sequelize.query(
      `SELECT tse.bid_number, tse.status, tse.remarks, tse.created_at
       FROM tender_status_entries tse
       INNER JOIN (
         SELECT bid_number, MAX(created_at) AS max_created
         FROM tender_status_entries WHERE user_id = :userId GROUP BY bid_number
       ) latest ON latest.bid_number = tse.bid_number AND latest.max_created = tse.created_at
       WHERE tse.user_id = :userId AND tse.status = 'proceed'
       ORDER BY tse.created_at DESC`,
      { replacements: { userId: req.user.id }, type: QueryTypes.SELECT },
    );

    if (latestPerBid.length === 0) return res.json({ success: true, data: [] });

    const bidNumbers = latestPerBid.map((r) => r.bid_number);
    const tenders = await GemTender.findAll({ where: { bidNumber: bidNumbers } });
    const tenderByBid = new Map(tenders.map((t) => [t.bidNumber, t.toJSON()]));

    const now = Date.now();
    let workspaces = latestPerBid.map((entry) => {
      const tender = tenderByBid.get(entry.bid_number);
      const endDateDt = tender?.endDate ? parseGemDateLoose(tender.endDate) : null;
      const hoursLeft = endDateDt ? Math.round((endDateDt.getTime() - now) / 3.6e6) : null;
      const daysSinceMarked = Math.floor((now - new Date(entry.created_at).getTime()) / 8.64e7);

      let derivedStatus = 'active';
      if (hoursLeft !== null && hoursLeft <= 48 && hoursLeft >= 0) derivedStatus = 'urgent';
      else if (daysSinceMarked >= 7) derivedStatus = 'review';

      return {
        bidNumber: entry.bid_number,
        urlId: toUrlId(entry.bid_number),
        title: tender?.items || entry.bid_number,
        dept: tender?.dept || null,
        state: tender?.state || null,
        bidEndDate: tender?.endDate || null,
        hoursLeft,
        markedAt: entry.created_at,
        daysSinceMarked,
        remarks: entry.remarks,
        status: derivedStatus,
      };
    });

    if (search) {
      const s = search.toLowerCase();
      workspaces = workspaces.filter((w) => w.bidNumber.toLowerCase().includes(s) || (w.title || '').toLowerCase().includes(s));
    }
    if (statusFilter && statusFilter !== 'all') {
      workspaces = workspaces.filter((w) => w.status === statusFilter);
    }

    res.json({ success: true, data: workspaces });
  } catch (err) {
    console.error('getActiveWorkspaces error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch workspaces' });
  }
};

// gem_tenders.end_date free-text formats vary ("27-01-2026 9:00 AM" / "27-01-2026 09:00"); a
// best-effort parse for the workspace urgency badge only (not used for any filtering/sorting
// that needs to be exact — that's what end_date_dt is for elsewhere in this file).
function parseGemDateLoose(raw) {
  const m = String(raw).match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return null;
  let [, d, mo, y, h, mi, ap] = m;
  h = parseInt(h, 10);
  if (ap) {
    if (/pm/i.test(ap) && h < 12) h += 12;
    if (/am/i.test(ap) && h === 12) h = 0;
  }
  const dt = new Date(Number(y), Number(mo) - 1, Number(d), h, Number(mi));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

// @route GET /api/tenders/:bidNumber/suggestions
// Reads the AI-generated product matches the tender-automation pipeline
// already produced (tender_processing_results.suggested_products — a JSON
// array, one entry per tender line item), and overlays which one *this*
// partner has picked. The pick itself lives in our own
// tender_product_selections table, not on the shared row — same
// multi-tenant reasoning as TenderPartnerState.
exports.getSuggestedProducts = async (req, res) => {
  try {
    const bidNumber = fromUrlId(req.params.bidNumber);
    const result = await TenderProcessingResult.findOne({ where: { bidNo: bidNumber } });
    const rawProducts = result?.suggestedProducts || null;
    const parsed = Array.isArray(rawProducts) ? rawProducts : (rawProducts ? JSON.parse(rawProducts) : []);

    const selections = await TenderProductSelection.findAll({ where: { userId: req.user.id, bidNumber } });
    const selectedByItem = new Map(selections.map((s) => [s.itemKey, s.productCode]));

    const products = parsed.map((row) => ({
      item: row.item,
      itemCategory: row.item_category || null,
      tenderItemName: row.tender_item_name || null,
      productCode: row.product_code || null,
      productName: row.product_name || null,
      relevancyScore: typeof row.relevancy_score === 'number' ? row.relevancy_score : null,
      isSelected: selectedByItem.has(row.item) ? selectedByItem.get(row.item) === row.product_code : false,
    }));

    res.json({ success: true, data: products });
  } catch (err) {
    console.error('getSuggestedProducts error:', err);
    res.status(500).json({ success: false, message: 'Failed to load suggested products' });
  }
};

// @route POST /api/tenders/:bidNumber/suggestions/select
exports.selectSuggestedProduct = async (req, res) => {
  try {
    const bidNumber = fromUrlId(req.params.bidNumber);
    const { item, productCode } = req.body;
    if (!item || !productCode) {
      return res.status(400).json({ success: false, message: 'item and productCode are required' });
    }
    const [selection] = await TenderProductSelection.findOrCreate({
      where: { userId: req.user.id, bidNumber, itemKey: item },
      defaults: { userId: req.user.id, bidNumber, itemKey: item, productCode },
    });
    selection.productCode = productCode;
    await selection.save();
    res.json({ success: true, data: { item, productCode } });
  } catch (err) {
    console.error('selectSuggestedProduct error:', err);
    res.status(500).json({ success: false, message: 'Failed to save selection' });
  }
};

// @route POST /api/tenders/:bidNumber/suggestions/generate
// Runs the local Ollama-backed product matcher (backend/utils/productMatcher.js)
// against this tender's own dept/sub_cat/tech-spec data and stores the
// result the same way the original NewSystem pipeline did — into
// tender_processing_results.suggested_products — so it displays identically
// to a tender the old pipeline already processed.
exports.generateSuggestedProducts = async (req, res) => {
  try {
    const bidNumber = fromUrlId(req.params.bidNumber);
    const tender = await GemTender.findOne({ where: { bidNumber } });
    if (!tender) return res.status(404).json({ success: false, message: 'Tender not found' });

    const tenderJson = tender.toJSON();
    const parsed = tenderJson.jsonData ? parseGemJsonData(tenderJson.jsonData) : null;

    const { matchTenderToProduct } = require('../utils/productMatcher');
    const suggestion = await matchTenderToProduct({
      dept: tenderJson.dept,
      subCat: tenderJson.subCat,
      items: tenderJson.items,
      itemCategory: parsed?.itemCategories?.[0] || null,
      techSpecTables: parsed?.techSpecTables || [],
    });

    if (!suggestion) {
      return res.status(422).json({ success: false, message: 'Could not classify this tender into a Meril product category, or no matching Ollama model is available.' });
    }

    const { deviation_table: deviationTable, ...suggestionRow } = suggestion;
    await TenderProcessingResult.upsert({
      bidNo: bidNumber,
      dept: tenderJson.dept,
      itemCategory: suggestionRow.item_category,
      suggestedProducts: [suggestionRow],
      deviationTables: { [suggestionRow.item]: deviationTable },
      status: 'processed',
      processingDate: new Date(),
    });

    res.json({ success: true, data: suggestionRow });
  } catch (err) {
    console.error('generateSuggestedProducts error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to generate suggestions' });
  }
};

// @route GET /api/tenders/stats/summary
// Full clone of the tender-automation staff dashboard's stat set (see that
// repo's admin.controller.js -> getTenderDashboardStats), minus the
// per-division role scoping — this portal has no internal-staff role
// system, so it always shows the combined Diagno+Endo ("Both") view an
// Admin would see there.
const CONTRACT_DEPT_SQL = "LOWER(dept) IN ('diagno', 'endo')";

exports.getDashboardStats = async (req, res) => {
  try {
    const [
      [activeRow], [closingSoonRow], upcomingDeadlines, [openTendersRow],
      [contractsRow], [incidentsRow], [pendingResponseRow], recentActivity,
      deptSplitRows, [pipelineValueRow], topStates, ticketStatusRows,
      [distributorsRow], contractsTrendRows, [activeNowRow], [loginsTodayRow],
      [loginsWeekRow], [avgSessionRow], loginTrendRows, topSellers,
    ] = await Promise.all([
      sequelize.query(`SELECT COUNT(*) AS c FROM gem_tenders FORCE INDEX (idx_end_date_dt) WHERE ${ACTIVE_WHERE}`, { type: QueryTypes.SELECT }),
      sequelize.query(
        `SELECT COUNT(*) AS c FROM gem_tenders FORCE INDEX (idx_end_date_dt)
         WHERE ${ACTIVE_WHERE} AND gem_tenders.end_date_dt <= DATE_ADD(NOW(), INTERVAL 7 DAY)`,
        { type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT bid_number, LEFT(items, 140) AS title, dept, end_date, emd_amount, bid_value, detail_url,
                TIMESTAMPDIFF(HOUR, NOW(), gem_tenders.end_date_dt) AS hoursLeft
         FROM gem_tenders FORCE INDEX (idx_end_date_dt) WHERE ${ACTIVE_WHERE}
         ORDER BY gem_tenders.end_date_dt ASC LIMIT 8`,
        { type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT COUNT(*) AS c FROM open_tender_details
         WHERE relevency_checker IN ('proceed_futher', 'files_downloaded', 'yes')
           AND (STR_TO_DATE(closing_date, '%d-%M-%Y %h:%i %p') >= NOW() OR closing_date IS NULL OR closing_date = '')`,
        { type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT COUNT(*) AS c, COALESCE(SUM(CAST(total_value AS DECIMAL(18,2))), 0) AS total
         FROM contracts WHERE ${CONTRACT_DEPT_SQL}`,
        { type: QueryTypes.SELECT }
      ),
      sequelize.query(`SELECT COUNT(*) AS c FROM incidents WHERE LOWER(dept) IN ('diagno', 'endo')`, { type: QueryTypes.SELECT }),
      sequelize.query(
        `SELECT COUNT(*) AS c FROM incidents
         WHERE LOWER(dept) IN ('diagno', 'endo') AND status NOT IN ('Closed', 'Rejected', 'closed', 'rejected')`,
        { type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT gt.bid_number, LEFT(gt.items, 140) AS title, gt.dept, tpr.processing_date, tpr.status
         FROM tender_processing_results tpr
         JOIN gem_tenders gt ON gt.bid_number = tpr.bid_no
         WHERE tpr.result = 'yes' AND LOWER(gt.dept) IN ('diagno', 'endo')
         ORDER BY tpr.processing_date DESC LIMIT 6`,
        { type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT LOWER(dept) AS dept, COUNT(*) AS c FROM gem_tenders FORCE INDEX (idx_end_date_dt)
         WHERE ${ACTIVE_WHERE} GROUP BY LOWER(dept)`,
        { type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT COALESCE(SUM(CAST(bid_value AS DECIMAL(18,2))), 0) AS bidValueSum,
                COALESCE(SUM(CAST(emd_amount AS DECIMAL(18,2))), 0) AS emdSum
         FROM gem_tenders FORCE INDEX (idx_end_date_dt) WHERE ${ACTIVE_WHERE}`,
        { type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT state, COUNT(*) AS c FROM gem_tenders FORCE INDEX (idx_end_date_dt)
         WHERE ${ACTIVE_WHERE} AND state IS NOT NULL AND state != ''
         GROUP BY state ORDER BY c DESC LIMIT 6`,
        { type: QueryTypes.SELECT }
      ),
      sequelize.query(`SELECT COALESCE(status, 'Open') AS status, COUNT(*) AS c FROM support_tickets GROUP BY status`, { type: QueryTypes.SELECT }),
      sequelize.query(
        `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) AS activeCount FROM distributors`,
        { type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT DATE_FORMAT(contract_date, '%b %y') AS month, COUNT(*) AS c,
                COALESCE(SUM(CAST(total_value AS DECIMAL(18,2))), 0) AS val
         FROM contracts
         WHERE ${CONTRACT_DEPT_SQL} AND contract_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
         GROUP BY DATE_FORMAT(contract_date, '%Y-%m'), month
         ORDER BY DATE_FORMAT(contract_date, '%Y-%m') ASC`,
        { type: QueryTypes.SELECT }
      ),
      sequelize.query(`SELECT COUNT(*) AS c FROM user_sessions WHERE is_active = 1 AND last_heartbeat_at >= DATE_SUB(NOW(), INTERVAL 2 MINUTE)`, { type: QueryTypes.SELECT }),
      sequelize.query(`SELECT COUNT(*) AS c FROM user_login_history WHERE DATE(logged_in_at) = CURDATE()`, { type: QueryTypes.SELECT }),
      sequelize.query(`SELECT COUNT(*) AS c FROM user_login_history WHERE logged_in_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`, { type: QueryTypes.SELECT }),
      sequelize.query(`SELECT AVG(total_active_seconds) AS avgSeconds FROM user_sessions WHERE total_active_seconds > 0`, { type: QueryTypes.SELECT }),
      sequelize.query(
        `SELECT DATE(logged_in_at) AS day, COUNT(*) AS c FROM user_login_history
         WHERE logged_in_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
         GROUP BY DATE(logged_in_at) ORDER BY day ASC`,
        { type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT seller_name, COALESCE(SUM(CAST(total_value AS DECIMAL(18,2))), 0) AS revenue, COUNT(*) AS c
         FROM contracts
         WHERE ${CONTRACT_DEPT_SQL} AND seller_name IS NOT NULL AND seller_name != ''
         GROUP BY seller_name ORDER BY revenue DESC LIMIT 5`,
        { type: QueryTypes.SELECT }
      ),
    ]);

    const deptSplit = {
      diagno: 0, endo: 0,
      ...Object.fromEntries((deptSplitRows || []).map((r) => [r.dept, Number(r.c)])),
    };

    const supportTickets = { open: 0, inProgress: 0, resolved: 0, closed: 0 };
    (ticketStatusRows || []).forEach((r) => {
      const c = Number(r.c);
      const s = String(r.status || '').toLowerCase();
      if (s === 'open') supportTickets.open += c;
      else if (s === 'in progress' || s === 'in_progress') supportTickets.inProgress += c;
      else if (s === 'resolved') supportTickets.resolved += c;
      else if (s === 'closed') supportTickets.closed += c;
    });
    supportTickets.total = supportTickets.open + supportTickets.inProgress + supportTickets.resolved + supportTickets.closed;

    res.json({
      success: true,
      data: {
        activeTenders: Number(activeRow.c),
        closingSoon: Number(closingSoonRow.c),
        openTenders: Number(openTendersRow.c),
        contracts: { count: Number(contractsRow.c), totalValue: Number(contractsRow.total) },
        incidents: { total: Number(incidentsRow.c), pendingResponse: Number(pendingResponseRow.c) },
        deptSplit,
        pipelineValue: Number(pipelineValueRow.bidValueSum),
        emdLocked: Number(pipelineValueRow.emdSum),
        topStates: topStates.map((r) => ({ state: r.state, count: Number(r.c) })),
        supportTickets,
        distributors: { total: Number(distributorsRow.total) || 0, active: Number(distributorsRow.activeCount) || 0 },
        contractsTrend: contractsTrendRows.map((r) => ({ month: r.month, count: Number(r.c), value: Number(r.val) })),
        userActivity: {
          activeNow: Number(activeNowRow.c),
          loginsToday: Number(loginsTodayRow.c),
          loginsWeek: Number(loginsWeekRow.c),
          avgSessionSeconds: Math.round(Number(avgSessionRow.avgSeconds) || 0),
          trend: loginTrendRows.map((r) => ({ day: r.day, count: Number(r.c) })),
        },
        topSellers: topSellers.map((r) => ({ sellerName: r.seller_name, revenue: Number(r.revenue), count: Number(r.c) })),
        upcomingDeadlines: upcomingDeadlines.map((r) => ({ ...r, url_id: toUrlId(r.bid_number) })),
        recentActivity: recentActivity.map((r) => ({ ...r, url_id: toUrlId(r.bid_number) })),
      },
    });
  } catch (err) {
    console.error('getDashboardStats error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard stats' });
  }
};

// @route GET /api/tenders/participated
// Ports the automation site's "Participated Tenders" page (WinningProbability.jsx,
// backed by gemBids.controller.js's getGemBids). There is no "participated"
// flag stored anywhere — membership is derived: any classified (Diagno/Endo)
// GeM tender the automation pipeline already flagged
// tender_processing_results.result = 'yes' counts as participated. RA date +
// remarks are this partner's own notes (participated_tender_notes), not the
// shared row — same reasoning as every other per-partner table here.
exports.getParticipatedTenders = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const { search, state, dept, startDate, endDate } = req.query;

    const conditions = [CLASSIFIED_SQL.replace('gem_tenders.', 'gt.'), "tpr.result = 'yes'"];
    const replacements = { userId: req.user.id, limit, offset };

    if (search) {
      conditions.push('gt.bid_number LIKE :search');
      replacements.search = `%${search}%`;
    }
    if (state) {
      conditions.push('gt.state = :state');
      replacements.state = state;
    }
    if (dept) {
      conditions.push('LOWER(gt.dept) = :dept');
      replacements.dept = dept.toLowerCase();
    }
    const startDateDtSql = "STR_TO_DATE(REPLACE(gt.start_date, '/', '-'), '%d-%m-%Y %h:%i %p')";
    if (startDate) {
      conditions.push(`${startDateDtSql} >= :startDate`);
      replacements.startDate = startDate;
    }
    if (endDate) {
      conditions.push(`${startDateDtSql} <= :endDate`);
      replacements.endDate = endDate;
    }

    const whereSql = conditions.join(' AND ');

    const [rows, [{ total }]] = await Promise.all([
      sequelize.query(
        `SELECT gt.bid_number, gt.state, gt.quantity, gt.start_date, gt.end_date, gt.dept, gt.items,
                ptn.ra_date, ptn.remarks
         FROM gem_tenders gt
         JOIN tender_processing_results tpr ON tpr.bid_no = gt.bid_number
         LEFT JOIN participated_tender_notes ptn ON ptn.bid_number = gt.bid_number AND ptn.user_id = :userId
         WHERE ${whereSql}
         ORDER BY ${startDateDtSql} DESC
         LIMIT :limit OFFSET :offset`,
        { replacements, type: QueryTypes.SELECT },
      ),
      sequelize.query(
        `SELECT COUNT(*) AS total
         FROM gem_tenders gt
         JOIN tender_processing_results tpr ON tpr.bid_no = gt.bid_number
         LEFT JOIN participated_tender_notes ptn ON ptn.bid_number = gt.bid_number AND ptn.user_id = :userId
         WHERE ${whereSql}`,
        { replacements, type: QueryTypes.SELECT },
      ),
    ]);

    res.json({
      success: true,
      data: rows.map((r) => ({ ...r, url_id: toUrlId(r.bid_number) })),
      total: Number(total),
      page,
      limit,
      totalPages: Math.ceil(Number(total) / limit),
    });
  } catch (err) {
    console.error('getParticipatedTenders error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch participated tenders' });
  }
};

// @route PUT /api/tenders/:bidNumber/participated-note
exports.updateParticipatedTenderNote = async (req, res) => {
  try {
    const bidNumber = fromUrlId(req.params.bidNumber);
    const { raDate, remarks } = req.body;
    const [note] = await ParticipatedTenderNote.findOrCreate({
      where: { userId: req.user.id, bidNumber },
      defaults: { userId: req.user.id, bidNumber, raDate: raDate || null, remarks: remarks || null },
    });
    if (raDate !== undefined) note.raDate = raDate || null;
    if (remarks !== undefined) note.remarks = remarks || null;
    await note.save();
    res.json({ success: true, data: { raDate: note.raDate, remarks: note.remarks } });
  } catch (err) {
    console.error('updateParticipatedTenderNote error:', err);
    res.status(500).json({ success: false, message: 'Failed to save note' });
  }
};

// Shared with workspaceController.js (Tender Hub > Doc Prep needs the same
// tech-spec parsing this controller already does for the tender details page).
exports.helpers = { toUrlId, fromUrlId, parseGemJsonData, parseGemDocuments };
