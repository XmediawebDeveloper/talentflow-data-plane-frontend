import { ArrowLeft, ChevronLeft, ChevronRight, Clock, Users, FileText, Award, Calendar, TrendingUp, Edit2, Eye, Mail, BarChart, Share2, Download, Copy, Archive, Trash2, Play, PauseCircle, CheckCircle, XCircle, AlertCircle, Briefcase, Target, Sparkles, Link2, Code, MessageSquare, Cpu, User, ExternalLink, Info, Layers, Star, Globe, Zap, Loader2 } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { useAuth } from '@/components/providers/AuthProvider';
import { assessmentService, jdService } from '@/lib/services';
import type { JDResponse } from '@/lib/services';
import { stripVersionFromTitle, isAssessmentRevoked } from '@/lib/utils/assessmentUtils';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
import { toast } from 'sonner';
import VersionBadge from './VersionBadge';
import { formatIST } from '@/lib/utils/dateUtils';
import { formatJobExperienceText } from '@/lib/utils/jobExperience';
import PageBreadcrumb, { type BreadcrumbCrumb } from '@/components/PageBreadcrumb';
import RecordPager from '@/components/RecordPager';

interface AssessmentDetailsViewProps {
  assessment: any;
  onBack: () => void;
  onEdit: () => void;
  onPreview: () => void;
  onShare?: () => void;
  onViewResults: () => void;
  onRefresh?: () => void;
  currentIndex?: number;
  totalCount?: number;
  onPrev?: () => void;
  onNext?: () => void;
  /**
   * Overrides the default Assessments trail. Set when this page is reached from
   * a JD (Job Details → Assessment → Create on a job that already has one), so
   * the breadcrumb stays anchored to that job instead of resetting.
   */
  breadcrumbItems?: BreadcrumbCrumb[];
}

interface Section {
  name: string;
  type: 'hr' | 'technical' | 'coding';
  enabled: boolean;
  percentage: number;
  topics: string[];
  languages?: string[];
  icon: any;
}

// IST timezone constant
const INDIA_TIMEZONE = 'Asia/Kolkata';

