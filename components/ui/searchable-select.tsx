'use client';

import * as React from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';
import { cn } from './utils';
import { IconButton } from '@/components/ui/icon-button';

/**
 * A single-select dropdown with a type-to-filter box inside it.
 *
 * Why this exists: the app's filter controls were all plain `<select>`s, which
 * are fine for a fixed handful of options (a status, a sort order) and stop
 * working once the list is drawn from data — a Job filter on a tenant with 200
 * jobs is a 200-item native menu with no way to search it. Everything about the
 * chrome is deliberately the same as those selects (h-9, rounded-lg, the
 * gray-200 border, the brand-blue focus ring) so a searchable filter sits in a
 * toolbar beside a plain one without looking like a different control.
 *
 * Single-select on purpose. Multi-select is a different interaction (chips
 * inside the trigger, a "3 selected" summary, partial clears) and no screen has
 * asked for it yet; adding the affordance now would mean guessing at all three.
 *
 * Keyboard: the trigger is a real `<button>` (Enter/Space opens it), the search
 * box takes focus on open, Up/Down move the highlight, Enter picks it, Escape
 * closes and returns focus to the trigger. Options are `role="option"` inside a
 * `role="listbox"`, so a screen reader reads the list as a list rather than as
 * a pile of buttons.
 */

export interface SearchableSelectOption {
  /** The value handed back to `onChange`. */
  value: string;
  /** What the reader sees, in the trigger and in the list. */
  label: string;
  /** Optional muted second line — a count, a job id, a qualifier. */
  hint?: string;
}

export interface SearchableSelectProps {
  /** Currently selected value, or '' for none. */
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  /** Shown in the trigger when nothing is selected. Doubles as the "any" label. */
  placeholder?: string;
  /** Placeholder for the filter box inside the menu. */
  searchPlaceholder?: string;
  /** Short label rendered above the control. */
  label?: string;
  /** Copy for the option that clears the selection. Omit to hide that option. */
  allLabel?: string;
  /** Message when the filter box matches nothing. */
  emptyMessage?: string;
  disabled?: boolean;
  /** Width class for the trigger; the menu matches the trigger's width. */
  className?: string;
  /** Accessible name when `label` is not rendered. */
  ariaLabel?: string;
  /**
   * 'bordered' (default): the usual h-9 white box with a gray-200 border.
   * 'pill': the Job Details "AI Talent Match Results" tab's tinted
   * `bg-brand-blue/5` toolbar-filter chrome, for callers embedding this
   * control in that same toolbar row so it reads identically to its plain
   * `<select>` siblings instead of as a different, bordered control. Only the
   * trigger's chrome changes — the search box and option list are unaffected.
   */
  variant?: 'bordered' | 'pill';
  /** Extra trigger classes, merged last (tailwind-merge), for a caller that
   *  must match a neighbouring native `<select>`'s text exactly. */
  triggerClassName?: string;
}

