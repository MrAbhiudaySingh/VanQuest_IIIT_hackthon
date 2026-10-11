// ========================================================
// VANQUEST - NIDHI BANK TEMPLATE LOGIC
// 5 Classical Pillars, Dynamic Transactions & Placeholders
// ========================================================

// Customizable Bank Template Configuration
const bankConfig = {
  bankName: "NIDHI BANK",
  slogan: "YOUR MONEY. A BRIGHTER TOMORROW.",
  officerName: "Mr. Desai",
  officerRole: "Bank officer",
  officerQuote: "Let's put your money where it works for you.",
  currencySymbol: "₹",

  // Balances
  cashOnHand: 15000,
  savingsAccount: 0,
  interestRateAnnual: "3.50% p.a.",
  accruedNotPaid: 0,
  interestEarnedToDate: 0,

  // 5 Arch Counter Slots configured with placeholder labels for easy customization
  pillars: [
    {
      id: "pillar_cash",
      title: "[COUNTER_01_TITLE]",
      valueType: "currency",
      propType: "cash_stack",
      isHighlightGreen: false
    },
    {
      id: "pillar_savings",
      title: "[COUNTER_02_TITLE]",
      valueType: "currency",
      propType: "piggy_bank",
      isHighlightGreen: false
    },
    {
      id: "pillar_rate",
      title: "[COUNTER_03_TITLE]",
      valueType: "rate",
      propType: "percent_lamp",
      isHighlightGreen: false
    },
    {
      id: "pillar_accrued",
      title: "[COUNTER_04_TITLE]",
      valueType: "currency",
      propType: "calendar_ledger",
      isHighlightGreen: false
    },
    {
      id: "pillar_earned",
      title: "[COUNTER_05_TITLE]",
      valueType: "currency",
      propType: "growth_chart",
      isHighlightGreen: true
    }
  ]
};

