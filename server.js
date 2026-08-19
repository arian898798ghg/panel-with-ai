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
// ========== هوش مصنوعی فوق‌هوشمند ==========
// ============================================================

app.post('/api/ai/chat', async (req, res) => {
  const { message } = req.body;
  
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL || 'https://api.vivgrid.com/v1';
  const model = process.env.AI_MODEL || 'deepseek-chat';
  
  if (!apiKey) {
    return res.json({ success: false, message: '❌ API Key تنظیم نشده' });
  }

  try {
    // ===== اطلاعات کامل پنل‌ها =====
    const panelsInfo = panels.map(p => ({
      name: p.name,
      slug: p.slug,
      days: p.remainingDays,
      storage: p.storage,
      used: p.usedStorage || 0,
      users: p.users,
      country: p.countryName || 'N/A',
      status: p.status,
      id: p.id
    }));

    // ===== سیستم پرامپت هوشمند =====
    const systemPrompt = `You are an ALL-POWERFUL AI that controls a DNS panel system.

CURRENT PANELS (${panels.length}):
${panelsInfo.length > 0 ? JSON.stringify(panelsInfo, null, 2) : '⚠️ NO PANELS YET'}

🔮 YOUR POWERS - YOU CAN DO ANYTHING:

1️⃣ CREATE PANELS:
   - When user says "create", "make", "build", "ساخت", "بساز"
   - Extract: name, days, storage (GB), users, country
   - Defaults: name="پنل جدید", days=30, storage=100, users=10, country="germany"

2️⃣ DELETE PANELS:
   - When user says "delete", "remove", "حذف", "پاک کن"
   - Find panel by name or slug
   - If "all" or "همه" → delete ALL panels

3️⃣ EDIT PANELS:
   - Storage: "change storage", "حجم", "کم کن", "زیاد کن"
   - Days: "add days", "تمدید", "افزایش روز"
   - Users: "change users", "کاربر"
   - Name: "rename", "تغییر اسم"
   - Status: "activate", "فعال", "deactivate", "غیرفعال"
   - Theme: "theme", "تم", "color", "رنگ"

4️⃣ VIEW PANELS:
   - "show", "list", "نمایش", "لیست"
   - "details", "جزئیات"

5️⃣ SMART RESPONSES:
   - If user asks about DNS → suggest best DNS
   - If user asks about gaming → recommend gaming DNS
   - If user asks about bypass → recommend bypass DNS

🚨 RULES:
- You HAVE to actually DO what user asks
- Don't just talk - EXECUTE the action
- If user says "delete", DELETE it
- If user says "create", CREATE it
- Always confirm with a clear message
- Be friendly and helpful

EXAMPLE RESPONSES:
- User: "پنل آلمان رو حذف کن" → Delete panel "آلمان" → "✅ پنل آلمان حذف شد"
- User: "ساخت پنل جدید با 50 روز و 200 گیگ" → Create panel → "✅ پنل جدید با 50 روز و 200 گیگ ساخته شد"
- User: "همه پنل‌ها رو پاک کن" → Delete all → "✅ همه ${count} پنل حذف شدند"
- User: "تم رو قهوه‌ای کن" → Change theme → "✅ تم به قهوه‌ای تغییر کرد"

ALWAYS respond in the SAME language as the user.`;

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
        temperature: 0.2,
        max_tokens: 500
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('AI API Error:', data);
      return res.json({ 
        success: false, 
        message: `❌ خطا: ${data.error?.message || 'Unknown'}`
      });
    }
    
    const reply = data.choices[0].message.content;
    console.log('🤖 AI Reply:', reply);
    
    // ===== هوشمندانه تشخیص و اجرای دستور =====
    const result = await smartExecute(reply, message);
    
    // ذخیره تاریخچه
    aiHistory.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
    aiHistory.push({ role: 'assistant', content: reply, timestamp: new Date().toISOString() });
    
    res.json({ 
      success: true, 
      message: reply,
      result: result
    });
    
  } catch (error) {
    console.error('❌ AI Error:', error);
    res.json({ 
      success: false, 
      message: `❌ خطا: ${error.message}`
    });
  }
});

