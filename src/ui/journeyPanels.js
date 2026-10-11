// Round 7 — the player's journey: characters (local profiles), the first-day introduction, the supplied
// goals quiz (Assets/supplied-ui/journey → skins/journey.css), the Life panel with RETIRE, and the
// retirement confirmation. All rules live in src/sim (profiles.js, goals.js, lifeEnd.js); these panels
// only show them and call game.act / game.newCharacter / game.switchTo.
import { QUIZ, QUIZ_DEFAULTS, KEY_BY_INDEX, AGE_RANGE, AGE_LABELS, AGE_UNSURE_LABEL, AGE_NOTE_DEFAULT, ageBand, ageNote,
  SUMMARY_FIELDS, SUMMARY_NOTE_DEFAULT, summaryNote, showIncomeFollowup, INCOME_FOLLOWUP, FOOTER, HEADER } from '../data/goalsQuiz.js';
import { goalsRecord, saveDraft, submitGoals, startRevision, currentGoals, goalStatus, retirementEligibility, confirmGoal } from '../sim/goals.js';
import { retire } from '../sim/lifeEnd.js';
import { ageOn, retirementDay } from '../sim/character.js';
import { listProfiles, readArchive, cleanName } from '../sim/profiles.js';
import { overview } from '../sim/networth.js';
import { loanName } from '../sim/loans.js';
import { LOCATIONS } from '../data/locations.js';
import { achievementDef } from '../sim/achievements.js';
import { inr, fmtDate } from '../sim/util.js';
import { esc, newToken } from './core.js';

const ENDING = { death: 'Died', retired_age: 'Retired at 60', retired_manual: 'Retired by choice' };
export const isFresh = s => !s.onboarding?.introDone && !s.onboarding?.legacy && s.day === (s.character?.startDay ?? 0) && s.ledger.length <= 1;

// ===================================================================================== characters
export class CharacterPanel {
  constructor(game, { onPlay, onNew, onReport } = {}) {
    Object.assign(this, { game, onPlay, onNew, onReport });
    this.title = 'Characters'; this.sub = 'Saved on this browser'; this.allowAfterLife = true;
    this.name = ''; this.msg = null; this.creating = false;
  }
  render() {
    const list = listProfiles(this.game.storage, this.game.state);
    const row = p => {
      const status = p.ending ? `${esc(ENDING[p.ending.kind] ?? p.ending.label)} at ${p.ending.age} · ${esc(p.ending.rating)} (${p.ending.overall}/100)` : p.status === 'alive' ? `Age ${p.age ?? '—'} · ${fmtDate(p.day)}` : esc(p.status);
      const acts = [p.ending ? `<button class="btn sm" data-a="report" data-id="${p.id}">Final report</button>` : '',
        p.status === 'alive' ? (p.active ? '<button class="btn sm primary" data-a="play-active">Continue</button>' : `<button class="btn sm primary" data-a="play" data-id="${p.id}">Play</button>`) : ''].join(' ');
      return `<tr data-testid="profile-row" data-id="${p.id}"><td><b>${esc(p.name)}</b>${p.active ? ' <span class="tag ok">CURRENT</span>' : ''}${p.legacy ? ' <span class="tag">FROM AN EARLIER VERSION</span>' : ''}
        <div class="muted">${status}${p.goal ? ` · goal: ${esc(p.goal)}` : ''}</div></td><td class="n">${p.netWorth != null ? inr(p.netWorth) : '—'}</td><td class="n">${acts}</td></tr>`;
    };
    const msg = this.msg ? `<div class="msg ${this.msg.kind}">${esc(this.msg.text)}</div>` : '';
    return `${msg}<table class="t"><tr><th>Character</th><th class="n">Net worth</th><th></th></tr>${list.map(row).join('')}</table>
      ${this.creating ? `<div class="card" style="margin-top:10px"><label>Character name (optional, 1–24 characters — not your real name)<br>
          <input data-testid="new-name" maxlength="24" value="${esc(this.name)}" placeholder="e.g. Asha" style="margin-top:6px;width:240px"></label>
          <p class="muted">A new character starts at 18 in the Elm Court flat with ₹15,000. Your other characters stay saved.</p>
          <div class="row"><button class="btn primary" data-a="create">Start this life</button><button class="btn" data-a="cancel-new">Cancel</button></div></div>`
        : '<div class="row" style="margin-top:10px"><button class="btn primary" data-a="new">+ New character</button></div>'}
      <p class="muted" style="margin-top:12px;font-size:12px">Characters are stored only in this browser on this device. They are not an online account: nothing is uploaded, no password protects them, and clearing your browser data deletes them.</p>`;
  }
  onInput(el) { if (el.dataset.testid === 'new-name') { this.name = el.value; return false; } }
  onAction(a, el) {
    const name = document.querySelector('[data-testid=new-name]')?.value ?? this.name;
    if (a === 'new') this.creating = true;
    if (a === 'cancel-new') this.creating = false;
    if (a === 'create') { const r = this.game.newCharacter(cleanName(name, '')); if (!r.ok) this.msg = { kind: 'error', text: r.reason === 'storage_full' ? 'This browser is out of storage space, so a new character could not be saved. Nothing was changed.' : 'Could not create the character.' }; else this.onNew?.(); }
    if (a === 'play-active') this.onPlay?.(false);
    if (a === 'play') { const r = this.game.switchTo(el.dataset.id); if (r.ok) this.onPlay?.(true); else this.msg = { kind: 'error', text: r.reason === 'storage_full' ? 'Out of storage space — nothing was changed.' : 'That character\'s save could not be opened.' }; }
    if (a === 'report') {
      const id = el.dataset.id, active = id === this.game.state.character?.profileId;
      const s = active ? this.game.state : readArchive(this.game.storage, id);
      if (s?.life?.final) this.onReport?.(s.life.final, { archived: !active });
      else this.msg = { kind: 'error', text: 'That report could not be read.' };
    }
  }
}

