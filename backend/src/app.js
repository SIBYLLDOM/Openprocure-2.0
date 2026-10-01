// src/app.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

require('./config/db');
const { corsOrigins, isProd } = require('./config/env');

const app = express();

// Disable Express's built-in ETag generation and mark every response
// non-cacheable. Without this, IIS's ARR reverse proxy (and browsers) can
// cache a GET response keyed by URL and keep serving it via 304 Not Modified
// indefinitely — even after the underlying query logic changes — since ARR's
// cache doesn't know the backend code changed, only that the URL repeated.
app.set('etag', false);
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

/* =========================
   Middleware
========================= */
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    // In local development, always allow the origin
    if (!isProd) return callback(null, true);

    if (corsOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    } else {
      return callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(helmet());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

/* =========================
   DEBUG LOGGER (TEMPORARY)
========================= */
app.use((req, res, next) => {
  if (req.originalUrl.includes('/api/doc-prep')) {
    console.log('====================================');
    console.log('TIME   :', new Date().toISOString());
    console.log('METHOD :', req.method);
    console.log('URL    :', req.originalUrl);
    console.log('PATH   :', req.path);
    console.log('PARAMS :', req.params);
    console.log('====================================');
  }

  next();
});

/* =========================
   Routes
========================= */

app.use((req, res, next) => {
  console.log('APP LEVEL:', req.method, req.originalUrl);
  next();
});

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/test', require('./routes/test.routes'));

// Tenders
app.use('/api/tenders', require('./routes/tenders.routes'));
app.use('/api/tender-status', require('./routes/tenderStatus.routes'));
app.use('/api/tender-interest', require('./routes/tenderInterest.routes'));

// Workspaces & utils
app.use('/api/workspaces', require('./routes/workspace.routes'));
app.use('/api/workdesk-docs', require('./routes/workdeskDocuments.routes'));
app.use('/api/tender-doc-analysis', require('./routes/tenderDocumentAnalysis.routes'));
app.use('/api/utils', require('./routes/utils.routes'));
app.use('/api/incidents', require('./routes/incidents.routes'));
app.use('/api/contracts', require('./routes/contracts.routes'));
app.use('/api/carting', require('./routes/carting.routes'));
app.use('/api/pricing', require('./routes/pricing.routes'));
app.use('/api/prebid', require('./routes/prebid.routes'));

// Static uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
  setHeaders: (res) => {
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  },
}));

// GeM Bids
app.use('/api/gem-bids', require('./routes/gemBids.routes'));
app.use('/api/tender-tracker', require('./routes/tenderTracker.routes'));
app.use('/api/competitors', require('./routes/competitor.routes'));
app.use('/api/admin', require('./routes/admin.routes'));

// User Management & Monitoring
app.use('/api/users', require('./routes/userManagement.routes'));
app.use('/api/monitoring', require('./routes/userMonitoring.routes'));
app.use('/api/approvals', require('./routes/approvals.routes'));
app.use('/api/notifications', require('./routes/notifications.routes'));
app.use('/api/timeline', require('./routes/timeline.routes'));
app.use('/api/document-reads', require('./routes/documentReads.routes'));
app.use('/api/process', require('./routes/process.routes'));
app.use('/api/support', require('./routes/support.routes'));
app.use('/api/product-categories', require('./routes/productCategories.routes'));
app.use('/api/distributors', require('./routes/distributors.routes'));
app.use('/api/automation', require('./routes/automation.routes'));
app.use('/api/doc-prep', require('./routes/docPrep.routes'));
app.use('/api/dealer-auth-letters', require('./routes/dealerAuthLetters.routes'));
app.use('/api/company-drive', require('./routes/companyDrive.routes'));
app.use('/api/library', require('./routes/library.routes'));
app.use('/api/chat', require('./routes/chat.routes'));
app.use('/api/budget-targeting', require('./routes/budgetTargeting.routes'));
app.use('/api/email', require('./routes/emailTest.routes'));
app.use('/api/letters', require('./routes/letterGenerate.routes'));

/* =========================
   PDF proxy
========================= */
app.post('/api/generate-letter-pdf', async (req, res) => {
  // The PDF renderer lives in the suggestions service, which is a separate
  // process. In local development it is often not running, so fall back to the
  // hosted instance rather than failing the download outright.
  const targets = [
    process.env.SUGGESTIONS_API_URL || 'http://localhost:5170',
    process.env.SUGGESTIONS_FALLBACK_URL || 'https://suggestions.openprocure.ai',
  ].filter((v, i, a) => v && a.indexOf(v) === i);

  const failures = [];

  for (const base of targets) {
    try {
      const upstream = await fetch(`${base}/generate-letter-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      });

      if (!upstream.ok) {
        // A real answer from the service — its error, not a connectivity
        // problem, so don't try the next host.
        const err = await upstream.json().catch(() => ({}));
        return res.status(upstream.status).json(err);
      }

      if (base !== targets[0]) {
        console.warn(`[pdf] ${targets[0]} unreachable — rendered via ${base}`);
      }

      res.setHeader('Content-Type', 'application/pdf');
      const disposition = upstream.headers.get('Content-Disposition');
      if (disposition) res.setHeader('Content-Disposition', disposition);

      const buf = await upstream.arrayBuffer();
      return res.send(Buffer.from(buf));

    } catch (err) {
      failures.push(`${base}: ${err.message}`);
    }
  }

  res.status(502).json({
    error: 'PDF service unavailable',
    message: 'Could not reach the PDF renderer on any configured host.',
    tried: failures,
  });
});

/* =========================
   Health check
========================= */
app.get('/', (req, res) => {
  res.json({
    message: 'Tender Automation Backend Running'
  });
});

/* =========================
   404 handler
========================= */
app.use((req, res) => {
  console.log('404 HIT:', req.method, req.originalUrl);

  res.status(404).json({
    message: 'API route not found'
  });
});

module.exports = app;