/**
 * /api/files: upload a file, and open one.
 *
 * Opening works two ways: with a signed link (what API responses hand out,
 * so <img src> works), or with a normal session, in which case the product
 * decides whether this person may see the record the file is attached to.
 */
const express = require('express');
const multer = require('multer');
const product = require('../../product');
const { protect, isSuperAdmin } = require('../auth');
const { badRequest, notFound } = require('../errors');
const files = require('../services/files');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: product.files.maxBytes, files: 1 },
});

router.post('/', protect, upload.single('file'), async (req, res) => {
  const f = req.file;
  if (!f) throw badRequest('Choose a file to upload');
  const mime = String(f.mimetype || '').toLowerCase();
  if (!product.files.types.some((re) => re.test(mime))) {
    throw badRequest(product.files.typesMessage);
  }
  const saved = await files.saveFile({
    uploadedBy: req.user._id,
    buffer: f.buffer,
    name: f.originalname,
    mime,
  });
  res.status(201).json({ file: { ...saved, id: String(saved.id), url: files.signedPath(saved.id) } });
});

router.get('/:id', async (req, res, next) => {
  const meta = await files.getFile(req.params.id);
  if (!meta) throw notFound('File not found');

  const signed = req.query.sig && files.verifySignature(req.params.id, req.query.exp, req.query.sig);
  if (!signed) {
    // Fall back to the session.
    await new Promise((resolve, reject) => {
      Promise.resolve(protect(req, res, (err) => (err ? reject(err) : resolve()))).catch(reject);
    });
    const m = meta.metadata || {};
    const own = String(m.uploadedBy) === String(req.user._id);
    const allowed =
      own || isSuperAdmin(req.user) || (m.ref && (await product.canAccessFile({ user: req.user, ref: m.ref })));
    if (!allowed) throw notFound('File not found');
  }

  const mime = meta.metadata?.mime || 'application/octet-stream';
  const inline = files.INLINE_TYPES.test(mime) && req.query.download !== '1';
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Length', meta.length);
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(meta.filename)}`
  );
  res.setHeader('Cache-Control', 'private, max-age=3600');
  const stream = files.openStream(meta._id);
  stream.on('error', next);
  stream.pipe(res);
});

module.exports = router;
