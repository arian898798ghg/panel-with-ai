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
// ========== هوش مصنوعی (API + آفلاین) ==========
// ============================================================

app.post('/api/ai/chat', async (req, res) => {
  const { message } = req.body;
  
  console.log('📨 پیام کاربر:', message);
  
  // ===== اول خودمون سعی می‌کنیم دستور رو بفهمیم =====
  const localResult = executeLocalCommand(message);
  if (localResult.found) {
    console.log('✅ اجرای محلی:', localResult.message);
    aiHistory.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
    aiHistory.push({ role: 'assistant', content: localResult.message, timestamp: new Date().toISOString() });
    return res.json({ success: true, message: localResult.message, result: localResult });
  }
  
  // ===== اگر خودمون نفهمیدیم، از API می‌پرسیم =====
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL || 'https://api.vivgrid.com/v1';
  const model = process.env.AI_MODEL || 'deepseek-chat';
  
  if (!apiKey) {
    // اگر API Key نبود، پیام کمک بده
    const helpMsg = getHelpMessage();
    aiHistory.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
    aiHistory.push({ role: 'assistant', content: helpMsg, timestamp: new Date().toISOString() });
    return res.json({ success: true, message: helpMsg });
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
      console.error('❌ API Error:', data);
      // اگه API کار نکرد، خودمون جواب می‌دیم
      const fallbackMsg = getHelpMessage();
      aiHistory.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
      aiHistory.push({ role: 'assistant', content: fallbackMsg, timestamp: new Date().toISOString() });
      return res.json({ success: true, message: fallbackMsg });
    }
    
    let reply = data.choices?.[0]?.message?.content || '';
    console.log('🤖 پاسخ API:', reply);
    
    // ===== اجرای دستور از روی پاسخ API =====
    let result = executeApiCommand(reply);
    
    // اگه API جواب درست نداد، خودمون جواب می‌دیم
    if (!result || !result.message) {
      result = { type: 'help', message: getHelpMessage() };
    }
    
    aiHistory.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
    aiHistory.push({ role: 'assistant', content: result.message, timestamp: new Date().toISOString() });
    
    res.json({ success: true, message: result.message, result: result });
    
  } catch (error) {
    console.error('❌ Error:', error);
    // در صورت هر خطایی، خودمون جواب می‌دیم
    const errorMsg = getHelpMessage();
    aiHistory.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
    aiHistory.push({ role: 'assistant', content: errorMsg, timestamp: new Date().toISOString() });
    res.json({ success: true, message: errorMsg });
  }
});

// ============================================================
// ========== اجرای محلی دستورات ==========
// ============================================================

