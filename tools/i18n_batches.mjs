// Translator helper (Round 9): split the audit's missing templates into numbered batches.
//   node tools/i18n_batches.mjs <missing.json> <outdir> [size]
// Writes <outdir>/course.txt and <outdir>/ui.txt as "N<TAB>English" lines (course text = anything that
// occurs in src/data/courses.js). Translations come back as "N<TAB>Telugu" and are merged by i18n_merge.mjs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { COURSES } from '../src/data/courses.js';
import { templateOf } from '../src/i18n/i18n.js';
const [, , src, dir] = process.argv;
const miss = Object.keys(JSON.parse(readFileSync(src, 'utf8')));
const course = new Set();
const walk = v => { if (typeof v === 'string') { const s = v.replace(/\s+/g, ' ').trim(); course.add(s); course.add(templateOf(s).key); } else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
walk(COURSES);
mkdirSync(dir, { recursive: true });
const c = miss.filter(k => course.has(k)), u = miss.filter(k => !course.has(k));
writeFileSync(`${dir}/course.txt`, c.map((k, i) => `${i}\t${k}`).join('\n'));
writeFileSync(`${dir}/ui.txt`, u.map((k, i) => `${i}\t${k}`).join('\n'));
console.log(`course ${c.length} (${c.join('').length} chars), ui ${u.length} (${u.join('').length} chars)`);
