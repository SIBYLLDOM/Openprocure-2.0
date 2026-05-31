const Imap = require('node-imap');
const { simpleParser } = require('mailparser');
const fs = require('fs');
const path = require('path');

class EmailFetcherService {
    constructor() {
        this.config = {
            user: process.env.EMAIL_USER,
            password: process.env.EMAIL_PASSWORD,
            host: process.env.EMAIL_HOST || 'imap.gmail.com',
            port: process.env.EMAIL_PORT || 993,
            tls: true,
            tlsOptions: { rejectUnauthorized: false },
            authTimeout: 10000,
            connTimeout: 30000
        };

        this.attachmentsDir = path.join(__dirname, '../../uploads/email_attachments');
        if (!fs.existsSync(this.attachmentsDir)) {
            fs.mkdirSync(this.attachmentsDir, { recursive: true });
        }
    }

    /**
     * Fetch unread emails from inbox with retry logic
     * @returns {Promise<Array>} Array of parsed email objects
     */
    async fetchUnreadEmails() {
        const MAX_RETRIES = 3;
        let attempt = 0;

        while (attempt < MAX_RETRIES) {
            try {
                attempt++;
                console.log(`📧 Attempt ${attempt}/${MAX_RETRIES} to fetch emails...`);

                const emails = await this._fetchEmailsWithTimeout();
                console.log(`✅ Successfully fetched ${emails.length} emails`);
                return emails;

            } catch (error) {
                console.error(`❌ Attempt ${attempt} failed:`, error.message);

                if (attempt < MAX_RETRIES) {
                    const delayMs = 2000 * attempt; // Exponential backoff
                    console.log(`⏳ Retrying in ${delayMs}ms...`);
                    await this._delay(delayMs);
                } else {
                    console.error('🚫 Max retries reached. Giving up.');
                    throw new Error(`Failed to fetch emails after ${MAX_RETRIES} attempts: ${error.message}`);
                }
            }
        }

        return [];
    }

    /**
     * Fetch emails with timeout protection
     * @private
     */
    async _fetchEmailsWithTimeout() {
        return new Promise((resolve, reject) => {
            const emails = [];
            const parsingPromises = [];
            let imap = null;
            let connectionClosed = false;
            let timeoutId = null;

            // Overall timeout for the entire operation
            const OVERALL_TIMEOUT = 60000; // 60 seconds

            const cleanup = () => {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
                if (imap && !connectionClosed) {
                    connectionClosed = true;
                    try {
                        imap.end();
                    } catch (e) {
                        // Ignore cleanup errors
                    }
                }
            };

            // Set overall timeout
            timeoutId = setTimeout(() => {
                console.error('⏱️ IMAP operation timed out');
                cleanup();
                reject(new Error('IMAP operation timed out'));
            }, OVERALL_TIMEOUT);

            try {
                imap = new Imap(this.config);

                imap.once('ready', () => {
                    console.log('📬 IMAP connection ready');

                    imap.openBox('INBOX', false, (err, box) => {
                        if (err) {
                            cleanup();
                            reject(err);
                            return;
                        }

                        console.log(`📨 Opened INBOX with ${box.messages.total} total messages`);

                        // Search for unseen emails
                        imap.search(['UNSEEN'], (err, results) => {
                            if (err) {
                                cleanup();
                                reject(err);
                                return;
                            }

                            if (!results || results.length === 0) {
                                console.log('📭 No unread emails found');
                                cleanup();
                                resolve([]);
                                return;
                            }

                            console.log(`📬 Found ${results.length} unread emails`);

                            const fetch = imap.fetch(results, { bodies: '', markSeen: false });

                            fetch.on('message', (msg, seqno) => {
                                let buffer = '';
                                let uid = null;

                                msg.once('attributes', (attrs) => {
                                    uid = attrs.uid;
                                });

                                msg.on('body', (stream, info) => {
                                    stream.on('data', (chunk) => {
                                        buffer += chunk.toString('utf8');
                                    });

                                    stream.once('end', () => {
                                        const parsingPromise = (async () => {
                                            try {
                                                const parsed = await simpleParser(buffer);
                                                parsed.imapUid = uid;
                                                const emailData = await this.parseEmail(parsed, seqno);
                                                emails.push(emailData);
                                                console.log(`✉️ Parsed email ${seqno}: ${emailData.subject}`);
                                            } catch (error) {
                                                console.error(`❌ Error parsing email ${seqno}:`, error.message);
                                            }
                                        })();
                                        parsingPromises.push(parsingPromise);
                                    });
                                });

                                msg.once('error', (err) => {
                                    console.error(`Error on message ${seqno}:`, err);
                                });
                            });

                            fetch.once('error', (err) => {
                                console.error('❌ Fetch error:', err);
                                cleanup();
                                reject(err);
                            });

                            fetch.once('end', () => {
                                console.log('📨 Fetch completed, waiting for parsing...');
                                // Wait for all parsing to complete
                                Promise.all(parsingPromises)
                                    .then(() => {
                                        console.log(`✅ All ${emails.length} emails parsed successfully`);
                                        cleanup();
                                        resolve(emails);
                                    })
                                    .catch(err => {
                                        console.error('❌ Error in parsing promises:', err);
                                        cleanup();
                                        reject(err);
                                    });
                            });
                        });
                    });
                });

                imap.once('error', (err) => {
                    console.error('❌ IMAP connection error:', err.message);
                    cleanup();
                    reject(err);
                });

                imap.once('end', () => {
                    console.log('🔌 IMAP connection ended');
                    if (!connectionClosed) {
                        connectionClosed = true;
                        // Only resolve if we haven't already resolved/rejected
                        if (timeoutId) {
                            resolve(emails);
                        }
                    }
                });

                imap.once('close', () => {
                    console.log('🔒 IMAP connection closed');
                });

                console.log('🔌 Connecting to IMAP server...');
                imap.connect();

            } catch (error) {
                cleanup();
                reject(error);
            }
        });
    }

