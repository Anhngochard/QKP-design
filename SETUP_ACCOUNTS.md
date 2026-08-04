# Thiết lập tài khoản, dữ liệu dùng chung & bảo mật (Supabase)

App dùng [Supabase](https://supabase.com) (miễn phí) làm backend thật cho **mọi thứ**: đăng nhập (mật khẩu mã hoá, kiểm tra ở server, khoá tài khoản là mất quyền ngay lập tức), và toàn bộ dữ liệu design/seller/designer/color/file — dùng chung cho cả team, không còn giới hạn theo từng trình duyệt.

## Bước 1 — Tạo project Supabase (miễn phí)

1. Vào [supabase.com](https://supabase.com) → **Start your project** → đăng ký tài khoản (free).
2. Bấm **New Project**, đặt tên (vd: `pod-design-manager`), đặt mật khẩu database (tự chọn, lưu lại), chọn region gần bạn.
3. Đợi ~2 phút để project khởi tạo xong.

## Bước 2 — Chạy SQL thiết lập bảng tài khoản

1. Vào project vừa tạo → menu bên trái chọn **SQL Editor** → **New query**.
2. Copy toàn bộ nội dung file [`supabase/schema.sql`](supabase/schema.sql) trong repo này, dán vào và bấm **Run**.
3. File này tạo bảng `profiles` (role: admin/seller/designer, cờ `is_active` để khoá tài khoản) và tự động sinh hồ sơ mỗi khi có tài khoản mới.

## Bước 2b — Chạy SQL thiết lập dữ liệu design dùng chung

1. Mở **New query** khác trong SQL Editor.
2. Copy toàn bộ nội dung file [`supabase/schema_data.sql`](supabase/schema_data.sql), dán vào và bấm **Run**.
3. File này tạo các bảng `sellers`, `designers`, `colors`, `designs` (dùng chung cho cả team) và bucket lưu trữ **`design-assets`** cho mockup/file thiết kế thật — chỉ tài khoản đang active mới đọc/ghi được (RLS).

## Bước 3 — Tắt tự đăng ký (chỉ Admin được tạo tài khoản)

1. Vào **Authentication → Providers → Email**.
2. Tắt **"Allow new users to sign up"**.
3. Việc này đảm bảo không ai tự tạo tài khoản qua API được — chỉ Admin tạo bằng tay ở bước 4.

## Bước 4 — Tạo tài khoản Admin đầu tiên (chính bạn)

1. Vào **Authentication → Users → Add user → Create new user**.
2. Nhập email + mật khẩu cho chính bạn, bỏ tick "Auto Confirm User" nếu muốn xác nhận qua email, hoặc tick để dùng luôn ngay.
3. Quay lại **SQL Editor**, chạy lệnh (đổi email cho đúng):
   ```sql
   update public.profiles set role = 'admin', name = 'Tên của bạn'
   where email = 'ban@example.com';
   ```
4. Từ giờ tài khoản này đăng nhập vào app sẽ thấy trang **"Manage Accounts"** để tạo/khoá tài khoản cho Seller & Designer khác (đặt role, bật/tắt `is_active`).

## Bước 5 — Lấy Project URL & anon key, gắn vào app

1. Vào **Project Settings → API**.
2. Copy **Project URL** và **anon public key** (đây là key an toàn để lộ ở phía trình duyệt, không phải mật khẩu).
3. Mở file `js/lib/supabaseConfig.js` trong repo, điền 2 giá trị đó vào.

## Bước 6 — (Tuỳ chọn) Deploy Edge Function để tạo tài khoản ngay trong app

Nếu muốn Admin tạo tài khoản trực tiếp trong trang "Manage Accounts" thay vì phải mở Supabase Dashboard mỗi lần:

1. Vào Supabase Dashboard → menu bên trái chọn **Edge Functions**.
2. Bấm **Deploy a new function** (hoặc **Create a new function**) → đặt tên chính xác là `create-user`.
3. Mở file [`supabase/functions/create-user/index.ts`](supabase/functions/create-user/index.ts) trong repo, copy toàn bộ nội dung, dán đè vào trình soạn code trên Dashboard.
4. Bấm **Deploy**. Không cần cài gì thêm trên máy — function này tự động có sẵn `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` do Supabase cung cấp, bạn **không cần** và **không nên** tự dán service role key vào đâu cả.
5. Xong — quay lại app, trang **Manage Accounts** sẽ có form "Tạo tài khoản mới" hoạt động ngay.

Nếu bỏ qua bước này, Admin vẫn tạo được tài khoản bình thường qua **Supabase Dashboard → Authentication → Users → Add user** như Bước 4, chỉ là phải làm ở ngoài app.

## Quy trình khi nhân viên nghỉ việc

- Cách nhanh (khoá tạm/khoá vĩnh viễn qua app): Admin vào **Manage Accounts** trong app, tắt **Active** của tài khoản đó. Toàn bộ truy vấn dữ liệu của họ bị chặn ngay ở tầng database (RLS), phiên đăng nhập hiện tại của họ cũng bị từ chối ở lần gọi tiếp theo.
- Cách khoá tức thời triệt để nhất (huỷ mọi phiên đang đăng nhập ngay lập tức): vào Supabase Dashboard → **Authentication → Users** → chọn tài khoản → **Delete user** (hoặc Ban).
