/**
 * Runtime configuration, read once from the environment (.env in development).
 *
 * Everything the server needs from outside lives here, so the rest of the code
 * never touches process.env directly.
 */
require('dotenv').config();

const env = (key, fallback = '') => {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
};

const nodeEnv = env('NODE_ENV', 'development');
const isProd = nodeEnv === 'production';
const isTest = nodeEnv === 'test';

let jwtSecret = env('JWT_SECRET');
if (!jwtSecret) {
  if (isProd) throw new Error('JWT_SECRET must be set in production');
  jwtSecret = 'dev-only-secret-change-me';
}

const config = {
  nodeEnv,
  isProd,
  isTest,
  port: Number(env('PORT', 5120)),

  // Empty in development = start a throwaway in-memory MongoDB (see server.js).
  mongoUri: env('MONGO_URI'),
  // DNS servers to fall back to when the system resolver can't look up a
  // mongodb+srv:// address (see platform/db.js).
  dnsServers: env('DNS_SERVERS', '8.8.8.8,1.1.1.1')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  jwtSecret,
  jwtExpiresIn: env('JWT_EXPIRES_IN', '30d'),
  // Signs short-lived file links (attachments, voice notes) so an <img> or
  // <audio> tag can load them.
  fileUrlSecret: env('FILE_URL_SECRET', jwtSecret),

  // Comma-separated list of web origins allowed to call the API. Empty = any.
  corsOrigins: env('CORS_ORIGIN')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // The public address of the web app, used in emailed links.
  webUrl: env('WEB_URL', 'http://localhost:5121').replace(/\/+$/, ''),
  // A built web app to serve from this server (optional, for one-box deploys).
  webDist: env('WEB_DIST'),

  // Public self sign-up.
  signupEnabled: env('SIGNUP_ENABLED', 'true') !== 'false',

  // Country code added to 10-digit mobile numbers.
  defaultCountryCode: env('DEFAULT_COUNTRY_CODE', '91'),

  // Platform operator account, created at boot if missing.
  superAdmin: {
    username: env('SUPERADMIN_USERNAME'),
    password: env('SUPERADMIN_PASSWORD'),
    name: env('SUPERADMIN_NAME', 'Super Admin'),
  },

  // Outgoing mail (password reset). Optional: without it, reset is admin-only.
  smtp: {
    host: env('SMTP_HOST'),
    port: Number(env('SMTP_PORT', 587)),
    user: env('SMTP_USER'),
    pass: env('SMTP_PASS'),
    from: env('MAIL_FROM'),
  },

  // Optional Expo access token for push (only if "enhanced push security" is on).
  expoAccessToken: env('EXPO_ACCESS_TOKEN'),
};

module.exports = config;
