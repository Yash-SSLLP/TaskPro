/**
 * A person who signs in.
 *
 * Everyone is a `user` with their own Task Pin. `superadmin` is the platform
 * operator: no pin, can't be found or added, and can see and change anything.
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { formatPhone } = require('../identity');
const { generatePin, formatPin } = require('../pin');

const ROLES = ['user', 'superadmin'];

const uniqueWhenSet = (field) => [
  { [field]: 1 },
  { unique: true, partialFilterExpression: { [field]: { $type: 'string' } } },
];

const userSchema = new mongoose.Schema(
  {
    pin: { type: String, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    title: { type: String, trim: true, maxlength: 60 },
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    username: { type: String, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'user', required: true },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    // Personal settings; shape and defaults come from product/settings.js.
    settings: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Set when someone else chose this password (a Super Admin reset).
    // The apps hold the person on a "choose your own password" screen.
    mustChangePassword: { type: Boolean, default: false },
    // Part of every token; bumping it signs the person out everywhere.
    tokenVersion: { type: Number, default: 0 },
    resetTokenHash: { type: String, select: false },
    resetTokenExpires: { type: Date, select: false },
    lastLoginAt: Date,
    lastSeenAt: Date,
  },
  { timestamps: true, minimize: false }
);

userSchema.index(...uniqueWhenSet('pin'));
userSchema.index(...uniqueWhenSet('email'));
userSchema.index(...uniqueWhenSet('phone'));
userSchema.index(...uniqueWhenSet('username'));
userSchema.index({ name: 1 });

userSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(plain, 10);
};

userSchema.methods.checkPassword = function checkPassword(plain) {
  if (!this.passwordHash) return Promise.resolve(false);
  return bcrypt.compare(String(plain ?? ''), this.passwordHash);
};

userSchema.virtual('isSuperAdmin').get(function isSuperAdmin() {
  return this.role === 'superadmin';
});

/**
 * Save a new person with a fresh pin, drawing again on the (rare) clash.
 * Other unique-index clashes (email, phone) are passed on to the caller.
 */
userSchema.methods.saveWithPin = async function saveWithPin() {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    this.pin = generatePin();
    try {
      return await this.save();
    } catch (err) {
      if (err?.code !== 11000 || !err.keyPattern?.pin) throw err;
    }
  }
  throw new Error('Could not find a free Task Pin');
};

/**
 * The shape every API response uses for a person. `full` adds the logins and
 * account details, for the person themselves and the Super Admin only.
 */
function publicUser(u, { full = true } = {}) {
  if (!u) return null;
  const base = {
    id: String(u._id),
    pin: u.pin || '',
    pinDisplay: formatPin(u.pin),
    name: u.name,
    title: u.title || '',
    status: u.status,
  };
  if (!full) return base;
  return {
    ...base,
    role: u.role,
    email: u.email || '',
    phone: u.phone || '',
    phoneDisplay: formatPhone(u.phone),
    username: u.username || '',
    mustChangePassword: !!u.mustChangePassword,
    lastSeenAt: u.lastSeenAt || null,
    createdAt: u.createdAt,
  };
}

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
module.exports.publicUser = publicUser;
