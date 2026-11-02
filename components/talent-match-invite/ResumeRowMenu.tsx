'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';
import { MENU_ITEM_SCALE_CLASS } from '@/lib/constants/menuAnimation';

export interface ResumeRowAction {
  key: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  /** Why it cannot be used now (greyed, with this as its hover), or null. */
  disabledReason?: string | null;
  danger?: boolean;
}

/* The Resume Database row menu's look (ResumeTable): an "Actions" heading,
   the same item styling, red for Delete. */
const ITEM = 'group w-full text-left px-4 py-2 text-sm transition-colors flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-slate-800';
const MENU_WIDTH = 208; // w-52
const GAP = 6;
const EDGE = 8;

/**
 * A resume row's ⋮ in the invite popup's lists — the Resume Database page's
 * row actions (Download, Archive / Unarchive, Delete), portalled over the
 * popup and placed against the viewport (flipped above when there is no room
 * below). Clicks never reach the row, so it is not ticked by them.
 */
export default function ResumeRowMenu({
  name,
  actions,
  onOverlayChange,
}: {
  name: string;
  actions: ResumeRowAction[];
  /** The open menu's closer, so Esc closes it before the popup. */
  onOverlayChange?: (close: (() => void) | null) => void;
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const close = () => { setAnchor(null); setPos(null); onOverlayChange?.(null); };

  useLayoutEffect(() => {
    if (!anchor || !menuRef.current) return;
    const h = menuRef.current.offsetHeight;
    const below = anchor.bottom + GAP;
    setPos({
      top: below + h > window.innerHeight - EDGE ? Math.max(EDGE, anchor.top - GAP - h) : below,
      left: Math.min(window.innerWidth - MENU_WIDTH - EDGE, Math.max(EDGE, anchor.right - MENU_WIDTH)),
    });
  }, [anchor]);
  useEffect(() => {
    if (!anchor) return;
    const onDown = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) close(); };
    const onResize = () => close();
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', onResize);
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('resize', onResize); };
    // close only clears state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);

  if (actions.length === 0) return null;
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (anchor) { close(); return; }
          setPos(null);
          setAnchor(e.currentTarget.getBoundingClientRect());
          onOverlayChange?.(close);
        }}
        aria-label={`Actions for ${name}`}
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        title="Actions"
        className={`shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md border transition-colors ${anchor
          ? 'border-gray-400 bg-gray-50 dark:bg-slate-800 dark:border-slate-500'
          : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 hover:bg-gray-50 hover:border-gray-400 dark:hover:bg-slate-800'}`}
      >
        <MoreVertical className="w-3.5 h-3.5 text-gray-600 dark:text-slate-300" aria-hidden="true" />
      </button>
      {anchor && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Actions for ${name}`}
          className="fixed w-52 flex flex-col bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-gray-200 dark:border-slate-700 z-[70] overflow-hidden"
          style={{ top: pos?.top ?? anchor.bottom + GAP, left: pos?.left ?? anchor.right - MENU_WIDTH, visibility: pos ? 'visible' : 'hidden' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex-none px-3 py-2 border-b border-gray-100 dark:border-slate-700 text-2xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400">
            Actions
          </div>
          <div className="py-1">
            {actions.map((a) => {
              const off = !!a.disabledReason;
              return (
                <button
                  key={a.key}
                  type="button"
                  role="menuitem"
                  aria-disabled={off}
                  title={a.disabledReason ?? undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (off) return;
                    close();
                    a.onSelect();
                  }}
                  className={`${ITEM} ${off
                    ? '!text-gray-400 dark:!text-slate-600 cursor-not-allowed opacity-60 hover:bg-transparent'
                    : a.danger ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-slate-300'}`}
                >
                  {a.icon}
                  <span className={MENU_ITEM_SCALE_CLASS}>{a.label}</span>
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
