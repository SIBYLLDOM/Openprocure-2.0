'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

// Windows-only path — this app runs on a Windows Server box; adjust if ever
// deployed elsewhere. LibreOffice is already installed on this server.
const SOFFICE_PATH = 'C:\\Program Files\\LibreOffice\\program\\soffice.exe';
const CONVERT_TIMEOUT_MS = 90_000;

const PDF_NATIVE_EXTS = new Set(['.pdf']);
// Extensions LibreOffice can open and export to PDF (covers Office docs,
// OpenDocument formats, plain text, and common raster images).
const CONVERTIBLE_EXTS = new Set([
  '.doc', '.docx', '.odt', '.rtf', '.txt',
  '.xls', '.xlsx', '.ods', '.csv',
  '.ppt', '.pptx', '.odp',
  '.png', '.jpg', '.jpeg', '.bmp', '.gif', '.tiff',
]);

function isAlreadyPdf(filePath) {
  return PDF_NATIVE_EXTS.has(path.extname(filePath).toLowerCase());
}

function isConvertible(filePath) {
  return CONVERTIBLE_EXTS.has(path.extname(filePath).toLowerCase());
}

/**
 * Converts a file to PDF via headless LibreOffice and returns the PDF bytes
 * as a Buffer. Each call gets its own -env:UserInstallation profile dir
 * (LibreOffice headless instances corrupt each other's profile lock file
 * under concurrent use otherwise) and its own output dir — both are removed
 * before returning, so nothing lingers in the OS temp folder per call.
 *
 * Throws if the source extension isn't one LibreOffice can open, or if
 * conversion fails/times out. If the file is already a PDF, returns its
 * bytes unchanged without invoking LibreOffice.
 */
async function convertToPdf(filePath) {
  if (isAlreadyPdf(filePath)) return fs.readFileSync(filePath);
  if (!isConvertible(filePath)) {
    throw new Error(`Unsupported file type for PDF conversion: ${path.extname(filePath)}`);
  }
  if (!fs.existsSync(SOFFICE_PATH)) {
    throw new Error('LibreOffice is not installed on this server (expected at ' + SOFFICE_PATH + ')');
  }

  const runId = crypto.randomBytes(8).toString('hex');
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), `lo_out_${runId}_`));
  const profileDir = path.join(os.tmpdir(), `lo_profile_${runId}`);

  try {
    await new Promise((resolve, reject) => {
      execFile(
        SOFFICE_PATH,
        [
          '--headless', '--norestore',
          `-env:UserInstallation=file:///${profileDir.replace(/\\/g, '/')}`,
          '--convert-to', 'pdf',
          '--outdir', outDir,
          filePath,
        ],
        { timeout: CONVERT_TIMEOUT_MS },
        (err) => (err ? reject(err) : resolve())
      );
    });

    const base = path.basename(filePath, path.extname(filePath));
    const pdfPath = path.join(outDir, `${base}.pdf`);
    if (!fs.existsSync(pdfPath)) {
      throw new Error('LibreOffice did not produce a PDF output');
    }
    return fs.readFileSync(pdfPath);
  } finally {
    try { fs.rmSync(outDir, { recursive: true, force: true }); } catch { /* best effort */ }
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

module.exports = { convertToPdf, isAlreadyPdf, isConvertible };
