"use client";

/**
 * AII17 — Post-Interview Candidate Feedback.
 *
 * A concise modal shown OVER the completion screen once the interview is done.
 * Three ratings + an optional short comment. Also used for the AI Assessment
 * flow — pass `prompts` and `onSubmit` to retarget it.
 *
 * HALF-STARS SUPPORTED: 0.5 … 5.0 in 0.5 steps. Each star is two hit areas
 * (left = X.5, right = X.0), so every value is reachable by pointer, and each
 * one is a real radio so it is reachable and announced by keyboard/screen
 * readers too. The backend accepts and stores the same 0.5 steps, so a rating
 * never gets silently rounded on its way to the database.
 *
 * Dismissal is always available (×, Esc, backdrop) and costs the candidate
 * nothing — the backend endpoint writes only the feedback column, so skipping
 * cannot affect their result, evaluation, or application status (AC6).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Star, X, CheckCircle, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { candidateAIInterviewService } from "@/lib/services/candidateAIInterviewService";

const COMMENT_MAX = 500;

/** The three rated dimensions, in the order the story lists them. */
const RATING_ROWS = [
  { key: "overall", label: "How was your interview experience?" },
  { key: "question_quality", label: "How would you rate the interview questions?" },
  { key: "ai_experience", label: "How was your experience interacting with the AI interviewer?" },
] as const;

type RatingKey = (typeof RATING_ROWS)[number]["key"];

/** The AI Assessment wording for the same three ratings. The stored KEYS are
 *  identical on purpose — the Super Admin dashboard reads both modules through
 *  one contract, so only the prompts differ, never the field names. */
export const ASSESSMENT_RATING_PROMPTS: Record<RatingKey, string> = {
  overall: "How was your assessment experience?",
  question_quality: "How would you rate the assessment questions?",
  ai_experience: "How was your experience using the assessment platform?",
};

export type FeedbackRatings = Record<RatingKey, number>;

interface StarRatingProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

/** One labelled HALF-STAR rating row: 0.5 … 5.0 in 0.5 steps.
 *
 *  Each of the five stars is split into two hit areas — the left half commits
 *  X.5, the right half commits X.0 — so all ten values are reachable. Every hit
 *  area is a real `role="radio"` button inside one radiogroup, which keeps the
 *  control keyboard reachable and correctly announced ("2.5 stars"); a pair of
 *  clickable divs would be neither.
 *
 *  Hover preview is visual only — the committed value is what `value` says. */
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
        {[1, 2, 3, 4, 5].map((star) => {
          const full = shown >= star;
          const half = !full && shown >= star - 0.5;
          return (
            <span key={star} className="relative inline-block w-7 h-7">
              {/* Empty outline underneath. */}
              <Star className="absolute inset-0 w-7 h-7 fill-transparent text-gray-300" />
              {/* Filled star clipped to 50% for a half, 100% for a full one.
                  Clipping a real star keeps the shape identical to the outline
                  — a separate "half star" glyph never lines up exactly. */}
              {(full || half) && (
                <span
                  className="absolute inset-y-0 left-0 overflow-hidden"
                  style={{ width: full ? "100%" : "50%" }}
                  aria-hidden="true"
                >
                  <Star className="w-7 h-7 fill-amber-400 text-amber-400 transition-colors" />
                </span>
              )}
              {/* Two invisible hit areas stacked over the glyph. */}
              {[star - 0.5, star].map((v, idx) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={value === v}
                  aria-label={`${v} star${v === 1 ? "" : "s"}`}
                  disabled={disabled}
                  onMouseEnter={() => setHovered(v)}
                  onFocus={() => setHovered(v)}
                  onBlur={() => setHovered(0)}
                  onClick={() => onChange(v)}
                  className={`absolute inset-y-0 w-1/2 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed ${
                    idx === 0 ? "left-0" : "left-1/2"
                  }`}
                />
              ))}
            </span>
          );
        })}
        {value > 0 && (
          <span className="ml-2 text-xs font-medium text-gray-500 tabular-nums">
            {value.toFixed(1)}/5
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
  /** Override the three rating prompts. Defaults to the AI Interview wording;
   *  pass ASSESSMENT_RATING_PROMPTS for the assessment flow. Only the wording
   *  changes — the submitted field names stay identical across both modules. */
  prompts?: Record<RatingKey, string>;
  /** Override the submit call. Defaults to the AI Interview endpoint. */
  onSubmit?: (payload: {
    overall: number | null;
    question_quality: number | null;
    ai_experience: number | null;
    comment: string;
  }) => Promise<{ success: boolean; message: string }>;
}

export default function InterviewFeedbackModal({
  token,
  onClose,
  prompts,
  onSubmit,
}: InterviewFeedbackModalProps) {
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
      const submit = onSubmit
        ?? ((payload: Parameters<NonNullable<typeof onSubmit>>[0]) =>
              candidateAIInterviewService.submitFeedback(token, payload));
      const result = await submit({
        overall: ratings.overall || null,
        question_quality: ratings.question_quality || null,
        ai_experience: ratings.ai_experience || null,
        comment,
      });
      // The endpoint answers HTTP 200 even when it could not save (so a
      // candidate never sees a raw error page), so success is carried in the
      // BODY — a 200 alone does not mean it was stored.
      if (!result?.success) throw new Error(result?.message || "Failed to save feedback");
      setSubmitted(true);
      // Brief confirmation, then close itself so the candidate is left on the
      // completion screen rather than having to dismiss one more thing.
      closeTimerRef.current = setTimeout(() => onClose(), 2500);
    } catch (err) {
      // Log the real reason — without this a failed save is indistinguishable
      // from "the thank-you message never appeared", which is exactly how the
      // missing-column case presented. The server logs the matching [FEEDBACK]
      // line with the underlying exception.
      console.error("[FEEDBACK] submit failed:", err);
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
        className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {submitted ? (
          // ── Confirmation state (AC5) ──
          <div className="p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-success-subtle flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-7 h-7 text-success" />
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
                  label={prompts?.[row.key] ?? row.label}
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
                <p className="text-2xs text-gray-400 mt-1 text-right tabular-nums">
                  {comment.length}/{COMMENT_MAX}
                </p>
              </div>

              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-destructive-subtle border border-destructive-line"
                >
                  <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-sm text-destructive leading-snug">{error}</p>
                </div>
              )}
            </div>

            <div className="px-6 pb-6 pt-1 flex items-center gap-3">
              <Button
                type="button"
                variant="primary"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="flex-1"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting ? "Submitting…" : "Submit Feedback"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={handleClose}
                disabled={submitting}
              >
                Skip
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
