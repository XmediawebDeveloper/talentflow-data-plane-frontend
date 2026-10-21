/**
 * The geometry every Track popup shares.
 *
 * Four dialogs open from a Track button — the Assessments tracker, the AI
 * Interviews tracker, and the two job-scoped trackers on Job Details — and all
 * four carried this exact class string, copied. Copied strings drift, and a
 * sizing rule that has to hold "the popup does not move" cannot afford to be
 * true in three places and stale in the fourth, so it lives here once.
 *
 * Nothing about the look changed when this was extracted; the only addition is
 * the min-height, which is what stops the dialog resizing as it opens.
 */

/**
 * The dialog panel.
 *
 * WIDTH is a breakpoint ladder that no state touches, so it cannot move.
 *
 * HEIGHT is content-driven under a viewport cap, which is right at rest — a
 * three-invite list must not stretch the dialog down a large monitor — but it
 * used to mean the box resized twice on the way in: a short loading spinner
 * first, then a full table. Because these dialogs are vertically centred, every
 * height change moves BOTH edges at once, so it reads as the popup jumping
 * rather than growing.
 *
 * The min-height is what settles that. It is a floor, not the fixed dvh these
 * dialogs deliberately moved away from: tall enough that the loading state, an
 * empty result and a normal page of rows are all the same size, low enough that
 * a large monitor still gets a dialog sized to its content rather than to the
 * screen.
 *
 * `min()` against the viewport is load-bearing, not decoration. A bare
 * `min-h-[560px]` would beat `max-h-[92dvh]` on a short window — CSS resolves
 * min-height after max-height — and push the footer off screen. Clamping the
 * floor to 88dvh keeps it under every cap below.
 */
export const TRACKER_DIALOG_PANEL_CLASS =
  'bg-white dark:bg-slate-900 rounded-2xl shadow-2xl shadow-brand-blue/10 '
  + 'border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] '
  + 'w-full sm:max-w-2xl md:max-w-4xl lg:max-w-5xl xl:max-w-6xl '
  + 'min-h-[min(720px,88dvh)] max-h-[92dvh] sm:max-h-[calc(100dvh-2rem)] md:max-h-[calc(100dvh-3rem)] '
  + 'overflow-hidden flex flex-col';

/**
 * What a Track popup shows instead of its table — the loading spinner, and the
 * "no invitations" empty state.
 *
 * `flex-1`, so it FILLS the body rather than sitting in a 200px box with the
 * dialog collapsed around it. That is the other half of the min-height above:
 * the floor reserves the space, this is what occupies it, and the swap from
 * spinner to table then happens inside a box that does not change size.
 *
 * Without it the dialog opened at spinner height and jumped to table height a
 * moment later, which is the jump this pair removes.
 */
export const TRACKER_DIALOG_PLACEHOLDER_CLASS =
  'flex-1 min-h-0 flex flex-col items-center justify-center text-center py-8 sm:py-12';
