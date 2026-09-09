'use client'

import { FolderInput, FolderRoot, ChevronRight, Download, Trash2, ClipboardList, ClipboardCheck, Archive, ArchiveRestore, Sparkles, Brain } from 'lucide-react';
import { Folder } from '@/lib/types/types';
import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { toast } from './ui/enhanced-toast';

// Geometry for the portalled folder-picker menu — mirrors FolderTree's
// folder-actions menu and ResumeTable's row-actions menu.
const FOLDER_MENU_WIDTH = 224; // w-56
const FOLDER_MENU_GAP = 6;
const FOLDER_MENU_EDGE = 8;

interface BulkActionsBarProps {
  /** Kept on the interface so callers don't have to change: the bar no longer
   *  prints the count or offers a Clear button — the row is actions only, and
   *  selection is cleared from the checkboxes. */
  selectedCount?: number;
  onCancel?: () => void;
  onMoveToFolder?: (folderId: string) => void;
  /** Scores the selected resumes against a job — surfaced as "Score Resume". */
  onApplyToJob?: () => void;
  onDelete?: () => void;
  onDownload?: () => void;
  folders?: Folder[];
  onResumeScoring?: () => void;
  onAssessment?: () => void;
  onArchive?: () => void;
  /** When provided, replaces the Archive button with an Unarchive button —
   * used when the current folder context is "Archived Resumes". */
  onUnarchive?: () => void;
  onAITalentMatch?: () => void;
  /** Invites the selected candidates to a published AI interview. */
  onAIInterview?: () => void;
}

export default function BulkActionsBar({
  onMoveToFolder,
  onApplyToJob,
  onDelete,
  onDownload,
  folders,
  onResumeScoring,
  onAssessment,
  onArchive,
  onUnarchive,
  onAITalentMatch,
  onAIInterview,
}: BulkActionsBarProps) {
  const [showFolderMenu, setShowFolderMenu] = useState(false);
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
    const left = Math.min(
      Math.max(FOLDER_MENU_EDGE, folderMenuAnchor.left),
      viewportW - FOLDER_MENU_EDGE - FOLDER_MENU_WIDTH,
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
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
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
    const openLeft =
      viewportW - anchor.right - FOLDER_MENU_EDGE < FOLDER_MENU_WIDTH &&
      anchor.left - FOLDER_MENU_EDGE >= FOLDER_MENU_WIDTH;
    const left = openLeft
      ? Math.max(FOLDER_MENU_EDGE, anchor.left - FOLDER_MENU_WIDTH)
      : Math.min(anchor.right, viewportW - FOLDER_MENU_EDGE - FOLDER_MENU_WIDTH);
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
          onMoveToFolder(folder.id);
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
        style={{ width: 'calc(100% - 8px)', paddingLeft: 12 + depth * 16, paddingRight: 8, marginLeft: 4, marginRight: 4 }}
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

  return (
    <div className="sticky top-0 z-50 bg-brand-blue shadow-lg shadow-brand-blue/25 border-b border-white/10 ring-1 ring-white/10 animate-fadeIn rounded-xl">
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
                onClick={(e) => {
                  if (showFolderMenu) {
                    closeFolderMenu();
                    return;
                  }
                  const trigger = e.currentTarget as HTMLElement;
                  setFolderMenuAnchor(trigger.getBoundingClientRect());
                  setFolderMenuPosition(null);
                  setShowFolderMenu(true);
                }}
                className={actionBtn}
                aria-label="Move to Folder" title="Move to Folder"
              >
                <FolderInput className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">Move to Folder</span>
                <span className="xl:hidden">Move</span>
              </button>

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
                    className="fixed w-56 bg-popover text-popover-foreground rounded-lg shadow-2xl border border-border py-1.5 flex flex-col overflow-hidden z-50"
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
                            <div className="px-3 pt-1 pb-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                              System Folders
                            </div>
                            {systemFolders.map(folder => (
                              <button
                                key={folder.id}
                                onClick={() => {
                                  onMoveToFolder(folder.id);
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
                            <div className="px-3 pt-1 pb-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
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
                    className="fixed w-56 bg-popover text-popover-foreground rounded-lg shadow-2xl border border-border py-1.5 overflow-y-auto overscroll-contain z-50"
                    style={{ top: pos.top, left: pos.left, maxHeight: pos.maxHeight }}
                    onMouseEnter={cancelScheduledClose}
                    onMouseLeave={() => scheduleOpenPath(openPath.slice(0, i))}
                  >
                    {entry.folder.children!.map(child => renderFolderRow(child, i + 1, ancestors))}
                  </div>,
                  document.body,
                );
              })}
            </div>
          )}

          {onApplyToJob && (
            <button
              onClick={onApplyToJob}
              className={actionBtn}
              aria-label="Score Resume" title="Score Resume"
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Score Resume</span>
              <span className="xl:hidden">Score</span>
            </button>
          )}

          {onResumeScoring && (
            <button
              onClick={onResumeScoring}
              className={actionBtn}
              aria-label="Resume Scoring" title="Resume Scoring"
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Resume Scoring</span>
              <span className="xl:hidden">Score</span>
            </button>
          )}

          {onAssessment && (
            <button
              onClick={onAssessment}
              className={actionBtn}
              aria-label="Invite Assessment" title="Invite Assessment"
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Invite Assessment</span>
              <span className="xl:hidden">Invite</span>
            </button>
          )}

          {onAIInterview && (
            <button
              onClick={onAIInterview}
              className={actionBtn}
              aria-label="Invite AI Interview" title="Invite AI Interview"
            >
              <Brain className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Invite AI Interview</span>
              {/* Short form for narrow widths, same shape as Invite Assessment's. */}
              <span className="xl:hidden">Invite AI</span>
            </button>
          )}

          {onAITalentMatch && (
            <button
              onClick={onAITalentMatch}
              className={actionBtn}
              aria-label="AI Talent Match" title="AI Talent Match"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">AI Talent Match</span>
              <span className="xl:hidden">AI Match</span>
            </button>
          )}

          {onDownload && (
            <button
              onClick={onDownload}
              className={actionBtn}
              aria-label="Download" title="Download"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Download</span>
            </button>
          )}

          {onUnarchive ? (
            <button
              onClick={onUnarchive}
              className={`${toneBtn('bg-emerald-500/90 hover:bg-emerald-600')} border border-emerald-400/30`}
              aria-label="Unarchive" title="Unarchive"
            >
              <ArchiveRestore className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Unarchive</span>
            </button>
          ) : onArchive && (
            <button
              onClick={onArchive}
              className={`${toneBtn('bg-amber-500/90 hover:bg-amber-600')} border border-amber-400/30`}
              aria-label="Archive" title="Archive"
            >
              <Archive className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Archive</span>
            </button>
          )}

          {onDelete && (
            <>
              {/* `shrink-0` like the buttons — in a nowrap row a plain divider
                  would be squeezed to nothing. */}
              <div className="hidden sm:block shrink-0 self-center w-px h-5 bg-white/20" />
              <button
                onClick={onDelete}
                className={`${toneBtn('bg-red-500/90 hover:bg-red-600')} border border-red-400/30`}
                aria-label="Delete" title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">Delete</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
