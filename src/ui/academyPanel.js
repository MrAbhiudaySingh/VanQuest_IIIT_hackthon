// Compound Financial Academy in the supplied designs: the "Available courses" card screen
// (Assets/supplied-ui/vanguard/course cards → skins/courses.css) and the two-column lecture screen
// (…/lecture ui → skins/lecture.css). Content comes only from src/data/courses.js (imported verbatim
// from the course documents); progress and marking live in sim/academy.js.
import { COURSES } from '../data/courses.js';
import { coverFor } from '../data/academyImages.js';
import { courseProgress, readRecord, markStudied, saveNote, submitCheck, checkProvider, lessonTerms, PASS_MARK, LEGACY_LESSONS } from '../sim/academy.js';
import { fmtShortDate } from '../sim/util.js';
import { esc } from './core.js';
import { PracticeLab } from './practiceLab.js';

const pctTxt = x => `${Math.round(x * 100)}%`;
const topicName = t => t.replace(/^Topic \d+\s*[—-]\s*/, '');
const PORTFOLIO = ['Broad share fund', 'Bond fund', 'Cash-like holdings'];   // the categories in Course 3, Topic 11's example

// One renderer for every block type the importer produces.
function blocksHtml(blocks, { revealed = false } = {}) {
  return blocks.map(b => {
    if (b.t === 'h') return `<h3>${esc(b.text)}</h3>`;
    if (b.t === 'p') return b.reveal && !revealed ? '<p class="hidden-answer">[ANSWER HIDDEN — REVEAL IT WHEN YOU\'VE TRIED]</p>' : `<p class="${b.reveal ? 'answer' : ''}">${esc(b.text)}</p>`;
    if (b.t === 'callout') return `<div class="callout">${esc(b.text)}</div>`;
    if (b.t === 'ul' || b.t === 'ol') return `<${b.t}>${b.items.map(i => `<li>${esc(i)}</li>`).join('')}</${b.t}>`;
    if (b.t === 'table') {
      const [first, ...rest] = b.rows;
      const row = (r, tag) => `<tr>${r.map(c => `<${tag}>${esc(c)}</${tag}>`).join('')}</tr>`;
      return `<div class="table-wrap"><table>${b.head ? row(first, 'th') + rest.map(r => row(r, 'td')).join('') : b.rows.map(r => row(r, 'td')).join('')}</table></div>`;
    }
    return '';
  }).join('');
}

export class AcademyPanel {
  constructor(game, ui = null) {
    this.game = game;
    // practice lives in its own store; the lab only gets a way to redraw this panel
    this.lab = new PracticeLab({ refresh: () => { if (ui?.panel === this) ui.render(); } });
    this.view = null;        // 'life' when the practice life is open
    this.title = 'Compound Financial Academy';
    this.course = null;      // course id when a course is open
    this.page = 0;           // lessons…, then 'check', 'glossary', 'about'
    this.answers = [];
    this.result = null;
    this.reveal = {};        // activity answer guides shown this session
    this.alloc = null;
  }
  get s() { return this.game.state; }
  get c() { return COURSES.find(x => x.id === this.course); }
  pages() { return [...this.c.lessons.map((_, i) => i), 'check', 'glossary', 'about']; }

  frame() { return this.view === 'life' ? this.lifeScreen() : this.course ? this.lecture() : this.cards(); }

