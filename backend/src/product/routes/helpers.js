/**
 * Small pieces every task route shares.
 */
const Task = require('../models/Task');
const access = require('../services/access');
const { decorate } = require('../services/present');
const { populateRows } = require('../services/query');

/** A list row: decorated, with its serial and what this caller may do. */
const listRow = (who, row, serial) => ({ ...decorate(row), serial, can: access.capabilitiesFor(who, row) });

/** The task re-read with its people, as `{ task, can }`. */
async function taskBody(who, taskOrId) {
  const id = taskOrId?._id ?? taskOrId;
  const task = await populateRows(Task.findById(id));
  return { task: decorate(task), can: access.capabilitiesFor(who, task) };
}

module.exports = { listRow, taskBody };
