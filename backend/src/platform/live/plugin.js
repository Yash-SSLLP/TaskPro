/**
 * The global Mongoose plugin behind live updates (./index.js): after a write
 * to a model ./rules.js knows, work out whose screens it changed and bump
 * their keys. Registered once, with mongoose.plugin(), before any model is
 * compiled, so no model file has to know about it: the rule is looked up by
 * model name when a write happens, and every other model passes straight by.
 *
 * Covered: save() (and create), insertMany, bulkWrite, and the query writes:
 * updateOne/updateMany/replaceOne, findOneAndUpdate/Replace/Delete (and their
 * findById* forms), deleteOne/deleteMany. A document's deleteOne() runs one of
 * those. Writes that bypass Mongoose (`Model.collection.*`) are not seen.
 *
 * Rows that may leave somebody's view (a delete, an update to who is on it)
 * are read BEFORE the write as well, so the people who lose them hear too; a
 * loaded document remembers who could see it for the same reason. A failed
 * write bumps nothing (post hooks), and neither does one that changed nothing
 * or only bookkeeping (a reminder's "already sent" stamp).
 *
 * Everything is wrapped: a fault here must never reach the write that caused
 * it. The keys are worked out off the write's path (live.defer), and the
 * request waits for them before it answers.
 */
const live = require('./index');
const { ruleOf, context, idsIn } = require('./rules');

const UPDATES = ['updateOne', 'updateMany', 'replaceOne', 'findOneAndUpdate', 'findOneAndReplace'];
const DELETES = ['deleteOne', 'deleteMany', 'findOneAndDelete'];
/** Stamped by Mongoose itself on almost every write: never news on their own. */
const ALWAYS_IGNORED = new Set(['updatedAt', 'createdAt', '__v']);
/** At most this many rows are read to tell who a sweep touched; past it, the shared keys. */
const MAX_ROWS = 500;
const QUERY_ONLY = { document: false, query: true };
const BEFORE = Symbol('liveBefore');
const SKIP = Symbol('liveSkip');

const quietly = (fn) => {
  try {
    return fn();
  } catch {
    return undefined;
  }
};

/** Every (dotted) path an update writes, or null when it can't say (a pipeline). */
function writtenPaths(update) {
  if (!update || typeof update !== 'object' || Array.isArray(update)) return null;
  const out = [];
  for (const [key, value] of Object.entries(update)) {
    if (key[0] !== '$') out.push(key);
    else if (value && typeof value === 'object') out.push(...Object.keys(value));
  }
  return out;
}

/** The top-level paths an update writes, or null when it can't say. */
function touchedPaths(update) {
  const paths = writtenPaths(update);
  return paths && [...new Set(paths.map((p) => p.split('.')[0]))];
}

/** Does writing these top-level paths change anything anybody sees? (null: can't tell, so yes.) */
function matters(rule, paths) {
  if (!paths) return true;
  const seen = paths.filter((p) => !ALWAYS_IGNORED.has(p) && !rule.ignore?.has(p));
  return rule.watch ? seen.some((p) => rule.watch.has(p)) : seen.length > 0;
}

/**
 * Could an update change who sees a row? Only through the rule's audience
 * paths, and inside a list of people only through a whole entry or its
 * `user` (`assignees.$.acceptance` can't; `assignees`, `assignees.$`,
 * `assignees.0.user`, `loopUsers` can). null paths: can't tell, so yes.
 */
function movesAudience(rule, paths) {
  if (!paths) return true;
  return paths.some((path) => {
    const [top, ...rest] = path.split('.');
    if (!rule.audience?.has(top)) return false;
    const last = rest[rest.length - 1];
    return last === undefined || last === 'user' || last[0] === '$' || /^\d+$/.test(last);
  });
}

const docRule = (doc) => (doc && !doc.$isSubdocument ? ruleOf(doc.constructor?.modelName) : null);
const queryRule = (query) => ruleOf(query?.model?.modelName);
/** The document a findOneAnd* answered with (also under includeResultMetadata). */
const docOf = (res) => (res && typeof res === 'object' && 'lastErrorObject' in res ? res.value : res);

/** Did a query write change anything at all? */
function wroteSomething(res, query) {
  if (res === null || res === undefined) return Boolean(quietly(() => query.getOptions().upsert));
  if (typeof res !== 'object') return true;
  if ('modifiedCount' in res || 'upsertedCount' in res) return (res.modifiedCount || 0) + (res.upsertedCount || 0) > 0;
  if ('deletedCount' in res) return res.deletedCount > 0;
  if ('lastErrorObject' in res) return Boolean(res.value || res.lastErrorObject?.upserted);
  return true;
}

/** These rows changed: note them for the request, and bump whoever they are news to. */
function changed(rule, rows) {
  const ctx = context(live.memo());
  rule.seen?.(rows, ctx);
  live.defer(() => rule.keysFor(rows, ctx));
}

