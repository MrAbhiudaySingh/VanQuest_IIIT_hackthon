// Compound Financial Academy lessons. Each question: options[], answer (index),
// why[] — feedback for every option, so wrong answers teach too.
export const LESSONS = [
  {
    id: 'budgeting', title: 'Budgeting basics', icon: '🧾',
    body: [
      'A budget is a plan for your money before the month starts. List your income, then your needs (rent, food, transport), then savings, then wants.',
      'A popular starting point is 50/30/20: about 50% on needs, 30% on wants, 20% on savings. On ₹10,000 that is ₹5,000 needs, ₹3,000 wants, ₹2,000 savings.',
      'Track what you actually spend for a month — most people underestimate small daily purchases.',
    ],
    questions: [
      { q: 'You earn ₹10,000 a month. Using 50/30/20, how much should go to savings?', options: ['₹500', '₹2,000', '₹5,000', 'Whatever is left at month-end'], answer: 1,
        why: ['Too little — that is 5%, not 20%.', 'Correct: 20% of ₹10,000 is ₹2,000.', 'That is the "needs" share (50%).', 'Saving "what\'s left" usually means saving nothing. Pay yourself first.'] },
      { q: 'Which of these is a NEED rather than a want?', options: ['A new smartwatch', 'Monthly groceries', 'Designer sneakers', 'A streaming subscription'], answer: 1,
        why: ['Nice to have, but you can live without it.', 'Correct: food is an essential expense.', 'Basic shoes are a need; designer ones are a want.', 'Entertainment is a want.'] },
      { q: 'Your grocery plan costs ₹4,600 and your salary is ₹10,000. What is the best first step before buying a ₹3,999 office chair?', options: ['Buy it — you can afford it this month', 'Check what remains after all needs and savings', 'Put it on credit', 'Cancel the grocery plan'], answer: 1,
        why: ['Affording it once doesn\'t mean it fits your plan.', 'Correct: compare it against what\'s left after needs and savings.', 'Borrowing for a want adds interest costs.', 'Food is a need — cut wants first.'] },
    ],
  },
  {
    id: 'emergency_fund', title: 'Emergency savings', icon: '🛟',
    body: [
      'An emergency fund is money set aside for surprises: a medical bill, a lost job, a broken phone you need for work.',
      'A common target is 3–6 months of essential expenses. Keep it somewhere safe and easy to reach, not in risky investments.',
      'Build it before investing in anything volatile — otherwise an emergency can force you to sell at a loss.',
    ],
    questions: [
      { q: 'Your essential costs are ₹6,000/month. What is a reasonable emergency-fund target?', options: ['₹1,000', '₹18,000–₹36,000', '₹2,00,000', 'You don\'t need one if you have a job'], answer: 1,
        why: ['Barely a week of expenses.', 'Correct: 3–6 months × ₹6,000.', 'Far beyond what\'s needed to start.', 'Jobs can end unexpectedly — that\'s the point.'] },
      { q: 'Where should an emergency fund be kept?', options: ['A speculative crypto token', 'A safe, easily accessible savings account', 'Lent to a friend', 'Gold jewellery'], answer: 1,
        why: ['Its value could halve right when you need it.', 'Correct: safe and quick to withdraw.', 'You may not get it back in time.', 'Selling jewellery quickly often loses value.'] },
      { q: 'Your laptop breaks and you need it for college. You have ₹20,000 invested and ₹0 savings. What problem does this show?', options: ['None', 'Without an emergency fund you may have to sell investments at a bad time', 'You should never invest', 'Laptops are a want'], answer: 1,
        why: ['There is a real problem here.', 'Correct: emergencies can force poorly-timed selling.', 'Investing is fine — after the safety net exists.', 'If it\'s required for study, it\'s a need.'] },
    ],
  },
  {
    id: 'compounding', title: 'The power of compounding', icon: '📈',
    body: [
      'Compounding means earning returns on your returns. ₹10,000 growing 10% a year becomes ₹11,000, then ₹12,100, then ₹13,310…',
      'Time is the biggest ingredient. Money invested at 20 has decades longer to compound than money invested at 40.',
      'The "rule of 72": divide 72 by the yearly return to estimate how many years it takes to double. At 8%, about 9 years.',
    ],
    questions: [
      { q: '₹10,000 earns 10% a year, compounded. Roughly how much after 2 years?', options: ['₹12,000', '₹12,100', '₹11,000', '₹20,000'], answer: 1,
        why: ['That is simple interest — it ignores interest on interest.', 'Correct: 10,000 × 1.1 × 1.1 = 12,100.', 'That is after only 1 year.', 'That would need about 7 years at 10%.'] },
      { q: 'Using the rule of 72, how long to double money at 6% a year?', options: ['6 years', '12 years', '72 years', '3 years'], answer: 1,
        why: ['That would need 12% a year.', 'Correct: 72 ÷ 6 = 12.', 'Misreads the rule.', 'That would need 24% a year.'] },
      { q: 'Asha starts investing ₹2,000/month at 20; Ben starts the same at 30. Both stop at 60. Who likely ends with more?', options: ['Ben', 'Asha, thanks to 10 extra years of compounding', 'They end the same', 'Impossible to say anything'], answer: 1,
        why: ['Ben has less time to compound.', 'Correct: the earliest years compound the longest.', 'Different start dates give very different results.', 'Returns vary, but the time advantage is clear.'] },
    ],
  },
  {
    id: 'diversification', title: 'Diversification', icon: '🧺',
    body: [
      'Diversification means spreading money across many investments so one failure can\'t sink you.',
      'An index fund holds many companies at once — that is diversification in a single purchase.',
      'Diversifying lowers the risk of any single company, but it can\'t remove the risk of the whole market falling.',
    ],
    questions: [
      { q: 'Which portfolio is most diversified?', options: ['100% Lumen Tech', '100% CoinNova', 'A broad index fund plus some bonds', 'Two pharma stocks'], answer: 2,
        why: ['One company — all eggs in one basket.', 'One speculative token.', 'Correct: many companies plus a different asset type.', 'Two companies in the same industry tend to move together.'] },
      { q: 'Halcyon Pharma\'s trial fails and its stock drops 22%. Who is hurt least?', options: ['Someone with 100% in Halcyon', 'Someone with 5% in Halcyon and the rest spread out', 'Both equally', 'Nobody — prices always recover'], answer: 1,
        why: ['They lose 22% of everything.', 'Correct: a 22% drop on 5% is about a 1% hit overall.', 'Exposure size matters.', 'Some never recover.'] },
      { q: 'What can diversification NOT protect against?', options: ['One company going bankrupt', 'A broad market-wide fall', 'One industry having a bad year', 'One CEO scandal'], answer: 1,
        why: ['That is exactly what it helps with.', 'Correct: when nearly everything falls, diversified portfolios fall too.', 'Spreading across industries helps here.', 'A single-company problem is diversifiable.'] },
    ],
  },
  {
    id: 'risk', title: 'Investment risk', icon: '⚖️',
    body: [
      'Risk is the chance your investment is worth less than you hoped — including losing money.',
      'Higher potential return usually comes with higher risk. Anyone offering high returns with "no risk" is misleading you.',
      'Your time horizon matters: money needed next month should not be in volatile assets.',
    ],
    questions: [
      { q: 'Which is generally the LOWEST-risk option on the Summit dashboard?', options: ['CoinNova Token', 'Lumen Tech', 'Kaveri Govt Bond Fund', 'Halcyon Pharma'], answer: 2,
        why: ['Very high volatility, no earnings.', 'A high-growth single stock.', 'Correct: government bonds swing far less.', 'Single stock with binary trial risk.'] },
      { q: 'You need ₹8,000 for tuition in 2 months. Where should it be?', options: ['CoinNova', 'Lumen Tech', 'Savings/wallet', 'Split across volatile stocks'], answer: 2,
        why: ['Could halve before you need it.', 'Can fall 20% in a month.', 'Correct: short-term money belongs somewhere stable.', 'Still volatile over 2 months.'] },
      { q: 'An offer promises 25% a month "with zero risk". What does this tell you?', options: ['Great deal', 'The claim is almost certainly false', 'It\'s fine if a friend recommends it', 'Only invest a little'], answer: 1,
        why: ['High return and zero risk don\'t go together.', 'Correct: that combination is a hallmark of fraud.', 'Friends can be misled too.', 'Even a little is lost in a scam.'] },
    ],
  },
  {
    id: 'scams', title: 'Spotting scams', icon: '🚩',
    body: [
      'Warning signs: guaranteed or very high returns, pressure to decide now, secret "insider" information, no registration or paperwork, and payment only through informal channels.',
      'Ask for evidence you can verify yourself — registration numbers, official filings, audited statements. Screenshots and testimonials are not evidence.',
      'If you can\'t withdraw your money, you don\'t really have it.',
    ],
    questions: [
      { q: 'Which is the strongest red flag?', options: ['The person is friendly', '"Guaranteed 2× in 30 days, only today"', 'They mention risks honestly', 'They share a public regulator notice'], answer: 1,
        why: ['Friendliness tells you nothing either way.', 'Correct: guaranteed high returns plus urgency.', 'Honest risk disclosure is a good sign.', 'Verifiable public info is a good sign.'] },
      { q: 'What counts as real evidence for an investment?', options: ['WhatsApp payout screenshots', 'Influencer videos', 'A registration number you can check yourself', 'A friend\'s story'], answer: 2,
        why: ['Easily faked.', 'Influencers may be paid to promote.', 'Correct: independently verifiable.', 'Anecdotes aren\'t verification.'] },
      { q: 'An app shows big profits but withdrawals are "locked for 60 days". What should you assume?', options: ['Normal security', 'High risk of a fake platform', 'Profits are real', 'Deposit more to unlock'], answer: 1,
        why: ['Legit platforms let you withdraw your own money.', 'Correct: displayed "gains" may be fiction.', 'Numbers on a screen aren\'t money you can use.', 'That is how the scam grows.'] },
    ],
  },
  {
    id: 'long_term', title: 'Long-term investing', icon: '🌳',
    body: [
      'Long-term investors buy diversified assets and hold them for years, adding money regularly instead of trying to time the market.',
      'Short-term prices are noisy. Over long periods, broad markets have historically trended upward — but with painful drops along the way.',
      'Costs matter: frequent trading adds fees that eat into returns.',
    ],
    questions: [
      { q: 'The index fund drops 10% in a month. A long-term investor would most likely…', options: ['Panic-sell everything', 'Stick to the plan and keep investing regularly', 'Move it all into CoinNova', 'Stop saving forever'], answer: 1,
        why: ['Selling after a drop locks in the loss.', 'Correct: drops are expected; consistency wins.', 'Swapping into higher risk after a loss is chasing.', 'Saving is still essential.'] },
      { q: 'Each trade on the dashboard costs ₹10. Trading 30 times a month costs…', options: ['₹10', '₹300', '₹30', 'Nothing'], answer: 1,
        why: ['That is one trade.', 'Correct: 30 × ₹10 = ₹300 — a real drag on small portfolios.', 'Check the multiplication.', 'Every trade has a fee here.'] },
      { q: 'What is "investing a fixed amount every month" called?', options: ['Day trading', 'Rupee-cost averaging (SIP)', 'Market timing', 'Leverage'], answer: 1,
        why: ['That is frequent buying and selling.', 'Correct: you buy more units when prices are low, fewer when high.', 'Trying to pick the best moment — hard to do.', 'Borrowing to invest — adds risk.'] },
    ],
  },
];
