// src/server.js
require('dotenv').config();
const app = require('./app');
const { startEmailProcessingJob } = require('./jobs/emailProcessor.job');

const PORT = process.env.PORT || 4050;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║   🚀 Post-Tender Backend Server Running              ║
║                                                       ║
║   📍 Local:    http://localhost:${PORT}                 ║
║   🌐 Network:  http://0.0.0.0:${PORT}                   ║
║                                                       ║
║   Environment: ${process.env.NODE_ENV || 'development'}                        ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
  `);

  // Start email processing cron job
  if (process.env.ENABLE_EMAIL_AUTOMATION === 'true') {
    startEmailProcessingJob();
    console.log('📧 Email automation enabled');
  } else {
    console.log('📧 Email automation disabled (set ENABLE_EMAIL_AUTOMATION=true to enable)');
  }
});
