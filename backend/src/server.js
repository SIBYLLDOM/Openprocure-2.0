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

const PORT = process.env.PORT || 5000;

app.use('/api/tenders', tenderRoutes);
app.use('/api', tenderStatusRoutes);
app.use('/api', tenderInterestRoutes);
app.use('/api', tenderRoutes2);
app.use('/api/contracts', contractsRoutes);
app.use('/api/incidents', incidentsRoutes);
app.use('/api/competitor-products', competitorRoutes);

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
