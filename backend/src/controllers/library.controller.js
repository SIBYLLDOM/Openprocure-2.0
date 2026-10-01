'use strict';
const db     = require('../config/db');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const multer = require('multer');
const AdmZip = require('adm-zip');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { sendMail } = require('../utils/mailer');
const { parseExpiryFromFilename } = require('../utils/expiryParser');
const { getUserScope } = require('../utils/userScope');

const LIBRARY_DIR = path.join(__dirname, '../../uploads/library');
fs.mkdirSync(LIBRARY_DIR, { recursive: true });

const ensureTable = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS library_items (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      parent_id   INT NULL,
      type        ENUM('folder','file') NOT NULL,
      name        VARCHAR(255) NOT NULL,
      file_path   VARCHAR(500) NULL,
      file_size   BIGINT NULL,
      mime_type   VARCHAR(150) NULL,
      created_by  INT NULL,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_parent (parent_id)
    )
  `);
  await ensureExpiryColumns();
  await ensureDivisionColumn();
  await ensureDivisionRoots();
};

// Added after the table already existed, same ALTER-guard convention as
// ensureExpiryColumns. Only the two seeded root folders (see
// ensureDivisionRoots) ever have this set — everything nested under one is
// scoped by walking up to its root (see getRootDivision), not by tagging
// every single descendant row.
let divisionColumnEnsured = false;
async function ensureDivisionColumn() {
  if (divisionColumnEnsured) return;
  const [cols] = await db.query(
    `SELECT COLUMN_NAME FROM information_schema.columns
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'library_items' AND COLUMN_NAME = 'division'`
  );
  if (!cols.length) {
    await db.query(`ALTER TABLE library_items ADD COLUMN division ENUM('Diagno','Endo') NULL`);
  }
  divisionColumnEnsured = true;
}

// The Library is split at the top level into two fixed division folders —
// "Diagnostics Division" and "EndoSurgery Division" — everyone's uploads and
// browsing happen inside one of these, mirroring the Diagno/Endo split used
// for tenders elsewhere in the app. Idempotent: safe to call on every boot.
let divisionRootsEnsured = false;
async function ensureDivisionRoots() {
  if (divisionRootsEnsured) return;
  for (const [division, name] of [['Diagno', 'Diagnostics Division'], ['Endo', 'EndoSurgery Division']]) {
    const [[existing]] = await db.query(
      `SELECT id FROM library_items WHERE parent_id IS NULL AND type = 'folder' AND division = ? LIMIT 1`,
      [division]
    );
    if (!existing) {
      await db.query(
        `INSERT INTO library_items (parent_id, type, name, division) VALUES (NULL, 'folder', ?, ?)`,
        [name, division]
      );
    }
  }
  divisionRootsEnsured = true;
}

/** Admin and Tender Admin (any division/source assignment) can browse and manage BOTH divisions in the Library specifically — everyone else is limited to their own department's division(s). */
async function getAllowedDivisions(req) {
  const role = req.user?.role;
  if (role === 'Admin' || role === 'Tender Admin' || role === 'Office Administrator') return ['Diagno', 'Endo'];
  const scope = await getUserScope(req.user?.id);
  return scope.divisions || [];
}

/** Walks a library item's parent chain up to its root and returns that root's `division` — the division the item itself belongs to, however deeply nested. */
async function getRootDivision(itemId) {
  let cursor = itemId;
  let row = null;
  let guard = 0;
  while (cursor && guard++ < 100) {
    const [[r]] = await db.query(`SELECT id, parent_id, division FROM library_items WHERE id = ?`, [cursor]);
    if (!r) break;
    row = r;
    cursor = r.parent_id;
  }
  return row?.division || null;
}

// Added after the table already existed in production (335+ rows), so these
// are ALTERs guarded by an information_schema check rather than part of the
// CREATE TABLE above. Runs once per process (module-level flag) since
// ensureTable() is called at the top of nearly every request handler here.
let expiryColumnsEnsured = false;
async function ensureExpiryColumns() {
  if (expiryColumnsEnsured) return;
  const [cols] = await db.query(
    `SELECT COLUMN_NAME FROM information_schema.columns
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'library_items'
       AND COLUMN_NAME IN ('expiry_date','expiry_source','expiry_reminder_sent_at')`
  );
  const have = new Set(cols.map(c => c.COLUMN_NAME));
  if (!have.has('expiry_date')) {
    await db.query(`ALTER TABLE library_items ADD COLUMN expiry_date DATE NULL`);
  }
  if (!have.has('expiry_source')) {
    await db.query(`ALTER TABLE library_items ADD COLUMN expiry_source ENUM('parsed','manual') NULL`);
  }
  if (!have.has('expiry_reminder_sent_at')) {
    await db.query(`ALTER TABLE library_items ADD COLUMN expiry_reminder_sent_at TIMESTAMP NULL`);
  }
  expiryColumnsEnsured = true;
}

/**
 * One-shot startup pass: fills expiry_date for existing/new files whose name
 * carries a parseable expiry (see utils/expiryParser) and haven't been looked
 * at yet (expiry_source IS NULL — a prior miss is left alone forever, since a
 * failed parse means "no keyword+date" which won't change on rescan; a user
 * setting it manually also sets expiry_source, so this never overwrites that).
 */
async function backfillExpiryDates() {
  try {
    await ensureTable();
    const [rows] = await db.query(
      `SELECT id, name FROM library_items
       WHERE type = 'file' AND expiry_date IS NULL AND expiry_source IS NULL
       LIMIT 2000`
    );
    let updated = 0;
    for (const row of rows) {
      const parsed = parseExpiryFromFilename(row.name);
      if (!parsed) continue;
      await db.query(
        `UPDATE library_items SET expiry_date = ?, expiry_source = ? WHERE id = ?`,
        [parsed.expiry_date, parsed.expiry_source, row.id]
      );
      updated++;
    }
    if (updated) console.log(`[library] backfilled expiry_date on ${updated} file(s) from their filenames`);
  } catch (err) {
    console.error('[library] backfillExpiryDates failed:', err.message);
  }
}
// Run shortly after boot — not at import time — so a slow DB connection on
// startup doesn't race this (same convention as approvalReminders.js).
setTimeout(() => { backfillExpiryDates().catch(() => {}); }, 60 * 1000);

/**
 * mysql2 (see config/db.js — no `dateStrings` option) returns a DATE column
 * as a JS Date constructed in the server's local timezone. That's fine until
 * Express's res.json() serializes it via the Date's own toISOString(), which
 * converts to UTC — on a server running ahead of UTC (this one is IST,
 * UTC+5:30) local midnight becomes 18:30 the PREVIOUS day, so the client
 * would silently see an expiry date one day earlier than what's stored.
 * Formatting with local getters here (not UTC getters) sidesteps that.
 */
function formatDateOnly(val) {
  if (!val) return null;
  if (typeof val === 'string') return val.slice(0, 10);
  const y = val.getFullYear();
  const m = String(val.getMonth() + 1).padStart(2, '0');
  const d = String(val.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/* ─── Multer — same convention as docPrep/companyDrive: timestamp-prefixed,
   sanitized filename under the feature's own uploads subfolder. ─────────── */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, LIBRARY_DIR),
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname);
    const safe = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_\-]/g, '_');
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}-${safe}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } });
exports.uploadMiddleware = upload.single('file');
exports.uploadFolderMiddleware = upload.array('files', 2000);

/** Recursively collects every 'file' item under a folder (any depth). */
async function collectFilesRecursive(folderId) {
  const [children] = await db.query(`SELECT id, type, name, file_path FROM library_items WHERE parent_id = ?`, [folderId]);
  let files = [];
  for (const c of children) {
    if (c.type === 'file') files.push(c);
    else files = files.concat(await collectFilesRecursive(c.id));
  }
  return files;
}

/** Recursively collects every descendant item (folders + files) under a folder, deepest first. */
async function collectDescendantsRecursive(folderId) {
  const [children] = await db.query(`SELECT id, type FROM library_items WHERE parent_id = ?`, [folderId]);
  let all = [];
  for (const c of children) {
    if (c.type === 'folder') all = all.concat(await collectDescendantsRecursive(c.id));
    all.push(c);
  }
  return all;
}

/**
 * GET /api/library?parent_id=<id|empty for root>
 * Lists folders and files directly under parent_id. Folders include a
 * recursive file_count so the table can show "N files" without a second
 * round trip per row.
 */
exports.listItems = async (req, res) => {
  try {
    await ensureTable();
    const parentId = req.query.parent_id ? Number(req.query.parent_id) : null;
    const page  = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const allowedDivisions = await getAllowedDivisions(req);

    if (parentId) {
      // Inside a folder — it belongs to whichever division its root is
      // tagged with, however deep it's nested; reject if that's not one of
      // this user's divisions. A folder with no division at all (everything
      // that existed before this split) has no restriction — untouched.
      const division = await getRootDivision(parentId);
      if (division && !allowedDivisions.includes(division)) {
        return res.status(403).json({ success: false, message: 'You do not have access to this division of the Library.' });
      }
    }

    // Root listing: only the two NEW division folders are actually gated by
    // division — everything that existed before this split (division IS
    // NULL) stays visible to everyone exactly as it always was. Building the
    // divisionClause by hand (not a plain `division IN (?)`) because an
    // empty allowedDivisions array would otherwise produce invalid SQL
    // (`IN ()`), which happens for a user with no department assignment at
    // all — they still see the pre-existing shared content, just neither
    // division folder.
    const divisionClause = allowedDivisions.length
      ? `(division IS NULL OR division IN (?))`
      : `division IS NULL`;
    const divisionParams = allowedDivisions.length ? [allowedDivisions] : [];

    const [[{ total }]] = await db.query(
      parentId
        ? `SELECT COUNT(*) AS total FROM library_items WHERE parent_id = ?`
        : `SELECT COUNT(*) AS total FROM library_items WHERE parent_id IS NULL AND ${divisionClause}`,
      parentId ? [parentId] : divisionParams
    );

    // library_items.type is ENUM('folder','file') — MySQL sorts an ENUM by
    // its declared index, not alphabetically, so plain "ORDER BY type DESC"
    // actually put files before folders. FIELD() forces folders first.
    const [items] = await db.query(
      parentId
        ? `SELECT * FROM library_items WHERE parent_id = ? ORDER BY FIELD(type, 'folder', 'file'), name ASC LIMIT ? OFFSET ?`
        : `SELECT * FROM library_items WHERE parent_id IS NULL AND ${divisionClause} ORDER BY FIELD(type, 'folder', 'file'), name ASC LIMIT ? OFFSET ?`,
      parentId ? [parentId, limit, offset] : [...divisionParams, limit, offset]
    );

    const withCounts = await Promise.all(items.map(async (item) => {
      const withExpiry = { ...item, expiry_date: formatDateOnly(item.expiry_date) };
      if (withExpiry.type !== 'folder') return withExpiry;
      const files = await collectFilesRecursive(withExpiry.id);
      return { ...withExpiry, file_count: files.length };
    }));

    // Breadcrumb trail back to root, for the frontend's folder navigation.
    let breadcrumb = [];
    if (parentId) {
      let cursor = parentId;
      const trail = [];
      while (cursor) {
        const [[row]] = await db.query(`SELECT id, name, parent_id FROM library_items WHERE id = ?`, [cursor]);
        if (!row) break;
        trail.unshift({ id: row.id, name: row.name });
        cursor = row.parent_id;
      }
      breadcrumb = trail;
    }

    res.json({
      success: true,
      items: withCounts,
      breadcrumb,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    console.error('[library] listItems:', err);
    res.status(500).json({ success: false, message: 'Failed to load library' });
  }
};

/** Builds "Parent / Sub / ..." breadcrumb text for a search result row. */
async function buildPathLabel(parentId) {
  const trail = [];
  let cursor = parentId;
  while (cursor) {
    const [[row]] = await db.query(`SELECT id, name, parent_id FROM library_items WHERE id = ?`, [cursor]);
    if (!row) break;
    trail.unshift(row.name);
    cursor = row.parent_id;
  }
  return trail.length ? trail.join(' / ') : 'Home';
}

const TEXT_EXTRACTABLE_EXT = new Set(['.pdf', '.docx', '.txt', '.csv', '.md']);
const MAX_CONTENT_SEARCH_FILE_SIZE = 20 * 1024 * 1024; // 20MB — skip huge files for on-the-fly extraction
const MAX_CONTENT_SEARCH_CANDIDATES = 200; // cap how many files get extracted per search

/** Best-effort plain-text extraction for content search — empty string on anything unsupported/broken. */
async function extractLibraryFileText(item) {
  try {
    const ext = path.extname(item.file_path).toLowerCase();
    if (!TEXT_EXTRACTABLE_EXT.has(ext)) return '';
    if (!fs.existsSync(item.file_path)) return '';
    if (fs.statSync(item.file_path).size > MAX_CONTENT_SEARCH_FILE_SIZE) return '';

    if (ext === '.pdf') {
      const data = await pdfParse(fs.readFileSync(item.file_path));
      return data.text || '';
    }
    if (ext === '.docx') {
      const result = await mammoth.extractRawText({ path: item.file_path });
      return result.value || '';
    }
    return fs.readFileSync(item.file_path, 'utf8');
  } catch {
    return '';
  }
}

/**
 * GET /api/library/brand-docs?brand=Filaprop
 * Looks under the MSC / CE / NCC top-level library folders (and their
 * year/misc subfolders) for a file whose name mentions the given brand, or
 * a generic "All Products" cert. Used by the workspace Products table's
 * Files column to show which compliance docs already exist for a brand.
 */
exports.getBrandDocs = async (req, res) => {
  try {
    await ensureTable();
    const brand = (req.query.brand || '').trim();
    const result = { MSC: null, CE: null, NCC: null };
    if (!brand) return res.json({ success: true, docs: result });

    // MSC/CE/NCC no longer sit at the true library root — they're one level
    // down, inside whichever division folder they belong to (see the
    // Diagno/Endo split) — so look for them there instead of at parent_id
    // IS NULL directly.
    const [tops] = await db.query(
      `SELECT id, name FROM library_items
       WHERE type = 'folder' AND name IN ('MSC','CE','NCC')
         AND parent_id IN (SELECT id FROM library_items WHERE parent_id IS NULL AND type = 'folder' AND division IS NOT NULL)`
    );

    for (const top of tops) {
      const [subfolders] = await db.query(
        `SELECT id FROM library_items WHERE type = 'folder' AND parent_id = ?`,
        [top.id]
      );
      const folderIds = [top.id, ...subfolders.map(s => s.id)];
      const [files] = await db.query(
        `SELECT id, name FROM library_items WHERE type = 'file' AND parent_id IN (?) ORDER BY updated_at DESC`,
        [folderIds]
      );
      const brandLower = brand.toLowerCase();
      const match = files.find(f => f.name.toLowerCase().includes(brandLower))
        || files.find(f => f.name.toLowerCase().includes('all products'));
      result[top.name] = match ? {
        id: match.id,
        name: match.name,
        folder_id: match.parent_id || top.id,
        library_path: `Library / ${top.name} / ${match.name}`,
      } : null;
    }

    res.json({ success: true, docs: result });
  } catch (err) {
    console.error('[library] getBrandDocs:', err);
    res.status(500).json({ success: false, message: 'Failed to look up brand documents' });
  }
};

/**
 * GET /api/library/search?q=...
 * Name search across the whole library (files + folders, any depth), plus a
 * best-effort content search inside file text (PDF/DOCX/TXT/CSV/MD) for
 * files whose name didn't already match. Files rank before folders, and
 * within files, name matches rank before content-only matches.
 */
exports.searchItems = async (req, res) => {
  try {
    await ensureTable();
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ success: true, files: [], folders: [] });

    const like = `%${q}%`;
    const [nameFiles] = await db.query(
      `SELECT * FROM library_items WHERE type = 'file' AND name LIKE ? ORDER BY name ASC LIMIT 100`,
      [like]
    );
    const [nameFolders] = await db.query(
      `SELECT * FROM library_items WHERE type = 'folder' AND name LIKE ? ORDER BY name ASC LIMIT 100`,
      [like]
    );

    const nameMatchedIds = new Set(nameFiles.map(f => f.id));
    const [allFiles] = await db.query(
      `SELECT id, name, parent_id, file_path, file_size, mime_type, created_at, updated_at FROM library_items WHERE type = 'file'`
    );
    const candidates = allFiles
      .filter(f => !nameMatchedIds.has(f.id) && f.file_path)
      .slice(0, MAX_CONTENT_SEARCH_CANDIDATES);

    const qLower = q.toLowerCase();
    const contentMatches = [];
    await Promise.all(candidates.map(async (f) => {
      const text = await extractLibraryFileText(f);
      if (text && text.toLowerCase().includes(qLower)) contentMatches.push(f);
    }));

    const withPaths = async (rows, matchType) => Promise.all(rows.map(async (r) => ({
      ...r,
      expiry_date: formatDateOnly(r.expiry_date),
      match_type: matchType,
      path_label: await buildPathLabel(r.parent_id),
    })));

    const files = [
      ...(await withPaths(nameFiles, 'name')),
      ...(await withPaths(contentMatches, 'content')),
    ];
    const folders = await withPaths(nameFolders, 'name');

    res.json({ success: true, files, folders });
  } catch (err) {
    console.error('[library] searchItems:', err);
    res.status(500).json({ success: false, message: 'Search failed' });
  }
};

/**
 * POST /api/library/folder
 * Body: { name, parent_id? }
 */
exports.createFolder = async (req, res) => {
  try {
    await ensureTable();
    const { name, parent_id } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'Folder name is required' });
    if (!parent_id) return res.status(400).json({ success: false, message: 'Choose a division (Diagnostics or EndoSurgery) to create this folder in.' });

    const division = await getRootDivision(Number(parent_id));
    const allowedDivisions = await getAllowedDivisions(req);
    if (division && !allowedDivisions.includes(division)) {
      return res.status(403).json({ success: false, message: 'You do not have access to this division of the Library.' });
    }

    const [result] = await db.query(
      `INSERT INTO library_items (parent_id, type, name, created_by) VALUES (?, 'folder', ?, ?)`,
      [parent_id || null, name.trim(), req.user?.id || null]
    );
    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) {
    console.error('[library] createFolder:', err);
    res.status(500).json({ success: false, message: 'Failed to create folder' });
  }
};

/**
 * POST /api/library/file
 * Multipart: file, parent_id?, name?
 * If the uploaded file is a .zip, it's extracted and EVERY file inside
 * (regardless of folder depth within the zip) becomes its own file item in
 * the target library folder — the zip's internal folder structure is not
 * preserved, per spec ("10 files in that particular folder").
 */
exports.uploadFile = async (req, res) => {
  try {
    await ensureTable();
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const parentId = req.body.parent_id ? Number(req.body.parent_id) : null;
    if (!parentId) return res.status(400).json({ success: false, message: 'Choose a division (Diagnostics or EndoSurgery) to upload into.' });
    const division = await getRootDivision(parentId);
    const allowedDivisions = await getAllowedDivisions(req);
    if (division && !allowedDivisions.includes(division)) {
      try { fs.unlinkSync(req.file.path); } catch { /* best effort */ }
      return res.status(403).json({ success: false, message: 'You do not have access to this division of the Library.' });
    }
    const ext = path.extname(req.file.originalname).toLowerCase();

    if (ext === '.zip') {
      const zip = new AdmZip(req.file.path);
      const entries = zip.getEntries().filter(e => !e.isDirectory);
      const created = [];

      for (const entry of entries) {
        const entryName = path.basename(entry.entryName); // flatten — drop any path inside the zip
        if (!entryName) continue;
        const safe = entryName.replace(/[^a-zA-Z0-9_\-.]/g, '_');
        const outName = `${Date.now()}-${Math.random().toString(36).slice(2)}-${safe}`;
        const outPath = path.join(LIBRARY_DIR, outName);
        fs.writeFileSync(outPath, entry.getData());

        const parsedExpiry = parseExpiryFromFilename(entryName);
        const [result] = await db.query(
          `INSERT INTO library_items (parent_id, type, name, file_path, file_size, mime_type, created_by, expiry_date, expiry_source)
           VALUES (?, 'file', ?, ?, ?, ?, ?, ?, ?)`,
          [parentId, entryName, outPath, entry.header.size, null, req.user?.id || null,
            parsedExpiry?.expiry_date || null, parsedExpiry?.expiry_source || null]
        );
        created.push({ id: result.insertId, name: entryName });
      }

      // The uploaded zip itself isn't kept as a library item once extracted.
      try { fs.unlinkSync(req.file.path); } catch { /* best effort */ }

      return res.status(201).json({ success: true, extracted: true, files: created });
    }

    const displayName = (req.body.name && req.body.name.trim()) || req.file.originalname;
    const parsedExpiry = parseExpiryFromFilename(displayName);
    const [result] = await db.query(
      `INSERT INTO library_items (parent_id, type, name, file_path, file_size, mime_type, created_by, expiry_date, expiry_source)
       VALUES (?, 'file', ?, ?, ?, ?, ?, ?, ?)`,
      [parentId, displayName, req.file.path, req.file.size, req.file.mimetype, req.user?.id || null,
        parsedExpiry?.expiry_date || null, parsedExpiry?.expiry_source || null]
    );
    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) {
    console.error('[library] uploadFile:', err);
    res.status(500).json({ success: false, message: 'Failed to upload file' });
  }
};

/**
 * POST /api/library/upload-folder
 * Multipart: files (multiple, field name "files"), paths (JSON array of each
 * file's relative path, e.g. "MyFolder/sub1/file1.txt" — one per file, same
 * order), parent_id?
 *
 * Recreates the picked folder's actual nested structure as library_items
 * folders (reusing an existing folder of the same name at the same level
 * instead of duplicating it), then files land in their matching leaf folder.
 * Unlike zip upload (which deliberately flattens), this preserves subfolders
 * — the frontend gets the paths via the browser's native folder picker
 * (webkitRelativePath), not from unzipping.
 */
// A folder with many files spread across several nested subfolders means
// one sequential DB round trip per folder-segment plus one insert per file
// — for a slow DB connection or a deeply-nested pick, that can run long
// enough that IIS's reverse proxy kills the still-open request (which the
// browser then misreports as a CORS failure rather than a timeout). So this
// responds as soon as multer has the files safely on disk, then does the
// folder-resolution/DB-insert work in the background; poll
// GET /library/upload-folder/:jobId for status.
const ensureUploadJobsTable = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS library_upload_jobs (
      id          VARCHAR(64) PRIMARY KEY,
      status      ENUM('processing','done','error') DEFAULT 'processing',
      result      JSON,
      error       TEXT,
      created_by  INT NULL,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};
ensureUploadJobsTable().catch(err => console.error('[library] upload jobs table init failed:', err));

exports.uploadFolder = async (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ success: false, message: 'No files received' });

  let relPaths;
  try {
    relPaths = JSON.parse(req.body.paths || '[]');
  } catch {
    return res.status(400).json({ success: false, message: 'Invalid paths payload' });
  }
  if (relPaths.length !== files.length) {
    return res.status(400).json({ success: false, message: 'paths and files count mismatch' });
  }
  if (!req.body.parent_id) {
    return res.status(400).json({ success: false, message: 'Choose a division (Diagnostics or EndoSurgery) to upload into.' });
  }

  await ensureTable();
  {
    const division = await getRootDivision(Number(req.body.parent_id));
    const allowedDivisions = await getAllowedDivisions(req);
    if (division && !allowedDivisions.includes(division)) {
      return res.status(403).json({ success: false, message: 'You do not have access to this division of the Library.' });
    }
  }
  await ensureUploadJobsTable();
  const jobId = crypto.randomBytes(12).toString('hex');
  await db.query(
    'INSERT INTO library_upload_jobs (id, status, created_by) VALUES (?, ?, ?)',
    [jobId, 'processing', req.user?.id || null]
  );

  res.status(202).json({ success: true, jobId });

  const rootParentId = req.body.parent_id ? Number(req.body.parent_id) : null;
  const userId = req.user?.id || null;
  processUploadFolderJob(jobId, files, relPaths, rootParentId, userId).catch(async (err) => {
    console.error('[library] uploadFolder background job failed:', err);
    await db.query('UPDATE library_upload_jobs SET status = ?, error = ? WHERE id = ?',
      ['error', err.message || 'Folder upload failed', jobId]).catch(() => {});
  });
};

/**
 * GET /api/library/upload-folder/:jobId
 */
exports.getUploadFolderJob = async (req, res) => {
  try {
    await ensureUploadJobsTable();
    const [[row]] = await db.query('SELECT * FROM library_upload_jobs WHERE id = ?', [req.params.jobId]);
    if (!row) return res.status(404).json({ success: false, message: 'Job not found' });
    res.json({ success: true, status: row.status, result: row.result, error: row.error });
  } catch (err) {
    console.error('[library] getUploadFolderJob:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

async function processUploadFolderJob(jobId, files, relPaths, rootParentId, userId) {
    // folderCache key: `${parentId}::${folderName}` -> library_items.id — so
    // two files landing in the same subfolder within this one upload reuse
    // the folder we already created, instead of making a duplicate.
    const folderCache = new Map();

    async function resolveFolder(parentId, name) {
      const key = `${parentId}::${name}`;
      if (folderCache.has(key)) return folderCache.get(key);

      const [[existing]] = await db.query(
        parentId
          ? `SELECT id FROM library_items WHERE parent_id = ? AND type = 'folder' AND name = ? LIMIT 1`
          : `SELECT id FROM library_items WHERE parent_id IS NULL AND type = 'folder' AND name = ? LIMIT 1`,
        parentId ? [parentId, name] : [name]
      );
      if (existing) {
        folderCache.set(key, existing.id);
        return existing.id;
      }

      const [result] = await db.query(
        `INSERT INTO library_items (parent_id, type, name, created_by) VALUES (?, 'folder', ?, ?)`,
        [parentId, name, userId]
      );
      folderCache.set(key, result.insertId);
      return result.insertId;
    }

    let fileCount = 0;
    for (let i = 0; i < files.length; i++) {
      const relPath = String(relPaths[i] || files[i].originalname).replace(/\\/g, '/');
      const segments = relPath.split('/').filter(Boolean);
      const fileName = segments.pop();
      if (!fileName) continue;

      let parentId = rootParentId;
      for (const folderName of segments) {
        parentId = await resolveFolder(parentId, folderName);
      }

      const parsedExpiry = parseExpiryFromFilename(fileName);
      await db.query(
        `INSERT INTO library_items (parent_id, type, name, file_path, file_size, mime_type, created_by, expiry_date, expiry_source)
         VALUES (?, 'file', ?, ?, ?, ?, ?, ?, ?)`,
        [parentId, fileName, files[i].path, files[i].size, files[i].mimetype, userId,
          parsedExpiry?.expiry_date || null, parsedExpiry?.expiry_source || null]
      );
      fileCount++;
    }

    await db.query(
      'UPDATE library_upload_jobs SET status = ?, result = ? WHERE id = ?',
      ['done', JSON.stringify({ success: true, files_created: fileCount, folders_created: folderCache.size }), jobId]
    );
}

/**
 * GET /api/library/folder/:id/download-zip
 * Zips every file recursively under the folder and streams it.
 */
exports.downloadFolderZip = async (req, res) => {
  try {
    const [[folder]] = await db.query(`SELECT id, name FROM library_items WHERE id = ? AND type = 'folder'`, [req.params.id]);
    if (!folder) return res.status(404).json({ success: false, message: 'Folder not found' });

    const files = await collectFilesRecursive(folder.id);
    if (!files.length) return res.status(400).json({ success: false, message: 'This folder has no files to download' });

    const zip = new AdmZip();
    const usedNames = new Set();
    for (const f of files) {
      if (!f.file_path || !fs.existsSync(f.file_path)) continue;
      let name = f.name;
      let i = 2;
      while (usedNames.has(name)) { name = `${i}.${f.name}`; i++; }
      usedNames.add(name);
      zip.addLocalFile(f.file_path, '', name);
    }

    const buf = zip.toBuffer();
    const safeName = folder.name.replace(/[^a-zA-Z0-9_\-]/g, '_');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.zip"`);
    res.send(buf);
  } catch (err) {
    console.error('[library] downloadFolderZip:', err);
    res.status(500).json({ success: false, message: 'Failed to build ZIP' });
  }
};

