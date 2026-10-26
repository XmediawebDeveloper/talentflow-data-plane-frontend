'use client'

import { ChevronRight, ChevronDown, Folder, FolderOpen, Plus, Upload, Edit2, Trash2, LayoutGrid, Archive, FolderRoot } from 'lucide-react';
import { useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useFolderPanelCollapsed, folderColumnClasses, FolderCollapseButton, FolderPanelRail } from '@/components/ui/folder-panel-collapse';
import { createPortal } from 'react-dom';
import { useDrop } from 'react-dnd';
import { Folder as FolderType, Resume } from '@/lib/types/types';
import { toast } from 'sonner';
import { MENU_ITEM_SCALE_CLASS } from '@/lib/constants/menuAnimation';

// Folder-actions (⋮) menu item styling — same neutral hover-changes-only-the-
// background convention as every other ⋮ menu in the app (ResumeTable,
// JobsListing), rather than this menu's old text-turns-blue-on-hover
// treatment, whose dark-mode variant left a light-blue pill with black text
// floating in an otherwise dark popover.
const folderMenuItemClass = 'group w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-slate-300 transition-colors flex items-center gap-2';
const folderMenuItemRedClass = 'group w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 transition-colors flex items-center gap-2';

// Max folder depth (root → level1 → level2 → level3 = 3 levels of nesting).
// Exported so the card view's create control enforces the same ceiling as the
// tree's own "Create Subfolder" action.
export const MAX_FOLDER_DEPTH = 3;

/** Longest folder name we accept. Exported so every entry point — the tree's
 *  create/rename inputs, the upload modal, and the pages' own submit handlers —
 *  enforces the same number. */
export const FOLDER_NAME_MAX_LENGTH = 60;

/* ---- Tree guide geometry -------------------------------------------------
 * The rows are a flat list indented with padding, not nested boxes, so the
 * connector lines are drawn per row from the same numbers that produce the
 * indent. `TREE_COLUMN_CENTER` is half the 20px chevron/spacer column, i.e.
 * where a parent's toggle sits — so the trunk drops out of the chevron and the
 * elbow lands on the child's icon.
 */
const TREE_INDENT = 16;
const TREE_BASE_PADDING = 12;
const TREE_COLUMN_CENTER = 10;
/** x of the vertical line belonging to a folder at `depth`. */
const treeGuideX = (depth: number) => TREE_BASE_PADDING + depth * TREE_INDENT + TREE_COLUMN_CENTER;
/**
 * Elbow reach, which depends on what the row leads with.
 *
 * A childless row's first glyph is the folder icon, 28px in, so the elbow can
 * cross the empty toggle column and stop in the gutter just before it. A row
 * that expands leads with a chevron sitting at the very start of that column,
 * so the same reach would draw straight through the chevron — the row paints
 * over the guides, but the chevron is an outline, so the line showed through
 * its gaps. There the elbow stops at the chevron's left edge and lets the
 * chevron terminate the branch.
 */
const TREE_ELBOW_TO_ICON = TREE_INDENT + TREE_COLUMN_CENTER;
const TREE_ELBOW_TO_CHEVRON = TREE_INDENT - TREE_COLUMN_CENTER + 2;
/**
 * Guide colours, in two weights. The row's own branch is the line that says
 * "this folder hangs off that one", so it reads darker; the ancestor trunks
 * running past it stay a step lighter and recede. Both are stronger than the
 * gray-200 hairline these started as, which all but vanished against the white
 * panel.
 */
const TREE_BRANCH_COLOR = 'bg-gray-400';
const TREE_TRUNK_COLOR = 'bg-gray-300';

// Panel width bounds — the same ones the container's min/max styles enforce, so
// a drag can never push it outside what CSS would clamp back anyway.
const MIN_PANEL_WIDTH = 200;
const MAX_PANEL_WIDTH = 400;
const DEFAULT_PANEL_WIDTH = 240;
/* The folder list's height is CSS-driven now: it flexes to whatever the row
   leaves it on md+, and falls back to `max-h-[420px]` on the stacked mobile
   layout. Spelled out as a class rather than built from a constant — Tailwind
   only ships classes it can find literally in the source. */
/** Folder-actions menu geometry. The menu is portalled to the body and placed
 *  against the viewport, so these drive the flip/clamp maths below. */
const FOLDER_MENU_WIDTH = 192; // w-48
const FOLDER_MENU_GAP = 6; // breathing room between the trigger and the menu
const FOLDER_MENU_EDGE = 8; // smallest gap we leave to any viewport edge
/** One keyboard nudge of the resize handle. */
const RESIZE_STEP = 16;

// Drag item type for resumes
const RESUME_DRAG_TYPE = 'RESUME';

interface DragItem {
  id: string;
  ids: string[];
}

