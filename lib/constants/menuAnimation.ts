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
 * Scale-*up* variant, for the folder-card (+) menu on My Resumes' Card View
 * (Upload to Folder / Create Subfolder / Rename Folder / Delete Folder).
 *
 * A direction flip of the scale-in above and nothing else: same `inline-block`
 * on the label ALONE, same `origin-left`, same 150ms ease-out, so the two menus
 * animate identically apart from which way the text goes. The icon stays
 * outside it — only the text scales — and a transform is painted rather than
 * laid out, so no option moves its neighbours.
 *
 * 1.06, not the mirror of 0.97's 1.03: anchored at `origin-left` the text grows
 * away from the cursor rather than around it, and at 3% the far end of a label
 * shifts about 3px, which reads as nothing happening at all.
 *
 * `group-disabled:scale-100` pins a disabled option at rest: CSS `:hover`
 * still matches a disabled button, and an option that grows under the cursor
 * but does nothing when clicked reads as broken rather than polished.
 */
export const MENU_ITEM_SCALE_UP_CLASS =
  'inline-block origin-left transition-transform duration-150 ease-out group-hover:scale-[1.06] group-focus:scale-[1.06] group-data-[highlighted]:scale-[1.06] group-disabled:scale-100';
