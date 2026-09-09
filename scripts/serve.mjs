import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const port = Number(process.env.PORT || 4173);
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json' };
http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = pathname === '/' || pathname === '/list' || pathname === '/list/' ? '/index.html' : pathname;
    if (!/^\/(?:index\.html|manifest\.webmanifest|sw\.js|src\/[\w/-]+\.(?:js|css)|assets\/[\w-]+\.(?:svg|png))$/.test(file)) {
      response.writeHead(404); response.end('Not found'); return;
    }
    const content=await readFile(resolve(root, '.' + file));
    response.writeHead(200, {'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff'});
    response.end(content);
  } catch { response.writeHead(404); response.end('Not found'); }
}).listen(port, '127.0.0.1', () => process.stdout.write(`Tempalist: http://127.0.0.1:${port}\n`));
