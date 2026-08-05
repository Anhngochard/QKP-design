import { DB } from '../lib/db.js';
import { STATUS_FLOW } from '../lib/seed.js';
import { fmtDate, escapeHtml, toast } from '../lib/utils.js';
import { navigate } from '../lib/router.js';

export async function renderDashboard() {
  const root = document.getElementById('view-root');
  const [designs, sellers, designers] = await Promise.all([
    DB.getAll('designs'), DB.getAll('sellers'), DB.getAll('designers'),
  ]);

  const sellerName = (id) => sellers.find((s) => s.id === id)?.name || '—';

  const counts = {};
  STATUS_FLOW.forEach((s) => { counts[s.key] = 0; });
  designs.forEach((d) => { counts[d.status] = (counts[d.status] || 0) + 1; });

  const overdue = designs.filter((d) => d.status !== 'done' && d.dueDate && d.dueDate < Date.now()).length;

  const recent = [...designs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);

  function designerSelectHtml(d) {
    const options = `<option value="">— Chưa chọn —</option>` +
      designers.map((des) => `<option value="${des.id}" ${des.id === d.designerId ? 'selected' : ''}>${escapeHtml(des.name)}</option>`).join('');
    return `<select class="field" data-designer-select="${d.id}" style="padding:6px 10px;font-size:12.5px">${options}</select>`;
  }

  root.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Dashboard</h2>
        <div class="breadcrumb">Overview of all print-on-demand design tasks</div>
      </div>
      <div class="header-actions">
        <button class="btn btn-primary" id="dash-upload">+ Upload New Design</button>
      </div>
    </div>

    <div class="grid stat-grid">
      <div class="stat-card">
        <div class="label">Total Designs</div>
        <div class="value">${designs.length}</div>
        <div class="sub">${sellers.length} sellers · ${designers.length} designers</div>
      </div>
      <div class="stat-card">
        <div class="label">Waiting Design</div>
        <div class="value">${counts.waiting_design}</div>
        <div class="sub">Needs a designer to start</div>
      </div>
      <div class="stat-card">
        <div class="label">In Fix / Review</div>
        <div class="value">${counts.check_design + counts.fix_design + counts.support_customer}</div>
        <div class="sub">Across check, fix &amp; support stages</div>
      </div>
      <div class="stat-card">
        <div class="label">Done</div>
        <div class="value">${counts.done}</div>
        <div class="sub">${overdue} task(s) overdue</div>
      </div>
    </div>

    <div class="card">
      <h3>Workflow Breakdown</h3>
      <div class="grid stat-grid" style="margin-bottom:0">
        ${STATUS_FLOW.map((s) => `
          <div class="stat-card" style="cursor:pointer" data-goto-status="${s.key}">
            <div class="label">${s.icon} ${s.label}</div>
            <div class="value">${counts[s.key]}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="card">
      <h3>Recent Designs</h3>
      ${recent.length === 0 ? '<div class="empty-state">Chưa có design nào. Bấm "Upload New Design" để bắt đầu.</div>' : `
      <table class="table">
        <thead>
          <tr><th>Mockup</th><th>Design</th><th>Name</th><th>Seller</th><th>Designer</th><th>Status</th><th>Created</th><th>Seller Notes</th></tr>
        </thead>
        <tbody>
          ${recent.map((d) => {
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
                    <div class="meta">${escapeHtml(d.product)} · ${escapeHtml(d.colorName)} · ${escapeHtml(d.size)}</div>
                  </div>
                </div>
              </td>
              <td>${escapeHtml(sellerName(d.sellerId))}</td>
              <td>${designerSelectHtml(d)}</td>
              <td><span class="badge badge-${d.status}">${STATUS_FLOW.find((s) => s.key === d.status)?.label || d.status}</span></td>
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
  root.querySelectorAll('[data-goto-status]').forEach((card) => {
    card.addEventListener('click', () => navigate(`/designs?status=${card.dataset.gotoStatus}`));
  });
  root.querySelectorAll('[data-designer-select]').forEach((sel) => {
    sel.addEventListener('click', (e) => e.stopPropagation());
    sel.addEventListener('change', async (e) => {
      e.stopPropagation();
      const d = designs.find((x) => x.id === sel.dataset.designerSelect);
      const newDesignerId = sel.value || null;
      if (newDesignerId === d.designerId) return;
      const label = newDesignerId ? (designers.find((des) => des.id === newDesignerId)?.name || '—') : '— Chưa chọn —';
      d.designerId = newDesignerId;
      d.history = d.history || [];
      d.history.push({ ts: Date.now(), text: `Designer assigned: ${label} (via dashboard dropdown).` });
      await DB.put('designs', d);
      window.dispatchEvent(new CustomEvent('designs-changed'));
      toast(`Đã gán designer "${d.name}" cho ${label}`);
      renderDashboard();
    });
  });
  document.getElementById('dash-upload').addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('open-upload-modal'));
  });
}
