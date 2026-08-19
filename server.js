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
// ========== هوش مصنوعی با تشخیص قوی ==========
// ============================================================

app.post('/api/ai/chat', async (req, res) => {
  const { message } = req.body;
  
  console.log('📨 پیام کاربر:', message);
  
  // ===== اول خودمون دستور رو تشخیص می‌دیم (قوی) =====
  const directResult = strongDetectAndExecute(message);
  if (directResult.executed) {
    console.log('✅ اجرای مستقیم:', directResult.message);
    aiHistory.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
    aiHistory.push({ role: 'assistant', content: directResult.message, timestamp: new Date().toISOString() });
    return res.json({
      success: true,
      message: directResult.message,
      result: directResult
    });
  }
  
  // ===== اگر خودمون نتونستیم، از API می‌پرسیم =====
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL || 'https://api.vivgrid.com/v1';
  const model = process.env.AI_MODEL || 'deepseek-chat';
  
  if (apiKey) {
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { 
              role: 'system', 
              content: `You are an AI assistant. Parse this request and return ONLY a command:
              
COMMANDS:
- CREATE:name:days:storage:users
- DELETE:name
- DELETE_ALL
- THEME:color
- MODE:dark
- LIST

Example: "CREATE:ایران:30:100:10"
Return ONLY the command.` 
            },
            { role: 'user', content: message }
          ],
          temperature: 0.1,
          max_tokens: 50
        })
      });

      const data = await response.json();
      if (response.ok && data.choices?.[0]?.message?.content) {
        const reply = data.choices[0].message.content.trim();
        console.log('🤖 پاسخ API:', reply);
        
        const apiResult = executeFromAPI(reply);
        if (apiResult.executed) {
          aiHistory.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
          aiHistory.push({ role: 'assistant', content: apiResult.message, timestamp: new Date().toISOString() });
          return res.json({ success: true, message: apiResult.message, result: apiResult });
        }
      }
    } catch (e) {
      console.log('⚠️ API error, using fallback');
    }
  }
  
  // ===== اگر هیچ کاری نشد =====
  const helpMsg = getHelpMessage();
  aiHistory.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
  aiHistory.push({ role: 'assistant', content: helpMsg, timestamp: new Date().toISOString() });
  res.json({ success: true, message: helpMsg });
});

// ============================================================
// ========== تشخیص قوی دستورات ==========
// ============================================================

