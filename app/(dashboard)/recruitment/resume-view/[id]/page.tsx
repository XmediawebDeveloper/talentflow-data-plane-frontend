'use client'

import { RESUME_EMAIL_SHARE_ENABLED } from '@/lib/constants/featureFlags';
import { CREATE_SEND_BUTTON_CLASS } from '@/lib/constants/createSendActions';
import { useState, useEffect, useLayoutEffect, useMemo, useRef, useId } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  clearInviteHandoff, readInviteHandoff, RESUME_INVITE_PARAM, type InviteHandoffKind,
} from '@/lib/utils/resumeScoringInviteHandoff';
import { formatIST, formatISTDate } from '@/lib/utils/dateUtils';
import VersionCompareModal from '@/components/VersionCompareModal';
import RecordPager from '@/components/RecordPager';
import {
  ArrowLeft, Download, Mail, Phone, MapPin, Briefcase, Calendar, Award,
  Languages, Star, Edit2, Trash2, Send, Building2, GraduationCap, Code,
  ChevronRight, ExternalLink, Globe, FileText, Clock, History,
  User, File, HardDrive, Loader2, Share2, Copy, Check, ChevronDown, ChevronUp,
  AlignLeft, Hash, X, Eye, UserPlus, Sparkles, Database, Paperclip, ClipboardList, Video, Archive
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

// Full Resume Content Component with better UI
function FullResumeContent({ text }: { text: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'formatted' | 'raw'>('formatted');

  // Parse text into sections
  const sections = useMemo(() => {
    const lines = text.split('\n');
    const result: { title: string; content: string[] }[] = [];
    let currentSection: { title: string; content: string[] } = { title: 'Overview', content: [] };

    // Common section headers in resumes
    const sectionHeaders = [
      'experience', 'work experience', 'employment', 'professional experience',
      'education', 'academic', 'qualifications',
      'skills', 'technical skills', 'core competencies', 'expertise',
      'summary', 'professional summary', 'objective', 'profile',
      'certifications', 'certificates', 'licenses',
      'projects', 'key projects',
      'achievements', 'accomplishments', 'awards',
      'languages', 'contact', 'personal', 'references'
    ];

    lines.forEach((line) => {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        if (currentSection.content.length > 0) {
          currentSection.content.push('');
        }
        return;
      }

      // Check if this line is a section header
      const lowerLine = trimmedLine.toLowerCase().replace(/[:\-_]/g, ' ').trim();
      const isHeader = sectionHeaders.some(header =>
        lowerLine === header ||
        lowerLine.startsWith(header + ' ') ||
        lowerLine.endsWith(' ' + header)
      );

      if (isHeader && trimmedLine.length < 50) {
        // Save previous section if it has content
        if (currentSection.content.length > 0 || currentSection.title !== 'Overview') {
          result.push(currentSection);
        }
        currentSection = { title: trimmedLine, content: [] };
      } else {
        currentSection.content.push(trimmedLine);
      }
    });

    // Add last section
    if (currentSection.content.length > 0) {
      result.push(currentSection);
    }

    return result.filter(s => s.content.some(c => c.trim()));
  }, [text]);

  // Stats
  const wordCount = text.split(/\s+/).filter(w => w).length;
  const charCount = text.length;
  const lineCount = text.split('\n').filter(l => l.trim()).length;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const maxHeight = isExpanded ? 'max-h-[2000px]' : 'max-h-96';

  return (
    <div className="bg-gray-50 border border-gray-300 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-100">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-gray-500" />
          <h3 className="text-lg font-semibold text-gray-800">Full Resume Content</h3>
          <div className="flex items-center gap-3 text-xs text-gray-500 ml-2">
            <span className="flex items-center gap-1">
              <Hash className="w-3 h-3" />
              {wordCount.toLocaleString()} words
            </span>
            <span>•</span>
            <span>{charCount.toLocaleString()} chars</span>
            <span>•</span>
            <span>{lineCount} lines</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Tab Toggle */}
          <div className="flex bg-gray-200 rounded-lg p-0.5">
            <button
              onClick={() => setActiveTab('formatted')}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                activeTab === 'formatted'
                  ? 'bg-white text-gray-800 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <AlignLeft className="w-3 h-3 inline mr-1" />
              Sections
            </button>
            <button
              onClick={() => setActiveTab('raw')}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                activeTab === 'raw'
                  ? 'bg-white text-gray-800 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <FileText className="w-3 h-3 inline mr-1" />
              Raw
            </button>
          </div>
          {/* Copy Button */}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors"
          >
            {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className={`${maxHeight} overflow-y-auto transition-all duration-300`}>
        {activeTab === 'formatted' ? (
          <div className="p-4 space-y-4">
            {sections.map((section, idx) => (
              <div key={idx} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                  <h4 className="font-medium text-gray-800 text-sm">{section.title}</h4>
                </div>
                <div className="p-4">
                  {section.content.map((line, lineIdx) => (
                    line ? (
                      <p key={lineIdx} className="text-sm text-gray-700 mb-2 last:mb-0 leading-relaxed">
                        {line}
                      </p>
                    ) : (
                      <div key={lineIdx} className="h-2" />
                    )
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4">
            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono leading-relaxed bg-white border border-gray-200 rounded-lg p-4">
              {text}
            </pre>
          </div>
        )}
      </div>

      {/* Expand/Collapse Button */}
      <div className="border-t border-gray-200 bg-gray-100 p-2">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-center gap-2 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition-colors"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-4 h-4" />
              Show Less
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" />
              Show More
            </>
          )}
        </button>
      </div>
    </div>
  );
}
import { Resume, Job } from '@/lib/types/types';
import { resumeService, Resume as ApiResume } from '@/lib/services/resumeService';
import { jdService } from '@/lib/services/jdService';
import { scoringService } from '@/lib/services/scoringService';
import ApplyToJobModal from '@/components/ApplyToJobModal';
import { useScoringProgress } from '@/contexts/ScoringProgressContext';
import { trackScoringBatch } from '@/lib/utils/trackScoringBatch';
import AITalentMatchSelectJobModal from '@/components/AITalentMatchSelectJobModal';
import AITalentMatchProgressPanel from '@/components/AITalentMatchProgressPanel';
import BulkScoringProgressModal, { type ScoringProgressItem as ModalProgressItem } from '@/components/BulkScoringProgressModal';
import { scorecardUrl } from '@/components/GlobalScoringProgressIndicator';
import ScoreTableModal from '@/components/ScoreTableModal';
import SkillLogo from '@/components/resumes/SkillLogo';
import { Button } from '@/components/ui/button';
import type { ScoredResume } from '@/components/ScoredResumesTable';
import { toScoredResumeDetail } from '@/lib/utils/scoredResumeDetail';
import JobInviteDialogHost, { type InviteDialogJob, type InviteDialogRequest } from '@/components/talent-match-invite/JobInviteDialogHost';
import { mapJDToJob, formatJobActionMessage } from '@/lib/utils/jobOpeningDisplay';
import ResumeTextPreviewModal from '@/components/ResumeTextPreviewModal';
import { useInviteDialog } from '@/components/talent-match-invite/InviteDialogProvider';
import type { InviteCandidate } from '@/components/talent-match-invite/inviteVersions';
import { toast } from 'sonner';
import { friendlyErrorMessage } from '@/lib/utils/friendlyError';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
import { useAuth } from '@/lib/hooks/useAuth';
import { usePlanLock } from '@/lib/hooks/usePlanFeature';
import CandidateActivityCard from '@/components/resumes/CandidateActivityCard';
import { PLAN_LOCKED_MESSAGE } from '@/lib/types/planFeatures';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { formatCandidateExperience } from '@/lib/utils/resumeExperience';
import NameAvatar from '@/components/ui/name-avatar';
import {
  INTERNAL_DB_PERMISSIONS,
  MY_RESUMES_PERMISSIONS,
  RESUME_TAB_LABEL,
  RESUME_VIEW_SOURCE_PARAM,
  resumeDatabaseTabHref,
  type ResumeTab,
} from '@/lib/constants/resumePools';

/** Create / Send button when the user lacks the permission: shown, greyed, hover explains. */
const PERMISSION_LOCKED_BUTTON_CLASS =
  'flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium whitespace-nowrap bg-gray-50 border border-gray-200 text-gray-400 cursor-not-allowed opacity-60';

export default function ResumeViewPage() {
  const params = useParams();
  const router = useRouter();
  const dialog = useGlobalDialog();
  const { isTenantAdmin, hasPermission, hasPermissionCode } = useAuth();
  const { isPlanLocked } = usePlanLock();
  const resumeId = params.id as string;

  const [resume, setResume] = useState<Resume | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Prev/Next navigation from My Resumes list
  const [navList, setNavList] = useState<string[]>([]);
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('resumeNavList');
      if (stored) setNavList(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);
  const navIndex = navList.indexOf(resumeId);
  const prevId = navIndex > 0 ? navList[navIndex - 1] : null;
  const nextId = navIndex >= 0 && navIndex < navList.length - 1 ? navList[navIndex + 1] : null;

  // Which list the user opened this resume from, so the breadcrumb points back
  // to the right place — for the two resume pools that now means the right TAB
  // of Resume Database. The originating list stores this in sessionStorage as
  // `resumeNavSource`; its values are unchanged ('my-resumes' is the tab, not a
  // route — /recruitment/my-resumes is a redirect into that tab).
  // `viewSource` also decides which permission set the page's actions use;
  // the breadcrumb reads `crumbPool` below instead.
  const [viewSource, setViewSource] = useState<'my-resumes' | 'resume-database' | 'ai-talent-match' | 'job-details'>('resume-database');
  const [jobDetailsReturnUrl, setJobDetailsReturnUrl] = useState<string | null>(null);
  const [jobDetailsTitle, setJobDetailsTitle] = useState('');
  const [aiMatchDetailsReturnUrl, setAiMatchDetailsReturnUrl] = useState<string | null>(null);
  const [aiMatchJobTitle, setAiMatchJobTitle] = useState('');
  /** The job this resume was opened from in AI Talent Match — scopes the
   *  Invite to AI Interview picker to that job's interview versions. */
  const [aiMatchJobId, setAiMatchJobIdState] = useState<string | null>(null);
  /** The Job Details job and tab this resume was opened from. */
  const [jobDetailsJobId, setJobDetailsJobId] = useState<string | null>(null);
  const [jobDetailsTab, setJobDetailsTab] = useState<string | null>(null);
  /* The resume pool the breadcrumb leads back to, from the link's `?source=`.
     Read from the URL only — never from sessionStorage, which keeps whichever
     list was used last in the tab and so named the wrong pool for a resume
     opened from search, an upload or a scoring screen. Null = not opened from
     a pool (or opened from another module, below). */
  const [crumbPool, setCrumbPool] = useState<ResumeTab | null>(null);
  useEffect(() => {
    try {
      const pool = new URLSearchParams(window.location.search).get(RESUME_VIEW_SOURCE_PARAM);
      setCrumbPool(pool === 'my-resumes' || pool === 'internal-db' ? pool : null);

      const s = sessionStorage.getItem('resumeNavSource');
      if (s === 'my-resumes' || s === 'resume-database' || s === 'ai-talent-match' || s === 'job-details') {
        setViewSource(s);
      }

      const jobId = sessionStorage.getItem('resumeNavJobId');
      const jobTab = sessionStorage.getItem('resumeNavJobTab') || 'scored-resumes';
      setJobDetailsJobId(jobId);
      setJobDetailsTab(jobTab);
      if (jobId) {
        setJobDetailsReturnUrl(`/recruitment/job-details?id=${encodeURIComponent(jobId)}&tab=${encodeURIComponent(jobTab)}`);
        // The crumb reads as the job the candidate was opened from.
        setJobDetailsTitle(sessionStorage.getItem('resumeNavJobTitle') || '');
      }

      const aiMatchJobId = sessionStorage.getItem('resumeNavAIMatchJobId');
      if (aiMatchJobId) {
        setAiMatchJobIdState(aiMatchJobId);
        setAiMatchDetailsReturnUrl(`/recruitment/ai-talent-match?jdId=${encodeURIComponent(aiMatchJobId)}&view=details`);
        // The crumb reads as the job the candidate was matched against.
        setAiMatchJobTitle(sessionStorage.getItem('resumeNavAIMatchJobTitle') || '');
      }
    } catch { /* ignore */ }
  }, []);
  /* The job the resume was opened from (Job Details, or one job's AI Talent
     Match list), named from the job record — title and job version — rather
     than the title the opener left in sessionStorage. The stored title stands
     in only until the record arrives, or if it cannot be loaded. */
  const crumbJobId =
    viewSource === 'job-details' ? jobDetailsJobId
    : viewSource === 'ai-talent-match' ? aiMatchJobId
    : null;
  const [crumbJob, setCrumbJob] = useState<{ id: string; title: string; version: number | null } | null>(null);
  useEffect(() => {
    if (crumbPool || !crumbJobId) return;
    let cancelled = false;
    jdService.get(crumbJobId)
      .then((jd) => {
        if (cancelled || !jd?.title) return;
        setCrumbJob({ id: crumbJobId, title: jd.title, version: mapJDToJob(jd).versionNumber ?? null });
      })
      .catch(() => { /* keep the opener's stored title */ });
    return () => { cancelled = true; };
  }, [crumbPool, crumbJobId]);
  const crumbJobLabel = (storedTitle: string, fallback: string) =>
    crumbJob && crumbJob.id === crumbJobId
      ? `${crumbJob.title}${crumbJob.version != null ? ` · V${crumbJob.version}` : ''}`
      : storedTitle || fallback;

  /* My Resumes and the Shared Database are tabs of one Resume Database page:
     Resume Database › <the tab the resume was opened from>. Both crumbs open
     that tab (`?tab=`): the page without one lands on My Resumes, which sent a
     Shared Database user to the wrong pool. A pool the user cannot see is never
     named or linked, and a resume not opened from a pool (search, an upload, a
     scoring screen) gets the page alone rather than a guessed tab. */
  const canSeePool = (pool: ResumeTab) =>
    isTenantAdmin ||
    (pool === 'my-resumes' ? MY_RESUMES_PERMISSIONS : INTERNAL_DB_PERMISSIONS).some((k) => hasPermission(k));
  const resumeDatabaseCrumb = { label: 'Resume Database', href: '/recruitment/resume-database' };
  const sourceCrumbs =
    crumbPool ? [
      canSeePool(crumbPool)
        ? { ...resumeDatabaseCrumb, href: resumeDatabaseTabHref(crumbPool) }
        : resumeDatabaseCrumb,
      ...(canSeePool(crumbPool)
        ? [{ label: RESUME_TAB_LABEL[crumbPool], href: resumeDatabaseTabHref(crumbPool) }]
        : []),
    ]
    // The "Match Details" step only exists when the resume was opened from a
    // specific job's match list. The candidate roll-up spans jobs and stores no
    // job id, so it goes straight from AI Talent Match to the candidate.
    : viewSource === 'ai-talent-match' ? [
      { label: 'AI Talent Match', href: '/recruitment/ai-talent-match' },
      ...(aiMatchDetailsReturnUrl
        ? [{ label: crumbJobLabel(aiMatchJobTitle, 'Match Details'), href: aiMatchDetailsReturnUrl }]
        : []),
    ]
    // Every step the recruiter walked, not just the last one: the jobs list,
    // then the job itself. "Scored Resumes" alone named a tab rather than the
    // record, and skipped the list the job was reached from.
    : viewSource === 'job-details' ? [
      { label: 'Job Descriptions', href: '/recruitment/job-openings' },
      { label: crumbJobLabel(jobDetailsTitle, 'Job Details'), href: jobDetailsReturnUrl || '/recruitment/job-openings' },
    ]
    : [resumeDatabaseCrumb];
  /* Keeps `?source=` on links back to this page and on to its neighbours, so
     the trail does not fall back to the page alone after Prev / Next or a
     return from Candidate Activity. */
  const sourceQuery = crumbPool ? `?${RESUME_VIEW_SOURCE_PARAM}=${crumbPool}` : '';

  // Apply to Job modal state
  const [isApplyToJobModalOpen, setIsApplyToJobModalOpen] = useState(false);
  const [publishedJobs, setPublishedJobs] = useState<Job[]>([]);
  const [showAITalentMatchModal, setShowAITalentMatchModal] = useState(false);
  const [aiTalentMatchJob, setAiTalentMatchJob] = useState<Job | null>(null);
  /* The scoring run started here, shown in Resume Scoring's progress popup
     (BulkScoringProgressModal) from the app-wide scoring context — the same
     run the corner widget carries once minimised. */
  const [scoringBatchId, setScoringBatchId] = useState<string | null>(null);

  // Version selection state for Apply to Job
  const [showVersionSelectModal, setShowVersionSelectModal] = useState(false);
  const [selectedVersionForApply, setSelectedVersionForApply] = useState<string | null>(null);

  // Share modal state
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [shareSubject, setShareSubject] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  /** Reading the attachment from inside the share dialog. */
  const [isSharePreviewOpen, setIsSharePreviewOpen] = useState(false);

  // Version comparison state
  const [compareLeftId, setCompareLeftId] = useState<string | null>(null);
  const [compareRightId, setCompareRightId] = useState<string | null>(null);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareChecked, setCompareChecked] = useState<string[]>([]);

  // Version preview state
  const [versionPreviewUrl, setVersionPreviewUrl] = useState<string | null>(null);
  const [versionPreviewLabel, setVersionPreviewLabel] = useState<string>('');

  // Source-aware, same as hasAITalentMatchSourcePermission below: a resume
  // opened from Internal Database must be gated by internal_db:* codes, not
  // my_resumes:* — otherwise disabling Internal Database's own Delete/Share
  // has no effect as long as My Resumes' Delete/Share stays enabled.
  const canShareResume = isTenantAdmin || (
    viewSource === 'resume-database'
      ? hasPermissionCode('internal_db:share')
      : hasPermissionCode('my_resumes:share')
  );
  const canDeleteResume = isTenantAdmin || (
    viewSource === 'resume-database'
      ? hasPermissionCode('internal_db:delete')
      : hasPermission('canDeleteResumes') || hasPermissionCode('my_resumes:delete')
  );
  // An archived resume is off-limits for every action below (Score, AI Talent
  // Match, Invite) — it can still be viewed, downloaded, shared and deleted,
  // same as the Resume Database list's own rule (ResumeTable.tsx / MyResumesView.tsx).
  const isArchived = !!(resume?.is_archived ?? resume?.isArchived);
  const ARCHIVED_ACTION_MESSAGE = 'This resume is archived — unarchive it first to use this action';

  // Plan gates DISABLE (hover explains), they never hide: permission decides
  // whether a control is shown, the plan only whether it is clickable.
  const canApplyResumeToJob =
    !isArchived &&
    (isTenantAdmin ||
    (hasPermission('canRunScoring') &&
      hasPermissionCode(viewSource === 'resume-database' ? 'internal_db:score' : 'my_resumes:score')));
  const applyPlanLocked = isPlanLocked('resume_scoring');
  const hasAITalentMatchSourcePermission =
    viewSource === 'resume-database'
      ? hasPermissionCode('internal_db:ai_match')
      : viewSource === 'my-resumes'
        ? hasPermissionCode('my_resumes:ai_match')
        : true;
  const canRunAITalentMatch =
    !isArchived &&
    (isTenantAdmin || (hasPermission('canRunAiMatch') && hasAITalentMatchSourcePermission));
  const aiMatchPlanLocked = isPlanLocked('ai_talent_match');

  // ── Invite (Assessment / AI Interview) ──────────────────────────────────
  // Same two flows the Resume Scoring candidate page offers. A resume has no
  // job context here, so the user picks the JD first.
  const canInviteAssessment =
    !isArchived &&
    (isTenantAdmin || (
      hasPermission('canCreateAssessments') && hasPermissionCode(
        viewSource === 'resume-database' ? 'internal_db:assessment' : 'my_resumes:assessment'
      )
    ));
  // "Invite to AI Interview" is its own permission per resume source (My
  // Resumes / Shared Database), plus AI Interview's own Invite.
  const canInviteAIInterview =
    !isArchived &&
    (isTenantAdmin ||
    (hasPermission('canInviteAIInterviews') &&
      (viewSource === 'resume-database'
        ? hasPermissionCode('internal_db:invite_ai_interview')
        : viewSource === 'my-resumes'
          ? hasPermissionCode('my_resumes:invite_ai_interview')
          : true)));
  const assessmentPlanLocked = isPlanLocked('assessment');
  const aiInterviewPlanLocked = isPlanLocked('ai_interview');
  const canInvite = canInviteAssessment || canInviteAIInterview;
  // Every option the user could pick is outside the plan → lock the button itself.
  const invitePlanLocked =
    (!canInviteAssessment || assessmentPlanLocked) && (!canInviteAIInterview || aiInterviewPlanLocked);

  const [showInviteMenu, setShowInviteMenu] = useState(false);
  /* File Properties drawer — slides in from the right. */
  const [showFileProperties, setShowFileProperties] = useState(false);
  useEffect(() => {
    if (!showFileProperties) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowFileProperties(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showFileProperties]);
  const inviteMenuRef = useRef<HTMLDivElement>(null);
  /* Every Assessment / AI Interview invite here opens THE invite popup
     (VersionInviteDialog). */
  const { open: openInvite } = useInviteDialog();

  useEffect(() => {
    if (!showInviteMenu) return;
    const onPointerDown = (e: MouseEvent) => {
      if (inviteMenuRef.current && !inviteMenuRef.current.contains(e.target as Node)) setShowInviteMenu(false);
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowInviteMenu(false); };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showInviteMenu]);

  /* On a phone the Invite button sits near the bottom of the screen, so a menu
     hung below it ran off the viewport with its options out of sight. Measured
     on open: flip above the button when there isn't room below and there is
     more above; otherwise scroll the page just enough to show the menu. */
  const inviteDropdownRef = useRef<HTMLDivElement>(null);
  const [inviteMenuUp, setInviteMenuUp] = useState(false);
  useLayoutEffect(() => {
    if (!showInviteMenu) { setInviteMenuUp(false); return; }
    const menu = inviteDropdownRef.current;
    const anchor = inviteMenuRef.current;
    if (!menu || !anchor) return;
    const a = anchor.getBoundingClientRect();
    const needed = menu.offsetHeight + 8;
    const below = window.innerHeight - a.bottom;
    if (below < needed && a.top > below) setInviteMenuUp(true);
    else if (below < needed) menu.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [showInviteMenu]);

  /* Invite ▾ → Assessment / AI Interview: THE invite popup with this resume
     as the candidate. Opened for one job (a job's AI Talent Match list or Job
     Details) → that job's versions; otherwise the popup starts on the list of
     every published one. It offers Create v1 / New version itself, so a job
     with none yet is no longer a separate greyed "+ Create …" path. */
  const inviteJobId = viewSource === 'ai-talent-match' ? aiMatchJobId
    : viewSource === 'job-details' ? jobDetailsJobId
    : null;
  const inviteCandidate = (): InviteCandidate | null => {
    if (!resume) return null;
    const email = resume.email && resume.email !== 'No email' ? resume.email : '';
    const phone = resume.phone && resume.phone !== 'No phone' ? resume.phone : undefined;
    const base = { id: resumeId, name: getCandidateName() || resume.name || '', email, phone, resumeId };
    if (viewSource === 'ai-talent-match') return { ...base, source: 'talent-match', inviteSource: 'AI Talent Match' };
    return {
      ...base,
      inviteSource: viewSource === 'my-resumes' ? 'My Resumes'
        : viewSource === 'resume-database' ? 'Internal DB'
        : 'JD',
    };
  };
  const startInvite = (intent: 'assessment' | 'ai-interview') => {
    setShowInviteMenu(false);
    const candidate = inviteCandidate();
    const jobTitle = viewSource === 'ai-talent-match' ? aiMatchJobTitle : jobDetailsTitle;
    openInvite({
      kind: intent === 'assessment' ? 'assessment' : 'interview',
      job: inviteJobId
        ? {
            jdId: inviteJobId,
            jdTitle: (crumbJob && crumbJob.id === inviteJobId ? crumbJob.title : jobTitle) || 'Job',
            versionNumber: crumbJob && crumbJob.id === inviteJobId ? crumbJob.version ?? undefined : undefined,
          }
        : undefined,
      candidates: candidate ? [candidate] : [],
    });
  };

  // Back from a create (started before this page used the one popup): re-check
  // the job, then open the invite for this candidate.
  const aiMatchInviteJobId = viewSource === 'ai-talent-match' ? aiMatchJobId : null;
  const inviteHandoffCheckedRef = useRef(false);
  useEffect(() => {
    if (inviteHandoffCheckedRef.current || !aiMatchInviteJobId || !resume) return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has(RESUME_INVITE_PARAM)) return;
    const h = readInviteHandoff();
    if (!h || h.source !== 'ai-talent-match' || h.origin !== 'detail' || !h.scoreIds.includes(resumeId)) return;
    inviteHandoffCheckedRef.current = true;
    // Drop the marker so a reload doesn't run this again.
    params.delete(RESUME_INVITE_PARAM);
    const q = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${q ? `?${q}` : ''}`);
    clearInviteHandoff();
    const what = h.kind === 'assessment' ? 'AI Assessment' : 'AI Interview';
    const jobName = h.jdCode || h.jdTitle;
    (async () => {
      let live = false;
      try {
        if (h.kind === 'assessment') {
          const { assessmentService } = await import('@/lib/services/assessmentService');
          const { isInvitableAssessment } = await import('@/lib/hooks/useJobInviteTargets');
          live = ((await assessmentService.list({ jd_id: h.jdId, page_size: 100 }))?.items || []).some(isInvitableAssessment);
        } else {
          const { aiInterviewService } = await import('@/lib/services/aiInterviewService');
          live = !!(await aiInterviewService.findLiveConfigForJd(h.jdId));
        }
      } catch {
        live = false;
      }
      if (!live) {
        toast.info(`No ${what} was published for ${jobName} yet - create it from Invite when you are ready.`);
        return;
      }
      toast.success(`${what} is live for ${jobName} - now invite ${getCandidateName() || 'this candidate'}.`);
      startInvite((h.kind as InviteHandoffKind) === 'assessment' ? 'assessment' : 'ai-interview');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiMatchInviteJobId, resume, resumeId]);

  const handleCompareCheck = (versionId: string) => {
    setCompareChecked(prev => {
      if (prev.includes(versionId)) {
        return prev.filter(id => id !== versionId);
      }
      if (prev.length >= 2) {
        return [prev[1], versionId];
      }
      return [...prev, versionId];
    });
  };

  // Open compare modal - used by both "View Changes" (single version vs previous) and "Compare Selected" (2 checkboxes)
  const openCompareModal = (leftId?: string, rightId?: string) => {
    if (leftId && rightId && resume?.versions) {
      setCompareLeftId(leftId);
      setCompareRightId(rightId);
      setShowCompareModal(true);
    } else if (compareChecked.length === 2 && resume?.versions) {
      const sorted = [...resume.versions].sort((a, b) => (a.version || 0) - (b.version || 0));
      const v1 = sorted.find(v => v.id === compareChecked[0]);
      const v2 = sorted.find(v => v.id === compareChecked[1]);
      if (v1 && v2) {
        if ((v1.version || 0) <= (v2.version || 0)) {
          setCompareLeftId(v1.id);
          setCompareRightId(v2.id);
        } else {
          setCompareLeftId(v2.id);
          setCompareRightId(v1.id);
        }
      }
      setShowCompareModal(true);
    }
  };

  // Preview a specific version or resume in modal — rendered by
  // ResumeTextPreviewModal, which shows the actual file (PDF inline, Word via
  // docx-preview) instead of a reformatted guess at its layout.
  const handleVersionPreview = (versionId: string, label: string) => {
    setVersionPreviewLabel(label);
    setVersionPreviewUrl(versionId);
  };

  useEffect(() => {
    if (resumeId) {
      fetchResume();
    }
  }, [resumeId]);

  const fetchResume = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch resume and versions in parallel. This IS the user opening the
      // Resume Details page, so - and only so - this first call counts as a
      // real "Resume viewed" for the Audit Log.
      const [r, versionsData] = await Promise.all([
        resumeService.get(resumeId, true),
        resumeService.getVersions(resumeId).catch(() => [])
      ]);

      // Fetch full details for each version to get extracted_text for comparison
      // This is needed because the versions endpoint doesn't return the full text
      let versionsWithFullData = versionsData;
      if (versionsData && versionsData.length > 0) {
        try {
          // Fetch full data for each version (limit to last 5 versions to avoid too many requests).
          // Skip resumeId itself - already fetched above as `r` - so this
          // incidental backfill never re-requests (and re-audits) the same
          // resume a second time in one page load.
          const versionsToFetch = versionsData.slice(0, 5).filter((v: any) => v.id !== resumeId);
          const fullVersionsData = await Promise.all(
            versionsToFetch.map((v: any) =>
              resumeService.get(v.id).catch(() => v) // Fallback to original if fetch fails
            )
          );

          // Merge full data with original version data, matched by id rather
          // than position - versionsToFetch skips resumeId (already fetched
          // as `r` above), so it's no longer a same-length prefix of
          // versionsData and can't be zipped by index.
          const fullById = new Map<string, any>(fullVersionsData.map((fv: any) => [fv.id, fv]));
          fullById.set(resumeId, r);
          versionsWithFullData = versionsData.map((v: any) => {
            const full = fullById.get(v.id);
            if (full) {
              return {
                ...v,
                extracted_text: full.extracted_text,
                skills: full.skills || v.skills,
                technical_skills: full.technical_skills || v.technical_skills,
                experience: full.experience || v.experience,
                education: full.education || v.education,
                certifications: full.certifications || v.certifications,
                current_title: full.current_title || v.current_title,
                current_company: full.current_company || v.current_company,
                location: full.location || v.location,
                professional_summary: full.professional_summary || v.professional_summary,
              };
            }
            return v;
          });
        } catch (err) {
          console.warn('Failed to fetch full version data:', err);
          // Continue with original versions data
        }
      }

      const converted = convertApiResume(r, versionsWithFullData);
      setResume(converted);
    } catch (err: any) {
      console.error('Failed to fetch resume:', err);
      setError(err?.message || 'Failed to load resume');
      toast.error('Failed to load resume');
    } finally {
      setLoading(false);
    }
  };

  const convertApiResume = (r: ApiResume, versionsData: any[] = []): Resume => ({
    id: r.id,
    is_archived: r.is_archived,
    name: r.candidate_name || r.file_name?.replace(/\.[^/.]+$/, '') || 'Unknown',
    email: r.email || 'No email',
    phone: r.phone || 'No phone',
    title: r.current_title || 'N/A',
    experience: formatCandidateExperience(r.experience_months, r.experience_years) || 'N/A',
    education: r.education?.[0]?.degree || 'N/A',
    location: r.location || 'N/A',
    skills: r.skills || [],
    source: (r.source === 'ai_match' ? 'TalentFlow' : 'Manual') as 'Manual' | 'TalentFlow',
    folderId: r.folder_id || '',
    uploadDate: r.created_at,
    attachments: r.version_count || versionsData.length || 1,
    uploadedBy: r.uploaded_by_name || 'Unknown',
    fileName: r.file_name,
    fileType: r.file_type,
    fileSizeKb: r.file_size_kb || undefined,
    currentCompany: r.current_company,
    previousCompany: r.previous_company,
    noticePeriod: r.notice_period,
    lastUpdated: r.updated_at,
    professionalSummary: r.professional_summary,
    technicalSkills: r.technical_skills,
    softSkills: r.soft_skills,
    educationDetails: (r.education as any[])?.map((edu: any) => ({
      degree: edu.degree || '',
      field: edu.field || '',
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
    versions: versionsData.map((v: any) => ({
      id: v.id,
      name: v.file_name || v.name,
      uploadDate: v.created_at || v.upload_date,
      size: v.file_size_kb ? `${v.file_size_kb} KB` : 'Unknown',
      uploadedBy: v.uploaded_by_name || 'Unknown',
      version: v.version || 1,
      fileName: v.file_name,
      // Parsed content for comparison
      skills: v.skills || [],
      technicalSkills: v.technical_skills || [],
      experience: v.experience || [],
      education: v.education || [],
      certifications: v.certifications || [],
      currentTitle: v.current_title,
      currentCompany: v.current_company,
      location: v.location,
      professionalSummary: v.professional_summary,
      // Full extracted text for line-by-line comparison
      extractedText: v.extracted_text || '',
    })),
    versionCount: r.version_count || versionsData.length || 1,
    extractedText: r.extracted_text,
    // NEW FIELDS - Projects, Awards, etc.
    projects: r.projects || [],
    awards: r.awards || [],
    hobbies: r.hobbies || [],
    achievements: r.achievements || [],
    volunteerExperience: r.volunteer_experience || [],
    references: r.references || [],
    linkedinUrl: r.linkedin_url,
    githubUrl: r.github_url,
    portfolioUrl: r.portfolio_url,
    objective: r.objective,
    additionalInfo: r.additional_info,
  });

  const handleDownload = async (
    targetResumeId: string = resumeId,
    targetFileName: string = resume?.fileName || `resume-${resumeId}.${resume?.fileType || 'pdf'}`,
    errorMessage: string = 'Failed to download resume'
  ) => {
    try {
      const blob = await resumeService.download(targetResumeId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = targetFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error(errorMessage);
    }
  };

  const handleShare = () => {
    if (resume) {
      setShareSubject(`Resume: ${resume.name} - ${resume.title || 'Candidate'}`);
      setShareMessage(`Hi,

I'm sharing the resume of ${resume.name} for your review.

Candidate Details:
- Name: ${resume.name}
- Title: ${resume.title || 'N/A'}
- Experience: ${resume.experience || 'N/A'}
- Location: ${resume.location || 'N/A'}
- Skills: ${resume.skills?.slice(0, 5).join(', ') || 'N/A'}

You can view the full resume at: ${window.location.href}

Best regards`);
      setIsShareModalOpen(true);
    }
  };

  const handleSendEmail = async () => {
    if (!shareEmail.trim()) {
      toast.error('Please enter an email address');
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(shareEmail.trim())) {
      toast.error('Please enter a valid email address');
      return;
    }

    setIsSendingEmail(true);

    try {
      // Call API to send email
      const result = await resumeService.share(resumeId, shareEmail.trim(), shareMessage);

      if (result.success) {
        toast.success('Resume shared successfully');
        setIsShareModalOpen(false);
        setShareEmail('');
        setShareMessage('');
      } else {
        toast.error(result.message || 'Failed to send email');
      }
    } catch (error: any) {
      console.error('Failed to share resume:', error);
      toast.error(friendlyErrorMessage(error, "Couldn't send email. Please try again."));
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleDelete = async () => {
    if (await dialog.confirm({
      title: 'Delete Resume',
      message: 'Are you sure you want to delete this resume?\nThis action cannot be undone.',
      variant: 'delete',
      confirmText: 'Delete Resume',
      item: { label: 'RESUME', name: getCandidateName() },
      warningNote: 'Deleting this resume will permanently remove it and cannot be restored.',
    })) {
      try {
        await resumeService.delete(resumeId);
        toast.success('Resume deleted');
        router.push('/recruitment/resume-database?tab=my-resumes');
      } catch (err) {
        toast.error('Failed to delete resume');
      }
    }
  };

  // Fetch published jobs for the Apply to Job modal
  const fetchPublishedJobs = async () => {
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
    }
  };

  /* Opened from an AI Talent Match result: Score Resume scores against THAT
     match's JD — no job search/list, and the resume versions are picked inside
     the dialog itself (all listed, latest pre-selected). */
  const [aiMatchScoringJob, setAiMatchScoringJob] = useState<Job | null>(null);
  // App-wide scoring progress popup — the AI Talent Match flow's scoring is
  // tracked there so it follows the user to the job's page.
  const scoringProgress = useScoringProgress();

  /* Opened from a job's AI Talent Match Result tab (Job Details): the
     candidate is already a match for that job, so there is no AI Talent Match
     here, and Score works on that job alone — Score Resume until this resume
     is scored for it, View Scorecard after. */
  const fromJobAIMatch = viewSource === 'job-details' && jobDetailsTab === 'ai-talent-match' && !!jobDetailsJobId;
  const [jobScoreStatus, setJobScoreStatus] = useState<'checking' | 'scored' | 'unscored'>('checking');
  /* View Score Table: this job's latest score of this resume, in the Scored
     Resumes tab's ⋮ › View Score Table popup (ScoreTableModal). */
  const [scoreTableResume, setScoreTableResume] = useState<ScoredResume | null>(null);
  /* Its header: candidate ID and the job / resume versions of that score. */
  const [scoreTableHeader, setScoreTableHeader] = useState<{ candidateId: string | null; jobVersion: number | null; resumeVersion: number | null } | null>(null);
  const [loadingScoreTable, setLoadingScoreTable] = useState(false);
  /* Create / Send Assessment | AI Interview — Job Details' Create / Send
     popup for this job (its versions), with this candidate. */
  const [jobForInvite, setJobForInvite] = useState<InviteDialogJob | null>(null);
  const [inviteRequest, setInviteRequest] = useState<InviteDialogRequest | null>(null);
  useEffect(() => {
    if (!fromJobAIMatch || !jobDetailsJobId) return;
    let cancelled = false;
    jdService.get(jobDetailsJobId)
      .then((jd) => {
        if (cancelled) return;
        const job = mapJDToJob(jd);
        setJobForInvite({
          jdId: jd.id,
          jdTitle: jd.title || jobDetailsTitle,
          jdCode: jd.job_id,
          versionNumber: job.versionNumber,
          status: job.status,
        });
      })
      .catch(() => {
        // The popup still opens for the job, named by the crumb's title.
        if (!cancelled) setJobForInvite({ jdId: jobDetailsJobId, jdTitle: jobDetailsTitle });
      });
    return () => { cancelled = true; };
  }, [fromJobAIMatch, jobDetailsJobId, jobDetailsTitle]);
  const openScoreTable = async () => {
    if (!jobDetailsJobId) return;
    setLoadingScoreTable(true);
    /* The candidate ID is the candidate's assessment CID — on their latest
       assessment attempt, from the resume's activity. None yet → none shown. */
    const candidateIdRequest = resumeService.getActivity(resumeId)
      .then((a) => a.assessments?.items?.find((x) => x.candidate_display_id)?.candidate_display_id ?? null)
      .catch(() => null);
    try {
      const PAGE_SIZE = 100;
      let found: { resume_id?: string; resume_version?: number | null } | null = null;
      for (let page = 1, seen = 0; page <= 50 && !found; page += 1) {
        // Newest first, so the first match is the latest scoring.
        const res = await jdService.getScoredResumes(jobDetailsJobId, { page_size: PAGE_SIZE, page, sort_by: 'latest' });
        const items: { resume_id?: string; resume_version?: number | null }[] = res?.items || [];
        found = items.find((it) => it.resume_id === resumeId) ?? null;
        seen += items.length;
        if (items.length < PAGE_SIZE || seen >= (res?.total ?? 0)) break;
      }
      if (!found) {
        toast.error('No score for this resume on this job yet.');
        return;
      }
      setScoreTableHeader({
        candidateId: await candidateIdRequest,
        // The job version this page's job is, and the resume version scored.
        jobVersion: jobForInvite?.versionNumber ?? null,
        resumeVersion: typeof found.resume_version === 'number' ? found.resume_version : null,
      });
      setScoreTableResume(toScoredResumeDetail(found, jobForInvite?.jdTitle || jobDetailsTitle));
    } catch (error) {
      console.error('[ResumeView] Failed to load the score table:', error);
      toast.error('Failed to load score table');
    } finally {
      setLoadingScoreTable(false);
    }
  };
  const openCreateSend = (kind: 'assessment' | 'interview', candidates?: { id: string; name: string; email: string; phone?: string; resumeId?: string }[]) => {
    if (!jobForInvite || !resume) return;
    setInviteRequest({
      kind,
      job: jobForInvite,
      candidates: candidates ?? [{
        id: resumeId,
        name: resume.name || '',
        email: resume.email && resume.email !== 'No email' ? resume.email : '',
        phone: resume.phone && resume.phone !== 'No phone' ? resume.phone : undefined,
        resumeId,
        // A job's AI Talent Match Result tab — recorded as "AI Talent Match".
        source: 'talent-match',
      }],
    });
  };
  /* Is this resume scored for the job? The existing-scores API is the answer
     — read on load, and again once a Score Resume run here has scored. */
  const readJobScoreStatus = (jobId: string) =>
    scoringService.checkExistingScores(jobId, [resumeId])
      .then((r): 'scored' | 'unscored' => (r.existing_count > 0 ? 'scored' : 'unscored'));
  useEffect(() => {
    if (!fromJobAIMatch || !jobDetailsJobId) return;
    let cancelled = false;
    readJobScoreStatus(jobDetailsJobId)
      .then((status) => { if (!cancelled) setJobScoreStatus(status); })
      // Unknown: offer Score Resume, whose run checks again before scoring.
      .catch(() => { if (!cancelled) setJobScoreStatus('unscored'); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromJobAIMatch, jobDetailsJobId, resumeId]);

  const handleApplyToJob = async () => {
    /* The match's own job — from the AI Talent Match page or a job's AI
       Talent Match Result tab. */
    const scopedJobId = viewSource === 'ai-talent-match' ? aiMatchJobId : fromJobAIMatch ? jobDetailsJobId : null;
    if (scopedJobId) {
      try {
        const [jd, lineage] = await Promise.all([
          jdService.get(scopedJobId),
          jdService.getLineageVersions(scopedJobId).catch(() => []),
        ]);
        const versionNumber = lineage.find(v => v.id === scopedJobId)?.version_number ?? jd.current_version ?? 1;
        setAiMatchScoringJob({
          id: jd.id,
          job_id: jd.job_id,
          title: jd.title || (fromJobAIMatch ? jobDetailsTitle : aiMatchJobTitle) || 'Untitled',
          status: 'Published',
          location: jd.location || '',
          daysActive: 0,
          requiredMatch: 70,
          applicants: 0,
          skills: [],
          versionNumber,
        } as Job);
        setSelectedVersionForApply(null);
        setIsApplyToJobModalOpen(true);
        return;
      } catch (error) {
        console.error('Failed to load the AI Talent Match job for scoring:', error);
        // Fall through to the normal job picker.
      }
    }
    setAiMatchScoringJob(null);
    // If resume has multiple versions, show version selection first
    if (resume && resume.versions && resume.versions.length > 1) {
      setSelectedVersionForApply(resumeId); // Default to current version
      setShowVersionSelectModal(true);
    } else {
      // No versions or single version - proceed directly to job selection
      await fetchPublishedJobs();
      setIsApplyToJobModalOpen(true);
    }
  };

  const handleOpenScoredResumes = () => {
    router.push(jobDetailsReturnUrl || '/recruitment/job-openings');
  };

  const handleAITalentMatch = async () => {
    if (!resume) return;
    await fetchPublishedJobs();
    setShowAITalentMatchModal(true);
  };

  const handleVersionSelectForApply = async (versionId: string) => {
    setSelectedVersionForApply(versionId);
    setShowVersionSelectModal(false);
    await fetchPublishedJobs();
    setIsApplyToJobModalOpen(true);
  };

  const getCandidateName = () =>
    resume?.candidateName || resume?.candidate_name || resume?.name || 'Unknown Candidate';

  /* Panel visibility for the corner widget: hidden while this page's popup
     is open, so the two never show at once. */
  const scoringPanelOwner = useId();
  useEffect(() => {
    scoringProgress.setPanelVisibility(scoringPanelOwner, !!scoringBatchId);
    return () => scoringProgress.setPanelVisibility(scoringPanelOwner, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoringBatchId, scoringPanelOwner]);
  const scoringRun = scoringBatchId ? scoringProgress.getJobProgress(scoringBatchId) : undefined;
  /* A Score Resume run started here for this job's Score: once this resume
     scores, Score Resume becomes View Score Table — no refresh. Kept apart
     from `scoringBatchId`, which the popup clears on minimise / close. */
  const [scoreWatchBatchId, setScoreWatchBatchId] = useState<string | null>(null);
  const watchedScoreStatus = scoreWatchBatchId
    ? scoringProgress.getJobProgress(scoreWatchBatchId)?.items.find((item) => item.resumeId === resumeId)?.status
    : undefined;
  useEffect(() => {
    // A failed run changes nothing — the page stays on Score Resume.
    if (!scoreWatchBatchId || !jobDetailsJobId || watchedScoreStatus !== 'Scored successfully') return;
    // Only once the score is saved and readable does the page say so.
    readJobScoreStatus(jobDetailsJobId)
      .then(setJobScoreStatus)
      .catch(() => { /* keep the current state; reopening reads it again */ })
      .finally(() => setScoreWatchBatchId(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedScoreStatus, scoreWatchBatchId, jobDetailsJobId]);
  const scoringModalItems: ModalProgressItem[] = (scoringRun?.items ?? []).map(item => ({
    id: item.id,
    resumeId: item.resumeId,
    candidateName: item.candidateName,
    jobTitle: item.jobTitle,
    jobId: item.jobId,
    source: item.source,
    status: item.status,
    errorReason: item.errorReason,
    scoredDateTime: item.scoredDateTime ? new Date(item.scoredDateTime) : undefined,
    matchResult: item.matchResult,
    score: item.score,
    overallRating10: item.overallRating10,
  }));

  // Handle applying resume to selected job (scoring) - using async Celery
  const handleApplyToJobSubmit = async (resumeIds: string[], jobIds: string[], jobRecords?: Job[]) => {
    if (jobIds.length === 0 || resumeIds.length === 0) return;

    setIsApplyToJobModalOpen(false);

    const jobId = jobIds[0];
    // Use selected version if available, otherwise use current resume
    // The AI Talent Match flow picks the version inside the dialog, so its
    // pick (resumeIds[0]) wins; elsewhere the pre-dialog version picker does.
    const resumeIdToScore = (aiMatchScoringJob ? resumeIds[0] : selectedVersionForApply) || resumeId;
    const selectedJob = jobRecords?.[0] || publishedJobs.find(job => job.id === jobId);
    const fallbackJobTitle = selectedJob?.title || 'Selected Job';
    const candidateName = getCandidateName();

    /* Every Score Resume here runs the same way as Resume Scoring's: the run
       is handed to the app-wide scoring context and shown in its full
       progress popup (Match Status, Score, View) right on this page. The
       recruiter stays here; minimising leaves it in the corner widget. */
    try {
      // AI Talent Match: already scored against this JD → open that scorecard.
      if (aiMatchScoringJob) {
        try {
          const existing = await scoringService.checkExistingScores(jobId, [resumeIdToScore]);
          if (existing.existing_count > 0) {
            toast.info(`This resume is already scored for "${fallbackJobTitle}".`);
            router.push(scorecardUrl(jobId, resumeIdToScore));
            return;
          }
        } catch (checkError) {
          console.warn('[ResumeView] checkExistingScores failed, scoring anyway:', checkError);
        }
      }

      const response = await scoringService.startBulkScoringAsync(jobId, [resumeIdToScore]);
      const responseJobId = response.jd_id || jobId;
      trackScoringBatch(scoringProgress, {
        batchId: response.batch_id,
        jobId: responseJobId,
        jobTitle: response.jd_title || fallbackJobTitle,
        items: [{ resumeId: resumeIdToScore, candidateName }],
        returnUrl: `/recruitment/job-details?id=${encodeURIComponent(responseJobId)}&tab=scored-resumes`,
      });
      setScoringBatchId(response.batch_id);
      // This job's own Score (Job Details › AI Talent Match): follow the run.
      if (fromJobAIMatch && responseJobId === jobDetailsJobId) setScoreWatchBatchId(response.batch_id);
      toast.success(`Scoring started for ${candidateName}.`);
    } catch (error: any) {
      console.error('Failed to start scoring:', error);
      if (error?.message?.includes('QUOTA') || error?.response?.status === 403) {
        toast.error('Resume scoring quota exhausted. Please upgrade your plan.');
      } else {
        toast.error(friendlyErrorMessage(error, "Couldn't start scoring. Please try again."));
      }
    } finally {
      setSelectedVersionForApply(null);
    }
  };

  if (loading) {
    // Structure-matched skeleton — mirrors this page's real layout: the card
    // wrapper + breadcrumb, the candidate hero card (avatar + name/meta chips,
    // with email and phone among them, then its row of actions), and the
    // stacked section cards (Summary, Work Experience, Education, Skills…),
    // each a titled card with an icon tile, heading and a few skeleton lines.
    return (
      <main className="flex-1 overflow-x-clip bg-slate-50">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="p-4 md:p-8 w-full min-h-[calc(100dvh-7rem)] bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
            {/* Breadcrumb */}
            <div className="mb-4 md:mb-6 flex items-center gap-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-3" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-3" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-3" />
              <Skeleton className="h-3 w-28" />
            </div>

            {/* Body — candidate hero card + section cards */}
            <div className="space-y-6">
              {/* Candidate hero card */}
              <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm rounded-xl p-4 sm:p-6">
                <div className="flex items-start gap-4">
                  <Skeleton className="w-16 h-16 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-6 w-56" />
                    <Skeleton className="h-4 w-40" />
                    <div className="flex flex-wrap gap-2 pt-1">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} className="h-6 w-24 rounded-full" />
                      ))}
                    </div>
                  </div>
                </div>
                {/* The card's actions row */}
                <div className="mt-5 pt-5 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Skeleton className="h-9 w-20 rounded-lg" />
                    <Skeleton className="h-9 w-32 rounded-lg" />
                    <Skeleton className="h-9 w-20 rounded-lg" />
                  </div>
                  <Skeleton className="h-9 w-36 rounded-lg" />
                </div>
              </div>

              {/* Section cards */}
              {Array.from({ length: 3 }).map((_, card) => (
                <div key={card} className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm rounded-xl p-4 sm:p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Skeleton className="w-9 h-9 rounded-lg" />
                    <Skeleton className="h-6 w-48" />
                  </div>
                  <div className="space-y-2.5">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-11/12" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (error || !resume) {
    return (
      <div className="tf-loader-page flex-col bg-slate-50">
        <p className="text-gray-600 mb-4">{error || 'Resume not found'}</p>
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-brand-blue hover:text-brand-blue-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Go Back
        </button>
      </div>
    );
  }

  // Use real data from resume object
  const detailedResume = {
    ...resume,
    summary: resume.professionalSummary || '',
    experience: resume.experienceDetails && resume.experienceDetails.length > 0
      ? resume.experienceDetails
      : [],
    education: resume.educationDetails && resume.educationDetails.length > 0
      ? resume.educationDetails
      : resume.education
        ? [{ degree: resume.education, field: '', school: '', location: resume.location || '', year: '', gpa: '', honors: '' }]
        : [],
    skills: {
      technical: (resume.technicalSkills || resume.skills || []),
      soft: resume.softSkills || []
    },
    certifications: (resume.certifications || []).filter(c => c.name),
    languages: (resume.languages || []).filter(l => l.name),
  };

  /* Deliberately not wrapped in <FeatureGate feature="resume_upload">. Reading a
     resume that is already stored is not an upload, and `resume_upload` is a
     metered feature — PlanFeaturesProvider turns it off once the RU quota hits
     EXCEEDED. Gating this page on it meant that running out of upload units
     made every resume already in the database unopenable. Per-action controls
     (share, delete, score, assessment) keep their own permission and plan
     checks below. */
  return (
    <main className="flex-1 overflow-x-clip bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full min-h-[calc(100dvh-7rem)] bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
          {/* Previous / Next rides inside the breadcrumb bar, as on
              job-details, and uses the shared RecordPager instead of the grey
              hand-rolled buttons that used to sit in the header row. */}
          <PageBreadcrumb
            className="mb-4 md:mb-6"
            items={[
              { label: 'Dashboard', href: '/dashboard' },
              ...sourceCrumbs,
              // Name the candidate whose resume is open, not a generic label.
              { label: resume?.name || 'Resume Details' },
            ]}
            actions={navList.length > 0 && navIndex >= 0 ? (
              <RecordPager
                currentIndex={navIndex}
                totalCount={navList.length}
                onPrev={prevId ? () => router.replace(`/recruitment/resume-view/${prevId}${sourceQuery}`) : undefined}
                onNext={nextId ? () => router.replace(`/recruitment/resume-view/${nextId}${sourceQuery}`) : undefined}
              />
            ) : undefined}
          />

      {/* Content */}
      <div>
        <div className="space-y-4 sm:space-y-6">

          {/* Personal Info Card
              Identity on one line — avatar, name, role, then the facts about the
              person as chips. Contact used to trail off the bottom as two loose
              lines of text with nothing holding them; it now sits below a rule
              as proper tiles, so it reads as a deliberate block rather than
              leftovers. */}
          {(() => {
            // The API mapper substitutes these placeholders for missing values,
            // so treat them as empty rather than printing "N/A" at people.
            // Takes `unknown` because a few Resume fields are typed loosely
            // (`string | any[]`) and only the string form is displayable here.
            const asText = (value: unknown): string => {
              if (typeof value !== 'string') return '';
              const trimmed = value.trim();
              return ['N/A', 'No email', 'No phone', 'Unknown'].includes(trimmed) ? '' : trimmed;
            };

            const name = asText(resume.name) || 'Unknown';
            const title = asText(resume.title);
            const email = asText(resume.email);
            const phone = asText(resume.phone);

            const facts = [
              { icon: MapPin, text: asText(resume.location) },
              { icon: Briefcase, text: asText(resume.experience) },
              { icon: Building2, text: asText(resume.currentCompany) },
              { icon: Clock, text: asText(resume.noticePeriod) && `Notice: ${asText(resume.noticePeriod)}` },
            ].filter((fact) => !!fact.text);

            const contacts = [
              email && { icon: Mail, label: 'Email', value: email, href: `mailto:${email}` },
              phone && { icon: Phone, label: 'Phone', value: phone, href: `tel:${phone}` },
            ].filter(Boolean) as { icon: typeof Mail; label: string; value: string; href: string }[];

            return (
              <div className="bg-gradient-to-br from-brand-blue/5 via-white to-brand-cyan/5 border border-brand-blue/15 rounded-xl p-4 sm:p-6 shadow-sm shadow-brand-blue/10 ring-1 ring-brand-blue/10">
                {/* Identity row */}
                <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
                  <NameAvatar name={asText(resume.name)} fallback={email} size="xl" />

                  <div className="min-w-0 flex-1">
                    {/* Below sm the Source / View chips drop under the name so the
                        name keeps the full row width instead of collapsing to a
                        sliver on a phone; sm+ keeps them beside the name. */}
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight break-words sm:truncate">
                            {name}
                          </h2>
                          {/* Same badge the Resume Database list uses (ResumeTable.tsx)
                              — this is the one place the detail page was missing it,
                              so an archived resume could be opened with no indication
                              that every action on it is now blocked. */}
                          {isArchived && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20 flex-shrink-0">
                              <Archive className="w-3 h-3" />
                              Archived
                            </span>
                          )}
                        </div>
                        {title && (
                          <p className="text-sm sm:text-base text-gray-600 break-words sm:truncate">{title}</p>
                        )}
                      </div>

                      {/* Source, as a chip rather than a floating stat — it's a
                          label for the record, not a headline number. */}
                      <div className="flex-shrink-0 flex items-center gap-2">
                        <span className="flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/70 text-xs font-medium text-brand-blue ring-1 ring-brand-blue/20">
                          <Database className="w-3.5 h-3.5" />
                          {resume.source}
                        </span>
                        {/* View — top right, beside the source badge, in its
                            own size, height and radius. */}
                        <button
                          type="button"
                          onClick={() => handleVersionPreview(resumeId, resume?.name || 'Resume')}
                          className="flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/70 text-xs font-medium text-brand-blue ring-1 ring-brand-blue/20 hover:bg-white hover:ring-brand-blue/40 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View
                        </button>
                      </div>
                    </div>

                    {(facts.length > 0 || contacts.length > 0) && (
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 mt-3">
                        {facts.map(({ icon: Icon, text }, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg sm:rounded-full bg-white/70 text-xs text-gray-700 ring-1 ring-brand-blue/10"
                          >
                            <Icon className="w-3.5 h-3.5 text-brand-blue" />
                            {text}
                          </span>
                        ))}
                        {contacts.map(({ icon: Icon, label, value, href }) => (
                          <a
                            key={label}
                            href={href}
                            title={label}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/70 text-xs text-gray-700 ring-1 ring-brand-blue/10 hover:text-brand-blue hover:ring-brand-blue/30 transition-colors min-w-0 max-w-full"
                          >
                            <Icon className="w-3.5 h-3.5 text-brand-blue flex-shrink-0" />
                            <span className="truncate [overflow-wrap:anywhere]">{value}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions — every page action, inside the card: the
                    secondary ones on the left, the primary (Score Resume /
                    Scored Resumes / View Score Table) on the right; they wrap
                    on narrow screens. Same buttons, handlers and conditions
                    the action bar above the card had. */}
                <div className="mt-5 pt-5 border-t border-brand-blue/10 flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {RESUME_EMAIL_SHARE_ENABLED && (
                      <button
                        onClick={() => { if (!canShareResume) return; handleShare(); }}
                        aria-disabled={!canShareResume}
                        title={!canShareResume ? 'You do not have permission to share resumes' : undefined}
                        className={`flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg transition-colors text-sm ${
                          canShareResume
                            ? 'text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue'
                            : 'text-gray-400 cursor-not-allowed opacity-60'
                        }`}
                      >
                        <Share2 className="w-4 h-4" />
                        Share
                      </button>
                    )}
                    {/* From a job's AI Talent Match Result: the Invite menu's two
                        actions as their own buttons — Job Details' Create / Send
                        popup for that job, with this candidate. */}
                    {fromJobAIMatch && (
                      <button
                        onClick={() => { if (!canInviteAssessment) return; openCreateSend('assessment'); }}
                        disabled={!jobForInvite || assessmentPlanLocked}
                        aria-disabled={!canInviteAssessment}
                        title={isArchived ? ARCHIVED_ACTION_MESSAGE : assessmentPlanLocked ? PLAN_LOCKED_MESSAGE : !canInviteAssessment ? 'You do not have permission to invite candidates to an assessment' : undefined}
                        className={canInviteAssessment ? CREATE_SEND_BUTTON_CLASS.assessment : PERMISSION_LOCKED_BUTTON_CLASS}
                      >
                        <ClipboardList className="w-4 h-4" />
                        Create / Send Assessment
                      </button>
                    )}
                    {fromJobAIMatch && (
                      <button
                        onClick={() => { if (!canInviteAIInterview) return; openCreateSend('interview'); }}
                        disabled={!jobForInvite || aiInterviewPlanLocked}
                        aria-disabled={!canInviteAIInterview}
                        title={isArchived ? ARCHIVED_ACTION_MESSAGE : aiInterviewPlanLocked ? PLAN_LOCKED_MESSAGE : !canInviteAIInterview ? 'You do not have permission to invite candidates to an AI interview' : undefined}
                        className={canInviteAIInterview ? CREATE_SEND_BUTTON_CLASS.interview : PERMISSION_LOCKED_BUTTON_CLASS}
                      >
                        <Video className="w-4 h-4" />
                        Create / Send AI Interview
                      </button>
                    )}
                    {!fromJobAIMatch && (
                      <div className="relative" ref={inviteMenuRef}>
                        <button
                          onClick={() => { if (!canInvite) return; setShowInviteMenu(!showInviteMenu); }}
                          disabled={canInvite && invitePlanLocked}
                          aria-disabled={!canInvite}
                          title={
                            isArchived
                              ? ARCHIVED_ACTION_MESSAGE
                              : assessmentPlanLocked && aiInterviewPlanLocked
                                ? PLAN_LOCKED_MESSAGE
                                : !canInvite
                                  ? 'You do not have permission to invite candidates'
                                  : invitePlanLocked ? PLAN_LOCKED_MESSAGE : undefined
                          }
                          aria-haspopup="menu"
                          aria-expanded={showInviteMenu}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
                            invitePlanLocked || !canInvite
                              ? `bg-gray-50 border border-gray-200 text-gray-400 cursor-not-allowed${!canInvite ? ' opacity-60' : ''}`
                              : 'bg-white border border-brand-blue/40 text-brand-blue hover:bg-brand-blue/5'
                          }`}
                        >
                          <UserPlus className="w-4 h-4" />
                          Invite
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showInviteMenu ? 'rotate-180' : ''}`} />
                        </button>

                        {showInviteMenu && (
                          <div ref={inviteDropdownRef} role="menu" className={`absolute left-0 ${inviteMenuUp ? 'bottom-full mb-2' : 'top-full mt-2'} w-52 max-w-[calc(100vw-1.5rem)] bg-white rounded-xl border border-gray-200 shadow-lg shadow-gray-900/10 py-1.5 z-[60]`}>
                            <button
                              role="menuitem"
                              onClick={() => { if (!canInviteAssessment) return; startInvite('assessment'); }}
                              disabled={assessmentPlanLocked}
                              aria-disabled={!canInviteAssessment}
                              title={isArchived ? ARCHIVED_ACTION_MESSAGE : assessmentPlanLocked ? PLAN_LOCKED_MESSAGE : !canInviteAssessment ? 'You do not have permission to invite candidates to an assessment' : undefined}
                              className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                                assessmentPlanLocked ? 'opacity-50 cursor-not-allowed' : !canInviteAssessment ? 'text-gray-400 cursor-not-allowed opacity-60' : 'hover:bg-brand-blue/5'
                              }`}
                            >
                              <span className="w-8 h-8 rounded-lg bg-brand-blue/10 flex items-center justify-center flex-shrink-0">
                                <ClipboardList className="w-4 h-4 text-brand-blue" />
                              </span>
                              <span className="min-w-0 text-sm font-medium text-gray-900">Assessment</span>
                            </button>
                            <button
                              role="menuitem"
                              onClick={() => { if (!canInviteAIInterview) return; startInvite('ai-interview'); }}
                              disabled={aiInterviewPlanLocked}
                              aria-disabled={!canInviteAIInterview}
                              title={isArchived ? ARCHIVED_ACTION_MESSAGE : aiInterviewPlanLocked ? PLAN_LOCKED_MESSAGE : !canInviteAIInterview ? 'You do not have permission to invite candidates to an AI interview' : undefined}
                              className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                                aiInterviewPlanLocked ? 'opacity-50 cursor-not-allowed' : !canInviteAIInterview ? 'text-gray-400 cursor-not-allowed opacity-60' : 'hover:bg-brand-blue/5'
                              }`}
                            >
                              <span className="w-8 h-8 rounded-lg bg-brand-cyan/10 flex items-center justify-center flex-shrink-0">
                                <Video className="w-4 h-4 text-brand-cyan" />
                              </span>
                              <span className="min-w-0 text-sm font-medium text-gray-900">AI Interview</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {/* Not offered when the resume was opened FROM an AI Talent Match
                        result — the AI Talent Match page's or a job's AI Talent Match
                        Result tab — the candidate is already a match there. */}
                    {viewSource !== 'ai-talent-match' && !fromJobAIMatch && (
                      <button
                        onClick={() => { if (!canRunAITalentMatch) return; handleAITalentMatch(); }}
                        disabled={aiMatchPlanLocked}
                        aria-disabled={!canRunAITalentMatch}
                        title={isArchived ? ARCHIVED_ACTION_MESSAGE : aiMatchPlanLocked ? PLAN_LOCKED_MESSAGE : !canRunAITalentMatch ? 'You do not have permission to run AI Talent Match' : undefined}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
                          aiMatchPlanLocked || !canRunAITalentMatch
                            ? `bg-gray-50 border border-gray-200 text-gray-400 cursor-not-allowed${!canRunAITalentMatch ? ' opacity-60' : ''}`
                            : 'bg-white border border-brand-cyan/40 text-brand-cyan hover:bg-brand-cyan/5'
                        }`}
                      >
                        <Sparkles className="w-4 h-4" />
                        AI Talent Match
                      </button>
                    )}
                    {/* Not offered when opened from an AI Talent Match result — the
                        AI Talent Match page's or a job's AI Talent Match Result tab. */}
                    {viewSource !== 'ai-talent-match' && !fromJobAIMatch && (
                      <button
                        onClick={() => { if (!canDeleteResume) return; handleDelete(); }}
                        aria-disabled={!canDeleteResume}
                        title={!canDeleteResume ? 'You do not have permission to delete resumes' : undefined}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm ${
                          canDeleteResume
                            ? 'bg-white border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300'
                            : 'bg-gray-50 border border-gray-200 text-gray-400 cursor-not-allowed opacity-60'
                        }`}
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    )}
                  </div>
                  {fromJobAIMatch ? (
                    /* From the job's AI Talent Match Result tab: this job's score.
                       Scored → its score table, in a popup; not yet → Score Resume,
                       for this job. */
                    jobScoreStatus === 'scored' ? (
                      <button
                        onClick={() => void openScoreTable()}
                        disabled={loadingScoreTable}
                        className="flex items-center gap-2 px-6 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-all text-sm shadow-md shadow-brand-blue/25 ring-1 ring-white/10 disabled:opacity-60 disabled:cursor-wait"
                      >
                        {loadingScoreTable ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                        View Score Table
                      </button>
                    ) : (
                      <button
                        onClick={() => { if (!canApplyResumeToJob) return; handleApplyToJob(); }}
                        disabled={applyPlanLocked || jobScoreStatus === 'checking'}
                        aria-disabled={!canApplyResumeToJob}
                        title={isArchived ? ARCHIVED_ACTION_MESSAGE : applyPlanLocked ? PLAN_LOCKED_MESSAGE : !canApplyResumeToJob ? 'You do not have permission to score resumes' : jobScoreStatus === 'checking' ? 'Checking whether this resume is already scored…' : undefined}
                        className={`flex items-center gap-2 px-6 py-2 rounded-lg transition-all text-sm ${
                          applyPlanLocked || jobScoreStatus === 'checking' || !canApplyResumeToJob
                            ? `bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed${!canApplyResumeToJob ? ' opacity-60' : ''}`
                            : 'bg-brand-blue hover:bg-brand-blue-2 text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10'
                        }`}
                      >
                        {jobScoreStatus === 'checking' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        Score Resume
                      </button>
                    )
                  ) : viewSource === 'job-details' ? (
                    <button
                      onClick={handleOpenScoredResumes}
                      className="flex items-center gap-2 px-6 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-all text-sm shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
                    >
                      <FileText className="w-4 h-4" />
                      Scored Resumes
                    </button>
                  ) : (
                    <button
                      onClick={() => { if (!canApplyResumeToJob) return; handleApplyToJob(); }}
                      disabled={applyPlanLocked}
                      aria-disabled={!canApplyResumeToJob}
                      title={isArchived ? ARCHIVED_ACTION_MESSAGE : applyPlanLocked ? PLAN_LOCKED_MESSAGE : !canApplyResumeToJob ? 'You do not have permission to score resumes' : undefined}
                      className={`flex items-center gap-2 px-6 py-2 rounded-lg transition-all text-sm ${
                        applyPlanLocked || !canApplyResumeToJob
                          ? `bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed${!canApplyResumeToJob ? ' opacity-60' : ''}`
                          : 'bg-brand-blue hover:bg-brand-blue-2 text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10'
                      }`}
                    >
                      <Send className="w-4 h-4" />
                      Score Resume
                    </button>
                  )}
                </div>

              </div>
            );
          })()}

          {/* Professional Summary */}
          {detailedResume.summary && (
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                  <Star className="w-4 h-4 text-brand-blue" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight">Professional Summary</h3>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{detailedResume.summary}</p>
            </div>
          )}

          {/* Work Experience */}
          {detailedResume.experience.length > 0 && (
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-4 sm:mb-6">
                <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                  <Briefcase className="w-4 h-4 text-brand-blue" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight">Work Experience</h3>
              </div>
              <div className="space-y-6">
                {detailedResume.experience.map((exp, index) => (
                  <div key={index} className="relative pl-6 pb-6 border-l-2 border-brand-blue/30 last:pb-0">
                    <div className="absolute -left-2 top-0 w-4 h-4 rounded-full bg-brand-blue border-2 border-white shadow-sm shadow-brand-blue/30"></div>
                    <div className="mb-3">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="text-sm sm:text-base font-semibold text-gray-900 mb-1">{exp.title}</h4>
                          <div className="flex items-center gap-2 text-sm text-gray-700 mb-1">
                            <Building2 className="w-4 h-4" />
                            <span>{exp.company}</span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-gray-600">
                            {exp.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {exp.location}
                              </span>
                            )}
                            {(exp.startDate || exp.endDate) && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {exp.startDate} - {exp.endDate}
                              </span>
                            )}
                            {exp.duration && (
                              <span className="text-gray-600">({exp.duration})</span>
                            )}
                          </div>
                        </div>
                      </div>
                      {exp.description && (
                        <div className="space-y-1.5 mb-3">
                          {exp.description
                            .split(/(?<=[.!?])\s+|\n+/)
                            .map((point: string) => point.trim())
                            .filter((point: string) => point.length > 0)
                            .map((point: string, pointIndex: number) => (
                              <div key={pointIndex} className="flex items-start gap-2 text-sm text-gray-700">
                                <ChevronRight className="w-4 h-4 text-brand-blue flex-shrink-0 mt-0.5" />
                                <span>{point}</span>
                              </div>
                            ))}
                        </div>
                      )}
                      {exp.achievements && exp.achievements.length > 0 && (
                        <div className="space-y-1.5">
                          {exp.achievements.map((achievement, achIndex) => (
                            <div key={achIndex} className="flex items-start gap-2 text-sm text-gray-700">
                              <ChevronRight className="w-4 h-4 text-brand-cyan flex-shrink-0 mt-0.5" />
                              <span>{achievement}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Education and Skills — one row, two columns where there is room;
              whichever is present alone takes the whole row. Stacked on
              smaller screens. */}
          {(detailedResume.education.length > 0 || detailedResume.skills.technical.length > 0 || detailedResume.skills.soft.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:[&>*:only-child]:col-span-2">
            {/* Education */}
            {detailedResume.education.length > 0 && (
              <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-4 sm:mb-6">
                  <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                    <GraduationCap className="w-4 h-4 text-brand-blue" />
                  </div>
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight">Education</h3>
                </div>
                <div className="space-y-4">
                  {detailedResume.education.map((edu, index) => (
                    <div key={index} className="p-4 bg-slate-50 border border-gray-100 ring-1 ring-black/[0.02] rounded-lg">
                      <h4 className="text-sm sm:text-base font-semibold text-gray-800 mb-1">
                        {edu.degree}
                        {edu.field && ` in ${edu.field}`}
                      </h4>
                      {edu.school && <div className="text-sm text-gray-700 mb-1">{edu.school}</div>}
                      {edu.institution && !edu.school && <div className="text-sm text-gray-700 mb-1">{edu.institution}</div>}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                        {edu.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {edu.location}
                          </span>
                        )}
                        {(edu.year || edu.graduation_year) && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {edu.year || edu.graduation_year}
                          </span>
                        )}
                        {edu.gpa && (
                          <span className="text-gray-700">GPA: {edu.gpa}</span>
                        )}
                        {edu.honors && (
                          <span className="px-2 py-0.5 bg-brand-blue text-white rounded text-xs shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                            {edu.honors}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Skills */}
            {(detailedResume.skills.technical.length > 0 || detailedResume.skills.soft.length > 0) && (
              <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-4 sm:mb-6">
                  <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                    <Code className="w-4 h-4 text-brand-blue" />
                  </div>
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight">Skills</h3>
                </div>

                {/* Technical Skills */}
                {detailedResume.skills.technical.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-gray-900 mb-3">Technical Skills</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {detailedResume.skills.technical.map((skill, index) => (
                        <span key={index} className="inline-flex items-center gap-1 px-2 py-0.5 bg-brand-blue/5 text-brand-blue rounded-md text-xs ring-1 ring-brand-blue/20">
                          <SkillLogo name={skill} />
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Soft Skills */}
                {detailedResume.skills.soft.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-3">Soft Skills</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {detailedResume.skills.soft.map((skill, index) => (
                        <span key={index} className="px-2 py-0.5 bg-brand-blue/5 text-brand-blue rounded-md text-xs ring-1 ring-brand-blue/20">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            </div>
          )}

          {/* Certifications and Languages (with the Social & Portfolio Links) —
              one row, two columns where there
              is room; whichever is present alone takes the whole row.
              Stacked on smaller screens. */}
          {(detailedResume.certifications.length > 0 || detailedResume.languages.length > 0 || (resume.linkedinUrl || resume.githubUrl || resume.portfolioUrl)) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:[&>*:only-child]:col-span-2">
            {/* Certifications */}
            {detailedResume.certifications.length > 0 && (
              <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-9 h-9 rounded-lg bg-brand-orange/10 ring-1 ring-brand-orange/15 flex items-center justify-center">
                    <Award className="w-4 h-4 text-brand-orange" />
                  </div>
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight">Certifications</h3>
                </div>
                <div className={`space-y-2.5 ${detailedResume.certifications.length > 3 ? 'max-h-[15rem] overflow-y-auto pr-1' : ''}`}>
                  {detailedResume.certifications.map((cert, index) => (
                    <div key={index} className="px-3 py-2.5 bg-slate-50 border border-gray-100 ring-1 ring-black/[0.02] rounded-lg">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 [overflow-wrap:anywhere]">
                          <h4 className="text-sm sm:text-base font-semibold text-gray-900 mb-0.5">{cert.name}</h4>
                          {cert.issuer && <div className="text-sm text-gray-700 mb-0.5">{cert.issuer}</div>}
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                            {cert.date && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                Issued {cert.date}
                              </span>
                            )}
                            {cert.credentialId && <span>ID: {cert.credentialId}</span>}
                          </div>
                        </div>
                        <Award className="w-4 h-4 text-brand-orange flex-shrink-0 mt-0.5" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Languages — with the Social & Portfolio Links under them; a
                resume with links but no languages shows the links alone. */}
            {(detailedResume.languages.length > 0 || (resume.linkedinUrl || resume.githubUrl || resume.portfolioUrl)) && (
              <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-4 sm:p-5">
                {detailedResume.languages.length > 0 ? (
                  <>
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-9 h-9 rounded-lg bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center">
                        <Languages className="w-4 h-4 text-brand-cyan" />
                      </div>
                      <h3 className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight">Languages</h3>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {detailedResume.languages.map((lang, index) => (
                    <div key={index} className="px-3 py-2 bg-slate-50 border border-gray-100 ring-1 ring-black/[0.02] rounded-lg text-center min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate" title={lang.name}>{lang.name}</div>
                      <div className="text-xs text-gray-600 truncate">{lang.proficiency}</div>
                    </div>
                  ))}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                      <Globe className="w-4 h-4 text-brand-blue" />
                    </div>
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight">Social &amp; Portfolio Links</h3>
                  </div>
                )}

                {(resume.linkedinUrl || resume.githubUrl || resume.portfolioUrl) && (
                  <div className={detailedResume.languages.length > 0 ? 'mt-4 pt-4 border-t border-gray-100' : ''}>
                    {detailedResume.languages.length > 0 && (
                      <h4 className="flex items-center gap-1.5 text-sm font-medium text-gray-900 mb-2.5">
                        <Globe className="w-3.5 h-3.5 text-brand-blue" />
                        Social &amp; Portfolio Links
                      </h4>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {resume.linkedinUrl && (
                        <a href={resume.linkedinUrl} target="_blank" rel="noopener noreferrer"
                           className="flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors min-w-0 bg-brand-blue/5 border border-brand-blue/20 hover:bg-brand-blue/10 hover:border-brand-blue/30">
                          <SkillLogo name="LinkedIn" className="w-4 h-4" />
                          <span className="text-brand-blue text-xs font-medium truncate">LinkedIn</span>
                          <ExternalLink className="w-3 h-3 text-brand-blue ml-auto flex-shrink-0" />
                        </a>
                      )}
                      {resume.githubUrl && (
                        <a href={resume.githubUrl} target="_blank" rel="noopener noreferrer"
                           className="flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors min-w-0 bg-slate-50 border border-gray-200 hover:bg-slate-100">
                          <SkillLogo name="GitHub" className="w-4 h-4" />
                          <span className="text-gray-700 text-xs font-medium truncate">GitHub</span>
                          <ExternalLink className="w-3 h-3 text-gray-500 ml-auto flex-shrink-0" />
                        </a>
                      )}
                      {resume.portfolioUrl && (
                        <a href={resume.portfolioUrl} target="_blank" rel="noopener noreferrer"
                           className="flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors min-w-0 bg-brand-cyan/5 border border-brand-cyan/20 hover:bg-brand-cyan/10 hover:border-brand-cyan/30">
                          <Globe className="w-4 h-4 text-brand-cyan flex-shrink-0" />
                          <span className="text-brand-cyan text-xs font-medium truncate">Portfolio</span>
                          <ExternalLink className="w-3 h-3 text-brand-cyan ml-auto flex-shrink-0" />
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            </div>
          )}

          {/* Projects */}
          {resume.projects && resume.projects.length > 0 && (
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-4 sm:mb-6">
                <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                  <Code className="w-4 h-4 text-brand-blue" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight">Projects</h3>
              </div>
              <div className="space-y-4">
                {resume.projects.map((project: any, index: number) => (
                  <div key={index} className="p-4 bg-slate-50 border border-gray-100 ring-1 ring-black/[0.02] rounded-lg">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="text-sm sm:text-base font-semibold text-gray-900">{project.name}</h4>
                      {project.url && (
                        <a href={project.url} target="_blank" rel="noopener noreferrer" className="text-brand-blue hover:text-brand-blue-2">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                    {project.description && (
                      <p className="text-gray-700 text-sm mb-2">{project.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                      {project.duration && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {project.duration}
                        </span>
                      )}
                      {project.technologies && (
                        <span className="px-2 py-0.5 bg-brand-blue/10 text-brand-blue rounded ring-1 ring-brand-blue/20">{project.technologies}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Awards */}
          {resume.awards && resume.awards.length > 0 && (
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-4 sm:mb-6">
                <div className="w-9 h-9 rounded-lg bg-brand-orange/10 ring-1 ring-brand-orange/15 flex items-center justify-center">
                  <Award className="w-4 h-4 text-brand-orange" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight">Awards & Honors</h3>
              </div>
              <div className="space-y-4">
                {resume.awards.map((award: any, index: number) => (
                  <div key={index} className="p-4 bg-slate-50 border border-gray-100 ring-1 ring-black/[0.02] rounded-lg">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-sm sm:text-base font-semibold text-gray-900 mb-1">{award.name}</h4>
                        {award.issuer && <div className="text-sm text-gray-700">{award.issuer}</div>}
                        {award.date && (
                          <div className="text-xs text-gray-600 flex items-center gap-1 mt-1">
                            <Calendar className="w-3 h-3" />
                            {award.date}
                          </div>
                        )}
                        {award.description && (
                          <p className="text-sm text-gray-600 mt-2">{award.description}</p>
                        )}
                      </div>
                      <Award className="w-6 h-6 text-brand-orange" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Achievements */}
          {resume.achievements && resume.achievements.length > 0 && (
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-4 sm:mb-6">
                <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                  <Star className="w-4 h-4 text-brand-blue" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight">Achievements</h3>
              </div>
              <div className="space-y-2">
                {/* param is not just `string`: the render below branches on the object form
                    (achievement.description / .name), and the source field is typed
                    `any[]`. Annotating it `string` narrowed the else-branch to `never`. */}
                {resume.achievements.map((achievement: string | { description?: string; name?: string }, index: number) => (
                  <div key={index} className="flex items-start gap-2 text-gray-700">
                    <ChevronRight className="w-4 h-4 text-brand-blue flex-shrink-0 mt-0.5" />
                    <span>{typeof achievement === 'string' ? achievement : achievement.description || achievement.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Volunteer Experience */}
          {resume.volunteerExperience && resume.volunteerExperience.length > 0 && (
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-4 sm:mb-6">
                <div className="w-9 h-9 rounded-lg bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center">
                  <User className="w-4 h-4 text-brand-cyan" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight">Volunteer Experience</h3>
              </div>
              <div className="space-y-4">
                {resume.volunteerExperience.map((vol: any, index: number) => (
                  <div key={index} className="p-4 bg-slate-50 border border-gray-100 ring-1 ring-black/[0.02] rounded-lg">
                    <h4 className="text-sm sm:text-base font-semibold text-gray-900 mb-1">{vol.role || vol.title}</h4>
                    {vol.organization && <div className="text-sm text-gray-700 mb-1">{vol.organization}</div>}
                    {vol.duration && (
                      <div className="text-xs text-gray-600 flex items-center gap-1 mb-2">
                        <Calendar className="w-3 h-3" />
                        {vol.duration}
                      </div>
                    )}
                    {vol.description && <p className="text-sm text-gray-600">{vol.description}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hobbies & Interests */}
          {resume.hobbies && resume.hobbies.length > 0 && (
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-4 sm:mb-6">
                <div className="w-9 h-9 rounded-lg bg-brand-orange/10 ring-1 ring-brand-orange/15 flex items-center justify-center">
                  <Star className="w-4 h-4 text-brand-orange" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight">Hobbies & Interests</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {resume.hobbies.map((hobby: string | { name?: string }, index: number) => (
                  <span key={index} className="px-2 py-0.5 bg-brand-blue/5 text-brand-blue rounded-md text-xs ring-1 ring-brand-blue/20">
                    {typeof hobby === 'string' ? hobby : ((hobby.name || hobby) as React.ReactNode)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Objective (if different from summary) */}
          {resume.objective && resume.objective !== resume.professionalSummary && (
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-brand-blue" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight">Career Objective</h3>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">{resume.objective}</p>
            </div>
          )}

          {/* Additional Information */}
          {resume.additionalInfo && (
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-brand-blue" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight">Additional Information</h3>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{resume.additionalInfo}</p>
            </div>
          )}

          {/* Full Resume Content - Hidden as per requirement, showing AI-extracted sections above instead */}
          {/* {resume.extractedText && (
            <FullResumeContent text={resume.extractedText} />
          )} */}

          {/* Version History */}
          {resume.versions && resume.versions.length > 0 && (
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-4 sm:p-6">
              <div className="flex items-center gap-2 gap-y-2 mb-6 flex-wrap">
                <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center shrink-0">
                  <History className="w-4 h-4 text-brand-blue" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight whitespace-nowrap">Version History</h3>
                <span className="px-2.5 py-0.5 bg-brand-blue/10 text-brand-blue rounded-full text-xs ring-1 ring-brand-blue/20 shrink-0 whitespace-nowrap">
                  {resume.versions.length} version{resume.versions.length !== 1 ? 's' : ''}
                </span>
                {resume.versions.length > 1 && (
                  <button
                    /* Wrapped: as a bare handler React passes the MouseEvent as `leftId`.
                       `rightId` stays undefined either way, so the leftId && rightId guard
                       is false and both forms reach the compareChecked branch. */
                    onClick={() => openCompareModal()}
                    disabled={compareChecked.length !== 2}
                    className={`ml-auto px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      compareChecked.length === 2
                        ? 'bg-brand-blue hover:bg-brand-blue-2 text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10'
                        : 'bg-slate-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {compareChecked.length === 2
                      ? 'Compare Selected'
                      : compareChecked.length === 1
                        ? 'Select 1 more to compare'
                        : 'Select 2 versions to compare'}
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {(() => {
                  const sortedVersions = [...resume.versions].sort((a, b) => (b.version || 0) - (a.version || 0));
                  return sortedVersions.map((version, index) => {
                    const isLatest = index === 0;
                    const versionNumber = version.version || (resume.versions.length - index);
                    const previousVersion = index < sortedVersions.length - 1 ? sortedVersions[index + 1] : null;

                    return (
                      <div key={version.id} className={`rounded-lg border transition-all ${
                        isLatest
                          ? 'bg-brand-blue/5 border-brand-blue/30 ring-1 ring-brand-blue/10'
                          : 'bg-slate-50 border-gray-100 ring-1 ring-black/[0.02]'
                      }`}>
                        <div className="p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              {/* Compare checkbox */}
                              {resume.versions.length > 1 && (
                                <label className="flex items-center cursor-pointer flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={compareChecked.includes(version.id)}
                                    onChange={() => handleCompareCheck(version.id)}
                                    className="w-4 h-4 rounded border-gray-300 text-brand-blue focus:ring-brand-blue/40 cursor-pointer"
                                  />
                                </label>
                              )}
                              <div className={`p-2 rounded-lg ${
                                isLatest ? 'bg-brand-blue/10 ring-1 ring-brand-blue/20' : 'bg-white ring-1 ring-gray-200'
                              }`}>
                                <FileText className={`w-4 h-4 ${
                                  isLatest ? 'text-brand-blue' : 'text-gray-600'
                                }`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`text-sm font-semibold ${isLatest ? 'text-brand-blue' : 'text-gray-900'}`}>
                                    Version {versionNumber}
                                  </span>
                                  {isLatest && (
                                    <span className="px-2 py-0.5 bg-brand-blue text-white rounded text-xs flex-shrink-0 shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                                      Latest
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-gray-500 mb-1 truncate">{version.name}</div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-600">
                                  <span className="flex items-center gap-1 whitespace-nowrap">
                                    <Clock className="w-3 h-3 shrink-0" />
                                    {formatIST(version.uploadDate)}
                                  </span>
                                  <span className="text-gray-300">•</span>
                                  <span className="whitespace-nowrap">{version.size}</span>
                                  <span className="text-gray-300">•</span>
                                  <span className="flex items-center gap-1 whitespace-nowrap min-w-0">
                                    <User className="w-3 h-3 shrink-0" />
                                    <span className="truncate">{version.uploadedBy}</span>
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                              {/* View Changes - opens popup comparing to previous version */}
                              {previousVersion && (
                                <button
                                  onClick={() => openCompareModal(previousVersion.id, version.id)}
                                  className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 bg-white border border-gray-200 text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue"
                                >
                                  <History className="w-3 h-3" />
                                  View Changes
                                </button>
                              )}
                              {!previousVersion && (
                                <span className="px-3 py-1.5 text-xs text-gray-400 italic">First version</span>
                              )}
                              {/* View (preview) button */}
                              <button
                                onClick={() => handleVersionPreview(version.id, `Version ${versionNumber}`)}
                                className={`p-2 rounded-md transition-colors ${
                                  isLatest
                                    ? 'text-brand-blue hover:bg-brand-blue/10'
                                    : 'text-gray-600 hover:bg-brand-blue/5 hover:text-brand-blue'
                                }`}
                                aria-label="View resume" title="View resume"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              {/* Download button */}
                              <button
                                onClick={async () => {
                                  try {
                                    const blob = await resumeService.download(version.id);
                                    const url = window.URL.createObjectURL(blob);
                                    const link = document.createElement('a');
                                    link.href = url;
                                    link.download = version.fileName || version.name || `resume-v${versionNumber}.pdf`;
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                    window.URL.revokeObjectURL(url);
                                  } catch (err) {
                                    toast.error('Failed to download version');
                                  }
                                }}
                                className={`p-2 rounded-md transition-colors ${
                                  isLatest
                                    ? 'text-brand-blue hover:bg-brand-blue/10'
                                    : 'text-gray-600 hover:bg-brand-blue/5 hover:text-brand-blue'
                                }`}
                                title="Download this version"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {/* Candidate Activity — the page's last section: scores, AI Talent
              Match, AI Assessment and AI Interview history for this
              candidate, gated per module. Its header's file icon opens the
              File Properties drawer. */}
          <CandidateActivityCard
            resumeId={resumeId}
            // This page's own trail, so a result opened from the card keeps
            // "Dashboard › Resume Database › My Resumes › <candidate>".
            trail={[
              ...sourceCrumbs.filter((c): c is { label: string; href: string } => !!c.href),
              { label: resume?.name || 'Resume Details', href: `/recruitment/resume-view/${resumeId}${sourceQuery}` },
            ]}
            /* File Properties — the icon that opens its drawer. */
            headerAction={
              <button
                type="button"
                onClick={() => setShowFileProperties(true)}
                aria-label="File Properties"
                title="File Properties"
                aria-expanded={showFileProperties}
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/15 hover:bg-brand-blue/20 hover:ring-brand-blue/30 transition-colors"
              >
                <File className="w-4 h-4" />
              </button>
            }
          />

        </div>
      </div>

      {/* File Properties drawer — enters from the right edge and leaves the
          same way; the backdrop fades with it. Closes on the backdrop, Escape
          or Close. */}
      <div
        className={`fixed inset-0 z-50 ${showFileProperties ? '' : 'pointer-events-none'}`}
        aria-hidden={!showFileProperties}
      >
        <div
          className={`absolute inset-0 bg-gray-900/40 backdrop-blur-[1px] transition-opacity duration-300 ${showFileProperties ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setShowFileProperties(false)}
        />
        <aside
          role="dialog"
          aria-modal={showFileProperties}
          aria-label="File Properties"
          className={`absolute inset-y-0 right-0 w-full max-w-sm bg-white shadow-2xl flex flex-col transform transition-transform duration-300 ease-out ${
            showFileProperties ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex-shrink-0 flex items-center gap-2 px-5 py-4 border-b border-gray-100 bg-slate-50">
            <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
              <File className="w-4 h-4 text-brand-blue" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 tracking-tight">File Properties</h3>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-5">
            <div className="grid grid-cols-1 gap-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg">
                    <FileText className="w-4 h-4 text-brand-blue" />
                  </div>
                  {/* min-w-0 + anywhere-wrap: a long underscore-joined file
                      name has no break points and ran out of the drawer. */}
                  <div className="min-w-0">
                    <div className="text-xs text-gray-500 mb-1">File Name</div>
                    <div className="text-sm text-gray-900 [overflow-wrap:anywhere]">{resume.fileName || `${resume.name.replace(' ', '_')}_Resume.pdf`}</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg">
                    <HardDrive className="w-4 h-4 text-brand-blue" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">File Size</div>
                    <div className="text-sm text-gray-900">
                      {resume.fileSizeKb ? `${resume.fileSizeKb} KB` :
                        (resume.versions && resume.versions.length > 0
                          ? resume.versions[0].size
                          : 'Unknown')}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg">
                    <File className="w-4 h-4 text-brand-blue" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">File Type</div>
                    <div className="text-sm text-gray-900">{resume.fileType?.toUpperCase() || 'PDF'} Document</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg">
                    <Calendar className="w-4 h-4 text-brand-blue" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Upload Date</div>
                    <div className="text-sm text-gray-900">
                      {formatIST(resume.uploadDate)}
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg">
                    <Clock className="w-4 h-4 text-brand-blue" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Last Modified</div>
                    <div className="text-sm text-gray-900">
                      {resume.lastUpdated
                        ? formatIST(resume.lastUpdated)
                        : 'Never'}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg">
                    <User className="w-4 h-4 text-brand-blue" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Uploaded By</div>
                    <div className="text-sm text-gray-900">
                      {resume.uploadedBy === 'current-user' ? 'You' : resume.uploadedBy}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg">
                    <FileText className="w-4 h-4 text-brand-blue" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Total Attachments</div>
                    <div className="text-sm text-gray-900">
                      {resume.attachments} file{resume.attachments !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg">
                    <History className="w-4 h-4 text-brand-blue" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Version Count</div>
                    <div className="text-sm text-gray-900">
                      {resume.versionCount || (resume.versions ? resume.versions.length : 1)} version{(resume.versionCount || (resume.versions ? resume.versions.length : 1)) !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex-shrink-0 flex justify-end px-5 py-3 border-t border-gray-200 bg-gray-50">
            <Button variant="secondary" onClick={() => setShowFileProperties(false)} className="!h-9">
              Close
            </Button>
          </div>
        </aside>
      </div>

      {/* Version Compare Modal — shared with the version-history popup on the
          resume lists, so a diff reads the same wherever it is opened from. */}
      {showCompareModal && compareLeftId && compareRightId && resume?.versions && (() => {
        const leftVersion = resume.versions.find(v => v.id === compareLeftId);
        const rightVersion = resume.versions.find(v => v.id === compareRightId);
        if (!leftVersion || !rightVersion) return null;
        return (
          <VersionCompareModal
            older={{ version: leftVersion.version, name: leftVersion.name, text: leftVersion.extractedText }}
            newer={{ version: rightVersion.version, name: rightVersion.name, text: rightVersion.extractedText }}
            onClose={() => {
              setShowCompareModal(false);
              setCompareChecked([]);
            }}
          />
        );
      })()}

      {/* Version Preview Modal — same ResumeTextPreviewModal the share dialog's
          attachment preview uses, so "View" shows the actual file (PDF inline,
          Word via docx-preview) instead of a reformatted guess at its layout. */}
      {versionPreviewUrl && (() => {
        const previewVersion = resume?.versions?.find(v => v.id === versionPreviewUrl);
        return (
          <ResumeTextPreviewModal
            resumeId={versionPreviewUrl}
            title={versionPreviewLabel}
            subtitle={previewVersion?.fileName || previewVersion?.name || resume?.fileName}
            onClose={() => {
              setVersionPreviewUrl(null);
              setVersionPreviewLabel('');
            }}
          />
        );
      })()}

      {/* Version Selection Modal for Apply to Job */}
      {showVersionSelectModal && resume && resume.versions && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-[95vw] sm:max-w-2xl max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden animate-scale-in">
            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between gap-3 p-4 sm:p-6 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-blue flex items-center justify-center shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                  <History className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 tracking-tight">Select Resume Version</h2>
                  <p className="text-sm text-gray-600">Choose which version to apply for the job</p>
                </div>
              </div>
              <button
                onClick={() => setShowVersionSelectModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
               aria-label="Close">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Version List */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
              {/* min-w-0 + wrap on each version row: the long file names and
                  the date · size · uploader line ran out of the card on phones. */}
              <div className="space-y-3">
                {/* Current Version */}
                <label
                  className={`block p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    selectedVersionForApply === resumeId
                      ? 'border-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue/20'
                      : 'border-gray-200 hover:border-brand-blue/30 hover:bg-brand-blue/[0.02]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="version"
                      checked={selectedVersionForApply === resumeId}
                      onChange={() => setSelectedVersionForApply(resumeId)}
                      className="w-4 h-4 text-brand-blue border-gray-300 focus:ring-brand-blue/40"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <File className="w-4 h-4 text-gray-500" />
                        <span className="min-w-0 font-medium text-gray-900 [overflow-wrap:anywhere]">{resume.fileName || 'Current Version'}</span>
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">Current</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 mt-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {resume.uploadDate ? formatISTDate(resume.uploadDate) : 'N/A'}
                        </span>
                        {resume.fileSizeKb && (
                          <span className="flex items-center gap-1">
                            <HardDrive className="w-3 h-3" />
                            {resume.fileSizeKb} KB
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {resume.uploadedBy}
                        </span>
                      </div>
                    </div>
                  </div>
                </label>

                {/* Previous Versions */}
                {resume.versions.filter(v => v.id !== resumeId).map((version, index) => (
                  <label
                    key={version.id}
                    className={`block p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedVersionForApply === version.id
                        ? 'border-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue/20'
                        : 'border-gray-200 hover:border-brand-blue/30 hover:bg-brand-blue/[0.02]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="version"
                        checked={selectedVersionForApply === version.id}
                        onChange={() => setSelectedVersionForApply(version.id)}
                        className="w-4 h-4 text-brand-blue border-gray-300 focus:ring-brand-blue/40"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <File className="w-4 h-4 text-gray-400" />
                          <span className="whitespace-nowrap font-medium text-gray-700">Version {version.version || (resume.versions.length - index)}</span>
                          <span className="min-w-0 text-xs text-gray-500 [overflow-wrap:anywhere]">({version.name})</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 mt-1">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {version.uploadDate ? formatISTDate(version.uploadDate) : 'N/A'}
                          </span>
                          {version.size && (
                            <span className="flex items-center gap-1">
                              <HardDrive className="w-3 h-3" />
                              {version.size}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {version.uploadedBy}
                          </span>
                        </div>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 flex items-center justify-end gap-3 p-4 sm:p-6 border-t border-gray-100 bg-slate-50">
              <button
                onClick={() => selectedVersionForApply && handleVersionSelectForApply(selectedVersionForApply)}
                disabled={!selectedVersionForApply}
                className="px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
              >
                <Send className="w-4 h-4" />
                Continue to Score Resume
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Apply to Job Modal */}
      {isApplyToJobModalOpen && resume && (
        <ApplyToJobModal
          resumes={[resume]}
          jobs={publishedJobs}
          mode="scoring"
          stayOnCurrentPage
          fixedJob={aiMatchScoringJob ?? undefined}
          /* The Resume DB's Score Resume job list: Archived / Disabled shown
             greyed and unpickable, the Job Eligibility note, candidate counts. */
          excludeDraftsOnly
          onClose={() => {
            setIsApplyToJobModalOpen(false);
            setSelectedVersionForApply(null);
          }}
          onApply={handleApplyToJobSubmit}
        />
      )}

      {scoringBatchId && scoringRun && (
        <BulkScoringProgressModal
          progressData={scoringModalItems}
          showScoreColumn
          // A scored row's View: its scorecard; the name opens the resume here.
          onViewResult={(item) => {
            if (!item.jobId || !item.resumeId) return;
            setScoringBatchId(null);
            router.push(scorecardUrl(item.jobId, item.resumeId));
          }}
          onOpenResume={(id) => { setScoringBatchId(null); router.push(`/recruitment/resume-view/${id}`); }}
          onMinimize={() => {
            setScoringBatchId(null);
            scoringProgress.setMinimized(true);
          }}
          onClose={() => {
            // A finished run goes; one still going stays in the corner widget.
            if (scoringRun.queued === 0 && scoringRun.processing === 0) scoringProgress.clearJob(scoringRun.jobId);
            else scoringProgress.setMinimized(true);
            setScoringBatchId(null);
          }}
        />
      )}

      {/* View Score Table — the Scored Resumes tab's ⋮ › View Score Table popup. */}
      {scoreTableResume && (
        <ScoreTableModal
          resume={scoreTableResume}
          jobId={jobDetailsJobId ?? undefined}
          jobCode={jobForInvite?.jdCode}
          jobTitle={jobForInvite?.jdTitle || jobDetailsTitle}
          onClose={() => setScoreTableResume(null)}
          header={scoreTableHeader ?? {}}
        />
      )}

      {/* Create / Send Assessment | AI Interview — Job Details' popup. */}
      <JobInviteDialogHost request={inviteRequest} onClose={() => setInviteRequest(null)} />

      {/* AI Talent Match Modal */}
      {showAITalentMatchModal && resume && (
        <AITalentMatchSelectJobModal
          resumes={[resume]}
          jobs={publishedJobs}
          stayOnCurrentPage
          confirmLabel="Run AI Talent Match"
          onClose={() => setShowAITalentMatchModal(false)}
          onMatch={(resumeIds, jobId, jobRecord) => {
            if (resumeIds.length === 0) return;
            /* The dialog reads the job list itself, so take the record it hands
               back; the local list is only a fallback for a job that was
               already loaded here. */
            const selectedJob = jobRecord || publishedJobs.find(job => job.id === jobId);

            if (!selectedJob) {
              toast.error('Selected job is no longer available');
              return;
            }

            setShowAITalentMatchModal(false);
            setAiTalentMatchJob(selectedJob);
          }}
        />
      )}

      {/* AI Talent Match Progress - stays on the resume-view page */}
      {aiTalentMatchJob && (
        <AITalentMatchProgressPanel
          jobTitle={aiTalentMatchJob.title}
          jobId={aiTalentMatchJob.id}
          onComplete={() => {
            toast.success(formatJobActionMessage(aiTalentMatchJob, 'run'));
            setAiTalentMatchJob(null);
          }}
          onError={(error) => {
            toast.error(error || 'Failed to run AI Talent Match');
            setAiTalentMatchJob(null);
          }}
        />
      )}

      {/* Share via Email Modal */}
      {isShareModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-[95vw] sm:max-w-2xl w-full max-h-[90dvh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-brand-blue rounded-xl flex items-center justify-center shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                    <Mail className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 tracking-tight">Share Resume</h2>
                    <p className="text-sm text-gray-500">The selected candidate&rsquo;s resume will be shared with the recipient via email.</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsShareModalOpen(false);
                    setShareEmail('');
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                 aria-label="Close">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="space-y-4">
                {/* What actually goes out with the email — the candidate's
                    resume file, with the eye to read it before sending. */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Attachment</label>
                  {(() => {
                    const row = resume as any;
                    const fileName = row?.fileName || `${resume?.name || 'resume'}.${row?.fileType || 'pdf'}`;
                    const fileType = (row?.fileType || fileName.split('.').pop() || '').toUpperCase();
                    const sizeKb = row?.fileSizeKb ?? row?.file_size_kb;
                    return (
                      <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-200 bg-gray-50">
                        <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                          <FileText className="w-4 h-4 text-brand-blue" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-gray-900 truncate" title={fileName}>
                            {fileName}
                          </div>
                          <div className="text-xs text-gray-500">
                            {resume?.name}
                            {fileType && <> &middot; {fileType}</>}
                            {sizeKb ? <> &middot; {Math.round(sizeKb)} KB</> : null}
                          </div>
                        </div>
                        <Paperclip className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <button
                          type="button"
                          onClick={() => setIsSharePreviewOpen(true)}
                          className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-brand-blue hover:bg-brand-blue/10 transition-colors"
                          aria-label={`View ${resume?.name || 'the'} resume`}
                          title="View resume"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })()}
                </div>

                {/* Email Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Recipient Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={shareEmail}
                    onChange={(e) => setShareEmail(e.target.value)}
                    placeholder="Enter email address"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue outline-none transition-all"
                  />
                </div>

                {/* Subject Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Subject
                  </label>
                  <input
                    type="text"
                    value={shareSubject}
                    onChange={(e) => setShareSubject(e.target.value)}
                    placeholder="Email subject"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue outline-none transition-all"
                  />
                </div>

                {/* Message Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Message
                  </label>
                  <textarea
                    value={shareMessage}
                    onChange={(e) => setShareMessage(e.target.value)}
                    placeholder="Enter your message"
                    rows={8}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue outline-none transition-all resize-none"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                <button
                  onClick={handleSendEmail}
                  disabled={isSendingEmail || !shareEmail.trim()}
                  className="flex items-center gap-2 px-6 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
                >
                  {isSendingEmail ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Send Email
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* The attachment, read in place. Rendered after the share dialog so it
          sits above it — both are z-50. */}
      {isSharePreviewOpen && resume && (
        <ResumeTextPreviewModal
          resumeId={resumeId}
          title={resume.name}
          subtitle={(resume as any).fileName}
          onClose={() => setIsSharePreviewOpen(false)}
        />
      )}
        </div>
      </div>
    </main>
  );
}
