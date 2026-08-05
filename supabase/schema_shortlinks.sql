-- Bảng lưu link rút gọn cho các file mockup/design (thay vì để lộ URL Supabase Storage
-- dài dằng dặc khi mở/copy link). Việc đọc/ghi bảng này chỉ đi qua Edge Function
-- "shortlink" bằng service role key — không cần policy RLS công khai nào khác.
create table if not exists public.short_links (
  code text primary key,
  target_url text not null unique,
  created_at timestamptz not null default now()
);

alter table public.short_links enable row level security;
