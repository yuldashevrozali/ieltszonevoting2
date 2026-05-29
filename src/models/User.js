const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, unique: true },
  firstName:  { type: String, default: '' },
  lastName:   { type: String, default: '' },
  username:   { type: String, default: null },
  phone:      { type: String, default: null },
  state:      { type: String, default: null },   // FSM holati
  tempData:   { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt:  { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
