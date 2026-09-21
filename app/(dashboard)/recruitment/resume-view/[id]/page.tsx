'use client'

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { formatIST, formatISTDate } from '@/lib/utils/dateUtils';
import VersionCompareModal from '@/components/VersionCompareModal';
import RecordPager from '@/components/RecordPager';
import {
  ArrowLeft, Download, Mail, Phone, MapPin, Briefcase, Calendar, Award,
  Languages, Star, Edit2, Trash2, Send, Building2, GraduationCap, Code,
  ChevronRight, ExternalLink, Linkedin, Globe, FileText, Clock, History,
  User, File, HardDrive, Loader2, Share2, Copy, Check, ChevronDown, ChevronUp,
  AlignLeft, Hash, X, Eye, UserPlus, Sparkles, Search, Database, Paperclip
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
import { scoringService, BatchScoringStatus } from '@/lib/services/scoringService';
import ApplyToJobModal from '@/components/ApplyToJobModal';
import AITalentMatchSelectJobModal from '@/components/AITalentMatchSelectJobModal';
import AITalentMatchProgressPanel from '@/components/AITalentMatchProgressPanel';
import ScoringJobProgressModal, { JobScoringProgress } from '@/components/ScoringJobProgressModal';
import ShareAssessmentModal from '@/components/ShareAssessmentModal';
import ResumeTextPreviewModal from '@/components/ResumeTextPreviewModal';
import ShareAIInterviewModal from '@/components/ai-interview/ShareAIInterviewModal';
import { toast } from 'sonner';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
import { useAuth } from '@/lib/hooks/useAuth';
import { usePlanFeatures } from '@/lib/hooks/usePlanFeature';
import PageBreadcrumb from '@/components/PageBreadcrumb';

export default function ResumeViewPage() {
  const params = useParams();
  const router = useRouter();
  const dialog = useGlobalDialog();
  const { isTenantAdmin, hasPermission, hasPermissionCode } = useAuth();
  const { hasPlanFeature } = usePlanFeatures();
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
  // to the right place ("My Resumes" vs "Internal Database"). The originating
  // list stores this in sessionStorage as `resumeNavSource`.
  const [viewSource, setViewSource] = useState<'my-resumes' | 'resume-database' | 'ai-talent-match' | 'job-details'>('resume-database');
  const [jobDetailsReturnUrl, setJobDetailsReturnUrl] = useState<string | null>(null);
  const [jobDetailsTitle, setJobDetailsTitle] = useState('');
  const [aiMatchDetailsReturnUrl, setAiMatchDetailsReturnUrl] = useState<string | null>(null);
  const [aiMatchJobTitle, setAiMatchJobTitle] = useState('');
  useEffect(() => {
    try {
      const s = sessionStorage.getItem('resumeNavSource');
      if (s === 'my-resumes' || s === 'resume-database' || s === 'ai-talent-match' || s === 'job-details') {
        setViewSource(s);
      }

      const jobId = sessionStorage.getItem('resumeNavJobId');
      const jobTab = sessionStorage.getItem('resumeNavJobTab') || 'scored-resumes';
      if (jobId) {
        setJobDetailsReturnUrl(`/recruitment/job-details?id=${encodeURIComponent(jobId)}&tab=${encodeURIComponent(jobTab)}`);
        // The crumb reads as the job the candidate was opened from.
        setJobDetailsTitle(sessionStorage.getItem('resumeNavJobTitle') || '');
      }

      const aiMatchJobId = sessionStorage.getItem('resumeNavAIMatchJobId');
      if (aiMatchJobId) {
        setAiMatchDetailsReturnUrl(`/recruitment/ai-talent-match?jdId=${encodeURIComponent(aiMatchJobId)}&view=details`);
        // The crumb reads as the job the candidate was matched against.
        setAiMatchJobTitle(sessionStorage.getItem('resumeNavAIMatchJobTitle') || '');
      }
    } catch { /* ignore */ }
  }, []);
  const sourceCrumbs =
    viewSource === 'my-resumes' ? [{ label: 'My Resumes', href: '/recruitment/my-resumes' }]
    // The "Match Details" step only exists when the resume was opened from a
    // specific job's match list. The candidate roll-up spans jobs and stores no
    // job id, so it goes straight from AI Talent Match to the candidate.
    : viewSource === 'ai-talent-match' ? [
      { label: 'AI Talent Match', href: '/recruitment/ai-talent-match' },
      ...(aiMatchDetailsReturnUrl
        ? [{ label: aiMatchJobTitle || 'Match Details', href: aiMatchDetailsReturnUrl }]
        : []),
    ]
    // Every step the recruiter walked, not just the last one: the jobs list,
    // then the job itself. "Scored Resumes" alone named a tab rather than the
    // record, and skipped the list the job was reached from.
    : viewSource === 'job-details' ? [
      { label: 'Job Descriptions', href: '/recruitment/job-openings' },
      { label: jobDetailsTitle || 'Job Details', href: jobDetailsReturnUrl || '/recruitment/job-openings' },
    ]
    : [{ label: 'Internal Database', href: '/recruitment/resume-database' }];

  // Apply to Job modal state
  const [isApplyToJobModalOpen, setIsApplyToJobModalOpen] = useState(false);
  const [publishedJobs, setPublishedJobs] = useState<Job[]>([]);
  const [showAITalentMatchModal, setShowAITalentMatchModal] = useState(false);
  const [aiTalentMatchJob, setAiTalentMatchJob] = useState<Job | null>(null);
  const [showScoringProgressModal, setShowScoringProgressModal] = useState(false);
  const [isScoringProgressMinimized, setIsScoringProgressMinimized] = useState(false);
  const [scoringProgressData, setScoringProgressData] = useState<JobScoringProgress[]>([]);
  const [scoringProgressKey, setScoringProgressKey] = useState(0);
  const scoringPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const canShareResume = isTenantAdmin || hasPermissionCode('my_resumes:share');
  const canDeleteResume = isTenantAdmin || hasPermission('canDeleteResumes') || hasPermissionCode('my_resumes:delete');
  const canApplyResumeToJob =
    hasPlanFeature('resume_scoring') &&
    (isTenantAdmin || (hasPermission('canRunScoring') && hasPermissionCode('my_resumes:apply_job')));
  const hasAITalentMatchSourcePermission =
    viewSource === 'resume-database'
      ? hasPermissionCode('internal_db:ai_match')
      : viewSource === 'my-resumes'
        ? hasPermissionCode('my_resumes:ai_match')
        : true;
  const canRunAITalentMatch =
    hasPlanFeature('ai_talent_match') &&
    (isTenantAdmin || (hasPermission('canRunAiMatch') && hasAITalentMatchSourcePermission));

  // ── Invite (Assessment / AI Interview) ──────────────────────────────────
  // Same two flows the Resume Scoring candidate page offers. A resume has no
  // job context here, so the user picks the JD first.
  const canInviteAssessment = (isTenantAdmin || hasPermission('canCreateAssessments')) && hasPlanFeature('assessment');
  const canInviteAIInterview =
    (isTenantAdmin || hasPermission('canShareAIInterviews') || hasPermission('canInviteAIInterviews')) &&
    hasPlanFeature('ai_interview');
  const canInvite = canInviteAssessment || canInviteAIInterview;

  const [showInviteMenu, setShowInviteMenu] = useState(false);
  const inviteMenuRef = useRef<HTMLDivElement>(null);
  const [inviteIntent, setInviteIntent] = useState<'assessment' | 'ai-interview' | null>(null);
  const [showInviteJobPicker, setShowInviteJobPicker] = useState(false);
  const [inviteJobQuery, setInviteJobQuery] = useState('');
  const [loadingInvite, setLoadingInvite] = useState(false);
  const [shareAssessments, setShareAssessments] = useState<any[]>([]);
  const [showShareAssessmentModal, setShowShareAssessmentModal] = useState(false);
  const [shareAIConfig, setShareAIConfig] = useState<any>(null);
  const [inviteJobTitle, setInviteJobTitle] = useState('');

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

  const startInvite = async (intent: 'assessment' | 'ai-interview') => {
    setShowInviteMenu(false);
    setInviteIntent(intent);
    setInviteJobQuery('');
    if (publishedJobs.length === 0) await fetchPublishedJobs();
    setShowInviteJobPicker(true);
  };

  // Assessment invite for the chosen JD — mirrors the JD page's rules: only
  // published, non-revoked assessments can be invited to.
  const openAssessmentInvite = async (job: Job) => {
    setLoadingInvite(true);
    try {
      const { assessmentService } = await import('@/lib/services/assessmentService');
      const { isAssessmentRevoked, getLocallyRevokedAssessmentIds } = await import('@/lib/utils/assessmentUtils');
      const resp = await assessmentService.list({ jd_id: job.id, status: 'published', page_size: 100 });
      const revokedIds = getLocallyRevokedAssessmentIds();
      const items: any[] = (resp?.items || []).filter((a: any) => {
        const status = String(a?.status || '').toLowerCase();
        if (status !== 'published' && status !== 'active') return false;
        return !isAssessmentRevoked(a, revokedIds);
      });

      if (items.length === 0) {
        toast.error(`No invitable assessment is available for "${job.title}".`, { duration: 6000 });
        return;
      }
      setShareAssessments(items);
      setInviteJobTitle(job.title);
      setShowShareAssessmentModal(true);
      setShowInviteJobPicker(false);
    } catch (err) {
      console.error('[ResumeView] Failed to load assessments:', err);
      toast.error('Could not load assessments. Please try again.');
    } finally {
      setLoadingInvite(false);
    }
  };

  // AI interview invite — needs a published interview config on that JD.
  const openAIInterviewInvite = async (job: Job) => {
    setLoadingInvite(true);
    try {
      const { aiInterviewService } = await import('@/lib/services/aiInterviewService');
      const resp = await aiInterviewService.list({ page_size: 100 });
      const published = (resp?.items || []).find((c: any) => {
        const status = String(c?.status || '').toLowerCase();
        return c.jd_id === job.id && (status === 'published' || status === 'active');
      });

      if (!published) {
        toast.error(`Create and publish an AI interview for "${job.title}" before inviting candidates.`, { duration: 6000 });
        return;
      }
      setShareAIConfig(published);
      setShowInviteJobPicker(false);
    } catch (err) {
      console.error('[ResumeView] Failed to load AI interviews:', err);
      toast.error('Could not load AI interviews. Please try again.');
    } finally {
      setLoadingInvite(false);
    }
  };

  const handleInviteJobPicked = (job: Job) => {
    if (inviteIntent === 'assessment') openAssessmentInvite(job);
    else if (inviteIntent === 'ai-interview') openAIInterviewInvite(job);
  };

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

  // State for fetched preview text (when extractedText not pre-loaded)
  const [fetchedPreviewText, setFetchedPreviewText] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Preview a specific version or resume in modal
  const handleVersionPreview = async (versionId: string, label: string) => {
    // Check if extracted text is already available
    const version = resume?.versions?.find(v => v.id === versionId);
    const existingText = version?.extractedText || (versionId === resumeId ? resume?.extractedText : null);

    if (existingText) {
      setFetchedPreviewText(null);
      setVersionPreviewLabel(label);
      setVersionPreviewUrl(versionId);
      return;
    }

    // Not available - fetch from API
    setPreviewLoading(true);
    setVersionPreviewLabel(label);
    try {
      // User explicitly asked to preview this version, so it counts as a
      // real view for the Audit Log.
      const data = await resumeService.get(versionId, true);
      if (data?.extracted_text) {
        setFetchedPreviewText(data.extracted_text);
        setVersionPreviewUrl(versionId);
      } else {
        setFetchedPreviewText('');
        setVersionPreviewUrl(versionId);
        toast.info('Preview not available for this file.');
      }
    } catch (err) {
      console.error('Failed to fetch preview text:', err);
      toast.error('Failed to load preview');
    } finally {
      setPreviewLoading(false);
    }
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
    name: r.candidate_name || r.file_name?.replace(/\.[^/.]+$/, '') || 'Unknown',
    email: r.email || 'No email',
    phone: r.phone || 'No phone',
    title: r.current_title || 'N/A',
    experience: r.experience_years ? `${r.experience_years} years` : 'N/A',
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
      toast.error(error?.message || 'Failed to send email');
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
        router.push('/recruitment/my-resumes');
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

  const handleApplyToJob = async () => {
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

  const clearScoringPoll = () => {
    if (scoringPollRef.current) {
      clearInterval(scoringPollRef.current);
      scoringPollRef.current = null;
    }
  };

  const getCandidateName = () =>
    resume?.candidateName || resume?.candidate_name || resume?.name || 'Unknown Candidate';

  const buildScoringProgress = (
    jobId: string,
    jobTitle: string,
    resumeIdToScore: string,
    candidateName: string,
    status?: BatchScoringStatus
  ): JobScoringProgress => {
    const items: Array<{
      resume_id: string;
      candidate_name?: string;
      status: 'queued' | 'processing' | 'completed' | 'failed';
      overall_score?: number;
      error_message?: string;
    }> = status?.items?.length
      ? status.items
      : [{ resume_id: resumeIdToScore, candidate_name: candidateName, status: 'queued' as const }];

    return {
      jobId: status?.jd_id || jobId,
      jobTitle: status?.jd_title || jobTitle,
      total: status?.total || items.length || 1,
      queued: status?.queued ?? items.filter(item => item.status === 'queued').length,
      inProgress: status?.processing ?? items.filter(item => item.status === 'processing').length,
      completed: status?.completed ?? items.filter(item => item.status === 'completed').length,
      failed: status?.failed ?? items.filter(item => item.status === 'failed').length,
      items: items.map(item => ({
        resumeId: item.resume_id || resumeIdToScore,
        candidateName: item.candidate_name || candidateName,
        status: item.status,
        score: item.overall_score,
        errorMessage: item.error_message,
      })),
    };
  };

  const pollScoringBatch = (
    batchId: string,
    jobId: string,
    jobTitle: string,
    resumeIdToScore: string,
    candidateName: string
  ) => {
    clearScoringPoll();

    const poll = async () => {
      try {
        const status = await scoringService.getBatchStatus(batchId);
        setScoringProgressData([buildScoringProgress(jobId, jobTitle, resumeIdToScore, candidateName, status)]);

        const isComplete = status.total > 0 && status.queued === 0 && status.processing === 0;
        if (isComplete) {
          clearScoringPoll();
          if (status.failed > 0 && status.completed === 0) {
            toast.error('Resume scoring failed');
          } else {
            toast.success(`Resume scored for "${status.jd_title || jobTitle}"`);
          }
        }
      } catch (pollError) {
        console.error('[ResumeView] Failed to poll scoring batch:', pollError);
      }
    };

    scoringPollRef.current = setInterval(poll, 2000);
    void poll();
  };

  useEffect(() => () => clearScoringPoll(), []);

  // Handle applying resume to selected job (scoring) - using async Celery
  const handleApplyToJobSubmit = async (resumeIds: string[], jobIds: string[], jobRecords?: Job[]) => {
    if (jobIds.length === 0 || resumeIds.length === 0) return;

    setIsApplyToJobModalOpen(false);
    setIsScoringProgressMinimized(false);

    const jobId = jobIds[0];
    // Use selected version if available, otherwise use current resume
    const resumeIdToScore = selectedVersionForApply || resumeId;
    const selectedJob = jobRecords?.[0] || publishedJobs.find(job => job.id === jobId);
    const fallbackJobTitle = selectedJob?.title || 'Selected Job';
    const candidateName = getCandidateName();

    try {
      setScoringProgressKey(prev => prev + 1);
      setScoringProgressData([buildScoringProgress(jobId, fallbackJobTitle, resumeIdToScore, candidateName)]);
      setShowScoringProgressModal(true);

      // Start async bulk scoring via Celery
      const response = await scoringService.startBulkScoringAsync(jobId, [resumeIdToScore]);
      const responseJobId = response.jd_id || jobId;
      const responseJobTitle = response.jd_title || fallbackJobTitle;
      setScoringProgressData([{
        ...buildScoringProgress(responseJobId, responseJobTitle, resumeIdToScore, candidateName),
        queued: 0,
        inProgress: response.total_resumes || 1,
        items: [{
          resumeId: resumeIdToScore,
          candidateName,
          status: 'processing',
        }],
      }]);
      pollScoringBatch(response.batch_id, responseJobId, responseJobTitle, resumeIdToScore, candidateName);
      setSelectedVersionForApply(null);
    } catch (error: any) {
      console.error('Failed to start scoring:', error);

      if (error?.message?.includes('QUOTA') || error?.response?.status === 403) {
        toast.error('Resume scoring quota exhausted. Please upgrade your plan.');
      } else {
        toast.error(error.message || 'Failed to start scoring');
      }
      setScoringProgressData([{
        ...buildScoringProgress(jobId, fallbackJobTitle, resumeIdToScore, candidateName),
        queued: 0,
        failed: 1,
        items: [{
          resumeId: resumeIdToScore,
          candidateName,
          status: 'failed',
          errorMessage: error?.message || 'Failed to start scoring',
        }],
      }]);
      setShowScoringProgressModal(true);
    }
  };

  if (loading) {
    // Structure-matched skeleton — mirrors this page's real layout: the card
    // wrapper + breadcrumb, the "Resume Details" header, the action bar, the
    // candidate hero card (avatar + name/meta chips + contact tiles), and the
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
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-3" />
              <Skeleton className="h-3 w-28" />
            </div>

            {/* Header */}
            <div className="border-b border-gray-100 py-3 sm:py-4 mb-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <Skeleton className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl" />
                <div className="space-y-1.5">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </div>
            </div>

            {/* Action bar */}
            <div className="border-b border-gray-100 py-2.5 sm:py-3 mb-4">
              <div className="flex items-center gap-2">
                <Skeleton className="h-9 w-20 rounded-lg" />
                <Skeleton className="h-9 w-20 rounded-lg" />
                <Skeleton className="h-9 w-24 rounded-lg" />
              </div>
            </div>

            {/* Body — candidate hero card + section cards */}
            <div className="space-y-6">
              {/* Candidate hero card */}
              <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <Skeleton className="w-16 h-16 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-6 w-56" />
                    <Skeleton className="h-4 w-40" />
                    <div className="flex flex-wrap gap-2 pt-1">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-6 w-24 rounded-full" />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-5 pt-5 border-t border-gray-100 flex flex-wrap gap-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-11 w-48 rounded-lg" />
                  ))}
                </div>
              </div>

              {/* Section cards */}
              {Array.from({ length: 3 }).map((_, card) => (
                <div key={card} className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm rounded-xl p-6">
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
                onPrev={prevId ? () => router.replace(`/recruitment/resume-view/${prevId}`) : undefined}
                onNext={nextId ? () => router.replace(`/recruitment/resume-view/${nextId}`) : undefined}
              />
            ) : undefined}
          />
      {/* Header */}
      <div className="border-b border-gray-100 py-3 sm:py-4 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-brand-blue rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
              <Briefcase className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg lg:text-xl font-semibold text-gray-900 tracking-tight truncate">Resume Details</h1>
              <p className="text-xs sm:text-sm text-gray-600 truncate">{resume.name}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Action Bar — the horizontal scroll clips absolutely-positioned
          children, so drop it while the Invite menu is open. */}
      <div className={`relative border-b border-gray-100 py-2.5 sm:py-3 mb-4 ${
        showInviteMenu ? 'overflow-visible' : 'overflow-x-auto scrollbar-hide'
      }`}>
        <div className="flex items-center justify-between gap-3 min-w-max sm:min-w-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleVersionPreview(resumeId, resume?.name || 'Resume')}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors text-sm"
            >
              <Eye className="w-4 h-4" />
              View
            </button>
            {canShareResume && (
              <button
                onClick={handleShare}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors text-sm"
              >
                <Share2 className="w-4 h-4" />
                Share
              </button>
            )}
            {canInvite && (
              <div className="relative" ref={inviteMenuRef}>
                <button
                  onClick={() => setShowInviteMenu(!showInviteMenu)}
                  disabled={loadingInvite}
                  aria-haspopup="menu"
                  aria-expanded={showInviteMenu}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-brand-blue/40 text-brand-blue rounded-lg hover:bg-brand-blue/5 transition-colors text-sm font-medium"
                >
                  {loadingInvite ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  Invite
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showInviteMenu ? 'rotate-180' : ''}`} />
                </button>

                {showInviteMenu && (
                  <div role="menu" className="absolute left-0 top-full mt-2 w-64 bg-white rounded-xl border border-gray-200 shadow-lg shadow-gray-900/10 py-1.5 z-[60]">
                    {canInviteAssessment && (
                      <button
                        role="menuitem"
                        onClick={() => startInvite('assessment')}
                        className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-brand-blue/5 transition-colors"
                      >
                        <span className="mt-0.5 w-8 h-8 rounded-lg bg-brand-blue/10 flex items-center justify-center flex-shrink-0">
                          <Mail className="w-4 h-4 text-brand-blue" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-gray-900">Assessment Invite</span>
                          <span className="block text-xs text-gray-500">Pick a job, then send its assessment</span>
                        </span>
                      </button>
                    )}
                    {canInviteAIInterview && (
                      <button
                        role="menuitem"
                        onClick={() => startInvite('ai-interview')}
                        className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-brand-blue/5 transition-colors"
                      >
                        <span className="mt-0.5 w-8 h-8 rounded-lg bg-brand-cyan/10 flex items-center justify-center flex-shrink-0">
                          <Sparkles className="w-4 h-4 text-brand-cyan" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-gray-900">AI Interview</span>
                          <span className="block text-xs text-gray-500">Pick a job, then invite to its interview</span>
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            {canRunAITalentMatch && (
              <button
                onClick={handleAITalentMatch}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-brand-cyan/40 text-brand-cyan rounded-lg hover:bg-brand-cyan/5 transition-colors text-sm font-medium"
              >
                <Sparkles className="w-4 h-4" />
                AI Talent Match
              </button>
            )}
            {canDeleteResume && (
              <button
                onClick={handleDelete}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 hover:border-red-300 transition-colors text-sm"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            )}
          </div>
          {viewSource === 'job-details' ? (
            <button
              onClick={handleOpenScoredResumes}
              className="flex items-center gap-2 px-6 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-all text-sm shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
            >
              <FileText className="w-4 h-4" />
              Scored Resumes
            </button>
          ) : canApplyResumeToJob && (
            <button
              onClick={handleApplyToJob}
              className="flex items-center gap-2 px-6 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-all text-sm shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
            >
              <Send className="w-4 h-4" />
              Score Resume
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div>
        <div className="space-y-6">

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

            const initials = name
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part[0]?.toUpperCase() ?? '')
              .join('') || '?';

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
              <div className="bg-gradient-to-br from-brand-blue/5 via-white to-brand-cyan/5 border border-brand-blue/15 rounded-xl p-5 sm:p-6 shadow-sm shadow-brand-blue/10 ring-1 ring-brand-blue/10">
                {/* Identity row */}
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-xl bg-brand-blue text-white flex items-center justify-center text-lg font-semibold shadow-md shadow-brand-blue/25 ring-1 ring-white/20 flex-shrink-0">
                    {initials}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-2xl font-bold text-gray-900 tracking-tight truncate">
                          {name}
                        </h2>
                        {title && (
                          <p className="text-base text-gray-600 truncate">{title}</p>
                        )}
                      </div>

                      {/* Source, as a chip rather than a floating stat — it's a
                          label for the record, not a headline number. */}
                      <span className="flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/70 text-xs font-medium text-brand-blue ring-1 ring-brand-blue/20">
                        <Database className="w-3.5 h-3.5" />
                        {resume.source}
                      </span>
                    </div>

                    {facts.length > 0 && (
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 mt-3">
                        {facts.map(({ icon: Icon, text }, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/70 text-xs text-gray-700 ring-1 ring-brand-blue/10"
                          >
                            <Icon className="w-3.5 h-3.5 text-brand-blue" />
                            {text}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Contact — its own block under a rule, so it stops reading as
                    an afterthought hanging off the bottom of the card. */}
                {contacts.length > 0 && (
                  <div className="mt-5 pt-5 border-t border-brand-blue/10">
                    {/* Tiles hug their content rather than splitting the card in
                        half — a phone number in a half-width box is mostly empty
                        box. `max-w-xs` caps a long email instead of letting it
                        stretch the row. */}
                    <div className="flex flex-wrap gap-3">
                      {contacts.map(({ icon: Icon, label, value, href }) => (
                        <a
                          key={label}
                          href={href}
                          className="group flex items-center gap-2.5 py-2 pl-2 pr-3.5 rounded-lg bg-white/70 ring-1 ring-brand-blue/10 hover:ring-brand-blue/30 hover:bg-white transition-all min-w-0 max-w-xs"
                        >
                          <span className="w-8 h-8 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                            <Icon className="w-4 h-4 text-brand-blue" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-2xs leading-none text-gray-500 mb-0.5">{label}</span>
                            <span className="block text-sm text-gray-900 truncate group-hover:text-brand-blue transition-colors">
                              {value}
                            </span>
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Professional Summary */}
          {detailedResume.summary && (
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                  <Star className="w-4 h-4 text-brand-blue" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Professional Summary</h3>
              </div>
              <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{detailedResume.summary}</p>
            </div>
          )}

          {/* Work Experience */}
          {detailedResume.experience.length > 0 && (
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                  <Briefcase className="w-4 h-4 text-brand-blue" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Work Experience</h3>
              </div>
              <div className="space-y-6">
                {detailedResume.experience.map((exp, index) => (
                  <div key={index} className="relative pl-6 pb-6 border-l-2 border-brand-blue/30 last:pb-0">
                    <div className="absolute -left-2 top-0 w-4 h-4 rounded-full bg-brand-blue border-2 border-white shadow-sm shadow-brand-blue/30"></div>
                    <div className="mb-3">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="font-semibold text-gray-900 mb-1">{exp.title}</h4>
                          <div className="flex items-center gap-2 text-gray-700 mb-1">
                            <Building2 className="w-4 h-4" />
                            <span>{exp.company}</span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
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

          {/* Education */}
          {detailedResume.education.length > 0 && (
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                  <GraduationCap className="w-4 h-4 text-brand-blue" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Education</h3>
              </div>
              <div className="space-y-4">
                {detailedResume.education.map((edu, index) => (
                  <div key={index} className="p-4 bg-slate-50 border border-gray-100 ring-1 ring-black/[0.02] rounded-lg">
                    <h4 className="font-semibold text-gray-800 mb-1">
                      {edu.degree}
                      {edu.field && ` in ${edu.field}`}
                    </h4>
                    {edu.school && <div className="text-gray-700 mb-1">{edu.school}</div>}
                    {edu.institution && !edu.school && <div className="text-gray-700 mb-1">{edu.institution}</div>}
                    <div className="flex items-center gap-4 text-sm text-gray-600">
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
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                  <Code className="w-4 h-4 text-brand-blue" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Skills</h3>
              </div>

              {/* Technical Skills */}
              {detailedResume.skills.technical.length > 0 && (
                <div className="mb-6">
                  <h4 className="font-medium text-gray-900 mb-4">Technical Skills</h4>
                  <div className="flex flex-wrap gap-2">
                    {detailedResume.skills.technical.map((skill, index) => (
                      <span key={index} className="px-3 py-1.5 bg-brand-blue/5 text-brand-blue rounded-lg text-sm ring-1 ring-brand-blue/20">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Soft Skills */}
              {detailedResume.skills.soft.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-4">Soft Skills</h4>
                  <div className="flex flex-wrap gap-2">
                    {detailedResume.skills.soft.map((skill, index) => (
                      <span key={index} className="px-3 py-1.5 bg-brand-blue/5 text-brand-blue rounded-lg text-sm ring-1 ring-brand-blue/20">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Certifications */}
          {detailedResume.certifications.length > 0 && (
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-9 h-9 rounded-lg bg-brand-orange/10 ring-1 ring-brand-orange/15 flex items-center justify-center">
                  <Award className="w-4 h-4 text-brand-orange" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Certifications</h3>
              </div>
              <div className="space-y-4">
                {detailedResume.certifications.map((cert, index) => (
                  <div key={index} className="p-4 bg-slate-50 border border-gray-100 ring-1 ring-black/[0.02] rounded-lg">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-1">{cert.name}</h4>
                        {cert.issuer && <div className="text-sm text-gray-700 mb-1">{cert.issuer}</div>}
                        <div className="flex items-center gap-4 text-xs text-gray-600">
                          {cert.date && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              Issued {cert.date}
                            </span>
                          )}
                          {cert.credentialId && <span>ID: {cert.credentialId}</span>}
                        </div>
                      </div>
                      <Award className="w-6 h-6 text-brand-orange" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Languages */}
          {detailedResume.languages.length > 0 && (
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-9 h-9 rounded-lg bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center">
                  <Languages className="w-4 h-4 text-brand-cyan" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Languages</h3>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {detailedResume.languages.map((lang, index) => (
                  <div key={index} className="p-4 bg-slate-50 border border-gray-100 ring-1 ring-black/[0.02] rounded-lg text-center">
                    <div className="font-medium text-gray-900 mb-1">{lang.name}</div>
                    <div className="text-sm text-gray-600">{lang.proficiency}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Projects */}
          {resume.projects && resume.projects.length > 0 && (
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                  <Code className="w-4 h-4 text-brand-blue" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Projects</h3>
              </div>
              <div className="space-y-4">
                {resume.projects.map((project: any, index: number) => (
                  <div key={index} className="p-4 bg-slate-50 border border-gray-100 ring-1 ring-black/[0.02] rounded-lg">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-semibold text-gray-900">{project.name}</h4>
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
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-9 h-9 rounded-lg bg-brand-orange/10 ring-1 ring-brand-orange/15 flex items-center justify-center">
                  <Award className="w-4 h-4 text-brand-orange" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Awards & Honors</h3>
              </div>
              <div className="space-y-4">
                {resume.awards.map((award: any, index: number) => (
                  <div key={index} className="p-4 bg-slate-50 border border-gray-100 ring-1 ring-black/[0.02] rounded-lg">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-1">{award.name}</h4>
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
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                  <Star className="w-4 h-4 text-brand-blue" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Achievements</h3>
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
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-9 h-9 rounded-lg bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center">
                  <User className="w-4 h-4 text-brand-cyan" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Volunteer Experience</h3>
              </div>
              <div className="space-y-4">
                {resume.volunteerExperience.map((vol: any, index: number) => (
                  <div key={index} className="p-4 bg-slate-50 border border-gray-100 ring-1 ring-black/[0.02] rounded-lg">
                    <h4 className="font-semibold text-gray-900 mb-1">{vol.role || vol.title}</h4>
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
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-9 h-9 rounded-lg bg-brand-orange/10 ring-1 ring-brand-orange/15 flex items-center justify-center">
                  <Star className="w-4 h-4 text-brand-orange" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Hobbies & Interests</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {resume.hobbies.map((hobby: string | { name?: string }, index: number) => (
                  <span key={index} className="px-3 py-1.5 bg-brand-blue/5 text-brand-blue rounded-lg text-sm ring-1 ring-brand-blue/20">
                    {typeof hobby === 'string' ? hobby : ((hobby.name || hobby) as React.ReactNode)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Social Links */}
          {(resume.linkedinUrl || resume.githubUrl || resume.portfolioUrl) && (
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                  <Globe className="w-4 h-4 text-brand-blue" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Social & Portfolio Links</h3>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {resume.linkedinUrl && (
                  <a href={resume.linkedinUrl} target="_blank" rel="noopener noreferrer"
                     className="flex items-center gap-2 p-4 bg-brand-blue/5 border border-brand-blue/20 rounded-lg hover:bg-brand-blue/10 hover:border-brand-blue/30 transition-colors">
                    <Linkedin className="w-5 h-5 text-brand-blue" />
                    <span className="text-brand-blue text-sm font-medium">LinkedIn</span>
                    <ExternalLink className="w-3 h-3 text-brand-blue ml-auto" />
                  </a>
                )}
                {resume.githubUrl && (
                  <a href={resume.githubUrl} target="_blank" rel="noopener noreferrer"
                     className="flex items-center gap-2 p-4 bg-slate-50 border border-gray-200 rounded-lg hover:bg-slate-100 transition-colors">
                    <Code className="w-5 h-5 text-gray-700" />
                    <span className="text-gray-700 text-sm font-medium">GitHub</span>
                    <ExternalLink className="w-3 h-3 text-gray-500 ml-auto" />
                  </a>
                )}
                {resume.portfolioUrl && (
                  <a href={resume.portfolioUrl} target="_blank" rel="noopener noreferrer"
                     className="flex items-center gap-2 p-4 bg-brand-cyan/5 border border-brand-cyan/20 rounded-lg hover:bg-brand-cyan/10 hover:border-brand-cyan/30 transition-colors">
                    <Globe className="w-5 h-5 text-brand-cyan" />
                    <span className="text-brand-cyan text-sm font-medium">Portfolio</span>
                    <ExternalLink className="w-3 h-3 text-brand-cyan ml-auto" />
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Objective (if different from summary) */}
          {resume.objective && resume.objective !== resume.professionalSummary && (
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-brand-blue" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Career Objective</h3>
              </div>
              <p className="text-gray-700 leading-relaxed">{resume.objective}</p>
            </div>
          )}

          {/* Additional Information */}
          {resume.additionalInfo && (
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-brand-blue" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Additional Information</h3>
              </div>
              <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{resume.additionalInfo}</p>
            </div>
          )}

          {/* Full Resume Content - Hidden as per requirement, showing AI-extracted sections above instead */}
          {/* {resume.extractedText && (
            <FullResumeContent text={resume.extractedText} />
          )} */}

          {/* Version History */}
          {resume.versions && resume.versions.length > 0 && (
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                  <History className="w-4 h-4 text-brand-blue" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Version History</h3>
                <span className="px-2.5 py-0.5 bg-brand-blue/10 text-brand-blue rounded-full text-xs ring-1 ring-brand-blue/20">
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
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 flex-1">
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
                                <div className="flex items-center gap-3 text-xs text-gray-600">
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {formatIST(version.uploadDate)}
                                  </span>
                                  <span>•</span>
                                  <span>{version.size}</span>
                                  <span>•</span>
                                  <span className="flex items-center gap-1">
                                    <User className="w-3 h-3" />
                                    {version.uploadedBy}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
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

          {/* File Properties */}
          <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                <File className="w-4 h-4 text-brand-blue" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 tracking-tight">File Properties</h3>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg">
                    <FileText className="w-4 h-4 text-brand-blue" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">File Name</div>
                    <div className="text-sm text-gray-900">{resume.fileName || `${resume.name.replace(' ', '_')}_Resume.pdf`}</div>
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

        </div>
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

      {/* Version Preview Modal - shows extracted text content */}
      {/* Loading state for preview fetch — skeleton mirroring the preview modal
          that replaces it: same modal shell + header, and a document card of
          skeleton lines (section headings + tapering paragraph lines) in the
          gray content area. */}
      {previewLoading && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-2xl h-[90dvh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-100 bg-gray-50 flex-shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <Skeleton className="w-10 h-10 rounded-xl" />
                <div className="min-w-0 space-y-1.5">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Skeleton className="h-9 w-24 rounded-lg" />
                <Skeleton className="h-9 w-9 rounded-lg" />
              </div>
            </div>
            {/* Document content */}
            <div className="flex-1 overflow-y-auto bg-gray-100 p-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 max-w-2xl mx-auto min-h-full space-y-3">
                <Skeleton className="h-6 w-48 mb-4" />
                {Array.from({ length: 3 }).map((_, s) => (
                  <div key={s} className="space-y-2 pt-3">
                    <Skeleton className="h-4 w-32 mb-2" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-11/12" />
                    <Skeleton className="h-3 w-4/5" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {versionPreviewUrl && (() => {
        const previewVersion = resume?.versions?.find(v => v.id === versionPreviewUrl);
        const isCurrentPreview = versionPreviewUrl === resumeId;
        const previewText = previewVersion?.extractedText || (isCurrentPreview ? (resume?.extractedText || fetchedPreviewText) : fetchedPreviewText) || '';

        // Parse text into sections for document-like display
        const lines = previewText.split('\n');
        const sectionHeaders = [
          'experience', 'work experience', 'employment', 'professional experience',
          'education', 'academic', 'qualifications',
          'skills', 'technical skills', 'core competencies', 'expertise', 'key skills',
          'summary', 'professional summary', 'objective', 'profile', 'about',
          'certifications', 'certificates', 'licenses',
          'projects', 'key projects',
          'achievements', 'accomplishments', 'awards',
          'languages', 'contact', 'personal', 'references', 'hobbies', 'interests'
        ];

        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-2xl h-[90dvh] flex flex-col overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-100 bg-gray-50 flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-brand-blue flex items-center justify-center shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                    <Eye className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-gray-900 tracking-tight truncate">{versionPreviewLabel}</h2>
                    <p className="text-sm text-gray-500 truncate">{previewVersion?.name || resume?.fileName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleDownload(
                      versionPreviewUrl,
                      previewVersion?.fileName || previewVersion?.name || resume?.fileName || `resume-${versionPreviewUrl}.${resume?.fileType || 'pdf'}`,
                      previewVersion ? 'Failed to download version' : 'Failed to download resume'
                    )}
                    className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors text-sm"
                  >
                    <Download className="w-4 h-4" />
                    <span className="hidden sm:inline">Download</span>
                  </button>
                  <button
                    onClick={() => {
                      setVersionPreviewUrl(null);
                      setVersionPreviewLabel('');
                      setFetchedPreviewText(null);
                    }}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                   aria-label="Close">
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>
              </div>

              {/* Resume content - document style */}
              <div className="flex-1 overflow-y-auto bg-gray-100 p-6">
                {previewText ? (
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 max-w-2xl mx-auto min-h-full">
                    {lines.map((line, idx) => {
                    const trimmed = line.trim();
                    if (!trimmed) return <div key={idx} className="h-3" />;

                    const lowerLine = trimmed.toLowerCase().replace(/[:\-_]/g, ' ').trim();
                    const isHeader = sectionHeaders.some(h =>
                      lowerLine === h || lowerLine.startsWith(h + ' ') || lowerLine.endsWith(' ' + h)
                    ) && trimmed.length < 50;

                    if (isHeader) {
                      return (
                        <h3 key={idx} className="text-base font-bold text-gray-900 mt-5 mb-2 pb-1 border-b border-gray-300 uppercase tracking-wide">
                          {trimmed}
                        </h3>
                      );
                    }

                    // First non-empty line could be the name
                    const firstNonEmpty = lines.findIndex(l => l.trim().length > 0);
                    if (idx === firstNonEmpty) {
                      return (
                        <h2 key={idx} className="text-xl font-bold text-gray-900 mb-1">{trimmed}</h2>
                      );
                    }

                    // Bullet points
                    if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
                      return (
                        <p key={idx} className="text-sm text-gray-700 leading-relaxed pl-4 mb-0.5">{trimmed}</p>
                      );
                    }

                    return (
                      <p key={idx} className="text-sm text-gray-700 leading-relaxed mb-0.5">{trimmed}</p>
                    );
                    })}
                  </div>
                ) : (
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 max-w-2xl mx-auto min-h-full flex flex-col items-center justify-center text-center">
                    <FileText className="w-10 h-10 text-gray-400 mb-3" />
                    <p className="text-sm font-medium text-gray-900">Preview not available</p>
                    <p className="text-sm text-gray-500 mt-1">Download the resume to view the original file.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Version Selection Modal for Apply to Job */}
      {showVersionSelectModal && resume && resume.versions && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-[95vw] sm:max-w-2xl max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden animate-scale-in">
            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between p-6 border-b border-gray-100 bg-gray-50">
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
            <div className="flex-1 min-h-0 overflow-y-auto p-6">
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
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <File className="w-4 h-4 text-gray-500" />
                        <span className="font-medium text-gray-900">{resume.fileName || 'Current Version'}</span>
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">Current</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
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
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <File className="w-4 h-4 text-gray-400" />
                          <span className="font-medium text-gray-700">Version {version.version || (resume.versions.length - index)}</span>
                          <span className="text-xs text-gray-500">({version.name})</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
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
            <div className="flex-shrink-0 flex items-center justify-end gap-3 p-6 border-t border-gray-100 bg-slate-50">
              <button
                onClick={() => setShowVersionSelectModal(false)}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-200 bg-white rounded-lg hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
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
          onClose={() => {
            setIsApplyToJobModalOpen(false);
            setSelectedVersionForApply(null);
          }}
          onApply={handleApplyToJobSubmit}
        />
      )}

      {showScoringProgressModal && (
        <ScoringJobProgressModal
          key={scoringProgressKey}
          isOpen={showScoringProgressModal}
          isMinimized={isScoringProgressMinimized}
          jobProgressData={scoringProgressData}
          onClose={() => {
            setShowScoringProgressModal(false);
            setIsScoringProgressMinimized(false);
          }}
          onMinimize={() => setIsScoringProgressMinimized(prev => !prev)}
        />
      )}

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
          onComplete={(results) => {
            toast.success(`AI Talent Match completed for "${aiTalentMatchJob.title}" with ${results.length} match${results.length === 1 ? '' : 'es'}.`);
            setAiTalentMatchJob(null);
          }}
          onError={(error) => {
            toast.error(error || 'Failed to run AI Talent Match');
            setAiTalentMatchJob(null);
          }}
        />
      )}

      {/* Invite — step 1: choose the job the invite belongs to */}
      {showInviteJobPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-[95vw] sm:max-w-2xl w-full max-h-[80dvh] flex flex-col">
            <div className="flex items-start justify-between p-5 border-b border-gray-200 shrink-0">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {inviteIntent === 'assessment' ? 'Invite for Assessment' : 'Invite to AI Interview'}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Choose the job to invite {resume?.name || 'this candidate'} for.
                </p>
              </div>
              <button
                onClick={() => setShowInviteJobPicker(false)}
                className="p-1 hover:bg-gray-100 rounded"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-3 border-b border-gray-100 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={inviteJobQuery}
                  onChange={(e) => setInviteJobQuery(e.target.value)}
                  placeholder="Search jobs..."
                  className="w-full pl-9 pr-4 py-2 text-sm text-black border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {publishedJobs.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">No published jobs available.</p>
              ) : (
                publishedJobs
                  .filter(job => !inviteJobQuery.trim() ||
                    job.title?.toLowerCase().includes(inviteJobQuery.trim().toLowerCase()) ||
                    (job as any).job_id?.toLowerCase().includes(inviteJobQuery.trim().toLowerCase()))
                  .map(job => (
                    <button
                      key={job.id}
                      onClick={() => handleInviteJobPicked(job)}
                      disabled={loadingInvite}
                      className="w-full flex items-center justify-between gap-3 p-3 rounded-lg border border-gray-200 mb-2 text-left hover:border-brand-blue/40 hover:bg-brand-blue/5 transition-colors disabled:opacity-60"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {(job as any).job_id && (
                            <span className="px-2 py-0.5 bg-brand-blue/10 text-brand-blue rounded-md text-xs font-bold font-mono border border-brand-blue/20">
                              {(job as any).job_id}
                            </span>
                          )}
                          <span className="text-sm font-medium text-gray-900 truncate">{job.title}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-3">
                          {job.department && <span>{job.department}</span>}
                          {job.location && <span>{job.location}</span>}
                        </div>
                      </div>
                      {loadingInvite ? <Loader2 className="w-4 h-4 animate-spin text-brand-blue" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    </button>
                  ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Invite — step 2a: share the JD's assessment. Prefilled with the
          resume this page is showing — was opening blank, leaving the
          recruiter to retype the name and email of the candidate whose
          resume they were already looking at. */}
      {showShareAssessmentModal && shareAssessments.length > 0 && (
        <ShareAssessmentModal
          isOpen={showShareAssessmentModal}
          onClose={() => {
            setShowShareAssessmentModal(false);
            setShareAssessments([]);
          }}
          prefilledCandidates={
            resume?.email
              ? [{
                  id: resumeId,
                  name: getCandidateName(),
                  email: resume.email,
                  phone: resume.phone,
                  source: 'manual',
                  resumeId,
                }]
              : undefined
          }
          assessment={{
            id: shareAssessments[0].id,
            title: shareAssessments[0].title,
            duration: `${shareAssessments[0].duration_minutes || 30} min`,
            questions: (shareAssessments[0].hr_enabled ? 1 : 0)
              + (shareAssessments[0].technical_enabled ? 1 : 0)
              + (shareAssessments[0].coding_enabled ? 1 : 0),
            type: 'AI-Generated',
            short_id: shareAssessments[0].short_id,
            version: shareAssessments[0].version,
            jd_title: inviteJobTitle,
            jd_version: shareAssessments[0].jd_version,
          }}
          additionalAssessments={shareAssessments.slice(1).map((a: any) => ({
            id: a.id,
            title: a.title,
            duration: `${a.duration_minutes || 30} min`,
            questions: (a.hr_enabled ? 1 : 0) + (a.technical_enabled ? 1 : 0) + (a.coding_enabled ? 1 : 0),
            type: 'AI-Generated',
            short_id: a.short_id,
            version: a.version,
            jd_title: inviteJobTitle,
            jd_version: a.jd_version,
          }))}
          inviteSource="JD"
        />
      )}

      {/* Invite — step 2b: share the JD's AI interview. Same prefill as the
          Assessment modal above. */}
      {shareAIConfig && (
        <ShareAIInterviewModal
          isOpen={!!shareAIConfig}
          onClose={() => setShareAIConfig(null)}
          config={shareAIConfig}
          onInviteSent={() => setShareAIConfig(null)}
          initialCandidates={
            resume?.email
              ? [{ name: getCandidateName(), email: resume.email, resumeId }]
              : undefined
          }
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
                  onClick={() => {
                    setIsShareModalOpen(false);
                    setShareEmail('');
                  }}
                  className="px-4 py-2 text-gray-700 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
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
