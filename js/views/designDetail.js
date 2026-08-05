import { DB, uid } from '../lib/db.js';
import { STATUS_FLOW, PRIORITIES } from '../lib/seed.js';
import { fmtDate, fmtDateTime, escapeHtml, fmtBytes, toast, toDateInputValue, getImageDimensions, copyToClipboard } from '../lib/utils.js';
import { navigate } from '../lib/router.js';
import { openModal, closeModal } from '../lib/modal.js';
import { uploadFile } from '../lib/storage.js';
import { getShortLink } from '../lib/shortlink.js';
import { detectDominantColor, nearestNamedColor, loadImageFromFile } from '../lib/colorDetect.js';

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

  let sellerNotesEditing = false;
  let designerNotesEditing = false;

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

  function designFileSlotHtml(side, label, slot) {
    if (!slot) {
      return `
        <div class="dropzone" data-file-drop="${side}" style="padding:20px 10px">
          <div class="icon" style="font-size:22px">⬆️</div>
          <div style="font-size:12.5px;font-weight:600">${label}</div>
          <div style="font-size:11px;margin-top:2px">Choose or drop file</div>
          <div style="font-size:10.5px;margin-top:2px">PNG / PSD / AI / PDF / SVG (Max 100MB)</div>
          <input type="file" data-file-input="${side}" style="display:none" accept=".png,.psd,.ai,.pdf,.svg,image/*" />
        </div>
      `;
    }
    const isImage = /^image\//.test(slot.type || '') || slot.dataUrl?.startsWith('data:image');
    const dims = slot.width && slot.height ? `${slot.width} x ${slot.height}` : fmtBytes(slot.size);
    return `
      <div class="asset-card">
        <div class="thumb-wrap">
          <a href="${slot.dataUrl}" target="_blank" rel="noopener" title="Mở link gốc">
            ${isImage ? `<img src="${slot.dataUrl}" />` : `<span class="file-icon">📄</span>`}
          </a>
          <button type="button" class="copy-icon-btn" data-copy-link="${slot.dataUrl}" title="Copy link">🔗</button>
        </div>
        <div class="info">
          <div class="fname" title="${escapeHtml(slot.name)}">${escapeHtml(slot.name)}</div>
          <div class="dims">${dims}</div>
          <div class="actions-row">
            <span class="muted">${label}</span>
            <button class="link-btn btn-danger" data-file-remove="${side}" type="button" style="margin-left:auto">Remove</button>
          </div>
        </div>
      </div>
    `;
  }

  function mockupCardHtml(mockup, fallbackLabel, side) {
    if (!mockup) {
      return `
        <div class="dropzone" data-mockup-drop="${side}" style="padding:20px 10px">
          <div class="icon" style="font-size:22px">⬆️</div>
          <div style="font-size:12.5px;font-weight:600">${fallbackLabel} Mockup</div>
          <div style="font-size:11px;margin-top:2px">Choose, drop, or paste (Ctrl+V) image</div>
          <input type="file" data-mockup-input="${side}" accept="image/*" style="display:none" />
        </div>
      `;
    }
    const dims = mockup.width && mockup.height ? `${mockup.width} x ${mockup.height}` : '';
    return `
      <div class="asset-card">
        <div class="thumb-wrap">
          <a href="${mockup.dataUrl}" target="_blank" rel="noopener" title="Mở link gốc">
            <img src="${mockup.dataUrl}" />
          </a>
          <button type="button" class="copy-icon-btn" data-copy-link="${mockup.dataUrl}" title="Copy link">🔗</button>
        </div>
        <div class="info">
          <div class="fname" title="${escapeHtml(mockup.name || fallbackLabel)}">${escapeHtml(mockup.name || fallbackLabel)}</div>
          ${dims ? `<div class="dims">${dims}</div>` : ''}
          <button class="link-btn btn-danger" data-mockup-remove="${side}" type="button" style="margin-top:4px">Remove</button>
        </div>
      </div>
    `;
  }

  function mockupExtraCardHtml(mockup, index) {
    const dims = mockup.width && mockup.height ? `${mockup.width} x ${mockup.height}` : '';
    return `
      <div class="asset-card">
        <div class="thumb-wrap">
          <a href="${mockup.dataUrl}" target="_blank" rel="noopener" title="Mở link gốc">
            <img src="${mockup.dataUrl}" />
          </a>
          <button type="button" class="copy-icon-btn" data-copy-link="${mockup.dataUrl}" title="Copy link">🔗</button>
        </div>
        <div class="info">
          <div class="fname" title="${escapeHtml(mockup.name || `More #${index + 1}`)}">${escapeHtml(mockup.name || `More #${index + 1}`)}</div>
          ${dims ? `<div class="dims">${dims}</div>` : ''}
          <button class="link-btn btn-danger" data-mockup-extra-remove="${index}" type="button" style="margin-top:4px">Remove</button>
        </div>
      </div>
    `;
  }

  function mockupAddMoreTileHtml() {
    return `
      <div class="dropzone" id="mockup-more-drop" style="padding:20px 10px">
        <div class="icon" style="font-size:22px">⬆️</div>
        <div style="font-size:12.5px;font-weight:600">+ Mockup More</div>
        <div style="font-size:11px;margin-top:2px">Choose or drop image</div>
        <input type="file" id="mockup-more-input" accept="image/*" style="display:none" />
      </div>
    `;
  }

  function draw() {
    const seller = sellers.find((s) => s.id === design.sellerId);
    const designer = designers.find((d) => d.id === design.designerId);
    const curIdx = statusIdx(design.status);
    const isDone = design.status === 'done';
    const heroImg = design.mockupFront?.dataUrl || design.mockupBack?.dataUrl || '';
    const overdue = !isDone && design.dueDate && design.dueDate < Date.now();
    const reusedFrom = design.reusedFromId ? allDesigns.find((d) => d.id === design.reusedFromId) : null;
    const hasAnyDesignFile = !!(design.designFileFront || design.designFileBack);

    const next = STATUS_FLOW[curIdx + 1];

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
                <img src="${heroImg}" onerror="this.style.visibility='hidden'" />
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
                  ${reusedFrom ? `
                    <div class="row" style="margin-top:8px;color:var(--purple-dark)">
                      ♻️ AI tự động dùng lại thiết kế từ
                      <span class="edit-link" id="goto-reused">"${escapeHtml(reusedFrom.name)}"</span>
                    </div>
                  ` : ''}
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
              <h3>Design Work (Designer) — Front &amp; Back</h3>
              <div class="field-row field-group">
                <div>${designFileSlotHtml('front', 'Front Design File', design.designFileFront)}</div>
                <div>${designFileSlotHtml('back', 'Back Design File', design.designFileBack)}</div>
                ${(design.designFilesExtra || []).map((f, i) => `<div>${designFileSlotHtml(`extra:${i}`, `Design More #${i + 1}`, f)}</div>`).join('')}
                ${(design.designFilesExtra || []).length < 10 ? `<div>${designFileSlotHtml('extra:new', '+ Design More', null)}</div>` : ''}
              </div>

              <div class="field-group">
                <div class="field-label">Notes from Designer</div>
                ${designerNotesEditing ? `
                  <textarea id="designer-notes" placeholder="Add notes about this design...">${escapeHtml(design.designerNotes || '')}</textarea>
                  <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
                    <button class="btn btn-primary" id="save-notes">Save Notes</button>
                    <button class="btn" id="cancel-notes" type="button">Cancel</button>
                    <span class="muted" id="save-notes-status" style="font-size:12px"></span>
                  </div>
                ` : `
                  <div style="white-space:pre-wrap;font-size:13px;border:1px solid var(--border);border-radius:8px;padding:10px 12px;background:#fafafc;min-height:20px">${design.designerNotes ? escapeHtml(design.designerNotes) : '<span class="muted">Chưa có ghi chú.</span>'}</div>
                  <button class="edit-link" id="edit-notes" style="margin-top:6px;background:none;border:none;cursor:pointer;padding:0" type="button">✏️ ${design.designerNotes ? 'Sửa ghi chú' : '+ Thêm ghi chú'}</button>
                `}
              </div>
            </div>

            <div class="card">
              <h3>Mockup (From Seller) — Front &amp; Back</h3>
              <div class="field-row">
                <div>
                  <div class="field-label">Front</div>
                  ${mockupCardHtml(design.mockupFront, 'Front', 'front')}
                </div>
                <div>
                  <div class="field-label">Back</div>
                  ${mockupCardHtml(design.mockupBack, 'Back', 'back')}
                </div>
                ${(design.mockupExtra || []).map((m, i) => `
                  <div>
                    <div class="field-label">More #${i + 1}</div>
                    ${mockupExtraCardHtml(m, i)}
                  </div>
                `).join('')}
                ${(design.mockupExtra || []).length < 10 ? `
                  <div>
                    <div class="field-label">&nbsp;</div>
                    ${mockupAddMoreTileHtml()}
                  </div>
                ` : ''}
              </div>

              <div class="field-group" style="margin-top:16px">
                <div class="field-label">Seller Notes</div>
                ${sellerNotesEditing ? `
                  <textarea id="seller-notes" placeholder="Chưa có ghi chú — bổ sung ở đây nếu seller quên điền lúc tạo task...">${escapeHtml(design.sellerNotes || '')}</textarea>
                  <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
                    <button class="btn btn-primary" id="save-seller-notes">Save Notes</button>
                    <button class="btn" id="cancel-seller-notes" type="button">Cancel</button>
                    <span class="muted" id="save-seller-notes-status" style="font-size:12px"></span>
                  </div>
                ` : `
                  <div style="white-space:pre-wrap;font-size:13px;border:1px solid var(--border);border-radius:8px;padding:10px 12px;background:#fafafc;min-height:20px">${design.sellerNotes ? escapeHtml(design.sellerNotes) : '<span class="muted">Chưa có ghi chú.</span>'}</div>
                  <button class="edit-link" id="edit-seller-notes" style="margin-top:6px;background:none;border:none;cursor:pointer;padding:0" type="button">✏️ ${design.sellerNotes ? 'Sửa ghi chú' : '+ Thêm ghi chú'}</button>
                `}
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
            ${design.mockupFront ? `<div class="file-row"><span class="fname">🖼️ Front</span><a class="link-btn" href="${design.mockupFront.dataUrl}" download="front.svg">↓</a></div>` : ''}
            ${design.mockupBack ? `<div class="file-row"><span class="fname">🖼️ Back</span><a class="link-btn" href="${design.mockupBack.dataUrl}" download="back.svg">↓</a></div>` : ''}
            ${(design.mockupExtra || []).map((m, i) => `
              <div class="file-row"><span class="fname">🖼️ ${escapeHtml(m.name || m.label || `More #${i + 1}`)}</span><a class="link-btn" href="${m.dataUrl}" download="${escapeHtml(m.name || m.label || `more-${i + 1}`)}">↓</a></div>
            `).join('')}
            ${(!design.mockupFront && !design.mockupBack && (design.mockupExtra || []).length === 0) ? '<div class="muted" style="margin-bottom:12px">No mockup uploaded</div>' : ''}

            <div class="field-label" style="margin-top:10px">Design File (From Designer)</div>
            ${design.designFileFront ? `<div class="file-row"><span class="fname">📄 Front — ${escapeHtml(design.designFileFront.name)}</span><a class="link-btn" href="${design.designFileFront.dataUrl}" download="${escapeHtml(design.designFileFront.name)}">↓</a></div>` : ''}
            ${design.designFileBack ? `<div class="file-row"><span class="fname">📄 Back — ${escapeHtml(design.designFileBack.name)}</span><a class="link-btn" href="${design.designFileBack.dataUrl}" download="${escapeHtml(design.designFileBack.name)}">↓</a></div>` : ''}
            ${(design.designFilesExtra || []).map((f, i) => `
              <div class="file-row"><span class="fname">📄 More #${i + 1} — ${escapeHtml(f.name)}</span><a class="link-btn" href="${f.dataUrl}" download="${escapeHtml(f.name)}">↓</a></div>
            `).join('')}
            ${!hasAnyDesignFile && (design.designFilesExtra || []).length === 0 ? '<div class="muted" style="margin-bottom:12px">No file uploaded yet</div>' : ''}

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
                🚀 ${isDone ? 'Completed' : `Submit${next ? ' → ' + next.label : ''}`}
              </button>
              <button class="btn btn-block" id="act-request-info" ${isDone ? 'disabled' : ''}>💬 Request More Info</button>
              <button class="btn btn-block" id="act-skip" ${isDone ? 'disabled' : ''}>⏭️ Skip This Task</button>
              <button class="btn btn-danger btn-block" id="act-delete" style="margin-top:6px">🗑 Delete Task</button>
            </div>

            <div class="field-group" style="margin-top:16px;padding-top:14px;border-top:1px dashed var(--border)">
              <div class="field-label">Hoặc chuyển nhanh đến trạng thái bất kỳ</div>
              <select class="field" id="jump-status">
                ${STATUS_FLOW.map((s) => {
                  const isCurrent = s.key === design.status;
                  const needsFile = s.key === 'check_design' && !design.designFileFront && !design.designFileBack;
                  const blocked = !isCurrent && needsFile;
                  return `<option value="${s.key}" ${isCurrent ? 'selected' : ''} ${blocked ? 'disabled' : ''}>${s.label}</option>`;
                }).join('')}
              </select>
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
    document.getElementById('goto-reused')?.addEventListener('click', () => navigate(`/design/${design.reusedFromId}`));

    root.querySelectorAll('[data-copy-link]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const shortUrl = await getShortLink(btn.dataset.copyLink);
        const ok = await copyToClipboard(shortUrl);
        toast(ok ? 'Đã copy link.' : 'Không copy được, thử lại.');
      });
    });


    root.querySelectorAll('[data-mockup-drop]').forEach((dz) => {
      const side = dz.dataset.mockupDrop;
      const input = dz.querySelector('[data-mockup-input]');
      dz.addEventListener('click', () => input.click());
      dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.style.borderColor = 'var(--purple)'; });
      dz.addEventListener('dragleave', () => { dz.style.borderColor = ''; });
      dz.addEventListener('drop', async (e) => { e.preventDefault(); dz.style.borderColor = ''; await handleMockupFrontBack(side, e.dataTransfer.files[0]); });
      input.addEventListener('change', async (e) => { await handleMockupFrontBack(side, e.target.files[0]); });
    });

    const mockupMoreDrop = document.getElementById('mockup-more-drop');
    if (mockupMoreDrop) {
      const mockupMoreInput = document.getElementById('mockup-more-input');
      mockupMoreDrop.addEventListener('click', () => mockupMoreInput.click());
      mockupMoreDrop.addEventListener('dragover', (e) => { e.preventDefault(); mockupMoreDrop.style.borderColor = 'var(--purple)'; });
      mockupMoreDrop.addEventListener('dragleave', () => { mockupMoreDrop.style.borderColor = ''; });
      mockupMoreDrop.addEventListener('drop', async (e) => { e.preventDefault(); mockupMoreDrop.style.borderColor = ''; await handleMockupExtra(e.dataTransfer.files[0]); });
      mockupMoreInput.addEventListener('change', async (e) => { await handleMockupExtra(e.target.files[0]); });
    }

    root.querySelectorAll('[data-mockup-extra-remove]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.mockupExtraRemove, 10);
        design.mockupExtra.splice(idx, 1);
        await persist(`Mockup extra #${idx + 1} removed.`);
        draw();
      });
    });

    root.querySelectorAll('[data-mockup-remove]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const side = btn.dataset.mockupRemove;
        const label = side === 'front' ? 'Front' : 'Back';
        if (side === 'front') design.mockupFront = null;
        else if (side === 'back') design.mockupBack = null;
        await persist(`${label} mockup removed.`);
        toast(`Đã xoá mockup ${label}.`);
        draw();
      });
    });

    root.querySelectorAll('[data-file-drop]').forEach((dz) => {
      const side = dz.dataset.fileDrop;
      const input = dz.querySelector('[data-file-input]');
      dz.addEventListener('click', () => input.click());
      dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.style.borderColor = 'var(--purple)'; });
      dz.addEventListener('dragleave', () => { dz.style.borderColor = ''; });
      dz.addEventListener('drop', async (e) => { e.preventDefault(); dz.style.borderColor = ''; await handleDesignFile(side, e.dataTransfer.files[0]); });
      input.addEventListener('change', async (e) => { await handleDesignFile(side, e.target.files[0]); });
    });
    root.querySelectorAll('[data-file-remove]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const side = btn.dataset.fileRemove;
        let label;
        if (side === 'front') { design.designFileFront = null; label = 'Front'; }
        else if (side === 'back') { design.designFileBack = null; label = 'Back'; }
        else if (side.startsWith('extra:')) {
          const idx = parseInt(side.split(':')[1], 10);
          design.designFilesExtra.splice(idx, 1);
          label = `More #${idx + 1}`;
        }
        await persist(`${label} design file removed.`);
        draw();
      });
    });

    document.getElementById('edit-notes')?.addEventListener('click', () => {
      designerNotesEditing = true;
      draw();
    });

    document.getElementById('cancel-notes')?.addEventListener('click', () => {
      designerNotesEditing = false;
      draw();
    });

    document.getElementById('save-notes')?.addEventListener('click', async () => {
      const btn = document.getElementById('save-notes');
      const statusEl = document.getElementById('save-notes-status');
      btn.disabled = true;
      statusEl.textContent = 'Đang lưu...';
      try {
        design.designerNotes = document.getElementById('designer-notes').value;
        await persist();
        toast('Đã lưu ghi chú.');
        designerNotesEditing = false;
        draw();
      } catch (err) {
        statusEl.textContent = '';
        btn.disabled = false;
        toast(`Lưu thất bại: ${err.message || 'lỗi không xác định'}. Thử lại nhé.`);
      }
    });

    document.getElementById('edit-seller-notes')?.addEventListener('click', () => {
      sellerNotesEditing = true;
      draw();
    });

    document.getElementById('cancel-seller-notes')?.addEventListener('click', () => {
      sellerNotesEditing = false;
      draw();
    });

    document.getElementById('save-seller-notes')?.addEventListener('click', async () => {
      const btn = document.getElementById('save-seller-notes');
      const statusEl = document.getElementById('save-seller-notes-status');
      btn.disabled = true;
      statusEl.textContent = 'Đang lưu...';
      try {
        design.sellerNotes = document.getElementById('seller-notes').value;
        await persist();
        toast('Đã lưu ghi chú của seller.');
        sellerNotesEditing = false;
        draw();
      } catch (err) {
        statusEl.textContent = '';
        btn.disabled = false;
        toast(`Lưu thất bại: ${err.message || 'lỗi không xác định'}. Thử lại nhé.`);
      }
    });

    document.getElementById('act-submit').addEventListener('click', async () => {
      const idx = statusIdx(design.status);
      const next = STATUS_FLOW[idx + 1];
      if (!next) return;
      if (idx === 0 && !design.designFileFront && !design.designFileBack) {
        toast('Vui lòng upload ít nhất 1 file thiết kế (Front hoặc Back) trước khi submit.');
        return;
      }
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

    document.getElementById('jump-status').addEventListener('change', async (e) => {
      const newStatus = e.target.value;
      if (newStatus === design.status) return;
      if (newStatus === 'check_design' && !design.designFileFront && !design.designFileBack) {
        toast('Cần upload ít nhất 1 file thiết kế (Front hoặc Back) trước khi chuyển sang Check Design.');
        e.target.value = design.status;
        return;
      }
      const oldLabel = statusLabel(design.status);
      design.status = newStatus;
      await persist(`Moved from "${oldLabel}" to "${statusLabel(newStatus)}" via detail page dropdown.`);
      toast(`Đã chuyển sang "${statusLabel(newStatus)}"`);
      draw();
    });
  }

  async function handleDesignFile(side, file) {
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) { toast(`File "${file.name}" vượt quá 100MB.`); return; }
    const dims = await getImageDimensions(file).catch(() => null);
    let uploaded;
    try {
      uploaded = await uploadFile(file, 'design-files');
    } catch (err) {
      toast(`Lỗi upload file: ${err.message}`);
      return;
    }
    const slot = {
      id: uid(), name: file.name, size: file.size, type: file.type, dataUrl: uploaded.url, path: uploaded.path,
      width: dims?.width, height: dims?.height, uploadedAt: Date.now(),
    };
    let label;
    if (side === 'front') { design.designFileFront = slot; label = 'Front'; }
    else if (side === 'back') { design.designFileBack = slot; label = 'Back'; }
    else if (side === 'extra:new') {
      design.designFilesExtra = design.designFilesExtra || [];
      design.designFilesExtra.push(slot);
      label = `More #${design.designFilesExtra.length}`;
    }
    try {
      await persist(`${label} design file uploaded: ${file.name}`);
    } catch (err) {
      toast(`Lỗi lưu file: ${err.message}`);
      return;
    }
    toast('Đã upload file thiết kế.');
    draw();
  }

  async function maybeDetectColor(file) {
    try {
      const img = await loadImageFromFile(file);
      const hex = detectDominantColor(img);
      if (!hex) return;
      const guess = nearestNamedColor(hex);
      if (design.colorName && design.colorName !== '—') return;
      design.colorName = guess;
      toast(`🎨 Tự nhận diện màu áo: ${guess} (chưa chắc chắn 100%, kiểm tra lại nhé)`);
    } catch { /* best-effort only — never block the upload over this */ }
  }

  async function handleMockupFrontBack(side, file) {
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) { toast(`File "${file.name}" vượt quá 100MB.`); return; }
    const dims = await getImageDimensions(file).catch(() => null);
    let uploaded;
    try {
      uploaded = await uploadFile(file, 'mockups');
    } catch (err) {
      toast(`Lỗi upload ảnh: ${err.message}`);
      return;
    }
    const slot = { id: uid(), name: file.name, dataUrl: uploaded.url, path: uploaded.path, width: dims?.width, height: dims?.height };
    if (side === 'front') design.mockupFront = slot; else design.mockupBack = slot;
    try {
      await persist(`${side === 'front' ? 'Front' : 'Back'} mockup uploaded: ${file.name}`);
    } catch (err) {
      toast(`Lỗi lưu ảnh: ${err.message}`);
      return;
    }
    toast('Đã thêm ảnh mockup.');
    await maybeDetectColor(file);
    draw();
  }

  async function handleMockupExtra(file) {
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) { toast(`File "${file.name}" vượt quá 100MB.`); return; }
    const dims = await getImageDimensions(file).catch(() => null);
    let uploaded;
    try {
      uploaded = await uploadFile(file, 'mockups');
    } catch (err) {
      toast(`Lỗi upload ảnh: ${err.message}`);
      return;
    }
    design.mockupExtra = design.mockupExtra || [];
    design.mockupExtra.push({
      id: uid(), name: file.name, dataUrl: uploaded.url, path: uploaded.path, width: dims?.width, height: dims?.height,
    });
    try {
      await persist(`Added mockup image #${design.mockupExtra.length}: ${file.name}`);
    } catch (err) {
      toast(`Lỗi lưu ảnh: ${err.message}`);
      return;
    }
    toast('Đã thêm ảnh mockup.');
    draw();
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
          <input type="date" id="e-due" value="${toDateInputValue(design.dueDate || Date.now())}" />
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
          const newStatus = document.getElementById('e-status').value;
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
          design.status = newStatus;
          await persist('Task info updated.');
          closeModal();
          toast('Đã cập nhật thông tin task.');
          draw();
        });
      },
    });
  }

  // Attached once per page visit (not inside bindEvents/draw, which re-run on every
  // state change) so a paste doesn't get handled multiple times.
  document.addEventListener('paste', handlePaste);
  async function handlePaste(e) {
    if (!document.getElementById('back-link')) {
      document.removeEventListener('paste', handlePaste);
      return;
    }
    const items = e.clipboardData?.items || [];
    const item = [...items].find((it) => it.type.startsWith('image/'));
    if (!item) return;
    e.preventDefault();
    const file = item.getAsFile();
    if (!design.mockupFront) await handleMockupFrontBack('front', file);
    else if (!design.mockupBack) await handleMockupFrontBack('back', file);
    else await handleMockupExtra(file);
  }

  draw();
}
