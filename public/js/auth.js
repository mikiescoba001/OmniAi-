/* =============================================
   OmniAI Auth UI
   Login, Register, Password Reset screens
   ============================================= */

const OmniAuth = (() => {
  'use strict';

  let onAuthCallback = null;

  function show(mode = 'login') {
    // Remove existing overlay
    const existing = document.querySelector('.auth-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'auth-overlay';
    overlay.id = 'auth-overlay';
    overlay.innerHTML = `
      <div class="auth-modal">
        <div class="auth-header">
          <div class="auth-logo">✦ OmniAI</div>
          <p class="auth-subtitle" id="auth-subtitle">${mode === 'login' ? 'Welcome back' : mode === 'register' ? 'Create your account' : 'Reset your password'}</p>
        </div>

        <!-- Login Form -->
        <form id="auth-form-login" class="auth-form ${mode === 'login' ? '' : 'hidden'}">
          <div class="input-group">
            <label class="input-label">Email</label>
            <input type="email" class="input-field" id="login-email" placeholder="you@example.com" required autocomplete="email">
          </div>
          <div class="input-group">
            <label class="input-label">Password</label>
            <input type="password" class="input-field" id="login-password" placeholder="••••••••" required autocomplete="current-password" minlength="8">
          </div>
          <div class="auth-error" id="login-error"></div>
          <button type="submit" class="btn btn-primary btn-lg w-full" id="login-btn">Sign In</button>
          <div class="auth-divider"><span>or</span></div>
          <button type="button" class="btn btn-secondary w-full" id="google-login-btn">
            <span style="font-size:1.125rem">G</span> Continue with Google
          </button>
          <div class="auth-links">
            <a href="#" class="auth-link" data-mode="register">Create account</a>
            <a href="#" class="auth-link" data-mode="reset">Forgot password?</a>
          </div>
        </form>

        <!-- Register Form -->
        <form id="auth-form-register" class="auth-form ${mode === 'register' ? '' : 'hidden'}">
          <div class="input-group">
            <label class="input-label">Full Name</label>
            <input type="text" class="input-field" id="register-name" placeholder="Alex Johnson" required>
          </div>
          <div class="input-group">
            <label class="input-label">Email</label>
            <input type="email" class="input-field" id="register-email" placeholder="you@example.com" required autocomplete="email">
          </div>
          <div class="input-group">
            <label class="input-label">Password</label>
            <input type="password" class="input-field" id="register-password" placeholder="At least 8 characters" required autocomplete="new-password" minlength="8">
          </div>
          <div class="auth-error" id="register-error"></div>
          <button type="submit" class="btn btn-primary btn-lg w-full" id="register-btn">Create Account</button>
          <div class="auth-links">
            <span style="color:var(--text-muted);font-size:0.8125rem">Already have an account?</span>
            <a href="#" class="auth-link" data-mode="login">Sign in</a>
          </div>
        </form>

        <!-- Reset Form -->
        <form id="auth-form-reset" class="auth-form ${mode === 'reset' ? '' : 'hidden'}">
          <div class="input-group">
            <label class="input-label">Email</label>
            <input type="email" class="input-field" id="reset-email" placeholder="you@example.com" required>
          </div>
          <div class="auth-error" id="reset-error"></div>
          <button type="submit" class="btn btn-primary btn-lg w-full" id="reset-btn">Send Reset Link</button>
          <div class="auth-links">
            <a href="#" class="auth-link" data-mode="login">Back to sign in</a>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);

    // Form switching
    overlay.querySelectorAll('.auth-link[data-mode]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        show(link.dataset.mode);
      });
    });

    // Login
    overlay.querySelector('#auth-form-login').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      const errorEl = document.getElementById('login-error');
      const btn = document.getElementById('login-btn');

      errorEl.textContent = '';
      btn.disabled = true;
      btn.textContent = '⏳ Signing in...';

      try {
        const data = await OmniAPI.Auth.login(email, password);
        overlay.remove();
        if (onAuthCallback) onAuthCallback(data.user);
        window.location.reload();
      } catch (err) {
        errorEl.textContent = err.message;
        btn.disabled = false;
        btn.textContent = 'Sign In';
      }
    });

    // Register
    overlay.querySelector('#auth-form-register').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('register-name').value;
      const email = document.getElementById('register-email').value;
      const password = document.getElementById('register-password').value;

      const btn = document.getElementById('register-btn');
      const errorEl = document.getElementById('register-error');
      errorEl.textContent = '';
      btn.disabled = true;
      btn.textContent = '⏳ Creating account...';

      try {
        const data = await OmniAPI.Auth.register(email, password, name);
        overlay.remove();
        if (onAuthCallback) onAuthCallback(data.user);
        window.location.reload();
      } catch (err) {
        errorEl.textContent = err.message;
        btn.disabled = false;
        btn.textContent = 'Create Account';
      }
    });

    // Reset
    overlay.querySelector('#auth-form-reset').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('reset-email').value;
      const btn = document.getElementById('reset-btn');
      const errorEl = document.getElementById('reset-error');
      errorEl.textContent = '';
      btn.disabled = true;
      btn.textContent = '⏳ Sending...';

      try {
        await OmniAPI.Auth.resetPassword(email);
        errorEl.style.color = 'var(--secondary)';
        errorEl.textContent = 'Check your email for the reset link';
        btn.disabled = false;
        btn.textContent = 'Send Reset Link';
      } catch (err) {
        errorEl.textContent = err.message;
        btn.disabled = false;
        btn.textContent = 'Send Reset Link';
      }
    });

    // Close on backdrop click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  function onAuth(callback) {
    onAuthCallback = callback;
  }

  function logout() {
    OmniAPI.Auth.logout();
    window.location.reload();
  }

  return { show, onAuth, logout };
})();

window.OmniAuth = OmniAuth;