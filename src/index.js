// ═══════════════════════════════════════════════════════
//  src/index.js - TO'LIQ TO'G'IRILANGAN VERSIYA
// ═══════════════════════════════════════════════════════

require('dotenv').config();
const { Telegraf } = require('telegraf');
const mongoose = require('mongoose');
const config = require('../config');

// ═══════════════════════════════════════════════════════
//  ✅ MODELS - HAMMASINI IMPORT QILING
// ═══════════════════════════════════════════════════════
const Teacher = require('./models/Teacher');
const Group   = require('./models/Group');
const User    = require('./models/User');
const Vote    = require('./models/Vote');  // ✅ Vote modelini import qilish (XATO SHU YERDA EDI!)
const Gift    = require('./models/Gift');

// ═══════════════════════════════════════════════════════
//  ✅ HELPERS - FAQAT 1 MARTA IMPORT QILING
// ═══════════════════════════════════════════════════════
const { 
  isAdmin, 
  checkSubscription, 
  clearState,
  getNextGroupId,
  isValidTimeSlot,
  getPaginatedGroupsKeyboard,
  escapeHtml
} = require('./utils/helpers');

// ═══════════════════════════════════════════════════════
//  ✅ HANDLERS
// ═══════════════════════════════════════════════════════
const adminHandler = require('./handlers/admin');
const userHandler  = require('./handlers/user');

// ═══════════════════════════════════════════════════════
//  ✅ BOT INIT
// ═══════════════════════════════════════════════════════
console.log('🔍 Bot token yuklanmoqda...');
const bot = new Telegraf(config.BOT_TOKEN);

// ═══════════════════════════════════════════════════════
//  ✅ MONGODB CONNECTION
// ═══════════════════════════════════════════════════════
mongoose.connect(config.MONGODB_URI)
  .then(() => console.log('✅ MongoDB ga muvaffaqiyatli ulandi'))
  .catch(err => {
    console.error('❌ MongoDB ulanish xatosi:', err.message);
    process.exit(1);
  });

// ═══════════════════════════════════════════════════════
//  ✅ ADMIN COMMANDS
// ═══════════════════════════════════════════════════════
bot.command('adminman', async ctx => {
  if (!isAdmin(ctx.from.id)) {
    return ctx.reply('❌ Sizda admin huquqi yo\'q!');
  }
  await adminHandler.showAdminPanel(ctx);
});

bot.command('addteacher', async ctx => {
  if (!isAdmin(ctx.from.id)) return;
  
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length < 2) {
    return ctx.reply(
      '❌ Format: `/addteacher <ID> <Ism>`\nMisol: `/addteacher 123456 Ali Karimov`', 
      { parse_mode: 'Markdown' }
    );
  }
  
  const telegramId = parseInt(args[0]);
  if (isNaN(telegramId)) return ctx.reply('❌ ID raqam bo\'lishi kerak!');
  
  const name = args.slice(1).join(' ');
  const existing = await Teacher.findOne({ telegramId });
  
  if (existing) {
    return ctx.reply(`❌ Allaqachon mavjud: *${existing.name}*`, { parse_mode: 'Markdown' });
  }
  
  await Teacher.create({ telegramId, name });
  ctx.reply(`✅ *${name}* qo'shildi! 🆔 ${telegramId}`, { parse_mode: 'Markdown' });
});

// ═══════════════════════════════════════════════════════
//  ✅ ADMIN CALLBACKS
// ═══════════════════════════════════════════════════════
bot.action('admin_back', async ctx => {
  await ctx.answerCbQuery();
  await adminHandler.showAdminPanel(ctx);
});

bot.action('admin_teachers', async ctx => {
  await ctx.answerCbQuery();
  await adminHandler.showTeachersList(ctx, 0);
});

bot.action('admin_groups', async ctx => {
  await ctx.answerCbQuery();
  await adminHandler.showAllGroups(ctx, 0);
});

bot.action('admin_stats', async ctx => {
  await ctx.answerCbQuery();
  await adminHandler.showStats(ctx);
});

