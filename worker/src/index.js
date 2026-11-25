// QKP DESIGN API — Cloudflare Worker + D1.
// Thay cho Supabase: đăng nhập và phân quyền, dữ liệu (sellers, designers, colors,
// designs), tạo tài khoản, cấp token Google Drive, link rút gọn.
//
// Bí mật (đặt bằng `wrangler secret put`, không nằm trong code):
//   GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN
//   SETUP_TOKEN — chỉ cần trong lúc thiết lập: cho phép nhập dữ liệu và đặt mật
//                 khẩu khi chưa ai đăng nhập được. Xong thì xoá secret này đi.

const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 100_000; // mức tối đa Workers cho phép
const MAX_FAILS = 8;
const LOCK_MS = 15 * 60_000;
const ROLES = ['admin', 'seller', 'designer'];

const TABLES = {
  sellers: { cols: ['name', 'email', 'phone'], required: ['name'] },
  designers: { cols: ['name', 'email'], required: ['name'] },
  colors: { cols: ['name', 'hex'], required: ['name', 'hex'] },
  designs: {
    cols: [
      'name', 'product', 'gender', 'size', 'color_name', 'seller_id', 'designer_id', 'status', 'priority',
      'due_date', 'seller_notes', 'designer_notes', 'color_refs', 'mockup_front', 'mockup_back', 'mockup_extra',
      'design_file_front', 'design_file_back', 'design_files_extra', 'reused_from_id', 'history',
    ],
    required: ['name'],
    json: ['color_refs', 'mockup_front', 'mockup_back', 'mockup_extra', 'design_file_front', 'design_file_back', 'design_files_extra', 'history'],
    defaults: {
      product: '—', gender: '—', size: '—', color_name: '—', status: 'waiting_design', priority: 'Normal',
      seller_notes: '', designer_notes: '', color_refs: [], mockup_extra: [], design_files_extra: [], history: [],
    },
    enums: {
      status: ['waiting_design', 'check_design', 'fix_design', 'support_customer', 'done'],
      priority: ['Low', 'Normal', 'High', 'Urgent'],
    },
  },
};

const USER_FIELDS = 'id, email, name, role, is_active, seller_id, designer_id, created_at';

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// ---------- tiện ích ----------

