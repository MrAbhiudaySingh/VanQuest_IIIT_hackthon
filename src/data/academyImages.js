// Round 8 asset manifest: the images supplied in "Imgs for finintial acadamy" (copied unchanged, original
// filenames and spelling kept, to Assets/supplied-ui/round8/). Each one is the cover of one core course: its
// filename names the course and the artwork itself is printed "CORE COURSE 0N" with the course title. A cover
// is shown once, at the top of that course's first lesson ("Course overview"), and nowhere else.
// All four are 1254 × 1254 JPEG (RGB, no transparency), about 320–340 KB each.
export const ACADEMY_IMAGE_DIR = 'Assets/supplied-ui/round8/Imgs for finintial acadamy/';

export const COURSE_COVERS = {
  core01: { file: 'planning and budgeting.jpeg', width: 1254, height: 1254, lesson: 0,
    alt: 'Cover of VanQuest Core Course 01, Planning & Budgeting: a desk with a "My Budget" notebook listing housing, food, transport, education, shopping, personal and savings, a jar of coins labelled Savings, books titled Income, Expenses, Goals and Savings, a calculator and a phone showing a monthly overview.' },
  core02: { file: 'saveing and manageing money.jpeg', width: 1254, height: 1254, lesson: 0,
    alt: 'Cover of VanQuest Core Course 02, Saving & Managing Money: a "My Financial Goals" notebook with progress bars for an emergency fund, education, travel, car and long-term goals, a jar of coins labelled Savings, books titled Build Habits, Manage Money, Plan Ahead and Achieve Goals, a calculator and rupee notes.' },
  core03: { file: 'understanding investing.jpeg', width: 1254, height: 1254, lesson: 0,
    alt: 'Cover of VanQuest Core Course 03, Understanding Investing: a "My Investment Plan" notebook (set goals, understand risk, choose investments, diversify, grow over time), books titled Stocks, Bonds, Mutual Funds, ETFs and Diversification, a laptop with a price chart, stacked coins, a bull figurine and a tablet with an example asset-mix pie chart.' },
  core04: { file: 'finantial safty and consumer protection.jpeg', width: 1254, height: 1254, lesson: 0,
    alt: 'Cover of VanQuest Core Course 04, Financial Safety & Consumer Protection: a "Stay Financially Safe" checklist (recognise scams, protect your information, use safe payment methods, know your rights, make smart decisions), books titled Cyber Safety, Scam Awareness, Consumer Rights and Smart Decisions, a laptop showing a security shield and a phone reading Think, Verify, Report, Stay Safe.' },
};

export const coverFor = (courseId, lessonIndex) => {
  const c = COURSE_COVERS[courseId];
  return c && c.lesson === lessonIndex ? { ...c, src: encodeURI(ACADEMY_IMAGE_DIR + c.file) } : null;
};
