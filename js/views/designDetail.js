import { DB, uid } from '../lib/db.js';
import { STATUS_FLOW, PRIORITIES } from '../lib/seed.js';
import { fmtDate, fmtDateTime, escapeHtml, fileToDataUrl, fmtBytes, toast } from '../lib/utils.js';
import { navigate } from '../lib/router.js';
import { openModal, closeModal } from '../lib/modal.js';

function statusIdx(key) { return STATUS_FLOW.findIndex((s) => s.key === key); }
function statusLabel(key) { return STATUS_FLOW.find((s) => s.key === key)?.label || key; }

function pushHistory(design, text) {
  design.history = design.history || [];
  design.history.push({ ts: Date.now(), text });
}

export async function renderDesignDetail(id) {
  const root = document.getElementById('view-root');
  const design = await DB.get('designs', id);
  if (!design) {
    root.innerHTML = `<div class="empty-state"><div class="icon">🚫</div>Không tìm thấy design này.<br><span class="edit-link" id="back-empty">‹ Quay lại danh sách</span></div>`;
    document.getElementById('back-empty')?.addEventListener('click', () => navigate('/designs'));
    return;
  }

  const [sellers, designers, colorLib, allDesigns] = await Promise.all([
    DB.getAll('sellers'), DB.getAll('designers'), DB.getAll('colors'), DB.getAll('designs'),
  ]);

  let activeMockupIdx = 0;

  async function persist(historyText) {
    if (historyText) pushHistory(design, historyText);
    await DB.put('designs', design);
    window.dispatchEvent(new CustomEvent('designs-changed'));
  }

  function flowStepperHtml() {
    const curIdx = statusIdx(design.status);
    return STATUS_FLOW.map((s, i) => {
      const cls = i < curIdx ? 'done' : i === curIdx ? 'active' : '';
      const line = i > 0 ? `<div class="flow-line ${i <= curIdx ? 'done' : ''}"></div>` : '';
      return `${line}<div class="flow-step ${cls}"><div class="dot">${i < curIdx ? '✓' : s.icon}</div><div class="label">${s.label}</div></div>`;
    }).join('');
  }

  function draw() {
    const seller = sellers.find((s) => s.id === design.sellerId);
    const designer = designers.find((d) => d.id === design.designerId);
    const curIdx = statusIdx(design.status);
    const isDone = design.status === 'done';
    const mockups = design.mockups || [];
    const activeMockup = mockups[activeMockupIdx] || mockups[0];
    const overdue = !isDone && design.dueDate && design.dueDate < Date.now();

    const sortedIds = [...allDesigns].sort((a, b) => a.createdAt - b.createdAt).map((d) => d.id);
    const posIdx = sortedIds.indexOf(design.id);
    const prevId = sortedIds[posIdx - 1];
    const nextId = sortedIds[posIdx + 1];

    root.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Design Task Detail</h2>
          <div class="breadcrumb" id="back-link" style="cursor:pointer">‹ Back to list</div>
        </div>
        <div class="header-actions">
          <button class="btn" id="prev-task" ${!prevId ? 'disabled' : ''}>← Prev</button>
          <button class="btn" id="next-task" ${!nextId ? 'disabled' : ''}>Next →</button>
        </div>
      </div>

      <div class="detail-layout">
        <div class="detail-main">
          <div class="detail-row2">
            <div class="card" style="flex:1.3">
              <div class="design-hero">
                <img src="${activeMockup?.dataUrl || ''}" onerror="this.style.visibility='hidden'" />
                <div>
                  <h2>${escapeHtml(design.name)} <span class="edit-link" id="edit-task">✏️ Edit</span></h2>
                  <div class="sub">${escapeHtml(design.product)} · ${escapeHtml(design.gender || 'Unisex')} · ${escapeHtml(design.colorName)} · ${escapeHtml(design.size)}</div>
                  <div class="row"><b>Seller:</b> ${escapeHtml(seller?.name || '—')}</div>
                  <div class="row"><b>Designer:</b> ${escapeHtml(designer?.name || '—')}</div>
                  <div class="row"><b>Created:</b> ${fmtDateTime(design.createdAt)}</div>
                  <div class="row"><b>Due date:</b> ${fmtDate(design.dueDate)} ${overdue ? '<span style="color:var(--red);font-weight:700">(overdue)</span>' : ''}</div>
                  <div class="row" style="margin-top:8px">
                    <span class="badge badge-${design.status}">${statusLabel(design.status)}</span>
                    &nbsp; <span class="priority-${(design.priority || 'normal').toLowerCase()}">● Priority: ${escapeHtml(design.priority || 'Normal')}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="card" style="flex:1.7">
              <h3>Task / Flow</h3>
              <div class="flow-stepper">${flowStepperHtml()}</div>
            </div>
          </div>

          <div class="detail-row2">
            <div class="card">
              <h3>Design Work (Designer)</h3>
              <div class="field-label">Design File</div>
              <div class="dropzone" id="dropzone">
                <div class="icon">⬆️</div>
                Drag &amp; drop your design file here or
                <div style="margin-top:10px"><button class="btn btn-primary" id="choose-file" type="button">Choose File</button></div>
                <div style="margin-top:6px;font-size:11px">PNG / PSD / AI / PDF / SVG (Max 100MB)</div>
                <input type="file" id="file-input" style="display:none" multiple accept=".png,.psd,.ai,.pdf,.svg,image/*" />
              </div>

              ${(design.designFiles || []).length === 0 ? `
                <div class="preview-box">Design preview will appear here after you upload the file</div>
              ` : `
                <div style="margin-bottom:16px">
                  ${design.designFiles.map((f) => `
                    <div class="file-row">
                      <span class="fname">📄 ${escapeHtml(f.name)} <span class="muted">(${fmtBytes(f.size)})</span></span>
                      <span>
                        <a class="link-btn" href="${f.dataUrl}" download="${escapeHtml(f.name)}">Download</a>
                        &nbsp;<button class="link-btn btn-danger" data-remove-file="${f.id}" type="button">Remove</button>
                      </span>
                    </div>
                  `).join('')}
                </div>
              `}

              <div class="field-group">
                <div class="field-label">Notes from Designer</div>
                <textarea id="designer-notes" placeholder="Add notes about this design...">${escapeHtml(design.designerNotes || '')}</textarea>
              </div>
              <button class="btn" id="save-notes">Save Notes</button>
            </div>

            <div class="card">
              <h3>Mockup (From Seller)</h3>
              <div class="mockup-main">
                <img src="${activeMockup?.dataUrl || ''}" onerror="this.style.visibility='hidden'" />
              </div>
              ${mockups.length > 1 ? `
                <div class="mockup-thumbs">
                  ${mockups.map((m, i) => `
                    <div class="thumb-item ${i === activeMockupIdx ? 'active' : ''}" data-mockup-idx="${i}">
                      <img src="${m.dataUrl}" />
                      <div class="cap">${escapeHtml(m.label)}</div>
                    </div>
                  `).join('')}
                </div>
              ` : ''}

              <div class="field-group" style="margin-top:16px">
                <div class="field-label">Seller Notes</div>
                <div style="white-space:pre-wrap;font-size:13px;border:1px solid var(--border);border-radius:8px;padding:10px 12px;background:#fafafc">${escapeHtml(design.sellerNotes || '—')}</div>
              </div>

              <div class="field-group">
                <div class="field-label">Color Reference (From Seller)</div>
                <div class="color-swatches">
                  ${(design.colorRefs || []).map((hex) => {
                    const match = colorLib.find((c) => c.hex.toLowerCase() === hex.toLowerCase());
                    return `<div class="swatch"><div class="box" style="background:${hex}"></div>${escapeHtml(match?.name || hex.toUpperCase())}</div>`;
                  }).join('') || '<span class="muted">Không có màu tham chiếu</span>'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="detail-side">
          <div class="card">
            <h3>Information</h3>
            <div class="info-list">
              <div class="info-row"><span class="k">Design Name</span><span class="v">${escapeHtml(design.name)}</span></div>
              <div class="info-row"><span class="k">Product</span><span class="v">${escapeHtml(design.product)}</span></div>
              <div class="info-row"><span class="k">Color / Size</span><span class="v">${escapeHtml(design.colorName)} / ${escapeHtml(design.size)}</span></div>
              <div class="info-row"><span class="k">Date Created</span><span class="v">${fmtDateTime(design.createdAt)}</span></div>
              <div class="info-row"><span class="k">Due Date</span><span class="v">${fmtDate(design.dueDate)}</span></div>
              <div class="info-row"><span class="k">Status</span><span class="v"><span class="badge badge-${design.status}">${statusLabel(design.status)}</span></span></div>
              <div class="info-row"><span class="k">Priority</span><span class="v">${escapeHtml(design.priority || 'Normal')}</span></div>
            </div>
          </div>

          <div class="card">
            <h3>Files &amp; History</h3>
            <div class="field-label">Mockup (From Seller)</div>
            ${mockups.length ? mockups.map((m) => `
              <div class="file-row"><span class="fname">🖼️ ${escapeHtml(m.label)}</span><a class="link-btn" href="${m.dataUrl}" download="${escapeHtml(m.label)}.svg">↓</a></div>
            `).join('') : '<div class="muted" style="margin-bottom:12px">No mockup uploaded</div>'}

            <div class="field-label" style="margin-top:10px">Design File (From Designer)</div>
            ${(design.designFiles || []).length ? design.designFiles.map((f) => `
              <div class="file-row"><span class="fname">📄 ${escapeHtml(f.name)}</span><a class="link-btn" href="${f.dataUrl}" download="${escapeHtml(f.name)}">↓</a></div>
            `).join('') : '<div class="muted" style="margin-bottom:12px">No file uploaded yet</div>'}

            <div class="field-label" style="margin-top:10px">History</div>
            ${(design.history || []).length === 0 ? '<div class="history-empty">No activity yet</div>' : `
              <div>
                ${[...design.history].reverse().map((h) => `
                  <div class="history-item"><span class="ts">${fmtDateTime(h.ts)}</span>${escapeHtml(h.text)}</div>
                `).join('')}
              </div>
            `}
          </div>

          <div class="card">
            <h3>Actions</h3>
            <div class="actions-stack">
              <button class="btn btn-primary btn-block" id="act-submit" ${isDone ? 'disabled' : ''}>
                🚀 ${isDone ? 'Completed' : `Submit${curIdx >= 0 && STATUS_FLOW[curIdx + 1] ? ' → ' + STATUS_FLOW[curIdx + 1].label : ''}`}
              </button>
              <button class="btn btn-block" id="act-request-info" ${isDone ? 'disabled' : ''}>💬 Request More Info</button>
              <button class="btn btn-block" id="act-skip" ${isDone ? 'disabled' : ''}>⏭️ Skip This Task</button>
              <button class="btn btn-danger btn-block" id="act-delete" style="margin-top:6px">🗑 Delete Task</button>
            </div>
          </div>
        </div>
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    document.getElementById('back-link').addEventListener('click', () => navigate('/designs'));
    const prevBtn = document.getElementById('prev-task');
    const nextBtn = document.getElementById('next-task');
    const sortedIds = [...allDesigns].sort((a, b) => a.createdAt - b.createdAt).map((d) => d.id);
    const posIdx = sortedIds.indexOf(design.id);
    if (!prevBtn.disabled) prevBtn.addEventListener('click', () => navigate(`/design/${sortedIds[posIdx - 1]}`));
    if (!nextBtn.disabled) nextBtn.addEventListener('click', () => navigate(`/design/${sortedIds[posIdx + 1]}`));

    document.getElementById('edit-task').addEventListener('click', openEditModal);

    root.querySelectorAll('[data-mockup-idx]').forEach((el) => {
      el.addEventListener('click', () => { activeMockupIdx = Number(el.dataset.mockupIdx); draw(); });
    });

    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    document.getElementById('choose-file').addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('click', (e) => { if (e.target.id === 'dropzone' || e.target.closest('.icon')) fileInput.click(); });
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.style.borderColor = 'var(--purple)'; });
    dropzone.addEventListener('dragleave', () => { dropzone.style.borderColor = ''; });
    dropzone.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropzone.style.borderColor = '';
      await handleFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', async (e) => { await handleFiles(e.target.files); });

    root.querySelectorAll('[data-remove-file]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        design.designFiles = design.designFiles.filter((f) => f.id !== btn.dataset.removeFile);
        await persist('Design file removed.');
        draw();
      });
    });

    document.getElementById('save-notes').addEventListener('click', async () => {
      design.designerNotes = document.getElementById('designer-notes').value;
      await persist();
      toast('Đã lưu ghi chú.');
    });

    document.getElementById('act-submit').addEventListener('click', async () => {
      const idx = statusIdx(design.status);
      if (idx === 0 && (design.designFiles || []).length === 0) {
        toast('Vui lòng upload file thiết kế trước khi submit.');
        return;
      }
      const next = STATUS_FLOW[idx + 1];
      if (!next) return;
      design.status = next.key;
      await persist(`Submitted by designer — moved to "${next.label}".`);
      toast(`Đã chuyển sang "${next.label}"`);
      draw();
    });

    document.getElementById('act-request-info').addEventListener('click', () => {
      openModal(`
        <span class="modal-close" id="m-close">✕</span>
        <h2>Request More Info</h2>
        <div class="field-group">
          <div class="field-label">Message to seller / customer</div>
          <textarea id="ri-text" placeholder="What do you need clarified?"></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn" id="ri-cancel">Cancel</button>
          <button class="btn btn-primary" id="ri-send">Send &amp; Move to Support Customer</button>
        </div>
      `, {
        onMount: () => {
          document.getElementById('m-close').addEventListener('click', closeModal);
          document.getElementById('ri-cancel').addEventListener('click', closeModal);
          document.getElementById('ri-send').addEventListener('click', async () => {
            const msg = document.getElementById('ri-text').value.trim();
            design.status = 'support_customer';
            await persist(msg ? `Requested more info: "${msg}"` : 'Requested more info from seller/customer.');
            closeModal();
            toast('Đã chuyển sang Support Customer.');
            draw();
          });
        },
      });
    });

    document.getElementById('act-skip').addEventListener('click', async () => {
      const idx = statusIdx(design.status);
      const next = STATUS_FLOW[idx + 1];
      if (!next) return;
      if (!confirm(`Bỏ qua bước "${statusLabel(design.status)}" và chuyển sang "${next.label}"?`)) return;
      design.status = next.key;
      await persist(`Task skipped — moved to "${next.label}" without changes.`);
      toast('Đã bỏ qua bước hiện tại.');
      draw();
    });

    document.getElementById('act-delete').addEventListener('click', async () => {
      if (!confirm(`Xoá vĩnh viễn design "${design.name}"? Hành động này không thể hoàn tác.`)) return;
      await DB.delete('designs', design.id);
      window.dispatchEvent(new CustomEvent('designs-changed'));
      toast('Đã xoá design.');
      navigate('/designs');
    });
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    for (const file of files) {
      if (file.size > 100 * 1024 * 1024) { toast(`File "${file.name}" vượt quá 100MB.`); continue; }
      const dataUrl = await fileToDataUrl(file);
      design.designFiles = design.designFiles || [];
      design.designFiles.push({ id: uid('file'), name: file.name, size: file.size, type: file.type, dataUrl, uploadedAt: Date.now() });
    }
    if (files.length) {
      await persist(`${files.length} design file(s) uploaded.`);
      toast('Đã upload file thiết kế.');
      draw();
    }
  }

  function openEditModal() {
    openModal(`
      <span class="modal-close" id="m-close">✕</span>
      <h2>Edit Task Info</h2>
      <div class="field-group">
        <div class="field-label">Design Name</div>
        <input type="text" id="e-name" value="${escapeHtml(design.name)}" />
      </div>
      <div class="field-row field-group">
        <div>
          <div class="field-label">Product</div>
          <input type="text" id="e-product" value="${escapeHtml(design.product)}" />
        </div>
        <div>
          <div class="field-label">Gender</div>
          <input type="text" id="e-gender" value="${escapeHtml(design.gender || '')}" />
        </div>
      </div>
      <div class="field-row field-group">
        <div>
          <div class="field-label">Color Name</div>
          <input type="text" id="e-color" value="${escapeHtml(design.colorName)}" />
        </div>
        <div>
          <div class="field-label">Size</div>
          <input type="text" id="e-size" value="${escapeHtml(design.size)}" />
        </div>
      </div>
      <div class="field-row field-group">
        <div>
          <div class="field-label">Seller</div>
          <select class="field" id="e-seller">${sellers.map((s) => `<option value="${s.id}" ${s.id === design.sellerId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}</select>
        </div>
        <div>
          <div class="field-label">Designer</div>
          <select class="field" id="e-designer">${designers.map((d) => `<option value="${d.id}" ${d.id === design.designerId ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('')}</select>
        </div>
      </div>
      <div class="field-row field-group">
        <div>
          <div class="field-label">Due Date</div>
          <input type="date" id="e-due" value="${design.dueDate ? new Date(design.dueDate).toISOString().slice(0, 10) : ''}" />
        </div>
        <div>
          <div class="field-label">Priority</div>
          <select class="field" id="e-priority">${PRIORITIES.map((p) => `<option ${p === design.priority ? 'selected' : ''}>${p}</option>`).join('')}</select>
        </div>
      </div>
      <div class="field-group">
        <div class="field-label">Status</div>
        <select class="field" id="e-status">${STATUS_FLOW.map((s) => `<option value="${s.key}" ${s.key === design.status ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
      </div>
      <div class="modal-actions">
        <button class="btn" id="e-cancel">Cancel</button>
        <button class="btn btn-primary" id="e-save">Save Changes</button>
      </div>
    `, {
      onMount: () => {
        document.getElementById('m-close').addEventListener('click', closeModal);
        document.getElementById('e-cancel').addEventListener('click', closeModal);
        document.getElementById('e-save').addEventListener('click', async () => {
          design.name = document.getElementById('e-name').value.trim() || design.name;
          design.product = document.getElementById('e-product').value.trim();
          design.gender = document.getElementById('e-gender').value.trim();
          design.colorName = document.getElementById('e-color').value.trim();
          design.size = document.getElementById('e-size').value.trim();
          design.sellerId = document.getElementById('e-seller').value;
          design.designerId = document.getElementById('e-designer').value;
          const dueVal = document.getElementById('e-due').value;
          design.dueDate = dueVal ? new Date(dueVal).getTime() : null;
          design.priority = document.getElementById('e-priority').value;
          design.status = document.getElementById('e-status').value;
          await persist('Task info updated.');
          closeModal();
          toast('Đã cập nhật thông tin task.');
          draw();
        });
      },
    });
  }

  draw();
}
