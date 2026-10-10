// College programmes. Fictional prototype values: tuition is paid in full at enrolment,
// programmes are shortened ("accelerated") so a run reaches graduation in a few months.
// career.levels: salary steps; `afterMonths` counts months in the career since graduation.
export const MAJORS = {
  computer_science: {
    name: 'Computer Science', tuition: 65000, months: 8,
    blurb: 'Programming, algorithms and systems. Leads to software roles with strong long-term pay.',
    career: { id: 'software', field: 'Technology', levels: [
      { afterMonths: 0, title: 'Junior Software Developer', salary: 45000 },
      { afterMonths: 12, title: 'Software Developer', salary: 60000 },
    ] },
  },
  business: {
    name: 'Business Administration', tuition: 45000, months: 6,
    blurb: 'Management, marketing and operations. A flexible path into many companies.',
    career: { id: 'business', field: 'Business', levels: [
      { afterMonths: 0, title: 'Business Analyst', salary: 35000 },
      { afterMonths: 12, title: 'Senior Business Analyst', salary: 45000 },
    ] },
  },
  finance: {
    name: 'Finance', tuition: 55000, months: 6,
    blurb: 'Accounting, markets and valuation. Leads to analyst roles in banks and firms.',
    career: { id: 'finance', field: 'Finance', levels: [
      { afterMonths: 0, title: 'Financial Analyst', salary: 40000 },
      { afterMonths: 12, title: 'Senior Financial Analyst', salary: 55000 },
    ] },
  },
  engineering: {
    name: 'Mechanical Engineering', tuition: 70000, months: 8,
    blurb: 'Mechanics, design and manufacturing. Leads to engineering and production roles.',
    career: { id: 'engineering', field: 'Engineering', levels: [
      { afterMonths: 0, title: 'Graduate Design Engineer', salary: 38000 },
      { afterMonths: 12, title: 'Design Engineer', salary: 50000 },
    ] },
  },
  nursing: {
    name: 'Nursing', tuition: 40000, months: 6,
    blurb: 'Patient care and clinical practice. Steady demand in hospitals and clinics.',
    career: { id: 'healthcare', field: 'Healthcare', levels: [
      { afterMonths: 0, title: 'Staff Nurse', salary: 30000 },
      { afterMonths: 12, title: 'Senior Staff Nurse', salary: 38000 },
    ] },
  },
  design: {
    name: 'Graphic Design', tuition: 25000, months: 4,
    blurb: 'Visual communication and digital tools. Freelance-friendly creative work.',
    career: { id: 'design', field: 'Creative', levels: [
      { afterMonths: 0, title: 'Junior Designer', salary: 25000 },
      { afterMonths: 12, title: 'Designer', salary: 32000 },
    ] },
  },
};
