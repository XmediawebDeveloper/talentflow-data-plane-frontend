'use client'

import { FolderInput, FolderRoot, ChevronRight, Download, Trash2, ClipboardList, Archive, ArchiveRestore, Video } from 'lucide-react';
import { Folder } from '@/lib/types/types';
import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { RESUME_DELETE_OWNER_ONLY_REASON } from '@/lib/permissions/resumeDelete';

// Geometry for the portalled folder-picker menu — mirrors FolderTree's
// folder-actions menu and ResumeTable's row-actions menu.
const FOLDER_MENU_WIDTH = 224; // w-56
const FOLDER_MENU_GAP = 6;
const FOLDER_MENU_EDGE = 8;
// On a narrow phone the full 224px panel can't fit; shrink it to the available
// viewport width (matching the `max-w-[calc(100vw-16px)]` cap on the panels) so
// the position math never overlaps a flyout onto its parent or runs off-screen.
const effectiveMenuWidth = (viewportW: number) =>
  Math.min(FOLDER_MENU_WIDTH, viewportW - FOLDER_MENU_EDGE * 2);

interface BulkActionsBarProps {
  /** Kept on the interface so callers don't have to change: the bar no longer
   *  prints the count or offers a Clear button — the row is actions only, and
   *  selection is cleared from the checkboxes. */
  selectedCount?: number;
  onCancel?: () => void;
  onMoveToFolder?: (folderId: string) => void;
  /** True when the feature applies here but the viewer's permission is off —
   * the button stays visible and shows this reason instead of firing. */
  onMoveToFolderDisabled?: boolean;
  onMoveToFolderDisabledReason?: string;
  /** Scores the selected resumes against a job — surfaced as "Score Resume". */
  onApplyToJob?: () => void;
  onApplyToJobDisabled?: boolean;
  onApplyToJobDisabledReason?: string;
  onDelete?: () => void;
  onDeleteDisabled?: boolean;
  onDeleteDisabledReason?: string;
  onDownload?: () => void;
  onDownloadDisabled?: boolean;
  onDownloadDisabledReason?: string;
  folders?: Folder[];
  onResumeScoring?: () => void;
  onAssessment?: () => void;
  onAssessmentDisabled?: boolean;
  onAssessmentDisabledReason?: string;
  onArchive?: () => void;
  onArchiveDisabled?: boolean;
  onArchiveDisabledReason?: string;
  /** When provided, replaces the Archive button with an Unarchive button —
   * used when the current folder context is "Archived Resumes". */
  onUnarchive?: () => void;
  onUnarchiveDisabled?: boolean;
  onUnarchiveDisabledReason?: string;
  /** Invites the selected candidates to a published AI interview. */
  onAIInterview?: () => void;
  onAIInterviewDisabled?: boolean;
  onAIInterviewDisabledReason?: string;
  /** `bar` (default): the blue actions row. `menu`: the same actions as a
   *  vertical menu, for a dropdown (e.g. the Resume Database's Select All). */
  variant?: 'bar' | 'menu';
  /** Menu variant: called after an action runs (e.g. to close the dropdown). */
  onAction?: () => void;
}

