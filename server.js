const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

// ========== تعریف app ==========
const app = express();
const PORT = process.env.PORT || 3000;

// ========== Middleware ==========
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ========== STORAGE ==========
let panels = [];
let aiHistory = [];

// ========== ROUTES ==========

// Serve pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/settings', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});

app.get('/ai', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'ai.html'));
});

// ========== API ==========

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    res.json({ success: true, message: 'Login successful' });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

// Get all panels
app.get('/api/panels', (req, res) => {
  res.json(panels);
});

// Create panel
app.post('/api/panels', (req, res) => {
  const panel = req.body;
  panel.id = Date.now();
  panel.createdAt = new Date().toISOString();
  panels.unshift(panel);
  res.json({ success: true, panel });
});

// Update panel
app.put('/api/panels/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const index = panels.findIndex(p => p.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Panel not found' });
  }
  panels[index] = { ...panels[index], ...req.body };
  res.json({ success: true, panel: panels[index] });
});

// Delete panel
app.delete('/api/panels/:id', (req, res) => {
  const id = parseInt(req.params.id);
  panels = panels.filter(p => p.id !== id);
  res.json({ success: true });
});

// Toggle panel status
app.patch('/api/panels/:id/toggle', (req, res) => {
  const id = parseInt(req.params.id);
  const index = panels.findIndex(p => p.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Panel not found' });
  }
  panels[index].status = panels[index].status === 'active' ? 'inactive' : 'active';
  res.json({ success: true, panel: panels[index] });
});

// Get panel by slug
app.get('/api/panel/:slug', (req, res) => {
  const slug = req.params.slug;
  const panel = panels.find(p => p.slug === slug);
  if (!panel) {
    return res.status(404).json({ success: false, message: 'Panel not found' });
  }
  res.json({ success: true, panel });
});

// ============================================================
// ========== هوش مصنوعی نهایی (بدون باگ) ==========
// ============================================================

// لیست رنگ‌های موجود
const AVAILABLE_COLORS = {
  'blue': ['blue', 'آبی'],
  'purple': ['purple', 'بنفش'],
  'green': ['green', 'سبز'],
  'rose': ['rose', 'صورتی', 'pink'],
  'brown': ['brown', 'قهوه ای', 'قهوه‌ای'],
  'red': ['red', 'قرمز'],
  'orange': ['orange', 'نارنجی'],
  'teal': ['teal', 'فیروزه ای', 'فیروزه‌ای']
};

