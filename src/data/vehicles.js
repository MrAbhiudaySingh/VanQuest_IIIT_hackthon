// Roadstar Motors line-up. Fictional models and prices (₹). Driving stats are in game units:
//   maxSpeed px/s (walking is 80), accel px/s², turn = handling in degrees/s.
// Ownership costs:
//   monthly  insurance + servicing, charged on the 1st for every owned vehicle
//   fuelPerKm  charged for the distance you actually drive (1 tile = 10 m)
// Resale (dealer buy-back) = price × 85% × 0.99^months owned, never below 25% of price.
// Art: `art: 'tiny'` = Tiny Cars hatchback with 8 real directional sprites (art/vanquest_vehicles.png);
//      `art: 'top'`  = gameguy's top-down sprite (art/vanquest_topcars.png), ONE image rotated to the
//                      direction of travel (no directional animation exists for these).
export const VEHICLES = {
  used_hatch: { name: 'Chotu Hatch (used, 2016)', body: 'Hatchback', price: 180000, maxSpeed: 120, accel: 70, turn: 200, seats: 5, monthly: 1500, fuelPerKm: 7.5, art: 'tiny',
    blurb: 'Ten years old. Cheapest way onto the road — older cars cost more to service.' },
  hatch: { name: 'Chotu Hatch', body: 'Hatchback', price: 420000, maxSpeed: 140, accel: 95, turn: 220, seats: 5, monthly: 1300, fuelPerKm: 6.0, art: 'tiny',
    blurb: 'New, frugal city car. Easy to park, cheap to run.' },
  hatch_plus: { name: 'Chotu Hatch Plus', body: 'Hatchback', price: 560000, maxSpeed: 155, accel: 110, turn: 230, seats: 5, monthly: 1500, fuelPerKm: 6.2, art: 'tiny',
    blurb: 'Bigger engine, nimblest handling in the range.' },
  sedan: { name: 'Saarthi Sedan', body: 'Sedan', price: 890000, maxSpeed: 175, accel: 120, turn: 200, seats: 5, monthly: 2300, fuelPerKm: 7.5, art: 'top',
    blurb: 'Comfortable family saloon with a big boot.' },
  pickup: { name: 'Khet Pickup', body: 'Pickup truck', price: 950000, maxSpeed: 160, accel: 100, turn: 170, seats: 2, monthly: 2200, fuelPerKm: 9.5, art: 'top',
    blurb: 'Carries cargo, not passengers. Heavy steering.' },
  mpv: { name: 'Parivar MPV', body: 'SUV / people carrier', price: 1180000, maxSpeed: 150, accel: 85, turn: 160, seats: 7, monthly: 2600, fuelPerKm: 9.0, art: 'top',
    blurb: 'Seven seats for big families. Slow off the line.' },
  executive: { name: 'Regalia Executive', body: 'Luxury sedan', price: 2400000, maxSpeed: 210, accel: 160, turn: 220, seats: 5, monthly: 5500, fuelPerKm: 12.0, art: 'top',
    blurb: 'Fastest and most refined — and the most expensive to own.' },
};

export const RESALE = { initial: 0.85, monthly: 0.99, floor: 0.25 };
export const PX_PER_KM = 1600;            // 16 px tile = 10 m
export const MIN_FUEL_MONEY = 100;        // ₹ you need in your wallet to start a trip
