const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

// ============================================================
// APP
// ============================================================

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static('public'));

// ============================================================
// STORAGE
// ============================================================

let panels = [];
let aiHistory = [];

// ============================================================
// SUBSCRIPTION SETTINGS
// ============================================================

const DEFAULT_SUBSCRIPTION_SETTINGS = {
  // 1
  enabled: true,

  // 2, 3, 4
  format: 'base64', // base64 | plain | json

  // 5, 6
  autoRefresh: true,
  refreshMinutes: 30,

  // 7
  includeName: true,

  // 8
  includeStatus: true,

  // 9
  includeDns: true,

  // 10
  includeCountry: true,

  // 11
  includeUsers: true,

  // 12
  includeStorage: true,

  // 13
  includeRemainingDays: true,

  // 14
  includeUsedStorage: true,

  // 15
  includeTraffic: true,

  // 16
  includeCreatedAt: true,

  // 17
  allowInactive: false,

  // 18
  hideFullPanels: true,

  // 19
  hideExpiredPanels: true,

  // 20
  sortBy: 'name', // name | createdAt | remainingDays | storage

  // 21
  sortOrder: 'asc', // asc | desc

  // 22
  deduplicate: true,

  // 23
  maxItems: 100,

  // 24
  cacheSeconds: 60,

  // 25
  addSecurityHeaders: true,

  // 26
  includeDnsLabels: true,

  // 27
  includePanelSlug: true,

  // 28
  customHost: '',

  // 29
  customPath: '',

  // 30
  customFooter: '',

  // اضافی
  userAgent: '',
  compress: false,
  forceHttps: true
};

