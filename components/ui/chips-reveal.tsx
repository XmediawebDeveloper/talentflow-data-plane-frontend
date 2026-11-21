'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';

/** The panel's width in px — matches `w-64` on the panel itself. */
const REVEAL_PANEL_WIDTH = 256;

/**
 * A count, with the values behind it — the JD skill groups on the Create
 * Assessment sidebar, the locations on the AI Interview summary, anything else
 * that is a list too long for the row it belongs to.
 *
 * The values used to be listed in the row outright. On a JD carrying a dozen
 * must-haves that pushed the rest of what the card exists to report off the
 * bottom of a narrow sidebar, and the count on the header line was answering a
 * question the chips beneath it had already answered. So the count is all that
 * shows: it is the figure a recruiter scans for, and the values themselves are
 * one hover (or one tap) away for the times that figure looks wrong.
 *
 * The panel is `fixed` and portalled to <body> rather than opened inside the
 * row: the sidebar is a narrow column with its own scrolling, and an in-row
 * panel would be clipped by it — clipping is not something z-index escapes.
 * It is placed from the trigger's own rect, right-aligned to it, held a margin
 * clear of every viewport edge, and flipped above the chip where the room
 * below runs out, so it stays whole on a phone as much as on a desktop. Its
 * list scrolls at whatever height the room allows, capped, so a long group
 * never grows the panel off-screen.
 *
 * Pointer and keyboard both reach it: hover opens it, a click pins it open
 * (the only route on touch, where there is no hover), Escape or a press
 * outside closes it. A pinned panel survives the pointer leaving; an unpinned
 * one closes on a short delay, which is what lets the pointer cross the gap
 * between chip and panel to scroll the list.
 */
export default function ChipsReveal({
  label,
  items,
  chipClassName,
  leading,
}: {
  label: string;
  items: string[];
  /** The caller's own count-chip classes, so the trigger keeps its colour. */
  chipClassName: string;
  /** Drawn before the count — the summary's Location row puts the primary
   *  place here, so the row still reads as a value rather than as a number. */
  leading?: React.ReactNode;
}) {
  /** The open panel's placement, measured off the trigger. Null = closed. */
  const [placement, setPlacement] = useState<{
    top: number;
    bottom: number;
    right: number;
    dropUp: boolean;
    listMaxHeight: number;
  } | null>(null);
  /** Set by a click: the panel then stays up until dismissed, not on hover. */
  const [pinned, setPinned] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isOpen = placement !== null;

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const close = useCallback(() => {
    cancelClose();
    setPlacement(null);
    setPinned(false);
  }, [cancelClose]);

  /* Measured once, at open time: the panel closes on any scroll or resize (see
     the dismissal effect below), so these viewport coordinates cannot go stale
     while it is up. */
  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const gutter = 12;
    const spaceBelow = window.innerHeight - rect.bottom - gutter;
    const spaceAbove = rect.top - gutter;
    /* Below by default; above only where below cannot hold a useful panel and
       above holds more. 160px is about the panel at its smallest useful size —
       its header plus a couple of rows of chips. */
    const dropUp = spaceBelow < 160 && spaceAbove > spaceBelow;
    /* What is left for the chips once the panel's header and padding are
       taken, capped so a thirty-skill group scrolls rather than filling the
       screen, and floored so a cramped viewport still shows a scrollable row
       or two instead of a sliver. */
    const room = (dropUp ? spaceAbove : spaceBelow) - 56;
    setPlacement({
      top: rect.top,
      bottom: rect.bottom,
      right: rect.right,
      dropUp,
      listMaxHeight: Math.max(88, Math.min(240, room)),
    });
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setPlacement(null), 140);
  }, [cancelClose]);

  useEffect(() => cancelClose, [cancelClose]);

  /**
   * Dismissal, the same rule the ⋮ menus on the Assessments page follow: a
   * pointer down anywhere outside, Escape, or the page moving under a panel
   * that was placed from viewport coordinates.
   *
   * The scroll listener is in the capture phase so a scroll inside any
   * container closes it, not just the window's — with the panel's own list
   * excluded, because scrolling the skills is the one scroll that must not
   * dismiss what it is scrolling.
   */
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && panelRef.current?.contains(target)) return;
      // The trigger toggles itself; closing here would let its own click
      // reopen the panel, so it would never appear to shut.
      if (target && triggerRef.current?.contains(target)) return;
      close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const handleScroll = (event: Event) => {
      const target = event.target as Node | null;
      if (target && panelRef.current?.contains(target)) return;
      close();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    };
  }, [isOpen, close]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={isOpen}
        aria-label={`${label}: ${items.length}. Show all`}
        title={`Show ${label.toLowerCase()}`}
        onPointerEnter={(e) => {
          if (e.pointerType !== 'mouse') return;
          cancelClose();
          place();
        }}
        onPointerLeave={(e) => {
          if (e.pointerType !== 'mouse' || pinned) return;
          scheduleClose();
        }}
        onClick={() => {
          if (pinned) {
            close();
            return;
          }
          place();
          setPinned(true);
        }}
        className={`${chipClassName} inline-flex items-center gap-1 cursor-pointer transition-shadow hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40`}
      >
        {leading}
        {items.length}
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {placement && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          onPointerEnter={cancelClose}
          onPointerLeave={(e) => {
            if (e.pointerType !== 'mouse' || pinned) return;
            scheduleClose();
          }}
          className="fixed z-[9999] w-64 max-w-[calc(100vw-1rem)] bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-xl shadow-brand-blue/10 p-3"
          style={{
            top: placement.dropUp ? undefined : placement.bottom + 6,
            bottom: placement.dropUp
              ? Math.max(8, window.innerHeight - placement.top + 6)
              : undefined,
            /* Right-aligned to the chip, which sits at the sidebar's right
               edge, and clamped so neither side of the panel leaves the
               viewport on a narrow screen. */
            left: Math.max(
              8,
              Math.min(
                placement.right - REVEAL_PANEL_WIDTH,
                window.innerWidth - REVEAL_PANEL_WIDTH - 8
              )
            ),
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="tf-caption">
              {label} ({items.length})
            </p>
            <IconButton bare label="Close"
              type="button"
              onClick={close}
              className="text-gray-500 hover:text-gray-600 flex-shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </IconButton>
          </div>
          <div className="mt-2 overflow-y-auto" style={{ maxHeight: placement.listMaxHeight }}>
            <div className="flex flex-wrap gap-1.5">
              {items.map(item => (
                <span
                  key={item}
                  className="tf-badge bg-slate-50 tf-micro-hint ring-1 ring-gray-200 break-words"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
