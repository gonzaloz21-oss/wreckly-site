const db = require('../../lib/db');
const { send, isAdmin } = require('../../lib/util');

module.exports = async (req, res) => {
  if (!isAdmin(req)) return send(res, 401, { error: 'Unauthorized' });
  try {
    const [requests, yards] = await Promise.all([
      db.list('requests', 'order=created_at.desc&limit=200'),
      db.list('yards', 'order=created_at.desc&limit=200'),
    ]);
    return send(res, 200, { requests, yards });
  } catch (e) { console.error(e); return send(res, 500, { error: e.message }); }
};
