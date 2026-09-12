// Supabase Edge Function: drive-token
// Cấp một Google OAuth access token NGẮN HẠN (thường 1 giờ, chỉ có quyền
// "drive.file" — tạo/quản lý các file do chính app tạo ra) để trình duyệt của
// người dùng có thể upload file THẲNG lên Google Drive cá nhân, mà không bao
// giờ để lộ Client Secret / Refresh Token ra phía client.
//
// Cách hoạt động: đổi Refresh Token (lấy 1 lần qua OAuth Playground, chỉ tồn
// tại trong các biến môi trường bí mật của function này, không nằm trong code)
// lấy Access Token mới từ Google mỗi lần được gọi, rồi trả token đó (không
// phải refresh token) về cho người dùng đang đăng nhập hợp lệ.
//
// Deploy: dán nguyên file này vào Supabase Dashboard → Edge Functions →
// function "drive-token" (ghi đè bản cũ). Sau đó vào Project Settings →
// Edge Functions → Secrets, thêm 3 secret:
//   GOOGLE_OAUTH_CLIENT_ID     = Client ID đã tạo ở Google Cloud Console
//   GOOGLE_OAUTH_CLIENT_SECRET = Client secret tương ứng
//   GOOGLE_OAUTH_REFRESH_TOKEN = Refresh token lấy được từ OAuth Playground
// (Secret GOOGLE_SERVICE_ACCOUNT_JSON cũ không còn dùng, có thể xoá.)

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getGoogleAccessToken(clientId: string, clientSecret: string, refreshToken: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`);
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Thiếu authorization header.');

    // Chỉ phát token cho người dùng đang đăng nhập & tài khoản đang hoạt động —
    // giống mọi Edge Function khác trong app.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !user) throw new Error('Phiên đăng nhập không hợp lệ.');
    const { data: profile, error: profileErr } = await callerClient
      .from('profiles')
      .select('is_active')
      .eq('id', user.id)
      .single();
    if (profileErr || !profile?.is_active) throw new Error('Tài khoản không hoạt động.');

    const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET');
    const refreshToken = Deno.env.get('GOOGLE_OAUTH_REFRESH_TOKEN');
    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error('Chưa cấu hình đủ GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_OAUTH_REFRESH_TOKEN.');
    }

    const token = await getGoogleAccessToken(clientId, clientSecret, refreshToken);

    return new Response(JSON.stringify(token), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
