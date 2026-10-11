// Round 7 — the final life report page, the monthly newspaper and achievement pop-ups.
// The report page and the pop-ups use the supplied achievement design (Assets/supplied-ui/achievements →
// skins/achievements.css): its panels, trophy cards, rarity labels and the drop-down toast with confetti.
// Everything shown comes from the saved report (sim/lifeReport.js) or issue (sim/newspaper.js). The local
// model's wording is requested at most ONCE per report / issue and stored; it is always labelled, and the
// verified numbers next to it come from the game, not the model.
import { ai } from '../ai/client.js';
import { lifeFacts, fallbackLife, newsInput } from '../ai/narratives.js';
import { renderIssue, markRead, monthName, PAPER } from '../sim/newspaper.js';
import { lifeSummary, CATEGORY_LABELS } from '../sim/summary.js';
import { achievementDef } from '../sim/achievements.js';
import { SUPPLIED_FOOTER } from '../data/achievements.js';
import { inr, fmtDate } from '../sim/util.js';
import { esc } from './core.js';

const pctTxt = x => `${Math.round(x * 1000) / 10}%`;
const TITLE = { death: 'This life has ended', retired_age: 'Retired at 60', retired_manual: 'Retired' };
const ICON = { death: '🕯️', retired_age: '🌅', retired_manual: '🏁' };

// ===================================================================================== final report
export class FinalReportPanel {
  constructor(game, report, { archived = false, onRestart, onCharacters, onBack } = {}) {
    Object.assign(this, { game, report, archived, onRestart, onCharacters, onBack });
    this.title = TITLE[report.ending.kind]; this.locked = !archived; this.allowAfterLife = true; this.tab = 'overview';
    if (!archived && report.narrative?.status === 'none') this.requestNarrative();
  }
  async requestNarrative() {
    if (FinalReportPanel.pending) return;
    FinalReportPanel.pending = true; this.waiting = true;
    const r = await ai.task('life_report', lifeFacts(this.report));
    FinalReportPanel.pending = false; this.waiting = false;
    const status = ai.status;
    // stored once, whatever the outcome; later openings show exactly this
    this.game.act(s => {
      const f = s.life.final;
      if (f.narrative?.status !== 'none') return;
      f.narrative = r.ok ? { status: 'done', source: 'ai', model: status?.model ?? null, runtime: status?.runtime ?? null, day: s.day, data: r.data }
        : { status: 'fallback', reason: r.reason ?? 'unavailable', day: s.day };
    }, { afterLife: true });
    this.report = this.game.state.life.final;
  }
  narrative() {
    const n = this.report.narrative;
    if (n?.status === 'done') return { ...n.data, label: `AI interpretation — written by ${esc(n.model ?? 'the local model')} from the verified record above; every number and evidence id was checked.` };
    return { ...fallbackLife(this.report), label: this.waiting ? 'Asking the local AI model for a written review… (the verified findings are already final)' : `Written by the game from your record${n?.status === 'fallback' ? ' (the local AI model was not available)' : ''}.` };
  }