/** GET /api/library/file/:id/download */
exports.downloadFile = async (req, res) => {
  try {
    const [[file]] = await db.query(`SELECT * FROM library_items WHERE id = ? AND type = 'file'`, [req.params.id]);
    if (!file || !file.file_path || !fs.existsSync(file.file_path)) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }
    res.setHeader('Content-Disposition', `attachment; filename="${file.name.replace(/[^a-zA-Z0-9_\-. ]/g, '_')}"`);
    if (file.mime_type) res.setHeader('Content-Type', file.mime_type);
    fs.createReadStream(file.file_path).pipe(res);
  } catch (err) {
    console.error('[library] downloadFile:', err);
    res.status(500).json({ success: false, message: 'Download failed' });
  }
};

/** GET /api/library/file/:id/view — same file, inline instead of attachment */
exports.viewFile = async (req, res) => {
  try {
    const [[file]] = await db.query(`SELECT * FROM library_items WHERE id = ? AND type = 'file'`, [req.params.id]);
    if (!file || !file.file_path || !fs.existsSync(file.file_path)) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }
    res.setHeader('Content-Disposition', `inline; filename="${file.name.replace(/[^a-zA-Z0-9_\-. ]/g, '_')}"`);
    if (file.mime_type) res.setHeader('Content-Type', file.mime_type);
    fs.createReadStream(file.file_path).pipe(res);
  } catch (err) {
    console.error('[library] viewFile:', err);
    res.status(500).json({ success: false, message: 'Failed to open file' });
  }
};

