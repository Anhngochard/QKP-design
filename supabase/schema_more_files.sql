-- Cho phép thêm nhiều ảnh mockup / file thiết kế hơn (ngoài Front & Back),
-- tối đa 10 ảnh mỗi bên, cộng dần từng cái một từ trang chi tiết task.
alter table public.designs
  add column if not exists design_files_extra jsonb not null default '[]';