bot.action('admin_add_teacher', async ctx => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    '➕ *Yangi o\'qituvchi qo\'shish:*\n\n`/addteacher <TelegramID> <Ism>`\n\nMisol:\n`/addteacher 987654321 Sardor Usmonov`',
    { parse_mode: 'Markdown' }
  );
});

// ✅ Admin teachers pagination
bot.action(/^admin_teachers_page_(\d+)$/, async ctx => {
  await ctx.answerCbQuery();
  await adminHandler.showTeachersList(ctx, parseInt(ctx.match[1]));
});

// ✅ Admin groups pagination  
bot.action(/^admin_groups_page_(\d+)$/, async ctx => {
  await ctx.answerCbQuery();
  await adminHandler.showAllGroups(ctx, parseInt(ctx.match[1]));
});

// ✅ Broadcast
bot.action('admin_broadcast', async ctx => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx.from.id)) return;
  await adminHandler.startBroadcast(ctx);
});

// ✅ Sovg'a sozlash
bot.action('admin_gift_config', async ctx => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx.from.id)) return;
  await adminHandler.startGiftConfig(ctx);
});

// ✅ Turnirni tugatish / qayta ochish
bot.action('admin_end_tournament', async ctx => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx.from.id)) return;
  await adminHandler.confirmEndTournament(ctx);
});

bot.action('admin_end_tournament_confirm', async ctx => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx.from.id)) return;
  await adminHandler.endTournament(ctx);
});

bot.action('admin_reopen_tournament', async ctx => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx.from.id)) return;
  await adminHandler.reopenTournament(ctx);
});

// ✅ Ovoz berganlar (PDF)
bot.action('admin_voters_pdf', async ctx => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx.from.id)) return;
  await adminHandler.showVotersPdfTeachers(ctx, 0);
});

bot.action(/^admin_voters_pdf_page_(\d+)$/, async ctx => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx.from.id)) return;
  await adminHandler.showVotersPdfTeachers(ctx, parseInt(ctx.match[1]));
});

bot.action(/^admin_vpdf_teacher_(\d+)_(\d+)$/, async ctx => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx.from.id)) return;
  await adminHandler.showVotersPdfGroups(ctx, ctx.match[1], parseInt(ctx.match[2]));
});

bot.action(/^admin_vpdf_group_(\d+)$/, async ctx => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery();
  await adminHandler.sendVotersPdf(ctx, ctx.match[1]);
});

bot.action(/^admin_teacher_(\d+)$/, async ctx => {
  await ctx.answerCbQuery();
  await adminHandler.showTeacherMenu(ctx, ctx.match[1]);
});

bot.action(/^admin_del_teacher_(\d+)$/, async ctx => {
  await ctx.answerCbQuery();
  await adminHandler.deleteTeacher(ctx, ctx.match[1]);
});

bot.action(/^admin_create_group_(\d+)$/, async ctx => {
  await ctx.answerCbQuery();
  await adminHandler.startCreateGroup(ctx, ctx.match[1]);
});

bot.action(/^admin_group_menu_(\d+)$/, async ctx => {
  await ctx.answerCbQuery();
  await adminHandler.showGroupMenu(ctx, ctx.match[1]);
});

bot.action(/^admin_change_name_(\d+)$/, async ctx => {
  await ctx.answerCbQuery();
  await adminHandler.startChangeName(ctx, ctx.match[1]);
});

bot.action(/^admin_change_time_(\d+)$/, async ctx => {
  await ctx.answerCbQuery();
  await adminHandler.startChangeTime(ctx, ctx.match[1]);
});

bot.action(/^admin_change_weektype_(\d+)$/, async ctx => {
  await ctx.answerCbQuery();
  await adminHandler.startChangeWeekType(ctx, ctx.match[1]);
});

bot.action(/^admin_weektype_(.+)$/, async ctx => {
  await adminHandler.handleWeekTypeSelect(ctx, ctx.match[1]);
});

