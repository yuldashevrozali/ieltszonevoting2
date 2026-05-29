const { Markup } = require('telegraf');
const Teacher  = require('../models/Teacher');
const Group    = require('../models/Group');
const Vote     = require('../models/Vote');
const User     = require('../models/User');
const Gift     = require('../models/Gift'); // ✅ Yangi model
const { getNextGroupId, isValidTimeSlot, isAdmin } = require('../utils/helpers');

// ── Yordamchi: state o'rnatish/tozalash ─────────────────────────────────────
async function setState(userId, state, tempData = {}) {
  await User.findOneAndUpdate({ telegramId: userId }, { state, tempData }, { upsert: true });
}
async function clearState(userId) {
  await User.findOneAndUpdate({ telegramId: userId }, { state: null, tempData: {} });
}

// ── ✅ YANGI: Admin panel - jami userlar soni bilan ─────────────────────────
async function showAdminPanel(ctx) {
  if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Sizda admin huquqi yo\'q!');
  
  const [tc, gc, vc, uc] = await Promise.all([
    Teacher.countDocuments(), 
    Group.countDocuments(), 
    Vote.countDocuments(),
    User.countDocuments() // ✅ Jami userlar
  ]);
  
  await ctx.reply(
    `🔐 *ADMIN PANEL*\n\n` +
    `👥 Jami userlar: *${uc}*\n` +
    `👨‍🏫 O'qituvchilar: *${tc}*\n` +
    `📋 Guruhlar: *${gc}*\n` +
    `🗳 Jami ovozlar: *${vc}*`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('👨‍🏫 O\'qituvchilar', 'admin_teachers')],
        [Markup.button.callback('📋 Guruhlar',       'admin_groups')],
        [Markup.button.callback('📊 Statistika',     'admin_stats')],
        [Markup.button.callback('📢 Broadcast',      'admin_broadcast')],    // ✅ Yangi
        [Markup.button.callback('🎁 Sovg\'a sozlash', 'admin_gift_config')]  // ✅ Yangi
      ])
    }
  );
}

// ── ✅ YANGI: O'qituvchilar ro'yxati (5 tadan sahifali) ─────────────────────
async function showTeachersList(ctx, page = 0) {
  const PAGE_SIZE = 5;
  const teachers = await Teacher.find().sort({ name: 1 });
  
  if (!teachers.length) {
    return ctx.editMessageText('👨‍🏫 Hali o\'qituvchi yo\'q.', 
      Markup.inlineKeyboard([[Markup.button.callback('🔙 Orqaga', 'admin_back')]])
    );
  }

  const total = teachers.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const start = page * PAGE_SIZE;
  const pageTeachers = teachers.slice(start, start + PAGE_SIZE);

  const buttons = pageTeachers.map(t => 
    [Markup.button.callback(`👨‍🏫 ${t.name}`, `admin_teacher_${t.telegramId}`)]
  );
  
  // Navigatsiya tugmalari
  const navRow = [];
  if (page > 0) navRow.push(Markup.button.callback('⬅️', `admin_teachers_page_${page - 1}`));
  navRow.push(Markup.button.callback('➕ Yangi', 'admin_add_teacher'));
  if (page < totalPages - 1) navRow.push(Markup.button.callback('➡️', `admin_teachers_page_${page + 1}`));
  buttons.push(navRow);
  
  buttons.push([Markup.button.callback('🔙 Orqaga', 'admin_back')]);
  
  const pageInfo = totalPages > 1 ? ` (${page + 1}/${totalPages})` : '';
  
  await ctx.editMessageText(
    `👨‍🏫 *O'qituvchilar:*${pageInfo}`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
  );
}

// ── Bitta teacher menyusi ────────────────────────────────────────────────────
async function showTeacherMenu(ctx, teacherId) {
  const teacher = await Teacher.findOne({ telegramId: parseInt(teacherId) });
  if (!teacher) return ctx.answerCbQuery('Topilmadi!');
  
  const groups = await Group.find({ teacherId: teacher.telegramId }).sort({ groupId: 1 });
  let text = `👨‍🏫 *${teacher.name}*\n🆔 \`${teacher.telegramId}\`\n\n📋 Guruhlar: *${groups.length}*\n`;
  
  groups.slice(0, 5).forEach(g => { 
    text += `• #${g.groupId} | ${g.timeSlot} | ${g.name} | ${g.weekType} | 🗳${g.votes}\n`; 
  });
  if (groups.length > 5) text += `...va yana ${groups.length - 5} ta guruh\n`;
  
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('➕ Guruh yaratish', `admin_create_group_${teacher.telegramId}`)],
      [Markup.button.callback('❌ O\'qituvchini o\'chirish', `admin_del_teacher_${teacher.telegramId}`)],
      [Markup.button.callback('🔙 Orqaga', 'admin_teachers')]
    ])
  });
}

