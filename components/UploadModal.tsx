'use client';

import { X, Upload, File, Trash2, FolderPlus, FolderOpen, FolderInput, FolderRoot, Archive, ChevronRight, ChevronDown, AlertCircle, CheckCircle, XCircle, Shield, HardDrive, FileText, FileUser, Files, Database, Info, Lightbulb } from 'lucide-react';
import FileFormatIcon from '@/components/ui/file-format-icon';
import { createPortal } from 'react-dom';
import ViewResumeButton from '@/components/ui/view-resume-button';
import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { Folder } from '@/lib/types/types';
import { Tenant } from '@/lib/types/tenant';
import { hasAvailableQuota, checkQuotaStatus, QuotaInfo, getQuotaTotalLimit } from '@/lib/services/usageTrackingService';
import { usePlanLock } from '@/lib/hooks/usePlanFeature';
import { PLAN_LOCKED_MESSAGE } from '@/lib/types/planFeatures';
import { toast } from 'sonner';
import { formatISTDate } from '@/lib/utils/dateUtils';
import { FOLDER_NAME_MAX_LENGTH, MAX_FOLDER_DEPTH } from './FolderTree';
import { MENU_ITEM_SCALE_CLASS } from '@/lib/constants/menuAnimation';
import ErrorModal from './ErrorModal';
import { clickableProps } from '@/lib/a11y/clickableProps';
import { ModalA11y } from '@/components/ui/modal-a11y';
import { IconButton } from '@/components/ui/icon-button';

// Default constants for fallback
const DEFAULT_MAX_FILE_SIZE = 3 * 1024 * 1024; // 3MB
const MAX_BULK_FILES = 100; // Maximum files per bulk upload (matches backend limit)
const ALLOWED_FORMATS = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/rtf',
  'text/rtf',
  'text/plain'
];
const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.rtf', '.txt'];

// Geometry for the portalled folder-picker dropdown and its cascading
// flyouts — same treatment as the "Move to Folder" picker in BulkActionsBar.
const FOLDER_PICKER_WIDTH = 280;
const FOLDER_PICKER_GAP = 6;
const FOLDER_PICKER_EDGE = 8;
// Same 7-row budget as the "Move to Folder" picker in BulkActionsBar — the
// panel used to grow to fill whatever viewport space was available (could
// be a dozen+ rows on a tall screen), which read as inconsistent with that
// picker. Capped here too, still shrinking further on short viewports.
const FOLDER_PICKER_MAX_HEIGHT = 338;

interface FileValidationError {
  fileName: string;
  error: string;
  type: 'format' | 'size' | 'storage' | 'virus' | 'limit' | 'duplicate';
  // Producers (my-resumes/page.tsx, ResumeSelectionModal) populate these alongside
    // id/candidateName; they were simply never declared, so the reads below failed.
    // Optional because not every duplicate-detection path fills all of them.
  existingResume?: {
    id: string;
    candidateName: string;
    uploadedAt?: string;
    email?: string;
    currentTitle?: string;
    folderName?: string;
    version?: number;
  };
}

interface UploadModalProps {
  folders: Folder[];
  // Optional: resume-database/page.tsx has no tenant and has never passed one. Every
  // read below is `tenant?.…` with a fallback, so absence was already handled.
  tenant?: Tenant | null; // Pass tenant for validation
  uploadSection?: 'my-resumes' | 'internal-db'; // Which section is uploading
  onClose: () => void;
  onUpload: (files: File[], folderId?: string) => Promise<{
    success: boolean;
    error?: string;
    resumeId?: string; // Added to support post-upload scoring
    candidateName?: string;
    // Every resume a bulk upload stored (resumeId above is only the first one)
    uploadedResumes?: { id: string; candidateName: string }[];
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
  }>;
  onCreateFolder?: (name: string, parentId?: string) => void;
  onViewResume?: (resumeId: string) => void;
  onDuplicateDetected?: (duplicateData: any) => void; // Callback for duplicate resolution
  targetFolder?: string;
  /** Opened from a folder's "Upload to Folder": the Select Folder dropdown
   *  lists only that folder and its subfolders (no System Folders, no other
   *  folders). Omitted: every folder. */
  scopeFolderId?: string;
}

/**
 * Plan gate as a wrapper: the body below has dozens of hooks, and returning
 * early before them flipped the hook count once plan features finished
 * loading (React "rendered fewer hooks"). Toast + close run in an effect, not
 * during render.
 */
export default function UploadModal(props: UploadModalProps) {
  const { isPlanLocked } = usePlanLock();
  const locked = isPlanLocked('resume_upload');
  const { onClose } = props;
  useEffect(() => {
    if (locked) {
      toast.error(PLAN_LOCKED_MESSAGE);
      onClose?.();
    }
  }, [locked, onClose]);
  if (locked) return null;
  return <UploadModalBody {...props} />;
}

