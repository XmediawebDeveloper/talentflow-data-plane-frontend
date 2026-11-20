'use client';

import { cloneElement, isValidElement, useCallback, useLayoutEffect, useRef, type ReactElement, type Ref } from 'react';

/**
 * Keyboard & screen-reader behaviour for the hand-rolled modals
 * (`fixed inset-0` overlay + panel) — accessibility §14:
 *
 *  - Escape closes the TOPMOST modal only. It "clicks" the overlay, so the
 *    modal's own backdrop handler runs with all its guards (e.g. not while
 *    saving); a modal without one falls back to its Close / Cancel button, and
 *    a modal with neither stays open (it isn't meant to be dismissed).
 *  - Tab / Shift+Tab stay inside the modal.
 *  - Focus moves into the modal when it opens (unless something inside already
 *    took it, e.g. `autoFocus`) and goes back to the trigger when it closes.
 *  - role="dialog", aria-modal and aria-labelledby (its first heading).
 *
 * Wrap the overlay element; nothing is added to the DOM:
 *
 *   {open && (
 *     <ModalA11y>
 *       <div className="fixed inset-0 …" onClick={onClose}>…panel…</div>
 *     </ModalA11y>
 *   )}
 *
 * Modals built on components/ui/app-modal.tsx or Radix Dialog already behave
 * like this and don't need it.
 */

export interface ModalA11yOptions {
  /** Called on Escape instead of clicking the overlay. */
  onClose?: () => void;
  /** false: no Escape handling here (the modal already handles Escape itself). */
  closeOnEscape?: boolean;
  /**
   * The panel inside the overlay is already the `role="dialog"` element: keep
   * the behaviour (Escape, trap, focus return) on the overlay but leave the
   * dialog role, aria-modal and naming to that panel.
   */
  innerDialog?: boolean;
}

type Layer = { el: HTMLElement; opts: { current: ModalA11yOptions } };
const stack: Layer[] = [];

const FOCUSABLE = [
  'a[href]', 'area[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', 'iframe', 'audio[controls]', 'video[controls]',
  '[contenteditable]:not([contenteditable="false"])', '[tabindex]:not([tabindex="-1"])',
].join(',');
/* A modal's own close control: `data-modal-close`, or a button whose name is
   exactly "Close" / "Cancel" / "Dismiss" (optionally "… dialog/modal/popup"),
   so an action like "Cancel subscription" is never pressed by Escape. */
const CLOSE_NAME = /^(close|cancel|dismiss)( (dialog|modal|popup|window|panel|preview))?$/i;
function findCloseControl(root: HTMLElement): HTMLElement | null {
  const marked = root.querySelector<HTMLElement>('[data-modal-close]');
  if (marked) return marked;
  for (const btn of Array.from(root.querySelectorAll<HTMLElement>('button'))) {
    if (btn.hasAttribute('disabled') || btn.getAttribute('aria-disabled') === 'true' || !visible(btn)) continue;
    const name = (btn.getAttribute('aria-label') || btn.getAttribute('title') || btn.textContent || '').trim();
    if (CLOSE_NAME.test(name)) return btn;
  }
  return null;
}
/* Popups that render outside the modal (portals) but belong to it. */
const PORTAL_LAYER = '[data-radix-popper-content-wrapper], [data-radix-portal], [role="listbox"], [role="menu"], [data-sonner-toaster]';

const visible = (el: HTMLElement) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
const focusablesIn = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => visible(el) && !el.closest('[inert]'));
let idSeq = 0;