const AVAILABLE_COLORS = {
  blue: ['blue', 'آبی'],
  purple: ['purple', 'بنفش'],
  green: ['green', 'سبز'],
  rose: ['rose', 'صورتی', 'pink'],
  brown: ['brown', 'قهوه ای', 'قهوه‌ای'],
  red: ['red', 'قرمز'],
  orange: ['orange', 'نارنجی'],
  teal: ['teal', 'فیروزه ای', 'فیروزه‌ای']
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

// ============================================================
// HELPERS
// ============================================================

function normalizeSubscriptionSettings(settings = {}) {
  const merged = {
    ...DEFAULT_SUBSCRIPTION_SETTINGS,
    ...settings
  };

  return {
    ...merged,

    enabled: merged.enabled !== false,

    format: ['base64', 'plain', 'json'].includes(merged.format)
      ? merged.format
      : 'base64',

    autoRefresh: merged.autoRefresh !== false,

    refreshMinutes: Math.max(
      1,
      Number(merged.refreshMinutes) || 30
    ),

    cacheSeconds: Math.max(
      0,
      Number(merged.cacheSeconds) || 60
    ),

    maxItems: Math.max(
      1,
      Number(merged.maxItems) || 100
    ),

    sortBy: [
      'name',
      'createdAt',
      'remainingDays',
      'storage'
    ].includes(merged.sortBy)
      ? merged.sortBy
      : 'name',

    sortOrder:
      merged.sortOrder === 'desc'
        ? 'desc'
        : 'asc',

    customHost:
      typeof merged.customHost === 'string'
        ? merged.customHost.trim()
        : '',

    customPath:
      typeof merged.customPath === 'string'
        ? merged.customPath.trim()
        : '',

    userAgent:
      typeof merged.userAgent === 'string'
        ? merged.userAgent.trim()
        : '',

    customFooter:
      typeof merged.customFooter === 'string'
        ? merged.customFooter
        : ''
  };
}

function getSubscriptionSettings(panel) {
  if (!panel.subscription) {
    panel.subscription = {};
  }

  panel.subscription =
    normalizeSubscriptionSettings(panel.subscription);

  return panel.subscription;
}

function getBaseUrl(req) {
  if (process.env.PUBLIC_URL) {
    return process.env.PUBLIC_URL.replace(/\/+$/, '');
  }

  let protocol =
    req.headers['x-forwarded-proto'] ||
    req.protocol ||
    'http';

  if (process.env.FORCE_HTTPS === 'true') {
    protocol = 'https';
  }

  const host =
    process.env.PUBLIC_HOST ||
    req.get('host');

  return `${protocol}://${host}`;
}

function getSubscriptionUrl(req, panel) {
  const settings = getSubscriptionSettings(panel);

  const base =
    settings.customHost ||
    getBaseUrl(req);

  let customPath =
    settings.customPath || '/SUB';

  customPath =
    '/' +
    customPath
      .replace(/^\/+/, '')
      .replace(/\/+$/, '');

  return `${base}${customPath}/${encodeURIComponent(panel.slug)}`;
}

function generateSlug(name) {
  const base = (name || 'panel')
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'panel';

  const chars =
    'abcdefghijklmnopqrstuvwxyz0123456789';

  let random = '';

  for (let i = 0; i < 5; i++) {
    random +=
      chars[Math.floor(Math.random() * chars.length)];
  }

  return `${random}-${base}`;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function encodeBase64(text) {
  return Buffer
    .from(text, 'utf8')
    .toString('base64');
}

// ============================================================
// SUBSCRIPTION BUILDER
// ============================================================

function buildSubscriptionItems(panel) {
  const settings =
    getSubscriptionSettings(panel);

  let dnsList =
    Array.isArray(panel.dns)
      ? panel.dns
      : [];

  if (!settings.includeDns) {
    dnsList = [];
  }

  const labels = [
    'Primary',
    'Secondary',
    'Tertiary'
  ];

  let items = dnsList.map((address, index) => {
    const item = {
      address: String(address)
    };

    if (settings.includeName) {
      item.name = panel.name;
    }

    if (settings.includeStatus) {
      item.status =
        panel.status || 'inactive';
    }

    if (settings.includeCountry) {
      item.country =
        panel.countryName || 'N/A';

      item.flag =
        panel.countryFlag || '';
    }

    if (settings.includeUsers) {
      item.users =
        Number(panel.users) || 0;
    }

    if (settings.includeStorage) {
      item.storage =
        Number(panel.storage) || 0;
    }

    if (settings.includeRemainingDays) {
      item.remainingDays =
        Number(panel.remainingDays) || 0;
    }

    if (settings.includeUsedStorage) {
      item.usedStorage =
        Number(panel.usedStorage) || 0;
    }

    if (settings.includeTraffic) {
      const total =
        Number(panel.storage) || 0;

      const used =
        Number(panel.usedStorage) || 0;

      item.traffic = {
        totalGB: total,
        usedGB: used,
        remainingGB:
          Math.max(0, total - used),
        usagePercent:
          total > 0
            ? Math.min(
                100,
                Math.round(
                  (used / total) * 100
                )
              )
            : 0
      };
    }

    if (settings.includeCreatedAt) {
      item.createdAt =
        panel.createdAt ||
        new Date().toISOString();
    }

    if (settings.includeDnsLabels) {
      item.dnsLabel =
        labels[index] ||
        `DNS ${index + 1}`;
    }

    if (settings.includePanelSlug) {
      item.slug =
        panel.slug;
    }

    return item;
  });

  // حذف DNS های تکراری
  if (settings.deduplicate) {
    const seen = new Set();

    items = items.filter(item => {
      if (seen.has(item.address)) {
        return false;
      }

      seen.add(item.address);
      return true;
    });
  }

  // مرتب سازی
  items.sort((a, b) => {
    let av;
    let bv;

    switch (settings.sortBy) {
      case 'createdAt':
        av =
          a.createdAt || '';

        bv =
          b.createdAt || '';
        break;

      case 'remainingDays':
        av =
          Number(a.remainingDays) || 0;

        bv =
          Number(b.remainingDays) || 0;
        break;

      case 'storage':
        av =
          Number(a.storage) || 0;

        bv =
          Number(b.storage) || 0;
        break;

      default:
        av =
          String(
            a.name ||
            a.address ||
            ''
          ).toLowerCase();

        bv =
          String(
            b.name ||
            b.address ||
            ''
          ).toLowerCase();
    }

    if (av < bv) {
      return settings.sortOrder === 'asc'
        ? -1
        : 1;
    }

    if (av > bv) {
      return settings.sortOrder === 'asc'
        ? 1
        : -1;
    }

    return 0;
  });

  items =
    items.slice(
      0,
      settings.maxItems
    );

  return items;
}

function buildSubscriptionContent(panel) {
  const settings =
    getSubscriptionSettings(panel);

  // غیرفعال بودن ساب
  if (!settings.enabled) {
    return {
      contentType:
        'text/plain; charset=utf-8',

      content:
        'SUBSCRIPTION_DISABLED'
    };
  }

  const storage =
    Number(panel.storage) || 0;

  const usedStorage =
    Number(panel.usedStorage) || 0;

  const remainingDays =
    Number(panel.remainingDays) || 0;

  const isFull =
    storage > 0 &&
    usedStorage >= storage;

  const isExpired =
    remainingDays <= 0;

  // پنل inactive
  if (
    !settings.allowInactive &&
    panel.status !== 'active'
  ) {
    return {
      contentType:
        'text/plain; charset=utf-8',

      content:
        'SUBSCRIPTION_INACTIVE'
    };
  }

  // حجم تمام شده
  if (
    settings.hideFullPanels &&
    isFull
  ) {
    return {
      contentType:
        'text/plain; charset=utf-8',

      content:
        'SUBSCRIPTION_FULL'
    };
  }

  // منقضی شده
  if (
    settings.hideExpiredPanels &&
    isExpired
  ) {
    return {
      contentType:
        'text/plain; charset=utf-8',

      content:
        'SUBSCRIPTION_EXPIRED'
    };
  }

  const items =
    buildSubscriptionItems(panel);

  // =========================
  // JSON
  // =========================

  if (settings.format === 'json') {
    const result = {
      subscription: {}
    };

    if (settings.includeName) {
      result.subscription.name =
        panel.name;
    }

    if (settings.includePanelSlug) {
      result.subscription.slug =
        panel.slug;
    }

    if (settings.includeStatus) {
      result.subscription.status =
        panel.status;
    }

    if (settings.includeCountry) {
      result.subscription.country =
        panel.countryName ||
        'N/A';

      result.subscription.flag =
        panel.countryFlag ||
        '';
    }

    if (settings.includeRemainingDays) {
      result.subscription.remainingDays =
        remainingDays;
    }

    if (settings.includeStorage) {
      result.subscription.storage =
        storage;
    }

    if (settings.includeUsedStorage) {
      result.subscription.usedStorage =
        usedStorage;
    }

    if (settings.includeUsers) {
      result.subscription.users =
        Number(panel.users) || 0;
    }

    if (settings.includeCreatedAt) {
      result.subscription.createdAt =
        panel.createdAt ||
        null;
    }

    result.subscription.updatedAt =
      new Date().toISOString();

    result.items = items;

    return {
      contentType:
        'application/json; charset=utf-8',

      content:
        JSON.stringify(
          result,
          null,
          2
        )
    };
  }

  // =========================
  // PLAIN / BASE64
  // =========================

  const lines =
    items.map(item => {
      let line = item.address;

      if (
        settings.includeName &&
        item.name
      ) {
        line =
          `${item.name} | ${line}`;
      }

      if (
        settings.includeDnsLabels &&
        item.dnsLabel
      ) {
        line =
          `${item.dnsLabel}: ${line}`;
      }

      if (
        settings.includeCountry &&
        item.country
      ) {
        line +=
          ` | ${item.country}`;
      }

      if (
        settings.includeRemainingDays
      ) {
        line +=
          ` | ${item.remainingDays}d`;
      }

      if (
        settings.includeStorage
      ) {
        line +=
          ` | ${item.storage}GB`;
      }

      return line;
    });

  if (settings.customFooter) {
    lines.push('');
    lines.push(
      settings.customFooter
    );
  }

  const plainText =
    lines.join('\n');

  if (
    settings.format === 'base64'
  ) {
    return {
      contentType:
        'text/plain; charset=utf-8',

      content:
        encodeBase64(plainText)
    };
  }

  return {
    contentType:
      'text/plain; charset=utf-8',

    content:
      plainText
  };
}

// ============================================================
// PUBLIC PAGES
// ============================================================

app.get('/', (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      'public',
      'index.html'
    )
  );
});

