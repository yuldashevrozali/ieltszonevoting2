const { Markup } = require('telegraf');
const User    = require('../models/User');
const Teacher = require('../models/Teacher');
const Group   = require('../models/Group');
const Vote    = require('../models/Vote');
const Gift    = require('../models/Gift');
const Settings = require('../models/Settings');
const { checkSubscription, getPaginatedGroupsKeyboard, escapeHtml } = require('../utils/helpers');
const config  = require('../../config');

// ── Kontakt keyboard ─────────────────────────────────────────────────────────
function getContactKeyboard() {
  return Markup.keyboard([[Markup.button.contactRequest('📱 Kontakt ulashish')]]).resize();
}

// ── ✅ Post-vote menu (FAQT 2 TA TUGMA) ─────────────────────────────────────
function getPostVoteKeyboard() {
  return Markup.keyboard([
    ['🎁 Sovg\'alar', '🏆 Top 15']
  ]).resize();
}

// ── /start — Asosiy Logic (Referral Support) ────────────────────────────────
async function handleStart(ctx) {
  const payload  = ctx.startPayload || '';
  const refMatch = payload.match(/^ref_(\d+)$/);
  const refGroupId = refMatch ? parseInt(refMatch[1]) : null;

  let user = await User.findOne({ telegramId: ctx.from.id });
  
  // Yangi user bo'lsa, saqlaymiz
  if (!user) {
    user = new User({
      telegramId: ctx.from.id,
      firstName:  ctx.from.first_name || '',
      lastName:   ctx.from.last_name  || '',
      username:   ctx.from.username   || null
    });
    await user.save();
  }

  // ✅ 1-QADAM: Agar user ALLAQACHON ovoz bergan bo'lsa
  const existingVote = await Vote.findOne({ userId: ctx.from.id });
  if (existingVote) {
    const vg = await Group.findOne({ groupId: existingVote.groupId });
    const vt = await Teacher.findOne({ telegramId: existingVote.teacherId });
    return ctx.reply(
      `🎉 Siz allaqachon ovoz bergansiz!\n\n` +
      `Oqituvchi: ${vt?.name || '?'}\n` +
      `Guruh: ${vg?.name || '?'} (#${existingVote.groupId})\n` +
      `Vaqt: ${vg?.timeSlot || '?'}\n\n` +
      `🎁 "Sovg'alar" tugmasini bosib sovrinlarni ko'ring\n` +
      `🏆 "Top 15" tugmasini bosib yetakchi guruhlarni ko'ring`,
      getPostVoteKeyboard()
    );
  }

  // ✅ 2-QADAM: Telefon raqam yo'q bo'lsa so'rash
  if (!user.phone) {
    if (refGroupId) {
      await User.findOneAndUpdate({ telegramId: ctx.from.id }, { tempData: { refGroupId } });
    }
    return ctx.reply(
      `Salom, ${ctx.from.first_name || 'Do\'st'}!\n\nBotdan foydalanish uchun telefon raqamingizni ulashing.\n\nPastdagi tugmani bosing:`,
      getContactKeyboard()
    );
  }

  // ✅ 3-QADAM: Kanal obunasini tekshirish
  const ok = await checkSubscription(ctx);
  if (!ok) {
    if (refGroupId) {
      await User.findOneAndUpdate({ telegramId: ctx.from.id }, { tempData: { refGroupId } });
    }
    return showSubscriptionPrompt(ctx);
  }

  // ✅ 4-QADAM: Agar referral link orqali kelgan bo'lsa → To'g'ri tasdiqlashga o'tish
  if (refGroupId) {
    return showVoteConfirm(ctx, refGroupId, true);
  }

  // ✅ 5-QADAM: Oddiy flow → O'qituvchilar ro'yxati
  await showTeachersList(ctx);
}

// ── Kanal obunasi prompt ────────────────────────────────────────────────────
async function showSubscriptionPrompt(ctx) {
  const channelLink = config.CHANNEL_USERNAME ? `https://t.me/${config.CHANNEL_USERNAME}` : '#';
  const fn = ctx.callbackQuery ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
  await fn(`Davom etish uchun kanalimizga a'zo bo'ling:`, {
    ...Markup.inlineKeyboard([
      [Markup.button.url('📢 Kanalga o\'tish', channelLink)],
      [Markup.button.callback("✅ A'zo bo'ldim", 'check_subscription')]
    ])
  });
}

