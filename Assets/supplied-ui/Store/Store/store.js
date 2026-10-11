// ========================================================
// VANQUEST - COZY WOODEN MARKET STALL (STORE COPY 1)
// Modular Template Logic with Placeholder Titles for Manual Entry
// ========================================================

// Customizable Store Template Configuration
const storeConfig = {
  storeName: "CORNER CONVENIENCE",
  keeperName: "RAVI",
  keeperRole: "SHOP OWNER",
  greetingQuote: "OUT OF SOAP AGAIN? HAPPENS TO EVERYONE.",
  initialWallet: 12001,
  currencySymbol: "₹",

  // 6 Shelving slots configured with placeholder labels for easy manual customization
  items: [
    {
      id: "slot_01",
      name: "[ITEM_01_TITLE]",
      price: 45,
      unit: "PER BAR",
      owned: 0,
      maxLimit: null,
      decorTypeLeft: "plant_pot",
      decorTypeRight: "wood_chest"
    },
    {
      id: "slot_02",
      name: "[ITEM_02_TITLE]",
      price: 95,
      unit: "PER TUBE",
      owned: 0,
      maxLimit: null,
      decorTypeLeft: "cactus_pot",
      decorTypeRight: "jars_shelf"
    },
    {
      id: "slot_03",
      name: "[ITEM_03_TITLE]",
      price: 180,
      unit: "PER PACK",
      owned: 0,
      maxLimit: null,
      decorTypeLeft: "plant_pot",
      decorTypeRight: "chest_box"
    },
    {
      id: "slot_04",
      name: "[ITEM_04_TITLE]",
      price: 55,
      unit: "PER BOTTLE",
      owned: 0,
      maxLimit: null,
      decorTypeLeft: "mini_lantern",
      decorTypeRight: "vine_pot"
    },
    {
      id: "slot_05",
      name: "[ITEM_05_TITLE]",
      price: 60,
      unit: "PER ITEM",
      owned: 0,
      maxLimit: null,
      decorTypeLeft: "stacked_books",
      decorTypeRight: "pencil_pot"
    },
    {
      id: "slot_06",
      name: "[ITEM_06_TITLE]",
      price: 250,
      unit: "PER ITEM",
      owned: 0,
      maxLimit: 3,
      decorTypeLeft: "mini_lantern",
      decorTypeRight: "potted_shrub"
    }
  ]
};

// Web Audio API Synthesizer (Standard Vanquest retro SFX)
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

