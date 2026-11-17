'use client';

// TEMPORARY preview of the candidate coding-round changes. Delete after review.
import { useState } from 'react';
import CodingLanguagePickerStep from '@/components/candidate/CodingLanguagePickerStep';
import { MultiLanguageCodeEditor } from '@/components/candidate/questions/MultiLanguageCodeEditor';
import AssessmentInfoPanel from '@/components/assessments/AssessmentInfoPanel';
import { candidateService } from '@/lib/services/candidateService';

const codes = ['java', 'python', 'javascript', 'typescript', 'c++', 'c#', 'go'];

// Stub the network calls so the real components render without an invite token.
(candidateService as any).getAvailableLanguagesByToken = async () => ({
  available_languages: codes.map((code) => ({
    code,
    display_name: code,
    compiler_info: { language: code, version: '' },
    available: true,
  })),
  unavailable_languages: [],
  total_assigned: codes.length,
});
(candidateService as any).chooseCodingLanguage = async () => ({});

const question: any = {
  question_id: 'preview-q1',
  question_type: 'coding',
  coding_enabled: false,
  coding_languages: codes,
  problem_title: 'Maximum Subarray Sum',
  question_text:
    'Given an array of integers, return the largest sum of any contiguous subarray. ' +
    'Your solution should run in linear time and use constant extra space.\n\n' +
    'Input Format: The first line contains an integer N, the number of elements. ' +
    'The second line contains N space-separated integers a[0] … a[N-1].\n' +
    'Output Format: Print a single integer — the maximum subarray sum.\n' +
    'Required Edge Cases: All numbers negative (answer is the largest single element); ' +
    'a single element; very large values near the limits; zeros mixed with negatives.\n' +
    'Notes: A subarray must contain at least one element.',
  constraints: ['1 <= N <= 10^5', '-10^4 <= a[i] <= 10^4'],
  sample_input: '9\n-2 1 -3 4 -1 2 1 -5 4',
  sample_output: '6',
};

export default function TmpCodingPickerPreview() {
  const [showPicker, setShowPicker] = useState(false);
  const [answer, setAnswer] = useState<any>({});

  return (
    <div className="min-h-screen bg-slate-100 p-4 sm:p-6 space-y-8">
      <a className="text-sm text-brand-blue underline" href="/tmp-coding-picker-preview/loading">Open the “Preparing your assessment” loading screen</a>
      <p className="tf-body-secondary">
        Temporary preview — real components, sample data. Nothing is saved or run.
      </p>

      <section>
        <h2 className="font-semibold mb-2">Candidate — Coding round (problem headings, page scroll, language logos)</h2>
        <div className="bg-white rounded-xl p-3 sm:p-6">
          <MultiLanguageCodeEditor question={question} answer={answer} onAnswerChange={setAnswer} allowLanguageChange />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Candidate — language picker popup</h2>
        <button className="tf-btn tf-btn-primary px-4 py-2 bg-brand-blue text-sm whitespace-normal shadow-none gap-0 font-normal hover:bg-brand-blue" onClick={() => setShowPicker(true)}>
          Open popup
        </button>
        {showPicker && <CodingLanguagePickerStep token="preview" attemptId="preview" onPicked={() => setShowPicker(false)} />}
      </section>

      <section>
        <h2 className="font-semibold mb-2">Recruiter — Eligible Programming Languages</h2>
        <div className="bg-white rounded-xl p-4">
          <AssessmentInfoPanel assessment={{ coding_enabled: true, coding_languages: ['Java', 'Python', 'C++', 'C#', 'Go', 'SQL'] }} />
        </div>
      </section>
    </div>
  );
}
