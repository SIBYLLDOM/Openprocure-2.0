// src/controllers/dealerAuthLetters.controller.js
//
// Two-stage OTP digital-signature workflow for the Dealer Authorization
// Letter: generate (no signature) -> Legal Team signs via email OTP ->
// Admin Team (Ravi Kiran) signs via email OTP -> final signed PDF.
//
// Kept as its own dedicated table rather than reusing `approval_requests` —
// that table's approver-resolution (resolveApprovers/canActOn) is tightly
// coupled to the tender-decode division/zonal-head/finance pipeline and
// knows nothing about OTPs or fixed named signers, so bolting this on would
// mean fighting that logic for no benefit.

const crypto = require('crypto');
const db = require('../config/db');
const { sendMail, layout } = require('../utils/mailer');
const docPrepCtrl = require('./docPrep.controller');

const OTP_TTL_MINUTES = 10;

async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS dealer_auth_letter_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      division VARCHAR(50) NOT NULL,
      company_name VARCHAR(255) NOT NULL,
      letter_html LONGTEXT NOT NULL,
      status ENUM('pending_legal','pending_admin','completed') NOT NULL DEFAULT 'pending_legal',
      created_by INT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      legal_user_id INT NULL,
      legal_otp_hash VARCHAR(255) NULL,
      legal_otp_expires_at DATETIME NULL,
      legal_signed_by INT NULL,
      legal_signed_at DATETIME NULL,
      admin_user_id INT NULL,
      admin_otp_hash VARCHAR(255) NULL,
      admin_otp_expires_at DATETIME NULL,
      admin_signed_by INT NULL,
      admin_signed_at DATETIME NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_status (status),
      INDEX idx_created_by (created_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
}
let tableReady = ensureTable().catch(err => {
  console.error('[dealer-auth-letters] table init failed:', err);
});

// "Ravi Kiran" is a fixed named signer for the Admin stage, not a role — if
// no such user exists yet, fall back to any Admin so the flow doesn't dead-end.
async function resolveAdminSigner() {
  const [named] = await db.query("SELECT id, name, email FROM users WHERE name LIKE '%Ravi Kiran%' LIMIT 1");
  if (named.length) return named[0];
  const [anyAdmin] = await db.query("SELECT id, name, email FROM users WHERE role = 'Admin' ORDER BY id LIMIT 1");
  return anyAdmin[0] || null;
}

async function getLegalUsers() {
  const [rows] = await db.query("SELECT id, name, email FROM users WHERE role = 'Legal'");
  return rows;
}

const genOtp = () => String(crypto.randomInt(100000, 1000000));
const hashOtp = (otp) => crypto.createHash('sha256').update(otp).digest('hex');

const fmtTimestamp = (d) => {
  const dt = d ? new Date(d) : new Date();
  return dt.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).replace(',', '') + " +05'30'";
};

// Same visual language as a DSC (digital signature certificate) stamp —
// name, "Digitally signed by X / Date: ...", then name + role again below.
function signatureBlockHtml({ companyName, signerName, roleLabel, signedAt }) {
  const upper = (signerName || '').toUpperCase();
  return `
    <div style="flex:1;min-width:0;">
      <p style="margin:0 0 10px;font-weight:700;">For ${companyName},</p>
      <div style="margin:6px 0 10px;">
        <p style="margin:0;font-weight:700;font-size:11pt;color:#111827;">${signerName}</p>
        <p style="margin:2px 0 0;font-size:8pt;line-height:1.4;color:#1d4ed8;">
          Digitally signed by ${upper}<br/>Date: ${fmtTimestamp(signedAt)}
        </p>
      </div>
      <p style="margin:6px 0 0;font-weight:700;">${signerName}</p>
      <p style="margin:0;">${roleLabel}</p>
    </div>`;
}

function bothSignaturesHtml(request) {
  return `
    <div style="display:flex;gap:48px;margin-top:28px;">
      ${signatureBlockHtml({
        companyName: request.company_name,
        signerName: request.legal_signer_name || 'Legal Team',
        roleLabel: 'Legal Team',
        signedAt: request.legal_signed_at,
      })}
      ${signatureBlockHtml({
        companyName: request.company_name,
        signerName: request.admin_signer_name || 'Authorized Signatory',
        roleLabel: 'Authorized Signatory',
        signedAt: request.admin_signed_at,
      })}
    </div>`;
}

const PUBLIC_COLUMNS = `
  id, division, company_name, status, created_by, created_at,
  legal_user_id, legal_signed_by, legal_signed_at,
  admin_user_id, admin_signed_by, admin_signed_at, updated_at
`;

