/**
 * AI Interview mode helpers.
 *
 * IMPORTANT: the backend does NOT store a separate "interview_mode" field on
 * the config — instead, `duration_minutes` doubles as the mode selector:
 *
 *   duration_minutes === FLEXIBLE_DURATION_SENTINEL (0)
 *       => Flexible / conversational mode (no hard wall-clock limit).
 *
 *   duration_minutes > 0
 *       => Timed / fixed mode with the given minutes as the ceiling.
 *
 * This module is the single place where that convention is encoded on the
 * frontend. Use `isFlexibleDuration()` and `modeFromDuration()` everywhere
 * instead of comparing `duration_minutes === 0` inline — that magic-number
 * check is what used to confuse reviewers.
 *
 * Mirrors app/schemas/ai_interview.py (FLEXIBLE_DURATION_SENTINEL) on the
 * backend. Keep the two in sync.
 */

export type InterviewMode = 'fixed' | 'flexible';

/** Sentinel duration value meaning "flexible / no hard time limit". */
export const FLEXIBLE_DURATION_SENTINEL = 0 as const;

/** Default ceiling applied in timed mode (minutes). */
export const DEFAULT_TIMED_DURATION_MINUTES = 30;

export function isFlexibleDuration(durationMinutes: number | null | undefined): boolean {
  return (durationMinutes ?? FLEXIBLE_DURATION_SENTINEL) === FLEXIBLE_DURATION_SENTINEL;
}

export function modeFromDuration(durationMinutes: number | null | undefined): InterviewMode {
  return isFlexibleDuration(durationMinutes) ? 'flexible' : 'fixed';
}

export function durationFromMode(mode: InterviewMode, timedMinutes: number): number {
  return mode === 'flexible' ? FLEXIBLE_DURATION_SENTINEL : timedMinutes;
}
