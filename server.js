const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ========== STORAGE ==========
let panels = [];
let aiHistory = [];

// ========== سیستم کاربران ==========
// مالک اصلی (از env می‌خونه)
const OWNER_USERNAME = process.env.ADMIN_USERNAME || 'arian11';
const OWNER_PASSWORD = process.env.ADMIN_PASSWORD || 'arian11';

// لیست ادمین‌ها (با دسترسی‌های مختلف)
let admins = [];

// ========== توابع کمکی ==========
function generateRandomSlug(length = 4) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateToken() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// ========== ROUTES ==========
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/settings', (req, res) => res.sendFile(path.join(__dirname, 'public', 'settings.html')));
app.get('/ai', (req, res) => res.sendFile(path.join(__dirname, 'public', 'ai.html')));
app.get('/admin-panel', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-panel.html')));

// ========== API ==========

// ===== LOGIN =====
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  // بررسی مالک اصلی
  if (username === OWNER_USERNAME && password === OWNER_PASSWORD) {
    return res.json({
      success: true,
      role: 'owner',
      username: username,
      message: 'ورود با موفقیت انجام شد (مالک)'
    });
  }
  
  // بررسی ادمین‌ها
  const admin = admins.find(a => 
    a.username === username && 
    a.password === password && 
    a.status === 'active' &&
    new Date(a.expiresAt) > new Date()
  );
  
  if (admin) {
    return res.json({
      success: true,
      role: 'admin',
      username: username,
      permissions: admin.permissions,
      message: `ورود با موفقیت انجام شد (${admin.daysLeft || 0} روز باقی‌مانده)`
    });
  }
  
  // بررسی ادمین منقضی شده
  const expiredAdmin = admins.find(a => 
    a.username === username && 
    a.password === password && 
    a.status === 'expired'
  );
  
  if (expiredAdmin) {
    return res.status(401).json({
      success: false,
      message: '❌ حساب کاربری شما منقضی شده است'
    });
  }
  
  res.status(401).json({
    success: false,
    message: '❌ نام کاربری یا رمز عبور اشتباه است'
  });
});

// ===== لیست ادمین‌ها (فقط مالک) =====
app.get('/api/admins', (req, res) => {
  const { username, password } = req.query;
  
  if (username !== OWNER_USERNAME || password !== OWNER_PASSWORD) {
    return res.status(403).json({ success: false, message: '❌ دسترسی غیرمجاز' });
  }
  
  res.json({ success: true, admins: admins });
});

// ===== ساخت ادمین جدید (فقط مالک) =====
app.post('/api/admins/create', (req, res) => {
  const { ownerUser, ownerPass, newUsername, newPassword, days, permissions } = req.body;
  
  // بررسی مالک
  if (ownerUser !== OWNER_USERNAME || ownerPass !== OWNER_PASSWORD) {
    return res.status(403).json({ success: false, message: '❌ احراز هویت مالک ناموفق' });
  }
  
  // بررسی تکراری نبودن
  if (admins.some(a => a.username === newUsername)) {
    return res.json({ success: false, message: '❌ این نام کاربری قبلاً ثبت شده است' });
  }
  
  // محاسبه تاریخ انقضا
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  
  // دسترسی‌های پیش‌فرض (همه false)
  const defaultPermissions = {
    view_panels: false,
    create_panel: false,
    delete_panel: false,
    edit_panel: false,
    toggle_panel: false,
    change_theme: false,
    change_mode: false,
    view_admins: false,
    create_admin: false,
    delete_admin: false,
    change_owner_pass: false,
    edit_permissions: false,
    ...permissions
  };
  
  const newAdmin = {
    id: Date.now(),
    username: newUsername,
    password: newPassword,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
    days: days,
    daysLeft: days,
    status: 'active',
    permissions: defaultPermissions,
    createdBy: ownerUser
  };
  
  admins.push(newAdmin);
  
  res.json({
    success: true,
    message: `✅ ادمین "${newUsername}" با ${days} روز اعتبار ساخته شد`,
    admin: newAdmin
  });
});

