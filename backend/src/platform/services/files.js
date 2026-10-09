/**
 * Uploaded files (bill photos, attachments), stored in MongoDB GridFS so a
 * deployment is just "the server + the database".
 *
 * Flow: the app uploads a file first (POST /api/files) and gets an id back,
 * then sends that id with the entry it belongs to. Attaching stamps the file
 * with its owner (`metadata.ref`), and the product decides who may open it.
 * Uploads never attached are removed after a day.
 *
 * Files are served through short-lived signed links, so an <img> tag or a
 * download manager can load them without an Authorization header.
 */
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const config = require('../../config');
const { badRequest } = require('../errors');

const BUCKET = 'files';
const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: BUCKET });
const filesCollection = () => mongoose.connection.db.collection(`${BUCKET}.files`);

// Types a browser may render inline. Anything else is always a download.
const INLINE_TYPES = /^(image\/(jpeg|png|webp|gif)|application\/pdf|audio\/.+|video\/mp4)$/;

function toObjectId(id) {
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (typeof id === 'string' && /^[a-f\d]{24}$/i.test(id)) return new mongoose.Types.ObjectId(id);
  return null;
}

function cleanName(name) {
  const base = String(name || 'file')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .trim();
  return base.slice(-120) || 'file';
}

/** Store a file. @returns {Promise<object>} the stored file's summary. */
function saveFile({ uploadedBy, buffer, name, mime, ref = null }) {
  const filename = cleanName(name);
  return new Promise((resolve, reject) => {
    const stream = bucket().openUploadStream(filename, {
      metadata: { uploadedBy, mime, ref: ref ? { kind: ref.kind, id: ref.id } : null },
    });
    stream.once('error', reject);
    stream.once('finish', () =>
      resolve({ id: stream.id, name: filename, mime, size: buffer.length })
    );
    stream.end(buffer);
  });
}

const getFile = (id) => {
  const oid = toObjectId(id);
  return oid ? filesCollection().findOne({ _id: oid }) : null;
};

const openStream = (id) => bucket().openDownloadStream(toObjectId(id));

/**
 * Attach uploaded files to a record. Each file must either be the caller's own
 * fresh upload or already belong to `ref`.
 * @returns {Promise<Array<{file, name, mime, size}>>} in the order given
 */
async function attachFiles({ userId, ids, ref }) {
  const list = [...new Set((ids || []).map(String))];
  if (!list.length) return [];
  const oids = list.map(toObjectId);
  if (oids.some((o) => !o)) throw badRequest('One of the files is invalid');

  const docs = await filesCollection()
    .find({ _id: { $in: oids } })
    .toArray();
  const byId = new Map(docs.map((d) => [String(d._id), d]));

  for (const id of list) {
    const d = byId.get(id);
    const m = d?.metadata;
    const ownFresh = m && !m.ref && String(m.uploadedBy) === String(userId);
    const sameRef = m?.ref && m.ref.kind === ref.kind && String(m.ref.id) === String(ref.id);
    if (!ownFresh && !sameRef) throw badRequest('One of the files could not be found. Please attach it again.');
  }

  await filesCollection().updateMany(
    { _id: { $in: oids }, 'metadata.ref': null },
    { $set: { 'metadata.ref': { kind: ref.kind, id: ref.id } } }
  );

  return list.map((id) => {
    const d = byId.get(id);
    return { file: d._id, name: d.filename, mime: d.metadata.mime, size: d.length };
  });
}

async function deleteFiles(ids) {
  for (const id of ids || []) {
    const oid = toObjectId(id);
    if (!oid) continue;
    try {
      await bucket().delete(oid);
    } catch {
      /* already gone */
    }
  }
}

/**
 * Remove every file filed under `ref` (a person's profile photos, say).
 * @returns {Promise<number>} how many went
 */
async function deleteFilesByRef(ref) {
  const oid = toObjectId(String(ref.id));
  const docs = await filesCollection()
    .find({ 'metadata.ref.kind': ref.kind, 'metadata.ref.id': { $in: [oid, String(ref.id)].filter(Boolean) } })
    .project({ _id: 1 })
    .toArray();
  await deleteFiles(docs.map((d) => d._id));
  return docs.length;
}

/** Remove uploads that were never attached to anything. */
async function cleanupOrphans(maxAgeMs = 24 * 3600 * 1000) {
  const cutoff = new Date(Date.now() - maxAgeMs);
  const stale = await filesCollection()
    .find({ 'metadata.ref': null, uploadDate: { $lt: cutoff } })
    .project({ _id: 1 })
    .toArray();
  await deleteFiles(stale.map((d) => d._id));
  return stale.length;
}

// ---------------------------------------------------------------- signed links

const sign = (id, exp) =>
  crypto.createHmac('sha256', config.fileUrlSecret).update(`${id}.${exp}`).digest('base64url').slice(0, 32);

/**
 * A link that opens the file without a session, valid for at least `ttlSec`.
 * The expiry is rounded up to `stepSec` (an hour) so the same file keeps the
 * same URL for that long and clients can cache it.
 */
function signedPath(id, ttlSec = 12 * 3600, stepSec = 3600) {
  const exp = Math.ceil((Date.now() / 1000 + ttlSec) / stepSec) * stepSec;
  return `/api/files/${id}?exp=${exp}&sig=${sign(String(id), exp)}`;
}

/**
 * Profile photos (ref kind 'avatar') appear in every list, so their links
 * stay the same for a whole day (each is valid for 12 to 36 hours) and the
 * apps may cache them that long. A photo file never changes: a new photo is
 * a new file, so a new link.
 */
const AVATAR_CACHE_SEC = 24 * 3600;
const avatarPath = (id) => signedPath(id, 12 * 3600, AVATAR_CACHE_SEC);

function verifySignature(id, exp, sig) {
  const e = Number(exp);
  if (!Number.isFinite(e) || e * 1000 < Date.now() || typeof sig !== 'string') return false;
  const expected = Buffer.from(sign(String(id), e));
  const given = Buffer.from(sig);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

/** Summary of an attached file for API responses. */
const fileView = (f) =>
  f && { id: String(f.file), name: f.name, mime: f.mime, size: f.size, url: signedPath(f.file) };

module.exports = {
  saveFile,
  getFile,
  openStream,
  attachFiles,
  deleteFiles,
  deleteFilesByRef,
  cleanupOrphans,
  signedPath,
  avatarPath,
  AVATAR_CACHE_SEC,
  verifySignature,
  fileView,
  INLINE_TYPES,
};