  // ------------------------------------------------------------------ course cards (supplied design)
  cards() {
    const legacy = Object.keys(this.s.academy.lessons ?? {}).filter(id => LEGACY_LESSONS[id]);
    const cards = COURSES.map(c => {
      const p = courseProgress(this.s, c.id), n = String(c.number).padStart(2, '0');
      const desc = c.header.find(b => b.t === 'p' && /^Course purpose:/.test(b.text))?.text.replace(/^Course purpose:\s*/, '') ?? c.header[1]?.text ?? '';
      const topics = c.lessons.filter(l => l.kind === 'topic').slice(0, 3).map(l => `<li><span class="pixel-bullet">◆</span> ${esc(topicName(l.title))}</li>`).join('');
      const pr = this.lab.courseProgress(c.id, c.lessons.length);
      const status = p.complete ? `COMPLETED ${fmtShortDate(p.completedDay).toUpperCase()}` : p.studied || p.attempts ? `${p.studied}/${p.lessons} LESSONS · CHECK ${p.passed ? 'PASSED' : p.attempts ? `BEST ${pctTxt(p.bestScore)}` : 'NOT TAKEN'}` : 'NOT STARTED';
      return `<article class="course-card pixel-panel" data-course="${c.id}">
        <div class="card-left-thumbnail"><div class="pixel-thumb-canvas thumb-${((c.number - 1) % 4) + 1}"><span class="thumb-label">CORE COURSE ${n}<br><br>${p.lessons} LESSONS<br>${c.check.questions.length} QUESTIONS</span></div></div>
        <div class="card-right-content">
          <div class="card-title-row"><div class="course-num-badge">${n}</div><h2 class="course-title" title="${esc(c.title)}">${esc(c.title.toUpperCase())}</h2></div>
          <p class="course-description">${esc(desc)}</p>
          <div class="course-meta-row"><ul class="course-topics-list">${topics}</ul>
            <div class="course-progress-block"><span class="progress-label" data-testid="course-status">${status}</span><span class="progress-label practice-label" data-testid="course-practice">PRACTICE ${pr.done}/${pr.total}</span>
              <div class="progress-track"><div class="progress-fill" style="width: ${Math.round(p.pct * 100)}%;"></div></div></div></div>
          <button class="pixel-btn-start" data-a="open" data-id="${c.id}"><span class="btn-text">${p.complete ? 'REVIEW COURSE' : p.studied || p.attempts ? 'CONTINUE COURSE' : 'START COURSE'}</span><span class="btn-arrow">▶</span></button>
        </div></article>`;
    }).join('');
    return `<div class="vq-courses"><main class="course-screen-container" id="courseScreen">
      <header class="course-page-header"><div class="header-title-group"><div class="header-icon-badge"><span class="pixel-mini-dot"></span></div>
        <div class="header-text-block"><span class="header-kicker">[ACADEMY_ZONE: COMPOUND FINANCIAL ACADEMY]</span><h1 class="header-heading">AVAILABLE COURSES</h1>
        ${legacy.length ? `<span class="legacy-note">Earlier record kept: ${legacy.map(id => `${esc(LEGACY_LESSONS[id].title)}${this.s.academy.lessons[id].passed ? ' ✓' : ''}`).join(' · ')} (retired lessons — now covered by the courses below)</span>` : ''}</div></div>
        <button class="pixel-btn-close life-entry" data-a="life-open" title="Practice life: a fictional year that tests everything"><span class="close-text">PRACTICE LIFE ▶</span></button>
        <button class="pixel-btn-close" data-a="close" title="Close Page" aria-label="Close Courses"><span class="close-icon">✖</span><span class="close-text">CLOSE</span></button></header>
      <section class="course-cards-grid" aria-label="Course Selection Grid">${cards}</section></main></div>`;
  }

