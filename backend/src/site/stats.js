/**
 * Real numbers for the website's stats band: people on Karo, organizations,
 * tasks done. Counted at most once every 10 minutes per server instance (the
 * CDN keeps the page a minute on top of that). Never made up: the band stays
 * hidden in the CMS until the Super Admin decides the numbers are worth showing.
 */
const mongoose = require('mongoose');

const TTL_MS = 10 * 60 * 1000;
let cached = null;

async function liveStats() {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  // By name: the platform and the product load their own models.
  const User = mongoose.model('User');
  const Team = mongoose.model('Team');
  const Task = mongoose.model('Task');
  const [people, organizations, tasksDone] = await Promise.all([
    User.countDocuments({ role: 'user', deletedAt: null, status: 'active' }),
    Team.countDocuments({}),
    Task.countDocuments({ status: 'COMPLETED', archived: { $ne: true } }),
  ]);
  const value = { people, organizations, tasksDone };
  cached = { at: Date.now(), value };
  return value;
}

module.exports = { liveStats };