// ── Guruh yaratish: 1-qadam — vaqt so'rash ──────────────────────────────────
async function startCreateGroup(ctx, teacherId) {
  const teacher = await Teacher.findOne({ telegramId: parseInt(teacherId) });
  if (!teacher) return ctx.answerCbQuery('Topilmadi!');
  
  await setState(ctx.from.id, 'admin_enter_time', { teacherId: teacher.telegramId, action: 'create' });
  await ctx.editMessageText(
    `📋 *${teacher.name}* uchun yangi guruh yaratish\n\n` +
    `*1-qadam:* Boshlash va tugash vaqtini kiriting:\n` +
    `Format: \`HH:MM-HH:MM\`\nMisol: \`11:20-12:50\``,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Bekor', `admin_teacher_${teacherId}`)]])
    }
  );
}

// ── Guruh tahrirlash: vaqt o'zgartirish ─────────────────────────────────────
async function startChangeTime(ctx, groupId) {
  const group = await Group.findOne({ groupId: parseInt(groupId) });
  if (!group) return ctx.answerCbQuery('Topilmadi!');
  
  await setState(ctx.from.id, 'admin_enter_time', { groupId: group.groupId, action: 'change_time' });
  await ctx.editMessageText(
    `⏰ Guruh *#${groupId}* — vaqtni o'zgartirish\n\nJoriy: *${group.timeSlot}*\n\n` +
    `Yangi vaqtni kiriting:\nFormat: \`HH:MM-HH:MM\`\nMisol: \`11:20-12:50\``,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Bekor', `admin_group_menu_${groupId}`)]])
    }
  );
}

// ── Guruh tahrirlash: nom o'zgartirish ──────────────────────────────────────
async function startChangeName(ctx, groupId) {
  const group = await Group.findOne({ groupId: parseInt(groupId) });
  if (!group) return ctx.answerCbQuery('Topilmadi!');
  
  await setState(ctx.from.id, 'admin_enter_name', { groupId: group.groupId, action: 'change_name' });
  await ctx.editMessageText(
    `📚 Guruh *#${groupId}* — nomni o'zgartirish\n\nJoriy: *${group.name}*\n\nYangi nomni kiriting:`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Bekor', `admin_group_menu_${groupId}`)]])
    }
  );
}

// ── Hafta kunlarini tanlash (inline) ─────────────────────────────────────────
async function showWeekTypeSelect(ctx, isEdit = false) {
  const user = await User.findOne({ telegramId: ctx.from.id });
  const td = user.tempData;
  const label = isEdit ? 'Yangi hafta kunini tanlang:' : '3-qadam: Hafta kunlarini tanlang:';
  const backAction = isEdit ? `admin_group_menu_${td.groupId}` : `admin_teacher_${td.teacherId}`;

  const text = isEdit
    ? `📅 Guruh *#${td.groupId}* — hafta kunlari\n\nJoriy: *${td.currentWeekType || ''}*\n\n${label}`
    : `📋 Yangi guruh\n⏰ Vaqt: *${td.timeSlot}*\n📚 Nom: *${td.name}*\n\n${label}`;

  const editFn = ctx.callbackQuery ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx);
  await editFn(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('1️⃣3️⃣5️⃣ Toq kunlar', 'admin_weektype_Toq kunlar')],
      [Markup.button.callback('2️⃣4️⃣6️⃣ Juft kunlar', 'admin_weektype_Juft kunlar')],
      [Markup.button.callback('❌ Bekor', backAction)]
    ])
  });
}

// ── ✅ YANGI: Broadcast boshlash ────────────────────────────────────────────
async function startBroadcast(ctx) {
  await ctx.editMessageText(
    `📢 *BROADCAST - Hammaga xabar yuborish*\n\n` +
    `Xabaringizni yuboring:\n` +
    `• Faqat matn: oddiy matn yuboring\n` +
    `• Rasm+matn: rasm yuboring va caption qo'shing\n\n` +
    `⚠️ Bu barcha tasdiqlangan userlarga yuboriladi!\n` +
    `⏳ Jarayon biroz vaqt olishi mumkin.`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Bekor qilish', 'admin_back')]])
    }
  );
  await setState(ctx.from.id, 'admin_broadcast_waiting');
}

