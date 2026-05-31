# Email Automation Configuration Guide

## Environment Variables

Add these variables to your `.env` file:

```env
# Email Configuration (IMAP)
EMAIL_HOST=imap.gmail.com
EMAIL_PORT=993
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_TLS=true

# Email Automation
ENABLE_EMAIL_AUTOMATION=false

# OpenAI (already configured)
OPENAI_API_KEY=sk-...
```

## Gmail Setup Instructions

### 1. Enable IMAP in Gmail
1. Go to Gmail Settings → See all settings
2. Click on "Forwarding and POP/IMAP" tab
3. Enable IMAP
4. Save changes

### 2. Generate App Password
1. Go to Google Account → Security
2. Enable 2-Step Verification (if not already enabled)
3. Go to "App passwords"
4. Select "Mail" and "Other (Custom name)"
5. Enter "PostTender ERP"
6. Copy the generated 16-character password
7. Use this password in `EMAIL_PASSWORD` env variable

## Testing

### Manual Test
```bash
# Call the API manually to test
curl -X POST https://post-api.openprocure.ai/api/email/process
```

### Enable Automation
Set `ENABLE_EMAIL_AUTOMATION=true` in `.env` file to enable automatic processing every 5 minutes.

## Monitoring

### View Archived Emails
```bash
GET https://post-api.openprocure.ai/api/email/archive
GET https://post-api.openprocure.ai/api/email/archive?category=TenderWon
GET https://post-api.openprocure.ai/api/email/archive?processed=true
```

### View Processing Logs
```bash
GET https://post-api.openprocure.ai/api/email/logs
```

## Categories

- **TenderWon**: Tender won notifications
- **Order**: Order confirmations
- **EMD**: EMD receipts
- **PBG**: PBG documents
- **NABL**: NABL certificates
- **LOA**: Letter of Acceptance
- **DCC**: DCC documents
- **Other**: Unclassified emails

## Confidence Threshold

Emails with confidence >= 0.8 are automatically processed.
Emails with confidence < 0.8 are flagged for manual review.
