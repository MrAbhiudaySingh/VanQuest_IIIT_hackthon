import { ITEMS, SHOPS, GROCERY_DELIVERY_FEE } from '../data/catalog.js';
import { LOCATIONS } from '../data/locations.js';
import { purchase, quote, ownedCount } from '../sim/inventory.js';
import { savePlan, setPlanStatus, planCost, collectOrders } from '../sim/groceryPlan.js';
import { spendable } from '../sim/ledger.js';
import { inr, fmtDate, nextMonthStart } from '../sim/util.js';
import { esc, newToken, why } from './core.js';
import { itemIcon } from './sprites.js';

const stepper = (key, id, qty) => `
  <span class="stepper"><button data-a="${key}-dec" data-id="${id}" aria-label="less">−</button>
  <input type="number" min="0" step="1" value="${qty}" data-in="${key}" data-id="${id}" aria-label="quantity">
  <button data-a="${key}-inc" data-id="${id}" aria-label="more">+</button></span>`;

export class ShopPanel {
  constructor(game, shopId, { tab = 'shop' } = {}) {
    this.game = game;
    this.shopId = shopId;
    this.shop = SHOPS[shopId];
    this.title = LOCATIONS[shopId].name;
    const k = this.shop.keeper;
    this.sub = `${esc(k.name)} · ${esc(k.role)}`;
    this.line = this.shop.lines[game.state.day % this.shop.lines.length];
    this.tab = tab;
    this.cart = {};
    this.confirm = null;
    this.msg = null;
    const p = game.state.groceryPlan;
    this.draft = { items: { ...(p && p.status !== 'cancelled' ? p.items : {}) }, mode: p?.mode ?? 'delivery' };
  }
  get s() { return this.game.state; }

  headExtra() {
    if (!this.shop.groceryPlan) return '';
    return `<div class="tabs" style="margin:0"><button class="tab ${this.tab === 'shop' ? 'on' : ''}" data-a="tab" data-t="shop">Shop</button>
      <button class="tab ${this.tab === 'plan' ? 'on' : ''}" data-a="tab" data-t="plan">Monthly plan</button></div>`;
  }

  render() {
    const msg = this.msg ? `<div class="msg ${this.msg.kind}">${esc(this.msg.text)}</div>` : '';
    const speaker = `<div class="speaker"><span class="who">${esc(this.shop.keeper.name)}:</span><span class="say">"${esc(this.line)}"</span></div>`;
    return speaker + msg + (this.tab === 'plan' ? this.renderPlan() : this.renderShop());
  }

  // ------------------------------------------------------------------ shop tab
  renderShop() {
    const pickup = this.shop.groceryPlan && this.s.pickupOrders.length
      ? `<div class="msg ok row between"><span>${this.s.pickupOrders.length} paid grocery-plan order(s) waiting for you.</span><button class="btn sm primary" data-a="collect">Collect</button></div>` : '';
    const cards = this.shop.items.map(id => {
      const it = ITEMS[id], qty = this.cart[id] ?? 0, have = ownedCount(this.s, id);
      const tags = (it.premium ? '<span class="tag gold">PREMIUM</span>' : '') + (it.kind === 'furniture' ? '<span class="tag">PLACEABLE</span>' : '') + (it.limit ? `<span class="tag">MAX ${it.limit}</span>` : '');
      const icon = itemIcon(id, it.kind === 'furniture' ? 2 : 3);
      return `<div class="card ${qty ? 'sel' : ''}">${icon ? `<div class="thumb">${icon}</div>` : ''}<h3>${esc(it.name)}${tags}</h3>
        <div class="row between"><span class="price">${inr(it.price)}</span><span class="muted">${it.unit ? 'per ' + esc(it.unit) : ''}</span></div>
        <div class="row between"><span class="muted">You have ${have}</span>${stepper('c', id, qty)}</div></div>`;
    }).join('');
    return pickup + `<div class="grid">${cards}</div>` + this.renderConfirm();
  }

