const mongoose = require('mongoose');

const WEEK_TYPES = ['Toq kunlar', 'Juft kunlar'];

const groupSchema = new mongoose.Schema({
  groupId:   { type: Number, required: true, unique: true },
  teacherId: { type: Number, required: true },
  timeSlot:  { type: String, required: true },   // erkin format: "11:20-12:50"
  name:      { type: String, required: true },   // "IELTS Standard"
  weekType:  { type: String, enum: WEEK_TYPES, required: true },
  votes:     { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

// Har bir teacher uchun bir vaqtda faqat bir xil (timeSlot+weekType) bo'lishi mumkin
groupSchema.index({ teacherId: 1, timeSlot: 1, weekType: 1 }, { unique: true });

groupSchema.statics.WEEK_TYPES = WEEK_TYPES;

module.exports = mongoose.model('Group', groupSchema);
