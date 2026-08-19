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
// ========== هوش مصنوعی با اجرای مستقیم ==========
// ============================================================

app.post('/api/ai/chat', async (req, res) => {
  const { message } = req.body;
  
  console.log('📨 پیام کاربر:', message);
  
  // ===== اول ببینیم خودمون می‌تونیم دستور رو اجرا کنیم =====
  const directResult = await executeDirectCommand(message);
  
  if (directResult.executed) {
    console.log('✅ اجرای مستقیم:', directResult.message);
    
    // ذخیره تاریخچه
    aiHistory.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
    aiHistory.push({ role: 'assistant', content: directResult.message, timestamp: new Date().toISOString() });
    
    return res.json({
      success: true,
      message: directResult.message,
      result: directResult,
      direct: true
    });
  }
  
  // ===== اگر خودمون نتونستیم، از API استفاده کن =====
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL || 'https://api.vivgrid.com/v1';
  const model = process.env.AI_MODEL || 'deepseek-chat';
  
  if (!apiKey) {
    return res.json({ success: false, message: '❌ API Key تنظیم نشده و دستور قابل تشخیص نبود' });
  }

  try {
    const panelsInfo = panels.map(p => ({
      name: p.name,
      days: p.remainingDays,
      storage: p.storage,
      users: p.users,
      status: p.status
    }));

    const systemPrompt = `You are an AI assistant for DNS panel.
Current panels: ${panelsInfo.length > 0 ? JSON.stringify(panelsInfo) : 'None'}

When user says:
- "delete [name]" → return: DELETE_PANEL:[name]
- "delete all" → return: DELETE_ALL
- "create [name] with [X] days, [Y] GB, [Z] users" → return: CREATE_PANEL:[name]:[X]:[Y]:[Z]
- "change theme to [color]" → return: CHANGE_THEME:[color]
- "list panels" → return: LIST_PANELS

ONLY return the command format, nothing else.`;

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        temperature: 0.1,
        max_tokens: 100
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      return res.json({ success: false, message: '❌ خطا در API' });
    }
    
    const reply = data.choices[0].message.content;
    console.log('🤖 پاسخ API:', reply);
    
    // ===== اجرای دستور از روی پاسخ API =====
    const apiResult = await executeCommandFromReply(reply);
    
    aiHistory.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
    aiHistory.push({ role: 'assistant', content: apiResult.message || reply, timestamp: new Date().toISOString() });
    
    res.json({
      success: true,
      message: apiResult.message || reply,
      result: apiResult
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
    res.json({ success: false, message: `❌ خطا: ${error.message}` });
  }
});

// ============================================================
// ========== اجرای مستقیم دستورات ==========
// ============================================================

async function executeDirectCommand(message) {
  const lower = message.toLowerCase();
  const result = { executed: false, message: '' };
  
  console.log('🔍 بررسی دستور:', message);
  
  // ===== 1. DELETE ALL =====
  if (lower.includes('delete all') || lower.includes('حذف همه') || 
      lower.includes('remove all') || lower.includes('پاک کن همه') ||
      lower.includes('همه پنل') || lower.includes('all panels') ||
      lower.includes('همه کانفینگ') || lower.includes('همه کانفیگ')) {
    
    const count = panels.length;
    panels = [];
    result.executed = true;
    result.message = `✅ ${count} پنل با موفقیت حذف شدند`;
    result.type = 'delete_all';
    return result;
  }
  
  // ===== 2. DELETE SPECIFIC =====
  if (lower.includes('delete') || lower.includes('حذف') || 
      lower.includes('remove') || lower.includes('پاک کن') ||
      lower.includes('پاکش کن') || lower.includes('بردار')) {
    
    // استخراج اسم پنل
    let panelName = null;
    
    // از نقل قول
    const quoteMatch = message.match(/["']([^"']*)["']/);
    if (quoteMatch) panelName = quoteMatch[1];
    
    // از کلمه بعد از delete/حذف
    if (!panelName) {
      const regex = /(?:delete|حذف|remove|پاک\s+کن|بردار)\s+(?:panel|پنل|کانفینگ|کانفیگ)?\s*["']?([^\s,،.]+)["']?/i;
      const match = message.match(regex);
      if (match) panelName = match[1];
    }
    
    // اگر بازم پیدا نشد، آخرین کلمه رو بگیر
    if (!panelName) {
      const words = message.split(/\s+/);
      panelName = words[words.length - 1];
    }
    
    console.log('🔍 اسم پنل برای حذف:', panelName);
    
    if (panelName) {
      // پیدا کردن پنل
      const panel = panels.find(p => 
        p.name.toLowerCase() === panelName.toLowerCase() ||
        p.slug.toLowerCase() === panelName.toLowerCase() ||
        p.name.toLowerCase().includes(panelName.toLowerCase()) ||
        p.slug.toLowerCase().includes(panelName.toLowerCase())
      );
      
      if (panel) {
        const name = panel.name;
        panels = panels.filter(p => p.id !== panel.id);
        result.executed = true;
        result.message = `✅ پنل "${name}" با موفقیت حذف شد`;
        result.type = 'delete_panel';
        result.panelName = name;
        return result;
      } else {
        result.executed = true;
        result.message = `❌ پنل "${panelName}" یافت نشد`;
        result.type = 'error';
        return result;
      }
    }
  }
  
  // ===== 3. CREATE PANEL =====
  if (lower.includes('create') || lower.includes('ساخت') || 
      lower.includes('make') || lower.includes('بساز') || 
      lower.includes('جدید') || lower.includes('new') ||
      lower.includes('کانفینگ') || lower.includes('کانفیگ')) {
    
    // استخراج اسم
    let name = 'پنل جدید';
    const nameMatch = message.match(/["']([^"']*)["']/);
    if (nameMatch) name = nameMatch[1];
    
    if (!nameMatch) {
      const nameRegex = /(?:create|ساخت|make|بساز|کانفینگ|کانفیگ)\s+(?:panel|پنل)?\s*["']?([^\s,،]+)["']?/i;
      const nMatch = message.match(nameRegex);
      if (nMatch) name = nMatch[1];
    }
    
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
    
    // کشور
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
    
    console.log('📦 ساخت پنل:', { name, days, storage, users, country });
    
    // ساخت پنل
    const slug = generateSlug(name);
    const exists = panels.some(p => p.slug === slug);
    const finalSlug = exists ? slug + '-' + Date.now().toString().slice(-4) : slug;
    
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
      countryName: getCountryName(country),
      status: 'active',
      panelSettings: { color: 'blue', mode: 'light', showDns: true, showFlags: true, compact: false }
    };
    
    panels.unshift(newPanel);
    result.executed = true;
    result.message = `✅ پنل "${name}" با ${days} روز، ${storage} گیگ و ${users} کاربر ساخته شد`;
    result.type = 'create_panel';
    result.panel = newPanel;
    return result;
  }
  
  // ===== 4. LIST PANELS =====
  if (lower.includes('list') || lower.includes('نمایش') || 
      lower.includes('show') || lower.includes('لیست') ||
      lower.includes('پنل‌ها') || lower.includes('کانفینگ‌ها')) {
    
    if (panels.length === 0) {
      result.message = '📭 هیچ پنلی وجود ندارد';
    } else {
      const list = panels.map((p, i) => 
        `${i+1}. 📡 ${p.name} | ${p.status === 'active' ? '✅' : '❌'} | ${p.remainingDays} روز | ${p.storage}GB | ${p.users} کاربر`
      ).join('\n');
      result.message = `📋 پنل‌های موجود:\n${list}`;
    }
    result.executed = true;
    result.type = 'list_panels';
    return result;
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
      result.executed = true;
      result.message = `✅ تم همه پنل‌ها به ${color} تغییر کرد`;
      result.type = 'change_theme';
      return result;
    }
  }
  
  // ===== 6. CHANGE MODE =====
  if (lower.includes('dark') || lower.includes('تاریک') || 
      lower.includes('light') || lower.includes('روشن')) {
    
    const mode = lower.includes('dark') || lower.includes('تاریک') ? 'dark' : 'light';
    panels.forEach(p => {
      if (!p.panelSettings) p.panelSettings = {};
      p.panelSettings.mode = mode;
    });
    result.executed = true;
    result.message = `✅ حالت همه پنل‌ها به ${mode === 'dark' ? 'تاریک' : 'روشن'} تغییر کرد`;
    result.type = 'change_mode';
    return result;
  }
  
  return result;
}

// ============================================================
// ========== اجرا از روی پاسخ API ==========
// ============================================================

async function executeCommandFromReply(reply) {
  const result = { executed: false, message: '' };
  
  // DELETE_ALL
  if (reply.includes('DELETE_ALL')) {
    const count = panels.length;
    panels = [];
    result.executed = true;
    result.message = `✅ ${count} پنل با موفقیت حذف شدند`;
    return result;
  }
  
  // DELETE_PANEL:[name]
  const deleteMatch = reply.match(/DELETE_PANEL:([^:]+)/);
  if (deleteMatch) {
    const name = deleteMatch[1].trim();
    const panel = panels.find(p => 
      p.name.toLowerCase() === name.toLowerCase() ||
      p.slug.toLowerCase() === name.toLowerCase()
    );
    if (panel) {
      panels = panels.filter(p => p.id !== panel.id);
      result.executed = true;
      result.message = `✅ پنل "${panel.name}" با موفقیت حذف شد`;
    } else {
      result.executed = true;
      result.message = `❌ پنل "${name}" یافت نشد`;
    }
    return result;
  }
  
  // CREATE_PANEL:[name]:[days]:[storage]:[users]
  const createMatch = reply.match(/CREATE_PANEL:([^:]+):(\d+):(\d+):(\d+)/);
  if (createMatch) {
    const name = createMatch[1].trim();
    const days = parseInt(createMatch[2]);
    const storage = parseInt(createMatch[3]);
    const users = parseInt(createMatch[4]);
    
    const slug = generateSlug(name);
    const exists = panels.some(p => p.slug === slug);
    const finalSlug = exists ? slug + '-' + Date.now().toString().slice(-4) : slug;
    
    const newPanel = {
      id: Date.now(),
      name: name,
      slug: finalSlug,
      days: days,
      remainingDays: days,
      storage: storage,
      usedStorage: 0,
      users: users,
      countries: ['germany'],
      dns: ['10.202.10.10', '114.114.114.114'],
      dnsService: 'radar',
      dnsServiceName: 'رادار',
      countryName: 'آلمان',
      status: 'active',
      panelSettings: { color: 'blue', mode: 'light', showDns: true, showFlags: true, compact: false }
    };
    
    panels.unshift(newPanel);
    result.executed = true;
    result.message = `✅ پنل "${name}" با ${days} روز، ${storage} گیگ و ${users} کاربر ساخته شد`;
    return result;
  }
  
  // LIST_PANELS
  if (reply.includes('LIST_PANELS')) {
    if (panels.length === 0) {
      result.message = '📭 هیچ پنلی وجود ندارد';
    } else {
      const list = panels.map((p, i) => 
        `${i+1}. 📡 ${p.name} (${p.status === 'active' ? '✅' : '❌'} ${p.remainingDays} روز)`
      ).join('\n');
      result.message = `📋 پنل‌های موجود:\n${list}`;
    }
    result.executed = true;
    return result;
  }
  
  // CHANGE_THEME:[color]
  const themeMatch = reply.match(/CHANGE_THEME:([^:]+)/);
  if (themeMatch) {
    const color = themeMatch[1].trim();
    panels.forEach(p => {
      if (!p.panelSettings) p.panelSettings = {};
      p.panelSettings.color = color;
    });
    result.executed = true;
    result.message = `✅ تم همه پنل‌ها به ${color} تغییر کرد`;
    return result;
  }
  
  result.message = '💡 دستور انجام شد';
  return result;
}

// ============================================================
// ========== توابع کمکی ==========
// ============================================================

function getCountryName(key) {
  const names = {
    'germany': 'آلمان',
    'turkey': 'ترکیه',
    'netherlands': 'هلند',
    'denmark': 'دانمارک',
    'uae': 'امارات',
    'iran': 'ایران'
  };
  return names[key] || key;
}

function extractColor(text) {
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
      .box { max-width: 500px; margin: auto; background: white; padding: 30px; border-radius: 16px; }
      h1 { color: #2563eb; }
      .info { margin: 10px 0; padding: 8px; background: #f8fafc; border-radius: 8px; }
      .label { font-weight: bold; color: #64748b; }
    </style>
    </head>
    <body>
      <div class="box">
        <h1>📡 ${panel.name}</h1>
        <div class="info"><span class="label">🌍 کشور:</span> ${panel.countryName || 'N/A'}</div>
        <div class="info"><span class="label">📅 روز:</span> ${panel.remainingDays} روز</div>
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
