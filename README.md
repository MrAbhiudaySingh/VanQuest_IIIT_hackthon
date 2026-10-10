# VanQuest — financial-life simulator (Round 4)

A compact top-down Indian city (68×50 tiles, 16 px) for Grade 11–12 students. You work, bank, rent or buy a home (with or without a home loan), shop, eat, dress, drive, study, invest virtual money, meet scammers, and live with the consequences. Built with **Phaser 3.90**, an editable **Tiled** map, and a plain-JS simulation core (`src/sim/`, no UI code) that is unit-tested in Node. All prices are in Indian rupees (₹) and are fictional prototype values.

## Run it

```bash
cd VanQuest
python -m http.server 8765      # or: npm start
# open http://localhost:8765
```

There is no build step. The game saves to your browser (`localStorage`, key `vanquest.save.v1`). Round 2 and Round 3 saves are upgraded automatically (save version 3). The **⟲** button starts a new game.

## Controls

| Action | Keys / mouse |
|---|---|
| Walk | WASD / arrows, or **click** anywhere (on the minimap too) |
| Interact | **E**, or click the prompt. Clicking a person or your parked car walks you there first. |
| Get in / out of your car | **E** next to it, or click it. While driving, E always gets you out first. |
| Drive | WASD / arrows: the car turns toward the direction you press and speeds up. Release to slow down; press the opposite way to brake. |
| Inventory · Pantry · Wardrobe · **Finances** · History | **I** · **P** · **C** · **O** · **H** (or the top-bar buttons) |
| Arrange furniture | **F** inside your home or a vacant property you own |
| Minimap / close menu | **M** / **Esc** |
| Pass time | **Next day ▸**, **To 1st ▸▸**, **Skip 1 year** (asks for confirmation first). Time also passes at 1 in-game day per 20 s while you walk around the city. It stops in menus, inside buildings, and after the run ends. |

## How to try the Round 4 features

1. **Bank:** **Nidhi Bank** is the cream building with a gold awning right of Summit Tower. Talk to Mr. Desai, or use the door.
   - Deposit or withdraw cash.
   - Open a fixed deposit (FD) from your savings.
   - On the **Loans** tab, borrow against a property you own.
   - The **Credit profile** tab shows exactly why your score is what it is.
2. **Home loan:** at Lakshmi's agency (below Elm Court), press **Buy…** and choose **Home loan**. Pick a down payment and a term. You'll see the EMI, total interest, fees, the money needed up front and your EMI-to-salary ratio. If you're not eligible, it tells you why and what would help.
3. **Performance:** the agency's **Performance** tab reports every purchase you've made: money in, money back, profit, return on cash, and what drove the result.
4. **Finances (O):** total assets, total liabilities and net worth, plus where your money came from (salary, rent, interest, loans, sales) and where it went.
5. **Market:** the agency shows the current housing-market phase and the last year's movement. Asking prices sit above or below each home's estimated value.
6. **Art:** the electronics and jewellery shops now show product art. The sedan, pickup, SUV and executive drive as top-down sprites that rotate as you steer. Two-way traffic runs on the avenues and Main Street and stops at red lights.

## Game rules (also explained in the in-game menus)

### Money and accounts (`src/sim/ledger.js`)
- **One ledger** records every rupee. Balances are calculated from it, so the HUD, history, reports and net worth always agree.
- **Accounts:**
  - **Cash** (`wallet`): where your salary arrives.
  - **Savings** (`bank`): earns interest.
  - **Fixed deposits** (`fd`): locked money.
  - **Trading desk** (`brokerage`).
- **Moving money** between accounts is a transfer; it never creates or destroys money.
- **Paying:** bills, purchases, rent and EMIs are paid from cash first, then from savings, like a debit card. If cash + savings can't cover something, nothing is charged; the failed attempt is recorded at ₹0 and you're never pushed below zero.
- **No double charges:** every confirmation carries a one-time token, and every recurring charge has a monthly key.

### The clock (`src/sim/clock.js`)
Each in-game day runs once, in a fixed order, and every step is safe to repeat (re-running a date changes nothing):

