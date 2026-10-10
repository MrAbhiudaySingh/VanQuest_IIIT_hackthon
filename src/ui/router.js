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
import { WardrobePanel, PantryPanel, YearSkipPanel, GameOverPanel } from './lifePanels.js';
import { canEnter } from '../sim/property.js';
import { BankPanel } from './bankPanel.js';
import { FinancePanel } from './financePanel.js';
import { why } from './core.js';

// Shops you walk into (an interior with the shopkeeper inside) instead of a menu at the door.
export const WALK_IN_SHOPS = new Set(['market_furniture']);

export class Router {
  constructor(game, ui) {
    this.game = game; this.ui = ui; this.phaser = null;
    // the end of a run always gets its screen, once any open menu is closed
    const check = () => { if (game.state.status === 'dead' && !ui.panel?.locked && !(ui.panel instanceof YearSkipPanel)) this.gameOver(); };
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
      case 'lessons': this.ui.open(new AcademyPanel(this.game)); return true;
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
  inventory() { this.ui.open(new InventoryPanel(this.game)); }
  history() { this.ui.open(new HistoryPanel(this.game)); }
  pantry() { this.ui.open(new PantryPanel(this.game)); }
  wardrobe() { this.ui.open(new WardrobePanel(this.game)); }
  yearSkip() { this.ui.open(new YearSkipPanel(this.game)); }
  gameOver() { this.ui.open(new GameOverPanel(this.game, () => { this.ui.close(true); this.game.reset(); location.reload(); })); }
  encounter(uid) { this.ui.open(new EncounterPanel(this.game, uid)); }
  computer(computer, home) {
    this.ui.open(new ComputerPanel(this.game, computer, home, {
      history: () => this.history(),
      inventory: () => this.inventory(),
      plan: () => this.ui.open(new ShopPanel(this.game, 'market_grocery', { tab: 'plan' })),
      academy: () => this.ui.open(new AcademyPanel(this.game)),
      pantry: () => this.pantry(),
      wardrobe: () => this.wardrobe(),
      finances: () => this.finances(),
    }));
  }
}