const nowIso = () => new Date().toISOString();
const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const b64url = (bytes) => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function sha256(text) {
  return b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

// So sánh không lộ thời gian: băm hai bên rồi mới so.
async function safeEqual(a, b) {
  const [x, y] = await Promise.all([sha256(String(a)), sha256(String(b))]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(await pbkdf2(password, salt, PBKDF2_ITERATIONS))}`;
}

async function verifyPassword(password, stored) {
  const [scheme, iterations, salt, hash] = String(stored || '').split('$');
  if (scheme !== 'pbkdf2' || !hash) return false;
  return safeEqual(b64(await pbkdf2(password, unb64(salt), Number(iterations))), hash);
}

function checkPassword(password) {
  if (typeof password !== 'string' || password.length < 6) throw new HttpError(400, 'Mật khẩu cần tối thiểu 6 ký tự.');
  if (password.length > 200) throw new HttpError(400, 'Mật khẩu quá dài.');
}

const publicUser = (row) => row && { ...row, is_active: !!row.is_active };

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const isLocal = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, x-setup-token',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (isLocal || allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

async function readJson(request) {
  try {
    return (await request.json()) || {};
  } catch {
    throw new HttpError(400, 'Dữ liệu gửi lên không hợp lệ.');
  }
}

// ---------- đăng nhập ----------

async function currentUser(request, env) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Chưa đăng nhập.', 'NO_SESSION');
  const tokenHash = await sha256(token);
  const user = await env.DB.prepare(
    `select ${USER_FIELDS.split(', ').map((f) => 'u.' + f).join(', ')}
     from sessions s join users u on u.id = s.user_id
     where s.token_hash = ? and s.expires_at > ?`,
  ).bind(tokenHash, Date.now()).first();
  if (!user) throw new HttpError(401, 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'NO_SESSION');
  return { user: publicUser(user), tokenHash };
}

async function requireActive(request, env) {
  const { user } = await currentUser(request, env);
  if (!user.is_active) throw new HttpError(403, 'Tài khoản đã bị khoá.', 'LOCKED');
  return user;
}

async function requireAdmin(request, env) {
  const user = await requireActive(request, env);
  if (user.role !== 'admin') throw new HttpError(403, 'Chỉ Admin mới làm được việc này.');
  return user;
}

async function requireSetupToken(request, env, given) {
  if (!env.SETUP_TOKEN) throw new HttpError(403, 'Chế độ thiết lập đang tắt (chưa đặt SETUP_TOKEN).');
  const token = given ?? request.headers.get('X-Setup-Token') ?? '';
  if (!(await safeEqual(token, env.SETUP_TOKEN))) throw new HttpError(403, 'Mã thiết lập không đúng.');
}

async function assertNotLocked(env, key) {
  const row = await env.DB.prepare('select locked_until from login_attempts where email = ?').bind(key).first();
  if (row && row.locked_until > Date.now()) {
    const minutes = Math.ceil((row.locked_until - Date.now()) / 60_000);
    throw new HttpError(429, `Thử sai quá nhiều lần. Hãy thử lại sau ${minutes} phút.`);
  }
}

async function recordFail(env, key) {
  await env.DB.prepare(
    `insert into login_attempts (email, fails, locked_until) values (?1, 1, 0)
     on conflict (email) do update set
       fails = case when fails + 1 >= ?2 then 0 else fails + 1 end,
       locked_until = case when fails + 1 >= ?2 then ?3 else locked_until end`,
  ).bind(key, MAX_FAILS, Date.now() + LOCK_MS).run();
}

const clearFails = (env, key) => env.DB.prepare('delete from login_attempts where email = ?').bind(key).run();

async function login(request, env) {
  const { email, password } = await readJson(request);
  const key = String(email || '').trim().toLowerCase();
  if (!key || !password) throw new HttpError(400, 'Hãy nhập email và mật khẩu.');
  await assertNotLocked(env, key);

  const row = await env.DB.prepare(`select ${USER_FIELDS}, password_hash from users where email = ?`).bind(key).first();
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    await recordFail(env, key);
    throw new HttpError(401, 'Sai email hoặc mật khẩu.');
  }
  await clearFails(env, key);
  if (!row.is_active) throw new HttpError(403, '🔒 Tài khoản của bạn đã bị khoá. Vui lòng liên hệ Admin.', 'LOCKED');

  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('delete from sessions where expires_at < ?').bind(now),
    env.DB.prepare('insert into sessions (token_hash, user_id, expires_at, created_at) values (?, ?, ?, ?)')
      .bind(await sha256(token), row.id, now + SESSION_DAYS * 86_400_000, now),
  ]);
  const { password_hash: _hidden, ...profile } = row;
  return { token, profile: publicUser(profile) };
}

// Đặt mật khẩu bằng mã thiết lập — dùng khi chưa ai đăng nhập được (vừa chuyển
// dữ liệu sang, hoặc Admin quên mật khẩu).
async function setupPassword(request, env) {
  const { email, password, setup_token: setupToken } = await readJson(request);
  const key = String(email || '').trim().toLowerCase();
  if (!key) throw new HttpError(400, 'Hãy nhập email.');
  await assertNotLocked(env, 'setup:' + key);
  try {
    await requireSetupToken(request, env, setupToken || '');
  } catch (err) {
    await recordFail(env, 'setup:' + key);
    throw err;
  }
  checkPassword(password);
  const user = await env.DB.prepare('select id from users where email = ?').bind(key).first();
  if (!user) throw new HttpError(404, 'Không có tài khoản nào dùng email này.');
  await setPassword(env, user.id, password);
  return { ok: true };
}

// Đổi mật khẩu thì mọi phiên đăng nhập cũ của tài khoản đó bị huỷ.
async function setPassword(env, userId, password) {
  await env.DB.batch([
    env.DB.prepare('update users set password_hash = ? where id = ?').bind(await hashPassword(password), userId),
    env.DB.prepare('delete from sessions where user_id = ?').bind(userId),
  ]);
}

// ---------- tài khoản (Admin) ----------

async function listProfiles(env) {
  const { results } = await env.DB.prepare(`select ${USER_FIELDS} from users order by created_at`).all();
  return results.map(publicUser);
}

async function updateProfile(request, env, admin, id) {
  const body = await readJson(request);
  const sets = [];
  const values = [];
  if ('role' in body) {
    if (!ROLES.includes(body.role)) throw new HttpError(400, 'Vai trò không hợp lệ.');
    if (id === admin.id) throw new HttpError(400, 'Không thể tự đổi vai trò của chính mình.');
    sets.push('role = ?'); values.push(body.role);
  }
  if ('is_active' in body) {
    if (id === admin.id) throw new HttpError(400, 'Không thể tự khoá chính mình.');
    sets.push('is_active = ?'); values.push(body.is_active ? 1 : 0);
  }
  if ('name' in body) { sets.push('name = ?'); values.push(String(body.name || '').slice(0, 200)); }
  for (const field of ['seller_id', 'designer_id']) {
    if (field in body) { sets.push(`${field} = ?`); values.push(body[field] || null); }
  }
  if (!sets.length) throw new HttpError(400, 'Không có gì để cập nhật.');
  const statements = [env.DB.prepare(`update users set ${sets.join(', ')} where id = ?`).bind(...values, id)];
  // Khoá tài khoản thì đăng xuất luôn mọi thiết bị của tài khoản đó.
  if (body.is_active === false) statements.push(env.DB.prepare('delete from sessions where user_id = ?').bind(id));
  const [result] = await env.DB.batch(statements);
  if (!result.meta.changes) throw new HttpError(404, 'Không tìm thấy tài khoản.');
  return { ok: true };
}

async function createAccount(request, env) {
  const { email, password, name, role } = await readJson(request);
  const key = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) throw new HttpError(400, 'Email không hợp lệ.');
  checkPassword(password);
  if (!ROLES.includes(role)) throw new HttpError(400, 'Vai trò không hợp lệ.');
  if (await env.DB.prepare('select 1 from users where email = ?').bind(key).first()) {
    throw new HttpError(409, 'Email này đã có tài khoản.');
  }

  const id = crypto.randomUUID();
  const finalName = String(name || '').trim() || key.split('@')[0];
  const createdAt = nowIso();
  // Seller/Designer mới được tạo luôn hồ sơ tương ứng và liên kết vào tài khoản.
  const linkedId = role === 'admin' ? null : crypto.randomUUID();
  const statements = [];
  if (role === 'seller') {
    statements.push(
      env.DB.prepare('insert into sellers (id, name, email, created_at) values (?, ?, ?, ?)').bind(linkedId, finalName, key, createdAt),
      bump(env, 'sellers'),
    );
  } else if (role === 'designer') {
    statements.push(
      env.DB.prepare('insert into designers (id, name, email, created_at) values (?, ?, ?, ?)').bind(linkedId, finalName, key, createdAt),
      bump(env, 'designers'),
    );
  }
  statements.push(
    env.DB.prepare(
      `insert into users (id, email, name, role, is_active, seller_id, designer_id, password_hash, created_at)
       values (?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    ).bind(id, key, finalName, role, role === 'seller' ? linkedId : null, role === 'designer' ? linkedId : null, await hashPassword(password), createdAt),
  );
  await env.DB.batch(statements);
  return { ok: true, id };
}

