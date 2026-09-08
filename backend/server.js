require('dotenv').config();
const http = require('http');
const app = require('./app');
const { sequelize, testConnection } = require('./config/db');
require('./models'); // ensures the User model is registered

const PORT = process.env.PORT || 5002;

const startServer = async () => {
  await testConnection();

  // Sync models — creates the users table if it doesn't exist yet.
  await sequelize.sync();
  console.log('✅ Models synced with the database.');

  const server = http.createServer(app);

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use. Please stop the other process and try again.`);
      process.exit(1);
    } else {
      throw err;
    }
  });

  server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
};

startServer();