/**
 * Before a query write: skip bookkeeping, and read the rows that may leave
 * somebody's view (or whose ids the filter doesn't give) while they're there.
 * Returns a promise only when it has to read.
 */
function beforeWrite(query, rule, op) {
  const update = DELETES.includes(op) ? null : query.getUpdate();
  if (update && !matters(rule, touchedPaths(update))) {
    query[SKIP] = true;
    return undefined;
  }
  const filter = query.getFilter() || {};
  if (!rule.fields || rule.fromFilter?.(filter)) return undefined;
  const leaving = !update || !idsIn(filter._id) || movesAudience(rule, writtenPaths(update));
  if (!leaving) return undefined;
  return query.model
    .find(filter)
    .select(rule.fields)
    .limit(MAX_ROWS + 1)
    .lean()
    .then(
      (rows) => {
        query[BEFORE] = rows;
      },
      () => {}
    );
}

/** After a query write that changed something: who saw those rows before, and who sees them now. */
function afterWrite(query, rule, op, res) {
  if (query[SKIP] || !wroteSomething(res, query)) return;
  const filter = query.getFilter() || {};
  const ctx = context(live.memo());
  const named = rule.fromFilter?.(filter);
  if (named) {
    live.defer(() => rule.keysFor(named, ctx));
    return;
  }
  const before = query[BEFORE] || [];
  if (before.length > MAX_ROWS) {
    live.bump(rule.bulk());
    return;
  }
  if (DELETES.includes(op)) {
    const gone = op === 'findOneAndDelete' && docOf(res) ? [docOf(res)] : before;
    if (gone.length || !rule.fields) live.defer(() => rule.keysFor(gone, ctx));
    else live.bump(rule.bulk());
    return;
  }
  const found = docOf(res);
  const ids = idsIn(filter._id) || (before.length ? before.map((r) => String(r._id)) : null) ||
    (res?.upsertedId ? [String(res.upsertedId)] : null) || (found?._id ? [String(found._id)] : null);
  if (!ids || ids.length > MAX_ROWS) {
    live.bump(rule.bulk());
    return;
  }
  // Who sees them now: read again only when the write could have changed that.
  const reread = !before.length || movesAudience(rule, writtenPaths(query.getUpdate()));
  live.defer(async () => rule.keysFor([...(reread ? await ctx.rows(rule, ids) : []), ...before], ctx));
}

module.exports = function livePlugin(schema) {
  // Who could see a document when it was loaded (a save that takes somebody off it still reaches them).
  schema.post('init', function liveRemember() {
    quietly(() => {
      const rule = docRule(this);
      if (rule?.shape) this.$locals.liveBefore = rule.shape(this);
    });
  });

  // save(): decided BEFORE (afterwards the modified paths are reset). Runs
  // after the model's own pre-save hooks, so it sees what they changed too.
  schema.pre('save', function liveMarkChanged() {
    quietly(() => {
      const rule = docRule(this);
      if (!rule) return;
      const paths = this.isNew ? null : [...new Set(this.modifiedPaths().map((p) => p.split('.')[0]))];
      this.$locals.liveChanged = this.isNew || matters(rule, paths);
    });
  });
  schema.post('save', function liveSaved(doc) {
    quietly(() => {
      const rule = docRule(doc);
      if (!rule || doc.$locals?.liveChanged === false) return;
      const now = rule.shape ? rule.shape(doc) : doc;
      changed(rule, [now, doc.$locals?.liveBefore].filter(Boolean));
    });
  });

  for (const op of [...UPDATES, ...DELETES]) {
    schema.pre(op, QUERY_ONLY, function liveBeforeWrite() {
      return quietly(() => {
        const rule = queryRule(this);
        return rule ? beforeWrite(this, rule, op) : undefined;
      });
    });
    schema.post(op, QUERY_ONLY, function liveAfterWrite(res) {
      quietly(() => {
        const rule = queryRule(this);
        if (rule) afterWrite(this, rule, op, res);
      });
    });
  }

  schema.post('insertMany', function liveInserted(docs) {
    quietly(() => {
      const rule = ruleOf(this?.modelName);
      const list = [].concat(docs || []).filter(Boolean);
      if (rule && list.length) changed(rule, list.map((d) => (rule.shape ? rule.shape(d) : d)));
    });
  });

  // Mixed operations: the shared keys.
  schema.post('bulkWrite', function liveBulkWritten() {
    quietly(() => {
      const rule = ruleOf(this?.modelName);
      if (rule) live.bump(rule.bulk());
    });
  });
};

// For the tests: the pure helpers.
module.exports.touchedPaths = touchedPaths;
module.exports.matters = matters;
module.exports.movesAudience = movesAudience;
