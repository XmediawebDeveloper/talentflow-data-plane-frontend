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