// ========== اجرای هوشمند دستورات ==========
async function smartExecute(reply, originalMessage) {
  const lower = (reply + ' ' + originalMessage).toLowerCase();
  const result = { executed: false, message: '' };
  
  try {
    // ===== 1. DELETE ALL PANELS =====
    if (lower.includes('delete all') || lower.includes('حذف همه') || 
        lower.includes('remove all') || lower.includes('پاک کن همه') ||
        lower.includes('همه پنل') || lower.includes('all panels')) {
      
      const count = panels.length;
      panels = [];
      result.executed = true;
      result.message = `✅ ${count} پنل با موفقیت حذف شدند`;
      return result;
    }
    
    // ===== 2. DELETE SPECIFIC PANEL =====
    if (lower.includes('delete') || lower.includes('حذف') || 
        lower.includes('remove') || lower.includes('پاک کن')) {
      
      // پیدا کردن اسم پنل
      let panelName = extractName(reply) || extractName(originalMessage);
      
      if (!panelName) {
        // بررسی کلمه بعد از delete/حذف
        const regex = /(?:delete|حذف|remove|پاک\s+کن)\s+(?:panel|پنل)?\s*([^\s,،.]+)/i;
        const match = (reply + ' ' + originalMessage).match(regex);
        if (match) panelName = match[1];
      }
      
      if (panelName) {
        const panel = findPanel(panelName);
        if (panel) {
          const name = panel.name;
          panels = panels.filter(p => p.id !== panel.id);
          result.executed = true;
          result.message = `✅ پنل "${name}" با موفقیت حذف شد`;
          return result;
        } else {
          result.message = `❌ پنل "${panelName}" یافت نشد`;
          return result;
        }
      }
    }
    
    // ===== 3. CREATE PANEL =====
    if (lower.includes('create') || lower.includes('ساخت') || 
        lower.includes('make') || lower.includes('بساز') || 
        lower.includes('جدید') || lower.includes('new')) {
      
      // استخراج اطلاعات
      const name = extractName(reply) || extractName(originalMessage) || 'پنل جدید';
      const days = extractNumber(reply, ['day', 'روز']) || 30;
      const storage = extractNumber(reply, ['gb', 'گیگ', 'gig']) || 100;
      const users = extractNumber(reply, ['user', 'کاربر']) || 10;
      const country = extractCountry(reply + ' ' + originalMessage) || 'germany';
      
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
      return result;
    }
    
    // ===== 4. CHANGE THEME =====
    if (lower.includes('theme') || lower.includes('تم') || 
        lower.includes('color') || lower.includes('رنگ')) {
      
      const color = extractColor(lower);
      if (color) {
        // تغییر تم همه پنل‌ها یا پنل خاص
        const panelName = extractName(reply) || extractName(originalMessage);
        if (panelName) {
          const panel = findPanel(panelName);
          if (panel) {
            if (!panel.panelSettings) panel.panelSettings = {};
            panel.panelSettings.color = color;
            result.executed = true;
            result.message = `✅ تم پنل "${panel.name}" به ${color} تغییر کرد`;
            return result;
          }
        } else {
          // تغییر تم همه پنل‌ها
          panels.forEach(p => {
            if (!p.panelSettings) p.panelSettings = {};
            p.panelSettings.color = color;
          });
          result.executed = true;
          result.message = `✅ تم همه پنل‌ها به ${color} تغییر کرد`;
          return result;
        }
      }
    }
    
    // ===== 5. CHANGE MODE =====
    if (lower.includes('dark') || lower.includes('تاریک') || 
        lower.includes('light') || lower.includes('روشن')) {
      
      const mode = lower.includes('dark') || lower.includes('تاریک') ? 'dark' : 'light';
      const panelName = extractName(reply) || extractName(originalMessage);
      
      if (panelName) {
        const panel = findPanel(panelName);
        if (panel) {
          if (!panel.panelSettings) panel.panelSettings = {};
          panel.panelSettings.mode = mode;
          result.executed = true;
          result.message = `✅ حالت پنل "${panel.name}" به ${mode === 'dark' ? 'تاریک' : 'روشن'} تغییر کرد`;
          return result;
        }
      } else {
        panels.forEach(p => {
          if (!p.panelSettings) p.panelSettings = {};
          p.panelSettings.mode = mode;
        });
        result.executed = true;
        result.message = `✅ حالت همه پنل‌ها به ${mode === 'dark' ? 'تاریک' : 'روشن'} تغییر کرد`;
        return result;
      }
    }
    
    // ===== 6. CHANGE STORAGE =====
    if (lower.includes('storage') || lower.includes('حجم')) {
      const panelName = extractName(reply) || extractName(originalMessage);
      const amount = extractNumber(reply + ' ' + originalMessage, ['gb', 'گیگ']);
      
      if (panelName && amount) {
        const panel = findPanel(panelName);
        if (panel) {
          // تشخیص کم یا زیاد
          if (lower.includes('کم') || lower.includes('reduce') || lower.includes('minus')) {
            panel.storage = Math.max(0, panel.storage - amount);
          } else if (lower.includes('زیاد') || lower.includes('increase') || lower.includes('plus') || lower.includes('add')) {
            panel.storage = panel.storage + amount;
          } else {
            panel.storage = amount;
          }
          result.executed = true;
          result.message = `✅ حجم پنل "${panel.name}" به ${panel.storage} گیگ تغییر کرد`;
          return result;
        }
      }
    }
    
    // ===== 7. ADD DAYS =====
    if (lower.includes('day') || lower.includes('روز') || 
        lower.includes('تمدید') || lower.includes('extend')) {
      
      const panelName = extractName(reply) || extractName(originalMessage);
      const days = extractNumber(reply + ' ' + originalMessage, ['day', 'روز']);
      
      if (panelName && days) {
        const panel = findPanel(panelName);
        if (panel) {
          panel.remainingDays = (panel.remainingDays || 0) + days;
          panel.days = (panel.days || 0) + days;
          result.executed = true;
          result.message = `✅ ${days} روز به پنل "${panel.name}" اضافه شد`;
          return result;
        }
      }
    }
    
    // ===== 8. TOGGLE STATUS =====
    if (lower.includes('activate') || lower.includes('فعال') || 
        lower.includes('enable') || lower.includes('روشن')) {
      
      const panelName = extractName(reply) || extractName(originalMessage);
      if (panelName) {
        const panel = findPanel(panelName);
        if (panel) {
          panel.status = 'active';
          result.executed = true;
          result.message = `✅ پنل "${panel.name}" فعال شد`;
          return result;
        }
      }
    }
    
    if (lower.includes('deactivate') || lower.includes('غیرفعال') || 
        lower.includes('disable') || lower.includes('خاموش')) {
      
      const panelName = extractName(reply) || extractName(originalMessage);
      if (panelName) {
        const panel = findPanel(panelName);
        if (panel) {
          panel.status = 'inactive';
          result.executed = true;
          result.message = `✅ پنل "${panel.name}" غیرفعال شد`;
          return result;
        }
      }
    }
    
    // ===== 9. LIST PANELS =====
    if (lower.includes('list') || lower.includes('نمایش') || 
        lower.includes('show') || lower.includes('لیست')) {
      
      if (panels.length === 0) {
        result.message = '📭 هیچ پنلی وجود ندارد';
      } else {
        const names = panels.map(p => `📡 ${p.name} (${p.status === 'active' ? '✅' : '❌'} ${p.remainingDays} روز)`).join('\n');
        result.message = `📋 پنل‌های موجود:\n${names}`;
      }
      result.executed = true;
      return result;
    }
    
    // ===== 10. اگر هیچ کاری انجام نشد =====
    result.message = '💡 دستور شما انجام شد. اگر نیاز به کاری دارید، بفرمایید.';
    return result;
    
  } catch (error) {
    console.error('❌ Execute error:', error);
    result.message = `❌ خطا: ${error.message}`;
    return result;
  }
}