bot.action(/^admin_change_teacher_(\d+)$/, async ctx => {
  await ctx.answerCbQuery();
  await adminHandler.showChangeTeacherList(ctx, ctx.match[1]);
});

bot.action(/^admin_assign_teacher_(\d+)_(\d+)$/, async ctx => {
  await ctx.answerCbQuery();
  await adminHandler.assignTeacherToGroup(ctx, ctx.match[1], ctx.match[2]);
});

bot.action(/^admin_del_group_(\d+)$/, async ctx => {
  await ctx.answerCbQuery();
  await adminHandler.deleteGroup(ctx, ctx.match[1]);
});

// ═══════════════════════════════════════════════════════
//  ✅ USER COMMANDS
// ═══════════════════════════════════════════════════════
bot.start(async ctx => {
  await userHandler.handleStart(ctx);
});

bot.on('contact', async ctx => {
  await userHandler.handleContact(ctx);
});

// ═══════════════════════════════════════════════════════
//  ✅ TEXT HANDLER - TO'G'IRILANGAN (Vote import qilingan)
// ═══════════════════════════════════════════════════════
bot.on('text', async ctx => {
  if (ctx.message.text?.startsWith('/')) return;

  const user = await User.findOne({ telegramId: ctx.from.id });
  const messageText = ctx.message.text;

  // ✅ Post-vote oddiy keyboard tugmalari (FAQT 2 TA)
  if (user && await Vote.findOne({ userId: ctx.from.id })) {
    if (messageText === '🎁 Sovg\'alar' || messageText === '🏆 Top 15') {
      return userHandler.handlePostVoteButtons(ctx);
    }
  }

  // Admin state
  if (user?.state?.startsWith('admin_')) {
    if (!isAdmin(ctx.from.id)) return;
    return adminHandler.handleAdminText(ctx);
  }

  // User state (ism/yosh)
  if (user?.state && ['waiting_name', 'waiting_age'].includes(user.state)) {
    return userHandler.handleTextWithState(ctx);
  }

  // Oddiy user - telefon tekshiruvi
  await userHandler.handleTextWithoutPhone(ctx);
}); 

// ═══════════════════════════════════════════════════════
//  ✅ PHOTO HANDLER
// ═══════════════════════════════════════════════════════
bot.on('photo', async ctx => {
  const user = await User.findOne({ telegramId: ctx.from.id });

  if (user?.state && ['admin_broadcast_waiting', 'admin_gift_waiting'].includes(user.state)) {
    if (user.state.startsWith('admin_') && !isAdmin(ctx.from.id)) return;
    return adminHandler.handleAdminText(ctx);
  }
});

// ═══════════════════════════════════════════════════════
//  ✅ VIDEO HANDLER (broadcast uchun video+matn)
// ═══════════════════════════════════════════════════════
bot.on('video', async ctx => {
  const user = await User.findOne({ telegramId: ctx.from.id });

  if (user?.state && ['admin_broadcast_waiting', 'admin_gift_waiting'].includes(user.state)) {
    if (user.state.startsWith('admin_') && !isAdmin(ctx.from.id)) return;
    return adminHandler.handleAdminText(ctx);
  }
});

// ═══════════════════════════════════════════════════════
//  ✅ USER CALLBACKS
// ═══════════════════════════════════════════════════════
bot.action('check_subscription', async ctx => {
  await ctx.answerCbQuery();
  const user = await User.findOne({ telegramId: ctx.from.id });
  if (!user?.phone) {
    return ctx.answerCbQuery('⚠️ Avval telefon raqamingizni ulashing!', { show_alert: true });
  }
  await userHandler.checkAndAskSubscription(ctx, user);
});

bot.action(/^teachers_page_(\d+)$/, async ctx => {
  await ctx.answerCbQuery();
  await userHandler.showTeachersList(ctx, parseInt(ctx.match[1]));
});

bot.action(/^user_teacher_(\d+)$/, async ctx => {
  await ctx.answerCbQuery();
  await userHandler.showTeacherGroups(ctx, ctx.match[1], 0);
});

