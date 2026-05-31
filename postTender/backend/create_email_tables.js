const mysql = require('mysql2/promise');
require('dotenv').config();

async function createEmailTables() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        console.log('✅ Connected to database');

        // Create email_archive table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS email_archive (
    id INT AUTO_INCREMENT PRIMARY KEY,

    email_id VARCHAR(191) NOT NULL,
    from_email VARCHAR(255),
    to_email VARCHAR(255),

    subject TEXT,
    body_text LONGTEXT,
    body_html LONGTEXT,

    received_date DATETIME,
    category VARCHAR(50) DEFAULT 'Other',
    processed BOOLEAN DEFAULT 0,

    extracted_data JSON,
    confidence_score DECIMAL(3,2),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uk_email_id (email_id),
    INDEX idx_category (category),
    INDEX idx_processed (processed),
    INDEX idx_received_date (received_date)
);

        `);
        console.log('✅ email_archive table created');

        // Create email_processing_log table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS email_processing_log (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email_id VARCHAR(255),
                category VARCHAR(50),
                status VARCHAR(50) DEFAULT 'Pending',
                error_message TEXT,
                processing_time_ms INT,
                processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (email_id) REFERENCES email_archive(email_id) ON DELETE CASCADE,
                INDEX idx_status (status),
                INDEX idx_processed_at (processed_at)
            )
        `);
        console.log('✅ email_processing_log table created');

        // Create email_attachments table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS email_attachments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email_id VARCHAR(255),
                filename VARCHAR(255),
                file_path VARCHAR(500),
                file_size INT,
                mime_type VARCHAR(100),
                extracted_text LONGTEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (email_id) REFERENCES email_archive(email_id) ON DELETE CASCADE,
                INDEX idx_email_id (email_id)
            )
        `);
        console.log('✅ email_attachments table created');

        console.log('\n🎉 All email automation tables created successfully!');

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
            console.log('✅ Database connection closed');
        }
    }
}

createEmailTables();
