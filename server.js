const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ========== STORAGE ==========
let panels = [];
let aiHistory = [];

// ========== ROUTES ==========
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/settings', (req, res) => res.sendFile(path.join(__dirname, 'public', 'settings.html')));
app.get('/ai', (req, res) => res.sendFile(path.join(__dirname, 'public', 'ai.html')));

// ========== API ==========
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false });
  }
});

app.get('/api/panels', (req, res) => res.json(panels));

app.post('/api/panels', (req, res) => {
  const panel = req.body;
  panel.id = Date.now();
  panel.createdAt = new Date().toISOString();
  panels.unshift(panel);
  res.json({ success: true, panel });
});

app.put('/api/panels/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const index = panels.findIndex(p => p.id === id);
  if (index === -1) return res.status(404).json({ success: false });
  panels[index] = { ...panels[index], ...req.body };
  res.json({ success: true, panel: panels[index] });
});

app.delete('/api/panels/:id', (req, res) => {
  const id = parseInt(req.params.id);
  panels = panels.filter(p => p.id !== id);
  res.json({ success: true });
});

app.patch('/api/panels/:id/toggle', (req, res) => {
  const id = parseInt(req.params.id);
  const index = panels.findIndex(p => p.id === id);
  if (index === -1) return res.status(404).json({ success: false });
  panels[index].status = panels[index].status === 'active' ? 'inactive' : 'active';
  res.json({ success: true, panel: panels[index] });
});

app.get('/api/panel/:slug', (req, res) => {
  const panel = panels.find(p => p.slug === req.params.slug);
  if (!panel) return res.status(404).json({ success: false });
  res.json({ success: true, panel });
});

// ============================================================
// ========== هوش مصنوعی (کاملاً آفلاین) ==========
// ============================================================

app.post('/api/ai/chat', async (req, res) => {
  const { message } = req.body;
  
  console.log('📨 پیام کاربر:', message);
  
  const result = executeCommand(message);
  
  aiHistory.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
  aiHistory.push({ role: 'assistant', content: result.message, timestamp: new Date().toISOString() });
  
  res.json({
    success: true,
    message: result.message,
    result: result
  });
});

// ============================================================
// ========== اجرای دستورات ==========
// ============================================================

