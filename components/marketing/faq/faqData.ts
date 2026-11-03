/*
 * /faq content. Every answer restates the website content (v2) — the six
 * Section 14 FAQs plus direct restatements of Sections 4–12. No prices, trial
 * length, certifications, compliance claims or integrations. Keep answers short.
 */

export type FaqCategoryId =
  | "getting-started"
  | "resumes-matching"
  | "assessments"
  | "ai-interviews"
  | "teams-security"
  | "plans-units";

export interface FaqCategory {
  id: FaqCategoryId;
  title: string;
  items: Array<{ q: string; a: string }>;
}

export const FAQ_CATEGORIES: FaqCategory[] = [
  {
    id: "getting-started",
    title: "Getting started",
    items: [
      {
        q: "What is TalentFlow?",
        a: "An AI hiring platform that takes you from job description to final interview. AI writes your JD, finds the best resumes, scores them, tests skills and interviews candidates, so your team only meets the best.",
      },
      {
        q: "Can I try it free?",
        a: "Yes. Start with a free trial.",
      },
      {
        q: "Does it work outside IT?",
        a: "Yes. TalentFlow works for any industry and any role: IT, healthcare, finance, retail, manufacturing and more.",
      },
      {
        q: "How do I create a job description?",
        a: "Generate a full JD with AI, or write and paste your own. Skills, experience, education, certifications, industry, location, work mode, employment type and salary are captured automatically, and every version is saved.",
      },
    ],
  },
  {
    id: "resumes-matching",
    title: "Resumes & matching",
    items: [
      {
        q: "Which file types can I upload?",
        a: "PDF, DOC, DOCX, RTF and TXT, up to 3 MB each and 100 at a time.",
      },
      {
        q: "What happens with duplicate resumes?",
        a: "The same candidate is never stored twice, and new versions are tracked.",
      },
      {
        q: "What does AI Talent Match show?",
        a: "Pick a job and AI ranks your whole resume database, best fits first. Every candidate gets a match score from 1 to 10 and an Excellent, Good, Moderate or Low fit label.",
      },
      {
        q: "What do the Resume Scoring verdicts mean?",
        a: "Each resume gets Exact Match, Partial Match or No Match against the JD. Job title, experience, skills, education, industry, location and job stability are each scored with a written reason.",
      },
      {
        q: "Can I score many resumes at once?",
        a: "Yes. Single, bulk and background scoring, with live progress. Export to Excel or CSV, or download PDF scorecards.",
      },
    ],
  },
  {
    id: "assessments",
    title: "AI Assessments",
    items: [
      {
        q: "What rounds can an assessment have?",
        a: "Technical, Coding and HR. AI writes fresh questions for each candidate, at the same difficulty and covering the same topics.",
      },
      {
        q: "Which coding languages are supported?",
        a: "13 languages, including Python, Java, JavaScript, C++ and Go, in a built-in code editor with run and submit.",
      },
      {
        q: "What does proctoring cover?",
        a: "Identity check, system check, full-screen mode, tab and copy-paste monitoring, plus camera and screen recording.",
      },
      {
        q: "How do I invite candidates?",
        a: "By email, in bulk, or with a shareable link, and track sent, opened, started and completed. From Resume Scoring, one click invites shortlisted candidates.",
      },
      {
        q: "What is the HR Question Bank?",
        a: "Save your company’s own HR questions once and use them in both AI Assessments and AI Interviews, with text or Yes/No answers.",
      },
    ],
  },
  {
    id: "ai-interviews",
    title: "AI Interviews",
    items: [
      {
        q: "Who is Bina?",
        a: "Bina is TalentFlow’s AI interviewer. Bina interviews candidates by voice, asks follow-up questions and gives you a complete report.",
      },
      {
        q: "Is the AI interview a live call?",
        a: "No. Candidates talk with Bina, our AI interviewer, whenever it suits them. You review the recording and report later.",
      },
      {
        q: "What interview styles are there?",
        a: "Two: Timed mode, which is structured and 30 minutes, or Conversational mode, which adapts to the candidate.",
      },
      {
        q: "What’s in the interview report?",
        a: "A skill-by-skill score, question-by-question analysis with reasons, an overall score out of 100, strengths, concerns and a clear recommendation, plus the full recording and transcript.",
      },
      {
        q: "Can candidates cheat?",
        a: "Assessments and interviews include identity checks, recording and proctoring, and every violation is flagged with a risk level.",
      },
    ],
  },
  {
    id: "teams-security",
    title: "Teams & security",
    items: [
      {
        q: "How do roles and teams work?",
        a: "Create custom roles with detailed permissions for each user, and organise recruiters into teams, with public and private Team Chat channels.",
      },
      {
        q: "What does the Audit Trail record?",
        a: "Every create, update, delete and login, filterable and exportable.",
      },
      {
        q: "How are accounts secured?",
        a: "Two-factor authentication, session timeouts and active-session control.",
      },
      {
        q: "Is there an API?",
        a: "Yes. Secure API keys are available on Enterprise plans.",
      },
    ],
  },
  {
    id: "plans-units",
    title: "Plans & units",
    items: [
      {
        q: "How is pricing calculated?",
        a: "A plan plus usage units. Top up anytime.",
      },
      {
        q: "What do usage units cover?",
        a: "Resume uploads, resume scoring, assessments and AI interviews. Each candidate assessment uses 1 unit, and each AI interview uses 1 unit.",
      },
      {
        q: "Which plans are there?",
        a: "A Free Trial, then Starter, Professional, Enterprise and Custom plans as you grow, with monthly or annual billing.",
      },
      {
        q: "What if we run out of units?",
        a: "Top up anytime with add-on unit packs, no plan change needed.",
      },
      {
        q: "What if units are used up by a technical problem?",
        a: "Raise a dispute and get them refunded.",
      },
    ],
  },
];
