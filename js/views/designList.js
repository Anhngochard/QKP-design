import { DB } from '../lib/db.js';
import { STATUS_FLOW, PRIORITIES } from '../lib/seed.js';
import { fmtDate, escapeHtml, toast } from '../lib/utils.js';
import { navigate } from '../lib/router.js';

function statusLabel(key) {
  return STATUS_FLOW.find((s) => s.key === key)?.label || key;
}
export async function renderDesignList(query = {}, opts = {}) {
  const root = document.getElementById('view-root');
  const isStorage = !!opts.isStorage;
  const [designs, sellers, designers] = await Promise.all([
    DB.getAll('designs'), DB.getAll('sellers'), DB.getAll('designers'),
  ]);

  const sellerName = (id) => sellers.find((s) => s.id === id)?.name || '—';
  const designerName = (id) => designers.find((d) => d.id === id)?.name || '—';

  const state = {
    status: query.status || '',
    seller: query.seller || '',
    designer: query.designer || '',
    q: query.q || '',
    priority: query.priority || '',
  };

  const title = isStorage
    ? 'Design Storage'
    : (state.status ? statusLabel(state.status) : 'All Designs');

  function statusSelectHtml(d) {
    const options = STATUS_FLOW.map((s) => {
      const isCurrent = s.key === d.status;
      const needsFile = s.key === 'check_design' && !d.designFileFront && !d.designFileBack;
      const blocked = !isCurrent && needsFile;
      return `<option value="${s.key}" ${isCurrent ? 'selected' : ''} ${blocked ? 'disabled' : ''}>${s.label}</option>`;
    }).join('');
    return `<select class="status-select badge badge-${d.status}" data-status-select="${d.id}">${options}</select>`;
  }

  function designerSelectHtml(d) {
    const options = `<option value="">— Chưa chọn —</option>` +
      designers.map((des) => `<option value="${des.id}" ${des.id === d.designerId ? 'selected' : ''}>${escapeHtml(des.name)}</option>`).join('');
    return `<select class="field" data-designer-select="${d.id}" style="padding:6px 10px;font-size:12.5px">${options}</select>`;
  }

  function applyFilters(list) {
    return list.filter((d) => {
      if (state.status && d.status !== state.status) return false;
      if (state.seller && d.sellerId !== state.seller) return false;
      if (state.designer && d.designerId !== state.designer) return false;
      if (state.priority && d.priority !== state.priority) return false;
      if (state.q) {
        const hay = `${d.name} ${d.product} ${d.colorName}`.toLowerCase();
        if (!hay.includes(state.q.toLowerCase())) return false;
      }
      return true;
    }).sort((a, b) => b.createdAt - a.createdAt);
  }

  function draw() {
    const filtered = applyFilters(designs);

    root.innerHTML = `
      <div class="page-header">
        <div>
          <h2>${title}</h2>
          <div class="breadcrumb">${isStorage ? 'Toàn bộ file & lịch sử design đã lưu trữ' : `${filtered.length} design(s)`}</div>
        </div>
        <div class="header-actions">
          <button class="btn btn-primary" id="list-upload">+ Upload New Design</button>
        </div>
      </div>

      <div class="card">
        <div class="filters">
          <input type="text" id="f-q" placeholder="🔍 Tìm theo tên design, sản phẩm, màu..." value="${escapeHtml(state.q)}" />
          <select class="field" id="f-status">
            <option value="">Tất cả trạng thái</option>
            ${STATUS_FLOW.map((s) => `<option value="${s.key}" ${state.status === s.key ? 'selected' : ''}>${s.label}</option>`).join('')}
          </select>
          <select class="field" id="f-seller">
            <option value="">Tất cả seller</option>
            ${sellers.map((s) => `<option value="${s.id}" ${state.seller === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
          </select>
          <select class="field" id="f-designer">
            <option value="">Tất cả designer</option>
            ${designers.map((d) => `<option value="${d.id}" ${state.designer === d.id ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('')}
          </select>
          <select class="field" id="f-priority">
            <option value="">Mọi độ ưu tiên</option>
            ${PRIORITIES.map((p) => `<option value="${p}" ${state.priority === p ? 'selected' : ''}>${p}</option>`).join('')}
          </select>
        </div>

        ${filtered.length === 0 ? `
          <div class="empty-state">
            <div class="icon">🗂️</div>
            Không có design nào khớp bộ lọc.
          </div>
        ` : `
        <table class="table">
          <thead>
            <tr>
              <th>Mockup</th><th>Design</th><th>Name</th><th>Seller</th><th>Designer</th><th>Status</th>
              <th>Priority</th><th>Created</th><th>Seller Notes</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map((d) => {
              const mockupUrl = d.mockupFront?.dataUrl || d.mockupBack?.dataUrl || d.mockupExtra?.[0]?.dataUrl || '';
              const designUrl = d.designFileFront?.dataUrl || d.designFileBack?.dataUrl || d.designFilesExtra?.[0]?.dataUrl || '';
              return `
              <tr data-goto="${d.id}">
                <td><img class="thumb" src="${mockupUrl}" onerror="this.style.visibility='hidden'" /></td>
                <td><img class="thumb" src="${designUrl}" onerror="this.style.visibility='hidden'" /></td>
                <td>
                  <div class="design-name-cell">
                    <div>
                      <div class="name" title="${escapeHtml(d.name)}">${escapeHtml(d.name)}</div>
                      <div class="meta">${escapeHtml(d.product)} · ${escapeHtml(d.gender || '')} · ${escapeHtml(d.colorName)} · ${escapeHtml(d.size)}</div>
                    </div>
                  </div>
                </td>
                <td>${escapeHtml(sellerName(d.sellerId))}</td>
                <td>${designerSelectHtml(d)}</td>
                <td>${statusSelectHtml(d)}</td>
                <td><span class="priority-${(d.priority || 'normal').toLowerCase()}">${escapeHtml(d.priority || 'Normal')}</span></td>
                <td>${fmtDate(d.createdAt)}</td>
                <td><div class="seller-notes-cell">${d.sellerNotes ? escapeHtml(d.sellerNotes) : '<span class="muted">Chưa có ghi chú</span>'}</div></td>
              </tr>
            `;
            }).join('')}
          </tbody>
        </table>
        `}
      </div>
    `;

    root.querySelectorAll('[data-goto]').forEach((row) => {
      row.addEventListener('click', () => navigate(`/design/${row.dataset.goto}`));
    });
    document.getElementById('list-upload').addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('open-upload-modal'));
    });

    root.querySelectorAll('[data-status-select]').forEach((sel) => {
      sel.addEventListener('click', (e) => e.stopPropagation());
      sel.addEventListener('change', async (e) => {
        e.stopPropagation();
        const d = designs.find((x) => x.id === sel.dataset.statusSelect);
        const newStatus = sel.value;
        if (newStatus === d.status) return;

        if (newStatus === 'check_design' && !d.designFileFront && !d.designFileBack) {
          toast('Cần mở task và upload file thiết kế trước khi chuyển sang Check Design.');
          sel.value = d.status;
          return;
        }

        const oldLabel = statusLabel(d.status);
        d.status = newStatus;
        d.history = d.history || [];
        d.history.push({ ts: Date.now(), text: `Moved from "${oldLabel}" to "${statusLabel(newStatus)}" via list dropdown.` });
        await DB.put('designs', d);
        window.dispatchEvent(new CustomEvent('designs-changed'));
        toast(`Đã chuyển "${d.name}" sang "${statusLabel(newStatus)}"`);
        draw();
      });
    });

    root.querySelectorAll('[data-designer-select]').forEach((sel) => {
      sel.addEventListener('click', (e) => e.stopPropagation());
      sel.addEventListener('change', async (e) => {
        e.stopPropagation();
        const d = designs.find((x) => x.id === sel.dataset.designerSelect);
        const newDesignerId = sel.value || null;
        if (newDesignerId === d.designerId) return;
        const label = newDesignerId ? designerName(newDesignerId) : '— Chưa chọn —';
        d.designerId = newDesignerId;
        d.history = d.history || [];
        d.history.push({ ts: Date.now(), text: `Designer assigned: ${label} (via list dropdown).` });
        await DB.put('designs', d);
        window.dispatchEvent(new CustomEvent('designs-changed'));
        toast(`Đã gán designer "${d.name}" cho ${label}`);
        draw();
      });
    });

    document.getElementById('f-q').addEventListener('input', (e) => { state.q = e.target.value; draw(); });
    document.getElementById('f-status').addEventListener('change', (e) => { state.status = e.target.value; draw(); });
    document.getElementById('f-seller').addEventListener('change', (e) => { state.seller = e.target.value; draw(); });
    document.getElementById('f-designer').addEventListener('change', (e) => { state.designer = e.target.value; draw(); });
    document.getElementById('f-priority').addEventListener('change', (e) => { state.priority = e.target.value; draw(); });
  }

  draw();
}
