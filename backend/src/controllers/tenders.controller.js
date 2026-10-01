const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../config/db');
const { getUserScope, isBlocked, seesAllTenders, isStateScoped, stateScopeSql } = require('../utils/userScope');
const ExcelJS = require('exceljs');
const cheerio = require('cheerio');
const pdfParse = require('pdf-parse');
const { callOllama, parseJsonResponse } = require('../utils/ollama');
const { resolveStateFromPincode, pincodeRangesForState, PINCODE_STATE_RANGES } = require('../utils/pincodeToState');

// open_tender_details never had an interest flag — only gem_tenders did —
// so marking an Open tender interested silently did nothing. Added here,
// idempotently, so every environment picks it up on next deploy.
(async () => {
  try {
    await db.query('ALTER TABLE open_tender_details ADD COLUMN is_interested TINYINT(1) DEFAULT 0');
  } catch (e) { if (!e.message.includes('Duplicate column')) console.error('[tenders] is_interested column init failed:', e.message); }
  // Who marked it interested — shown as "Interested by <name>" on the
  // Interested Tenders page. Cleared back to NULL when un-hearted.
  try {
    await db.query('ALTER TABLE gem_tenders ADD COLUMN interested_by INT NULL');
  } catch (e) { if (!e.message.includes('Duplicate column')) console.error('[tenders] gem_tenders.interested_by column init failed:', e.message); }
  try {
    await db.query('ALTER TABLE open_tender_details ADD COLUMN interested_by INT NULL');
  } catch (e) { if (!e.message.includes('Duplicate column')) console.error('[tenders] open_tender_details.interested_by column init failed:', e.message); }
})();

// Escapes MySQL LIKE wildcards (%, _) and the escape char itself, so a search
// term like "2026_DME_522040_1" matches those underscores literally instead
// of each one meaning "any single character" (MySQL's default ESCAPE is \).
const escapeLike = (s) => String(s).replace(/[\\%_]/g, '\\$&');

// Builds a WHERE fragment + params matching rows whose `state` column equals
// the requested state OR — when state is blank — whose `pincode` falls in
// that state's PIN code range(s). Returns null if the state has no usable
// filter (nothing to add to the query).
const buildStateFilter = (stateValue) => {
  if (!stateValue) return null;
  const ranges = pincodeRangesForState(stateValue);
  const params = [stateValue];
  let sql = `state = ?`;
  if (ranges.length) {
    sql += ` OR ((state IS NULL OR state = '') AND pincode IS NOT NULL AND pincode != '' AND (` +
      ranges.map(() => `CAST(pincode AS UNSIGNED) BETWEEN ? AND ?`).join(' OR ') +
      `))`;
    ranges.forEach(([min, max]) => params.push(min, max));
  }
  return { sql: `(${sql})`, params };
};

// ── Local product catalogue (imported from the Meril product data set) ───────
// Lives entirely in this repo under src/asset/products — no dependency on the
// external products.openprocure.ai service or the AI matching pipeline.
const PRODUCTS_DIR = path.join(__dirname, '../asset/products');

const FOLDER_TO_DEPT = {
  analyzer:    'analyser',
  endo:        'endo',
  reagents:    'reagents',
  systempacks: 'system_packs',
};
const FILE_TO_DEPT = {
  'rapid_elisa.json':  'rapid_elisa',
  'system_packs.json': 'system_packs',
};
const DIAGNOSTIC_DEPTS = new Set(['analyser', 'reagents', 'rapid_elisa', 'system_packs']);

const scanProductFiles = (dir) => {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'catlogue.json') continue; // documentation, not product data
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...scanProductFiles(full));
    else if (entry.name.endsWith('.json')) results.push(full);
  }
  return results;
};

const deptForFile = (filePath) => {
  const topSegment = path.relative(PRODUCTS_DIR, filePath).split(path.sep)[0];
  return FOLDER_TO_DEPT[topSegment] || FILE_TO_DEPT[topSegment] || 'other';
};

const normalizeProduct = (raw, department, sourceFile) => {
  const productCode = raw.product_code || raw.item_code || '';
  if (!productCode) return null;

  const title = raw.product_name || raw.instrument_name || raw.title || '';

  return {
    product_code: productCode,
    item_code: productCode,
    product_name: title,
    title,
    instrument_name: raw.instrument_name || '',
    category: raw.category || raw.sub_category || raw.type || '',
    type: raw.type || raw.category || '',
    brand: raw.brand || '',
    description: raw.description || '',
    department,
    source_file: sourceFile,
  };
};

// A few catalogue files carry bare NaN/Infinity tokens (invalid JSON) from
// the Python export that produced them — strip those before parsing so one
// bad field doesn't drop the whole file.
const sanitizeJsonText = (text) => text.replace(/:\s*-?(NaN|Infinity)\b/g, ': null');

let productCatalogCache = null;