app.get('/dashboard', (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      'public',
      'dashboard.html'
    )
  );
});

app.get('/settings', (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      'public',
      'settings.html'
    )
  );
});

app.get('/ai', (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      'public',
      'ai.html'
    )
  );
});

// ============================================================
// LOGIN
// ============================================================

app.post('/api/login', (req, res) => {
  const {
    username,
    password
  } = req.body;

  if (
    username ===
      process.env.ADMIN_USERNAME &&
    password ===
      process.env.ADMIN_PASSWORD
  ) {
    return res.json({
      success: true,
      message: 'Login successful'
    });
  }

  return res.status(401).json({
    success: false,
    message:
      'Invalid credentials'
  });
});

// ============================================================
// PANEL API
// ============================================================

app.get('/api/panels', (req, res) => {
  res.json(panels);
});

// ------------------------------------------------------------
// CREATE
// ------------------------------------------------------------

app.post('/api/panels', (req, res) => {
  try {
    const body =
      req.body || {};

    const name =
      String(
        body.name ||
        'پنل جدید'
      ).trim();

    const days =
      Number(body.days) || 30;

    const storage =
      Number(body.storage) || 100;

    const users =
      Number(body.users) || 10;

    let slug =
      generateSlug(name);

    if (
      panels.some(
        p => p.slug === slug
      )
    ) {
      slug +=
        '-' +
        Date.now()
          .toString()
          .slice(-4);
    }

    const panel = {
      id: Date.now(),

      name,

      slug,

      createdAt:
        new Date().toISOString(),

      days,

      remainingDays:
        days,

      storage,

      usedStorage: 0,

      users,

      countries: [
        'germany'
      ],

      dns: [
        '10.202.10.10',
        '114.114.114.114'
      ],

      dnsService:
        'radar',

      dnsServiceName:
        'رادار',

      countryName:
        'آلمان',

      countryFlag:
        '🇩🇪',

      status:
        'active',

      panelSettings: {
        color: 'blue',
        mode: 'light',
        showDns: true,
        showFlags: true,
        compact: false
      },

      subscription: {
        ...DEFAULT_SUBSCRIPTION_SETTINGS
      }
    };

    panels.unshift(panel);

    return res.json({
      success: true,
      panel
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message:
        error.message
    });
  }
});

// ------------------------------------------------------------
// UPDATE
// ------------------------------------------------------------

app.put(
  '/api/panels/:id',
  (req, res) => {
    const id =
      parseInt(
        req.params.id
      );

    const index =
      panels.findIndex(
        p => p.id === id
      );

    if (index === -1) {
      return res.status(404).json({
        success: false,
        message:
          'Panel not found'
      });
    }

    panels[index] = {
      ...panels[index],
      ...req.body
    };

    return res.json({
      success: true,
      panel:
        panels[index]
    });
  }
);

// ------------------------------------------------------------
// DELETE
// ------------------------------------------------------------

app.delete(
  '/api/panels/:id',
  (req, res) => {
    const id =
      parseInt(
        req.params.id
      );

    panels =
      panels.filter(
        p => p.id !== id
      );

    return res.json({
      success: true
    });
  }
);

// ------------------------------------------------------------
// TOGGLE
// ------------------------------------------------------------

app.patch(
  '/api/panels/:id/toggle',
  (req, res) => {
    const id =
      parseInt(
        req.params.id
      );

    const index =
      panels.findIndex(
        p => p.id === id
      );

    if (index === -1) {
      return res.status(404).json({
        success: false,
        message:
          'Panel not found'
      });
    }

    panels[index].status =
      panels[index].status ===
      'active'
        ? 'inactive'
        : 'active';

    return res.json({
      success: true,
      panel:
        panels[index]
    });
  }
);

// ------------------------------------------------------------
// GET BY SLUG
// ------------------------------------------------------------

app.get(
  '/api/panel/:slug',
  (req, res) => {
    const slug =
      req.params.slug;

    const panel =
      panels.find(
        p => p.slug === slug
      );

    if (!panel) {
      return res.status(404).json({
        success: false,
        message:
          'Panel not found'
      });
    }

    return res.json({
      success: true,
      panel
    });
  }
);

// ============================================================
// SUBSCRIPTION SETTINGS API
// ============================================================

// دریافت تنظیمات
app.get(
  '/api/panels/:id/subscription',
  (req, res) => {
    const id =
      parseInt(
        req.params.id
      );

    const panel =
      panels.find(
        p => p.id === id
      );

    if (!panel) {
      return res.status(404).json({
        success: false,
        message:
          'Panel not found'
      });
    }

    const settings =
      getSubscriptionSettings(
        panel
      );

    return res.json({
      success: true,

      settings,

      subscriptionUrl:
        getSubscriptionUrl(
          req,
          panel
        )
    });
  }
);

// ذخیره تنظیمات
app.put(
  '/api/panels/:id/subscription',
  (req, res) => {
    const id =
      parseInt(
        req.params.id
      );

    const panel =
      panels.find(
        p => p.id === id
      );

    if (!panel) {
      return res.status(404).json({
        success: false,
        message:
          'Panel not found'
      });
    }

    const current =
      getSubscriptionSettings(
        panel
      );

    panel.subscription =
      normalizeSubscriptionSettings({
        ...current,
        ...(req.body || {})
      });

    return res.json({
      success: true,

      settings:
        panel.subscription,

      subscriptionUrl:
        getSubscriptionUrl(
          req,
          panel
        )
    });
  }
);

// ریست تنظیمات
app.post(
  '/api/panels/:id/subscription/reset',
  (req, res) => {
    const id =
      parseInt(
        req.params.id
      );

    const panel =
      panels.find(
        p => p.id === id
      );

    if (!panel) {
      return res.status(404).json({
        success: false,
        message:
          'Panel not found'
      });
    }

    panel.subscription = {
      ...DEFAULT_SUBSCRIPTION_SETTINGS
    };

    return res.json({
      success: true,

      settings:
        panel.subscription,

      subscriptionUrl:
        getSubscriptionUrl(
          req,
          panel
        )
    });
  }
);

// ============================================================
// SUBSCRIPTION URL
// ============================================================
//
// https://domain.com/SUB/slug
//
// ============================================================

