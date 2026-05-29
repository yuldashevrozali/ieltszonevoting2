// models/Gift.js
const mongoose = require('mongoose');

const giftSchema = new mongoose.Schema({
  _id: { type: String, default: 'config' }, // Singleton pattern
  text: { type: String, required: true, default: '🎁 Sovg\'alar tez kunda!' },
  fileId: { type: String, default: null }, // Telegram photo file_id
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Gift', giftSchema);