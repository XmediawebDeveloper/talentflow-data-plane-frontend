'use client';

import * as React from 'react';
import FilterSelect, { type FilterSelectOption } from '@/components/ui/filter-select';

/**
 * A toolbar filter dropdown styled EXACTLY as the Job Details "AI Talent Match
 * Results" tab's reference control (its "All Matches" select): a `bg-brand-blue/5`
 * rounded pill (36px tall, 14px text, no border) carrying its own chevron, so
 * the filter selects on the sibling Job Details tabs (Scored Resumes /
 * Assessments Results / AI Interview Result) read identically to that
 * reference rather than as bordered boxes.
 *
 * Chrome only — the <option>s and the value/onChange wiring come from the caller,
 * so each tab keeps its own filter behaviour while sharing one look. The
 * <option> children are read into the shared FilterSelect's options (value,
 * text label, disabled), so callers keep passing plain <option> elements.
 */

/** Flatten an option's children (text, numbers, nested fragments) to its label. */
function nodeText(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return nodeText(node.props.children);
  return '';
}

function optionsFromChildren(children: React.ReactNode): FilterSelectOption[] {
  const options: FilterSelectOption[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement<{ value?: unknown; children?: React.ReactNode; disabled?: boolean }>(child)) return;
    if (child.type === React.Fragment) {
      options.push(...optionsFromChildren(child.props.children));
      return;
    }
    if (child.type === 'optgroup') {
      options.push(...optionsFromChildren(child.props.children));
      return;
    }
    if (child.type !== 'option') return;
    const label = nodeText(child.props.children);
    // A native <option> with no value attribute submits its text.
    const value = child.props.value === undefined ? label : String(child.props.value);
    options.push({ value, label, disabled: child.props.disabled });
  });
  return options;
}

export default function ToolbarFilterSelect({
  value,
  onChange,
  ariaLabel,
  children,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  /** The <option> elements. */
  children: React.ReactNode;
  className?: string;
}) {
  const options = optionsFromChildren(children);
  return (
    /* One size at every width (36px, 14px text), like SortByControl beside
       it — toolbar controls share one type size. max-w-full + truncate keep a
       long option (a team lead's name) from pushing the pill past a phone's edge. */
    <div data-toolbar-filter="" className={`inline-flex max-w-full items-center ${className ?? ''}`}>
      <FilterSelect
        value={value}
        onChange={onChange}
        ariaLabel={ariaLabel}
        options={options}
        className="w-auto sm:w-auto max-w-full data-[size=default]:h-9 sm:data-[size=default]:h-9 py-0 sm:py-0 pl-3.5 sm:pl-3.5 pr-3 sm:pr-3 rounded-lg sm:rounded-lg border-0 bg-brand-blue/5 dark:bg-brand-blue/10 shadow-none text-sm text-gray-700 dark:text-slate-300 transition-all"
      />
    </div>
  );
}
