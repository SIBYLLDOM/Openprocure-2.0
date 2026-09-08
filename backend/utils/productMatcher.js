'use strict';

// Ported from the tender-automation site's NewSystem/step4-ollama.js —
// specifically just the PRODUCT MATCHING half (category routing, the
// suture/rapid-ELISA candidate pre-filters, and the single-item Ollama
// match call). The document-ingestion half of that file (PDF/OCR/BOQ
// extraction, multi-item splitting) isn't ported: our gem_tenders rows
// already carry dept/sub_cat/items plus a parsed technical-spec table (see
// parseGemJsonData in tenderController.js), so there's no bid PDF to
// re-parse here — each tender is treated as a single line item.

const fs = require('fs');
const path = require('path');
const { ollamaChat, parseJsonResponse } = require('./ollamaClient');

const PRODUCTS_DIR = path.join(__dirname, '..', 'products');
const MAX_PROD_CHARS = 100000;

// ---- Category routing (ported from resolveAnalyzerFile/resolveEndoFile) ----

function resolveAnalyzerFile(type) {
  const t = (type || '').toLowerCase();
  const dir = path.join(PRODUCTS_DIR, 'analyzer');
  const pick = (f) => path.join(dir, f);

  if (t.includes('3-part') || t.match(/\b3\s*part/)) return pick('3-Part_Hematology_Analyzer.json');
  if (t.includes('5-part') || t.match(/\b5\s*part/)) return pick('5-Part_Hematology_Analyzer.json');
  if (t.includes('e-clia') || t.includes('eclia') || t.includes('electrochemiluminescence')) {
    return pick('Automated_Electrochemiluminescence_Immunoassay_(e-CLIA)_Analyzer.json');
  }
  if (t.includes('elisa plate washer')) return pick('ELISA_Plate_Washer.json');
  if (t.includes('electrolyte')) return pick('Electrolyte_Analyzer.json');
  if (t.includes('fluorescence immunoassay')) return pick('Fluorescence_Immunoassay_Analyzer.json');
  if (t.includes('fully automated biochemistry') || (t.includes('fully') && t.includes('biochem'))) {
    return pick('Fully_Automated_Biochemistry_Analyzer.json');
  }
  if (t.includes('hplc') || t.includes('hba1c')) return pick('HPLC_HbA1c_Analyzer.json');
  if (t.includes('semi') && t.includes('biochem')) return pick('Semi_Automated_Biochemistry_Analyzer.json');
  if (t.includes('semi') && t.includes('elisa')) return pick('Semi_Automated_ELISA_Plate_Reader.json');
  if (t.includes('specific protein')) return pick('Semi_Automated_Specific_Protein_Analyzer.json');
  return null;
}

function resolveEndoFile(type) {
  const t = (type || '').toLowerCase();
  const dir = path.join(PRODUCTS_DIR, 'endo');
  const pick = (f) => path.join(dir, f);

  if (t.includes('biosurg')) return pick('Biosurgicals.json');
  if (t.includes('clutch')) return pick('Clutch.json');
  if (t.includes('energy')) return pick('Energy_Device.json');
  if (t.includes('glue')) return pick('Glue.json');
  if (t.includes('iud')) return pick('IUDs.json');
  if (t.includes('kit')) return pick('Kit.json');
  if (t.includes('mesh')) return pick('Mesh.json');
  if (t.includes('stapler') || t.includes('ligat') || t.includes('clip') || t.includes('trocar') || t.includes('port')) return pick('Stapler.json');
  return pick('Others.json');
}

const SUTURE_MATERIAL_MAP = {
  'chromic catgut': 'Chromic_Catgut.json',
  'plain catgut': 'Plain_Catgut.json',
  catgut: 'Plain_Catgut.json',
  'poliglecaprone 25': 'Poliglecaprone_25_Monocryl.json',
  monocryl: 'Poliglecaprone_25_Monocryl.json',
  poliglecaprone: 'Poliglecaprone.json',
  polyamide: 'Polyamide_Nylon.json',
  nylon: 'Polyamide_Nylon.json',
  'polydioxanone pds': 'Polydioxanone_PDS.json',
  'pds ii': 'Polydioxanone_PDS.json',
  ' pds': 'Polydioxanone_PDS.json',
  polydioxanone: 'Polydioxanone.json',
  polyester: 'Polyester.json',
  'polyglactin 910': 'Polyglactin_910.json',
  polyglactin: 'Polyglactin_910.json',
  vicryl: 'Polyglactin_910.json',
  polyglycolic: 'Polyglycolic_Acid.json',
  ' pga': 'Polyglycolic_Acid.json',
  polypropylene: 'Polypropylene.json',
  polypropelene: 'Polypropylene.json',
  prolene: 'Polypropylene.json',
  silk: 'Silk.json',
  'steel wire': 'Steel_Wire.json',
  'stainless steel': 'Steel_Wire.json',
};

