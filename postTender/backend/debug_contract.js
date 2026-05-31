const db = require('./src/config/db');

async function debugContract() {
    try {
        const contractNo = 'GEMC-511687775908866';
        console.log(`Fetching record for ${contractNo}...`);
        const [rows] = await db.query(`
            SELECT id, contract_no, order_prog_status 
            FROM orders_rows 
            WHERE contract_no = ?`, [contractNo]);

        console.log('Record:', JSON.stringify(rows[0], null, 2));

        // Check exact keys
        if (rows.length > 0) {
            console.log('Keys:', Object.keys(rows[0]));
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit();
    }
}

debugContract();
