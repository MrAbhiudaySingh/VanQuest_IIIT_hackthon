// Canonical registry of every enterable place in the city.
// Map objects in maps/city.tmj (layer "Interactions") reference these ids via the
// `locationId` property; CityScene warns at load if the map and this file disagree.
//
// `kind` decides what interacting does (see src/ui/router.js): shop → shop panel,
// investing → trading desk, lessons → academy, college → admissions, home → HomeScene
// (interiors in src/data/homes.js), dealership → Roadstar Motors, school → not open this round.
// The furniture shop is entered as an interior (HomeScene with a shop layout).

export const DISTRICTS = {
  financial: 'Financial District',
  education: 'Education District',
  market: 'Marketplace',
  residential: 'Residential',
};

export const LOCATIONS = {
  // Financial district
  financial_tower:   { name: 'Summit Financial Tower',      district: 'financial', kind: 'investing' },
  finance_academy:   { name: 'Compound Financial Academy',  district: 'financial', kind: 'lessons' },
  bank:              { name: 'Nidhi Bank',                  district: 'financial', kind: 'bank' },

  // Education district
  school:            { name: 'Riverside High School', district: 'education', kind: 'school' },
  college:           { name: 'Ashford College',       district: 'education', kind: 'college' },

  // Marketplace — `shop` is the item category the store will sell
  market_grocery:     { name: 'FreshCart Grocery',       district: 'market', kind: 'shop', shop: 'groceries' },
  market_clothing:    { name: 'Thread & Co. Clothing',   district: 'market', kind: 'shop', shop: 'clothing' },
  market_electronics: { name: 'Voltline Electronics',    district: 'market', kind: 'shop', shop: 'electronics' },
  market_furniture:   { name: 'Hearth Home & Furniture', district: 'market', kind: 'shop', shop: 'furniture' },
  market_jewellery:   { name: 'Aurum Jewellers',         district: 'market', kind: 'shop', shop: 'jewellery' },
  market_general:     { name: 'Corner Convenience',      district: 'market', kind: 'shop', shop: 'general' },
  car_dealership:     { name: 'Roadstar Motors',         district: 'market', kind: 'dealership' },

  // Residential — `home.tier` orders living standard; the interior layout and the
  // home computer for each id live in src/data/homes.js.
  home_apartment:      { name: 'Elm Court Flat 2B',          district: 'residential', kind: 'home', home: { tier: 0, type: 'apartment' } },
  home_apartment_plus: { name: 'Lakeview Residences 4A',     district: 'residential', kind: 'home', home: { tier: 1, type: 'apartment' } },
  home_starter:   { name: 'Starter Home · 12 Elm St', district: 'residential', kind: 'home', home: { tier: 2, type: 'starter' } },
  home_family:    { name: 'Family Home · 18 Elm St',  district: 'residential', kind: 'home', home: { tier: 3, type: 'family' } },
  home_large:     { name: 'Large House · 24 Elm St',  district: 'residential', kind: 'home', home: { tier: 4, type: 'large' } },
  home_luxury:    { name: 'Willowbrook Estate',       district: 'residential', kind: 'home', home: { tier: 5, type: 'luxury' } },
};
