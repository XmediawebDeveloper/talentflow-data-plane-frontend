'use client';

import { X, ArrowLeft, Mail, Plus, Trash2, Send, CheckCircle, Copy, Clock, Users, Upload, Database, AlertTriangle, Loader2, FileSpreadsheet, MapPin, ShieldAlert, Info, FolderOpen, ChevronRight, Eye, Layers, FolderRoot, FolderInput, Bot, ChevronDown } from 'lucide-react';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { VersionPill } from './AllInterviewsTable';
import { interviewVersionOrdinal } from '@/lib/utils/aiInterviewVersion';
import { modeFromConfig } from '@/lib/constants/aiInterviewMode';
import React, { useState, useEffect, useRef } from 'react';
import { useFolderPanelCollapsed, folderColumnClasses, FolderCollapseButton, FolderPanelRail } from '@/components/ui/folder-panel-collapse';
import { createPortal } from 'react-dom';
import { useAuth } from '@/lib/hooks/useAuth';
import { aiInterviewService, isJdDisabled, JD_DISABLED_ACTION_MESSAGE } from '@/lib/services/aiInterviewService';
import type { AIInterviewResponse } from '@/lib/services/aiInterviewService';
import api from '@/lib/services/api';
import { toast } from 'sonner';
import { formatISTDate } from '@/lib/utils/dateUtils';
import readXlsxFile from 'read-excel-file/browser';
import { useQuota } from '@/contexts/QuotaContext';
import { Button } from '@/components/ui/button';
import { isValidEmailFormat } from '@/lib/utils/email';
import { isValidCandidateName, NAME_FORMAT_ERROR } from '@/lib/utils/name';
import SuccessAnimation from '@/components/ui/success-animation';
import ListPagination from '@/components/ListPagination';
import ResumeTextPreviewModal from '@/components/ResumeTextPreviewModal';
import ResumeVersionsModal from '@/components/ResumeVersionsModal';
import { resumeService } from '@/lib/services/resumeService';
import ResumeSelectionSummary from '@/components/ResumeSelectionSummary';
import { togglePick, toggleAllPicks, partitionPicks, countBySource, sourceBreakdown, type ResumePicks } from '@/lib/utils/resumeSelection';

// Delegates to the one shared, comprehensive format rule (lib/utils/email)
// rather than this file's own regex, which didn't catch consecutive/
// leading/trailing dots, bad domain-hyphen placement, or padding whitespace.
const isValidEmail = (email: string): boolean => isValidEmailFormat(email);

interface CandidateEmail {
  id: string;
  name: string;
  email: string;
  // scheduledDate: string;   // Commented out - schedule feature disabled for now
  // scheduledTime: string;   // Commented out - schedule feature disabled for now
  source: 'manual' | 'database';
  /** Finer-grained origin for the row's source badge. Absent on prefilled rows. */
  origin?: 'manual' | 'excel' | 'my-resumes' | 'shared-db';
  resumeId?: string;
  generatedLink?: string | null;
  generatedSessionId?: string | null;
  /** A typed row moved into the candidate list with Add. */
  added?: boolean;
}

/* Pre-filled candidates (already chosen) are listed as they are; Manual's
   entry fields sit above them — one empty row ready to type into. An empty
   row is ignored by Send and the counts. */
const withEntryRow = (list: CandidateEmail[]): CandidateEmail[] =>
  list.some((c) => c.source !== 'database') ? list : [...list, { id: 'manual-entry', name: '', email: '', source: 'manual' }];

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

interface ShareAIInterviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AIInterviewResponse;
  /** Called with the number of invitations that went out (at least 1). */
  onInviteSent: (sentCount: number) => void;
  /** Fired the moment an invitation exists server-side (Send or Copy Link),
   *  without waiting for the 2s success popup — so a tracker behind the modal
   *  can refresh at once. */
  onInvitesChanged?: () => void;
  /** When true, render the share form inline (no backdrop / fixed overlay /
   *  close button) so it can live inside a tab on the interview details page. */
  embedded?: boolean;
  /**
   * Seeds the candidate list — e.g. the resumes selected on My Resumes — so the
   * recruiter lands on a filled form instead of retyping names and emails.
   * Read once on mount, so render this modal conditionally to refresh it.
   */
  initialCandidates?: { name: string; email: string; resumeId?: string }[];
  /** This interview's version, shown in the header. Looked up from the
   *  config list when the host does not pass it. */
  interviewVersion?: number;
  /** Shows Back in the footer, returning to the popup this one came from. */
  onBack?: () => void;
  /** Rendered as a step INSIDE a host popup (Job Details' Invite to AI
   *  Interview): no backdrop, card or header of its own — the host keeps its
   *  header and footer, and owns Escape and the scroll lock — and this step's
   *  footer (summary, Back, Send Invitations) is portalled into `footerTarget`,
   *  the host's footer. Not `embedded`, which is an inline card of its own. */
  inPopupStep?: boolean;
  footerTarget?: HTMLElement | null;
  /** The job version the host has selected — shown instead of the config's
   *  `jd_version`, a snapshot stamped at creation that reads 1 for interviews
   *  authored against a later version. */
  jobVersion?: number;
}

const ROUND_LABELS: Record<string, string> = {
  hr: 'HR',
  technical: 'Technical',
  behavioral: 'Behavioral',
  culture_fit: 'Culture Fit',
  leadership: 'Leadership',
  problem_solving: 'Problem Solving',
  must_have_skills: 'Must-Have Skills',
  nice_to_have_skills: 'Nice-to-Have Skills',
};

