// ========== DATA ==========
var countries = {
  germany:     { fa: 'آلمان', en: 'Germany', flag: '🇩🇪' },
  turkey:      { fa: 'ترکیه', en: 'Turkey', flag: '🇹🇷' },
  netherlands: { fa: 'هلند', en: 'Netherlands', flag: '🇳🇱' },
  denmark:     { fa: 'دانمارک', en: 'Denmark', flag: '🇩🇰' },
  uae:         { fa: 'امارات', en: 'UAE', flag: '🇦🇪' }
};

var dnsServices = [
  { id: 'radar', name: 'رادار (RadarGame)', primary: '10.202.10.10', desc: 'به‌طور خاص برای گیمرهای ایرانی', tags: ['gaming'] },
  { id: 'electro', name: 'الکترو (Electro)', primary: '78.157.42.100', desc: 'عملکرد خوبی در بازی‌های آنلاین', tags: ['gaming'] },
  { id: 'shecan', name: 'شکن (Shecan)', primary: '178.22.122.100', desc: 'محبوب برای دور زدن تحریم‌ها', tags: ['bypass'] },
  { id: 'begzar', name: 'بگذر (Begzar)', primary: '185.55.226.26', desc: 'مشابه شکن، برای دور زدن محدودیت‌ها', tags: ['bypass'] },
  { id: 'shatel', name: 'شاتل (Shatel)', primary: '85.15.1.14', desc: 'DNS ارائه‌دهنده اینترنت شاتل', tags: ['isp'] },
  { id: 'hostiran', name: 'هاست ایران (HostIran)', primary: '172.29.0.5', desc: 'مناسب برای زیرساخت داخلی', tags: ['isp'] },
  { id: 'pishgaman', name: 'پیشگامان (Pishgaman)', primary: '5.202.100.100', desc: 'DNS ارائه‌دهنده اینترنت پیشگامان', tags: ['isp'] },
  { id: 'asiatech', name: 'آسیاتک (Asiatech)', primary: '209.144.4.4', desc: 'DNS ارائه‌دهنده اینترنت آسیاتک', tags: ['isp'] },
  { id: 'parsonline', name: 'پارس آنلاین (ParsOnline)', primary: '91.99.99.99', desc: 'DNS ارائه‌دهنده اینترنت پارس آنلاین', tags: ['isp'] },
  { id: 'irancell', name: 'ایرانسل (Irancell)', primary: '78.157.42.100', desc: 'DNS ارائه‌دهنده اینترنت ایرانسل', tags: ['isp', 'mobile'] },
  { id: 'hamrahaval', name: 'همراه اول (HamrahAval)', primary: '10.202.10.10', desc: 'DNS ارائه‌دهنده همراه اول', tags: ['isp', 'mobile'] },
  { id: 'rightel', name: 'رایتل (Rightel)', primary: '192.168.39.200', desc: 'DNS ارائه‌دهنده اینترنت رایتل', tags: ['isp', 'mobile'] }
];

var SECONDARY_BASES = ['114.114.114.', '78.160.38.', '84.200.69.', '84.208.90.'];

var lang = localStorage.getItem('dnsLang') || 'fa';
var mode = localStorage.getItem('dnsMode') || 'light';
var color = localStorage.getItem('dnsColor') || 'blue';
var panels = [];
var selectedCountry = null;
var selectedDnsService = null;
var editId = null;
var lineChart = null;
var pieChart = null;

var settings = {
  notifyBeforeExpire: parseInt(localStorage.getItem('notifyBeforeExpire')) || 5,
  defaultDays: parseInt(localStorage.getItem('defaultDays')) || 30,
  defaultStorage: parseInt(localStorage.getItem('defaultStorage')) || 100,
  defaultUsers: parseInt(localStorage.getItem('defaultUsers')) || 10
};

// ========== GENERATE SLUG ==========
function generateSlug(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function generateSecondaryDNS() {
  var base = SECONDARY_BASES[Math.floor(Math.random() * SECONDARY_BASES.length)];
  var last = Math.floor(Math.random() * 254) + 1;
  return base + last;
}

// ========== API CALLS ==========
async function apiCall(method, url, data) {
  try {
    var options = {
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (data) options.body = JSON.stringify(data);
    var res = await fetch(url, options);
    return await res.json();
  } catch(e) {
    toast('خطا در ارتباط با سرور', 'error');
    return { success: false };
  }
}

// ========== LOAD PANELS ==========
async function loadPanels() {
  var data = await apiCall('GET', '/api/panels');
  if (data && Array.isArray(data)) {
    panels = data;
    renderPanels();
    updateCharts();
  }
}

// ========== CREATE PANEL ==========
async function doCreate() {
  var name = document.getElementById('fName').value.trim();
  var days = parseInt(document.getElementById('fDays').value) || settings.defaultDays;
  var storage = parseInt(document.getElementById('fStorage').value) || settings.defaultStorage;
  var users = parseInt(document.getElementById('fUsers').value) || settings.defaultUsers;
  var ok = document.getElementById('msgOk');
  var err = document.getElementById('msgErr');
  ok.style.display = 'none';
  err.style.display = 'none';

  if (!name) {
    err.innerHTML = '<i class="fas fa-exclamation-circle"></i> ' + (lang === 'fa' ? 'نام پنل را وارد کنید' : 'Enter panel name');
    err.style.display = 'block';
    return;
  }
  if (!selectedCountry) {
    err.innerHTML = '<i class="fas fa-exclamation-circle"></i> ' + (lang === 'fa' ? 'یک کشور انتخاب کنید' : 'Select a country');
    err.style.display = 'block';
    return;
  }
  if (!selectedDnsService) {
    err.innerHTML = '<i class="fas fa-exclamation-circle"></i> ' + (lang === 'fa' ? 'یک سرویس Primary DNS انتخاب کنید' : 'Select a Primary DNS service');
    err.style.display = 'block';
    return;
  }

  var dnsService = dnsServices.find(s => s.id === selectedDnsService);
  if (!dnsService) {
    err.innerHTML = '<i class="fas fa-exclamation-circle"></i> ' + (lang === 'fa' ? 'سرویس DNS نامعتبر' : 'Invalid DNS service');
    err.style.display = 'block';
    return;
  }

  var secondaryDNS = generateSecondaryDNS();
  var slug = generateSlug(name);
  
  // Check if slug exists
  var exists = panels.some(p => p.slug === slug);
  if (exists) {
    slug = slug + '-' + Date.now().toString().slice(-4);
  }

  var countryName = countries[selectedCountry] ? (countries[selectedCountry][lang] || countries[selectedCountry].en) : selectedCountry;

  var panelData = {
    name: name,
    slug: slug,
    days: days,
    remainingDays: days,
    storage: storage,
    usedStorage: 0,
    users: users,
    countries: [selectedCountry],
    dns: [dnsService.primary, secondaryDNS],
    dnsService: dnsService.id,
    dnsServiceName: dnsService.name,
    countryName: countryName,
    status: 'active',
    panelSettings: {
      color: color,
      mode: mode,
      showDns: true,
      showFlags: true,
      compact: false
    }
  };

  var result = await apiCall('POST', '/api/panels', panelData);
  if (result.success) {
    panels.unshift(result.panel);
    ok.innerHTML = '<i class="fas fa-check-circle"></i> ' + (lang === 'fa' ? 'پنل با موفقیت ساخته شد' : 'Panel created successfully');
    ok.style.display = 'block';
    
    document.getElementById('fName').value = '';
    selectedCountry = null;
    selectedDnsService = null;
    document.querySelectorAll('.c-opt').forEach(function(x) { x.classList.remove('selected'); });
    document.querySelectorAll('.dns-service-item').forEach(function(x) { x.classList.remove('selected'); });
    document.getElementById('previewBox').style.display = 'none';

    renderPanels();
    updateCharts();
    toast(lang === 'fa' ? 'پنل ساخته شد' : 'Panel created', 'success');

    setTimeout(function() {
      document.getElementById('formBox').style.display = 'none';
      document.getElementById('btnShowForm').innerHTML = '<i class="fas fa-plus-circle"></i> ' + (lang === 'fa' ? 'ساخت پنل DNS جدید' : 'Create New Panel');
      ok.style.display = 'none';
    }, 2000);
  } else {
    err.innerHTML = '<i class="fas fa-exclamation-circle"></i> ' + (lang === 'fa' ? 'خطا در ساخت پنل' : 'Error creating panel');
    err.style.display = 'block';
  }
}

// ========== TOGGLE PANEL ==========
async function toggleP(id) {
  var result = await apiCall('PATCH', '/api/panels/' + id + '/toggle');
  if (result.success) {
    loadPanels();
    toast(lang === 'fa' ? 'وضعیت تغییر کرد' : 'Status changed', 'success');
  }
}

// ========== DELETE PANEL ==========
async function deleteP(id) {
  if (!confirm(lang === 'fa' ? 'آیا از حذف این پنل اطمینان دارید؟' : 'Are you sure you want to delete this panel?')) return;
  var result = await apiCall('DELETE', '/api/panels/' + id);
  if (result.success) {
    loadPanels();
    toast(lang === 'fa' ? 'حذف شد' : 'Deleted', 'success');
  }
}

// ========== COPY DNS ==========
function copyDNS(dns) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(dns).then(function() {
      toast('✅ ' + (lang === 'fa' ? 'کپی شد: ' : 'Copied: ') + dns, 'success');
    }).catch(function() {
      tryFallbackCopy(dns);
    });
  } else {
    tryFallbackCopy(dns);
  }
}

