// Home computer launcher. Each home's PC has a stable id (home_pc_*). For this round it
// opens the existing personal dashboards; a full desktop arrives in a later round.
import { spendable } from '../sim/ledger.js';
import { portfolio } from '../sim/market.js';
import { inr, fmtDate } from '../sim/util.js';
import { esc } from './core.js';

export class ComputerPanel {
  constructor(game, computer, home, openers) {
    this.game = game;
    this.computer = computer;
    this.narrow = true;
    this.title = computer.device === 'laptop' ? 'Laptop' : 'Desktop computer';
    this.sub = `${esc(home.title)} · <code>${esc(computer.id)}</code>`;
    this.openers = openers;
  }
  render() {
    const s = this.game.state, p = portfolio(s);
    const apps = [['history', '📜 Bank & spending history'], ['pantry', '🥫 Pantry & food'], ['plan', '🛒 Grocery plan'], ['inventory', '🎒 Inventory'], ['wardrobe', '👕 Wardrobe'], ['finances', '📊 Net worth & accounts'], ['academy', '🎓 Learning record']];
    return `<div class="msg">Today is ${fmtDate(s.day)}. Cash + savings ${inr(spendable(s))} · Investments ${inr(p.total)} · ${esc(s.job.title)} (${inr(s.job.salary)}/mo)</div>
      <div class="grid">${apps.map(([a, l]) => `<button class="btn" data-a="${a}">${l}</button>`).join('')}</div>
      <p class="muted" style="margin-top:12px">More personal dashboards will run on this computer in a later round.</p>`;
  }
  onAction(a) { this.openers[a]?.(); }
}
