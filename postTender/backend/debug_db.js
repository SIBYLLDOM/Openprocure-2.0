const db = require('./src/config/db');

async function debugOrders() {
    try {
        console.log('Fetching orders_rows...');
        const [rows] = await db.query('SELECT id, contract_no, order_prog_status FROM orders_rows LIMIT 5');
        console.log('Top 5 rows:', JSON.stringify(rows, null, 2));
    } catch (error) {
        console.error('Error fetching orders:', error);
    } finally {
        process.exit();
    }
}

debugOrders();
