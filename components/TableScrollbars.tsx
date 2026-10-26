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
/** Open dropdown menus / popovers, which are portalled over the table. */
/** A dimmed full-screen modal overlay — the same list globals.css's
 *  background scroll lock uses (keep them in step) — the Radix dialog overlay,
 *  or any `aria-modal` dialog. */
const MODAL_OVERLAY_SELECTOR =
  '.fixed.inset-0:not(.hidden):is([class*="bg-black"], [class*="bg-gray-900/"], [class*="bg-gray-800/"], [class*="bg-slate-900/"], [class*="bg-slate-950/"], [class*="bg-opacity-"]), [data-slot="dialog-overlay"], [aria-modal="true"]';
/** A table inside any of these is part of the popup, not behind it. */
const POPUP_CONTAINER_SELECTOR =
  '.fixed, [role="dialog"], [role="alertdialog"], [data-slot="dialog-content"]';
const OPEN_POPOVER_SELECTOR =
  '[role="menu"][data-state="open"], [data-radix-popper-content-wrapper], [data-tf-popover]';
/**
 * Marks a shell whose native bars are suppressed (see globals.css).
 *
 * A `data-` attribute, NOT a class, and that is the whole point: this mark is
 * written at runtime onto elements React renders, and React owns their `class`
 * attribute. Any re-render that changes a shell's className string rewrites the
 * whole attribute and takes a runtime-added class with it - which brought the
 * native bars back while this overlay was still drawing its own, so the table
 * showed TWO horizontal scrollbars (and two vertical ones) until it unmounted.
 * `ResumeTable`'s shell is one such shell: its class list ends in an
 * interpolated `${tableShellClassName}`.
 *
 * React never writes an attribute it did not render, so a data attribute
 * cannot be clobbered that way. `sync()` re-asserts it anyway, once per frame
 * per shell, so any other mechanism that strips it self-heals on the next
 * frame rather than leaving a doubled bar behind.
 */
const NATIVE_HIDDEN_ATTR = 'data-tf-native-bars';
const NATIVE_HIDDEN_VALUE = 'hidden';

const BAR_SIZE = 8;    // visible thumb thickness in px
const BAR_INSET = 2;   // gap between thumb and the shell's edge
const TRACK_PAD = 2;   // breathing room at both ends of a track
const MIN_THUMB = 28;  // keeps the thumb grabbable on very long tables
/** Height of the horizontal bar's reserved strip: its trough, its hit area, and
 *  the `padding-bottom` the shell gets from `[data-tf-xbar]` in globals.css.
 *  The three must agree, so they are one number. 16px is a native bar's
 *  thickness and twice the visible 8px, which is what makes the bar draggable
 *  by finger rather than by pixel-perfect mouse. */
const X_GUTTER = 16;
/** Marks a shell that overflows sideways, so globals.css can reserve the strip
 *  above. Set for the same reason as `data-tf-native-bars`: a data attribute is
 *  the only runtime mark React cannot clobber when it rewrites `class`. */
const XBAR_ATTR = 'data-tf-xbar';

type Axis = 'y' | 'x';

type Bar = {
  track: HTMLDivElement;
  thumb: HTMLDivElement;
  /** The opaque strip behind the bar. Horizontal axis only — see
   *  `.tf-vscroll-gutter` in globals.css. */
  gutter?: HTMLDivElement;
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
  probe.setAttribute(NATIVE_HIDDEN_ATTR, NATIVE_HIDDEN_VALUE);
  probe.style.cssText =
    'position:absolute;top:-9999px;left:-9999px;width:100px;height:100px;overflow:scroll;visibility:hidden';
  probe.appendChild(document.createElement('div')).style.cssText = 'width:300px;height:300px';
  document.body.appendChild(probe);
  const hidden =
    probe.offsetWidth - probe.clientWidth === 0 && probe.offsetHeight - probe.clientHeight === 0;
  probe.remove();
  return hidden;
}

