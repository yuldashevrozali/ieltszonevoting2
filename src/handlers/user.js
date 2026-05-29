const { Markup } = require('telegraf');
const User    = require('../models/User');
const Teacher = require('../models/Teacher');
const Group   = require('../models/Group');
const Vote    = require('../models/Vote');
const { checkSubscription, getPaginatedGroupsKeyboard } = require('../utils/helpers');
const config  = require('../../config');

function getContactKeyboard() {
  return Markup.keyboard([[Markup.button.contactRequest('📱 Kontakt ulashish')]]).resize();
}

// ── /start ────────────────────────────────────────────────────────────────────
async function handleStart(ctx) {
  const payload  = ctx.startPayload || '';
  const refMatch = payload.match(/^ref_(\d+)$/);
  const refGroupId = refMatch ? parseInt(refMatch[1]) : null;

  let user = await User.findOne({ telegramId: ctx.from.id });
  if (!user) {
    user = new User({
      telegramId: ctx.from.id,
      firstName:  ctx.from.first_name || '',
      lastName:   ctx.from.last_name  || '',
      username:   ctx.from.username   || null
    });
    await user.save();
  }

  // Avval ovoz bergan bo'lsa
  const existingVote = await Vote.findOne({ userId: ctx.from.id });
  if (existingVote) {
    const vg = await Group.findOne({ groupId: existingVote.groupId });
    const vt = await Teacher.findOne({ telegramId: existingVote.teacherId });
    return ctx.reply(
      `Siz allaqachon ovoz bergansiz!\n\n` +
      `Oqituvchi: ${vt?.name || '?'}\n` +
      `Guruh: ${vg?.name || '?'} (#${existingVote.groupId})\n` +
      `Vaqt: ${vg?.timeSlot || '?'}`
    );
  }

  // Telefon yo'q
  if (!user.phone) {
    if (refGroupId) await User.findOneAndUpdate({ telegramId: ctx.from.id }, { tempData: { refGroupId } });
    return ctx.reply(
      `Salom, ${ctx.from.first_name}!\n\nBotdan foydalanish uchun telefon raqamingizni ulashing.\n\nPastdagi tugmani bosing:`,
      getContactKeyboard()
    );
  }

  // Kanal obunasi
  const ok = await checkSubscription(ctx);
  if (!ok) {
    if (refGroupId) await User.findOneAndUpdate({ telegramId: ctx.from.id }, { tempData: { refGroupId } });
    return showSubscriptionPrompt(ctx);
  }

  if (refGroupId) return showVoteConfirm(ctx, refGroupId, true);
  await showTeachersList(ctx);
}

// ── Kanal obunasi ─────────────────────────────────────────────────────────────
async function showSubscriptionPrompt(ctx) {
  const channelLink = config.CHANNEL_USERNAME ? `https://t.me/${config.CHANNEL_USERNAME}` : '#';
  const fn = ctx.callbackQuery ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
  await fn(`Davom etish uchun kanalimizga a'zo bo'ling:`, {
    ...Markup.inlineKeyboard([
      [Markup.button.url('Kanalga otish', channelLink)],
      [Markup.button.callback("A'zo bo'ldim", 'check_subscription')]
    ])
  });
}

async function checkAndAskSubscription(ctx, user) {
  const ok = await checkSubscription(ctx);
  if (!ok) return showSubscriptionPrompt(ctx);
  const td = user.tempData || {};
  if (td.refGroupId) {
    await User.findOneAndUpdate({ telegramId: ctx.from.id }, { tempData: {} });
    return showVoteConfirm(ctx, td.refGroupId, true);
  }
  await showTeachersList(ctx);
}

// ── O'qituvchilar ro'yxati (5 tadan sahifali) ───────────────────────────────
async function showTeachersList(ctx, page = 0) {
  const PAGE_SIZE = 5;
  const teachers = await Teacher.find().sort({ name: 1 });
  if (!teachers.length) {
    const fn = ctx.callbackQuery ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
    return fn('Hozircha oqituvchilar yoq.');
  }

  const total = teachers.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const start = page * PAGE_SIZE;
  const pageTeachers = teachers.slice(start, start + PAGE_SIZE);

  const keyboard = pageTeachers.map(t => ([{
    text: `👨‍🏫 ${t.name}`,
    callback_data: `user_teacher_${t.telegramId}`
  }]));

  // Navigatsiya tugmalari
  const navRow = [];
  if (page > 0)
    navRow.push({ text: '⬅️ Oldingi', callback_data: `teachers_page_${page - 1}` });
  if (page < totalPages - 1)
    navRow.push({ text: 'Keyingi ➡️', callback_data: `teachers_page_${page + 1}` });
  if (navRow.length) keyboard.push(navRow);

  const pageInfo = totalPages > 1 ? ` (${page + 1}/${totalPages})` : '';
  const fn = ctx.callbackQuery ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
  await fn(`O'qituvchini tanlang:${pageInfo}`, {
    reply_markup: { inline_keyboard: keyboard }
  });
}

// ── Teacher guruhlarini ko'rsatish ────────────────────────────────────────────
async function showTeacherGroups(ctx, teacherId, page = 0) {
  const teacher = await Teacher.findOne({ telegramId: parseInt(teacherId) });
  if (!teacher) return ctx.answerCbQuery('Topilmadi!');
  const groups = await Group.find({ teacherId: teacher.telegramId }).sort({ groupId: 1 });
  if (!groups.length) {
    return ctx.editMessageText(
      `${teacher.name} uchun guruh mavjud emas.`,
      Markup.inlineKeyboard([[Markup.button.callback('Orqaga', 'back_to_teachers')]])
    );
  }
  await ctx.editMessageText(
    `${teacher.name} — guruhini tanlang:`,
    getPaginatedGroupsKeyboard(groups, page, teacherId)
  );
}

