// Data layer for the app. Backed by Supabase Postgres (shared, real-time-ish across
// every device) instead of the browser's local IndexedDB — everyone signed in sees
// the same designs/sellers/designers/colors. The public API (DB.getAll/get/put/delete,
// uid()) is kept identical to the old IndexedDB version so the rest of the app didn't
// need to change.
import { supabase } from './supabase.js';

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

// Supabase/PostgREST caps a single request at 1000 rows by default. Now that
// the "designs" table has crossed that count, a plain .select() silently drops
// everything past row #1000 (newest tasks — insertion order — disappear from
// every list/count in the app). Page through in batches of 1000 until a page
// comes back short, then concatenate.
const PAGE_SIZE = 1000;

async function fetchAll(table) {
  let all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    all = all.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return table === 'designs' ? all.map(rowToDesign) : all;
}

// Downloading a whole table is the app's biggest source of Supabase egress: the
// sidebar counts, the seed check and every view each used to call getAll('designs')
// on their own, so one click re-downloaded the full table (1000+ rows with their
// history) two or three times. That is what pushed the project over its egress
// quota. getAll() now keeps each table in memory for a short while:
//  - calls made while a download is already running share that one download;
//  - calls within CACHE_TTL_MS of the last download reuse it;
//  - put()/delete() update the cached copy in place, so your own changes show
//    immediately without downloading the table again.
// Changes made by other people show up after at most CACHE_TTL_MS, or right away
// on a page reload. Pass { fresh: true } to force a new download.
const CACHE_TTL_MS = 60_000;
const cache = new Map(); // table -> { at, rows, promise }

// Callers get their own copy, so editing a record before (or without) saving it
// never changes what the next caller sees.
const copy = (rows) => structuredClone(rows);

function patchCache(table, apply) {
  const entry = cache.get(table);
  if (!entry) return;
  // A download is in flight and may or may not include this write: drop it from
  // the cache so the next getAll() downloads again instead of guessing.
  if (entry.promise) cache.delete(table);
  else apply(entry.rows);
}

export const DB = {
  async getAll(table, { fresh = false } = {}) {
    const hit = cache.get(table);
    if (hit && !fresh) {
      if (hit.promise) return copy(await hit.promise);
      if (Date.now() - hit.at < CACHE_TTL_MS) return copy(hit.rows);
    }
    const entry = { at: 0, rows: null, promise: null };
    entry.promise = fetchAll(table).then(
      (rows) => {
        entry.rows = rows;
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
    const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return table === 'designs' ? rowToDesign(data) : data;
  },

  async put(table, record) {
    const row = table === 'designs' ? designToRow(record) : { ...record };
    if (!row.id) row.id = uid();
    const { data, error } = await supabase.from(table).upsert(row).select().single();
    if (error) throw error;
    const saved = table === 'designs' ? rowToDesign(data) : data;
    patchCache(table, (rows) => {
      const index = rows.findIndex((r) => r.id === saved.id);
      if (index >= 0) rows[index] = copy(saved);
      else rows.push(copy(saved)); // new rows are the newest, and the list is oldest-first
    });
    return saved;
  },

  async delete(table, id) {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) throw error;
    patchCache(table, (rows) => {
      const index = rows.findIndex((r) => r.id === id);
      if (index >= 0) rows.splice(index, 1);
    });
  },
};
