// Tiny static server for the end-to-end tests (serves the project root on a free port).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.tmj': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf' };

export function serve() {
  const server = createServer(async (req, res) => {
    const path = normalize(join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html')));
    let body;
    try { body = await readFile(path); } catch { return res.writeHead(404).end(); }
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(body);
  }).listen(0);
  return { server, url: `http://localhost:${server.address().port}/` };
}
