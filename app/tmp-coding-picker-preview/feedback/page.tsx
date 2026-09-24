'use client';

// TEMPORARY preview of the real Quick Feedback popup (assessment wording). Delete after review.
import { useState } from 'react';
import InterviewFeedbackModal, { ASSESSMENT_RATING_HINTS, ASSESSMENT_RATING_PROMPTS } from '@/components/candidate/InterviewFeedbackModal';

export default function TmpFeedbackPreview() {
  const [open, setOpen] = useState(true);
  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <button className="px-4 py-2 rounded-lg bg-brand-blue text-white text-sm" onClick={() => setOpen(true)}>
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