const loadAllProducts = () => {
  if (productCatalogCache) return productCatalogCache;

  const allProducts = [];
  const seen = new Set();

  for (const filePath of scanProductFiles(PRODUCTS_DIR)) {
    try {
      const raw = JSON.parse(sanitizeJsonText(fs.readFileSync(filePath, 'utf-8')));
      const entries = Array.isArray(raw) ? raw : [raw];
      const department = deptForFile(filePath);
      const sourceFile = path.basename(filePath);

      for (const entry of entries) {
        const norm = normalizeProduct(entry, department, sourceFile);
        if (!norm) continue;
        const dedupeKey = `${sourceFile}::${norm.product_code}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        allProducts.push(norm);
      }
    } catch (err) {
      console.error(`Error reading ${filePath}:`, err.message);
    }
  }

  productCatalogCache = allProducts;
  return allProducts;
};

// Pulls Organisation Name / Office Name out of a gem_tender_docs JSON file's
// contents. Handles both shapes seen on disk: a flat bid_details dict, and
// the parsed-PDF pages[].tables[] key/value row format.
const extractOrgOffice = (jsonData) => {
  let organisationName = null;
  let officeName = null;
  if (!jsonData) return { organisationName, officeName };

  try {
    const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
    if (!data) return { organisationName, officeName };

    // Flat shape: { bid_details: { "Organisation Name": "...", "Office Name": "..." } }
    if (data.bid_details) {
      Object.entries(data.bid_details).forEach(([k, v]) => {
        const key = String(k).toLowerCase();
        if (!organisationName && key.includes('organisation')) organisationName = String(v).trim();
        if (!officeName && key.includes('office name')) officeName = String(v).trim();
      });
    }

    // Parsed-PDF shape: pages[].tables[] rows of [key, value]
    const pages = Array.isArray(data.pages) ? data.pages : [];
    pages.forEach(page => {
      (page.tables || []).forEach(table => {
        (table || []).forEach(row => {
          const [k, v] = row || [];
          if (!k || !v) return;
          const key = String(k).toLowerCase();
          if (!organisationName && key.includes('organisation')) organisationName = String(v).trim();
          if (!officeName && key.includes('office name')) officeName = String(v).trim();
        });
      });
    });
  } catch (e) { /* malformed json_data — leave both null */ }

  return { organisationName, officeName };
};

const getTenders = async (req, res) => {
  try {
    let {
      page = 1,
      limit = 20,
      search = '',
      department = '',
      tenderId = '',
      sort = 'desc',
      archived = 'false',
      departmentName = '',
      closingFrom = '',
      closingTo = '',
      preBidFrom = '',
      preBidTo = '',
      dept = '',
      perfectCat = '',
      subCat = '',
      tenderType = 'GEM',
      state = '',
      interested = ''
    } = req.query;
    const interestedOnly = interested === 'true' || interested === '1';

    /* ─────────────────────────────────────────────
       DEPARTMENT SCOPING
       The client-supplied `dept` and `tenderType` are narrowing filters only —
       they can never widen entitlement. A Tender Admin is hard-limited to their
       assigned division(s) and source(s); Admin is unrestricted. Unassigned
       Tender Admins get 403. See utils/userScope.js.
    ───────────────────────────────────────────── */
    const scope = await getUserScope(req.user.id);
    if (isBlocked(scope)) {
      return res.status(403).json({
        success: false,
        message: 'No department assigned. Ask an Admin to assign your division and source.',
      });
    }

    // A Tender Executive browses every tender regardless of department; only
    // their Workdesk and their approval routing are department-scoped.
    const unrestricted = seesAllTenders(scope);
    const allowedDivisions = unrestricted ? ['Endo', 'Diagno'] : scope.divisions;
    // Interested Tenders is deliberately NOT source-scoped: a tender someone
    // marked interested should show up for every user of that DIVISION,
    // whether they themselves are assigned GEM, Open, or both — "the whole
    // Endo team should see it, not just the Endo-GEM half of it". Division
    // scoping still applies as normal (an Endo user never sees a Diagno
    // interested tender). Regular (non-interested) browsing keeps the
    // existing source-restricted behaviour unchanged.
    const allowedSources = unrestricted || interestedOnly ? ['GEM', 'Open'] : scope.sources;

    if (!interestedOnly && !allowedSources.includes(tenderType === 'Open' ? 'Open' : 'GEM')) {
      return res.json({
        success: true, data: [], total: 0, page: +page, limit: +limit, totalPages: 0,
      });
    }

    // Narrow to a single allowed division, or leave blank to mean "all mine".
    dept = allowedDivisions.includes(dept) ? dept : '';
    const deptList = dept ? [dept] : allowedDivisions;

    /* ─────────────────────────────────────────────
       OPEN TENDERS — query open_tender_details
    ───────────────────────────────────────────── */
    if (tenderType === 'Open') {
      const offset = (page - 1) * limit;

      // Show tenders that passed the pre-filter (proceed_futher) OR are fully
      // processed (files_downloaded / yes). Do NOT show 'not_processed' or 'no'.
      let where = `WHERE relevency_checker IN ('proceed_futher', 'files_downloaded', 'yes')`;
      const params = [];

      if (interestedOnly) {
        where += ` AND is_interested = 1`;
      }

      // Dept filter — restricted to the caller's allowed divisions. LIKE, since
      // open_tender_details.dept can hold combined values like 'Endo/Diagno'.
      // dept = 'both' means relevant to every division, so it's always
      // visible regardless of which single division(s) the caller is scoped
      // to. Unclassified depts match nothing and are therefore hidden.
      where += ` AND (${deptList.map(() => 'LOWER(dept) LIKE ?').join(' OR ')} OR LOWER(dept) = 'both')`;
      params.push(...deptList.map(d => `%${d.toLowerCase()}%`));

      // Sales / Zonal Head only see their working states (unstated rows stay
      // visible — see stateScopeSql).
      const openState = stateScopeSql(scope, 'state');
      if (openState.sql !== '1=1') {
        where += ` AND ${openState.sql}`;
        params.push(...openState.params);
      }

      // An exact tender ID / reference number search should find the tender
      // even if it has since closed — the closing-date filter below is a
      // "still open" narrowing filter, not a relevance filter, and shouldn't
      // hide a tender someone is looking up by its own ID.
      let isOpenIdSearch = false;
      let openSearchTerm = '';

      if (search) {
        const s = search.trim();
        openSearchTerm = s;
        const sLike = escapeLike(s);
        if (!/\s/.test(s) && /[\/\_]/.test(s)) {
          // Contains slash or underscore — treat as a tender ID (e.g. 2024_GEM_123456)
          isOpenIdSearch = true;
          const slashForm = s.replace(/_/g, '/');
          const underForm = s.replace(/\//g, '_');
          where += ` AND (tender_id = ? OR tender_id = ? OR tender_id LIKE ? OR tender_id LIKE ? OR tender_refno LIKE ?)`;
          params.push(slashForm, underForm, `%${escapeLike(slashForm)}%`, `%${escapeLike(underForm)}%`, `%${sLike}%`);
        } else if (/^\d{5,}$/.test(s) || /^[A-Za-z]{0,3}\d{5,}[A-Za-z]?$/.test(s)) {
          // Looks like a bare tender ID or reference number (mostly digits,
          // optionally with a short letter prefix/suffix) — exact/near match
          // on tender_id or tender_refno, bypassing the closing-date filter.
          isOpenIdSearch = true;
          where += ` AND (tender_id = ? OR tender_id LIKE ? OR tender_refno = ? OR tender_refno LIKE ?)`;
          params.push(s, `%${sLike}%`, s, `%${sLike}%`);
        } else if (s.length >= 3) {
          // FULLTEXT search — uses idx_ft_open index, far faster than LIKE '%…%'
          const ftTerm = s.split(/\s+/).filter(w => w.length >= 2).map(w => `+${w}*`).join(' ') || `+${s}*`;
          where += ` AND (MATCH(tender_title, organisation_name) AGAINST(? IN BOOLEAN MODE) OR tender_id LIKE ? OR tender_refno LIKE ?)`;
          params.push(ftTerm, `%${sLike}%`, `%${sLike}%`);
        } else {
          // Short term (< 3 chars) — fall back to LIKE
          where += ` AND (tender_title LIKE ? OR tender_id LIKE ? OR organisation_name LIKE ? OR tender_refno LIKE ?)`;
          params.push(`%${sLike}%`, `%${sLike}%`, `%${sLike}%`, `%${sLike}%`);
        }
      }

      if (departmentName) {
        where += ` AND organisation_name LIKE ?`;
        params.push(`%${departmentName}%`);
      }

      const openStateFilter = buildStateFilter(state);
      if (openStateFilter) {
        where += ` AND ${openStateFilter.sql}`;
        params.push(...openStateFilter.params);
      }

      // Closing date range filters — closing_date stored as varchar ("28-May-2026 04:45 PM")
      // Parse the full datetime (date + time) so tenders that closed earlier today are excluded.
      const toDatetime = `STR_TO_DATE(closing_date, '%d-%M-%Y %h:%i %p')`;
      const toDateOnly = `STR_TO_DATE(SUBSTRING_INDEX(closing_date, ' ', 1), '%d-%M-%Y')`;
      if (archived !== 'true' && !isOpenIdSearch) {
        // Only show tenders whose closing datetime is in the future (or unparseable/null).
        // Skipped for an exact ID/ref-no search — see isOpenIdSearch above.
        where += ` AND (${toDatetime} >= NOW() OR closing_date IS NULL OR closing_date = '')`;
      }
      if (closingFrom) {
        where += ` AND ${toDateOnly} >= STR_TO_DATE(?, '%Y-%m-%d')`;
        params.push(closingFrom);
      }
      if (closingTo) {
        where += ` AND ${toDateOnly} <= STR_TO_DATE(?, '%Y-%m-%d')`;
        params.push(closingTo);
      }

      const toDatetimeStart = `STR_TO_DATE(e_published_date, '%d-%M-%Y %h:%i %p')`;
      const toDatetimeEnd   = `STR_TO_DATE(closing_date, '%d-%M-%Y %h:%i %p')`;
      let openOrderBy;
      switch (sort) {
        case 'startDateLatest': openOrderBy = `${toDatetimeStart} DESC`; break;
        case 'startDateOldest': openOrderBy = `${toDatetimeStart} ASC`;  break;
        case 'endDateOldest':   openOrderBy = `${toDatetimeEnd} ASC`;    break;
        default:                openOrderBy = `${toDatetimeEnd} DESC`;   break; // endDateLatest / relevance
      }

      // On an ID/ref-no search, put an exact match first regardless of the
      // chosen sort — a user looking up a specific tender by its own ID
      // expects it at the top, not buried by date ordering.
      const orderParams = [];
      if (openSearchTerm) {
        openOrderBy = `(CASE WHEN tender_id = ? OR tender_refno = ? THEN 0 ELSE 1 END), ${openOrderBy}`;
        orderParams.push(openSearchTerm, openSearchTerm);
      }

      const dataQuery = `
        SELECT
          tender_id         AS T_ID,
          tender_refno      AS ref_no,
          tender_title      AS title,
          organisation_name AS department,
          organisation_chain,
          e_published_date  AS start_date,
          closing_date      AS end_date,
          opening_date,
          state,
          pincode,
          dept,
          relevency_checker,
          is_interested,
          (SELECT name FROM users WHERE id = open_tender_details.interested_by) AS interested_by_name
        FROM open_tender_details
        ${where}
        ORDER BY ${openOrderBy}
        LIMIT ? OFFSET ?
      `;

      const countQuery = `
        SELECT COUNT(*) AS total
        FROM open_tender_details
        ${where}
      `;

      const [[rows], [[count]]] = await Promise.all([
        db.query(dataQuery, [...params, ...orderParams, +limit, +offset]),
        db.query(countQuery, params)
      ]);

      return res.json({
        page: +page,
        limit: +limit,
        total: count.total,
        totalPages: Math.ceil(count.total / limit),
        data: rows.map(r => ({
          T_ID: r.T_ID,
          ref_no: r.ref_no,
          title: r.title,
          department: r.department,
          organisation_chain: r.organisation_chain,
          start_date: r.start_date,
          end_date: r.end_date,
          opening_date: r.opening_date,
          state: r.state || resolveStateFromPincode(r.pincode),
          dept: r.dept,
          relevency_checker: r.relevency_checker,
          qty: 0,
          interested: !!r.is_interested,
          interestedByName: r.interested_by_name || null,
          value: 0,
          emd: 0,
          estimatedBidValue: 0,
          detail_url: `https://openprocure.ai/tenders/tenderdetails/${encodeURIComponent(r.T_ID)}`,
          ra_no: null,
          Representation_json: null,
          Corrigendum_json: null,
          json_details: null
        }))
      });
    }
    const offset = (page - 1) * limit;

    // Match on gem_tenders.dept, but fall back to tender_processing_results.dept —
    // a scraper that forgets to stamp gem_tenders.dept should not make a tender
    // invisible as long as it was recorded as processed for that division.
    let where = `WHERE ((dept = 'Endo' OR dept = 'Diagno' OR dept = '360') OR bid_number IN (SELECT bid_no FROM tender_processing_results WHERE dept IN ('Endo','Diagno','360'))) AND (ra_no IS NULL OR TRIM(ra_no) = '') AND (marked_not_relevant IS NULL OR marked_not_relevant = 0)`;
    const params = [];

    if (interestedOnly) {
      where += ` AND is_interested = 1`;
    }

    // An exact bid-number search should find the tender regardless of which
    // scraper pipeline classified it — perfect_cat is an internal scraping
    // artifact, not something a user typing a specific bid number should be
    // gated by (see isBidNumberSearch use below, in the perfectCat block).
    let isBidNumberSearch = false;

    if (search) {
      const s = search.trim();
      const sLike = escapeLike(s);
      if (!/\s/.test(s) && /[\/\_]/.test(s)) {
        // Contains slash or underscore — treat as a bid number (e.g. 2024/GEM/123456)
        isBidNumberSearch = true;
        const slashForm = s.replace(/_/g, '/');
        const underForm = s.replace(/\//g, '_');
        where += ` AND (bid_number = ? OR bid_number = ? OR bid_number LIKE ? OR bid_number LIKE ?)`;
        params.push(slashForm, underForm, `%${escapeLike(slashForm)}%`, `%${escapeLike(underForm)}%`);
      } else if (s.length >= 3) {
        // FULLTEXT search — uses idx_ft_gem index, far faster than LIKE '%…%'
        const ftTerm = s.split(/\s+/).filter(w => w.length >= 2).map(w => `+${w}*`).join(' ') || `+${s}*`;
        where += ` AND (MATCH(items, keyword) AGAINST(? IN BOOLEAN MODE) OR bid_number LIKE ?)`;
        params.push(ftTerm, `%${sLike}%`);
      } else {
        // Short term (< 3 chars) — fall back to LIKE
        where += ` AND (items LIKE ? OR bid_number LIKE ? OR keyword LIKE ?)`;
        params.push(`%${sLike}%`, `%${sLike}%`, `%${sLike}%`);
      }
    }

    if (departmentName) {
      where += ` AND department LIKE ?`;
      params.push(`%${departmentName}%`);
    }

    if (perfectCat === 'open') {
      where += ` AND perfect_cat = 0`;
      where += ` AND bid_number IN (SELECT bid_no FROM tender_processing_results WHERE result = 'yes')`;
    } else if (!isBidNumberSearch) {
      // Default to PERFECT category — skipped for an exact bid-number search,
      // which should find the tender no matter how it was categorized.
      where += ` AND perfect_cat = 1`;
    }

    if (subCat) {
      const subCatList = subCat.split(',').map(s => s.trim()).filter(Boolean);
      if (subCatList.length === 1) {
        where += ` AND (sub_cat = ? OR keyword = ?)`;
        params.push(subCatList[0], subCatList[0]);
      } else if (subCatList.length > 1) {
        const placeholders = subCatList.map(() => '?').join(',');
        where += ` AND (sub_cat IN (${placeholders}) OR keyword IN (${placeholders}))`;
        params.push(...subCatList, ...subCatList);
      }
    }

    // Restricted to the caller's allowed divisions; unclassified depts (NULL /
    // '360' / 'unknown') match nothing and stay hidden. dept = 'both' means
    // relevant to every division, so it's always visible regardless of which
    // single division(s) the caller is scoped to.
    {
      const ph = deptList.map(() => '?').join(',');
      where += ` AND (dept IN (${ph}) OR LOWER(dept) = 'both' OR bid_number IN (SELECT bid_no FROM tender_processing_results WHERE dept IN (${ph})))`;
      params.push(...deptList, ...deptList);
    }

    // Sales / Zonal Head: limit to their working states.
    {
      const gemState = stateScopeSql(scope, 'state');
      if (gemState.sql !== '1=1') {
        where += ` AND ${gemState.sql}`;
        params.push(...gemState.params);
      }
    }

    if (tenderId) {
      where += ` AND bid_number = ?`;
      params.push(tenderId);
    }



    if (closingFrom) {
      where += ` AND end_date >= ?`;
      params.push(closingFrom);
    }
    if (closingTo) {
      where += ` AND end_date <= ?`;
      params.push(closingTo);
    }

    if (preBidFrom) {
      where += ` AND start_date >= ?`;
      params.push(preBidFrom);
    }
    if (preBidTo) {
      where += ` AND start_date <= ?`;
      params.push(preBidTo);
    }

    if (department) {
      where += ` AND department LIKE ?`;
      params.push(`%${department}%`);
    }

    const gemStateFilter = buildStateFilter(state);
    if (gemStateFilter) {
      where += ` AND ${gemStateFilter.sql}`;
      params.push(...gemStateFilter.params);
    }

    let orderByClause = 'end_date ASC';

    const strToDateEnd = "STR_TO_DATE(REPLACE(end_date, '/', '-'), '%d-%m-%Y %h:%i %p')";
    const strToDateStart = "STR_TO_DATE(REPLACE(start_date, '/', '-'), '%d-%m-%Y %h:%i %p')";

    const activeCondition = ` AND ${strToDateEnd} >= NOW()`;

    switch (sort) {
      case 'relevance':
        where += activeCondition;
        orderByClause = `match_relevency DESC, ${strToDateEnd} DESC`;
        break;
      case 'startDateLatest':
        where += activeCondition;
        orderByClause = `${strToDateStart} DESC`;
        break;
      case 'startDateOldest':
        where += activeCondition;
        orderByClause = `${strToDateStart} ASC`;
        break;
      case 'endDateLatest':
        where += activeCondition;
        orderByClause = `${strToDateEnd} DESC`;
        break;
      case 'endDateOldest':
        where += activeCondition;
        orderByClause = `${strToDateEnd} ASC`;
        break;

      case 'upcoming':
        where += ` AND start_date >= CURDATE()`;
        orderByClause = 'start_date ASC';
        break;

      default:
        if (perfectCat !== 'perfect') {
          where += ` AND ${strToDateEnd} >= NOW()`;
        }

        if (sort === 'desc') {
          orderByClause = 'end_date DESC';
        }
        break;
    }



    const dataQuery = `
      SELECT
        bid_number AS T_ID,
        items AS title,
        department,
        start_date,
        end_date,
        quantity AS qty,
        is_interested AS interested,
        (SELECT name FROM users WHERE id = gem_tenders.interested_by) AS interested_by_name,
        match_relevency AS value,
        detail_url,
        ra_no,
        Representation_json,
        Corrigendum_json,
        keyword,
        emd_amount AS emd,
        bid_value AS estimatedBidValue,
        state,
        pincode
      FROM gem_tenders
      ${where}
      ORDER BY ${orderByClause}
      LIMIT ? OFFSET ?
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM gem_tenders
      ${where}
    `;

    const [
      [rows],
      [[count]]
    ] = await Promise.all([
      db.query(dataQuery, [...params, +limit, +offset]),
      db.query(countQuery, params)
    ]);

    // Organisation Name / Office Name — sourced ONLY from gem_tender_docs'
    // JSON file on disk (never from gem_tenders.json_data). GeM's search
    // listing never exposes these two fields, only the fuller scraped JSON
    // that gem_tender_docs.json_path points to has them.
    const orgOfficeByBid = {};

    if (rows.length > 0) {
      const bidNumbers = rows.map(r => r.T_ID);
      const placeholders = bidNumbers.map(() => '?').join(',');

      const [detailsRows] = await db.query(
        `SELECT bid_no, details FROM bid_details WHERE bid_no IN (${placeholders})`,
        bidNumbers
      );

      const detailsMap = {};
      detailsRows.forEach(d => {
        detailsMap[d.bid_no] = d.details;
      });

      rows.forEach(r => {
        if (detailsMap[r.T_ID]) {
          r.json_details = detailsMap[r.T_ID];
        }
      });

      const [docRows] = await db.query(
        `SELECT bid_number, json_path FROM gem_tender_docs WHERE bid_number IN (${placeholders})`,
        bidNumbers
      );

      await Promise.all(docRows.map(async (d) => {
        if (!d.json_path) return;
        try {
          const fileContent = await fs.promises.readFile(d.json_path, 'utf-8');
          orgOfficeByBid[d.bid_number] = extractOrgOffice(fileContent);
        } catch (e) { /* file missing/unreadable — leave org/office null */ }
      }));
    }

    res.json({
      page: +page,
      limit: +limit,
      total: count.total,
      totalPages: Math.ceil(count.total / limit),
      data: rows.map(r => {
        let parsedDetails = null;
        if (r.json_details) {
          if (typeof r.json_details === 'string') {
            try { parsedDetails = JSON.parse(r.json_details); } catch (e) {/* ignore */ }
          } else {
            parsedDetails = r.json_details;
          }
        }

        const { organisationName, officeName } = orgOfficeByBid[r.T_ID] || {};

        return {
          ...r,
          interested: !!r.interested,
          interestedByName: r.interested_by_name || null,
          json_details: parsedDetails,
          emd: r.emd ? Number(r.emd) : 0,
          estimatedBidValue: r.estimatedBidValue ? Number(r.estimatedBidValue) : 0,
          organisationName: organisationName || null,
          officeName: officeName || null,
          state: r.state || resolveStateFromPincode(r.pincode)
        };
      })
    });


  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch tenders' });
  }
};


