# QKP DESIGN API (Cloudflare Worker + D1)

Phần máy chủ của app, thay cho Supabase: đăng nhập và phân quyền, dữ liệu, tạo tài khoản, token Google Drive, link rút gọn. File vẫn nằm trên Google Drive.

## Chạy thử trên máy

```bash
cd worker
npm install
npm run migrate:local
npm run dev            # API ở http://127.0.0.1:8787
```

Ở thư mục gốc, mở trang bằng một server tĩnh, ví dụ `python3 -m http.server 5173`, rồi vào http://127.0.0.1:5173. Khi chạy ở localhost, trang tự gọi API cục bộ. Mã thiết lập cục bộ nằm trong `worker/.dev.vars` (dòng `SETUP_TOKEN=...`, không đưa lên git).

## Đưa lên Cloudflare (gói Free)

1. Tạo tài khoản Cloudflare, rồi đăng nhập công cụ: `npx wrangler login`
2. Tạo database: `npx wrangler d1 create qkp-design`, dán `database_id` nó in ra vào `wrangler.jsonc`
3. Tạo bảng: `npm run migrate:remote`
4. Đặt bí mật (mỗi lệnh hỏi giá trị, không lưu vào code):
   - `npx wrangler secret put SETUP_TOKEN` — tự nghĩ một chuỗi dài ngẫu nhiên, chỉ dùng trong lúc thiết lập
   - `npx wrangler secret put GOOGLE_OAUTH_CLIENT_ID`
   - `npx wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET`
   - `npx wrangler secret put GOOGLE_OAUTH_REFRESH_TOKEN`
5. `npx wrangler deploy`, dán địa chỉ `https://qkp-design-api.….workers.dev` vào `js/lib/apiConfig.js`
6. Nếu trang không chạy ở `https://anhngochard.github.io`, sửa `ALLOWED_ORIGINS` trong `wrangler.jsonc`

## Chuyển dữ liệu từ Supabase

```bash
sh tools/export-supabase.sh "postgresql://postgres.xxxx@aws-…pooler.supabase.com:5432/postgres"
SETUP_TOKEN=... node tools/import.mjs https://qkp-design-api.….workers.dev
```

- Chuỗi kết nối lấy ở Supabase Dashboard → Connect (Session pooler); `psql` hỏi mật khẩu database một lần.
- Mật khẩu đăng nhập cũ không chuyển sang được. Sau khi nhập dữ liệu, ở màn hình đăng nhập bấm **Đặt mật khẩu bằng mã thiết lập** để đặt mật khẩu cho tài khoản Admin; Admin đặt lại mật khẩu cho người khác ở **Manage Accounts**.
- Link rút gọn cũ (địa chỉ `…supabase.co/functions/v1/shortlink/…`) không còn dùng được; mã cũ vẫn mở được ở địa chỉ mới `…workers.dev/s/<mã>`.
- Xong thì tắt chế độ thiết lập: `npx wrangler secret delete SETUP_TOKEN`

## API

| Đường dẫn | Tác dụng |
|---|---|
| `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` | Đăng nhập, đăng xuất, tài khoản hiện tại |
| `POST /auth/password` | Tự đổi mật khẩu |
| `POST /auth/setup-password` | Đặt mật khẩu bằng `SETUP_TOKEN` |
| `GET/PUT/DELETE /api/{sellers,designers,colors,designs}[/:id]` | Dữ liệu; cần tài khoản đang hoạt động |
| `GET/POST /api/profiles`, `PATCH /api/profiles/:id`, `POST /api/profiles/:id/password` | Quản lý tài khoản; chỉ Admin |
| `POST /api/drive-token` | Token Google Drive ngắn hạn |
| `POST /api/shortlink`, `GET /s/:code` | Tạo và mở link rút gọn |
| `POST /admin/import` | Nhập dữ liệu; cần `SETUP_TOKEN` |

Phiên đăng nhập sống 30 ngày. Sai mật khẩu 8 lần liên tiếp thì email đó bị chặn 15 phút.