// ── ✅ YANGI: Broadcast yuborish funksiyasi ─────────────────────────────────
// ── ✅ YANGI: Broadcast yuborish funksiyasi (rasm+matn support) ──────────────
async function sendBroadcast(ctx, message) {
  // Faqat telefon raqami tasdiqlangan userlarga yuboramiz
  const users = await User.find({ phone: { $ne: null } }).lean();
  let sent = 0, failed = 0;

  const statusMsg = await ctx.reply(`📤 Yuborilmoqda: 0/${users.length}`);

  for (const user of users) {
    try {
      if (message.photo) {
        // ✅ Rasm+matn yuborish
        await ctx.telegram.sendPhoto(user.telegramId, message.photo, { 
          caption: message.text,
          parse_mode: 'Markdown'
        });
      } else {
        // ✅ Faqat matn yuborish
        await ctx.telegram.sendMessage(user.telegramId, message.text, {
          parse_mode: 'Markdown'
        });
      }
      sent++;
    } catch (err) {
      failed++;
      console.error(`❌ User ${user.telegramId}: ${err.message}`);
    }
    
    // Har 10 ta xabarda status yangilash
    if ((sent + failed) % 10 === 0) {
      await ctx.editMessageText(
        `📤 Yuborilmoqda: ${sent + failed}/${users.length}\n` +
        `✅ Muvaffaqiyatli: ${sent}\n❌ Xato: ${failed}`, 
        { chat_id: statusMsg.chat.id, message_id: statusMsg.message_id }
      );
    }
    
    // Rate limit uchun ozgina kutish (Telegram limitlari)
    await new Promise(res => setTimeout(res, 30));
  }

  await ctx.editMessageText(
    `✅ *Broadcast tugadi!*\n\n` +
    `📊 Jami userlar: ${users.length}\n` +
    `✅ Muvaffaqiyatli: ${sent}\n` +
    `❌ Xato: ${failed}`,
    { 
      parse_mode: 'Markdown',
      chat_id: statusMsg.chat.id, 
      message_id: statusMsg.message_id,
      reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🏠 Admin panel', 'admin_back')]])
    }
  );
  
  await clearState(ctx.from.id);
} 

// ── ✅ YANGI: Sovg'a sozlash boshlash ───────────────────────────────────────
async function startGiftConfig(ctx) {
  const gift = await Gift.findById('config');
  const preview = gift?.fileId ? '🖼️ Rasm + Matn' : '📝 Faqat Matn';
  
  await ctx.editMessageText(
    `🎁 *SOVG'A SOZLASH*\n\n` +
    `Hozirgi holat: ${preview}\n\n` +
    `Yangi sovg'ani sozlash uchun:\n` +
    `1️⃣ *Faqat matn:* oddiy matn yuboring\n` +
    `2️⃣ *Rasm+matn:* rasm yuboring va caption qo'shing\n\n` +
    `Bu sovg'a userlar "🎁 Sovg'alar" tugmasini bosganda ko'rinadi.\n\n` +
    `Bekor qilish uchun /adminman bosing yoki "🔙 Orqaga" tugmasini bosing.`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Orqaga', 'admin_back')]])
    }
  );
  await setState(ctx.from.id, 'admin_gift_waiting');
}

