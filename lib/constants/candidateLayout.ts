/**
 * The candidate-facing assessment pages, expressed in the RECRUITER
 * application's own values.
 *
 * Every string below is copied from the signed-in UI — `components/Header.tsx`
 * for the bar, and the page shell that `components/Assessments.tsx` and
 * `components/assessments/AllAssessmentsTable.tsx` both open with — so a
 * candidate page is the same product as the page the recruiter who invited
 * them was just looking at. Nothing here is a candidate-specific design.
 *
 * The structure a candidate page follows is the recruiter's:
 *
 *     Header  →  Page container  →  White page card  →  Sections  →  Cards
 *
 * ── What this replaced ────────────────────────────────────────────────────
 * The flow used to be standalone full-bleed pages: edge-to-edge tinted bands,
 * a blue gradient hero with a `text-4xl` title, 1152px content, and a header
 * sized to whatever logo happened to be in it. None of those measurements
 * appears anywhere in the recruiter UI, which is why the two halves of the
 * product did not look related.
 *
 * ── Colours ───────────────────────────────────────────────────────────────
 * Five global tokens, each meaning one thing, plus neutral grey:
 *
 *   brand-blue    primary actions, the current step, anything interactive
 *   brand-cyan    the one secondary accent
 *   success       completed steps, passed checks
 *   warning       cautions the candidate must read
 *   destructive   failures and blocked states
 */

/* ── Shell ────────────────────────────────────────────────────────────────
 * `components/Assessments.tsx` and `AllAssessmentsTable.tsx` both open with
 * exactly these three, in this order. The white rounded card on a slate page
 * is the recruiter page container.
 */

/** The page background behind the card. */
export const RECRUITER_SHELL = 'flex-1 overflow-x-clip bg-slate-50';

/** The 1400px column everything on a recruiter page lives in. */
export const RECRUITER_WRAP = 'mx-auto w-full max-w-[1400px]';

/** The white page card itself, with the recruiter's own padding and margins. */
export const RECRUITER_CARD = 'p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl';

/**
 * A full-width BAR's inner row — the header and the stepper. Taken from the
 * signed-in header's row, whose padding steps 12 → 16 → 32px. The bar's own
 * background stays edge to edge; only this row is capped, which is what puts
 * the logo on the same left edge as the page card below it.
 */
export const RECRUITER_BAR_ROW = 'mx-auto w-full max-w-[1400px] px-3 sm:px-4 md:px-8';

/** Kept as the name the candidate screens already import. */
export const CANDIDATE_CONTAINER = RECRUITER_BAR_ROW;

/** The page root: the slate background, full height, column layout. */
export const CANDIDATE_PAGE = 'min-h-[100dvh] flex flex-col bg-slate-50';

/* ── Header ───────────────────────────────────────────────────────────────
 * `components/Header.tsx`, value for value.
 */

/** Bar height: 56 / 64 / 72px. A fixed height, not padding — see CandidateHeader. */
export const RECRUITER_HEADER_H = 'h-14 sm:h-16 lg:h-[72px]';

/** Logo height: 28 / 40 / 48px. */
export const RECRUITER_LOGO_H = 'h-7 sm:h-10 lg:h-12 w-auto';

/* ── Typography ───────────────────────────────────────────────────────────
 * The recruiter hierarchy. Note how restrained the top of it is: a recruiter
 * PAGE heading is `text-lg sm:text-xl font-semibold`, not a display size. The
 * candidate heroes were `text-3xl lg:text-4xl font-bold`, which is the single
 * loudest signal that those pages came from somewhere else.
 */

/** Page heading — one per screen. */
export const T_PAGE_TITLE = 'text-lg sm:text-xl font-semibold text-gray-900 mb-0.5 tracking-tight';

/** The line under a page heading. */
export const T_PAGE_SUBTITLE = 'text-xs sm:text-sm text-gray-600';

/** Section heading — names a block within the page. */
export const T_SECTION = 'text-sm sm:text-base font-semibold text-gray-900 tracking-tight';

/** The upper-case rubric above a group ("ASSESSMENT ROUNDS"). */
export const T_EYEBROW = 'text-xs font-semibold text-gray-500 uppercase tracking-wider';

/** A card's own title. */
export const T_CARD_TITLE = 'text-sm font-medium text-gray-900';

/** Body copy. */
export const T_BODY = 'text-sm text-gray-700';

/** Helper / secondary text. */
export const T_HELP = 'text-xs sm:text-sm text-gray-600';

/* ── Cards ────────────────────────────────────────────────────────────────
 * The recruiter list card: hairline border, the near-invisible ring, and the
 * brand-tinted shadow that every panel in the signed-in UI carries.
 */
export const CARD = 'bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-3 sm:p-5';

/** The same card as a quiet surface inside an already-white page card. */
export const CARD_MUTED = 'bg-slate-50 rounded-xl border border-gray-100 ring-1 ring-black/[0.02] p-3 sm:p-4';

/* ── Icons ────────────────────────────────────────────────────────────────
 * The recruiter page-header tile is 36px holding a 16px glyph. The candidate
 * pages had 40–64px tiles holding 20–32px glyphs, which is most of why their
 * cards were so much taller than anything on the recruiter side.
 */

/** The tile an icon sits in. */
export const ICON_TILE = 'w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ring-1';

/** The glyph inside `ICON_TILE`, and the app's default icon size. */
export const ICON = 'w-4 h-4';

/** A glyph inline with text. */
export const ICON_INLINE = 'w-4 h-4 shrink-0';

/**
 * The page-header tile, exactly as the recruiter pages draw it — hidden below
 * `sm`, brand-blue wash, brand ring.
 */
export const PAGE_ICON_TILE =
  'hidden sm:flex w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 items-center justify-center shrink-0';

/* ── Icon tile tones ──────────────────────────────────────────────────────
 * Wash + ring + foreground, the treatment the recruiter tiles use. Each is a
 * global token with its own dark-mode value.
 */
export const TILE_BRAND = 'bg-brand-blue/10 ring-brand-blue/15 text-brand-blue';
export const TILE_ACCENT = 'bg-brand-cyan/10 ring-brand-cyan/15 text-brand-cyan';
export const TILE_SUCCESS = 'bg-success-subtle ring-success-line text-success';
export const TILE_WARNING = 'bg-warning-subtle ring-warning-line text-warning';
export const TILE_DANGER = 'bg-destructive-subtle ring-destructive-line text-destructive';
