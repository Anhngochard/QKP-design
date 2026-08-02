import { DB, uid } from '../lib/db.js';
import { escapeHtml, initials, toast } from '../lib/utils.js';
import { openModal, closeModal } from '../lib/modal.js';
import { navigate } from '../lib/router.js';

// Shared renderer for both Sellers and Designers management pages.
export async function renderPeople(kind) {
  // kind: 'sellers' | 'designers'
  const store = kind;
  const label = kind === 'sellers' ? 'Seller' : 'Designer';
  const root = document.getElementById('view-root');
  const [people, designs] = await Promise.all([DB.getAll(store), DB.getAll('designs')]);

  const designCount = (id) => designs.filter((d) => (kind === 'sellers' ? d.sellerId : d.designerId) === id).length;

  root.innerHTML = `
    <div class="page-header">
      <div>
        <h2>${label}s</h2>
        <div class="breadcrumb">${people.length} ${label.toLowerCase()}(s)</div>
      </div>
      <div class="header-actions">
        <button class="btn btn-primary" id="add-person">+ Add ${label}</button>
      </div>
    </div>

    <div class="card">
      ${people.length === 0 ? `<div class="empty-state"><div class="icon">👤</div>Chưa có ${label.toLowerCase()} nào.</div>` : `
      <div class="people-grid">
        ${people.map((p) => `
          <div class="person-card">
            <div class="avatar">${initials(p.name)}</div>
            <div class="info">
              <div class="name">${escapeHtml(p.name)}</div>
              <div class="role">${designCount(p.id)} design(s)</div>
              <div class="contact">${escapeHtml(p.email || '')}${p.phone ? ' · ' + escapeHtml(p.phone) : ''}</div>
              <div class="actions">
                <button class="btn" data-view="${p.id}">View Designs</button>
                <button class="btn" data-edit="${p.id}">Edit</button>
                <button class="btn btn-danger" data-delete="${p.id}">Delete</button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
      `}
    </div>
  `;

  document.getElementById('add-person').addEventListener('click', () => openPersonModal(kind, label));
  root.querySelectorAll('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => navigate(`/designs?${kind === 'sellers' ? 'seller' : 'designer'}=${btn.dataset.view}`));
  });
  root.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openPersonModal(kind, label, people.find((p) => p.id === btn.dataset.edit)));
  });
  root.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const p = people.find((x) => x.id === btn.dataset.delete);
      if (designCount(p.id) > 0) {
        toast(`Không thể xoá — ${p.name} vẫn còn ${designCount(p.id)} design liên quan.`);
        return;
      }
      if (!confirm(`Xoá ${label.toLowerCase()} "${p.name}"?`)) return;
      await DB.delete(store, p.id);
      toast(`Đã xoá ${label.toLowerCase()}.`);
      renderPeople(kind);
    });
  });
}

function openPersonModal(kind, label, existing) {
  const store = kind;
  openModal(`
    <span class="modal-close" id="m-close">✕</span>
    <h2>${existing ? `Edit ${label}` : `Add ${label}`}</h2>
    <div class="field-group">
      <div class="field-label">Name</div>
      <input type="text" id="p-name" value="${existing ? escapeHtml(existing.name) : ''}" placeholder="Full name" />
    </div>
    <div class="field-group">
      <div class="field-label">Email</div>
      <input type="email" id="p-email" value="${existing ? escapeHtml(existing.email || '') : ''}" placeholder="name@example.com" />
    </div>
    ${kind === 'sellers' ? `
    <div class="field-group">
      <div class="field-label">Phone</div>
      <input type="text" id="p-phone" value="${existing ? escapeHtml(existing.phone || '') : ''}" placeholder="090-xxx-xxxx" />
    </div>` : ''}
    <div class="modal-actions">
      <button class="btn" id="p-cancel">Cancel</button>
      <button class="btn btn-primary" id="p-save">${existing ? 'Save Changes' : `Add ${label}`}</button>
    </div>
  `, {
    onMount: () => {
      document.getElementById('m-close').addEventListener('click', closeModal);
      document.getElementById('p-cancel').addEventListener('click', closeModal);
      document.getElementById('p-save').addEventListener('click', async () => {
        const name = document.getElementById('p-name').value.trim();
        if (!name) { toast('Vui lòng nhập tên.'); return; }
        const record = {
          id: existing?.id || uid(kind === 'sellers' ? 'seller' : 'designer'),
          name,
          email: document.getElementById('p-email').value.trim(),
        };
        if (kind === 'sellers') record.phone = document.getElementById('p-phone').value.trim();
        await DB.put(store, record);
        closeModal();
        toast(existing ? 'Đã cập nhật.' : `Đã thêm ${label.toLowerCase()} mới.`);
        renderPeople(kind);
      });
    },
  });
}
