// ========================================================
// Scammer / Encounter Dialogue Interactive Logic Template
// ========================================================

const closeBtn = document.getElementById('closeBtn');
const commitBtn = document.getElementById('commitBtn');
const rejectBtn = document.getElementById('rejectBtn');
const depositInput = document.getElementById('depositInput');
const walletAmount = document.getElementById('walletAmount');

// Inquiry Buttons & Corresponding Cards
const btnAskEvidence = document.getElementById('btnAskEvidence');
const btnInvestigate = document.getElementById('btnInvestigate');
const btnAskRisks = document.getElementById('btnAskRisks');

const cardEvidence = document.getElementById('cardEvidence');
const cardInvestigate = document.getElementById('cardInvestigate');
const cardRisks = document.getElementById('cardRisks');

// Web Audio Synthesizer
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) audioCtx = new AudioContextClass();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playSound(freq, duration, type = 'square') {
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

// Button Hover Audio
document.querySelectorAll('button').forEach(btn => {
  btn.addEventListener('mouseenter', () => {
    playSound(440, 0.04, 'triangle');
  });
});

// Highlight inquiry card
function highlightCard(card) {
  playSound(620, 0.08, 'square');
  document.querySelectorAll('.inquiry-card').forEach(c => c.classList.remove('active'));
  card.classList.add('active');
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

btnAskEvidence.addEventListener('click', () => highlightCard(cardEvidence));
btnInvestigate.addEventListener('click', () => highlightCard(cardInvestigate));
btnAskRisks.addEventListener('click', () => highlightCard(cardRisks));

// Commit / Accept Action
commitBtn.addEventListener('click', () => {
  const amount = parseInt(depositInput.value, 10) || 0;
  playSound(180, 0.35, 'sawtooth');
  console.log('[ACTION_COMMITTED]:', { amount });
});

// Reject / Decline Action
rejectBtn.addEventListener('click', () => {
  playSound(780, 0.25, 'sine');
  console.log('[ACTION_DECLINED]');
});

// Close Action
closeBtn.addEventListener('click', () => {
  playSound(320, 0.1, 'sawtooth');
  const modal = document.getElementById('scammerModal');
  modal.style.opacity = '0.5';
  setTimeout(() => {
    modal.style.opacity = '1';
    console.log('[ACTION_MODAL_CLOSED]');
  }, 120);
});