// ========== توابع کمکی ==========

function findPanel(name) {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  
  return panels.find(p => 
    p.name.toLowerCase() === n ||
    p.slug.toLowerCase() === n ||
    p.name.toLowerCase().includes(n) ||
    p.slug.toLowerCase().includes(n)
  );
}

function extractName(text) {
  if (!text) return null;
  
  // از نقل قول
  const quoteMatch = text.match(/["']([^"']*)["']/);
  if (quoteMatch) return quoteMatch[1];
  
  // کلمات کلیدی
  const patterns = [
    /(?:panel|پنل)\s+["']([^"']*)["']/i,
    /(?:panel|پنل)\s+([^\s,،.]+)/i,
    /(?:name|اسم)\s+["']([^"']*)["']/i,
    /(?:برای|of)\s+["']([^"']*)["']/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  
  return null;
}

function extractNumber(text, keywords) {
  if (!text) return null;
  
  for (const kw of keywords) {
    const regex = new RegExp(`(\\d+)\\s*${kw}`, 'i');
    const match = text.match(regex);
    if (match) return parseInt(match[1]);
  }
  
  const simpleMatch = text.match(/(\d+)/);
  if (simpleMatch) return parseInt(simpleMatch[1]);
  
  return null;
}

function extractCountry(text) {
  const countries = {
    'آلمان': 'germany', 'germany': 'germany',
    'ترکیه': 'turkey', 'turkey': 'turkey',
    'هلند': 'netherlands', 'netherlands': 'netherlands',
    'دانمارک': 'denmark', 'denmark': 'denmark',
    'امارات': 'uae', 'uae': 'uae',
    'ایران': 'iran', 'iran': 'iran'
  };
  
  for (const [key, val] of Object.entries(countries)) {
    if (text.toLowerCase().includes(key.toLowerCase())) {
      return val;
    }
  }
  return null;
}

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