// ---------- dữ liệu ----------

const bump = (env, table) => env.DB.prepare('update table_versions set version = version + 1 where name = ?').bind(table);

async function tableVersion(env, table) {
  const row = await env.DB.prepare('select version from table_versions where name = ?').bind(table).first();
  return row ? row.version : 0;
}

function fromRow(table, row) {
  const out = { ...row };
  for (const col of TABLES[table].json || []) {
    try {
      out[col] = row[col] == null ? null : JSON.parse(row[col]);
    } catch {
      out[col] = null;
    }
  }
  return out;
}

// Chuẩn hoá một dòng gửi lên thành danh sách giá trị theo đúng thứ tự cột.
function toValues(table, id, body) {
  const spec = TABLES[table];
  const row = {};
  for (const col of spec.cols) {
    let value = body[col];
    if (value === undefined || value === null || value === '') value = spec.defaults?.[col] ?? (value === '' ? '' : null);
    row[col] = value;
  }
  for (const col of spec.required) {
    if (typeof row[col] !== 'string' || !row[col].trim()) throw new HttpError(400, `Thiếu trường "${col}".`);
  }
  for (const [col, allowed] of Object.entries(spec.enums || {})) {
    if (!allowed.includes(row[col])) throw new HttpError(400, `Giá trị "${col}" không hợp lệ.`);
  }
  if (row.due_date) {
    const due = new Date(row.due_date);
    if (Number.isNaN(due.getTime())) throw new HttpError(400, 'Hạn chót không hợp lệ.');
    row.due_date = due.toISOString();
  }
  for (const col of spec.json || []) row[col] = row[col] == null ? null : JSON.stringify(row[col]);
  for (const col of spec.cols) {
    if (row[col] != null && typeof row[col] !== 'string') row[col] = String(row[col]);
  }
  const created = body.created_at ? new Date(body.created_at) : null;
  const createdAt = created && !Number.isNaN(created.getTime()) ? created.toISOString() : nowIso();
  return [id, ...spec.cols.map((col) => row[col]), createdAt];
}

