const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// ----- Global Middleware -----
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serves uploaded logos/certificates/tax-registration documents (see
// middleware/uploadMiddleware.js and partnerProfileController.js).
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ----- Routes -----
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/partner-profile', require('./routes/partnerProfileRoutes'));
app.use('/api/product-master', require('./routes/productMasterRoutes'));
app.use('/api/tenders', require('./routes/tenderRoutes'));
app.use('/api/analytics', require('./routes/analyticsRoutes'));
app.use('/api/orders', require('./routes/ordersRoutes'));
app.use('/api/library', require('./routes/libraryRoutes'));
app.use('/api/workspace', require('./routes/workspaceRoutes'));
app.use('/api/dealers', require('./routes/dealersRoutes'));
app.use('/api/dealer-requests', require('./routes/dealerAuthRequestRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/reseller-products', require('./routes/resellerProductRoutes'));

// Health check
app.get('/', (req, res) => {
  res.json({ message: 'API is running' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Global error handler (catches Multer errors, thrown errors, etc.)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error'
  });
});

module.exports = app;
