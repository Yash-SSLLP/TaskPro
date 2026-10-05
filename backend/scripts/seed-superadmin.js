/**
 * Create the platform Super Admin from SUPERADMIN_USERNAME / SUPERADMIN_PASSWORD.
 *
 *   npm run seed:superadmin            create it if missing
 *   npm run seed:superadmin -- --reset reset its password to the .env value
 *
 * The server also does the "create if missing" part on every start.
 */
const { connectDB, disconnectDB } = require('../src/platform/db');
const { ensureSuperAdmin } = require('../src/platform/seed');
const config = require('../src/config');

(async () => {
  if (!config.mongoUri) {
    console.error('Set MONGO_URI first (the in-memory dev database is thrown away on exit).');
    process.exit(1);
  }
  await connectDB();
  const user = await ensureSuperAdmin({ reset: process.argv.includes('--reset') });
  if (!user) console.error('SUPERADMIN_USERNAME and SUPERADMIN_PASSWORD are not set.');
  else console.log('Super Admin is ready.');
  await disconnectDB();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
