import { VEHICLES, RESALE, MIN_FUEL_MONEY } from '../data/vehicles.js';
import { buyVehicle, sellVehicle, setActiveVehicle, vehicleValue, resaleOffer, payVehicleArrears } from '../sim/vehicles.js';
import { spendable } from '../sim/ledger.js';
import { inr, fmtShortDate } from '../sim/util.js';
import { esc, newToken, why } from './core.js';
import { vehicleImg } from './sprites.js';

export const KMH = 0.5;                    // display: px/s → "km/h"
const KM_PER_YEAR = 12000;                 // assumption used for the cost comparison only

// 3-year cost of ownership: depreciation + insurance/servicing + fuel at 12,000 km/year.
export function threeYearCost(m) {
  const resale = Math.round(m.price * Math.max(RESALE.floor, RESALE.initial * Math.pow(RESALE.monthly, 36)));
  const fixed = 36 * m.monthly, fuel = Math.round(3 * KM_PER_YEAR * m.fuelPerKm);
  return { depreciation: m.price - resale, fixed, fuel, total: m.price - resale + fixed + fuel, perMonth: Math.round((m.price - resale + fixed + fuel) / 36) };
}

export class DealershipPanel {
  constructor(game) {
    this.game = game;
    this.title = 'Roadstar Motors';
    this.sub = 'Imran · Sales consultant — "Take your time, compare the running costs too."';
    this.tab = 'showroom'; this.confirm = null; this.msg = null;
  }
  get s() { return this.game.state; }
  headExtra() {
    return `<div class="tabs" style="margin:0">${[['showroom', 'Showroom'], ['garage', `My cars (${this.s.vehicles.length})`], ['rules', 'How costs work']]
      .map(([t, l]) => `<button class="tab ${this.tab === t ? 'on' : ''}" data-a="tab" data-t="${t}">${l}</button>`).join('')}</div>`;
  }
  render() {
    const msg = this.msg ? `<div class="msg ${this.msg.kind}">${esc(this.msg.text)}</div>` : '';
    return msg + this[`r_${this.tab}`]() + this.renderConfirm();
  }

  r_showroom() {
    return `<div class="grid">${Object.entries(VEHICLES).map(([id, m]) => {
      const owned = this.s.vehicles.some(v => v.model === id), t = threeYearCost(m);
      return `<div class="card ${this.confirm?.model === id ? 'sel' : ''}"><div class="thumb">${vehicleImg(id, 2)}</div>
        <h3>${esc(m.name)} <span class="tag">${esc(m.body)}</span></h3><div class="muted">${esc(m.blurb)}</div>
        <div class="price">${inr(m.price)}</div>
        <div class="specs"><b>TOP SPEED</b><span>${Math.round(m.maxSpeed * KMH)} km/h</span><b>ACCEL</b><span>${'■'.repeat(Math.round(m.accel / 35))}${'□'.repeat(5 - Math.round(m.accel / 35))}</span>
          <b>HANDLING</b><span>${'■'.repeat(Math.round(m.turn / 46))}${'□'.repeat(5 - Math.round(m.turn / 46))}</span><b>SEATS</b><span>${m.seats}</span>
          <b>MONTHLY</b><span>${inr(m.monthly)} insurance & servicing</span><b>FUEL</b><span>${inr(m.fuelPerKm)}/km</span>
          <b>3-YEAR COST</b><span><b style="color:var(--gold)">${inr(t.total)}</b> (≈${inr(t.perMonth)}/month)</span></div>
        <button class="btn sm ${owned ? '' : 'primary'}" data-a="buy" data-id="${id}" ${owned ? 'disabled' : ''}>${owned ? 'Owned' : 'Buy…'}</button></div>`;
    }).join('')}</div>`;
  }

  r_garage() {
    if (!this.s.vehicles.length) return '<div class="empty">You don\'t own a car yet. Walking costs nothing — a car adds monthly costs on top of its price.</div>';
    return `<div class="grid">${this.s.vehicles.map(v => {
      const m = VEHICLES[v.model], active = this.s.activeVehicle === v.uid;
      return `<div class="card ${active ? 'sel' : ''}"><div class="thumb">${vehicleImg(v.model, 2)}</div><h3>${esc(m.name)} ${active ? '<span class="tag gold">ACTIVE</span>' : ''}</h3>
        <div class="specs"><b>BOUGHT</b><span>${fmtShortDate(v.boughtDay)} for ${inr(v.price)}</span><b>VALUE NOW</b><span>${inr(vehicleValue(this.s, v))}</span>
        <b>UNPAID</b><span class="${v.arrears ? 'neg' : ''}">${inr(v.arrears)}</span><b>BUY-BACK</b><span>${inr(resaleOffer(this.s, v))}</span></div>
        <div class="row" style="flex-wrap:wrap">${active ? '' : `<button class="btn sm" data-a="activate" data-id="${v.uid}">Make active</button>`}
        ${v.arrears ? `<button class="btn sm primary" data-a="arrears" data-id="${v.uid}">Pay ${inr(v.arrears)}</button>` : ''}
        <button class="btn sm danger" data-a="sell" data-id="${v.uid}">Sell…</button></div></div>`;
    }).join('')}</div><p class="muted" style="margin-top:8px">Your active car waits where you last parked it (new cars wait on this forecourt). Walk up to it and press E to drive.</p>`;
  }