  frame() {
    const r = this.report, e = r.ending, n = this.narrative(), tab = this.tab;
    const tabs = [['overview', 'Overview'], ['money', 'Money & investing'], ['life', 'Life & goals'], ['achievements', `Achievements (${r.achievements.unlocked.length})`], ['growth', 'Areas to grow']];
    const body = { overview: () => this.overview(n), money: () => this.money(n), life: () => this.life(n), achievements: () => this.achievements(), growth: () => this.growth(n) }[tab]();
    return `<div class="vq-ach vq-report" data-testid="final-report" data-scroll="report"><div class="wrap">
      <header><div><div class="eyebrow">${this.archived ? 'A past life' : 'Final life report'} · ${esc(r.character.name ?? '')}</div><div class="brand">VAN<span>QUEST</span></div>
          <div class="sub">${esc(e.label)} at <b data-testid="end-age">${e.age}</b> · ${esc(e.date)} · ${r.years} years in the game</div></div>
        <div class="header-actions">${this.archived ? '<button class="btn" data-a="close-report">Close</button>' : `<button class="btn" data-a="chars">Characters</button><button class="btn primary" data-a="restart">Start a new life</button>`}</div></header>
      <section class="hero"><div class="panel"><div class="eyebrow">${ICON[e.kind]} ${esc(e.kind === 'death' ? 'Died' : e.kind === 'retired_age' ? 'Automatic retirement at 60' : 'Manual retirement')}</div>
          <h1>${esc(TITLE[e.kind])}</h1><p>${esc(n.summary)}</p><p class="report-label">${n.label}</p>
          <div class="stats"><div class="stat"><strong data-testid="rating">${esc(r.rating)}</strong><small>Overall rating</small></div><div class="stat"><strong data-testid="overall">${r.overall}/100</strong><small>Overall score</small></div>
            <div class="stat"><strong>${r.achievements.unlocked.length}</strong><small>Achievements · ${r.achievements.xp} XP</small></div></div></div>
        <div class="panel"><h2>Category scores</h2>${Object.values(r.criteria).map(c => `<div class="score-row" data-testid="score-${c.key}"><span>${esc(c.name)}</span><b>${c.score == null ? 'not assessed' : `${c.score}`}</b>
            <i class="score-bar"><i style="width:${c.score ?? 0}%"></i></i></div>`).join('')}
          ${r.caps.map(c => `<p class="report-cap">${esc(c)}</p>`).join('')}</div></section>
      <div class="filters report-tabs">${tabs.map(([k, l]) => `<button class="filter ${k === tab ? 'active' : ''}" data-a="tab" data-v="${k}">${esc(l)}</button>`).join('')}</div>
      ${body}
      <footer>${esc(SUPPLIED_FOOTER)} The verified findings come from your character's recorded history; the written review is advisory and never changes a score.</footer></div></div>`;
  }

  findings(c, n) {
    const ev = this.report.evidence, chip = id => `<span class="ev" title="${esc(ev[id]?.text ?? '')}">${esc(id)}</span>`;
    const ai = n.sections?.[c.key];
    return `<div class="panel crit" data-testid="crit-${c.key}"><h2>${esc(c.name)} <span class="crit-score">${c.score == null ? 'not assessed' : `${c.score}/100`}</span></h2>
      <div class="eyebrow">Verified from your record</div><ul class="findings">${c.findings.map(f => `<li class="f-${f.kind}"><b>${{ strength: '✔', weakness: '✘', note: '•', limitation: '?' }[f.kind]}</b> ${esc(f.text)} ${f.refs.map(chip).join('')}</li>`).join('')}</ul>
      ${ai ? `<div class="eyebrow">${this.report.narrative?.status === 'done' ? 'AI interpretation' : 'Summary'}</div><p class="ai-text">${esc(ai.text)} ${ai.refs.map(chip).join('')}</p>` : ''}
      ${c.limitation ? `<p class="report-cap">Not enough evidence: ${esc(c.limitation)}</p>` : ''}</div>`;
  }

  overview(n) {
    const r = this.report, s = r.snapshot, death = r.ending.kind === 'death' && !this.archived ? this.deathStory() : '';
    return `${death}<div class="panel"><h2>Final financial snapshot</h2><table class="rt" data-testid="snapshot">
        <tr><td>Cash</td><td>${inr(s.cash)}</td><td>Savings account</td><td>${inr(s.savings)}</td></tr>
        <tr><td>Fixed deposits (locked)</td><td>${inr(s.fixedDeposits)}</td><td>Investments (trading desk)</td><td>${inr(s.investments)}</td></tr>
        <tr><td>Property</td><td>${inr(s.property)}</td><td>Vehicles</td><td>${inr(s.vehicles)}</td></tr>
        <tr><td>Owed (loans, deposits, bills)</td><td>${inr(s.debt)}</td><td><b>Net worth</b></td><td><b>${inr(s.netWorth)}</b></td></tr>
        <tr><td>Accessible right away</td><td>${inr(s.accessible)}</td><td>Job at the end</td><td>${esc(s.job)} (${inr(s.salary)}/month)</td></tr></table></div>
      ${r.limitations.length ? `<div class="panel"><h2>What the record can and can't tell</h2><ul class="findings">${r.limitations.map(l => `<li class="f-limitation">${esc(l)}</li>`).join('')}</ul></div>` : ''}`;
  }

