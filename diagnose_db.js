const db = require('./backend/src/config/db');

async function diagnose() {
    try {
        console.log('--- Database Diagnostics ---');

        // 1. Total tenders code
        const [[{ totalPerfect }]] = await db.query('SELECT COUNT(*) as totalPerfect FROM gem_tenders WHERE perfect_cat = 1');
        const [[{ totalOpen }]] = await db.query('SELECT COUNT(*) as totalOpen FROM gem_tenders WHERE perfect_cat = 0');

        // 2. Results table check
        const [[{ totalResults }]] = await db.query('SELECT COUNT(*) as totalResults FROM tender_processing_results WHERE result = "yes"');

        // 3. Combined check (what the query does)
        const [[{ totalOpenQualified }]] = await db.query(`
      SELECT COUNT(*) as totalOpenQualified 
      FROM gem_tenders 
      WHERE perfect_cat = 0 
      AND bid_number IN (SELECT bid_no FROM tender_processing_results WHERE result = "yes")
    `);

        // 4. Sample date formats
        const [dates] = await db.query('SELECT end_date FROM gem_tenders LIMIT 5');

        console.log(`Total Perfect Tenders: ${totalPerfect}`);
        console.log(`Total Non-Perfect Tenders: ${totalOpen}`);
        console.log(`Total 'Yes' Results in processing table: ${totalResults}`);
        console.log(`Total Qualified Open Tenders (Category 0 + 'Yes'): ${totalOpenQualified}`);
        console.log('\nSample end_date formats:');
        dates.forEach(row => console.log(` - ${row.end_date}`));

        process.exit(0);
    } catch (err) {
        console.error('Diagnosis failed:', err);
        process.exit(1);
    }
}

diagnose();
