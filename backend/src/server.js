// src/server.js
require('dotenv').config();
const app = require('./app');

const tenderRoutes = require('./routes/tenders.routes');
const tenderStatusRoutes = require('./routes/tenderStatus.routes');
const tenderInterestRoutes = require('./routes/tenderInterest.routes');
const tenderRoutes2 = require('./routes/tender.routes');
const contractsRoutes = require('./routes/contracts.routes');
const incidentsRoutes = require('./routes/incidents.routes');
const competitorRoutes = require('./routes/competitor.routes');
const { startApprovalReminderScheduler } = require('./utils/approvalReminders');
const { startLibraryExpiryReminderScheduler } = require('./utils/libraryExpiryReminders');

const { PORT, isProd } = require('./config/env');

app.use('/api/tenders', tenderRoutes);
app.use('/api', tenderStatusRoutes);
app.use('/api', tenderInterestRoutes);
app.use('/api', tenderRoutes2);
app.use('/api/contracts', contractsRoutes);
app.use('/api/incidents', incidentsRoutes);
app.use('/api/competitor-products', competitorRoutes);

const server = app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT} (PRODUCTION=${isProd})`);
});
// Extend the socket timeout to 5 minutes so long-running batch requests
// (PDF generation, bulk SMTP sends) aren't killed by Node's default 2-minute
// socket timeout before the backend finishes working through the list.
server.setTimeout(5 * 60 * 1000);
startApprovalReminderScheduler();
startLibraryExpiryReminderScheduler();
