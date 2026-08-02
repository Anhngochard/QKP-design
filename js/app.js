import { DB } from './lib/db.js';
import { seedIfEmpty, STATUS_FLOW } from './lib/seed.js';
import { route, startRouter, navigate } from './lib/router.js';
import { renderDashboard } from './views/dashboard.js';
import { renderDesignList } from './views/designList.js';
import { renderDesignDetail } from './views/designDetail.js';
import { renderColors } from './views/colors.js';
import { renderPeople } from './views/people.js';
import { openUploadDesignModal } from './views/uploadDesign.js';

async function updateSidebarCounts() {
  const designs = await DB.getAll('designs');
  const counts = {};
  STATUS_FLOW.forEach((s) => { counts[s.key] = 0; });
  designs.forEach((d) => { counts[d.status] = (counts[d.status] || 0) + 1; });
  document.querySelectorAll('[data-count]').forEach((el) => {
    el.textContent = counts[el.dataset.count] || 0;
  });
}

function updateSidebarActive() {
  const hash = window.location.hash.replace(/^#/, '') || '/dashboard';
  document.querySelectorAll('.nav-item[data-route]').forEach((el) => {
    const target = el.dataset.route;
    const isDesignDetail = hash.startsWith('/design/') && target === '/designs';
    el.classList.toggle('active', hash === target || isDesignDetail);
  });
}

function wireStaticUi() {
  document.getElementById('btn-upload-new').addEventListener('click', () => openUploadDesignModal());
  window.addEventListener('open-upload-modal', () => openUploadDesignModal());
  document.querySelectorAll('.nav-item[data-route]').forEach((el) => {
    el.addEventListener('click', () => navigate(el.dataset.route));
  });
  window.addEventListener('designs-changed', updateSidebarCounts);
  window.addEventListener('hashchange', updateSidebarActive);
}

function registerRoutes() {
  route('/dashboard', async () => { await renderDashboard(); updateSidebarActive(); });
  route('/designs', async (params, query) => { await renderDesignList(query); updateSidebarActive(); });
  route('/storage', async () => { await renderDesignList({}, { isStorage: true }); updateSidebarActive(); });
  route('/design/:id', async ({ id }) => { await renderDesignDetail(id); updateSidebarActive(); });
  route('/colors', async () => { await renderColors(); updateSidebarActive(); });
  route('/sellers', async () => { await renderPeople('sellers'); updateSidebarActive(); });
  route('/designers', async () => { await renderPeople('designers'); updateSidebarActive(); });
}

async function main() {
  await seedIfEmpty();
  wireStaticUi();
  registerRoutes();
  startRouter();
  await updateSidebarCounts();
}

main();
