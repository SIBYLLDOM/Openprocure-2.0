const db = require('../config/db');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');

exports.getZones = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT DISTINCT zone FROM zone_data WHERE zone IS NOT NULL AND zone != ""');
        const zones = rows.map(r => r.zone);
        res.json({ success: true, zones });
    } catch (error) {
        console.error('Error fetching zones:', error);
        res.status(500).json({ success: false, message: 'Server error fetching zones.', error: error.message });
    }
};

exports.getStates = async (req, res) => {
    try {
        const { zone } = req.query;
        if (!zone) {
            return res.status(400).json({ success: false, message: 'Zone is required.' });
        }

        const [rows] = await db.query('SELECT DISTINCT state FROM zone_data WHERE zone = ? AND state IS NOT NULL AND state != ""', [zone]);
        const states = rows.map(r => r.state);
        res.json({ success: true, states });
    } catch (error) {
        console.error('Error fetching states:', error);
        res.status(500).json({ success: false, message: 'Server error fetching states.', error: error.message });
    }
};

exports.getZoneHeads = async (req, res) => {
    try {
        const { zone } = req.query;
        if (!zone) {
            return res.status(400).json({ success: false, message: 'Zone is required.' });
        }

        // We use role = 'Leader' for Zone Heads
        const [rows] = await db.query('SELECT name, email_id, emp_id FROM zone_data WHERE zone = ? AND role = "Leader" AND email_id IS NOT NULL AND email_id != ""', [zone]);
        res.json({ success: true, zoneHeads: rows });
    } catch (error) {
        console.error('Error fetching zone heads:', error);
        res.status(500).json({ success: false, message: 'Server error fetching zone heads.', error: error.message });
    }
};

exports.getFlsp = async (req, res) => {
    try {
        const { state } = req.query;
        if (!state) {
            return res.status(400).json({ success: false, message: 'State is required.' });
        }

        const [rows] = await db.query('SELECT name, email_id, emp_id FROM zone_data WHERE state = ? AND role = "FLSP" AND email_id IS NOT NULL AND email_id != ""', [state]);
        res.json({ success: true, flsps: rows });
    } catch (error) {
        console.error('Error fetching FLSPs:', error);
        res.status(500).json({ success: false, message: 'Server error fetching FLSPs.', error: error.message });
    }
};

exports.sendInvite = async (req, res) => {
    try {
        const { toEmails, ccEmails, bidNumber, meetingDetails, teamRemarks } = req.body;

        if ((!toEmails || toEmails.length === 0) && (!ccEmails || ccEmails.length === 0)) {
            return res.status(400).json({ success: false, message: 'No emails provided.' });
        }

        const cleanBid = bidNumber.replace(/[\/\\]/g, '_'); // normalize for db storage

        // Check if meeting invite already sent array
        const [existing] = await db.query('SELECT id FROM prebid_meeting WHERE bid_no = ?', [cleanBid]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'Pre-Bid meeting invite has already been sent for this tender.' });
        }

        // Configure nodemailer transporter
        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true, // use SSL
            auth: {
                user: 'noreply.openprocure.ai@gmail.com',
                pass: 'sinelulmyxgdwmue' // Application password provided by user
            }
        });

        // Email content
        // Email content
        const tenderLink = `http://localhost:5173/tenders/tenderdetails/${bidNumber.replace(/\//g, '_')}`;
        const preBidDate = meetingDetails?.date || '13-02-2026';
        const preBidTime = meetingDetails?.time || '11:00:00';
        const videoLink = meetingDetails?.link || 'https://meet.google.com/ndh-eiqc-xjb';

        // Prepare DB insert
        const tokenId = uuidv4();
        const datetimeVenue = `${preBidDate} ${preBidTime} - ${videoLink}`;

        // We do not have names easily without passing them from frontend, so store emails or JSON strings of emails for now as requested.
        // Usually we pass names from frontend but email is fine if names weren't sent
        const zoneHeadStr = ccEmails ? ccEmails.join(', ') : '';
        const flspStr = toEmails ? toEmails.join(', ') : '';

        // Ensure we always have at least a "to" if possible. Nodemailer doesn't strictly need a "to" (could have just "cc") but often SMTP servers prefer it.
        const finalTo = toEmails && toEmails.length > 0 ? toEmails : ccEmails;
        const finalCc = toEmails && toEmails.length > 0 ? ccEmails : [];

        const mailOptions = {
            from: 'noreply.openprocure.ai@gmail.com',
            to: finalTo,
            ...(finalCc.length > 0 && { cc: finalCc }),
            subject: `Pre-Bid Meeting Invitation - Tender ${bidNumber.replace(/_/g, '/')}`,
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                    <h2>Pre-Bid Meeting Invitation</h2>
                    <p>You have been assigned to attend a pre-bid meeting for Tender: <strong>${bidNumber.replace(/_/g, '/')}</strong></p>
                    
                    <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #084f9a; margin: 20px 0;">
                        <p style="margin: 0 0 10px 0;"><strong>Pre-Bid Date:</strong> ${preBidDate}</p>
                        <p style="margin: 0 0 10px 0;"><strong>Pre-Bid Time:</strong> ${preBidTime}</p>
                        <p style="margin: 0;"><strong>Pre-Bid Venue:</strong> Online video call</p>
                    </div>
                    
                    </div>
                    
                    ${teamRemarks ? `<p><strong>Team Remarks:</strong><br/>${teamRemarks}</p>` : ''}

                    <p><strong>Video call link:</strong> <a href="${videoLink}" style="color: #084f9a;">${videoLink}</a></p>
                    
                    <p style="margin-top: 30px;"><strong>Tender Details:</strong></p>
                    <p><a href="${tenderLink}" style="display: inline-block; padding: 10px 20px; background-color: #084f9a; color: white; text-decoration: none; border-radius: 5px; margin-right: 15px;">View Tender Page</a>
                     <a href="http://localhost:5173/flsp-attendance/${tokenId}" style="display: inline-block; padding: 10px 20px; background-color: #28a745; color: white; text-decoration: none; border-radius: 5px;">Mark Attendance</a></p>
                    
                    <hr style="border: 0; border-top: 1px solid #eee; margin-top: 40px;">
                    <p style="font-size: 12px; color: #999;">This is an automated message. Please do not reply.</p>
                </div>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent: ' + info.response);

        // Save to database only after successful email
        await db.query(
            'INSERT INTO prebid_meeting (bid_no, datetime_venue, zone_head, flsp, team_remarks, token_id) VALUES (?, ?, ?, ?, ?, ?)',
            [cleanBid, datetimeVenue, zoneHeadStr, flspStr, teamRemarks || '', tokenId]
        );

        res.json({ success: true, message: 'Invitations sent successfully.' });
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({ success: false, message: 'Server error sending email.', error: error.message });
    }
};

