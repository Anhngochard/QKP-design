import { supabase } from './supabase.js';

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

// Returns { session, profile } — profile is null if not logged in.
export async function getSessionAndProfile() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { session: null, profile: null };
  try {
    const profile = await fetchProfile(session.user.id);
    return { session, profile };
  } catch {
    return { session, profile: null };
  }
}

export async function listProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function updateProfile(id, changes) {
  const { error } = await supabase.from('profiles').update(changes).eq('id', id);
  if (error) throw error;
}

// Calls the "create-user" Edge Function (holds the service role key server-side).
// See supabase/functions/create-user/index.ts and SETUP_ACCOUNTS.md for deployment.
export async function createAccount({ email, password, name, role }) {
  const { data, error } = await supabase.functions.invoke('create-user', {
    body: { email, password, name, role },
  });
  if (error) {
    // supabase-js wraps non-2xx responses in a generic error; try to surface our own message.
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(detail?.error || error.message || 'Tạo tài khoản thất bại.');
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
