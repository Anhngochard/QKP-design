// One-off admin tool: moves existing Design File uploads (Front/Back/More —
// NOT mockups) that still live in Supabase Storage over to Google Drive, the
// same way new uploads already work (see designDetail.js `handleDesignFile`).
// Two separate steps on purpose:
//   1. Copy every old file to Drive and repoint the design's record at it.
//   2. (Only after you've checked everything still opens fine) delete the old
//      Supabase Storage objects to actually reclaim quota.
// Nothing in step 2 runs automatically — it's a separate button + confirm.
import { DB } from '../lib/db.js';
import { toast } from '../lib/utils.js';
import { uploadFileToDrive } from '../lib/googleDrive.js';
import { supabase } from '../lib/supabase.js';

const STORAGE_BUCKET = 'design-assets';

function pushHistory(design, text) {
  design.history = design.history || [];
  design.history.push({ ts: Date.now(), text });
}

// Every design-file slot on a design, as {design, key, slot, apply(newSlot)}.
function collectSlots(design) {
  const slots = [];
  if (design.designFileFront) {
    slots.push({ label: 'Front', slot: design.designFileFront, apply: (s) => { design.designFileFront = s; } });
  }
  if (design.designFileBack) {
    slots.push({ label: 'Back', slot: design.designFileBack, apply: (s) => { design.designFileBack = s; } });
  }
  (design.designFilesExtra || []).forEach((f, i) => {
    slots.push({ label: `More #${i + 1}`, slot: f, apply: (s) => { design.designFilesExtra[i] = s; } });
  });
  return slots;
}

function needsMigration(slot) {
  return slot && slot.provider !== 'drive' && slot.dataUrl;
}

export async function renderMigrateDrive() {
  const root = document.getElementById('view-root');
  const designs = await DB.getAll('designs');

  // Build the work list up front so the count on screen is accurate immediately.
  const pending = [];
  designs.forEach((design) => {
    collectSlots(design).forEach(({ label, slot, apply }) => {
      if (needsMigration(slot)) pending.push({ design, label, slot, apply });
    });
  });

  // Paths queued for deletion once the user explicitly asks for cleanup —
  // kept in memory only (not persisted) so a reload always starts fresh/safe.
  let deletablePaths = [];
  let running = false;
  let cancelled = false;

  function draw() {
    root.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Chuyển Design File cũ sang Google Drive</h2>
          <div class="breadcrumb">Chỉ Design File (Front/Back/More) — Mockup và dữ liệu khác giữ nguyên trên Supabase</div>
        </div>
      </div>
      <div class="card" style="max-width:800px">
        <p>Tìm thấy <strong>${pending.length}</strong> file thiết kế đang còn lưu trên Supabase Storage, chưa nằm trên Google Drive.</p>
        <div style="display:flex;gap:8px;margin:16px 0;flex-wrap:wrap">
          <button class="btn btn-primary" id="btn-start" ${pending.length === 0 || running ? 'disabled' : ''}>
            🚀 Bắt đầu chuyển ${pending.length} file
          </button>
          <button class="btn" id="btn-cancel" style="display:${running ? '' : 'none'}">Dừng lại</button>
          <button class="btn btn-danger" id="btn-cleanup" style="display:${deletablePaths.length ? '' : 'none'}">
            🗑️ Xoá ${deletablePaths.length} file cũ trên Supabase (giải phóng dung lượng)
          </button>
        </div>
        <div id="progress" style="font-weight:600;margin-bottom:8px"></div>
        <pre id="log" style="background:#111;color:#ddd;padding:12px;border-radius:8px;max-height:400px;overflow:auto;font-size:12px;white-space:pre-wrap"></pre>
      </div>
    `;
    document.getElementById('btn-start')?.addEventListener('click', start);
    document.getElementById('btn-cancel')?.addEventListener('click', () => { cancelled = true; });
    document.getElementById('btn-cleanup')?.addEventListener('click', cleanup);
  }

  function log(line) {
    const el = document.getElementById('log');
    if (!el) return;
    el.textContent += line + '\n';
    el.scrollTop = el.scrollHeight;
  }

  function setProgress(text) {
    const el = document.getElementById('progress');
    if (el) el.textContent = text;
  }

  async function migrateOne(item, index, total) {
    const { design, label, slot, apply } = item;
    setProgress(`Đang xử lý ${index + 1}/${total}: "${design.name}" — ${label}`);
    try {
      const res = await fetch(slot.dataUrl);
      if (!res.ok) throw new Error(`Tải file gốc thất bại (HTTP ${res.status})`);
      const blob = await res.blob();
      const file = new File([blob], slot.name || 'design-file', { type: slot.type || blob.type });
      const uploaded = await uploadFileToDrive(file);
      const oldPath = slot.provider !== 'drive' ? slot.path : null;
      apply({
        ...slot,
        dataUrl: uploaded.url,
        path: uploaded.id,
        provider: 'drive',
        viewUrl: uploaded.viewUrl,
      });
      pushHistory(design, `${label} design file migrated to Google Drive.`);
      await DB.put('designs', design);
      if (oldPath) deletablePaths.push(oldPath);
      log(`✅ "${design.name}" — ${label}: OK`);
    } catch (err) {
      log(`❌ "${design.name}" — ${label}: ${err.message}`);
    }
  }

  async function start() {
    running = true;
    cancelled = false;
    draw();
    for (let i = 0; i < pending.length; i++) {
      if (cancelled) { log('⏸️ Đã dừng theo yêu cầu.'); break; }
      await migrateOne(pending[i], i, pending.length);
    }
    running = false;
    setProgress(cancelled ? 'Đã dừng.' : `Hoàn tất: ${pending.length} file đã xử lý.`);
    draw();
    toast('Đã xử lý xong đợt chuyển file.');
  }

  async function cleanup() {
    if (!deletablePaths.length) return;
    const ok = window.confirm(
      `Xoá vĩnh viễn ${deletablePaths.length} file gốc trên Supabase Storage? ` +
      `Chỉ làm việc này sau khi đã kiểm tra các file trên Drive mở/tải bình thường — không thể hoàn tác.`
    );
    if (!ok) return;
    const batches = [];
    for (let i = 0; i < deletablePaths.length; i += 100) batches.push(deletablePaths.slice(i, i + 100));
    let removed = 0;
    for (const batch of batches) {
      const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(batch);
      if (error) { log(`❌ Lỗi xoá batch: ${error.message}`); continue; }
      removed += batch.length;
      log(`🗑️ Đã xoá ${removed}/${deletablePaths.length} file cũ.`);
    }
    deletablePaths = [];
    toast('Đã xoá file cũ trên Supabase.');
    draw();
  }

  draw();
}
