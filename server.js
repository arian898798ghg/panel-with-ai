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

// لیست رنگ‌های موجود (کلید = مقدار ذخیره‌شده، مقدار = مترادف‌های قابل‌قبول)
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

// انواع اکشن‌های مجاز که مدل می‌تونه برگردونه
const VALID_ACTION_TYPES = [
  'create_panel', 'delete_panel', 'delete_all',
  'change_theme', 'change_mode', 'list_panels',
  'change_storage', 'add_days', null
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
    return res.json({
      success: false,
      message: '❌ API Key تنظیم نشده است. لطفاً AI_API_KEY را در .env تنظیم کنید.'
    });
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

    // ===== سیستم پرامپت: مدل باید فقط JSON برگردونه =====
    // نکته‌ی کلیدی: دیگه هیچ regex/کلمه‌کاوی روی متن پاسخ انجام نمی‌شه.
    // خودِ مدل باید صراحتاً تصمیم بگیره که اکشنی هست یا نه، و این تصمیم
    // مستقیماً به صورت فیلد جدا در JSON برمی‌گرده - نه توی متن آزاد.
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
        response_format: { type: 'json_object' } // اگر پروایدر پشتیبانی کنه، دقت رو خیلی بالا می‌بره
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

    // ===== پارس کردن JSON (با پاک‌سازی احتمالی fence های مارک‌داون) =====
    let parsed;
    try {
      const cleaned = rawContent.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr, rawContent);
      // اگه مدل JSON معتبر برنگردوند، حداقل خود متن رو به‌عنوان پاسخ نشون بده
      // و هیچ اکشنی اجرا نکن (fail-safe: عدم اجرا، نه اجرای اشتباه)
      aiHistory.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
      aiHistory.push({ role: 'assistant', content: rawContent, timestamp: new Date().toISOString() });
      return res.json({ success: true, message: rawContent, action: null, actionResult: null });
    }

    const replyText = typeof parsed.reply === 'string' ? parsed.reply : '';
    let action = parsed.action || null;

    // ===== اعتبارسنجی اکشن سمت سرور (defense in depth - هیچ‌وقت به مدل صرفاً اعتماد نکن) =====
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

    // ===== ساخت پاسخ نهایی =====
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

