const mongoose = require('mongoose');

const teacherSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, unique: true },
  name: { type: String, required: true },
  username: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Teacher', teacherSchema);