- **On the 1st of every month:**
  1. career progress
  2. salary
  3. savings interest (on 1 Jan, 1 Apr, 1 Jul and 1 Oct)
  4. tenants pay you
  5. your rent
  6. property upkeep
  7. **loan EMIs**
  8. car insurance and servicing
  9. grocery plan
- **Every day:**
  10. FDs that mature today pay out
  11. hunger and health
  12. your household eats
  13. tipster offers settle
  14. savings interest accrues on the day's closing balance
  15. low-food warning

**Skip 1 year** runs this loop for twelve calendar months. It stops early on the day you die.

### Savings and fixed deposits (`src/sim/bank.js`, `src/data/banking.js`)
- **Savings account:** 3.5% a year, worked out on **each day's closing balance** (balance × 3.5% ÷ 365). Interest is credited **quarterly** (1 Jan, 1 Apr, 1 Jul, 1 Oct), so it compounds four times a year. No fees, no minimum balance, free withdrawals. The interest credited so far and the interest accrued but not yet paid are both shown.
- **Fixed deposits:** paid for from savings, minimum ₹5,000.

  | Term | Rate |
  |---|---|
  | 6 months | 6.00% |
  | 1 year | 6.75% |
  | 2 years | 7.00% |
  | 3 years | 7.25% |

  - **Value at maturity** = P × (1 + r/4)^quarters, with quarterly compounding.
  - **At maturity:** the principal and interest are paid back into savings, once.
  - **Closing early:** you earn (rate − 1%) for the time actually held: quarterly compounding for completed quarters, plus simple interest for the extra days. You never get back less than you put in.
  - **Locked money:** money in an FD isn't spendable.

### Home loans and home-equity loans (`src/sim/loans.js`, `src/data/lending.js`)
- **One loan engine runs both.** Rates are fixed for the whole term.
- **EMI** = P·r(1+r)ⁿ / ((1+r)ⁿ − 1), where r = yearly rate ÷ 12 and n = months. A zero-rate loan pays P ÷ n.
- **True amortisation:** each month's interest = the balance still owed × r, and the rest of the EMI repays principal. The final EMI clears any rounding. The schedule and the monthly processing use identical maths (tested).
- **Home loan (taken when you buy):**
  - **Rate:** base 8.5%, adjusted by your credit tier.
  - **Term:** 5, 10, 15 or 20 years.
  - **Down payment:** 10%, 20%, 30% or 50%.
  - **Loan-to-value cap:** the loan may cover at most 90% of the price for loans up to ₹30 lakh, 80% up to ₹75 lakh, and 75% above that.
  - **Processing fee:** 0.5% (minimum ₹2,000).
  - **Stamp duty and the fee are never financed.**
  - **How the money moves:** the loan money goes to the seller, and you pay the down payment, duty and fee.
- **Home-equity loan:**
  - **What it is:** borrowing against a property you own.
  - **Limit:** at most 60% of its current value, minus every loan already secured on it. You can't borrow the same equity twice.
  - **Terms:** base + 1.5%; 3, 5 or 10 years; 1% fee.
  - **Where the money goes:** into your savings.
- **Eligibility** (each reason is shown, with a tip):
  - all your EMIs together, including the new one, must stay within 50% of your salary
  - you must have the money needed up front
  - the loan-to-value limits above
  - your credit tier must not be "Very poor"
- **Missed EMI:**
  - Nothing is taken. That month's interest plus a ₹500 late fee are **added to the balance**, and it shows on your credit profile.
  - Paying the next EMI resets the "in a row" count.
  - **Three in a row is a default:** the bank sells the property at a 15% discount, repays itself and returns any surplus to you. The default stays on your profile, and if it was your home, you lose it.
- **Prepayment:** paying extra reduces what you owe. The EMI stays the same, so the loan ends sooner.
- **Selling a mortgaged property:** the sale repays its loans first. If the sale doesn't cover them, you must pay the difference or you can't sell.

### Credit profile (`src/sim/credit.js`)
- **Transparent and calculated from your record:** start at 700, then:

  | Factor | Points |
  |---|---|
  | Each on-time EMI | +2 (up to +60) |
  | Each missed EMI in the last 12 months | −45 |
  | Each missed rent in the last 12 months | −20 |
  | Other unpaid bills | −5 each (up to −40) |
  | Each default | −200 |
  | EMIs above 35% / 50% of income | −25 / −60 |

