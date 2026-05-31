const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const ExcelJS = require('exceljs');

const parseCSVLine = (str) => {
  const arr = [];
  let quote = false;
  let col = '';
  for (let c of str) {
    if (c === '"') {
      quote = !quote;
      continue;
    }
    if (c === ',' && !quote) {
      arr.push(col);
      col = '';
      continue;
    }
    col += c;
  }
  arr.push(col);
  return arr;
};

const normalizeProduct = (row, headers, filename) => {
  const getVal = (keys) => {
    for (const k of keys) {
      const idx = headers.findIndex(h => h.toLowerCase().includes(k.toLowerCase()));
      if (idx !== -1) return row[idx]?.trim();
    }
    return '';
  };

  const productCode = getVal(['product code']);
  if (!productCode) return null;

  const title = getVal(['name of instrument', 'material description', 'product name', 'item name']);
  const type = getVal(['main type', 'type']);
  const category = getVal(['segment', 'category', 'sub type']);
  const packSize = getVal(['pack size', 'slab/qty']);
  const mrp = getVal(['mrp', 'price']);

  const specification = `MRP: ${mrp} | Pack: ${packSize} | Source: ${filename}`;

  return {
    product_code: productCode,
    title: title,
    type: type || filename.replace('.csv', ''),
    category: category,
    specification: specification,
    relevancy: 0
  };
};

const loadAllProducts = () => {
  const productsDir = path.join('d:', 'Tender System', 'ERP', 'S3', 'ProductData');
  const files = fs.readdirSync(productsDir).filter(f => f.endsWith('.csv'));

  let allProducts = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(productsDir, file), 'utf-8');
      const lines = content.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) continue;

      const headers = parseCSVLine(lines[0]);

      for (let i = 1; i < lines.length; i++) {
        const row = parseCSVLine(lines[i]);
        if (row.length < headers.length) continue;

        const norm = normalizeProduct(row, headers, file);
        if (norm) allProducts.push(norm);
      }
    } catch (err) {
      console.error(`Error reading ${file}:`, err);
    }
  }
  return allProducts;
};

