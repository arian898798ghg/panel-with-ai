const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

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

// ========== AI Chat با دسترسی کامل ==========
app.post('/api/ai/chat', async (req, res) => {
  const { message } = req.body;
  
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
      id: p.id,
      name: p.name,
      slug: p.slug,
      days: p.days,
      remainingDays: p.remainingDays,
      storage: p.storage,
      usedStorage: p.usedStorage || 0,
      users: p.users,
      country: p.countryName || p.countries?.[0] || 'N/A',
      dns: p.dns || [],
      dnsService: p.dnsServiceName || 'N/A',
      status: p.status
    }));

    const systemPrompt = `You are a SUPER ADMIN AI with FULL ACCESS to the DNS Management Panel.

📋 CURRENT PANELS (${panels.length} panels):
${panelsInfo.length > 0 ? JSON.stringify(panelsInfo, null, 2) : 'No panels created yet.'}

🔧 YOUR CAPABILITIES:

1. DELETE PANEL:
   - "delete [panel_name]" or "حذف [panel_name]"
   - "remove [panel_name]" or "پاک کن [panel_name]"
   - "delete all panels" or "همه پنل‌ها رو حذف کن"

2. CREATE PANEL:
   - "create panel [name] with [days] days, [storage] GB, [users] users"
   - "ساخت پنل [name] با [days] روز، [storage] گیگ، [users] کاربر"

3. EDIT PANEL:
   - "change storage of [name] to [X] GB"
   - "add [X] days to [name]"

4. TOGGLE:
   - "activate [name]" or "فعال کن [name]"
   - "deactivate [name]" or "غیرفعال کن [name]"

5. THEME:
   - "change [name] theme to [color]"

IMPORTANT: 
- When user says "delete", ACTUALLY DELETE the panel
- When user says "create", ACTUALLY CREATE the panel
- Always confirm what you did`;

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
      console.error('AI API Error:', data);
      return res.json({ 
        success: false, 
        message: `❌ خطا: ${data.error?.message || 'Unknown error'}`
      });
    }
    
    const reply = data.choices[0].message.content;
    console.log('🤖 AI Reply:', reply);
    
    const action = parseAndExecuteAction(reply);
    
    let actionResult = null;
    if (action) {
      console.log('⚡ Executing action:', action);
      actionResult = await executeActionDirect(action);
      console.log('📊 Action result:', actionResult);
    }
    
    aiHistory.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
    aiHistory.push({ role: 'assistant', content: reply, timestamp: new Date().toISOString() });
    
    res.json({ 
      success: true, 
      message: reply,
      action: action,
      actionResult: actionResult
    });
    
  } catch (error) {
    console.error('❌ AI Error:', error);
    res.json({ 
      success: false, 
      message: `❌ خطا: ${error.message}`
    });
  }
});

