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
// ========== هوش مصنوعی (نسخه‌ی جدید - خروجی ساختاریافته) ==========
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
const VALID_COLOR_KEYS = Object.keys(AVAILABLE_COLORS);

const VALID_ACTION_TYPES = [
  'create_panel',
  'delete_panel',
  'delete_all',
  'change_theme',
  'change_mode',
  'list_panels',
  'change_storage',
  'add_days',
  null
];

app.post('/api/ai/chat', async (req, res) => {
  const { message } = req.body;
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.json({ success: false, message: '❌ پیام خالی است' });
  }

  console.log('📨 پیام کاربر:', message);

  const apiKey = process.env.AI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL || 'https://api.vivgrid.com/v1';
  const model = process.env.AI_MODEL || 'deepseek-chat';

  if (!apiKey) {
    return res.json({ success: false, message: '❌ API Key تنظیم نشده است. لطفاً AI_API_KEY را در .env تنظیم کنید.' });
  }

  try {
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

    const systemPrompt = `You are an assistant for a DNS panel management dashboard.

📋 CURRENT PANELS (${panels.length}):
${panelsInfo.length > 0 ? JSON.stringify(panelsInfo, null, 2) : 'No panels exist yet.'}

🎨 AVAILABLE COLORS (ONLY these, nothing else exists):
${VALID_COLOR_KEYS.join(', ')}

You must respond with ONLY a raw JSON object (no markdown fences, no extra text before/after) matching EXACTLY this shape:

{
  "reply": "a short, friendly, human message in the SAME language the user wrote in",
  "action": null
}

OR, if — and only if — the user is CLEARLY asking you to perform an operation, set "action" to one of the following (never invent a new type, never guess an action for greetings/small talk/questions):

- {"type":"create_panel","data":{"name":"string","days":number,"storage":number,"users":number}}
- {"type":"delete_panel","data":{"name":"string"}}
- {"type":"delete_all"}
- {"type":"change_theme","data":{"color":"one of: ${VALID_COLOR_KEYS.join(', ')}"}}
- {"type":"change_mode","data":{"mode":"dark"|"light"}}
- {"type":"list_panels"}
- {"type":"change_storage","data":{"name":"string","amount":number}}
- {"type":"add_days","data":{"name":"string","days":number}}

STRICT RULES:
- A greeting, thank-you, question, or general chat is NEVER an action. "action" must be null in that case.
- Only set "action" when the user's message itself contains an explicit request to do one of the operations above.
- If the user asks for a color that is not in AVAILABLE COLORS, do NOT return a change_theme action — instead explain in "reply" that the color doesn't exist and list the available ones, and set "action" to null.
- Defaults if the user omits details for create_panel: days=30, storage=100, users=10.
- Output must be valid JSON only. No markdown code fences, no commentary outside the JSON object.

User message: "${message}"`;

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
        max_tokens: 600,
        response_format: { type: 'json_object' }
      })
    });

    const data = await response.json();
    console.log('AI Response Status:', response.status);

    if (!response.ok) {
      console.error('AI API Error:', JSON.stringify(data, null, 2));
      let errorMsg = '❌ خطا در ارتباط با هوش مصنوعی';
      if (data.error?.message) errorMsg += `: ${data.error.message}`;
      else if (data.message) errorMsg += `: ${data.message}`;
      return res.json({ success: false, message: errorMsg });
    }

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('Unexpected API response:', data);
      return res.json({ success: false, message: '❌ پاسخ غیرمنتظره از API دریافت شد' });
    }

    const rawContent = data.choices[0].message.content;
    console.log('🤖 پاسخ خام AI:', rawContent);

    let parsed;
    try {
      const cleaned = rawContent.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr, rawContent);
      aiHistory.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
      aiHistory.push({ role: 'assistant', content: rawContent, timestamp: new Date().toISOString() });
      return res.json({
        success: true,
        message: rawContent,
        action: null,
        actionResult: null
      });
    }

    const replyText = typeof parsed.reply === 'string' ? parsed.reply : '';
    let action = parsed.action || null;

    if (action) {
      if (!VALID_ACTION_TYPES.includes(action.type)) {
        console.warn('⚠️ اکشن نامعتبر از مدل نادیده گرفته شد:', action.type);
        action = null;
      } else if (action.type === 'change_theme') {
        const color = action.data?.color;
        if (!VALID_COLOR_KEYS.includes(color)) {
          console.warn('⚠️ رنگ نامعتبر از مدل نادیده گرفته شد:', color);
          action = null;
        }
      }
    }

    let actionResult = null;
    if (action) {
      console.log('⚡ اجرای اکشن:', action);
      actionResult = executeAction(action);
      console.log('📊 نتیجه:', actionResult);
    }

    let finalMessage = replyText || '...';
    if (actionResult) {
      finalMessage = actionResult.success
        ? `${replyText}\n\n${actionResult.message}`.trim()
        : actionResult.message;
    }

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
    res.json({ success: false, message: `❌ خطا در ارتباط: ${error.message}` });
  }
});