export default function ShareAIInterviewModal({ isOpen, onClose, config, onInviteSent, onInvitesChanged, embedded = false, initialCandidates, interviewVersion: interviewVersionProp, onBack, inPopupStep = false, footerTarget = null, jobVersion }: ShareAIInterviewModalProps) {
  const { user } = useAuth();
  const { quotaData } = useQuota();
  // A disabled job's interview can't be shared until the job is enabled again.
  const jdDisabled = isJdDisabled(config?.jd_status);

  /* Interview version for the header. A config stores no number of its own —
     it is this config's place among its job version's configs, which only
     the full list can say — so it is looked up once per open unless the host
     already knows it. The header simply omits it until then. */
  const [lookedUpInterviewVersion, setLookedUpInterviewVersion] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (!isOpen || interviewVersionProp != null || !config?.id || !config.jd_id) return;
    let cancelled = false;
    aiInterviewService
      .listConfigs({ page: 1, page_size: 500, compact: true })
      .then((res) => {
        if (!cancelled) setLookedUpInterviewVersion(interviewVersionOrdinal(config, res.items ?? []));
      })
      .catch(() => { /* Header shows the job version only. */ });
    return () => { cancelled = true; };
  }, [isOpen, interviewVersionProp, config?.id, config?.jd_id]);
  const interviewVersion = interviewVersionProp ?? lookedUpInterviewVersion;

  // Quota stats state
  const [quotaStats, setQuotaStats] = useState<{
    total_quota: number;
    consumed: number;
    pending: number;
    available: number;
  } | null>(null);
  const [quotaStatsLoading, setQuotaStatsLoading] = useState(false);

  const [inputMode, setInputMode] = useState<'manual' | 'database' | 'excel'>('manual');
  const [candidates, setCandidates] = useState<CandidateEmail[]>(() =>
    initialCandidates && initialCandidates.length > 0
      ? withEntryRow(initialCandidates.map((candidate, index) => ({
          id: `prefilled-${index}`,
          name: candidate.name,
          email: candidate.email,
          source: 'database' as const,
          resumeId: candidate.resumeId,
        })))
      : [{ id: '1', name: '', email: '', /* scheduledDate: '', scheduledTime: '', */ source: 'manual' }]
  );
  /* Ticked "Select From" resumes, kept across tabs and folders so a pick can
     mix My Resumes and the Shared Database (switching tabs used to wipe it). */
  const [picks, setPicks] = useState<ResumePicks>({});
  const pickCount = Object.keys(picks).length;
  // Resume opened from the eye on a "Select From" row — same preview as Scored Resumes.
  const [previewResume, setPreviewResume] = useState<{ id: string; name: string } | null>(null);
  // Multi-version resumes open the version list (view and compare only) instead.
  const [versionViewer, setVersionViewer] = useState<{ id: string; name: string; versions: any[] } | null>(null);
  const [loadingViewFor, setLoadingViewFor] = useState<string | null>(null);

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
  const [searchQuery, setSearchQuery] = useState('');
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [excelFileName, setExcelFileName] = useState<string>('');

  // Database tab state
  const [dbTab, setDbTab] = useState<'my-resumes' | 'internal-db'>('my-resumes');
  const [myResumesData, setMyResumesData] = useState<Resume[]>([]);
  const [internalDbData, setInternalDbData] = useState<Resume[]>([]);
  const [myFolders, setMyFolders] = useState<{ id: string; name: string; parentId?: string | null; count: number }[]>([]);
  // Resumes of the selected folder, fetched server-side (folder_id) like My Resumes does —
  // the unscoped list doesn't carry a usable folder id to filter on.
  const [folderResumes, setFolderResumes] = useState<Resume[]>([]);
  const [isLoadingFolder, setIsLoadingFolder] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  // Collapsible folder sidebar (sm and up) — the same remembered choice as
  // every other resume-database view (components/ui/folder-panel-collapse).
  const { collapsed: foldersCollapsed, setCollapsed: setFoldersCollapsed, animate: foldersAnimate } = useFolderPanelCollapsed();
  type SidebarFolder = { id: string; name: string; parentId?: string | null; count: number };
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

  // Email message — populated dynamically with config/user context
  const [customMessage, setCustomMessage] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const companyName = (user as any)?.tenantName || 'Our Company';
    const jobTitle = config.jd_title || config.position || 'the role';
    const location = (config as any).jd_location ? ` in ${(config as any).jd_location}` : '';
    setCustomMessage(
      `You have been invited to complete an AI interview for the ${jobTitle} role at ${companyName}${location}. Please use the secure link below and complete it in one sitting. Before you begin, make sure your camera, microphone, and internet connection are ready.`
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
  const [expiryDays, setExpiryDays] = useState(1);
  const [sendCopy, setSendCopy] = useState(true);

  // Per-candidate link generation state
  const [generatingLinkFor, setGeneratingLinkFor] = useState<string | null>(null); // candidateId

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [sentCount, setSentCount] = useState(0);

  // Duplicate invitation popup
  const [showDuplicateError, setShowDuplicateError] = useState(false);
  const [duplicateEmail, setDuplicateEmail] = useState('');
  // Backend's own wording for the rejection, when it has something more
  // specific to say than "already sent" — e.g. a revoked invitation the
  // recruiter should resend rather than recreate.
  const [duplicateReason, setDuplicateReason] = useState('');

  // Fetch quota stats when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setQuotaStatsLoading(true);
    aiInterviewService.getInvitationStats().then((stats) => {
      setQuotaStats(stats);
    }).finally(() => setQuotaStatsLoading(false));
  }, [isOpen]);

  // Lock background scroll + close on Escape while modal is open
  useEffect(() => {
    if (!isOpen || inPopupStep) return;
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
  }, [isOpen, onClose, inPopupStep]);

  // Load resumes when database mode is selected. Both tabs load up front —
  // the Shared Database badge read 0 until its tab was clicked.
  useEffect(() => {
    if (inputMode === 'database') {
      const tab = hasMyResumesAccess ? 'my-resumes' : 'internal-db';
      setDbTab(tab);
      if (hasMyResumesAccess) loadMyResumes();
      if (hasInternalDBAccess || !hasMyResumesAccess) loadInternalDb();
    }
  }, [inputMode]);

  useEffect(() => {
    if (inputMode !== 'database') return;
    if (dbTab === 'my-resumes' && !myResumesLoaded) loadMyResumes();
    if (dbTab === 'internal-db' && !internalDbLoaded) loadInternalDb();
    setSelectedFolder('all');
    setSearchQuery('');
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
      const flat: { id: string; name: string; parentId: string | null; count: number }[] = [];
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

  useEffect(() => {
    if (dbTab !== 'my-resumes' || selectedFolder === 'all') {
      setFolderResumes([]);
      return;
    }
    let cancelled = false;
    setIsLoadingFolder(true);
    fetchAllResumes('my-resumes', { folder_id: selectedFolder })
      .then(rows => { if (!cancelled) setFolderResumes(rows); })
      .catch(() => { if (!cancelled) { setFolderResumes([]); toast.error('Failed to load this folder'); } })
      .finally(() => { if (!cancelled) setIsLoadingFolder(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbTab, selectedFolder]);

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
    const isOpen = openPath[depth]?.folder.id === folder.id;
    return (
      <button
        key={folder.id}
        type="button"
        onClick={() => { setSelectedFolder(folder.id); cancelScheduledClose(); setOpenPath([]); }}
        onMouseEnter={(e) => {
          if (!hasChildren) { scheduleOpenPath(ancestors); return; }
          scheduleOpenPath([...ancestors, { folder, anchor: e.currentTarget.getBoundingClientRect() }]);
        }}
        className={`${folderRowClass(selectedFolder === folder.id || isOpen)} pl-3`}
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
                setOpenPath(isOpen ? ancestors : [...ancestors, { folder, anchor }]);
              }}
            />
          )}
        </span>
      </button>
    );
  };

  /* Candidate rows are paged with the project's ListPagination — 5 a page by
     default, so a long prefilled list (25 resumes from My Resumes) doesn't
     push the rest of the dialog out of reach. */
  const [candidatePage, setCandidatePage] = useState(1);
  const [candidatePageSize, setCandidatePageSize] = useState(10);
  /* Manual: the rows typed or imported here, paged, then the chosen
     candidates (pre-filled, added from Select From, or added with Add) as a
     list under them. */
  const listedCandidates = candidates.filter((c) => c.source === 'database' || c.added);
  const entryCandidates = candidates.filter((c) => c.source !== 'database' && !c.added);
  const candidateTotalPages = Math.max(1, Math.ceil(entryCandidates.length / candidatePageSize));
  const candidateSafePage = Math.min(candidatePage, candidateTotalPages);
  const pagedCandidates = entryCandidates.slice(
    (candidateSafePage - 1) * candidatePageSize,
    candidateSafePage * candidatePageSize,
  );

  /* "Select From" list paging — 10 a page, back to
     page 1 whenever the tab, folder or search changes what's listed. */
  const [resumePage, setResumePage] = useState(1);
  const [resumePageSize, setResumePageSize] = useState(10);
  useEffect(() => { setResumePage(1); }, [dbTab, selectedFolder, searchQuery]);

  /* Manual / Upload Excel / Select From — plain buttons; only the icons carry
     colour. The active one is marked by a darker border and a light fill. */
  const modeTabClass = (active: boolean) =>
    `flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors ${
      active
        ? 'bg-gray-100 dark:bg-slate-800 border-gray-400 dark:border-slate-500 text-gray-900 dark:text-slate-50 font-medium'
        : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800'
    }`;

  // Email Preview is collapsed by default — opened on demand from its header.
  const [showEmailPreview, setShowEmailPreview] = useState(false);

  // Early return must stay below every hook call (Rules of Hooks).
  if (!isOpen) return null;

  const enabledRounds = config.rounds_config ? config.rounds_config.filter((r: any) => r.enabled !== false) : [];

  const addCandidate = () => {
    setCandidates([
      ...candidates,
      { id: Date.now().toString(), name: '', email: '', /* scheduledDate: '', scheduledTime: '', */ source: 'manual' },
    ]);
    // Land on the page holding the new, empty row so it can be filled in.
    setCandidatePage(Math.ceil((candidates.filter((c) => c.source !== 'database' && !c.added).length + 1) / candidatePageSize));
  };

  /* Add: a complete entry row joins the candidate list; a fresh empty row
     takes its place when it was the last one. */
  /* A typed name with anything but letters and spaces. Database rows are
     exempt: their name comes read-only from the resume, so the recruiter
     could not correct it here. */
  const hasInvalidName = (c: CandidateEmail) =>
    c.source !== 'database' && !!c.name.trim() && !isValidCandidateName(c.name);
  const canAddEntry = (c: CandidateEmail) =>
    !!c.name.trim() && !hasInvalidName(c) && isValidEmail(c.email) && !isDuplicateEmail(c.id, c.email);
  const addEntry = (id: string) => {
    setCandidates((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, added: true } : c));
      return next.some((c) => c.source !== 'database' && !c.added)
        ? next
        : [...next, { id: Date.now().toString(), name: '', email: '', source: 'manual' as const }];
    });
  };

  const removeCandidate = (id: string) => {
    if (candidates.length > 1) {
      setCandidates(candidates.filter((c) => c.id !== id));
    }
  };

  const updateCandidate = (id: string, field: keyof CandidateEmail, value: string) => {
    const normalizedValue = field === 'email' ? value.toLowerCase() : value;
    setCandidates(candidates.map((c) => (c.id === id ? { ...c, [field]: normalizedValue } : c)));
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

  // Parse CSV text into array of row objects
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

  // Extract candidates from a single sheet's raw rows
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

  // Handle Excel/CSV file upload
  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelFileName(file.name);
    if (excelInputRef.current) excelInputRef.current.value = '';

    try {
      let parsed: CandidateEmail[] = [];

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
            parsed.push({ id: Date.now().toString() + Math.random(), name: name || email.split('@')[0], email, source: 'manual' });
          }
        }
      } else {
        // readXlsxFile returns { sheet: string, data: Row[][] }[] — all sheets at once
        const allSheets = await readXlsxFile(file) as any[];

        if (allSheets.length > 1) {
          toast.info(`Found ${allSheets.length} sheets (${allSheets.map((s: any) => s.sheet).join(', ')}) — combining all.`);
        }

        const seenEmails = new Set<string>();
        let sheetsWithData = 0;

        for (const sheetObj of allSheets) {
          const rows: any[][] = sheetObj.data ?? sheetObj; // data is nested under .data
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

      // Deduplicate against existing candidates already in the list
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

  const handleCopyLinkForCandidate = async (candidateId: string) => {
    if (jdDisabled) {
      toast.error(JD_DISABLED_ACTION_MESSAGE);
      return;
    }
    const candidate = candidates.find(c => c.id === candidateId);
    if (!candidate) return;

    if (!candidate.name.trim() || !candidate.email.trim()) {
      toast.error('Please fill in candidate name and email first');
      return;
    }
    if (hasInvalidName(candidate)) {
      toast.error(NAME_FORMAT_ERROR);
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

    // If link already generated, just copy it again (same session, no new quota deduction)
    if (candidate.generatedLink) {
      await navigator.clipboard.writeText(candidate.generatedLink);
      toast.success('Link copied! Share on WhatsApp, SMS, or any platform.');
      return;
    }

    setGeneratingLinkFor(candidateId);
    try {
      const result = await aiInterviewService.createInviteLink(config.id, {
        candidate_name: candidate.name.trim(),
        candidate_email: candidate.email.trim(),
        expiry_days: expiryDays,
      });

      setCandidates(prev => prev.map(c =>
        c.id === candidateId
          ? { ...c, generatedLink: result.link, generatedSessionId: result.session_id }
          : c
      ));

      onInvitesChanged?.();
      await navigator.clipboard.writeText(result.link);
      toast.success(`Link copied for ${candidate.name}! Expires in ${expiryDays} day${expiryDays !== 1 ? 's' : ''}. Share via WhatsApp, SMS, or send via email.`);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      // Team-member emails are blocked here exactly as on Send Invitation —
      // no link is minted, so a later Send hits the same check.
      if (err?.response?.status === 400 && detail?.error === 'TENANT_USER_EMAIL') {
        toast.error(detail.message || `Cannot invite '${candidate.email.trim()}' — this email belongs to an existing team member. AI Interview invitations are for external candidates only.`);
        return;
      }
      const msg = detail?.message || detail || err?.message || 'Failed to generate link';
      toast.error(typeof msg === 'string' ? msg : 'Failed to generate link');
    } finally {
      setGeneratingLinkFor(null);
    }
  };

  // What Send acts on: ticked-but-not-yet-added resumes count as added.
  const pendingDbSelection = pickCount > 0;
  const pickedBySource = countBySource(Object.values(picks));
  const shownPickedCount = filteredResumes.filter((r) => picks[r.id]).length;
  const allShownPicked = filteredResumes.length > 0 && shownPickedCount === filteredResumes.length;
  const sendCandidates = pendingDbSelection ? mergeSelectedResumes() : candidates;

  const handleSend = async () => {
    if (jdDisabled) {
      toast.error(JD_DISABLED_ACTION_MESSAGE);
      return;
    }
    setIsSubmitting(true);
    try {
      // Fold the ticked resumes into the list so it matches what was sent.
      if (pendingDbSelection) {
        setCandidates(sendCandidates);
        setPicks({});
      }
      // Filter candidates with name and email, then deduplicate by email (keep first occurrence)
      const seen = new Set<string>();
      const candidatesWithData = sendCandidates
        .filter((c) => c.name.trim() && c.email.trim())
        .filter((c) => {
          const key = c.email.trim().toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

      if (candidatesWithData.length === 0) {
        toast.warning('Please add at least one candidate with name and email');
        setIsSubmitting(false);
        return;
      }

      // Validate all names
      const invalidNames = candidatesWithData.filter(hasInvalidName);
      if (invalidNames.length > 0) {
        toast.error(`Invalid name(s): ${invalidNames.map((c) => c.name.trim()).join(', ')}. ${NAME_FORMAT_ERROR}`);
        setIsSubmitting(false);
        return;
      }

      // Validate all email addresses
      const invalidEmails = candidatesWithData.filter((c) => !isValidEmail(c.email));
      if (invalidEmails.length > 0) {
        const invalidEmailList = invalidEmails.map((c) => c.email).join(', ');
        toast.error(`Invalid email address(es): ${invalidEmailList}. Please enter valid email addresses.`);
        setIsSubmitting(false);
        return;
      }

      // Final dedup by email (keep first occurrence) in case duplicates slipped through
      const finalSeen = new Set<string>();
      const deduped = candidatesWithData.filter((c) => {
        const key = c.email.toLowerCase().trim();
        if (finalSeen.has(key)) return false;
        finalSeen.add(key);
        return true;
      });

      // Quota check — block if not enough available slots
      if (quotaStats !== null && quotaStats.total_quota < 999999) {
        if (quotaStats.available < deduped.length) {
          const pendingMsg = quotaStats.pending > 0
            ? ` ${quotaStats.pending} unit${quotaStats.pending > 1 ? 's' : ''} are held by pending invitations and will be released when their links expire.`
            : '';
          toast.error(
            `Insufficient quota. You have ${quotaStats.available} unit${quotaStats.available !== 1 ? 's' : ''} available but need ${deduped.length} to send these invitations.${pendingMsg}`
          );
          setIsSubmitting(false);
          return;
        }
      } else {
        // Fallback: check via QuotaContext
        const aiuQuota = quotaData?.quotas?.AIU;
        const totalRemaining = typeof aiuQuota?.total_remaining === 'number' ? aiuQuota.total_remaining : null;
        if (totalRemaining !== null && totalRemaining < deduped.length) {
          toast.error(`Insufficient quota. You have ${totalRemaining} AI Interview unit${totalRemaining !== 1 ? 's' : ''} remaining but need ${deduped.length}.`);
          setIsSubmitting(false);
          return;
        }
      }

      const resolvedMessage = customMessage
        ? customMessage.replace('[deadline date]', expiryDays > 0
            ? formatISTDate(new Date(Date.now() + expiryDays * 86400000).toISOString())
            : 'no specific deadline'
          )
        : undefined;

      let successCount = 0;
      const alreadyInvited: string[] = [];
      const duplicateReasons: string[] = [];
      const tenantUserEmails: string[] = [];
      const failed: { email: string; reason: string }[] = [];

      for (const candidate of deduped) {
        try {
          if (candidate.generatedSessionId) {
            // Session already created via Copy Link — just send the email, no new quota deduction.
            // keep_link: the recruiter may already have shared the copied link, so the
            // email must carry that same link rather than rotating it.
            await aiInterviewService.sendSessionEmail(candidate.generatedSessionId, {
              custom_message: resolvedMessage,
              base_url: typeof window !== 'undefined' ? window.location.origin : undefined,
              keep_link: true,
            });
          } else {
            await aiInterviewService.inviteCandidate(config.id, {
              candidate_name: candidate.name.trim(),
              candidate_email: candidate.email.trim(),
              resume_id: candidate.resumeId,
              custom_message: resolvedMessage,
              expiry_days: expiryDays,
              base_url: typeof window !== 'undefined' ? window.location.origin : undefined,
            });
          }
          successCount++;
        } catch (err: any) {
          const errData = err?.response?.data || {};
          const errCode = errData?.error || errData?.detail?.error || '';
          const is409 =
            err?.response?.status === 409 ||
            err?.message?.includes('status code 409') ||
            err?.message?.includes('already been invited') ||
            errCode === 'DUPLICATE_INVITATION';
          const isTenantUser =
            err?.response?.status === 400 && errCode === 'TENANT_USER_EMAIL';

          // Extract the actual error reason from backend response
          const reason: string =
            (typeof errData?.detail === 'string' ? errData.detail : null) ||
            errData?.detail?.message ||
            errData?.message ||
            err?.message ||
            'Unknown error';

          if (is409) {
            alreadyInvited.push(candidate.email.trim());
            duplicateReasons.push(errData?.detail?.message || errData?.message || '');
          } else if (isTenantUser) {
            tenantUserEmails.push(candidate.email.trim());
          } else {
            failed.push({ email: candidate.email.trim(), reason });
            console.error(`Failed to invite ${candidate.email}:`, err);
          }
        }
      }

      setIsSubmitting(false);

      if (successCount > 0) {
        setSentCount(successCount);
        if (alreadyInvited.length > 0) {
          toast.warning(`${alreadyInvited.length} already invited: ${alreadyInvited.join(', ')}`);
        }
        if (tenantUserEmails.length > 0) {
          toast.error(`Team member emails cannot be invited: ${tenantUserEmails.join(', ')}`);
        }
        if (failed.length > 0) {
          // Show actual error reason alongside failed emails
          const uniqueReasons = [...new Set(failed.map(f => f.reason))];
          const emails = failed.map(f => f.email).join(', ');
          toast.error(`${failed.length} failed: ${emails} — ${uniqueReasons.join('; ')}`);
        }
        setShowSuccess(true);
        onInvitesChanged?.();
        setTimeout(() => {
          setShowSuccess(false);
          onInviteSent(successCount);
          onClose();
        }, 2000);
      } else if (tenantUserEmails.length > 0 && successCount === 0) {
        toast.error(`Cannot invite team member email${tenantUserEmails.length > 1 ? 's' : ''}: ${tenantUserEmails.join(', ')}. AI Interview invitations are for external candidates only.`);
      } else if (alreadyInvited.length > 0 && failed.length === 0 && tenantUserEmails.length === 0) {
        setDuplicateEmail(alreadyInvited.join(', '));
        setDuplicateReason(duplicateReasons.filter(Boolean)[0] || '');
        setShowDuplicateError(true);
      } else if (failed.length > 0) {
        // All failed — show the actual error reason
        const uniqueReasons = [...new Set(failed.map(f => f.reason))];
        toast.error(uniqueReasons.length === 1
          ? uniqueReasons[0]
          : `Invitations failed: ${uniqueReasons.join('; ')}`
        );
      } else {
        toast.error('Failed to send invitations. Please try again.');
      }
    } catch (error: any) {
      console.error('Failed to send invitations:', error);
      setIsSubmitting(false);
      toast.error(`Failed to send invitations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Validation gate for the Send Invitations button.
  //   • at least ONE fully-valid candidate (name + valid email), AND
  //   • NO row with a blocking error — an "in-use" row (name OR email typed)
  //     that is incomplete, has an invalid email, or is a duplicate of another
  //     row. This is what the per-row red errors show ("This email is already
  //     in the list" / invalid email), so the button now disables whenever any
  //     of those are visible instead of letting the recruiter click Send.
  const hasAtLeastOneValid = sendCandidates.some(
    (c) => c.name.trim() && !hasInvalidName(c) && c.email.trim() && isValidEmail(c.email),
  );
  const hasBlockingRowError = sendCandidates.some((c) => {
    const inUse = c.name.trim() || c.email.trim();
    if (!inUse) return false; // fully-empty row is ignored, not an error
    return (
      !c.name.trim() ||
      hasInvalidName(c) ||
      !c.email.trim() ||
      !isValidEmail(c.email) ||
      sendCandidates.some((o) => o.id !== c.id && o.email.trim().toLowerCase() === c.email.trim().toLowerCase())
    );
  });
  const isValid = hasAtLeastOneValid && !hasBlockingRowError && !jdDisabled;

  // Success screen
  if (showSuccess) {
    /* The same success popup in every host; in a popup step it is portalled
       to the page so it opens over that popup rather than inside its body. */
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
    return inPopupStep && typeof document !== 'undefined' ? createPortal(successPopup, document.body) : successPopup;
  }

  // Duplicate invitation error popup
  if (showDuplicateError) {
    // A revoked prior invitation has its own remedy (Send Again on the existing
    // row), so it gets different copy than a still-active duplicate.
    const isRevokedDuplicate = duplicateReason.toLowerCase().includes('revoked');
    return (
      <div
        className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setShowDuplicateError(false);
            setDuplicateEmail('');
            setDuplicateReason('');
          }
        }}
        role="dialog"
        aria-modal="true"
      >
        <div className="relative bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 max-w-[95vw] sm:max-w-md w-full p-6 sm:p-8 max-h-[90dvh] flex flex-col overflow-hidden tf-round-edges">
          <button
            onClick={() => {
              setShowDuplicateError(false);
              setDuplicateEmail('');
              setDuplicateReason('');
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
            <h3 className="text-gray-900 dark:text-slate-50 text-lg font-semibold tracking-tight mb-2">
              {isRevokedDuplicate ? 'Invitation Already Exists' : 'Invitation Already Sent'}
            </h3>
            <p className="text-gray-600 dark:text-slate-400 text-sm">
              {isRevokedDuplicate ? (
                <>
                  A revoked invitation for{' '}
                  <span className="font-medium text-gray-800 dark:text-slate-100">{duplicateEmail}</span> already
                  exists on this AI interview.
                </>
              ) : (
                <>
                  An invitation has already been sent to{' '}
                  <span className="font-medium text-gray-800 dark:text-slate-100">{duplicateEmail}</span> for this AI interview.
                </>
              )}
            </p>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto bg-gray-50 dark:bg-slate-800/50 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-700 dark:text-slate-300 mb-2">You can:</p>
            <ul className="text-sm text-gray-600 dark:text-slate-400 space-y-1">
              {isRevokedDuplicate && (
                <li>
                  • Use <span className="font-medium">Send Again</span> on the existing invitation to issue a fresh link
                </li>
              )}
              <li>
                • Try a <span className="font-medium">different email address</span>
              </li>
              <li>
                • Send invitation for a <span className="font-medium">different AI interview</span>
              </li>
              <li>• Check the candidate&apos;s existing invitation status</li>
            </ul>
          </div>

          <div className="flex-shrink-0 flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
            <Button
              variant="primary"
              onClick={() => {
                setShowDuplicateError(false);
                setDuplicateEmail('');
                setDuplicateReason('');
              }}
              className="flex-1"
            >
              Try Different Email
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* The job, its version, the interview version and the setup — the
     header's detail lines; a popup step shows them above its content. */
  const headerMeta = (
    <>
              {/* JD ID, the job title, then its job version — which job (and
                  which version of it) these invitations are for. */}
              <p className="flex items-center gap-2 mt-0.5 text-xs sm:text-sm text-gray-600 dark:text-slate-400 min-w-0">
                {config.jd_short_id && <JobIdBadge className="flex-shrink-0">{config.jd_short_id}</JobIdBadge>}
                <span className="truncate">{config.jd_title || config.position}</span>
                {config.jd_id && (
                  <span className="inline-flex items-center gap-1.5 flex-shrink-0" title="Job version">
                    -
                    <VersionPill kind="job" version={jobVersion ?? config.jd_version ?? 1} />
                  </span>
                )}
                {interviewVersion != null && (
                  <span className="inline-flex items-center gap-1.5 flex-shrink-0 whitespace-nowrap">
                    Interview Version -
                    <VersionPill kind="interview" version={interviewVersion} />
                  </span>
                )}
              </p>
              {/* Interview setup — duration, mode and what the rounds cover. */}
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-gray-500 dark:text-slate-400 min-w-0">
                <span className="inline-flex items-center gap-1 flex-shrink-0">
                  <Clock className="w-3.5 h-3.5" />
                  {config.duration_minutes || 30} min
                </span>
                <span aria-hidden="true">•</span>
                <span className="flex-shrink-0">
                  {modeFromConfig(config.special_instructions, config.duration_minutes) === 'fixed' ? 'Timed' : 'Conversational'}
                </span>
                {enabledRounds.length > 0 && (
                  <>
                    <span aria-hidden="true">•</span>
                    <span className="truncate text-gray-400 dark:text-slate-500">
                      {enabledRounds.map((r: any) => ROUND_LABELS[r.type] || r.type).join(', ')}
                    </span>
                  </>
                )}
              </p>
    </>
  );
  const contentBlock = (
    <>
        {/* Content */}
        <div className={inPopupStep ? '' : 'flex-1 overflow-y-auto p-4 sm:p-6'}>
          {/* Quota Banner — styled like the Upload Resume dialog's RU card:
              icon tile, headline + available count, usage bar, then the
              breakdown with a status pill. */}
          {(() => {
            const aiuQuota = quotaData?.quotas?.AIU;
            const subscriptionLimit = typeof aiuQuota?.subscription?.limit === 'number' ? aiuQuota.subscription.limit : null;
            const subscriptionUsed = aiuQuota?.subscription?.used ?? 0;

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
                  : <Bot className={`w-4 h-4 sm:w-5 sm:h-5 ${tone === 'low' ? 'text-brand-orange-deep' : 'text-brand-blue'}`} />}
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
                    Checking AI interview quota...
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
                    <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-slate-50">Unlimited AI interview units</span>
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
                            ? 'No AI interview units available'
                            : isLow
                            ? `Only ${available} unit${available !== 1 ? 's' : ''} available`
                            : `${available} AI interview unit${available !== 1 ? 's' : ''} available`
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
                            {pending > 0 && (
                              <span>Pending invitations (held): {pending}</span>
                            )}
                          </div>
                          {pending > 0 && (
                            <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-brand-cyan/10 ring-1 ring-brand-cyan/25 px-2.5 py-0.5 text-brand-blue dark:text-slate-200">
                              <Info className="w-3 h-3 flex-shrink-0" />
                              <span>
                                <span className="font-semibold">Note:</span>{' '}
                                {pending} unit{pending > 1 ? 's' : ''} held by active invitations — freed when an invite expires or you revoke it.
                              </span>
                            </p>
                          )}
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
                          {Math.max(0, remaining)} AI interview unit{remaining !== 1 ? 's' : ''} remaining
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
                <button
                  onClick={() => { commitPicks(); setInputMode('manual'); }}
                  className={modeTabClass(inputMode === 'manual')}
                >
                  <Upload className="w-4 h-4 text-brand-blue" />
                  Manual
                </button>
                <button
                  onClick={() => { commitPicks(); excelInputRef.current?.click(); }}
                  className={modeTabClass(inputMode === 'excel')}
                >
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
                <button
                  onClick={() => setInputMode('database')}
                  className={modeTabClass(inputMode === 'database')}
                >
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
                        {/* Full Name and Email Address are equal-width columns; Copy Link / Add
                            sit beside the grid, so they don't squeeze either input. */}
                        <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="min-w-0">
                            <label className="text-xs text-gray-600 dark:text-slate-400 mb-1 block">Full Name *</label>
                            <input
                              type="text"
                              value={candidate.name}
                              onChange={(e) => updateCandidate(candidate.id, 'name', e.target.value)}
                              placeholder="e.g., John Doe"
                              readOnly={candidate.source === 'database'}
                              aria-invalid={hasInvalidName(candidate) ? 'true' : undefined}
                              className={`w-full h-10 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-inset ${
                                candidate.source === 'database'
                                  ? 'bg-gray-100 dark:bg-slate-800 cursor-not-allowed border-gray-200 dark:border-slate-700'
                                  : hasInvalidName(candidate)
                                    ? 'border-destructive-line focus:ring-destructive-line'
                                    : 'border-gray-200 dark:border-slate-700 focus:ring-brand-blue/40 focus:border-transparent'
                              }`}
                            />
                            {hasInvalidName(candidate) && (
                              <p className="text-xs text-destructive mt-1">{NAME_FORMAT_ERROR}</p>
                            )}
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
                            {candidate.generatedLink && (
                              <div className="mt-2">
                                <p className="text-xs text-brand-blue mb-1.5">
                                  Link ready (expires {expiryDays}d) — share directly:
                                </p>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {/* WhatsApp */}
                                  <button
                                    onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`You've been invited to an AI interview. Complete it here: ${candidate.generatedLink}`)}`, '_blank')}
                                    title="Share via WhatsApp"
                                    className="p-1.5 rounded-lg hover:bg-brand-blue/10 border border-gray-200 dark:border-slate-700 transition-colors group"
                                  >
                                    <svg className="w-4 h-4 text-gray-400 dark:text-slate-500 group-hover:text-brand-blue" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                  </button>
                                  {/* Telegram */}
                                  <button
                                    onClick={() => window.open(`https://t.me/share/url?url=${encodeURIComponent(candidate.generatedLink!)}&text=${encodeURIComponent(`AI Interview invitation`)}`, '_blank')}
                                    aria-label="Share via Telegram" title="Share via Telegram"
                                    className="p-1.5 rounded-lg hover:bg-sky-50 border border-gray-200 dark:border-slate-700 transition-colors group"
                                  >
                                    <svg className="w-4 h-4 text-gray-400 dark:text-slate-500 group-hover:text-sky-500" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                                  </button>
                                  {/* LinkedIn */}
                                  <button
                                    onClick={() => window.open(`https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(candidate.generatedLink!)}`, '_blank')}
                                    aria-label="Share on LinkedIn" title="Share on LinkedIn"
                                    className="p-1.5 rounded-lg hover:bg-blue-50 border border-gray-200 dark:border-slate-700 transition-colors group"
                                  >
                                    <svg className="w-4 h-4 text-gray-400 dark:text-slate-500 group-hover:text-blue-700" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                                  </button>
                                  {/* X / Twitter */}
                                  <button
                                    onClick={() => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`AI Interview invitation: ${candidate.generatedLink}`)}`, '_blank')}
                                    title="Share on X"
                                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-700 transition-colors group"
                                  >
                                    <svg className="w-4 h-4 text-gray-400 dark:text-slate-500 group-hover:text-gray-900 dark:group-hover:text-slate-50" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                                  </button>
                                  {/* Facebook */}
                                  <button
                                    onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(candidate.generatedLink!)}`, '_blank')}
                                    aria-label="Share on Facebook" title="Share on Facebook"
                                    className="p-1.5 rounded-lg hover:bg-blue-50 border border-gray-200 dark:border-slate-700 transition-colors group"
                                  >
                                    <svg className="w-4 h-4 text-gray-400 dark:text-slate-500 group-hover:text-blue-600" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                                  </button>
                                  {/* SMS */}
                                  <button
                                    onClick={() => window.open(`sms:?body=${encodeURIComponent(`AI Interview invitation: ${candidate.generatedLink}`)}`, '_blank')}
                                    title="Share via SMS"
                                    className="p-1.5 rounded-lg hover:bg-brand-blue/10 border border-gray-200 dark:border-slate-700 transition-colors group"
                                  >
                                    <svg className="w-4 h-4 text-gray-400 dark:text-slate-500 group-hover:text-brand-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                            <div className="flex items-center gap-2 self-end sm:self-start sm:mt-5 flex-shrink-0">
                              {/* Per-candidate Copy Link button */}
                              <button
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
                                      : 'Generate & copy interview link'
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
                      {/* Schedule row - commented out for now, uncomment when schedule feature is needed */}
                      {/* <div className="grid grid-cols-2 gap-3 mt-3">
                        <div>
                          <label className="text-xs text-gray-600 mb-1 block">Schedule Date</label>
                          <input
                            type="date"
                            value={candidate.scheduledDate}
                            onChange={(e) => updateCandidate(candidate.id, 'scheduledDate', e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600 mb-1 block">Schedule Time</label>
                          <input
                            type="time"
                            value={candidate.scheduledTime}
                            onChange={(e) => updateCandidate(candidate.id, 'scheduledTime', e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                          />
                        </div>
                      </div> */}
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
                            <button
                              type="button"
                              onClick={() => handleCopyLinkForCandidate(candidate.id)}
                              disabled={generatingLinkFor === candidate.id || (!candidate.generatedLink && isDuplicateEmail(candidate.id, candidate.email))}
                              title={candidate.generatedLink ? 'Link generated — click to copy again' : 'Generate & copy interview link'}
                              aria-label={`Copy interview link for ${candidate.name}`}
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
                <div className="flex border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                  {/* RBAC: both source tabs are always listed; one the user
                      cannot open is greyed with a tooltip (never hidden). */}
                  {(() => {
                    const myResumesLocked = !hasMyResumesAccess;
                    return (
                    <button
                      onClick={() => { if (!myResumesLocked) setDbTab('my-resumes'); }}
                      aria-disabled={myResumesLocked}
                      title={myResumesLocked ? 'You do not have permission to access My Resumes' : undefined}
                      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                        myResumesLocked
                          ? 'border-transparent text-gray-400 cursor-not-allowed opacity-60'
                          : dbTab === 'my-resumes'
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
                    );
                  })()}
                  {(() => {
                    // Same rule as before: Shared Database opens with its own
                    // access, or as the fallback when neither source is granted.
                    const sharedDbLocked = !(hasInternalDBAccess || (!hasMyResumesAccess && !hasInternalDBAccess));
                    return (
                    <button
                      onClick={() => { if (!sharedDbLocked) setDbTab('internal-db'); }}
                      aria-disabled={sharedDbLocked}
                      title={sharedDbLocked ? 'You do not have permission to access the Shared Database' : undefined}
                      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                        sharedDbLocked
                          ? 'border-transparent text-gray-400 cursor-not-allowed opacity-60'
                          : dbTab === 'internal-db'
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
                    );
                  })()}
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
                  <div className="flex-1 flex flex-col overflow-hidden">
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
              Use <code className="bg-gray-100 dark:bg-slate-800 px-1 rounded">[Candidate Name]</code> as a placeholder — it will be
              replaced with each candidate&apos;s name. Your changes appear in the preview below.
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

          {/* Email Preview — colours from the Share Assessment via Email
              preview: flat slate panel, hairline border, brand-blue accents. */}
          <div className="bg-slate-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 rounded-lg">
            <button
              type="button"
              onClick={() => setShowEmailPreview(v => !v)}
              aria-expanded={showEmailPreview}
              className="w-full flex items-center justify-between gap-3 px-6 py-4 text-left rounded-lg hover:bg-slate-100/70 dark:hover:bg-slate-900 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-brand-blue" />
                <h3 className="text-gray-900 dark:text-slate-50 font-semibold">Email Preview</h3>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 px-3 py-1 rounded-full font-medium">
                  Exact email format
                </span>
                <ChevronDown className={`w-5 h-5 text-gray-500 dark:text-slate-400 transition-transform duration-200 ${showEmailPreview ? 'rotate-180' : ''}`} />
              </div>
            </button>
            {showEmailPreview && (
            <div className="px-6 pb-6">
            <p className="text-xs text-gray-600 dark:text-slate-400 mb-4 bg-white dark:bg-slate-900 rounded-lg px-3 py-2 border border-gray-200 dark:border-slate-700">
              This is exactly how the email will appear to candidates. Edit the message above to see live changes.
            </p>

            {/* Actual Email Template Preview */}
            <div className="bg-white rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden max-w-xl mx-auto">
              {/* Brand Header */}
              <div className="bg-brand-blue px-8 py-8 text-center">
                <h1 className="text-white text-2xl font-bold mb-2">AI Interview Invitation</h1>
                <p className="text-white/80 text-sm">TalentFlow</p>
              </div>

              {/* Email Body */}
              <div className="p-8">
                {/* Greeting and Message */}
                <div className="mb-6 text-gray-700 text-base leading-relaxed whitespace-pre-line">
                  {customMessage
                    .replace('[Candidate Name]', candidates[0]?.name || '[Candidate Name]')
                    .replace('[deadline date]', expiryDays > 0
                      ? formatISTDate(new Date(Date.now() + expiryDays * 86400000).toISOString())
                      : 'no specific deadline'
                    )
                  }
                </div>

                {/* Interview Title Box */}
                <div className="bg-brand-blue/5 border border-brand-blue/20 rounded-xl p-5 text-center mb-6">
                  <div className="text-xl font-bold text-brand-blue">
                    {config.jd_title || config.position}
                  </div>
                  <div className="text-sm text-brand-blue/80 mt-1 font-medium">
                    {(user as any)?.tenantName || 'Our Company'}
                  </div>
                  {((config as any).jd_location) && (
                    <div className="flex items-center justify-center gap-1.5 mt-1.5 text-brand-blue/80 text-sm">
                      <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{(config as any).jd_location}</span>
                    </div>
                  )}
                </div>

                {/* CTA Button */}
                <div className="text-center mb-6">
                  <div className="inline-block bg-brand-blue text-white px-8 py-3 rounded-lg font-semibold shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                    Start Interview
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
              <div className="bg-gray-50 px-8 py-6 text-center border-t border-gray-200">
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
  const footerContent = (
    <>
          <div className="text-sm text-gray-600 dark:text-slate-400">
            {(() => {
              const validRows = sendCandidates.filter((c) => c.name.trim() && c.email.trim());
              const validCount = validRows.length;
              const breakdown = validCount > 0 ? sourceBreakdown(validRows) : '';
              const available = quotaStats?.available ?? null;
              const isUnlimited = available !== null && available >= 999999;
              const insufficientQuota = !isUnlimited && available !== null && available < validCount;
              return (
                <span className={insufficientQuota ? 'text-destructive' : ''}>
                  {validCount} candidate{validCount !== 1 ? 's' : ''} will receive this AI interview
                  {breakdown && <span className="block text-xs text-gray-500 dark:text-slate-500">{breakdown}</span>}
                  {insufficientQuota && (
                    <span className="ml-2 font-medium">— only {available} unit{available !== 1 ? 's' : ''} available</span>
                  )}
                </span>
              );
            })()}
          </div>
          <div className="flex items-center gap-3">
            {onBack && (
              <Button variant="secondary" onClick={onBack} disabled={isSubmitting} icon={<ArrowLeft className="w-4 h-4" />}>
                Back
              </Button>
            )}
            <Button
              variant="primary"
              onClick={handleSend}
              title={jdDisabled ? JD_DISABLED_ACTION_MESSAGE : undefined}
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
          "In use" / "Use this version" controls and the tip stay hidden here. */}
      {versionViewer && (
        <ResumeVersionsModal
          candidate={{ id: versionViewer.id, name: versionViewer.name, resumeId: versionViewer.id }}
          versions={versionViewer.versions}
          onClose={() => setVersionViewer(null)}
        />
      )}
    </>
  );

  if (inPopupStep) {
    return (
      <>
        <div className="mb-4 rounded-xl border border-gray-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2.5">
          <p className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-slate-50">
            <Mail className="w-4 h-4 text-brand-blue flex-shrink-0" />
            Send AI Interview via Email
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
      className={embedded
        ? ''
        : 'fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6'}
      onClick={embedded ? undefined : (e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role={embedded ? undefined : 'dialog'}
      aria-modal={embedded ? undefined : true}
      aria-label="Send AI Interview via Email"
    >
      <div className={embedded
        ? 'bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 w-full flex flex-col overflow-hidden tf-round-edges'
        : 'bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 max-w-[95vw] sm:max-w-[935px] w-full max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col tf-round-edges'}>
        {/* Header */}
        <div className="bg-slate-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-700/60 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-brand-blue shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex items-center justify-center flex-shrink-0">
              <Mail className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 tracking-tight truncate">Send AI Interview via Email</h2>
              {headerMeta}
            </div>
          </div>
          {!embedded && (
            <button
              onClick={onClose}
              aria-label="Close dialog"
              className="text-gray-500 dark:text-slate-400 hover:text-brand-blue hover:bg-brand-blue/5 p-1.5 sm:p-2 rounded-lg transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          )}
        </div>

        {contentBlock}
        <div className="px-6 py-4 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between shrink-0">
          {footerContent}
        </div>
      </div>

      {extras}
    </div>
  );
}
