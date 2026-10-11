// ========================================================
// Summit Practice Trading Desk - Dynamic Stock Data & Real-Time Simulation
// ========================================================

// Simulated Stock Catalog with Real-Time Placeholder Data
const stocksData = {
  1: {
    id: 1,
    name: "[ASSET_01_NAME: Sagar 50 Index Fund]",
    ticker: "SAGAR50",
    meta: "SAGAR50 · Index fund · risk Medium",
    desc: "[ASSET_01_DESC: Holds 50 large simulated companies. Broad diversification within one fund.]",
    basePrice: 252.00,
    change1d: "-0.1%",
    change30d: "+0.9%",
    high: 256.40,
    low: 248.80,
    vol: "14.2K",
    holding: 0,
    history: [248, 250, 249, 253, 251, 254, 252]
  },
  2: {
    id: 2,
    name: "[ASSET_02_NAME: Kaveri Govt Bond Fund]",
    ticker: "KAVERI",
    meta: "KAVERI · Bond fund · risk Low",
    desc: "[ASSET_02_DESC: Sovereign debt fund providing low-volatility fixed interest yield backed by federal bonds.]",
    basePrice: 100.25,
    change1d: "+0.3%",
    change30d: "-0.1%",
    high: 101.10,
    low: 99.80,
    vol: "8.6K",
    holding: 5,
    history: [99.5, 99.8, 100.0, 100.4, 100.1, 100.5, 100.25]
  },
  3: {
    id: 3,
    name: "[ASSET_03_NAME: Bharat Grid Utilities]",
    ticker: "BHARATGRID",
    meta: "BHARATGRID · Stock · risk Medium",
    desc: "[ASSET_03_DESC: National power and smart-grid energy provider with defensive cashflows and regular dividend distributions.]",
    basePrice: 451.80,
    change1d: "+0.2%",
    change30d: "+7.4%",
    high: 462.00,
    low: 444.20,
    vol: "22.8K",
    holding: 0,
    history: [430, 436, 442, 439, 448, 455, 451.8]
  },
  4: {
    id: 4,
    name: "[ASSET_04_NAME: Lumen Tech]",
    ticker: "LUMEN",
    meta: "LUMEN · Stock · risk High",
    desc: "[ASSET_04_DESC: Semiconductor and quantum computing hardware designer exhibiting strong growth paired with high volatility.]",
    basePrice: 1000.50,
    change1d: "+3.0%",
    change30d: "+2.0%",
    high: 1045.00,
    low: 970.00,
    vol: "41.5K",
    holding: 0,
    history: [950, 980, 965, 1020, 990, 1030, 1000.5]
  },
  5: {
    id: 5,
    name: "[ASSET_05_NAME: Halcyon Pharma]",
    ticker: "HALCYON",
    meta: "HALCYON · Stock · risk High",
    desc: "[ASSET_05_DESC: Biotechnology research laboratory engineering patented vaccine delivery systems and oncology therapeutics.]",
    basePrice: 705.40,
    change1d: "+1.1%",
    change30d: "+15.6%",
    high: 720.00,
    low: 680.00,
    vol: "19.3K",
    holding: 0,
    history: [620, 640, 665, 680, 695, 715, 705.4]
  }
};

let currentStockId = 1;
let liveIntervalId = null;

// DOM Elements: Header & Navigation
const tabButtons = document.querySelectorAll('.pixel-tab-btn');
const tabViews = document.querySelectorAll('.tab-view');
const closeBtn = document.getElementById('closeDeskBtn');

// DOM Elements: Order Desk Real-Time Elements
const orderAssetName = document.getElementById('orderAssetName');
const orderAssetTicker = document.getElementById('orderAssetTicker');
const orderAssetPrice = document.getElementById('orderAssetPrice');
const orderAssetChange = document.getElementById('orderAssetChange');
const orderAssetDesc = document.getElementById('orderAssetDesc');
const orderAssetHoldings = document.getElementById('orderAssetHoldings');
const chartStatHigh = document.getElementById('chartStatHigh');
const chartStatLow = document.getElementById('chartStatLow');
const chartStatVol = document.getElementById('chartStatVol');
const orderChartLine = document.getElementById('orderChartLine');
const orderChartArea = document.getElementById('orderChartArea');

// Buy/Sell & Actions
const btnBuy = document.getElementById('btnBuy');
const btnSell = document.getElementById('btnSell');
const btnReviewOrder = document.getElementById('btnReviewOrder');
const assetRows = document.querySelectorAll('.asset-row');
const btnDeposit = document.getElementById('btnDeposit');
const btnWithdraw = document.getElementById('btnWithdraw');
const transferAmtInput = document.getElementById('transferAmtInput');

// Web Audio API Synthesizer
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
    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {}
}

