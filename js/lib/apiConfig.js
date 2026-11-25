// Địa chỉ API (Cloudflare Worker trong thư mục worker/).
// Sau khi chạy `npx wrangler deploy`, dán địa chỉ nó in ra vào PRODUCTION_API_URL.
const PRODUCTION_API_URL = 'https://qkp-design-api.qkp-design-api.workers.dev';

const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);

// Chạy thử trên máy thì gọi Worker cục bộ (npm run dev trong worker/).
export const API_URL = isLocal ? 'http://127.0.0.1:8787' : PRODUCTION_API_URL;
export const isApiConfigured = !API_URL.includes('YOUR-SUBDOMAIN');