function executeCommand(message) {
  if (!message || message.trim() === '') {
    return { type: 'help', message: '📝 لطفاً یک پیام بنویسید.' };
  }
  
  const lower = message.toLowerCase().trim();
  
  // ===== 1. DELETE ALL =====
  if (lower.includes('delete all') || lower.includes('حذف همه') || 
      lower.includes('remove all') || lower.includes('پاک کن همه') ||
      lower.includes('همه پنل') || lower.includes('all panels') ||
      lower.includes('همه کانفینگ') || lower.includes('همه کانفیگ') ||
      lower.includes('همشو پاک کن') || lower.includes('همشون')) {
    
    const count = panels.length;
    panels = [];
    return { type: 'delete_all', message: `✅ ${count} پنل با موفقیت حذف شدند` };
  }
  
  // ===== 2. DELETE SPECIFIC =====
  if (lower.includes('delete') || lower.includes('حذف') || 
      lower.includes('remove') || lower.includes('پاک کن') ||
      lower.includes('پاکش کن') || lower.includes('بردار') ||
      lower.includes('پاکش') || lower.includes('پاک') || lower.includes('بردارش')) {
    
    let panelName = null;
    
    // از نقل قول
    const quoteMatch = message.match(/["']([^"']*)["']/);
    if (quoteMatch && quoteMatch[1]) {
      panelName = quoteMatch[1].trim();
    }
    
    // از الگوی "حذف [اسم]"
    if (!panelName) {
      const patterns = [
        /(?:delete|حذف|remove|پاک\s+کن|بردار|پاک)\s+(?:panel|پنل|کانفینگ|کانفیگ)?\s*["']?([^\s,،.]+)["']?/i,
        /(?:پاکش|بردارش)\s+["']?([^\s,،.]+)["']?/i
      ];
      for (const pattern of patterns) {
        const match = message.match(pattern);
        if (match && match[1]) {
          panelName = match[1];
          break;
        }
      }
    }
    
    // حذف کاراکترهای اضافی
    if (panelName) {
      panelName = panelName.replace(/[.,،!?]/g, '').trim();
    }
    
    console.log('🔍 اسم پنل برای حذف:', panelName);
    
    if (panelName) {
      if (panels.length === 0) {
        return { type: 'error', message: '📭 هیچ پنلی برای حذف وجود ندارد.' };
      }
      
      // پیدا کردن پنل
      let foundPanel = null;
      const searchName = panelName.toLowerCase();
      
      for (const p of panels) {
        if (!p || !p.name) continue;
        const pName = p.name.toLowerCase();
        if (pName === searchName || pName.includes(searchName) || searchName.includes(pName)) {
          foundPanel = p;
          break;
        }
      }
      
      if (foundPanel) {
        const name = foundPanel.name;
        panels = panels.filter(p => p.id !== foundPanel.id);
        return { type: 'delete_panel', message: `✅ پنل "${name}" با موفقیت حذف شد` };
      } else {
        return { type: 'error', message: `❌ پنل "${panelName}" یافت نشد.` };
      }
    }
  }
  
  // ===== 3. CREATE PANEL =====
  if (lower.includes('create') || lower.includes('ساخت') || 
      lower.includes('make') || lower.includes('بساز') || 
      lower.includes('جدید') || lower.includes('new') ||
      lower.includes('کانفینگ') || lower.includes('کانفیگ')) {
    
    let name = 'پنل جدید';
    
    // استخراج اسم
    const nameMatch = message.match(/["']([^"']*)["']/);
    if (nameMatch && nameMatch[1]) {
      name = nameMatch[1].trim();
    } else {
      const nameRegex = /(?:create|ساخت|make|بساز|کانفینگ|کانفیگ)\s+(?:panel|پنل)?\s*["']?([^\s,،]+)["']?/i;
      const nMatch = message.match(nameRegex);
      if (nMatch && nMatch[1]) {
        name = nMatch[1].trim();
      }
    }
    
    name = name.replace(/[.,،!?]/g, '').trim();
    if (!name || name.length < 1) name = 'پنل جدید';
    
    // استخراج روز
    let days = 30;
    const daysMatch = message.match(/(\d+)\s*(?:days?|روز)/i);
    if (daysMatch) days = parseInt(daysMatch[1]);
    
    // استخراج حجم
    let storage = 100;
    const storageMatch = message.match(/(\d+)\s*(?:GB|گیگ|gig)/i);
    if (storageMatch) storage = parseInt(storageMatch[1]);
    
    // استخراج کاربران
    let users = 10;
    const usersMatch = message.match(/(\d+)\s*(?:users?|کاربر)/i);
    if (usersMatch) users = parseInt(usersMatch[1]);
    
    // استخراج کشور
    let country = 'germany';
    const countryMap = {
      'آلمان': 'germany', 'germany': 'germany',
      'ترکیه': 'turkey', 'turkey': 'turkey',
      'هلند': 'netherlands', 'netherlands': 'netherlands',
      'دانمارک': 'denmark', 'denmark': 'denmark',
      'امارات': 'uae', 'uae': 'uae',
      'ایران': 'iran', 'iran': 'iran'
    };
    for (const [key, val] of Object.entries(countryMap)) {
      if (lower.includes(key)) {
        country = val;
        break;
      }
    }
    
    // ساخت اسلاگ
    const slug = generateSlug(name);
    const exists = panels.some(p => p.slug === slug);
    const finalSlug = exists ? slug + '-' + Date.now().toString().slice(-4) : slug;
    
    // کشور نام
    const countryNames = {
      'germany': 'آلمان',
      'turkey': 'ترکیه',
      'netherlands': 'هلند',
      'denmark': 'دانمارک',
      'uae': 'امارات',
      'iran': 'ایران'
    };
    
    const newPanel = {
      id: Date.now(),
      name: name,
      slug: finalSlug,
      days: days,
      remainingDays: days,
      storage: storage,
      usedStorage: 0,
      users: users,
      countries: [country],
      dns: ['10.202.10.10', '114.114.114.114'],
      dnsService: 'radar',
      dnsServiceName: 'رادار',
      countryName: countryNames[country] || 'آلمان',
      status: 'active',
      panelSettings: { color: 'blue', mode: 'light', showDns: true, showFlags: true, compact: false }
    };
    
    panels.unshift(newPanel);
    return { 
      type: 'create_panel', 
      message: `✅ پنل "${name}" با ${days} روز، ${storage} گیگ و ${users} کاربر ساخته شد`,
      panel: newPanel
    };
  }
  
  // ===== 4. LIST PANELS =====
  if (lower.includes('list') || lower.includes('نمایش') || 
      lower.includes('show') || lower.includes('لیست') ||
      lower.includes('پنل‌ها') || lower.includes('کانفینگ‌ها') ||
      lower.includes('چند تا پنل') || lower.includes('پنل هارو')) {
    
    if (panels.length === 0) {
      return { type: 'list', message: '📭 هیچ پنلی وجود ندارد.' };
    }
    
    let list = '📋 لیست پنل‌ها:\n';
    panels.forEach((p, i) => {
      const status = p.status === 'active' ? '✅ فعال' : '❌ غیرفعال';
      list += `${i+1}. 📡 ${p.name} | ${status} | ${p.remainingDays} روز | ${p.storage}GB | ${p.users} کاربر\n`;
    });
    
    return { type: 'list', message: list };
  }
  
  // ===== 5. CHANGE THEME =====
  if (lower.includes('theme') || lower.includes('تم') || 
      lower.includes('color') || lower.includes('رنگ')) {
    
    const color = extractColor(lower);
    if (color) {
      panels.forEach(p => {
        if (!p.panelSettings) p.panelSettings = {};
        p.panelSettings.color = color;
      });
      return { type: 'theme', message: `✅ تم همه پنل‌ها به "${color}" تغییر کرد` };
    } else {
      return { type: 'error', message: '❌ رنگ مورد نظر پیدا نشد. رنگ‌های موجود: آبی، بنفش، سبز، صورتی، قهوه‌ای، قرمز، نارنجی، فیروزه‌ای' };
    }
  }
  
  // ===== 6. CHANGE MODE =====
  if (lower.includes('dark') || lower.includes('تاریک') || 
      lower.includes('light') || lower.includes('روشن')) {
    
    const mode = (lower.includes('dark') || lower.includes('تاریک')) ? 'dark' : 'light';
    panels.forEach(p => {
      if (!p.panelSettings) p.panelSettings = {};
      p.panelSettings.mode = mode;
    });
    const modeName = mode === 'dark' ? 'تاریک' : 'روشن';
    return { type: 'mode', message: `✅ حالت همه پنل‌ها به "${modeName}" تغییر کرد` };
  }
  
  // ===== 7. HELP =====
  return {
    type: 'help',
    message: `🤖 من یک دستیار هوشمند هستم. می‌توانید این کارها را انجام دهید:

📌 ساخت پنل:
   "ساخت پنل [اسم] با [تعداد] روز و [تعداد] گیگ و [تعداد] کاربر"
   مثال: "ساخت پنل آلمان با 30 روز و 100 گیگ و 10 کاربر"

🗑️ حذف پنل:
   "حذف پنل [اسم]" یا "پاک کن پنل [اسم]"
   مثال: "حذف پنل آلمان"

🧹 حذف همه:
   "حذف همه پنل‌ها" یا "پاک کن همه"

📋 لیست پنل‌ها:
   "لیست پنل‌ها" یا "نمایش پنل‌ها"

🎨 تغییر تم:
   "تم قهوه‌ای" یا "رنگ بنفش"
   رنگ‌های موجود: آبی، بنفش، سبز، صورتی، قهوه‌ای، قرمز، نارنجی، فیروزه‌ای

🌓 تغییر حالت:
   "حالت تاریک" یا "حالت روشن"

💡 هر سوالی دارید بپرسید!`
  };
}

// ============================================================
// ========== توابع کمکی ==========
// ============================================================

function extractColor(text) {
  if (!text) return null;
  
  const colors = {
    'blue': ['blue', 'آبی'],
    'purple': ['purple', 'بنفش'],
    'green': ['green', 'سبز'],
    'rose': ['rose', 'صورتی', 'pink'],
    'brown': ['brown', 'قهوه ای', 'قهوه‌ای'],
    'red': ['red', 'قرمز'],
    'orange': ['orange', 'نارنجی'],
    'teal': ['teal', 'فیروزه ای', 'فیروزه‌ای']
  };
  
  for (const [color, keywords] of Object.entries(colors)) {
    for (const kw of keywords) {
      if (text.includes(kw)) {
        return color;
      }
    }
  }
  return null;
}

function generateSlug(name) {
  if (!name) return 'panel-' + Date.now();
  return name.toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ========== HISTORY ==========
app.get('/api/ai/history', (req, res) => res.json(aiHistory));
app.delete('/api/ai/history', (req, res) => { aiHistory = []; res.json({ success: true }); });

// ========== SERVE PANEL ==========
app.get('/:slug', (req, res) => {
  const slug = req.params.slug;
  const reserved = ['dashboard', 'settings', 'ai', 'api', 'login', 'favicon.ico'];
  if (reserved.includes(slug)) return res.redirect('/' + slug);
  
  const panel = panels.find(p => p.slug === slug);
  if (!panel) return res.send('پنل یافت نشد');
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><title>${panel.name}</title>
    <style>
      body { font-family: sans-serif; padding: 40px; background: #f0f4f8; }
      .box { max-width: 500px; margin: auto; background: white; padding: 30px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
      h1 { color: #2563eb; }
      .info { margin: 10px 0; padding: 8px; background: #f8fafc; border-radius: 8px; }
      .label { font-weight: bold; color: #64748b; }
    </style>
    </head>
    <body>
      <div class="box">
        <h1>📡 ${panel.name}</h1>
        <div class="info"><span class="label">🌍 کشور:</span> ${panel.countryName || 'N/A'}</div>
        <div class="info"><span class="label">📅 روز باقی‌مانده:</span> ${panel.remainingDays} روز</div>
        <div class="info"><span class="label">💾 حجم:</span> ${panel.usedStorage || 0} / ${panel.storage} GB</div>
        <div class="info"><span class="label">👥 کاربران:</span> ${panel.users}</div>
        <div class="info"><span class="label">📊 وضعیت:</span> ${panel.status === 'active' ? '✅ فعال' : '❌ غیرفعال'}</div>
        <div class="info"><span class="label">🔗 لینک:</span> /${panel.slug}</div>
      </div>
    </body>
    </html>
  `);
});

// ========== START ==========
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Login: http://localhost:${PORT}`);
});
