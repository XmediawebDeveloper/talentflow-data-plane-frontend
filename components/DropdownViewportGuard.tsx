'use client';

import { useEffect } from 'react';

/* ── Keep hand-rolled dropdowns on screen on phones ────────────────────
   Most menus in this app are an absolutely positioned panel under their
   trigger (`absolute top-full mt-2 …` or `absolute right-0 mt-2 …`). On a phone
   the trigger often sits low on the screen or near an edge, so the panel ran
   off the bottom (options out of sight — the resume page's Invite menu) or
   past a side. Radix menus (DropdownMenu / Select / Popover) already handle
   collisions and are not touched; this covers the hand-rolled ones, app-wide,
   without editing each.

   When a dropdown appears (mounted, or un-hidden by a class change) on a
   viewport narrower than `sm` (640px), it is measured against the visible
   area — the viewport, narrowed by any scrolling/clipping ancestor:
     - hangs below and overflows the bottom → flipped above its trigger when
       it fits there (or there is more room there); otherwise the page is
       scrolled just enough to show it;
     - hangs above (`bottom-full`) and overflows the top → flipped below, same
       rule;
     - overflows a side → nudged back in with the `translate` property.
   Only inline styles are written, and they are cleared before every
   re-measure, so a component's own classes stay the source of truth. Desktop
   (≥ 640px) is never touched. */

const PHONE_MAX = 640;
const EDGE = 8; // keep this far from the visible area's edges
const CANDIDATES = '.absolute[class*="shadow"], [role="menu"], [role="listbox"]';
const TOUCHED = 'data-tf-dd';

type Bounds = { top: number; bottom: number; left: number; right: number };

function visibleBounds(el: HTMLElement): Bounds {
  const b: Bounds = { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth };
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (cs.position === 'fixed') {
      // A fixed container (a modal panel) is its own frame; nothing above
      // it clips.
      const r = p.getBoundingClientRect();
      return { top: Math.max(b.top, r.top), bottom: Math.min(b.bottom, r.bottom), left: Math.max(b.left, r.left), right: Math.min(b.right, r.right) };
    }
    if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
      const r = p.getBoundingClientRect();
      if (cs.overflowY !== 'visible') { b.top = Math.max(b.top, r.top); b.bottom = Math.min(b.bottom, r.bottom); }
      if (cs.overflowX !== 'visible') { b.left = Math.max(b.left, r.left); b.right = Math.min(b.right, r.right); }
    }
  }
  return b;
}

function isDropdown(el: HTMLElement, cs: CSSStyleDeclaration): boolean {
  if (cs.position !== 'absolute') return false;
  if (el.closest('.tf-vscroll-root, [role="tooltip"], [data-radix-popper-content-wrapper]')) return false;
  if (cs.pointerEvents === 'none' || cs.visibility === 'hidden' || cs.display === 'none') return false;
  const role = el.getAttribute('role');
  if (role !== 'menu' && role !== 'listbox' && (cs.zIndex === 'auto' || cs.zIndex === '0')) return false;
  const h = el.offsetHeight;
  return h > 32 && h < window.innerHeight * 0.95 && el.offsetWidth > 60;
}

function reset(el: HTMLElement) {
  if (!el.hasAttribute(TOUCHED)) return;
  el.style.removeProperty('top');
  el.style.removeProperty('bottom');
  el.style.removeProperty('margin-top');
  el.style.removeProperty('margin-bottom');
  el.style.removeProperty('translate');
  el.removeAttribute(TOUCHED);
}

function fit(el: HTMLElement) {
  reset(el);
  const cs = getComputedStyle(el);
  if (!isDropdown(el, cs)) return;
  const anchor = el.offsetParent as HTMLElement | null;
  if (!anchor) return;

  const bounds = visibleBounds(el);
  const r = el.getBoundingClientRect();
  const a = anchor.getBoundingClientRect();
  /* A dropdown hangs wholly outside its positioned parent — below it or above
     it. Anything overlapping its parent (badges, overlays, cards' own
     decorations) is not one. The parent (the trigger's wrapper) must be on
     screen and trigger-sized: content further down the page, or a panel
     positioned off a whole card, is left alone. */
  const hangsBelow = r.top >= a.bottom - 2;
  const hangsAbove = r.bottom <= a.top + 2;
  if (!hangsBelow && !hangsAbove) return;
  if (a.top < bounds.top || a.bottom > bounds.bottom || a.height > 120) return;
  const roomAbove = a.top - bounds.top;
  const roomBelow = bounds.bottom - a.bottom;
  const gap = hangsBelow ? parseFloat(cs.marginTop) || 0 : parseFloat(cs.marginBottom) || 0;
  const need = r.height + gap + EDGE;

  if (hangsBelow && r.bottom > bounds.bottom - EDGE) {
    if (roomAbove >= need || roomAbove > roomBelow) {
      el.setAttribute(TOUCHED, '');
      el.style.top = 'auto';
      el.style.bottom = '100%';
      el.style.marginTop = '0px';
      el.style.marginBottom = `${gap}px`;
    } else {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  } else if (hangsAbove && r.top < bounds.top + EDGE) {
    if (roomBelow >= need || roomBelow > roomAbove) {
      el.setAttribute(TOUCHED, '');
      el.style.bottom = 'auto';
      el.style.top = '100%';
      el.style.marginBottom = '0px';
      el.style.marginTop = `${gap}px`;
    } else {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  // Sideways — skipped when the panel positions itself with a translate.
  if (cs.translate === 'none' && cs.transform === 'none') {
    const r2 = el.getBoundingClientRect();
    let dx = 0;
    if (r2.right > bounds.right - EDGE) dx = bounds.right - EDGE - r2.right;
    if (r2.left + dx < bounds.left + EDGE) dx = bounds.left + EDGE - r2.left;
    if (dx !== 0) {
      el.setAttribute(TOUCHED, '');
      el.style.translate = `${Math.round(dx)}px 0`;
    }
  }
}

export default function DropdownViewportGuard() {
  useEffect(() => {
    // Elements seen open, so each is fitted once per opening, not per frame.
    const open = new WeakSet<HTMLElement>();
    let frame = 0;

    const scan = () => {
      frame = 0;
      if (window.innerWidth >= PHONE_MAX) return;
      document.querySelectorAll<HTMLElement>(CANDIDATES).forEach((el) => {
        const shown = el.offsetParent !== null && el.offsetHeight > 0;
        if (!shown) { open.delete(el); return; }
        if (open.has(el)) return;
        open.add(el);
        fit(el);
      });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(scan); };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    schedule();
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
