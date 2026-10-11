/**
 * Start the API: connect the database, make sure the Super Admin exists,
 * start background jobs, listen.
 */
const config = require('./config');
// app.js first: it registers the live-update plugin before any model is
// compiled (product/index.js loads models), or nothing would bump.
const { createApp } = require('./app');
const product = require('./product');
const { connectDB } = require('./platform/db');
const { ensureSuperAdmin } = require('./platform/seed');
const { ensureSiteDefaults } = require('./site');
const { cleanupOrphans } = require('./platform/services/files');

async function main() {
  await connectDB();
  await ensureSuperAdmin();
  // The website's starter content; a fault there never stops the API, not even
  // one thrown while its code loads (hence the Promise.resolve()).
  await Promise.resolve()
    .then(() => ensureSiteDefaults())
    .catch((err) => console.error('[site] could not write the starter content:', err));

  const app = createApp();
  app.listen(config.port, '0.0.0.0', () => {
    console.log(`${product.name} API listening on http://localhost:${config.port} (${config.nodeEnv})`);
  });

  // Hourly: remove uploads nobody attached.
  const hourly = setInterval(() => cleanupOrphans().catch((e) => console.warn('[files] cleanup:', e.message)), 3600 * 1000);
  hourly.unref();
  product.startJobs?.();
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
