'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from './utils';

/**
 * One fixed place on a tabbed page for that page's `ListToolbar`.
 *
 * `ListToolbar` already settled what the row LOOKS like — search box, More
 * Filters, Reset, count badge, in that order. What it could not settle is
 * WHERE the row sits, because on a tabbed page the toolbar belongs to the tab,
 * and each tab draws its own content: one rendered the row above the tab pills,
 * the next put it inside its card's header, a third had none at all. Same
 * component, three positions, so switching tabs moved the search box.
 *
 * This closes that gap. The page reserves the position once, with
 * `<ListToolbarSlot>`, and every tab renders its toolbar THROUGH
 * `<ListToolbarPortal>` — including the tabs whose content lives in a child
 * component of its own. The toolbar keeps its own state and its own handlers,
 * exactly where that state already was; only the DOM position is the page's.
 *
 *   const slot = useListToolbarSlot();
 *
 *   <ListToolbarSlotProvider value={slot.node}>
 *     <ListToolbarSlot ref={slot.ref} />   ← the one position
 *     …tab pills…
 *     …tab content, which portals its toolbar back up here…
 *   </ListToolbarSlotProvider>
 *
 * A component that also renders OUTSIDE such a page — `AllAssessmentsTable` has
 * its own route, `ConsentLogs` appears on the AI Interview page — finds no slot
 * and `ListToolbarPortal` simply renders it in place, in the same `mb-4`
 * wrapper it used before. So adopting the portal costs a standalone page
 * nothing.
 */

const ListToolbarSlotContext = React.createContext<HTMLElement | null>(null);

export function ListToolbarSlotProvider({
  value,
  children,
}: {
  value: HTMLElement | null;
  children: React.ReactNode;
}) {
  return (
    <ListToolbarSlotContext.Provider value={value}>{children}</ListToolbarSlotContext.Provider>
  );
}

/**
 * The slot element and the callback ref that registers it.
 *
 * State rather than a `useRef`, deliberately: the portal target has to be a
 * value the tree RE-RENDERS on. A ref would be populated after the first paint
 * with nothing to tell the children about it, so the toolbar would never
 * appear.
 */
export function useListToolbarSlot() {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  return { node, ref: setNode };
}

/**
 * Where the toolbar goes. `empty:hidden` so a tab that has nothing to search —
 * a settings panel, say — costs the page no gap: with no toolbar portalled in,
 * the element has no children and takes itself and its margin off the page.
 */
export const ListToolbarSlot = React.forwardRef<HTMLDivElement, { className?: string }>(
  function ListToolbarSlot({ className }, ref) {
    return <div ref={ref} className={cn('empty:hidden mb-4', className)} />;
  },
);

/**
 * Renders a tab's toolbar into the page's slot, or in place when there is no
 * slot (a standalone page). `children` is the toolbar and, when it is open, its
 * filter panel — they travel together so the panel opens under the row rather
 * than wherever the tab's content happens to start.
 */
export function ListToolbarPortal({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const slot = React.useContext(ListToolbarSlotContext);
  if (slot) return createPortal(children, slot);
  return <div className={cn('mb-4', className)}>{children}</div>;
}

export default ListToolbarPortal;
