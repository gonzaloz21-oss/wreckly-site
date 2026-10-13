// Runs the (req, res) handlers in /api as Netlify Functions.
module.exports = (handler) => async (event) => {
  const raw = event.body
    ? Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8')
    : Buffer.alloc(0);
  const headers = {};
  for (const [k, v] of Object.entries(event.headers || {})) headers[k.toLowerCase()] = v;
  if (event.headers && event.headers['x-nf-client-connection-ip'])
    headers['x-forwarded-for'] = event.headers['x-nf-client-connection-ip'];
  const req = { method: event.httpMethod, headers, rawBody: raw, query: event.queryStringParameters || {} };
  const out = { statusCode: 200, headers: {}, body: '' };
  const res = {
    set statusCode(c) { out.statusCode = c; },
    get statusCode() { return out.statusCode; },
    setHeader(k, v) { out.headers[k] = v; },
    end(b) { out.body = b ? String(b) : ''; },
  };
  await handler(req, res);
  return out;
};
