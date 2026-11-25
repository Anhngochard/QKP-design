import { API_URL } from './apiConfig.js';

const TOKEN_KEY = 'qkp_session_token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // trình duyệt chặn localStorage: phiên chỉ sống đến khi tải lại trang
  }
}

// Gọi API và trả về JSON. Lỗi được ném ra dạng Error có message tiếng Việt từ
// server, kèm .status và .code.
export async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(API_URL + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new Error('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error(data?.error || `Lỗi máy chủ (${res.status}).`);
    error.status = res.status;
    error.code = data?.code;
    // Phiên hết hạn hoặc tài khoản bị khoá giữa chừng: quay về màn hình đăng nhập.
    if (token && (error.code === 'NO_SESSION' || error.code === 'LOCKED')) {
      setToken(null);
      window.dispatchEvent(new CustomEvent('session-ended', { detail: { locked: error.code === 'LOCKED' } }));
    }
    throw error;
  }
  return data;
}
