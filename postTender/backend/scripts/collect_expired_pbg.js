/**
 * Expired PBG Collection Notification Script
 * Detects expired PBGs, determines zone using GPT, and notifies zone contacts to collect documents
 */

const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const path = require('path');
const OpenAI = require('openai');

dotenv.config({ path: path.join(__dirname, '../.env') });

/* =====================================================
   OPENAI CONFIGURATION
===================================================== */
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

/* =====================================================
   DATABASE CONNECTION
===================================================== */
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'tender_automation_with_ai'
};

/* =====================================================
   EMAIL TRANSPORTER CONFIGURATION
===================================================== */
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER || 'noreply.openprocure.ai@gmail.com',
        pass: process.env.EMAIL_PASSWORD || 'sinelulmyxgdwmue'
    }
});

/* =====================================================
   GPT ZONE DETECTION
===================================================== */
async function detectZone(address) {
    try {
        const prompt = `Based on the following address, determine if it belongs to North, South, East, or West zone of India.
        
Address: ${address}

Respond with ONLY ONE WORD: North, South, East, or West.`;

        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "You are a geographic zone classifier for India. You must respond with only one word: North, South, East, or West based on the address provided."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.3,
            max_tokens: 10
        });

        const zone = response.choices[0].message.content.trim();

        // Validate zone
        const validZones = ['North', 'South', 'East', 'West'];
        if (validZones.includes(zone)) {
            return zone;
        }

        console.warn(`⚠️  Invalid zone detected: ${zone}, defaulting to South`);
        return 'South'; // Default fallback

    } catch (error) {
        console.error('❌ GPT zone detection error:', error.message);
        return 'South'; // Default fallback on error
    }
}

