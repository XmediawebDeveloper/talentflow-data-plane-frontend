/**
 * One look for the Create / Send Assessment and Create / Send AI Interview
 * actions wherever they render, so every page reuses these constants instead
 * of a per-file copy.
 *
 * Reference: the candidate view opened from a job's AI Talent Match Result
 * (app/(dashboard)/recruitment/resume-view/[id]/page.tsx) — white, a light
 * brand-blue (Assessment) or brand-cyan (AI Interview) outline and text,
 * tinting on hover; greyed out when disabled. The `disabled:` variants carry
 * that greyed state, so set `disabled` on the button rather than swapping
 * classes.
 */
const CREATE_SEND_BTN_BASE =
  'flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium whitespace-nowrap bg-white border disabled:bg-gray-50 disabled:border-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed';

const BRAND_BLUE_BTN = `${CREATE_SEND_BTN_BASE} border-brand-blue/40 text-brand-blue hover:bg-brand-blue/5 disabled:hover:bg-gray-50`;

export const CREATE_SEND_BUTTON_CLASS = {
  assessment: BRAND_BLUE_BTN,
  interview: `${CREATE_SEND_BTN_BASE} border-brand-cyan/40 text-brand-cyan hover:bg-brand-cyan/5 disabled:hover:bg-gray-50`,
} as const;

/**
 * Any other action sharing a row with the Create / Send buttons (e.g. the
 * candidate View Result header's Scorecard): the same height, padding, type
 * and radius, in the reference's brand-blue outline, so the row reads as one
 * set of buttons.
 */
export const CANDIDATE_ACTION_BUTTON_CLASS = BRAND_BLUE_BTN;

/**
 * The same two colours on a ⋮ menu item's icon, through the menu-icon tokens
 * in app/globals.css: --menu-icon-view is brand blue, --menu-icon-ai brand cyan.
 */
export const CREATE_SEND_MENU_ICON_CLASS = {
  assessment: 'text-menu-icon-view',
  interview: 'text-menu-icon-ai',
} as const;