// ── ✅ Sovg'alarni ko'rsatish (HTML parse mode + rasm support) ───────────────
async function showGifts(ctx) {
  const gift = await Gift.findById('config');
  const rawText = gift?.text || '🎁 Sovg\'alar tez kunda e\'lon qilinadi!';
  
  const safeText = escapeHtml ? escapeHtml(rawText) : rawText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  
  const keyboard = Markup.inlineKeyboard([[Markup.button.callback('🔙 Orqaga', 'back_post_vote')]]);
  
  if (ctx.callbackQuery) {
    if (gift?.fileId) {
      try {
        await ctx.editMessageMedia({
          type: 'photo',
          media: gift.fileId,
          caption: safeText,
          parse_mode: 'HTML'
        }, { reply_markup: keyboard });
      } catch (err) {
        await ctx.replyWithPhoto(gift.fileId, {
          caption: safeText,
          parse_mode: 'HTML',
          reply_markup: keyboard
        });
        await ctx.deleteMessage().catch(() => {});
      }
    } else {
      await ctx.editMessageText(safeText, { 
        parse_mode: 'HTML',
        reply_markup: keyboard 
      });
    }
  } else {
    if (gift?.fileId) {
      await ctx.replyWithPhoto(gift.fileId, {
        caption: safeText,
        parse_mode: 'HTML',
        reply_markup: keyboard
      });
    } else {
      await ctx.reply(safeText, {
        parse_mode: 'HTML',
        reply_markup: keyboard
      });
    }
  }
}

// ── ✅ Top 15 guruhlarni ko'rsatish (Teacher + Time qo'shildi) ───────────────
async function showTop15(ctx) {
  const topGroups = await Group.find().sort({ votes: -1 }).limit(15).lean();
  
  if (!topGroups.length) {
    const fn = ctx.callbackQuery ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
    return fn('📊 Hozircha statistik ma\'lumot yo\'q.', {
      reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 Orqaga', 'back_post_vote')]])
    });
  }

  const teacherIds = [...new Set(topGroups.map(g => g.teacherId))];
  const teachers = await Teacher.find({ telegramId: { $in: teacherIds } }).lean();
  const teacherMap = {};
  teachers.forEach(t => { teacherMap[t.telegramId] = t.name; });

  let message = '🏆 <b>TOP 15 GURUH</b>\n\n';
  
  topGroups.forEach((g, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    const teacherName = teacherMap[g.teacherId] || 'Noma\'lum';
    const startTime = g.timeSlot?.split('-')[0] || '??:??';
    const weekType = g.weekType || '?';

    message += `${medal} <b>${escapeHtml(g.name)}</b>\n`;
    message += `👨‍🏫 ${escapeHtml(teacherName)} | ⏰ ${escapeHtml(startTime)} | 📅 ${escapeHtml(weekType)} | 🗳 <i>${g.votes} ovoz</i>\n\n`;
  });

  const fn = ctx.callbackQuery ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
  await fn(message.trim(), {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 Orqaga', 'back_post_vote')]])
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

// ── ✅ Turnir tugaganini bildiruvchi xabar ──────────────────────────────────
async function showVotingClosed(ctx) {
  const text =
    '🛑 Turnir yakunlandi!\n\n' +
    'Ovoz berish to\'xtatildi, endi ovoz qabul qilinmaydi.\n' +
    'Ishtirok etganingiz uchun rahmat! 🎉\n\n' +
    '🏆 Natijalarni ko\'rish uchun "Top 15" tugmasini bosing.';
  const fn = ctx.callbackQuery ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
  await fn(text, {
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('🏆 Top 15', 'show_top15')],
      [Markup.button.callback('🎁 Sovg\'alar', 'show_gifts')]
    ]).reply_markup
  });
}

// ── O'qituvchilar ro'yxati (5 tadan sahifali) ───────────────────────────────
async function showTeachersList(ctx, page = 0) {
  // ✅ Turnir tugagan bo'lsa, ovoz berishga yo'l yo'q
  if (await Settings.isVotingClosed()) return showVotingClosed(ctx);

  const PAGE_SIZE = 5;
  const teachers = await Teacher.find().sort({ name: 1 });
  
  if (!teachers.length) {
    const fn = ctx.callbackQuery ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
    return fn('Hozircha oqituvchilar yo\'q.');
  }

  const total = teachers.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const start = page * PAGE_SIZE;
  const pageTeachers = teachers.slice(start, start + PAGE_SIZE);

  const keyboard = pageTeachers.map(t => ([{
    text: `👨‍🏫 ${t.name}`,
    callback_data: `user_teacher_${t.telegramId}`
  }]));

  const navRow = [];
  if (page > 0) navRow.push({ text: '⬅️ Oldingi', callback_data: `teachers_page_${page - 1}` });
  if (page < totalPages - 1) navRow.push({ text: 'Keyingi ➡️', callback_data: `teachers_page_${page + 1}` });
  if (navRow.length) keyboard.push(navRow);

  const pageInfo = totalPages > 1 ? ` (${page + 1}/${totalPages})` : '';
  const fn = ctx.callbackQuery ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
  await fn(`O'qituvchini tanlang:${pageInfo}`, {
    reply_markup: { inline_keyboard: keyboard }
  });
}

