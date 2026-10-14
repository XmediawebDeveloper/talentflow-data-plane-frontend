'use client';

// TEMPORARY preview of the HR Questions step. The markup below is copied from
// CandidateAssessmentPortal.tsx (case 'hr_questions') with sample questions, since
// that step only renders inside the live candidate flow. Delete after review.
import { useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  CANDIDATE_PAGE,
  RECRUITER_SHELL,
  RECRUITER_WRAP,
  RECRUITER_CARD,
  PAGE_ICON_TILE,
  ICON,
  T_PAGE_TITLE,
  T_PAGE_SUBTITLE,
} from '@/lib/constants/candidateLayout';
import CandidateHeader from '@/components/candidate/CandidateHeader';
import CandidateStepper from '@/components/candidate/CandidateStepper';

const hrQuestions = [
  { key: 'about', text: 'Tell me about yourself', type: 'text' },
  { key: 'industry', text: 'Describe your industry experience relevant to this role', type: 'text' },
  { key: 'why', text: 'Why should we hire you?', type: 'text' },
  { key: 'salary', text: 'What is your expected salary?', type: 'text' },
  { key: 'relocate', text: 'Are you willing to relocate?', type: 'yes_no' },
];

export default function TmpHrPreview() {
  const [hrAnswers, setHrAnswers] = useState<Record<string, string>>({});
  const isSavingHRAnswers = false;
  const handleContinueFromHRQuestions = () => {};
  return (
        <div className={CANDIDATE_PAGE}>
          {/* Header + stepper: the shared pair. This step used to draw a bare
              "HR Questions" title with no logo at all, so the product name
              vanished in the middle of the flow, and its own stepper used 24px
              dots and a literal "checkmark" character where every other screen
              used 32px dots and the Check glyph. The "No Timer" badge moves
              into the header's slot beside the help link. */}
          <CandidateHeader>
            <span className="text-xs font-medium text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 px-2 py-1 rounded whitespace-nowrap">
              No Timer
            </span>
          </CandidateHeader>
          <CandidateStepper current={3} />

          {/* The recruiter page shell. */}
          <main className={RECRUITER_SHELL}>
            <div className={RECRUITER_WRAP}>
              <div className={RECRUITER_CARD}>

              {/* Page header — the recruiter pattern. */}
              <div className="flex items-start gap-3 mb-5">
                <div className={PAGE_ICON_TILE}>
                  <ClipboardList className={`${ICON} text-brand-blue`} />
                </div>
                <div className="min-w-0">
                  <h1 className={T_PAGE_TITLE}>HR Questions</h1>
                  <p className={T_PAGE_SUBTITLE}>
                    Please answer the following questions. All questions are optional and untimed.
                    Your responses will be shared with the recruiter.
                  </p>
                </div>
              </div>


              {/* Two questions per row from `sm` up, one per row on phones. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {hrQuestions.map((q: any, idx: number) => {
                  const isYesNo = q.type === 'yes_no' || q.type === 'Yes/No';
                  const selectedAnswer = hrAnswers[q.key] || '';
                  return (
                  <div key={idx} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <span className="w-6 h-6 flex items-center justify-center bg-gray-800 text-white rounded text-xs font-medium flex-shrink-0 mt-0.5">{idx + 1}</span>
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <p className="text-sm font-medium text-gray-900">{q.text}</p>
                          <span className="px-2 py-0.5 rounded text-2xs font-medium flex-shrink-0 ml-2 bg-gray-100 text-gray-500">
                            {isYesNo ? 'Yes/No' : 'Text'}
                          </span>
                        </div>
                        {isYesNo ? (
                          <div className="flex flex-wrap gap-2">
                            {['Yes', 'No'].map((option) => (
                              <button
                                key={option}
                                type="button"
                                onClick={() => {
                                  setHrAnswers((prev) => ({
                                    ...prev,
                                    [q.key]: option
                                  }));
                                }}
                                /* The design system's `sm` button size (h-8, text-xs), not
                                   full-width halves — a two-word answer does not need a
                                   bar across the card. */
                                className={`h-8 min-w-[4.5rem] px-4 rounded-lg border text-xs font-medium transition-all ${
                                  selectedAnswer === option
                                    ? 'border-gray-800 bg-gray-800 text-white'
                                    : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                                }`}
                              >{option}</button>
                            ))}
                          </div>
                        ) : (
                          <textarea
                            placeholder="Type your answer here..."
                            rows={3}
                            value={selectedAnswer}
                            onChange={(e) => {
                              const value = e.target.value;
                              setHrAnswers((prev) => ({
                                ...prev,
                                [q.key]: value
                              }));
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 text-black"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>

            {/* Action row — the recruiter footer rule. */}
            <div className="flex justify-end gap-3 pt-4 mt-5 border-t border-gray-100">
              <Button
                type="button"
                variant="primary"
                onClick={handleContinueFromHRQuestions}
                disabled={isSavingHRAnswers}
                className="px-6"
              >
                {isSavingHRAnswers ? 'Saving Answers...' : 'Continue to Assessment'}
              </Button>
            </div>

              </div>
            </div>
          </main>
        </div>
  );
}
