'use client';

import { useEffect } from 'react';

/* ── Custom scrollbars for data tables ─────────────────────────────────
   Hides the native scrollbars on every `.tf-table-shell` and draws them as an
   overlay, with the vertical track starting *below* the sticky <thead>.

   Why this exists: a native scrollbar always spans the full height of the box
   that owns it. `.tf-table-shell` is a single scroll container carrying both
   axes (see the note above the class in globals.css — moving the row overflow
   to an inner element drags the vertical bar off-screen on a wide table), and
   the header is sticky *inside* that box. So natively the track can only ever
   begin at the top of the header. Drawing our own is the only way to keep the
   one-scroll-container rule and still start the track under the header.

   Both bars are drawn, not just the vertical one, because the only way to hide
   a native bar here is `scrollbar-width: none` — Chrome ignores
   `::-webkit-scrollbar` rules as soon as `scrollbar-width` is specified, and
   globals.css specifies it on `*`. That property has no per-axis form, so
   suppressing the vertical bar takes the horizontal one with it.

   Nothing here restructures the table. The shell keeps scrolling natively —
   wheel, trackpad, keyboard, touch and scroll-into-view all behave exactly as
   before; only the bars' *rendering* is taken over. The overlay lives in its
   own div under <body>, never inside React-managed DOM, so it cannot interfere
   with reconciliation.

   Shells are discovered by class, so every table gets this for free, including
   ones mounted later by a route change or a dialog. */

const SHELL_SELECTOR = '.tf-table-shell';
/** Marks a shell whose native bars are suppressed (see globals.css). */
const NATIVE_HIDDEN_CLASS = 'tf-vscroll-custom';

const BAR_SIZE = 8;    // thumb thickness in px
const BAR_INSET = 2;   // gap between thumb and the shell's edge
const TRACK_PAD = 2;   // breathing room at both ends of a track
const MIN_THUMB = 28;  // keeps the thumb grabbable on very long tables

type Axis = 'y' | 'x';

type Bar = {
  track: HTMLDivElement;
  thumb: HTMLDivElement;
  dispose: () => void;
};

type Entry = {
  y: Bar;
  x: Bar;
  dispose: () => void;
};

/** Verifies the shell class really does remove the native bars before any are
 *  hidden — if the stylesheet were missing or a future browser ignored the
 *  rule, doing nothing leaves working native bars rather than none at all. */
function nativeBarsCanBeHidden(): boolean {
  const probe = document.createElement('div');
  probe.className = NATIVE_HIDDEN_CLASS;
  probe.style.cssText =
    'position:absolute;top:-9999px;left:-9999px;width:100px;height:100px;overflow:scroll;visibility:hidden';
  probe.appendChild(document.createElement('div')).style.cssText = 'width:300px;height:300px';
  document.body.appendChild(probe);
  const hidden =
    probe.offsetWidth - probe.clientWidth === 0 && probe.offsetHeight - probe.clientHeight === 0;
  probe.remove();
  return hidden;
}

