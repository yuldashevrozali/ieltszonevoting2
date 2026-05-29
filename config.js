// config.js - Loyiha ROOT papkasida bo'lishi kerak
require('dotenv').config();

// Tokenni tekshirish - darhol xato berish uchun
const BOT_TOKEN = process.env.BOT_TOKEN?.trim();
if (!BOT_TOKEN) {
  console.error('❌ XATO: BOT_TOKEN .env faylida topilmadi yoki bo\'sh!');
  console.error('💡 Iltimos, .env faylingizni tekshiring:');
  console.error('   BOT_TOKEN=123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw');
  process.exit(1);
}

// ADMIN_ID - bitta ID yoki vergul bilan ajratilgan bir nechta ID
const ADMIN_ID_RAW = process.env.ADMIN_ID;
const ADMIN_ID = ADMIN_ID_RAW?.includes(',') 
  ? ADMIN_ID_RAW.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
  : parseInt(ADMIN_ID_RAW);

if (!ADMIN_ID || (Array.isArray(ADMIN_ID) && ADMIN_ID.length === 0)) {
  console.warn('⚠️ Ogohlantirish: ADMIN_ID .env da to\'g\'ri sozlanmagan!');
}

module.exports = {
  // 🤖 Bot
  BOT_TOKEN,
  ADMIN_ID,
  CHANNEL_USERNAME: process.env.CHANNEL_USERNAME?.replace(/^@/, ''),
  
  // 🗄️ MongoDB
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/ieltsbot',
  
  // 🔢 ID Sozlamalari
  GROUP_ID_START: parseInt(process.env.GROUP_ID_START) || 1500,
  TEACHER_ID_START: parseInt(process.env.TEACHER_ID_START) || 10000,
  
  // ⚙️ Qo'shimcha
  FORCE_SUBSCRIPTION: process.env.FORCE_SUBSCRIPTION !== 'false',
  BROADCAST_DELAY_MS: parseInt(process.env.BROADCAST_DELAY_MS) || 30,
  DEFAULT_PAGE_SIZE: parseInt(process.env.DEFAULT_PAGE_SIZE) || 5,
  
  // 🌐 Server
  PORT: parseInt(process.env.PORT) || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // 🔍 Debug uchun (faqat developmentda)
  DEBUG: process.env.NODE_ENV === 'development'
};