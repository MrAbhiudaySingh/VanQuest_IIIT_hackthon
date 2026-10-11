// Every customer-facing shop (grocery, general store, clothing, electronics, jewellery, furniture)
// in the supplied "wooden market stall" design (Assets/supplied-ui/Store, styles scoped in
// skins/store.css). Presentation only: prices, art, stock, ownership, balances, purchases and the
// grocery plan all come from the game state and sim/ — the UI keeps no balance or inventory of its own.
import { ITEMS, SHOPS, GROCERY_DELIVERY_FEE } from '../data/catalog.js';
import { LOCATIONS } from '../data/locations.js';
import { purchase, quote, ownedCount } from '../sim/inventory.js';
import { savePlan, setPlanStatus, planCost, collectOrders } from '../sim/groceryPlan.js';
import { spendable } from '../sim/ledger.js';
import { inr, fmtDate, nextMonthStart } from '../sim/util.js';
import { t, tr } from '../i18n/i18n.js';
import { esc, newToken, why } from './core.js';
import { itemIcon } from './sprites.js';
import { getShelfDecorPropSVG, SHELF_DECOR, ICONS, playPixelSound } from './skins/storeKit.js';

const num = v => Number(v).toLocaleString('en-IN');
const stripes = Array.from({ length: 16 }, (_, i) => `<div class="awning-stripe stripe-${i % 2 ? 'cream' : 'red'}"></div>`).join('');

export class ShopPanel {
  constructor(game, shopId, { tab = 'shop' } = {}) {
    this.game = game;
    this.shopId = shopId;
    this.shop = SHOPS[shopId];
    this.title = LOCATIONS[shopId].name;
    this.line = this.shop.lines[game.state.day % this.shop.lines.length];
    this.tab = tab;
    this.cart = {};
    this.confirm = null;
    this.msg = null;
    const p = game.state.groceryPlan;
    this.draft = { items: { ...(p && p.status !== 'cancelled' ? p.items : {}) }, mode: p?.mode ?? 'delivery' };
  }
  get s() { return this.game.state; }
  get basket() {
    let total = 0, count = 0;
    for (const id of this.shop.items) { const q = this.cart[id] ?? 0; total += q * ITEMS[id].price; count += q; }
    return { total, count };
  }

  // ------------------------------------------------------------------ the stall
  frame() {
    const k = this.shop.keeper, b = this.basket;
    const say = this.msg ? this.msg.text : this.line;
    return `<div class="vq-store" data-shop="${this.shopId}">
      <div class="ambient-backdrop"></div><div class="ambient-vignette"></div>
      <div class="stall-outer-wrapper">
        <aside class="aframe-chalkboard" aria-label="Shop Board"><div class="chalkboard-face"><div class="chalk-cart-icon">${ICONS.cart}</div>
          <div class="chalk-shop-text">SHOP</div><div class="chalk-arrow">➔</div></div>
          <div class="chalkboard-leg leg-left"></div><div class="chalkboard-leg leg-right"></div></aside>
        <main class="market-stall" role="dialog" aria-labelledby="stallSignTitle">
          <div class="ivy-cluster ivy-left"></div><div class="ivy-cluster ivy-right"></div>
          ${['left', 'right'].map(s => `<div class="exterior-lantern lantern-${s}"><div class="lantern-bracket"></div><div class="lantern-glass"><div class="lantern-flame"></div></div></div>`).join('')}
          <header class="stall-awning"><div class="awning-sign-plaque"><div class="sign-inner-bezel"><div class="sign-cart-badge">${ICONS.signCart}</div>
            <div class="sign-title-group"><h1 class="stall-title" id="stallSignTitle">${esc(this.title)}</h1>
              <div class="stall-subtitle"><span class="sub-keeper">${esc(k.name)}</span><span class="sub-sep">-</span><span class="sub-role">${esc(k.role)}</span></div></div></div></div>
            <div class="awning-stripes-row">${stripes}</div><div class="awning-valance-fringe"></div></header>
          <section class="dialogue-banner-bar" aria-label="Shopkeeper Dialogue">
            <div class="dialogue-quote-box ${this.msg ? `said-${this.msg.kind}` : ''}"><span class="dialogue-name">${esc(k.name)}:</span>
              <span class="dialogue-quote" data-testid="shop-say">"${esc(say)}"</span></div>
            <button class="pixel-stall-close-btn" data-a="close" title="Close Store" aria-label="Close Store"><span>✕</span></button>
          </section>
          <section class="timber-shelves-bay" data-scroll="shelves" aria-label="Store Shelves">
            ${this.shop.groceryPlan ? this.tabs() : ''}${this.tab === 'plan' ? this.renderPlan() : this.renderShelves()}
          </section>
          <footer class="stall-counter-footer">
            <div class="wallet-badge" title="Purchases are paid from cash first, then savings"><div class="pixel-wallet-icon">${ICONS.wallet}</div>
              <span class="wallet-text-label">CASH + SAVINGS</span><span class="wallet-symbol">₹</span><span class="wallet-amount" data-testid="shop-balance">${num(spendable(this.s))}</span></div>
            ${this.tab === 'shop' ? `<div class="counter-actions">
              <div class="basket-counter-display"><div class="pixel-basket-mini-icon">${ICONS.basket}</div><span class="basket-label-tag">BASKET:</span>
                <span class="basket-currency">₹</span><span class="basket-val">${num(b.total)}</span><span class="basket-count-paren">(${b.count} ${b.count === 1 ? 'ITEM' : 'ITEMS'})</span></div>
              <button class="pixel-btn-wood-clear" data-a="clear" title="Clear Basket" ${b.total ? '' : 'disabled'}>CLEAR</button>
              <button class="pixel-btn-wood-review" data-a="review" ${b.total ? '' : 'disabled'}><span>REVIEW PURCHASE</span><span class="btn-right-chevron">›</span></button>
            </div>` : ''}
          </footer>
          ${this.renderConfirm()}
        </main>
      </div></div>`;
  }