// ── Teacher guruhlarini ko'rsatish ────────────────────────────────────────────
async function showTeacherGroups(ctx, teacherId, page = 0) {
  // ✅ Turnir tugagan bo'lsa, ovoz berishga yo'l yo'q
  if (await Settings.isVotingClosed()) return showVotingClosed(ctx);

  const teacher = await Teacher.findOne({ telegramId: parseInt(teacherId) });
  if (!teacher) return ctx.answerCbQuery('Topilmadi!');
  
  const groups = await Group.find({ teacherId: teacher.telegramId }).sort({ groupId: 1 });
  if (!groups.length) {
    return ctx.editMessageText(
      `${teacher.name} uchun guruh mavjud emas.`,
      Markup.inlineKeyboard([[Markup.button.callback('🔙 Orqaga', 'back_to_teachers')]])
    );
  }
  await ctx.editMessageText(
    `${teacher.name} — guruhini tanlang:`,
    getPaginatedGroupsKeyboard(groups, page, teacherId)
  );
}

// ── Ovoz berish tasdiqlash ────────────────────────────────────────────────────
async function showVoteConfirm(ctx, groupId, fromRef = false) {
  // ✅ Turnir tugagan bo'lsa, ovoz berishga yo'l yo'q (referral ham)
  if (await Settings.isVotingClosed()) return showVotingClosed(ctx);

  const group = await Group.findOne({ groupId: parseInt(groupId) });
  if (!group) {
    const fn = ctx.callbackQuery ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
    return fn('❌ Guruh topilmadi!');
  }
  const teacher = await Teacher.findOne({ telegramId: group.teacherId });

  // ✅ Tekshirish: User allaqachon ovoz berganmi?
  const existing = await Vote.findOne({ userId: ctx.from.id });
  if (existing) {
    const vg = await Group.findOne({ groupId: existing.groupId });
    const vt = await Teacher.findOne({ telegramId: existing.teacherId });
    const fn = ctx.callbackQuery ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
    return fn(
      `🎉 Siz allaqachon ovoz bergansiz!\n\n` +
      `Oqituvchi: ${vt?.name || '?'}\n` +
      `Guruh: ${vg?.name || '?'} (#${existing.groupId})\n` +
      `Vaqt: ${vg?.timeSlot || '?'}\n\n` +
      `⚠️ Har bir foydalanuvchi faqat 1 marta ovoz berishi mumkin.`,
      Markup.inlineKeyboard([[Markup.button.callback('🏠 Bosh menyu', 'back_to_teachers')]])
    );
  }

  const refNote = fromRef ? `\n\n✨ Siz taklif havolasi orqali keldingiz.` : '';
  const backBtn = fromRef ? 'back_to_teachers' : `user_teacher_${group.teacherId}`;
  
  const fn = ctx.callbackQuery ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
  await fn(
    `🗳️ Ovoz berish\n\n` +
    `👨‍🏫 Oqituvchi: ${teacher?.name || '?'}\n` +
    `📚 Guruh: ${group.name}\n` +
    `⏰ Vaqt: ${group.timeSlot}\n` +
    `📅 Kunlar: ${group.weekType}\n` +
    `🔢 Joriy ovozlar: ${group.votes}` +
    refNote +
    `\n\n⚠️ Diqqat: Faqat 1 marta ovoz berish mumkin!\n\nOvoz bermoqchimisiz?`,
    {
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Ha, tasdiqlayman!', `confirm_vote_${group.groupId}`)],
        [Markup.button.callback('❌ Yoq, orqaga', backBtn)]
      ])
    }
  );
}

