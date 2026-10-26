'use client';

import type { LucideIcon } from 'lucide-react';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';

/* Radix select keeps its popup inside the viewport, sized to the trigger and
   scrollable — unlike a native <select>, whose list ran past a phone's edge.
   Radix reserves "" for "no value", so an option whose value is "" (an "All …"
   choice) maps to a sentinel; with no such option, "" shows the placeholder. */
const EMPTY_VALUE = '__empty__';

export interface FilterSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  /** Hover text (e.g. why an option is disabled). */
  title?: string;
  /** Consecutive options sharing a group render under one heading (like <optgroup>). */
  group?: string;
}

export default function FilterSelect({
  value,
  onChange,
  options,
  ariaLabel,
  icon: Icon,
  placeholder,
  disabled,
  id,
  name,
  className,
  contentClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  options: FilterSelectOption[];
  ariaLabel?: string;
  icon?: LucideIcon;
  /** Shown while value is "" and no option has the value "". */
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  /** Form field name (Radix renders a hidden native select for forms). */
  name?: string;
  /** Extra trigger classes (merged last via tailwind-merge). */
  className?: string;
  /** Extra popup classes. */
  contentClassName?: string;
}) {
  const hasEmptyOption = options.some((o) => o.value === '');
  const toRadix = (v: string) => (v === '' && hasEmptyOption ? EMPTY_VALUE : v);

  // Split into runs of consecutive options with the same group.
  const runs: { group?: string; items: FilterSelectOption[] }[] = [];
  for (const o of options) {
    const last = runs[runs.length - 1];
    if (last && last.group === o.group) last.items.push(o);
    else runs.push({ group: o.group, items: [o] });
  }
  const renderItem = (o: FilterSelectOption) => (
    <SelectItem
      key={toRadix(o.value)}
      value={toRadix(o.value)}
      disabled={o.disabled}
      title={o.title}
      className="rounded-lg text-gray-700 dark:text-slate-300 focus:bg-brand-blue/[0.06] focus:text-brand-blue data-[state=checked]:font-medium data-[state=checked]:text-brand-blue"
    >
      {o.label}
    </SelectItem>
  );

  return (
    <Select
      value={toRadix(value)}
      onValueChange={(v) => onChange(v === EMPTY_VALUE ? '' : v)}
      disabled={disabled}
      name={name}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        className={`w-full sm:w-auto data-[size=default]:h-auto sm:data-[size=default]:h-auto gap-1.5 pl-2.5 sm:pl-3 pr-2 sm:pr-3 py-1.5 sm:py-2.5 rounded-lg sm:rounded-xl border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-gray-900 dark:text-slate-50 cursor-pointer focus-visible:ring-2 focus-visible:ring-brand-blue/40 focus-visible:border-brand-blue ${className ?? ''}`}
      >
        <span className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          {Icon && <Icon className="size-3 sm:size-4 text-gray-400 dark:text-slate-500" />}
          <span className="truncate"><SelectValue placeholder={placeholder} /></span>
        </span>
      </SelectTrigger>
      <SelectContent className={`max-h-[min(18rem,var(--radix-select-content-available-height))] rounded-xl border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl shadow-brand-blue/10 ${contentClassName ?? ''}`}>
        {runs.map((run, i) =>
          run.group ? (
            <SelectGroup key={`${run.group}-${i}`}>
              <SelectLabel className="sticky top-0 z-10 bg-white dark:bg-slate-900 text-2xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">{run.group}</SelectLabel>
              {run.items.map(renderItem)}
            </SelectGroup>
          ) : (
            run.items.map(renderItem)
          ),
        )}
      </SelectContent>
    </Select>
  );
}
