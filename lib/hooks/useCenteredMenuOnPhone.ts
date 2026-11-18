'use client';

import { useLayoutEffect, type RefObject } from 'react';

/** Phones: below the `sm` breakpoint (640px). */
const PHONE_MAX_WIDTH = 640;

/**
 * The left edge a menu `menuWidth` wide must have to sit centred on the page's
 * visible content: the nearest scrolling ancestor of `from`, minus its scrollbar.
 * Centring on the raw viewport instead put the menu off-centre whenever a
 * classic (mouse) scrollbar narrowed the page — the content shifted left by the
 * scrollbar's width and the menu stuck out past the field on the right.
 */
export function phoneCentredLeft(from: Element, menuWidth: number): number {
  const { left, width } = phoneContentBox(from);
  return left + (width - menuWidth) / 2;
}

/** The visible page content box around `from` (nearest scrolling ancestor, scrollbar excluded). */
export function phoneContentBox(from: Element): { left: number; width: number } {
  for (let el = from.parentElement; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) {
      return { left: el.getBoundingClientRect().left + el.clientLeft, width: el.clientWidth };
    }
  }
  return { left: 0, width: document.documentElement.clientWidth };
}

/**
 * Centres an absolutely positioned dropdown horizontally on the screen on phones.
 *
 * A menu anchored to its trigger's left / right edge (`absolute left-0` /
 * `right-0`) lands hard against one side of a 320–400px screen whenever the
 * trigger isn't in the middle. On phones this overrides the menu's horizontal
 * position so it sits in the centre of the viewport, still opening below / above
 * its trigger. From `sm` up the menu's own classes apply unchanged.
 *
 * `anchorRef` is the menu's positioned (`relative`) parent; `menuRef` the menu.
 */
export function useCenteredMenuOnPhone(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  menuRef: RefObject<HTMLElement | null>,
) {
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const menu = menuRef.current;
      const anchor = anchorRef.current;
      if (!menu || !anchor) return;
      if (window.innerWidth >= PHONE_MAX_WIDTH) {
        menu.style.left = '';
        menu.style.right = '';
        return;
      }
      const left = phoneCentredLeft(anchor, menu.offsetWidth) - anchor.getBoundingClientRect().left;
      menu.style.left = `${Math.round(left)}px`;
      menu.style.right = 'auto';
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, anchorRef, menuRef]);
}

/**
 * Ref-callback form of `useCenteredMenuOnPhone`, for a menu rendered inside a list
 * (where a hook can't be called per row): `<div ref={centerMenuOnPhoneRef} …>`.
 * The menu's positioned parent (`offsetParent`) is the anchor.
 */
export function centerMenuOnPhoneRef(menu: HTMLElement | null) {
  if (!menu || typeof window === 'undefined') return;
  const anchor = menu.offsetParent as HTMLElement | null;
  if (!anchor) return;
  flipUpIfClipped(menu, anchor);
  if (window.innerWidth >= PHONE_MAX_WIDTH) return;
  menu.style.left = `${Math.round(phoneCentredLeft(anchor, menu.offsetWidth) - anchor.getBoundingClientRect().left)}px`;
  menu.style.right = 'auto';
}

/**
 * At every width: a menu that would run past the bottom of the screen (a row near
 * the end of the list) opens upward from its button instead, as the shared
 * dropdown menus do — only when there is more room above than below.
 */
function flipUpIfClipped(menu: HTMLElement, anchor: HTMLElement) {
  const menuRect = menu.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();
  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const spaceAbove = anchorRect.top;
  if (menuRect.bottom <= window.innerHeight - 8 || spaceAbove <= spaceBelow) return;
  menu.style.top = 'auto';
  menu.style.bottom = '100%';
  menu.style.marginTop = '0';
  menu.style.marginBottom = '0.25rem';
}
