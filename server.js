// ========== AI Chat با VivGrid API ==========
app.post('/api/ai/chat', async (req, res) => {
  const { message } = req.body;
  
  // گرفتن از متغیرهای محیطی
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL || 'https://api.vivgrid.com/v1';
  const model = process.env.AI_MODEL || 'deepseek-chat';
  
  if (!apiKey) {
    return res.json({ 
      success: false, 
      message: '❌ API Key not configured. Please set AI_API_KEY in .env' 
    });
  }

  try {
    console.log(`🤖 Using AI: ${baseUrl} | Model: ${model}`);
    
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
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
                      - "change theme to [color]" where color can be: blue, purple, green, rose, brown, red, orange, teal
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

    // برای دیباگ - لاگ کردن پاسخ
    const data = await response.json();
    console.log('AI Response Status:', response.status);
    
    if (!response.ok) {
      console.error('AI API Error:', JSON.stringify(data, null, 2));
      
      // پیام خطای خاص برای VivGrid
      let errorMsg = '❌ خطا در ارتباط با هوش مصنوعی';
      if (data.error?.message) {
        errorMsg += `: ${data.error.message}`;
      } else if (data.message) {
        errorMsg += `: ${data.message}`;
      }
      
      return res.json({ 
        success: false, 
        message: errorMsg
      });
    }
    
    // بررسی ساختار پاسخ
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('Unexpected API response:', data);
      return res.json({ 
        success: false, 
        message: '❌ پاسخ غیرمنتظره از API دریافت شد' 
      });
    }
    
    const reply = data.choices[0].message.content;
    const action = parseAIAction(reply);
    
    // ذخیره تاریخچه
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
      message: `❌ خطا در ارتباط: ${error.message}` 
    });
  }
});