// ========== پردازش اکشن ==========
function parseAndExecuteAction(reply) {
  const lower = reply.toLowerCase();
  
  // DELETE ALL PANELS
  if (lower.includes('delete all') || lower.includes('حذف همه') || 
      lower.includes('remove all') || lower.includes('پاک کن همه') ||
      lower.includes('همه پنل‌ها رو حذف')) {
    return { type: 'delete_all_panels' };
  }
  
  // DELETE SPECIFIC PANEL
  if (lower.includes('delete') || lower.includes('حذف') || 
      lower.includes('remove') || lower.includes('پاک کن')) {
    
    let panelName = null;
    const quoteMatch = reply.match(/["']([^"']*)["']/);
    if (quoteMatch) panelName = quoteMatch[1];
    
    if (!panelName) {
      const deleteRegex = /(?:delete|حذف|remove|پاک\s+کن)\s+(?:panel|پنل)?\s*([^\s,،.]+)/i;
      const dMatch = reply.match(deleteRegex);
      if (dMatch) panelName = dMatch[1];
    }
    
    if (panelName) {
      const panel = findPanelByName(panelName);
      if (panel) {
        return { type: 'delete_panel', data: { id: panel.id, name: panel.name } };
      }
    }
  }
  
  // CREATE PANEL
  if (lower.includes('create panel') || lower.includes('ساخت پنل') || 
      lower.includes('make panel') || lower.includes('پنل جدید')) {
    
    let name = 'پنل جدید';
    let days = 30;
    let storage = 100;
    let users = 10;
    
    const nameMatch = reply.match(/["']([^"']*)["']/);
    if (nameMatch) name = nameMatch[1];
    
    if (!nameMatch) {
      const nameRegex = /(?:create|ساخت|make)\s+(?:panel|پنل)\s+([^\s,،]+)/i;
      const nMatch = reply.match(nameRegex);
      if (nMatch) name = nMatch[1];
    }
    
    const daysMatch = reply.match(/(\d+)\s*(?:days?|روز)/i);
    if (daysMatch) days = parseInt(daysMatch[1]);
    
    const storageMatch = reply.match(/(\d+)\s*(?:GB|گیگ)/i);
    if (storageMatch) storage = parseInt(storageMatch[1]);
    
    const usersMatch = reply.match(/(\d+)\s*(?:users?|کاربر)/i);
    if (usersMatch) users = parseInt(usersMatch[1]);
    
    return { 
      type: 'create_panel', 
      data: { name, days, storage, users } 
    };
  }
  
  return null;
}

// ========== پیدا کردن پنل ==========
function findPanelByName(name) {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  
  return panels.find(p => 
    p.name.toLowerCase() === n ||
    p.slug.toLowerCase() === n ||
    p.name.toLowerCase().includes(n) ||
    p.slug.toLowerCase().includes(n)
  );
}

// ========== اجرای اکشن ==========
function executeActionDirect(action) {
  return new Promise((resolve) => {
    try {
      switch(action.type) {
        case 'delete_all_panels': {
          const count = panels.length;
          panels = [];
          resolve({ 
            success: true, 
            message: `✅ ${count} پنل با موفقیت حذف شدند`
          });
          break;
        }
        
        case 'delete_panel': {
          const id = action.data.id;
          const panel = panels.find(p => p.id === id);
          if (!panel) {
            resolve({ success: false, message: '❌ پنل یافت نشد' });
            break;
          }
          const name = panel.name;
          panels = panels.filter(p => p.id !== id);
          resolve({ 
            success: true, 
            message: `✅ پنل "${name}" با موفقیت حذف شد`
          });
          break;
        }
        
        case 'create_panel': {
          const data = action.data;
          const slug = generateSlug(data.name);
          
          const exists = panels.some(p => p.slug === slug);
          const finalSlug = exists ? slug + '-' + Date.now().toString().slice(-4) : slug;
          
          const newPanel = {
            id: Date.now(),
            name: data.name,
            slug: finalSlug,
            days: data.days,
            remainingDays: data.days,
            storage: data.storage,
            usedStorage: 0,
            users: data.users,
            countries: ['germany'],
            dns: ['10.202.10.10', '114.114.114.114'],
            dnsService: 'radar',
            dnsServiceName: 'رادار',
            countryName: 'آلمان',
            status: 'active',
            panelSettings: {
              color: 'blue',
              mode: 'light',
              showDns: true,
              showFlags: true,
              compact: false
            }
          };
          
          panels.unshift(newPanel);
          resolve({ 
            success: true, 
            message: `✅ پنل "${data.name}" با موفقیت ساخته شد`
          });
          break;
        }
        
        default: {
          resolve({ success: false, message: '❌ دستور ناشناخته' });
        }
      }
    } catch (error) {
      resolve({ success: false, message: `❌ خطا: ${error.message}` });
    }
  });
}

// ========== GENERATE SLUG ==========
function generateSlug(name) {
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

// ========== SERVE PANEL PAGE ==========
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
    <head>
      <meta charset="UTF-8">
      <title>${panel.name}</title>
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