// ===== تغییر رمز مالک =====
app.post('/api/owner/change-password', (req, res) => {
  const { oldPassword, newPassword } = req.body;
  
  if (oldPassword !== OWNER_PASSWORD) {
    return res.json({ success: false, message: '❌ رمز فعلی اشتباه است' });
  }
  
  // در اینجا رمز در env ذخیره نمیشه، برای محیط واقعی باید از دیتابیس استفاده کنی
  // برای آزمایش، فقط تو لاگ نشون می‌دیم
  console.log(`🔑 رمز مالک تغییر کرد از "${oldPassword}" به "${newPassword}"`);
  
  res.json({
    success: true,
    message: '✅ رمز با موفقیت تغییر کرد (تغییر در متغیر محیطی باید انجام شود)',
    newPassword: newPassword
  });
});

// ===== تغییر دسترسی ادمین (فقط مالک) =====
app.post('/api/admins/permissions', (req, res) => {
  const { ownerUser, ownerPass, adminUsername, permissions } = req.body;
  
  if (ownerUser !== OWNER_USERNAME || ownerPass !== OWNER_PASSWORD) {
    return res.status(403).json({ success: false, message: '❌ دسترسی غیرمجاز' });
  }
  
  const admin = admins.find(a => a.username === adminUsername);
  if (!admin) {
    return res.json({ success: false, message: '❌ ادمین یافت نشد' });
  }
  
  admin.permissions = { ...admin.permissions, ...permissions };
  
  res.json({
    success: true,
    message: `✅ دسترسی‌های "${adminUsername}" به‌روز شد`,
    permissions: admin.permissions
  });
});

// ===== حذف ادمین (فقط مالک) =====
app.post('/api/admins/delete', (req, res) => {
  const { ownerUser, ownerPass, adminUsername } = req.body;
  
  if (ownerUser !== OWNER_USERNAME || ownerPass !== OWNER_PASSWORD) {
    return res.status(403).json({ success: false, message: '❌ دسترسی غیرمجاز' });
  }
  
  const index = admins.findIndex(a => a.username === adminUsername);
  if (index === -1) {
    return res.json({ success: false, message: '❌ ادمین یافت نشد' });
  }
  
  const removed = admins[index];
  admins.splice(index, 1);
  
  res.json({
    success: true,
    message: `✅ ادمین "${adminUsername}" حذف شد`,
    removed: removed
  });
});

// ===== تمدید ادمین (فقط مالک) =====
app.post('/api/admins/extend', (req, res) => {
  const { ownerUser, ownerPass, adminUsername, extraDays } = req.body;
  
  if (ownerUser !== OWNER_USERNAME || ownerPass !== OWNER_PASSWORD) {
    return res.status(403).json({ success: false, message: '❌ دسترسی غیرمجاز' });
  }
  
  const admin = admins.find(a => a.username === adminUsername);
  if (!admin) {
    return res.json({ success: false, message: '❌ ادمین یافت نشد' });
  }
  
  const newExpiry = new Date(admin.expiresAt);
  newExpiry.setDate(newExpiry.getDate() + extraDays);
  admin.expiresAt = newExpiry.toISOString();
  admin.days += extraDays;
  admin.daysLeft += extraDays;
  admin.status = 'active';
  
  res.json({
    success: true,
    message: `✅ ${extraDays} روز به ادمین "${adminUsername}" اضافه شد`,
    admin: admin
  });
});

// ============================================================
// ========== API های پنل با بررسی دسترسی ==========
// ============================================================

// میدلور بررسی دسترسی
function checkPermission(username, permission) {
  if (username === OWNER_USERNAME) return true;
  const admin = admins.find(a => a.username === username && a.status === 'active');
  if (!admin) return false;
  return admin.permissions[permission] === true;
}

// Get all panels (با بررسی دسترسی)
app.get('/api/panels', (req, res) => {
  const { username } = req.query;
  if (!username || !checkPermission(username, 'view_panels')) {
    return res.status(403).json({ success: false, message: '❌ دسترسی غیرمجاز' });
  }
  res.json(panels);
});

// Create panel (با بررسی دسترسی)
app.post('/api/panels', (req, res) => {
  const { username, ...panelData } = req.body;
  if (!username || !checkPermission(username, 'create_panel')) {
    return res.status(403).json({ success: false, message: '❌ دسترسی غیرمجاز' });
  }
  
  const panel = {
    ...panelData,
    id: Date.now(),
    slug: panelData.slug || generateRandomSlug(4),
    createdAt: new Date().toISOString(),
    createdBy: username
  };
  
  panels.unshift(panel);
  res.json({ success: true, panel });
});

