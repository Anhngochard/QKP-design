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

export const DB = {
  async getAll(table) {
    const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: true });
    if (error) throw error;
    return table === 'designs' ? data.map(rowToDesign) : data;
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
    return table === 'designs' ? rowToDesign(data) : data;
  },

  async delete(table, id) {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) throw error;
  },
};
