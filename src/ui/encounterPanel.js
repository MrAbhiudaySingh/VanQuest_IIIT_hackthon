import { encounterDef, ask, decline, invest } from '../sim/encounters.js';
import { spendable } from '../sim/ledger.js';
import { inr, fmtDate } from '../sim/util.js';
import { esc, newToken, why } from './core.js';

const TOPICS = [['evidence', 'Ask for evidence'], ['investigate', 'Investigate it'], ['risks', 'What are the risks?']];

export class EncounterPanel {
  constructor(game, uid) {
    this.game = game;
    this.uid = uid;
    this.narrow = true;
    this.title = 'Vikram — "friendly investor"';
    this.sub = 'An offer on the street. Fictional, simulated scenario.';
    this.amount = null; this.confirm = null; this.msg = null; this.done = null;
  }
  get rec() { return this.game.state.encounters.log.find(r => r.uid === this.uid); }

  render() {
    const rec = this.rec, def = encounterDef(rec.id);
    this.amount ??= def.offer.min;
    const said = rec.asked.map(t => `<div class="speaker"><span class="who">${esc(TOPICS.find(x => x[0] === t)[1])}</span><span class="say">${esc(def.answers[t])}</span></div>`).join('');
    const pitch = `<div class="speaker"><span class="who">Vikram:</span><span class="say">"${esc(def.pitch)}"</span></div>`;
    const msg = this.msg ? `<div class="msg ${this.msg.kind}">${esc(this.msg.text)}</div>` : '';
    if (this.done) return pitch + said + msg + this.done;
    const asks = TOPICS.map(([t, l]) => `<button class="btn sm" data-a="ask" data-t="${t}" ${rec.asked.includes(t) ? 'disabled' : ''}>${l}</button>`).join('');
    const conf = this.confirm ? `<div class="confirm"><h4>Commit ${inr(this.amount)} to "${esc(def.offer.name)}"?</h4>
        <p>The money leaves your cash (then savings) now. What comes back depends on how this opportunity actually plays out — it is <b>not guaranteed</b>. You'll find out around ${fmtDate(this.game.state.day + def.outcome.days)}.</p>
        <div class="row"><button class="btn primary" data-a="invest-confirm">Commit ${inr(this.amount)}</button><button class="btn" data-a="cancel">Back</button></div></div>` : '';
    return pitch + said + msg + `<div class="row" style="flex-wrap:wrap;margin:8px 0">${asks}</div>
      <div class="card"><h3>${esc(def.offer.name)}</h3><div class="muted">He'll take ${inr(def.offer.min)} – ${inr(def.offer.max)}. Your cash + savings: ${inr(spendable(this.game.state))}.</div>
      <div class="row"><input class="num" type="number" min="${def.offer.min}" max="${def.offer.max}" step="500" value="${this.amount}" data-in="amt" aria-label="amount">
      <button class="btn" data-a="invest">Commit money…</button><button class="btn primary" data-a="decline">No thanks</button></div></div>${conf}`;
  }

  // Closing the dialog without choosing = walking away (no money moves).
  onClose() { if (this.rec.status === 'open') this.game.act(s => decline(s, this.uid)); }

  onInput(el) { if (el.dataset.in === 'amt') this.amount = Math.floor(Number(el.value) || 0); this.confirm = null; }

  onAction(a, el) {
    const def = encounterDef(this.rec.id);
    this.msg = null;
    if (a === 'ask') this.game.act(s => ask(s, this.uid, el.dataset.t));
    if (a === 'invest') this.confirm = { token: newToken() };
    if (a === 'cancel') this.confirm = null;
    if (a === 'invest-confirm') {
      const token = this.confirm.token; this.confirm = null;
      const r = this.game.act(s => invest(s, this.uid, this.amount, token));
      if (!r.ok) { this.msg = { kind: 'error', text: why(r) }; return; }
      this.done = `<div class="msg">You handed over ${inr(this.amount)}. Vikram shakes your hand: "You won't regret it." The result will appear in your notifications and financial history around ${fmtDate(r.rec.resolveDay)}.</div>
        <div class="row"><button class="btn primary" data-a="close">Walk on</button></div>`;
    }
    if (a === 'decline') {
      this.game.act(s => decline(s, this.uid));
      const asked = this.rec.asked.length;
      const flags = def.flags.length ? `<p><b>Warning signs in this pitch:</b></p><ul>${def.flags.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : '<p>This pitch had no obvious red flags — declining a legitimate but uncertain opportunity is also a reasonable choice.</p>';
      this.done = `<div class="msg ok">You walked away${asked ? ` after asking ${asked} question(s)` : ''}. Nothing was spent.</div>${flags}
        <p class="muted">${esc(def.debrief)}</p><div class="row"><button class="btn primary" data-a="close">Continue</button></div>`;
    }
  }
}
