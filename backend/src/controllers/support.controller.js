const db = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { sendMail } = require('../utils/mailer');

// Multer storage for support ticket images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/support', String(req.user.id));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (/^image\//i.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

exports.uploadMiddleware = upload.single('image');

async function notifyMonitors(ticket, submitterName) {
  try {
    const [monitors] = await db.query(
      "SELECT email FROM users WHERE role = 'Admin' AND status = 'Active'"
    );
    if (!monitors.length) return;

    await sendMail({
      to: monitors.map(m => m.email),
      subject: `[Support] New Ticket #${ticket.id}: ${ticket.title}`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#333">
          <h2 style="color:#084f9a">New Support Ticket Submitted</h2>
          <table style="border-collapse:collapse;width:100%;max-width:600px">
            <tr><td style="padding:8px;font-weight:bold;background:#f0f6ff">Ticket #</td><td style="padding:8px">${ticket.id}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;background:#f0f6ff">From</td><td style="padding:8px">${submitterName} (${ticket.user_email})</td></tr>
            <tr><td style="padding:8px;font-weight:bold;background:#f0f6ff">Title</td><td style="padding:8px">${ticket.title}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;background:#f0f6ff">Priority</td><td style="padding:8px">${ticket.priority}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;background:#f0f6ff">Description</td><td style="padding:8px">${ticket.description}</td></tr>
          </table>
          <p style="margin-top:20px;font-size:12px;color:#999">Login to OpenProcure to view and respond.</p>
        </div>
      `,
    });
  } catch (e) {
    console.warn('Support email notification failed:', e.message);
  }
}

// POST /api/support  — submit ticket
exports.createTicket = async (req, res) => {
  try {
    const { title, description, priority = 'medium' } = req.body;
    if (!title || !description) {
      return res.status(400).json({ success: false, message: 'title and description are required' });
    }

    const [[user]] = await db.query('SELECT name, email FROM users WHERE id = ?', [req.user.id]);
    const imagePath = req.file ? `/uploads/support/${req.user.id}/${req.file.filename}` : null;

    const [result] = await db.query(
      'INSERT INTO support_tickets (user_id, user_name, user_email, title, description, image_path, priority) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, user.name, user.email, title, description, imagePath, priority]
    );

    const ticket = { id: result.insertId, title, description, priority, user_email: user.email };
    await notifyMonitors(ticket, user.name);

    res.status(201).json({ success: true, message: 'Ticket submitted successfully', id: result.insertId });
  } catch (err) {
    console.error('createTicket:', err);
    res.status(500).json({ success: false, message: 'Failed to submit ticket' });
  }
};

// GET /api/support  — get tickets (own for users, all for monitor/Admin)
exports.getTickets = async (req, res) => {
  try {
    const { page = 1, limit = 20, status = '', priority = '' } = req.query;
    const offset = (page - 1) * limit;
    const isPrivileged = req.user.role === 'Admin';
    const conditions = [];
    const params = [];

    if (!isPrivileged) { conditions.push('t.user_id = ?'); params.push(req.user.id); }
    if (status)   { conditions.push('t.status = ?');   params.push(status); }
    if (priority) { conditions.push('t.priority = ?'); params.push(priority); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [rows] = await db.query(
      `SELECT t.*, u.name AS resolver_name
       FROM support_tickets t
       LEFT JOIN users u ON u.id = t.resolved_by
       ${where}
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, +limit, +offset]
    );
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM support_tickets t ${where}`, params
    );

    res.json({ success: true, data: rows, total, page: +page, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('getTickets:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch tickets' });
  }
};

// GET /api/support/:id
exports.getTicket = async (req, res) => {
  try {
    const [[ticket]] = await db.query(
      `SELECT t.*, u.name AS resolver_name FROM support_tickets t LEFT JOIN users u ON u.id = t.resolved_by WHERE t.id = ?`,
      [req.params.id]
    );
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
    const isPrivileged = req.user.role === 'Admin';
    if (!isPrivileged && ticket.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    res.json({ success: true, ticket });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch ticket' });
  }
};

// GET /api/support/export  — download all tickets as Excel (Admin/monitor only)
exports.exportTickets = async (req, res) => {
  try {
    const isPrivileged = req.user.role === 'Admin';
    if (!isPrivileged) return res.status(403).json({ success: false, message: 'Access denied' });

    const { status = '', priority = '' } = req.query;
    const conditions = [];
    const params = [];
    if (status)   { conditions.push('t.status = ?');   params.push(status); }
    if (priority) { conditions.push('t.priority = ?'); params.push(priority); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [rows] = await db.query(
      `SELECT t.id, t.user_name, t.user_email, t.title, t.description, t.priority, t.status,
              t.created_at, t.resolved_at, u.name AS resolved_by
       FROM support_tickets t
       LEFT JOIN users u ON u.id = t.resolved_by
       ${where}
       ORDER BY t.created_at DESC`,
      params
    );

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Support Tickets');

    sheet.columns = [
      { header: 'Ticket #',      key: 'id',          width: 10 },
      { header: 'Submitted By',  key: 'user_name',   width: 22 },
      { header: 'Email',         key: 'user_email',  width: 28 },
      { header: 'Title',         key: 'title',        width: 36 },
      { header: 'Description',   key: 'description', width: 50 },
      { header: 'Priority',      key: 'priority',    width: 12 },
      { header: 'Status',        key: 'status',      width: 14 },
      { header: 'Created At',    key: 'created_at',  width: 20 },
      { header: 'Resolved At',   key: 'resolved_at', width: 20 },
      { header: 'Resolved By',   key: 'resolved_by', width: 22 },
    ];

    // Style header row
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF084f9a' } };
    sheet.getRow(1).alignment = { vertical: 'middle' };

    const fmt = d => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

    rows.forEach(r => {
      const row = sheet.addRow({
        ...r,
        created_at: fmt(r.created_at),
        resolved_at: fmt(r.resolved_at),
      });
      // Colour-code priority
      const priColors = { high: 'FFFEE2E2', medium: 'FFFEF3C7', low: 'FFD1FAE5' };
      const priFont   = { high: 'FF991B1B', medium: 'FF92400E', low: 'FF065F46' };
      const priCell = row.getCell('priority');
      if (priColors[r.priority]) {
        priCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: priColors[r.priority] } };
        priCell.font = { bold: true, color: { argb: priFont[r.priority] } };
      }
      // Colour-code status
      const stColors = { open: 'FFFEE2E2', in_progress: 'FFFEF3C7', resolved: 'FFD1FAE5', closed: 'FFF3F4F6' };
      const stFont   = { open: 'FF991B1B', in_progress: 'FF92400E', resolved: 'FF065F46', closed: 'FF374151' };
      const stCell = row.getCell('status');
      if (stColors[r.status]) {
        stCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: stColors[r.status] } };
        stCell.font = { bold: true, color: { argb: stFont[r.status] } };
      }
    });

    // Freeze header row
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="support_tickets_${Date.now()}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('exportTickets:', err);
    res.status(500).json({ success: false, message: 'Failed to export tickets' });
  }
};

// PUT /api/support/:id/status  — update status (monitor/Admin)
exports.updateTicketStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const resolvedFields = status === 'resolved'
      ? ', resolved_by = ?, resolved_at = NOW()'
      : '';
    const params = status === 'resolved'
      ? [status, req.user.id, req.params.id]
      : [status, req.params.id];

    await db.query(
      `UPDATE support_tickets SET status = ?${resolvedFields} WHERE id = ?`,
      params
    );
    res.json({ success: true, message: 'Status updated' });
  } catch (err) {
    console.error('updateTicketStatus:', err);
    res.status(500).json({ success: false, message: 'Failed to update status' });
  }
};

// POST /api/support/mail-pdf  — generate PDF and email it (Admin/monitor only)
exports.mailTicketsPdf = async (req, res) => {
  try {
    const isPrivileged = req.user.role === 'Admin';
    if (!isPrivileged) return res.status(403).json({ success: false, message: 'Access denied' });

    const { status = '', priority = '', to = 'stevejerald632@gmail.com' } = req.query;
    const conditions = [];
    const params = [];
    if (status)   { conditions.push('t.status = ?');   params.push(status); }
    if (priority) { conditions.push('t.priority = ?'); params.push(priority); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [rows] = await db.query(
      `SELECT t.id, t.user_name, t.user_email, t.title, t.description, t.priority, t.status,
              t.created_at, t.resolved_at, u.name AS resolved_by
       FROM support_tickets t
       LEFT JOIN users u ON u.id = t.resolved_by
       ${where}
       ORDER BY t.created_at DESC`,
      params
    );

    const fmt = d => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
    const priColor = { high: '#fee2e2', medium: '#fef3c7', low: '#d1fae5' };
    const priFg    = { high: '#991b1b', medium: '#92400e', low: '#065f46' };
    const stColor  = { open: '#fee2e2', in_progress: '#fef3c7', resolved: '#d1fae5', closed: '#f3f4f6' };
    const stFg     = { open: '#991b1b', in_progress: '#92400e', resolved: '#065f46', closed: '#374151' };
    const badge = (val, bgMap, fgMap) =>
      `<span style="background:${bgMap[val]||'#f3f4f6'};color:${fgMap[val]||'#374151'};padding:2px 9px;border-radius:12px;font-size:10px;font-weight:700">${val?.replace('_',' ').toUpperCase()}</span>`;

    const rows_html = rows.map((t, i) => `
      <tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'}">
        <td style="padding:8px 10px;color:#6b7280;font-size:11px">#${t.id}</td>
        <td style="padding:8px 10px;font-weight:600;font-size:12px">${t.title}</td>
        <td style="padding:8px 10px;font-size:11px">
          <div style="font-weight:500">${t.user_name}</div>
          <div style="color:#9ca3af;font-size:10px">${t.user_email}</div>
        </td>
        <td style="padding:8px 10px">${badge(t.priority, priColor, priFg)}</td>
        <td style="padding:8px 10px">${badge(t.status, stColor, stFg)}</td>
        <td style="padding:8px 10px;font-size:11px;color:#374151;max-width:220px">${t.description}</td>
        <td style="padding:8px 10px;font-size:10px;color:#6b7280;white-space:nowrap">${fmt(t.created_at)}</td>
        <td style="padding:8px 10px;font-size:10px;color:#6b7280;white-space:nowrap">${t.resolved_at ? fmt(t.resolved_at) : '—'}</td>
        <td style="padding:8px 10px;font-size:11px;color:#374151">${t.resolved_by || '—'}</td>
      </tr>`).join('');

    const filterLabel = [status && `Status: ${status.replace('_',' ')}`, priority && `Priority: ${priority}`].filter(Boolean).join(' · ') || 'All tickets';

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; color:#1e293b; padding:24px; }
  h1 { font-size:18px; font-weight:700; color:#084f9a; }
  .meta { font-size:11px; color:#6b7280; margin:4px 0 18px; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  thead tr { background:#084f9a; }
  thead th { padding:9px 10px; text-align:left; color:#fff; font-weight:600; font-size:11px; white-space:nowrap; }
  tbody tr td { border-bottom:1px solid #e5e7eb; vertical-align:top; }
  .footer { margin-top:16px; font-size:10px; color:#9ca3af; text-align:right; }
</style>
</head><body>
<h1>Support Tickets</h1>
<p class="meta">Filter: ${filterLabel} &nbsp;·&nbsp; Total: ${rows.length} &nbsp;·&nbsp; Generated: ${new Date().toLocaleString('en-IN')}</p>
<table>
  <thead>
    <tr>
      <th>#</th><th>Title</th><th>Submitted By</th><th>Priority</th><th>Status</th>
      <th>Description</th><th>Created At</th><th>Resolved At</th><th>Resolved By</th>
    </tr>
  </thead>
  <tbody>${rows_html}</tbody>
</table>
<p class="footer">OpenProcure · Support Ticket Export</p>
</body></html>`;

    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A3', landscape: true, printBackground: true, margin: { top: '16px', bottom: '16px', left: '16px', right: '16px' } });
    await browser.close();

    const result = await sendMail({
      to,
      subject: `Support Tickets Report — ${new Date().toLocaleDateString('en-IN')}`,
      html: `
        <div style="font-family:Arial,sans-serif;color:#1e293b;line-height:1.6">
          <h2 style="color:#084f9a">Support Tickets Report</h2>
          <p>Please find attached the support tickets report generated on <strong>${new Date().toLocaleString('en-IN')}</strong>.</p>
          <p><strong>Filter:</strong> ${filterLabel} &nbsp;·&nbsp; <strong>Total:</strong> ${rows.length} ticket${rows.length !== 1 ? 's' : ''}</p>
          <p style="margin-top:16px;font-size:12px;color:#9ca3af">OpenProcure · Automated Report</p>
        </div>`,
      attachments: [{ filename: `support_tickets_${Date.now()}.pdf`, content: pdf, contentType: 'application/pdf' }],
    });
    // sendMail() never throws (mail is treated as best-effort elsewhere in
    // the app), so a failure has to be checked explicitly here rather than
    // relying on the surrounding catch — otherwise this would report success
    // even when the send genuinely failed.
    if (!result.ok) {
      return res.status(502).json({ success: false, message: result.error || 'Failed to send PDF' });
    }

    res.json({ success: true, message: `PDF sent to ${to}` });
  } catch (err) {
    console.error('mailTicketsPdf:', err);
    res.status(500).json({ success: false, message: 'Failed to send PDF' });
  }
};

