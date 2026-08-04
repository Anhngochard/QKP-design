import { DB } from '../lib/db.js';
import { STATUS_FLOW } from '../lib/seed.js';
import { fmtDate, escapeHtml } from '../lib/utils.js';
import { navigate } from '../lib/router.js';

export async function renderDashboard() {
  const root = document.getElementById('view-root');
  const [designs, sellers, designers] = await Promise.all([
    DB.getAll('designs'), DB.getAll('sellers'), DB.getAll('designers'),
  ]);

  const sellerName = (id) => sellers.find((s) => s.id === id)?.name || '—';
  const designerName = (id) => designers.find((d) => d.id === id)?.name || '—';

  const counts = {};
  STATUS_FLOW.forEach((s) => { counts[s.key] = 0; });
  designs.forEach((d) => { counts[d.status] = (counts[d.status] || 0) + 1; });

  const overdue = designs.filter((d) => d.status !== 'done' && d.dueDate && d.dueDate < Date.now()).length;

  const recent = [...designs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);

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
          <tr><th>Design</th><th>Seller</th><th>Designer</th><th>Status</th><th>Created</th><th>Due date</th></tr>
        </thead>
        <tbody>
          ${recent.map((d) => `
            <tr data-goto="${d.id}">
              <td>
                <div class="design-name-cell">
                  <img class="thumb" src="${d.mockupFront?.dataUrl || d.mockupBack?.dataUrl || ''}" onerror="this.style.visibility='hidden'" />
                  <div>
                    <div class="name" title="${escapeHtml(d.name)}">${escapeHtml(d.name)}</div>
                    <div class="meta">${escapeHtml(d.product)} · ${escapeHtml(d.colorName)} · ${escapeHtml(d.size)}</div>
                  </div>
                </div>
              </td>
              <td>${escapeHtml(sellerName(d.sellerId))}</td>
              <td>${escapeHtml(designerName(d.designerId))}</td>
              <td><span class="badge badge-${d.status}">${STATUS_FLOW.find((s) => s.key === d.status)?.label || d.status}</span></td>
              <td>${fmtDate(d.createdAt)}</td>
              <td>${fmtDate(d.dueDate)}</td>
            </tr>
          `).join('')}
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
  document.getElementById('dash-upload').addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('open-upload-modal'));
  });
}
