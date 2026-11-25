#!/bin/sh
# Lấy dữ liệu ra khỏi Supabase thành các file JSON (mỗi dòng một bản ghi) trong worker/export/.
# Cần chuỗi kết nối Postgres của dự án: Supabase Dashboard → Connect → Direct → "Session pooler"
# (dạng postgresql://postgres.xxxx@aws-…pooler.supabase.com:5432/postgres), KHÔNG kèm mật khẩu.
# psql hỏi mật khẩu database một lần.
#
#   sh tools/export-supabase.sh "postgresql://postgres.xxxx@aws-1-…pooler.supabase.com:5432/postgres"
set -eu
URL="${1:?Thiếu chuỗi kết nối Postgres của Supabase}"
PSQL="${PSQL:-/Applications/Postgres.app/Contents/Versions/latest/bin/psql}"
[ -x "$PSQL" ] || PSQL=psql
OUT="$(cd "$(dirname "$0")/.." && pwd)/export"
mkdir -p "$OUT"
SQL="$OUT/.export.sql"
: > "$SQL"
for TABLE in profiles sellers designers colors designs short_links; do
  printf '\\o %s.jsonl\nselect row_to_json(t) from public.%s t;\n' "$TABLE" "$TABLE" >> "$SQL"
done
# chạy trong thư mục export để tên file không dính dấu cách của đường dẫn
(cd "$OUT" && "$PSQL" "$URL" -At -v ON_ERROR_STOP=1 -f .export.sql)
rm -f "$SQL"
for TABLE in profiles sellers designers colors designs short_links; do
  echo "$TABLE: $(wc -l < "$OUT/$TABLE.jsonl" | tr -d ' ') dòng"
done