// ── ✅ YANGI: Sovg'ani saqlash ──────────────────────────────────────────────
// ── ✅ YANGI: Sovg'ani saqlash (rasm+matn support) ───────────────────────────
// ── ✅ YANGI: Sovg'ani saqlash (HTML parse mode bilan) ──────────────────────
async function saveGift(ctx, fileId, text) {
  try {
    await Gift.findByIdAndUpdate('config', {
      text: text || '🎁 Sovg\'alar tez kunda!',
      fileId: fileId || null,
      updatedAt: new Date()
    }, { upsert: true, new: true });
    
    // ✅ Matnni HTML uchun escape qilish funksiyasi
    function escapeHtml(text) {
      if (!text) return '';
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
    
    const safeText = escapeHtml(text || '🎁 Sovg\'alar tez kunda!');
    const caption = `✅ Sovg'a muvaffaqiyatli saqlandi! 🎉\n\n📝 Matn: ${safeText}`;
    
    // ✅ Foydalanuvchiga tasdiqlash xabari
    if (fileId) {
      await ctx.replyWithPhoto(fileId, {
        caption: caption,
        parse_mode: 'HTML',  // ✅ Markdown o'rniga HTML
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🏠 Admin panel', 'admin_back')]])
      });
    } else {
      await ctx.reply(caption, {
        parse_mode: 'HTML',  // ✅ Markdown o'rniga HTML
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🏠 Admin panel', 'admin_back')]])
      });
    }
    
    await clearState(ctx.from.id);
  } catch (err) {
    console.error('❌ saveGift xatosi:', err);
    await ctx.reply('❌ Xatolik yuz berdi! Qaytadan urinib ko\'ring.');
  }
}

// ── Matn xabari: state ga qarab qayta ishlash ───────────────────────────────
// ── Matn yoki Rasm+Matn xabari: state ga qarab qayta ishlash ─────────────────
async function handleAdminText(ctx) {
  const user = await User.findOne({ telegramId: ctx.from.id });
  if (!user || !user.state) return;

  // ✅ Rasm yoki matnni olish (ikkalasi uchun universal)
  const text = ctx.message?.text?.trim() || ctx.message?.caption?.trim() || '';
  const fileId = ctx.message?.photo?.[ctx.message.photo.length - 1]?.file_id || null; // Eng sifatli rasm
  const td = user.tempData || {};

  // ✅ Broadcast xabarni qabul qilish
  if (user.state === 'admin_broadcast_waiting') {
    const message = {
      text: text || '📢 Yangi xabar!',
      photo: fileId // ✅ Rasm file_id ni ham o'tkazamiz
    };
    await ctx.reply('🔄 Yuborish boshlandi... Bu biroz vaqt olishi mumkin.');
    await sendBroadcast(ctx, message);
    return;
  }

  // ✅ Sovg'a sozlash
  if (user.state === 'admin_gift_waiting') {
    const giftText = text || '🎁 Sovg\'alar tez kunda!';
    await saveGift(ctx, fileId, giftText); // ✅ fileId ni ham o'tkazamiz
    return;
  }

  // --- vaqt kiritish (faqat matn) ---
  if (user.state === 'admin_enter_time') {
    if (!isValidTimeSlot(text)) {
      return ctx.reply(
        '❌ Noto\'g\'ri format!\n\nIltimos shu tartibda kiriting: `HH:MM-HH:MM`\nMisol: `11:20-12:50`',
        { parse_mode: 'Markdown' }
      );
    }

    if (td.action === 'change_time') {
      const group = await Group.findOne({ groupId: td.groupId });
      const oldTime = group.timeSlot;

      const conflict = await Group.findOne({
        teacherId: group.teacherId,
        timeSlot: text,
        weekType: group.weekType,
        groupId: { $ne: group.groupId }
      });
      if (conflict) {
        await clearState(ctx.from.id);
        return ctx.reply(
          `❌ *${text}* vaqtida *${group.weekType}* uchun guruh allaqachon mavjud (#${conflict.groupId})!`,
          { parse_mode: 'Markdown' }
        );
      }

      await Group.updateOne({ groupId: td.groupId }, { $set: { timeSlot: text } });
      await clearState(ctx.from.id);
      return ctx.reply(`✅ Vaqt o'zgartirildi: *${oldTime}* → *${text}*`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Guruhga qaytish', `admin_group_menu_${td.groupId}`)]])
      });
    }

    await User.findOneAndUpdate(
      { telegramId: ctx.from.id },
      { state: 'admin_enter_name', tempData: { ...td, timeSlot: text, action: 'create' } }
    );
    return ctx.reply(
      `✅ Vaqt: *${text}*\n\n*2-qadam:* Guruh nomini kiriting:\nMisol: \`IELTS Standard\``,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('❌ Bekor', `admin_teacher_${td.teacherId}`)]])
      }
    );
  }

  // --- nom kiritish (faqat matn) ---
  if (user.state === 'admin_enter_name') {
    if (td.action === 'change_name') {
      const oldName = (await Group.findOne({ groupId: td.groupId }))?.name;
      await Group.updateOne({ groupId: td.groupId }, { $set: { name: text } });
      await clearState(ctx.from.id);
      return ctx.reply(`✅ Nom o'zgartirildi: *${oldName}* → *${text}*`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Guruhga qaytish', `admin_group_menu_${td.groupId}`)]])
      });
    }

    await User.findOneAndUpdate(
      { telegramId: ctx.from.id },
      { state: 'admin_select_weektype', tempData: { ...td, name: text } }
    );
    return showWeekTypeSelect(ctx);
  }
} 

