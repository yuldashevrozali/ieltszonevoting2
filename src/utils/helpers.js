const { Markup } = require('telegraf');
const Group = require('../models/Group');
const Teacher = require('../models/Teacher');
const User = require('../models/User'); // ✅ User modelini import qildik (clearState uchun)
const config = require('../../config');

// ═══════════════════════════════════════════════════════
//  ID GENERATOR
// ═══════════════════════════════════════════════════════

async function getNextGroupId() {
  try {
    const last = await Group.findOne().sort({ groupId: -1 });
    return last ? last.groupId + 1 : (config.GROUP_ID_START || 1500);
  } catch (err) {
    console.error('❌ getNextGroupId xatosi:', err);
    return config.GROUP_ID_START || 1500;
  }
}

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
//  STATE MANAGEMENT (Yangi)
// ═══════════════════════════════════════════════════════

/**
 * User state ni tozalash
 * @param {number} userId - Telegram user ID
 */
async function clearState(userId) {
  await User.findOneAndUpdate(
    { telegramId: userId }, 
    { state: null, tempData: {} }
  );
}

// ═══════════════════════════════════════════════════════
//  VALIDATION FUNCTIONS
// ═══════════════════════════════════════════════════════

function isValidTimeSlot(str) {
  if (!str || typeof str !== 'string') return false;
  const regex = /^\d{2}:\d{2}-\d{2}:\d{2}$/;
  if (!regex.test(str)) return false;
  
  const [start, end] = str.split('-');
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  
  if (startH < 0 || startH > 23 || startM < 0 || startM > 59) return false;
  if (endH < 0 || endH > 23 || endM < 0 || endM > 59) return false;
  
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  if (startMinutes >= endMinutes) return false;
  
  return true;
}

function isValidAge(age) {
  const num = parseInt(age);
  return !isNaN(num) && num >= 5 && num <= 100;
}

function isValidUzbekPhone(phone) {
  if (!phone) return false;
  const cleaned = phone.replace(/^\+/, '').replace(/\s/g, '');
  return cleaned.startsWith('998') && cleaned.length === 12;
}

// ═══════════════════════════════════════════════════════
//  PAGINATION HELPERS
// ═══════════════════════════════════════════════════════

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
      callback_data: 'noop'
    });
    if (currentPage < totalPages - 1) {
      navRow.push({ 
        text: `${currentPage + 2} ➡️`, 
        callback_data: `groups_page_${teacherId}_${currentPage + 1}` 
      });
    }
  }
  if (navRow.length) buttons.push(navRow);
  buttons.push([{ text: '🔙 Orqaga', callback_data: 'back_to_teachers' }]);

  return { reply_markup: { inline_keyboard: buttons } };
}

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
    text: typeof textField === 'function' ? textField(item) : item[textField] || String(item),
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

async function checkSubscription(ctx) {
  if (!config.CHANNEL_USERNAME) return true;
  
  try {
    const channel = `@${config.CHANNEL_USERNAME.replace(/^@/, '')}`;
    const member = await ctx.telegram.getChatMember(channel, ctx.from.id);
    const allowedStatuses = ['member', 'administrator', 'creator'];
    return allowedStatuses.includes(member.status);
  } catch (err) {
    console.error(`⚠️ checkSubscription xatosi: ${err.message}`);
    return !config.FORCE_SUBSCRIPTION;
  }
}

function isAdmin(userId) {
  if (Array.isArray(config.ADMIN_ID)) {
    return config.ADMIN_ID.includes(userId);
  }
  return userId === config.ADMIN_ID;
}

function isPremium(user) {
  return user?.isPremium === true;
}

// ═══════════════════════════════════════════════════════
//  KEYBOARD HELPERS
// ═══════════════════════════════════════════════════════

function getContactKeyboard() {
  return Markup.keyboard([
    [Markup.button.contactRequest('📱 Kontakt ulashish')]
  ]).resize();
}

function getPostVoteKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🎁 Sovg\'alar', 'show_gifts')],
    [Markup.button.callback('🏆 Top 15', 'show_top15')],
    [Markup.button.callback('🔄 Yangi ovoz berish', 'back_to_teachers')]
  ]);
}

function getAdminPanelKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('👨‍🏫 O\'qituvchilar', 'admin_teachers'),
     Markup.button.callback('📋 Guruhlar', 'admin_groups')],
    [Markup.button.callback('📊 Statistika', 'admin_stats'),
     Markup.button.callback('📢 Broadcast', 'admin_broadcast')],
    [Markup.button.callback('🎁 Sovg\'a sozlash', 'admin_gift_config')]
  ]);
}

function getCancelKeyboard(backAction) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('❌ Bekor qilish', backAction || 'admin_back')]
  ]);
}

// ═══════════════════════════════════════════════════════
//  TEXT FORMATTING
// ═══════════════════════════════════════════════════════

function escapeMarkdown(text) {
  if (!text) return '';
  const chars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
  let result = text;
  for (const char of chars) {
    result = result.replace(new RegExp(`\\${char}`, 'g'), `\\${char}`);
  }
  return result;
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatNumber(num) {
  if (typeof num !== 'number' || isNaN(num)) return '0';
  return num.toLocaleString('en-US');
}

function formatTimeSlot(timeSlot) {
  if (!isValidTimeSlot(timeSlot)) return timeSlot || '?';
  const [start, end] = timeSlot.split('-');
  return `${start} — ${end}`;
}

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

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pick(obj, fields) {
  if (!obj || typeof obj !== 'object') return {};
  const result = {};
  for (const field of fields) {
    if (field in obj) result[field] = obj[field];
  }
  return result;
}

function omit(obj, fields) {
  if (!obj || typeof obj !== 'object') return {};
  const result = {};
  for (const key in obj) {
    if (!fields.includes(key)) result[key] = obj[key];
  }
  return result;
}

function formatGroupInfo(group, teacher = null) {
  if (!group) return 'Guruh topilmadi!';
  
  let text = `📚 *${group.name}*\n`;
  text += `🆔 ID: \`${group.groupId}\`\n`;
  if (teacher?.name) text += `👨‍🏫 O'qituvchi: *${teacher.name}*\n`;
  text += `⏰ Vaqt: *${formatTimeSlot(group.timeSlot)}*\n`;
  text += `📅 Kunlar: *${group.weekType}*\n`;
  text += `🗳 Ovozlar: *${group.votes}*`;
  return text;
}

function formatTeacherInfo(teacher, groupsCount = null) {
  if (!teacher) return 'O\'qituvchi topilmadi!';
  
  let text = `👨‍🏫 *${teacher.name}*\n`;
  text += `🆔 ID: \`${teacher.telegramId}\``;
  if (groupsCount !== null) text += `\n📋 Guruhlar: *${groupsCount}*`;
  return text;
}

// ═══════════════════════════════════════════════════════
//  BROADCAST HELPERS
// ═══════════════════════════════════════════════════════

function getVerifiedUsers(users) {
  return users.filter(u => u?.phone && u?.phone.startsWith('+998'));
}

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
//  ✅ EXPORTS - TO'G'RI TARTIBDA
// ═══════════════════════════════════════════════════════

module.exports = {
  // ID Generators
  getNextGroupId,
  getNextTeacherId,
  
  // ✅ State Management (Yangi qo'shildi)
  clearState,
  
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