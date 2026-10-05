/**
 * Input validation helpers (Zod).
 */
const { z } = require('zod');
const mongoose = require('mongoose');
const { badRequest } = require('./errors');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const password = z
  .string({ required_error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long');

const trimmed = (max, label = 'Value') =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer`);

/** Parse or throw a 400 whose message names the first bad field. */
function parse(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const field = issue.path.join('.');
  throw badRequest(field && !issue.message.toLowerCase().includes(field.toLowerCase()) ? `${field}: ${issue.message}` : issue.message);
}

/** Validate a route id param and return it as an ObjectId. */
function idParam(value, label = 'id') {
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) {
    throw badRequest(`Invalid ${label}`);
  }
  return new mongoose.Types.ObjectId(value);
}

module.exports = { z, objectId, password, trimmed, parse, idParam };
