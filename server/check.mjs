// `npm run ai:check` — diagnostics for the local model connection. Prints the configuration (never the
// API key), whether the runtime answers, which models it has, and one tiny structured request.
import { CONFIG } from './config.mjs';
import { createLLM } from './llm.mjs';

const { apiKey, ...shown } = CONFIG.llm;
console.log('config:', { ...shown, apiKey: apiKey ? '(set)' : '(none)' });
const llm = createLLM(CONFIG.llm);
const s = await llm.status();
console.log('runtime:', s.available ? `ok — ${s.runtime} ${s.version ?? ''}` : `NOT AVAILABLE (${s.reason})`);
if (s.installedModels) console.log('installed models:', s.installedModels.join(', '));
if (!s.available) {
  console.log(s.reason === 'model_not_installed' ? `Set VANQUEST_LLM_MODEL to one of the installed models (currently "${CONFIG.llm.model}").` : `Is the runtime running at ${CONFIG.llm.baseUrl}? (e.g. \`ollama serve\`). The game still works offline.`);
  process.exit(1);
}
const r = await llm.json({ system: 'Reply with JSON only.', user: 'Give one short tip about building an emergency fund.', schema: { type: 'object', properties: { tip: { type: 'string' } }, required: ['tip'] },
  validate: d => (typeof d.tip === 'string' && d.tip.length > 5 ? { ok: true, value: d } : { ok: false, errors: ['tip must be a sentence'] }), maxTokens: 80, temperature: 0.2 });
console.log('structured request:', r.ok ? `ok in ${r.ms} ms (${r.attempts} attempt(s)): ${r.data.tip}` : `failed: ${r.reason} ${r.detail ?? ''}`);
process.exit(r.ok ? 0 : 1);
