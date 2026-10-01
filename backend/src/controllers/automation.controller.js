'use strict';
const http = require('http');

const ORCH_HOST = 'localhost';
const ORCH_PORT = 5172;

function proxyRequest(method, orchPath, res) {
  return new Promise((resolve) => {
    const body    = method === 'POST' ? '{}' : null;
    const options = {
      hostname: ORCH_HOST,
      port:     ORCH_PORT,
      path:     orchPath,
      method,
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': body ? Buffer.byteLength(body) : 0,
      },
      timeout: 8000,
    };

    const req = http.request(options, (proxyRes) => {
      let data = '';
      proxyRes.on('data', (c) => data += c);
      proxyRes.on('end', () => {
        try {
          res.json(JSON.parse(data));
        } catch (_) {
          res.status(500).json({ error: 'Invalid response from orchestrator' });
        }
        resolve();
      });
    });

    req.on('error', (e) => {
      res.status(503).json({
        error:  'Orchestrator not reachable — is orchestrator.js running?',
        detail: e.message,
      });
      resolve();
    });

    req.on('timeout', () => {
      req.destroy();
      res.status(504).json({ error: 'Orchestrator timeout' });
      resolve();
    });

    if (body) req.write(body);
    req.end();
  });
}

exports.getStatus = async (req, res) => {
  await proxyRequest('GET', '/status', res);
};

exports.restartService = async (req, res) => {
  const { name } = req.params;
  await proxyRequest('POST', `/service/${name}/restart`, res);
};

exports.runScraper = async (req, res) => {
  const { name } = req.params;
  await proxyRequest('POST', `/scraper/${name}/run`, res);
};

exports.getLogs = async (req, res) => {
  const { name } = req.params;
  await proxyRequest('GET', `/logs/${name}`, res);
};