  // ------------------------------------------------------------------ lecture (supplied design)
  lecture() {
    const c = this.c, pages = this.pages(), pg = pages[this.page], p = courseProgress(this.s, c.id), rec = readRecord(this.s, c.id);
    const n = String(c.number).padStart(2, '0');
    let title, intro, body, canvasTitle, tips = [], extra = '';
    if (typeof pg === 'number') {
      const l = c.lessons[pg], first = l.blocks.findIndex(b => b.t === 'p' && !b.reveal);
      title = l.title; canvasTitle = l.kind === 'activity' ? 'ACTIVITY' : 'LESSON NOTES';
      intro = first >= 0 ? l.blocks[first].text : '';
      const rest = l.blocks.filter((_, i) => i !== first);
      body = blocksHtml(rest, { revealed: !!this.reveal[pg] });
      if (l.guide && this.reveal[pg]) body += `<h3 class="guide-head">${esc(l.guideTitle)}</h3>${blocksHtml(l.guide, { revealed: true })}`;
      tips = lessonTerms(c, l);
      const cover = coverFor(c.id, pg);   // Round 8: the course's supplied cover, on its overview lesson only
      if (cover) intro = { text: intro, cover };
      if (/^Topic 11\b/.test(l.title) && c.id === 'core03') extra = this.allocationPanel();
      else if (l.kind === 'activity') extra = `<div class="pixel-content-canvas lesson-extra"><div class="canvas-header-bar"><span class="canvas-title">YOUR WORKING</span></div>
        <div class="lesson-flow"><p>Answer the tasks above in your own words. Your notes are saved with your game.</p>
        <textarea class="notes-box" data-in="note" data-key="lesson${pg}" maxlength="2000" placeholder="Your answers…" aria-label="Your notes">${esc(rec.notes[`lesson${pg}`] ?? '')}</textarea></div></div>`;
    } else if (pg === 'check') {
      const type = checkProvider(c, rec).type;
      title = 'Knowledge check'; canvasTitle = type === 'choice' ? 'MULTIPLE CHOICE' : 'OPEN ANSWERS — COMPARE WITH THE MODEL ANSWER';
      intro = type === 'choice' ? 'Choose one answer for each question, then check your answers.' : 'Write your own answer first, then reveal the course\'s model answer and judge honestly whether yours matched it.';
      body = this.checkBody();
    } else if (pg === 'glossary') {
      title = 'Glossary'; canvasTitle = 'TERMS FROM THIS COURSE'; intro = `${c.glossary.length} terms defined in this course.`;
      body = blocksHtml([{ t: 'table', head: true, rows: [['Term', 'Definition'], ...c.glossary.map(g => [g.term, g.def])] }]);
    } else {
      title = 'About this course'; canvasTitle = 'OBJECTIVES, NOTES AND SOURCES'; intro = c.header.filter(b => b.t === 'p').map(b => b.text).join(' — ');
      body = blocksHtml(c.header.filter(b => b.t !== 'p')) + `<h3>Learning objectives</h3>${blocksHtml([{ t: 'ul', items: c.objectives }])}`
        + c.reference.map(r => `<h3>${esc(r.title)}</h3>${blocksHtml(r.blocks)}`).join('')
        + (p.legacy.length ? `<h3>Your earlier academy record</h3>${blocksHtml([{ t: 'ul', items: p.legacy.map(l => `${l.title} (retired lesson): ${l.passed ? 'passed' : 'attempted'}, best ${pctTxt(l.bestScore)}, ${l.attempts} attempt(s)`) }])}` : '');
    }
    const tipCards = tips.length ? `<div class="pixel-content-canvas lesson-extra"><div class="canvas-header-bar"><span class="canvas-title">KEY TERMS IN THIS LESSON</span></div>
      <div class="lesson-tips-row">${tips.map((t, i) => `<div class="pixel-tip-card"><span class="pixel-badge-sq">${String(i + 1).padStart(2, '0')}</span>
        <div class="tip-content"><span class="tip-title">${esc(t.term.toUpperCase())}</span><p class="tip-sub">${esc(t.def)}</p></div></div>`).join('')}</div></div>` : '';
    return `<div class="vq-lecture"><div class="lecture-overlay-container" id="lectureUI">
      <section class="pixel-panel lecture-panel-left" aria-label="Lesson Content Panel">
        <header class="panel-header left-header">
          <div class="lesson-tag-row"><div class="pixel-tag-icon"><span class="pixel-icon-box"></span></div>
            <span class="pixel-label region-label">CORE COURSE ${n} — ${esc(c.title.toUpperCase())}</span></div>
          <div class="title-nav-row"><h1 class="pixel-heading lesson-title" data-testid="lesson-title">${esc(title)}</h1>
            <nav class="lesson-nav-arrows" aria-label="Lesson Navigation">
              <button class="pixel-nav-btn" data-a="prev" title="Previous" aria-label="Previous" ${this.page ? '' : 'disabled'}>&lt;</button>
              <span class="pixel-counter" data-testid="lesson-counter">${this.page + 1} / ${pages.length}</span>
              <button class="pixel-nav-btn" data-a="next" title="Next" aria-label="Next" ${this.page < pages.length - 1 ? '' : 'disabled'}>&gt;</button>
              <button class="pixel-nav-btn nav-wide" data-a="courses" title="All courses">COURSES</button></nav></div></header>
        <article class="panel-body left-body-content">
          <div class="lesson-scroll" data-scroll="lesson" tabindex="0" aria-label="Lesson text">
            ${intro?.cover ? `<figure class="course-cover" data-testid="course-cover"><img src="${intro.cover.src}" alt="${esc(intro.cover.alt)}" width="${intro.cover.width}" height="${intro.cover.height}" loading="lazy" decoding="async" onerror="this.parentNode.classList.add('missing')"><figcaption>Course cover image unavailable.</figcaption></figure>` : ''}
            ${(intro?.text ?? intro) ? `<div class="placeholder-text-box"><p class="pixel-body-text">${esc(intro?.text ?? intro)}</p></div>` : ''}
            <div class="pixel-content-canvas"><div class="canvas-header-bar"><span class="canvas-title">${canvasTitle}</span></div>
              <div class="canvas-body-placeholder lesson-flow">${body}</div></div>
            ${extra}${tipCards}
          </div>
          ${this.readingFoot(pg, p, rec)}
        </article></section>
      <section class="lecture-panel-right-column">
        <section class="pixel-panel advisor-box" aria-label="Advisor"><div class="advisor-portrait-frame"><img src="art/ui/advisor.svg" alt="Academy advisor" class="advisor-avatar-img"></div>
          <div class="advisor-dialogue-frame"><div class="advisor-badge-bar"><span class="advisor-role-tag">ACADEMY ADVISOR</span></div>
            <p class="advisor-dialogue-text" data-testid="advisor">"${esc(this.advice(pg, p))}"</p></div></section>
        ${typeof pg === 'number' ? this.labPanel(pg) : this.answerPanel(pg, p)}
      </section></div></div>`;
  }

