// Decides what happens when the player interacts with a location. Each location's
// `kind` (src/data/locations.js) maps to a panel or scene here.
import { LOCATIONS } from '../data/locations.js';
import { SHOPS } from '../data/catalog.js';
import { ShopPanel } from './shopPanel.js';
import { TradingPanel } from './tradingPanel.js';
import { AcademyPanel } from './academyPanel.js';
import { CollegePanel } from './collegePanel.js';
import { InventoryPanel, HistoryPanel } from './infoPanels.js';
import { EncounterPanel } from './encounterPanel.js';
import { ComputerPanel } from './computerPanel.js';
import { DealershipPanel } from './dealershipPanel.js';
import { PropertyPanel } from './propertyPanel.js';
import { WardrobePanel, PantryPanel, YearSkipPanel } from './lifePanels.js';
import { CharacterPanel, IntroPanel, GoalsQuizPanel, LifePanel, RetirePanel, isFresh } from './journeyPanels.js';
import { FinalReportPanel, NewspaperPanel } from './reportPanels.js';
import { canEnter } from '../sim/property.js';
import { BankPanel } from './bankPanel.js';
import { FinancePanel } from './financePanel.js';
import { TitlePanel } from './titlePanel.js';
import { why } from './core.js';

// Shops you walk into (an interior with the shopkeeper inside) instead of a menu at the door.
export const WALK_IN_SHOPS = new Set(['market_furniture']);

export class Router {
  constructor(game, ui) {
    this.game = game; this.ui = ui; this.phaser = null;
    // the end of a life always gets its screen (the final report), once any open menu is closed;
    // panels that make sense after a life (the report itself, characters, the newspaper) stay open
    YearSkipPanel.prototype.allowAfterLife = true;
    const check = () => { if (game.state.status !== 'alive' && !ui.panel?.locked && !ui.panel?.allowAfterLife) this.gameOver(); };
    game.on(check);
    ui.onChange(open => { if (!open) check(); });
  }

  // returns true if something opened
  location(id) {
    const loc = LOCATIONS[id];
    if (WALK_IN_SHOPS.has(id)) return this.enterInterior({ shopId: id }), true;
    if (SHOPS[id]) return this.ui.open(new ShopPanel(this.game, id)), true;
    switch (loc.kind) {
      case 'investing': this.ui.open(new TradingPanel(this.game)); return true;
      case 'lessons': this.ui.open(new AcademyPanel(this.game, this.ui)); return true;
      case 'college': this.ui.open(new CollegePanel(this.game)); return true;
      case 'dealership': this.ui.open(new DealershipPanel(this.game)); return true;
      case 'bank': this.ui.open(new BankPanel(this.game)); return true;
      case 'home': {
        const a = canEnter(this.game.state, id);
        if (a.reason === 'tenant_occupied') { this.ui.open(new PropertyPanel(this.game, { tab: 'mine' })); this.ui.toast(why(a), 'info'); return true; }
        if (!a.ok) { this.ui.toast(why(a), 'warn'); return false; }
        this.enterInterior({ homeId: id });
        return true;
      }
      case 'school': this.ui.toast('Riverside High is closed for the summer holidays. (No school interactions this round.)', 'info'); return false;
    }
    return false;
  }

  enterInterior(data) {
    this.phaser.scene.getScene('City').scene.sleep();
    this.phaser.scene.run('Home', data);
  }

  shop(id) { this.ui.open(new ShopPanel(this.game, id)); }
  property() { this.ui.open(new PropertyPanel(this.game)); }
  dealership() { this.ui.open(new DealershipPanel(this.game)); }
  bank(opts) { this.ui.open(new BankPanel(this.game, opts)); }
  finances() { this.ui.open(new FinancePanel(this.game)); }
  title() {
    const p = new TitlePanel(this.game, { characters: () => this.characters({ fromTitle: true }) });
    p.done = () => { this.ui.close(); this.enter(); };
    this.ui.open(p);
  }
  // Into the game: a brand-new character starts in their flat with the introduction, then the goals quiz.
  enter() {
    const s = this.game.state;
    if (s.status !== 'alive') return;                          // the final report opens by itself
    if (isFresh(s)) return this.whenWorldReady(() => { this.enterInterior({ homeId: s.housing?.propertyId ?? 'home_apartment' }); this.intro({ first: true }); });
    // a new character who left between the introduction and the quiz gets it once more; older saves only get the HUD hint
    if (s.onboarding?.introDone && !s.onboarding.legacy && !s.onboarding.quizDone && !s.onboarding.quizPrompted && !s.goals?.original) this.quiz({ first: true });
  }
  whenWorldReady(fn) { const ok = this.phaser?.scene?.getScene('City')?.traffic; return ok ? fn() : setTimeout(() => this.whenWorldReady(fn), 100); }
  // reload into a different character (or a new one) without showing the title again
  restartInto() { this.ui.close(true); location.search.includes('play') ? location.reload() : location.replace(`${location.pathname}?enter`); }
  characters({ fromTitle = false } = {}) {
    this.ui.open(new CharacterPanel(this.game, {
      onPlay: switched => (switched ? this.restartInto() : (this.ui.close(), this.enter())),
      onNew: () => this.restartInto(),
      onReport: (report, o) => this.report(report, { ...o, back: () => (fromTitle ? this.title() : this.characters()) }),
    }));
  }
  intro({ first = false } = {}) { this.ui.open(new IntroPanel(this.game, { first, onDone: () => (first ? this.quiz({ first: true }) : this.ui.close()) })); }
  quiz({ revise = false, first = false } = {}) {
    if (first) this.game.act(s => { s.onboarding.quizPrompted = true; });
    this.ui.open(new GoalsQuizPanel(this.game, { revise, onDone: rec => { this.ui.close(); if (rec && first) this.ui.toast('Goals saved. Next: walk outside, buy groceries at FreshCart (or start a monthly plan) and look for work and study options. Press L any time.', 'ok', 9000); } }));
  }
  life() { this.ui.open(new LifePanel(this.game, this)); }
  retire() { this.ui.open(new RetirePanel(this.game, { onDone: () => this.ui.close() })); }
  news(id) { this.ui.open(new NewspaperPanel(this.game, id)); }
  report(report, { archived = false, back } = {}) {
    this.ui.open(new FinalReportPanel(this.game, report, { archived, onBack: () => (back ? back() : this.ui.close()), onRestart: () => { this.ui.close(true); this.game.reset(); this.restartInto(); }, onCharacters: () => this.characters() }));
  }
  inventory() { this.ui.open(new InventoryPanel(this.game)); }
  history() { this.ui.open(new HistoryPanel(this.game)); }
  pantry() { this.ui.open(new PantryPanel(this.game)); }
  wardrobe() { this.ui.open(new WardrobePanel(this.game)); }
  yearSkip() { this.ui.open(new YearSkipPanel(this.game)); }
  gameOver() { this.report(this.game.state.life.final); }
  encounter(uid) { this.ui.open(new EncounterPanel(this.game, uid)); }
  computer(computer, home) {
    this.ui.open(new ComputerPanel(this.game, computer, home, {
      history: () => this.history(),
      inventory: () => this.inventory(),
      plan: () => this.ui.open(new ShopPanel(this.game, 'market_grocery', { tab: 'plan' })),
      academy: () => this.ui.open(new AcademyPanel(this.game, this.ui)),
      pantry: () => this.pantry(),
      wardrobe: () => this.wardrobe(),
      finances: () => this.finances(),
    }));
  }
}