const toggleInterested = async (req, res) => {
  let { bidNumber } = req.params;
  const slashed    = bidNumber.replace(/_/g, '/');
  const underscored = bidNumber.replace(/\//g, '_');

  try {
    // The tender is either in gem_tenders (bid_number, slash form) or
    // open_tender_details (tender_id, stored either form depending on the
    // scraper that wrote it) — never both, so only one of these two updates
    // actually affects a row; the other is a harmless no-op. Previously this
    // only touched gem_tenders, so marking an Open tender interested did
    // nothing at all.
    // interested_by records who last hearted it — set to the caller when
    // turning interest ON, cleared back to NULL when turning it OFF (shown
    // as "Interested by <name>" on the Interested Tenders page).
    // MySQL evaluates a multi-column SET left-to-right, and a later
    // assignment referencing a column already reassigned earlier in the
    // SAME statement sees that NEW value, not the original row — so
    // interested_by must be computed BEFORE is_interested is overwritten,
    // or it always sees the post-toggle value and comes out wrong (verified:
    // with is_interested assigned first, interested_by stayed NULL on every
    // toggle since the IF() always saw the just-written new value).
    const [[gemResult], [openResult]] = await Promise.all([
      db.query(
        `UPDATE gem_tenders
         SET interested_by = IF(is_interested = 1, NULL, ?),
             is_interested = IF(is_interested = 1, 0, 1)
         WHERE bid_number = ?`,
        [req.user.id, slashed]
      ),
      db.query(
        `UPDATE open_tender_details
         SET interested_by = IF(is_interested = 1, NULL, ?),
             is_interested = IF(is_interested = 1, 0, 1)
         WHERE tender_id IN (?, ?)`,
        [req.user.id, slashed, underscored]
      ),
    ]);

    if (!gemResult.affectedRows && !openResult.affectedRows) {
      return res.status(404).json({ success: false, message: 'Tender not found' });
    }

    // Read back the actual resulting value — whichever table this bid
    // number lives in — so the frontend's toggle button reflects the real
    // state instead of assuming its own click always succeeded.
    const [[gemRow]]  = await db.query(`SELECT is_interested FROM gem_tenders WHERE bid_number = ?`, [slashed]);
    const [[openRow]] = gemRow ? [[null]] : await db.query(`SELECT is_interested FROM open_tender_details WHERE tender_id IN (?, ?)`, [slashed, underscored]);
    const isInterested = !!(gemRow ? gemRow.is_interested : openRow?.is_interested);

    // The frontend has always expected { success, data: { is_interested } }
    // (see handleToggleInterest in TendersPage.jsx) — this response never
    // carried those fields before, so every toggle silently fell through to
    // the "Failed to update interest status" branch regardless of the
    // update actually succeeding. Fixed here since the Interested page
    // depends on this endpoint reporting its real result correctly.
    res.json({ success: true, message: 'Interest updated', data: { is_interested: isInterested ? 1 : 0 } });
  } catch (err) {
    console.error('[tenders] toggleInterested:', err);
    res.status(500).json({ success: false, message: 'Failed to update interest' });
  }
};

// ── Master List feedback (delete/change reasons) ──────────────────────────────
// Durable log of why a suggested product was rejected or swapped, independent
// of `suggested_products` (which gets fully overwritten every time the AI
// pipeline reprocesses a bid). Read by Product-Suggestion/NewSystem/step4-gpt.py
// (get_product_feedback) to avoid re-suggesting rejected codes and to nudge
// the LLM toward what users actually picked, keyed on `selected_file` — the
// same catalogue-file string both this table and step4-gpt.py already use to
// identify a product's candidate pool.
const ensureProductFeedbackTable = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS product_feedback (
      id                    INT AUTO_INCREMENT PRIMARY KEY,
      bid_no                VARCHAR(150) NOT NULL,
      item_key              VARCHAR(50)  NULL,
      action                ENUM('deleted','changed') NOT NULL,
      selected_file         VARCHAR(255) NULL,
      item_category         VARCHAR(255) NULL,
      tender_item_name      TEXT NULL,
      product_code          VARCHAR(100) NULL,
      previous_product_code VARCHAR(100) NULL,
      reason                TEXT NOT NULL,
      created_by            INT NULL,
      created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_selected_file (selected_file),
      INDEX idx_bid_no (bid_no)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};
ensureProductFeedbackTable().catch(err => console.error('[product-feedback] table init failed:', err));

const getSuggestedProducts = async (req, res) => {
  const { bidNumber } = req.params;

  try {
    const decodedBidNumber = decodeURIComponent(bidNumber).replace(/_/g, '/');

    const [rows] = await db.query(
      `SELECT suggested_products, relevancy_check, dept 
       FROM tender_processing_results 
       WHERE bid_no = ?`,
      [decodedBidNumber]
    );

    if (rows.length === 0) {
      return res.json({ success: true, data: [], detected_category: null, selected_product: null });
    }

    // Parse suggested_products
    let suggestions = rows[0].suggested_products;
    if (typeof suggestions === 'string') {
      try {
        suggestions = JSON.parse(suggestions);
      } catch (e) {
        console.error('Error parsing suggested_products:', e);
        suggestions = [];
      }
    }

    // With the new DB logic, suggestions array contains the full object:
    // { item, product_code, product_name, item_category, selected_file, relevancy_score, tender_item_name }

    let transformedSuggestions = [];
    if (Array.isArray(suggestions)) {
      transformedSuggestions = suggestions
        .map((item, index) => {
          let derivedCategory = '';
          if (item.selected_file) {
            // e.g., "./products/endo/Suture.json" -> "Suture"
            const parts = item.selected_file.split('/');
            const filename = parts.pop();
            if (filename) {
              derivedCategory = filename.replace('.json', '');
            }
          }

          const serialMatch = /(\d+)\s*$/.exec(item.item || '');
          const rawProduct = item.product_code ? loadAllProductsRaw().get(item.product_code) : null;

          return {
            item_key: item.item || '',
            serial_no: serialMatch ? Number(serialMatch[1]) : index + 1,
            type: derivedCategory || item.item_category || '',
            category: derivedCategory || '',
            dept: rows[0].dept || '',
            title: item.product_name || '',
            product_code: item.product_code || '',
            brand: item.brand || rawProduct?.brand || '',
            relevancy_score: item.relevancy_score ?? 0,
            tender_item_name: item.tender_item_name || '',
            specification: item.specification || item.tender_item_name || '',
            selected_file: item.selected_file || '',
            selected: item.selected ?? false,
            item_category: item.item_category || '',
            deleted: item.status === 'deleted',
            delete_reason: item.delete_reason || '',
            change_reason: item.change_reason || '',
            previous_product_code: item.previous_product_code || ''
          };
        });
    }

    // Detected category from first suggestion's item_main_category
    const detectedCategory = transformedSuggestions.length > 0
      ? transformedSuggestions[0].category
      : null;

    // Selected product: explicitly selected, else highest relevancy_score
    const selectedProduct =
      transformedSuggestions.find(p => p.selected === true) ||
      transformedSuggestions.reduce((best, curr) =>
        curr.relevancy_score > (best?.relevancy_score ?? -1) ? curr : best
        , null);

    res.json({
      success: true,
      data: transformedSuggestions,
      detected_category: detectedCategory,
      selected_product: selectedProduct
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch suggestions' });
  }
};

// Raw (non-normalized) product entries keyed by product_code, so callers that
// need the FULL spec sheet (e.g. deviation-table generation) can fetch it —
// searchProducts/normalizeProduct above strips technical_specifications down
// to just name/category/brand for search-result display.
let rawProductByCodeCache = null;

const loadAllProductsRaw = () => {
  if (rawProductByCodeCache) return rawProductByCodeCache;

  const map = new Map();
  for (const filePath of scanProductFiles(PRODUCTS_DIR)) {
    try {
      const raw = JSON.parse(sanitizeJsonText(fs.readFileSync(filePath, 'utf-8')));
      const entries = Array.isArray(raw) ? raw : [raw];
      for (const entry of entries) {
        const code = entry.product_code || entry.item_code;
        if (code && !map.has(code)) map.set(code, entry);
      }
    } catch (err) {
      console.error(`Error reading ${filePath}:`, err.message);
    }
  }

  rawProductByCodeCache = map;
  return map;
};

const getProductByCode = async (req, res) => {
  const { code } = req.params;

  try {
    const product = loadAllProductsRaw().get(code);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, data: product });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch product' });
  }
};

/**
 * GET /api/tenders/price-list/by-code/:code
 * Looks up one SKU in price_list_2026 (the imported 2026 Endo + Diagno price
 * lists) for Process Decode's autofill — brand, GST%, HSN, and pricing.
 * Matched two ways: exact sku_code first, then with spaces stripped from
 * both sides, since the Endo sheet's codes carry spaces ("NYS01 905") that a
 * deviation-analysis code often won't have typed the same way.
 */
const getPriceListByCode = async (req, res) => {
  const { code } = req.params;
  if (!code) return res.status(400).json({ success: false, message: 'Code is required' });

  try {
    const [exact] = await db.query(
      `SELECT * FROM price_list_2026 WHERE sku_code = ? LIMIT 1`,
      [code]
    );
    if (exact.length) return res.json({ success: true, data: exact[0] });

    const [loose] = await db.query(
      `SELECT * FROM price_list_2026 WHERE REPLACE(sku_code, ' ', '') = ? LIMIT 1`,
      [String(code).replace(/\s+/g, '')]
    );
    if (loose.length) return res.json({ success: true, data: loose[0] });

    return res.status(404).json({ success: false, message: 'SKU not found in price list' });
  } catch (err) {
    console.error('getPriceListByCode:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch price list entry' });
  }
};

