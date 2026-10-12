// One-off admin tool: moves existing Design File AND Mockup uploads that
// still live in Supabase Storage over to Google Drive, the same way new
// uploads already work (see designDetail.js `handleDesignFile` /
// `handleMockupFrontBack` / `handleMockupExtra`). Two separate steps on
// purpose:
//   1. Copy every old file to Drive and repoint the design's record at it.
//   2. (Only after you've checked everything still opens fine) delete the old
//      Supabase Storage objects to actually reclaim quota.
// Nothing in step 2 runs automatically — it's a separate button + confirm.
import { DB } from '../lib/db.js';
import { toast } from '../lib/utils.js';
import { uploadFileToDrive } from '../lib/googleDrive.js';
import { supabase } from '../lib/supabase.js';

const STORAGE_BUCKET = 'design-assets';
const STORAGE_FOLDERS = ['design-files', 'mockups']; // every folder old uploads could still be sitting in

function pushHistory(design, text) {
  design.history = design.history || [];
  design.history.push({ ts: Date.now(), text });
}

// Every uploaded-file slot on a design (design files AND mockups), as
// {label, slot, apply(newSlot)}.
function collectSlots(design) {
  const slots = [];
  if (design.designFileFront) {
    slots.push({ label: 'Design Front', slot: design.designFileFront, apply: (s) => { design.designFileFront = s; } });
  }
  if (design.designFileBack) {
    slots.push({ label: 'Design Back', slot: design.designFileBack, apply: (s) => { design.designFileBack = s; } });
  }
  (design.designFilesExtra || []).forEach((f, i) => {
    slots.push({ label: `Design More #${i + 1}`, slot: f, apply: (s) => { design.designFilesExtra[i] = s; } });
  });
  if (design.mockupFront) {
    slots.push({ label: 'Mockup Front', slot: design.mockupFront, apply: (s) => { design.mockupFront = s; } });
  }
  if (design.mockupBack) {
    slots.push({ label: 'Mockup Back', slot: design.mockupBack, apply: (s) => { design.mockupBack = s; } });
  }
  (design.mockupExtra || []).forEach((m, i) => {
    slots.push({ label: `Mockup More #${i + 1}`, slot: m, apply: (s) => { design.mockupExtra[i] = s; } });
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

  // Paths queued for deletion once the user explicitly asks for cleanup. Not
  // persisted across reloads by itself — but since migrated slots always
  // repoint at Drive, anything still sitting in Storage under STORAGE_FOLDER
  // once `pending` is empty is provably orphaned, so `scanLeftover()` can
  // always rebuild this list from Storage directly (e.g. after the migration
  // ran in an earlier session and the page was since reloaded).
  let deletablePaths = [];
  let scanned = false;
  let scanning = false;
  let running = false;
  let cancelled = false;

  function draw() {
    const canCleanup = pending.length === 0;
    root.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Chuyển Design File & Mockup cũ sang Google Drive</h2>
          <div class="breadcrumb">Toàn bộ file ảnh/thiết kế — chỉ dữ liệu text (tên, trạng thái, ghi chú...) giữ nguyên trên Supabase</div>
        </div>
      </div>
      <div class="card" style="max-width:800px">
        <p>Tìm thấy <strong>${pending.length}</strong> file (design file + mockup) đang còn lưu trên Supabase Storage, chưa nằm trên Google Drive.</p>
        <div style="display:flex;gap:8px;margin:16px 0;flex-wrap:wrap">
          <button class="btn btn-primary" id="btn-start" ${pending.length === 0 || running ? 'disabled' : ''}>
            🚀 Bắt đầu chuyển ${pending.length} file
          </button>
          <button class="btn" id="btn-cancel" style="display:${running ? '' : 'none'}">Dừng lại</button>
        </div>
        ${canCleanup ? `
          <div style="border-top:1px solid var(--border,#eee);padding-top:14px;margin-top:4px">
            <p style="margin:0 0 10px">
              ${scanning ? 'Đang quét file cũ còn sót trên Supabase…'
                : scanned ? `Tìm thấy <strong>${deletablePaths.length}</strong> file cũ không còn được dùng tới (đã chuyển hết sang Drive) — xoá để giải phóng dung lượng Storage.`
                : 'Bấm để quét file cũ không còn được dùng tới trên Supabase.'}
            </p>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn" id="btn-scan" ${scanning ? 'disabled' : ''}>🔍 Quét file cũ còn sót</button>
              <button class="btn btn-danger" id="btn-cleanup" style="display:${scanned && deletablePaths.length ? '' : 'none'}">
                🗑️ Xoá ${deletablePaths.length} file cũ trên Supabase (giải phóng dung lượng)
              </button>
            </div>
          </div>
        ` : `<p style="color:var(--muted,#888);font-size:.9em">Chuyển hết ${pending.length} file ở trên trước đã, rồi mới quét/xoá được file cũ.</p>`}
        <div id="progress" style="font-weight:600;margin:12px 0 8px"></div>
        <pre id="log" style="background:#111;color:#ddd;padding:12px;border-radius:8px;max-height:400px;overflow:auto;font-size:12px;white-space:pre-wrap"></pre>
      </div>
    `;
    document.getElementById('btn-start')?.addEventListener('click', start);
    document.getElementById('btn-cancel')?.addEventListener('click', () => { cancelled = true; });
    document.getElementById('btn-scan')?.addEventListener('click', scanLeftover);
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

  async function migrateOne(item) {
    const { design, label, slot, apply } = item;
    try {
      const res = await fetch(slot.dataUrl);
      if (!res.ok) throw new Error(`Tải file gốc thất bại (HTTP ${res.status})`);
      const blob = await res.blob();
      const file = new File([blob], slot.name || 'file', { type: slot.type || blob.type });
      const uploaded = await uploadFileToDrive(file);
      apply({
        ...slot,
        dataUrl: uploaded.url,
        path: uploaded.id,
        provider: 'drive',
        viewUrl: uploaded.viewUrl,
      });
      pushHistory(design, `${label} migrated to Google Drive.`);
      await DB.put('designs', design);
      log(`✅ "${design.name}" — ${label}: OK`);
    } catch (err) {
      log(`❌ "${design.name}" — ${label}: ${err.message}`);
    }
  }

  // Runs up to CONCURRENCY uploads at once (plain sequential would take
  // hours for several thousand mockups) — a handful of simultaneous workers
  // pulling off the same shared queue, well under Google Drive's per-user
  // rate limits.
  const CONCURRENCY = 5;

  async function start() {
    running = true;
    cancelled = false;
    draw();
    let next = 0;
    let done = 0;
    async function worker() {
      for (;;) {
        if (cancelled) return;
        const i = next++;
        if (i >= pending.length) return;
        await migrateOne(pending[i]);
        done++;
        setProgress(`Đang xử lý ${done}/${pending.length}…`);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));
    running = false;
    setProgress(cancelled ? 'Đã dừng.' : `Hoàn tất: ${pending.length} file đã xử lý.`);
    draw();
    toast('Đã xử lý xong đợt chuyển file.');
  }

  // Lists every object still sitting under STORAGE_FOLDERS in Supabase
  // Storage. Safe to treat all of them as orphaned/deletable *only* when
  // `pending` is empty — i.e. every design-file AND mockup slot in the
  // database has already been repointed at Drive, so nothing in the app
  // references a design-files/... or mockups/... path anymore.
  async function scanLeftover() {
    scanning = true;
    draw();
    const found = [];
    for (const folder of STORAGE_FOLDERS) {
      let offset = 0;
      const PAGE = 100;
      for (;;) {
        const { data, error } = await supabase.storage.from(STORAGE_BUCKET).list(folder, {
          limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' },
        });
        if (error) { log(`❌ Lỗi quét ${folder}/: ${error.message}`); break; }
        (data || []).filter((f) => f.id).forEach((f) => found.push(`${folder}/${f.name}`));
        if (!data || data.length < PAGE) break;
        offset += PAGE;
      }
    }
    deletablePaths = found;
    scanned = true;
    scanning = false;
    draw();
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
    scanned = false;
    toast('Đã xoá file cũ trên Supabase.');
    draw();
  }

  draw();
}
