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

// ========== AI Chat با دسترسی کامل به پنل ==========
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
    // ===== اطلاعات کامل پنل برای هوش مصنوعی =====
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
      status: p.status,
      color: p.panelSettings?.color || 'blue',
      mode: p.panelSettings?.mode || 'light',
      showDns: p.panelSettings?.showDns !== false,
      showFlags: p.panelSettings?.showFlags !== false,
      compact: p.panelSettings?.compact || false
    }));

    // ===== سیستم پرامپت با دسترسی کامل =====
    const systemPrompt = `You are a SUPER ADMIN AI with FULL ACCESS to the DNS Management Panel.
You can do ANYTHING that the user can do in the dashboard.

📋 CURRENT PANELS (${panels.length} panels):
${panelsInfo.length > 0 ? JSON.stringify(panelsInfo, null, 2) : 'No panels created yet.'}

🔧 YOUR CAPABILITIES (YOU HAVE FULL ACCESS):

1. CREATE PANEL:
   - "create panel [name] with [days] days, [storage] GB, [users] users"
   - Example: "create panel Germany with 30 days, 100 GB, 10 users"
   - You can also set country: "create panel Turkey with 45 days, 200 GB, 15 users, country turkey"

2. EDIT PANEL (ANY FIELD):
   - Change storage: "reduce storage of [panel_name] by [X] GB" or "set storage of [panel_name] to [X] GB"
   - Add days: "add [X] days to [panel_name]" or "extend [panel_name] by [X] days"
   - Change users: "change users of [panel_name] to [X]" or "add [X] users to [panel_name]"
   - Change name: "rename [panel_name] to [new_name]"
   - Change country: "change country of [panel_name] to [country]"

3. DELETE PANEL:
   - "delete panel [panel_name]" or "remove [panel_name]"

4. TOGGLE STATUS:
   - "activate [panel_name]" or "deactivate [panel_name]"
   - "enable [panel_name]" or "disable [panel_name]"

5. CHANGE PANEL SETTINGS:
   - Change theme: "change [panel_name] theme to [color]" (colors: blue, purple, green, rose, brown, red, orange, teal)
   - Change mode: "make [panel_name] dark" or "make [panel_name] light"
   - Toggle DNS display: "hide dns of [panel_name]" or "show dns of [panel_name]"
   - Toggle flags: "hide flags of [panel_name]" or "show flags of [panel_name]"
   - Compact mode: "make [panel_name] compact" or "make [panel_name] normal"

6. VIEW INFORMATION:
   - "show all panels" or "list panels"
   - "show details of [panel_name]"
   - "show storage of [panel_name]"
   - "show status of [panel_name]"

7. DNS MANAGEMENT:
   - "show dns of [panel_name]"
   - "copy dns of [panel_name]"

⚠️ IMPORTANT RULES:
- You have FULL ADMIN ACCESS - you can do ANYTHING
- When user asks to change something, DO IT immediately
- Always confirm what you changed
- If a panel doesn't exist, say so and suggest alternatives
- Be helpful, friendly, and proactive
- Suggest optimizations if you see issues (like low storage, expiring panels)

🌟 EXAMPLES OF WHAT YOU CAN DO:
- User: "حجم پنل آلمان رو کم کن به 50 گیگ" → You: Change storage of "آلمان" to 50 GB
- User: "پنل ترکیه رو 20 روز دیگه تمدید کن" → You: Add 20 days to "ترکیه"
- User: "تم پنل من رو قهوه‌ای کن" → You: Change theme of "پنل من" to brown
- User: "پنل امریکا رو غیرفعال کن" → You: Deactivate "امریکا"

Always respond in the SAME LANGUAGE as the user.
Be concise, clear, and confirm every action.`;

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
        max_tokens: 800
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
    
    // ===== اجرای دستورات هوش مصنوعی =====
    const action = parseAIActionWithFullAccess(reply, panels);
    
    // اجرای اکشن
    let actionResult = null;
    if (action) {
      actionResult = await executeAction(action);
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
    console.error('AI Error:', error);
    res.json({ 
      success: false, 
      message: `❌ خطا: ${error.message}`
    });
  }
});

