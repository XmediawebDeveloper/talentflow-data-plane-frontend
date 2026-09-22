'use client';

import React from 'react';
import ChipsReveal from '@/components/ui/chips-reveal';

/**
 * The heading every configuration card wears: an icon tile, the card's name,
 * and one line saying what the setting does.
 *
 * One component rather than the hand-rolled icon-plus-title rows each card
 * carried, which is why some cards explained themselves and others left the
 * recruiter to guess from the title alone.
 */
export function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  tone = 'blue',
  leading,
  trailing,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  tone?: 'blue' | 'cyan' | 'orange';
  /** Rendered before the icon — the enable/disable switch on optional rounds. */
  leading?: React.ReactNode;
  /** Rendered hard right — counts, badges, per-card controls. */
  trailing?: React.ReactNode;
}) {
  const tones = {
    blue: 'bg-brand-blue/10 ring-brand-blue/15 text-brand-blue',
    cyan: 'bg-brand-cyan/10 ring-brand-cyan/15 text-brand-cyan',
    orange: 'bg-brand-orange/10 ring-brand-orange/15 text-brand-orange',
  } as const;

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-2.5 min-w-0">
        {leading}
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ring-1 flex-shrink-0 ${tones[tone]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-gray-900 dark:text-slate-100 text-sm tracking-tight">{title}</div>
          {subtitle && <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {trailing && <div className="flex items-center gap-2 flex-shrink-0">{trailing}</div>}
    </div>
  );
}

/**
 * Split a stored location into the places it actually names.
 *
 * A JD with several locations arrives as one comma-joined string (see
 * `jobOpeningDisplay`, which joins `locations[].city`), so the comma is the
 * separator; a pipe or semicolon is accepted for records written by hand.
 */
export const splitLocations = (value?: string | null): string[] => {
  if (!value) return [];
  const seen = new Set<string>();
  return value
    .split(/[,;|]/)
    .map(part => part.trim())
    .filter(part => {
      if (!part) return false;
      const key = part.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

/**
 * The summary's Location value: the primary place on its own, and — when the
 * JD names more than one — the count beside it, with the full list behind it.
 *
 * The row used to print every location comma-joined, which in a narrow sidebar
 * column wrapped a four-city job over three lines and pushed what sat below it
 * out of view. The reveal is the same control the Create Assessment sidebar
 * uses for a JD's skills, so a count-with-a-chevron behaves the same wherever
 * it appears.
 */
export function SummaryLocation({ value }: { value?: string | null }) {
  const places = splitLocations(value);

  if (places.length === 0) {
    return <span className="text-xs font-semibold text-gray-900 text-right">—</span>;
  }

  if (places.length === 1) {
    return <span className="text-xs font-semibold text-gray-900 text-right">{places[0]}</span>;
  }

  return (
    <ChipsReveal
      label="Locations"
      items={places}
      chipClassName="flex-shrink-0 rounded-lg px-2 py-0.5 text-xs font-semibold bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20"
      leading={<span className="font-semibold text-gray-900 truncate max-w-[7rem]">{places[0]}</span>}
    />
  );
}