function findSutureFile(haystackText) {
  const sutureDir = path.join(PRODUCTS_DIR, 'endo', 'sutures_by_material');
  const haystack = haystackText.toLowerCase();
  for (const [keyword, filename] of Object.entries(SUTURE_MATERIAL_MAP)) {
    if (haystack.includes(keyword)) {
      const fp = path.join(sutureDir, filename);
      if (fs.existsSync(fp)) return fp;
    }
  }
  return null;
}

const LOW_PRIORITY_SUTURE_BRANDS = new Set(['aspiron']);

function isLowPriorityBrand(product) {
  const brand = String(product.brand || product.brand_category || '').trim().toLowerCase();
  return LOW_PRIORITY_SUTURE_BRANDS.has(brand);
}

function excludeLowPriorityBrandsUnlessSoleOption(loadedProducts) {
  const hasAlternative = loadedProducts.some((fp) => fp.products.some((p) => !isLowPriorityBrand(p)));
  if (!hasAlternative) return loadedProducts;
  return loadedProducts
    .map((fp) => ({ ...fp, products: fp.products.filter((p) => !isLowPriorityBrand(p)) }))
    .filter((fp) => fp.products.length > 0);
}

function normalizeSutureSize(raw) {
  if (raw === null || raw === undefined) return null;
  return String(raw).trim().toUpperCase().replace(/\//g, '-');
}

function extractLengthCm(text) {
  const t = String(text).toLowerCase();
  const cm = t.match(/(\d+(?:\.\d+)?)\s*cm\b/);
  if (cm) return parseFloat(cm[1]);
  const mm = t.match(/(\d+(?:\.\d+)?)\s*mm\b/);
  if (mm) return parseFloat(mm[1]) / 10;
  return null;
}

function parseSutureFilters(specs) {
  let size = null;
  let minLengthCm = null;
  for (const [key, val] of Object.entries(specs || {})) {
    const kl = key.toLowerCase();
    if (!size && (kl.includes('suture size') || kl === 'size' || kl.includes('usp') || kl.includes('suture_size'))) {
      const sizeMatch = String(val).match(/([\dA-Za-z][-/]?0|[\d]+)/);
      if (sizeMatch) size = normalizeSutureSize(sizeMatch[0]);
    }
    if (kl.includes('length')) {
      const cm = extractLengthCm(String(val));
      if (cm !== null && (minLengthCm === null || cm < minLengthCm)) minLengthCm = cm;
    }
  }
  return { size, minLengthCm };
}

function filterSutureProducts(loadedProducts, specs) {
  const { size, minLengthCm } = parseSutureFilters(specs);
  const MAX_CANDIDATES = 50;

  const narrowed = loadedProducts.map((fp) => {
    let products = fp.products;
    if (size) {
      const sized = products.filter((p) => {
        const ps = normalizeSutureSize(p.normalized_attributes?.suture_size ?? p.normalized_attributes?.USP_suture_size_equivalent ?? '');
        return ps === size;
      });
      if (sized.length) products = sized;
    }
    if (minLengthCm !== null) {
      const lenFiltered = products.filter((p) => parseFloat(p.normalized_attributes?.suture_length_cm ?? 0) >= minLengthCm);
      if (lenFiltered.length) products = lenFiltered;
    }
    return { ...fp, products };
  });

  const brandFiltered = excludeLowPriorityBrandsUnlessSoleOption(narrowed);

  return brandFiltered
    .map((fp) => ({ ...fp, products: fp.products.slice(0, MAX_CANDIDATES) }))
    .filter((fp) => fp.products.length > 0);
}

function parsePackagingSize(specs) {
  for (const [key, val] of Object.entries(specs || {})) {
    const text = `${key} ${val}`.toLowerCase();
    const m = text.match(/(\d+)\s*(wells?|tests?|t\b)/);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

function filterRapidElisaProducts(loadedProducts, specs) {
  const targetSize = parsePackagingSize(specs);
  if (!targetSize) return loadedProducts;
  return loadedProducts
    .map((fp) => {
      const sized = fp.products.filter((p) => {
        const sizeStr = (p.packaging_size || p.pack_size || '').toString().toLowerCase();
        if (!sizeStr) return true;
        const m = sizeStr.match(/(\d+)/);
        return m ? parseInt(m[1], 10) === targetSize : true;
      });
      return { ...fp, products: sized.length ? sized : fp.products };
    })
    .filter((fp) => fp.products.length > 0);
}

function loadProducts(productFiles) {
  const loaded = [];
  let totalChars = 0;
  for (const fp of productFiles) {
    if (!fs.existsSync(fp)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
      const entries = Array.isArray(data) ? data : [data];
      const chunk = JSON.stringify({ file: path.basename(fp), products: entries });
      if (loaded.length > 0 && totalChars + chunk.length > MAX_PROD_CHARS) break;
      loaded.push({ file: path.basename(fp), products: entries });
      totalChars += chunk.length;
    } catch (_) { /* skip unparsable catalog file */ }
  }
  return loaded;
}

function scanDir(dir) {
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => path.join(dir, f)) : [];
}

// Our gem_tenders rows don't carry the AI-extracted item_main_category/type
// fields the original pipeline produced per BOQ row — we only have
// dept ('Diagno'/'Endo') + sub_cat + items free text. This classifies a
// tender into the same category buckets from that text instead.
function classifyTender(dept, subCat, itemsText) {
  const t = `${subCat || ''} ${itemsText || ''}`.toLowerCase();
  const deptL = (dept || '').toLowerCase();

  if (deptL === 'endo') {
    if (t.includes('sutur')) return { category: 'endo', type: 'Suture' };
    if (t.includes('stapl') || t.includes('ligat') || t.includes('clip')) return { category: 'endo', type: 'Stapler' };
    if (t.includes('trocar') || t.includes('cannula') || t.includes('port')) return { category: 'endo', type: 'Trocar' };
    if (t.includes('mesh')) return { category: 'endo', type: 'Mesh' };
    if (t.includes('biosurg')) return { category: 'endo', type: 'Biosurgicals' };
    if (t.includes('energy')) return { category: 'endo', type: 'Energy Device' };
    if (t.includes('glue')) return { category: 'endo', type: 'Glue' };
    if (t.includes('iud')) return { category: 'endo', type: 'IUDs' };
    if (t.includes('kit')) return { category: 'endo', type: 'Kit' };
    return { category: 'endo', type: 'Others' };
  }

  if (deptL === 'diagno') {
    if (t.includes('rapid') || t.includes('elisa')) return { category: 'rapid_elisa', type: 'Rapids' };
    if (t.includes('system pack') || t.includes('systempack') || /\baq\s*(100|200|400)\b/.test(t)) {
      return { category: 'systempacks', type: 'AQ SystemPacks' };
    }
    if (t.includes('analy')) return { category: 'analyzer', type: t };
    if (t.includes('reagent') || t.includes('kit for estimation') || t.includes('kit for') || t.includes('reagents')) {
      return { category: 'reagents', type: 'Reagents' };
    }
    return { category: 'reagents', type: 'Reagents' };
  }

  return null;
}

function getProductFiles(classification) {
  const registry = {
    analyzer: scanDir(path.join(PRODUCTS_DIR, 'analyzer')),
    endo: scanDir(path.join(PRODUCTS_DIR, 'endo')),
    sutures: scanDir(path.join(PRODUCTS_DIR, 'endo', 'sutures_by_material')),
    reagents: scanDir(path.join(PRODUCTS_DIR, 'reagents')),
    systempacks: scanDir(path.join(PRODUCTS_DIR, 'systempacks')),
    rapid_elisa: [],
  };
  const rpPath = path.join(PRODUCTS_DIR, 'rapid_elisa.json');
  if (fs.existsSync(rpPath)) registry.rapid_elisa.push(rpPath);
  const spPath = path.join(PRODUCTS_DIR, 'system_packs.json');
  if (fs.existsSync(spPath)) registry.systempacks.push(spPath);

  const { category, type } = classification;
  if (category === 'analyzer') {
    const specific = resolveAnalyzerFile(type);
    return specific && fs.existsSync(specific) ? [specific] : registry.analyzer;
  }
  if (category === 'endo') {
    if ((type || '').toLowerCase().includes('sutur')) return registry.sutures;
    const specific = resolveEndoFile(type);
    return specific && fs.existsSync(specific) ? [specific] : registry.endo;
  }
  if (category === 'reagents') return registry.reagents;
  if (category === 'systempacks') return registry.systempacks;
  if (category === 'rapid_elisa') return registry.rapid_elisa;
  return [];
}

// tech-spec table rows look like [category, specName, allowedValue] (see
// parseGemJsonData's techSpecTables) — flatten to a plain {spec: value} map
// for the LLM prompt, same shape the original pipeline's
// technical_specifications field used.
function flattenTechSpecs(techSpecTables) {
  const specs = {};
  for (const table of techSpecTables || []) {
    for (const row of table.slice(1)) {
      if (!Array.isArray(row) || row.length < 2) continue;
      const specName = (row[1] || row[0] || '').toString().trim();
      const value = (row[row.length - 1] || '').toString().trim();
      if (specName && value) specs[specName] = value;
    }
  }
  return specs;
}

const MATCH_SYSTEM_PROMPT = `You are a Product Matching & Compliance Analyst at Meril Life Sciences Pvt Ltd.

For a SINGLE tender item:
1. Select the SINGLE best matching product from the provided product list.
2. Produce a full deviation table comparing every tender specification to the selected product.

MATCHING RULES:
- Return exactly ONE product — the closest match by type, material, size, performance.
- product_code and product_name MUST be copied exactly from the provided products list.
- If no strong match exists, return the closest with a low relevancy_score.

DEVIATION TABLE RULES:
- Analyse ALL tender technical_specifications.
- Status (use exactly): "Complied" | "Deviation" | "Not Specified"
- Source (use exactly): "ATC" | "GEM" | "ATC & GEM" — if unsure, use "GEM".

OUTPUT (JSON only, no markdown, no explanation):
{
  "product_code": "<exact code>",
  "product_name": "<exact name>",
  "selected_file": "<product file basename>",
  "relevancy_score": <0.0-1.0>,
  "deviation_table": [
    { "specification": "<spec name>", "tender_requirement": "<value>", "product_offered": "<value or 'Not specified'>", "status": "Complied | Deviation | Not Specified", "source": "ATC | GEM | ATC & GEM", "reason": "<concise>", "remarks": "" }
  ]
}`;

// Matches ONE tender (treated as a single line item, unlike the original
// pipeline's multi-item BOQ splitting) against the local product catalog via
// Ollama. Returns the same {item, tender_item_name, item_category,
// selected_file, product_code, product_name, relevancy_score} shape the
// original pipeline stored in tender_processing_results.suggested_products,
// plus the deviation table, so existing display code needs no changes.
async function matchTenderToProduct({ dept, subCat, items, itemCategory, techSpecTables }) {
  const classification = classifyTender(dept, subCat, items);
  if (!classification) return null;

  const isSuture = classification.type.toLowerCase().includes('sutur');
  let productFiles = getProductFiles(classification);
  if (isSuture) {
    const specific = findSutureFile(`${subCat || ''} ${items || ''}`);
    if (specific) productFiles = [specific];
  }

  let products = loadProducts(productFiles);
  if (!products.length) return null;

  const techSpecs = flattenTechSpecs(techSpecTables);

  if (isSuture) {
    const filtered = filterSutureProducts(products, techSpecs);
    if (filtered.length) products = filtered;
  }
  if (classification.category === 'rapid_elisa') {
    const filtered = filterRapidElisaProducts(products, techSpecs);
    if (filtered.length) products = filtered;
  }

  const userMsg = `TENDER ITEM:
Tender Item Name: ${items || itemCategory || '—'}
Department: ${dept || '—'}
Category: ${classification.category}
Type: ${classification.type}

TENDER TECHNICAL SPECIFICATIONS:
${JSON.stringify(techSpecs, null, 2)}

AVAILABLE PRODUCTS:
${JSON.stringify(products, null, 2)}`;

  const raw = await ollamaChat(MATCH_SYSTEM_PROMPT, userMsg);
  const parsed = parseJsonResponse(raw);
  if (!parsed) return null;

  return {
    item: 'item_1',
    tender_item_name: items || itemCategory || null,
    item_category: itemCategory || classification.type,
    selected_file: parsed.selected_file || products[0]?.file || '',
    product_code: parsed.product_code || '',
    product_name: parsed.product_name || '',
    relevancy_score: typeof parsed.relevancy_score === 'number' ? parsed.relevancy_score : 0,
    deviation_table: Array.isArray(parsed.deviation_table) ? parsed.deviation_table : [],
  };
}

module.exports = { matchTenderToProduct, classifyTender };