function onKeyDown(e: KeyboardEvent) {
  const top = stack[stack.length - 1];
  // A modal kept mounted but hidden (e.g. minimised to a progress chip) must
  // not hold the keyboard.
  if (!top || !top.el.isConnected || !visible(top.el)) return;
  const { el, opts } = top;

  if (e.key === 'Escape') {
    // Already handled by something inside (a Radix menu/select closing), or IME.
    if (e.defaultPrevented || e.isComposing || opts.current.closeOnEscape === false) return;
    e.preventDefault();
    if (opts.current.onClose) { opts.current.onClose(); return; }
    // React's onClick is delegated, so a real click on the overlay runs the
    // modal's own backdrop handler — guards and all.
    el.click();
    // No backdrop handler (or it chose to stay open): give React a tick to
    // re-render, then fall back to the modal's own Close / Cancel button.
    setTimeout(() => {
      if (!el.isConnected || stack[stack.length - 1] !== top) return;
      findCloseControl(el)?.click();
    }, 0);
    return;
  }

  if (e.key !== 'Tab') return;
  const items = focusablesIn(el);
  const active = document.activeElement as HTMLElement | null;
  if (active && !el.contains(active) && active.closest(PORTAL_LAYER)) return; // a popover of this modal
  if (!items.length) { e.preventDefault(); el.focus({ preventScroll: true }); return; }
  const first = items[0];
  const last = items[items.length - 1];
  if (!active || !el.contains(active) || active === el) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  } else if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

/**
 * Hook form: returns a ref for the overlay element. Active while that element
 * is mounted — no `open` flag needed.
 */
export function useModalA11y(options: ModalA11yOptions = {}) {
  const opts = useRef(options);
  useLayoutEffect(() => { opts.current = options; });
  const cleanup = useRef<(() => void) | null>(null);

  return useCallback((el: HTMLElement | null) => {
    cleanup.current?.();
    cleanup.current = null;
    if (!el) return;

    const trigger = document.activeElement as HTMLElement | null;
    const layer: Layer = { el, opts };
    stack.push(layer);
    if (stack.length === 1) window.addEventListener('keydown', onKeyDown);

    // Name the dialog after its first heading, unless it is already named
    // (or the dialog is an inner panel that names itself).
    if (!opts.current.innerDialog && !el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) {
      const heading = el.querySelector<HTMLElement>('[data-dialog-title], h1, h2, h3, h4');
      if (heading) {
        if (!heading.id) heading.id = `modal-title-${++idSeq}`;
        el.setAttribute('aria-labelledby', heading.id);
      }
    }

    // Move focus in, unless the modal already focused something (autoFocus).
    const raf = requestAnimationFrame(() => {
      if (!el.isConnected || el.contains(document.activeElement)) return;
      el.focus({ preventScroll: true });
    });

    cleanup.current = () => {
      cancelAnimationFrame(raf);
      const i = stack.indexOf(layer);
      if (i >= 0) stack.splice(i, 1);
      if (!stack.length) window.removeEventListener('keydown', onKeyDown);
      // Back to the trigger — only if focus was inside the modal (or got lost
      // to <body> when it unmounted), never away from something the user chose.
      const active = document.activeElement;
      const lost = !active || active === document.body || el.contains(active);
      if (lost && trigger && trigger.isConnected && trigger !== document.body) {
        trigger.focus({ preventScroll: true });
      }
    };
  }, []);
}

type ChildProps = { ref?: Ref<HTMLElement>; role?: string; tabIndex?: number; 'aria-modal'?: boolean | 'true' | 'false' };

/**
 * Component form of useModalA11y — wraps a single overlay element, adds no
 * DOM. The overlay must not carry its own `ref` (this one replaces it); an
 * overlay that needs one uses the useModalA11y hook and merges the refs.
 */
export function ModalA11y({ children, onClose, closeOnEscape, innerDialog }: ModalA11yOptions & { children: ReactElement }) {
  const ref = useModalA11y({ onClose, closeOnEscape, innerDialog });
  const child = isValidElement<ChildProps>(children) ? children : null;
  if (!child) return children;
  return cloneElement(child, {
    ref,
    ...(innerDialog ? {} : {
      role: child.props.role ?? 'dialog',
      'aria-modal': child.props['aria-modal'] ?? true,
    }),
    tabIndex: child.props.tabIndex ?? -1,
    'data-modal-a11y': '',
  } as ChildProps);
}
