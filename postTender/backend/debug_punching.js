const db = require('./src/config/db');

async function debugPunching() {
    try {
        console.log('--- Debugging Punching Orders ---');

        // 1. Check distinct statuses
        console.log('\n1. Checking distinct order_prog_status values:');
        const [statuses] = await db.query('SELECT DISTINCT order_prog_status FROM orders_rows');
        console.log(statuses);

        // 2. Check for "Accepted" specifically (checking length/whitespace)
        console.log('\n2. Inspecting "Accepted" rows (showing id, status, length):');
        const [rows] = await db.query(`
            SELECT id, order_prog_status, CHAR_LENGTH(order_prog_status) as len, HEX(order_prog_status) as hex 
            FROM orders_rows 
            WHERE order_prog_status LIKE '%Accepted%'
        `);
        console.log(rows);

        // 3. Run the exact controller query
        console.log('\n3. Running Controller Query:');
        const [controllerResult] = await db.query(`
            SELECT * FROM orders_rows 
            WHERE order_prog_status = 'Accepted'
        `);
        console.log(`Count: ${controllerResult.length}`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit();
    }
}

debugPunching();
