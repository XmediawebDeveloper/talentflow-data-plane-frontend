'use client';

import { useEffect } from 'react';

/* ── Ten-row height for data tables ────────────────────────────────────
   Sizes every `.tf-table-shell` to its header plus its first VISIBLE_ROWS body
   rows: up to ten rows the whole table shows with no inner scroll, past ten
   exactly ten show and the rest scroll inside the box.

   Why a script: CSS cannot count rows. The shell's old cap was
   `100dvh - 20rem`, a viewport height with no relation to the rows, so on a
   laptop a table showed four or five rows whatever its "Show" count. Row height
   is not a constant either — it depends on the table, its enabled columns, a
   two-line cell, a button, the zoom — so the rows are measured, not assumed.

   The result is published as two custom properties that globals.css reads
   (`--tf-rows-cap`, `--tf-rows-floor`), never as `max-height` itself: React owns
   the shell's `style` for any properties it renders, but never touches a custom
   property it did not write, and the CSS keeps its old viewport cap as the
   fallback for first paint and for a table with no rows (its empty state).

   Left alone, on purpose:
     - `--compact` / `--fill` shells: they set their own height for the dialog
       they sit in, and override the variable-based rule anyway.
     - shells inside a dialog or full-screen overlay: a ten-row box can be
       taller than the dialog around it, and the dialog body would then become
       a second vertical scroller with the sticky header scrolling out of view.

   Shells are discovered by class, like TableScrollbars, so every table —
   including ones mounted later by a route change — gets this for free. */

const SHELL_SELECTOR = '.tf-table-shell';
const VISIBLE_ROWS = 10;
const CAP_VAR = '--tf-rows-cap';
const FLOOR_VAR = '--tf-rows-floor';
/** Shells that keep their own sizing. */
const EXEMPT_SELECTOR = '.tf-table-shell--compact, .tf-table-shell--fill';
const OVERLAY_SELECTOR = '[role="dialog"], [data-slot="dialog-content"], .fixed.inset-0';

function clear(shell: HTMLElement) {
  shell.style.removeProperty(CAP_VAR);
  shell.style.removeProperty(FLOOR_VAR);
}

function measure(shell: HTMLElement) {
  if (shell.matches(EXEMPT_SELECTOR) || shell.closest(OVERLAY_SELECTOR)) return clear(shell);

  const table = shell.querySelector('table');
  // Direct body rows only — an expanded row's nested sub-table is not a row.
  const rows = table
    ? Array.from(table.querySelectorAll<HTMLTableRowElement>(':scope > tbody > tr')).slice(0, VISIBLE_ROWS)
    : [];
  // Not rendered (a `hidden md:block` shell on a phone) or no rows (empty state):
  // leave the CSS fallback in charge.
  if (!table || rows.length === 0 || table.getBoundingClientRect().height === 0) return clear(shell);

  const head = table.tHead?.getBoundingClientRect().height ?? 0;
  const body = rows.reduce((sum, row) => sum + row.getBoundingClientRect().height, 0);
  /* max-height is a border-box height here (Tailwind preflight), so add what
     sits between the rows and the border edge: borders + any native scrollbar
     (offset − client), and padding — which includes the 16px strip
     TableScrollbars reserves for its horizontal bar via `data-tf-xbar`. */
  const cs = getComputedStyle(shell);
  const chrome =
    shell.offsetHeight - shell.clientHeight +
    parseFloat(cs.paddingTop || '0') + parseFloat(cs.paddingBottom || '0');

  const cap = `${Math.ceil(head + body + chrome)}px`;
  if (shell.style.getPropertyValue(CAP_VAR) !== cap) shell.style.setProperty(CAP_VAR, cap);
  // No empty floor under a short table.
  if (shell.style.getPropertyValue(FLOOR_VAR) !== '0px') shell.style.setProperty(FLOOR_VAR, '0px');
}

export default function TableRowCap() {
  useEffect(() => {
    const observed = new Map<HTMLElement, HTMLTableElement | null>();
    let frame = 0;

    const run = () => {
      frame = 0;
      const found = new Set(document.querySelectorAll<HTMLElement>(SHELL_SELECTOR));
      observed.forEach((table, shell) => {
        if (found.has(shell) && shell.isConnected) return;
        if (table) resizeObserver.unobserve(table);
        observed.delete(shell);
      });
      found.forEach((shell) => {
        const table = shell.querySelector('table');
        const previous = observed.get(shell);
        // The table itself can be swapped (list ↔ grouped view) inside one shell.
        if (previous !== table) {
          if (previous) resizeObserver.unobserve(previous);
          if (table) resizeObserver.observe(table);
          observed.set(shell, table);
        }
        measure(shell);
      });
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(run);
    };

    /* The TABLE is observed, not the shell: rows added/removed, columns toggled,
       a row expanded or the width changing all resize the table, while the
       shell resizing because of the cap itself never feeds back into this. */
    const resizeObserver = new ResizeObserver(schedule);
    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);
    run();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener('resize', schedule);
      observed.forEach((_, shell) => clear(shell));
      observed.clear();
    };
  }, []);

  return null;
}
