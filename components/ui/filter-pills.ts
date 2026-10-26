/**
 * The toolbar "pill" button system, extracted from the Job Openings page
 * (components/JobsListing.tsx) — the master list — so any other job-opening
 * surface that needs the same status-tab / segmented-toggle controls reuses one
 * source of truth instead of re-deriving the colour / radius / size values.
 *
 * These are intentionally plain class-string helpers (not components): the
 * controls they style are ordinary <button>s whose onClick/children differ per
 * caller, so sharing the chrome — not the markup — is what keeps them identical
 * without constraining their behaviour.
 */

/**
 * The status tabs (All Jobs / Published / Draft / Disabled / Archived) are the
 * master "tab pill" style. Every pill-shaped control in the toolbar reuses this
 * one helper so they read as a single button system. `active` drives the
 * selected look.
 */
// 14px at every width: phones used to get 12px here while the search box and
// dropdowns in the same toolbar were 14px.
export const tabPill = (active: boolean): string =>
  `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
    active
      ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25'
      : 'bg-brand-blue/5 text-gray-700 hover:bg-brand-blue/10 hover:text-brand-blue'
  }`;

/**
 * The segmented toggle — one connected control whose options share a single
 * tinted track and whose active option lifts to a white chip (e.g. All / AI
 * Generated / Manual). Defined once so every segment reuses the same style.
 */
export const SEGMENT_TOGGLE = 'flex items-center bg-brand-blue/5 ring-1 ring-brand-blue/10 rounded-lg p-1';
export const segmentBtn = (active: boolean): string =>
  `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm font-medium transition-all ${
    active
      ? 'bg-white text-brand-blue-2 shadow-sm shadow-brand-blue/10'
      : 'text-gray-600 hover:text-brand-blue'
  }`;