// Ghi đè cả dòng nếu đã có, giữ nguyên created_at ban đầu.
function upsertStatement(env, table, id, body) {
  const { cols } = TABLES[table];
  const names = ['id', ...cols, 'created_at'];
  return env.DB.prepare(
    `insert into ${table} (${names.join(', ')}) values (${names.map(() => '?').join(', ')})
     on conflict (id) do update set ${cols.map((c) => `${c} = excluded.${c}`).join(', ')}`,
  ).bind(...toValues(table, id, body));
}

async function listRows(env, table, url) {
  const version = await tableVersion(env, table);
  if (url.searchParams.get('v') === String(version)) return { version, unchanged: true };
  const { results } = await env.DB.prepare(`select * from ${table} order by created_at, id`).all();
  return { version, rows: results.map((row) => fromRow(table, row)) };
}

async function getRow(env, table, id) {
  const row = await env.DB.prepare(`select * from ${table} where id = ?`).bind(id).first();
  return row ? fromRow(table, row) : null;
}

async function putRow(request, env, table, id) {
  if (!/^[0-9a-zA-Z-]{8,64}$/.test(id)) throw new HttpError(400, 'ID không hợp lệ.');
  const results = await env.DB.batch([
    upsertStatement(env, table, id, await readJson(request)),
    bump(env, table),
    env.DB.prepare('select version from table_versions where name = ?').bind(table),
  ]);
  return { version: results[2].results[0].version, row: await getRow(env, table, id) };
}

async function deleteRow(env, table, id) {
  const statements = [env.DB.prepare(`delete from ${table} where id = ?`).bind(id), bump(env, table)];
  // Thay cho "on delete set null" của Postgres.
  if (table === 'sellers' || table === 'designers') {
    const field = table === 'sellers' ? 'seller_id' : 'designer_id';
    statements.push(
      env.DB.prepare(`update designs set ${field} = null where ${field} = ?`).bind(id),
      env.DB.prepare(`update users set ${field} = null where ${field} = ?`).bind(id),
      bump(env, 'designs'),
    );
  }
  if (table === 'designs') {
    statements.push(env.DB.prepare('update designs set reused_from_id = null where reused_from_id = ?').bind(id));
  }
  await env.DB.batch(statements);
  return { ok: true };
}

