// Supabase Edge Function: create-user
// Chạy phía server của Supabase — đây là nơi DUY NHẤT được phép dùng service role key.
// Không copy đoạn service role key vào bất kỳ file nào trong thư mục js/ (phía trình duyệt).
//
// Việc function làm:
//  1. Xác minh người gọi API này đang đăng nhập VÀ có role 'admin' đang active.
//  2. Nếu hợp lệ, dùng service role key tạo tài khoản Supabase Auth mới (email + mật khẩu).
//  3. Cập nhật đúng role/tên cho hồ sơ (bảng profiles) vừa được trigger tự tạo.
//  4. Nếu role là 'seller'/'designer', tự tạo luôn 1 dòng tương ứng trong bảng
//     sellers/designers và liên kết vào profiles.seller_id / designer_id — để khi
//     người đó đăng nhập, app tự nhận diện họ là seller/designer nào.
//
// Deploy: xem hướng dẫn trong SETUP_ACCOUNTS.md (dán nguyên file này vào
// Supabase Dashboard → Edge Functions → New function, đặt tên "create-user").

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Thiếu authorization header.');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Client mang JWT của người gọi — chỉ dùng để xác minh danh tính + role, không có quyền admin.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !user) throw new Error('Phiên đăng nhập không hợp lệ.');

    const { data: callerProfile, error: profileErr } = await callerClient
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .single();

    if (profileErr || !callerProfile || callerProfile.role !== 'admin' || !callerProfile.is_active) {
      throw new Error('Chỉ Admin đang hoạt động mới được tạo tài khoản.');
    }

    const { email, password, name, role } = await req.json();
    if (!email || !password) throw new Error('Thiếu email hoặc mật khẩu.');
    if (password.length < 6) throw new Error('Mật khẩu cần tối thiểu 6 ký tự.');
    if (!['admin', 'seller', 'designer'].includes(role)) throw new Error('Vai trò không hợp lệ.');

    // Client dùng service role key — CHỈ tồn tại trong môi trường server này.
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });
    if (createErr) throw createErr;

    // Trigger on_auth_user_created đã tự sinh 1 dòng profiles với role mặc định 'seller' —
    // cập nhật lại đúng role/tên do Admin chọn.
    const finalName = name || email.split('@')[0];
    const { error: updateErr } = await adminClient
      .from('profiles')
      .update({ role, name: finalName })
      .eq('id', created.user.id);
    if (updateErr) throw updateErr;

    // Tự tạo + liên kết hồ sơ Seller/Designer tương ứng để app tự nhận diện sau này.
    if (role === 'seller') {
      const { data: sellerRow, error: sellerErr } = await adminClient
        .from('sellers')
        .insert({ name: finalName, email })
        .select()
        .single();
      if (sellerErr) throw sellerErr;
      await adminClient.from('profiles').update({ seller_id: sellerRow.id }).eq('id', created.user.id);
    } else if (role === 'designer') {
      const { data: designerRow, error: designerErr } = await adminClient
        .from('designers')
        .insert({ name: finalName, email })
        .select()
        .single();
      if (designerErr) throw designerErr;
      await adminClient.from('profiles').update({ designer_id: designerRow.id }).eq('id', created.user.id);
    }

    return new Response(JSON.stringify({ ok: true, id: created.user.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
