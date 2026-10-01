'use strict';
// Ported from targeting-system/server/src/excelParser.js (ESM -> CommonJS,
// otherwise unchanged) — parses the yearly budget workbook by reading its
// pivot-table cache XML directly out of the .xlsx zip, rather than loading
// the whole workbook through a general-purpose Excel library. The workbook
// has two pivot caches, one per business entity (MDPL = Diagnostics, MEPL =
// Endo Surgery), each aggregated here by person.
const yauzl = require('yauzl');
const sax = require('sax');

const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];

function readZipEntry(zipPath, entryName) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      let found = false;
      zip.on('entry', (entry) => {
        if (entry.fileName === entryName) {
          found = true;
          zip.openReadStream(entry, (err2, stream) => {
            if (err2) return reject(err2);
            resolve(stream);
          });
        } else {
          zip.readEntry();
        }
      });
      zip.on('end', () => {
        if (!found) reject(new Error(`Entry not found: ${entryName}`));
      });
      zip.readEntry();
    });
  });
}

// Parses pivotCacheDefinitionN.xml: returns { fieldNames: [...], sharedItems: [ [items] per field, or null if field not shared/numeric ] }
async function parseCacheDefinition(zipPath, entryName) {
  const stream = await readZipEntry(zipPath, entryName);
  const parser = sax.createStream(true, { trim: false });

  const fieldNames = [];
  const sharedItems = [];
  let currentField = -1;
  let inSharedItems = false;

  return new Promise((resolve, reject) => {
    parser.on('opentag', (node) => {
      if (node.name === 'cacheField') {
        fieldNames.push(node.attributes.name);
        sharedItems.push(null);
        currentField = fieldNames.length - 1;
      } else if (node.name === 'sharedItems') {
        inSharedItems = true;
        if (sharedItems[currentField] === null) sharedItems[currentField] = [];
      } else if (inSharedItems && node.name === 's') {
        sharedItems[currentField].push(node.attributes.v);
      } else if (inSharedItems && node.name === 'n') {
        sharedItems[currentField].push(Number(node.attributes.v));
      } else if (inSharedItems && node.name === 'm') {
        sharedItems[currentField].push(null);
      }
    });
    parser.on('closetag', (name) => {
      if (name === 'sharedItems') inSharedItems = false;
    });
    parser.on('end', () => resolve({ fieldNames, sharedItems }));
    parser.on('error', reject);
    stream.pipe(parser);
  });
}

// Streams pivotCacheRecordsN.xml, calling onRecord(fieldsArray) for each <r> record.
// fieldsArray[i] is either a resolved shared string, a raw string, or a number.
async function streamCacheRecords(zipPath, entryName, sharedItems, onRecord) {
  const stream = await readZipEntry(zipPath, entryName);
  const parser = sax.createStream(true, { trim: false });

  let record = null;
  let fieldIdx = -1;

  return new Promise((resolve, reject) => {
    parser.on('opentag', (node) => {
      if (node.name === 'r') {
        record = [];
        fieldIdx = -1;
      } else if (record !== null) {
        fieldIdx++;
        const attrs = node.attributes;
        if (node.name === 'x') {
          const items = sharedItems[fieldIdx];
          const idx = Number(attrs.v);
          record.push(items ? items[idx] : null);
        } else if (node.name === 'n') {
          record.push(Number(attrs.v));
        } else if (node.name === 's') {
          record.push(attrs.v);
        } else if (node.name === 'm') {
          record.push(null);
        } else {
          record.push(null);
        }
      }
    });
    parser.on('closetag', (name) => {
      if (name === 'r' && record !== null) {
        onRecord(record);
        record = null;
      }
    });
    parser.on('end', resolve);
    parser.on('error', reject);
    stream.pipe(parser);
  });
}

