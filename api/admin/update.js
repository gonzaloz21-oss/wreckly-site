const db = require('../../lib/db');
const { send, readJson, isAdmin, clip } = require('../../lib/util');

// Update status / admin notes on a request or a yard.
module.exports = async (req, res) => {
  if (!isAdmin(req)) return send(res, 401, { error: 'Unauthorized' });
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  try {
    const d = await readJson(req);
    if (d.table === 'requests') {
      const patch = {};
      if (['new', 'quoted', 'paid', 'closed', 'no_stock'].includes(d.status)) patch.status = d.status;
      if (typeof d.admin_notes === 'string') patch.admin_notes = clip(d.admin_notes, 1000);
      return send(res, 200, { row: await db.update('requests', d.id, patch) });
    }
    if (d.table === 'yards') {
      const patch = {};
      if (['new', 'active', 'paused'].includes(d.status)) patch.status = d.status;
      return send(res, 200, { row: await db.update('yards', d.id, patch) });
    }
    return send(res, 400, { error: 'Bad table' });
  } catch (e) { console.error(e); return send(res, 500, { error: e.message }); }
};
