import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Long-text table cell, same pill + hover box as the Resume Scoring "AI
// Reasoning" column (DetailedScorecardTab): a 4-word pill with the full text
// in a hover box, and an `expanded` mode (driven by the column's
// "Expand all" header toggle) that lays the full content out inline.
//
// The hover box is portalled to <body> with measured viewport coordinates —
// the cell sits inside overflow-x-auto table shells that clip a
// CSS-positioned tooltip.
const WORD_LIMIT = 4;

interface TruncatedTextCellProps {
  text: string;
  expanded: boolean;
  /** Inline content when expanded or short (e.g. a diff rendering);
   *  defaults to the plain text. */
  children?: ReactNode;
  /** Extra classes for the default inline text. */
  textClassName?: string;
}

export default function TruncatedTextCell({ text, expanded, children, textClassName = '' }: TruncatedTextCellProps) {
  const [tooltip, setTooltip] = useState<{ left: number; width: number; top: number; openUp: boolean } | null>(null);
  // The pill and the portalled box are siblings with a gap between them, so
  // hiding is deferred a beat and cancelled if the pointer reaches either.
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelHide = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };
  const show = (e: React.MouseEvent<HTMLElement>) => {
    cancelHide();
    const rect = e.currentTarget.getBoundingClientRect();
    // Spans the cell's own width so the text reads comfortably without
    // spilling across the neighbouring columns.
    const cellRect = e.currentTarget.closest('td')?.getBoundingClientRect();
    const estimatedHeight = 160;
    const openUp = window.innerHeight - rect.bottom < estimatedHeight + 16;
    setTooltip({
      left: cellRect?.left ?? rect.left,
      width: Math.max(cellRect?.width ?? 288, 288),
      top: openUp ? rect.top - 8 : rect.bottom + 8,
      openUp,
    });
  };
  const hide = () => {
    cancelHide();
    hideTimeoutRef.current = setTimeout(() => setTooltip(null), 150);
  };
  useEffect(() => () => cancelHide(), []);

  const words = (text || '').trim().split(/\s+/).filter(Boolean);
  const truncated = words.length > WORD_LIMIT;

  if (expanded || !truncated) {
    return <>{children ?? <p className={`whitespace-pre-line break-words ${textClassName}`}>{text || '—'}</p>}</>;
  }

  return (
    <>
      <span
        onMouseEnter={show}
        onMouseLeave={hide}
        className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-300 whitespace-nowrap cursor-default not-italic"
      >
        {words.slice(0, WORD_LIMIT).join(' ')}…
      </span>

      {tooltip && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed z-[100] max-w-[95vw]"
          style={{
            left: tooltip.left,
            width: tooltip.width,
            top: tooltip.top,
            transform: tooltip.openUp ? 'translateY(-100%)' : undefined,
          }}
          onMouseEnter={cancelHide}
          onMouseLeave={hide}
        >
          <div className="whitespace-normal bg-[var(--raw-e1ebed)] text-gray-800 text-xs rounded-xl py-2.5 px-3.5 shadow-xl border border-gray-200 leading-relaxed select-text">
            {text}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
