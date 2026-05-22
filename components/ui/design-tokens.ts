/**
 * Design tokens — single source of truth for class strings used across the app.
 * Master reference: /recruitment/job-openings (components/JobsListing.tsx).
 *
 * Import these instead of hand-writing class strings so that future tweaks
 * propagate from one place.
 */

export const tokens = {
  // Page-level surfaces
  pageBg: 'bg-slate-50 dark:bg-slate-950',

  // Card / panel surface (used by SurfaceCard, PageToolbar)
  surface:
    'bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5',

  // Softer surface variant — when nesting inside another surface
  surfaceMuted:
    'bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-gray-200 dark:border-slate-700',

  // Borders
  borderDefault: 'border-gray-300 dark:border-slate-700',
  borderSoft: 'border-gray-200 dark:border-slate-700/60',
  borderDivider: 'border-gray-200 dark:border-slate-700/60',

  // Text scale
  textHeading: 'text-gray-900 dark:text-slate-50',
  textBody: 'text-gray-700 dark:text-slate-300',
  textMuted: 'text-gray-600 dark:text-slate-400',
  textSubtle: 'text-gray-500 dark:text-slate-500',

  // Inputs — apply alongside w-full, height utilities, etc.
  input:
    'bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg text-sm text-black dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 transition',

  // Primary button (matches "Create New Job" on job-openings)
  buttonPrimary:
    'px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-all flex items-center justify-center gap-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed',

  // Secondary button — neutral
  buttonSecondary:
    'px-4 py-2 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 border border-gray-300 dark:border-slate-700 rounded-lg transition-all flex items-center justify-center gap-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed',

  // Ghost button — minimal
  buttonGhost:
    'px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-200 rounded-lg transition-colors text-sm font-medium',

  // Danger button
  buttonDanger:
    'px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg shadow-md shadow-red-600/25 transition-all flex items-center justify-center gap-2 text-sm font-medium disabled:opacity-50',

  // Tab item (inside PageToolbar.Tabs)
  tabActive: 'bg-brand-blue text-white shadow-sm',
  tabInactive:
    'text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800',

  // Table base
  tableHead:
    'bg-gray-50 dark:bg-slate-800/50 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-400 border-b border-gray-200 dark:border-slate-700',
  tableRow:
    'border-b border-gray-200 dark:border-slate-700/60 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors',
  tableCell: 'px-3 py-2.5 text-sm text-gray-700 dark:text-slate-300',

  // Radii — prefer these for consistency
  radiusSm: 'rounded-md',
  radiusMd: 'rounded-lg',
  radiusLg: 'rounded-xl',
  radiusFull: 'rounded-full',

  // Shadows
  shadowSoft: 'shadow-sm',
  shadowCard: 'shadow-sm shadow-brand-blue/5',
  shadowElevated: 'shadow-md',

  // Spacing scale (gap/padding helpers)
  gapTight: 'gap-2',
  gapDefault: 'gap-3 sm:gap-4',
  gapSection: 'gap-4 sm:gap-5',

  paddingCard: 'p-4 sm:p-5',
  paddingPage: 'px-4 py-4 sm:px-6 sm:py-6',
} as const;

export type DesignTokens = typeof tokens;
