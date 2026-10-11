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
import { ageOn } from '../sim/character.js';
import { pantryReport } from '../sim/health.js';

// One useful next action for a new player (Round 7). Disappears once the basics are in place.
function nextStep(s) {
  if (s.status !== 'alive') return 'Your final report is ready (L)';
  if (!s.goals?.original) return s.goals?.draft ? 'Finish your goals quiz (L)' : 'Record your goals (L)';
  if (!pantryReport(s).enough && s.groceryPlan?.status !== 'active') return 'Buy food at FreshCart';
  if (s.day < 120 && !s.bank.fds.length && !s.ledger.some(e => e.category === 'deposit')) return 'Open savings at Nidhi Bank';
  if (s.day < 365 && !s.education) return 'See courses at Ashford College';
  return null;
}

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
    this.bar = el('topbar r3 vq-nav');
    this.side = el('side');
    this.badge = el('driving-badge');
    this.prompt = el('prompt-btn', 'button');
    root.prepend(this.bar, this.side, this.badge, this.prompt);
    // Round 8: the supplied "Pixel + Glass Navigation" (Assets/supplied-ui/round8/main screen buttons →
    // skins/nav.css). Same actions as before; Life and News have no supplied button and keep the base style.
    this.bar.innerHTML = `<nav class="navglass" aria-label="Game navigation">
      <button class="navbtn time" data-a="day" title="Advance one in-game day"><span class="ico" aria-hidden="true">☼</span> NEXT DAY <span aria-hidden="true">▶</span></button>
      <button class="navbtn time" data-a="month" title="Skip to the 1st of next month (payday, bills)"><span class="ico" aria-hidden="true">»</span> TO 1ST <span aria-hidden="true">▶</span></button>
      <button class="navbtn skip" data-a="year" title="Advance 12 months under the normal rules"><span class="ico" aria-hidden="true">⌛</span> SKIP 1 YEAR</button>
      <button class="navbtn inventory" data-a="inv"><span class="ico" aria-hidden="true">▣</span> INVENTORY <span class="key">I</span></button>
      <button class="navbtn pantry" data-a="pantry"><span class="ico" aria-hidden="true">▤</span> PANTRY <span class="key">P</span></button>
      <button class="navbtn wardrobe" data-a="wardrobe"><span class="ico" aria-hidden="true">♙</span> WARDROBE <span class="key">C</span></button>
      <button class="navbtn finance" data-a="fin"><span class="ico" aria-hidden="true">₹</span> FINANCES <span class="key">O</span></button>
      <button class="navbtn history" data-a="hist"><span class="ico" aria-hidden="true">▤</span> HISTORY <span class="key">H</span></button>
      <button class="navbtn" data-a="life" data-testid="hud-life">LIFE <span class="key">L</span></button>
      <button class="navbtn" data-a="news" data-testid="hud-news">NEWS <span class="key">N</span><span class="badge" data-testid="news-badge" hidden></span></button>
      <button class="navbtn retirement" data-a="retire" title="Retire this character (asks for confirmation)"><span class="ico" aria-hidden="true">⌂</span> RETIREMENT <span class="key">R</span></button>
      <button class="navbtn reset" data-a="reset" title="New character — this one stays saved" aria-label="Reset simulation: start a new character">↻</button></nav>`;
    const onClick = e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      if (this.game.state.status !== 'alive') { if (a === 'news') router.news(); else if (a === 'life' && this.game.state.life?.final) router.gameOver(); return; }
      if (a === 'day') game.advance(1);
      if (a === 'month') game.advance(nextMonthStart(game.state.day) - game.state.day);
      if (a === 'year') router.yearSkip();
      if (a === 'inv') router.inventory();
      if (a === 'pantry') router.pantry();
      if (a === 'wardrobe') router.wardrobe();
      if (a === 'hist') router.history();
      if (a === 'fin') router.finances();
      if (a === 'life') router.life();
      if (a === 'news') router.news();
      if (a === 'retire') router.retire();
      if (a === 'reset' && confirm('Start a new character? This one stays saved in your character list (Characters on the title screen).')) { game.reset(); router.restartInto(); }
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
    const badge = this.bar.querySelector('[data-testid=news-badge]'), unread = s.newspaper?.unread ?? 0;
    // after a life ends only Life (the final report) and News still do anything
    for (const b of this.bar.querySelectorAll('[data-a]')) b.disabled = s.status !== 'alive' && !['life', 'news'].includes(b.dataset.a);
    badge.hidden = !unread; badge.textContent = unread > 9 ? '9+' : String(unread);
    this.side.classList.toggle('collapsed', this.collapsed);
    const home = !h ? '<span class="neg">No home</span>' : `${esc(LOCATIONS[h.propertyId].name)}<div class="muted">${h.kind === 'rent' ? `Renting · ${inr(h.rent)}/mo` : 'Owned'}</div>`;
    const ed = s.education;
    const work = `${esc(s.job.title)}<div class="muted">${inr(s.job.salary)}/month${ed?.status === 'enrolled' ? ` · studying ${esc(MAJORS[ed.majorId].name)} until ${fmtShortDate(ed.graduationDay)}` : ''}</div>`;
    const days = forecastFedDays(s, 30);
    const car = this.driving ? `<span style="color:var(--blue)">Driving ${esc(this.driving.name)}</span>` : v ? `${esc(VEHICLES[v.model].name)}<div class="muted">${v.arrears ? `<span class="neg">${inr(v.arrears)} unpaid</span>` : 'Parked'}</div>` : '<span class="muted">None</span>';
    const feed = s.feed.slice(-7).reverse().map(f => `<div><span class="d">${fmtShortDate(f.day)}</span><span class="${f.kind}">${esc(f.text)}${f.amount ? ` <b>${f.amount > 0 ? '+' : ''}${inr(f.amount)}</b>` : ''}</span></div>`).join('') || '<div class="muted">Nothing yet.</div>';
    this.side.innerHTML = `
      <div class="side-head"><span>${fmtDate(s.day)}</span><button data-a="collapse" title="Show/hide panel">${this.collapsed ? '▸' : '◂'}</button></div>
      ${s.character ? `<div class="row2"><span class="k">Age</span><span data-testid="hud-age">${ageOn(s)}${s.status === 'alive' ? '' : s.status === 'dead' ? ' · died' : ' · retired'}</span></div>` : ''}
      ${nextStep(s) ? `<div class="row2 next-step" data-testid="next-step"><span class="k">Next</span><span class="v">${nextStep(s)}</span></div>` : ''}
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
      <div class="sec muted" style="font-size:11px">WASD/arrows or click to walk · E interact · I · P · C · O · H · L life · N news · R retire · M map · Esc close</div>`;
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