// Generate SVG Path for Real-time Chart
function renderSvgChart(history, isPositive) {
  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min || 1;
  const width = 300;
  const height = 70;
  const padding = 10;

  const points = history.map((val, idx) => {
    const x = (idx / (history.length - 1)) * width;
    const y = height - padding - ((val - min) / range) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const lineD = "M" + points.join(" L");
  const areaD = `${lineD} L${width},${height} L0,${height} Z`;

  const strokeCol = isPositive ? "#34d399" : "#f87171";
  const fillCol = isPositive ? "rgba(52, 211, 153, 0.15)" : "rgba(248, 113, 113, 0.15)";

  orderChartLine.setAttribute("d", lineD);
  orderChartLine.setAttribute("stroke", strokeCol);
  orderChartArea.setAttribute("d", areaD);
  orderChartArea.setAttribute("fill", fillCol);
}

// Select and Display Stock Real-Time Data
function selectStock(stockId) {
  currentStockId = stockId;
  const stock = stocksData[stockId];
  if (!stock) return;

  // Update Left Table Active State
  assetRows.forEach(row => {
    if (parseInt(row.getAttribute('data-asset'), 10) === stockId) {
      row.classList.add('active');
    } else {
      row.classList.remove('active');
    }
  });

  // Populate Right Order Desk Pane
  orderAssetName.textContent = stock.name;
  orderAssetTicker.textContent = `[TICKER: ${stock.ticker}]`;
  orderAssetDesc.textContent = stock.desc;
  orderAssetHoldings.textContent = `[HOLDING_COUNT: You hold ${stock.holding}]`;
  orderAssetPrice.textContent = `₹${stock.basePrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  
  const isPos = !stock.change1d.startsWith('-');
  orderAssetChange.textContent = stock.change1d;
  orderAssetChange.className = `live-price-change ${isPos ? 'text-pos' : 'text-neg'}`;

  chartStatHigh.textContent = `₹${stock.high.toFixed(2)}`;
  chartStatLow.textContent = `₹${stock.low.toFixed(2)}`;
  chartStatVol.textContent = stock.vol;

  renderSvgChart(stock.history, isPos);

  // Restart Live Real-time Simulation Tick for the Selected Stock
  startRealtimeSimulation();
}

// Real-Time Price Micro-Fluctuation Simulation (Live Placeholder Updates)
function startRealtimeSimulation() {
  if (liveIntervalId) clearInterval(liveIntervalId);

  liveIntervalId = setInterval(() => {
    const stock = stocksData[currentStockId];
    if (!stock) return;

    // Small random market micro-tick (-0.4% to +0.4%)
    const pctDelta = (Math.random() - 0.49) * 0.008;
    const oldPrice = stock.basePrice;
    stock.basePrice = Math.max(1, stock.basePrice * (1 + pctDelta));

    // Update real-time history buffer
    stock.history.shift();
    stock.history.push(stock.basePrice);

    // Update highs and lows
    if (stock.basePrice > stock.high) stock.high = stock.basePrice;
    if (stock.basePrice < stock.low) stock.low = stock.basePrice;

    // Render price with flash
    const priceEl = orderAssetPrice;
    priceEl.textContent = `₹${stock.basePrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    
    // Also update price in left table row
    const rowEl = document.querySelector(`.asset-row[data-asset="${currentStockId}"] .col-price`);
    if (rowEl) {
      rowEl.textContent = `₹${Math.round(stock.basePrice)}`;
    }

    const isTickUp = stock.basePrice >= oldPrice;
    priceEl.style.color = isTickUp ? '#34d399' : '#f87171';
    setTimeout(() => { priceEl.style.color = '#ffffff'; }, 250);

    renderSvgChart(stock.history, isTickUp);
  }, 1800);
}

// Asset Row Click Handler
assetRows.forEach(row => {
  row.addEventListener('click', () => {
    const assetId = parseInt(row.getAttribute('data-asset'), 10);
    playSound(640, 0.06, 'square');
    selectStock(assetId);
  });
});

// Tab Switching
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetViewId = btn.getAttribute('data-target');
    playSound(600, 0.08, 'square');

    tabButtons.forEach(b => b.classList.remove('active'));
    tabViews.forEach(v => v.classList.remove('active'));

    btn.classList.add('active');
    const targetView = document.getElementById(targetViewId);
    if (targetView) targetView.classList.add('active');

    // Pause real-time timer when not on market view to conserve CPU
    if (targetViewId === 'viewMarket') {
      startRealtimeSimulation();
    } else {
      if (liveIntervalId) clearInterval(liveIntervalId);
    }
  });
});

// Buy / Sell Mode Toggle
if (btnBuy && btnSell) {
  btnBuy.addEventListener('click', () => {
    btnBuy.classList.add('active');
    btnSell.classList.remove('active');
    btnReviewOrder.textContent = '[BTN_SUBMIT_ORDER: Review buy]';
    playSound(520, 0.06, 'triangle');
  });

  btnSell.addEventListener('click', () => {
    btnSell.classList.add('active');
    btnBuy.classList.remove('active');
    btnReviewOrder.textContent = '[BTN_SUBMIT_ORDER: Review sell]';
    playSound(420, 0.06, 'triangle');
  });
}

// Order Review Action
if (btnReviewOrder) {
  btnReviewOrder.addEventListener('click', () => {
    playSound(720, 0.15, 'square');
    const stock = stocksData[currentStockId];
    console.log(`[ORDER_SUBMITTED]: ${stock.ticker} - Price: ₹${stock.basePrice.toFixed(2)}`);
  });
}

// Funds Transfer
if (btnDeposit && btnWithdraw) {
  btnDeposit.addEventListener('click', () => {
    playSound(550, 0.1, 'triangle');
    console.log(`[FUNDS_DEPOSITED]: ${transferAmtInput.value}`);
  });

  btnWithdraw.addEventListener('click', () => {
    playSound(450, 0.1, 'triangle');
    console.log(`[FUNDS_WITHDRAWN]: ${transferAmtInput.value}`);
  });
}

// Close Desk Action
if (closeBtn) {
  closeBtn.addEventListener('click', () => {
    playSound(320, 0.1, 'sawtooth');
    const modal = document.getElementById('tradingDeskModal');
    if (modal) {
      modal.style.opacity = '0.5';
      setTimeout(() => {
        modal.style.opacity = '1';
        console.log('[TRADING_DESK_CLOSED]');
      }, 120);
    }
  });
}

// Initial Selection on Load
selectStock(1);
