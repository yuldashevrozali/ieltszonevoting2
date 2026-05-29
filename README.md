# 🤖 Ovoz Yig'ish Telegram Boti

JavaScript (Node.js) + MongoDB asosida qurilgan to'liq funksional Telegram bot.

---

## 📁 Fayl Tuzilishi

```
voting-bot/
├── src/
│   ├── index.js              ← Asosiy bot fayli
│   ├── handlers/
│   │   ├── admin.js          ← Admin panel funksiyalari
│   │   └── user.js           ← Foydalanuvchi oqimi
│   ├── models/
│   │   ├── Teacher.js        ← O'qituvchi modeli
│   │   ├── Group.js          ← Guruh modeli (ID 1500+)
│   │   ├── Vote.js           ← Ovoz modeli
│   │   └── User.js           ← Foydalanuvchi modeli
│   └── utils/
│       └── helpers.js        ← Yordamchi funksiyalar
├── config/
│   └── index.js              ← Konfiguratsiya
├── .env.example              ← Muhit o'zgaruvchilari namunasi
├── package.json
└── README.md
```

---

## ⚙️ O'rnatish

### 1. Paketlarni o'rnatish
```bash
npm install
```

### 2. `.env` fayl yaratish
```bash
cp .env.example .env
```

`.env` faylini tahrirlang:
```env
BOT_TOKEN=7xxxxxxxxx:AAxxxxxx          # @BotFather dan olingan token
MONGODB_URI=mongodb://localhost:27017/voting_bot
ADMIN_ID=123456789                     # Sizning Telegram ID (raqam)
CHANNEL_USERNAME=my_channel            # Kanal username (@ belgisisiz)
GROUP_ID_START=1500                    # Guruh ID boshlanishi
```

> 💡 **Telegram ID ni qanday bilish:** @userinfobot ga /start yuboring

### 3. MongoDB ishga tushirish
```bash
# Lokal MongoDB
mongod

# Yoki MongoDB Atlas bilan
# MONGODB_URI=mongodb+srv://...
```

### 4. Botni ishga tushirish
```bash
# Production
npm start

# Development (auto-restart)
npm run dev
```

---

## 👑 Admin Panel

Admin panel **faqat** `.env` dagi `ADMIN_ID` ga teng Telegram ID uchun ochiladi.

### Admin buyruqlari:
| Buyruq | Tavsif |
|--------|--------|
| `/adminman` | Admin panelni ochish |
| `/addteacher <ID> <Ism>` | O'qituvchi qo'shish |

**Misol:**
```
/addteacher 987654321 Sardor Usmonov
/addteacher 111222333 Malika Rahimova
```

### Admin panel imkoniyatlari:
- ✅ O'qituvchi qo'shish/o'chirish
- ✅ Guruh yaratish (ID avtomatik 1500, 1501, 1502...)
- ✅ Guruhni o'chirish
- ✅ Guruh vaqtini o'zgartirish (agar vaqt band bo'lsa — ALMASHTIRADI)
- ✅ Guruh o'qituvchisini almashtirish
- ✅ Statistika ko'rish

---

## 🕐 Vaqt Slotlari

Har bir guruhga bitta vaqt sloti tayinlanadi. Bir o'qituvchida bir vaqtda faqat 1 ta guruh bo'lishi mumkin.

| Vaqt |
|------|
| 08:00–10:00 |
| 10:00–12:00 |
| 12:00–14:00 |
| 14:00–16:00 |
| 16:00–18:00 |
| 18:00–20:00 |

### Vaqt almashtirish logikasi:
- **Yangi vaqt bo'sh** → shunchaki o'zgartiriladi
- **Yangi vaqtda boshqa guruh bor** → ikkala guruh vaqtlari ALMASHTIRILADI

---

## 👤 Foydalanuvchi Oqimi

```
/start
  └─► Telefon raqam so'rash (button)
        └─► Kanalga a'zo bo'lish tekshiruvi
              └─► O'qituvchi tanlash
                    └─► Guruhlar ro'yxati (5 tadan, sahifali)
                          └─► Ovoz berish tasdiqlash
                                └─► ✅ Ovoz qabul qilindi!
```

**Qoidalar:**
- Har bir user har bir guruhga faqat **1 marta** ovoz berishi mumkin
- Telefon raqami majburiy
- Kanal obunasi majburiy

---

## 🗄️ MongoDB Kolleksiyalar

| Kolleksiya | Tavsif |
|------------|--------|
| `teachers` | O'qituvchilar (telegramId, name) |
| `groups` | Guruhlar (groupId 1500+, teacherId, timeSlot, votes) |
| `votes` | Ovozlar (userId, groupId) — takroriy ovoz bloklangan |
| `users` | Foydalanuvchilar (phone, subscription status) |

---

## 🛡️ Xavfsizlik

- Admin panel faqat 1 ta aniq ID ga ochiladi
- Takroriy ovoz berish bloklangan (MongoDB unique index)
- Foydalanuvchi faqat o'z kontaktini yuborishi mumkin
- Kanal obunasi tekshiriladi

---

## 🚀 Production uchun maslahatlar

```bash
# PM2 bilan ishga tushirish
npm install -g pm2
pm2 start src/index.js --name voting-bot
pm2 save
pm2 startup
```

Yoki `systemd` service yarating.