const searchProducts = async (req, res) => {
  const { q = '', dept = '' } = req.query;

  try {
    let results = loadAllProducts();

    if (dept && dept !== 'all') {
      results = dept === 'diagnostic'
        ? results.filter(p => DIAGNOSTIC_DEPTS.has(p.department))
        : results.filter(p => p.department === dept);
    }

    if (q) {
      const term = q.toLowerCase();
      results = results.filter(p =>
        p.product_code.toLowerCase().includes(term) ||
        p.title.toLowerCase().includes(term) ||
        p.category.toLowerCase().includes(term)
      );
    }

    res.json({ success: true, data: results.slice(0, 200) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Search failed' });
  }
};

const updateSuggestedProducts = async (req, res) => {
  const { bidNumber } = req.params;
  const { products } = req.body;

  try {
    const decodedBidNumber = decodeURIComponent(bidNumber).replace(/_/g, '/');

    let maxItemNum = 0;

    // First pass: find the maximum existing item number
    products.forEach(p => {
      if (p.item_key && typeof p.item_key === 'string' && p.item_key.startsWith('item_')) {
        const numPattern = p.item_key.replace('item_', '');
        const num = parseInt(numPattern, 10);
        if (!isNaN(num) && num > maxItemNum) {
          maxItemNum = num;
        }
      }
    });

    // Map the products array from frontend format to backend DB format.
    // Along the way, collect any pending delete/change reasons into a durable
    // feedback log (product_feedback) — `suggested_products` below gets fully
    // overwritten on every save (and every AI reprocess), so a reason stored
    // only inside it wouldn't survive to inform future suggestions.
    const feedbackRows = [];
    const dbFormattedProducts = products.map(p => {
      let finalItemKey = p.item_key || '';
      if (!finalItemKey || !finalItemKey.startsWith('item_')) {
        maxItemNum += 1;
        finalItemKey = `item_${maxItemNum}`;
      }

      if (p._feedback_pending && (p.delete_reason || p.change_reason)) {
        const isDelete = !!p.deleted;
        feedbackRows.push([
          decodedBidNumber,
          finalItemKey,
          isDelete ? 'deleted' : 'changed',
          p.selected_file || null,
          p.item_category || p.category || null,
          p.tender_item_name || null,
          isDelete ? (p.previous_product_code || null) : (p.product_code || null),
          isDelete ? null : (p.previous_product_code || null),
          isDelete ? p.delete_reason : p.change_reason,
          req.user?.id || null
        ]);
      }

      return {
        item: finalItemKey,
        product_code: p.product_code || '',
        product_name: p.title || '',
        item_category: p.item_category || p.category || '',
        selected_file: p.selected_file || '',
        relevancy_score: p.relevancy_score !== undefined ? Number(p.relevancy_score) : 0,
        tender_item_name: p.tender_item_name || '',
        status: p.deleted ? 'deleted' : 'active',
        delete_reason: p.delete_reason || '',
        change_reason: p.change_reason || '',
        previous_product_code: p.previous_product_code || ''
        // _feedback_pending intentionally omitted — it's a one-shot save trigger,
        // never persisted, so a later save without new actions can't re-log it.
      };
    });

    // Removing a product is really just saving a shorter list through this
    // same endpoint — the UI hides the trash icon for anyone but Admin/Tender
    // Admin, but that's cosmetic only, so enforce it here too (a determined
    // Tender Executive is otherwise one PUT away from deleting a product).
    const [[existing]] = await db.query(
      `SELECT suggested_products FROM tender_processing_results WHERE bid_no = ?`,
      [decodedBidNumber]
    );
    if (existing?.suggested_products) {
      let prevProducts = existing.suggested_products;
      if (typeof prevProducts === 'string') {
        try { prevProducts = JSON.parse(prevProducts); } catch { prevProducts = []; }
      }
      const prevKeys = new Set((prevProducts || []).map(p => p.item));
      const newKeys = new Set(dbFormattedProducts.map(p => p.item));
      const removed = [...prevKeys].some(k => !newKeys.has(k));
      if (removed && req.user.role !== 'Admin' && req.user.role !== 'Tender Admin' && req.user.role !== 'Office Administrator') {
        return res.status(403).json({ success: false, message: 'Only Admins and Tender Admins can remove a product.' });
      }
    }

    await db.query(
      `UPDATE tender_processing_results SET suggested_products = ? WHERE bid_no = ? `,
      [JSON.stringify(dbFormattedProducts), decodedBidNumber]
    );

    if (feedbackRows.length) {
      await db.query(
        `INSERT INTO product_feedback
           (bid_no, item_key, action, selected_file, item_category, tender_item_name,
            product_code, previous_product_code, reason, created_by)
         VALUES ?`,
        [feedbackRows]
      );
    }

    // --- Devation Pruning Logic ---
    // Get current deviation_tables
    const [rows] = await db.query(
      `SELECT deviation_tables FROM tender_processing_results WHERE bid_no = ?`,
      [decodedBidNumber]
    );

    if (rows.length > 0 && rows[0].deviation_tables) {
      let deviations = rows[0].deviation_tables;

      if (typeof deviations === 'string') {
        try {
          deviations = JSON.parse(deviations);
        } catch (e) {
          deviations = {};
        }
      }

      // Collect all active item keys from the new suggestions
      const activeItemKeys = new Set(dbFormattedProducts.map(p => p.item));
      let deviationsChanged = false;

      // Prune keys from deviation_tables that are no longer in activeItemKeys
      Object.keys(deviations).forEach(key => {
        if (!activeItemKeys.has(key)) {
          delete deviations[key];
          deviationsChanged = true;
        }
      });

      // If pruned, update the DB
      if (deviationsChanged) {
        await db.query(
          `UPDATE tender_processing_results SET deviation_tables = ? WHERE bid_no = ?`,
          [JSON.stringify(deviations), decodedBidNumber]
        );
      }
    }
    // ------------------------------

    res.json({ success: true, message: 'Suggestions updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update suggestions' });
  }
};

const saveSelectedProduct = async (req, res) => {
  const { bidNumber } = req.params;
  const { product } = req.body;

  try {
    await db.query(
      `UPDATE main_relevency SET selected_product = ? WHERE bid_number = ? `,
      [JSON.stringify(product), bidNumber]
    );

    res.json({ success: true, message: 'Product selection saved' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to save selection' });
  }
};

// Shared by getDeviationTables/exportDeviationsExcel — loads deviation_tables
// plus the item -> product_code/relevancy_score lookup derived from
// suggested_products (both keyed the same way, by item_key).
const _loadDeviationsWithProductCodes = async (bidNumber) => {
  const [rows] = await db.query(
    `SELECT deviation_tables, representation_letter, suggested_products FROM tender_processing_results WHERE bid_no = ? `,
    [bidNumber]
  );

  if (rows.length === 0) {
    return { deviations: {}, productCodes: {}, relevancyScores: {}, hasRepresentation: false };
  }

  let deviations = rows[0].deviation_tables;
  if (typeof deviations === 'string') {
    try {
      deviations = JSON.parse(deviations);
    } catch (e) {
      console.error('Error parsing deviation_tables:', e);
      deviations = {};
    }
  }

  let productCodes = {};
  let relevancyScores = {};
  if (rows[0].suggested_products) {
    try {
      let suggestions = rows[0].suggested_products;
      if (typeof suggestions === 'string') {
        suggestions = JSON.parse(suggestions);
      }
      if (Array.isArray(suggestions)) {
        suggestions.forEach(product => {
          if (product.item) {
            productCodes[product.item] = product.product_code || '';
            relevancyScores[product.item] = product.relevancy_score ?? null;
          }
        });
      }
    } catch (e) {
      console.error("Error parsing suggested_products for product codes:", e);
    }
  }

  return {
    deviations: deviations || {},
    productCodes,
    relevancyScores,
    hasRepresentation: !!rows[0].representation_letter
  };
};

const getDeviationTables = async (req, res) => {
  const { bidNumber } = req.params;

  try {
    const { deviations, productCodes, relevancyScores, hasRepresentation } =
      await _loadDeviationsWithProductCodes(bidNumber);

    res.json({
      success: true,
      data: deviations,
      productCodes,
      relevancyScores,
      has_representation: hasRepresentation
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch deviation tables' });
  }
};

// GET /tenders/:bidNumber/deviations/export — all items' deviation rows as
// one .xlsx (Item + Product Code columns identify which item each row is from,
// so re-importing the same file can be grouped back per item).
const exportDeviationsExcel = async (req, res) => {
  const { bidNumber } = req.params;

  try {
    const { deviations, productCodes } = await _loadDeviationsWithProductCodes(bidNumber);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Deviations');

    worksheet.columns = [
      { header: 'Item',               key: 'item',               width: 14 },
      { header: 'Product Code',       key: 'product_code',       width: 16 },
      { header: 'Specification',      key: 'specification',      width: 28 },
      { header: 'Tender Requirement', key: 'tender_requirement', width: 28 },
      { header: 'Product Offered',    key: 'product_offered',    width: 28 },
      { header: 'Status',             key: 'status',             width: 16 },
      { header: 'Reason',             key: 'reason',              width: 36 },
      { header: 'Remarks',            key: 'remarks',             width: 28 },
    ];
    worksheet.getRow(1).font = { bold: true };

    Object.keys(deviations).forEach(itemKey => {
      const rows = Array.isArray(deviations[itemKey]) ? deviations[itemKey] : [];
      rows.forEach(row => {
        worksheet.addRow({
          item: itemKey,
          product_code: productCodes[itemKey] || '',
          specification: row.specification || '',
          tender_requirement: row.tender_requirement || '',
          product_offered: row.product_offered || '',
          status: row.status || '',
          reason: row.reason || '',
          remarks: row.remarks || '',
        });
      });
    });

    // Dropdown on Status so a re-imported file keeps using valid values.
    const statusLetter = worksheet.getColumn('status').letter;
    for (let r = 2; r <= worksheet.rowCount; r++) {
      worksheet.getCell(`${statusLetter}${r}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"Complied,Not Complied,Not Specified,Not Applicable"'],
      };
    }

    const safeName = String(bidNumber).replace(/[\\/*?:[\]]/g, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=deviation_${safeName}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('exportDeviationsExcel error:', err);
    res.status(500).json({ message: 'Failed to export deviation table' });
  }
};

// POST /tenders/:bidNumber/deviations/import — parses an uploaded .xlsx (same
// layout as the export above) and returns the parsed deviation_tables shape.
// Deliberately does NOT write to the DB: the frontend loads the result into
// the page in edit mode so the user reviews it, same as a manual edit, before
// the existing Save button (updateDeviationTables) persists it.
const importDeviationsExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return res.status(400).json({ success: false, message: 'Uploaded file has no sheets' });
    }

    // Map header text -> column index, case-insensitive.
    const colIndex = {};
    worksheet.getRow(1).eachCell((cell, colNumber) => {
      colIndex[String(cell.value || '').trim().toLowerCase()] = colNumber;
    });

    if (!colIndex['item']) {
      return res.status(400).json({ success: false, message: "Missing required 'Item' column" });
    }

    const cellText = (row, header) => {
      const idx = colIndex[header];
      if (!idx) return '';
      const val = row.getCell(idx).value;
      if (val == null) return '';
      if (typeof val === 'object' && 'text' in val) return String(val.text).trim();   // rich text
      if (typeof val === 'object' && 'result' in val) return String(val.result).trim(); // formula
      return String(val).trim();
    };

    const deviations = {};
    for (let r = 2; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      const itemKey = cellText(row, 'item');
      if (!itemKey) continue;

      const specification = cellText(row, 'specification');
      const tenderRequirement = cellText(row, 'tender requirement');
      const productOffered = cellText(row, 'product offered');
      const status = cellText(row, 'status');
      if (!specification && !tenderRequirement && !productOffered && !status) continue; // blank row

      if (!deviations[itemKey]) deviations[itemKey] = [];
      deviations[itemKey].push({
        specification,
        tender_requirement: tenderRequirement,
        product_offered: productOffered,
        status: status || 'Not Specified',
        reason: cellText(row, 'reason'),
        remarks: cellText(row, 'remarks'),
      });
    }

    if (Object.keys(deviations).length === 0) {
      return res.status(400).json({ success: false, message: 'No valid rows found in the uploaded file' });
    }

    res.json({ success: true, data: deviations });
  } catch (err) {
    console.error('importDeviationsExcel error:', err);
    res.status(500).json({ success: false, message: 'Failed to parse uploaded file — is it a valid .xlsx?' });
  }
};

const updateDeviationTables = async (req, res) => {
  const { bidNumber } = req.params;
  const { deviations } = req.body;

  try {
    await db.query(
      `UPDATE tender_processing_results SET deviation_tables = ? WHERE bid_no = ? `,
      [JSON.stringify(deviations), bidNumber]
    );

    res.json({ success: true, message: 'Deviation tables updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update deviation tables' });
  }
};

const getTenderDetails = async (req, res) => {
  const { bidNumber } = req.params;

  try {
    const decodedBidNumber = decodeURIComponent(bidNumber).replace(/_/g, '/');

    const [rows] = await db.query(
      `SELECT *, json_data FROM gem_tenders WHERE bid_number = ? `,
      [decodedBidNumber]
    );

    /* ─── OPEN TENDER FALLBACK ─────────────────────────────────────────────
       If not found in gem_tenders, check open_tender_details.
       The tender_id in that table uses the raw value (with slashes).
    ──────────────────────────────────────────────────────────────────────── */
    if (rows.length === 0) {
      // Revert slashes to underscores for open_tender_details lookup
      const openBidNumber = decodedBidNumber.replace(/\//g, '_');

      const [openRows] = await db.query(
        `SELECT
           tender_id,
           tender_refno,
           tender_title,
           organisation_name,
           organisation_chain,
           e_published_date,
           closing_date,
           opening_date,
           state,
           tender_details,
           file_link,
           tender_page_link,
           tender_site_link,
           downloaded_documents
         FROM open_tender_details
         WHERE tender_id = ?
         LIMIT 1`,
        [openBidNumber]
      );

      if (openRows.length === 0) {
        return res.status(404).json({ success: false, message: 'Tender not found' });
      }

      const r = openRows[0];

      // Parse tender_details JSON if stored as string
      let parsedDetails = null;
      if (r.tender_details) {
        if (typeof r.tender_details === 'string') {
          try { parsedDetails = JSON.parse(r.tender_details); } catch { parsedDetails = r.tender_details; }
        } else {
          parsedDetails = r.tender_details;
        }
      }

      // Parse file_link JSON if stored as string
      let parsedFiles = null;
      if (r.file_link) {
        if (typeof r.file_link === 'string') {
          try { parsedFiles = JSON.parse(r.file_link); } catch { parsedFiles = r.file_link; }
        } else {
          parsedFiles = r.file_link;
        }
      }

      // Parse downloaded_documents JSON if stored as string
      let parsedDownloaded = null;
      if (r.downloaded_documents) {
        if (typeof r.downloaded_documents === 'string') {
          try { parsedDownloaded = JSON.parse(r.downloaded_documents); } catch { parsedDownloaded = null; }
        } else {
          parsedDownloaded = r.downloaded_documents;
        }
      }

      return res.json({
        success: true,
        open_source: true,          // <-- flag for frontend to detect Open tender
        data: {
          bid_number: r.tender_id,
          ref_no: r.tender_refno || null,
          items: r.tender_title,
          department: r.organisation_name,
          organisation_chain: r.organisation_chain || null,
          start_date: r.e_published_date,
          end_date: r.closing_date,
          opening_date: r.opening_date,
          state: r.state,
          tender_details: parsedDetails,
          file_link: parsedFiles,
          tender_page_link: r.tender_page_link || null,
          tender_site_link: r.tender_site_link || null,
          downloaded_documents: parsedDownloaded,
          // Nulls for fields that don't exist in open_tender_details
          json_data: null,
          emd_amount: null,
          bid_value: null,
          is_interested: false,
          ra_no: null,
          Representation_json: null,
          Corrigendum_json: null,
          keyword: null,
          detail_url: null
        }
      });
    }
    /* ─────────────────────────────────────────────────────────────────────── */

    let tenderData = rows[0];
    // Scraper-pulled GEM tenders keep their authoritative JSON in a file on
    // disk (gem_tender_docs), which can be more complete/fresher than
    // whatever's cached in this row, so it takes priority when present.
    // But tenders created via the document-upload flow ("document_tender"
    // in json_data.source — the user pastes/uploads a tender doc and it's
    // AI-extracted) have NO gem_tender_docs row at all; their JSON only ever
    // lives in this column. Unconditionally nulling it out before checking
    // gem_tender_docs (as this used to) discarded that data entirely and
    // made every document-upload tender 404 as "not found" on the details
    // page, even though the row — and all its content — was right here.
    const inlineJsonData = tenderData.json_data;
    tenderData.json_data = null;

    try {
      const [docRows] = await db.query(
        `SELECT json_path FROM gem_tender_docs WHERE bid_number = ? LIMIT 1`,
        [decodedBidNumber]
      );

      if (docRows.length > 0 && docRows[0].json_path) {
        const jsonPath = docRows[0].json_path;
        console.log(`[TenderDetails] Found override JSON path for ${decodedBidNumber}: ${jsonPath}`);

        if (fs.existsSync(jsonPath)) {
          const fileContent = fs.readFileSync(jsonPath, 'utf-8');
          try {
            tenderData.json_data = fileContent;
            console.log(`[TenderDetails] Successfully loaded JSON from file: ${jsonPath}`);
          } catch (parseErr) {
            console.warn(`[TenderDetails] Failed to parse JSON from file ${jsonPath}:`, parseErr);
          }
        } else {
          console.warn(`[TenderDetails] Override JSON path does not exist: ${jsonPath}`);
        }
      }
    } catch (docErr) {
      console.warn(`[TenderDetails] Error checking gem_tender_docs:`, docErr);
    }

    if (!tenderData.json_data && inlineJsonData) {
      tenderData.json_data = inlineJsonData;
    }

    res.json({
      success: true,
      data: tenderData
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch tender details' });
  }
};


const getTenderMeta = async (req, res) => {
  const { bidNumber } = req.params;
  try {
    const decodedBidNumber = decodeURIComponent(bidNumber).replace(/_/g, '/');
    const [rows] = await db.query(
      `SELECT is_interested, ra_no, Corrigendum_json, Representation_json, dept FROM gem_tenders WHERE bid_number = ? `,
      [decodedBidNumber]
    );

    if (rows.length === 0) {
      // OPEN TENDER FALLBACK
      const openBidNumber = decodedBidNumber.replace(/\//g, '_');
      const [openRows] = await db.query(
        `SELECT tender_id, dept FROM open_tender_details WHERE tender_id = ? LIMIT 1`,
        [openBidNumber]
      );
      if (openRows.length > 0) {
        return res.json({
          success: true,
          data: {
            is_interested: false,
            ra_no: null,
            Corrigendum_json: null,
            Representation_json: null,
            dept: openRows[0].dept || null,
          }
        });
      }
      return res.status(404).json({ success: false, message: 'Tender not found in DB' });
    }

    res.json({
      success: true,
      data: {
        is_interested: !!rows[0].is_interested,
        ra_no: rows[0].ra_no,
        Corrigendum_json: rows[0].Corrigendum_json,
        Representation_json: rows[0].Representation_json,
        dept: rows[0].dept || null,
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch metadata' });
  }
};

const getTenderDocumentPath = async (req, res) => {
  const { bidNumber } = req.params;
  try {
    const decodedBidNumber = decodeURIComponent(bidNumber).replace(/_/g, '/');

    // 1. Check gem_tender_docs for a scraped JSON file path (GEM tenders)
    const [docRows] = await db.query(
      `SELECT json_path FROM gem_tender_docs WHERE bid_number = ? LIMIT 1`,
      [decodedBidNumber]
    );

    if (docRows.length > 0 && docRows[0].json_path) {
      const jsonPath = docRows[0].json_path;
      if (fs.existsSync(jsonPath)) {
        try {
          const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
          return res.json({ success: true, json_data: jsonData });
        } catch { /* malformed — fall through */ }
      }
    }

    // 2. Check gem_tenders for detail_url (GEM tenders without a JSON file)
    const [gemRows] = await db.query(
      `SELECT detail_url FROM gem_tenders WHERE bid_number = ? LIMIT 1`,
      [decodedBidNumber]
    );

    if (gemRows.length > 0) {
      return res.json({ success: true, json_data: null, detail_url: gemRows[0].detail_url });
    }

    // 3. Check open_tender_details — tender_details column holds the scraped JSON
    const openBidNumber = decodedBidNumber.replace(/\//g, '_');
    const [openRows] = await db.query(
      `SELECT tender_details, file_link FROM open_tender_details WHERE tender_id = ? LIMIT 1`,
      [openBidNumber]
    );

    if (openRows.length > 0) {
      let tender_details = openRows[0].tender_details;
      if (typeof tender_details === 'string') {
        try { tender_details = JSON.parse(tender_details); } catch { tender_details = null; }
      }
      let file_link = openRows[0].file_link;
      if (typeof file_link === 'string') {
        try { file_link = JSON.parse(file_link); } catch { file_link = null; }
      }
      // Wrap into the same shape Workspaces.jsx expects
      const json_data = tender_details
        ? { ...tender_details, links: file_link || tender_details.links || [] }
        : null;
      return res.json({ success: true, json_data });
    }

    res.status(404).json({ success: false, message: 'Tender not found' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch document path' });
  }
};

/* ─── Tender Summary (AI) ────────────────────────────────────────── */

// Open-tender documents are downloaded by scrapers that run outside this
// backend and store a path relative to their own working directory — try
// every known scraper root until one resolves. Overridable via .env for
// other environments.
const OPEN_DOC_ROOTS = (process.env.OPEN_TENDER_DOC_ROOTS || [
  'C:/Users/Administrator/Desktop/participated_tenders/scrapper',
  'C:/Users/Administrator/Desktop/scrappers/endo',
  'C:/Users/Administrator/Desktop/scrappers',
].join(',')).split(',').map(s => s.trim()).filter(Boolean);

const ensureTenderSummaryTable = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS tender_summaries (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      tender_id   VARCHAR(255) NOT NULL UNIQUE,
      summary     MEDIUMTEXT NOT NULL,
      created_by  INT,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
};

/**
 * Extracts text from a tender's own document PDF — GEM or Open, whichever matches.
 * Callers pass whatever slash/underscore form happened to be in their URL, but
 * the two source tables disagree on convention: gem_tender_docs/gem_tenders
 * store bid_number WITH slashes ("GEM/2024/B/123"), while open_tender_details
 * stores tender_id WITH underscores ("2024_DHS_123_1") — same convention
 * getTenderDocumentPath above uses. Normalize to both forms up front.
 */
const getTenderPdfText = async (rawTenderId, maxChars = 60000) => {
  const slashForm = decodeURIComponent(rawTenderId).replace(/_/g, '/');
  const underForm = slashForm.replace(/\//g, '_');

  // 1. GEM tender — resolved via gem_tender_docs.pdf_path (same lookup as
  //    deviationRepresentation.controller.js's getBidPdfText).
  const [gemDocRows] = await db.query(
    `SELECT pdf_path FROM gem_tender_docs WHERE bid_number = ? LIMIT 1`,
    [slashForm]
  );
  const gemPdfPath = gemDocRows[0]?.pdf_path;
  if (gemPdfPath && fs.existsSync(gemPdfPath)) {
    const buf = fs.readFileSync(gemPdfPath);
    const data = await pdfParse(buf);
    return data.text.slice(0, maxChars);
  }

  // 1b. GEM tender with no downloaded PDF yet — fall back to the scraped
  //     gem_tenders row (items, quantity, dept, dates, EMD, etc.) so the
  //     summary feature still works instead of hard-failing.
  const [gemRows] = await db.query(
    `SELECT items, quantity, department, start_date, end_date, emd_amount, bid_value,
            keyword, dept, state, district, emd_detail, consignee_detail, sample_req, hard_copy_req
     FROM gem_tenders WHERE bid_number = ? LIMIT 1`,
    [slashForm]
  );
  if (gemRows.length > 0) {
    const lines = Object.entries(gemRows[0])
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
    if (lines.length) {
      return `No tender document file is available for this tender yet. The following is the scraped tender metadata instead:\n\n${lines.join('\n')}`.slice(0, maxChars);
    }
  }

  // 2. Open tender — pull EVERY downloaded document (open_tender_details.
  //    downloaded_documents), not just one. No filtering by document type —
  //    whatever got downloaded (NIT, corrigendum, BOQ, etc.) all goes in.
  //    `local_path` is NOT consistently relative — some scrapers store an
  //    absolute path, others a path relative to their own working directory
  //    — and a zip-type entry has no local_path at all, only an
  //    `extracted_files` array of absolute paths. Handle all three.
  const [openRows] = await db.query(
    `SELECT downloaded_documents, tender_details FROM open_tender_details WHERE tender_id = ? LIMIT 1`,
    [underForm]
  );
  let downloaded = openRows[0]?.downloaded_documents;
  if (typeof downloaded === 'string') {
    try { downloaded = JSON.parse(downloaded); } catch { downloaded = null; }
  }
  if (Array.isArray(downloaded)) {
    // Resolve a possibly-relative, possibly-absolute path to a real file on disk.
    const resolveCandidate = (candidate) => {
      if (!candidate) return null;
      const normalized = String(candidate).replace(/\\/g, '/');
      if (path.isAbsolute(candidate) && fs.existsSync(candidate)) return candidate;
      if (path.isAbsolute(normalized) && fs.existsSync(normalized)) return normalized;
      for (const root of OPEN_DOC_ROOTS) {
        const fullPath = path.join(root, normalized);
        if (fs.existsSync(fullPath)) return fullPath;
      }
      return null;
    };

    const extractDocText = async (filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.pdf') {
        const data = await pdfParse(fs.readFileSync(filePath));
        return data.text;
      }
      if (ext === '.xls' || ext === '.xlsx') {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        const lines = [];
        workbook.eachSheet((sheet) => {
          sheet.eachRow((row) => {
            const cells = row.values.filter(Boolean).map(v => String(v)).join('\t');
            if (cells.trim()) lines.push(cells);
          });
        });
        return lines.join('\n');
      }
      // Anything else (docx, txt, etc.) — best-effort plain read.
      return fs.readFileSync(filePath, 'utf-8');
    };

    let combined = '';
    for (const doc of downloaded) {
      const candidates = [
        doc?.local_path,
        ...(Array.isArray(doc?.extracted_files) ? doc.extracted_files : []),
      ].filter(Boolean);

      for (const candidate of candidates) {
        const resolved = resolveCandidate(candidate);
        if (!resolved) continue;
        try {
          const text = await extractDocText(resolved);
          if (text?.trim()) {
            combined += `\n\n=== ${path.basename(resolved)} ===\n${text}`;
          }
        } catch { /* unreadable — skip this file, still try the rest */ }
      }
      if (combined.length > maxChars) break;
    }
    if (combined.trim()) return combined.slice(0, maxChars);
  }

  // 3. No document file could be read (none downloaded yet, or unreadable) —
  //    fall back to the scraped tender_details (title, dates, org, EMD, etc.)
  //    so the user still gets a summary instead of a hard failure.
  let tenderDetails = openRows[0]?.tender_details;
  if (typeof tenderDetails === 'string') {
    try { tenderDetails = JSON.parse(tenderDetails); } catch { tenderDetails = null; }
  }
  if (tenderDetails && typeof tenderDetails === 'object' && Object.keys(tenderDetails).length) {
    const lines = Object.entries(tenderDetails)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
    return `No tender document file is available for this tender yet. The following is the scraped tender metadata instead:\n\n${lines.join('\n')}`.slice(0, maxChars);
  }

  return '';
};

/**
 * POST /api/tenders/:tenderId/summary
 * AI-generated tender summary — works for GEM and Open tenders, any division.
 * Cached in tender_summaries; pass { regenerate: true } to force a re-run.
 */
const getTenderSummary = async (req, res) => {
  // Different pages pass different slash/underscore forms for the same
  // tender (Tender Details uses underscores, the Workspace URL uses
  // slashes) — normalize to one canonical cache key so both share a cache
  // entry instead of each regenerating their own.
  const tenderId = decodeURIComponent(req.params.tenderId).replace(/\//g, '_');
  const { regenerate, checkOnly } = req.body || {};

  try {
    await ensureTenderSummaryTable();

    if (!regenerate) {
      const [cached] = await db.query(
        `SELECT summary, updated_at FROM tender_summaries WHERE tender_id = ?`,
        [tenderId]
      );
      if (cached.length > 0) {
        return res.json({ success: true, summary: cached[0].summary, cached: true, updated_at: cached[0].updated_at });
      }
    }

    // checkOnly: the caller just wants to know whether a summary already
    // exists (e.g. to decide whether to show a "Generate Summary" button)
    // without triggering an Ollama call if it doesn't.
    if (checkOnly) {
      return res.json({ success: false, cached: false, notGenerated: true });
    }

    const docText = await getTenderPdfText(tenderId);
    if (!docText.trim()) {
      return res.status(422).json({
        success: false,
        message: 'The tender document has not been downloaded yet for this tender, so a summary cannot be generated.',
      });
    }

    const systemPrompt = `Act as a Senior Tender Manager and Government Tender Scrutiny Expert with extensive experience in Indian Government and PSU tenders, working for Meril Life Sciences, a medical device company.`;

    const userPrompt = `I am uploading a tender document along with any related documents such as Tender Notice/NIT, Tender Schedule/BOQ, Technical Specifications, Corrigendum/Addendum, Annexures, General Terms & Conditions, or Bidder Documents.

Tender document text:
${docText}

Your task is to READ ALL UPLOADED DOCUMENTS CAREFULLY and provide a COMPLETE TENDER SCRUTINY FROM THE PARTICIPATION PERSPECTIVE.

IMPORTANT INSTRUCTIONS:

1. Review ALL pages and ALL uploaded tender-related documents before giving the final conclusion.
2. Do not skip annexures, schedules, checklists, footnotes, notes, corrigenda, or addenda.
3. If multiple documents are uploaded, cross-check them against each other.
4. If there is a corrigendum/addendum, clearly identify which original clause has been amended and consider the latest amendment as applicable.
5. Do not assume any information that is not mentioned in the tender.
6. Do not use general knowledge or external information unless specifically asked.
7. If any information is missing, unclear, contradictory, or not available in the uploaded documents, clearly mention:
   "NOT CLEAR FROM TENDER DOCUMENT – VERIFICATION REQUIRED."
8. Distinguish clearly between:
   - Mandatory requirement
   - Conditional requirement
   - Applicable only for specific bidder/product/category
   - Recommended but not mandatory
9. Do not simply repeat tender clauses. Convert the tender conditions into a practical scrutiny from a bidder's participation perspective.
10. Identify the exact rejection, disqualification, EMD forfeiture, penalty, risk purchase, blacklisting, and debarment risks.
11. Wherever possible, mention the relevant clause number, annexure number, page number, or document name.
12. If the tender schedule contains multiple items, identify whether the bidder can quote item-wise or whether all items must be quoted together.
13. Do not prepare a generic summary. Give a decision-oriented scrutiny that helps the bidder decide whether to participate.

========================================================
START THE ANSWER WITH:
========================================================

# TENDER SCRUTINY FOR PARTICIPATION

## 1. TENDER AT A GLANCE

Provide:

- Tendering Authority
- Tender Number
- Tender Title / Scope
- Tender Type
- Contract Type (Rate Contract / Purchase / Framework / Supply / etc.)
- Contract Validity
- Number of Items / Product Categories
- Estimated Tender Value / Bid Value, if available
- Tender Fee
- EMD / Bid Security
- Performance Security / Security Deposit
- Bid Validity
- Procurement Portal
- Physical Submission Requirement
- Sample Submission Requirement
- Important Geographical / Delivery Scope
- Any special condition affecting participation

Also provide a short:
### "Participation Complexity"
Rate the tender as LOW / MEDIUM / HIGH complexity and explain why.

========================================================

## 2. IMPORTANT DATES & DEADLINES

Prepare a table:

| Activity | Date & Time | Mandatory / Optional | Action Required |
|---|---|---|---|

Include:

- Tender publication date
- Pre-bid meeting
- Last date for pre-bid queries
- Technical bid submission deadline
- Commercial/price bid submission deadline
- Physical document submission deadline
- Tender fee submission deadline
- EMD submission deadline
- Sample submission deadline
- Technical bid opening
- Price bid opening, if available
- Any other critical deadline

Clearly highlight:

### CRITICAL DEADLINE ALERTS
Mention all deadlines where missing the deadline may result in rejection.

========================================================

## 3. BIDDER ELIGIBILITY CRITERIA

Explain clearly:

### Who is eligible to participate?
Check whether participation is allowed for:

- Manufacturer
- OEM
- Importer
- Direct Importer
- Authorized Distributor
- Dealer
- Agent
- Trader
- Consortium / JV
- Startup
- MSME
- Any other bidder category

Clearly mention:

### NOT ELIGIBLE TO PARTICIPATE
List all bidder categories expressly prohibited by the tender.

Also scrutinize:

- Minimum experience
- Manufacturing experience
- Marketing experience
- Past supply experience
- Similar work experience
- Minimum turnover
- Financial capacity
- Net worth, if applicable
- Production capacity
- Minimum quantity supplied
- Geographical restrictions
- Local content requirements
- Make in India requirements — **IMPORTANT: If the tender document mentions "Make in India", "MII", "Class 1/Class 2 local supplier", "local content", "minimum local content", or requires a Make in India certificate / MII certificate / local content certificate, explicitly state under a dedicated "MII Certificate Required" heading under Certificates: what MII class is required, the minimum local content percentage, whether a self-declaration or third-party certificate is needed, and whether foreign manufacturers are barred from participation.**
- State-specific registration requirements
- GST / PAN requirements
- Licences / statutory registrations
- Quality certifications

========================================================

## 4. PRODUCT / TECHNICAL ELIGIBILITY SCRUTINY

For every quoted item/product, check whether the tender requires:

- Exact technical specification
- Exact composition
- Size / dimension
- Material
- Standard
- Packing
- Shelf life
- Model
- Brand
- Product approval / permission
- Manufacturing licence
- Import licence
- CE certificate
- ISO certificate
- BIS / ISI certificate
- CDSCO registration
- WHO-GMP
- COPP
- Test reports
- NABL certificates
- **Make in India (MII) Certificate — Check specifically if the tender asks for a Make In India certificate, local content certificate, or MII declaration. If yes, clearly state: "MII CERTIFICATE REQUIRED" along with the class (Class 1 / Class 2), minimum local content %, and whether self-declaration is accepted.**
- Any other product-specific certificate

Clearly identify:

### ZERO-DEVIATION REQUIREMENTS
List all requirements where even a minor deviation may result in technical rejection.

### PRODUCT-WISE PARTICIPATION CHECK
If multiple items are present, prepare a table:

| Item Code / Sr. No. | Item Name | Key Mandatory Specification | Packing / Unit | Eligibility Condition | EMD | Sample Required | Participation Risk |
|---|---|---|---|---|---|---|---|

If all items cannot be fully listed due to excessive length, provide:
1. A concise product-wise table, and
2. A separate list of high-risk items.

========================================================

## 5. DOCUMENTS REQUIRED FOR PARTICIPATION

Prepare a complete practical checklist in the following format:

### A. COMPANY / BIDDER DOCUMENTS

| Document | Mandatory / Conditional | Applicable To | Required Format | Validity Requirement | Submission Mode |
|---|---|---|---|---|---|

### B. TECHNICAL / PRODUCT DOCUMENTS

Include:

- Product permission
- Licence
- Technical datasheet
- Catalogue
- Certificate
- Test report
- Product compliance statement
- **Make in India (MII) Certificate / Local Content Certificate / MII Self-Declaration — include if required by the tender**
- Any product-specific documents

### C. EXPERIENCE / PERFORMANCE DOCUMENTS

Include:

- Experience certificate
- Past purchase order
- Supply order
- Completion certificate
- Performance certificate
- Market standing certificate
- Manufacturing/marketing data
- Any other required proof

### D. FINANCIAL DOCUMENTS

Include:

- Turnover certificate
- CA certificate
- Audited balance sheet
- Profit & loss account
- Net worth certificate
- Production capacity certificate
- Any other financial proof

### E. STATUTORY DOCUMENTS

Include:

- PAN
- GST
- Manufacturing licence
- Import licence
- Udyam/MSME
- Startup certificate
- Other registrations

### F. DECLARATIONS / UNDERTAKINGS / ANNEXURES

List every mandatory annexure separately.

========================================================

## 6. DOCUMENT ATTESTATION / NOTARIZATION / AUTHENTICATION CHECK

Specifically identify:

### Documents requiring:
- Self-attestation
- Company stamp
- Authorized signatory signature
- Notarization
- Original signature
- Affidavit
- CA certification
- Cost Accountant certification
- Government authority certification
- FDCA/CDSCO certification
- First Class Magistrate / Notary certification
- Apostille/legalization, if applicable

Prepare a table:

| Document | Required Authentication | Who Must Sign/Certify | Mandatory? | Risk if Not Complied |
|---|---|---|---|---|

Do not assume notarization. If the tender does not specifically require notarization, clearly state:
"Not specifically required in tender document."

========================================================

## 7. SUBMISSION MODE SCRUTINY

Clearly explain what must be submitted:

### ONLINE ONLY
### PHYSICAL ONLY
### BOTH ONLINE AND PHYSICAL

Also identify:

- Separate envelopes/covers
- Document fee cover
- EMD cover
- Technical document cover
- Sample cover
- Document ordering requirement
- File naming requirement
- Digital signature requirement
- Original document requirement

Prepare a clear table:

| Document / Requirement | Online | Physical | Both | Submission Deadline |
|---|---|---|---|---|

========================================================

## 8. TENDER FEE & EMD SCRUTINY

Clearly provide:

### Tender Fee
- Amount
- GST applicability
- Payment mode
- Refundable / non-refundable
- Exemption available?
- Who can claim exemption?
- Documents required for exemption

### EMD
- Item-wise / total amount
- Payment modes
- BG allowed?
- BG validity
- Exemption available?
- Who can claim exemption?
- Documents required

### EMD FORFEITURE RISKS
List every situation where EMD may be forfeited.

========================================================

## 9. SAMPLE SUBMISSION SCRUTINY

If samples are required, clearly mention:

- Which items require samples
- Quantity
- Sample specification
- Sample packing
- Labelling requirement
- Deadline
- Submission address
- Sample evaluation criteria
- Whether sample is returnable
- Risk of rejection

If sample quantity/details are not clearly mentioned, write:
"NOT CLEAR FROM TENDER DOCUMENT – VERIFICATION REQUIRED."

========================================================

## 10. COMMERCIAL / PRICE BID SCRUTINY

Explain clearly:

### How to quote the rate

Check:

- Unit of quotation
- Packing unit
- Per piece / per pack / per box / per kit / per unit
- GST inclusive/exclusive
- Whether GST must be shown separately
- Freight inclusion
- Insurance inclusion
- F.O.R. destination
- Loading/unloading
- Installation/commissioning, if applicable
- Price escalation restriction
- Ceiling price, if any
- MRP restriction, if any
- Price preference
- L1 evaluation methodology
- Item-wise / group-wise / total package evaluation
- Reverse auction, if applicable

### CRITICAL RATE QUOTATION WARNING
Clearly mention any error that can result in:

- Technical rejection
- Commercial rejection
- EMD forfeiture
- Blacklisting/debarment

========================================================

## 11. TECHNICAL REJECTION CRITERIA

List ALL conditions that can result in technical bid rejection.

Separate them into:

### Immediate Rejection Risks
### Document Deficiency Risks
### Product Specification Deviation Risks
### Eligibility Failure Risks
### Submission Failure Risks
### Certificate Validity Risks
**Also check: If Make in India / MII certificate is required — is the certificate valid, issued by the right authority, and does the product meet the stated local content percentage? Flag as a Certificate Validity Risk if unclear.**

========================================================

## 12. BLACKLISTING / DEBARMENT / LEGAL ELIGIBILITY SCRUTINY

Check:

- Existing debarment
- Blacklisting
- Non-conviction requirement
- Pending cases
- Product quality issues
- Spurious/adulterated product restrictions
- False declaration consequences
- Disclosure requirements
- Land border restriction
- Conflict of interest, if applicable

Clearly highlight:

### HIGH-RISK DECLARATIONS
List every declaration where incorrect information may lead to debarment/blacklisting.

========================================================

## 13. POST-AWARD OBLIGATIONS & COMMERCIAL RISKS

Provide:

- Agreement execution timeline
- Security deposit
- Performance bank guarantee
- Contract period
- Delivery period
- Delivery locations
- Penalty for delay
- Maximum penalty
- Liquidated damages
- Risk purchase
- Replacement obligation
- Quality testing
- Batch testing
- Payment terms
- Payment holding conditions
- Warranty, if applicable
- Contract termination
- Debarment risks

Clearly identify:

### MAJOR POST-AWARD BUSINESS RISKS

========================================================

## 14. COMPLETE REJECTION / PENALTY MATRIX

Prepare this table:

| Default / Error | Consequence | Severity | Tender Reference |
|---|---|---|---|

Cover:

- Tender rejection
- Technical disqualification
- EMD forfeiture
- Security deposit forfeiture
- Penalty
- Risk purchase
- Blacklisting
- Debarment
- Contract termination

========================================================

## 15. PRE-BID REPRESENTATION / CLARIFICATION POINTS

Identify any clause that is:

- Ambiguous
- Contradictory
- Commercially unreasonable
- Technically restrictive
- Impossible to comply with
- Unclear regarding documents
- Unclear regarding samples
- Unclear regarding EMD
- Inconsistent between NIT, tender document, schedule and annexures

For each point, provide:

| Clause / Issue | Tender Position | Concern | Recommended Clarification / Representation |
|---|---|---|---|

Do not create unnecessary representation points.

========================================================

## 16. FINAL PARTICIPATION VERDICT

Give a clear decision:

### PARTICIPATE / PARTICIPATE AFTER DOCUMENT CONFIRMATION / HIGH RISK / DO NOT PARTICIPATE

Then provide:

### MANDATORY BEFORE PARTICIPATION
List the exact documents/conditions that must be confirmed.

### HIGH-RISK AREAS
List the top risks.

### GO / NO-GO CHECKLIST

Use:

- [ ] Eligible bidder category confirmed
- [ ] Product specification exactly matched
- [ ] Product permission available
- [ ] All mandatory licences valid
- [ ] Experience criteria met
- [ ] Turnover/financial criteria met
- [ ] EMD/tender fee arranged or exemption confirmed
- [ ] All mandatory documents available
- [ ] All annexures completed
- [ ] **Make in India (MII) Certificate requirement checked — if required, MII certificate / local content declaration available**
- [ ] Sample requirement confirmed
- [ ] No debarment/blacklisting issue
- [ ] Rate quotation methodology confirmed
- [ ] Submission mode confirmed
- [ ] All deadlines confirmed

========================================================

## FINAL MANAGEMENT SUMMARY

End with this short, practical summary:

### CAN WE PARTICIPATE?
[Clear YES / NO / CONDITIONAL]

### WHAT IS THE BIGGEST PARTICIPATION RISK?
[Maximum 3 points]

### WHAT MUST BE ARRANGED BEFORE BID SUBMISSION?
[Prioritized list]

### WHAT CAN CAUSE DIRECT REJECTION?
[Prioritized list]

### MANAGEMENT RECOMMENDATION
Provide a short 5-10 point action plan.

IMPORTANT:
The final output must be practical, decision-oriented and written in simple professional language. Do not give a generic clause-by-clause summary.

If any required information is not available or unclear, clearly write:
"NOT CLEAR FROM TENDER DOCUMENT – VERIFICATION REQUIRED."

Do not omit any important participation condition simply because it appears in an annexure, schedule, checklist, note, corrigendum or footnote.

SEE THESE SECTIONS ARE NOT COMPULSORY BUT YOU HAVE TO CLEARLY SEE ALL THE DOCUMENTS FOR THE CONTENT FOR THAT PARTICULAR SECTION IF NOT FIND THEN IGNORE THAT SECTION`;

    const summary = await callOllama(systemPrompt, userPrompt, 0.1, 16000);

    await db.query(`
      INSERT INTO tender_summaries (tender_id, summary, created_by)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE summary = VALUES(summary), created_by = VALUES(created_by), updated_at = NOW()
    `, [tenderId, summary, req.user?.id || null]);

    return res.json({ success: true, summary, cached: false });

  } catch (err) {
    console.error('getTenderSummary error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to generate tender summary' });
  }
};

const getTenderJson = async (req, res) => {
  const { bidNumber } = req.params;
  try {
    const decodedBidNumber = decodeURIComponent(bidNumber).replace(/_/g, '/');

    // Pick from gem_tender_docs table ONLY
    const [rows] = await db.query(
      `SELECT json_path FROM gem_tender_docs WHERE bid_number = ? LIMIT 1`,
      [decodedBidNumber]
    );

    if (rows.length === 0 || !rows[0].json_path) {
      return res.status(404).json({ success: false, message: 'JSON not found in gem_tender_docs' });
    }

    const { fs } = require('fs'); // fallback if fs is not globally imported, wait, let's use the top level fs
    const fsInstance = require('fs');
    const jsonPath = rows[0].json_path;

    if (fsInstance.existsSync(jsonPath)) {
      const fileContent = fsInstance.readFileSync(jsonPath, 'utf-8');
      try {
        const jsonData = JSON.parse(fileContent);
        return res.json(jsonData);
      } catch (e) {
        console.error('Error parsing gem_tender_docs JSON file:', e);
        return res.status(500).json({ success: false, message: 'Invalid JSON data in file' });
      }
    } else {
      console.warn(`[getTenderJson] File not found at path: ${jsonPath}`);
      return res.status(404).json({ success: false, message: 'JSON file does not exist on disk' });
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch tender JSON' });
  }
};

const getSubCategories = async (req, res) => {
  try {
    const { dept = '', type = 'Perfect' } = req.query;

    const params = [type];
    let where = `WHERE category = ?`;
    if (dept) {
      where += ` AND LOWER(dept) = ?`;
      params.push(dept.toLowerCase());
    }

    const [rows] = await db.query(
      `SELECT keywords FROM product_categories ${where} ORDER BY keywords ASC`,
      params
    );

    const subCats = new Set(rows.map(r => r.keywords).filter(Boolean));

    // Supplement with categories already present on gem_tenders that haven't
    // been curated into product_categories yet (e.g. dept='Endo' perfect_cat=1).
    // NOTE: use sub_cat, not keyword — keyword is a free-text search term column
    // and is unreliable/cross-contaminated across departments for many rows
    // (e.g. an Endo row can have keyword="Biochemistry Reagent Kit..." while its
    // real category, in sub_cat, is "Surgical Sutures"). sub_cat is the actual
    // curated category label and matches keyword 1:1 for clean rows.
    const deptMap = { endo: 'Endo', diagnostic: 'Diagno', '360': '360' };
    const gemDept = deptMap[dept.toLowerCase()];
    if (gemDept) {
      const perfectCatValue = type === 'Open' ? 0 : 1;
      const [gemRows] = await db.query(
        `SELECT DISTINCT sub_cat FROM gem_tenders WHERE perfect_cat = ? AND dept = ? AND sub_cat IS NOT NULL AND sub_cat != ''`,
        [perfectCatValue, gemDept]
      );
      gemRows.forEach(r => { if (r.sub_cat) subCats.add(r.sub_cat); });
    }

    res.json({ success: true, data: [...subCats].sort((a, b) => a.localeCompare(b)) });
  } catch (err) {
    console.error('getSubCategories error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch sub-categories' });
  }
};
// Distinct list of states/UTs for the tenders-list state filter dropdown.
// Combines whatever real `state` text values are already stored on each
// table with every state the PIN-code map can resolve to, so a state is
// selectable even if every row for it currently only has a pincode (see
// buildStateFilter / resolveStateFromPincode above).
const getStates = async (req, res) => {
  try {
    const { tenderType = '' } = req.query;

    const states = new Set(PINCODE_STATE_RANGES.map(r => r.state));

    if (tenderType !== 'Open') {
      const [gemRows] = await db.query(
        `SELECT DISTINCT state FROM gem_tenders WHERE state IS NOT NULL AND state != ''`
      );
      gemRows.forEach(r => { if (r.state) states.add(r.state.trim()); });
    }

    if (tenderType !== 'GEM') {
      const [openRows] = await db.query(
        `SELECT DISTINCT state FROM open_tender_details WHERE state IS NOT NULL AND state != ''`
      );
      openRows.forEach(r => { if (r.state) states.add(r.state.trim()); });
    }

    res.json({ success: true, data: [...states].sort((a, b) => a.localeCompare(b)) });
  } catch (err) {
    console.error('getStates error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch states' });
  }
};

const getDepartments = async (req, res) => {
  try {
    const { tenderType = '' } = req.query;
    const departments = new Set();

    if (tenderType !== 'Open') {
      const [gemRows] = await db.query(
        `SELECT DISTINCT department FROM gem_tenders WHERE department IS NOT NULL AND department != ''`
      );
      gemRows.forEach(r => { if (r.department) departments.add(r.department.trim()); });
    }

    // Open Tenders' "department" is really the organisation_name column on
    // open_tender_details — gem_tenders.department never has rows like
    // "Ministry of Railways", so without this the filter dropdown is empty
    // for the Open tab (same asymmetry getStates already handles below).
    if (tenderType !== 'GEM') {
      const [openRows] = await db.query(
        `SELECT DISTINCT organisation_name FROM open_tender_details WHERE organisation_name IS NOT NULL AND organisation_name != ''`
      );
      openRows.forEach(r => { if (r.organisation_name) departments.add(r.organisation_name.trim()); });
    }

    res.json({ success: true, data: [...departments].sort((a, b) => a.localeCompare(b)) });
  } catch (err) {
    console.error('getDepartments error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch departments' });
  }
};

const exportTenders = async (req, res) => {
  try {
    const {
      startDateFrom, startDateTo,
      search = '',
      departmentName = '',
      perfectCat = '',
      subCat = '',
      dept = '',
      closingFrom = '',
      closingTo = '',
      preBidFrom = '',
      preBidTo = '',
      tenderType = 'GEM'
    } = req.query;

    if (!startDateFrom || !startDateTo) {
      return res.status(400).json({ success: false, message: 'Start Date constraints (startDateFrom, startDateTo) are required.' });
    }

    /* ── OPEN TENDER EXPORT ── */
    if (tenderType === 'Open') {
      let where = `WHERE relevency_checker IN ('proceed_futher', 'files_downloaded', 'yes')`;
      const params = [];

      const toDatetimeStart = `STR_TO_DATE(e_published_date, '%d-%M-%Y %h:%i %p')`;

      // Mandatory date range on e_published_date
      where += ` AND DATE(${toDatetimeStart}) >= ?`;
      where += ` AND DATE(${toDatetimeStart}) <= ?`;
      params.push(startDateFrom, startDateTo);

      if (dept && dept !== 'Both') {
        where += ` AND LOWER(dept) LIKE ?`;
        params.push(`%${dept.toLowerCase()}%`);
      }

      if (search) {
        const s = search.trim();
        const sLike = escapeLike(s);
        if (!/\s/.test(s) && /^[A-Z0-9\/\-_]+$/i.test(s)) {
          const slashForm = s.replace(/_/g, '/');
          const underForm = s.replace(/\//g, '_');
          where += ` AND (tender_id = ? OR tender_id = ? OR tender_id LIKE ? OR tender_id LIKE ?)`;
          params.push(slashForm, underForm, `%${escapeLike(slashForm)}%`, `%${escapeLike(underForm)}%`);
        } else {
          where += ` AND (tender_title LIKE ? OR tender_id LIKE ? OR organisation_name LIKE ?)`;
          params.push(`%${sLike}%`, `%${sLike}%`, `%${sLike}%`);
        }
      }

      if (departmentName) {
        where += ` AND organisation_name LIKE ?`;
        params.push(`%${departmentName}%`);
      }

      const toDatetimeEnd = `STR_TO_DATE(closing_date, '%d-%M-%Y %h:%i %p')`;
      const toDateOnly    = `STR_TO_DATE(SUBSTRING_INDEX(closing_date, ' ', 1), '%d-%M-%Y')`;
      if (closingFrom) {
        where += ` AND ${toDateOnly} >= STR_TO_DATE(?, '%Y-%m-%d')`;
        params.push(closingFrom);
      }
      if (closingTo) {
        where += ` AND ${toDateOnly} <= STR_TO_DATE(?, '%Y-%m-%d')`;
        params.push(closingTo);
      }

      const [rows] = await db.query(
        `SELECT tender_id, tender_title, organisation_name, e_published_date, closing_date, state, dept
         FROM open_tender_details
         ${where}
         ORDER BY ${toDatetimeStart} DESC`,
        params
      );

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Tenders');

      worksheet.columns = [
        { header: 'S No',             key: 'sno',          width: 8  },
        { header: 'Gem / Open',       key: 'source',       width: 12 },
        { header: 'Tender Number',    key: 'tender_id',    width: 25 },
        { header: 'Tender Title',     key: 'tender_title', width: 40 },
        { header: 'Organisation',     key: 'organisation', width: 30 },
        { header: 'Start Date',       key: 'start_date',   width: 20 },
        { header: 'Closing Date',     key: 'end_date',     width: 20 },
        { header: 'State',            key: 'state',        width: 15 },
        { header: 'Dept',             key: 'dept',         width: 10 },
      ];

      worksheet.getRow(1).font = { bold: true };

      rows.forEach((row, index) => {
        worksheet.addRow({
          sno:          index + 1,
          source:       'Open',
          tender_id:    row.tender_id,
          tender_title: row.tender_title,
          organisation: row.organisation_name,
          start_date:   row.e_published_date || '',
          end_date:     row.closing_date     || '',
          state:        row.state            || '',
          dept:         row.dept             || '',
        });
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=open_tenders_export.xlsx');
      await workbook.xlsx.write(res);
      return res.end();
    }

    let where = `WHERE ((dept = 'Endo' OR dept = 'Diagno' OR dept = '360') OR bid_number IN (SELECT bid_no FROM tender_processing_results WHERE dept IN ('Endo','Diagno','360')))`;
    const params = [];

    // 1. Mandatory Date Range constraints from the Export Popup
    const strToDateStart = "STR_TO_DATE(REPLACE(start_date, '/', '-'), '%d-%m-%Y %h:%i %p')";
    where += ` AND DATE(${strToDateStart}) >= ?`;
    where += ` AND DATE(${strToDateStart}) <= ?`;
    params.push(startDateFrom, startDateTo);

    // 2. Add other filters matching getTenders
    if (search) {
      const s = search.trim();
      const sLike = escapeLike(s);
      if (!/\s/.test(s) && /^[A-Z0-9\/\-_]+$/i.test(s)) {
        const slashForm = s.replace(/_/g, '/');
        const underForm = s.replace(/\//g, '_');
        where += ` AND (bid_number = ? OR bid_number = ? OR bid_number LIKE ? OR bid_number LIKE ?)`;
        params.push(slashForm, underForm, `%${escapeLike(slashForm)}%`, `%${escapeLike(underForm)}%`);
      } else {
        where += ` AND (items LIKE ? OR bid_number LIKE ? OR keyword LIKE ?)`;
        params.push(`%${sLike}%`, `%${sLike}%`, `%${sLike}%`);
      }
    }

    if (departmentName) {
      where += ` AND department LIKE ?`;
      params.push(`%${departmentName}%`);
    }

    if (perfectCat === 'open') {
      where += ` AND perfect_cat = 0`;
      where += ` AND bid_number IN (SELECT bid_no FROM tender_processing_results WHERE result = 'yes')`;
    } else {
      // Default to PERFECT category
      where += ` AND perfect_cat = 1`;
    }

    if (subCat) {
      const subCatList = subCat.split(',').map(s => s.trim()).filter(Boolean);
      if (subCatList.length === 1) {
        where += ` AND (sub_cat = ? OR keyword = ?)`;
        params.push(subCatList[0], subCatList[0]);
      } else if (subCatList.length > 1) {
        const placeholders = subCatList.map(() => '?').join(',');
        where += ` AND (sub_cat IN (${placeholders}) OR keyword IN (${placeholders}))`;
        params.push(...subCatList, ...subCatList);
      }
    }

    if (dept) {
      if (dept === 'Both') {
        where += ` AND ((dept = 'Endo' OR dept = 'Diagno') OR bid_number IN (SELECT bid_no FROM tender_processing_results WHERE dept IN ('Endo','Diagno')))`;
      } else {
        where += ` AND (dept = ? OR bid_number IN (SELECT bid_no FROM tender_processing_results WHERE dept = ?))`;
        params.push(dept, dept);
      }
    }

    if (closingFrom) {
      where += ` AND end_date >= ?`;
      params.push(closingFrom);
    }
    if (closingTo) {
      where += ` AND end_date <= ?`;
      params.push(closingTo);
    }
    if (preBidFrom) {
      where += ` AND start_date >= ?`;
      params.push(preBidFrom);
    }
    if (preBidTo) {
      where += ` AND start_date <= ?`;
      params.push(preBidTo);
    }

    if (perfectCat !== 'perfect' && perfectCat !== 'open') {
      const strToDateEnd = "STR_TO_DATE(REPLACE(end_date, '/', '-'), '%d-%m-%Y %h:%i %p')";
      where += ` AND ${strToDateEnd} >= NOW()`;
    }

    const [rows] = await db.query(
      `SELECT bid_number, detail_url, items, emd_amount, bid_value, start_date, end_date, department, perfect_cat
       FROM gem_tenders 
       ${where}
       ORDER BY ${strToDateStart} DESC`,
      params
    );

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Tenders');

    worksheet.columns = [
      { header: 'S No', key: 'sno', width: 8 },
      { header: 'Gem / Open', key: 'source', width: 12 },
      { header: 'Tender Number', key: 'bid_number', width: 25 },
      { header: 'Bid Document URL', key: 'detail_url', width: 40 },
      { header: 'Item Category', key: 'items', width: 35 },
      { header: 'EMD Amount', key: 'emd_amount', width: 15 },
      { header: 'Bid Value', key: 'bid_value', width: 15 },
      { header: 'Start Date', key: 'start_date', width: 20 },
      { header: 'End Date', key: 'end_date', width: 20 },
      { header: 'Department', key: 'department', width: 30 },
      { header: 'Perfect/Open category', key: 'perfect_cat', width: 20 }
    ];

    // Set up hyperlink styling on the URL column
    worksheet.getColumn('detail_url').font = {
      color: { argb: 'FF0563C1' },
      underline: true
    };

    worksheet.getRow(1).font = { bold: true };

    rows.forEach((row, index) => {
      let perfectCatStr = '';
      if (row.perfect_cat === 1) perfectCatStr = 'Perfect';
      else if (row.perfect_cat === 0) perfectCatStr = 'Open';

      worksheet.addRow({
        sno: index + 1,
        source: 'GeM',
        bid_number: row.bid_number,
        detail_url: row.detail_url ? { text: row.detail_url, hyperlink: row.detail_url, tooltip: 'Click here to view document' } : '',
        items: row.items,
        emd_amount: row.emd_amount || 'NA',
        bid_value: row.bid_value || 'NA',
        start_date: row.start_date || '',
        end_date: row.end_date || '',
        department: row.department,
        perfect_cat: perfectCatStr
      });
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=' + 'tenders_export.xlsx'
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('exportTenders error:', err);
    res.status(500).json({ success: false, message: 'Failed to export tenders' });
  }
};

const downloadFile = (req, res) => {
  const filePath = req.query.path;
  if (!filePath) {
    return res.status(400).send('File path is required');
  }

  // ?inline=1 -> "View" in a browser tab instead of forcing a save-as.
  // res.download() always sends Content-Disposition: attachment, so the
  // inline case is handled separately with res.sendFile.
  if (req.query.inline === '1') {
    if (!fs.existsSync(filePath)) return res.status(404).send('File not found');
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath).replace(/[^a-zA-Z0-9_\-. ]/g, '_')}"`);
    return res.sendFile(filePath, (err) => {
      if (err && !res.headersSent) res.status(404).send('File not found');
    });
  }

  res.download(filePath, (err) => {
    if (err) {
      console.error('Error downloading file:', err);
      if (!res.headersSent) {
        res.status(404).send('File not found');
      }
    }
  });
};

/* ─── Tender document upload — permanently attaches a file to the tender's
   own document list (not a per-workspace sandbox), so it appears both on
   the Tender Details page and in every workspace's Tender Documents tab,
   for as long as the tender exists. ───────────────────────────────────── */
const TENDER_DOC_DIR = path.join(__dirname, '../../uploads/tender-documents');
const tenderDocStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const safe = decodeURIComponent(req.params.bidNumber || 'unknown').replace(/_/g, '/').replace(/[^a-zA-Z0-9_\-]/g, '_');
    const dir = path.join(TENDER_DOC_DIR, safe);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    const safeName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_\-]/g, '_');
    cb(null, `${Date.now()}-${safeName}${ext}`);
  },
});
const uploadTenderDocumentMiddleware = multer({
  storage: tenderDocStorage,
  limits: { fileSize: 100 * 1024 * 1024 },
}).single('file');

const uploadTenderDocument = async (req, res) => {
  const decodedBidNumber = decodeURIComponent(req.params.bidNumber).replace(/_/g, '/');
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  const label = (req.body.label || '').trim() || 'Document';
  const displayName = (req.body.name || '').trim() || req.file.originalname;

  // Not derived from req.protocol/host: IIS forwards to this backend over
  // plain http on 127.0.0.1, so those would produce an internal, unreachable
  // URL instead of the public one the frontend actually needs.
  const apiBase = process.env.API_BASE_URL || 'https://api.openprocure.ai/api';
  const newLink = {
    uri: `${apiBase}/tenders/download?path=${encodeURIComponent(req.file.path)}`,
    text: displayName,
    label,
  };

  try {
    const [gemRows] = await db.query(`SELECT id, json_data FROM gem_tenders WHERE bid_number = ? LIMIT 1`, [decodedBidNumber]);
    if (gemRows.length) {
      let json = {};
      if (gemRows[0].json_data) {
        try { json = typeof gemRows[0].json_data === 'string' ? JSON.parse(gemRows[0].json_data) : gemRows[0].json_data; }
        catch { json = {}; }
      }
      if (!Array.isArray(json.links)) json.links = [];
      json.links.push(newLink);
      await db.query(`UPDATE gem_tenders SET json_data = ? WHERE id = ?`, [JSON.stringify(json), gemRows[0].id]);
      return res.status(201).json({ success: true, link: newLink });
    }

    const openBidNumber = decodedBidNumber.replace(/\//g, '_');
    const [openRows] = await db.query(`SELECT tender_id, downloaded_documents FROM open_tender_details WHERE tender_id = ? LIMIT 1`, [openBidNumber]);
    if (openRows.length) {
      let docs = [];
      if (openRows[0].downloaded_documents) {
        try {
          const parsed = typeof openRows[0].downloaded_documents === 'string'
            ? JSON.parse(openRows[0].downloaded_documents)
            : openRows[0].downloaded_documents;
          if (Array.isArray(parsed)) docs = parsed;
        } catch { docs = []; }
      }
      docs.push({ type: label, file_name: displayName, local_path: req.file.path });
      await db.query(`UPDATE open_tender_details SET downloaded_documents = ? WHERE tender_id = ?`, [JSON.stringify(docs), openBidNumber]);
      return res.status(201).json({ success: true, link: newLink });
    }

    return res.status(404).json({ success: false, message: 'Tender not found' });
  } catch (err) {
    console.error('[tenders] uploadTenderDocument:', err);
    return res.status(500).json({ success: false, message: 'Failed to attach document to tender' });
  }
};

const recalculateDeviation = async (req, res) => {
  try {
    const { bid_no, item_key, product_code } = req.body;
    const response = await fetch('https://suggestions.openprocure.ai/recreate-deviation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bid_number: bid_no, item_key, product_code }),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('recalculateDeviation proxy error:', err);
    res.status(502).json({ status: 'error', message: 'Failed to reach recalculation service.' });
  }
};

// Proxy for the "Regenerate Deviation" button — same external service/endpoint
// as recalculateDeviation above, but forwards the FULL payload (product_specs
// included). Browsers calling suggestions.openprocure.ai directly get blocked
// by CORS (it sends no Access-Control-Allow-Origin header); a server-to-server
// call isn't subject to CORS, so we proxy it here.
const regenerateDeviation = async (req, res) => {
  try {
    const response = await fetch('https://suggestions.openprocure.ai/recreate-deviation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('regenerateDeviation proxy error:', err);
    res.status(502).json({ status: 'error', message: 'Failed to reach deviation regeneration service.' });
  }
};

// ── BROWSER HEADERS for GEM scraping ─────────────────────────────────────────
const GEM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

// ── Document proxy: fetches external tender-document URLs server-side ────────
// Browsers block these with CORS (GeM/BHEL servers don't send CORS headers,
// and some redirect during preflight which browsers reject outright). Since
// the server-to-server request isn't subject to CORS, we fetch here and
// stream the result back to the frontend as a same-origin response.
const PROXY_ALLOWED_HOSTS = [
  'gem.gov.in',
  'bhel.in',
];

const proxyDocument = async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ message: 'url is required' });

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ message: 'Invalid url' });
  }

  if (!/^https?:$/.test(parsed.protocol) ||
      !PROXY_ALLOWED_HOSTS.some(host => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))) {
    return res.status(403).json({ message: 'Host not allowed' });
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      headers: GEM_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(30000),
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ message: `Upstream returned ${upstream.status}` });
    }

    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
    const disposition = upstream.headers.get('content-disposition');
    if (disposition) res.setHeader('Content-Disposition', disposition);

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    console.error('proxyDocument error:', err);
    res.status(502).json({ message: 'Failed to fetch document from upstream.' });
  }
};

