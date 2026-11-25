// Data layer for the app. Backed by the Cloudflare Worker API (worker/) and its D1
// database — everyone signed in sees the same designs/sellers/designers/colors.
// The public API (DB.getAll/get/put/delete, uid()) is unchanged from the Supabase
// version so the rest of the app didn't need to change.
import { api } from './api.js';

export function uid() {
  return crypto.randomUUID();
}

function rowToDesign(row) {
  return {
    id: row.id,
    name: row.name,
    product: row.product,
    gender: row.gender,
    size: row.size,
    colorName: row.color_name,
    sellerId: row.seller_id,
    designerId: row.designer_id,
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date ? new Date(row.due_date).getTime() : null,
    sellerNotes: row.seller_notes,
    designerNotes: row.designer_notes,
    colorRefs: row.color_refs || [],
    mockupFront: row.mockup_front || null,
    mockupBack: row.mockup_back || null,
    mockupExtra: row.mockup_extra || [],
    designFileFront: row.design_file_front || null,
    designFileBack: row.design_file_back || null,
    designFilesExtra: row.design_files_extra || [],
    reusedFromId: row.reused_from_id || null,
    history: row.history || [],
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  };
}

function designToRow(design) {
  return {
    id: design.id,
    name: design.name,
    product: design.product || '—',
    gender: design.gender || '—',
    size: design.size || '—',
    color_name: design.colorName || '—',
    seller_id: design.sellerId || null,
    designer_id: design.designerId || null,
    status: design.status || 'waiting_design',
    priority: design.priority || 'Normal',
    due_date: design.dueDate ? new Date(design.dueDate).toISOString() : null,
    seller_notes: design.sellerNotes || '',
    designer_notes: design.designerNotes || '',
    color_refs: design.colorRefs || [],
    mockup_front: design.mockupFront || null,
    mockup_back: design.mockupBack || null,
    mockup_extra: design.mockupExtra || [],
    design_file_front: design.designFileFront || null,
    design_file_back: design.designFileBack || null,
    design_files_extra: design.designFilesExtra || [],
    reused_from_id: design.reusedFromId || null,
    history: design.history || [],
    created_at: design.createdAt ? new Date(design.createdAt).toISOString() : undefined,
  };
}

// Every table has a version number on the server that goes up by one on each
// change. getAll() keeps each table in memory together with its version:
//  - calls made while a download is already running share that one download;
//  - calls within CACHE_TTL_MS of the last check reuse the copy in memory;
//  - after that, the server is asked "anything newer than version N?" and only
//    sends the table again when it actually changed;
//  - put()/delete() update the cached copy in place, so your own changes show
//    immediately.
// Changes made by other people show up after at most CACHE_TTL_MS, or right away
// on a page reload. Pass { fresh: true } to check with the server now.
const CACHE_TTL_MS = 20_000;
const cache = new Map(); // table -> { at, rows, version, promise }

const convert = (table, row) => (table === 'designs' ? rowToDesign(row) : row);

// Callers get their own copy, so editing a record before (or without) saving it
// never changes what the next caller sees.
const copy = (rows) => structuredClone(rows);

async function fetchAll(table, known) {
  const query = known?.rows ? `?v=${known.version}` : '';
  const data = await api(`/api/${table}${query}`);
  if (data.unchanged) return { rows: known.rows, version: data.version };
  return { rows: data.rows.map((row) => convert(table, row)), version: data.version };
}

function patchCache(table, version, apply) {
  const entry = cache.get(table);
  if (!entry) return;
  // A download is in flight and may or may not include this write: drop it from
  // the cache so the next getAll() downloads again instead of guessing.
  if (entry.promise) return cache.delete(table);
  apply(entry.rows);
  // Our write is the only change since the copy we hold: it is now up to date.
  // Otherwise someone else changed the table too, so re-check on the next read.
  if (version === entry.version + 1) entry.version = version;
  else entry.at = 0;
}

export const DB = {
  async getAll(table, { fresh = false } = {}) {
    const hit = cache.get(table);
    if (hit?.promise) return copy(await hit.promise);
    if (hit && !fresh && Date.now() - hit.at < CACHE_TTL_MS) return copy(hit.rows);

    const entry = { at: 0, rows: hit?.rows || null, version: hit?.version, promise: null };
    entry.promise = fetchAll(table, hit).then(
      ({ rows, version }) => {
        entry.rows = rows;
        entry.version = version;
        entry.at = Date.now();
        entry.promise = null;
        return rows;
      },
      (error) => {
        if (cache.get(table) === entry) cache.delete(table);
        throw error;
      },
    );
    cache.set(table, entry);
    return copy(await entry.promise);
  },

  // Forget the cached copy of one table (or of every table).
  invalidate(table) {
    if (table) cache.delete(table);
    else cache.clear();
  },

  async get(table, id) {
    const { row } = await api(`/api/${table}/${id}`);
    return row ? convert(table, row) : null;
  },

  async put(table, record) {
    const row = table === 'designs' ? designToRow(record) : { ...record };
    if (!row.id) row.id = uid();
    const data = await api(`/api/${table}/${row.id}`, { method: 'PUT', body: row });
    const saved = convert(table, data.row);
    patchCache(table, data.version, (rows) => {
      const index = rows.findIndex((r) => r.id === saved.id);
      if (index >= 0) rows[index] = copy(saved);
      else rows.push(copy(saved)); // new rows are the newest, and the list is oldest-first
    });
    return saved;
  },

  async delete(table, id) {
    await api(`/api/${table}/${id}`, { method: 'DELETE' });
    // Deleting a seller/designer also clears them from designs on the server.
    if (table !== 'designs') cache.delete('designs');
    const entry = cache.get(table);
    patchCache(table, entry ? entry.version + 1 : 0, (rows) => {
      const index = rows.findIndex((r) => r.id === id);
      if (index >= 0) rows.splice(index, 1);
    });
    if (entry) entry.at = 0; // version after a delete is not reported: re-check next read
  },
};
