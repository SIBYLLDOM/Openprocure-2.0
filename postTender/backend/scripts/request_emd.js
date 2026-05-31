/**
 * EMD Return Request Email Script
 * Sends emails to organizations requesting EMD return for tenders with pending/not received status
 */

const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

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
    secure: false, // use TLS
    auth: {
        user: process.env.EMAIL_USER || 'noreply.openprocure.ai@gmail.com',
        pass: process.env.EMAIL_PASSWORD || 'sinelulmyxgdwmue'
    }
});

/* =====================================================
   EMAIL TEMPLATE GENERATOR
===================================================== */
function generateEMDRequestEmail(tender) {
    const { bid_no, emd_amt, buyer_name } = tender;

    return {
        subject: `EMD Return Request - Bid No: ${bid_no}`,
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
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            border-radius: 10px 10px 0 0;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 24px;
        }
        .content {
            background: #ffffff;
            padding: 30px;
            border: 1px solid #e0e0e0;
        }
        .info-box {
            background: #f8f9fa;
            border-left: 4px solid #667eea;
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
        .amount {
            color: #28a745;
            font-size: 20px;
            font-weight: 700;
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
        <h1>💰 EMD Return Request</h1>
    </div>
    
    <div class="content">
        <p>Dear <strong>${buyer_name || 'Organization'}</strong>,</p>
        
        <p>We are writing to formally request the return of our Earnest Money Deposit (EMD) for the following tender:</p>
        
        <div class="info-box">
            <div class="info-row">
                <span class="label">Bid Number:</span>
                <span class="value">${bid_no}</span>
            </div>
            <div class="info-row">
                <span class="label">EMD Amount:</span>
                <span class="amount">₹ ${parseFloat(emd_amt || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div class="info-row">
                <span class="label">Status:</span>
                <span class="value">Pending Return</span>
            </div>
        </div>
        
        <p>As per the tender guidelines, we kindly request you to process the EMD refund at your earliest convenience. Our banking details for the refund are available on file with your organization.</p>
        
        <p>Should you require any additional documentation or information to facilitate this refund, please do not hesitate to contact us.</p>
        
        <p style="margin-top: 30px;">
            <strong>Best regards,</strong><br>
            OpenProcure Team<br>
            📧 noreply.openprocure.ai@gmail.com
        </p>
    </div>
    
    <div class="footer">
        <p>This is an automated email from OpenProcure Tender Management System</p>
        <p>© ${new Date().getFullYear()} OpenProcure. All rights reserved.</p>
    </div>
</body>
</html>
        `
    };
}

/* =====================================================
   MAIN FUNCTION - FETCH AND SEND EMD REQUESTS
===================================================== */
async function sendEMDRequests() {
    let connection;

    try {
        console.log('🔄 Starting EMD Request Process...\n');

        // Connect to database
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Database connected\n');

        // Query for pending EMD returns
        const query = `
            SELECT bid_no, emd_amt, consignee_mail_id, buyer_name 
            FROM participated_tenders 
            WHERE emd_status IN ('Pending', 'Not Received')
        `;

        const [tenders] = await connection.execute(query);

        if (tenders.length === 0) {
            console.log('✅ No pending EMD return requests found.');
            return;
        }

        console.log(`📋 Found ${tenders.length} tender(s) requiring EMD return request:\n`);

        // Send email for each tender
        let successCount = 0;
        let failureCount = 0;

        for (const tender of tenders) {
            const { bid_no, consignee_mail_id, buyer_name, emd_amt } = tender;

            // Skip if no email address
            if (!consignee_mail_id || !consignee_mail_id.includes('@')) {
                console.log(`⚠️  Skipping ${bid_no}: No valid email address`);
                failureCount++;
                continue;
            }

            try {
                const emailContent = generateEMDRequestEmail(tender);

                // Send email
                await transporter.sendMail({
                    from: `"OpenProcure" <${process.env.EMAIL_USER}>`,
                    to: consignee_mail_id,
                    subject: emailContent.subject,
                    html: emailContent.html
                });

                console.log(`✅ Email sent for ${bid_no} to ${consignee_mail_id}`);
                console.log(`   Buyer: ${buyer_name}`);
                console.log(`   Amount: ₹${parseFloat(emd_amt || 0).toLocaleString('en-IN')}\n`);

                successCount++;

                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (emailError) {
                console.error(`❌ Failed to send email for ${bid_no}:`, emailError.message);
                failureCount++;
            }
        }

        // Summary
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 EMD REQUEST SUMMARY');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`Total Tenders: ${tenders.length}`);
        console.log(`✅ Emails Sent: ${successCount}`);
        console.log(`❌ Failed: ${failureCount}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    } catch (error) {
        console.error('❌ Error in EMD request process:', error);
        throw error;
    } finally {
        if (connection) {
            await connection.end();
            console.log('🔌 Database connection closed');
        }
    }
}

/* =====================================================
   EXPORT AS MODULE FOR CRON
===================================================== */
module.exports = { sendEMDRequests, transporter, generateEMDRequestEmail };
