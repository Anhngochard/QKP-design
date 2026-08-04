-- POD Design Manager — Account & Access Control schema
-- Chạy toàn bộ file này trong Supabase Dashboard → SQL Editor → New query → Run.

-- 1. Bảng hồ sơ người dùng (gắn với auth.users của Supabase Auth)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  role text not null default 'seller' check (role in ('admin', 'seller', 'designer')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2. Tự động tạo hồ sơ (role mặc định = seller) mỗi khi Admin tạo tài khoản mới
--    trong Dashboard → Authentication → Users → Add user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. Hàm kiểm tra "tôi có phải admin đang hoạt động không" — dùng security definer
--    để tránh lỗi đệ quy vô hạn khi policy tự tham chiếu bảng profiles.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active = true
  );
$$;

-- 4. Bật Row Level Security — đây là lớp bảo mật THẬT, chặn ở tầng database
--    chứ không phải chỉ ẩn giao diện.
alter table public.profiles enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "admin read all profiles" on public.profiles;
create policy "admin read all profiles"
  on public.profiles for select
  using (public.is_admin());

drop policy if exists "admin update all profiles" on public.profiles;
create policy "admin update all profiles"
  on public.profiles for update
  using (public.is_admin());

-- 5. (Tuỳ chọn nhưng khuyên dùng) Tạo sẵn 1 tài khoản Admin đầu tiên:
--    Vào Authentication → Users → Add user, tạo email/mật khẩu cho chính bạn.
--    Sau đó chạy lệnh dưới đây (đổi email cho đúng) để nâng quyền admin cho tài khoản đó:
--
--    update public.profiles set role = 'admin', name = 'Tên của bạn'
--    where email = 'ban@example.com';
