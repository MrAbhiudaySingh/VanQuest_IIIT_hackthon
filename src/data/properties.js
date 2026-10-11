// Residential property market (fictional prices, ₹). Ids are the city-map location ids.
//   price      estimated market value on day 0 (1 July 2026)
//   rent       market rent per month on day 0: what you pay as a tenant, what a tenant pays you
//   upkeep     owner's monthly maintenance + property tax (charged whether vacant or let)
//   hood       neighbourhood (below) — drives long-run growth, sensitivity to the market cycle and
//              how quickly tenants are found
//   quality    build/finish quality shown to the player
// Values and rents move with the housing-market index — see sim/housingMarket.js.
// Each neighbourhood's market = the city-wide cycle × its sensitivity (beta) + its own slower local
// cycle (amp/period/offset: a seeded wave of up to ±amp per month) — so areas rise and fall at
// different times and none of them always wins. Monthly moves are capped at ±3% (no wild jumps).
//   drift    long-run growth per year      beta     sensitivity to the city cycle
//   vacancy  extra months to find a tenant  local    { amp, period (months), offset (months) }
export const NEIGHBOURHOODS = {
  budget:  { name: 'Budget residential', drift: 0.020, beta: 0.6, vacancy: 0, local: { amp: 0.003, period: 30, offset: 0 },
    about: 'Cheap, always in demand from renters. Prices move gently with the market.' },
  central: { name: 'Well-connected central', drift: 0.035, beta: 1.0, vacancy: 0, local: { amp: 0.004, period: 26, offset: 9 },
    about: 'Next to the avenue, park and shops. Steady demand, moves with the market.' },
  family:  { name: 'Established family neighbourhood', drift: 0.030, beta: 0.9, vacancy: 1, local: { amp: 0.004, period: 34, offset: 20 },
    about: 'Quiet Elm Street homes. Tenants take a little longer to find.' },
  premium: { name: 'Premium residential', drift: 0.025, beta: 1.4, vacancy: 2, local: { amp: 0.006, period: 22, offset: 6 },
    about: 'Prestige addresses. Few renters can afford them, and prices swing hardest in booms and busts.' },
};
export const MARKET_RULES = { maxMonthlyMove: 0.03, rentSensitivity: 0.5 };

export const PROPERTIES = {
  home_apartment:      { kind: 'Small apartment', hood: 'budget', quality: 'Basic', price: 600000, rent: 3000, upkeep: 500 },
  home_apartment_plus: { kind: 'Better apartment', hood: 'central', quality: 'Good', price: 1300000, rent: 6000, upkeep: 900 },
  home_starter:        { kind: 'Starter house', hood: 'family', quality: 'Good', price: 1900000, rent: 8500, upkeep: 1200 },
  home_family:         { kind: 'Family house', hood: 'family', quality: 'Very good', price: 3200000, rent: 14000, upkeep: 1800 },
  home_large:          { kind: 'Large house', hood: 'premium', quality: 'Very good', price: 5500000, rent: 23000, upkeep: 3000 },
  home_luxury:         { kind: 'Luxury estate', hood: 'premium', quality: 'Excellent', price: 14000000, rent: 55000, upkeep: 8000 },
};

export const PROPERTY_RULES = {
  stampDuty: 0.06,         // stamp duty + registration on purchase, on top of the price
  sellFee: 0.02,           // agent fee when selling
  agentFee: 0.05,          // agent's cut of rent you collect from tenants
  missedRentToEvict: 2,    // consecutive unpaid rents before eviction
  startingHome: 'home_apartment',
};

// Tenancies (both when you rent a home and when you let one out). Deterministic: each tenant's
// profile, lease length and every month's payment come from a fixed seed, so outcomes can be
// tested and explained — and most tenants are simply reliable.
export const TENANCY = {
  depositMonths: 2,                 // security deposit = 2 months' rent, paid when the tenancy starts
  leaseMonths: [11, 22, 33],        // how long a tenant of yours stays (one is picked per tenancy)
  reliableShare: 0.8,               // 80% of tenants always pay on the 1st
  irregular: { late: 0.2, missed: 0.1 },   // the other 20%: each month 20% pay late (on the 15th), 10% don't pay
  lateDay: 15,
  leaveAfterMissed: 2,              // two unpaid months in a row → the tenant leaves (deposit covers the arrears)
  wearRepair: 0.25,                 // on every move-out: wear-and-tear repair = 25% of a month's rent (owner pays)
  damageChance: 0.3, damageMax: 1.0, // 30% of move-outs: damage up to a month's rent, charged to the tenant's deposit
  arrearsMonths: 6,                 // your own unpaid rent beyond your deposit is repaid to the landlord over 6 months, 0%
};

// Occasional repairs on top of monthly upkeep: each property, each month, a 4% chance of a repair
// costing 1.5× its monthly upkeep (plumbing, wiring, a leaking roof…).
export const REPAIRS = { chance: 0.04, factor: 1.5 };

export const AGENT = { name: 'Lakshmi Rao', role: 'Property agent', char: 3 };
