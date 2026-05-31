// src/routes/orders.routes.js
const express = require('express');
const router = express.Router();
const ordersController = require('../controllers/orders.controller');

// Get orders overview
router.get('/overview', ordersController.getOrdersOverview);

// Get order punching data


// Create/update order
router.post('/', ordersController.createOrder);

// Update order progress status
router.put('/status/:id', ordersController.updateOrderStatus);

// Send OPI to FLSP
router.post('/send-opi/:id', ordersController.sendOpiEmail);

// Punching routes
router.get('/punching', ordersController.getPunchedOrders);
router.put('/punch/:id', ordersController.punchOrder);

module.exports = router;
