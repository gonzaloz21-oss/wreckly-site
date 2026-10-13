// Local dev fallback: in-memory store when Supabase is not configured.
const mem = { requests: [], yards: [] };
const useMem = () => !process.env.SUPABASE_URL;
let seq = 0;

const base = () => process.env.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1';
const headers = (extra = {}) => ({
  apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
  'Content-Type': 'application/json',
  ...extra,
});

async function sb(path, { method = 'GET', body } = {}) {
  const r = await fetch(base() + path, {
    method,
    headers: headers(method === 'GET' ? {} : { Prefer: 'return=representation' }),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error('Supabase ' + r.status + ': ' + text);
  return text ? JSON.parse(text) : [];
}

module.exports = {
  insert: async (table, row) => {
    if (useMem()) { const r = { id: 'dev-' + (++seq), created_at: new Date().toISOString(), status: 'new', ...row }; mem[table].unshift(r); return r; }
    return sb('/' + table, { method: 'POST', body: row }).then((r) => r[0]);
  },
  list: async (table, query = '') => {
    if (useMem()) return mem[table];
    return sb('/' + table + '?select=*&' + query);
  },
  get: async (table, id) => {
    if (useMem()) return mem[table].find((r) => r.id === id);
    return sb('/' + table + '?id=eq.' + encodeURIComponent(id) + '&select=*').then((r) => r[0]);
  },
  update: async (table, id, patch) => {
    if (useMem()) { const r = mem[table].find((x) => x.id === id); Object.assign(r, patch); return r; }
    return sb('/' + table + '?id=eq.' + encodeURIComponent(id), { method: 'PATCH', body: patch }).then((r) => r[0]);
  },
};