// POST /api/dealer-auth-letters
exports.createRequest = async (req, res) => {
  try {
    await tableReady;
    const { division, companyName, htmlContent } = req.body;
    if (!companyName || !htmlContent) {
      return res.status(400).json({ success: false, message: 'companyName and htmlContent are required' });
    }

    const [result] = await db.query(
      `INSERT INTO dealer_auth_letter_requests (division, company_name, letter_html, status, created_by)
       VALUES (?, ?, ?, 'pending_legal', ?)`,
      [division || 'Diagno', companyName, htmlContent, req.user.id]
    );

    const legalUsers = await getLegalUsers();
    if (legalUsers.length) {
      const html = layout({
        heading: 'Dealer Authorization Letter — Signature Needed',
        intro: `A new authorization letter for <strong>${companyName}</strong> is waiting for the Legal Team's digital signature.`,
        rows: [['Division', division || 'Diagno']],
        ctaLabel: 'Review & Sign',
        ctaUrl: `${process.env.APP_URL || 'https://openprocure.ai'}/dealers/signatures`,
      });
      await sendMail({
        to: legalUsers.map(u => u.email).filter(Boolean),
        subject: `Signature needed: Dealer Authorization Letter — ${companyName}`,
        html,
      });
    }

    res.json({ success: true, id: result.insertId });
  } catch (err) {
    console.error('[dealer-auth-letters] createRequest:', err);
    res.status(500).json({ success: false, message: 'Failed to submit letter for signature' });
  }
};

