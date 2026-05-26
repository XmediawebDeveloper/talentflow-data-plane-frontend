'use client';

import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface SkillsListProps {
  skills?: string[] | null;
  /** How many chips to show before collapsing the rest into "+N more". */
  max?: number;
  /** Class applied to each visible (inline) skill chip. */
  chipClassName?: string;
  /** Class applied to the "+N more" trigger button. */
  moreClassName?: string;
  /** Optional renderer to highlight matched text within each skill. */
  highlight?: (text: string) => ReactNode;
  /** Rendered when there are no skills. Defaults to nothing. */
  emptyFallback?: ReactNode;
}

const DEFAULT_CHIP =
  'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20';
const DEFAULT_MORE =
  'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs text-brand-blue font-medium hover:bg-brand-blue/10 transition-colors cursor-pointer';
const POPOVER_WIDTH = 288; // matches w-72

/**
 * Renders the first `max` skills as chips followed by a "+N more" button.
 * Clicking "+N more" opens a popover listing every skill — it stops the click
 * from bubbling, so it never triggers a parent row/card navigate handler.
 *
 * Renders a fragment (no wrapper), so callers keep their own flex container.
 */
export default function SkillsList({
  skills,
  max = 2,
  chipClassName = DEFAULT_CHIP,
  moreClassName = DEFAULT_MORE,
  highlight,
  emptyFallback = null,
}: SkillsListProps) {
  const [popover, setPopover] = useState<{ top: number; left: number; openUp: boolean } | null>(null);
  const list = skills ?? [];

  if (list.length === 0) return <>{emptyFallback}</>;

  const visible = list.slice(0, max);
  const extra = list.length - max;
  const render = (s: string) => (highlight ? highlight(s) : s);

  return (
    <>
      {visible.map((skill, i) => (
        <span key={i} className={chipClassName}>
          {render(skill)}
        </span>
      ))}

      {extra > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (popover) {
              setPopover(null);
              return;
            }
            const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
            const openUp = window.innerHeight - rect.bottom < 260;
            const left = Math.max(8, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8));
            setPopover({ top: openUp ? rect.top : rect.bottom + 6, left, openUp });
          }}
          className={moreClassName}
        >
          +{extra} more
        </button>
      )}

      {popover && (
        <>
          {/* Backdrop — click anywhere to close. */}
          <div
            className="fixed inset-0 z-[100]"
            onClick={(e) => {
              e.stopPropagation();
              setPopover(null);
            }}
          />
          <div
            className="fixed w-72 max-h-[260px] overflow-y-auto bg-white rounded-lg shadow-xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] p-3 z-[101]"
            style={
              popover.openUp
                ? { bottom: window.innerHeight - popover.top + 6, left: popover.left }
                : { top: popover.top, left: popover.left }
            }
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-900">All skills ({list.length})</p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPopover(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {list.map((skill, i) => (
                <span key={i} className={DEFAULT_CHIP}>
                  {render(skill)}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
