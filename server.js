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
    return res.send('پنل یافت نشد');
  }

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

// ========== START SERVER ==========
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Login: http://localhost:${PORT}`);
  console.log(`🔑 Username: ${process.env.ADMIN_USERNAME || 'admin'}`);
  console.log(`🔑 Password: ${process.env.ADMIN_PASSWORD || 'admin'}`);
});
