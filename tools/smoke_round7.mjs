// End-to-end test of Round 7 in headless Chromium: the title → first apartment → introduction → supplied
// goals quiz flow, returning players, local characters, the monthly newspaper and achievement pop-ups,
// manual retirement (refused, cancelled, confirmed once), automatic retirement at 60, the final life
// report (with a scripted local model, and its offline fallback), and an older save loading as a
// returning character.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
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
    script.calls.push(props.join(','));
    let data = {};
    if (props.includes('sections')) {
      const facts = JSON.parse(user.split('\n')[1]);
      const sections = Object.fromEntries(Object.entries(facts.criteria).map(([k, c]) => [k, { text: `Scripted review of ${c.name.toLowerCase()}: the verified findings above explain what happened here.`, refs: c.findings.flatMap(f => f.r).slice(0, 2) }]));
      data = { summary: 'Scripted summary: this life is described from the verified record only, with every claim tied to the evidence the game recorded.', sections,
        improvements: [{ text: 'Scripted suggestion: look at your weakest area first and change one habit.', refs: [] }] };
      if (script.mode === 'invalid') data.summary += ' You saved ₹99,99,999 and were evicted.';
    }
    const v = validate(data);
    return v.ok ? { ok: true, data: v.value, attempts: 1, ms: 1 } : { ok: false, reason: 'invalid', detail: v.errors.join('; '), attempts: 3, ms: 1 };
  },
};

const { server, url, base } = serve({ llm: fakeLLM });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const problems = [];
page.on('console', m => { if (m.type() === 'error' || (m.type() === 'warning' && !/GL|WebGL/.test(m.text()))) problems.push(m.text()); });
page.on('pageerror', e => problems.push(e.message));
page.on('dialog', d => d.accept());

const step = async (name, fn) => {
  process.stdout.write(`• ${name} … `);
  try { await fn(); } catch (e) { const shot = join(tmpdir(), 'vanquest-round7-failure.png'); await page.screenshot({ path: shot }).catch(() => {}); console.log(`FAILED (screenshot: ${shot})`); throw e; }
  console.log('ok');
};
const G = (fn, arg) => page.evaluate(fn, arg);
const ready = () => page.waitForFunction(() => window.game?.scene?.getScene('City')?.traffic && window.vq, null, { timeout: 15000 });
const quiet = () => G(() => { vq.settings.passiveTime = false; vq.settings.randomEncounters = false; });
const boot = async () => { await ready(); await quiet(); await page.waitForTimeout(250); };
const closeUi = () => page.keyboard.press('Escape');
const panel = () => G(() => vq.ui.panel?.constructor.name ?? null);
const feed = () => G(() => vq.game.act(s => { for (const id of ['rice_5kg', 'atta_5kg', 'dal_1kg', 'oil_1l', 'milk_1l', 'veg_1kg']) s.pantry[id] = 3000; }));
const fund = a => G(x => vq.game.act(s => { s.ledger.push({ id: s.nextId++, day: s.day, account: 'wallet', amount: x, category: 'test', memo: 'test funds', status: 'ok' }); }), a);
const QUIZ = await (async () => { const m = await import('../src/data/goalsQuiz.js'); return m.QUIZ; })();

