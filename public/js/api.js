/* =============================================
   OmniAI API Client
   Secure, typed API calls to the backend
   ============================================= */

const OmniAPI = (() => {
  'use strict';

  const BASE_URL = window.OMNIAI_API_URL || 'http://localhost:3001/api';

  function getToken() {
    return localStorage.getItem('omniai_token');
  }

  function setToken(token) {
    if (token) {
      localStorage.setItem('omniai_token', token);
    } else {
      localStorage.removeItem('omniai_token');
    }
  }

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem('omniai_user'));
    } catch {
      return null;
    }
  }

  function setUser(user) {
    if (user) {
      localStorage.setItem('omniai_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('omniai_user');
    }
  }

  async function request(method, path, body = null, opts = {}) {
    const url = `${BASE_URL}${path}`;
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const config = {
      method,
      headers,
      signal: opts.signal || null,
    };

    if (body) config.body = JSON.stringify(body);

    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.error || `Request failed (${response.status})`);
      error.status = response.status;
      error.data = data;

      // Auto-redirect on auth failure
      if (response.status === 401 && !path.startsWith('/auth/')) {
        setToken(null);
        setUser(null);
        if (window.OmniUI) window.OmniUI.showAuth();
      }

      throw error;
    }

    return data;
  }

  // ── Auth ──
  const AuthAPI = {
    async register(email, password, name) {
      const data = await request('POST', '/auth/register', { email, password, name });
      setToken(data.token);
      setUser(data.user);
      return data;
    },

    async login(email, password) {
      const data = await request('POST', '/auth/login', { email, password });
      setToken(data.token);
      setUser(data.user);
      return data;
    },

    async googleSignIn(idToken) {
      const data = await request('POST', '/auth/google', { idToken });
      setToken(data.token);
      setUser(data.user);
      return data;
    },

    async resetPassword(email) {
      return request('POST', '/auth/reset-password', { email });
    },

    async getProfile() {
      return request('GET', '/auth/profile');
    },

    async updateProfile(updates) {
      return request('PUT', '/auth/profile', updates);
    },

    logout() {
      setToken(null);
      setUser(null);
    },

    isAuthenticated() {
      return !!getToken();
    },

    getUser,
    getToken,
  };

  // ── AI ──
  const AIAPI = {
    async chat(message, signal) {
      return request('POST', '/ai/chat', { message }, { signal });
    },

    async write(prompt, type = 'writing', tone, length) {
      return request('POST', '/ai/write', { prompt, type, tone, length });
    },

    async transform(text, action, targetLang) {
      return request('POST', '/ai/transform', { text, action, targetLang });
    },

    async brainstorm(topic) {
      return request('POST', '/ai/brainstorm', { topic });
    },

    async summarize(text) {
      return request('POST', '/ai/summarize', { text });
    },

    async generateImage(prompt) {
      return request('POST', '/ai/generate-image', { prompt });
    },

    async getChatHistory() {
      return request('GET', '/ai/chat-history');
    },

    async getImageHistory() {
      return request('GET', '/ai/image-history');
    },

    async getUsage() {
      return request('GET', '/ai/usage');
    },
  };

  // ── Files ──
  const FileAPI = {
    async upload(file) {
      const token = getToken();
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${BASE_URL}/files/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Upload failed');
      return data;
    },

    async getDocuments() {
      return request('GET', '/files/documents');
    },

    async askDocument(documentId, question) {
      return request('POST', '/files/ask-document', { documentId, question });
    },

    async summarizeDocument(documentId) {
      return request('POST', '/files/summarize-document', { documentId });
    },
  };

  // ── Productivity ──
  const ProductivityAPI = {
    async getTodos() { return request('GET', '/todos'); },
    async createTodo(text) { return request('POST', '/todos', { text }); },
    async updateTodo(id, updates) { return request('PUT', `/todos/${id}`, updates); },
    async deleteTodo(id) { return request('DELETE', `/todos/${id}`); },

    async getNotes() { return request('GET', '/notes'); },
    async saveNote(note) { return request('POST', '/notes', note); },

    async getHabits() { return request('GET', '/habits'); },
    async createHabit(name, icon) { return request('POST', '/habits', { name, icon }); },
    async logHabit(id) { return request('PUT', `/habits/${id}/log`); },

    async getGoals() { return request('GET', '/goals'); },
    async createGoal(title, targetDate) { return request('POST', '/goals', { title, targetDate }); },
    async updateGoalProgress(id, progress) { return request('PUT', `/goals/${id}/progress`, { progress }); },

    async getDashboard() { return request('GET', '/dashboard'); },
  };

  // ── Learning ──
  const LearningAPI = {
    async explain(topic, level) { return request('POST', '/learning/explain', { topic, level }); },
    async generateFlashcards(topic, count) { return request('POST', '/learning/flashcards', { topic, count }); },
    async generateQuiz(topic, count) { return request('POST', '/learning/quiz', { topic, count }); },
    async studyPlan(topic, duration, hoursPerDay) {
      return request('POST', '/learning/study-plan', { topic, duration, hoursPerDay });
    },
    async roadmap(topic, level) { return request('POST', '/learning/roadmap', { topic, level }); },
    async getFlashcards() { return request('GET', '/learning/flashcards'); },
  };

  // ── Business ──
  const BusinessAPI = {
    async ideas(industry, keywords) { return request('POST', '/business/ideas', { industry, keywords }); },
    async marketingPlan(business, budget, timeline) {
      return request('POST', '/business/marketing-plan', { business, budget, timeline });
    },
    async brandNames(industry, vibe) { return request('POST', '/business/brand-names', { industry, vibe }); },
    async seo(topic, keywords) { return request('POST', '/business/seo', { topic, keywords }); },
    async contentCalendar(business, duration, channels) {
      return request('POST', '/business/content-calendar', { business, duration, channels });
    },
    async generateLogo(brand, style) { return request('POST', '/business/generate-logo', { brand, style }); },
  };

  // ── Admin ──
  const AdminAPI = {
    async getDashboard() { return request('GET', '/admin/dashboard'); },
    async getUsers() { return request('GET', '/admin/users'); },
    async getRevenue() { return request('GET', '/admin/revenue'); },
    async getAIUsage() { return request('GET', '/admin/ai-usage'); },
    async getErrors() { return request('GET', '/admin/errors'); },
    async updateUserPlan(userId, plan) { return request('PUT', `/admin/users/${userId}/plan`, { plan }); },
  };

  // ── Health ──
  async function healthCheck() {
    return request('GET', '/health');
  }

  // Public API
  return {
    Auth: AuthAPI,
    AI: AIAPI,
    Files: FileAPI,
    Productivity: ProductivityAPI,
    Learning: LearningAPI,
    Business: BusinessAPI,
    Admin: AdminAPI,
    healthCheck,
    setToken,
    setUser,
    getUser,
  };
})();

// Shortcut for debug
window.OmniAPI = OmniAPI;