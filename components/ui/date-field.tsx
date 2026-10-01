'use client';

import * as React from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Calendar } from './calendar';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { cn } from './utils';

export interface DateFieldProps {
  id?: string;
  value: string; // 'YYYY-MM-DD' or ''
  onChange: (value: string) => void;
  /** Bounds, also as 'YYYY-MM-DD' — the same contract the native inputs used. */
  min?: string;
  max?: string;
  'aria-label'?: string;
  placeholder?: string;
  className?: string;
}

function parseISODate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? undefined : date;
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDMY(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}-${m}-${date.getFullYear()}`;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * A single-date picker: a button showing the value (or placeholder), opening
 * a Radix popover with a react-day-picker calendar. Replaces the native
 * `<input type="date">`, whose browser-rendered dropdown can't be clamped to
 * the viewport, resized, or aligned to the field — on a phone-width screen it
 * either clipped the input's own text or spilled the popup over surrounding
 * content. This one is sized to the field itself (never narrower than the
 * calendar needs) and kept on-screen by Radix's collision handling plus a
 * max-height/scroll cap in popover.tsx.
 */
export function DateField({ id, value, onChange, min, max, placeholder = 'dd-mm-yyyy', className, ...rest }: DateFieldProps) {
  const [open, setOpen] = React.useState(false);
  const selected = parseISODate(value);
  const minDate = parseISODate(min);
  const maxDate = parseISODate(max);
  const ariaLabel = rest['aria-label'];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          aria-label={ariaLabel}
          className={cn(
            'w-full h-9 px-3 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900',
            'flex items-center justify-between gap-2',
            'focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue',
            className,
          )}
        >
          <span className={selected ? 'text-gray-900 dark:text-slate-100' : 'text-gray-400 dark:text-slate-500'}>
            {selected ? formatDMY(selected) : placeholder}
          </span>
          <CalendarIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        </button>
      </PopoverTrigger>
      {/* min-w, not w: a shrink-to-fit box (Radix gives Content no width of
          its own) naturally sizes to the calendar's content — this only
          raises that floor to the field's width, so the popover matches a
          wide field but never gets squeezed narrower than the day grid needs
          when the field itself is narrow (e.g. two stacked on a tablet-width
          filter row). */}
      <PopoverContent align="start" className="min-w-[var(--radix-popover-trigger-width)] p-0">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            onChange(date ? toISODate(date) : '');
            setOpen(false);
          }}
          disabled={(date) => (!!minDate && date < minDate) || (!!maxDate && date > maxDate)}
          className="w-full"
        />
        <div className="px-3 pb-2.5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
            className="text-xs text-brand-blue hover:underline"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => {
              onChange(toISODate(startOfToday()));
              setOpen(false);
            }}
            className="text-xs text-brand-blue hover:underline"
          >
            Today
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
