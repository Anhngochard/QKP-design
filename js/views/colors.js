import { DB, uid } from '../lib/db.js';
import { escapeHtml, toast } from '../lib/utils.js';
import { openModal, closeModal } from '../lib/modal.js';

export async function renderColors() {
  const root = document.getElementById('view-root');
  const colors = await DB.getAll('colors');

  root.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Color Library</h2>
        <div class="breadcrumb">Bảng màu chuẩn để designer làm màu chính xác</div>
      </div>
      <div class="header-actions">
        <button class="btn btn-primary" id="add-color">+ Add Color</button>
      </div>
    </div>

    <div class="card">
      ${colors.length === 0 ? '<div class="empty-state"><div class="icon">🎨</div>Chưa có màu nào. Bấm "Add Color" để thêm.</div>' : `
      <div class="color-lib-grid">
        ${colors.map((c) => `
          <div class="color-lib-card">
            <div class="swatch-big" style="background:${c.hex}"></div>
            <div class="info">
              <div class="name">${escapeHtml(c.name)}</div>
              <div class="hex">${c.hex.toUpperCase()}</div>
              <div class="actions">
                <button class="btn" data-edit="${c.id}">Edit</button>
                <button class="btn btn-danger" data-delete="${c.id}">Delete</button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
      `}
    </div>
  `;

  document.getElementById('add-color').addEventListener('click', () => openColorModal());
  root.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openColorModal(colors.find((c) => c.id === btn.dataset.edit)));
  });
  root.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const c = colors.find((x) => x.id === btn.dataset.delete);
      if (!confirm(`Xoá màu "${c.name}"?`)) return;
      await DB.delete('colors', c.id);
      toast('Đã xoá màu.');
      renderColors();
    });
  });
}

function openColorModal(existing) {
  openModal(`
    <span class="modal-close" id="m-close">✕</span>
    <h2>${existing ? 'Edit Color' : 'Add Color'}</h2>
    <div class="field-group">
      <div class="field-label">Color Name</div>
      <input type="text" id="c-name" value="${existing ? escapeHtml(existing.name) : ''}" placeholder="e.g. Sunset Orange" />
    </div>
    <div class="field-group">
      <div class="field-label">Hex Code</div>
      <div style="display:flex;gap:10px;align-items:center">
        <input type="color" id="c-hex-picker" value="${existing ? existing.hex : '#6d5bd0'}" style="width:46px;height:38px;border:1px solid var(--border);border-radius:8px;padding:2px" />
        <input type="text" id="c-hex" value="${existing ? existing.hex : '#6D5BD0'}" style="flex:1" />
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn" id="c-cancel">Cancel</button>
      <button class="btn btn-primary" id="c-save">${existing ? 'Save Changes' : 'Add Color'}</button>
    </div>
  `, {
    onMount: () => {
      document.getElementById('m-close').addEventListener('click', closeModal);
      document.getElementById('c-cancel').addEventListener('click', closeModal);
      const picker = document.getElementById('c-hex-picker');
      const hexInput = document.getElementById('c-hex');
      picker.addEventListener('input', () => { hexInput.value = picker.value.toUpperCase(); });
      hexInput.addEventListener('input', () => {
        if (/^#([0-9a-f]{6})$/i.test(hexInput.value)) picker.value = hexInput.value;
      });
      document.getElementById('c-save').addEventListener('click', async () => {
        const name = document.getElementById('c-name').value.trim();
        let hex = document.getElementById('c-hex').value.trim();
        if (!hex.startsWith('#')) hex = `#${hex}`;
        if (!name || !/^#([0-9a-f]{6})$/i.test(hex)) { toast('Vui lòng nhập tên màu và mã hex hợp lệ (#RRGGBB).'); return; }
        await DB.put('colors', { id: existing?.id || uid('color'), name, hex: hex.toUpperCase() });
        closeModal();
        toast(existing ? 'Đã cập nhật màu.' : 'Đã thêm màu mới.');
        renderColors();
      });
    },
  });
}
