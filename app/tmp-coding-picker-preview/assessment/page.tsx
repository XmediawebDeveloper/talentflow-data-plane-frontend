'use client';

// TEMPORARY preview of Step 5 (Assessment) - renders the real AssessmentInterface
// with sample questions, since that step only renders inside the live candidate
// flow. `?round=coding` shows the Coding Round. Delete after review.
import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';

// Client-only, as in the live flow: the component reads `document` while rendering.
const AssessmentInterface = dynamic(
  () => import('@/components/candidate/AssessmentInterface').then((m) => m.AssessmentInterface),
  { ssr: false },
);
import type { AssessmentInfo, CurrentQuestion } from '@/lib/services/candidateService';

const info = {
  assessment_id: 'preview',
  assessment_title: 'Momentic Assessment Duplicate Row Action 20261002-1437 - Assessment - Version 1',
  assessment_description: null,
  jd_title: 'QA Analyst',
  candidate_name: 'DHAYALAN',
  candidate_email: 'preview@example.com',
  company_name: null,
  duration_minutes: 30,
  has_hr_round: true,
  has_technical_round: true,
  has_coding_round: true,
  hr_percentage: 0,
  technical_percentage: 50,
  coding_percentage: 50,
  invitation_status: 'started',
  consent_accepted: true,
  expires_at: null,
  attempt_id: 'preview',
  attempt_status: 'in_progress',
  attempt_started_at: null,
  can_start: true,
  can_resume: true,
  message: '',
} as AssessmentInfo;

const base = {
  total_questions: 14,
  points: 1,
  time_limit_seconds: null,
  difficulty: 'medium',
  tags: [],
  previous_answer: null,
  all_question_statuses: null,
  input_format: null,
  output_format: null,
  constraints: null,
  sample_input: null,
  sample_output: null,
  starter_code: null,
  problem_title: null,
  options: null,
};

const technical: CurrentQuestion = {
  ...base,
  question_id: 'q1',
  question_number: 1,
  round_type: 'technical',
  round_name: 'Technical Round',
  question_type: 'single_choice',
  question_text:
    'During manual testing of a web form, you enter valid data but the Submit button does nothing in Chrome, while it works in Firefox. What is the best first step for the QA analyst?',
  options: [
    { id: 'A', text: 'Mark it as a low-priority defect because it works in one browser' },
    { id: 'B', text: 'Reproduce it in Chrome, capture exact steps, and record browser/version details in the defect' },
    { id: 'C', text: 'Ask the developer to fix it without logging a ticket' },
    { id: 'D', text: 'Close it because cross-browser differences are expected' },
  ],
  round_progress: { current: 1, total: 10, round_type: 'technical' },
};

const coding: CurrentQuestion = {
  ...base,
  question_id: 'q11',
  question_number: 11,
  round_type: 'coding',
  round_name: 'Coding Round',
  question_type: 'coding',
  problem_title: 'Reverse Words',
  question_text: 'Given a sentence, return the words in reverse order.',
  input_format: 'A single line of text.',
  output_format: 'The words in reverse order, separated by single spaces.',
  constraints: ['1 <= length <= 1000'],
  sample_input: 'hello world',
  sample_output: 'world hello',
  starter_code: { python: 'def solve(s):\n    pass\n' },
  coding_enabled: true,
  coding_languages: ['python'],
  round_progress: { current: 1, total: 4, round_type: 'coding' },
};

const rounds = [
  { round_type: 'technical', round_name: 'Technical Round', question_count: 10, weightage: 50, order: 1 },
  { round_type: 'coding', round_name: 'Coding Round', question_count: 4, weightage: 50, order: 2 },
];

export default function TmpAssessmentPreview() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [startedAt] = useState(() => new Date().toISOString());
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const isCoding = params?.get('round') === 'coding';
  // `?locked=1`: the question as the flow returns to it after a submit.
  const lockedTechnical: CurrentQuestion = {
    ...technical,
    previous_answer: {
      text_response: null, selected_options: ['C'], code_submission: null, language: null, code_input: null,
      code_execution_status: null, code_execution_output: null, code_execution_error: null, is_locked: true,
    },
  };
  return (
    <AssessmentInterface
      token="preview-token"
      assessmentInfo={info}
      currentQuestion={isCoding ? coding : params?.get('locked') === '1' ? lockedTechnical : technical}
      progress={{ answered: 0, total: 14, percent: 0 }}
      rounds={rounds}
      startedAt={startedAt}
      durationMinutes={30}
      onAnswerSubmit={async () => ({}) as never}
      onComplete={() => {}}
      onNavigate={() => {}}
      videoRef={videoRef}
      stream={null}
      enforceFullscreen={false}
    />
  );
}
