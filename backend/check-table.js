require('dotenv').config();
const db = require('./src/config/db');
db.query('SHOW TABLES LIKE "workdesk_documents"')
    .then(([r]) => { console.log(r.length ? 'Table EXISTS' : 'NOT FOUND'); process.exit(); })
    .catch(e => { console.error(e); process.exit(1); });
