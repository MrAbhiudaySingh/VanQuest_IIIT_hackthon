// Helpers copied verbatim from the supplied store design (Assets/supplied-ui/Store/Store/store.js
// and index.html) so the game's shops reuse them instead of re-drawing them:
//   • the retro Web-Audio sound effect          • the shelf decor props (plants, chests, jars…)
//   • the per-slot decor pairs of the 6 shelves • the pixel cart / wallet / basket icons
// Only `export` keywords were added.

let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) audioCtx = new AudioContextClass();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

export function playPixelSound(freq, duration, type = 'square', vol = 0.05) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {}
}

export function getShelfDecorPropSVG(decorType) {
  switch (decorType) {
    case 'plant_pot':
      return `<svg viewBox="0 0 16 16" width="22" height="22" class="pixel-svg">
        <rect x="5" y="10" width="6" height="5" fill="#8a4e22"/>
        <rect x="4" y="9" width="8" height="2" fill="#bc773c"/>
        <circle cx="8" cy="6" r="4" fill="#3e7327"/>
        <circle cx="6" cy="4" r="2.5" fill="#589f38"/>
      </svg>`;
    case 'wood_chest':
    case 'chest_box':
      return `<svg viewBox="0 0 16 16" width="22" height="22" class="pixel-svg">
        <rect x="3" y="7" width="10" height="7" fill="#5c2e10"/>
        <rect x="2" y="5" width="12" height="3" fill="#8a4e22"/>
        <rect x="7" y="7" width="2" height="2" fill="#facc15"/>
      </svg>`;
    case 'cactus_pot':
      return `<svg viewBox="0 0 16 16" width="20" height="20" class="pixel-svg">
        <rect x="5" y="11" width="6" height="4" fill="#8a4e22"/>
        <rect x="7" y="5" width="2" height="6" fill="#44802c"/>
        <rect x="5" y="7" width="2" height="3" fill="#44802c"/>
        <rect x="9" y="6" width="2" height="3" fill="#44802c"/>
      </svg>`;
    case 'jars_shelf':
      return `<svg viewBox="0 0 16 16" width="22" height="22" class="pixel-svg">
        <rect x="4" y="8" width="3" height="6" fill="#3b82f6" opacity="0.8"/>
        <rect x="9" y="6" width="4" height="8" fill="#a855f7" opacity="0.8"/>
        <rect x="10" y="4" width="2" height="2" fill="#e2e8f0"/>
      </svg>`;
    case 'mini_lantern':
      return `<svg viewBox="0 0 16 16" width="20" height="20" class="pixel-svg">
        <rect x="6" y="5" width="4" height="7" fill="#fef08a" opacity="0.85"/>
        <rect x="5" y="3" width="6" height="2" fill="#332014"/>
        <rect x="5" y="12" width="6" height="2" fill="#332014"/>
      </svg>`;
    case 'vine_pot':
    case 'potted_shrub':
      return `<svg viewBox="0 0 16 16" width="22" height="22" class="pixel-svg">
        <rect x="5" y="11" width="6" height="4" fill="#693717"/>
        <circle cx="8" cy="7" r="4.5" fill="#2d5a1b"/>
        <circle cx="10" cy="5" r="3" fill="#44802c"/>
      </svg>`;
    case 'stacked_books':
      return `<svg viewBox="0 0 16 16" width="22" height="22" class="pixel-svg">
        <rect x="3" y="12" width="10" height="3" fill="#991b1b"/>
        <rect x="4" y="9" width="8" height="3" fill="#1e40af"/>
        <rect x="5" y="6" width="6" height="3" fill="#b45309"/>
      </svg>`;
    case 'pencil_pot':
      return `<svg viewBox="0 0 16 16" width="20" height="20" class="pixel-svg">
        <rect x="5" y="9" width="6" height="6" fill="#443224"/>
        <line x1="6" y1="4" x2="7" y2="9" stroke="#facc15" stroke-width="1.5"/>
        <line x1="9" y1="3" x2="8" y2="9" stroke="#ef4444" stroke-width="1.5"/>
      </svg>`;
    default:
      return '';
  }
}

// decor props of the template's six shelf slots, reused in order (slot 7 = slot 1 …)
export const SHELF_DECOR = [['plant_pot', 'wood_chest'], ['cactus_pot', 'jars_shelf'], ['plant_pot', 'chest_box'], ['mini_lantern', 'vine_pot'], ['stacked_books', 'pencil_pot'], ['mini_lantern', 'potted_shrub']];

export const ICONS = {
  cart: `<svg viewBox="0 0 16 16" width="32" height="32" class="pixel-svg">
            <path fill="#f6d289" d="M1 2h3l1.5 7h7.5l1.5-5H5V3h10l-2 7H5L3.5 3H1V2zm4 11a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm8 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"/>
          </svg>`,
  signCart: `<svg viewBox="0 0 16 16" width="22" height="22" class="pixel-svg">
                <path fill="#fae8ca" d="M1 2h2.5l1.5 7h7.5l1.5-5H4.8V3h10l-2 7H5L3.5 3H1V2zm4 11a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm8 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"/>
              </svg>`,
  wallet: `<svg viewBox="0 0 16 16" width="26" height="26" class="pixel-svg">
              <rect x="2" y="3" width="12" height="10" fill="#9a5829" />
              <rect x="3" y="2" width="10" height="2" fill="#bc773c" />
              <rect x="2" y="12" width="12" height="2" fill="#5c2e10" />
              <rect x="9" y="6" width="5" height="4" fill="#693717" />
              <circle cx="11.5" cy="8" r="1" fill="#facc15" />
            </svg>`,
  basket: `<svg viewBox="0 0 16 16" width="18" height="18" class="pixel-svg">
                <path fill="#facc15" d="M1 2h2.5l1.5 7h7.5l1.5-5H4.8V3h10l-2 7H5L3.5 3H1V2zm4 11a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm8 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"/>
              </svg>`,
};
