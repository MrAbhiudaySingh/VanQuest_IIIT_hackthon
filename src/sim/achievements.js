// Achievements (Round 7). The catalogue is the supplied one (data/achievements.js, generated from the
// supplied pop-up frontend) plus four VanQuest additions. Eligibility is decided HERE, by deterministic
// rules over the recorded history — never by the AI. Each unlock stores the day and evidence ids, is kept
// once per id (no duplicates), and is frozen into the final life report when the life ends.
//
// Some supplied achievements describe things this game does not record (practice-scenario scores, a side
// business, travel, a retirement plan tool, reviewing budget categories, helping another character).
// They are listed as UNTRACKED with the reason and can never be unlocked — rather than being guessed.
import { SUPPLIED_ACHIEVEMENTS } from '../data/achievements.js';
import { ENCOUNTERS } from '../data/encounters.js';
import { COURSES } from '../data/courses.js';
import { price } from './market.js';
import { goalStatus } from './goals.js';
import { essentialMonthly } from './lifeLog.js';
import { inr } from './util.js';

export const ADDITIONS = [
  { id: 'steady-saver', name: 'Steady Saver', desc: 'Spend less than you earn in at least 75% of your months, over two years or more.', icon: '🐖', rarity: 'Rare', xp: 150, group: 'Money', addition: true },
  { id: 'balanced-life', name: 'Balanced Life', desc: 'Live five or more years without going hungry, losing your home or falling ill — and still enjoy some of your money.', icon: '⚖️', rarity: 'Epic', xp: 300, group: 'Life', addition: true },
  { id: 'fi-reached', name: 'Financially Independent', desc: 'Hold cash, savings, deposits and investments worth 25 years of your essential costs.', icon: '🏝️', rarity: 'Legendary', xp: 600, group: 'Money', addition: true },
  { id: 'goal-keeper', name: 'Promise Kept', desc: 'Achieve the goal from your goals quiz by the age you chose.', icon: '🎯', rarity: 'Epic', xp: 300, group: 'Planning', addition: true },
];
export const UNTRACKED = {
  'needs-before-wants': 'The game does not record which purchases you considered and turned down.',
  'staying-consistent': 'Scored scenarios belong to the academy Practice Lab, which is separate from your character\'s life.',
  '75-percent': 'Scored scenarios belong to the academy Practice Lab, which is separate from your character\'s life.',
  'compound-curious': 'Compound-growth challenges belong to the academy Practice Lab, which is separate from your character\'s life.',
  'side-quest': 'There are no businesses to start in this version of the game.',
  'world-explorer': 'There is no travel in this version of the game.',
  'retirement-ready': 'The game has no retirement-planning tool yet.',
  'spreadsheet-wizard': 'The game does not record which budget screens you looked at.',
  'npc-advisor': 'You can\'t advise other characters in this version of the game.',
};
export const CATALOGUE = [...SUPPLIED_ACHIEVEMENTS, ...ADDITIONS];
export const achievementDef = id => CATALOGUE.find(a => a.id === id);
const enc = Object.fromEntries(ENCOUNTERS.map(e => [e.id, e]));