  // Reading progress lives under the lesson (separate from practice and from the knowledge check).
  readingFoot(pg, p, rec) {
    if (typeof pg !== 'number') return '';
    const l = this.c.lessons[pg], done = rec.studied[pg] != null;
    const seg = `<div class="square-progress-track">${this.c.lessons.map((_, i) => `<div class="track-segment ${rec.studied[i] != null ? 'seg-1' : 'seg-off'}" style="width:${100 / this.c.lessons.length}%"></div>`).join('')}</div>`;
    let b;
    if (l.guide) b = `<button class="pixel-btn-action small" data-a="reveal" ${this.reveal[pg] ? 'disabled' : ''}><span class="btn-caption">${this.reveal[pg] ? 'ANSWER GUIDE SHOWN ✓' : 'REVEAL ANSWER GUIDE'}</span></button>`;
    else b = `${l.blocks.some(x => x.reveal) && !this.reveal[pg] ? '<button class="pixel-nav-btn nav-wide" data-a="reveal-inline">SHOW SUGGESTED ANSWERS</button>' : ''}<button class="pixel-btn-action small" data-a="study" ${done ? 'disabled' : ''}><span class="btn-caption">${done ? 'READ ✓' : 'MARK AS READ'}</span></button>`;
    return `<footer class="lesson-foot"><div class="lf-progress"><span class="tracker-ratio" data-testid="reading-progress">[READ: ${p.studied} / ${p.lessons}]</span>${seg}
      <span class="action-footnote">${done ? `Read on ${fmtShortDate(rec.studied[pg])}.` : l.guide ? 'Revealing the guide marks this activity as read.' : 'Reading progress is saved with your game.'}</span></div><div class="lf-actions">${b}</div></footer>`;
  }

