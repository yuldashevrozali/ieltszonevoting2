const mongoose = require('mongoose');

const voteSchema = new mongoose.Schema({
  userId:    { type: Number, required: true, unique: true }, // bitta user FAQAT 1 ta ovoz
  groupId:   { type: Number, required: true },
  teacherId: { type: Number, required: true },
  votedAt:   { type: Date, default: Date.now }
});

module.exports = mongoose.model('Vote', voteSchema);
