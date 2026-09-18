'use client'

// `Folder` is already taken by the type imported below, so the icon comes in
// under an alias.
import { Eye, Briefcase, Download, MoreVertical, Paperclip, Upload, Zap, FileSearch, Edit3, FolderOpen, Folder as FolderIcon, Trash2, Copy, Share2, Mail, Send, Star, Tag, Archive, Clock, GripVertical, FileText, Loader2, X } from 'lucide-react';
import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useDrag, useDrop } from 'react-dnd';
import { Resume, Folder } from '@/lib/types/types';
import { MENU_ITEM_SCALE_CLASS } from '@/lib/constants/menuAnimation';
import { formatISTDate } from '@/lib/utils/dateUtils';
import { splitPhoneNumbers } from '@/lib/utils/phoneUtils';
import SkillsList from '@/components/ui/SkillsList';
import { getDisplaySkills } from '@/lib/utils/resumeSkills';
import { EmptyState } from './ui/empty-state';
import Pagination from './Pagination';
import { usePagination } from '@/lib/hooks/usePagination';
import ResumeVersionsModal from './ResumeVersionsModal';
import ShareResumeModal from './ShareResumeModal';
import { toast } from 'sonner';
import { resumeService } from '@/lib/services/resumeService';

/* Action menu item styling — copied verbatim from the Job Openings page's
   three-dot menu (JobsListing.tsx) so both menus read as one component:
   gray-700 text, hover:bg-gray-50, px-3/py-2 rows, sharp corners, and a
   scale-on-hover label. Orange/red variants mirror that same menu's
   Disable Job / Delete Job treatment for Archive and Delete here. */
const resumeActionMenuItemClass = 'group w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50';
const resumeActionMenuItemRedClass = 'group w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50';
// Drag item type for resumes
const RESUME_DRAG_TYPE = 'RESUME';

/* Geometry for the portalled ⋮ menu — mirrors FolderTree's folder-actions
   menu. Right-aligned to its trigger, w-52 (208px). */
const ACTION_MENU_WIDTH = 208; // w-52
const ACTION_MENU_GAP = 4; // matches the old mt-1/mb-1 spacing
const ACTION_MENU_EDGE = 8; // smallest gap left to any viewport edge
/* Never shrink below this, even in a sliver of space: the "Actions" heading
   plus one scrollable option still has to be readable. */
const ACTION_MENU_MIN_HEIGHT = 120;

/* True while the ⋮ button is still painted — inside every scrolling ancestor's
   box and inside the viewport. Checked against the trigger's midpoint, so a
   row half-slid under `.tf-table-shell`'s sticky header still counts as its
   own row; once it is past that, there is nothing left to anchor to and the
   menu is dismissed rather than left pointing at empty space. */
function isActionTriggerVisible(trigger: HTMLElement) {
  const rect = trigger.getBoundingClientRect();
  const midY = rect.top + rect.height / 2;
  const midX = rect.left + rect.width / 2;
  if (midY < 0 || midY > window.innerHeight || midX < 0 || midX > window.innerWidth) return false;
  for (let node = trigger.parentElement; node; node = node.parentElement) {
    const style = window.getComputedStyle(node);
    if (!/(auto|scroll|hidden|clip|overlay)/.test(`${style.overflowY} ${style.overflowX}`)) continue;
    const box = node.getBoundingClientRect();
    // A zero-sized ancestor (a display-contents wrapper, say) clips nothing.
    if (box.width === 0 && box.height === 0) continue;
    if (midY < box.top || midY > box.bottom || midX < box.left || midX > box.right) return false;
  }
  return true;
}

interface DragItem {
  id: string;
  ids: string[];
}

// Draggable row component
interface DraggableResumeRowProps {
  resume: Resume;
  selectedResumes: string[];
  children: React.ReactNode;
  className?: string;
  onViewDetails?: (resume: Resume) => void;
  draggable?: boolean;
  /** Given, the row accepts a dropped row and reports where it landed. */
  onReorder?: (item: DragItem, targetId: string) => void;
}

