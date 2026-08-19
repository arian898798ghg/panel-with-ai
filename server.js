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
// ========== هوش مصنوعی فوق‌قوی با اجرای کامل ==========
// ============================================================

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

    // ===== سیستم پرامپت قوی =====
    const systemPrompt = `You are a SUPER AI with FULL CONTROL over a DNS management panel.

📋 CURRENT PANELS (${panels.length} panels):
${panelsInfo.length > 0 ? JSON.stringify(panelsInfo, null, 2) : '⚠️ No panels exist yet.'}

🔧 YOUR POWERS - YOU CAN DO ANYTHING:

1️⃣ CREATE PANEL:
   - When user says "create", "make", "build", "ساخت", "بساز"
   - Extract: name, days, storage (GB), users
   - Defaults: name="Panel", days=30, storage=100, users=10
   - Return: ACTION:CREATE:name:days:storage:users

2️⃣ DELETE PANEL:
   - When user says "delete", "remove", "حذف", "پاک کن"
   - Find panel by name
   - Return: ACTION:DELETE:panel_name

3️⃣ DELETE ALL:
   - When user says "delete all", "حذف همه"
   - Return: ACTION:DELETE_ALL

4️⃣ CHANGE THEME:
   - When user says "theme", "color", "تم", "رنگ"
   - Extract color: blue, purple, green, rose, brown, red, orange, teal
   - Return: ACTION:THEME:color

5️⃣ CHANGE MODE:
   - When user says "dark", "تاریک" → ACTION:MODE:dark
   - When user says "light", "روشن" → ACTION:MODE:light

6️⃣ LIST PANELS:
   - When user says "list", "show", "لیست", "نمایش"
   - Return: ACTION:LIST

7️⃣ CHANGE STORAGE:
   - When user says "change storage", "حجم", "کم کن", "زیاد کن"
   - Return: ACTION:STORAGE:panel_name:new_amount

8️⃣ ADD DAYS:
   - When user says "add days", "تمدید", "extend"
   - Return: ACTION:DAYS:panel_name:number_of_days

9️⃣ CHANGE USERS:
   - When user says "change users", "کاربر"
   - Return: ACTION:USERS:panel_name:new_count

🚨 CRITICAL RULES:
- You MUST EXECUTE what the user asks
- If user says "delete", DELETE it
- If user says "create", CREATE it
- ALWAYS return an ACTION: command
- Reply in the SAME LANGUAGE as the user
- Be friendly and confirm every action
- Suggest optimizations if needed

User request: "${message}"

Return your response with an ACTION: command.`;

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
    
    const reply = data.choices[0].message.content;
    console.log('🤖 پاسخ AI:', reply);
    
    // ===== استخراج و اجرای ACTION =====
    const action = extractAction(reply);
    let actionResult = null;
    
    if (action) {
      console.log('⚡ اجرای اکشن:', action);
      actionResult = executeAction(action);
      console.log('📊 نتیجه:', actionResult);
    }
    
    // ذخیره تاریخچه
    aiHistory.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
    aiHistory.push({ role: 'assistant', content: reply, timestamp: new Date().toISOString() });
    
    // اگر اکشن اجرا شد و نتیجه داشت، پیام رو با نتیجه ترکیب کن
    let finalMessage = reply;
    if (actionResult && actionResult.success) {
      // اگه پاسخ AI شامل پیام نبود، از نتیجه استفاده کن
      if (!reply.includes('✅') && !reply.includes('❌')) {
        finalMessage = actionResult.message;
      } else {
        // اگه پاسخ AI پیام داشت، ولی نتیجه هم داشت، نتیجه رو هم اضافه کن
        finalMessage = reply + '\n\n' + actionResult.message;
      }
    } else if (actionResult && !actionResult.success) {
      finalMessage = reply + '\n\n❌ ' + actionResult.message;
    }
    
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
// ========== استخراج ACTION از پاسخ ==========
// ============================================================

function extractAction(reply) {
  if (!reply) return null;
  
  const lines = reply.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('ACTION:')) {
      const parts = trimmed.replace('ACTION:', '').split(':');
      const type = parts[0].toLowerCase();
      
      switch(type) {
        case 'create':
          return { 
            type: 'create_panel', 
            data: { 
              name: parts[1] || 'پنل جدید', 
              days: parseInt(parts[2]) || 30, 
              storage: parseInt(parts[3]) || 100, 
              users: parseInt(parts[4]) || 10 
            } 
          };
        case 'delete':
          return { type: 'delete_panel', data: { name: parts[1] } };
        case 'delete_all':
          return { type: 'delete_all' };
        case 'theme':
          return { type: 'change_theme', data: { color: parts[1] || 'blue' } };
        case 'mode':
          return { type: 'change_mode', data: { mode: parts[1] || 'light' } };
        case 'list':
          return { type: 'list_panels' };
        case 'storage':
          return { type: 'change_storage', data: { name: parts[1], amount: parseInt(parts[2]) || 0 } };
        case 'days':
          return { type: 'add_days', data: { name: parts[1], days: parseInt(parts[2]) || 0 } };
        case 'users':
          return { type: 'change_users', data: { name: parts[1], users: parseInt(parts[2]) || 0 } };
        default:
          return null;
      }
    }
  }
  
  // اگر ACTION پیدا نشد، سعی کن از خود متن تشخیص بدی
  return detectActionFromText(reply);
}

