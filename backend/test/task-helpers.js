/**
 * Shared bits for the task test files.
 */
const assert = require('node:assert/strict');
const h = require('./helpers');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const inMs = (ms) => new Date(Date.now() + ms).toISOString();

/** POST /api/tasks, expecting 201; returns the task. */
async function give(who, body) {
  const res = await who.post('/api/tasks', body);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.task;
}

const act = (who, id, action, body) => who.post(`/api/tasks/${id}/${action}`, body);
const move = (who, id, to, note = 'ok') => who.post(`/api/tasks/${id}/status`, { to, note });
const detail = async (who, id) => (await who.get(`/api/tasks/${id}`)).body;
const ids = (res) => res.body.tasks.map((t) => t._id);
const titles = (res) => res.body.tasks.map((t) => t.title);

/** A setter and two people they can give work to (one contact, one team-mate). */
async function crew(label = 'Crew') {
  const boss = await h.signup(`${label} Boss`);
  const a = await h.signup(`${label} A`);
  const b = await h.signup(`${label} B`);
  await h.connect(boss, a);
  const team = await h.makeTeam(boss, [b]);
  return { boss, a, b, team };
}

/** Newest alert titles for someone. */
const alertTitles = async (who) => (await h.alerts(who)).map((n) => n.title);

module.exports = { MIN, HOUR, DAY, inMs, give, act, move, detail, ids, titles, crew, alertTitles };
