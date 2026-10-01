'use client';

import type { LucideIcon } from 'lucide-react';
import { ListFilter, FilterX } from 'lucide-react';

/**
 * The stat row that sits at the top of every invite tracker — and the tracker's
 * primary status filter.
 *
 * Held here rather than inline in each popup because the assessment tracker and
 * the two AI-interview trackers used to carry three separate copies that drifted
 * apart in spacing, colour and behaviour. A card writes its own bucket into the
 * tracker's status filter, so the table underneath always explains the number
 * that was clicked.
 */

export interface InviteStatCardTone {
  /** Text colour for the label and the count. */
  tone: string;
  /** Container treatment while this card is the selected filter. */
  activeClass: string;
}

/* Active styles are spelled out per tone rather than built from a token at call
   time — Tailwind only keeps classes it can see as literals in the source. */
export const INVITE_CARD_TONES: Record<
  'blue' | 'orange' | 'red' | 'green' | 'cyan' | 'slate' | 'purple' | 'indigo',
  InviteStatCardTone
> = {
  blue: {
    tone: 'text-brand-blue',
    activeClass: 'border-brand-blue/50 ring-brand-blue/30 bg-brand-blue/[0.07]',
  },
  orange: {
    tone: 'text-brand-orange-deep',
    activeClass: 'border-brand-orange-deep/50 ring-brand-orange-deep/30 bg-brand-orange-deep/[0.07]',
  },
  red: {
    tone: 'text-red-600',
    activeClass: 'border-red-500/50 ring-red-500/30 bg-red-50 dark:bg-red-500/10',
  },
  green: {
    tone: 'text-green-600',
    activeClass: 'border-green-500/50 ring-green-500/30 bg-green-50 dark:bg-green-500/10',
  },
  cyan: {
    tone: 'text-brand-cyan',
    activeClass: 'border-brand-cyan/50 ring-brand-cyan/30 bg-brand-cyan/[0.07]',
  },
  slate: {
    tone: 'text-gray-900 dark:text-slate-50',
    activeClass: 'border-slate-400/60 ring-slate-400/30 bg-slate-100 dark:bg-slate-800',
  },
  purple: {
    tone: 'text-purple-600 dark:text-purple-400',
    activeClass: 'border-purple-500/50 ring-purple-500/30 bg-purple-50 dark:bg-purple-500/10',
  },
  indigo: {
    tone: 'text-indigo-700 dark:text-indigo-400',
    activeClass: 'border-indigo-500/50 ring-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/10',
  },
};

export interface InviteStatCard extends InviteStatCardTone {
  /** Status value written into the filter. `all` is the reset card. */
  key: string;
  label: string;
  value: number | string;
  Icon: LucideIcon;
  /** Derived tiles (a completion percentage) have no bucket to filter to. */
  filterable?: boolean;
}

interface InviteStatCardsProps {
  cards: InviteStatCard[];
  /** Current `filters.status`; decides which card reads as selected. */
  activeStatus: string;
  onSelect: (status: string) => void;
  /** Grid override for trackers with a different card count. */
  gridClassName?: string;
}

export default function InviteStatCards({
  cards,
  activeStatus,
  onSelect,
  gridClassName = 'grid grid-cols-2 min-[400px]:grid-cols-3 md:grid-cols-6 gap-2 sm:gap-3 lg:gap-4',
}: InviteStatCardsProps) {
  return (
    <div className="px-2.5 sm:px-6 py-2.5 sm:py-4 bg-slate-50 dark:bg-slate-950 border-b border-gray-100 dark:border-slate-700/60 flex-shrink-0">
      <div className={gridClassName}>
        {cards.map(({ key, label, value, Icon, tone, activeClass, filterable = true }) => {
          if (!filterable) {
            /* Not a bucket — nothing to filter to, so it stays a plain tile. The
               missing filter glyph is what tells them apart at a glance. */
            return (
              <div
                key={key}
                className="min-w-0 bg-white dark:bg-slate-900 rounded-md sm:rounded-lg p-1.5 sm:p-3 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 text-center sm:text-left"
              >
                <div className={`flex items-center justify-center sm:justify-start gap-1 sm:gap-2 ${tone} text-2xs sm:text-xs mb-0.5 sm:mb-1`}>
                  <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
                  <span className="min-w-0 truncate" title={label}>{label}</span>
                </div>
                <p className={`text-sm sm:text-2xl font-bold tabular-nums truncate ${tone}`}>{value}</p>
              </div>
            );
          }

          const isActive = activeStatus === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={isActive}
              title={key === 'all' ? 'Show all invites' : `Show only ${label.toLowerCase()} invites`}
              /* Clicking the active card clears back to all. `all` is exempt —
                 it already is the cleared state, so it stays lit as the default. */
              onClick={() => onSelect(isActive && key !== 'all' ? 'all' : key)}
              className={`group relative min-w-0 rounded-md sm:rounded-lg p-1.5 sm:p-3 pr-4 sm:pr-7 border ring-1 shadow-sm shadow-brand-blue/5 text-center sm:text-left transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/60 ${
                isActive
                  ? activeClass
                  : 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-700/60 ring-black/[0.02] dark:ring-white/[0.02] hover:border-brand-blue/30 hover:shadow-md'
              }`}
            >
              {/* Corner glyph is the click affordance. Held at a low opacity
                  rather than hover-only: on a touch screen hover never fires, so
                  a hover-only hint is no hint at all. Turns into FilterX on the
                  active card to say the second click clears it. */}
              <span className={`absolute top-1 right-1 sm:top-2 sm:right-2 ${tone}`} aria-hidden="true">
                {isActive && key !== 'all' ? (
                  <FilterX className="w-3 h-3 sm:w-3.5 sm:h-3.5 opacity-80" />
                ) : (
                  <ListFilter className="w-3 h-3 sm:w-3.5 sm:h-3.5 opacity-30 group-hover:opacity-80 transition-opacity" />
                )}
              </span>
              <div className={`flex items-center justify-center sm:justify-start gap-1 sm:gap-2 ${tone} text-2xs sm:text-xs mb-0.5 sm:mb-1`}>
                <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
                <span className="min-w-0 truncate">{label}</span>
              </div>
              <p className={`text-sm sm:text-2xl font-bold tabular-nums truncate ${tone}`}>{value}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
