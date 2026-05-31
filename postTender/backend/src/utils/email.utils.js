const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Transporter configuration for Gmail
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'noreply.openprocure.ai@gmail.com',
        pass: 'sinelulmyxgdwmue'
    }
});

/**
 * Send COA Document to Lab
 * @param {string} labEmail - Recipient email address
 * @param {string} contractNo - Contract Number for reference
 * @param {string} coaFilePath - Relative path to the COA file (e.g., /uploads/qc/file.pdf)
 * @param {string} filePath - Relative path to the COA file (e.g., /uploads/qc/file.pdf)
 * @param {Array<Object>} tableData - Array of objects containing batch details for the table
 */
const sendCoaToLab = async (toEmail, contractNo, filePath, tableData = []) => {
    try {
        // Generate HTML Table Rows
        let tableRows = '';
        if (tableData && tableData.length > 0) {
            tableData.forEach((row, index) => {
                tableRows += `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${row.batchNo || ''}</td>
                        <td>${row.materialCode || ''}</td>
                        <td>${row.drugCode || ''}</td>
                        <td>${row.drugName || ''}</td>
                    </tr>
                `;
            });
        }

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: toEmail,
            subject: `QC Request: COA for Contract ${contractNo}`,
            html: `
                <div style="font-family: Arial, sans-serif;">
                    <h2>COA Document Submission</h2>
                    <p>Dear Team,</p>
                    <p>Please provide below mentioned batches NABL reports against attached COA copies.</p>
                    <p><strong>Contract No:</strong> ${contractNo}</p>
                    
                    <b><p>Note-Kindly add KMSCL Drug Names and KMSCL Drug Codes in the reports as detailed below:</p></b>
                    <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; border: 1px solid #ddd;">
                        <thead>
                            <tr style="background-color: #f2f2f2;">
                                <th>Sl No</th>
                                <th>Batch No</th>
                                <th>Material Code</th>
                                <th>KMSCL Drug Code</th>
                                <th>KMSCL Drug Name</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                        </tbody>
                    </table>
                    <br>
                    <p>Regards,</p>
                    <p>OpenProcure Quality Control Team</p>
                </div>
            `,
            attachments: [
                {
                    path: path.join(__dirname, '../../', filePath)
                }
            ]
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent: ' + info.response);
        return info;
    } catch (error) {
        console.error("Email send error:", error);
        throw error;
    }
}
const sendDCCEmail = async (toEmail, contractNo, buyerName, state) => {
    try {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: toEmail,
            subject: `DCC Created: Contract ${contractNo}`,
            html: `
                <div style="font-family: Arial, sans-serif;">
                    <h2>DCC Created Successfully</h2>
                    <p>Dear Zone Head,</p>
                    <p>A new DCC has been created for the following contract:</p>
                    <ul>
                        <li><strong>Contract No:</strong> ${contractNo}</li>
                        <li><strong>Buyer:</strong> ${buyerName}</li>
                        <li><strong>State:</strong> ${state}</li>
                    </ul>
                    <p>Please review the details and take action:</p>
                    <div style="margin: 20px 0;">
                        <a href="https://post-api.openprocure.ai/api/qc/dcc/verify?contractNo=${encodeURIComponent(contractNo)}" 
                           style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-right: 15px;">
                           Verify DCC
                        </a>
                        <a href="https://post-api.openprocure.ai/api/qc/dcc/decline?contractNo=${encodeURIComponent(contractNo)}" 
                           style="background-color: #f44336; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                           Decline DCC
                        </a>
                    </div>
                    <p>Or log in to the portal to process further.</p>
                    <br>
                    <p>Regards,</p>
                    <p>OpenProcure System</p>
                </div>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('DCC Email sent: ' + info.response);
        return info;
    } catch (error) {
        console.error("DCC Email send error:", error);
        throw error;
    }
};

const sendOpiGenerationEmail = async (toEmail, contractNo, token) => {
    try {
        const opiLink = `http://localhost:5173/opi?token=${encodeURIComponent(token)}`;
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: toEmail,
            subject: `Action Required: Generate OPI for Contract ${contractNo}`,
            html: `
                <div style="font-family: Arial, sans-serif;">
                    <h2>Order Processing Information (OPI) Generation</h2>
                    <p>Dear FLSP Team,</p>
                    <p>A new order has been accepted and requires OPI generation.</p>
                    <ul>
                        <li><strong>Contract No:</strong> ${contractNo}</li>
                    </ul>
                    <p>Please click the link below to verify the details, attach any relevant quotations, and submit the OPI data:</p>
                    <div style="margin: 20px 0;">
                        <a href="${opiLink}" 
                           style="background-color: #084f9a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                           Complete OPI Form
                        </a>
                    </div>
                    <p style="color: #666; font-size: 12px;">This link is secure and tied specifically to this contract. Do not share it.</p>
                    <br>
                    <p>Regards,</p>
                    <p>OpenProcure System</p>
                </div>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('OPI Generation Email sent: ' + info.response);
        return info;
    } catch (error) {
        console.error("OPI Generation Email send error:", error);
        throw error;
    }
};

const sendPlanningRequestEmail = async (toEmails, contractNo, planningToken, manufacturingRemarks, opiData, opiFilePath) => {
    try {
        const planningLink = `http://localhost:5173/planning-response?token=${encodeURIComponent(planningToken)}`;

        // Build a concise OPI summary
        let opiSummary = '';
        if (opiData && opiData.order_processing_information) {
            const info = opiData.order_processing_information;
            const division = info.Division || info.division || '';
            const poNo = info.po_details?.PO_No || '';
            const poDate = info.po_details?.PO_Date || '';
            const hospitalName = info.hospital_details?.Hospital_Name || '';
            opiSummary = `
                <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;">
                    <tr style="background:#084f9a;color:white;"><th colspan="2">OPI Summary</th></tr>
                    <tr><td><b>Division</b></td><td>${division}</td></tr>
                    ${poNo ? `<tr><td><b>PO No</b></td><td>${poNo}</td></tr>` : ''}
                    ${poDate ? `<tr><td><b>PO Date</b></td><td>${poDate}</td></tr>` : ''}
                    ${hospitalName ? `<tr><td><b>Hospital</b></td><td>${hospitalName}</td></tr>` : ''}
                </table><br>`;
        }

        // Attach OPI JSON file if exists
        const attachments = [];
        if (opiFilePath) {
            const absPath = path.resolve(opiFilePath);
            if (fs.existsSync(absPath)) {
                attachments.push({ filename: path.basename(absPath), path: absPath });
            }
        }

        const mailOptions = {
            from: process.env.EMAIL_USER || 'noreply.openprocure.ai@gmail.com',
            to: toEmails.join(','),
            subject: `[Action Required] Manufacturing Planning Request – Contract ${contractNo}`,
            html: `
                <div style="font-family:Arial,sans-serif;max-width:700px;">
                    <div style="background:#084f9a;color:white;padding:18px 24px;border-radius:8px 8px 0 0;">
                        <h2 style="margin:0;font-size:18px;">🏭 Manufacturing Planning Request</h2>
                    </div>
                    <div style="background:#f8fafd;padding:24px;border:1px solid #e2e8f0;">
                        <p>Dear Planning Team,</p>
                        <p>The Field Level Sales Person has submitted manufacturing remarks for a recently accepted order and requires your input on the expected delivery date.</p>

                        <table style="width:100%;margin-bottom:16px;">
                            <tr><td style="padding:4px 0;"><b>Contract No:</b></td><td>${contractNo}</td></tr>
                        </table>

                        <div style="background:#fffbeb;border-left:4px solid #f5a623;padding:12px 16px;border-radius:0 6px 6px 0;margin-bottom:20px;">
                            <b>Manufacturing Remarks from FLSP:</b><br><br>
                            <span style="color:#44403c;">${manufacturingRemarks}</span>
                        </div>

                        ${opiSummary}

                        <p>Please click the button below to view the full OPI details and fill in your delivery timeline and remarks:</p>
                        <div style="margin:24px 0;">
                            <a href="${planningLink}" style="background:#084f9a;color:white;padding:12px 28px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block;">
                                📋 Respond to Planning Request
                            </a>
                        </div>
                        <p style="color:#64748b;font-size:12px;">This link is specific to this planning request. Please do not share it externally.</p>
                    </div>
                    <div style="background:#f1f5f9;padding:12px 24px;text-align:center;font-size:12px;color:#94a3b8;border-radius:0 0 8px 8px;">
                        OpenProcure System — Automated Notification
                    </div>
                </div>
            `,
            attachments
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Planning request email sent:', info.response);
        return info;
    } catch (error) {
        console.error('Planning request email error:', error);
        throw error;
    }
};

const sendPlanningResponseEmail = async (toEmails, contractNo, deliveryDate, planningRemarks) => {
    try {
        const formattedDate = new Date(deliveryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

        const mailOptions = {
            from: process.env.EMAIL_USER || 'noreply.openprocure.ai@gmail.com',
            to: toEmails.join(','),
            subject: `[Planning Update] Delivery Date Confirmed – Contract ${contractNo}`,
            html: `
                <div style="font-family:Arial,sans-serif;max-width:700px;">
                    <div style="background:#16a34a;color:white;padding:18px 24px;border-radius:8px 8px 0 0;">
                        <h2 style="margin:0;font-size:18px;">✅ Planning Team Response Received</h2>
                    </div>
                    <div style="background:#f8fafd;padding:24px;border:1px solid #e2e8f0;">
                        <p>Dear Team,</p>
                        <p>The Planning Team has reviewed the manufacturing request and provided the following update for Contract <b>${contractNo}</b>:</p>

                        <div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:14px 18px;border-radius:0 6px 6px 0;margin:20px 0;">
                            <p style="margin:0 0 8px;"><b>📅 Expected Delivery Date:</b></p>
                            <p style="font-size:20px;color:#15803d;font-weight:bold;margin:0;">${formattedDate}</p>
                        </div>

                        ${planningRemarks ? `
                        <div style="background:#fff;border:1px solid #e2e8f0;padding:14px 18px;border-radius:6px;margin-bottom:20px;">
                            <b>Planning Remarks:</b><br><br>
                            <span style="color:#44403c;">${planningRemarks}</span>
                        </div>` : ''}

                        <p>Please note this delivery date for contract <b>${contractNo}</b> and take the next steps accordingly.</p>
                    </div>
                    <div style="background:#f1f5f9;padding:12px 24px;text-align:center;font-size:12px;color:#94a3b8;border-radius:0 0 8px 8px;">
                        OpenProcure System — Automated Notification
                    </div>
                </div>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Planning response email sent:', info.response);
        return info;
    } catch (error) {
        console.error('Planning response email error:', error);
        throw error;
    }
};

module.exports = {
    sendCoaToLab,
    sendDCCEmail,
    sendOpiGenerationEmail,
    sendPlanningRequestEmail,
    sendPlanningResponseEmail
};