function tryFallbackCopy(dns) {
  try {
    var input = document.createElement('input');
    input.value = dns;
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    var success = document.execCommand('copy');
    document.body.removeChild(input);
    if (success) {
      toast('✅ ' + (lang === 'fa' ? 'کپی شد: ' : 'Copied: ') + dns, 'success');
    } else {
      toast('❌ ' + (lang === 'fa' ? 'کپی نشد! لطفاً دستی کپی کنید: ' : 'Copy failed! Please copy manually: ') + dns, 'error');
    }
  } catch(e) {
    toast('❌ ' + (lang === 'fa' ? 'کپی نشد! لطفاً دستی کپی کنید: ' : 'Copy failed! Please copy manually: ') + dns, 'error');
  }
}

// ========== RENDER PANELS ==========
function renderPanels() {
  var totalEl = document.getElementById('sTotal');
  if (!totalEl) return;

  var q = (document.getElementById('search').value || '').toLowerCase();
  var filter = document.getElementById('filter').value;
  var sort = document.getElementById('sortBy').value;
  
  var list = panels.filter(function(p) {
    if (filter === 'expiring') {
      return p.status === 'active' && p.remainingDays <= settings.notifyBeforeExpire && p.remainingDays > 0;
    }
    return (filter === 'all' || p.status === filter) && p.name.toLowerCase().indexOf(q) !== -1;
  });

  list.sort(function(a, b) {
    switch(sort) {
      case 'newest': return b.id - a.id;
      case 'oldest': return a.id - b.id;
      case 'name': return a.name.localeCompare(b.name);
      case 'days': return a.remainingDays - b.remainingDays;
      case 'storage': return b.storage - a.storage;
      default: return 0;
    }
  });

  totalEl.textContent = panels.length;
  document.getElementById('sActive').textContent = panels.filter(function(p) { return p.status === 'active'; }).length;
  document.getElementById('sStorage').textContent = panels.reduce(function(a, p) { return a + p.storage; }, 0) + ' GB';
  document.getElementById('sUsers').textContent = panels.reduce(function(a, p) { return a + p.users; }, 0);
  
  var countEl = document.getElementById('panelCount');
  if (countEl) countEl.textContent = panels.length;

  var box = document.getElementById('panelsList');
  if (list.length === 0) {
    box.innerHTML = '<div class="empty"><i class="fas fa-inbox" style="font-size:40px;display:block;margin-bottom:10px;opacity:0.3;"></i>' + (lang === 'fa' ? 'هنوز پنلی ساخته نشده' : 'No panels yet') + '</div>';
    return;
  }

  var baseUrl = window.location.origin;

  var html = '<div class="panels-grid">';
  list.forEach(function(p) {
    var used = p.storage ? Math.min(100, Math.round((p.usedStorage || 0) / p.storage * 100)) : 0;
    var remain = Math.max(0, p.storage - (p.usedStorage || 0));
    var avatarColor = getColorFromName(p.name);
    var statusClass = p.status === 'active' ? 'on' : 'off';
    if (p.status === 'active' && p.remainingDays <= settings.notifyBeforeExpire && p.remainingDays > 0) {
      statusClass = 'expiring';
    }
    var statusText = p.status === 'active' 
      ? (p.remainingDays <= settings.notifyBeforeExpire && p.remainingDays > 0 ? (lang === 'fa' ? 'در حال انقضا' : 'Expiring') : (lang === 'fa' ? 'فعال' : 'Active'))
      : (lang === 'fa' ? 'غیرفعال' : 'Inactive');
    
    var showFlags = p.panelSettings ? p.panelSettings.showFlags : true;
    var countryFlag = (showFlags && p.countries[0] && countries[p.countries[0]]) ? countries[p.countries[0]].flag : '';
    var countryName = p.countryName || (p.countries[0] && countries[p.countries[0]] ? (countries[p.countries[0]][lang] || countries[p.countries[0]].en) : '');
    
    var tags = countryFlag + ' ' + countryName;
    
    var showDns = p.panelSettings ? p.panelSettings.showDns : true;
    var dnsHtml = '';
    if (showDns) {
      dnsHtml = '<div class="dns-box">';
      dnsHtml += '<div style="font-size:10px;color:var(--text2);margin-bottom:4px;">' + (p.dnsServiceName || 'DNS') + ' | ' + (lang === 'fa' ? 'کشور' : 'Country') + ': ' + countryName + '</div>';
      dnsHtml += (p.dns || []).map(function(d, idx) {
        var label = idx === 0 ? (lang === 'fa' ? '🟢 Primary' : '🟢 Primary') : (lang === 'fa' ? '🟡 Secondary' : '🟡 Secondary');
        return '<div class="dns-row"><span><span class="dns-label">' + label + ':</span> ' + d + '</span> <button class="copy-btn" onclick="copyDNS(\'' + d + '\')"><i class="fas fa-copy"></i></button></div>';
      }).join('');
      dnsHtml += '</div>';
    }

    var panelUrl = baseUrl + '/' + p.slug;
    var daysLeft = p.remainingDays;
    var isCompact = p.panelSettings && p.panelSettings.compact;

    html += '<div class="p-card" style="' + (isCompact ? 'padding:12px;' : '') + '">';
    html += '<div class="p-head"><span class="p-name"><span class="p-avatar" style="background:' + avatarColor + '">' + p.name.charAt(0).toUpperCase() + '</span> ' + safe(p.name) + '</span>';
    html += '<div style="display:flex;align-items:center;gap:6px;">';
    html += '<span class="p-status ' + statusClass + '">' + statusText + '</span>';
    html += '<button type="button" class="abtn abtn-edit" style="padding:3px 6px;font-size:10px;" onclick="openPanelSettings(' + p.id + ')" title="تنظیمات پنل"><i class="fas fa-palette"></i></button>';
    html += '</div></div>';
    
    // Circular progress
    html += '<div class="circular-wrap" style="' + (isCompact ? 'margin-bottom:6px;' : '') + '">';
    html += '<div class="circular-progress" style="' + (isCompact ? 'width:45px;height:45px;' : '') + '">';
    var circumference = 100;
    var offset = circumference - (used / 100 * circumference);
    html += '<svg viewBox="0 0 36 36" style="' + (isCompact ? 'width:45px;height:45px;' : '') + '">';
    html += '<circle class="bg" cx="18" cy="18" r="16"/>';
    html += '<circle class="progress" cx="18" cy="18" r="16" stroke-dasharray="' + circumference + '" stroke-dashoffset="' + offset + '" style="stroke:' + (used > 80 ? 'var(--danger)' : 'var(--accent)') + '"/>';
    html += '</svg>';
    html += '<span class="progress-text" style="' + (isCompact ? 'font-size:10px;' : '') + '">' + used + '%</span>';
    html += '</div>';
    if (!isCompact) {
      html += '<div class="progress-info">';
      html += '<div class="label">' + (lang === 'fa' ? 'مصرف حجم' : 'Storage Used') + '</div>';
      html += '<div class="value">' + (p.usedStorage || 0) + ' / ' + p.storage + ' GB</div>';
      html += '</div>';
    } else {
      html += '<div style="font-size:11px;color:var(--text2);">' + (p.usedStorage || 0) + '/' + p.storage + 'GB</div>';
    }
    html += '</div>';

    if (!isCompact) {
      html += '<div class="p-info">';
      html += '<div class="p-info-item"><div class="lbl"><i class="far fa-calendar-alt"></i> ' + (lang === 'fa' ? 'روز باقی‌مانده' : 'Days Left') + '</div><div class="val" style="color:' + (daysLeft <= 0 ? 'var(--danger)' : (daysLeft <= settings.notifyBeforeExpire ? '#b88600' : 'inherit')) + '">' + p.remainingDays + '</div></div>';
      html += '<div class="p-info-item"><div class="lbl"><i class="fas fa-hdd"></i> ' + (lang === 'fa' ? 'حجم باقی‌مانده' : 'Storage Left') + '</div><div class="val">' + remain + ' GB</div></div>';
      html += '<div class="p-info-item"><div class="lbl"><i class="fas fa-users"></i> ' + (lang === 'fa' ? 'کاربران' : 'Users') + '</div><div class="val">' + p.users + '</div></div>';
      html += '<div class="p-info-item"><div class="lbl"><i class="fas fa-globe"></i> ' + (lang === 'fa' ? 'کشور' : 'Country') + '</div><div class="val">' + countryName + '</div></div>';
      html += '</div>';
    }
    
    html += '<div class="tags" style="' + (isCompact ? 'margin-bottom:4px;' : '') + '"><span class="tag">' + tags + '</span></div>';
    html += dnsHtml;
    
    // Link to panel
    html += '<div style="margin-bottom:8px;font-size:11px;direction:ltr;text-align:left;background:var(--primary);padding:4px 8px;border-radius:6px;">';
    html += '<i class="fas fa-link" style="color:var(--accent);"></i> ';
    html += '<a href="' + panelUrl + '" target="_blank" style="color:var(--accent);text-decoration:none;">' + panelUrl + '</a>';
    html += ' <button class="copy-btn" onclick="copyDNS(\'' + panelUrl + '\')"><i class="fas fa-copy"></i></button>';
    html += '</div>';
    
    html += '<div class="p-acts">';
    html += '<button type="button" class="abtn abtn-edit" onclick="openEdit(' + p.id + ')"><i class="fas fa-edit"></i></button>';
    html += '<button type="button" class="abtn abtn-tog" onclick="toggleP(' + p.id + ')"><i class="fas fa-power-off"></i></button>';
    html += '<button type="button" class="abtn abtn-dl" onclick="downloadP(' + p.id + ')"><i class="fas fa-download"></i></button>';
    html += '<button type="button" class="abtn abtn-del" onclick="deleteP(' + p.id + ')"><i class="fas fa-trash"></i></button>';
    html += '</div></div>';
  });
  html += '</div>';
  box.innerHTML = html;
}

