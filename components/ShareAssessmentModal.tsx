import { X, ArrowLeft, Mail, Plus, Trash2, Send, CheckCircle, Clock, Users, Upload, Database, AlertTriangle, ShieldAlert, Info, FolderOpen, ChevronRight, ChevronDown, Loader2, FileSpreadsheet, Eye, Layers, FolderRoot, FolderInput, ClipboardCheck, Copy } from 'lucide-react';
import React, { useState, useEffect, useRef } from 'react';
import { useFolderPanelCollapsed, folderColumnClasses, FolderCollapseButton, FolderPanelRail } from '@/components/ui/folder-panel-collapse';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { assessmentService } from '@/lib/services';
import api from '@/lib/services/api';
import { handleQuotaError } from '@/lib/utils/quotaErrorHandler';
import { stripVersionFromTitle } from '@/lib/utils/assessmentUtils';
import SuccessAnimation from '@/components/ui/success-animation';
import { toast } from 'sonner';
import { useQuota } from '@/contexts/QuotaContext';
import { isValidEmailFormat } from '@/lib/utils/email';
import readXlsxFile from 'read-excel-file/browser';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { VersionChip } from '@/components/assessments/AssessmentVersionHistoryPanel';
import { Button } from '@/components/ui/button';
import ListPagination from '@/components/ListPagination';
import ResumeTextPreviewModal from '@/components/ResumeTextPreviewModal';
import ResumeVersionsModal from '@/components/ResumeVersionsModal';
import { resumeService } from '@/lib/services/resumeService';
import ResumeSelectionSummary from '@/components/ResumeSelectionSummary';
import { togglePick, toggleAllPicks, partitionPicks, countBySource, sourceBreakdown, type ResumePicks } from '@/lib/utils/resumeSelection';

/* THE SHARE ASSESSMENT VIA EMAIL DIALOG — laid out and behaving as the
   Send AI Interview via Email dialog (`ShareAIInterviewModal`) does: the same
   header lines, quota card, Manual / Upload Excel / Select From switcher,
   candidate rows (source badge, duplicate check, paging), folder sidebar with
   System / My Folders and subfolder flyouts, resume preview, collapsible email
   preview and footer. What stays this dialog's own is what an assessment
   invite needs and an interview one does not: several assessments in one
   send, the invite source, the phone number, and the assessment endpoints.

   The interview dialog's per-row Copy Link is mirrored here too — a Copy
   Link button next to the email field that mints an assessment invitation
   without emailing it (assessmentService.createInviteLink) and copies its
   link. Only shown for a single-assessment send (not alongside
   additionalAssessments — a copied link is for one assessment, not several),
   and without the row of social-share icons the interview dialog adds under
   it, since only Copy Link itself was asked for here. */

// Delegates to the one shared, comprehensive format rule (lib/utils/email),
// used everywhere else a candidate email is entered or edited, rather than
// this file's own looser regex (which passed things like "user@example.c").
const isValidEmail = (email: string): boolean => isValidEmailFormat(email);

interface ShareAssessmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  assessment: {
    id: string;
    title: string;
    duration: string;
    questions: number;
    type: string;
    short_id?: string; // Assessment ID like AS-022
    version?: number; // Assessment's live version (e.g., 19)
    jd_short_id?: string; // JD ID like JD-025
    jd_title?: string; // JD title
    jd_version?: number; // JD version number — distinct from assessment.version
    // Section-enable flags so the modal can name every configured section
    // ("HR • Technical • Coding") instead of the single legacy `type` label.
    hr_enabled?: boolean;
    technical_enabled?: boolean;
    coding_enabled?: boolean;
  };
  prefilledCandidates?: CandidateEmail[]; // Optional pre-filled candidates from resume selection
  inviteSource?: string; // Source context: "Resume Scoring", "JD", "Assessment", "Internal DB", "Manual"
  onInviteSent?: (count: number) => void;
  additionalAssessments?: Array<{
    id: string;
    title: string;
    duration: string;
    questions: number;
    type: string;
    short_id?: string;
    version?: number;
    jd_short_id?: string;
    jd_title?: string;
    jd_version?: number;
    hr_enabled?: boolean;
    technical_enabled?: boolean;
    coding_enabled?: boolean;
  }>; // Additional assessments for bulk invite
  /** Shows Back in the footer, returning to the popup this one came from. */
  onBack?: () => void;
  /** Rendered as a step INSIDE a host popup (Job Details' Invite to
   *  Assessment): no backdrop, card or header of its own — the host keeps
   *  its header and footer — and this step's footer (summary, Back, Send
   *  Invitations) is portalled into `footerTarget`, the host's footer. */
  embedded?: boolean;
  footerTarget?: HTMLElement | null;
}

interface CandidateEmail {
  id: string;
  name: string;
  email: string;
  phone?: string; // Phone number
  source?: 'manual' | 'database'; // Track source
  /** Finer-grained origin for the row's source badge. Absent on prefilled rows. */
  origin?: 'manual' | 'excel' | 'my-resumes' | 'shared-db';
  resumeId?: string; // Link to resume if from database
  /** A typed row moved into the candidate list with Add. */
  added?: boolean;
  /** Pre-filled rows only: the invite_source to record for this candidate
   *  (the page / tab they were picked on). Rows added here — Manual, Excel,
   *  Select From — keep Manual / Internal DB. A modal-wide `inviteSource`
   *  still wins over it. */
  inviteSource?: string;
  /** Set once Copy Link mints this row's invitation — its assessment link. */
  generatedLink?: string | null;
  /** The invitation Copy Link created, so Send can email that same one
   *  (via resendInvitation keep_link) instead of creating a duplicate. */
  generatedInvitationId?: string | null;
}

/* An invite the backend refused because this email already has one for the
   assessment (409 / DUPLICATE_INVITATION). The service wraps API errors in a
   plain Error, so the message is read too. */
const isDuplicateInviteError = (error: unknown): boolean => {
  const e = error as { response?: { status?: number }; message?: string } | null;
  const message = e?.message || '';
  return e?.response?.status === 409 ||
    message.includes('status code 409') ||
    message.includes('already been invited') ||
    message.includes('DUPLICATE_INVITATION');
};

interface Resume {
  id: string;
  name: string;
  email: string;
  phone: string;
  position: string;
  experience: string;
  skills: string[];
  versionCount: number;
}

type SidebarFolder = { id: string; name: string; parentId?: string | null; count: number };

/* Pre-filled candidates (already chosen) are listed as they are; Manual's
   entry fields sit under them — one empty row ready to type into. An empty
   row is ignored by Send and the counts. */
const withEntryRow = (list: CandidateEmail[]): CandidateEmail[] =>
  list.some((c) => c.source !== 'database') ? list : [...list, { id: 'manual-entry', name: '', email: '', source: 'manual' }];

