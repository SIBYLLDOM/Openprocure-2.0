const db = require('../config/db');
const EmailFetcherService = require('../services/emailFetcher.service');
const EmailClassifierService = require('../services/emailClassifier.service');
const EmailExtractorService = require('../services/emailExtractor.service');

const emailFetcher = new EmailFetcherService();
const emailClassifier = new EmailClassifierService();
const emailExtractor = new EmailExtractorService();

/**
 * Process new emails - fetch, classify, extract, and store
 */
const processNewEmails = async (req, res) => {
    const startTime = Date.now();

    try {
        console.log('🔄 Starting email processing...');

        // 1. Fetch unread emails
        const emails = await emailFetcher.fetchUnreadEmails();

        if (emails.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No new emails to process',
                processed: 0
            });
        }

        const results = {
            total: emails.length,
            processed: 0,
            failed: 0,
            manualReview: 0,
            details: []
        };

        // 2. Process each email
        for (const email of emails) {
            try {
                const result = await processEmail(email);
                results.details.push(result);

                if (result.status === 'Success') results.processed++;
                else if (result.status === 'Manual Review') results.manualReview++;
                else results.failed++;

            } catch (error) {
                console.error(`Error processing email ${email.email_id}:`, error);
                results.failed++;
            }
        }

        const processingTime = Date.now() - startTime;
        console.log(`✅ Email processing complete in ${processingTime}ms`);

        res.status(200).json({
            success: true,
            message: 'Email processing complete',
            results,
            processingTime
        });

    } catch (error) {
        console.error('Error in processNewEmails:', error);
        res.status(500).json({
            success: false,
            message: 'Email processing failed',
            error: error.message
        });
    }
};

/**
 * Process a single email
 */
