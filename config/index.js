// config/index.js
// ✅ dotenv ni shu yerda chaqiramiz - eng ishonchli usul
require('dotenv').config();

// Tokenni darhol tekshiramiz
const BOT_TOKEN = process.env.BOT_TOKEN?.trim();

if (!BOT_TOKEN) {
  console.error('❌ QATTIQ XATO: BOT_TOKEN topilmadi!');
  console.error('💡 Tekshiring:');
  console.error('   1. .env fayli ROOT papkasida bo\'lishi kerak');
  console.error('   2. BOT_TOKEN=... qatorida bo\'sh joy bo\'lmasligi kerak');
  console.error('   3. .env fayli nomida .env.old kabi qo\'shimcha bo\'lmasligi kerak');
  process.exit(1);
}

// ADMIN_ID - bitta yoki bir nechta ID ni qo'llab-quvvatlash
const ADMIN_ID_RAW = process.env.ADMIN_ID;
const ADMIN_ID = ADMIN_ID_RAW?.includes(',') 
  ? ADMIN_ID_RAW.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
  : parseInt(ADMIN_ID_RAW);

module.exports = {
  BOT_TOKEN,
  MONGODB_URI: process.env.MONGODB_URI?.trim() || 'mongodb://localhost:27017/voting_bot',
  ADMIN_ID,
  CHANNEL_USERNAME: process.env.CHANNEL_USERNAME?.trim()?.replace(/^@/, ''),
  GROUP_ID_START: parseInt(process.env.GROUP_ID_START) || 1500,
  
  // Qo'shimcha sozlamalar
  FORCE_SUBSCRIPTION: process.env.FORCE_SUBSCRIPTION !== 'false',
  DEBUG: process.env.NODE_ENV === 'development'
};