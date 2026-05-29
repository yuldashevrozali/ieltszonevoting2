const { Markup } = require('telegraf');
const Group = require('../models/Group');
const Teacher = require('../models/Teacher');
const config = require('../../config');

// ═══════════════════════════════════════════════════════
//  ID GENERATOR
// ═══════════════════════════════════════════════════════

/**
 * Keyingi guruh ID raqamini qaytaradi
 * @returns {Promise<number>}
 */
async function getNextGroupId() {
  try {
    const last = await Group.findOne().sort({ groupId: -1 });
    return last ? last.groupId + 1 : (config.GROUP_ID_START || 1500);
  } catch (err) {
    console.error('❌ getNextGroupId xatosi:', err);
    return config.GROUP_ID_START || 1500;
  }
}

/**
 * Keyingi o'qituvchi ID raqamini qaytaradi (agar kerak bo'lsa)
 * @returns {Promise<number>}
 */
async function getNextTeacherId() {
  try {
    const last = await Teacher.findOne().sort({ telegramId: -1 });
    return last ? last.telegramId + 1 : (config.TEACHER_ID_START || 10000);
  } catch (err) {
    console.error('❌ getNextTeacherId xatosi:', err);
    return config.TEACHER_ID_START || 10000;
  }
}

// ═══════════════════════════════════════════════════════
//  VALIDATION FUNCTIONS
// ═══════════════════════════════════════════════════════

/**
 * Vaqt formatini tekshirish: HH:MM-HH:MM
 * @param {string} str - Tekshiriladigan vaqt stringi
 * @returns {boolean}
 */
function isValidTimeSlot(str) {
  if (!str || typeof str !== 'string') return false;
  
  // Format: HH:MM-HH:MM
  const regex = /^\d{2}:\d{2}-\d{2}:\d{2}$/;
  if (!regex.test(str)) return false;
  
  // Vaqtlarni ajratib olish
  const [start, end] = str.split('-');
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  
  // Soat va daqiqa chegaralari
  if (startH < 0 || startH > 23 || startM < 0 || startM > 59) return false;
  if (endH < 0 || endH > 23 || endM < 0 || endM > 59) return false;
  
  // Boshlanish vaqti tugash vaqtidan oldin bo'lishi kerak
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  if (startMinutes >= endMinutes) return false;
  
  return true;
}

/**
 * Yoshni tekshirish (5-100 oralig'ida)
 * @param {string|number} age - Tekshiriladigan yosh
 * @returns {boolean}
 */
function isValidAge(age) {
  const num = parseInt(age);
  return !isNaN(num) && num >= 5 && num <= 100;
}

/**
 * Telefon raqamini tekshirish (O'zbekiston formati)
 * @param {string} phone - Telefon raqami
 * @returns {boolean}
 */
function isValidUzbekPhone(phone) {
  if (!phone) return false;
  // +998 bilan boshlanishi yoki 998 raqamlari
  const cleaned = phone.replace(/^\+/, '').replace(/\s/g, '');
  return cleaned.startsWith('998') && cleaned.length === 12;
}

// ═══════════════════════════════════════════════════════
//  PAGINATION HELPERS
// ═══════════════════════════════════════════════════════

/**
 * Guruhlar uchun sahifali inline keyboard yaratish
 * @param {Array} groups - Guruhlar arrayi
 * @param {number} page - Joriy sahifa (0-indexed)
 * @param {number} teacherId - O'qituvchi ID (pagination uchun)
 * @param {number} pageSize - Har sahifadagi elementlar soni
 * @returns {Object} Reply markup object
 */
function getPaginatedGroupsKeyboard(groups, page = 0, teacherId, pageSize = 5) {
  if (!Array.isArray(groups)) groups = [];
  
  const total = groups.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(0, page), totalPages - 1);
  
  const start = currentPage * pageSize;
  const pageGroups = groups.slice(start, start + pageSize);

  const buttons = pageGroups.map(g => ([{
    text: `⏰ ${g.timeSlot} | 📚 ${g.name} | ${g.weekType} | 🗳${g.votes}`,
    callback_data: `vote_group_${g.groupId}`
  }]));

  // Navigatsiya tugmalari
  const navRow = [];
  if (totalPages > 1) {
    if (currentPage > 0) {
      navRow.push({ 
        text: `⬅️ ${currentPage}`, 
        callback_data: `groups_page_${teacherId}_${currentPage - 1}` 
      });
    }
    navRow.push({ 
      text: `📄 ${currentPage + 1}/${totalPages}`, 
      callback_data: 'noop' // Faqat ko'rsatish uchun
    });
    if (currentPage < totalPages - 1) {
      navRow.push({ 
        text: `${currentPage + 2} ➡️`, 
        callback_data: `groups_page_${teacherId}_${currentPage + 1}` 
      });
    }
  }
  if (navRow.length) buttons.push(navRow);
  
  // Orqaga tugmasi
  buttons.push([{ text: '🔙 Orqaga', callback_data: 'back_to_teachers' }]);

  return { reply_markup: { inline_keyboard: buttons } };
}