// Droppable folder item component
interface DroppableFolderItemProps {
  folder: FolderType;
  level: number;
  isExpanded: boolean;
  isSelected: boolean;
  hasChildren: boolean;
  count: number;
  hasMenu: boolean;
  onSelectFolder: (id: string) => void;
  onToggleFolder: (id: string) => void;
  onShowMenu: (id: string | null, anchor?: DOMRect) => void;
  onMoveToFolder?: (resumeIds: string[], folderId: string) => void;
  /** Hides the per-row folder-actions trigger. See `FolderTreeProps.readOnly`. */
  readOnly?: boolean;
  children?: React.ReactNode;
}

function DroppableFolderItem({
  folder,
  level,
  isExpanded,
  isSelected,
  hasChildren,
  count,
  hasMenu,
  onSelectFolder,
  onToggleFolder,
  onShowMenu,
  onMoveToFolder,
  readOnly = false,
  children,
}: DroppableFolderItemProps) {
  // "All Resumes" is a view, not a destination — there is nothing to move a
  // resume *into*. Every real folder accepts a drop, root included.
  const isBlockedFolder = folder.id === 'all';

  const [{ isOver, canDrop }, drop] = useDrop<DragItem, void, { isOver: boolean; canDrop: boolean }>({
    accept: RESUME_DRAG_TYPE,
    drop: (item) => {
      const resumeIds = item.ids && item.ids.length > 0 ? item.ids : [item.id];
      if (onMoveToFolder) {
        onMoveToFolder(resumeIds, folder.id);
      }
    },
    canDrop: () => !isBlockedFolder,
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });

  const isDropTarget = isOver && canDrop;

  return (
    <div
      ref={drop as unknown as React.Ref<HTMLDivElement>}
      // `relative` so the row paints over the tree guide lines behind it — both
      // are positioned, so DOM order wins and the elbow passes under the icon
      // instead of striking through it.
      className={`group relative w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer ${
        isDropTarget
          ? 'bg-blue-100 border-2 border-blue-500 border-dashed'
          : isSelected
          ? 'bg-blue-50 text-blue-600'
          : 'text-gray-700 hover:bg-gray-100'
      }`}
      style={{ paddingLeft: `${12 + level * 16}px` }}
      onClick={() => onSelectFolder(folder.id)}
    >
      {hasChildren && (
        <span
          onClick={(e) => {
            e.stopPropagation();
            onToggleFolder(folder.id);
          }}
          className="p-0.5 cursor-pointer"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </span>
      )}
      {!hasChildren && <div className="w-5" />}
      {folder.id === 'all' ? (
        <LayoutGrid className="w-4 h-4 text-blue-600" />
      ) : folder.name === 'Archived Resumes' && !folder.parentId ? (
        <Archive className="w-4 h-4 text-amber-600" />
      ) : folder.name.toLowerCase() === 'root' && !folder.parentId ? (
        // The default landing folder for uploads — its own icon, so it reads
        // apart from the user's folders in the fixtures section.
        <FolderRoot className="w-4 h-4 text-brand-cyan" />
      ) : isExpanded && hasChildren ? (
        <FolderOpen className="w-4 h-4 text-brand-orange" />
      ) : (
        <Folder className="w-4 h-4 text-brand-orange" />
      )}
      {/* `min-w-0` + truncate is what keeps a long name inside the panel — a
          60-character folder would otherwise push the row wider than the
          column and run out over the table beside it. */}
      <span className={`flex-1 min-w-0 text-left truncate ${MENU_ITEM_SCALE_CLASS}`} title={folder.name}>{folder.name}</span>
      <span className="flex-shrink-0 text-xs text-gray-500">({count})</span>
      {/* No actions on the fixtures: All Resumes is a view, and root and
          Archived Resumes can't be renamed or deleted, which is most of what
          the menu is for. Uploading into root happens through the page's
          Upload button, which already defaults there. */}
      {!readOnly
        && folder.id !== 'all'
        && !(folder.name.toLowerCase() === 'root' && !folder.parentId)
        && !(folder.name === 'Archived Resumes' && !folder.parentId) && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onShowMenu(
              hasMenu ? null : folder.id,
              e.currentTarget.getBoundingClientRect(),
            );
          }}
          className={`opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-blue-100 text-blue-600 transition-opacity ${
            hasMenu ? 'opacity-100 bg-blue-100' : ''
          }`}
          aria-label="Folder actions" title="Folder actions"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      )}
      {children}
    </div>
  );
}

