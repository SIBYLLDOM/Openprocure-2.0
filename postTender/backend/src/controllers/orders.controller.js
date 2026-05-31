// src/controllers/orders.controller.js
const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { sendOpiGenerationEmail } = require('../utils/email.utils');

// Get orders overview
const getOrdersOverview = async (req, res) => {
    try {
        const [orders] = await db.query(`
            SELECT id, contract_no, contract_date, contract_url, status, order_prog_status AS prog_status 
            FROM orders_rows 
            ORDER BY contract_date DESC
        `);

        res.status(200).json({
            success: true,
            count: orders.length,
            data: orders
        });
    } catch (error) {
        console.error('Error fetching orders overview:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching orders overview',
            error: error.message
        });
    }
};

const updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, opi_generation } = req.body; // 'Accepted' or 'Declined'

        if (!['Accepted', 'Declined'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status. Must be Accepted or Declined.'
            });
        }

        console.log(`Updating order ${id} status to ${status}, opi_generation: ${opi_generation}`);

        // Dynamic query construction
        let query = 'UPDATE orders_rows SET order_prog_status = ?';
        const params = [status];

        if (opi_generation) {
            query += ', opi_generation = ?';
            params.push(opi_generation);
        }

        query += ' WHERE id = ?';
        params.push(id);

        const [result] = await db.query(query, params);

        console.log(`Update result:`, result);

        if (result.affectedRows === 0) {
            console.warn(`Order ${id} not found or no change`);
        }

        res.status(200).json({
            success: true,
            message: `Order marked as ${status}`
        });
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating order status',
            error: error.message
        });
    }
};

// Get order punching data (orders that might need details added)
const getOrderPunching = async (req, res) => {
    try {
        // For now returning pending orders, logic can be refined
        const [orders] = await db.query(`
      SELECT o.*, pt.buying_origin
      FROM orders o
      JOIN participated_tenders pt ON o.bid_no = pt.bid_no
      WHERE o.status = 'Pending'
      ORDER BY o.created_at DESC
    `);

        res.status(200).json({
            success: true,
            count: orders.length,
            data: orders
        });
    } catch (error) {
        console.error('Error fetching order punching data:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching order punching data',
            error: error.message
        });
    }
};

// Create new order
const createOrder = async (req, res) => {
    try {
        const {
            bid_no,
            order_number,
            order_date,
            order_value,
            delivery_date,
            status,
            items_json
        } = req.body;

        const [result] = await db.query(
            `INSERT INTO orders 
       (bid_no, order_number, order_date, order_value, delivery_date, status, items_json) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [bid_no, order_number, order_date, order_value, delivery_date, status || 'Pending', JSON.stringify(items_json)]
        );

        res.status(201).json({
            success: true,
            message: 'Order created successfully',
            data: {
                id: result.insertId,
                order_number
            }
        });
    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating order',
            error: error.message
        });
    }
};

// Send OPI generation link via email to FLSP
const sendOpiEmail = async (req, res) => {
    try {
        const { id } = req.params;
        const { flspEmails, contractNo } = req.body;

        if (!flspEmails || !flspEmails.length) {
            return res.status(400).json({
                success: false,
                message: 'At least one FLSP email is required.'
            });
        }

        console.log(`Sending OPI link for order ${id} (Contract: ${contractNo}) to FLSPs:`, flspEmails);

        // 1. Generate unique token
        const token = uuidv4();

        // 2. Insert into opi_access_tokens
        // By default, pointing to a placeholder path until the FLSP generates and uploads it
        const placeholderPath = `opi_output/OPI_${contractNo.replace(/[^a-zA-Z0-9]/g, '_')}.json`;

        await db.query(`
            INSERT INTO opi_access_tokens (token, contract_no, opi_file_path, status, created_at, expires_at)
            VALUES (?, ?, ?, 'Active', NOW(), DATE_ADD(NOW(), INTERVAL 7 DAY))
        `, [token, contractNo, placeholderPath]);

        // 3. Update orders_rows
        await db.query(`
            UPDATE orders_rows 
            SET order_prog_status = 'Accepted', 
                opi_generation = 'pending for creation',
                flsp_email = ?
            WHERE id = ?
        `, [flspEmails.join(','), id]);

        // 4. Send Email to the primary chosen FLSP (or all of them)
        // For simplicity, sending to the first one or broadcasting. Let's send to all listed via comma separated string.
        const targetEmail = flspEmails.join(',');
        await sendOpiGenerationEmail(targetEmail, contractNo, token);

        res.status(200).json({
            success: true,
            message: 'OPI link sent successfully and Order Accepted'
        });

    } catch (error) {
        console.error('Error sending OPI email:', error);
        res.status(500).json({
            success: false,
            message: 'Error sending OPI email',
            error: error.message
        });
    }
};
// Get orders for punching (Accepted status)
const getPunchedOrders = async (req, res) => {
    try {
        console.log('Fetching punched orders (status=Accepted)...');
        const [orders] = await db.query(`
            SELECT o.*, u.name as punched_by_name 
            FROM orders_rows o
            LEFT JOIN users u ON o.punched_by = u.id
            WHERE o.opi_generation = 'verified'
            ORDER BY o.contract_date DESC
        `);
        console.log(`Found ${orders.length} orders.`);

        res.status(200).json({
            success: true,
            count: orders.length,
            data: orders
        });
    } catch (error) {
        console.error('Error fetching punching orders:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching punching orders',
            error: error.message
        });
    }
};

// Update order punching details
const punchOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const { sap_order_no, punched_by, punched_date, remarks } = req.body;

        if (!sap_order_no) {
            return res.status(400).json({
                success: false,
                message: 'SAP Order Number is required'
            });
        }

        await db.query(`
            UPDATE orders_rows 
            SET sap_order_no = ?,
            punched_by = ?,
            punched_date = ?
                WHERE id = ?
                    `, [sap_order_no, punched_by, punched_date, id]);

        res.status(200).json({
            success: true,
            message: 'Order punched successfully'
        });
    } catch (error) {
        console.error('Error punching order:', error);
        res.status(500).json({
            success: false,
            message: 'Error punching order',
            error: error.message
        });
    }
};

module.exports = {
    getOrdersOverview,
    getOrderPunching, // Legacy? Maybe rename/remove if unused later
    createOrder,
    updateOrderStatus,
    sendOpiEmail,
    getPunchedOrders,
    punchOrder
};