async function scrapeCataloguePage(url) {
  const res = await fetch(url, {
    headers: GEM_HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;

  const $ = cheerio.load(await res.text());
  const title = $('.phead').first().text().trim() || 'Technical Specifications';
  const rows = [];
  let currentCategory = '';

  $('table tbody tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length >= 3) {
      currentCategory = $(cells[0]).text().trim() || currentCategory;
      rows.push({
        category: currentCategory,
        specification: $(cells[1]).text().trim(),
        allowed_values: $(cells[2]).text().trim(),
      });
    } else if (cells.length === 2) {
      rows.push({
        category: currentCategory,
        specification: $(cells[0]).text().trim(),
        allowed_values: $(cells[1]).text().trim(),
      });
    }
  });

  return rows.length > 0 ? { title, rows } : null;
}

const getCatalogueSpecs = async (req, res) => {
  const { bidNumber } = req.params;
  try {
    const decodedBid = decodeURIComponent(bidNumber).replace(/_/g, '/');

    // 1. Try gem_tender_docs file first (most up-to-date json)
    let jsonData = null;
    const [docRows] = await db.query(
      `SELECT json_path FROM gem_tender_docs WHERE bid_number = ? LIMIT 1`,
      [decodedBid]
    );
    if (docRows.length > 0 && docRows[0].json_path && fs.existsSync(docRows[0].json_path)) {
      try { jsonData = JSON.parse(fs.readFileSync(docRows[0].json_path, 'utf-8')); } catch { /* ignore */ }
    }

    // 2. Fall back to gem_tenders.json_data column
    let detailUrl = null;
    if (!jsonData) {
      const [gemRows] = await db.query(
        `SELECT json_data, detail_url FROM gem_tenders WHERE bid_number = ? LIMIT 1`,
        [decodedBid]
      );
      if (gemRows.length > 0) {
        detailUrl = gemRows[0].detail_url;
        if (gemRows[0].json_data) {
          try {
            jsonData = typeof gemRows[0].json_data === 'string'
              ? JSON.parse(gemRows[0].json_data)
              : gemRows[0].json_data;
          } catch { /* ignore */ }
        }
      }
    }

    // 3. Extract showCatalogue links from json_data
    let catalogueUrls = (jsonData?.links || [])
      .map(l => l?.uri)
      .filter(u => u && u.includes('/showCatalogue/'));

    // 4. If no links in json_data, parse the detail_url page directly
    if (catalogueUrls.length === 0 && detailUrl) {
      try {
        const pageRes = await fetch(detailUrl, {
          headers: GEM_HEADERS,
          redirect: 'follow',
          signal: AbortSignal.timeout(15000),
        });
        if (pageRes.ok) {
          const $ = cheerio.load(await pageRes.text());
          $('a[href]').each((_, el) => {
            const href = $(el).attr('href') || '';
            const full = href.startsWith('http') ? href : `https://bidplus.gem.gov.in${href}`;
            if (full.includes('/showCatalogue/')) catalogueUrls.push(full);
          });
          catalogueUrls = [...new Set(catalogueUrls)];
        }
      } catch (e) {
        console.warn('[getCatalogueSpecs] Could not fetch detail_url:', e.message);
      }
    }

    if (catalogueUrls.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // 5. Scrape each catalogue page in parallel
    const results = await Promise.all(
      catalogueUrls.map(url => scrapeCataloguePage(url).catch(e => {
        console.warn('[getCatalogueSpecs] scrape failed for', url, e.message);
        return null;
      }))
    );

    res.json({ success: true, data: results.filter(Boolean) });
  } catch (err) {
    console.error('[getCatalogueSpecs]', err);
    res.status(500).json({ success: false, message: 'Failed to fetch catalogue specs' });
  }
};

const markNotRelevant = async (req, res) => {
  try {
    const bidNumber = req.params.bidNumber || req.params[0];
    const userId = req.user.id;
    const reason = (req.body?.reason || '').trim() || null;

    const [[user]] = await db.query('SELECT name FROM users WHERE id = ?', [userId]);
    const markedBy = user ? user.name : `User#${userId}`;

    // Try GEM table first
    const [gemResult] = await db.query(
      'UPDATE gem_tenders SET marked_not_relevant = 1, not_relevant_by = ?, not_relevant_at = NOW(), not_relevant_reason = ? WHERE bid_number = ?',
      [markedBy, reason, bidNumber]
    );
    if (gemResult.affectedRows > 0) {
      return res.json({ success: true, table: 'gem', markedBy });
    }

    // Try Open table (bid number may use / or _)
    const slashForm = bidNumber.replace(/_/g, '/');
    const underForm = bidNumber.replace(/\//g, '_');
    const [openResult] = await db.query(
      "UPDATE open_tender_details SET relevency_checker = 'no', not_relevant_by = ?, not_relevant_at = NOW(), not_relevant_reason = ? WHERE tender_id = ? OR tender_id = ?",
      [markedBy, reason, slashForm, underForm]
    );
    if (openResult.affectedRows > 0) {
      return res.json({ success: true, table: 'open', markedBy });
    }

    return res.status(404).json({ error: 'Tender not found' });
  } catch (err) {
    console.error('[markNotRelevant]', err);
    res.status(500).json({ error: 'Failed to mark tender as not relevant' });
  }
};

// ── Suggested Products: extract an item list from any uploaded document ───────
// (PDF/DOC/DOCX/TXT) — Excel/CSV keep being parsed client-side (structured
// data, no AI needed); this covers the unstructured formats. Reuses
// documentTender.controller.js's extractFileText (text + scanned-PDF OCR
// fallback) rather than re-implementing PDF/DOCX parsing here.
const EXTRACT_ITEMS_DIR = path.join(__dirname, '../../uploads/suggestion-extract-staging');
const extractItemsStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(EXTRACT_ITEMS_DIR, { recursive: true });
    cb(null, EXTRACT_ITEMS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  },
});
const extractItemsUploadMiddleware = multer({
  storage: extractItemsStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
}).single('file');