- **Tiers:**

  | Tier | Score | Rate offered |
  |---|---|---|
  | Excellent | 780+ | −0.25% |
  | Good | 720+ | base |
  | Fair | 650+ | +0.75% |
  | Poor | 550+ | +2% |
  | Very poor | below 550 | no new loans |

- **Fixed for existing loans:** a loan keeps the rate it was given.

### Housing market (`src/sim/housingMarket.js`, `src/data/properties.js`)
- **Neighbourhoods:**

  | Neighbourhood | Homes | Long-run growth | Swings with the market | Extra wait for a tenant |
  |---|---|---|---|---|
  | Budget residential | Elm Court | 2%/yr | × 0.6 | 0 months |
  | Well-connected central | Lakeview | 3.5% | × 1.0 | 0 |
  | Established family | 12 & 18 Elm St | 3% | × 0.9 | 1 |
  | Premium residential | 24 Elm St, Willowbrook | 2.5% | × 1.4 | 2 |

- **Market index:** a fictional index cycles **growth** (+0.9%/month) → **stable** (+0.1%) → **decline** (−1.4%) → **recovery** (+0.6%), with seeded phase lengths and small noise.
  - **Deterministic:** the same calendar always gives the same history, so results can be explained and tested.
  - **No forecasts:** the game only ever shows the past and the current phase.
- **Value** = day-0 price × (1 + growth)^years × (1 + swing × (index − 1)). It updates on the 1st.
- **Rent** moves with the market at half the swing.
- **Asking prices** are the estimate × (1 + phase tilt + a seeded −2.4…+3.6%). That's about 3% dearer in a boom and 3% cheaper in a slump, so you can overpay or find a bargain.
- **Expensive isn't automatically better:** premium homes have lower growth, bigger swings and longer empty periods.

### Property rules (`src/sim/property.js`)
- **Starting point:** you rent Elm Court Flat 2B at ₹3,000/month.
- **Buying:** asking price + 6% stamp duty, in cash or with a home loan.
- **Selling:** market value − 2% fee − unpaid upkeep; loans on the property are repaid first. You can't sell the place you live in.
- **Renting a home:** the market rent when you sign, fixed for your tenancy. It's paid then and on every 1st. Two missed rents get you evicted.
- **Renting yours out:** after the neighbourhood's wait, a tenant pays the current market rent every 1st, minus a 5% agent fee. You pay upkeep on everything you own.
- **Access:** you can enter only your current home or a vacant property you own. For a tenant-occupied property you get "Manage your tenancy" instead.
- **Furniture belongs to a property** and is packed into storage when you move out, let the property or sell it.

### Property performance (`src/sim/propertyReport.js`)
Every purchase gets a deal ID, and every ledger entry it causes is tagged with it: the purchase, loan money, fees, EMIs, upkeep, rent and the sale.

