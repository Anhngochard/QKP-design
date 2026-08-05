// Best-effort dominant-color detection for a mockup photo (e.g. the garment color),
// plus a small named-color lookup so we can suggest something human-readable even
// when there's no close match in the user's own Color Library. This is a heuristic
// (downsampled color histogram, white background excluded) — not exact, just a
// starting guess the user can override.

const NAMED_COLORS = [
  ['Black', '#000000'], ['White', '#ffffff'], ['Navy', '#1b2a4a'], ['Gray', '#808080'],
  ['Red', '#d32f2f'], ['Blue', '#1976d2'], ['Green', '#2e7d32'], ['Yellow', '#fbc02d'],
  ['Purple', '#7b1fa2'], ['Pink', '#e91e8c'], ['Orange', '#f57c00'], ['Brown', '#6d4c30'],
  ['Beige', '#e8dcc8'], ['Charcoal', '#36454f'], ['Maroon', '#800000'], ['Teal', '#008080'],
  ['Cream', '#f5ecd7'], ['Olive', '#556b2f'],
];

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

export function colorDistance(hexA, hexB) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

export function nearestNamedColor(hex) {
  let best = null;
  let bestDist = Infinity;
  for (const [name, h] of NAMED_COLORS) {
    const d = colorDistance(hex, h);
    if (d < bestDist) { bestDist = d; best = name; }
  }
  return best;
}

// imgEl must already be loaded (naturalWidth/Height available).
export function detectDominantColor(imgEl) {
  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imgEl, 0, 0, size, size);
  let data;
  try {
    data = ctx.getImageData(0, 0, size, size).data;
  } catch {
    return null; // canvas tainted by a cross-origin image without CORS headers
  }

  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 200) continue;
    if (r > 235 && g > 235 && b > 235) continue; // likely white studio background
    const key = `${Math.round(r / 16)}-${Math.round(g / 16)}-${Math.round(b / 16)}`;
    const bucket = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
    bucket.count++;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }

  let best = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.count > best.count) best = bucket;
  }
  if (!best) return null;

  const r = Math.round(best.r / best.count);
  const g = Math.round(best.g / best.count);
  const b = Math.round(best.b / best.count);
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve(img); URL.revokeObjectURL(url); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}