interface FolderTreeProps {
  folders: FolderType[];
  selectedFolder: string;
  onSelectFolder: (id: string) => void;
  onCreateFolder?: (name: string, parentId?: string) => void;
  onRenameFolder?: (folderId: string, newName: string) => void;
  onDeleteFolder?: (folderId: string) => void;
  onUploadToFolder?: (folderId: string) => void;
  onMoveToFolder?: (resumeIds: string[], folderId: string) => void;
  selectedResumes?: string[];
  resumes: Resume[];
  width: number;
  onWidthChange: (width: number) => void;
  /** Browse-only tree: same hierarchy, labels, icons, colours and selected
   *  state, but without the folder-editing affordances (the "+ New" button and
   *  the per-row create/rename/delete/upload menu). For pickers such as the
   *  job-details "Select Applicants to Score" popup, where the tree is a filter
   *  and folder management belongs on the My Resumes page. */
  readOnly?: boolean;
  /** Shows the top "+ New" button (folder creation only) independent of
   *  `readOnly`, which otherwise also hides the per-row manage menu
   *  (rename/delete/upload/create-subfolder). Defaults to `!readOnly`, so
   *  every existing caller is unaffected. A `readOnly` picker that still wants
   *  to let the user create a top-level folder without exposing rename/
   *  delete/upload (e.g. the "Select Applicants to Score" popup) passes
   *  `readOnly` and `allowCreateFolder` together. */
  allowCreateFolder?: boolean;
  /** Permission gates for the folder-management affordances — independent of
   *  whether the handler prop itself is provided. Default to `true` so every
   *  existing caller that doesn't pass these keeps today's behavior. When
   *  `false`, the corresponding button/menu item stays visible but disabled. */
  canCreateFolder?: boolean;
  canRenameFolder?: boolean;
  canDeleteFolder?: boolean;
  /** Upload permission for the per-row "Upload to Folder" item (visible but
   *  greyed out with a hover reason when `false`). Defaults to `true`. */
  canUploadToFolder?: boolean;
  /** Leaves "Delete Folder" out of the per-row (+) menu. For pickers that
   *  offer the folder actions but keep deleting (and deciding where the
   *  folder's resumes go) on the Resume Database page. */
  hideDeleteFolder?: boolean;
  /** Adds a collapse button beside the "System Folders" heading that folds
   *  the whole column into a slim rail (md and up), remembered per browser
   *  and shared with every other database view. */
  collapsible?: boolean;
  /** The tree sits directly on a page panel (no card around it): drop the
   *  padding on its outer edges so its content lines up with the panel's
   *  content inset. Below md (a full-width band) both sides; from md (left
   *  column) the left side only. */
  flushStart?: boolean;
}