app.post('/api/ai/chat', async (req, res) => {
  const { message } = req.body;
  
  console.log('📨 پیام کاربر:', message);
  
  // گرفتن از متغیرهای محیطی
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL || 'https://api.vivgrid.com/v1';
  const model = process.env.AI_MODEL || 'deepseek-chat';
  
  if (!apiKey) {
    return res.json({ 
      success: false, 
      message: '❌ API Key تنظیم نشده است. لطفاً AI_API_KEY را در .env تنظیم کنید.' 
    });
  }

  try {
    // ===== اطلاعات کامل پنل‌ها برای AI =====
    const panelsInfo = panels.map(p => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      days: p.remainingDays,
      storage: p.storage,
      usedStorage: p.usedStorage || 0,
      users: p.users,
      country: p.countryName || 'N/A',
      status: p.status,
      color: p.panelSettings?.color || 'blue',
      mode: p.panelSettings?.mode || 'light'
    }));

    console.log(`📋 تعداد پنل‌ها: ${panels.length}`);

    // ===== سیستم پرامپت =====
    const systemPrompt = `You are a SUPER AI with FULL CONTROL over a DNS management panel.

📋 CURRENT PANELS (${panels.length} panels):
${panelsInfo.length > 0 ? JSON.stringify(panelsInfo, null, 2) : '⚠️ No panels exist yet.'}

🎨 AVAILABLE COLORS (only these exist):
- blue (آبی)
- purple (بنفش)
- green (سبز)
- rose (صورتی)
- brown (قهوه‌ای)
- red (قرمز)
- orange (نارنجی)
- teal (فیروزه‌ای)

🔧 YOUR POWERS:

1️⃣ CREATE PANEL:
   - When user asks to create a panel
   - Extract: name, days, storage (GB), users
   - Defaults: name="Panel", days=30, storage=100, users=10

2️⃣ DELETE PANEL:
   - When user says "delete", "remove", "حذف", "پاک کن"
   - Find panel by name

3️⃣ DELETE ALL:
   - When user says "delete all", "حذف همه"

4️⃣ CHANGE THEME:
   - When user asks to change theme/color
   - ONLY use colors from AVAILABLE COLORS list
   - If user asks for a color that doesn't exist, say it doesn't exist and list available colors

5️⃣ CHANGE MODE:
   - When user says "dark", "تاریک" → change to dark
   - When user says "light", "روشن" → change to light

6️⃣ LIST PANELS:
   - When user asks to list/show panels

7️⃣ CHANGE STORAGE:
   - When user asks to change storage

8️⃣ ADD DAYS:
   - When user says "add days", "تمدید", "extend"

🚨 CRITICAL RULES:
- NEVER show ACTION: commands in your response
- Your response should ONLY be a friendly, human-like message
- If user asks for a color not in AVAILABLE COLORS, tell them it doesn't exist and list the available colors
- Be helpful and friendly
- ALWAYS respond in the SAME language as the user

User request: "${message}"

Respond in a friendly way and tell the user what you're doing.`;

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
        max_tokens: 600
      })
    });

    const data = await response.json();
    console.log('AI Response Status:', response.status);
    
    if (!response.ok) {
      console.error('AI API Error:', JSON.stringify(data, null, 2));
      
      let errorMsg = '❌ خطا در ارتباط با هوش مصنوعی';
      if (data.error?.message) {
        errorMsg += `: ${data.error.message}`;
      } else if (data.message) {
        errorMsg += `: ${data.message}`;
      }
      
      return res.json({ 
        success: false, 
        message: errorMsg
      });
    }
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('Unexpected API response:', data);
      return res.json({ 
        success: false, 
        message: '❌ پاسخ غیرمنتظره از API دریافت شد' 
      });
    }
    
    let reply = data.choices[0].message.content;
    console.log('🤖 پاسخ AI:', reply);
    
    // ===== حذف ACTION: از پاسخ =====
    reply = reply.replace(/ACTION:[^\s]*/g, '').trim();
    
    // ===== استخراج و اجرای ACTION =====
    const action = extractActionFromText(reply + ' ' + message);
    let actionResult = null;
    
    if (action) {
      console.log('⚡ اجرای اکشن:', action);
      actionResult = executeAction(action);
      console.log('📊 نتیجه:', actionResult);
    }
    
    // ===== ساخت پاسخ نهایی =====
    let finalMessage = reply;
    
    // اگر اکشن اجرا شد و نتیجه داشت
    if (actionResult) {
      if (actionResult.success) {
        // اگه AI خودش جواب درست نداد، از نتیجه استفاده کن
        if (!reply.includes('✅') && !reply.includes('❌') && !reply.includes('انجام')) {
          finalMessage = actionResult.message;
        } else {
          // ترکیب پاسخ AI و نتیجه
          finalMessage = reply + '\n\n' + actionResult.message;
        }
      } else {
        finalMessage = actionResult.message;
      }
    }
    
    // ===== بررسی رنگ ناموجود =====
    const colorCheck = checkInvalidColor(message);
    if (colorCheck) {
      finalMessage = colorCheck;
    }
    
    // ===== حذف ACTION های باقی‌مانده =====
    finalMessage = finalMessage.replace(/ACTION:[^\s]*/g, '').trim();
    
    // ذخیره تاریخچه
    aiHistory.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
    aiHistory.push({ role: 'assistant', content: finalMessage, timestamp: new Date().toISOString() });
    
    res.json({ 
      success: true, 
      message: finalMessage,
      action: action,
      actionResult: actionResult
    });
    
  } catch (error) {
    console.error('AI Error:', error);
    res.json({ 
      success: false, 
      message: `❌ خطا در ارتباط: ${error.message}` 
    });
  }
});

