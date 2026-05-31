require('dotenv').config({ path: './Backend/.env' });
const db = require('./Backend/src/config/db');

async function check() {
    try {
        const [w] = await db.query('SHOW CREATE TABLE workspaces');
        console.log(w[0]['Create Table']);
        const [we] = await db.query('SHOW CREATE TABLE workspace_employees');
        console.log(we[0]['Create Table']);
        const [u] = await db.query('SHOW CREATE TABLE users');
        console.log(u[0]['Create Table']);
    } catch (e) { console.error(e) }
    process.exit();
}
check();
