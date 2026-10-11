// Vikram's street encounter in the supplied design (Assets/supplied-ui/part 2/Vikram → skins/scammer.css,
// portrait art/ui/vikram.svg). The pitch, the three questions and their answers, the offer and the
// outcome all come from data/encounters.js and sim/encounters.js; the UI never reveals which offers
// are scams — every offer is labelled "not guaranteed".
import { encounterDef, ask, decline, invest } from '../sim/encounters.js';
import { spendable } from '../sim/ledger.js';
import { inr, fmtDate } from '../sim/util.js';
import { esc, newToken, why } from './core.js';
import { playPixelSound } from './skins/storeKit.js';

const TOPICS = [['evidence', 'Ask for evidence'], ['investigate', 'Investigate it'], ['risks', 'What are the risks?']];
const num = v => Number(v).toLocaleString('en-IN');

export class EncounterPanel {
  constructor(game, uid) {
    this.game = game;
    this.uid = uid;
    this.title = 'Vikram — "friendly investor"';
    this.amount = null; this.confirm = null; this.msg = null; this.done = null; this.last = null;
  }
  get rec() { return this.game.state.encounters.log.find(r => r.uid === this.uid); }

  frame() {
    const rec = this.rec, def = encounterDef(rec.id);
    this.amount ??= def.offer.min;
    const cards = rec.asked.map(t => `<article class="dialogue-card inquiry-card ${t === this.last ? 'active' : ''}" data-topic="${t}">
        <span class="speaker-tag tag-inquiry">${esc(TOPICS.find(x => x[0] === t)[1].toUpperCase())}:</span><p class="dialogue-text">${esc(def.answers[t])}</p></article>`).join('');
    const msg = this.msg ? `<article class="dialogue-card scam-msg said-${this.msg.kind}"><p class="dialogue-text">${esc(this.msg.text)}</p></article>` : '';
    const bottom = this.done ?? (this.confirm ? `<footer class="app-offer-block scam-confirm">
        <div class="offer-header"><span class="app-brand-name">COMMIT ${inr(this.amount)} TO "${esc(def.offer.name.toUpperCase())}"?</span></div>
        <p class="offer-subtext">The money leaves your cash (then savings) now. What comes back depends on how this opportunity actually plays out — it is <span class="text-danger">NOT GUARANTEED</span>. You'll find out around ${fmtDate(this.game.state.day + def.outcome.days)}.</p>
        <div class="offer-decision-row"><button class="pixel-btn-decision btn-commit" data-a="invest-confirm"><span class="btn-text">COMMIT ${inr(this.amount)}</span></button>
          <button class="pixel-btn-decision btn-reject" data-a="cancel"><span class="btn-text">BACK</span></button></div></footer>`
      : `<nav class="inquiry-actions-bar" aria-label="Investigation Queries">${TOPICS.map(([t, l]) => `<button class="pixel-btn-query" data-a="ask" data-t="${t}" ${rec.asked.includes(t) ? 'disabled' : ''}>[ ${l.toUpperCase()} ]</button>`).join('')}</nav>
      <footer class="app-offer-block">
        <div class="offer-header"><span class="app-brand-name">${esc(def.offer.name.toUpperCase())}</span><span class="wallet-badge">CASH + SAVINGS: <strong data-testid="scam-balance">₹${num(spendable(this.game.state))}</strong></span></div>
        <p class="offer-subtext">He'll take ₹${num(def.offer.min)} – ₹${num(def.offer.max)}. OUTCOME: <span class="text-danger">NOT GUARANTEED</span></p>
        <div class="offer-decision-row"><div class="deposit-input-frame"><span class="currency-prefix">₹</span>
            <input type="number" class="pixel-num-input" data-in="amt" value="${this.amount}" min="${def.offer.min}" max="${def.offer.max}" step="500" aria-label="amount"></div>
          <button class="pixel-btn-decision btn-commit" data-a="invest"><span class="btn-text">COMMIT MONEY…</span></button>
          <button class="pixel-btn-decision btn-reject" data-a="decline"><span class="btn-text">NO THANKS</span></button></div></footer>`);
    return `<div class="vq-scam"><main class="scammer-modal-wrapper"><section class="pixel-dialogue-modal" role="dialog">
      <header class="modal-header"><div class="header-left"><div class="encounter-title-row"><span class="pixel-bullet-diamond">◆</span>
          <h1 class="encounter-title">VIKRAM — <span class="quote-alias">"FRIENDLY INVESTOR"</span></h1></div>
          <p class="encounter-subtitle">An offer on the street. Fictional, simulated scenario.</p></div>
        <div class="header-right-group"><div class="vikram-avatar-frame" title="Vikram"><img src="art/ui/vikram.svg" alt="Vikram" class="vikram-avatar-img"></div>
          <button class="pixel-btn-close" data-a="close" title="Walk away" aria-label="Close Encounter">✖</button></div></header>
      <section class="dialogue-log-list" data-scroll="log">
        <article class="dialogue-card pitch-card"><span class="speaker-tag">VIKRAM:</span><p class="dialogue-text">"${esc(def.pitch)}"</p></article>
        ${cards}${msg}</section>
      ${bottom}</section></main></div>`;
  }

