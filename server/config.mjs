// AI service configuration — the ONLY place the model endpoint and name live. The browser never sees
// them. Override with environment variables or a `vanquest.ai.json` file in the project root:
//   VANQUEST_LLM_URL       default http://127.0.0.1:11434   (Ollama, discovered running in WSL)
//   VANQUEST_LLM_MODEL     default qwen3:8b                  (the newest Qwen installed; no Qwen3.5 found)
//   VANQUEST_LLM_TIMEOUT   default 90000 ms                  (the first request loads the model: ~30 s)
//   VANQUEST_LLM_RETRIES   default 2                         (extra attempts after a failure)
//   VANQUEST_LLM_API_KEY   optional; sent as a Bearer token to the runtime, never to the browser or logs
//   VANQUEST_PORT          default 8765
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
let file = {};
try { file = JSON.parse(readFileSync(new URL('../vanquest.ai.json', import.meta.url), 'utf8')); } catch { /* optional */ }
const env = process.env;

export const CONFIG = Object.freeze({
  root: ROOT,
  port: Number(env.VANQUEST_PORT ?? file.port ?? 8765),
  llm: Object.freeze({
    runtime: 'ollama',
    baseUrl: String(env.VANQUEST_LLM_URL ?? file.url ?? 'http://127.0.0.1:11434').replace(/\/$/, ''),
    model: String(env.VANQUEST_LLM_MODEL ?? file.model ?? 'qwen3:8b'),
    timeoutMs: Number(env.VANQUEST_LLM_TIMEOUT ?? file.timeoutMs ?? 90000),
    retries: Math.max(0, Math.min(4, Number(env.VANQUEST_LLM_RETRIES ?? file.retries ?? 2))),
    apiKey: env.VANQUEST_LLM_API_KEY ?? null,
    numCtx: Number(file.numCtx ?? 4096),
    maxResponseChars: 12000,
    maxInputChars: 6000,           // per request; a task may allow more (tasks.mjs maxInput)
  }),
});
