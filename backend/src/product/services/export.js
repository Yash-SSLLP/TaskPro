/**
 * GET /api/tasks/export: exactly the list on screen (same query, same order,
 * every page of it) as an Excel file. Sheet 1 is the tasks; sheet 2 says
 * what the report is, so a file forwarded on its own still makes sense.
 * Dates are written as the viewer's wall clock.
 */
const ExcelJS = require('exceljs');
const Task = require('../models/Task');
const access = require('./access');
const people = require('./people');
const { decorate, statusWords } = require('./present');
const { buildQuery, countersFor, resolveSort, sortedRows, FIGURES_IGNORE } = require('./query');
const { listParam } = require('./inputs');
const { zoneOf, sheetCell, inZone } = require('./time');
const { STATUS, SORTS, idOf } = require('../config');

const PILES = { mine: 'Assigned to me', delegated: 'Assigned by me', loop: 'In the loop', team: 'Organization tasks', all: 'All tasks' };
const RANGES = { today: 'Today', yesterday: 'Yesterday', week: 'This week', month: 'This month', nextWeek: 'Next week', all: 'All time' };
const FIGURES = { total: 'Total (open work)', pending: 'Not Accepted Yet', overdue: 'Overdue', inProgress: 'In Progress', inReview: 'Under Review', completed: 'Completed' };
const MAX_ROWS = 5000;

/**
 * The organization tab (or the older `team` filter) in words: "General",
 * "Sales", or '' for all of them. One I'm not in is named from the rows it
 * shows (only the Super Admin's is looked up), so an id never reveals a name.
 */
async function orgWords(q, who, rows) {
  const tab = String(q.org || '').trim();
  if (tab === 'general') return 'General';
  const id = (tab && tab !== 'all' ? tab : String(q.team || '').trim()).toLowerCase();
  if (!id) return '';
  if (who.memberTeams.has(id)) return who.memberTeams.get(id).name;
  const shown = rows.find((r) => r.team && idOf(r.team) === id)?.team?.name;
  if (shown) return shown;
  if (!who.superAdmin || !/^[a-f\d]{24}$/.test(id)) return 'Another organization';
  const Team = require('../../platform/models/Team');
  return (await Team.findById(id).select('name').lean())?.name || 'A deleted organization';
}