/**
 * O'qituvchilar uchun sahifali inline keyboard yaratish (Admin panel)
 * @param {Array} teachers - O'qituvchilar arrayi
 * @param {number} page - Joriy sahifa (0-indexed)
 * @param {string} prefix - Callback data prefixi
 * @param {number} pageSize - Har sahifadagi elementlar soni
 * @returns {Object} { keyboard: Array, pageInfo: string }
 */
function getPaginatedTeachersKeyboard(teachers, page = 0, prefix = 'admin_teacher_', pageSize = 5) {
  if (!Array.isArray(teachers)) teachers = [];
  
  const total = teachers.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(0, page), totalPages - 1);
  
  const start = currentPage * pageSize;
  const pageTeachers = teachers.slice(start, start + pageSize);

  const keyboard = pageTeachers.map(t => [{
    text: `👨‍🏫 ${t.name}`,
    callback_data: `${prefix}${t.telegramId}`
  }]);

  // Navigatsiya
  const navRow = [];
  if (totalPages > 1) {
    if (currentPage > 0) {
      navRow.push({ 
        text: '⬅️', 
        callback_data: `${prefix.replace(/_\d+$/, '')}_page_${currentPage - 1}` 
      });
    }
    if (currentPage < totalPages - 1) {
      navRow.push({ 
        text: '➡️', 
        callback_data: `${prefix.replace(/_\d+$/, '')}_page_${currentPage + 1}` 
      });
    }
  }
  if (navRow.length) keyboard.push(navRow);

  const pageInfo = totalPages > 1 ? ` (${currentPage + 1}/${totalPages})` : '';
  
  return { keyboard, pageInfo, totalPages };
}

/**
 * Umumiy maqsadli pagination yordamchisi
 * @param {Array} items - Elementlar arrayi
 * @param {Object} options - Sozlamalar
 * @returns {Object} { items: Array, pageInfo: string, hasPrev: boolean, hasNext: boolean }
 */
function paginateItems(items, options = {}) {
  const {
    page = 0,
    pageSize = 5,
    prefix = 'item_',
    idField = 'id',
    textField = 'name',
    extraData = {}
  } = options;
  
  if (!Array.isArray(items)) items = [];
  
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(0, page), totalPages - 1);
  
  const start = currentPage * pageSize;
  const pageItems = items.slice(start, start + pageSize);

  const keyboard = pageItems.map(item => [{
    text: typeof textField === 'function' 
      ? textField(item) 
      : item[textField] || String(item),
    callback_data: `${prefix}${item[idField] || item._id || item}`
  }]);

  return {
    keyboard,
    pageInfo: totalPages > 1 ? ` (${currentPage + 1}/${totalPages})` : '',
    hasPrev: currentPage > 0,
    hasNext: currentPage < totalPages - 1,
    currentPage,
    totalPages,
    prevPage: currentPage > 0 ? currentPage - 1 : null,
    nextPage: currentPage < totalPages - 1 ? currentPage + 1 : null
  };
}

// ═══════════════════════════════════════════════════════
//  SUBSCRIPTION & AUTH
// ═══════════════════════════════════════════════════════

/**
 * Foydalanuvchining kanalga obuna ekanligini tekshirish
 * @param {Object} ctx - Telegraf context
 * @returns {Promise<boolean>}
 */
async function checkSubscription(ctx) {
  // Agar CHANNEL_USERNAME sozlanmagan bo'lsa, tekshirishni o'tkazib yuboramiz
  if (!config.CHANNEL_USERNAME) return true;
  
  try {
    const channel = `@${config.CHANNEL_USERNAME.replace(/^@/, '')}`;
    const member = await ctx.telegram.getChatMember(channel, ctx.from.id);
    
    // Ruxsat berilgan statuslar
    const allowedStatuses = ['member', 'administrator', 'creator'];
    return allowedStatuses.includes(member.status);
    
  } catch (err) {
    // Agar bot kanalda admin bo'lmasa yoki boshqa xato
    console.error(`⚠️ checkSubscription xatosi: ${err.message}`);
    
    // Ishonchli bo'lmagan holatda false qaytaramiz (xavfsizlik uchun)
    // Yoki config.da FORCE_SUBSCRIPTION=false bo'lsa true qaytarish mumkin
    return !config.FORCE_SUBSCRIPTION;
  }
}

