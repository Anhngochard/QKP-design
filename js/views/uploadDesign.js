import { DB, uid } from '../lib/db.js';
import { PRIORITIES, STATUS_FLOW } from '../lib/seed.js';
import { escapeHtml, toast, toDateInputValue, getImageDimensions } from '../lib/utils.js';
import { navigate } from '../lib/router.js';
import { openModal, closeModal } from '../lib/modal.js';
import { computeImageHash, hammingDistanceHex, DUPLICATE_THRESHOLD } from '../lib/imageHash.js';
import { uploadFile } from '../lib/storage.js';
import { getCurrentProfile } from '../lib/session.js';
import { detectDominantColor, nearestNamedColor, colorDistance, loadImageFromFile } from '../lib/colorDetect.js';
import { thumbUrl } from '../lib/imageTransform.js';

function baseName(fileName) {
  return String(fileName).replace(/\.[^.]+$/, '');
}

function statusLabel(key) {
  return STATUS_FLOW.find((s) => s.key === key)?.label || key;
}

export async function openUploadDesignModal() {
  const [sellers, colorLib] = await Promise.all([
    DB.getAll('sellers'), DB.getAll('colors'),
  ]);

  const me = getCurrentProfile();
  const autoSellerId = me?.role === 'seller' && me.seller_id ? me.seller_id : null;

  let mockupFront = null; // { dataUrl, hash }
  let mockupBack = null;  // { dataUrl, hash }
  let mockupExtra = [];   // [{ id, label, dataUrl }]
  let selectedColors = new Set();
  let nameTouched = false;
  let matchedDesign = null;
  let matchedMockup = null;
  let matchDistance = null;

  function slotHtml(side, label, slot) {
    if (!slot) {
      return `
        <div class="dropzone" data-slot-drop="${side}" style="padding:20px 10px">
          <div class="icon" style="font-size:22px">⬆️</div>
          <div style="font-size:12.5px;font-weight:600">${label}</div>
          <div style="font-size:11px;margin-top:2px">Choose, drop, or paste (Ctrl+V) image</div>
          <input type="file" data-slot-input="${side}" accept="image/*" style="display:none" />
        </div>
      `;
    }
    return `
      <div style="position:relative;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden">
        <img src="${thumbUrl(slot.dataUrl, { width: 220, height: 140 })}" data-fallback="${slot.dataUrl}" loading="lazy" decoding="async" onerror="window.__thumbFallback(this)" style="width:100%;height:120px;object-fit:cover;display:block" />
        <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:#fafafc;font-size:11.5px">
          <span style="font-weight:600">${label}</span>
          <button type="button" class="link-btn btn-danger" data-slot-remove="${side}">Remove</button>
        </div>
      </div>
    `;
  }

  function mockupSlotsHtml() {
    return `
      <div class="field-row">
        <div>${slotHtml('front', 'Front Mockup', mockupFront)}</div>
        <div>${slotHtml('back', 'Back Mockup', mockupBack)}</div>
      </div>
    `;
  }

  function extraHtml() {
    if (mockupExtra.length === 0) return '';
    return `<div class="mockup-thumbs" style="margin-top:10px">${mockupExtra.map((m) => `
      <div class="thumb-item active" style="position:relative">
        <img src="${thumbUrl(m.dataUrl, { width: 150, height: 150 })}" data-fallback="${m.dataUrl}" loading="lazy" decoding="async" onerror="window.__thumbFallback(this)" />
        <div class="cap">${escapeHtml(m.label)}</div>
        <button type="button" data-extra-remove="${m.id}" style="position:absolute;top:2px;right:2px;background:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:11px;cursor:pointer">✕</button>
      </div>
    `).join('')}</div>`;
  }

  function matchBannerHtml() {
    if (!matchedDesign) return '';
    const done = matchedDesign.status === 'done' && (matchedDesign.designFileFront || matchedDesign.designFileBack);
    const similarity = Math.round((1 - matchDistance / 64) * 100);
    return `
      <div class="card" style="border-color:var(--purple);background:var(--purple-light);padding:14px 16px;margin-top:16px">
        <div style="display:flex;gap:12px;align-items:center">
          <img src="${thumbUrl(matchedMockup.dataUrl, { width: 100, height: 100 })}" data-fallback="${matchedMockup.dataUrl}" loading="lazy" decoding="async" onerror="window.__thumbFallback(this)" style="width:52px;height:52px;border-radius:8px;object-fit:cover;flex-shrink:0" />
          <div style="flex:1">
            <div style="font-weight:700;font-size:13px">🤖 AI phát hiện ảnh trùng mẫu với "${escapeHtml(matchedDesign.name)}"</div>
            <div class="muted" style="font-size:12px">Độ khớp ~${similarity}% · Trạng thái: ${statusLabel(matchedDesign.status)}${done ? ' · Đã có file thiết kế hoàn chỉnh' : ''}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
          ${done
            ? `<button class="btn btn-primary" id="u-reuse" type="button">✅ Dùng lại thiết kế có sẵn — không cần làm nữa</button>`
            : `<button class="btn" id="u-view-existing" type="button">👀 Xem task đó</button>`}
          <button class="btn" id="u-dismiss-match" type="button">Vẫn tạo task mới</button>
        </div>
      </div>
    `;
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
        <input type="text" id="u-name" placeholder="Tự điền theo tên file khi bạn upload mockup, hoặc nhập tay" />
      </div>

      <div class="field-row field-group">
        <div>
          <div class="field-label">Color Name</div>
          <input type="text" id="u-color" placeholder="White" />
        </div>
        <div>
          <div class="field-label">Seller</div>
          <select class="field" id="u-seller">
            <option value="">— Select seller —</option>
            ${sellers.map((s) => `<option value="${s.id}" ${s.id === autoSellerId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
          </select>
          ${autoSellerId ? '<div class="muted" style="font-size:11px;margin-top:4px">Tự động theo tài khoản đang đăng nhập</div>' : ''}
        </div>
      </div>

      <div class="field-row field-group">
        <div>
          <div class="field-label">Due Date</div>
          <input type="date" id="u-due" value="${toDateInputValue(Date.now())}" />
        </div>
        <div>
          <div class="field-label">Priority</div>
          <select class="field" id="u-priority">${PRIORITIES.map((p) => `<option ${p === 'Normal' ? 'selected' : ''}>${p}</option>`).join('')}</select>
        </div>
      </div>

      <div class="field-group">
        <div class="field-label">Mockup Images (from Seller) — áo 2 mặt thì gắn cả Front &amp; Back</div>
        <div id="u-mockup-slots">${mockupSlotsHtml()}</div>
        <div id="u-match-banner">${matchBannerHtml()}</div>
        <div style="margin-top:10px">
          <button type="button" class="link-btn" id="u-add-extra">+ Thêm ảnh khác (close-up, lifestyle...)</button>
          <input type="file" id="u-extra-input" accept="image/*" multiple style="display:none" />
        </div>
        <div id="u-extra-preview">${extraHtml()}</div>
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

  function rerenderSlots() {
    document.getElementById('u-mockup-slots').innerHTML = mockupSlotsHtml();
    bindSlotEvents();
  }
  function rerenderExtra() {
    document.getElementById('u-extra-preview').innerHTML = extraHtml();
    document.querySelectorAll('[data-extra-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        mockupExtra = mockupExtra.filter((m) => m.id !== btn.dataset.extraRemove);
        rerenderExtra();
      });
    });
  }
  function rerenderMatch() {
    document.getElementById('u-match-banner').innerHTML = matchBannerHtml();
    if (!matchedDesign) return;
    document.getElementById('u-dismiss-match')?.addEventListener('click', () => {
      matchedDesign = null; matchedMockup = null; matchDistance = null;
      rerenderMatch();
    });
    document.getElementById('u-view-existing')?.addEventListener('click', () => {
      const id = matchedDesign.id;
      closeModal();
      navigate(`/design/${id}`);
    });
    document.getElementById('u-reuse')?.addEventListener('click', reuseExisting);
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

  function bindSlotEvents() {
    document.querySelectorAll('[data-slot-drop]').forEach((dz) => {
      const side = dz.dataset.slotDrop;
      const input = dz.querySelector('[data-slot-input]');
      dz.addEventListener('click', () => input.click());
      dz.addEventListener('dragover', (e) => e.preventDefault());
      dz.addEventListener('drop', async (e) => { e.preventDefault(); await setSlot(side, e.dataTransfer.files[0]); });
      input.addEventListener('change', async (e) => { await setSlot(side, e.target.files[0]); });
    });
    document.querySelectorAll('[data-slot-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.slotRemove === 'front') mockupFront = null; else mockupBack = null;
        rerenderSlots();
      });
    });
  }

  function bind() {
    document.getElementById('m-close').addEventListener('click', closeModal);
    document.getElementById('u-cancel').addEventListener('click', closeModal);
    bindColorPicks();
    bindSlotEvents();

    document.getElementById('u-name').addEventListener('input', () => { nameTouched = true; });

    document.getElementById('u-add-extra').addEventListener('click', () => document.getElementById('u-extra-input').click());
    document.getElementById('u-extra-input').addEventListener('change', async (e) => { await addExtra(e.target.files); });

    document.getElementById('u-submit').addEventListener('click', submit);

    document.addEventListener('paste', handlePaste);
  }

  // Lets a seller copy a product photo from anywhere (a browser tab, Finder preview...)
  // and paste it straight in, instead of always having to save-to-disk then pick the file.
  async function handlePaste(e) {
    if (!document.getElementById('u-submit')) {
      document.removeEventListener('paste', handlePaste);
      return;
    }
    const items = e.clipboardData?.items || [];
    const item = [...items].find((it) => it.type.startsWith('image/'));
    if (!item) return;
    e.preventDefault();
    const file = item.getAsFile();
    if (!mockupFront) await setSlot('front', file);
    else if (!mockupBack) await setSlot('back', file);
    else await addExtra([file]);
  }

  async function setSlot(side, file) {
    if (!file) return;
    if (!nameTouched && !mockupFront && !mockupBack) {
      document.getElementById('u-name').value = baseName(file.name);
    }

    // Hash the local file directly (same-origin blob URL) so we don't need to wait
    // for the upload to finish before checking for duplicates.
    let hash = null;
    try {
      const localUrl = URL.createObjectURL(file);
      hash = await computeImageHash(localUrl);
      URL.revokeObjectURL(localUrl);
    } catch { /* not an image */ }

    const dims = await getImageDimensions(file).catch(() => null);
    let uploaded;
    try {
      uploaded = await uploadFile(file, 'mockups');
    } catch (err) {
      toast(`Lỗi upload ảnh: ${err.message}`);
      return;
    }

    const slot = { dataUrl: uploaded.url, path: uploaded.path, hash, name: file.name, width: dims?.width, height: dims?.height };
    if (side === 'front') mockupFront = slot; else mockupBack = slot;
    rerenderSlots();

    if (hash && !matchedDesign) {
      const match = await findDuplicateMatch(hash);
      if (match) {
        matchedDesign = match.design;
        matchedMockup = match.mockup;
        matchDistance = match.distance;
      }
    }
    rerenderMatch();
    await maybeDetectColor(file);
  }

  // Best-effort: guess the garment color from the mockup photo and pre-fill/pre-select
  // it, without overriding anything the seller already typed or picked themselves.
  async function maybeDetectColor(file) {
    try {
      const img = await loadImageFromFile(file);
      const hex = detectDominantColor(img);
      if (!hex) return;

      const colorNameInput = document.getElementById('u-color');
      const libMatch = colorLib.find((c) => colorDistance(c.hex, hex) < 40);

      if (libMatch) {
        if (!selectedColors.has(libMatch.hex)) {
          selectedColors.add(libMatch.hex);
          rerenderColors();
        }
        if (colorNameInput && !colorNameInput.value.trim()) colorNameInput.value = libMatch.name;
        toast(`🎨 Tự nhận diện màu áo: ${libMatch.name} (chưa chắc chắn 100%, kiểm tra lại nhé)`);
      } else {
        const guess = nearestNamedColor(hex);
        if (colorNameInput && !colorNameInput.value.trim()) colorNameInput.value = guess;
        toast(`🎨 Tự nhận diện màu áo: ${guess} (chưa chắc chắn 100%, kiểm tra lại nhé)`);
      }
    } catch { /* best-effort only — never block the upload over this */ }
  }

  async function addExtra(fileList) {
    const files = Array.from(fileList || []);
    const labels = ['Close-up', 'Lifestyle', 'Detail', 'Other'];
    for (const file of files) {
      const dims = await getImageDimensions(file).catch(() => null);
      let uploaded;
      try {
        uploaded = await uploadFile(file, 'mockups');
      } catch (err) {
        toast(`Lỗi upload ảnh: ${err.message}`);
        continue;
      }
      mockupExtra.push({
        id: uid(), label: labels[mockupExtra.length] || `Image ${mockupExtra.length + 1}`,
        dataUrl: uploaded.url, path: uploaded.path, name: file.name, width: dims?.width, height: dims?.height,
      });
    }
    rerenderExtra();
  }

  async function findDuplicateMatch(hash) {
    const allDesigns = await DB.getAll('designs');
    let best = null;
    let bestDist = Infinity;
    for (const d of allDesigns) {
      let changed = false;
      const candidates = [d.mockupFront, d.mockupBack, ...(d.mockupExtra || [])].filter(Boolean);
      for (const m of candidates) {
        let h = m.hash;
        if (!h) {
          try { h = await computeImageHash(m.dataUrl); m.hash = h; changed = true; } catch { continue; }
        }
        const dist = hammingDistanceHex(hash, h);
        if (dist < bestDist) { bestDist = dist; best = { design: d, mockup: m, distance: dist }; }
      }
      if (changed) await DB.put('designs', d);
    }
    return bestDist <= DUPLICATE_THRESHOLD ? best : null;
  }

  async function reuseExisting() {
    const sellerId = document.getElementById('u-seller').value;
    if (!sellerId) { toast('Vui lòng chọn seller trước.'); return; }

    const name = document.getElementById('u-name').value.trim() || matchedDesign.name;
    const dueVal = document.getElementById('u-due').value;
    const similarity = Math.round((1 - matchDistance / 64) * 100);

    const design = {
      id: uid('design'),
      name,
      product: '—',
      gender: '—',
      colorName: document.getElementById('u-color').value.trim() || matchedDesign.colorName || '—',
      size: '—',
      sellerId,
      designerId: matchedDesign.designerId || null,
      createdAt: Date.now(),
      dueDate: dueVal ? new Date(dueVal).getTime() : null,
      status: 'done',
      priority: document.getElementById('u-priority').value,
      sellerNotes: document.getElementById('u-notes').value.trim(),
      designerNotes: matchedDesign.designerNotes || '',
      colorRefs: Array.from(selectedColors).length ? Array.from(selectedColors) : (matchedDesign.colorRefs || []),
      mockupFront,
      mockupBack,
      mockupExtra,
      designFileFront: matchedDesign.designFileFront ? { ...matchedDesign.designFileFront } : null,
      designFileBack: matchedDesign.designFileBack ? { ...matchedDesign.designFileBack } : null,
      reusedFromId: matchedDesign.id,
      history: [
        { ts: Date.now(), text: 'Task created by seller.' },
        { ts: Date.now(), text: `🤖 AI phát hiện ảnh trùng mẫu với "${matchedDesign.name}" (độ khớp ~${similarity}%) — tự động dùng lại file thiết kế có sẵn, bỏ qua toàn bộ workflow.` },
      ],
    };

    await DB.put('designs', design);
    window.dispatchEvent(new CustomEvent('designs-changed'));
    closeModal();
    toast('🎉 Đã tự động dùng lại thiết kế có sẵn — không cần làm lại!');
    navigate(`/design/${design.id}`);
  }

  async function submit() {
    const name = document.getElementById('u-name').value.trim();
    const sellerId = document.getElementById('u-seller').value;
    if (!name) { toast('Vui lòng nhập tên design (hoặc upload mockup để tự điền theo tên file).'); return; }
    if (!sellerId) { toast('Vui lòng chọn seller.'); return; }

    const dueVal = document.getElementById('u-due').value;
    const design = {
      id: uid('design'),
      name,
      product: '—',
      gender: '—',
      colorName: document.getElementById('u-color').value.trim() || '—',
      size: '—',
      sellerId,
      designerId: null,
      createdAt: Date.now(),
      dueDate: dueVal ? new Date(dueVal).getTime() : null,
      status: 'waiting_design',
      priority: document.getElementById('u-priority').value,
      sellerNotes: document.getElementById('u-notes').value.trim(),
      designerNotes: '',
      colorRefs: Array.from(selectedColors),
      mockupFront,
      mockupBack,
      mockupExtra,
      designFileFront: null,
      designFileBack: null,
      reusedFromId: null,
      history: [{ ts: Date.now(), text: 'Task created by seller.' }],
    };

    await DB.put('designs', design);
    window.dispatchEvent(new CustomEvent('designs-changed'));
    closeModal();
    toast('Đã tạo design task mới!');
    navigate(`/design/${design.id}`);
  }
}
