// ========== AI CHAT ==========
var chatMessages = document.getElementById('chatMessages');
var aiInput = document.getElementById('aiInput');
var isFa = localStorage.getItem('dnsLang') === 'fa';

// Load history
async function loadHistory() {
  try {
    var res = await fetch('/api/ai/history');
    var data = await res.json();
    if (data && data.length > 0) {
      // Clear welcome
      var welcome = document.querySelector('.ai-welcome');
      if (welcome) welcome.remove();
      
      data.forEach(function(msg) {
        addMessage(msg.role, msg.content);
      });
    }
  } catch(e) {
    console.log('No history');
  }
}

function addMessage(role, content) {
  var msgDiv = document.createElement('div');
  msgDiv.className = 'ai-message ' + (role === 'user' ? 'ai-user' : 'ai-assistant');
  
  var icon = role === 'user' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-robot"></i>';
  var label = role === 'user' ? (isFa ? 'شما' : 'You') : (isFa ? 'هوش مصنوعی' : 'AI');
  
  // Check if content has actions
  var contentHtml = content;
  if (role === 'assistant') {
    // Try to detect and execute actions
    contentHtml = content;
  }
  
  msgDiv.innerHTML = '<div class="ai-avatar">' + icon + '</div><div class="ai-bubble"><div class="ai-label">' + label + '</div><div class="ai-text">' + contentHtml.replace(/\n/g, '<br>') + '</div></div>';
  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendMessage() {
  var text = aiInput.value.trim();
  if (!text) return;
  
  aiInput.value = '';
  addMessage('user', text);
  
  // Show typing indicator
  var typing = document.createElement('div');
  typing.className = 'ai-message ai-assistant';
  typing.id = 'typingIndicator';
  typing.innerHTML = '<div class="ai-avatar"><i class="fas fa-robot"></i></div><div class="ai-bubble"><div class="ai-text"><i class="fas fa-spinner fa-spin"></i> ' + (isFa ? 'در حال فکر کردن...' : 'Thinking...') + '</div></div>';
  chatMessages.appendChild(typing);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  
  try {
    var res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text })
    });
    var data = await res.json();
    
    // Remove typing indicator
    var typingEl = document.getElementById('typingIndicator');
    if (typingEl) typingEl.remove();
    
    if (data.success) {
      addMessage('assistant', data.message);
      
      // Execute action if any
      if (data.action) {
        executeAction(data.action);
      }
    } else {
      addMessage('assistant', '❌ ' + (data.message || (isFa ? 'خطا در ارتباط با هوش مصنوعی' : 'Error communicating with AI')));
    }
  } catch(e) {
    var typingEl = document.getElementById('typingIndicator');
    if (typingEl) typingEl.remove();
    addMessage('assistant', '❌ ' + (isFa ? 'خطا در ارتباط با سرور' : 'Server error'));
  }
}

function executeAction(action) {
  if (!action) return;
  
  var isFa = localStorage.getItem('dnsLang') === 'fa';
  
  switch(action.type) {
    case 'create_panel':
      var data = action.data;
      // Fill form and submit
      document.getElementById('fName').value = data.name;
      document.getElementById('fDays').value = data.days;
      document.getElementById('fStorage').value = data.storage;
      document.getElementById('fUsers').value = data.users;
      
      // Open form
      toggleForm();
      
      toast(isFa ? '✅ فرم ساخت پنل پر شد' : '✅ Panel form filled', 'success');
      break;
      
    case 'change_theme':
      changeColor(action.data.color);
      toast(isFa ? '✅ تم به ' + action.data.color + ' تغییر کرد' : '✅ Theme changed to ' + action.data.color, 'success');
      break;
      
    case 'change_mode':
      changeMode(action.data.mode);
      toast(isFa ? '✅ حالت به ' + (action.data.mode === 'dark' ? 'تاریک' : 'روشن') + ' تغییر کرد' : '✅ Mode changed to ' + action.data.mode, 'success');
      break;
      
    case 'list_panels':
      window.location.href = '/dashboard';
      break;
      
    case 'delete_panel':
      var panel = panels.find(function(p) { return p.name === action.data.name; });
      if (panel) {
        if (confirm(isFa ? 'آیا از حذف پنل "' + panel.name + '" اطمینان دارید؟' : 'Are you sure you want to delete "' + panel.name + '"?')) {
          deleteP(panel.id);
        }
      } else {
        toast(isFa ? '❌ پنل با نام "' + action.data.name + '" یافت نشد' : '❌ Panel "' + action.data.name + '" not found', 'error');
      }
      break;
      
    default:
      console.log('Unknown action:', action);
  }
}