// ---------- Google Drive ----------

async function driveToken(env) {
  const { GOOGLE_OAUTH_CLIENT_ID: clientId, GOOGLE_OAUTH_CLIENT_SECRET: clientSecret, GOOGLE_OAUTH_REFRESH_TOKEN: refreshToken } = env;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new HttpError(500, 'Chưa cấu hình đủ GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_OAUTH_REFRESH_TOKEN.');
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  });
  if (!res.ok) throw new HttpError(502, 'Google từ chối cấp quyền Drive. Kiểm tra lại các secret GOOGLE_OAUTH_*.');
  const { access_token: accessToken, expires_in: expiresIn } = await res.json();
  return { access_token: accessToken, expires_in: expiresIn };
}

// ---------- link rút gọn ----------

function randomCode(length = 7) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(length)), (n) => chars[n % chars.length]).join('');
}

async function createShortLink(request, env) {
  const { url: target } = await readJson(request);
  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    throw new HttpError(400, 'Thiếu url.');
  }
  if (parsed.protocol !== 'https:') throw new HttpError(400, 'Chỉ rút gọn được link https.');
  const existing = await env.DB.prepare('select code from short_links where target_url = ?').bind(target).first();
  if (existing) return { code: existing.code };
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    try {
      await env.DB.prepare('insert into short_links (code, target_url, created_at) values (?, ?, ?)').bind(code, target, nowIso()).run();
      return { code };
    } catch {
      // trùng mã (hoặc người khác vừa tạo cùng link): thử lại
      const again = await env.DB.prepare('select code from short_links where target_url = ?').bind(target).first();
      if (again) return { code: again.code };
    }
  }
  throw new HttpError(500, 'Không tạo được short link, thử lại.');
}

// ---------- nhập dữ liệu từ Supabase (chỉ khi có SETUP_TOKEN) ----------

async function importRows(request, env) {
  const { table, rows } = await readJson(request);
  if (!Array.isArray(rows) || rows.length > 200) throw new HttpError(400, 'Cần "rows" là mảng tối đa 200 dòng.');
  let statements;
  if (TABLES[table]) {
    statements = rows.map((row) => upsertStatement(env, table, String(row.id), row));
    statements.push(bump(env, table));
  } else if (table === 'profiles') {
    // Mật khẩu không chuyển sang được: mỗi tài khoản phải đặt mật khẩu mới.
    statements = rows.map((row) =>
      env.DB.prepare(
        `insert into users (id, email, name, role, is_active, seller_id, designer_id, created_at)
         values (?, ?, ?, ?, ?, ?, ?, ?)
         on conflict (id) do update set email = excluded.email, name = excluded.name, role = excluded.role,
           is_active = excluded.is_active, seller_id = excluded.seller_id, designer_id = excluded.designer_id`,
      ).bind(
        String(row.id), String(row.email).trim().toLowerCase(), row.name || '', ROLES.includes(row.role) ? row.role : 'seller',
        row.is_active === false ? 0 : 1, row.seller_id || null, row.designer_id || null,
        row.created_at ? new Date(row.created_at).toISOString() : nowIso(),
      ));
  } else if (table === 'short_links') {
    statements = rows.map((row) =>
      env.DB.prepare('insert or ignore into short_links (code, target_url, created_at) values (?, ?, ?)')
        .bind(String(row.code), String(row.target_url), row.created_at ? new Date(row.created_at).toISOString() : nowIso()));
  } else {
    throw new HttpError(400, 'Bảng không hợp lệ.');
  }
  if (statements.length) await env.DB.batch(statements);
  return { ok: true, count: rows.length };
}