function DraggableResumeRow({ resume, selectedResumes, children, className, onViewDetails, draggable = true, onReorder }: DraggableResumeRowProps) {
  const [{ isDragging }, drag, preview] = useDrag<DragItem, void, { isDragging: boolean }>({
    type: RESUME_DRAG_TYPE,
    item: () => ({
      id: resume.id,
      // If current resume is selected, drag all selected resumes; otherwise just this one
      ids: selectedResumes.includes(resume.id) ? selectedResumes : [resume.id],
    }),
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  /* The row is a drop target as well as a drag source, so the same grip both
     moves a resume into a folder (the folder tree takes the drop) and reorders
     it here (a row takes the drop). Dropping a row onto itself does nothing. */
  const [{ isOver }, drop] = useDrop<DragItem, void, { isOver: boolean }>({
    accept: RESUME_DRAG_TYPE,
    canDrop: (item) => !!onReorder && !item.ids.includes(resume.id),
    drop: (item) => onReorder?.(item, resume.id),
    collect: (monitor) => ({
      isOver: monitor.isOver() && monitor.canDrop(),
    }),
  });

  const rowRef = (node: HTMLTableRowElement | null) => {
    if (draggable) preview(node);
    if (onReorder) drop(node);
  };

  return (
    <tr
      ref={rowRef}
      className={`${className} ${isDragging ? 'opacity-50' : ''} ${
        isOver ? 'ring-2 ring-inset ring-brand-blue/60' : ''
      } ${onViewDetails ? 'cursor-pointer' : ''}`}
      data-row-selected={selectedResumes.includes(resume.id)}
      onClick={onViewDetails ? () => onViewDetails(resume) : undefined}
    >
      {/* Drag handle — pinned with the tick column, same solid background.
          Its width is pinned to exactly 40px (and the tick column starts at
          left-10 to match): the grip needs 40px to render, so a narrower
          declared width let the ticks overlap the grip and eat the drag. */}
      {draggable && (
        <td
          className={`sticky left-0 z-0 w-10 min-w-[40px] max-w-[40px] px-2 py-3 ${
            selectedResumes.includes(resume.id) ? 'bg-[var(--raw-e7ecf5)] dark:bg-transparent' : 'bg-white group-hover:bg-[var(--raw-f3f5fa)]'
          }`}
        >
          <div ref={drag as unknown as React.Ref<HTMLDivElement>} className="cursor-grab hover:bg-gray-100 rounded p-1 flex items-center justify-center">
            <GripVertical className="w-4 h-4 text-gray-400" />
          </div>
        </td>
      )}
      {children}
    </tr>
  );
}

interface ResumeTableProps {
  resumes: Resume[];
  selectedResumes: string[];
  onSelectResume: (id: string) => void;
  onSelectAll: (selected: boolean) => void;
  onQuickView: (resume: Resume) => void;
  onApplyToJob?: (resume: Resume) => void;
  onDelete?: (id: string) => void;
  onMoveToFolder?: (resumeIds: string[], folderId: string) => void;
  folders?: Folder[];
  selectionMode?: boolean;
  onApplySelected?: () => void;
  onViewDetails?: (resume: Resume) => void;
  hideCheckboxes?: boolean;
  showTeamMemberBadge?: boolean;
  onVersion?: (resume: Resume) => void;
  highlightQuery?: string;
  onArchive?: (resumeId: string) => void;
  disablePagination?: boolean;
  isArchivedFolder?: boolean;
  archivedFolderId?: string;
  canShare?: boolean;
  canTag?: boolean;
  canDownload?: boolean;
  draggable?: boolean;
  /** Lets rows be dragged into a custom order. Needs `draggable`. */
  enableRowReorder?: boolean;
  /** What the custom order belongs to — a folder id, usually. The order is
   *  remembered per scope in this browser; omit it and the order lasts only
   *  as long as the list is mounted. */
  reorderScopeKey?: string;
  /** Resolves a resume's folder id to the folder's display name. Passing it
   *  adds a "Folder" column badging each row with the folder the resume
   *  actually lives in — what an aggregated view (All Resumes) needs to stay
   *  readable, and noise in a view that is already one folder. */
  getFolderName?: (folderId?: string) => string | undefined;
  showEmptyAction?: boolean;
  /** Replaces the built-in "No resumes found" block. Pages whose whole body is
   *  the empty state (My Resumes) pass their own illustrated version; every
   *  other caller keeps the default. */
  emptyState?: React.ReactNode;
  /** Extra classes for the outer wrapper. A dialog hands the table its own
   *  flex row and needs `flex-1 min-h-0 flex flex-col` here so the scroll
   *  shell below can fill exactly that space. Defaults to the page layout. */
  containerClassName?: string;
  /** Extra classes for the scrolling table shell. Pair
   *  `tf-table-shell--fill flex-1 min-h-0` with `containerClassName` inside a
   *  dialog: `.tf-table-shell`'s own `min-height: 400px` would otherwise push
   *  the shell past the dialog body and float its scrollbar over the footer. */
  tableShellClassName?: string;
}

// Helper function to highlight matching text
const highlightText = (text: string, query: string): React.ReactNode => {
  if (!query || !text) return text;

  // Split query into words for multi-keyword matching (handle both commas and spaces)
  const keywords = query.toLowerCase().replace(/,/g, ' ').split(/\s+/).filter(k => k.length > 0);
  if (keywords.length === 0) return text;

  // Create regex pattern for all keywords
  const escapedKeywords = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(${escapedKeywords.join('|')})`, 'gi');

  const parts = text.split(pattern);

  return parts.map((part, index) => {
    const isMatch = keywords.some(k => part.toLowerCase() === k);
    return isMatch ? (
      <mark key={index} className="bg-yellow-200 text-gray-900 px-0.5 rounded">
        {part}
      </mark>
    ) : (
      part
    );
  });
};

export default function ResumeTable({
  resumes,
  selectedResumes,
  onSelectResume,
  onSelectAll,
  onQuickView,
  onApplyToJob,
  onDelete,
  onMoveToFolder,
  folders,
  selectionMode = false,
  onApplySelected,
  onViewDetails,
  hideCheckboxes = false,
  showTeamMemberBadge = false,
  onVersion,
  highlightQuery,
  onArchive,
  disablePagination = false,
  isArchivedFolder = false,
  archivedFolderId,
  canShare = false,
  canTag = false,
  canDownload = true,
  draggable = true,
  enableRowReorder = false,
  reorderScopeKey,
  getFolderName,
  showEmptyAction = true,
  emptyState,
  containerClassName = 'flex-1',
  tableShellClassName = '',
}: ResumeTableProps) {
  const router = useRouter();
  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null);
  /* The ⋮ menu used to be absolutely positioned inside `.tf-table-shell`,
     which is `overflow-auto` — clipping the menu on the last few rows
     regardless of z-index, since overflow clipping isn't something z-index
     can escape. It is portalled to the body now (same fix as FolderTree's
     folder-actions menu) and placed against the viewport from the trigger's
     own coordinates.

     The trigger is held as the element, not as the DOMRect it had when it was
     clicked. A rect captured once goes stale the moment anything scrolls under
     it, which is exactly the case this menu is opened in — scroll the table,
     then hit the ⋮ of a row near its top — and left the panel stranded beside
     the wrong row, overlapping the sticky header. Keeping the element lets
     every reposition re-read `getBoundingClientRect()`, so the menu tracks its
     own row for as long as that row is on screen. */
  const actionTriggerRef = useRef<HTMLElement | null>(null);
  const [actionMenuPosition, setActionMenuPosition] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  /* The scrolling option list, separate from the panel: the "Actions" heading
     sits outside it so it can never scroll out of view, and its `scrollHeight`
     is what gives the panel's natural height back once a `maxHeight` has been
     applied. */
  const actionMenuListRef = useRef<HTMLDivElement | null>(null);
  const [versionHistoryResume, setVersionHistoryResume] = useState<Resume | null>(null);
  /** Set while the version history is being fetched for the Files column. */
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);

  // NEW: Modal states for complete workflows
  const [showEditModal, setShowEditModal] = useState(false);
  const [showMoveToFolderModal, setShowMoveToFolderModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [showAddTagsModal, setShowAddTagsModal] = useState(false);
  const [selectedResumeForAction, setSelectedResumeForAction] = useState<Resume | null>(null);

  const closeActionMenu = useCallback(() => {
    actionTriggerRef.current = null;
    setOpenActionMenu(null);
    setActionMenuPosition(null);
  }, []);

  // Same outside-click close behavior as the Job Openings three-dot menu.
  useEffect(() => {
    const handleClickOutside = () => {
      if (openActionMenu) {
        closeActionMenu();
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [openActionMenu, closeActionMenu]);

  /* Right-aligned to the trigger, dropping below it when there's room and
     flipping above when there isn't, clamped away from every viewport edge.

     Height comes from the option list's `scrollHeight`, not the panel's
     `offsetHeight`: once a `maxHeight` has been applied, `offsetHeight` *is*
     that cap, so measuring it again would ratchet the menu smaller on every
     reposition until it collapsed. */
  const positionActionMenu = useCallback(() => {
    const trigger = actionTriggerRef.current;
    const menu = actionMenuRef.current;
    if (!trigger || !menu) return;

    const anchor = trigger.getBoundingClientRect();
    const list = actionMenuListRef.current;
    const naturalHeight = list
      ? menu.offsetHeight - list.clientHeight + list.scrollHeight
      : menu.offsetHeight;

    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;
    const spaceBelow = viewportH - anchor.bottom - ACTION_MENU_GAP - ACTION_MENU_EDGE;
    const spaceAbove = anchor.top - ACTION_MENU_GAP - ACTION_MENU_EDGE;
    const flipUp = naturalHeight > spaceBelow && spaceAbove > spaceBelow;
    const maxHeight = Math.max(ACTION_MENU_MIN_HEIGHT, flipUp ? spaceAbove : spaceBelow);
    const clampedHeight = Math.min(naturalHeight, maxHeight);

    const top = flipUp
      ? Math.max(ACTION_MENU_EDGE, anchor.top - ACTION_MENU_GAP - clampedHeight)
      : Math.min(anchor.bottom + ACTION_MENU_GAP, viewportH - ACTION_MENU_EDGE - clampedHeight);
    const left = Math.min(
      Math.max(ACTION_MENU_EDGE, anchor.right - ACTION_MENU_WIDTH),
      viewportW - ACTION_MENU_EDGE - ACTION_MENU_WIDTH,
    );

    setActionMenuPosition(prev =>
      prev && prev.top === top && prev.left === left && prev.maxHeight === maxHeight
        ? prev
        : { top, left, maxHeight },
    );
  }, []);

  // Measured in a layout effect so the corrected position lands before paint —
  // the panel renders `visibility: hidden` until it has one, so it never
  // flashes at the unmeasured spot.
  useLayoutEffect(() => {
    if (!openActionMenu) return;
    positionActionMenu();
  }, [openActionMenu, positionActionMenu]);

  /* Fixed coordinates go stale the moment anything scrolls under them. The
     menu follows its row instead of being dismissed — that row's ⋮ is what was
     clicked, and dropping the menu on the first stray wheel tick is its own
     annoyance — and only closes once the row has scrolled out of the table's
     visible box, where there is no longer a row to point at. Capture phase, to
     catch `.tf-table-shell`'s own scrolling as well as the page's; coalesced
     into one frame so a fast scroll doesn't re-measure per event. */
  useEffect(() => {
    if (!openActionMenu) return;
    let frame = 0;
    const track = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const trigger = actionTriggerRef.current;
        if (!trigger) return;
        if (!isActionTriggerVisible(trigger)) {
          closeActionMenu();
          return;
        }
        positionActionMenu();
      });
    };
    window.addEventListener('scroll', track, true);
    window.addEventListener('resize', track);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', track, true);
      window.removeEventListener('resize', track);
    };
  }, [openActionMenu, positionActionMenu, closeActionMenu]);

  /* Custom row order. Only ids are kept — the rows themselves come from the
     parent on every fetch — and ids the saved order doesn't mention keep their
     natural position at the end, so newly uploaded resumes still appear. */
  const rowOrderEnabled = draggable && enableRowReorder;
  const orderStorageKey = reorderScopeKey ? `resumeTableOrder:${reorderScopeKey}` : null;
  const [customOrder, setCustomOrder] = useState<string[] | null>(null);

  // A different folder is a different order; read its own on arrival.
  useEffect(() => {
    if (!rowOrderEnabled) return;
    if (!orderStorageKey) {
      setCustomOrder(null);
      return;
    }
    try {
      const saved = localStorage.getItem(orderStorageKey);
      setCustomOrder(saved ? JSON.parse(saved) : null);
    } catch {
      setCustomOrder(null);
    }
  }, [orderStorageKey, rowOrderEnabled]);

  const orderedResumes = useMemo(() => {
    if (!rowOrderEnabled || !customOrder?.length) return resumes;
    const rank = new Map(customOrder.map((id, index) => [id, index]));
    // Stable: anything unranked keeps the order the parent sent it in, after
    // the ranked rows.
    return [...resumes].sort((a, b) => {
      const ra = rank.has(a.id) ? (rank.get(a.id) as number) : Number.MAX_SAFE_INTEGER;
      const rb = rank.has(b.id) ? (rank.get(b.id) as number) : Number.MAX_SAFE_INTEGER;
      return ra - rb;
    });
  }, [resumes, customOrder, rowOrderEnabled]);

  /* A row was dropped on another row: the dragged rows move to where the
     target sits — before it when they came from below, after it when they came
     from above, which is what "drag it there" looks like either way. */
  const handleRowReorder = (item: DragItem, targetId: string) => {
    const base = orderedResumes.map(r => r.id);
    const draggedIds = item.ids.filter(id => base.includes(id));
    if (draggedIds.length === 0 || draggedIds.includes(targetId)) return;

    const targetIndex = base.indexOf(targetId);
    const firstDraggedIndex = Math.min(...draggedIds.map(id => base.indexOf(id)));
    const rest = base.filter(id => !draggedIds.includes(id));
    const restTargetIndex = rest.indexOf(targetId);
    const insertAt = firstDraggedIndex > targetIndex ? restTargetIndex : restTargetIndex + 1;
    const next = [...rest.slice(0, insertAt), ...draggedIds, ...rest.slice(insertAt)];

    setCustomOrder(next);
    if (orderStorageKey) {
      try {
        localStorage.setItem(orderStorageKey, JSON.stringify(next));
      } catch {
        // A full or blocked store just costs the order on the next visit.
      }
    }
  };

  // Pagination (skipped when parent handles pagination server-side)
  const {
    paginatedItems: paginatedItemsFromHook,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    changeItemsPerPage,
    totalItems,
    startIndex,
    endIndex,
  } = usePagination({ items: orderedResumes, initialItemsPerPage: 25 });

  /* Keep the current page inside the row set. `usePagination` holds the page
     number on its own and never re-clamps it when `items` shrinks, so
     narrowing the list from underneath it — picking a smaller folder, typing
     a search — would leave the page pointing past the end and render an empty
     table with no way back except the pager. No effect when the parent
     paginates server-side. */
  useEffect(() => {
    if (!disablePagination && currentPage > 1 && currentPage > totalPages) {
      goToPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disablePagination, currentPage, totalPages]);

  // When pagination is disabled (server-side pagination), render all passed items
  const paginatedItems = disablePagination ? orderedResumes : paginatedItemsFromHook;

  // Header checkbox state must reflect the VISIBLE rows only — selections in
  // other folders/pages should not flip the header to "indeterminate" or
  // change its onSelectAll behaviour.
  const allSelected = resumes.length > 0 && resumes.every(r => selectedResumes.includes(r.id));
  const someSelected = !allSelected && resumes.some(r => selectedResumes.includes(r.id));


  // Handle showing version history - fetch versions from backend
  /* Always re-fetch, and keep the payload whole. The version comparison reads
     the parsed content of each version — skills, certifications, summary,
     title/company/location — and the row's own `versions` (plus the flattened
     shape this used to build) carry only file metadata, which left the compare
     view with nothing to diff. */
  const handleShowVersionHistory = async (resume: Resume) => {
    setIsLoadingVersions(true);
    try {
      const versions = await resumeService.getVersions(resume.id);
      setVersionHistoryResume({ ...resume, versions });
    } catch (error) {
      console.error('Failed to fetch versions:', error);
      toast.error('Failed to load version history');
    } finally {
      setIsLoadingVersions(false);
    }
  };

  /* The dialog writes its own subject and body from the resume it is given,
     so opening it is just naming the resume. */
  const openShareModal = (resume: Resume) => {
    setSelectedResumeForAction(resume);
    setShowShareModal(true);
  };

  const closeShareModal = () => {
    setShowShareModal(false);
    setSelectedResumeForAction(null);
  };

  if (resumes.length === 0) {
    if (emptyState) return <>{emptyState}</>;
    return (
      <EmptyState
        icon={FileText}
        title="No resumes found"
        description="We couldn't find any resumes matching your search criteria. Try adjusting your filters or search terms."
        action={showEmptyAction ? {
          label: 'Clear all filters',
          onClick: () => {
            // This would be handled by parent component
            window.location.reload();
          },
          variant: 'secondary'
        } : undefined}
      />
    );
  }

  return (
    <div className={containerClassName}>
      {/* FIX-008: Desktop Table View - hidden on mobile */}
      {/* The header only sticks against a container that actually scrolls
          vertically. This div was `overflow-x-auto` with no height cap, so it
          grew to fit every row and never scrolled — `sticky top-0` had nothing
          to stick to, and the header scrolled away with the page. Capping the
          height makes the rows scroll inside it and pins the header. */}
      <div className={`hidden md:block overflow-auto min-h-[320px] max-h-[calc(100dvh-24rem)] tf-table-shell ${tableShellClassName}`}>
        <table className="w-full min-w-[1200px] table-auto">
        {/* Background goes on the cells, not just <thead>: with separate cell
            backgrounds the rows would otherwise show through as they pass under. */}
        {/* Above the pinned column, whose cells sit at z-0: a pinned cell only
            has to beat the ordinary columns sliding under it sideways, and a
            positioned cell already paints above those at the same z. Anything
            higher there raced this header on the way past and won, hiding the
            select-all box behind the first row's checkbox. */}
        <thead className="sticky top-0 z-30 [&_th]:bg-slate-50 [&_th]:border-b [&_th]:border-gray-200">
          <tr>
            {/* Drag handle column — pinned too, so it stays beside the ticks.
                Same hard 40px as the body cell. */}
            {draggable && (
              <th className="sticky left-0 z-20 w-10 min-w-[40px] max-w-[40px] px-2 py-3 align-middle">
                <span className="sr-only">Drag</span>
              </th>
            )}
            {!hideCheckboxes && (
              /* The box, half-ticked when only some rows on the page are in,
                 with the running count beside it — the number is read where
                 the selecting happens. The count sits in a fixed-width slot
                 and `tabular-nums`, so the column doesn't shift as it grows a
                 digit. Pinned, so the ticks stay in view when the table is
                 scrolled sideways. */
              <th className={`sticky ${draggable ? 'left-10' : 'left-0'} z-20 w-px whitespace-nowrap px-4 py-3 align-middle border-r border-gray-200`}>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={input => {
                      if (input) input.indeterminate = someSelected;
                    }}
                    onChange={(e) => onSelectAll(e.target.checked)}
                    className="rounded border-gray-300 text-brand-blue focus:ring-brand-blue/40"
                    aria-label={allSelected ? 'Unselect all resumes on this page' : 'Select all resumes on this page'}
                    title={allSelected ? 'Unselect all resumes on this page' : 'Select all resumes on this page'}
                  />
                  <span
                    className="inline-block w-8 text-xs font-semibold text-gray-900 tabular-nums"
                    title={`${selectedResumes.length} resume${selectedResumes.length !== 1 ? 's' : ''} selected`}
                  >
                    {selectedResumes.length > 0 ? `(${selectedResumes.length})` : ''}
                  </span>
                </div>
              </th>
            )}
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider whitespace-nowrap align-middle">
              Candidate Name
            </th>
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider whitespace-nowrap align-middle">
              Role
            </th>
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider whitespace-nowrap align-middle">
              Email
            </th>
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider whitespace-nowrap align-middle">
              Phone
            </th>
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider whitespace-nowrap align-middle">
              Skills
            </th>
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider whitespace-nowrap align-middle">
              Experience
            </th>
            {getFolderName && (
              <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider whitespace-nowrap align-middle">
                Folder
              </th>
            )}
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider whitespace-nowrap align-middle">
              Source
            </th>
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider whitespace-nowrap align-middle">
              Upload Date
            </th>
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider whitespace-nowrap align-middle">
              Uploaded By
            </th>
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider whitespace-nowrap align-middle">
              Files
            </th>
            <th className="w-[76px] min-w-[76px] max-w-[76px] px-3 py-3 text-right text-xs text-gray-900 uppercase tracking-wider whitespace-nowrap align-middle tf-sticky-col">
              Actions
            </th>
          </tr>
        </thead>
        {/* `divide-y` rules between rows only, which left the last row's lower
            edge open against the shell's reserved height. The last-child rule
            closes the table off. */}
        <tbody className="bg-white divide-y divide-gray-200 [&>tr:last-child>td]:border-b [&>tr:last-child>td]:border-gray-200">
          {paginatedItems.map((resume) => (
            <DraggableResumeRow
              key={resume.id}
              resume={resume}
              selectedResumes={selectedResumes}
              draggable={draggable}
              onReorder={rowOrderEnabled ? handleRowReorder : undefined}
              /* `group` so the pinned cells can follow the row's hover. */
              className={`group hover:bg-brand-blue/5 transition-colors ${
                selectedResumes.includes(resume.id) ? 'bg-brand-blue/10 ring-1 ring-inset ring-brand-blue/20' : ''
              }`}
              onViewDetails={onViewDetails}
            >
              {!hideCheckboxes && (
                /* Pinned, so it needs a solid background of its own: the row's
                   translucent tint would let the columns underneath show
                   through as they scroll past. The two hexes are that tint
                   flattened onto white. */
                <td
                  className={`sticky ${draggable ? 'left-10' : 'left-0'} z-0 px-4 py-3 align-middle border-r border-gray-200 ${
                    selectedResumes.includes(resume.id)
                      ? 'bg-[var(--raw-e7ecf5)] dark:bg-transparent'
                      : 'bg-white group-hover:bg-[var(--raw-f3f5fa)]'
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={selectedResumes.includes(resume.id)}
                    onChange={() => onSelectResume(resume.id)}
                    className="rounded border-gray-300 text-brand-blue focus:ring-brand-blue/40"
                  />
                </td>
              )}
              <td className="px-4 py-3 align-middle whitespace-nowrap">
                <div className="flex items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      {onViewDetails ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); onViewDetails(resume); }}
                          className="text-sm font-medium text-brand-blue hover:text-brand-blue-2 hover:underline text-left transition-colors"
                        >
                          {highlightQuery ? highlightText(resume.name, highlightQuery) : resume.name}
                        </button>
                      ) : (
                        <div className="text-sm text-gray-900">
                          {highlightQuery ? highlightText(resume.name, highlightQuery) : resume.name}
                        </div>
                      )}
                      {resume.isArchived && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20">
                          <Archive className="w-3 h-3" />
                          Archived
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 align-middle whitespace-nowrap text-sm text-gray-700">
                {resume.title
                  ? (highlightQuery ? highlightText(resume.title, highlightQuery) : resume.title)
                  : <span className="text-gray-400">-</span>
                }
              </td>
              <td className="px-4 py-3 align-middle whitespace-nowrap text-sm text-gray-700">
                {resume.email && resume.email !== 'No email'
                  ? (highlightQuery ? highlightText(resume.email, highlightQuery) : resume.email)
                  : <span className="text-gray-400">-</span>
                }
              </td>
              <td className="px-4 py-3 align-middle whitespace-nowrap text-sm text-gray-700">
                {(() => {
                  // Show each number on its own line; cap at two when a resume
                  // carries multiple numbers in a single field.
                  const numbers = splitPhoneNumbers(resume.phone, 2);
                  if (numbers.length === 0) {
                    return <span className="text-gray-400">-</span>;
                  }
                  return (
                    <div className="flex flex-col gap-0.5">
                      {numbers.map((num, i) => (
                        <span key={i}>
                          {highlightQuery ? highlightText(num, highlightQuery) : num}
                        </span>
                      ))}
                    </div>
                  );
                })()}
              </td>
              <td className="px-4 py-3 align-middle min-w-[220px]">
                <div className="flex flex-wrap gap-1">
                  {/* Same set the Resume Details "Skills" section shows */}
                  <SkillsList
                    skills={getDisplaySkills(resume)}
                    highlight={(s) => (highlightQuery ? highlightText(s, highlightQuery) : s)}
                  />
                </div>
              </td>
              <td className="px-4 py-3 align-middle whitespace-nowrap text-sm text-gray-700">{resume.experience}</td>
              {getFolderName && (
                <td className="px-4 py-3 align-middle whitespace-nowrap">
                  {(() => {
                    // The folder the resume actually belongs to — one folder per
                    // resume, so the badge names its single home rather than the
                    // aggregated view it is being listed in.
                    const name = getFolderName(resume.folderId);
                    if (!name) return <span className="text-gray-400 text-sm">-</span>;
                    return (
                      <span
                        className="inline-flex max-w-[160px] items-center gap-1 px-2.5 py-1 rounded text-xs bg-slate-100 text-slate-700 ring-1 ring-slate-200"
                        title={name}
                      >
                        <FolderIcon className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{name}</span>
                      </span>
                    );
                  })()}
                </td>
              )}
              <td className="px-4 py-3 align-middle whitespace-nowrap">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs ring-1 ${
                    resume.source === 'Manual'
                      ? 'bg-brand-cyan/10 text-brand-cyan ring-brand-cyan/20'
                      : 'bg-brand-blue/10 text-brand-blue-2 ring-brand-blue/20'
                  }`}
                >
                  {resume.source === 'Manual' ? (
                    <Upload className="w-3 h-3" />
                  ) : (
                    <Zap className="w-3 h-3" />
                  )}
                  {resume.source}
                </span>
              </td>
              <td className="px-4 py-3 align-middle whitespace-nowrap text-sm text-gray-700">
                {formatISTDate(resume.uploadDate)}
              </td>
              <td className="px-4 py-3 align-middle whitespace-nowrap">
                <span className="text-sm text-gray-700">{resume.uploadedBy}</span>
              </td>
              <td className="px-4 py-3 align-middle whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => handleShowVersionHistory(resume)}
                  disabled={isLoadingVersions}
                  className="flex items-center gap-2 text-sm text-gray-700 hover:text-brand-blue transition-colors group disabled:opacity-50"
                >
                  <div className="flex items-center gap-1">
                    <Paperclip className="w-4 h-4" />
                    <span>{resume.attachments}</span>
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ring-1 group-hover:bg-brand-blue/15 transition-colors ${
                    (resume.versionCount && resume.versionCount > 1) || (resume.versions && resume.versions.length > 1)
                      ? 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20'
                      : 'bg-slate-100 text-gray-600 ring-gray-200'
                  }`}>
                    v{resume.version || 1}
                  </span>
                </button>
              </td>
              <td
                /* No z-index lift while the menu is open: the menu is
                   portalled to <body>, so the cell has nothing to rise above —
                   and raising it past the sticky header's z-11 only made this
                   one white cell paint over the ACTIONS heading. */
                className="w-[76px] min-w-[76px] max-w-[76px] px-3 py-2.5 align-middle whitespace-nowrap tf-sticky-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-end gap-1">
                  {selectionMode ? (
                    <button
                      onClick={() => {
                        onSelectResume(resume.id);
                        if (onApplySelected) {
                          onApplySelected();
                        }
                      }}
                      className="px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-all text-sm flex items-center gap-2 shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
                    >
                      <Briefcase className="w-4 h-4" />
                      Apply to Job
                    </button>
                  ) : (
                    <>
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const willOpen = openActionMenu !== resume.id;
                            if (willOpen) {
                              actionTriggerRef.current = e.currentTarget as HTMLElement;
                              setActionMenuPosition(null);
                              setOpenActionMenu(resume.id);
                            } else {
                              closeActionMenu();
                            }
                          }}
                          className="h-7 w-7 flex items-center justify-center bg-white border border-gray-300 rounded-md hover:bg-gray-50 hover:border-gray-400 transition-all"
                        >
                          <MoreVertical className="w-3.5 h-3.5 text-gray-600" />
                        </button>
                        {openActionMenu === resume.id && typeof document !== 'undefined' && createPortal(
                          <div
                            ref={actionMenuRef}
                            /* `fixed` + portal: outside `.tf-table-shell`'s
                               `overflow-auto` box, so the menu is never clipped
                               regardless of z-index — overflow clipping isn't
                               something z-index can escape.

                               A flex column, not one scrolling box: the heading
                               is the non-shrinking first child and only the
                               option list below it scrolls, so "Actions" stays
                               readable at the top of the overlay however little
                               room the menu was given. */
                            className="fixed w-52 flex flex-col bg-white rounded-lg shadow-lg border border-gray-200 z-[9999] overflow-hidden"
                            style={{
                              // Measured before paint by the layout effect;
                              // until then the panel sits at the origin with
                              // `visibility: hidden`, so it is laid out (and so
                              // measurable) without ever being seen there.
                              top: actionMenuPosition?.top ?? 0,
                              left: actionMenuPosition?.left ?? 0,
                              maxHeight: actionMenuPosition?.maxHeight,
                              visibility: actionMenuPosition ? 'visible' : 'hidden',
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {/* Same small-caps section label the rest of the
                                app uses (VersionHistoryModal's field headings),
                                so the menu names itself without competing with
                                its own options. */}
                            <div className="flex-none px-3 py-2 border-b border-gray-100 text-[11px] font-medium uppercase tracking-wider text-gray-500">
                              Actions
                            </div>
                            <div
                              ref={actionMenuListRef}
                              className="flex-1 min-h-0 py-1 overflow-y-auto overscroll-contain"
                            >
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onQuickView(resume);
                                closeActionMenu();
                              }}
                              className={resumeActionMenuItemClass}
                            >
                              <Eye className="w-4 h-4 text-menu-icon-view" />
                              <span className={MENU_ITEM_SCALE_CLASS}>Preview Resume</span>
                            </button>
                            {/* Apply to Job is deliberately absent from this
                                menu. The action still exists on the mobile
                                card and in the bulk actions bar; it was
                                dropped from the ⋮ list only. */}
                            {canDownload && (
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  closeActionMenu();
                                  try {
                                    toast.loading('Downloading resume...', { id: 'download' });
                                    const blob = await resumeService.download(resume.id);
                                    const url = window.URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    // Use original filename to preserve file extension (pdf, doc, docx, rtf, txt, etc.)
                                    a.download = resume.fileName || `${resume.name || 'resume'}.${resume.fileType || 'pdf'}`;
                                    document.body.appendChild(a);
                                    a.click();
                                    window.URL.revokeObjectURL(url);
                                    document.body.removeChild(a);
                                    toast.success('Resume downloaded', { id: 'download' });
                                  } catch (error) {
                                    console.error('Download failed:', error);
                                    toast.error('Failed to download resume', { id: 'download' });
                                  }
                                }}
                                className={resumeActionMenuItemClass}
                              >
                                <Download className="w-4 h-4 text-menu-icon-download" />
                                <span className={MENU_ITEM_SCALE_CLASS}>Download Resume</span>
                              </button>
                            )}
                            {canShare && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openShareModal(resume);
                                  closeActionMenu();
                                }}
                                className={resumeActionMenuItemClass}
                              >
                                <Share2 className="w-4 h-4 text-menu-icon-share" />
                                <span className={MENU_ITEM_SCALE_CLASS}>Share Resume</span>
                              </button>
                            )}
                            {canTag && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedResumeForAction(resume);
                                  setShowAddTagsModal(true);
                                  closeActionMenu();
                                }}
                                className={resumeActionMenuItemClass}
                              >
                                <Tag className="w-4 h-4 text-menu-icon-edit" />
                                <span className={MENU_ITEM_SCALE_CLASS}>Add Tags</span>
                              </button>
                            )}
                            {!!onArchive && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedResumeForAction(resume);
                                  setShowArchiveModal(true);
                                  closeActionMenu();
                                }}
                                className={resumeActionMenuItemClass}
                              >
                                <Archive className="w-4 h-4 text-menu-icon-archive" />
                                <span className={MENU_ITEM_SCALE_CLASS}>Archive Resume</span>
                              </button>
                            )}
                            {onDelete && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDelete?.(resume.id);
                                  closeActionMenu();
                                }}
                                className={resumeActionMenuItemRedClass}
                              >
                                <Trash2 className="w-4 h-4" />
                                <span className={MENU_ITEM_SCALE_CLASS}>Delete Resume</span>
                              </button>
                            )}
                            </div>
                          </div>,
                          document.body,
                        )}
                      </div>
                    </>
                  )}
                </div>
              </td>
            </DraggableResumeRow>
          ))}
        </tbody>
        </table>
      </div>

      {/* FIX-008: Mobile Card View - visible only on mobile */}
      <div className="md:hidden space-y-3 px-2">
        {paginatedItems.map((resume) => (
          <div
            key={resume.id}
            className={`bg-white border rounded-xl p-4 ring-1 transition-all ${
              selectedResumes.includes(resume.id) ? 'border-brand-blue/40 bg-brand-blue/5 ring-brand-blue/20 shadow-sm shadow-brand-blue/10' : 'border-gray-100 ring-black/[0.02] shadow-sm shadow-brand-blue/5'
            }`}
          >
            {/* Card Header */}
            <div className="flex items-start gap-3 mb-3">
              {!hideCheckboxes && (
                <input
                  type="checkbox"
                  checked={selectedResumes.includes(resume.id)}
                  onChange={() => onSelectResume(resume.id)}
                  className="rounded border-gray-300 text-brand-blue focus:ring-brand-blue/40 mt-1"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="font-medium text-gray-900 truncate">{resume.name}</div>
                  {resume.isArchived && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20 flex-shrink-0">
                      <Archive className="w-3 h-3" />
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-500 truncate">{resume.title}</div>
              </div>
            </div>

            {/* Card Content */}
            <div className="space-y-2 text-sm mb-3">
              {resume.email && resume.email !== 'No email' && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Mail className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{resume.email}</span>
                </div>
              )}
              {resume.experience && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Briefcase className="w-4 h-4 flex-shrink-0" />
                  <span>{resume.experience} years exp.</span>
                </div>
              )}
              {getDisplaySkills(resume).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  <SkillsList
                    skills={getDisplaySkills(resume)}
                    chipClassName="px-2 py-0.5 bg-brand-blue/5 text-brand-blue rounded text-xs ring-1 ring-brand-blue/20"
                    moreClassName="px-2 py-0.5 text-brand-blue text-xs font-medium rounded hover:bg-brand-blue/10 transition-colors cursor-pointer"
                  />
                </div>
              )}
            </div>

            {/* Card Actions */}
            <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
              <button
                onClick={() => onQuickView(resume)}
                className="flex-1 px-3 py-2 text-sm text-gray-700 bg-slate-100 hover:bg-brand-blue/5 hover:text-brand-blue rounded-lg flex items-center justify-center gap-1 transition-colors"
              >
                <Eye className="w-4 h-4" />
                View
              </button>
              {/* Apply to Job was dropped here too, to match the desktop ⋮
                  menu — the action lives in the bulk actions bar. */}
            </div>
          </div>
        ))}
      </div>

      {!disablePagination && totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={itemsPerPage}
          onPageChange={goToPage}
          onItemsPerPageChange={changeItemsPerPage}
        />
      )}
      
      {/* Version history — the same modal AI Talent Match uses, so a candidate's
          versions compare identically wherever they are opened from: per-version
          preview, download, and a diff of one version against the one before it. */}
      {versionHistoryResume && (
        <ResumeVersionsModal
          candidate={{
            id: versionHistoryResume.id,
            name: versionHistoryResume.name,
            resumeId: versionHistoryResume.id,
          }}
          versions={(versionHistoryResume.versions as any[]) || []}
          onClose={() => setVersionHistoryResume(null)}
          onApplyToJob={onApplyToJob ? () => {
            setVersionHistoryResume(null);
            onApplyToJob(versionHistoryResume);
          } : undefined}
        />
      )}

      {/* Loading indicator while the version history is fetched */}
      {isLoadingVersions && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 flex items-center gap-3 shadow-xl shadow-brand-blue/20 ring-1 ring-brand-blue/10">
            <Loader2 className="w-5 h-5 text-brand-blue animate-spin" />
            <span className="text-gray-700">Loading versions...</span>
          </div>
        </div>
      )}

      {/* Edit Details Modal */}
      {showEditModal && selectedResumeForAction && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-[95vw] sm:max-w-2xl w-full max-h-[90dvh] flex flex-col">
            <div className="p-6 border-b border-gray-200 shrink-0 flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-brand-blue rounded-xl flex items-center justify-center shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                    <Edit3 className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-gray-900">Edit Candidate Details</h2>
                </div>
                <p className="text-sm text-gray-600">
                  Update information for {selectedResumeForAction.name}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedResumeForAction(null);
                }}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors flex-shrink-0 ml-2"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Full Name</label>
                  <input
                    type="text"
                    defaultValue={selectedResumeForAction.name}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Job Title</label>
                  <input
                    type="text"
                    defaultValue={selectedResumeForAction.title}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Email</label>
                  <input
                    type="email"
                    defaultValue={selectedResumeForAction.email}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Phone</label>
                  <input
                    type="tel"
                    defaultValue={selectedResumeForAction.phone}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                  />
                </div>
                <div className="col-span-1 sm:col-span-2">
                  <label className="block text-sm text-gray-700 mb-2">Skills (comma separated)</label>
                  <input
                    type="text"
                    defaultValue={selectedResumeForAction.skills.join(', ')}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Experience</label>
                  <input
                    type="text"
                    defaultValue={selectedResumeForAction.experience}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Location</label>
                  <input
                    type="text"
                    defaultValue={selectedResumeForAction.location}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-gray-200 shrink-0">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedResumeForAction(null);
                }}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-lg hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  toast.success('Candidate details updated successfully');
                  setShowEditModal(false);
                  setSelectedResumeForAction(null);
                }}
                className="flex-1 px-4 py-2.5 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-all shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Resume — the shared dialog, so the table, the cards and the
          resume page all send a resume the same way. */}
      {showShareModal && selectedResumeForAction && (
        <ShareResumeModal resume={selectedResumeForAction} onClose={closeShareModal} />
      )}

      {/* Add Tags Modal */}
      {showAddTagsModal && selectedResumeForAction && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-[95vw] sm:max-w-md w-full max-h-[90dvh] flex flex-col">
            <div className="p-6 border-b border-gray-200 shrink-0 flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-brand-cyan rounded-xl flex items-center justify-center shadow-sm shadow-brand-cyan/25 ring-1 ring-white/10">
                    <Tag className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-gray-900">Add Tags</h2>
                </div>
                <p className="text-sm text-gray-600">
                  Add tags to {selectedResumeForAction.name}'s resume
                </p>
              </div>
              <button
                onClick={() => {
                  setShowAddTagsModal(false);
                  setSelectedResumeForAction(null);
                }}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors flex-shrink-0 ml-2"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div className="mb-6">
                <label className="block text-sm text-gray-700 mb-2">Tags</label>
                <input
                  type="text"
                  placeholder="Enter tags (comma separated)"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                />
                <p className="text-xs text-gray-500 mt-1">Example: high-priority, senior-level, remote</p>
              </div>
              <div className="mb-6">
                <p className="text-sm text-gray-700 mb-2">Suggested Tags</p>
                <div className="flex flex-wrap gap-2">
                  {['High Priority', 'Remote', 'Senior Level', 'Immediate Start', 'Contract'].map((tag) => (
                    <button
                      key={tag}
                      className="px-3 py-1 bg-brand-blue/5 text-brand-blue rounded-full text-xs hover:bg-brand-blue/10 transition-colors ring-1 ring-brand-blue/20"
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-gray-200 shrink-0">
              <button
                onClick={() => {
                  setShowAddTagsModal(false);
                  setSelectedResumeForAction(null);
                }}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-lg hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  toast.success('Tags added successfully');
                  setShowAddTagsModal(false);
                  setSelectedResumeForAction(null);
                }}
                className="flex-1 px-4 py-2.5 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-all flex items-center justify-center gap-2 shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
              >
                <Tag className="w-4 h-4" />
                Add Tags
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive Resume Modal */}
      {showArchiveModal && selectedResumeForAction && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-[95vw] sm:max-w-md w-full max-h-[90dvh] flex flex-col">
            <div className="p-6 border-b border-gray-200 shrink-0 flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-brand-orange rounded-xl flex items-center justify-center shadow-sm shadow-brand-orange/25 ring-1 ring-white/10">
                    <Archive className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-gray-900">Archive Resume</h2>
                </div>
                <p className="text-sm text-gray-600">
                  Archive {selectedResumeForAction.name}'s resume?
                </p>
              </div>
              <button
                onClick={() => {
                  setShowArchiveModal(false);
                  setSelectedResumeForAction(null);
                }}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors flex-shrink-0 ml-2"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div className="bg-brand-orange/5 border border-brand-orange/20 rounded-lg p-4">
                <p className="text-sm text-gray-800">
                  <strong>What happens when you archive?</strong>
                </p>
                <ul className="text-sm text-gray-700 mt-2 space-y-1 ml-4 list-disc">
                  <li>Resume moved to archived section</li>
                  <li>Removed from active database</li>
                  <li>All data preserved</li>
                  <li>Can be restored anytime</li>
                </ul>
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-gray-200 shrink-0">
              <button
                onClick={() => {
                  setShowArchiveModal(false);
                  setSelectedResumeForAction(null);
                }}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-lg hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (onArchive) {
                    onArchive(selectedResumeForAction.id);
                  } else {
                    // Fallback: call API directly
                    try {
                      await resumeService.archive(selectedResumeForAction.id, true);
                      toast.success('Resume archived successfully');
                    } catch (error) {
                      toast.error('Failed to archive resume');
                    }
                  }
                  setShowArchiveModal(false);
                  setSelectedResumeForAction(null);
                }}
                className="flex-1 px-4 py-2.5 bg-brand-orange hover:bg-brand-orange-deep text-white rounded-lg transition-all flex items-center justify-center gap-2 shadow-md shadow-brand-orange/25 ring-1 ring-white/10"
              >
                <Archive className="w-4 h-4" />
                Archive
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