/**
 * POST /api/library/file/:id/share
 * Body: { email }
 */
exports.shareFile = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.trim()) return res.status(400).json({ success: false, message: 'Recipient email is required' });

    const [[file]] = await db.query(`SELECT * FROM library_items WHERE id = ? AND type = 'file'`, [req.params.id]);
    if (!file || !file.file_path || !fs.existsSync(file.file_path)) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    const result = await sendMail({
      to: email.trim(),
      subject: `Shared file: ${file.name}`,
      html: `<p>A file has been shared with you from OpenProcure's Library:</p><p><strong>${file.name}</strong></p>`,
      attachments: [{ filename: file.name, path: file.file_path }],
    });

    if (!result.ok) return res.status(502).json({ success: false, message: result.error || 'Failed to send email' });
    res.json({ success: true, message: `Sent to ${email.trim()}` });
  } catch (err) {
    console.error('[library] shareFile:', err);
    res.status(500).json({ success: false, message: 'Failed to share file' });
  }
};

/**
 * DELETE /api/library/:id
 * Files: removes the DB row + the file on disk.
 * Folders: recursively removes every descendant (files + subfolders) first,
 * then the folder itself.
 */
/**
 * PATCH /api/library/:id
 * Body: { name }
 * Renames a folder or file's display name. The on-disk file_path (for files)
 * is left as-is — only the library_items.name shown in the UI changes.
 */
