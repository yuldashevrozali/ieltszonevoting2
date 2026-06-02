const { Markup } = require('telegraf');
const User    = require('../models/User');
const Teacher = require('../models/Teacher');
const Group   = require('../models/Group');
const Vote    = require('../models/Vote');
const { checkSubscription, getPaginatedGroupsKeyboard } = require('../utils/helpers');
const config  = require('../../config');

const PAGE_SIZE = 5;

function getContactKeyboard() {
  return Markup.keyboard([[Markup.button.contactRequest('📱 Kontakt ulashish')]]).resize();
}

function getPostVoteKeyboard() {
  return Markup.keyboard([["🎁 Sovg'alar", '🏆 Top 15']]).resize();
}

// ── /start ────────────────────────────────────────────────────────────────────
async function handleStart(ctx) {
  const payload    = ctx.startPayload || '';
  const refMatch   = payload.match(/^ref_(\d+)$/);
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

  // Referral ID ni saqlab qo'yish
  if (refGroupId) {
    await User.findOneAndUpdate({ telegramId: ctx.from.id }, { 'tempData.refGroupId': refGroupId });
    user = await User.findOne({ telegramId: ctx.from.id });
  }

  // Avval ovoz bergan bo'lsa
  const existingVote = await Vote.findOne({ userId: ctx.from.id });
  if (existingVote) {
    return showAlreadyVoted(ctx, existingVote);
  }

  // Ro'yxatdan o'tish jarayoni — navbatdagi qadamga o'tkazish
  return continueRegistration(ctx, user);
}

// Ro'yxatdan o'tish qadamlarini boshqarish
async function continueRegistration(ctx, user) {
  // 1. Kanal obunasi
  const ok = await checkSubscription(ctx);
  if (!ok) return showSubscriptionPrompt(ctx);

  // 2. Ism
  if (!user.fullName) {
    await User.findOneAndUpdate({ telegramId: ctx.from.id }, { state: 'enter_name' });
    const fn = ctx.callbackQuery ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
    return fn(
      "Kanalga a'zo bo'lganingiz uchun rahmat!\n\nIsmingizni kiriting (to'liq ism):\nMisol: Sardor Usmonov",
      ctx.callbackQuery ? {} : Markup.removeKeyboard()
    );
  }

  // 3. Yosh
  if (!user.age) {
    await User.findOneAndUpdate({ telegramId: ctx.from.id }, { state: 'enter_age' });
    const fn = ctx.callbackQuery ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
    return fn('Yoshingizni kiriting (faqat raqam):\nMisol: 22');
  }

  // 4. Telefon
  if (!user.phone) {
    await User.findOneAndUpdate({ telegramId: ctx.from.id }, { state: 'enter_phone' });
    return ctx.reply(
      'Telefon raqamingizni ulashing:',
      getContactKeyboard()
    );
  }

  // Hamma to'ldirilgan — asosiy oqim
  await User.findOneAndUpdate({ telegramId: ctx.from.id }, { state: null });
  const td = user.tempData || {};
  if (td.refGroupId) {
    await User.findOneAndUpdate({ telegramId: ctx.from.id }, { 'tempData.refGroupId': null });
    return showVoteConfirm(ctx, td.refGroupId, true);
  }
  await showTeachersList(ctx);
}

// ── Kanal obunasi ─────────────────────────────────────────────────────────────
async function showSubscriptionPrompt(ctx) {
  const channelLink = config.CHANNEL_USERNAME ? `https://t.me/${config.CHANNEL_USERNAME}` : '#';
  const fn = ctx.callbackQuery ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
  await fn("Botdan foydalanish uchun kanalimizga a'zo bo'ling:", {
    ...Markup.inlineKeyboard([
      [Markup.button.url("Kanalga o'tish", channelLink)],
      [Markup.button.callback("A'zo bo'ldim", 'check_subscription')]
    ])
  });
}

async function checkAndAskSubscription(ctx, user) {
  const ok = await checkSubscription(ctx);
  if (!ok) return showSubscriptionPrompt(ctx);
  user = await User.findOne({ telegramId: ctx.from.id });
  await continueRegistration(ctx, user);
}

