/**
 * Running numbers (task codes, …), one sequence per name.
 */
const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { versionKey: false }
);

const Counter = mongoose.model('Counter', counterSchema);

/** Atomically take the next number in the sequence `name`. */
async function nextSeq(name) {
  const doc = await Counter.findOneAndUpdate(
    { _id: String(name) },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  ).lean();
  return doc.seq;
}

module.exports = Counter;
module.exports.nextSeq = nextSeq;