// ── Hafta kuni tanlangandan so'ng guruh yaratish ─────────────────────────────
async function handleWeekTypeSelect(ctx, weekType) {
  await ctx.answerCbQuery();
  const user = await User.findOne({ telegramId: ctx.from.id });
  const td   = user?.tempData || {};

  if (user.state === 'admin_select_weektype' && td.action === 'create') {
    const conflict = await Group.findOne({
      teacherId: td.teacherId,
      timeSlot:  td.timeSlot,
      weekType
    });
    if (conflict) {
      await clearState(ctx.from.id);
      return ctx.editMessageText(
        `❌ *${td.timeSlot} ${weekType}* da guruh allaqachon mavjud (#${conflict.groupId})!`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Orqaga', `admin_teacher_${td.teacherId}`)]])
        }
      );
    }

    const groupId = await getNextGroupId();
    await Group.create({
      groupId, teacherId: td.teacherId,
      timeSlot: td.timeSlot, name: td.name, weekType, votes: 0
    });
    await clearState(ctx.from.id);

    const teacher = await Teacher.findOne({ telegramId: td.teacherId });
    return ctx.editMessageText(
      `✅ *Guruh yaratildi!*\n\n🆔 ID: *${groupId}*\n👨‍🏫 O'qituvchi: *${teacher?.name}*\n` +
      `⏰ Vaqt: *${td.timeSlot}*\n📚 Nom: *${td.name}*\n📅 Kunlar: *${weekType}*`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔙 O\'qituvchiga qaytish', `admin_teacher_${td.teacherId}`)],
          [Markup.button.callback('🏠 Admin panel', 'admin_back')]
        ])
      }
    );
  }

  if (user.state === 'admin_select_weektype' && td.action === 'change_weektype') {
    const group = await Group.findOne({ groupId: td.groupId });
    const conflict = await Group.findOne({
      teacherId: group.teacherId,
      timeSlot:  group.timeSlot,
      weekType,
      groupId: { $ne: group.groupId }
    });
    if (conflict) {
      await clearState(ctx.from.id);
      return ctx.editMessageText(
        `❌ *${group.timeSlot} ${weekType}* da guruh allaqachon mavjud (#${conflict.groupId})!`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Orqaga', `admin_group_menu_${td.groupId}`)]])
        }
      );
    }
    await Group.updateOne({ groupId: td.groupId }, { $set: { weekType } });
    await clearState(ctx.from.id);
    return ctx.editMessageText(
      `✅ Hafta kunlari o'zgartirildi: *${td.currentWeekType}* → *${weekType}*`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Guruhga qaytish', `admin_group_menu_${td.groupId}`)]])
      }
    );
  }
}

// ── Hafta kunini o'zgartirish ───────────────────────────────────────────────
async function startChangeWeekType(ctx, groupId) {
  const group = await Group.findOne({ groupId: parseInt(groupId) });
  if (!group) return ctx.answerCbQuery('Topilmadi!');
  
  await setState(ctx.from.id, 'admin_select_weektype', {
    groupId: group.groupId, action: 'change_weektype', currentWeekType: group.weekType
  });
  await showWeekTypeSelect(ctx, true);
}