  tabs() {
    const t = (id, label) => `<button class="stall-tab ${this.tab === id ? 'on' : ''}" data-a="tab" data-t="${id}">${label}</button>`;
    return `<div class="stall-tabs">${t('shop', 'SHELVES')}${t('plan', 'MONTHLY PLAN')}</div>`;
  }

  renderShelves() {
    const pickup = this.shop.groceryPlan && this.s.pickupOrders.length
      ? `<div class="stall-note"><span>${this.s.pickupOrders.length} paid grocery-plan order(s) waiting for you.</span><button class="pixel-btn-wood-review" data-a="collect">COLLECT</button></div>` : '';
    const cards = this.shop.items.map((id, i) => {
      const it = ITEMS[id], qty = this.cart[id] ?? 0, have = ownedCount(this.s, id), [left, right] = SHELF_DECOR[i % SHELF_DECOR.length];
      const atLimit = it.limit && have + qty >= it.limit;
      const tags = [it.premium && 'PREMIUM', it.kind === 'furniture' && 'PLACEABLE'].filter(Boolean);
      return `<article class="shelf-compartment ${qty ? 'has-basket-items' : ''}" data-item="${id}">
        <div class="shelf-showcase-stage"><div class="showcase-timber-lines"></div>
          <div class="decor-prop decor-left">${getShelfDecorPropSVG(left)}</div>
          <div class="item-stage-center"><div class="pixel-item-graphic">${itemIcon(id, it.kind === 'furniture' ? 2 : 3)}</div></div>
          <div class="decor-prop decor-right">${getShelfDecorPropSVG(right)}</div>
          ${it.limit ? `<span class="shelf-max-tag">MAX ${it.limit}</span>` : ''}${tags.length ? `<span class="shelf-max-tag shelf-tag-left">${tags.join(' · ')}</span>` : ''}</div>
        <div class="shelf-info-board">
          <div class="shelf-title-row"><span class="shelf-item-title" title="${esc(it.name)}">${esc(it.name)}</span></div>
          <div class="shelf-pricing-row"><div class="shelf-price-box"><span class="shelf-currency">₹</span><span class="shelf-price-num">${num(it.price)}</span></div>
            <span class="shelf-unit-label">${it.unit ? 'PER ' + esc(it.unit) : 'EACH'}</span></div>
          <div class="shelf-action-row"><span class="shelf-owned-tally">YOU HAVE ${have}</span>
            <div class="shelf-stepper-box"><button class="shelf-stepper-btn btn-minus" data-a="c-dec" data-id="${id}" aria-label="Decrease quantity" ${qty ? '' : 'disabled'}>-</button>
              <input type="text" class="shelf-stepper-qty" value="${qty}" readonly aria-label="Selected quantity">
              <button class="shelf-stepper-btn btn-plus" data-a="c-inc" data-id="${id}" aria-label="Increase quantity" ${atLimit ? 'data-limit="1"' : ''}>+</button></div></div>
        </div></article>`;
    }).join('');
    return pickup + `<div class="shelves-grid">${cards}</div>`;
  }