  // The PRACTICE LAB: an interactive exercise for the open lesson, on the separate practice store.
  labPanel(pg) {
    const c = this.c, l = c.lessons[pg], { ex, rec, body } = this.lab.labHtml(c.id, pg, l.title);
    const pr = this.lab.courseProgress(c.id, c.lessons.length), p = courseProgress(this.s, c.id);
    return `<section class="pixel-panel lecture-panel-answer practice-lab" aria-label="Practice Lab">
      <header class="challenge-header"><div class="challenge-meta"><span class="pixel-tag challenge-pill">PRACTICE LAB</span>
        <h2 class="pixel-heading challenge-title" data-testid="lab-title">${esc(ex.title.toUpperCase())}</h2><p class="challenge-subtitle">Fictional money, isolated from your game. ${this.lab.aiBadge()}</p></div>
        <div class="allocation-total-badge"><div class="badge-content"><span class="badge-num">${rec ? rec.best : '—'}</span><span class="badge-lbl">BEST</span></div></div></header>
      <div class="lab-body" data-scroll="lab" data-testid="lab-body" data-exercise="${ex.exercise}" data-stage="${ex.stage}">${body}</div>
      <footer class="lab-foot"><span class="chip" data-testid="chip-read">READ ${p.studied}/${p.lessons}</span><span class="chip" data-testid="chip-practice">PRACTICE ${pr.done}/${pr.total}</span>
        <span class="chip" data-testid="chip-check">CHECK ${p.passed ? 'PASSED' : p.attempts ? `BEST ${pctTxt(p.bestScore)}` : 'NOT TAKEN'}</span>
        <button class="pixel-nav-btn nav-wide" data-a="life-open">PRACTICE LIFE ▶</button></footer></section>`;
  }

  // Practice life: a fictional year (Exercise E) and its final report.
  lifeScreen() {
    const L = this.lab.life, done = L?.done;
    return `<div class="vq-lecture"><div class="lecture-overlay-container life-layout ${done ? 'single' : ''}" id="lifeUI">
      <section class="pixel-panel lecture-panel-left" aria-label="Practice life">
        <header class="panel-header left-header">
          <div class="lesson-tag-row"><div class="pixel-tag-icon"><span class="pixel-icon-box"></span></div><span class="pixel-label region-label">COMPOUND FINANCIAL ACADEMY — PRACTICE LIFE (FICTIONAL, ISOLATED FROM YOUR GAME)</span></div>
          <div class="title-nav-row"><h1 class="pixel-heading lesson-title" data-testid="life-title">${!L ? 'A year of practice' : done ? 'Your year: the report' : `Month ${L.month} of 12`}</h1>
            <nav class="lesson-nav-arrows">${L && !done ? '<button class="pixel-nav-btn nav-wide" data-a="life-new" title="Abandon this life and start a new one">NEW LIFE</button>' : ''}
              <button class="pixel-nav-btn nav-wide" data-a="life-close">${this.course ? 'BACK TO LESSON' : 'COURSES'}</button></nav></div></header>
        <article class="panel-body left-body-content"><div class="lesson-scroll lab-body" data-scroll="life">${this.lab.lifeLeftHtml()}</div></article></section>
      <section class="lecture-panel-right-column"><section class="pixel-panel lecture-panel-answer practice-lab" aria-label="Your situation">
        <header class="challenge-header"><div class="challenge-meta"><span class="pixel-tag challenge-pill">${done ? 'HISTORY' : 'YOUR SITUATION'}</span><p class="challenge-subtitle">${this.lab.aiBadge()}</p></div></header>
        <div class="lab-body" data-scroll="life-right">${this.lab.lifeRightHtml()}</div></section></section>
      </div></div>`;
  }

  advice(pg, p) {
    if (typeof pg === 'number') {
      const l = this.c.lessons[pg], done = readRecord(this.s, this.c.id).studied[pg] != null;
      if (l.guide && !this.reveal[pg]) return 'Work through the tasks first — jot your answers in the notes box — then reveal the answer guide to compare.';
      return done ? `Read. ${p.studied}/${p.lessons} lessons done — now try the Practice Lab on the right, then use › to keep going.` : `Read this ${l.kind === 'activity' ? 'activity' : 'lesson'}, then put it into practice in the lab on the right. ${p.studied}/${p.lessons} lessons read so far.`;
    }
    if (pg === 'check') {
      const r = this.result;
      if (r) return `You scored ${r.correct}/${r.total} (${pctTxt(r.score)}). ${r.passed ? 'That\'s a pass' : `You need ${pctTxt(PASS_MARK)} — review the lessons and try again`}.${r.completed ? ' Course complete!' : ''}`;
      return checkProvider(this.c, readRecord(this.s, this.c.id)).type === 'choice' ? `Answer all ${this.c.check.questions.length} questions. You need ${pctTxt(PASS_MARK)} to pass.`
        : `These questions have model answers rather than options. Mark yourself honestly — you need ${pctTxt(PASS_MARK)} to pass.`;
    }
    return pg === 'glossary' ? 'Every definition here is from this course.' : 'What this course covers, notes for teachers, and its sources.';
  }