// ── ✅ YANGI: Barcha guruhlar (5 tadan sahifali) ────────────────────────────
async function showAllGroups(ctx, page = 0) {
  const PAGE_SIZE = 5;
  const groups = await Group.find().sort({ groupId: -1 }).lean();
  const teachers = await Teacher.find().lean();
  const tMap = {}; teachers.forEach(t => { tMap[t.telegramId] = t.name; });

  if (!groups.length) {
    return ctx.editMessageText('📋 Hali guruh yo\'q.', 
      Markup.inlineKeyboard([[Markup.button.callback('🔙 Orqaga', 'admin_back')]])
    );
  }

  const total = groups.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const start = page * PAGE_SIZE;
  const pageGroups = groups.slice(start, start + PAGE_SIZE);

  const buttons = pageGroups.map(g => [
    Markup.button.callback(
      `#${g.groupId} | ${tMap[g.teacherId]||'?'} | ${g.timeSlot} | ${g.name} | 🗳${g.votes}`,
      `admin_group_menu_${g.groupId}`
    )
  ]);
  
  // Navigatsiya
  const navRow = [];
  if (page > 0) navRow.push(Markup.button.callback('⬅️', `admin_groups_page_${page - 1}`));
  navRow.push(Markup.button.callback('🔙 Orqaga', 'admin_back'));
  if (page < totalPages - 1) navRow.push(Markup.button.callback('➡️', `admin_groups_page_${page + 1}`));
  buttons.push(navRow);
  
  const pageInfo = totalPages > 1 ? ` (${page + 1}/${totalPages})` : '';
  
  await ctx.editMessageText(`📋 *Barcha guruhlar:*${pageInfo}`, { 
    parse_mode: 'Markdown', 
    ...Markup.inlineKeyboard(buttons) 
  });
}

// ── Guruh menyusi ───────────────────────────────────────────────────────────
async function showGroupMenu(ctx, groupId) {
  const group   = await Group.findOne({ groupId: parseInt(groupId) });
  if (!group) return ctx.answerCbQuery('Topilmadi!');
  const teacher = await Teacher.findOne({ telegramId: group.teacherId });

  await ctx.editMessageText(
    `📋 *Guruh #${group.groupId}*\n\n` +
    `👨‍🏫 O'qituvchi: *${teacher?.name || '?'}*\n` +
    `⏰ Vaqt: *${group.timeSlot}*\n` +
    `📚 Nom: *${group.name}*\n` +
    `📅 Kunlar: *${group.weekType}*\n` +
    `🗳 Ovozlar: *${group.votes}*`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📝 Nomni o\'zgartirish',     `admin_change_name_${groupId}`)],
        [Markup.button.callback('⏰ Vaqtni o\'zgartirish',    `admin_change_time_${groupId}`)],
        [Markup.button.callback('📅 Hafta kunini o\'zgartirish', `admin_change_weektype_${groupId}`)],
        [Markup.button.callback('👨‍🏫 O\'qituvchini almashtirish', `admin_change_teacher_${groupId}`)],
        [Markup.button.callback('❌ Guruhni o\'chirish',      `admin_del_group_${groupId}`)],
        [Markup.button.callback('🔙 Orqaga', 'admin_groups')]
      ])
    }
  );
}

// ── O'qituvchini almashtirish ───────────────────────────────────────────────
async function showChangeTeacherList(ctx, groupId) {
  const group    = await Group.findOne({ groupId: parseInt(groupId) });
  if (!group) return ctx.answerCbQuery('Topilmadi!');
  
  const teachers = await Teacher.find({ telegramId: { $ne: group.teacherId } }).sort({ name: 1 });
  if (!teachers.length) {
    return ctx.editMessageText('❌ Boshqa o\'qituvchi yo\'q.', 
      Markup.inlineKeyboard([[Markup.button.callback('🔙', `admin_group_menu_${groupId}`)]])
    );
  }
  
  const buttons = teachers.map(t => 
    [Markup.button.callback(`👨‍🏫 ${t.name}`, `admin_assign_teacher_${groupId}_${t.telegramId}`)]
  );
  buttons.push([Markup.button.callback('🔙 Bekor', `admin_group_menu_${groupId}`)]);
  
  await ctx.editMessageText(`👨‍🏫 Guruh *#${groupId}* uchun yangi o'qituvchi:`, { 
    parse_mode: 'Markdown', 
    ...Markup.inlineKeyboard(buttons) 
  });
}