const getTenders = async (req, res) => {
  try {
    const {
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
      tenderType = 'GEM'
    } = req.query;

    /* ─────────────────────────────────────────────
       OPEN TENDERS — query open_tender_details
    ───────────────────────────────────────────── */
    if (tenderType === 'Open') {
      const offset = (page - 1) * limit;

      let where = `WHERE relevency_checker IN ('files_downloaded', 'yes')`;
      const params = [];

      if (search) {
        where += ` AND (tender_title LIKE ? OR tender_id LIKE ? OR organisation_name LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      if (departmentName) {
        where += ` AND organisation_name LIKE ?`;
        params.push(`%${departmentName}%`);
      }

      if (closingFrom) {
        where += ` AND closing_date >= ?`;
        params.push(closingFrom);
      }
      if (closingTo) {
        where += ` AND closing_date <= ?`;
        params.push(closingTo);
      }

      const dataQuery = `
        SELECT
          tender_id        AS T_ID,
          tender_title     AS title,
          organisation_name AS department,
          e_published_date AS start_date,
          closing_date     AS end_date,
          opening_date,
          state,
          relevency_checker
        FROM open_tender_details
        ${where}
        ORDER BY closing_date ASC
        LIMIT ? OFFSET ?
      `;

      const countQuery = `
        SELECT COUNT(*) AS total
        FROM open_tender_details
        ${where}
      `;

      const [[rows], [[count]]] = await Promise.all([
        db.query(dataQuery, [...params, +limit, +offset]),
        db.query(countQuery, params)
      ]);

      return res.json({
        page: +page,
        limit: +limit,
        total: count.total,
        totalPages: Math.ceil(count.total / limit),
        data: rows.map(r => ({
          T_ID: r.T_ID,
          title: r.title,
          department: r.department,
          start_date: r.start_date,
          end_date: r.end_date,
          opening_date: r.opening_date,
          state: r.state,
          qty: 0,
          interested: false,
          value: 0,
          emd: 0,
          estimatedBidValue: 0,
          detail_url: null,
          ra_no: null,
          Representation_json: null,
          Corrigendum_json: null,
          json_details: null
        }))
      });
    }
    const offset = (page - 1) * limit;

    let where = `WHERE (dept = 'Endo' OR dept = 'Diagno') AND (ra_no IS NULL OR TRIM(ra_no) = '')`;
    const params = [];

    if (search) {
      where += ` AND (items LIKE ? OR bid_number LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
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
        where += ` AND sub_cat = ?`;
        params.push(subCatList[0]);
      } else if (subCatList.length > 1) {
        where += ` AND sub_cat IN (${subCatList.map(() => '?').join(',')})`;
        params.push(...subCatList);
      }
    }

    if (dept) {
      if (dept === 'Both') {
        where += ` AND (dept = 'Endo' OR dept = 'Diagno')`;
      } else {
        where += ` AND dept = ?`;
        params.push(dept);
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

    let orderByClause = 'end_date ASC';

    const strToDateEnd = "STR_TO_DATE(REPLACE(end_date, '/', '-'), '%d-%m-%Y %h:%i %p')";
    const strToDateStart = "STR_TO_DATE(REPLACE(start_date, '/', '-'), '%d-%m-%Y %h:%i %p')";

    const activeCondition = (archived === 'true') ? ` AND ${strToDateEnd} >= CURDATE()` : ` AND ${strToDateEnd} >= NOW()`;

    switch (sort) {
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
          if (archived === 'true') {
            where += ` AND end_date < CURDATE()`;
          } else {
            where += ` AND end_date >= CURDATE()`;
          }
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
        match_relevency AS value,
        detail_url,
        ra_no,
        Representation_json,
        Corrigendum_json,
        keyword,
        emd_amount AS emd,
        bid_value AS estimatedBidValue
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

    if (rows.length > 0) {
      const bidNumbers = rows.map(r => r.T_ID);
      if (bidNumbers.length > 0) {
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
      }
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

        return {
          ...r,
          interested: !!r.interested,
          json_details: parsedDetails,
          emd: r.emd ? Number(r.emd) : 0,
          estimatedBidValue: r.estimatedBidValue ? Number(r.estimatedBidValue) : 0
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
  bidNumber = bidNumber.replace(/_/g, '/');

  try {
    await db.query(
      `UPDATE gem_tenders
       SET is_interested = IF(is_interested = 1, 0, 1)
       WHERE bid_number = ? `,
      [bidNumber]
    );

    res.json({ message: 'Interest updated' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update interest' });
  }
};

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
        .map(item => {
          let derivedCategory = '';
          if (item.selected_file) {
            // e.g., "./products/endo/Suture.json" -> "Suture"
            const parts = item.selected_file.split('/');
            const filename = parts.pop();
            if (filename) {
              derivedCategory = filename.replace('.json', '');
            }
          }

          return {
            item_key: item.item || '',
            type: derivedCategory || item.item_category || '',
            category: derivedCategory || '',
            dept: rows[0].dept || '',
            title: item.product_name || '',
            product_code: item.product_code || '',
            relevancy_score: item.relevancy_score ?? 0,
            tender_item_name: item.tender_item_name || '',
            selected_file: item.selected_file || '',
            selected: item.selected ?? false,
            item_category: item.item_category || ''
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

const searchProducts = async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json({ success: true, data: [] });

  try {
    const allProducts = loadAllProducts();

    const term = q.toLowerCase();
    const results = allProducts.filter(p =>
      p.product_code.toLowerCase().includes(term) ||
      p.title.toLowerCase().includes(term) ||
      p.type.toLowerCase().includes(term)
    ).slice(0, 50);

    res.json({ success: true, data: results });
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

    // Map the products array from frontend format to backend DB format
    const dbFormattedProducts = products.map(p => {
      let finalItemKey = p.item_key || '';
      if (!finalItemKey || !finalItemKey.startsWith('item_')) {
        maxItemNum += 1;
        finalItemKey = `item_${maxItemNum}`;
      }
      return {
        item: finalItemKey,
        product_code: p.product_code || '',
        product_name: p.title || '',
        item_category: p.item_category || p.category || '',
        selected_file: p.selected_file || '',
        relevancy_score: p.relevancy_score !== undefined ? Number(p.relevancy_score) : 0,
        tender_item_name: p.tender_item_name || ''
      };
    });

    await db.query(
      `UPDATE tender_processing_results SET suggested_products = ? WHERE bid_no = ? `,
      [JSON.stringify(dbFormattedProducts), decodedBidNumber]
    );

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

const getDeviationTables = async (req, res) => {
  const { bidNumber } = req.params;

  try {
    const [rows] = await db.query(
      `SELECT deviation_tables, representation_letter, suggested_products FROM tender_processing_results WHERE bid_no = ? `,
      [bidNumber]
    );

    if (rows.length === 0) {
      return res.json({ success: true, data: {}, productCodes: {}, has_representation: false });
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
            }
          });
        }
      } catch (e) {
        console.error("Error parsing suggested_products for product codes:", e);
      }
    }

    const hasRepresentation = !!rows[0].representation_letter;

    res.json({
      success: true,
      data: deviations || {},
      productCodes,
      has_representation: hasRepresentation
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch deviation tables' });
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
           tender_title,
           organisation_name,
           e_published_date,
           closing_date,
           opening_date,
           state,
           tender_details,
           file_link
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

      return res.json({
        success: true,
        open_source: true,          // <-- flag for frontend to detect Open tender
        data: {
          bid_number: r.tender_id,
          items: r.tender_title,
          department: r.organisation_name,
          start_date: r.e_published_date,
          end_date: r.closing_date,
          opening_date: r.opening_date,
          state: r.state,
          tender_details: parsedDetails,
          file_link: parsedFiles,
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
    tenderData.json_data = null; // Enforce picking JSON only from gem_tender_docs

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
      `SELECT is_interested, ra_no, Corrigendum_json, Representation_json FROM gem_tenders WHERE bid_number = ? `,
      [decodedBidNumber]
    );

    if (rows.length === 0) {
      // OPEN TENDER FALLBACK
      const openBidNumber = decodedBidNumber.replace(/\//g, '_');
      const [openRows] = await db.query(
        `SELECT id FROM open_tender_details WHERE tender_id = ? LIMIT 1`,
        [openBidNumber]
      );
      if (openRows.length > 0) {
        return res.json({
          success: true,
          data: {
            is_interested: false,
            ra_no: null,
            Corrigendum_json: null,
            Representation_json: null
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
        Representation_json: rows[0].Representation_json
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

    const [rows] = await db.query(
      `SELECT json_data, detail_url FROM gem_tenders WHERE bid_number = ? `,
      [decodedBidNumber]
    );

    if (rows.length > 0) {
      return res.json({
        success: true,
      });
    }

    res.status(404).json({ success: false, message: 'Tender not found' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch document path' });
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
    const { dept = '' } = req.query;

    let where = `WHERE perfect_cat = 1 AND sub_cat IS NOT NULL AND sub_cat != ''`;
    const params = [];

    if (dept) {
      where += ` AND LOWER(dept) = ?`;
      params.push(dept.toLowerCase());
    }

    const [rows] = await db.query(
      `SELECT DISTINCT sub_cat FROM gem_tenders ${where} ORDER BY sub_cat ASC`,
      params
    );

    const subCats = rows.map(r => r.sub_cat).filter(Boolean);
    res.json({ success: true, data: subCats });
  } catch (err) {
    console.error('getSubCategories error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch sub-categories' });
  }
};
const getDepartments = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT DISTINCT department FROM gem_tenders WHERE department IS NOT NULL AND department != '' ORDER BY department ASC`
    );

    const departments = rows.map(r => r.department);
    res.json({ success: true, data: departments });
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
      preBidTo = ''
    } = req.query;

    if (!startDateFrom || !startDateTo) {
      return res.status(400).json({ success: false, message: 'Start Date constraints (startDateFrom, startDateTo) are required.' });
    }

    let where = `WHERE (dept = 'Endo' OR dept = 'Diagno')`;
    const params = [];

    // 1. Mandatory Date Range constraints from the Export Popup
    const strToDateStart = "STR_TO_DATE(REPLACE(start_date, '/', '-'), '%d-%m-%Y %h:%i %p')";
    where += ` AND DATE(${strToDateStart}) >= ?`;
    where += ` AND DATE(${strToDateStart}) <= ?`;
    params.push(startDateFrom, startDateTo);

    // 2. Add other filters matching getTenders
    if (search) {
      where += ` AND (items LIKE ? OR bid_number LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
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
        where += ` AND sub_cat = ?`;
        params.push(subCatList[0]);
      } else if (subCatList.length > 1) {
        where += ` AND sub_cat IN (${subCatList.map(() => '?').join(',')})`;
        params.push(...subCatList);
      }
    }

    if (dept) {
      if (dept === 'Both') {
        where += ` AND (dept = 'Endo' OR dept = 'Diagno')`;
      } else {
        where += ` AND dept = ?`;
        params.push(dept);
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

  res.download(filePath, (err) => {
    if (err) {
      console.error('Error downloading file:', err);
      if (!res.headersSent) {
        res.status(404).send('File not found');
      }
    }
  });
};

module.exports = {
  getTenders,
  getTenderDetails,
  toggleInterested,
  getSuggestedProducts,
  searchProducts,
  updateSuggestedProducts,
  saveSelectedProduct,
  getDeviationTables,
  updateDeviationTables,
  getTenderMeta,
  getTenderDocumentPath,
  getTenderJson,
  getSubCategories,
  getDepartments,
  exportTenders,
  downloadFile
};