async function exportTasks(req, res) {
  const who = await access.actor(req);
  const tz = zoneOf(req);
  const filter = await buildQuery(req);
  const { sort, key: sortKey, dir: sortDir } = resolveSort(req.query);
  const [rows, total, counters] = await Promise.all([
    sortedRows(filter, sort, sortKey, 0, MAX_ROWS),
    Task.countDocuments(filter),
    countersFor(await buildQuery(req, FIGURES_IGNORE)),
  ]);
  const loopNames = await people.namesOf(rows.flatMap((r) => (r.loopUsers || []).map(idOf)));

  const wb = new ExcelJS.Workbook();
  wb.creator = require('..').name;
  wb.created = new Date();

  const ws = wb.addWorksheet('Tasks');
  ws.columns = [
    { header: '#', key: 'serial', width: 6 },
    { header: 'Code', key: 'code', width: 16 },
    { header: 'Task', key: 'title', width: 42 },
    { header: 'Status', key: 'status', width: 18 },
    { header: 'Overdue', key: 'overdue', width: 10 },
    { header: 'Priority', key: 'priority', width: 11 },
    { header: 'Category', key: 'category', width: 18 },
    { header: 'Assigned by', key: 'by', width: 24 },
    { header: 'Assigned to', key: 'to', width: 32 },
    { header: 'Assigned on', key: 'assignedOn', width: 14, style: { numFmt: 'dd-mmm-yyyy' } },
    { header: 'Due', key: 'due', width: 20, style: { numFmt: 'dd-mmm-yyyy hh:mm AM/PM' } },
    { header: 'Completed on', key: 'completedOn', width: 20, style: { numFmt: 'dd-mmm-yyyy hh:mm AM/PM' } },
    { header: 'On time?', key: 'onTime', width: 11 },
    { header: 'Progress %', key: 'progress', width: 11 },
    { header: 'Pieces done', key: 'pieces', width: 12 },
    { header: 'Repeats', key: 'repeats', width: 18 },
    { header: 'Kept in the loop', key: 'loop', width: 26 },
    { header: 'Details', key: 'details', width: 60 },
  ];

  rows.forEach((raw, i) => {
    const row = decorate(raw);
    const done = row.status === STATUS.COMPLETED;
    const sentBy = row.onBehalf?.byName ? ` (sent by ${row.onBehalf.byName})` : '';
    ws.addRow({
      serial: i + 1,
      code: row.code || '',
      title: row.title || '',
      status: statusWords(row),
      overdue: row.overdue ? 'Yes' : '',
      priority: row.priority || '',
      category: row.category || '',
      by: `${row.createdByName || row.createdBy?.name || ''}${sentBy}`,
      to: row.isOpenPiece ? 'Nobody yet (open piece)' : (row.assignees || []).map((a) => a.name || a.user?.name).filter(Boolean).join(', '),
      assignedOn: sheetCell(row.assignedAt || row.createdAt, tz),
      due: sheetCell(row.dueDate, tz),
      completedOn: done ? sheetCell(row.completedAt, tz) : null,
      onTime: done ? (row.completedLate ? 'Delayed' : 'In time') : '',
      progress: Math.max(0, Math.min(100, Number(row.progress) || 0)),
      pieces: row.subtaskCount ? `${row.subtasksDone}/${row.subtaskCount}` : '',
      repeats: row.repeatLabel || '',
      loop: (raw.loopUsers || []).map((u) => loopNames.get(idOf(u))).filter(Boolean).join(', '),
      details: row.description || '',
    });
  });
  const head = ws.getRow(1);
  head.font = { bold: true };
  head.alignment = { vertical: 'middle', wrapText: true };
  head.height = 22;
  head.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F4F5' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFD4D4D8' } } };
  });
  ws.getColumn('details').alignment = { wrapText: true, vertical: 'top' };
  ws.getColumn('title').alignment = { wrapText: true, vertical: 'top' };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };

  const q = req.query;
  const scope = PILES[q.scope] ? q.scope : 'all';
  const pile = q.scope ? PILES[scope] : 'Everything I can see';
  const range = q.range === 'custom' ? `${q.from || '…'} – ${q.to || '…'}` : RANGES[q.range] || 'All time';
  const names = await people.namesOf([...listParam(q.assignedTo), ...listParam(q.assignedBy)]);
  const say = (ids) => listParam(ids).map((id) => names.get(id)).filter(Boolean).join(', ');

  const sum = wb.addWorksheet('Summary');
  sum.columns = [{ key: 'k', width: 26 }, { key: 'v', width: 48 }];
  const line = (k, v, bold = false) => {
    const r = sum.addRow({ k, v: v ?? '' });
    if (bold) r.font = { bold: true };
  };
  sum.addRow({ k: 'Tasks report' }).font = { bold: true, size: 14 };
  line('Generated on', `${inZone(new Date(), tz).toFormat('d LLL yyyy, h:mm a')} (${tz})`);
  line('Generated by', req.user.name);
  sum.addRow({});
  line('Filters', '', true);
  line('Pile', pile);
  line('Figure', FIGURES[q.figure] || (q.status || q.overdue ? 'Filtered by status' : 'Every status'));
  line('Due', range);
  const org = await orgWords(q, who, rows);
  if (org) line('Organization', org);
  if (q.priority) line('Priority', listParam(q.priority).join(', '));
  if (q.category) line('Category', listParam(q.category).join(', '));
  if (say(q.assignedTo)) line('Assigned to', say(q.assignedTo));
  if (say(q.assignedBy)) line('Assigned by', say(q.assignedBy));
  if (q.q) line('Search', q.q);
  line('Order', `${SORTS[sortKey]?.label || sortKey}, ${sortDir === 'asc' ? 'ascending' : 'descending'}`);
  line('Rows in this report', total > rows.length ? `${rows.length} (the first ${MAX_ROWS} of ${total}; narrow the filters for the rest)` : rows.length);
  sum.addRow({});
  line(`${pile}: the figures`, '', true);
  [
    ['Total (open work)', Math.max(0, counters.total - counters.completed - counters.cancelled)],
    ['Not Accepted Yet', counters.pending],
    ['Overdue', counters.overdue],
    ['In Progress', counters.inProgress],
    ['Under Review', counters.inReview],
    ['Completed', counters.completed],
    ['  of which in time', counters.inTime],
    ['  of which delayed', counters.delayed],
    ['Cancelled', counters.cancelled],
  ].forEach(([k, v]) => line(k, v));
  sum.getColumn('v').alignment = { horizontal: 'left' };

  const stamp = inZone(new Date(), tz).toFormat('yyyy-LL-dd_HHmm');
  const file = `Tasks_${pile.replace(/\s+/g, '-')}_${stamp}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
  await wb.xlsx.write(res);
  res.end();
}

module.exports = { exportTasks };
