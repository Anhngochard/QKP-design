export function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

export function fmtDateTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
}

export function toDateInputValue(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromDateInputValue(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function fmtBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

let toastEl = null;
export function toast(msg) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast-wrap';
    document.body.appendChild(toastEl);
  }
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  toastEl.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

// Deterministic pastel color for a person, so the same seller/designer always
// gets the same badge color across rows. Returns { bg, fg } CSS colors.
export function pastelColorFor(key) {
  const str = String(key || '');
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return { bg: `hsl(${hue}, 70%, 90%)`, fg: `hsl(${hue}, 45%, 32%)` };
}

export function initials(name) {
  return String(name || '?').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

// Best-effort natural pixel dimensions of an image file — null for non-image files.
export function getImageDimensions(file) {
  return new Promise((resolve) => {
    if (!file.type || !file.type.startsWith('image/')) { resolve(null); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { resolve(null); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// A plain <a href="crossOriginUrl" download="name"> silently ignores the `download`
// filename hint for cross-origin URLs (which every Supabase Storage file is, relative
// to this app) — browsers just navigate to it, saving with whatever name is in the
// URL itself. Fetching the file as a blob and downloading that local blob URL instead
// forces the browser to honor our filename.
export async function downloadFile(url, filename) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Không tải được file (HTTP ${res.status})`);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}
