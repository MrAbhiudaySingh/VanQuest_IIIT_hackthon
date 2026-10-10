import { ITEMS } from '../data/catalog.js';
import { HOMES } from '../data/homes.js';
import { LOCATIONS } from '../data/locations.js';
import { balance } from '../sim/ledger.js';
import { inr, fmtShortDate } from '../sim/util.js';
import { esc } from './core.js';
import { itemIcon } from './sprites.js';

const KIND_TABS = [
  ['pantry', 'Pantry', ['grocery', 'household']],
  ['personal', 'Clothing & personal', ['clothing', 'personal', 'jewellery']],
  ['electronics', 'Electronics', ['electronics']],
  ['furniture', 'Furniture', ['furniture']],
];

export class InventoryPanel {
  constructor(game) { this.game = game; this.title = 'Inventory'; this.tab = 'pantry'; }
  get sub() { const h = this.game.state.housing; return h ? `Living at ${esc(LOCATIONS[h.propertyId].name)}` : 'No home'; }

  render() {
    const s = this.game.state;
    const tabs = `<div class="tabs">${KIND_TABS.map(([id, label]) => `<button class="tab ${this.tab === id ? 'on' : ''}" data-a="tab" data-t="${id}">${label}</button>`).join('')}</div>`;
    if (this.tab === 'pantry') {
      const rows = Object.entries(s.pantry).sort().map(([id, q]) => {
        const it = ITEMS[id], days = Math.floor((q - (s.consumption[id] ?? 0)) / it.usePerDay);
        return `<tr><td class="icon-cell">${itemIcon(id, 2)}</td><td>${esc(it.name)}</td><td class="n">${q} ${esc(it.unit)}${q > 1 ? 's' : ''}</td><td class="n">${it.usePerDay} / day</td>
          <td class="n ${days < 4 ? 'neg' : ''}">~${days} days</td></tr>`;
      }).join('');
      return tabs + `<p class="muted">Your household uses groceries and supplies every in-game day at the rate shown. When something runs out you get a notice.</p>` +
        (rows ? `<p>Full details, reserves and top-up costs: <b>Pantry (P)</b>.</p><table class="t"><tr><th></th><th>Item</th><th class="n">Stock</th><th class="n">Use</th><th class="n">Lasts</th></tr>${rows}</table>` : '<div class="empty">Your pantry is empty — visit FreshCart Grocery or set up a monthly grocery plan.</div>');
    }
    if (this.tab === 'furniture') {
      const rows = s.furniture.map(f => `<tr><td class="icon-cell">${itemIcon(f.itemId, 1)}</td><td>${esc(ITEMS[f.itemId].name)}</td><td>${f.home ? `Placed in ${esc(HOMES[f.home].title)}` : '<span class="muted">In storage</span>'}</td></tr>`).join('');
      return tabs + `<p class="muted">Furniture can be arranged in your home or in any vacant property you own: go inside and press <b>F</b>.</p>` +
        (rows ? `<table class="t"><tr><th></th><th>Piece</th><th>Location</th></tr>${rows}</table>` : '<div class="empty">No furniture yet — Hearth Home & Furniture sells beds, desks, sofas and decor.</div>');
    }
    const kinds = KIND_TABS.find(t => t[0] === this.tab)[2];
    const rows = Object.entries(s.owned).filter(([id]) => kinds.includes(ITEMS[id].kind))
      .map(([id, n]) => `<tr><td class="icon-cell">${itemIcon(id, 2)}</td><td>${esc(ITEMS[id].name)}${s.wardrobe && Object.values(s.wardrobe).includes(id) ? ' <span class="tag gold">WEARING</span>' : ''}</td><td>${esc(ITEMS[id].category)}</td><td class="n">${n}</td></tr>`).join('');
    return tabs + (rows ? `${this.tab === 'personal' ? '<p>Change clothes in the <b>Wardrobe (C)</b>.</p>' : ''}<table class="t"><tr><th></th><th>Item</th><th>Category</th><th class="n">Owned</th></tr>${rows}</table>` : '<div class="empty">Nothing here yet.</div>');
  }
  onAction(a, el) { if (a === 'tab') this.tab = el.dataset.t; }
}

export class HistoryPanel {
  constructor(game) { this.game = game; this.title = 'Financial history'; this.tab = 'money'; }
  get sub() { const s = this.game.state; return `Wallet ${inr(balance(s))} · Investment cash ${inr(balance(s, 'brokerage'))}`; }

  render() {
    const s = this.game.state;
    const tabs = `<div class="tabs"><button class="tab ${this.tab === 'money' ? 'on' : ''}" data-a="tab" data-t="money">Transactions</button>
      <button class="tab ${this.tab === 'events' ? 'on' : ''}" data-a="tab" data-t="events">Life events</button></div>`;
    if (this.tab === 'events') {
      const rows = [...s.events].reverse().map(e => `<tr><td>${fmtShortDate(e.day)}</td><td>${esc(e.text)}</td></tr>`).join('');
      return tabs + (rows ? `<table class="t">${rows}</table>` : '<div class="empty">Nothing has happened yet.</div>');
    }
    let run = { wallet: 0, brokerage: 0 };
    const withBal = s.ledger.map(e => { if (e.status === 'ok') run[e.account] += e.amount; return { ...e, after: run[e.account] }; });
    const rows = withBal.reverse().map(e => `<tr class="${e.status === 'failed' ? 'muted' : ''}"><td>${fmtShortDate(e.day)}</td><td>${esc(e.memo)}${e.status === 'failed' ? ' <span class="tag">FAILED — NOT CHARGED</span>' : ''}</td>
      <td>${e.account === 'wallet' ? 'Wallet' : 'Investing'}</td><td class="n ${e.amount > 0 ? 'pos' : e.amount < 0 ? 'neg' : ''}">${e.status === 'failed' ? inr(e.attempted) : (e.amount > 0 ? '+' : '') + inr(e.amount)}</td>
      <td class="n">${inr(e.after)}</td></tr>`).join('');
    return tabs + `<p class="muted">Every balance in the game is calculated from this ledger.</p>
      <table class="t"><tr><th>Date</th><th>Description</th><th>Account</th><th class="n">Amount</th><th class="n">Balance</th></tr>${rows}</table>`;
  }
  onAction(a, el) { if (a === 'tab') this.tab = el.dataset.t; }
}
