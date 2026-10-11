// App-wide singletons shared by scenes and UI.
import { Game } from './sim/game.js';
import { UI } from './ui/core.js';
import { Router } from './ui/router.js';
import { Hud } from './ui/hud.js';
import { setLang, readPref, onLangChange } from './i18n/i18n.js';

setLang(readPref() ?? 'en');

export const game = new Game();
export const ui = new UI(game);
export const router = new Router(game, ui);
export const hud = new Hud(game, ui, router);
onLangChange(() => { if (ui.panel) ui.render(); });

// Seconds of free roaming per in-game day. Time stops while menus are open.
export const REAL_SECONDS_PER_DAY = 20;
// Automated tests switch these off for determinism.
export const settings = { passiveTime: true, randomEncounters: true };

window.vq = { game, ui, router, hud, settings };   // handy for debugging and the smoke test
