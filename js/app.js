/* ============================================
   OMNIAI 2.1 — Production Frontend
   All data flows through OmniAPI to the backend.
   No mock/simulated/fake functionality.
   ============================================ */

const OmniAI = (() => {
  'use strict';

  // =============================================
  // STATE
  // =============================================
  const state = {
    user: null,
    subscription: { plan: 'free', status: 'active' },
    theme: localStorage.getItem('omniai-theme') || 'dark',
    currentPage: 'assistant',
    sidebarOpen: false,
    initialized: {},
  };

  // =============================================
  // DOM HELPERS
  // =============================================
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function uuid() {
    return 'xxxxxxxxxxxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16));
  }

  function toast(message, type = 'info') {
    const existing = $('.toast');
    if (existing) existing.remove();

    const icons = { success: '✓', error: '✕', info: '●' };
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<span class="toast-icon">${icons[type]}</span><span class="toast-text">${escapeHTML(message)}</span>`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }

  function formatTime() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // Safe HTML rendering: escapes all HTML then applies safe markdown
  function safeRender(text) {
    const el = document.createElement('div');
    el.textContent = text || '';
    let html = el.innerHTML;
    // Safe markdown: bold (**text**)
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Safe markdown: line breaks
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  // Escape HTML for safe insertion (no markdown)
  function escapeHTML(str) {
    const el = document.createElement('div');
    el.textContent = str || '';
    return el.innerHTML;
  }

  // =============================================
  // AUTH UI
  // =============================================
  function showAuthUI() {
    const existing = document.querySelector('.auth-overlay');
    if (existing) return;

    const overlay = document.createElement('div');
    overlay.className = 'auth-overlay';
    overlay.innerHTML = `
      <div class="auth-modal">
        <div class="auth-logo">✦ OmniAI</div>
        <div class="auth-tabs">
          <button class="auth-tab active" data-form="login">Sign In</button>
          <button class="auth-tab" data-form="register">Create Account</button>
        </div>

        <form id="auth-login" class="auth-form active">
          <div class="input-group">
            <label class="input-label">Email</label>
            <input class="input-field" type="email" id="login-email" placeholder="you@example.com" required autocomplete="email">
          </div>
          <div class="input-group">
            <label class="input-label">Password</label>
            <input class="input-field" type="password" id="login-password" placeholder="Your password" required autocomplete="current-password">
          </div>
          <button class="btn btn-primary btn-lg w-full" type="submit" id="login-btn">Sign In</button>
          <div class="auth-error" id="auth-error"></div>
        </form>

        <form id="auth-register" class="auth-form">
          <div class="input-group">
            <label class="input-label">Name</label>
            <input class="input-field" type="text" id="register-name" placeholder="Your name" required>
          </div>
          <div class="input-group">
            <label class="input-label">Email</label>
            <input class="input-field" type="email" id="register-email" placeholder="you@example.com" required autocomplete="email">
          </div>
          <div class="input-group">
            <label class="input-label">Password</label>
            <input class="input-field" type="password" id="register-password" placeholder="At least 8 characters" required minlength="8" autocomplete="new-password">
          </div>
          <button class="btn btn-primary btn-lg w-full" type="submit" id="register-btn">Create Account</button>
          <div class="auth-error" id="register-error"></div>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);

    // Tab switching
    overlay.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        overlay.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        overlay.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        overlay.getElementById(`auth-${tab.dataset.form}`).classList.add('active');
        overlay.querySelector('.auth-error').textContent = '';
      });
    });

    // Login
    overlay.querySelector('#auth-login').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = overlay.querySelector('#login-btn');
      const errEl = overlay.querySelector('#auth-error');
      btn.disabled = true; btn.textContent = 'Signing in...'; errEl.textContent = '';

      try {
        const result = await OmniAPI.auth.login(
          overlay.querySelector('#login-email').value,
          overlay.querySelector('#login-password').value
        );
        state.user = result.user;
        overlay.remove();
        await loadUserData();
        toast('Welcome back!', 'success');
      } catch (err) {
        errEl.textContent = err.message || 'Login failed';
      } finally {
        btn.disabled = false; btn.textContent = 'Sign In';
      }
    });

    // Register
    overlay.querySelector('#auth-register').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = overlay.querySelector('#register-btn');
      const errEl = overlay.querySelector('#register-error');
      btn.disabled = true; btn.textContent = 'Creating account...'; errEl.textContent = '';

      try {
        const result = await OmniAPI.auth.register(
          overlay.querySelector('#register-email').value,
          overlay.querySelector('#register-password').value,
          overlay.querySelector('#register-name').value
        );
        state.user = result.user;
        overlay.remove();
        await loadUserData();
        toast('Account created! Welcome to OmniAI.', 'success');
        // Show onboarding for new users
        setTimeout(() => showOnboarding(), 500);
      } catch (err) {
        errEl.textContent = err.message || 'Registration failed';
      } finally {
        btn.disabled = false; btn.textContent = 'Create Account';
      }
    });
  }

  async function loadUserData() {
    if (!OmniAPI.isAuthenticated()) return;
    try {
      const data = await OmniAPI.auth.me();
      state.user = data;
      state.subscription = data.subscription || { plan: 'free', status: 'active' };
      updateUserUI();
    } catch {
      // Token might be expired
    }
  }

  function updateUserUI() {
    const avatar = $('.user-avatar');
    const name = $('.user-name');
    const email = $('.user-email');
    const badge = $('.plan-badge');

    if (state.user) {
      if (avatar) avatar.textContent = (state.user.name || 'U')[0].toUpperCase();
      if (name) name.textContent = state.user.name || 'User';
      if (email) email.textContent = state.user.email || '';
      if (badge) {
        const plan = state.subscription?.plan || 'free';
        badge.textContent = plan === 'free' ? 'Free' : 'Premium';
        badge.className = `plan-badge ${plan === 'free' ? 'free' : 'premium'}`;
      }
    }
  }

  // =============================================
  // NAVIGATION
  // =============================================
  function navigateTo(page) {
    state.currentPage = page;
    $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
    $$('.page-section').forEach(s => s.classList.toggle('active', s.id === `page-${page}`));

    const titles = {
      assistant: 'AI Assistant', writing: 'Writing Studio', image: 'Image Studio',
      video: 'Video Studio', pdf: 'PDF Intelligence', productivity: 'Productivity',
      learning: 'Learning Center', business: 'Business & Marketing', settings: 'Settings',
    };
    const titleEl = $('.page-title');
    if (titleEl) titleEl.textContent = titles[page] || 'OmniAI';

    state.sidebarOpen = false;
    $('.sidebar')?.classList.remove('open');

    if (!state.initialized[page]) {
      state.initialized[page] = true;
      initPage(page);
    }
  }

  function initPage(page) {
    switch (page) {
      case 'assistant': initAssistant(); break;
      case 'writing': initWriting(); break;
      case 'image': initImage(); break;
      case 'video': initVideo(); break;
      case 'pdf': initPDF(); break;
      case 'productivity': initProductivity(); break;
      case 'learning': initLearning(); break;
      case 'business': initBusiness(); break;
    }
  }

  // =============================================
  // GENERIC: Add message to any chat-like output
  // =============================================
  function addMessage(container, text, role) {
    const messagesEl = container.querySelector('.chat-messages') || container;
    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.innerHTML = `
      <div class="message-avatar">${role === 'user' ? 'U' : 'O'}</div>
      <div>
        <div class="message-content">${safeRender(text)}</div>
        <div class="message-time">${formatTime()}</div>
      </div>
    `;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function showLoading(container) {
    const dots = document.createElement('div');
    dots.className = 'message assistant loading-msg';
    dots.innerHTML = '<div class="message-avatar">O</div><div><div class="message-content"><span class="skeleton" style="display:inline-block;width:200px;height:20px"></span></div></div>';
    (container.querySelector('.chat-messages') || container).appendChild(dots);
    return dots;
  }

  function removeLoading(el) { if (el) el.remove(); }

  function setGenerating(btn, loading = true) {
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = loading ? '⏳ Processing...' : btn.dataset.originalText || btn.textContent;
  }

  // =============================================
  // 1. AI ASSISTANT
  // =============================================
  function initAssistant() {
    const container = $('#assistant-chat');
    if (!container) return;

    const input = container.querySelector('.chat-input');
    const sendBtn = container.querySelector('.chat-send-btn');
    const messagesEl = container.querySelector('.chat-messages');

    let conversationId = null;

    async function sendMessage() {
      const text = input.value.trim();
      if (!text) return;

      addMessage(messagesEl, text, 'user');
      input.value = '';
      sendBtn.disabled = true;

      const loading = showLoading(messagesEl);

      try {
        const result = await OmniAPI.ai.chat(text, conversationId);
        conversationId = result.conversationId;
        removeLoading(loading);
        addMessage(messagesEl, result.message, 'assistant');
      } catch (err) {
        removeLoading(loading);
        addMessage(messagesEl, '⚠️ ' + (err.message || 'Failed to get response. Please try again.'), 'assistant');
      } finally {
        sendBtn.disabled = false;
      }
    }

    // Add AI feedback after each assistant response
    const origAddMsg = addMessage;
    addMessage = function(container, text, role) {
      origAddMsg(container, text, role);
      if (role === 'assistant' && container === messagesEl) {
        addAIFeedbackButtons(messagesEl, 'chat');
      }
    };

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    container.querySelectorAll('.quick-prompt').forEach(el => {
      el.addEventListener('click', () => {
        input.value = el.textContent;
        sendMessage();
      });
    });
  }

  // =============================================
  // 2. WRITING STUDIO
  // =============================================
  function initWriting() {
    const container = $('#writing-tool');
    if (!container) return;

    const promptInput = container.querySelector('#writing-prompt');
    const generateBtn = container.querySelector('#writing-generate');
    const outputEl = container.querySelector('.tool-output-content');
    const emptyEl = container.querySelector('.tool-output-empty');
    const copyBtn = container.querySelector('#writing-copy');
    const regenBtn = container.querySelector('#writing-regen');

    generateBtn.dataset.originalText = '✨ Generate';

    async function generate() {
      const prompt = promptInput.value.trim();
      if (!prompt) { toast('Please describe what to write.', 'error'); return; }

      const typeSelect = container.querySelector('#writing-type');
      const activeTone = container.querySelector('.option-chip.active');
      const activeLength = container.querySelectorAll('.options-bar')[2]?.querySelector('.option-chip.active');

      setGenerating(generateBtn, true);
      emptyEl.style.display = 'none';
      outputEl.textContent = '';

      try {
        const result = await OmniAPI.ai.writing(
          prompt,
          typeSelect?.value?.toLowerCase().replace(/\s+/g, '-') || 'article',
          activeTone?.textContent?.toLowerCase() || 'professional',
          activeLength?.textContent?.toLowerCase() || 'medium'
        );
        outputEl.innerHTML = safeRender(result.content);
        toast('Content generated!', 'success');
      } catch (err) {
        outputEl.innerHTML = '<span style="color:#FF6B6B">⚠️ ' + escapeHTML(err.message || 'Generation failed.') + '</span>';
      } finally {
        setGenerating(generateBtn, false);
      }
    }

    generateBtn.addEventListener('click', generate);
    if (regenBtn) regenBtn.addEventListener('click', generate);
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const text = outputEl.textContent;
        if (text) navigator.clipboard.writeText(text).then(() => toast('Copied!', 'success'));
      });
    }
    promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) generate();
    });
  }

  // =============================================
  // 3. IMAGE STUDIO
  // =============================================
  function initImage() {
    const container = $('#image-studio');
    if (!container) return;

    const promptInput = container.querySelector('#image-prompt');
    const generateBtn = container.querySelector('#image-generate');
    const enhanceBtn = container.querySelector('#image-enhance');
    const removeBgBtn = container.querySelector('#image-removebg');
    const upscaleBtn = container.querySelector('#image-upscale');
    const downloadBtn = container.querySelector('#image-download');
    const previewEl = container.querySelector('.image-preview');
    const historyEl = container.querySelector('.image-history');

    generateBtn.dataset.originalText = '🎨 Generate';
    let currentImageUrl = null;

    async function generateImage() {
      const prompt = promptInput.value.trim();
      if (!prompt) { toast('Please describe your image.', 'error'); return; }

      const activeStyle = container.querySelector('.option-chip.active');
      setGenerating(generateBtn, true);

      const placeholder = previewEl.querySelector('.placeholder');
      if (placeholder) placeholder.style.display = 'none';

      // Show loading state in preview
      const loadingDiv = document.createElement('div');
      loadingDiv.style.cssText = 'text-align:center;color:var(--text-muted);padding:40px';
      loadingDiv.textContent = '⏳ Generating image...';
      previewEl.appendChild(loadingDiv);

      try {
        const result = await OmniAPI.ai.image(prompt, activeStyle?.textContent?.toLowerCase() || 'realistic');

        if (result.image?.url) {
          // Real image from DALL-E
          const img = document.createElement('img');
          img.src = result.image.url;
          img.alt = escapeHTML(prompt);
          const old = previewEl.querySelector('img');
          if (old) old.remove();
          loadingDiv.remove();
          previewEl.appendChild(img);
          currentImageUrl = result.image.url;

          // Add to history
          const histItem = document.createElement('div');
          histItem.className = 'image-history-item';
          const thumb = document.createElement('img');
          thumb.src = result.image.url;
          thumb.alt = escapeHTML(prompt);
          histItem.appendChild(thumb);
          historyEl.prepend(histItem);
        } else {
          // Enhanced prompt fallback
          loadingDiv.innerHTML = '<div style="padding:20px;text-align:left">' +
            '<strong>Enhanced Prompt:</strong><br><br>' +
            safeRender(result.enhancedPrompt || 'Prompt processed.') +
            '<br><br><small style="color:var(--text-muted)">' + escapeHTML(result.note || 'Set OPENAI_API_KEY with DALL-E access for image generation.') + '</small>' +
            '</div>';
        }
        toast('Image ready!', 'success');
      } catch (err) {
        loadingDiv.innerHTML = '<span style="color:#FF6B6B">⚠️ ' + escapeHTML(err.message || 'Image generation failed.') + '</span>';
      } finally {
        setGenerating(generateBtn, false);
      }
    }

    generateBtn.addEventListener('click', generateImage);
    promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) generateImage();
    });

    enhanceBtn?.addEventListener('click', () => toast('Image enhancement requires DALL-E API access.', 'info'));
    removeBgBtn?.addEventListener('click', () => toast('Background removal requires image processing API.', 'info'));
    upscaleBtn?.addEventListener('click', () => toast('Upscaling requires image processing API.', 'info'));

    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => {
        if (currentImageUrl) {
          const a = document.createElement('a');
          a.href = currentImageUrl;
          a.download = 'omniai-image.png';
          a.click();
        } else {
          toast('Generate an image first.', 'error');
        }
      });
    }
  }

  // =============================================
  // 4. VIDEO STUDIO
  // =============================================
  function initVideo() {
    const container = $('#video-studio');
    if (!container) return;

    const promptInput = container.querySelector('#video-prompt');
    const generateBtn = container.querySelector('#video-generate');
    const outputEl = container.querySelector('.tool-output-content');
    const emptyEl = container.querySelector('.tool-output-empty');
    const copyBtn = container.querySelector('#video-copy');
    const regenBtn = container.querySelector('#video-regen');
    const typeSelect = container.querySelector('#video-type');

    generateBtn.dataset.originalText = '🎬 Generate';

    async function generate() {
      const prompt = promptInput.value.trim();
      if (!prompt) { toast('Describe your video concept.', 'error'); return; }

      setGenerating(generateBtn, true);
      emptyEl.style.display = 'none';
      outputEl.textContent = '';

      try {
        const result = await OmniAPI.ai.video(
          prompt,
          typeSelect?.value?.toLowerCase().replace(/[&\s]+/g, '-').replace(/-$/, '') || 'script'
        );
        outputEl.innerHTML = safeRender(result.content);
        toast('Video content ready!', 'success');
      } catch (err) {
        outputEl.innerHTML = '<span style="color:#FF6B6B">⚠️ ' + escapeHTML(err.message) + '</span>';
      } finally {
        setGenerating(generateBtn, false);
      }
    }

    generateBtn.addEventListener('click', generate);
    if (regenBtn) regenBtn.addEventListener('click', generate);
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const text = outputEl.textContent;
        if (text) navigator.clipboard.writeText(text).then(() => toast('Copied!', 'success'));
      });
    }
  }

  // =============================================
  // 5. PDF INTELLIGENCE
  // =============================================
  function initPDF() {
    const container = $('#pdf-intelligence');
    if (!container) return;

    const uploadZone = container.querySelector('.upload-zone');
    const fileInput = container.querySelector('#pdf-upload');
    const fileList = container.querySelector('.pdf-file-list');
    const pdfQuery = container.querySelector('#pdf-query');
    const pdfAskBtn = container.querySelector('#pdf-ask');
    const pdfOutput = container.querySelector('#pdf-output');
    const summarizeBtn = container.querySelector('#pdf-summarize');

    let currentDocId = null;

    async function handleFile(file) {
      // Validate
      const maxSize = 10 * 1024 * 1024; // 10MB
      const allowedTypes = ['application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      const ext = file.name.split('.').pop().toLowerCase();

      if (!allowedTypes.includes(file.type) && !['pdf', 'docx', 'txt'].includes(ext)) {
        toast('Only PDF, DOCX, and TXT files are allowed.', 'error');
        return;
      }
      if (file.size > maxSize) {
        toast('File exceeds 10MB limit.', 'error');
        return;
      }

      // Show uploading state
      const item = document.createElement('div');
      item.className = 'pdf-file-item';
      item.innerHTML = '<span class="file-icon">📄</span>' +
        '<div class="file-info">' +
        '<div class="file-name">' + escapeHTML(file.name) + '</div>' +
        '<div class="file-size">Uploading...</div>' +
        '</div>';
      fileList.prepend(item);

      try {
        const result = await OmniAPI.documents.upload(file);
        currentDocId = result.document.id;

        // Update item
        const size = (file.size / 1024).toFixed(1);
        item.innerHTML = '<span class="file-icon">📄</span>' +
          '<div class="file-info">' +
          '<div class="file-name">' + escapeHTML(file.name) + '</div>' +
          '<div class="file-size">' + escapeHTML(size) + ' KB</div>' +
          '</div>' +
          '<button class="btn btn-ghost btn-sm delete-doc" data-id="' + escapeHTML(result.document.id) + '">✕</button>';
        toast('Document uploaded!', 'success');

        item.querySelector('.delete-doc')?.addEventListener('click', async () => {
          try {
            await OmniAPI.documents.delete(result.document.id);
            item.remove();
            toast('Document deleted.', 'info');
          } catch { toast('Delete failed.', 'error'); }
        });
      } catch (err) {
        item.innerHTML = '<span style="color:#FF6B6B">⚠️ ' + escapeHTML(err.message || 'Upload failed') + '</span>';
      }
    }

    uploadZone?.addEventListener('click', () => fileInput?.click());
    uploadZone?.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.style.borderColor = 'var(--primary)'; });
    uploadZone?.addEventListener('dragleave', () => { uploadZone.style.borderColor = ''; });
    uploadZone?.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadZone.style.borderColor = '';
      Array.from(e.dataTransfer.files).forEach(handleFile);
    });

    fileInput?.addEventListener('change', () => {
      Array.from(fileInput.files).forEach(handleFile);
      fileInput.value = '';
    });

    if (pdfAskBtn) {
      pdfAskBtn.addEventListener('click', async () => {
        const query = pdfQuery.value.trim();
        if (!query) { toast('Enter a question.', 'error'); return; }
        if (!currentDocId) { toast('Upload a document first.', 'error'); return; }

        pdfOutput.textContent = 'Analyzing...';
        pdfAskBtn.disabled = true;

        try {
          const result = await OmniAPI.documents.query(currentDocId, query);
          pdfOutput.innerHTML = safeRender(result.answer);
        } catch (err) {
          pdfOutput.innerHTML = '<span style="color:#FF6B6B">⚠️ ' + escapeHTML(err.message) + '</span>';
        } finally {
          pdfAskBtn.disabled = false;
        }
      });
    }

    if (summarizeBtn) {
      summarizeBtn.addEventListener('click', async () => {
        if (!currentDocId) { toast('Upload a document first.', 'error'); return; }
        pdfOutput.textContent = 'Generating summary...';
        summarizeBtn.disabled = true;

        try {
          const result = await OmniAPI.documents.summarize(currentDocId);
          pdfOutput.innerHTML = safeRender(result.summary);
          toast('Summary ready!', 'success');
        } catch (err) {
          pdfOutput.innerHTML = '<span style="color:#FF6B6B">⚠️ ' + escapeHTML(err.message) + '</span>';
        } finally {
          summarizeBtn.disabled = false;
        }
      });
    }

    pdfQuery?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') pdfAskBtn?.click();
    });
  }

  // =============================================
  // 6. PRODUCTIVITY
  // =============================================
  function initProductivity() {
    const container = $('#page-productivity');
    if (!container) return;

    const todoInput = container.querySelector('#todo-input');
    const todoAddBtn = container.querySelector('#todo-add');
    const todoList = container.querySelector('.todo-list');

    let todos = [];

    async function loadTodos() {
      try {
        const result = await OmniAPI.productivity.getTodos();
        todos = result.todos || [];
        renderTodos();
        updateStats();
      } catch {
        // Offline fallback — show empty
        todos = [];
        renderTodos();
      }
    }

    function renderTodos() {
      if (!todoList) return;
      if (todos.length === 0) {
        todoList.textContent = '';
        const empty = document.createElement('div');
        empty.style.cssText = 'text-align:center;color:var(--text-muted);padding:var(--space-lg)';
        empty.textContent = 'No tasks yet. Add one above.';
        todoList.appendChild(empty);
        return;
      }
      // Build DOM safely
      todoList.textContent = '';
      todos.forEach(t => {
        const div = document.createElement('div');
        div.className = 'todo-item';
        div.dataset.id = t.id;

        const checkbox = document.createElement('div');
        checkbox.className = 'todo-checkbox' + (t.done ? ' checked' : '');
        checkbox.textContent = t.done ? '✓' : '';
        checkbox.onclick = () => OmniAI.toggleTodo(t.id);

        const span = document.createElement('span');
        span.className = 'todo-text' + (t.done ? ' completed' : '');
        span.textContent = t.text;

        const del = document.createElement('span');
        del.className = 'todo-delete';
        del.textContent = '🗑️';
        del.onclick = () => OmniAI.deleteTodo(t.id);

        div.appendChild(checkbox);
        div.appendChild(span);
        div.appendChild(del);
        todoList.appendChild(div);
      });
    }

    async function addTodo() {
      const text = todoInput.value.trim();
      if (!text) return;
      todoAddBtn.disabled = true;

      try {
        const result = await OmniAPI.productivity.createTodo(text);
        todos.unshift(result.todo);
        renderTodos();
        updateStats();
        todoInput.value = '';
        toast('Task added!', 'success');
      } catch (err) {
        toast(err.message || 'Failed to add task.', 'error');
      } finally {
        todoAddBtn.disabled = false;
      }
    }

    todoAddBtn?.addEventListener('click', addTodo);
    todoInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') addTodo(); });

    // Tab switching
    container.querySelectorAll('.option-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        container.querySelectorAll('.option-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const section = chip.dataset.section;
        container.querySelectorAll('.productivity-section').forEach(s => s.classList.toggle('hidden', s.id !== `prod-${section}`));
      });
    });

    // Calendar render
    const calendarMonth = document.getElementById('calendar-month');
    const calendarGrid = document.getElementById('calendar-grid');
    if (calendarMonth && calendarGrid) {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      calendarMonth.textContent = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const today = now.getDate();
      let cells = '<span style="color:var(--text-muted)">Sun</span><span style="color:var(--text-muted)">Mon</span><span style="color:var(--text-muted)">Tue</span><span style="color:var(--text-muted)">Wed</span><span style="color:var(--text-muted)">Thu</span><span style="color:var(--text-muted)">Fri</span><span style="color:var(--text-muted)">Sat</span>';
      for (let i = 0; i < firstDay; i++) cells += '<div></div>';
      for (let d = 1; d <= daysInMonth; d++) {
        const isToday = d === today;
        cells += '<div style="padding:8px;border-radius:var(--radius-sm);background:' + (isToday ? 'var(--gradient-primary)' : 'transparent') + ';color:' + (isToday ? 'white' : 'var(--text-secondary)') + ';font-weight:' + (isToday ? '700' : '400') + '">' + d + '</div>';
      }
      calendarGrid.innerHTML = cells;
    }

    loadTodos();
  }

  async function toggleTodo(id) {
    try {
      const todo = document.querySelector('.todo-item[data-id="' + escapeHTML(id) + '"]');
      if (!todo) return;
      const isDone = todo.querySelector('.todo-checkbox')?.classList.contains('checked');
      await OmniAPI.productivity.updateTodo(id, { done: !isDone });
      // Reload to get fresh state
      const container = $('#page-productivity');
      if (container) {
        const result = await OmniAPI.productivity.getTodos();
        const stateTodos = (result.todos || []);
        const todoList = container.querySelector('.todo-list');
        if (todoList) {
          todoList.textContent = '';
          if (stateTodos.length === 0) {
            const empty = document.createElement('div');
            empty.style.cssText = 'text-align:center;color:var(--text-muted);padding:var(--space-lg)';
            empty.textContent = 'No tasks yet.';
            todoList.appendChild(empty);
          } else {
            stateTodos.forEach(t => {
              const div = document.createElement('div');
              div.className = 'todo-item';
              div.dataset.id = t.id;
              const checkbox = document.createElement('div');
              checkbox.className = 'todo-checkbox' + (t.done ? ' checked' : '');
              checkbox.textContent = t.done ? '✓' : '';
              checkbox.onclick = () => OmniAI.toggleTodo(t.id);
              const span = document.createElement('span');
              span.className = 'todo-text' + (t.done ? ' completed' : '');
              span.textContent = t.text;
              const del = document.createElement('span');
              del.className = 'todo-delete';
              del.textContent = '🗑️';
              del.onclick = () => OmniAI.deleteTodo(t.id);
              div.appendChild(checkbox);
              div.appendChild(span);
              div.appendChild(del);
              todoList.appendChild(div);
            });
          }
          updateStatsFromTodos(stateTodos);
        }
      }
    } catch { toast('Failed to update task.', 'error'); }
  }

  async function deleteTodo(id) {
    try {
      await OmniAPI.productivity.deleteTodo(id);
      const el = document.querySelector('.todo-item[data-id="' + escapeHTML(id) + '"]');
      if (el) el.remove();
      toast('Task deleted.', 'info');
    } catch { toast('Failed to delete task.', 'error'); }
  }

  function updateStats() {
    const total = document.querySelectorAll('.todo-item').length;
    const done = document.querySelectorAll('.todo-checkbox.checked').length;
    const todoStat = document.querySelector('.stat-card.tasks .stat-value');
    const doneStat = document.querySelector('.stat-card.completed .stat-value');
    if (todoStat) todoStat.textContent = total;
    if (doneStat) doneStat.textContent = done;
  }

  function updateStatsFromTodos(todos) {
    const total = todos.length;
    const done = todos.filter(t => t.done).length;
    const todoStat = document.querySelector('.stat-card.tasks .stat-value');
    const doneStat = document.querySelector('.stat-card.completed .stat-value');
    if (todoStat) todoStat.textContent = total;
    if (doneStat) doneStat.textContent = done;
  }

  // =============================================
  // 7. LEARNING CENTER
  // =============================================
  function initLearning() {
    const container = $('#page-learning');
    if (!container) return;

    const topicInput = container.querySelector('#learning-topic');
    const askBtn = container.querySelector('#learning-ask');
    const outputEl = container.querySelector('#learning-output');
    const genFlashcardsBtn = container.querySelector('#learning-flashcards');
    const genQuizBtn = container.querySelector('#learning-quiz');

    async function learn(type = 'explain') {
      const topic = topicInput.value.trim();
      if (!topic) { toast('Enter a topic.', 'error'); return; }

      const btn = type === 'explain' ? askBtn : (type === 'flashcards' ? genFlashcardsBtn : genQuizBtn);
      if (btn) btn.disabled = true;

      outputEl.innerHTML = '<span class="skeleton" style="display:inline-block;width:100%;height:60px"></span>';

      try {
        const result = await OmniAPI.ai.learning(topic, type);
        outputEl.innerHTML = safeRender(result.content);
        toast('Content ready!', 'success');
      } catch (err) {
        outputEl.innerHTML = '<span style="color:#FF6B6B">⚠️ ' + escapeHTML(err.message) + '</span>';
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    askBtn?.addEventListener('click', () => learn('explain'));
    genFlashcardsBtn?.addEventListener('click', () => learn('flashcards'));
    genQuizBtn?.addEventListener('click', () => learn('quiz'));
    topicInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') learn('explain'); });
  }

  // =============================================
  // 8. BUSINESS & MARKETING
  // =============================================
  function initBusiness() {
    const container = $('#page-business');
    if (!container) return;

    const promptInput = container.querySelector('#business-prompt');
    const generateBtn = container.querySelector('#business-generate');
    const outputEl = container.querySelector('#business-output');
    const emptyEl = container.querySelector('#business-empty');

    generateBtn.dataset.originalText = '🚀 Generate';

    async function generate() {
      const prompt = promptInput.value.trim();
      if (!prompt) { toast('Describe your business needs.', 'error'); return; }

      const activeType = container.querySelector('.option-chip.active');
      setGenerating(generateBtn, true);
      emptyEl.style.display = 'none';
      outputEl.textContent = '';

      try {
        const result = await OmniAPI.ai.business(
          prompt,
          activeType?.textContent?.toLowerCase().replace(/\s+/g, '-') || 'ideas'
        );
        outputEl.innerHTML = safeRender(result.content);
        toast('Analysis complete!', 'success');
      } catch (err) {
        outputEl.innerHTML = '<span style="color:#FF6B6B">⚠️ ' + escapeHTML(err.message) + '</span>';
      } finally {
        setGenerating(generateBtn, false);
      }
    }

    generateBtn.addEventListener('click', generate);
    promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) generate();
    });
  }

  // =============================================
  // BETA: AI RESPONSE FEEDBACK
  // =============================================
  function addAIFeedbackButtons(container, feature) {
    const feedbackDiv = document.createElement('div');
    feedbackDiv.style.cssText = 'display:flex;gap:8px;margin-top:8px;align-items:center';
    feedbackDiv.innerHTML = '<span style="font-size:0.75rem;color:var(--text-muted)">Was this helpful?</span>' +
      '<button class="btn btn-ghost btn-sm ai-feedback" data-rating="helpful" style="font-size:0.75rem">👍</button>' +
      '<button class="btn btn-ghost btn-sm ai-feedback" data-rating="not_helpful" style="font-size:0.75rem">👎</button>';

    feedbackDiv.querySelectorAll('.ai-feedback').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await OmniAPI.request('POST', '/beta/ai-feedback', { feature, rating: btn.dataset.rating });
          feedbackDiv.innerHTML = '<span style="font-size:0.75rem;color:var(--text-muted)">Thanks for your feedback!</span>';
        } catch { /* silent */ }
      });
    });

    const lastMsg = (container.querySelector('.chat-messages') || container).lastElementChild;
    if (lastMsg && lastMsg.classList.contains('assistant')) {
      lastMsg.appendChild(feedbackDiv);
    }
  }

  // =============================================
  // BETA: ONBOARDING OVERLAY
  // =============================================
  function showOnboarding() {
    const existing = document.querySelector('.onboarding-overlay');
    if (existing) return;

    const overlay = document.createElement('div');
    overlay.className = 'auth-overlay';
    overlay.style.zIndex = '10001';
    overlay.innerHTML = `
      <div class="auth-modal" style="max-width:500px">
        <div class="auth-logo" style="font-size:1.5rem">✦ Welcome to OmniAI</div>
        <p style="color:var(--text-secondary);text-align:center;margin-bottom:var(--space-lg)">
          One AI. Every Day. Everything You Need.
        </p>
        <p style="color:var(--text-muted);font-size:0.875rem;margin-bottom:var(--space-md);text-align:center">
          What would you like to accomplish?
        </p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-sm);margin-bottom:var(--space-lg)">
          <button class="btn btn-ghost onboarding-interest" data-interest="write" style="padding:var(--space-md);text-align:center">✍️ Write & Create</button>
          <button class="btn btn-ghost onboarding-interest" data-interest="learn" style="padding:var(--space-md);text-align:center">📚 Learn</button>
          <button class="btn btn-ghost onboarding-interest" data-interest="image" style="padding:var(--space-md);text-align:center">🎨 Create Images</button>
          <button class="btn btn-ghost onboarding-interest" data-interest="video" style="padding:var(--space-md);text-align:center">🎬 Create Videos</button>
          <button class="btn btn-ghost onboarding-interest" data-interest="organize" style="padding:var(--space-md);text-align:center">📋 Organize Life</button>
          <button class="btn btn-ghost onboarding-interest" data-interest="business" style="padding:var(--space-md);text-align:center">🚀 Build Business</button>
        </div>
        <div style="display:flex;gap:var(--space-sm)">
          <button class="btn btn-ghost" id="onboarding-skip" style="flex:1">Skip</button>
          <button class="btn btn-primary" id="onboarding-done" style="flex:2">Get Started</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const selected = [];
    overlay.querySelectorAll('.onboarding-interest').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('active');
        const idx = selected.indexOf(btn.dataset.interest);
        if (idx > -1) selected.splice(idx, 1);
        else selected.push(btn.dataset.interest);
      });
    });

    overlay.querySelector('#onboarding-skip').addEventListener('click', () => {
      overlay.remove();
      OmniAPI.request('PUT', '/beta/onboarding', { completed: true }).catch(() => {});
    });

    overlay.querySelector('#onboarding-done').addEventListener('click', () => {
      overlay.remove();
      OmniAPI.request('PUT', '/beta/onboarding', { interests: selected, completed: true }).catch(() => {});
      navigateTo('assistant');
      toast('Welcome! Ask me anything.', 'success');
    });
  }

  // =============================================
  // BETA: GLOBAL SEARCH
  // =============================================
  function initSearch() {
    const searchInput = document.getElementById('global-search');
    if (!searchInput) return;

    let debounceTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const q = searchInput.value.trim();
      if (q.length < 2) {
        document.querySelector('.search-results')?.remove();
        return;
      }
      debounceTimer = setTimeout(async () => {
        try {
          const data = await OmniAPI.request('GET', '/beta/search?q=' + encodeURIComponent(q));
          const existing = document.querySelector('.search-results');
          if (existing) existing.remove();

          if (data.data?.results?.length > 0) {
            const div = document.createElement('div');
            div.className = 'search-results';
            div.style.cssText = 'position:absolute;top:100%;left:0;right:0;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-md);max-height:300px;overflow-y:auto;z-index:1000';
            data.data.results.forEach(r => {
              const item = document.createElement('div');
              item.style.cssText = 'padding:8px 12px;cursor:pointer;font-size:0.875rem;display:flex;align-items:center;gap:8px';
              item.onmouseover = () => item.style.background = 'var(--bg-hover)';
              item.onmouseout = () => item.style.background = '';
              item.textContent = r.title;
              div.appendChild(item);
            });
            searchInput.parentElement.appendChild(div);
          }
        } catch { /* silent */ }
      }, 300);
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#global-search, .search-results')) {
        document.querySelector('.search-results')?.remove();
      }
    });
  }

  // =============================================
  // SETTINGS
  // =============================================
  function initSettings() {
    // Upgrade modal
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';
    modalOverlay.style.display = 'none';
    modalOverlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title">🚀 Upgrade to Premium</h3>
          <button class="modal-close" id="modal-close-btn">✕</button>
        </div>
        <div>
          <p style="color:var(--text-secondary);margin-bottom:var(--space-lg)">Unlock unlimited access to all AI features.</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-md);margin-bottom:var(--space-lg)">
            <div class="card" style="border:2px solid var(--border);text-align:center;padding:var(--space-lg)">
              <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:var(--space-sm)">MONTHLY</div>
              <div style="font-size:2rem;font-weight:800;color:var(--text-primary)">$19</div>
              <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:var(--space-md)">per month</div>
              <button class="btn btn-primary w-full btn-subscribe" data-plan="premium_monthly">Subscribe</button>
            </div>
            <div class="card" style="border:2px solid var(--primary);text-align:center;padding:var(--space-lg);position:relative;overflow:hidden">
              <div style="position:absolute;top:8px;right:8px;background:var(--gradient-accent);color:white;padding:2px 8px;border-radius:var(--radius-full);font-size:0.625rem;font-weight:600">BEST VALUE</div>
              <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:var(--space-sm)">ANNUAL</div>
              <div style="font-size:2rem;font-weight:800;color:var(--text-primary)">$149</div>
              <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:var(--space-md)">per year (save 35%)</div>
              <button class="btn" style="background:var(--gradient-accent);color:white;width:100%" data-plan="premium_annual">Subscribe</button>
            </div>
          </div>
          <div id="subscribe-status" style="color:var(--text-muted);font-size:0.8125rem;text-align:center"></div>
        </div>
      </div>
    `;
    document.body.appendChild(modalOverlay);

    document.getElementById('modal-close-btn')?.addEventListener('click', () => { modalOverlay.style.display = 'none'; });
    modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) modalOverlay.style.display = 'none'; });

    modalOverlay.querySelectorAll('[data-plan]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          const result = await OmniAPI.subscription.createCheckout(btn.dataset.plan);
          document.getElementById('subscribe-status').textContent = result.note || 'Subscription system ready. Connect Stripe to enable payments.';
        } catch (err) {
          document.getElementById('subscribe-status').textContent = err.message || 'Subscription setup incomplete.';
        }
      });
    });

    // Wire upgrade buttons
    document.querySelectorAll('.btn-upgrade, [data-action="upgrade"]').forEach(btn => {
      btn.addEventListener('click', () => { modalOverlay.style.display = 'flex'; });
    });

    // Beta: Feedback form in settings
    addFeedbackFormToSettings();

    // Logout button in settings
    const settingsPage = $('#page-settings');
    if (settingsPage) {
      const logoutBtn = settingsPage.querySelector('[data-action="logout"]');
      if (!logoutBtn) {
        const accountCard = settingsPage.querySelector('.card:first-child .flex-col');
        if (accountCard) {
          const btn = document.createElement('button');
          btn.className = 'btn btn-ghost w-full mt-sm';
          btn.dataset.action = 'logout';
          btn.textContent = '🚪 Sign Out';
          btn.addEventListener('click', async () => {
            await OmniAPI.auth.logout();
            state.user = null;
            showAuthUI();
            toast('Signed out.', 'info');
          });
          accountCard.appendChild(btn);
        }
      }
    }
  }

  // =============================================
  // THEME
  // =============================================
  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    const toggles = $$('.theme-toggle');
    toggles.forEach(t => { t.textContent = state.theme === 'dark' ? '☀️' : '🌙'; });
    localStorage.setItem('omniai-theme', state.theme);
  }

  // =============================================
  // BETA: FEEDBACK FORM IN SETTINGS
  // =============================================
  function addFeedbackFormToSettings() {
    const settingsPage = $('#page-settings');
    if (!settingsPage) return;

    const cards = settingsPage.querySelectorAll('.card');
    const lastCard = cards[cards.length - 1];
    if (!lastCard) return;

    const feedbackSection = document.createElement('div');
    feedbackSection.className = 'card';
    feedbackSection.style.marginTop = 'var(--space-md)';
    feedbackSection.innerHTML = '<h4 style="margin-bottom:var(--space-sm)">💬 Send Feedback</h4>' +
      '<select id="feedback-category" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-primary);color:var(--text-primary);margin-bottom:var(--space-sm)">' +
      '<option value="general">General Feedback</option>' +
      '<option value="bug">Report a Bug</option>' +
      '<option value="feature_request">Feature Request</option>' +
      '<option value="ai_quality">AI Quality Issue</option>' +
      '<option value="performance">Performance Issue</option>' +
      '</select>' +
      '<textarea id="feedback-message" placeholder="Describe your feedback..." style="width:100%;min-height:80px;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-primary);color:var(--text-primary);margin-bottom:var(--space-sm);resize:vertical"></textarea>' +
      '<div style="display:flex;gap:var(--space-sm)">' +
      '<button class="btn btn-primary" id="feedback-submit">Send Feedback</button>' +
      '<button class="btn btn-ghost" id="feedback-delete-account" style="color:#FF6B6B">🗑️ Delete Account</button>' +
      '</div>' +
      '<div id="feedback-status" style="margin-top:var(--space-sm);font-size:0.8125rem;color:var(--text-muted)"></div>';

    lastCard.parentElement.appendChild(feedbackSection);

    feedbackSection.querySelector('#feedback-submit').addEventListener('click', async () => {
      const category = feedbackSection.querySelector('#feedback-category').value;
      const message = feedbackSection.querySelector('#feedback-message').value.trim();
      if (!message) { toast('Please write a message.', 'error'); return; }

      try {
        await OmniAPI.request('POST', '/beta/feedback', { category, message });
        feedbackSection.querySelector('#feedback-message').value = '';
        feedbackSection.querySelector('#feedback-status').textContent = '✓ Thank you for your feedback!';
        toast('Feedback sent!', 'success');
      } catch (err) {
        feedbackSection.querySelector('#feedback-status').textContent = '✗ ' + (err.message || 'Failed to send feedback.');
      }
    });

    feedbackSection.querySelector('#feedback-delete-account').addEventListener('click', async () => {
      if (!confirm('Are you sure you want to permanently delete your account? All your data will be lost.')) return;
      const password = prompt('Enter your password to confirm deletion:');
      if (!password) return;

      try {
        await OmniAPI.request('DELETE', '/beta/account', { password });
        OmniAPI.clearTokens();
        state.user = null;
        toast('Account deleted. We\'re sorry to see you go.', 'info');
        showAuthUI();
      } catch (err) {
        toast(err.message || 'Failed to delete account.', 'error');
      }
    });
  }

  // =============================================
  // INIT
  // =============================================
  async function init() {
    // Load theme
    document.documentElement.setAttribute('data-theme', state.theme);
    const toggles = $$('.theme-toggle');
    toggles.forEach(t => { t.textContent = state.theme === 'dark' ? '☀️' : '🌙'; });

    // Navigation
    $$('.nav-item').forEach(item => {
      item.addEventListener('click', () => navigateTo(item.dataset.page));
    });

    // Mobile menu
    $('.mobile-menu-btn')?.addEventListener('click', () => {
      state.sidebarOpen = !state.sidebarOpen;
      $('.sidebar')?.classList.toggle('open', state.sidebarOpen);
    });

    // Theme toggle
    toggles.forEach(t => t.addEventListener('click', toggleTheme));

    // Global option chip handling
    document.addEventListener('click', (e) => {
      const chip = e.target.closest('.option-chip');
      if (chip) {
        const parent = chip.closest('.options-bar, .card');
        if (parent) {
          parent.querySelectorAll('.option-chip').forEach(c => c.classList.remove('active'));
        }
        chip.classList.add('active');
      }
    });

    // Init settings modal
    initSettings();

    // Check authentication
    if (OmniAPI.isAuthenticated()) {
      try {
        await loadUserData();
        navigateTo('assistant');
      } catch {
        OmniAPI.clearTokens();
        showAuthUI();
      }
    } else {
      showAuthUI();
    }

    // Hide loading screen
    setTimeout(() => {
      $('.loading-screen')?.classList.add('hidden');
    }, 800);
  }

  // =============================================
  // PUBLIC API
  // =============================================
  return {
    init,
    navigateTo,
    toggleTodo,
    deleteTodo,
  };
})();

// Boot
document.addEventListener('DOMContentLoaded', () => OmniAI.init());