exports.renameItem = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'Name is required' });

    const [[item]] = await db.query(`SELECT id FROM library_items WHERE id = ?`, [id]);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

    await db.query(`UPDATE library_items SET name = ? WHERE id = ?`, [name, id]);
    res.json({ success: true, name });
  } catch (err) {
    console.error('[library] renameItem:', err);
    res.status(500).json({ success: false, message: 'Failed to rename' });
  }
};

/**
 * PATCH /api/library/:id/expiry
 * Body: { expiry_date: 'YYYY-MM-DD' | null }
 * Manual override for files whose expiry couldn't be parsed from their
 * filename (or to correct a wrong auto-parse). Restricted to Admin/Tender
 * Admin, same as delete — expiry drives the reminder emails, so it shouldn't
 * be editable by everyone who can merely view the library.
 */
exports.updateExpiry = async (req, res) => {
  try {
    if (req.user.role !== 'Admin' && req.user.role !== 'Tender Admin' && req.user.role !== 'Office Administrator') {
      return res.status(403).json({ success: false, message: 'Only Admins and Tender Admins can set an expiry date' });
    }
    await ensureTable();
    const id = Number(req.params.id);
    const { expiry_date } = req.body;
    if (expiry_date && !/^\d{4}-\d{2}-\d{2}$/.test(expiry_date)) {
      return res.status(400).json({ success: false, message: 'expiry_date must be YYYY-MM-DD' });
    }

    const [[item]] = await db.query(`SELECT id FROM library_items WHERE id = ? AND type = 'file'`, [id]);
    if (!item) return res.status(404).json({ success: false, message: 'File not found' });

    // Reset the reminder gate so a newly-set (or pushed-out) date can trigger
    // a fresh reminder later instead of staying silenced by an old send.
    await db.query(
      `UPDATE library_items SET expiry_date = ?, expiry_source = ?, expiry_reminder_sent_at = NULL WHERE id = ?`,
      [expiry_date || null, expiry_date ? 'manual' : null, id]
    );
    res.json({ success: true, expiry_date: expiry_date || null });
  } catch (err) {
    console.error('[library] updateExpiry:', err);
    res.status(500).json({ success: false, message: 'Failed to update expiry date' });
  }
};

