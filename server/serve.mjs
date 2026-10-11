// `npm start` — serves the game AND a small local AI service on http://localhost:8765.
//
//   GET  /api/ai/status          is the local model reachable? (model name, runtime, version)
//   POST /api/ai/task/<name>     one of the fixed tasks in server/tasks.mjs, with structured JSON input
//
// The browser never gets the model's address, can't send its own prompts, and can only use these
// tasks. Requests are size-limited and queued; the server binds to localhost only. If the model is
// down, these endpoints say so and the game falls back to its built-in, offline content.
// (The game also runs from any static server — e.g. `python -m http.server` — fully offline.)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { CONFIG } from './config.mjs';
import { createLLM } from './llm.mjs';
import { runTask, TASKS } from './tasks.mjs';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.tmj': 'application/json',
  '.png': 'image/png', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.txt': 'text/plain' };
const BLOCKED = [/^server\//, /^node_modules\//, /^\.git\//, /^vanquest\.ai\.json$/, /^tests\//];

export function createApp({ llm = createLLM(CONFIG.llm, { log: e => console.log(`[ai] ${e.ok ? 'ok' : 'fail'} ${e.ok ? `${e.attempts} attempt(s)` : `${e.reason}${e.detail ? ` (${String(e.detail).slice(0, 80)})` : ''}`} ${e.ms} ms`) }), root = CONFIG.root } = {}) {
  let statusCache = null, statusAt = 0;
  const json = (res, code, body) => res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body));
  return async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/ai/status' && req.method === 'GET') {
      if (Date.now() - statusAt > 10000) { statusCache = await llm.status(); statusAt = Date.now(); }
      const { installedModels, ...pub } = statusCache;          // don't list everything installed on the machine
      return json(res, 200, { ...pub, tasks: Object.keys(TASKS) });
    }
    const m = url.pathname.match(/^\/api\/ai\/task\/([a-z_]+)$/);
    if (m && req.method === 'POST') {
      let body = '';
      const limit = TASKS[m[1]]?.maxInput ?? CONFIG.llm.maxInputChars;
      for await (const chunk of req) { body += chunk; if (body.length > limit) return json(res, 413, { ok: false, reason: 'input_too_large' }); }
      let input; try { input = JSON.parse(body || '{}'); } catch { return json(res, 400, { ok: false, reason: 'bad_input' }); }
      const r = await runTask(llm, m[1], input);
      // a model that is down or answers badly is an expected outcome (200 + ok:false → offline content); only bad requests are HTTP errors
      return json(res, r.ok ? 200 : r.reason === 'unknown_task' ? 404 : r.reason === 'bad_input' ? 400 : 200, r.ok ? { ok: true, data: r.data, attempts: r.attempts, ms: r.ms } : { ok: false, reason: r.reason, attempts: r.attempts });
    }
    if (url.pathname.startsWith('/api/')) return json(res, 404, { ok: false, reason: 'not_found' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405).end();
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    if (BLOCKED.some(b => b.test(rel.replace(/\\/g, '/')))) return res.writeHead(404).end();
    const file = normalize(join(root, rel.endsWith('/') ? rel + 'index.html' : rel));
    if (!file.startsWith(normalize(root + sep)) && file !== normalize(root)) return res.writeHead(404).end();
    try { const data = await readFile(file); res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(data); } catch { res.writeHead(404).end(); }
  };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('serve.mjs')) {
  const app = createApp();
  createServer(app).listen(CONFIG.port, '127.0.0.1', async () => {
    console.log(`VanQuest: http://localhost:${CONFIG.port}/`);
    const s = await createLLM(CONFIG.llm).status();
    console.log(s.available ? `AI: ${s.model} via ${s.runtime} ${s.version ?? ''} — connected` : `AI: ${s.model} not available (${s.reason}). The game runs with its built-in offline scenarios.`);
  });
}