// GET /api/support/export-pdf  — download all tickets as PDF (Admin/monitor only)
exports.exportTicketsPdf = async (req, res) => {
  try {
    const isPrivileged = req.user.role === 'Admin';
    if (!isPrivileged) return res.status(403).json({ success: false, message: 'Access denied' });

    const { status = '', priority = '' } = req.query;
    const conditions = [];
    const params = [];
    if (status)   { conditions.push('t.status = ?');   params.push(status); }
    if (priority) { conditions.push('t.priority = ?'); params.push(priority); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [rows] = await db.query(
      `SELECT t.id, t.user_name, t.user_email, t.title, t.description, t.priority, t.status,
              t.created_at, t.resolved_at, u.name AS resolved_by
       FROM support_tickets t
       LEFT JOIN users u ON u.id = t.resolved_by
       ${where}
       ORDER BY t.created_at DESC`,
      params
    );

    const fmt = d => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

    const priColor  = { high: '#fee2e2', medium: '#fef3c7', low: '#d1fae5' };
    const priFg     = { high: '#991b1b', medium: '#92400e', low: '#065f46' };
    const stColor   = { open: '#fee2e2', in_progress: '#fef3c7', resolved: '#d1fae5', closed: '#f3f4f6' };
    const stFg      = { open: '#991b1b', in_progress: '#92400e', resolved: '#065f46', closed: '#374151' };

    const badge = (val, bgMap, fgMap) =>
      `<span style="background:${bgMap[val]||'#f3f4f6'};color:${fgMap[val]||'#374151'};padding:2px 9px;border-radius:12px;font-size:10px;font-weight:700">${val?.replace('_',' ').toUpperCase()}</span>`;

    const rows_html = rows.map((t, i) => `
      <tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'}">
        <td style="padding:8px 10px;color:#6b7280;font-size:11px">#${t.id}</td>
        <td style="padding:8px 10px;font-weight:600;font-size:12px">${t.title}</td>
        <td style="padding:8px 10px;font-size:11px">
          <div style="font-weight:500">${t.user_name}</div>
          <div style="color:#9ca3af;font-size:10px">${t.user_email}</div>
        </td>
        <td style="padding:8px 10px">${badge(t.priority, priColor, priFg)}</td>
        <td style="padding:8px 10px">${badge(t.status, stColor, stFg)}</td>
        <td style="padding:8px 10px;font-size:11px;color:#374151;max-width:220px">${t.description}</td>
        <td style="padding:8px 10px;font-size:10px;color:#6b7280;white-space:nowrap">${fmt(t.created_at)}</td>
        <td style="padding:8px 10px;font-size:10px;color:#6b7280;white-space:nowrap">${t.resolved_at ? fmt(t.resolved_at) : '—'}</td>
        <td style="padding:8px 10px;font-size:11px;color:#374151">${t.resolved_by || '—'}</td>
      </tr>`).join('');

    const filterLabel = [status && `Status: ${status.replace('_',' ')}`, priority && `Priority: ${priority}`].filter(Boolean).join(' · ') || 'All tickets';

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; color:#1e293b; padding:24px; }
  h1 { font-size:18px; font-weight:700; color:#084f9a; }
  .meta { font-size:11px; color:#6b7280; margin:4px 0 18px; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  thead tr { background:#084f9a; }
  thead th { padding:9px 10px; text-align:left; color:#fff; font-weight:600; font-size:11px; white-space:nowrap; }
  tbody tr td { border-bottom:1px solid #e5e7eb; vertical-align:top; }
  .footer { margin-top:16px; font-size:10px; color:#9ca3af; text-align:right; }
</style>
</head><body>
<h1>Support Tickets</h1>
<p class="meta">Filter: ${filterLabel} &nbsp;·&nbsp; Total: ${rows.length} &nbsp;·&nbsp; Generated: ${new Date().toLocaleString('en-IN')}</p>
<table>
  <thead>
    <tr>
      <th>#</th><th>Title</th><th>Submitted By</th><th>Priority</th><th>Status</th>
      <th>Description</th><th>Created At</th><th>Resolved At</th><th>Resolved By</th>
    </tr>
  </thead>
  <tbody>${rows_html}</tbody>
</table>
<p class="footer">OpenProcure · Support Ticket Export</p>
</body></html>`;

    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A3', landscape: true, printBackground: true, margin: { top: '16px', bottom: '16px', left: '16px', right: '16px' } });
    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="support_tickets_${Date.now()}.pdf"`);
    res.end(pdf);
  } catch (err) {
    console.error('exportTicketsPdf:', err);
    res.status(500).json({ success: false, message: 'Failed to export PDF' });
  }
};