// ── Ovoz berish tasdiqlash ────────────────────────────────────────────────────
async function showVoteConfirm(ctx, groupId, fromRef = false) {
  const group = await Group.findOne({ groupId: parseInt(groupId) });
  if (!group) {
    const fn = ctx.callbackQuery ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
    return fn('Guruh topilmadi!');
  }
  const teacher = await Teacher.findOne({ telegramId: group.teacherId });

  // Avval ovoz berganmi?
  const existing = await Vote.findOne({ userId: ctx.from.id });
  if (existing) {
    const vg = await Group.findOne({ groupId: existing.groupId });
    const vt = await Teacher.findOne({ telegramId: existing.teacherId });
    const fn = ctx.callbackQuery ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
    return fn(
      `Siz allaqachon ovoz bergansiz!\n\n` +
      `Oqituvchi: ${vt?.name || '?'}\n` +
      `Guruh: ${vg?.name || '?'} (#${existing.groupId})\n` +
      `Vaqt: ${vg?.timeSlot || '?'}\n\n` +
      `Har bir foydalanuvchi faqat 1 marta ovoz berishi mumkin.`,
      Markup.inlineKeyboard([[Markup.button.callback('Bosh menyu', 'back_to_teachers')]])
    );
  }

  const refNote = fromRef ? `\n\nSiz taklif havolasi orqali keldingiz.` : '';
  const backBtn = fromRef ? 'back_to_teachers' : `user_teacher_${group.teacherId}`;
  const fn = ctx.callbackQuery ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
  await fn(
    `Ovoz berish\n\n` +
    `Oqituvchi: ${teacher?.name || '?'}\n` +
    `Guruh: ${group.name}\n` +
    `Vaqt: ${group.timeSlot}\n` +
    `Kunlar: ${group.weekType}\n` +
    `Joriy ovozlar: ${group.votes}` +
    refNote +
    `\n\nDiqqat: Faqat 1 marta ovoz berish mumkin!\n\nOvoz bermoqchimisiz?`,
    {
      ...Markup.inlineKeyboard([
        [Markup.button.callback('Ha, tasdiqlayman!', `confirm_vote_${group.groupId}`)],
        [Markup.button.callback('Yoq, orqaga', backBtn)]
      ])
    }
  );
}

// ── Ovoz berish ───────────────────────────────────────────────────────────────
async function castVote(ctx, groupId) {
  const group = await Group.findOne({ groupId: parseInt(groupId) });
  if (!group) return ctx.answerCbQuery('Guruh topilmadi!', { show_alert: true });
  const teacher = await Teacher.findOne({ telegramId: group.teacherId });

  const existing = await Vote.findOne({ userId: ctx.from.id });
  if (existing) return ctx.answerCbQuery('Siz allaqachon ovoz bergansiz!', { show_alert: true });

  try {
    await Vote.create({ userId: ctx.from.id, groupId: group.groupId, teacherId: group.teacherId });
    await Group.updateOne({ groupId: group.groupId }, { $inc: { votes: 1 } });
    const updated = await Group.findOne({ groupId: group.groupId });

    const botUsername = ctx.botInfo?.username || '';
    const refLink = `https://t.me/${botUsername}?start=ref_${group.groupId}`;

    await ctx.editMessageText(
      `Ovozingiz qabul qilindi!\n\n` +
      `Oqituvchi: ${teacher?.name || '?'}\n` +
      `Guruh: ${group.name}\n` +
      `Vaqt: ${group.timeSlot}\n` +
      `Kunlar: ${group.weekType}\n` +
      `Guruh ovozlari: ${updated.votes}\n\n` +
      `Sizning referral havolangiz:\n${refLink}\n\n` +
      `Bu havola orqali kirgan yangi foydalanuvchi avtomatik bu guruhga ovoz berishga yonaltiriladi!`,
      Markup.inlineKeyboard([[Markup.button.callback('Bosh menyu', 'back_to_teachers')]])
    );
  } catch (err) {
    if (err.code === 11000) return ctx.answerCbQuery('Siz allaqachon ovoz bergansiz!', { show_alert: true });
    throw err;
  }
}

// ── Kontakt ───────────────────────────────────────────────────────────────────
async function handleContact(ctx) {
  const contact = ctx.message.contact;
  if (contact.user_id !== ctx.from.id)
    return ctx.reply('Iltimos, oz kontaktingizni yuboring!', getContactKeyboard());

  let phone = contact.phone_number;
  if (phone.startsWith('+')) phone = phone.slice(1);
  if (!phone.startsWith('998'))
    return ctx.reply("Faqat O'zbekiston raqamlari (+998) qabul qilinadi!\n\nIltimos, O'zbekiston raqamingizni ulashing:", getContactKeyboard());

  await User.findOneAndUpdate(
    { telegramId: ctx.from.id },
    { phone: contact.phone_number, firstName: ctx.from.first_name || '', lastName: ctx.from.last_name || '' },
    { upsert: true }
  );
  await ctx.reply('Telefon raqamingiz saqlandi!', Markup.removeKeyboard());
  const user = await User.findOne({ telegramId: ctx.from.id });
  await checkAndAskSubscription(ctx, user);
}

// ── Telefonsiz matn ───────────────────────────────────────────────────────────
async function handleTextWithoutPhone(ctx) {
  const user = await User.findOne({ telegramId: ctx.from.id });
  if (!user || !user.phone)
    return ctx.reply('Avval telefon raqamingizni ulashing!', getContactKeyboard());
}

module.exports = {
  handleStart, handleContact, handleTextWithoutPhone,
  checkAndAskSubscription, showTeachersList,
  showTeacherGroups, showVoteConfirm, castVote
};