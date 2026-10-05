/**
 * Two people who know each other's Task Pin, BBM style: one asks, the other
 * accepts, and from then on either can give the other a task.
 *
 * One document per pair, whoever asked: `a` and `b` are the two ids in sorted
 * order, so the unique index catches a second request in either direction.
 */
const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema(
  {
    a: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    b: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted'], default: 'pending' },
    acceptedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

contactSchema.index({ a: 1, b: 1 }, { unique: true });
contactSchema.index({ b: 1, status: 1 });

/** The pair's ids in stored order. */
function pairOf(x, y) {
  const [a, b] = [String(x), String(y)].sort();
  return { a: new mongoose.Types.ObjectId(a), b: new mongoose.Types.ObjectId(b) };
}

/** Filter for every link this person is part of. */
const involving = (userId) => ({ $or: [{ a: userId }, { b: userId }] });

/** The other person in a link. */
const otherOf = (link, userId) => (String(link.a) === String(userId) ? link.b : link.a);

module.exports = mongoose.model('Contact', contactSchema);
module.exports.pairOf = pairOf;
module.exports.involving = involving;
module.exports.otherOf = otherOf;
