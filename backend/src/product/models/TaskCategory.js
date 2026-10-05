/**
 * What a task is filed under. Personal (yours) or team-wide (made by a team
 * owner/admin). Tasks store the NAME, so renaming carries the tasks with it
 * and removing one never blanks them.
 */
const mongoose = require('mongoose');
const { ObjectId } = require('./shared');

const taskCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    team: { type: ObjectId, ref: 'Team', default: null },
    // "team:<id>" or "user:<id>": one "Sales" per list, whatever the case.
    scope: { type: String, required: true },
    color: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: ObjectId, ref: 'User' },
    createdByName: { type: String, trim: true },
  },
  { timestamps: true }
);

taskCategorySchema.index({ scope: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

taskCategorySchema.statics.scopeOf = (team, userId) => (team ? `team:${team}` : `user:${userId}`);

module.exports = mongoose.model('TaskCategory', taskCategorySchema);
