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
// ========== هوش مصنوعی (API + اجرای مستقیم) ==========
// ============================================================

app.post('/api/ai/chat', async (req, res) => {
  const { message } = req.body;
  
  console.log('📨 پیام کاربر:', message);
  
  // ===== اول خودمون دستور رو بررسی می‌کنیم =====
  const directResult = checkAndExecute(message);
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
  
  // ===== اگر خودمون نتونستیم، از API استفاده کن =====
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL || 'https://api.vivgrid.com/v1';
  const model = process.env.AI_MODEL || 'deepseek-chat';
  
  if (!apiKey) {
    return res.json({ 
      success: false, 
      message: '❌ API Key تنظیم نشده است' 
    });
  }

  try {
    const panelsInfo = panels.map(p => ({
      name: p.name,
      days: p.remainingDays,
      storage: p.storage,
      users: p.users,
      status: p.status
    }));

    const systemPrompt = `You are an AI assistant for a DNS panel.
Current panels: ${panelsInfo.length > 0 ? JSON.stringify(panelsInfo) : 'None'}

🔧 YOUR JOB: Parse the user's request and return ONLY ONE of these commands:

COMMANDS:
1. CREATE: "CREATE:name:days:storage:users"
   Example: "CREATE:ایران:30:100:10"

2. DELETE: "DELETE:name"
   Example: "DELETE:ایران"

3. DELETE_ALL: "DELETE_ALL"

4. THEME: "THEME:color"
   Example: "THEME:brown"

5. MODE: "MODE:dark" or "MODE:light"

6. LIST: "LIST"

7. HELP: "HELP"

IMPORTANT: 
- Extract the panel name from user's message
- Extract days, storage, users from user's message
- Return ONLY the command, nothing else
- For CREATE, use the exact name user said

User request: "${message}"

Return ONLY the command:`;

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
      console.error('❌ API Error:', data);
      return res.json({ 
        success: false, 
        message: `❌ خطا در API: ${data.error?.message || 'Unknown'}` 
      });
    }
    
    const reply = data.choices?.[0]?.message?.content || '';
    console.log('🤖 پاسخ API:', reply);
    
    // ===== اجرای دستور از روی پاسخ API =====
    const result = executeFromAPI(reply);
    
    // اگه API نتونست، خودمون دوباره امتحان می‌کنیم
    if (!result.executed) {
      const fallback = checkAndExecute(message);
      if (fallback.executed) {
        aiHistory.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
        aiHistory.push({ role: 'assistant', content: fallback.message, timestamp: new Date().toISOString() });
        return res.json({ success: true, message: fallback.message, result: fallback });
      }
    }
    
    aiHistory.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
    aiHistory.push({ role: 'assistant', content: result.message || reply, timestamp: new Date().toISOString() });
    
    res.json({
      success: true,
      message: result.message || reply,
      result: result
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
    
    // در صورت خطا، خودمون امتحان می‌کنیم
    const fallback = checkAndExecute(message);
    if (fallback.executed) {
      aiHistory.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
      aiHistory.push({ role: 'assistant', content: fallback.message, timestamp: new Date().toISOString() });
      return res.json({ success: true, message: fallback.message, result: fallback });
    }
    
    res.json({ 
      success: false, 
      message: `❌ خطا: ${error.message}` 
    });
  }
});

// ============================================================
// ========== بررسی و اجرای مستقیم دستورات ==========
// ============================================================

function checkAndExecute(message) {
  if (!message || message.trim() === '') {
    return { executed: false };
  }
  
  const lower = message.toLowerCase().trim();
  const result = { executed: false, message: '' };
  
  // ===== 1. ساخت پنل =====
  if (lower.includes('ساخت') || lower.includes('create') || 
      lower.includes('بساز') || lower.includes('make') ||
      lower.includes('پنل') || lower.includes('کانفینگ')) {
    
    // استخراج اسم
    let name = 'پنل جدید';
    const nameMatch = message.match(/["']([^"']*)["']/);
    if (nameMatch && nameMatch[1]) {
      name = nameMatch[1];
    } else {
      // اسم بعد از "ساخت" یا "پنل"
      const patterns = [
        /ساخت\s+(?:پنل|کانفینگ)?\s*["']?([^\s,،.]+)["']?/i,
        /پنل\s+["']?([^\s,،.]+)["']?/i,
        /با\s+نام\s+["']?([^\s,،.]+)["']?/i
      ];
      for (const pattern of patterns) {
        const match = message.match(pattern);
        if (match && match[1]) {
          name = match[1];
          break;
        }
      }
    }
    name = name.replace(/[.,،!?]/g, '').trim();
    
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
    
    console.log('📦 ساخت پنل:', { name, days, storage, users });
    
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
  
  // ===== 2. حذف پنل =====
  if (lower.includes('حذف') || lower.includes('delete') || 
      lower.includes('پاک کن') || lower.includes('remove')) {
    
    let name = null;
    const nameMatch = message.match(/["']([^"']*)["']/);
    if (nameMatch && nameMatch[1]) name = nameMatch[1];
    
    if (!name) {
      const regex = /(?:حذف|delete|پاک\s+کن|remove)\s+(?:پنل|panel)?\s*["']?([^\s,،.]+)["']?/i;
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
  
  // ===== 3. حذف همه =====
  if (lower.includes('همه') && (lower.includes('حذف') || lower.includes('پاک'))) {
    const count = panels.length;
    panels = [];
    result.executed = true;
    result.message = `✅ ${count} پنل با موفقیت حذف شدند`;
    result.type = 'delete_all';
    return result;
  }
  
  // ===== 4. لیست =====
  if (lower.includes('لیست') || lower.includes('نمایش') || 
      lower.includes('list') || lower.includes('show')) {
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
  
  // MODE:dark / MODE:light
  if (command.startsWith('MODE:')) {
    const mode = command.split(':')[1];
    if (mode === 'dark' || mode === 'light') {
      const modeName = mode === 'dark' ? 'تاریک' : 'روشن';
      panels.forEach(p => {
        if (!p.panelSettings) p.panelSettings = {};
        p.panelSettings.mode = mode;
      });
      result.executed = true;
      result.message = `✅ حالت همه پنل‌ها به "${modeName}" تغییر کرد`;
      result.type = 'mode';
      return result;
    }
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
  
  result.message = '⚠️ دستور قابل تشخیص نبود';
  return result;
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
