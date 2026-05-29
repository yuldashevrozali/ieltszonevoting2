// models/Vote.js
const mongoose = require('mongoose');

const voteSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  groupId: { type: Number, required: true },
  teacherId: { type: Number, required: true },
  votedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Vote', voteSchema);