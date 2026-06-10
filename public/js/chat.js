/* Bateman chat interface */
(function () {
  'use strict';

  const messagesEl = document.getElementById('chatMessages');
  const emptyEl = document.getElementById('chatEmpty');
  const form = document.getElementById('chatForm');
  const input = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSend');
  const offlineBanner = document.getElementById('offlineBanner');
  const statusDot = document.getElementById('chatStatusDot');
  const statusLabel = document.getElementById('chatStatusLabel');
  const clearBtn = document.getElementById('clearChat');

  let online = false;
  let streaming = false;

  // --- Connection state ------------------------------------------------------
  async function checkStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      online = !!data.online;
    } catch (_) {
      online = false;
    }
    offlineBanner.hidden = online;
    statusDot.classList.toggle('online', online);
    statusDot.classList.toggle('offline', !online);
    statusLabel.textContent = online ? 'Online' : 'Offline — check the home server';
  }

  checkStatus();
  setInterval(checkStatus, 45000);

  // --- Rendering ---------------------------------------------------------------
  function hideEmpty() {
    if (emptyEl) emptyEl.style.display = 'none';
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addMessage(role, text) {
    hideEmpty();
    const el = document.createElement('div');
    el.className = 'chat-message ' + role;
    el.textContent = text;
    messagesEl.appendChild(el);
    scrollToBottom();
    return el;
  }

  function addToolActivity(toolName, detail) {
    hideEmpty();
    const icons = { web_search: '🔎', file_read: '📄', file_write: '📝', email_send: '✉️', email: '✉️' };
    const el = document.createElement('div');
    el.className = 'tool-activity';
    const icon = document.createElement('span');
    icon.textContent = icons[toolName] || '⚙️';
    const name = document.createElement('span');
    name.className = 'tool-name';
    name.textContent = toolName;
    el.appendChild(icon);
    el.appendChild(name);
    if (detail) {
      const detailEl = document.createElement('span');
      detailEl.textContent = String(detail).substring(0, 120);
      el.appendChild(detailEl);
    }
    messagesEl.appendChild(el);
    scrollToBottom();
  }

  function addTypingIndicator() {
    const el = document.createElement('div');
    el.className = 'typing-indicator';
    el.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(el);
    scrollToBottom();
    return el;
  }

  // --- Streaming -----------------------------------------------------------------
  // The backend proxies Bateman's SSE stream. Each event is a `data: {...}\n\n`
  // block; we accumulate chunks, split on double newlines, and parse each JSON
  // payload. Supported event types: token/delta (text), tool_use/activity, error, done.
  function handleEvent(payload, state) {
    let data;
    try {
      data = JSON.parse(payload);
    } catch (_) {
      // Plain-text data line — treat it as a token
      data = { type: 'token', content: payload };
    }

    const type = data.type || (data.tool ? 'tool_use' : 'token');

    if (type === 'token' || type === 'delta' || type === 'text') {
      const text = data.content ?? data.text ?? data.delta ?? '';
      if (!text) return;
      if (!state.assistantEl) {
        if (state.typingEl) { state.typingEl.remove(); state.typingEl = null; }
        state.assistantEl = addMessage('assistant', '');
      }
      state.assistantEl.textContent += text;
      scrollToBottom();
    } else if (type === 'tool_use' || type === 'tool' || type === 'activity') {
      if (state.typingEl) { state.typingEl.remove(); state.typingEl = null; }
      addToolActivity(data.tool || data.name || 'tool', data.detail || data.input || '');
      state.typingEl = addTypingIndicator();
    } else if (type === 'error') {
      if (state.typingEl) { state.typingEl.remove(); state.typingEl = null; }
      addMessage('error-msg', data.error || 'Bateman hit an error.');
    }
  }

  async function sendMessage(text) {
    streaming = true;
    sendBtn.disabled = true;
    addMessage('user', text);

    const state = { assistantEl: null, typingEl: addTypingIndicator() };

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': window.getCsrfToken(),
        },
        body: JSON.stringify({ message: text }),
      });

      if (!res.ok) {
        let errText = 'Bateman is offline — check the home server.';
        try {
          const errData = await res.json();
          if (errData.error) errText = errData.error;
        } catch (_) { /* ignore */ }
        throw new Error(errText);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const blocks = buffer.split('\n\n');
        buffer = blocks.pop(); // keep the trailing partial block

        for (const block of blocks) {
          const lines = block.split('\n');
          for (const line of lines) {
            if (line.startsWith('data:')) {
              const payload = line.slice(5).trim();
              if (payload && payload !== '[DONE]') handleEvent(payload, state);
            }
          }
        }
      }
    } catch (err) {
      addMessage('error-msg', err.message || 'Bateman is offline — check the home server.');
      checkStatus();
    } finally {
      if (state.typingEl) state.typingEl.remove();
      streaming = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  // --- Input handling ----------------------------------------------------------
  function submit() {
    const text = input.value.trim();
    if (!text || streaming) return;
    input.value = '';
    input.style.height = 'auto';
    sendMessage(text);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    submit();
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  });

  // Auto-grow textarea
  input.addEventListener('input', function () {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 140) + 'px';
  });

  // --- Clear chat (visible history only) -----------------------------------------
  clearBtn.addEventListener('click', function () {
    messagesEl.querySelectorAll('.chat-message, .tool-activity, .typing-indicator').forEach(function (el) {
      el.remove();
    });
    if (emptyEl) emptyEl.style.display = '';
  });

  input.focus();
})();
