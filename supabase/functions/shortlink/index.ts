// Supabase Edge Function: shortlink
// Tự làm dịch vụ rút gọn link riêng (không phụ thuộc bên thứ 3) cho các file
// mockup/design lưu trên Supabase Storage, vì URL gốc quá dài để copy/dán chia sẻ.
//
// GET  /shortlink/<code>   -> tra bảng short_links, redirect 302 sang URL gốc.
//                             Không cần đăng nhập (link này có thể được dán ra ngoài
//                             cho xưởng in, khách hàng... xem trực tiếp).
// POST /shortlink  { url }  -> tạo (hoặc lấy lại nếu đã có) 1 short code cho url đó.
//                             Yêu cầu người gọi đang đăng nhập và tài khoản active,
//                             giống các Edge Function khác trong app.
//
// Deploy: dán nguyên file này vào Supabase Dashboard → Edge Functions → New function,
// đặt tên đúng là "shortlink". Xem SETUP_ACCOUNTS.md để biết chi tiết.

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function randomCode(len = 7) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  const code = last && last !== 'shortlink' ? last : '';

  if (req.method === 'GET' && code) {
    const { data } = await adminClient.from('short_links').select('target_url').eq('code', code).maybeSingle();
    if (!data) return new Response('Không tìm thấy link này.', { status: 404, headers: corsHeaders });
    return new Response(null, { status: 302, headers: { ...corsHeaders, Location: data.target_url } });
  }

  if (req.method === 'POST') {
    try {
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) throw new Error('Thiếu authorization header.');

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

      const { url: targetUrl } = await req.json();
      if (!targetUrl) throw new Error('Thiếu url.');

      const { data: existing } = await adminClient
        .from('short_links')
        .select('code')
        .eq('target_url', targetUrl)
        .maybeSingle();
      if (existing) {
        return new Response(JSON.stringify({ code: existing.code }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let newCode = '';
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = randomCode();
        const { error: insertErr } = await adminClient
          .from('short_links')
          .insert({ code: candidate, target_url: targetUrl });
        if (!insertErr) { newCode = candidate; break; }
      }
      if (!newCode) throw new Error('Không tạo được short link, thử lại.');

      return new Response(JSON.stringify({ code: newCode }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  return new Response('Not found', { status: 404, headers: corsHeaders });
});