export default function BulkActionsBar({
  onMoveToFolder,
  onMoveToFolderDisabled,
  onMoveToFolderDisabledReason,
  onApplyToJob,
  onApplyToJobDisabled,
  onApplyToJobDisabledReason,
  onDelete,
  onDeleteDisabled,
  onDeleteDisabledReason,
  onDownload,
  onDownloadDisabled,
  onDownloadDisabledReason,
  folders,
  onResumeScoring,
  onAssessment,
  onAssessmentDisabled,
  onAssessmentDisabledReason,
  onArchive,
  onArchiveDisabled,
  onArchiveDisabledReason,
  onUnarchive,
  onUnarchiveDisabled,
  onUnarchiveDisabledReason,
  onAIInterview,
  onAIInterviewDisabled,
  onAIInterviewDisabledReason,
  variant = 'bar',
  onAction,
}: BulkActionsBarProps) {
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  /* Menu variant: Move to Folder's folder list, open inside the menu. */
  const [showMoveList, setShowMoveList] = useState(false);
  /* The currently open chain of flyout submenus, root first — e.g. hovering
     "Engineering" then its child "2026" holds [{Engineering, rect}, {2026,
     rect}]. Cascading submenus are inherently linear (one branch open at a
     time under a single cursor), so a path rather than a set of independent
     ids is enough, and it doubles as each flyout's anchor rect for
     positioning. */
  const [openPath, setOpenPath] = useState<{ folder: Folder; anchor: DOMRect }[]>([]);
  /* The folder menu used to be absolutely positioned inside this bar, which
     sits inside a `overflow-hidden` card — clipping it regardless of z-index,
     since overflow clipping isn't something a portal-less fixed/absolute
     element can escape. It is portalled to the body now (same fix already
     applied to FolderTree's and ResumeTable's dropdowns) and placed against
     the viewport from the trigger's own coordinates, so it's never cut off
     and never runs off a narrow screen. */
  const [folderMenuAnchor, setFolderMenuAnchor] = useState<DOMRect | null>(null);
  const [folderMenuPosition, setFolderMenuPosition] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const folderMenuRef = useRef<HTMLDivElement | null>(null);

  const closeFolderMenu = () => {
    // A pending hover-intent timer would otherwise re-populate openPath
    // after close, so the next open would start with a stale flyout.
    if (hoverIntentTimer.current) {
      clearTimeout(hoverIntentTimer.current);
      hoverIntentTimer.current = null;
    }
    setShowFolderMenu(false);
    setFolderMenuAnchor(null);
    setFolderMenuPosition(null);
    setOpenPath([]);
  };

  useLayoutEffect(() => {
    if (!showFolderMenu || !folderMenuAnchor) return;
    const menu = folderMenuRef.current;
    if (!menu) return;

    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;
    const height = menu.offsetHeight;
    const spaceBelow = viewportH - folderMenuAnchor.bottom - FOLDER_MENU_GAP - FOLDER_MENU_EDGE;
    const spaceAbove = folderMenuAnchor.top - FOLDER_MENU_GAP - FOLDER_MENU_EDGE;
    const flipUp = height > spaceBelow && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, flipUp ? spaceAbove : spaceBelow);
    const clampedHeight = Math.min(height, maxHeight);

    const top = flipUp
      ? Math.max(FOLDER_MENU_EDGE, folderMenuAnchor.top - FOLDER_MENU_GAP - clampedHeight)
      : Math.min(folderMenuAnchor.bottom + FOLDER_MENU_GAP, viewportH - FOLDER_MENU_EDGE - clampedHeight);
    const menuWidth = effectiveMenuWidth(viewportW);
    const left = Math.min(
      Math.max(FOLDER_MENU_EDGE, folderMenuAnchor.left),
      viewportW - FOLDER_MENU_EDGE - menuWidth,
    );

    setFolderMenuPosition(prev =>
      prev && prev.top === top && prev.left === left && prev.maxHeight === maxHeight
        ? prev
        : { top, left, maxHeight },
    );
  }, [showFolderMenu, folderMenuAnchor]);

  useEffect(() => {
    if (!showFolderMenu) return;
    const dismiss = (e?: Event) => {
      /* `scroll` doesn't bubble, but a capture-phase listener on `window`
         still sees every scroll in the document — including the "My
         Folders" list's own internal scroll (it has real overflow, so it
         dispatches one), and every flyout's. Without this guard, wheel-
         scrolling that list closed the whole dropdown on the first tick
         instead of scrolling it. Only a scroll OUTSIDE this menu system
         (the page/card behind it) should dismiss — that's the case this
         listener exists for, since the anchor coordinates go stale then. */
      const target = e?.target as Element | undefined;
      if (target?.closest?.('[data-move-folder-menu]')) return;
      closeFolderMenu();
    };
    /* The backdrop below is z-40 but this bar is sticky z-50, so a click on
       another bulk action (Score Resume, Invite, …) lands on that button,
       never on the backdrop — the folder menu stayed open on top of the
       popup the action opened. Close on any press outside the menu system
       and its own trigger (the trigger toggles itself in its onClick). */
    const dismissOnOutsidePress = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (target?.closest?.('[data-move-folder-menu], [data-move-folder-trigger]')) return;
      closeFolderMenu();
    };
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    document.addEventListener('pointerdown', dismissOnOutsidePress, true);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
      document.removeEventListener('pointerdown', dismissOnOutsidePress, true);
    };
  }, [showFolderMenu]);

  // `shrink-0` + `whitespace-nowrap` keep every button at its natural width:
  // without them flex squeezed the wider labels, so buttons in the same row
  // ended up different sizes and the icons stopped lining up. Compact metrics
  // (32px tall, 10/12px of side padding, one text size) so the whole set fits
  // on one line at more widths before the row has to scroll.
  const actionBtn = "inline-flex shrink-0 items-center justify-center gap-1.5 h-8 px-2.5 sm:px-3 whitespace-nowrap text-white bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-md transition-all text-xs font-medium border border-white/15 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40";
  // Same metrics as actionBtn — only the colour differs — so the destructive
  // and state-changing buttons sit on the same baseline as the rest.
  const toneBtn = (tone: string) =>
    `inline-flex shrink-0 items-center justify-center gap-1.5 h-8 px-2.5 sm:px-3 whitespace-nowrap text-white ${tone} backdrop-blur-sm rounded-md transition-all text-xs font-medium shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40`;

  /* The folder picker used to list only top-level folders — any subfolder
     was unreachable from "Move to Folder". Root and Archived Resumes are
     fixtures (same rule FolderTree/the card view use); everything else is a
     real customer folder. Subfolders open as a cascading flyout to the side
     (renderFolderRow + the openPath portals below) rather than expanding
     inline — only the top-level name shows until its row is hovered/tapped. */
  const isSystemFolder = (f: Folder) => !f.parentId && (f.name.toLowerCase() === 'root' || f.name === 'Archived Resumes');
  const allFolders = folders ?? [];
  const systemFolders = allFolders
    .filter(isSystemFolder)
    .sort((a, b) => (a.name.toLowerCase() === 'root' ? 0 : 1) - (b.name.toLowerCase() === 'root' ? 0 : 1));
  const myFolders = allFolders.filter(f => !isSystemFolder(f));

  /* Chrome/Firefox re-fire mouseenter/mouseleave on whatever row ends up
     under a *stationary* cursor once a list scrolls past it, so an
     un-debounced hover would flip flyouts open/closed while the user is
     just scrolling — and would also close a flyout the instant the cursor
     crosses the (unavoidable) gap between a row and its submenu to the
     side. A short hover-intent delay fixes both: a real hover still opens/
     closes a branch, but rapid-fire enter/leave pairs (scrolling, or a fast
     diagonal move into the flyout) never survive long enough to commit —
     each new event cancels whatever was pending. */
  const hoverIntentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (hoverIntentTimer.current) clearTimeout(hoverIntentTimer.current);
  }, []);

  const scheduleOpenPath = (path: { folder: Folder; anchor: DOMRect }[]) => {
    if (hoverIntentTimer.current) clearTimeout(hoverIntentTimer.current);
    hoverIntentTimer.current = setTimeout(() => setOpenPath(path), 200);
  };
  const cancelScheduledClose = () => {
    if (hoverIntentTimer.current) {
      clearTimeout(hoverIntentTimer.current);
      hoverIntentTimer.current = null;
    }
  };

  /* Flyouts open to the right of their trigger row, flipping to the left
     when there isn't room; top is clamped so a submenu near the bottom of
     the screen doesn't run off it. */
  const computeFlyoutPosition = (anchor: DOMRect) => {
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const estimatedHeight = Math.min(260, viewportH - FOLDER_MENU_EDGE * 2);
    const menuWidth = effectiveMenuWidth(viewportW);
    const openLeft =
      viewportW - anchor.right - FOLDER_MENU_EDGE < menuWidth &&
      anchor.left - FOLDER_MENU_EDGE >= menuWidth;
    const left = openLeft
      ? Math.max(FOLDER_MENU_EDGE, anchor.left - menuWidth)
      : Math.min(anchor.right, viewportW - FOLDER_MENU_EDGE - menuWidth);
    const top = Math.min(
      Math.max(FOLDER_MENU_EDGE, anchor.top),
      viewportH - FOLDER_MENU_EDGE - estimatedHeight,
    );
    return { top, left, maxHeight: estimatedHeight };
  };

  /** One row inside either the top-level list or a flyout panel. `path` is
   *  this row's own ancestor chain — hovering it (with children) opens a
   *  new flyout at `path`; hovering it away collapses back to `ancestors`. */
  const renderFolderRow = (folder: Folder, depth: number, ancestors: { folder: Folder; anchor: DOMRect }[]): React.ReactNode => {
    const hasChildren = !!folder.children && folder.children.length > 0;
    const isOpen = openPath[depth]?.folder.id === folder.id;
    return (
      <button
        key={folder.id}
        onClick={() => {
          onMoveToFolder(folder.id); onAction?.();
          closeFolderMenu();
        }}
        onMouseEnter={(e) => {
          if (!hasChildren) {
            scheduleOpenPath(ancestors);
            return;
          }
          const anchor = e.currentTarget.getBoundingClientRect();
          scheduleOpenPath([...ancestors, { folder, anchor }]);
        }}
        onMouseLeave={() => scheduleOpenPath(ancestors)}
        className={`w-full text-left py-2 text-sm text-foreground hover:bg-accent/50 rounded-md transition-colors flex items-center gap-2 ${isOpen ? 'bg-accent/50' : ''}`}
        style={{ width: 'calc(100% - 8px)', paddingLeft: 12 + Math.min(depth, 3) * 16, paddingRight: 8, marginLeft: 4, marginRight: 4 }}
      >
        <FolderInput className="w-4 h-4 text-brand-orange flex-shrink-0" />
        <span className="truncate flex-1">{folder.name}</span>
        <span className="flex-shrink-0 text-xs text-muted-foreground">({folder.count})</span>
        {hasChildren && (
          <ChevronRight
            className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0"
            onClick={(e) => {
              // Touch devices have no hover — the chevron doubles as a tap
              // toggle so subfolders are still reachable without a mouse.
              e.stopPropagation();
              cancelScheduledClose();
              const anchor = (e.currentTarget as Element).closest('button')!.getBoundingClientRect();
              setOpenPath(isOpen ? ancestors : [...ancestors, { folder, anchor }]);
            }}
          />
        )}
      </button>
    );
  };

  const toggleFolderMenu = (e: React.MouseEvent<HTMLElement>) => {
    if (onMoveToFolderDisabled) return;
    if (showFolderMenu) {
      closeFolderMenu();
      return;
    }
    const trigger = e.currentTarget as HTMLElement;
    setFolderMenuAnchor(trigger.getBoundingClientRect());
    setFolderMenuPosition(null);
    setShowFolderMenu(true);
  };

  /* The Move to Folder picker and its cascading flyouts (portalled). */
  const folderMenuPortals = (
    <>
                {showFolderMenu && folderMenuAnchor && typeof document !== 'undefined' && createPortal(
                  <>
                    {/* Backdrop to close menu */}
                    <div
                      className="fixed inset-0 z-40"
                      onClick={closeFolderMenu}
                    />
                    {/* Dropdown menu — fixed + portalled out of the card's
                        `overflow-hidden` boundary, so it's never clipped and
                        never runs off a narrow viewport. */}
                    <div
                      ref={folderMenuRef}
                      data-move-folder-menu
                      /* `flex flex-col` + `overflow-hidden` here (not
                         `overflow-y-auto`), with the My Folders rows as the
                         only `flex-1 min-h-0` child below: that child's
                         rendered height is then whatever the flex layout
                         actually leaves it, so its own `overflow-y-auto` can
                         never claim more room than truly exists. A fixed
                         190px on that child alone (no flex-shrink guarantee)
                         let System Folders + the header eat into that 190px
                         on short viewports — the rows below the cut were
                         laid out past this panel's own clipped edge, so they
                         were there but the mouse could never reach them to
                         scroll to them. */
                      className="fixed w-56 max-w-[calc(100vw-16px)] bg-popover text-popover-foreground rounded-lg shadow-2xl border border-border py-1.5 flex flex-col overflow-hidden z-50"
                      style={{
                        top: folderMenuPosition?.top ?? folderMenuAnchor.bottom + FOLDER_MENU_GAP,
                        left: folderMenuPosition?.left ?? folderMenuAnchor.left,
                        maxHeight: folderMenuPosition?.maxHeight ?? 256,
                        visibility: folderMenuPosition ? 'visible' : 'hidden',
                      }}
                    >
                      {systemFolders.length === 0 && myFolders.length === 0 ? (
                        <div className="px-3 py-2.5 text-sm text-muted-foreground text-center">
                          No folders available
                        </div>
                      ) : (
                        /* System Folders and My Folders share ONE scroll
                           region and one 7-row budget — System Folders no
                           longer stays pinned above it. `flex-initial`
                           (grow:0, shrink:1) rather than `flex-1` (grow:1):
                           flex-1 was stretching this box to fill the outer
                           panel's full computed ceiling even with only a
                           couple of rows in it, leaving dead empty space
                           below the list. `flex-initial` + `min-h-0` keeps
                           both fixes — sized to its own content when there's
                           room, but still free to shrink (and stay fully
                           scrollable, not clipped) when the outer panel is
                           too short for it. */
                        <div className="flex-initial min-h-0 max-h-[338px] overflow-y-auto overscroll-contain">
                          {systemFolders.length > 0 && (
                            <>
                              <div className="px-3 pt-1 pb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wide">
                                System Folders
                              </div>
                              {systemFolders.map(folder => (
                                <button
                                  key={folder.id}
                                  onClick={() => {
                                    onMoveToFolder(folder.id); onAction?.();
                                    closeFolderMenu();
                                  }}
                                  className="w-full text-left px-3 mx-1 py-2 text-sm text-foreground hover:bg-accent/50 rounded-md transition-colors flex items-center gap-2"
                                  style={{ width: 'calc(100% - 8px)' }}
                                >
                                  {folder.name === 'Archived Resumes' ? (
                                    <Archive className="w-4 h-4 text-amber-600" />
                                  ) : (
                                    <FolderRoot className="w-4 h-4 text-brand-cyan" />
                                  )}
                                  <span className="flex-1 truncate text-left">
                                    {folder.name.toLowerCase() === 'root' ? 'Root (Default)' : folder.name}
                                  </span>
                                  <span className="flex-shrink-0 text-xs text-muted-foreground">({folder.count})</span>
                                </button>
                              ))}
                            </>
                          )}
                          {systemFolders.length > 0 && myFolders.length > 0 && (
                            <div className="border-t border-border my-1" />
                          )}
                          {myFolders.length > 0 && (
                            <>
                              <div className="px-3 pt-1 pb-1 text-2xs font-semibold text-muted-foreground uppercase tracking-wide">
                                My Folders
                              </div>
                              {myFolders.map(folder => renderFolderRow(folder, 0, []))}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </>,
                  document.body,
                )}
  
                {/* Cascading flyouts, one portal per open depth — each sits
                    beside its trigger row rather than pushing content inline,
                    so opening a subfolder never resizes (or clips inside) the
                    panel that owns it. */}
                {showFolderMenu && openPath.map((entry, i) => {
                  const ancestors = openPath.slice(0, i + 1);
                  const pos = computeFlyoutPosition(entry.anchor);
                  return typeof document !== 'undefined' && createPortal(
                    <div
                      key={entry.folder.id}
                      data-move-folder-menu
                      className="fixed w-56 max-w-[calc(100vw-16px)] bg-popover text-popover-foreground rounded-lg shadow-2xl border border-border py-1.5 overflow-y-auto overscroll-contain z-50"
                      style={{ top: pos.top, left: pos.left, maxHeight: pos.maxHeight }}
                      onMouseEnter={cancelScheduledClose}
                      onMouseLeave={() => scheduleOpenPath(openPath.slice(0, i))}
                    >
                      {entry.folder.children!.map(child => renderFolderRow(child, i + 1, ancestors))}
                    </div>,
                    document.body,
                  );
                })}
    </>
  );

  /* Menu variant — the same actions as a vertical list for a dropdown. Same
     handlers, permissions and disabled reasons as the bar. */
  if (variant === 'menu') {
    /* The Resume Scoring "Select Applicants to Score" popup's Actions menu
       (components/SelectSourceModal.tsx): px-3 py-2 rows, 16px icons in the
       row ⋮ menu colours, grey + 60% when not allowed (the tooltip says why),
       Move to Folder opening its folder list inside the menu, and Delete in
       the destructive colour after a divider. */
    const row = (enabled: boolean, danger = false) =>
      `w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${
        !enabled
          ? 'text-gray-400 cursor-not-allowed opacity-60'
          : danger ? 'text-destructive hover:bg-destructive-subtle' : 'text-gray-700 hover:bg-gray-50 dark:text-slate-200 dark:hover:bg-slate-800'
      }`;
    const run = (disabled: boolean | undefined, fn?: () => void) => () => {
      if (disabled || !fn) return; // Locked: tooltip only.
      fn();
      onAction?.();
    };
    /* Every folder, subfolders indented under their parent. */
    const moveTargets: { folder: Folder; depth: number }[] = [];
    const walk = (list: Folder[], depth: number) => list.forEach(folder => {
      if (folder.id === 'all') return;
      moveTargets.push({ folder, depth });
      if (folder.children?.length) walk(folder.children, depth + 1);
    });
    walk([...systemFolders, ...myFolders], 0);
    const moveOk = !onMoveToFolderDisabled;
    return (
      <div role="menu" aria-label="Actions">
        {folders && onMoveToFolder && (
          <>
            <button
              type="button"
              role="menuitem"
              onClick={() => { if (!moveOk) return; setShowMoveList(v => !v); }}
              aria-disabled={!moveOk}
              aria-expanded={showMoveList}
              title={!moveOk ? (onMoveToFolderDisabledReason || 'You do not have permission to move resumes to a folder') : ''}
              className={row(moveOk)}
            >
              <FolderInput className={`w-4 h-4 ${moveOk ? 'text-brand-orange' : ''}`} />
              <span className="flex-1">Move to Folder</span>
              <ChevronRight className={`w-4 h-4 transition-transform ${showMoveList ? 'rotate-90' : ''}`} />
            </button>
            {showMoveList && (
              <div className="max-h-56 overflow-y-auto border-y border-gray-100 dark:border-slate-700/60 bg-gray-50/60 dark:bg-slate-800/40 py-1">
                {moveTargets.length === 0 ? (
                  <p className="px-3 py-2 tf-meta">No folders available</p>
                ) : moveTargets.map(({ folder, depth }) => {
                  const isRoot = !folder.parentId && folder.name.toLowerCase() === 'root';
                  const isArchived = folder.name === 'Archived Resumes' && !folder.parentId;
                  return (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => { onMoveToFolder(folder.id); setShowMoveList(false); onAction?.(); }}
                      className="w-full py-1.5 pr-3 text-left text-sm text-foreground hover:bg-accent/50 transition-colors flex items-center gap-2"
                      style={{ paddingLeft: `${1.75 + Math.min(depth, 3) * 0.75}rem` }}
                      title={folder.name}
                    >
                      {/* Root cyan, Archived amber, folders orange, count muted. */}
                      {isRoot
                        ? <FolderRoot className="w-4 h-4 shrink-0 text-brand-cyan" />
                        : isArchived
                          ? <Archive className="w-4 h-4 shrink-0 text-amber-600" />
                          : <FolderInput className="w-4 h-4 shrink-0 text-brand-orange" />}
                      <span className="truncate flex-1">{isRoot ? 'Root (Default)' : folder.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">({folder.count})</span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
        {onApplyToJob && (
          <button type="button" role="menuitem" onClick={run(onApplyToJobDisabled, onApplyToJob)} aria-disabled={!!onApplyToJobDisabled}
            title={onApplyToJobDisabled ? (onApplyToJobDisabledReason || 'You do not have permission to score resumes') : ''}
            className={row(!onApplyToJobDisabled)}>
            <ClipboardList className={`w-4 h-4 ${onApplyToJobDisabled ? '' : 'text-menu-icon-score'}`} />Score Resume
          </button>
        )}
        {onResumeScoring && (
          <button type="button" role="menuitem" onClick={run(false, onResumeScoring)} className={row(true)}>
            <ClipboardList className="w-4 h-4 text-menu-icon-score" />Resume Scoring
          </button>
        )}
        {onAssessment && (
          <button type="button" role="menuitem" onClick={run(onAssessmentDisabled, onAssessment)} aria-disabled={!!onAssessmentDisabled}
            title={onAssessmentDisabled ? (onAssessmentDisabledReason || 'You do not have permission to invite candidates to an assessment') : ''}
            className={row(!onAssessmentDisabled)}>
            <ClipboardList className={`w-4 h-4 ${onAssessmentDisabled ? '' : 'text-menu-icon-share'}`} />Invite Assessment
          </button>
        )}
        {onAIInterview && (
          <button type="button" role="menuitem" onClick={run(onAIInterviewDisabled, onAIInterview)} aria-disabled={!!onAIInterviewDisabled}
            title={onAIInterviewDisabled ? (onAIInterviewDisabledReason || 'You do not have permission to invite candidates to an AI interview') : ''}
            className={row(!onAIInterviewDisabled)}>
            <Video className={`w-4 h-4 ${onAIInterviewDisabled ? '' : 'text-menu-icon-ai'}`} />Invite AI Interview
          </button>
        )}
        {onDownload && (
          <button type="button" role="menuitem" onClick={run(onDownloadDisabled, onDownload)} aria-disabled={!!onDownloadDisabled}
            title={onDownloadDisabled ? (onDownloadDisabledReason || "Your role doesn't allow downloading resumes") : ''}
            className={row(!onDownloadDisabled)}>
            <Download className={`w-4 h-4 ${onDownloadDisabled ? '' : 'text-menu-icon-download'}`} />Download Selected
          </button>
        )}
        {onUnarchive ? (
          <button type="button" role="menuitem" onClick={run(onUnarchiveDisabled, onUnarchive)} aria-disabled={!!onUnarchiveDisabled}
            title={onUnarchiveDisabled ? (onUnarchiveDisabledReason || 'You do not have permission to unarchive resumes') : ''}
            className={row(!onUnarchiveDisabled)}>
            <ArchiveRestore className={`w-4 h-4 ${onUnarchiveDisabled ? '' : 'text-menu-icon-archive'}`} />Unarchive Selected
          </button>
        ) : onArchive && (
          <button type="button" role="menuitem" onClick={run(onArchiveDisabled, onArchive)} aria-disabled={!!onArchiveDisabled}
            title={onArchiveDisabled ? (onArchiveDisabledReason || 'You do not have permission to archive resumes') : ''}
            className={row(!onArchiveDisabled)}>
            <Archive className={`w-4 h-4 ${onArchiveDisabled ? '' : 'text-menu-icon-archive'}`} />Archive Selected
          </button>
        )}
        {onDelete && (
          <>
            <div className="border-t border-gray-200 dark:border-slate-700 my-2" />
            <button type="button" role="menuitem" onClick={run(onDeleteDisabled, onDelete)} aria-disabled={!!onDeleteDisabled}
              title={onDeleteDisabled ? (onDeleteDisabledReason || RESUME_DELETE_OWNER_ONLY_REASON) : ''}
              className={row(!onDeleteDisabled, true)}>
              <Trash2 className="w-4 h-4" />Delete Selected
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    /* top: --crumb-h, the page's measured sticky-breadcrumb height (set by
       the Resume Database page), so a stuck bar sits below the breadcrumb
       instead of covering it; 0 where no page sets it. */
    <div className="sticky top-[var(--crumb-h,0px)] z-50 bg-brand-blue shadow-lg shadow-brand-blue/25 border-b border-white/10 ring-1 ring-white/10 animate-fadeIn rounded-xl">
      {/* Wraps to as many lines as it needs rather than scrolling sideways —
          no action should ever end up reachable only by a scroll a phone
          user has no visible hint exists. Equal padding at both ends and
          one gap value throughout (row and column), so the group reads as
          one evenly spaced block whatever width it settles at. */}
      <div className="px-3 py-2">
        <div className="flex flex-wrap justify-center items-center gap-2">
          {folders && onMoveToFolder && (
            <div className="relative shrink-0">
              <button
                onClick={toggleFolderMenu}
                data-move-folder-trigger
                aria-disabled={!!onMoveToFolderDisabled}
                className={`${actionBtn} ${onMoveToFolderDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                aria-label="Move to Folder" title={onMoveToFolderDisabled ? (onMoveToFolderDisabledReason || 'You do not have permission to move resumes to a folder') : 'Move to Folder'}
              >
                <FolderInput className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Move to Folder</span>
                <span className="lg:hidden">Move</span>
              </button>

              {folderMenuPortals}
            </div>
          )}

          {onApplyToJob && (
            <button
              onClick={() => {
                if (onApplyToJobDisabled) return;
                onApplyToJob();
              }}
              aria-disabled={!!onApplyToJobDisabled}
              className={`${actionBtn} ${onApplyToJobDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              aria-label="Score Resume" title={onApplyToJobDisabled ? (onApplyToJobDisabledReason || 'You do not have permission to score resumes') : 'Score Resume'}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Score Resume</span>
              <span className="lg:hidden">Score</span>
            </button>
          )}

          {onResumeScoring && (
            <button
              onClick={onResumeScoring}
              className={actionBtn}
              aria-label="Resume Scoring" title="Resume Scoring"
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Resume Scoring</span>
              <span className="lg:hidden">Score</span>
            </button>
          )}

          {onAssessment && (
            <button
              onClick={() => {
                if (onAssessmentDisabled) return;
                onAssessment();
              }}
              aria-disabled={!!onAssessmentDisabled}
              className={`${actionBtn} ${onAssessmentDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              aria-label="Invite Assessment" title={onAssessmentDisabled ? (onAssessmentDisabledReason || 'You do not have permission to invite candidates to an assessment') : 'Invite Assessment'}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Invite Assessment</span>
              <span className="lg:hidden">Invite</span>
            </button>
          )}

          {onAIInterview && (
            <button
              onClick={() => {
                if (onAIInterviewDisabled) return;
                onAIInterview();
              }}
              aria-disabled={!!onAIInterviewDisabled}
              className={`${actionBtn} ${onAIInterviewDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              aria-label="Invite AI Interview" title={onAIInterviewDisabled ? (onAIInterviewDisabledReason || 'You do not have permission to invite candidates to an AI interview') : 'Invite AI Interview'}
            >
              <Video className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Invite AI Interview</span>
              {/* Short form for narrow widths, same shape as Invite Assessment's. */}
              <span className="lg:hidden">Invite AI</span>
            </button>
          )}


          {onDownload && (
            <button
              onClick={() => {
                if (onDownloadDisabled) return;
                onDownload();
              }}
              aria-disabled={!!onDownloadDisabled}
              className={`${actionBtn} ${onDownloadDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              aria-label="Download" title={onDownloadDisabled ? (onDownloadDisabledReason || "Your role doesn't allow downloading resumes") : 'Download'}
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Download</span>
            </button>
          )}

          {onUnarchive ? (
            <button
              onClick={() => {
                if (onUnarchiveDisabled) return;
                onUnarchive();
              }}
              aria-disabled={!!onUnarchiveDisabled}
              className={`${toneBtn('bg-emerald-500/90 hover:bg-emerald-600')} border border-emerald-400/30 ${onUnarchiveDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              aria-label="Unarchive" title={onUnarchiveDisabled ? (onUnarchiveDisabledReason || 'You do not have permission to unarchive resumes') : 'Unarchive'}
            >
              <ArchiveRestore className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Unarchive</span>
            </button>
          ) : onArchive && (
            <button
              onClick={() => {
                if (onArchiveDisabled) return;
                onArchive();
              }}
              aria-disabled={!!onArchiveDisabled}
              className={`${toneBtn('bg-amber-500/90 hover:bg-amber-600')} border border-amber-400/30 ${onArchiveDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              aria-label="Archive" title={onArchiveDisabled ? (onArchiveDisabledReason || 'You do not have permission to archive resumes') : 'Archive'}
            >
              <Archive className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Archive</span>
            </button>
          )}

          {onDelete && (
            <>
              {/* `shrink-0` like the buttons — in a nowrap row a plain divider
                  would be squeezed to nothing. */}
              <div className="hidden sm:block shrink-0 self-center w-px h-5 bg-white/20" />
              <button
                onClick={() => {
                  if (onDeleteDisabled) return;
                  onDelete();
                }}
                aria-disabled={!!onDeleteDisabled}
                className={`${toneBtn('bg-red-500/90 hover:bg-red-600')} border border-red-400/30 ${onDeleteDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                aria-label="Delete" title={onDeleteDisabled ? (onDeleteDisabledReason || RESUME_DELETE_OWNER_ONLY_REASON) : 'Delete'}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Delete</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
