/**
 * /api/me: the signed-in person's own settings and profile photo.
 */
const express = require('express');
const multer = require('multer');
const product = require('../../product');
const User = require('../models/User');
const { publicUser } = require('../models/User');
const { protect } = require('../auth');
const { HttpError, badRequest } = require('../errors');
const files = require('../services/files');

const router = express.Router();
router.use(protect);

router.get('/settings', (req, res) => {
  res.json({ settings: req.settings });
});

router.patch('/settings', async (req, res) => {
  // Merge onto the stored settings so two quick saves don't undo each other.
  const current = await User.findById(req.user._id).select('settings').lean();
  const settings = product.settings.merge(current?.settings, req.body);
  await User.updateOne({ _id: req.user._id }, { $set: { settings } });
  await require('../services/activity').record({ req, action: 'profile.settings_changed', meta: { fields: Object.keys(req.body || {}).slice(0, 12) } });
  res.json({ settings: product.settings.read(settings) });
});

// ---------------------------------------------------------------- profile photo

// The apps send a 512 px square JPEG; 2 MB leaves room for a PNG or WebP.
const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const photoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: PHOTO_MAX_BYTES, files: 1 } }).single('photo');

/** Read the multipart `photo`, in plain words when it can't be read. */
function receivePhoto(req, res, next) {
  photoUpload(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, 'That photo is too large. Choose one under 2 MB.'));
    if (err instanceof multer.MulterError) return next(badRequest('Send the photo as the "photo" field.'));
    next(badRequest('Could not read that photo. Please try again.'));
  });
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** What the bytes say the image is. The type the client declared is not trusted. */
function sniffImage(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.subarray(0, 8).equals(PNG_SIGNATURE)) return { mime: 'image/png', ext: 'png' };
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

/** PUT /photo (multipart `photo`: JPEG, PNG or WebP, up to 2 MB) → { user } */
router.put('/photo', receivePhoto, async (req, res) => {
  const f = req.file;
  if (!f?.buffer?.length) throw badRequest('Choose a photo to upload');
  const kind = sniffImage(f.buffer);
  if (!kind) throw badRequest('That file is not a photo we can use. Choose a JPEG, PNG or WebP image.');

  const me = req.user._id;
  const saved = await files.saveFile({
    uploadedBy: me,
    buffer: f.buffer,
    name: `photo.${kind.ext}`,
    mime: kind.mime,
    ref: { kind: 'avatar', id: me },
  });
  const photo = { file: saved.id, updatedAt: new Date() };
  let before;
  try {
    // Swap in one step and remove exactly what it replaced, so two quick uploads can't lose the newer photo.
    before = await User.findOneAndUpdate({ _id: me }, { $set: { photo } }, { projection: { photo: 1 } }).lean();
  } catch (err) {
    await files.deleteFiles([saved.id]);
    throw err;
  }
  if (before?.photo?.file) await files.deleteFiles([before.photo.file]);
  await require('../services/activity').record({ req, action: before?.photo?.file ? 'profile.photo_changed' : 'profile.photo_added' });

  req.user.photo = photo;
  res.json({ user: publicUser(req.user) });
});

/** DELETE /photo → { user } (back to initials) */
router.delete('/photo', async (req, res) => {
  const before = await User.findOneAndUpdate({ _id: req.user._id }, { $unset: { photo: 1 } }, { projection: { photo: 1 } }).lean();
  if (before?.photo?.file) {
    await files.deleteFiles([before.photo.file]);
    await require('../services/activity').record({ req, action: 'profile.photo_removed' });
  }
  req.user.photo = undefined;
  res.json({ user: publicUser(req.user) });
});

module.exports = router;
