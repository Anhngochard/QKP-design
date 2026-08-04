// Small in-memory store for the currently authenticated user's profile,
// so any view can read the role without re-fetching from Supabase each time.
let currentProfile = null;

export function setCurrentProfile(profile) {
  currentProfile = profile;
}

export function getCurrentProfile() {
  return currentProfile;
}

export function isAdmin() {
  return currentProfile?.role === 'admin';
}

export function roleLabel(role) {
  if (role === 'admin') return 'Admin';
  if (role === 'seller') return 'Seller';
  if (role === 'designer') return 'Designer';
  return role || '—';
}