- **Cash invested** = down payment + stamp duty + loan fees + EMIs + prepayments + upkeep.
- **Cash returned** = rent received + sale proceeds after loans are repaid. For a home you still hold, that's what you'd pocket if you sold today.
- **Profit** = returned − invested. **Return on cash** = profit ÷ invested.
- **What drove the result:**
  - price paid vs the estimate
  - location (the neighbourhood's growth)
  - market timing (the index move since you bought × the neighbourhood's swing)
  - financing (interest, late fees, fees)
  - renting (rent − upkeep, and months empty)
  - transaction costs (stamp duty + selling fee)
- **How the verdict is written:** a short sentence built from the biggest positive and negative drivers. A rising value alone never makes a purchase "good".

### Net worth (`src/sim/networth.js`)
- **Assets:** cash, savings, FDs (including interest earned so far), the trading desk, property at market value, and cars at buy-back value.
- **Liabilities:** home loans and other loans.
- **Net worth = assets − liabilities.** A loan adds the same amount to both sides, and it's shown as "loan money received — a debt, not income".
- **Flows by type:** salary, rent, interest earned, investment returns, sale proceeds, loan money, interest paid, spending.

### Unchanged systems (still tested)
- **Cars:** 7 models with real speed differences, insurance and servicing, fuel, buy-back.
- **Food:** pantry, hunger, health and death.
- **Clothing**, the furniture showroom, the grocery plan and the tipster.
- **Trading desk, academy, college and career.**

## Part A changes this round

- **Product art for every catalogue item.** Electronics are original drawings, because no colour CC0 electronics pack was found. Jewellery uses the CC0 Dungeon Crawl Stone Soup set (rings and pendants) plus original drawings of earrings and a watch. The art shows in the shops, the inventory and the ownership lists.
- **Cars:**
  - **New art:** the sedan, pickup, SUV/people carrier and executive now drive as **top-down sprites** (gameguy's CC0 set, halved to fit a 16 px lane). Each is **one image rotated to the heading**; these assets have no directional animation.
  - **Unchanged:** the hatchbacks keep Tiny Cars' 8 real directions.
  - **Executive:** a black recolour of the sedan, the only body left without its own art.
  - **Stats unchanged:** the more expensive models stay faster and costlier to run.
- **Traffic:**
  - **Lanes:** both directions on both avenues and Main Street, in left-hand lanes (as in India), going straight through junctions. The lanes are `car_lane` objects in the Tiled NPC layer.
  - **Signals:** a shared cycle at the two Main Street junctions: north–south green, all red, east–west green, all red. Cars queue and wait at red. The lamps on the traffic-light props show the real signal.
  - **People and parked cars:** traffic stops for people and your car, and eases past after 4 s so nothing is stuck for good.
- **Map:**
  - **Nidhi Bank** was built on the lower half of the former North Gate garden plot beside Summit Tower; the garden keeps its upper half. The map size is unchanged.
  - **Removed:** the parked props that blocked traffic lanes, and the barriers at road ends (the world edge still keeps you in).
  - **Added:** the banker NPC and the two-way traffic lanes in the NPC layer.
  - **How it was changed:** `maps/city.tmj` was checked byte-for-byte against `tools/build_city.py` **before** editing, so the generator was updated and the map regenerated; no Tiled edits existed to lose. **If you edit the map in Tiled from now on, don't re-run the generator.**

## Testing

```bash
npm install && npx playwright install chromium   # first time
npm test            # 79 unit tests + 19 + 15 + 10 browser steps
npm run test:unit   # node --test "tests/*.test.mjs"
npm run test:e2e    # tools/smoke_test.mjs, smoke_round3.mjs, smoke_round4.mjs (headless Chromium)
```

### Round 4 unit tests (`tests/round4.test.mjs`)
- deposits and withdrawals, and paying from cash then savings
- savings interest, with the exact amount over 91 days, quarterly crediting and compounding
- FD maturity, paid once even when the date is replayed
- closing an FD early, and the zero-rate edge case
- the EMI formula, including zero interest, and the amortisation schedule
- mortgage eligibility (LTV, the 50% salary limit, money up front, credit) with reasons
- a mortgage-funded purchase, with EMIs matching the schedule month by month
- missed EMIs, recovery and default (repossession)
- selling a mortgaged property, and negative equity
- the home-equity loan limit, with no double-borrowing
- net worth, where a loan is not income
- the credit profile, and the rate it offers
- market phases, with values falling in declines and rising in recoveries
- buying in a boom and selling in a slump, which loses money
- report figures checked against the ledger
- cash vs mortgage financing costs
- replaying the 1st twice, which duplicates nothing
- a year skip with a mortgage, FD, savings, tenant, car and plan (12 of each, 4 savings credits, the summary matches net worth)
- starving during a skip
- migrating a real **Round 3 save** (`tests/fixtures/round3_save.json`, made by running the Round 3 code) and a real Round 2 save

### Round 4 browser test (`tools/smoke_round4.mjs`)
- the banker NPC, a double-click deposit and a refused withdrawal
- opening an FD
- the mortgage UI: the ineligible case explained, then a purchase with a loan (double-click safe)
- the EMI on the 1st, and reload persistence
- the report and net-worth screens
- the home-equity loan
- shop art for every product
- the top-down car rotating as it turns
- two-way traffic stopping at red
- a year skip (FD matures, 12 EMIs)
- loading the Round 3 save, with furniture and reports intact

The earlier browser suites and the Round 1–3 unit tests still run. Some expectations were updated for this round's intended rule changes: asking prices, market-driven values, neighbourhood vacancy, the bank entrance and save version 3.

## Project layout (new this round)

```
src/sim/      bank.js · loans.js · credit.js · housingMarket.js · propertyReport.js · networth.js
              (+ ledger.js accounts & pay(), property.js mortgages/sales/history, clock.js order, state.js save v3)
src/data/     banking.js · lending.js (+ properties.js neighbourhoods, artIndex.js, vehicles.js art types)
src/world/    traffic.js (new) · driving.js (body/view split, top-down sprites)
src/ui/       bankPanel.js · financePanel.js (new) · propertyPanel.js (loans, market, reports) · sprites.js
tools/        make_round4_art.py · smoke_round4.mjs
tests/        round4.test.mjs · fixtures/round3_save.json
art/          vanquest_items32.png · vanquest_topcars.png
Assets/       cc0-jewelry-icons/ · gameguy-top-view-cars/ (with SOURCE.txt)
```

## Assets and licences

| Asset | Source | Licence | Used for |
|---|---|---|---|
| RPG Urban Pack (Kenney) | kenney.nl, in `Assets/kenney_rpgUrbanKit` | CC0 | city, characters, props, the bank building |
| Roguelike Indoors (Kenney) | kenney.nl/assets/roguelike-indoors | CC0 | furniture, fixtures |
| Tiny Cars, Raymond Lobban | opengameart.org/node/94255 → `Assets/tiny-cars-cc0/` | CC0 | the three hatchbacks (8 directions) |
| isaiah658's Pixel Pack #1 | opengameart.org/content/isaiah658s-pixel-pack-1 | CC0 | produce icons (its cars are no longer used for driving) |
| **Top View Car Truck Sprites, gameguy**, **new** | opengameart.org/content/top-view-car-truck-sprites → `Assets/gameguy-top-view-cars/` | CC0 | sedan, pickup, SUV/MPV, executive (recolour) and the trucks in traffic |
| **CC0 Jewelry Icons** (AntumDeluge collection: Dungeon Crawl Stone Soup + HomoHikka), **new** | opengameart.org/content/cc0-jewelry-icons → `Assets/cc0-jewelry-icons/` | CC0 | silver chain, gold ring, diamond pendant |
| `art/vanquest_items32.png` electronics, earrings, watch | drawn for this project (`tools/make_round4_art.py`) | CC0 (original) | electronics and two jewellery items |
| `art/vanquest_items.png`, `player_outfits.png`, `vanquest_extra.png`, `vanquest_interior.png` | earlier rounds | CC0 | — |
| Kenney Mini font · Phaser 3.90 · Playwright | kenney.nl · npm | CC0 · MIT · Apache-2.0 | — |

**Checked but not used:**
- **Unlucky Studio top-down cars** (CC0): high-resolution, not pixel art.
- **Nikoichu 1-bit icons:** black and white, with an unverified licence claim.
- **MinZinn Pixel Vehicles:** CC-BY.
- **Pixel Art Car Pack:** paid.
- **Kenney Pixel Vehicle Pack:** side view only.

## Known limitations

- **Car art:** top-down cars are single rotated images, not directional animations. The hatchbacks (Tiny Cars, 3/4 view) and the top-down models mix two perspectives. The executive is a recolour. Traffic doesn't turn at junctions, and only the two Main Street junctions have signals.
- **Income for loans:** eligibility counts salary only, not rent from tenants. Loans are fixed-rate only, with no refinancing and no part-tenure top-ups.
- **Defaults:** a shortfall after a forced sale is written off and recorded as a default. There's no debt collection or unsecured debt.
- **Tenants:** vacancy is a fixed wait per neighbourhood, tenants always pay, and there are no deposits or damages. Rent from an existing tenant follows the market each month.
- **Market:** one city-wide index. Everyone sees the same seeded history (deterministic by design).
- **Bank:** savings interest is credited only when the clock passes a quarter date. The bank interior is a menu, not a walkable room.
- **Earlier limitations still apply:** clothing is shown by recolouring only, there's one save slot, and stray files remain in `Assets/` (`__MACOSX`, the `.rar`, CozyTown), untouched.