export default function FolderTree({
  folders,
  selectedFolder,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onUploadToFolder,
  onMoveToFolder,
  selectedResumes = [],
  resumes,
  width,
  onWidthChange,
  readOnly = false,
  allowCreateFolder,
  canCreateFolder = true,
  canRenameFolder = true,
  canDeleteFolder = true,
  canUploadToFolder = true,
  hideDeleteFolder = false,
  collapsible = false,
  flushStart = false,
}: FolderTreeProps) {
  // Collapsed folder column (md and up) — shared state, button and rail
  // (components/ui/folder-panel-collapse), the same in every database view.
  const { collapsed: isCollapsed, setCollapsed: setPanelCollapsed, animate: animateToggle } =
    useFolderPanelCollapsed(collapsible);
  const [expandedFolders, setExpandedFolders] = useState<string[]>(['engineering']);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [creatingSubFolderFor, setCreatingSubFolderFor] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [showFolderMenu, setShowFolderMenu] = useState<string | null>(null);
  // Where the open menu sits on screen, plus the trigger it belongs to. The
  // menu is portalled out of the scrolling list, so it carries its own
  // viewport coordinates instead of inheriting the row's.
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Wrappers for the inline new-folder / new-subfolder inputs and the
  // floating folder-actions menu. The document click handler below uses
  // these to detect clicks OUTSIDE these UI regions and close them.
  const newFolderInputRef = useRef<HTMLDivElement | null>(null);
  const subFolderInputRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // ---- Drag-to-resize for the folder column -------------------------------
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [isResizing, setIsResizing] = useState(false);

  /* The panel takes its height from the table beside it (see the note on the
     panel below), so opening a folder with few or no resumes shrank it to
     360px: the pinned System Folders kept their room and My Folders was left
     a sliver too small to use. From md up the panel is therefore held at least
     as tall as its own tree — fixtures plus every folder row — capped to the
     visible screen, where the list scrolls as before. A long table still makes
     it taller. */
  const contentColRef = useRef<HTMLDivElement | null>(null);
  const folderListRef = useRef<HTMLDivElement | null>(null);
  const [treeMinHeight, setTreeMinHeight] = useState<number | null>(null);
  useEffect(() => {
    const col = contentColRef.current;
    const list = folderListRef.current;
    if (!col || !list) return;
    const measure = () => {
      // Page panel only: inside a popup (Select Source) the dialog sizes it.
      if (window.innerWidth < 768 || col.closest('.fixed')) { setTreeMinHeight(null); return; }
      const natural = col.clientHeight - list.clientHeight + list.scrollHeight;
      const cap = window.innerHeight - 128; // app header + page breathing room
      const next = Math.round(Math.max(360, Math.min(natural, cap)));
      setTreeMinHeight(prev => (prev === next ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    Array.from(list.children).forEach(child => ro.observe(child));
    const mo = new MutationObserver(() => {
      Array.from(list.children).forEach(child => ro.observe(child));
      measure();
    });
    mo.observe(list, { childList: true, subtree: true });
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const clampWidth = (value: number) =>
    Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, Math.round(value)));

  /**
   * Pointer capture keeps the drag alive when the cursor runs past the handle —
   * off the panel, over the table, even outside the window — so the resize
   * doesn't stall the moment the mouse outpaces the re-render.
   */
  const handleResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const handle = event.currentTarget;
    const startX = event.clientX;
    const startWidth = panelRef.current?.getBoundingClientRect().width ?? width;

    handle.setPointerCapture(event.pointerId);
    setIsResizing(true);

    const handleMove = (moveEvent: PointerEvent) => {
      onWidthChange(clampWidth(startWidth + (moveEvent.clientX - startX)));
    };
    const handleEnd = () => {
      setIsResizing(false);
      handle.releasePointerCapture(event.pointerId);
      handle.removeEventListener('pointermove', handleMove);
      handle.removeEventListener('pointerup', handleEnd);
      handle.removeEventListener('pointercancel', handleEnd);
    };

    handle.addEventListener('pointermove', handleMove);
    handle.addEventListener('pointerup', handleEnd);
    handle.addEventListener('pointercancel', handleEnd);
  };

  const handleResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      onWidthChange(clampWidth(width - RESIZE_STEP));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      onWidthChange(clampWidth(width + RESIZE_STEP));
    } else if (event.key === 'Home') {
      event.preventDefault();
      onWidthChange(DEFAULT_PANEL_WIDTH);
    }
  };

  // A drag that crosses the table would otherwise select its text, and the
  // cursor would flicker back to the default the moment it leaves the handle.
  useEffect(() => {
    if (!isResizing) return;
    const { body } = document;
    const previousUserSelect = body.style.userSelect;
    const previousCursor = body.style.cursor;
    body.style.userSelect = 'none';
    body.style.cursor = 'col-resize';
    return () => {
      body.style.userSelect = previousUserSelect;
      body.style.cursor = previousCursor;
    };
  }, [isResizing]);

  const openFolderMenu = useCallback((id: string | null, anchor?: DOMRect) => {
    setShowFolderMenu(id);
    setMenuAnchor(id && anchor ? anchor : null);
    setMenuPosition(null);
  }, []);

  const closeFolderMenu = useCallback(() => {
    setShowFolderMenu(null);
    setMenuAnchor(null);
    setMenuPosition(null);
  }, []);

  useEffect(() => {
    if (!isCreatingFolder && !creatingSubFolderFor && !showFolderMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideNewFolder = newFolderInputRef.current?.contains(target);
      const insideSubFolder = subFolderInputRef.current?.contains(target);
      const insideMenu = menuRef.current?.contains(target);
      if (insideNewFolder || insideSubFolder || insideMenu) return;
      if (isCreatingFolder || creatingSubFolderFor) {
        setIsCreatingFolder(false);
        setCreatingSubFolderFor(null);
        setNewFolderName('');
      }
      if (showFolderMenu) {
        closeFolderMenu();
      }
    };
    // Use `mousedown` so the close fires before any other onClick handlers —
    // prevents the dropdown from re-opening when clicking the trigger again.
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isCreatingFolder, creatingSubFolderFor, showFolderMenu, closeFolderMenu]);

  /* The actions menu used to be absolutely positioned inside the folder list,
     which scrolls (`overflow-y-auto` clips on both axes) — a row near the
     bottom or a menu wider than the panel got its options and borders sliced
     off. It is portalled to the body now and placed against the viewport:
     right-aligned to the trigger, dropping below it when there's room and
     flipping above when there isn't, clamped away from every edge. Measured in
     a layout effect so the corrected position lands before paint. */
  useLayoutEffect(() => {
    if (!showFolderMenu || !menuAnchor) return;
    const menu = menuRef.current;
    if (!menu) return;

    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;
    const height = menu.offsetHeight;
    const spaceBelow = viewportH - menuAnchor.bottom - FOLDER_MENU_GAP - FOLDER_MENU_EDGE;
    const spaceAbove = menuAnchor.top - FOLDER_MENU_GAP - FOLDER_MENU_EDGE;
    // Below unless it doesn't fit and there is genuinely more room above.
    const flipUp = height > spaceBelow && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, flipUp ? spaceAbove : spaceBelow);
    const clampedHeight = Math.min(height, maxHeight);

    const top = flipUp
      ? Math.max(FOLDER_MENU_EDGE, menuAnchor.top - FOLDER_MENU_GAP - clampedHeight)
      : Math.min(menuAnchor.bottom + FOLDER_MENU_GAP, viewportH - FOLDER_MENU_EDGE - clampedHeight);
    const left = Math.min(
      Math.max(FOLDER_MENU_EDGE, menuAnchor.right - FOLDER_MENU_WIDTH),
      viewportW - FOLDER_MENU_EDGE - FOLDER_MENU_WIDTH,
    );

    setMenuPosition(prev =>
      prev && prev.top === top && prev.left === left && prev.maxHeight === maxHeight
        ? prev
        : { top, left, maxHeight },
    );
  }, [showFolderMenu, menuAnchor]);

  // Fixed coordinates go stale the moment anything moves under them, so close
  // on scroll (capture, to catch the folder list's own scrolling) and resize.
  useEffect(() => {
    if (!showFolderMenu) return;
    const dismiss = () => closeFolderMenu();
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [showFolderMenu, closeFolderMenu]);

  // Helper function to flatten folder tree for depth calculation
  const flattenFolders = useCallback((folderList: FolderType[]): FolderType[] => {
    const result: FolderType[] = [];
    const traverse = (items: FolderType[]) => {
      for (const folder of items) {
        result.push(folder);
        if (folder.children && folder.children.length > 0) {
          traverse(folder.children);
        }
      }
    };
    traverse(folderList);
    return result;
  }, []);

  // Calculate the depth of a folder (0 = root level)
  const getFolderDepth = useCallback((folderId: string): number => {
    const allFolders = flattenFolders(folders);
    let depth = 0;
    let current = allFolders.find(f => f.id === folderId);

    while (current?.parentId) {
      depth++;
      current = allFolders.find(f => f.id === current!.parentId);
    }

    return depth;
  }, [folders, flattenFolders]);

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const getResumeCount = (folderId: string) => {
    if (folderId === 'all') return resumes.length;
    return resumes.filter(r => r.folderId === folderId).length;
  };

  const handleCreateFolder = (parentId?: string) => {
    // Ignore if parentId is an event object (from onClick handler)
    const actualParentId = typeof parentId === 'string' ? parentId : undefined;

    if (!canCreateFolder) return;

    if (newFolderName.trim()) {
      // Check depth limit if creating a subfolder
      if (actualParentId) {
        const parentDepth = getFolderDepth(actualParentId);
        // Parent at depth 2 means child would be at depth 3, which is the max
        if (parentDepth >= MAX_FOLDER_DEPTH - 1) {
          toast.error(`Maximum folder depth reached (${MAX_FOLDER_DEPTH} levels)`);
          return;
        }
      }

      onCreateFolder?.(newFolderName, actualParentId);
      setNewFolderName('');
      setIsCreatingFolder(false);
      setCreatingSubFolderFor(null);
      // Expand parent folder if creating sub-folder
      if (actualParentId && !expandedFolders.includes(actualParentId)) {
        setExpandedFolders(prev => [...prev, actualParentId]);
      }
    }
  };

  const handleRename = (folderId: string) => {
    if (!canRenameFolder) {
      setRenamingFolderId(null);
      return;
    }
    if (renameValue.trim()) {
      onRenameFolder?.(folderId, renameValue);
      setRenamingFolderId(null);
      setRenameValue('');
    }
  };

  /**
   * The three fixtures — All Resumes, root and Archived Resumes — are pinned
   * above the "My Folders" heading. None can be renamed or deleted, and
   * keeping them out of the scrolling list means they stay reachable no
   * matter how far down the user has scrolled.
   *
   * Root sits here by placement only: it is drawn and handled like any other
   * folder (plain icon, actions menu, accepts drops) because it holds resumes
   * like one. Only rename and delete are withheld — the app finds it by name
   * to default uploads into it.
   */
  const pinnedRank = (folder: FolderType): number => {
    if (folder.id === 'all') return 0;
    if (!folder.parentId && folder.name.toLowerCase() === 'root') return 1;
    if (!folder.parentId && folder.name === 'Archived Resumes') return 2;
    return -1;
  };
  const pinnedFolders = folders
    .filter((f) => pinnedRank(f) >= 0)
    .sort((a, b) => pinnedRank(a) - pinnedRank(b));
  const regularFolders = folders.filter((f) => pinnedRank(f) < 0);

  /**
   * @param isLast  last among its siblings — its trunk stops at this row.
   * @param trunks  one flag per ancestor column: whether that ancestor's line
   *                still has rows below this one and must keep running past it.
   */
  const renderFolder = (
    folder: FolderType,
    level: number = 0,
    isLast: boolean = true,
    trunks: boolean[] = [],
  ) => {
    const isExpanded = expandedFolders.includes(folder.id);
    const isSelected = selectedFolder === folder.id;
    const hasChildren = folder.children && folder.children.length > 0;
    // Use folder.count from backend API instead of recalculating from current page resumes
    const count = folder.count || 0;
    const isCreatingSubFolder = creatingSubFolderFor === folder.id;
    const hasMenu = showFolderMenu === folder.id;
    const isRenaming = renamingFolderId === folder.id;
    const folderDepth = getFolderDepth(folder.id);
    const canCreateSubfolderDepth = folderDepth < MAX_FOLDER_DEPTH - 1;
    const canCreateSubfolder = canCreateFolder && canCreateSubfolderDepth;
    const subfolderDisabledReason = !canCreateFolder
      ? 'You do not have permission to create folders'
      : !canCreateSubfolderDepth
        ? `Maximum folder depth reached (${MAX_FOLDER_DEPTH} levels)`
        : '';

    return (
      <div key={folder.id} className="relative">
        {/* Row-level wrapper: the guides span this row only, never the
            children rendered below it. */}
        <div className="relative">
          {level > 0 && (
            <>
              {/* Ancestor trunks passing this row on their way further down. */}
              {trunks.map((keepsGoing, depth) => keepsGoing && (
                <span
                  key={depth}
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-y-0 w-px ${TREE_TRUNK_COLOR}`}
                  style={{ left: `${treeGuideX(depth)}px` }}
                />
              ))}
              {/* This row's own connector: down from the parent to the row's
                  middle, then across to the folder icon. */}
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute top-0 h-1/2 w-px ${TREE_BRANCH_COLOR}`}
                style={{ left: `${treeGuideX(level - 1)}px` }}
              />
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute top-1/2 h-px ${TREE_BRANCH_COLOR}`}
                style={{
                  left: `${treeGuideX(level - 1)}px`,
                  width: `${hasChildren ? TREE_ELBOW_TO_CHEVRON : TREE_ELBOW_TO_ICON}px`,
                }}
              />
              {/* Carries on below only while siblings follow, so the last child
                  ends the branch instead of leaving a line dangling. */}
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute top-1/2 bottom-0 w-px ${TREE_BRANCH_COLOR}`}
                  style={{ left: `${treeGuideX(level - 1)}px` }}
                />
              )}
            </>
          )}
        {isRenaming ? (
          // Inline rename mode
          <div className="relative px-3 py-2" style={{ paddingLeft: `${12 + level * 16}px` }}>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename(folder.id);
                if (e.key === 'Escape') {
                  setRenamingFolderId(null);
                  setRenameValue('');
                }
              }}
              onBlur={() => handleRename(folder.id)}
              placeholder="Folder name..."
              maxLength={FOLDER_NAME_MAX_LENGTH}
              autoFocus
              className="w-full px-2 py-1 text-sm border border-blue-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
          </div>
        ) : (
          <DroppableFolderItem
            folder={folder}
            level={level}
            isExpanded={isExpanded}
            isSelected={isSelected}
            hasChildren={hasChildren}
            count={count}
            hasMenu={hasMenu}
            onSelectFolder={onSelectFolder}
            onToggleFolder={toggleFolder}
            onShowMenu={openFolderMenu}
            onMoveToFolder={onMoveToFolder}
            readOnly={readOnly}
          />
        )}
        </div>

        {hasMenu && folder.id !== 'all' && menuAnchor && typeof document !== 'undefined' && createPortal(
          <div
            ref={menuRef}
            /* `fixed` + portal: outside the folder list's scroll box, so the
               full option list and its border/shadow always render. It scrolls
               internally only when the viewport itself is too short. */
            className="fixed w-48 bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-gray-200 dark:border-slate-700 py-1 z-[60] overflow-y-auto overscroll-contain"
            style={{
              top: menuPosition?.top ?? menuAnchor.bottom + FOLDER_MENU_GAP,
              left: menuPosition?.left ?? Math.max(FOLDER_MENU_EDGE, menuAnchor.right - FOLDER_MENU_WIDTH),
              maxHeight: menuPosition?.maxHeight,
              // Hidden for the one frame before the layout effect measures it,
              // so it never flashes at the unclamped position.
              visibility: menuPosition ? 'visible' : 'hidden',
            }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!canUploadToFolder) return;
                if (onUploadToFolder) {
                  onUploadToFolder?.(folder.id);
                }
                closeFolderMenu();
              }}
              aria-disabled={!canUploadToFolder}
              title={!canUploadToFolder ? 'You do not have permission to upload resumes' : undefined}
              className={canUploadToFolder ? folderMenuItemClass : `${folderMenuItemClass} !text-gray-400 dark:!text-slate-600 cursor-not-allowed opacity-60`}
            >
              <Upload className={`w-4 h-4 ${canUploadToFolder ? 'text-menu-icon-download' : ''}`} />
              <span className={MENU_ITEM_SCALE_CLASS}>Upload to Folder</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!canCreateSubfolder) return;
                setCreatingSubFolderFor(folder.id);
                setIsCreatingFolder(false);
                closeFolderMenu();
              }}
              aria-disabled={!canCreateSubfolder}
              className={`group w-full text-left px-4 py-2 text-sm transition-colors flex items-center gap-2 ${
                canCreateSubfolder
                  ? 'text-gray-700 dark:text-slate-300'
                  : 'text-gray-400 dark:text-slate-600 cursor-not-allowed opacity-60'
              }`}
              title={subfolderDisabledReason}
            >
              <Plus className={`w-4 h-4 ${canCreateSubfolder ? 'text-menu-icon-secondary' : ''}`} />
              <span className={MENU_ITEM_SCALE_CLASS}>Create Subfolder</span>
              {!canCreateSubfolder && (
                <span className="text-xs text-gray-400 dark:text-slate-600 ml-auto">
                  {!canCreateFolder ? '(no permission)' : '(max depth)'}
                </span>
              )}
            </button>
            {/* Only show rename option if not root folder or Archived Resumes folder */}
            {!(folder.name.toLowerCase() === 'root' && !folder.parentId) && !(folder.name === 'Archived Resumes' && !folder.parentId) && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!canRenameFolder) return;
                  setRenameValue(folder.name);
                  setRenamingFolderId(folder.id);
                  closeFolderMenu();
                }}
                aria-disabled={!canRenameFolder}
                title={!canRenameFolder ? 'You do not have permission to rename folders' : ''}
                className={canRenameFolder ? folderMenuItemClass : `${folderMenuItemClass} !text-gray-400 dark:!text-slate-600 cursor-not-allowed opacity-60`}
              >
                <Edit2 className={`w-4 h-4 ${canRenameFolder ? 'text-menu-icon-edit' : ''}`} />
                <span className={MENU_ITEM_SCALE_CLASS}>Rename Folder</span>
              </button>
            )}
            {/* Only show delete option if not root folder or Archived Resumes folder */}
            {!hideDeleteFolder && !(folder.name.toLowerCase() === 'root' && !folder.parentId) && !(folder.name === 'Archived Resumes' && !folder.parentId) && (
              <>
                <div className="border-t border-gray-200 dark:border-slate-700 my-1" />
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!canDeleteFolder) return;
                    onDeleteFolder?.(folder.id);
                    closeFolderMenu();
                  }}
                  aria-disabled={!canDeleteFolder}
                  title={!canDeleteFolder ? 'You do not have permission to delete folders' : ''}
                  className={canDeleteFolder ? folderMenuItemRedClass : `${folderMenuItemRedClass} !text-gray-400 dark:!text-slate-600 cursor-not-allowed opacity-60`}
                >
                  <Trash2 className="w-4 h-4" />
                  <span className={MENU_ITEM_SCALE_CLASS}>Delete Folder</span>
                </button>
              </>
            )}
          </div>,
          document.body,
        )}

        {isCreatingSubFolder && (
          <div className="mb-2 px-3" style={{ paddingLeft: `${28 + level * 16}px` }} ref={subFolderInputRef}>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder(folder.id);
                if (e.key === 'Escape') {
                  setCreatingSubFolderFor(null);
                  setNewFolderName('');
                }
              }}
              placeholder="Sub-folder name..."
              maxLength={FOLDER_NAME_MAX_LENGTH}
              autoFocus
              className="w-full px-2 py-1 text-xs border border-blue-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
            <div className="flex gap-1.5 mt-1.5">
              <button
                type="button"
                onClick={() => handleCreateFolder(folder.id)}
                className="flex-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreatingSubFolderFor(null);
                  setNewFolderName('');
                }}
                className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {hasChildren && isExpanded && (
          <div>
            {folder.children!.map((child, index) =>
              // Top-level rows sit under no trunk at all, so their children
              // start a fresh set rather than inheriting a phantom column.
              renderFolder(
                child,
                level + 1,
                index === folder.children!.length - 1,
                level === 0 ? [] : [...trunks, !isLast],
              )
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    /* The panel is a flex item of the page's `md:flex-row` list row, so it is
       stretched to the row's height for free — but only as long as it doesn't
       set that height itself. Its own content (fixtures + a long folder list)
       used to be taller than the table beside it, so the panel won: the table
       column got padded out with dead space and the tree ran far past the last
       table row (and its scrollbar with it). On md+ the content is therefore
       lifted out of flow — `md:absolute md:inset-0` below — leaving the panel
       with no intrinsic height, so the table decides the row height and the
       tree scrolls inside exactly that. `md:min-h-[360px]` keeps it usable
       when the table is short (a page of two rows, or an empty state). */
    <>
    {/* Collapsed: a slim rail in the column's place (md and up only — below
        md the folders are a band above the table, so there is no column to
        fold and the full tree stays). */}
    {isCollapsed && (
      <FolderPanelRail onExpand={() => setPanelCollapsed(false)} animate={animateToggle} from="md" />
    )}
    <div
      ref={panelRef}
      className={`relative border-b md:border-b-0 md:border-r border-gray-200 bg-white max-md:!w-full max-md:!max-w-full max-md:!min-w-0 md:min-h-[360px] ${folderColumnClasses(isCollapsed, animateToggle, 'md')}`}
      style={{
        width: `${width}px`,
        minWidth: `${MIN_PANEL_WIDTH}px`,
        maxWidth: `${MAX_PANEL_WIDTH}px`,
        ...(treeMinHeight && !isCollapsed ? { minHeight: `${treeMinHeight}px` } : {}),
      }}
    >
      {/* Resize handle — sits on the panel's right edge, over the divider.
          Desktop only: the panel is full-width below md, where there's no
          second column to trade space with. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize folder panel"
        aria-valuenow={Math.round(width)}
        aria-valuemin={MIN_PANEL_WIDTH}
        aria-valuemax={MAX_PANEL_WIDTH}
        tabIndex={0}
        onPointerDown={handleResizeStart}
        onKeyDown={handleResizeKeyDown}
        onDoubleClick={() => onWidthChange(DEFAULT_PANEL_WIDTH)}
        title="Drag to resize · double-click to reset"
        className={`group absolute inset-y-0 -right-1 z-10 hidden w-2 cursor-col-resize touch-none md:block focus:outline-none ${
          isResizing ? 'bg-brand-blue/10' : ''
        }`}
      >
        {/* Hairline that lights up on hover/drag — the hit area stays 8px wide
            so the handle is grabbable without a visibly thick divider. */}
        <span
          className={`pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded transition-colors ${
            isResizing ? 'bg-brand-blue' : 'bg-transparent group-hover:bg-brand-blue/50 group-focus:bg-brand-blue/50'
          }`}
        />
      </div>

      {/* Content column. Static (and self-sized) below md where the panel is a
          full-width band above the table; pinned to the panel's box from md up
          so the tree fills the row rather than defining it. */}
      <div ref={contentColRef} className={`flex flex-col md:absolute md:inset-0 md:overflow-hidden ${flushStart ? 'py-3 sm:py-4 md:pr-4' : 'p-3 sm:p-4'}`}>
      {/* Pinned fixtures — All Resumes, root, Archived Resumes. Named as their
          own section so it's clear why they can't be renamed or deleted. */}
      {pinnedFolders.length > 0 && (
        <>
          {/* `shrink-0` throughout the fixed part of the column: only the
              folder list may give up height when the row is short. */}
          <h3 className="text-gray-900 mb-2 flex shrink-0 items-center gap-2">
            System Folders
            <span className="h-1.5 w-1.5 rounded-full bg-brand-cyan" aria-hidden="true" />
            {/* Fold the whole folder column away (md and up). */}
            {collapsible && <FolderCollapseButton onCollapse={() => setPanelCollapsed(true)} from="md" />}
          </h3>
          {/* Outlined rather than filled: the rows carry their own hover and
              selection tints, and a section fill sat underneath them. The cyan
              border reads apart from the blue the tree uses for selection, so
              the section never looks like it is the selected one. */}
          <div className="shrink-0 space-y-1 rounded-lg border border-brand-cyan/30 p-1.5">
            {pinnedFolders.map(folder => renderFolder(folder))}
          </div>
        </>
      )}

      <div className="flex shrink-0 items-center justify-between mt-4 mb-3">
        <h3 className="text-gray-900">My Folders</h3>
        {(allowCreateFolder ?? !readOnly) && (
          <button
            type="button"
            onClick={() => {
              if (!canCreateFolder) return;
              setIsCreatingFolder(true);
            }}
            aria-disabled={!canCreateFolder}
            title={!canCreateFolder ? 'You do not have permission to create folders' : ''}
            className={`text-sm flex items-center gap-1 ${
              canCreateFolder ? 'text-blue-600 hover:text-blue-700' : 'text-gray-400 cursor-not-allowed opacity-60'
            }`}
          >
            <Plus className="w-4 h-4" />
            New
          </button>
        )}
      </div>

      {isCreatingFolder && (
        <div className="mb-3 shrink-0" ref={newFolderInputRef}>
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFolder();
              if (e.key === 'Escape') {
                setIsCreatingFolder(false);
                setNewFolderName('');
              }
            }}
            placeholder="Folder name..."
            maxLength={FOLDER_NAME_MAX_LENGTH}
            autoFocus
            className="w-full px-3 py-1.5 text-sm border border-blue-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => handleCreateFolder()}
              className="flex-1 px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => {
                setIsCreatingFolder(false);
                setNewFolderName('');
              }}
              className="flex-1 px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 text-black"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* The user's own folders take the height the fixtures above them leave
          and scroll inside it (`min-h-0` — a flex child won't shrink below its
          content without it). Below md there is no row height to divide up, so
          it falls back to a fixed cap. `scrollbar-visible` overrides the app's
          5px near-transparent default: at that size the track was easy to miss
          entirely, which is why the tree looked like it simply ran off the
          bottom. `scrollbar-gutter: stable` reserves the track so rows don't
          shift when it appears. */}
      <div
        ref={folderListRef}
        className="space-y-1 overflow-y-auto overscroll-contain pr-1 -mr-1 max-h-[420px] md:max-h-none md:min-h-0 md:flex-1 scrollbar-visible"
        style={{ scrollbarGutter: 'stable' }}
      >
        {regularFolders.length > 0 ? (
          regularFolders.map(folder => renderFolder(folder))
        ) : (
          <p className="px-3 py-2 text-xs text-gray-500">No folders yet.</p>
        )}
      </div>
      </div>
    </div>
    </>
  );
}
