# EMD Return Request Automation

## Overview
Automated script to send EMD (Earnest Money Deposit) return request emails to organizations for tenders with pending/not received EMD status.

## Features
- ✅ Fetches pending EMD records from database
- ✅ Sends professional HTML emails to organizations
- ✅ Beautiful email template with gradient design
- ✅ Detailed tender information in email
- ✅ Summary report after execution
- ✅ Error handling and logging

## Requirements
- Node.js (v14 or higher)
- MySQL database access
- Gmail SMTP credentials configured in `.env`

## Database Query
The script queries:
```sql
SELECT bid_no, emd_amt, consignee_mail_id, buyer_name 
FROM participated_tenders 
WHERE emd_status IN ('Pending', 'Not Received')
```

## Usage

### Run the Script
```bash
# From backend directory
cd backend
node scripts/request_emd.js
```

### Or using npm
```bash
npm run request-emd
```

## Email Template
The script sends a professional HTML email containing:
- **Bid Number**: Tender identification
- **EMD Amount**: Formatted in INR currency
- **Status**: Current EMD status
- **Request Message**: Professional refund request
- **Company branding**: OpenProcure header and footer

## Output
The script provides console output showing:
- Number of tenders found
- Email send status for each tender
- Summary with success/failure counts

### Example Output
```
🔄 Starting EMD Request Process...

✅ Database connected

📋 Found 5 tender(s) requiring EMD return request:

✅ Email sent for GEM/2024/B/1234567 to buyer@example.com
   Buyer: Example Organization
   Amount: ₹50,000.00

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 EMD REQUEST SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Tenders: 5
✅ Emails Sent: 5
❌ Failed: 0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Configuration

### Environment Variables (.env)
Ensure these are properly configured:
```env
# Database
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=tender_automation_with_ai

# Email (Gmail SMTP)
EMAIL_USER=noreply.openprocure.ai@gmail.com
EMAIL_PASSWORD=your_app_password
```

## Error Handling
- Skips tenders without valid email addresses
- Continues processing if individual emails fail
- Provides detailed error messages
- Gracefully closes database connections

## Scheduling (Optional)
To run automatically, add to cron (Linux) or Task Scheduler (Windows):

### Linux/Mac (crontab)
```bash
# Run every Monday at 9 AM
0 9 * * 1 cd /path/to/backend && node scripts/request_emd.js
```

### Windows Task Scheduler
Create a task with:
- **Action**: Start a program
- **Program**: `node`
- **Arguments**: `scripts/request_emd.js`
- **Start in**: `/path/to/backend`

## Notes
- Includes 1-second delay between emails to avoid rate limiting
- Uses Gmail SMTP (port 587 with TLS)
- HTML emails are responsive and mobile-friendly
- Amount is formatted in Indian currency (₹)

## Troubleshooting

### "No valid email address" warning
- Check `consignee_mail_id` field in database
- Ensure email addresses are properly formatted

### "Authentication failed" error
- Verify Gmail credentials in `.env`
- Enable "Less secure app access" or use App Password
- Check if 2FA is enabled on Gmail account

### Database connection errors
- Verify database credentials in `.env`
- Ensure MySQL server is running
- Check database name matches

## Support
For issues or questions, contact the development team.