// GET /api/dealer-auth-letters
exports.listRequests = async (req, res) => {
  try {
    await tableReady;
    const role = req.user.role;
    let where = 'created_by = ?';
    let params = [req.user.id];

    if (role === 'Legal') {
      where = `(status = 'pending_legal' OR legal_signed_by = ?)`;
      params = [req.user.id];
    } else if (role === 'Admin' || role === 'Tender Admin' || role === 'Office Administrator') {
      where = `(status IN ('pending_admin', 'completed') OR admin_signed_by = ? OR created_by = ?)`;
      params = [req.user.id, req.user.id];
    }

    const [rows] = await db.query(
      `SELECT ${PUBLIC_COLUMNS} FROM dealer_auth_letter_requests WHERE ${where} ORDER BY created_at DESC`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[dealer-auth-letters] listRequests:', err);
    res.status(500).json({ success: false, message: 'Failed to load signature requests' });
  }
};

// GET /api/dealer-auth-letters/:id
exports.getRequest = async (req, res) => {
  try {
    await tableReady;
    const [rows] = await db.query(
      `SELECT ${PUBLIC_COLUMNS}, letter_html FROM dealer_auth_letter_requests WHERE id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[dealer-auth-letters] getRequest:', err);
    res.status(500).json({ success: false, message: 'Failed to load request' });
  }
};

// POST /api/dealer-auth-letters/:id/send-otp
exports.sendOtp = async (req, res) => {
  try {
    await tableReady;
    const [rows] = await db.query('SELECT * FROM dealer_auth_letter_requests WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    const request = rows[0];

    const [[me]] = await db.query('SELECT id, name, email, role FROM users WHERE id = ?', [req.user.id]);
    if (!me?.email) return res.status(400).json({ success: false, message: 'Your account has no email on file' });

    let stageOk = false;
    if (request.status === 'pending_legal' && me.role === 'Legal') stageOk = true;
    if (request.status === 'pending_admin') {
      const adminSigner = await resolveAdminSigner();
      if (adminSigner && adminSigner.id === me.id) stageOk = true;
    }
    if (!stageOk) {
      return res.status(403).json({ success: false, message: 'You are not the signer for this stage' });
    }

    const otp = genOtp();
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    if (request.status === 'pending_legal') {
      await db.query(
        'UPDATE dealer_auth_letter_requests SET legal_user_id = ?, legal_otp_hash = ?, legal_otp_expires_at = ? WHERE id = ?',
        [me.id, otpHash, expiresAt, request.id]
      );
    } else {
      await db.query(
        'UPDATE dealer_auth_letter_requests SET admin_user_id = ?, admin_otp_hash = ?, admin_otp_expires_at = ? WHERE id = ?',
        [me.id, otpHash, expiresAt, request.id]
      );
    }

    const html = layout({
      heading: 'Your OTP for Dealer Authorization Letter Signature',
      intro: `Use this code to digitally sign the authorization letter for <strong>${request.company_name}</strong>. It expires in ${OTP_TTL_MINUTES} minutes.`,
      rows: [['OTP', otp]],
    });
    const sent = await sendMail({ to: me.email, subject: 'Your OTP — Dealer Authorization Letter', html });
    if (!sent.ok) return res.status(500).json({ success: false, message: 'Failed to send OTP email' });

    res.json({ success: true, message: `OTP sent to ${me.email}` });
  } catch (err) {
    console.error('[dealer-auth-letters] sendOtp:', err);
    res.status(500).json({ success: false, message: 'Failed to send OTP' });
  }
};

// POST /api/dealer-auth-letters/:id/verify-otp
exports.verifyOtp = async (req, res) => {
  try {
    await tableReady;
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ success: false, message: 'OTP is required' });

    const [rows] = await db.query('SELECT * FROM dealer_auth_letter_requests WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    const request = rows[0];

    const [[me]] = await db.query('SELECT id, name, email FROM users WHERE id = ?', [req.user.id]);

    const stage = request.status === 'pending_legal' ? 'legal'
      : request.status === 'pending_admin' ? 'admin'
      : null;
    if (!stage) return res.status(400).json({ success: false, message: 'This letter is not awaiting a signature' });

    const userIdCol = `${stage}_user_id`;
    const hashCol = `${stage}_otp_hash`;
    const expiresCol = `${stage}_otp_expires_at`;

    if (request[userIdCol] !== me.id) {
      return res.status(403).json({ success: false, message: 'You did not request an OTP for this letter' });
    }
    if (!request[hashCol] || !request[expiresCol] || new Date(request[expiresCol]) < new Date()) {
      return res.status(400).json({ success: false, message: 'OTP expired — request a new one' });
    }
    if (hashOtp(String(otp)) !== request[hashCol]) {
      return res.status(400).json({ success: false, message: 'Incorrect OTP' });
    }

    if (stage === 'legal') {
      await db.query(
        `UPDATE dealer_auth_letter_requests
         SET status = 'pending_admin', legal_signed_by = ?, legal_signed_at = NOW(),
             legal_otp_hash = NULL, legal_otp_expires_at = NULL
         WHERE id = ?`,
        [me.id, request.id]
      );
      const adminSigner = await resolveAdminSigner();
      if (adminSigner?.email) {
        const html = layout({
          heading: 'Dealer Authorization Letter — Your Signature Needed',
          intro: `The Legal Team has signed the authorization letter for <strong>${request.company_name}</strong>. It now needs your signature.`,
          ctaLabel: 'Review & Sign',
          ctaUrl: `${process.env.APP_URL || 'https://openprocure.ai'}/dealers/signatures`,
        });
        await sendMail({ to: adminSigner.email, subject: `Signature needed: ${request.company_name}`, html });
      }
    } else {
      await db.query(
        `UPDATE dealer_auth_letter_requests
         SET status = 'completed', admin_signed_by = ?, admin_signed_at = NOW(),
             admin_otp_hash = NULL, admin_otp_expires_at = NULL
         WHERE id = ?`,
        [me.id, request.id]
      );
      const [[creator]] = await db.query('SELECT email FROM users WHERE id = ?', [request.created_by]);
      if (creator?.email) {
        const html = layout({
          heading: 'Dealer Authorization Letter — Fully Signed',
          intro: `Both signatures are complete for <strong>${request.company_name}</strong>. The signed PDF is ready to download.`,
          ctaLabel: 'Download PDF',
          ctaUrl: `${process.env.APP_URL || 'https://openprocure.ai'}/dealers/signatures`,
        });
        await sendMail({ to: creator.email, subject: `Fully signed: ${request.company_name}`, html });
      }
    }

    res.json({ success: true, message: 'Signed successfully' });
  } catch (err) {
    console.error('[dealer-auth-letters] verifyOtp:', err);
    res.status(500).json({ success: false, message: 'Failed to verify OTP' });
  }
};

// GET /api/dealer-auth-letters/:id/pdf
exports.downloadPdf = async (req, res) => {
  try {
    await tableReady;
    const [rows] = await db.query('SELECT * FROM dealer_auth_letter_requests WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    const request = rows[0];
    if (request.status !== 'completed') {
      return res.status(400).json({ success: false, message: 'Both signatures are required before this can be downloaded' });
    }

    const [[legal]] = await db.query('SELECT name FROM users WHERE id = ?', [request.legal_signed_by]);
    const [[admin]] = await db.query('SELECT name FROM users WHERE id = ?', [request.admin_signed_by]);
    request.legal_signer_name = legal?.name;
    request.admin_signer_name = admin?.name;

    const finalHtml = `${request.letter_html}${bothSignaturesHtml(request)}`;

    // Reuse the exact same Puppeteer/letterhead pipeline as the standalone
    // export (Meril header/footer per division) via an in-process call —
    // same adapter pattern used by chat.controller.js's mock req/res.
    const fakeReq = { body: { title: `Authorization Letter — ${request.company_name}`, html_content: finalHtml, division: request.division, skipAutoSignature: true } };
    const fakeRes = {
      setHeader() {},
      status(code) { this._status = code; return this; },
      send: (buf) => {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Authorization_Letter_${request.company_name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`);
        res.send(buf);
      },
      json: (obj) => res.status(fakeRes._status || 500).json(obj),
    };
    await docPrepCtrl.exportPdfStandalone(fakeReq, fakeRes);
  } catch (err) {
    console.error('[dealer-auth-letters] downloadPdf:', err);
    res.status(500).json({ success: false, message: 'Failed to render PDF' });
  }
};
