const db = require('./src/config/db');

async function createTables() {
    try {
        console.log('Creating DCC table...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS dcc (
              id INT NOT NULL AUTO_INCREMENT,
              contract_no VARCHAR(150) NOT NULL,
              status ENUM('not', 'created', 'verified') DEFAULT 'not',
              email_status ENUM('not sent', 'sent') DEFAULT 'not sent',
              created_by INT DEFAULT NULL,
              verified_by INT DEFAULT NULL,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              verified_at TIMESTAMP NULL DEFAULT NULL,
              PRIMARY KEY (id),
              UNIQUE KEY uk_contract (contract_no)
            );
        `);
        console.log('DCC table created/verified.');

        console.log('Creating Zone Data table...');
        await db.query(`DROP TABLE IF EXISTS zone_data;`);
        // Dropping to ensure clean slate as per user request (though schema.sql had DROP too)

        await db.query(`
            CREATE TABLE IF NOT EXISTS zone_data (
              id int NOT NULL AUTO_INCREMENT,
              name varchar(255) NOT NULL,
              emp_id varchar(50) NOT NULL,
              email_id varchar(191) NOT NULL,
              state enum('Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Andaman and Nicobar Islands','Chandigarh','Dadra and Nagar Haveli and Daman and Diu','Delhi','Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry') NOT NULL,
              zone enum('North','South','East','West') NOT NULL,
              role enum('Leader','FLSP') NOT NULL,
              reporting_to_leader_id int DEFAULT NULL,
              PRIMARY KEY (id),
              UNIQUE KEY uk_emp_id (emp_id),
              KEY fk_reporting_leader (reporting_to_leader_id)
            );
        `);
        console.log('Zone Data table created.');

        console.log('Inserting Zone Data...');
        const values = [
            [1, 'Bhaskar Sekar', 'EMP002-N', 'stevejerald632@gmail.com', 'Tamil Nadu', 'North', 'FLSP', 1],
            [2, 'Sibyll Dominic', 'EMP002-S', 'stevejerald632@gmail.com', 'Tamil Nadu', 'South', 'FLSP', 1],
            [3, 'Sibyll Dominic', 'EMP002-E', 'stevejerald632@gmail.com', 'Tamil Nadu', 'East', 'FLSP', 1],
            [4, 'Sibyll Dominic', 'EMP002-W', 'stevejerald632@gmail.com', 'Tamil Nadu', 'West', 'FLSP', 1]
        ];

        // Using simple insert for now as IDs are hardcoded in user request
        await db.query(`
            INSERT INTO zone_data (id, name, emp_id, email_id, state, zone, role, reporting_to_leader_id) 
            VALUES ? 
            ON DUPLICATE KEY UPDATE name=VALUES(name), email_id=VALUES(email_id), state=VALUES(state), zone=VALUES(zone), role=VALUES(role);
        `, [values]);

        console.log('Zone Data inserted.');
        process.exit(0);
    } catch (error) {
        console.error('Error creating tables:', error);
        process.exit(1);
    }
}

createTables();