// ============================================================
// ========== بررسی رنگ ناموجود ==========
// ============================================================

function checkInvalidColor(message) {
  if (!message) return null;
  
  const lower = message.toLowerCase();
  
  // اگه ربطی به رنگ نداره
  if (!lower.includes('رنگ') && !lower.includes('تم') && !lower.includes('color') && !lower.includes('theme')) {
    return null;
  }
  
  // لیست کلمات معتبر
  const validWords = ['blue', 'آبی', 'purple', 'بنفش', 'green', 'سبز', 'rose', 'صورتی', 'pink', 
                      'brown', 'قهوه', 'قهوه ای', 'red', 'قرمز', 'orange', 'نارنجی', 'teal', 'فیروزه'];
  
  // کلماتی که ممکنه کاربر بگه ولی معتبر نیستن
  const invalidColors = ['طیفانی', 'طوسی', 'خاکستری', 'مشکی', 'طلایی', 'نقره ای', 'زرد', 'کرم', 'سفید', 
                         'طيفانی', 'خاكستری', 'مشکی', 'طلایی', 'نقره‌ای', 'طلایی', 'کرم', 'سفید'];
  
  for (const word of invalidColors) {
    if (lower.includes(word)) {
      const colorList = '🔵 آبی\n🟣 بنفش\n🟢 سبز\n🌹 صورتی\n🟤 قهوه‌ای\n🔴 قرمز\n🟠 نارنجی\n🩵 فیروزه‌ای';
      return `❌ رنگ "${word}" وجود ندارد. رنگ‌های موجود:\n${colorList}`;
    }
  }
  
  // بررسی کلمات دیگه که شاید رنگ باشن ولی معتبر نیستن
  const words = message.split(/\s+/);
  for (const word of words) {
    const clean = word.replace(/[.,،!?]/g, '').toLowerCase();
    if (clean.length > 2 && !validWords.includes(clean) && !clean.includes('رنگ') && !clean.includes('تم') && !clean.includes('color') && !clean.includes('theme')) {
      // اگه کلمه شبیه رنگ باشه ولی معتبر نباشه
      if (clean.includes('ی') || clean.includes('ی') || clean.endsWith('ی')) {
        const colorList = '🔵 آبی\n🟣 بنفش\n🟢 سبز\n🌹 صورتی\n🟤 قهوه‌ای\n🔴 قرمز\n🟠 نارنجی\n🩵 فیروزه‌ای';
        return `❌ رنگ "${clean}" وجود ندارد. رنگ‌های موجود:\n${colorList}`;
      }
    }
  }
  
  return null;
}

// ============================================================
// ========== استخراج ACTION از متن ==========
// ============================================================

