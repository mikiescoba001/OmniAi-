/* =============================================
   OmniAI Frontend Application
   Orchestrates UI, connects to real API
   ============================================= */

const OmniAI = (() => {
  'use strict';

  // ── State ──
  const state = {
    currentPage: 'dashboard',
    sidebarOpen: false,
    theme: localStorage.getItem('omniai-theme') || 'dark',
    user: OmniAPI.getUser(),
    currentDocumentId: null,
    currentWritingContent: '',
    currentSelection: {},
  };

  // ── DOM helpers ──
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ── Utilities ──
  function toast(message, type = 'info') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const icons = { success: '✓', error: '✕', info: '●' };
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<span class="toast-icon">${icons[type]}</span><span class="toast-text">${message}</span>`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  function formatTime() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function setLoading(btn, loading, text = '') {
    if (btn) {
      btn.disabled = loading;
      btn.textContent = loading ? '⏳ Processing...' : text;
    }
  }

  // ── Navigation ──
  function navigateTo(page) {
    state.currentPage = page;
    $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
    $$('.page-section').forEach(s => s.classList.toggle('active', s.id === `page-${page}`));

    const titles = {
      dashboard: 'Dashboard',
      assistant: 'AI Assistant',
      writing: 'Writing Studio',
      image: 'Image Studio',
      video: 'Video Studio',
      pdf: 'PDF Intelligence',
      productivity: 'Productivity',
      learning: 'Learning Center',
      business: 'Business & Marketing',
      admin: 'Admin Panel',
    };
    $('#page-title').textContent = titles[page] || 'OmniAI';

    $('.sidebar').classList.remove('open');

    // Initialize page
    switch (page) {
      case 'dashboard': loadDashboard(); break;
      case 'assistant': initAssistant(); break;
      case 'productivity': loadProductivity(); break;
      case 'admin': loadAdmin(); break;
    }
  }

  // ── Auth Guard ──
  function checkAuth() {
    const user = OmniAPI.getUser();
    if (!user || !OmniAPI.Auth.isAuthenticated()) {
      OmniAuth.show('login');
      return false;
    }
    state.user = user;
    renderUser();
    return true;
  }

  function renderUser() {
    const u = state.user;
    if (!u) return;
    $('#user-name').textContent = u.name || u.email?.split('@')[0] || 'User';
    $('#user-email').textContent = u.email || '';
    $('#user-avatar').textContent = (u.name || u.email || 'U')[0].toUpperCase();

    const badge = $('#plan-badge');
    if (u.plan === 'premium') {
      badge.textContent = '✨ Premium';
      badge.className = 'plan-badge premium';
    } else {
      badge.textContent = 'Free';
      badge.className = 'plan-badge free';
    }

    // Show admin nav
    if (u.role === 'admin') {
      $('#nav-admin').style.display = 'flex';
    }
  }

  // ── Dashboard ──
  async function loadDashboard() {
    const user = state.user;
    if (user) {
      const hour = new Date().getHours();
      const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
      $('#dashboard-greeting').textContent = `${greeting}, ${user.name || user.email?.split('@')[0] || 'User'}! 👋`;
    }

    try {
      const data = await OmniAPI.Productivity.getDashboard();
      const s = data.stats || {};
      $('#stat-todos').textContent = s.completedTodos || 0;
      $('#stat-streak').textContent = s.longestStreak || 0;
      $('#stat-chats').textContent = s.aiChatsToday || 0;
      $('#stat-images').textContent = s.imagesGenerated || 0;

      // Progress
      const progressHtml = `
        <div style="display:flex;flex-direction:column;gap:var(--space-sm)">
          <div style="display:flex;justify-content:space-between;font-size:0.8125rem">
            <span style="color:var(--text-secondary)">Tasks Completed</span>
            <span style="font-weight:600">${s.completedTodos || 0}/${s.totalTodos || 0}</span>
          </div>
          <div style="height:6px;background:var(--bg-input);border-radius:var(--radius-full)">
            <div style="width:${s.totalTodos ? (s.completedTodos/s.totalTodos*100) : 0}%;height:100%;background:var(--gradient-primary);border-radius:var(--radius-full)"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:0.8125rem;margin-top:var(--space-sm)">
            <span style="color:var(--text-secondary)">Goals Progress</span>
            <span style="font-weight:600">${s.completedGoals || 0}/${s.totalGoals || 0}</span>
          </div>
          <div style="height:6px;background:var(--bg-input);border-radius:var(--radius-full)">
            <div style="width:${s.totalGoals ? (s.completedGoals/s.totalGoals*100) : 0}%;height:100%;background:var(--gradient-secondary);border-radius:var(--radius-full)"></div>
          </div>
        </div>
      `;
      $('#dashboard-progress').innerHTML = progressHtml;

      // Update usage indicator
      showUsageIndicator(s);

    } catch (err) {
      console.log('Dashboard load skipped:', err.message);
    }
  }

  function showUsageIndicator(stats) {
    const el = $('#usage-indicator');
    if (!el) return;
    const user = state.user;
    if (user?.plan === 'premium') {
      el.style.display = 'none';
      return;
    }
    const chats = stats?.aiChatsToday || 0;
    const left = Math.max(0, 30 - chats);
    el.textContent = `💬 ${left} chats left today`;
    el.style.display = 'inline-block';
  }

  // ── AI Assistant ──
  let assistantInitialized = false;
  function initAssistant() {
    if (assistantInitialized) return;
    assistantInitialized = true;

    const input = $('#chat-input');
    const sendBtn = $('#chat-send-btn');
    const messagesEl = $('#chat-messages');

    function addMessage(text, role) {
      const div = document.createElement('div');
      div.className = `message ${role}`;
      div.innerHTML = `
        <div class="message-avatar">${role === 'user' ? 'U' : 'O'}</div>
        <div>
          <div class="message-content">${text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/### (.*?)(?:\n|$)/g, '<strong>$1</strong><br>')}</div>
          <div class="message-time">${formatTime()}</div>
        </div>
      `;
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function showTyping() {
      const dots = document.createElement('div');
      dots.className = 'message assistant';
      dots.id = 'typing-indicator';
      dots.innerHTML = '<div class="message-avatar">O</div><div><div class="message-content" style="color:var(--text-muted)">Thinking...</div></div>';
      messagesEl.appendChild(dots);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function hideTyping() {
      const el = document.getElementById('typing-indicator');
      if (el) el.remove();
    }

    async function sendMessage() {
      const text = input.value.trim();
      if (!text) return;

      addMessage(text, 'user');
      input.value = '';
      showTyping();

      try {
        const data = await OmniAPI.AI.chat(text);
        hideTyping();
        addMessage(data.reply, 'assistant');
        // Update usage
        loadDashboard();
      } catch (err) {
        hideTyping();
        if (err.status === 429) {
          addMessage('⚠️ Daily message limit reached. Upgrade to Premium for unlimited access!', 'assistant');
        } else {
          addMessage(`⚠️ Error: ${err.message}`, 'assistant');
        }
      }
    }

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    // Quick prompts
    $$('.quick-prompt[data-prompt]').forEach(el => {
      el.addEventListener('click', () => {
        input.value = el.dataset.prompt;
        sendMessage();
      });
    });
  }

  // ── Writing Studio ──
  let writingInitialized = false;
  function initWriting() {
    if (writingInitialized) return;
    writingInitialized = true;

    const promptInput = $('#writing-prompt');
    const generateBtn = $('#writing-generate');
    const outputEl = $('#writing-output');
    const emptyEl = $('#writing-empty');
    const copyBtn = $('#writing-copy');
    const regenBtn = $('#writing-regen');

    // Tone chips
    $$('#writing-tool .option-chip[data-tone]').forEach(c => {
      c.addEventListener('click', () => {
        $$('#writing-tool .option-chip[data-tone]').forEach(x => x.classList.remove('active'));
        c.classList.add('active');
      });
    });

    // Length chips
    $$('#writing-tool .option-chip[data-length]').forEach(c => {
      c.addEventListener('click', () => {
        $$('#writing-tool .option-chip[data-length]').forEach(x => x.classList.remove('active'));
        c.classList.add('active');
      });
    });

    async function generate() {
      const prompt = promptInput.value.trim();
      if (!prompt) { toast('Please describe what to write', 'error'); return; }

      const type = $('#writing-type').value;
      const tone = document.querySelector('.option-chip[data-tone].active')?.dataset.tone || 'casual';
      const length = document.querySelector('.option-chip[data-length].active')?.dataset.length || 'medium';

      setLoading(generateBtn, true, '✨ Generate');
      emptyEl.style.display = 'none';
      outputEl.textContent = '';

      try {
        const data = await OmniAPI.AI.write(prompt, type, tone, length);
        outputEl.textContent = data.content;
        state.currentWritingContent = data.content;
        toast('Content generated!', 'success');
      } catch (err) {
        outputEl.textContent = `Error: ${err.message}`;
      }
      setLoading(generateBtn, false, '✨ Generate');
    }

    generateBtn.addEventListener('click', generate);

    if (regenBtn) regenBtn.addEventListener('click', generate);
    if (copyBtn) copyBtn.addEventListener('click', () => {
      const text = outputEl.textContent;
      if (text) navigator.clipboard.writeText(text).then(() => toast('Copied!', 'success'));
    });

    // Transform actions
    async function transform(action) {
      const text = outputEl.textContent;
      if (!text) { toast('Generate content first', 'error'); return; }
      setLoading(generateBtn, true, '⏳');
      try {
        const data = await OmniAPI.AI.transform(text, action);
        outputEl.textContent = data.content;
      } catch (err) {
        toast(err.message, 'error');
      }
      setLoading(generateBtn, false, '✨ Generate');
    }

    $('#writing-improve')?.addEventListener('click', () => transform('improve'));
    $('#writing-rewrite')?.addEventListener('click', () => transform('rewrite'));
    $('#writing-shorten')?.addEventListener('click', () => transform('shorten'));
    $('#writing-expand')?.addEventListener('click', () => transform('expand'));
    $('#writing-grammar')?.addEventListener('click', () => transform('grammar'));
  }

  // ── Image Studio ──
  let imageInitialized = false;
  function initImage() {
    if (imageInitialized) return;
    imageInitialized = true;

    const promptInput = $('#image-prompt');
    const generateBtn = $('#image-generate');
    const downloadBtn = $('#image-download');
    const previewEl = $('#image-preview');
    const historyEl = $('#image-history');

    async function generate() {
      const prompt = promptInput.value.trim();
      if (!prompt) { toast('Enter an image prompt', 'error'); return; }

      setLoading(generateBtn, true, '🎨 Generate');
      previewEl.innerHTML = '<div class="placeholder"><div class="icon">⏳</div><div>Generating your image...</div></div>';

      try {
        const data = await OmniAPI.AI.generateImage(prompt);
        previewEl.innerHTML = `<img src="${data.url}" alt="${prompt}">`;
        toast('Image generated!', 'success');
        loadImageHistory();
      } catch (err) {
        if (err.status === 429) {
          previewEl.innerHTML = '<div class="placeholder"><div class="icon">⚠️</div><div>Daily limit reached. Upgrade to Premium!</div></div>';
        } else {
          previewEl.innerHTML = `<div class="placeholder"><div class="icon">⚠️</div><div>${err.message}</div></div>`;
        }
      }
      setLoading(generateBtn, false, '🎨 Generate');
    }

    generateBtn.addEventListener('click', generate);

    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => {
        const img = previewEl.querySelector('img');
        if (img) {
          const a = document.createElement('a');
          a.href = img.src;
          a.download = 'omniai-image.png';
          a.click();
        } else {
          toast('Generate an image first', 'error');
        }
      });
    }

    async function loadImageHistory() {
      try {
        const data = await OmniAPI.AI.getImageHistory();
        const images = data.images || [];
        if (images.length === 0) {
          historyEl.innerHTML = '<div style="color:var(--text-muted);font-size:0.8125rem">No images yet</div>';
          return;
        }
        historyEl.innerHTML = images.map(img => `
          <div class="image-history-item" onclick="document.getElementById('image-preview').innerHTML='<img src=\\'${img.url}\\'>'">
            <img src="${img.url}" alt="${img.prompt}">
          </div>
        `).join('');
      } catch (err) {
        // Silent fail for history
      }
    }

    loadImageHistory();
  }

  // ── Video Studio ──
  let videoInitialized = false;
  function initVideo() {
    if (videoInitialized) return;
    videoInitialized = true;

    const promptInput = $('#video-prompt');
    const generateBtn = $('#video-generate');
    const outputEl = $('#video-output');
    const emptyEl = $('#video-empty');
    const copyBtn = $('#video-copy');
    const regenBtn = $('#video-regen');

    async function generate() {
      const prompt = promptInput.value.trim();
      if (!prompt) { toast('Describe your video concept', 'error'); return; }

      const type = $('#video-type').value;
      setLoading(generateBtn, true, '🎬 Generate');
      emptyEl.style.display = 'none';
      outputEl.textContent = '';

      try {
        const data = await OmniAPI.AI.write(prompt, type);
        outputEl.innerHTML = data.content.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      } catch (err) {
        outputEl.textContent = `Error: ${err.message}`;
      }
      setLoading(generateBtn, false, '🎬 Generate');
    }

    generateBtn.addEventListener('click', generate);
    if (regenBtn) regenBtn.addEventListener('click', generate);
    if (copyBtn) copyBtn.addEventListener('click', () => {
      const text = outputEl.textContent;
      if (text) navigator.clipboard.writeText(text).then(() => toast('Copied!', 'success'));
    });
  }

  // ── PDF Intelligence ──
  let pdfInitialized = false;
  function initPDF() {
    if (pdfInitialized) return;
    pdfInitialized = true;

    const uploadZone = $('#upload-zone');
    const fileInput = $('#pdf-upload');
    const fileList = $('#pdf-file-list');
    const pdfQuery = $('#pdf-query');
    const pdfAskBtn = $('#pdf-ask');
    const pdfOutput = $('#pdf-output');
    const pdfEmpty = $('#pdf-empty');
    const summarizeBtn = $('#pdf-summarize');

    function addFileItem(doc) {
      const item = document.createElement('div');
      item.className = 'pdf-file-item';
      item.dataset.docId = doc.id;
      item.innerHTML = `
        <span class="file-icon">📄</span>
        <div class="file-info">
          <div class="file-name">${doc.name}</div>
          <div class="file-size">${(doc.size / 1024).toFixed(1)} KB</div>
        </div>
        <span style="color:var(--secondary);font-size:0.75rem">✓</span>
      `;
      item.addEventListener('click', () => {
        state.currentDocumentId = doc.id;
        $$('.pdf-file-item').forEach(x => x.style.borderColor = '');
        item.style.borderColor = 'var(--primary)';
        toast(`Selected: ${doc.name}`, 'info');
      });
      // Remove "no documents" placeholder
      const empty = fileList.querySelector('[data-empty]');
      if (empty) empty.remove();
      fileList.appendChild(item);
    }

    async function handleUpload(file) {
      try {
        toast('Uploading...', 'info');
        const data = await OmniAPI.Files.upload(file);
        addFileItem(data);
        state.currentDocumentId = data.id;
        toast('Document uploaded!', 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
    }

    uploadZone.addEventListener('click', () => fileInput.click());
    uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.style.borderColor = 'var(--primary)'; });
    uploadZone.addEventListener('dragleave', () => { uploadZone.style.borderColor = ''; });
    uploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadZone.style.borderColor = '';
      Array.from(e.dataTransfer.files).forEach(handleUpload);
    });
    fileInput.addEventListener('change', () => {
      Array.from(fileInput.files).forEach(handleUpload);
      fileInput.value = '';
    });

    if (pdfAskBtn) {
      pdfAskBtn.addEventListener('click', async () => {
        const query = pdfQuery.value.trim();
        if (!query) { toast('Enter a question', 'error'); return; }
        if (!state.currentDocumentId) { toast('Select a document first', 'error'); return; }
        pdfEmpty.style.display = 'none';
        pdfOutput.textContent = 'Analyzing...';
        try {
          const data = await OmniAPI.Files.askDocument(state.currentDocumentId, query);
          pdfOutput.innerHTML = data.answer.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        } catch (err) {
          pdfOutput.textContent = `Error: ${err.message}`;
        }
      });
    }

    if (summarizeBtn) {
      summarizeBtn.addEventListener('click', async () => {
        if (!state.currentDocumentId) { toast('Select a document first', 'error'); return; }
        pdfEmpty.style.display = 'none';
        pdfOutput.textContent = 'Generating summary...';
        try {
          const data = await OmniAPI.Files.summarizeDocument(state.currentDocumentId);
          pdfOutput.innerHTML = `<strong>${data.title}</strong><br><br>${data.summary.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}`;
          toast('Summary generated!', 'success');
        } catch (err) {
          pdfOutput.textContent = `Error: ${err.message}`;
        }
      });
    }

    // Load existing documents
    async function loadDocuments() {
      try {
        const data = await OmniAPI.Files.getDocuments();
        const docs = data.documents || [];
        if (docs.length === 0) {
          fileList.innerHTML = '<div data-empty style="text-align:center;color:var(--text-muted);font-size:0.8125rem;padding:var(--space-md)">No documents uploaded yet</div>';
          return;
        }
        fileList.innerHTML = '';
        docs.forEach(d => addFileItem(d));
        if (docs.length > 0) state.currentDocumentId = docs[0].id;
      } catch (err) {
        // Silent
      }
    }
    loadDocuments();
  }

  // ── Productivity ──
  async function loadProductivity() {
    try {
      const data = await OmniAPI.Productivity.getDashboard();
      const s = data.stats || {};
      $('#prod-total').textContent = s.totalTodos || 0;
      $('#prod-done').textContent = s.completedTodos || 0;
      $('#prod-streak').textContent = s.longestStreak || 0;
      $('#prod-goals').textContent = s.totalGoals || 0;
    } catch (err) { /* silent */ }

    loadTodos();
    loadNotes();
    loadHabits();
    loadGoals();
    renderCalendar();

    // Tab switching
    $$('#page-productivity .option-chip[data-section]').forEach(chip => {
      chip.addEventListener('click', () => {
        $$('#page-productivity .option-chip[data-section]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const section = chip.dataset.section;
        $$('#page-productivity .productivity-section').forEach(s => {
          s.classList.toggle('hidden', s.id !== `prod-${section}`);
        });
      });
    });
  }

  // ── Todos ──
  async function loadTodos() {
    try {
      const data = await OmniAPI.Productivity.getTodos();
      const todos = data.todos || [];
      const list = $('#todo-list');
      if (todos.length === 0) {
        list.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:var(--space-lg)">No tasks yet. Add one above!</div>';
        return;
      }
      list.innerHTML = todos.map(t => `
        <div class="todo-item" data-id="${t.id}">
          <div class="todo-checkbox ${t.done ? 'checked' : ''}" onclick="OmniAI.toggleTodo('${t.id}', ${!t.done})">
            ${t.done ? '✓' : ''}
          </div>
          <span class="todo-text ${t.done ? 'completed' : ''}">${t.text}</span>
          <span class="todo-delete" onclick="OmniAI.deleteTodo('${t.id}')">🗑️</span>
        </div>
      `).join('');
    } catch (err) { /* silent */ }
  }

  async function toggleTodo(id, done) {
    try {
      await OmniAPI.Productivity.updateTodo(id, { done });
      loadTodos();
      loadDashboard();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function deleteTodo(id) {
    try {
      await OmniAPI.Productivity.deleteTodo(id);
      loadTodos();
      loadDashboard();
    } catch (err) { toast(err.message, 'error'); }
  }

  // ── Notes ──
  async function loadNotes() {
    try {
      const data = await OmniAPI.Productivity.getNotes();
      const notes = data.notes || [];
      const list = $('#notes-list');
      if (notes.length === 0) {
        list.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:var(--space-md);font-size:0.8125rem">No notes yet</div>';
        return;
      }
      list.innerHTML = notes.slice(0, 5).map(n => `
        <div class="card" style="padding:var(--space-md);cursor:pointer" onclick="document.getElementById('note-content').value=this.querySelector('.note-body')?.textContent||''">
          <div style="font-weight:600;font-size:0.875rem">${n.title || 'Untitled'}</div>
          <div class="note-body" style="font-size:0.8125rem;color:var(--text-muted);margin-top:var(--space-xs);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${n.content?.substring(0, 200) || ''}</div>
        </div>
      `).join('');
    } catch (err) { /* silent */ }
  }

  // ── Habits ──
  async function loadHabits() {
    try {
      const data = await OmniAPI.Productivity.getHabits();
      const habits = data.habits || [];
      const list = $('#habits-list');
      if (habits.length === 0) {
        list.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:var(--space-md);font-size:0.8125rem">No habits tracked yet</div>';
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      list.innerHTML = habits.map(h => {
        const done = (h.logs || []).includes(today);
        return `
          <div class="card" style="display:flex;align-items:center;gap:var(--space-md);padding:var(--space-md);margin-bottom:var(--space-sm)">
            <span style="font-size:1.25rem">${h.icon || '💪'}</span>
            <span style="flex:1;font-size:0.875rem">${h.name}</span>
            <span style="color:var(--text-secondary);font-size:0.75rem">🔥 ${h.streak || 0} days</span>
            <div class="todo-checkbox ${done ? 'checked' : ''}" onclick="OmniAPI.Productivity.logHabit('${h.id}').then(()=>loadHabits())">
              ${done ? '✓' : ''}
            </div>
          </div>
        `;
      }).join('');
    } catch (err) { /* silent */ }
  }

  // ── Goals ──
  async function loadGoals() {
    try {
      const data = await OmniAPI.Productivity.getGoals();
      const goals = data.goals || [];
      const list = $('#goals-list');
      if (goals.length === 0) {
        list.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:var(--space-md);font-size:0.8125rem">No goals set</div>';
        return;
      }
      list.innerHTML = goals.map(g => `
        <div class="card" style="margin-bottom:var(--space-sm)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-sm)">
            <span style="font-weight:600;font-size:0.875rem">${g.title}</span>
            <span style="font-size:0.75rem;color:var(--text-secondary)">${g.progress || 0}%</span>
          </div>
          <div style="height:6px;background:var(--bg-input);border-radius:var(--radius-full);overflow:hidden">
            <div style="width:${g.progress || 0}%;height:100%;background:var(--gradient-primary);border-radius:var(--radius-full)"></div>
          </div>
        </div>
      `).join('');
    } catch (err) { /* silent */ }
  }

  function renderCalendar() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = now.getDate();

    $('#cal-month').textContent = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let html = days.map(d => `<span style="color:var(--text-muted);font-size:0.75rem">${d}</span>`).join('');
    for (let i = 0; i < firstDay; i++) html += '<div></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const isToday = d === today;
      html += `<div style="padding:8px;border-radius:var(--radius-sm);background:${isToday ? 'var(--gradient-primary)' : 'transparent'};color:${isToday ? 'white' : 'var(--text-secondary)'};font-weight:${isToday ? '700' : '400'};font-size:0.75rem">${d}</div>`;
    }
    $('#cal-grid').innerHTML = html;
  }

  // ── Learning Center ──
  let learningInitialized = false;
  function initLearning() {
    if (learningInitialized) return;
    learningInitialized = true;

    const topicInput = $('#learning-topic');
    const explainBtn = $('#learning-explain');
    const flashcardsBtn = $('#learning-flashcards');
    const quizBtn = $('#learning-quiz');
    const studyPlanBtn = $('#learning-studyplan');
    const roadmapBtn = $('#learning-roadmap');
    const outputEl = $('#learning-output');
    const emptyEl = $('#learning-empty');

    // Level chips
    $$('#page-learning .option-chip[data-level]').forEach(c => {
      c.addEventListener('click', () => {
        $$('#page-learning .option-chip[data-level]').forEach(x => x.classList.remove('active'));
        c.classList.add('active');
      });
    });

    async function handleAction(action) {
      const topic = topicInput.value.trim();
      if (!topic) { toast('Enter a topic first', 'error'); return; }
      const level = document.querySelector('.option-chip[data-level].active')?.dataset.level || 'beginner';
      emptyEl.style.display = 'none';
      outputEl.textContent = 'Generating...';

      try {
        let data;
        switch (action) {
          case 'explain':
            data = await OmniAPI.Learning.explain(topic, level);
            outputEl.innerHTML = data.content.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            break;
          case 'flashcards':
            data = await OmniAPI.Learning.generateFlashcards(topic);
            outputEl.innerHTML = (data.flashcards || []).map((f, i) =>
              `<strong>Q${i+1}:</strong> ${f.question}<br><strong>A:</strong> ${f.answer}<br><br>`
            ).join('') || 'No flashcards generated';
            break;
          case 'quiz':
            data = await OmniAPI.Learning.generateQuiz(topic);
            outputEl.innerHTML = data.quiz.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            break;
          case 'studyplan':
            data = await OmniAPI.Learning.studyPlan(topic);
            outputEl.innerHTML = data.plan.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            break;
          case 'roadmap':
            data = await OmniAPI.Learning.roadmap(topic, level);
            outputEl.innerHTML = data.roadmap.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            break;
        }
        toast('Content generated!', 'success');
      } catch (err) {
        outputEl.textContent = `Error: ${err.message}`;
      }
    }

    explainBtn?.addEventListener('click', () => handleAction('explain'));
    flashcardsBtn?.addEventListener('click', () => handleAction('flashcards'));
    quizBtn?.addEventListener('click', () => handleAction('quiz'));
    studyPlanBtn?.addEventListener('click', () => handleAction('studyplan'));
    roadmapBtn?.addEventListener('click', () => handleAction('roadmap'));
  }

  // ── Business Toolkit ──
  let businessInitialized = false;
  function initBusiness() {
    if (businessInitialized) return;
    businessInitialized = true;

    const promptInput = $('#business-prompt');
    const generateBtn = $('#business-generate');
    const outputEl = $('#business-output');
    const emptyEl = $('#business-empty');
    const copyBtn = $('#biz-copy');

    let currentMode = 'ideas';

    // Business mode chips
    $$('#page-business .option-chip[data-biz]').forEach(c => {
      c.addEventListener('click', () => {
        $$('#page-business .option-chip[data-biz]').forEach(x => x.classList.remove('active'));
        c.classList.add('active');
        currentMode = c.dataset.biz;
        const labels = {
          ideas: 'Describe your industry or market',
          marketing: 'Describe your business and budget',
          brand: 'Describe your industry and desired vibe',
          seo: 'What topic do you want to rank for?',
          calendar: 'Describe your business and channels',
          logo: 'Describe your brand and preferred style',
        };
        promptInput.placeholder = labels[currentMode] || 'Describe your business...';
      });
    });

    async function generate() {
      const prompt = promptInput.value.trim();
      if (!prompt) { toast('Describe your business', 'error'); return; }

      setLoading(generateBtn, true, '🚀 Generate');
      emptyEl.style.display = 'none';
      outputEl.textContent = '';

      try {
        let data;
        switch (currentMode) {
          case 'ideas':
            data = await OmniAPI.Business.ideas(prompt);
            outputEl.innerHTML = data.content.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            break;
          case 'marketing':
            data = await OmniAPI.Business.marketingPlan(prompt);
            outputEl.innerHTML = data.plan.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            break;
          case 'brand':
            data = await OmniAPI.Business.brandNames(prompt);
            outputEl.innerHTML = data.names.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            break;
          case 'seo':
            data = await OmniAPI.Business.seo(prompt);
            outputEl.innerHTML = data.content.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            break;
          case 'calendar':
            data = await OmniAPI.Business.contentCalendar(prompt);
            outputEl.innerHTML = data.calendar.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            break;
          case 'logo':
            data = await OmniAPI.Business.generateLogo(prompt);
            outputEl.innerHTML = `<div style="text-align:center"><img src="${data.url}" style="max-width:300px;border-radius:var(--radius-md)"><br><br>Logo generated successfully!</div>`;
            break;
        }
        toast('Generated!', 'success');
      } catch (err) {
        outputEl.textContent = `Error: ${err.message}`;
      }
      setLoading(generateBtn, false, '🚀 Generate');
    }

    generateBtn.addEventListener('click', generate);

    if (copyBtn) copyBtn.addEventListener('click', () => {
      const text = outputEl.textContent;
      if (text) navigator.clipboard.writeText(text).then(() => toast('Copied!', 'success'));
    });
  }

  // ── Admin Dashboard ──
  async function loadAdmin() {
    try {
      const [stats, usage, health] = await Promise.all([
        OmniAPI.Admin.getDashboard().catch(() => null),
        OmniAPI.Admin.getAIUsage().catch(() => null),
        OmniAPI.healthCheck().catch(() => null),
      ]);

      if (stats) {
        $('#admin-users').textContent = stats.totalUsers || 0;
        $('#admin-active').textContent = stats.activeToday || 0;
        $('#admin-premium').textContent = stats.premiumUsers || 0;
        $('#admin-revenue').textContent = `$${(stats.monthlyRevenue || 0).toLocaleString()}`;
      }

      if (usage) {
        $('#admin-usage').textContent = JSON.stringify(usage, null, 2);
      }

      if (health) {
        $('#admin-health').textContent = JSON.stringify(health, null, 2);
      }
    } catch (err) {
      $('#admin-usage').textContent = 'Unable to load admin data';
    }
  }

  // ── Theme ──
  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    $('#theme-toggle').textContent = state.theme === 'dark' ? '☀️' : '🌙';
    localStorage.setItem('omniai-theme', state.theme);
  }

  // ── Init ──
  async function init() {
    // Theme
    document.documentElement.setAttribute('data-theme', state.theme);
    $('#theme-toggle').textContent = state.theme === 'dark' ? '☀️' : '🌙';

    // User menu
    $('#user-menu-trigger')?.addEventListener('click', () => {
      const dd = $('#user-dropdown');
      dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.sidebar-footer')) {
        const dd = $('#user-dropdown');
        if (dd) dd.style.display = 'none';
      }
    });

    // Navigation
    $$('.nav-item[data-page]').forEach(item => {
      item.addEventListener('click', () => navigateTo(item.dataset.page));
    });

    // Mobile menu
    $('#mobile-menu-btn')?.addEventListener('click', () => {
      state.sidebarOpen = !state.sidebarOpen;
      $('.sidebar').classList.toggle('open', state.sidebarOpen);
    });

    // Theme toggle
    $('#theme-toggle')?.addEventListener('click', toggleTheme);

    // Premium modal
    $$('[data-action="upgrade"]').forEach(el => {
      el.addEventListener('click', () => $('#premium-modal').style.display = 'flex');
    });
    $('#premium-close')?.addEventListener('click', () => $('#premium-modal').style.display = 'none');
    $('#premium-modal')?.addEventListener('click', (e) => {
      if (e.target === $('#premium-modal')) $('#premium-modal').style.display = 'none';
    });

    // Auth check & start
    const user = OmniAPI.getUser();
    if (!user || !OmniAPI.Auth.isAuthenticated()) {
      OmniAuth.show('login');
      OmniAuth.onAuth((u) => {
        state.user = u;
        renderUser();
        startApp();
      });
      // Show loading then auth
      setTimeout(() => {
        $('#loading-screen')?.classList.add('hidden');
      }, 800);
    } else {
      state.user = user;
      renderUser();
      startApp();
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        $('#premium-modal').style.display = 'none';
      }
    });
  }

  function startApp() {
    renderUser();

    // Initialize all modules
    initWriting();
    initImage();
    initVideo();
    initPDF();
    initLearning();
    initBusiness();

    // First page
    navigateTo('dashboard');

    // Hide loading
    setTimeout(() => {
      $('#loading-screen')?.classList.add('hidden');
      $('#app-container').style.display = 'flex';
    }, 500);
  }

  // ── Public API ──
  return {
    init,
    navigateTo,
    toggleTodo,
    deleteTodo,
  };
})();

// Boot
document.addEventListener('DOMContentLoaded', () => OmniAI.init());