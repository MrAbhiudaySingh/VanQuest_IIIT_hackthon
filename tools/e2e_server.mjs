// Server for the end-to-end tests: the game's own server (server/serve.mjs) on a free port, so the
// tests exercise the same static files and AI endpoints the player uses. By default the model is an
// offline stub (the tests never depend on a running model); a suite can pass its own `llm` to script
// model answers.
import { createServer } from 'node:http';
import { createApp } from '../server/serve.mjs';

export const OFFLINE_LLM = {
  status: async () => ({ available: false, reason: 'disabled_in_tests', model: 'none', runtime: 'stub' }),
  json: async () => ({ ok: false, reason: 'unavailable', attempts: 0, ms: 0 }),
};

export function serve({ llm = OFFLINE_LLM } = {}) {
  const server = createServer(createApp({ llm })).listen(0);
  // `url` skips the title screen (?play) so the gameplay suites start in the city; `base` shows it
  const base = `http://localhost:${server.address().port}/`;
  return { server, url: `${base}?play`, base };
}
