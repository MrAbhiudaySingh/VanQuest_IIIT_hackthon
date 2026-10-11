// Helpers copied verbatim from the supplied Nidhi Bank design (Assets/supplied-ui/part 2/Bank/Bank/
// bank.js and index.html) so the game's bank reuses them instead of re-drawing them:
//   • the retro Web-Audio sound effect   • the five pillar-counter props (cash, piggy bank, % lamp,
//     calendar, growth chart)   • the template's inline pixel icons, in page order
// Only `export` keywords and this header were added.

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

export function getPillarPropSVG(propType) {
  switch (propType) {
    case 'cash_stack':
      return `<svg viewBox="0 0 24 24" width="46" height="46" class="pixel-svg">
        <rect x="3" y="10" width="18" height="8" fill="#15803d" />
        <rect x="4" y="8" width="16" height="3" fill="#22c55e" />
        <rect x="5" y="6" width="14" height="3" fill="#4ade80" />
        <rect x="9" y="6" width="6" height="12" fill="#166534" opacity="0.3" />
        <circle cx="12" cy="14" r="2" fill="#86efac" />
        <rect x="1" y="16" width="3" height="3" fill="#facc15" />
      </svg>`;

    case 'piggy_bank':
      return `<svg viewBox="0 0 24 24" width="46" height="46" class="pixel-svg">
        <ellipse cx="12" cy="13" rx="8" ry="6" fill="#f472b6" />
        <circle cx="18" cy="12" r="3" fill="#f472b6" />
        <rect x="20" y="11" width="2" height="2" fill="#db2777" />
        <circle cx="16" cy="10" r="1" fill="#000000" />
        <rect x="9" y="6" width="4" height="2" fill="#be185d" />
        <rect x="7" y="17" width="3" height="3" fill="#db2777" />
        <rect x="14" y="17" width="3" height="3" fill="#db2777" />
      </svg>`;

    case 'percent_lamp':
      return `<svg viewBox="0 0 24 24" width="46" height="46" class="pixel-svg">
        <!-- Brass banker lamp and gold percent symbol -->
        <text x="11" y="17" font-family="'Press Start 2P', monospace" font-size="11" fill="#facc15" text-anchor="middle">%</text>
        <rect x="4" y="14" width="3" height="5" fill="#ca8a04" />
        <rect x="17" y="11" width="4" height="3" fill="#22c55e" />
        <rect x="18" y="14" width="2" height="5" fill="#ca8a04" />
      </svg>`;

    case 'calendar_ledger':
      return `<svg viewBox="0 0 24 24" width="46" height="46" class="pixel-svg">
        <!-- Desk calendar with red top header -->
        <rect x="4" y="10" width="4" height="8" fill="#1e3a8a" />
        <rect x="10" y="6" width="10" height="12" fill="#ffffff" />
        <rect x="10" y="6" width="10" height="3" fill="#dc2626" />
        <circle cx="13" cy="12" r="1" fill="#1e293b" />
        <circle cx="17" cy="12" r="1" fill="#1e293b" />
        <circle cx="13" cy="15" r="1" fill="#1e293b" />
        <circle cx="17" cy="15" r="1" fill="#1e293b" />
      </svg>`;

    case 'growth_chart':
      return `<svg viewBox="0 0 24 24" width="46" height="46" class="pixel-svg">
        <!-- Step bar chart and arrow -->
        <rect x="4" y="15" width="3" height="5" fill="#eab308" />
        <rect x="9" y="12" width="3" height="8" fill="#eab308" />
        <rect x="14" y="8" width="3" height="12" fill="#eab308" />
        <line x1="5" y1="14" x2="18" y2="6" stroke="#22c55e" stroke-width="2" />
        <polygon points="18,4 20,7 16,8" fill="#22c55e" />
      </svg>`;

    default:
      return `<svg viewBox="0 0 24 24" width="46" height="46"><rect x="6" y="6" width="12" height="12" fill="#facc15"/></svg>`;
  }
}

// the template's five counters, in order: id, prop art, green highlight
export const PILLARS = [['pillar_cash', 'cash_stack', false], ['pillar_savings', 'piggy_bank', false], ['pillar_rate', 'percent_lamp', false], ['pillar_accrued', 'calendar_ledger', false], ['pillar_earned', 'growth_chart', true]];