app.get(
  '/SUB/:slug',
  (req, res) => {
    const slug =
      req.params.slug;

    const panel =
      panels.find(
        p => p.slug === slug
      );

    if (!panel) {
      return res.status(404).send(
        'Subscription not found'
      );
    }

    const settings =
      getSubscriptionSettings(
        panel
      );

    const result =
      buildSubscriptionContent(
        panel
      );

    // Security headers
    if (
      settings.addSecurityHeaders
    ) {
      res.setHeader(
        'X-Content-Type-Options',
        'nosniff'
      );

      res.setHeader(
        'X-Frame-Options',
        'DENY'
      );

      res.setHeader(
        'Referrer-Policy',
        'no-referrer'
      );

      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; frame-ancestors 'none'"
      );
    }

    // Cache
    if (
      settings.cacheSeconds > 0
    ) {
      res.setHeader(
        'Cache-Control',
        `public, max-age=${settings.cacheSeconds}`
      );
    } else {
      res.setHeader(
        'Cache-Control',
        'no-store'
      );
    }

    // User Agent سفارشی
    if (
      settings.userAgent
    ) {
      res.setHeader(
        'X-Subscription-User-Agent',
        settings.userAgent
      );
    }

    // Content-Type
    res.setHeader(
      'Content-Type',
      result.contentType
    );

    return res.send(
      result.content
    );
  }
);

// ============================================================
// AI
// ============================================================

app.post(
  '/api/ai/chat',
  async (req, res) => {

    const {
      message
    } = req.body;

    if (
      !message ||
      typeof message !== 'string' ||
      !message.trim()
    ) {
      return res.json({
        success: false,
        message:
          '❌ پیام خالی است'
      });
    }

    console.log(
      '📨 پیام کاربر:',
      message
    );

    const apiKey =
      process.env.AI_API_KEY;

    const baseUrl =
      process.env.AI_BASE_URL ||
      'https://api.vivgrid.com/v1';

    const model =
      process.env.AI_MODEL ||
      'deepseek-chat';

    if (!apiKey) {
      return res.json({
        success: false,

        message:
          '❌ API Key تنظیم نشده است. لطفاً AI_API_KEY را در .env تنظیم کنید.'
      });
    }

    try {

      const panelsInfo =
        panels.map(p => ({
          id: p.id,

          name: p.name,

          slug: p.slug,

          days:
            p.remainingDays,

          storage:
            p.storage,

          usedStorage:
            p.usedStorage || 0,

          users:
            p.users,

          country:
            p.countryName || 'N/A',

          status:
            p.status,

          color:
            p.panelSettings?.color ||
            'blue',

          mode:
            p.panelSettings?.mode ||
            'light'
        }));

      const systemPrompt = `
You are an assistant for a DNS panel management dashboard.

CURRENT PANELS:
${panelsInfo.length
  ? JSON.stringify(
      panelsInfo,
      null,
      2
    )
  : 'No panels exist yet.'}

AVAILABLE COLORS:
${VALID_COLOR_KEYS.join(', ')}

You must respond with ONLY a raw JSON object:

{
  "reply": "short friendly message",
  "action": null
}

Allowed actions:

{
  "type":"create_panel",
  "data":{
    "name":"string",
    "days":number,
    "storage":number,
    "users":number
  }
}

{
  "type":"delete_panel",
  "data":{
    "name":"string"
  }
}

{
  "type":"delete_all"
}

{
  "type":"change_theme",
  "data":{
    "color":"blue"
  }
}

{
  "type":"change_mode",
  "data":{
    "mode":"dark"
  }
}

{
  "type":"list_panels"
}

{
  "type":"change_storage",
  "data":{
    "name":"string",
    "amount":number
  }
}

{
  "type":"add_days",
  "data":{
    "name":"string",
    "days":number
  }
}

STRICT RULES:

- Greetings are never actions.
- Questions are never actions.
- Small talk is never actions.
- Only explicit requests perform actions.
- Unknown colors are never actions.
- Create defaults:
  days=30
  storage=100
  users=10
- Valid JSON only.
`;

      const response =
        await fetch(
          `${baseUrl}/chat/completions`,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',

              'Authorization':
                `Bearer ${apiKey}`
            },

            body: JSON.stringify({
              model,

              messages: [
                {
                  role:
                    'system',

                  content:
                    systemPrompt
                },

                {
                  role:
                    'user',

                  content:
                    message
                }
              ],

              temperature: 0.2,

              max_tokens: 600,

              response_format: {
                type:
                  'json_object'
              }
            })
          }
        );

      const data =
        await response.json();

      console.log(
        'AI Response Status:',
        response.status
      );

      if (!response.ok) {

        console.error(
          'AI API Error:',
          JSON.stringify(
            data,
            null,
            2
          )
        );

        let errorMsg =
          '❌ خطا در ارتباط با هوش مصنوعی';

        if (
          data.error?.message
        ) {
          errorMsg +=
            `: ${data.error.message}`;
        } else if (
          data.message
        ) {
          errorMsg +=
            `: ${data.message}`;
        }

        return res.json({
          success: false,
          message:
            errorMsg
        });
      }

      if (
        !data.choices ||
        !data.choices[0] ||
        !data.choices[0].message
      ) {
        return res.json({
          success: false,
          message:
            '❌ پاسخ غیرمنتظره از API دریافت شد'
        });
      }

      const rawContent =
        data.choices[0]
          .message.content;

      console.log(
        '🤖 پاسخ خام AI:',
        rawContent
      );

      let parsed;

      try {

        const cleaned =
          rawContent
            .replace(
              /```json|```/g,
              ''
            )
            .trim();

        parsed =
          JSON.parse(cleaned);

      } catch (error) {

        console.error(
          'JSON parse error:',
          error
        );

        aiHistory.push({
          role: 'user',
          content: message,
          timestamp:
            new Date().toISOString()
        });

        aiHistory.push({
          role: 'assistant',
          content:
            rawContent,
          timestamp:
            new Date().toISOString()
        });

        return res.json({
          success: true,
          message:
            rawContent,
          action: null,
          actionResult: null
        });
      }

      const replyText =
        typeof parsed.reply === 'string'
          ? parsed.reply
          : '';

      let action =
        parsed.action || null;

      // Validation
      if (action) {

        if (
          !VALID_ACTION_TYPES.includes(
            action.type
          )
        ) {
          action = null;

        } else if (
          action.type ===
          'change_theme'
        ) {

          const color =
            action.data?.color;

          if (
            !VALID_COLOR_KEYS.includes(
              color
            )
          ) {
            action = null;
          }
        }
      }

      let actionResult = null;

      if (action) {

        console.log(
          '⚡ اجرای اکشن:',
          action
        );

        actionResult =
          executeAction(
            action
          );

        console.log(
          '📊 نتیجه:',
          actionResult
        );
      }

      let finalMessage =
        replyText || '...';

      if (actionResult) {

        finalMessage =
          actionResult.success
            ? `${replyText}\n\n${actionResult.message}`.trim()
            : actionResult.message;
      }

      aiHistory.push({
        role: 'user',
        content: message,
        timestamp:
          new Date().toISOString()
      });

      aiHistory.push({
        role: 'assistant',
        content:
          finalMessage,
        timestamp:
          new Date().toISOString()
      });

      return res.json({
        success: true,

        message:
          finalMessage,

        action,

        actionResult
      });

    } catch (error) {

      console.error(
        'AI Error:',
        error
      );

      return res.json({
        success: false,

        message:
          `❌ خطا در ارتباط: ${error.message}`
      });
    }
  }
);