// ===================================================================================== introduction
const GUIDE = [
  ['🧑', 'Who you are', 'You are 18, just starting your financial life with ₹15,000, a part-time retail job (₹10,000 on the 1st of each month) and a rented flat at Elm Court (₹3,000 a month).'],
  ['🚶', 'Move & interact', 'WASD / arrow keys or click to walk. Walk up to a door or person and press <b>E</b>. Shops, the bank, the college and the trading tower all open that way.'],
  ['🛒', 'Shops & food', 'FreshCart sells groceries — food first: hunger hurts your health. A monthly grocery plan delivers on the 1st. Check your pantry with <b>P</b>.'],
  ['💼', 'Work, study & money', 'Ashford College leads to better jobs. Nidhi Bank has savings and fixed deposits; Summit Tower has (fictional) investments; the property agent rents and sells homes.'],
  ['📊', 'Your numbers', 'The side panel shows cash, savings, net worth, hunger and health. <b>O</b> finances · <b>H</b> history · <b>I</b> inventory.'],
  ['🕵️', 'Vikram', 'A friendly stranger sometimes offers "opportunities". Some are honest, some are scams — ask for evidence, investigate and check the risks before committing money.'],
  ['🎓', 'The academy', 'The four VanQuest Core Courses teach budgeting, saving, investing and safety, with a separate Practice Lab that never touches your real money.'],
  ['📰', 'Newspaper & your life', 'Each month <b>N</b> brings a newspaper explaining the simulated markets. <b>L</b> shows your age, goals and the RETIRE option. When your character dies or retires (automatically at 60), you get a final life report and achievements.'],
];
export class IntroPanel {
  constructor(game, { first = false, onDone } = {}) {
    Object.assign(this, { game, first, onDone });
    this.title = first ? 'Welcome to your first day' : 'Guide'; this.sub = 'How VanQuest works'; this.page = 0;
  }
  render() {
    const per = 4, pages = Math.ceil(GUIDE.length / per), items = GUIDE.slice(this.page * per, this.page * per + per);
    return `<div class="grid intro-grid" data-testid="intro">${items.map(([i, h, t]) => `<div class="card intro-card"><div class="intro-ico">${i}</div><h3>${esc(h)}</h3><p>${t}</p></div>`).join('')}</div>
      <div class="row between" style="margin-top:10px"><span class="muted">${this.page + 1} / ${pages}${this.first ? ' · Time is paused while you read.' : ''}</span>
        <span class="row">${this.page ? '<button class="btn" data-a="prev">◂ Back</button>' : ''}${this.page < pages - 1 ? '<button class="btn primary" data-a="next">More ▸</button>' : ''}
        <button class="btn ${this.page === pages - 1 ? 'primary' : ''}" data-a="done" data-testid="intro-continue">${this.first ? 'Continue → your goals' : 'Continue'}</button></span></div>
      ${this.first ? '<div class="msg ok" style="margin-top:10px"><b>Next:</b> tell the game what you want from life (a short goals quiz). You can reopen this guide any time from the Life panel (<b>L</b>).</div>' : ''}`;
  }
  onAction(a) {
    if (a === 'next') this.page++;
    if (a === 'prev') this.page--;
    if (a === 'done') { if (this.first) this.game.act(s => { s.onboarding.introDone = true; s.onboarding.introDay = s.day; }); this.onDone?.(); }
  }
}