/* ── Where a shell is actually VISIBLE ─────────────────────────────────
   The bars are drawn in a fixed, body-level overlay positioned from each
   shell's own `getBoundingClientRect()`. A rect knows nothing about what is
   painted over it, and that is the whole problem this pair of helpers solves:
   a shell scrolled half under the sticky page breadcrumb still reports its
   full rect, so a track drawn from `rect.top` runs up over the breadcrumb —
   and, past it, over the app header — at z-index 10000, above everything.
   That is the scrollbar-over-the-breadcrumb bug.

   Two stages, cheap one first:

     clipRect  — exact and free of hit-testing. Narrows the shell's box by
                 every ancestor that clips and by the window, which is what
                 answers the app scroll area's own edges and any
                 overflow-hidden card between.

     trimTop /
     trimBottom — for the occluders no clip rect describes, because they are
                 painted OVER the scrollport rather than clipping it: the
                 sticky breadcrumb, the app header, a banner, an open dialog.
                 Hit-tested, since "what is painted here" is the only question
                 that identifies them, and hit-testing is already how this file
                 answers it.

   Together they give the band where the shell is the topmost painted thing,
   and the bars are confined to it. */

/** The shell's box narrowed by every clipping ancestor, and by the window. */
function clipRect(shell: HTMLElement, rect: DOMRect) {
  let top = Math.max(rect.top, 0);
  let bottom = Math.min(rect.bottom, window.innerHeight);
  let left = Math.max(rect.left, 0);
  let right = Math.min(rect.right, window.innerWidth);
  for (let el = shell.parentElement; el && el !== document.documentElement; el = el.parentElement) {
    const cs = getComputedStyle(el);
    /* Anything but `visible` on either axis clips — `hidden`, `auto`,
       `scroll` and `clip` alike. Measured on the border box rather than the
       padding box the spec clips to: these wrappers carry no border, and a
       hairline's worth of error on a scrollbar inset is not worth a second
       round of computed-style reads per ancestor per frame. */
    if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
    const r = el.getBoundingClientRect();
    top = Math.max(top, r.top);
    bottom = Math.min(bottom, r.bottom);
    left = Math.max(left, r.left);
    right = Math.min(right, r.right);
  }
  return { top, bottom, left, right };
}

/* ── The trough's bottom corners ───────────────────────────────────────
   The trough is an opaque rectangle in the body-level overlay, so nothing in
   the table's own tree clips it. Where the shell sits in a rounded card
   (`rounded-xl border overflow-hidden`, every Job Details result tab) — or is
   rounded and bordered itself — the trough's square bottom corners painted over
   the card's curved bottom-left / bottom-right border, and the outline read as
   clipped there whenever the table scrolled sideways.

   So the trough takes the inner bottom radius of the element whose rounded
   corner it actually sits in: walking up from the shell through every element
   whose inner bottom edge is flush with the trough's, the first one with a
   bottom radius. A corner is only rounded where that element's inner side edge
   meets the trough's too. Clamped to the visible band (a table taller than the
   window) the trough is not at the card's bottom at all, the walk stops at the
   shell, and both corners stay square. Read per frame, like everything else in
   `sync`. */
function troughCornerRadii(shell: HTMLElement, left: number, right: number, bottom: number) {
  for (let el: HTMLElement | null = shell; el && el !== document.body; el = el.parentElement) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const bottomBorder = parseFloat(cs.borderBottomWidth || '0');
    if (Math.abs(r.bottom - bottomBorder - bottom) > 1) break;
    const outerLeft = parseFloat(cs.borderBottomLeftRadius || '0');
    const outerRight = parseFloat(cs.borderBottomRightRadius || '0');
    if (outerLeft <= 0 && outerRight <= 0) continue;
    const leftBorder = parseFloat(cs.borderLeftWidth || '0');
    const rightBorder = parseFloat(cs.borderRightWidth || '0');
    return {
      left: Math.abs(r.left + leftBorder - left) <= 1 ? Math.max(0, outerLeft - Math.max(leftBorder, bottomBorder)) : 0,
      right: Math.abs(r.right - rightBorder - right) <= 1 ? Math.max(0, outerRight - Math.max(rightBorder, bottomBorder)) : 0,
    };
  }
  return { left: 0, right: 0 };
}