const ITEM_LIST_EXTRACTION_PROMPT = `You are reading a tender/bid document (BOQ, item schedule, requirement list, or similar) to extract the list of items/products being procured. Read the document text and find every distinct item row. Respond with ONLY a single JSON array, no markdown fences, no commentary, one object per item, matching exactly this shape:

[
  { "sl_no": "serial/item number as printed, empty string if none", "item_name": "the item/product name or description exactly as printed", "hsn_code": "HSN code if shown, empty string otherwise", "specification": "technical specification/requirement text for this item, empty string if none" }
]

Only include real distinct items being procured — skip headers, totals, terms & conditions, and boilerplate. If you cannot find a clear item list, respond with an empty array [].`;

/**
 * POST /:bidNumber/suggestions/extract-items
 * Multipart: file (pdf/doc/docx/txt)
 * Extracts the document's text (with OCR fallback for a scanned PDF), then
 * has the model pull out a structured item list in the same shape the
 * spreadsheet-upload path already produces client-side — so the frontend can
 * feed the result straight into the existing from-spreadsheet/save flow
 * unchanged, regardless of whether the source was a spreadsheet or a
 * PDF/Word document.
 */
const extractItemsFromDocument = async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  const filePath = req.file.path;

  try {
    const { extractFileText } = require('./documentTender.controller');
    const text = (await extractFileText(filePath)).slice(0, 200000).trim();
    if (!text) {
      return res.status(422).json({ success: false, message: 'Could not read any text from this file — it may be empty, corrupted, or an unsupported format.' });
    }

    const raw = await callOllama(ITEM_LIST_EXTRACTION_PROMPT, text, 0.05, 8000);
    let items = [];
    try {
      items = parseJsonResponse(raw);
      if (!Array.isArray(items)) items = [];
    } catch (e) {
      console.error('[extractItemsFromDocument] failed to parse model output:', e.message);
      return res.status(502).json({ success: false, message: 'The document was read, but item extraction failed — try again or use a spreadsheet instead.' });
    }

    items = items
      .map(it => ({
        sl_no: String(it.sl_no || '').trim(),
        item_name: String(it.item_name || '').trim(),
        hsn_code: String(it.hsn_code || '').trim(),
        specification: String(it.specification || '').trim(),
      }))
      .filter(it => it.item_name);

    if (!items.length) {
      return res.status(422).json({ success: false, message: 'No items could be identified in this document.' });
    }

    return res.json({ success: true, items });
  } catch (err) {
    console.error('extractItemsFromDocument:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to process the document' });
  } finally {
    fs.unlink(filePath, () => {}); // best effort — staging file, not a permanent tender document
  }
};