  deathStory() {
    const s = this.game.state, L = lifeSummary(s);
    const big = Object.entries(L.spent).filter(([k]) => !['grocery_plan', 'rent'].includes(k)).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `<li>${esc(CATEGORY_LABELS[k] ?? k)}: ${inr(v)}</li>`).join('');
    return `<div class="panel gameover"><h2>What led here</h2><p>On ${fmtDate(s.death.day)}, after a long period without enough food, your character became seriously ill and did not recover.</p><ul>
        <li>Days without enough food: <b>${L.stats.daysUnfed}</b> (very hungry on ${L.stats.daysHungry}).</li>
        <li>Total spent on food: <b>${inr(L.foodSpend)}</b>${L.lastFoodDay !== null ? `, last food bought ${fmtDate(L.lastFoodDay)}` : ', no food bought'}.</li>
        <li>Monthly grocery plan: <b>${esc(L.planStatus)}</b>.</li><li>Failed payments: ${L.failedPayments}. Wallet at the end: ${inr(L.wallet)}.</li></ul>
      ${big ? `<h3>Other spending</h3><ul>${big}</ul>` : ''}
      <p>Food is a need that comes first. An active grocery plan, a week's reserve in the pantry, and keeping enough money aside for essentials before buying wants would have prevented this.</p></div>`;
  }

  money(n) {
    const r = this.report, inv = r.criteria.investing, cats = inv.metrics.categories ?? [], rk = inv.rankings;
    const name = k => esc(cats.find(c => c.key === k)?.name ?? k), list = ks => (ks?.length ? ks.map(name).join(', ') : '—');
    const table = cats.length ? `<div class="panel"><h2>Investment categories</h2><table class="rt" data-testid="inv-table"><tr><th>Category</th><th>Own money in</th><th>Realised</th><th>Unrealised (still held)</th><th>Fees / penalties</th><th>Return</th><th>Per year</th><th>Risk</th><th>History</th></tr>
        ${cats.map(c => `<tr data-cat="${esc(c.key)}"><td>${esc(c.name)}<div class="muted">${esc(c.detail)}</div></td><td>${inr(c.capital)}</td><td>${inr(c.realized)}</td><td>${inr(c.unrealized)}</td><td>${inr(c.fees)}</td>
          <td>${pctTxt(c.roc)}</td><td>${c.span >= 90 ? pctTxt(c.annual) : '—'}</td><td>${esc(c.risk)}</td><td>${c.enough ? 'enough to judge' : '<b>too little</b>'}</td></tr>`).join('')}</table>
        <p class="muted">Realised = profit or loss actually taken (sales, matured deposits, settled offers). Unrealised = the change in value of what you still held at the end — not money in hand, and not counted twice. Rankings use return relative to the money and time involved, never the biggest rupee gain.</p>
        <div class="rank-grid"><div><b>Best performing</b><br>${list(rk.best)}</div><div><b>Worst performing</b><br>${list(rk.worst)}</div><div><b>Strongest decisions</b><br>${list(rk.strongestDecisions)}</div>
          <div><b>Unnecessary / poorly understood risk</b><br>${list(rk.unnecessaryRisk)}</div><div><b>Too little history to judge</b><br>${list(rk.insufficient)}</div></div></div>` : '';
    return table + ['investing', 'budgeting', 'saving', 'risk'].map(k => this.findings(r.criteria[k], n)).join('');
  }

  life(n) { return ['quality', 'goals'].map(k => this.findings(this.report.criteria[k], n)).join(''); }

  growth(n) {
    const r = this.report, imp = r.improvements;
    return `<div class="panel" data-testid="growth"><h2>Areas to grow</h2>${imp.focus.map(f => `<div class="grow"><h3>${esc(f.name)} — ${f.score}/100</h3>${f.because.length ? `<ul class="findings">${f.because.map(b => `<li class="f-weakness">${esc(b)}</li>`).join('')}</ul>` : ''}<p><b>Try next time:</b> ${esc(f.advice)}</p></div>`).join('')}
      ${imp.strengths.length ? `<h2 style="margin-top:14px">Strengths</h2><ul class="findings">${imp.strengths.map(s => `<li class="f-strength"><b>${esc(s.name)} (${s.score})</b> ${s.because.map(esc).join(' ')}</li>`).join('')}</ul>` : ''}
      ${n.improvements?.length ? `<div class="eyebrow" style="margin-top:12px">${r.narrative?.status === 'done' ? 'AI suggestions' : 'Suggestions'}</div><ul class="findings">${n.improvements.map(x => `<li>${esc(x.text)}</li>`).join('')}</ul>` : ''}</div>`;
  }

  achievements() {
    const a = this.report.achievements;
    const card = (x, on) => `<article class="achievement ${on ? 'unlocked' : ''}" data-testid="${on ? 'ach-unlocked' : 'ach-locked'}" data-id="${esc(x.id)}"><div class="iconbox">${x.icon}</div><div><h3>${esc(x.name)}</h3><p>${esc(x.desc)}</p>
        ${on ? `<p class="why">✔ ${esc(x.why)}${x.day != null ? ` · ${fmtDate(x.day)}` : ''}</p>` : x.why ? `<p class="why">Not tracked: ${esc(x.why)}</p>` : ''}
        <div class="meta"><span class="rarity ${x.rarity.toLowerCase()}">${esc(x.rarity)}</span><span class="xp">+${x.xp} XP</span><span class="locked-label">${on ? '✓ Unlocked' : '🔒 Locked'}</span>${x.addition ? '<span class="locked-label">VanQuest addition</span>' : ''}</div></div></article>`;
    return `<div class="toolbar"><div><div class="eyebrow">Trophy room</div><h2 style="margin:5px 0 0">Unlocked in this life</h2></div></div>
      <div class="grid">${a.unlocked.map(x => card(x, true)).join('') || '<div class="empty">No achievements in this life.</div>'}</div>
      <div class="toolbar"><div><div class="eyebrow">Still to earn</div><h2 style="margin:5px 0 0">Locked</h2></div></div><div class="grid">${a.locked.map(x => card(x, false)).join('')}</div>
      <details class="panel" style="margin-top:14px"><summary>Supplied achievements this version of the game can't track (${a.untracked.length})</summary><div class="grid" style="margin-top:10px">${a.untracked.map(x => card(x, false)).join('')}</div></details>`;
  }

  onAction(a, el) {
    if (a === 'tab') { this.tab = el.dataset.v; document.querySelector('[data-scroll=report]')?.scrollTo?.(0, 0); }
    if (a === 'restart') this.onRestart?.();
    if (a === 'chars') this.onCharacters?.();
    if (a === 'close-report') this.onBack?.();
  }
}

