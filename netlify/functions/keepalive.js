// Daily ping so the free Supabase project is never paused for inactivity.
const db = require('../../lib/db');
exports.handler = async () => {
  try {
    await db.list('requests', 'limit=1');
    console.log('keepalive ok');
    return { statusCode: 200 };
  } catch (e) {
    console.error('keepalive', e);
    return { statusCode: 500 };
  }
};