  renderConfirm() {
    const c = this.confirm;
    if (!c) return '';
    let body;
    if (c.kind === 'buy') {
      const q = quote(this.s, this.shopId, this.cart);
      const lines = (q.lines ?? []).map(l => `<tr><td>${l.qty}× ${esc(ITEMS[l.id].name)}</td><td class="n">₹${num(l.total)}</td></tr>`).join('');
      body = `<h4>CONFIRM PURCHASE</h4><table>${lines}
        <tr class="tot"><td>TOTAL</td><td class="n">₹${num(q.total ?? 0)}</td></tr>
        <tr><td>Cash + savings after purchase</td><td class="n">₹${num(spendable(this.s) - (q.total ?? 0))}</td></tr></table>
        ${q.ok ? '' : `<p class="bad">${esc(why(q))}${q.reason === 'insufficient_funds' ? ` You are ₹${num(q.total - spendable(this.s))} short.` : ''}</p>`}
        <div class="row"><button class="pixel-btn-wood-review" data-a="buy-confirm" ${q.ok ? '' : 'disabled'}><span>PAY ₹${num(q.total ?? 0)}</span></button>
        <button class="pixel-btn-wood-clear" data-a="cancel">CANCEL</button></div>`;
    } else if (c.kind === 'plan-save') {
      const cost = planCost(this.draft.items, this.draft.mode);
      body = `<h4>SAVE MONTHLY GROCERY PLAN?</h4><p>₹${num(cost.total)} will be charged on <b>${fmtDate(nextMonthStart(this.s.day))}</b> and on the 1st of every month after, while the plan is active. Nothing is charged today.</p>
        <div class="row"><button class="pixel-btn-wood-review" data-a="plan-save-confirm">CONFIRM PLAN</button><button class="pixel-btn-wood-clear" data-a="cancel">BACK</button></div>`;
    } else if (c.kind === 'plan-cancel') {
      body = `<h4>CANCEL YOUR GROCERY PLAN?</h4><p>No further monthly charges. Groceries already delivered stay in your pantry.</p>
        <div class="row"><button class="pixel-btn-wood-review" data-a="plan-cancel-confirm">CANCEL PLAN</button><button class="pixel-btn-wood-clear" data-a="cancel">KEEP IT</button></div>`;
    }
    return `<div class="stall-confirm" id="confirm"><div class="stall-confirm-card">${body}</div></div>`;
  }

  // ------------------------------------------------------------------ monthly grocery plan tab
  renderPlan() {
    const p = this.s.groceryPlan, active = p && p.status !== 'cancelled';
    const cost = planCost(this.draft.items, this.draft.mode);
    const status = !active ? 'NO PLAN'
      : p.status === 'active' ? `ACTIVE — next charge & ${p.mode === 'delivery' ? 'delivery' : 'collection'}: ${fmtDate(p.nextBillingDay)}`
      : `PAUSED ${p.pausedReason === 'insufficient_funds' ? '— last payment failed (insufficient funds)' : '— paused by you'}`;
    const rows = this.shop.items.map(id => {
      const it = ITEMS[id], q = this.draft.items[id] ?? 0;
      return `<tr><td class="ic">${itemIcon(id, 2)}</td><td>${esc(it.name)}<div class="sub">uses ~${(it.usePerDay * 30).toFixed(1)} ${esc(it.unit)}/month</div></td><td class="n">₹${num(it.price)}</td>
        <td><div class="shelf-stepper-box"><button class="shelf-stepper-btn" data-a="p-dec" data-id="${id}" ${q ? '' : 'disabled'}>-</button>
          <input type="text" class="shelf-stepper-qty" value="${q}" readonly aria-label="quantity"><button class="shelf-stepper-btn" data-a="p-inc" data-id="${id}">+</button></div></td>
        <td class="n">${q ? '₹' + num(it.price * q) : '—'}</td></tr>`;
    }).join('');
    return `<div class="stall-sheet">
      <div class="stall-note"><span data-testid="plan-status">${status}</span><span>
        ${active && p.status === 'active' ? '<button class="pixel-btn-wood-clear" data-a="plan-pause">PAUSE</button>' : ''}
        ${active && p.status === 'paused' ? '<button class="pixel-btn-wood-clear" data-a="plan-resume">RESUME</button>' : ''}
        ${active ? '<button class="pixel-btn-wood-clear" data-a="plan-cancel">CANCEL PLAN</button>' : ''}</span></div>
      <details><summary>HOW BILLING WORKS</summary><p>• Billed once on the 1st of each in-game month — never on the day you save.<br>
        • Bill = groceries + ₹${num(GROCERY_DELIVERY_FEE)} delivery fee (home delivery) or ₹0 (collect at FreshCart).<br>
        • If your cash + savings can't cover it, <b>nothing is charged</b>, the plan pauses and you're notified.<br>
        • Buying items individually is always a separate purchase — it never changes the plan or causes a second plan charge.<br>
        • Your household uses groceries every day (see "uses ~/month").</p></details>
      <table><tr><th></th><th>Item</th><th class="n">Price</th><th>Qty / month</th><th class="n">Subtotal</th></tr>${rows}</table>
      <div class="stall-note"><label><input type="radio" name="mode" value="delivery" data-in="mode" ${this.draft.mode === 'delivery' ? 'checked' : ''}> Home delivery (+₹${num(GROCERY_DELIVERY_FEE)})</label>
        <label><input type="radio" name="mode" value="pickup" data-in="mode" ${this.draft.mode === 'pickup' ? 'checked' : ''}> Collect at FreshCart (free)</label></div>
      <div class="stall-note"><span>Groceries ₹${num(cost.goods)} + fee ₹${num(cost.fee)} = <b>₹${num(cost.total)}/month</b></span>
        <button class="pixel-btn-wood-review" data-a="plan-save" ${cost.goods ? '' : 'disabled'}>${active ? 'SAVE CHANGES' : 'START PLAN'}</button></div>
    </div>`;
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
  }