async function assignTeacherToGroup(ctx, groupId, newTeacherId) {
  const group      = await Group.findOne({ groupId: parseInt(groupId) });
  const newTeacher = await Teacher.findOne({ telegramId: parseInt(newTeacherId) });
  const oldTeacher = await Teacher.findOne({ telegramId: group.teacherId });
  
  if (!group || !newTeacher) return ctx.answerCbQuery('Xatolik!');

  const conflict = await Group.findOne({
    teacherId: newTeacher.telegramId,
    timeSlot: group.timeSlot,
    weekType: group.weekType,
    groupId: { $ne: group.groupId }
  });
  if (conflict) {
    return ctx.editMessageText(
      `❌ *${newTeacher.name}* da *${group.timeSlot} ${group.weekType}* guruh mavjud (#${conflict.groupId})!`,
      { 
        parse_mode: 'Markdown', 
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙', `admin_group_menu_${groupId}`)]]) 
      }
    );
  }
  
  group.teacherId = newTeacher.telegramId;
  await group.save();
  
  await ctx.editMessageText(
    `✅ O'qituvchi almashtirildi!\n${oldTeacher?.name || '?'} → *${newTeacher.name}*`,
    { 
      parse_mode: 'Markdown', 
      ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Guruhga qaytish', `admin_group_menu_${groupId}`)]]) 
    }
  );
}

// ── Guruhni o'chirish ───────────────────────────────────────────────────────
async function deleteGroup(ctx, groupId) {
  const group = await Group.findOne({ groupId: parseInt(groupId) });
  if (!group) return ctx.answerCbQuery('Topilmadi!');
  
  const teacher = await Teacher.findOne({ telegramId: group.teacherId });
  await Vote.deleteMany({ groupId: group.groupId });
  await Group.deleteOne({ groupId: parseInt(groupId) });
  
  await ctx.editMessageText(
    `🗑 *Guruh #${groupId}* o'chirildi!\n👨‍🏫 ${teacher?.name}\n⏰ ${group.timeSlot}\n🗳 ${group.votes} ovoz o'chirildi`,
    { 
      parse_mode: 'Markdown', 
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📋 Guruhlar', 'admin_groups')], 
        [Markup.button.callback('🏠 Panel', 'admin_back')]
      ]) 
    }
  );
}

// ── O'qituvchini o'chirish ──────────────────────────────────────────────────
async function deleteTeacher(ctx, teacherId) {
  const teacher = await Teacher.findOne({ telegramId: parseInt(teacherId) });
  if (!teacher) return ctx.answerCbQuery('Topilmadi!');
  
  const groups = await Group.find({ teacherId: teacher.telegramId });
  for (const g of groups) await Vote.deleteMany({ groupId: g.groupId });
  await Group.deleteMany({ teacherId: teacher.telegramId });
  await Teacher.deleteOne({ telegramId: parseInt(teacherId) });
  
  await ctx.editMessageText(
    `🗑 *${teacher.name}* o'chirildi!\n📋 ${groups.length} guruh o'chirildi`,
    { 
      parse_mode: 'Markdown', 
      ...Markup.inlineKeyboard([[Markup.button.callback('👨‍🏫 O\'qituvchilar', 'admin_teachers')]]) 
    }
  );
}

// ── ✅ YANGI: Statistika - jami userlar bilan ───────────────────────────────
async function showStats(ctx) {
  const teachers = await Teacher.find().lean();
  const groups   = await Group.find().sort({ votes: -1 }).lean();
  const users    = await User.find().lean();
  
  const tMap = {}; teachers.forEach(t => { tMap[t.telegramId] = t.name; });
  const totalVotes = groups.reduce((s, g) => s + g.votes, 0);
  const verifiedUsers = users.filter(u => u.phone).length;

  let text = `📊 *STATISTIKA*\n\n` +
    `👥 Jami userlar: *${users.length}*\n` +
    `✅ Tasdiqlangan userlar: *${verifiedUsers}*\n` +
    `👨‍🏫 O'qituvchilar: *${teachers.length}*\n` +
    `📋 Guruhlar: *${groups.length}*\n` +
    `🗳 Jami ovozlar: *${totalVotes}*\n\n` +
    `*🏆 Top 10 guruh:*\n`;
    
  groups.slice(0, 10).forEach((g, i) => {
    text += `${i + 1}. #${g.groupId} | ${tMap[g.teacherId]||'?'} | ${g.name} | 🗳${g.votes}\n`;
  });
  
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Orqaga', 'admin_back')]])
  });
}

module.exports = {
  showAdminPanel, showTeachersList, showTeacherMenu,
  startCreateGroup, startChangeTime, startChangeName, startChangeWeekType,
  handleAdminText, handleWeekTypeSelect,
  showAllGroups, showGroupMenu,
  showChangeTeacherList, assignTeacherToGroup,
  deleteGroup, deleteTeacher, showStats,
  // ✅ Yangi funksiyalar
  startBroadcast, sendBroadcast,
  startGiftConfig, saveGift
};