// ===================================================================================== newspaper
export class NewspaperPanel {
  constructor(game, id = null) {
    this.game = game; this.title = PAPER; this.sub = 'Fictional markets · educational, not investment advice'; this.allowAfterLife = true;
    const issues = game.state.newspaper?.issues ?? [];
    this.id = id ?? issues.at(-1)?.id ?? null;
    this.open(this.id);
  }
  open(id) {
    this.id = id;
    const i = this.issue;
    if (!i) return;
    if (!i.read) this.game.act(s => markRead(s, id), { afterLife: true });
    if (this.issue.aiStatus === 'none' && !NewspaperPanel.pending) this.requestAI(id);
  }
  get issue() { return this.game.state.newspaper?.issues.find(i => i.id === this.id) ?? null; }
  async requestAI(id) {
    NewspaperPanel.pending = true;
    const issue = this.issue, r = await ai.task('newspaper', newsInput(issue));
    NewspaperPanel.pending = false;
    const st = ai.status;
    this.game.act(s => {
      const i = s.newspaper.issues.find(x => x.id === id);
      if (!i || i.aiStatus !== 'none') return;                       // decided once, then frozen
      if (r.ok) Object.assign(i, { aiStatus: 'done', ai: { ...r.data, model: st?.model ?? null } }); else Object.assign(i, { aiStatus: 'failed', aiReason: r.reason ?? 'unavailable' });
    }, { afterLife: true });
  }
  render() {
    const issues = this.game.state.newspaper?.issues ?? [], i = this.issue;
    const list = [...issues].reverse().slice(0, 120).map(x => `<button class="news-item ${x.id === this.id ? 'on' : ''}" data-a="issue" data-id="${x.id}">${x.read ? '' : '● '}${esc(monthName(x.month))}</button>`).join('');
    if (!i) return '<div class="empty" data-testid="news-empty">No issues yet — the first edition comes out on the 1st of next month.</div>';
    const d = renderIssue(i), A = i.aiStatus === 'done' ? i.ai : null, aiOf = id => A?.assets?.find(x => x.id === id)?.text;
    return `<div class="news-layout"><nav class="news-list" data-scroll="news-list">${list}</nav><article class="paper" data-testid="news-issue" data-id="${i.id}">
      <div class="paper-mast">${esc(PAPER)}</div><div class="paper-date">${esc(monthName(i.month))} edition · published ${fmtDate(i.day)}</div>
      <h2 class="paper-head">${esc(A?.headline ?? d.headline)}</h2><p class="paper-lead">${esc(A?.lead ?? d.lead)}</p>
      ${A ? `<p class="paper-ai">Wording by ${esc(A.model ?? 'the local AI model')}, checked against the simulation's figures below.</p>` : ''}
      <h3>Markets this month <span class="muted">(simulation data)</span></h3>
      <table class="t" data-testid="news-market"><tr><th>Asset</th><th>Type · risk</th><th class="n">Start</th><th class="n">End</th><th class="n">Change</th><th class="n">Range</th></tr>
        ${i.assets.map(a => { const x = d.assets.find(y => y.id === a.id); return `<tr data-asset="${a.id}"><td>${esc(x.name)}</td><td>${esc(x.type)} · ${esc(x.risk)}</td><td class="n">₹${a.open}</td><td class="n">₹${a.close}</td><td class="n ${a.pct > 0 ? 'pos' : a.pct < 0 ? 'neg' : ''}">${a.pct > 0 ? '+' : ''}${a.pct}%</td><td class="n">₹${a.low}–₹${a.high}</td></tr>`; }).join('')}</table>
      ${d.assets.map(x => `<div class="paper-asset"><b>${esc(x.name)}.</b> ${esc(aiOf(x.id) ?? x.text)}<div class="muted">Before deciding: ${esc(x.question)}</div></div>`).join('')}
      <h3>Housing</h3><p>${esc(d.housing)}</p><h3>Interest rates</h3><p>${esc(d.rates)}</p>
      ${d.safety ? `<div class="paper-safety"><h3>${esc(d.safety.title)}</h3><ul>${d.safety.signs.map(f => `<li>${esc(f)}</li>`).join('')}</ul><p>${esc(A?.safety ?? d.safety.text)}</p></div>` : ''}
      <p class="paper-disclaimer">${esc(d.disclaimer)}</p></article></div>`;
  }
  onAction(a, el) { if (a === 'issue') this.open(el.dataset.id); }
}

// ===================================================================================== achievement pop-ups (supplied toast)
export function installAchievementToasts(game) {
  const host = Object.assign(document.createElement('div'), { className: 'vq-ach toast-host' });
  host.innerHTML = '<div class="toast-zone" aria-live="polite"></div><div class="confetti"></div>';
  document.getElementById('ui').append(host);
  const zone = host.querySelector('.toast-zone'), conf = host.querySelector('.confetti'), queue = [];
  let busy = false;
  const next = () => {
    const a = queue.shift();
    if (!a) { busy = false; return; }
    busy = true;
    zone.innerHTML = '';
    const node = document.createElement('div');
    node.className = 'toast'; node.dataset.testid = 'ach-toast';
    node.innerHTML = `<div class="toast-icon">${a.icon}</div><div><div class="toast-kicker">Achievement unlocked · ${esc(a.rarity)}</div><h3>${esc(a.name)}</h3><p>${esc(a.desc)}</p></div><div class="toast-right">+${a.xp} XP</div><button class="toast-close" aria-label="Close">×</button>`;
    zone.append(node);
    requestAnimationFrame(() => node.classList.add('show'));
    conf.innerHTML = Array.from({ length: 34 }, (_, i) => `<i class="particle" style="left:${(i * 37) % 100}%;animation-delay:${(i % 8) * 0.05}s;background:${['#f6c453', '#ef4444', '#78a9ff', '#57d6a0', '#d9a4ff'][i % 5]}"></i>`).join('');
    const hide = () => { if (!node.isConnected) return; node.classList.remove('show'); node.classList.add('hide'); setTimeout(() => { node.remove(); conf.innerHTML = ''; next(); }, 360); };
    node.querySelector('.toast-close').onclick = hide;
    setTimeout(hide, 5200);
  };
  game.on((_, notes) => {
    const fresh = notes.filter(n => n.achievement).map(n => achievementDef(n.achievement)).filter(Boolean);
    queue.push(...fresh.slice(-4));                     // a year skip can unlock several: show the last few
    if (!busy && queue.length) next();
  });
}
