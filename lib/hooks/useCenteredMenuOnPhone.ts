'use client';

import { useLayoutEffect, type RefObject } from 'react';

/** Phones: below the `sm` breakpoint (640px). */
const PHONE_MAX_WIDTH = 640;

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
      const viewport = document.documentElement.clientWidth;
      const left = (viewport - menu.offsetWidth) / 2 - anchor.getBoundingClientRect().left;
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
  if (!menu || typeof window === 'undefined' || window.innerWidth >= PHONE_MAX_WIDTH) return;
  const anchor = menu.offsetParent as HTMLElement | null;
  if (!anchor) return;
  const viewport = document.documentElement.clientWidth;
  menu.style.left = `${Math.round((viewport - menu.offsetWidth) / 2 - anchor.getBoundingClientRect().left)}px`;
  menu.style.right = 'auto';
}
