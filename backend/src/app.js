// src/app.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

require('./config/db');

const app = express();

/* =========================
   Middleware
========================= */
app.use(cors({
  origin: [
    'https://openprocure.ai',
    'https://post-tender.openprocure.ai',
    'http://localhost:5000',
    'http://localhost:5173',   // Vite dev server
    'http://localhost:5163'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
   Routes
========================= */
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/test', require('./routes/test.routes'));

// Tenders
app.use('/api/tenders', require('./routes/tenders.routes'));
app.use('/api/tender-status', require('./routes/tenderStatus.routes'));
app.use('/api/tender-interest', require('./routes/tenderInterest.routes'));

// Workspaces & utils
app.use('/api/workspaces', require('./routes/workspace.routes'));
app.use('/api/workdesk-docs', require('./routes/workdeskDocuments.routes'));
app.use('/api/utils', require('./routes/utils.routes'));
app.use('/api/incidents', require('./routes/incidents.routes'));
app.use('/api/incidents', require('./routes/incidents.routes'));
app.use('/api/contracts', require('./routes/contracts.routes'));
app.use('/api/carting', require('./routes/carting.routes'));
app.use('/api/pricing', require('./routes/pricing.routes'));
app.use('/api/prebid', require('./routes/prebid.routes'));

// Serve uploaded files statically (so frontend can preview/download)
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// GeM Bids ✅
app.use('/api/gem-bids', require('./routes/gemBids.routes'));
app.use('/api/competitors', require('./routes/competitor.routes'));
app.use('/api/admin', require('./routes/admin.routes'));

/* =========================
   Health check
========================= */
app.get('/', (req, res) => {
  res.json({ message: 'Tender Automation Backend Running' });
});

/* =========================
   404 handler (IMPORTANT)
========================= */
app.use((req, res) => {
  res.status(404).json({ message: 'API route not found' });
});

module.exports = app;
