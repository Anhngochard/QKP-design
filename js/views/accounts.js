import { listProfiles, updateProfile, createAccount } from '../lib/auth.js';
import { getCurrentProfile, roleLabel } from '../lib/session.js';
import { escapeHtml, fmtDateTime, toast } from '../lib/utils.js';
import { DB } from '../lib/db.js';

const ROLES = ['admin', 'seller', 'designer'];

function generatePassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function renderAccounts() {
  const root = document.getElementById('view-root');
  const me = getCurrentProfile();

  if (me?.role !== 'admin') {
    root.innerHTML = `<div class="empty-state"><div class="icon">🚫</div>Chỉ Admin mới xem được trang này.</div>`;
    return;
  }

  let profiles;
  try {
    profiles = await listProfiles();
  } catch (err) {
    root.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>Không tải được danh sách tài khoản: ${escapeHtml(err.message)}</div>`;
    return;
  }

  const [sellers, designers] = await Promise.all([DB.getAll('sellers'), DB.getAll('designers')]);

  function linkCellHtml(p) {
    if (p.role === 'seller') {
      return `
        <select class="field" data-link-select="${p.id}" data-link-kind="seller" style="padding:6px 10px;font-size:12.5px">
          <option value="">— Chưa liên kết —</option>
          ${sellers.map((s) => `<option value="${s.id}" ${s.id === p.seller_id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
        </select>
      `;
    }
    if (p.role === 'designer') {
      return `
        <select class="field" data-link-select="${p.id}" data-link-kind="designer" style="padding:6px 10px;font-size:12.5px">
          <option value="">— Chưa liên kết —</option>
          ${designers.map((d) => `<option value="${d.id}" ${d.id === p.designer_id ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('')}
        </select>
      `;
    }
    return '<span class="muted">—</span>';
  }

  function draw() {
    root.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Manage Accounts</h2>
          <div class="breadcrumb">${profiles.length} tài khoản</div>
        </div>
      </div>

      <div class="card" style="margin-bottom:18px">
        <h3>Tạo tài khoản mới</h3>
        <form id="create-account-form">
          <div class="field-row field-group">
            <div>
              <div class="field-label">Tên</div>
              <input type="text" id="ca-name" placeholder="Nguyễn Văn A" required />
            </div>
            <div>
              <div class="field-label">Email</div>
              <input type="email" id="ca-email" placeholder="nhanvien@example.com" required />
            </div>
          </div>
          <div class="field-row field-group">
            <div>
              <div class="field-label">Mật khẩu tạm</div>
              <div style="display:flex;gap:8px">
                <input type="text" id="ca-password" value="${generatePassword()}" required style="flex:1" />
                <button type="button" class="btn" id="ca-regen" title="Tạo mật khẩu khác">🔄</button>
              </div>
            </div>
            <div>
              <div class="field-label">Vai trò</div>
              <select class="field" id="ca-role">
                ${ROLES.map((r) => `<option value="${r}" ${r === 'seller' ? 'selected' : ''}>${roleLabel(r)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div id="create-account-error" class="auth-error" style="display:none"></div>
          <button type="submit" class="btn btn-primary" id="ca-submit">+ Tạo tài khoản</button>
          <span class="muted" style="font-size:12px;margin-left:8px">Nhớ copy mật khẩu tạm gửi cho nhân viên trước khi tạo — sẽ không hiện lại được.</span>
        </form>
      </div>

      <div class="card">
        <table class="table">
          <thead>
            <tr>
              <th>Tên</th><th>Email</th><th>Vai trò</th><th>Liên kết Seller/Designer</th><th>Trạng thái</th><th>Tạo lúc</th>
            </tr>
          </thead>
          <tbody>
            ${profiles.map((p) => `
              <tr>
                <td>${escapeHtml(p.name || '—')} ${p.id === me.id ? '<span class="muted">(bạn)</span>' : ''}</td>
                <td>${escapeHtml(p.email)}</td>
                <td>
                  <select class="field" data-role-select="${p.id}" style="padding:6px 10px;font-size:12.5px" ${p.id === me.id ? 'disabled title="Không thể tự đổi role của chính mình"' : ''}>
                    ${ROLES.map((r) => `<option value="${r}" ${r === p.role ? 'selected' : ''}>${roleLabel(r)}</option>`).join('')}
                  </select>
                </td>
                <td>${linkCellHtml(p)}</td>
                <td>
                  <label class="toggle-switch" title="${p.is_active ? 'Đang hoạt động' : 'Đã khoá'}">
                    <input type="checkbox" data-active-toggle="${p.id}" ${p.is_active ? 'checked' : ''} ${p.id === me.id ? 'disabled title="Không thể tự khoá chính mình"' : ''} />
                    <span class="toggle-slider"></span>
                  </label>
                </td>
                <td>${fmtDateTime(p.created_at ? new Date(p.created_at).getTime() : null)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('ca-regen').addEventListener('click', () => {
      document.getElementById('ca-password').value = generatePassword();
    });

    document.getElementById('create-account-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById('create-account-error');
      const submitBtn = document.getElementById('ca-submit');
      errorEl.style.display = 'none';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Đang tạo...';
      try {
        const name = document.getElementById('ca-name').value.trim();
        const email = document.getElementById('ca-email').value.trim();
        const password = document.getElementById('ca-password').value;
        const role = document.getElementById('ca-role').value;
        await createAccount({ name, email, password, role });
        toast(`🎉 Đã tạo tài khoản "${email}" — nhớ gửi mật khẩu tạm cho họ.`);
        profiles = await listProfiles();
        draw();
      } catch (err) {
        errorEl.textContent = err.message || 'Tạo tài khoản thất bại.';
        errorEl.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = '+ Tạo tài khoản';
      }
    });

    root.querySelectorAll('[data-role-select]').forEach((sel) => {
      sel.addEventListener('change', async () => {
        const id = sel.dataset.roleSelect;
        try {
          await updateProfile(id, { role: sel.value });
          const p = profiles.find((x) => x.id === id);
          p.role = sel.value;
          toast(`Đã đổi vai trò của "${p.name || p.email}" thành ${roleLabel(sel.value)}.`);
          draw();
        } catch (err) {
          toast(`Lỗi: ${err.message}`);
          draw();
        }
      });
    });

    root.querySelectorAll('[data-link-select]').forEach((sel) => {
      sel.addEventListener('change', async () => {
        const id = sel.dataset.linkSelect;
        const kind = sel.dataset.linkKind;
        const field = kind === 'seller' ? 'seller_id' : 'designer_id';
        try {
          await updateProfile(id, { [field]: sel.value || null });
          const p = profiles.find((x) => x.id === id);
          p[field] = sel.value || null;
          toast('Đã cập nhật liên kết.');
        } catch (err) {
          toast(`Lỗi: ${err.message}`);
          draw();
        }
      });
    });

    root.querySelectorAll('[data-active-toggle]').forEach((cb) => {
      cb.addEventListener('change', async () => {
        const id = cb.dataset.activeToggle;
        try {
          await updateProfile(id, { is_active: cb.checked });
          const p = profiles.find((x) => x.id === id);
          p.is_active = cb.checked;
          toast(cb.checked
            ? `Đã kích hoạt lại "${p.name || p.email}".`
            : `Đã khoá "${p.name || p.email}" — họ sẽ không thể truy cập dữ liệu nữa.`);
        } catch (err) {
          toast(`Lỗi: ${err.message}`);
          cb.checked = !cb.checked;
        }
      });
    });
  }

  draw();
}
