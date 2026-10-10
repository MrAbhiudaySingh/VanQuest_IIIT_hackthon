// SIMULATED, FICTIONAL assets for the Summit Financial Tower practice dashboard.
// These are NOT real companies and NOT real or live prices. Prices follow a
// deterministic random walk (see sim/market.js) with the drift/volatility below.
// drift and vol are annualised (0.10 = 10% per year).
export const ASSETS = {
  SAGAR50: { name: 'Sagar 50 Index Fund', type: 'Index fund', risk: 'Medium', start: 250, drift: 0.10, vol: 0.15,
    about: 'Holds 50 large simulated companies. Broad diversification within one fund.' },
  KAVERI: { name: 'Kaveri Govt Bond Fund', type: 'Bond fund', risk: 'Low', start: 100, drift: 0.065, vol: 0.03,
    about: 'Simulated government bonds. Lower, steadier returns.' },
  BHARATGRID: { name: 'Bharat Grid Utilities', type: 'Stock', risk: 'Medium', start: 420, drift: 0.08, vol: 0.14,
    about: 'Simulated electricity distributor. Regulated, slow-growing business.' },
  LUMEN: { name: 'Lumen Tech', type: 'Stock', risk: 'High', start: 980, drift: 0.14, vol: 0.35,
    about: 'Simulated software company. Fast growth, big swings.' },
  HALCYON: { name: 'Halcyon Pharma', type: 'Stock', risk: 'High', start: 610, drift: 0.07, vol: 0.30,
    about: 'Simulated drug maker. Results depend heavily on clinical trials.' },
  COINNOVA: { name: 'CoinNova Token', type: 'Crypto token', risk: 'Very high', start: 40, drift: 0.0, vol: 0.85,
    about: 'Simulated speculative token. No earnings; price is driven by sentiment.' },
};

export const TRADE_FEE = 10; // ₹ flat brokerage per trade (simulated)
