// Supabase Storage can resize/compress images on the fly via its image-transformation
// endpoint, so list/preview thumbnails don't have to download the full original file
// (which can be tens of MB for print-ready exports). Falls back to the original URL
// untouched for anything that isn't a Supabase "object/public" URL (old seed data:
// URIs, non-Supabase links, etc).
export function thumbUrl(url, { width = 200, height = 200, quality = 60 } = {}) {
  if (!url || !url.includes('/storage/v1/object/public/')) return url;
  const base = url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}width=${width}&height=${height}&resize=cover&quality=${quality}`;
}

// Supabase refuses to transform source images past a certain size ("source image file
// is too large to process" — real print-ready exports routinely exceed it), and the
// transformation endpoint is not available on every plan. When the thumbnail fails the
// <img> falls back to the original, untransformed file instead of just going blank.
// Wire this up via: data-fallback="<originalUrl>" onerror="window.__thumbFallback(this)"
//
// That fallback used to load the original no matter how big it was, so a 200px thumbnail
// in a list could pull a file of tens of MB out of Supabase Storage every time the list
// was shown — a major source of the project's egress. An original that lives in Supabase
// Storage is now only loaded as a thumbnail when it is small: its size is read first with
// a HEAD request (which downloads no file data). Larger originals leave the thumbnail
// blank; the link around it still opens the real file. Pass a different limit in bytes as
// the second argument, e.g. onerror="window.__thumbFallback(this, 300000)" for list rows.
// Files stored elsewhere (Google Drive, data: URIs) cost no Supabase egress and still
// fall back as before.
const SUPABASE_OBJECT_PATH = '/storage/v1/object/';
const DEFAULT_FALLBACK_MAX_BYTES = 2_000_000;

const fallbackSizes = new Map(); // original URL -> Promise<size in bytes, or null if unknown>

function originalSize(url) {
  if (!fallbackSizes.has(url)) {
    fallbackSizes.set(
      url,
      fetch(url, { method: 'HEAD' })
        .then((res) => (res.ok ? Number(res.headers.get('content-length')) || null : null))
        .catch(() => null),
    );
  }
  return fallbackSizes.get(url);
}

if (typeof window !== 'undefined' && !window.__thumbFallback) {
  window.__thumbFallback = async function thumbFallback(img, maxBytes = DEFAULT_FALLBACK_MAX_BYTES) {
    const fallback = img.dataset.fallback;
    if (!fallback || img.dataset.fallbackTried) {
      img.style.visibility = 'hidden';
      return;
    }
    img.dataset.fallbackTried = '1'; // never loop: the original itself may fail to load
    if (fallback.includes(SUPABASE_OBJECT_PATH)) {
      const size = await originalSize(fallback);
      // Unknown size counts as too big: never download blind.
      if (size === null || size > maxBytes) {
        img.style.visibility = 'hidden';
        img.title = 'Không có ảnh xem trước (file gốc quá lớn). Bấm để mở file gốc.';
        return;
      }
    }
    img.src = fallback;
  };
}

// Paints a loaded <img>'s src onto a background-image div instead (see
// designDetail.js `designFileSlotHtml`) — used so the on-page design-file
// preview has no "Save image as…" / "Open image in new tab" of its own to
// right-click: there's no visible <img>, only a div background, so every
// click/right-click on the preview only ever reaches the wrapping <a> (the
// real full-quality file), never the compressed preview resource directly.
// Wire up via: data-thumb-target="<id of the bg div>" onload="window.__thumbToBg(this)"
if (typeof window !== 'undefined' && !window.__thumbToBg) {
  window.__thumbToBg = function thumbToBg(img) {
    const targetId = img.dataset.thumbTarget;
    const target = targetId && document.getElementById(targetId);
    if (target) target.style.backgroundImage = `url("${img.src}")`;
  };
}
