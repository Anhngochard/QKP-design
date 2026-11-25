// Nạp các file trong worker/export/ (do export-supabase.sh tạo) vào D1 qua Worker.
//   SETUP_TOKEN=... node tools/import.mjs https://qkp-design-api.<tên>.workers.dev
// Chạy lại nhiều lần vẫn an toàn: dòng đã có được ghi đè theo ID.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const api = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');
const token = process.env.SETUP_TOKEN;
if (!token) throw new Error('Thiếu biến môi trường SETUP_TOKEN.');
const dir = fileURLToPath(new URL('../export/', import.meta.url));

// Thứ tự: người và màu trước, design sau.
for (const table of ['sellers', 'designers', 'colors', 'profiles', 'designs', 'short_links']) {
  let text;
  try {
    text = await readFile(dir + table + '.jsonl', 'utf8');
  } catch {
    console.log(`${table}: không có file, bỏ qua`);
    continue;
  }
  const rows = text.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  // Design có lịch sử dài nên gửi ít dòng mỗi lần.
  const size = table === 'designs' ? 25 : 100;
  for (let i = 0; i < rows.length; i += size) {
    const res = await fetch(api + '/admin/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Setup-Token': token },
      body: JSON.stringify({ table, rows: rows.slice(i, i + size) }),
    });
    if (!res.ok) throw new Error(`${table} dòng ${i + 1}: ${res.status} ${await res.text()}`);
  }
  console.log(`${table}: ${rows.length} dòng`);
}
