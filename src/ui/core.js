// Minimal DOM UI kit: one modal at a time, toasts, and HTML escaping.
// A panel is an object with { title, sub?, narrow?, render(): html, onAction(name, el, ev),
// onInput?(el), frame?(): html }. A panel with frame() draws its own full-screen layout (the supplied
// store / course designs) instead of the standard modal box. Elements with data-a="name" trigger onAction; the panel re-renders
// after each action and whenever the game state changes.
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const newToken = () => 'tok-' + (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now());

const root = () => document.getElementById('ui');

export class UI {
  constructor(game) {
    this.game = game;
    this.panel = null;
    this.toasts = Object.assign(document.createElement('div'), { className: 'toasts' });
    root().append(this.toasts);
    game.on((_, notes) => {
      // skipping many days can produce a burst of notices: show the important ones
      const shown = notes.length > 4 ? [...notes.filter(n => n.kind !== 'warn').slice(-3), { kind: 'info', text: `…and ${notes.length - 3} more updates — see History (H).` }] : notes;
      for (const n of shown) this.toast(n.text, n.kind);
      if (this.panel) this.render();
    });
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.panel && !this.panel.locked) { e.preventDefault(); this.close(); }
    });
    this.listeners = new Set();
  }

  get isOpen() { return !!this.panel; }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  open(panel) {
    this.close(true);
    this.panel = panel;
    const bd = this.backdrop = document.createElement('div');
    bd.className = 'backdrop';
    if (panel.frame) bd.classList.add('full');
    bd.innerHTML = panel.frame ? '<div class="frame-root"></div>' : `<div class="modal${panel.narrow ? ' narrow' : ''}" role="dialog" aria-modal="true"></div>`;
    bd.addEventListener('mousedown', e => { if (e.target === bd && !panel.locked) this.close(); });
    if (panel.hover) bd.addEventListener('mouseover', e => { const b = e.target.closest('button'); if (b && !b.contains(e.relatedTarget)) panel.hover(b); });
    bd.addEventListener('click', e => {
      const el = e.target.closest('[data-a]');
      if (!el || el.disabled) return;
      if (el.dataset.a === 'close') return this.close();
      panel.onAction?.(el.dataset.a, el, e);
      if (this.panel === panel) this.render();
    });
    // A text field fires 'change' while it is losing focus (e.g. when a button is clicked). Re-rendering
    // right then would remove the element mid-blur, so the redraw waits one tick (state updates now).
    bd.addEventListener('change', e => { if (panel.onInput?.(e.target) !== false) setTimeout(() => { if (this.panel === panel) this.render(); }); });
    root().append(bd);
    this.render();
    bd.querySelector('button, input')?.focus({ preventScroll: true });
    for (const fn of this.listeners) fn(true);
  }

  render() {
    const p = this.panel;
    if (p.frame) {
      // keep the scroll position of every scrolling area across re-renders
      const fr = this.backdrop.querySelector('.frame-root');
      const keep = [...fr.querySelectorAll('[data-scroll]')].map(el => [el.dataset.scroll, el.scrollTop]);
      fr.innerHTML = p.frame();
      for (const [k, top] of keep) { const el = fr.querySelector(`[data-scroll="${k}"]`); if (el) el.scrollTop = top; }
      return;
    }
    const modal = this.backdrop.querySelector('.modal');
    const scroll = modal.querySelector('.m-body')?.scrollTop ?? 0;
    modal.innerHTML = `
      <div class="m-head"><div><h2>${esc(p.title)}</h2>${p.sub ? `<div class="sub">${p.sub}</div>` : ''}</div>
        <div class="spacer"></div>${p.headExtra?.() ?? ''}${p.locked ? '' : '<button class="m-close" data-a="close" aria-label="Close">X</button>'}</div>
      <div class="m-body">${p.render()}</div>
      ${p.footer ? `<div class="m-foot">${p.footer()}</div>` : ''}`;
    const body = modal.querySelector('.m-body');
    if (body) body.scrollTop = scroll;
  }

  close(silent = false) {
    if (!this.panel) return;
    this.panel.onClose?.();
    this.panel = null;
    this.backdrop?.remove();
    this.backdrop = null;
    if (!silent) for (const fn of this.listeners) fn(false);
  }

  toast(text, kind = 'info', ms = 4200) {
    const t = Object.assign(document.createElement('div'), { className: `toast ${kind}`, textContent: text });
    this.toasts.append(t);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
    setTimeout(() => t.remove(), ms);
  }
}

export const REASONS = {
  insufficient_funds: 'Not enough cash + savings.',
  duplicate: 'That confirmation was already processed — you were not charged twice.',
  limit: 'You already own the maximum of that item.',
  invalid_quantity: 'Quantities must be whole numbers above zero.',
  empty: 'Nothing selected yet.',
  not_enough_units: 'You don\'t hold that many units.',
  already_enrolled: 'You are already enrolled in a programme.',
  out_of_range: 'Amount outside the offer\'s range.',
  not_sold_here: 'This shop doesn\'t sell that item.',
  nothing_to_collect: 'No grocery orders are waiting.',
  invalid_amount: 'Enter an amount above zero.',
  already_owned: 'You already own that.',
  not_owned: 'You don\'t own that.',
  is_home: 'That\'s where you live. Move somewhere else first (rent or move into another place you own).',
  has_tenant: 'A tenant lives there. Stop renting it out first.',
  already_listed: 'It\'s already listed or let to a tenant.',
  you_own_it: 'You own that place — move in instead of renting it.',
  already_home: 'You already live there.',
  arrears: 'This car has unpaid insurance & servicing. Settle it at Roadstar Motors first.',
  no_fuel_money: 'You need at least ₹100 in your wallet for fuel.',
  nothing_owed: 'Nothing is owed.',
  not_let: 'It isn\'t listed or let.',
  not_clothing: 'That can\'t be worn.',
  no_vehicle: 'You don\'t have an active car.',
  no_access: 'You don\'t own or rent this property.',
  tenant_occupied: 'A tenant lives here (or is moving in). Manage it from outside, or stop renting it out first.',
  not_your_home: 'You can only place furniture in your own home or a vacant property you own.',
  deposit_refund: 'You need enough cash + savings to return your tenant\'s deposit before ending their tenancy.',
  pay_full_payoff: 'That would clear the balance but not the interest since the last EMI — pay the full payoff amount to close the loan.',
  not_active: 'That loan is already closed.',
  unknown_lesson: 'That lesson doesn\'t exist.',
  incomplete: 'Answer every question first.',
};
export const why = r => REASONS[r?.reason] ?? 'That didn\'t work.';
