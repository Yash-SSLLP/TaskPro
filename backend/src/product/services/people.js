/**
 * People, as tasks need them: name snapshots, who has been switched off
 * ("departed": they take no new work), and the platform's assignable rule.
 */
const mongoose = require('mongoose');
const User = require('../../platform/models/User');
const platformPeople = require('../../platform/services/people');
const { STATUS } = require('../config');

const validIds = (ids) => [...new Set((ids || []).filter(Boolean).map((v) => String(v?._id ?? v)))].filter((id) => mongoose.isValidObjectId(id));

/** id → name, in one query. */
async function namesOf(ids) {
  const list = validIds(ids);
  if (!list.length) return new Map();
  const users = await User.find({ _id: { $in: list } }).select('name').lean();
  return new Map(users.map((u) => [String(u._id), u.name]));
}

/** The ids among `ids` whose accounts are switched off. */
async function disabledSet(ids) {
  const list = validIds(ids);
  if (!list.length) return new Set();
  const users = await User.find({ _id: { $in: list }, status: { $ne: 'active' } }).select('_id').lean();
  return new Set(users.map((u) => String(u._id)));
}

/** Assignee rows for these people, in the order picked (the first is the primary one). */
async function buildAssignees(ids) {
  const list = validIds(ids);
  if (!list.length) return [];
  const users = await User.find({ _id: { $in: list }, status: 'active', role: { $ne: 'superadmin' } }).select('name').lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return list.filter((id) => byId.has(id)).map((id) => ({ user: id, name: byId.get(id).name, status: STATUS.PENDING }));
}

/** 400 unless the actor may give work to every one of them (the Super Admin may give to anyone active). */
const assertAssignable = (user, ids) => platformPeople.assertAssignable(user, validIds(ids));

module.exports = { validIds, namesOf, disabledSet, buildAssignees, assertAssignable, platform: platformPeople };
