// Generates inline SVG placeholder images (data URLs) so the demo works with zero external assets.
export function placeholderImg(text, { w = 400, h = 400, bg = '#efeafc', fg = '#5a49b8' } = {}) {
  const safe = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  // Shrink the font when the label is long so it never overflows/gets clipped by the canvas.
  const maxTextWidth = w * 0.86;
  const avgCharWidthRatio = 0.62;
  let fontSize = Math.round(w / 9);
  const estWidth = safe.length * fontSize * avgCharWidthRatio;
  if (estWidth > maxTextWidth) {
    fontSize = Math.max(14, Math.floor(maxTextWidth / (safe.length * avgCharWidthRatio)));
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="100%" height="100%" fill="${bg}"/>
    <text x="50%" y="50%" font-family="Helvetica, Arial, sans-serif" font-size="${fontSize}"
      fill="${fg}" text-anchor="middle" dominant-baseline="middle" font-weight="700">${safe}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
