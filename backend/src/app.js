/**
 * The Express app (no network, no database): server.js and the tests both
 * build on this.
 */

// Live updates (platform/live): every model compiled from here on reports its
// writes, so other people's screens refresh. Mongoose applies a global plugin
// only to models made AFTER it, so this comes before anything that loads one.
const live = require('./platform/live');

live.register();

const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const config = require('./config');
const product = require('./product');
const site = require('./site');
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
  app.use(compression());
  // The public website (site/): its own paths only, before cors() so its
  // pages carry no `Vary: Origin` and the CDN keeps one copy of each.
  app.use(site.publicRouter);
  app.use(
    cors({
      origin: config.corsOrigins.length ? config.corsOrigins : true,
      exposedHeaders: ['Content-Disposition'],
      maxAge: 7200,
    })
  );
  app.use(express.json({ limit: '1mb' }));
  // What each request changes is recorded before its answer goes out.
  app.use(live.middleware);

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
  app.use('/api/live', require('./platform/routes/live'));
  app.use('/api/site', site.adminRouter);
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

/**
 * Vercel picks this file up as the Express entry and calls its default export
 * for every request, without running server.js. Connect the database (once per
 * instance) before handing the request to the app. Required lazily so the
 * tests can still build the app with no database.
 */
let ready = null;
let serverlessApp = null;

// What a website page shows while the database cannot be reached.
const STARTING_PAGE = `<!doctype html>
<html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Karo</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,sans-serif;background:#f4f6f9;color:#16325c;text-align:center;padding:16px}@media (prefers-color-scheme:dark){body{background:#0b141a;color:#e9edef}}</style>
</head><body><main><h1>Karo is starting</h1><p>Please try again in a few seconds.</p></main></body></html>`;

async function handler(req, res) {
  if (!ready) {
    const { connectDB } = require('./platform/db');
    const { ensureSuperAdmin } = require('./platform/seed');
    // The website's starter content; a fault there never stops the API.
    const siteDefaults = () => site.ensureSiteDefaults().catch((err) => console.error('[site] could not write the starter content:', err));
    ready = connectDB()
      .then(() => ensureSuperAdmin())
      .then(siteDefaults);
  }
  try {
    await ready;
  } catch (err) {
    ready = null; // try again on the next request
    console.error('Failed to start:', err);
    res.statusCode = 503;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Retry-After', '30');
    if (String(req.url || '').startsWith('/api')) {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Service is starting, please try again.' }));
    }
    // A website page (the home page, /privacy): a page, not JSON.
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(STARTING_PAGE);
  }
  serverlessApp ??= createApp();
  return serverlessApp(req, res);
}

module.exports = handler;
module.exports.createApp = createApp;