export default function TableScrollbars() {
  useEffect(() => {
    if (!nativeBarsCanBeHidden()) return;

    const root = document.createElement('div');
    root.className = 'tf-vscroll-root';
    document.body.appendChild(root);

    const entries = new Map<HTMLElement, Entry>();
    let syncFrame = 0;
    let scanFrame = 0;

    const scheduleSync = () => {
      if (syncFrame) return;
      syncFrame = requestAnimationFrame(() => {
        syncFrame = 0;
        sync();
      });
    };

    const scheduleScan = () => {
      if (scanFrame) return;
      scanFrame = requestAnimationFrame(() => {
        scanFrame = 0;
        scan();
      });
    };

    const resizeObserver = new ResizeObserver(scheduleSync);

    /* ── one bar (either axis) ───────────────────────────────────────────
       Dragging maps thumb travel back onto scrollTop/scrollLeft. Pointer
       capture keeps the gesture alive once the cursor leaves the 8px thumb,
       which is most of any real drag. */
    const createBar = (shell: HTMLElement, axis: Axis): Bar => {
      const track = document.createElement('div');
      track.className = `tf-vscroll-bar tf-vscroll-bar--${axis}`;
      track.style.display = 'none';

      const thumb = document.createElement('div');
      thumb.className = 'tf-vscroll-thumb';
      track.appendChild(thumb);
      root.appendChild(track);

      let dragPointer: number | null = null;
      let startPos = 0;
      let startScroll = 0;

      const onPointerDown = (e: PointerEvent) => {
        if (e.button !== 0) return;
        e.preventDefault();
        dragPointer = e.pointerId;
        startPos = axis === 'y' ? e.clientY : e.clientX;
        startScroll = axis === 'y' ? shell.scrollTop : shell.scrollLeft;
        // The gesture is tracked on window, not on the thumb: an 8px target is
        // left behind within a few pixels of any real drag, and capture alone
        // has proven an unreliable way to keep the moves coming. Capture is
        // still requested — it suppresses hover states on everything the
        // cursor crosses — but the drag does not depend on it.
        try {
          thumb.setPointerCapture(e.pointerId);
        } catch {
          /* capture is a nicety; ignore browsers that refuse the pointer */
        }
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', endDrag);
        window.addEventListener('pointercancel', endDrag);
        thumb.classList.add('is-dragging');
        document.body.style.userSelect = 'none';
      };

      const onPointerMove = (e: PointerEvent) => {
        if (dragPointer !== e.pointerId) return;
        const trackRect = track.getBoundingClientRect();
        const thumbRect = thumb.getBoundingClientRect();
        const travel =
          axis === 'y' ? trackRect.height - thumbRect.height : trackRect.width - thumbRect.width;
        if (travel <= 0) return;
        const delta = (axis === 'y' ? e.clientY : e.clientX) - startPos;
        if (axis === 'y') {
          const scrollable = shell.scrollHeight - shell.clientHeight;
          shell.scrollTop = startScroll + (delta / travel) * scrollable;
        } else {
          const scrollable = shell.scrollWidth - shell.clientWidth;
          shell.scrollLeft = startScroll + (delta / travel) * scrollable;
        }
      };

      const endDrag = (e: PointerEvent) => {
        if (dragPointer !== e.pointerId) return;
        dragPointer = null;
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', endDrag);
        window.removeEventListener('pointercancel', endDrag);
        try {
          thumb.releasePointerCapture(e.pointerId);
        } catch {
          /* capture may never have been granted */
        }
        thumb.classList.remove('is-dragging');
        document.body.style.userSelect = '';
        scheduleSync();
      };

      thumb.addEventListener('pointerdown', onPointerDown);

      return {
        track,
        thumb,
        dispose: () => {
          thumb.removeEventListener('pointerdown', onPointerDown);
          window.removeEventListener('pointermove', onPointerMove);
          window.removeEventListener('pointerup', endDrag);
          window.removeEventListener('pointercancel', endDrag);
          // A shell torn down mid-drag would otherwise leave the whole page
          // unselectable.
          if (dragPointer !== null) document.body.style.userSelect = '';
          track.remove();
        },
      };
    };

    /* ── geometry ──────────────────────────────────────────────────────
       Everything is derived per frame from the live layout; no state is
       cached, so a resized column, a filtered row set or a theme switch
       needs no invalidation step. */
    const sync = () => {
      entries.forEach(({ y, x }, shell) => {
        const hideBoth = () => {
          y.track.style.display = 'none';
          x.track.style.display = 'none';
        };

        const rect = shell.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return hideBoth();

        const scrollableY = shell.scrollHeight - shell.clientHeight;
        const scrollableX = shell.scrollWidth - shell.clientWidth;
        const showY = scrollableY > 1;
        const showX = scrollableX > 1;
        if (!showY && !showX) return hideBoth();

        const cs = getComputedStyle(shell);
        const left = rect.left + parseFloat(cs.borderLeftWidth || '0');
        const top = rect.top + parseFloat(cs.borderTopWidth || '0');
        // With the native bars gone, client* is the full painted content box.
        const viewW = shell.clientWidth;
        const viewH = shell.clientHeight;

        // Each bar keeps clear of the other's corner.
        const reserveY = showY ? BAR_SIZE + BAR_INSET : 0;
        const reserveX = showX ? BAR_SIZE + BAR_INSET : 0;

        // The sticky header covers the top of the content box at all times, so
        // the vertical track begins where the header ends. Capped at half the
        // viewport so a freakishly tall header can't produce a negative track.
        const thead = shell.querySelector('thead');
        const headerHeight = Math.min(thead ? thead.getBoundingClientRect().height : 0, viewH / 2);
        const trackTop = top + headerHeight + TRACK_PAD;
        const trackHeight = viewH - headerHeight - reserveX - TRACK_PAD * 2;

        /* Hide both bars when whatever is painted where they'd go isn't the
           table — an open dialog, a popover, or the shell scrolled out of the
           window. Without this, a table on the page behind a modal would float
           its bars over the modal.

           Sampled along the vertical track rather than at the shell's centre,
           because that is the ground the bars actually occupy: a table whose
           top has slid under the sticky page header is still perfectly visible
           lower down, and should keep its bars. Three points so a dropdown
           clipping one end doesn't take the whole bar with it, and 6px clear
           of the thumb so it never hit-tests itself. */
        const probeX = Math.round(left + viewW - BAR_SIZE - BAR_INSET - 6);
        const visible = [0.15, 0.5, 0.85].some((fraction) => {
          const hit = document.elementFromPoint(
            probeX,
            Math.round(trackTop + trackHeight * fraction)
          );
          return !!hit && shell.contains(hit);
        });
        if (!visible) return hideBoth();

        if (showY) {
          if (trackHeight < MIN_THUMB) {
            y.track.style.display = 'none';
          } else {
            const thumbHeight = Math.max(MIN_THUMB, trackHeight * (viewH / shell.scrollHeight));
            const offset = (shell.scrollTop / scrollableY) * (trackHeight - thumbHeight);
            y.track.style.display = 'block';
            y.track.style.transform = `translate3d(${left + viewW - BAR_SIZE - BAR_INSET}px, ${trackTop}px, 0)`;
            y.track.style.width = `${BAR_SIZE}px`;
            y.track.style.height = `${trackHeight}px`;
            y.thumb.style.height = `${thumbHeight}px`;
            y.thumb.style.transform = `translateY(${offset}px)`;
          }
        } else {
          y.track.style.display = 'none';
        }

        if (showX) {
          const trackLeft = left + TRACK_PAD;
          const trackWidth = viewW - reserveY - TRACK_PAD * 2;

          if (trackWidth < MIN_THUMB) {
            x.track.style.display = 'none';
          } else {
            const thumbWidth = Math.max(MIN_THUMB, trackWidth * (viewW / shell.scrollWidth));
            const offset = (shell.scrollLeft / scrollableX) * (trackWidth - thumbWidth);
            x.track.style.display = 'block';
            x.track.style.transform = `translate3d(${trackLeft}px, ${top + viewH - BAR_SIZE - BAR_INSET}px, 0)`;
            x.track.style.width = `${trackWidth}px`;
            x.track.style.height = `${BAR_SIZE}px`;
            x.thumb.style.width = `${thumbWidth}px`;
            x.thumb.style.transform = `translateX(${offset}px)`;
          }
        } else {
          x.track.style.display = 'none';
        }
      });
    };

    const attach = (shell: HTMLElement) => {
      shell.classList.add(NATIVE_HIDDEN_CLASS);

      const y = createBar(shell, 'y');
      const x = createBar(shell, 'x');

      resizeObserver.observe(shell);
      const table = shell.querySelector('table');
      if (table) resizeObserver.observe(table);

      entries.set(shell, {
        y,
        x,
        dispose: () => {
          resizeObserver.unobserve(shell);
          if (table) resizeObserver.unobserve(table);
          y.dispose();
          x.dispose();
          shell.classList.remove(NATIVE_HIDDEN_CLASS);
        },
      });
    };

    const scan = () => {
      const found = new Set(document.querySelectorAll<HTMLElement>(SHELL_SELECTOR));
      entries.forEach((entry, shell) => {
        if (found.has(shell) && shell.isConnected) return;
        entry.dispose();
        entries.delete(shell);
      });
      let attached = 0;
      found.forEach((shell) => {
        if (entries.has(shell)) return;
        attach(shell);
        attached++;
      });
      sync();
      // A shell measured in the same frame it appeared hit-tests as still
      // covered by whatever it is replacing, so that first sync hides its bars
      // and — on a table that then sits still — nothing would come along to
      // show them again. One more pass a frame later, once the new layout is
      // the one being hit-tested.
      if (attached) requestAnimationFrame(scheduleSync);
    };

    scan();

    // Capture phase so scrolling *any* ancestor — the dashboard main area, a
    // dialog body — repositions the overlay, not just the shell itself.
    document.addEventListener('scroll', scheduleSync, { capture: true, passive: true });
    window.addEventListener('resize', scheduleSync);
    const mutationObserver = new MutationObserver(scheduleScan);
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener('scroll', scheduleSync, { capture: true });
      window.removeEventListener('resize', scheduleSync);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      if (syncFrame) cancelAnimationFrame(syncFrame);
      if (scanFrame) cancelAnimationFrame(scanFrame);
      entries.forEach((entry) => entry.dispose());
      entries.clear();
      root.remove();
    };
  }, []);

  return null;
}