// ── Suggest products from a spreadsheet upload (no PDF required) ──────────────
// Accepts { items: [{ item_name, sl_no, hsn_code, specification }] }
// Does local keyword matching against backend/src/asset/products.json
// Pulled out so both the batch-scoring endpoint (compute only, no DB write —
// lets the frontend process an uploaded spreadsheet in visible chunks instead
// of one opaque all-at-once call) and the save endpoint (persist the final
// merged result) can share the exact same matching logic.
function scoreItemsAgainstCatalog(items, startIndex = 0) {
  const productsPath = path.join(__dirname, '../asset/products.json');
  const catalog = JSON.parse(fs.readFileSync(productsPath, 'utf-8'));

  const score = (itemName, product) => {
    if (!itemName) return 0;
    const words = itemName.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
    if (!words.length) return 0;
    const haystack = [
      product.instrument_name, product.type, product.category,
      product.segment, product.application,
    ].filter(Boolean).join(' ').toLowerCase();
    const hits = words.filter(w => haystack.includes(w)).length;
    return hits / words.length;
  };

  const filteredItems = items.filter(it => (it.item_name || '').trim());

  return filteredItems.map((it, i) => {
    let best = catalog[0], bestScore = 0;
    for (const p of catalog) {
      const s = score(it.item_name, p);
      if (s > bestScore) { bestScore = s; best = p; }
    }
    return {
      // Globally unique across batches — a per-batch restart at item_1 would
      // collide once the frontend merges multiple chunks' results together.
      item: `item_${startIndex + i + 1}`,
      product_code: best.product_code || '',
      product_name: best.instrument_name || best.type || '',
      item_category: best.category || best.segment || '',
      selected_file: `./products/${(best.segment || 'general').replace(/\s+/g, '_')}.json`,
      relevancy_score: Math.round(bestScore * 100) / 100,
      tender_item_name: it.item_name,
      hsn_code: it.hsn_code || '',
      specification: it.specification || '',
    };
  });
}

