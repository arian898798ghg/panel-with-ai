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

// ========== تولید اسلاگ رندوم ==========
function generateRandomSlug(length = 4) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

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
  
  // اگر اسلاگ نداشت، رندوم بساز
  if (!panel.slug) {
    panel.slug = generateRandomSlug(4);
  }
  
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
// ========== هوش مصنوعی ==========
// ============================================================

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
      status: p.status,
      color: p.panelSettings?.color || 'blue',
      mode: p.panelSettings?.mode || 'light',
      slug: p.slug
    }));

    const systemPrompt = `You are a friendly AI assistant for a DNS management panel.

📋 CURRENT PANELS (${panels.length} panels):
${panelsInfo.length > 0 ? JSON.stringify(panelsInfo, null, 2) : '⚠️ No panels yet.'}

🎨 AVAILABLE COLORS: blue, purple, green, rose, brown, red, orange, teal

🔧 WHAT YOU CAN DO:
- Create panels (with random slug like "x7k3")
- Delete panels
- Change theme/color
- Change mode (dark/light)
- List panels
- Change storage
- Add days

🚨 RULES:
1. If user asks a QUESTION, just ANSWER the question
2. If user makes a JOKE, respond with a friendly joke
3. ONLY execute commands when user clearly asks to DO something
4. When creating a panel, use a random 4-character slug
5. Be friendly and respond in the SAME language as the user

User: "${message}"

Respond in a friendly way.`;

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
        max_tokens: 400
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
    
    let reply = data.choices?.[0]?.message?.content || 'سلام! چطور می‌توانم کمک کنم؟';
    console.log('🤖 پاسخ AI:', reply);
    
    const isCommand = isRealCommand(message);
    let actionResult = null;
    
    if (isCommand) {
      const action = extractActionFromText(reply + ' ' + message);
      if (action) {
        console.log('⚡ اجرای اکشن:', action);
        actionResult = executeAction(action);
        console.log('📊 نتیجه:', actionResult);
      }
    }
    
    let finalMessage = reply;
    finalMessage = finalMessage.replace(/ACTION:[^\s]*/g, '').trim();
    
    if (actionResult) {
      if (actionResult.success) {
        if (!reply.includes('✅') && !reply.includes('انجام')) {
          finalMessage = actionResult.message;
        }
      } else {
        finalMessage = actionResult.message;
      }
    }
    
    const colorCheck = checkInvalidColor(message);
    if (colorCheck) {
      finalMessage = colorCheck;
    }
    
    finalMessage = finalMessage.replace(/ACTION:[^\s]*/g, '').trim();
    
    aiHistory.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
    aiHistory.push({ role: 'assistant', content: finalMessage, timestamp: new Date().toISOString() });
    
    res.json({ 
      success: true, 
      message: finalMessage,
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
// ========== توابع کمکی ==========
// ============================================================

function isRealCommand(message) {
  if (!message) return false;
  const lower = message.toLowerCase();
  
  const questionWords = ['؟', '?', 'چطور', 'چگونه', 'چه', 'کی', 'کجا', 'چرا', 'آیا', 'ایا', 
                         'is', 'what', 'how', 'why', 'when', 'where', 'can', 'could', 'would'];
  for (const word of questionWords) {
    if (lower.includes(word)) return false;
  }
  
  const jokeWords = ['کصخله', 'کصخل', 'خنده', 'جک', 'جوک', 'شوخی', 'مزخرف', 'مسخره', 
                     'funny', 'joke', 'laugh', 'stupid', 'dumb'];
  for (const word of jokeWords) {
    if (lower.includes(word)) return false;
  }
  
  const commandWords = ['بساز', 'ساخت', 'create', 'make', 'حذف', 'delete', 'remove', 
                        'پاک', 'تم', 'رنگ', 'theme', 'color', 'تاریک', 'روشن', 'dark', 'light',
                        'لیست', 'list', 'نمایش', 'show', 'تمدید', 'extend', 'حجم', 'storage'];
  for (const word of commandWords) {
    if (lower.includes(word)) return true;
  }
  
  if ((lower.includes('پنل') || lower.includes('کانفینگ') || lower.includes('کانفیگ')) && 
      !lower.includes('؟') && !lower.includes('?')) {
    return true;
  }
  
  return false;
}

function checkInvalidColor(message) {
  if (!message) return null;
  const lower = message.toLowerCase();
  
  if (!lower.includes('رنگ') && !lower.includes('تم') && !lower.includes('color') && !lower.includes('theme')) {
    return null;
  }
  
  const invalidColors = ['طیفانی', 'طوسی', 'خاکستری', 'مشکی', 'طلایی', 'نقره ای', 'زرد', 'کرم', 'سفید', 
                         'طيفانی', 'خاكستری', 'طلایی', 'نقره‌ای'];
  
  for (const word of invalidColors) {
    if (lower.includes(word)) {
      const colorList = '🔵 آبی\n🟣 بنفش\n🟢 سبز\n🌹 صورتی\n🟤 قهوه‌ای\n🔴 قرمز\n🟠 نارنجی\n🩵 فیروزه‌ای';
      return `❌ رنگ "${word}" وجود ندارد. رنگ‌های موجود:\n${colorList}`;
    }
  }
  return null;
}

function extractActionFromText(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  
  // ===== ساخت پنل =====
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
    
    // کشور
    let country = 'germany';
    let countryFlag = '🇩🇪';
    let countryName = 'آلمان';
    const countryMap = {
      'آلمان': { key: 'germany', flag: '🇩🇪', name: 'آلمان' },
      'ترکیه': { key: 'turkey', flag: '🇹🇷', name: 'ترکیه' },
      'هلند': { key: 'netherlands', flag: '🇳🇱', name: 'هلند' },
      'دانمارک': { key: 'denmark', flag: '🇩🇰', name: 'دانمارک' },
      'امارات': { key: 'uae', flag: '🇦🇪', name: 'امارات' },
      'ایران': { key: 'iran', flag: '🇮🇷', name: 'ایران' }
    };
    for (const [key, val] of Object.entries(countryMap)) {
      if (lower.includes(key)) {
        country = val.key;
        countryFlag = val.flag;
        countryName = val.name;
        break;
      }
    }
    
    // اسلاگ رندوم
    const slug = generateRandomSlug(4);
    
    return { 
      type: 'create_panel', 
      data: { name, days, storage, users, country, countryFlag, countryName, slug } 
    };
  }
  
  // ===== حذف همه =====
  if (lower.includes('delete all') || lower.includes('حذف همه') || 
      lower.includes('remove all') || lower.includes('همه پنل')) {
    return { type: 'delete_all' };
  }
  
  // ===== حذف پنل =====
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
  
  // ===== تغییر تم =====
  if (lower.includes('theme') || lower.includes('تم') || 
      lower.includes('color') || lower.includes('رنگ')) {
    for (const [color, keywords] of Object.entries(AVAILABLE_COLORS)) {
      for (const kw of keywords) {
        if (lower.includes(kw)) {
          return { type: 'change_theme', data: { color } };
        }
      }
    }
  }
  
  // ===== تغییر حالت =====
  if (lower.includes('dark') || lower.includes('تاریک')) {
    return { type: 'change_mode', data: { mode: 'dark' } };
  }
  if (lower.includes('light') || lower.includes('روشن')) {
    return { type: 'change_mode', data: { mode: 'light' } };
  }
  
  // ===== لیست =====
  if (lower.includes('list') || lower.includes('لیست') || 
      lower.includes('show') || lower.includes('نمایش')) {
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
    switch(action.type) {
      case 'create_panel': {
        const { name, days, storage, users, country, countryFlag, countryName, slug } = action.data;
        
        const newPanel = {
          id: Date.now(),
          name: name,
          slug: slug || generateRandomSlug(4),
          days: days,
          remainingDays: days,
          storage: storage,
          usedStorage: 0,
          users: users,
          countries: [country || 'germany'],
          dns: ['10.202.10.10', '114.114.114.114'],
          dnsService: 'radar',
          dnsServiceName: 'رادار',
          countryName: countryName || 'آلمان',
          countryFlag: countryFlag || '🇩🇪',
          status: 'active',
          panelSettings: { color: 'blue', mode: 'light', showDns: true, showFlags: true, compact: false }
        };
        
        panels.unshift(newPanel);
        return { 
          success: true, 
          message: `✅ پنل "${name}" با ${days} روز، ${storage} گیگ و ${users} کاربر ساخته شد\n🔗 لینک: /${newPanel.slug}`,
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
          list += `${i+1}. 📡 ${p.name} ${status} ${p.remainingDays} روز | ${p.storage}GB | /${p.slug}\n`;
        });
        return { success: true, message: list };
      }
      
      default:
        return { success: false, message: `❌ اکشن ناشناخته` };
    }
  } catch (error) {
    return { success: false, message: `❌ خطا: ${error.message}` };
  }
}

