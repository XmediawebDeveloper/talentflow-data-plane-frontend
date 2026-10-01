'use client';

import * as React from 'react';
import { DayPicker, useDayPicker, type DayPickerProps } from 'react-day-picker';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from './utils';

export type CalendarProps = DayPickerProps;

const START_YEAR = 2024;
const END_YEAR = 2050;
const YEARS = Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => START_YEAR + i);
const MONTH_NAMES = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString('en-US', { month: 'short' }));

/** A single dropdown-style trigger: label + chevron, opening its own small
 *  in-DOM list (`max-h` + `overflow-y-auto`, not a native <select> whose
 *  option list is an OS popup that can run past the calendar card). */
function QuickNavField({
  label,
  open,
  onToggle,
  onClose,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-sm font-semibold text-gray-900 dark:text-slate-100 hover:text-brand-blue transition-colors"
      >
        {label}
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div
          ref={panelRef}
          className="absolute left-0 top-full mt-1 z-20 max-h-52 overflow-y-auto rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg p-2"
        >
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * The "October ⌄ 2026 ⌄" caption, replacing react-day-picker's own caption
 * rendering entirely (so `captionLayout` on the parent DayPicker no longer
 * matters). react-day-picker's built-in `captionLayout="dropdown"` renders
 * two native <select> elements — the browser draws their option list as an
 * OS-level popup that floats over everything and can run past the calendar
 * card's own edges, the same uncontrollable-overflow problem the native date
 * input had. Month and year are deliberately two independent triggers, each
 * opening only its own list — not a combined month+year panel.
 */
function QuickNavCaption({
  calendarMonth,
  displayIndex: _displayIndex,
  className,
  ...divProps
}: { calendarMonth: { date: Date }; displayIndex: number } & React.HTMLAttributes<HTMLDivElement>) {
  const { goToMonth } = useDayPicker();
  const [openField, setOpenField] = React.useState<'month' | 'year' | null>(null);
  // react-day-picker passes a `CalendarMonth` instance here, not a plain
  // Date — calling Date methods on it directly throws (it has no
  // `.toLocaleDateString`/`.getMonth`/etc.), which is what was crashing this
  // component into the error boundary. `.date` is the actual Date.
  const month = calendarMonth.date;

  return (
    <div {...divProps} className={cn('flex items-center gap-1', className)}>
      <QuickNavField
        label={month.toLocaleDateString('en-US', { month: 'long' })}
        open={openField === 'month'}
        onToggle={() => setOpenField((f) => (f === 'month' ? null : 'month'))}
        onClose={() => setOpenField(null)}
      >
        <div className="grid grid-cols-3 gap-1 w-44">
          {MONTH_NAMES.map((m, i) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                goToMonth(new Date(month.getFullYear(), i, 1));
                setOpenField(null);
              }}
              className={cn(
                'text-xs rounded px-1 py-1.5 transition-colors',
                i === month.getMonth()
                  ? 'bg-brand-blue text-white'
                  : 'text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800',
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </QuickNavField>
      <QuickNavField
        label={String(month.getFullYear())}
        open={openField === 'year'}
        onToggle={() => setOpenField((f) => (f === 'year' ? null : 'year'))}
        onClose={() => setOpenField(null)}
      >
        <div className="grid grid-cols-3 gap-1 w-36">
          {YEARS.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => {
                goToMonth(new Date(y, month.getMonth(), 1));
                setOpenField(null);
              }}
              className={cn(
                'text-xs rounded px-1 py-1 transition-colors',
                y === month.getFullYear()
                  ? 'bg-brand-blue text-white'
                  : 'text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800',
              )}
            >
              {y}
            </button>
          ))}
        </div>
      </QuickNavField>
    </div>
  );
}

/**
 * Thin wrapper around react-day-picker v9, styled to match the browser's own
 * native <input type="date"> calendar look (the thing this replaces) — a
 * "Month, Year ⌄" caption that opens a quick month/year panel, stacked
 * up/down month-nav buttons at the top right, and a Monday-first week —
 * rather than react-day-picker's own stylesheet, which we don't import. The
 * classNames keys below are v9's UI enum values — see
 * node_modules/react-day-picker/dist/cjs/UI.d.ts if these ever need
 * revisiting after a version bump; v8's keys (`day_today`, `table`, etc.)
 * silently do nothing here.
 */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  weekStartsOn = 1,
  startMonth,
  endMonth,
  fixedWeeks = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      weekStartsOn={weekStartsOn}
      // Always 6 week-rows, so the popover is the same height on every
      // month — without this a 4-week February and a 6-week October resize
      // the popup as you navigate.
      fixedWeeks={fixedWeeks}
      startMonth={startMonth ?? new Date(START_YEAR, 0, 1)}
      endMonth={endMonth ?? new Date(END_YEAR, 11, 31)}
      className={cn('p-3', className)}
      classNames={{
        months: 'relative flex flex-col gap-2',
        // The default <nav> wraps prev+next as one element (unlike v9's
        // "around" layout, which splits them to flank the caption) — exactly
        // what's needed to stack them vertically, top-right, like the native
        // picker's up/down arrows. A shared border makes the pair read as one
        // control, split by a hairline — not two separately-aligned buttons.
        // Sized/positioned to line up top-edge-to-top-edge with the caption
        // row below (min-h-[49px] on month_caption matches this box's actual
        // rendered height: two size-6 buttons + the 1px divider) — a fixed
        // h-8 caption with this taller box at top-1 left it hanging visibly
        // lower than the "October, 2026" text beside it.
        nav: 'absolute right-1 top-0 flex flex-col rounded-md border border-gray-200 dark:border-slate-700 overflow-hidden z-10',
        button_previous: cn(
          'size-6 flex items-center justify-center shrink-0 border-b border-gray-200 dark:border-slate-700 transition-colors',
          'text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800',
          'disabled:opacity-30 disabled:pointer-events-none',
        ),
        button_next: cn(
          'size-6 flex items-center justify-center shrink-0 transition-colors',
          'text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800',
          'disabled:opacity-30 disabled:pointer-events-none',
        ),
        month: 'flex flex-col gap-2',
        month_caption: 'flex items-center min-h-[49px] pl-1 pr-9',
        month_grid: 'w-full border-collapse table-fixed',
        weekdays: '',
        weekday: 'w-8 h-8 text-center text-2xs font-medium text-gray-400 dark:text-slate-500',
        week: '',
        day: 'p-0 text-center',
        day_button: cn(
          'size-8 rounded-md text-sm font-normal text-gray-700 dark:text-slate-200 transition-colors',
          'hover:bg-gray-100 dark:hover:bg-slate-800',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40',
        ),
        today: '[&>button]:bg-brand-blue [&>button]:text-white [&>button]:hover:bg-brand-blue-2',
        selected: '[&>button]:bg-brand-blue [&>button]:text-white [&>button]:hover:bg-brand-blue-2',
        range_start: '[&>button]:bg-brand-blue [&>button]:text-white [&>button]:rounded-r-none',
        range_end: '[&>button]:bg-brand-blue [&>button]:text-white [&>button]:rounded-l-none',
        range_middle: '[&>button]:bg-brand-blue/10 [&>button]:text-brand-blue dark:[&>button]:bg-brand-blue/20 [&>button]:rounded-none [&>button]:hover:bg-brand-blue/20',
        outside: '[&>button]:text-gray-300 dark:[&>button]:text-slate-600',
        disabled: '[&>button]:text-gray-300 dark:[&>button]:text-slate-700 [&>button]:pointer-events-none [&>button]:hover:bg-transparent',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        // PreviousMonthButton always renders Chevron with orientation="left",
        // NextMonthButton with "right" (see DayPicker.js) — a stable hook for
        // telling them apart even though we're not showing a left/right
        // chevron. Up = previous, down = next, matching the native picker's
        // arrow pair.
        Chevron: ({ className: chevronClassName, orientation }) =>
          orientation === 'left' ? (
            <ChevronUp className={cn('w-4 h-4', chevronClassName)} />
          ) : (
            <ChevronDown className={cn('w-4 h-4', chevronClassName)} />
          ),
        MonthCaption: QuickNavCaption,
      }}
      {...props}
    />
  );
}

export { Calendar };
