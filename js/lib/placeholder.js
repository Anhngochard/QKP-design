// Generates inline SVG placeholder images (data URLs) so the demo works with zero external assets.
export function placeholderImg(text, { w = 400, h = 400, bg = '#efeafc', fg = '#5a49b8' } = {}) {
  const safe = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="100%" height="100%" fill="${bg}"/>
    <text x="50%" y="50%" font-family="Helvetica, Arial, sans-serif" font-size="${Math.round(w / 9)}"
      fill="${fg}" text-anchor="middle" dominant-baseline="middle" font-weight="700">${safe}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