async function processEmail(emailData) {
    const startTime = Date.now();

    try {
        // 1. Check if email already exists
        const [existing] = await db.query(
            'SELECT id FROM email_archive WHERE email_id = ?',
            [emailData.email_id]
        );

        if (existing.length > 0) {
            console.log(`Email ${emailData.email_id} already processed`);
            return { email_id: emailData.email_id, status: 'Duplicate', category: null };
        }

        // 2. Classify email
        const classification = await emailClassifier.classifyEmail(emailData);
        const { category, confidence, reasoning } = classification;

        console.log(`📧 Email classified as: ${category} (confidence: ${confidence})`);

        // 3. Extract data based on category
        let extractedData = {};
        if (emailClassifier.isHighConfidence(confidence)) {
            extractedData = await emailExtractor.extractData(emailData, category);
        }

        // 4. Store email in archive
        await db.query(`
            INSERT INTO email_archive 
            (email_id, from_email, to_email, subject, body_text, body_html, received_date, category, processed, extracted_data, confidence_score)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            emailData.email_id,
            emailData.from_email,
            emailData.to_email,
            emailData.subject,
            emailData.body_text,
            emailData.body_html,
            emailData.received_date,
            category,
            emailClassifier.isHighConfidence(confidence) ? 1 : 0,
            JSON.stringify(extractedData),
            confidence
        ]);

        // 5. Store attachments
        for (const attachment of emailData.attachments) {
            await db.query(`
                INSERT INTO email_attachments (email_id, filename, file_path, file_size, mime_type)
                VALUES (?, ?, ?, ?, ?)
            `, [emailData.email_id, attachment.filename, attachment.file_path, attachment.file_size, attachment.mime_type]);
        }

        // 6. Insert into appropriate table if high confidence
        let insertStatus = 'Pending';
        if (emailClassifier.isHighConfidence(confidence)) {
            insertStatus = await insertIntoTable(category, extractedData, emailData);
        } else {
            insertStatus = 'Manual Review';
        }

        // 7. Log processing
        const processingTime = Date.now() - startTime;
        await db.query(`
            INSERT INTO email_processing_log (email_id, category, status, processing_time_ms)
            VALUES (?, ?, ?, ?)
        `, [emailData.email_id, category, insertStatus, processingTime]);

        // 8. Mark as read in IMAP
        if (emailData.imap_uid) {
            try {
                // Background task to mark read so it doesn't block
                emailFetcher.markAsRead(emailData.imap_uid).catch(err =>
                    console.error(`Failed to mark UID ${emailData.imap_uid} as read:`, err)
                );
            } catch (imapErr) {
                console.error(`Error initiating mark as read:`, imapErr);
            }
        }

        return {
            email_id: emailData.email_id,
            category,
            confidence,
            status: insertStatus,
            processingTime
        };

    } catch (error) {
        console.error('Error processing email:', error);

        // Log error
        await db.query(`
            INSERT INTO email_processing_log (email_id, category, status, error_message)
            VALUES (?, ?, ?, ?)
        `, [emailData.email_id, 'Unknown', 'Failed', error.message]);

        // 8. Mark as read in IMAP even if failed so we don't infinitely retry
        if (emailData.imap_uid) {
            try {
                emailFetcher.markAsRead(emailData.imap_uid).catch(err =>
                    console.error(`Failed to mark failed UID ${emailData.imap_uid} as read:`, err)
                );
            } catch (imapErr) {
                // Ignore
            }
        }

        return {
            email_id: emailData.email_id,
            status: 'Failed',
            error: error.message
        };
    }
}

/**
 * Insert extracted data into appropriate table
 */
async function insertIntoTable(category, data, emailData) {
    try {
        switch (category) {
            case 'TenderWon':
                await insertTenderWon(data);
                break;
            case 'Order':
                await insertOrder(data, emailData);
                break;
            case 'EMD':
                await insertEMD(data);
                break;
            case 'PBG':
                await insertPBG(data, emailData);
                break;
            case 'NABL':
                await insertNABL(data, emailData);
                break;
            case 'LOA':
                await insertLOA(data, emailData);
                break;
            case 'DCC':
                await insertDCC(data);
                break;
            case 'COA':
                await insertCOA(data, emailData);
                break;
            default:
                return 'Manual Review';
        }
        return 'Success';
    } catch (error) {
        console.error(`Error inserting ${category} data:`, error);
        return 'Failed';
    }
}

/**
 * Insert Tender Won data
 */
async function insertTenderWon(data) {
    if (!data.bid_no) throw new Error('Missing bid_no');

    await db.query(`
        INSERT INTO participated_tenders (bid_no, won_status, won_date, buying_mode, buying_origin, emd_amt)
        VALUES (?, 'Won', ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE won_status = 'Won', won_date = VALUES(won_date)
    `, [data.bid_no, data.won_date, data.buying_mode || 'Direct', data.buying_origin || 'GEM', data.emd_amt]);
}

/**
 * Insert Order data
 */
async function insertOrder(data, emailData) {
    // Use order_number or bid_no as contract_no
    const contractNo = data.order_number || data.bid_no || `ORDER_${Date.now()}`;

    console.log(`📦 Inserting Order into orders_rows: ${contractNo}`, data);

    await db.query(`
        INSERT INTO orders_rows (contract_no, contract_date, total_order_value, status, contract_json, order_prog_status)
        VALUES (?, ?, ?, 'In Progress', ?, 'Accepted')
        ON DUPLICATE KEY UPDATE 
            contract_date = VALUES(contract_date), 
            total_order_value = VALUES(total_order_value),
            contract_json = VALUES(contract_json)
    `, [
        contractNo,
        data.order_date,
        data.order_value,
        JSON.stringify(data)
    ]);

    console.log(`✅ Successfully inserted Order into orders_rows: ${contractNo}`);
}

/**
 * Insert EMD data
 */
async function insertEMD(data) {
    if (!data.bid_no) throw new Error('Missing bid_no');

    await db.query(`
        INSERT INTO emd_received (bid_no, emd_amt, submitted_date, bank_detail, emd_status)
        VALUES (?, ?, ?, ?, 'Submitted')
    `, [data.bid_no, data.emd_amt, data.submitted_date, data.bank_detail]);

    // Also update participated_tenders table
    await db.query(`
        UPDATE participated_tenders 
        SET emd_status = 'Received' 
        WHERE bid_no = ?
    `, [data.bid_no]);

    console.log('✅ Inserted EMD data and updated status for bid:', data.bid_no);
}

/**
 * Insert PBG data
 */
async function insertPBG(data, emailData) {
    if (!data.bid_no) {
        console.warn('⚠️ Missing bid_no for PBG, skipping insertion');
        throw new Error('Missing required field: bid_no');
    }

    // Find PDF attachment if available
    let documentPath = null;
    if (emailData && emailData.attachments && emailData.attachments.length > 0) {
        const pbgAttachment = emailData.attachments.find(att =>
            att.mime_type === 'application/pdf' ||
            att.filename.toLowerCase().includes('pbg') ||
            att.filename.toLowerCase().includes('bank')
        );

        if (pbgAttachment) {
            // Store relative path for database
            documentPath = pbgAttachment.file_path; // This is absolute path, might want relative
            // Convert to relative path if needed, or store absolute. 
            // Better to store relative path from uploads directory
            const relativePath = pbgAttachment.file_path.split('uploads')[1];
            if (relativePath) {
                documentPath = 'uploads' + relativePath.replace(/\\/g, '/');
            }
        }
    }

    await db.query(`
        INSERT INTO pbg_records (bid_no, pbg_amount, issue_date, expiry_date, bank_name, reference_number, status, document_path)
        VALUES (?, ?, ?, ?, ?, ?, 'Active', ?)
    `, [data.bid_no, data.pbg_amount, data.issue_date, data.expiry_date, data.bank_name, data.reference_number, documentPath]);
    console.log('✅ Inserted PBG data for bid:', data.bid_no, 'with document:', documentPath);
}

/**
 * Insert NABL data
 */
async function insertNABL(data, emailData) {
    let contractNo = data.contract_no || data.order_id;

    if (!contractNo) {
        console.warn('⚠️ Missing contract_no for NABL. Using fallback ID.');
        contractNo = `UNKNOWN_NABL_${Date.now()}`;
    }

    // Find Attachment
    let documentPath = null;
    let fileName = null;

    if (emailData && emailData.attachments && emailData.attachments.length > 0) {
        // Log all attachments for debugging
        console.log(`📎 Checking ${emailData.attachments.length} attachments for NABL file for ${contractNo}`);
        emailData.attachments.forEach(a => console.log(`   - ${a.filename} (${a.mime_type})`));

        // Priority 1: PDF/image explicitly named nabl/cert
        // Priority 2: Any PDF or image
        // Priority 3: Excel/Office files (xlsx, xls) — labs often send xlsx reports
        // Priority 4: Fallback to the first attachment in the email
        const att =
            emailData.attachments.find(a =>
                (a.mime_type === 'application/pdf' || a.mime_type.startsWith('image/')) &&
                (a.filename.toLowerCase().includes('nabl') || a.filename.toLowerCase().includes('cert'))
            ) ||
            emailData.attachments.find(a =>
                a.mime_type === 'application/pdf' || a.mime_type.startsWith('image/')
            ) ||
            emailData.attachments.find(a =>
                a.mime_type.includes('spreadsheet') ||
                a.mime_type.includes('excel') ||
                a.filename.toLowerCase().endsWith('.xlsx') ||
                a.filename.toLowerCase().endsWith('.xls')
            ) ||
            emailData.attachments[0]; // last-resort: take whatever is there

        if (att) {
            console.log(`✅ Found NABL attachment: ${att.filename} (${att.mime_type})`);
            documentPath = att.file_path.split('uploads')[1] ? 'uploads' + att.file_path.split('uploads')[1].replace(/\\/g, '/') : att.file_path;
            fileName = att.filename;
        } else {
            console.warn(`⚠️ No attachments available for NABL`);
        }
    } else {
        console.warn(`⚠️ No attachments in email for NABL`);
    }

    const fileData = documentPath ? JSON.stringify({ file_path: documentPath, file_name: fileName, uploaded_at: new Date() }) : null;

    // Upsert into coa_certificate
    await db.query(`
        INSERT INTO coa_certificate (contract_no, nabl_certificate, status, lab_status)
        VALUES (?, ?, 'onprocess', 'NABL Received')
        ON DUPLICATE KEY UPDATE 
            nabl_certificate = VALUES(nabl_certificate),
            lab_status = 'NABL Received'
    `, [contractNo, fileData]);

    console.log('✅ Inserted NABL data for contract:', contractNo);
}

/**
 * Insert LOA data
 */
async function insertLOA(data, emailData) {
    if (!data.bid_no) {
        console.warn('⚠️ Missing bid_no for LOA, skipping update');
        // We can't update participated_tenders without bid_no. 
        // Maybe we ought to logging it or fallback to manual review?
        // For now, let's just log it.
        return;
    }

    // Find Attachment
    let documentPath = null;
    if (emailData && emailData.attachments && emailData.attachments.length > 0) {
        // Log attachments
        console.log(`📎 Checking ${emailData.attachments.length} attachments for LOA file for ${data.bid_no}`);

        const att = emailData.attachments.find(a =>
            a.mime_type === 'application/pdf' ||
            a.mime_type.startsWith('image/') ||
            a.filename.toLowerCase().includes('loa') ||
            a.filename.toLowerCase().includes('loi') ||
            a.filename.toLowerCase().includes('acceptance') ||
            a.filename.toLowerCase().includes('intent')
        );

        if (att) {
            console.log(`✅ Found LOA attachment: ${att.filename}`);
            documentPath = att.file_path.split('uploads')[1] ? 'uploads' + att.file_path.split('uploads')[1].replace(/\\/g, '/') : att.file_path;
        }
    }

    // Update participated_tenders
    await db.query(`
        UPDATE participated_tenders 
        SET loa_status = 'Received', 
            loa_file_path = ? 
        WHERE bid_no = ?
    `, [documentPath || '', data.bid_no]);

    console.log(`✅ Updated LOA status for bid: ${data.bid_no}`);
}

/**
 * Insert COA data
 */
async function insertCOA(data, emailData) {
    let contractNo = data.contract_no;

    if (!contractNo) {
        console.warn('⚠️ Missing contract_no for COA. Using fallback ID.');
        contractNo = `UNKNOWN_COA_${Date.now()}`;
    }

    // Find Attachment
    let documentPath = null;
    let fileName = null;
    if (emailData && emailData.attachments && emailData.attachments.length > 0) {
        const att = emailData.attachments.find(a =>
            a.mime_type === 'application/pdf' ||
            a.filename.toLowerCase().includes('coa') ||
            a.filename.toLowerCase().includes('analysis')
        );
        if (att) {
            documentPath = att.file_path.split('uploads')[1] ? 'uploads' + att.file_path.split('uploads')[1].replace(/\\/g, '/') : att.file_path;
            fileName = att.filename;
        }
    }

    const fileData = documentPath ? JSON.stringify({ file_path: documentPath, file_name: fileName, uploaded_at: new Date() }) : null;

    // Upsert into coa_certificate
    await db.query(`
        INSERT INTO coa_certificate (contract_no, coa_file, status)
        VALUES (?, ?, 'onprocess')
        ON DUPLICATE KEY UPDATE coa_file = VALUES(coa_file)
    `, [data.contract_no, fileData]);

    console.log('✅ Inserted COA data for contract:', data.contract_no);
}

/**
 * Insert DCC data
 */
async function insertDCC(data) {
    // DCC insertion logic
    console.log('DCC data received:', data);
}

/**
 * Get all archived emails
 */
const getArchivedEmails = async (req, res) => {
    try {
        const { category, processed } = req.query;

        let query = 'SELECT * FROM email_archive';
        const conditions = [];
        const params = [];

        if (category) {
            conditions.push('category = ?');
            params.push(category);
        }

        if (processed !== undefined) {
            conditions.push('processed = ?');
            params.push(processed === 'true' ? 1 : 0);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY received_date DESC LIMIT 100';

        const [emails] = await db.query(query, params);

        res.status(200).json({
            success: true,
            data: emails
        });
    } catch (error) {
        console.error('Error fetching emails:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch emails',
            error: error.message
        });
    }
};

/**
 * Get processing logs
 */
const getProcessingLogs = async (req, res) => {
    try {
        const [logs] = await db.query(`
            SELECT * FROM email_processing_log 
            ORDER BY processed_at DESC 
            LIMIT 100
        `);

        res.status(200).json({
            success: true,
            data: logs
        });
    } catch (error) {
        console.error('Error fetching logs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch logs',
            error: error.message
        });
    }
};

module.exports = {
    processNewEmails,
    getArchivedEmails,
    getProcessingLogs
};
