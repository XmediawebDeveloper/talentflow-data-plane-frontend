import type { KeyboardEvent } from 'react';

/**
 * Keyboard access for elements that are clickable but aren't a <button> or
 * <a> — cards, list rows, table rows, chips (accessibility §14: "keyboard
 * navigable").
 *
 * Spread one of these on an element that already has an `onClick`:
 *
 *   <div onClick={open} {...clickableProps}>…</div>
 *   <tr onClick={open} {...clickableRowProps}>…</tr>
 *
 * It makes the element reachable with Tab and fires its own click on Enter or
 * Space — by calling the element's `.click()`, so the existing onClick runs
 * exactly as it does for the mouse (same MouseEvent, same bubbling) and no
 * handler has to change.
 *
 * A key pressed on a control INSIDE the element (a ⋮ button, a checkbox in a
 * row) is ignored here: only keys aimed at the element itself activate it, so
 * nested controls never trigger the row behind them.
 */
export function activateOnKey(e: KeyboardEvent<HTMLElement>) {
  if (e.target !== e.currentTarget) return;
  if (e.key !== 'Enter' && e.key !== ' ') return;
  // Space would scroll the page; Enter could submit an enclosing form.
  e.preventDefault();
  if (e.repeat) return;
  e.currentTarget.click();
}

/** An action (opens, toggles, selects). */
export const clickableProps = {
  role: 'button',
  tabIndex: 0,
  onKeyDown: activateOnKey,
} as const;

/** Goes to another page or view. */
export const clickableLinkProps = {
  role: 'link',
  tabIndex: 0,
  onKeyDown: activateOnKey,
} as const;

/**
 * A clickable table row or cell. No role: `button` would replace the row's
 * own semantics, and screen readers rely on them to read the table.
 */
export const clickableRowProps = {
  tabIndex: 0,
  onKeyDown: activateOnKey,
} as const;
