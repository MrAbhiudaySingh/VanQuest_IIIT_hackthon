// Browser side of the local AI service (server/serve.mjs). The browser never learns the model's address
// and can't send prompts: it may only call the fixed tasks in server/tasks.mjs with structured facts.
// Every answer is re-validated here (defence in depth) and is only ever wording or advisory feedback —
// numbers, scores and outcomes always come from the deterministic practice code.
//
// When the game is served by a plain static server (no /api), or the model is down, status() reports
// unavailable and the academy uses its built-in content. Nothing waits on the model to be playable.
import { validateExplain, validateLifeFeedback, validateReasoning, validateLifeReport, validateNewspaper } from './validate.js';

const STATUS_TIMEOUT = 5000, TASK_TIMEOUT = 240000;   // the life report can take a few minutes on a laptop
const CLIENT_CHECKS = { explain: validateExplain, life_feedback: validateLifeFeedback, reasoning: validateReasoning, life_report: validateLifeReport, newspaper: validateNewspaper };

export function createAIClient({ fetchImpl = (...a) => globalThis.fetch(...a), base = '' } = {}) {
  let status = null, pending = null;

  async function get(path, body, ms) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try {
      const res = await fetchImpl(`${base}${path}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal } : { signal: ctl.signal });
      if (!(res.headers?.get?.('content-type') ?? '').includes('application/json')) return { ok: false, reason: 'no_ai_service' };
      return await res.json();
    } catch (e) {
      return { ok: false, reason: e.name === 'AbortError' ? 'timeout' : 'no_ai_service' };
    } finally { clearTimeout(t); }
  }

  // { available, model, runtime, reason } — cached; refresh() re-checks.
  function check(refresh = false) {
    if (status && !refresh) return Promise.resolve(status);
    pending ??= get('/api/ai/status', null, STATUS_TIMEOUT).then(s => {
      status = s && 'available' in s ? { available: !!s.available, model: s.model ?? null, runtime: s.runtime ?? null, reason: s.reason ?? null }
        : { available: false, model: null, runtime: null, reason: s?.reason ?? 'no_ai_service' };
      pending = null;
      return status;
    });
    return pending;
  }

  // Run one task. Resolves { ok, data } or { ok: false, reason } — never throws, never returns unvalidated data.
  async function task(name, input, { validateWith } = {}) {
    const s = await check();
    if (!s.available) return { ok: false, reason: s.reason ?? 'unavailable' };
    const r = await get(`/api/ai/task/${name}`, input, TASK_TIMEOUT);
    if (!r?.ok) {
      if (r?.reason === 'unavailable' || r?.reason === 'no_ai_service') status = { ...s, available: false, reason: r.reason };
      return { ok: false, reason: r?.reason ?? 'unavailable' };
    }
    const v = validateWith ? validateWith(r.data) : CLIENT_CHECKS[name]?.(r.data, input) ?? { ok: true, value: r.data };
    return v.ok ? { ok: true, data: v.value ?? r.data } : { ok: false, reason: 'invalid', errors: v.errors };
  }

  return { check, task, get status() { return status; } };
}

export const ai = createAIClient();

// Every number that appears in a list of scored points — the only numbers an explanation may quote.
export const numbersIn = (...values) => [...JSON.stringify(values).matchAll(/\d[\d,]*(?:\.\d+)?/g)].map(m => Number(m[0].replace(/,/g, ''))).filter(Number.isFinite);