export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Any',
  searchPlaceholder = 'Search...',
  label,
  allLabel = 'All',
  emptyMessage = 'No matches',
  disabled = false,
  className,
  ariaLabel,
  variant = 'bordered',
  triggerClassName,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [highlight, setHighlight] = React.useState(0);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const searchRef = React.useRef<HTMLInputElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);

  /* `allLabel` is presented as the first row rather than as a separate "clear"
     button, so "no filter on this dimension" is picked the same way every other
     value is. Its value is '' — the same empty string the caller passes in for
     "unset", so there is one representation of that state, not two. */
  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? options.filter(
          (o) => o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q),
        )
      : options;
    return allLabel ? [{ value: '', label: allLabel }, ...matched] : matched;
  }, [options, query, allLabel]);

  const selected = options.find((o) => o.value === value);

  // Close on an outside click or a focus that leaves the control.
  React.useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  /* Opening is a handler, not an effect: `openMenu` clears the filter box and
     points the highlight at the row that is already selected, so re-opening a
     set filter starts on that row instead of at the top of a list the user has
     to scroll again. Doing it in an effect keyed on `open` would be the same
     work one render later, for no benefit. */
  const openMenu = () => {
    setQuery('');
    const idx = rows.findIndex((r) => r.value === value);
    setHighlight(idx >= 0 ? idx : 0);
    setOpen(true);
  };

  /* Typing shortens the list, which can leave `highlight` past its end. Fixed
     by CLAMPING ON READ rather than by an effect that writes the state back:
     there is no render in which the highlight can be out of range, and no
     second pass to get there. Every read below uses `activeIndex`. */
  const activeIndex = Math.min(highlight, Math.max(0, rows.length - 1));

  // Scrolling the highlighted row into view IS an external-system effect — it
  // touches the DOM and stores nothing.
  React.useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  // Focusing the filter box on open, likewise: DOM only, on the frame after
  // the menu mounts.
  React.useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const commit = (next: string) => {
    onChange(next);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!rows.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setHighlight((h) => (h + step + rows.length) % rows.length);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const row = rows[activeIndex];
      if (row) commit(row.value);
      return;
    }
    if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div className={cn('relative', className)} ref={rootRef}>
      {label && (
        <label className="block tf-caption mb-1.5">
          {label}
        </label>
      )}

      {/* `contents` makes this wrapper invisible to layout for the default
          'bordered' variant (every existing caller) — only 'pill' callers get
          the tinted pill background around the trigger. */}
      <div className={variant === 'pill' ? 'inline-flex items-center bg-brand-blue/5 dark:bg-brand-blue/10 rounded-lg p-1 transition-all' : 'contents'}>
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          onClick={() => (open ? setOpen(false) : openMenu())}
          onKeyDown={(e) => {
            // Down-arrow opens straight into the list, the convention for a
            // collapsed combobox.
            if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              openMenu();
            }
          }}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={ariaLabel || label}
          className={cn(
            'inline-flex items-center text-left transition-colors relative',
            disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
            variant === 'pill'
              ? cn(
                  'h-7 pl-2.5 pr-8 rounded-md bg-transparent text-sm',
                  'focus:outline-none focus:ring-2 focus:ring-brand-blue/40',
                  value ? 'text-gray-900 dark:text-slate-100' : 'text-gray-700 dark:text-slate-300',
                )
              : cn(
                  'w-full h-9 px-3 pr-8 rounded-lg border text-sm',
                  'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700',
                  'focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue',
                  !disabled && 'hover:border-brand-blue/40',
                  // A set filter is tinted, so a toolbar of six controls says
                  // at a glance which of them are doing something.
                  value
                    ? 'text-gray-900 dark:text-slate-100 bg-brand-blue/5 border-brand-blue/30'
                    : 'text-gray-500 dark:text-slate-400',
                ),
            triggerClassName,
          )}
        >
          <span className="truncate" title={selected?.label}>
            {selected?.label || placeholder}
          </span>
          <ChevronDown
            className={cn(
              'pointer-events-none absolute transition-transform',
              variant === 'pill'
                ? 'right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 dark:text-slate-400'
                : 'right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500',
              open && 'rotate-180',
            )}
          />
        </button>
      </div>

      {open && (
        <div
          className="absolute z-40 mt-1 w-full min-w-[13rem] rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl shadow-brand-blue/5 overflow-hidden"
          onKeyDown={onKeyDown}
        >
          <div className="p-2 border-b border-gray-100 dark:border-slate-700/60">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="tf-input h-8 pl-8 pr-7 rounded-md"
              />
              {query && (
                <IconButton bare label="Clear search"
                  type="button"
                  onClick={() => {
                    setQuery('');
                    searchRef.current?.focus();
                  }}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-500 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </IconButton>
              )}
            </div>
          </div>

          <div ref={listRef} role="listbox" className="max-h-56 overflow-y-auto py-1">
            {rows.length === 0 ? (
              <p className="px-3 py-4 tf-meta text-center">
                {emptyMessage}
              </p>
            ) : (
              rows.map((row, index) => {
                const isSelected = row.value === value;
                return (
                  <button
                    key={`${row.value}-${index}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-index={index}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => commit(row.value)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors',
                      index === activeIndex
                        ? 'bg-brand-blue/10 text-brand-blue'
                        : 'text-gray-700 dark:text-slate-300',
                    )}
                  >
                    <Check
                      className={cn(
                        'w-3.5 h-3.5 flex-shrink-0',
                        isSelected ? 'text-brand-blue' : 'opacity-0',
                      )}
                    />
                    <span className="truncate" title={row.label}>
                      {row.label}
                    </span>
                    {'hint' in row && row.hint && (
                      <span className="ml-auto tf-hint flex-shrink-0">{row.hint}</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
