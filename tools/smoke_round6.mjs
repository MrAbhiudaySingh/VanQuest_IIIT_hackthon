// End-to-end test of Round 6 in headless Chromium: the repaired academy layout (scrolling, no
// clipping, narrow screens), the Practice Lab's exercises through their full cycle, the practice life
// and its report, strict isolation from the live game, and the local-AI path with a scripted model
// (valid and invalid answers) — the real model is never required.
import { chromium } from 'playwright';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { serve } from './e2e_server.mjs';

// A scripted stand-in for the local model, used through the real server and its validators.
const script = { mode: 'valid', calls: [] };
const fakeLLM = {
  status: async () => ({ available: true, model: 'scripted-test-model', runtime: 'stub', reason: null }),
  async json({ user, schema, validate }) {
    const props = Object.keys(schema.properties);
    script.calls.push(props[0]);
    let data;
    if (script.mode === 'invalid') data = { pitch: 'Send ₹999,999 to www.example.com now!', scene: 'x', reactions: {}, explanation: 'Your score was 1000 out of 7.', tip: 'x', narrative: 'short', encouragement: 'x' };
    else if (props.includes('pitch')) {
      const provider = user.match(/Name "(.+?)"/)[1], amount = user.match(/offering exactly this: [^\n]*?(₹[\d,]+)/)?.[1] ?? '';
      data = { pitch: `Listen — ${provider} has something for you, ${amount}. Take a look at the details.`, scene: 'by the scripted test stall', reactions: {} };
    } else if (props.includes('explanation')) data = { explanation: 'Your result came from the choices you made about essentials, savings and the surprise cost, as shown in the scored points above.', misconception: '', tip: 'Check due dates against payday.' };
    else if (props.includes('narrative')) data = { narrative: 'This year showed real decisions with real trade-offs. The categories above show where your habits helped and where they cost you, and the lists name the specific months. Keep the strengths and work on the weakest area first.', encouragement: 'One focused change next time will move the whole picture.' };
    else data = { criteria: [], feedback: 'scripted' };
    const v = validate(data);
    return v.ok ? { ok: true, data: v.value, attempts: 1, ms: 1 } : { ok: false, reason: 'invalid', detail: v.errors.join('; '), attempts: 3, ms: 1 };
  },
};

const offline = serve(), online = serve({ llm: fakeLLM });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const problems = [], modelRequests = [];
page.on('console', m => { if (m.type() === 'error' || (m.type() === 'warning' && !/GL|WebGL/.test(m.text()))) problems.push(m.text()); });
page.on('pageerror', e => problems.push(e.message));
page.on('request', r => { if (/11434|\/api\/chat|\/api\/tags/.test(r.url())) modelRequests.push(r.url()); });

const step = async (name, fn) => {
  process.stdout.write(`• ${name} … `);
  try { await fn(); } catch (e) { const shot = join(tmpdir(), 'vanquest-round6-failure.png'); await page.screenshot({ path: shot }).catch(() => {}); console.log(`FAILED (screenshot: ${shot})`); throw e; }
  console.log('ok');
};
const G = (fn, arg) => page.evaluate(fn, arg);
const boot = async () => {
  await page.waitForFunction(() => window.game?.scene?.getScene('City')?.traffic && window.vq, null, { timeout: 15000 });
  await G(() => { vq.settings.passiveTime = false; vq.settings.randomEncounters = false; });
  await page.waitForTimeout(300);
};
const practice = () => G(() => JSON.parse(localStorage.getItem('vanquest.practice.v1') ?? 'null'));
const mainSnapshot = () => G(() => ({ state: JSON.stringify(vq.game.state), save: localStorage.getItem('vanquest.save.v1'), profiles: localStorage.getItem('vanquest.profiles.v1') }));
const openLesson = async (course, index) => {
  await G(() => vq.router.location('finance_academy'));
  await page.click(`[data-a="open"][data-id="${course}"]`);
  for (let i = 0; i < index; i++) await page.click('[data-a="next"]');
  await page.waitForSelector('[data-testid=lab-body]');
};
// the UI redraws one tick after a 'change' (src/ui/core.js); wait for that redraw before reading the screen
const setInput = (sel, value) => page.evaluate(([s, v]) => { const el = document.querySelector(s); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); return new Promise(r => setTimeout(r, 20)); }, [sel, String(value)]);
const stage = () => page.getAttribute('[data-testid=lab-body]', 'data-stage');
const noHorizontalOverflow = () => G(() => {
  const vw = innerWidth, bad = [];
  for (const el of document.querySelectorAll('.vq-lecture .pixel-panel, .vq-lecture .lab-sec, .vq-lecture .pixel-tip-card, .vq-lecture .lesson-foot, .vq-lecture .lab-foot')) {
    const r = el.getBoundingClientRect();
    if (r.width && (r.right > vw + 1 || r.left < -1)) bad.push(el.className);
  }
  return bad;
});