// ============================================================
// ========== GENERATE PANEL PAGE ==========
// ============================================================

function generatePanelPage(panel) {
  const isActive = panel.status === 'active';
  const usedPercent = panel.storage > 0 ? Math.min(100, Math.round((panel.usedStorage || 0) / panel.storage * 100)) : 0;
  const isFull = usedPercent >= 100;
  const remain = Math.max(0, panel.storage - (panel.usedStorage || 0));
  const color = panel.panelSettings?.color || 'blue';
  const mode = panel.panelSettings?.mode || 'light';
  
  // رنگ‌ها
  const colorMap = {
    blue: { a: '#007bff', d: '#0056b3', p: '#e6f2ff' },
    purple: { a: '#6f42c1', d: '#59359a', p: '#f0eaff' },
    green: { a: '#198754', d: '#146c43', p: '#e6f7ed' },
    rose: { a: '#d6335c', d: '#ad2748', p: '#ffe9ee' },
    brown: { a: '#8B6914', d: '#6B4F12', p: '#f5efe6' },
    red: { a: '#dc3545', d: '#b02a37', p: '#fce8ea' },
    orange: { a: '#fd7e14', d: '#c9650f', p: '#fef0e0' },
    teal: { a: '#20c997', d: '#1aa67e', p: '#e0f5f0' }
  };
  const c = colorMap[color] || colorMap.blue;
  
  // اگه حجم تموم شده، DNS خالی و قرمز
  const showDns = !isFull;
  const dnsItems = showDns ? (panel.dns || ['10.202.10.10', '114.114.114.114']).map((d, idx) => {
    const label = idx === 0 ? '🟢 Primary' : '🟡 Secondary';
    return `<div class="di">${label}: ${d} <button onclick="copyDNS('${d}')" style="background:none;border:0;color:var(--a);cursor:pointer;"><i class="fas fa-copy"></i></button></div>`;
  }).join('') : '<div class="di" style="color:red;text-align:center;">⚠️ حجم پنل تکمیل شده است</div>';
  
  const flag = panel.countryFlag || '🇩🇪';
  const countryName = panel.countryName || 'آلمان';
  
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${panel.name} - ${countryName}</title>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <style>
    :root {
      --p: ${c.p};
      --a: ${isFull ? '#dc3545' : c.a};
      --d: ${isFull ? '#b02a37' : c.d};
      --bg: ${isFull ? 'linear-gradient(135deg,#fce8ea,#ffd6d6)' : 'linear-gradient(135deg,' + c.p + ',#f0f8ff)'};
      --c: #fff;
      --t: #333;
      --t2: #666;
      --b: ${isFull ? '#f5c6cb' : '#d1e7ff'};
      --s: #28a745;
      --warning: #ffc107;
    }
    [data-theme="dark"] {
      --bg: ${isFull ? 'linear-gradient(135deg,#2d0a0a,#1a0a0a)' : 'linear-gradient(135deg,#0f172a,#1e293b)'};
      --c: ${isFull ? '#2d0a0a' : '#1e293b'};
      --t: #e2e8f0;
      --t2: #94a3b8;
      --b: ${isFull ? '#4a1a1a' : '#334155'};
      --p: ${isFull ? '#3d0a0a' : '#1e3a5f'};
      --a: ${isFull ? '#ef4444' : '#3b82f6'};
    }
    *{margin:0;padding:0;box-sizing:border-box;font-family:Vazirmatn,sans-serif}
    body{background:var(--bg);min-height:100vh;padding:20px;color:var(--t);transition:0.3s}
    .box{max-width:480px;margin:40px auto;background:var(--c);border-radius:24px;padding:32px;border:${isFull ? '2px solid #dc3545' : '1px solid var(--b)'};box-shadow:${isFull ? '0 8px 30px rgba(220,53,69,0.3)' : '0 8px 30px rgba(0,0,0,.1)'}}
    .logo{width:70px;height:70px;margin:0 auto 16px;border-radius:18px;background:${isFull ? 'linear-gradient(135deg,#dc3545,#b02a37)' : 'linear-gradient(135deg,var(--a),var(--d))'};color:#fff;display:grid;place-items:center;font-size:28px}
    h1{text-align:center;color:${isFull ? '#dc3545' : 'var(--a)'};font-size:22px;margin-bottom:4px}
    .sub{text-align:center;color:var(--t2);font-size:12px;margin-bottom:20px}
    .dns-info{text-align:center;font-size:11px;color:var(--t2);margin-bottom:16px;padding:8px;background:var(--p);border-radius:8px;}
    .opts{display:flex;justify-content:center;gap:6px;margin-bottom:20px;flex-wrap:wrap}
    .ob{padding:6px 12px;border-radius:8px;border:2px solid var(--b);background:var(--c);color:var(--t);cursor:pointer;font-size:11px;transition:0.2s}
    .ob:hover{border-color:var(--a)}
    .ob.a{border-color:var(--a);background:var(--p);color:var(--a);font-weight:600}
    .ig{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}
    .inf{background:var(--p);padding:12px;border-radius:10px;text-align:center;transition:0.2s}
    .inf:hover{transform:translateY(-2px)}
    .inf .l{font-size:10px;color:var(--t2)}
    .inf .v{font-size:16px;font-weight:700;color:${isFull ? '#dc3545' : 'var(--a)'}}
    .bw{margin-bottom:16px}
    .bt{display:flex;justify-content:space-between;font-size:11px;color:var(--t2);margin-bottom:4px}
    .br{height:8px;background:var(--b);border-radius:10px;overflow:hidden}
    .br i{display:block;height:100%;background:${isFull ? 'linear-gradient(90deg,#dc3545,#ff6b6b)' : 'linear-gradient(90deg,var(--a),#66b3ff)'};transition:1s;width:${usedPercent}%}
    .sec{margin-bottom:14px}
    .sec h3{font-size:13px;color:${isFull ? '#dc3545' : 'var(--a)'};margin-bottom:8px;display:flex;align-items:center;gap:6px}
    .di{background:var(--p);padding:10px 14px;border-radius:8px;margin-bottom:5px;font-family:monospace;font-size:13px;direction:ltr;text-align:left;display:flex;justify-content:space-between;align-items:center;${isFull ? 'color:#dc3545;border:1px solid #dc3545;' : ''}}
    .tg{display:inline-block;background:var(--p);color:${isFull ? '#dc3545' : 'var(--a)'};padding:4px 10px;border-radius:6px;font-size:13px;margin:2px}
    .st{text-align:center;margin-top:16px;padding:10px;border-radius:8px;font-size:12px;font-weight:600}
    .st.on{background:rgba(40,167,69,.15);color:var(--s)}
    .st.off{background:rgba(220,53,69,.15);color:#dc3545}
    .st.full{background:rgba(220,53,69,.25);color:#dc3545;border:1px solid #dc3545}
    .footer{text-align:center;margin-top:16px;font-size:10px;color:var(--t2)}
    .copy-tip{text-align:center;font-size:11px;color:var(--t2);margin:8px 0;padding:6px;background:rgba(255,193,7,0.1);border-radius:6px;border:1px dashed var(--warning);}
    .full-badge{display:inline-block;background:#dc3545;color:#fff;padding:2px 10px;border-radius:10px;font-size:10px;font-weight:600;margin-right:6px}
  </style>
</head>
<body data-theme="${mode}">
<div class="box">
  <div class="logo"><i class="fas fa-server"></i></div>
  <h1>${panel.name} ${isFull ? '<span class="full-badge">🔴 FULL</span>' : ''}</h1>
  <p class="sub" id="sub"><i class="fas fa-globe"></i> ${flag} ${countryName} | <i class="fas fa-shield-alt"></i> پنل DNS اختصاصی</p>
  <div class="dns-info">سرویس: ${panel.dnsServiceName || 'رادار'} | کشور: ${countryName}</div>
  <div class="opts">
    <button class="ob a" onclick="sl('fa')">فارسی</button>
    <button class="ob" onclick="sl('en')">English</button>
    <button class="ob" onclick="sl('ru')">Русский</button>
    <button class="ob" onclick="sm('light')"><i class="fas fa-sun"></i></button>
    <button class="ob" onclick="sm('dark')"><i class="fas fa-moon"></i></button>
  </div>
  <div class="ig">
    <div class="inf"><div class="l" id="l1"><i class="far fa-calendar-alt"></i> روز باقی‌مانده</div><div class="v">${panel.remainingDays}</div></div>
    <div class="inf"><div class="l" id="l2"><i class="fas fa-hdd"></i> حجم باقی‌مانده</div><div class="v">${isFull ? '0 GB' : remain + ' GB'}</div></div>
    <div class="inf"><div class="l" id="l3"><i class="fas fa-database"></i> حجم کل</div><div class="v">${panel.storage} GB</div></div>
    <div class="inf"><div class="l" id="l4"><i class="fas fa-users"></i> کاربران</div><div class="v">${panel.users}</div></div>
  </div>
  <div class="bw">
    <div class="bt"><span id="l5"><i class="fas fa-chart-bar"></i> مصرف حجم</span><span>${isFull ? '🔴 FULL' : usedPercent + '%'}</span></div>
    <div class="br"><i style="width:${usedPercent}%"></i></div>
  </div>
  <div class="sec">
    <h3><i class="fas fa-server"></i> <span id="l6">آدرس‌های DNS</span></h3>
    ${dnsItems}
  </div>
  <div class="copy-tip"><i class="fas fa-info-circle"></i> برای کپی روی آیکون 📋 کلیک کنید</div>
  <div class="sec">
    <h3><i class="fas fa-flag"></i> <span id="l7">کشور</span></h3>
    <span class="tg">${flag} ${countryName}</span>
  </div>
  <div class="st ${isFull ? 'full' : (isActive ? 'on' : 'off')}" id="st">
    ${isFull ? '<i class="fas fa-exclamation-triangle"></i> ● حجم تکمیل شده' : (isActive ? '<i class="fas fa-check-circle"></i> ● فعال' : '<i class="fas fa-times-circle"></i> ● غیرفعال')}
  </div>
  <div class="footer">تولید شده توسط پنل مدیریت DNS</div>
</div>
<script>
var tr={fa:{s:"پنل DNS اختصاصی",a:["روز باقی‌مانده","حجم باقی‌مانده","حجم کل","کاربران","مصرف حجم","آدرس‌های DNS","کشور"],o:"فعال",f