/**
 * Foydalanuvchi admin ekanligini tekshirish
 * @param {number} userId - Telegram user ID
 * @returns {boolean}
 */
function isAdmin(userId) {
  // config.ADMIN_ID - bitta ID yoki IDlar arrayi bo'lishi mumkin
  if (Array.isArray(config.ADMIN_ID)) {
    return config.ADMIN_ID.includes(userId);
  }
  return userId === config.ADMIN_ID;
}

/**
 * Foydalanuvchi premium ekanligini tekshirish (kelajak uchun)
 * @param {Object} user - User object
 * @returns {boolean}
 */
function isPremium(user) {
  return user?.isPremium === true;
}

// ═══════════════════════════════════════════════════════
//  KEYBOARD HELPERS
// ═══════════════════════════════════════════════════════

/**
 * Kontakt so'rash uchun keyboard
 * @returns {Object} Markup object
 */
function getContactKeyboard() {
  return Markup.keyboard([
    [Markup.button.contactRequest('📱 Kontakt ulashish')]
  ]).resize();
}

/**
 * Asosiy user menu keyboardi (ovozi berilgan userlar uchun)
 * @returns {Object} Inline keyboard object
 */
function getPostVoteKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🎁 Sovg\'alar', 'show_gifts')],
    [Markup.button.callback('🏆 Top 15', 'show_top15')],
    [Markup.button.callback('🔄 Yangi ovoz berish', 'back_to_teachers')]
  ]);
}

/**
 * Admin panel asosiy keyboardi
 * @returns {Object} Inline keyboard object
 */
function getAdminPanelKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('👨‍🏫 O\'qituvchilar', 'admin_teachers'),
     Markup.button.callback('📋 Guruhlar', 'admin_groups')],
    [Markup.button.callback('📊 Statistika', 'admin_stats'),
     Markup.button.callback('📢 Broadcast', 'admin_broadcast')],
    [Markup.button.callback('🎁 Sovg\'a sozlash', 'admin_gift_config')]
  ]);
}

/**
 * Bekor qilish tugmasi bilan keyboard
 * @param {string} backAction - Orqaga qaytish callback actioni
 * @returns {Object} Inline keyboard object
 */
function getCancelKeyboard(backAction) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('❌ Bekor qilish', backAction || 'admin_back')]
  ]);
}

// ═══════════════════════════════════════════════════════
//  TEXT FORMATTING
// ═══════════════════════════════════════════════════════

/**
 * Matnni markdown formatida escape qilish
 * @param {string} text - Escape qilinadigan matn
 * @returns {string}
 */
function escapeMarkdown(text) {
  if (!text) return '';
  const chars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
  let result = text;
  for (const char of chars) {
    result = result.replace(new RegExp(`\\${char}`, 'g'), `\\${char}`);
  }
  return result;
}

/**
 * Matnni HTML formatida escape qilish
 * @param {string} text - Escape qilinadigan matn
 * @returns {string}
 */
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Raqamni chiroyli formatda ko'rsatish (masalan: 1,234)
 * @param {number} num - Formatlanadigan raqam
 * @returns {string}
 */
function formatNumber(num) {
  if (typeof num !== 'number' || isNaN(num)) return '0';
  return num.toLocaleString('en-US');
}

/**
 * Vaqtni chiroyli formatda ko'rsatish
 * @param {string} timeSlot - HH:MM-HH:MM formatidagi vaqt
 * @returns {string}
 */
function formatTimeSlot(timeSlot) {
  if (!isValidTimeSlot(timeSlot)) return timeSlot || '?';
  const [start, end] = timeSlot.split('-');
  return `${start} — ${end}`;
}

/**
 * Sanani chiroyli formatda ko'rsatish
 * @param {Date|string} date - Formatlanadigan sana
 * @param {string} locale - Locale (default: 'uz-UZ')
 * @returns {string}
 */
