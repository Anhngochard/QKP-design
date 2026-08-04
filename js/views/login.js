import { signIn } from '../lib/auth.js';
import { isSupabaseConfigured } from '../lib/supabase.js';

export function renderLogin({ onSuccess, lockedMessage } = {}) {
  const root = document.getElementById('auth-screen');
  document.getElementById('app-shell').style.display = 'none';
  root.style.display = 'flex';

  if (!isSupabaseConfigured) {
    root.innerHTML = `
      <div class="auth-card">
        <h1>⚠️ Chưa cấu hình tài khoản</h1>
        <p class="muted">
          App cần kết nối Supabase để đăng nhập. Vui lòng làm theo hướng dẫn trong
          <code>SETUP_ACCOUNTS.md</code>, sau đó điền Project URL &amp; anon key vào
          <code>js/lib/supabaseConfig.js</code>.
        </p>
      </div>
    `;
    return;
  }

  root.innerHTML = `
    <div class="auth-card">
      <h1>🎨 POD Design Manager</h1>
      <p class="muted">Đăng nhập để tiếp tục</p>
      ${lockedMessage ? `<div class="auth-error">${lockedMessage}</div>` : ''}
      <div id="login-error" class="auth-error" style="display:none"></div>
      <form id="login-form">
        <div class="field-group">
          <div class="field-label">Email</div>
          <input type="email" id="login-email" required autocomplete="username" placeholder="you@example.com" />
        </div>
        <div class="field-group">
          <div class="field-label">Mật khẩu</div>
          <input type="password" id="login-password" required autocomplete="current-password" placeholder="••••••••" />
        </div>
        <button type="submit" class="btn btn-primary btn-block" id="login-submit">Đăng nhập</button>
      </form>
      <p class="muted" style="font-size:12px;margin-top:16px">
        Chưa có tài khoản? Liên hệ Admin để được tạo — app không cho tự đăng ký.
      </p>
    </div>
  `;

  const form = document.getElementById('login-form');
  const errorEl = document.getElementById('login-error');
  const submitBtn = document.getElementById('login-submit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Đang đăng nhập...';
    try {
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      await signIn(email, password);
      await onSuccess?.();
    } catch (err) {
      errorEl.textContent = err.message === 'Invalid login credentials'
        ? 'Sai email hoặc mật khẩu.'
        : (err.message || 'Đăng nhập thất bại.');
      errorEl.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Đăng nhập';
    }
  });
}