// Update panel (با بررسی دسترسی)
app.put('/api/panels/:id', (req, res) => {
  const { username, ...updateData } = req.body;
  if (!username || !checkPermission(username, 'edit_panel')) {
    return res.status(403).json({ success: false, message: '❌ دسترسی غیرمجاز' });
  }
  
  const id = parseInt(req.params.id);
  const index = panels.findIndex(p => p.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'پنل یافت نشد' });
  }
  
  panels[index] = { ...panels[index], ...updateData };
  res.json({ success: true, panel: panels[index] });
});

// Delete panel (با بررسی دسترسی)
app.delete('/api/panels/:id', (req, res) => {
  const { username } = req.body;
  if (!username || !checkPermission(username, 'delete_panel')) {
    return res.status(403).json({ success: false, message: '❌ دسترسی غیرمجاز' });
  }
  
  const id = parseInt(req.params.id);
  panels = panels.filter(p => p.id !== id);
  res.json({ success: true });
});

// Toggle panel (با بررسی دسترسی)
app.patch('/api/panels/:id/toggle', (req, res) => {
  const { username } = req.body;
  if (!username || !checkPermission(username, 'toggle_panel')) {
    return res.status(403).json({ success: false, message: '❌ دسترسی غیرمجاز' });
  }
  
  const id = parseInt(req.params.id);
  const index = panels.findIndex(p => p.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'پنل یافت نشد' });
  }
  panels[index].status = panels[index].status === 'active' ? 'inactive' : 'active';
  res.json({ success: true, panel: panels[index] });
});

// ============================================================
// ========== صفحه ادمین پنل ==========
// ============================================================

