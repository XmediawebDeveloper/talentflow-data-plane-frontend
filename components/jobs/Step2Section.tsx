import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/*
 * The JD wizard's Step 2 / Review section chrome, shared so the Job Details
 * page's Extracted Data Summary is drawn with exactly the same card, toned
 * icon tile and heading as the Review step's summary.
 */

// Step 2's section cards: the step's white card with a 2px edge in the design
// system's `--border` token (globals.css, dark value included) so each
// section's boundary reads clearly.
export const STEP2_CARD_CLASS =
  'bg-white dark:bg-slate-900 rounded-xl border-2 border-border ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-4 sm:p-6';

// One brand tone per Step 2 section, so the three cards are told apart at a
// glance. Each pairs a tinted tile with its glyph colour, as the Assessment
// configure step's fact tiles do; every value is a globals.css brand token.
export const STEP2_SECTION_TONES = {
  blue: { tile: 'bg-brand-blue/10 ring-1 ring-brand-blue/15', icon: 'text-brand-blue' },
  cyan: { tile: 'bg-brand-cyan/10 ring-1 ring-brand-cyan/15', icon: 'text-brand-cyan' },
  orange: { tile: 'bg-brand-orange/10 ring-1 ring-brand-orange/15', icon: 'text-brand-orange-deep' },
  success: { tile: 'bg-success-subtle ring-1 ring-success-line', icon: 'text-success' },
} as const;

/**
 * A Step 2 / Step 3 section card's heading row: toned icon tile, title, one-line
 * hint. `badge` sits beside the title, `actions` at the row's right end (wrapping
 * under it on a narrow screen); `spacing` replaces the default gap below.
 *
 * `inlineActions` keeps `actions` on the heading's line at every width, centred
 * on the title + hint block — for a small affordance like a collapse chevron,
 * which must never drop under the heading. The heading block takes the row's
 * remaining width (`flex-1 min-w-0`) and its hint wraps inside it instead.
 * Without it the row wraps (fine for Edit buttons), and because the heading
 * block is sized to its text, a long hint on a phone pushed the actions onto a
 * line of their own.
 */
export const Step2SectionHeader = ({
  icon: Icon, title, hint, tone = 'blue', badge, actions, spacing = 'mb-4 sm:mb-5', inlineActions = false,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  tone?: keyof typeof STEP2_SECTION_TONES;
  badge?: ReactNode;
  actions?: ReactNode;
  spacing?: string;
  inlineActions?: boolean;
}) => (
  <div className={`flex ${inlineActions ? 'flex-nowrap items-center' : 'flex-wrap items-start'} justify-between gap-3 ${spacing}`}>
    <div className={`flex items-start gap-3 min-w-0${inlineActions ? ' flex-1' : ''}`}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${STEP2_SECTION_TONES[tone].tile}`}>
        <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${STEP2_SECTION_TONES[tone].icon}`} />
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-slate-50 tracking-tight">{title}</h2>
          {badge}
        </div>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">{hint}</p>
      </div>
    </div>
    {/* inlineActions: a flex wrapper, so the action centres on the heading
        block rather than sitting on a text baseline a few px high. */}
    {actions && <div className={`flex-shrink-0${inlineActions ? ' flex items-center' : ''}`}>{actions}</div>}
  </div>
);