  r_rules() {
    return `<p>• <b>Price</b> is paid in full when you buy (no loans in this version).</p>
      <p>• <b>Every 1st</b> you pay each car's insurance & servicing. If you can't, it becomes unpaid and the car can't be driven until you settle it here.</p>
      <p>• <b>Fuel</b> is charged for the distance you actually drive, when you get out. You need ${inr(MIN_FUEL_MONEY)} in your wallet to start, and the car stalls if fuel would cost more than you have.</p>
      <p>• <b>Resale</b>: we buy cars back at ${Math.round(RESALE.initial * 100)}% of the price, minus 1% per month owned (never below ${RESALE.floor * 100}%).</p>
      <p>• <b>3-year cost</b> = depreciation + 36 months of insurance & servicing + fuel for ${KM_PER_YEAR.toLocaleString('en-IN')} km a year. A cheap car can still be expensive to own.</p>
      <p>• Faster cars have higher top speed and acceleration in the game; heavier ones steer more slowly.</p>`;
  }

  renderConfirm() {
    const c = this.confirm;
    if (!c) return '';
    if (c.kind === 'buy') {
      const m = VEHICLES[c.model], ok = spendable(this.s) >= m.price;
      return `<div class="confirm"><h4>Buy the ${esc(m.name)}?</h4><p>${inr(m.price)} is charged now. Money after: ${inr(spendable(this.s) - m.price)}. Then ${inr(m.monthly)} every month for insurance & servicing, plus fuel.</p>
        ${ok ? '' : `<div class="msg error">Not enough money — you're ${inr(m.price - spendable(this.s))} short.</div>`}
        <div class="row"><button class="btn primary" data-a="buy-confirm" ${ok ? '' : 'disabled'}>Pay ${inr(m.price)}</button><button class="btn" data-a="cancel">Cancel</button></div></div>`;
    }
    const v = this.s.vehicles.find(x => x.uid === c.uid);
    if (!v) return '';
    return `<div class="confirm"><h4>Sell your ${esc(VEHICLES[v.model].name)}?</h4><p>Roadstar pays ${inr(resaleOffer(this.s, v))} (you paid ${inr(v.price)}).</p>
      <div class="row"><button class="btn danger" data-a="sell-confirm">Sell for ${inr(resaleOffer(this.s, v))}</button><button class="btn" data-a="cancel">Keep it</button></div></div>`;
  }

  footer() { return `<span class="muted">Cash + savings</span><span class="balance">${inr(spendable(this.s))}</span>`; }

  onAction(a, el) {
    const done = (r, ok) => { this.msg = r.ok ? { kind: 'ok', text: ok } : { kind: 'error', text: why(r) }; this.confirm = null; };
    switch (a) {
      case 'tab': this.tab = el.dataset.t; this.confirm = null; this.msg = null; break;
      case 'buy': this.confirm = { kind: 'buy', model: el.dataset.id, token: newToken() }; this.msg = null; break;
      case 'sell': this.confirm = { kind: 'sell', uid: el.dataset.id, token: newToken() }; this.msg = null; break;
      case 'cancel': this.confirm = null; break;
      case 'buy-confirm': { const { model, token } = this.confirm; done(this.game.act(s => buyVehicle(s, model, token)), `The ${VEHICLES[model].name} is yours — it's waiting on the forecourt.`); break; }
      case 'sell-confirm': { const { uid, token } = this.confirm; done(this.game.act(s => sellVehicle(s, uid, token)), 'Sold. The money is in your wallet.'); break; }
      case 'activate': done(this.game.act(s => setActiveVehicle(s, el.dataset.id)), 'Done — that car is now parked where your active car was.'); break;
      case 'arrears': done(this.game.act(s => payVehicleArrears(s, el.dataset.id)), 'Paid. You can drive again.'); break;
    }
  }
}
