import { supabase } from './supabase.js';
import { SUPABASE_URL } from './supabaseConfig.js';

const cache = new Map();

// Resolves a long Supabase Storage URL to a short, shareable link via the
// "shortlink" Edge Function. Falls back to the original URL if the function
// isn't deployed yet or the call fails, so this never blocks the user's click.
export async function getShortLink(targetUrl) {
  if (!targetUrl) return targetUrl;
  if (cache.has(targetUrl)) return cache.get(targetUrl);
  try {
    const { data, error } = await supabase.functions.invoke('shortlink', { body: { url: targetUrl } });
    if (error || !data?.code) return targetUrl;
    const short = `${SUPABASE_URL}/functions/v1/shortlink/${data.code}`;
    cache.set(targetUrl, short);
    return short;
  } catch {
    return targetUrl;
  }
}
