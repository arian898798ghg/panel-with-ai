// ========== SETTINGS LOGIC ==========
var lang = localStorage.getItem('dnsLang') || 'fa';
var mode = localStorage.getItem('dnsMode') || 'light';
var color = localStorage.getItem('dnsColor') || 'blue';

// ========== THEME FUNCTIONS ==========
function changeLang(l) {
  lang = l;
  localStorage.setItem('dnsLang', l);
  document.documentElement.lang = l;
  document.documentElement.dir = l === 'fa' ? 'rtl' : 'ltr';
  
  // Update button states
  document.getElementById('btnFa').classList.toggle('active', l === 'fa');
  document.getElementById('btnEn').classList.toggle('active', l === 'en');
  
  updateTexts();
  toast(l === 'fa' ? 'زبان به فارسی تغییر کرد' : 'Language changed to English', 'success');
}

function changeMode(m) {
  mode = m;
  localStorage.setItem('dnsMode', m);
  document.body.setAttribute('data-theme', m);
  
  // Update button states
  document.getElementById('btnLight').classList.toggle('active', m === 'light');
  document.getElementById('btnDark').classList.toggle('active', m === 'dark');
  
  toast(m === 'fa' ? 'حالت به روشن تغییر کرد' : 'Mode changed to dark', 'success');
}

function changeColor(c) {
  color = c;
  localStorage.setItem('dnsColor', c);
  document.body.setAttribute('data-color', c);
  
  // Update button states
  var colors = ['blue', 'purple', 'green', 'rose', 'brown', 'red', 'orange', 'teal'];
  colors.forEach(function(col) {
    var btn = document.getElementById('color' + col.charAt(0).toUpperCase() + col.slice(1));
    if (btn) {
      btn.classList.toggle('active', col === c);
    }
  });
  
  var colorNames = {
    fa: { blue: 'آبی', purple: 'بنفش', green: 'سبز', rose: 'صورتی', brown: 'قهوه‌ای', red: 'قرمز', orange: 'نارنجی', teal: 'فیروزه‌ای' },
    en: { blue: 'Blue', purple: 'Purple', green: 'Green', rose: 'Rose', brown: 'Brown', red: 'Red', orange: 'Orange', teal: 'Teal' }
  };
  var name = colorNames[lang] ? colorNames[lang][c] : c;
  toast((lang === 'fa' ? 'تم به ' : 'Theme changed to ') + name, 'success');
}

// ========== SAVE SETTINGS ==========
function saveSetting(key, value) {
  localStorage.setItem(key, value);
  toast(lang === 'fa' ? 'تنظیمات ذخیره شد' : 'Settings saved', 'success');
}

// ========== LOAD SETTINGS ==========
function loadSettings() {
  // Load saved values
  var notifyDays = localStorage.getItem('notifyBeforeExpire') || '5';
  var defaultDays = localStorage.getItem('defaultDays') || '30';
  var defaultStorage = localStorage.getItem('defaultStorage') || '100';
  var defaultUsers = localStorage.getItem('defaultUsers') || '10';
  
  document.getElementById('sNotifyDays').value = notifyDays;
  document.getElementById('sDefaultDays').value = defaultDays;
  document.getElementById('sDefaultStorage').value = defaultStorage;
  document.getElementById('sDefaultUsers').value = defaultUsers;
}

