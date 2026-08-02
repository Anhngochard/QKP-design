import { DB, uid } from '../lib/db.js';
import { PRIORITIES } from '../lib/seed.js';
import { escapeHtml, fileToDataUrl, toast } from '../lib/utils.js';
import { navigate } from '../lib/router.js';
import { openModal, closeModal } from '../lib/modal.js';

export async function openUploadDesignModal() {
  const [sellers, designers, colorLib] = await Promise.all([
    DB.getAll('sellers'), DB.getAll('designers'), DB.getAll('colors'),
  ]);

  let mockups = []; // {id, label, dataUrl}
  let selectedColors = new Set();

  function mockupPreviewHtml() {
    if (mockups.length === 0) return '<div class="preview-box">Mockup preview sẽ hiện ở đây</div>';
    return `<div class="preview-box">${mockups.map((m) => `
      <div style="text-align:center">
        <img src="${m.dataUrl}" style="max-height:100px;border-radius:6px;display:block;margin-bottom:4px" />
        <span style="font-size:11px" class="muted">${escapeHtml(m.label)}</span>
      </div>
    `).join('')}</div>`;
  }

  function colorLibHtml() {
    if (colorLib.length === 0) return '<span class="muted">Chưa có màu trong thư viện. Thêm ở trang Color Library.</span>';
    return `<div class="color-swatches">${colorLib.map((c) => `
      <div class="swatch" data-pick-color="${c.hex}" style="cursor:pointer">
        <div class="box" style="background:${c.hex};${selectedColors.has(c.hex) ? 'outline:3px solid var(--purple);outline-offset:2px' : ''}"></div>
        ${escapeHtml(c.name)}
      </div>
    `).join('')}</div>`;
  }

  function html() {
    return `
      <span class="modal-close" id="m-close">✕</span>
      <h2>Upload New Design</h2>

      <div class="field-group">
        <div class="field-label">Design Name</div>
        <input type="text" id="u-name" placeholder="e.g. Summer Vibes" />
      </div>

      <div class="field-row field-group">
        <div>
          <div class="field-label">Product</div>
          <input type="text" id="u-product" placeholder="T-Shirt, Hoodie, Mug..." />
        </div>
        <div>
          <div class="field-label">Gender</div>
          <input type="text" id="u-gender" placeholder="Unisex / Men / Women / Kids" />
        </div>
      </div>

      <div class="field-row field-group">
        <div>
          <div class="field-label">Color Name</div>
          <input type="text" id="u-color" placeholder="White" />
        </div>
        <div>
          <div class="field-label">Size</div>
          <input type="text" id="u-size" placeholder="L" />
        </div>
      </div>

      <div class="field-row field-group">
        <div>
          <div class="field-label">Seller</div>
          <select class="field" id="u-seller">
            <option value="">— Select seller —</option>
            ${sellers.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}
          </select>
        </div>
        <div>
          <div class="field-label">Designer (optional)</div>
          <select class="field" id="u-designer">
            <option value="">— Unassigned —</option>
            ${designers.map((d) => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="field-row field-group">
        <div>
          <div class="field-label">Due Date</div>
          <input type="date" id="u-due" />
        </div>
        <div>
          <div class="field-label">Priority</div>
          <select class="field" id="u-priority">${PRIORITIES.map((p) => `<option ${p === 'Normal' ? 'selected' : ''}>${p}</option>`).join('')}</select>
        </div>
      </div>

      <div class="field-group">
        <div class="field-label">Mockup Images (from Seller)</div>
        <div class="dropzone" id="u-dropzone" style="padding:16px">
          <div style="font-size:13px">⬆️ Choose or drop mockup image(s) (front / back / close-up...)</div>
          <input type="file" id="u-mockup-input" accept="image/*" multiple style="display:none" />
        </div>
        <div id="u-mockup-preview">${mockupPreviewHtml()}</div>
      </div>

      <div class="field-group">
        <div class="field-label">Notes for Designer</div>
        <textarea id="u-notes" placeholder="Any styling notes, references, requirements..."></textarea>
      </div>

      <div class="field-group">
        <div class="field-label">Color Reference (pick from Color Library)</div>
        <div id="u-color-lib">${colorLibHtml()}</div>
      </div>

      <div class="modal-actions">
        <button class="btn" id="u-cancel">Cancel</button>
        <button class="btn btn-primary" id="u-submit">Create Design Task</button>
      </div>
    `;
  }

  openModal(html(), { onMount: bind });

  function rerenderMockups() {
    document.getElementById('u-mockup-preview').innerHTML = mockupPreviewHtml();
  }
  function rerenderColors() {
    document.getElementById('u-color-lib').innerHTML = colorLibHtml();
    bindColorPicks();
  }
  function bindColorPicks() {
    document.querySelectorAll('[data-pick-color]').forEach((el) => {
      el.addEventListener('click', () => {
        const hex = el.dataset.pickColor;
        if (selectedColors.has(hex)) selectedColors.delete(hex); else selectedColors.add(hex);
        rerenderColors();
      });
    });
  }

  function bind() {
    document.getElementById('m-close').addEventListener('click', closeModal);
    document.getElementById('u-cancel').addEventListener('click', closeModal);
    bindColorPicks();

    const dz = document.getElementById('u-dropzone');
    const input = document.getElementById('u-mockup-input');
    dz.addEventListener('click', () => input.click());
    dz.addEventListener('dragover', (e) => e.preventDefault());
    dz.addEventListener('drop', async (e) => { e.preventDefault(); await addMockups(e.dataTransfer.files); });
    input.addEventListener('change', async (e) => { await addMockups(e.target.files); });

    document.getElementById('u-submit').addEventListener('click', submit);
  }

  async function addMockups(fileList) {
    const files = Array.from(fileList || []);
    const labels = ['Front', 'Back', 'Close-up', 'Lifestyle'];
    for (const file of files) {
      const dataUrl = await fileToDataUrl(file);
      mockups.push({ id: uid('mk'), label: labels[mockups.length] || `Image ${mockups.length + 1}`, dataUrl });
    }
    rerenderMockups();
  }

  async function submit() {
    const name = document.getElementById('u-name').value.trim();
    const sellerId = document.getElementById('u-seller').value;
    if (!name) { toast('Vui lòng nhập tên design.'); return; }
    if (!sellerId) { toast('Vui lòng chọn seller.'); return; }

    const dueVal = document.getElementById('u-due').value;
    const design = {
      id: uid('design'),
      name,
      product: document.getElementById('u-product').value.trim() || '—',
      gender: document.getElementById('u-gender').value.trim() || 'Unisex',
      colorName: document.getElementById('u-color').value.trim() || '—',
      size: document.getElementById('u-size').value.trim() || '—',
      sellerId,
      designerId: document.getElementById('u-designer').value || null,
      createdAt: Date.now(),
      dueDate: dueVal ? new Date(dueVal).getTime() : null,
      status: 'waiting_design',
      priority: document.getElementById('u-priority').value,
      sellerNotes: document.getElementById('u-notes').value.trim(),
      designerNotes: '',
      colorRefs: Array.from(selectedColors),
      mockups,
      designFiles: [],
      history: [{ ts: Date.now(), text: 'Task created by seller.' }],
    };

    await DB.put('designs', design);
    window.dispatchEvent(new CustomEvent('designs-changed'));
    closeModal();
    toast('Đã tạo design task mới!');
    navigate(`/design/${design.id}`);
  }
}
