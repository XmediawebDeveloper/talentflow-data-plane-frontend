/**
 * Shared "scale-in" hover/focus effect for every ⋮ (three-dot) action menu's
 * option text across the app.
 *
 * Reference: the Job Openings three-dot menu (components/JobsListing.tsx) —
 * origin-left, 150ms ease-out, scale to 0.97. Put `group` on the option's
 * button / DropdownMenuItem and wrap its label in a span with this class, so
 * every ⋮ menu reuses this one constant instead of a per-file copy — retuning
 * the animation only ever means editing here.
 *
 * `group-focus`/`group-data-[highlighted]` are no-ops on the hand-rolled
 * (non-Radix) menus — there's no `data-highlighted` attribute and native
 * `:focus` on a plain button is harmless — so the same constant is safe to
 * reuse on both the hand-rolled menus and the Radix `DropdownMenuItem` ones.
 */
export const MENU_ITEM_SCALE_CLASS =
  'inline-block origin-left transition-transform duration-150 ease-out group-hover:scale-[0.97] group-focus:scale-[0.97] group-data-[highlighted]:scale-[0.97]';

/**
 * Hover/keyboard highlight for a Radix `DropdownMenuItem` in a ⋮ menu: a plain
 * gray bar, no outline.
 *
 * Two things had to be undone. The primitive highlights with the theme's
 * `--accent`, a dark grey bar that read as a black hover. And Radix gives the
 * highlighted item `tabindex="0"`, so the global `[tabindex]:focus-visible`
 * ring in app/globals.css drew a dark 2px outline around it — that rule is
 * unlayered CSS, which only an `!important` utility can beat.
 */
export const MENU_ITEM_LIGHT_HIGHLIGHT_CLASS =
  'text-gray-700 hover:bg-gray-100 hover:text-gray-700 focus:!bg-gray-100 focus:!text-gray-700 data-[highlighted]:!bg-gray-100 data-[highlighted]:!text-gray-700 focus-visible:!outline-none dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-slate-100 dark:focus:!bg-slate-800 dark:focus:!text-slate-100 dark:data-[highlighted]:!bg-slate-800 dark:data-[highlighted]:!text-slate-100';

/** The same gray highlight for a destructive ⋮ option — the label stays red. */
export const MENU_ITEM_DESTRUCTIVE_HIGHLIGHT_CLASS =
  'text-destructive hover:bg-gray-100 hover:text-destructive focus:!bg-gray-100 focus:!text-destructive data-[highlighted]:!bg-gray-100 data-[highlighted]:!text-destructive focus-visible:!outline-none dark:focus:!bg-slate-800 dark:data-[highlighted]:!bg-slate-800';

/**
 * Border for a ⋮ menu's Radix `DropdownMenuContent` panel. Its bare `border`
 * class takes currentColor under Tailwind v4 (there is no base border-color
 * reset here), which on the popover is near-black — a dark frame round the
 * whole menu. This gives it the same light edge as the hand-rolled menus.
 */
export const MENU_PANEL_BORDER_CLASS = 'border-gray-200 dark:border-slate-700/60 shadow-lg';
