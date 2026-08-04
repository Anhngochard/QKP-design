import { supabase } from './supabase.js';

const BUCKET = 'design-assets';

// Uploads a real file to Supabase Storage and returns a persistent public URL.
export async function uploadFile(file, folder = 'misc') {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}