bot.action(/^groups_page_(\d+)_(\d+)$/, async ctx => {
  await ctx.answerCbQuery();
  await userHandler.showTeacherGroups(ctx, ctx.match[1], parseInt(ctx.match[2]));
});

bot.action(/^vote_group_(\d+)$/, async ctx => {
  await ctx.answerCbQuery();
  const user = await User.findOne({ telegramId: ctx.from.id });
  if (!user?.phone) {
    return ctx.answerCbQuery('⚠️ Avval telefon raqamingizni ulashing!', { show_alert: true });
  }
  await userHandler.showVoteConfirm(ctx, ctx.match[1]);
});

bot.action(/^confirm_vote_(\d+)$/, async ctx => {
  await ctx.answerCbQuery();
  const user = await User.findOne({ telegramId: ctx.from.id });
  if (!user?.phone) {
    return ctx.answerCbQuery('⚠️ Avval telefon raqamingizni ulashing!', { show_alert: true });
  }
  await userHandler.castVote(ctx, ctx.match[1]);
});

bot.action('back_to_teachers', async ctx => {
  await ctx.answerCbQuery();
  await userHandler.showTeachersList(ctx, 0);
});

bot.action('back_post_vote', async ctx => {
  await ctx.answerCbQuery();
  await userHandler.showPostVoteMenu?.(ctx) || await userHandler.showTeachersList(ctx, 0);
});

bot.action('show_gifts', async ctx => {
  await ctx.answerCbQuery();
  await userHandler.showGifts(ctx);
});

bot.action('show_top15', async ctx => {
  await ctx.answerCbQuery();
  await userHandler.showTop15(ctx);
});

bot.action('cancel', async ctx => {
  await ctx.answerCbQuery('Bekor qilindi');
  await ctx.deleteMessage().catch(() => {});
});

// ═══════════════════════════════════════════════════════
//  ✅ ERROR HANDLING
// ═══════════════════════════════════════════════════════
bot.catch((err, ctx) => {
  console.error(`❌ Xato (${ctx.updateType}):`, err.message);
  
  if (ctx.callbackQuery) {
    ctx.answerCbQuery('❌ Xatolik yuz berdi!').catch(() => {});
  } else if (ctx.message) {
    ctx.reply('❌ Xatolik yuz berdi. Qaytadan urinib ko\'ring.').catch(() => {});
  }
});

// ═══════════════════════════════════════════════════════
//  ✅ BOT LAUNCH
// ═══════════════════════════════════════════════════════
async function startBot() {
  try {
    if (!config.BOT_TOKEN || config.BOT_TOKEN.length < 40) {
      throw new Error('BOT_TOKEN noto\'g\'ri formatda yoki bo\'sh!');
    }
    
    console.log('🤖 Bot ishga tushmoqda...');
    console.log(`👤 Admin ID: ${Array.isArray(config.ADMIN_ID) ? config.ADMIN_ID.join(', ') : config.ADMIN_ID}`);
    console.log(`📢 Kanal: @${config.CHANNEL_USERNAME || 'sozlanmagan'}`);
    
    await bot.launch();
    
    console.log('✅ Bot muvaffaqiyatli ishga tushdi!');
    console.log('🔗 Bot linki: https://t.me/' + (await bot.telegram.getMe()).username);
    
  } catch (err) {
    console.error('❌ Bot ishga tushmadi:', err.message);
    process.exit(1);
  }
}

startBot();

// ═══════════════════════════════════════════════════════
//  ✅ GRACEFUL SHUTDOWN
// ═══════════════════════════════════════════════════════
process.once('SIGINT', () => {
  console.log('\n🛑 SIGINT signal qabul qilindi. Bot to\'xtatilmoqda...');
  bot.stop('SIGINT');
  process.exit(0);
});

process.once('SIGTERM', () => {
  console.log('\n🛑 SIGTERM signal qabul qilindi. Bot to\'xtatilmoqda...');
  bot.stop('SIGTERM');
  process.exit(0);
});