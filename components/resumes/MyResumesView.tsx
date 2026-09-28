'use client';

import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Copy, GitBranch, Upload, Loader2, Search, History, X, CheckCircle, AlertCircle, Clock, Calendar, ChevronRight, ChevronDown, ArrowLeft, FileText, Maximize2, LayoutGrid, List, Folder, FolderOpen, MapPin, Mail, Phone, Download, Eye, MoreHorizontal, Trash2, Archive, FileArchive, Users, Info, ClipboardCheck, UserPlus, Sparkles, RefreshCw, Ban, Brain, Edit2, Lightbulb, ShieldAlert, Lock, HelpCircle } from 'lucide-react';
import Link from 'next/link';
import { DndProvider, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import dynamic from 'next/dynamic';
import ResumeTable, { ResumeTableSkeleton } from '@/components/ResumeTable';
import NoResumesEmptyState from '@/components/resumes/NoResumesEmptyState';
import UploadHistoryEmptyState from '@/components/resumes/UploadHistoryEmptyState';
import SkillsList from '@/components/ui/SkillsList';
import { getDisplaySkills } from '@/lib/utils/resumeSkills';
import Pagination from '@/components/Pagination';
import StatsCards from '@/components/StatsCards';
import SearchFilterBarCompact from '@/components/SearchFilterBarCompact';
import { Skeleton } from '@/components/ui/skeleton';
import FolderTree, { FOLDER_NAME_MAX_LENGTH, MAX_FOLDER_DEPTH } from '@/components/FolderTree';
import BulkActionsBar from '@/components/BulkActionsBar';
import UploadModal from '@/components/UploadModal';
import type { DuplicateFile, ExistingResume } from '@/components/DuplicateResumeModal';

// Dynamic import to avoid SSR issues with docx-preview dependency
const DuplicateResumeModal = dynamic(() => import('@/components/DuplicateResumeModal'), {
  ssr: false,
  loading: () => <div>Loading...</div>
});
import ResumeTextPreviewModal from '@/components/ResumeTextPreviewModal';
import UploadHistoryDetailModal, { UploadHistoryItem } from '@/components/UploadHistoryDetailModal';
import ApplyToJobModal from '@/components/ApplyToJobModal';
import SelectedCandidatesPanel from '@/components/SelectedCandidatesPanel';
import AITalentMatchSelectJobModal from '@/components/AITalentMatchSelectJobModal';
import BulkVersionResolutionModal from '@/components/BulkVersionResolutionModal';
import type { VersionedBatchItem } from '@/components/BulkVersionResolutionModal';
import ShareAssessmentModal from '@/components/ShareAssessmentModal';
import AssessmentPicker from '@/components/assessments/AssessmentPicker';
import InviteToAIInterviewFlow from '@/components/InviteToAIInterviewFlow';
import { useListSearch } from '@/lib/hooks/useListSearch';
import { isAssessmentRevoked, getLocallyRevokedAssessmentIds } from '@/lib/utils/assessmentUtils';
import { MENU_ITEM_SCALE_CLASS } from '@/lib/constants/menuAnimation';
import { Resume, Folder as FolderType, Job } from '@/lib/types/types';
import { resumeService, folderService } from '@/lib/services/resumeService';
import { Resume as ApiResume, Folder as ApiFolder, FolderDeletionInfo } from '@/lib/services/resumeService';
import { convertApiResumeToRow, convertApiFolderToTree } from '@/lib/utils/resumeMappers';
import { jdService } from '@/lib/services/jdService';
import { scoringService } from '@/lib/services/scoringService';
import { assessmentService } from '@/lib/services';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import { toast } from 'sonner';
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
import { usePlanFeatures } from '@/lib/hooks/usePlanFeature';
import { formatIST, formatISTDate } from '@/lib/utils/dateUtils';
import { formatOverallScore } from '@/lib/utils/matchStatus';

const formatDateIST = formatISTDate;
const formatDateTimeIST = formatIST;

// Drag item type for resumes (must match ResumeTable and FolderTree)
const RESUME_DRAG_TYPE = 'RESUME';

/** Height of the expanded subfolder list on a folder card — roughly five rows,
 *  after which it scrolls rather than growing the card. Applied inline:
 *  Tailwind only ships classes spelled out in the source, so a `max-h-[${...}]`
 *  built from this constant would never be generated. */
const SUBFOLDER_PEEK_MAX_HEIGHT = 180;
/** Width of the third-level flyout that opens beside the subfolder list. */
const SUBFOLDER_PEEK_PANEL_WIDTH = 224;
/** Approximate folder action menu height; used to decide whether to open upward. */
const FOLDER_ACTION_MENU_HEIGHT = 188;

type CardFolderFilter = 'all' | 'with-resumes' | 'empty' | 'with-subfolders';

const CARD_FOLDER_FILTER_OPTIONS: { value: CardFolderFilter; label: string }[] = [
  { value: 'all', label: 'All folders' },
  { value: 'with-resumes', label: 'Has resumes' },
  { value: 'empty', label: 'Empty' },
  { value: 'with-subfolders', label: 'Has subfolders' },
];

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
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
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
          className="w-full h-10 pl-10 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-transparent transition-all bg-gray-50 hover:bg-white text-black placeholder:text-gray-400 [&::-webkit-search-cancel-button]:hidden"
          role="searchbox"
          aria-label="Search folders and resumes"
          aria-autocomplete="list"
        />
        {isLoading && query.trim() ? (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
        ) : query ? (
          <button
            type="button"
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 hover:bg-gray-200 rounded-full p-1 transition-colors"
            aria-label="Clear global search"
          >
            <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
          </button>
        ) : null}
      </div>

      {isOpen && query.trim() && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[420px] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl shadow-brand-blue/10 ring-1 ring-black/[0.02]">
          {isLoading && !hasResults ? (
            <div className="flex items-center justify-center py-8 text-sm text-gray-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Searching...
            </div>
          ) : !hasResults ? (
            <div className="py-8 text-center text-sm text-gray-500">
              No results found
            </div>
          ) : (
            <>
              {folderResults.length > 0 && (
                <div>
                  <div className="border-b border-gray-100 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
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
                        <span className="inline-flex items-center rounded-full bg-brand-blue/10 px-2 py-0.5 text-2xs font-medium text-brand-blue ring-1 ring-brand-blue/15">
                          Folder
                        </span>
                        <span className="min-w-0 truncate text-sm font-medium text-gray-900">{folder.name}</span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-gray-500">{path}</div>
                    </button>
                  ))}
                </div>
              )}

              {resumeResults.length > 0 && (
                <div>
                  <div className="border-b border-gray-100 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
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
                        <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-2xs font-medium text-green-700 ring-1 ring-green-200">
                          Resume
                        </span>
                        <span className="min-w-0 truncate text-sm font-medium text-gray-900">
                          {resume.name || resume.candidate_name || resume.fileName || 'Resume'}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-gray-500">
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
    <label className="relative min-w-[180px] flex-1 sm:flex-none">
      <span className="sr-only">{label}</span>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
        {icon}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={`h-10 w-full appearance-none rounded-lg border pl-9 pr-8 text-sm text-black transition-all focus:outline-none focus:ring-2 focus:ring-brand-blue/40 ${
          isActive
            ? 'border-brand-blue/40 bg-brand-blue/5 text-brand-blue'
            : 'border-gray-300 bg-gray-50 hover:bg-white'
        }`}
        aria-label={label}
        title={label}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
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
    <div
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
          <h3 className="font-semibold text-sm text-gray-900 truncate">
            {isRoot ? 'Root (Default)' : folder.name}
          </h3>
          <p className="text-xs text-gray-500">
            {hasSubfolders && `${subfolders.length} subfolder${subfolders.length !== 1 ? 's' : ''} • `}
            {resumeCount} resume{resumeCount !== 1 ? 's' : ''}
          </p>
        </div>
        {/* Peek toggle. `stopPropagation` so it never triggers the card's own
            navigate — the whole point is to look without leaving. */}
        <div className="relative flex-shrink-0">
          {!hideActions && (
          <button
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
            aria-label={`Folder actions for ${folder.name}`}
            title="Folder actions"
          >
            <Plus className="w-4 h-4" />
          </button>
          )}

          {!hideActions && showActions && (
            <div
              role="menu"
              className={`absolute right-0 w-52 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-1 shadow-xl shadow-brand-blue/10 ring-1 ring-black/[0.02] z-50 ${
                actionsDropUp ? 'bottom-full mb-1' : 'top-full mt-1'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                role="menuitem"
                disabled={!canUpload || !onUploadToFolder}
                onClick={(e) => runFolderAction(e, () => onUploadToFolder?.(folder.id), !canUpload || !onUploadToFolder)}
                className="group w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-600 disabled:hover:bg-white dark:disabled:hover:bg-transparent transition-colors"
              >
                <Upload className={`w-4 h-4 ${canUpload && onUploadToFolder ? 'text-menu-icon-download' : ''}`} />
                <span className={MENU_ITEM_SCALE_CLASS}>Upload to Folder</span>
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!canCreateSubfolder || !onCreateSubfolder}
                onClick={(e) => runFolderAction(e, () => onCreateSubfolder?.(folder.id), !canCreateSubfolder || !onCreateSubfolder)}
                title={!canCreateSubfolder ? `Maximum folder depth reached (${MAX_FOLDER_DEPTH} levels)` : undefined}
                className="group w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-600 disabled:hover:bg-white dark:disabled:hover:bg-transparent transition-colors"
              >
                <Plus className={`w-4 h-4 ${canCreateSubfolder && onCreateSubfolder ? 'text-menu-icon-secondary' : ''}`} />
                <span className={MENU_ITEM_SCALE_CLASS}>Create Subfolder</span>
                {!canCreateSubfolder && <span className="ml-auto text-xs text-gray-400 dark:text-slate-600">(max)</span>}
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!canRename || !onStartRename}
                onClick={(e) => runFolderAction(e, () => onStartRename?.(folder), !canRename || !onStartRename)}
                className="group w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-600 disabled:hover:bg-white dark:disabled:hover:bg-transparent transition-colors"
              >
                <Edit2 className={`w-4 h-4 ${canRename && onStartRename ? 'text-menu-icon-edit' : ''}`} />
                <span className={MENU_ITEM_SCALE_CLASS}>Rename Folder</span>
              </button>
              <div className="my-1 border-t border-gray-100 dark:border-slate-700" />
              <button
                type="button"
                role="menuitem"
                disabled={!canDelete || !onDeleteFolder}
                onClick={(e) => runFolderAction(e, () => onDeleteFolder?.(folder.id), !canDelete || !onDeleteFolder)}
                className="group w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:text-gray-400 dark:disabled:text-slate-600 disabled:hover:bg-white dark:disabled:hover:bg-transparent transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span className={MENU_ITEM_SCALE_CLASS}>Delete Folder</span>
              </button>
            </div>
          )}
        </div>

        {hasSubfolders && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleSubfolders();
            }}
            aria-expanded={showSubfolders}
            aria-label={showSubfolders ? `Hide subfolders of ${folder.name}` : `Show subfolders of ${folder.name}`}
            title={showSubfolders ? 'Hide subfolders' : 'Show subfolders'}
            className={`p-1 rounded-md transition-colors flex-shrink-0 cursor-pointer ${
              showSubfolders
                ? 'bg-brand-blue/10 text-brand-blue'
                : 'text-gray-500 hover:bg-brand-blue/10 hover:text-brand-blue'
            }`}
          >
            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ease-in-out ${showSubfolders ? 'rotate-180' : ''}`} />
          </button>
        )}
        {/* One chevron per card: a folder with subfolders shows the peek
            toggle, everything else keeps the plain navigate arrow. Showing
            both read as two competing affordances. */}
        {!hasSubfolders && <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
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
                <span aria-hidden="true" className="text-gray-300 text-xs leading-none">└</span>
                <Folder className={`w-3.5 h-3.5 flex-shrink-0 ${
                  peekChild?.id === child.id ? 'text-brand-blue' : 'text-brand-orange'
                }`} />
                <span className={`flex-1 min-w-0 truncate text-xs ${
                  peekChild?.id === child.id ? 'font-medium text-brand-blue' : 'text-gray-700'
                }`}>{child.name}</span>
                <span className="text-2xs text-gray-500 flex-shrink-0">
                  {childSubfolders > 0 && `${childSubfolders} sub • `}
                  {child.count || 0}
                </span>
                <ChevronRight className={`w-3.5 h-3.5 flex-shrink-0 ${
                  childSubfolders > 0 ? 'text-brand-blue' : 'text-gray-400'
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
          className={`absolute z-50 rounded-xl border border-gray-200 bg-white shadow-xl shadow-brand-blue/10 overflow-y-auto overscroll-contain ${
            dropUp ? 'bottom-full mb-1' : 'top-full mt-1'
          } ${peekOnLeft ? 'right-full' : 'left-full'}`}
          style={{ width: `${SUBFOLDER_PEEK_PANEL_WIDTH}px`, maxHeight: `${SUBFOLDER_PEEK_MAX_HEIGHT}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-2xs font-medium text-gray-500 bg-slate-50 border-b border-gray-100 truncate">
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
              <span className="flex-1 min-w-0 truncate text-xs text-gray-700">{grandChild.name}</span>
              <span className="text-2xs text-gray-500 flex-shrink-0">{grandChild.count || 0}</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
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
      <div className="absolute right-0 top-full z-40 mt-2 w-full max-w-xl">
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
          <span className="text-xs text-gray-400">{value.length}/{FOLDER_NAME_MAX_LENGTH}</span>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!value.trim()}
            className="rounded bg-brand-blue px-3 py-1.5 text-xs text-white shadow-sm shadow-brand-blue/20 ring-1 ring-white/10 hover:bg-brand-blue-2 disabled:cursor-not-allowed disabled:bg-gray-300"
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
          className="px-3 py-1 text-xs bg-brand-blue text-white rounded hover:bg-brand-blue-2 disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer"
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
        <span className="text-xs text-gray-400 ml-auto">{value.length}/{FOLDER_NAME_MAX_LENGTH}</span>
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
  const { user, isTenantAdmin, hasPermission, hasPermissionCode, isLoading: authLoading } = useAuth();
  const canViewMyResumes = isTenantAdmin || hasPermissionCode('my_resumes:read');
  const canUploadMyResumes = isTenantAdmin || hasPermissionCode('my_resumes:upload') || hasPermissionCode('my_resumes:create');
  const canUpdateMyResumes = isTenantAdmin || hasPermissionCode('my_resumes:update');
  const canDeleteMyResumes = isTenantAdmin || hasPermissionCode('my_resumes:delete');
  const canArchiveMyResumes = isTenantAdmin || hasPermissionCode('my_resumes:archive');
  const canShareMyResumes = isTenantAdmin || hasPermissionCode('my_resumes:share');
  const canMoveMyResumes = isTenantAdmin || hasPermissionCode('my_resumes:update') || hasPermissionCode('my_resumes:upload') || hasPermissionCode('my_resumes:create');
  const { hasPlanFeature } = usePlanFeatures();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [selectedResumes, setSelectedResumes] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
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
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [totalItems, setTotalItems] = useState(0);
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
  const [uploadTargetFolderId, setUploadTargetFolderId] = useState<string | undefined>();

  // Modal states
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadHistory, setUploadHistory] = useState<any[]>([]);
  const [quickViewResume, setQuickViewResume] = useState<Resume | null>(null);

  // Duplicate detection state
  const [duplicateFiles, setDuplicateFiles] = useState<DuplicateFile[]>([]);
  const [pendingUploadFolderId, setPendingUploadFolderId] = useState<string | undefined>();
  /* Destination of the refused upload, as the upload dialog itself named it.
     Authoritative — it is the label the user picked. Only when it is missing
     (an upload started somewhere with no folder picker) does the id below get
     resolved against the folder tree instead. */
  const [pendingUploadFolderLabel, setPendingUploadFolderLabel] = useState<string | undefined>();
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);

  // Upload history modal state
  const [isUploadHistoryModalOpen, setIsUploadHistoryModalOpen] = useState(false);
  const [isUploadHistoryMinimized, setIsUploadHistoryMinimized] = useState(false);
  const [uploadHistoryTab, setUploadHistoryTab] = useState<'current' | 'completed'>('current');
  const [allResumesTotal, setAllResumesTotal] = useState(0);
  // Mirror of the above that overlapping fetches can read without going through
  // a stale render closure — see the `isUnfiltered` block in fetchData.
  const allResumesTotalRef = useRef(0);
  // Flipped the moment an upload starts here, so the Upload History button goes
  // live for a first-time user immediately instead of waiting for the resume
  // list to come back.
  const [uploadStartedThisSession, setUploadStartedThisSession] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<UploadHistoryItem | null>(null);
  const [uploadHistoryFilter, setUploadHistoryFilter] = useState<'completed' | 'duplicated' | 'versioned' | 'error' | 'pending' | 'cancelled' | null>(null);
  const [retryingBatches, setRetryingBatches] = useState<Set<string>>(new Set());
  const [cancellingBatches, setCancellingBatches] = useState<Set<string>>(new Set());
  const [retryingItems, setRetryingItems] = useState<Set<string>>(new Set());
  const [cancellingItems, setCancellingItems] = useState<Set<string>>(new Set());
  const [cancelBatchConfirm, setCancelBatchConfirm] = useState<{ isOpen: boolean; batchId: string; pendingCount: number }>({ isOpen: false, batchId: '', pendingCount: 0 });
  const [cancelItemConfirm, setCancelItemConfirm] = useState<{ isOpen: boolean; batchId: string; itemId: string; fileName: string }>({ isOpen: false, batchId: '', itemId: '', fileName: '' });

  // Bulk version resolution state
  const [selectedVersionedItems, setSelectedVersionedItems] = useState<Map<string, VersionedBatchItem>>(new Map());
  const [isBulkResolveModalOpen, setIsBulkResolveModalOpen] = useState(false);

  // Apply to Job modal state
  const [isApplyToJobModalOpen, setIsApplyToJobModalOpen] = useState(false);
  const [publishedJobs, setPublishedJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [uploadedResumeToScore, setUploadedResumeToScore] = useState<{ id: string; candidateName: string } | null>(null);
  const [singleResumeToApply, setSingleResumeToApply] = useState<Resume | null>(null);

  // Duplicate scoring warning state
  const [duplicateScoringWarning, setDuplicateScoringWarning] = useState<{
    isOpen: boolean;
    jobId: string;
    jobTitle: string;
    resumeIds: string[];
    existingScores: Array<{
      resume_id: string;
      candidate_name: string;
      overall_score: number;
      // Resume Match Rating Mechanism (client doc, Sept 2026): the 0-10
      // Overall Rating for the duplicate-scoring warning list.
      overall_rating_10?: number;
      match_status: string;
      scored_at: string | null;
    }>;
    newCount: number;
  }>({ isOpen: false, jobId: '', jobTitle: '', resumeIds: [], existingScores: [], newCount: 0 });

  // ZIP download confirmation modal state
  const [isZipDownloadModalOpen, setIsZipDownloadModalOpen] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);

  // Archive confirmation modal state (bulk archive only — per-row archive stays instant)
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [isArchivingResumes, setIsArchivingResumes] = useState(false);

  // Assessment modal state
  const [isAssessmentModalOpen, setIsAssessmentModalOpen] = useState(false);
  const [selectedJobForAssessment, setSelectedJobForAssessment] = useState<string | null>(null);
  const [activeAssessments, setActiveAssessments] = useState<any[]>([]);
  // The Invite to Assessment dialog's scroller — the picker's paging scrolls it to the top.
  const assessmentBodyScrollRef = useRef<HTMLDivElement>(null);
  const [loadingAssessments, setLoadingAssessments] = useState(false);
  const [selectedAssessments, setSelectedAssessments] = useState<any[]>([]); // Changed to array for multi-select

  // Share Assessment Modal state
  const [isShareAssessmentModalOpen, setIsShareAssessmentModalOpen] = useState(false);
  const [prefilledCandidates, setPrefilledCandidates] = useState<any[]>([]);
  /* Candidates unticked inside an invite dialog. Kept out here so both the
     assessment and AI-interview flows can drop someone without disturbing the
     page's own selection. */
  const [excludedInviteIds, setExcludedInviteIds] = useState<string[]>([]);

  // AI Talent Match modal state
  const [isAITalentMatchModalOpen, setIsAITalentMatchModalOpen] = useState(false);

  // AI Interview: pick a published interview, then send invites to the selected
  // candidates through the same share modal the AI Interviews module uses.
  const [isAIInterviewPickerOpen, setIsAIInterviewPickerOpen] = useState(false);

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
    resolve?: () => void;
  } | null>(null);
  // Always the newest fetchData. The replay has to go through this rather than
  // calling itself: page/sort live in the closure, not the arguments, so a
  // self-call would refetch with the page the *outgoing* render had.
  const fetchDataRef = useRef<
    ((searchTerm?: string, currentFilters?: any, folderId?: string, silent?: boolean) => Promise<void>) | null
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
    fetchData();
    fetchUploadHistory();
    // Self-heal admin-API resume usage on mount (fire-and-forget — capped at ±200).
    resumeService.reconcileUsage();
    hasMountedRef.current = true; // Mark as mounted

    // Cleanup: Stop all polling intervals when component unmounts
    return () => {
      pollingIntervalsRef.current.forEach(interval => {
        clearInterval(interval);
      });
      pollingIntervalsRef.current.clear();
      console.log('[MyResumes] Cleaned up all polling intervals on unmount');
    };
  }, []);

  // The mount fetch can land before AuthProvider has resolved the user, and the
  // ownership filter below needs an identity to match against — so refetch once
  // the user arrives, otherwise a real history would stay filtered out.
  useEffect(() => {
    if (!user?.id) return;
    fetchUploadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Refetch when filters or folder selection changes
  useEffect(() => {
    // Skip the very first render (fetchData is already called in mount effect above)
    if (!hasMountedRef.current) {
      console.log('[MyResumes] useEffect - Skipping (not mounted yet)');
      return;
    }

    // Create signature of params to detect ACTUAL changes (not just reference changes)
    const currentParams = JSON.stringify({ appliedSearchQuery, filters, selectedFolder, currentPage, itemsPerPage, sortBy });

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
      fetchData(appliedSearchQuery, filters, selectedFolder, isPageChange ? true : false).finally(() => {
        setIsPaginating(false);
        console.log('[MyResumes] useEffect - Fetch complete');
      });
    }, delay);

    return () => {
      console.log('[MyResumes] useEffect - Cleanup (timer cleared)');
      clearTimeout(debounceTimer);
    };
  }, [appliedSearchQuery, filters, selectedFolder, currentPage, itemsPerPage, sortBy]);

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
          toast.error('Could not find the requested resume');
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

  // Single mapper for every batch payload the API returns. The cancel/retry
  // handlers used to spread the raw snake_case batch instead (`statuses: b.items`),
  // which silently blanked out file names, candidate names and error messages
  // until the next full refresh.
  const mapBatchRecord = (batch: any) => ({
    id: batch.id,
    date: batch.date ?? batch.created_at,
    completedAt: batch.completed_at,
    fileName: batch.batch_name,
    totalFiles: batch.total_files,
    completed: batch.completed ?? 0,
    pending: batch.pending ?? 0,
    duplicated: batch.duplicates ?? 0,
    versioned: batch.versions ?? 0,
    errors: batch.errors ?? 0,
    cancelled: batch.cancelled ?? 0,
    status: batch.status,
    source: 'my-resumes' as const,
    statuses: batch.items?.map((item: any) => ({
      id: item.id,
      fileName: item.file_name,
      status: item.status === 'duplicated' ? 'duplicate' : item.status,
      errorMessage: item.error_message,
      candidateName: item.candidate_name,
      resumeId: item.resume_id,
    })) || [],
  });

  /* `/resumes/upload/batches` is tenant-scoped — it takes no owner filter and
     its payload doesn't say who created a batch — so a second account in the
     same tenant was shown everybody else's uploads. Ownership is therefore
     established two ways, in order:

       1. An owner field on the payload, if the API ever sends one. Authoritative.
       2. A local ledger of the batch ids THIS account created, kept per user in
          localStorage and written the moment an upload starts here.

     A batch that matches neither is another account's and is dropped. That
     means uploads made before this ledger existed, or from another browser,
     won't be listed — the endpoint gives the client nothing to recognise them
     by. Scoping the endpoint server-side is the real fix. */
  const BATCH_OWNER_FIELDS = [
    'user_id', 'uploaded_by', 'uploaded_by_id', 'uploaded_by_name',
    'created_by', 'created_by_id', 'owner_id',
  ];

  const batchLedgerKey = user?.id ? `tf:upload-batches:${user.id}` : null;

  const readBatchLedger = useCallback((): string[] => {
    if (!batchLedgerKey || typeof window === 'undefined') return [];
    try {
      const stored = JSON.parse(localStorage.getItem(batchLedgerKey) || '[]');
      return Array.isArray(stored) ? stored.map(String) : [];
    } catch {
      return [];
    }
  }, [batchLedgerKey]);

  const rememberBatchIds = useCallback((ids: string[]) => {
    if (!batchLedgerKey || typeof window === 'undefined') return;
    const fresh = ids.filter(Boolean).map(String);
    if (fresh.length === 0) return;
    try {
      // Newest first, capped — a ledger is only useful for recent history.
      const next = Array.from(new Set([...fresh, ...readBatchLedger()])).slice(0, 200);
      localStorage.setItem(batchLedgerKey, JSON.stringify(next));
    } catch {
      // Private mode / quota — ownership just falls back to the payload check.
    }
  }, [batchLedgerKey, readBatchLedger]);

  const batchOwnerValue = (batch: any) =>
    BATCH_OWNER_FIELDS
      .map(field => batch?.[field])
      .find(value => value !== undefined && value !== null && value !== '');

  const isOwnBatch = (batch: any, ledger: string[]) => {
    const owner = batchOwnerValue(batch);
    if (owner !== undefined) {
      const identities = [user?.id, user?.email, user?.name]
        .filter(Boolean)
        .map(v => String(v).toLowerCase());
      return identities.includes(String(owner).toLowerCase());
    }
    return ledger.includes(String(batch?.id));
  };

  const hasBatchFiles = (batch: any) =>
    (batch?.total_files ?? 0) > 0 || (batch?.items?.length ?? 0) > 0;

  const ownBatchRecords = (batches: any[]) => {
    const ledger = readBatchLedger();
    return batches.filter(b => isOwnBatch(b, ledger) && hasBatchFiles(b)).map(mapBatchRecord);
  };

  /* Single-file uploads go through `/resumes/upload`, which returns a resume
     and never tells us the batch it landed in. So we snapshot the batch ids
     before the upload and claim whatever is new afterwards. */
  const snapshotBatchIds = async (): Promise<string[]> => {
    try {
      const response = await resumeService.listUploadBatches(50);
      return (response?.batches ?? []).map((b: any) => String(b.id));
    } catch {
      return [];
    }
  };

  /* The batch row for a single upload isn't always written by the time the
     upload call returns, so one look is not enough — retry with a widening gap
     before giving up. */
  const adoptNewBatchIds = async (priorIds: string[], attempts = 4): Promise<string[]> => {
    const prior = new Set(priorIds);
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const response = await resumeService.listUploadBatches(50);
        const fresh = (response?.batches ?? [])
          .map((b: any) => String(b.id))
          .filter((id: string) => !prior.has(id));
        if (fresh.length > 0) {
          rememberBatchIds(fresh);
          return fresh;
        }
      } catch {
        // Ignore and retry — a transient failure shouldn't lose the batch.
      }
      await new Promise(resolve => setTimeout(resolve, 800 * (attempt + 1)));
    }
    return [];
  };

  /* Fallback record for an upload the server never gave us a batch for (single
     uploads may not create one at all). Kept per user in localStorage so the
     upload still appears in history after a reload, and dropped as soon as a
     real batch turns up carrying the same resume. */
  const localUploadsKey = user?.id ? `tf:upload-local:${user.id}` : null;

  const readLocalUploads = useCallback((): any[] => {
    if (!localUploadsKey || typeof window === 'undefined') return [];
    try {
      const stored = JSON.parse(localStorage.getItem(localUploadsKey) || '[]');
      return Array.isArray(stored) ? stored : [];
    } catch {
      return [];
    }
  }, [localUploadsKey]);

  const rememberLocalUpload = useCallback((record: any) => {
    if (!localUploadsKey || typeof window === 'undefined') return;
    try {
      localStorage.setItem(localUploadsKey, JSON.stringify([record, ...readLocalUploads()].slice(0, 50)));
    } catch {
      // Private mode / quota — the record just won't survive a reload.
    }
  }, [localUploadsKey, readLocalUploads]);

  // Server records win: a local stand-in is hidden once a real batch reports
  // the same resume, so an upload is never listed twice.
  const withLocalUploads = (records: any[]) => {
    const claimed = new Set(
      records.flatMap(r => (r.statuses ?? []).map((s: any) => s.resumeId).filter(Boolean)),
    );
    const locals = readLocalUploads().filter(
      local => !(local.statuses ?? []).some((s: any) => s.resumeId && claimed.has(s.resumeId)),
    );
    return [...locals, ...records].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  };

  // Refresh from the server and replace only the my-resumes records.
  const refreshMyResumesBatches = async () => {
    const response = await resumeService.listUploadBatches(50);
    if (!response?.batches) return;
    const updated = withLocalUploads(ownBatchRecords(response.batches));
    setUploadHistory(prev => [...prev.filter(r => r.source !== 'my-resumes'), ...updated]);
  };

  const fetchUploadHistory = async () => {
    try {
      const response = await resumeService.listUploadBatches(50);
      if (response?.batches) {
        setUploadHistory(withLocalUploads(ownBatchRecords(response.batches)));
      }
    } catch (error) {
      console.error('Failed to fetch upload history:', error);
    }
  };

  const openUploadHistoryModal = () => {
    const hasActive = uploadHistory.some(
      r => r.source === 'my-resumes' && (r.status === 'processing' || r.pending > 0)
    );
    setUploadHistoryTab(hasActive ? 'current' : 'completed');
    setUploadHistoryFilter(null);
    setIsUploadHistoryModalOpen(true);
    setIsUploadHistoryMinimized(false);
  };

  const handleCloseUploadHistory = async () => {
    // Note: completed batches are intentionally retained so the Completed
    // tab stays useful as a history view. If the user wants to clear it
    // they can call deleteCompletedBatches() explicitly elsewhere.
    setIsUploadHistoryModalOpen(false);
    setIsUploadHistoryMinimized(false);
    setUploadHistoryFilter(null);
  };

  const handleRetryBatch = async (batchId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRetryingBatches(prev => new Set(prev).add(batchId));
    try {
      const res = await resumeService.retryBatchItems(batchId);
      const deducted = res?.units_deducted ?? 0;
      toast.success(
        deducted > 0
          ? `Retrying items. ${deducted} unit(s) deducted for quota-exceeded files.`
          : 'Retrying stuck items. No additional units deducted.'
      );
      // Refresh upload history so items show as "pending" and start polling for progress
      await refreshMyResumesBatches();
      startBatchPolling(batchId);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to retry batch items');
    } finally {
      setRetryingBatches(prev => { const s = new Set(prev); s.delete(batchId); return s; });
    }
  };

  // Cancelling a batch is destructive and irreversible for files already in
  // flight, so it always goes through a confirmation step. It used to fire on a
  // single click — and a focused button also fires on Space/Enter, which is an
  // easy way to lose most of a 100-file upload without realising it.
  const handleCancelBatch = (batchId: string, pendingCount: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCancelBatchConfirm({ isOpen: true, batchId, pendingCount });
  };

  const confirmCancelBatch = async () => {
    const { batchId, pendingCount } = cancelBatchConfirm;
    setCancelBatchConfirm({ isOpen: false, batchId: '', pendingCount: 0 });
    if (!batchId) return;
    setCancellingBatches(prev => new Set(prev).add(batchId));
    try {
      const res = await resumeService.cancelBatch(batchId);
      const refunded = res?.refunded_units ?? pendingCount;
      toast.success(`Cancelled ${res?.cancelled ?? pendingCount} file(s). ${refunded} unit(s) refunded.`);
      // Refresh upload history to reflect the cancellation
      await refreshMyResumesBatches();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to cancel batch');
    } finally {
      setCancellingBatches(prev => { const s = new Set(prev); s.delete(batchId); return s; });
    }
  };

  const handleRetryItem = async (batchId: string, itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRetryingItems(prev => new Set(prev).add(itemId));
    try {
      const res = await resumeService.retryItem(batchId, itemId);
      const deducted = res?.units_deducted ?? 0;
      toast.success(
        deducted > 0
          ? 'Retrying file. 1 Resume Storage unit deducted.'
          : 'Retrying file. No additional units deducted.'
      );
      // Refresh upload history so the item shows as "pending/queued" and start polling for progress
      await refreshMyResumesBatches();
      startBatchPolling(batchId);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to retry file');
    } finally {
      setRetryingItems(prev => { const s = new Set(prev); s.delete(itemId); return s; });
    }
  };

  const handleCancelItem = (batchId: string, itemId: string, fileName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCancelItemConfirm({ isOpen: true, batchId, itemId, fileName });
  };

  const confirmCancelItem = async () => {
    const { batchId, itemId, fileName } = cancelItemConfirm;
    setCancelItemConfirm({ isOpen: false, batchId: '', itemId: '', fileName: '' });
    if (!batchId || !itemId) return;
    setCancellingItems(prev => new Set(prev).add(itemId));
    try {
      const res = await resumeService.cancelItem(batchId, itemId);
      toast.success(
        res?.refunded_units
          ? `'${fileName}' cancelled. 1 unit refunded.`
          : `'${fileName}' cancelled.`
      );
      await refreshMyResumesBatches();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to cancel file');
    } finally {
      setCancellingItems(prev => { const s = new Set(prev); s.delete(itemId); return s; });
    }
  };

  // Ref to store active polling intervals for cleanup
  const pollingIntervalsRef = useRef<Set<NodeJS.Timeout>>(new Set());

  // Start (or restart) polling for a batch — used after retry so items progress in real-time
  const startBatchPolling = (batchId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const status = await resumeService.getBatchStatus(batchId);
        setUploadHistory(prev => prev.map(record =>
          record.id === batchId
            ? {
                ...record,
                completed: status.completed,
                pending: status.pending,
                duplicated: status.duplicates,
                versioned: status.versions,
                errors: status.errors,
                cancelled: status.cancelled ?? 0,
                completedAt: status.completed_at,
                status: status.status,
                statuses: status.items?.map((item: any) => ({
                  id: item.id,
                  fileName: item.file_name,
                  status: item.status === 'duplicated' ? 'duplicate' : item.status,
                  errorMessage: item.error_message,
                  candidateName: item.candidate_name,
                  resumeId: item.resume_id,
                })) || [],
              }
            : record
        ));
        const hasActiveItems = status.items?.some((item: any) =>
          item.status === 'pending' || item.status === 'processing'
        ) ?? false;
        if (status.status === 'completed' || !hasActiveItems) {
          clearInterval(pollInterval);
          pollingIntervalsRef.current.delete(pollInterval);
          fetchUploadHistory();
          // Stay in whatever folder/search the user is looking at — an
          // unfiltered refresh here swapped the table and the header count for
          // the whole library mid-view.
          fetchData(appliedSearchQuery, filters, selectedFolder, true);
          refreshAllResumesTotal();
        }
      } catch {
        clearInterval(pollInterval);
        pollingIntervalsRef.current.delete(pollInterval);
      }
    }, 3000);
    pollingIntervalsRef.current.add(pollInterval);
    // Safety: stop polling after 10 minutes regardless
    setTimeout(() => {
      clearInterval(pollInterval);
      pollingIntervalsRef.current.delete(pollInterval);
    }, 600000);
  };

  /* The "All Resumes" badge is the only count not served by the folders API,
     so a refresh that stays inside a folder can't update it. One page_size=1
     request gets the exact number without disturbing the current view — used
     after uploads, which is when the badge would otherwise lag or flicker
     between the folder total and the global one. */
  const refreshAllResumesTotal = async () => {
    try {
      // Same rule as the All Resumes listing: active resumes only, so the badge
      // and the table can never disagree about archived ones.
      const res = await resumeService.list({
        source: 'my-resumes',
        page: 1,
        page_size: 1,
        include_archived: false,
      });
      allResumesTotalRef.current = res.total;
      setAllResumesTotal(res.total);
      setFolders(prev => prev.map(f => (f.id === 'all' ? { ...f, count: res.total } : f)));
    } catch {
      // Keep the last known figure rather than flashing a wrong one.
    }
  };

  /* Bring every folder badge in line with what opening that folder lists, by
     asking the same endpoint the table uses for each folder's total. The
     folders API counts stored rows — versions included — so its numbers can
     read higher than the list ever shows.

     Bounded on purpose: one small request per folder, only from the plain
     unfiltered view (page load and post-upload refreshes), and skipped
     entirely for large trees where the fan-out would cost more than the
     inconsistency. Those keep the server's own count. */
  const MAX_FOLDERS_TO_RECONCILE = 30;
  const reconcilingFoldersRef = useRef(false);
  const lastReconciledRef = useRef('');

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
    if (flat.length === 0 || flat.length > MAX_FOLDERS_TO_RECONCILE) return;

    // The server's numbers are the input to this correction, so re-running it
    // on an identical snapshot can only produce the same answer. Without this,
    // every page change on the unfiltered view refired the whole fan-out.
    const signature = JSON.stringify(flat.map(f => [f.id, f.count]));
    if (signature === lastReconciledRef.current) return;
    lastReconciledRef.current = signature;

    reconcilingFoldersRef.current = true;
    try {
      const totals = await Promise.all(
        flat.map(async (folder) => {
          try {
            const res = await resumeService.list({
              source: 'my-resumes',
              folder_id: folder.id,
              page: 1,
              page_size: 1,
              // Folder badges count what the folder lists — and Archived
              // Resumes lists archived rows, so this mirrors the table's rule.
              include_archived: true,
            });
            return [folder.id, res.total] as const;
          } catch {
            return [folder.id, null] as const;
          }
        }),
      );

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
    }
  };

  const fetchData = async (searchTerm?: string, currentFilters?: any, folderId?: string, silent?: boolean) => {
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
      pendingFetchRef.current?.resolve?.();
      /* Returns a promise that settles when the REPLAY finishes, not now —
         callers use it to decide when the table has really caught up. */
      return new Promise<void>(resolve => {
        pendingFetchRef.current = { searchTerm, currentFilters, folderId, silent, resolve };
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
        if (currentFilters.uploadDateFrom) {
          searchParams.upload_date_from = currentFilters.uploadDateFrom;
        }
        if (currentFilters.uploadDateTo) {
          searchParams.upload_date_to = currentFilters.uploadDateTo;
        }
        if (currentFilters.sourceType) {
          searchParams.source_type = currentFilters.sourceType;
        }
      }

      const [resumeResponse, folderResponse] = await Promise.all([
        resumeService.list(searchParams),
        folderService.list().catch(() => []),
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

      // Ensure "Archived Resumes" folder always exists
      const hasArchivedFolder = apiFolders.some(f => f.name === 'Archived Resumes' && !f.parentId);
      if (!hasArchivedFolder) {
        try {
          const newArchivedFolder = await folderService.create('Archived Resumes');
          const archivedFolderConverted: FolderType = {
            id: newArchivedFolder.id,
            name: newArchivedFolder.name,
            count: 0,
            parentId: newArchivedFolder.parent_id,
          };
          apiFolders = [...apiFolders, archivedFolderConverted];
        } catch (error) {
          console.error('Failed to create Archived Resumes folder:', error);
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
      const isUnfiltered = Object.keys(searchParams).every(key => BASE_SEARCH_PARAM_KEYS.includes(key));
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

      setResumes(convertedResumes);
      setTotalItems(resumeResponse.total);
      setTotalPages(resumeResponse.total_pages);
      setFolders(applyCachedCorrections(rawFolders));

      // Same correction for every other folder, so the badges are right before
      // the user opens them. Only off the unfiltered view — see the helper.
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
      toast.error('Failed to load resumes');
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
    setSelectedResumes(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  // Only act on currently visible IDs. Selections in OTHER folders / pages
  // must be preserved — wiping them would surprise users with multi-folder
  // selections (e.g. picking 5 in folder A then opening folder B and clicking
  // Select All used to drop the original 5).
  const handleSelectAll = (selected: boolean) => {
    const visibleIds = filteredResumes.map(r => r.id);
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
      const r = resumes.find(r => r.id === id);
      return r?.candidate_name || r?.file_name || 'this resume';
    });
    setDeleteResumeConfirm({ isOpen: true, ids, names });
  };

  const confirmDeleteResumes = async () => {
    const { ids } = deleteResumeConfirm;
    setDeleteResumeConfirm({ isOpen: false, ids: [], names: [] });
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
      toast.error('Failed to delete resume(s)');
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
    /* Which folder this move might empty, and what it held before the move.
       Read here, off the pre-move state: `setFolders` below queues a patch, it
       does not update `folders` in this closure.

       The folder on screen, deliberately — not "wherever the rows came from".
       A selection can span folders (handleSelectAll keeps picks made in other
       folders), and the rule is about the view the user would otherwise be
       left staring at. */
    const sourceFolderId = getViewedFolderId();
    const sourceCountBefore =
      sourceFolderId && sourceFolderId !== folderId
        ? getFolderById(sourceFolderId)?.count
        : undefined;
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

      /* Where the user ends up. Driven by what the SOURCE folder has left, not
         by which folder was the destination — so it reads the same for the
         root folder, Archived Resumes, or any folder a customer made.

         Emptied it: follow the resumes into the destination rather than leave
         the user on a folder with nothing in it. Setting the folder is enough
         to load it — the params effect refetches on `selectedFolder`, which is
         what puts the moved rows on screen.

         Still holds resumes: hold position and refresh, so the moved rows drop
         out of the list. The refresh is not optional in list view — it renders
         the server page as-is, so a moved row keeps its seat until the next
         fetch. (Card view filters by `folderId` and drops it immediately, but
         it still needs the fetch for the page count.)

         `undefined` count means the source folder isn't known here — an
         aggregate view, a move back into the same folder, or a folder missing
         from state. Nothing to empty, so nothing to do. */
      const sourceRemaining =
        sourceCountBefore === undefined
          ? undefined
          : Math.max(0, sourceCountBefore - (leaving.get(sourceFolderId!) || 0));

      if (sourceRemaining === 0) {
        if (viewMode === 'card') {
          navigateToFolder(folderId);
        } else {
          setSelectedFolder(folderId);
          setCurrentPage(1);
        }
      } else if (sourceRemaining !== undefined) {
        fetchData(appliedSearchQuery, filters, selectedFolder, true);
      }
    } catch (error) {
      toast.error('Failed to move resumes');
    }
  };

  // Handle archive resumes - sets is_archived AND moves to Archived Resumes folder
  const handleArchiveResumes = async (resumeIds: string[]) => {
    try {
      // Find the "Archived Resumes" folder
      const archivedFolder = folders.find(f => f.name === 'Archived Resumes' && !f.parentId);
      if (!archivedFolder) {
        toast.error('Archived Resumes folder not found');
        return;
      }

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
      /* Re-query the view the same way unarchive does: removing the rows above
         keeps the page correct, but the server owns the page's totals and what
         backfills from the next page. */
      isFetchingRef.current = false;
      fetchData(appliedSearchQuery, filters, selectedFolder, true);
      toast.success(`${resumeIds.length} resume(s) archived`);
    } catch (error) {
      toast.error('Failed to archive resumes');
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
      // Refetch the current folder view — the displayed list (`filteredResumes`)
      // is the server-returned page for the selected folder, so the
      // just-unarchived row won't disappear until we re-query.
      isFetchingRef.current = false;
      fetchData(appliedSearchQuery, filters, selectedFolder, true);

      const restoredToOriginal = restorations.filter(r => r.target !== rootFolder.id).length;
      toast.success(
        restoredToOriginal === resumeIds.length
          ? `${resumeIds.length} resume(s) unarchived and restored to their original folder`
          : restoredToOriginal === 0
            ? `${resumeIds.length} resume(s) unarchived (moved to Root — original folder not remembered)`
            : `${resumeIds.length} resume(s) unarchived (${restoredToOriginal} restored, ${resumeIds.length - restoredToOriginal} to Root)`
      );
    } catch (error) {
      toast.error('Failed to unarchive resumes');
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
      const resume = resumes.find(r => r.id === resumeId);
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
      toast.error('Failed to download resume', { id: 'bulk-download' });
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
        const resume = resumes.find(r => r.id === resumeId);
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
      toast.error('Failed to create ZIP file', { id: 'zip-download' });
    } finally {
      setIsDownloadingZip(false);
    }
  };

  // Handle Assessment button click
  const handleAssessment = async () => {
    if (selectedResumes.length === 0) {
      toast.error('Please select at least one resume');
      return;
    }
    // Fetch active assessments if not already loaded
    if (activeAssessments.length === 0) {
      await fetchActiveAssessments();
    }
    setIsAssessmentModalOpen(true);
  };

  // Fetch active assessments for the Assessment modal.
  // Revoked assessments are filtered out — once the recruiter has revoked
  // invites on an assessment they shouldn't be able to send fresh invites
  // through any other module; they must duplicate it to start a new round.
  const fetchActiveAssessments = async () => {
    setLoadingAssessments(true);
    try {
      const response = await assessmentService.list({ status: 'published', page_size: 100 });
      const revokedIds = getLocallyRevokedAssessmentIds();
      const filtered = (response.items || []).filter(
        (a: any) => !isAssessmentRevoked(a, revokedIds)
      );
      setActiveAssessments(filtered);
    } catch (error) {
      console.error('Failed to load active assessments:', error);
      toast.error('Failed to load active assessments');
    } finally {
      setLoadingAssessments(false);
    }
  };

  // Handle AI Talent Match button click
  const handleAIInterview = () => {
    if (selectedResumes.length === 0) {
      toast.error('Please select at least one resume');
      return;
    }
    // An archived resume can't be put in front of an interviewer, same rule the
    // scoring action applies.
    const archivedCount = resumes
      .filter(r => selectedResumes.includes(r.id))
      .filter(r => isResumeArchived(r)).length;
    if (archivedCount > 0) {
      toast.error(`Archived resume${archivedCount > 1 ? 's' : ''} cannot be invited to an AI interview. Please select active resumes only.`);
      return;
    }
    setIsAIInterviewPickerOpen(true);
  };

  const handleAITalentMatch = async () => {
    if (selectedResumes.length === 0) {
      toast.error('Please select at least one resume');
      return;
    }
    /* The dialog loads the job list itself now, so this no longer gates the
       open — it just warms the local copy the submit handler falls back on. */
    if (publishedJobs.length === 0) void fetchPublishedJobs();
    setIsAITalentMatchModalOpen(true);
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
      toast.error('Failed to load jobs');
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

  // Handle apply to job. One ticked candidate or fifty, the same dialog opens:
  // the Candidates Selected panel lists them on their latest version, and the
  // eye beside a row is where another version is read and picked. A separate
  // version-selector step for the single-candidate case meant the two flows
  // looked nothing alike for no reason.
  const handleApplyToJob = async () => {
    if (selectedResumes.length === 0) return;

    // Check if any selected resumes are archived (by flag or folder)
    const selectedResumeObjects = resumes.filter(r => selectedResumes.includes(r.id));
    const archivedCount = selectedResumeObjects.filter(r => isResumeArchived(r)).length;

    if (archivedCount > 0) {
      toast.error(`Archived resume${archivedCount > 1 ? 's' : ''} cannot be applied to any job. Please select active resumes only.`);
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
  const handleApplyToJobSubmit = async (resumeIds: string[], jobIds: string[], jobRecords?: Job[]) => {
    if (jobIds.length === 0 || resumeIds.length === 0) return;

    setIsApplyToJobModalOpen(false);

    /* The dialog reads the job list itself — from the same endpoint and mapping
       as the Job Openings page — so take the record it hands back; the locally
       fetched list is only a fallback. */
    const jobId = jobIds[0];
    const selectedJob = jobRecords?.[0] || publishedJobs.find(j => j.id === jobId);

    try {
      // Check for existing scores (duplicate check)
      const duplicateCheck = await scoringService.checkExistingScores(jobId, resumeIds);

      // If there are existing scores, show warning
      if (duplicateCheck.existing_count > 0) {
        setDuplicateScoringWarning({
          isOpen: true,
          jobId: jobId,
          jobTitle: duplicateCheck.jd_title,
          resumeIds: resumeIds,
          existingScores: duplicateCheck.existing_scores,
          newCount: duplicateCheck.new_count,
        });
        return; // Stop here and wait for user decision
      }

      // No duplicates - proceed with scoring
      await proceedWithScoring(jobId, resumeIds, selectedJob?.title || duplicateCheck.jd_title);
    } catch (error: any) {
      console.error('Failed to check duplicates or start scoring:', error);
      toast.error(error.message || 'Failed to start scoring');
    }
  };

  // Proceed with scoring (extracted for reuse in duplicate confirmation)
  const proceedWithScoring = async (jobId: string, resumeIds: string[], jobTitle: string) => {
    try {
      // Start async bulk scoring via Celery (resumeIds already have correct version IDs)
      const response = await scoringService.startBulkScoringAsync(jobId, resumeIds);

      // Get candidate names for the selected resumes
      const resumeItems = resumeIds.map(id => {
        const resume = resumes.find(r => r.id === id);
        return {
          resumeId: id,
          candidateName: resume?.candidateName || resume?.candidate_name || resume?.name || 'Unknown',
        };
      });

      // Store batch info for the resume-scoring page to poll (including resume items for fallback)
      const scoringData = {
        batchId: response.batch_id,
        jobId: response.jd_id,
        jobTitle: response.jd_title,
        totalResumes: response.total_resumes,
        resumeItems: resumeItems,
      };
      sessionStorage.setItem('pendingScoringBatch', JSON.stringify(scoringData));

      // Clear selection and navigate to resume scoring page
      setSelectedResumes([]);
      router.push(`/recruitment/resume-scoring?batch_id=${response.batch_id}`);
    } catch (error: any) {
      console.error('Failed to start scoring:', error);
      toast.error(error.message || 'Failed to start scoring');
    }
  };

  // Handle scoring only new candidates (remove duplicates)
  const handleScoreOnlyNew = async () => {
    const { jobId, resumeIds, jobTitle, existingScores } = duplicateScoringWarning;

    // Filter out already scored resumes
    const alreadyScoredIds = existingScores.map(s => s.resume_id);
    const newResumeIds = resumeIds.filter(id => !alreadyScoredIds.includes(id));

    setDuplicateScoringWarning({ isOpen: false, jobId: '', jobTitle: '', resumeIds: [], existingScores: [], newCount: 0 });

    if (newResumeIds.length === 0) {
      toast.error('All selected candidates are already scored');
      return;
    }

    // Proceed with scoring only new candidates
    await proceedWithScoring(jobId, newResumeIds, jobTitle);
    toast.success(`Scoring ${newResumeIds.length} new candidate(s), skipped ${alreadyScoredIds.length} duplicate(s)`);
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
      const message = error?.response?.data?.detail || error?.message || 'Unknown error';
      toast.error(`Failed to create folder: ${message}`);
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

  const openUploadToFolder = (folderId?: string) => {
    setUploadTargetFolderId(folderId);
    setIsUploadModalOpen(true);
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
      toast.error('Failed to rename folder');
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
        isFetchingRef.current = false;
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
      toast.error('Failed to delete folder');
    }

    // Close dialog
    setDeleteFolderConfirm({ isOpen: false, folderId: null, folderName: '', resumeCount: 0, parentFolderId: null, parentFolderName: '', contentAction: null, hasSubfolders: false, subfolderCount: 0, subfolderDetails: [], totalResumeCount: 0, subfolderResumeCount: 0, loading: false });
  };

  // Helper function to find or create "root" folder
  const getOrCreateRootFolder = async (): Promise<string> => {
    // Check if "root" folder already exists
    const existingRoot = folders.find(f => f.name.toLowerCase() === 'root' && !f.parentId);
    if (existingRoot) {
      return existingRoot.id;
    }

    // Create "root" folder
    try {
      const newFolder = await folderService.create('root');
      const converted: FolderType = {
        id: newFolder.id,
        name: newFolder.name,
        count: 0,
        parentId: newFolder.parent_id,
      };
      setFolders(prev => [...prev, converted]);
      return newFolder.id;
    } catch (error: any) {
      console.error('Failed to create root folder:', error);
      throw error;
    }
  };

  // Helper function to find or create "Archived Resumes" folder
  const getOrCreateArchivedFolder = async (existingFolders: FolderType[]): Promise<FolderType | null> => {
    // Check if "Archived Resumes" folder already exists
    const existingArchived = existingFolders.find(f => f.name === 'Archived Resumes' && !f.parentId);
    if (existingArchived) {
      return existingArchived;
    }

    // Create "Archived Resumes" folder
    try {
      const newFolder = await folderService.create('Archived Resumes');
      const converted: FolderType = {
        id: newFolder.id,
        name: newFolder.name,
        count: 0,
        parentId: newFolder.parent_id,
      };
      return converted;
    } catch (error: any) {
      console.error('Failed to create Archived Resumes folder:', error);
      return null;
    }
  };

  // Return type mirrors UploadModalProps['onUpload'] (components/UploadModal.tsx). This
  // local annotation had drifted narrower than both what the body actually returns
  // (resumeId / candidateName) and what the modal declares (the richer existingResume).
  const handleUploadResumes = async (files: File[], folderId?: string): Promise<{
    success: boolean;
    error?: string;
    resumeId?: string;
    candidateName?: string;
    existingResume?: {
      id: string;
      candidateName: string;
      uploadedAt?: string;
      email?: string;
      currentTitle?: string;
      folderName?: string;
      version?: number;
    };
    duplicateData?: {
      file: File;
      existingResume: {
        id: string;
        candidate_name: string;
        email: string;
        folder_name?: string;
        folder_path?: string;
        upload_date: string;
        file_size: number;
        file_name: string;
        version: number;
        // sent by the my-resumes duplicate path alongside `version`
        version_count?: number;
      };
      contentDifferences: string[];
      isDuplicate: boolean;
      targetFolderId?: string;
    };
  }> => {
    setUploadStartedThisSession(true);

    // Which batches existed before this upload — anything new afterwards is
    // ours, which is the only way to claim a single-file upload's batch.
    const priorBatchIds = await snapshotBatchIds();

    // If no folder is selected or "All Resumes" is selected, use or create "root" folder
    let targetFolderId = folderId;
    if (!targetFolderId || targetFolderId === 'all') {
      try {
        targetFolderId = await getOrCreateRootFolder();
      } catch (error) {
        return { success: false, error: 'Failed to create root folder for upload' };
      }
    }

    // Auto-open upload history panel immediately when upload starts (for multiple files)
    if (files.length > 1) {
      console.log('[UPLOAD] Auto-opening upload history panel for', files.length, 'files');
      // New batch is about to start processing — land on Currently Processing tab
      setUploadHistoryTab('current');
      setIsUploadHistoryModalOpen(true);
      setIsUploadHistoryMinimized(false);

      // Show "Uploading..." record immediately BEFORE API call
      const tempId = `temp-${Date.now()}`;
      const uploadingRecord = {
        id: tempId,
        date: new Date().toISOString(),
        fileName: `Uploading ${files.length} files...`,
        totalFiles: files.length,
        completed: 0,
        pending: files.length,
        duplicated: 0,
        versioned: 0,
        errors: 0,
        cancelled: 0,
        status: 'uploading',
        source: 'my-resumes' as const,
        statuses: files.map((f, idx) => ({
          id: `temp-file-${idx}`,
          fileName: f.name,
          status: 'pending',
          errorMessage: null,
          candidateName: null,
        })),
      };
      setUploadHistory(prev => [uploadingRecord, ...prev]);
    }

    // For single file, use single upload endpoint
    if (files.length === 1) {
      try {
        const r = await resumeService.upload(files[0], targetFolderId);
        // Optimistic update for instant UI feedback
        const converted = convertApiResume(r);
        setResumes(prev => [converted, ...prev]);
        toast.success('Resume uploaded successfully');

        /* Record it in history right away. The single-upload endpoint returns
           a resume, not a batch, and the server may not create a batch row for
           it at all — without this the upload would never appear in the
           history. If a real batch does turn up carrying this resume id, the
           merge in `withLocalUploads` hides this stand-in. */
        const localRecord = {
          id: `local-${r.id}`,
          date: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          fileName: files[0].name,
          totalFiles: 1,
          completed: 1,
          pending: 0,
          duplicated: 0,
          versioned: 0,
          errors: 0,
          cancelled: 0,
          status: 'completed',
          source: 'my-resumes' as const,
          statuses: [{
            id: `local-item-${r.id}`,
            fileName: files[0].name,
            status: 'completed',
            errorMessage: null,
            candidateName: r.candidate_name || null,
            resumeId: r.id,
          }],
        };
        rememberLocalUpload(localRecord);
        setUploadHistory(prev => [localRecord, ...prev]);

        // Background refresh to get correct uploaded_by_name, version counts, etc.
        setTimeout(async () => {
          isFetchingRef.current = false; // Reset guard so fetchData can run
          // Refresh the view the user is actually on, and update the pinned
          // All Resumes count separately — an unfiltered refresh here made the
          // folder view and its badge jump to the whole library for a moment.
          fetchData(appliedSearchQuery, filters, selectedFolder, true);
          refreshAllResumesTotal();
          // Claim the batch this upload created before reading history back,
          // otherwise the ownership filter would treat it as somebody else's.
          await adoptNewBatchIds(priorBatchIds);
          fetchUploadHistory();
        }, 500);
        return {
          success: true,
          resumeId: r.id,
          candidateName: r.candidate_name || files[0].name
        };
      } catch (error: any) {
        console.log('[UPLOAD-ERROR] Caught error:', error);
        console.log('[UPLOAD-ERROR] Response status:', error?.response?.status);
        console.log('[UPLOAD-ERROR] Response data:', error?.response?.data);

        // Check for duplicate error (409 Conflict)
        if (error?.response?.status === 409) {
          const detail = error?.response?.data?.detail;
          console.log('[UPLOAD-ERROR] 409 detail:', detail);
          const existingResume = detail?.existing_resume;
          const isExactDuplicate = detail?.is_exact_duplicate ?? true;
          const contentDifferences = detail?.content_differences || [];
          console.log('[UPLOAD-ERROR] existingResume:', existingResume);

          if (existingResume) {
            // Return existing resume info - UploadModal will decide how to handle it
            // If onScoreResume is provided, UploadModal shows DuplicateResumeDetectedModal
            // Otherwise, show the full duplicate resolution modal here
            return {
              success: false,
              error: `A resume for ${existingResume.candidate_name || 'this candidate'} already exists in your Shared Resume Database.`,
              existingResume: {
                id: existingResume.id,
                candidateName: existingResume.candidate_name || existingResume.file_name || 'Unknown',
                email: existingResume.email || '',
                currentTitle: existingResume.current_title || '',
                folderName: existingResume.folder_name || '',
                uploadedAt: existingResume.upload_date || '',
                version: existingResume.version || 1,
              },
              // Also include full data for the old duplicate modal fallback
              duplicateData: {
                file: files[0],
                existingResume: {
                  id: existingResume.id,
                  candidate_name: existingResume.candidate_name || existingResume.file_name || 'Unknown',
                  email: existingResume.email || '',
                  folder_name: existingResume.folder_name,
                  folder_path: existingResume.folder_path || 'My Resumes',
                  upload_date: existingResume.upload_date || '',
                  file_size: existingResume.file_size || 0,
                  file_name: existingResume.file_name || '',
                  version: existingResume.version || 1,
                  version_count: existingResume.version_count || existingResume.version || 1,
                },
                contentDifferences: contentDifferences,
                isDuplicate: isExactDuplicate,
                targetFolderId: targetFolderId,
              }
            };
          }

          return {
            success: false,
            error: 'This resume already exists in the system.',
          };
        }
        // Check for validation errors (400 Bad Request)
        else if (error?.response?.status === 400) {
          const detail = error?.response?.data?.detail;

          // Handle INVALID_RESUME error
          if (detail?.error === 'INVALID_RESUME') {
            return {
              success: false,
              error: detail?.message || 'The uploaded file does not appear to be a valid resume. It may be a scorecard, invoice, or other document type.',
            };
          }

          // Handle NO_CONTENT error
          if (detail?.error === 'NO_CONTENT') {
            return {
              success: false,
              error: detail?.message || 'The resume file has no readable content. The file may be blank, image-only, or heavily formatted.',
            };
          }

          // Handle other 400 errors
          return {
            success: false,
            error: detail?.message || `Failed to upload ${files[0].name}`,
          };
        }
        // Check for read-only mode (403 Forbidden)
        else if (error?.response?.status === 403) {
          const detail = error?.response?.data?.detail;
          if (detail?.error === 'READ_ONLY_MODE') {
            return {
              success: false,
              error: 'Uploads are disabled because your account is in read-only mode. Please contact your administrator.',
            };
          }
          return {
            success: false,
            error: 'You do not have permission to upload resumes. Please contact your administrator.',
          };
        }
        // Check for AI parsing service unavailable (503 Service Unavailable) -
        // e.g. RU_OPENAI_API_KEY not configured on the backend.
        else if (error?.response?.status === 503) {
          const detail = error?.response?.data?.detail;
          return {
            success: false,
            error: detail?.message || 'Resume upload is temporarily unavailable. Please try again later or contact your administrator.',
          };
        }
        else {
          // Fall back to whatever reason the backend gave, even for status
          // codes not explicitly handled above, instead of a generic message
          // that hides why the upload actually failed.
          const detail = error?.response?.data?.detail;
          const backendMessage = typeof detail === 'string' ? detail : detail?.message;
          return { success: false, error: backendMessage || `Failed to upload ${files[0].name}` };
        }
      }
    }

    // For multiple files, use bulk upload with async processing
    try {
      // Note: previous completed batches are intentionally kept — the
      // Completed tab in the Upload History modal serves as the history
      // view, so wiping on every new upload would defeat its purpose.

      // Start bulk upload - returns immediately with batch info
      const batch = await resumeService.uploadBulk(files, targetFolderId);
      // Claim it straight away — every later refresh filters on this ledger.
      rememberBatchIds([batch.id]);

      // Fetch full status with items immediately
      let initialStatuses: any[] = [];
      try {
        const fullStatus = await resumeService.getBatchStatus(batch.id);
        initialStatuses = fullStatus.items?.map((item: any) => ({
          id: item.id,
          fileName: item.file_name,
          status: item.status === 'duplicated' ? 'duplicate' : item.status,
          errorMessage: item.error_message,
          candidateName: item.candidate_name,
          resumeId: item.resume_id,
        })) || [];
      } catch (e) {
        console.error('Error fetching initial batch status:', e);
      }

      // Replace temp "Uploading..." record with real batch data
      const newBatchRecord = {
        id: batch.id,
        date: new Date().toISOString(),
        fileName: `Bulk Upload (${batch.total_files} files)`,
        totalFiles: batch.total_files,
        completed: batch.completed || 0,
        pending: batch.pending || batch.total_files,
        duplicated: batch.duplicates || 0,
        versioned: batch.versions || 0,
        errors: batch.errors || 0,
        cancelled: batch.cancelled || 0,
        status: batch.status || 'processing',
        source: 'my-resumes' as const,
        statuses: initialStatuses,
      };
      // Remove temp record and add real one
      setUploadHistory(prev => [newBatchRecord, ...prev.filter(r => !r.id.startsWith('temp-'))]);

      // Poll for batch status until complete (REDUCED: every 3 seconds instead of 1)
      const pollInterval = setInterval(async () => {
        try {
          const status = await resumeService.getBatchStatus(batch.id);

          const processed = status.completed + status.errors + status.duplicates;
          const total = status.total_files;
          const percentage = Math.round((processed / total) * 100);

          // Update upload history to show progress including individual file statuses
          setUploadHistory(prev => prev.map(record =>
            record.id === batch.id
              ? {
                  ...record,
                  completed: status.completed,
                  pending: status.pending,
                  duplicated: status.duplicates,
                  versioned: status.versions,
                  errors: status.errors,
                  cancelled: status.cancelled ?? 0,
                  completedAt: status.completed_at,
                  status: status.status,
                  statuses: status.items?.map((item: any) => ({
                    id: item.id,
                    fileName: item.file_name,
                    status: item.status === 'duplicated' ? 'duplicate' : item.status,
                    errorMessage: item.error_message,
                    candidateName: item.candidate_name,
                    resumeId: item.resume_id,
                  })) || [],
                }
              : record
          ));

          // Check if batch is complete.
          // IMPORTANT: Do NOT stop on status.pending === 0 alone — the backend uses
          // 'pending' only for queued items. Once a file moves to 'processing',
          // pending drops to 0 but the file is still running. Stopping here causes
          // it to freeze at "⚡ Processing..." forever.
          const hasActiveItems = status.items?.some((item: any) =>
            item.status === 'pending' || item.status === 'processing'
          ) ?? false;

          if (status.status === 'completed' || !hasActiveItems) {
            clearInterval(pollInterval);
            pollingIntervalsRef.current.delete(pollInterval); // Remove from tracking

            // Refresh upload history and resume list — keeping the user's
            // folder/search in place, with the global count refreshed on its own.
            fetchUploadHistory();
            fetchData(appliedSearchQuery, filters, selectedFolder, true);
            refreshAllResumesTotal();
          }
        } catch (pollError) {
          console.error('Error polling batch status:', pollError);
          // On error, stop polling this batch to prevent infinite errors
          clearInterval(pollInterval);
          pollingIntervalsRef.current.delete(pollInterval);
        }
      }, 3000); // FIXED: Poll every 3 seconds (was 1 second) = 3x fewer requests

      // Track interval for cleanup
      pollingIntervalsRef.current.add(pollInterval);

      // Set a timeout to stop polling after 10 minutes
      const stopTimeout = setTimeout(() => {
        clearInterval(pollInterval);
        pollingIntervalsRef.current.delete(pollInterval);
        console.log('[Upload] Polling stopped after 10 minutes timeout');
      }, 600000);

      return { success: true };
    } catch (error: any) {
      // Check for read-only mode (403 Forbidden)
      if (error?.response?.status === 403) {
        const detail = error?.response?.data?.detail;
        if (detail?.error === 'READ_ONLY_MODE') {
          return {
            success: false,
            error: 'Uploads are disabled because your account is in read-only mode. Please contact your administrator.',
          };
        }
        return {
          success: false,
          error: 'You do not have permission to upload resumes. Please contact your administrator.',
        };
      }
      // Check for duplicate error (409 Conflict)
      if (error?.response?.status === 409) {
        const detail = error?.response?.data?.detail;
        return {
          success: false,
          error: detail?.message || 'All files are duplicates',
        };
      }
      return { success: false, error: 'Failed to start bulk upload' };
    }
  };

  // Helper function to convert API resume to component type
  const convertApiResume = (r: ApiResume): Resume => ({
    id: r.id,
    name: r.candidate_name || r.file_name?.replace(/\.[^/.]+$/, '') || 'Unknown',
    email: r.email || 'No email',
    phone: r.phone || 'No phone',
    title: r.current_title || 'N/A',
    experience: r.experience_years ? `${r.experience_years} years` : 'N/A',
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
        onAction={isArchivedResumesFolder || !canUploadMyResumes ? undefined : () => openUploadToFolder(folderId)}
      />
    );
  };

  /* Display path of the folder the refused upload was aimed at, for the
     "New Resume (Uploading)" card in the duplicate dialog. `pendingUploadFolderId`
     is the id the upload actually used, which `handleUploadResumes` has already
     resolved to the root folder when the user picked "All Resumes" or nothing —
     so an empty breadcrumb means root, not "unknown". The "My Resumes /" prefix
     matches the shape the backend returns in `folder_path` for the other card. */
  const pendingUploadFolderPath = useMemo(() => {
    if (pendingUploadFolderLabel) return `My Resumes / ${pendingUploadFolderLabel}`;
    const segments = buildBreadcrumbPath(pendingUploadFolderId ?? null).map(f => f.name);
    return ['My Resumes', ...(segments.length > 0 ? segments : ['root'])].join(' / ');
  }, [pendingUploadFolderLabel, pendingUploadFolderId, buildBreadcrumbPath]);

  const selectedCardFolderFilterLabel = CARD_FOLDER_FILTER_OPTIONS.find(option => option.value === cardFolderFilter)?.label;
  const gridToolbarFilterChips =
    cardFolderFilter !== 'all' && selectedCardFolderFilterLabel
      ? [{ key: 'folder-filter', label: `Folder: ${selectedCardFolderFilterLabel}`, onClear: () => setCardFolderFilter('all') }]
      : [];

  // Handle duplicate resolution
  const handleResolveDuplicates = async (resolutions: { fileIndex: number; action: 'discard' | 'overwrite' | 'version' }[]) => {
    /* No "Processing duplicate resolution..." loading toast here — the
       DuplicateResumeModal's Confirm All/Continue button shows its own
       loading state while this runs, so a floating toast on top of it was
       redundant. Only the final outcome gets a toast. */
    // Same as a plain upload: whatever batch this creates has to be claimed,
    // or the ownership filter will read it as another account's.
    const priorBatchIds = await snapshotBatchIds();

    try {
      let discardedCount = 0;
      let overwrittenCount = 0;
      let versionedCount = 0;

      for (const resolution of resolutions) {
        const duplicateFile = duplicateFiles[resolution.fileIndex];
        if (!duplicateFile) continue;

        if (resolution.action === 'discard') {
          // Just skip this file
          discardedCount += 1;
        } else {
          // Use the resolve duplicate and upload endpoint
          await resumeService.resolveDuplicateAndUpload(
            duplicateFile.file,
            duplicateFile.existingResume.id,
            resolution.action,
            pendingUploadFolderId
          );

          if (resolution.action === 'overwrite') {
            overwrittenCount += 1;
          } else {
            versionedCount += 1;
          }
        }
      }

      const summaryParts = [
        discardedCount > 0 && `${discardedCount} discarded`,
        overwrittenCount > 0 && `${overwrittenCount} overwritten`,
        versionedCount > 0 && `${versionedCount} saved as new version${versionedCount > 1 ? 's' : ''}`,
      ].filter(Boolean);
      if (summaryParts.length > 0) {
        toast.success(`Duplicate resolution complete: ${summaryParts.join(', ')}`);
      }

      // Refresh full list from server to get correct data
      setTimeout(async () => {
        isFetchingRef.current = false;
        fetchData(appliedSearchQuery, filters, selectedFolder, true);
        refreshAllResumesTotal();
        await adoptNewBatchIds(priorBatchIds);
        fetchUploadHistory();
      }, 500);
    } catch (error: any) {
      console.error('Error resolving duplicates:', error);
      toast.error('Failed to resolve duplicate');
    } finally {
      setDuplicateFiles([]);
      setPendingUploadFolderId(undefined);
      setPendingUploadFolderLabel(undefined);
      setIsDuplicateModalOpen(false);
    }
  };

  if (loading) {
    // Structure-matched skeleton mirroring the real My Resumes page: same
    // outer wrapper / white card, the same header block (icon box, title +
    // count chip, subtitle, the two action buttons), the search toolbar row,
    // then the shared ResumeTableSkeleton in place of the ResumeTable.
    return (
      <main className="flex-1 overflow-x-clip bg-slate-50">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
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
            <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-3 sm:p-4 mb-4">
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
    <main ref={rootRef} className="flex-1 overflow-x-clip bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
      {header}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5">
        <div className="w-full sm:w-auto flex items-start gap-3">
          <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex-shrink-0">
            <FileText className="h-4 w-4 text-brand-blue" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
              <h1 className="text-lg sm:text-xl font-semibold text-gray-900 tracking-tight">My Resume Database</h1>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/15">
                {totalItems} Resumes
              </span>
            </div>
            <p className="text-xs sm:text-sm text-gray-600">Resumes uploaded by you</p>
          </div>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          {canViewMyResumes && (
            <button
              onClick={openUploadHistoryModal}
              disabled={!hasUploadHistory}
              title={hasUploadHistory ? 'View upload history' : 'No uploads yet'}
              className={`relative flex items-center justify-center gap-1.5 bg-white px-3 py-2 rounded-md border transition-colors text-sm flex-1 sm:flex-initial ${
                hasUploadHistory
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
          )}
          {canUploadMyResumes && (
            <button
              onClick={() => openUploadToFolder(undefined)}
              className="flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 rounded-md transition-all text-sm flex-1 sm:flex-initial bg-brand-blue hover:bg-brand-blue-2 text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 hover:shadow-md hover:shadow-brand-blue/30 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Upload Resume</span>
              <span className="sm:hidden">Upload</span>
            </button>
          )}
        </div>
      </div>

      {/* tf-round-edges instead of overflow-hidden: overflow-hidden makes this
          card a scroll container, which the sticky search bar below would pin to
          (scrolling away with the card) instead of to the page. tf-round-edges
          keeps the rounded corners without creating that scroll container. */}
      <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 tf-round-edges">
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
              selectedResumes.every(id => resumes.find(r => r.id === id)?.isArchived));
          return (
          <BulkActionsBar
            selectedCount={selectedResumes.length}
            onCancel={() => setSelectedResumes([])}
            onMoveToFolder={canMoveMyResumes ? (folderId) => handleMoveToFolder(selectedResumes, folderId) : undefined}
            onApplyToJob={!isArchivedContext && hasPlanFeature('resume_scoring') && (isTenantAdmin || (hasPermission('canRunScoring') && hasPermissionCode('my_resumes:apply_job'))) ? handleApplyToJob : undefined}
            onDownload={handleBulkDownload}
            onDelete={canDeleteMyResumes ? () => handleDeleteResumes(selectedResumes) : undefined}
            folders={folders.filter(f => f.id !== 'all')}
            onAssessment={!isArchivedContext && hasPlanFeature('assessment') && (isTenantAdmin || (hasPermission('canCreateAssessments') && hasPermissionCode('my_resumes:assessment'))) ? handleAssessment : undefined}
            onArchive={!isArchivedContext && canArchiveMyResumes ? () => setIsArchiveModalOpen(true) : undefined}
            onUnarchive={isArchivedContext && canArchiveMyResumes ? () => handleUnarchiveResumes(selectedResumes) : undefined}
            onAITalentMatch={!isArchivedContext && hasPlanFeature('ai_talent_match') && (isTenantAdmin || (hasPermission('canRunAiMatch') && hasPermissionCode('my_resumes:ai_match'))) ? handleAITalentMatch : undefined}
            // No `my_resumes:ai_interview` action code exists yet, so this
            // follows the AI Interviews module's own share permission.
            onAIInterview={!isArchivedContext && hasPlanFeature('ai_interview') && (isTenantAdmin || hasPermission('canShareAIInterviews')) ? handleAIInterview : undefined}
          />
          );
        })()}

        {/* Search pinned to the top of the scroll viewport so it stays reachable
            while the list scrolls beneath it. Opaque bg so rows don't show
            through; z above the rows. */}
        <div className="sticky top-0 z-20 border-b border-gray-200 bg-white p-3">
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-2 xl:flex-row xl:items-start">
              <div className="min-w-0 flex-1">
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
                    router.push(`/recruitment/resume-view/${resume.id}`);
                  }}
                />
              </div>

              {/* Folders only. The resume filter that sat beside it is gone —
                  the search box and the Filter panel already narrow resumes. */}
              {viewMode === 'card' && (
                <div className="grid w-full grid-cols-1 gap-2 xl:w-auto xl:min-w-[190px]">
                  <ToolbarFilterSelect<CardFolderFilter>
                    label="Folder Filters"
                    value={cardFolderFilter}
                    options={CARD_FOLDER_FILTER_OPTIONS}
                    onChange={setCardFolderFilter}
                    icon={<Folder className="h-4 w-4" />}
                  />
                </div>
              )}

              <div className="flex flex-wrap items-start gap-2 xl:w-auto">
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
                />

                {/* No "View" label: the two icons carry their own tooltips and
                    the picked one is already lit. */}
                <div className="flex h-10 items-center justify-center gap-1 rounded-lg bg-brand-blue/5 px-1.5 ring-1 ring-brand-blue/10">
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    className={`rounded p-2 transition-all ${
                      viewMode === 'list'
                        ? 'bg-white text-brand-blue shadow-sm shadow-brand-blue/10'
                        : 'text-gray-600 hover:text-brand-blue'
                    }`}
                    aria-label="List View" title="List View"
                  >
                    <List className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('card')}
                    className={`rounded p-2 transition-all ${
                      viewMode === 'card'
                        ? 'bg-white text-brand-blue shadow-sm shadow-brand-blue/10'
                        : 'text-gray-600 hover:text-brand-blue'
                    }`}
                    aria-label="Grid View" title="Grid View"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {viewMode === 'card' && gridToolbarFilterChips.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-gray-500">Grid filters:</span>
                {gridToolbarFilterChips.map((chip) => (
                  <span key={chip.key} className="inline-flex items-center gap-1 rounded-full bg-brand-blue/5 px-2 py-0.5 text-xs text-brand-blue ring-1 ring-brand-blue/20">
                    {chip.label}
                    <button
                      type="button"
                      onClick={chip.onClear}
                      className="rounded-full p-0.5 transition-colors hover:bg-brand-blue/10"
                      aria-label={`Clear ${chip.label}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Search Results Summary */}
        {viewMode === 'list' && appliedSearchQuery && (
          <div className="px-3 sm:px-4 py-2 sm:py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-700">
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
          <div className="flex flex-col md:flex-row">
            <FolderTree
              folders={folders}
              selectedFolder={selectedFolder}
              onSelectFolder={(folderId: string) => { setSelectedFolder(folderId); setCurrentPage(1); }}
              onCreateFolder={canUploadMyResumes ? handleCreateFolder : undefined}
              onRenameFolder={canUpdateMyResumes ? handleRenameFolder : undefined}
              onDeleteFolder={canDeleteMyResumes ? handleDeleteFolder : undefined}
              onUploadToFolder={(folderId) => {
                if (!canUploadMyResumes) return;
                setSelectedFolder(folderId);
                openUploadToFolder(folderId);
              }}
              onMoveToFolder={canMoveMyResumes ? handleMoveToFolder : undefined}
              selectedResumes={selectedResumes}
              resumes={resumes}
              width={folderTreeWidth}
              onWidthChange={setFolderTreeWidth}
            />

            <div className="flex-1 flex flex-col min-w-0">
              {/* Breadcrumb Navigation for List View */}
              {selectedFolder && selectedFolder !== 'all' && (
                <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200 text-sm">
                  <button
                    onClick={() => setSelectedFolder('all')}
                    className="flex items-center gap-1 text-brand-blue hover:text-brand-blue-2 hover:underline transition-colors"
                  >
                    <LayoutGrid className="w-4 h-4" />
                    <span>All Resumes</span>
                  </button>
                  {buildBreadcrumbPath(selectedFolder).map((item, index, arr) => (
                    <div key={item.id} className="flex items-center gap-2">
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                      {index === arr.length - 1 ? (
                        <span className="text-gray-900 font-medium">{item.name}</span>
                      ) : (
                        <button
                          onClick={() => setSelectedFolder(item.id)}
                          className="text-brand-blue hover:text-brand-blue-2 hover:underline transition-colors"
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
                  resumes={filteredResumes}
                  selectedResumes={selectedResumes}
                  onSelectResume={handleSelectResume}
                  onSelectAll={handleSelectAll}
                  onQuickView={(resume) => setQuickViewResume(resume)}
                  onApplyToJob={hasPlanFeature('resume_scoring') && (isTenantAdmin || (hasPermission('canRunScoring') && hasPermissionCode('my_resumes:apply_job'))) ? handleSingleResumeApplyToJob : undefined}
                  onDelete={canDeleteMyResumes ? (id) => handleDelete(id) : undefined}
                  onMoveToFolder={canMoveMyResumes ? handleMoveToFolder : undefined}
                  folders={folders.filter(f => f.id !== 'all' && !(f.name.toLowerCase() === 'root' && !f.parentId))}
                  onViewDetails={(resume) => {
                    sessionStorage.setItem('resumeNavList', JSON.stringify(filteredResumes.map((r) => r.id)));
                    sessionStorage.setItem('resumeNavSource', 'my-resumes');
                    router.push(`/recruitment/resume-view/${resume.id}`);
                  }}
                  highlightQuery={appliedSearchQuery}
                  /* Rows can be dragged into an order of your own, kept per
                     folder — the grip still drops onto a folder to move a
                     resume, and now drops onto a row to place it. */
                  enableRowReorder
                  reorderScopeKey={selectedFolder || 'all'}
                  onArchive={canArchiveMyResumes ? (resumeId) => handleArchiveResumes([resumeId]) : undefined}
                  canShare={canShareMyResumes}
                  canTag={canUpdateMyResumes}
                  disablePagination={true}
                  isArchivedFolder={
                    folders.some(f => f.name === 'Archived Resumes' && !f.parentId && f.id === selectedFolder)
                  }
                  archivedFolderId={folders.find(f => f.name === 'Archived Resumes' && !f.parentId)?.id}
                  /* All Resumes aggregates every folder, so each row names the
                     one folder it actually lives in. Inside a folder the column
                     would repeat that folder on every row, so it is dropped. */
                  getFolderName={selectedFolder === 'all' ? getResumeFolderName : undefined}
                  showEmptyAction={false}
                  emptyState={
                    listControlsActive
                      ? undefined
                      : renderNoResumesEmptyState(selectedFolder === 'all' ? undefined : selectedFolder)
                  }
                />
              </div>
              {totalPages > 0 && (
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={totalItems}
                  itemsPerPage={itemsPerPage}
                  onPageChange={(page) => { setCurrentPage(page); setIsPaginating(true); }}
                  onItemsPerPageChange={(size) => { setItemsPerPage(size); setCurrentPage(1); setIsPaginating(true); }}
                />
              )}
            </div>
          </div>
        ) : (
          // Card View - Folders as Cards with Breadcrumb Navigation
          <div className="p-3 sm:p-4 md:p-6" data-folder-card-boundary>
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
                    <div className="flex flex-wrap items-center gap-1 sm:gap-2 mb-4 sm:mb-6 text-xs sm:text-sm">
                      <button
                        onClick={() => navigateToFolder(null)}
                        className="flex items-center gap-1 text-brand-blue hover:text-brand-blue-2 hover:underline transition-colors"
                      >
                        <LayoutGrid className="w-4 h-4" />
                        <span>All Folders</span>
                      </button>
                      {breadcrumbPath.map((item, index) => (
                        <div key={item.id} className="flex items-center gap-2">
                          <ChevronRight className="w-4 h-4 text-gray-400" />
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
                          <ChevronRight className="w-4 h-4 text-gray-400" />
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
                        <h2 className="font-semibold text-gray-900 text-base sm:text-lg truncate">
                          {currentFolderData.name.toLowerCase() === 'root' && !currentFolderData.parentId
                            ? 'Root (Default)'
                            : currentFolderData.name}
                        </h2>
                        <p className="text-xs sm:text-sm text-gray-500">
                          {foldersToDisplay.length > 0 && `${foldersToDisplay.length} subfolder${foldersToDisplay.length !== 1 ? 's' : ''}`}
                          {foldersToDisplay.length > 0 && visibleFolderResumes.length > 0 && ' • '}
                          {visibleFolderResumes.length > 0 && `${visibleFolderResumes.length} resume${visibleFolderResumes.length !== 1 ? 's' : ''}`}
                          {foldersToDisplay.length === 0 && visibleFolderResumes.length === 0 && !resumeControlsActive && 'Empty folder'}
                          {folderResumes.length > 0 && visibleFolderResumes.length === 0 && resumeControlsActive && 'No matching resumes'}
                        </p>
                      </div>
                        </div>
                        {canUploadMyResumes && currentFolderCanCreateSubfolder ? (
                          <button
                            type="button"
                            onClick={() => openCardFolderInput(cardViewFolder)}
                            className="inline-flex items-center justify-center gap-1 rounded-md border border-brand-blue/20 bg-white px-3 py-2 text-sm text-blue-600 shadow-sm shadow-brand-blue/5 transition-colors hover:border-brand-blue/40 hover:bg-brand-blue/5 hover:text-blue-700 sm:self-start"
                          >
                            <Plus className="w-4 h-4" />
                            New Subfolder
                          </button>
                        ) : currentFolderDepth >= MAX_FOLDER_DEPTH ? (
                          <span className="text-xs sm:text-sm text-gray-500 sm:self-start">
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
                        <h2 className="font-semibold text-gray-900 text-base sm:text-lg">All Resumes</h2>
                        <p className="text-xs sm:text-sm text-gray-500">{visibleFolderResumes.length} resume{visibleFolderResumes.length !== 1 ? 's' : ''}</p>
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
                          <div className="text-center py-12 bg-white border-2 border-dashed border-brand-blue/20 rounded-xl">
                            <div className="w-16 h-16 mx-auto mb-4 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-full flex items-center justify-center">
                              <Folder className="w-8 h-8 text-brand-blue" />
                            </div>
                            <h3 className="text-lg font-medium text-gray-900 mb-2 tracking-tight">No folders match</h3>
                            <p className="text-gray-500">No folders match the current search or filter.</p>
                          </div>
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
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6 items-stretch">
                                {showAllResumesCard && (
                                  <div
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
                                        <h3 className="font-semibold text-sm text-gray-900 truncate">All Resumes</h3>
                                        <p className="text-xs text-gray-500">{totalItems} resume{totalItems !== 1 ? 's' : ''}</p>
                                      </div>
                                      <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
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
                            {canUploadMyResumes && (
                              <button
                                type="button"
                                onClick={() => openCardFolderInput(null)}
                                className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1 cursor-pointer"
                              >
                                <Plus className="w-4 h-4" />
                                New Folder
                              </button>
                            )}
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
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 items-start">
                              {visibleMyFolders.map(folder => renderFolderCard(folder))}
                            </div>
                          ) : myFolders.length > 0 && folderControlsActive ? (
                            <p className="text-xs sm:text-sm text-gray-500">No folders match the current search or filter.</p>
                          ) : systemFolders.length > 0 ? (
                            // Skipped when there are no folders at all — the
                            // page-level empty state below covers that case.
                            <p className="text-xs sm:text-sm text-gray-500">No folders yet. Create one to organize your resumes.</p>
                          ) : null}
                          </>
                        )
                      ) : (
                        <>
                          {hasCurrentSubfolders && (
                            <div className="flex items-center mb-2 sm:mb-3">
                              <h3 className="text-xs sm:text-sm font-medium text-gray-700">Subfolders</h3>
                            </div>
                          )}

                          {cardViewFolder !== 'all' && currentFolderDepth >= MAX_FOLDER_DEPTH && (
                            <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs sm:text-sm text-amber-800">
                              This child subfolder is the deepest allowed level.
                            </div>
                          )}

                          {visibleFoldersToDisplay.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 items-start">
                              {visibleFoldersToDisplay.map(folder => renderFolderCard(folder))}
                            </div>
                          )}
                          {foldersToDisplay.length > 0 && visibleFoldersToDisplay.length === 0 && folderControlsActive && (
                            <p className="mt-3 text-xs sm:text-sm text-gray-500">No subfolders match the current search or filter.</p>
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
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 items-start">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div
                          key={i}
                          className="bg-white border border-gray-100 rounded-xl shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]"
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
                            <h3 className="text-sm font-medium text-gray-700 mb-3">Resumes in this folder</h3>
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
                          <div className="bg-white border border-gray-200 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl overflow-hidden">
                          <ResumeTable
                            resumes={visibleFolderResumes}
                            selectedResumes={selectedResumes}
                            onSelectResume={handleSelectResume}
                            onSelectAll={(selected) => {
                              // Scoped to this folder's rows, not the whole list.
                              if (selected) {
                                setSelectedResumes(prev => [...new Set([...prev, ...visibleFolderResumes.map(r => r.id)])]);
                              } else {
                                setSelectedResumes(prev => prev.filter(id => !visibleFolderResumes.some(r => r.id === id)));
                              }
                            }}
                            onQuickView={(resume) => setQuickViewResume(resume)}
                            onApplyToJob={hasPlanFeature('resume_scoring') && (isTenantAdmin || (hasPermission('canRunScoring') && hasPermissionCode('my_resumes:apply_job'))) ? handleSingleResumeApplyToJob : undefined}
                            onDelete={canDeleteMyResumes ? (id) => handleDelete(id) : undefined}
                            onMoveToFolder={canMoveMyResumes ? handleMoveToFolder : undefined}
                            folders={folders.filter(f => f.id !== 'all' && !(f.name.toLowerCase() === 'root' && !f.parentId))}
                            onViewDetails={(resume) => {
                              sessionStorage.setItem('resumeNavList', JSON.stringify(visibleFolderResumes.map((x) => x.id)));
                              sessionStorage.setItem('resumeNavSource', 'my-resumes');
                              router.push(`/recruitment/resume-view/${resume.id}`);
                            }}
                            highlightQuery={appliedSearchQuery}
                            enableRowReorder
                            reorderScopeKey={cardViewFolder || 'all'}
                            onArchive={canArchiveMyResumes ? (resumeId) => handleArchiveResumes([resumeId]) : undefined}
                            canShare={canShareMyResumes}
                            canTag={canUpdateMyResumes}
                            disablePagination={true}
                            isArchivedFolder={
                              folders.some(f => f.name === 'Archived Resumes' && !f.parentId && f.id === cardViewFolder)
                            }
                            archivedFolderId={folders.find(f => f.name === 'Archived Resumes' && !f.parentId)?.id}
                            /* All Resumes aggregates every folder, so each row
                               names the one it lives in. */
                            getFolderName={cardViewFolder === 'all' ? getResumeFolderName : undefined}
                            showEmptyAction={false}
                          />
                          </div>
                        </div>
                      )}

                      {/* Loading state while the folder's resumes are being
                          fetched. Skeleton mirrors the ResumeTable that renders
                          here once loaded, framed by the same white card. */}
                      {loading && visibleFolderResumes.length === 0 && visibleFoldersToDisplay.length === 0 && (
                        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
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
                        <div className="text-center py-12 bg-white border-2 border-dashed border-brand-blue/20 rounded-xl">
                          <div className="w-16 h-16 mx-auto mb-4 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-full flex items-center justify-center">
                            <FileText className="w-8 h-8 text-brand-blue" />
                          </div>
                          <h3 className="text-lg font-medium text-gray-900 mb-2 tracking-tight">No resumes match</h3>
                          <p className="text-gray-500">Clear search or filters to show more resumes.</p>
                        </div>
                      )}

                      {totalPages > 0 && folderResumes.length > 0 && (
                        <div className="mt-4">
                          <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalItems={totalItems}
                            itemsPerPage={itemsPerPage}
                            onPageChange={(page) => { setCurrentPage(page); setIsPaginating(true); }}
                            onItemsPerPageChange={(size) => { setItemsPerPage(size); setCurrentPage(1); setIsPaginating(true); }}
                          />
                        </div>
                      )}
                    </>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>

      {isUploadModalOpen && (
        <UploadModal
          folders={folders.filter(f => f.id !== 'all' && !(f.name === 'Archived Resumes' && !f.parentId))}
          tenant={null}
          // Pre-select whichever folder the user is currently browsing.
          // Card view uses `cardViewFolder` (drill-down navigation), list view
          // uses `selectedFolder`. Skip the synthetic 'all' value — it's a
          // filter, not a real folder the API knows about. When no folder is
          // selected, the backend routes the upload to the user's root folder.
          targetFolder={(() => {
            if (uploadTargetFolderId) return uploadTargetFolderId;
            const card = cardViewFolder && cardViewFolder !== 'all'
              ? cardViewFolder
              : null;
            const list = selectedFolder && selectedFolder !== 'all' ? selectedFolder : null;
            return card || list || undefined;
          })()}
          onClose={() => {
            setIsUploadModalOpen(false);
            setUploadTargetFolderId(undefined);
          }}
          onUpload={handleUploadResumes}
          onCreateFolder={handleCreateFolder}
          onViewResume={(resumeId) => {
            setIsUploadModalOpen(false);
            sessionStorage.setItem('resumeNavSource', 'my-resumes');
            router.push(`/recruitment/resume-view/${resumeId}`);
          }}
          onDuplicateDetected={(duplicateData) => {
            // Set duplicate files for the DuplicateResumeModal
            setDuplicateFiles([{
              file: duplicateData.file,
              existingResume: duplicateData.existingResume,
              contentDifferences: duplicateData.contentDifferences || [],
              isDuplicate: duplicateData.isDuplicate,
            }]);
            setPendingUploadFolderId(duplicateData.targetFolderId);
            setPendingUploadFolderLabel(duplicateData.targetFolderPath);
            setIsUploadModalOpen(false);
            setIsDuplicateModalOpen(true);
          }}
        />
      )}

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

      {/* Duplicate Resume Modal */}
      {isDuplicateModalOpen && duplicateFiles.length > 0 && (
        <DuplicateResumeModal
          duplicates={duplicateFiles}
          onClose={() => {
            setIsDuplicateModalOpen(false);
            setDuplicateFiles([]);
            setPendingUploadFolderId(undefined);
            setPendingUploadFolderLabel(undefined);
          }}
          onResolve={handleResolveDuplicates}
          targetFolderPath={pendingUploadFolderPath}
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
                : resumes.filter(r => selectedResumes.includes(r.id))
          }
          jobs={publishedJobs}
          onClose={() => {
            setIsApplyToJobModalOpen(false);
            setUploadedResumeToScore(null);
            setSingleResumeToApply(null);
          }}
          onApply={handleApplyToJobSubmit}
        />
      )}

      {/* Duplicate Scoring Warning Modal */}
      {duplicateScoringWarning.isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/50 z-50 animate-in fade-in duration-200" />
          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-[95vw] sm:max-w-2xl max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="flex-shrink-0 flex items-center gap-4 p-6 border-b border-gray-200">
                <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-yellow-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Already Scored - Duplicate Warning</h3>
                  <p className="text-sm text-gray-500">{duplicateScoringWarning.jobTitle}</p>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 min-h-0 overflow-y-auto p-6">
                <p className="text-gray-700 mb-4">
                  <span className="font-semibold text-red-600">{duplicateScoringWarning.existingScores.length} candidate(s)</span> have already been scored for this job description.
                </p>

                {/* List of duplicate candidates */}
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                    Already Scored - Will NOT be Re-scored:
                  </h4>
                  <div className="space-y-2">
                    {duplicateScoringWarning.existingScores.map((score, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white rounded-lg p-3 border border-red-200">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                            <X className="w-4 h-4 text-red-600" />
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">{score.candidate_name}</div>
                            {score.scored_at && (
                              <div className="text-xs text-gray-500">
                                Scored on {formatDateTimeIST(score.scored_at)}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-gray-900">{formatOverallScore(score.overall_rating_10, score.overall_score)}</div>
                          <div className="text-xs text-gray-500 capitalize">{score.match_status}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {duplicateScoringWarning.newCount > 0 ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-sm text-gray-700">
                      <span className="font-semibold text-green-700">{duplicateScoringWarning.newCount} new candidate(s)</span> will be scored if you continue.
                    </p>
                  </div>
                ) : (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <p className="text-sm text-gray-600">
                      All selected candidates are already scored. No new candidates to score.
                    </p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex-shrink-0 flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 rounded-b-xl border-t border-gray-200">
                <button
                  onClick={() => setDuplicateScoringWarning({ isOpen: false, jobId: '', jobTitle: '', resumeIds: [], existingScores: [], newCount: 0 })}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                {duplicateScoringWarning.newCount > 0 && (
                  <button
                    onClick={handleScoreOnlyNew}
                    className="flex items-center gap-2 px-4 py-2 text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Score Only New ({duplicateScoringWarning.newCount})
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-md animate-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="flex items-start justify-between gap-4 p-6 border-b border-gray-200">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-brand-blue/10 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <FileArchive className="w-7 h-7 text-brand-blue" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 tracking-tight">Download as ZIP</h3>
                    <p className="text-sm text-gray-500 mt-0.5">Multiple files selected</p>
                  </div>
                </div>
                <button
                  onClick={() => !isDownloadingZip && setIsZipDownloadModalOpen(false)}
                  disabled={isDownloadingZip}
                  className="p-1 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 flex items-center gap-4 border-b border-gray-200">
                <div className="w-16 h-16 bg-brand-blue/5 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <Users className="w-7 h-7 text-brand-blue" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-brand-blue">
                    {selectedResumes.length}
                    <span className="text-base font-semibold text-gray-900 ml-2">candidates selected</span>
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    All selected resumes will be downloaded and packed in a ZIP file.
                  </p>
                </div>
              </div>

              {/* Info */}
              <div className="flex items-center gap-3 px-6 py-4">
                <div className="w-7 h-7 bg-brand-blue/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <Info className="w-4 h-4 text-brand-blue" />
                </div>
                <p className="text-sm text-gray-700">
                  Do you want to download all selected resumes as a ZIP file?
                </p>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 rounded-b-2xl border-t border-gray-200">
                <button
                  onClick={() => setIsZipDownloadModalOpen(false)}
                  disabled={isDownloadingZip}
                  className="px-5 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleZipDownload}
                  disabled={isDownloadingZip}
                  className="flex items-center gap-2 px-5 py-2.5 text-white bg-brand-blue hover:bg-brand-blue-2 rounded-lg transition-all shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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
          </div>
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-md animate-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="flex items-start justify-between gap-4 p-6 border-b border-gray-200">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-brand-blue/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <Archive className="w-7 h-7 text-brand-blue" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 tracking-tight">Archive Resumes</h3>
                    <p className="text-sm text-gray-500 mt-0.5">Move selected resumes to archive</p>
                  </div>
                </div>
                <button
                  onClick={() => !isArchivingResumes && setIsArchiveModalOpen(false)}
                  disabled={isArchivingResumes}
                  className="p-1 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 flex items-center gap-4 border-b border-gray-200">
                <div className="w-16 h-16 bg-brand-blue/5 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <Users className="w-7 h-7 text-brand-blue" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-brand-blue">
                    {selectedResumes.length}
                    <span className="text-base font-semibold text-gray-900 ml-2">candidates selected</span>
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    The selected resumes will be moved to archive and hidden from the active list.
                  </p>
                </div>
              </div>

              {/* Info */}
              <div className="flex items-center gap-3 px-6 py-4">
                <div className="w-7 h-7 bg-brand-blue/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <Info className="w-4 h-4 text-brand-blue" />
                </div>
                <p className="text-sm text-gray-700">
                  Are you sure you want to archive all selected resumes?
                </p>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 rounded-b-2xl border-t border-gray-200">
                <button
                  onClick={() => setIsArchiveModalOpen(false)}
                  disabled={isArchivingResumes}
                  className="px-5 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmBulkArchive}
                  disabled={isArchivingResumes}
                  className="flex items-center gap-2 px-5 py-2.5 text-white bg-brand-blue hover:bg-brand-blue-2 rounded-lg transition-all shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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
          </div>
        </>
      )}

      {/* Upload History Sheet (Slide-in Panel) */}
      {/* Minimized Upload History Floating Indicator */}
      {isUploadHistoryMinimized && (
        <div
          onClick={() => {
            setIsUploadHistoryMinimized(false);
            setIsUploadHistoryModalOpen(true);
          }}
          className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 bg-brand-blue hover:bg-brand-blue-2 text-white px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl shadow-lg shadow-brand-blue/30 ring-1 ring-white/10 transition-all cursor-pointer flex items-center gap-2 sm:gap-3 animate-in slide-in-from-bottom duration-300"
        >
          <div className="relative">
            <History className="w-5 h-5" />
            {uploadHistory.filter(r => r.source === 'my-resumes' && (r.status === 'processing' || r.pending > 0)).length > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-brand-orange rounded-full animate-pulse" />
            )}
          </div>
          <div>
            <p className="text-sm font-medium">Upload History</p>
            <p className="text-xs text-blue-100">
              {(() => {
                const processing = uploadHistory.filter(r => r.source === 'my-resumes' && (r.status === 'processing' || r.pending > 0)).length;
                return processing > 0 ? `${processing} processing...` : 'Click to expand';
              })()}
            </p>
          </div>
          <Maximize2 className="w-4 h-4 ml-2" />
        </div>
      )}

      {isUploadHistoryModalOpen && !isUploadHistoryMinimized && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-50 animate-in fade-in duration-300"
            onClick={() => {
              setIsUploadHistoryMinimized(true);
              setIsUploadHistoryModalOpen(false);
            }}
          />
          {/* Centered Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-4xl max-h-[85dvh] flex flex-col animate-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="bg-gradient-to-r from-brand-blue/[0.06] via-brand-cyan/[0.04] to-white border-b border-gray-100 px-4 sm:px-6 py-3 sm:py-4 rounded-t-2xl">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <h2 className="text-base sm:text-xl font-semibold text-gray-900 tracking-tight">Upload History</h2>
                    <p className="text-xs sm:text-sm text-gray-600 mt-0.5">View all past bulk upload reports</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setIsUploadHistoryMinimized(true);
                        setIsUploadHistoryModalOpen(false);
                      }}
                      className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-xl font-medium"
                      aria-label="Minimize" title="Minimize"
                    >
                      −
                    </button>
                    <button
                      onClick={handleCloseUploadHistory}
                      className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                      aria-label="Close" title="Close"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6 bg-slate-50">
                {(() => {
                  const myResumesHistory = uploadHistory.filter(r => r.source === 'my-resumes');
                  const isActive = (r: any) => r.status === 'processing' || r.pending > 0;
                  const activeRecords = myResumesHistory.filter(isActive);
                  const completedRecords = myResumesHistory.filter(r => !isActive(r));

                  // Stats are scoped to the records in the active tab — when a
                  // batch finishes its numbers move from Currently Processing
                  // into Completed automatically.
                  const displayRecords = uploadHistoryTab === 'current' ? activeRecords : completedRecords;
                  const completedCount = displayRecords.reduce((sum, r) => sum + (r.completed || 0), 0);
                  const duplicatedCount = displayRecords.reduce((sum, r) => sum + (r.duplicated || 0), 0);
                  const versionedCount = displayRecords.reduce((sum, r) => sum + (r.versioned || 0), 0);
                  const failedCount = displayRecords.reduce((sum, r) => sum + (r.errors || 0), 0);
                  const pendingCount = displayRecords.reduce((sum, r) => sum + (r.pending || 0), 0);
                  // Fall back to the item list for batches whose row predates the `cancelled` column.
                  const cancelledTotal = displayRecords.reduce((sum, r) => sum + Math.max(
                    r.cancelled || 0,
                    r.statuses?.filter((s: any) => s.status === 'cancelled' || s.status === 'discarded').length || 0,
                  ), 0);
                  const totalFiles = displayRecords.reduce((sum, r) => sum + (r.totalFiles || 0), 0);
                  // Cancelled files were never attempted, so they must not count against
                  // the success rate — that is what turned a cancelled batch into "23%".
                  const attemptedFiles = Math.max(0, totalFiles - cancelledTotal);
                  const successRate = attemptedFiles > 0 ? Math.round((completedCount / attemptedFiles) * 100) : 0;

                  /* A tab holding no batches at all gets one illustrated empty
                     state and nothing else. Previously it stacked three blocks
                     that each said the same thing — the all-zero stats card, the
                     "0 batches" list header, and the list's own placeholder. */
                  const showFullEmptyState = displayRecords.length === 0;

                  return (
                    <>
                      {/* Tabs */}
                      <div className="inline-flex items-center bg-white border border-gray-100 ring-1 ring-black/[0.02] rounded-lg p-1 mb-4 sm:mb-6 shadow-sm shadow-brand-blue/5">
                        <button
                          onClick={() => setUploadHistoryTab('current')}
                          className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all ${
                            uploadHistoryTab === 'current'
                              ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25'
                              : 'text-gray-600 hover:bg-brand-blue/5 hover:text-brand-blue'
                          }`}
                        >
                          <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${activeRecords.length > 0 && uploadHistoryTab !== 'current' ? 'text-brand-blue animate-spin' : ''}`} />
                          Currently Processing
                          {activeRecords.length > 0 && (
                            <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-2xs sm:text-xs font-semibold ${
                              uploadHistoryTab === 'current' ? 'bg-white text-brand-blue' : 'bg-brand-blue/10 text-brand-blue'
                            }`}>
                              {activeRecords.length}
                            </span>
                          )}
                        </button>
                        <button
                          onClick={() => setUploadHistoryTab('completed')}
                          className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all ${
                            uploadHistoryTab === 'completed'
                              ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25'
                              : 'text-gray-600 hover:bg-brand-blue/5 hover:text-brand-blue'
                          }`}
                        >
                          <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          Completed
                          {completedRecords.length > 0 && (
                            <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-2xs sm:text-xs font-semibold ${
                              uploadHistoryTab === 'completed' ? 'bg-white text-brand-blue' : 'bg-gray-100 text-gray-700'
                            }`}>
                              {completedRecords.length}
                            </span>
                          )}
                        </button>
                      </div>

                      {/* 7-card stats grid — same layout in both tabs, scoped to
                          the tab's records. Brand palette throughout, except the
                          neutral Cancelled card. When
                          every number is zero the grid is replaced by a single
                          "nothing here" card, so a wall of zeros never shows.
                          Skipped entirely when the tab has no batches — the
                          illustrated empty state below speaks for it. */}
                      {!showFullEmptyState && (() => {
                        const statCards = [
                          { key: 'completed', label: 'Completed', value: completedCount, icon: CheckCircle, tone: 'brand-blue' },
                          { key: 'duplicated', label: 'Duplicates', value: duplicatedCount, icon: Copy, tone: 'brand-orange' },
                          { key: 'versioned', label: 'Versioned', value: versionedCount, icon: GitBranch, tone: 'brand-blue-2' },
                          { key: 'error', label: 'Failed', value: failedCount, icon: AlertCircle, tone: 'brand-orange-deep' },
                          { key: 'pending', label: 'Pending', value: pendingCount, icon: Clock, tone: 'brand-teal' },
                          { key: 'cancelled', label: 'Cancelled', value: cancelledTotal, icon: Ban, tone: 'gray' },
                        ] as const;

                        // Tailwind needs whole class names, so map tone → classes.
                        const TONE_CLASS: Record<string, { card: string; active: string; idle: string; tile: string; value: string }> = {
                          'brand-blue': {
                            card: 'from-brand-blue/[0.08] to-brand-blue/[0.03]',
                            active: 'border-brand-blue/50 ring-2 ring-brand-blue/30 shadow-md',
                            idle: 'border-brand-blue/20',
                            tile: 'bg-brand-blue',
                            value: 'text-brand-blue',
                          },
                          'brand-blue-2': {
                            card: 'from-brand-blue-2/[0.08] to-brand-blue-2/[0.03]',
                            active: 'border-brand-blue-2/50 ring-2 ring-brand-blue-2/30 shadow-md',
                            idle: 'border-brand-blue-2/20',
                            tile: 'bg-brand-blue-2',
                            value: 'text-brand-blue-2',
                          },
                          'brand-cyan': {
                            card: 'from-brand-cyan/[0.08] to-brand-cyan/[0.03]',
                            active: 'border-brand-cyan/50 ring-2 ring-brand-cyan/30 shadow-md',
                            idle: 'border-brand-cyan/20',
                            tile: 'bg-brand-cyan',
                            value: 'text-brand-cyan',
                          },
                          'brand-teal': {
                            card: 'from-brand-teal/[0.08] to-brand-teal/[0.03]',
                            active: 'border-brand-teal/50 ring-2 ring-brand-teal/30 shadow-md',
                            idle: 'border-brand-teal/20',
                            tile: 'bg-brand-teal',
                            value: 'text-brand-teal',
                          },
                          'brand-orange': {
                            card: 'from-brand-orange/[0.08] to-brand-orange/[0.03]',
                            active: 'border-brand-orange/50 ring-2 ring-brand-orange/30 shadow-md',
                            idle: 'border-brand-orange/20',
                            tile: 'bg-brand-orange',
                            value: 'text-brand-orange-deep',
                          },
                          'brand-orange-deep': {
                            card: 'from-brand-orange-deep/[0.08] to-brand-orange-deep/[0.03]',
                            active: 'border-brand-orange-deep/50 ring-2 ring-brand-orange-deep/30 shadow-md',
                            idle: 'border-brand-orange-deep/20',
                            tile: 'bg-brand-orange-deep',
                            value: 'text-brand-orange-deep',
                          },
                          // Cancelled is deliberately off-palette: it's an
                          // absence of work, not a result.
                          'gray': {
                            card: 'from-gray-100 to-gray-200/50',
                            active: 'border-gray-700 ring-2 ring-gray-400 shadow-md',
                            idle: 'border-gray-300',
                            tile: 'bg-gray-600',
                            value: 'text-gray-800',
                          },
                        };

                        const allZero = statCards.every(card => (card.value || 0) === 0) && totalFiles === 0;

                        if (allZero) {
                          return (
                            <div className="flex items-center gap-3 mb-4 sm:mb-6 bg-gradient-to-br from-brand-blue/[0.08] to-brand-blue/[0.03] border border-brand-blue/20 rounded-xl p-4">
                              <div className="w-9 h-9 bg-brand-blue rounded-lg flex items-center justify-center flex-shrink-0">
                                <Clock className="w-4 h-4 text-white" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900">
                                  {uploadHistoryTab === 'current' ? 'No uploads in progress' : 'No completed uploads yet'}
                                </p>
                                <p className="text-xs text-gray-600">
                                  {uploadHistoryTab === 'current'
                                    ? 'Upload resumes to see live progress and status counts here.'
                                    : 'Finished upload batches and their status counts will appear here.'}
                                </p>
                              </div>
                            </div>
                          );
                        }

                        // Only outcomes that actually happened get a card — a
                        // batch with no duplicates or failures shouldn't spend
                        // grid space saying so. The active filter's card stays
                        // even at zero, otherwise clicking a card could make it
                        // vanish with the filter still applied and no way to
                        // toggle it back off.
                        const visibleCards = statCards.filter(
                          card => (card.value || 0) > 0 || uploadHistoryFilter === card.key
                        );

                        return (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 mb-4 sm:mb-6">
                            {visibleCards.map(({ key, label, value, icon: Icon, tone }) => {
                              const t = TONE_CLASS[tone];
                              const isActive = uploadHistoryFilter === key;
                              return (
                                <div
                                  key={key}
                                  onClick={() => setUploadHistoryFilter(isActive ? null : key)}
                                  className={`bg-gradient-to-br ${t.card} border rounded-xl p-2.5 sm:p-3 lg:p-4 cursor-pointer transition-all hover:shadow-md ${isActive ? t.active : t.idle}`}
                                >
                                  <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 mb-1.5 sm:mb-2">
                                    <div className={`w-6 h-6 sm:w-8 sm:h-8 ${t.tile} rounded-lg flex items-center justify-center flex-shrink-0`}>
                                      <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                                    </div>
                                    <span className="text-2xs sm:text-xs text-gray-700 truncate">{label}</span>
                                  </div>
                                  <div className={`text-lg sm:text-xl lg:text-2xl font-bold tracking-tight ${t.value}`}>{value}</div>
                                </div>
                              );
                            })}

                            {/* Success Rate — not a filter, so it stays static.
                                Hidden when nothing was attempted: 0% would read
                                as a total failure rather than "no data". */}
                            {attemptedFiles > 0 && (
                            <div className="bg-gradient-to-br from-brand-cyan/[0.08] to-brand-cyan/[0.03] border border-brand-cyan/20 rounded-xl p-2.5 sm:p-3 lg:p-4">
                              <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 mb-1.5 sm:mb-2">
                                <div className="w-6 h-6 sm:w-8 sm:h-8 bg-brand-cyan rounded-lg flex items-center justify-center flex-shrink-0">
                                  <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                                </div>
                                <span className="text-2xs sm:text-xs text-gray-700 truncate">Success Rate</span>
                              </div>
                              <div className="text-lg sm:text-xl lg:text-2xl font-bold text-brand-cyan tracking-tight">{successRate}%</div>
                            </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Active Filter Indicator */}
                      {uploadHistoryFilter && (
                        <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-white border border-gray-200 rounded-lg">
                          <span className="text-xs text-gray-500">Filtering by:</span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            uploadHistoryFilter === 'completed' ? 'bg-brand-blue/10 text-brand-blue' :
                            uploadHistoryFilter === 'duplicated' ? 'bg-brand-orange/15 text-brand-orange-deep' :
                            uploadHistoryFilter === 'versioned' ? 'bg-brand-blue-2/10 text-brand-blue-2' :
                            uploadHistoryFilter === 'error' ? 'bg-brand-orange-deep/10 text-brand-orange-deep' :
                            uploadHistoryFilter === 'cancelled' ? 'bg-gray-200 text-gray-800' :
                            'bg-brand-teal/10 text-brand-teal'
                          }`}>
                            {uploadHistoryFilter === 'completed' ? 'Completed' :
                             uploadHistoryFilter === 'duplicated' ? 'Duplicates' :
                             uploadHistoryFilter === 'versioned' ? 'Versioned' :
                             uploadHistoryFilter === 'error' ? 'Failed' :
                             uploadHistoryFilter === 'cancelled' ? 'Cancelled' :
                             'Pending'}
                          </span>
                          <button
                            onClick={() => setUploadHistoryFilter(null)}
                            className="ml-auto text-xs text-gray-400 hover:text-gray-600 transition-colors"
                           aria-label="Close">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* Overall ETA Banner — only relevant on the Currently Processing tab */}
                      {uploadHistoryTab === 'current' && (() => {
                        // Only show for batches that still have genuinely active items
                        const activeBatches = myResumesHistory.filter(r =>
                          r.pending > 0 && r.date &&
                          r.statuses?.some((s: any) => s.status === 'pending' || s.status === 'processing')
                        );
                        if (activeBatches.length === 0) return null;
                        const totalPending = activeBatches.reduce((sum: number, r: any) => sum + r.pending, 0);
                        const totalProcessed = activeBatches.reduce((sum: number, r: any) => sum + r.completed + r.errors + r.duplicated + (r.versioned || 0), 0);
                        if (totalProcessed <= 0) {
                          return (
                            <div className="flex items-center gap-2 mb-3 sm:mb-4 px-3 sm:px-4 py-2.5 sm:py-3 bg-brand-blue/10 border border-brand-blue/20 rounded-xl animate-pulse">
                              <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-blue animate-spin flex-shrink-0" />
                              <span className="text-xs sm:text-sm text-brand-blue">Processing {totalPending} resume{totalPending !== 1 ? 's' : ''}... Estimating time remaining</span>
                            </div>
                          );
                        }
                        // Cap elapsed at 10 minutes so a batch that started hours ago with a
                        // stuck file doesn't produce an absurd ETA (e.g. "233–433 mins remaining").
                        const earliestStart = Math.min(...activeBatches.map((r: any) => new Date(r.date).getTime()));
                        const elapsed = Math.min(Date.now() - earliestStart, 10 * 60 * 1000);
                        const avgTimePerFile = elapsed / totalProcessed;
                        const remainingMs = totalPending * avgTimePerFile;
                        const lowMins = Math.max(1, Math.floor((remainingMs * 0.7) / 60000));
                        const highMins = Math.max(1, Math.ceil((remainingMs * 1.3) / 60000));
                        const etaText = lowMins === highMins
                          ? `Approx. ${lowMins} min${lowMins !== 1 ? 's' : ''} remaining`
                          : `Approx. ${lowMins}\u2013${highMins} mins remaining`;
                        return (
                          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2 mb-3 sm:mb-4 px-3 sm:px-4 py-2.5 sm:py-3 bg-brand-blue/10 border border-brand-blue/20 rounded-xl">
                            <div className="flex items-center gap-2">
                              <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-blue flex-shrink-0" />
                              <span className="text-xs sm:text-sm font-medium text-brand-blue">{etaText}</span>
                            </div>
                            <span className="text-2xs sm:text-xs text-brand-blue/60 sm:ml-auto">{totalPending} resume{totalPending !== 1 ? 's' : ''} left across {activeBatches.length} batch{activeBatches.length !== 1 ? 'es' : ''}</span>
                          </div>
                        );
                      })()}

                      {/* Upload History List */}
                      {!showFullEmptyState && (
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-semibold text-gray-900">
                            {uploadHistoryTab === 'current' ? 'Active Uploads' : 'Recent Uploads'}
                          </h3>
                          <span className="text-xs text-gray-500">{displayRecords.length} batch{displayRecords.length !== 1 ? 'es' : ''}</span>
                        </div>
                      )}

                      {showFullEmptyState ? (
                        <>
                          <UploadHistoryEmptyState
                            title={
                              uploadHistoryTab === 'current'
                                ? 'No uploads in progress'
                                : myResumesHistory.length === 0 ? 'No upload history yet' : 'Nothing here yet'
                            }
                            lines={
                              uploadHistoryTab === 'current'
                                ? ['All your uploads are processed.', 'Start a new bulk upload to see live progress here.']
                                : myResumesHistory.length === 0
                                  ? ['Bulk upload reports will appear here.', 'Upload multiple resumes to see detailed status reports.']
                                  : ['Your uploads are still running.', 'Their reports will appear here once they finish.']
                            }
                            /* Straight from history into the upload dialog — the
                               modal has to close first or the two would stack. */
                            onAction={
                              canUploadMyResumes
                                ? () => {
                                    handleCloseUploadHistory();
                                    openUploadToFolder(undefined);
                                  }
                                : undefined
                            }
                          />

                          <div className="mt-4 flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 sm:px-4 sm:py-3">
                            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15">
                              <Lightbulb className="h-4 w-4 text-brand-blue" />
                            </span>
                            <span className="min-w-0 text-xs text-gray-700 sm:text-sm">
                              Tip: You can upload a single resume or bulk upload multiple resumes at once.
                            </span>
                            <Link
                              href="/help"
                              onClick={handleCloseUploadHistory}
                              className="ml-auto flex-shrink-0 text-xs font-medium text-brand-blue transition-colors hover:text-brand-blue-2 hover:underline sm:text-sm"
                            >
                              Learn more
                            </Link>
                          </div>
                        </>
                      ) : (
                        <div className="space-y-4">
                          {displayRecords
                            .slice(0, 20)
                            .map(record => {
                              // Prefer the server counter, but fall back to the item list so an
                              // older batch row (written before `cancelled` existed) still adds up.
                              const cancelledFromItems = record.statuses?.filter(
                                (s: any) => s.status === 'cancelled' || s.status === 'discarded'
                              ).length ?? 0;
                              const cancelledCount = Math.max(record.cancelled ?? 0, cancelledFromItems);
                              const processed = record.completed + record.errors + record.duplicated + (record.versioned || 0) + cancelledCount;
                              // Files the batch counters can't explain. If this is ever non-zero the
                              // summary is under-reporting, and we say so instead of hiding it.
                              const unaccountedCount = Math.max(0, (record.totalFiles || 0) - processed - (record.pending || 0));
                              // Success is measured against files that were actually attempted —
                              // cancelling 77 of 100 is not a 23% failure of the upload.
                              const attempted = Math.max(0, (record.totalFiles || 0) - cancelledCount);
                              const percentage = attempted > 0 ? Math.round((record.completed / attempted) * 100) : 100;
                              const isUploading = record.status === 'uploading';
                              const isProcessing = record.status === 'processing' || record.pending > 0;
                              const isCancelled = cancelledCount > 0;
                              // Optimistic pre-API record: its id and item ids are `temp-*`
                              // placeholders, not UUIDs. Every retry/cancel endpoint takes UUID
                              // path params, so any action fired against it 422s on uuid_parsing.
                              // `local-*` records are the client-side stand-ins for single
                              // uploads the server gave us no batch for — same story, no UUID.
                              const isTempRecord = record.id.startsWith('temp-') || record.id.startsWith('local-');
                              const hasErrors = record.errors > 0;
                              const hasIssues = record.duplicated > 0 || (record.versioned || 0) > 0 || record.errors > 0 || cancelledCount > 0;

                              return (
                                <div
                                  key={record.id}
                                  className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-3 sm:p-4 lg:p-5 hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 hover:-translate-y-0.5 transition-all duration-150 cursor-pointer"
                                >
                                  {/* Header Row */}
                                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-3 sm:mb-4 gap-2 sm:gap-3">
                                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                      <div className="w-8 h-8 sm:w-10 sm:h-10 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue" />
                                      </div>
                                      <div className="min-w-0">
                                        <span className="font-medium text-gray-900 text-xs sm:text-sm block truncate">{record.fileName}</span>
                                        {record.date && (
                                          <span className="text-2xs sm:text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                            <Calendar className="w-3 h-3 flex-shrink-0" />
                                            <span className="truncate">Started {formatDateTimeIST(record.date)}</span>
                                          </span>
                                        )}
                                        {record.completedAt && record.pending === 0 && (() => {
                                          const start = new Date(record.date).getTime();
                                          const end = new Date(record.completedAt).getTime();
                                          const ms = Math.max(0, end - start);
                                          const totalSec = Math.round(ms / 1000);
                                          const h = Math.floor(totalSec / 3600);
                                          const m = Math.floor((totalSec % 3600) / 60);
                                          const s = totalSec % 60;
                                          const duration = h > 0
                                            ? `${h}h ${m}m ${s}s`
                                            : m > 0
                                              ? `${m}m ${s}s`
                                              : `${s}s`;
                                          return (
                                            <span className="text-2xs sm:text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                              <CheckCircle className="w-3 h-3 flex-shrink-0 text-brand-blue" />
                                              <span className="truncate">
                                                Finished {formatDateTimeIST(record.completedAt)}
                                                <span className="ml-1.5 text-gray-400">·</span>
                                                <span className="ml-1.5 text-gray-700 font-medium">{duration}</span>
                                              </span>
                                            </span>
                                          );
                                        })()}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 sm:gap-3 ml-10 sm:ml-0">
                                      {isUploading && (
                                        <span className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 bg-brand-blue/10 text-brand-blue text-2xs sm:text-xs rounded-full border border-brand-blue/20 animate-pulse">
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                          Uploading...
                                        </span>
                                      )}
                                      {!isUploading && hasIssues && (
                                        <span className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 bg-brand-orange/15 text-brand-orange-deep text-2xs sm:text-xs rounded-full border border-brand-orange/30">
                                          <AlertCircle className="w-3 h-3 flex-shrink-0" />
                                          <span className="hidden sm:inline">Needs Review</span>
                                          <span className="sm:hidden">Review</span>
                                        </span>
                                      )}
                                      {!isUploading && (
                                        <div className="text-right">
                                          <div className={`text-base sm:text-xl font-bold tracking-tight ${
                                            percentage === 100 ? 'text-brand-blue' :
                                            percentage >= 90 ? 'text-brand-cyan' :
                                            percentage >= 70 ? 'text-brand-orange' :
                                            'text-brand-orange-deep'
                                          }`}>
                                            {percentage}%
                                          </div>
                                          <div className="text-2xs sm:text-xs text-gray-500">Success</div>
                                        </div>
                                      )}
                                      <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 flex-shrink-0" />
                                    </div>
                                  </div>

                                  {/* Mini Stats */}
                                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 sm:gap-2 mb-3 sm:mb-4">
                                    {/* Mini stats use the same brand tones as the summary cards above */}
                                    <div className="text-center p-1.5 sm:p-2 bg-brand-blue/[0.06] rounded-lg border border-brand-blue/15">
                                      <div className="text-xs sm:text-sm font-semibold text-brand-blue">{record.completed}</div>
                                      <div className="text-2xs sm:text-xs text-gray-600">Done</div>
                                    </div>
                                    <div className="text-center p-1.5 sm:p-2 bg-brand-orange/[0.08] rounded-lg border border-brand-orange/20">
                                      <div className="text-xs sm:text-sm font-semibold text-brand-orange-deep">{record.duplicated}</div>
                                      <div className="text-2xs sm:text-xs text-gray-600">Duplicates</div>
                                    </div>
                                    <div className="text-center p-1.5 sm:p-2 bg-brand-blue-2/[0.07] rounded-lg border border-brand-blue-2/20">
                                      <div className="text-xs sm:text-sm font-semibold text-brand-blue-2">{record.versioned || 0}</div>
                                      <div className="text-2xs sm:text-xs text-gray-600">Version</div>
                                    </div>
                                    <div className="text-center p-1.5 sm:p-2 bg-brand-orange-deep/[0.08] rounded-lg border border-brand-orange-deep/20">
                                      <div className="text-xs sm:text-sm font-semibold text-brand-orange-deep">{record.errors}</div>
                                      <div className="text-2xs sm:text-xs text-gray-600">Failed</div>
                                    </div>
                                    <div className="text-center p-1.5 sm:p-2 bg-brand-teal/[0.08] rounded-lg border border-brand-teal/20">
                                      <div className="text-xs sm:text-sm font-semibold text-brand-teal">{record.pending}</div>
                                      <div className="text-2xs sm:text-xs text-gray-600">Pending</div>
                                    </div>
                                    {/* Cancelled — previously had no tile, so cancelled files simply
                                        disappeared from the batch summary (23 of 100, nothing failed). */}
                                    <div className="text-center p-1.5 sm:p-2 bg-gray-100 rounded-lg border border-gray-300">
                                      <div className="text-xs sm:text-sm font-semibold text-gray-700">{cancelledCount}</div>
                                      <div className="text-2xs sm:text-xs text-gray-600">Cancelled</div>
                                    </div>
                                  </div>
                                  {unaccountedCount > 0 && (
                                    <div className="mb-3 flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-2xs sm:text-xs text-amber-800">
                                      <AlertCircle className="mt-px h-3.5 w-3.5 flex-shrink-0" />
                                      <span>
                                        {unaccountedCount} file{unaccountedCount !== 1 ? 's' : ''} in this batch {unaccountedCount !== 1 ? 'are' : 'is'} not
                                        reflected in the totals above — open the file list below for their actual state.
                                      </span>
                                    </div>
                                  )}

                                  {/* Progress Bar */}
                                  <div className="mb-3 sm:mb-4">
                                    <div className="flex items-center justify-between text-2xs sm:text-xs text-gray-600 mb-1 sm:mb-1.5">
                                      <span>Progress</span>
                                      <span>{processed} of {record.totalFiles}</span>
                                    </div>
                                    <div className="h-1.5 sm:h-2 bg-brand-blue/10 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full transition-all ${
                                          percentage === 100 ? 'bg-brand-blue' :
                                          percentage >= 90 ? 'bg-brand-cyan' :
                                          percentage >= 70 ? 'bg-brand-orange' :
                                          'bg-brand-orange-deep'
                                        }`}
                                        style={{ width: `${Math.min((processed / record.totalFiles) * 100, 100)}%` }}
                                      />
                                    </div>
                                  </div>

                                  {/* Estimated Time Remaining — only show when items are genuinely active */}
                                  {record.pending > 0 && record.date &&
                                   record.statuses?.some((s: any) => s.status === 'pending' || s.status === 'processing') &&
                                   (() => {
                                    // Cap elapsed at 10 minutes to prevent absurd ETAs when a file
                                    // is stuck at 'processing' and the batch started hours ago.
                                    const elapsed = Math.min(Date.now() - new Date(record.date).getTime(), 10 * 60 * 1000);
                                    if (processed <= 0 || elapsed <= 0) {
                                      return (
                                        <div className="flex items-center gap-1.5 mb-3 sm:mb-4 text-2xs sm:text-xs text-blue-600">
                                          <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
                                          <span>Estimating time remaining...</span>
                                        </div>
                                      );
                                    }
                                    const avgTimePerFile = elapsed / processed;
                                    const remainingMs = record.pending * avgTimePerFile;
                                    const lowMins = Math.max(1, Math.floor((remainingMs * 0.7) / 60000));
                                    const highMins = Math.max(1, Math.ceil((remainingMs * 1.3) / 60000));
                                    const etaText = lowMins === highMins
                                      ? `Approx. ${lowMins} min${lowMins !== 1 ? 's' : ''} remaining`
                                      : `Approx. ${lowMins}\u2013${highMins} mins remaining`;
                                    return (
                                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-0.5 sm:gap-1.5 mb-3 sm:mb-4 text-2xs sm:text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-2.5 sm:px-3 py-1.5">
                                        <div className="flex items-center gap-1.5">
                                          <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
                                          <span>{etaText}</span>
                                        </div>
                                        <span className="text-blue-400 sm:ml-auto">{record.pending} file{record.pending !== 1 ? 's' : ''} left</span>
                                      </div>
                                    );
                                  })()}

                                  {/* Retry / Cancel Batch actions — hidden until the optimistic
                                      temp record is swapped for the real server batch_id, since
                                      both endpoints require a UUID path param. */}
                                  {(isProcessing || hasErrors || isCancelled) && !isTempRecord && (
                                    <div className="flex items-center gap-2 mb-3 sm:mb-4" onClick={e => e.stopPropagation()}>
                                      {/* Retry — stuck in pending, failed, or cancelled (re-queues the files) */}
                                      {(isProcessing || hasErrors || isCancelled) && (
                                        <button
                                          disabled={retryingBatches.has(record.id)}
                                          onClick={(e) => handleRetryBatch(record.id, e)}
                                          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                                            retryingBatches.has(record.id)
                                              ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                              : 'bg-brand-blue/10 text-brand-blue border-brand-blue/20 hover:bg-brand-blue/15'
                                          }`}
                                        >
                                          <RefreshCw className={`w-3 h-3 ${retryingBatches.has(record.id) ? 'animate-spin' : ''}`} />
                                          {retryingBatches.has(record.id)
                                            ? 'Retrying...'
                                            : isCancelled && !isProcessing ? `Re-queue ${cancelledCount} cancelled` : 'Retry'}
                                        </button>
                                      )}
                                      {/* Cancel — show only while items are still pending.
                                          type="button" so a stray Enter can't submit-activate it, and it
                                          opens a confirmation instead of cancelling on the spot. */}
                                      {isProcessing && record.pending > 0 && (
                                        <button
                                          type="button"
                                          disabled={cancellingBatches.has(record.id)}
                                          onClick={(e) => handleCancelBatch(record.id, record.pending, e)}
                                          onKeyDown={(e) => {
                                            // Space scrolls the file list; don't let it double as "cancel 77 files".
                                            if (e.key === ' ') e.preventDefault();
                                          }}
                                          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                                            cancellingBatches.has(record.id)
                                              ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                              : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                                          }`}
                                        >
                                          <X className="w-3 h-3" />
                                          {cancellingBatches.has(record.id) ? 'Cancelling...' : `Cancel Batch (${record.pending} pending)`}
                                        </button>
                                      )}
                                    </div>
                                  )}

                                  {/* Individual File Statuses */}
                                  {record.statuses && record.statuses.length > 0 && (() => {
                                    const filteredStatuses = uploadHistoryFilter
                                      ? record.statuses.filter((f: any) => {
                                          if (uploadHistoryFilter === 'completed') return f.status === 'completed';
                                          if (uploadHistoryFilter === 'duplicated') return f.status === 'duplicate' || f.status === 'duplicated';
                                          if (uploadHistoryFilter === 'versioned') return f.status === 'versioned' || f.status === 'version';
                                          if (uploadHistoryFilter === 'error') return f.status === 'error';
                                          if (uploadHistoryFilter === 'pending') return f.status === 'pending' || f.status === 'processing';
                                          if (uploadHistoryFilter === 'cancelled') return f.status === 'cancelled' || f.status === 'discarded';
                                          return true;
                                        })
                                      : record.statuses;
                                    return filteredStatuses.length > 0 ? (
                                    <div className="border-t border-gray-100 pt-4">
                                      <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                          <div className="text-xs font-semibold text-gray-700">
                                            Files ({filteredStatuses.length}{uploadHistoryFilter ? ` of ${record.statuses.length}` : ''})
                                          </div>
                                          {/* Select All checkbox for versioned items */}
                                          {uploadHistoryFilter === 'versioned' && filteredStatuses.length > 0 && (() => {
                                            const versionedInBatch = filteredStatuses.filter((f: any) => f.status === 'versioned' || f.status === 'version');
                                            if (versionedInBatch.length === 0) return null;
                                            const allSelected = versionedInBatch.every((f: any) => selectedVersionedItems.has(f.id));
                                            return (
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  const newSelected = new Map(selectedVersionedItems);
                                                  if (allSelected) {
                                                    versionedInBatch.forEach((f: any) => newSelected.delete(f.id));
                                                  } else {
                                                    versionedInBatch.forEach((f: any) => {
                                                      newSelected.set(f.id, {
                                                        id: f.id,
                                                        fileName: f.fileName,
                                                        candidateName: f.candidateName || '',
                                                        resumeId: f.resumeId,
                                                      });
                                                    });
                                                  }
                                                  setSelectedVersionedItems(newSelected);
                                                }}
                                                className="flex items-center gap-1.5 px-2 py-0.5 text-xs text-brand-blue-2 bg-brand-blue-2/10 border border-brand-blue-2/20 rounded-md hover:bg-brand-blue-2/15 transition-colors"
                                              >
                                                <input
                                                  type="checkbox"
                                                  checked={allSelected}
                                                  readOnly
                                                  className="w-3 h-3 rounded border-brand-blue-2/40 text-brand-blue-2 pointer-events-none"
                                                />
                                                Select All
                                              </button>
                                            );
                                          })()}
                                        </div>
                                        <div className="flex items-center gap-2 text-xs">
                                          <span className="flex items-center gap-1 text-green-600">
                                            <CheckCircle className="w-3 h-3" />
                                            {record.statuses.filter((f: any) => f.status === 'completed' || f.status === 'versioned').length}
                                          </span>
                                          <span className="flex items-center gap-1 text-blue-600">
                                            <Loader2 className="w-3 h-3" />
                                            {record.statuses.filter((f: any) => f.status === 'processing' || f.status === 'pending').length}
                                          </span>
                                          <span className="flex items-center gap-1 text-red-600">
                                            <AlertCircle className="w-3 h-3" />
                                            {record.statuses.filter((f: any) => f.status === 'error' || f.status === 'duplicate' || f.status === 'duplicated').length}
                                          </span>
                                          {/* Cancelled files had no counter at all, so they were invisible here too */}
                                          {record.statuses.some((f: any) => f.status === 'cancelled' || f.status === 'discarded') && (
                                            <span className="flex items-center gap-1 text-gray-600">
                                              <Ban className="w-3 h-3" />
                                              {record.statuses.filter((f: any) => f.status === 'cancelled' || f.status === 'discarded').length}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      {/* Short note: cancel only for queued items */}
                                      {record.statuses.some((f: any) => f.status === 'pending' || f.status === 'error' || f.status === 'cancelled') && (
                                        <p className="text-2xs text-gray-400 mb-2">
                                          ℹ️ Retry is available for queued, failed &amp; cancelled files. Cancel is only available for queued files.
                                        </p>
                                      )}
                                      <div className="space-y-1.5 max-h-64 overflow-y-auto">
                                        {filteredStatuses.map((file: any, idx: number) => {
                                          const isClickable = ['completed', 'versioned', 'duplicate', 'error'].includes(file.status);
                                          const isVersioned = file.status === 'versioned' || file.status === 'version';
                                          const isSelected = selectedVersionedItems.has(file.id);
                                          const isCancelledFile = file.status === 'cancelled' || file.status === 'discarded';
                                          // Anything the UI has no case for. Surfaced explicitly rather than
                                          // being absorbed by the "Queued" fallback, so a new backend status
                                          // can never masquerade as "still waiting in the queue".
                                          const isUnknownStatusFile = ![
                                            'completed', 'versioned', 'version', 'processing',
                                            'pending', 'duplicate', 'duplicated', 'error',
                                            'cancelled', 'discarded',
                                          ].includes(file.status);
                                          return (
                                          <div
                                            key={file.id || idx}
                                            onClick={() => {
                                              if (isVersioned) {
                                                // Open resolution modal for this single versioned file
                                                setSelectedVersionedItems(new Map([[file.id, {
                                                  id: file.id,
                                                  fileName: file.fileName,
                                                  candidateName: file.candidateName || '',
                                                  resumeId: file.resumeId,
                                                }]]));
                                                setIsBulkResolveModalOpen(true);
                                              } else if (isClickable) {
                                                setSelectedHistoryItem({
                                                  id: file.id,
                                                  fileName: file.fileName,
                                                  status: file.status,
                                                  errorMessage: file.errorMessage,
                                                  candidateName: file.candidateName,
                                                  resumeId: file.resumeId,
                                                });
                                              }
                                            }}
                                            className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-2.5 rounded-lg border transition-all ${
                                              isVersioned && isSelected ? 'bg-brand-blue-2/15 border-brand-blue-2/40 ring-1 ring-brand-blue-2/30' :
                                              file.status === 'completed' ? 'bg-green-50 border-green-200 hover:bg-green-100 hover:border-green-300' :
                                              file.status === 'versioned' ? 'bg-brand-blue-2/[0.07] border-brand-blue-2/20 hover:bg-brand-blue-2/[0.12] hover:border-brand-blue-2/30' :
                                              file.status === 'processing' ? 'bg-brand-blue/5 border-brand-blue/20' :
                                              file.status === 'duplicate' ? 'bg-brand-orange/[0.07] border-brand-orange/20 hover:bg-brand-orange/10 hover:border-brand-orange/30' :
                                              file.status === 'error' ? 'bg-red-50 border-red-200 hover:bg-red-100 hover:border-red-300' :
                                              isCancelledFile ? 'bg-gray-100 border-gray-300' :
                                              isUnknownStatusFile ? 'bg-amber-50 border-amber-300' :
                                              'bg-gray-50 border-gray-200'
                                            } ${isClickable ? 'cursor-pointer' : ''}`}
                                          >
                                            {/* Checkbox for versioned items */}
                                            {isVersioned && (
                                              <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onClick={(e) => e.stopPropagation()}
                                                onChange={(e) => {
                                                  e.stopPropagation();
                                                  const newSelected = new Map(selectedVersionedItems);
                                                  if (isSelected) {
                                                    newSelected.delete(file.id);
                                                  } else {
                                                    newSelected.set(file.id, {
                                                      id: file.id,
                                                      fileName: file.fileName,
                                                      candidateName: file.candidateName || '',
                                                      resumeId: file.resumeId,
                                                    });
                                                  }
                                                  setSelectedVersionedItems(newSelected);
                                                }}
                                                className="w-4 h-4 rounded border-brand-blue-2/40 text-brand-blue-2 focus:ring-brand-blue-2/40 cursor-pointer flex-shrink-0"
                                              />
                                            )}
                                            {/* Status Icon */}
                                            <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                              file.status === 'completed' ? 'bg-green-500' :
                                              file.status === 'versioned' ? 'bg-brand-blue-2' :
                                              file.status === 'processing' ? 'bg-brand-blue' :
                                              file.status === 'duplicate' ? 'bg-brand-orange' :
                                              file.status === 'error' ? 'bg-red-500' :
                                              isCancelledFile ? 'bg-gray-500' :
                                              'bg-gray-400'
                                            }`}>
                                              {file.status === 'completed' && <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-white" />}
                                              {file.status === 'versioned' && <GitBranch className="w-3 h-3 sm:w-4 sm:h-4 text-white" />}
                                              {file.status === 'processing' && <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 text-white animate-spin" />}
                                              {file.status === 'duplicate' && <Copy className="w-3 h-3 sm:w-4 sm:h-4 text-white" />}
                                              {file.status === 'error' && <AlertCircle className="w-3 h-3 sm:w-4 sm:h-4 text-white" />}
                                              {file.status === 'pending' && <Clock className="w-3 h-3 sm:w-4 sm:h-4 text-white animate-pulse" />}
                                              {isCancelledFile && <Ban className="w-3 h-3 sm:w-4 sm:h-4 text-white" />}
                                            </div>
                                            {/* File Info */}
                                            <div className="flex-1 min-w-0">
                                              <div className="font-medium text-gray-900 text-2xs sm:text-sm truncate">{file.fileName}</div>
                                              <div className="text-2xs sm:text-xs text-gray-500 mt-0.5 truncate">
                                                {file.status === 'completed' && (file.candidateName ? `✓ ${file.candidateName}` : '✓ Uploaded successfully')}
                                                {file.status === 'versioned' && (file.candidateName ? `↑ ${file.candidateName} - Version update detected` : '↑ Version update detected - Pending resolution')}
                                                {file.status === 'processing' && '⚡ Processing...'}
                                                {file.status === 'pending' && '⏳ Waiting in queue...'}
                                                {file.status === 'duplicate' && (file.errorMessage || '⚠ Duplicate - already exists')}
                                                {file.status === 'error' && (file.errorMessage || '✗ Failed to process')}
                                                {isCancelledFile && (file.errorMessage || '✕ Cancelled before processing')}
                                                {isUnknownStatusFile && `? Unrecognised status: ${String(file.status)}`}
                                              </div>
                                            </div>
                                            {/* Status Badge */}
                                            <span className={`hidden sm:inline px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-2xs sm:text-xs font-semibold flex-shrink-0 ${
                                              file.status === 'completed' ? 'bg-green-100 text-green-700' :
                                              file.status === 'versioned' ? 'bg-brand-blue-2/15 text-brand-blue-2' :
                                              file.status === 'processing' ? 'bg-brand-blue/10 text-brand-blue' :
                                              file.status === 'duplicate' ? 'bg-brand-orange/15 text-brand-orange-deep' :
                                              file.status === 'error' ? 'bg-red-100 text-red-700' :
                                              isCancelledFile ? 'bg-gray-200 text-gray-700' :
                                              'bg-gray-100 text-gray-600'
                                            }`}>
                                              {file.status === 'completed' ? '✓ Done' :
                                               file.status === 'versioned' ? '↑ Version' :
                                               file.status === 'processing' ? '⚡ Running' :
                                               file.status === 'duplicate' ? '⚠ Duplicate' :
                                               file.status === 'error' ? '✗ Failed' :
                                               file.status === 'cancelled' ? '✕ Cancelled' :
                                               file.status === 'discarded' ? '✕ Discarded' :
                                               file.status === 'pending' ? '⏳ Queued' :
                                               /* Never claim "Queued" for a status we don't understand —
                                                  that is exactly how 77 cancelled files read as queued. */
                                               `? ${String(file.status ?? 'unknown')}`}
                                            </span>
                                            {/* Per-item Retry / Cancel — same temp-record guard as the
                                                batch-level actions above. Without it the optimistic
                                                record renders these buttons over `temp-file-N` ids and
                                                the request 422s on uuid_parsing for both path params. */}
                                            {file.id && !isTempRecord && !String(file.id).startsWith('temp-')
                                              && (file.status === 'pending' || file.status === 'error' || file.status === 'cancelled') && (
                                              <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                                                <button
                                                  disabled={retryingItems.has(file.id)}
                                                  onClick={(e) => handleRetryItem(record.id, file.id, e)}
                                                  className={`p-1 rounded text-2xs font-medium transition-colors ${retryingItems.has(file.id) ? 'text-gray-400 cursor-not-allowed' : 'text-brand-blue hover:bg-brand-blue/10'}`}
                                                  aria-label="Retry this file" title={file.status === 'cancelled' ? 'Re-queue this cancelled file' : 'Retry this file'}
                                                >
                                                  <RefreshCw className={`w-3 h-3 ${retryingItems.has(file.id) ? 'animate-spin' : ''}`} />
                                                </button>
                                                {file.status === 'pending' && (
                                                  <button
                                                    disabled={cancellingItems.has(file.id)}
                                                    onClick={(e) => handleCancelItem(record.id, file.id, file.fileName, e)}
                                                    className={`p-1 rounded text-2xs font-medium transition-colors ${cancellingItems.has(file.id) ? 'text-gray-400 cursor-not-allowed' : 'text-red-500 hover:bg-red-50'}`}
                                                    aria-label="Cancel this file (queued only)" title="Cancel this file (queued only)"
                                                  >
                                                    <X className="w-3 h-3" />
                                                  </button>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        );
                                        })}
                                      </div>
                                    </div>
                                    ) : uploadHistoryFilter ? (
                                      <div className="border-t border-gray-100 pt-4">
                                        <p className="text-xs text-gray-400 text-center py-3">No {
                                          uploadHistoryFilter === 'completed' ? 'completed' :
                                          uploadHistoryFilter === 'duplicated' ? 'duplicate' :
                                          uploadHistoryFilter === 'versioned' ? 'versioned' :
                                          uploadHistoryFilter === 'error' ? 'failed' :
                                          uploadHistoryFilter === 'cancelled' ? 'cancelled' :
                                          'pending'
                                        } files in this batch</p>
                                      </div>
                                    ) : null;
                                  })()}
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Floating Resolve Selected Bar */}
              {selectedVersionedItems.size > 0 && (
                <div className="border-t border-brand-blue-2/20 px-3 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-brand-blue-2/[0.07] to-brand-blue/[0.04] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 bg-brand-blue-2 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm shadow-brand-blue-2/25 ring-1 ring-white/10">
                      <GitBranch className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs sm:text-sm font-semibold text-brand-blue-2">
                        {selectedVersionedItems.size} versioned resume{selectedVersionedItems.size !== 1 ? 's' : ''} selected
                      </span>
                      <p className="text-2xs sm:text-xs text-brand-blue-2/80">Choose how to resolve these version conflicts</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedVersionedItems(new Map())}
                      className="px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-white transition-colors"
                    >
                      Clear
                    </button>
                    <button
                      onClick={() => setIsBulkResolveModalOpen(true)}
                      className="flex-1 sm:flex-none px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-white bg-brand-blue hover:bg-brand-blue-2 rounded-lg transition-all shadow-sm shadow-brand-blue-2/25 ring-1 ring-white/10 flex items-center justify-center gap-1.5 sm:gap-2"
                    >
                      <GitBranch className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      Resolve ({selectedVersionedItems.size})
                    </button>
                  </div>
                </div>
              )}

              {/* Footer. Close is secondary: dismissing a report is not the
                  thing to push, and a second full-width blue button would
                  outshout the Upload Resumes CTA in the empty state. */}
              <div className="border-t border-gray-200 px-4 sm:px-6 py-3 sm:py-4 bg-white rounded-b-2xl flex justify-center">
                <button
                  onClick={handleCloseUploadHistory}
                  className="w-full sm:w-auto sm:min-w-[240px] px-4 py-2 sm:py-2.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 hover:border-gray-300 rounded-lg transition-all font-medium text-sm sm:text-base cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Upload History Item Detail Modal */}
      {selectedHistoryItem && (
        <UploadHistoryDetailModal
          item={selectedHistoryItem}
          onClose={() => setSelectedHistoryItem(null)}
        />
      )}

      {/* Bulk Version Resolution Modal */}
      {isBulkResolveModalOpen && selectedVersionedItems.size > 0 && (
        <BulkVersionResolutionModal
          items={Array.from(selectedVersionedItems.values())}
          onClose={() => setIsBulkResolveModalOpen(false)}
          onResolved={() => {
            setIsBulkResolveModalOpen(false);
            setSelectedVersionedItems(new Map());
            // Refresh batch data, without pulling the view out of its folder
            fetchUploadHistory();
            isFetchingRef.current = false;
            fetchData(appliedSearchQuery, filters, selectedFolder, true);
            refreshAllResumesTotal();
          }}
        />
      )}

      {/* Assessment Modal - Select Assessment */}
      {isAssessmentModalOpen && (
        <>
          <div
            className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm z-50 animate-in fade-in duration-200"
            onClick={() => {
              setIsAssessmentModalOpen(false);
              setSelectedAssessments([]);
              setExcludedInviteIds([]);
            }}
          />
          {/* Shell, header, body and footer are the Invite to AI Interview
              dialog's (InviteToAIInterviewFlow), width included, so the two
              invite actions read as one dialog wearing different labels. */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-lg md:max-w-2xl lg:max-w-6xl xl:max-w-7xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="flex-shrink-0 flex items-center justify-between gap-2 px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-slate-700/60">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex-shrink-0">
                    <ClipboardCheck className="w-4 h-4 text-brand-blue" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 tracking-tight">Invite to Assessment</h2>
                    {/* What the dialog is for. The count lives on the Candidates
                        Selected panel below, which tracks unticking. */}
                    <p className="text-xs text-gray-500 dark:text-slate-500 mt-0.5">Select candidates to invite for an assessment</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsAssessmentModalOpen(false);
                    setSelectedAssessments([]);
                  }}
                  className="p-1.5 text-gray-500 dark:text-slate-500 hover:text-brand-blue hover:bg-brand-blue/5 rounded-md transition-colors flex-shrink-0"
                 aria-label="Close">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div ref={assessmentBodyScrollRef} className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-6">
                {/* The same Candidates Selected panel the Score Resume and
                    Apply to Job dialogs use — full list, untick to drop
                    someone, resume version, and the eye to read a resume. */}
                <SelectedCandidatesPanel
                  resumes={resumes.filter(r => selectedResumes.includes(r.id))}
                  excludedIds={excludedInviteIds}
                  onToggleCandidate={(id) =>
                    setExcludedInviteIds(prev =>
                      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
                    )
                  }
                  tip="Invitations go to each candidate's email address — untick anyone you want to leave out."
                />

                {/* The assessment list — the shared AssessmentPicker, which is
                    the Invite to AI Interview dialog's picker with assessments
                    in it: search, Grouped/Ungrouped, the one-at-a-time note,
                    paging and the preview. It lists exactly the assessments
                    this dialog loads (published, not revoked) and hands the
                    one picked back to the same selection as before. */}
                {loadingAssessments ? (
                  <div className="flex items-center justify-center py-12 tf-loader-center tf-loader-center--compact">
                    <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
                  </div>
                ) : (
                  <AssessmentPicker
                    assessments={activeAssessments}
                    selectedId={selectedAssessments[0]?.id ?? null}
                    onSelect={(assessment) => setSelectedAssessments(assessment ? [assessment] : [])}
                    scrollContainerRef={assessmentBodyScrollRef}
                  />
                )}
              </div>

              {/* Footer */}
              <div className="shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-6 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-200 dark:border-slate-700">
                {/* Reads like the Score Resume footer: what is still missing,
                    and once nothing is, what is about to happen. */}
                {(() => {
                  const inviteeCount = selectedResumes.filter(id => !excludedInviteIds.includes(id)).length;
                  // One line, always: it sits beside the buttons, and a second
                  // line would push the footer taller.
                  return (
                    <div className="min-w-0 sm:truncate sm:whitespace-nowrap text-xs sm:text-sm text-gray-700 dark:text-slate-300">
                      {inviteeCount === 0
                        ? 'Select at least one candidate to continue'
                        : selectedAssessments.length === 0
                          ? 'Select one assessment to continue'
                          : (
                            <span className="inline-flex items-center gap-1.5 align-middle">
                              <CheckCircle className="w-4 h-4 text-brand-blue flex-shrink-0" />
                              Ready to invite {inviteeCount} candidate{inviteeCount === 1 ? '' : 's'} to 1 assessment
                            </span>
                          )}
                    </div>
                  );
                })()}
                <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
                  <button
                    onClick={() => {
                      setIsAssessmentModalOpen(false);
                      setSelectedAssessments([]);
                    }}
                    className="flex-1 sm:flex-none px-4 py-2 text-sm bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (selectedAssessments.length === 0) {
                        toast.error('Please select an assessment');
                        return;
                      }

                      // Prepare candidate data from the candidates still ticked
                      // in the panel above — unticking has to mean something.
                      const candidateData = resumes
                        .filter(r => selectedResumes.includes(r.id) && !excludedInviteIds.includes(r.id))
                        .map((r, index) => ({
                          id: `${Date.now()}-${index}`,
                          name: r.name,
                          email: r.email || '',
                          source: 'database' as const,
                          resumeId: r.id
                        }))
                        .filter(c => c.email); // Only include candidates with email

                      if (candidateData.length === 0) {
                        toast.error('Selected resumes must have email addresses');
                        return;
                      }

                      // Open ShareAssessmentModal for customization (works for both single and multiple)
                      setPrefilledCandidates(candidateData);
                      setIsAssessmentModalOpen(false);
                      setIsShareAssessmentModalOpen(true);
                    }}
                    /* Both halves have to be answered, as in the job dialog. */
                    disabled={
                      selectedAssessments.length === 0 ||
                      selectedResumes.filter(id => !excludedInviteIds.includes(id)).length === 0
                    }
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm whitespace-nowrap bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-colors shadow-md shadow-brand-blue/25 ring-1 ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Mail className="w-4 h-4" />
                    Send Invitations
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* AI Interview invite — shared with the Internal Database page so both
          lists offer the identical action. */}
      <InviteToAIInterviewFlow
        open={isAIInterviewPickerOpen}
        onClose={() => setIsAIInterviewPickerOpen(false)}
        candidates={resumes
          .filter((r) => selectedResumes.includes(r.id))
          .map((r) => ({ id: r.id, name: r.name, email: r.email }))}
        /* The full rows too, so the dialog can show the shared Candidates
           Selected panel rather than a bare count. */
        resumes={resumes.filter((r) => selectedResumes.includes(r.id)) as any}
        onInvited={() => setSelectedResumes([])}
      />

      {/* Share Assessment Modal with Pre-filled Candidates — one assessment,
          the one picked in the invite dialog. */}
      {isShareAssessmentModalOpen && selectedAssessments.length > 0 && (
        <ShareAssessmentModal
          isOpen={isShareAssessmentModalOpen}
          onClose={() => {
            setIsShareAssessmentModalOpen(false);
            setSelectedAssessments([]);
            setPrefilledCandidates([]);
            setSelectedResumes([]);
          }}
          assessment={{
            id: selectedAssessments[0].id,
            title: selectedAssessments[0].title,
            duration: `${selectedAssessments[0].duration_minutes || 0} min`,
            questions: selectedAssessments[0].sections?.reduce((total: number, section: any) =>
              total + (section.questions?.length || 0), 0) || 0,
            type: selectedAssessments[0].sections?.length > 0 && selectedAssessments[0].sections[0]?.section_type === 'ai_generated'
              ? 'AI-Generated'
              : 'Manual',
            short_id: selectedAssessments[0].short_id,
            jd_short_id: selectedAssessments[0].jd_short_id,
            jd_title: selectedAssessments[0].jd_title,
            jd_version: selectedAssessments[0].jd_version
          }}
          prefilledCandidates={prefilledCandidates}
          inviteSource="My Resumes"
        />
      )}

      {/* AI Talent Match Modal */}
      {isAITalentMatchModalOpen && (
        <AITalentMatchSelectJobModal
          resumes={resumes.filter(r => selectedResumes.includes(r.id))}
          jobs={publishedJobs}
          onClose={() => setIsAITalentMatchModalOpen(false)}
          onMatch={(resumeIds, jobId) => {
            // Store selected resumes in sessionStorage for the AI Talent Match page
            const resumeData = resumes
              .filter(r => resumeIds.includes(r.id))
              .map(r => ({
                id: r.id,
                candidateName: r.name,
                email: r.email,
              }));
            sessionStorage.setItem('aiTalentMatchResumes', JSON.stringify(resumeData));

            // Close modal
            setIsAITalentMatchModalOpen(false);
            setSelectedResumes([]);

            // Navigate to AI Talent Match page with the selected JD
            router.push(`/recruitment/ai-talent-match?jdId=${jobId}&view=new`);
          }}
        />
      )}

      {/* Cancel Batch Confirmation Dialog */}
      <AlertDialog
        open={cancelBatchConfirm.isOpen}
        onOpenChange={(open) => {
          if (!open) setCancelBatchConfirm({ isOpen: false, batchId: '', pendingCount: 0 });
        }}
      >
        <AlertDialogContent className="max-w-md sm:max-w-lg">
          <button
            type="button"
            onClick={() => setCancelBatchConfirm({ isOpen: false, batchId: '', pendingCount: 0 })}
            className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <AlertDialogHeader>
            <div className="flex items-start gap-4 pr-8">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                <Ban className="h-6 w-6 text-red-600" />
              </div>
              <div className="flex-1 pt-1">
                <AlertDialogTitle className="text-2xl font-bold text-gray-900">
                  Cancel {cancelBatchConfirm.pendingCount} queued file{cancelBatchConfirm.pendingCount !== 1 ? 's' : ''}?
                </AlertDialogTitle>
                <p className="mt-1 text-sm text-gray-500">
                  This stops {cancelBatchConfirm.pendingCount} file{cancelBatchConfirm.pendingCount !== 1 ? 's' : ''} that
                  {cancelBatchConfirm.pendingCount !== 1 ? ' have' : ' has'} not finished processing.
                </p>
              </div>
            </div>
            <AlertDialogDescription asChild>
              <div className="mt-2 space-y-1.5 rounded-xl border border-red-100 bg-red-50/60 p-4 text-sm text-gray-800">
                <p>Files already completed are kept</p>
                <p>Their Resume Storage units are refunded</p>
                <p>You can re-queue cancelled files later with Retry</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="border-t border-gray-100 pt-4">
            <AlertDialogCancel>Keep processing</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancelBatch}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Cancel {cancelBatchConfirm.pendingCount} file{cancelBatchConfirm.pendingCount !== 1 ? 's' : ''}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Single File Confirmation Dialog */}
      <AlertDialog
        open={cancelItemConfirm.isOpen}
        onOpenChange={(open) => {
          if (!open) setCancelItemConfirm({ isOpen: false, batchId: '', itemId: '', fileName: '' });
        }}
      >
        <AlertDialogContent className="max-w-md sm:max-w-lg">
          <button
            type="button"
            onClick={() => setCancelItemConfirm({ isOpen: false, batchId: '', itemId: '', fileName: '' })}
            className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <AlertDialogHeader>
            <div className="flex items-start gap-4 pr-8">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                <Ban className="h-6 w-6 text-red-600" />
              </div>
              <div className="flex-1 pt-1">
                <AlertDialogTitle className="text-2xl font-bold text-gray-900">
                  Cancel this file?
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <p className="mt-1 text-sm text-gray-500">
                    <span className="font-medium text-gray-900">{cancelItemConfirm.fileName}</span> will not
                    be processed. Its unit is refunded and you can re-queue it later with Retry.
                  </p>
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="border-t border-gray-100 pt-4">
            <AlertDialogCancel>Keep processing</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancelItem}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Cancel file
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Resume Confirmation Dialog */}
      <AlertDialog
        open={deleteResumeConfirm.isOpen}
        onOpenChange={(open) => {
          if (!open) setDeleteResumeConfirm({ isOpen: false, ids: [], names: [] });
        }}
      >
        <AlertDialogContent className="max-w-md sm:max-w-lg">
          <button
            type="button"
            onClick={() => setDeleteResumeConfirm({ isOpen: false, ids: [], names: [] })}
            className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <AlertDialogHeader>
            <div className="flex items-start gap-4 pr-8">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                <Trash2 className="h-6 w-6 text-red-600" />
              </div>
              <div className="flex-1 pt-1">
                <AlertDialogTitle className="text-2xl font-bold text-gray-900">
                  Delete {deleteResumeConfirm.ids.length === 1 ? 'Resume' : `${deleteResumeConfirm.ids.length} Resumes`}
                </AlertDialogTitle>
                <p className="mt-1 text-sm text-gray-500">This action is permanent and cannot be undone.</p>
              </div>
            </div>
            <AlertDialogDescription asChild>
              <div className="mt-2 space-y-4">
                <div className="space-y-4 rounded-xl border border-red-100 bg-red-50/60 p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
                      <ShieldAlert className="h-4 w-4" />
                    </span>
                    <span className="h-6 w-px flex-shrink-0 bg-red-200" aria-hidden="true" />
                    <p className="text-sm text-gray-800">
                      This action is <span className="font-semibold text-red-600">permanent</span> and{' '}
                      <span className="font-semibold text-red-600">cannot be undone</span>.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
                      <Lock className="h-4 w-4" />
                    </span>
                    <span className="h-6 w-px flex-shrink-0 bg-red-200" aria-hidden="true" />
                    <p className="text-sm text-gray-800">
                      Deleted {deleteResumeConfirm.ids.length === 1 ? 'resume' : 'resumes'}{' '}
                      <span className="font-semibold text-red-600">cannot be recovered</span>.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
                      <AlertCircle className="h-4 w-4" />
                    </span>
                    <span className="h-6 w-px flex-shrink-0 bg-red-200" aria-hidden="true" />
                    <p className="text-sm text-gray-800">
                      All associated data will be <span className="font-semibold text-red-600">permanently removed</span>.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 border-t border-gray-100 pt-4">
                  <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 border-brand-orange text-brand-orange">
                    <HelpCircle className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {deleteResumeConfirm.ids.length === 1
                        ? 'Are you sure you want to delete this resume?'
                        : <>Are you sure you want to delete <span className="font-semibold text-gray-900">{deleteResumeConfirm.ids.length} resumes</span>?</>
                      }
                    </p>
                    <p className="mt-0.5 text-sm text-gray-500">This action cannot be reversed.</p>
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="border-t border-gray-100 pt-4">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteResumes}
              className="gap-2 bg-red-600 text-white hover:bg-red-700"
            >
              <Trash2 className="h-4 w-4" />
              Delete {deleteResumeConfirm.ids.length === 1 ? 'Resume' : 'Resumes'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Folder Confirmation Dialog */}
      <AlertDialog
        open={deleteFolderConfirm.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteFolderConfirm({ isOpen: false, folderId: null, folderName: '', resumeCount: 0, parentFolderId: null, parentFolderName: '', contentAction: null, hasSubfolders: false, subfolderCount: 0, subfolderDetails: [], totalResumeCount: 0, subfolderResumeCount: 0, loading: false });
          }
        }}
      >
        <AlertDialogContent className="max-w-md sm:max-w-lg">
          <button
            type="button"
            onClick={() => setDeleteFolderConfirm({ isOpen: false, folderId: null, folderName: '', resumeCount: 0, parentFolderId: null, parentFolderName: '', contentAction: null, hasSubfolders: false, subfolderCount: 0, subfolderDetails: [], totalResumeCount: 0, subfolderResumeCount: 0, loading: false })}
            className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <AlertDialogHeader>
            <div className="flex items-start gap-4 pr-8">
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
                                <li key={sf.id} className="flex items-center gap-2 text-sm text-red-700">
                                  <Folder className="w-3.5 h-3.5 flex-shrink-0" />
                                  <span className="font-medium">{sf.name}</span>
                                  {sf.resume_count > 0 && (
                                    <span className="text-red-500 text-xs">({sf.resume_count} resume{sf.resume_count !== 1 ? 's' : ''})</span>
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
                                        className="w-4 h-4 text-brand-blue"
                                      />
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                          <FolderOpen className="w-4 h-4 text-gray-600" />
                                          <span className="text-sm font-medium text-gray-900">
                                            Move to {parentIsRoot ? 'My Resumes (root)' : deleteFolderConfirm.parentFolderName}
                                          </span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-0.5">
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
                                          className="w-4 h-4 text-brand-blue"
                                        />
                                        <div className="flex-1">
                                          <div className="flex items-center gap-2">
                                            <Folder className="w-4 h-4 text-gray-600" />
                                            <span className="text-sm font-medium text-gray-900">
                                              Move to My Resumes (root)
                                            </span>
                                          </div>
                                          <p className="text-xs text-gray-500 mt-0.5">
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
                                        className="w-4 h-4 text-red-600"
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
            <AlertDialogCancel>Cancel</AlertDialogCancel>
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
