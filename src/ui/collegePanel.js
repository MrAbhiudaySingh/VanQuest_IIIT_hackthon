import { MAJORS } from '../data/majors.js';
import { enrol } from '../sim/career.js';
import { spendable } from '../sim/ledger.js';
import { inr, fmtDate } from '../sim/util.js';
import { esc, newToken, why } from './core.js';

export class CollegePanel {
  constructor(game) {
    this.game = game;
    this.title = 'Ashford College — Admissions';
    this.sub = 'Choose a major';
    this.confirm = null; this.msg = null;
  }
  get s() { return this.game.state; }

  render() {
    const ed = this.s.education, job = this.s.job;
    const status = ed
      ? `<div class="msg ok">${ed.status === 'enrolled' ? `Enrolled in <b>${esc(MAJORS[ed.majorId].name)}</b>. Graduation: <b>${fmtDate(ed.graduationDay)}</b>.` : `Graduated in <b>${esc(MAJORS[ed.majorId].name)}</b>.`}
         Current job: ${esc(job.title)} — ${inr(job.salary)}/month.</div>`
      : `<div class="msg">You work as a <b>${esc(job.title)}</b> earning <b>${inr(job.salary)}/month</b> (paid on the 1st). Enrolling doesn't change that until you graduate.</div>`;
    const rules = `<details class="msg"><summary><b>How enrolment and salary work</b></summary><p style="margin-top:6px">
      • The full tuition is charged once, when you confirm enrolment — only if your cash + savings cover it.<br>
      • You keep your part-time job (${inr(10000)}/month) while you study.<br>
      • On graduation day (the 1st of the month after the programme length) your job switches to the major's starting role, and that day's salary is paid at the new rate.<br>
      • Raises follow each career's salary table. Programmes are shortened for this prototype.</p></details>`;
    const cards = Object.entries(MAJORS).map(([id, m]) => {
      const [lvl0, lvl1] = m.career.levels;
      const afford = spendable(this.s) >= m.tuition;
      return `<div class="card ${this.confirm?.id === id ? 'sel' : ''}"><h3>${esc(m.name)}</h3><div class="muted">${esc(m.blurb)}</div>
        <div class="row between"><span class="price">${inr(m.tuition)}</span><span class="muted">${m.months} months</span></div>
        <div class="muted">Career: <b>${esc(lvl0.title)}</b> ${inr(lvl0.salary)}/mo → ${esc(lvl1.title)} ${inr(lvl1.salary)}/mo after ${lvl1.afterMonths} months</div>
        <button class="btn sm ${afford ? 'primary' : ''}" data-a="pick" data-id="${id}" ${ed ? 'disabled' : ''}>${ed ? 'Enrolled elsewhere' : afford ? 'Enrol…' : `Need ${inr(m.tuition - spendable(this.s))} more`}</button></div>`;
    }).join('');
    const c = this.confirm, m = c && MAJORS[c.id];
    const confirm = m ? `<div class="confirm"><h4>Enrol in ${esc(m.name)}?</h4>
      <p>Tuition <b>${inr(m.tuition)}</b> will be deducted now. Money after: ${inr(spendable(this.s) - m.tuition)}. You keep earning ${inr(this.s.job.salary)}/month until graduation, then start as ${esc(m.career.levels[0].title)} at ${inr(m.career.levels[0].salary)}/month.</p>
      <div class="row"><button class="btn primary" data-a="enrol" ${spendable(this.s) >= m.tuition ? '' : 'disabled'}>Confirm & pay ${inr(m.tuition)}</button><button class="btn" data-a="cancel">Cancel</button></div></div>` : '';
    const msg = this.msg ? `<div class="msg ${this.msg.kind}">${esc(this.msg.text)}</div>` : '';
    return msg + status + rules + confirm + `<div class="grid">${cards}</div>`;
  }

  footer() { return `<span class="muted">Cash + savings</span><span class="balance">${inr(spendable(this.s))}</span>`; }

  onAction(a, el) {
    if (a === 'pick') { this.confirm = { id: el.dataset.id, token: newToken() }; this.msg = null; }
    if (a === 'cancel') this.confirm = null;
    if (a === 'enrol') {
      const { id, token } = this.confirm; this.confirm = null;
      const r = this.game.act(s => enrol(s, id, token));
      this.msg = r.ok ? { kind: 'ok', text: `Welcome to Ashford! You're enrolled in ${MAJORS[id].name}. Graduation on ${fmtDate(r.graduationDay)}.` }
                      : { kind: 'error', text: `Enrolment failed: ${why(r)}` };
    }
  }
}
