// Which practice exercise goes with which lesson. Every one of the 42 lessons of the four supplied
// courses has a practice task that applies what it teaches (the course text itself is untouched).
import * as budget from './exercises/budget.js';
import * as saving from './exercises/saving.js';
import * as investing from './exercises/investing.js';
import * as safety from './exercises/safety.js';

export const EXERCISES = { budget, saving, investing, safety };
export const EXERCISE_TITLES = { budget: 'Budget a month', saving: 'Where should the money live?', investing: 'Build and hold a portfolio', safety: 'Vikram has an offer' };

// lesson index → [exercise, focus], in each course's lesson order (see src/data/courses.js)
export const LESSON_PRACTICE = {
  core01: [['budget', 'basic'], ['budget', 'basic'], ['budget', 'categories'], ['budget', 'goal'], ['budget', 'records'], ['budget', 'opportunity'], ['budget', 'timing'], ['budget', 'review']],
  core02: [['saving', 'basic'], ['saving', 'basic'], ['saving', 'goal'], ['saving', 'emergency'], ['saving', 'banking'], ['saving', 'interest'], ['saving', 'credit'], ['saving', 'commitments'], ['budget', 'goal']],
  core03: [['investing', 'basic'], ['investing', 'risk'], ['saving', 'goal'], ['investing', 'products'], ['investing', 'returns'], ['investing', 'risk'], ['investing', 'diversify'], ['investing', 'fees'],
    ['investing', 'compounding'], ['investing', 'sip'], ['investing', 'charts'], ['investing', 'discipline'], ['investing', 'portfolio'], ['safety', 'claims']],
  core04: [['safety', 'scams'], ['safety', 'scams'], ['safety', 'scams'], ['safety', 'otp'], ['safety', 'payments'], ['safety', 'claims'], ['safety', 'rights'], ['safety', 'scams'], ['safety', 'credit'], ['safety', 'identity'], ['safety', 'claims']],
};

export const practiceFor = (courseId, lessonIndex) => {
  const [exercise, focus] = LESSON_PRACTICE[courseId]?.[lessonIndex] ?? ['budget', 'basic'];
  return { exercise, focus, title: EXERCISE_TITLES[exercise], brief: EXERCISES[exercise].FOCUS[focus] };
};