// Reads pivotTableN.xml's <pivotField> block for one field (by its index in
// the SAME cacheField order as the paired pivotCacheDefinition) and resolves
// its <items><item x="N"/></items> list to actual values via that field's
// sharedItems — this is the row order the pivot table actually displays
// (grouped by data order / a saved custom sort), which is very often NOT
// alphabetical (e.g. "Instrument", "Instrument - Others", "Reagent",
// "Rapid & Elisa" — not what String.sort() would produce). "t=default"
// entries (the implicit blank/subtotal item) are skipped.
async function parsePivotFieldOrder(zipPath, pivotTableEntry, fieldIndex, sharedItemsForField) {
  const stream = await readZipEntry(zipPath, pivotTableEntry);
  const chunks = [];
  await new Promise((resolve, reject) => {
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  const xml = Buffer.concat(chunks).toString('utf-8');

  const blocks = xml.split('<pivotField ');
  const block = blocks[fieldIndex + 1]; // blocks[0] is everything before the first pivotField
  if (!block) return null;
  const itemsMatch = block.match(/<items count="\d+">([\s\S]*?)<\/items>/);
  if (!itemsMatch || !sharedItemsForField) return null;

  const order = [];
  const re = /<item x="(\d+)"/g;
  let m;
  while ((m = re.exec(itemsMatch[1]))) {
    const val = sharedItemsForField[Number(m[1])];
    if (val != null) order.push(val);
  }
  return order;
}

function normalizeNameKey(name) {
  if (!name) return '';
  return name
    .replace(/\([^)]*\)/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function cleanDisplayName(name) {
  const cleaned = name.replace(/\([^)]*\)/g, '').trim().replace(/\s+/g, ' ');
  return cleaned
    .split(' ')
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');
}

/**
 * Aggregates one pivot cache (definition+records) by person.
 * fieldMap: { name, group, category, months: [12 field names in Apr..Mar order], total }
 */
async function aggregateBusiness(zipPath, defEntry, recEntry, fieldMap) {
  const { fieldNames, sharedItems } = await parseCacheDefinition(zipPath, defEntry);
  const idx = (fname) => fieldNames.indexOf(fname);

  const nameIdx = idx(fieldMap.name);
  const groupIdx = idx(fieldMap.group);
  const catIdx = idx(fieldMap.category);
  const rsmIdx = idx('RSM');
  const zhIdx = idx('Zonal Head');
  const monthIdxs = fieldMap.months.map((m) => idx(m));
  const totalIdx = idx(fieldMap.total);

  const byName = {};

  await streamCacheRecords(zipPath, recEntry, sharedItems, (rec) => {
    const rawName = rec[nameIdx];
    if (!rawName) return;
    const key = normalizeNameKey(rawName);
    const group = rec[groupIdx] || 'Other';
    const category = rec[catIdx] || 'Other';
    const months = monthIdxs.map((i) => Number(rec[i]) || 0);
    const total = Number(rec[totalIdx]) || 0;

    if (!byName[key]) {
      byName[key] = {
        displayName: cleanDisplayName(rawName),
        rsm: rec[rsmIdx] || '',
        zonalHead: rec[zhIdx] || '',
        groups: {},
        total: 0,
        level: 'FLSP',
      };
    }
    const person = byName[key];
    if (!person.groups[group]) person.groups[group] = { categories: {} };
    if (!person.groups[group].categories[category]) {
      person.groups[group].categories[category] = { months: new Array(12).fill(0), total: 0 };
    }
    const cell = person.groups[group].categories[category];
    for (let i = 0; i < 12; i++) cell.months[i] += months[i];
    cell.total += total;
    person.total += total;
  });

  // RSMs and Zonal Heads aren't rows in the pivot cache at all — only FLSPs
  // are, with the RSM/ZH names sitting alongside each FLSP's own row as
  // metadata. Their "letter" is the roll-up of everyone reporting to them,
  // so build one by summing every FLSP's groups/categories/months into a
  // synthetic person keyed by that RSM's/Zonal Head's own (namespaced) name —
  // same data shape as an FLSP entry, so the existing PDF renderer needs no
  // changes at all to handle them.
  addRollupLevels(byName);

  // Row order the pivot table itself displays for the group/category fields —
  // NOT alphabetical (see parsePivotFieldOrder). Falls back to alphabetical
  // if the paired pivotTable XML doesn't have what we expect, so a workbook
  // that doesn't match this exact shape still renders (just re-sorted).
  let groupOrder = null;
  let categoryOrder = null;
  if (fieldMap.pivotTableEntry) {
    try {
      groupOrder = await parsePivotFieldOrder(zipPath, fieldMap.pivotTableEntry, groupIdx, sharedItems[groupIdx]);
      categoryOrder = await parsePivotFieldOrder(zipPath, fieldMap.pivotTableEntry, catIdx, sharedItems[catIdx]);
    } catch (err) {
      // fall through to null -> alphabetical fallback at render time
    }
  }

  return { months: MONTHS, byName, groupOrder, categoryOrder };
}

function titleCase(name) {
  return name.trim().split(/\s+/).filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/** Adds every FLSP row's numbers into `target` (an RSM's or Zonal Head's
 * roll-up entry), category by category, month by month. */
function mergeGroupsInto(target, source) {
  for (const [groupName, group] of Object.entries(source.groups)) {
    if (!target.groups[groupName]) target.groups[groupName] = { categories: {} };
    for (const [catName, cell] of Object.entries(group.categories)) {
      if (!target.groups[groupName].categories[catName]) {
        target.groups[groupName].categories[catName] = { months: new Array(12).fill(0), total: 0 };
      }
      const dst = target.groups[groupName].categories[catName];
      for (let i = 0; i < 12; i++) dst.months[i] += cell.months[i];
      dst.total += cell.total;
    }
  }
  target.total += source.total;
}

/** Mutates `byName` in place, adding one roll-up entry per distinct RSM and
 * per distinct Zonal Head found among the FLSP entries already in it. Keys
 * are namespaced ("rsm__"/"zh__" + normalized name) so they can never
 * collide with an FLSP's own key, even if an FLSP happens to share a name
 * with an RSM/Zonal Head. "Vacant" (an unfilled role, same convention as the
 * email directory) is skipped rather than turned into a fake person. */
function addRollupLevels(byName) {
  const flspEntries = Object.values(byName);
  const rsmRollup = {};
  const zhRollup = {};

  for (const person of flspEntries) {
    if (person.rsm && !/^vacant$/i.test(person.rsm.trim())) {
      const key = normalizeNameKey(person.rsm);
      if (!rsmRollup[key]) {
        rsmRollup[key] = {
          displayName: titleCase(person.rsm),
          rsm: titleCase(person.rsm), // themselves — same "who to route this to" convention as an FLSP row
          zonalHead: person.zonalHead ? titleCase(person.zonalHead) : '',
          groups: {},
          total: 0,
          level: 'RSM',
        };
      }
      mergeGroupsInto(rsmRollup[key], person);
    }
    if (person.zonalHead && !/^vacant$/i.test(person.zonalHead.trim())) {
      const key = normalizeNameKey(person.zonalHead);
      if (!zhRollup[key]) {
        zhRollup[key] = {
          displayName: titleCase(person.zonalHead),
          rsm: '', // a Zonal Head isn't under one specific RSM — several RSMs report to them
          zonalHead: titleCase(person.zonalHead),
          groups: {},
          total: 0,
          level: 'Zonal Head',
        };
      }
      mergeGroupsInto(zhRollup[key], person);
    }
  }

  for (const [key, entry] of Object.entries(rsmRollup)) byName[`rsm__${key}`] = entry;
  for (const [key, entry] of Object.entries(zhRollup)) byName[`zh__${key}`] = entry;
}

async function parseWorkbook(zipPath) {
  const [mepl, mdpl] = await Promise.all([
    aggregateBusiness(zipPath, 'xl/pivotCache/pivotCacheDefinition1.xml', 'xl/pivotCache/pivotCacheRecords1.xml', {
      name: 'FLSP Name',
      group: 'Portfolio',
      category: 'Category',
      // "Apr-26".."Mar-27"/"Total" hold Qty; the "...2" suffixed fields hold Value in Lakhs, which is what the sheet displays.
      months: ['Apr-262', 'May-262', 'Jun-262', 'Jul-262', 'Aug-262', 'Sep-262', 'Oct-262', 'Nov-262', 'Dec-262', 'Jan-272', 'Feb-272', 'Mar-272'],
      total: 'Total2',
      // pivotTable2.xml is the one whose rels point at pivotCacheDefinition1.xml.
      pivotTableEntry: 'xl/pivotTables/pivotTable2.xml',
    }),
    aggregateBusiness(zipPath, 'xl/pivotCache/pivotCacheDefinition2.xml', 'xl/pivotCache/pivotCacheRecords2.xml', {
      name: 'FLSP',
      group: 'Business',
      category: 'Business Group',
      months: ['Apr-262', 'May-262', 'Jun-262', 'Jul-262', 'Aug-262', 'Sep-262', 'Oct-262', 'Nov-262', 'Dec-262', 'Jan-272', 'Feb-272', 'Mar-272'],
      total: 'Total2',
      // pivotTable1.xml is the one whose rels point at pivotCacheDefinition2.xml.
      pivotTableEntry: 'xl/pivotTables/pivotTable1.xml',
    }),
  ]);

  const allKeys = new Set([...Object.keys(mepl.byName), ...Object.keys(mdpl.byName)]);
  const names = [...allKeys]
    .map((key) => ({
      key,
      displayName: mdpl.byName[key]?.displayName || mepl.byName[key]?.displayName,
      hasDiagnostics: !!mdpl.byName[key],
      hasEndoSurgery: !!mepl.byName[key],
      // 'FLSP' | 'RSM' | 'Zonal Head' — same in both divisions for a given
      // key by construction, so either side's value is fine here.
      level: mdpl.byName[key]?.level || mepl.byName[key]?.level || 'FLSP',
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return { mepl, mdpl, names };
}

module.exports = { parseWorkbook, normalizeNameKey };