// ========== PARSER با دسترسی کامل ==========
function parseAIActionWithFullAccess(reply, panels) {
  const lower = reply.toLowerCase();
  
  // ===== 1. CREATE PANEL =====
  if (lower.includes('create panel') || lower.includes('ساخت پنل') || 
      lower.includes('create a panel') || lower.includes('پنل جدید')) {
    
    const nameMatch = reply.match(/["']([^"']*)["']/);
    let name = nameMatch ? nameMatch[1] : 'پنل جدید';
    
    // اگر اسم تو متن بود بدون نقل قول
    if (!nameMatch) {
      const nameRegex = /(?:create|ساخت|make|ایجاد)\s+(?:panel|پنل)\s+([^\s,،]+)/i;
      const nMatch = reply.match(nameRegex);
      if (nMatch) name = nMatch[1];
    }
    
    const daysMatch = reply.match(/(\d+)\s*(?:days?|روز)/i);
    const days = daysMatch ? parseInt(daysMatch[1]) : 30;
    
    const storageMatch = reply.match(/(\d+)\s*(?:GB|گیگ)/i);
    const storage = storageMatch ? parseInt(storageMatch[1]) : 100;
    
    const usersMatch = reply.match(/(\d+)\s*(?:users?|کاربر)/i);
    const users = usersMatch ? parseInt(usersMatch[1]) : 10;
    
    // کشور
    let country = null;
    const countryMap = {
      'آلمان': 'germany', 'germany': 'germany',
      'ترکیه': 'turkey', 'turkey': 'turkey',
      'هلند': 'netherlands', 'netherlands': 'netherlands',
      'دانمارک': 'denmark', 'denmark': 'denmark',
      'امارات': 'uae', 'uae': 'uae'
    };
    for (const [key, val] of Object.entries(countryMap)) {
      if (lower.includes(key)) {
        country = val;
        break;
      }
    }
    
    return {
      type: 'create_panel',
      data: { name, days, storage, users, country }
    };
  }
  
  // ===== 2. DELETE PANEL =====
  if (lower.includes('delete') || lower.includes('حذف') || lower.includes('remove')) {
    const nameMatch = reply.match(/["']([^"']*)["']/);
    let name = nameMatch ? nameMatch[1] : null;
    
    if (!nameMatch) {
      const delRegex = /(?:delete|حذف|remove)\s+(?:panel|پنل)\s+([^\s,،.]+)/i;
      const dMatch = reply.match(delRegex);
      if (dMatch) name = dMatch[1];
    }
    
    if (name) {
      // پیدا کردن پنل با اسم یا slug
      const panel = panels.find(p => 
        p.name === name || 
        p.slug === name || 
        p.name.includes(name) ||
        p.slug.includes(name)
      );
      if (panel) {
        return { type: 'delete_panel', data: { id: panel.id, name: panel.name } };
      }
    }
  }
  
  // ===== 3. TOGGLE STATUS =====
  if (lower.includes('activate') || lower.includes('فعال') || 
      lower.includes('enable') || lower.includes('روشن')) {
    if (!lower.includes('deactivate') && !lower.includes('غیرفعال') && !lower.includes('disable')) {
      const nameMatch = reply.match(/["']([^"']*)["']/);
      let name = nameMatch ? nameMatch[1] : null;
      if (!nameMatch) {
        const actRegex = /(?:activate|فعال|enable|روشن)\s+(?:panel|پنل)\s+([^\s,،.]+)/i;
        const aMatch = reply.match(actRegex);
        if (aMatch) name = aMatch[1];
      }
      if (name) {
        const panel = findPanel(name, panels);
        if (panel && panel.status === 'inactive') {
          return { type: 'toggle_panel', data: { id: panel.id, status: 'active' } };
        }
      }
    }
  }
  
  if (lower.includes('deactivate') || lower.includes('غیرفعال') || 
      lower.includes('disable') || lower.includes('خاموش')) {
    const nameMatch = reply.match(/["']([^"']*)["']/);
    let name = nameMatch ? nameMatch[1] : null;
    if (!nameMatch) {
      const deactRegex = /(?:deactivate|غیرفعال|disable|خاموش)\s+(?:panel|پنل)\s+([^\s,،.]+)/i;
      const dMatch = reply.match(deactRegex);
      if (dMatch) name = dMatch[1];
    }
    if (name) {
      const panel = findPanel(name, panels);
      if (panel && panel.status === 'active') {
        return { type: 'toggle_panel', data: { id: panel.id, status: 'inactive' } };
      }
    }
  }
  
  // ===== 4. CHANGE STORAGE =====
  if (lower.includes('storage') || lower.includes('حجم')) {
    const nameMatch = reply.match(/["']([^"']*)["']/);
    let name = nameMatch ? nameMatch[1] : null;
    
    if (!nameMatch) {
      const storageRegex = /(?:storage|حجم)\s+(?:of|پنل)\s+([^\s,،]+)/i;
      const sMatch = reply.match(storageRegex);
      if (sMatch) name = sMatch[1];
    }
    
    if (name) {
      const panel = findPanel(name, panels);
      if (panel) {
        // کاهش یا افزایش
        let newStorage = null;
        let reduceBy = null;
        
        const setMatch = reply.match(/set\s+to\s+(\d+)/i) || reply.match(/(\d+)\s*GB/i);
        if (setMatch) {
          newStorage = parseInt(setMatch[1]);
        }
        
        const reduceMatch = reply.match(/reduce\s+by\s+(\d+)/i) || reply.match(/کم\s+کن\s+(\d+)/i);
        if (reduceMatch) {
          reduceBy = parseInt(reduceMatch[1]);
        }
        
        if (newStorage) {
          return { type: 'edit_panel', data: { id: panel.id, storage: newStorage } };
        } else if (reduceBy) {
          const newVal = Math.max(0, (panel.storage || 0) - reduceBy);
          return { type: 'edit_panel', data: { id: panel.id, storage: newVal } };
        }
      }
    }
  }
  
  // ===== 5. CHANGE THEME =====
  if (lower.includes('theme') || lower.includes('تم') || 
      lower.includes('color') || lower.includes('رنگ')) {
    
    let name = null;
    let color = null;
    
    // پیدا کردن اسم پنل
    const nameMatch = reply.match(/["']([^"']*)["']/);
    if (nameMatch) name = nameMatch[1];
    
    if (!name) {
      const themeRegex = /(?:theme|تم|color|رنگ)\s+(?:of|پنل)\s+([^\s,،]+)/i;
      const tMatch = reply.match(themeRegex);
      if (tMatch) name = tMatch[1];
    }
    
    // پیدا کردن رنگ
    const colorMap = {
      'blue': 'blue', 'آبی': 'blue',
      'purple': 'purple', 'بنفش': 'purple',
      'green': 'green', 'سبز': 'green',
      'rose': 'rose', 'صورتی': 'rose', 'pink': 'rose',
      'brown': 'brown', 'قهوه ای': 'brown', 'قهوه‌ای': 'brown',
      'red': 'red', 'قرمز': 'red',
      'orange': 'orange', 'نارنجی': 'orange',
      'teal': 'teal', 'فیروزه ای': 'teal', 'فیروزه‌ای': 'teal'
    };
    
    for (const [key, val] of Object.entries(colorMap)) {
      if (lower.includes(key)) {
        color = val;
        break;
      }
    }
    
    if (name && color) {
      const panel = findPanel(name, panels);
      if (panel) {
        return { 
          type: 'edit_panel_settings', 
          data: { id: panel.id, settings: { color: color } } 
        };
      }
    }
  }
  
  // ===== 6. CHANGE MODE =====
  if (lower.includes('dark') || lower.includes('تاریک') || 
      lower.includes('light') || lower.includes('روشن')) {
    
    let name = null;
    let mode = null;
    
    const nameMatch = reply.match(/["']([^"']*)["']/);
    if (nameMatch) name = nameMatch[1];
    
    if (!name) {
      const modeRegex = /(?:mode|حالت)\s+(?:of|پنل)\s+([^\s,،]+)/i;
      const mMatch = reply.match(modeRegex);
      if (mMatch) name = mMatch[1];
    }
    
    if (lower.includes('dark') || lower.includes('تاریک')) mode = 'dark';
    if (lower.includes('light') || lower.includes('روشن')) mode = 'light';
    
    if (name && mode) {
      const panel = findPanel(name, panels);
      if (panel) {
        return { 
          type: 'edit_panel_settings', 
          data: { id: panel.id, settings: { mode: mode } } 
        };
      }
    }
  }
  
  // ===== 7. ADD DAYS =====
  if (lower.includes('add days') || lower.includes('تمدید') || 
      lower.includes('extend') || lower.includes('اضافه کن')) {
    
    const nameMatch = reply.match(/["']([^"']*)["']/);
    let name = nameMatch ? nameMatch[1] : null;
    
    if (!name) {
      const dayRegex = /(?:add|تمدید|extend)\s+(?:days|روز)\s+(?:to|پنل)\s+([^\s,،]+)/i;
      const dMatch = reply.match(dayRegex);
      if (dMatch) name = dMatch[1];
    }
    
    const daysMatch = reply.match(/(\d+)\s*(?:days?|روز)/i);
    const days = daysMatch ? parseInt(daysMatch[1]) : null;
    
    if (name && days) {
      const panel = findPanel(name, panels);
      if (panel) {
        const newDays = (panel.remainingDays || 0) + days;
        return { 
          type: 'edit_panel', 
          data: { id: panel.id, remainingDays: newDays, days: (panel.days || 0) + days } 
        };
      }
    }
  }
  
  // ===== 8. CHANGE USERS =====
  if (lower.includes('users') || lower.includes('کاربر')) {
    const nameMatch = reply.match(/["']([^"']*)["']/);
    let name = nameMatch ? nameMatch[1] : null;
    
    if (!name) {
      const userRegex = /(?:users|کاربر)\s+(?:of|پنل)\s+([^\s,،]+)/i;
      const uMatch = reply.match(userRegex);
      if (uMatch) name = uMatch[1];
    }
    
    const usersMatch = reply.match(/(\d+)\s*(?:users?|کاربر)/i);
    const users = usersMatch ? parseInt(usersMatch[1]) : null;
    
    if (name && users) {
      const panel = findPanel(name, panels);
      if (panel) {
        return { 
          type: 'edit_panel', 
          data: { id: panel.id, users: users } 
        };
      }
    }
  }
  
  return null;
}

