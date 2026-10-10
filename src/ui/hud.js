// Always-visible DOM HUD: action bar, the persistent side panel (cash, home, work, hunger,
// health, car, recent updates), the driving badge and the clickable interaction prompt.
// Everything is rendered from game.state — nothing is hardcoded.
import { balance } from '../sim/ledger.js';
import { LOCATIONS } from '../data/locations.js';
import { MAJORS } from '../data/majors.js';
import { VEHICLES } from '../data/vehicles.js';
import { activeVehicle } from '../sim/vehicles.js';
import { forecastFedDays } from '../sim/health.js';
import { overview } from '../sim/networth.js';
import { inr, fmtDate, fmtShortDate, nextMonthStart } from '../sim/util.js';
import { esc } from './core.js';

const bar = (v, good) => {
  const c = good ? (v > 60 ? '#5fd68a' : v > 30 ? '#ffc95c' : '#ff7a7a') : (v < 40 ? '#5fd68a' : v < 70 ? '#ffc95c' : '#ff7a7a');
  return `<div class="bar" title="${v}/100"><i style="width:${v}%;background:${c}"></i></div>`;
};

export class Hud {
  constructor(game, ui, router) {
    this.game = game; this.ui = ui; this.router = router;
    this.driving = null;
    this.collapsed = false;
    const root = document.getElementById('ui');
    const el = (cls, tag = 'div') => Object.assign(document.createElement(tag), { className: cls });
    this.bar = el('topbar r3');
    this.side = el('side');
    this.badge = el('driving-badge');
    this.prompt = el('prompt-btn', 'button');
    root.prepend(this.bar, this.side, this.badge, this.prompt);
    this.bar.innerHTML = `
      <button class="tb-btn" data-a="day" title="Advance one in-game day">Next day ▸</button>
      <button class="tb-btn" data-a="month" title="Skip to the 1st of next month (payday, bills)">To 1st ▸▸</button>
      <button class="tb-btn" data-a="year" title="Advance 12 months under the normal rules">Skip 1 year</button>
      <button class="tb-btn" data-a="inv">Inventory<kbd>I</kbd></button>
      <button class="tb-btn" data-a="pantry">Pantry<kbd>P</kbd></button>
      <button class="tb-btn" data-a="wardrobe">Wardrobe<kbd>C</kbd></button>
      <button class="tb-btn" data-a="fin">Finances<kbd>O</kbd></button>
      <button class="tb-btn" data-a="hist">History<kbd>H</kbd></button>
      <button class="tb-btn" data-a="reset" title="New game — erase this save and start over">⟲</button>`;
    const onClick = e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a || this.game.state.status === 'dead') return;
      if (a === 'day') game.advance(1);
      if (a === 'month') game.advance(nextMonthStart(game.state.day) - game.state.day);
      if (a === 'year') router.yearSkip();
      if (a === 'inv') router.inventory();
      if (a === 'pantry') router.pantry();
      if (a === 'wardrobe') router.wardrobe();
      if (a === 'hist') router.history();
      if (a === 'fin') router.finances();
      if (a === 'reset' && confirm('Start a new game? Your current save will be erased.')) { ui.close(true); game.reset(); location.reload(); }
      if (a === 'collapse') { this.collapsed = !this.collapsed; this.render(); }
      e.target.blur();
    };
    this.bar.addEventListener('click', onClick);
    this.side.addEventListener('click', onClick);
    this.prompt.addEventListener('click', () => { this.onPrompt?.(); this.prompt.blur(); });
    game.on(() => this.render());
    this.render();
  }

  render() {
    const s = this.game.state, h = s.housing, v = activeVehicle(s), fin = overview(s);
    this.side.classList.toggle('collapsed', this.collapsed);
    const home = !h ? '<span class="neg">No home</span>' : `${esc(LOCATIONS[h.propertyId].name)}<div class="muted">${h.kind === 'rent' ? `Renting · ${inr(h.rent)}/mo` : 'Owned'}</div>`;
    const ed = s.education;
    const work = `${esc(s.job.title)}<div class="muted">${inr(s.job.salary)}/month${ed?.status === 'enrolled' ? ` · studying ${esc(MAJORS[ed.majorId].name)} until ${fmtShortDate(ed.graduationDay)}` : ''}</div>`;
    const days = forecastFedDays(s, 30);
    const car = this.driving ? `<span style="color:var(--blue)">Driving ${esc(this.driving.name)}</span>` : v ? `${esc(VEHICLES[v.model].name)}<div class="muted">${v.arrears ? `<span class="neg">${inr(v.arrears)} unpaid</span>` : 'Parked'}</div>` : '<span class="muted">None</span>';
    const feed = s.feed.slice(-7).reverse().map(f => `<div><span class="d">${fmtShortDate(f.day)}</span><span class="${f.kind}">${esc(f.text)}${f.amount ? ` <b>${f.amount > 0 ? '+' : ''}${inr(f.amount)}</b>` : ''}</span></div>`).join('') || '<div class="muted">Nothing yet.</div>';
    this.side.innerHTML = `
      <div class="side-head"><span>${fmtDate(s.day)}</span><button data-a="collapse" title="Show/hide panel">${this.collapsed ? '▸' : '◂'}</button></div>
      <div class="row2"><span class="k">Cash</span><span class="money" data-testid="wallet">${inr(balance(s))}</span></div>
      ${fin.assets.savings ? `<div class="row2"><span class="k">Savings</span><span data-testid="savings">${inr(fin.assets.savings)}</span></div>` : ''}
      ${fin.assets.fixedDeposits ? `<div class="row2"><span class="k">Fixed deposits</span><span>${inr(fin.assets.fixedDeposits)}</span></div>` : ''}
      ${fin.assets.investments ? `<div class="row2"><span class="k">Investing</span><span>${inr(fin.assets.investments)}</span></div>` : ''}
      ${fin.totalLiabilities ? `<div class="row2"><span class="k">Loans owed</span><span class="neg" data-testid="debt">${inr(fin.totalLiabilities)}</span></div>` : ''}
      <div class="row2"><span class="k">Net worth</span><span>${inr(fin.netWorth)}</span></div>
      <div class="sec"><div class="row2"><span class="k">Home</span><span class="v" data-testid="home">${home}</span></div>
        <div class="row2"><span class="k">Work</span><span class="v">${work}</span></div>
        <div class="row2"><span class="k">Car</span><span class="v">${car}</span></div></div>
      <div class="sec"><div class="row2"><span class="k">Hunger</span><span>${s.hunger}/100</span></div>${bar(s.hunger, false)}
        <div class="row2"><span class="k">Health</span><span data-testid="health">${s.health}/100</span></div>${bar(s.health, true)}
        <div class="row2"><span class="k">Food lasts</span><span class="${days < 3 ? 'neg' : ''}">${days >= 30 ? '30+ days' : `${days} day${days === 1 ? '' : 's'}`}</span></div></div>
      <div class="sec"><span class="k">Recent updates</span><div class="feed">${feed}</div></div>
      <div class="sec muted" style="font-size:11px">WASD/arrows or click to walk · E interact · I · P · C · O · H · M map · Esc close</div>`;
  }

  setDriving(d) {
    const was = !!this.driving;
    this.driving = d;
    this.badge.style.display = d ? 'block' : 'none';
    if (d) this.badge.textContent = `DRIVING ${d.name.toUpperCase()} · ${d.kmh} km/h${d.stalled ? ' · OUT OF FUEL MONEY' : ''} · E to get out`;
    if (was !== !!d) this.render();
  }

  showPrompt(text, onClick) {
    this.onPrompt = onClick;
    this.prompt.style.display = text ? 'block' : 'none';
    if (text) this.prompt.innerHTML = `<b>E</b> &nbsp;${esc(text)}`;
  }
}
