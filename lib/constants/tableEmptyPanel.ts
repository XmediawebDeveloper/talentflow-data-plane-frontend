/**
 * The empty-state panel of a data table, as ONE class string.
 *
 * Put it on the content of a table's "no rows" cell, on ANY table, anywhere.
 * It centres the icon and the message on both axes and gives the panel enough
 * height to read as deliberate rather than as a collapsed row.
 *
 * ── The half this string cannot do ──────────────────────────────────────
 * A table whose columns force a width WIDER THAN ITS SCROLL CONTAINER centres
 * that cell across the full scroll width, not the visible one. On the
 * assessment results table — `min-w-[2424px]` of fixed columns — the icon and
 * the message landed near x=1200, i.e. off the side of the screen, behind a
 * horizontal scrollbar that existed only to reach them. No amount of centring
 * inside the cell helps, because the cell really is 2424px wide.
 *
 * So a table with no rows must also stop imposing its width: drop the
 * `min-w-[…]` and skip the `<thead>`. The header cells are what carry the fixed
 * per-column widths, and with no rows there is nothing for them to label. The
 * table is then as wide as its container, this class centres in it, and the
 * scrollbar has nothing left to scroll. Both halves, or neither works.
 *
 * ── Why a class string and not a CSS class ──────────────────────────────
 * It was `.tf-empty-panel` in globals.css first, beside `tf-table-shell` and
 * `tf-wrap`, which is where this app keeps its table behaviours. Tailwind
 * utilities are compiled from the JSX that uses them, so they arrive with the
 * component that references them; a new rule in globals.css depends on that
 * stylesheet being rebuilt, and a panel that renders unstyled until someone
 * restarts a dev server is worse than one extra import. The layout here is
 * three utilities' worth — it does not need a stylesheet.
 *
 * `whitespace-normal` because `.tf-table-shell` sets `nowrap` on every cell,
 * which would push a sentence sideways — the same reason `tf-wrap` exists.
 * `w-full` so the flex box fills the cell it is centring inside rather than
 * shrinking to its own content, which is what centres nothing at all.
 *
 * The height mirrors `.tf-table-shell`'s own floor, `min(400px, 45dvh)`. That
 * is not decoration: the shell holds that height whether or not it has rows, so
 * a shorter panel centres its message in ITS box and then leaves the rest of
 * the shell blank underneath — which reads as a message stuck to the top of an
 * empty area rather than one centred in it. Matching the floor makes the panel
 * the whole area, so `justify-center` centres against what the reader sees.
 * `dvh`, like the shell, because on a phone `vh` is the URL-bar-hidden viewport
 * and so taller than what is actually on screen.
 */
export const TABLE_EMPTY_PANEL_CLASS =
  'flex w-full min-h-[min(400px,45dvh)] flex-col items-center justify-center whitespace-normal px-6 py-12 text-center';