// ── Matn xabarlarni qayta ishlash (FSM) ─────────────────────────────────────
async function handleUserText(ctx) {
  const user = await User.findOne({ telegramId: ctx.from.id });
  if (!user) return;

  const text = ctx.message.text.trim();

  // Telefon raqami yo'q va kontakt so'ralganda — boshqa matn yuborganda
  if (!user.phone && user.state === 'enter_phone') {
    return ctx.reply('Iltimos, pastdagi tugma orqali kontakt ulashing:', getContactKeyboard());
  }

  // Ism kiritish
  if (user.state === 'enter_name') {
    if (text.length < 2 || text.length > 60) {
      return ctx.reply("Iltimos, to'liq ismingizni kiriting (2-60 harf):");
    }
    await User.findOneAndUpdate({ telegramId: ctx.from.id }, { fullName: text, state: 'enter_age' });
    return ctx.reply(`Rahmat, ${text}!\n\nYoshingizni kiriting (faqat raqam):\nMisol: 22`);
  }

  // Yosh kiritish
  if (user.state === 'enter_age') {
    const age = parseInt(text);
    if (isNaN(age) || age < 5 || age > 100) {
      return ctx.reply('Iltimos, yoshingizni to\'g\'ri kiriting (5-100 oralig\'ida):');
    }
    await User.findOneAndUpdate({ telegramId: ctx.from.id }, { age, state: 'enter_phone' });
    return ctx.reply('Yoshingiz saqlandi!\n\nEndi telefon raqamingizni ulashing:', getContactKeyboard());
  }

  // Ovoz bergan bo'lsa — matn yuborganda ham ko'rsatish
  const existingVote = await Vote.findOne({ userId: ctx.from.id });
  if (existingVote) return showAlreadyVoted(ctx, existingVote);

  // Telefon yo'q
  if (!user.phone) {
    return ctx.reply('Avval telefon raqamingizni ulashing!', getContactKeyboard());
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
    return ctx.reply("+998 bilan boshlanadigan O'zbekiston raqamini ulashing:", getContactKeyboard());

  await User.findOneAndUpdate(
    { telegramId: ctx.from.id },
    { phone: contact.phone_number, state: null },
    { upsert: true }
  );
  await ctx.reply('Telefon raqamingiz saqlandi!', Markup.removeKeyboard());
  const user = await User.findOne({ telegramId: ctx.from.id });
  await continueRegistration(ctx, user);
}

// ── Allaqachon ovoz bergan ────────────────────────────────────────────────────
async function showAlreadyVoted(ctx, existingVote) {
  const vg = await Group.findOne({ groupId: existingVote.groupId });
  const vt = await Teacher.findOne({ telegramId: existingVote.teacherId });
  // Har doim reply (yangi xabar) — oddiy keyboard bilan
  await ctx.reply(
    `Siz allaqachon ovoz bergansiz!\n\n` +
    `Oqituvchi: ${vt?.name || '?'}\n` +
    `Guruh: ${vg?.name || '?'} (#${existingVote.groupId})\n` +
    `Vaqt: ${vg?.timeSlot || '?'}\n\n` +
    `Quyidagi tugmalardan birini bosing:`,
    getPostVoteKeyboard()
  );
}

// ── Sovg'alar ─────────────────────────────────────────────────────────────────
async function showPrizes(ctx) {
  const Settings = require('../models/Settings');
  const photoSetting = await Settings.findOne({ key: 'prize_photo' });
  const textSetting  = await Settings.findOne({ key: 'prize_text'  });

  const text = textSetting?.value || "Sovg'alar tez kunda e'lon qilinadi!";
  const keyboard = getPostVoteKeyboard();

  if (photoSetting?.value) {
    await ctx.replyWithPhoto(photoSetting.value, { caption: text, ...keyboard });
  } else {
    await ctx.reply(text, keyboard);
  }
}

// ── Top 15 guruh ─────────────────────────────────────────────────────────────
async function showTop15(ctx) {
  const groups   = await Group.find().sort({ votes: -1 }).limit(15).lean();
  const teachers = await Teacher.find().lean();
  const tMap = {}; teachers.forEach(t => { tMap[t.telegramId] = t.name; });

  let text = "TOP 15 GURUH:\n\n";
  const medals = ['1.','2.','3.','4.','5.','6.','7.','8.','9.','10.','11.','12.','13.','14.','15.'];

  if (!groups.length) {
    text += "Hali ovozlar yoq.";
  } else {
    groups.forEach((g, i) => {
      // Faqat boshlanish vaqtini olish: "11:20-12:50" -> "11:20"
      const startTime = g.timeSlot ? g.timeSlot.split('-')[0] : '?';
      const weekType  = g.weekType || '';
      const medal = medals[i] || `${i + 1}.`;
      text += `${medal} ${tMap[g.teacherId] || '?'} | ${g.name}\n`;
      text += `   ${startTime} | ${weekType} | ${g.votes} ovoz\n\n`;
    });
  }

  await ctx.reply(text.trim(), getPostVoteKeyboard());
}

// ── O'qituvchilar ro'yxati (5 tadan) ─────────────────────────────────────────
async function showTeachersList(ctx, page = 0) {
  const teachers = await Teacher.find().sort({ name: 1 });
  if (!teachers.length) {
    const fn = ctx.callbackQuery ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
    return fn('Hozircha oqituvchilar yoq.');
  }

  const totalPages  = Math.ceil(teachers.length / PAGE_SIZE);
  const pageTeachers = teachers.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const keyboard = pageTeachers.map(t => ([{
    text: `👨‍🏫 ${t.name}`,
    callback_data: `user_teacher_${t.telegramId}`
  }]));

  const navRow = [];
  if (page > 0)               navRow.push({ text: '⬅️ Oldingi', callback_data: `teachers_page_${page - 1}` });
  if (page < totalPages - 1)  navRow.push({ text: 'Keyingi ➡️', callback_data: `teachers_page_${page + 1}` });
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

  const existing = await Vote.findOne({ userId: ctx.from.id });
  if (existing) return showAlreadyVoted(ctx, existing);

  const refNote  = fromRef ? '\n\nSiz taklif havolasi orqali keldingiz.' : '';
  const backBtn  = fromRef ? 'back_to_teachers' : `user_teacher_${group.teacherId}`;
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

module.exports = {
  handleStart, handleContact, handleUserText,
  checkAndAskSubscription,
  showTeachersList, showTeacherGroups,
  showVoteConfirm, castVote,
  showAlreadyVoted, showPrizes, showTop15
};