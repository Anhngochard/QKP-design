-- POD Design Manager — Shared data schema (sellers, designers, colors, designs)
-- Chạy file này SAU khi đã chạy supabase/schema.sql (bảng profiles).
-- Dán toàn bộ vào Supabase Dashboard → SQL Editor → New query → Run.

-- 1. Bảng seller / designer / color library — giữ nguyên cấu trúc như trước, dùng chung cho cả team.
create table if not exists public.sellers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists public.designers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.colors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  hex text not null,
  created_at timestamptz not null default now()
);

-- 2. Bảng design task chính. Mockup/file thiết kế lưu dạng jsonb {name,size,type,dataUrl,uploadedAt,path}
--    trong đó "dataUrl" là URL thật trỏ tới Supabase Storage (không còn là base64).
create table if not exists public.designs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  product text not null default '—',
  gender text not null default '—',
  size text not null default '—',
  color_name text not null default '—',
  seller_id uuid references public.sellers(id) on delete set null,
  designer_id uuid references public.designers(id) on delete set null,
  status text not null default 'waiting_design'
    check (status in ('waiting_design', 'check_design', 'fix_design', 'support_customer', 'done')),
  priority text not null default 'Normal' check (priority in ('Low', 'Normal', 'High', 'Urgent')),
  due_date timestamptz,
  seller_notes text not null default '',
  designer_notes text not null default '',
  color_refs jsonb not null default '[]',
  mockup_front jsonb,
  mockup_back jsonb,
  mockup_extra jsonb not null default '[]',
  design_file_front jsonb,
  design_file_back jsonb,
  reused_from_id uuid references public.designs(id) on delete set null,
  history jsonb not null default '[]',
  created_at timestamptz not null default now()
);

-- 3. RLS — chỉ tài khoản đã đăng nhập VÀ đang active mới đọc/ghi được (tận dụng lại bảng
--    profiles + is_active đã tạo ở schema.sql). Đây là lớp chặn thật ở tầng database.
create or replace function public.is_active_user()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and is_active = true
  );
$$;

alter table public.sellers enable row level security;
alter table public.designers enable row level security;
alter table public.colors enable row level security;
alter table public.designs enable row level security;

drop policy if exists "active users full access" on public.sellers;
create policy "active users full access" on public.sellers
  for all using (public.is_active_user()) with check (public.is_active_user());

drop policy if exists "active users full access" on public.designers;
create policy "active users full access" on public.designers
  for all using (public.is_active_user()) with check (public.is_active_user());

drop policy if exists "active users full access" on public.colors;
create policy "active users full access" on public.colors
  for all using (public.is_active_user()) with check (public.is_active_user());

drop policy if exists "active users full access" on public.designs;
create policy "active users full access" on public.designs
  for all using (public.is_active_user()) with check (public.is_active_user());

-- 4. Storage bucket cho mockup & file thiết kế thật (PNG/PSD/AI/PDF...).
--    Bucket public = true để đơn giản hoá việc hiển thị ảnh/tải file (đường dẫn file là
--    UUID ngẫu nhiên nên không đoán được, nhưng KHÔNG phải private tuyệt đối). Nếu cần
--    riêng tư tuyệt đối (signed URL hết hạn), báo lại để nâng cấp sau.
insert into storage.buckets (id, name, public)
values ('design-assets', 'design-assets', true)
on conflict (id) do nothing;

drop policy if exists "active users manage design-assets" on storage.objects;
create policy "active users manage design-assets" on storage.objects
  for all
  using (bucket_id = 'design-assets' and public.is_active_user())
  with check (bucket_id = 'design-assets' and public.is_active_user());

drop policy if exists "public read design-assets" on storage.objects;
create policy "public read design-assets" on storage.objects
  for select
  using (bucket_id = 'design-assets');
