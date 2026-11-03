'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from './utils';

/**
 * A list's Actions (N) + Clear row that stays on screen while the list is
 * scrolled.
 *
 * The row sits inside its page's toolbar card, so CSS `sticky` would only hold
 * it while that card is in view. Instead the row renders in place; once it has
 * scrolled up under the page's sticky breadcrumb (or the top of the page's
 * scroller, `.tf-page-scroll`, on a page without one), the same controls move
 * into a bar pinned just below it — inside the page container (the
 * breadcrumb's own left edge and width), the controls lined up with where they
 * were — and move back when the row's place scrolls into view again. The
 * breadcrumb is never covered. The place keeps its height meanwhile, so the
 * page never jumps.
 *
 * Outside a dashboard page (a dialog, a portalled picker) it just renders in
 * place.
 */
export function StickyBulkBar({ children, className }: { children: React.ReactNode; className?: string }) {
  const anchorRef = React.useRef<HTMLDivElement | null>(null);
  const [scroller, setScroller] = React.useState<HTMLElement | null>(null);
  const [stuck, setStuck] = React.useState(false);
  const [frame, setFrame] = React.useState<{ top: number; left: number; width: number; inset: number; height: number } | null>(null);
  /* How far below the scroller's top the pinned bar sits: the sticky
     breadcrumb's height (0 without one). */
  const [offset, setOffset] = React.useState(0);

  React.useLayoutEffect(() => {
    const el = anchorRef.current;
    const root = el && !el.closest('[role="dialog"], [data-slot="dialog-content"]')
      ? el.closest<HTMLElement>('.tf-page-scroll')
      : null;
    setScroller(root);
  }, []);

  /* The breadcrumb's height, while it is sticky. */
  React.useEffect(() => {
    if (!scroller) return;
    const crumb = stickyCrumb(scroller);
    if (!crumb) return;
    const ro = new ResizeObserver(() => setOffset(crumb.getBoundingClientRect().height));
    ro.observe(crumb);
    return () => ro.disconnect();
  }, [scroller]);

  /* Scrolled up under the breadcrumb (or the scroller's top) = stuck. */
  React.useEffect(() => {
    const el = anchorRef.current;
    if (!el || !scroller) return;
    const observer = new IntersectionObserver(([entry]) => {
      const top = entry.rootBounds?.top ?? scroller.getBoundingClientRect().top + offset;
      setStuck(!entry.isIntersecting && entry.boundingClientRect.bottom <= top + 1);
    }, { root: scroller, threshold: 0, rootMargin: `-${Math.round(offset)}px 0px 0px 0px` });
    observer.observe(el);
    return () => observer.disconnect();
  }, [scroller, offset]);

  /* Where the pinned bar goes: just below the breadcrumb, across the page
     container (the breadcrumb's width; the scroller's, without one), the
     controls at the row's own left. */
  React.useLayoutEffect(() => {
    const el = anchorRef.current;
    if (!stuck || !el || !scroller) return;
    const measure = () => {
      const s = scroller.getBoundingClientRect();
      const a = el.getBoundingClientRect();
      const crumb = stickyCrumb(scroller)?.getBoundingClientRect();
      const left = crumb ? crumb.left : s.left;
      setFrame({
        top: s.top + (crumb ? crumb.height : 0),
        left,
        width: crumb ? crumb.width : scroller.clientWidth,
        inset: Math.max(0, a.left - left),
        height: a.height,
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(scroller);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [stuck, scroller]);

  const pinned = stuck && frame && scroller;
  return (
    <>
      <div
        ref={anchorRef}
        className={cn('flex flex-wrap items-center gap-2', className)}
        style={pinned ? { minHeight: frame.height, visibility: 'hidden' } : undefined}
      >
        {!pinned && children}
      </div>
      {pinned && createPortal(
        <div
          className="fixed z-20 rounded-b-lg border border-t-0 border-border bg-card shadow-sm animate-in fade-in slide-in-from-top-1 duration-150"
          style={{ top: frame.top, left: frame.left, width: frame.width }}
        >
          <div className="flex flex-wrap items-center gap-2 py-2.5 pr-3" style={{ paddingLeft: Math.max(12, frame.inset) }}>
            {children}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/* The page's breadcrumb, when it is pinned (PageBreadcrumb's `sticky`). */
function stickyCrumb(scroller: HTMLElement): HTMLElement | null {
  const crumb = scroller.querySelector<HTMLElement>('nav[data-slot="breadcrumb"]');
  return crumb && getComputedStyle(crumb).position === 'sticky' ? crumb : null;
}

export default StickyBulkBar;