try {
  await page.goto(offline.url);
  await G(() => { localStorage.removeItem('vanquest.save.v1'); localStorage.removeItem('vanquest.practice.v1'); });
  await page.reload(); await boot();
  await G(() => vq.game.act(s => { s.academy.lessons.scams = { attempts: 2, bestScore: 0.67, passed: true, completedDay: 3 }; }));   // a historical (pre-Round 5) record
  const before = await mainSnapshot();

  await step('academy layout: the lesson scrolls in a full-height panel; nothing clips; reading progress sits under the lesson', async () => {
    await openLesson('core03', 6);
    const m = await G(() => { const s = document.querySelector('.lesson-scroll'), left = document.querySelector('.lecture-panel-left');
      return { sh: s.scrollHeight, ch: s.clientHeight, panelH: left.getBoundingClientRect().height, scrollH: s.getBoundingClientRect().height, vh: innerHeight }; });
    assert.ok(m.panelH > m.vh * 0.85, 'left panel uses the screen height');
    assert.ok(m.scrollH > m.panelH * 0.6, 'lesson text gets most of the panel');
    assert.ok(m.sh > m.ch, 'a long lesson scrolls');
    await G(() => { const s = document.querySelector('.lesson-scroll'); s.scrollTop = s.scrollHeight; });
    assert.ok(await G(() => document.querySelector('.lesson-scroll').scrollTop > 0));
    assert.deepEqual(await noHorizontalOverflow(), []);
    assert.equal(await page.locator('.lesson-foot [data-a="study"]').count(), 1, 'MARK AS READ lives with the lesson');
    // every key-term card shows its whole definition (no single-line clipping)
    const clipped = await G(() => [...document.querySelectorAll('.tip-sub')].filter(e => getComputedStyle(e).whiteSpace === 'nowrap').length);
    assert.equal(clipped, 0);
    // the lesson text is the supplied course text, in full
    const lesson = await G(async () => (await import('./src/data/courses.js')).COURSES[2].lessons[6]);
    const shown = await page.textContent('.lesson-scroll');
    for (const b of lesson.blocks.filter(x => x.t === 'p' && !x.reveal)) assert.ok(shown.includes(b.text), `paragraph shown: ${b.text.slice(0, 40)}`);
  });

  await step('long tables scroll sideways inside the lesson instead of clipping', async () => {
    await page.click('[data-a="courses"]');
    await page.click('[data-a="open"][data-id="core01"]');
    const pages = await G(async () => (await import('./src/data/courses.js')).COURSES[0].lessons.length);
    for (let i = 0; i < pages + 1; i++) await page.click('[data-a="next"]');          // the glossary
    assert.match(await page.textContent('[data-testid=lesson-title]'), /Glossary/);
    assert.ok(await page.locator('.lesson-flow .table-wrap table').count() >= 1);
    assert.deepEqual(await noHorizontalOverflow(), []);
    await page.keyboard.press('Escape');
  });

  await step('Exercise A (budget): impossible allocations are refused; commit → surprise → month played → scored and recorded', async () => {
    await openLesson('core01', 1);
    assert.equal(await page.getAttribute('[data-testid=lab-body]', 'data-exercise'), 'budget');
    await setInput('[data-k="food"]', 999999);
    assert.match(await page.textContent('[data-testid=lab-body]'), /Money can't be created/);
    assert.equal(await page.isDisabled('[data-a="lab-commit"]'), true);
    const sc = await G(() => document.querySelector('[data-k="food"]').closest('tr').children[2].textContent);
    await setInput('[data-k="food"]', Number(sc.replace(/[^\d]/g, '')));
    await setInput('[data-k="goal"]', 500); await setInput('[data-k="emergency"]', 500);
    await page.click('[data-a="lab-commit"]');
    assert.equal(await stage(), 'shock');
    assert.match(await page.textContent('[data-testid=lab-body]'), /Unexpected:/);
    await page.click('[data-a="lab-run"]');
    assert.equal(await stage(), 'result');
    assert.match(await page.textContent('[data-testid=lab-score]'), /\d+\/100 PRACTICE SCORE/);
    assert.match(await page.textContent('[data-testid=lab-body]'), /THE MONTH, DAY BY DAY/);
    const p = await practice();
    assert.equal(p.lessons['core01:1'].attempts, 1);
    const seed = p.lessons['core01:1'].history[0].seed;
    await page.click('[data-a="lab-retry"]');
    assert.equal(await stage(), 'plan');
    await page.click('[data-a="lab-commit"]'); await page.click('[data-a="lab-run"]');
    const p2 = await practice();
    assert.equal(p2.lessons['core01:1'].history[1].seed, seed, 'RETRY replays the same scenario');
    await page.click('[data-a="lab-new"]');
    assert.equal(await stage(), 'plan');
    // reading, practice and the knowledge check are separate
    assert.match(await page.textContent('[data-testid=chip-read]'), /READ 0\/8/);
    assert.match(await page.textContent('[data-testid=chip-check]'), /NOT TAKEN/);
    await page.keyboard.press('Escape');
  });

  await step('Exercise B (saving): split accessible vs locked money; months play out with interest, FD and comparisons', async () => {
    await openLesson('core02', 4);
    assert.equal(await page.getAttribute('[data-testid=lab-body]', 'data-exercise'), 'saving');
    const lump = Number((await page.textContent('[data-testid=lab-body] .lab-table b')).replace(/[^\d]/g, ''));
    await setInput('[data-k="savings"]', 20000); await setInput('[data-k="fd"]', lump - 20000); await setInput('[data-k="cash"]', 0);
    assert.match(await page.textContent('.lab-sum'), /locked/);
    await page.click('[data-a="lab-run"]');
    assert.equal(await stage(), 'result');
    const t = await page.textContent('[data-testid=lab-body]');
    for (const s of ['FD (locked)', 'Savings (accessible)', 'Interest earned', 'COMPARE: OTHER PLANS']) assert.ok(t.includes(s), s);
    await page.keyboard.press('Escape');
  });

  await step('Exercise C (investing): build a mix, live through the fall, choose a reaction; luck is shown separately from skill', async () => {
    await openLesson('core03', 6);
    assert.equal(await page.getAttribute('[data-testid=lab-body]', 'data-exercise'), 'investing');
    for (const [k, v] of [['cash', 10], ['index', 60], ['bond', 30]]) await setInput(`[data-k="alloc.${k}"]`, v);
    assert.match(await page.textContent('.lab-sum'), /BALANCED/);
    await page.click('[data-a="lab-invest"]');
    assert.equal(await stage(), 'fall');
    await page.click('[data-a="lab-react"][data-v="hold"]');
    assert.equal(await stage(), 'result');
    const t = await page.textContent('[data-testid=lab-body]');
    assert.ok(t.includes('SKILL OR LUCK?') && t.includes('200 other market paths'));
    assert.ok(await page.locator('.lab-spark polyline').count() === 1);
    assert.equal(await page.isDisabled('[data-a="lab-reason"]'), true, 'reasoning feedback needs text and the AI service');
    await page.keyboard.press('Escape');
  });

  await step('Exercise D (safety): inspect evidence, decide, see the authoritative classification and what was missed', async () => {
    await openLesson('core04', 2);
    assert.equal(await page.getAttribute('[data-testid=lab-body]', 'data-exercise'), 'safety');
    const pitch = await page.textContent('[data-testid=vikram-pitch]');
    await page.click('[data-a="lab-inspect"][data-v="verify_provider"]');
    assert.equal(await page.locator('[data-testid=evidence] li').count(), 1);
    assert.equal(await page.textContent('[data-testid=vikram-pitch]'), pitch, 'the offer does not change while you inspect it');
    await page.click('[data-a="lab-decide"][data-v="reject"]');
    assert.equal(await stage(), 'result');
    const t = await page.textContent('[data-testid=lab-body]');
    assert.match(t, /SCAM \/ DANGEROUS OFFER|LEGITIMATE OPPORTUNITY|MODERATE-RISK OPPORTUNITY/);
    assert.ok(t.includes('THE EVIDENCE') && t.includes('NEXT TIME'));
    await page.keyboard.press('Escape');
  });

  await step('Exercise E (practice life): twelve months with offers and surprises → a whole-life report; it survives a reload', async () => {
    await G(() => vq.router.location('finance_academy'));
    await page.click('.vq-courses [data-a="life-open"]');
    await page.click('[data-a="life-new"]');
    for (let guard = 0; guard < 40; guard++) {
      if (await page.locator('[data-testid=life-report]').count()) break;
      if (await page.locator('[data-a="life-decide"]').count()) {
        await page.click('[data-a="life-inspect"][data-v="verify_provider"]');
        await page.click('[data-a="life-decide"][data-v="reject"]');
        await page.click('[data-a="life-dismiss"]');
        continue;
      }
      await page.click('[data-a="life-suggest"]');
      await page.click('[data-a="life-month"]');
    }
    assert.ok(await page.locator('[data-testid=life-report]').count(), 'the year finished');
    const overall = Number(await page.textContent('[data-testid=report-overall]'));
    assert.ok(overall >= 0 && overall <= 100);
    assert.equal(await page.locator('.lab-report .lab-bar').count(), 10, 'ten scored categories');
    const t = await page.textContent('[data-testid=life-report]');
    for (const s of ['YOUR YEAR IN NUMBERS', 'BEST DECISIONS', 'COSTLY MISTAKES', 'BUDGETING', 'INVESTING', 'RISK ASSESSMENT', 'SCAM DETECTION', 'ESSENTIAL NEEDS & QUALITY OF LIFE', 'THREE PRIORITIES', 'REPLAY CHALLENGE']) assert.ok(t.includes(s), s);
    const p = await practice();
    assert.equal(p.runs.length, 1);
    assert.equal(p.runs[0].report.overall, overall, 'the screen shows the recorded report');
    await page.keyboard.press('Escape');
    await page.reload(); await boot();
    await G(() => vq.router.location('finance_academy'));
    await page.click('.vq-courses [data-a="life-open"]');
    assert.equal(Number(await page.textContent('[data-testid=report-overall]')), overall, 'persisted in the practice store');
    await page.keyboard.press('Escape');
  });

  await step('isolation: after every exercise and a whole practice life, the live game and its save are byte-for-byte unchanged', async () => {
    const after = await mainSnapshot();
    assert.equal(after.save, before.save, 'saved game unchanged');
    assert.equal(after.state, before.state, 'in-memory game state unchanged (money, ledger, clock, items, property, loans, health, job)');
    assert.equal(after.profiles, before.profiles, 'character index unchanged');
    const keys = await G(() => Object.keys(localStorage).filter(k => k.startsWith('vanquest')).sort());
    // vanquest.profiles.v1 (Round 7) is written by the live game when it loads — before any practice — and is unchanged above
    assert.deepEqual(keys, ['vanquest.practice.v1', 'vanquest.profiles.v1', 'vanquest.save.v1']);
    assert.ok(await G(() => vq.game.state.academy.lessons.scams.passed), 'historical academy record kept');
  });

  await step('reading progress is still recorded separately (MARK AS READ) and the course cards show reading and practice apart', async () => {
    await openLesson('core01', 1);
    await page.click('[data-a="study"]');
    assert.match(await page.textContent('[data-testid=chip-read]'), /READ 1\/8/);
    assert.match(await page.textContent('[data-testid=reading-progress]'), /READ: 1 \/ 8/);
    await page.click('[data-a="courses"]');
    assert.match(await page.textContent('.course-card[data-course="core01"] [data-testid=course-status]'), /1\/8 LESSONS/);
    assert.match(await page.textContent('.course-card[data-course="core01"] [data-testid=course-practice]'), /PRACTICE \d\/8/);
    await page.keyboard.press('Escape');
  });

  await step('narrow screens: columns stack, the page scrolls, nothing overflows sideways', async () => {
    await page.setViewportSize({ width: 760, height: 900 });
    await openLesson('core02', 2);
    assert.deepEqual(await noHorizontalOverflow(), []);
    const cols = await G(() => getComputedStyle(document.querySelector('.lecture-overlay-container')).gridTemplateColumns.split(' ').length);
    assert.equal(cols, 1);
    assert.ok(await page.locator('[data-a="lab-run"]').count() === 1, 'the practice is still usable');
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  await step('offline: no AI service → built-in content everywhere, clearly labelled; the browser never contacts the model', async () => {
    await openLesson('core04', 3);
    assert.match(await page.textContent('.practice-lab .challenge-subtitle'), /AI: OFFLINE/);
    assert.doesNotMatch(await page.textContent('[data-testid=lab-body]'), /AI-WRITTEN/);
    assert.deepEqual(modelRequests, []);
    await page.keyboard.press('Escape');
  });

  await step('with the local AI service: Vikram\'s lines and the coach\'s note are model-written but validated; facts never change', async () => {
    await page.goto(online.url); await boot();
    await openLesson('core04', 5);
    await page.waitForFunction(() => /AI-WRITTEN LINES/.test(document.querySelector('[data-testid=lab-body]')?.textContent ?? ''), null, { timeout: 5000 });
    assert.match(await page.textContent('.practice-lab .challenge-subtitle'), /scripted-test-model/);
    const pitch = await page.textContent('[data-testid=vikram-pitch]');
    assert.match(pitch, /scripted|Listen —/);
    await page.click('[data-a="lab-decide"][data-v="reject"]');
    await page.waitForSelector('.lab-coach', { timeout: 5000 });
    assert.match(await page.textContent('.lab-coach'), /COACH'S NOTE/);
    // invalid model output (invented amounts, a link, a wrong score) is rejected → built-in content
    script.mode = 'invalid';
    await page.click('[data-a="lab-new"]');
    await page.waitForTimeout(800);
    assert.doesNotMatch(await page.textContent('[data-testid=lab-body]'), /AI-WRITTEN|999,999|example\.com/);
    await page.click('[data-a="lab-decide"][data-v="reject"]');
    await page.waitForTimeout(800);
    assert.equal(await page.locator('.lab-coach').count(), 0, 'no unvalidated coach text');
    assert.ok(script.calls.includes('pitch') && script.calls.includes('explanation'));
    assert.deepEqual(modelRequests, [], 'the browser only talks to /api/ai, never to the model');
    await page.keyboard.press('Escape');
  });

  assert.deepEqual(problems, [], 'no console errors');
  console.log('\nround 6 smoke test passed');
} finally {
  await browser.close();
  offline.server.close(); online.server.close();
}