    /**
     * Delay helper for retry logic
     * @private
     */
    async _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Parse email object
     * @param {Object} parsed - Parsed email from mailparser
     * @param {Number} seqno - Sequence number
     * @returns {Object} Formatted email data
     */
    async parseEmail(parsed, seqno) {
        const emailData = {
            email_id: parsed.messageId || `email_${Date.now()}_${seqno}`,
            from_email: parsed.from?.text || '',
            to_email: parsed.to?.text || '',
            subject: parsed.subject || '',
            body_text: parsed.text || '',
            body_html: parsed.html || '',
            received_date: parsed.date || new Date(),
            imap_uid: parsed.imapUid,
            attachments: []
        };

        // Handle attachments
        if (parsed.attachments && parsed.attachments.length > 0) {
            for (const attachment of parsed.attachments) {
                const attachmentData = await this.saveAttachment(attachment, emailData.email_id);
                emailData.attachments.push(attachmentData);
            }
        }

        return emailData;
    }

    /**
     * Save email attachment to disk
     * @param {Object} attachment - Attachment object
     * @param {String} emailId - Email ID
     * @returns {Object} Attachment metadata
     */
    async saveAttachment(attachment, emailId) {
        const filename = attachment.filename || `attachment_${Date.now()}`;
        const sanitizedEmailId = emailId.replace(/[<>:"/\\|?*]/g, '_');
        const filePath = path.join(this.attachmentsDir, `${sanitizedEmailId}_${filename}`);

        // Save file
        fs.writeFileSync(filePath, attachment.content);

        return {
            filename: filename,
            file_path: filePath,
            file_size: attachment.size,
            mime_type: attachment.contentType
        };
    }

    /**
     * Mark email as read by UID
     * @param {Number} uid - Email IMAP UID to mark as read
     */
    async markAsRead(uid) {
        if (!uid) return;
        return new Promise((resolve, reject) => {
            const imap = new Imap(this.config);
            imap.once('ready', () => {
                imap.openBox('INBOX', false, (err, box) => {
                    if (err) {
                        imap.end();
                        reject(err);
                        return;
                    }
                    imap.addFlags(uid, ['\\Seen'], (err) => {
                        if (err) {
                            console.error(`❌ Error marking UID ${uid} as read:`, err);
                            imap.end();
                            reject(err);
                        } else {
                            console.log(`✅ Marked UID ${uid} as read`);
                            imap.end();
                            resolve(true);
                        }
                    });
                });
            });
            imap.once('error', (err) => {
                reject(err);
            });
            imap.connect();
        });
    }
}

module.exports = EmailFetcherService;
