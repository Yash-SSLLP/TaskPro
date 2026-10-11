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
const { sendFallback } = require('./site/fallback');
const { notFoundHandler, errorHandler } = require('./platform/errors');

// The paths vercel.json sends to this server for the website.
const SITE_PATH = /^\/(?:$|(?:features|for|about|contact|privacy|terms|blog|media)(?:\/|$)|(?:rss\.xml|sitemap\.xml|robots\.txt|llms\.txt)$)/i;

/**
 * The website's routers. If its code cannot load (a library that will not run
 * on this Node, say), its pages get the fallback landing page and its editor a
 * 503, and the API carries on: the site never takes the apps down with it.
 */
function siteRouters() {
  try {
    return { publicRouter: site.publicRouter, adminRouter: site.adminRouter };
  } catch (err) {
    console.error('[site] could not load the website; serving the fallback page:', err);
    const publicRouter = express.Router();
    publicRouter.use((req, res, next) => {
      if ((req.method !== 'GET' && req.method !== 'HEAD') || !SITE_PATH.test(req.path)) return next();
      sendFallback(res, { inlineStyle: true, signupEnabled: config.signupEnabled });
    });
    const adminRouter = express.Router();
    adminRouter.use((req, res) => res.status(503).json({ error: 'The website editor is not available right now. Try again in a few minutes.' }));
    return { publicRouter, adminRouter };
  }
}

function createApp() {
  const { publicRouter, adminRouter } = siteRouters();
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
  app.use(publicRouter);
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
  app.use('/api/site', adminRouter);
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

async function handler(req, res) {
  if (!ready) {
    const { connectDB } = require('./platform/db');
    const { ensureSuperAdmin } = require('./platform/seed');
    // The website's starter content; a fault there never stops the API, not
    // even one thrown while its code loads (hence the Promise.resolve()).
    const siteDefaults = () =>
      Promise.resolve()
        .then(() => site.ensureSiteDefaults())
        .catch((err) => console.error('[site] could not write the starter content:', err));
    ready = connectDB()
      .then(() => ensureSuperAdmin())
      .then(siteDefaults);
  }
  try {
    await ready;
  } catch (err) {
    ready = null; // try again on the next request
    console.error('Failed to start:', err);
    if (String(req.url || '').startsWith('/api')) {
      res.statusCode = 503;
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Retry-After', '30');
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Service is starting, please try again.' }));
    }
    // A website page (the home page, /privacy): the fallback landing page.
    return sendFallback(res, { inlineStyle: true, signupEnabled: config.signupEnabled });
  }
  serverlessApp ??= createApp();
  return serverlessApp(req, res);
}

module.exports = handler;
module.exports.createApp = createApp;