function executeLocalCommand(message) {
  if (!message || message.trim() === '') {
    return { found: true, type: 'help', message: '📝 لطفاً یک پیام بنویسید.' };
  }
  
  const lower = message.toLowerCase().trim();
  const result = { found: false, message: '' };
  
  // ===== 1. DELETE ALL =====
  if (lower.includes('delete all') || lower.includes('حذف همه') || 
      lower.includes('remove all') || lower.includes('پاک کن همه') ||
      lower.includes('همه پنل') || lower.includes('all panels') ||
      lower.includes('همه کانفینگ') || lower.includes('همه کانفیگ')) {
    
    const count = panels.length;
    panels = [];
    return { found: true, type: 'delete_all', message: `✅ ${count} پنل با موفقیت حذف شدند` };
  }
  
  // ===== 2. DELETE SPECIFIC =====
  if (lower.includes('delete') || lower.includes('حذف') || 
      lower.includes('remove') || lower.includes('پاک کن') ||
      lower.includes('پاکش کن') || lower.includes('بردار')) {
    
    let panelName = null;
    const quoteMatch = message.match(/["']([^"']*)["']/);
    if (quoteMatch && quoteMatch[1]) panelName = quoteMatch[1];
    
    if (!panelName) {
      const regex = /(?:delete|حذف|remove|پاک\s+کن|بردار)\s+(?:panel|پنل|کانفینگ|کانفیگ)?\s*["']?([^\s,،.]+)["']?/i;
      const match = message.match(regex);
      if (match && match[1]) panelName = match[1];
    }
    
    if (panelName) {
      panelName = panelName.replace(/[.,،!?]/g, '').trim();
      
      if (panels.length === 0) {
        return { found: true, type: 'error', message: '📭 هیچ پنلی برای حذف وجود ندارد.' };
      }
      
      let foundPanel = null;
      const searchName = panelName.toLowerCase();
      for (const p of panels) {
        if (!p || !p.name) continue;
        if (p.name.toLowerCase() === searchName || p.name.toLowerCase().includes(searchName)) {
          foundPanel = p;
          break;
        }
      }
      
      if (foundPanel) {
        const name = foundPanel.name;
        panels = panels.filter(p => p.id !== foundPanel.id);
        return { found: true, type: 'delete_panel', message: `✅ پنل "${name}" با موفقیت حذف شد` };
      } else {
        return { found: true, type: 'error', message: `❌ پنل "${panelName}" یافت نشد.` };
      }
    }
  }
  
  // ===== 3. CREATE PANEL =====
  if (lower.includes('create') || lower.includes('ساخت') || 
      lower.includes('make') || lower.includes('بساز') || 
      lower.includes('جدید') || lower.includes('new') ||
      lower.includes('کانفینگ') || lower.includes('کانفیگ')) {
    
    let name = 'پنل جدید';
    const nameMatch = message.match(/["']([^"']*)["']/);
    if (nameMatch && nameMatch[1]) name = nameMatch[1];
    else {
      const nameRegex = /(?:create|ساخت|make|بساز|کانفینگ|کانفیگ)\s+(?:panel|پنل)?\s*["']?([^\s,،]+)["']?/i;
      const nMatch = message.match(nameRegex);
      if (nMatch && nMatch[1]) name = nMatch[1];
    }
    name = name.replace(/[.,،!?]/g, '').trim();
    if (!name || name.length < 1) name = 'پنل جدید';
    
    let days = 30;
    const daysMatch = message.match(/(\d+)\s*(?:days?|روز)/i);
    if (daysMatch) days = parseInt(daysMatch[1]);
    
    let storage = 100;
    const storageMatch = message.match(/(\d+)\s*(?:GB|گیگ|gig)/i);
    if (storageMatch) storage = parseInt(storageMatch[1]);
    
    let users = 10;
    const usersMatch = message.match(/(\d+)\s*(?:users?|کاربر)/i);
    if (usersMatch) users = parseInt(usersMatch[1]);
    
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
    return { found: true, type: 'create_panel', message: `✅ پنل "${name}" با ${days} روز، ${storage} گیگ و ${users} کاربر ساخته شد` };
  }
  
  // ===== 4. LIST PANELS =====
  if (lower.includes('list') || lower.includes('نمایش') || 
      lower.includes('show') || lower.includes('لیست') ||
      lower.includes('پنل‌ها') || lower.includes('کانفینگ‌ها')) {
    
    if (panels.length === 0) {
      return { found: true, type: 'list', message: '📭 هیچ پنلی وجود ندارد.' };
    }
    let list = '📋 لیست پنل‌ها:\n';
    panels.forEach((p, i) => {
      const status = p.status === 'active' ? '✅' : '❌';
      list += `${i+1}. 📡 ${p.name} ${status} ${p.remainingDays} روز | ${p.storage}GB\n`;
    });
    return { found: true, type: 'list', message: list };
  }
  
  // ===== 5. HELP =====
  return { found: false };
}

// ============================================================
// ========== اجرای دستور از API ==========
// ============================================================

function executeApiCommand(reply) {
  if (!reply || reply.trim() === '') {
    return { type: 'help', message: getHelpMessage() };
  }
  
  // DELETE_ALL
  if (reply.includes('DELETE_ALL')) {
    const count = panels.length;
    panels = [];
    return { type: 'delete_all', message: `✅ ${count} پنل با موفقیت حذف شدند` };
  }
  
  // DELETE_PANEL
  const deleteMatch = reply.match(/DELETE_PANEL:([^:]+)/);
  if (deleteMatch && deleteMatch[1]) {
    const name = deleteMatch[1].trim();
    const panel = panels.find(p => p.name.toLowerCase() === name.toLowerCase() || p.slug.toLowerCase() === name.toLowerCase());
    if (panel) {
      panels = panels.filter(p => p.id !== panel.id);
      return { type: 'delete_panel', message: `✅ پنل "${panel.name}" با موفقیت حذف شد` };
    } else {
      return { type: 'error', message: `❌ پنل "${name}" یافت نشد.` };
    }
  }
  
  // CREATE_PANEL
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
    return { type: 'create_panel', message: `✅ پنل "${name}" با ${days} روز، ${storage} گیگ و ${users} کاربر ساخته شد` };
  }
  
  // LIST_PANELS
  if (reply.includes('LIST_PANELS')) {
    if (panels.length === 0) {
      return { type: 'list', message: '📭 هیچ پنلی وجود ندارد.' };
    }
    let list = '📋 لیست پنل‌ها:\n';
    panels.forEach((p, i) => {
      const status = p.status === 'active' ? '✅' : '❌';
      list += `${i+1}. 📡 ${p.name} ${status} ${p.remainingDays} روز\n`;
    });
    return { type: 'list', message: list };
  }
  
  // CHANGE_THEME
  const themeMatch = reply.match(/CHANGE_THEME:([^:]+)/);
  if (themeMatch && themeMatch[1]) {
    const color = themeMatch[1].trim();
    panels.forEach(p => {
      if (!p.panelSettings) p.panelSettings = {};
      p.panelSettings.color = color;
    });
    return { type: 'theme', message: `✅ تم همه پنل‌ها به "${color}" تغییر کرد` };
  }
  
  return { type: 'help', message: getHelpMessage() };
}

// ============================================================
// ========== توابع کمکی ==========
// ============================================================

function getHelpMessage() {
  return `🤖 من یک دستیار هوشمند هستم. می‌توانید این کارها را انجام دهید:

📌 ساخت پنل:
   "ساخت پنل [اسم] با [تعداد] روز و [تعداد] گیگ"
   مثال: "ساخت پنل آلمان با 30 روز و 100 گیگ"

🗑️ حذف پنل:
   "حذف پنل [اسم]" یا "پاک کن پنل [اسم]"

🧹 حذف همه:
   "حذف همه پنل‌ها"

📋 لیست پنل‌ها:
   "لیست پنل‌ها"

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
