// The supplied VanQuest title screen (Assets/supplied-ui/vanguard (2)/vanguard/title screen →
// skins/title.css, sounds in skins/titleKit.js): campus background, scanlines, the arrow logo, an
// "Enter your journey" button and EXIT. Shown when the game loads; the game (and its clock) waits
// behind it. Entering continues the current character (a brand-new one starts with the introduction and
// the goals quiz); "Characters" lists every character saved in this browser (Round 7).
import { esc } from './core.js';
import { LANGS, getLang, setLang, writePref } from '../i18n/i18n.js';
import { playSelectSound, playHoverSound } from './skins/titleKit.js';

const DIR = 'Assets/supplied-ui/vanguard%20(2)/vanguard/title%20screen/';
const LOGO = `${DIR}VANQUEST%20Pixel%20Arrow%20Logo.png`;

export class TitlePanel {
  constructor(game, { characters } = {}) {
    this.game = game; this.characters = characters;
    this.title = 'VanQuest';
    this.locked = true;            // Esc / clicking outside don't dismiss it — choose a button
    this.note = null;
  }

  frame() {
    const s = this.game.state, returning = s.day > 0 || s.ledger.length > 1, ended = s.status !== 'alive';
    const who = s.character?.name ? `${esc(s.character.name)}, ` : '';
    return `<div class="vq-title">
      <div class="screen-overlay"></div><div class="scanlines"></div>
      <main class="title-screen-container">
        <section class="hero-center-group">
          <div class="logo-wrapper"><img src="${LOGO}" alt="VANQUEST Logo" class="game-logo"><div class="logo-glow"></div></div>
          <div class="action-wrapper"><button class="pixel-btn pixel-btn-primary" data-a="start" aria-label="Enter your journey">
            <span class="btn-shine"></span><span class="btn-text">Enter your journey</span></button></div>
          ${ended ? `<p class="title-resume">${who}${s.status === 'dead' ? 'life ended' : 'retired'} — enter to see the final report, or choose another character</p>`
            : returning ? `<p class="title-resume">Continue — ${who}${esc(s.job.title)}, day ${s.day + 1}</p>` : `<p class="title-resume">A new life starts at 18${who ? ` — ${who.slice(0, -2)}` : ''}</p>`}
          <div class="action-wrapper"><button class="pixel-btn pixel-btn-exit title-chars" data-a="chars" data-testid="title-characters"><span class="btn-text">Characters</span></button></div>
          <div class="title-lang" role="group" aria-label="Language" translate="no">${Object.entries(LANGS).map(([k, l]) => `<button class="pixel-btn pixel-btn-exit ${getLang() === k ? 'on' : ''}" data-a="lang" data-lang="${k}" lang="${k}" aria-pressed="${getLang() === k}" data-testid="lang-${k}"><span class="btn-text">${l}</span></button>`).join('')}</div>
          ${this.note ? `<p class="title-resume" data-testid="title-note">${esc(this.note)}</p>` : ''}
        </section>
        <footer class="bottom-bar"><button class="pixel-btn pixel-btn-exit" data-a="exit" aria-label="Exit Game"><span class="btn-icon">✖</span><span class="btn-text">EXIT</span></button></footer>
      </main></div>`;
  }

  onAction(a, el) {
    if (a === 'lang') { setLang(el.dataset.lang); writePref(el.dataset.lang); return; }
    if (a === 'start') { playSelectSound(); this.done?.(); return; }
    if (a === 'chars') { playSelectSound(); this.characters?.(); return; }
    if (a === 'exit') {
      playSelectSound();
      if (!confirm('Are you sure you want to quit?')) return;
      window.close();                        // only works for windows a script opened…
      this.note = 'Your progress is saved — close this browser tab to quit.';   // …so explain if we're still here
    }
  }
  hover() { playHoverSound(); }
}