const formatEmploymentType = (type: string | undefined): string => {
  if (!type) return '';
  return type
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

// ---- Read-only label helpers for the Extracted Data Summary ----
// Deliberately identical to the Job Details page's versions so the same JD
// reads the same on both screens; the JD API shape (snake_case) is mapped to
// them at the call site.
const prettifyCode = (value?: string): string =>
  (value || '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

const EDUCATION_LABELS: Record<string, string> = {
  diploma: 'Diploma',
  associate: 'Associate Degree',
  bachelors: "Bachelor's Degree",
  masters: "Master's Degree",
  doctorate: 'Doctorate / PhD',
  none: 'No formal education required',
  others: 'Others',
};
const educationLabel = (value?: string): string =>
  value ? (EDUCATION_LABELS[value.toLowerCase()] || prettifyCode(value)) : 'Not specified';

const employmentTypeLabel = (value?: string): string => {
  switch (value) {
    case 'full_time': return 'Full Time';
    case 'part_time': return 'Part Time';
    case 'contract': return 'Contract';
    case 'internship': return 'Internship';
    case 'temporary': return 'Temporary / Seasonal';
    default: return value ? prettifyCode(value) : 'Not specified';
  }
};

const workModeLabel = (value?: string): string => {
  switch (value) {
    case 'onsite': return 'Onsite';
    case 'remote': return 'Remote';
    case 'hybrid': return 'Hybrid';
    case 'field_based': return 'Field-based / Travel';
    default: return value ? prettifyCode(value) : 'Not specified';
  }
};

export default function AssessmentDetailsView({
  assessment,
  onBack,
  onEdit,
  onPreview,
  onShare,
  onViewResults,
  onRefresh,
  currentIndex,
  totalCount,
  onPrev,
  onNext,
  breadcrumbItems,
}: AssessmentDetailsViewProps) {
  const router = useRouter();
  const dialog = useGlobalDialog();
  const { isTenantAdmin, user } = useAuth();
  const canCreateAssessments = isTenantAdmin || (user?.permissions?.canCreateAssessments ?? false);
  const canExport = isTenantAdmin || (user?.permissions?.canExport ?? false);
  const [activeTab, setActiveTab] = useState<'overview' | 'sections' | 'analytics' | 'activity' | 'versions' | 'newversions' | 'info' | 'viewjd'>('overview');
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityPage, setActivityPage] = useState(1);
  const ACTIVITY_PAGE_SIZE = 10;
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  // Original per-row edit history (assessment_version_history table).
  // Powers the "Versions" tab.
  const [versionHistory, setVersionHistory] = useState<any[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  // Sibling versions = every assessment sharing this assessment's jd_id
  // (V1 + any clones). Powers the "New Versions" tab.
  const [siblingVersions, setSiblingVersions] = useState<any[]>([]);
  const [siblingsLoading, setSiblingsLoading] = useState(false);
  // Comparison state: { [siblingId]: otherVersionId } — set when the
  // recruiter picks a version from the "Compare with" dropdown on a card.
  // Stored per-card so each card can hold its own comparison independently.
  const [compareSelection, setCompareSelection] = useState<Record<string, string>>({});
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<string, boolean>>({});
  const [jdData, setJdData] = useState<JDResponse | null>(null);
  const [jdLoading, setJdLoading] = useState(false);
  const [jdError, setJdError] = useState<string | null>(null);
  // Collapsible "Extracted Data Summary" on the View JD tab — same component
  // and same default (collapsed) as the Job Details page.
  const [showExtractedSummary, setShowExtractedSummary] = useState(false);

  // Structured requirements behind the JD, mapped from the raw API shape to the
  // same values the Job Details page renders.
  const jdMustHaveSkills = jdData?.must_have_skills || [];
  const jdNiceToHaveSkills = jdData?.nice_to_have_skills || [];
  const jdMustHaveComments = jdData?.must_have_comments || [];
  const jdNiceToHaveComments = jdData?.nice_to_have_comments || [];
  // education_requirements is an object ({ degree, field }); Job Details reads a
  // pre-flattened string, so flatten it the same way here.
  const jdEducationDegree = (jdData?.education_requirements as { degree?: string } | undefined)?.degree;
  const jdEducationField = (jdData?.education_requirements as { field?: string } | undefined)?.field;
  const jdExperienceText = formatJobExperienceText({
    jobLevel: jdData?.job_level,
    experienceMin: jdData?.experience_min,
    experienceMax: jdData?.experience_max,
  });
  const hasAnyExtractedData = Boolean(
    jdMustHaveSkills.length || jdNiceToHaveSkills.length ||
    jdMustHaveComments.length || jdNiceToHaveComments.length ||
    jdExperienceText || jdEducationDegree || jdData?.industry_type ||
    jdData?.employment_type || jdData?.remote_type
  );

  // Fetch recent activity when assessment changes.
  // Each invitation is expanded into MULTIPLE timeline events (Invited,
  // Email Sent, Link Opened, Assessment Started, Completed, Bounced,
  // Expired) so the recruiter sees the full lifecycle, not just the latest
  // state. The list is then sorted newest-first and paginated client-side
  // (10 per page).
  useEffect(() => {
    const fetchActivity = async () => {
      if (!assessment?.id) return;
      setActivityLoading(true);
      try {
        const response = await assessmentService.listInvitations(assessment.id, { page_size: 200 });
        const invitations = response?.items || [];
        const events: any[] = [];
        const _now = Date.now();
        for (const inv of invitations) {
          if (inv.created_at) events.push({ ...inv, _eventType: 'invited', _eventAt: inv.created_at });
          if (inv.sent_at && inv.sent_at !== inv.created_at) {
            events.push({ ...inv, _eventType: 'sent', _eventAt: inv.sent_at });
          }
          if (inv.opened_at) events.push({ ...inv, _eventType: 'opened', _eventAt: inv.opened_at });
          if (inv.started_at) events.push({ ...inv, _eventType: 'started', _eventAt: inv.started_at });
          if (inv.completed_at) events.push({ ...inv, _eventType: 'completed', _eventAt: inv.completed_at });
          if (inv.bounced_at) events.push({ ...inv, _eventType: 'bounced', _eventAt: inv.bounced_at });
          // Expired event — clock-based when the link passed its deadline
          // without the candidate starting (and no unit was consumed).
          const clockExpired = inv.expires_at
            && new Date(inv.expires_at).getTime() < _now
            && !inv.started_at
            && !inv.completed_at
            && !inv.unit_consumed;
          if (clockExpired || (inv.status || '').toLowerCase() === 'expired') {
            events.push({ ...inv, _eventType: 'expired', _eventAt: inv.expires_at || inv.created_at });
          }
        }
        events.sort((a, b) => new Date(b._eventAt).getTime() - new Date(a._eventAt).getTime());
        setRecentActivity(events);
        setActivityPage(1);
      } catch (error) {
        console.error('Failed to fetch activity:', error);
      } finally {
        setActivityLoading(false);
      }
    };
    fetchActivity();
  }, [assessment?.id]);

  // Original per-row version_history fetch — powers the "Versions" tab.
  useEffect(() => {
    const fetchVersions = async () => {
      if (!assessment?.id || activeTab !== 'versions') return;
      setVersionsLoading(true);
      try {
        const response = await assessmentService.getVersionHistory(assessment.id);
        setVersionHistory(response.items || []);
      } catch (error) {
        console.error('Failed to fetch version history:', error);
      } finally {
        setVersionsLoading(false);
      }
    };
    fetchVersions();
  }, [assessment?.id, activeTab]);

  // Sibling versions (V1 + V2 + V3 sharing the same JD) — powers the
  // separate "New Versions" tab. Capped at the 3-version limit server-side.
  useEffect(() => {
    const fetchSiblings = async () => {
      if (!assessment?.id || !assessment?.jd_id || activeTab !== 'newversions') return;
      setSiblingsLoading(true);
      try {
        const response = await assessmentService.list({
          jd_id: assessment.jd_id,
          page_size: 50,
        });
        const items = (response.items || []).sort(
          (a: any, b: any) => (a.version || 0) - (b.version || 0)
        );
        setSiblingVersions(items);
      } catch (error) {
        console.error('Failed to fetch sibling versions:', error);
        setSiblingVersions([]);
      } finally {
        setSiblingsLoading(false);
      }
    };
    fetchSiblings();
  }, [assessment?.id, assessment?.jd_id, activeTab]);

  // Lazy-fetch the linked JD when the View JD OR Assessment Details (overview)
  // tab is opened — the overview tab now also shows the JD's Assessment
  // Guidance. Cached per assessment.jd_id so switching tabs doesn't re-fetch.
  useEffect(() => {
    const fetchJd = async () => {
      if ((activeTab !== 'viewjd' && activeTab !== 'overview') || !assessment?.jd_id) return;
      if (jdData && jdData.id === assessment.jd_id) return;
      setJdLoading(true);
      setJdError(null);
      try {
        const response = await jdService.get(assessment.jd_id);
        setJdData(response);
      } catch (error: any) {
        console.error('Failed to fetch JD:', error);
        setJdError(error?.message || 'Failed to load job description');
      } finally {
        setJdLoading(false);
      }
    };
    fetchJd();
  }, [assessment?.jd_id, activeTab, jdData]);

  // ── Version-diff helpers (used by the "New Versions" tab) ─────────────
  // computeVersionDiff returns a list of human-readable field changes
  // between two sibling assessments. We deliberately compare the STRIPPED
  // title so the inevitable "- Version N" suffix doesn't register as a
  // change every time. Topic arrays are diffed by id (added vs removed
  // items) rather than deep-equal so the recruiter sees a useful list.
  type VersionDiffRow = {
    field: string;
    label: string;
    kind: 'scalar' | 'list' | 'description' | 'boolean';
    oldValue?: any;
    newValue?: any;
    added?: string[];
    removed?: string[];
  };
  const diffTopicArrays = (
    older: any[] | null | undefined,
    newer: any[] | null | undefined,
  ): { added: string[]; removed: string[] } => {
    const norm = (item: any): { key: string; label: string } => {
      if (typeof item === 'string') return { key: item, label: item };
      const key = item?.id ?? item?.text ?? JSON.stringify(item);
      const label = item?.text ?? item?.name ?? item?.label ?? String(key);
      return { key: String(key), label };
    };
    const oldList = (older || []).map(norm);
    const newList = (newer || []).map(norm);
    const oldKeys = new Set(oldList.map(o => o.key));
    const newKeys = new Set(newList.map(n => n.key));
    return {
      added: newList.filter(n => !oldKeys.has(n.key)).map(n => n.label),
      removed: oldList.filter(o => !newKeys.has(o.key)).map(o => o.label),
    };
  };
  const computeVersionDiff = (older: any, newer: any): VersionDiffRow[] => {
    if (!older || !newer) return [];
    const rows: VersionDiffRow[] = [];
    const push = (row: VersionDiffRow) => rows.push(row);

    const oldTitle = stripVersionFromTitle(older.title || '');
    const newTitle = stripVersionFromTitle(newer.title || '');
    if (oldTitle !== newTitle) {
      push({ field: 'title', label: 'Title', kind: 'scalar', oldValue: oldTitle, newValue: newTitle });
    }

    if ((older.description || '') !== (newer.description || '')) {
      push({
        field: 'description', label: 'Description', kind: 'description',
        oldValue: older.description || '', newValue: newer.description || '',
      });
    }

    if ((older.duration_minutes || 0) !== (newer.duration_minutes || 0)) {
      push({
        field: 'duration_minutes', label: 'Duration', kind: 'scalar',
        oldValue: `${older.duration_minutes || 0} min`,
        newValue: `${newer.duration_minutes || 0} min`,
      });
    }

    // Per-section scalars + topic arrays
    const sectionMeta: Array<{ key: 'hr' | 'technical' | 'coding'; label: string; topicKey: string; langKey?: string }> = [
      { key: 'hr', label: 'HR', topicKey: 'hr_topics' },
      { key: 'technical', label: 'Technical', topicKey: 'technical_topics' },
      { key: 'coding', label: 'Coding', topicKey: 'coding_topics', langKey: 'coding_languages' },
    ];
    for (const sec of sectionMeta) {
      const enabledKey = `${sec.key}_enabled`;
      const pctKey = `${sec.key}_percentage`;
      if ((!!older[enabledKey]) !== (!!newer[enabledKey])) {
        push({
          field: enabledKey, label: `${sec.label} section`, kind: 'boolean',
          oldValue: older[enabledKey] ? 'Enabled' : 'Disabled',
          newValue: newer[enabledKey] ? 'Enabled' : 'Disabled',
        });
      }
      if ((older[pctKey] || 0) !== (newer[pctKey] || 0)) {
        push({
          field: pctKey, label: `${sec.label} weight`, kind: 'scalar',
          oldValue: `${older[pctKey] || 0}%`, newValue: `${newer[pctKey] || 0}%`,
        });
      }
      const topicsDiff = diffTopicArrays(older[sec.topicKey], newer[sec.topicKey]);
      if (topicsDiff.added.length || topicsDiff.removed.length) {
        push({
          field: sec.topicKey, label: `${sec.label} topics`, kind: 'list',
          added: topicsDiff.added, removed: topicsDiff.removed,
        });
      }
      if (sec.langKey) {
        const langDiff = diffTopicArrays(older[sec.langKey], newer[sec.langKey]);
        if (langDiff.added.length || langDiff.removed.length) {
          push({
            field: sec.langKey, label: 'Coding languages', kind: 'list',
            added: langDiff.added, removed: langDiff.removed,
          });
        }
      }
    }

    if ((!!older.proctoring_enabled) !== (!!newer.proctoring_enabled)) {
      push({
        field: 'proctoring_enabled', label: 'Proctoring', kind: 'boolean',
        oldValue: older.proctoring_enabled ? 'Enabled' : 'Disabled',
        newValue: newer.proctoring_enabled ? 'Enabled' : 'Disabled',
      });
    }

    return rows;
  };

  // Construct sections array from individual assessment fields
  const sections = useMemo<Section[]>(() => {
    const result: Section[] = [];

    if (assessment.hr_enabled) {
      result.push({
        name: 'HR / Behavioral',
        type: 'hr',
        enabled: true,
        percentage: assessment.hr_percentage || 0,
        topics: assessment.hr_topics || [],
        icon: MessageSquare
      });
    }

    if (assessment.technical_enabled) {
      result.push({
        name: 'Technical',
        type: 'technical',
        enabled: true,
        percentage: assessment.technical_percentage || 0,
        topics: assessment.technical_topics || [],
        icon: Cpu
      });
    }

    // ==================== COMPILER AVAILABILITY CHECK ====================
    // Only show coding section if coding_enabled AND at least one language has a compiler
    if (assessment.coding_enabled) {
      // Languages with compilers (Piston API)
      const compilerLanguages = [
        'python', 'python3', 'javascript', 'js', 'java',
        'typescript', 'ts', 'cpp', 'c++', 'c', 'csharp', 'cs',
        'go', 'rust', 'ruby', 'php', 'kotlin', 'swift', 'sql'
      ];

      const codingLanguages = assessment.coding_languages || [];
      const hasCompiler = codingLanguages.some((lang: string) =>
        compilerLanguages.includes(lang.toLowerCase())
      );

      if (hasCompiler) {
        result.push({
          name: 'Coding',
          type: 'coding',
          enabled: true,
          percentage: assessment.coding_percentage || 0,
          topics: assessment.coding_topics || [],
          languages: codingLanguages,
          icon: Code
        });
      } else {
        console.log('[COMPILER-CHECK] ❌ Coding round hidden - no compilers for languages:', codingLanguages);
      }
    }

    return result;
  }, [assessment]);

  // Format duration from minutes
  const formattedDuration = useMemo(() => {
    const minutes = assessment.duration_minutes || 30;
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
    }
    return `${minutes} min`;
  }, [assessment.duration_minutes]);

  // Analytics data derived from assessment - uses correct API field names
  const formatTime = (seconds: number | null | undefined): string => {
    if (seconds == null) return 'N/A';
    const mins = Math.floor(seconds / 60);
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      const remainingMins = mins % 60;
      return `${hrs}h ${remainingMins}m`;
    }
    return `${mins} min`;
  };

  // Same single-bucket classifier as the Track Invites popup so the cards
  // here stay in sync. recentActivity is now an expanded event list (one
  // row per lifecycle moment), so we dedupe by invitation id before
  // bucketing.
  const _uniqueInvites: any[] = (() => {
    const seen = new Map<string, any>();
    for (const ev of recentActivity) {
      if (ev?.id && !seen.has(ev.id)) seen.set(ev.id, ev);
    }
    return Array.from(seen.values());
  })();
  const _now = new Date();
  const _bucket = (inv: any): 'completed' | 'failed' | 'expired' | 'started' | 'sent' => {
    const s = (inv.status || '').toLowerCase();
    if (s === 'completed' || inv.completed_at) return 'completed';
    if (['failed', 'bounced', 'abandoned'].includes(s)) return 'failed';
    if (s === 'expired') return 'expired';
    if (!inv.started_at && !inv.unit_consumed && inv.expires_at && new Date(inv.expires_at) < _now) {
      return 'expired';
    }
    if (s === 'started' || (inv.started_at && !inv.completed_at)) return 'started';
    return 'sent';
  };
  const _bucketCounts = {
    completed: 0,
    failed: 0,
    expired: 0,
    started: 0,
    sent: 0,
  };
  for (const inv of _uniqueInvites) {
    _bucketCounts[_bucket(inv)] += 1;
  }
  const _totalInvites = assessment.candidates || assessment.invitations_count || _uniqueInvites.length || 0;
  const _completed = _bucketCounts.completed || assessment.completed_count || 0;
  const analyticsData = {
    totalInvites: _totalInvites,
    expired: _bucketCounts.expired,
    failed: _bucketCounts.failed,
    started: _bucketCounts.started || assessment.in_progress_count || 0,
    completed: _completed,
    inProgress: _bucketCounts.started || assessment.in_progress_count || 0,
    notStarted: assessment.pending_count || 0,
    completionRate: _totalInvites > 0 ? Math.round((_completed / _totalInvites) * 100) : 0,
    averageScore: assessment.average_score as number | null,
    averageTime: formatTime(assessment.average_time_seconds),
    passRate: assessment.pass_rate !== null && assessment.pass_rate !== undefined
      ? `${assessment.pass_rate}%`
      : 'N/A',
    hrScore: assessment.hr_score as number | null,
    technicalScore: assessment.technical_score as number | null,
    codingScore: assessment.coding_score as number | null,
  };

  // Outer/inner chrome matches job-details: scrolling <main>, centred
  // max-w-[1400px] column, then one padded white card that owns ALL horizontal
  // padding. Sections below therefore carry no px-* of their own.
  return (
    <main className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="p-4 md:p-8 w-full bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
      {/* Breadcrumb — must be a DIRECT child of the card so `sticky` has the
          card's full height to travel within. Nested inside a padding wrapper it
          was boxed to its own height and could never actually stick. */}
      {/* Previous / Next rides inside the breadcrumb bar, as on job-details, so
          it stays reachable while the sticky crumb is pinned. Passed as
          undefined when there is no list to page through, which leaves the bar
          exactly as it was. */}
      <PageBreadcrumb
        className="mb-4"
        items={breadcrumbItems ?? [
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Assessments', href: '/recruitment/assessments' },
          { label: stripVersionFromTitle(assessment.title) || assessment.short_id || 'Assessment Details' },
        ]}
        actions={totalCount != null && totalCount > 0 ? (
          <RecordPager
            currentIndex={currentIndex}
            totalCount={totalCount}
            onPrev={onPrev}
            onNext={onNext}
          />
        ) : undefined}
      />

      {/* Header — scrolls with the page. It used to be `sticky top-0`, pinned
          against the old full-bleed layout; inside the job-details card the
          breadcrumb is the only sticky element, so a second pinned layer just
          sat on top of it. */}
      <div>
        <div className="px-3 sm:px-5 lg:px-8 py-3 sm:py-4 lg:py-5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
            <div className="flex items-start gap-2 sm:gap-3 lg:gap-4 min-w-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 lg:w-11 lg:h-11 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-brand-blue" />
              </div>
              <div className="min-w-0">
                {/* Line 1: AS-022 SQL Developer - Assessment V1  Active AI-Generated */}
                <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 mb-1.5 sm:mb-2 flex-wrap">
                  <span className="px-1.5 sm:px-2 lg:px-2.5 py-0.5 sm:py-1 bg-brand-blue text-white rounded text-xs sm:text-sm font-bold shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                    {assessment.short_id || `AS-${String(assessment.id).slice(0, 8).toUpperCase()}`}
                  </span>
                  <h1 className="text-sm sm:text-base lg:text-xl text-gray-900 dark:text-slate-50 font-semibold truncate tracking-tight">
                    {assessment.jd_title || stripVersionFromTitle(assessment.title)} - Assessment
                  </h1>
                  <VersionBadge version={assessment.version} size="md" variant="secondary" />
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ring-1 ${
                    assessment.status === 'Active'
                      ? 'bg-green-100 text-green-700 ring-green-200'
                      : assessment.status === 'Draft'
                      ? 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20'
                      : 'bg-slate-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 ring-gray-200 dark:ring-slate-700'
                  }`}>
                    {assessment.status}
                  </span>
                  {sections.length > 0 && (
                    <span className="px-2 py-1 bg-brand-cyan/10 text-brand-cyan rounded text-xs flex items-center gap-1 ring-1 ring-brand-cyan/20">
                      <Sparkles className="w-3 h-3" />
                      AI-Generated
                    </span>
                  )}
                </div>

                {/* Line 2: Linked to: JD-025 - SQL Developer v2 */}
                {assessment.jd_short_id && (
                  <div className="text-sm text-gray-700 dark:text-slate-300 mb-2">
                    <span className="font-medium">Linked to: {assessment.jd_short_id}</span>
                    {assessment.jd_title && (
                      <span> - {assessment.jd_title}</span>
                    )}
                    {assessment.jd_version && (
                      <span className="ml-1 text-gray-500 dark:text-slate-500">v{assessment.jd_version}</span>
                    )}
                  </div>
                )}

                {/* Line 3: 30 min 3 sections 1 candidates Created 9 Feb 2026 at 06:46 pm Last Updated date_time */}
                <div className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 flex items-center gap-2 sm:gap-3 lg:gap-4 flex-wrap">
                  <span>{formattedDuration}</span>
                  <span>{sections.length} section{sections.length !== 1 ? 's' : ''}</span>
                  <span>{assessment.candidates || 0} candidates</span>
                  {assessment.created_at && (
                    <span>
                      Created {formatIST(assessment.created_at)}
                    </span>
                  )}
                  {assessment.updated_at && (
                    <span>
                      Last Updated {formatIST(assessment.updated_at)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              {onShare && canCreateAssessments && (() => {
                // Share is blocked for Archived (out of circulation) AND
                // once invites have been revoked (assessment is sealed —
                // recruiter should clone a new version for a fresh round).
                // We use the shared isAssessmentRevoked helper so this
                // check honours BOTH the backend has_revoked_invites flag
                // AND the tab-local sessionStorage seal — without the
                // local fallback, opening the details view of an assessment
                // you just revoked left Share enabled (because the
                // assessment prop comes straight from the list response
                // and may not carry the backend flag yet).
                const isArchived = assessment.status === 'Archived';
                const hasRevoked = isAssessmentRevoked(assessment as any);
                const blockedReason = isArchived
                  ? 'Archived assessments cannot be shared'
                  : hasRevoked
                  ? 'Invites for this assessment have been revoked. Duplicate it to start fresh.'
                  : '';
                const disabled = !!blockedReason;
                return (
                  <button
                    onClick={disabled ? undefined : onShare}
                    disabled={disabled}
                    title={blockedReason}
                    className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg ring-1 ring-white/10 shadow-sm shadow-brand-blue/25 transition-all flex items-center gap-1.5 sm:gap-2 font-medium text-xs sm:text-sm ${
                      disabled
                        ? 'bg-gray-200 dark:bg-slate-700 text-gray-400 dark:text-slate-500 cursor-not-allowed'
                        : 'bg-brand-blue hover:bg-brand-blue-2 text-white'
                    }`}
                  >
                    <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    Share
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs — not sticky, matching job-details. The old
          `top-[120px] sm:top-[148px] lg:top-[168px]` offsets were hand-measured
          against the previous header height; once the header stopped being
          pinned those numbers pinned the bar mid-page, where it covered the
          content scrolling beneath it. */}
      <div className="bg-white border-b border-gray-200">
        <div>
          <div className="flex gap-3 sm:gap-4 lg:gap-6 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setActiveTab('overview')}
              className={`min-w-[120px] sm:min-w-[140px] py-2.5 sm:py-3 text-xs sm:text-sm border-b-2 transition-colors whitespace-nowrap text-center ${
                activeTab === 'overview'
                  ? 'border-brand-blue text-brand-blue font-medium'
                  : 'border-transparent text-gray-600 hover:text-brand-blue'
              }`}
            >
              Assessment Details
            </button>
            <button
              onClick={() => setActiveTab('activity')}
              className={`min-w-[120px] sm:min-w-[140px] py-2.5 sm:py-3 text-xs sm:text-sm border-b-2 transition-colors whitespace-nowrap text-center ${
                activeTab === 'activity'
                  ? 'border-brand-blue text-brand-blue font-medium'
                  : 'border-transparent text-gray-600 hover:text-brand-blue'
              }`}
            >
              Recent Activity
            </button>
            <button
              onClick={() => setActiveTab('versions')}
              className={`min-w-[120px] sm:min-w-[140px] py-2.5 sm:py-3 text-xs sm:text-sm border-b-2 transition-colors whitespace-nowrap text-center ${
                activeTab === 'versions'
                  ? 'border-brand-blue text-brand-blue font-medium'
                  : 'border-transparent text-gray-600 hover:text-brand-blue'
              }`}
            >
              Version History
            </button>
            <button
              onClick={() => setActiveTab('info')}
              className={`min-w-[120px] sm:min-w-[140px] py-2.5 sm:py-3 text-xs sm:text-sm border-b-2 transition-colors whitespace-nowrap text-center ${
                activeTab === 'info'
                  ? 'border-brand-blue text-brand-blue font-medium'
                  : 'border-transparent text-gray-600 hover:text-brand-blue'
              }`}
            >
              Assessment Info
            </button>
            <button
              onClick={() => setActiveTab('viewjd')}
              className={`min-w-[120px] sm:min-w-[140px] py-2.5 sm:py-3 text-xs sm:text-sm border-b-2 transition-colors whitespace-nowrap text-center ${
                activeTab === 'viewjd'
                  ? 'border-brand-blue text-brand-blue font-medium'
                  : 'border-transparent text-gray-600 hover:text-brand-blue'
              }`}
            >
              View JD
            </button>
            <button
              onClick={() => setActiveTab('newversions')}
              className={`py-2.5 sm:py-3 text-xs sm:text-sm border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'newversions'
                  ? 'border-brand-blue text-brand-blue font-medium'
                  : 'border-transparent text-gray-600 hover:text-brand-blue'
              }`}
            >
              New Versions
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="py-3 sm:py-4 lg:py-6 w-full bg-white dark:bg-slate-900">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Assessment Details Section */}
            <div className="bg-white rounded-xl border border-gray-200 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
              <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-200">
                <h3 className="text-sm sm:text-base font-medium text-gray-900 flex items-center gap-2 tracking-tight">
                  <div className="w-9 h-9 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                    <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue" />
                  </div>
                  Assessment Details
                </h3>
              </div>

              <div className="p-3 sm:p-4 lg:p-6">
                {/* Total Duration Card */}
                <div className="bg-gradient-to-r from-brand-blue/5 to-brand-cyan/5 border border-brand-blue/15 rounded-xl p-4 mb-6 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-blue shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex items-center justify-center">
                      <Clock className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-600 mb-1">Total Duration</div>
                      <div className="text-xl font-semibold text-gray-900 tracking-tight">{formattedDuration}</div>
                    </div>
                  </div>
                  <span className="px-4 py-2 bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 text-sm font-medium rounded-lg">
                    100%
                  </span>
                </div>

                {/* Assessment Rounds */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-gray-700">Assessment Rounds</h4>

                  {assessment.hr_enabled && (
                    <div className="bg-slate-50 border border-gray-200 ring-1 ring-black/[0.02] rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="px-3 py-1 bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 text-sm font-medium rounded">
                          HR Round
                        </span>
                        <span className="px-3 py-1 bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 text-sm font-medium rounded-lg">
                          {assessment.hr_percentage}%
                        </span>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-700 mb-2">Topics Covered:</div>
                        <div className="flex flex-wrap gap-2">
                          {(assessment.hr_topics || []).length > 0 ? (
                            (assessment.hr_topics || []).map((topic: any, idx: number) => (
                              <span key={idx} className="px-2 py-1 bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 rounded text-xs">
                                {typeof topic === 'string' ? topic : topic?.text || JSON.stringify(topic)}
                              </span>
                            ))
                          ) : (
                            <span className="px-2 py-1 bg-slate-100 text-gray-600 ring-1 ring-gray-200 rounded text-xs">
                              N/A
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {assessment.technical_enabled && (
                    <div className="bg-slate-50 border border-gray-200 ring-1 ring-black/[0.02] rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="px-3 py-1 bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 text-sm font-medium rounded">
                          Technical Round
                        </span>
                        <span className="px-3 py-1 bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 text-sm font-medium rounded-lg">
                          {assessment.technical_percentage}%
                        </span>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-700 mb-2">Topics Covered:</div>
                        <div className="flex flex-wrap gap-2">
                          {(assessment.technical_topics || []).length > 0 ? (
                            (assessment.technical_topics || []).map((topic: any, idx: number) => (
                              <span key={idx} className="px-2 py-1 bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 rounded text-xs">
                                {typeof topic === 'string' ? topic : topic?.text || JSON.stringify(topic)}
                              </span>
                            ))
                          ) : (
                            <span className="px-2 py-1 bg-slate-100 text-gray-600 ring-1 ring-gray-200 rounded text-xs">
                              N/A
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {(() => {
                    // ==================== COMPILER AVAILABILITY CHECK ====================
                    // Only show coding section if coding_enabled AND at least one language has a compiler
                    if (!assessment.coding_enabled) return null;

                    const compilerLanguages = [
                      'python', 'python3', 'javascript', 'js', 'java',
                      'typescript', 'ts', 'cpp', 'c++', 'c', 'csharp', 'cs',
                      'go', 'rust', 'ruby', 'php', 'kotlin', 'swift', 'sql'
                    ];

                    const codingLanguages = assessment.coding_languages || [];
                    const hasCompiler = codingLanguages.some((lang: string) =>
                      compilerLanguages.includes(lang.toLowerCase())
                    );

                    if (!hasCompiler) return null;

                    return (
                    <div className="bg-slate-50 border border-gray-200 ring-1 ring-black/[0.02] rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="px-3 py-1 bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 text-sm font-medium rounded">
                          Coding Round
                        </span>
                        <span className="px-3 py-1 bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 text-sm font-medium rounded-lg">
                          {assessment.coding_percentage}%
                        </span>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-700 mb-2">Topics Covered:</div>
                        <div className="flex flex-wrap gap-2">
                          {(assessment.coding_topics || []).length > 0 ? (
                            (assessment.coding_topics || []).map((topic: any, idx: number) => (
                              <span key={idx} className="px-2 py-1 bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 rounded text-xs">
                                {typeof topic === 'string' ? topic : topic?.text || JSON.stringify(topic)}
                              </span>
                            ))
                          ) : (
                            <span className="px-2 py-1 bg-slate-100 text-gray-600 ring-1 ring-gray-200 rounded text-xs">
                              N/A
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    );
                  })()}
                </div>

                {/* Sections Details - Moved from Sections tab */}
                <div className="mt-8 pt-6 border-t border-gray-200">
                  <h4 className="text-sm font-medium text-gray-700 mb-4">Section Details</h4>
                  <div className="space-y-4">
                    {sections.length > 0 ? (
                      sections.map((section, index) => {
                        const SectionIcon = section.icon;
                        return (
                          <div key={section.type} className="bg-slate-50 rounded-xl border border-gray-200 ring-1 ring-black/[0.02] p-4">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-brand-blue shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex items-center justify-center text-white">
                                  <SectionIcon className="w-5 h-5" />
                                </div>
                                <div>
                                  <h5 className="text-gray-900 font-medium tracking-tight">{section.name}</h5>
                                  <div className="text-xs text-gray-600 mt-0.5">
                                    {section.percentage}% of total score
                                  </div>
                                </div>
                              </div>
                              <span className="px-3 py-1 bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 rounded-full text-xs font-medium">
                                {section.percentage} points
                              </span>
                            </div>

                            <div className="text-sm text-gray-700 mb-3">
                              {section.type === 'hr' && 'Evaluates communication skills, cultural fit, and behavioral competencies.'}
                              {section.type === 'technical' && 'Tests domain knowledge, technical concepts, and problem-solving abilities.'}
                              {section.type === 'coding' && 'Assesses programming skills through hands-on coding challenges.'}
                            </div>

                            {/* Topics */}
                            {section.topics.length > 0 && (
                              <div className="mb-3">
                                <div className="text-xs text-gray-600 mb-2 font-medium">Topics Covered</div>
                                <div className="flex flex-wrap gap-2">
                                  {section.topics.map((topic: any, i: number) => (
                                    <span key={i} className="px-2 py-1 bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 rounded text-xs">
                                      {typeof topic === 'string' ? topic : topic?.text || JSON.stringify(topic)}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Coding Languages */}
                            {section.type === 'coding' && section.languages && section.languages.length > 0 && (
                              <div className="mb-3">
                                <div className="text-xs text-gray-600 mb-2 font-medium">Programming Languages</div>
                                <div className="flex flex-wrap gap-2">
                                  {section.languages.map((lang, i) => (
                                    <span key={i} className="px-2 py-1 bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20 rounded text-xs font-mono">
                                      {lang}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                              <div className="p-2 bg-white rounded-lg border border-gray-200 ring-1 ring-black/[0.02]">
                                <div className="text-xs text-gray-600 mb-1">Question Type</div>
                                <div className="text-xs text-gray-900 font-medium">
                                  {section.type === 'coding' ? 'Code Challenge' : 'Mixed Format'}
                                </div>
                              </div>
                              <div className="p-2 bg-white rounded-lg border border-gray-200 ring-1 ring-black/[0.02]">
                                <div className="text-xs text-gray-600 mb-1">Time Allocation</div>
                                <div className="text-xs text-gray-900 font-medium">
                                  {Math.round((assessment.duration_minutes || 30) * (section.percentage / 100))} min
                                </div>
                              </div>
                              <div className="p-2 bg-white rounded-lg border border-gray-200 ring-1 ring-black/[0.02]">
                                <div className="text-xs text-gray-600 mb-1">Weightage</div>
                                <div className="text-xs text-gray-900 font-medium">{section.percentage}%</div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="bg-slate-50 rounded-xl border-2 border-dashed border-brand-blue/20 p-8 text-center">
                        <FileText className="w-12 h-12 text-brand-blue/40 mx-auto mb-3" />
                        <p className="text-gray-600 text-sm">No sections configured</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Analytics - Moved from Analytics tab */}
                <div className="mt-8 pt-6 border-t border-gray-200">
                  <h4 className="text-sm font-medium text-gray-700 mb-4">Performance Analytics</h4>

                  {analyticsData.completed === 0 ? (
                    <div className="text-center py-8 bg-slate-50 rounded-xl border border-gray-200 ring-1 ring-black/[0.02]">
                      <TrendingUp className="w-10 h-10 text-brand-blue/30 mx-auto mb-2" />
                      <p className="text-gray-600 text-sm mb-1">No performance data available yet</p>
                      <p className="text-xs text-gray-500">Data will appear after candidates complete the assessment</p>
                    </div>
                  ) : (
                    <div className={`grid grid-cols-1 ${assessment.technical_enabled && assessment.coding_enabled ? 'md:grid-cols-2' : ''} gap-6`}>
                      {/* Technical Performance */}
                      {assessment.technical_enabled && (
                        <div className="bg-slate-50 border border-gray-200 ring-1 ring-black/[0.02] rounded-xl p-4">
                          <h5 className="text-sm font-semibold text-gray-900 mb-4 tracking-tight">Technical Performance</h5>
                          <div className="space-y-3">
                            {(() => {
                              const completedInvites = _uniqueInvites.filter((a: any) => _bucket(a) === 'completed');
                              const denom = completedInvites.length || analyticsData.completed || 0;
                              const pct = (count: number) => denom > 0 ? Math.min(100, Math.round((count / denom) * 100)) : 0;
                              const passed = completedInvites.filter((a: any) => (a.technical_score || 0) >= 70).length;
                              const average = completedInvites.filter((a: any) => (a.technical_score || 0) >= 50 && (a.technical_score || 0) < 70).length;
                              const below = completedInvites.filter((a: any) => (a.technical_score || 0) < 50).length;
                              return (
                                <>
                                  {/* Passed (≥70%) */}
                                  <div>
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-sm text-gray-700">Passed (≥70%)</span>
                                      <span className="text-sm font-semibold text-green-700">{pct(passed)}%</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2">
                                      <div
                                        className="bg-gradient-to-r from-green-500 to-green-600 h-2 rounded-full transition-all"
                                        style={{ width: `${pct(passed)}%` }}
                                      ></div>
                                    </div>
                                  </div>

                                  {/* Average (50-69%) */}
                                  <div>
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-sm text-gray-700">Average (50-69%)</span>
                                      <span className="text-sm font-semibold text-brand-orange-deep">{pct(average)}%</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2">
                                      <div
                                        className="bg-brand-orange h-2 rounded-full transition-all"
                                        style={{ width: `${pct(average)}%` }}
                                      ></div>
                                    </div>
                                  </div>

                                  {/* Below Average (<50%) */}
                                  <div>
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-sm text-gray-700">Below Average (&lt;50%)</span>
                                      <span className="text-sm font-semibold text-red-600">{pct(below)}%</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2">
                                      <div
                                        className="bg-gradient-to-r from-red-400 to-red-500 h-2 rounded-full transition-all"
                                        style={{ width: `${pct(below)}%` }}
                                      ></div>
                                    </div>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      )}

                      {/* Coding Performance */}
                      {assessment.coding_enabled && (
                        <div className="bg-slate-50 border border-gray-200 ring-1 ring-black/[0.02] rounded-xl p-4">
                          <h5 className="text-sm font-semibold text-gray-900 mb-4 tracking-tight">Coding Performance</h5>
                          <div className="space-y-3">
                            {(() => {
                              const completedInvites = _uniqueInvites.filter((a: any) => _bucket(a) === 'completed');
                              const denom = completedInvites.length || analyticsData.completed || 0;
                              const pct = (count: number) => denom > 0 ? Math.min(100, Math.round((count / denom) * 100)) : 0;
                              const passed = completedInvites.filter((a: any) => (a.coding_score || 0) >= 70).length;
                              const average = completedInvites.filter((a: any) => (a.coding_score || 0) >= 50 && (a.coding_score || 0) < 70).length;
                              const below = completedInvites.filter((a: any) => (a.coding_score || 0) < 50).length;
                              return (
                                <>
                                  {/* Passed (≥70%) */}
                                  <div>
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-sm text-gray-700">Passed (≥70%)</span>
                                      <span className="text-sm font-semibold text-green-700">{pct(passed)}%</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2">
                                      <div
                                        className="bg-gradient-to-r from-green-500 to-green-600 h-2 rounded-full transition-all"
                                        style={{ width: `${pct(passed)}%` }}
                                      ></div>
                                    </div>
                                  </div>

                                  {/* Average (50-69%) */}
                                  <div>
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-sm text-gray-700">Average (50-69%)</span>
                                      <span className="text-sm font-semibold text-brand-orange-deep">{pct(average)}%</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2">
                                      <div
                                        className="bg-brand-orange h-2 rounded-full transition-all"
                                        style={{ width: `${pct(average)}%` }}
                                      ></div>
                                    </div>
                                  </div>

                                  {/* Below Average (<50%) */}
                                  <div>
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-sm text-gray-700">Below Average (&lt;50%)</span>
                                      <span className="text-sm font-semibold text-red-600">{pct(below)}%</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2">
                                      <div
                                        className="bg-gradient-to-r from-red-400 to-red-500 h-2 rounded-full transition-all"
                                        style={{ width: `${pct(below)}%` }}
                                      ></div>
                                    </div>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Invitation Status Section */}
            <div className="bg-white rounded-xl border border-gray-200 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
              <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
                <h3 className="text-sm sm:text-base font-medium text-gray-900 flex items-center gap-2 tracking-tight">
                  <div className="w-9 h-9 rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center">
                    <Mail className="w-4 h-4 sm:w-5 sm:h-5 text-brand-cyan" />
                  </div>
                  Invitation Status
                </h3>
                <button
                  onClick={() => setActiveTab('activity')}
                  className="px-3 py-1.5 sm:px-4 sm:py-2 bg-brand-blue hover:bg-brand-blue-2 text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10 text-xs sm:text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 sm:gap-2 w-fit"
                >
                  <ExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  View Full Tracking
                </button>
              </div>

              <div className="p-3 sm:p-4 lg:p-6">
                {/* Quick Stats — mirrors the Track Invites popup card row:
                    Total Invited / Expired / Invite Failed / In Progress /
                    Completed / Completion Rate. */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 lg:gap-4 mb-4 sm:mb-6">
                  <div className="bg-gradient-to-br from-brand-blue/5 to-brand-cyan/5 border border-brand-blue/15 rounded-xl p-2.5 sm:p-3 lg:p-4">
                    <div className="flex items-center gap-1.5 sm:gap-2 text-brand-blue text-xs mb-1.5 sm:mb-2">
                      <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span>Total Invited</span>
                    </div>
                    <div className="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-900 tracking-tight">{analyticsData.totalInvites}</div>
                  </div>

                  <div className="bg-brand-orange/5 border border-brand-orange/20 rounded-xl p-2.5 sm:p-3 lg:p-4">
                    <div className="flex items-center gap-1.5 sm:gap-2 text-brand-orange-deep text-xs mb-1.5 sm:mb-2">
                      <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span>Expired</span>
                    </div>
                    <div className="text-lg sm:text-xl lg:text-2xl font-semibold text-brand-orange-deep tracking-tight">{analyticsData.expired}</div>
                  </div>

                  <div className="bg-red-50 border border-red-200 rounded-xl p-2.5 sm:p-3 lg:p-4">
                    <div className="flex items-center gap-1.5 sm:gap-2 text-red-600 text-xs mb-1.5 sm:mb-2">
                      <XCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span>Invite Failed</span>
                    </div>
                    <div className="text-lg sm:text-xl lg:text-2xl font-semibold text-red-600 tracking-tight">{analyticsData.failed}</div>
                  </div>

                  <div className="bg-gradient-to-br from-brand-cyan/5 to-brand-teal/5 border border-brand-cyan/15 rounded-xl p-2.5 sm:p-3 lg:p-4">
                    <div className="flex items-center gap-1.5 sm:gap-2 text-brand-cyan text-xs mb-1.5 sm:mb-2">
                      <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span>In Progress</span>
                    </div>
                    <div className="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-900 tracking-tight">{analyticsData.started}</div>
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded-xl p-2.5 sm:p-3 lg:p-4">
                    <div className="flex items-center gap-1.5 sm:gap-2 text-green-700 text-xs mb-1.5 sm:mb-2">
                      <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span>Completed</span>
                    </div>
                    <div className="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-900 tracking-tight">{analyticsData.completed}</div>
                  </div>

                  <div className="bg-gradient-to-br from-brand-blue/5 to-brand-blue-2/5 border border-brand-blue/15 rounded-xl p-2.5 sm:p-3 lg:p-4">
                    <div className="flex items-center gap-1.5 sm:gap-2 text-brand-blue text-xs mb-1.5 sm:mb-2">
                      <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span>Completion Rate</span>
                    </div>
                    <div className="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-900 tracking-tight">{analyticsData.completionRate}%</div>
                  </div>
                </div>

                {/* Recent Invitations */}
                <div>
                  <h4 className="text-xs sm:text-sm font-medium text-gray-700 mb-2 sm:mb-3">Recent Invitations</h4>
                  {activityLoading ? (
                    <div className="py-8 sm:py-12 text-center">
                      <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 text-brand-blue animate-spin mx-auto mb-2 sm:mb-3" />
                      <p className="text-gray-600 text-xs sm:text-sm">Loading invitations...</p>
                    </div>
                  ) : recentActivity.length === 0 ? (
                    <div className="py-8 sm:py-12 text-center border-2 border-dashed border-brand-blue/20 rounded-xl">
                      <Mail className="w-8 h-8 sm:w-12 sm:h-12 text-brand-blue/30 mx-auto mb-2 sm:mb-3" />
                      <p className="text-gray-600 mb-1 text-xs sm:text-sm">No invitations sent yet</p>
                      <p className="text-xs sm:text-sm text-gray-500">Invite candidates to start tracking their progress</p>
                    </div>
                  ) : (
                    <div className="space-y-2 sm:space-y-3">
                      {/* `recentActivity` is an EXPANDED timeline (one entry per
                          lifecycle event — invited / sent / opened / started /
                          completed / bounced / expired). The Recent Activity tab
                          renders all of them, but this Recent Invitations card
                          must show ONE row per invitation, otherwise a single
                          candidate whose invite has both `created_at` and `sent_at`
                          shows up 2–3 times. Dedupe by invitation id, keeping
                          the most recent event so the status/scores reflect the
                          latest known state. */}
                      {(() => {
                        const seen = new Set<string>();
                        const uniqueInvitations: any[] = [];
                        for (const ev of recentActivity) {
                          const key = ev.id || `${ev.candidate_email || ''}__${ev.created_at || ''}`;
                          if (seen.has(key)) continue;
                          seen.add(key);
                          uniqueInvitations.push(ev);
                        }
                        return uniqueInvitations.slice(0, 5);
                      })().map((activity: any) => {
                        const getStatusBadge = () => {
                          if (activity.status === 'completed') {
                            return { color: 'bg-green-100 text-green-700 ring-1 ring-green-200', label: 'Completed' };
                          } else if (activity.status === 'in_progress') {
                            return { color: 'bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20', label: 'In Progress' };
                          } else if (activity.status === 'sent') {
                            return { color: 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20', label: 'Sent' };
                          } else if (activity.status === 'failed') {
                            return { color: 'bg-red-100 text-red-700 ring-1 ring-red-200', label: 'Failed' };
                          }
                          return { color: 'bg-slate-100 text-gray-700 ring-1 ring-gray-200', label: 'Pending' };
                        };

                        const statusBadge = getStatusBadge();
                        const activityDate = activity.sent_at || activity.created_at;
                        const formattedDate = activityDate ? formatIST(activityDate) : 'N/A';

                        return (
                          <div key={activity.id} className="bg-slate-50 rounded-xl border border-gray-200 ring-1 ring-black/[0.02] p-2.5 sm:p-3 lg:p-4 hover:bg-brand-blue/5 transition-colors">
                            <div className="flex items-center gap-2 sm:gap-3 lg:gap-4">
                              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-brand-blue shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex items-center justify-center text-white font-semibold flex-shrink-0 text-xs sm:text-sm">
                                {activity.candidate_name?.charAt(0).toUpperCase() || 'U'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-1 gap-0.5 sm:gap-0">
                                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                    <span className="font-medium text-gray-900 text-xs sm:text-sm truncate">{activity.candidate_name || 'Unknown'}</span>
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusBadge.color}`}>
                                      {statusBadge.label}
                                    </span>
                                  </div>
                                  {activity.status === 'completed' && (
                                    <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                                      {/* Show Tech Score if technical section is enabled */}
                                      {assessment.technical_enabled && activity.technical_score != null && (
                                        <div className="flex items-center gap-1">
                                          <span className="text-xs text-gray-600">Tech</span>
                                          <span className="font-semibold text-gray-900 text-xs sm:text-sm">{Math.round(activity.technical_score)}%</span>
                                        </div>
                                      )}
                                      {/* Show Coding Score if coding section is enabled */}
                                      {assessment.coding_enabled && activity.coding_score != null && (
                                        <div className="flex items-center gap-1">
                                          <span className="text-xs text-gray-600">Coding</span>
                                          <span className="font-semibold text-gray-900 text-xs sm:text-sm">{Math.round(activity.coding_score)}%</span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-xs text-gray-600">
                                  <span className="flex items-center gap-1 truncate">
                                    <Mail className="w-3 h-3 flex-shrink-0" />
                                    <span className="truncate">{activity.candidate_email}</span>
                                  </span>
                                  <span className="flex items-center gap-1 whitespace-nowrap">
                                    <Calendar className="w-3 h-3 flex-shrink-0" />
                                    Sent: {formattedDate}
                                  </span>
                                </div>
                                {activity.status === 'in_progress' && activity.progress != null && (
                                  <div className="mt-2">
                                    <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                                      <span>{activity.progress}% Complete</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2">
                                      <div
                                        className="bg-gradient-to-r from-brand-blue to-brand-cyan h-2 rounded-full transition-all"
                                        style={{ width: `${activity.progress}%` }}
                                      ></div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Assessment Guidance — mirrors the JD view's guidance section so
                recruiters see it without switching to the View JD tab. */}
            {jdData?.assessment_guidance && (
              <div className="bg-white rounded-xl border border-gray-200 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
                <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-200">
                  <h3 className="text-sm sm:text-base font-medium text-gray-900 flex items-center gap-2 tracking-tight">
                    <div className="w-9 h-9 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                      <Info className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue" />
                    </div>
                    Assessment Guidance
                  </h3>
                </div>
                <div className="p-3 sm:p-4 lg:p-6">
                  <div className="px-3 sm:px-4 py-3 sm:py-4 bg-brand-blue/5 rounded-lg ring-1 ring-brand-blue/15 text-sm text-gray-800">
                    <div className="markdown-content leading-relaxed">
                      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                        {jdData.assessment_guidance}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Activity Tab */}
        {activeTab === 'activity' && (
          <div className="bg-white rounded-xl border border-gray-200 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
            <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-200">
              <h3 className="text-sm sm:text-base lg:text-lg text-gray-900 tracking-tight flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center">
                  <BarChart className="w-4 h-4 sm:w-5 sm:h-5 text-brand-cyan" />
                </div>
                Recent Activity
              </h3>
            </div>

            {activityLoading ? (
              <div className="px-3 sm:px-4 lg:px-6 py-8 sm:py-12 text-center">
                <Loader2 className="w-8 h-8 text-brand-blue animate-spin mx-auto mb-3" />
                <p className="text-gray-600">Loading activity...</p>
              </div>
            ) : recentActivity.length === 0 ? (
              <div className="px-3 sm:px-4 lg:px-6 py-8 sm:py-12 text-center">
                <Calendar className="w-8 h-8 sm:w-12 sm:h-12 text-brand-blue/30 mx-auto mb-2 sm:mb-3" />
                <p className="text-gray-600 mb-1 text-sm">No activity recorded yet</p>
                <p className="text-xs sm:text-sm text-gray-500">Activity will appear here as candidates take the assessment</p>
              </div>
            ) : (() => {
              const totalPages = Math.max(1, Math.ceil(recentActivity.length / ACTIVITY_PAGE_SIZE));
              const startIdx = (activityPage - 1) * ACTIVITY_PAGE_SIZE;
              const pageItems = recentActivity.slice(startIdx, startIdx + ACTIVITY_PAGE_SIZE);
              // Open a completed candidate's result details. Stores the ordered
              // list of completed candidates (with a resolvable attempt_id) so
              // the details view offers Prev/Next between them — mirrors the
              // Results page + Track-Invites flow.
              const openCompletedResult = (activity: any) => {
                if (!activity.attempt_id) return;
                try {
                  const navList = recentActivity
                    .filter((e: any) => e._eventType === 'completed' && e.attempt_id)
                    .map((e: any) => ({ id: e.attempt_id, cid: e.candidate_display_id || '' }));
                  sessionStorage.setItem('assessmentResultNavList', JSON.stringify(navList));
                } catch { /* ignore quota errors */ }
                router.push(
                  `/recruitment/assessments/${assessment.id}/results/details`
                  + `?candidate_id=${activity.attempt_id}`
                  + `${activity.candidate_display_id ? `&cid=${encodeURIComponent(activity.candidate_display_id)}` : ''}`
                );
              };
              return (
                <>
                  <div className="divide-y divide-gray-100">
                    {pageItems.map((activity: any, idx: number) => {
                      // Per-event icon + label, derived from _eventType so each
                      // lifecycle moment (invited, sent, opened, started,
                      // completed, bounced, expired) renders as its own row.
                      const getActivityInfo = () => {
                        switch (activity._eventType) {
                          case 'completed':
                            return { icon: CheckCircle, color: 'text-green-700 bg-green-100 ring-1 ring-green-200', label: 'Completed assessment' };
                          case 'started':
                            return { icon: Play, color: 'text-brand-cyan bg-brand-cyan/10 ring-1 ring-brand-cyan/20', label: 'Assessment started' };
                          case 'opened':
                            return { icon: Eye, color: 'text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20', label: 'Link opened' };
                          case 'sent':
                            return { icon: Mail, color: 'text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20', label: 'Invitation email sent' };
                          case 'bounced':
                            return { icon: XCircle, color: 'text-red-700 bg-red-100 ring-1 ring-red-200', label: 'Email bounced' };
                          case 'expired':
                            return { icon: XCircle, color: 'text-brand-orange-deep bg-brand-orange/10 ring-1 ring-brand-orange/20', label: 'Invitation expired' };
                          case 'invited':
                          default:
                            return { icon: Mail, color: 'text-gray-600 bg-slate-100 ring-1 ring-gray-200', label: 'Invited to assessment' };
                        }
                      };

                      const info = getActivityInfo();
                      const ActivityIcon = info.icon;
                      const formattedDate = activity._eventAt ? formatIST(activity._eventAt) : 'N/A';
                      const showScores = activity._eventType === 'completed';
                      // Only completed rows with a resolvable attempt open the
                      // candidate's result details; other lifecycle events stay
                      // as a read-only log.
                      const isClickable = showScores && !!activity.attempt_id;

                      return (
                        <div
                          key={`${activity.id}-${activity._eventType}-${idx}`}
                          onClick={isClickable ? () => openCompletedResult(activity) : undefined}
                          title={isClickable ? 'View candidate results' : undefined}
                          className={`px-3 sm:px-4 lg:px-6 py-3 sm:py-4 transition-colors ${isClickable ? 'cursor-pointer hover:bg-brand-blue/5' : ''}`}
                        >
                          <div className="flex items-start sm:items-center gap-2 sm:gap-3 lg:gap-4">
                            <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${info.color}`}>
                              <ActivityIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 sm:gap-0">
                                <div className="min-w-0">
                                  <span className="font-medium text-gray-900 text-xs sm:text-sm">{activity.candidate_name || 'Unknown'}</span>
                                  <span className="text-gray-500 ml-1 sm:ml-2 text-xs sm:text-sm">{info.label}</span>
                                </div>
                                <span className="text-xs sm:text-sm text-gray-500">{formattedDate}</span>
                              </div>
                              <p className="text-xs sm:text-sm text-gray-600 mt-0.5 truncate">{activity.candidate_email}</p>
                              {showScores && (
                                <div className="flex items-center gap-3 mt-2">
                                  {assessment.technical_enabled && activity.technical_score != null && (
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs text-gray-600">Tech:</span>
                                      <span className="text-sm font-semibold text-gray-900">{Math.round(activity.technical_score)}%</span>
                                    </div>
                                  )}
                                  {assessment.coding_enabled && activity.coding_score != null && (
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs text-gray-600">Coding:</span>
                                      <span className="text-sm font-semibold text-gray-900">{Math.round(activity.coding_score)}%</span>
                                    </div>
                                  )}
                                  {activity.passed != null && (
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${activity.passed ? 'bg-green-100 text-green-700 ring-1 ring-green-200' : 'bg-red-100 text-red-700 ring-1 ring-red-200'}`}>
                                      {activity.passed ? 'Passed' : 'Failed'}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Pagination — 10 events per page. */}
                  {recentActivity.length > ACTIVITY_PAGE_SIZE && (
                    <div className="px-3 sm:px-4 lg:px-6 py-3 border-t border-gray-200 flex items-center justify-between text-xs sm:text-sm text-gray-600">
                      <span>
                        Showing {startIdx + 1}–{Math.min(startIdx + ACTIVITY_PAGE_SIZE, recentActivity.length)} of {recentActivity.length}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setActivityPage(p => Math.max(1, p - 1))}
                          disabled={activityPage <= 1}
                          className="px-3 py-1 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Previous
                        </button>
                        <span className="px-2">
                          Page {activityPage} of {totalPages}
                        </span>
                        <button
                          type="button"
                          onClick={() => setActivityPage(p => Math.min(totalPages, p + 1))}
                          disabled={activityPage >= totalPages}
                          className="px-3 py-1 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* Version History Tab */}
        {activeTab === 'versions' && (
          <div className="bg-white rounded-xl border border-gray-200 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
            <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-200">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-9 h-9 rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center">
                  <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-brand-cyan" />
                </div>
                <h3 className="text-sm sm:text-base font-medium text-gray-900 tracking-tight">Version History</h3>
              </div>
              <p className="text-xs sm:text-sm text-gray-600">Complete timeline of all changes made to this assessment</p>
            </div>

            {versionsLoading ? (
              <div className="px-3 sm:px-4 lg:px-6 py-8 sm:py-12 text-center">
                <Loader2 className="w-8 h-8 text-brand-blue animate-spin mx-auto mb-3" />
                <p className="text-gray-600">Loading version history...</p>
              </div>
            ) : versionHistory.length === 0 ? (
              <div className="px-3 sm:px-4 lg:px-6 py-8 sm:py-12 text-center">
                <Clock className="w-8 h-8 sm:w-12 sm:h-12 text-brand-blue/30 mx-auto mb-2 sm:mb-3" />
                <p className="text-gray-600 mb-1 text-sm">No version history available</p>
                <p className="text-xs sm:text-sm text-gray-500">Version history will appear when the assessment is edited</p>
              </div>
            ) : (
              <div className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
                {versionHistory.map((version: any, idx: number) => {
                  const isCurrentVersion = idx === 0;
                  const versionDate = formatIST(version.created_at);

                  return (
                    <div key={version.id} className="space-y-4">
                      {/* Version Header */}
                      <div className="flex items-start gap-2 sm:gap-3 lg:gap-4">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 lg:w-12 lg:h-12 rounded-full bg-brand-cyan shadow-sm shadow-brand-cyan/25 ring-1 ring-white/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-white font-bold text-xs sm:text-sm">V{version.version}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1">
                            <h4 className="text-sm sm:text-base font-semibold text-gray-900 tracking-tight">
                              Version {version.version} {version.version === 1 ? 'Published' : 'Updated'}
                            </h4>
                            {isCurrentVersion && (
                              <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 text-xs font-medium rounded w-fit">
                                Current Version
                              </span>
                            )}
                          </div>
                          <p className="text-xs sm:text-sm text-gray-600 mb-2 sm:mb-3">
                            {version.version === 1 ? 'Initial assessment created and published' : (version.change_summary || 'Assessment configuration updated')}
                          </p>

                          {/* User & Date Info */}
                          <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-700 mb-1 flex-wrap">
                            <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
                            <span className="font-medium">{version.changed_by_name || 'Unknown User'}</span>
                            <span className="text-gray-400">•</span>
                            <span className="text-gray-600">Lead Recruiter</span>
                          </div>

                          <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4 flex-wrap">
                            <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
                            <span>Published on {versionDate} IST (UTC+5:30)</span>
                          </div>

                          {/* Configuration Details */}
                          <div className="bg-slate-50 border border-gray-200 ring-1 ring-black/[0.02] rounded-xl p-2.5 sm:p-3 lg:p-4">
                            <div className="text-xs sm:text-sm font-medium text-gray-900 mb-2 sm:mb-3 tracking-tight">
                              {version.version === 1 ? 'Initial Configuration:' : 'Updated Configuration:'}
                            </div>
                            <ul className="space-y-1.5 sm:space-y-2">
                              <li className="text-xs sm:text-sm text-gray-700 flex items-start gap-1.5 sm:gap-2">
                                <span className="text-brand-blue mt-0.5">•</span>
                                <span>Assessment type: {[
                                  version.hr_enabled && 'HR',
                                  version.technical_enabled && 'Technical',
                                  version.coding_enabled && 'Coding'
                                ].filter(Boolean).join(', ')}</span>
                              </li>
                              <li className="text-xs sm:text-sm text-gray-700 flex items-start gap-1.5 sm:gap-2">
                                <span className="text-brand-blue mt-0.5">•</span>
                                <span>Duration set to {assessment.duration_minutes || 60} min</span>
                              </li>
                              {assessment.title && (
                                <li className="text-xs sm:text-sm text-gray-700 flex items-start gap-1.5 sm:gap-2">
                                  <span className="text-brand-blue mt-0.5">•</span>
                                  <span>Linked to job posting: {stripVersionFromTitle(assessment.title)}</span>
                                </li>
                              )}
                              <li className="text-xs sm:text-sm text-gray-700 flex items-start gap-1.5 sm:gap-2">
                                <span className="text-brand-blue mt-0.5">•</span>
                                <span>Proctoring {assessment.proctoring_enabled ? 'enabled' : 'disabled'} with AI monitoring</span>
                              </li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* New Versions tab — lists sibling assessments (V1 + clones)
            sharing this assessment's jd_id. Separate from the per-row
            edit history rendered by the Versions tab above. */}
        {activeTab === 'newversions' && (
          <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
            <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-100">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-9 h-9 rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center">
                  <Layers className="w-4 h-4 sm:w-5 sm:h-5 text-brand-cyan" />
                </div>
                <h3 className="text-sm sm:text-base font-medium text-gray-900 tracking-tight">New Versions</h3>
              </div>
              <p className="text-xs sm:text-sm text-gray-600">All versions of this assessment (V1 is the original; V2 and V3 are duplicates).</p>
            </div>

            {siblingsLoading ? (
              <div className="px-3 sm:px-4 lg:px-6 py-8 sm:py-12 text-center">
                <Loader2 className="w-8 h-8 text-brand-blue animate-spin mx-auto mb-3" />
                <p className="text-gray-600">Loading versions...</p>
              </div>
            ) : siblingVersions.length === 0 ? (
              <div className="px-3 sm:px-4 lg:px-6 py-8 sm:py-12 text-center">
                <Layers className="w-8 h-8 sm:w-12 sm:h-12 text-brand-blue/30 mx-auto mb-2 sm:mb-3" />
                <p className="text-gray-600 mb-1 text-sm">No additional versions yet</p>
                <p className="text-xs sm:text-sm text-gray-500">Duplicate this assessment to create additional versions</p>
              </div>
            ) : (
              <div className="p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4">
                {siblingVersions.map((sibling: any) => {
                  const isThis = sibling.id === assessment.id;
                  const enabledSections = [
                    sibling.hr_enabled && 'HR',
                    sibling.technical_enabled && 'Technical',
                    sibling.coding_enabled && 'Coding',
                  ].filter(Boolean).join(', ') || '—';
                  const statusRaw = String(sibling.status || '').toLowerCase();
                  const statusLabel = statusRaw === 'published' ? 'Active'
                    : statusRaw === 'closed' ? 'Completed'
                    : statusRaw === 'archived' ? 'Archived'
                    : 'Draft';
                  const statusChipClass = statusRaw === 'published'
                    ? 'bg-green-100 text-green-800 ring-1 ring-green-200'
                    : statusRaw === 'archived'
                    ? 'bg-gray-100 text-gray-700 ring-1 ring-gray-200'
                    : statusRaw === 'closed'
                    ? 'bg-blue-100 text-blue-800 ring-1 ring-blue-200'
                    : 'bg-amber-100 text-amber-800 ring-1 ring-amber-200';

                  return (
                    <div
                      key={sibling.id}
                      className={`rounded-xl border p-3 sm:p-4 ring-1 ring-black/[0.02] ${
                        isThis ? 'border-brand-blue/40 bg-brand-blue/5' : 'border-gray-100 bg-white'
                      }`}
                    >
                      <div className="flex items-start gap-3 sm:gap-4">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-brand-cyan shadow-sm shadow-brand-cyan/25 ring-1 ring-white/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-white font-bold text-xs sm:text-sm">V{sibling.version || 1}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 mb-1.5">
                            <h4 className="text-sm sm:text-base font-semibold text-gray-900 tracking-tight truncate">
                              {stripVersionFromTitle(sibling.title || '') || sibling.short_id || 'Untitled assessment'}
                              {sibling.version ? ` - Version ${sibling.version}` : ''}
                            </h4>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusChipClass}`}>
                                {statusLabel}
                              </span>
                              {isThis && (
                                <span className="px-2 py-0.5 bg-brand-blue text-white shadow-sm shadow-brand-blue/25 text-xs font-medium rounded">
                                  Viewing
                                </span>
                              )}
                              {sibling.short_id && (
                                <span className="px-2 py-0.5 bg-slate-100 text-gray-700 ring-1 ring-gray-200 text-xs font-medium rounded">
                                  {sibling.short_id}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs sm:text-sm text-gray-700 mt-2">
                            <div className="flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                              <span>Created by</span>
                              <span className="font-medium truncate">{sibling.created_by_name || 'Unknown'}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                              <span>{formatIST(sibling.created_at)}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                              <span>{sibling.duration_minutes || assessment.duration_minutes || 30} min</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                              <span>{enabledSections}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                              <span>{sibling.invitations_count || 0} invited</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <CheckCircle className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                              <span>{sibling.completed_count || 0} completed</span>
                            </div>
                          </div>

                          {/* Compare with dropdown — only show when there are other
                              siblings to compare against. */}
                          {siblingVersions.length > 1 && (
                            <div className="mt-3 pt-3 border-t border-gray-100">
                              <div className="flex items-center gap-2 flex-wrap">
                                <label className="text-xs font-medium text-gray-600 inline-flex items-center gap-1.5">
                                  <Layers className="w-3.5 h-3.5 text-gray-500" />
                                  Compare with
                                </label>
                                <select
                                  value={compareSelection[sibling.id] || ''}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setCompareSelection(prev => {
                                      const next = { ...prev };
                                      if (v) next[sibling.id] = v;
                                      else delete next[sibling.id];
                                      return next;
                                    });
                                  }}
                                  className="text-xs px-2 py-1 rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-brand-blue/40 focus:outline-none focus:border-brand-blue/60 focus:ring-1 focus:ring-brand-blue/30"
                                >
                                  <option value="">— select a version —</option>
                                  {siblingVersions
                                    .filter((other: any) => other.id !== sibling.id)
                                    .map((other: any) => (
                                      <option key={other.id} value={other.id}>
                                        Version {other.version || 1}
                                        {other.short_id ? ` (${other.short_id})` : ''}
                                      </option>
                                    ))}
                                </select>
                                {compareSelection[sibling.id] && (
                                  <button
                                    onClick={() => {
                                      setCompareSelection(prev => {
                                        const next = { ...prev };
                                        delete next[sibling.id];
                                        return next;
                                      });
                                    }}
                                    className="text-xs text-gray-500 hover:text-red-600 transition-colors"
                                  >
                                    Clear
                                  </button>
                                )}
                              </div>

                              {/* Diff panel */}
                              {compareSelection[sibling.id] && (() => {
                                const other = siblingVersions.find((s: any) => s.id === compareSelection[sibling.id]);
                                if (!other) return null;
                                // Older version is the smaller version number so the
                                // diff reads naturally as "old → new". If versions
                                // are equal we keep the user's pick as the older.
                                const [olderVer, newerVer] = (sibling.version || 1) <= (other.version || 1)
                                  ? [sibling, other] : [other, sibling];
                                const diff = computeVersionDiff(olderVer, newerVer);
                                const descKey = `${sibling.id}:${other.id}`;
                                return (
                                  <div className="mt-3 rounded-lg border border-brand-blue/20 bg-brand-blue/5 p-3">
                                    <div className="text-xs font-medium text-brand-blue mb-2 flex items-center gap-1.5">
                                      <ArrowLeft className="w-3 h-3 rotate-180" />
                                      Changes from Version {olderVer.version || 1} → Version {newerVer.version || 1}
                                    </div>
                                    {diff.length === 0 ? (
                                      <p className="text-xs text-gray-600">No content differences between these versions.</p>
                                    ) : (
                                      <div className="space-y-2">
                                        {diff.map((row, idx) => (
                                          <div key={`${row.field}-${idx}`} className="text-xs">
                                            <div className="font-medium text-gray-900 mb-0.5">{row.label}</div>
                                            {row.kind === 'list' ? (
                                              <div className="flex flex-wrap gap-1.5">
                                                {(row.added || []).map((a, i) => (
                                                  <span key={`add-${i}`} className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 ring-1 ring-green-200 rounded text-xs">
                                                    + {a}
                                                  </span>
                                                ))}
                                                {(row.removed || []).map((r, i) => (
                                                  <span key={`rm-${i}`} className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-700 ring-1 ring-red-200 rounded text-xs line-through">
                                                    − {r}
                                                  </span>
                                                ))}
                                              </div>
                                            ) : row.kind === 'description' ? (
                                              <div>
                                                <button
                                                  onClick={() => setExpandedDescriptions(prev => ({ ...prev, [descKey]: !prev[descKey] }))}
                                                  className="text-xs text-brand-blue hover:underline"
                                                >
                                                  {expandedDescriptions[descKey] ? 'Hide' : 'Show'} description change
                                                </button>
                                                {expandedDescriptions[descKey] && (
                                                  <div className="mt-2 grid grid-cols-1 lg:grid-cols-2 gap-2">
                                                    <div className="rounded border border-red-200 bg-red-50/40 p-2">
                                                      <div className="text-xs font-medium text-red-700 mb-1">V{olderVer.version || 1}</div>
                                                      <div className="text-xs text-gray-700 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                                                        {row.oldValue || <em className="text-gray-400">empty</em>}
                                                      </div>
                                                    </div>
                                                    <div className="rounded border border-green-200 bg-green-50/40 p-2">
                                                      <div className="text-xs font-medium text-green-700 mb-1">V{newerVer.version || 1}</div>
                                                      <div className="text-xs text-gray-700 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                                                        {row.newValue || <em className="text-gray-400">empty</em>}
                                                      </div>
                                                    </div>
                                                  </div>
                                                )}
                                              </div>
                                            ) : (
                                              <div className="flex items-center gap-2 flex-wrap">
                                                <span className="px-2 py-0.5 bg-red-50 text-red-700 ring-1 ring-red-200 rounded text-xs line-through">
                                                  {String(row.oldValue ?? '—')}
                                                </span>
                                                <span className="text-gray-400">→</span>
                                                <span className="px-2 py-0.5 bg-green-50 text-green-700 ring-1 ring-green-200 rounded text-xs">
                                                  {String(row.newValue ?? '—')}
                                                </span>
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      {/* Assessment Info Tab */}
      {activeTab === 'info' && (() => {
        const complexityLabel = (val: string | null | undefined) => {
          const map: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', expert: 'Expert' };
          return val ? (map[val] || val) : null;
        };
        const complexityColor = (val: string | null | undefined) => {
          const map: Record<string, string> = {
            low: 'bg-green-100 text-green-700 ring-1 ring-green-200',
            medium: 'bg-yellow-100 text-yellow-700 ring-1 ring-yellow-200',
            high: 'bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20',
            expert: 'bg-red-100 text-red-700 ring-1 ring-red-200',
          };
          return val ? (map[val] || 'bg-slate-100 text-gray-700 ring-1 ring-gray-200') : 'bg-slate-100 text-gray-700 ring-1 ring-gray-200';
        };
        const expLabel = (val: string | null | undefined) => {
          const map: Record<string, string> = {
            junior: 'Junior', mid: 'Mid-Level', senior: 'Senior', lead: 'Lead', expert: 'Expert',
          };
          return val ? (map[val] || val) : null;
        };
        const expColor = (val: string | null | undefined) => {
          const map: Record<string, string> = {
            junior: 'bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20',
            mid: 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20',
            senior: 'bg-brand-blue-2/15 text-brand-blue-2 ring-1 ring-brand-blue-2/25',
            lead: 'bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20',
            expert: 'bg-red-100 text-red-700 ring-1 ring-red-200',
          };
          return val ? (map[val] || 'bg-slate-100 text-gray-700 ring-1 ring-gray-200') : 'bg-slate-100 text-gray-700 ring-1 ring-gray-200';
        };

        const skillDepth: any[] = assessment.jd_skill_depth || [];
        const niceToHaveSkills: any[] = (assessment as any).jd_nice_to_have_skills || [];
        const codingLanguages: string[] = assessment.coding_languages || [];
        // NHS section is always rendered (with an empty-state placeholder)
        // so its presence shouldn't gate the whole panel — fall back to the
        // other JD-snapshot signals to decide whether there's anything
        // worth showing at all.
        const hasData = assessment.jd_complexity || assessment.jd_experience_level || assessment.jd_primary_domain || skillDepth.length > 0 || codingLanguages.length > 0;

        return (
          <div className="bg-white rounded-xl border border-gray-200 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
            <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-200">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-9 h-9 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                  <Info className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue" />
                </div>
                <h3 className="text-sm sm:text-base font-medium text-gray-900 tracking-tight">Assessment Info</h3>
              </div>
              <p className="text-xs sm:text-sm text-gray-600">Metadata extracted from the job description used to generate this assessment</p>
            </div>

            {!hasData ? (
              <div className="px-3 sm:px-4 lg:px-6 py-8 sm:py-12 text-center">
                <Info className="w-8 h-8 sm:w-12 sm:h-12 text-gray-300 mx-auto mb-2 sm:mb-3" />
                <p className="text-gray-600 mb-1">No metadata available</p>
                <p className="text-sm text-gray-500">Assessment info will appear once the JD analysis is complete</p>
              </div>
            ) : (
              <div className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
                {/* Key Metadata Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
                  {/* Job Complexity Level */}
                  <div className="rounded-xl border border-gray-200 ring-1 ring-black/[0.02] bg-white shadow-sm shadow-brand-blue/5 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-9 h-9 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                        <Layers className="w-4 h-4 text-brand-blue" />
                      </div>
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Job Complexity</span>
                    </div>
                    {assessment.jd_complexity ? (
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${complexityColor(assessment.jd_complexity)}`}>
                        {complexityLabel(assessment.jd_complexity)}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">Not available</span>
                    )}
                  </div>

                  {/* Experience Level */}
                  <div className="rounded-xl border border-gray-200 ring-1 ring-black/[0.02] bg-white shadow-sm shadow-brand-blue/5 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-9 h-9 rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center">
                        <TrendingUp className="w-4 h-4 text-brand-cyan" />
                      </div>
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Experience Level</span>
                    </div>
                    {assessment.jd_experience_level ? (
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${expColor(assessment.jd_experience_level)}`}>
                        {expLabel(assessment.jd_experience_level)}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">Not available</span>
                    )}
                  </div>

                  {/* Primary Domain */}
                  <div className="rounded-xl border border-gray-200 ring-1 ring-black/[0.02] bg-white shadow-sm shadow-brand-blue/5 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-9 h-9 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                        <Globe className="w-4 h-4 text-brand-blue" />
                      </div>
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Primary Domain</span>
                    </div>
                    {assessment.jd_primary_domain ? (
                      <span className="text-sm font-medium text-gray-900">{assessment.jd_primary_domain}</span>
                    ) : (
                      <span className="text-sm text-gray-400">Not available</span>
                    )}
                  </div>

                  {/* Coding Requirement */}
                  <div className="rounded-xl border border-gray-200 ring-1 ring-black/[0.02] bg-white shadow-sm shadow-brand-blue/5 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-9 h-9 rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center">
                        <Code className="w-4 h-4 text-brand-cyan" />
                      </div>
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Coding Requirement</span>
                    </div>
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${assessment.coding_enabled ? 'bg-green-100 text-green-700 ring-1 ring-green-200' : 'bg-slate-100 text-gray-600 ring-1 ring-gray-200'}`}>
                      {assessment.coding_enabled ? 'Required' : 'Not Required'}
                    </span>
                  </div>

                  {/* Eligible Programming Languages */}
                  <div className="rounded-xl border border-gray-200 ring-1 ring-black/[0.02] bg-white shadow-sm shadow-brand-blue/5 p-4 sm:col-span-2">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-9 h-9 rounded-xl bg-brand-orange/10 ring-1 ring-brand-orange/20 flex items-center justify-center">
                        <Zap className="w-4 h-4 text-brand-orange-deep" />
                      </div>
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Eligible Programming Languages</span>
                    </div>
                    {codingLanguages.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {codingLanguages.map((lang, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20"
                          >
                            {lang}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">{assessment.coding_enabled ? 'No languages specified' : 'N/A — coding not required'}</span>
                    )}
                  </div>
                </div>

                {/* Must-Have Skills (MHS) — labelled symmetrically with the
                    NHS section so a recruiter scanning the page sees a
                    matching pair instead of "Skill Depth" + "Nice-to-Have". */}
                {skillDepth.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Star className="w-4 h-4 text-brand-blue" />
                      <h4 className="text-sm font-medium text-gray-900 tracking-tight">Must-Have Skills</h4>
                      <span className="text-xs text-gray-500">(Required skills extracted from JD)</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {skillDepth.map((skill: any, idx: number) => {
                        const skillName = typeof skill === 'string' ? skill : skill?.name || skill?.skill || JSON.stringify(skill);
                        const level = typeof skill === 'object' ? (skill?.level || skill?.depth) : null;
                        return (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20"
                          >
                            {skillName}
                            {level && (
                              <span className="text-xs text-brand-blue/70 font-normal">· {level}</span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Nice-to-Have Skills (NHS) — always rendered alongside
                    MHS so the section's presence is consistent. When the
                    JD has none configured we show a muted placeholder
                    instead of hiding the heading entirely (which made
                    recruiters think NHS support was missing). */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Star className="w-4 h-4 text-brand-cyan" />
                    <h4 className="text-sm font-medium text-gray-900 tracking-tight">Nice-to-Have Skills</h4>
                    <span className="text-xs text-gray-500">(Preferred skills extracted from JD)</span>
                  </div>
                  {niceToHaveSkills.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {niceToHaveSkills.map((skill: any, idx: number) => {
                        const skillName = typeof skill === 'string' ? skill : skill?.name || skill?.skill || JSON.stringify(skill);
                        const level = typeof skill === 'object' ? (skill?.level || skill?.depth) : null;
                        return (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/25"
                          >
                            {skillName}
                            {level && (
                              <span className="text-xs text-brand-cyan/80 font-normal">· {level}</span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm text-gray-400 bg-gray-50 border border-gray-200">
                      None configured for this JD
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {activeTab === 'viewjd' && (
        <div className="bg-white rounded-xl border border-gray-200 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
          <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-200">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-9 h-9 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                <Briefcase className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue" />
              </div>
              <h3 className="text-sm sm:text-base font-medium text-gray-900 tracking-tight">Job Description</h3>
            </div>
            <p className="text-xs sm:text-sm text-gray-600">The full Job Description this assessment was generated from</p>
          </div>

          {jdLoading ? (
            <div className="px-3 sm:px-4 lg:px-6 py-12 flex items-center justify-center tf-loader-center">
              <Loader2 className="w-6 h-6 text-brand-blue animate-spin" />
            </div>
          ) : jdError ? (
            <div className="px-3 sm:px-4 lg:px-6 py-8 text-center">
              <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
              <p className="text-sm text-red-600">{jdError}</p>
            </div>
          ) : !jdData ? (
            <div className="px-3 sm:px-4 lg:px-6 py-8 text-center">
              <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No linked job description found</p>
            </div>
          ) : (
            <div className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
              {/* JD Title + Job ID */}
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <h4 className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight">{jdData.title}</h4>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {jdData.job_id && (
                      <span className="inline-flex items-center px-2 py-0.5 bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 rounded text-xs font-semibold font-mono">
                        {jdData.job_id}
                      </span>
                    )}
                    {jdData.status && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${
                        jdData.status === 'published'
                          ? 'bg-green-100 text-green-700 ring-1 ring-green-200'
                          : jdData.status === 'draft'
                          ? 'bg-yellow-100 text-yellow-700 ring-1 ring-yellow-200'
                          : jdData.status === 'archived'
                          ? 'bg-gray-100 text-gray-600 ring-1 ring-gray-200'
                          : 'bg-slate-100 text-gray-700 ring-1 ring-gray-200'
                      }`}>
                        {jdData.status}
                      </span>
                    )}
                    {jdData.department && (
                      <span className="text-xs text-gray-600 flex items-center gap-1">
                        <Layers className="w-3 h-3" />
                        {jdData.department}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Job Details grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {jdData.employment_type && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg ring-1 ring-black/[0.02]">
                    <Briefcase className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs text-gray-500">Employment</div>
                      <div className="text-sm text-gray-900 truncate">{formatEmploymentType(jdData.employment_type)}</div>
                    </div>
                  </div>
                )}
                {jdData.remote_type && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg ring-1 ring-black/[0.02]">
                    <Globe className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs text-gray-500">Work Mode</div>
                      <div className="text-sm text-gray-900 truncate">{formatEmploymentType(jdData.remote_type)}</div>
                    </div>
                  </div>
                )}
                {(jdData.experience_min != null || jdData.experience_max != null) && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg ring-1 ring-black/[0.02]">
                    <Clock className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs text-gray-500">Experience</div>
                      <div className="text-sm text-gray-900 truncate">
                        {jdData.experience_min ?? 0} - {jdData.experience_max ?? '10+'} years
                      </div>
                    </div>
                  </div>
                )}
                {jdData.industry_type && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg ring-1 ring-black/[0.02]">
                    <Layers className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs text-gray-500">Industry</div>
                      <div className="text-sm text-gray-900 truncate">{jdData.industry_type}</div>
                    </div>
                  </div>
                )}
                {jdData.job_level && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg ring-1 ring-black/[0.02]">
                    <Target className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs text-gray-500">Level</div>
                      <div className="text-sm text-gray-900 truncate capitalize">{jdData.job_level}</div>
                    </div>
                  </div>
                )}
                {jdData.location && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg ring-1 ring-black/[0.02]">
                    <Globe className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs text-gray-500">Location</div>
                      <div className="text-sm text-gray-900 truncate">{jdData.location}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Skills */}
              {(jdData.must_have_skills?.length || jdData.nice_to_have_skills?.length) ? (
                <div className="space-y-3">
                  {jdData.must_have_skills && jdData.must_have_skills.length > 0 && (
                    <div>
                      <div className="text-xs sm:text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                        <Star className="w-3.5 h-3.5 text-brand-blue" />
                        Must-Have Skills ({jdData.must_have_skills.length})
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {jdData.must_have_skills.map((skill, i) => (
                          <span key={`mh-${i}`} className="inline-flex items-center px-2.5 py-1 bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 rounded text-xs font-medium">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {jdData.nice_to_have_skills && jdData.nice_to_have_skills.length > 0 && (
                    <div>
                      <div className="text-xs sm:text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-brand-cyan" />
                        Nice-to-Have Skills ({jdData.nice_to_have_skills.length})
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {jdData.nice_to_have_skills.map((skill, i) => (
                          <span key={`nh-${i}`} className="inline-flex items-center px-2.5 py-1 bg-brand-cyan/5 text-brand-cyan ring-1 ring-brand-cyan/20 rounded text-xs font-medium">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {/* Description */}
              {jdData.description && (
                <div>
                  <div className="text-xs sm:text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-gray-500" />
                    Description
                  </div>
                  <div className="px-3 sm:px-4 py-3 sm:py-4 bg-slate-50 rounded-lg ring-1 ring-black/[0.02] text-sm text-gray-800">
                    <div className="markdown-content leading-relaxed">
                      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                        {jdData.description}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              )}

              {/* Assessment Guidance */}
              {jdData.assessment_guidance && (
                <div>
                  <div className="text-xs sm:text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-brand-blue" />
                    Assessment Guidance
                  </div>
                  <div className="px-3 sm:px-4 py-3 sm:py-4 bg-brand-blue/5 rounded-lg ring-1 ring-brand-blue/15 text-sm text-gray-800">
                    <div className="markdown-content leading-relaxed">
                      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                        {jdData.assessment_guidance}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              )}

              {/* Extracted Data Summary — collapsible, mirroring the Job Details
                  page. Recruiters reviewing an assessment were seeing only the
                  JD prose here and had to open the full JD page to check the
                  structured requirements the questions were generated from. */}
              {hasAnyExtractedData && (
                <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
                  <button
                    onClick={() => setShowExtractedSummary(!showExtractedSummary)}
                    className="w-full bg-brand-blue/[0.04] px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 flex items-center justify-between hover:bg-brand-blue/[0.07] transition-colors rounded-t-xl"
                  >
                    <div className="text-left">
                      <h3 className="text-sm sm:text-lg text-gray-900 flex items-center gap-2 flex-wrap">
                        📊 Extracted Data Summary
                        <Eye className="w-5 h-5 text-gray-500" />
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        Click to {showExtractedSummary ? 'hide' : 'view'} structured requirements
                      </p>
                    </div>
                    <div className={`transform transition-transform ${showExtractedSummary ? 'rotate-180' : ''}`}>
                      <ChevronRight className="w-5 h-5 text-gray-500 rotate-90" />
                    </div>
                  </button>

                  {showExtractedSummary && (
                    <>
                      {/* Skills & Comments */}
                      <div className="p-4 sm:p-6 border-b border-gray-200">
                        <h3 className="text-sm sm:text-base text-gray-900 mb-3 sm:mb-4">Skills &amp; Requirements</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                          <div className="space-y-4 sm:space-y-6">
                            <div>
                              <h4 className="text-sm text-gray-700 mb-3">Must-Have Skills ({jdMustHaveSkills.length})</h4>
                              {jdMustHaveSkills.length > 0 ? (
                                <div className="space-y-2">
                                  {jdMustHaveSkills.map((skill, index) => (
                                    <div key={`ed-mh-${index}`} className="flex items-center gap-2 text-sm text-gray-700">
                                      <CheckCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                                      {skill}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-gray-500 italic text-sm">None</p>
                              )}
                            </div>
                            <div>
                              <h4 className="text-sm text-gray-700 mb-3">Nice-to-Have Skills ({jdNiceToHaveSkills.length})</h4>
                              {jdNiceToHaveSkills.length > 0 ? (
                                <div className="space-y-2">
                                  {jdNiceToHaveSkills.map((skill, index) => (
                                    <div key={`ed-nh-${index}`} className="flex items-center gap-2 text-sm text-gray-600">
                                      <CheckCircle className="w-4 h-4 text-gray-800 flex-shrink-0" />
                                      {skill}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-gray-500 italic text-sm">None</p>
                              )}
                            </div>
                          </div>

                          <div className="space-y-4 sm:space-y-6">
                            <div>
                              <h4 className="text-sm text-gray-700 mb-3">Must-Have Additional Requirements ({jdMustHaveComments.length})</h4>
                              {jdMustHaveComments.length > 0 ? (
                                <div className="space-y-2">
                                  {jdMustHaveComments.map((comment, index) => (
                                    <div key={`ed-mhc-${index}`} className="flex items-start gap-2 text-sm text-gray-700">
                                      <CheckCircle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                                      <span>{comment}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-gray-500 italic text-sm">None</p>
                              )}
                            </div>
                            <div>
                              <h4 className="text-sm text-gray-700 mb-3">Nice-to-Have Additional Requirements ({jdNiceToHaveComments.length})</h4>
                              {jdNiceToHaveComments.length > 0 ? (
                                <div className="space-y-2">
                                  {jdNiceToHaveComments.map((comment, index) => (
                                    <div key={`ed-nhc-${index}`} className="flex items-start gap-2 text-sm text-gray-600">
                                      <CheckCircle className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                                      <span>{comment}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-gray-500 italic text-sm">None</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Requirements Grid */}
                      <div className="p-4 sm:p-6">
                        <h3 className="text-sm sm:text-base text-gray-900 mb-3 sm:mb-4">Requirements</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                          <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                            <h4 className="text-xs sm:text-sm text-gray-600 mb-1 sm:mb-2">Experience</h4>
                            <p className="text-sm sm:text-base text-gray-900">{jdExperienceText || 'Not specified'}</p>
                          </div>
                          <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                            <h4 className="text-xs sm:text-sm text-gray-600 mb-1 sm:mb-2">Education</h4>
                            <p className="text-sm sm:text-base text-gray-900">
                              {educationLabel(jdEducationDegree)}
                              {jdEducationField ? ` — ${jdEducationField}` : ''}
                            </p>
                          </div>
                          {jdData.industry_type && (
                            <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                              <h4 className="text-xs sm:text-sm text-gray-600 mb-1 sm:mb-2">Industry Type</h4>
                              <p className="text-sm sm:text-base text-gray-900">{prettifyCode(jdData.industry_type)}</p>
                            </div>
                          )}
                          <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                            <h4 className="text-xs sm:text-sm text-gray-600 mb-1 sm:mb-2">Employment Type</h4>
                            <p className="text-sm sm:text-base text-gray-900">{employmentTypeLabel(jdData.employment_type)}</p>
                          </div>
                          <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                            <h4 className="text-xs sm:text-sm text-gray-600 mb-1 sm:mb-2">Work Mode</h4>
                            <p className="text-sm sm:text-base text-gray-900">{workModeLabel(jdData.remote_type)}</p>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Open full JD page link */}
              <div className="pt-2 border-t border-gray-200 flex justify-end">
                <button
                  onClick={() => router.push(`/recruitment/job-details?id=${jdData.id}`)}
                  className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-brand-blue hover:text-brand-blue-2 transition-colors"
                >
                  Open full JD page
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      </div>
      </div>
      </div>
    </main>
  );
}
