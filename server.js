const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ========== STORAGE ==========
let panels = [];
let aiHistory = [];

// Load data from memory (for Railway, we use in-memory or you can use Redis)
// For production, consider using a database

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

// Get panel by slug (for subdomain-like access)
app.get('/api/panel/:slug', (req, res) => {
  const slug = req.params.slug;
  const panel = panels.find(p => p.slug === slug);
  if (!panel) {
    return res.status(404).json({ success: false, message: 'Panel not found' });
  }
  res.json({ success: true, panel });
});

// AI Chat
app.post('/api/ai/chat', async (req, res) => {
  const { message } = req.body;
  const apiKey = process.env.AI_API_KEY;
  
  if (!apiKey) {
    return res.json({ 
      success: false, 
      message: 'AI API key not configured. Please set AI_API_KEY in .env' 
    });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { 
            role: 'system', 
            content: `You are an AI assistant for a DNS management panel. 
                      You can help users with:
                      - Creating DNS panels with specific settings
                      - Changing panel themes and colors
                      - Managing panel configurations
                      - Providing DNS recommendations
                      
                      Available commands:
                      - "create panel [name] with [days] days, [storage] GB, [users] users"
                      - "change theme to [color]" where color can be: blue, purple, green, rose
                      - "change mode to [light/dark]"
                      - "list panels" - shows all panels
                      - "delete panel [name]"
                      
                      Always respond in the same language as the user.
                      Keep responses concise and helpful.`
          },
          { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    });

    const data = await response.json();
    const reply = data.choices[0].message.content;
    
    // Parse AI response for actions
    const action = parseAIAction(reply);
    
    aiHistory.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
    aiHistory.push({ role: 'assistant', content: reply, timestamp: new Date().toISOString() });
    
    res.json({ 
      success: true, 
      message: reply,
      action: action
    });
  } catch (error) {
    console.error('AI Error:', error);
    res.json({ 
      success: false, 
      message: 'Error communicating with AI. Please try again.' 
    });
  }
});

// Parse AI actions
function parseAIAction(reply) {
  const lower = reply.toLowerCase();
  
  // Create panel
  if (lower.includes('create panel') || lower.includes('ساخت پنل')) {
    const nameMatch = reply.match(/["']([^"']*)["']/);
    const name = nameMatch ? nameMatch[1] : 'AI Panel';
    const daysMatch = reply.match(/(\d+)\s*days?/i) || reply.match(/(\d+)\s*روز/i);
    const days = daysMatch ? parseInt(daysMatch[1]) : 30;
    const storageMatch = reply.match(/(\d+)\s*GB/i) || reply.match(/(\d+)\s*گیگ/i);
    const storage = storageMatch ? parseInt(storageMatch[1]) : 100;
    const usersMatch = reply.match(/(\d+)\s*users?/i) || reply.match(/(\d+)\s*کاربر/i);
    const users = usersMatch ? parseInt(usersMatch[1]) : 10;
    
    return {
      type: 'create_panel',
      data: { name, days, storage, users }
    };
  }
  
  // Change theme
  if (lower.includes('theme') || lower.includes('color') || lower.includes('تم') || lower.includes('رنگ')) {
    let color = 'blue';
    if (lower.includes('purple') || lower.includes('بنفش')) color = 'purple';
    else if (lower.includes('green') || lower.includes('سبز')) color = 'green';
    else if (lower.includes('rose') || lower.includes('صورتی') || lower.includes('pink')) color = 'rose';
    else if (lower.includes('brown') || lower.includes('قهوه ای')) color = 'brown';
    else if (lower.includes('red') || lower.includes('قرمز')) color = 'red';
    else if (lower.includes('orange') || lower.includes('نارنجی')) color = 'orange';
    
    return {
      type: 'change_theme',
      data: { color }
    };
  }
  
  // Change mode
  if (lower.includes('dark') || lower.includes('تاریک')) {
    return { type: 'change_mode', data: { mode: 'dark' } };
  }
  if (lower.includes('light') || lower.includes('روشن')) {
    return { type: 'change_mode', data: { mode: 'light' } };
  }
  
  // List panels
  if (lower.includes('list') || lower.includes('نمایش') || lower.includes('panels')) {
    return { type: 'list_panels' };
  }
  
  // Delete panel
  if (lower.includes('delete') || lower.includes('حذف')) {
    const nameMatch = reply.match(/["']([^"']*)["']/);
    const name = nameMatch ? nameMatch[1] : null;
    if (name) {
      return { type: 'delete_panel', data: { name } };
    }
  }
  
  return null;
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
  // Check if it's a panel slug (not a reserved route)
  const reserved = ['dashboard', 'settings', 'ai', 'api', 'login'];
  if (reserved.includes(slug)) {
    return res.redirect('/' + slug);
  }
  
  // Check if panel exists
  const panel = panels.find(p => p.slug === slug);
  if (!panel) {
    return res.sendFile(path.join(__dirname, 'public', '404.html'));
  }
  
  // Serve panel page with slug
  let html = require('fs').readFileSync(path.join(__dirname, 'public', 'panel.html'), 'utf8');
  html = html.replace(/\{\{slug\}\}/g, slug);
  html = html.replace(/\{\{panelName\}\}/g, panel.name);
  html = html.replace(/\{\{panelData\}\}/g, JSON.stringify(panel));
  res.send(html);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Login: http://localhost:${PORT}`);
  console.log(`🔑 Username: ${process.env.ADMIN_USERNAME}`);
});