// Pixel Prop Decor Generator (Cozy Shop Shelving Atmosphere)
function getShelfDecorPropSVG(decorType) {
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

// Center Placeholder Graphic Box (Ready for custom pixel sprites or icon replacements)
function getPlaceholderItemGraphicSVG(index) {
  // Renders a sleek pixel art icon slot for the user to replace or display
  const colors = ["#f472b6", "#38bdf8", "#fb923c", "#4ade80", "#60a5fa", "#818cf8"];
  const color = colors[index % colors.length];

  return `<svg viewBox="0 0 16 16" width="38" height="38" class="pixel-svg">
    <!-- Pixel art item container placeholder -->
    <rect x="2" y="2" width="12" height="12" fill="none" stroke="${color}" stroke-width="1" stroke-dasharray="2 1"/>
    <rect x="4" y="4" width="8" height="8" fill="${color}" opacity="0.35"/>
    <rect x="6" y="6" width="4" height="4" fill="${color}"/>
  </svg>`;
}

// Basket & Wallet State
const basketState = {};
let currentWallet = storeConfig.initialWallet;

// DOM Elements
const stallSignTitleEl = document.getElementById('stallSignTitle');
const subKeeperEl = document.querySelector('.sub-keeper');
const subRoleEl = document.querySelector('.sub-role');
const dialogueSpeakerEl = document.getElementById('dialogueSpeaker');
const dialogueTextEl = document.getElementById('dialogueText');
const shelvesGridEl = document.getElementById('shelvesGrid');
const walletAmountEl = document.getElementById('walletAmount');
const basketTotalEl = document.getElementById('basketTotal');
const basketCountSummaryEl = document.getElementById('basketCountSummary');
const clearBasketBtn = document.getElementById('clearBasketBtn');
const checkoutBtn = document.getElementById('checkoutBtn');
const closeStoreBtn = document.getElementById('closeStoreBtn');
const pixelToastEl = document.getElementById('pixelToast');

// Format Currencies
function formatCurrency(val) {
  return Number(val).toLocaleString('en-IN');
}

// Toast Alert
function showToast(message) {
  pixelToastEl.textContent = message;
  pixelToastEl.classList.add('show');
  setTimeout(() => {
    pixelToastEl.classList.remove('show');
  }, 2200);
}

// Initialize Store
function initStore() {
  stallSignTitleEl.textContent = storeConfig.storeName;
  subKeeperEl.textContent = storeConfig.keeperName;
  subRoleEl.textContent = storeConfig.keeperRole;
  dialogueSpeakerEl.textContent = `${storeConfig.keeperName}:`;
  dialogueTextEl.textContent = `"${storeConfig.greetingQuote}"`;
  walletAmountEl.textContent = formatCurrency(currentWallet);

  renderShelves();
  updateBasketUI();
}

// Render Shelves
function renderShelves() {
  shelvesGridEl.innerHTML = '';

  storeConfig.items.forEach((item, index) => {
    basketState[item.id] = basketState[item.id] || 0;

    const slotCard = document.createElement('article');
    slotCard.className = `shelf-compartment ${basketState[item.id] > 0 ? 'has-basket-items' : ''}`;
    slotCard.id = `slot_${item.id}`;

    const limitBadge = item.maxLimit ? `<span class="shelf-max-tag">MAX ${item.maxLimit}</span>` : '';

    slotCard.innerHTML = `
      <!-- Showcase Shelf Planks & Atmosphere -->
      <div class="shelf-showcase-stage">
        <div class="showcase-timber-lines"></div>

        <!-- Left Decor -->
        <div class="decor-prop decor-left">
          ${getShelfDecorPropSVG(item.decorTypeLeft)}
        </div>

        <!-- Center Item Stage (Placeholder) -->
        <div class="item-stage-center">
          <div class="pixel-item-graphic">
            ${getPlaceholderItemGraphicSVG(index)}
          </div>
        </div>

        <!-- Right Decor -->
        <div class="decor-prop decor-right">
          ${getShelfDecorPropSVG(item.decorTypeRight)}
        </div>

        ${limitBadge}
      </div>

      <!-- Lower Item Information Plaque -->
      <div class="shelf-info-board">
        <div class="shelf-title-row">
          <span class="shelf-item-title" title="${item.name}">${item.name}</span>
        </div>

        <div class="shelf-pricing-row">
          <div class="shelf-price-box">
            <span class="shelf-currency">${storeConfig.currencySymbol}</span>
            <span class="shelf-price-num">${item.price}</span>
          </div>
          <span class="shelf-unit-label">${item.unit}</span>
        </div>

        <div class="shelf-action-row">
          <span class="shelf-owned-tally">YOU HAVE ${item.owned}</span>
          <div class="shelf-stepper-box">
            <button class="shelf-stepper-btn btn-minus" data-id="${item.id}" aria-label="Decrease quantity" ${basketState[item.id] === 0 ? 'disabled' : ''}>-</button>
            <input type="text" class="shelf-stepper-qty" value="${basketState[item.id]}" readonly aria-label="Selected quantity">
            <button class="shelf-stepper-btn btn-plus" data-id="${item.id}" aria-label="Increase quantity">+</button>
          </div>
        </div>
      </div>
    `;

    shelvesGridEl.appendChild(slotCard);
  });

  attachShelfEvents();
}

// Stepper and Audio Events
function attachShelfEvents() {
  document.querySelectorAll('.btn-plus').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const item = storeConfig.items.find(i => i.id === id);
      if (!item) return;

      if (item.maxLimit && basketState[id] >= item.maxLimit) {
        playPixelSound(240, 0.12, 'sawtooth');
        showToast(`LIMIT REACHED: MAX ${item.maxLimit} FOR THIS ITEM`);
        return;
      }

      basketState[id] = (basketState[id] || 0) + 1;
      playPixelSound(620, 0.08, 'square');
      updateSlotCardUI(id);
      updateBasketUI();
    });
  });

  document.querySelectorAll('.btn-minus').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      if (basketState[id] > 0) {
        basketState[id] -= 1;
        playPixelSound(440, 0.08, 'square');
        updateSlotCardUI(id);
        updateBasketUI();
      }
    });
  });

  document.querySelectorAll('.shelf-stepper-btn, .pixel-btn-wood-clear, .pixel-btn-wood-review, .pixel-stall-close-btn').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      playPixelSound(520, 0.04, 'triangle', 0.03);
    });
  });
}

