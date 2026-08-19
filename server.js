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
// ========== هوش مصنوعی (با API) ==========
// ============================================================

app.post('/api/ai/chat', async (req, res) => {
  const { message } = req.body;
  
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL || 'https://api.vivgrid.com/v1';
  const model = process.env.AI_MODEL || 'deepseek-chat';
  
  if (!apiKey) {
    return res.json({ 
      success: false, 
      message: '❌ API Key تنظیم نشده است. لطفاً AI_API_KEY را در متغیرهای محیطی تنظیم کنید.' 
    });
  }

  try {
    const panelsInfo = panels.map(p => ({
      name: p.name,
      days: p.remainingDays,
      storage: p.storage,
      users: p.users,
      status: p.status,
      slug: p.slug
    }));

    const systemPrompt = `You are a SUPER ADMIN AI assistant for a DNS management panel.

📋 CURRENT PANELS (${panels.length} panels):
${panelsInfo.length > 0 ? JSON.stringify(panelsInfo, null, 2) : '⚠️ No panels created yet.'}

🔧 YOUR CAPABILITIES - YOU HAVE FULL ACCESS:

1. CREATE PANEL:
   - Command: "create panel [name] with [X] days, [Y] GB, [Z] users"
   - Example: "create panel Germany with 30 days, 100 GB, 10 users"
   - Default: name="Panel", days=30, storage=100, users=10

2. DELETE PANEL:
   - Command: "delete [panel_name]" or "remove [panel_name]"
   - Command: "delete all" or "delete all panels"

3. EDIT PANEL:
   - Storage: "change storage of [name] to [X] GB"
   - Days: "add [X] days to [name]" or "extend [name] by [X] days"
   - Users: "change users of [name] to [X]"
   - Status: "activate [name]" or "deactivate [name]"

4. CHANGE THEME:
   - "change theme to [color]" where color: blue, purple, green, rose, brown, red, orange, teal

5. CHANGE MODE:
   - "change mode to dark" or "change mode to light"

6. LIST PANELS:
   - "list panels" or "show panels"

7. VIEW DETAILS:
   - "details of [name]" or "show [name] details"

🚨 IMPORTANT RULES:
- You MUST execute what the user asks
- If user says "delete", DELETE it
- If user says "create", CREATE it
- Always confirm with a clear message
- Be friendly and helpful
- ALWAYS respond in the SAME language as the user

💡 SUGGESTIONS:
- If user asks about best DNS for gaming → suggest: Electro, Radar, Shecan
- If user asks about bypass → suggest: Shecan, Begzar
- If user asks about Iran ISPs → suggest: Shatel, HostIran, Pishgaman, Asiatech, ParsOnline

Now respond to the user's request.`;

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
        temperature: 0.3,
        max_tokens: 600
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('❌ API Error:', data);
      return res.json({ 
        success: false, 
        message: `❌ خطا در API: ${data.error?.message || 'Unknown error'}` 
      });
    }
    
    const reply = data.choices?.[0]?.message?.content || '⚠️ پاسخی دریافت نشد.';
    console.log('🤖 پاسخ API:', reply);
    
    // ===== اجرای دستور از روی پاسخ API =====
    const action = parseAction(reply);
    let actionResult = null;
    
    if (action) {
      actionResult = executeAction(action);
      console.log('⚡ نتیجه اجرا:', actionResult);
    }
    
    // ذخیره تاریخچه
    aiHistory.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
    aiHistory.push({ role: 'assistant', content: reply, timestamp: new Date().toISOString() });
    
    res.json({
      success: true,
      message: reply,
      action: action,
      actionResult: actionResult
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
    res.json({ 
      success: false, 
      message: `❌ خطا: ${error.message}` 
    });
  }
});

// ============================================================
// ========== Parse Action ==========
// ============================================================

function parseAction(reply) {
  if (!reply) return null;
  
  const lower = reply.toLowerCase();
  
  // DELETE ALL
  if (lower.includes('delete all') || lower.includes('حذف همه') || 
      lower.includes('remove all') || lower.includes('پاک کن همه') ||
      lower.includes('همه پنل')) {
    return { type: 'delete_all' };
  }
  
  // DELETE SPECIFIC
  if (lower.includes('delete') || lower.includes('حذف') || 
      lower.includes('remove') || lower.includes('پاک کن')) {
    
    let name = null;
    const match = reply.match(/["']([^"']*)["']/);
    if (match) name = match[1];
    
    if (!name) {
      const regex = /(?:delete|حذف|remove|پاک\s+کن)\s+(?:panel|پنل)?\s*["']?([^\s,،.]+)["']?/i;
      const m = reply.match(regex);
      if (m) name = m[1];
    }
    
    if (name) {
      return { type: 'delete_panel', data: { name: name.trim() } };
    }
  }
  
  // CREATE PANEL
  if (lower.includes('create') || lower.includes('ساخت') || 
      lower.includes('make') || lower.includes('بساز') || 
      lower.includes('new') || lower.includes('جدید')) {
    
    let name = 'پنل جدید';
    let days = 30;
    let storage = 100;
    let users = 10;
    
    const nameMatch = reply.match(/["']([^"']*)["']/);
    if (nameMatch) name = nameMatch[1];
    
    if (!nameMatch) {
      const regex = /(?:create|ساخت|make|بساز)\s+(?:panel|پنل)?\s*["']?([^\s,،.]+)["']?/i;
      const m = reply.match(regex);
      if (m) name = m[1];
    }
    
    const daysMatch = reply.match(/(\d+)\s*(?:days?|روز)/i);
    if (daysMatch) days = parseInt(daysMatch[1]);
    
    const storageMatch = reply.match(/(\d+)\s*(?:GB|گیگ|gig)/i);
    if (storageMatch) storage = parseInt(storageMatch[1]);
    
    const usersMatch = reply.match(/(\d+)\s*(?:users?|کاربر)/i);
    if (usersMatch) users = parseInt(usersMatch[1]);
    
    return { 
      type: 'create_panel', 
      data: { name: name.trim(), days, storage, users } 
    };
  }
  
  // CHANGE THEME
  if (lower.includes('theme') || lower.includes('تم') || 
      lower.includes('color') || lower.includes('رنگ')) {
    
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
        if (lower.includes(kw)) {
          return { type: 'change_theme', data: { color } };
        }
      }
    }
  }
  
  // CHANGE MODE
  if (lower.includes('dark') || lower.includes('تاریک')) {
    return { type: 'change_mode', data: { mode: 'dark' } };
  }
  if (lower.includes('light') || lower.includes('روشن')) {
    return { type: 'change_mode', data: { mode: 'light' } };
  }
  
  return null;
}

// ============================================================
// ========== Execute Action ==========
// ============================================================

function executeAction(action) {
  if (!action) return null;
  
  try {
    switch(action.type) {
      case 'delete_all': {
        const count = panels.length;
        panels = [];
        return { success: true, message: `✅ ${count} پنل با موفقیت حذف شدند` };
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
        } else {
          return { success: false, message: `❌ پنل "${name}" یافت نشد` };
        }
      }
      
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
      
      default:
        return { success: false, message: '❌ دستور ناشناخته' };
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