// ── ✅ OVOZ BERISH — Asosiy Logic (Referral Link bilan) ─────────────────────
async function castVote(ctx, groupId) {
  // ✅ Turnir tugagan bo'lsa, ovoz yozishni butunlay rad etamiz
  if (await Settings.isVotingClosed()) {
    return ctx.answerCbQuery('🛑 Turnir yakunlandi! Ovoz qabul qilinmaydi.', { show_alert: true });
  }

  const group = await Group.findOne({ groupId: parseInt(groupId) });
  if (!group) return ctx.answerCbQuery('❌ Guruh topilmadi!', { show_alert: true });
  
  const teacher = await Teacher.findOne({ telegramId: group.teacherId });
  const existing = await Vote.findOne({ userId: ctx.from.id });
  
  if (existing) return ctx.answerCbQuery('⚠️ Siz allaqachon ovoz bergansiz!', { show_alert: true });

  try {
    // 1. Ovozni saqlash
    await Vote.create({ 
      userId: ctx.from.id, 
      groupId: group.groupId, 
      teacherId: group.teacherId 
    });
    
    // 2. Guruh ovozlari sonini oshirish
    await Group.updateOne({ groupId: group.groupId }, { $inc: { votes: 1 } });
    const updated = await Group.findOne({ groupId: group.groupId });

    // 3. ✅ REFERRAL LINK yaratish
    const botUsername = ctx.botInfo?.username;
    const refLink = `https://t.me/${botUsername}?start=ref_${group.groupId}`;

    // 4. ✅ MUVAFFAQIYAT XABARI + REFERRAL LINK + KEYBOARD
    await ctx.editMessageText(
      `✅ <b>Ovozingiz qabul qilindi!</b>\n\n` +
      `👨‍🏫 Oqituvchi: ${teacher?.name || '?'}\n` +
      `📚 Guruh: ${group.name}\n` +
      `⏰ Vaqt: ${group.timeSlot}\n` +
      `📅 Kunlar: ${group.weekType}\n` +
      `🔢 Guruh ovozlari: ${updated.votes}\n\n` +
      `🔗 <b>Sizning referral havolangiz:</b>\n<code>${refLink}</code>\n\n` +
      `💡 Bu havolani do'stlaringizga yuboring!\n` +
      `Ularning ovozi ham avtomatik <b>${group.name}</b> guruhiga qo'shiladi! 🚀`,
      {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 Orqaga', 'back_post_vote')]])
      }
    );
    
    // 5. ✅ Oddiy keyboard tugmalari (2 ta)
    await ctx.reply('Tanlov uchun rahmat! 🎉', getPostVoteKeyboard());
    
  } catch (err) {
    if (err.code === 11000) {
      return ctx.answerCbQuery('⚠️ Siz allaqachon ovoz bergansiz!', { show_alert: true });
    }
    console.error('❌ castVote xatosi:', err);
    return ctx.answerCbQuery('❌ Xatolik yuz berdi!', { show_alert: true });
  }
}

// ── Kontakt handler ─────────────────────────────────────────────────────────
async function handleContact(ctx) {
  const contact = ctx.message.contact;
  if (contact.user_id !== ctx.from.id)
    return ctx.reply('Iltimos, o\'z kontaktingizni yuboring!', getContactKeyboard());

  let phone = contact.phone_number;
  if (phone.startsWith('+')) phone = phone.slice(1);
  if (!phone.startsWith('998'))
    return ctx.reply("Faqat O'zbekiston raqamlari (+998) qabul qilinadi!\n\nIltimos, O'zbekiston raqamingizni ulashing:", getContactKeyboard());

  await User.findOneAndUpdate(
    { telegramId: ctx.from.id },
    { phone: contact.phone_number, firstName: ctx.from.first_name || '', lastName: ctx.from.last_name || '' },
    { upsert: true }
  );
  await ctx.reply('✅ Telefon raqamingiz saqlandi!', Markup.removeKeyboard());
  
  const user = await User.findOne({ telegramId: ctx.from.id });
  await checkAndAskSubscription(ctx, user);
}

// ── Telefonsiz matn handler ─────────────────────────────────────────────────
async function handleTextWithoutPhone(ctx) {
  const user = await User.findOne({ telegramId: ctx.from.id });
  if (!user || !user.phone)
    return ctx.reply('Avval telefon raqamingizni ulashing!', getContactKeyboard());
}

// ── ✅ Post-vote oddiy keyboard tugmalari handleri (FAQT 2 TA) ───────────────
async function handlePostVoteButtons(ctx) {
  const text = ctx.message.text;
  
  if (text === '🎁 Sovg\'alar') {
    return showGifts(ctx);
  }
  
  if (text === '🏆 Top 15') {
    return showTop15(ctx);
  }
  
  return;
}

module.exports = {
  handleStart, 
  handleContact, 
  handleTextWithoutPhone,
  handlePostVoteButtons,
  checkAndAskSubscription, 
  showTeachersList,
  showTeacherGroups, 
  showVoteConfirm, 
  castVote,
  showGifts,
  showTop15
};
