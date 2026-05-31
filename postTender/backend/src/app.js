// src/app.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const cron = require('node-cron');
const { sendEMDRequests } = require('../scripts/request_emd');

require('./config/db');

const app = express();

/* =========================
   Middleware
========================= */
const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : ['http://localhost:5173'];

app.use(cors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(helmet());
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

/* =========================
   Routes
========================= */
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/participated-tenders', require('./routes/participatedTenders.routes'));
app.use('/api/emd-received', require('./routes/emdReceived.routes'));
app.use('/api/pbg', require('./routes/pbg.routes'));
app.use('/api/orders', require('./routes/orders.routes'));
app.use('/api/logistics', require('./routes/logistics.routes'));

// PBG Generation Routes (from frontend requirements)
app.use('/api/pbg-generation', require('./routes/pbgGeneration.routes'));

// PBG Upload Routes
app.use('/api/pbg-upload', require('./routes/pbgUpload.routes'));
app.use('/api/pbg-overview', require('./routes/pbgOverview.routes'));

// OPI Verification Routes
app.use('/api/opi', require('./routes/opi.routes'));

// Planning Team Routes
app.use('/api/planning', require('./routes/planning.routes'));

// QC Routes
app.use('/api/qc', require('./routes/qc.routes'));

// Agreement Generation Routes
app.use('/api/agreement', require('./routes/agreement.routes'));

// Email Automation Routes
app.use('/api/email', require('./routes/emailProcessor.routes'));

// Pre-Bid Routes for Edit Modal
app.use('/api/prebid', require('./routes/prebid.routes'));

/* =========================
   Health check
========================= */
app.get('/', (req, res) => {
    res.json({
        message: 'Post-Tender Management Backend Running',
        version: '1.0.0',
        status: 'healthy'
    });
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString()
    });
});

/* =========================
   404 handler
========================= */
app.use((req, res) => {
    res.status(404).json({ message: 'API route not found' });
});

/* =========================
   Error handler
========================= */
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        message: err.message || 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
});

/* =========================
   Cron Jobs
========================= */
// Run daily at 9:00 AM Server Time
cron.schedule('0 9 * * *', async () => {
    console.log('[CRON] Starting daily EMD Request job (9:00 AM)');
    try {
        await sendEMDRequests();
        console.log('[CRON] Daily EMD Request job finished successfully.');
    } catch (err) {
        console.error('[CRON] EMD Request job failed:', err);
    }
});

module.exports = app;