// Retro Web Audio Synthesizer (Consistent with Vanguard UI)
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) audioCtx = new AudioContextClass();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playPixelSound(freq, duration, type = 'square', vol = 0.05) {
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

// Pixel Prop SVG Graphics Generator for Bank Niche Counters
function getPillarPropSVG(propType) {
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

// DOM Elements
const bankPlaqueTitleEl = document.getElementById('bankPlaqueTitle');
const bankPlaqueSloganEl = document.getElementById('bankPlaqueSlogan');
const bankHeaderTitleEl = document.getElementById('bankHeaderTitle');
const officerNameEl = document.getElementById('officerName');
const officerRoleEl = document.getElementById('officerRole');
const officerQuoteEl = document.getElementById('officerQuote');
const bankPillarsGridEl = document.getElementById('bankPillarsGrid');
const transactAmountInputEl = document.getElementById('transactAmountInput');
const depositBtn = document.getElementById('depositBtn');
const withdrawBtn = document.getElementById('withdrawBtn');
const closeBankBtn = document.getElementById('closeBankBtn');
const footerCashValEl = document.getElementById('footerCashVal');
const footerSavingsValEl = document.getElementById('footerSavingsVal');
const pixelToastEl = document.getElementById('pixelToast');
const ledgerEmptyStateEl = document.getElementById('ledgerEmptyState');
const ledgerHistoryListEl = document.getElementById('ledgerHistoryList');

// Number format helper
function formatCurrency(val) {
  return Number(val).toLocaleString('en-IN');
}

// Toast Notification
function showToast(msg) {
  pixelToastEl.textContent = msg;
  pixelToastEl.classList.add('show');
  setTimeout(() => {
    pixelToastEl.classList.remove('show');
  }, 2300);
}

// Initialize Bank
function initBank() {
  bankPlaqueTitleEl.textContent = bankConfig.bankName;
  bankPlaqueSloganEl.textContent = bankConfig.slogan;
  bankHeaderTitleEl.textContent = bankConfig.bankName;
  officerNameEl.textContent = bankConfig.officerName;
  officerRoleEl.textContent = bankConfig.officerRole;
  officerQuoteEl.textContent = `"${bankConfig.officerQuote}"`;

  renderPillars();
  updateFooterBalances();
  attachBankEvents();
}

// Render 5 Classical Pillar Arch Cards
function renderPillars() {
  bankPillarsGridEl.innerHTML = '';

  bankConfig.pillars.forEach(pillar => {
    const card = document.createElement('article');
    card.className = `pillar-arch-card ${pillar.isHighlightGreen ? 'highlight-green' : ''}`;
    card.id = pillar.id;

    let valDisplay = '';
    if (pillar.valueType === 'currency') {
      let currentVal = 0;
      if (pillar.id === 'pillar_cash') currentVal = bankConfig.cashOnHand;
      else if (pillar.id === 'pillar_savings') currentVal = bankConfig.savingsAccount;
      else if (pillar.id === 'pillar_accrued') currentVal = bankConfig.accruedNotPaid;
      else if (pillar.id === 'pillar_earned') currentVal = bankConfig.interestEarnedToDate;

      valDisplay = `<span class="arch-val-currency">${bankConfig.currencySymbol}</span><span class="arch-val-num">${formatCurrency(currentVal)}</span>`;
    } else {
      valDisplay = `<span class="arch-val-num">${bankConfig.interestRateAnnual}</span>`;
    }

    card.innerHTML = `
      <div class="pillar-arch-header">
        <span class="arch-flourish">◈</span>
        <h3 class="pillar-arch-title">${pillar.title}</h3>
      </div>

      <div class="pillar-arch-stage">
        <div class="arch-prop-sprite">
          ${getPillarPropSVG(pillar.propType)}
        </div>
      </div>

      <div class="pillar-arch-plaque">
        ${valDisplay}
      </div>
    `;

    bankPillarsGridEl.appendChild(card);
  });
}

function updatePillarValues() {
  const cashNum = document.querySelector('#pillar_cash .arch-val-num');
  if (cashNum) cashNum.textContent = formatCurrency(bankConfig.cashOnHand);

  const savingsNum = document.querySelector('#pillar_savings .arch-val-num');
  if (savingsNum) savingsNum.textContent = formatCurrency(bankConfig.savingsAccount);
}

function updateFooterBalances() {
  footerCashValEl.textContent = formatCurrency(bankConfig.cashOnHand);
  footerSavingsValEl.textContent = formatCurrency(bankConfig.savingsAccount);
}

function addLedgerRecord(type, amount) {
  ledgerEmptyStateEl.style.display = 'none';
  ledgerHistoryListEl.style.display = 'flex';

  const row = document.createElement('div');
  row.className = 'ledger-row';
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  row.innerHTML = `
    <span style="color: ${type === 'DEPOSIT' ? '#34d399' : '#38bdf8'}; font-weight: bold;">[${type}]</span>
    <span>₹${formatCurrency(amount)}</span>
    <span style="color: #64748b;">${time}</span>
  `;

  ledgerHistoryListEl.prepend(row);
}

// Attach Button & Navigation Tab Events
function attachBankEvents() {
  // Deposit Action
  depositBtn.addEventListener('click', () => {
    const amount = parseInt(transactAmountInputEl.value, 10);
    if (isNaN(amount) || amount <= 0) {
      playPixelSound(220, 0.15, 'sawtooth');
      showToast("PLEASE ENTER A VALID AMOUNT");
      return;
    }

    if (bankConfig.cashOnHand < amount) {
      playPixelSound(200, 0.25, 'sawtooth');
      showToast("NOT ENOUGH CASH ON HAND!");
      return;
    }

    bankConfig.cashOnHand -= amount;
    bankConfig.savingsAccount += amount;

    playPixelSound(650, 0.1, 'square');
    setTimeout(() => playPixelSound(880, 0.18, 'triangle'), 80);

    updatePillarValues();
    updateFooterBalances();
    addLedgerRecord('DEPOSIT', amount);
    showToast(`DEPOSITED ₹${formatCurrency(amount)} TO SAVINGS`);
  });

  // Withdraw Action
  withdrawBtn.addEventListener('click', () => {
    const amount = parseInt(transactAmountInputEl.value, 10);
    if (isNaN(amount) || amount <= 0) {
      playPixelSound(220, 0.15, 'sawtooth');
      showToast("PLEASE ENTER A VALID AMOUNT");
      return;
    }

    if (bankConfig.savingsAccount < amount) {
      playPixelSound(200, 0.25, 'sawtooth');
      showToast("NOT ENOUGH BALANCE IN SAVINGS!");
      return;
    }

    bankConfig.savingsAccount -= amount;
    bankConfig.cashOnHand += amount;

    playPixelSound(480, 0.1, 'square');
    setTimeout(() => playPixelSound(360, 0.18, 'sawtooth'), 80);

    updatePillarValues();
    updateFooterBalances();
    addLedgerRecord('WITHDRAW', amount);
    showToast(`WITHDREW ₹${formatCurrency(amount)} TO CASH`);
  });

  // Tab switching
  document.querySelectorAll('.pixel-bank-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.pixel-bank-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      playPixelSound(540, 0.05, 'triangle');
      showToast(`NAVIGATED TO [${tab.textContent}]`);
    });
  });

  // Audio on hover
  document.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      playPixelSound(520, 0.03, 'triangle', 0.02);
    });
  });

  // Close Console
  closeBankBtn.addEventListener('click', () => {
    playPixelSound(300, 0.12, 'sawtooth');
    const consoleEl = document.getElementById('bankConsole');
    consoleEl.style.opacity = '0.5';
    setTimeout(() => {
      consoleEl.style.opacity = '1';
      console.log("Bank console closed (link to game world transition here)");
    }, 150);
  });
}

// Boot up
document.addEventListener('DOMContentLoaded', initBank);