exports.deleteItem = async (req, res) => {
  try {
    if (req.user.role !== 'Admin' && req.user.role !== 'Tender Admin' && req.user.role !== 'Office Administrator') {
      return res.status(403).json({ success: false, message: 'Only Admins and Tender Admins can delete library items' });
    }
    const id = Number(req.params.id);
    const [[item]] = await db.query(`SELECT * FROM library_items WHERE id = ?`, [id]);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

    if (item.type === 'file') {
      if (item.file_path && fs.existsSync(item.file_path)) {
        try { fs.unlinkSync(item.file_path); } catch { /* best effort */ }
      }
      await db.query(`DELETE FROM library_items WHERE id = ?`, [id]);
      return res.json({ success: true });
    }

    // Folder — delete every descendant's disk file, then every descendant
    // row (deepest first so nothing is orphaned mid-delete), then itself.
    const descendants = await collectDescendantsRecursive(id);
    for (const d of descendants) {
      if (d.type === 'file') {
        const [[f]] = await db.query(`SELECT file_path FROM library_items WHERE id = ?`, [d.id]);
        if (f?.file_path && fs.existsSync(f.file_path)) {
          try { fs.unlinkSync(f.file_path); } catch { /* best effort */ }
        }
      }
      await db.query(`DELETE FROM library_items WHERE id = ?`, [d.id]);
    }
    await db.query(`DELETE FROM library_items WHERE id = ?`, [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[library] deleteItem:', err);
    res.status(500).json({ success: false, message: 'Failed to delete' });
  }
};
