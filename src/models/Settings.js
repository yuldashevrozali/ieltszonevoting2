// models/Settings.js
const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  _id: { type: String, default: 'config' }, // Singleton pattern
  votingClosed: { type: Boolean, default: false }, // ✅ Turnir tugaganda true bo'ladi
  closedAt: { type: Date, default: null },
  updatedAt: { type: Date, default: Date.now }
});

// ── Yordamchi: sozlamalarni olish (bo'lmasa yaratadi) ───────────────────────
settingsSchema.statics.get = async function () {
  let doc = await this.findById('config');
  if (!doc) doc = await this.create({ _id: 'config' });
  return doc;
};

// ── Yordamchi: ovoz berish ochiqmi? ─────────────────────────────────────────
settingsSchema.statics.isVotingClosed = async function () {
  const doc = await this.findById('config');
  return !!doc?.votingClosed;
};

module.exports = mongoose.model('Settings', settingsSchema);