  // Closing the dialog without choosing = walking away (no money moves).
  onClose() { if (this.rec.status === 'open') this.game.act(s => decline(s, this.uid)); }

  onInput(el) { if (el.dataset.in === 'amt') this.amount = Math.floor(Number(el.value) || 0); this.confirm = null; }

  onAction(a, el) {
    const def = encounterDef(this.rec.id);
    this.msg = null;
    if (a === 'ask') { this.game.act(s => ask(s, this.uid, el.dataset.t)); this.last = el.dataset.t; playPixelSound(620, 0.08, 'square', 0.06); }
    if (a === 'invest') this.confirm = { token: newToken() };
    if (a === 'cancel') this.confirm = null;
    if (a === 'invest-confirm' && this.confirm) {
      const token = this.confirm.token; this.confirm = null;
      const r = this.game.act(s => invest(s, this.uid, this.amount, token));
      if (!r.ok) { this.msg = { kind: 'error', text: why(r) }; return; }
      playPixelSound(180, 0.35, 'sawtooth', 0.06);
      this.done = `<footer class="app-offer-block scam-done"><p class="offer-subtext" data-testid="scam-outcome">You handed over ${inr(this.amount)}. Vikram shakes your hand: "You won't regret it." The result will appear in your notifications and financial history around ${fmtDate(r.rec.resolveDay)}.</p>
        <div class="offer-decision-row"><button class="pixel-btn-decision btn-reject" data-a="close"><span class="btn-text">WALK ON</span></button></div></footer>`;
    }
    if (a === 'decline') {
      this.game.act(s => decline(s, this.uid));
      playPixelSound(780, 0.25, 'sine', 0.06);
      const asked = this.rec.asked.length;
      const flags = def.flags.length ? `<p class="offer-subtext"><b>Warning signs in this pitch:</b></p><ul class="scam-flags">${def.flags.map(f => `<li>${esc(f)}</li>`).join('')}</ul>`
        : '<p class="offer-subtext">This pitch had no obvious red flags — declining a legitimate but uncertain opportunity is also a reasonable choice.</p>';
      this.done = `<footer class="app-offer-block scam-done"><p class="offer-subtext" data-testid="scam-outcome">You walked away${asked ? ` after asking ${asked} question(s)` : ''}. Nothing was spent.</p>${flags}
        <p class="offer-subtext">${esc(def.debrief)}</p><div class="offer-decision-row"><button class="pixel-btn-decision btn-commit" data-a="close"><span class="btn-text">CONTINUE</span></button></div></footer>`;
    }
  }
}
