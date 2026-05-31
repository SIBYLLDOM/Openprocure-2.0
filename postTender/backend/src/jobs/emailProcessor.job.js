const cron = require('node-cron');
const axios = require('axios');

/**
 * Email Processing Cron Job
 * Runs every 5 minutes to fetch and process new emails
 */
function startEmailProcessingJob() {
    // Run every 5 minutes: */5 * * * *
    // For testing, you can use */1 * * * * (every minute)
    cron.schedule('*/5 * * * *', async () => {
        const timestamp = new Date().toISOString();
        console.log(`\n🕐 [${timestamp}] Email processing cron job triggered`);

        try {
            // Call the email processing endpoint
            const response = await axios.post('https://post-api.openprocure.ai/api/email/process');

            console.log(`✅ Email processing completed:`, response.data);

        } catch (error) {
            console.error('❌ Email processing cron job failed:', error.message);
        }
    });

    console.log('✅ Email processing cron job started (runs every 5 minutes)');
}

module.exports = { startEmailProcessingJob };
