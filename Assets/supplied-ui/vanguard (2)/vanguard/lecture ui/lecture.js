// ========================================================
// Lecture UI Template Logic (Placeholders & Interactive State)
// ========================================================

const lessonsData = [
  {
    region: "REGION 01 — BUDGET BOROUGH",
    title: "LESSON 01: [LESSON_TITLE_GOES_HERE]",
    intro: "[LESSON_DESCRIPTION_TEXT: Explanatory paragraph, rules, and core educational concepts will be injected here.]",
    advisorText: "[ADVISOR_HINT_OR_GUIDANCE_DIALOGUE: Contextual tips and feedback tailored to this challenge will appear here.]",
    challengeTitle: "[CHALLENGE_TITLE_01]",
    targetValue: "100%",
    targetLabel: "[TARGET_TOTAL]"
  },
  {
    region: "REGION 01 — BUDGET BOROUGH",
    title: "LESSON 02: [NEXT_LESSON_TITLE]",
    intro: "[LESSON_02_DESCRIPTION: Introduce second scenario, concepts, and key learning goals.]",
    advisorText: "[ADVISOR_02_GUIDANCE: Additional advisor dialogue advice for lesson 2.]",
    challengeTitle: "[CHALLENGE_TITLE_02]",
    targetValue: "100%",
    targetLabel: "[TARGET_TOTAL]"
  }
];

let currentLessonIndex = 0;

// DOM Elements
const regionLabel = document.getElementById('regionLabel');
const lessonTitle = document.getElementById('lessonTitle');
const lessonCounter = document.getElementById('lessonCounter');
const lessonIntro = document.getElementById('lessonIntro');
const advisorSpeech = document.getElementById('advisorSpeech');
const prevLessonBtn = document.getElementById('prevLessonBtn');
const nextLessonBtn = document.getElementById('nextLessonBtn');

const slider1 = document.getElementById('slider1');
const slider2 = document.getElementById('slider2');
const slider3 = document.getElementById('slider3');

const val1 = document.getElementById('val1');
const val2 = document.getElementById('val2');
const val3 = document.getElementById('val3');

const fill1 = document.getElementById('fill1');
const fill2 = document.getElementById('fill2');
const fill3 = document.getElementById('fill3');

const allocationStatusText = document.getElementById('allocationStatusText');
const allocationCheck = document.getElementById('allocationCheck');
const lockInBtn = document.getElementById('lockInBtn');

function loadLesson(index) {
  const lesson = lessonsData[index];
  regionLabel.textContent = lesson.region;
  lessonTitle.textContent = lesson.title;
  lessonCounter.textContent = `${index + 1} / ${lessonsData.length}`;
  lessonIntro.textContent = lesson.intro;
  advisorSpeech.textContent = `"${lesson.advisorText}"`;
  updateValues();
}

function updateValues() {
  const v1 = parseInt(slider1.value, 10);
  const v2 = parseInt(slider2.value, 10);
  const v3 = parseInt(slider3.value, 10);

  val1.textContent = `${v1}%`;
  val2.textContent = `${v2}%`;
  val3.textContent = `${v3}%`;

  const total = v1 + v2 + v3;
  allocationStatusText.textContent = `[ALLOCATION: ${total}% / 100%]`;

  fill1.style.width = `${v1}%`;
  fill2.style.width = `${v2}%`;
  fill3.style.width = `${v3}%`;

  if (total === 100) {
    allocationCheck.textContent = "[BALANCED]";
    allocationCheck.style.color = "var(--text-green)";
    allocationCheck.style.borderColor = "var(--text-green)";
  } else if (total > 100) {
    allocationCheck.textContent = "[OVER_BUDGET]";
    allocationCheck.style.color = "var(--red-light)";
    allocationCheck.style.borderColor = "var(--red-light)";
  } else {
    allocationCheck.textContent = `[REMAINING: ${100 - total}%]`;
    allocationCheck.style.color = "var(--text-yellow)";
    allocationCheck.style.borderColor = "var(--text-yellow)";
  }
}

[slider1, slider2, slider3].forEach(slider => {
  slider.addEventListener('input', updateValues);
});

prevLessonBtn.addEventListener('click', () => {
  if (currentLessonIndex > 0) {
    currentLessonIndex--;
    loadLesson(currentLessonIndex);
  }
});

nextLessonBtn.addEventListener('click', () => {
  if (currentLessonIndex < lessonsData.length - 1) {
    currentLessonIndex++;
    loadLesson(currentLessonIndex);
  }
});

lockInBtn.addEventListener('click', () => {
  console.log('Action triggered:', { v1: slider1.value, v2: slider2.value, v3: slider3.value });
});

// Init
loadLesson(0);