function sendQuickCommand(text) {
  aiInput.value = text;
  sendMessage();
}

async function clearChat() {
  if (!confirm(isFa ? 'آیا از پاک کردن تاریخچه اطمینان دارید؟' : 'Are you sure you want to clear history?')) return;
  
  try {
    await fetch('/api/ai/history', { method: 'DELETE' });
    chatMessages.innerHTML = '';
    // Re-add welcome
    var welcome = document.querySelector('.ai-welcome');
    if (welcome) {
      chatMessages.appendChild(welcome);
    }
    toast(isFa ? 'تاریخچه پاک شد' : 'History cleared', 'success');
  } catch(e) {
    toast(isFa ? 'خطا در پاک کردن تاریخچه' : 'Error clearing history', 'error');
  }
}

// ========== THEME FUNCTIONS ==========
function changeLang(l) {
  localStorage.setItem('dnsLang', l);
  isFa = l === 'fa';
  document.documentElement.lang = l;
  document.documentElement.dir = l === 'fa' ? 'rtl' : 'ltr';
  document.getElementById('btnFa').classList.toggle('active', l === 'fa');
  document.getElementById('btnEn').classList.toggle('active', l === 'en');
  updateTexts();
}

function changeMode(m) {
  localStorage.setItem('dnsMode', m);
  document.body.setAttribute('data-theme', m);
  document.getElementById('btnLight').classList.toggle('active', m === 'light');
  document.getElementById('btnDark').classList.toggle('active', m === 'dark');
}

function changeColor(c) {
  localStorage.setItem('dnsColor', c);
  document.body.setAttribute('data-color', c);
}

function updateTexts() {
  var isFa = localStorage.getItem('dnsLang') === 'fa';
  document.getElementById('tAITitle').textContent = isFa ? 'هوش مصنوعی پنل' : 'AI Panel Assistant';
  document.getElementById('tAIDesc').textContent = isFa ? 'با هوش مصنوعی صحبت کنید و پنل را مدیریت کنید' : 'Chat with AI and manage your panel';
  document.getElementById('tWelcomeTitle').textContent = isFa ? 'به هوش مصنوعی پنل خوش آمدید' : 'Welcome to AI Panel Assistant';
  document.getElementById('tWelcomeText').textContent = isFa ? 'می‌توانید از من سوال بپرسید یا دستورات زیر را امتحان کنید:' : 'You can ask me questions or try these commands:';
  document.getElementById('tBack').textContent = isFa ? 'بازگشت' : 'Back';
  document.getElementById('tLogout').textContent = isFa ? 'خروج' : 'Logout';
  
  // Update command buttons
  var commands = document.querySelectorAll('.ai-command');
  if (commands.length >= 6) {
    commands[0].innerHTML = '<i class="fas fa-plus-circle"></i> ' + (isFa ? 'ساخت پنل' : 'Create Panel');
    commands[1].innerHTML = '<i class="fas fa-palette"></i> ' + (isFa ? 'تغییر تم' : 'Change Theme');
    commands[2].innerHTML = '<i class="fas fa-moon"></i> ' + (isFa ? 'حالت تاریک' : 'Dark Mode');
    commands[3].innerHTML = '<i class="fas fa-list"></i> ' + (isFa ? 'لیست پنل‌ها' : 'List Panels');
    commands[4].innerHTML = '<i class="fas fa-trash"></i> ' + (isFa ? 'حذف پنل' : 'Delete Panel');
    commands[5].innerHTML = '<i class="fas fa-gamepad"></i> ' + (isFa ? 'DNS گیمینگ' : 'Gaming DNS');
  }
  
  aiInput.placeholder = isFa ? 'پیام خود را بنویسید...' : 'Type your message...';
}

// ========== TOAST ==========
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

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', function() {
  // Check login
  if (!sessionStorage.getItem('dnsLogged')) {
    window.location.href = '/';
    return;
  }
  
  // Apply theme
  var mode = localStorage.getItem('dnsMode') || 'light';
  var color = localStorage.getItem('dnsColor') || 'blue';
  document.body.setAttribute('data-theme', mode);
  document.body.setAttribute('data-color', color);
  
  // Load history
  loadHistory();
  
  // Update texts
  updateTexts();
});