function extractActionFromText(text) {
  if (!text) return null;
  
  const lower = text.toLowerCase();
  
  // ===== 1. ساخت پنل =====
  if (lower.includes('ساخت') || lower.includes('create') || 
      lower.includes('بساز') || lower.includes('make') ||
      lower.includes('پنل') || lower.includes('کانفینگ')) {
    
    let name = 'پنل جدید';
    const nameMatch = text.match(/["']([^"']*)["']/);
    if (nameMatch && nameMatch[1]) name = nameMatch[1];
    else {
      const patterns = [
        /پنل\s+["']?([^\s,،.]+)["']?/i,
        /با\s+نام\s+["']?([^\s,،.]+)["']?/i,
        /(?:ساخت|create|بساز|make)\s+["']?([^\s,،.]+)["']?/i
      ];
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          name = match[1];
          break;
        }
      }
    }
    name = name.replace(/[.,،!?]/g, '').trim();
    if (!name || name.length < 1) name = 'پنل جدید';
    
    const daysMatch = text.match(/(\d+)\s*(?:days?|روز)/i);
    const days = daysMatch ? parseInt(daysMatch[1]) : 30;
    
    const storageMatch = text.match(/(\d+)\s*(?:GB|گیگ|gig)/i);
    const storage = storageMatch ? parseInt(storageMatch[1]) : 100;
    
    const usersMatch = text.match(/(\d+)\s*(?:users?|کاربر)/i);
    const users = usersMatch ? parseInt(usersMatch[1]) : 10;
    
    return { type: 'create_panel', data: { name, days, storage, users } };
  }
  
  // ===== 2. حذف همه =====
  if (lower.includes('delete all') || lower.includes('حذف همه') || 
      lower.includes('remove all') || lower.includes('همه پنل')) {
    return { type: 'delete_all' };
  }
  
  // ===== 3. حذف پنل =====
  if (lower.includes('delete') || lower.includes('حذف') || 
      lower.includes('remove') || lower.includes('پاک کن')) {
    
    let name = null;
    const quoteMatch = text.match(/["']([^"']*)["']/);
    if (quoteMatch && quoteMatch[1]) name = quoteMatch[1];
    
    if (!name) {
      const regex = /(?:delete|حذف|remove|پاک\s+کن)\s+(?:panel|پنل)?\s*["']?([^\s,،.]+)["']?/i;
      const match = text.match(regex);
      if (match && match[1]) name = match[1];
    }
    
    if (name) {
      name = name.replace(/[.,،!?]/g, '').trim();
      return { type: 'delete_panel', data: { name } };
    }
  }
  
  // ===== 4. تغییر تم =====
  if (lower.includes('theme') || lower.includes('تم') || 
      lower.includes('color') || lower.includes('رنگ')) {
    
    // چک کردن رنگ‌های معتبر
    for (const [color, keywords] of Object.entries(AVAILABLE_COLORS)) {
      for (const kw of keywords) {
        if (lower.includes(kw)) {
          return { type: 'change_theme', data: { color } };
        }
      }
    }
  }
  
  // ===== 5. تغییر حالت =====
  if (lower.includes('dark') || lower.includes('تاریک')) {
    return { type: 'change_mode', data: { mode: 'dark' } };
  }
  if (lower.includes('light') || lower.includes('روشن')) {
    return { type: 'change_mode', data: { mode: 'light' } };
  }
  
  // ===== 6. لیست =====
  if (lower.includes('list') || lower.includes('لیست') || 
      lower.includes('show') || lower.includes('نمایش')) {
    return { type: 'list_panels' };
  }
  
  // ===== 7. تغییر حجم =====
  if (lower.includes('حجم') || lower.includes('storage')) {
    const nameMatch = text.match(/["']([^"']*)["']/);
    const name = nameMatch ? nameMatch[1] : null;
    const amountMatch = text.match(/(\d+)\s*(?:GB|گیگ)/i);
    const amount = amountMatch ? parseInt(amountMatch[1]) : null;
    if (name && amount) {
      return { type: 'change_storage', data: { name, amount } };
    }
  }
  
  // ===== 8. افزودن روز =====
  if (lower.includes('تمدید') || lower.includes('add days') || 
      lower.includes('extend') || lower.includes('روز')) {
    const nameMatch = text.match(/["']([^"']*)["']/);
    const name = nameMatch ? nameMatch[1] : null;
    const daysMatch = text.match(/(\d+)\s*(?:days?|روز)/i);
    const days = daysMatch ? parseInt(daysMatch[1]) : null;
    if (name && days) {
      return { type: 'add_days', data: { name, days } };
    }
  }
  
  return null;
}

// ============================================================
// ========== اجرای ACTION ==========
// ============================================================

function executeAction(action) {
  if (!action) return { success: false, message: 'اکشن یافت نشد' };
  
  try {
    console.log('🔧 اجرای اکشن:', action.type, action.data || '');
    
    switch(action.type) {
      case 'create_panel': {
        const { name, days, storage, users } = action.data;
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
        return { 
          success: true, 
          message: `✅ پنل "${name}" با ${days} روز، ${storage} گیگ و ${users} کاربر ساخته شد`,
          panel: newPanel
        };
      }
      
      case 'delete_panel': {
        const name = action.data.name;
        const panel = panels.find(p => 
          p.name.toLowerCase() === name.toLowerCase() ||
          p.slug.toLowerCase() === name.toLowerCase() ||
          p.name.toLowerCase().includes(name.toLowerCase())
        );
        if (panel) {
          const panelName = panel.name;
          panels = panels.filter(p => p.id !== panel.id);
          return { success: true, message: `✅ پنل "${panelName}" با موفقیت حذف شد` };
        }
        return { success: false, message: `❌ پنل "${name}" یافت نشد` };
      }
      
      case 'delete_all': {
        const count = panels.length;
        panels = [];
        return { success: true, message: `✅ ${count} پنل با موفقیت حذف شدند` };
      }
      
      case 'change_theme': {
        const color = action.data.color;
        panels.forEach(p => {
          if (!p.panelSettings) p.panelSettings = {};
          p.panelSettings.color = color;
        });
        return { success: true, message: `✅ تم همه پنل‌ها به "${color}" تغییر کرد` };
      }
      
      case 'change_mode': {
        const mode = action.data.mode;
        const modeName = mode === 'dark' ? 'تاریک' : 'روشن';
        panels.forEach(p => {
          if (!p.panelSettings) p.panelSettings = {};
          p.panelSettings.mode = mode;
        });
        return { success: true, message: `✅ حالت همه پنل‌ها به "${modeName}" تغییر کرد` };
      }
      
      case 'list_panels': {
        if (panels.length === 0) {
          return { success: true, message: '📭 هیچ پنلی وجود ندارد' };
        }
        let list = '📋 لیست پنل‌ها:\n';
        panels.forEach((p, i) => {
          const status = p.status === 'active' ? '✅' : '❌';
          list += `${i+1}. 📡 ${p.name} ${status} ${p.remainingDays} روز | ${p.storage}GB\n`;
        });
        return { success: true, message: list };
      }
      
      case 'change_storage': {
        const { name, amount } = action.data;
        const panel = panels.find(p => p.name.toLowerCase() === name.toLowerCase());
        if (panel) {
          panel.storage = amount;
          return { success: true, message: `✅ حجم پنل "${name}" به ${amount} گیگ تغییر کرد` };
        }
        return { success: false, message: `❌ پنل "${name}" یافت نشد` };
      }
      
      case 'add_days': {
        const { name, days } = action.data;
        const panel = panels.find(p => p.name.toLowerCase() === name.toLowerCase());
        if (panel) {
          panel.remainingDays += days;
          panel.days += days;
          return { success: true, message: `✅ ${days} روز به پنل "${name}" اضافه شد` };
        }
        return { success: false, message: `❌ پنل "${name}" یافت نشد` };
      }
      
      default:
        return { success: false, message: `❌ اکشن ناشناخته: ${action.type}` };
    }
  } catch (error) {
    return { success: false, message: `❌ خطا: ${error.message}` };
  }
}

// ============================================================
// ========== توابع کمکی ==========
// ============================================================

function generateSlug(name) {
  if (!name) return 'panel-' + Date.now();
  return name.toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Get AI history
app.get('/api/ai/history', (req, res) => {
  res.json(aiHistory);
});

// Clear AI history
app.delete('/api/ai/history', (req, res) => {
  aiHistory = [];
  res.json({ success: true });
});

// ========== SERVE PANEL PAGE WITH SLUG ==========
app.get('/:slug', (req, res) => {
  const slug = req.params.slug;
  const reserved = ['dashboard', 'settings', 'ai', 'api', 'login', 'favicon.ico'];
  if (reserved.includes(slug)) {
    return res.redirect('/' + slug);
  }
  
  const panel = panels.find(p => p.slug === slug);
  if (!panel) {
    return res.send('پنل یافت نشد');
  }
  
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

// ========== START SERVER ==========
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Login: http://localhost:${PORT}`);
  console.log(`🔑 Username: ${process.env.ADMIN_USERNAME || 'admin'}`);
  console.log(`🔑 Password: ${process.env.ADMIN_PASSWORD || 'admin'}`);
});