/* Both trims assume the occluder is ONE contiguous band against the end being
   trimmed, which is what every occluder in this app is — a bar pinned to the
   top of a scroll container, or the window edge below. That assumption is what
   licenses a binary search, and the search is why this costs ~2 hit tests in
   the common case (nothing covering either end, both loops exit immediately)
   against the 3 the unconditional 3-point sample it replaces always spent.

   The iteration cap is belt-and-braces: the loop is already bounded by the
   halving, and a NaN coordinate is the only way it could fail to converge. */
const TRIM_STEPS = 12;

/* `to` is an exclusive edge, so the far end is probed one pixel inside it.
   Not a rounding nicety: when a table runs past the fold that edge IS the
   window's bottom, `elementFromPoint` returns null for a point outside the
   viewport, and probing it directly would report the band's own end as covered
   — sending both searches down the slow path on exactly the short viewports
   this code exists to get right. */
/** First y from `from` towards `to` where the shell is topmost; null if none. */
function trimTop(isShell: (y: number) => boolean, from: number, to: number): number | null {
  if (isShell(from)) return from;
  const far = to - 1;
  if (far <= from || !isShell(far)) return null;
  let covered = from;
  let clear = far;
  for (let i = 0; i < TRIM_STEPS && clear - covered > 1; i++) {
    const mid = (covered + clear) / 2;
    if (isShell(mid)) clear = mid;
    else covered = mid;
  }
  return clear;
}

/** Last y from `to` back towards `from` where the shell is topmost. */
function trimBottom(isShell: (y: number) => boolean, from: number, to: number): number | null {
  const far = to - 1;
  if (far <= from) return null;
  if (isShell(far)) return to;
  if (!isShell(from)) return null;
  let clear = from;
  let covered = far;
  for (let i = 0; i < TRIM_STEPS && covered - clear > 1; i++) {
    const mid = (clear + covered) / 2;
    if (isShell(mid)) clear = mid;
    else covered = mid;
  }
  return clear;
}

