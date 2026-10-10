// Residential property market (fictional prices, ₹). Ids are the city-map location ids.
//   price      estimated market value on day 0 (1 July 2026)
//   rent       market rent per month on day 0: what you pay as a tenant, what a tenant pays you
//   upkeep     owner's monthly maintenance + property tax (charged whether vacant or let)
//   hood       neighbourhood (below) — drives long-run growth, sensitivity to the market cycle and
//              how quickly tenants are found
//   quality    build/finish quality shown to the player
// Values and rents move with the housing-market index — see sim/housingMarket.js.
export const NEIGHBOURHOODS = {
  budget:  { name: 'Budget residential', drift: 0.020, beta: 0.6, vacancy: 0,
    about: 'Cheap, always in demand from renters. Prices move gently with the market.' },
  central: { name: 'Well-connected central', drift: 0.035, beta: 1.0, vacancy: 0,
    about: 'Next to the avenue, park and shops. Steady demand, moves with the market.' },
  family:  { name: 'Established family neighbourhood', drift: 0.030, beta: 0.9, vacancy: 1,
    about: 'Quiet Elm Street homes. Tenants take a little longer to find.' },
  premium: { name: 'Premium residential', drift: 0.025, beta: 1.4, vacancy: 2,
    about: 'Prestige addresses. Few renters can afford them, and prices swing hardest in booms and busts.' },
};

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

export const AGENT = { name: 'Lakshmi Rao', role: 'Property agent', char: 3 };
