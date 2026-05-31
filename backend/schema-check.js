require('dotenv').config();
const db = require('./src/config/db');
const fs = require('fs');

async function check() {
    try {
        let out = '';
        const [w] = await db.query('SHOW CREATE TABLE workspaces');
        out += w[0]['Create Table'] + '\n\n';
        const [we] = await db.query('SHOW CREATE TABLE workspace_employees');
        out += we[0]['Create Table'] + '\n\n';
        const [u] = await db.query('SHOW CREATE TABLE users');
        out += u[0]['Create Table'] + '\n\n';
        fs.writeFileSync('schema-out.txt', out);
    } catch (e) { console.error(e) }
    process.exit();
}
check();