  say(kind, text) { this.msg = { kind, text }; }

  onAction(a, el) {
    const id = el.dataset.id;
    if (a === 'tab') { this.tab = el.dataset.t; this.confirm = null; this.msg = null; return; }
    if (a.endsWith('-inc') || a.endsWith('-dec')) {
      const key = a[0], bag = key === 'c' ? this.cart : this.draft.items;
      if (a === 'c-inc' && el.dataset.limit) { playPixelSound(240, 0.12, 'sawtooth'); return this.say('warn', `Limit reached: you can own at most ${ITEMS[id].limit} of those.`); }
      playPixelSound(a.endsWith('inc') ? 620 : 440, 0.08, 'square');
      this.msg = null;
      return this.setQty(key, id, (bag[id] ?? 0) + (a.endsWith('inc') ? 1 : -1));
    }
    switch (a) {
      case 'clear': this.cart = {}; this.confirm = null; playPixelSound(320, 0.15, 'sawtooth'); this.say('info', 'Basket cleared.'); break;
      case 'review': this.confirm = { kind: 'buy', token: newToken() }; this.msg = null; break;
      case 'cancel': this.confirm = null; break;
      case 'buy-confirm': {
        const token = this.confirm?.token;
        this.confirm = null;
        const r = this.game.act(s => purchase(s, this.shopId, this.cart, token));
        if (r.ok) {
          this.cart = {};
          playPixelSound(880, 0.25, 'square', 0.08); setTimeout(() => playPixelSound(1100, 0.35, 'triangle', 0.08), 120);
          this.say('ok', t('Purchased {items} for {total}. Thank you!', { items: r.lines.map(l => `${l.qty}× ${tr(ITEMS[l.id].name)}`).join(', '), total: inr(r.total) }));
        } else { playPixelSound(220, 0.25, 'sawtooth', 0.1); this.say('error', `Purchase failed: ${why(r)}`); }
        break;
      }
      case 'collect': {
        const r = this.game.act(s => collectOrders(s));
        this.say(r.ok ? 'ok' : 'error', r.ok ? `Collected ${r.count} order(s) — added to your pantry.` : why(r));
        break;
      }
      case 'plan-save': this.confirm = { kind: 'plan-save' }; break;
      case 'plan-save-confirm': {
        const r = this.game.act(s => savePlan(s, this.draft.items, this.draft.mode));
        this.confirm = null;
        this.say(r.ok ? 'ok' : 'error', r.ok ? `Plan saved. First charge on ${fmtDate(r.plan.nextBillingDay)}.` : why(r));
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
    this.say(r.ok ? 'ok' : 'error', r.ok ? text : why(r));
  }
}
