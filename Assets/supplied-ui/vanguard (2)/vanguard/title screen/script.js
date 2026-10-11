// ========================================================
// Title Screen Interactive Logic & Retro Synthesizer SFX
// ========================================================

const startButton = document.getElementById('startButton');
const exitButton = document.getElementById('exitButton');

// Optional retro Web Audio sound effects synthesizer
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// 8-bit Hover blip
function playHoverSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(420, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(840, ctx.currentTime + 0.06);

    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.07);
  } catch (e) {
    // Audio context may require interaction or be restricted
  }
}

// 8-bit Confirm chime
function playSelectSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(330, ctx.currentTime);
    osc.frequency.setValueAtTime(440, ctx.currentTime + 0.08);
    osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.16);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.36);
  } catch (e) {
    // Ignore
  }
}

// Event Listeners
[startButton, exitButton].forEach(btn => {
  if (!btn) return;
  btn.addEventListener('mouseenter', () => {
    playHoverSound();
  });
});

startButton.addEventListener('click', () => {
  playSelectSound();
  startButton.style.filter = 'brightness(1.3)';
  setTimeout(() => {
    startButton.style.filter = '';
    console.log('Journey started!');
    // Trigger your game loop or state transition here
  }, 220);
});

exitButton.addEventListener('click', () => {
  playSelectSound();
  if (confirm('Are you sure you want to quit?')) {
    console.log('Exiting game...');
    // If running in Electron / Webview, handle window.close()
    window.close();
  }
});
