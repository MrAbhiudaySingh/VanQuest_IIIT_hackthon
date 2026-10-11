// ========================================================
// Course Cards Screen Interactions & Audio
// ========================================================

const closeBtn = document.getElementById('closeScreenBtn');
const startBtns = document.querySelectorAll('.pixel-btn-start');

// Audio Context Synthesizer
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) audioCtx = new AudioContextClass();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playPixelSound(freq, duration, type = 'square') {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {}
}

// Hover effects
document.querySelectorAll('.pixel-btn-start, .pixel-btn-close').forEach(btn => {
  btn.addEventListener('mouseenter', () => {
    playPixelSound(550, 0.05, 'triangle');
  });
});

// Close Action
closeBtn.addEventListener('click', () => {
  playPixelSound(320, 0.12, 'sawtooth');
  console.log('Close course selection screen');
  const screen = document.getElementById('courseScreen');
  screen.style.opacity = '0.5';
  setTimeout(() => {
    screen.style.opacity = '1';
    // Integrate with game engine dismissal / state change here
  }, 150);
});

// Start Course Action
startBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const courseId = btn.getAttribute('data-course');
    playPixelSound(740, 0.2, 'square');
    console.log(`Starting Course ${courseId}`);
    btn.style.filter = 'brightness(1.3)';
    setTimeout(() => {
      btn.style.filter = '';
    }, 150);
  });
});
