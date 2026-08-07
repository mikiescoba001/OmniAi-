/* ============================================
   OmniAI — Frontend API Client
   All API calls go through here.
   Never exposes API keys to the browser.
   ============================================ */
'use strict';

const OmniAPI = (() => {
  const BASE_URL = window.OMNIAI_API_URL || 'http://localhost:3001/api';

  // Token management
  let accessToken = localStorage.getItem('omniai_token');
  let refreshToken = localStorage.getItem('omniai_refresh');

  function setTokens(access, refresh) {
    accessToken = access;
    refreshToken = refresh || null;
    if (access) localStorage.setItem('omniai_token', access);
    else localStorage.removeItem('omniai_token');
    if (refresh) localStorage.setItem('omniai_refresh', refresh);
    else localStorage.removeItem('omniai_refresh');
  }

  function clearTokens() {
    setTokens(null, null);
  }

  function isAuthenticated() {
    return !!accessToken;
  }

  // Core request function
  async function request(method, path, body = null, opts = {}) {
    const url = `${BASE_URL}${path}`;
    const headers = {
      'Content-Type': 'application/json',
    };

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const config = {
      method,
      headers,
    };

    if (body && method !== 'GET') {
      config.body = JSON.stringify(body);
    }

    // Merge extra options (e.g., signal for abort)
    if (opts.signal) config.signal = opts.signal;

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        const err = new Error(data.error?.message || `Request failed (${response.status})`);
        err.code = data.error?.code || 'UNKNOWN';
        err.status = response.status;
        err.data = data;

        // Handle token expiration — try refresh
        if (response.status === 401 && refreshToken && !opts._retry) {
          const refreshed = await refreshAccessToken();
          if (refreshed) {
            opts._retry = true;
            return request(method, path, body, opts);
          }
          // Refresh failed — force logout
          clearTokens();
          window.dispatchEvent(new CustomEvent('omniai:logout'));
        }

        throw err;
      }

      return data;
    } catch (err) {
      if (err.name === 'AbortError') {
        const abortErr = new Error('Request cancelled');
        abortErr.code = 'CANCELLED';
        throw abortErr;
      }
      if (err.code) throw err; // Already formatted
      throw new Error('Network error. Please check your connection.');
    }
  }

  // File upload (multipart)
  async function uploadFile(path, file, onProgress) {
    const url = `${BASE_URL}${path}`;
    const formData = new FormData();
    formData.append('file', file);

    const headers = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);

      Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));

      xhr.upload.onprogress = (e) => {
        if (onProgress && e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(data);
          } else {
            reject(new Error(data.error?.message || 'Upload failed'));
          }
        } catch {
          reject(new Error('Invalid server response'));
        }
      };

      xhr.onerror = () => reject(new Error('Upload failed'));
      xhr.send(formData);
    });
  }

  // Token refresh
  async function refreshAccessToken() {
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      const data = await res.json();
      if (data.success && data.data?.accessToken) {
        setTokens(data.data.accessToken, data.data.refreshToken);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // ============================================
  // AUTH ENDPOINTS
  // ============================================
  const auth = {
    async register(email, password, name) {
      const data = await request('POST', '/auth/register', { email, password, name });
      if (data.data?.accessToken) {
        setTokens(data.data.accessToken, data.data.refreshToken);
      }
      return data.data;
    },
    async login(email, password) {
      const data = await request('POST', '/auth/login', { email, password });
      if (data.data?.accessToken) {
        setTokens(data.data.accessToken, data.data.refreshToken);
      }
      return data.data;
    },
    async logout() {
      try { await request('POST', '/auth/logout'); } catch { /* ignore */ }
      clearTokens();
    },
    async me() {
      return (await request('GET', '/auth/me')).data;
    },
    async updateProfile(updates) {
      return (await request('PUT', '/auth/profile', updates)).data;
    },
  };

  // ============================================
  // AI ENDPOINTS
  // ============================================
  const ai = {
    async chat(message, conversationId) {
      return (await request('POST', '/ai/chat', { message, conversationId })).data;
    },
    async writing(prompt, type, tone, length) {
      return (await request('POST', '/ai/writing', { prompt, type, tone, length })).data;
    },
    async image(prompt, style) {
      return (await request('POST', '/ai/image', { prompt, style })).data;
    },
    async video(prompt, type) {
      return (await request('POST', '/ai/video', { prompt, type })).data;
    },
    async learning(topic, type) {
      return (await request('POST', '/ai/learning', { topic, type })).data;
    },
    async business(prompt, type) {
      return (await request('POST', '/ai/business', { prompt, type })).data;
    },
    async getConversations(page = 1) {
      return (await request('GET', `/ai/conversations?page=${page}`)).data;
    },
    async getConversation(id) {
      return (await request('GET', `/ai/conversations/${id}`)).data;
    },
    async getUsage() {
      return (await request('GET', '/ai/usage')).data;
    },
  };

  // ============================================
  // DOCUMENT ENDPOINTS
  // ============================================
  const documents = {
    async upload(file, onProgress) {
      return (await uploadFile('/documents/upload', file, onProgress)).data;
    },
    async list(page = 1) {
      return (await request('GET', `/documents?page=${page}`)).data;
    },
    async get(id) {
      return (await request('GET', `/documents/${id}`)).data;
    },
    async summarize(id) {
      return (await request('POST', `/documents/${id}/summarize`)).data;
    },
    async query(id, query) {
      return (await request('POST', `/documents/${id}/query`, { query })).data;
    },
    async delete(id) {
      return (await request('DELETE', `/documents/${id}`)).data;
    },
  };

  // ============================================
  // PRODUCTIVITY ENDPOINTS
  // ============================================
  const productivity = {
    // Todos
    async getTodos() { return (await request('GET', '/productivity/todos')).data; },
    async createTodo(text) { return (await request('POST', '/productivity/todos', { text })).data; },
    async updateTodo(id, updates) { return (await request('PUT', `/productivity/todos/${id}`, updates)).data; },
    async deleteTodo(id) { return (await request('DELETE', `/productivity/todos/${id}`)).data; },

    // Notes
    async getNotes() { return (await request('GET', '/productivity/notes')).data; },
    async createNote(title, content) { return (await request('POST', '/productivity/notes', { title, content })).data; },
    async updateNote(id, updates) { return (await request('PUT', `/productivity/notes/${id}`, updates)).data; },
    async deleteNote(id) { return (await request('DELETE', `/productivity/notes/${id}`)).data; },

    // Habits
    async getHabits() { return (await request('GET', '/productivity/habits')).data; },
    async createHabit(name, emoji) { return (await request('POST', '/productivity/habits', { name, emoji })).data; },
    async logHabit(id) { return (await request('POST', `/productivity/habits/${id}/log`)).data; },
    async deleteHabit(id) { return (await request('DELETE', `/productivity/habits/${id}`)).data; },

    // Goals
    async getGoals() { return (await request('GET', '/productivity/goals')).data; },
    async createGoal(title, description, targetDate) { return (await request('POST', '/productivity/goals', { title, description, target_date: targetDate })).data; },
    async updateGoalProgress(id, progress) { return (await request('PUT', `/productivity/goals/${id}/progress`, { progress })).data; },
    async deleteGoal(id) { return (await request('DELETE', `/productivity/goals/${id}`)).data; },

    // Learning
    async getLearning() { return (await request('GET', '/productivity/learning')).data; },
    async createLearningTopic(topic) { return (await request('POST', '/productivity/learning', { topic })).data; },

    // Business
    async getBusinessProjects() { return (await request('GET', '/productivity/business')).data; },
    async createBusinessProject(title, type, content) {
      return (await request('POST', '/productivity/business', { title, type, content })).data;
    },
  };

  // ============================================
  // SUBSCRIPTION ENDPOINTS
  // ============================================
  const subscription = {
    async get() { return (await request('GET', '/subscription')).data; },
    async createCheckout(planId) { return (await request('POST', '/subscription/create-checkout', { planId })).data; },
    async cancel() { return (await request('POST', '/subscription/cancel')).data; },
    async restore() { return (await request('POST', '/subscription/restore')).data; },
  };

  return {
    setTokens,
    clearTokens,
    isAuthenticated,
    request,
    auth,
    ai,
    documents,
    productivity,
    subscription,
    BASE_URL,
  };
})();