// ===================================================================================== goals quiz (supplied design)
const STEP_COUNT = QUIZ.steps.length;           // 10 questions; QUIZ.questions[10] = the review page
const REVIEW = QUIZ.questions[STEP_COUNT];
export class GoalsQuizPanel {
  constructor(game, { revise = false, onDone } = {}) {
    Object.assign(this, { game, revise, onDone });
    this.title = 'Financial journey setup'; this.locked = false;
    const g = goalsRecord(game.state);
    if (revise && !g.revising) game.act(s => startRevision(s));
    const d = goalsRecord(game.state).draft;
    this.answers = { ...QUIZ_DEFAULTS, ...(d?.answers ?? {}) };
    this.step = d?.step ?? 0; this.token = newToken(); this.error = null; this.done = null;
  }
  get g() { return goalsRecord(this.game.state); }
  persist() { this.game.act(s => saveDraft(s, this.answers, this.step)); }
  frame() {
    const review = this.step >= STEP_COUNT, q = QUIZ.questions[Math.min(this.step, STEP_COUNT)], a = this.answers;
    const stepN = Math.min(this.step + 1, STEP_COUNT);
    const steps = QUIZ.steps.map((t, i) => `<li class="${i === this.step ? 'active' : i < this.step ? 'done' : ''}"><span class="step-dot">${i + 1}</span> ${esc(t)}</li>`).join('');
    let body;
    if (review) {
      const cards = SUMMARY_FIELDS.map(([k, f]) => `<div class="summary-card"><span>${esc(k)}</span><strong>${esc(f(a))}</strong></div>`).join('');
      body = `<section class="question active" data-testid="quiz-review"><div class="q-num">${esc(REVIEW.label)}</div><h3>${esc(REVIEW.question)}</h3><p class="subtext">${esc(REVIEW.subtext)}</p>
        <div class="summary-grid">${cards}</div><div class="note">${esc(this.done ? 'Saved. Your goals are now part of this character\'s life record — the final report will compare your life with them.' : summaryNote(a))}</div>
        <div class="field ${showIncomeFollowup(a) ? '' : 'hidden'}"><label for="expectedIncome">${esc(INCOME_FOLLOWUP.label)}</label><select id="expectedIncome" data-k="expectedIncome">${INCOME_FOLLOWUP.options.map(o => `<option${o === a.expectedIncome ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select><p class="small-muted">${esc(INCOME_FOLLOWUP.note)}</p></div></section>`;
    } else if (this.step === 1) {                                  // the supplied target-age slider
      body = `<section class="question active"><div class="q-num">${esc(q.label)}</div><h3>${esc(q.question)}</h3><p class="subtext">${esc(q.subtext)}</p>
        <div class="slider-wrap"><div class="age-display"><div><div class="small-muted">Your target age</div><div class="age-number"><span data-testid="age-value">${a.ageUnsure ? '—' : a.age}</span><small> years old</small></div></div><div class="pill">${a.ageUnsure ? 'Timeline TBD' : ageBand(a.age)}</div></div>
          <input data-k="age" type="range" min="${AGE_RANGE.min}" max="${AGE_RANGE.max}" step="${AGE_RANGE.step}" value="${a.age}" aria-label="Target age"${a.ageUnsure ? ' disabled' : ''}>
          <div class="range-labels">${AGE_LABELS.map(l => `<span>${esc(l)}</span>`).join('')}</div></div>
        <label class="checkline"><input type="checkbox" data-k="ageUnsure"${a.ageUnsure ? ' checked' : ''}> ${esc(AGE_UNSURE_LABEL)}</label>
        <div class="note">${esc(a.ageUnsure ? AGE_NOTE_DEFAULT : ageNote(a.age))}</div></section>`;
    } else {
      const key = q.key;
      body = `<section class="question active" data-testid="quiz-q" data-key="${key}"><div class="q-num">${esc(q.label)}</div><h3>${esc(q.question)}</h3>${q.subtext ? `<p class="subtext">${esc(q.subtext)}</p>` : ''}
        <div class="options" data-name="${key}">${q.options.map(o => `<button class="option ${a[key] === o.value ? 'selected' : ''}" data-a="opt" data-v="${esc(o.value)}"><span class="symbol">${esc(o.symbol)}</span>${esc(o.label)}</button>`).join('')}</div>
        ${a[key] === 'Skipped' ? '<div class="note">Skipped for now — you can choose an answer or leave it skipped.</div>' : ''}</section>`;
    }
    const err = this.error ? `<div class="note quiz-error" data-testid="quiz-error">${esc(this.error)}</div>` : '';
    const panelTitle = (review ? REVIEW : q).panelTitle, panelDesc = (review ? REVIEW : q).panelDesc;
    return `<div class="vq-journey" data-testid="goals-quiz" data-scroll="quiz"><div class="shell">
      <header class="topbar"><div class="wordmark">${esc(HEADER.wordmark[0])}<span>${esc(HEADER.wordmark[1])}</span></div><div class="top-meta">${esc(HEADER.meta)}</div>
        <button class="btn btn-secondary" data-a="exit" title="Your answers are kept; finish later from the Life panel (L)">${this.done ? 'Close' : 'Save &amp; exit'}</button></header>
      <div class="layout"><aside class="sidebar"><div class="eyebrow">${esc(QUIZ.sidebar.eyebrow)}</div><h1>${esc(QUIZ.sidebar.heading)}</h1><p>${esc(QUIZ.sidebar.intro)}</p>
          ${this.revise ? '<p class="note">You are revising your goals. Your original answers stay on record; this becomes a dated revision.</p>' : ''}
          <div class="progress-label"><span>Journey setup</span><span>${review ? 'Complete' : `${stepN} of ${STEP_COUNT}`}</span></div>
          <div class="progress"><span style="width:${review ? 100 : stepN * 10}%"></span></div><ul class="steps">${steps}</ul><div class="privacy">${QUIZ.sidebar.privacy}</div></aside>
        <main class="content"><div class="content-head"><div><div class="eyebrow">${esc(HEADER.panelEyebrow)}</div><h2>${esc(panelTitle)}</h2><p>${esc(panelDesc)}</p></div><div class="pill">${esc(HEADER.pill)}</div></div>
          <div class="form-area">${body}${err}</div>
          <div class="actions"><button class="btn btn-secondary" data-a="back"${this.step === 0 || this.done ? ' disabled' : ''}>← Back</button>
            <div class="action-right">${this.done ? '' : `<button class="btn btn-secondary" data-a="skip">${review ? 'Start over' : 'Skip for now'}</button>`}
              <button class="btn btn-primary" data-a="next" data-testid="quiz-next"${this.busy ? ' disabled' : ''}>${this.done ? 'Start playing →' : review ? 'Finish setup ✓' : this.step === STEP_COUNT - 1 ? 'Review journey →' : 'Continue →'}</button></div></div></main></div>
      <footer>${esc(FOOTER.replace('Your answers stay in this demo session.', 'Your answers are saved with this character, on this device only.'))}</footer></div></div>`;
  }
  onInput(el) {
    const k = el.dataset.k;
    if (k === 'age') this.answers.age = Number(el.value);
    if (k === 'ageUnsure') this.answers.ageUnsure = el.checked;
    if (k === 'expectedIncome') this.answers.expectedIncome = el.value;
    this.persist();
  }
  onAction(a, el) {
    this.error = null;
    if (this.done) { if (a === 'next' || a === 'exit') this.onDone?.(this.done); return; }
    const key = KEY_BY_INDEX[this.step];
    if (a === 'opt') { this.answers[key] = el.dataset.v; this.persist(); return; }
    if (a === 'exit') { this.persist(); this.onDone?.(null); return; }
    if (a === 'back') { this.step = Math.max(0, this.step - 1); this.persist(); return; }
    if (a === 'skip') {
      if (this.step >= STEP_COUNT) { this.answers = { ...QUIZ_DEFAULTS }; this.step = 0; this.persist(); return; }    // supplied "Start over"
      if (key && !this.answers[key]) this.answers[key] = 'Skipped';
      if (this.step === 1) this.answers.ageUnsure = true;
      this.step++; this.persist(); return;
    }
    if (a === 'next') {
      if (this.step < STEP_COUNT) {
        if (key && !this.answers[key]) { this.error = 'Choose an answer, or press "Skip for now".'; return; }
        this.step++; this.persist(); return;
      }
      this.busy = true;
      const r = this.game.act(s => submitGoals(s, this.answers, this.token));
      this.busy = false;
      if (r.ok || r.reason === 'duplicate') { this.done = r.record ?? currentGoals(this.game.state); return; }
      this.error = r.errors?.join(' ') ?? (r.reason === 'already_submitted' ? 'Your goals were already recorded.' : 'Could not save your goals.');
    }
  }
  onClose() { if (!this.done) this.persist(); }
}

// ===================================================================================== life panel
export class LifePanel {
  constructor(game, router) { this.game = game; this.router = router; this.title = 'Your life'; this.msg = null; this.ack = false; }
  get sub() { const s = this.game.state; return `${esc(s.character?.name ?? '')} · age ${ageOn(s)}`; }
  render() {
    const s = this.game.state, c = s.character, g = s.goals ?? {}, cur = currentGoals(s), st = cur ? goalStatus(s, cur) : null, el = retirementEligibility(s);
    const rDay = retirementDay(s), years = Math.max(0, Math.floor((rDay - s.day) / 365.25));
    const rec = (r, label) => `<tr><td>${label}</td><td>${fmtDate(r.day)} (age ${r.age ?? '—'})</td><td><b>${esc(r.answers.goal)}</b>${r.goals.targetAge ? ` by ${r.goals.targetAge}` : ' (no target age)'}<div class="muted">First priority: ${esc(r.answers.priority ?? '—')} · risk: ${esc(r.answers.risk ?? '—')}</div></td></tr>`;
    const goalsHtml = cur ? `<table class="t"><tr><th></th><th>Recorded</th><th>Goal</th></tr>${rec(g.original, 'Original')}${(g.revisions ?? []).map((r, i) => rec(r, `Revision ${i + 1}`)).join('')}</table>
        <div class="msg ${['achieved', 'confirmed'].includes(st.status) ? 'ok' : ''}" data-testid="goal-status"><b>Current goal:</b> ${esc(cur.goals.main.choice)} — ${esc({ achieved: 'achieved', confirmed: 'confirmed by you', in_progress: 'in progress', not_yet: 'not yet', needs_confirmation: 'only you can say' }[st.status] ?? st.status)}.
          ${esc(st.text ?? st.evidence ?? '')}${cur.goals.main.test ? `<div class="muted">How the game measures it: ${esc(cur.goals.main.test)}</div>` : ''}</div>
        ${st.status === 'needs_confirmation' ? `<div class="card"><label><input type="checkbox" data-a="ack-goal"${this.ackGoal ? ' checked' : ''}> I have honestly achieved "${esc(cur.goals.main.choice)}".</label>
          <p class="muted">The game can't measure this goal, so it records your confirmation (dated) instead of guessing. It counts for retirement and appears in your final report as player-confirmed.</p>
          <button class="btn" data-a="confirm-goal"${this.ackGoal ? '' : ' disabled'}>Confirm goal achieved</button></div>` : ''}
        <div class="row" style="margin-top:6px"><button class="btn" data-a="revise">Revise my goals</button></div>`
      : `<div class="msg warn">You haven't recorded your goals yet. ${goalsRecord(s).draft ? 'Your quiz answers so far are saved.' : ''}</div><button class="btn primary" data-a="quiz">${goalsRecord(s).draft ? 'Finish the goals quiz' : 'Take the goals quiz'}</button>`;
    const retireHtml = el.eligible
      ? `<div class="msg ok">Your goal is met — you may retire now, or keep playing until your 60th birthday.</div><button class="btn danger" data-a="retire" data-testid="retire-btn">RETIRE…</button>`
      : `<div class="msg">Manual retirement opens once your goal is achieved. ${el.unmet?.length ? `Still to do: ${el.unmet.map(esc).join(' ')}` : ''}</div><button class="btn danger" data-a="retire" data-testid="retire-btn" disabled title="Not yet eligible">RETIRE</button>`;
    const got = (s.achievements?.unlocked ?? []).map(u => achievementDef(u.id)).filter(Boolean);
    return `<div class="specs"><b>AGE</b><span data-testid="age">${ageOn(s)}</span><b>BORN</b><span>${fmtDate(c.birthDay)}</span><b>RETIRES</b><span>${fmtDate(rDay)} — 60th birthday (${years} year${years === 1 ? '' : 's'} away)</span>
        <b>NET WORTH</b><span>${inr(overview(s).netWorth)}</span></div>
      <h3 style="margin-top:12px">Goals</h3>${goalsHtml}
      <h3 style="margin-top:12px">Retirement</h3>${retireHtml}
      <h3 style="margin-top:12px">Achievements so far (${got.length})</h3><div class="row" style="flex-wrap:wrap;gap:6px">${got.map(a => `<span class="tag gold" title="${esc(a.desc)}">${a.icon} ${esc(a.name)}</span>`).join('') || '<span class="muted">None yet.</span>'}</div>
      ${this.msg ? `<div class="msg ${this.msg.kind}" style="margin-top:8px">${esc(this.msg.text)}</div>` : ''}
      <div class="row" style="margin-top:12px"><button class="btn" data-a="guide">Reopen the guide</button><button class="btn" data-a="news">Newspaper (N)</button><button class="btn" data-a="chars">Characters</button></div>`;
  }
  onAction(a) {
    const r = this.router;
    if (a === 'quiz') r.quiz();
    if (a === 'revise') r.quiz({ revise: true });
    if (a === 'guide') r.intro();
    if (a === 'news') r.news();
    if (a === 'chars') r.characters();
    if (a === 'retire') r.retire();
    if (a === 'ack-goal') this.ackGoal = !this.ackGoal;
    if (a === 'confirm-goal' && this.ackGoal) { const x = this.game.act(s => confirmGoal(s)); this.msg = x.ok ? { kind: 'ok', text: 'Recorded: you confirmed this goal.' } : { kind: 'error', text: 'Could not record that.' }; }
  }
}

// ===================================================================================== retirement confirmation
export class RetirePanel {
  constructor(game, { onDone } = {}) { this.game = game; this.onDone = onDone; this.title = 'Retire this character?'; this.narrow = true; this.token = newToken(); this.ack = false; this.msg = null; }
  render() {
    const s = this.game.state, o = overview(s), el = retirementEligibility(s), cur = currentGoals(s), st = cur ? goalStatus(s, cur) : null;
    const obligations = [
      ...s.loans.filter(l => l.status === 'active').map(l => `${loanName(l)}: ${inr(l.balance)} owed (EMI ${inr(l.emi)}/month)`),
      ...(s.housing?.kind === 'rent' ? [`Renting ${LOCATIONS[s.housing.propertyId].name} at ${inr(s.housing.rent)}/month`] : []),
      ...Object.entries(s.properties).filter(([, p]) => p.tenant).map(([id]) => `A tenant lives in ${LOCATIONS[id].name}`),
      ...s.bank.fds.filter(f => f.status === 'active').map(f => `Fixed deposit of ${inr(f.principal)} matures ${fmtDate(f.maturityDay)}`),
      ...(s.groceryPlan?.status === 'active' ? ['Monthly grocery plan active'] : []),
    ];
    return `<div class="specs"><b>AGE</b><span>${ageOn(s)}</span><b>NET WORTH</b><span>${inr(o.netWorth)}</span><b>CASH + SAVINGS</b><span>${inr(o.assets.cash + o.assets.savings)}</span>
        <b>FIXED DEPOSITS</b><span>${inr(o.assets.fixedDeposits)}</span><b>INVESTMENTS</b><span>${inr(o.assets.investments)}</span><b>PROPERTY</b><span>${inr(o.assets.property)}</span><b>OWED</b><span>${inr(o.totalLiabilities)}</span></div>
      <p><b>Goal:</b> ${cur ? `${esc(cur.goals.main.choice)} — ${esc(st.status === 'confirmed' ? 'confirmed by you' : st.status)}` : 'none recorded'}</p>
      ${obligations.length ? `<p><b>Ongoing obligations</b> (they stop with retirement — the report records them as they stand):</p><ul>${obligations.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      <div class="msg error"><b>This ends active play for this character, permanently.</b> Time stops, and your final life report and achievements are created once and saved. Goals met don't guarantee a high rating — the report judges the whole life.</div>
      ${el.eligible ? '' : `<div class="msg warn">Not eligible yet: ${el.unmet.map(esc).join(' ')}</div>`}
      ${this.msg ? `<div class="msg error">${esc(this.msg)}</div>` : ''}
      <label class="row" style="margin-top:8px"><input type="checkbox" data-a="ack" data-testid="retire-ack"${this.ack ? ' checked' : ''}${el.eligible ? '' : ' disabled'}> I understand: retiring ends this character's active life.</label>
      <div class="row" style="margin-top:10px"><button class="btn danger" data-a="confirm" data-testid="retire-confirm"${this.ack && el.eligible ? '' : ' disabled'}>Confirm retirement</button><button class="btn primary" data-a="close" data-testid="retire-cancel">Cancel — keep playing</button></div>`;
  }
  onAction(a) {
    if (a === 'ack') this.ack = !this.ack;
    if (a !== 'confirm' || !this.ack) return;
    const r = this.game.act(s => retire(s, this.token));
    if (r.ok) this.onDone?.(); else this.msg = r.reason === 'not_eligible' ? `Not eligible: ${r.unmet.join(' ')}` : 'Retirement did not go through — nothing was changed.';
  }
}

