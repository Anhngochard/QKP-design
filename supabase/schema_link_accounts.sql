-- Liên kết tài khoản đăng nhập (profiles) với hồ sơ Seller / Designer tương ứng,
-- để app tự nhận diện "tôi là seller nào" mà không cần chọn tay mỗi lần.
-- Chạy SAU khi đã có schema.sql và schema_data.sql.

alter table public.profiles
  add column if not exists seller_id uuid references public.sellers(id) on delete set null,
  add column if not exists designer_id uuid references public.designers(id) on delete set null;