function UploadModalBody({ folders: hostFolders, tenant, uploadSection, onClose, onUpload, onCreateFolder, onViewResume, onDuplicateDetected, targetFolder: requestedTargetFolder, scopeFolderId }: UploadModalProps) {
  /* Never a destination: the root "Archived Resumes" folder. A resume filed
     there is archived (the flag follows the folder), so a fresh upload would
     land archived — unscorable and hidden from every list. My Resumes already
     left it out of the folders it passes; Resume Scoring's Select Source did
     not, so it was offered (and pre-selected when that folder was open).
     Filtered here so no host can offer it. */
  const isArchivedRootFolder = (f: { name: string; parentId?: string | null }) =>
    f.name === 'Archived Resumes' && !f.parentId;
  const folders = useMemo(() => hostFolders.filter(f => !isArchivedRootFolder(f)), [hostFolders]);
  const targetFolder = requestedTargetFolder && hostFolders.some(f => f.id === requestedTargetFolder && isArchivedRootFolder(f))
    ? undefined
    : requestedTargetFolder;

  const [activeTab, setActiveTab] = useState<'single' | 'bulk'>('single');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  // Find root folder for default selection
  const rootFolder = folders.find(f => f.name.toLowerCase() === 'root' && !f.parentId);

  // Flatten the folder TREE (folder.children) into a single list so the
  // dropdown can include sub-folders. Without this, only top-level folders
  // show up — and the targetFolder ID for a sub-folder never matches an
  // <option>, so the dropdown silently falls back to Root.
  const allFolders = useMemo(() => {
    const out: { folder: Folder; depth: number; path: string }[] = [];
    const walk = (nodes: Folder[] | undefined, depth: number, parentPath: string) => {
      if (!nodes) return;
      for (const f of nodes) {
        if (f.id === 'all') continue; // synthetic "All Resumes" filter
        const path = parentPath ? `${parentPath} / ${f.name}` : f.name;
        out.push({ folder: f, depth, path });
        if (f.children && f.children.length > 0) {
          walk(f.children, depth + 1, path);
        }
      }
    };
    walk(folders, 0, '');
    return out;
  }, [folders]);

  // Initialize with targetFolder, or root folder if available
  const [selectedFolder, setSelectedFolder] = useState<string>(targetFolder || '');

  /* A folder created from here is selected once the host's list holds it: the
     host creates it and reloads its folders, so the new id is only known then.
     Matched by name among the folders that were not there before. */
  const [pendingNewFolder, setPendingNewFolder] = useState<{ name: string; knownIds: string[] } | null>(null);
  if (pendingNewFolder) {
    const flat = (list: Folder[]): Folder[] => list.flatMap((f) => [f, ...flat(f.children ?? [])]);
    const created = flat(hostFolders).find((f) =>
      !pendingNewFolder.knownIds.includes(f.id)
      && f.name.trim().toLowerCase() === pendingNewFolder.name.toLowerCase());
    if (created) {
      setPendingNewFolder(null);
      setSelectedFolder(created.id);
    }
  }

  // Auto-select root folder when folders are loaded
  useEffect(() => {
    if (!targetFolder && rootFolder?.id) {
      setSelectedFolder(rootFolder.id);
    }
  }, [rootFolder?.id, targetFolder]);

  /* The destination exactly as the dropdown states it ("Arun / sub folder"),
     for anything downstream that has to name where these files were headed —
     the duplicate dialog above all. Read from `allFolders`, the same list
     the folder picker below resolves ids against, so the dialog can never
     disagree with what the user just picked. Callers prefix it with the
     section name. */
  const selectedFolderPath = useMemo(() => {
    const id = selectedFolder || rootFolder?.id;
    if (!id) return 'root';
    return allFolders.find(entry => entry.folder.id === id)?.path || 'root';
  }, [selectedFolder, rootFolder?.id, allFolders]);

  /** What the folder picker's trigger button shows. */
  const selectedFolderLabel = useMemo(() => {
    const id = selectedFolder || rootFolder?.id;
    if (!id) return 'Choose folder...';
    if (rootFolder && id === rootFolder.id) return 'Root (Default)';
    return allFolders.find(entry => entry.folder.id === id)?.path || 'Choose folder...';
  }, [selectedFolder, rootFolder, allFolders]);

  /** Trigger icon color — mirrors the folder-list convention (Root=cyan,
   *  Archived=amber, regular=orange) so the closed picker hints at what's
   *  selected without opening it. */
  const selectedFolderIconColorClass = useMemo(() => {
    const id = selectedFolder || rootFolder?.id;
    if (!id) return 'text-gray-500 dark:text-slate-500';
    if (rootFolder && id === rootFolder.id) return 'text-brand-cyan';
    const folder = allFolders.find(entry => entry.folder.id === id)?.folder;
    if (folder?.name === 'Archived Resumes' && !folder.parentId) return 'text-amber-600';
    return 'text-brand-orange';
  }, [selectedFolder, rootFolder, allFolders]);

  /* Folder picker — replaces the old flattened, indented <select> ("↳  ")
     with a real nested/cascading dropdown: top-level folders in the main
     panel, subfolders opening as a flyout to the side on hover (or a tap on
     the chevron, for touch). Same pattern as the "Move to Folder" picker in
     BulkActionsBar.tsx. */
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [folderPickerAnchor, setFolderPickerAnchor] = useState<DOMRect | null>(null);
  const [folderPickerPosition, setFolderPickerPosition] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const folderPickerRef = useRef<HTMLDivElement | null>(null);
  const [openPath, setOpenPath] = useState<{ folder: Folder; anchor: DOMRect }[]>([]);
  const hoverIntentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const closeFolderPicker = () => {
    setShowFolderPicker(false);
    setFolderPickerAnchor(null);
    setFolderPickerPosition(null);
    setOpenPath([]);
  };

  useEffect(() => () => {
    if (hoverIntentTimer.current) clearTimeout(hoverIntentTimer.current);
  }, []);

  useLayoutEffect(() => {
    if (!showFolderPicker || !folderPickerAnchor) return;
    const menu = folderPickerRef.current;
    if (!menu) return;

    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;
    const height = menu.offsetHeight;
    const spaceBelow = viewportH - folderPickerAnchor.bottom - FOLDER_PICKER_GAP - FOLDER_PICKER_EDGE;
    const spaceAbove = folderPickerAnchor.top - FOLDER_PICKER_GAP - FOLDER_PICKER_EDGE;
    const flipUp = height > spaceBelow && spaceAbove > spaceBelow;
    const maxHeight = Math.min(FOLDER_PICKER_MAX_HEIGHT, Math.max(120, flipUp ? spaceAbove : spaceBelow));
    const clampedHeight = Math.min(height, maxHeight);

    const top = flipUp
      ? Math.max(FOLDER_PICKER_EDGE, folderPickerAnchor.top - FOLDER_PICKER_GAP - clampedHeight)
      : Math.min(folderPickerAnchor.bottom + FOLDER_PICKER_GAP, viewportH - FOLDER_PICKER_EDGE - clampedHeight);
    const left = Math.min(
      Math.max(FOLDER_PICKER_EDGE, folderPickerAnchor.left),
      viewportW - FOLDER_PICKER_EDGE - FOLDER_PICKER_WIDTH,
    );

    setFolderPickerPosition(prev =>
      prev && prev.top === top && prev.left === left && prev.maxHeight === maxHeight
        ? prev
        : { top, left, maxHeight },
    );
  }, [showFolderPicker, folderPickerAnchor]);

  useEffect(() => {
    if (!showFolderPicker) return;
    const dismiss = (e?: Event) => {
      const target = e?.target as Element | undefined;
      if (target?.closest?.('[data-folder-picker]')) return;
      closeFolderPicker();
    };
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [showFolderPicker]);

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

  const computeFlyoutPosition = (anchor: DOMRect) => {
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const estimatedHeight = Math.min(260, viewportH - FOLDER_PICKER_EDGE * 2);
    const openLeft =
      viewportW - anchor.right - FOLDER_PICKER_EDGE < FOLDER_PICKER_WIDTH &&
      anchor.left - FOLDER_PICKER_EDGE >= FOLDER_PICKER_WIDTH;
    const left = openLeft
      ? Math.max(FOLDER_PICKER_EDGE, anchor.left - FOLDER_PICKER_WIDTH)
      : Math.min(anchor.right, viewportW - FOLDER_PICKER_EDGE - FOLDER_PICKER_WIDTH);
    const top = Math.min(
      Math.max(FOLDER_PICKER_EDGE, anchor.top),
      viewportH - FOLDER_PICKER_EDGE - estimatedHeight,
    );
    return { top, left, maxHeight: estimatedHeight };
  };

  /* Same System Folders / My Folders split as the "Move to Folder" picker in
     BulkActionsBar — Root pinned above a "My Folders" heading. Archived
     Resumes is not an upload destination (see `folders` above). */
  const isSystemPickerFolder = (f: Folder) => !f.parentId && f.name.toLowerCase() === 'root';
  /* "Upload to Folder" on one folder: that folder (with its subfolders under
     it) is the whole list. Found anywhere in the tree. */
  const scopeFolder = useMemo(() => {
    if (!scopeFolderId) return null;
    const find = (list: Folder[] | undefined): Folder | null => {
      for (const f of list ?? []) {
        if (f.id === scopeFolderId) return f;
        const hit = find(f.children);
        if (hit) return hit;
      }
      return null;
    };
    return find(folders);
  }, [scopeFolderId, folders]);
  const systemPickerFolders = scopeFolder ? [] : folders
    .filter(isSystemPickerFolder)
    .sort((a, b) => (a.name.toLowerCase() === 'root' ? 0 : 1) - (b.name.toLowerCase() === 'root' ? 0 : 1));
  const myPickerFolders = scopeFolder ? [scopeFolder] : folders.filter(f => f.id !== 'all' && !isSystemPickerFolder(f));

  const renderFolderPickerRow = (folder: Folder, depth: number, ancestors: { folder: Folder; anchor: DOMRect }[]): React.ReactNode => {
    const hasChildren = !!folder.children && folder.children.length > 0;
    const isOpen = openPath[depth]?.folder.id === folder.id;
    const isSelected = (selectedFolder || rootFolder?.id) === folder.id;
    return (
      <button
        key={folder.id}
        type="button"
        onClick={() => {
          setSelectedFolder(folder.id);
          closeFolderPicker();
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
        className={`group w-full text-left py-2 text-sm transition-colors flex items-center gap-2 ${
          isSelected ? 'text-brand-blue bg-brand-blue/[0.06]' : 'text-gray-700 dark:text-slate-300'
        } ${isOpen ? 'bg-blue-50 dark:bg-slate-800' : ''}`}
        style={{ paddingLeft: 12 + depth * 16, paddingRight: 8, marginLeft: 4, marginRight: 4, width: 'calc(100% - 8px)' }}
      >
        <FolderInput className="w-4 h-4 text-brand-orange flex-shrink-0" />
        <span className={`truncate flex-1 ${MENU_ITEM_SCALE_CLASS}`}>{folder.name}</span>
        <span className="flex-shrink-0 tf-hint">({folder.count})</span>
        {hasChildren && (
          <ChevronRight
            className="w-3.5 h-3.5 text-gray-500 dark:text-slate-500 flex-shrink-0"
            onClick={(e) => {
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

  const [isDragging, setIsDragging] = useState(false);
  // Drop zone vs file list — they swap in the same slot.
  const hasSelectedFiles = selectedFiles.length > 0;
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [validationErrors, setValidationErrors] = useState<FileValidationError[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isCheckingQuota, setIsCheckingQuota] = useState(false);
  const [showNoFilesError, setShowNoFilesError] = useState(false);
  const [quotaInfo, setQuotaInfo] = useState<QuotaInfo | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tabSwitchWarning, setTabSwitchWarning] = useState<{ message: string; targetTab: 'single' | 'bulk' } | null>(null);

  // Handler to switch tabs with validation
  const handleTabSwitch = (newTab: 'single' | 'bulk') => {
    if (newTab === activeTab) return;
    // Block tab switch if files are already selected — user must clear first
    if (selectedFiles.length > 0) {
      setTabSwitchWarning({
        message: `You have ${selectedFiles.length} ${selectedFiles.length > 1 ? 'files' : 'file'} selected. Clear ${selectedFiles.length > 1 ? 'them' : 'it'} before switching to ${newTab === 'single' ? 'Single' : 'Bulk'} Upload.`,
        targetTab: newTab
      });
      return;
    }
    setTabSwitchWarning(null);
    setValidationErrors([]);
    setActiveTab(newTab);
  };

  const handleClearAndSwitch = () => {
    if (!tabSwitchWarning) return;
    setSelectedFiles([]);
    setValidationErrors([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setActiveTab(tabSwitchWarning.targetTab);
    setTabSwitchWarning(null);
  };

  // Check quota status on mount
  useEffect(() => {
    const fetchQuotaStatus = async () => {
      setIsCheckingQuota(true);
      try {
        const result = await checkQuotaStatus();
        if (result.status === 'success' && result.data?.quotas?.RU) {
          setQuotaInfo(result.data.quotas.RU);
        }
      } catch (error) {
        console.error('Failed to check quota status:', error);
      } finally {
        setIsCheckingQuota(false);
      }
    };
    fetchQuotaStatus();
  }, []);

  // Get tenant-specific limits or use defaults — hard-capped at 3MB per backend limit
  const maxFileSizeMB = Math.min(tenant?.subscription.limits.maxFileSizeMB || 3, 3);
  const maxFileSizeBytes = maxFileSizeMB * 1024 * 1024;
  const storageLimitMB = (tenant?.subscription.limits.storageGB || 50) * 1024; // Convert GB to MB
  const storageUsedMB = tenant?.subscription.usage.storageUsedMB || 0;
  const virusScanEnabled = tenant?.subscription.limits.virusScanEnabled || false;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);

    // Validate file count for single upload
    if (activeTab === 'single' && files.length > 1) {
      setValidationErrors([{
        fileName: '',
        error: `Single upload accepts only 1 file. You dropped ${files.length} files. Please use Bulk Upload to upload multiple files.`,
        type: 'limit'
      }]);
      return;
    }

    const validatedFiles = validateAndFilterFiles(files);
    setSelectedFiles(prev => [...prev, ...validatedFiles]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);

      // Validate file count for single upload
      if (activeTab === 'single' && files.length > 1) {
        setValidationErrors([{
          fileName: '',
          error: `Single upload accepts only 1 file. You selected ${files.length} files. Please use Bulk Upload to upload multiple files.`,
          type: 'limit'
        }]);
        // Clear the file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }

      const validatedFiles = validateAndFilterFiles(files);
      setSelectedFiles(prev => [...prev, ...validatedFiles]);
    }
    // Clear the picker so a file that was removed can be picked again
    // (the same value would not fire onChange).
    e.target.value = '';
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => {
      const newFiles = prev.filter((_, i) => i !== index);
      // Clear validation errors if removing files fixes the issue
      if (activeTab === 'single' && newFiles.length <= 1) {
        setValidationErrors([]);
      }
      return newFiles;
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatStorage = (mb: number) => {
    // Convert MB to units (1 unit = 1 MB)
    const units = Math.round(mb);
    return units.toLocaleString() + ' units';
  };

  /* Opened on one folder ("Upload to Folder"): a new folder goes INSIDE the
     folder the dropdown is on (that folder, or a subfolder of it picked
     there) — up to MAX_FOLDER_DEPTH levels, as on the page. Otherwise a new
     folder is a top-level one, as before. */
  const newFolderParent = scopeFolder
    ? allFolders.find((entry) => entry.folder.id === (selectedFolder || scopeFolder.id)) ?? null
    : null;
  const newFolderTooDeep = !!newFolderParent && newFolderParent.depth >= MAX_FOLDER_DEPTH - 1;

  const handleCreateFolder = () => {
    if (newFolderTooDeep) return;
    if (newFolderName.trim() && onCreateFolder) {
      const flat = (list: Folder[]): Folder[] => list.flatMap((f) => [f, ...flat(f.children ?? [])]);
      // Auto-selected as soon as it appears in the host's folders (see pendingNewFolder).
      setPendingNewFolder({ name: newFolderName.trim(), knownIds: flat(hostFolders).map((f) => f.id) });
      onCreateFolder(newFolderName.trim(), newFolderParent?.folder.id);
      setNewFolderName('');
      setShowCreateFolder(false);
    }
  };

  const validateAndFilterFiles = (files: File[]) => {
    const errors: FileValidationError[] = [];
    const validFiles: File[] = [];
    const totalSizeMB = files.reduce((acc, file) => acc + file.size, 0) / (1024 * 1024);

    // Check single upload file limit (only 1 file allowed)
    if (activeTab === 'single' && files.length > 1) {
      errors.push({
        fileName: '',
        error: `Single upload accepts only 1 file. You selected ${files.length} files. Please use Bulk Upload tab for multiple files.`,
        type: 'limit'
      });
      setValidationErrors(errors);
      return [];
    }

    // ✅ STEP 2.3: Check tenant storage limit
    const availableStorageMB = storageLimitMB - storageUsedMB;
    if (totalSizeMB > availableStorageMB) {
      errors.push({
        fileName: '',
        error: `Storage limit exceeded. Available: ${formatStorage(availableStorageMB)}, Required: ${formatStorage(totalSizeMB)}. Upgrade your plan for more storage.`,
        type: 'storage'
      });
    }

    // Check bulk file limit
    if (activeTab === 'bulk' && files.length > MAX_BULK_FILES) {
      errors.push({
        fileName: '',
        error: `You can upload a maximum of ${MAX_BULK_FILES} files at once. You selected ${files.length} files.`,
        type: 'limit'
      });
    }

    files.forEach(file => {
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      
      // ✅ STEP 2.1: Validate file format (PDF, DOC, DOCX)
      if (!ALLOWED_FORMATS.includes(file.type) && !ALLOWED_EXTENSIONS.includes(fileExtension)) {
        errors.push({
          fileName: file.name,
          error: 'Unsupported file format. Only PDF, DOC, DOCX, RTF, and TXT files are allowed.',
          type: 'format'
        });
        return;
      }

      // ✅ STEP 2.2: Validate maximum file size (tenant-specific)
      if (file.size > maxFileSizeBytes) {
        errors.push({
          fileName: file.name,
          error: `File size (${formatFileSize(file.size)}) exceeds maximum allowed size (${maxFileSizeMB} MB) for your plan.`,
          type: 'size'
        });
        return;
      }

      // ✅ STEP 2.4: Virus/malware scan (if enabled for tenant)
      // TODO: Integrate real scan service (e.g. ClamAV / VirusTotal) here
      // if (virusScanEnabled) {
      //   const random = Math.random();
      //   if (random < 0.02) { // 2% chance of virus detection for demo
      //     errors.push({
      //       fileName: file.name,
      //       error: 'Security scan detected potential malware. File rejected for safety.',
      //       type: 'virus'
      //     });
      //     return;
      //   }
      // }

      // File is valid
      validFiles.push(file);
    });

    setValidationErrors(errors);
    return validFiles;
  };

  const handleValidateAndUpload = async () => {
    // Show error if no files selected
    if (selectedFiles.length === 0) {
      setShowNoFilesError(true);
      setTimeout(() => setShowNoFilesError(false), 3000);
      return;
    }

    // Final validation before upload
    const errors: FileValidationError[] = [];

    // CRITICAL: Validate file count for single upload mode
    if (activeTab === 'single' && selectedFiles.length > 1) {
      errors.push({
        fileName: '',
        error: `Single upload accepts only 1 file. You have ${selectedFiles.length} files selected. Please remove extra files or use Bulk Upload.`,
        type: 'limit'
      });
      setValidationErrors(errors);
      return;
    }

    const totalSizeMB = selectedFiles.reduce((acc, file) => acc + file.size, 0) / (1024 * 1024);
    const availableStorageMB = storageLimitMB - storageUsedMB;

    // Check RU quota before upload
    setIsCheckingQuota(true);
    const quotaCheck = await hasAvailableQuota('RU', selectedFiles.length);
    setIsCheckingQuota(false);

    if (!quotaCheck.hasQuota) {
      errors.push({
        fileName: '',
        error: quotaCheck.error || `Insufficient Resume Storage (RU) units. You need ${selectedFiles.length} units but only have ${quotaCheck.remaining} remaining. Please upgrade your plan or purchase additional units.`,
        type: 'limit'
      });
    }

    if (totalSizeMB > availableStorageMB) {
      errors.push({
        fileName: '',
        error: `Storage limit exceeded. Available: ${formatStorage(availableStorageMB)}, Required: ${formatStorage(totalSizeMB)}. Please upgrade your plan.`,
        type: 'storage'
      });
    }

    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    // All validations passed, proceed with upload
    setIsUploading(true);
    setValidationErrors([]);

    try {
      // Use root folder as fallback when no folder is selected
      const result = await onUpload(selectedFiles, selectedFolder || rootFolder?.id || undefined);

      if (!result.success && result.error) {
        // Check if this is a duplicate error with existing resume info
        if (result.existingResume) {
          // The host shows the duplicate dialog (discard / overwrite / new version)
          if (onDuplicateDetected && result.duplicateData) {
            /* Carry the chosen destination through with it. The parent used to
               re-derive this from its own folder state, which reported Root
               whenever that lookup came up empty — so the duplicate dialog
               named a folder the user had not picked. */
            onDuplicateDetected({ ...result.duplicateData, targetFolderPath: selectedFolderPath });
            onClose(); // Close upload modal, parent will show duplicate modal
            return;
          }
        }

        // Show errors in the validation errors section
        const errorObj = {
          fileName: selectedFiles[0]?.name || '',
          error: result.error,
          type: 'duplicate' as const,
          existingResume: result.existingResume ? {
            id: result.existingResume.id,
            candidateName: result.existingResume.candidateName,
            uploadedAt: result.existingResume.uploadedAt,
          } : undefined
        };
        setValidationErrors([errorObj]);
        setIsUploading(false);
        return;
      }

      // Success — the host has the stored resume(s) already; just close.
      onClose();
    } catch (error: any) {
      console.error('Upload error:', error);

      // Handle INVALID_RESUME error from API
      let errorMessage = 'Upload failed. Please try again.';
      let fileName = selectedFiles[0]?.name || '';

      if (error?.response?.status === 409) {
        const detail = error?.response?.data?.detail;
        const existingResume = detail?.existing_resume;
        errorMessage = existingResume?.candidate_name
          ? `A resume for ${existingResume.candidate_name} already exists in your Shared Resume Database.`
          : 'This resume already exists in the system.';
      } else if (error?.response?.status === 403) {
        const detail = error?.response?.data?.detail;
        const msg = typeof detail === 'string' ? detail : detail?.message;
        errorMessage = msg || 'You do not have permission to upload resumes. Please contact your administrator.';
      } else if (error?.response?.status === 400 && error?.response?.data?.detail) {
        const detail = error.response.data.detail;

        if (detail.error === 'INVALID_RESUME' || detail.error === 'NON_ENGLISH_RESUME') {
          errorMessage = detail.message || 'Invalid Resume. The uploaded file does not appear to be a valid resume.';
          fileName = detail.file_name || fileName;

          // Add suggestion if available
          if (detail.suggestion) {
            errorMessage += `\n\n${detail.suggestion}`;
          }
        } else if (typeof detail === 'string') {
          errorMessage = detail;
        } else if (detail.message) {
          errorMessage = detail.message;
        }
      } else if (error?.message) {
        errorMessage = error.message;
      }

      setValidationErrors([{
        fileName: fileName,
        error: errorMessage,
        type: 'format'
      }]);
      setIsUploading(false);
    }
  };

  /* Quota figures, normalised once.
     `percentage` is a field of the quota object itself — the RU card had been
     reading `subscription.percentage`, which does not exist. That returned
     undefined, so every threshold test was false and the bar rendered
     `width: NaN%` (i.e. empty) without anyone noticing, until formatting it
     turned the same bug into a crash.
     `limit` can arrive as a string, hence Number(); and the percentage is
     recomputed from used/limit whenever the API omits it. */
  const toFiniteNumber = (value: unknown, fallback = 0) => {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : fallback;
  };
  // Plan limit + add-on units, so units added by an admin raise the total.
  const quotaLimit = getQuotaTotalLimit(quotaInfo) ?? 0;
  const quotaUsed = toFiniteNumber(quotaInfo?.subscription?.used);
  const quotaRemaining = toFiniteNumber(quotaInfo?.total_remaining);
  const quotaPercentageFromApi = Number(quotaInfo?.percentage);
  const quotaPercent = Math.min(100, Math.max(0,
    Number.isFinite(quotaPercentageFromApi)
      ? quotaPercentageFromApi
      : quotaLimit > 0 ? (quotaUsed / quotaLimit) * 100 : 0
  ));
  const quotaFreePercent = Math.max(0, 100 - quotaPercent);

  return (
    <ModalA11y closeOnEscape={false}><div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-800 w-full max-w-[95vw] sm:max-w-2xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden relative">
        {/* Header: an icon tile carries the modal's identity, so the title can
            stay one line and the subtitle explain the job. */}
        <div className="flex-shrink-0 flex items-start justify-between gap-3 p-4 sm:p-6 border-b border-gray-100 dark:border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex-shrink-0 w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
              <FileUser className="w-5 h-5 sm:w-6 sm:h-6 text-brand-blue" />
            </div>
            <div className="min-w-0">
              <h2 className="tf-section-title sm:text-xl tracking-tight">Upload Resume</h2>
              <p className="tf-body-muted mt-0.5">
                Add candidate resumes to your library
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
          {/* RU quota. Brand-tinted panel rather than raw blue-50/blue-200 so
              it sits in the same palette as the rest of the app. */}
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 rounded-xl bg-gradient-to-r from-brand-blue/[0.07] via-brand-cyan/[0.05] to-white dark:from-brand-blue/10 dark:via-brand-cyan/5 dark:to-slate-900 border border-brand-blue/15 ring-1 ring-black/[0.02]">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                <Database className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 mb-2">
                  <span
                    className="inline-flex items-center gap-1.5 tf-row-name"
                    title="Each resume you store consumes one Resume Storage Unit from your plan."
                  >
                    Resume Storage Units (RU)
                    <Info className="w-3.5 h-3.5 text-gray-500 dark:text-slate-500" />
                  </span>
                  {isCheckingQuota ? (
                    <span className="tf-body-muted">Checking...</span>
                  ) : quotaInfo ? (
                    <span className="tf-label tabular-nums">
                      {quotaRemaining.toLocaleString()} / {quotaLimit.toLocaleString()} available
                    </span>
                  ) : (
                    <span className="tf-body-muted">Unable to check quota</span>
                  )}
                </div>
                {quotaInfo && (
                  <>
                    {/* Track in the brand's own tint; the fill only leaves brand
                        blue when the quota is genuinely worth worrying about. */}
                    <div className="w-full bg-brand-blue/15 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          quotaPercent >= 90 ? 'bg-red-600' :
                          quotaPercent >= 70 ? 'bg-brand-orange' :
                          'bg-brand-blue'
                        }`}
                        style={{ width: `${quotaPercent}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-1.5">
                      <span className="tf-meta tabular-nums">
                        {quotaUsed.toLocaleString()} used ({quotaPercent.toFixed(1)}%)
                      </span>
                      {quotaInfo.status === 'EXCEEDED' ? (
                        <span className="tf-badge text-red-700 bg-red-50 ring-1 ring-red-200">
                          Quota exhausted
                        </span>
                      ) : (quotaInfo.status === 'APPROACHING' || quotaInfo.status === 'WARNING' || quotaInfo.status === 'CRITICAL') ? (
                        <span className="tf-badge text-brand-orange-deep bg-brand-orange/10 ring-1 ring-brand-orange/20">
                          Low quota
                        </span>
                      ) : (
                        <span className="tf-badge text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 tabular-nums">
                          {quotaFreePercent.toFixed(0)}% free
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Mode switch. The selected side is filled with the brand tint and
              ringed, so it reads as chosen rather than merely hovered. */}
          <div className="grid grid-cols-2 gap-3 mb-4 sm:mb-5">
            {([
              { key: 'single' as const, label: 'Single Upload', Icon: Upload },
              { key: 'bulk' as const, label: 'Bulk Upload', Icon: Files },
            ]).map(({ key, label, Icon }) => {
              const isActive = activeTab === key;
              const isBlocked = !isActive && selectedFiles.length > 0;
              return (
                <button
                  key={key}
                  onClick={() => handleTabSwitch(key)}
                  disabled={isBlocked}
                  title={isBlocked ? `Clear selected files before switching to ${label}` : undefined}
                  className={`px-3 py-2.5 rounded-xl border transition-all flex items-center justify-center gap-2 ${
                    isActive
                      ? 'border-brand-blue bg-brand-blue/[0.07] ring-1 ring-brand-blue/20 shadow-sm shadow-brand-blue/10'
                      : isBlocked
                        ? 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-950 opacity-50 cursor-not-allowed'
                        : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-brand-blue/40 hover:bg-brand-blue/[0.03]'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-brand-blue' : 'text-gray-500 dark:text-slate-500'}`} />
                  <span className={`text-sm font-medium ${isActive ? 'text-brand-blue' : 'text-gray-700 dark:text-slate-200'}`}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>

          {tabSwitchWarning && (
            <div className="flex items-start sm:items-center justify-between gap-3 mb-4 px-3 py-2.5 rounded-lg bg-brand-orange/10 border border-brand-orange/25">
              <div className="flex items-start gap-2 text-brand-orange-deep text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-brand-orange mt-0.5 sm:mt-0" />
                <span>{tabSwitchWarning.message}</span>
              </div>
              <button
                onClick={handleClearAndSwitch}
                className="flex-shrink-0 px-2.5 py-1 text-xs font-medium rounded-md bg-brand-orange hover:bg-brand-orange-deep text-white transition-colors whitespace-nowrap"
              >
                Clear &amp; Switch
              </button>
            </div>
          )}

          {/* Outside the drop zone, so the file list's "Add more files" still
              reaches it while the drop zone is hidden. */}
          <input
            ref={fileInputRef}
            type="file"
            multiple={activeTab === 'bulk'}
            accept=".pdf,.doc,.docx"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* One fixed slot for the drop zone and the file list: the list takes
              the drop zone's place, at the drop zone's size, so the popup
              never changes height (a centred popup that grows or shrinks moves
              as a whole, which read as a glitch). Both layers share the same
              grid cell — the drop zone sizes it, the list fills it and scrolls
              inside — and only cross-fade. */}
          <div className="grid">
          <div
            className={`[grid-area:1/1] transition-[opacity,visibility] duration-150 ease-out motion-reduce:transition-none ${
              hasSelectedFiles ? 'opacity-0 invisible' : 'opacity-100 visible'
            }`}
            inert={hasSelectedFiles}
            aria-hidden={hasSelectedFiles}
          >
          <div {...clickableProps}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`h-full border-2 border-dashed rounded-xl p-4 sm:p-6 text-center cursor-pointer transition-colors ${
              isDragging
                ? 'border-brand-cyan bg-brand-cyan/[0.07]'
                : 'border-brand-blue/25 dark:border-slate-700 bg-gradient-to-b from-brand-blue/[0.03] via-brand-cyan/[0.03] to-white dark:from-slate-800/50 dark:via-slate-800/30 dark:to-slate-900 hover:border-brand-cyan/50 hover:from-brand-blue/[0.06] hover:via-brand-cyan/[0.05]'
            }`}
          >
            {/* Folder-and-resume illustration — its own upload badge and glow
                are baked into the artwork, so nothing extra is layered on top. */}
            <img
              src="/upload-resume-illustration.png"
              alt=""
              aria-hidden="true"
              className={`mx-auto mb-2.5 h-16 w-auto sm:h-20 transition-transform ${isDragging ? 'scale-105' : ''}`}
            />
            <p className="tf-row-title">
              {activeTab === 'single' ? 'Drag & drop your resume here' : 'Drag & drop your resumes here'}
            </p>
            <p className="tf-meta mt-1 mb-3">
              or <span className="text-brand-blue font-medium underline-offset-2 hover:underline">click to browse</span> from your device
            </p>
            {/* The accepted formats as chips — quicker to scan than a sentence. */}
            <div className="mb-2.5 flex flex-wrap items-center justify-center gap-1.5">
              {['PDF', 'DOCX', 'DOC'].map(format => (
                <span
                  key={format}
                  className="tf-badge gap-1.5 border border-brand-cyan/20 bg-white text-2xs text-gray-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  {format === 'PDF' ? (
                    <FileFormatIcon color="var(--raw-dc2626)" accent="var(--raw-f87171)" label="PDF" />
                  ) : (
                    <FileFormatIcon color="var(--raw-2563eb)" accent="var(--raw-93c5fd)" label="W" />
                  )}
                  {format}
                </span>
              ))}
            </div>
            <div className="flex flex-col items-center justify-center gap-1 tf-micro-hint sm:flex-row sm:gap-3 sm:text-2xs">
              <span className="flex items-center gap-1">
                <FileText className="h-3 w-3" />
                Max file size: {maxFileSizeMB} MB
              </span>
              {activeTab === 'bulk' && <span>• Max files: 100 resumes</span>}
            </div>
          </div>
          </div>

          {/* The picked files, in the drop zone's place. `h-0 min-h-full` keeps
              this layer from sizing the slot: it takes the drop zone's height
              and scrolls inside it. Bulk mode still takes more files here. */}
          <div
            className={`[grid-area:1/1] h-0 min-h-full flex flex-col rounded-xl border p-2.5 sm:p-3 transition-[opacity,visibility,border-color,background-color] duration-150 ease-out motion-reduce:transition-none ${
              hasSelectedFiles ? 'opacity-100 visible' : 'opacity-0 invisible'
            } ${
              isDragging && activeTab === 'bulk'
                ? 'border-brand-cyan bg-brand-cyan/[0.05]'
                : 'border-brand-blue/15 dark:border-slate-700 bg-white dark:bg-slate-900'
            }`}
            inert={!hasSelectedFiles}
            aria-hidden={!hasSelectedFiles}
            {...(activeTab === 'bulk' ? { onDragOver: handleDragOver, onDragLeave: handleDragLeave, onDrop: handleDrop } : {})}
          >
            <div className="flex-shrink-0 flex items-center justify-between mb-2 px-0.5">
              <span className="tf-body">
                {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
              </span>
              <button
                onClick={() => {
                  setSelectedFiles([]);
                  setValidationErrors([]);
                  setTabSwitchWarning(null);
                }}
                className="text-sm text-red-600 hover:text-red-700 px-2 sm:px-3 py-1 sm:py-1.5 rounded-md hover:bg-red-50 transition-colors"
              >
                Clear All
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 sm:space-y-2 pr-0.5">
              {selectedFiles.map((file, index) => (
                <div
                  key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                  className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-brand-teal/10 border border-brand-cyan/20 rounded-lg"
                >
                  <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-brand-teal flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="tf-body truncate">{file.name}</div>
                    <div className="tf-meta">{formatFileSize(file.size)}</div>
                  </div>
                  <IconButton bare label={`Remove ${file.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveFile(index);
                    }}
                    className="p-1 text-gray-500 dark:text-slate-500 hover:text-red-600 rounded flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </IconButton>
                </div>
              ))}
              {/* Bulk: add more by click or by dropping onto this panel. */}
              {activeTab === 'bulk' && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-1.5 p-2 sm:p-2.5 rounded-lg border border-dashed border-brand-blue/30 text-sm text-brand-blue hover:bg-brand-blue/[0.04] hover:border-brand-cyan/50 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Add more files
                  <span className="hidden sm:inline tf-meta">or drop them here</span>
                </button>
              )}
            </div>
          </div>
          </div>

          {validationErrors.length > 0 && (
            <div className="mt-4 sm:mt-6">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <span className="text-sm text-red-700 flex items-center gap-1 sm:gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  Validation Errors ({validationErrors.length})
                </span>
              </div>
              <div className="space-y-1.5 sm:space-y-2 max-h-48 sm:max-h-64 overflow-y-auto">
                {validationErrors.map((error, index) => (
                  <div
                    key={index}
                    className={`flex items-start gap-2 sm:gap-3 p-3 sm:p-4 rounded-lg border ${
                      error.type === 'virus' ? 'bg-red-100 border-red-300' :
                      error.type === 'storage' ? 'bg-brand-orange/10 border-brand-orange/20' :
                      error.type === 'duplicate' ? 'bg-brand-orange/10 border-brand-orange/25' :
                      'bg-red-50 border-red-200'
                    }`}
                  >
                    {error.type === 'virus' ? (
                      <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-red-700 flex-shrink-0 mt-0.5" />
                    ) : error.type === 'storage' ? (
                      <HardDrive className="w-4 h-4 sm:w-5 sm:h-5 text-brand-orange flex-shrink-0 mt-0.5" />
                    ) : error.type === 'duplicate' ? (
                      <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-brand-orange flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      {error.fileName && (
                        <div className="tf-body truncate mb-1">{error.fileName}</div>
                      )}
                      <div className={`text-sm whitespace-pre-line ${
                        error.type === 'virus' ? 'text-red-800' :
                        error.type === 'storage' ? 'text-brand-orange-deep' :
                        error.type === 'duplicate' ? 'text-brand-orange-deep font-medium' :
                        'text-red-700'
                      }`}>
                        {error.error}
                      </div>
                      {/* Show existing resume details for duplicates */}
                      {error.type === 'duplicate' && error.existingResume && (
                        <div className="mt-2 sm:mt-3 p-2 sm:p-3 bg-white dark:bg-slate-900 rounded-lg border border-brand-orange/20">
                          <div className="tf-meta mb-1">Existing Resume</div>
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="tf-row-name truncate">
                                {error.existingResume.candidateName}
                              </div>
                              {error.existingResume.uploadedAt && (
                                <div className="tf-meta">
                                  Uploaded: {formatISTDate(error.existingResume.uploadedAt)}
                                </div>
                              )}
                            </div>
                            {onViewResume && (
                              <ViewResumeButton
                                onClick={() => {
                                  onViewResume(error.existingResume!.id);
                                  onClose();
                                }}
                                // Layout-only additions — the row stacks full
                                // width on mobile and must not shrink beside
                                // the duplicate's details on desktop.
                                className="flex-shrink-0 w-full sm:w-auto justify-center"
                              />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 sm:mt-6">
            <label className="flex items-center gap-1.5 tf-row-name mb-2">
              Select Folder
              <span className="font-normal text-gray-500 dark:text-slate-400">(Optional)</span>
              <Info
                className="w-3.5 h-3.5 text-gray-500 dark:text-slate-500"
                aria-hidden="true"
              />
              <span className="sr-only">Resumes land in Root when no folder is chosen.</span>
            </label>

            {!showCreateFolder ? (
              /* Select and Create side by side from sm up — the reference keeps
                 both reachable without scrolling past one to find the other. */
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 sm:gap-3">
                <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => {
                      if (showFolderPicker) {
                        closeFolderPicker();
                        return;
                      }
                      setFolderPickerAnchor(e.currentTarget.getBoundingClientRect());
                      setFolderPickerPosition(null);
                      setShowFolderPicker(true);
                    }}
                    className="w-full flex items-center gap-2 px-3 sm:px-4 py-2.5 tf-panel focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue text-sm text-gray-900 dark:text-slate-100 transition-colors"
                  >
                    <FolderOpen className={`w-4 h-4 flex-shrink-0 ${selectedFolderIconColorClass}`} />
                    <span className="flex-1 min-w-0 truncate text-left">{selectedFolderLabel}</span>
                    <ChevronDown className="w-4 h-4 text-gray-500 dark:text-slate-500 flex-shrink-0" />
                  </button>

                  {showFolderPicker && folderPickerAnchor && typeof document !== 'undefined' && createPortal(
                    <>
                      <div className="fixed inset-0 z-40" onClick={closeFolderPicker} />
                      {/* System Folders (Root, Archived Resumes) grouped above
                          My Folders — same split as the "Move to Folder"
                          picker in BulkActionsBar. A folder with subfolders
                          opens them as a flyout to the side (hover, or tap
                          its chevron on touch) instead of a flattened,
                          indented list. */}
                      <div
                        ref={folderPickerRef}
                        data-folder-picker
                        className="fixed bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 py-1.5 overflow-y-auto overscroll-contain z-50"
                        style={{
                          top: folderPickerPosition?.top ?? folderPickerAnchor.bottom + FOLDER_PICKER_GAP,
                          left: folderPickerPosition?.left ?? folderPickerAnchor.left,
                          width: FOLDER_PICKER_WIDTH,
                          maxHeight: folderPickerPosition?.maxHeight ?? FOLDER_PICKER_MAX_HEIGHT,
                          visibility: folderPickerPosition ? 'visible' : 'hidden',
                        }}
                      >
                        {systemPickerFolders.length > 0 && (
                          <>
                            <div className="px-3 pt-1 pb-1 text-2xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wide">
                              System Folders
                            </div>
                            {systemPickerFolders.map(folder => (
                              <button
                                key={folder.id}
                                type="button"
                                onClick={() => {
                                  setSelectedFolder(folder.id);
                                  closeFolderPicker();
                                }}
                                className={`group w-full text-left py-2 text-sm transition-colors flex items-center gap-2 ${
                                  (selectedFolder || rootFolder?.id) === folder.id
                                    ? 'text-brand-blue bg-brand-blue/[0.06]'
                                    : 'text-gray-700 dark:text-slate-300'
                                }`}
                                style={{ paddingLeft: 12, paddingRight: 8, marginLeft: 4, marginRight: 4, width: 'calc(100% - 8px)' }}
                              >
                                {folder.name === 'Archived Resumes' ? (
                                  <Archive className="w-4 h-4 text-amber-600 flex-shrink-0" />
                                ) : (
                                  <FolderRoot className="w-4 h-4 text-brand-cyan flex-shrink-0" />
                                )}
                                <span className={`flex-1 truncate text-left ${MENU_ITEM_SCALE_CLASS}`}>
                                  {folder.name.toLowerCase() === 'root' ? 'Root (Default)' : folder.name}
                                </span>
                                <span className="flex-shrink-0 tf-hint">({folder.count})</span>
                              </button>
                            ))}
                          </>
                        )}
                        {systemPickerFolders.length > 0 && myPickerFolders.length > 0 && (
                          <div className="border-t border-gray-200 dark:border-slate-700 my-1" />
                        )}
                        {myPickerFolders.length > 0 && (
                          <>
                            <div className="px-3 pt-1 pb-1 text-2xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wide">
                              My Folders
                            </div>
                            {myPickerFolders.map(folder => renderFolderPickerRow(folder, 0, []))}
                          </>
                        )}
                      </div>

                      {/* Cascading flyouts, one portal per open depth. */}
                      {openPath.map((entry, i) => {
                        const ancestors = openPath.slice(0, i + 1);
                        const pos = computeFlyoutPosition(entry.anchor);
                        return createPortal(
                          <div
                            key={entry.folder.id}
                            data-folder-picker
                            className="fixed bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 py-1.5 overflow-y-auto overscroll-contain z-50"
                            style={{ top: pos.top, left: pos.left, width: FOLDER_PICKER_WIDTH, maxHeight: pos.maxHeight }}
                            onMouseEnter={cancelScheduledClose}
                            onMouseLeave={() => scheduleOpenPath(openPath.slice(0, i))}
                          >
                            {entry.folder.children!.map(child => renderFolderPickerRow(child, i + 1, ancestors))}
                          </div>,
                          document.body,
                        );
                      })}
                    </>,
                    document.body,
                  )}
                </div>
                <button
                  onClick={() => setShowCreateFolder(true)}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium border border-dashed border-brand-blue/40 text-brand-blue rounded-xl hover:border-brand-blue hover:bg-brand-blue/[0.06] transition-all whitespace-nowrap"
                >
                  <FolderPlus className="w-4 h-4" />
                  Create New Folder
                </button>
              </div>
            ) : (
              <div className="space-y-2 sm:space-y-3">
                <div className="p-3 sm:p-4 bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-lg">
                  <div className="flex items-start gap-2 sm:gap-3">
                    <div className="hidden sm:flex flex-shrink-0 w-10 h-10 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg items-center justify-center">
                      <FolderPlus className="w-5 h-5 text-brand-blue" />
                    </div>
                    <div className="grid flex-1 min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2">
                      <label className="col-span-3 sm:col-span-1 tf-label whitespace-nowrap">
                        New Folder Name
                      </label>
                        <input
                          type="text"
                          value={newFolderName}
                          onChange={(e) => setNewFolderName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && newFolderName.trim()) {
                              handleCreateFolder();
                            } else if (e.key === 'Escape') {
                              setShowCreateFolder(false);
                              setNewFolderName('');
                            }
                          }}
                          placeholder="e.g., Senior Developers"
                          maxLength={FOLDER_NAME_MAX_LENGTH}
                          autoFocus
                          className="tf-input sm:px-4 rounded-xl"
                        />
                        <button
                          onClick={handleCreateFolder}
                          disabled={!newFolderName.trim() || newFolderTooDeep}
                          title={newFolderTooDeep ? `Maximum folder depth reached (${MAX_FOLDER_DEPTH} levels)` : undefined}
                          className="tf-btn tf-btn-primary px-3 sm:px-4 py-2.5 bg-brand-blue rounded-xl hover:bg-brand-blue-2 transition-colors text-sm shadow-none gap-0"
                        >
                          Create
                        </button>
                        <button
                          onClick={() => {
                            setShowCreateFolder(false);
                            setNewFolderName('');
                          }}
                          className="px-3 sm:px-4 py-2.5 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors text-sm font-medium whitespace-nowrap"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                    {newFolderParent && (
                      <p className={`mt-2 sm:pl-[3.25rem] text-xs ${newFolderTooDeep ? 'text-warning-strong' : 'text-gray-500 dark:text-slate-400'}`}>
                        {newFolderTooDeep
                          ? `“${newFolderParent.path}” is already ${MAX_FOLDER_DEPTH} levels deep — pick a higher folder above to create one inside it.`
                          : <>Created inside <b className="font-semibold text-gray-700 dark:text-slate-300">{newFolderParent.path}</b>, and selected for this upload.</>}
                      </p>
                    )}
                  </div>

                </div>
            )}
          </div>

          {/* Closing note in the brand's amber, so it reads as guidance rather
              than a warning. */}
          <div className="mt-4 sm:mt-5 flex items-start gap-2.5 rounded-xl bg-brand-orange/[0.08] border border-brand-orange/20 px-3 py-2.5">
            <Lightbulb className="w-4 h-4 text-brand-orange flex-shrink-0 mt-0.5" />
            <p className="tf-body">
              <span className="font-semibold">Tip:</span> Organize resumes into folders to find the right candidates faster.
            </p>
          </div>
        </div>

        {/* No Files Error Alert */}
        {showNoFilesError && (
          <div className="flex-shrink-0 mx-4 sm:mx-6 mb-0 p-3 sm:p-4 bg-red-50 border border-red-300 rounded-lg animate-pulse">
            <div className="flex items-center gap-2 sm:gap-3">
              <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-900">No files selected!</p>
                <p className="text-xs text-red-700">Please select at least one resume file to upload.</p>
              </div>
              <IconButton bare label="Close"
                onClick={() => setShowNoFilesError(false)}
                className="p-1 hover:bg-red-100 rounded flex-shrink-0">
                <X className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-600" />
              </IconButton>
            </div>
          </div>
        )}

        <div className="flex-shrink-0 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 p-4 sm:p-5 border-t border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900">
          <button
            onClick={onClose}
            disabled={isUploading}
            className="px-5 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 hover:border-brand-blue/30 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleValidateAndUpload}
            disabled={isUploading || isCheckingQuota || (quotaInfo?.status === 'EXCEEDED') || selectedFiles.length === 0}
            className={`px-5 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 text-sm font-medium ${
              selectedFiles.length === 0 && !isUploading && !isCheckingQuota
                ? 'bg-gray-400 text-white hover:bg-gray-500 cursor-pointer'
                : 'bg-brand-blue text-white hover:bg-brand-blue-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 hover:shadow-md hover:shadow-brand-blue/30'
            }`}
          >
            {/* Icon only in the idle states — the spinners below bring their own. */}
            {!isCheckingQuota && !isUploading && <Upload className="w-4 h-4" />}
            {isCheckingQuota ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Checking Quota...
              </>
            ) : isUploading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Uploading...
              </>
            ) : quotaInfo?.status === 'EXCEEDED' ? (
              'Quota Exhausted - Upgrade Plan'
            ) : selectedFiles.length === 0
              ? 'Select Files to Upload'
              : validationErrors.length > 0
                ? `Upload ${selectedFiles.length} Valid Resume${selectedFiles.length !== 1 ? 's' : ''} (${validationErrors.length} skipped)`
                : `Upload ${selectedFiles.length} Resume${selectedFiles.length !== 1 ? 's' : ''}`
            }
          </button>
        </div>
      </div>

    </div></ModalA11y>
  );
}