// ========== OTHER FUNCTIONS ==========
function getColorFromName(name) {
  var colors = ['#3b82f6','#22c55e','#eab308','#a855f7','#ef4444','#ec4899','#14b8a6','#f97316'];
  var hash = 0;
  for (var i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function safe(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toast(msg, type) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast';
  if (type) el.classList.add(type);
  el.classList.add('show');
  clearTimeout(el._timeout);
  el._timeout = setTimeout(function() { el.classList.remove('show'); }, 3500);
}

function doLogout() {
  sessionStorage.removeItem('dnsLogged');
  window.location.href = '/';
}

// ========== CHARTS ==========
function initCharts() {
  var lineCtx = document.getElementById('lineChart');
  var pieCtx = document.getElementById('pieChart');
  if (!lineCtx || !pieCtx || typeof Chart === 'undefined') return;

  if (lineChart) lineChart.destroy();
  if (pieChart) pieChart.destroy();

  var labels = lang === 'fa'
    ? ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه']
    : ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

  var usageData = panels.length > 0 ? [12, 19, 8, 15, 22, 18, 25].map(function(v) { return v + Math.floor(Math.random() * 10) - 5; }) : [0,0,0,0,0,0,0];
  var activityData = panels.length > 0 ? [8, 12, 15, 10, 18, 14, 20].map(function(v) { return v + Math.floor(Math.random() * 8) - 4; }) : [0,0,0,0,0,0,0];

  lineChart = new Chart(lineCtx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        { label: lang === 'fa' ? 'مصرف' : 'Usage', data: usageData, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', tension: 0.4, fill: true, pointRadius: 5 },
        { label: lang === 'fa' ? 'فعالیت' : 'Activity', data: activityData, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)', tension: 0.4, fill: true, pointRadius: 5 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { 
        legend: { 
          labels: { color: mode === 'dark' ? '#e2e8f0' : '#333', usePointStyle: true, padding: 20 } 
        } 
      },
      scales: {
        x: { ticks: { color: mode === 'dark' ? '#94a3b8' : '#666' }, grid: { color: 'rgba(128,128,128,0.1)' } },
        y: { ticks: { color: mode === 'dark' ? '#94a3b8' : '#666' }, grid: { color: 'rgba(128,128,128,0.1)' } }
      }
    }
  });

  var activeN = panels.filter(function(p) { return p.status === 'active'; }).length;
  var inactiveN = panels.length - activeN;

  pieChart = new Chart(pieCtx, {
    type: 'doughnut',
    data: {
      labels: [lang === 'fa' ? 'فعال' : 'Active', lang === 'fa' ? 'غیرفعال' : 'Inactive'],
      datasets: [{ data: [activeN || 1, inactiveN || 0], backgroundColor: ['#22c55e', '#ef4444'], borderWidth: 2, borderColor: 'var(--card)' }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      plugins: { 
        legend: { 
          position: 'bottom', 
          labels: { color: mode === 'dark' ? '#e2e8f0' : '#333', usePointStyle: true, padding: 15 } 
        } 
      }
    }
  });
}

function updateCharts() {
  if (lineChart || pieChart) initCharts();
}

// ========== FORM FUNCTIONS ==========
function toggleForm() {
  var box = document.getElementById('formBox');
  var btn = document.getElementById('btnShowForm');
  var isOpen = box.style.display === 'block';
  box.style.display = isOpen ? 'none' : 'block';
  btn.innerHTML = isOpen
    ? '<i class="fas fa-plus-circle"></i> ' + (lang === 'fa' ? 'ساخت پنل DNS جدید' : 'Create New Panel')
    : '<i class="fas fa-times-circle"></i> ' + (lang === 'fa' ? 'بستن فرم' : 'Close Form');
  if (!isOpen) {
    box.scrollIntoView({ behavior: 'smooth' });
    initCountries();
    initDnsServices();
  }
}

function initCountries() {
  var g = document.getElementById('countryGrid');
  if (!g) return;
  g.innerHTML = '';
  selectedCountry = null;
  Object.keys(countries).forEach(function(key) {
    var c = countries[key];
    var el = document.createElement('div');
    el.className = 'c-opt';
    el.innerHTML = '<span>' + c.flag + '</span> <span>' + (c[lang] || c.en) + '</span>';
    el.setAttribute('data-key', key);
    el.onclick = function() {
      document.querySelectorAll('.c-opt').forEach(function(x) { x.classList.remove('selected'); });
      el.classList.add('selected');
      selectedCountry = key;
      updatePreview();
    };
    g.appendChild(el);
  });
}

function initDnsServices() {
  var g = document.getElementById('dnsServiceGrid');
  if (!g) return;
  g.innerHTML = '';
  selectedDnsService = null;
  
  dnsServices.forEach(function(s) {
    var el = document.createElement('div');
    el.className = 'dns-service-item';
    el.setAttribute('data-id', s.id);
    
    var tagsHtml = '';
    if (s.tags.indexOf('gaming') !== -1) {
      tagsHtml += ' <span style="display:inline-block;padding:1px 8px;border-radius:10px;background:rgba(245,158,11,0.2);color:#f59e0b;font-size:9px;">🎮 گیمینگ</span>';
    }
    if (s.tags.indexOf('bypass') !== -1) {
      tagsHtml += ' <span style="display:inline-block;padding:1px 8px;border-radius:10px;background:rgba(52,211,153,0.2);color:#10b981;font-size:9px;">🌐 رفع تحریم</span>';
    }
    
    el.innerHTML = '<div class="name">' + s.name + tagsHtml + '</div>' +
                   '<div class="ip">Primary: ' + s.primary + '</div>' +
                   '<div class="desc">' + s.desc + '</div>';
    
    el.onclick = function() {
      document.querySelectorAll('.dns-service-item').forEach(function(x) { x.classList.remove('selected'); });
      el.classList.add('selected');
      selectedDnsService = s.id;
      updatePreview();
    };
    g.appendChild(el);
  });
}

function updatePreview() {
  var box = document.getElementById('previewBox');
  var countryEl = document.getElementById('previewCountry');
  var primaryEl = document.getElementById('previewPrimary');
  var secondaryEl = document.getElementById('previewSecondary');
  var serviceEl = document.getElementById('previewService');
  var slugEl = document.getElementById('previewSlug');
  
  if (!selectedCountry || !selectedDnsService) {
    box.style.display = 'none';
    return;
  }
  
  box.style.display = 'block';
  
  var country = countries[selectedCountry];
  countryEl.textContent = (country ? country.flag + ' ' : '') + (country ? (country[lang] || country.en) : selectedCountry);
  
  var dnsService = dnsServices.find(s => s.id === selectedDnsService);
  if (dnsService) {
    primaryEl.textContent = dnsService.primary;
    serviceEl.textContent = dnsService.name;
  }
  
  var secondary = generateSecondaryDNS();
  secondaryEl.textContent = secondary;
  
  var name = document.getElementById('fName').value.trim() || 'پنل-جدید';
  var slug = generateSlug(name);
  slugEl.textContent = window.location.origin + '/' + slug;
}

// ========== EDIT FUNCTIONS ==========
function openEdit(id) {
  editId = id;
  var p = panels.find(function(x) { return x.id === id; });
  if (!p) return;

  var body = document.getElementById('editBody');
  var html = '';
  html += '<div class="field"><label><i class="fas fa-tag"></i> ' + (lang === 'fa' ? 'نام' : 'Name') + '</label><input type="text" id="eName" class="input" value="' + safe(p.name) + '"></div>';
  html += '<div class="field"><label><i class="fas fa-calendar-plus"></i> ' + (lang === 'fa' ? 'افزایش روز' : 'Add Days') + '</label><input type="number" id="eDays" class="input" min="0" value="0"></div>';
  html += '<div class="field"><label><i class="fas fa-minus-circle"></i> ' + (lang === 'fa' ? 'کاهش حجم (GB)' : 'Reduce Storage') + '</label><input type="number" id="eStorage" class="input" min="0" value="0"></div>';
  html += '<div class="field"><label><i class="fas fa-users"></i> ' + (lang === 'fa' ? 'کاربران' : 'Users') + '</label><input type="number" id="eUsers" class="input" min="1" value="' + p.users + '"></div>';
  html += '<div style="margin:12px 0 6px;font-weight:500"><i class="fas fa-globe"></i> ' + (lang === 'fa' ? 'کشور' : 'Country') + '</div>';
  html += '<div id="eCountryGrid" class="country-grid"></div>';
  html += '<button type="button" class="create-btn" style="margin-top:14px" onclick="saveEdit()"><i class="fas fa-save"></i> ' + (lang === 'fa' ? 'ذخیره' : 'Save') + '</button>';
  body.innerHTML = html;

  var g = document.getElementById('eCountryGrid');
  Object.keys(countries).forEach(function(key) {
    var c = countries[key];
    var el = document.createElement('div');
    el.className = 'c-opt' + (p.countries.indexOf(key) !== -1 ? ' selected' : '');
    el.innerHTML = '<span>' + c.flag + '</span> <span>' + (c[lang] || c.en) + '</span>';
    el.setAttribute('data-key', key);
    el.onclick = function() {
      document.querySelectorAll('#eCountryGrid .c-opt').forEach(function(x) { x.classList.remove('selected'); });
      el.classList.add('selected');
    };
    g.appendChild(el);
  });

  document.getElementById('editModal').classList.add('show');
}

function closeEdit() {
  document.getElementById('editModal').classList.remove('show');
  editId = null;
}

async function saveEdit() {
  var p = panels.find(function(x) { return x.id === editId; });
  if (!p) return;

  p.name = document.getElementById('eName').value.trim() || p.name;
  var addD = parseInt(document.getElementById('eDays').value) || 0;
  var redS = parseInt(document.getElementById('eStorage').value) || 0;
  p.remainingDays += addD;
  p.days += addD;
  p.usedStorage = Math.min(p.storage, (p.usedStorage || 0) + redS);
  p.users = parseInt(document.getElementById('eUsers').value) || p.users;

  var newCountries = [];
  var opts = document.querySelectorAll('#eCountryGrid .c-opt.selected');
  for (var j = 0; j < opts.length; j++) {
    newCountries.push(opts[j].getAttribute('data-key'));
  }
  if (newCountries.length > 0) {
    p.countries = newCountries;
    p.countryName = countries[newCountries[0]] ? (countries[newCountries[0]][lang] || countries[newCountries[0]].en) : newCountries[0];
  }

  var result = await apiCall('PUT', '/api/panels/' + p.id, p);
  if (result.success) {
    closeEdit();
    loadPanels();
    toast(lang === 'fa' ? 'ذخیره شد' : 'Saved', 'success');
  }
}

// ========== PANEL SETTINGS ==========
function openPanelSettings(id) {
  var p = panels.find(function(x) { return x.id === id; });
  if (!p) return;
  
  if (!p.panelSettings) {
    p.panelSettings = { color: color, mode: mode, showDns: true, showFlags: true, compact: false };
  }

  var isFa = lang === 'fa';
  var body = document.getElementById('panelSettingsBody');
  var html = '';
  
  html += '<h4 style="margin-bottom:12px;color:var(--accent);">' + safe(p.name) + ' (' + (p.countryName || '') + ')</h4>';
  
  html += '<div class="setting-row"><div class="setting-label"><i class="fas fa-palette"></i> <div><div>' + (isFa ? 'تم رنگی' : 'Color Theme') + '</div></div></div>';
  html += '<div class="setting-control">';
  var colors = [
    {key:'blue',label:'🔵 '+(isFa?'آبی':'Blue')},
    {key:'purple',label:'🟣 '+(isFa?'بنفش':'Purple')},
    {key:'green',label:'🟢 '+(isFa?'سبز':'Green')},
    {key:'rose',label:'🌹 '+(isFa?'صورتی':'Rose')},
    {key:'brown',label:'🟤 '+(isFa?'قهوه‌ای':'Brown')},
    {key:'red',label:'🔴 '+(isFa?'قرمز':'Red')},
    {key:'orange',label:'🟠 '+(isFa?'نارنجی':'Orange')},
    {key:'teal',label:'🩵 '+(isFa?'فیروزه‌ای':'Teal')}
  ];
  colors.forEach(function(c) {
    html += '<button type="button" class="opt-btn' + (p.panelSettings.color === c.key ? ' active' : '') + '" onclick="changePanelColor(' + id + ',\'' + c.key + '\')">' + c.label + '</button>';
  });
  html += '</div></div>';
  
  html += '<div class="setting-row"><div class="setting-label"><i class="fas fa-moon"></i> <div><div>' + (isFa ? 'حالت نمایش' : 'Display Mode') + '</div></div></div>';
  html += '<div class="setting-control">';
  html += '<button type="button" class="opt-btn' + (p.panelSettings.mode === 'light' ? ' active' : '') + '" onclick="changePanelMode(' + id + ',\'light\')"><i class="fas fa-sun"></i></button>';
  html += '<button type="button" class="opt-btn' + (p.panelSettings.mode === 'dark' ? ' active' : '') + '" onclick="changePanelMode(' + id + ',\'dark\')"><i class="fas fa-moon"></i></button>';
  html += '</div></div>';
  
  html += '<div class="setting-row"><div class="setting-label"><i class="fas fa-server"></i> <div><div>' + (isFa ? 'نمایش DNS' : 'Show DNS') + '</div></div></div>';
  html += '<div class="setting-control"><label class="switch"><input type="checkbox" ' + (p.panelSettings.showDns ? 'checked' : '') + ' onchange="changePanelShowDns(' + id + ',this.checked)"><span class="slider"></span></label></div></div>';
  
  html += '<div class="setting-row"><div class="setting-label"><i class="fas fa-flag"></i> <div><div>' + (isFa ? 'نمایش پرچم' : 'Show Flags') + '</div></div></div>';
  html += '<div class="setting-control"><label class="switch"><input type="checkbox" ' + (p.panelSettings.showFlags ? 'checked' : '') + ' onchange="changePanelShowFlags(' + id + ',this.checked)"><span class="slider"></span></label></div></div>';
  
  html += '<div class="setting-row" style="border-bottom:0;"><div class="setting-label"><i class="fas fa-compress"></i> <div><div>' + (isFa ? 'حالت فشرده' : 'Compact Mode') + '</div></div></div>';
  html += '<div class="setting-control"><label class="switch"><input type="checkbox" ' + (p.panelSettings.compact ? 'checked' : '') + ' onchange="changePanelCompact(' + id + ',this.checked)"><span class="slider"></span></label></div></div>';
  
  body.innerHTML = html;
  document.getElementById('panelSettingsModal').classList.add('show');
}

function closePanelSettings() {
  document.getElementById('panelSettingsModal').classList.remove('show');
}

async function changePanelColor(id, newColor) {
  var p = panels.find(function(x) { return x.id === id; });
  if (!p) return;
  if (!p.panelSettings) p.panelSettings = {};
  p.panelSettings.color = newColor;
  var result = await apiCall('PUT', '/api/panels/' + id, p);
  if (result.success) {
    loadPanels();
    toast(lang === 'fa' ? 'تم تغییر کرد' : 'Theme changed', 'success');
    openPanelSettings(id);
  }
}

async function changePanelMode(id, newMode) {
  var p = panels.find(function(x) { return x.id === id; });
  if (!p) return;
  if (!p.panelSettings) p.panelSettings = {};
  p.panelSettings.mode = newMode;
  var result = await apiCall('PUT', '/api/panels/' + id, p);
  if (result.success) {
    loadPanels();
    toast(lang === 'fa' ? 'حالت تغییر کرد' : 'Mode changed', 'success');
    openPanelSettings(id);
  }
}

async function changePanelShowDns(id, val) {
  var p = panels.find(function(x) { return x.id === id; });
  if (!p) return;
  if (!p.panelSettings) p.panelSettings = {};
  p.panelSettings.showDns = val;
  await apiCall('PUT', '/api/panels/' + id, p);
  loadPanels();
  toast(lang === 'fa' ? 'ذخیره شد' : 'Saved', 'success');
}

async function changePanelShowFlags(id, val) {
  var p = panels.find(function(x) { return x.id === id; });
  if (!p) return;
  if (!p.panelSettings) p.panelSettings = {};
  p.panelSettings.showFlags = val;
  await apiCall('PUT', '/api/panels/' + id, p);
  loadPanels();
  toast(lang === 'fa' ? 'ذخیره شد' : 'Saved', 'success');
}

async function changePanelCompact(id, val) {
  var p = panels.find(function(x) { return x.id === id; });
  if (!p) return;
  if (!p.panelSettings) p.panelSettings = {};
  p.panelSettings.compact = val;
  await apiCall('PUT', '/api/panels/' + id, p);
  loadPanels();
  toast(lang === 'fa' ? 'ذخیره شد' : 'Saved', 'success');
}

// ========== DOWNLOAD PANEL ==========
function downloadP(id) {
  var p = panels.find(function(x) { return x.id === id; });
  if (!p) return;
  
  var used = p.storage ? Math.min(100, Math.round((p.usedStorage || 0) / p.storage * 100)) : 0;
  var remain = Math.max(0, p.storage - (p.usedStorage || 0));
  
  var panelColor = p.panelSettings && p.panelSettings.color ? p.panelSettings.color : 'blue';
  var panelMode = p.panelSettings && p.panelSettings.mode ? p.panelSettings.mode : 'light';
  var showFlags = p.panelSettings ? p.panelSettings.showFlags : true;
  
  var countryFlag = (showFlags && p.countries[0] && countries[p.countries[0]]) ? countries[p.countries[0]].flag : '';
  var countryName = p.countryName || (p.countries[0] && countries[p.countries[0]] ? (countries[p.countries[0]][lang] || countries[p.countries[0]].en) : '');
  
  var dnsItems = (p.dns || []).map(function(d, idx) {
    var label = idx === 0 ? '🟢 Primary' : '🟡 Secondary';
    return '<div class="di">' + label + ': ' + d + ' <button onclick="copyDNS(\'' + d + '\')" style="background:none;border:0;color:var(--a);cursor:pointer;"><i class="fas fa-copy"></i></button></div>';
  }).join('');
  
  var tags = countryFlag + ' ' + countryName;

  var colorMap = {
    blue: { a: '#007bff', d: '#0056b3', p: '#e6f2ff' },
    purple: { a: '#6f42c1', d: '#59359a', p: '#f0eaff' },
    green: { a: '#198754', d: '#146c43', p: '#e6f7ed' },
    rose: { a: '#d6335c', d: '#ad2748', p: '#ffe9ee' },
    brown: { a: '#8B6914', d: '#6B4F12', p: '#f5efe6' },
    red: { a: '#dc3545', d: '#b02a37', p: '#fce8ea' },
    orange: { a: '#fd7e14', d: '#c9650f', p: '#fef0e0' },
    teal: { a: '#20c997', d: '#1aa67e', p: '#e0f5f0' }
  };
  var c = colorMap[panelColor] || colorMap.blue;

  var html = '<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">';
  html += '<title>' + safe(p.name) + ' - ' + countryName + '</title>';
  html += '<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700&display=swap" rel="stylesheet">';
  html += '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">';
  html += '<style>';
  html += ':root{--p:' + c.p + ';--a:' + c.a + ';--d:' + c.d + ';--bg:linear-gradient(135deg,' + c.p + ',#f0f8ff);--c:#fff;--t:#333;--t2:#666;--b:#d1e7ff;--s:#28a745}';
  html += '[data-theme="dark"]{--bg:linear-gradient(135deg,#0f172a,#1e293b);--c:#1e293b;--t:#e2e8f0;--t2:#94a3b8;--b:#334155;--p:#1e3a5f;--a:#3b82f6}';
  html += '*{margin:0;padding:0;box-sizing:border-box;font-family:Vazirmatn,sans-serif}';
  html += 'body{background:var(--bg);min-height:100vh;padding:20px;color:var(--t);transition:0.3s}';
  html += '.box{max-width:480px;margin:40px auto;background:var(--c);border-radius:24px;padding:32px;border:1px solid var(--b);box-shadow:0 8px 30px rgba(0,0,0,.1)}';
  html += '.logo{width:70px;height:70px;margin:0 auto 16px;border-radius:18px;background:linear-gradient(135deg,var(--a),var(--d));color:#fff;display:grid;place-items:center;font-size:28px}';
  html += 'h1{text-align:center;color:var(--a);font-size:22px;margin-bottom:4px}';
  html += '.sub{text-align:center;color:var(--t2);font-size:12px;margin-bottom:20px}';
  html += '.dns-info{text-align:center;font-size:11px;color:var(--t2);margin-bottom:16px;padding:8px;background:var(--p);border-radius:8px;}';
  html += '.opts{display:flex;justify-content:center;gap:6px;margin-bottom:20px;flex-wrap:wrap}';
  html += '.ob{padding:6px 12px;border-radius:8px;border:2px solid var(--b);background:var(--c);color:var(--t);cursor:pointer;font-size:11px;transition:0.2s}';
  html += '.ob:hover{border-color:var(--a)}';
  html += '.ob.a{border-color:var(--a);background:var(--p);color:var(--a);font-weight:600}';
  html += '.ig{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}';
  html += '.inf{background:var(--p);padding:12px;border-radius:10px;text-align:center;transition:0.2s}';
  html += '.inf:hover{transform:translateY(-2px)}';
  html += '.inf .l{font-size:10px;color:var(--t2)}.inf .v{font-size:16px;font-weight:700;color:var(--a)}';
  html += '.bw{margin-bottom:16px}.bt{display:flex;justify-content:space-between;font-size:11px;color:var(--t2);margin-bottom:4px}';
  html += '.br{height:8px;background:var(--b);border-radius:10px;overflow:hidden}.br i{display:block;height:100%;background:linear-gradient(90deg,var(--a),#66b3ff);transition:1s}';
  html += '.sec{margin-bottom:14px}.sec h3{font-size:13px;color:var(--a);margin-bottom:8px;display:flex;align-items:center;gap:6px}';
  html += '.di{background:var(--p);padding:10px 14px;border-radius:8px;margin-bottom:5px;font-family:monospace;font-size:13px;direction:ltr;text-align:left;display:flex;justify-content:space-between;align-items:center}';
  html += '.tg{display:inline-block;background:var(--p);color:var(--a);padding:4px 10px;border-radius:6px;font-size:13px;margin:2px}';
  html += '.st{text-align:center;margin-top:16px;padding:10px;border-radius:8px;font-size:12px;font-weight:600}';
  html += '.st.on{background:rgba(40,167,69,.15);color:var(--s)}.st.off{background:rgba(220,53,69,.15);color:#dc3545}';
  html += '.footer{text-align:center;margin-top:16px;font-size:10px;color:var(--t2)}';
  html += '.copy-tip{text-align:center;font-size:11px;color:var(--t2);margin:8px 0;padding:6px;background:rgba(255,193,7,0.1);border-radius:6px;border:1px dashed var(--warning);}';
  html += '</style></head><body data-theme="' + panelMode + '">';
  html += '<div class="box"><div class="logo"><i class="fas fa-server"></i></div><h1>' + safe(p.name) + '</h1><p class="sub" id="sub"><i class="fas fa-globe"></i> ' + countryFlag + ' ' + countryName + ' | <i class="fas fa-shield-alt"></i> پنل DNS اختصاصی</p>';
  html += '<div class="dns-info">' + (lang === 'fa' ? 'سرویس: ' : 'Service: ') + (p.dnsServiceName || '') + ' | ' + (lang === 'fa' ? 'کشور' : 'Country') + ': ' + countryName + '</div>';
  html += '<div class="opts">';
  html += '<button class="ob a" onclick="sl(\'fa\')">فارسی</button>';
  html += '<button class="ob" onclick="sl(\'en\')">English</button>';
  html += '<button class="ob" onclick="sl(\'ru\')">Русский</button>';
  html += '<button class="ob" onclick="sm(\'light\')"><i class="fas fa-sun"></i></button>';
  html += '<button class="ob" onclick="sm(\'dark\')"><i class="fas fa-moon"></i></button>';
  html += '</div>';
  html += '<div class="ig">';
  html += '<div class="inf"><div class="l" id="l1"><i class="far fa-calendar-alt"></i> روز باقی‌مانده</div><div class="v">' + p.remainingDays + '</div></div>';
  html += '<div class="inf"><div class="l" id="l2"><i class="fas fa-hdd"></i> حجم باقی‌مانده</div><div class="v">' + remain + ' GB</div></div>';
  html += '<div class="inf"><div class="l" id="l3"><i class="fas fa-database"></i> حجم کل</div><div class="v">' + p.storage + ' GB</div></div>';
  html += '<div class="inf"><div class="l" id="l4"><i class="fas fa-users"></i> کاربران</div><div class="v">' + p.users + '</div></div>';
  html += '</div>';
  html += '<div class="bw"><div class="bt"><span id="l5"><i class="fas fa-chart-bar"></i> مصرف حجم</span><span>' + used + '%</span></div><div class="br"><i style="width:' + used + '%"></i></div></div>';
  html += '<div class="sec"><h3><i class="fas fa-server"></i> <span id="l6">آدرس‌های DNS</span></h3>' + dnsItems + '</div>';
  html += '<div class="copy-tip"><i class="fas fa-info-circle"></i> ' + (lang === 'fa' ? 'برای کپی روی آیکون 📋 کلیک کنید' : 'Click on 📋 icon to copy') + '</div>';
  html += '<div class="sec"><h3><i class="fas fa-flag"></i> <span id="l7">کشور</span></h3><span class="tg">' + tags + '</span></div>';
  html += '<div class="st ' + (p.status === 'active' ? 'on' : 'off') + '" id="st">' + (p.status === 'active' ? '<i class="fas fa-check-circle"></i> ● فعال' : '<i class="fas fa-times-circle"></i> ● غیرفعال') + '</div>';
  html += '<div class="footer">' + (lang === 'fa' ? 'تولید شده توسط پنل مدیریت DNS' : 'Generated by DNS Management Panel') + '</div>';
  html += '</div>';
  html += '<scr' + 'ipt>';
  html += 'var tr={fa:{s:"پنل DNS اختصاصی",a:["روز باقی‌مانده","حجم باقی‌مانده","حجم کل","کاربران","مصرف حجم","آدرس‌های DNS","کشور"],o:"فعال",f:"غیرفعال"},';
  html += 'en:{s:"Private DNS Panel",a:["Remaining Days","Remaining Storage","Total Storage","Users","Storage Usage","DNS Addresses","Country"],o:"Active",f:"Inactive"},';
  html += 'ru:{s:"Приватная DNS панель",a:["Осталось дней","Осталось места","Всего места","Пользователи","Использование","DNS адреса","Страна"],o:"Активен",f:"Неактивен"}};';
  html += 'function sl(l){document.documentElement.lang=l;document.documentElement.dir=l==="fa"?"rtl":"ltr";var t=tr[l];document.getElementById("sub").innerHTML=\'<i class="fas fa-globe"></i> ' + countryFlag + ' ' + countryName + ' | <i class="fas fa-shield-alt"></i> \'+t.s;';
  html += 'for(var i=0;i<7;i++)document.getElementById("l"+(i+1)).innerHTML=t.a[i];';
  html += 'document.getElementById("st").innerHTML=document.getElementById("st").classList.contains("on")?\'<i class="fas fa-check-circle"></i> ● \'+t.o:\'<i class="fas fa-times-circle"></i> ● \'+t.f;';
  html += 'var bs=document.querySelectorAll(".ob");for(var j=0;j<3;j++)bs[j].classList.toggle("a",["fa","en","ru"][j]===l)}';
  html += 'function sm(m){document.body.setAttribute("data-theme",m);document.querySelectorAll(".ob")[3].classList.toggle("a",m==="light");document.querySelectorAll(".ob")[4].classList.toggle("a",m==="dark")}';
  html += 'function copyDNS(d){if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(d).then(()=>{alert("✅ Copied: "+d)}).catch(()=>{tryFallback(d)})}else{tryFallback(d)}}';
  html += 'function tryFallback(d){try{var i=document.createElement("input");i.value=d;i.style.position="fixed";i.style.opacity="0";document.body.appendChild(i);i.select();var s=document.execCommand("copy");document.body.removeChild(i);if(s){alert("✅ Copied: "+d)}else{alert("❌ Copy failed! Please copy manually: "+d)}}catch(e){alert("❌ Copy failed! Please copy manually: "+d)}}';
  html += '</scr' + 'ipt></body></html>';

  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  a.download = safe(p.name).replace(/\s+/g, '_') + '_' + countryName + '_dns.html';
  a.click();
  URL.revokeObjectURL(a.href);
  toast(lang === 'fa' ? 'دانلود شد' : 'Downloaded', 'success');
}

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', function() {
  // Check if logged in
  if (!sessionStorage.getItem('dnsLogged')) {
    window.location.href = '/';
    return;
  }
  
  // Apply theme
  document.body.setAttribute('data-theme', mode);
  document.body.setAttribute('data-color', color);
  
  // Load panels
  loadPanels();
  
  // Init form
  initCountries();
  initDnsServices();
  
  // Update texts
  updateTexts();
});