export default function ShareAssessmentModal({ isOpen, onClose, assessment, prefilledCandidates, inviteSource, onInviteSent, additionalAssessments, onBack, embedded = false, footerTarget = null }: ShareAssessmentModalProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { quotaData } = useQuota();

  // Quota stats state
  const [quotaStats, setQuotaStats] = useState<{
    total_quota: number;
    consumed: number;
    pending: number;
    available: number;
  } | null>(null);
  const [quotaStatsLoading, setQuotaStatsLoading] = useState(false);

  // Remove "- Version X" from title for email display
  const assessmentTitleForEmail = stripVersionFromTitle(assessment.title);

  // All assessments to send invitations for (main + additional)
  const allAssessments = [assessment, ...(additionalAssessments || [])];

  const [inputMode, setInputMode] = useState<'manual' | 'database' | 'excel'>('manual');
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [candidates, setCandidates] = useState<CandidateEmail[]>(
    prefilledCandidates && prefilledCandidates.length > 0
      ? withEntryRow(prefilledCandidates)
      : [{ id: '1', name: '', email: '', source: 'manual' }]
  );
  /* Ticked "Select From" resumes, kept across tabs and folders so a pick can
     mix My Resumes and the Shared Database (switching tabs used to wipe it). */
  const [picks, setPicks] = useState<ResumePicks>({});
  const pickCount = Object.keys(picks).length;
  const [searchQuery, setSearchQuery] = useState('');

  // Resume opened from the eye on a "Select From" row — same preview as Scored Resumes.
  const [previewResume, setPreviewResume] = useState<{ id: string; name: string } | null>(null);
  // Multi-version resumes open the version list (view and compare only) instead.
  const [versionViewer, setVersionViewer] = useState<{ id: string; name: string; versions: any[] } | null>(null);
  const [loadingViewFor, setLoadingViewFor] = useState<string | null>(null);

  // Database tab state
  const [dbTab, setDbTab] = useState<'my-resumes' | 'internal-db'>('my-resumes');
  const [myResumesData, setMyResumesData] = useState<Resume[]>([]);
  const [internalDbData, setInternalDbData] = useState<Resume[]>([]);
  const [myFolders, setMyFolders] = useState<SidebarFolder[]>([]);
  /* Resumes of the selected folder, fetched server-side (`folder_id`) like My
     Resumes does. The unscoped list carries no usable folder id, which is why
     this dialog's folder counts read 0 and picking a folder emptied the list. */
  const [folderFetch, setFolderFetch] = useState<{ folderId: string; rows: Resume[] } | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  // Collapsible folder sidebar (sm and up) — the same remembered choice as
  // every other resume-database view (components/ui/folder-panel-collapse).
  const { collapsed: foldersCollapsed, setCollapsed: setFoldersCollapsed, animate: foldersAnimate } = useFolderPanelCollapsed();
  // Derived from the fetch held for the folder now selected, so switching
  // folders shows the loader rather than the previous folder's rows.
  const folderResumes = folderFetch && folderFetch.folderId === selectedFolder ? folderFetch.rows : [];
  const isLoadingFolder = dbTab === 'my-resumes' && selectedFolder !== 'all' && folderFetch?.folderId !== selectedFolder;
  // Open subfolder flyouts, one per depth — same cascading hover menu as "Move to Folder".
  const [openPath, setOpenPath] = useState<{ folder: SidebarFolder; anchor: DOMRect }[]>([]);
  const hoverIntentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (hoverIntentTimer.current) clearTimeout(hoverIntentTimer.current);
  }, []);
  const [myResumesLoaded, setMyResumesLoaded] = useState(false);
  const [internalDbLoaded, setInternalDbLoaded] = useState(false);
  // Per source — both tabs now load together, so one flag would clear early.
  const [isLoadingMy, setIsLoadingMy] = useState(false);
  const [isLoadingInternal, setIsLoadingInternal] = useState(false);
  const isLoadingResumes = dbTab === 'my-resumes' ? isLoadingMy : isLoadingInternal;

  // RBAC checks
  const hasMyResumesAccess = !!(user?.permissions?.canUploadResumes || user?.permissions?.canViewResumes);
  const hasInternalDBAccess = !!(user?.permissions?.canAccessInternalDB || user?.permissions?.canViewInternalDB);

  // Legacy alias for Send logic
  const resumeDatabase = dbTab === 'my-resumes' ? myResumesData : internalDbData;

  // Update candidates when pre-filled candidates change
  useEffect(() => {
    if (prefilledCandidates && prefilledCandidates.length > 0) {
      setCandidates(withEntryRow(prefilledCandidates));
    }
  }, [prefilledCandidates]);

  // Fetch quota stats when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setQuotaStatsLoading(true);
    assessmentService.getInvitationStats().then((stats) => {
      setQuotaStats(stats);
    }).finally(() => setQuotaStatsLoading(false));
  }, [isOpen]);

  // Lock background scroll + close on Escape while modal is open
  useEffect(() => {
    if (!isOpen || embedded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose, embedded]);

  // Load resumes when database mode is selected. Both tabs load up front —
  // the Shared Database badge read 0 until its tab was clicked.
  useEffect(() => {
    if (inputMode === 'database') {
      const tab = hasMyResumesAccess ? 'my-resumes' : 'internal-db';
      setDbTab(tab);
      if (hasMyResumesAccess) loadMyResumes();
      if (hasInternalDBAccess || !hasMyResumesAccess) loadInternalDb();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputMode]);

  // Load the selected tab's data when tab changes
  useEffect(() => {
    if (inputMode !== 'database') return;
    if (dbTab === 'my-resumes' && !myResumesLoaded) loadMyResumes();
    if (dbTab === 'internal-db' && !internalDbLoaded) loadInternalDb();
    setSelectedFolder('all');
    setSearchQuery('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbTab]);

  const mapResume = (r: any): Resume => ({
    id: r.id,
    name: r.candidate_name || 'Unknown',
    email: r.email || r.candidate_email || '',
    phone: r.phone || '',
    position: r.current_title || 'Not specified',
    experience: r.experience_years ? `${r.experience_years} years` : 'Not specified',
    skills: r.skills || [],
    versionCount: r.version_count ?? r.versionCount ?? r.versions?.length ?? 1,
  });

  /* Every page of a source. One 200-row page silently dropped the rest, and the
     tab badge counted only what came back. */
  const fetchAllResumes = async (source: 'my-resumes' | 'internal-db', extra: Record<string, string> = {}): Promise<Resume[]> => {
    const pageSize = 200;
    const first = await api.get('/resumes', { params: { ...extra, source, page: 1, page_size: pageSize } });
    const items: any[] = [...(first.data?.items ?? [])];
    const totalPages: number = first.data?.total_pages ?? 1;
    for (let page = 2; page <= totalPages; page++) {
      const res = await api.get('/resumes', { params: { ...extra, source, page, page_size: pageSize } });
      items.push(...(res.data?.items ?? []));
    }
    return items.map(mapResume);
  };
  const loadingSources = useRef<Set<string>>(new Set());

  const loadMyResumes = async () => {
    if (myResumesLoaded || loadingSources.current.has('my-resumes')) return;
    loadingSources.current.add('my-resumes');
    setIsLoadingMy(true);
    try {
      const [resumes, folderRes] = await Promise.all([
        fetchAllResumes('my-resumes'),
        api.get('/folders'),
      ]);
      setMyResumesData(resumes);
      // The folders API may nest subfolders under `children` — flatten so the tree can walk parentId.
      const flat: SidebarFolder[] = [];
      const walk = (list: any[], parentId: string | null) => {
        for (const f of list ?? []) {
          flat.push({ id: f.id, name: f.name, parentId: f.parent_id ?? parentId, count: f.resume_count ?? 0 });
          if (Array.isArray(f.children) && f.children.length) walk(f.children, f.id);
        }
      };
      walk(Array.isArray(folderRes.data) ? folderRes.data : [], null);
      setMyFolders(flat.filter((f, i) => flat.findIndex(x => x.id === f.id) === i));
      setMyResumesLoaded(true);
    } catch {
      toast.error('Failed to load My Resumes');
    } finally {
      loadingSources.current.delete('my-resumes');
      setIsLoadingMy(false);
    }
  };

  const loadInternalDb = async () => {
    if (internalDbLoaded || loadingSources.current.has('internal-db')) return;
    loadingSources.current.add('internal-db');
    setIsLoadingInternal(true);
    try {
      setInternalDbData(await fetchAllResumes('internal-db'));
      setInternalDbLoaded(true);
    } catch {
      toast.error('Failed to load Shared Database');
    } finally {
      loadingSources.current.delete('internal-db');
      setIsLoadingInternal(false);
    }
  };

  useEffect(() => {
    if (dbTab !== 'my-resumes' || selectedFolder === 'all') return;
    let cancelled = false;
    const folderId = selectedFolder;
    fetchAllResumes('my-resumes', { folder_id: folderId })
      .then(rows => { if (!cancelled) setFolderFetch({ folderId, rows }); })
      .catch(() => {
        if (cancelled) return;
        setFolderFetch({ folderId, rows: [] });
        toast.error('Failed to load this folder');
      });
    return () => { cancelled = true; };
  }, [dbTab, selectedFolder]);

  const [customMessage, setCustomMessage] = useState(
    `You have been invited to take an assessment:\n\nImportant Instructions:\n• Ensure you have a stable internet connection\n• Find a quiet place without distractions\n• Complete the assessment in one sitting\n• Your responses will be automatically saved\n\nGood luck!`
  );
  const [expiryDays, setExpiryDays] = useState(1);
  const [sendCopy, setSendCopy] = useState(true);

  // Per-candidate link generation state (Copy Link)
  const [generatingLinkFor, setGeneratingLinkFor] = useState<string | null>(null); // candidateId

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [sentCount, setSentCount] = useState(0);

  // Duplicate invitation popup state
  const [showDuplicateError, setShowDuplicateError] = useState(false);
  const [duplicateEmail, setDuplicateEmail] = useState('');

  /* Candidate rows are paged — 5 a page by default, so a long prefilled list
     doesn't push the rest of the dialog out of reach. */
  const [candidatePage, setCandidatePage] = useState(1);
  const [candidatePageSize, setCandidatePageSize] = useState(10);

  /* "Select From" list paging — 10 a page, back to page 1 whenever the tab,
     folder or search changes what's listed. */
  const [resumePageState, setResumePageState] = useState<{ key: string; page: number }>({ key: '', page: 1 });
  const [resumePageSize, setResumePageSize] = useState(10);
  const resumeListKey = `${dbTab}|${selectedFolder}|${searchQuery}`;
  const resumePage = resumePageState.key === resumeListKey ? resumePageState.page : 1;
  const setResumePage = (page: number) => setResumePageState({ key: resumeListKey, page });

  // Email Preview is collapsed by default — opened on demand from its header.
  const [showEmailPreview, setShowEmailPreview] = useState(false);

  // Early return must stay below every hook call (Rules of Hooks).
  if (!isOpen) return null;

  /* Manual: the chosen candidates (pre-filled, or added from Select From) as
     a list, and under it the rows typed or imported here, paged. */
  const listedCandidates = candidates.filter((c) => c.source === 'database' || c.added);
  const entryCandidates = candidates.filter((c) => c.source !== 'database' && !c.added);
  const candidateTotalPages = Math.max(1, Math.ceil(entryCandidates.length / candidatePageSize));
  const candidateSafePage = Math.min(candidatePage, candidateTotalPages);
  const pagedCandidates = entryCandidates.slice(
    (candidateSafePage - 1) * candidatePageSize,
    candidateSafePage * candidatePageSize,
  );

  /* Manual / Upload Excel / Select From — plain buttons; only the icons carry
     colour. The active one is marked by a darker border and a light fill. */
  const modeTabClass = (active: boolean) =>
    `flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors ${
      active
        ? 'bg-gray-100 dark:bg-slate-800 border-gray-400 dark:border-slate-500 text-gray-900 dark:text-slate-50 font-medium'
        : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800'
    }`;

  /* Hover intent: a short delay so scrolling, or crossing the gap into a
     flyout, doesn't flip menus open and shut — each new event cancels the last. */
  const scheduleOpenPath = (path: { folder: SidebarFolder; anchor: DOMRect }[]) => {
    if (hoverIntentTimer.current) clearTimeout(hoverIntentTimer.current);
    hoverIntentTimer.current = setTimeout(() => setOpenPath(path), 200);
  };
  const cancelScheduledClose = () => {
    if (hoverIntentTimer.current) {
      clearTimeout(hoverIntentTimer.current);
      hoverIntentTimer.current = null;
    }
  };
  const FLYOUT_WIDTH = 224;
  const FLYOUT_EDGE = 8;
  // Opens right of its row, flipping left when there's no room; clamped to the viewport.
  const computeFlyoutPosition = (anchor: DOMRect) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const maxHeight = Math.min(260, vh - FLYOUT_EDGE * 2);
    const openLeft = vw - anchor.right - FLYOUT_EDGE < FLYOUT_WIDTH && anchor.left - FLYOUT_EDGE >= FLYOUT_WIDTH;
    const left = openLeft
      ? Math.max(FLYOUT_EDGE, anchor.left - FLYOUT_WIDTH)
      : Math.min(anchor.right, vw - FLYOUT_EDGE - FLYOUT_WIDTH);
    const top = Math.min(Math.max(FLYOUT_EDGE, anchor.top), vh - FLYOUT_EDGE - maxHeight);
    return { top, left, maxHeight };
  };

  /* Same split as the "Move to Folder" picker: Root and Archived Resumes are
     system fixtures, everything else is the user's own folder. Archived
     Resumes isn't offered here — archived candidates can't be invited. */
  const isSystemFolder = (f: { name: string; parentId?: string | null }) =>
    !f.parentId && (f.name.toLowerCase() === 'root' || f.name === 'Archived Resumes');
  const systemFolders = myFolders.filter(f => isSystemFolder(f) && f.name.toLowerCase() === 'root');
  const folderCount = (folderId: string) => myFolders.find(f => f.id === folderId)?.count ?? 0;

  const folderRowClass = (isSelected: boolean) =>
    `w-full flex items-center gap-2 py-2 pr-2 rounded-md text-sm text-left transition-colors ${
      isSelected
        ? 'bg-gray-200 dark:bg-slate-700 text-gray-900 dark:text-slate-50 font-medium'
        : 'text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800'
    }`;

  /** One folder row, in the sidebar or a flyout. Hovering a row with
   *  subfolders opens them beside it; `ancestors` is the path it sits in. */
  const renderFolderRow = (
    folder: SidebarFolder,
    depth: number,
    ancestors: { folder: SidebarFolder; anchor: DOMRect }[],
  ): React.ReactNode => {
    const hasChildren = myFolders.some(f => f.parentId === folder.id);
    const isFlyoutOpen = openPath[depth]?.folder.id === folder.id;
    return (
      <button
        key={folder.id}
        type="button"
        onClick={() => { setSelectedFolder(folder.id); cancelScheduledClose(); setOpenPath([]); }}
        onMouseEnter={(e) => {
          if (!hasChildren) { scheduleOpenPath(ancestors); return; }
          scheduleOpenPath([...ancestors, { folder, anchor: e.currentTarget.getBoundingClientRect() }]);
        }}
        className={`${folderRowClass(selectedFolder === folder.id || isFlyoutOpen)} pl-3`}
      >
        <FolderInput className="w-4 h-4 text-brand-orange flex-shrink-0" />
        <span className="flex-1 truncate">{folder.name}</span>
        <span className="flex-shrink-0 text-xs text-gray-500 dark:text-slate-400 tabular-nums">({folderCount(folder.id)})</span>
        {/* Fixed-width slot so counts line up whether or not a row has subfolders. */}
        <span className="w-4 flex-shrink-0 flex items-center justify-center">
          {hasChildren && (
            <ChevronRight
              className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500"
              onClick={(e) => {
                // Touch has no hover — the chevron taps the flyout open/closed.
                e.stopPropagation();
                cancelScheduledClose();
                const anchor = (e.currentTarget as Element).closest('button')!.getBoundingClientRect();
                setOpenPath(isFlyoutOpen ? ancestors : [...ancestors, { folder, anchor }]);
              }}
            />
          )}
        </span>
      </button>
    );
  };

  const handleViewResume = async (resume: Resume) => {
    setLoadingViewFor(resume.id);
    try {
      const raw = await resumeService.getVersions(resume.id);
      const list: any[] = Array.isArray(raw) ? raw : raw?.versions || [];
      if (list.length <= 1) {
        setPreviewResume({ id: list[0]?.id || resume.id, name: resume.name });
        return;
      }
      setVersionViewer({ id: resume.id, name: resume.name, versions: list });
    } catch {
      // No version list to show — fall back to the resume itself.
      setPreviewResume({ id: resume.id, name: resume.name });
    } finally {
      setLoadingViewFor(null);
    }
  };

  /* Upload Excel — .xlsx/.xls (every sheet) or .csv, an "Email" column
     required and a "Name" column optional, invalid and duplicate addresses
     skipped. Imported rows join the candidate list, badged "Excel". */
  const parseCSV = (text: string): Record<string, string>[] => {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const parseRow = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') {
          if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
          else inQuotes = !inQuotes;
        } else if (line[i] === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += line[i];
        }
      }
      result.push(current.trim());
      return result;
    };
    const headers = parseRow(lines[0]);
    return lines.slice(1).filter(l => l.trim()).map(line => {
      const values = parseRow(line);
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = values[i] ?? ''; });
      return obj;
    });
  };

  const extractFromSheet = (rawRows: any[][]): CandidateEmail[] => {
    if (rawRows.length < 2) return [];
    const headers = rawRows[0].map((h: any) => String(h ?? '').trim());
    const nameCol = headers.find((h: string) => /^(name|full.?name|candidate.?name|first.?name)$/i.test(h));
    const emailCol = headers.find((h: string) => /^(email|e.?mail|candidate.?email|email.?address)$/i.test(h));
    if (!emailCol) return [];
    const results: CandidateEmail[] = [];
    const seenInSheet = new Set<string>();
    for (const row of rawRows.slice(1)) {
      const rowObj: Record<string, string> = {};
      headers.forEach((h: string, i: number) => { rowObj[h] = String(row[i] ?? '').trim(); });
      const email = (rowObj[emailCol] || '').trim().toLowerCase();
      const name = nameCol ? (rowObj[nameCol] || '').trim() : '';
      if (email && isValidEmail(email) && !seenInSheet.has(email)) {
        seenInSheet.add(email);
        results.push({
          id: Date.now().toString() + Math.random(),
          name: name || email.split('@')[0],
          email,
          source: 'manual' as const,
          origin: 'excel' as const,
        });
      }
    }
    return results;
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (excelInputRef.current) excelInputRef.current.value = '';

    try {
      const parsed: CandidateEmail[] = [];

      if (file.name.toLowerCase().endsWith('.csv')) {
        const rows = parseCSV(await file.text());
        if (rows.length === 0) { toast.error('No data found in the CSV file'); return; }
        const headerKeys = Object.keys(rows[0]);
        const emailCol = headerKeys.find(h => /^(email|e.?mail|candidate.?email|email.?address)$/i.test(h.trim()));
        const nameCol = headerKeys.find(h => /^(name|full.?name|candidate.?name|first.?name)$/i.test(h.trim()));
        if (!emailCol) {
          toast.error(`Could not find an "Email" column. Found: ${headerKeys.join(', ')}`);
          return;
        }
        for (const row of rows) {
          const email = (row[emailCol] || '').trim().toLowerCase();
          const name = nameCol ? (row[nameCol] || '').trim() : '';
          if (email && isValidEmail(email)) {
            parsed.push({ id: Date.now().toString() + Math.random(), name: name || email.split('@')[0], email, source: 'manual', origin: 'excel' });
          }
        }
      } else {
        // readXlsxFile returns { sheet: string, data: Row[][] }[] — all sheets at once
        const allSheets = await readXlsxFile(file) as any[];

        if (allSheets.length > 1) {
          toast.info(`Found ${allSheets.length} sheets (${allSheets.map((sh: any) => sh.sheet).join(', ')}) — combining all.`);
        }

        const seenEmails = new Set<string>();
        let sheetsWithData = 0;

        for (const sheetObj of allSheets) {
          const rows: any[][] = sheetObj.data ?? sheetObj;
          const sheetCandidates = extractFromSheet(rows);
          if (sheetCandidates.length > 0) sheetsWithData++;
          for (const c of sheetCandidates) {
            if (!seenEmails.has(c.email.toLowerCase())) {
              seenEmails.add(c.email.toLowerCase());
              parsed.push(c);
            }
          }
        }

        if (allSheets.length > 1 && sheetsWithData < allSheets.length) {
          toast.info(`${allSheets.length - sheetsWithData} sheet(s) had no recognisable email column and were skipped.`);
        }
      }

      if (parsed.length === 0) {
        toast.error('No valid email addresses found. Make sure your file has a column named "Email" or "name".');
        return;
      }

      // Deduplicate against candidates already in the list
      const existingValid = candidates.filter(c => c.name.trim() && c.email.trim());
      const existingEmails = new Set(existingValid.map(c => c.email.toLowerCase().trim()));
      const newOnly = parsed.filter(c => !existingEmails.has(c.email.toLowerCase().trim()));
      const duplicates = parsed.length - newOnly.length;

      if (duplicates > 0) {
        toast.warning(`${duplicates} duplicate email${duplicates > 1 ? 's' : ''} skipped — already in the list`);
      }

      if (newOnly.length === 0) {
        toast.warning('All emails from the file are already in the list');
        return;
      }

      // Quota warning: inform how many can actually be sent
      if (quotaStats && quotaStats.total_quota < 999999) {
        const totalAfterAdd = existingValid.length + newOnly.length;
        if (totalAfterAdd > quotaStats.available) {
          const canSend = Math.max(0, quotaStats.available - existingValid.length);
          toast.warning(
            `Quota: ${quotaStats.available} unit${quotaStats.available !== 1 ? 's' : ''} available. ` +
            `${newOnly.length} candidates imported — only the first ${canSend} will be sent. Remove unwanted rows before sending.`
          );
        }
      }

      setCandidates(existingValid.length > 0 ? [...existingValid, ...newOnly] : newOnly);
      toast.success(`${newOnly.length} candidate${newOnly.length !== 1 ? 's' : ''} imported from ${file.name}`);
      setInputMode('manual');
    } catch (err) {
      console.error('Failed to parse file:', err);
      toast.error('Failed to parse file. Please ensure it is a valid .xlsx or .csv file.');
    }
  };

  const addCandidate = () => {
    setCandidates([...candidates, { id: Date.now().toString(), name: '', email: '', source: 'manual' }]);
    // Land on the page holding the new, empty row so it can be filled in.
    setCandidatePage(Math.ceil((candidates.filter((c) => c.source !== 'database').length + 1) / candidatePageSize));
  };

  /* Add: a complete entry row joins the candidate list; a fresh empty row
     takes its place when it was the last one. */
  const canAddEntry = (c: CandidateEmail) =>
    !!c.name.trim() && isValidEmail(c.email) && !isDuplicateEmail(c.id, c.email);
  const addEntry = (id: string) => {
    setCandidates((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, added: true } : c));
      return next.some((c) => c.source !== 'database' && !c.added)
        ? next
        : [...next, { id: Date.now().toString(), name: '', email: '', source: 'manual' }];
    });
  };

  const removeCandidate = (id: string) => {
    if (candidates.length > 1) {
      setCandidates(candidates.filter(c => c.id !== id));
    }
  };

  const updateCandidate = (id: string, field: 'name' | 'email', value: string) => {
    const normalizedValue = field === 'email' ? value.toLowerCase() : value;
    setCandidates(candidates.map(c =>
      c.id === id ? { ...c, [field]: normalizedValue } : c
    ));
  };

  const isDuplicateEmail = (id: string, email: string): boolean => {
    if (!email.trim()) return false;
    return candidates.some(
      (c) => c.id !== id && c.email.trim().toLowerCase() === email.trim().toLowerCase()
    );
  };

  const pickOrigin = dbTab === 'my-resumes' ? 'my-resumes' as const : 'shared-db' as const;
  const toggleResumeSelection = (resume: Resume) => setPicks((prev) => togglePick(prev, resume, pickOrigin));

  /* The candidate list with the ticked resumes merged in — Send and the count
     read this, so ticking is enough (no "Add to List" needed). A pick with no
     email, or an email already listed/picked, is skipped and named in the
     picker footer instead of silently dropping the count (4 picked, 3 sent). */
  const validExisting = candidates.filter((c) => c.name.trim() && c.email.trim());
  const pickPartition = partitionPicks(picks, validExisting.map((c) => c.email));
  const mergeSelectedResumes = (): CandidateEmail[] => {
    const newCandidates: CandidateEmail[] = pickPartition.accepted.map((p) => ({
      id: `db-${p.id}`,
      name: p.name,
      email: p.email,
      source: 'database' as const,
      origin: p.origin,
      resumeId: p.id,
    }));
    return validExisting.length > 0 ? [...validExisting, ...newCandidates] : newCandidates.length > 0 ? newCandidates : [{ id: '1', name: '', email: '', source: 'manual' }];
  };

  // Move the picks into the candidate list (Add to List, or leaving Select From).
  const commitPicks = () => {
    if (pickCount === 0) return;
    const skipped = pickPartition.duplicate.length + pickPartition.noEmail.length;
    if (skipped > 0) {
      toast.warning(`${skipped} resume${skipped > 1 ? 's' : ''} skipped — no email or already in the list`);
    }
    setCandidates(mergeSelectedResumes());
    setPicks({});
  };

  const handleAddFromDatabase = () => {
    commitPicks();
    setInputMode('manual');
  };

  // Filter resumes based on active tab, folder (My Resumes only), and search
  const activeResumes = dbTab === 'my-resumes' ? myResumesData : internalDbData;
  const folderFiltered = dbTab === 'my-resumes' && selectedFolder !== 'all'
    ? folderResumes
    : activeResumes;
  const filteredResumes = folderFiltered.filter(r =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.position.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const resumeTotalPages = Math.max(1, Math.ceil(filteredResumes.length / resumePageSize));
  const resumeSafePage = Math.min(resumePage, resumeTotalPages);
  const pagedResumes = filteredResumes.slice(
    (resumeSafePage - 1) * resumePageSize,
    resumeSafePage * resumePageSize,
  );

  // What Send acts on: ticked-but-not-yet-added resumes count as added.
  const pendingDbSelection = pickCount > 0;
  const sendCandidates = pendingDbSelection ? mergeSelectedResumes() : candidates;
  const pickedBySource = countBySource(Object.values(picks));
  const shownPickedCount = filteredResumes.filter((r) => picks[r.id]).length;
  const allShownPicked = filteredResumes.length > 0 && shownPickedCount === filteredResumes.length;

  /* The invite_source recorded for a row: the modal-wide source, else the
     row's own (pre-filled rows), else how it was added here. */
  const sourceOf = (c: CandidateEmail) =>
    inviteSource || c.inviteSource || (c.source === 'database' ? 'Internal DB' : 'Manual');

  /* One assessment to several candidates: the bulk endpoint, and — when it
     refuses the batch because someone already has an invitation — each
     candidate on their own, so only those are skipped and the rest still go
     out (as the AI interview share step does). A duplicate is refused by the
     backend, so nobody already sent gets a second email. */
  const inviteMany = async (assessmentId: string, list: CandidateEmail[]) => {
    const rows = list.map((c) => ({
      candidate_name: c.name,
      candidate_email: c.email,
      candidate_phone: c.phone,
      invite_source: sourceOf(c),
      resume_id: c.resumeId,
    }));
    try {
      const results = await assessmentService.bulkInvite(assessmentId, {
        candidates: rows,
        custom_message: customMessage,
        expiry_days: expiryDays,
      });
      const failed = results.filter((r) => r.status === 'failed').length;
      return { sent: list.length - failed, failed, already: [] as string[] };
    } catch (error) {
      if (!isDuplicateInviteError(error)) throw error;
      let sent = 0;
      let failed = 0;
      const already: string[] = [];
      for (const row of rows) {
        try {
          const r = await assessmentService.invite(assessmentId, { ...row, custom_message: customMessage, expiry_days: expiryDays });
          if (r.status === 'failed') failed++;
          else sent++;
        } catch (err) {
          if (isDuplicateInviteError(err)) already.push(row.candidate_email);
          else failed++;
        }
      }
      return { sent, failed, already };
    }
  };

  // Copy Link mints a link for ONE assessment — with additionalAssessments
  // selected there's no single link to copy, so the button is hidden there.
  const singleAssessmentOnly = allAssessments.length === 1;

  const handleCopyLinkForCandidate = async (candidateId: string) => {
    const candidate = candidates.find(c => c.id === candidateId);
    if (!candidate) return;

    if (!candidate.name.trim() || !candidate.email.trim()) {
      toast.error('Please fill in candidate name and email first');
      return;
    }
    if (!isValidEmail(candidate.email)) {
      toast.error('Please enter a valid email address');
      return;
    }
    // Copy Link creates a real invitation server-side, so it has to respect the
    // same in-list duplicate rule that disables Send Invitations. Without this,
    // clicking it on two rows holding one address minted two invitations.
    if (isDuplicateEmail(candidate.id, candidate.email)) {
      toast.error('This email is already in the list — remove the duplicate row first');
      return;
    }

    // If link already generated, just copy it again (same session, no new invitation).
    if (candidate.generatedLink) {
      await navigator.clipboard.writeText(candidate.generatedLink);
      toast.success('Link copied! Share on WhatsApp, SMS, or any platform.');
      return;
    }

    setGeneratingLinkFor(candidateId);
    try {
      const result = await assessmentService.createInviteLink(assessment.id, {
        candidate_name: candidate.name.trim(),
        candidate_email: candidate.email.trim(),
        expiry_days: expiryDays,
      });

      setCandidates(prev => prev.map(c =>
        c.id === candidateId
          ? { ...c, generatedLink: result.link, generatedInvitationId: result.invitation_id }
          : c
      ));

      await navigator.clipboard.writeText(result.link);
      toast.success(`Link copied for ${candidate.name}! Expires in ${expiryDays} day${expiryDays !== 1 ? 's' : ''}. Share via WhatsApp, SMS, or send via email.`);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      // Team-member emails are blocked here exactly as on Send Invitation —
      // no link is minted, so a later Send hits the same check.
      if (err?.response?.status === 400 && detail?.error === 'TENANT_USER_EMAIL') {
        toast.error(detail.message || `Cannot invite '${candidate.email.trim()}' — this email belongs to an existing team member. Assessment invitations are for external candidates only.`);
        return;
      }
      if (err?.response?.status === 409) {
        toast.error(detail?.message || `${candidate.email.trim()} has already been invited to this assessment.`);
        return;
      }
      const msg = detail?.message || detail || err?.message || 'Failed to generate link';
      toast.error(typeof msg === 'string' ? msg : 'Failed to generate link');
    } finally {
      setGeneratingLinkFor(null);
    }
  };

  const handleSend = async () => {
    setIsSubmitting(true);
    try {
      // Fold the ticked resumes into the list so it matches what was sent.
      if (pendingDbSelection) {
        setCandidates(sendCandidates);
        setPicks({});
      }
      // Filter candidates with name and email
      const candidatesWithData = sendCandidates.filter(c => c.name.trim() && c.email.trim());

      if (candidatesWithData.length === 0) {
        toast.warning('Please add at least one candidate with name and email');
        setIsSubmitting(false);
        return;
      }

      // Validate all email addresses
      const invalidEmails = candidatesWithData.filter(c => !isValidEmail(c.email));
      if (invalidEmails.length > 0) {
        const invalidEmailList = invalidEmails.map(c => c.email).join(', ');
        toast.error(`Invalid email address(es): ${invalidEmailList}. Please enter valid email addresses.`);
        setIsSubmitting(false);
        return;
      }

      const validCandidates = candidatesWithData;

      // Quota check — block if not enough available slots
      const needed = validCandidates.length * allAssessments.length;
      if (quotaStats !== null && quotaStats.total_quota < 999999) {
        if (quotaStats.available < needed) {
          const pendingMsg = quotaStats.pending > 0
            ? ` ${quotaStats.pending} unit${quotaStats.pending > 1 ? 's are' : ' is'} held by active invitations — freed when an invite expires or you revoke it.`
            : '';
          toast.error(
            `Insufficient quota. You have ${quotaStats.available} unit${quotaStats.available !== 1 ? 's' : ''} available but need ${needed} to send these invitations.${pendingMsg}`
          );
          setIsSubmitting(false);
          return;
        }
      } else {
        // Fallback: check via QuotaContext
        const asQuota = quotaData?.quotas?.AS;
        const totalRemaining = typeof asQuota?.total_remaining === 'number' ? asQuota.total_remaining : null;
        if (totalRemaining !== null && totalRemaining < needed) {
          toast.error(`Insufficient quota. You have ${totalRemaining} assessment unit${totalRemaining !== 1 ? 's' : ''} remaining but need ${needed}.`);
          setIsSubmitting(false);
          return;
        }
      }

      // Check if we're sending to multiple assessments
      if (allAssessments.length > 1) {
        const totalInvites = allAssessments.length * validCandidates.length;
        let sentSoFar = 0;
        let failedCount = 0;
        const alreadyInvited = new Set<string>();

        toast.loading(`Sending ${totalInvites} invitation${totalInvites > 1 ? 's' : ''}...`, { id: 'bulk-invite-multi' });

        for (const assessmentToInvite of allAssessments) {
          try {
            // A 200 only means the call went through — a row can still have
            // failed (bad domain, SMTP rejection) with its own status 'failed'.
            // Someone already invited to this assessment is skipped, not failed.
            const r = await inviteMany(assessmentToInvite.id, validCandidates);
            sentSoFar += r.sent;
            failedCount += r.failed;
            r.already.forEach((e) => alreadyInvited.add(e));
            toast.loading(`Sent ${sentSoFar}/${totalInvites} invitations...`, { id: 'bulk-invite-multi' });
          } catch (error: any) {
            console.error(`Failed to send invitations for assessment ${assessmentToInvite.title}:`, error);
            failedCount += validCandidates.length;
          }
        }

        setIsSubmitting(false);

        // Nothing went out — say so and leave the form open to retry.
        if (sentSoFar === 0) {
          if (alreadyInvited.size > 0 && failedCount === 0) {
            toast.dismiss('bulk-invite-multi');
            setDuplicateEmail([...alreadyInvited].join(', '));
            setShowDuplicateError(true);
            return;
          }
          toast.error('Failed to send invitations. Please try again.', { id: 'bulk-invite-multi' });
          return;
        }
        if (alreadyInvited.size > 0) {
          toast.warning(`Skipped — already invited: ${[...alreadyInvited].join(', ')}`);
        }

        if (failedCount === 0) {
          toast.dismiss('bulk-invite-multi');
        } else {
          toast.warning(`Sent ${sentSoFar} invitations successfully. ${failedCount} failed.`, { id: 'bulk-invite-multi' });
        }

        setSentCount(sentSoFar);
        setShowSuccess(true);
        // As in the AI Interview modal: the host is told AFTER the success popup
        // has had its moment, so a refresh it kicks off cannot disturb the popup.
        setTimeout(() => {
          setShowSuccess(false);
          onInviteSent?.(sentSoFar);
          onClose();
        }, 2000);
        return;
      }

      // Single assessment. Each result's own status is read: a request that
      // did not throw can still carry a candidate whose send failed.
      let failedHere = 0;
      let alreadyHere: string[] = [];

      // Rows already carrying a Copy-Link invitation must be EMAILED, not
      // re-invited — invite()/bulkInvite() would 409 as a duplicate against
      // the invitation Copy Link already created. Emailing it keeps that
      // same link alive (keep_link) rather than rotating it.
      const withLink = validCandidates.filter(c => c.generatedInvitationId);
      const withoutLink = validCandidates.filter(c => !c.generatedInvitationId);

      for (const c of withLink) {
        try {
          await assessmentService.resendInvitation(assessment.id, c.generatedInvitationId!, { keep_link: true });
        } catch (err) {
          console.error(`Failed to email existing link for ${c.email}:`, err);
          failedHere += 1;
        }
      }

      if (withoutLink.length === 1) {
        const result = await assessmentService.invite(assessment.id, {
          candidate_name: withoutLink[0].name,
          candidate_email: withoutLink[0].email,
          candidate_phone: withoutLink[0].phone,
          invite_source: sourceOf(withoutLink[0]),
          resume_id: withoutLink[0].resumeId,
          custom_message: customMessage,
          expiry_days: expiryDays,
        });
        if (result.status === 'failed') failedHere += 1;
      } else if (withoutLink.length > 1) {
        const r = await inviteMany(assessment.id, withoutLink);
        failedHere += r.failed;
        alreadyHere = r.already;
      }

      setIsSubmitting(false);
      const successCount = validCandidates.length - failedHere - alreadyHere.length;
      // When something went out, the success popup follows and the host is told
      // after it (below), as the AI Interview modal does. Otherwise no popup is
      // coming, so tell the host now — failed sends still need to show up in
      // its tracker.
      if (successCount <= 0) onInviteSent?.(successCount);

      // Everyone already had an invitation: the same notice a single
      // duplicate gets, naming them all.
      if (successCount === 0 && alreadyHere.length > 0 && failedHere === 0) {
        setDuplicateEmail(alreadyHere.join(', '));
        setShowDuplicateError(true);
        return;
      }
      if (successCount === 0) {
        // Every candidate failed — never show the success screen for that.
        toast.error(
          validCandidates.length === 1
            ? `Invite Failed: ${validCandidates[0].email} could not be delivered — check the email address and domain, then edit and resend it from Invite Status Tracking.`
            : alreadyHere.length > 0
              ? `No invitations went out: ${failedHere} failed to deliver and ${alreadyHere.length} already invited (${alreadyHere.join(', ')}). Check Invite Status Tracking.`
              : `All ${validCandidates.length} invitations failed to deliver — check the email addresses, then edit and resend them from Invite Status Tracking.`
        );
        return;
      }
      if (alreadyHere.length > 0) {
        toast.warning(`Skipped ${alreadyHere.length} already invited: ${alreadyHere.join(', ')}`);
      }
      if (failedHere > 0) {
        toast.warning(`Sent ${successCount} invitation${successCount > 1 ? 's' : ''} successfully. ${failedHere} failed to deliver — check Invite Status Tracking.`);
      }

      setSentCount(successCount);
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        onInviteSent?.(successCount);
        onClose();
      }, 2000);
    } catch (error: any) {
      console.error('Failed to send invitations:', error);
      setIsSubmitting(false);

      // Check for duplicate invitation error (409 Conflict)
      const is409Error = isDuplicateInviteError(error);

      if (is409Error) {
        const email = error?.response?.data?.detail?.candidate_email ||
                      error?.response?.data?.candidate_email ||
                      sendCandidates[0]?.email ||
                      'this candidate';
        setDuplicateEmail(email);
        setShowDuplicateError(true);
        return;
      }

      handleQuotaError(error, router, `Failed to send invitations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Validation gate for the Send Invitations button:
  //   • at least ONE fully-valid candidate (name + valid email), AND
  //   • NO row with a blocking error — a row in use (name OR email typed) that
  //     is incomplete, has an invalid email, or duplicates another row. A
  //     fully empty row is ignored, not an error.
  const hasAtLeastOneValid = sendCandidates.some(
    (c) => c.name.trim() && c.email.trim() && isValidEmail(c.email),
  );
  const hasBlockingRowError = sendCandidates.some((c) => {
    const inUse = c.name.trim() || c.email.trim();
    if (!inUse) return false;
    return (
      !c.name.trim() ||
      !c.email.trim() ||
      !isValidEmail(c.email) ||
      sendCandidates.some((o) => o.id !== c.id && o.email.trim().toLowerCase() === c.email.trim().toLowerCase())
    );
  });
  const isValid = hasAtLeastOneValid && !hasBlockingRowError;

  // Every enabled round, falling back to the legacy `type` label.
  const sectionLabel = (() => {
    const sections: string[] = [];
    if (assessment.hr_enabled) sections.push('HR');
    if (assessment.technical_enabled) sections.push('Technical');
    if (assessment.coding_enabled) sections.push('Coding');
    return sections.length > 0 ? sections.join(', ') : assessment.type;
  })();

  if (showSuccess) {
    /* The Assessment invitation success popup — the same one in every host.
       Embedded in a host popup it is portalled to the page so it opens over
       that popup rather than inside its body. */
    const successPopup = (
      <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6" role="dialog" aria-modal="true">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 max-w-[95vw] sm:max-w-md w-full p-6 sm:p-8 text-center max-h-[calc(100dvh-2rem)] overflow-y-auto tf-round-edges">
          <div className="flex justify-center mb-4">
            <SuccessAnimation
              className="w-14 h-14 sm:w-16 sm:h-16"
              fallback={
                <div className="w-14 h-14 sm:w-16 sm:h-16 bg-brand-blue/10 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 sm:w-10 sm:h-10 text-brand-blue" />
                </div>
              }
            />
          </div>
          <h3 className="text-gray-900 dark:text-slate-50 text-base sm:text-lg font-semibold tracking-tight mb-2">Invitations Sent!</h3>
          <p className="text-gray-600 dark:text-slate-400 text-sm">
            Email invitations have been sent to {sentCount} candidate{sentCount > 1 ? 's' : ''}
          </p>
        </div>
      </div>
    );
    return embedded && typeof document !== 'undefined' ? createPortal(successPopup, document.body) : successPopup;
  }

  // Duplicate invitation error popup
  if (showDuplicateError) {
    const dismissDuplicate = () => {
      setShowDuplicateError(false);
      setDuplicateEmail('');
    };
    return (
      <div
        className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6"
        onClick={(e) => { if (e.target === e.currentTarget) dismissDuplicate(); }}
        role="dialog"
        aria-modal="true"
      >
        <div className="relative bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 max-w-[95vw] sm:max-w-md w-full p-6 sm:p-8 max-h-[90dvh] flex flex-col overflow-hidden tf-round-edges">
          <button
            onClick={() => {
              dismissDuplicate();
              onClose();
            }}
            className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex-shrink-0 text-center mb-6">
            <div className="w-16 h-16 bg-warning-subtle rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-10 h-10 text-warning" />
            </div>
            <h3 className="text-gray-900 dark:text-slate-50 text-lg font-semibold tracking-tight mb-2">Invitation Already Sent</h3>
            <p className="text-gray-600 dark:text-slate-400 text-sm">
              An invitation has already been sent to{' '}
              <span className="font-medium text-gray-800 dark:text-slate-100 [overflow-wrap:anywhere]">{duplicateEmail}</span> for this assessment.
            </p>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto bg-gray-50 dark:bg-slate-800/50 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-700 dark:text-slate-300 mb-2">You can:</p>
            <ul className="text-sm text-gray-600 dark:text-slate-400 space-y-1">
              <li>• Try a <span className="font-medium">different email address</span></li>
              <li>• Send invitation for a <span className="font-medium">different assessment</span></li>
              <li>• Check the candidate&apos;s existing invitation status</li>
            </ul>
          </div>

          <div className="flex-shrink-0 flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
            <Button variant="primary" onClick={dismissDuplicate} className="flex-1">
              Try Different Email
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* The job, its version and the assessment setup — the header's detail
     lines; the embedded step shows them above its content instead. */
  const headerMeta = (
    <>
              {/* JD ID, the job, its job version, then the assessment version
                  — which job, and which version of it, these invitations are
                  for. The version chips are the Assessments page's own. */}
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5 text-xs sm:text-sm text-gray-600 dark:text-slate-400 min-w-0">
                {assessment.jd_short_id && <JobIdBadge className="flex-shrink-0">{assessment.jd_short_id}</JobIdBadge>}
                <span className="truncate min-w-0" title={assessment.jd_title || assessmentTitleForEmail}>
                  {assessment.jd_title || assessmentTitleForEmail}
                </span>
                {typeof assessment.jd_version === 'number' && (
                  <span className="inline-flex items-center gap-1.5 flex-shrink-0" title="Job version">
                    -
                    <VersionChip kind="job" version={assessment.jd_version} />
                  </span>
                )}
                {typeof assessment.version === 'number' && (
                  <span className="inline-flex items-center gap-1.5 flex-shrink-0 whitespace-nowrap">
                    Assessment Version -
                    <VersionChip kind="assessment" version={assessment.version} />
                  </span>
                )}
                {allAssessments.length > 1 && (
                  <span className="flex-shrink-0 text-2xs sm:text-xs px-1.5 sm:px-2 py-0.5 bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 rounded-full font-medium">
                    +{allAssessments.length - 1} more
                  </span>
                )}
              </p>
              {/* Assessment setup — duration and the rounds it covers. */}
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-gray-500 dark:text-slate-400 min-w-0">
                <span className="inline-flex items-center gap-1 flex-shrink-0">
                  <Clock className="w-3.5 h-3.5" />
                  {assessment.duration}
                </span>
                {sectionLabel && (
                  <>
                    <span aria-hidden="true">•</span>
                    <span className="truncate text-gray-400 dark:text-slate-500">{sectionLabel}</span>
                  </>
                )}
              </p>
    </>
  );
  const footerContent = (
    <>
          <div className="text-sm text-gray-600 dark:text-slate-400 min-w-0">
            {(() => {
              const validRows = sendCandidates.filter(c => c.name.trim() && c.email.trim());
              const validCount = validRows.length;
              const breakdown = validCount > 0 ? sourceBreakdown(validRows) : '';
              const needed = validCount * allAssessments.length;
              const available = quotaStats?.available ?? null;
              const isUnlimited = available !== null && available >= 999999;
              const insufficientQuota = !isUnlimited && available !== null && available < needed;
              return (
                <span className={insufficientQuota ? 'text-destructive' : ''}>
                  {validCount} candidate{validCount !== 1 ? 's' : ''} will receive {allAssessments.length > 1 ? `${allAssessments.length} assessments` : 'this assessment'}
                  {breakdown && <span className="block text-xs text-gray-500 dark:text-slate-500">{breakdown}</span>}
                  {insufficientQuota && (
                    <span className="ml-2 font-medium">— only {available} unit{available !== 1 ? 's' : ''} available</span>
                  )}
                </span>
              );
            })()}
          </div>
          <div className="flex items-center gap-3 ml-auto">
            {/* Cancel — closes without sending, exactly as the X used to. */}
            <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            {onBack && (
              <Button variant="secondary" onClick={onBack} disabled={isSubmitting} icon={<ArrowLeft className="w-4 h-4" />}>
                Back
              </Button>
            )}
            <Button
              variant="primary"
              onClick={handleSend}
              disabled={!isValid || isSubmitting || (quotaStats !== null && quotaStats.available === 0 && quotaStats.total_quota < 999999)}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send Invitations
                </>
              )}
            </Button>
          </div>
    </>
  );
  const extras = (
    <>
      {/* Subfolder flyouts, one portal per open depth, beside their trigger row.
          z-[60] keeps them above this z-50 modal. */}
      {typeof document !== 'undefined' && openPath.map((entry, i) => {
        const ancestors = openPath.slice(0, i + 1);
        const pos = computeFlyoutPosition(entry.anchor);
        return createPortal(
          <div
            key={entry.folder.id}
            className="fixed z-[60] bg-white dark:bg-slate-900 rounded-lg shadow-2xl border border-gray-200 dark:border-slate-700 p-1 space-y-0.5 overflow-y-auto overscroll-contain"
            style={{ top: pos.top, left: pos.left, width: FLYOUT_WIDTH, maxHeight: pos.maxHeight }}
            onMouseEnter={cancelScheduledClose}
            onMouseLeave={() => scheduleOpenPath(openPath.slice(0, i))}
          >
            {myFolders.filter(f => f.parentId === entry.folder.id).map(child => renderFolderRow(child, i + 1, ancestors))}
          </div>,
          document.body,
        );
      })}

      {/* Read a candidate's resume without leaving the dialog — z-[60] keeps it above this z-50 modal. */}
      {previewResume && (
        <ResumeTextPreviewModal
          resumeId={previewResume.id}
          title={previewResume.name}
          zIndexClassName="z-[60]"
          onClose={() => setPreviewResume(null)}
        />
      )}

      {/* Several versions: preview and compare. No onSelectVersion, so the
          "In use" / "Use this version" controls stay hidden here. */}
      {versionViewer && (
        <ResumeVersionsModal
          candidate={{ id: versionViewer.id, name: versionViewer.name, resumeId: versionViewer.id }}
          versions={versionViewer.versions}
          onClose={() => setVersionViewer(null)}
        />
      )}
    </>
  );

  const contentBlock = (
    <>
        {/* Content */}
        <div className={embedded ? '' : 'flex-1 min-h-0 overflow-y-auto p-4 sm:p-6'}>
          {/* Several assessments in one send — this dialog's own; the header
              names the first, this lists them all. */}
          {allAssessments.length > 1 && (
            <div className="mb-4 rounded-xl border border-gray-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3">
              <p className="text-xs text-gray-600 dark:text-slate-400 font-medium mb-1.5">
                Invitations for {allAssessments.length} assessments:
              </p>
              <div className="space-y-1">
                {allAssessments.map((a, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs px-2 py-1.5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700/60 rounded text-gray-700 dark:text-slate-300">
                    {a.jd_short_id && <JobIdBadge className="flex-shrink-0">{a.jd_short_id}</JobIdBadge>}
                    <span className="truncate min-w-0">{a.jd_title || stripVersionFromTitle(a.title)}</span>
                    {typeof a.jd_version === 'number' && <VersionChip kind="job" version={a.jd_version} />}
                    {typeof a.version === 'number' && <VersionChip kind="assessment" version={a.version} />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quota Banner — the Send AI Interview dialog's card: icon tile,
              headline + available count, usage bar, then the breakdown with a
              status pill. */}
          {(() => {
            const asQuota = quotaData?.quotas?.AS;
            const subscriptionLimit = typeof asQuota?.subscription?.limit === 'number' ? asQuota.subscription.limit : null;
            const subscriptionUsed = asQuota?.subscription?.used ?? 0;

            const panelClass = (tone: 'ok' | 'low' | 'out') =>
              `mb-4 p-3 sm:p-4 rounded-xl border ring-1 ring-black/[0.02] ${
                tone === 'out'
                  ? 'bg-destructive-subtle border-destructive-line'
                  : tone === 'low'
                  ? 'bg-warning-subtle border-warning-line'
                  : 'bg-gradient-to-r from-brand-blue/[0.07] via-brand-cyan/[0.05] to-white dark:from-brand-blue/10 dark:via-brand-cyan/5 dark:to-slate-900 border-brand-blue/15'
              }`;
            const iconTile = (tone: 'ok' | 'low' | 'out') => (
              <div className={`flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-lg ring-1 flex items-center justify-center ${
                tone === 'out' ? 'bg-destructive/10 ring-destructive/20' : tone === 'low' ? 'bg-brand-orange/10 ring-brand-orange/20' : 'bg-brand-blue/10 ring-brand-blue/15'
              }`}>
                {tone === 'out'
                  ? <ShieldAlert className="w-4 h-4 sm:w-5 sm:h-5 text-destructive" />
                  : <ClipboardCheck className={`w-4 h-4 sm:w-5 sm:h-5 ${tone === 'low' ? 'text-brand-orange-deep' : 'text-brand-blue'}`} />}
              </div>
            );
            const statusPill = (tone: 'ok' | 'low' | 'out', freePercent: number) =>
              tone === 'out' ? (
                <span className="flex-shrink-0 text-2xs sm:text-xs font-medium text-red-700 bg-red-50 ring-1 ring-red-200 rounded-full px-2 py-0.5">Quota exhausted</span>
              ) : tone === 'low' ? (
                <span className="flex-shrink-0 text-2xs sm:text-xs font-medium text-brand-orange-deep bg-brand-orange/10 ring-1 ring-brand-orange/20 rounded-full px-2 py-0.5">Low quota</span>
              ) : (
                <span className="flex-shrink-0 text-2xs sm:text-xs font-medium text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 rounded-full px-2 py-0.5 tabular-nums">{freePercent.toFixed(0)}% free</span>
              );

            if (quotaStatsLoading) {
              return (
                <div className={`${panelClass('ok')} flex items-center gap-3 text-sm text-gray-500 dark:text-slate-400`}>
                  {iconTile('ok')}
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Checking assessment quota...
                  </span>
                </div>
              );
            }

            if (quotaStats) {
              const { total_quota, consumed, pending, available } = quotaStats;
              const isUnlimited = total_quota >= 999999;
              const isInsufficient = !isUnlimited && available === 0;
              const isLow = !isUnlimited && !isInsufficient && available <= 3;

              if (isUnlimited) {
                return (
                  <div className={`${panelClass('ok')} flex items-center gap-3`}>
                    {iconTile('ok')}
                    <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-slate-50">Unlimited assessment units</span>
                  </div>
                );
              }

              const tone = isInsufficient ? 'out' : isLow ? 'low' : 'ok';
              const pct = (n: number) => (total_quota > 0 ? Math.min(100, (n / total_quota) * 100) : 0);
              const freePercent = total_quota > 0 ? (available / total_quota) * 100 : 0;

              return (
                <div className={panelClass(tone)}>
                  <div className="flex items-start gap-3">
                    {iconTile(tone)}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 mb-2">
                        <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-slate-50">
                          {isInsufficient
                            ? 'No assessment units available'
                            : isLow
                            ? `Only ${available} unit${available !== 1 ? 's' : ''} available`
                            : `${available} assessment unit${available !== 1 ? 's' : ''} available`
                          }
                        </span>
                        <span className="text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-200 tabular-nums">
                          {available.toLocaleString()} / {total_quota.toLocaleString()} available
                        </span>
                      </div>
                      {/* Consumed in brand blue, held by pending invitations in a lighter cyan. */}
                      <div className="w-full flex bg-brand-blue/15 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                        <div className={`h-full transition-all duration-300 ${tone === 'out' ? 'bg-red-600' : tone === 'low' ? 'bg-brand-orange' : 'bg-brand-blue'}`} style={{ width: `${pct(consumed)}%` }} />
                        <div className="h-full bg-brand-cyan/70 transition-all duration-300" style={{ width: `${pct(pending)}%` }} />
                      </div>
                      <div className="flex items-start justify-between gap-2 mt-1.5">
                        <div className="min-w-0 text-2xs sm:text-xs text-gray-600 dark:text-slate-400">
                          <div className="flex flex-wrap gap-x-4 gap-y-0.5 tabular-nums">
                            <span>Total: {total_quota}</span>
                            <span>Attended (consumed): {consumed}</span>
                            {/* Always shown, 0 included, so the breakdown reads
                                the same three parts whatever is held. */}
                            <span>Pending invitations (held): {pending}</span>
                          </div>
                          {/* Always shown, with the live count — the AI
                              Interviews note's own sentence, plus revoke, the
                              other way a held unit comes back. */}
                          <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-brand-cyan/10 ring-1 ring-brand-cyan/25 px-2.5 py-0.5 text-brand-blue dark:text-slate-200">
                            <Info className="w-3 h-3 flex-shrink-0" />
                            <span>
                              <span className="font-semibold">Note:</span>{' '}
                              {pending} unit{pending !== 1 ? 's' : ''} held by active invitations — freed when an invite expires or you revoke it.
                            </span>
                          </p>
                        </div>
                        {statusPill(tone, freePercent)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            // Fallback to QuotaContext data
            if (subscriptionLimit !== null) {
              const remaining = subscriptionLimit - subscriptionUsed;
              const isInsufficient = remaining <= 0;
              const isLow = !isInsufficient && remaining <= 3;
              const tone = isInsufficient ? 'out' : isLow ? 'low' : 'ok';
              const usedPercent = subscriptionLimit > 0 ? Math.min(100, (subscriptionUsed / subscriptionLimit) * 100) : 0;
              return (
                <div className={panelClass(tone)}>
                  <div className="flex items-start gap-3">
                    {iconTile(tone)}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 mb-2">
                        <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-slate-50">
                          {Math.max(0, remaining)} assessment unit{remaining !== 1 ? 's' : ''} remaining
                        </span>
                        <span className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 tabular-nums">
                          ({subscriptionUsed} used of {subscriptionLimit})
                        </span>
                      </div>
                      <div className="w-full bg-brand-blue/15 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-300 ${tone === 'out' ? 'bg-red-600' : tone === 'low' ? 'bg-brand-orange' : 'bg-brand-blue'}`} style={{ width: `${usedPercent}%` }} />
                      </div>
                      <div className="flex justify-end mt-1.5">{statusPill(tone, 100 - usedPercent)}</div>
                    </div>
                  </div>
                </div>
              );
            }

            return null;
          })()}

          {/* Candidate Emails Section */}
          <div className="mb-6">
            {/* Mode Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
              <label className="text-gray-900 dark:text-slate-50 font-medium">Select Candidates</label>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => { commitPicks(); setInputMode('manual'); }} className={modeTabClass(inputMode === 'manual')}>
                  <Upload className="w-4 h-4 text-brand-blue" />
                  Manual
                </button>
                <button type="button" onClick={() => { commitPicks(); excelInputRef.current?.click(); }} className={modeTabClass(inputMode === 'excel')}>
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Upload Excel
                </button>
                <input
                  ref={excelInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleExcelUpload}
                  className="hidden"
                />
                <button type="button" onClick={() => setInputMode('database')} className={modeTabClass(inputMode === 'database')}>
                  <Database className="w-4 h-4 text-brand-orange" />
                  Select From
                </button>
              </div>
            </div>

            {/* Manual Input Mode */}
            {inputMode === 'manual' && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-gray-600 dark:text-slate-400">Enter candidate details manually</p>
                  <button
                    type="button"
                    onClick={addCandidate}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-brand-blue hover:text-brand-blue-2 rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Candidate
                  </button>
                </div>

                <div className="space-y-3">
                  {pagedCandidates.map((candidate) => (
                    <div
                      key={candidate.id}
                      className={`relative p-4 border rounded-lg ${
                        candidate.source === 'database' ? 'bg-gray-50 dark:bg-slate-800/50 border-gray-300 dark:border-slate-700' : 'bg-gray-50 dark:bg-slate-800/50 border-gray-200 dark:border-slate-700'
                      }`}
                    >
                      {/* Where the row came from, pinned top-right — a word reads faster than an icon in a long list. */}
                      {(() => {
                        const badge =
                          candidate.origin === 'excel' ? { label: 'Excel', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20' }
                          : candidate.origin === 'my-resumes' ? { label: 'My Resumes', cls: 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20' }
                          : candidate.origin === 'shared-db' ? { label: 'Shared DB', cls: 'bg-brand-cyan/10 text-brand-cyan ring-brand-cyan/20' }
                          : candidate.source === 'database' ? { label: 'Database', cls: 'bg-brand-blue/10 text-brand-blue ring-brand-blue/15' }
                          : { label: 'Manual', cls: 'bg-gray-100 text-gray-600 ring-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700' };
                        return (
                          <span className={`absolute top-2 right-3 inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-semibold ring-1 ${badge.cls}`}>
                            {badge.label}
                          </span>
                        );
                      })()}
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="min-w-0">
                            <label className="text-xs text-gray-600 dark:text-slate-400 mb-1 block">Full Name *</label>
                            <input
                              type="text"
                              value={candidate.name}
                              onChange={(e) => updateCandidate(candidate.id, 'name', e.target.value)}
                              placeholder="e.g., John Doe"
                              readOnly={candidate.source === 'database'}
                              className={`w-full h-10 px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-blue/40 focus:border-transparent ${
                                candidate.source === 'database' ? 'bg-gray-100 dark:bg-slate-800 cursor-not-allowed' : ''
                              }`}
                            />
                          </div>
                          <div className="min-w-0">
                            <label className="text-xs text-gray-600 dark:text-slate-400 mb-1 block">Email Address *</label>
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="email"
                                value={candidate.email}
                                onChange={(e) => updateCandidate(candidate.id, 'email', e.target.value)}
                                placeholder="e.g., john.doe@example.com"
                                readOnly={candidate.source === 'database'}
                                className={`flex-1 min-w-0 h-10 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-inset ${
                                  candidate.source === 'database'
                                    ? 'bg-gray-100 dark:bg-slate-800 cursor-not-allowed border-gray-200 dark:border-slate-700'
                                    : candidate.email.trim() && (!isValidEmail(candidate.email) || isDuplicateEmail(candidate.id, candidate.email))
                                      ? 'border-destructive-line focus:ring-destructive-line'
                                      : 'border-gray-200 dark:border-slate-700 focus:ring-brand-blue/40 focus:border-transparent'
                                }`}
                              />
                            </div>
                            {candidate.source !== 'database' && candidate.email.trim() && !isValidEmail(candidate.email) && (
                              <p className="text-xs text-destructive mt-1">Please enter a valid email (e.g., user@example.com)</p>
                            )}
                            {candidate.source !== 'database' && candidate.email.trim() && isValidEmail(candidate.email) && isDuplicateEmail(candidate.id, candidate.email) && (
                              <p className="text-xs text-destructive mt-1">This email is already in the list</p>
                            )}
                          </div>
                        </div>
                            <div className="flex items-center gap-2 self-end sm:self-start sm:mt-5 flex-shrink-0">
                              {/* Per-candidate Copy Link button — one assessment link, no email sent */}
                              {singleAssessmentOnly && candidate.source !== 'database' && (
                                <button
                                  type="button"
                                  onClick={() => handleCopyLinkForCandidate(candidate.id)}
                                  disabled={
                                    generatingLinkFor === candidate.id ||
                                    (!candidate.generatedLink &&
                                      isDuplicateEmail(candidate.id, candidate.email))
                                  }
                                  title={
                                    candidate.generatedLink
                                      ? 'Link generated — click to copy again'
                                      : isDuplicateEmail(candidate.id, candidate.email)
                                        ? 'This email is already in the list'
                                        : 'Generate & copy assessment link'
                                  }
                                  className={`flex items-center gap-1.5 h-10 px-2.5 py-2 rounded-lg text-xs border transition-colors whitespace-nowrap flex-shrink-0 ${
                                    candidate.generatedLink
                                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-500/20'
                                      : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                                  } disabled:opacity-50`}
                                >
                                  {generatingLinkFor === candidate.id
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    : candidate.generatedLink
                                      ? <><CheckCircle className="w-3.5 h-3.5" /><span>Copied</span></>
                                      : <><Copy className="w-3.5 h-3.5" /><span>Copy Link</span></>
                                  }
                                </button>
                              )}
                              {candidate.source !== 'database' && (
                                <button
                                  type="button"
                                  onClick={() => addEntry(candidate.id)}
                                  disabled={!canAddEntry(candidate)}
                                  title="Add to the candidate list"
                                  className="flex-shrink-0 inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-brand-blue border border-brand-blue/30 rounded-lg hover:bg-brand-blue/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <Plus className="w-4 h-4" />
                                  Add
                                </button>
                              )}
                              {(candidates.length > 1 || candidate.source === 'database') && (
                                <button
                                  type="button"
                                  onClick={() => removeCandidate(candidate.id)}
                                  title="Remove candidate"
                                  aria-label="Remove candidate"
                                  className="flex-shrink-0 p-2 text-destructive hover:bg-destructive-subtle rounded-lg transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                      </div>
                    </div>
                  ))}
                </div>

                {entryCandidates.length > 0 && (
                  <ListPagination
                    currentPage={candidateSafePage}
                    itemsPerPage={candidatePageSize}
                    totalItems={entryCandidates.length}
                    onPageChange={setCandidatePage}
                    onItemsPerPageChange={(size) => { setCandidatePageSize(size); setCandidatePage(1); }}
                    itemLabel="candidates"
                    compact
                  />
                )}

                {listedCandidates.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm text-gray-600 dark:text-slate-400 mb-2">Selected candidates ({listedCandidates.length})</p>
                    <ul className="rounded-lg border border-gray-200 dark:border-slate-700 divide-y divide-gray-100 dark:divide-slate-700/60 max-h-72 overflow-y-auto">
                      {listedCandidates.map((candidate) => {
                        const badge =
                          candidate.origin === 'my-resumes' ? { label: 'My Resumes', cls: 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20' }
                          : candidate.origin === 'shared-db' ? { label: 'Shared DB', cls: 'bg-brand-cyan/10 text-brand-cyan ring-brand-cyan/20' }
                          : candidate.source !== 'database' ? { label: candidate.origin === 'excel' ? 'Excel' : 'Manual', cls: 'bg-gray-100 text-gray-600 ring-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700' }
                          : { label: 'Database', cls: 'bg-brand-blue/10 text-brand-blue ring-brand-blue/15' };
                        return (
                          <li key={candidate.id} className="flex items-center gap-3 px-3 py-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-900 dark:text-slate-50 truncate" title={candidate.name}>{candidate.name}</p>
                              <p className="text-xs text-gray-500 dark:text-slate-400 truncate [overflow-wrap:anywhere]" title={candidate.email}>{candidate.email}</p>
                            </div>
                            <span className={`shrink-0 inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-semibold ring-1 ${badge.cls}`}>
                              {badge.label}
                            </span>
                            {/* The row's per-candidate Copy Link, as on the entry rows. */}
                            {singleAssessmentOnly && (
                              <button
                                type="button"
                                onClick={() => handleCopyLinkForCandidate(candidate.id)}
                                disabled={generatingLinkFor === candidate.id || (!candidate.generatedLink && isDuplicateEmail(candidate.id, candidate.email))}
                                title={candidate.generatedLink ? 'Link generated — click to copy again' : 'Generate & copy assessment link'}
                                aria-label={`Copy assessment link for ${candidate.name}`}
                                className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs border transition-colors whitespace-nowrap flex-shrink-0 ${
                                  candidate.generatedLink
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-500/20'
                                    : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                                } disabled:opacity-50`}
                              >
                                {generatingLinkFor === candidate.id
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : candidate.generatedLink
                                    ? <><CheckCircle className="w-3.5 h-3.5" /><span className="hidden sm:inline">Copied</span></>
                                    : <><Copy className="w-3.5 h-3.5" /><span className="hidden sm:inline">Copy Link</span></>}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => removeCandidate(candidate.id)}
                              title="Remove candidate"
                              aria-label={`Remove ${candidate.name}`}
                              className="shrink-0 p-2 text-destructive hover:bg-destructive-subtle rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </>
            )}

            {/* Database Selection Mode */}
            {inputMode === 'database' && (
              <div className="border-2 border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden">
                {/* Tabs */}
                <div className="flex border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 overflow-x-auto">
                  {hasMyResumesAccess && (
                    <button
                      type="button"
                      onClick={() => setDbTab('my-resumes')}
                      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
                        dbTab === 'my-resumes'
                          ? 'border-gray-800 text-gray-900 dark:text-slate-50 bg-white dark:bg-slate-900'
                          : 'border-transparent text-gray-500 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300'
                      }`}
                    >
                      <FolderOpen className="w-4 h-4 text-brand-orange" />
                      My Resumes
                      <span className="px-1.5 py-0.5 rounded-full text-xs bg-gray-200 dark:bg-slate-800 text-gray-700 dark:text-slate-300">{myResumesData.length}</span>
                      {pickedBySource.myResumes > 0 && (
                        <span title="Selected from My Resumes" className="px-1.5 py-0.5 rounded-full text-xs font-semibold bg-brand-blue text-white tabular-nums">✓ {pickedBySource.myResumes}</span>
                      )}
                    </button>
                  )}
                  {(hasInternalDBAccess || (!hasMyResumesAccess && !hasInternalDBAccess)) && (
                    <button
                      type="button"
                      onClick={() => setDbTab('internal-db')}
                      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
                        dbTab === 'internal-db'
                          ? 'border-gray-800 text-gray-900 dark:text-slate-50 bg-white dark:bg-slate-900'
                          : 'border-transparent text-gray-500 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300'
                      }`}
                    >
                      <Database className="w-4 h-4 text-brand-cyan" />
                      Shared Database
                      <span className="px-1.5 py-0.5 rounded-full text-xs bg-gray-200 dark:bg-slate-800 text-gray-700 dark:text-slate-300">{internalDbData.length}</span>
                      {pickedBySource.sharedDb > 0 && (
                        <span title="Selected from Shared Database" className="px-1.5 py-0.5 rounded-full text-xs font-semibold bg-brand-blue text-white tabular-nums">✓ {pickedBySource.sharedDb}</span>
                      )}
                    </button>
                  )}
                </div>

                {/* Content: folder sidebar + resume list */}
                <div className="flex flex-col sm:flex-row" style={{ minHeight: '300px', maxHeight: '380px' }}>
                  {/* Folder Sidebar (My Resumes only) — short scrollable strip on
                      top for mobile, fixed left column from sm up. */}
                  {dbTab === 'my-resumes' && myFolders.length > 0 && foldersCollapsed && (
                    <FolderPanelRail onExpand={() => setFoldersCollapsed(false)} animate={foldersAnimate} from="sm" />
                  )}
                  {dbTab === 'my-resumes' && myFolders.length > 0 && (
                    <div
                      className={`w-full sm:w-56 max-h-28 sm:max-h-none border-b sm:border-b-0 sm:border-r border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 overflow-y-auto flex-shrink-0 p-2 ${folderColumnClasses(foldersCollapsed, foldersAnimate, 'sm')}`}
                      onMouseLeave={() => scheduleOpenPath([])}
                      // Flyouts are pinned to row positions — scrolling would leave them adrift.
                      onScroll={() => { cancelScheduledClose(); setOpenPath([]); }}
                    >
                      <div className="flex items-center pr-0.5">
                        <p className="flex-1 px-3 pb-1 text-2xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">System Folders</p>
                        <FolderCollapseButton onCollapse={() => setFoldersCollapsed(true)} from="sm" />
                      </div>
                      <div className="space-y-0.5">
                        <button type="button" onClick={() => setSelectedFolder('all')} className={`${folderRowClass(selectedFolder === 'all')} pl-3`}>
                          <FolderOpen className="w-4 h-4 text-brand-blue flex-shrink-0" />
                          <span className="flex-1 truncate">All Resumes</span>
                          <span className="flex-shrink-0 text-xs text-gray-500 dark:text-slate-400 tabular-nums">({myResumesData.length})</span>
                          <span className="w-4 flex-shrink-0" />
                        </button>
                        {systemFolders.map(folder => (
                          <button key={folder.id} type="button" onClick={() => setSelectedFolder(folder.id)} className={`${folderRowClass(selectedFolder === folder.id)} pl-3`}>
                            <FolderRoot className="w-4 h-4 text-brand-cyan flex-shrink-0" />
                            <span className="flex-1 truncate">{folder.name.toLowerCase() === 'root' ? 'Root (Default)' : folder.name}</span>
                            <span className="flex-shrink-0 text-xs text-gray-500 dark:text-slate-400 tabular-nums">({folderCount(folder.id)})</span>
                            <span className="w-4 flex-shrink-0" />
                          </button>
                        ))}
                      </div>
                      {myFolders.some(f => !isSystemFolder(f)) && (
                        <>
                          <div className="border-t border-gray-200 dark:border-slate-700 my-2" />
                          <p className="px-3 pb-1 text-2xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">My Folders</p>
                          <div className="space-y-0.5">
                            {myFolders.filter(f => !f.parentId && !isSystemFolder(f)).map(f => renderFolderRow(f, 0, []))}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Resume List */}
                  <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                    {/* Search + Select All */}
                    <div className="flex flex-wrap items-center gap-2 p-3 border-b border-gray-100 dark:border-slate-700/60">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search by name, email, or position..."
                        className="flex-1 min-w-[10rem] px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40"
                      />
                      <button
                        type="button"
                        onClick={() => setPicks(prev => toggleAllPicks(prev, filteredResumes, pickOrigin))}
                        className="px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap text-gray-700 dark:text-slate-300"
                      >
                        {allShownPicked ? 'Deselect All' : 'Select All'}
                      </button>
                      <span className="text-sm text-gray-500 dark:text-slate-500 whitespace-nowrap">{shownPickedCount} of {filteredResumes.length} selected here</span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                      {isLoadingResumes || isLoadingFolder ? (
                        <div className="flex items-center justify-center py-12 tf-loader-center tf-loader-center--compact">
                          <Loader2 className="w-6 h-6 animate-spin text-gray-400 dark:text-slate-500" />
                        </div>
                      ) : filteredResumes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-slate-500">
                          <Database className="w-8 h-8 mb-2" />
                          <p className="text-sm">{searchQuery ? 'No resumes match your search' : 'No resumes found'}</p>
                        </div>
                      ) : pagedResumes.map(resume => (
                        <div
                          key={resume.id}
                          onClick={() => toggleResumeSelection(resume)}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                            !!picks[resume.id] ? 'bg-brand-blue/5 border-brand-blue/40' : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 hover:border-brand-blue/30 hover:bg-brand-blue/[0.03]'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${
                            !!picks[resume.id] ? 'bg-brand-blue border-brand-blue' : 'border-gray-300 dark:border-slate-700'
                          }`}>
                            {!!picks[resume.id] && <CheckCircle className="w-3 h-3 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-sm font-medium text-gray-900 dark:text-slate-50 truncate">{resume.name}</span>
                                {resume.versionCount > 1 && (
                                  <span
                                    title={`Latest of ${resume.versionCount} versions`}
                                    className="inline-flex items-center gap-1 flex-shrink-0 rounded-full bg-brand-blue/10 px-2 py-0.5 text-2xs font-semibold text-brand-blue ring-1 ring-brand-blue/15 tabular-nums"
                                  >
                                    <Layers className="w-3 h-3" />
                                    v{resume.versionCount}
                                    <span className="font-normal">of {resume.versionCount}</span>
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-gray-400 dark:text-slate-500 flex-shrink-0">{resume.experience}</span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-xs text-gray-500 dark:text-slate-500 truncate">{resume.email}</div>
                                <div className="text-xs text-gray-400 dark:text-slate-500 truncate">{resume.position}</div>
                              </div>
                              {/* stopPropagation so viewing a resume doesn't tick the row. */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleViewResume(resume);
                                }}
                                disabled={loadingViewFor === resume.id}
                                title={resume.versionCount > 1 ? 'View resume versions' : 'View resume'}
                                aria-label={`View ${resume.name}'s resume`}
                                className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 dark:text-slate-500 hover:text-brand-blue hover:bg-brand-blue/10 transition-colors disabled:opacity-50"
                              >
                                {loadingViewFor === resume.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {!isLoadingResumes && !isLoadingFolder && filteredResumes.length > 0 && (
                      <div className="px-3 py-2 border-t border-gray-100 dark:border-slate-700/60">
                        <ListPagination
                          currentPage={resumeSafePage}
                          itemsPerPage={resumePageSize}
                          totalItems={filteredResumes.length}
                          onPageChange={setResumePage}
                          onItemsPerPageChange={(size) => { setResumePageSize(size); setResumePage(1); }}
                          itemLabel="resumes"
                          compact
                        />
                      </div>
                    )}

                  </div>
                </div>

                {/* Selection footer — outside the scroll-capped area so it's always in view. */}
                <div className="flex items-start justify-between px-3 py-2 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 flex-wrap gap-2">
                  <ResumeSelectionSummary partition={pickPartition} onClear={() => setPicks({})} />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleAddFromDatabase}
                    disabled={pickCount === 0}
                    icon={<Users className="w-4 h-4" />}
                  >
                    Add to List
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Custom Message */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="text-gray-900 dark:text-slate-50 font-medium">Email Message</label>
              <button type="button" onClick={() => setShowEmailPreview(true)} className="text-xs text-brand-blue font-medium hover:underline">✓ Live preview below</button>
            </div>
            {/* Starts compact and grows with the text. The inline ref re-runs on
                every render, so the height follows the value — typed or prefilled. */}
            <textarea
              ref={(el) => {
                if (!el) return;
                el.style.height = 'auto';
                el.style.height = `${el.scrollHeight + 2}px`;
              }}
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              rows={3}
              className="w-full min-h-[5.5rem] px-4 py-3 border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-transparent resize-none overflow-hidden font-mono"
              placeholder="Edit the message content here..."
            />
            <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">
              Your changes appear in the preview below.
            </p>
          </div>

          {/* Settings — Send me a copy, then Link expiry beside it. */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mb-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sendCopy}
                onChange={(e) => setSendCopy(e.target.checked)}
                className="w-4 h-4 text-brand-blue border-gray-300 dark:border-slate-700 rounded focus:ring-brand-blue/40"
              />
              <span className="text-sm text-gray-700 dark:text-slate-300">Send me a copy</span>
            </label>
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500" />
              <span className="text-sm text-gray-700 dark:text-slate-300">Link expiry</span>
              <select
                value={expiryDays}
                onChange={(e) => setExpiryDays(Number(e.target.value))}
                aria-label="Link expiry"
                className="text-xs border border-gray-200 dark:border-slate-700 rounded-lg px-2 py-1 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-transparent"
              >
                <option value={1}>1 day</option>
                <option value={3}>3 days</option>
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
                <option value={0}>No expiry</option>
              </select>
            </div>
          </div>

          {/* Email Preview — collapsible, collapsed by default. */}
          <div className="bg-slate-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 rounded-lg">
            <button
              type="button"
              onClick={() => setShowEmailPreview(v => !v)}
              aria-expanded={showEmailPreview}
              className="w-full flex items-center justify-between gap-3 px-4 sm:px-6 py-4 text-left rounded-lg hover:bg-slate-100/70 dark:hover:bg-slate-900 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-brand-blue" />
                <h3 className="text-gray-900 dark:text-slate-50 font-semibold">Email Preview</h3>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 px-3 py-1 rounded-full font-medium whitespace-nowrap">
                  Exact email format
                </span>
                <ChevronDown className={`w-5 h-5 text-gray-500 dark:text-slate-400 transition-transform duration-200 ${showEmailPreview ? 'rotate-180' : ''}`} />
              </div>
            </button>
            {showEmailPreview && (
            <div className="px-4 sm:px-6 pb-6">
            <p className="text-xs text-gray-600 dark:text-slate-400 mb-4 bg-white dark:bg-slate-900 rounded-lg px-3 py-2 border border-gray-200 dark:border-slate-700">
              This is exactly how the email will appear to candidates. Edit the message above to see live changes.
            </p>

            {/* Actual Email Template Preview */}
            <div className="bg-white rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden max-w-xl mx-auto">
              {/* Brand Header */}
              <div className="bg-brand-blue px-6 sm:px-8 py-8 text-center">
                <h1 className="text-white text-xl sm:text-2xl font-bold mb-2">Assessment Invitation</h1>
                <p className="text-white/80 text-sm">TalentFlow</p>
              </div>

              {/* Email Body */}
              <div className="p-6 sm:p-8">
                <div className="mb-6 text-gray-700 text-base leading-relaxed whitespace-pre-line [overflow-wrap:anywhere]">
                  {customMessage}
                </div>

                {/* Assessment Title Box */}
                <div className="bg-brand-blue/5 border border-brand-blue/20 rounded-xl p-5 text-center mb-6">
                  <div className="text-xl font-bold text-brand-blue [overflow-wrap:anywhere]">
                    {assessmentTitleForEmail}
                  </div>
                </div>

                {/* CTA Button */}
                <div className="text-center mb-6">
                  <div className="inline-block bg-brand-blue text-white px-8 py-3 rounded-lg font-semibold shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                    Start Assessment
                  </div>
                </div>

                {/* Expiry Info */}
                <p className="text-center text-gray-600 text-sm mb-6">
                  This invitation expires on:{' '}
                  <strong>
                    {expiryDays > 0 ? `${expiryDays} day${expiryDays > 1 ? 's' : ''}` : 'No expiry'}
                  </strong>
                </p>
              </div>

              {/* Footer */}
              <div className="bg-gray-50 px-6 sm:px-8 py-6 text-center border-t border-gray-200">
                <p className="text-gray-500 text-xs mb-2">© 2026 TalentFlow. All rights reserved.</p>
                <p className="text-gray-400 text-xs">If you did not expect this email, please ignore it.</p>
              </div>
            </div>
            </div>
            )}
          </div>
        </div>

    </>
  );

  if (embedded) {
    return (
      <>
        <div className="mb-4 rounded-xl border border-gray-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2.5">
          <p className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-slate-50">
            <Mail className="w-4 h-4 text-brand-blue flex-shrink-0" />
            Share Assessment via Email
          </p>
          {headerMeta}
        </div>
        {contentBlock}
        {footerTarget && createPortal(footerContent, footerTarget)}
        {extras}
      </>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Share Assessment via Email"
    >
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 max-w-[95vw] sm:max-w-[935px] w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col tf-round-edges">
        {/* Header */}
        <div className="bg-slate-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-700/60 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-brand-blue shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex items-center justify-center flex-shrink-0">
              <Mail className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 tracking-tight truncate">Share Assessment via Email</h2>
              {headerMeta}
            </div>
          </div>
          {/* No X — the footer's Cancel closes, as on the other Invite popups. */}
        </div>

        {contentBlock}
        <div className="px-4 sm:px-6 py-4 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {footerContent}
        </div>
      </div>

      {extras}
    </div>
  );
}