// ========== UPDATE TEXTS ==========
function updateTexts() {
  var isFa = lang === 'fa';
  
  // Header
  document.getElementById('tSettingsTitle').textContent = isFa ? 'تنظیمات' : 'Settings';
  document.getElementById('tSettingsDesc').textContent = isFa ? 'مدیریت تنظیمات پنل' : 'Manage panel settings';
  document.getElementById('tBack').textContent = isFa ? 'بازگشت' : 'Back';
  document.getElementById('tLogout').textContent = isFa ? 'خروج' : 'Logout';
  
  // Settings
  document.getElementById('tSettings').textContent = isFa ? 'تنظیمات پنل' : 'Panel Settings';
  document.getElementById('tLangLabel').textContent = isFa ? 'زبان' : 'Language';
  document.getElementById('tModeLabel').textContent = isFa ? 'حالت نمایش' : 'Display Mode';
  document.getElementById('tColorLabel').textContent = isFa ? 'تم رنگی' : 'Color Theme';
  document.getElementById('tNotifyLabel').textContent = isFa ? 'هشدار انقضا (روز)' : 'Expiry Alert (Days)';
  document.getElementById('tDefaultLabel').textContent = isFa ? 'مقادیر پیش‌فرض' : 'Default Values';
  document.getElementById('tDaysLabel').textContent = isFa ? 'روز' : 'Days';
  document.getElementById('tStorageLabel').textContent = isFa ? 'حجم (GB)' : 'Storage (GB)';
  document.getElementById('tUsersLabel').textContent = isFa ? 'کاربران' : 'Users';
  
  // Update color buttons
  var colorNames = {
    fa: {
      blue: '🔵 آبی',
      purple: '🟣 بنفش',
      green: '🟢 سبز',
      rose: '🌹 صورتی',
      brown: '🟤 قهوه‌ای',
      red: '🔴 قرمز',
      orange: '🟠 نارنجی',
      teal: '🩵 فیروزه‌ای'
    },
    en: {
      blue: '🔵 Blue',
      purple: '🟣 Purple',
      green: '🟢 Green',
      rose: '🌹 Rose',
      brown: '🟤 Brown',
      red: '🔴 Red',
      orange: '🟠 Orange',
      teal: '🩵 Teal'
    }
  };
  
  var names = colorNames[lang] || colorNames.en;
  document.getElementById('colorBlue').textContent = names.blue;
  document.getElementById('colorPurple').textContent = names.purple;
  document.getElementById('colorGreen').textContent = names.green;
  document.getElementById('colorRose').textContent = names.rose;
  document.getElementById('colorBrown').textContent = names.brown;
  document.getElementById('colorRed').textContent = names.red;
  document.getElementById('colorOrange').textContent = names.orange;
  document.getElementById('colorTeal').textContent = names.teal;
}

// ========== TOAST ==========
function toast(msg, type) {
  var el = document.getElementById('toast');
  if (!el) return;
  
  el.textContent = msg;
  el.className = 'toast';
  if (type) el.classList.add(type);
  el.classList.add('show');
  
  clearTimeout(el._timeout);
  el._timeout = setTimeout(function() {
    el.classList.remove('show');
  }, 3000);
}

// ========== LOGOUT ==========
function doLogout() {
  if (confirm(lang === 'fa' ? 'آیا از خروج اطمینان دارید؟' : 'Are you sure you want to logout?')) {
    sessionStorage.removeItem('dnsLogged');
    window.location.href = '/';
  }
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
  
  // Load settings
  loadSettings();
  
  // Update button states
  document.getElementById('btnFa').classList.toggle('active', lang === 'fa');
  document.getElementById('btnEn').classList.toggle('active', lang === 'en');
  document.getElementById('btnLight').classList.toggle('active', mode === 'light');
  document.getElementById('btnDark').classList.toggle('active', mode === 'dark');
  
  var colors = ['blue', 'purple', 'green', 'rose', 'brown', 'red', 'orange', 'teal'];
  colors.forEach(function(c) {
    var btn = document.getElementById('color' + c.charAt(0).toUpperCase() + c.slice(1));
    if (btn) {
      btn.classList.toggle('active', c === color);
    }
  });
  
  // Update texts
  updateTexts();
});

// ========== KEYBOARD SHORTCUTS ==========
document.addEventListener('keydown', function(e) {
  // Ctrl+S to save settings
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    var notifyDays = document.getElementById('sNotifyDays').value;
    var defaultDays = document.getElementById('sDefaultDays').value;
    var defaultStorage = document.getElementById('sDefaultStorage').value;
    var defaultUsers = document.getElementById('sDefaultUsers').value;
    
    saveSetting('notifyBeforeExpire', notifyDays);
    saveSetting('defaultDays', defaultDays);
    saveSetting('defaultStorage', defaultStorage);
    saveSetting('defaultUsers', defaultUsers);
    
    toast(lang === 'fa' ? '✅ همه تنظیمات ذخیره شد' : '✅ All settings saved', 'success');
  }
});
