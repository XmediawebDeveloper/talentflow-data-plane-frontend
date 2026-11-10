'use client';

// TEMPORARY preview of the real Quick Feedback popup (assessment wording). Delete after review.
import { useState } from 'react';
import InterviewFeedbackModal, { ASSESSMENT_RATING_HINTS, ASSESSMENT_RATING_PROMPTS } from '@/components/candidate/InterviewFeedbackModal';

export default function TmpFeedbackPreview() {
  const [open, setOpen] = useState(true);
  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <button className="tf-btn tf-btn-primary px-4 py-2 bg-brand-blue text-sm whitespace-normal shadow-none gap-0 font-normal hover:bg-brand-blue" onClick={() => setOpen(true)}>
        Reopen feedback popup
      </button>
      {open && (
        <InterviewFeedbackModal
          token="preview"
          prompts={ASSESSMENT_RATING_PROMPTS}
          hints={ASSESSMENT_RATING_HINTS}
          onSubmit={async () => ({ success: true, message: 'ok' })}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