// ============================================================
// AI ACTIONS
// ============================================================

function executeAction(action) {

  if (!action) {
    return {
      success: false,
      message:
        'اکشن یافت نشد'
    };
  }

  try {

    switch (action.type) {

      // ------------------------------------------------------
      // CREATE
      // ------------------------------------------------------

      case 'create_panel': {

        const name =
          String(
            action.data?.name ||
            'پنل جدید'
          ).trim();

        const days =
          Number.isFinite(
            action.data?.days
          )
            ? action.data.days
            : 30;

        const storage =
          Number.isFinite(
            action.data?.storage
          )
            ? action.data.storage
            : 100;

        const users =
          Number.isFinite(
            action.data?.users
          )
            ? action.data.users
            : 10;

        const slug =
          generateSlug(name);

        const exists =
          panels.some(
            p => p.slug === slug
          );

        const finalSlug =
          exists
            ? `${slug}-${Date.now()
                .toString()
                .slice(-4)}`
            : slug;

        const newPanel = {

          id: Date.now(),

          name,

          slug:
            finalSlug,

          createdAt:
            new Date().toISOString(),

          days,

          remainingDays:
            days,

          storage,

          usedStorage: 0,

          users,

          countries: [
            'germany'
          ],

          dns: [
            '10.202.10.10',
            '114.114.114.114'
          ],

          dnsService:
            'radar',

          dnsServiceName:
            'رادار',

          countryName:
            'آلمان',

          countryFlag:
            '🇩🇪',

          status:
            'active',

          panelSettings: {
            color: 'blue',
            mode: 'light',
            showDns: true,
            showFlags: true,
            compact: false
          },

          subscription: {
            ...DEFAULT_SUBSCRIPTION_SETTINGS
          }
        };

        panels.unshift(
          newPanel
        );

        return {
          success: true,

          message:
            `✅ پنل "${name}" با ${days} روز، ${storage} گیگ و ${users} کاربر ساخته شد`,

          panel:
            newPanel
        };
      }

      // ------------------------------------------------------
      // DELETE
      // ------------------------------------------------------

      case 'delete_panel': {

        const name =
          String(
            action.data?.name ||
            ''
          );

        const lowerName =
          name.toLowerCase();

        const panel =
          panels.find(p =>
            p.name
              .toLowerCase() ===
              lowerName ||

            p.slug
              .toLowerCase() ===
              lowerName ||

            p.name
              .toLowerCase()
              .includes(
                lowerName
              )
          );

        if (!panel) {
          return {
            success: false,

            message:
              `❌ پنل "${name}" یافت نشد`
          };
        }

        const panelName =
          panel.name;

        panels =
          panels.filter(
            p => p.id !== panel.id
          );

        return {
          success: true,

          message:
            `✅ پنل "${panelName}" با موفقیت حذف شد`
        };
      }

      // ------------------------------------------------------
      // DELETE ALL
      // ------------------------------------------------------

      case 'delete_all': {

        const count =
          panels.length;

        panels = [];

        return {
          success: true,

          message:
            `✅ ${count} پنل با موفقیت حذف شدند`
        };
      }

      // ------------------------------------------------------
      // THEME
      // ------------------------------------------------------

      case 'change_theme': {

        const color =
          action.data.color;

        panels.forEach(p => {

          if (
            !p.panelSettings
          ) {
            p.panelSettings = {};
          }

          p.panelSettings.color =
            color;
        });

        return {
          success: true,

          message:
            `✅ تم همه پنل‌ها به "${color}" تغییر کرد`
        };
      }

      // ------------------------------------------------------
      // MODE
      // ------------------------------------------------------

      case 'change_mode': {

        const mode =
          action.data?.mode ===
          'dark'
            ? 'dark'
            : 'light';

        const modeName =
          mode === 'dark'
            ? 'تاریک'
            : 'روشن';

        panels.forEach(p => {

          if (
            !p.panelSettings
          ) {
            p.panelSettings = {};
          }

          p.panelSettings.mode =
            mode;
        });

        return {
          success: true,

          message:
            `✅ حالت همه پنل‌ها به "${modeName}" تغییر کرد`
        };
      }

      // ------------------------------------------------------
      // LIST
      // ------------------------------------------------------

      case 'list_panels': {

        if (
          panels.length === 0
        ) {
          return {
            success: true,

            message:
              '📭 هیچ پنلی وجود ندارد'
          };
        }

        let list =
          '📋 لیست پنل‌ها:\n';

        panels.forEach(
          (p, i) => {

            const status =
              p.status ===
              'active'
                ? '✅'
                : '❌';

            list +=
              `${i + 1}. 📡 ${p.name} ${status} ${p.remainingDays} روز | ${p.storage}GB\n`;
          }
        );

        return {
          success: true,
          message:
            list
        };
      }

      // ------------------------------------------------------
      // STORAGE
      // ------------------------------------------------------

      case 'change_storage': {

        const name =
          String(
            action.data?.name ||
            ''
          );

        const amount =
          Number(
            action.data?.amount
          );

        const panel =
          panels.find(
            p =>
              p.name
                .toLowerCase() ===
              name.toLowerCase()
          );

        if (
          panel &&
          Number.isFinite(
            amount
          )
        ) {

          panel.storage =
            amount;

          return {
            success: true,

            message:
              `✅ حجم پنل "${name}" به ${amount} گیگ تغییر کرد`
          };
        }

        return {
          success: false,

          message:
            `❌ پنل "${name}" یافت نشد`
        };
      }

      // ------------------------------------------------------
      // ADD DAYS
      // ------------------------------------------------------

      case 'add_days': {

        const name =
          String(
            action.data?.name ||
            ''
          );

        const days =
          Number(
            action.data?.days
          );

        const panel =
          panels.find(
            p =>
              p.name
                .toLowerCase() ===
              name.toLowerCase()
          );

        if (
          panel &&
          Number.isFinite(days)
        ) {

          panel.remainingDays +=
            days;

          panel.days +=
            days;

          return {
            success: true,

            message:
              `✅ ${days} روز به پنل "${name}" اضافه شد`
          };
        }

        return {
          success: false,

          message:
            `❌ پنل "${name}" یافت نشد`
        };
      }

      default:

        return {
          success: false,

          message:
            `❌ اکشن ناشناخته: ${action.type}`
        };
    }

  } catch (error) {

    return {
      success: false,

      message:
        `❌ خطا: ${error.message}`
    };
  }
}

