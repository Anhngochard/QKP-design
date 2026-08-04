// Perceptual "difference hash" (dHash) — lets the app recognize when an
// uploaded mockup image is the same (or near-identical) picture as one
// already stored on another design, even if the file name/size differs.
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // needed to read pixels back from Supabase Storage URLs without tainting the canvas
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function computeImageHash(dataUrl) {
  const img = await loadImage(dataUrl);
  const w = 9;
  const h = 8;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const gray = [];
  for (let i = 0; i < data.length; i += 4) {
    gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }

  let bits = '';
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w - 1; col++) {
      const left = gray[row * w + col];
      const right = gray[row * w + col + 1];
      bits += left < right ? '1' : '0';
    }
  }

  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4).padEnd(4, '0'), 2).toString(16);
  }
  return hex;
}

export function hammingDistanceHex(hexA, hexB) {
  if (!hexA || !hexB || hexA.length !== hexB.length) return Infinity;
  let dist = 0;
  for (let i = 0; i < hexA.length; i++) {
    let x = parseInt(hexA[i], 16) ^ parseInt(hexB[i], 16);
    while (x) { dist += x & 1; x >>= 1; }
  }
  return dist;
}

// Out of 64 bits — anything at or below this is treated as "the same picture".
export const DUPLICATE_THRESHOLD = 10;