  // the right-hand panel on the knowledge check, glossary and about pages
  answerPanel(pg, p) {
    const c = this.c, rec = readRecord(this.s, c.id);
    const seg = `<div class="square-progress-track">${c.lessons.map((_, i) => `<div class="track-segment ${rec.studied[i] != null ? 'seg-1' : 'seg-off'}" style="width:${100 / c.lessons.length}%"></div>`).join('')}</div>`;
    const tracker = (ratio, state, cls = '') => `<div class="allocation-tracker-block"><div class="tracker-status-line"><span class="tracker-ratio">${ratio}</span><span class="tracker-check-badge ${cls}">${state}</span></div>${seg}</div>`;
    const action = (a, caption, foot, disabled = false) => `<div class="answer-action-block"><button class="pixel-btn-action" data-a="${a}" ${disabled ? 'disabled' : ''}><span class="btn-bracket">[</span><span class="btn-caption">${caption}</span><span class="btn-bracket">]</span></button><p class="action-footnote">${foot}</p></div>`;
    const head = (pill, title, sub, num, lbl) => `<header class="challenge-header"><div class="challenge-meta"><span class="pixel-tag challenge-pill">${pill}</span><h2 class="pixel-heading challenge-title">${title}</h2><p class="challenge-subtitle">${sub}</p></div>
      <div class="allocation-total-badge"><div class="badge-content"><span class="badge-num">${num}</span><span class="badge-lbl">${lbl}</span></div></div></header>`;
    const pr = this.lab.courseProgress(c.id, c.lessons.length);
    const ratio = `[READ: ${p.studied} / ${p.lessons}] [PRACTICE: ${pr.done} / ${pr.total}]`, state = p.complete ? '[COURSE COMPLETE]' : p.passed ? '[CHECK PASSED]' : '[IN PROGRESS]';
    let inner;
    if (pg === 'check') {
      const check = checkProvider(c, rec), qs = check.questions, ready = this.checkReady(qs);
      const answered = qs.filter((_, i) => { const a = this.answers[i]; return typeof a === 'string' || a?.self; }).length;
      inner = head('KNOWLEDGE CHECK', `${qs.length} QUESTIONS`, `Pass mark ${pctTxt(PASS_MARK)}. Best so far: ${p.attempts ? pctTxt(p.bestScore) : '—'} (${p.attempts} attempt(s)).`, `${answered}/${qs.length}`, 'ANSWERED')
        + `<div class="sliders-list">${this.result ? `<p class="result-line ${this.result.passed ? 'pass' : 'fail'}" data-testid="check-result">${this.result.correct}/${this.result.total} — ${this.result.passed ? 'PASSED' : 'NOT YET'}</p>` : ''}
          ${check.type === 'open' ? '<p class="action-footnote">These questions come with model answers, not options. Revealing each one and marking yourself honestly is the course\'s own method.</p>' : ''}</div>`
        + tracker(ratio, state) + (this.result ? action('retry', 'TRY AGAIN', 'Your best score is kept.') : action('submit', check.type === 'choice' ? 'CHECK ANSWERS' : 'SUBMIT SELF-CHECK', ready ? 'Ready.' : 'Answer every question first.', !ready));
    } else {
      inner = head(pg === 'glossary' ? 'GLOSSARY' : 'ABOUT', pg === 'glossary' ? 'KEY TERMS' : 'COURSE DETAILS', 'Reference pages — nothing to complete here.', `${p.studied}/${p.lessons}`, 'READ') + tracker(ratio, state)
        + action('life-open', 'PRACTICE LIFE ▶', 'Twelve fictional months that test everything from all four courses.');
    }
    return `<section class="pixel-panel lecture-panel-answer" aria-label="Answer and Challenge Panel">${inner}</section>`;
  }

