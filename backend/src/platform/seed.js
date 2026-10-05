/**
 * Make sure the platform Super Admin account exists.
 *
 * Its username and first password come from SUPERADMIN_USERNAME /
 * SUPERADMIN_PASSWORD. An existing account is left alone: changing the
 * password in .env later does NOT overwrite a password already in use (use
 * `npm run seed:superadmin -- --reset` for that).
 */
const config = require('../config');
const User = require('./models/User');
const { parseIdentifier } = require('./identity');

async function ensureSuperAdmin({ reset = false } = {}) {
  const { username, password, name } = config.superAdmin;
  if (!username || !password) return null;

  const id = parseIdentifier(username);
  if (!id) throw new Error(`SUPERADMIN_USERNAME "${username}" is not a valid email, mobile number or username`);

  let user = await User.findOne({ [id.type]: id.value }).select('+passwordHash');
  if (user && user.role !== 'superadmin') {
    throw new Error(`SUPERADMIN_USERNAME "${username}" already belongs to someone else`);
  }
  if (user && !reset) return user;

  if (!user) user = new User({ name, role: 'superadmin', [id.type]: id.value });
  await user.setPassword(password);
  user.status = 'active';
  if (reset) user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  console.log(`[seed] Super Admin "${username}" ${reset ? 'password reset' : 'created'}`);
  return user;
}

module.exports = { ensureSuperAdmin };
