// Adapter for the locally running model (Ollama's /api/chat). One job: send a prompt, get back JSON that
// matches a schema — with timeouts, bounded retries, size limits and plain-English failure reasons.
// It knows nothing about the game; tasks.mjs builds prompts and validates meaning.
//
// Responses: { ok: true, data, attempts, ms } or { ok: false, reason, detail, attempts, ms }
//   reasons: unavailable · timeout · http_<status> · bad_json · too_large · invalid (from the task validator) · busy
export function createLLM(cfg, { fetchImpl = globalThis.fetch, log = () => {} } = {}) {
  const headers = { 'content-type': 'application/json', ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}) };
  let queue = Promise.resolve(), waiting = 0;
  const MAX_WAITING = 4;

  async function call(path, body, timeoutMs) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${cfg.baseUrl}${path}`, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal });
      const text = await res.text();
      if (!res.ok) return { ok: false, reason: `http_${res.status}`, detail: text.slice(0, 200) };
      return { ok: true, text };
    } catch (e) {
      return { ok: false, reason: e.name === 'AbortError' ? 'timeout' : 'unavailable', detail: e.cause?.code ?? e.message };
    } finally { clearTimeout(t); }
  }

  async function status() {
    const r = await call('/api/tags', null, 4000);
    if (!r.ok) return { available: false, reason: r.reason, model: cfg.model, runtime: cfg.runtime };
    let models = [];
    try { models = JSON.parse(r.text).models?.map(m => m.name) ?? []; } catch { /* ignore */ }
    const ver = await call('/api/version', null, 2000);
    let version = null; try { version = ver.ok ? JSON.parse(ver.text).version : null; } catch { /* ignore */ }
    const installed = models.includes(cfg.model);
    return { available: installed, reason: installed ? null : 'model_not_installed', model: cfg.model, runtime: cfg.runtime, version, installedModels: models };
  }

  // One structured generation. validate(data) → { ok, errors, value }; failures are retried (bounded),
  // telling the model what was wrong. Returns the validated value, never unvalidated output.
  function json({ system, user, schema, validate = d => ({ ok: true, value: d }), maxTokens = 700, temperature = 0.8, seed, numCtx }) {
    if (waiting >= MAX_WAITING) return Promise.resolve({ ok: false, reason: 'busy', attempts: 0, ms: 0 });
    waiting++;
    const run = async () => {
      const t0 = Date.now(), messages = [{ role: 'system', content: system }, { role: 'user', content: user }];
      let last = { reason: 'unavailable' };
      for (let attempt = 1; attempt <= 1 + cfg.retries; attempt++) {
        const r = await call('/api/chat', { model: cfg.model, stream: false, think: false, format: schema, messages,
          options: { temperature, num_predict: maxTokens, num_ctx: numCtx ?? cfg.numCtx, ...(seed != null ? { seed: seed + attempt - 1 } : {}) } }, cfg.timeoutMs);
        if (!r.ok) { last = r; if (r.reason === 'unavailable' || r.reason.startsWith('http_4')) break; continue; }
        if (r.text.length > cfg.maxResponseChars) { last = { reason: 'too_large' }; continue; }
        let content;
        try { content = JSON.parse(r.text).message?.content ?? ''; } catch { last = { reason: 'bad_json', detail: 'runtime envelope' }; continue; }
        if (content.length > cfg.maxResponseChars) { last = { reason: 'too_large' }; continue; }
        let data;
        try { data = JSON.parse(content); } catch { last = { reason: 'bad_json', detail: content.slice(0, 120) }; messages.push({ role: 'assistant', content }, { role: 'user', content: 'That was not valid JSON. Reply with JSON only, matching the schema.' }); continue; }
        const v = validate(data);
        if (v.ok) { log({ ok: true, attempts: attempt, ms: Date.now() - t0 }); return { ok: true, data: v.value, attempts: attempt, ms: Date.now() - t0 }; }
        last = { reason: 'invalid', detail: v.errors.slice(0, 5).join('; ') };
        messages.push({ role: 'assistant', content }, { role: 'user', content: `Your answer was rejected: ${v.errors.slice(0, 5).join('; ')}. Fix exactly these problems and reply with JSON only.` });
      }
      log({ ok: false, reason: last.reason, detail: last.detail, ms: Date.now() - t0 });
      return { ok: false, reason: last.reason, detail: last.detail, attempts: 1 + cfg.retries, ms: Date.now() - t0 };
    };
    const p = queue.then(run, run).finally(() => { waiting--; });
    queue = p.catch(() => {});
    return p;
  }

  return { status, json, config: { model: cfg.model, runtime: cfg.runtime } };
}
