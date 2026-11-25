import { api } from './api.js';
import { API_URL } from './apiConfig.js';

const cache = new Map();

// Resolves a long file URL to a short, shareable link via the API. Falls back
// to the original URL if the call fails, so this never blocks the user's click.
export async function getShortLink(targetUrl) {
  if (!targetUrl) return targetUrl;
  if (cache.has(targetUrl)) return cache.get(targetUrl);
  try {
    const data = await api('/api/shortlink', { method: 'POST', body: { url: targetUrl } });
    if (!data?.code) return targetUrl;
    const short = `${API_URL}/s/${data.code}`;
    cache.set(targetUrl, short);
    return short;
  } catch {
    return targetUrl;
  }
}