// ============================================================
// AI HISTORY
// ============================================================

app.get(
  '/api/ai/history',
  (req, res) => {
    res.json(
      aiHistory
    );
  }
);

app.delete(
  '/api/ai/history',
  (req, res) => {

    aiHistory = [];

    res.json({
      success: true
    });
  }
);

// ============================================================
// PANEL PAGE
// ============================================================

const COLOR_THEMES = {

  blue: {
    a: '#007bff',
    d: '#0056b3',
    p: '#e6f2ff'
  },

  purple: {
    a: '#8b5cf6',
    d: '#6d28d9',
    p: '#f0e9ff'
  },

  green: {
    a: '#22c55e',
    d: '#15803d',
    p: '#e6f9ee'
  },

  rose: {
    a: '#f43f5e',
    d: '#be123c',
    p: '#ffe6ec'
  },

  brown: {
    a: '#92400e',
    d: '#6b3410',
    p: '#f5ebe0'
  },

  red: {
    a: '#ef4444',
    d: '#b91c1c',
    p: '#fde8e8'
  },

  orange: {
    a: '#f97316',
    d: '#c2410c',
    p: '#fff1e6'
  },

  teal: {
    a: '#14b8a6',
    d: '#0f766e',
    p: '#e6faf8'
  }
};

function buildPanelPage(panel) {

  const storage =
    Number(panel.storage) || 0;

  const usedStorage =
    Number(panel.usedStorage) || 0;

  const isFull =
    storage > 0 &&
    usedStorage >= storage;

  const colorKey =
    isFull
      ? 'red'
      : (
          panel.panelSettings?.color ||
          'blue'
        );

  const theme =
    COLOR_THEMES[colorKey] ||
    COLOR_THEMES.blue;

  const mode =
    panel.panelSettings?.mode ===
    'dark'
      ? 'dark'
      : 'light';

  const remaining =
    Math.max(
      0,
      storage - usedStorage
    );

  const pct =
    storage > 0
      ? Math.min(
          100,
          Math.round(
            (usedStorage /
              storage) *
              100
          )
        )
      : 0;

  const isActive =
    panel.status === 'active' &&
    !isFull;

  const dnsList =
    Array.isArray(panel.dns)
      ? panel.dns
      : [];

  const dnsLabels = [
    'Primary',
    'Secondary',
    'Tertiary'
  ];

  const dnsBlockHtml =
    isFull
      ? `
        <div class="dns-empty">
          <i class="fas fa-ban"></i>
          <span id="dnsEmptyMsg">
            به دلیل اتمام حجم، آدرس‌های DNS غیرفعال شدند
          </span>
        </div>
      `
      : dnsList
          .map(
            (addr, i) => `
              <div class="di">
                ${i === 0 ? '🟢' : '🟡'}
                ${dnsLabels[i] || 'DNS ' + (i + 1)}:
                ${escapeHtml(addr)}

                <button
                  onclick="copyDNS('${escapeHtml(addr)}')"
                  style="
                    background:none;
                    border:0;
                    color:var(--a);
                    cursor:pointer;
                  "
                >
                  <i class="fas fa-copy"></i>
                </button>
              </div>
            `
          )
          .join('');

  const countryFlag =
    panel.countryFlag || '🏳️';

  const countryName =
    escapeHtml(
      panel.countryName ||
      'N/A'
    );

  return `
<!DOCTYPE html>

<html
  lang="fa"
  dir="rtl"
>

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1.0"
>

<title>
${escapeHtml(panel.name)}
</title>

<link
  href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700&display=swap"
  rel="stylesheet"
>

<link
  rel="stylesheet"
  href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"
>

<style>

:root{
  --p:${theme.p};
  --a:${theme.a};
  --d:${theme.d};
  --bg:linear-gradient(
    135deg,
    ${theme.p},
    #f0f8ff
  );
  --c:#fff;
  --t:#333;
  --t2:#666;
  --b:#d1e7ff;
  --s:#28a745;
}

[data-theme="dark"]{
  --bg:linear-gradient(
    135deg,
    #0f172a,
    #1e293b
  );
  --c:#1e293b;
  --t:#e2e8f0;
  --t2:#94a3b8;
  --b:#334155;
  --p:${theme.p};
  --a:${theme.a};
}

*{
  margin:0;
  padding:0;
  box-sizing:border-box;
  font-family:Vazirmatn,sans-serif;
}

body{
  background:var(--bg);
  min-height:100vh;
  padding:20px;
  color:var(--t);
  transition:.3s;
}

.box{
  max-width:480px;
  margin:40px auto;
  background:var(--c);
  border-radius:24px;
  padding:32px;
  border:1px solid var(--b);
  box-shadow:
    0 8px 30px
    rgba(0,0,0,.1);
}

.logo{
  width:70px;
  height:70px;
  margin:0 auto 16px;
  border-radius:18px;
  background:
    linear-gradient(
      135deg,
      var(--a),
      var(--d)
    );
  color:#fff;
  display:grid;
  place-items:center;
  font-size:28px;
}

h1{
  text-align:center;
  color:var(--a);
  font-size:22px;
  margin-bottom:4px;
}

.sub{
  text-align:center;
  color:var(--t2);
  font-size:12px;
  margin-bottom:20px;
}

.dns-info{
  text-align:center;
  font-size:11px;
  color:var(--t2);
  margin-bottom:16px;
  padding:8px;
  background:var(--p);
  border-radius:8px;
}

.opts{
  display:flex;
  justify-content:center;
  gap:6px;
  margin-bottom:20px;
  flex-wrap:wrap;
}

.ob{
  padding:6px 12px;
  border-radius:8px;
  border:2px solid var(--b);
  background:var(--c);
  color:var(--t);
  cursor:pointer;
  font-size:11px;
}

.ob.a{
  border-color:var(--a);
  background:var(--p);
  color:var(--a);
  font-weight:600;
}

.ig{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:10px;
  margin-bottom:16px;
}

.inf{
  background:var(--p);
  padding:12px;
  border-radius:10px;
  text-align:center;
}

.inf .l{
  font-size:10px;
  color:var(--t2);
}

.inf .v{
  font-size:16px;
  font-weight:700;
  color:var(--a);
}

.bw{
  margin-bottom:16px;
}

.bt{
  display:flex;
  justify-content:space-between;
  font-size:11px;
  color:var(--t2);
  margin-bottom:4px;
}

.br{
  height:8px;
  background:var(--b);
  border-radius:10px;
  overflow:hidden;
}

.br i{
  display:block;
  height:100%;
  background:
    linear-gradient(
      90deg,
      var(--a),
      #66b3ff
    );
}

.sec{
  margin-bottom:14px;
}

.sec h3{
  font-size:13px;
  color:var(--a);
  margin-bottom:8px;
  display:flex;
  align-items:center;
  gap:6px;
}

.di{
  background:var(--p);
  padding:10px 14px;
  border-radius:8px;
  margin-bottom:5px;
  font-family:monospace;
  font-size:13px;
  direction:ltr;
  text-align:left;
  display:flex;
  justify-content:space-between;
  align-items:center;
}

.dns-empty{
  background:var(--p);
  color:var(--a);
  padding:12px 14px;
  border-radius:8px;
  font-size:12px;
  text-align:center;
}

.tg{
  display:inline-block;
  background:var(--p);
  color:var(--a);
  padding:4px 10px;
  border-radius:6px;
  font-size:13px;
  margin:2px;
}

.st{
  text-align:center;
  margin-top:16px;
  padding:10px;
  border-radius:8px;
  font-size:12px;
  font-weight:600;
}

.st.on{
  background:rgba(
    40,
    167,
    69,
    .15
  );
  color:var(--s);
}

.st.off{
  background:rgba(
    220,
    53,
    69,
    .15
  );
  color:#dc3545;
}

.footer{
  text-align:center;
  margin-top:16px;
  font-size:10px;
  color:var(--t2);
}

.copy-tip{
  text-align:center;
  font-size:11px;
  color:var(--t2);
  margin:8px 0;
  padding:6px;
  background:
    rgba(
      255,
      193,
      7,
      .1
    );
  border-radius:6px;
  border:1px dashed
    #ffc107;
}

</style>

</head>

<body
  data-theme="${mode}"
>

<div class="box">

  <div class="logo">
    <i class="fas fa-server"></i>
  </div>

  <h1>
    ${escapeHtml(panel.name)}
  </h1>

  <p
    class="sub"
    id="sub"
  >
    <i class="fas fa-globe"></i>
    ${countryFlag}
    ${countryName}
    |
    <i class="fas fa-shield-alt"></i>
    پنل DNS اختصاصی
  </p>

  <div class="dns-info">

    سرویس:
    ${escapeHtml(
      panel.dnsServiceName || '-'
    )}

    |

    کشور:
    ${countryName}

  </div>

  <div class="opts">

    <button
      class="ob a"
      onclick="sl('fa')"
    >
      فارسی
    </button>

    <button
      class="ob"
      onclick="sl('en')"
    >
      English
    </button>

    <button
      class="ob"
      onclick="sl('ru')"
    >
      Русский
    </button>

    <button
      class="ob"
      onclick="sm('light')"
    >
      <i class="fas fa-sun"></i>
    </button>

    <button
      class="ob"
      onclick="sm('dark')"
    >
      <i class="fas fa-moon"></i>
    </button>

  </div>

  <div class="ig">

    <div class="inf">
      <div class="l" id="l1">
        روز باقی‌مانده
      </div>

      <div class="v">
        ${panel.remainingDays}
      </div>
    </div>

    <div class="inf">
      <div class="l" id="l2">
        حجم باقی‌مانده
      </div>

      <div class="v">
        ${remaining} GB
      </div>
    </div>

    <div class="inf">
      <div class="l" id="l3">
        حجم کل
      </div>

      <div class="v">
        ${storage} GB
      </div>
    </div>

    <div class="inf">
      <div class="l" id="l4">
        کاربران
      </div>

      <div class="v">
        ${panel.users}
      </div>
    </div>

  </div>

  <div class="bw">

    <div class="bt">

      <span id="l5">
        مصرف حجم
      </span>

      <span>
        ${pct}%
      </span>

    </div>

    <div class="br">
      <i
        style="width:${pct}%"
      ></i>
    </div>

  </div>

  <div class="sec">

    <h3>

      <i class="fas fa-server"></i>

      <span id="l6">
        آدرس‌های DNS
      </span>

    </h3>

    ${dnsBlockHtml}

  </div>

  ${
    isFull
      ? ''
      : `
        <div class="copy-tip">

          <i
            class="fas fa-info-circle"
          ></i>

          برای کپی روی آیکون 📋 کلیک کنید

        </div>
      `
  }

  <div class="sec">

    <h3>

      <i class="fas fa-flag"></i>

      <span id="l7">
        کشور
      </span>

    </h3>

    <span class="tg">
      ${countryFlag}
      ${countryName}
    </span>

  </div>

  <div
    class="st ${isActive ? 'on' : 'off'}"
    id="st"
  >

    ${
      isFull
        ? `
          <i class="fas fa-ban"></i>
          ● غیرفعال - حجم تمام شد
        `
        : (
            isActive
              ? `
                <i class="fas fa-check-circle"></i>
                ● فعال
              `
              : `
                <i class="fas fa-times-circle"></i>
                ● غیرفعال
              `
          )
    }

  </div>

  <div class="footer">

    تولید شده توسط پنل مدیریت DNS

  </div>

</div>

<script>

var isFull =
  ${isFull ? 'true' : 'false'};

var tr = {

  fa: {
    s:"پنل DNS اختصاصی",
    a:[
      "روز باقی‌مانده",
      "حجم باقی‌مانده",
      "حجم کل",
      "کاربران",
      "مصرف حجم",
      "آدرس‌های DNS",
      "کشور"
    ],
    o:"فعال",
    f:"غیرفعال",
    full:"غیرفعال - حجم تمام شد",
    dnsEmpty:
      "به دلیل اتمام حجم، آدرس‌های DNS غیرفعال شدند"
  },

  en: {
    s:"Private DNS Panel",
    a:[
      "Remaining Days",
      "Remaining Storage",
      "Total Storage",
      "Users",
      "Storage Usage",
      "DNS Addresses",
      "Country"
    ],
    o:"Active",
    f:"Inactive",
    full:"Inactive - Storage Full",
    dnsEmpty:
      "DNS addresses are disabled because storage is full"
  },

  ru: {
    s:"Приватная DNS панель",
    a:[
      "Осталось дней",
      "Осталось места",
      "Всего места",
      "Пользователи",
      "Использование",
      "DNS адреса",
      "Страна"
    ],
    o:"Активен",
    f:"Неактивен",
    full:"Неактивен - место закончилось",
    dnsEmpty:
      "DNS-адреса отключены из-за нехватки места"
  }

};

function sl(l){

  document.documentElement.lang =
    l;

  document.documentElement.dir =
    l === "fa"
      ? "rtl"
      : "ltr";

  var t = tr[l];

  document.getElementById(
    "sub"
  ).innerHTML =
    '<i class="fas fa-globe"></i> ${countryFlag} ${countryName} | <i class="fas fa-shield-alt"></i> ' +
    t.s;

  for(
    var i = 0;
    i < 7;
    i++
  ){

    document.getElementById(
      "l" + (i + 1)
    ).innerHTML =
      t.a[i];

  }

  var stEl =
    document.getElementById(
      "st"
    );

  if(isFull){

    stEl.innerHTML =
      '<i class="fas fa-ban"></i> ● ' +
      t.full;

  }else{

    stEl.innerHTML =
      stEl.classList.contains(
        "on"
      )

        ? '<i class="fas fa-check-circle"></i> ● ' +
          t.o

        : '<i class="fas fa-times-circle"></i> ● ' +
          t.f;
  }

  var dnsMsg =
    document.getElementById(
      "dnsEmptyMsg"
    );

  if(dnsMsg){

    dnsMsg.innerHTML =
      t.dnsEmpty;
  }

  var bs =
    document.querySelectorAll(
      ".ob"
    );

  for(
    var j = 0;
    j < 3;
    j++
  ){

    bs[j].classList.toggle(
      "a",
      ["fa","en","ru"][j] === l
    );

  }

}

function sm(m){

  document.body.setAttribute(
    "data-theme",
    m
  );

  var bs =
    document.querySelectorAll(
      ".ob"
    );

  bs[3].classList.toggle(
    "a",
    m === "light"
  );

  bs[4].classList.toggle(
    "a",
    m === "dark"
  );

}

function copyDNS(d){

  if(
    navigator.clipboard &&
    navigator.clipboard.writeText
  ){

    navigator.clipboard
      .writeText(d)
      .then(
        function(){
          alert(
            "✅ Copied: " + d
          );
        }
      )
      .catch(
        function(){
          tryFallback(d);
        }
      );

  }else{

    tryFallback(d);

  }

}

function tryFallback(d){

  try{

    var i =
      document.createElement(
        "input"
      );

    i.value = d;

    i.style.position =
      "fixed";

    i.style.opacity =
      "0";

    document.body.appendChild(
      i
    );

    i.select();

    var s =
      document.execCommand(
        "copy"
      );

    document.body.removeChild(
      i
    );

    if(s){

      alert(
        "✅ Copied: " + d
      );

    }else{

      alert(
        "❌ Copy failed! Please copy manually: " +
        d
      );

    }

  }catch(e){

    alert(
      "❌ Copy failed! Please copy manually: " +
      d
    );

  }

}

</script>

</body>

</html>
`;
}

// ============================================================
// PANEL SLUG ROUTE
// ============================================================

app.get(
  '/:slug',
  (req, res) => {

    const slug =
      req.params.slug;

    const reserved = [
      'dashboard',
      'settings',
      'ai',
      'api',
      'login',
      'favicon.ico',
      'SUB'
    ];

    if (
      reserved.includes(
        slug
      )
    ) {
      return res.redirect(
        '/' + slug
      );
    }

    const panel =
      panels.find(
        p => p.slug === slug
      );

    if (!panel) {
      return res.send(
        'پنل یافت نشد'
      );
    }

    return res.send(
      buildPanelPage(panel)
    );
  }
);

// ============================================================
// START
// ============================================================

app.listen(
  PORT,
  () => {

    console.log(
      `🚀 Server running on port ${PORT}`
    );

    console.log(
      `📱 Login: http://localhost:${PORT}`
    );

    console.log(
      `🔑 Username: ${
        process.env.ADMIN_USERNAME ||
        'admin'
      }`
    );

    console.log(
      `🔑 Password: ${
        process.env.ADMIN_PASSWORD ||
        'admin'
      }`
    );

  }
);
