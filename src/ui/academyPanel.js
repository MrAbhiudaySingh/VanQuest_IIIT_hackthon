import { LESSONS } from '../data/lessons.js';
import { submitLesson, questionProvider, PASS_MARK } from '../sim/academy.js';
import { fmtShortDate } from '../sim/util.js';
import { esc } from './core.js';

export class AcademyPanel {
  constructor(game) {
    this.game = game;
    this.title = 'Compound Financial Academy';
    this.sub = 'Learn the money skills that compound';
    this.open = null;      // lesson id
    this.answers = [];
    this.result = null;
  }
  get rec() { return this.game.state.academy.lessons; }

  render() { return this.open ? this.renderLesson() : this.renderList(); }

  renderList() {
    const done = LESSONS.filter(l => this.rec[l.id]?.passed).length;
    const cards = LESSONS.map(l => {
      const r = this.rec[l.id];
      const status = r?.passed ? `<span class="tag gold">COMPLETED ${fmtShortDate(r.completedDay)}</span>` : r ? '<span class="tag">IN PROGRESS</span>' : '<span class="tag">NEW</span>';
      return `<div class="card"><h3>${l.icon} ${esc(l.title)}</h3><div>${status}</div>
        <div class="muted">${r ? `Best score ${Math.round(r.bestScore * 100)}% · ${r.attempts} attempt(s)` : `${l.questions.length} questions`}</div>
        <button class="btn sm ${r?.passed ? '' : 'primary'}" data-a="open" data-id="${l.id}">${r?.passed ? 'Review' : 'Start lesson'}</button></div>`;
    }).join('');
    return `<div class="msg">Progress: <b>${done}/${LESSONS.length}</b> lessons completed. Pass mark ${Math.round(PASS_MARK * 100)}%. Your learning record is kept separately from your investments.</div><div class="grid">${cards}</div>`;
  }

  renderLesson() {
    const l = LESSONS.find(x => x.id === this.open);
    const qs = questionProvider(l, this.rec[l.id]);
    const res = this.result;
    const body = l.body.map(p => `<p>${esc(p)}</p>`).join('');
    const questions = qs.map((q, i) => {
      const opts = q.options.map((o, j) => {
        const chosen = this.answers[i] === j;
        const state = res ? (j === q.answer ? 'right' : chosen ? 'wrong' : '') : chosen ? 'right' : '';
        return `<button class="opt ${state}" data-a="pick" data-q="${i}" data-o="${j}" ${res ? 'disabled' : ''}>${chosen ? '● ' : '○ '}${esc(o)}</button>
          ${res && (chosen || j === q.answer) ? `<div class="why">${j === q.answer ? '✔' : '✘'} ${esc(q.why[j])}</div>` : ''}`;
      }).join('');
      return `<div class="card" style="margin-top:8px"><h3>Q${i + 1}. ${esc(q.q)}</h3>${opts}</div>`;
    }).join('');
    const summary = res ? `<div class="msg ${res.passed ? 'ok' : 'warn'}">You scored ${res.correct}/${res.total}. ${res.passed ? 'Lesson complete — saved to your record.' : 'Not quite — review the explanations and try again.'}</div>` : '';
    const complete = this.answers.filter(a => a !== undefined).length === qs.length;
    return `<button class="btn sm" data-a="back">← All lessons</button><h3 style="margin:10px 0 6px">${l.icon} ${esc(l.title)}</h3>${body}${questions}${summary}
      <div class="row" style="margin-top:10px">${res ? '<button class="btn" data-a="retry">Try again</button>' : `<button class="btn primary" data-a="submit" ${complete ? '' : 'disabled'}>Check answers</button>`}</div>`;
  }

  onAction(a, el) {
    if (a === 'open') { this.open = el.dataset.id; this.answers = []; this.result = null; }
    if (a === 'back') { this.open = null; this.result = null; }
    if (a === 'retry') { this.answers = []; this.result = null; }
    if (a === 'pick' && !this.result) this.answers[+el.dataset.q] = +el.dataset.o;
    if (a === 'submit') this.result = this.game.act(s => submitLesson(s, this.open, [...this.answers]));
  }
}