// ============================================================
// ========== تشخیص ACTION از متن (Fallback) ==========
// ============================================================

function detectActionFromText(text) {
  const lower = text.toLowerCase();
  
  // ساخت پنل
  if (lower.includes('create') || lower.includes('ساخت') || lower.includes('بساز')) {
    const nameMatch = text.match(/["']([^"']*)["']/);
    const name = nameMatch ? nameMatch[1] : 'پنل جدید';
    const daysMatch = text.match(/(\d+)\s*(?:days?|روز)/i);
    const days = daysMatch ? parseInt(daysMatch[1]) : 30;
    const storageMatch = text.match(/(\d+)\s*(?:GB|گیگ)/i);
    const storage = storageMatch ? parseInt(storageMatch[1]) : 100;
    const usersMatch = text.match(/(\d+)\s*(?:users?|کاربر)/i);
    const users = usersMatch ? parseInt(usersMatch[1]) : 10;
    return { type: 'create_panel', data: { name, days, storage, users } };
  }
  
  // حذف همه
  if (lower.includes('delete all') || lower.includes('حذف همه')) {
    return { type: 'delete_all' };
  }
  
  // حذف
  if (lower.includes('delete') || lower.includes('حذف') || lower.includes('پاک کن')) {
    const nameMatch = text.match(/["']([^"']*)["']/);
    const name = nameMatch ? nameMatch[1] : null;
    if (name) {
      return { type: 'delete_panel', data: { name } };
    }
    // اسم بعد از کلمه حذف
    const regex = /(?:delete|حذف|پاک\s+کن)\s+(?:panel|پنل)?\s*["']?([^\s,،.]+)["']?/i;
    const match = text.match(regex);
    if (match && match[1]) {
      return { type: 'delete_panel', data: { name: match[1] } };
    }
  }
  
  // تم
  if (lower.includes('theme') || lower.includes('تم') || lower.includes('رنگ')) {
    const colors = ['blue', 'purple', 'green', 'rose', 'brown', 'red', 'orange', 'teal'];
    const colorNames = {
      'آبی': 'blue', 'بنفش': 'purple', 'سبز': 'green', 'صورتی': 'rose',
      'قهوه ای': 'brown', 'قهوه‌ای': 'brown', 'قرمز': 'red',
      'نارنجی': 'orange', 'فیروزه ای': 'teal', 'فیروزه‌ای': 'teal'
    };
    for (const [key, val] of Object.entries(colorNames)) {
      if (lower.includes(key)) {
        return { type: 'change_theme', data: { color: val } };
      }
    }
  }
  
  // حالت
  if (lower.includes('dark') || lower.includes('تاریک')) {
    return { type: 'change_mode', data: { mode: 'dark' } };
  }
  if (lower.includes('light') || lower.includes('روشن')) {
    return { type: 'change_mode', data: { mode: 'light' } };
  }
  
  // لیست
  if (lower.includes('list') || lower.includes('لیست') || lower.includes('نمایش')) {
    return { type: 'list_panels' };
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
      
      case 'change_users': {
        const { name, users } = action.data;
        const panel = panels.find(p => p.name.toLowerCase() === name.toLowerCase());
        if (panel) {
          panel.users = users;
          return { success: true, message: `✅ کاربران پنل "${name}" به ${users} تغییر کرد` };
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
    return res.sendFile(path.join(__dirname, 'public', '404.html'));
  }
  
  // اگر panel.html وجود نداشت، یه صفحه ساده نشون بده
  try {
    let html = require('fs').readFileSync(path.join(__dirname, 'public', 'panel.html'), 'utf8');
    html = html.replace(/\{\{slug\}\}/g, slug);
    html = html.replace(/\{\{panelName\}\}/g, panel.name);
    html = html.replace(/\{\{panelData\}\}/g, JSON.stringify(panel));
    res.send(html);
  } catch(e) {
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
  }
});

// ========== START SERVER ==========
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Login: http://localhost:${PORT}`);
  console.log(`🔑 Username: ${process.env.ADMIN_USERNAME || 'admin'}`);
  console.log(`🔑 Password: ${process.env.ADMIN_PASSWORD || 'admin'}`);
});
