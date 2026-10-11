// Wardrobe, pantry and one-year skip panels (functional; UI can be redesigned later).
import { ITEMS } from '../data/catalog.js';
import { equip, unequip, equipped, SLOTS } from '../sim/wardrobe.js';
import { pantryReport, KCAL_NEED, RESERVE_DAYS } from '../sim/health.js';
import { CATEGORY_LABELS } from '../sim/summary.js';
import { daysInNextYear } from '../sim/clock.js';
import { spendable } from '../sim/ledger.js';
import { planCost } from '../sim/groceryPlan.js';
import { PROPERTIES } from '../data/properties.js';
import { VEHICLES } from '../data/vehicles.js';
import { inr, fmtDate } from '../sim/util.js';
import { esc, why } from './core.js';
import { itemIcon, outfitImg } from './sprites.js';

// ------------------------------------------------------------------ wardrobe
export class WardrobePanel {
  constructor(game) { this.game = game; this.title = 'Wardrobe'; this.sub = 'Wear the clothes you own'; this.msg = null; }
  render() {
    const s = this.game.state, eq = equipped(s);
    const owned = Object.keys(s.owned).filter(id => ITEMS[id]?.kind === 'clothing' && s.owned[id] > 0);
    const slots = SLOTS.map(slot => `<div class="row between"><span class="k" style="font-family:var(--px);color:var(--muted)">${slot.toUpperCase()}</span>
      <span>${eq[slot] ? esc(ITEMS[eq[slot]].name) : '<span class="muted">Default</span>'}</span>${eq[slot] ? `<button class="btn sm" data-a="off" data-slot="${slot}">Take off</button>` : ''}</div>`).join('');
    const list = owned.length ? `<div class="grid">${owned.map(id => {
      const it = ITEMS[id], on = eq[it.slot] === id;
      return `<div class="card ${on ? 'sel' : ''}"><div class="thumb">${itemIcon(id, 3)}</div><h3>${esc(it.name)}</h3><div class="muted">Slot: ${it.slot}</div>
        <button class="btn sm ${on ? '' : 'primary'}" data-a="${on ? 'off' : 'on'}" data-id="${id}" data-slot="${it.slot}">${on ? 'Take off' : 'Wear'}</button></div>`;
    }).join('')}</div>` : '<div class="empty">You don\'t own any clothes from Thread & Co. yet.</div>';
    const msg = this.msg ? `<div class="msg ${this.msg.kind}">${esc(this.msg.text)}</div>` : '';
    return msg + `<div class="split"><div>${list}</div><div class="card"><div class="thumb" style="min-height:120px">${outfitImg(eq, 6)}</div>${slots}
      <p class="muted">Your character is recoloured to show your top, trousers and shoes. The base sprite has no separate layers, so a saree is shown as a full-length colour and accessories aren't drawn.</p></div></div>`;
  }
  onAction(a, el) {
    const r = this.game.act(s => a === 'on' ? equip(s, el.dataset.id) : unequip(s, el.dataset.slot));
    this.msg = r.ok ? null : { kind: 'error', text: why(r) };
  }
}

// ------------------------------------------------------------------ pantry
export const plural = (unit, n) => n === 1 || unit === 'kg' ? unit : unit === 'loaf' ? 'loaves' : unit + 's';
export class PantryPanel {
  constructor(game) { this.game = game; this.title = 'Pantry & food'; }
  get sub() { return `Household of 1 · needs ${KCAL_NEED.toLocaleString('en-IN')} kcal a day`; }
  render() {
    const s = this.game.state, r = pantryReport(s);
    const summary = r.untilDelivery === null
      ? `Food keeps you fed for <b>${r.fedDays >= 60 ? '60+' : r.fedDays} day(s)</b>. You have no active delivery plan, so nothing arrives unless you shop.`
      : `Food keeps you fed for <b>${r.fedDays >= 60 ? '60+' : r.fedDays} day(s)</b>; your next grocery delivery is in <b>${r.untilDelivery} day(s)</b> (${fmtDate(s.groceryPlan.nextBillingDay)}).`;
    const rows = r.rows.map(x => `<tr class="${x.qty ? '' : 'muted'}"><td class="icon-cell">${itemIcon(x.id, 2)}</td><td>${esc(x.name)}</td>
      <td class="n">${x.qty} ${esc(plural(x.unit, x.qty))}</td><td class="n">${x.use} ${esc(x.unit)}/day</td><td class="n">${x.qty ? `${x.daysLeft} d` : '—'}</td>
      <td class="n">${x.reserve}</td><td>${x.sufficient ? '<span class="tag ok">OK</span>' : '<span class="tag bad">LOW</span>'}${x.planned ? ` <span class="tag">+${x.planned} PLAN</span>` : ''}</td>
      <td class="n">${x.replenishCost ? inr(x.replenishCost) : '—'}</td></tr>`).join('');
    return `<div class="msg ${r.enough ? 'ok' : 'warn'}">${summary} Today's food gives ${r.kcalToday.toLocaleString('en-IN')} kcal of the ${KCAL_NEED.toLocaleString('en-IN')} you need.
        ${r.enough ? '' : ' <b>Restock soon</b> — hunger starts when you can\'t cover 90% of your calories.'}</div>
      <table class="t"><tr><th></th><th>Item</th><th class="n">Stock</th><th class="n">Used</th><th class="n">Lasts</th><th class="n">Keep ≥</th><th>Status</th><th class="n">To top up</th></tr>${rows}</table>
      <p style="margin-top:8px">Topping everything up to one week's reserve would cost <b>${inr(r.replenishTotal)}</b> at FreshCart.</p>
      <details class="msg"><summary><b>How food works</b></summary><p style="margin-top:6px">
        • Each day your household uses the "Used" amount of everything in stock (e.g. 0.5 L milk, a 5 kg rice bag lasts 25 days). Units: bag, kg, litre, pack, tub, loaf, tray (12 eggs), bottle.<br>
        • "Keep ≥" is a one-week reserve (${RESERVE_DAYS} days of use). "Status" is OK if the stock lasts until your next delivery (or a week, without a plan).<br>
        • You're <b>fed</b> on a day when your stock can provide 90% of ${KCAL_NEED.toLocaleString('en-IN')} kcal. Otherwise hunger rises; while very hungry your health falls 1–4 points a day.<br>
        • At health 0 the run ends. With no food at all that takes about four weeks — you'll be warned well before.<br>
        • Food is only eaten when in-game days pass (walking around, Next day, To 1st, Skip 1 year).</p></details>`;
  }
}