/* =====================================================
   EMAIL TEMPLATE GENERATOR
===================================================== */
function generatePBGCollectionEmail(tender, zoneContact) {
    const { bid_no, buyer_name, buyer_address, emd_amt } = tender;

    return {
        subject: `⚠️ Expired PBG Collection Required - Bid: ${bid_no}`,
        html: `
<!DOCTYPE html>
<html>
<head>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }
        .header {
            background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
            color: white;
            padding: 30px;
            border-radius: 10px 10px 0 0;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 24px;
        }
        .alert-banner {
            background: #fff3cd;
            border: 2px solid #ffc107;
            border-radius: 8px;
            padding: 15px;
            margin: 20px 0;
            text-align: center;
        }
        .alert-text {
            color: #856404;
            font-weight: 700;
            font-size: 16px;
        }
        .content {
            background: #ffffff;
            padding: 30px;
            border: 1px solid #e0e0e0;
        }
        .info-box {
            background: #f8f9fa;
            border-left: 4px solid #dc3545;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
        }
        .info-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #e9ecef;
        }
        .info-row:last-child {
            border-bottom: none;
        }
        .label {
            font-weight: 600;
            color: #495057;
        }
        .value {
            color: #212529;
            font-weight: 500;
        }
        .action-box {
            background: #d4edda;
            border: 2px solid #28a745;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
        }
        .action-title {
            color: #155724;
            font-weight: 700;
            font-size: 16px;
            margin-bottom: 10px;
        }
        .footer {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 0 0 10px 10px;
            text-align: center;
            font-size: 12px;
            color: #6c757d;
            border: 1px solid #e0e0e0;
            border-top: none;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>⚠️ PBG Collection Required</h1>
    </div>
    
    <div class="content">
        <p>Dear <strong>${zoneContact.name}</strong>,</p>
        
        <div class="alert-banner">
            <p class="alert-text">🚨 URGENT: Performance Bank Guarantee (PBG) has EXPIRED</p>
        </div>
        
        <p>This is an automated notification that the Performance Bank Guarantee (PBG) for the following tender has expired and requires immediate collection from the buyer organization:</p>
        
        <div class="info-box">
            <div class="info-row">
                <span class="label">Bid Number:</span>
                <span class="value">${bid_no}</span>
            </div>
            <div class="info-row">
                <span class="label">Buyer Organization:</span>
                <span class="value">${buyer_name || 'N/A'}</span>
            </div>
            <div class="info-row">
                <span class="label">Buyer Address:</span>
                <span class="value">${buyer_address || 'N/A'}</span>
            </div>
            ${emd_amt ? `
            <div class="info-row">
                <span class="label">EMD Amount:</span>
                <span class="value">₹ ${parseFloat(emd_amt || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            ` : ''}
            <div class="info-row">
                <span class="label">Status:</span>
                <span class="value" style="color: #dc3545; font-weight: 700;">⏰ EXPIRED</span>
            </div>
        </div>
        
        <div class="action-box">
            <div class="action-title">📋 Action Required:</div>
            <ul style="margin: 10px 0; line-height: 1.8;">
                <li>Schedule a visit to the buyer's office to collect the expired PBG document</li>
                <li>Coordinate with the buyer organization for document handover</li>
                <li>Update the system once the PBG is collected</li>
                <li>Submit the collected PBG to the finance/accounts department</li>
            </ul>
        </div>
        
        <p><strong>Note:</strong> Please prioritize this collection to ensure proper closure of the tender documentation and release of associated guarantees.</p>
        
        <p style="margin-top: 30px;">
            <strong>Best regards,</strong><br>
            OpenProcure Automation System<br>
            📧 noreply.openprocure.ai@gmail.com
        </p>
    </div>
    
    <div class="footer">
        <p>This is an automated notification from OpenProcure Tender Management System</p>
        <p>© ${new Date().getFullYear()} OpenProcure. All rights reserved.</p>
    </div>
</body>
</html>
        `
    };
}

/* =====================================================
   MAIN FUNCTION - DETECT AND NOTIFY EXPIRED PBG
===================================================== */
async function notifyExpiredPBG() {
    let connection;

    try {
        console.log('🔄 Starting Expired PBG Collection Notification Process...\n');

        // Connect to database
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Database connected\n');

        // Query for expired PBG records
        // Query for expired PBG records
const expiredPBGQuery = `
    SELECT 
        p.bid_no,
        p.emd_amt,
        p.consignee_mail_id,
        p.buyer_name,
        p.buyer_address
    FROM participated_tenders p
    WHERE EXISTS (
        SELECT 1
        FROM pbg_records r
        WHERE r.bid_no = p.bid_no
          AND CURDATE() > r.expiry_date
    )
`;


        const [expiredTenders] = await connection.execute(expiredPBGQuery);

        if (expiredTenders.length === 0) {
            console.log('✅ No expired PBG records found.');
            return;
        }

        console.log(`📋 Found ${expiredTenders.length} expired PBG(s):\n`);

        // Process each expired tender
        let successCount = 0;
        let failureCount = 0;

        for (const tender of expiredTenders) {
            const { bid_no, buyer_address, buyer_name } = tender;

            console.log(`🔍 Processing ${bid_no}...`);
            console.log(`   Buyer: ${buyer_name}`);
            console.log(`   Address: ${buyer_address}\n`);

            // Skip if no address
            if (!buyer_address) {
                console.log(`⚠️  Skipping ${bid_no}: No buyer address available\n`);
                failureCount++;
                continue;
            }

            try {
                // Detect zone using GPT
                console.log(`   🤖 Detecting zone using GPT...`);
                const zone = await detectZone(buyer_address);
                console.log(`   📍 Detected Zone: ${zone}\n`);

                // Get zone contact from database
                const zoneQuery = `
                    SELECT name, email_id 
                    FROM zone_data 
                    WHERE zone = ?
                `;

                const [zoneContacts] = await connection.execute(zoneQuery, [zone]);

                if (zoneContacts.length === 0) {
                    console.log(`⚠️  No contact found for ${zone} zone\n`);
                    failureCount++;
                    continue;
                }

                const zoneContact = zoneContacts[0];
                console.log(`   👤 Zone Contact: ${zoneContact.name} (${zoneContact.email_id})`);

                // Send email
                const emailContent = generatePBGCollectionEmail(tender, zoneContact);

                await transporter.sendMail({
                    from: `"OpenProcure" <${process.env.EMAIL_USER}>`,
                    to: zoneContact.email_id,
                    subject: emailContent.subject,
                    html: emailContent.html
                });

                console.log(`   ✅ Collection notification sent!\n`);
                successCount++;

                // Delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 2000));

            } catch (error) {
                console.error(`   ❌ Failed to process ${bid_no}:`, error.message, '\n');
                failureCount++;
            }
        }

        // Summary
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 EXPIRED PBG NOTIFICATION SUMMARY');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`Total Expired PBGs: ${expiredTenders.length}`);
        console.log(`✅ Notifications Sent: ${successCount}`);
        console.log(`❌ Failed: ${failureCount}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    } catch (error) {
        console.error('❌ Error in expired PBG notification process:', error);
        throw error;
    } finally {
        if (connection) {
            await connection.end();
            console.log('🔌 Database connection closed');
        }
    }
}

/* =====================================================
   EXECUTE SCRIPT
===================================================== */
notifyExpiredPBG()
    .then(() => {
        console.log('\n✅ Expired PBG notification process completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Expired PBG notification process failed:', error);
        process.exit(1);
    });
