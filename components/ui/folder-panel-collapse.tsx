'use client';

// Collapsible resume-folder column — shared by every place the resume
// database shows its folders beside the resumes: the Resume Database page
// (FolderTree), the Select Source popup (FolderTree), and the Share
// Assessment / Share AI Interview popups (their own folder sidebars).
//
// One remembered choice for all of them (this browser only): fold the
// folders away once and every database view opens with them folded.
import { useState, useSyncExternalStore } from 'react';
import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';

const COLLAPSED_KEY = 'tf_folder_panel_collapsed';
/** Fired in this tab when the choice changes ('storage' only fires in others). */
const COLLAPSED_EVENT = 'tf-folder-panel-collapsed';

const readCollapsed = () => {
  try { return window.localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
};
const subscribeCollapsed = (onChange: () => void) => {
  window.addEventListener(COLLAPSED_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(COLLAPSED_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
};

/**
 * The folder column's collapsed state. Read through useSyncExternalStore: the
 * server (and first paint) sees it open, then the stored choice applies — no
 * hydration mismatch. `animate` turns true only after a click, so the slide
 * plays on a toggle and never on page load.
 */
export function useFolderPanelCollapsed(enabled = true) {
  const stored = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const [animate, setAnimate] = useState(false);
  const setCollapsed = (next: boolean) => {
    setAnimate(true);
    try { window.localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0'); } catch { /* storage blocked */ }
    window.dispatchEvent(new Event(COLLAPSED_EVENT));
  };
  return { collapsed: enabled && stored, setCollapsed, animate };
}

/** Breakpoint from which the folders are a side column (below it they are a
 *  band above the list, so there is nothing to fold). Static class names, so
 *  Tailwind keeps them. */
export type FolderColumnBreakpoint = 'sm' | 'md';
const SHOW_FROM: Record<FolderColumnBreakpoint, string> = { sm: 'hidden sm:flex', md: 'hidden md:flex' };
const HIDE_FROM: Record<FolderColumnBreakpoint, string> = { sm: 'sm:hidden', md: 'md:hidden' };
const SLIDE_IN: Record<FolderColumnBreakpoint, string> = {
  sm: 'sm:animate-in sm:fade-in sm:slide-in-from-left-4 sm:duration-300 sm:ease-out motion-reduce:animate-none',
  md: 'md:animate-in md:fade-in md:slide-in-from-left-4 md:duration-300 md:ease-out motion-reduce:animate-none',
};

/** Classes for the full folder column: hidden from the breakpoint while
 *  collapsed, sliding back in after it is reopened. */
export function folderColumnClasses(collapsed: boolean, animate: boolean, from: FolderColumnBreakpoint) {
  if (collapsed) return HIDE_FROM[from];
  return animate ? SLIDE_IN[from] : '';
}

/** The « button that folds the column away — at the end of the folder
 *  heading. Shown only where the column is a side column. */
export function FolderCollapseButton({ onCollapse, from }: { onCollapse: () => void; from: FolderColumnBreakpoint }) {
  return (
    <IconButton bare label="Hide folders"
      type="button"
      onClick={onCollapse}
      aria-expanded={true}
      className={`ml-auto ${from === 'sm' ? 'hidden sm:flex' : 'hidden md:flex'} h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-brand-blue/5 hover:text-brand-blue focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 transition-colors`}
    >
      <ChevronsLeft className="h-4 w-4" />
    </IconButton>
  );
}

/** The slim rail that takes the column's place while it is collapsed, with
 *  the » button to bring it back. */
export function FolderPanelRail({
  onExpand, animate, from, className = '',
}: { onExpand: () => void; animate: boolean; from: FolderColumnBreakpoint; className?: string }) {
  return (
    <div
      className={`${SHOW_FROM[from]} w-11 shrink-0 flex-col items-center gap-3 border-r border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-3 ${
        animate ? 'animate-in fade-in slide-in-from-left-2 duration-200 ease-out motion-reduce:animate-none' : ''
      } ${className}`}
    >
      <IconButton bare label="Show folders"
        type="button"
        onClick={onExpand}
        aria-expanded={false}
        className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-brand-blue/5 hover:text-brand-blue focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 transition-colors"
      >
        <ChevronsRight className="h-4 w-4" />
      </IconButton>
      <span className="tf-caption select-none" style={{ writingMode: 'vertical-rl' }}>
        Folders
      </span>
    </div>
  );
}
