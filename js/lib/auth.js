import { api, getToken, setToken } from './api.js';

export async function signIn(email, password) {
  const data = await api('/auth/login', { method: 'POST', body: { email, password } });
  setToken(data.token);
  return data;
}

export async function signOut() {
  if (getToken()) await api('/auth/logout', { method: 'POST' }).catch(() => {});
  setToken(null);
}

// Returns { session, profile } — both null if not logged in.
export async function getSessionAndProfile() {
  if (!getToken()) return { session: null, profile: null };
  try {
    const { profile } = await api('/auth/me');
    return { session: { user: { id: profile.id } }, profile };
  } catch (err) {
    // Chỉ coi là "chưa đăng nhập" khi server nói vậy; lỗi mạng thì báo ra.
    if (err.code === 'NO_SESSION') return { session: null, profile: null };
    throw err;
  }
}

export function listProfiles() {
  return api('/api/profiles');
}

export async function updateProfile(id, changes) {
  await api(`/api/profiles/${id}`, { method: 'PATCH', body: changes });
}

// Chỉ Admin gọi được (server kiểm tra).
export function createAccount({ email, password, name, role }) {
  return api('/api/profiles', { method: 'POST', body: { email, password, name, role } });
}

export function resetPassword(id, password) {
  return api(`/api/profiles/${id}/password`, { method: 'POST', body: { password } });
}

// Đặt mật khẩu bằng mã thiết lập (SETUP_TOKEN của Worker) khi chưa đăng nhập được.
export function setupPassword({ email, password, setupToken }) {
  return api('/auth/setup-password', { method: 'POST', body: { email, password, setup_token: setupToken } });
}