export const ICONS = {
  bannerLeft: `<svg viewBox="0 0 16 16" width="24" height="24" class="pixel-svg">
        <path fill="#facc15" d="M1 4h14v2H1V4zm2 2h2v6H3V6zm4 0h2v6H7V6zm4 0h2v6h-2V6zM1 12h14v2H1v-2zM8 1L2 4h12L8 1z"/>
      </svg>`,
  bannerRight: `<svg viewBox="0 0 16 16" width="24" height="24" class="pixel-svg">
        <path fill="#facc15" d="M1 4h14v2H1V4zm2 2h2v6H3V6zm4 0h2v6H7V6zm4 0h2v6h-2V6zM1 12h14v2H1v-2zM8 1L2 4h12L8 1z"/>
      </svg>`,
  clerk: `<svg viewBox="0 0 24 24" width="48" height="48" class="pixel-svg">
        <rect x="7" y="3" width="10" height="4" fill="#452718" />
        <rect x="6" y="5" width="12" height="7" fill="#f8cca4" />
        <rect x="8" y="7" width="2" height="2" fill="#1e1b18" />
        <rect x="14" y="7" width="2" height="2" fill="#1e1b18" />
        <rect x="10" y="10" width="4" height="1" fill="#c27d53" />
        <rect x="5" y="12" width="14" height="8" fill="#ffffff" />
        <rect x="9" y="12" width="6" height="8" fill="#1e3a8a" />
        <rect x="11" y="12" width="2" height="8" fill="#dc2626" />
      </svg>`,
  signBoard: `<svg viewBox="0 0 16 16" width="28" height="28" class="pixel-svg">
        <path fill="#facc15" d="M1 4h14v2H1V4zm2 2h2v6H3V6zm4 0h2v6H7V6zm4 0h2v6h-2V6zM1 12h14v2H1v-2zM8 1L2 4h12L8 1z"/>
      </svg>`,
  plaqueEmblem: `<svg viewBox="0 0 16 16" width="32" height="32" class="pixel-svg">
            <path fill="#fef08a" d="M1 4h14v2H1V4zm2 2h2v6H3V6zm4 0h2v6H7V6zm4 0h2v6h-2V6zM1 12h14v2H1v-2zM8 1L2 4h12L8 1z"/>
          </svg>`,
  cashStack: `<svg viewBox="0 0 16 16" width="22" height="22" class="pixel-svg">
            <rect x="1" y="4" width="14" height="8" fill="#22c55e" />
            <rect x="3" y="3" width="10" height="2" fill="#16a34a" />
            <circle cx="8" cy="8" r="2.5" fill="#86efac" />
          </svg>`,
  deposit: `<svg viewBox="0 0 16 16" width="16" height="16" class="pixel-svg">
            <path fill="#1a120b" d="M1 4h14v2H1V4zm2 2h2v6H3V6zm4 0h2v6H7V6zm4 0h2v6h-2V6zM1 12h14v2H1v-2zM8 1L2 4h12L8 1z"/>
          </svg>`,
  withdraw: `<svg viewBox="0 0 16 16" width="16" height="16" class="pixel-svg">
            <path fill="#38bdf8" d="M1 4h14v2H1V4zm2 2h2v6H3V6zm4 0h2v6H7V6zm4 0h2v6h-2V6zM1 12h14v2H1v-2zM8 1L2 4h12L8 1z"/>
          </svg>`,
  emptyLedger: `<svg viewBox="0 0 16 16" width="20" height="20" class="pixel-svg">
            <path fill="#54658a" d="M1 4h14v2H1V4zm2 2h2v6H3V6zm4 0h2v6H7V6zm4 0h2v6h-2V6zM1 12h14v2H1v-2zM8 1L2 4h12L8 1z"/>
          </svg>`,
  wallet: `<svg viewBox="0 0 16 16" width="22" height="22" class="pixel-svg">
            <rect x="2" y="3" width="12" height="10" fill="#9a5829" />
            <rect x="3" y="2" width="10" height="2" fill="#bc773c" />
            <rect x="2" y="12" width="12" height="2" fill="#5c2e10" />
            <rect x="9" y="6" width="5" height="4" fill="#693717" />
            <circle cx="11.5" cy="8" r="1" fill="#facc15" />
          </svg>`,
  piggy: `<svg viewBox="0 0 16 16" width="22" height="22" class="pixel-svg">
            <circle cx="8" cy="8" r="6" fill="#f472b6" />
            <circle cx="6" cy="6" r="1" fill="#000000" />
            <rect x="13" y="7" width="2" height="2" fill="#db2777" />
            <rect x="5" y="13" width="2" height="2" fill="#db2777" />
            <rect x="9" y="13" width="2" height="2" fill="#db2777" />
            <rect x="7" y="3" width="3" height="1" fill="#be185d" />
          </svg>`,
};
