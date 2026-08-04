import { DB } from './lib/db.js';
import { seedIfEmpty, STATUS_FLOW } from './lib/seed.js';
import { route, startRouter, navigate, refresh } from './lib/router.js';
import { renderDashboard } from './views/dashboard.js';
import { renderDesignList } from './views/designList.js';
import { renderDesignDetail } from './views/designDetail.js';
import { renderColors } from './views/colors.js';
import { renderPeople } from './views/people.js';
import { renderAccounts } from './views/accounts.js';
import { openUploadDesignModal } from './views/uploadDesign.js';
import { renderLogin } from './views/login.js';
import { getSessionAndProfile, signOut } from './lib/auth.js';
import { setCurrentProfile, getCurrentProfile, roleLabel } from './lib/session.js';
import { escapeHtml, initials } from './lib/utils.js';
import { isSupabaseConfigured } from './lib/supabase.js';

let routerStarted = false;

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

function renderUserFooter() {
  const profile = getCurrentProfile();
  const el = document.getElementById('user-footer');
  if (!profile) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="avatar">${initials(profile.name || profile.email)}</div>
    <div class="who" style="flex:1">
      <div class="user-footer-name">${escapeHtml(profile.name || profile.email)}</div>
      <div class="user-footer-role">${roleLabel(profile.role)}</div>
      <button class="logout-link" id="btn-logout" type="button">Đăng xuất</button>
    </div>
  `;
  document.getElementById('btn-logout').addEventListener('click', handleLogout);
}

async function handleLogout() {
  await signOut();
  setCurrentProfile(null);
  document.getElementById('app-shell').style.display = 'none';
  showLogin();
}

function showLogin(lockedMessage) {
  renderLogin({ lockedMessage, onSuccess: boot });
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
  route('/accounts', async () => { await renderAccounts(); updateSidebarActive(); });
}

async function boot() {
  if (!isSupabaseConfigured) {
    showLogin();
    return;
  }
  const { session, profile } = await getSessionAndProfile();
  if (!session || !profile) {
    showLogin();
    return;
  }
  if (!profile.is_active) {
    await signOut();
    showLogin('🔒 Tài khoản của bạn đã bị khoá. Vui lòng liên hệ Admin.');
    return;
  }

  setCurrentProfile(profile);
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-shell').style.display = 'grid';
  document.getElementById('nav-accounts').style.display = profile.role === 'admin' ? '' : 'none';
  renderUserFooter();

  await seedIfEmpty();
  await updateSidebarCounts();

  if (!routerStarted) {
    routerStarted = true;
    startRouter();
  } else {
    await refresh();
  }
}

async function main() {
  wireStaticUi();
  registerRoutes();
  await boot();
}

main();