// ---------- định tuyến ----------

async function handle(request, env) {
  const url = new URL(request.url);
  const { method } = request;
  const parts = url.pathname.split('/').filter(Boolean);
  const route = `${method} /${parts.join('/')}`;

  if (method === 'GET' && parts[0] === 's' && parts.length === 2) {
    const row = await env.DB.prepare('select target_url from short_links where code = ?').bind(parts[1]).first();
    if (!row) return new Response('Không tìm thấy link này.', { status: 404 });
    return new Response(null, { status: 302, headers: { Location: row.target_url } });
  }

  if (route === 'GET /') return { ok: true, service: 'qkp-design-api' };
  if (route === 'POST /auth/login') return login(request, env);
  if (route === 'POST /auth/setup-password') return setupPassword(request, env);
  if (route === 'GET /auth/me') return { profile: (await currentUser(request, env)).user };
  if (route === 'POST /auth/logout') {
    const { tokenHash } = await currentUser(request, env);
    await env.DB.prepare('delete from sessions where token_hash = ?').bind(tokenHash).run();
    return { ok: true };
  }
  if (route === 'POST /auth/password') {
    const { user } = await currentUser(request, env);
    const { current, password } = await readJson(request);
    const row = await env.DB.prepare('select password_hash from users where id = ?').bind(user.id).first();
    if (!(await verifyPassword(current || '', row.password_hash))) throw new HttpError(400, 'Mật khẩu hiện tại không đúng.');
    checkPassword(password);
    await setPassword(env, user.id, password);
    return { ok: true };
  }

  if (route === 'POST /admin/import') {
    await requireSetupToken(request, env);
    return importRows(request, env);
  }

  if (parts[0] !== 'api') throw new HttpError(404, 'Không có đường dẫn này.');

  if (parts[1] === 'profiles') {
    const admin = await requireAdmin(request, env);
    if (method === 'GET' && parts.length === 2) return listProfiles(env);
    if (method === 'POST' && parts.length === 2) return createAccount(request, env);
    if (method === 'PATCH' && parts.length === 3) return updateProfile(request, env, admin, parts[2]);
    if (method === 'POST' && parts.length === 4 && parts[3] === 'password') {
      const { password } = await readJson(request);
      checkPassword(password);
      if (!(await env.DB.prepare('select 1 from users where id = ?').bind(parts[2]).first())) throw new HttpError(404, 'Không tìm thấy tài khoản.');
      await setPassword(env, parts[2], password);
      return { ok: true };
    }
    throw new HttpError(404, 'Không có đường dẫn này.');
  }

  await requireActive(request, env);
  if (route === 'POST /api/drive-token') return driveToken(env);
  if (route === 'POST /api/shortlink') return createShortLink(request, env);

  const table = parts[1];
  if (!TABLES[table]) throw new HttpError(404, 'Không có đường dẫn này.');
  if (method === 'GET' && parts.length === 2) return listRows(env, table, url);
  if (parts.length === 3) {
    if (method === 'GET') return { row: await getRow(env, table, parts[2]) };
    if (method === 'PUT') return putRow(request, env, table, parts[2]);
    if (method === 'DELETE') return deleteRow(env, table, parts[2]);
  }
  throw new HttpError(404, 'Không có đường dẫn này.');
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    let response;
    try {
      const result = await handle(request, env);
      response = result instanceof Response ? result : Response.json(result);
    } catch (err) {
      if (err instanceof HttpError) {
        response = Response.json({ error: err.message, code: err.code }, { status: err.status });
      } else {
        console.error(err);
        response = Response.json({ error: 'Lỗi máy chủ. Thử lại sau.' }, { status: 500 });
      }
    }
    response = new Response(response.body, response);
    for (const [name, value] of Object.entries(cors)) response.headers.set(name, value);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  },
};
