// Exercise D — FINANCIAL SAFETY (Course 4): one Vikram encounter per attempt, built by vikram.js for a
// fictional player profile. Inspect the evidence, then accept, reject or report. Scored by vikram.evaluate.
import { rng } from '../rng.js';
import * as V from '../vikram.js';

export const FOCUS = {
  scams: 'Spot the warning signs before money moves.', otp: 'Someone wants a code or a password — pause and verify.',
  payments: 'Read exactly what a payment request asks you to approve.', claims: 'Test the claim: who, what, evidence, what could go wrong, pressure?',
  rights: 'Know the full cost and terms before agreeing.', identity: 'Is this really who they say they are?', credit: 'A small instalment can hide a big total cost.',
};

export function create(seed, focus = 'scams', weights) {
  const r = rng('safety', seed, focus);
  const profile = { liquid: r.step(12000, 40000, 1000), reserveTarget: r.step(8000, 15000, 1000), income: r.step(12000, 30000, 1000) };
  const enc = V.generate(`${seed}:${focus}`, profile, { topic: focus, ...(weights ? { weights } : {}) });
  return { exercise: 'safety', seed, focus, brief: FOCUS[focus] ?? FOCUS.scams, profile, encounter: enc };
}
export const reveal = (sc, action) => { const r = V.reveal(sc.encounter, action); return r.ok ? { ...sc, encounter: r.enc } : sc; };
export function decide(sc, decision) { const r = V.decide(sc.encounter, decision); return r.ok ? { ...sc, encounter: r.enc } : sc; }
export function score(sc) {
  const ev = V.evaluate(sc.encounter);
  return { exercise: 'safety', seed: sc.seed, score: ev.score, evaluation: ev,
    // what the player actually did, for the coach (the score itself is ev.score)
    points: [
      { label: 'The offer was', earned: ev.score, max: 100, why: `${ev.classification}. ${ev.verdict}` },
      { label: 'Your decision', earned: ev.score, max: 100, why: `You chose to ${sc.encounter.decision}. Suitability for you: ${ev.suitability.why}.` },
      { label: 'Checks you made', earned: sc.encounter.revealed.length, max: Object.keys(V.ACTIONS).length, why: sc.encounter.revealed.length ? `You checked: ${sc.encounter.revealed.map(k => V.ACTIONS[k].toLowerCase()).join(', ')}.` : 'You decided without checking anything.' },
      { label: 'Warning signs missed', earned: ev.missed.length, max: ev.missed.length + ev.identified.length, why: ev.nextTime.join(' ') },
    ],
    wentWell: ev.identified.length ? [`You found ${ev.identified.length} warning sign(s).`] : [], improve: ev.nextTime };
}