app.get('/admin-panel', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>مدیریت ادمین‌ها</title>
<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:Vazirmatn,sans-serif}
body{background:linear-gradient(135deg,#e6f2ff,#f0f8ff);min-height:100vh;padding:20px;color:#333}
.container{max-width:1100px;margin:auto}
.header{background:#fff;border-radius:18px;padding:20px 24px;margin-bottom:18px;border:1px solid #d1e7ff;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;box-shadow:0 8px 30px rgba(0,0,0,.08)}
.header h1{color:#007bff;font-size:20px}
.header h1 i{color:#007bff}
.header-actions{display:flex;gap:8px;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border:0;border-radius:10px;font-weight:500;cursor:pointer;transition:0.2s;font-size:13px;text-decoration:none}
.btn-primary{background:#007bff;color:#fff}
.btn-primary:hover{background:#0056b3;transform:translateY(-2px)}
.btn-success{background:#28a745;color:#fff}
.btn-success:hover{background:#218838;transform:translateY(-2px)}
.btn-danger{background:#dc3545;color:#fff}
.btn-danger:hover{background:#b02a37;transform:translateY(-2px)}
.btn-warning{background:#ffc107;color:#333}
.btn-warning:hover{background:#e0a800;transform:translateY(-2px)}
.btn-outline{background:transparent;border:2px solid #d1e7ff;color:#333}
.btn-outline:hover{border-color:#007bff;color:#007bff}
.card{background:#fff;border-radius:16px;padding:20px;margin-bottom:16px;border:1px solid #d1e7ff;box-shadow:0 8px 30px rgba(0,0,0,.08)}
.card h2{color:#007bff;font-size:16px;margin-bottom:14px;padding-bottom:10px;border-bottom:2px solid #d1e7ff;display:flex;align-items:center;gap:8px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
.admin-card{background:#f8fafc;border-radius:12px;padding:16px;border:1px solid #d1e7ff;transition:0.2s}
.admin-card:hover{transform:translateY(-4px);box-shadow:0 8px 25px rgba(0,0,0,.1)}
.admin-card .name{font-size:16px;font-weight:600;color:#007bff}
.admin-card .info{font-size:12px;color:#666;margin:4px 0}
.admin-card .badge{display:inline-block;padding:2px 10px;border-radius:10px;font-size:10px;font-weight:600}
.badge-active{background:rgba(40,167,69,.15);color:#28a745}
.badge-expired{background:rgba(220,53,69,.15);color:#dc3545}
.badge-expiring{background:rgba(255,193,7,.15);color:#b88600}
.admin-card .perms{margin:8px 0}
.admin-card .perms .perm{display:inline-block;padding:1px 6px;border-radius:4px;font-size:9px;margin:1px}
.perm-on{background:rgba(40,167,69,.15);color:#28a745}
.perm-off{background:rgba(220,53,69,.15);color:#dc3545}
.admin-card .actions{display:flex;gap:4px;margin-top:8px;flex-wrap:wrap}
.admin-card .actions button{padding:4px 8px;border:0;border-radius:6px;font-size:10px;cursor:pointer;transition:0.2s}
.admin-card .actions button:hover{transform:scale(1.05)}
.modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)}
.modal.show{display:flex}
.modal-box{background:#fff;border-radius:18px;padding:28px;width:90%;max-width:520px;max-height:90vh;overflow-y:auto;animation:modalIn .3s ease}
@keyframes modalIn{from{transform:scale(.9);opacity:0}to{transform:scale(1);opacity:1}}
.modal-box h3{color:#007bff;margin-bottom:16px;font-size:18px;display:flex;align-items:center;gap:8px}
.field{margin-bottom:12px}
.field label{display:block;font-size:13px;font-weight:500;margin-bottom:4px}
.field input,.field select{width:100%;padding:10px 12px;border:2px solid #d1e7ff;border-radius:8px;font-size:13px;outline:none;transition:0.2s}
.field input:focus,.field select:focus{border-color:#007bff;box-shadow:0 0 0 3px rgba(0,123,255,.1)}
.field-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.permission-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:8px 0;max-height:200px;overflow-y:auto}
.permission-item{display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:4px;font-size:11px;background:#f8fafc}
.permission-item input[type="checkbox"]{accent-color:#007bff;cursor:pointer}
.permission-item label{cursor:pointer;flex:1}
.modal-actions{display:flex;gap:8px;margin-top:16px}
.modal-actions button{flex:1;padding:10px;border:0;border-radius:10px;font-weight:600;cursor:pointer;transition:0.2s}
.modal-actions button:hover{transform:translateY(-2px)}
.toast{position:fixed;bottom:20px;right:20px;background:#fff;border:1px solid #d1e7ff;padding:12px 18px;border-radius:10px;font-size:12px;z-index:2000;transform:translateY(80px);opacity:0;transition:.25s;color:#333;box-shadow:0 6px 20px rgba(0,0,0,.15)}
.toast.show{transform:none;opacity:1}
.toast.success{border-color:#28a745}
.toast.error{border-color:#dc3545}
@media(max-width:600px){.field-row{grid-template-columns:1fr}.permission-grid{grid-template-columns:1fr}}
</style>
</head>
<body>

<div class="container">
  <div class="header">
    <h1><i class="fas fa-users-cog"></i> مدیریت ادمین‌ها</h1>
    <div class="header-actions">
      <button class="btn btn-primary" onclick="showCreateAdmin()"><i class="fas fa-user-plus"></i> ساخت ادمین</button>
      <button class="btn btn-warning" onclick="showChangePass()"><i class="fas fa-key"></i> تغییر رمز مالک</button>
      <button class="btn btn-outline" onclick="location.href='/dashboard'"><i class="fas fa-arrow-right"></i> بازگشت</button>
    </div>
  </div>

  <div class="card">
    <h2><i class="fas fa-list"></i> لیست ادمین‌ها <span id="adminCount" style="font-size:12px;color:#666;font-weight:400;"></span></h2>
    <div id="adminList" class="grid"></div>
  </div>
</div>

<!-- ===== مودال ساخت ادمین ===== -->
<div class="modal" id="createAdminModal">
  <div class="modal-box">
    <h3><i class="fas fa-user-plus"></i> ساخت ادمین جدید</h3>
    <div class="field">
      <label>👤 نام کاربری</label>
      <input type="text" id="newUsername" placeholder="نام کاربری ادمین">
    </div>
    <div class="field">
      <label>🔑 رمز عبور</label>
      <input type="text" id="newPassword" placeholder="رمز عبور ادمین">
    </div>
    <div class="field">
      <label>📅 تعداد روز اعتبار</label>
      <input type="number" id="newDays" value="10" min="1" max="365">
    </div>
    <div class="field">
      <label>🔐 رمز مالک برای تأیید</label>
      <input type="password" id="ownerPassCreate" placeholder="رمز مالک">
    </div>
    <div class="field">
      <label>📋 دسترسی‌ها (همه غیرفعال هستند)</label>
      <div class="permission-grid" id="permGridCreate">
        <div class="permission-item"><input type="checkbox" id="p_view_panels"><label>مشاهده پنل‌ها</label></div>
        <div class="permission-item"><input type="checkbox" id="p_create_panel"><label>ساخت پنل</label></div>
        <div class="permission-item"><input type="checkbox" id="p_delete_panel"><label>حذف پنل</label></div>
        <div class="permission-item"><input type="checkbox" id="p_edit_panel"><label>ویرایش پنل</label></div>
        <div class="permission-item"><input type="checkbox" id="p_toggle_panel"><label>تغییر وضعیت پنل</label></div>
        <div class="permission-item"><input type="checkbox" id="p_change_theme"><label>تغییر تم</label></div>
        <div class="permission-item"><input type="checkbox" id="p_change_mode"><label>تغییر حالت</label></div>
        <div class="permission-item"><input type="checkbox" id="p_view_admins"><label>مشاهده ادمین‌ها</label></div>
        <div class="permission-item"><input type="checkbox" id="p_create_admin"><label>ساخت ادمین</label></div>
        <div class="permission-item"><input type="checkbox" id="p_delete_admin"><label>حذف ادمین</label></div>
        <div class="permission-item"><input type="checkbox" id="p_edit_permissions"><label>ویرایش دسترسی‌ها</label></div>
        <div class="permission-item"><input type="checkbox" id="p_change_owner_pass"><label>تغییر رمز مالک</label></div>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-success" onclick="createAdmin()"><i class="fas fa-save"></i> ساخت</button>
      <button class="btn btn-danger" onclick="closeModal('createAdminModal')">لغو</button>
    </div>
  </div>
</div>

<!-- ===== مودال تغییر رمز ===== -->
<div class="modal" id="changePassModal">
  <div class="modal-box">
    <h3><i class="fas fa-key"></i> تغییر رمز مالک</h3>
    <div class="field"><label>🔐 رمز فعلی</label><input type="password" id="oldPass" placeholder="رمز فعلی"></div>
    <div class="field"><label>🔑 رمز جدید</label><input type="text" id="newPass" placeholder="رمز جدید"></div>
    <div class="modal-actions">
      <button class="btn btn-warning" onclick="changePassword()"><i class="fas fa-save"></i> تغییر</button>
      <button class="btn btn-danger" onclick="closeModal('changePassModal')">لغو</button>
    </div>
  </div>
</div>

<!-- ===== مودال ویرایش دسترسی ===== -->
<div class="modal" id="editPermModal">
  <div class="modal-box">
    <h3><i class="fas fa-edit"></i> ویرایش دسترسی‌های <span id="editPermUsername"></span></h3>
    <div class="permission-grid" id="permGridEdit"></div>
    <div class="field"><label>🔐 رمز مالک</label><input type="password" id="ownerPassEdit" placeholder="رمز مالک"></div>
    <div class="modal-actions">
      <button class="btn btn-success" onclick="savePermissions()"><i class="fas fa-save"></i> ذخیره</button>
      <button class="btn btn-danger" onclick="closeModal('editPermModal')">لغو</button>
    </div>
  </div>
</div>

<!-- ===== مودال تمدید ===== -->
<div class="modal" id="extendModal">
  <div class="modal-box">
    <h3><i class="fas fa-calendar-plus"></i> تمدید ادمین <span id="extendUsername"></span></h3>
    <div class="field"><label>📅 تعداد روز اضافه</label><input type="number" id="extendDays" value="10" min="1" max="365"></div>
    <div class="field"><label>🔐 رمز مالک</label><input type="password" id="ownerPassExtend" placeholder="رمز مالک"></div>
    <div class="modal-actions">
      <button class="btn btn-success" onclick="extendAdmin()"><i class="fas fa-save"></i> تمدید</button>
      <button class="btn btn-danger" onclick="closeModal('extendModal')">لغو</button>
    </div>
  </div>
</div>

<!-- ===== Toast ===== -->
<div class="toast" id="toast"></div>

<script>
// ========== STATE ==========
let currentAdmins = [];
let editingAdmin = null;

// ========== TOAST ==========
function toast(msg, type) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast';
  if (type) el.classList.add(type);
  el.classList.add('show');
  clearTimeout(el._timeout);
  el._timeout = setTimeout(function(){ el.classList.remove('show'); }, 3000);
}

// ========== MODAL ==========
function showModal(id){ document.getElementById(id).classList.add('show'); }
function closeModal(id){ document.getElementById(id).classList.remove('show'); }

// ========== LOAD ADMINS ==========
async function loadAdmins() {
  try {
    var res = await fetch('/api/admins?username=${OWNER_USERNAME}&password=${OWNER_PASSWORD}');
    var data = await res.json();
    if (data.success) {
      currentAdmins = data.admins || [];
      renderAdmins();
    }
  } catch(e) {
    toast('❌ خطا در بارگذاری', 'error');
  }
}

// ========== RENDER ADMINS ==========
function renderAdmins() {
  var container = document.getElementById('adminList');
  var count = document.getElementById('adminCount');
  
  if (!currentAdmins.length) {
    container.innerHTML = '<div style="text-align:center;padding:30px;color:#666;">هیچ ادمینی ساخته نشده است</div>';
    count.textContent = '(0)';
    return;
  }
  
  count.textContent = '(' + currentAdmins.length + ')';
  
  var html = '';
  currentAdmins.forEach(function(a) {
    var isExpired = new Date(a.expiresAt) < new Date();
    var isExpiring = !isExpired && a.daysLeft <= 3;
    var badgeClass = isExpired ? 'badge-expired' : (isExpiring ? 'badge-expiring' : 'badge-active');
    var badgeText = isExpired ? '❌ منقضی' : (isExpiring ? '⚠️ در حال انقضا' : '✅ فعال');
    
    var permsHtml = '';
    var permNames = {
      view_panels: 'مشاهده پنل‌ها',
      create_panel: 'ساخت پنل',
      delete_panel: 'حذف پنل',
      edit_panel: 'ویرایش پنل',
      toggle_panel: 'تغییر وضعیت',
      change_theme: 'تغییر تم',
      change_mode: 'تغییر حالت',
      view_admins: 'مشاهده ادمین‌ها',
      create_admin: 'ساخت ادمین',
      delete_admin: 'حذف ادمین',
      edit_permissions: 'ویرایش دسترسی‌ها',
      change_owner_pass: 'تغییر رمز مالک'
    };
    
    for (var key in permNames) {
      if (a.permissions && a.permissions[key]) {
        permsHtml += '<span class="perm perm-on">' + permNames[key] + '</span>';
      }
    }
    if (!permsHtml) permsHtml = '<span style="font-size:11px;color:#666;">بدون دسترسی</span>';
    
    html += \`
      <div class="admin-card">
        <div class="name"><i class="fas fa-user-shield"></i> \${a.username}</div>
        <div class="info">🆔 \${a.id}</div>
        <div class="info">📅 ساخته شده: \${new Date(a.createdAt).toLocaleDateString('fa-IR')}</div>
        <div class="info">⏳ انقضا: \${new Date(a.expiresAt).toLocaleDateString('fa-IR')}</div>
        <div class="info">📆 \${a.daysLeft || 0} روز باقی‌مانده</div>
        <div><span class="badge \${badgeClass}">\${badgeText}</span></div>
        <div class="perms">\${permsHtml}</div>
        <div class="actions">
          <button class="btn btn-warning" style="padding:3px 8px;font-size:10px;" onclick="showExtend('\${a.username}')"><i class="fas fa-clock"></i> تمدید</button>
          <button class="btn btn-primary" style="padding:3px 8px;font-size:10px;" onclick="showEditPerms('\${a.username}')"><i class="fas fa-edit"></i> دسترسی</button>
          <button class="btn btn-danger" style="padding:3px 8px;font-size:10px;" onclick="deleteAdmin('\${a.username}')"><i class="fas fa-trash"></i> حذف</button>
        </div>
      </div>
    \`;
  });
  
  container.innerHTML = html;
}

// ========== CREATE ADMIN ==========
function showCreateAdmin() {
  document.getElementById('newUsername').value = '';
  document.getElementById('newPassword').value = '';
  document.getElementById('newDays').value = 10;
  document.getElementById('ownerPassCreate').value = '';
  document.querySelectorAll('#permGridCreate input').forEach(function(cb){ cb.checked = false; });
  showModal('createAdminModal');
}

async function createAdmin() {
  var username = document.getElementById('newUsername').value.trim();
  var password = document.getElementById('newPassword').value.trim();
  var days = parseInt(document.getElementById('newDays').value) || 10;
  var ownerPass = document.getElementById('ownerPassCreate').value.trim();
  
  if (!username || !password) {
    toast('❌ نام کاربری و رمز را وارد کنید', 'error');
    return;
  }
  if (!ownerPass) {
    toast('❌ رمز مالک را وارد کنید', 'error');
    return;
  }
  
  var perms = {};
  document.querySelectorAll('#permGridCreate input').forEach(function(cb) {
    perms[cb.id.replace('p_', '')] = cb.checked;
  });
  
  try {
    var res = await fetch('/api/admins/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerUser: '${OWNER_USERNAME}',
        ownerPass: ownerPass,
        newUsername: username,
        newPassword: password,
        days: days,
        permissions: perms
      })
    });
    var data = await res.json();
    if (data.success) {
      toast('✅ ' + data.message, 'success');
      closeModal('createAdminModal');
      loadAdmins();
    } else {
      toast('❌ ' + data.message, 'error');
    }
  } catch(e) {
    toast('❌ خطا در ارتباط', 'error');
  }
}

// ========== CHANGE PASSWORD ==========
function showChangePass() {
  document.getElementById('oldPass').value = '';
  document.getElementById('newPass').value = '';
  showModal('changePassModal');
}

async function changePassword() {
  var oldPass = document.getElementById('oldPass').value.trim();
  var newPass = document.getElementById('newPass').value.trim();
  
  if (!oldPass || !newPass) {
    toast('❌ هر دو رمز را وارد کنید', 'error');
    return;
  }
  if (newPass.length < 4) {
    toast('❌ رمز جدید حداقل ۴ کاراکتر باشد', 'error');
    return;
  }
  
  try {
    var res = await fetch('/api/owner/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPassword: oldPass, newPassword: newPass })
    });
    var data = await res.json();
    if (data.success) {
      toast('✅ ' + data.message, 'success');
      closeModal('changePassModal');
    } else {
      toast('❌ ' + data.message, 'error');
    }
  } catch(e) {
    toast('❌ خطا در ارتباط', 'error');
  }
}

// ========== DELETE ADMIN ==========
async function deleteAdmin(username) {
  if (!confirm('آیا از حذف ادمین "' + username + '" اطمینان دارید؟')) return;
  
  var ownerPass = prompt('🔐 رمز مالک را وارد کنید:');
  if (!ownerPass) return;
  
  try {
    var res = await fetch('/api/admins/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerUser: '${OWNER_USERNAME}',
        ownerPass: ownerPass,
        adminUsername: username
      })
    });
    var data = await res.json();
    if (data.success) {
      toast('✅ ' + data.message, 'success');
      loadAdmins();
    } else {
      toast('❌ ' + data.message, 'error');
    }
  } catch(e) {
    toast('❌ خطا در ارتباط', 'error');
  }
}

// ========== SHOW EXTEND ==========
function showExtend(username) {
  editingAdmin = username;
  document.getElementById('extendUsername').textContent = username;
  document.getElementById('extendDays').value = 10;
  document.getElementById('ownerPassExtend').value = '';
  showModal('extendModal');
}

async function extendAdmin() {
  var days = parseInt(document.getElementById('extendDays').value) || 10;
  var ownerPass = document.getElementById('ownerPassExtend').value.trim();
  
  if (!ownerPass) {
    toast('❌ رمز مالک را وارد کنید', 'error');
    return;
  }
  
  try {
    var res = await fetch('/api/admins/extend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerUser: '${OWNER_USERNAME}',
        ownerPass: ownerPass,
        adminUsername: editingAdmin,
        extraDays: days
      })
    });
    var data = await res.json();
    if (data.success) {
      toast('✅ ' + data.message, 'success');
      closeModal('extendModal');
      loadAdmins();
    } else {
      toast('❌ ' + data.message, 'error');
    }
  } catch(e) {
    toast('❌ خطا در ارتباط', 'error');
  }
}

// ========== SHOW EDIT PERMS ==========
function showEditPerms(username) {
  editingAdmin = username;
  var admin = currentAdmins.find(a => a.username === username);
  if (!admin) {
    toast('❌ ادمین یافت نشد', 'error');
    return;
  }
  
  document.getElementById('editPermUsername').textContent = username;
  document.getElementById('ownerPassEdit').value = '';
  
  var grid = document.getElementById('permGridEdit');
  var permNames = {
    view_panels: 'مشاهده پنل‌ها',
    create_panel: 'ساخت پنل',
    delete_panel: 'حذف پنل',
    edit_panel: 'ویرایش پنل',
    toggle_panel: 'تغییر وضعیت',
    change_theme: 'تغییر تم',
    change_mode: 'تغییر حالت',
    view_admins: 'مشاهده ادمین‌ها',
    create_admin: 'ساخت ادمین',
    delete_admin: 'حذف ادمین',
    edit_permissions: 'ویرایش دسترسی‌ها',
    change_owner_pass: 'تغییر رمز مالک'
  };
  
  var html = '';
  for (var key in permNames) {
    var checked = admin.permissions && admin.permissions[key] ? 'checked' : '';
    html += '<div class="permission-item"><input type="checkbox" id="ep_' + key + '" ' + checked + '><label>' + permNames[key] + '</label></div>';
  }
  grid.innerHTML = html;
  
  showModal('editPermModal');
}

async function savePermissions() {
  var ownerPass = document.getElementById('ownerPassEdit').value.trim();
  if (!ownerPass) {
    toast('❌ رمز مالک را وارد کنید', 'error');
    return;
  }
  
  var perms = {};
  document.querySelectorAll('#permGridEdit input').forEach(function(cb) {
    perms[cb.id.replace('ep_', '')] = cb.checked;
  });
  
  try {
    var res = await fetch('/api/admins/permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerUser: '${OWNER_USERNAME}',
        ownerPass: ownerPass,
        adminUsername: editingAdmin,
        permissions: perms
      })
    });
    var data = await res.json();
    if (data.success) {
      toast('✅ ' + data.message, 'success');
      closeModal('editPermModal');
      loadAdmins();
    } else {
      toast('❌ ' + data.message, 'error');
    }
  } catch(e) {
    toast('❌ خطا در ارتباط', 'error');
  }
}

// ========== INIT ==========
loadAdmins();

// بارگذاری خودکار هر ۳۰ ثانیه
setInterval(loadAdmins, 30000);
</script>
</body>
</html>
  `);
});

// ============================================================
// ========== SERVE PANEL PAGE ==========
// ============================================================

function generatePanelPage(panel) {
  // ... (همون کد قبلی برای صفحه پنل)
  // برای خلاصی، اینجا همون کد قبلی رو قرار بده
  // یا می‌تونی از فایل قبلی استفاده کنی
}

app.get('/SUB/:slug', (req, res) => {
  const slug = req.params.slug;
  const panel = panels.find(p => p.slug === slug);
  if (!panel) {
    return res.status(404).send('پنل یافت نشد');
  }
  res.send(generatePanelPage(panel));
});

app.get('/:slug', (req, res) => {
  const slug = req.params.slug;
  const reserved = ['dashboard', 'settings', 'ai', 'api', 'login', 'favicon.ico', 'SUB', 'admin-panel'];
  if (reserved.includes(slug)) {
    return res.redirect('/' + slug);
  }
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
  console.log(`👑 Owner: ${OWNER_USERNAME}`);
  console.log(`🔑 Owner Pass: ${OWNER_PASSWORD}`);
  console.log(`👥 Admin Panel: http://localhost:${PORT}/admin-panel`);
});