exports.submitAttendance = async (req, res) => {
    try {
        const { date, time, state, place, personName, designation, remarks, tokenId, latitude, longitude } = req.body;

        // Basic validation
        if (!date || !time || !state || !place || !personName || !designation) {
            return res.status(400).json({ success: false, message: 'Missing required fields.' });
        }

        let bidNo = null;

        if (tokenId) {
            const [existing] = await db.query('SELECT attendance_submitted, bid_no FROM prebid_meeting WHERE token_id = ?', [tokenId]);
            if (existing.length > 0) {
                if (existing[0].attendance_submitted === 1) {
                    return res.status(400).json({ success: false, message: 'Attendance has already been submitted for this meeting.' });
                }
                bidNo = existing[0].bid_no;
            }
        }

        // Insert into flsp_visits table
        const query = `
            INSERT INTO flsp_visits 
            (visit_date, visit_time, state, place, person_name, designation, remarks, latitude, longitude, bid_no) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const values = [
            date, time, state, place, personName, designation,
            remarks || '',
            latitude || null,
            longitude || null,
            bidNo
        ];

        await db.query(query, values);

        // Optional: Update the prebid_meeting table to store the flsp_remarks if tokenId is provided
        if (tokenId) {
            await db.query('UPDATE prebid_meeting SET flsp_remarks = ?, attendance_submitted = 1 WHERE token_id = ?', [remarks || '', tokenId]);
        }

        res.json({ success: true, message: 'Attendance recorded successfully.' });
    } catch (error) {
        console.error('Error recording attendance:', error);
        res.status(500).json({ success: false, message: 'Server error recording attendance.', error: error.message });
    }
};

exports.getPreBidMeeting = async (req, res) => {
    try {
        const { bid_no } = req.params;
        if (!bid_no) return res.status(400).json({ success: false, message: 'bid_no is required.' });

        const cleanBid = bid_no.replace(/[\\/\\\\]/g, '_'); // normalize matching DB storage format
        const originalBid = bid_no.replace(/_/g, '/'); // reconstruct with slashes

        const [meetingRows] = await db.query('SELECT * FROM prebid_meeting WHERE bid_no = ? OR bid_no = ?', [cleanBid, originalBid]);

        // Also fetch all actual FLSP visits tied to this bid_no
        const [visitRows] = await db.query('SELECT * FROM flsp_visits WHERE bid_no = ? OR bid_no = ? ORDER BY id DESC', [cleanBid, originalBid]);

        if (meetingRows.length === 0 && visitRows.length === 0) {
            return res.status(404).json({ success: false, message: 'No pre-bid meeting or visits found for this tender.' });
        }

        res.json({
            success: true,
            data: {
                meeting: meetingRows.length > 0 ? meetingRows[0] : null,
                visits: visitRows
            }
        });
    } catch (error) {
        console.error('Error fetching prebid meeting:', error);
        res.status(500).json({ success: false, message: 'Server error fetching meeting details.', error: error.message });
    }
};

exports.getAllSummaries = async (req, res) => {
    try {
        // Fetch all meetings
        const [meetings] = await db.query('SELECT * FROM prebid_meeting ORDER BY id DESC');

        // Fetch all visits
        const [visits] = await db.query('SELECT * FROM flsp_visits ORDER BY visit_date DESC, visit_time DESC');

        // Group visits by bid_no
        const visitsByBid = {};
        visits.forEach(v => {
            if (!v.bid_no) return;
            // normalize DB bid_no formats to standard slash format for grouping
            const standardBid = v.bid_no.replace(/_/g, '/');
            if (!visitsByBid[standardBid]) visitsByBid[standardBid] = [];
            visitsByBid[standardBid].push(v);
        });

        // Combine
        const combined = meetings.map(m => {
            const standardBid = m.bid_no.replace(/_/g, '/');
            const relatedVisits = visitsByBid[standardBid] || [];

            return {
                id: m.id,
                bid_no: standardBid,
                company_name: m.company_name,
                prebid_date: m.prebid_date,
                prebid_time: m.prebid_time,
                zone: m.zone,
                state: m.state,
                team_remarks: m.team_remarks,
                created_at: m.created_at,
                flsp_visits: relatedVisits,
                visit_count: relatedVisits.length,
                latest_flsp_remark: relatedVisits.length > 0 ? relatedVisits[0].remarks : ''
            };
        });

        res.json({ success: true, data: combined });
    } catch (error) {
        console.error('Error fetching all summaries:', error);
        res.status(500).json({ success: false, message: 'Server error fetching summaries.', error: error.message });
    }
};
