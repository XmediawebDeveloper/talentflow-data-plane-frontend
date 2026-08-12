'use client'

import { ChevronRight, ChevronDown, Folder, FolderOpen, Plus, Upload, Edit2, Trash2, LayoutGrid, Archive, FolderRoot } from 'lucide-react';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useDrop } from 'react-dnd';
import { Folder as FolderType, Resume } from '@/lib/types/types';
import { toast } from 'sonner';

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
/** Height of the scrolling folder list. Fixed rather than viewport-relative so
 *  the panel looks the same on every screen. Applied as an inline style —
 *  Tailwind only ships classes it can find spelled out in the source, so a
 *  `max-h-[${...}]` built from this constant would never be generated. */
const FOLDER_LIST_MAX_HEIGHT = 420;
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
  onShowMenu: (id: string | null) => void;
  onMoveToFolder?: (resumeIds: string[], folderId: string) => void;
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
  children,
}: DroppableFolderItemProps) {
  // Block dropping on "All Resumes" and "Root" folder
  const isBlockedFolder = folder.id === 'all' ||
    (folder.name.toLowerCase() === 'root' && !folder.parentId);

  const [{ isOver, canDrop }, drop] = useDrop<DragItem, void, { isOver: boolean; canDrop: boolean }>({
    accept: RESUME_DRAG_TYPE,
    drop: (item) => {
      const resumeIds = item.ids && item.ids.length > 0 ? item.ids : [item.id];
      if (onMoveToFolder) {
        onMoveToFolder(resumeIds, folder.id);
      }
    },
    // Cannot drop on "All Resumes" or "Root" folder
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
        // The default landing folder for uploads — its own icon, so it doesn't
        // read as just another user folder in the system section.
        <FolderRoot className="w-4 h-4 text-brand-cyan" />
      ) : isExpanded && hasChildren ? (
        <FolderOpen className="w-4 h-4" />
      ) : (
        <Folder className="w-4 h-4" />
      )}
      {/* `min-w-0` + truncate is what keeps a long name inside the panel — a
          60-character folder would otherwise push the row wider than the
          column and run out over the table beside it. */}
      <span className="flex-1 min-w-0 text-left truncate" title={folder.name}>{folder.name}</span>
      <span className="flex-shrink-0 text-xs text-gray-500">({count})</span>
      {folder.id !== 'all' && !(folder.name.toLowerCase() === 'root' && !folder.parentId) && !(folder.name === 'Archived Resumes' && !folder.parentId) && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onShowMenu(hasMenu ? null : folder.id);
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
  onCreateFolder: (name: string, parentId?: string) => void;
  onRenameFolder: (folderId: string, newName: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onUploadToFolder?: (folderId: string) => void;
  onMoveToFolder?: (resumeIds: string[], folderId: string) => void;
  selectedResumes?: string[];
  resumes: Resume[];
  width: number;
  onWidthChange: (width: number) => void;
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
}: FolderTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<string[]>(['engineering']);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [creatingSubFolderFor, setCreatingSubFolderFor] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [showFolderMenu, setShowFolderMenu] = useState<string | null>(null);
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
        setShowFolderMenu(null);
      }
    };
    // Use `mousedown` so the close fires before any other onClick handlers —
    // prevents the dropdown from re-opening when clicking the trigger again.
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isCreatingFolder, creatingSubFolderFor, showFolderMenu]);

  // The actions menu is absolutely positioned inside the scrolling folder list,
  // so a row near the bottom would open its menu below the visible edge and get
  // clipped. `block: 'nearest'` nudges the list just far enough to show it.
  useEffect(() => {
    if (!showFolderMenu) return;
    const frame = requestAnimationFrame(() => {
      menuRef.current?.scrollIntoView({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(frame);
  }, [showFolderMenu]);

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

      onCreateFolder(newFolderName, actualParentId);
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
    if (renameValue.trim()) {
      onRenameFolder(folderId, renameValue);
      setRenamingFolderId(null);
      setRenameValue('');
    }
  };

  /**
   * The three fixtures — All Resumes, root and Archived Resumes — are pinned
   * above the "Folders" heading. They aren't user folders (none can be renamed
   * or deleted), and keeping them out of the scrolling list means they stay
   * reachable no matter how far down the user has scrolled.
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
    const canCreateSubfolder = folderDepth < MAX_FOLDER_DEPTH - 1;

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
            onShowMenu={setShowFolderMenu}
            onMoveToFolder={onMoveToFolder}
          />
        )}
        </div>

        {hasMenu && folder.id !== 'all' && (
          <div
            ref={menuRef}
            className="absolute right-2 top-full mt-1 w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50"
            style={{ marginRight: `${8}px` }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onUploadToFolder) {
                  onUploadToFolder(folder.id);
                }
                setShowFolderMenu(null);
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Upload to Folder
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!canCreateSubfolder) {
                  toast.error(`Maximum folder depth reached (${MAX_FOLDER_DEPTH} levels)`);
                  setShowFolderMenu(null);
                  return;
                }
                setCreatingSubFolderFor(folder.id);
                setIsCreatingFolder(false);
                setShowFolderMenu(null);
              }}
              disabled={!canCreateSubfolder}
              className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center gap-2 ${
                canCreateSubfolder
                  ? 'text-gray-700 hover:bg-blue-50 hover:text-blue-600'
                  : 'text-gray-400 cursor-not-allowed'
              }`}
              title={!canCreateSubfolder ? `Maximum folder depth reached (${MAX_FOLDER_DEPTH} levels)` : ''}
            >
              <Plus className="w-4 h-4" />
              Create Subfolder
              {!canCreateSubfolder && <span className="text-xs text-gray-400 ml-auto">(max depth)</span>}
            </button>
            {/* Only show rename option if not root folder or Archived Resumes folder */}
            {!(folder.name.toLowerCase() === 'root' && !folder.parentId) && !(folder.name === 'Archived Resumes' && !folder.parentId) && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setRenameValue(folder.name);
                  setRenamingFolderId(folder.id);
                  setShowFolderMenu(null);
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors flex items-center gap-2"
              >
                <Edit2 className="w-4 h-4" />
                Rename Folder
              </button>
            )}
            {/* Only show delete option if not root folder or Archived Resumes folder */}
            {!(folder.name.toLowerCase() === 'root' && !folder.parentId) && !(folder.name === 'Archived Resumes' && !folder.parentId) && (
              <>
                <div className="border-t border-gray-200 my-1" />
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDeleteFolder(folder.id);
                    setShowFolderMenu(null);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Folder
                </button>
              </>
            )}
          </div>
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
    <div
      ref={panelRef}
      className="relative border-b md:border-b-0 md:border-r border-gray-200 bg-white p-3 sm:p-4 max-md:!w-full max-md:!max-w-full max-md:!min-w-0"
      style={{ width: `${width}px`, minWidth: `${MIN_PANEL_WIDTH}px`, maxWidth: `${MAX_PANEL_WIDTH}px` }}
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

      {/* Pinned fixtures — All Resumes, root, Archived Resumes. Named as their
          own section so it's clear why they can't be renamed or deleted. */}
      {pinnedFolders.length > 0 && (
        <>
          <h3 className="text-gray-900 mb-2 flex items-center gap-2">
            System Folders
            <span className="h-1.5 w-1.5 rounded-full bg-brand-cyan" aria-hidden="true" />
          </h3>
          {/* Outlined rather than filled: the rows carry their own hover and
              selection tints, and a section fill sat underneath them. The cyan
              border reads apart from the blue the tree uses for selection, so
              the section never looks like it is the selected one. */}
          <div className="space-y-1 rounded-lg border border-brand-cyan/30 p-1.5">
            {pinnedFolders.map(folder => renderFolder(folder))}
          </div>
        </>
      )}

      <div className="flex items-center justify-between mt-4 mb-3">
        <h3 className="text-gray-900">My Folders</h3>
        <button
          type="button"
          onClick={() => setIsCreatingFolder(true)}
          className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1"
        >
          <Plus className="w-4 h-4" />
          New
        </button>
      </div>

      {isCreatingFolder && (
        <div className="mb-3" ref={newFolderInputRef}>
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

      {/* The user's own folders scroll on their own. A fixed cap rather than a
          flex one: the page lays this column out in a plain `flex md:flex-row`
          with no height of its own, so `flex-1 min-h-0` would have nothing to
          measure against and a long list would stretch the whole row instead of
          scrolling. `pr-1 -mr-1` keeps the scrollbar off the folder rows
          without shifting them. */}
      <div
        className="space-y-1 overflow-y-auto overscroll-contain pr-1 -mr-1"
        style={{ maxHeight: `${FOLDER_LIST_MAX_HEIGHT}px` }}
      >
        {regularFolders.length > 0 ? (
          regularFolders.map(folder => renderFolder(folder))
        ) : (
          <p className="px-3 py-2 text-xs text-gray-500">No folders yet.</p>
        )}
      </div>
    </div>
  );
}
