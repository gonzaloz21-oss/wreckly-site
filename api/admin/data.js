const db = require('../../lib/db');
const { send, isAdmin } = require('../../lib/util');

module.exports = async (req, res) => {
  if (!isAdmin(req)) return send(res, 401, { error: 'Unauthorized' });
  try {
    const [requests, yards, quotes] = await Promise.all([
      db.list('requests', 'order=created_at.desc&limit=200'),
      db.list('yards', 'order=company.asc&limit=1000'),
      db.list('quotes', 'order=created_at.asc&limit=1000'),
    ]);
    return send(res, 200, { requests, yards, quotes });
  } catch (e) { console.error(e); return send(res, 500, { error: e.message }); }
};