// Each rule returns { day, refs, why } when earned, else null. ctx: { log, ending }.
const RULES = {
  'first-savings': s => { let bank = 0; for (const e of s.ledger) if (e.account === 'bank' && e.status === 'ok') { bank += e.amount; if (bank >= 1000) return hit(e.day, [`L${e.id}`], `Your savings account reached ${inr(bank)}.`); } return null; },
  'goal-setter': s => { const o = s.goals?.original; return o && !['Skipped', null].includes(o.answers.goal) && !o.answers.ageUnsure ? hit(o.day, ['G-original'], `You chose "${o.answers.goal}" by age ${o.answers.age}.`) : null; },
  'budget-architect': (s, c) => { const r = c.log.find(r => r.flow.earned > 0 && r.surplus >= 0 && !r.failed && !r.unfed); return r ? hit(r.day, [`M${r.month}`], `${r.month}: earnings covered spending, every bill was paid and you never went hungry.`) : null; },
  'knowledge-seeker': s => first(Object.entries(s.academy.courses ?? {}).filter(([, r]) => r.check?.passed).map(([id, r]) => hit(r.check.completedDay ?? r.completedDay ?? s.day, [], `Passed the knowledge check of "${COURSES.find(c => c.id === id)?.title ?? id}".`))),
  'freshman-spawn': s => (s.education ? hit(s.education.enrolledDay, [], 'Enrolled at Ashford College.') : null),
  'first-paycheck': s => { const e = s.ledger.find(e => e.category === 'salary' && e.status === 'ok'); return e ? hit(e.day, [`L${e.id}`], `First salary: ${inr(e.amount)}.`) : null; },
  'scam-smart': s => { const r = s.encounters.log.find(r => r.status === 'declined' && ['scam', 'misleading'].includes(enc[r.id]?.verdict)); return r ? hit(r.day, [r.uid], `Turned down "${enc[r.id].offer.name}".`) : null; },
  'ahead-of-plan': (s, c) => {
    for (const rec of [s.goals?.original, ...(s.goals?.revisions ?? [])].filter(Boolean)) {
      if (!rec.goals.main.measurable || rec.goals.targetAge == null) continue;
      const g = goalStatus(s, rec);
      if (g.status !== 'achieved' || g.age >= rec.goals.targetAge) continue;
      const after = c.log.find(r => r.day > g.day), unfed = after ? after.statsAt.daysUnfed : s.stats.daysUnfed;
      if (!unfed) return hit(g.day, g.refs ?? [], `"${rec.goals.main.choice}" achieved at ${g.age}, before your target of ${rec.goals.targetAge}, without going hungry.`);
    }
    return null;
  },
  'debt-slayer': s => { const l = s.loans.find(l => l.status === 'closed' && !l.missedDays?.length && !s.ledger.some(e => e.loan === l.uid && ['loan_settlement', 'repossession'].includes(e.category))); return l ? hit(l.closedDay, [l.uid], `Repaid a ${inr(l.principal)} loan in full, never missing an EMI.`) : null; },
  'emergency-legend': (s, c) => reserve(c, 6),
  'rainy-day': (s, c) => reserve(c, 3),
  'diversification': (s, c) => { const r = c.log.find(r => r.mix.classes >= 3 && r.mix.topShare <= 0.6); return r ? hit(r.day, [`M${r.month}`], `${r.month}: ${r.mix.classes} kinds of investment, none above 60% of the total.`) : null; },
  'first-investment': s => { const t = s.brokerage.trades.find(t => t.side === 'buy'); return t ? hit(t.day, [`T${t.id}`], `Bought ${t.qty} ${t.asset} — the trading desk shows each asset's risk level before you buy.`) : null; },
  'degree-unlocked': s => (s.education?.status === 'graduated' ? hit(s.education.graduationDay, [], 'Graduated from Ashford College.') : null),
  'scholar-realm': s => { const done = COURSES.map(c => s.academy.courses?.[c.id]?.completedDay); return done.every(d => d != null) ? hit(Math.max(...done), [], `Completed all ${COURSES.length} VanQuest Core Courses.`) : null; },
  'career-climber': s => { const e = s.events.find(e => e.type === 'career'); return e ? hit(e.day, [`E${e.id}`], e.text) : null; },
  'first-apartment': s => { const ok = s.ledger.filter(e => e.category === 'rent' && e.status === 'ok'), fail = s.ledger.find(e => e.category === 'rent' && e.status === 'failed'); return ok.length >= 6 && (!fail || fail.id > ok[5].id) ? hit(ok[5].day, [`L${ok[5].id}`], 'Paid your first six months of rent on time.') : null; },
  'home-sweet-home': (s, c) => ownHome(s, c, false),
  'keys-kingdom': (s, c) => ownHome(s, c, true),
  'four-wheels': s => { const b = s.ledger.find(e => e.category === 'vehicle_buy' && e.status === 'ok'); if (!b || s.day - b.day < 180) return null; const f = s.ledger.find(e => e.category === 'vehicle_costs' && e.status === 'failed' && e.day >= b.day && e.day <= b.day + 180); return f ? null : hit(b.day + 180, [`L${b.id}`], 'Bought a car and paid its running costs for six months.'); },
  'cash-not-credit': s => {
    let run = 0;
    for (let i = 0; i < s.ledger.length; i++) {
      const e = s.ledger[i];
      if (e.status === 'ok' && ['wallet', 'bank'].includes(e.account)) run += e.amount;
      if (e.category === 'vehicle_buy' && e.status === 'ok' && s.ledger[i + 1]?.category !== 'vehicle_buy') {   // after both legs (cash + savings)
        const ess = essentialMonthly(s, e.day);
        if (ess > 0 && run >= 3 * ess) return hit(e.day, [`L${e.id}`], `Paid cash for a car and still had ${inr(run)} — over three months of essentials.`);
      }
    }
    return null;
  },
  'fully-furnished': (s, c) => { const r = c.log.find(r => r.furniture >= 4 && !r.failed); return r ? hit(r.day, [`M${r.month}`], `${r.furniture} pieces of furniture at home, with every bill paid.`) : null; },
  'independent-mode': (s, c) => { let run = 0; for (const r of c.log) { run = r.flow.earned > 0 && r.surplus >= 0 && !r.failedEssential && !r.unfed ? run + 1 : 0; if (run === 12) return hit(r.day, [`M${r.month}`], 'Twelve months in a row where your own earnings covered all your living costs.'); } return null; },
  'plan-b': s => { const e = s.ledger.find(e => e.category === 'repair' && e.status === 'ok'); return e ? hit(e.day, [`L${e.id}`], `Paid an unexpected repair of ${inr(-e.amount)} without borrowing.`) : null; },
  'comeback-arc': (s, c) => {
    const bad = c.log.findIndex(r => r.failedEssential > 0 || r.unfed > 3);
    if (bad < 0) return null;
    let run = 0;
    for (const r of c.log.slice(bad + 1)) { run = r.surplus >= 0 && !r.failed && !r.unfed ? run + 1 : 0; if (run === 6) return hit(r.day, [`M${c.log[bad].month}`, `M${r.month}`], `After a hard month (${c.log[bad].month}), six steady months in a row.`); }
    return null;
  },
  'changed-my-mind': s => { const r = s.goals?.revisions?.[0]; return r ? hit(r.day, ['G-rev1'], `Revised your goal to "${r.answers.goal}".`) : null; },
  'lucky-not-strategy': s => {
    for (const r of s.encounters.log.filter(r => r.status === 'declined')) {
      const d = enc[r.id], o = d.outcome;
      if (o.type !== 'asset' || d.verdict === 'useful' || s.day < r.day + o.days) continue;
      if (price(s, o.asset, r.day + o.days) > price(s, o.asset, r.day)) return hit(r.day + o.days, [r.uid], `You passed on "${d.offer.name}"; it happened to rise, but it was a risky bet you were right not to rely on.`);
    }
    return null;
  },
  'yolo-economy': (s, c) => { const i = c.log.findIndex((r, k) => r.flow.earned > 0 && r.flow.lifestyle > 0.3 * r.flow.earned && (r.failedEssential || c.log[k + 1]?.failedEssential)); return i >= 0 ? hit(c.log[i].day, [`M${c.log[i].month}`], `${c.log[i].month}: lifestyle spending above 30% of income, then a bill failed.`) : null; },
  'broke-before-payday': (s, c) => { const i = c.log.findIndex((r, k) => k > 0 && r.failedEssential > 0 && c.log[k - 1].flow.lifestyle > 0); return i >= 0 ? hit(c.log[i].from, [`M${c.log[i].month}`], `A bill failed on payday after spending on wants the month before.`) : null; },
  'one-more-upgrade': s => {
    let run = 0;
    for (const e of s.ledger) {
      const before = run;
      if (e.status === 'ok' && ['wallet', 'bank'].includes(e.account)) run += e.amount;
      if (e.status !== 'ok' || e.amount >= 0 || !['vehicle_buy', 'purchase'].includes(e.category) || -e.amount < 0.5 * before) continue;
      const f = s.ledger.find(x => x.status === 'failed' && x.day >= e.day && x.day <= e.day + 60);
      if (f) return hit(f.day, [`L${e.id}`, `L${f.id}`], 'A big purchase used over half your money, and a bill failed soon after.');
    }
    return null;
  },
  'retirement-never': (s, c) => (c.ending?.kind === 'retired_age' && !s.goals?.original ? hit(c.ending.day, ['R-end'], 'Reached 60 without ever recording your goals.') : null),
  'short-run': (s, c) => (c.ending?.kind === 'death' ? hit(c.ending.day, ['D-end'], 'Your character\'s life ended before retirement.') : null),
  'great-reset': s => { const p = s.propertyHistory.find(p => p.sale?.forced), e = s.events.find(e => e.type === 'housing' && /^Evicted/.test(e.text)); const d = [p && hit(p.soldDay, [], 'The bank sold a property after missed EMIs.'), e && hit(e.day, [`E${e.id}`], 'Evicted after unpaid rent.')].filter(Boolean); return first(d); },
  'new-game-plus': s => ((s.character?.previousLives ?? 0) > 0 ? hit(s.character.startDay ?? 0, [], 'You finished a life before and started this one.') : null),
  'steady-saver': (s, c) => { if (c.log.length < 24) return null; const ok = c.log.filter(r => r.surplus >= 0).length; return ok / c.log.length >= 0.75 ? hit(c.log.at(-1).day, [], `${ok} of ${c.log.length} months spent less than earned.`) : null; },
  'balanced-life': (s, c) => (c.ending && c.log.length >= 60 && s.stats.daysUnfed <= 7 && !c.log.some(r => r.housing === 'none') && s.stats.minHealth >= 60
    && !s.events.some(e => /^Evicted/.test(e.text)) && c.log.some(r => r.flow.lifestyle > 0) ? hit(c.ending.day, [], 'Years of steady living: fed, housed, healthy — and some money enjoyed.') : null),
  'fi-reached': (s, c) => { const r = c.log.find(r => r.fiMet); return r ? hit(r.day, [`M${r.month}`], `${r.month}: your money covered ${r.fiRatio} years of essentials.`) : null; },
  'goal-keeper': s => { const rec = s.goals?.revisions?.at(-1) ?? s.goals?.original; if (!rec || rec.goals.targetAge == null) return null; const g = goalStatus(s, rec); return ['achieved', 'confirmed'].includes(g.status) && g.onTime ? hit(g.day, [], `"${rec.goals.main.choice}" by ${rec.goals.targetAge} — done at ${g.age}.`) : null; },
};
function hit(day, refs, why) { return { day, refs, why }; }
function first(list) { return list.filter(Boolean).sort((a, b) => a.day - b.day)[0] ?? null; }
function reserve(c, n) { const r = c.log.find(r => r.reserveMonths != null && r.reserveMonths >= n && r.essentialAvg > 0); return r ? hit(r.day, [`M${r.month}`], `${r.month}: cash and savings covered ${r.reserveMonths} months of essentials.`) : null; }
function ownHome(s, c, outright) {
  const owned = id => s.properties[id] ?? s.propertyHistory.find(p => p.id === id);
  const homes = [...c.log.filter(r => r.housing === 'own').map(r => ({ day: r.day, id: r.home, ref: `M${r.month}` })), ...(s.housing?.kind === 'own' ? [{ day: s.day, id: s.housing.propertyId, ref: null }] : [])];
  for (const h of homes) {
    const p = owned(h.id);
    if (!p || (outright && p.loanUid)) continue;
    return hit(p.boughtDay ?? h.day, h.ref ? [h.ref] : [], outright ? 'Bought the home you lived in outright, without a loan.' : `Bought a home and lived in it${p.loanUid ? ' (with a mortgage the bank approved)' : ''}.`);
  }
  return null;
}

// Every achievement the record supports right now (or at the end, with ctx.ending).
export function evaluate(state, ending = null) {
  const ctx = { log: (state.lifeLog ?? []).filter(r => !r.partial), ending };
  const out = [];
  for (const a of CATALOGUE) {
    if (UNTRACKED[a.id] || !RULES[a.id]) continue;
    const r = RULES[a.id](state, ctx);
    if (r) out.push({ id: a.id, ...r });
  }
  return out;
}

// Record new unlocks (once per id). Returns the newly unlocked achievements (for the pop-up).
export function unlockNew(state, ending = null) {
  const book = state.achievements ??= { unlocked: [] }, have = new Set(book.unlocked.map(u => u.id)), fresh = [];
  for (const u of evaluate(state, ending)) if (!have.has(u.id)) { book.unlocked.push(u); fresh.push({ ...achievementDef(u.id), ...u }); have.add(u.id); }
  return fresh;
}
