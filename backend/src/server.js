/**
 * Start the API: connect the database, make sure the Super Admin exists,
 * start background jobs, listen.
 */
const config = require('./config');
const product = require('./product');
const { createApp } = require('./app');
const { connectDB } = require('./platform/db');
const { ensureSuperAdmin } = require('./platform/seed');
const { cleanupOrphans } = require('./platform/services/files');

async function main() {
  await connectDB();
  await ensureSuperAdmin();

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
