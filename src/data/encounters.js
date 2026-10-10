// Tipster encounters. Every offer is delivered by the same NPC with the same friendly
// manner — the truth is only discoverable by asking questions and investigating.
//
// Fields:
//   pitch            what he says (all sound plausible)
//   offer            { name, min, max } amount range you may commit (₹)
//   answers          what each question reveals: evidence | investigate | risks
//   flags            warning signs revealed by those answers (shown in the debrief)
//   outcome          how a committed stake resolves — always defined, never random punishment:
//                    { type: 'loss', days }                 → money is gone (scam)
//                    { type: 'asset', asset, days, event? } → stake tracks a simulated asset;
//                       event = { inDays, factor } schedules a real price move in the sim market
//   debrief          the lesson shown when it resolves (or when you decline)
//   verdict          'scam' | 'misleading' | 'uncertain' | 'useful' (hidden until the end)
export const ENCOUNTERS = [
  {
    id: 'plantation_doubler', verdict: 'scam',
    pitch: 'Bhai, quick one — my cousin runs the GoldenLeaf tea plantation scheme. Put in ₹5,000 and you get ₹10,000 back in 30 days. Guaranteed. Only 3 slots left this week.',
    offer: { name: 'GoldenLeaf Plantation Scheme', min: 1000, max: 20000 },
    answers: {
      evidence: 'He shows a WhatsApp screenshot of a "payout" and says the paperwork is "with the office". No registration number.',
      investigate: 'No company called GoldenLeaf Plantations appears in the simulated company registry. The "office" address is a residential flat.',
      risks: '"There is no risk, the returns are fixed." — a 100% return in a month would be ~400,000% a year.',
    },
    flags: ['Guaranteed, very high returns', 'Artificial urgency ("3 slots left")', 'No registration or verifiable documents', 'Proof is only screenshots'],
    outcome: { type: 'loss', days: 10, text: 'The WhatsApp group went silent and the number is switched off. Your money is gone.' },
    debrief: 'Classic Ponzi pattern: early "payouts" are paid from newer investors\' money. Guarantees + urgency + no paperwork = walk away.',
  },
  {
    id: 'grid_tariff_news', verdict: 'useful',
    pitch: 'Did you see the regulator\'s notice? Bharat Grid\'s new tariff was approved this morning. I\'m adding a few shares. Not saying it\'s a sure thing — utilities move slowly.',
    offer: { name: 'Bharat Grid Utilities shares (sim)', min: 1000, max: 15000 },
    answers: {
      evidence: 'He shows the public regulator notice — anyone can read it. No secret information involved.',
      investigate: 'The notice is real in the simulation. Analysts expect higher revenue, but the price may already reflect some of it.',
      risks: 'It\'s a single stock. Good news can be "priced in", and other events can still push the price down.',
    },
    flags: [],
    outcome: { type: 'asset', asset: 'BHARATGRID', days: 30, event: { inDays: 6, factor: 1.09 },
      text: 'The tariff news lifted Bharat Grid over the following weeks.' },
    debrief: 'Public, verifiable information and an honest mention of risk are good signs. Even so, it was one stock — size positions so a surprise can\'t hurt you badly.',
  },
  {
    id: 'coinnova_moon', verdict: 'misleading',
    pitch: 'CoinNova is about to list on a big exchange. Influencers are all over it — people are calling it the next 100×. Get in before the listing!',
    offer: { name: 'CoinNova Token (sim)', min: 500, max: 20000 },
    answers: {
      evidence: 'He shares influencer clips. The "listing" is only a rumour; no exchange has announced anything.',
      investigate: 'The token has no revenue. A few wallets hold most of the supply — they can sell into any spike.',
      risks: '"Crypto is volatile, sure, but this one is different." — every hype cycle claims to be different.',
    },
    flags: ['Hype from influencers, not facts', 'Unconfirmed "listing" catalyst', 'Supply concentrated in few hands', '"This time is different"'],
    outcome: { type: 'asset', asset: 'COINNOVA', days: 21, event: { inDays: 4, factor: 0.55 },
      text: 'The listing never happened. Large holders sold and the token crashed.' },
    debrief: 'Pump-and-dump: hype draws buyers in while insiders sell. Speculative tokens can lose most of their value in days.',
  },
  {
    id: 'lumen_growth', verdict: 'uncertain',
    pitch: 'Lumen Tech\'s quarterly numbers were solid — users up again. I think it has room to run over the next month, but it\'s a jumpy stock.',
    offer: { name: 'Lumen Tech shares (sim)', min: 1000, max: 15000 },
    answers: {
      evidence: 'He points to Lumen\'s published quarterly report in the simulation. Growth is real; profits are thin.',
      investigate: 'The company is genuine. Its price swings ~35% a year on average — up or down.',
      risks: 'High-growth stocks can fall sharply on small disappointments. One month is a very short horizon.',
    },
    flags: [],
    outcome: { type: 'asset', asset: 'LUMEN', days: 30, text: 'Your stake followed Lumen Tech\'s simulated price for 30 days.' },
    debrief: 'A legitimate but uncertain opportunity: real company, honest risks, no guarantee. The result is whatever the market did — that\'s what risk means.',
  },
  {
    id: 'forex_bot', verdict: 'scam',
    pitch: 'My AI forex robot trades for you — 3% profit every single day. You just deposit on our app and watch it grow. My friend made ₹2 lakh last month.',
    offer: { name: 'ProfitPilot AI Forex App', min: 2000, max: 20000 },
    answers: {
      evidence: 'He shows the app dashboard with a rising balance. Withdrawals, he says, "open after 60 days".',
      investigate: 'The app is not from any regulated broker and was published 3 weeks ago. Reviews mention blocked withdrawals.',
      risks: '"The bot has never had a losing day." — 3% daily compounds to over 4,800,000% a year. Impossible.',
    },
    flags: ['Impossible daily returns', 'Withdrawals locked', 'Unregulated app', 'Testimonials instead of audited results'],
    outcome: { type: 'loss', days: 14, text: 'The app shows profits, but withdrawals are "under review" forever. Then the app disappears.' },
    debrief: 'Fake trading platforms show made-up gains to get bigger deposits. If you can\'t withdraw, you don\'t own it.',
  },
  {
    id: 'halcyon_trial', verdict: 'misleading',
    pitch: 'Insider info — my friend at Halcyon Pharma says their trial results come out next week and they\'re amazing. Buy now before everyone knows.',
    offer: { name: 'Halcyon Pharma shares (sim)', min: 1000, max: 15000 },
    answers: {
      evidence: 'He can\'t show anything — "my friend would get in trouble". It\'s a rumour passed second-hand.',
      investigate: 'Halcyon\'s public filings say results are due soon. Nobody outside the company can know them, and trading on real insider info is illegal.',
      risks: 'Trial outcomes are binary: good results can lift the price, poor ones can sink it. Rumours are often wrong.',
    },
    flags: ['"Insider" rumour with no evidence', 'Trading on genuine insider information is illegal', 'Binary event treated as certain'],
    outcome: { type: 'asset', asset: 'HALCYON', days: 21, event: { inDays: 7, factor: 0.78 },
      text: 'The trial missed its main goal. Halcyon\'s price dropped sharply.' },
    debrief: '"Insider tips" are usually rumours — and if real, acting on them is illegal. Never bet more than you can afford on one binary event.',
  },
];
