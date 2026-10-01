const db = require('./src/config/db');
(async () => {
  const [cols] = await db.query(`
    SELECT COLUMN_NAME, DATA_TYPE, COLLATION_NAME FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name IN ('open_tender_details','tender_tracker_overrides')
      AND COLUMN_NAME IN ('tender_id','tender_refno','tender_no')
  `);
  console.log(cols);

  const [statusVals] = await db.query(`SELECT DISTINCT status FROM tender_tracker WHERE status IS NOT NULL`);
  console.log('tender_tracker.status distinct:', statusVals.map(r=>r.status));
  const [remarksVals] = await db.query(`SELECT DISTINCT remarks FROM tender_tracker WHERE remarks IS NOT NULL`);
  console.log('tender_tracker.remarks distinct:', remarksVals.map(r=>r.remarks));

  const [existing] = await db.query(`
    SELECT COLUMN_NAME FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'tender_tracker_overrides' AND COLUMN_NAME = 'state'
  `);
  if (existing.length === 0) {
    await db.query(`ALTER TABLE tender_tracker_overrides ADD COLUMN state VARCHAR(100) DEFAULT NULL AFTER source`);
    console.log('added state column to tender_tracker_overrides');
  } else {
    console.log('state column already exists, skipping');
  }

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