  renderConfirm() {
    const c = this.confirm;
    if (!c) return '';
    if (c.kind === 'buy') {
      const q = quote(this.s, this.shopId, this.cart);
      const lines = (q.lines ?? []).map(l => `<tr><td>${l.qty}× ${esc(ITEMS[l.id].name)}</td><td class="n">${inr(l.total)}</td></tr>`).join('');
      return `<div class="confirm" id="confirm"><h4>Confirm purchase</h4><table class="t">${lines}
        <tr><td><b>Total</b></td><td class="n"><b>${inr(q.total ?? 0)}</b></td></tr>
        <tr><td class="muted">Money left after purchase</td><td class="n">${inr(spendable(this.s) - (q.total ?? 0))}</td></tr></table>
        ${q.ok ? '' : `<div class="msg error" style="margin:8px 0 0">${esc(why(q))}${q.reason === 'insufficient_funds' ? ` You are ${inr(q.total - spendable(this.s))} short.` : ''}</div>`}
        <div class="row" style="margin-top:10px"><button class="btn primary" data-a="buy-confirm" ${q.ok ? '' : 'disabled'}>Pay ${inr(q.total ?? 0)}</button>
        <button class="btn" data-a="cancel">Cancel</button></div></div>`;
    }
    return '';
  }

  // ------------------------------------------------------------------ plan tab
  renderPlan() {
    const p = this.s.groceryPlan, active = p && p.status !== 'cancelled';
    const cost = planCost(this.draft.items, this.draft.mode);
    const status = !active ? '<span class="tag">NO PLAN</span>'
      : p.status === 'active' ? `<span class="tag gold">ACTIVE</span> next charge & ${p.mode === 'delivery' ? 'delivery' : 'collection'}: <b>${fmtDate(p.nextBillingDay)}</b>`
      : `<span class="tag">PAUSED</span> ${p.pausedReason === 'insufficient_funds' ? '<span class="neg">— last payment failed (insufficient funds)</span>' : '— paused by you'}`;
    const rows = this.shop.items.map(id => {
      const it = ITEMS[id], q = this.draft.items[id] ?? 0;
      return `<tr><td class="icon-cell">${itemIcon(id, 2)}</td><td>${esc(it.name)}<div class="muted">uses ~${(it.usePerDay * 30).toFixed(1)} ${esc(it.unit)}/month</div></td><td class="n">${inr(it.price)}</td>
        <td>${stepper('p', id, q)}</td><td class="n">${q ? inr(it.price * q) : '—'}</td></tr>`;
    }).join('');
    const c = this.confirm;
    const confirm = c?.kind === 'plan-save' ? `<div class="confirm"><h4>Save monthly grocery plan?</h4>
        <p>${inr(cost.total)} will be charged on <b>${fmtDate(nextMonthStart(this.s.day))}</b> and on the 1st of every month after, while the plan is active. Nothing is charged today.</p>
        <div class="row"><button class="btn primary" data-a="plan-save-confirm">Confirm plan</button><button class="btn" data-a="cancel">Back</button></div></div>`
      : c?.kind === 'plan-cancel' ? `<div class="confirm"><h4>Cancel your grocery plan?</h4><p>No further monthly charges. Groceries already delivered stay in your pantry.</p>
        <div class="row"><button class="btn danger" data-a="plan-cancel-confirm">Cancel plan</button><button class="btn" data-a="cancel">Keep it</button></div></div>` : '';
    return `<div class="row between" style="margin-bottom:10px"><div>${status}</div>
        <div class="row">${active && p.status === 'active' ? '<button class="btn sm" data-a="plan-pause">Pause</button>' : ''}
        ${active && p.status === 'paused' ? '<button class="btn sm" data-a="plan-resume">Resume</button>' : ''}
        ${active ? '<button class="btn sm danger" data-a="plan-cancel">Cancel plan</button>' : ''}</div></div>
      <details class="msg"><summary><b>How billing works</b></summary>
        <p style="margin-top:6px">• Billed once on the 1st of each in-game month — never on the day you save.<br>
        • Bill = groceries + ${inr(GROCERY_DELIVERY_FEE)} delivery fee (home delivery) or ₹0 (collect at FreshCart).<br>
        • If your wallet can't cover it, <b>nothing is charged</b>, the plan pauses and you're notified.<br>
        • Buying items individually is always a separate purchase — it never changes the plan or causes a second plan charge.<br>
        • Your household uses groceries every day (see "uses ~/month").</p></details>
      <table class="t"><tr><th></th><th>Item</th><th class="n">Price</th><th>Qty / month</th><th class="n">Subtotal</th></tr>${rows}</table>
      <div class="row" style="margin-top:12px;gap:16px;flex-wrap:wrap">
        <label><input type="radio" name="mode" value="delivery" data-in="mode" ${this.draft.mode === 'delivery' ? 'checked' : ''}> Home delivery (+${inr(GROCERY_DELIVERY_FEE)})</label>
        <label><input type="radio" name="mode" value="pickup" data-in="mode" ${this.draft.mode === 'pickup' ? 'checked' : ''}> Collect at FreshCart (free)</label></div>
      <div class="row between" style="margin-top:10px"><div>Groceries ${inr(cost.goods)} + fee ${inr(cost.fee)} = <span class="price">${inr(cost.total)}/month</span></div>
        <button class="btn primary" data-a="plan-save" ${cost.goods ? '' : 'disabled'}>${active ? 'Save changes' : 'Start plan'}</button></div>${confirm}`;
  }