export default function TableScrollbars() {
  useEffect(() => {
    if (!nativeBarsCanBeHidden()) return;

    const root = document.createElement('div');
    root.className = 'tf-vscroll-root';
    /* Publish both thicknesses to the stylesheet, which needs their difference
       to leave the horizontal thumb painting exactly BAR_SIZE — the vertical
       bar's thickness — inside its taller track. Set here rather than restated
       in CSS so the two axes cannot end up different widths: this file is the
       one place either number is written. */
    root.style.setProperty('--tf-bar-size', `${BAR_SIZE}px`);
    root.style.setProperty('--tf-x-gutter', `${X_GUTTER}px`);
    document.body.appendChild(root);

    /* ── The click guard ──────────────────────────────────────────────────
       Belt to the geometry's braces. The gutter and the live horizontal track
       stop a press on the bar from ever REACHING a row, and that is the real
       fix; this catches the one case geometry cannot.

       A drag begins on the thumb and ends wherever the finger stopped — often
       over a row, or outside the shell entirely. Browsers differ on whether
       that produces a `click`, and on what they name as its target: a synthetic
       click on the element under the release point would run that row's
       navigation even though the user never tapped a row. So the first click
       after any press on a bar is swallowed in the capture phase, before it can
       reach a `<tr onClick>` or an <a>.

       Time-bounded rather than a bare flag: a press that produces no click at
       all (the common case — pointer capture usually suppresses it) must not
       leave a primed guard sitting there to eat somebody's next real click. */
    let barPressedAt = 0;
    const swallowClickAfterDrag = (event: Event) => {
      if (barPressedAt === 0 || performance.now() - barPressedAt > 1000) return;
      barPressedAt = 0;
      event.stopPropagation();
      event.preventDefault();
    };
    document.addEventListener('click', swallowClickAfterDrag, true);

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

      /* The trough goes in BEFORE the track so the bar paints over it. Only the
         horizontal axis gets one: the vertical bar has no reserved strip to
         paint (see the note on `.tf-vscroll-bar` in globals.css). */
      let gutter: HTMLDivElement | undefined;
      if (axis === 'x') {
        gutter = document.createElement('div');
        gutter.className = 'tf-vscroll-gutter';
        gutter.style.display = 'none';
        root.appendChild(gutter);
      }
      root.appendChild(track);

      let dragPointer: number | null = null;
      let startPos = 0;
      let startScroll = 0;

      const onPointerDown = (e: PointerEvent) => {
        if (e.button !== 0) return;
        e.preventDefault();
        // Arm the guard above for whatever click this gesture may produce.
        barPressedAt = performance.now();

        /* A press on the TROUGH rather than the thumb — only reachable on the
           horizontal axis, whose track is live. Jump so the thumb centres under
           the pointer and then drag on from there, which is what pressing a
           native trough does, and what makes the whole 16px strip useful
           instead of just the thumb. */
        if (e.target !== thumb) {
          const trackRect = track.getBoundingClientRect();
          const thumbRect = thumb.getBoundingClientRect();
          const travel =
            axis === 'y' ? trackRect.height - thumbRect.height : trackRect.width - thumbRect.width;
          if (travel > 0) {
            const offset =
              axis === 'y'
                ? e.clientY - trackRect.top - thumbRect.height / 2
                : e.clientX - trackRect.left - thumbRect.width / 2;
            const ratio = Math.min(1, Math.max(0, offset / travel));
            if (axis === 'y') {
              shell.scrollTop = ratio * (shell.scrollHeight - shell.clientHeight);
            } else {
              shell.scrollLeft = ratio * (shell.scrollWidth - shell.clientWidth);
            }
          }
        }

        dragPointer = e.pointerId;
        startPos = axis === 'y' ? e.clientY : e.clientX;
        // Read AFTER any jump above, so the drag continues from where the press
        // just put the thumb rather than snapping back.
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

      /* On the track, not the thumb: a press on the thumb bubbles up to it, so
         one listener serves both, and `e.target` above is what tells them
         apart. (Bubbling is unaffected by the vertical track's
         `pointer-events: none` — that only stops it being hit-tested itself.) */
      track.addEventListener('pointerdown', onPointerDown);

      return {
        track,
        thumb,
        gutter,
        dispose: () => {
          track.removeEventListener('pointerdown', onPointerDown);
          window.removeEventListener('pointermove', onPointerMove);
          window.removeEventListener('pointerup', endDrag);
          window.removeEventListener('pointercancel', endDrag);
          // A shell torn down mid-drag would otherwise leave the whole page
          // unselectable.
          if (dragPointer !== null) document.body.style.userSelect = '';
          track.remove();
          gutter?.remove();
        },
      };
    };

    /* ── geometry ──────────────────────────────────────────────────────
       Everything is derived per frame from the live layout; no state is
       cached, so a resized column, a filtered row set or a theme switch
       needs no invalidation step. */
    const sync = () => {
      const modalOpen = !!document.querySelector(MODAL_OVERLAY_SELECTOR);
      entries.forEach(({ y, x }, shell) => {
        /* Re-assert the suppression before measuring. Nothing should be able to
           strip it now that it is a data attribute React does not own, but a
           shell that has lost it renders its native bars UNDER the two this
           overlay is about to position - the doubled-scrollbar bug - and one
           attribute read per shell per frame is a cheap way to make that state
           unreachable rather than merely unlikely. */
        if (shell.getAttribute(NATIVE_HIDDEN_ATTR) !== NATIVE_HIDDEN_VALUE) {
          shell.setAttribute(NATIVE_HIDDEN_ATTR, NATIVE_HIDDEN_VALUE);
        }

        /* Reserve (or release) the horizontal bar's strip, which globals.css
           hangs `padding-bottom` off. Written before this frame's measurements
           so they describe the box the bar will actually be drawn in.

           Settles rather than oscillates: the padding only ever REDUCES the
           scrollport's height, and height cannot change whether the shell
           overflows sideways — so the flag's own input is untouched by the flag,
           and one frame after a table becomes sideways-scrollable it is stable.

           Re-asserted every frame, like the attribute above, for the same
           reason: nothing should strip it, and if something does it heals on
           the next frame instead of leaving the bar back over a row. */
        const wantsXBar = shell.scrollWidth - shell.clientWidth > 1;
        if (wantsXBar) {
          if (shell.getAttribute(XBAR_ATTR) !== '1') shell.setAttribute(XBAR_ATTR, '1');
        } else if (shell.hasAttribute(XBAR_ATTR)) {
          shell.removeAttribute(XBAR_ATTR);
        }

        const hideBoth = () => {
          y.track.style.display = 'none';
          x.track.style.display = 'none';
          if (x.gutter) x.gutter.style.display = 'none';
        };

        /* A row-actions menu (or any popper) open over the table: stand down.
           The occlusion probe below samples the shell's right edge, which an
           end-aligned menu covers, so it would read the menu's top as the end of
           the visible table and drag the horizontal bar up onto the first rows.
           The menu is modal and blocks scrolling, so hiding until it closes
           loses nothing. Same for every tab - they share one table. */
        if (document.querySelector(OPEN_POPOVER_SELECTOR)) return hideBoth();

        /* A modal overlay open and this table is behind it (not inside it):
           stand down too. The overlay root sits at z-index 10000, over every
           dialog, so a background table's bar showed through the dimmed
           backdrop beside the Score Table / View Resume popups. globals.css
           locks that table's scrolling while the overlay is open anyway. */
        if (modalOpen && !shell.closest(POPUP_CONTAINER_SELECTOR)) return hideBoth();

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
        // The horizontal bar's corner is its whole strip now, not just 8px.
        const reserveX = showX ? X_GUTTER : 0;

        // The sticky header covers the top of the content box at all times, so
        // the vertical track begins where the header ends. Capped at half the
        // viewport so a freakishly tall header can't produce a negative track.
        const thead = shell.querySelector('thead');
        const headerHeight = Math.min(thead ? thead.getBoundingClientRect().height : 0, viewH / 2);
        // Reassigned below, once the visible band is known.
        let trackTop = top + headerHeight + TRACK_PAD;
        let trackHeight = viewH - headerHeight - reserveX - TRACK_PAD * 2;

        /* Confine both bars to the band where the shell is really the topmost
           painted thing — see the helpers above. This is what keeps the
           vertical track off the sticky breadcrumb and the app header when the
           shell has scrolled up under them, and off the ground below the fold
           when it runs past the bottom of the window.

           It also still does what the 3-point sample it replaces did: a table
           behind an open dialog is covered along its whole track, both trims
           come back null, and neither bar is drawn. The difference is that a
           PARTIAL cover now trims the bar to the part you can see instead of
           choosing between drawing it over the top of something and not
           drawing it at all.

           `elementsFromPoint`, and skipping our own overlay in the stack, is
           load-bearing rather than fastidious. The overlay is interactive where
           it has to be (the horizontal track and its trough swallow taps so
           they cannot reach a row), which means a single-element hit test finds
           the trough sitting exactly where this probe looks, decides the shell
           is occluded there, and trims the band up by the trough's own height —
           whereupon the trough is redrawn higher and trims it again. A bar that
           climbs the table one frame at a time. Looking past our own elements
           to the topmost REAL one asks the question that was always meant:
           what, other than us, is painted here.

           The 6px offset from the thumb is kept even though seeing through the
           overlay makes it unnecessary, since probing a column's padding rather
           than the middle of its content is the cheaper hit test anyway. */
        /* Topmost REAL (non-overlay) element at a point is this shell — i.e. the
           shell is what's painted there, nothing is covering it. Skipping our
           own overlay is load-bearing: its live horizontal track/trough sit
           exactly where these probes look, so a naive hit test would find them
           and mistake the shell for occluded. */
        const isShellAt = (x: number, y: number) => {
          const stack = document.elementsFromPoint(Math.round(x), Math.round(y));
          for (const el of stack) {
            if (root.contains(el)) continue;
            return shell.contains(el);
          }
          return false;
        };
        const probeX = Math.round(left + viewW - BAR_SIZE - BAR_INSET - 6);
        const isShell = (probeY: number) => isShellAt(probeX, probeY);

        const clip = clipRect(shell, rect);

        /* How far down the shell is actually visible: its own box, narrowed by
           the clip rect and then by whatever is painted over it.

           This is the limit BOTH bars answer to, and it is deliberately the
           SHELL's bottom rather than the vertical track's. The vertical track
           additionally stops short of `reserveX` — the corner it leaves for the
           horizontal bar — and that inset belongs to the vertical track alone.
           Measuring the shared limit from it instead subtracted the corner
           twice and pushed the horizontal strip a corner's-worth up into the
           last row, which is the thing this strip exists to stay out of. */
        let bandTop = Math.max(trackTop, clip.top);
        let visibleBottom = Math.min(top + viewH, clip.bottom);
        if (visibleBottom - bandTop <= 0) return hideBoth();

        const trimmedTop = trimTop(isShell, bandTop, visibleBottom);
        if (trimmedTop === null) return hideBoth();
        const trimmedBottom = trimBottom(isShell, trimmedTop, visibleBottom);
        if (trimmedBottom === null) return hideBoth();
        bandTop = trimmedTop;
        visibleBottom = trimmedBottom;

        /* The visible band IS the track now. Sizing and offsetting the thumb
           against it — rather than windowing a longer virtual track — is what
           keeps the thumb on screen at every scroll position: a thumb placed
           on the full scrollport's track would sit inside the hidden strip
           whenever the table was scrolled to the top, i.e. no visible thumb on
           arrival. It also leaves the drag handler untouched, since that maps
           thumb travel from `track.getBoundingClientRect()`, which is this. */
        trackTop = bandTop;
        trackHeight = Math.min(top + viewH - reserveX - TRACK_PAD, visibleBottom) - bandTop;

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
          const trackLeft = Math.max(left + TRACK_PAD, clip.left);
          const trackWidth = Math.min(left + viewW - reserveY - TRACK_PAD, clip.right) - trackLeft;
          /* The bar occupies the strip the shell's `padding-bottom` reserved:
             the last X_GUTTER pixels of the scrollport, which no row reaches
             once the table is scrolled to its end. The track is that whole
             strip, not just the visible 8px, so the entire gutter drags.

             Pinned to the bottom of the VISIBLE band rather than of the box. On
             a short viewport a wide table's own bottom edge is regularly below
             the fold, and a bar drawn down there is a bar nobody can reach — on
             the very tables that need one most. Clamped rather than hidden for
             that reason; the band it is clamped into is ground the shell owns,
             so it cannot land on the breadcrumb (which is at the other end) or
             on anything else painted over the table. */
          const stripTop = Math.min(top + viewH - X_GUTTER, visibleBottom - X_GUTTER);
          const gutterLeft = Math.max(left, clip.left);
          const gutterWidth = Math.min(left + viewW, clip.right) - gutterLeft;

          /* The vertical band was trimmed off a single probe column at the
             table's far-right edge (probeX). That answers a full-width occluder
             — a dialog, the sticky breadcrumb — but not a popover that covers
             the MIDDLE of the strip while leaving that right-edge column clear:
             the filter dropdown is anchored to its trigger button, inset from
             the table's right edge, so it never reaches probeX and the band
             stays untrimmed — leaving the horizontal bar to paint straight
             across the open panel. Sample along the strip's own width and drop
             the bar if anything real is painted over it; it comes back the
             frame after the popover closes. */
          const stripMidY = stripTop + X_GUTTER / 2;
          const X_OCCLUSION_SAMPLES = 8;
          /* A resize handle on a neighbouring panel (e.g. FolderTree's, which
             deliberately straddles its own border by a few px either side so
             it's grabbable right at the divider — see `-right-1 w-2` there)
             sits exactly on the shell's edge without covering any of its real
             content. Sampling the track's bare edge finds that handle and
             mistakes it for an occluder, hiding the bar on every table beside
             such a panel. Insetting the sampled range clears it while a genuine
             full-width occluder (a dialog, the sticky breadcrumb) still covers
             every inset sample same as before. */
          const EDGE_INSET = 8;
          const sampledWidth = Math.max(0, trackWidth - EDGE_INSET * 2);
          let xOccluded = false;
          for (let i = 0; i <= X_OCCLUSION_SAMPLES; i++) {
            const sampleX = trackLeft + EDGE_INSET + (sampledWidth * i) / X_OCCLUSION_SAMPLES;
            if (!isShellAt(sampleX, stripMidY)) {
              xOccluded = true;
              break;
            }
          }

          if (trackWidth < MIN_THUMB || stripTop < bandTop || xOccluded) {
            x.track.style.display = 'none';
            if (x.gutter) x.gutter.style.display = 'none';
          } else {
            const thumbWidth = Math.max(MIN_THUMB, trackWidth * (viewW / shell.scrollWidth));
            const offset = (shell.scrollLeft / scrollableX) * (trackWidth - thumbWidth);

            /* Trough first, spanning the full scrollport width — the bar's
               track is inset by TRACK_PAD and by the vertical bar's corner, and
               a trough that stopped where the track does would leave a sliver
               of row showing at each end. */
            if (x.gutter) {
              /* Rounded to the card's inner corners where it meets them — see
                 `troughCornerRadii`. */
              const corners = troughCornerRadii(shell, gutterLeft, gutterLeft + gutterWidth, stripTop + X_GUTTER);
              x.gutter.style.display = 'block';
              x.gutter.style.transform = `translate3d(${gutterLeft}px, ${stripTop}px, 0)`;
              x.gutter.style.width = `${Math.max(0, gutterWidth)}px`;
              x.gutter.style.height = `${X_GUTTER}px`;
              x.gutter.style.borderBottomLeftRadius = `${corners.left}px`;
              x.gutter.style.borderBottomRightRadius = `${corners.right}px`;
            }

            x.track.style.display = 'block';
            x.track.style.transform = `translate3d(${trackLeft}px, ${stripTop}px, 0)`;
            x.track.style.width = `${trackWidth}px`;
            x.track.style.height = `${X_GUTTER}px`;
            x.thumb.style.width = `${thumbWidth}px`;
            x.thumb.style.transform = `translateX(${offset}px)`;
          }
        } else {
          x.track.style.display = 'none';
          if (x.gutter) x.gutter.style.display = 'none';
        }
      });
    };

    const attach = (shell: HTMLElement) => {
      shell.setAttribute(NATIVE_HIDDEN_ATTR, NATIVE_HIDDEN_VALUE);

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
          shell.removeAttribute(NATIVE_HIDDEN_ATTR);
          shell.removeAttribute(XBAR_ATTR);
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
      document.removeEventListener('click', swallowClickAfterDrag, true);
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