// ------------------------------------------------------------------ one-year skip
export class YearSkipPanel {
  constructor(game, onDone) { this.game = game; this.onDone = onDone; this.title = 'Skip 1 year?'; this.narrow = true; this.result = null; }
  render() {
    if (this.result) return renderYearSummary(this.result.summary);
    const s = this.game.state, plan = s.groceryPlan?.status === 'active' ? planCost(s.groceryPlan.items, s.groceryPlan.mode).total : 0;
    const rent = s.housing?.kind === 'rent' ? s.housing.rent : 0;
    const upkeep = Object.keys(s.properties).reduce((a, id) => a + PROPERTIES[id].upkeep, 0);
    const cars = s.vehicles.reduce((a, v) => a + VEHICLES[v.model].monthly, 0);
    const food = pantryReport(s);
    return `<p>Time jumps 12 months, to <b>${fmtDate(s.day + daysInNextYear(s))}</b>, day by day under the normal rules: salary, rent, tenants, upkeep, car costs, grocery plan, meals, health and college.</p>
      <div class="specs"><b>CASH + SAVINGS</b><span>${inr(spendable(s))}</span><b>SALARY</b><span>+${inr(s.job.salary)}/month</span><b>RENT</b><span>${rent ? '−' + inr(rent) : '—'}/month</span>
        <b>UPKEEP</b><span>${upkeep ? '−' + inr(upkeep) : '—'}/month</span><b>CARS</b><span>${cars ? '−' + inr(cars) : '—'}/month</span><b>GROCERY PLAN</b><span>${plan ? '−' + inr(plan) + '/month' : 'none'}</span></div>
      <div class="msg ${plan ? '' : 'error'}" style="margin-top:10px">You can't go shopping during a skip. ${plan ? 'Only your grocery plan brings food.' : `<b>You have no grocery plan</b> — your food lasts about ${food.fedDays} day(s), then you'll go hungry and your health will fall.`}</div>
      <div class="row" style="margin-top:10px"><button class="btn primary" data-a="go">Skip 1 year</button><button class="btn" data-a="close">Cancel</button></div>`;
  }
  onAction(a) {
    if (a !== 'go') return;
    this.result = this.game.skipYear();
    this.title = this.result.summary.died ? 'Your year ended early' : 'Your year in review';
    this.onDone?.(this.result);
  }
}

export function renderYearSummary(r) {
  const list = o => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(CATEGORY_LABELS[k] ?? k)}</td><td class="n">${inr(v)}</td></tr>`).join('') || '<tr><td class="muted">None</td><td></td></tr>';
  const b = r.before, a = r.after, d = (x, y) => `${inr(x)} → <b>${inr(y)}</b>`;
  return `${r.died ? '<div class="msg error">The run ended during the skip — see the next screen.</div>' : ''}
    <p>${fmtDate(r.from)} → ${fmtDate(r.to)} (${r.days} days)</p>
    <div class="specs"><b>WALLET</b><span>${d(b.wallet, a.wallet)}</span><b>INVESTMENTS</b><span>${d(b.invested, a.invested)}</span>
      <b>PROPERTY</b><span>${d(b.properties, a.properties)}</span><b>CARS</b><span>${d(b.vehicles, a.vehicles)}</span><b>NET WORTH</b><span>${d(b.netWorth, a.netWorth)}</span>
      <b>JOB</b><span>${esc(r.job.after)}</span><b>EDUCATION</b><span>${esc(r.education.before)} → ${esc(r.education.after)}</span>
      <b>HEALTH</b><span>${b.health} → <b>${a.health}</b>/100</span><b>HUNGRY DAYS</b><span>${r.daysHungry}</span><b>FAILED PAYMENTS</b><span>${r.failedPayments}</span></div>
    <div class="split" style="margin-top:10px"><table class="t"><tr><th>Income</th><th class="n">${inr(r.totalIncome)}</th></tr>${list(r.income)}</table>
    <table class="t"><tr><th>Spending</th><th class="n">${inr(r.totalExpenses)}</th></tr>${list(r.expenses)}</table></div>
    <div class="row" style="margin-top:10px"><button class="btn primary" data-a="close">Continue</button></div>`;
}
// (The end-of-run screen became the final life report in Round 7: src/ui/reportPanels.js.)