// پالت رنگ برای هر تم (متغیرهای accent / accent تیره / پس‌زمینه‌ی روشن)
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
    : dnsList.map((addr, i) => `<div class="di">${i === 0 ? '🟢' : '🟡'} ${dnsLabels[i] || 'DNS ' + (i + 1)}: ${escapeHtml(addr)} <button onclick="copyDNS('${escapeHtml(addr)}')" style="background:none;border:0;color:var(--a);cursor:pointer;"><i class="fas fa-copy"></i></button></div>`).join('');

  const countryFlag = panel.countryFlag || '🏳️';
  const countryName = escapeHtml(panel.countryName || 'N/A');

  return `<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${escapeHtml(panel.name)}</title><link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700&display=swap" rel="stylesheet"><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"><style>:root{--p:${theme.p};--a:${theme.a};--d:${theme.d};--bg:linear-gradient(135deg,${theme.p},#f0f8ff);--c:#fff;--t:#333;--t2:#666;--b:#d1e7ff;--s:#28a745}[data-theme="dark"]{--bg:linear-gradient(135deg,#0f172a,#1e293b);--c:#1e293b;--t:#e2e8f0;--t2:#94a3b8;--b:#334155;--p:${theme.p};--a:${theme.a}}*{margin:0;padding:0;box-sizing:border-box;font-family:Vazirmatn,sans-serif}body{background:var(--bg);min-height:100vh;padding:20px;color:var(--t);transition:0.3s}.box{max-width:480px;margin:40px auto;background:var(--c);border-radius:24px;padding:32px;border:1px solid var(--b);box-shadow:0 8px 30px rgba(0,0,0,.1)}.logo{width:70px;height:70px;margin:0 auto 16px;border-radius:18px;background:linear-gradient(135deg,var(--a),var(--d));color:#fff;display:grid;place-items:center;font-size:28px}h1{text-align:center;color:var(--a);font-size:22px;margin-bottom:4px}.sub{text-align:center;color:var(--t2);font-size:12px;margin-bottom:20px}.dns-info{text-align:center;font-size:11px;color:var(--t2);margin-bottom:16px;padding:8px;background:var(--p);border-radius:8px;}.opts{display:flex;justify-content:center;gap:6px;margin-bottom:20px;flex-wrap:wrap}.ob{padding:6px 12px;border-radius:8px;border:2px solid var(--b);background:var(--c);color:var(--t);cursor:pointer;font-size:11px;transition:0.2s}.ob:hover{border-color:var(--a)}.ob.a{border-color:var(--a);background:var(--p);color:var(--a);font-weight:600}.ig{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}.inf{background:var(--p);padding:12px;border-radius:10px;text-align:center;transition:0.2s}.inf:hover{transform:translateY(-2px)}.inf .l{font-size:10px;color:var(--t2)}.inf .v{font-size:16px;font-weight:700;color:var(--a)}.bw{margin-bottom:16px}.bt{display:flex;justify-content:space-between;font-size:11px;color:var(--t2);margin-bottom:4px}.br{height:8px;background:var(--b);border-radius:10px;overflow:hidden}.br i{display:block;height:100%;background:linear-gradient(90deg,var(--a),#66b3ff);transition:1s}.sec{margin-bottom:14px}.sec h3{font-size:13px;color:var(--a);margin-bottom:8px;display:flex;align-items:center;gap:6px}.di{background:var(--p);padding:10px 14px;border-radius:8px;margin-bottom:5px;font-family:monospace;font-size:13px;direction:ltr;text-align:left;display:flex;justify-content:space-between;align-items:center}.dns-empty{background:var(--p);color:var(--a);padding:12px 14px;border-radius:8px;font-size:12px;text-align:center}.tg{display:inline-block;background:var(--p);color:var(--a);padding:4px 10px;border-radius:6px;font-size:13px;margin:2px}.st{text-align:center;margin-top:16px;padding:10px;border-radius:8px;font-size:12px;font-weight:600}.st.on{background:rgba(40,167,69,.15);color:var(--s)}.st.off{background:rgba(220,53,69,.15);color:#dc3545}.footer{text-align:center;margin-top:16px;font-size:10px;color:var(--t2)}.copy-tip{text-align:center;font-size:11px;color:var(--t2);margin:8px 0;padding:6px;background:rgba(255,193,7,0.1);border-radius:6px;border:1px dashed #ffc107;}</style></head><body data-theme="${mode}"><div class="box"><div class="logo"><i class="fas fa-server"></i></div><h1>${escapeHtml(panel.name)}</h1><p class="sub" id="sub"><i class="fas fa-globe"></i> ${countryFlag} ${countryName} | <i class="fas fa-shield-alt"></i> پنل DNS اختصاصی</p><div class="dns-info">سرویس: ${escapeHtml(panel.dnsServiceName || '-')} | کشور: ${countryName}</div><div class="opts"><button class="ob a" onclick="sl('fa')">فارسی</button><button class="ob" onclick="sl('en')">English</button><button class="ob" onclick="sl('ru')">Русский</button><button class="ob" onclick="sm('light')"><i class="fas fa-sun"></i></button><button class="ob" onclick="sm('dark')"><i class="fas fa-moon"></i></button></div><div class="ig"><div class="inf"><div class="l" id="l1"><i class="far fa-calendar-alt"></i> روز باقی‌مانده</div><div class="v">${panel.remainingDays}</div></div><div class="inf"><div class="l" id="l2"><i class="fas fa-hdd"></i> حجم باقی‌مانده</div><div class="v">${remaining} GB</div></div><div class="inf"><div class="l" id="l3"><i class="fas fa-database"></i> حجم کل</div><div class="v">${storage} GB</div></div><div class="inf"><div class="l" id="l4"><i class="fas fa-users"></i> کاربران</div><div class="v">${panel.users}</div></div></div><div class="bw"><div class="bt"><span id="l5"><i class="fas fa-chart-bar"></i> مصرف حجم</span><span>${pct}%</span></div><div class="br"><i style="width:${pct}%"></i></div></div><div class="sec"><h3><i class="fas fa-server"></i> <span id="l6">آدرس‌های DNS</span></h3>${dnsBlockHtml}</div>${isFull ? '' : '<div class="copy-tip"><i class="fas fa-info-circle"></i> برای کپی روی آیکون 📋 کلیک کنید</div>'}<div class="sec"><h3><i class="fas fa-flag"></i> <span id="l7">کشور</span></h3><span class="tg">${countryFlag} ${countryName}</span></div><div class="st ${isActive ? 'on' : 'off'}" id="st">${isFull ? '<i class="fas fa-ban"></i> ● غیرفعال - حجم تمام شد' : (isActive ? '<i class="fas fa-check-circle"></i> ● فعال' : '<i class="fas fa-times-circle"></i> ● غیرفعال')}</div><div class="footer">تولید شده توسط پنل مدیریت DNS</div></div><script>var isFull=${isFull ? 'true' : 'false'};var tr={fa:{s:"پنل DNS اختصاصی",a:["روز باقی‌مانده","حجم باقی‌مانده","حجم کل","کاربران","مصرف حجم","آدرس‌های DNS","کشور"],o:"فعال",f:"غیرفعال",full:"غیرفعال - حجم تمام شد",dnsEmpty:"به دلیل اتمام حجم، آدرس‌های DNS غیرفعال شدند"},en:{s:"Private DNS Panel",a:["Remaining Days","Remaining Storage","Total Storage","Users","Storage Usage","DNS Addresses","Country"],o:"Active",f:"Inactive",full:"Inactive - Storage Full",dnsEmpty:"DNS addresses are disabled because storage is full"},ru:{s:"Приватная DNS панель",a:["Осталось дней","Осталось места","Всего места","Пользователи","Использование","DNS адреса","Страна"],o:"Активен",f:"Неактивен",full:"Неактивен - место закончилось",dnsEmpty:"DNS-адреса отключены из-за нехватки места"}};function sl(l){document.documentElement.lang=l;document.documentElement.dir=l==="fa"?"rtl":"ltr";var t=tr[l];document.getElementById("sub").innerHTML='<i class="fas fa-globe"></i> ${countryFlag} ${countryName} | <i class="fas fa-shield-alt"></i> '+t.s;for(var i=0;i<7;i++)document.getElementById("l"+(i+1)).innerHTML=t.a[i];var stEl=document.getElementById("st");if(isFull){stEl.innerHTML='<i class="fas fa-ban"></i> ● '+t.full}else{stEl.innerHTML=stEl.classList.contains("on")?'<i class="fas fa-check-circle"></i> ● '+t.o:'<i class="fas fa-times-circle"></i> ● '+t.f}var dnsMsg=document.getElementById("dnsEmptyMsg");if(dnsMsg)dnsMsg.innerHTML=t.dnsEmpty;var bs=document.querySelectorAll(".ob");for(var j=0;j<3;j++)bs[j].classList.toggle("a",["fa","en","ru"][j]===l)}function sm(m){document.body.setAttribute("data-theme",m);document.querySelectorAll(".ob")[3].classList.toggle("a",m==="light");document.querySelectorAll(".ob")[4].classList.toggle("a",m==="dark")}function copyDNS(d){if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(d).then(()=>{alert("✅ Copied: "+d)}).catch(()=>{tryFallback(d)})}else{tryFallback(d)}}function tryFallback(d){try{var i=document.createElement("input");i.value=d;i.style.position="fixed";i.style.opacity="0";document.body.appendChild(i);i.select();var s=document.execCommand("copy");document.body.removeChild(i);if(s){alert("✅ Copied: "+d)}else{alert("❌ Copy failed! Please copy manually: "+d)}}catch(e){alert("❌ Copy failed! Please copy manually: "+d)}}</script></body></html>`;
}

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

  res.send(buildPanelPage(panel));
});

// ========== START SERVER ==========
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Login: http://localhost:${PORT}`);
  console.log(`🔑 Username: ${process.env.ADMIN_USERNAME || 'admin'}`);
  console.log(`🔑 Password: ${process.env.ADMIN_PASSWORD || 'admin'}`);
});
