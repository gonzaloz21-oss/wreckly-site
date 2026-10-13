// Local preview only: serves /public and routes /api/* to the handlers. Not used on Vercel.
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = process.env.PORT || 3000;
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    const file = path.join(__dirname, url.pathname + '.js');
    if (!file.startsWith(path.join(__dirname, 'api')) || !fs.existsSync(file)) { res.statusCode = 404; return res.end('{}'); }
    delete require.cache[require.resolve(file)];
    return require(file)(req, res);
  }
  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  if (!path.extname(p)) p += '.html';
  const f = path.join(__dirname, 'public', p);
  if (!f.startsWith(path.join(__dirname, 'public')) || !fs.existsSync(f)) { res.statusCode = 404; return res.end('Not found'); }
  res.setHeader('Content-Type', types[path.extname(f)] || 'application/octet-stream');
  fs.createReadStream(f).pipe(res);
}).listen(PORT, () => console.log('http://localhost:' + PORT));
