-- QKP DESIGN — schema cho Cloudflare D1 (SQLite).
-- Giữ nguyên tên cột như bản Postgres cũ để front end không phải đổi cách đọc.
-- Cột JSON (mockup, file thiết kế, lịch sử…) lưu dạng TEXT; Worker tự đổi qua lại.

create table if not exists users (
  id text primary key,
  email text not null unique collate nocase,
  name text not null default '',
  role text not null default 'seller' check (role in ('admin', 'seller', 'designer')),
  is_active integer not null default 1,
  seller_id text,
  designer_id text,
  password_hash text,              -- null = chưa đặt mật khẩu, chưa đăng nhập được
  created_at text not null
);

create table if not exists sessions (
  token_hash text primary key,     -- SHA-256 của token; token gốc chỉ nằm ở trình duyệt
  user_id text not null,
  expires_at integer not null,     -- mili giây
  created_at integer not null
);
create index if not exists sessions_user on sessions (user_id);

create table if not exists login_attempts (
  email text primary key collate nocase,
  fails integer not null default 0,
  locked_until integer not null default 0
);

create table if not exists sellers (
  id text primary key,
  name text not null,
  email text,
  phone text,
  created_at text not null
);

create table if not exists designers (
  id text primary key,
  name text not null,
  email text,
  created_at text not null
);

create table if not exists colors (
  id text primary key,
  name text not null,
  hex text not null,
  created_at text not null
);

create table if not exists designs (
  id text primary key,
  name text not null,
  product text not null default '—',
  gender text not null default '—',
  size text not null default '—',
  color_name text not null default '—',
  seller_id text,
  designer_id text,
  status text not null default 'waiting_design'
    check (status in ('waiting_design', 'check_design', 'fix_design', 'support_customer', 'done')),
  priority text not null default 'Normal' check (priority in ('Low', 'Normal', 'High', 'Urgent')),
  due_date text,
  seller_notes text not null default '',
  designer_notes text not null default '',
  color_refs text not null default '[]',
  mockup_front text,
  mockup_back text,
  mockup_extra text not null default '[]',
  design_file_front text,
  design_file_back text,
  design_files_extra text not null default '[]',
  reused_from_id text,
  history text not null default '[]',
  created_at text not null
);
create index if not exists designs_created on designs (created_at);

create table if not exists short_links (
  code text primary key,
  target_url text not null unique,
  created_at text not null
);

-- Mỗi lần một bảng thay đổi thì số phiên bản tăng 1. Trình duyệt gửi kèm số
-- phiên bản nó đang giữ; nếu chưa đổi thì Worker trả lời "không có gì mới"
-- thay vì gửi lại cả bảng.
create table if not exists table_versions (
  name text primary key,
  version integer not null default 1
);
insert or ignore into table_versions (name) values ('sellers'), ('designers'), ('colors'), ('designs');
