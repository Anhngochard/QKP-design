import { signIn, setupPassword } from '../lib/auth.js';
import { isApiConfigured } from '../lib/apiConfig.js';
import { escapeHtml } from '../lib/utils.js';

export function renderLogin({ onSuccess, lockedMessage } = {}) {
  const root = document.getElementById('auth-screen');
  document.getElementById('app-shell').style.display = 'none';
  root.style.display = 'flex';

  if (!isApiConfigured) {
    root.innerHTML = `
      <div class="auth-card">
        <h1>⚠️ Chưa cấu hình máy chủ</h1>
        <p class="muted">
          App chưa biết địa chỉ API. Làm theo hướng dẫn trong <code>worker/README.md</code>,
          sau đó điền địa chỉ Worker vào <code>js/lib/apiConfig.js</code>.
        </p>
      </div>
    `;
    return;
  }

  root.innerHTML = `
    <div class="auth-card">
      <img src="assets/logo-icon.png" alt="QKP" class="auth-logo" />
      <h1>QKP DESIGN</h1>
      <p class="muted">Đăng nhập để tiếp tục</p>
      ${lockedMessage ? `<div class="auth-error">${escapeHtml(lockedMessage)}</div>` : ''}
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
      <p style="font-size:12px;margin-top:8px">
        <button type="button" class="logout-link" id="setup-toggle">Đặt mật khẩu bằng mã thiết lập</button>
      </p>
      <form id="setup-form" style="display:none;margin-top:12px">
        <p class="muted" style="font-size:12px">
          Dành cho người quản trị máy chủ: nhập mã thiết lập (SETUP_TOKEN của Worker) để đặt mật khẩu mới cho một tài khoản.
        </p>
        <div id="setup-message" class="auth-error" style="display:none"></div>
        <div class="field-group">
          <div class="field-label">Email tài khoản</div>
          <input type="email" id="setup-email" required autocomplete="username" />
        </div>
        <div class="field-group">
          <div class="field-label">Mã thiết lập</div>
          <input type="password" id="setup-token" required autocomplete="off" />
        </div>
        <div class="field-group">
          <div class="field-label">Mật khẩu mới (tối thiểu 6 ký tự)</div>
          <input type="password" id="setup-password" required minlength="6" autocomplete="new-password" />
        </div>
        <button type="submit" class="btn btn-block" id="setup-submit">Đặt mật khẩu</button>
      </form>
    </div>
  `;

  const setupForm = document.getElementById('setup-form');
  document.getElementById('setup-toggle').addEventListener('click', () => {
    setupForm.style.display = setupForm.style.display === 'none' ? 'block' : 'none';
  });
  setupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = document.getElementById('setup-message');
    const button = document.getElementById('setup-submit');
    button.disabled = true;
    try {
      const email = document.getElementById('setup-email').value.trim();
      await setupPassword({
        email,
        setupToken: document.getElementById('setup-token').value,
        password: document.getElementById('setup-password').value,
      });
      setupForm.reset();
      setupForm.style.display = 'none';
      document.getElementById('login-email').value = email;
      message.style.display = 'none';
      const errorBox = document.getElementById('login-error');
      errorBox.textContent = 'Đã đặt mật khẩu. Hãy đăng nhập bằng mật khẩu mới.';
      errorBox.style.display = 'block';
      document.getElementById('login-password').focus();
    } catch (err) {
      message.textContent = err.message || 'Không đặt được mật khẩu.';
      message.style.display = 'block';
    } finally {
      button.disabled = false;
    }
  });

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
      errorEl.textContent = err.message || 'Đăng nhập thất bại.';
      errorEl.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Đăng nhập';
    }
  });
}
