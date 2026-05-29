require('dotenv').config();
const { Telegraf } = require('telegraf');
const mongoose = require('mongoose');
const config = require('../config');

const Teacher = require('./models/Teacher');
const Group   = require('./models/Group');
const User    = require('./models/User');
const { isAdmin } = require('./utils/helpers');

const adminHandler = require('./handlers/admin');
const userHandler  = require('./handlers/user');

const bot = new Telegraf(config.BOT_TOKEN);

mongoose.connect(config.MONGODB_URI)
  .then(() => console.log('✅ MongoDB ga ulandi'))
  .catch(err => { console.error('❌ MongoDB xatosi:', err); process.exit(1); });

// ═══════════════════════════════════════════════════════
//  ADMIN BUYRUQLARI
// ═══════════════════════════════════════════════════════

bot.command('adminman', async ctx => {
  if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Sizda admin huquqi yo\'q!');
  await adminHandler.showAdminPanel(ctx);
});

bot.command('addteacher', async ctx => {
  if (!isAdmin(ctx.from.id)) return;
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length < 2)
    return ctx.reply('❌ Format: `/addteacher <ID> <Ism>`\nMisol: `/addteacher 123456 Ali Karimov`', { parse_mode: 'Markdown' });
  const telegramId = parseInt(args[0]);
  if (isNaN(telegramId)) return ctx.reply('❌ ID raqam bo\'lishi kerak!');
  const name = args.slice(1).join(' ');
  const existing = await Teacher.findOne({ telegramId });
  if (existing) return ctx.reply(`❌ Allaqachon mavjud: *${existing.name}*`, { parse_mode: 'Markdown' });
  await Teacher.create({ telegramId, name });
  ctx.reply(`✅ *${name}* qo'shildi! 🆔 ${telegramId}`, { parse_mode: 'Markdown' });
});

// ═══════════════════════════════════════════════════════
//  ADMIN CALLBACK
// ═══════════════════════════════════════════════════════

bot.action('admin_back', async ctx => { await ctx.answerCbQuery(); await adminHandler.showAdminPanel(ctx); });
bot.action('admin_teachers', async ctx => { await ctx.answerCbQuery(); await adminHandler.showTeachersList(ctx); });
bot.action('admin_groups',   async ctx => { await ctx.answerCbQuery(); await adminHandler.showAllGroups(ctx); });
bot.action('admin_stats',    async ctx => { await ctx.answerCbQuery(); await adminHandler.showStats(ctx); });

bot.action('admin_add_teacher', async ctx => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    '➕ *Yangi o\'qituvchi qo\'shish:*\n\n`/addteacher <TelegramID> <Ism>`\n\nMisol:\n`/addteacher 987654321 Sardor Usmonov`',
    { parse_mode: 'Markdown' }
  );
});

bot.action(/^admin_teacher_(\d+)$/, async ctx => {
  await ctx.answerCbQuery();
  await adminHandler.showTeacherMenu(ctx, ctx.match[1]);
});

bot.action(/^admin_del_teacher_(\d+)$/, async ctx => {
  await ctx.answerCbQuery();
  await adminHandler.deleteTeacher(ctx, ctx.match[1]);
});

// Guruh yaratish — vaqt kiritish boshlanadi
bot.action(/^admin_create_group_(\d+)$/, async ctx => {
  await ctx.answerCbQuery();
  await adminHandler.startCreateGroup(ctx, ctx.match[1]);
});

bot.action(/^admin_group_menu_(\d+)$/, async ctx => {
  await ctx.answerCbQuery();
  await adminHandler.showGroupMenu(ctx, ctx.match[1]);
});

// Nom o'zgartirish
bot.action(/^admin_change_name_(\d+)$/, async ctx => {
  await ctx.answerCbQuery();
  await adminHandler.startChangeName(ctx, ctx.match[1]);
});

// Vaqt o'zgartirish — matn orqali
bot.action(/^admin_change_time_(\d+)$/, async ctx => {
  await ctx.answerCbQuery();
  await adminHandler.startChangeTime(ctx, ctx.match[1]);
});

// Hafta kuni o'zgartirish
bot.action(/^admin_change_weektype_(\d+)$/, async ctx => {
  await ctx.answerCbQuery();
  await adminHandler.startChangeWeekType(ctx, ctx.match[1]);
});

// Hafta kuni tanlash (create va change uchun)
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
//  USER BUYRUQLARI
// ═══════════════════════════════════════════════════════

bot.start(async ctx => { await userHandler.handleStart(ctx); });

bot.on('contact', async ctx => { await userHandler.handleContact(ctx); });

// Matn handler — admin FSM yoki user phone tekshiruvi
bot.on('text', async ctx => {
  if (ctx.message.text.startsWith('/')) return;

  const user = await User.findOne({ telegramId: ctx.from.id });

  // Admin state bor bo'lsa — adminHandler ga uzatish
  if (user?.state && user.state.startsWith('admin_enter')) {
    if (!isAdmin(ctx.from.id)) return;
    return adminHandler.handleAdminText(ctx);
  }

  // Oddiy foydalanuvchi — telefon yo'q bo'lsa so'rash
  await userHandler.handleTextWithoutPhone(ctx);
});

// ═══════════════════════════════════════════════════════
//  USER CALLBACK
// ═══════════════════════════════════════════════════════

bot.action('check_subscription', async ctx => {
  await ctx.answerCbQuery();
  const user = await User.findOne({ telegramId: ctx.from.id });
  if (!user?.phone) return ctx.answerCbQuery('⚠️ Avval telefon raqamingizni ulashing!', { show_alert: true });
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
  if (!user?.phone) return ctx.answerCbQuery('⚠️ Avval telefon raqamingizni ulashing!', { show_alert: true });
  await userHandler.showVoteConfirm(ctx, ctx.match[1]);
});

bot.action(/^confirm_vote_(\d+)$/, async ctx => {
  await ctx.answerCbQuery();
  const user = await User.findOne({ telegramId: ctx.from.id });
  if (!user?.phone) return ctx.answerCbQuery('⚠️ Avval telefon raqamingizni ulashing!', { show_alert: true });
  await userHandler.castVote(ctx, ctx.match[1]);
});

bot.action('back_to_teachers', async ctx => {
  await ctx.answerCbQuery();
  await userHandler.showTeachersList(ctx, 0);
});

bot.action('cancel', async ctx => {
  await ctx.answerCbQuery('Bekor qilindi');
  await ctx.deleteMessage().catch(() => {});
});

// ═══════════════════════════════════════════════════════
//  XATO USHLASH
// ═══════════════════════════════════════════════════════
bot.catch((err, ctx) => {
  console.error(`❌ Xato (${ctx.updateType}):`, err);
  if (ctx.callbackQuery) ctx.answerCbQuery('❌ Xatolik!').catch(() => {});
});

bot.launch()
  .then(() => {
    console.log('🤖 Bot ishga tushdi!');
    console.log(`👤 Admin ID: ${config.ADMIN_ID}`);
    console.log(`📢 Kanal: @${config.CHANNEL_USERNAME}`);
  })
  .catch(err => { console.error('❌ Bot ishga tushmadi:', err); process.exit(1); });

process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));