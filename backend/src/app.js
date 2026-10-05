/**
 * The Express app (no network, no database): server.js and the tests both
 * build on this.
 */
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const config = require('./config');
const product = require('./product');
const { notFoundHandler, errorHandler } = require('./platform/errors');

function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // The API serves attachments to the web app on another origin.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    })
  );
  app.use(
    cors({
      origin: config.corsOrigins.length ? config.corsOrigins : true,
      exposedHeaders: ['Content-Disposition'],
      maxAge: 7200,
    })
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, service: product.key, time: new Date().toISOString() });
  });

  app.use('/api/auth', require('./platform/routes/auth'));
  app.use('/api/me', require('./platform/routes/me'));
  app.use('/api/contacts', require('./platform/routes/contacts'));
  app.use('/api/people', require('./platform/routes/people'));
  app.use('/api/teams', require('./platform/routes/teams'));
  app.use('/api/notifications', require('./platform/routes/notifications'));
  app.use('/api/devices', require('./platform/routes/devices'));
  app.use('/api/files', require('./platform/routes/files'));
  app.use('/api/platform', require('./platform/routes/platform'));
  product.mountRoutes(app);

  app.use('/api', notFoundHandler);

  // Optionally serve the built web app from the same server.
  if (config.webDist && fs.existsSync(path.join(config.webDist, 'index.html'))) {
    app.use(express.static(config.webDist, { index: false, maxAge: '1h' }));
    app.get('/{*splat}', (req, res) => res.sendFile(path.join(config.webDist, 'index.html')));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