function updateSlotCardUI(id) {
  const card = document.getElementById(`slot_${id}`);
  if (!card) return;

  const count = basketState[id] || 0;
  const input = card.querySelector('.shelf-stepper-qty');
  const minusBtn = card.querySelector('.btn-minus');

  input.value = count;
  minusBtn.disabled = (count === 0);

  if (count > 0) {
    card.classList.add('has-basket-items');
  } else {
    card.classList.remove('has-basket-items');
  }
}

// Basket calculations & footer status
function updateBasketUI() {
  let totalCost = 0;
  let totalCount = 0;

  storeConfig.items.forEach(item => {
    const qty = basketState[item.id] || 0;
    totalCost += qty * item.price;
    totalCount += qty;
  });

  basketTotalEl.textContent = formatCurrency(totalCost);
  basketCountSummaryEl.textContent = `(${totalCount} ${totalCount === 1 ? 'ITEM' : 'ITEMS'})`;
  checkoutBtn.disabled = (totalCost === 0);
}

// Clear Basket
clearBasketBtn.addEventListener('click', () => {
  let hadItems = false;
  Object.keys(basketState).forEach(id => {
    if (basketState[id] > 0) hadItems = true;
    basketState[id] = 0;
    updateSlotCardUI(id);
  });

  if (hadItems) {
    playPixelSound(320, 0.15, 'sawtooth');
    updateBasketUI();
    showToast("BASKET CLEARED.");
  }
});

// Checkout Action
checkoutBtn.addEventListener('click', () => {
  let totalCost = 0;
  Object.keys(basketState).forEach(id => {
    const item = storeConfig.items.find(i => i.id === id);
    if (item) totalCost += basketState[id] * item.price;
  });

  if (totalCost === 0) return;

  if (currentWallet < totalCost) {
    playPixelSound(220, 0.25, 'sawtooth', 0.1);
    showToast("NOT ENOUGH RUPEES IN WALLET!");
    return;
  }

  currentWallet -= totalCost;
  walletAmountEl.textContent = formatCurrency(currentWallet);

  storeConfig.items.forEach(item => {
    if (basketState[item.id] > 0) {
      item.owned += basketState[item.id];
      basketState[item.id] = 0;
    }
  });

  playPixelSound(880, 0.25, 'square', 0.08);
  setTimeout(() => playPixelSound(1100, 0.35, 'triangle', 0.08), 120);

  showToast("PURCHASE COMPLETED!");
  renderShelves();
  updateBasketUI();
});

// Close Store
closeStoreBtn.addEventListener('click', () => {
  playPixelSound(300, 0.12, 'sawtooth');
  const stall = document.getElementById('marketStall');
  stall.style.opacity = '0.5';
  setTimeout(() => {
    stall.style.opacity = '1';
    console.log("Stall closed");
  }, 150);
});

// Boot
document.addEventListener('DOMContentLoaded', initStore);
