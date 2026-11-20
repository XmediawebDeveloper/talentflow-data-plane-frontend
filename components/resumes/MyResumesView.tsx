'use client';

import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Upload, Loader2, Search, History, X, AlertCircle, ChevronRight, ChevronDown, ArrowLeft, FileText, LayoutGrid, List, Folder, FolderOpen, MapPin, Phone, Download, Eye, MoreHorizontal, Trash2, Archive, FileArchive, Users, Info, UserPlus, Sparkles, Brain, Edit2, Layers } from 'lucide-react';
import { DndProvider, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import ResumeTable, { ResumeTableSkeleton } from '@/components/ResumeTable';
import DeleteResumeDialog, { type DeleteResumeVersionTarget } from '@/components/resumes/DeleteResumeDialog';
import NoResumesEmptyState from '@/components/resumes/NoResumesEmptyState';
import SkillsList from '@/components/ui/SkillsList';
import { getDisplaySkills } from '@/lib/utils/resumeSkills';
import ListPagination from '@/components/ListPagination';
import StatsCards from '@/components/StatsCards';
import SearchFilterBarCompact, { getResumeFilterChips } from '@/components/SearchFilterBarCompact';
import { type FilterChip } from '@/components/ui/filter-chips';
import { Skeleton } from '@/components/ui/skeleton';
import FilterSelect from '@/components/ui/filter-select';
import { fetchAllRows } from '@/lib/utils/fetchAllRows';
import { type ResumeVersionFilter, RESUME_VERSION_FILTER_OPTIONS, keepByVersion } from '@/components/resumes/resumeVersionFilter';
import FolderTree, { FOLDER_NAME_MAX_LENGTH, MAX_FOLDER_DEPTH } from '@/components/FolderTree';
import { useResumeSelection } from '@/components/resumes/ResumeSelectionContext';
import { canDownloadResume, DOWNLOAD_BLOCKED_MESSAGE } from '@/lib/permissions/resumeDownload';
import BulkActionsBar from '@/components/BulkActionsBar';
import { useResumeUploadFlow } from '@/components/resumes/useResumeUploadFlow';
import ResumeTextPreviewModal from '@/components/ResumeTextPreviewModal';
import ApplyToJobModal from '@/components/ApplyToJobModal';
import { useInviteDialog } from '@/components/talent-match-invite/InviteDialogProvider';
import type { InviteCandidate } from '@/components/talent-match-invite/inviteVersions';
import { useListSearch } from '@/lib/hooks/useListSearch';
import { MENU_ITEM_SCALE_CLASS } from '@/lib/constants/menuAnimation';
import { Resume, Folder as FolderType, Job } from '@/lib/types/types';
import { resumeService, folderService, RESUMES_CHANGED_EVENT, ensureArchivedFolder } from '@/lib/services/resumeService';
import { Resume as ApiResume, Folder as ApiFolder, FolderDeletionInfo } from '@/lib/services/resumeService';
import { convertApiResumeToRow, convertApiFolderToTree } from '@/lib/utils/resumeMappers';
import { formatCandidateExperience } from '@/lib/utils/resumeExperience';
import { jdService } from '@/lib/services/jdService';
import { scoringService } from '@/lib/services/scoringService';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import { toast } from 'sonner';
import { showErrorToast } from '@/lib/utils/errorToast';
import { useAuth } from '@/lib/hooks/useAuth';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import FeatureGate from '@/components/shared/FeatureGate';
import { usePlanFeatures, usePlanLock } from '@/lib/hooks/usePlanFeature';
import { PLAN_LOCKED_MESSAGE } from '@/lib/types/planFeatures';
import { formatISTDate } from '@/lib/utils/dateUtils';
import { RESUME_VIEW_SOURCE_PARAM, resumeDatabaseTabHref } from '@/lib/constants/resumePools';
import { rememberScoringOrigin } from '@/lib/utils/resumeActivityTrail';
import { useInPageScoringProgress } from '@/components/resumes/useInPageScoringProgress';
import ScoringStartSummary, { type ScoringStartRequest } from '@/components/resumes/ScoringStartSummary';
import { NoFoldersState, NoFoldersMatchState, NoMatchingResumesState } from '@/components/resumes/ResumeEmptyStates';
import { RESUME_DELETE_OWNER_ONLY_REASON, canDeleteResumes } from '@/lib/permissions/resumeDelete';
import { clickableProps } from '@/lib/a11y/clickableProps';
import { ModalA11y } from '@/components/ui/modal-a11y';
import { IconButton } from '@/components/ui/icon-button';

const formatDateIST = formatISTDate;

// Drag item type for resumes (must match ResumeTable and FolderTree)
const RESUME_DRAG_TYPE = 'RESUME';

/** Height of the expanded subfolder list on a folder card — roughly five rows,
 *  after which it scrolls rather than growing the card. Applied inline:
 *  Tailwind only ships classes spelled out in the source, so a `max-h-[${...}]`
 *  built from this constant would never be generated. */
const SUBFOLDER_PEEK_MAX_HEIGHT = 180;
/** This list's page sizes — the ones its pager has always offered. */
const RESUME_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
/** Width of the third-level flyout that opens beside the subfolder list. */
const SUBFOLDER_PEEK_PANEL_WIDTH = 224;
/** Approximate folder action menu height; used to decide whether to open upward. */
const FOLDER_ACTION_MENU_HEIGHT = 188;

type CardFolderFilter = 'all' | 'with-resumes' | 'empty' | 'with-subfolders';

/* fetchData options. `dedupe`: the call came from the params effect and may be
   skipped if it ends up replayed behind a running fetch that loaded the same
   params. `replay`: set internally when the guard replays a queued call. */
type FetchDataOptions = { dedupe?: boolean; replay?: boolean; reuse?: boolean };
/* `reuse` (the mount fetch only): switching back to this tab within 30 s shows
   the list / folders / counts it just read instead of re-asking all of them.
   Any write clears that cache, so it never hides a change made in this tab. */
const MOUNT_REUSE_WINDOW_MS = 5_000;

const CARD_FOLDER_FILTER_OPTIONS: { value: CardFolderFilter; label: string }[] = [
  { value: 'all', label: 'All folders' },
  { value: 'with-resumes', label: 'Has resumes' },
  { value: 'empty', label: 'Empty' },
  { value: 'with-subfolders', label: 'Has subfolders' },
];

/* Versions dropdown — shared with Shared Database (resumeVersionFilter.tsx). */

interface DragItem {
  id: string;
  ids: string[];
}

function UnifiedFolderResumeSearch({
  query,
  onQueryChange,
  onClear,
  folders,
  resumes,
  isLoading,
  onSelectFolder,
  onSelectResume,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  onClear: () => void;
  folders: FolderType[];
  resumes: Resume[];
  isLoading: boolean;
  onSelectFolder: (folderId: string) => void;
  onSelectResume: (resume: Resume) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const searchTerm = query.trim().toLowerCase();

  const folderResults = useMemo(() => {
    if (!searchTerm) return [];
    const out: { folder: FolderType; path: string }[] = [];
    const walk = (items: FolderType[], parentPath: string[] = []) => {
      for (const folder of items) {
        if (folder.id === 'all') continue;
        const pathParts = [...parentPath, folder.name];
        const path = pathParts.join(' / ');
        if (`${folder.name} ${path}`.toLowerCase().includes(searchTerm)) {
          out.push({ folder, path });
        }
        if (folder.children?.length) walk(folder.children, pathParts);
      }
    };
    walk(folders);
    return out.slice(0, 8);
  }, [folders, searchTerm]);

  const resumeResults = useMemo(() => {
    if (!searchTerm) return [];
    return resumes
      .filter((resume) => {
        const skills = getDisplaySkills(resume).join(' ');
        const haystack = [
          resume.name,
          resume.candidate_name,
          resume.title,
          resume.fileName,
          resume.file_name,
          resume.email,
          resume.phone,
          resume.location,
          skills,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(searchTerm);
      })
      .slice(0, 8);
  }, [resumes, searchTerm]);

  const hasResults = folderResults.length > 0 || resumeResults.length > 0;

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const clear = () => {
    onClear();
    setIsOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => {
            onQueryChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (query.trim()) setIsOpen(true);
          }}
          placeholder="Search folders and resumes..."
          className="w-full h-10 pl-10 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-transparent transition-all bg-gray-50 hover:bg-white text-black placeholder:text-gray-500 [&::-webkit-search-cancel-button]:hidden"
          role="searchbox"
          aria-label="Search folders and resumes"
          aria-autocomplete="list"
        />
        {isLoading && query.trim() ? (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 animate-spin" />
        ) : query ? (
          <IconButton bare label="Clear global search"
            type="button"
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 hover:bg-gray-200 rounded-full p-1 transition-colors"
          >
            <X className="w-4 h-4 text-gray-500 hover:text-gray-600" />
          </IconButton>
        ) : null}
      </div>

      {isOpen && query.trim() && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[420px] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl shadow-brand-blue/10 ring-1 ring-black/[0.02]">
          {isLoading && !hasResults ? (
            <div className="flex items-center justify-center py-8 tf-body-muted">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Searching...
            </div>
          ) : !hasResults ? (
            <div className="py-8 text-center tf-body-muted">
              No results found
            </div>
          ) : (
            <>
              {folderResults.length > 0 && (
                <div>
                  <div className="border-b border-gray-100 bg-gray-50 px-3 py-2 tf-eyebrow">
                    Folders ({folderResults.length})
                  </div>
                  {folderResults.map(({ folder, path }) => (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => {
                        setIsOpen(false);
                        onClear();
                        onSelectFolder(folder.id);
                      }}
                      className="w-full border-b border-gray-50 px-4 py-2.5 text-left transition-colors last:border-b-0 hover:bg-brand-blue/5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="tf-badge bg-brand-blue/10 text-2xs text-brand-blue ring-1 ring-brand-blue/15">
                          Folder
                        </span>
                        <span className="min-w-0 truncate tf-row-name">{folder.name}</span>
                      </div>
                      <div className="mt-0.5 truncate tf-meta">{path}</div>
                    </button>
                  ))}
                </div>
              )}

              {resumeResults.length > 0 && (
                <div>
                  <div className="border-b border-gray-100 bg-gray-50 px-3 py-2 tf-eyebrow">
                    Resumes ({resumeResults.length})
                  </div>
                  {resumeResults.map((resume) => (
                    <button
                      key={resume.id}
                      type="button"
                      onClick={() => {
                        setIsOpen(false);
                        onClear();
                        onSelectResume(resume);
                      }}
                      className="w-full border-b border-gray-50 px-4 py-2.5 text-left transition-colors last:border-b-0 hover:bg-brand-blue/5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="tf-badge bg-green-50 text-2xs text-green-700 ring-1 ring-green-200">
                          Resume
                        </span>
                        <span className="min-w-0 truncate tf-row-name">
                          {resume.name || resume.candidate_name || resume.fileName || 'Resume'}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate tf-meta">
                        {[resume.title, resume.email, resume.location].filter(Boolean).join(' / ') || resume.fileName || resume.file_name}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ToolbarFilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  icon,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  icon: ReactNode;
}) {
  const isActive = value !== 'all';

  return (
    <label title={label} className="relative min-w-0 flex-1 sm:min-w-[180px] sm:flex-none">
      <span className="sr-only">{label}</span>
      <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-gray-500">
        {icon}
      </span>
      <FilterSelect
        value={value}
        onChange={(v) => onChange(v as T)}
        ariaLabel={label}
        options={options}
        className={`w-full sm:w-full data-[size=default]:h-10 sm:data-[size=default]:h-10 py-0 sm:py-0 pl-9 sm:pl-9 pr-3 sm:pr-3 rounded-lg sm:rounded-lg transition-all ${
          isActive
            ? 'border-brand-blue/40 dark:border-brand-blue/40 bg-brand-blue/5 text-brand-blue'
            : 'border-gray-300 bg-gray-50 hover:bg-white'
        }`}
      />
    </label>
  );
}

// Droppable folder card for card view
interface DroppableFolderCardProps {
  folder: FolderType;
  resumeCount: number;
  hasSubfolders: boolean;
  isArchived: boolean;
  isRoot: boolean;
  /** Fixtures (root, Archived Resumes) have nothing the menu can offer — they
   *  can't be renamed or deleted — so their cards drop the hover "+" entirely
   *  rather than opening a menu of disabled items. */
  hideActions?: boolean;
  /** Fill the grid row's height. Only the fixtures row asks for this — see
   *  renderFolderCard. */
  stretch?: boolean;
  canUpload?: boolean;
  canCreateSubfolder?: boolean;
  canRename?: boolean;
  canDelete?: boolean;
  onNavigate: (folderId: string) => void;
  onMoveToFolder?: (resumeIds: string[], folderId: string) => void;
  onUploadToFolder?: (folderId: string) => void;
  onCreateSubfolder?: (folderId: string) => void;
  onStartRename?: (folder: FolderType) => void;
  onDeleteFolder?: (folderId: string) => void;
}

function DroppableFolderCard({
  folder,
  resumeCount,
  hasSubfolders,
  isArchived,
  isRoot,
  hideActions = false,
  stretch = false,
  canUpload = false,
  canCreateSubfolder = false,
  canRename = false,
  canDelete = false,
  onNavigate,
  onMoveToFolder,
  onUploadToFolder,
  onCreateSubfolder,
  onStartRename,
  onDeleteFolder,
}: DroppableFolderCardProps) {
  const [{ isOver, canDrop }, drop] = useDrop<DragItem, void, { isOver: boolean; canDrop: boolean }>({
    accept: RESUME_DRAG_TYPE,
    drop: (item) => {
      const resumeIds = item.ids && item.ids.length > 0 ? item.ids : [item.id];
      if (onMoveToFolder) {
        onMoveToFolder(resumeIds, folder.id);
      }
    },
    // Every folder card is a destination — root is an ordinary folder here.
    canDrop: () => true,
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });

  const isDropTarget = isOver && canDrop;

  // Subfolders peek. Expanding beats making the user open the folder just to
  // see what is in it, and beats a hover flyout: it survives the pointer
  // leaving, and works on touch and keyboard.
  const [showSubfolders, setShowSubfolders] = useState(false);
  const subfolders = folder.children ?? [];
  const [showActions, setShowActions] = useState(false);
  const [actionsDropUp, setActionsDropUp] = useState(false);

  // The list is drawn as a floating panel, not in the card's flow. In flow it
  // grew the card, and a grid row is as tall as its tallest item — so opening
  // one card left every neighbour in that row padded with dead space. Floating
  // it keeps all the cards the same height and the grid on its rhythm.
  const cardRef = useRef<HTMLDivElement | null>(null);
  const attachRefs = useCallback((node: HTMLDivElement | null) => {
    cardRef.current = node;
    (drop as unknown as (n: HTMLDivElement | null) => void)(node);
  }, [drop]);

  // Cards in the last row sit against the bottom of the page's white panel,
  // which is `overflow-hidden` — a panel hanging below them gets cut off, and
  // no z-index fixes clipping. So measure first and open upward when the room
  // below runs out.
  const [dropUp, setDropUp] = useState(false);

  // Third level: the child row being hovered, and which side its panel opens
  // on. Held on the card rather than inside the scrolling list, because that
  // list is `overflow-y-auto` — a flyout rendered inside it would be clipped
  // at its edge no matter what z-index it carried.
  const [peekChild, setPeekChild] = useState<FolderType | null>(null);
  const [peekOnLeft, setPeekOnLeft] = useState(false);

  useEffect(() => {
    if (!showSubfolders) setPeekChild(null);
  }, [showSubfolders]);

  useEffect(() => {
    if (!peekChild) return;
    const card = cardRef.current;
    if (!card) return;
    // Right by default; flip when the card sits against the right edge of the
    // page panel, where a right-hand flyout would be cut off.
    const rect = card.getBoundingClientRect();
    setPeekOnLeft(window.innerWidth - rect.right < SUBFOLDER_PEEK_PANEL_WIDTH + 16);
  }, [peekChild]);

  const toggleSubfolders = () => {
    if (showSubfolders) {
      setShowSubfolders(false);
      return;
    }

    const card = cardRef.current;
    if (card) {
      // The edge that actually clips is the nearest scroll/overflow ancestor,
      // not the viewport — for the last row those are different by hundreds of
      // pixels. Fall back to the viewport when the card is in normal flow.
      let clipBottom = window.innerHeight;
      for (let node = card.parentElement; node; node = node.parentElement) {
        const { overflow, overflowY } = window.getComputedStyle(node);
        if (overflow !== 'visible' || overflowY !== 'visible') {
          clipBottom = Math.min(clipBottom, node.getBoundingClientRect().bottom);
          break;
        }
      }
      const rect = card.getBoundingClientRect();
      const roomBelow = clipBottom - rect.bottom;
      const roomAbove = rect.top;
      const needed = SUBFOLDER_PEEK_MAX_HEIGHT + 8;
      // Down unless it won't fit and up genuinely fits better.
      setDropUp(roomBelow < needed && roomAbove > roomBelow);
    }

    // Mirrors toggleActions closing this panel: the two floating panels
    // (actions menu, subfolder peek) share the same card footprint, so only
    // one can be open at a time.
    setShowActions(false);
    setShowSubfolders(true);
  };

  const toggleActions = () => {
    if (!showActions) {
      const card = cardRef.current;
      const rect = card?.getBoundingClientRect();
      if (rect) {
        const boundary = card.closest('[data-folder-card-boundary]')?.getBoundingClientRect();
        const boundaryBottom = Math.min(window.innerHeight, boundary?.bottom ?? window.innerHeight);
        const boundaryTop = Math.max(0, boundary?.top ?? 0);
        const roomBelow = boundaryBottom - rect.bottom;
        const roomAbove = rect.top - boundaryTop;
        setActionsDropUp(roomBelow < FOLDER_ACTION_MENU_HEIGHT && roomAbove > roomBelow);
      } else {
        setActionsDropUp(false);
      }
      setShowSubfolders(false);
    }

    setShowActions((current) => !current);
  };

  // A floating panel that outlives a click elsewhere would sit over unrelated
  // cards, so close it the way any popover closes.
  useEffect(() => {
    if (!showSubfolders) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (cardRef.current?.contains(event.target as Node)) return;
      setShowSubfolders(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [showSubfolders]);

  useEffect(() => {
    if (!showActions) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (cardRef.current?.contains(event.target as Node)) return;
      setShowActions(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [showActions]);

  const runFolderAction = (event: React.MouseEvent, action?: () => void, disabled = false) => {
    event.preventDefault();
    event.stopPropagation();
    if (disabled || !action) return;
    action();
    setShowActions(false);
  };

  return (
    <div {...clickableProps}
      ref={attachRefs}
      className={`group/card relative bg-white border rounded-xl shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] cursor-pointer hover:shadow-md hover:shadow-brand-blue/10 transition-all ${
        stretch ? 'h-full' : ''
      } ${
        // High enough to clear the sections that follow the grid (the resumes
        // table and its own layers), not just the neighbouring cards.
        showActions ? 'z-50' : showSubfolders ? 'z-40' : ''
      } ${
        isDropTarget
          ? 'border-brand-blue border-2 border-dashed bg-brand-blue/5'
          : isArchived
            ? 'border-amber-200 hover:border-amber-400'
            : isRoot
              ? 'border-brand-cyan/20 hover:border-brand-cyan/40'
              : showSubfolders
                // Open card reads as the anchor of the list hanging off it.
                // No lift while open — the panel is pinned to the card's edge.
                ? 'border-brand-blue/40'
                : 'border-gray-100 hover:border-brand-blue/30 hover:-translate-y-0.5 duration-150'
      }`}
      onClick={() => onNavigate(folder.id)}
      // The flyout is a descendant, so this doesn't fire while the pointer is
      // on it — only when it leaves the card and its panels for good.
      onMouseLeave={() => setPeekChild(null)}
    >
      <div className="flex items-center gap-3 p-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ring-1 ${
          isArchived
            ? 'bg-amber-100 ring-amber-200/60'
            : isRoot
              ? 'bg-brand-cyan/10 ring-brand-cyan/15'
              : 'bg-brand-orange/10 ring-brand-orange/15'
        }`}>
          {isArchived ? (
            <Archive className="w-4 h-4 text-amber-600" />
          ) : (
            <Folder className={`w-4 h-4 ${isRoot ? 'text-brand-cyan' : 'text-brand-orange'}`} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="tf-row-title truncate">
            {isRoot ? 'Root (Default)' : folder.name}
          </h3>
          <p className="tf-meta">
            {hasSubfolders && `${subfolders.length} subfolder${subfolders.length !== 1 ? 's' : ''} • `}
            {resumeCount} resume{resumeCount !== 1 ? 's' : ''}
          </p>
        </div>
        {/* Peek toggle. `stopPropagation` so it never triggers the card's own
            navigate — the whole point is to look without leaving. */}
        <div className="relative flex-shrink-0">
          {!hideActions && (
          <IconButton bare label={`Folder actions for ${folder.name}`} tooltip="Folder actions"
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleActions();
            }}
            className={`p-1 rounded-md transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30 ${
              showActions
                ? 'opacity-100 pointer-events-auto bg-brand-blue/10 text-brand-blue'
                : 'opacity-100 text-gray-500 hover:bg-brand-blue/10 hover:text-brand-blue sm:pointer-events-none sm:opacity-0 sm:group-hover/card:pointer-events-auto sm:group-hover/card:opacity-100 sm:group-focus-within/card:pointer-events-auto sm:group-focus-within/card:opacity-100'
            }`}
            aria-haspopup="menu"
            aria-expanded={showActions}
          >
            <Plus className="w-4 h-4" />
          </IconButton>
          )}

          {!hideActions && showActions && (
            <div
              role="menu"
              className={`absolute right-0 w-52 max-w-[calc(100vw-1.5rem)] max-h-[70dvh] overflow-y-auto rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-1 shadow-xl shadow-brand-blue/10 ring-1 ring-black/[0.02] z-50 ${
                actionsDropUp ? 'bottom-full mb-1' : 'top-full mt-1'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                role="menuitem"
                disabled={!onUploadToFolder}
                aria-disabled={!canUpload}
                onClick={(e) => runFolderAction(e, () => onUploadToFolder?.(folder.id), !canUpload || !onUploadToFolder)}
                title={!canUpload ? 'You do not have permission to upload resumes' : undefined}
                className="group w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-600 disabled:hover:bg-white dark:disabled:hover:bg-transparent aria-disabled:text-gray-400 dark:aria-disabled:text-slate-600 aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-disabled:hover:bg-white dark:aria-disabled:hover:bg-transparent transition-colors"
              >
                <Upload className={`w-4 h-4 ${canUpload && onUploadToFolder ? 'text-menu-icon-download' : ''}`} />
                <span className={MENU_ITEM_SCALE_CLASS}>Upload to Folder</span>
              </button>
              <button
                type="button"
                role="menuitem"
                // canCreateSubfolder = upload permission AND folder depth: no
                // permission greys it with the permission hover (aria-disabled);
                // max depth stays the native disabled "(max)" state.
                disabled={(canUpload && !canCreateSubfolder) || !onCreateSubfolder}
                aria-disabled={!canUpload}
                onClick={(e) => runFolderAction(e, () => onCreateSubfolder?.(folder.id), !canCreateSubfolder || !onCreateSubfolder)}
                title={!canUpload ? 'You do not have permission to create folders' : !canCreateSubfolder ? `Maximum folder depth reached (${MAX_FOLDER_DEPTH} levels)` : undefined}
                className="group w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-600 disabled:hover:bg-white dark:disabled:hover:bg-transparent aria-disabled:text-gray-400 dark:aria-disabled:text-slate-600 aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-disabled:hover:bg-white dark:aria-disabled:hover:bg-transparent transition-colors"
              >
                <Plus className={`w-4 h-4 ${canCreateSubfolder && onCreateSubfolder ? 'text-menu-icon-secondary' : ''}`} />
                <span className={MENU_ITEM_SCALE_CLASS}>Create Subfolder</span>
                {canUpload && !canCreateSubfolder && <span className="ml-auto tf-hint">(max)</span>}
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!onStartRename}
                aria-disabled={!canRename}
                onClick={(e) => runFolderAction(e, () => onStartRename?.(folder), !canRename || !onStartRename)}
                title={!canRename ? 'You do not have permission to rename folders' : undefined}
                className="group w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-600 disabled:hover:bg-white dark:disabled:hover:bg-transparent aria-disabled:text-gray-400 dark:aria-disabled:text-slate-600 aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-disabled:hover:bg-white dark:aria-disabled:hover:bg-transparent transition-colors"
              >
                <Edit2 className={`w-4 h-4 ${canRename && onStartRename ? 'text-menu-icon-edit' : ''}`} />
                <span className={MENU_ITEM_SCALE_CLASS}>Rename Folder</span>
              </button>
              <div className="my-1 border-t border-gray-100 dark:border-slate-700" />
              <button
                type="button"
                role="menuitem"
                disabled={!onDeleteFolder}
                aria-disabled={!canDelete}
                onClick={(e) => runFolderAction(e, () => onDeleteFolder?.(folder.id), !canDelete || !onDeleteFolder)}
                title={!canDelete ? 'You do not have permission to delete folders' : undefined}
                className="group w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:text-gray-400 dark:disabled:text-slate-600 disabled:hover:bg-white dark:disabled:hover:bg-transparent aria-disabled:text-gray-400 dark:aria-disabled:text-slate-600 aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-disabled:hover:bg-white dark:aria-disabled:hover:bg-transparent transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span className={MENU_ITEM_SCALE_CLASS}>Delete Folder</span>
              </button>
            </div>
          )}
        </div>

        {hasSubfolders && (
          <IconButton bare label={showSubfolders ? `Hide subfolders of ${folder.name}` : `Show subfolders of ${folder.name}`} tooltip={showSubfolders ? 'Hide subfolders' : 'Show subfolders'}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleSubfolders();
            }}
            aria-expanded={showSubfolders}
            className={`p-1 rounded-md transition-colors flex-shrink-0 cursor-pointer ${
              showSubfolders
                ? 'bg-brand-blue/10 text-brand-blue'
                : 'text-gray-500 hover:bg-brand-blue/10 hover:text-brand-blue'
            }`}
          >
            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ease-in-out ${showSubfolders ? 'rotate-180' : ''}`} />
          </IconButton>
        )}
        {/* One chevron per card: a folder with subfolders shows the peek
            toggle, everything else keeps the plain navigate arrow. Showing
            both read as two competing affordances. */}
        {!hasSubfolders && <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />}
      </div>

      {hasSubfolders && showSubfolders && (
        // Anchored to the card and floating over whatever follows, so the grid
        // never reflows. Capped at ~5 rows, then it scrolls;
        // `overscroll-contain` keeps that scroll from chaining to the page.
        <div
          className={`absolute left-0 right-0 z-40 rounded-xl border border-gray-200 bg-white shadow-lg shadow-brand-blue/10 overflow-y-auto overscroll-contain ${
            dropUp ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
          style={{ maxHeight: `${SUBFOLDER_PEEK_MAX_HEIGHT}px` }}
        >
          {subfolders.map((child) => {
            const childSubfolders = child.children?.length ?? 0;
            return (
              <button
                key={child.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate(child.id);
                }}
                // Hovering a row with its own subfolders opens the third level
                // beside this panel — one more step visible without navigating.
                onMouseEnter={() => setPeekChild(childSubfolders > 0 ? child : null)}
                onFocus={() => setPeekChild(childSubfolders > 0 ? child : null)}
                title={`Open ${child.name}`}
                /* The row the pointer is on is the one the third-level flyout
                   belongs to, so it carries a real highlight — tint, brand
                   text and a left accent bar — rather than the barely-there
                   5% wash it had. The transparent accent on idle rows keeps
                   the labels from shifting as the highlight moves. */
                className={`w-full flex items-center gap-2 px-3 py-2 text-left border-b border-gray-100 last:border-b-0 border-l-2 transition-colors cursor-pointer ${
                  peekChild?.id === child.id
                    ? 'bg-brand-blue/10 border-l-brand-blue'
                    : 'border-l-transparent hover:bg-brand-blue/10 hover:border-l-brand-blue/40'
                }`}
              >
                <span aria-hidden="true" className="text-muted-foreground dark:text-gray-300 text-xs leading-none">└</span>
                <Folder className={`w-3.5 h-3.5 flex-shrink-0 ${
                  peekChild?.id === child.id ? 'text-brand-blue' : 'text-brand-orange'
                }`} />
                <span className={`flex-1 min-w-0 truncate text-xs ${
                  peekChild?.id === child.id ? 'font-medium text-brand-blue' : 'text-gray-700'
                }`}>{child.name}</span>
                <span className="tf-micro-hint flex-shrink-0">
                  {childSubfolders > 0 && `${childSubfolders} sub • `}
                  {child.count || 0}
                </span>
                <ChevronRight className={`w-3.5 h-3.5 flex-shrink-0 ${
                  childSubfolders > 0 ? 'text-brand-blue' : 'text-gray-500'
                }`} />
              </button>
            );
          })}
        </div>
      )}

      {/* Third level. Sits beside the subfolder list, top-aligned with it, and
          at z-50 so it clears the list (z-40) it overlaps. No gap between the
          two: a margin here would let the pointer cross dead space on its way
          over, closing the flyout before it arrived. */}
      {hasSubfolders && showSubfolders && peekChild && (
        <div
          className={`absolute z-50 max-w-[calc(100vw-1.5rem)] rounded-xl border border-gray-200 bg-white shadow-xl shadow-brand-blue/10 overflow-y-auto overscroll-contain ${
            dropUp ? 'bottom-full mb-1' : 'top-full mt-1'
          } ${peekOnLeft ? 'right-full' : 'left-full'}`}
          style={{ width: `${SUBFOLDER_PEEK_PANEL_WIDTH}px`, maxHeight: `${SUBFOLDER_PEEK_MAX_HEIGHT}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 tf-micro-hint bg-slate-50 border-b border-gray-100 truncate">
            {peekChild.name}
          </div>
          {(peekChild.children ?? []).map((grandChild) => (
            <button
              key={grandChild.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNavigate(grandChild.id);
              }}
              title={`Open ${grandChild.name}`}
              // Same highlight as the level above it, so the two panels read
              // as one list.
              className="w-full flex items-center gap-2 px-3 py-2 text-left border-b border-gray-100 last:border-b-0 border-l-2 border-l-transparent hover:bg-brand-blue/10 hover:border-l-brand-blue/40 transition-colors cursor-pointer"
            >
              <Folder className="w-3.5 h-3.5 text-brand-orange flex-shrink-0" />
              <span className="flex-1 min-w-0 truncate tf-meta">{grandChild.name}</span>
              <span className="tf-micro-hint flex-shrink-0">{grandChild.count || 0}</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Inline name field for creating a folder from the card view.
 *
 * Mirrors the folder tree's create input — same cap, same Enter to submit /
 * Esc to cancel — so the two entry points behave identically. Sized to a card
 * column rather than full width so it reads as "a folder will appear here".
 */
function CardFolderNameInput({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder,
  submitLabel = 'Create',
  inline = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  placeholder: string;
  submitLabel?: string;
  inline?: boolean;
}) {
  if (inline) {
    return (
      <div className="absolute right-0 top-full z-40 mt-2 w-full max-w-[min(36rem,calc(100vw-1.5rem))]">
      <div className="flex flex-col gap-2 rounded-lg border border-brand-blue/20 bg-white p-2 shadow-xl shadow-brand-blue/10 ring-1 ring-black/[0.02] sm:flex-row sm:items-center">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit();
            if (e.key === 'Escape') onCancel();
          }}
          placeholder={placeholder}
          maxLength={FOLDER_NAME_MAX_LENGTH}
          autoFocus
          className="min-w-0 flex-1 rounded-md border border-brand-blue px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40"
        />
        <div className="flex items-center gap-2">
          <span className="tf-hint">{value.length}/{FOLDER_NAME_MAX_LENGTH}</span>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!value.trim()}
            className="tf-btn tf-btn-primary rounded bg-brand-blue px-3 py-1.5 text-xs shadow-sm shadow-brand-blue/20 ring-1 ring-white/10 hover:bg-brand-blue-2 disabled:bg-gray-300 whitespace-normal gap-0 font-normal"
          >
            {submitLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-brand-blue/30 px-3 py-1.5 text-xs text-brand-blue hover:bg-brand-blue/5 hover:text-brand-blue-2"
          >
            Cancel
          </button>
        </div>
      </div>
      </div>
    );
  }

  return (
    <div className="mb-3 sm:mb-4 max-w-sm">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit();
          if (e.key === 'Escape') onCancel();
        }}
        placeholder={placeholder}
        maxLength={FOLDER_NAME_MAX_LENGTH}
        autoFocus
        className="w-full px-3 py-1.5 text-sm border border-brand-blue rounded-md focus:outline-none focus:ring-2 focus:ring-brand-blue/40"
      />
      <div className="flex items-center gap-2 mt-2">
        <button
          type="button"
          onClick={onSubmit}
          disabled={!value.trim()}
          className="tf-btn tf-btn-primary px-3 py-1 text-xs bg-brand-blue rounded hover:bg-brand-blue-2 disabled:bg-gray-300 whitespace-normal shadow-none gap-0 font-normal"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1 text-xs border border-brand-blue/30 rounded hover:bg-brand-blue/5 text-brand-blue hover:text-brand-blue-2 cursor-pointer"
        >
          Cancel
        </button>
        <span className="tf-hint ml-auto">{value.length}/{FOLDER_NAME_MAX_LENGTH}</span>
      </div>
    </div>
  );
}


/**
 * The "My Resumes" tab of the Resume Database page — this user's own uploads,
 * organised into folders. Rendered by the tabbed shell at
 * app/(dashboard)/recruitment/resume-database/page.tsx, which owns the
 * breadcrumb and the tab strip and passes them down as `header` so they sit
 * inside this view's white card (and stay put while the list loads).
 */
export default function MyResumesView({ header }: { header?: ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isTenantAdmin, hasPermission, hasPermissionCode, isLoading: authLoading } = useAuth();
  const canViewMyResumes = isTenantAdmin || hasPermissionCode('my_resumes:read');
  const canUploadMyResumes = isTenantAdmin || hasPermissionCode('my_resumes:upload') || hasPermissionCode('my_resumes:create');
  // my_resumes:update isn't a role-editor code; Resume Upload Access (my_resumes:upload)
  // covers folder rename / move too (2026-11-10).
  const canUpdateMyResumes = isTenantAdmin || hasPermissionCode('my_resumes:update') || hasPermissionCode('my_resumes:upload');
  const canDeleteMyResumes = canDeleteResumes(isTenantAdmin);
  const canArchiveMyResumes = isTenantAdmin || hasPermissionCode('my_resumes:archive');
  const canShareMyResumes = isTenantAdmin || hasPermissionCode('my_resumes:share');
  // Viewing isn't downloading (2026-11-10): own uploads need Resume Upload access.
  const canDownloadMyResumes = canDownloadResume({ isTenantAdmin, hasPermissionCode, own: true });
  const canMoveMyResumes = isTenantAdmin || hasPermissionCode('my_resumes:update') || hasPermissionCode('my_resumes:upload') || hasPermissionCode('my_resumes:create');
  const { hasPlanFeature } = usePlanFeatures();
  // Plan-gated actions stay visible but disabled (hover: PLAN_LOCKED_MESSAGE),
  // never hidden — see usePlanLock.
  const { isPlanLocked } = usePlanLock();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [folders, setFolders] = useState<FolderType[]>([]);
  // Shared with the Shared Database tab (see ResumeSelectionContext); the row
  // cache lets bulk actions read ticked resumes that are not on screen.
  const { selectedResumes, setSelectedResumes, rowById, selectedRows } = useResumeSelection(resumes);
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  // The folder id the currently-rendered `resumes` actually belong to. Set in
  // lockstep with setResumes in fetchData — unlike `selectedFolder`, which
  // flips the instant a folder is clicked, this only moves once the rows on
  // screen really are that folder's. Reading `selectedFolder` directly for
  // "is this the Archived Resumes folder" let the Archived badge flash on the
  // previous folder's rows during the silent refetch gap (list view only —
  // card view already clears `resumes` synchronously in navigateToFolder).
  const [loadedFolderId, setLoadedFolderId] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  // Search + filters in the shared hook, the same one every list toolbar uses.
  // `appliedQuery` is the settled value: it drives the fetch and the result
  // highlighting, so highlights always match the rows on screen.
  const search = useListSearch<Record<string, unknown>>({
    initialFilters: {},
    onChange: () => setCurrentPage(1),
  });
  const searchQuery = search.query;
  const appliedSearchQuery = search.appliedQuery;
  const filters = search.filters;
  const [sortBy, setSortBy] = useState('date');
  const [versionFilter, setVersionFilter] = useState<ResumeVersionFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [totalIncludingVersions, setTotalIncludingVersions] = useState<number | undefined>(undefined);
  const [totalPages, setTotalPages] = useState(1);
  const [isPaginating, setIsPaginating] = useState(false);
  const [folderTreeWidth, setFolderTreeWidth] = useState(240);
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const [cardViewFolder, setCardViewFolder] = useState<string | null>(null); // Selected folder in card view
  const [breadcrumbPath, setBreadcrumbPath] = useState<{ id: string; name: string }[]>([]); // Breadcrumb navigation path
  // Inline folder creation in card view — the tree panel isn't on screen here,
  // so the grid needs its own entry point. Holds the target parent (null = a
  // top-level folder) rather than a boolean, so the same input serves both the
  // root grid and the "Subfolders" grid inside a folder.
  const [cardFolderParentId, setCardFolderParentId] = useState<string | null | undefined>(undefined);
  const [cardNewFolderName, setCardNewFolderName] = useState('');
  const [cardRenamingFolderId, setCardRenamingFolderId] = useState<string | null>(null);
  const [cardRenameValue, setCardRenameValue] = useState('');
  const [cardFolderFilter, setCardFolderFilter] = useState<CardFolderFilter>('all');

  // Modal states
  const [quickViewResume, setQuickViewResume] = useState<Resume | null>(null);

  const [allResumesTotal, setAllResumesTotal] = useState(0);
  // Header badge: the library's own count (falls back to the list's until the first unfiltered load).
  const libraryResumeTotal = allResumesTotal || totalItems;
  // Mirror of the above that overlapping fetches can read without going through
  // a stale render closure — see the `isUnfiltered` block in fetchData.
  const allResumesTotalRef = useRef(0);

  // Apply to Job modal state
  const [isApplyToJobModalOpen, setIsApplyToJobModalOpen] = useState(false);
  const [publishedJobs, setPublishedJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [uploadedResumeToScore, setUploadedResumeToScore] = useState<{ id: string; candidateName: string } | null>(null);
  const [singleResumeToApply, setSingleResumeToApply] = useState<Resume | null>(null);

  /* The picked job, shown back as a summary (scored / skipped / units) before
     scoring starts. */
  const [scoringRequest, setScoringRequest] = useState<ScoringStartRequest | null>(null);

  // ZIP download confirmation modal state
  const [isZipDownloadModalOpen, setIsZipDownloadModalOpen] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);

  // Archive confirmation modal state (bulk archive only — per-row archive stays instant)
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [isArchivingResumes, setIsArchivingResumes] = useState(false);

  // Invite Assessment / Invite AI Interview both open the one shared invite
  // popup (VersionInviteDialog); it asks for the assessment / interview itself.
  const { open: openInvite } = useInviteDialog();
  // Score Resume's progress popup, on this page (Minimize keeps the recruiter here).
  const { startScoringProgress, scoringProgressModal } = useInPageScoringProgress('My Resumes');



  // Delete resume confirmation state
  const [deleteResumeConfirm, setDeleteResumeConfirm] = useState<{
    isOpen: boolean;
    ids: string[];
    names: string[];
  }>({ isOpen: false, ids: [], names: [] });

  // Delete folder confirmation state
  const [deleteFolderConfirm, setDeleteFolderConfirm] = useState<{
    isOpen: boolean;
    folderId: string | null;
    folderName: string;
    resumeCount: number;
    parentFolderId: string | null;
    parentFolderName: string;
    contentAction: 'move-parent' | 'move-root' | 'delete-all' | null;
    hasSubfolders: boolean;
    subfolderCount: number;
    subfolderDetails: { id: string; name: string; resume_count: number }[];
    totalResumeCount: number;
    subfolderResumeCount: number;
    loading: boolean;
  }>({ isOpen: false, folderId: null, folderName: '', resumeCount: 0, parentFolderId: null, parentFolderName: '', contentAction: null, hasSubfolders: false, subfolderCount: 0, subfolderDetails: [], totalResumeCount: 0, subfolderResumeCount: 0, loading: false });

  // Refs to prevent infinite loop and duplicate API calls
  const hasMountedRef = useRef(false);
  const lastFetchParamsRef = useRef<string>('');
  // Last search text a fetch went out with — lets the refetch effect tell a
  // keystroke (worth debouncing) from a folder/sort/page click (not).
  const lastFetchedQueryRef = useRef<string>('');
  const isFetchingRef = useRef(false);
  // A fetch that arrived while another was in flight, replayed once it ends.
  const pendingFetchRef = useRef<{
    searchTerm?: string;
    currentFilters?: any;
    folderId?: string;
    silent?: boolean;
    dedupe?: boolean;
    resolve?: () => void;
  } | null>(null);
  // Request params (JSON of the list request) of the last fetch that completed
  // successfully. Cleared when a fetch starts, so it never describes data that
  // a later fetch may have replaced. Read by the guard replay below.
  const lastCompletedFetchKeyRef = useRef<string>('');
  // Until when the landing's stats reads may reuse a 30 s-old answer.
  const mountReuseUntilRef = useRef(0);
  // Always the newest fetchData. The replay has to go through this rather than
  // calling itself: page/sort live in the closure, not the arguments, so a
  // self-call would refetch with the page the *outgoing* render had.
  const fetchDataRef = useRef<
    ((searchTerm?: string, currentFilters?: any, folderId?: string, silent?: boolean, opts?: FetchDataOptions) => Promise<void>) | null
  >(null);

  // Persist + restore this list's scroll position and view state so returning
  // from a resume detail page (router.push -> remount) lands the user exactly
  // where they left off. Re-detect the scroll container when the list<->card
  // view toggles, since that changes the page height drastically.
  const rootRef = useScrollRestoration<HTMLElement>('my-resumes', !loading, [viewMode]);
  useListStatePersistence(
    'my-resumes',
    {
      searchQuery,
      appliedSearchQuery,
      selectedFolder,
      filters,
      sortBy,
      currentPage,
      itemsPerPage,
      viewMode,
      cardViewFolder,
      breadcrumbPath,
    },
    (s) => {
      if (typeof s.searchQuery === 'string') search.setQuery(s.searchQuery);
      if (typeof s.selectedFolder === 'string') setSelectedFolder(s.selectedFolder);
      if (s.filters && typeof s.filters === 'object' && !Array.isArray(s.filters)) {
        search.setFilters(s.filters as typeof filters);
      }
      if (typeof s.sortBy === 'string') setSortBy(s.sortBy);
      if (typeof s.currentPage === 'number') setCurrentPage(s.currentPage);
      if (typeof s.itemsPerPage === 'number') setItemsPerPage(s.itemsPerPage);
      if (s.viewMode === 'list' || s.viewMode === 'card') setViewMode(s.viewMode);
      if (s.cardViewFolder === null || typeof s.cardViewFolder === 'string') {
        setCardViewFolder(s.cardViewFolder as string | null);
      }
      if (Array.isArray(s.breadcrumbPath)) {
        setBreadcrumbPath(s.breadcrumbPath as { id: string; name: string }[]);
      }
    },
  );

  useEffect(() => {
    mountReuseUntilRef.current = Date.now() + MOUNT_REUSE_WINDOW_MS;
    fetchData(undefined, undefined, undefined, false, { reuse: true });
    // Upload history is fetched by the `user?.id` effect below, which also
    // runs on mount whenever the user is already known — calling it here too
    // sent `upload/batches` twice on every visit.
    // Self-heal admin-API resume usage on mount (fire-and-forget — capped at
    // ±200). Throttled inside the service to once per 15 minutes per session.
    resumeService.reconcileUsage();
    hasMountedRef.current = true; // Mark as mounted

  }, []);


  // Refetch when filters or folder selection changes
  useEffect(() => {
    // Skip the very first render (fetchData is already called in mount effect above)
    if (!hasMountedRef.current) {
      console.log('[MyResumes] useEffect - Skipping (not mounted yet)');
      return;
    }

    // Create signature of params to detect ACTUAL changes (not just reference changes)
    const currentParams = JSON.stringify({ appliedSearchQuery, filters, selectedFolder, currentPage, itemsPerPage, sortBy, versionFilter });

    // Skip if params haven't actually changed (prevents loop from object reference changes)
    if (currentParams === lastFetchParamsRef.current) {
      console.log('[MyResumes] useEffect - Skipping (params unchanged)', currentParams);
      return;
    }

    /* Typing is the only thing worth debouncing. A folder click, a sort or a
       page change is a single deliberate action, and waiting 300ms on it just
       leaves the previous folder's rows sitting under the new folder's
       heading. */
    const isQueryChange = appliedSearchQuery !== lastFetchedQueryRef.current;
    lastFetchedQueryRef.current = appliedSearchQuery;
    const delay = isQueryChange ? 300 : 0;

    /* And cover the gap with the same overlay pagination uses — the fetch is
       silent (rows stay put so the table doesn't collapse), so without this
       the old rows read as the new folder's contents until the response
       lands. That is the flicker when clicking between folders. */
    setIsPaginating(true);

    console.log('[MyResumes] useEffect - Will fetch in', delay, 'ms', {
      appliedSearchQuery,
      filtersKeys: Object.keys(filters),
      selectedFolder,
      currentPage,
      itemsPerPage,
      sortBy,
    });

    const debounceTimer = setTimeout(() => {
      console.log('[MyResumes] useEffect - Fetching data now...');
      lastFetchParamsRef.current = currentParams;

      // Use lighter loading for page/sort changes when data is already on screen
      const isPageChange = resumes.length > 0;
      // `dedupe`: if this call has to wait behind a running fetch, its replay
      // is skipped when it would request exactly what that fetch just loaded
      // (the state-restore path on a refresh). Write-triggered refetches don't
      // pass it, so they always run.
      fetchData(appliedSearchQuery, filters, selectedFolder, isPageChange ? true : false, { dedupe: true }).finally(() => {
        setIsPaginating(false);
        console.log('[MyResumes] useEffect - Fetch complete');
      });
    }, delay);

    return () => {
      console.log('[MyResumes] useEffect - Cleanup (timer cleared)');
      clearTimeout(debounceTimer);
    };
  }, [appliedSearchQuery, filters, selectedFolder, currentPage, itemsPerPage, sortBy, versionFilter]);

  // Handle deep link from notifications
  useEffect(() => {
    const resumeIdFromUrl = searchParams.get('resume_id');
    const batchIdFromUrl = searchParams.get('batch_id');

    if (resumeIdFromUrl) {
      // Open specific resume in quick view
      const openResume = async () => {
        try {
          const resume = await resumeService.getById(resumeIdFromUrl);
          if (resume) {
            setQuickViewResume(resume as unknown as Resume);
          }
          // Clear the query parameter
          router.replace('/recruitment/resume-database?tab=my-resumes', { scroll: false });
        } catch (error) {
          console.error('Error fetching resume from URL:', error);
          showErrorToast(error, "Couldn't open the requested resume", { id: `resume-${resumeIdFromUrl}-open`, retry: openResume });
        }
      };
      openResume();
    }

    if (batchIdFromUrl) {
      // Show upload history filtered by batch
      openUploadHistoryModal();
      // Clear the query parameter
      router.replace('/recruitment/resume-database?tab=my-resumes', { scroll: false });
    }
  }, [searchParams, router]);


  /* The "All Resumes" badge is the only count not served by the folders API,
     so a refresh that stays inside a folder can't update it. One page_size=1
     request gets the exact number without disturbing the current view — used
     after uploads, which is when the badge would otherwise lag or flicker
     between the folder total and the global one. */
  /* One GET /resumes/stats for My Resumes: the All Resumes total (active only)
     and every folder's listing total (archived rows included, as a folder
     listing includes them). Unfiltered — the badges describe the library. */
  const fetchMyResumeStats = () =>
    resumeService.stats(
      { source: 'my-resumes', include_archived: false },
      // The landing's own reads (prefetch + first folder reconcile) may reuse;
      // later ones (after uploads finish processing) always ask the server.
      { reuseRecent: Date.now() < mountReuseUntilRef.current },
    );

  const refreshAllResumesTotal = async () => {
    try {
      // Same rule as the All Resumes listing: active resumes only, so the badge
      // and the table can never disagree about archived ones.
      // GET /resumes/stats — same params as the folder reconcile below, so the
      // api client's GET sharing serves both from one request.
      const stats = await fetchMyResumeStats();
      const total = stats.all_total;
      if (typeof total !== 'number') return;
      allResumesTotalRef.current = total;
      setAllResumesTotal(total);
      setFolders(prev => prev.map(f => (f.id === 'all' ? { ...f, count: total } : f)));
    } catch {
      // Keep the last known figure rather than flashing a wrong one.
    }
  };

  /* Bring every folder badge in line with what opening that folder lists,
     from GET /resumes/stats (built from the same filter as the table's
     list). The folders API counts stored rows — versions included — so its
     numbers can read higher than the list ever shows.

     One request for the whole tree, only from the plain unfiltered view
     (page load and post-upload refreshes). */
  const reconcilingFoldersRef = useRef(false);
  const lastReconciledRef = useRef('');
  /* The newest folder snapshot a fetch put on screen: its signature (ids +
     raw server counts) and, when it came from the unfiltered view, the raw
     tree to reconcile. The reconcile pass runs in the background (never
     awaited by a fetch), so a refetch can land while it is in flight; when
     the snapshot it measured is no longer the newest, its results are
     dropped and the pass re-runs against the newest one. */
  const latestFolderSnapshotRef = useRef<{ signature: string; reconcileTarget: FolderType[] | null }>({
    signature: '',
    reconcileTarget: null,
  });
  const folderSnapshotSignature = (folderList: FolderType[]) =>
    JSON.stringify(flattenAllFolders(folderList).filter(f => f.id !== 'all').map(f => [f.id, f.count]));

  /* Corrections have to outlive the fetch that produced them. Every fetch
     rebuilds the tree from the API, which reinstalls the raw count — so a
     folder corrected to 1 rendered as 2 again on the next refresh, and the
     reconcile pass skipped (it had already seen that identical server
     snapshot) leaving it there. That is the 1 → 2 flicker.

     Each entry records the server count it was derived from, so the
     correction is reused only while the server still says the same thing.
     The moment the real count moves — an upload, a move, a delete — the entry
     stops matching, the raw number shows, and the reconcile re-runs against
     the new snapshot. */
  const correctedCountsRef = useRef<Map<string, { server: number; corrected: number }>>(new Map());

  const rememberCorrection = (id: string, server: number, corrected: number) => {
    if (corrected === server) correctedCountsRef.current.delete(id);
    else correctedCountsRef.current.set(id, { server, corrected });
  };

  const applyCachedCorrections = (list: FolderType[]): FolderType[] =>
    list.map(f => {
      const cached = correctedCountsRef.current.get(f.id);
      return {
        ...f,
        count: cached && cached.server === f.count ? cached.corrected : f.count,
        children: f.children ? applyCachedCorrections(f.children) : f.children,
      };
    });

  const reconcileFolderCounts = async (folderList: FolderType[]) => {
    if (reconcilingFoldersRef.current) return;
    const flat = flattenAllFolders(folderList).filter(f => f.id !== 'all');
    // One stats call covers any number of folders, so no size cap any more.
    if (flat.length === 0) return;

    // The server's numbers are the input to this correction, so re-running it
    // on an identical snapshot can only produce the same answer. Without this,
    // every page change on the unfiltered view refired the whole fan-out.
    const signature = JSON.stringify(flat.map(f => [f.id, f.count]));
    if (signature === lastReconciledRef.current) return;
    lastReconciledRef.current = signature;

    reconcilingFoldersRef.current = true;
    let superseded = false;
    try {
      /* ONE GET /resumes/stats call for every folder (was one page_size=1
         list per folder). Its per-folder numbers are exactly what
         GET /resumes?source=my-resumes&folder_id=<id> returns as `total` —
         archived rows included, as Archived Resumes lists them. A folder the
         server has no rows for is 0. On failure nothing is corrected. */
      let folderTotals: Record<string, number> | null = null;
      try {
        folderTotals = (await fetchMyResumeStats()).folders ?? {};
      } catch {
        folderTotals = null;
      }
      const totals = flat.map(
        (folder) => [folder.id, folderTotals ? (folderTotals[folder.id] ?? 0) : null] as const,
      );

      // A newer fetch replaced the folder snapshot while these were in
      // flight (an upload, move, delete, or a filtered folder list). These
      // totals describe the old one, so drop them; `finally` re-runs the pass
      // for the newest snapshot.
      if (latestFolderSnapshotRef.current.signature !== signature) {
        superseded = true;
        return;
      }

      const byId = new Map(
        totals.filter((entry): entry is readonly [string, number] => entry[1] !== null),
      );
      if (byId.size === 0) return;

      /* Downward only. A folder's listing coming back larger than its stored
         count means the query reached past this folder, and a badge must never
         claim more than the folder holds. Recorded against the server count
         these were measured from, so later fetches can reuse them. */
      flat.forEach(f => {
        const listTotal = byId.get(f.id);
        if (listTotal === undefined) return;
        rememberCorrection(f.id, f.count, Math.min(f.count, listTotal));
      });

      // Functional update: a fetch may have replaced `folders` while these
      // requests were in flight.
      setFolders(prev => applyCachedCorrections(prev));
    } finally {
      reconcilingFoldersRef.current = false;
      if (superseded) {
        // Let the newest snapshot be measured even if it repeats an older
        // signature, then run it (only if it came from the unfiltered view).
        lastReconciledRef.current = '';
        const target = latestFolderSnapshotRef.current.reconcileTarget;
        if (target) reconcileFolderCounts(target);
      }
    }
  };

  const fetchData = async (searchTerm?: string, currentFilters?: any, folderId?: string, silent?: boolean, opts?: FetchDataOptions) => {
    console.log('[FETCH] fetchData called', {
      searchTerm,
      filtersKeys: currentFilters ? Object.keys(currentFilters) : 'none',
      folderId,
      isFetching: isFetchingRef.current,
      silent,
    });

    /* Prevent concurrent fetches — but queue the losing call instead of
       dropping it. On a browser refresh the mount fetch (defaults) and the
       restored-state fetch (saved folder/page/filters) land within ~300ms of
       each other; dropping the second left the table showing something the
       restored controls didn't describe, and `lastFetchParamsRef` had already
       recorded it as done, so nothing ever re-ran it. */
    if (isFetchingRef.current) {
      console.log('[FETCH] Already fetching, queueing this call');
      // Resolve as a displaced entry rather than hanging: whoever awaited it
      // (the refetch effect, to drop its overlay) must not wait forever.
      const displaced = pendingFetchRef.current;
      displaced?.resolve?.();
      /* The replay may only be skipped when every call it stands for allowed
         that — a displaced write-triggered refetch keeps it from being skipped. */
      const dedupe = !!opts?.dedupe && (displaced ? !!displaced.dedupe : true);
      /* Returns a promise that settles when the REPLAY finishes, not now —
         callers use it to decide when the table has really caught up. */
      return new Promise<void>(resolve => {
        pendingFetchRef.current = { searchTerm, currentFilters, folderId, silent, dedupe, resolve };
      });
    }

    isFetchingRef.current = true;
    if (!silent) setLoading(true);
    console.log('[FETCH] Starting fetch...');
    try {
      // Build search params for backend API
      const sortByMap: Record<string, string> = {
        'date': 'date-desc',
        'latest': 'date-desc',
        'oldest': 'date-asc',
        'name-asc': 'name-asc',
        'name-desc': 'name-desc',
        'experience-high': 'experience-desc',
        'experience-low': 'experience-asc',
      };

      // Everything a plain "show me my resumes" request carries. Any key beyond
      // these means the response total describes a narrowed view, not the
      // user's whole library.
      const BASE_SEARCH_PARAM_KEYS = ['source', 'page', 'page_size', 'sort_by', 'include_archived'];

      const searchParams: any = {
        source: 'my-resumes',
        page: currentPage,
        page_size: itemsPerPage,
        sort_by: sortByMap[sortBy] || 'date-desc',
        /* All Resumes means every ACTIVE resume the user has — whatever folder
           it sits in, root included — and never an archived one. Archiving
           moves the resume into the Archived Resumes folder as well as setting
           the flag, so asking for archived rows only makes sense once a folder
           is named; that is how the Archived Resumes folder still lists its
           contents. Sent explicitly rather than left to the server's default,
           which was returning archived rows in the unfiltered view. */
        include_archived: !!(folderId && folderId !== 'all'),
      };

      // Add folder filter if not viewing all.
      if (folderId && folderId !== 'all') {
        searchParams.folder_id = folderId;
      }

      // Add search query
      if (searchTerm && searchTerm.trim()) {
        searchParams.search = searchTerm.trim();
      }

      // Add filter parameters
      if (currentFilters) {
        if (currentFilters.skills && currentFilters.skills.length > 0) {
          searchParams.skills = currentFilters.skills.join(',');
        }
        if (currentFilters.experienceRange) {
          if (currentFilters.experienceRange.min !== undefined) {
            searchParams.experience_min = currentFilters.experienceRange.min;
          }
          if (currentFilters.experienceRange.max !== undefined) {
            searchParams.experience_max = currentFilters.experienceRange.max;
          }
        }
        if (currentFilters.location) {
          searchParams.location = currentFilters.location;
        }
        if (currentFilters.education) {
          searchParams.education = currentFilters.education;
        }
        if (currentFilters.currentCompany) {
          searchParams.current_company = currentFilters.currentCompany;
        }
        if (currentFilters.noticePeriod) {
          searchParams.notice_period = currentFilters.noticePeriod;
        }
        if (currentFilters.uploadDateRange?.start) {
          searchParams.upload_date_from = currentFilters.uploadDateRange.start;
        }
        if (currentFilters.uploadDateRange?.end) {
          searchParams.upload_date_to = currentFilters.uploadDateRange.end;
        }
        if (currentFilters.uploadedBy) {
          searchParams.uploaded_by_name = currentFilters.uploadedBy;
        }
        if (currentFilters.sourceType) {
          searchParams.source_type = currentFilters.sourceType;
        }
      }

      /* Guard replay of a param-effect call (see `dedupe` above): skip it when
         it asks for exactly what the fetch that just finished loaded. On a
         refresh the restored view usually equals the mount fetch's defaults,
         and this replay was a second identical list + folders round trip. */
      const fetchKey = JSON.stringify({ ...searchParams, versionFilter });
      if (opts?.replay && opts.dedupe && fetchKey === lastCompletedFetchKeyRef.current) {
        console.log('[FETCH] Replay matches the last completed fetch, skipping');
        return;
      }
      lastCompletedFetchKeyRef.current = '';

      /* Versions filter: every matching row, filtered on `version_count`, then
         this page sliced out — totals describe the filtered set. */
      const listResumes = async () => {
        if (versionFilter === 'all') return resumeService.list(searchParams, { reuseRecent: !!opts?.reuse });
        const all = await fetchAllRows((page_size, page) => resumeService.list({ ...searchParams, page, page_size }));
        const kept = keepByVersion(all.items || [], versionFilter);
        const start = (currentPage - 1) * itemsPerPage;
        return {
          ...all,
          items: kept.slice(start, start + itemsPerPage),
          total: kept.length,
          total_pages: Math.max(1, Math.ceil(kept.length / itemsPerPage)),
          total_including_versions: all.total_including_versions,
        };
      };

      /* Landing: the folder-badge reconcile below needs GET /resumes/stats,
         and used to ask for it only after the list + folders came back — a
         second round trip on every open. Start it now, beside them (not
         awaited); reconcileFolderCounts' own call then picks up this response
         through the api client's GET sharing. Only before the first reconcile:
         later fetches on an unchanged tree skip the reconcile anyway. */
      if (
        !lastReconciledRef.current
        && versionFilter === 'all'
        && Object.keys(searchParams).every(key => BASE_SEARCH_PARAM_KEYS.includes(key))
      ) {
        fetchMyResumeStats().catch(() => {});
      }

      const [resumeResponse, folderResponse] = await Promise.all([
        listResumes(),
        // Same Uploaded By value the resume list was just sent — so a
        // folder's badge always matches what opening that folder under the
        // same filter actually lists (see folderService.list's own note).
        // Folder / page / sort / search clicks (the params effect, `dedupe`)
        // change no folder, so they reuse a tree read in the last 30s instead
        // of re-reading /folders on every click. Writes always re-read.
        folderService.list(
          searchParams.uploaded_by_name ? { uploaded_by_name: searchParams.uploaded_by_name } : undefined,
          opts?.dedupe || opts?.reuse ? { reuseMs: 30_000 } : undefined,
        ).catch(() => []),
      ]);

      // Convert API Resume to component Resume type. Shared with the
      // job-details "Select Applicants to Score" popup so both render the
      // same columns from the same mapping.
      const convertedResumes: Resume[] = resumeResponse.items.map(convertApiResumeToRow);

      // Convert API Folder to component Folder type
      let apiFolders: FolderType[] = (Array.isArray(folderResponse) ? folderResponse : []).map(convertApiFolderToTree);

      // Ensure "root" folder always exists (default folder for uploads)
      const hasRootFolder = apiFolders.some(f => f.name.toLowerCase() === 'root' && !f.parentId);
      if (!hasRootFolder) {
        try {
          const newRootFolder = await folderService.create('root');
          const rootFolderConverted: FolderType = {
            id: newRootFolder.id,
            name: newRootFolder.name,
            count: 0,
            parentId: newRootFolder.parent_id,
          };
          apiFolders = [rootFolderConverted, ...apiFolders];
        } catch (error) {
          console.error('Failed to create root folder:', error);
        }
      }

      /* Exactly one "Archived Resumes" folder. Creating it here directly is
         what produced two: a refresh overlaps two of these fetches and both
         created one. ensureArchivedFolder is single-flight and merges any
         existing duplicates into one, after which the tree is re-read so it
         shows the surviving folder with its real count. */
      if (apiFolders.filter(f => f.name === 'Archived Resumes' && !f.parentId).length !== 1) {
        try {
          await ensureArchivedFolder();
          const healed = await folderService.list(
            searchParams.uploaded_by_name ? { uploaded_by_name: searchParams.uploaded_by_name } : undefined,
          );
          const hasRoot = apiFolders.find(f => f.name.toLowerCase() === 'root' && !f.parentId);
          apiFolders = (Array.isArray(healed) ? healed : []).map(convertApiFolderToTree);
          if (hasRoot && !apiFolders.some(f => f.id === hasRoot.id)) apiFolders = [hasRoot, ...apiFolders];
        } catch (error) {
          console.error('Failed to ensure Archived Resumes folder:', error);
        }
      }

      /* The current API call may be filtered by folder/search/skills — its
         total reflects the filtered view, not the user's whole library, so the
         pinned "All Resumes" count only takes it when nothing narrowed the
         request. Read that off the params actually sent rather than the
         arguments: the refetch effect always passes a `filters` object, empty
         or not, and the old `!currentFilters` test read every one of those as
         filtered — so the global total went stale the moment the page did
         anything but its very first fetch.

         The carry-over value comes from a ref, not state. Two fetches overlap
         on a browser refresh (mount + restored view) and the second one's
         closure predates the first one's `setAllResumesTotal`, so reading
         state here wrote the badge back to 0 — that's the count going missing
         after a refresh. */
      const isUnfiltered = versionFilter === 'all' && Object.keys(searchParams).every(key => BASE_SEARCH_PARAM_KEYS.includes(key));
      if (isUnfiltered) {
        allResumesTotalRef.current = resumeResponse.total;
        setAllResumesTotal(resumeResponse.total);
      }
      const nextAllTotal = allResumesTotalRef.current;

      // Add "All Resumes" virtual folder at the top
      const allResumesFolder: FolderType = {
        id: 'all',
        name: 'All Resumes',
        count: nextAllTotal,
      };

      /* The folders API's `resume_count` counts rows the resume list doesn't
         show — extra version rows above all — so a folder holding a single
         resume uploaded twice advertised "(2)" while opening it listed one.
         When this request was scoped to exactly one folder and nothing else,
         its total IS that folder's listing, so take it over the API's count. */
      const isFolderOnly =
        versionFilter === 'all' &&
        !!searchParams.folder_id &&
        Object.keys(searchParams).every(
          key => BASE_SEARCH_PARAM_KEYS.includes(key) || key === 'folder_id',
        );

      /* Only ever downward. This correction exists to drop rows the list hides
         (extra versions and the like), so a listing that comes back BIGGER
         than the folder's stored count is measuring something else — a filter
         the server widened, not this folder's contents — and taking it would
         blow a folder holding one resume up to the whole library.

         Recorded rather than applied inline: `applyCachedCorrections` below is
         the single place a correction reaches the screen, so the badge reads
         the same on this fetch and every later one. */
      if (isFolderOnly) {
        const target = flattenAllFolders(apiFolders).find(f => f.id === searchParams.folder_id);
        if (target) {
          rememberCorrection(target.id, target.count, Math.min(target.count, resumeResponse.total));
        }
      }

      // Raw server counts, kept aside — the reconcile pass has to compare
      // against these, not against numbers it corrected itself.
      const rawFolders: FolderType[] = [allResumesFolder, ...apiFolders];

      // Newest folder snapshot on screen — a reconcile pass that measured an
      // older one must not write its corrections over this (see the helper).
      latestFolderSnapshotRef.current = {
        signature: folderSnapshotSignature(rawFolders),
        reconcileTarget: isUnfiltered ? rawFolders : null,
      };

      setResumes(convertedResumes);
      setLoadedFolderId(folderId || 'all');
      setTotalItems(resumeResponse.total);
      /* Library-wide (the server counts every stored file, whatever the
         filters) — pairs with `allResumesTotal` in the header badge. */
      setTotalIncludingVersions(resumeResponse.total_including_versions);
      setTotalPages(resumeResponse.total_pages);
      setFolders(applyCachedCorrections(rawFolders));
      lastCompletedFetchKeyRef.current = fetchKey;

      // Same correction for every other folder, so the badges are right before
      // the user opens them. Only off the unfiltered view — see the helper.
      // Not awaited, including on first load: the tree paints with the
      // server's `resume_count` and the pass corrects the badges in place.
      if (isUnfiltered) reconcileFolderCounts(rawFolders);

      /* A page number restored from the last visit can point past the end of
         the list — fewer resumes than before, a different account, a narrower
         filter. The API then answers with an empty page and the table reads
         "No resumes found" even though the user has resumes. Step back to the
         last page that holds data; the params effect refetches. */
      if (resumeResponse.items.length === 0 && resumeResponse.total > 0) {
        const lastPage = Math.max(1, resumeResponse.total_pages || 1);
        if (currentPage > lastPage) {
          console.log('[FETCH] Page', currentPage, 'is past the end — falling back to', lastPage);
          setCurrentPage(lastPage);
        }
      }

      /* Same story for the restored folder. The view snapshot is stored per
         tab, not per user, so signing in as someone else keeps the previous
         account's folder id — and filtering by a folder this user doesn't have
         returns nothing at all. Fall back to All Resumes. */
      if (selectedFolder && selectedFolder !== 'all') {
        const folderExists = (list: FolderType[]): boolean =>
          list.some(f => f.id === selectedFolder || (f.children ? folderExists(f.children) : false));
        if (!folderExists(rawFolders)) {
          console.log('[FETCH] Folder', selectedFolder, 'is not in this account — showing All Resumes');
          setSelectedFolder('all');
        }
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
      showErrorToast(error, "Couldn't load resumes", { id: 'my-resumes-load', retry: () => fetchData(searchTerm, currentFilters, folderId) });
    } finally {
      setLoading(false);
      isFetchingRef.current = false; // Reset flag to allow next fetch

      // Replay whatever arrived while this one was running (see the guard),
      // then settle the promise that call handed back.
      const queued = pendingFetchRef.current;
      if (queued) {
        pendingFetchRef.current = null;
        Promise.resolve(
          (fetchDataRef.current ?? fetchData)(
            queued.searchTerm, queued.currentFilters, queued.folderId, queued.silent,
            { dedupe: queued.dedupe, replay: true },
          ),
        ).finally(() => queued.resolve?.());
      }
    }
  };

  fetchDataRef.current = fetchData;

  // Helper function to flatten all folders (including nested children)
  const flattenAllFolders = useCallback((folderList: FolderType[]): FolderType[] => {
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

  // Get folder by ID (including nested folders)
  const getFolderById = useCallback((folderId: string): FolderType | undefined => {
    const allFolders = flattenAllFolders(folders);
    return allFolders.find(f => f.id === folderId);
  }, [folders, flattenAllFolders]);

  /* Name of the folder a resume actually lives in, for the Folder badge in the
     aggregated All Resumes table. A resume has exactly one folder at any depth,
     so this is a plain lookup — All Resumes is a view over those folders, never
     a folder a resume can be "in". */
  const getResumeFolderName = useCallback((folderId?: string): string | undefined => {
    if (!folderId) return undefined;
    return getFolderById(folderId)?.name;
  }, [getFolderById]);

  // Get direct children folders of a parent folder
  const getChildrenFolders = useCallback((parentId: string | null): FolderType[] => {
    if (parentId === null) {
      // Return top-level folders (excluding 'all' virtual folder)
      return folders.filter(f => f.id !== 'all' && !f.parentId);
    }
    const parentFolder = getFolderById(parentId);
    return parentFolder?.children || [];
  }, [folders, getFolderById]);

  // Build breadcrumb path for a folder
  const buildBreadcrumbPath = useCallback((folderId: string | null): { id: string; name: string }[] => {
    if (!folderId) return [];

    const path: { id: string; name: string }[] = [];
    let currentFolder = getFolderById(folderId);

    while (currentFolder) {
      path.unshift({ id: currentFolder.id, name: currentFolder.name });
      if (currentFolder.parentId) {
        currentFolder = getFolderById(currentFolder.parentId);
      } else {
        break;
      }
    }

    return path;
  }, [getFolderById]);

  const getFolderDepth = useCallback((folderId: string | null): number => {
    return buildBreadcrumbPath(folderId).length;
  }, [buildBreadcrumbPath]);

  const canCreateNestedFolder = useCallback((parentId: string | null | undefined): boolean => {
    if (!parentId) return true;
    return getFolderDepth(parentId) < MAX_FOLDER_DEPTH;
  }, [getFolderDepth]);

  // Navigate to folder in card view
  const navigateToFolder = useCallback((folderId: string | null) => {
    setCardViewFolder(folderId);
    // Drive the server-side filter too — without this, the card view
    // tries to client-filter the currently loaded (paginated) page of
    // resumes, which usually doesn't contain the target folder's items
    // and shows an empty grid in Edge/Firefox.
    if (folderId === null) {
      setSelectedFolder('all');
    } else {
      setSelectedFolder(folderId);
    }
    setCurrentPage(1);
    // Clear stale resumes and flip to loading immediately so the grid shows a
    // spinner instead of "No resumes in this folder" while the fetch is in
    // flight (the debounced effect can take ~300ms before it fires).
    setResumes([]);
    setLoading(true);
    if (folderId) {
      const path = buildBreadcrumbPath(folderId);
      setBreadcrumbPath(path);
    } else {
      setBreadcrumbPath([]);
    }
  }, [buildBreadcrumbPath]);

  useEffect(() => {
    const folderIdFromUrl = searchParams.get('folder_id');
    if (!folderIdFromUrl || !getFolderById(folderIdFromUrl)) return;

    setViewMode('card');
    navigateToFolder(folderIdFromUrl);
    router.replace('/recruitment/resume-database?tab=my-resumes', { scroll: false });
  }, [searchParams, getFolderById, navigateToFolder, router]);

  const handleSelectResume = (id: string) => {
    // A resume whose email matches an existing team member is locked out of
    // selection entirely — ResumeTable disables its checkbox, but this guards
    // any other path (e.g. a stale click) from slipping it into the selection.
    const target = resumes.find(r => r.id === id);
    if (target && (target.is_tenant_user_email || target.isTenantUserEmail)) return;
    setSelectedResumes(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  // Archived Resumes is a separate action context (Unarchive instead of
  // Archive; no Score/Assessment/AI Interview/AI Talent Match), so carrying a
  // selection across its boundary left the bulk action bar showing options
  // for resumes that aren't even checked in the folder on screen. Clear the
  // selection on either transition; ordinary folder-to-folder navigation
  // still preserves cross-folder selections (see handleSelectAll above).
  const previousSelectedFolderRef = useRef(selectedFolder);
  useEffect(() => {
    const archivedFolderId = folders.find(f => f.name === 'Archived Resumes' && !f.parentId)?.id;
    const prevFolder = previousSelectedFolderRef.current;
    previousSelectedFolderRef.current = selectedFolder;
    if (
      archivedFolderId &&
      prevFolder !== selectedFolder &&
      (prevFolder === archivedFolderId || selectedFolder === archivedFolderId)
    ) {
      setSelectedResumes([]);
    }
  }, [selectedFolder, folders]);

  // Only act on currently visible IDs. Selections in OTHER folders / pages
  // must be preserved — wiping them would surprise users with multi-folder
  // selections (e.g. picking 5 in folder A then opening folder B and clicking
  // Select All used to drop the original 5).
  const handleSelectAll = (selected: boolean) => {
    // Resumes locked out for a team-member email never enter a "select all".
    const visibleIds = filteredResumes
      .filter(r => !(r.is_tenant_user_email || r.isTenantUserEmail))
      .map(r => r.id);
    setSelectedResumes(prev => {
      if (selected) {
        const merged = new Set(prev);
        visibleIds.forEach(id => merged.add(id));
        return Array.from(merged);
      }
      return prev.filter(id => !visibleIds.includes(id));
    });
  };

  const handleDelete = (id: string) => {
    const resume = resumes.find(r => r.id === id);
    setDeleteResumeConfirm({
      isOpen: true,
      ids: [id],
      names: [resume?.candidate_name || resume?.file_name || 'this resume'],
    });
  };

  const handleDeleteResumes = (ids: string[]) => {
    const names = ids.map(id => {
      const r = rowById(id);
      return r?.candidate_name || r?.file_name || 'this resume';
    });
    setDeleteResumeConfirm({ isOpen: true, ids, names });
  };

  const confirmDeleteResumes = async (version?: DeleteResumeVersionTarget) => {
    const { ids } = deleteResumeConfirm;
    setDeleteResumeConfirm({ isOpen: false, ids: [], names: [] });
    /* One version of a multi-version resume: the row stays (another version
       becomes the latest) — the RESUMES_CHANGED refetch redraws it. */
    if (version) {
      try {
        await resumeService.delete(version.id, { onlyThisVersion: true });
        // Clear the acted-on row from the selection (hides the bulk bar when it
        // was the only pick); RESUMES_CHANGED refetches the list.
        setSelectedResumes(prev => prev.filter(id => !ids.includes(id)));
        toast.success(`Version ${version.version} deleted`);
      } catch (error) {
        showErrorToast(error, `Couldn't delete version ${version.version}`);
      }
      return;
    }
    // Where they were, so their folders can be decremented. Read before the
    // rows leave state.
    const deletedFrom = ids
      .map(id => resumes.find(r => r.id === id))
      .filter((r): r is Resume => !!r);
    try {
      await Promise.all(ids.map(id => resumeService.delete(id)));
      setResumes(prev => prev.filter(r => !ids.includes(r.id)));
      setSelectedResumes(prev => prev.filter(id => !ids.includes(id)));

      /* A deleted resume leaves its folder AND the aggregate. Archived ones
         were never in the All Resumes total, so only the active ones come off
         it — otherwise emptying the Archived folder would drive it negative. */
      const removedPerFolder = new Map<string, number>();
      let activeRemoved = 0;
      deletedFrom.forEach(r => {
        if (r.folderId) removedPerFolder.set(r.folderId, (removedPerFolder.get(r.folderId) || 0) + 1);
        if (!r.isArchived) activeRemoved += 1;
      });
      allResumesTotalRef.current = Math.max(0, allResumesTotalRef.current - activeRemoved);
      setAllResumesTotal(allResumesTotalRef.current);
      setFolders(prev => {
        const patch = (list: FolderType[]): FolderType[] =>
          list.map(f => ({
            ...f,
            count: f.id === 'all'
              ? allResumesTotalRef.current
              : Math.max(0, f.count - (removedPerFolder.get(f.id) || 0)),
            children: f.children ? patch(f.children) : f.children,
          }));
        return patch(prev);
      });

      toast.success(ids.length === 1 ? 'Resume deleted' : `${ids.length} resume(s) deleted`);
    } catch (error) {
      showErrorToast(error, ids.length === 1 ? "Couldn't delete the resume" : `Couldn't delete ${ids.length} resumes`);
    }
  };

  /* The folder the user is looking at right now, or null when the view is an
     aggregate. List view filters by `selectedFolder`; card view drills with
     `cardViewFolder` (and keeps `selectedFolder` in step — see
     navigateToFolder). 'all' and the folder grid show every folder's resumes,
     so no move can empty them. */
  const getViewedFolderId = (): string | null => {
    const viewed = viewMode === 'card' ? cardViewFolder : selectedFolder;
    return viewed && viewed !== 'all' ? viewed : null;
  };

  const handleMoveToFolder = async (resumeIds: string[], folderId: string) => {
    // Source folders, captured before the rows are re-pointed.
    const movedFrom = resumeIds
      .map(id => resumes.find(r => r.id === id)?.folderId)
      .filter((id): id is string => !!id);
    // The folder on screen before the move (null for an aggregate view).
    const viewedBefore = getViewedFolderId();
    try {
      await Promise.all(resumeIds.map(id => resumeService.move(id, folderId)));
      setResumes(prev => prev.map(r =>
        resumeIds.includes(r.id) ? { ...r, folderId } : r
      ));

      /* A move changes which folder owns the resume, never how many resumes
         exist — so the two folder counts trade and the All Resumes total is
         left alone. The Folder badge follows `folderId`, updated above. */
      const leaving = new Map<string, number>();
      movedFrom.forEach(id => {
        if (id !== folderId) leaving.set(id, (leaving.get(id) || 0) + 1);
      });
      const arriving = movedFrom.filter(id => id !== folderId).length;
      if (leaving.size > 0 || arriving > 0) {
        setFolders(prev => {
          const patch = (list: FolderType[]): FolderType[] =>
            list.map(f => {
              if (f.id === 'all') return { ...f, children: f.children ? patch(f.children) : f.children };
              const gained = f.id === folderId ? arriving : 0;
              const lost = leaving.get(f.id) || 0;
              return {
                ...f,
                count: Math.max(0, f.count + gained - lost),
                children: f.children ? patch(f.children) : f.children,
              };
            });
          return patch(prev);
        });
      }

      setSelectedResumes([]);
      toast.success(`${resumeIds.length} resume(s) moved`);

      /* Where the user ends up: always the destination folder, opened on its
         first page, so the user sees the resumes they just moved there.
         Setting the folder is enough to load it — the params effect refetches
         on `selectedFolder`. Already looking at the destination (a move into
         the folder on screen): stay and refresh so the list shows them. */
      if (viewedBefore === folderId) {
        fetchData(appliedSearchQuery, filters, selectedFolder, true);
      } else if (viewMode === 'card') {
        navigateToFolder(folderId);
      } else {
        setSelectedFolder(folderId);
        setCurrentPage(1);
      }
    } catch (error) {
      showErrorToast(error, "Couldn't move the resumes");
    }
  };

  /* Archive, unarchive, move and delete all end in RESUMES_CHANGED_EVENT
     (fired by resumeService once the burst of per-resume calls settles). The
     handlers below patch counts optimistically, but some paths had no server
     re-read at all — a "Move to folder" into or out of Archived Resumes flips
     the archived flag server-side, yet the All Resumes badge was left alone
     and, from the All Resumes view, the moved row stayed listed. Re-read the
     global total and the current view (folder tree included) from the server
     so every badge lands on the real number. A ref keeps the listener on the
     latest folder/search/filters without re-subscribing every render. */
  const onResumesChangedRef = useRef<() => void>(() => {});
  onResumesChangedRef.current = () => {
    refreshAllResumesTotal();
    fetchData(appliedSearchQuery, filters, selectedFolder, true);
  };
  useEffect(() => {
    const handler = () => onResumesChangedRef.current();
    window.addEventListener(RESUMES_CHANGED_EVENT, handler);
    return () => window.removeEventListener(RESUMES_CHANGED_EVENT, handler);
  }, []);

  // Handle archive resumes - sets is_archived AND moves to Archived Resumes folder
  const handleArchiveResumes = async (resumeIds: string[]) => {
    try {
      // Find the "Archived Resumes" folder
      const known = folders.find(f => f.name === 'Archived Resumes' && !f.parentId);
      const archivedFolder = known ?? { id: (await ensureArchivedFolder()).id };

      // Get old folder IDs for count update
      const oldFolderIds = resumeIds.map(id => {
        const resume = resumes.find(r => r.id === id);
        return resume?.folderId;
      }).filter(Boolean);

      // Remember where each resume was before archiving so Unarchive can
      // restore it to the same folder. Backend has no previous_folder_id
      // column, so we stash it in localStorage keyed by resume id.
      try {
        const stash = JSON.parse(localStorage.getItem('archivedResumePrevFolder') || '{}');
        resumeIds.forEach((id) => {
          const r = resumes.find((x) => x.id === id);
          if (r?.folderId && r.folderId !== archivedFolder.id) {
            stash[id] = r.folderId;
          }
        });
        localStorage.setItem('archivedResumePrevFolder', JSON.stringify(stash));
      } catch {
        // localStorage unavailable / quota — silently fall through; unarchive
        // will just default to Root for these ids.
      }

      // Archive and move each resume. skipAudit on the move: the archive
      // endpoint itself now logs "Resume archived", so this filing move (a
      // side effect of the toggle, not a folder move the recruiter asked
      // for) must not log its own "Resume moved" row over it.
      await Promise.all(resumeIds.map(async (id) => {
        await resumeService.archive(id, true);
        await resumeService.move(id, archivedFolder.id, true);
      }));

      /* Archiving moves the resume into Archived Resumes, so it has left
         whatever the user is looking at — unless they are looking AT Archived
         Resumes. The old code only flipped the flag on the row, which left it
         sitting in its original folder wearing an "Archived" badge until a
         refresh re-queried the server and it finally disappeared. Drop it from
         the list here instead, and keep it (updated) only in the archived view. */
      const viewingArchived =
        selectedFolder === archivedFolder.id || cardViewFolder === archivedFolder.id;
      setResumes(prev =>
        viewingArchived
          ? prev.map(r =>
              resumeIds.includes(r.id)
                ? { ...r, isArchived: true, archivedAt: new Date().toISOString(), folderId: archivedFolder.id }
                : r
            )
          : prev.filter(r => !resumeIds.includes(r.id))
      );

      // Update folder counts. All Resumes counts active resumes only, so
      // archiving takes them out of it as well as out of their old folder.
      allResumesTotalRef.current = Math.max(0, allResumesTotalRef.current - resumeIds.length);
      setAllResumesTotal(allResumesTotalRef.current);
      setFolders(prev => prev.map(f => {
        if (f.id === 'all') {
          return { ...f, count: allResumesTotalRef.current };
        }
        if (f.id === archivedFolder.id) {
          return { ...f, count: f.count + resumeIds.length };
        }
        // Decrease count from old folders
        const decreaseCount = oldFolderIds.filter(fid => fid === f.id).length;
        if (decreaseCount > 0) {
          return { ...f, count: Math.max(0, f.count - decreaseCount) };
        }
        return f;
      }));

      setSelectedResumes([]);
      /* No explicit re-query here: removing the rows above keeps the page
         correct, and the moves above fire RESUMES_CHANGED_EVENT, whose
         listener re-reads the view (totals, what backfills from the next page)
         through fetchData's queue. A second, forced fetch here used to bypass
         that queue and race the listener's. */
      toast.success(`${resumeIds.length} resume(s) archived`);
    } catch (error) {
      showErrorToast(error, "Couldn't archive the resumes");
    }
  };

  const handleConfirmBulkArchive = async () => {
    setIsArchivingResumes(true);
    await handleArchiveResumes(selectedResumes);
    setIsArchivingResumes(false);
    setIsArchiveModalOpen(false);
  };

  // Handle unarchive resumes - clears is_archived and restores each resume
  // to the folder it lived in before archiving (stashed in localStorage by
  // handleArchiveResumes). Falls back to Root for resumes with no stash
  // entry (archived before this fix, or stash cleared).
  const handleUnarchiveResumes = async (resumeIds: string[]) => {
    try {
      const rootFolder = folders.find(f => f.name.toLowerCase() === 'root' && !f.parentId);
      if (!rootFolder) {
        toast.error('Root folder not found');
        return;
      }
      const archivedFolder = folders.find(f => f.name === 'Archived Resumes' && !f.parentId);

      let stash: Record<string, string> = {};
      try {
        stash = JSON.parse(localStorage.getItem('archivedResumePrevFolder') || '{}');
      } catch {
        stash = {};
      }
      const validFolderIds = new Set(folders.map(f => f.id));
      const targetFolderFor = (id: string): string => {
        const prev = stash[id];
        if (prev && validFolderIds.has(prev) && prev !== archivedFolder?.id) return prev;
        return rootFolder.id;
      };

      const restorations = resumeIds.map(id => ({ id, target: targetFolderFor(id) }));

      // skipAudit on the move — same reason as handleArchiveResumes: the
      // restore-to-original-folder move is a side effect of unarchiving, not
      // a folder move in its own right, and `archive_resume` already logs
      // "Resume unarchived" for this click.
      await Promise.all(restorations.map(async ({ id, target }) => {
        await resumeService.archive(id, false);
        await resumeService.move(id, target, true);
      }));

      // Drop the consumed stash entries so they don't grow unbounded.
      try {
        resumeIds.forEach(id => { delete stash[id]; });
        localStorage.setItem('archivedResumePrevFolder', JSON.stringify(stash));
      } catch {
        // ignore — best-effort cleanup
      }

      const targetById = new Map(restorations.map(r => [r.id, r.target]));
      setResumes(prev => prev.map(r =>
        resumeIds.includes(r.id)
          ? { ...r, isArchived: false, archivedAt: undefined, folderId: targetById.get(r.id) || rootFolder.id }
          : r
      ));

      // Folder counts: bump each restored folder, decrement Archived Resumes
      const restoredCounts = new Map<string, number>();
      restorations.forEach(({ target }) => {
        restoredCounts.set(target, (restoredCounts.get(target) || 0) + 1);
      });
      // …and back into All Resumes, which counts active resumes only.
      allResumesTotalRef.current += resumeIds.length;
      setAllResumesTotal(allResumesTotalRef.current);
      setFolders(prev => prev.map(f => {
        if (f.id === 'all') {
          return { ...f, count: allResumesTotalRef.current };
        }
        if (restoredCounts.has(f.id)) {
          return { ...f, count: f.count + (restoredCounts.get(f.id) || 0) };
        }
        if (archivedFolder && f.id === archivedFolder.id) {
          return { ...f, count: Math.max(0, f.count - resumeIds.length) };
        }
        return f;
      }));

      setSelectedResumes([]);
      // The displayed list (`filteredResumes`) is the server-returned page for
      // the selected folder, so the just-unarchived row won't disappear until
      // it is re-queried — the moves above fire RESUMES_CHANGED_EVENT, whose
      // listener does that through fetchData's queue (see archive above).

      const restoredToOriginal = restorations.filter(r => r.target !== rootFolder.id).length;
      toast.success(
        restoredToOriginal === resumeIds.length
          ? `${resumeIds.length} resume(s) unarchived and restored to their original folder`
          : restoredToOriginal === 0
            ? `${resumeIds.length} resume(s) unarchived (moved to Root — original folder not remembered)`
            : `${resumeIds.length} resume(s) unarchived (${restoredToOriginal} restored, ${resumeIds.length - restoredToOriginal} to Root)`
      );
    } catch (error) {
      showErrorToast(error, "Couldn't unarchive the resumes");
    }
  };

  // Handle bulk download of selected resumes
  const handleBulkDownload = async () => {
    if (selectedResumes.length === 0) return;

    // If more than 1 resume selected, show confirmation popup
    if (selectedResumes.length > 1) {
      setIsZipDownloadModalOpen(true);
      return;
    }

    // For single resume, download directly
    toast.loading('Downloading resume...', { id: 'bulk-download' });
    try {
      const resumeId = selectedResumes[0];
      const resume = rowById(resumeId);
      const blob = await resumeService.download(resumeId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Use original fileName to preserve file extension (pdf, doc, docx, rtf, txt, etc.)
      a.download = resume?.fileName || `${resume?.name || 'resume'}.${resume?.fileType || 'pdf'}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Resume downloaded', { id: 'bulk-download' });
      setSelectedResumes([]);
    } catch (error) {
      console.error('Download failed:', error);
      showErrorToast(error, "Couldn't download the resume", { id: 'bulk-download', retry: handleBulkDownload });
    }
  };

  // Handle ZIP download of multiple resumes
  const handleZipDownload = async () => {
    if (selectedResumes.length === 0) return;

    setIsDownloadingZip(true);
    toast.loading(`Preparing ${selectedResumes.length} resumes for download...`, { id: 'zip-download' });

    try {
      // Dynamically import fflate to avoid SSR issues
      const { zipSync, strToU8 } = await import('fflate');

      const files: { [key: string]: Uint8Array } = {};

      // Download each resume and add to ZIP
      for (let i = 0; i < selectedResumes.length; i++) {
        const resumeId = selectedResumes[i];
        const resume = rowById(resumeId);
        // Use original fileName to preserve file extension (pdf, doc, docx, etc.)
        const fileName = resume?.fileName || `${resume?.name || `resume_${i + 1}`}_resume`;
        const zipPath = `resumes/${fileName}`;

        try {
          const blob = await resumeService.download(resumeId);
          const arrayBuffer = await blob.arrayBuffer();
          files[zipPath] = new Uint8Array(arrayBuffer);
        } catch (err) {
          console.error(`Failed to download ${fileName}:`, err);
        }
      }

      // Generate ZIP file
      const zipped = zipSync(files);
      const zipBlob = new Blob([zipped], { type: 'application/zip' });

      const url = window.URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `resumes_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success(`${selectedResumes.length} resumes downloaded as ZIP`, { id: 'zip-download' });
      setSelectedResumes([]);
      setIsZipDownloadModalOpen(false);
    } catch (error) {
      console.error('ZIP download failed:', error);
      showErrorToast(error, "Couldn't create the ZIP file", { id: 'zip-download', retry: handleZipDownload });
    } finally {
      setIsDownloadingZip(false);
    }
  };

  /* The ticked resumes as invite-popup candidates. Resumes without an email
     are still passed — the popup lists them as disabled "No email" rows.
     The row mapper fills blanks with "No email" / "No phone" placeholders,
     so those are stripped back to empty here. */
  const selectedInviteCandidates = (): InviteCandidate[] =>
    selectedRows
      .map((r) => {
        const email = typeof r.email === 'string' && r.email.includes('@') ? r.email.trim() : '';
        const rawPhone = (r as any).phone;
        const phone = typeof rawPhone === 'string' && rawPhone && rawPhone !== 'No phone' ? rawPhone : undefined;
        return {
          id: r.id,
          name: r.name,
          email,
          phone,
          resumeId: r.id,
          inviteSource: 'My Resumes',
        };
      });

  // Handle Assessment button click — opens the shared invite popup, which
  // starts with a picker of every published assessment.
  const handleAssessment = () => {
    if (selectedResumes.length === 0) {
      toast.error('Please select at least one resume');
      return;
    }
    // An archived resume can't be assessed, same rule Score and AI Interview apply.
    const archivedCount = selectedRows
      .filter(r => isResumeArchived(r)).length;
    if (archivedCount > 0) {
      toast.error(`Archived resume${archivedCount > 1 ? 's' : ''} cannot be invited to an assessment. Please select active resumes only.`);
      return;
    }
    const tenantUserCount = selectedRows
      .filter(r => isTenantUserEmailResume(r)).length;
    if (tenantUserCount > 0) {
      toast.error(`${tenantUserCount} selected resume${tenantUserCount > 1 ? 's belong' : ' belongs'} to an existing team member and cannot be invited to an assessment.`);
      return;
    }
    openInvite({
      kind: 'assessment',
      candidates: selectedInviteCandidates(),
      // Shown ticked in the popup's Resume Database › My Resumes, which opens first.
      pickInto: 'my-resumes',
      onSent: () => setSelectedResumes([]),
    });
  };

  // Handle AI Interview button click
  const handleAIInterview = () => {
    if (selectedResumes.length === 0) {
      toast.error('Please select at least one resume');
      return;
    }
    // An archived resume can't be put in front of an interviewer, same rule the
    // scoring action applies.
    const archivedCount = selectedRows
      .filter(r => isResumeArchived(r)).length;
    if (archivedCount > 0) {
      toast.error(`Archived resume${archivedCount > 1 ? 's' : ''} cannot be invited to an AI interview. Please select active resumes only.`);
      return;
    }
    const tenantUserCount = selectedRows
      .filter(r => isTenantUserEmailResume(r)).length;
    if (tenantUserCount > 0) {
      toast.error(`${tenantUserCount} selected resume${tenantUserCount > 1 ? 's belong' : ' belongs'} to an existing team member and cannot be invited to an AI interview.`);
      return;
    }
    openInvite({
      kind: 'interview',
      candidates: selectedInviteCandidates(),
      // Shown ticked in the popup's Resume Database › My Resumes, which opens first.
      pickInto: 'my-resumes',
      onSent: () => setSelectedResumes([]),
    });
  };


  // Fetch published jobs for the Apply to Job modal
  const fetchPublishedJobs = async () => {
    setLoadingJobs(true);
    try {
      const response = await jdService.list({ status: 'published', page_size: 100, source: 'my-jds' });
      const convertedJobs: Job[] = response.items.map((jd: any) => ({
        id: jd.id,
        job_id: jd.job_id,
        title: jd.title || 'Untitled',
        status: 'Published' as const,
        location: jd.location || '',
        daysActive: jd.created_at ? Math.ceil((new Date().getTime() - new Date(jd.created_at).getTime()) / (1000 * 60 * 60 * 24)) : 0,
        requiredMatch: jd.required_match || 70,
        department: jd.department,
        industry_type: jd.industry_type,
        applicants: jd.applicants_count || 0,
        description: jd.description,
        skills: jd.skills || jd.must_have_skills || [],
        postedDate: jd.published_at || jd.created_at,
        postedBy: jd.created_by_name,
        employmentType: jd.employment_type,
        workMode: jd.remote_type,
        created_at: jd.created_at,
        updated_at: jd.updated_at,
        creation_method: jd.creation_method,
      }));
      setPublishedJobs(convertedJobs);
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
      showErrorToast(error, "Couldn't load jobs", { id: 'my-resumes-jobs-load', retry: fetchPublishedJobs });
    } finally {
      setLoadingJobs(false);
    }
  };

  // Helper: check if a resume is archived (by flag OR by folder)
  const isResumeArchived = (resume: Resume): boolean => {
    if (resume.isArchived === true) return true;
    const archivedFolder = folders.find(f => f.name === 'Archived Resumes' && !f.parentId);
    if (archivedFolder && resume.folderId === archivedFolder.id) return true;
    return false;
  };

  // Helper: a resume whose email matches an existing team member — locked out
  // of every action the same way an archived resume is. The checkbox already
  // blocks selecting one; these checks catch any other path into these handlers.
  const isTenantUserEmailResume = (resume: Resume): boolean =>
    !!(resume.is_tenant_user_email ?? resume.isTenantUserEmail);

  // Handle apply to job. One ticked candidate or fifty, the same dialog opens:
  // the Candidates Selected panel lists them on their latest version, and the
  // eye beside a row is where another version is read and picked. A separate
  // version-selector step for the single-candidate case meant the two flows
  // looked nothing alike for no reason.
  const handleApplyToJob = async () => {
    if (selectedResumes.length === 0) return;

    // Check if any selected resumes are archived (by flag or folder)
    const selectedResumeObjects = selectedRows;
    const archivedCount = selectedResumeObjects.filter(r => isResumeArchived(r)).length;

    if (archivedCount > 0) {
      toast.error(`Archived resume${archivedCount > 1 ? 's' : ''} cannot be applied to any job. Please select active resumes only.`);
      return;
    }

    const tenantUserCount = selectedResumeObjects.filter(r => isTenantUserEmailResume(r)).length;
    if (tenantUserCount > 0) {
      toast.error(`${tenantUserCount} selected resume${tenantUserCount > 1 ? 's belong' : ' belongs'} to an existing team member and cannot be applied to any job.`);
      return;
    }

    // Every ticked candidate goes in on its latest version; the dialog is where
    // a different one is chosen.
    void fetchPublishedJobs();
    setIsApplyToJobModalOpen(true);
  };

  // Apply to Job from a row's action button. Same dialog as the toolbar action,
  // with that one candidate on its latest version — the version is chosen in the
  // dialog, not before it.
  const handleSingleResumeApplyToJob = async (resume: Resume) => {
    // Check if resume is archived (by flag OR by folder)
    if (isResumeArchived(resume)) {
      toast.error('Archived resume cannot be applied to any job. Please select an active resume.');
      return;
    }

    if (isTenantUserEmailResume(resume)) {
      toast.error('This resume belongs to an existing team member and cannot be applied to any job.');
      return;
    }

    setSingleResumeToApply(resume);
    void fetchPublishedJobs();
    setIsApplyToJobModalOpen(true);
  };

  // Handle scoring an uploaded resume - called from UploadModal success state
  const handleScoreUploadedResume = async (resumeId: string, candidateName: string) => {
    // Store the uploaded resume info for scoring
    setUploadedResumeToScore({ id: resumeId, candidateName });

    // Fetch published jobs and open modal
    void fetchPublishedJobs();
    setIsApplyToJobModalOpen(true);
  };

  // Handle applying resumes to selected jobs (scoring) - using async Celery
  const handleApplyToJobSubmit = (resumeIds: string[], jobIds: string[], jobRecords?: Job[], sourceResumeIds?: string[], resumeVersions?: (number | undefined)[]) => {
    if (jobIds.length === 0 || resumeIds.length === 0) return;

    setIsApplyToJobModalOpen(false);

    /* The dialog reads the job list itself — from the same endpoint and mapping
       as the Job Openings page — so take the record it hands back; the locally
       fetched list is only a fallback. */
    const jobId = jobIds[0];
    const selectedJob = jobRecords?.[0] || publishedJobs.find(j => j.id === jobId);
    // A picked older version has its own id: name it from the candidate it came from.
    const names: Record<string, string> = {};
    const versions: Record<string, number> = {};
    resumeIds.forEach((id, i) => {
      const resume: any = rowById(id) || rowById(sourceResumeIds?.[i] ?? '');
      names[id] = resume?.candidateName || resume?.candidate_name || resume?.name || 'Unknown';
      const version = resumeVersions?.[i];
      if (version) versions[id] = version;
    });
    // What will happen (scored / skipped / units) is shown before anything starts.
    setScoringRequest({
      job: { id: jobId, title: selectedJob?.title || 'Job', jobCode: selectedJob?.job_id, version: selectedJob?.versionNumber },
      resumeIds,
      names,
      versions,
    });
  };

  // Start Scoring from the summary: only the resumes it found to score.
  const proceedWithScoring = async (jobId: string, resumeIds: string[], names: Record<string, string>) => {
    try {
      // Start async bulk scoring via Celery (resumeIds already have correct version IDs)
      const response = await scoringService.startBulkScoringAsync(jobId, resumeIds);

      const resumeItems = resumeIds.map(id => ({
        resumeId: id,
        candidateName: names[id] || 'Unknown',
        resumeVersion: scoringRequest?.versions?.[id],
      }));

      // Clear selection and follow the run here: its progress popup opens on
      // this page, and Minimize leaves the recruiter on Resume Database.
      setSelectedResumes([]);
      setScoringRequest(null);
      setSingleResumeToApply(null);
      setUploadedResumeToScore(null);
      // Results opened from it keep Resume Database's breadcrumb.
      rememberScoringOrigin(response.jd_id, [
        { label: 'Resume Database', href: resumeDatabaseTabHref('my-resumes') },
      ]);
      startScoringProgress({
        batchId: response.batch_id,
        jobId: response.jd_id,
        jobTitle: response.jd_title,
        items: resumeItems,
        jobCode: scoringRequest?.job.jobCode,
        jobVersion: scoringRequest?.job.version,
      });
      toast.success(`Scoring started for ${resumeItems.length} resume${resumeItems.length !== 1 ? 's' : ''}.`);
    } catch (error: any) {
      console.error('Failed to start scoring:', error);
      showErrorToast(error, "Couldn't start scoring");
    }
  };


  const handleCreateFolder = async (name: string, rawParentId?: string) => {
    /* Trim before anything else. The tree passes its input straight through,
       so "Mani " reached the duplicate check as a different string from
       "Mani" and slipped past it — that is how two same-named folders ended
       up side by side inside a subfolder. Everything below, including the
       create call, uses the trimmed name. */
    const folderName = (name ?? '').trim();
    const parentId = rawParentId;
    if (!folderName) {
      toast.error('Folder name cannot be empty');
      return;
    }
    try {
      if (!canCreateNestedFolder(parentId)) {
        toast.error(`Maximum folder depth reached (${MAX_FOLDER_DEPTH} levels)`);
        return;
      }
      if (/<[^>]+>/.test(folderName) || /javascript:|data:|vbscript:/i.test(folderName)) {
        toast.error('Folder name must not contain HTML or script content');
        return;
      }
      // The inputs cap this with maxLength; the check is here as well because
      // this handler is the single point every entry path funnels through.
      if (folderName.length > FOLDER_NAME_MAX_LENGTH) {
        toast.error(`Folder name must be ${FOLDER_NAME_MAX_LENGTH} characters or fewer`);
        return;
      }
      // Helper to get all folders including nested children
      const getAllFolders = (folderList: FolderType[]): FolderType[] => {
        const result: FolderType[] = [];
        const traverse = (list: FolderType[]) => {
          for (const f of list) {
            result.push(f);
            if (f.children) traverse(f.children);
          }
        };
        traverse(folderList);
        return result;
      };

      /* Names are compared trimmed and case-insensitively, and only against
         SIBLINGS — the folders sharing this one's parent. A name is a path
         segment, not a global id: "Test" at the root and "Test" inside it are
         two different folders, exactly as two files of the same name in
         different directories are. This used to also enforce a second,
         tree-wide rule ("no two folders anywhere may share a name"), which
         made the first subfolder named after any existing folder impossible
         to create.

         Root-level folders are siblings of each other, so the same comparison
         covers them: `parentId` is undefined for both, and `|| undefined`
         folds null/'' into that so a folder the API returned with
         `parent_id: null` still matches a create call that passed nothing. */
      const allFolders = getAllFolders(folders);
      const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

      const duplicateSibling = allFolders.find(f =>
        f.id !== 'all' &&
        (f.parentId || undefined) === (parentId || undefined) &&
        sameName(f.name, folderName)
      );
      if (duplicateSibling) {
        const parentName = parentId ? getFolderById(parentId)?.name : undefined;
        toast.error(
          parentName
            ? `"${folderName}" already exists inside "${parentName}"`
            : `Folder "${folderName}" already exists`
        );
        return;
      }

      console.log('[DEBUG] Creating folder:', { name: folderName, parentId });
      const newFolder = await folderService.create(folderName, parentId);
      console.log('[DEBUG] Folder created:', newFolder);

      // Reload folders from backend to get proper tree structure
      const folderResponse = await folderService.list();
      const convertApiFolder = (f: ApiFolder): FolderType => ({
        id: f.id,
        name: f.name,
        count: f.resume_count || 0,
        parentId: f.parent_id,
        children: f.children?.map(convertApiFolder),
      });
      const apiFolders: FolderType[] = (Array.isArray(folderResponse) ? folderResponse : []).map(convertApiFolder);

      // Add "All Resumes" virtual folder at the top — use the pinned global
      // total, not the currently loaded list (which may be filtered/paginated).
      const allResumesFolder: FolderType = {
        id: 'all',
        name: 'All Resumes',
        count: allResumesTotal,
      };
      setFolders([allResumesFolder, ...apiFolders]);

      toast.success('Folder created');
    } catch (error: any) {
      console.error('[DEBUG] Failed to create folder:', error);
      showErrorToast(error, "Couldn't create the folder");
    }
  };

  const openCardFolderInput = (parentId: string | null) => {
    if (!canCreateNestedFolder(parentId)) {
      toast.error(`Maximum folder depth reached (${MAX_FOLDER_DEPTH} levels)`);
      return;
    }
    setCardNewFolderName('');
    setCardFolderParentId(parentId);
  };

  const closeCardFolderInput = () => {
    setCardFolderParentId(undefined);
    setCardNewFolderName('');
  };

  const submitCardFolder = async () => {
    const name = cardNewFolderName.trim();
    if (!name || cardFolderParentId === undefined) return;
    if (!canCreateNestedFolder(cardFolderParentId)) {
      toast.error(`Maximum folder depth reached (${MAX_FOLDER_DEPTH} levels)`);
      closeCardFolderInput();
      return;
    }
    await handleCreateFolder(name, cardFolderParentId ?? undefined);
    closeCardFolderInput();
  };

  const openCardFolderRename = (folder: FolderType) => {
    if ((folder.name.toLowerCase() === 'root' || folder.name === 'Archived Resumes') && !folder.parentId) {
      toast.error('System folders cannot be renamed');
      return;
    }
    closeCardFolderInput();
    setCardRenamingFolderId(folder.id);
    setCardRenameValue(folder.name);
  };

  const closeCardFolderRename = () => {
    setCardRenamingFolderId(null);
    setCardRenameValue('');
  };

  const submitCardFolderRename = async (folderId: string) => {
    const name = cardRenameValue.trim();
    if (!name) return;
    await handleRenameFolder(folderId, name);
    closeCardFolderRename();
  };

  const handleRenameFolder = async (id: string, name: string) => {
    try {
      if (/<[^>]+>/.test(name) || /javascript:|data:|vbscript:/i.test(name)) {
        toast.error('Folder name must not contain HTML or script content');
        return;
      }
      if (name.trim().length > FOLDER_NAME_MAX_LENGTH) {
        toast.error(`Folder name must be ${FOLDER_NAME_MAX_LENGTH} characters or fewer`);
        return;
      }
      // Prevent renaming "Archived Resumes" folder
      const folderToRename = getFolderById(id);
      if (folderToRename && folderToRename.name === 'Archived Resumes' && !folderToRename.parentId) {
        toast.error('Archived Resumes folder cannot be renamed');
        return;
      }

      // Helper to get all folders including nested children
      const getAllFolders = (folderList: FolderType[]): FolderType[] => {
        const result: FolderType[] = [];
        const traverse = (list: FolderType[]) => {
          for (const f of list) {
            result.push(f);
            if (f.children) traverse(f.children);
          }
        };
        traverse(folderList);
        return result;
      };

      /* Compared trimmed and against siblings only, exactly like creation —
         otherwise a rename is a second way to land two same-named folders side
         by side, and (when it was tree-wide) a second way to reject a name
         that is only taken somewhere else in the tree. Siblings here are the
         folders sharing the renamed folder's own parent. */
      const trimmedName = name.trim();
      const allFolders = getAllFolders(folders);
      const parentOfRenamed = folderToRename?.parentId || undefined;
      const existingSibling = allFolders.find(f =>
        f.name.trim().toLowerCase() === trimmedName.toLowerCase() &&
        (f.parentId || undefined) === parentOfRenamed &&
        f.id !== id &&
        f.id !== 'all'
      );

      if (existingSibling) {
        const parentName = parentOfRenamed ? getFolderById(parentOfRenamed)?.name : undefined;
        toast.error(
          parentName
            ? `"${trimmedName}" already exists inside "${parentName}"`
            : `Folder "${trimmedName}" already exists`
        );
        return;
      }

      await folderService.update(id, { name: trimmedName });
      const renameInTree = (folderList: FolderType[]): FolderType[] =>
        folderList.map((folder) => ({
          ...folder,
          name: folder.id === id ? trimmedName : folder.name,
          children: folder.children ? renameInTree(folder.children) : folder.children,
        }));
      setFolders(prev => renameInTree(prev));
      toast.success('Folder renamed');
    } catch (error) {
      showErrorToast(error, "Couldn't rename the folder");
    }
  };

  const handleDeleteFolder = async (id: string) => {
    // Find the folder to check if it's a system folder
    const folderToDelete = getFolderById(id);

    // Prevent deletion of root folder
    if (folderToDelete && folderToDelete.name.toLowerCase() === 'root' && !folderToDelete.parentId) {
      toast.error('Root folder cannot be deleted');
      return;
    }

    // Prevent deletion of "Archived Resumes" folder
    if (folderToDelete && folderToDelete.name === 'Archived Resumes' && !folderToDelete.parentId) {
      toast.error('Archived Resumes folder cannot be deleted');
      return;
    }

    // Count resumes in this folder (local fallback)
    const resumesInFolder = resumes.filter(r => r.folderId === id);

    // Find parent folder info
    const parentFolder = folderToDelete?.parentId
      ? getFolderById(folderToDelete.parentId)
      : null;

    // Find root folder
    const rootFolder = folders.find(f => f.name.toLowerCase() === 'root' && !f.parentId);

    // Open dialog immediately with loading state
    setDeleteFolderConfirm({
      isOpen: true,
      folderId: id,
      folderName: folderToDelete?.name || 'this folder',
      resumeCount: resumesInFolder.length,
      parentFolderId: parentFolder?.id || rootFolder?.id || null,
      parentFolderName: parentFolder?.name || 'My Resumes (root)',
      contentAction: null,
      hasSubfolders: false,
      subfolderCount: 0,
      subfolderDetails: [],
      totalResumeCount: resumesInFolder.length,
      subfolderResumeCount: 0,
      loading: true,
    });

    // Fetch accurate deletion info from backend
    try {
      const info = await folderService.getDeletionInfo(id);
      setDeleteFolderConfirm(prev => ({
        ...prev,
        resumeCount: info.direct_resume_count,
        hasSubfolders: info.subfolder_count > 0,
        subfolderCount: info.subfolder_count,
        subfolderDetails: info.subfolder_details,
        totalResumeCount: info.total_resume_count,
        subfolderResumeCount: info.subfolder_resume_count,
        loading: false,
      }));
    } catch {
      // Fallback to client-side data on API error
      setDeleteFolderConfirm(prev => ({
        ...prev,
        loading: false,
      }));
    }
  };

  const confirmDeleteFolder = async () => {
    const { folderId, totalResumeCount, contentAction, parentFolderId, hasSubfolders } = deleteFolderConfirm;
    if (!folderId) return;

    // If folder has content and no action selected, don't proceed
    if (totalResumeCount > 0 && !contentAction) {
      toast.error('Please select what to do with the resumes in this folder');
      return;
    }

    // Find root folder for 'move-root' action
    const rootFolder = folders.find(f => f.name.toLowerCase() === 'root' && !f.parentId);

    // Determine target folder for moving resumes and flags
    let moveResumesTo: string | undefined;
    let deleteSubfolders = hasSubfolders;
    let deleteResumes = false;

    if (totalResumeCount > 0 && contentAction) {
      if (contentAction === 'move-parent') {
        moveResumesTo = parentFolderId || rootFolder?.id;
      } else if (contentAction === 'move-root') {
        moveResumesTo = rootFolder?.id;
      } else if (contentAction === 'delete-all') {
        deleteResumes = true;
      }
    }

    try {
      const result = await folderService.delete(folderId, moveResumesTo, deleteSubfolders, deleteResumes);

      // Refresh folders from backend for accurate state
      try {
        const folderResponse = await folderService.list();
        type ApiFolder = { id: string; name: string; parent_id?: string; resume_count: number; children?: ApiFolder[]; created_at: string };
        const convertApiFolder = (f: ApiFolder): FolderType => ({
          id: f.id,
          name: f.name,
          count: f.resume_count || 0,
          parentId: f.parent_id,
          children: f.children?.map(convertApiFolder),
        });
        let apiFolders: FolderType[] = (Array.isArray(folderResponse) ? folderResponse : []).map(convertApiFolder);

        // Ensure "root" folder always exists
        const hasRootFolder = apiFolders.some(f => f.name.toLowerCase() === 'root' && !f.parentId);
        if (!hasRootFolder) {
          try {
            const rootFolder = await folderService.create('root');
            apiFolders.push(convertApiFolder(rootFolder as unknown as ApiFolder));
          } catch { /* ignore */ }
        }

        // Ensure "All Resumes" virtual folder uses the pinned global total
        const allResumesFolder: FolderType = {
          id: 'all',
          name: 'All Resumes',
          count: allResumesTotalRef.current,
          children: [],
        };
        setFolders([allResumesFolder, ...apiFolders]);
      } catch {
        // Fallback: remove deleted folder from local state
        setFolders(prev => prev.filter(f => f.id !== folderId));
      }

      // If we deleted resumes, remove them from local state
      if (deleteResumes && result.deleted_resumes > 0) {
        setResumes(prev => prev.filter(r => r.folderId !== folderId));
      }

      /* Deleting a folder can take active resumes with it, and moving its
         contents changes which folders own them — so re-read the aggregate
         rather than trying to guess the delta from the server's summary. */
      refreshAllResumesTotal();
      if (deleteResumes && result.deleted_resumes > 0) {
        // Through fetchData's queue, not around it — forcing the guard open
        // let this run alongside an in-flight fetch and land in either order.
        fetchData(appliedSearchQuery, filters, selectedFolder, true);
      }

      // If viewing a deleted folder, redirect to root
      if (selectedFolder === folderId) {
        const root = folders.find(f => f.name.toLowerCase() === 'root' && !f.parentId);
        setSelectedFolder(root?.id || 'all');
      }

      // Dynamic toast with counts
      const parts: string[] = [];
      if (result.deleted_folders > 1) parts.push(`${result.deleted_folders} folders deleted`);
      else parts.push('Folder deleted');
      if (result.moved_resumes > 0) parts.push(`${result.moved_resumes} resume${result.moved_resumes !== 1 ? 's' : ''} moved`);
      if (result.deleted_resumes > 0) parts.push(`${result.deleted_resumes} resume${result.deleted_resumes !== 1 ? 's' : ''} deleted`);
      toast.success(parts.join(', '));
    } catch (error) {
      showErrorToast(error, "Couldn't delete the folder");
    }

    // Close dialog
    setDeleteFolderConfirm({ isOpen: false, folderId: null, folderName: '', resumeCount: 0, parentFolderId: null, parentFolderName: '', contentAction: null, hasSubfolders: false, subfolderCount: 0, subfolderDetails: [], totalResumeCount: 0, subfolderResumeCount: 0, loading: false });
  };

  // Helper function to convert API resume to component type
  const convertApiResume = (r: ApiResume): Resume => ({
    id: r.id,
    name: r.candidate_name || r.file_name?.replace(/\.[^/.]+$/, '') || 'Unknown',
    email: r.email || 'No email',
    phone: r.phone || 'No phone',
    title: r.current_title || 'N/A',
    experience: formatCandidateExperience(r.experience_months, r.experience_years) || 'N/A',
    education: r.education?.[0]?.degree || 'N/A',
    location: r.location || 'N/A',
    skills: r.skills || [],
    source: 'Manual',
    folderId: r.folder_id || '',
    uploadDate: r.created_at,
    attachments: r.version_count || r.version || 1,
    uploadedBy: r.uploaded_by_name || 'Unknown',
    currentCompany: r.current_company,
    previousCompany: r.previous_company,
    noticePeriod: r.notice_period,
    lastUpdated: r.updated_at,
    professionalSummary: r.professional_summary,
    technicalSkills: r.technical_skills,
    softSkills: r.soft_skills,
    educationDetails: (r.education as any[])?.map((edu: any) => ({
      degree: edu.degree || '',
      school: edu.school || edu.institution || '',
      location: edu.location || '',
      year: edu.year || edu.graduation_year || '',
      gpa: edu.gpa || '',
      honors: edu.honors || '',
    })),
    experienceDetails: (r.experience as any[])?.map((exp: any) => ({
      title: exp.title || exp.position || '',
      company: exp.company || '',
      location: exp.location || '',
      startDate: exp.start_date || '',
      endDate: exp.end_date || 'Present',
      duration: exp.duration || '',
      description: exp.description || '',
      achievements: exp.achievements || exp.responsibilities || [],
    })),
    certifications: r.certifications?.map((cert: any) => ({
      name: cert.name || cert.title || '',
      issuer: cert.issuer || cert.organization || '',
      date: cert.date || cert.issued_date || '',
      credentialId: cert.credential_id || cert.credentialId || '',
    })),
    languages: r.languages?.map((lang: any) => ({
      name: typeof lang === 'string' ? lang : (lang.name || lang.language || ''),
      proficiency: typeof lang === 'string' ? 'Fluent' : (lang.proficiency || lang.level || 'Fluent'),
    })),
    version: r.version || 1,
    versionCount: r.version_count || 1,
  });

  // Handle search change from SearchFilterBarCompact (already debounced)
  // The hook holds the typed value, debounces it into `appliedSearchQuery` and
  // resets the page; the fetch effect keyed on that value does the rest.
  const handleSearchChange = search.setQuery;

  // Client-side search helper - searches across all text fields including phone and skills
  // Server handles search, filtering, sorting, and pagination.
  // filteredResumes is now just the server-returned page of resumes.
  const filteredResumes = resumes;

  // Stats (all resumes returned are user's own resumes)
  const totalResumes = resumes.length;
  const appliedResumes = 0; // Would need job applications data
  const availableResumes = totalResumes - appliedResumes;

  /* How many server-side resume filters are narrowing the list. Skills are
     excluded because the chip row owns them, and the two range filters count
     only when a bound was actually set. Hoisted here so the list view and the
     card view agree on what "the user filtered something" means. */
  const activeResumeFilterCount = Object.entries(filters).filter(([key, value]) => {
    if (key === 'skills') return false;
    if (key === 'experienceRange') return value && ((value as any).min !== undefined || (value as any).max !== undefined);
    if (key === 'uploadDateRange') return value && ((value as any).start || (value as any).end);
    return value !== null && value !== undefined && value !== '';
  }).length;

  /* Which empty state an empty list earns. Nothing narrowing the view means the
     user genuinely has no resumes here, so they get the illustrated first-run
     state — and its Add Resume button, which on a page with no rows is the only
     upload entry point in the body. A query or filter in play makes "no matches"
     the honest answer, so the table keeps its own copy. */
  const listControlsActive = !!appliedSearchQuery.trim() || activeResumeFilterCount > 0;

  const renderNoResumesEmptyState = (folderId?: string) => {
    // The Archived Resumes folder is a dead end for uploads — resumes only
    // land there via archiving, never a direct upload — so it gets the bare
    // illustration/title with no "add a resume" copy or button.
    const isArchivedResumesFolder =
      !!folderId && folders.some(f => f.name === 'Archived Resumes' && !f.parentId && f.id === folderId);

    return (
      <NoResumesEmptyState
        description={
          isArchivedResumesFolder
            ? ''
            : canUploadMyResumes
              ? 'No resumes are available in this folder yet. Add a resume to get started.'
              : 'No resumes are available in this folder yet.'
        }
        onAction={isArchivedResumesFolder ? undefined : () => openUploadToFolder(folderId)}
        actionDisabledReason={!canUploadMyResumes ? 'You do not have permission to upload resumes' : undefined}
      />
    );
  };

  const selectedCardFolderFilterLabel = CARD_FOLDER_FILTER_OPTIONS.find(option => option.value === cardFolderFilter)?.label;
  // Active filter tags for the toolbar: the grid's Folder Filters pick (grid
  // view only — that's the only view with the control) plus one per filter the
  // Filter button's badge counts (both views — those filters narrow both).
  const gridToolbarFilterChips: FilterChip[] = [
    ...(viewMode === 'card' && cardFolderFilter !== 'all' && selectedCardFolderFilterLabel
      ? [{ key: 'folder-filter', label: 'Folder', value: selectedCardFolderFilterLabel, onRemove: () => setCardFolderFilter('all') }]
      : []),
    /* Versions dropdown: a tag like any filter, so it counts on the Filter
       badge, shows in the hover / panel tags, and Reset sets it back to
       All versions (Reset removes every tag it was handed). */
    ...(versionFilter !== 'all'
      ? [{
          key: 'version-filter',
          label: 'Versions',
          value: RESUME_VERSION_FILTER_OPTIONS.find(o => o.value === versionFilter)?.label ?? versionFilter,
          onRemove: () => { setVersionFilter('all'); setCurrentPage(1); },
        }]
      : []),
    ...getResumeFilterChips(filters, (newFilters: any) => search.setFilters(newFilters)),
  ];

  /* Upload dialog, duplicate resolution and Upload History — the shared flow
     every resume upload in the app runs through. */
  const {
    openUploadToFolder,
    openUploadHistoryModal,
    uploadHistory,
    uploadStartedThisSession,
    uploadFlowElements,
  } = useResumeUploadFlow({
    folders,
    // Pre-select whichever folder the user is currently browsing.
    // Card view uses `cardViewFolder` (drill-down navigation), list view
    // uses `selectedFolder`. Skip the synthetic 'all' value — it's a
    // filter, not a real folder the API knows about. When no folder is
    // selected, the backend routes the upload to the user's root folder.
    defaultTargetFolder: (cardViewFolder && cardViewFolder !== 'all' ? cardViewFolder : null)
      || (selectedFolder && selectedFolder !== 'all' ? selectedFolder : null)
      || undefined,
    canUpload: canUploadMyResumes,
    onCreateFolder: handleCreateFolder,
    onViewResume: (resumeId) => {
      sessionStorage.setItem('resumeNavSource', 'my-resumes');
      router.push(`/recruitment/resume-view/${resumeId}?${RESUME_VIEW_SOURCE_PARAM}=my-resumes`);
    },
    onRootFolderCreated: (folder) => setFolders(prev => [...prev, folder]),
    // Refresh the view the user is actually on, and update the pinned
    // All Resumes count separately.
    onRefresh: () => {
      fetchData(appliedSearchQuery, filters, selectedFolder, true);
      refreshAllResumesTotal();
    },
    // Optimistic update for instant UI feedback
    onResumeStored: (resume, via) => {
      if (via === 'upload') setResumes(prev => [convertApiResume(resume), ...prev]);
    },
  });

  /* `?upload=1` — the header's Quick actions → "Upload Resumes" lands here and
     opens the upload dialog straight away. The param is dropped right after,
     so a refresh or Back doesn't reopen the dialog. */
  useEffect(() => {
    if (searchParams.get('upload') !== '1') return;
    router.replace('/recruitment/resume-database?tab=my-resumes', { scroll: false });
    if (canUploadMyResumes) {
      openUploadToFolder(undefined);
    } else {
      toast.error('You do not have permission to upload resumes. Ask your admin for upload access.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per arrival with the param
  }, [searchParams]);

  /* `?upload_history=1` — an upload row in "My Activities" (the dock) opened
     from a page with no Upload History of its own: open it here. The param
     is dropped right after, like `?upload=1`. */
  useEffect(() => {
    if (searchParams.get('upload_history') !== '1') return;
    router.replace('/recruitment/resume-database?tab=my-resumes', { scroll: false });
    openUploadHistoryModal();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per arrival with the param
  }, [searchParams]);

  if (loading) {
    // Structure-matched skeleton mirroring the real My Resumes page: same
    // outer wrapper / white card, the same header block (icon box, title +
    // count chip, subtitle, the two action buttons), the search toolbar row,
    // then the shared ResumeTableSkeleton in place of the ResumeTable.
    return (
      <main className="tf-page">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="tf-page-sheet">
            {/* Breadcrumb + tab strip — rendered for real even while the list
                loads, so switching tabs stays possible and nothing shifts. */}
            {header}
            {/* Header row */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5">
              <div className="w-full sm:w-auto flex items-start gap-3">
                <Skeleton className="hidden sm:block h-9 w-9 rounded-lg flex-shrink-0" />
                <div>
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                  <Skeleton className="h-4 w-40" />
                </div>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <Skeleton className="h-9 w-32 rounded-md flex-1 sm:flex-initial" />
                <Skeleton className="h-9 w-32 rounded-md flex-1 sm:flex-initial" />
              </div>
            </div>
            {/* Search / toolbar card */}
            <div className="tf-card-soft p-3 sm:p-4 mb-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 flex-1 rounded-lg" />
                <Skeleton className="h-10 w-28 rounded-lg" />
                <Skeleton className="hidden sm:block h-10 w-20 rounded-lg" />
              </div>
            </div>
            {/* The resume table, as its own matching skeleton */}
            <ResumeTableSkeleton rows={8} />
          </div>
        </div>
      </main>
    );
  }

  /* Upload History is only actionable once THIS user has uploaded something.
     The signal is their own unfiltered resume total (`allResumesTotal` comes
     from the user-scoped `source: 'my-resumes'` list, refreshed only when no
     folder/search/filter narrows it) plus any upload started in this session.
     Deliberately NOT the batches endpoint: `/resumes/upload/batches` takes no
     owner filter, so in a shared tenant it hands a brand-new user everyone
     else's batches — which is exactly what kept this button enabled. */
  const hasUploadHistory = allResumesTotal > 0 || uploadStartedThisSession;

  return (
    <FeatureGate feature="resume_upload">
    <DndProvider backend={HTML5Backend}>
    <main ref={rootRef} className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="tf-page-sheet">
      {header}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5">
        <div className="w-full sm:w-auto min-w-0 flex items-start gap-3">
          <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex-shrink-0">
            <FileText className="h-4 w-4 text-brand-blue" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
              <h1 className="tf-page-title">My Resume Database</h1>
              <span className="tf-badge bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/15">
                {/* Standard: the whole library, never the filtered view — filters,
                    search, folder and Versions narrow the list and its pagination,
                    not this badge. */}
                {libraryResumeTotal} Resumes
                {typeof totalIncludingVersions === 'number' && totalIncludingVersions > libraryResumeTotal && (
                  <span
                    title={`${libraryResumeTotal.toLocaleString()} resumes + ${(totalIncludingVersions - libraryResumeTotal).toLocaleString()} older versions = ${totalIncludingVersions.toLocaleString()} stored (counted in Resume Storage)`}
                  >
                    {' '}(+{(totalIncludingVersions - libraryResumeTotal).toLocaleString()} {totalIncludingVersions - libraryResumeTotal === 1 ? 'version' : 'versions'})
                  </span>
                )}
              </span>
            </div>
            <p className="tf-body-secondary">Resumes uploaded by you</p>
          </div>
        </div>
        <div className="flex gap-2 w-full sm:w-auto sm:shrink-0">
          <button
            onClick={() => { if (!canViewMyResumes) return; openUploadHistoryModal(); }}
            disabled={canViewMyResumes && !hasUploadHistory}
            aria-disabled={!canViewMyResumes}
            title={!canViewMyResumes ? 'You do not have permission to view upload history' : hasUploadHistory ? 'View upload history' : 'No uploads yet'}
            className={`relative flex items-center justify-center gap-1.5 bg-white px-3 py-2 rounded-md border transition-colors text-sm whitespace-nowrap flex-1 sm:flex-initial ${
              hasUploadHistory && canViewMyResumes
                ? 'text-gray-700 border-gray-200 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue cursor-pointer'
                : 'text-gray-400 border-gray-200 opacity-60 cursor-not-allowed'
            }`}
          >
            <History className="w-4 h-4" />
            <span className="hidden sm:inline">Upload History</span>
            <span className="sm:hidden">History</span>
            {uploadHistory.filter(r => r.source === 'my-resumes' && (r.status === 'processing' || r.pending > 0)).length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-cyan/60 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-brand-cyan text-white text-2xs items-center justify-center">
                  {uploadHistory.filter(r => r.source === 'my-resumes' && (r.status === 'processing' || r.pending > 0)).length}
                </span>
              </span>
            )}
          </button>
          <button
            onClick={() => {
              if (!canUploadMyResumes) return;
              openUploadToFolder(undefined);
            }}
            aria-disabled={!canUploadMyResumes}
            title={!canUploadMyResumes ? 'You do not have permission to upload resumes' : undefined}
            className={`flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 rounded-md transition-all text-sm whitespace-nowrap flex-1 sm:flex-initial shadow-sm ring-1 ${
              canUploadMyResumes
                ? 'bg-brand-blue hover:bg-brand-blue-2 text-white shadow-brand-blue/25 ring-white/10 hover:shadow-md hover:shadow-brand-blue/30 cursor-pointer'
                : 'bg-gray-200 text-gray-400 shadow-none ring-transparent cursor-not-allowed opacity-60'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Upload Resume</span>
            <span className="sm:hidden">Upload</span>
          </button>
        </div>
      </div>

      {/* No frame of its own: this wraps the page's whole list inside the white
          page panel, so a border/ring/shadow here was a card-in-panel double
          frame and pushed every control 13px in from the panel's 16/32px
          content inset. Still no overflow-hidden — that would make it a scroll
          container the sticky search bar below would pin to. */}
      <div className="bg-white">
        {/* Bulk Actions Bar - Shows at TOP when resumes selected */}
        {selectedResumes.length > 0 && (() => {
          // Detect the Archived Resumes folder context — when active, the
          // recruiter is looking at archived resumes, so swap Archive → Unarchive
          // and hide Apply-to-Job / Assessment / AI Talent Match (those actions
          // shouldn't apply to retired records).
          const archivedFolder = folders.find(f => f.name === 'Archived Resumes' && !f.parentId);
          const isArchivedContext =
            !!archivedFolder &&
            (selectedFolder === archivedFolder.id ||
              selectedResumes.every(id => rowById(id)?.isArchived));
          return (
          <BulkActionsBar
            selectedCount={selectedResumes.length}
            onCancel={() => setSelectedResumes([])}
            onMoveToFolder={(folderId) => handleMoveToFolder(selectedResumes, folderId)}
            onMoveToFolderDisabled={!canMoveMyResumes}
            onMoveToFolderDisabledReason="You do not have permission to move resumes to a folder"
            onApplyToJob={!isArchivedContext ? handleApplyToJob : undefined}
            onApplyToJobDisabled={isPlanLocked('resume_scoring') || !(isTenantAdmin || (hasPermission('canRunScoring') && hasPermissionCode('my_resumes:score')))}
            onApplyToJobDisabledReason={!(isTenantAdmin || (hasPermission('canRunScoring') && hasPermissionCode('my_resumes:score'))) ? "You do not have permission to score resumes" : PLAN_LOCKED_MESSAGE}
            onDownload={handleBulkDownload}
            // Own uploads: downloading needs Resume Upload access (lib/permissions/resumeDownload.ts).
            onDownloadDisabled={!canDownloadMyResumes}
            onDownloadDisabledReason={DOWNLOAD_BLOCKED_MESSAGE}
            onDelete={() => handleDeleteResumes(selectedResumes)}
            onDeleteDisabled={!canDeleteMyResumes}
            onDeleteDisabledReason={RESUME_DELETE_OWNER_ONLY_REASON}
            folders={folders.filter(f => f.id !== 'all')}
            onAssessment={!isArchivedContext ? handleAssessment : undefined}
            onAssessmentDisabled={isPlanLocked('assessment') || !(isTenantAdmin || (hasPermission('canCreateAssessments') && hasPermissionCode('my_resumes:assessment')))}
            onAssessmentDisabledReason={!(isTenantAdmin || (hasPermission('canCreateAssessments') && hasPermissionCode('my_resumes:assessment'))) ? "You do not have permission to invite candidates to an assessment" : PLAN_LOCKED_MESSAGE}
            onArchive={!isArchivedContext ? () => setIsArchiveModalOpen(true) : undefined}
            onArchiveDisabled={!canArchiveMyResumes}
            onArchiveDisabledReason="You do not have permission to archive resumes"
            onUnarchive={isArchivedContext ? () => handleUnarchiveResumes(selectedResumes) : undefined}
            onUnarchiveDisabled={!canArchiveMyResumes}
            onUnarchiveDisabledReason="You do not have permission to unarchive resumes"
            // No `my_resumes:ai_interview` action code exists yet, so this
            // follows the AI Interviews module's own share permission.
            onAIInterview={!isArchivedContext ? handleAIInterview : undefined}
            onAIInterviewDisabled={isPlanLocked('ai_interview') || !(isTenantAdmin || (hasPermission('canInviteAIInterviews') && hasPermissionCode('my_resumes:invite_ai_interview')))}
            onAIInterviewDisabledReason={!(isTenantAdmin || (hasPermission('canInviteAIInterviews') && hasPermissionCode('my_resumes:invite_ai_interview'))) ? "You do not have permission to invite candidates to an AI interview" : PLAN_LOCKED_MESSAGE}
          />
          );
        })()}

        {/* Search pinned to the top of the scroll viewport so it stays reachable
            while the list scrolls beneath it. Opaque bg so rows don't show
            through; z above the rows. Offset by --crumb-h (set by the page) so
            it pins just below the sticky breadcrumb instead of under it. */}
        <div className="sticky top-[var(--crumb-h,0px)] z-20 border-b border-gray-200 bg-white py-3">
          <div className="flex flex-col gap-2">
            {/* Phones / tablets: search · Filter · Sort · List / Grid share line 1, as the
                Job Openings toolbar (the buttons drop under the search only below
                ~360px); Folder Filters takes its own line under them. */}
            <div className="flex flex-wrap items-start gap-2 xl:flex-nowrap">
              <div className="min-w-[6.5rem] flex-1 basis-0">
                <UnifiedFolderResumeSearch
                  query={searchQuery}
                  onQueryChange={handleSearchChange}
                  onClear={() => handleSearchChange('')}
                  folders={folders}
                  resumes={resumes}
                  isLoading={loading || isPaginating}
                  onSelectFolder={(folderId) => {
                    if (viewMode === 'card') {
                      navigateToFolder(folderId);
                    } else {
                      setSelectedFolder(folderId);
                      setCurrentPage(1);
                    }
                  }}
                  onSelectResume={(resume) => {
                    sessionStorage.setItem('resumeNavList', JSON.stringify(resumes.map((r) => r.id)));
                    sessionStorage.setItem('resumeNavSource', 'my-resumes');
                    router.push(`/recruitment/resume-view/${resume.id}?${RESUME_VIEW_SOURCE_PARAM}=my-resumes`);
                  }}
                />
              </div>

              {/* Versions — right after the search box: all resumes, only those
                  re-uploaded (v2+), or only first uploads. */}
              <div className="w-full sm:w-auto xl:w-auto">
                <ToolbarFilterSelect<ResumeVersionFilter>
                  label="Versions"
                  value={versionFilter}
                  options={RESUME_VERSION_FILTER_OPTIONS}
                  onChange={(v) => { setVersionFilter(v); setCurrentPage(1); }}
                  icon={<Layers className="h-4 w-4" />}
                />
              </div>

              {/* Folders only. The resume filter that sat beside it is gone —
                  the search box and the Filter panel already narrow resumes. */}
              {viewMode === 'card' && (
                <div className="order-last xl:order-none grid w-full grid-cols-1 gap-2 xl:w-auto xl:min-w-[190px]">
                  <ToolbarFilterSelect<CardFolderFilter>
                    label="Folder Filters"
                    value={cardFolderFilter}
                    options={CARD_FOLDER_FILTER_OPTIONS}
                    onChange={setCardFolderFilter}
                    icon={<Folder className="h-4 w-4" />}
                  />
                </div>
              )}

              <div className="flex flex-nowrap items-start gap-2 xl:w-auto">
                <SearchFilterBarCompact
                  searchQuery={searchQuery}
                  onSearchChange={handleSearchChange}
                  filters={filters}
                  onFiltersChange={(newFilters: any) => search.setFilters(newFilters)}
                  sortBy={sortBy}
                  onSortChange={(newSort: string) => { setSortBy(newSort); setCurrentPage(1); }}
                  hideSearch
                  inline
                  showClearAllFilters={false}
                  // Folder pick + the bar's own filters: a popup on hovering
                  // Filter (laptop / desktop), the panel's last line below lg.
                  filterChips={gridToolbarFilterChips}
                />

                {/* No "View" label: the two icons carry their own tooltips and
                    the picked one is already lit. */}
                <div className="flex h-10 items-center justify-center gap-1 rounded-lg bg-brand-blue/5 px-1.5 ring-1 ring-brand-blue/10">
                  <IconButton bare label="List View"
                    type="button"
                    onClick={() => setViewMode('list')}
                    className={`rounded p-2 transition-all ${
                      viewMode === 'list'
                        ? 'bg-white text-brand-blue shadow-sm shadow-brand-blue/10'
                        : 'text-gray-600 hover:text-brand-blue'
                    }`}
                  >
                    <List className="h-4 w-4" />
                  </IconButton>
                  <IconButton bare label="Grid View"
                    type="button"
                    onClick={() => setViewMode('card')}
                    className={`rounded p-2 transition-all ${
                      viewMode === 'card'
                        ? 'bg-white text-brand-blue shadow-sm shadow-brand-blue/10'
                        : 'text-gray-600 hover:text-brand-blue'
                    }`}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Search Results Summary */}
        {viewMode === 'list' && appliedSearchQuery && (
          <div className="px-3 sm:px-4 py-2 sm:py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-gray-500" />
              <span className="tf-body">
                Found <span className="font-semibold">{totalItems}</span> matching resume{totalItems !== 1 ? 's' : ''}
                {appliedSearchQuery && (
                  <span> for "<span className="font-medium text-brand-blue">{appliedSearchQuery}</span>"</span>
                )}
              </span>
            </div>
            <button
              // One reset for the query and every filter — `onChange` returns
              // to page 1.
              onClick={search.reset}
              className="text-sm text-red-600 hover:text-red-700 hover:underline"
            >
              Clear search
            </button>
          </div>
        )}

        {viewMode === 'list' ? (
          // List View with Folder Tree
          <>
          <div className="flex flex-col md:flex-row">
            <FolderTree
              folders={folders}
              selectedFolder={selectedFolder}
              onSelectFolder={(folderId: string) => { setSelectedFolder(folderId); setCurrentPage(1); }}
              onCreateFolder={handleCreateFolder}
              canCreateFolder={canUploadMyResumes}
              onRenameFolder={handleRenameFolder}
              canRenameFolder={canUpdateMyResumes}
              onDeleteFolder={handleDeleteFolder}
              canDeleteFolder={canDeleteMyResumes}
              canUploadToFolder={canUploadMyResumes}
              onUploadToFolder={(folderId) => {
                if (!canUploadMyResumes) return;
                setSelectedFolder(folderId);
                openUploadToFolder(folderId, true);
              }}
              onMoveToFolder={canMoveMyResumes ? handleMoveToFolder : undefined}
              selectedResumes={selectedResumes}
              resumes={resumes}
              width={folderTreeWidth}
              onWidthChange={setFolderTreeWidth}
              collapsible
              flushStart
            />

            <div className="flex-1 flex flex-col min-w-0">
              {/* Breadcrumb Navigation for List View */}
              {selectedFolder && selectedFolder !== 'all' && (
                /* flex-wrap + min-w-0: a nested path of long folder names
                   wraps onto more lines on a phone instead of running off
                   the card. */
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 bg-gray-50 border-b border-gray-200 text-sm">
                  <button
                    onClick={() => setSelectedFolder('all')}
                    className="flex shrink-0 items-center gap-1 whitespace-nowrap text-brand-blue hover:text-brand-blue-2 hover:underline transition-colors"
                  >
                    <LayoutGrid className="w-4 h-4" />
                    <span>All Resumes</span>
                  </button>
                  {buildBreadcrumbPath(selectedFolder).map((item, index, arr) => (
                    <div key={item.id} className="flex min-w-0 items-center gap-2 [overflow-wrap:anywhere]">
                      <ChevronRight className="w-4 h-4 shrink-0 text-gray-500" />
                      {index === arr.length - 1 ? (
                        <span className="text-gray-900 font-medium">{item.name}</span>
                      ) : (
                        <button
                          onClick={() => setSelectedFolder(item.id)}
                          className="text-left text-brand-blue hover:text-brand-blue-2 hover:underline transition-colors"
                        >
                          {item.name}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Pagination overlay for lighter page transitions */}
              <div className="relative">
                {isPaginating && (
                  <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
                  </div>
                )}
                <ResumeTable
                  flushCards
                  /* Tablets: the table beside the folder sidebar, as on laptop — the
                     tall phone cards stretched the sidebar into empty space. */
                  tableFrom="md"
                  showTeamMemberBadge
                  resumes={filteredResumes}
                  selectedResumes={selectedResumes}
                  onSelectResume={handleSelectResume}
                  onSelectAll={handleSelectAll}
                  onQuickView={(resume) => setQuickViewResume(resume)}
                  onApplyToJob={handleSingleResumeApplyToJob}
                  onApplyToJobDisabled={isPlanLocked('resume_scoring') || !(isTenantAdmin || (hasPermission('canRunScoring') && hasPermissionCode('my_resumes:score')))}
                  onApplyToJobDisabledReason={!(isTenantAdmin || (hasPermission('canRunScoring') && hasPermissionCode('my_resumes:score'))) ? "You do not have permission to score resumes" : PLAN_LOCKED_MESSAGE}
                  onDelete={(id) => handleDelete(id)}
                  onDeleteDisabled={!canDeleteMyResumes}
                  canDownload={canDownloadMyResumes}
                  onDeleteDisabledReason={RESUME_DELETE_OWNER_ONLY_REASON}
                  onMoveToFolder={canMoveMyResumes ? handleMoveToFolder : undefined}
                  folders={folders.filter(f => f.id !== 'all' && !(f.name.toLowerCase() === 'root' && !f.parentId))}
                  onViewDetails={(resume) => {
                    sessionStorage.setItem('resumeNavList', JSON.stringify(filteredResumes.map((r) => r.id)));
                    sessionStorage.setItem('resumeNavSource', 'my-resumes');
                    router.push(`/recruitment/resume-view/${resume.id}?${RESUME_VIEW_SOURCE_PARAM}=my-resumes`);
                  }}
                  highlightQuery={appliedSearchQuery}
                  /* Rows can be dragged into an order of your own, kept per
                     folder — the grip still drops onto a folder to move a
                     resume, and now drops onto a row to place it. */
                  enableRowReorder
                  reorderScopeKey={selectedFolder || 'all'}
                  onArchive={(resumeId) => handleArchiveResumes([resumeId])}
                  onArchiveDisabled={!canArchiveMyResumes}
                  onArchiveDisabledReason="You do not have permission to archive resumes"
                  onUnarchive={(resumeId) => handleUnarchiveResumes([resumeId])}
                  onUnarchiveDisabled={!canArchiveMyResumes}
                  onUnarchiveDisabledReason="You do not have permission to unarchive resumes"
                  canShare={canShareMyResumes}
                  disablePagination={true}
                  isArchivedFolder={
                    folders.some(f => f.name === 'Archived Resumes' && !f.parentId && f.id === loadedFolderId)
                  }
                  archivedFolderId={folders.find(f => f.name === 'Archived Resumes' && !f.parentId)?.id}
                  /* All Resumes aggregates every folder, so each row names the
                     one folder it actually lives in. Inside a folder the column
                     would repeat that folder on every row, so it is dropped. */
                  getFolderName={selectedFolder === 'all' ? getResumeFolderName : undefined}
                  emptyState={
                    listControlsActive
                      ? undefined
                      : renderNoResumesEmptyState(selectedFolder === 'all' ? undefined : selectedFolder)
                  }
                />
              </div>
            </div>
          </div>
          {/* The Job Descriptions pager: its own card under the folder +
              table row (not pinned to the bottom of the table column, which
              stretched to the folder panel's height and left a gap under the
              last row). Page sizes stay this list's 10 / 25 / 50 / 100. */}
          <ListPagination
            currentPage={currentPage}
            itemsPerPage={itemsPerPage}
            totalItems={totalItems}
            onPageChange={(page) => { setCurrentPage(page); setIsPaginating(true); }}
            onItemsPerPageChange={(size) => { setItemsPerPage(size); setCurrentPage(1); setIsPaginating(true); }}
            itemLabel="resumes"
            pageSizeOptions={RESUME_PAGE_SIZE_OPTIONS}
          />
          </>
        ) : (
          // Card View - Folders as Cards with Breadcrumb Navigation
          <div className="py-4 md:py-6" data-folder-card-boundary>
            {(() => {
              // Get current folder data and children
              const currentFolderData = cardViewFolder ? getFolderById(cardViewFolder) : null;
              const folderName = currentFolderData?.name || 'All Folders';
              const currentFolderDepth = cardViewFolder && cardViewFolder !== 'all' ? getFolderDepth(cardViewFolder) : 0;
              const currentFolderCanCreateSubfolder =
                cardViewFolder !== null &&
                cardViewFolder !== 'all' &&
                canCreateNestedFolder(cardViewFolder) &&
                !(currentFolderData?.name === 'Archived Resumes' && !currentFolderData?.parentId);

              // Get folders to display (top-level or children of current folder)
              const foldersToDisplay = cardViewFolder === null
                ? folders.filter(f => f.id !== 'all' && !f.parentId) // Top-level folders
                : cardViewFolder === 'all'
                  ? [] // No subfolders in All Resumes view
                  : currentFolderData?.children || []; // Children of current folder

              // Get resumes for current folder (only direct resumes, not nested)
              const folderResumes = cardViewFolder === null
                ? [] // No resumes at root level view
                : cardViewFolder === 'all'
                  ? filteredResumes // Show all resumes
                  : filteredResumes.filter(r => r.folderId === cardViewFolder);

              // Group resumes by folder for counts (only needed at root level)
              const resumesByFolder = new Map<string, Resume[]>();
              if (cardViewFolder === null) {
                filteredResumes.forEach(resume => {
                  if (resume.folderId) {
                    const existing = resumesByFolder.get(resume.folderId) || [];
                    resumesByFolder.set(resume.folderId, [...existing, resume]);
                  }
                });
              }

              // The fixtures, split out of the folder list so the root view can
              // lead with them — same grouping the list view's folder tree uses.
              // Root belongs to this group by placement only: its card is drawn
              // like any other folder's (see renderFolderCard).
              const isSystemFolder = (f: FolderType) =>
                !f.parentId && (f.name.toLowerCase() === 'root' || f.name === 'Archived Resumes');
              const systemRank = (f: FolderType) => (f.name.toLowerCase() === 'root' ? 0 : 1);
              const systemFolders = foldersToDisplay
                .filter(isSystemFolder)
                .sort((a, b) => systemRank(a) - systemRank(b));
              const myFolders = foldersToDisplay.filter(f => !isSystemFolder(f));
              const folderSearchTerm = searchQuery.trim().toLowerCase();
              const folderControlsActive = !!folderSearchTerm || cardFolderFilter !== 'all';

              const folderMatchesGridControls = (folder: FolderType) => {
                const matchesSearch = !folderSearchTerm || folder.name.toLowerCase().includes(folderSearchTerm);
                if (!matchesSearch) return false;

                const folderResumeCount = folder.count || 0;
                const folderSubfolderCount = folder.children?.length || 0;
                switch (cardFolderFilter) {
                  case 'with-resumes':
                    return folderResumeCount > 0;
                  case 'empty':
                    return folderResumeCount === 0 && folderSubfolderCount === 0;
                  case 'with-subfolders':
                    return folderSubfolderCount > 0;
                  default:
                    return true;
                }
              };

              const allResumesCardFolder: FolderType = { id: 'all', name: 'All Resumes', count: totalItems };
              const showAllResumesCard = cardViewFolder === null && folderMatchesGridControls(allResumesCardFolder);
              const visibleSystemFolders = systemFolders.filter(folderMatchesGridControls);
              const visibleMyFolders = myFolders.filter(folderMatchesGridControls);
              const visibleFoldersToDisplay = foldersToDisplay.filter(folderMatchesGridControls);
              const hasCurrentSubfolders = foldersToDisplay.length > 0;
              const hasVisibleRootFolders = showAllResumesCard || visibleSystemFolders.length > 0 || visibleMyFolders.length > 0;
              const showRootFolderNoMatches =
                cardViewFolder === null &&
                foldersToDisplay.length > 0 &&
                folderControlsActive &&
                !hasVisibleRootFolders;

              const visibleFolderResumes = folderResumes;
              const resumeControlsActive = !!searchQuery.trim() || activeResumeFilterCount > 0;
              /* `stretch` is for the fixtures row only, where the three cards
                 must match height. The user's own folder grids must NOT use it:
                 those cells grow when a card expands its subfolder list or
                 opens the inline name input, and a stretched row would drag
                 every neighbour to that height. */
              const renderFolderCard = (folder: FolderType, stretch = false) => {
                const isArchivedFolder = folder.name === 'Archived Resumes' && !folder.parentId;
                const isRootFolder = folder.name.toLowerCase() === 'root' && !folder.parentId;
                const isSystemCard = isArchivedFolder || isRootFolder;

                return (
                  <div key={folder.id} className={`space-y-2 ${stretch ? 'h-full' : ''}`}>
                    <DroppableFolderCard
                      folder={folder}
                      // Use folder.count from the API (total) rather than recounting
                      // the current page of resumes.
                      resumeCount={folder.count || 0}
                      hasSubfolders={(folder.children && folder.children.length > 0) || false}
                      isArchived={isArchivedFolder}
                      isRoot={isRootFolder}
                      // Root and Archived Resumes offer nothing renameable or
                      // deletable, so their cards drop the hover "+".
                      hideActions={isSystemCard}
                      stretch={stretch}
                      canUpload={canUploadMyResumes}
                      canCreateSubfolder={canUploadMyResumes && canCreateNestedFolder(folder.id)}
                      canRename={canUpdateMyResumes && !isSystemCard}
                      canDelete={canDeleteMyResumes && !isSystemCard}
                      onNavigate={navigateToFolder}
                      onMoveToFolder={handleMoveToFolder}
                      onUploadToFolder={openUploadToFolder}
                      onCreateSubfolder={openCardFolderInput}
                      onStartRename={openCardFolderRename}
                      onDeleteFolder={handleDeleteFolder}
                    />

                    {cardFolderParentId === folder.id && canCreateNestedFolder(folder.id) && (
                      <CardFolderNameInput
                        value={cardNewFolderName}
                        onChange={setCardNewFolderName}
                        onSubmit={submitCardFolder}
                        onCancel={closeCardFolderInput}
                        placeholder="Sub-folder name..."
                      />
                    )}

                    {cardRenamingFolderId === folder.id && (
                      <CardFolderNameInput
                        value={cardRenameValue}
                        onChange={setCardRenameValue}
                        onSubmit={() => submitCardFolderRename(folder.id)}
                        onCancel={closeCardFolderRename}
                        placeholder="Folder name..."
                        submitLabel="Save"
                      />
                    )}
                  </div>
                );
              };

              // Count resumes in a folder (including nested subfolders)
              const getResumeCountRecursive = (folder: FolderType): number => {
                let count = filteredResumes.filter(r => r.folderId === folder.id).length;
                if (folder.children) {
                  folder.children.forEach(child => {
                    count += getResumeCountRecursive(child);
                  });
                }
                return count;
              };

              return (
                <>
                  {/* Breadcrumb Navigation */}
                  {(cardViewFolder !== null || breadcrumbPath.length > 0) && (
                    <div className="flex flex-wrap items-center gap-1 sm:gap-2 mb-4 sm:mb-6 text-sm">
                      <button
                        onClick={() => navigateToFolder(null)}
                        className="flex items-center gap-1 text-brand-blue hover:text-brand-blue-2 hover:underline transition-colors"
                      >
                        <LayoutGrid className="w-4 h-4" />
                        <span>All Folders</span>
                      </button>
                      {breadcrumbPath.map((item, index) => (
                        <div key={item.id} className="flex items-center gap-2">
                          <ChevronRight className="w-4 h-4 text-gray-500" />
                          {index === breadcrumbPath.length - 1 ? (
                            <span className="text-gray-900 font-medium">{item.name}</span>
                          ) : (
                            <button
                              onClick={() => navigateToFolder(item.id)}
                              className="text-brand-blue hover:text-brand-blue-2 hover:underline transition-colors"
                            >
                              {item.name}
                            </button>
                          )}
                        </div>
                      ))}
                      {cardViewFolder === 'all' && (
                        <>
                          <ChevronRight className="w-4 h-4 text-gray-500" />
                          <span className="text-gray-900 font-medium">All Resumes</span>
                        </>
                      )}
                    </div>
                  )}

                  {/* Current Folder Header (when inside a folder) */}
                  {cardViewFolder !== null && cardViewFolder !== 'all' && currentFolderData && (
                    <div className="relative mb-4 sm:mb-6">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                      <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center flex-shrink-0 ring-1 ${
                        currentFolderData.name === 'Archived Resumes' && !currentFolderData.parentId
                          ? 'bg-amber-100 ring-amber-200/60'
                          : currentFolderData.name.toLowerCase() === 'root' && !currentFolderData.parentId
                            ? 'bg-brand-cyan/10 ring-brand-cyan/15'
                            : 'bg-brand-orange/10 ring-brand-orange/15'
                      }`}>
                        {currentFolderData.name === 'Archived Resumes' && !currentFolderData.parentId ? (
                          <Archive className="w-5 h-5 sm:w-6 sm:h-6 text-amber-600" />
                        ) : (
                          <FolderOpen className={`w-5 h-5 sm:w-6 sm:h-6 ${
                            currentFolderData.name.toLowerCase() === 'root' && !currentFolderData.parentId
                              ? 'text-brand-cyan'
                              : 'text-brand-orange'
                          }`} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 className="tf-section-title sm:text-lg truncate">
                          {currentFolderData.name.toLowerCase() === 'root' && !currentFolderData.parentId
                            ? 'Root (Default)'
                            : currentFolderData.name}
                        </h2>
                        <p className="tf-body-muted">
                          {foldersToDisplay.length > 0 && `${foldersToDisplay.length} subfolder${foldersToDisplay.length !== 1 ? 's' : ''}`}
                          {foldersToDisplay.length > 0 && visibleFolderResumes.length > 0 && ' • '}
                          {visibleFolderResumes.length > 0 && `${visibleFolderResumes.length} resume${visibleFolderResumes.length !== 1 ? 's' : ''}`}
                          {foldersToDisplay.length === 0 && visibleFolderResumes.length === 0 && !resumeControlsActive && 'Empty folder'}
                          {folderResumes.length > 0 && visibleFolderResumes.length === 0 && resumeControlsActive && 'No matching resumes'}
                        </p>
                      </div>
                        </div>
                        {currentFolderCanCreateSubfolder ? (
                          <button
                            type="button"
                            onClick={() => { if (!canUploadMyResumes) return; openCardFolderInput(cardViewFolder); }}
                            aria-disabled={!canUploadMyResumes}
                            title={!canUploadMyResumes ? 'You do not have permission to create folders' : undefined}
                            className={`inline-flex items-center justify-center gap-1 rounded-md border bg-white px-3 py-2 text-sm shadow-sm shadow-brand-blue/5 transition-colors sm:self-start ${
                              canUploadMyResumes
                                ? 'border-brand-blue/20 text-blue-600 hover:border-brand-blue/40 hover:bg-brand-blue/5 hover:text-blue-700'
                                : 'border-gray-200 text-gray-400 cursor-not-allowed opacity-60'
                            }`}
                          >
                            <Plus className="w-4 h-4" />
                            New Subfolder
                          </button>
                        ) : currentFolderDepth >= MAX_FOLDER_DEPTH ? (
                          <span className="tf-body-muted sm:self-start">
                            Maximum depth reached ({MAX_FOLDER_DEPTH} levels)
                          </span>
                        ) : null}
                      </div>

                      {cardFolderParentId === cardViewFolder && currentFolderCanCreateSubfolder && (
                        <CardFolderNameInput
                          value={cardNewFolderName}
                          onChange={setCardNewFolderName}
                          onSubmit={submitCardFolder}
                          onCancel={closeCardFolderInput}
                          placeholder="Sub-folder name..."
                          inline
                        />
                      )}
                    </div>
                  )}

                  {/* All Resumes Header */}
                  {cardViewFolder === 'all' && (
                    <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg flex items-center justify-center flex-shrink-0">
                        <LayoutGrid className="w-5 h-5 sm:w-6 sm:h-6 text-brand-blue" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="tf-section-title sm:text-lg">All Resumes</h2>
                        <p className="tf-body-muted">{visibleFolderResumes.length} resume{visibleFolderResumes.length !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                  )}

                  {/* Folder grids. At root level the three fixtures lead in
                      their own titled row, then the user's own folders below —
                      matching how the list view's tree is grouped. Inside a
                      folder it stays a single "Subfolders" grid. */}
                  {/* Rendered whenever there is folder context to show. At max
                      depth, the create control is replaced by a status note. */}
                  {(cardViewFolder !== 'all' || foldersToDisplay.length > 0) && (
                    <div className="mb-4 sm:mb-6">
                      {cardViewFolder === null ? (
                        showRootFolderNoMatches ? (
                          <NoFoldersMatchState />
                        ) : (
                          <>
                          {(showAllResumesCard || visibleSystemFolders.length > 0) && (
                            <>
                              {/* Same treatment as the list view's folder panel:
                                  inherited 16px / normal weight, gray-900. */}
                              <h3 className="text-gray-900 mb-2 sm:mb-3">System Folders</h3>
                              {/* Three across from sm up, so All Resumes, root and
                                  Archived Resumes sit on one row. `items-stretch`
                                  + `h-full` gives the three the same height; the
                                  All Resumes card mirrors the folder cards' own
                                  markup (p-3, 36px icon tile, text-sm title) so
                                  they match to the pixel rather than roughly. */}
                              {/* 2-up below lg: three across a tablet truncated "Root (Default)" / "Archived Resumes" to a few letters. */}
                              <div className="tf-grid-3 mb-4 sm:mb-6 items-stretch">
                                {showAllResumesCard && (
                                  <div {...clickableProps}
                                    className="h-full bg-white border border-brand-blue/20 ring-1 ring-black/[0.02] rounded-xl shadow-sm shadow-brand-blue/5 overflow-hidden cursor-pointer hover:shadow-md hover:shadow-brand-blue/10 hover:border-brand-blue/40 hover:-translate-y-0.5 transition-all duration-150"
                                    onClick={() => {
                                      setCardViewFolder('all');
                                      setBreadcrumbPath([]);
                                    }}
                                  >
                                    <div className="flex h-full items-center gap-3 p-3">
                                      <div className="w-9 h-9 bg-[var(--raw-155dfc)]/10 ring-1 ring-[var(--raw-155dfc)]/15 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <LayoutGrid className="w-4 h-4 text-[var(--raw-155dfc)]" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <h3 className="tf-row-title truncate">All Resumes</h3>
                                        <p className="tf-meta">{totalItems} resume{totalItems !== 1 ? 's' : ''}</p>
                                      </div>
                                      <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
                                    </div>
                                  </div>
                                )}

                                {/* Wrapped, not passed by reference: `.map`
                                    would hand the array index in as `stretch`. */}
                                {visibleSystemFolders.map(folder => renderFolderCard(folder, true))}
                              </div>
                            </>
                          )}

                          <div className="flex items-center justify-between mb-2 sm:mb-3">
                            <h3 className="text-gray-900">My Folders</h3>
                            <button
                              type="button"
                              onClick={() => {
                                if (!canUploadMyResumes) return;
                                openCardFolderInput(null);
                              }}
                              aria-disabled={!canUploadMyResumes}
                              title={!canUploadMyResumes ? 'You do not have permission to upload resumes' : undefined}
                              className={`text-sm flex items-center gap-1 ${
                                canUploadMyResumes
                                  ? 'text-blue-600 hover:text-blue-700 cursor-pointer'
                                  : 'text-gray-400 cursor-not-allowed opacity-60'
                              }`}
                            >
                              <Plus className="w-4 h-4" />
                              New Folder
                            </button>
                          </div>

                          {cardFolderParentId === null && (
                            <CardFolderNameInput
                              value={cardNewFolderName}
                              onChange={setCardNewFolderName}
                              onSubmit={submitCardFolder}
                              onCancel={closeCardFolderInput}
                              placeholder="Folder name..."
                            />
                          )}

                          {visibleMyFolders.length > 0 ? (
                            // `items-start` so a card that expands its subfolder
                            // list grows on its own instead of stretching every
                            // other card in the row to match — grid items default
                            // to filling the row height, which left the
                            // neighbours padded with blank space.
                            <div className="tf-grid-3 items-start">
                              {visibleMyFolders.map(folder => renderFolderCard(folder))}
                            </div>
                          ) : myFolders.length > 0 && folderControlsActive ? (
                            <NoFoldersMatchState />
                          ) : systemFolders.length > 0 ? (
                            // Skipped when there are no folders at all — the
                            // page-level empty state below covers that case.
                            <NoFoldersState />
                          ) : null}
                          </>
                        )
                      ) : (
                        <>
                          {hasCurrentSubfolders && (
                            <div className="flex items-center mb-2 sm:mb-3">
                              <h3 className="tf-label">Subfolders</h3>
                            </div>
                          )}

                          {cardViewFolder !== 'all' && currentFolderDepth >= MAX_FOLDER_DEPTH && (
                            <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                              This child subfolder is the deepest allowed level.
                            </div>
                          )}

                          {visibleFoldersToDisplay.length > 0 && (
                            <div className="tf-grid-3 items-start">
                              {visibleFoldersToDisplay.map(folder => renderFolderCard(folder))}
                            </div>
                          )}
                          {foldersToDisplay.length > 0 && visibleFoldersToDisplay.length === 0 && folderControlsActive && (
                            <p className="mt-3 tf-body-muted">No subfolders match the current search or filter.</p>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Loading state at root level (folders/resumes not yet fetched).
                      Skeleton mirrors the folder-card grid below: same grid
                      classes, six cards each shaped like DroppableFolderCard
                      (icon box + name line + count line + action dot). */}
                  {loading && cardViewFolder === null && foldersToDisplay.length === 0 && (
                    <div className="tf-grid-3 items-start">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div
                          key={i}
                          className="tf-card-soft"
                        >
                          <div className="flex items-center gap-3 p-3">
                            <Skeleton className="w-9 h-9 rounded-lg flex-shrink-0" />
                            <div className="flex-1 min-w-0 space-y-2">
                              <Skeleton className="h-4 w-2/3" />
                              <Skeleton className="h-3 w-1/3" />
                            </div>
                            <Skeleton className="h-7 w-7 rounded-md flex-shrink-0" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Empty state for root level */}
                  {!loading && cardViewFolder === null && foldersToDisplay.length === 0 && (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 mx-auto mb-4 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-full flex items-center justify-center">
                        <Folder className="w-8 h-8 text-brand-blue" />
                      </div>
                      <h3 className="text-lg font-medium text-gray-900 mb-2 tracking-tight">No folders found</h3>
                      <p className="text-gray-500">Create folders to organize your resumes</p>
                    </div>
                  )}

                  {/* Resumes Section (when inside a folder) */}
                  {cardViewFolder !== null && (
                    <>
                      {visibleFolderResumes.length > 0 && (
                        <div>
                          {foldersToDisplay.length > 0 && (
                            <h3 className="tf-label mb-3">Resumes in this folder</h3>
                          )}
                          {/* The list view's table, not a copy of it: one
                              component means the two views cannot drift, and a
                              folder, a subfolder and a child subfolder all get
                              the same rows, pinned columns, sticky header,
                              actions and reordering.

                              The card that frames it is this view's own — the
                              list view sits inside the folder-tree panel and
                              borrows its border, but here the table stands on
                              the page beside the folder cards and needs one. */}
                          {/* gray-200, not gray-100: the table's own rules are
                              gray-200, so a lighter frame read as three sides
                              and a missing bottom — the top and flanks were the
                              table's separators showing through, not the card. */}
                          {/* Framed from md only: on a phone the rows are already cards, and a frame round them was card-in-card. */}
                          <div className="bg-white md:border md:border-gray-200 md:ring-1 md:ring-black/[0.02] md:shadow-sm md:shadow-brand-blue/5 md:rounded-xl md:overflow-hidden">
                          <ResumeTable
                            flushCards
                            showTeamMemberBadge
                            resumes={visibleFolderResumes}
                            selectedResumes={selectedResumes}
                            onSelectResume={handleSelectResume}
                            onSelectAll={(selected) => {
                              // Scoped to this folder's rows, not the whole list.
                              // Resumes locked out for a team-member email never
                              // enter a "select all".
                              const selectableFolderIds = visibleFolderResumes
                                .filter(r => !(r.is_tenant_user_email || r.isTenantUserEmail))
                                .map(r => r.id);
                              if (selected) {
                                setSelectedResumes(prev => [...new Set([...prev, ...selectableFolderIds])]);
                              } else {
                                setSelectedResumes(prev => prev.filter(id => !selectableFolderIds.includes(id)));
                              }
                            }}
                            onQuickView={(resume) => setQuickViewResume(resume)}
                            onApplyToJob={handleSingleResumeApplyToJob}
                            onApplyToJobDisabled={isPlanLocked('resume_scoring') || !(isTenantAdmin || (hasPermission('canRunScoring') && hasPermissionCode('my_resumes:score')))}
                            onApplyToJobDisabledReason={!(isTenantAdmin || (hasPermission('canRunScoring') && hasPermissionCode('my_resumes:score'))) ? "You do not have permission to score resumes" : PLAN_LOCKED_MESSAGE}
                            onDelete={(id) => handleDelete(id)}
                            onDeleteDisabled={!canDeleteMyResumes}
                            onDeleteDisabledReason={RESUME_DELETE_OWNER_ONLY_REASON}
                            onMoveToFolder={canMoveMyResumes ? handleMoveToFolder : undefined}
                            folders={folders.filter(f => f.id !== 'all' && !(f.name.toLowerCase() === 'root' && !f.parentId))}
                            onViewDetails={(resume) => {
                              sessionStorage.setItem('resumeNavList', JSON.stringify(visibleFolderResumes.map((x) => x.id)));
                              sessionStorage.setItem('resumeNavSource', 'my-resumes');
                              router.push(`/recruitment/resume-view/${resume.id}?${RESUME_VIEW_SOURCE_PARAM}=my-resumes`);
                            }}
                            highlightQuery={appliedSearchQuery}
                            enableRowReorder
                            reorderScopeKey={cardViewFolder || 'all'}
                            onArchive={(resumeId) => handleArchiveResumes([resumeId])}
                            onArchiveDisabled={!canArchiveMyResumes}
                            onArchiveDisabledReason="You do not have permission to archive resumes"
                            onUnarchive={(resumeId) => handleUnarchiveResumes([resumeId])}
                            onUnarchiveDisabled={!canArchiveMyResumes}
                            onUnarchiveDisabledReason="You do not have permission to unarchive resumes"
                            canShare={canShareMyResumes}
                            canDownload={canDownloadMyResumes}
                            disablePagination={true}
                            isArchivedFolder={
                              folders.some(f => f.name === 'Archived Resumes' && !f.parentId && f.id === cardViewFolder)
                            }
                            archivedFolderId={folders.find(f => f.name === 'Archived Resumes' && !f.parentId)?.id}
                            /* All Resumes aggregates every folder, so each row
                               names the one it lives in. */
                            getFolderName={cardViewFolder === 'all' ? getResumeFolderName : undefined}
                          />
                          </div>
                        </div>
                      )}

                      {/* Loading state while the folder's resumes are being
                          fetched. Skeleton mirrors the ResumeTable that renders
                          here once loaded, framed by the same white card. */}
                      {loading && visibleFolderResumes.length === 0 && visibleFoldersToDisplay.length === 0 && (
                        <div className="tf-panel overflow-hidden">
                          <ResumeTableSkeleton rows={8} />
                        </div>
                      )}

                      {/* Empty state when no resumes and no subfolders. Same
                          illustrated state the list view shows, so the two views
                          of an empty folder read identically — and its button
                          uploads straight into the folder being viewed. */}
                      {!loading && visibleFolderResumes.length === 0 && visibleFoldersToDisplay.length === 0 && !resumeControlsActive && !folderControlsActive && (
                        <div className="bg-white border-2 border-dashed border-brand-blue/20 rounded-xl">
                          {renderNoResumesEmptyState(cardViewFolder === 'all' ? undefined : cardViewFolder ?? undefined)}
                        </div>
                      )}

                      {/* Card view pagination */}
                      {!loading && visibleFolderResumes.length === 0 && (folderResumes.length > 0 || resumeControlsActive) && (
                        <NoMatchingResumesState title="No resumes match" description="Clear search or filters to show more resumes." />
                      )}

                      {totalPages > 0 && folderResumes.length > 0 && (
                        <ListPagination
                          currentPage={currentPage}
                          itemsPerPage={itemsPerPage}
                          totalItems={totalItems}
                          onPageChange={(page) => { setCurrentPage(page); setIsPaginating(true); }}
                          onItemsPerPageChange={(size) => { setItemsPerPage(size); setCurrentPage(1); setIsPaginating(true); }}
                          itemLabel="resumes"
                          pageSizeOptions={RESUME_PAGE_SIZE_OPTIONS}
                        />
                      )}
                    </>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>

      {uploadFlowElements}

      {scoringProgressModal}
      {/* The eye in the Actions column reads the resume in the same document
          preview the version lists use, so viewing a resume looks the same
          wherever it is opened from. */}

      {quickViewResume && (
        <ResumeTextPreviewModal
          resumeId={quickViewResume.id}
          title={quickViewResume.name}
          subtitle={quickViewResume.fileName}
          onClose={() => setQuickViewResume(null)}
        />
      )}

      {/* Apply to Job Modal */}
      {isApplyToJobModalOpen && (
        <ApplyToJobModal
          resumes={
            singleResumeToApply
              ? [singleResumeToApply]
              : uploadedResumeToScore
                ? resumes.filter(r => r.id === uploadedResumeToScore.id)
                : selectedRows
          }
          jobs={publishedJobs}
          /* Scores the resumes — so the scoring title, steps and button. */
          mode="scoring"
          /* Score Resume: the All Jobs list - Archived / Disabled shown, not pickable. */
          excludeDraftsOnly
          onClose={() => {
            setIsApplyToJobModalOpen(false);
            setUploadedResumeToScore(null);
            setSingleResumeToApply(null);
          }}
          onApply={handleApplyToJobSubmit}
        />
      )}

      {/* Before scoring starts: what will be scored, what is skipped, units. */}
      {scoringRequest && (
        <ScoringStartSummary
          request={scoringRequest}
          onBack={() => { setScoringRequest(null); setIsApplyToJobModalOpen(true); }}
          onCancel={() => {
            setScoringRequest(null);
            setSingleResumeToApply(null);
            setUploadedResumeToScore(null);
          }}
          onStart={(ids) => proceedWithScoring(scoringRequest.job.id, ids, scoringRequest.names)}
        />
      )}

      {/* ZIP Download Confirmation Modal */}
      {isZipDownloadModalOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-50 animate-in fade-in duration-200"
            onClick={() => !isDownloadingZip && setIsZipDownloadModalOpen(false)}
          />
          {/* Modal */}
          <ModalA11y><div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-md animate-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="flex items-start justify-between gap-4 p-6 border-b border-gray-200">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-brand-blue/10 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <FileArchive className="w-7 h-7 text-brand-blue" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 tracking-tight">Download as ZIP</h3>
                    <p className="tf-body-muted mt-0.5">Multiple files selected</p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 flex items-center gap-4 border-b border-gray-200">
                <div className="w-16 h-16 bg-brand-blue/5 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <Users className="w-7 h-7 text-brand-blue" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-brand-blue">
                    {selectedResumes.length}
                    <span className="tf-section-title ml-2">candidates selected</span>
                  </p>
                  <p className="tf-body-muted mt-1">
                    All selected resumes will be downloaded and packed in a ZIP file.
                  </p>
                </div>
              </div>

              {/* Info */}
              <div className="flex items-center gap-3 px-6 py-4">
                <div className="w-7 h-7 bg-brand-blue/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <Info className="w-4 h-4 text-brand-blue" />
                </div>
                <p className="tf-body">
                  Do you want to download all selected resumes as a ZIP file?
                </p>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 rounded-b-2xl border-t border-gray-200">
                <button
                  onClick={() => setIsZipDownloadModalOpen(false)}
                  disabled={isDownloadingZip}
                  className="tf-btn tf-btn-secondary px-5 py-2.5 text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 hover:border-brand-blue/30 whitespace-normal gap-0"
                >
                  Cancel
                </button>
                <button
                  onClick={handleZipDownload}
                  disabled={isDownloadingZip}
                  className="tf-btn tf-btn-primary flex px-5 py-2.5 bg-brand-blue hover:bg-brand-blue-2 shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 whitespace-normal justify-start"
                >
                  {isDownloadingZip ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Preparing...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Continue
                    </>
                  )}
                </button>
              </div>
            </div>
          </div></ModalA11y>
        </>
      )}

      {/* Archive Resumes Confirmation Modal */}
      {isArchiveModalOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-50 animate-in fade-in duration-200"
            onClick={() => !isArchivingResumes && setIsArchiveModalOpen(false)}
          />
          {/* Modal */}
          <ModalA11y><div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-md animate-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="flex items-start justify-between gap-4 p-6 border-b border-gray-200">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-brand-blue/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <Archive className="w-7 h-7 text-brand-blue" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 tracking-tight">Archive Resumes</h3>
                    <p className="tf-body-muted mt-0.5">Move selected resumes to archive</p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 flex items-center gap-4 border-b border-gray-200">
                <div className="w-16 h-16 bg-brand-blue/5 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <Users className="w-7 h-7 text-brand-blue" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-brand-blue">
                    {selectedResumes.length}
                    <span className="tf-section-title ml-2">candidates selected</span>
                  </p>
                  <p className="tf-body-muted mt-1">
                    The selected resumes will be moved to archive and hidden from the active list.
                  </p>
                </div>
              </div>

              {/* Info */}
              <div className="flex items-center gap-3 px-6 py-4">
                <div className="w-7 h-7 bg-brand-blue/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <Info className="w-4 h-4 text-brand-blue" />
                </div>
                <p className="tf-body">
                  Are you sure you want to archive all selected resumes?
                </p>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 rounded-b-2xl border-t border-gray-200">
                <button
                  onClick={() => setIsArchiveModalOpen(false)}
                  disabled={isArchivingResumes}
                  className="tf-btn tf-btn-secondary px-5 py-2.5 text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 hover:border-brand-blue/30 whitespace-normal gap-0"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmBulkArchive}
                  disabled={isArchivingResumes}
                  className="tf-btn tf-btn-primary flex px-5 py-2.5 bg-brand-blue hover:bg-brand-blue-2 shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 whitespace-normal justify-start"
                >
                  {isArchivingResumes ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Archiving...
                    </>
                  ) : (
                    <>
                      <Archive className="w-4 h-4" />
                      Archive
                    </>
                  )}
                </button>
              </div>
            </div>
          </div></ModalA11y>
        </>
      )}



      {/* Delete Resume Confirmation Dialog */}
      <DeleteResumeDialog
        open={deleteResumeConfirm.isOpen}
        names={deleteResumeConfirm.names}
        resumeId={deleteResumeConfirm.ids.length === 1 ? deleteResumeConfirm.ids[0] : undefined}
        onCancel={() => setDeleteResumeConfirm({ isOpen: false, ids: [], names: [] })}
        onConfirm={confirmDeleteResumes}
      />

      {/* Delete Folder Confirmation Dialog */}
      <AlertDialog
        open={deleteFolderConfirm.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteFolderConfirm({ isOpen: false, folderId: null, folderName: '', resumeCount: 0, parentFolderId: null, parentFolderName: '', contentAction: null, hasSubfolders: false, subfolderCount: 0, subfolderDetails: [], totalResumeCount: 0, subfolderResumeCount: 0, loading: false });
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-lg" hideClose>
          <AlertDialogHeader>
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                <Trash2 className="h-6 w-6 text-red-600" />
              </div>
              <AlertDialogTitle className="pt-1 text-2xl font-bold text-gray-900">
                Delete Folder
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription asChild>
              <div className="mt-2 space-y-4 text-left">
                {deleteFolderConfirm.loading ? (
                  <div className="space-y-3 py-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-16 w-full rounded-lg" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ) : (
                  <>
                    <p>
                      Are you sure you want to delete &quot;{deleteFolderConfirm.folderName}&quot;?
                    </p>

                    {/* Subfolder warning banner */}
                    {deleteFolderConfirm.hasSubfolders && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-red-800">
                              This folder contains {deleteFolderConfirm.subfolderCount} subfolder{deleteFolderConfirm.subfolderCount !== 1 ? 's' : ''}
                            </p>
                            <p className="text-sm text-red-700 mt-1">
                              All subfolders will be permanently deleted:
                            </p>
                            <ul className="mt-2 space-y-1">
                              {deleteFolderConfirm.subfolderDetails.map((sf) => (
                                <li key={sf.id} className="flex items-center gap-2 text-sm text-red-700 min-w-0">
                                  <Folder className="w-3.5 h-3.5 flex-shrink-0" />
                                  <span className="font-medium truncate">{sf.name}</span>
                                  {sf.resume_count > 0 && (
                                    <span className="text-red-500 text-xs flex-shrink-0">({sf.resume_count} resume{sf.resume_count !== 1 ? 's' : ''})</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Resume action section */}
                    {deleteFolderConfirm.totalResumeCount > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-amber-800">
                              {deleteFolderConfirm.totalResumeCount} resume{deleteFolderConfirm.totalResumeCount !== 1 ? 's' : ''} will be affected
                              {deleteFolderConfirm.hasSubfolders && deleteFolderConfirm.subfolderResumeCount > 0 && (
                                <span className="font-normal text-amber-700"> ({deleteFolderConfirm.resumeCount} in this folder, {deleteFolderConfirm.subfolderResumeCount} in subfolders)</span>
                              )}
                            </p>
                            <p className="text-sm text-amber-700 mt-1">
                              Please choose what to do with the resumes:
                            </p>

                            <div className="mt-3 space-y-2">
                              {(() => {
                                const rootFolder = folders.find(f => f.name.toLowerCase() === 'root' && !f.parentId);
                                const parentIsRoot = deleteFolderConfirm.parentFolderId === rootFolder?.id;

                                return (
                                  <>
                                    {/* Option: Move to parent folder */}
                                    <label
                                      className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                                        deleteFolderConfirm.contentAction === 'move-parent'
                                          ? 'border-brand-blue/50 bg-brand-blue/5 shadow-sm shadow-brand-blue/10'
                                          : 'border-gray-200 hover:border-brand-blue/30 hover:bg-brand-blue/5 bg-white'
                                      }`}
                                    >
                                      <input
                                        type="radio"
                                        name="contentAction"
                                        value="move-parent"
                                        checked={deleteFolderConfirm.contentAction === 'move-parent'}
                                        onChange={() => setDeleteFolderConfirm(prev => ({ ...prev, contentAction: 'move-parent' }))}
                                        className="tf-radio"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 min-w-0">
                                          <FolderOpen className="w-4 h-4 text-gray-600 flex-shrink-0" />
                                          <span className="tf-row-name truncate">
                                            Move to {parentIsRoot ? 'My Resumes (root)' : deleteFolderConfirm.parentFolderName}
                                          </span>
                                        </div>
                                        <p className="tf-meta mt-0.5">
                                          All resumes will be moved to {parentIsRoot ? 'the root folder' : 'the parent folder'}
                                        </p>
                                      </div>
                                    </label>

                                    {/* Option: Move to root (only when parent is NOT root) */}
                                    {!parentIsRoot && (
                                      <label
                                        className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                                          deleteFolderConfirm.contentAction === 'move-root'
                                            ? 'border-brand-blue/50 bg-brand-blue/5 shadow-sm shadow-brand-blue/10'
                                            : 'border-gray-200 hover:border-brand-blue/30 hover:bg-brand-blue/5 bg-white'
                                        }`}
                                      >
                                        <input
                                          type="radio"
                                          name="contentAction"
                                          value="move-root"
                                          checked={deleteFolderConfirm.contentAction === 'move-root'}
                                          onChange={() => setDeleteFolderConfirm(prev => ({ ...prev, contentAction: 'move-root' }))}
                                          className="tf-radio"
                                        />
                                        <div className="flex-1">
                                          <div className="flex items-center gap-2">
                                            <Folder className="w-4 h-4 text-gray-600" />
                                            <span className="tf-row-name">
                                              Move to My Resumes (root)
                                            </span>
                                          </div>
                                          <p className="tf-meta mt-0.5">
                                            All resumes will be moved to the root folder
                                          </p>
                                        </div>
                                      </label>
                                    )}

                                    {/* Option: Delete all resumes */}
                                    <label
                                      className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                                        deleteFolderConfirm.contentAction === 'delete-all'
                                          ? 'border-red-500 bg-red-50'
                                          : 'border-gray-200 hover:border-gray-300 bg-white'
                                      }`}
                                    >
                                      <input
                                        type="radio"
                                        name="contentAction"
                                        value="delete-all"
                                        checked={deleteFolderConfirm.contentAction === 'delete-all'}
                                        onChange={() => setDeleteFolderConfirm(prev => ({ ...prev, contentAction: 'delete-all' }))}
                                        className="tf-radio"
                                      />
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                          <Trash2 className="w-4 h-4 text-red-600" />
                                          <span className="text-sm font-medium text-red-700">
                                            Delete all resumes permanently
                                          </span>
                                        </div>
                                        <p className="text-xs text-red-500 mt-0.5">
                                          All {deleteFolderConfirm.totalResumeCount} resume{deleteFolderConfirm.totalResumeCount !== 1 ? 's' : ''} will be permanently deleted
                                        </p>
                                      </div>
                                    </label>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setDeleteFolderConfirm({ isOpen: false, folderId: null, folderName: '', resumeCount: 0, parentFolderId: null, parentFolderName: '', contentAction: null, hasSubfolders: false, subfolderCount: 0, subfolderDetails: [], totalResumeCount: 0, subfolderResumeCount: 0, loading: false })}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteFolder}
              disabled={deleteFolderConfirm.loading || (deleteFolderConfirm.totalResumeCount > 0 && !deleteFolderConfirm.contentAction)}
              className={`text-white disabled:opacity-50 disabled:cursor-not-allowed ${
                deleteFolderConfirm.contentAction === 'delete-all'
                  ? 'bg-red-700 hover:bg-red-800 focus:ring-red-600'
                  : 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
              }`}
            >
              {deleteFolderConfirm.loading
                ? 'Loading...'
                : deleteFolderConfirm.contentAction === 'delete-all'
                  ? 'Delete Everything'
                  : deleteFolderConfirm.totalResumeCount > 0
                    ? 'Move & Delete'
                    : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
      </div>
    </main>
    </DndProvider>
    </FeatureGate>
  );
}