function strongDetectAndExecute(message) {
  if (!message || message.trim() === '') {
    return { executed: false };
  }
  
  const lower = message.toLowerCase().trim();
  const result = { executed: false, message: '' };
  
  console.log('🔍 تحلیل پیام:', message);
  
  // ============================================================
  // ===== 1. ساخت پنل =====
  // ============================================================
  if (lower.includes('ساخت') || lower.includes('create') || 
      lower.includes('بساز') || lower.includes('make') ||
      lower.includes('پنل') || lower.includes('کانفینگ') ||
      lower.includes('کانفیگ') || lower.includes('جدید')) {
    
    console.log('🔧 تشخیص: ساخت پنل');
    
    // استخراج اسم - با روش‌های مختلف
    let name = null;
    
    // روش 1: از نقل قول
    const quoteMatch = message.match(/["']([^"']*)["']/);
    if (quoteMatch && quoteMatch[1]) {
      name = quoteMatch[1];
    }
    
    // روش 2: "پنل [اسم]"
    if (!name) {
      const match = message.match(/پنل\s+["']?([^\s,،.]+)["']?/i);
      if (match && match[1]) name = match[1];
    }
    
    // روش 3: "با نام [اسم]"
    if (!name) {
      const match = message.match(/با\s+نام\s+["']?([^\s,،.]+)["']?/i);
      if (match && match[1]) name = match[1];
    }
    
    // روش 4: "ساخت [اسم]"
    if (!name) {
      const match = message.match(/(?:ساخت|create|بساز|make)\s+["']?([^\s,،.]+)["']?/i);
      if (match && match[1]) name = match[1];
    }
    
    // روش 5: اگر هیچکدام، اسم رو از کلمه بعد از "با" بگیر
    if (!name) {
      const words = message.split(/\s+/);
      for (let i = 0; i < words.length; i++) {
        if (words[i] === 'با' && i + 1 < words.length) {
          name = words[i + 1];
          break;
        }
      }
    }
    
    // اگر بازم اسم پیدا نشد، از آخرین کلمه استفاده کن
    if (!name) {
      const words = message.split(/\s+/);
      const lastWord = words[words.length - 1];
      const keywords = ['ساخت', 'create', 'بساز', 'make', 'پنل', 'کانفینگ', 'کانفیگ', 'روز', 'گیگ', 'کاربر'];
      if (lastWord && !keywords.includes(lastWord.toLowerCase())) {
        name = lastWord;
      }
    }
    
    // پاکسازی اسم
    if (name) {
      name = name.replace(/[.,،!?]/g, '').trim();
    }
    
    // اگر اسم پیدا نشد، از "پنل جدید" استفاده کن
    if (!name || name.length < 1) {
      name = 'پنل جدید';
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
    
    console.log('📦 اطلاعات استخراج شده:', { name, days, storage, users });
    
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
    result.type = 'create_panel';
    result.panel = newPanel;
    return result;
  }
  
  // ============================================================
  // ===== 2. حذف پنل =====
  // ============================================================
  if (lower.includes('حذف') || lower.includes('delete') || 
      lower.includes('پاک کن') || lower.includes('remove') ||
      lower.includes('پاکش کن') || lower.includes('بردار')) {
    
    console.log('🔧 تشخیص: حذف پنل');
    
    let name = null;
    
    const quoteMatch = message.match(/["']([^"']*)["']/);
    if (quoteMatch && quoteMatch[1]) name = quoteMatch[1];
    
    if (!name) {
      const regex = /(?:حذف|delete|پاک\s+کن|remove|بردار)\s+(?:پنل|panel)?\s*["']?([^\s,،.]+)["']?/i;
      const match = message.match(regex);
      if (match && match[1]) name = match[1];
    }
    
    if (name) {
      name = name.replace(/[.,،!?]/g, '').trim();
      const panel = panels.find(p => 
        p.name.toLowerCase() === name.toLowerCase() ||
        p.slug.toLowerCase() === name.toLowerCase() ||
        p.name.toLowerCase().includes(name.toLowerCase())
      );
      
      if (panel) {
        const panelName = panel.name;
        panels = panels.filter(p => p.id !== panel.id);
        result.executed = true;
        result.message = `✅ پنل "${panelName}" با موفقیت حذف شد`;
        result.type = 'delete_panel';
        return result;
      } else {
        result.executed = true;
        result.message = `❌ پنل "${name}" یافت نشد`;
        result.type = 'error';
        return result;
      }
    }
  }
  
  // ============================================================
  // ===== 3. حذف همه =====
  // ============================================================
  if ((lower.includes('همه') || lower.includes('all')) && 
      (lower.includes('حذف') || lower.includes('پاک') || lower.includes('delete'))) {
    const count = panels.length;
    panels = [];
    result.executed = true;
    result.message = `✅ ${count} پنل با موفقیت حذف شدند`;
    result.type = 'delete_all';
    return result;
  }
  
  // ============================================================
  // ===== 4. لیست =====
  // ============================================================
  if (lower.includes('لیست') || lower.includes('نمایش') || 
      lower.includes('list') || lower.includes('show') ||
      lower.includes('چند تا') || lower.includes('پنل‌ها')) {
    
    if (panels.length === 0) {
      result.executed = true;
      result.message = '📭 هیچ پنلی وجود ندارد';
    } else {
      let list = '📋 لیست پنل‌ها:\n';
      panels.forEach((p, i) => {
        const status = p.status === 'active' ? '✅' : '❌';
        list += `${i+1}. 📡 ${p.name} ${status} ${p.remainingDays} روز | ${p.storage}GB\n`;
      });
      result.executed = true;
      result.message = list;
      result.type = 'list';
    }
    return result;
  }
  
  // ============================================================
  // ===== 5. تغییر تم =====
  // ============================================================
  if (lower.includes('تم') || lower.includes('رنگ') || 
      lower.includes('theme') || lower.includes('color')) {
    
    const colors = ['blue', 'purple', 'green', 'rose', 'brown', 'red', 'orange', 'teal'];
    const colorNames = {
      'آبی': 'blue', 'blue': 'blue',
      'بنفش': 'purple', 'purple': 'purple',
      'سبز': 'green', 'green': 'green',
      'صورتی': 'rose', 'pink': 'rose', 'rose': 'rose',
      'قهوه ای': 'brown', 'قهوه‌ای': 'brown', 'brown': 'brown',
      'قرمز': 'red', 'red': 'red',
      'نارنجی': 'orange', 'orange': 'orange',
      'فیروزه ای': 'teal', 'فیروزه‌ای': 'teal', 'teal': 'teal'
    };
    
    let foundColor = null;
    for (const [key, val] of Object.entries(colorNames)) {
      if (lower.includes(key)) {
        foundColor = val;
        break;
      }
    }
    
    if (foundColor) {
      panels.forEach(p => {
        if (!p.panelSettings) p.panelSettings = {};
        p.panelSettings.color = foundColor;
      });
      result.executed = true;
      result.message = `✅ تم همه پنل‌ها به "${foundColor}" تغییر کرد`;
      result.type = 'theme';
      return result;
    }
  }
  
  // ============================================================
  // ===== 6. تغییر حالت =====
  // ============================================================
  if (lower.includes('تاریک') || lower.includes('dark')) {
    panels.forEach(p => {
      if (!p.panelSettings) p.panelSettings = {};
      p.panelSettings.mode = 'dark';
    });
    result.executed = true;
    result.message = '✅ حالت همه پنل‌ها به "تاریک" تغییر کرد';
    result.type = 'mode';
    return result;
  }
  
  if (lower.includes('روشن') || lower.includes('light')) {
    panels.forEach(p => {
      if (!p.panelSettings) p.panelSettings = {};
      p.panelSettings.mode = 'light';
    });
    result.executed = true;
    result.message = '✅ حالت همه پنل‌ها به "روشن" تغییر کرد';
    result.type = 'mode';
    return result;
  }
  
  return { executed: false };
}

// ============================================================
// ========== اجرای دستور از API ==========
// ============================================================

function executeFromAPI(command) {
  const result = { executed: false, message: '' };
  
  if (!command || command.trim() === '') {
    result.message = '⚠️ پاسخی از API دریافت نشد';
    return result;
  }
  
  console.log('🔧 اجرای دستور از API:', command);
  
  // CREATE:name:days:storage:users
  if (command.startsWith('CREATE:')) {
    const parts = command.split(':');
    if (parts.length >= 5) {
      const name = parts[1] || 'پنل جدید';
      const days = parseInt(parts[2]) || 30;
      const storage = parseInt(parts[3]) || 100;
      const users = parseInt(parts[4]) || 10;
      
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
      result.type = 'create_panel';
      return result;
    }
  }
  
  // DELETE:name
  if (command.startsWith('DELETE:')) {
    const name = command.split(':')[1];
    if (name) {
      const panel = panels.find(p => 
        p.name.toLowerCase() === name.toLowerCase() ||
        p.slug.toLowerCase() === name.toLowerCase() ||
        p.name.toLowerCase().includes(name.toLowerCase())
      );
      if (panel) {
        const panelName = panel.name;
        panels = panels.filter(p => p.id !== panel.id);
        result.executed = true;
        result.message = `✅ پنل "${panelName}" با موفقیت حذف شد`;
        result.type = 'delete_panel';
        return result;
      } else {
        result.executed = true;
        result.message = `❌ پنل "${name}" یافت نشد`;
        result.type = 'error';
        return result;
      }
    }
  }
  
  // DELETE_ALL
  if (command.includes('DELETE_ALL')) {
    const count = panels.length;
    panels = [];
    result.executed = true;
    result.message = `✅ ${count} پنل با موفقیت حذف شدند`;
    result.type = 'delete_all';
    return result;
  }
  
  // LIST
  if (command.includes('LIST')) {
    if (panels.length === 0) {
      result.executed = true;
      result.message = '📭 هیچ پنلی وجود ندارد';
    } else {
      let list = '📋 لیست پنل‌ها:\n';
      panels.forEach((p, i) => {
        const status = p.status === 'active' ? '✅' : '❌';
        list += `${i+1}. 📡 ${p.name} ${status} ${p.remainingDays} روز\n`;
      });
      result.executed = true;
      result.message = list;
      result.type = 'list';
    }
    return result;
  }
  
  // THEME:color
  if (command.startsWith('THEME:')) {
    const color = command.split(':')[1];
    if (color) {
      panels.forEach(p => {
        if (!p.panelSettings) p.panelSettings = {};
        p.panelSettings.color = color;
      });
      result.executed = true;
      result.message = `✅ تم همه پنل‌ها به "${color}" تغییر کرد`;
      result.type = 'theme';
      return result;
    }
  }
  
  result.message = '⚠️ دستور قابل تشخیص نبود';
  return result;
}

// ============================================================
// ========== توابع کمکی ==========
// ============================================================

function getHelpMessage() {
  return `🤖 من یک دستیار هوشمند هستم. می‌توانید این کارها را انجام دهید:

📌 ساخت پنل:
   "ساخت پنل [اسم] با [تعداد] روز و [تعداد] گیگ و [تعداد] کاربر"
   مثال: "ساخت پنل ایران با 30 روز و 100 گیگ و 10 کاربر"
   یا: "یک پنل با نام ایران با 30 روز، 100 گیگابایت و 10 کاربر بساز"

🗑️ حذف پنل:
   "حذف پنل ایران" یا "پاک کن پنل ایران"

🧹 حذف همه:
   "حذف همه پنل‌ها" یا "پاک کن همه"

📋 لیست پنل‌ها:
   "لیست پنل‌ها" یا "نمایش پنل‌ها"

🎨 تغییر تم:
   "تم قهوه‌ای" یا "رنگ بنفش"

🌓 تغییر حالت:
   "حالت تاریک" یا "حالت روشن"

💡 هر سوالی دارید بپرسید!`;
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