  footer() {
    const total = this.shop.items.reduce((s, id) => s + (this.cart[id] ?? 0) * ITEMS[id].price, 0);
    const shopBtns = this.tab === 'shop'
      ? `<span>Basket: <span class="price">${inr(total)}</span></span><button class="btn" data-a="clear" ${total ? '' : 'disabled'}>Clear</button>
         <button class="btn primary" data-a="review" ${total ? '' : 'disabled'}>Review purchase</button>` : '';
    return `<span class="muted">Cash + savings</span><span class="balance">${inr(spendable(this.s))}</span><span style="flex:1"></span>${shopBtns}`;
  }

  // ------------------------------------------------------------------ events
  setQty(key, id, q) {
    q = Math.max(0, Math.min(99, Math.floor(Number(q) || 0)));
    const bag = key === 'c' ? this.cart : this.draft.items;
    if (q) bag[id] = q; else delete bag[id];
    if (key === 'c') this.confirm = null;
  }

  onInput(el) {
    if (el.dataset.in === 'mode') this.draft.mode = el.value;
    else if (el.dataset.in) this.setQty(el.dataset.in, el.dataset.id, el.value);
  }

  onAction(a, el) {
    const id = el.dataset.id;
    if (a === 'tab') { this.tab = el.dataset.t; this.confirm = null; this.msg = null; return; }
    if (a.endsWith('-inc') || a.endsWith('-dec')) {
      const key = a[0], bag = key === 'c' ? this.cart : this.draft.items;
      return this.setQty(key, id, (bag[id] ?? 0) + (a.endsWith('inc') ? 1 : -1));
    }
    switch (a) {
      case 'clear': this.cart = {}; this.confirm = null; break;
      case 'review': this.confirm = { kind: 'buy', token: newToken() }; this.msg = null; break;
      case 'cancel': this.confirm = null; break;
      case 'buy-confirm': {
        const token = this.confirm?.token;
        this.confirm = null;
        const r = this.game.act(s => purchase(s, this.shopId, this.cart, token));
        this.msg = r.ok ? { kind: 'ok', text: `Purchased ${r.lines.map(l => `${l.qty}× ${ITEMS[l.id].name}`).join(', ')} for ${inr(r.total)}.` }
                        : { kind: 'error', text: `Purchase failed: ${why(r)}` };
        if (r.ok) this.cart = {};
        break;
      }
      case 'collect': {
        const r = this.game.act(s => collectOrders(s));
        this.msg = r.ok ? { kind: 'ok', text: `Collected ${r.count} order(s) — added to your pantry.` } : { kind: 'error', text: why(r) };
        break;
      }
      case 'plan-save': this.confirm = { kind: 'plan-save' }; break;
      case 'plan-save-confirm': {
        const r = this.game.act(s => savePlan(s, this.draft.items, this.draft.mode));
        this.confirm = null;
        this.msg = r.ok ? { kind: 'ok', text: `Plan saved. First charge on ${fmtDate(r.plan.nextBillingDay)}.` } : { kind: 'error', text: why(r) };
        break;
      }
      case 'plan-pause': this.statusChange('paused', 'Plan paused — no charges until you resume.'); break;
      case 'plan-resume': this.statusChange('active', 'Plan resumed.'); break;
      case 'plan-cancel': this.confirm = { kind: 'plan-cancel' }; break;
      case 'plan-cancel-confirm': this.statusChange('cancelled', 'Plan cancelled.'); this.confirm = null; this.draft.items = {}; break;
    }
  }

  statusChange(status, text) {
    const r = this.game.act(s => setPlanStatus(s, status));
    this.msg = r.ok ? { kind: 'ok', text } : { kind: 'error', text: why(r) };
  }
}