  // Course 3, Topic 11: the supplied lecture template's allocation sliders, with the three
  // categories from the course's own example. Ungraded — the course scores reasoning, not a mix.
  allocationPanel() {
    const rec = readRecord(this.s, this.c.id);
    const saved = rec.notes.portfolio ? JSON.parse(rec.notes.portfolio) : null;
    const a = this.alloc ??= saved ? { v: [...saved.v], why: saved.why } : { v: [50, 30, 20], why: '' };
    const total = a.v.reduce((s, x) => s + x, 0);
    const [label, cls] = total === 100 ? ['[BALANCED]', 'ok'] : total > 100 ? ['[OVER_BUDGET]', 'over'] : [`[REMAINING: ${100 - total}%]`, 'under'];
    const rows = PORTFOLIO.map((name, i) => `<div class="slider-row"><div class="row-label-group"><span class="slider-pixel-indicator indicator-${'abc'[i]}"></span><span class="slider-name">${name}</span></div>
      <div class="slider-input-track"><input type="range" min="0" max="100" step="5" value="${a.v[i]}" class="square-pixel-slider" data-in="alloc" data-i="${i}" aria-label="${name}"></div>
      <span class="row-value-pill">${a.v[i]}%</span></div>`).join('');
    return `<div class="pixel-content-canvas lesson-extra"><div class="canvas-header-bar"><span class="canvas-title">COURSE ACTIVITY — BUILD A HYPOTHETICAL PORTFOLIO</span></div>
      <div class="lesson-flow"><p>Split 100 fictional credits, then write your reasons: goal, time horizon, risk, diversification and costs.</p>
      <div class="sliders-list">${rows}<textarea class="notes-box" data-in="alloc-why" maxlength="2000" placeholder="Why this mix? What is the goal and time horizon? What risks remain? What costs apply?" aria-label="Your reasons">${esc(a.why)}</textarea></div>
      <div class="allocation-tracker-block"><div class="tracker-status-line"><span class="tracker-ratio">[ALLOCATION: ${total}% / 100%]</span><span class="tracker-check-badge ${cls}">${label}</span></div>
        <div class="square-progress-track">${a.v.map((x, i) => `<div class="track-segment seg-${i + 1}" style="width:${Math.min(x, 100)}%"></div>`).join('')}</div></div>
      <button class="pixel-btn-action small" data-a="alloc-save" ${total !== 100 || !a.why.trim() ? 'disabled' : ''}><span class="btn-caption">${saved ? 'UPDATE ALLOCATION' : 'LOCK IN ALLOCATION'}</span></button>
      <p class="action-footnote">Fictional credits only. Not a recommended allocation — there is no "winning" mix. To watch a mix live through a market fall, use the Practice Lab.</p></div></div>`;
  }

  checkReady(qs) {
    return qs.every((_, i) => { const a = this.answers[i]; return typeof a === 'string' || (a?.revealed && a.self); });
  }