// ========== پیدا کردن پنل ==========
function findPanel(name, panels) {
  if (!name) return null;
  name = name.trim().toLowerCase();
  
  return panels.find(p => 
    p.name.toLowerCase() === name ||
    p.slug.toLowerCase() === name ||
    p.name.toLowerCase().includes(name) ||
    p.slug.toLowerCase().includes(name)
  );
}

// ========== اجرای اکشن ==========
async function executeAction(action) {
  if (!action) return null;
  
  try {
    switch(action.type) {
      case 'create_panel': {
        const data = action.data;
        const country = data.country || 'germany';
        const slug = generateSlug(data.name);
        
        const newPanel = {
          id: Date.now(),
          name: data.name,
          slug: slug,
          days: data.days,
          remainingDays: data.days,
          storage: data.storage,
          usedStorage: 0,
          users: data.users,
          countries: [country],
          dns: ['10.202.10.10', '114.114.114.114'],
          dnsService: 'radar',
          dnsServiceName: 'رادار',
          countryName: country,
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
        return { success: true, panel: newPanel, message: `✅ پنل "${data.name}" ساخته شد` };
      }
      
      case 'delete_panel': {
        const id = action.data.id;
        panels = panels.filter(p => p.id !== id);
        return { success: true, message: `✅ پنل "${action.data.name}" حذف شد` };
      }
      
      case 'toggle_panel': {
        const id = action.data.id;
        const index = panels.findIndex(p => p.id === id);
        if (index === -1) return { success: false, message: 'پنل یافت نشد' };
        panels[index].status = action.data.status;
        return { success: true, message: `✅ وضعیت پنل به ${action.data.status === 'active' ? 'فعال' : 'غیرفعال'} تغییر کرد` };
      }
      
      case 'edit_panel': {
        const id = action.data.id;
        const index = panels.findIndex(p => p.id === id);
        if (index === -1) return { success: false, message: 'پنل یافت نشد' };
        panels[index] = { ...panels[index], ...action.data };
        return { success: true, message: `✅ پنل ویرایش شد` };
      }
      
      case 'edit_panel_settings': {
        const id = action.data.id;
        const index = panels.findIndex(p => p.id === id);
        if (index === -1) return { success: false, message: 'پنل یافت نشد' };
        if (!panels[index].panelSettings) panels[index].panelSettings = {};
        panels[index].panelSettings = { ...panels[index].panelSettings, ...action.data.settings };
        return { success: true, message: `✅ تنظیمات پنل ویرایش شد` };
      }
      
      default:
        return { success: false, message: 'دستور نامشخص' };
    }
  } catch (error) {
    return { success: false, message: `❌ خطا: ${error.message}` };
  }
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
});
