"use client";

/**
 * AII17 — Post-Interview Candidate Feedback.
 *
 * A concise modal shown OVER the completion screen once the interview is done.
 * Three whole-star 1-5 ratings + an optional short comment.
 *
 * Whole stars only: the story allows half-stars "only if supported by the
 * product design", and nothing in this product has a half-star control (they
 * are also a poor touch target and awkward for keyboard/screen-reader users).
 *
 * Dismissal is always available (×, Esc, backdrop) and costs the candidate
 * nothing — the backend endpoint writes only the feedback column, so skipping
 * cannot affect their result, evaluation, or application status (AC6).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Star, X, CheckCircle, Loader2 } from "lucide-react";
import { candidateAIInterviewService } from "@/lib/services/candidateAIInterviewService";

const COMMENT_MAX = 500;

/** The three rated dimensions, in the order the story lists them. */
const RATING_ROWS = [
  { key: "overall", label: "How was your interview experience?" },
  { key: "question_quality", label: "How would you rate the interview questions?" },
  { key: "ai_experience", label: "How was your experience interacting with the AI interviewer?" },
] as const;

type RatingKey = (typeof RATING_ROWS)[number]["key"];

interface StarRatingProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

/** One labelled 1-5 whole-star row.
 *
 *  Built as a real radiogroup rather than clickable divs so it is keyboard
 *  reachable and announced correctly. Hover preview is visual only — the
 *  committed value is what `value` says. */
function StarRating({ label, value, onChange, disabled }: StarRatingProps) {
  const [hovered, setHovered] = useState(0);
  const shown = hovered || value;

  return (
    <div>
      <p className="text-sm font-medium text-gray-800 mb-2">{label}</p>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex items-center gap-1"
        onMouseLeave={() => setHovered(0)}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} star${star === 1 ? "" : "s"}`}
            disabled={disabled}
            onMouseEnter={() => setHovered(star)}
            onFocus={() => setHovered(star)}
            onBlur={() => setHovered(0)}
            onClick={() => onChange(star)}
            className="p-1 rounded-md transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            <Star
              className={`w-7 h-7 transition-colors ${
                star <= shown
                  ? "fill-amber-400 text-amber-400"
                  : "fill-transparent text-gray-300"
              }`}
            />
          </button>
        ))}
        {value > 0 && (
          <span className="ml-2 text-xs font-medium text-gray-500 tabular-nums">
            {value}/5
          </span>
        )}
      </div>
    </div>
  );
}

interface InterviewFeedbackModalProps {
  token: string;
  /** Called when the dialog should disappear — after a successful submit, or
   *  on any dismissal. The caller decides whether to remember that. */
  onClose: () => void;
}

export default function InterviewFeedbackModal({ token, onClose }: InterviewFeedbackModalProps) {
  const [ratings, setRatings] = useState<Record<RatingKey, number>>({
    overall: 0,
    question_quality: 0,
    ai_experience: 0,
  });
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Submit needs at least the OVERALL rating — that is the one question the
  // story treats as the point of the dialog. The other two stay optional.
  const canSubmit = ratings.overall > 0 && !submitting;

  const handleClose = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    onClose();
  }, [onClose]);

  // Esc dismisses, exactly like the × button. Not trapped while submitting —
  // a candidate is never held in this dialog against their will.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) handleClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleClose, submitting]);

  useEffect(() => () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }, []);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await candidateAIInterviewService.submitFeedback(token, {
        overall: ratings.overall || null,
        question_quality: ratings.question_quality || null,
        ai_experience: ratings.ai_experience || null,
        comment,
      });
      if (!result?.success) throw new Error(result?.message || "Failed to save feedback");
      setSubmitted(true);
      // Brief confirmation, then close itself so the candidate is left on the
      // completion screen rather than having to dismiss one more thing.
      closeTimerRef.current = setTimeout(() => onClose(), 2500);
    } catch {
      setError("Could not save your feedback. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      // Backdrop click dismisses; clicks inside the card must not bubble here.
      onClick={() => { if (!submitting) handleClose(); }}
      style={{ colorScheme: "light" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {submitted ? (
          // ── Confirmation state (AC5) ──
          <div className="p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-7 h-7 text-green-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Thank you for your feedback!</h2>
            <p className="text-sm text-gray-500">We appreciate you taking the time.</p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between px-6 pt-6 pb-2">
              <div>
                <h2 id="feedback-title" className="text-lg font-bold text-gray-900">
                  Quick feedback
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Optional, and it won&apos;t affect your result.
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                disabled={submitting}
                aria-label="Close feedback"
                className="p-1.5 -mr-1.5 -mt-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-50 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-4 space-y-5">
              {RATING_ROWS.map((row) => (
                <StarRating
                  key={row.key}
                  label={row.label}
                  value={ratings[row.key]}
                  disabled={submitting}
                  onChange={(value) => setRatings((prev) => ({ ...prev, [row.key]: value }))}
                />
              ))}

              <div>
                <label htmlFor="feedback-comment" className="block text-sm font-medium text-gray-800 mb-2">
                  Any quick feedback? <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <textarea
                  id="feedback-comment"
                  value={comment}
                  // Hard-capped here as well as by maxLength so a paste can't
                  // exceed the limit the backend also enforces.
                  onChange={(e) => setComment(e.target.value.slice(0, COMMENT_MAX))}
                  maxLength={COMMENT_MAX}
                  disabled={submitting}
                  rows={3}
                  placeholder="Tell us anything that would make this better…"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-50"
                />
                <p className="text-[11px] text-gray-400 mt-1 text-right tabular-nums">
                  {comment.length}/{COMMENT_MAX}
                </p>
              </div>

              {error && (
                <p className="text-sm text-red-600" role="alert">{error}</p>
              )}
            </div>

            <div className="px-6 pb-6 pt-1 flex items-center gap-3">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting ? "Submitting…" : "Submit Feedback"}
              </button>
              <button
                type="button"
                onClick={handleClose}
                disabled={submitting}
                className="px-4 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50 transition-colors"
              >
                Skip
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