/**
 * POST /:bidNumber/suggestions/from-spreadsheet
 * Body: { items, startIndex? }
 * Pure compute, no DB write — the frontend calls this once per batch of an
 * uploaded spreadsheet (so it can show real "processed N of M" progress
 * instead of one opaque all-at-once request), then calls .../suggestions/save
 * once with everything merged.
 */
const suggestFromSpreadsheet = async (req, res) => {
  try {
    const { items = [], startIndex = 0 } = req.body;
    const suggestions = scoreItemsAgainstCatalog(items, startIndex);
    return res.json({ ok: true, count: suggestions.length, suggestions });
  } catch (err) {
    console.error('suggestFromSpreadsheet:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};

/**
 * POST /:bidNumber/suggestions/save
 * Body: { suggestions }
 * Persists the final, fully-merged suggestions array (all batches combined)
 * — the actual DB write suggestFromSpreadsheet used to do per-call, which
 * only worked because it was always sent the complete item list in one shot.
 */
const saveSpreadsheetSuggestions = async (req, res) => {
  try {
    const bidNumber = decodeURIComponent(req.params.bidNumber).replace(/_/g, '/');
    const { suggestions = [] } = req.body;

    const overallScore = suggestions.length
      ? suggestions.reduce((s, p) => s + (p.relevancy_score || 0), 0) / suggestions.length
      : 0;

    await db.query(
      `INSERT INTO tender_processing_results
         (bid_no, result, dept, main_relevency_score, suggested_products, deviation_tables, status)
       VALUES (?, 'yes', 'Endo', ?, ?, '{}', 'completed')
       ON DUPLICATE KEY UPDATE
         result = 'yes',
         suggested_products = VALUES(suggested_products),
         main_relevency_score = VALUES(main_relevency_score),
         updated_at = CURRENT_TIMESTAMP`,
      [bidNumber, parseFloat(overallScore.toFixed(2)), JSON.stringify(suggestions)]
    );

    return res.json({ ok: true, count: suggestions.length });
  } catch (err) {
    console.error('saveSpreadsheetSuggestions:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};

/**
 * GET /api/tenders/team-suggestions
 * Suggested recipients for the Share Tender Details / Share Deviation /
 * Share Suggestions modal's "Add Recipient by Email" — every other active
 * Tender Admin or Tender Executive sharing at least one division with the
 * caller (Endo/Diagno/360), regardless of which one is asking: a Tender
 * Executive sees their division's Tender Admin(s) and fellow Executives,
 * and a Tender Admin sees their division's Executives (and any co-Admins)
 * the same way. Based on the caller's own division assignment, not the
 * specific tender being shared.
 */
const getTeamSuggestions = async (req, res) => {
  try {
    const scope = await getUserScope(req.user.id);
    if (!scope.divisions?.length) {
      return res.json({ success: true, data: [] });
    }

    const placeholders = scope.divisions.map(() => '?').join(',');
    const [rows] = await db.query(
      `SELECT DISTINCT u.id, u.name, u.email, u.role
       FROM users u
       JOIN user_departments d ON d.user_id = u.id AND d.type = 'department'
       WHERE u.role IN ('Tender Admin', 'Tender Executive')
         AND u.status = 'Active'
         AND u.id <> ?
         AND d.department IN (${placeholders})
       ORDER BY FIELD(u.role, 'Tender Admin', 'Tender Executive'), u.name`,
      [req.user.id, ...scope.divisions]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[tenders] getTeamSuggestions:', err);
    res.status(500).json({ success: false, message: 'Failed to load team suggestions' });
  }
};

module.exports = {
  getTenders,
  getTenderDetails,
  toggleInterested,
  getTeamSuggestions,
  getSuggestedProducts,
  searchProducts,
  getProductByCode,
  getPriceListByCode,
  updateSuggestedProducts,
  saveSelectedProduct,
  getDeviationTables,
  updateDeviationTables,
  exportDeviationsExcel,
  importDeviationsExcel,
  getTenderMeta,
  getTenderDocumentPath,
  getTenderSummary,
  getTenderJson,
  getSubCategories,
  getDepartments,
  getStates,
  exportTenders,
  downloadFile,
  uploadTenderDocumentMiddleware,
  uploadTenderDocument,
  recalculateDeviation,
  regenerateDeviation,
  getCatalogueSpecs,
  markNotRelevant,
  suggestFromSpreadsheet,
  saveSpreadsheetSuggestions,
  extractItemsFromDocument,
  extractItemsUploadMiddleware,
  proxyDocument,
};