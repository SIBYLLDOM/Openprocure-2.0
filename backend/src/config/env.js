// src/config/env.js
// Resolves environment-dependent settings from the single PRODUCTION switch in .env
require('dotenv').config();

const isProd = String(process.env.PRODUCTION).toLowerCase() === 'true';

const PORT = Number(
  (isProd ? process.env.PROD_PORT : process.env.LOCAL_PORT) || process.env.PORT || 5000
);

const corsOrigins = isProd
  ? [
      'https://openprocure.ai',
      'https://post-tender.openprocure.ai',
      // Local dev frontend, allowed to hit the live prod API directly.
      'http://localhost:5173',
    ]
  : [
      'http://localhost:5173',
      'http://localhost:5163',
      `http://localhost:${PORT}`,
    ];

module.exports = { isProd, PORT, corsOrigins };
