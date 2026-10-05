/**
 * HTTP errors and the final error handler.
 *
 * Route code throws `HttpError`s (or lets Mongoose/Zod errors bubble); Express 5
 * forwards rejected promises here, and every response is `{ error, code? }`
 * with a message written for the person using the app.
 */
const multer = require('multer');

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const badRequest = (msg, code) => new HttpError(400, msg, code);
const unauthorized = (msg = 'Please sign in again', code) => new HttpError(401, msg, code);
const forbidden = (msg = "You don't have access to this", code) => new HttpError(403, msg, code);
const notFound = (msg = 'Not found') => new HttpError(404, msg);
const conflict = (msg) => new HttpError(409, msg);

function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Not found' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  if (err?.name === 'ZodError') {
    const issue = err.issues?.[0];
    const field = issue?.path?.join('.');
    return res.status(400).json({ error: issue ? `${field ? `${field}: ` : ''}${issue.message}` : 'Invalid input' });
  }
  if (err?.name === 'CastError') {
    return res.status(400).json({ error: 'Invalid id' });
  }
  if (err?.name === 'ValidationError') {
    const first = Object.values(err.errors || {})[0];
    return res.status(400).json({ error: first?.message || 'Invalid input' });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ error: 'That already exists' });
  }
  if (err instanceof multer.MulterError) {
    const tooBig = err.code === 'LIMIT_FILE_SIZE';
    return res.status(tooBig ? 413 : 400).json({ error: tooBig ? 'File is too large' : err.message });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request is too large' });
  }
  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

module.exports = {
  HttpError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  notFoundHandler,
  errorHandler,
};
