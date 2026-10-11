// Round 9: the English/Telugu display layer. Translation is presentation only — numbers, names and the
// simulation are untouched — and every catalogue entry keeps exactly the placeholders of its English key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setLang, getLang, tr, localizeHtml, templateOf, readPref, writePref, PREF_KEY } from '../src/i18n/i18n.js';
import { TE } from '../src/i18n/te/index.js';

const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
const ph = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');

test('English is the default and passes text through unchanged', () => {
  setLang('en');
  assert.equal(getLang(), 'en');
  assert.equal(tr('Next day'), 'Next day');
  assert.equal(localizeHtml('<b>Cash</b> ₹1,000'), '<b>Cash</b> ₹1,000');
});

test('Telugu: numbers, rupees and names survive exactly; dates get Telugu month names', () => {
  setLang('te');
  const out = tr('Renting at ₹3,000/month (paid on the 1st)');
  assert.match(out, /₹3,000/); assert.match(out, /[ఀ-౿]/); assert.match(out, /1వ/);
  assert.deepEqual(templateOf('Bought Elm Court Flat 2B for ₹6,00,000').vals.map(v => v.x), ['Elm Court Flat 2B', '₹6,00,000']);
  assert.match(tr('Prices as of Sat, 15 Aug, 2026.'), /15 ఆగస్టు 2026/);
  assert.equal(tr('Something with no translation at all xyz'), 'Something with no translation at all xyz');   // explicit English fallback
  setLang('en');
});

test('player text and translate="no" are never translated', () => {
  setLang('te');
  const html = localizeHtml('<p>Cash</p><textarea>Cash</textarea><span translate="no"><b>Cash</b></span><p>Cash</p>');
  assert.equal(html, `<p>${tr('Cash')}</p><textarea>Cash</textarea><span translate="no"><b>Cash</b></span><p>${tr('Cash')}</p>`);
  assert.notEqual(tr('Cash'), 'Cash');
  setLang('en');
});

test('the language preference is versioned and validated', () => {
  const s = mem();
  assert.equal(readPref(s), null);
  assert.ok(writePref('te', s)); assert.equal(readPref(s), 'te');
  s.setItem(PREF_KEY, JSON.stringify({ v: 99, lang: 'te' })); assert.equal(readPref(s), null);
  s.setItem(PREF_KEY, '{broken'); assert.equal(readPref(s), null);
  assert.equal(writePref('fr', s), false);
});

test('every catalogue entry keeps its placeholders and is Telugu (or an allowed identical label)', () => {
  const bad = Object.entries(TE.ui).filter(([en, te]) => ph(en) !== ph(te) || (te !== en && !/[ఀ-౿]/.test(te)));
  assert.deepEqual(bad, []);
  assert.ok(Object.keys(TE.ui).length > 2500, 'the catalogue covers the UI and the four courses');
});