function formatDate(date, locale = 'uz-UZ') {
  if (!date) return '?';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '?';
  
  return d.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// ═══════════════════════════════════════════════════════
//  UTILS
// ═══════════════════════════════════════════════════════

/**
 * Promise ni kechiktirish (delay) uchun yordamchi
 * @param {number} ms - Milliseconds
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Arrayni tasodifiy tartibda aralashtirish (Fisher-Yates)
 * @param {Array} array - Aralashtiriladigan array
 * @returns {Array}
 */
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Objectdan faqat kerakli maydonlarni ajratib olish
 * @param {Object} obj - Manba object
 * @param {Array} fields - Kerakli maydonlar
 * @returns {Object}
 */
function pick(obj, fields) {
  if (!obj || typeof obj !== 'object') return {};
  const result = {};
  for (const field of fields) {
    if (field in obj) {
      result[field] = obj[field];
    }
  }
  return result;
}

/**
 * Objectdan ma'lum maydonlarni chiqarib tashlash
 * @param {Object} obj - Manba object
 * @param {Array} fields - Chiqarib tashlanadigan maydonlar
 * @returns {Object}
 */
function omit(obj, fields) {
  if (!obj || typeof obj !== 'object') return {};
  const result = {};
  for (const key in obj) {
    if (!fields.includes(key)) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Guruhni chiroyli formatda ko'rsatish uchun matn yaratish
 * @param {Object} group - Group object
 * @param {Object} teacher - Teacher object (ixtiyoriy)
 * @returns {string}
 */
function formatGroupInfo(group, teacher = null) {
  if (!group) return 'Guruh topilmadi!';
  
  let text = `📚 *${group.name}*\n`;
  text += `🆔 ID: \`${group.groupId}\`\n`;
  
  if (teacher?.name) {
    text += `👨‍🏫 O'qituvchi: *${teacher.name}*\n`;
  }
  
  text += `⏰ Vaqt: *${formatTimeSlot(group.timeSlot)}*\n`;
  text += `📅 Kunlar: *${group.weekType}*\n`;
  text += `🗳 Ovozlar: *${group.votes}*`;
  
  return text;
}

/**
 * O'qituvchini chiroyli formatda ko'rsatish
 * @param {Object} teacher - Teacher object
 * @param {number} groupsCount - Guruhlar soni (ixtiyoriy)
 * @returns {string}
 */
function formatTeacherInfo(teacher, groupsCount = null) {
  if (!teacher) return 'O\'qituvchi topilmadi!';
  
  let text = `👨‍🏫 *${teacher.name}*\n`;
  text += `🆔 ID: \`${teacher.telegramId}\``;
  
  if (groupsCount !== null) {
    text += `\n📋 Guruhlar: *${groupsCount}*`;
  }
  
  return text;
}

// ═══════════════════════════════════════════════════════
//  BROADCAST HELPERS
// ═══════════════════════════════════════════════════════

/**
 * Broadcast uchun userlarni filtrlash (faqat tasdiqlangan userlar)
 * @param {Array} users - Barcha userlar
 * @returns {Array}
 */
function getVerifiedUsers(users) {
  return users.filter(u => u?.phone && u?.phone.startsWith('+998'));
}

/**
 * Broadcast progress xabarini formatlash
 * @param {number} sent - Yuborilganlar soni
 * @param {number} failed - Xato bo'lganlar soni
 * @param {number} total - Jami userlar soni
 * @returns {string}
 */
function formatBroadcastProgress(sent, failed, total) {
  const percent = total > 0 ? Math.round((sent / total) * 100) : 0;
  const bar = '█'.repeat(Math.floor(percent / 10)) + '░'.repeat(10 - Math.floor(percent / 10));
  
  return `📤 *Broadcast Progress*\n\n` +
    `[${bar}] ${percent}%\n\n` +
    `✅ Muvaffaqiyatli: ${sent}\n` +
    `❌ Xato: ${failed}\n` +
    `📊 Jami: ${total}`;
}

// ═══════════════════════════════════════════════════════
//  EXPORTS
// ═══════════════════════════════════════════════════════

module.exports = {
  // ID Generators
  getNextGroupId,
  getNextTeacherId,
  
  // Validators
  isValidTimeSlot,
  isValidAge,
  isValidUzbekPhone,
  
  // Pagination
  getPaginatedGroupsKeyboard,
  getPaginatedTeachersKeyboard,
  paginateItems,
  
  // Auth & Subscription
  checkSubscription,
  isAdmin,
  isPremium,
  
  // Keyboards
  getContactKeyboard,
  getPostVoteKeyboard,
  getAdminPanelKeyboard,
  getCancelKeyboard,
  
  // Text Formatting
  escapeMarkdown,
  escapeHtml,
  formatNumber,
  formatTimeSlot,
  formatDate,
  
  // Utils
  delay,
  shuffleArray,
  pick,
  omit,
  formatGroupInfo,
  formatTeacherInfo,
  
  // Broadcast
  getVerifiedUsers,
  formatBroadcastProgress
};