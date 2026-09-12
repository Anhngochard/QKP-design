import { supabase } from './supabase.js';

// ID thư mục "QKP Design Files" trên Drive cá nhân của người dùng đã Authorize
// qua OAuth (xem supabase/functions/drive-token). Không phải thông tin bí mật —
// chỉ là nơi file sẽ được lưu vào.
const DRIVE_FOLDER_ID = '1-G0dGt0B9YFCkSFTrMJxV1FeGFFIZV31';

let cachedToken = null;
let cachedExpiry = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < cachedExpiry - 60_000) return cachedToken;
  const { data, error } = await supabase.functions.invoke('drive-token', { body: {} });
  if (error || !data?.access_token) {
    const detail = await error?.context?.json?.().catch(() => null);
    throw new Error(detail?.error || error?.message || 'Không lấy được quyền truy cập Google Drive.');
  }
  cachedToken = data.access_token;
  cachedExpiry = now + (data.expires_in || 3600) * 1000;
  return cachedToken;
}

// Uploads a File straight to the shared Google Drive folder, then makes it
// viewable by anyone with the link (matching how the old Supabase Storage
// public bucket worked) so the rest of the app can keep treating the result
// as just "a URL" for preview/download/share.
export async function uploadFileToDrive(file) {
  const accessToken = await getAccessToken();

  const metadata = { name: file.name, parents: [DRIVE_FOLDER_ID] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form },
  );
  if (!uploadRes.ok) throw new Error(`Lỗi upload lên Drive: ${await uploadRes.text()}`);
  const uploaded = await uploadRes.json();

  const permRes = await fetch(`https://www.googleapis.com/drive/v3/files/${uploaded.id}/permissions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });
  if (!permRes.ok) throw new Error(`Lỗi chia sẻ file trên Drive: ${await permRes.text()}`);

  return {
    id: uploaded.id,
    name: uploaded.name,
    // Dùng cho <img src>: "uc?export=view" bị Google chặn/redirect thất thường khi
    // hotlink (ảnh không hiện, hoặc ra trang cảnh báo virus-scan). "thumbnail" là
    // endpoint Google dùng để nhúng ảnh (Google Sites/Classroom...), ổn định hơn nhiều.
    url: `https://drive.google.com/thumbnail?id=${uploaded.id}&sz=w1000`,
    // Trang xem trước chuẩn của Drive — có nút Download riêng, luôn đúng tên file gốc.
    viewUrl: uploaded.webViewLink,
    provider: 'drive',
  };
}