  checkBody() {
    const c = this.c, check = checkProvider(c, readRecord(this.s, c.id)), res = this.result;
    return check.questions.map((q, i) => {
      const a = this.answers[i], fb = res?.results[i];
      if (check.type === 'choice') {
        const opts = q.options.map(o => {
          const chosen = a === o.key, mark = res ? (o.key === q.answer ? 'right' : chosen ? 'wrong' : '') : chosen ? 'chosen' : '';
          return `<button class="vq-opt ${mark}" data-a="pick" data-q="${i}" data-o="${o.key}" ${res ? 'disabled' : ''}>${chosen ? '■' : '□'} ${o.key}. ${esc(o.text)}</button>`;
        }).join('');
        const feedback = fb ? `<p class="fb ${fb.correct ? 'pass' : 'fail'}">${fb.correct ? '✔ Correct.' : `✘ The answer key gives ${fb.answer}. ${esc(fb.answerText)}`}</p>` : '';
        return `<div class="q"><h4>${i + 1}. ${esc(q.q)}</h4>${opts}${feedback}</div>`;
      }
      const v = a ?? {};
      return `<div class="q"><h4>${i + 1}. ${esc(q.q)}</h4>
        <textarea class="notes-box" data-in="open" data-q="${i}" maxlength="2000" placeholder="Your answer…" ${res ? 'disabled' : ''}>${esc(v.text ?? '')}</textarea>
        ${v.revealed ? `<p class="answer">Model answer: ${esc(q.model)}</p>
          <div class="self"><span>Did your answer match?</span><button class="vq-opt ${v.self === 'got' ? 'chosen' : ''}" data-a="self" data-q="${i}" data-v="got" ${res ? 'disabled' : ''}>YES, IT MATCHED</button>
          <button class="vq-opt ${v.self === 'missed' ? 'chosen' : ''}" data-a="self" data-q="${i}" data-v="missed" ${res ? 'disabled' : ''}>NOT REALLY</button></div>`
          : `<button class="vq-opt" data-a="reveal-q" data-q="${i}">REVEAL MODEL ANSWER</button>`}</div>`;
    }).join('');
  }

  // ------------------------------------------------------------------ events
  onInput(el) {
    const id = this.course;
    if (['lab', 'lab-why', 'life'].includes(el.dataset.in)) return this.lab.onInput(el);
    if (el.dataset.in === 'note') this.game.act(s => saveNote(s, id, el.dataset.key, el.value));
    if (el.dataset.in === 'open') { const i = +el.dataset.q; this.answers[i] = { ...(this.answers[i] ?? {}), text: el.value }; }
    if (el.dataset.in === 'alloc') this.alloc.v[+el.dataset.i] = Math.max(0, Math.min(100, Math.round(+el.value / 5) * 5));
    if (el.dataset.in === 'alloc-why') this.alloc.why = el.value.slice(0, 2000);
  }

  onAction(a, el) {
    const pages = this.course ? this.pages() : [], pg = pages[this.page];
    if (a === 'life-open') { this.view = 'life'; return; }
    if (a === 'life-close') { this.view = null; return; }
    if (a.startsWith('lab-') || a.startsWith('life-')) return this.lab.onAction(a, el);
    switch (a) {
      case 'open': this.course = el.dataset.id; this.page = 0; this.answers = []; this.result = null; this.reveal = {}; this.alloc = null; break;
      case 'courses': this.course = null; break;
      case 'prev': this.page = Math.max(0, this.page - 1); this.alloc = null; break;
      case 'next': this.page = Math.min(pages.length - 1, this.page + 1); this.alloc = null; break;
      case 'study': this.game.act(s => markStudied(s, this.course, pg)); break;
      case 'reveal': this.reveal[pg] = true; this.game.act(s => markStudied(s, this.course, pg)); break;
      case 'reveal-inline': this.reveal[pg] = true; break;
      case 'alloc-save': {
        const v = this.alloc;
        if (v.v.reduce((s, x) => s + x, 0) !== 100 || !v.why.trim()) break;
        this.game.act(s => { saveNote(s, this.course, 'portfolio', JSON.stringify(v)); markStudied(s, this.course, pg); });
        break;
      }
      case 'pick': if (!this.result) this.answers[+el.dataset.q] = el.dataset.o; break;
      case 'reveal-q': { const i = +el.dataset.q; this.answers[i] = { ...(this.answers[i] ?? {}), revealed: true }; break; }
      case 'self': if (!this.result) { const i = +el.dataset.q; this.answers[i] = { ...(this.answers[i] ?? {}), self: el.dataset.v }; } break;
      case 'submit': {
        const r = this.game.act(s => submitCheck(s, this.course, [...this.answers]));
        if (r.ok) this.result = r;
        break;
      }
      case 'retry': this.answers = []; this.result = null; break;
    }
  }
}