// ============================================================
// ========== اجرای ACTION ==========
// ============================================================
function executeAction(action) {
  if (!action) return { success: false, message: 'اکشن یافت نشد' };

  try {
    console.log('🔧 اجرای اکشن:', action.type, action.data || '');

    switch (action.type) {
      case 'create_panel': {
        const name = (action.data?.name || 'پنل جدید').toString().trim() || 'پنل جدید';
        const days = Number.isFinite(action.data?.days) ? action.data.days : 30;
        const storage = Number.isFinite(action.data?.storage) ? action.data.storage : 100;
        const users = Number.isFinite(action.data?.users) ? action.data.users : 10;
        const slug = generateSlug(name);
        const exists = panels.some(p => p.slug === slug);
        const finalSlug = exists ? slug + '-' + Date.now().toString().slice(-4) : slug;

        const newPanel = {
          id: Date.now(),
          name,
          slug: finalSlug,
          days,
          remainingDays: days,
          storage,
          usedStorage: 0,
          users,
          countries: ['germany'],
          dns: ['10.202.10.10', '114.114.114.114'],
          dnsService: 'radar',
          dnsServiceName: 'رادار',
          countryName: 'آلمان',
          countryFlag: '🇩🇪',
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
        return {
          success: true,
          message: `✅ پنل "${name}" با ${days} روز، ${storage} گیگ و ${users} کاربر ساخته شد`,
          panel: newPanel
        };
      }

      case 'delete_panel': {
        const name = (action.data?.name || '').toString();
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
        const mode = action.data?.mode === 'dark' ? 'dark' : 'light';
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
          list += `${i + 1}. 📡 ${p.name} ${status} ${p.remainingDays} روز | ${p.storage}GB\n`;
        });
        return { success: true, message: list };
      }

      case 'change_storage': {
        const name = (action.data?.name || '').toString();
        const amount = action.data?.amount;
        const panel = panels.find(p => p.name.toLowerCase() === name.toLowerCase());
        if (panel && Number.isFinite(amount)) {
          panel.storage = amount;
          return { success: true, message: `✅ حجم پنل "${name}" به ${amount} گیگ تغییر کرد` };
        }
        return { success: false, message: `❌ پنل "${name}" یافت نشد` };
      }

      case 'add_days': {
        const name = (action.data?.name || '').toString();
        const days = action.data?.days;
        const panel = panels.find(p => p.name.toLowerCase() === name.toLowerCase());
        if (panel && Number.isFinite(days)) {
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
function randomPrefix(len = 5) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function generateSlug(name) {
  const base = (name || 'panel').toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'panel';
  return `${randomPrefix()}-${base}`;
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

// ============================================================
// ========== قالب کامل صفحه‌ی عمومی پنل ==========
// ============================================================
const COLOR_THEMES = {
  blue:   { a: '#007bff', d: '#0056b3', p: '#e6f2ff' },
  purple: { a: '#8b5cf6', d: '#6d28d9', p: '#f0e9ff' },
  green:  { a: '#22c55e', d: '#15803d', p: '#e6f9ee' },
  rose:   { a: '#f43f5e', d: '#be123c', p: '#ffe6ec' },
  brown:  { a: '#92400e', d: '#6b3410', p: '#f5ebe0' },
  red:    { a: '#ef4444', d: '#b91c1c', p: '#fde8e8' },
  orange: { a: '#f97316', d: '#c2410c', p: '#fff1e6' },
  teal:   { a: '#14b8a6', d: '#0f766e', p: '#e6faf8' }
};

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function buildPanelPage(panel) {
  const storage = Number(panel.storage) || 0;
  const usedStorage = Number(panel.usedStorage) || 0;
  const isFull = storage > 0 && usedStorage >= storage;
  const colorKey = isFull ? 'red' : (panel.panelSettings?.color || 'blue');
  const theme = COLOR_THEMES[colorKey] || COLOR_THEMES.blue;
  const mode = panel.panelSettings?.mode === 'dark' ? 'dark' : 'light';
  const remaining = Math.max(0, storage - usedStorage);
  const pct = storage > 0 ? Math.min(100, Math.round((usedStorage / storage) * 100)) : 0;
  const isActive = panel.status === 'active' && !isFull;
  const dnsList = Array.isArray(panel.dns) ? panel.dns : [];
  const dnsLabels = ['Primary', 'Secondary', 'Tertiary'];

  const dnsBlockHtml = isFull
    ? `<div class="dns-empty"><i class="fas fa-ban"></i> <span id="dnsEmptyMsg">به دلیل اتمام حجم، آدرس‌های DNS غیرفعال شدند</span></div>`
    : dnsList.map((addr, i) =>
        `<div class="di" data-dns="${escapeHtml(addr)}">
          ${i === 0 ? '🟢' : '🟡'} ${dnsLabels[i] || 'DNS ' + (i + 1)}: ${escapeHtml(addr)}
          <button onclick="copyDNS('${escapeHtml(addr)}')" class="copy-btn" title="کپی">
            <i class="fas fa-copy"></i>
          </button>
        </div>`
      ).join('');

  const countryFlag = panel.countryFlag || '🏳️';
  const countryName = escapeHtml(panel.countryName || 'N/A');

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${escapeHtml(panel.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<style>
:root{
  --p:${theme.p};--a:${theme.a};--d:${theme.d};
  --bg:linear-gradient(135deg,${theme.p},#f0f8ff);
  --c:#fff;--t:#333;--t2:#666;--b:#d1e7ff;--s:#28a745;
}
[data-theme="dark"]{
  --bg:linear-gradient(135deg,#0f172a,#1e293b);
  --c:#1e293b;--t:#e2e8f0;--t2:#94a3b8;--b:#334155;
  --p:${theme.p};--a:${theme.a};
}
*{margin:0;padding:0;box-sizing:border-box;font-family:Vazirmatn,sans-serif}
body{background:var(--bg);min-height:100vh;padding:20px;color:var(--t);transition:0.3s}
.box{max-width:480px;margin:40px auto;background:var(--c);border-radius:24px;padding:32px;border:1px solid var(--b);box-shadow:0 8px 30px rgba(0,0,0,.1);position:relative}
.logo{width:70px;height:70px;margin:0 auto 16px;border-radius:18px;background:linear-gradient(135deg,var(--a),var(--d));color:#fff;display:grid;place-items:center;font-size:28px}
h1{text-align:center;color:var(--a);font-size:22px;margin-bottom:4px}
.sub{text-align:center;color:var(--t2);font-size:12px;margin-bottom:20px}
.dns-info{text-align:center;font-size:11px;color:var(--t2);margin-bottom:16px;padding:8px;background:var(--p);border-radius:8px}
.opts{display:flex;justify-content:center;gap:6px;margin-bottom:20px;flex-wrap:wrap}
.ob{padding:6px 12px;border-radius:8px;border:2px solid var(--b);background:var(--c);color:var(--t);cursor:pointer;font-size:11px;transition:0.2s}
.ob:hover{border-color:var(--a)}
.ob.a{border-color:var(--a);background:var(--p);color:var(--a);font-weight:600}
.ig{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}
.inf{background:var(--p);padding:12px;border-radius:10px;text-align:center;transition:0.2s}
.inf:hover{transform:translateY(-2px)}
.inf .l{font-size:10px;color:var(--t2)}
.inf .v{font-size:16px;font-weight:700;color:var(--a)}
.bw{margin-bottom:16px}
.bt{display:flex;justify-content:space-between;font-size:11px;color:var(--t2);margin-bottom:4px}
.br{height:8px;background:var(--b);border-radius:10px;overflow:hidden}
.br i{display:block;height:100%;background:linear-gradient(90deg,var(--a),#66b3ff);transition:1s}
.sec{margin-bottom:14px}
.sec h3{font-size:13px;color:var(--a);margin-bottom:8px;display:flex;align-items:center;gap:6px}
.di{background:var(--p);padding:10px 14px;border-radius:8px;margin-bottom:5px;font-family:monospace;font-size:13px;direction:ltr;text-align:left;display:flex;justify-content:space-between;align-items:center}
.dns-empty{background:var(--p);color:var(--a);padding:12px 14px;border-radius:8px;font-size:12px;text-align:center}
.tg{display:inline-block;background:var(--p);color:var(--a);padding:4px 10px;border-radius:6px;font-size:13px;margin:2px}
.st{text-align:center;margin-top:16px;padding:10px;border-radius:8px;font-size:12px;font-weight:600}
.st.on{background:rgba(40,167,69,.15);color:var(--s)}
.st.off{background:rgba(220,53,69,.15);color:#dc3545}
.footer{text-align:center;margin-top:16px;font-size:10px;color:var(--t2)}
.copy-tip{text-align:center;font-size:11px;color:var(--t2);margin:8px 0;padding:6px;background:rgba(255,193,7,0.1);border-radius:6px;border:1px dashed #ffc107}
.copy-btn{background:none;border:0;color:var(--a);cursor:pointer;font-size:14px}
.settings-btn{position:absolute;top:16px;left:16px;background:var(--p);border:1px solid var(--b);color:var(--a);width:36px;height:36px;border-radius:10px;cursor:pointer;display:grid;place-items:center;font-size:16px;transition:0.2s}
.settings-btn:hover{background:var(--a);color:#fff}
.settings-panel{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:999;align-items:center;justify-content:center;padding:16px}
.settings-panel.open{display:flex}
.settings-box{background:var(--c);border-radius:20px;max-width:420px;width:100%;max-height:90vh;overflow-y:auto;padding:24px;border:1px solid var(--b);box-shadow:0 20px 50px rgba(0,0,0,.25)}
.settings-box h2{font-size:18px;color:var(--a);margin-bottom:16px;display:flex;align-items:center;gap:8px}
.set-item{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--b);font-size:13px}
.set-item:last-child{border-bottom:0}
.set-item label{flex:1;cursor:pointer}
.set-item input[type="checkbox"]{width:18px;height:18px;accent-color:var(--a);cursor:pointer}
.set-item select,.set-item input[type="range"]{max-width:120px}
.close-set{margin-top:16px;width:100%;padding:10px;border:0;border-radius:10px;background:var(--a);color:#fff;font-weight:600;cursor:pointer}
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:10px 18px;border-radius:10px;font-size:13px;opacity:0;transition:0.3s;z-index:1000;pointer-events:none}
.toast.show{opacity:1}
.hidden-sec{display:none !important}
.compact .inf{padding:8px}
.compact .box{padding:20px}
.compact h1{font-size:18px}
.large-font{font-size:1.15em}
.no-anim *{transition:none !important;animation:none !important}
.high-contrast{--t:#000;--t2:#222;--c:#fff;--b:#000}
[data-theme="dark"].high-contrast{--t:#fff;--t2:#ddd;--c:#111;--b:#fff}
.blur-bg body{filter:blur(0)}
.mono .di{font-family:monospace}
.rounded-more .box{border-radius:32px}
.shadow-strong .box{box-shadow:0 15px 40px rgba(0,0,0,.25)}
.progress-thick .br{height:14px}
.hide-percent .bt span:last-child{display:none}
</style>
</head>
<body data-theme="${mode}">
<div class="box" id="mainBox">
  <button class="settings-btn" onclick="toggleSettings()" title="تنظیمات">
    <i class="fas fa-cog"></i>
  </button>

  <div class="logo"><i class="fas fa-server"></i></div>
  <h1 id="panelTitle">${escapeHtml(panel.name)}</h1>
  <p class="sub" id="sub">
    <i class="fas fa-globe"></i> ${countryFlag} ${countryName} | 
    <i class="fas fa-shield-alt"></i> پنل DNS اختصاصی
  </p>
  <div class="dns-info" id="dnsInfo">
    سرویس: ${escapeHtml(panel.dnsServiceName || '-')} | کشور: ${countryName}
  </div>

  <div class="opts" id="langOpts">
    <button class="ob a" onclick="sl('fa')">فارسی</button>
    <button class="ob" onclick="sl('en')">English</button>
    <button class="ob" onclick="sl('ru')">Русский</button>
    <button class="ob" onclick="sm('light')"><i class="fas fa-sun"></i></button>
    <button class="ob" onclick="sm('dark')"><i class="fas fa-moon"></i></button>
  </div>

  <div class="ig" id="statsGrid">
    <div class="inf" id="statDays">
      <div class="l" id="l1"><i class="far fa-calendar-alt"></i> روز باقی‌مانده</div>
      <div class="v">${panel.remainingDays}</div>
    </div>
    <div class="inf" id="statRemain">
      <div class="l" id="l2"><i class="fas fa-hdd"></i> حجم باقی‌مانده</div>
      <div class="v">${remaining} GB</div>
    </div>
    <div class="inf" id="statTotal">
      <div class="l" id="l3"><i class="fas fa-database"></i> حجم کل</div>
      <div class="v">${storage} GB</div>
    </div>
    <div class="inf" id="statUsers">
      <div class="l" id="l4"><i class="fas fa-users"></i> کاربران</div>
      <div class="v">${panel.users}</div>
    </div>
  </div>

  <div class="bw" id="progressSec">
    <div class="bt">
      <span id="l5"><i class="fas fa-chart-bar"></i> مصرف حجم</span>
      <span id="pctVal">${pct}%</span>
    </div>
    <div class="br"><i id="progBar" style="width:${pct}%"></i></div>
  </div>

  <div class="sec" id="dnsSec">
    <h3><i class="fas fa-server"></i> <span id="l6">آدرس‌های DNS</span></h3>
    ${dnsBlockHtml}
  </div>

  ${isFull ? '' : '<div class="copy-tip" id="copyTip"><i class="fas fa-info-circle"></i> برای کپی روی آیکون 📋 کلیک کنید</div>'}

  <div class="sec" id="countrySec">
    <h3><i class="fas fa-flag"></i> <span id="l7">کشور</span></h3>
    <span class="tg">${countryFlag} ${countryName}</span>
  </div>

  <div class="st ${isActive ? 'on' : 'off'}" id="st">
    ${isFull
      ? '<i class="fas fa-ban"></i> ● غیرفعال - حجم تمام شد'
      : (isActive
          ? '<i class="fas fa-check-circle"></i> ● فعال'
          : '<i class="fas fa-times-circle"></i> ● غیرفعال')}
  </div>

  <div class="footer" id="footer">تولید شده توسط پنل مدیریت DNS</div>
</div>

<!-- پنل تنظیمات با ۳۰ گزینه واقعی -->
<div class="settings-panel" id="settingsPanel">
  <div class="settings-box">
    <h2><i class="fas fa-sliders-h"></i> تنظیمات صفحه</h2>

    <div class="set-item">
      <label for="s1">۱. مخفی کردن بخش DNS</label>
      <input type="checkbox" id="s1" onchange="applySetting('hideDns',this.checked)">
    </div>
    <div class="set-item">
      <label for="s2">۲. مخفی کردن آمار (روز/حجم/کاربر)</label>
      <input type="checkbox" id="s2" onchange="applySetting('hideStats',this.checked)">
    </div>
    <div class="set-item">
      <label for="s3">۳. مخفی کردن نوار پیشرفت</label>
      <input type="checkbox" id="s3" onchange="applySetting('hideProgress',this.checked)">
    </div>
    <div class="set-item">
      <label for="s4">۴. مخفی کردن بخش کشور</label>
      <input type="checkbox" id="s4" onchange="applySetting('hideCountry',this.checked)">
    </div>
    <div class="set-item">
      <label for="s5">۵. مخفی کردن دکمه‌های زبان/تم</label>
      <input type="checkbox" id="s5" onchange="applySetting('hideLang',this.checked)">
    </div>
    <div class="set-item">
      <label for="s6">۶. مخفی کردن فوتر</label>
      <input type="checkbox" id="s6" onchange="applySetting('hideFooter',this.checked)">
    </div>
    <div class="set-item">
      <label for="s7">۷. مخفی کردن اطلاعات سرویس</label>
      <input type="checkbox" id="s7" onchange="applySetting('hideDnsInfo',this.checked)">
    </div>
    <div class="set-item">
      <label for="s8">۸. مخفی کردن راهنمای کپی</label>
      <input type="checkbox" id="s8" onchange="applySetting('hideCopyTip',this.checked)">
    </div>
    <div class="set-item">
      <label for="s9">۹. حالت فشرده (Compact)</label>
      <input type="checkbox" id="s9" onchange="applySetting('compact',this.checked)">
    </div>
    <div class="set-item">
      <label for="s10">۱۰. فونت بزرگ‌تر</label>
      <input type="checkbox" id="s10" onchange="applySetting('largeFont',this.checked)">
    </div>
    <div class="set-item">
      <label for="s11">۱۱. غیرفعال کردن انیمیشن‌ها</label>
      <input type="checkbox" id="s11" onchange="applySetting('noAnim',this.checked)">
    </div>
    <div class="set-item">
      <label for="s12">۱۲. کنتراست بالا</label>
      <input type="checkbox" id="s12" onchange="applySetting('highContrast',this.checked)">
    </div>
    <div class="set-item">
      <label for="s13">۱۳. فونت مونو برای DNS</label>
      <input type="checkbox" id="s13" onchange="applySetting('mono',this.checked)">
    </div>
    <div class="set-item">
      <label for="s14">۱۴. گوشه‌های گردتر</label>
      <input type="checkbox" id="s14" onchange="applySetting('roundedMore',this.checked)">
    </div>
    <div class="set-item">
      <label for="s15">۱۵. سایه قوی‌تر</label>
      <input type="checkbox" id="s15" onchange="applySetting('shadowStrong',this.checked)">
    </div>
    <div class="set-item">
      <label for="s16">۱۶. نوار پیشرفت ضخیم‌تر</label>
      <input type="checkbox" id="s16" onchange="applySetting('progressThick',this.checked)">
    </div>
    <div class="set-item">
      <label for="s17">۱۷. مخفی کردن درصد مصرف</label>
      <input type="checkbox" id="s17" onchange="applySetting('hidePercent',this.checked)">
    </div>
    <div class="set-item">
      <label for="s18">۱۸. مخفی کردن وضعیت (فعال/غیرفعال)</label>
      <input type="checkbox" id="s18" onchange="applySetting('hideStatus',this.checked)">
    </div>
    <div class="set-item">
      <label for="s19">۱۹. مخفی کردن لوگو</label>
      <input type="checkbox" id="s19" onchange="applySetting('hideLogo',this.checked)">
    </div>
    <div class="set-item">
      <label for="s20">۲۰. مخفی کردن عنوان پنل</label>
      <input type="checkbox" id="s20" onchange="applySetting('hideTitle',this.checked)">
    </div>
    <div class="set-item">
      <label for="s21">۲۱. کپی همه DNSها با یک کلیک</label>
      <button onclick="copyAllDNS()" style="padding:4px 10px;border-radius:6px;border:1px solid var(--a);background:var(--p);color:var(--a);cursor:pointer;font-size:12px">کپی همه</button>
    </div>
    <div class="set-item">
      <label for="s22">۲۲. نمایش فقط Primary DNS</label>
      <input type="checkbox" id="s22" onchange="applySetting('onlyPrimary',this.checked)">
    </div>
    <div class="set-item">
      <label for="s23">۲۳. تغییر جهت صفحه (LTR/RTL)</label>
      <select id="s23" onchange="applySetting('dir',this.value)">
        <option value="rtl">راست‌چین (RTL)</option>
        <option value="ltr">چپ‌چین (LTR)</option>
      </select>
    </div>
    <div class="set-item">
      <label for="s24">۲۴. اندازه فونت پایه</label>
      <input type="range" id="s24" min="12" max="20" value="14" onchange="applySetting('fontSize',this.value)">
    </div>
    <div class="set-item">
      <label for="s25">۲۵. شفافیت کارت اصلی</label>
      <input type="range" id="s25" min="70" max="100" value="100" onchange="applySetting('opacity',this.value)">
    </div>
    <div class="set-item">
      <label for="s26">۲۶. مخفی کردن دکمه‌های کپی تکی</label>
      <input type="checkbox" id="s26" onchange="applySetting('hideCopyBtns',this.checked)">
    </div>
    <div class="set-item">
      <label for="s27">۲۷. نمایش شماره DNS (۱،۲،۳)</label>
      <input type="checkbox" id="s27" onchange="applySetting('showDnsNum',this.checked)">
    </div>
    <div class="set-item">
      <label for="s28">۲۸. غیرفعال کردن هاور روی کارت‌ها</label>
      <input type="checkbox" id="s28" onchange="applySetting('noHover',this.checked)">
    </div>
    <div class="set-item">
      <label for="s29">۲۹. ریست تمام تنظیمات</label>
      <button onclick="resetSettings()" style="padding:4px 10px;border-radius:6px;border:1px solid #dc3545;background:#ffe6e6;color:#dc3545;cursor:pointer;font-size:12px">ریست</button>
    </div>
    <div class="set-item">
      <label for="s30">۳۰. ذخیره تنظیمات در مرورگر</label>
      <span style="font-size:11px;color:var(--t2)">فعال است (localStorage)</span>
    </div>

    <button class="close-set" onclick="toggleSettings()">بستن تنظیمات</button>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
var isFull = ${isFull ? 'true' : 'false'};
var dnsAddresses = ${JSON.stringify(dnsList)};
var settingsKey = 'dns_panel_settings_${panel.slug}';

var tr = {
  fa: {
    s: "پنل DNS اختصاصی",
    a: ["روز باقی‌مانده","حجم باقی‌مانده","حجم کل","کاربران","مصرف حجم","آدرس‌های DNS","کشور"],
    o: "فعال", f: "غیرفعال", full: "غیرفعال - حجم تمام شد",
    dnsEmpty: "به دلیل اتمام حجم، آدرس‌های DNS غیرفعال شدند"
  },
  en: {
    s: "Private DNS Panel",
    a: ["Remaining Days","Remaining Storage","Total Storage","Users","Storage Usage","DNS Addresses","Country"],
    o: "Active", f: "Inactive", full: "Inactive - Storage Full",
    dnsEmpty: "DNS addresses are disabled because storage is full"
  },
  ru: {
    s: "Приватная DNS панель",
    a: ["Осталось дней","Осталось места","Всего места","Пользователи","Использование","DNS адреса","Страна"],
    o: "Активен", f: "Неактивен", full: "Неактивен - место закончилось",
    dnsEmpty: "DNS-адреса отключены из-за нехватки места"
  }
};

function showToast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function(){ t.classList.remove('show'); }, 2200);
}

function toggleSettings() {
  document.getElementById('settingsPanel').classList.toggle('open');
}

function loadSettings() {
  try {
    var raw = localStorage.getItem(settingsKey);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch(e) { return {}; }
}

function saveSettings(obj) {
  localStorage.setItem(settingsKey, JSON.stringify(obj));
}

function applySetting(key, value) {
  var s = loadSettings();
  s[key] = value;
  saveSettings(s);
  applyAll(s);
}

function applyAll(s) {
  var box = document.getElementById('mainBox');
  var body = document.body;

  // 1 hideDns
  document.getElementById('dnsSec').classList.toggle('hidden-sec', !!s.hideDns);
  // 2 hideStats
  document.getElementById('statsGrid').classList.toggle('hidden-sec', !!s.hideStats);
  // 3 hideProgress
  document.getElementById('progressSec').classList.toggle('hidden-sec', !!s.hideProgress);
  // 4 hideCountry
  document.getElementById('countrySec').classList.toggle('hidden-sec', !!s.hideCountry);
  // 5 hideLang
  document.getElementById('langOpts').classList.toggle('hidden-sec', !!s.hideLang);
  // 6 hideFooter
  document.getElementById('footer').classList.toggle('hidden-sec', !!s.hideFooter);
  // 7 hideDnsInfo
  document.getElementById('dnsInfo').classList.toggle('hidden-sec', !!s.hideDnsInfo);
  // 8 hideCopyTip
  var tip = document.getElementById('copyTip');
  if (tip) tip.classList.toggle('hidden-sec', !!s.hideCopyTip);
  // 9 compact
  box.classList.toggle('compact', !!s.compact);
  // 10 largeFont
  body.classList.toggle('large-font', !!s.largeFont);
  // 11 noAnim
  body.classList.toggle('no-anim', !!s.noAnim);
  // 12 highContrast
  body.classList.toggle('high-contrast', !!s.highContrast);
  // 13 mono
  box.classList.toggle('mono', !!s.mono);
  // 14 roundedMore
  box.classList.toggle('rounded-more', !!s.roundedMore);
  // 15 shadowStrong
  box.classList.toggle('shadow-strong', !!s.shadowStrong);
  // 16 progressThick
  box.classList.toggle('progress-thick', !!s.progressThick);
  // 17 hidePercent
  box.classList.toggle('hide-percent', !!s.hidePercent);
  // 18 hideStatus
  document.getElementById('st').classList.toggle('hidden-sec', !!s.hideStatus);
  // 19 hideLogo
  document.querySelector('.logo').classList.toggle('hidden-sec', !!s.hideLogo);
  // 20 hideTitle
  document.getElementById('panelTitle').classList.toggle('hidden-sec', !!s.hideTitle);
  // 22 onlyPrimary
  var dis = document.querySelectorAll('.di');
  dis.forEach(function(el, i){
    el.style.display = (s.onlyPrimary && i > 0) ? 'none' : '';
  });
  // 23 dir
  if (s.dir) {
    document.documentElement.dir = s.dir;
    document.documentElement.lang = s.dir === 'rtl' ? 'fa' : 'en';
  }
  // 24 fontSize
  if (s.fontSize) document.documentElement.style.fontSize = s.fontSize + 'px';
  // 25 opacity
  if (s.opacity) box.style.opacity = (s.opacity / 100);
  // 26 hideCopyBtns
  document.querySelectorAll('.copy-btn').forEach(function(b){
    b.style.display = s.hideCopyBtns ? 'none' : '';
  });
  // 27 showDnsNum
  dis.forEach(function(el, i){
    var txt = el.childNodes[0];
    if (s.showDnsNum) {
      if (!el.dataset.orig) el.dataset.orig = el.innerHTML;
      el.innerHTML = (i+1) + '. ' + (el.dataset.dns || '') + 
        ' <button onclick="copyDNS(\\'' + (el.dataset.dns||'') + '\\')" class="copy-btn"><i class="fas fa-copy"></i></button>';
    } else if (el.dataset.orig) {
      el.innerHTML = el.dataset.orig;
    }
  });
  // 28 noHover
  if (s.noHover) {
    document.querySelectorAll('.inf').forEach(function(el){ el.style.transform = 'none'; });
  }
}

function resetSettings() {
  localStorage.removeItem(settingsKey);
  location.reload();
}

function copyAllDNS() {
  if (!dnsAddresses.length) {
    showToast('❌ هیچ DNSی وجود ندارد');
    return;
  }
  var text = dnsAddresses.join('\\n');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function(){
      showToast('✅ همه DNSها کپی شدند');
    }).catch(function(){ fallbackCopy(text); });
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  try {
    var i = document.createElement('textarea');
    i.value = text;
    i.style.position = 'fixed';
    i.style.opacity = '0';
    document.body.appendChild(i);
    i.select();
    document.execCommand('copy');
    document.body.removeChild(i);
    showToast('✅ کپی شد');
  } catch(e) {
    showToast('❌ کپی نشد');
  }
}

function copyDNS(d) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(d).then(function(){
      showToast('✅ کپی شد: ' + d);
    }).catch(function(){ tryFallback(d); });
  } else {
    tryFallback(d);
  }
}

function tryFallback(d) {
  try {
    var i = document.createElement('input');
    i.value = d;
    i.style.position = 'fixed';
    i.style.opacity = '0';
    document.body.appendChild(i);
    i.select();
    var s = document.execCommand('copy');
    document.body.removeChild(i);
    showToast(s ? '✅ کپی شد: ' + d : '❌ کپی نشد');
  } catch(e) {
    showToast('❌ کپی نشد');
  }
}

function sl(l) {
  document.documentElement.lang = l;
  document.documentElement.dir = l === 'fa' ? 'rtl' : 'ltr';
  var t = tr[l];
  document.getElementById('sub').innerHTML =
    '<i class="fas fa-globe"></i> ${countryFlag} ${countryName} | <i class="fas fa-shield-alt"></i> ' + t.s;
  for (var i = 0; i < 7; i++) {
    var el = document.getElementById('l' + (i + 1));
    if (el) el.innerHTML = t.a[i];
  }
  var stEl = document.getElementById('st');
  if (isFull) {
    stEl.innerHTML = '<i class="fas fa-ban"></i> ● ' + t.full;
  } else {
    stEl.innerHTML = stEl.classList.contains('on')
      ? '<i class="fas fa-check-circle"></i> ● ' + t.o
      : '<i class="fas fa-times-circle"></i> ● ' + t.f;
  }
  var dnsMsg = document.getElementById('dnsEmptyMsg');
  if (dnsMsg) dnsMsg.innerHTML = t.dnsEmpty;
  var bs = document.querySelectorAll('#langOpts .ob');
  for (var j = 0; j < 3; j++) bs[j].classList.toggle('a', ['fa','en','ru'][j] === l);
}

function sm(m) {
  document.body.setAttribute('data-theme', m);
  var bs = document.querySelectorAll('#langOpts .ob');
  if (bs[3]) bs[3].classList.toggle('a', m === 'light');
  if (bs[4]) bs[4].classList.toggle('a', m === 'dark');
}

// بارگذاری تنظیمات ذخیره شده
(function(){
  var s = loadSettings();
  // ست کردن چک‌باکس‌ها
  if (s.hideDns) document.getElementById('s1').checked = true;
  if (s.hideStats) document.getElementById('s2').checked = true;
  if (s.hideProgress) document.getElementById('s3').checked = true;
  if (s.hideCountry) document.getElementById('s4').checked = true;
  if (s.hideLang) document.getElementById('s5').checked = true;
  if (s.hideFooter) document.getElementById('s6').checked = true;
  if (s.hideDnsInfo) document.getElementById('s7').checked = true;
  if (s.hideCopyTip) document.getElementById('s8').checked = true;
  if (s.compact) document.getElementById('s9').checked = true;
  if (s.largeFont) document.getElementById('s10').checked = true;
  if (s.noAnim) document.getElementById('s11').checked = true;
  if (s.highContrast) document.getElementById('s12').checked = true;
  if (s.mono) document.getElementById('s13').checked = true;
  if (s.roundedMore) document.getElementById('s14').checked = true;
  if (s.shadowStrong) document.getElementById('s15').checked = true;
  if (s.progressThick) document.getElementById('s16').checked = true;
  if (s.hidePercent) document.getElementById('s17').checked = true;
  if (s.hideStatus) document.getElementById('s18').checked = true;
  if (s.hideLogo) document.getElementById('s19').checked = true;
  if (s.hideTitle) document.getElementById('s20').checked = true;
  if (s.onlyPrimary) document.getElementById('s22').checked = true;
  if (s.dir) document.getElementById('s23').value = s.dir;
  if (s.fontSize) document.getElementById('s24').value = s.fontSize;
  if (s.opacity) document.getElementById('s25').value = s.opacity;
  if (s.hideCopyBtns) document.getElementById('s26').checked = true;
  if (s.showDnsNum) document.getElementById('s27').checked = true;
  if (s.noHover) document.getElementById('s28').checked = true;

  applyAll(s);
})();
</script>
</body>
</html>`;
}

// ========== SERVE PANEL PAGE WITH /SUB/ ==========
app.get('/SUB/:slug', (req, res) => {
  const slug = req.params.slug;
  const panel = panels.find(p => p.slug === slug);
  if (!panel) {
    return res.status(404).send('پنل یافت نشد');
  }
  res.send(buildPanelPage(panel));
});

// مسیر قدیمی را هم برای سازگاری نگه می‌داریم (اختیاری)
app.get('/:slug', (req, res) => {
  const slug = req.params.slug;
  const reserved = ['dashboard', 'settings', 'ai', 'api', 'login', 'favicon.ico', 'SUB'];
  if (reserved.includes(slug)) {
    return res.redirect('/' + slug);
  }
  // ریدایرکت به مسیر جدید
  const panel = panels.find(p => p.slug === slug);
  if (panel) {
    return res.redirect('/SUB/' + slug);
  }
  res.status(404).send('پنل یافت نشد');
});

// ========== START SERVER ==========
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Login: http://localhost:${PORT}`);
  console.log(`🔑 Username: ${process.env.ADMIN_USERNAME || 'admin'}`);
  console.log(`🔑 Password: ${process.env.ADMIN_PASSWORD || 'admin'}`);
  console.log(`🔗 لینک عمومی پنل‌ها: http://localhost:${PORT}/SUB/{slug}`);
});