try {
  await page.goto(url);
  await G(() => localStorage.clear());

  await step('first launch: title → Enter spawns the new character inside the Elm Court flat with the introduction; time waits', async () => {
    await page.goto(base);
    await page.waitForSelector('.vq-title .title-screen-container');
    assert.match(await page.textContent('.vq-title'), /A new life starts at 18/);
    await ready();
    await page.click('.vq-title [data-a="start"]');
    await page.waitForSelector('[data-testid=intro]');
    await page.waitForFunction(() => game.scene.isActive('Home'));
    assert.equal(await G(() => game.scene.getScene('Home').homeId), 'home_apartment', 'spawned in the cheapest rented flat');
    assert.equal(await G(() => vq.game.state.housing.propertyId), 'home_apartment');
    await page.waitForTimeout(1200);
    assert.equal(await G(() => vq.game.state.day), 0, 'the clock does not run while the introduction is open');
    assert.match(await page.textContent('.backdrop'), /Next:/);
    await page.click('[data-a="next"]');
    assert.match(await page.textContent('[data-testid=intro]'), /Vikram/);
    await page.click('[data-testid=intro-continue]');
    await page.waitForSelector('[data-testid=goals-quiz]');
    assert.equal(await G(() => vq.game.state.onboarding.introDone), true);
  });

  await step('goals quiz: the supplied questions and options, validated; leaving midway keeps the answers', async () => {
    assert.equal(await page.textContent('.vq-journey .question.active h3'), QUIZ.questions[0].question);
    assert.deepEqual(await page.locator('.vq-journey .option').allTextContents(), QUIZ.questions[0].options.map(o => o.symbol + o.label));
    assert.match(await G(() => getComputedStyle(document.querySelector('.vq-journey .btn-primary')).backgroundColor), /166, 25, 46/, 'supplied design tokens');
    await page.click('[data-testid=quiz-next]');
    await page.waitForSelector('[data-testid=quiz-error]');
    await page.click('.vq-journey .option[data-v="Own a car or vehicle"]');
    await page.click('[data-testid=quiz-next]');
    assert.equal(await page.textContent('.vq-journey .question.active h3'), QUIZ.questions[1].question);
    await page.locator('.vq-journey input[type=range]').fill('27');
    await page.locator('.vq-journey input[type=range]').dispatchEvent('change');
    assert.equal(await page.textContent('[data-testid=age-value]'), '27');
    await page.click('[data-testid=quiz-next]');
    await page.click('.vq-journey .option[data-v="Build savings"]');
    await page.click('[data-testid=quiz-next]');
    await page.click('.vq-journey [data-a="exit"]');                       // leave at question 4
    assert.equal(await panel(), null);
    assert.deepEqual(await G(() => [vq.game.state.goals.draft.step, vq.game.state.goals.draft.answers.goal, vq.game.state.goals.draft.answers.age]), [3, 'Own a car or vehicle', 27]);
    await page.goto(base); await page.waitForSelector('.vq-title'); await ready();
    await page.click('.vq-title [data-a="start"]');
    await page.waitForTimeout(400);
    assert.equal(await panel(), null, 'a returning character is not pushed through onboarding again');
  });

  await step('goals quiz: resumed from the Life panel, reviewed and submitted once', async () => {
    await quiet();
    await page.keyboard.press('KeyL');
    await page.waitForSelector('text=Finish the goals quiz');
    await page.click('text=Finish the goals quiz');
    await page.waitForSelector('[data-testid=goals-quiz]');
    assert.equal(await page.textContent('.vq-journey .question.active h3'), QUIZ.questions[3].question, 'resumes where you left off');
    for (const pick of ['Part-time or freelance income', 'Learn how to save', 'Beginner', 'Prefer safer choices', 'Within 4–10 years', 'A mix of everything', 'INR (₹)']) {
      await page.click(`.vq-journey .option[data-v="${pick}"]`); await page.click('[data-testid=quiz-next]');
    }
    await page.waitForSelector('[data-testid=quiz-review]');
    const cards = await page.locator('.vq-journey .summary-card strong').allTextContents();
    assert.deepEqual(cards.slice(0, 3), ['Own a car or vehicle', 'Age 27', 'Build savings']);
    await page.click('[data-testid=quiz-next]');
    await page.waitForSelector('text=Saved. Your goals are now part of');
    assert.equal(await G(() => vq.game.act(s => s.goals.original && 0) && vq.game.state.goals.original.token) !== null, true);
    const again = await G(async () => { const { submitGoals } = await import('./src/sim/goals.js'); const t = vq.game.state.goals.original.token; return vq.game.act(s => submitGoals(s, s.goals.original.answers, t)).reason; });
    assert.equal(again, 'duplicate', 'a repeated submission (double click / retry) is refused');
    const g = await G(() => ({ o: vq.game.state.goals.original, r: vq.game.state.goals.revisions.length, run: vq.game.state.character.runId }));
    assert.equal(g.o.answers.goal, 'Own a car or vehicle'); assert.equal(g.o.answers.age, 27); assert.equal(g.r, 0, 'a double click records one original');
    assert.equal(g.o.runId, g.run);
    await page.click('[data-testid=quiz-next]');
    await page.keyboard.press('KeyL');
    await page.waitForSelector('[data-testid=goal-status]');
    assert.match(await page.textContent('[data-testid=goal-status]'), /Own a car or vehicle/);
    assert.equal(await page.isDisabled('[data-testid=retire-btn]'), true, 'not eligible yet');
    assert.match(await page.textContent('.backdrop'), /haven't bought a car/);
    await page.click('[data-a="guide"]');
    await page.waitForSelector('[data-testid=intro]');
    await page.click('[data-testid=intro-continue]');
    assert.equal(await panel(), null, 'the guide reopens and closes without the quiz');
  });

  await step('newspaper: one issue a month from the simulation\'s figures, a badge, and an achievement pop-up', async () => {
    await feed();
    await page.click('.topbar [data-a="month"]');
    await page.waitForSelector('[data-testid=ach-toast]');
    assert.match(await page.textContent('[data-testid=ach-toast]'), /Achievement unlocked/);
    assert.ok(await G(() => vq.game.state.achievements.unlocked.some(a => a.id === 'first-paycheck')), 'first salary → First Paycheck');
    assert.equal(await page.textContent('[data-testid=news-badge]'), '1');
    await page.keyboard.press('KeyN');
    await page.waitForSelector('[data-testid=news-issue]');
    const shown = await page.locator('[data-testid=news-market] tr[data-asset]').evaluateAll(rs => rs.map(r => [r.dataset.asset, r.children[3].textContent, r.children[4].textContent]));
    const truth = await G(async () => { const { price } = await import('./src/sim/market.js'); const i = vq.game.state.newspaper.issues[0]; return i.assets.map(a => [a.id, `₹${Math.round(price(vq.game.state, a.id, i.end) * 100) / 100}`, `${a.pct > 0 ? '+' : ''}${a.pct}%`]); });
    assert.deepEqual(shown, truth);
    assert.match(await page.textContent('[data-testid=news-issue]'), /Past performance does not guarantee future returns/);
    const html = await page.innerHTML('[data-testid=news-market]');
    await closeUi();
    assert.equal(await page.isHidden('[data-testid=news-badge]'), true, 'read');
    await page.keyboard.press('KeyN');
    await page.waitForSelector('[data-testid=news-issue]');
    assert.equal(await page.innerHTML('[data-testid=news-market]'), html, 'reopening shows the same issue');
    assert.equal(await G(() => vq.game.state.newspaper.issues.length), 1);
    await closeUi();
  });

  let firstId, firstSnapshot;
  await step('characters: a second character starts fresh in the flat; the first is kept and resumes unchanged', async () => {
    firstId = await G(() => vq.game.state.character.profileId);
    firstSnapshot = await G(() => JSON.stringify({ d: vq.game.state.day, l: vq.game.state.ledger.length, g: vq.game.state.goals.original.answers }));
    await page.goto(base); await page.waitForSelector('.vq-title'); await ready();
    await page.click('[data-testid=title-characters]');
    await page.click('[data-a="new"]');
    await page.fill('[data-testid=new-name]', 'Ravi <b>');
    await Promise.all([page.waitForNavigation(), page.click('[data-a="create"]')]);
    await ready();
    await page.waitForSelector('[data-testid=intro]');
    assert.equal(await G(() => game.scene.getScene('Home').homeId), 'home_apartment');
    assert.deepEqual(await G(() => [vq.game.state.character.name, vq.game.state.day, vq.game.state.goals.original]), ['Ravi b', 0, null]);
    await page.click('[data-testid=intro-continue]');
    await page.click('.vq-journey [data-a="exit"]');
    await page.goto(base); await page.waitForSelector('.vq-title'); await ready();
    await page.click('[data-testid=title-characters]');
    assert.equal(await page.locator('[data-testid=profile-row]').count(), 2);
    await Promise.all([page.waitForNavigation(), page.click(`[data-testid=profile-row][data-id="${firstId}"] [data-a="play"]`)]);
    await boot();
    assert.equal(await G(() => JSON.stringify({ d: vq.game.state.day, l: vq.game.state.ledger.length, g: vq.game.state.goals.original.answers })), firstSnapshot);
  });

  await step('manual retirement: cancel changes nothing; confirming ends active play once, with the full report', async () => {
    await feed(); await fund(800000);
    await G(() => import('./src/sim/vehicles.js').then(m => vq.game.act(s => m.buyVehicle(s, 'hatch', 'buy-car'))));
    await page.keyboard.press('KeyL');
    await page.waitForSelector('[data-testid=retire-btn]:not([disabled])');
    await page.click('[data-testid=retire-btn]');
    await page.waitForSelector('[data-testid=retire-confirm]');
    assert.equal(await page.isDisabled('[data-testid=retire-confirm]'), true, 'needs the acknowledgement');
    const before = await G(() => JSON.stringify(vq.game.state));
    await page.click('[data-testid=retire-cancel]');
    assert.equal(await G(() => JSON.stringify(vq.game.state)), before, 'cancel changes nothing');
    await page.keyboard.press('KeyL');
    await page.click('[data-testid=retire-btn]');
    await page.click('[data-testid=retire-ack]');
    await page.dblclick('[data-testid=retire-confirm]');
    await page.waitForSelector('[data-testid=final-report]');
    assert.equal(await G(() => vq.game.state.status), 'retired');
    assert.match(await page.textContent('[data-testid=final-report]'), /Manual retirement/);
    for (const k of ['investing', 'budgeting', 'saving', 'risk', 'quality', 'goals']) assert.equal(await page.locator(`[data-testid=score-${k}]`).count(), 1, k);
    await page.waitForFunction(() => vq.game.state.life.final.narrative.status !== 'none');
    assert.equal(await G(() => vq.game.state.life.final.narrative.source), 'ai');
    assert.match(await page.textContent('[data-testid=final-report]'), /Scripted summary/);
    await page.click('[data-a="tab"][data-v="money"]');
    assert.match(await page.textContent('[data-testid=crit-risk]'), /Verified from your record/);
    assert.match(await page.textContent('[data-testid=crit-investing]'), /AI interpretation/);
    await page.click('[data-a="tab"][data-v="achievements"]');
    assert.ok(await page.locator('[data-testid=ach-unlocked]').count() >= 3);
    assert.ok(await page.locator('.vq-report [data-testid=ach-unlocked][data-id="first-paycheck"]').count() === 1);
    await page.click('[data-a="tab"][data-v="growth"]');
    await page.waitForSelector('[data-testid=growth]');
    // nothing moves any more
    const day = await G(() => vq.game.state.day);
    await G(() => vq.game.advance(5));
    assert.equal(await G(() => [vq.game.state.day, vq.game.act(s => s).reason].join()), `${day},life_ended`);
    const report = await G(() => JSON.stringify(vq.game.state.life.final)), calls = script.calls.length;
    await page.reload(); await ready();
    assert.match(await page.textContent('.vq-title .title-resume'), /retired — enter to see the final report/);
    await page.click('.vq-title [data-a="start"]');
    await page.waitForSelector('[data-testid=final-report]');
    assert.equal(await G(() => JSON.stringify(vq.game.state.life.final)), report, 'reopening never re-runs the evaluation');
    assert.equal(script.calls.length, calls, 'nor asks the model again');
  });

  await step('a new life after retirement: the retired character and its report stay in the list (read-only)', async () => {
    await Promise.all([page.waitForNavigation(), page.click('[data-a="restart"]')]);
    await boot();
    assert.deepEqual(await G(() => [vq.game.state.status, vq.game.state.day]), ['alive', 0]);
    await G(() => vq.router.characters());
    await page.click(`[data-testid=profile-row][data-id="${firstId}"] [data-a="report"]`);
    await page.waitForSelector('[data-testid=final-report]');
    assert.match(await page.textContent('[data-testid=final-report]'), /A past life/);
    await page.click('[data-a="close-report"]');
    await closeUi();
  });

  await step('automatic retirement at 60, on the birthday, before that day\'s bills; an invalid model answer falls back', async () => {
    script.mode = 'invalid';
    await G(() => vq.game.act(s => { s.day = 15339; s.housing.paidMonth = '2068-06'; for (const id of ['rice_5kg', 'atta_5kg', 'dal_1kg', 'oil_1l', 'milk_1l', 'veg_1kg']) s.pantry[id] = 300; }));
    await page.click('.topbar [data-a="day"]');
    await page.click('.topbar [data-a="day"]');
    await page.waitForSelector('[data-testid=final-report]');
    assert.equal(await page.textContent('[data-testid=end-age]'), '60');
    assert.match(await page.textContent('[data-testid=final-report]'), /Automatic retirement at 60/);
    assert.equal(await G(() => vq.game.state.ledger.filter(e => e.day === vq.game.state.day).length), 0, 'no July 2068 salary or rent');
    await page.waitForFunction(() => vq.game.state.life.final.narrative.status !== 'none');
    assert.equal(await G(() => vq.game.state.life.final.narrative.status), 'fallback', 'the invented claim was rejected');
    assert.match(await page.textContent('[data-testid=final-report]'), /Written by the game from your record/);
    assert.doesNotMatch(await page.textContent('[data-testid=final-report]'), /99,99,999/);
  });

  await step('an older save loads as a returning character: no onboarding, history marked as partly unrecorded', async () => {
    const raw = readFileSync(new URL('../tests/fixtures/round4_save.json', import.meta.url), 'utf8');
    await G(r => localStorage.setItem('vanquest.save.v1', r), raw);
    await page.goto(base); await page.waitForSelector('.vq-title'); await ready();
    assert.match(await page.textContent('.vq-title .title-resume'), /Continue/);
    await page.click('.vq-title [data-a="start"]');
    await page.waitForTimeout(400);
    assert.equal(await panel(), null);
    assert.deepEqual(await G(() => [vq.game.state.version, vq.game.state.character.legacy, vq.game.state.onboarding.introDone]), [5, true, true]);
    assert.ok(await G(() => !!localStorage.getItem('vanquest.save.v1.backup-v3')));
    await G(() => import('./src/sim/lifeEnd.js').then(m => vq.game.act(s => m.finalizeLife(s, 'retired_manual'))));
    await page.waitForSelector('[data-testid=final-report]');
    assert.match(await page.textContent('[data-testid=final-report]'), /began before Round 7/);
  });

  assert.deepEqual(problems, [], 'no console errors/warnings');
  console.log('\nround 7 smoke test passed');
} finally {
  await browser.close();
  server.close();
}