function updateTexts() {
  var isFa = lang === 'fa';
  document.getElementById('tMainTitle').innerHTML = '<i class="fas fa-cloud"></i> ' + (isFa ? 'پنل مدیریت DNS پیشرفته' : 'Advanced DNS Panel');
  document.getElementById('tMainDesc').textContent = isFa ? 'مدیریت حرفه‌ای پنل‌های DNS' : 'Professional DNS management';
  document.getElementById('tApi').innerHTML = '<i class="fas fa-check-circle"></i> ' + (isFa ? 'API متصل است' : 'API Connected');
  document.getElementById('tTunnel').innerHTML = '<i class="fas fa-shield-alt"></i> ' + (isFa ? 'تانل برقرار است' : 'Tunnel Active');
  document.getElementById('tHost').innerHTML = '<i class="fas fa-server"></i> ' + (isFa ? 'هاست متصل است' : 'Host Connected');
  document.getElementById('tTotal').textContent = isFa ? 'کل پنل‌ها' : 'Total Panels';
  document.getElementById('tActive').textContent = isFa ? 'فعال' : 'Active';
  document.getElementById('tStorage').textContent = isFa ? 'حجم کل' : 'Total Storage';
  document.getElementById('tUsers').textContent = isFa ? 'کاربران' : 'Users';
  document.getElementById('tChartLine').textContent = isFa ? 'نمودار مصرف و فعالیت' : 'Usage Chart';
  document.getElementById('tChartPie').textContent = isFa ? 'وضعیت پنل‌ها' : 'Panels Status';
  document.getElementById('tCreate').textContent = isFa ? 'ساخت پنل DNS جدید' : 'Create New Panel';
  document.getElementById('tFormTitle').textContent = isFa ? 'ساخت پنل DNS جدید' : 'Create New Panel';
  document.getElementById('tName').innerHTML = '<i class="fas fa-tag"></i> ' + (isFa ? 'نام پنل' : 'Panel Name');
  document.getElementById('tDays').innerHTML = '<i class="fas fa-calendar-day"></i> ' + (isFa ? 'تعداد روز' : 'Days');
  document.getElementById('tStor').innerHTML = '<i class="fas fa-hdd"></i> ' + (isFa ? 'حجم (GB)' : 'Storage (GB)');
  document.getElementById('tUsr').innerHTML = '<i class="fas fa-user"></i> ' + (isFa ? 'تعداد کاربر' : 'Users');
  document.getElementById('tCountries').innerHTML = '<i class="fas fa-globe"></i> ' + (isFa ? 'انتخاب کشور' : 'Select Country');
  document.getElementById('tSelectDNS').textContent = isFa ? 'انتخاب سرویس Primary DNS' : 'Select Primary DNS Service';
  document.getElementById('tHelpTitle').textContent = isFa ? 'ساخت پنل با DNS اختصاصی برای هر کشور' : 'Create panel with dedicated DNS for each country';
  document.getElementById('tHelpText').innerHTML = isFa 
    ? '<span class="highlight">🎮 برای بازی:</span> الکترو، رادار و شکن بهترین گزینه‌ها هستند.<br><span class="highlight">🌐 برای رفع تحریم:</span> شکن و بگذر مناسب‌ترین انتخاب‌ها هستند.<br><span class="highlight">🏢 برای اینترنت ایران:</span> شاتل، هاست ایران، پیشگامان، آسیاتک و پارس آنلاین.'
    : '<span class="highlight">🎮 For Gaming:</span> Electro, Radar and Shecan are best.<br><span class="highlight">🌐 For Bypass:</span> Shecan and Begzar are best.<br><span class="highlight">🏢 For Iran ISPs:</span> Shatel, HostIran, Pishgaman, Asiatech, ParsOnline.';
  document.getElementById('tMyPanels').innerHTML = '<i class="fas fa-list"></i> ' + (isFa ? 'پنل‌های من' : 'My Panels');
  document.getElementById('search').placeholder = isFa ? 'جستجو...' : 'Search...';
  document.querySelector('#filter option[value="all"]').textContent = isFa ? 'همه' : 'All';
  document.querySelector('#filter option[value="active"]').textContent = isFa ? 'فعال' : 'Active';
  document.querySelector('#filter option[value="inactive"]').textContent = isFa ? 'غیرفعال' : 'Inactive';
  document.querySelector('#filter option[value="expiring"]').textContent = isFa ? 'در حال انقضا' : 'Expiring';
  document.querySelector('#sortBy option[value="newest"]').textContent = isFa ? 'جدیدترین' : 'Newest';
  document.querySelector('#sortBy option[value="oldest"]').textContent = isFa ? 'قدیمی‌ترین' : 'Oldest';
  document.querySelector('#sortBy option[value="name"]').textContent = isFa ? 'نام' : 'Name';
  document.querySelector('#sortBy option[value="days"]').textContent = isFa ? 'روز باقی‌مانده' : 'Days Left';
  document.querySelector('#sortBy option[value="storage"]').textContent = isFa ? 'حجم' : 'Storage';
  document.getElementById('tEditTitle').textContent = isFa ? 'ویرایش پنل' : 'Edit Panel';
  document.getElementById('tPanelSettings').textContent = isFa ? 'تنظیمات پنل' : 'Panel Settings';
  document.getElementById('tPreview').textContent = isFa ? 'پیش‌نمایش پنل' : 'Preview';
  document.getElementById('tPreviewCountry').textContent = isFa ? 'کشور:' : 'Country:';
  document.getElementById('tPreviewPrimary').textContent = isFa ? 'Primary DNS:' : 'Primary DNS:';
  document.getElementById('tPreviewSecondary').textContent = isFa ? 'Secondary DNS:' : 'Secondary DNS:';
  document.getElementById('tPreviewService').textContent = isFa ? 'سرویس:' : 'Service:';
  document.getElementById('tPreviewSlug').textContent = isFa ? 'لینک:' : 'Link:';
  document.getElementById('tCreateBtn').textContent = isFa ? 'ساخت پنل' : 'Create Panel';
  document.getElementById('tAI').textContent = isFa ? 'هوش مصنوعی' : 'AI';
  document.getElementById('tSettings').textContent = isFa ? 'تنظیمات' : 'Settings';
  document.getElementById('tLogout').textContent = isFa ? 'خروج' : 'Logout';
}