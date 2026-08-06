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
