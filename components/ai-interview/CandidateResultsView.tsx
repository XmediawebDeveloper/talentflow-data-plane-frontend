'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { QrVerificationEmptyState, RecordingExpiredEmptyState } from './IllustratedEmptyState';
// Shared with the assessment results page — one duration probe for all four recordings.
import { VideoWithDuration, type VideoMarker } from '@/components/recording/RecordingPlayer';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import {
  Clock, MessageSquare, ThumbsUp, ThumbsDown,
  AlertTriangle, VideoOff, ChevronDown, ChevronUp, Video,
  BarChart3, Brain, FileText, Layers,
  ShieldAlert, Monitor, Clipboard, MousePointer, Eye, UserX,
  Volume2, Users, Maximize2, Camera, Mic, User, ChevronLeft, ChevronRight,
  Shield, CheckCircle2, XCircle, Activity, RefreshCw, Award, TrendingUp, Target,
  Download, Loader2, Sparkles, SkipForward, Play, X, Timer, Check, FileType2, ScrollText,
  ArrowUpRight, ChevronsUpDown, ChevronsDownUp, ScanQrCode, Briefcase, AudioLines,
} from 'lucide-react';
import { jdService, type JDResponse } from '@/lib/services/jdService';
import JDIdentityHeader from '@/components/jobs/JDIdentityHeader';
import JDOverviewSections from '@/components/jobs/JDOverviewSections';
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend,
} from 'recharts';
import { Button } from '@/components/ui/button';
import NameAvatar from '@/components/ui/name-avatar';
import { tabPill } from '@/components/ui/filter-pills';
import ExportFormatModal from '@/components/ExportFormatModal';
import ExportColumnsModal, { type ExportFormatOption } from '@/components/ExportColumnsModal';
import { exportRows, exportTextFile, type ExportFileFormat } from '@/lib/utils/exportUtils';
import EvaluationTab from './tabs/EvaluationTab';
import EvaluationDashboardTab from './tabs/EvaluationDashboardTab';
import EvaluationReportTab from './tabs/EvaluationReportTab';
import CoverageTab from './tabs/CoverageTab';
// import { OverviewSection } from './evaluation-dashboard/OverviewSection'; // replaced by OverviewSectionV2 (Vite design)
import { OverviewSectionV2 } from './evaluation-dashboard/OverviewSectionV2';
import { EvaluationReportV2 } from './evaluation-dashboard/EvaluationReportV2';
import { EvalReportCombined, MHS_THRESHOLD } from './evaluation-dashboard/EvalReportCombined';
// EvaluationDashboardV2 default export no longer used; sub-views are mounted as their own tabs.
// import { EvaluationDashboardV2 } from './evaluation-dashboard/EvaluationDashboardV2';
import { SkillsView, QuestionsView, FormulaView } from './evaluation-dashboard/EvaluationDashboardV2';
import EnvVerificationStudio from './tabs/EnvVerificationStudio';
import { buildSkipReasoner } from './evaluation-dashboard/skipReason';
import { CoverageV2 } from './evaluation-dashboard/CoverageV2';
import { buildDashboardData } from './evaluation-dashboard/adapter';
import { downloadSessionReport, hasEvaluationReport } from './evaluation-dashboard/downloadSessionReport';
import { downloadChatTranscriptPdf, type ChatPdfMessage } from './chatTranscriptPdf';
import { useCanDownloadAIReports, AI_REPORT_DOWNLOAD_DENIED, isForbiddenError } from './ResultRowActions';
import type { AIInterviewResponse } from '@/lib/services/aiInterviewService';
import { aiInterviewService, isJdDisabled, JD_DISABLED_ACTION_MESSAGE } from '@/lib/services/aiInterviewService';
import { toast } from 'sonner';
import api from '@/lib/services/api';
import { formatISTDate, formatISTTime } from '@/lib/utils/dateUtils';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import ListPagination from '@/components/ListPagination';
import RecordPager from '@/components/RecordPager';
import IntegrityCheckTab from './IntegrityCheckTab';
import { QuestionDistributionPopover } from './QuestionDistributionPopover';
import { summarizeViolations, recruiterSeverity, labelOfViolation } from './violationTaxonomy';
import { Skeleton } from '@/components/ui/skeleton';
import { useUrlTab } from '@/lib/hooks/useUrlTab';
import ResumeTextPreviewModal from '@/components/ResumeTextPreviewModal';
import ViewResumeButton from '@/components/ui/view-resume-button';
import { RESUME_EMAIL_MISMATCH_MESSAGE, emailsMatch, normalizeEmail, pickResumeByEmail, resumeEmailOf, verifyResumeBelongsToInvite } from '@/lib/utils/resumeEmailMatch';
import ResumeHoverPreview from '@/components/ResumeHoverPreview';
import TruncatedTextCell from './TruncatedTextCell';
import { Tooltip as HoverTooltip } from '@/components/ui/tooltip';
import { formatScore1, truncate1 } from '@/lib/utils/matchStatus';
import { useBreadcrumbOffset } from './AIInterviewStepIndicator';
import { MobileRecordList, MobileRecordCard, MobileStatChip, DESKTOP_TABLE_ONLY } from '@/components/ui/mobile-record-card';
import { getAccessToken } from '@/lib/services/api';

interface CandidateResultsViewProps {
  interview: AIInterviewResponse;
  onBack: () => void;
  /** Keep the open tab in the URL (`?resultTab=`) — on by default, for the
   *  candidate result route. Off for an in-page view the URL doesn't name,
   *  which a refresh can't restore anyway. */
  tabInUrl?: boolean;
  /** Index of this candidate within the visible results list (for Prev/Next). */
  currentIndex?: number;
  /** Total candidates in the visible results list. */
  totalCount?: number;
  onPrev?: () => void;
  onNext?: () => void;
  /**
   * When this view is rendered inline within the AI Interviews list page
   * (Invites → View Details), the "AI Interviews" breadcrumb can't navigate via
   * href (we're already on that route). Pass a handler to return to the list by
   * clearing the inline state instead.
   */
  onNavigateToList?: () => void;
  /**
   * Extra breadcrumb items inserted between "AI Interviews" and "Candidate
   * Results" — e.g. a "Results" crumb linking back to the Results page the
   * recruiter drilled in from, so the trail reflects where they came from.
   */
  breadcrumbTrail?: { label: string; href?: string; onClick?: () => void }[];
  /**
   * Replaces the whole breadcrumb — including the leading "AI Interviews" crumb
   * and the trailing candidate crumb — for callers whose trail isn't rooted in
   * the AI Interviews section at all (e.g. the AI Interview Result tab on a JD's
   * Job Details page). Takes precedence over `breadcrumbTrail`.
   */
  breadcrumbItems?: { label: string; href?: string; onClick?: () => void }[];
}

const TAB_KEYS = ['overview', 'eval', 'evaluation', 'eval_report', 'eval_dashboard', 'sentiment', 'qa', 'recording', 'transcript', 'coverage', 'violations', 'skill_breakdown', 'question_analysis', 'example_scenarios', 'verification', 'viewjd'] as const;
type TabKey = typeof TAB_KEYS[number];

/* ─── Proctoring helpers ─────────────────────────────────────────── */
interface ViolationRecord {
  event_type: string;
  severity: string; // 'minor' | 'moderate' | 'severe' (legacy: 'low'|'medium'|'high')
  timestamp?: string;
  details?: Record<string, unknown>;
}

// Normalise legacy severity strings to canonical minor/moderate/severe
function normaliseSeverity(raw?: string): 'minor' | 'moderate' | 'severe' {
  const s = (raw ?? '').toLowerCase();
  if (s === 'severe' || s === 'high') return 'severe';
  if (s === 'moderate' || s === 'medium') return 'moderate';
  return 'minor';
}

// Point weights per severity
const SEV_WEIGHT: Record<'minor' | 'moderate' | 'severe', number> = { minor: 1, moderate: 2, severe: 3 };

interface RiskThresholds { low: number; medium: number }
const DEFAULT_THRESHOLDS: RiskThresholds = { low: 3, medium: 8 };
// Per-violation-box count thresholds: 0–low → Low Risk, low+1–medium → Medium Risk, medium+ → High Risk
interface ViolationCountThresholds { lowMax: number; medMax: number }
const DEFAULT_VIOLATION_THRESHOLDS: ViolationCountThresholds = { lowMax: 2, medMax: 5 };

function violationBoxRisk(count: number, t: ViolationCountThresholds): { label: string; cls: string } {
  if (count === 0) return { label: '', cls: '' };
  if (count <= t.lowMax) return { label: 'Low Risk', cls: 'text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20' };
  if (count <= t.medMax) return { label: 'Medium Risk', cls: 'text-brand-orange-deep bg-brand-orange/10 ring-1 ring-brand-orange/20' };
  return { label: 'High Risk', cls: 'text-destructive bg-destructive-subtle ring-1 ring-destructive-line' };
}

function getRiskLevelWeighted(
  score: number,
  thresholds: RiskThresholds = DEFAULT_THRESHOLDS,
): { label: string; color: string; bg: string; border: string } {
  if (score === 0)                    return { label: 'Clean',       color: 'text-success',  bg: 'bg-success-subtle',  border: 'border-success-line'  };
  if (score <= thresholds.low)        return { label: 'Low Risk',    color: 'text-success',  bg: 'bg-success-subtle',  border: 'border-success-line'  };
  if (score <= thresholds.medium)     return { label: 'Medium Risk', color: 'text-brand-orange-deep', bg: 'bg-brand-orange/10', border: 'border-brand-orange/30' };
  return                                     { label: 'High Risk',   color: 'text-destructive',    bg: 'bg-destructive-subtle',    border: 'border-destructive-line'    };
}

const EVENT_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string; border: string }> = {
  tab_switch:               { label: 'Tab Switch',           icon: <Monitor className="w-4 h-4" />,      color: 'text-brand-orange-deep', bg: 'bg-brand-orange/10',  border: 'border-brand-orange/20' },
  window_blur:              { label: 'Window Blur',          icon: <Eye className="w-4 h-4" />,           color: 'text-destructive',    bg: 'bg-destructive-subtle',     border: 'border-destructive-line'    },
  copy_attempt:             { label: 'Copy Attempt',         icon: <Clipboard className="w-4 h-4" />,     color: 'text-brand-orange-deep', bg: 'bg-brand-orange/10', border: 'border-brand-orange/20' },
  paste_attempt:            { label: 'Paste Attempt',        icon: <MousePointer className="w-4 h-4" />,  color: 'text-brand-orange-deep', bg: 'bg-brand-orange/10', border: 'border-brand-orange/20' },
  camera_disabled:          { label: 'Camera Disabled',      icon: <Camera className="w-4 h-4" />,        color: 'text-slate-600',  bg: 'bg-slate-50',  border: 'border-slate-200'  },
  camera_obstructed:        { label: 'Camera Obstructed',    icon: <Eye className="w-4 h-4" />,           color: 'text-brand-cyan', bg: 'bg-brand-cyan/10', border: 'border-brand-cyan/20' },
  microphone_disabled:      { label: 'Mic Disabled',         icon: <Mic className="w-4 h-4" />,           color: 'text-slate-600',  bg: 'bg-slate-50',  border: 'border-slate-200'  },
  voice_detected:           { label: 'Voice Detected',       icon: <Volume2 className="w-4 h-4" />,       color: 'text-brand-cyan', bg: 'bg-brand-cyan/10', border: 'border-brand-cyan/20' },
  multiple_voices:          { label: 'Multiple Speakers',    icon: <Volume2 className="w-4 h-4" />,       color: 'text-destructive',    bg: 'bg-destructive-subtle',    border: 'border-destructive-line'    },
  multiple_faces:           { label: 'Multiple Faces',       icon: <Users className="w-4 h-4" />,         color: 'text-brand-blue', bg: 'bg-brand-blue/10', border: 'border-brand-blue/20' },
  face_missing:             { label: 'Face Not Visible',     icon: <UserX className="w-4 h-4" />,         color: 'text-destructive',    bg: 'bg-destructive-subtle',    border: 'border-destructive-line'    },
  gaze_away:                { label: 'Gaze Away',            icon: <Eye className="w-4 h-4" />,           color: 'text-brand-orange', bg: 'bg-brand-orange/10', border: 'border-brand-orange/20' },
  fullscreen_exit:          { label: 'Fullscreen Exit',      icon: <Maximize2 className="w-4 h-4" />,     color: 'text-brand-blue', bg: 'bg-brand-blue/10', border: 'border-brand-blue/20' },
  screenshot_attempt:       { label: 'Screenshot Attempt',   icon: <Camera className="w-4 h-4" />,        color: 'text-brand-orange-deep', bg: 'bg-brand-orange/10', border: 'border-brand-orange/20' },
  screen_recording_attempt: { label: 'Screen Recording',     icon: <Video className="w-4 h-4" />,         color: 'text-brand-orange-deep', bg: 'bg-brand-orange/10', border: 'border-brand-orange/20' },
  face_mismatch:            { label: 'Face Mismatch',        icon: <User className="w-4 h-4" />,          color: 'text-destructive',    bg: 'bg-destructive-subtle',    border: 'border-destructive-line'    },
  face_identity_changed:    { label: 'Identity Changed',     icon: <UserX className="w-4 h-4" />,         color: 'text-destructive',    bg: 'bg-destructive-subtle',    border: 'border-destructive-line'    },
  face_verification_unavailable: { label: 'Face ID Check Not Run', icon: <UserX className="w-4 h-4" />,    color: 'text-destructive',    bg: 'bg-destructive-subtle',    border: 'border-destructive-line'    },
  face_unverifiable:        { label: 'Face Not Verifiable',  icon: <UserX className="w-4 h-4" />,         color: 'text-destructive',    bg: 'bg-destructive-subtle',    border: 'border-destructive-line'    },
  voice_mismatch:           { label: 'Voice Mismatch',       icon: <Mic className="w-4 h-4" />,           color: 'text-destructive',    bg: 'bg-destructive-subtle',    border: 'border-destructive-line'    },
  voice_identity_changed:   { label: 'Voice ID Changed',     icon: <Mic className="w-4 h-4" />,           color: 'text-destructive',    bg: 'bg-destructive-subtle',    border: 'border-destructive-line'    },
  screen_share_stopped:     { label: 'Screen Share Stopped', icon: <Monitor className="w-4 h-4" />,       color: 'text-destructive',    bg: 'bg-destructive-subtle',    border: 'border-destructive-line'    },
  interview_terminated:     { label: 'Interview Terminated — Left Screen', icon: <ShieldAlert className="w-4 h-4" />, color: 'text-destructive', bg: 'bg-destructive-subtle', border: 'border-destructive-line' },
};

function formatTs(ts?: string) {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch { return '—'; }
}

// Elapsed seconds into the interview recording at which an event fired,
// measured from `startTs` (the session start ≈ recording start). Returns null
// when either timestamp is missing/invalid or the offset would be negative
// (clock skew / event stamped before the anchor) — i.e. not seekable.
function videoOffsetSeconds(ts?: string, startTs?: string): number | null {
  if (!ts || !startTs) return null;
  const eventMs = new Date(ts).getTime();
  const startMs = new Date(startTs).getTime();
  if (Number.isNaN(eventMs) || Number.isNaN(startMs)) return null;
  const offsetSec = Math.floor((eventMs - startMs) / 1000);
  return offsetSec < 0 ? null : offsetSec;
}

// Elapsed position in the interview recording (mm:ss) at which an event fired.
// Minutes are not capped at 59 — a 75-minute mark reads "75:12". Returns '—'
// when the offset is not computable (see videoOffsetSeconds).
function formatVideoOffset(ts?: string, startTs?: string) {
  const offsetSec = videoOffsetSeconds(ts, startTs);
  if (offsetSec == null) return '—';
  const mm = Math.floor(offsetSec / 60);
  const ss = offsetSec % 60;
  return `${mm}:${String(ss).padStart(2, '0')}`;
}

/* ─── Recording sub-tab component ───────────────────────────────────────── */
function VideoPane({
  label,
  hasFile,
  blobUrl,
  loading,
  error,
  onError,
  onDuration,
  seekTo,
  seekKey,
  markers,
  unavailableText,
}: {
  label: string;
  hasFile: boolean;
  /** Replaces "{label} not available", e.g. when the viewing window expired. */
  unavailableText?: string | null;
  blobUrl: string | null;
  loading: boolean;
  error: boolean;
  onError: () => void;
  onDuration?: (seconds: number) => void;
  seekTo?: number | null;
  seekKey?: number;
  markers?: VideoMarker[];
}) {
  if (!hasFile) {
    return (
      <div className="text-center py-12">
        <div className="w-12 h-12 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center mx-auto mb-3">
          <VideoOff className="w-6 h-6 text-brand-blue/40" />
        </div>
        <p className="tf-body-muted">{unavailableText || `${label} not available`}</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="text-center py-12">
        <div className="w-12 h-12 rounded-full bg-destructive-subtle ring-1 ring-destructive-line flex items-center justify-center mx-auto mb-3">
          <VideoOff className="w-6 h-6 text-destructive" />
        </div>
        <p className="tf-body-muted">Could not load {label.toLowerCase()}</p>
        <p className="tf-hint mt-1">The file may have been moved or deleted</p>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="text-center py-12">
        <Loader2 className="w-8 h-8 text-brand-blue animate-spin mx-auto mb-3" />
        <p className="tf-body-muted">Loading {label.toLowerCase()}…</p>
      </div>
    );
  }
  if (blobUrl) {
    return (
      <VideoWithDuration src={blobUrl} onError={onError} onDuration={onDuration} seekTo={seekTo} seekKey={seekKey} markers={markers} />
    );
  }
  return null;
}

function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '--:--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function formatBytes(bytes: number | null): string {
  if (bytes == null || !isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function formatInterviewDate(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' });
  } catch { return '—'; }
}

function RecordingInfoPanel({
  status, size, duration, interviewDate,
}: {
  status: string;
  size: number | null;
  duration: number | null;
  interviewDate?: string;
}) {
  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
      <span className="tf-meta">{label}</span>
      <span className="tf-row-name">{value}</span>
    </div>
  );
  return (
    <div className="tf-card-soft p-4">
      <h3 className="tf-row-title mb-2 tracking-tight">Recording Information</h3>
      <Row label="Status" value={<Badge variant="success">{status}</Badge>} />
      <Row label="File Size" value={formatBytes(size)} />
      <Row label="Duration" value={duration != null ? formatDuration(duration) : '—'} />
      <Row label="Interview Date" value={formatInterviewDate(interviewDate)} />
    </div>
  );
}

function RecordingTabContent({
  interview,
  videoBlobUrl, videoBlobSize, videoDownloadUrl, videoLoading, videoError, setVideoError,
  screenBlobUrl, screenBlobSize, screenDownloadUrl, screenLoading, screenError,
  onCandidatePlaybackError, onScreenPlaybackError,
  seekRequest,
  markers,
}: {
  interview: AIInterviewResponse;
  videoBlobUrl: string | null;
  videoBlobSize: number | null;
  videoDownloadUrl: string | null;
  videoLoading: boolean;
  videoError: boolean;
  setVideoError: (v: boolean) => void;
  screenBlobUrl: string | null;
  screenBlobSize: number | null;
  screenDownloadUrl: string | null;
  screenLoading: boolean;
  screenError: boolean;
  /** <video> failed — parent retries once via the backend, else shows the error. */
  onCandidatePlaybackError?: () => void;
  onScreenPlaybackError?: () => void;
  seekRequest?: { seconds: number; key: number } | null;
  /** Question markers for the timeline strip under the video. */
  markers?: VideoMarker[];
}) {
  // Default to the Interview View (screen recording) whenever one exists — the
  // recruiter wants the screen recording to open first, not the candidate webcam.
  // Falls back to the candidate view only when there is no screen recording.
  const [recView, setRecView] = useState<'candidate' | 'screen'>(
    () => interview.screen_recording_file_path
      ? 'screen'
      : interview.recording_file_path ? 'candidate' : 'screen',
  );
  const [candidateDuration, setCandidateDuration] = useState<number | null>(null);
  const [screenDuration, setScreenDuration] = useState<number | null>(null);

  // A seek requested from the Event Log: jump to the sub-view that actually has
  // a recording (prefer the Interview View / screen recording) before seeking.
  // Keyed on the request's monotonic `key` so repeat clicks on the same row re-fire.
  useEffect(() => {
    if (!seekRequest) return;
    setRecView(
      interview.screen_recording_file_path ? 'screen'
        : interview.recording_file_path ? 'candidate'
        : 'screen',
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekRequest?.key]);

  const isCandidate = recView === 'candidate';
  const blobUrl = isCandidate ? videoBlobUrl : screenBlobUrl;
  const blobSize = isCandidate ? videoBlobSize : screenBlobSize;
  // Force-download URL (content-disposition: attachment) from the backend; falls
  // back to the play URL for local-fs/blob storage (same-origin blob → the
  // download attr works there).
  const downloadUrl = (isCandidate ? videoDownloadUrl : screenDownloadUrl) || blobUrl;
  const duration = isCandidate ? candidateDuration : screenDuration;
  // Stored recordings are WEBM containers — name the download .webm so it plays
  // (a .mp4 name on webm bytes fails in some players).
  const downloadName = isCandidate
    ? `candidate-view-${interview.id}.webm`
    : `interview-view-${interview.id}.webm`;
  const interviewDate = interview.started_at || interview.scheduled_at || interview.created_at;
  const statusLabel = interview.recording_file_path || interview.screen_recording_file_path
    ? 'Transcribed'
    : interview.recording_view_expired ? 'Expired' : 'Unavailable';
  const expiredText = interview.recording_view_expired
    ? `Recordings can be viewed for ${interview.recording_view_days ?? 7} days after the interview.`
      + (interview.recording_view_until ? ` This one expired on ${formatISTDate(interview.recording_view_until)}.` : '')
    : null;

  /* The viewing window has passed and both files are gone: one card in
     place of the players, instead of an empty pane under each sub-tab. */
  if (expiredText && !interview.recording_file_path && !interview.screen_recording_file_path) {
    return <RecordingExpiredEmptyState message={expiredText} />;
  }

  return (
    <div className="space-y-4">
      {/* Sub-tab pills — Interview View (the default) first. Equal-width
          columns so one white indicator can slide between them. */}
      <div className="relative inline-grid grid-cols-2 bg-slate-100 rounded-lg p-1 ring-1 ring-slate-200">
        <span
          aria-hidden
          className={`absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-md bg-white shadow-sm ring-1 ring-brand-blue/15 transition-transform duration-300 ease-out motion-reduce:transition-none ${
            isCandidate ? 'translate-x-full' : 'translate-x-0'
          }`}
        />
        <button
          onClick={() => setRecView('screen')}
          aria-pressed={!isCandidate}
          className={`relative z-10 flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors duration-300 ${
            !isCandidate ? 'text-brand-blue' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Monitor className="w-3.5 h-3.5" /> Interview View
        </button>
        <button
          onClick={() => setRecView('candidate')}
          aria-pressed={isCandidate}
          className={`relative z-10 flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors duration-300 ${
            isCandidate ? 'text-brand-blue' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Camera className="w-3.5 h-3.5" /> Candidate View
        </button>
      </div>

      {/* Split layout: video left, info right */}
      <div className="tf-grid-3">
        {/* Keyed on the view so the incoming recording fades in. */}
        <div key={recView} className="lg:col-span-2 space-y-2 animate-in fade-in duration-300 motion-reduce:animate-none">
          {isCandidate ? (
            <VideoPane
              label="Candidate recording"
              unavailableText={expiredText}
              hasFile={!!interview.recording_file_path}
              blobUrl={videoBlobUrl}
              loading={videoLoading}
              error={videoError}
              onError={() => (onCandidatePlaybackError ? onCandidatePlaybackError() : setVideoError(true))}
              onDuration={setCandidateDuration}
              seekTo={seekRequest?.seconds ?? null}
              seekKey={seekRequest?.key ?? 0}
              markers={markers}
            />
          ) : (
            <VideoPane
              label="Screen recording"
              unavailableText={expiredText}
              hasFile={!!interview.screen_recording_file_path}
              blobUrl={screenBlobUrl}
              loading={screenLoading}
              error={screenError}
              onError={() => onScreenPlaybackError?.()}
              onDuration={setScreenDuration}
              seekTo={seekRequest?.seconds ?? null}
              seekKey={seekRequest?.key ?? 0}
              markers={markers}
            />
          )}
        </div>

        <div className="space-y-3">
          <RecordingInfoPanel
            status={statusLabel}
            size={blobSize}
            duration={duration}
            interviewDate={interviewDate}
          />
          {downloadUrl && (
            <a
              href={downloadUrl}
              download={downloadName}
              // Cross-origin presigned URLs ignore the `download` attr, so the
              // backend bakes Content-Disposition: attachment into downloadUrl to
              // force the save. target/rel are belt-and-suspenders for the
              // local-fs blob fallback.
              target="_blank"
              rel="noopener noreferrer"
              // Native link click - the download itself never hits our backend
              // for a presigned S3 URL, so log it here rather than after a
              // fetch resolves. Doesn't call preventDefault, so the download
              // still proceeds even if this fails.
              onClick={() => aiInterviewService.logRecordingDownload(interview.id, isCandidate ? 'candidate' : 'screen')}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-brand-blue text-white hover:bg-brand-blue-2 shadow-sm shadow-brand-blue/20 ring-1 ring-brand-blue/30 transition-colors"
            >
              <Download className="w-4 h-4" /> Download Recording
            </a>
          )}
          {/* Shortcut hint for the question timeline (VideoWithDuration). */}
          {(markers ?? []).some(m => m.kind !== 'violation') && (
            <div className="flex items-center justify-center gap-1 whitespace-nowrap tf-meta">
              <kbd className="rounded border border-gray-300 bg-white px-1 py-px font-sans text-2xs font-semibold text-gray-600 shadow-[0_1px_0_#e5e7eb]">Ctrl</kbd>+<kbd className="rounded border border-gray-300 bg-white px-1 py-px font-sans text-2xs font-semibold text-gray-600 shadow-[0_1px_0_#e5e7eb]">←</kbd>/<kbd className="rounded border border-gray-300 bg-white px-1 py-px font-sans text-2xs font-semibold text-gray-600 shadow-[0_1px_0_#e5e7eb]">→</kbd>
              <span>jump between questions</span>
            </div>
          )}
          {/* Hint for the collapsed violation strip under the player. */}
          {(markers ?? []).some(m => m.kind === 'violation') && (
            <div className="flex items-center justify-center gap-1 whitespace-nowrap tf-meta">
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
              <span>under the video shows violations on the timeline</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return (s ?? '').toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&var(--raw-003399);');
}

// ── Transcript diff helpers ────────────────────────────────────────
// Word-level diff between raw ASR and corrected text. When ≤50% of tokens
// changed, highlight individual words; otherwise mark whole sentence rewrite.
type DiffPart = { text: string; changed: boolean };

function tokenize(s: string): string[] {
  return s.match(/\S+|\s+/g) || [];
}

function lcs(a: string[], b: string[]): number[][] {
  const n = a.length, m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

function diffWords(raw: string, corrected: string): { raw: DiffPart[]; corrected: DiffPart[]; mode: 'word' | 'sentence' | 'none' } {
  if (raw === corrected) {
    return { raw: [{ text: raw, changed: false }], corrected: [{ text: corrected, changed: false }], mode: 'none' };
  }
  const a = tokenize(raw);
  const b = tokenize(corrected);
  const aWords = a.filter(t => /\S/.test(t));
  const bWords = b.filter(t => /\S/.test(t));
  const dp = lcs(a, b);
  // Walk LCS to mark changed tokens
  const rawParts: DiffPart[] = [];
  const corrParts: DiffPart[] = [];
  let i = a.length, j = b.length;
  const rawRev: DiffPart[] = [];
  const corrRev: DiffPart[] = [];
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      rawRev.push({ text: a[i - 1], changed: false });
      corrRev.push({ text: b[j - 1], changed: false });
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      rawRev.push({ text: a[i - 1], changed: /\S/.test(a[i - 1]) });
      i--;
    } else {
      corrRev.push({ text: b[j - 1], changed: /\S/.test(b[j - 1]) });
      j--;
    }
  }
  while (i > 0) { rawRev.push({ text: a[i - 1], changed: /\S/.test(a[i - 1]) }); i--; }
  while (j > 0) { corrRev.push({ text: b[j - 1], changed: /\S/.test(b[j - 1]) }); j--; }
  rawParts.push(...rawRev.reverse());
  corrParts.push(...corrRev.reverse());

  // Decide mode: if ≥50% of corrected tokens changed, treat as full sentence rewrite
  const changedCorr = corrParts.filter(p => p.changed && /\S/.test(p.text)).length;
  const ratio = bWords.length > 0 ? changedCorr / bWords.length : 0;
  if (ratio >= 0.5) {
    return {
      raw: [{ text: raw, changed: true }],
      corrected: [{ text: corrected, changed: true }],
      mode: 'sentence',
    };
  }
  return { raw: rawParts, corrected: corrParts, mode: 'word' };
}

function DiffText({ parts, tone }: { parts: DiffPart[]; tone: 'raw' | 'corrected' }) {
  const hl = tone === 'raw'
    ? 'bg-brand-orange/25 text-brand-orange-deep rounded px-0.5'
    : 'bg-success/20 text-success-strong rounded px-0.5 font-medium';
  return (
    <span>
      {parts.map((p, i) => p.changed
        ? <mark key={i} className={hl}>{p.text}</mark>
        : <span key={i}>{p.text}</span>
      )}
    </span>
  );
}

/* The chat transcript's two files, in the Export popups' card style. */
const CHAT_DOWNLOAD_FORMATS: ExportFormatOption<'pdf' | 'txt'>[] = [
  { key: 'pdf', title: 'PDF Format', description: 'Print-ready document, easy to share or attach.', Icon: FileType2, iconWrap: 'bg-red-100', iconColor: 'text-red-600' },
  { key: 'txt', title: 'Text Format (.txt)', description: 'Plain text that opens anywhere — Notepad, email, any editor.', Icon: ScrollText, iconWrap: 'bg-gray-100', iconColor: 'text-gray-600' },
];

export default function CandidateResultsView({ interview, onBack, tabInUrl = true, currentIndex, totalCount, onPrev, onNext, onNavigateToList, breadcrumbTrail, breadcrumbItems }: CandidateResultsViewProps) {
  // Measured height of the sticky breadcrumb, published as --crumb-h so a
  // second sticky layer (Question Analysis' All / Sections bar) pins just below
  // it even when the pager wraps the bar onto two lines.
  const [breadcrumbBarRef, breadcrumbHeight] = useBreadcrumbOffset();
  // Default to the combined "Evaluation Report" (key 'eval'). The old
  // 'overview' and 'eval_report' tabs are hidden (commented out below) — their
  // content is merged into the Eval tab. The render blocks are kept so any
  // deep-link / fallback still works.
  // In the URL (`?resultTab=`), so a refresh reopens the same tab.
  const [activeTab, setActiveTab] = useUrlTab<TabKey>('resultTab', TAB_KEYS, 'eval', tabInUrl);
  // View Resume opens the resume in a preview popup (ResumeTextPreviewModal,
  // the same one the candidate panels and share dialogs use) instead of
  // swapping the page out, so the recruiter never leaves the results.
  const [isLoadingResume, setIsLoadingResume] = useState(false);
  const [previewResumeId, setPreviewResumeId] = useState<string | null>(null);
  // Resolved on load so the button can explain on hover that there's no
  // resume: undefined = still checking, null = none found.
  const [resolvedResumeId, setResolvedResumeId] = useState<string | null | undefined>(undefined);
  // A resume is linked but its email isn't the one the candidate was invited
  // with — withheld, and the tooltip / empty state say so.
  const [resumeEmailMismatch, setResumeEmailMismatch] = useState(false);
  // Seek request from the Violations Event Log → Recording player. `key` is a
  // monotonic counter (via seekNonceRef) so clicking the same row twice re-fires.
  const [recordingSeek, setRecordingSeek] = useState<{ seconds: number; key: number } | null>(null);
  const seekNonceRef = useRef(0);
  const [transcriptView, setTranscriptView] = useState<'chat' | 'table'>('chat');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [chatDownloadOpen, setChatDownloadOpen] = useState(false);
  const [chatDownloadFormat, setChatDownloadFormat] = useState<'pdf' | 'txt'>('pdf');
  const [chatDownloading, setChatDownloading] = useState(false);
  // Transcript table's Question / Raw Transcript columns: 4-word pills
  // (default) or full text, toggled together from the toolbar — same pill
  // as Resume Scoring's AI Reasoning.
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const [qaExportMenuOpen, setQaExportMenuOpen] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [videoBlobUrl, setVideoBlobUrl] = useState<string | null>(null);
  const [videoBlobSize, setVideoBlobSize] = useState<number | null>(null);
  const [videoDownloadUrl, setVideoDownloadUrl] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [screenBlobUrl, setScreenBlobUrl] = useState<string | null>(null);
  const [screenBlobSize, setScreenBlobSize] = useState<number | null>(null);
  const [screenDownloadUrl, setScreenDownloadUrl] = useState<string | null>(null);
  const [screenLoading, setScreenLoading] = useState(false);
  const [screenError, setScreenError] = useState(false);
  // True while the <video> src is a presigned storage URL (not a backend blob)
  // — gates the one-shot backend fallback in fallbackToBackend().
  const videoStreamedRef = useRef(false);
  const screenStreamedRef = useRef(false);
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set());
  const [violationPage, setViolationPage] = useState(1);
  const [violationsPerPage, setViolationsPerPage] = useState(10);
  const [riskThresholds, setRiskThresholds] = useState<RiskThresholds>(DEFAULT_THRESHOLDS);
  const [violationThresholds, setViolationThresholds] = useState<ViolationCountThresholds>(DEFAULT_VIOLATION_THRESHOLDS);
  const [showThresholdEditor, setShowThresholdEditor] = useState(false);

  // Load saved thresholds from proctoring settings on mount
  useEffect(() => {
    import('@/lib/services/proctoringService').then(({ proctoringService }) => {
      proctoringService.getSettings().then(s => {
        setRiskThresholds({
          low: s.violation_low_threshold ?? DEFAULT_THRESHOLDS.low,
          medium: s.violation_medium_threshold ?? DEFAULT_THRESHOLDS.medium,
        });
      }).catch(() => { /* use defaults */ });
    });
  }, []);
  const [identityPhotoUrl, setIdentityPhotoUrl] = useState<string | null>(null);
  const [reportDownloading, setReportDownloading] = useState(false);
  // ai_interview:download_report — the header's Report button (greyed, never hidden).
  const canDownloadReports = useCanDownloadAIReports();
  const [identityPhotoError, setIdentityPhotoError] = useState(false);

  // liveSession must be declared before any useEffect that references it in its
  // dependency array, because dependency arrays are evaluated immediately during render.
  const router = useRouter();
  const [liveSession, setLiveSession] = useState(interview);
  const [liveWsConnected, setLiveWsConnected] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  useEffect(() => { setLiveSession(interview); }, [interview]);

  /* View JD — the interview's job description, fetched the first time the
     button is opened and kept for this candidate (the AI Interview Details
     page's View JD tab does the same). */
  const resultJdId = interview.jd_id || liveSession.jd_id || '';
  const [resultJd, setResultJd] = useState<JDResponse | null>(null);
  // Keyed by JD id, so a failure for one job never shows against another.
  const [resultJdFailure, setResultJdFailure] = useState<{ jdId: string; message: string } | null>(null);
  const resultJdLoaded = !!resultJd && resultJd.id === resultJdId;
  const resultJdError = resultJdFailure?.jdId === resultJdId ? resultJdFailure.message : null;
  useEffect(() => {
    if (activeTab !== 'viewjd' || !resultJdId || resultJdLoaded || resultJdError) return;
    let cancelled = false;
    jdService.getById(resultJdId)
      .then((jd) => { if (!cancelled) setResultJd(jd); })
      .catch((error: any) => {
        if (!cancelled) setResultJdFailure({ jdId: resultJdId, message: error?.message || 'Failed to load job description' });
      });
    return () => { cancelled = true; };
  }, [activeTab, resultJdId, resultJdLoaded, resultJdError]);
  /* The candidate's CID for the header tagline. The invite LIST endpoints
     inject `candidate_cid`; the single-session GET this page loads often
     doesn't — so when it's missing, find this session in its interview's
     invite list (searched by email) and take the CID from there. */
  const [fetchedCid, setFetchedCid] = useState<string | null>(null);
  useEffect(() => {
    if (interview.candidate_cid || liveSession.candidate_cid) return;
    const configId = (liveSession as any).config_id || (interview as any).config_id;
    const email = interview.candidate_email || liveSession.candidate_email;
    if (!configId || !email) return;
    let cancelled = false;
    aiInterviewService.getConfigInvitations(configId, { search: email, page: 1, page_size: 50, compact: true })
      .then((res) => {
        if (cancelled) return;
        const match = (res.items || []).find((row: any) => row.id === liveSession.id)
          ?? (res.items || []).find((row: any) => (row.candidate_email || '').toLowerCase() === email.toLowerCase() && row.candidate_cid);
        if (match?.candidate_cid) setFetchedCid(match.candidate_cid);
      })
      .catch(() => { /* the tagline simply goes without the CID */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveSession.id]);

  // Fetch recording with auth headers and create blob URL.
  // Uses liveSession (not the initial interview prop) so that when evaluation_ready
  // fires and liveSession is refreshed via REST, a newly-uploaded recording_file_path
  // triggers this effect and the video becomes playable without a manual page reload.
  useEffect(() => {
    if (activeTab !== 'recording' || !liveSession.recording_file_path || videoBlobUrl) return;
    let cancelled = false;
    setVideoLoading(true);
    // STREAM-FIRST: ask for a presigned URL and hand it straight to <video src>
    // so the browser streams with HTTP Range (instant start + seek). Only fall
    // back to the old full-file blob download (slow — 2-3 min on long clips) for
    // local-filesystem storage, where no presigned URL exists.
    (async () => {
      try {
        const meta = await api.get(`/ai-interview/${liveSession.id}/recording-url`);
        const streamUrl = meta?.data?.url;
        if (cancelled) return;
        if (streamUrl) {
          videoStreamedRef.current = true;
          setVideoBlobUrl(streamUrl);   // presigned URL — <video> streams it directly
          // Size + a force-download URL (content-disposition: attachment) come
          // from the backend — the streaming path never downloads a blob, so
          // without these File Size shows "—" and Download plays inline.
          if (meta?.data?.size != null) setVideoBlobSize(Number(meta.data.size));
          if (meta?.data?.download_url) setVideoDownloadUrl(meta.data.download_url);
          setVideoLoading(false);
          return;
        }
      } catch { /* fall through to blob download */ }
      try {
        const res = await api.get(`/ai-interview/${liveSession.id}/recording`, { responseType: 'blob' });
        if (cancelled) return;
        setVideoBlobUrl(URL.createObjectURL(res.data));
        setVideoBlobSize(res.data?.size ?? null);
      } catch {
        if (!cancelled) setVideoError(true);
      } finally {
        if (!cancelled) setVideoLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeTab, liveSession.recording_file_path, liveSession.id, videoBlobUrl]);

  // Fetch screen recording when recording tab is active
  useEffect(() => {
    if (activeTab !== 'recording' || !liveSession.screen_recording_file_path || screenBlobUrl || screenError) return;
    let cancelled = false;
    setScreenLoading(true);
    // STREAM-FIRST (see candidate-recording effect above): presigned URL → direct
    // <video> streaming; blob download only as the local-storage fallback.
    (async () => {
      try {
        const meta = await api.get(`/ai-interview/${liveSession.id}/screen-recording-url`);
        const streamUrl = meta?.data?.url;
        if (cancelled) return;
        if (streamUrl) {
          screenStreamedRef.current = true;
          setScreenBlobUrl(streamUrl);
          if (meta?.data?.size != null) setScreenBlobSize(Number(meta.data.size));
          if (meta?.data?.download_url) setScreenDownloadUrl(meta.data.download_url);
          setScreenLoading(false);
          return;
        }
      } catch { /* fall through to blob download */ }
      try {
        const res = await api.get(`/ai-interview/${liveSession.id}/screen-recording`, { responseType: 'blob' });
        if (cancelled) return;
        setScreenBlobUrl(URL.createObjectURL(res.data));
        setScreenBlobSize(res.data?.size ?? null);
      } catch {
        if (!cancelled) setScreenError(true);
      } finally {
        if (!cancelled) setScreenLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeTab, liveSession.screen_recording_file_path, liveSession.id, screenBlobUrl, screenError]);

  // STREAM FALLBACK: the presigned URL is fetched by the viewer's browser
  // straight from object storage. On some networks (antivirus HTTPS scanning,
  // VPN/proxy timeouts) that transfer is cut mid-file — Chrome reports
  // ERR_CONTENT_LENGTH_MISMATCH and the <video> errors. Retry ONCE through the
  // backend proxy (server ↔ storage on the internal network), which downloads
  // the full file as a blob. The force-download URL also points at storage, so
  // it is cleared — Download then uses the same-origin blob.
  const fallbackToBackend = async (kind: 'candidate' | 'screen') => {
    const isCandidate = kind === 'candidate';
    const streamedRef = isCandidate ? videoStreamedRef : screenStreamedRef;
    const setError = isCandidate ? setVideoError : setScreenError;
    if (!streamedRef.current) { setError(true); return; }   // already the blob path → real failure
    streamedRef.current = false;
    const setLoading = isCandidate ? setVideoLoading : setScreenLoading;
    setLoading(true);
    try {
      const res = await api.get(
        `/ai-interview/${liveSession.id}/${isCandidate ? 'recording' : 'screen-recording'}`,
        // proxy=true: the endpoint otherwise 307-redirects s3 files right back
        // to the storage URL that just failed.
        { responseType: 'blob', params: { proxy: true } },
      );
      const url = URL.createObjectURL(res.data);
      if (isCandidate) {
        setVideoBlobUrl(url); setVideoBlobSize(res.data?.size ?? null); setVideoDownloadUrl(null);
      } else {
        setScreenBlobUrl(url); setScreenBlobSize(res.data?.size ?? null); setScreenDownloadUrl(null);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  // Fetch identity photo if available
  useEffect(() => {
    if (!interview.identity_photo_path || identityPhotoUrl || identityPhotoError) return;
    let cancelled = false;
    api.get(`/ai-interview/${interview.id}/identity-photo`, { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return;
        setIdentityPhotoUrl(URL.createObjectURL(res.data));
      })
      .catch(() => { if (!cancelled) setIdentityPhotoError(true); });
    return () => { cancelled = true; };
  }, [interview.identity_photo_path, interview.id, identityPhotoUrl, identityPhotoError]);

  // Live activity feed — tracks real-time skill coverage changes and question events
  type LiveEvent =
    | { kind: 'question';  qNum: number; isFollowUp: boolean; ts: number }
    // Direct skill→question assignment from question_timer_started.current_skill (ground truth)
    | { kind: 'assigned';  skill: string; qNum: number; isFollowUp: boolean; ts: number }
    | { kind: 'covered';   skill: string; ts: number; qNum?: number; isFollowUp?: boolean }
    | { kind: 'medium';    skill: string; ts: number; qNum?: number; isFollowUp?: boolean }
    | { kind: 'low';       skill: string; ts: number; qNum?: number; isFollowUp?: boolean };
  const [currentQuestion, setCurrentQuestion] = useState<{ qNum: number; isFollowUp: boolean } | null>(null);
  // Ref mirrors currentQuestion for synchronous access inside WebSocket closure
  const currentQuestionRef = useRef<{ qNum: number; isFollowUp: boolean } | null>(null);
  const prevScRef = useRef<typeof liveSession.skill_coverage | null>(null);
  // Ratchet: tracks the best (highest) skill level ever seen across all rounds (MTH → NTH).
  // Prevents skills from appearing as "Not Covered" when the backend resets sc for the next round.
  // Seeded from interview.skill_coverage (DB value) so it works even when the page is opened
  // mid-interview (e.g. after MTH round ends, before any WS message is received for MTH skills).
  const skillLevelRatchetRef = useRef<Record<string, 'covered' | 'medium' | 'low' | 'skipped'>>((() => {
    const r: Record<string, 'covered' | 'medium' | 'low'> = {};
    const sc = interview.skill_coverage;
    if (sc) {
      for (const s of sc.covered        || []) r[s.toLowerCase()] = 'covered';
      for (const s of sc.medium_covered || []) { const k = s.toLowerCase(); if (!(k in r)) r[k] = 'medium'; }
      for (const s of sc.low_covered    || []) { const k = s.toLowerCase(); if (!(k in r)) r[k] = 'low'; }
    }
    return r;
  })());

  // Live events — loaded from DB (coverage_events field on session), saved back on each new event
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>(
    () => (interview.coverage_events as LiveEvent[] | undefined) || []
  );
  // Sync if interview prop refreshes with newer DB data (e.g. after REST poll)
  useEffect(() => {
    if (interview.coverage_events && interview.coverage_events.length > 0) {
      setLiveEvents(prev =>
        prev.length >= interview.coverage_events!.length ? prev : (interview.coverage_events as LiveEvent[])
      );
    }
  }, [interview.coverage_events]);

  // Coverage events are now written server-side (backend emits + persists via
  // coverage_events JSONB). The frontend no longer POSTs back, which removes
  // the dual-storage divergence risk. Client-derived events below are kept for
  // live UI display only — the canonical timeline comes from the REST payload
  // on refresh and from the `coverage_events_appended` WS message in-session.

  // Tick every second to keep "X ago" relative time fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!lastUpdatedAt) return;
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, [lastUpdatedAt]);

  // WebSocket is the sole source of truth for skill_coverage during in_progress.
  // REST polling was removed — it overwrote WebSocket data with stale DB values.

  useEffect(() => {
    if (liveSession.status !== 'in_progress') return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const apiBase = process.env.NEXT_PUBLIC_API_URL?.replace(/^https?:\/\//, '').replace(/\/api\/v1$/, '') || 'localhost:8000';
    const token = typeof window !== 'undefined' ? getAccessToken() : null;
    if (!token) return;

    const wsUrl = `${protocol}//${apiBase}/api/v1/ws/ai-interview/${liveSession.id}/monitor?token=${encodeURIComponent(token)}`;

    let ws: WebSocket | null = null;
    let pingId: ReturnType<typeof setInterval> | null = null;
    let reconnectId: ReturnType<typeof setTimeout> | null = null;
    let dead = false;

    const connect = () => {
      if (dead) return;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setLiveWsConnected(true);
        // Keepalive ping every 20s
        if (pingId) clearInterval(pingId);
        pingId = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
        }, 20000);
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          // Live skill coverage broadcasts removed (batch model — coverage
          // is computed once at interview end and loaded via REST on evaluation_ready).
          // WS kept for: question timer, interview lifecycle, evaluation_ready.
          if (msg.type === 'question_timer_started') {
            const qNum = msg.question_number ?? 0;
            const isFollowUp = !!msg.is_follow_up;
            currentQuestionRef.current = { qNum, isFollowUp };
            setCurrentQuestion({ qNum, isFollowUp });
          } else if (msg.type === 'interview_closing' || msg.type === 'interview_complete' || msg.type === 'interview_ended') {
            // Interview finished — clear the active-question marker so the
            // SkillCoveragePanel stops rendering the "live" pulse / ring on
            // the in-progress skill. Without this, the recruiter monitor
            // keeps animating the last active skill long after the candidate
            // has finished. Then refresh from REST to update status display.
            // NOTE: ai_evaluation may not be saved yet (backend saves after this event).
            // The evaluation_ready event below triggers the definitive refresh once saved.
            currentQuestionRef.current = null;
            setCurrentQuestion(null);
            aiInterviewService.get(liveSession.id)
              .then(updated => setLiveSession(updated))
              .catch(() => {});
          } else if (msg.type === 'evaluation_ready') {
            // Backend has finished saving ai_evaluation to DB — fetch the complete data.
            // This fires AFTER _save_interview_results() completes, so the REST response
            // will contain the full evaluation (unlike the earlier interview_ended refresh).
            aiInterviewService.get(liveSession.id)
              .then(updated => setLiveSession(updated))
              .catch(() => {});
          }
        } catch { /* ignore non-JSON */ }
      };

      ws.onerror = () => setLiveWsConnected(false);

      ws.onclose = () => {
        setLiveWsConnected(false);
        if (pingId) { clearInterval(pingId); pingId = null; }
        // Reconnect after 3s unless torn down
        if (!dead) reconnectId = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      dead = true;
      if (pingId) clearInterval(pingId);
      if (reconnectId) clearTimeout(reconnectId);
      if (ws) { ws.onopen = null; ws.onmessage = null; ws.onerror = null; ws.onclose = null; ws.close(1000); }
      setLiveWsConnected(false);
    };
  }, [liveSession.status, liveSession.id]);

  // ─── Cluster config resolution ───────────────────────────────────────────
  // Sessions may not inherit special_instructions from the parent config.
  // Parse from session first; fall back to fetching the config once via config_id.
  type ClusterDef = { id: string; name: string; priority: number; skills: string[] };

  const parseClusterConfig = (si?: string | null): { mth: ClusterDef[]; nth: ClusterDef[] } => {
    if (!si) return { mth: [], nth: [] };
    try {
      const parsed = JSON.parse(si);
      return { mth: parsed.mth_clusters || [], nth: parsed.nth_clusters || [] };
    } catch { return { mth: [], nth: [] }; }
  };

  const [fetchedClusters, setFetchedClusters] = useState<{ mth: ClusterDef[]; nth: ClusterDef[] } | null>(null);

  // Fetch parent config once when session has no cluster data
  useEffect(() => {
    const fromSession = parseClusterConfig((liveSession as any).special_instructions);
    if (fromSession.mth.length > 0 || fromSession.nth.length > 0) return; // session has it
    const configId = (liveSession as any).config_id;
    if (!configId) return;
    aiInterviewService.get(configId)
      .then(cfg => {
        const clusters = parseClusterConfig((cfg as any).special_instructions);
        if (clusters.mth.length > 0 || clusters.nth.length > 0) setFetchedClusters(clusters);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveSession.id]);

  // Effective cluster config: session > fetched config
  const clusterConfig = useMemo(() => {
    const fromSession = parseClusterConfig((liveSession as any).special_instructions);
    if (fromSession.mth.length > 0 || fromSession.nth.length > 0) return fromSession;
    return fetchedClusters || { mth: [], nth: [] };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(liveSession as any).special_instructions, fetchedClusters]);

  // ─── Best-seen skill coverage ref ────────────────────────────────────────
  // Persist the richest skill_coverage snapshot we've ever seen in this session.
  // Used as last-resort fallback when the completed session's eval data is all-zero/weak.
  const bestSeenSkillCoverageRef = useRef<typeof liveSession.skill_coverage>(undefined);
  useEffect(() => {
    const sc = liveSession.skill_coverage;
    if (!sc) return;
    const meaningful = (sc.covered?.length ?? 0) + (sc.medium_covered?.length ?? 0) + (sc.low_covered?.length ?? 0);
    if (meaningful === 0) return;
    const prev = bestSeenSkillCoverageRef.current;
    const prevMeaningful = prev ? (prev.covered?.length ?? 0) + (prev.medium_covered?.length ?? 0) + (prev.low_covered?.length ?? 0) : 0;
    if (meaningful >= prevMeaningful) bestSeenSkillCoverageRef.current = sc;
  }, [liveSession.skill_coverage]);

  // ─── Cross-cluster delta tracking ─────────────────────────────────────────
  // Detect when a single answer adds skills from 2+ different clusters.
  const prevSkillCoverageRef = useRef<typeof liveSession.skill_coverage>(undefined);
  const [crossClusterEvents, setCrossClusterEvents] = useState<{
    qNum: number; clusters: string[]; skills: string[]; ts: number;
  }[]>([]);

  useEffect(() => {
    const sc = liveSession.skill_coverage;
    const prev = prevSkillCoverageRef.current;
    prevSkillCoverageRef.current = sc;
    if (!sc || !prev || clusterConfig.mth.length + clusterConfig.nth.length === 0) return;

    // Skills newly covered since last update
    const prevSet = new Set([...prev.covered, ...prev.medium_covered, ...prev.low_covered].map(s => s.toLowerCase()));
    const newSkills = [...sc.covered, ...sc.medium_covered, ...sc.low_covered]
      .filter(s => !prevSet.has(s.toLowerCase()));
    if (newSkills.length === 0) return;

    // Map new skills → which clusters they belong to
    const allClusters = [
      ...clusterConfig.mth.map(c => ({ ...c, section: 'mth' })),
      ...clusterConfig.nth.map(c => ({ ...c, section: 'nth' })),
    ];
    const newSkillsLower = new Set(newSkills.map(s => s.toLowerCase()));
    const hitClusters = allClusters
      .filter(c => c.skills.some(s => newSkillsLower.has(s.toLowerCase())))
      .map(c => c.name);

    if (hitClusters.length > 1) {
      setCrossClusterEvents(prev => [
        ...prev.slice(-9),
        { qNum: sc.questions_asked, clusters: hitClusters, skills: newSkills, ts: Date.now() },
      ]);
    }
  }, [liveSession.skill_coverage, clusterConfig]);

  const eval_ = liveSession.ai_evaluation || {};
  const isCompleted = liveSession.status === 'completed';
  const isInProgress = liveSession.status === 'in_progress';
  const isPartial = eval_.partial === true;
  const hasData = isCompleted || isPartial;

  // ── Evaluation readiness detection ─────────────────────────────────
  // After an interview completes, there's a gap while the batch evaluator
  // runs (_save_interview_results). During this gap, status = 'completed'
  // but ai_evaluation is empty/partial. All tabs should show a spinner
  // until the evaluation lands.
  //
  // Detection: v2 has evaluation_version; v1 has capability_score or cluster_insights.
  // If completed but none of these exist, evaluation is still pending.
  // Invariant: a PARTIAL ("attended questions only — no pass/fail") result is
  // allowed ONLY when the interview was actually TERMINATED (production
  // proctoring: candidate left the screen / tab switch / focus loss). Every
  // other interview — staging always, and any production interview that ran to
  // the end — must resolve to a FULL evaluation. If a non-terminated interview
  // carries an "eval did not run" stub (evaluation_incomplete / evaluation_error,
  // e.g. the WS dropped mid-eval or the eval timed out), it is NOT partial — the
  // transcript is intact and can be fully scored, so we treat it as still
  // generating and kick off a re-evaluation (see the auto-reeval effect below).
  const _closingReasonLc = (eval_.closing_reason || '').toString().toLowerCase();
  const wasTerminated =
    (liveSession.status || '').toString().toLowerCase() === 'terminated' ||
    _closingReasonLc.includes('proctor') ||
    _closingReasonLc.includes('terminate') ||
    _closingReasonLc.includes('left_screen');
  const evalIncomplete =
    eval_.evaluation_incomplete === true || !!eval_.evaluation_error;

  // Did the candidate actually reach the END of the interview? Two independent
  // signals — either is sufficient:
  //   (a) question_history has no 'not_asked' padding (every planned Q was asked)
  //   (b) closing_reason is a NORMAL completion (all rounds done / candidate
  //       ended / max questions), i.e. not a mid-interview drop.
  // A reached-the-end, non-terminated interview that only carries a partial /
  // stub checkpoint is NOT "disconnected" — its FULL evaluation is simply still
  // being produced in the background (detached finalize). We must show the
  // "Generating results" spinner for it, never the disconnected/partial banner.
  const reevalCrossedEnd = useMemo(() => {
    const qh = Array.isArray((eval_ as any)?.question_history) ? (eval_ as any).question_history : [];
    if (qh.length === 0) return false;
    return !qh.some((q: any) => String(q?.response_type || '').toLowerCase() === 'not_asked');
  }, [eval_]);
  const _normalCloseReasons = new Set([
    'all_rounds_completed',
    'all_rounds_completed_in_buffer',
    'candidate_ended',
    'max_questions',
    'max_questions_reached',
  ]);
  const closedNormally = _normalCloseReasons.has(_closingReasonLc.split(':')[0].trim());
  const reachedEnd = reevalCrossedEnd || closedNormally;

  const evaluationReady = !!(
    (eval_.evaluation_version ||
      eval_.capability_score ||
      eval_.cluster_insights?.length ||
      eval_.evaluations?.length)
    // A non-terminated "eval did not run" stub is NOT ready: keep the
    // "Generating results" spinner (which polls) and let the auto-reeval below
    // populate real results, instead of rendering the stub as a partial report.
    && !(evalIncomplete && !wasTerminated)
  );
  // The full evaluation is still being produced in the background when EITHER:
  //   • status flipped to 'completed' but the eval payload hasn't landed yet, OR
  //   • the candidate reached the END (reachedEnd) and wasn't terminated, but the
  //     row is transiently 'in_progress' + partial/stub while the detached
  //     finalize runs. Both render the friendly "Generating results" spinner and
  //     poll until the real evaluation arrives — NOT the disconnected banner.
  // "Completed (Auto)" with NOTHING recorded: the candidate's socket never
  // delivered a single turn (WS failed before Q1 / dropped immediately) and the
  // timeout monitor auto-finalized the row with a stub. There is no transcript
  // to score — the evaluate endpoint answers 400 "No transcript available" —
  // so "still generating" would spin forever. Treat it as a TERMINAL state.
  // Both signals must be empty: a stub row that still has a transcript is a
  // real "eval did not run" case and keeps the spinner + auto re-eval below.
  const noAnswersRecorded = useMemo(() => {
    if (!isCompleted || !evalIncomplete || wasTerminated) return false;
    const transcript = (liveSession as any)?.conversation_transcript;
    const qh = (eval_ as any)?.question_history;
    const transcriptEmpty = !Array.isArray(transcript) || transcript.length === 0;
    const qhEmpty = !Array.isArray(qh) || qh.length === 0;
    return transcriptEmpty && qhEmpty;
  }, [isCompleted, evalIncomplete, wasTerminated, liveSession, eval_]);

  const evaluationInFlight = reachedEnd && !wasTerminated && !evaluationReady && !noAnswersRecorded;
  const evaluationPending = ((isCompleted && !evaluationReady) || evaluationInFlight) && !noAnswersRecorded;

  // Polling fallback — when the page loads after interview ended but before
  // evaluation finished, there's no WS to receive evaluation_ready. Poll
  // every 5s until data arrives, then stop.
  useEffect(() => {
    if (!evaluationPending) return;
    let cancelled = false;
    const poll = setInterval(() => {
      aiInterviewService.get(liveSession.id)
        .then(updated => {
          if (cancelled) return;
          setLiveSession(updated);
        })
        .catch(() => {});
    }, 5000);
    return () => { cancelled = true; clearInterval(poll); };
  }, [evaluationPending, liveSession.id]);

  // Auto re-evaluation — a NON-terminated interview that carries an "eval did
  // not run" stub must be scored fully from its saved transcript (invariant:
  // partial ⟺ terminated). Fire the re-eval endpoint ONCE per session so the
  // "Generating results" spinner above converges to a real evaluation instead
  // of spinning forever. Guarded by a ref so the 5s poll can't re-trigger it.
  const _autoReevalFiredRef = useRef<string | null>(null);
  const [retryingEval, setRetryingEval] = useState(false);
  // Last error from the evaluate endpoint (e.g. 400 "No transcript available").
  // Surfaced inside the spinner so a failed trigger is visible instead of
  // silently swallowed while the page keeps polling.
  const [evalTriggerError, setEvalTriggerError] = useState<string | null>(null);
  const describeEvalError = (err: any): string => {
    const detail = err?.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
    if (detail && typeof detail === 'object') { try { return JSON.stringify(detail); } catch { /* fall through */ } }
    return err?.message || 'Evaluation request failed';
  };
  // The endpoint declines while the interview's own live evaluation is still
  // running (stub carries evaluation_in_progress_since) — the 5s poll picks up
  // that result. If it never lands, re-arm after 60s so the stub still gets
  // re-evaluated once the server's in-progress window has passed.
  const [autoReevalTick, setAutoReevalTick] = useState(0);
  useEffect(() => {
    if (!isCompleted || !evalIncomplete || wasTerminated || noAnswersRecorded) return;
    if (_autoReevalFiredRef.current === liveSession.id) return;
    _autoReevalFiredRef.current = liveSession.id;
    setEvalTriggerError(null);
    let rearm: ReturnType<typeof setTimeout> | undefined;
    aiInterviewService.triggerEvaluation(liveSession.id)
      .then(() => aiInterviewService.get(liveSession.id))
      .then(updated => {
        setLiveSession(updated);
        if ((updated as any)?.ai_evaluation?.evaluation_in_progress_since
            && (updated as any)?.ai_evaluation?.evaluation_incomplete) {
          rearm = setTimeout(() => {
            _autoReevalFiredRef.current = null;
            setAutoReevalTick(t => t + 1);
          }, 60000);
        }
      })
      .catch((err: any) => { setEvalTriggerError(describeEvalError(err)); /* poll fallback keeps trying; stub remains re-evaluable */ });
    return () => { if (rearm) clearTimeout(rearm); };
  }, [isCompleted, evalIncomplete, wasTerminated, noAnswersRecorded, liveSession.id, autoReevalTick]);

  // ── Recruiter "Re-Evaluate" (SAFE, ONE-TIME) ──────────────────────────────
  // Fallback for an interview whose candidate reached the END but whose result is
  // GENUINELY stuck partial (the background finalize never converged and the
  // eval-pending spinner isn't in play). `reevalCrossedEnd` (computed above) gates
  // eligibility; the backend enforces one-time + not-in-flight. On success the row
  // becomes COMPLETED with a full evaluation, so `isPartial` flips false → banner +
  // button disappear for good. Note: while the eval is still being produced in the
  // background this banner does NOT show at all — `evaluationPending` renders the
  // "Generating results" spinner instead (see the partial-banner gate below).
  const [reEvaluating, setReEvaluating] = useState(false);
  // A disabled JD's results stay viewable, but re-evaluating is an action.
  const jdDisabled = isJdDisabled(liveSession.jd_status);
  const handleReEvaluate = async () => {
    if (reEvaluating) return;
    if (jdDisabled) {
      toast.error(JD_DISABLED_ACTION_MESSAGE);
      return;
    }
    setReEvaluating(true);
    const _t = toast.loading('Re-evaluating the interview — this can take a minute…');
    try {
      await aiInterviewService.reEvaluatePartial(liveSession.id);
      const updated = await aiInterviewService.get(liveSession.id);
      setLiveSession(updated); // now COMPLETED + full eval → button hides
      toast.success('Interview re-evaluated. The full results are now available.', { id: _t });
    } catch (err: any) {
      const status = err?.response?.status;
      const rawDetail = err?.response?.data?.detail;
      // A disabled-JD refusal arrives as {error, message}, not a string.
      const detail = typeof rawDetail === 'string' ? rawDetail : rawDetail?.message;
      const msg =
        status === 409 ? (detail || 'This interview has already been re-evaluated.')
        : status === 400 ? (detail || 'Re-evaluation is only available once the candidate reached the end of the interview.')
        : (detail || 'Re-evaluation could not be completed. Please try again.');
      toast.error(msg, { id: _t });
    } finally {
      setReEvaluating(false);
    }
  };

  // Live elapsed counter for the evaluation wait. The post-interview
  // multi-agent eval genuinely runs ~1-3 min (sequential gpt-4o-mini agents);
  // a static "15-30 seconds" spinner made a working eval look frozen. Showing
  // a ticking timer reassures the recruiter it's progressing. Resets to 0
  // whenever the pending state clears (eval done or not pending).
  const [evalElapsedSec, setEvalElapsedSec] = useState(0);
  useEffect(() => {
    if (!evaluationPending) { setEvalElapsedSec(0); return; }
    const start = Date.now();
    const tick = setInterval(
      () => setEvalElapsedSec(Math.floor((Date.now() - start) / 1000)),
      1000,
    );
    return () => clearInterval(tick);
  }, [evaluationPending]);

  // Flexible/conversational mode is read from the authoritative source:
  // special_instructions.interview_mode ('flexible' = conversational, 'fixed' = timed).
  // The old heuristic (presence of capability_score_reasoning) was unreliable because
  // the field is now populated for both modes.
  const isFlexibleMode = useMemo(() => {
    const si = (interview as any).special_instructions || (liveSession as any).special_instructions;
    if (!si) return false;
    try {
      const parsed = typeof si === 'string' ? JSON.parse(si) : si;
      return parsed?.interview_mode === 'flexible';
    } catch {
      return false;
    }
  }, [(interview as any).special_instructions, (liveSession as any).special_instructions]);

  // Build round performance data for display (0-100 scale)
  // Prefer section_scores (cluster-weighted, already 0-100) over legacy round_scores (1-5 scale)
  const roundScores: { name: string; score: number; percentage: number; weight: number }[] = useMemo(() => {
    if (eval_.section_scores && Object.keys(eval_.section_scores).length > 0) {
      return Object.entries(eval_.section_scores).map(([cat, s]: [string, any]) => {
        const pct = Math.round(s.score ?? 0);
        return {
          name: s.section_name || cat.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
          score: s.score ?? 0,
          percentage: pct,
          weight: s.section_pct ?? 0,
        };
      });
    }
    // Fallback: legacy round_scores. Historically this was stored as a list
    // of {type, score, percentage}, but some older sessions stored it as a
    // map of {round_type: {score, percentage}}. Normalize both shapes to an
    // array before mapping — a plain `|| []` guard accepts a non-array
    // object and blows up on `.map`.
    const rs = eval_.round_scores;
    const rsArray: any[] = Array.isArray(rs)
      ? rs
      : rs && typeof rs === 'object'
        ? Object.entries(rs).map(([type, v]: [string, any]) => ({ type, ...(v || {}) }))
        : [];
    return rsArray.map((r: any) => {
      const raw = r.score ?? 0;
      const pct = raw > 0 ? Math.round((raw / 5) * 100) : 0;
      return {
        name: r.type?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || 'Unknown',
        score: raw,
        percentage: pct,
        weight: r.percentage ?? 0,
      };
    });
  }, [eval_.round_scores, eval_.section_scores]);

  const sentimentTimeline: any[] = useMemo(() => {
    return (eval_.sentiment_timeline || []).map((t: any) => ({
      turn: `Turn ${t.turn}`,
      confidence: t.confidence ?? 0,
      nervousness: t.nervousness ?? 0,
      engagement: t.engagement ?? 0,
      dominant_emotion: t.dominant_emotion,
    }));
  }, [eval_.sentiment_timeline]);

  const evaluations: any[] = eval_.evaluations || [];
  const summary = eval_.interview_summary || {};
  const sentimentSummary = eval_.sentiment_summary || {};

  // Canonical status → shared Badge variant (same colour for a status everywhere).
  const getStatusVariant = (status: string): 'success' | 'warning' | 'info' | 'destructive' | 'muted' => {
    const map: Record<string, 'success' | 'warning' | 'info' | 'destructive' | 'muted'> = {
      completed: 'success',
      in_progress: 'info',
      invited: 'info',
      cancelled: 'destructive',
      draft: 'info',
    };
    return map[status] || 'muted';
  };

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      completed: 'Completed',
      in_progress: 'In Progress',
      invited: 'Invited',
      expired: 'Expired',
      terminated: 'Terminated',
      revoked: 'Revoked',
      cancelled: 'Cancelled',
      draft: 'Draft',
    };
    return map[status] || status;
  };

  const getScoreColor = (score: number) => {
    if (score >= 4) return 'text-success bg-success-subtle border-success-line ring-1 ring-success-line';
    if (score >= 3) return 'text-brand-orange-deep bg-brand-orange/10 border-brand-orange/30 ring-1 ring-brand-orange/20';
    return 'text-destructive bg-destructive-subtle border-destructive-line ring-1 ring-destructive-line';
  };

  const toggleQuestion = (key: string) => {
    setExpandedQuestions(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const formatDuration = (mins?: number) => {
    if (!mins) return 'N/A';
    if (mins >= 60) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    return `${mins} min`;
  };

  // Proctoring violations — use liveSession so real-time flushed violations
  // and the final post-completion refresh both populate this list.
  const violations: ViolationRecord[] = useMemo(
    () => liveSession.proctoring_violations ?? [],
    [liveSession],
  );
  const totalViolations = violations.length;
  // Recruiter-facing summary (serious/moderate/minor, advisory excluded) — see violationTaxonomy.
  const violationSummary = useMemo(() => summarizeViolations(violations), [violations]);
  // Mobile QR environment-verification attempts for the "QR Verification"
  // tab. Sourced DIRECTLY from the database via GET
  // /ai-interview/{id}/environment-verifications — NOT from
  // proctoring_violations/environment_verification_* events, which only
  // exist once the background Celery analysis task finishes. That made the
  // tab show a false "No QR verification was triggered" for an interview
  // where the candidate HAD already uploaded successfully but analysis
  // hadn't run yet (e.g. Celery worker down) — the DB row (status=
  // "submitted", video_url set) is the actual source of truth and exists
  // immediately on upload, independent of analysis. See STRICT
  // IMPLEMENTATION PROMPT, 2026-08-14.
  type EnvVerificationRecord = {
    verification_id: string;
    status: string;
    analysis_status: string | null;
    triggered_at: string | null;
    // When the phone first opened the QR link (null = never scanned) and
    // when the QR window closed/closes. Optional — older backends omit them.
    opened_at?: string | null;
    expires_at?: string | null;
    submitted_at: string | null;
    video_duration_seconds?: number | null;
    video_uploaded: boolean;
    video_url: string | null;
    download_url: string | null;
    video_mime_type: string | null;
    video_size_bytes: number | null;
    ai_summary: string | null;
    flagged_items: Array<Record<string, unknown>> | null;
    color_match: boolean | null;
    id_match: boolean | null;
    rgb_sequence_results: Array<{ second: number; expected_rgb: string; detected_rgb: string | null; distance: number | null; match: boolean }> | null;
    result_severity: string | null;
    // Millisecond offsets (into the actual recorded timeline, pause-time
    // excluded) where the phone's client-side VAD detected sustained
    // human-speech-like audio. Null/absent for older attempts or when none
    // was detected.
    voice_activity_offsets_ms: number[] | null;
  };
  const [envVerifications, setEnvVerifications] = useState<EnvVerificationRecord[] | null>(null);
  const [envVerificationsLoading, setEnvVerificationsLoading] = useState(false);
  const [envVerificationsError, setEnvVerificationsError] = useState(false);
  // Per-record local video state — only used for the local-disk storage
  // fallback (the list endpoint's video_url is null there, same as the
  // existing recording tab's convention); populated via an authenticated
  // blob fetch since a plain <video src> can't carry the Authorization
  // header that endpoint requires.
  const [envVideoBlobUrls, setEnvVideoBlobUrls] = useState<Record<string, string>>({});
  // One <video> element ref per verification card, keyed by verification_id —
  // lets a flagged item's timestamp jump straight to that point in THIS clip
  // (as opposed to the header's jump-to-recording link, which seeks the main
  // interview recording instead), matching Integrity Check's click-to-jump
  // format for the flagged-item evidence too.
  const envVideoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const envVideoBlobRequestedRef = useRef<Set<string>>(new Set());

  // Per-verification "Retry analysis" in-flight flag + last error message.
  const [envReanalyzing, setEnvReanalyzing] = useState<Record<string, boolean>>({});
  const [envReanalyzeError, setEnvReanalyzeError] = useState<Record<string, string>>({});

  // Initial load — runs once per interview on mount (not only when the tab
  // is opened) so the tab badge can show the count and turn red for a
  // flagged result before the recruiter even clicks into the tab.
  useEffect(() => {
    if (envVerifications !== null) return;
    let cancelled = false;
    setEnvVerificationsLoading(true);
    console.info(`[ENV-VERIFY] Fetching verification for interview=${liveSession.id}`);
    api.get(`/ai-interview/${liveSession.id}/environment-verifications`)
      .then(res => {
        if (cancelled) return;
        const list: EnvVerificationRecord[] = Array.isArray(res?.data?.verifications) ? res.data.verifications : [];
        console.info(`[ENV-VERIFY] Verification found=${list.length > 0} count=${list.length}`);
        setEnvVerifications(list);
      })
      .catch(() => {
        if (cancelled) return;
        setEnvVerificationsError(true);
        setEnvVerifications([]);
      })
      .finally(() => { if (!cancelled) setEnvVerificationsLoading(false); });
    return () => { cancelled = true; };
  }, [liveSession.id, envVerifications]);

  // Auto-refresh while anything is still in flight — analysis queued/running,
  // or the QR still waiting on the phone (pending/opened). Silent re-fetch
  // (no skeleton) every 5s; stops by itself once every attempt is final.
  // Frames for an attempt whose analysis_status changed are dropped so the
  // frames effect below re-fetches them (they only exist once analysis ends).
  const envHasInFlight = useMemo(
    () => (envVerifications ?? []).some(v =>
      v.analysis_status === 'pending' || v.analysis_status === 'running'
      // pending/opened only count while the interview is live — after it
      // ends, a row stuck there is final (candidate never finished), and
      // polling it would never stop.
      || (isInProgress && (v.status === 'pending' || v.status === 'opened'))
    ),
    [envVerifications, isInProgress],
  );
  useEffect(() => {
    if (!envHasInFlight) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      api.get(`/ai-interview/${liveSession.id}/environment-verifications`)
        .then(res => {
          if (cancelled) return;
          const list: EnvVerificationRecord[] = Array.isArray(res?.data?.verifications) ? res.data.verifications : [];
          setEnvVerifications(prev => {
            const prevById = new Map((prev ?? []).map(p => [p.verification_id, p]));
            const changed = list
              .filter(n => prevById.get(n.verification_id)?.analysis_status !== n.analysis_status)
              .map(n => n.verification_id);
            if (changed.length > 0) {
              const drop = <T,>(rec: Record<string, T>) => {
                const next = { ...rec };
                changed.forEach(id => { delete next[id]; });
                return next;
              };
              setEnvFrames(drop);
              setEnvFramesError(drop);
              setEnvFramesLoading(drop);
            }
            return list;
          });
        })
        .catch(() => { /* keep showing last good data; next tick retries */ });
    }, 5000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [envHasInFlight, envVerifications, liveSession.id]);

  const retryEnvAnalysis = (verificationId: string) => {
    setEnvReanalyzing(prev => ({ ...prev, [verificationId]: true }));
    setEnvReanalyzeError(prev => { const n = { ...prev }; delete n[verificationId]; return n; });
    api.post(`/ai-interview/environment-verification/${verificationId}/reanalyze`)
      .then(() => {
        setEnvVerifications(prev => (prev ?? []).map(v =>
          v.verification_id === verificationId ? { ...v, analysis_status: 'pending' } : v
        ));
      })
      .catch((err) => {
        const msg = err?.response?.data?.detail;
        setEnvReanalyzeError(prev => ({ ...prev, [verificationId]: typeof msg === 'string' ? msg : 'Could not restart analysis. Please try again.' }));
      })
      .finally(() => setEnvReanalyzing(prev => ({ ...prev, [verificationId]: false })));
  };

  // Verification Frames tab — the ~20 individual frames the vision LLM
  // actually analyzed, one fetch per verification record (frames are
  // per-verification, not per-interview, unlike the list above).
  type EnvFrame = { index: number; url: string | null };
  const [envFrames, setEnvFrames] = useState<Record<string, EnvFrame[]>>({});
  const [envFramesLoading, setEnvFramesLoading] = useState<Record<string, boolean>>({});
  const [envFramesError, setEnvFramesError] = useState<Record<string, boolean>>({});
  const [envFrameViewer, setEnvFrameViewer] = useState<{ urls: string[]; index: number } | null>(null);

  useEffect(() => {
    if (!envFrameViewer) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEnvFrameViewer(null);
      else if (e.key === 'ArrowLeft') setEnvFrameViewer(prev => prev && prev.index > 0 ? { ...prev, index: prev.index - 1 } : prev);
      else if (e.key === 'ArrowRight') setEnvFrameViewer(prev => prev && prev.index < prev.urls.length - 1 ? { ...prev, index: prev.index + 1 } : prev);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [envFrameViewer]);

  useEffect(() => {
    if (activeTab !== 'verification' || !envVerifications || envVerifications.length === 0) return;
    envVerifications.forEach((v) => {
      const id = v.verification_id;
      if (envFrames[id] || envFramesLoading[id]) return;
      setEnvFramesLoading(prev => ({ ...prev, [id]: true }));
      api.get(`/ai-interview/environment-verification/${id}/frames`)
        .then(res => {
          const frames: EnvFrame[] = Array.isArray(res?.data?.frames) ? res.data.frames : [];
          setEnvFrames(prev => ({ ...prev, [id]: frames }));
        })
        .catch(() => {
          setEnvFramesError(prev => ({ ...prev, [id]: true }));
        })
        .finally(() => {
          setEnvFramesLoading(prev => ({ ...prev, [id]: false }));
        });
    });
  }, [activeTab, envVerifications, envFrames, envFramesLoading]);

  useEffect(() => {
    if (!envVerifications || envVerifications.length === 0) return;
    const toFetch = envVerifications.filter(
      v => v.video_uploaded && !v.video_url && !envVideoBlobRequestedRef.current.has(v.verification_id)
    );
    if (toFetch.length === 0) return;
    toFetch.forEach(v => envVideoBlobRequestedRef.current.add(v.verification_id));
    let cancelled = false;
    toFetch.forEach(async (v) => {
      try {
        const res = await api.get(`/ai-interview/environment-verification/${v.verification_id}/recording`, { responseType: 'blob' });
        if (cancelled) return;
        setEnvVideoBlobUrls(prev => ({ ...prev, [v.verification_id]: URL.createObjectURL(res.data) }));
      } catch { /* leave unset — rendered as "Video unavailable" */ }
    });
    return () => { cancelled = true; };
  }, [envVerifications]);

  // Legacy inline violations UI retained (disabled) for quick rollback; superseded by IntegrityCheckTab.
  const showLegacyViolations = false;

  // Severity-based weighted score and breakdown
  const severityStats = useMemo(() => {
    let minor = 0, moderate = 0, severe = 0, score = 0;
    violations.forEach(v => {
      const sev = normaliseSeverity(v.severity);
      if (sev === 'minor')    minor++;
      if (sev === 'moderate') moderate++;
      if (sev === 'severe')   severe++;
      score += SEV_WEIGHT[sev];
    });
    return { minor, moderate, severe, score };
  }, [violations]);
  const risk = getRiskLevelWeighted(severityStats.score, riskThresholds);

  // Count by event type
  const violationCounts = useMemo(() => {
    const map: Record<string, number> = {};
    violations.forEach(v => { map[v.event_type] = (map[v.event_type] ?? 0) + 1; });
    return map;
  }, [violations]);

  // Group by minute+type for the event log table
  const groupedViolations = useMemo(() => {
    const map: Record<string, { event_type: string; severity: string; timestamp?: string; count: number }> = {};
    violations.forEach(v => {
      const minute = v.timestamp ? v.timestamp.slice(0, 16) : 'unknown';
      const key = `${minute}__${v.event_type}`;
      if (!map[key]) map[key] = { event_type: v.event_type, severity: normaliseSeverity(v.severity), timestamp: v.timestamp, count: 0 };
      map[key].count += 1;
    });
    return Object.values(map).sort((a, b) =>
      (a.timestamp ?? '').localeCompare(b.timestamp ?? '')
    );
  }, [violations]);

  // Anchor for the "Video Time" column: the session start ≈ recording start.
  // Falls back to the earliest event timestamp for legacy sessions that never
  // stored started_at, so the log still shows relative offsets (first event
  // then reads 0:00). Undefined only when neither is available.
  const videoAnchor = useMemo(() => {
    if (liveSession.started_at) return liveSession.started_at;
    const stamps = violations
      .map(v => v.timestamp)
      .filter((t): t is string => !!t)
      .sort();
    return stamps[0];
  }, [liveSession.started_at, violations]);

  // ── "▶ Watch in recording" for questions ──────────────────────────────
  // When was each question asked? Bina's transcript messages carry their
  // time; question_history timestamps fill gaps. Keyed by the question's
  // normalised opening text (as the Q&A tab matches transcript messages).
  const questionKey = (text: unknown) =>
    String(text || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 60);
  const questionAskedAt = useMemo(() => {
    const map = new Map<string, string>();
    const convo = ((liveSession as any).conversation_transcript || (interview as any).conversation_transcript || []) as any[];
    const history = (((liveSession as any).ai_evaluation || (interview as any).ai_evaluation || {}).question_history || []) as any[];

    // Walk the questions IN THE ORDER ASKED (question_history order) and pair
    // each with the next of Bina's messages that contains it, never looking
    // back past the previous match. Matching only on an identical opening
    // (the old rule) missed whenever Bina led in ("Great, thanks. Now, …"), and
    // the miss fell through to a later timestamp — so a question asked first
    // could seek near the end of the recording, and the timeline's Q-numbers
    // (sorted by time) came out of order.
    const norm = (t: unknown) =>
      String(t || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const words = (t: string) => t.split(' ').filter((w) => w.length > 2);
    const binaMsgs = convo
      .filter((m) => m?.role === 'assistant' && m?.content && m?.timestamp)
      .map((m) => ({ text: norm(m.content), words: new Set(words(norm(m.content))), ts: m.timestamp as string }));
    const asksQuestion = (msg: { text: string; words: Set<string> }, q: string) => {
      if (!q) return false;
      // Its opening, anywhere in the message (after a lead-in) …
      if (msg.text.includes(q.slice(0, 50))) return true;
      // … or most of its words (the evaluator's copy can differ slightly).
      const qw = words(q);
      if (qw.length < 3) return false;
      return qw.filter((w) => msg.words.has(w)).length / qw.length >= 0.7;
    };
    let cursor = 0;
    for (const h of history) {
      const k = questionKey(h?.question);
      if (!k || map.has(k)) continue;
      const q = norm(h?.question);
      let found = -1;
      for (let i = cursor; i < binaMsgs.length; i++) {
        if (asksQuestion(binaMsgs[i], q)) { found = i; break; }
      }
      if (found >= 0) {
        map.set(k, binaMsgs[found].ts);
        cursor = found + 1;
      } else if (h?.timestamp) {
        map.set(k, h.timestamp);
      }
    }
    // Sessions without question_history: the old identical-opening match.
    for (const m of convo) {
      if (m?.role !== 'assistant' || !m?.content || !m?.timestamp) continue;
      const k = questionKey(m.content);
      if (k && !map.has(k)) map.set(k, m.timestamp);
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveSession, interview]);
  const hasAnyRecording = !!(liveSession.recording_file_path || liveSession.screen_recording_file_path);
  // Same timestamp → video-offset mapping as the Event Log's Video Time
  // (session start ≈ recording start), started a few seconds early so the
  // moment isn't missed if the recording began slightly after the session.
  const WATCH_LEAD_SEC = 3;
  const renderWatchInRecording = (timestamp?: string | null) => {
    if (!hasAnyRecording) return null;
    const offsetSec = videoOffsetSeconds(timestamp || undefined, videoAnchor);
    if (offsetSec == null) return null;
    const startSec = Math.max(0, offsetSec - WATCH_LEAD_SEC);
    const mm = Math.floor(startSec / 60);
    const ss = String(startSec % 60).padStart(2, '0');
    return (
      <button
        type="button"
        onClick={() => {
          seekNonceRef.current += 1;
          setRecordingSeek({ seconds: startSec, key: seekNonceRef.current });
          setActiveTab('recording');
        }}
        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 hover:bg-brand-blue/15 transition-colors normal-case tracking-normal"
        title="Open the recording at this question"
      >
        <Play className="w-3 h-3" /> Watch in recording · {mm}:{ss}
      </button>
    );
  };
  const watchQuestion = (question: unknown, ownTimestamp?: string | null) =>
    renderWatchInRecording(questionAskedAt.get(questionKey(question)) || ownTimestamp || null);

  // The Question Analysis tab's data — also the source of the Recording
  // tab's question markers, so both show the same questions and moments.
  const buildQuestionAnalysisData = () => buildDashboardData({
    ai_evaluation: eval_,
    cluster_config: clusterConfig,
    candidate: {
      name: interview.candidate_name || liveSession.candidate_name || 'Candidate',
      role: (interview as any).job_title || (interview as any).role || interview.position || 'Candidate',
      email: interview.candidate_email || liveSession.candidate_email,
    },
    interview: {
      mode: (interview as any).special_instructions
        ? (() => { try { const si = JSON.parse((interview as any).special_instructions); return si.interview_mode; } catch { return undefined; } })()
        : undefined,
      completed_at: liveSession.completed_at,
      created_at: liveSession.created_at,
    },
    rounds_config: (interview as any).rounds_config || (liveSession as any).rounds_config,
    conversation_transcript: (liveSession as any).conversation_transcript || (interview as any).conversation_transcript,
    // Pass special_instructions so the Analysis tab can read
    // the Question Distribution plan (mth/nth_question_skill_map)
    // and show EXACTLY the configured skills per slot — no
    // text-scan extras, no evaluator-topic extras.
    special_instructions: (interview as any).special_instructions || (liveSession as any).special_instructions,
  });

  // One marker per delivered question, at the same moment its "Watch in
  // recording" button seeks to.
  const recordingQuestionMarkers = (): VideoMarker[] => {
    if (!hasAnyRecording || evaluationPending) return [];
    try {
      return buildQuestionAnalysisData().perQuestionDetails
        .filter(q => !q.notDelivered && q.responseType !== 'not_asked')
        .flatMap(q => {
          const offsetSec = videoOffsetSeconds(questionAskedAt.get(questionKey(q.question)) || undefined, videoAnchor);
          if (offsetSec == null) return [];
          return [{ seconds: Math.max(0, offsetSec - WATCH_LEAD_SEC), label: '', title: q.question }];
        })
        // Label by position in the WHOLE interview, in the order asked. qNum is
        // renumbered per SECTION (Question Analysis spec), so an HR-first
        // interview read "Q1 Q2 Q3 Q1 … Q10 Q4 Q5" on the timeline.
        .sort((a, b) => a.seconds - b.seconds)
        .map((m, idx) => ({ ...m, label: `Q${idx + 1}` }));
    } catch {
      return [];
    }
  };

  // One dot per counted violation (advisory markers excluded, as on the
  // Violations tab), at the same moment its Event Log "Video Time" seeks to.
  const recordingViolationMarkers = (): VideoMarker[] => {
    if (!hasAnyRecording) return [];
    return violations.flatMap(v => {
      const severity = recruiterSeverity(v);
      if (severity === 'advisory') return [];
      const offsetSec = videoOffsetSeconds(v.timestamp, videoAnchor);
      if (offsetSec == null) return [];
      return [{ seconds: offsetSec, label: labelOfViolation(v), kind: 'violation' as const, severity }];
    });
  };

  const ROWS_PER_PAGE = violationsPerPage;
  const totalPages = Math.max(1, Math.ceil(groupedViolations.length / ROWS_PER_PAGE));
  const safeViolationPage = Math.min(violationPage, totalPages);
  const pagedViolations = groupedViolations.slice((safeViolationPage - 1) * ROWS_PER_PAGE, safeViolationPage * ROWS_PER_PAGE);

  const tabs: { key: TabKey; label: string; icon: React.ReactNode; badge?: number; badgeTone?: 'critical' | 'neutral'; live?: boolean }[] = [
    // 'Overview' tab hidden 2026-05-30 — merged into the combined Evaluation Report (Eval) tab.
    // { key: 'overview',         label: 'Overview',          icon: <BarChart3 className="w-4 h-4" /> },
    ...((isCompleted || isPartial)
      ? [
          { key: 'eval'               as TabKey, label: 'Evaluation Report',  icon: <FileText className="w-4 h-4" /> },
          // 'Evaluation Report' (old) tab hidden 2026-05-30 — superseded by the combined Eval tab above.
          // { key: 'eval_report'        as TabKey, label: 'Evaluation Report',  icon: <FileText className="w-4 h-4" /> },
          { key: 'skill_breakdown'    as TabKey, label: 'Skill Breakdown',    icon: <Brain    className="w-4 h-4" /> },
          { key: 'question_analysis'  as TabKey, label: 'Question Analysis',  icon: <Target   className="w-4 h-4" /> },
        ]
      : []),
    { key: 'coverage',         label: 'Skill Coverage', icon: <Activity className="w-4 h-4" />, live: isInProgress },
    // 'eval_dashboard' removed — its content (Skills/Questions/Formula) is now mounted as 3 individual tabs above.
    // { key: 'eval_dashboard' as TabKey, label: 'Evaluation Dashboard', icon: <Target className="w-4 h-4" /> },
    // Sentiment tab removed per Vite design — Sentiment had no equivalent in the Vite source. Block below kept (commented) for revert.
    // { key: 'sentiment',      label: 'Sentiment',        icon: <Brain className="w-4 h-4" /> },
    // Q&A tab hidden per recruiter spec 2026-05-21 — content overlaps with
    // Question Analysis + Transcript. Keep the route + render block below
    // so deep-link URLs (?activeTab=qa) don't 404; just remove from the
    // visible tab nav.
    // { key: 'qa',               label: 'Q&A',              icon: <MessageSquare className="w-4 h-4" /> },
    { key: 'recording',        label: 'Recording',        icon: <Video className="w-4 h-4" /> },
    { key: 'transcript',       label: 'Transcript',       icon: <FileText className="w-4 h-4" /> },
    { key: 'violations',       label: 'Violations',  icon: <ShieldAlert className="w-4 h-4" />, badge: (violationSummary.serious > 0 ? violationSummary.serious : violationSummary.counted) || undefined, badgeTone: violationSummary.serious > 0 ? 'critical' : 'neutral' },
    { key: 'verification',     label: 'QR Verification',  icon: <ScanQrCode className="w-4 h-4" />, badge: (envVerifications?.length || undefined), badgeTone: (envVerifications ?? []).some(v => v.result_severity === 'flagged' || v.id_match === false) ? 'critical' : 'neutral' },
  ];

  const renderPlaceholder = (message: string) => (
    <div className="text-center py-16">
      <div className="w-12 h-12 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center mx-auto mb-4">
        <Clock className="w-6 h-6 text-brand-blue/40" />
      </div>
      <p className="text-gray-500">{message}</p>
    </div>
  );

  // Spinner shown while batch evaluation is being generated after interview completes.
  const renderEvaluationSpinner = () => {
    const mm = Math.floor(evalElapsedSec / 60);
    const ss = String(evalElapsedSec % 60).padStart(2, '0');
    // Four-step rail, same look as the cluster-generation loader. Advances on
    // a timer (the evaluation is one backend job with no progress events) and
    // holds on the last step until the results land.
    const EVAL_STAGES = ['Reading Answers', 'Scoring with AI', 'Analyzing Skills', 'Finalizing Report'];
    const evalStage = Math.min(EVAL_STAGES.length - 1, Math.floor(evalElapsedSec / 20));
    return (
    <div className="flex flex-col items-center justify-center py-24 tf-loader-center">
      {/* Same static spinner as the cluster-generation screen. */}
      <div className="w-16 h-16 rounded-full bg-brand-blue/5 ring-1 ring-brand-blue/10 flex items-center justify-center mx-auto mb-6">
        <Loader2 className="w-8 h-8 animate-spin text-brand-blue" />
      </div>
      <h3 className="tf-section-title mb-1 tracking-tight">Generating Evaluation Results</h3>
      <p className="tf-body-muted max-w-xs text-center">
        Please wait while the AI analyzes responses and verifies the results.
        The page will refresh automatically when ready.
      </p>
      <div className="mt-6 flex items-start justify-center max-w-full overflow-x-auto">
        {EVAL_STAGES.map((label, i) => {
          const done = i < evalStage;
          const current = i === evalStage;
          const isLast = i === EVAL_STAGES.length - 1;
          return (
            <div key={label} className="flex items-start">
              <div className="flex flex-col items-center gap-2 w-16 sm:w-32">
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors duration-500 ${
                    done || current ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/30' : 'bg-slate-200 text-transparent'
                  }`}
                >
                  {done ? (
                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                  ) : current ? (
                    <span className="w-2 h-2 rounded-full bg-white tf-step-pulse-dot" />
                  ) : null}
                </span>
                <span className={`text-xs leading-tight text-center transition-colors duration-500 ${done || current ? 'text-brand-blue font-medium' : 'text-gray-400'}`}>
                  {label}
                </span>
              </div>
              {!isLast && (
                <div className="mt-3.5 h-0.5 w-2 sm:w-12 rounded-full bg-slate-200 overflow-hidden flex-shrink-0">
                  <div className={`h-full bg-brand-blue rounded-full transition-all duration-700 ${done ? 'w-full' : 'w-0'}`} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2 mt-4">
        <span className="w-2 h-2 rounded-full bg-brand-blue animate-pulse" />
        <span className="text-xs text-brand-blue font-medium tabular-nums">
          Processing… {mm}:{ss}
        </span>
      </div>
      {/* Bounded fallback — after the typical 1–3 min window the eval may have
          failed to land (OpenAI hiccup / interrupted save). Offer an explicit
          Retry so a non-terminated interview never spins forever: it re-runs
          the same transcript evaluation and refreshes. */}
      {evalTriggerError && (
        <p className="mt-4 tf-error text-center max-w-sm">
          Evaluation request failed: {evalTriggerError}
        </p>
      )}
      {(evalElapsedSec >= 180 || !!evalTriggerError) && (
        <div className="mt-6 flex flex-col items-center gap-2">
          <p className="tf-hint text-center max-w-xs">
            {evalTriggerError
              ? 'You can retry the evaluation — it re-scores from the saved transcript.'
              : 'Taking longer than usual. You can retry the evaluation — it re-scores from the saved transcript.'}
          </p>
          <Button
            variant="primary"
            type="button"
            disabled={retryingEval}
            onClick={async () => {
              setRetryingEval(true);
              setEvalTriggerError(null);
              _autoReevalFiredRef.current = null; // allow the auto-effect to re-fire too
              try {
                await aiInterviewService.triggerEvaluation(liveSession.id);
                const updated = await aiInterviewService.get(liveSession.id);
                setLiveSession(updated);
              } catch (err: any) { setEvalTriggerError(describeEvalError(err)); /* keep spinner + polling; user can retry again */ }
              finally { setRetryingEval(false); }
            }}
          >
            {retryingEval ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Retrying…</>
            ) : (
              <><RefreshCw className="w-4 h-4" /> Retry evaluation</>
            )}
          </Button>
        </div>
      )}
    </div>
    );
  };

  const getPlaceholderMessage = (tabKey?: string) => {
    // While evaluation is being generated, all tabs show the spinner
    if (evaluationPending) return null; // handled by renderEvaluationSpinner below
    // Terminal: auto-completed with nothing recorded — nothing to score or show.
    if (noAnswersRecorded) return 'No answers were recorded — the candidate never connected to the interview, so there is nothing to evaluate.';
    // Coverage tab handles its own in-progress state — don't block it
    if (isInProgress && tabKey !== 'coverage') {
      return 'Interview in progress — data will appear once completed';
    }
    // Terminated sessions keep their raw artifacts (recording, transcript) even
    // when no evaluation was persisted (e.g. the post-termination eval failed or
    // the interview was cut before Q1) — never hide those behind "not started".
    if (wasTerminated && !isPartial) {
      if (tabKey === 'recording' || tabKey === 'transcript') return null;
      return 'Interview was terminated before an evaluation could be produced — see the Recording and Transcript tabs';
    }
    if (!isInProgress && !isCompleted && !isPartial) return 'Interview not yet started — no data available';
    return null;
  };

  // Generic placeholder (for tabs that don't pass a key)
  const placeholderMsg = getPlaceholderMessage();

  const inviteEmail = () => normalizeEmail(interview.candidate_email || liveSession.candidate_email);

  // A session invited from the resume database carries resume_id, but that
  // link is only honoured when the resume still exists and its email is the
  // interview's email (verifyResumeBelongsToInvite). Otherwise fall back to
  // the resume library by exact email — accepted only when the names don't
  // contradict, the same identity rule the interview agent applies
  // (_names_plausibly_same_person), so a reused address can't surface a
  // stranger's resume. No match → no resume.
  const resolveResumeId = async (): Promise<string | null> => {
    setResumeEmailMismatch(false);
    const email = inviteEmail();
    if (!email) return null;
    const { resumeService } = await import('@/lib/services/resumeService');

    const linked = liveSession.resume_id || interview.resume_id;
    if (linked) {
      try {
        // get(id) without logView — an availability check, not a view.
        const verified = await verifyResumeBelongsToInvite(linked, email, id => resumeService.get(id));
        if (verified) return verified;
        setResumeEmailMismatch(true);
      } catch (err) {
        // Couldn't verify the link — never show it unverified; the email
        // search below can still find the same resume.
        console.warn('[CandidateResultsView] Linked resume check failed:', err);
      }
    }

    // Exact email is the rule, whatever the invite source — the name only
    // breaks a tie (pickResumeByEmail).
    try {
      // include_archived: an archived resume still exists — the resume_id
      // path opens it, so the email path must find it too (naveen's resume was
      // archived, so his direct-email invite showed "invited via Direct Email").
      const results = await resumeService.list({ search: email, page_size: 50, include_archived: true });
      const items = results.items || [];
      const match: any = pickResumeByEmail(items as any[], email, interview.candidate_name || liveSession.candidate_name);
      console.info('[CandidateResultsView] resume lookup by e-mail', { hits: items.length, matched: match?.id ?? null });
      if (match?.id) setResumeEmailMismatch(false);
      return match?.id || null;
    } catch (err) {
      console.warn('[CandidateResultsView] Resume search failed:', err);
      return null;
    }
  };

  // Prev/Next re-renders this same instance with a different interview, so
  // the cached resume belongs to the previous candidate and must be dropped,
  // and availability is re-checked for the new one.
  useEffect(() => {
    setPreviewResumeId(null);
    setResolvedResumeId(undefined);
    let cancelled = false;
    resolveResumeId().then(id => { if (!cancelled) setResolvedResumeId(id); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interview.id]);

  // No resume (or a mismatched one) → the button turns disabled and its hover
  // tooltip explains why, same as when the load-time lookup finds none.
  const markResumeUnavailable = () => {
    setResolvedResumeId(null);
    toast.info('Resume not available for this candidate.');
  };

  const handleViewResume = async () => {
    setIsLoadingResume(true);
    try {
      const id = resolvedResumeId !== undefined ? resolvedResumeId : await resolveResumeId();
      if (!id) {
        markResumeUnavailable();
        return;
      }
      const { resumeService } = await import('@/lib/services/resumeService');
      // A genuine user view (logged), and the email is re-checked on the
      // record actually shown, in case it changed since the load-time check.
      const data = await resumeService.get(id, true);
      if (!emailsMatch(resumeEmailOf(data), inviteEmail())) {
        setResumeEmailMismatch(true);
        markResumeUnavailable();
        return;
      }
      setPreviewResumeId(id);
    } catch (err: any) {
      // A linked resume that has since been deleted 404s — that's "not
      // available", not a transient failure worth retrying. resumeService
      // rethrows as a plain Error carrying only the backend detail, so the
      // status is gone and the message is all there is to go on.
      if (err?.response?.status === 404 || /not found/i.test(err?.message || '')) {
        markResumeUnavailable();
      } else {
        console.error('[CandidateResultsView] Failed to load resume:', err);
        toast.error('Could not load the resume. Please try again.');
      }
    } finally {
      setIsLoadingResume(false);
    }
  };

  /* The job link in the header. Inside that job's own Job Details page it
     closes this view (the job is already the page underneath). Elsewhere it
     opens Job Details carrying this result, so that page's trail reads
     AI Interviews › <interview> › <candidate> › job instead of resetting to
     Job Descriptions. */
  const openJobFromResult = (jdId: string) => {
    const here = new URL(window.location.href);
    if (here.pathname.startsWith('/recruitment/job-details') && here.searchParams.get('id') === jdId) {
      onBack();
      return;
    }
    const params = new URLSearchParams({ id: jdId });
    if (here.pathname.startsWith('/recruitment/ai-interviews/')) {
      params.set('from', 'ai-interview-result');
      /* Mirror this page's own trail: opened from the AI Interviews list's
         Candidate Results / Invitation Status tab it has no interview crumb
         (Dashboard › AI Interviews › <candidate>), so none is sent — only
         which tab "AI Interviews" returns to. Otherwise the interview the
         candidate sat sits between the list and the candidate. */
      const resultOrigin = here.searchParams.get('from');
      if (resultOrigin === 'candidate-results' || resultOrigin === 'invitation-status') {
        params.set('result_origin', resultOrigin);
      } else {
        const configId = interview.config_id || liveSession.config_id;
        if (configId) params.set('interview_id', configId);
        params.set('interview_title', interview.position || (interview as any).jd_title || '');
      }
      params.set('candidate_name', interview.candidate_name || '');
      params.set('return_to', `${here.pathname}${here.search}`);
    }
    router.push(`/recruitment/job-details?${params.toString()}`);
  };
  const candidateBreadcrumbItems = breadcrumbItems ?? [
    { label: 'Dashboard', href: '/dashboard' },
    onNavigateToList
      ? { label: 'AI Interviews', onClick: onNavigateToList }
      : { label: 'AI Interviews', href: '/recruitment/ai-interviews' },
    ...(breadcrumbTrail ?? []),
    // Deepest crumb names the candidate whose results are open.
    { label: interview.candidate_name || 'Candidate Results' },
  ];

  return (
    // overflow-x-clip, not overflow-x-hidden/overflow-y-auto: that pair made
    // this <main> its own scroll container without ever being height-bound
    // enough to actually overflow, so `position: sticky` resolved against a
    // box that never moved while the dashboard layout's own overflow-y-auto
    // div did the real scrolling — the breadcrumb visibly scrolled away.
    // `clip` doesn't establish a scroll container at all, so sticky resolves
    // against the app's one real scroller, same as the working list pages.
    <main className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
        <div
          className="tf-page-sheet min-h-[calc(100dvh-7rem)]"
          style={breadcrumbHeight ? ({ '--crumb-h': `${breadcrumbHeight}px` } as React.CSSProperties) : undefined}
        >
          {/* Breadcrumb — a DIRECT child of the card, not wrapped in a row with
              the pager, so `sticky` has the card's full height to travel within.
              Boxed inside a breadcrumb-height flex row it could never stick,
              which is why it used to opt out with sticky={false}. */}
          {/* Previous / Next rides inside the breadcrumb bar, as on
              job-details, so it stays reachable while the sticky crumb is
              pinned. Passed as undefined when there's no list to page through,
              which leaves the bar exactly as it was. */}
          <PageBreadcrumb
            className="mb-4 md:mb-6"
            barRef={breadcrumbBarRef}
            items={candidateBreadcrumbItems}
            actions={totalCount != null && totalCount > 0 ? (
              <RecordPager
                currentIndex={currentIndex}
                totalCount={totalCount}
                onPrev={onPrev}
                onNext={onNext}
              />
            ) : undefined}
          />

      <div>
        <div className="w-full">
          {/* Candidate header banner */}
          {/* `relative overflow-hidden`: on sm+ the photo is absolutely
              positioned against this banner's left / top / bottom border and
              clipped to its rounded corners — so it can be large without the
              banner growing. */}
          <div className="relative overflow-hidden mb-6 rounded-xl bg-brand-blue/5 border border-brand-blue/15 ring-1 ring-brand-blue/10 shadow-sm shadow-brand-blue/10 p-5">
            {/* Phones: details on top, the two buttons in a row underneath.
                sm+: details left (shifted clear of the photo), buttons stacked
                on the right. */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 sm:pl-[150px]">
              <div className="flex items-start gap-3 sm:gap-4 min-w-0">
                {/* The identity-check photo (else the initial).
                    Phones: a 64px rounded square in the flow.
                    sm+: absolute, 144px wide, inset 10px from the banner's
                    left / top / bottom border with all four corners rounded —
                    the banner's height still comes from its content. */}
                <div className={`w-16 h-16 rounded-xl ring-1 ring-brand-blue/15 sm:absolute sm:top-2.5 sm:bottom-2.5 sm:left-2.5 sm:w-36 sm:h-auto sm:rounded-lg shadow-sm overflow-hidden flex items-center justify-center shrink-0 ${
                  // No photo: a plain slot, so the tinted NameAvatar isn't a tint-on-tint badge.
                  identityPhotoUrl ? 'bg-brand-blue/10' : 'bg-white dark:bg-slate-900'
                }`}>
                  {identityPhotoUrl
                    ? <img src={identityPhotoUrl} alt={interview.candidate_name || 'Candidate'} className="w-full h-full object-cover object-top" />
                    : <NameAvatar name={interview.candidate_name} fallback={interview.candidate_email} size="xl" />}
                </div>
                <div className="min-w-0">
                <div className="mb-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h1 className="tf-page-title">
                        {interview.candidate_name || 'Unknown Candidate'}
                      </h1>
                      <Badge variant={getStatusVariant(interview.status)}>
                        {getStatusLabel(interview.status)}
                      </Badge>
                      {/* Interview mode badge — reads from config (special_instructions.interview_mode) */}
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ${
                        isFlexibleMode
                          ? 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20'
                          : 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20'
                      }`}>
                        {isFlexibleMode ? 'Conversational Mode' : 'Timed Mode'}
                      </span>
                      {/* Stealth dot — the per-question skill plan this
                          interview actually ran on. Same hidden affordance as
                          the cluster editor and invite details pages. Timed
                          mode only: conversational mode has no fixed slots. */}
                      {!isFlexibleMode && (
                        <QuestionDistributionPopover
                          specialInstructions={
                            (interview as any).special_instructions
                            || (liveSession as any).special_instructions
                          }
                          // HR column: the enabled HR round's selected questions.
                          hrQuestions={(() => {
                            const rc = (interview as any).rounds_config || (liveSession as any).rounds_config;
                            const hr = Array.isArray(rc)
                              ? rc.find((r: any) => r?.type === 'hr' && r?.enabled !== false)
                              : null;
                            return Array.isArray(hr?.hr_questions) ? hr.hr_questions : [];
                          })()}
                        />
                      )}
                    </div>
                    {/* CID | email | Job name ↗ — the job opens its Job Details page. */}
                    {(() => {
                      const cid = interview.candidate_cid || liveSession.candidate_cid || fetchedCid;
                      const email = interview.candidate_email || liveSession.candidate_email;
                      const jobName = interview.position || (interview as any).jd_title || (liveSession as any).jd_title;
                      const jdId = interview.jd_id || liveSession.jd_id;
                      const parts: React.ReactNode[] = [];
                      if (cid) parts.push(<span key="cid">{cid}</span>);
                      if (email) parts.push(<span key="email" className="truncate">{email}</span>);
                      if (jobName) parts.push(jdId ? (
                        <Link
                          key="job"
                          href={`/recruitment/job-details?id=${encodeURIComponent(jdId)}`}
                          onClick={(e) => {
                            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                            e.preventDefault();
                            openJobFromResult(jdId);
                          }}
                          title="Open this job"
                          className="group inline-flex items-center gap-1 text-gray-700 hover:text-brand-blue hover:underline underline-offset-2 transition-colors"
                        >
                          {jobName}
                          <ArrowUpRight className="w-3.5 h-3.5 shrink-0 text-gray-400 group-hover:text-brand-blue" aria-hidden />
                        </Link>
                      ) : <span key="job">{jobName}</span>);
                      return (
                        <div className="flex items-center gap-2 flex-wrap mt-1 tf-body-muted min-w-0">
                          {parts.map((part, i) => (
                            <span key={i} className="inline-flex items-center gap-2 min-w-0">
                              {i > 0 && <span className="text-gray-300" aria-hidden>|</span>}
                              {part}
                            </span>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 tf-body-muted mt-2">
                  {interview.completed_at && (
                    <span>
                      Completed {formatISTDate(interview.completed_at)}, {formatISTTime(interview.completed_at).toLowerCase()}
                    </span>
                  )}
                  <span className="flex items-center gap-1" title="Time taken">
                    <Clock className="w-3.5 h-3.5" />
                    Time taken: {formatDuration(eval_.duration_minutes || interview.duration_minutes)}
                  </span>
                  {/* How long the candidate actually attended: started →
                      completed, else the evaluation's recorded length. Shown
                      as h/m/s so a short session reads "18s", not "0.3 min". */}
                  {(() => {
                    const start = liveSession.started_at || interview.started_at;
                    const end = liveSession.completed_at || interview.completed_at;
                    let secs = start && end ? Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000) : NaN;
                    if (!Number.isFinite(secs) || secs <= 0) {
                      const mins = Number(eval_.duration_minutes);
                      secs = Number.isFinite(mins) && mins > 0 ? Math.round(mins * 60) : NaN;
                    }
                    if (!Number.isFinite(secs) || secs <= 0) return null;
                    const h = Math.floor(secs / 3600);
                    const m = Math.floor((secs % 3600) / 60);
                    const s = secs % 60;
                    const label = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m${s ? ` ${s}s` : ''}` : `${s}s`;
                    return (
                      <span className="flex items-center gap-1" title="How long the candidate attended the interview">
                        <Timer className="w-3.5 h-3.5" />
                        Duration: {label}
                      </span>
                    );
                  })()}
                </div>
                </div>
              </div>
              {/* Result pill + actions. Phones: pill above the buttons row;
                  sm+: pill to the left of the stacked buttons. */}
              <div className="flex flex-col sm:flex-row sm:items-start gap-3 flex-shrink-0">
              {/* Pass/Fail + Match Score — the same verdict and score the
                  Evaluation Report tab shows (EvalReportCombined). Hidden while
                  there's no final verdict (pending, partial, no evaluation). */}
              {(() => {
                if (!(isCompleted || isPartial) || evaluationPending || getPlaceholderMessage('eval')) return null;
                const d = buildQuestionAnalysisData();
                if (d.isPartialEvaluation) return null;
                const passed = d.finalResult ? d.finalResult === 'Pass' : d.scores.mustHave >= MHS_THRESHOLD;
                const matchScore = Math.round(d.scores.mustHave * 10);
                return (
                  <span
                    className={`self-start inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1 rounded-full ring-1 text-xs font-semibold tabular-nums sm:mt-2 ${
                      passed
                        ? 'bg-success-subtle text-success-strong ring-success-line'
                        : 'bg-destructive-subtle text-destructive ring-destructive-line'
                    }`}
                    title="Final result and Match Score (Must-Have), as in the Evaluation Report"
                  >
                    {passed ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
                    {passed ? 'Pass' : 'Fail'}
                    <span className="opacity-40" aria-hidden>|</span>
                    {matchScore}%
                  </span>
                );
              })()}
              {/* View Resume, with Download Report stacked under it (side by
                  side on phones, under the details). */}
              <div className="flex flex-row sm:flex-col items-stretch gap-2 flex-shrink-0 [&>*]:flex-1 sm:[&>*]:flex-none">
              {/* View Resume — always rendered, like the assessment result
                  page. Once the load-time lookup finds no resume it's
                  disabled, and hovering explains why. A disabled button
                  swallows mouse events in some browsers, so it's made
                  pointer-transparent and the wrapping span takes the hover. */}
              {resolvedResumeId === null ? (
                <HoverTooltip
                  position="bottom"
                  content={resumeEmailMismatch
                    ? RESUME_EMAIL_MISMATCH_MESSAGE
                    : (liveSession.invite_source || interview.invite_source) === 'email'
                    ? 'Resume is not available because the candidate was invited via Direct Email.'
                    : 'Resume not available'}
                >
                  <span className="inline-flex cursor-not-allowed flex-shrink-0">
                    <ViewResumeButton onClick={handleViewResume} disabled className="pointer-events-none" />
                  </span>
                </HoverTooltip>
              ) : resolvedResumeId ? (
                // A resume exists: hovering previews it, clicking opens it.
                <ResumeHoverPreview resumeId={resolvedResumeId}>
                  <ViewResumeButton onClick={handleViewResume} loading={isLoadingResume} className="flex-shrink-0" />
                </ResumeHoverPreview>
              ) : (
                // Spinner while the load-time check runs, so the button doesn't
                // look clickable and then flip to disabled.
                <ViewResumeButton onClick={handleViewResume} loading className="flex-shrink-0" />
              )}
              {previewResumeId && (
                <ResumeTextPreviewModal
                  resumeId={previewResumeId}
                  title={interview.candidate_name || liveSession.candidate_name || 'Resume'}
                  subtitle={interview.candidate_email || liveSession.candidate_email || undefined}
                  onClose={() => setPreviewResumeId(null)}
                />
              )}
              {/* Download Report — the evaluation report PDF (moved here from
                  the Eval tab's card, so it's reachable from every tab). Shown
                  once there is an evaluation to download. */}
              {!evaluationPending && hasEvaluationReport(liveSession) && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!canDownloadReports) return;
                    setReportDownloading(true);
                    try {
                      await downloadSessionReport(liveSession.id);
                    } catch (err) {
                      console.error('[CandidateResultsView] report download failed:', err);
                      toast.error(isForbiddenError(err) ? AI_REPORT_DOWNLOAD_DENIED : 'Could not download the report. Please try again.');
                    } finally {
                      setReportDownloading(false);
                    }
                  }}
                  disabled={reportDownloading}
                  aria-disabled={!canDownloadReports || undefined}
                  title={canDownloadReports ? undefined : AI_REPORT_DOWNLOAD_DENIED}
                  className={`${canDownloadReports ? '' : 'opacity-60 cursor-not-allowed '}inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-brand-blue hover:bg-brand-blue-2 disabled:opacity-60 text-white text-sm font-medium shadow-sm shadow-brand-blue/25 transition-colors`}
                >
                  {reportDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {reportDownloading ? 'Preparing…' : 'Report'}
                </button>
              )}
              </div>
              </div>
            </div>
          </div>

        {/* Evaluation pending banner */}
        {evaluationPending && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-brand-blue/5 border border-brand-blue/20 ring-1 ring-brand-blue/10 rounded-xl text-sm text-brand-blue shadow-sm shadow-brand-blue/5">
            <Loader2 className="w-4 h-4 text-brand-blue animate-spin flex-shrink-0" />
            <span className="tabular-nums">
              Generating evaluation results — typically 1–3 minutes
              {evalElapsedSec > 0 && ` (${Math.floor(evalElapsedSec / 60)}:${String(evalElapsedSec % 60).padStart(2, '0')})`}
              …
            </span>
          </div>
        )}

        {/* Auto-completed with NOTHING recorded — terminal, not "generating". */}
        {noAnswersRecorded && (
          <div className="mb-4 flex items-start gap-2 px-4 py-3 bg-warning-subtle border border-warning-line ring-1 ring-warning-line/50 rounded-xl text-sm text-warning-strong shadow-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>
              <strong>No answers were recorded.</strong> The candidate never connected to
              the interview (the session was auto-closed when the time limit elapsed), so
              there is no transcript to evaluate and no score can be produced. Re-invite the
              candidate to run the interview again.
            </span>
          </div>
        )}

        {/* Interview TERMINATED — candidate left the interview screen (proctoring).
            Prominent red banner so the recruiter immediately sees the session was
            cut short for an integrity violation, independent of the eval flow. */}
        {(() => {
          const term = violations.find(v => v.event_type === 'interview_terminated');
          if (!term) return null;
          const d = (term.details || {}) as Record<string, unknown>;
          // Prefer the human-readable message the candidate portal sent; fall
          // back to mapping the reason code (kept in sync with the portal's
          // TERMINATION_MESSAGES).
          const REASON_LABELS: Record<string, string> = {
            key_f11: 'Pressed F11 to exit fullscreen',
            key_escape: 'Pressed the Esc key to exit fullscreen',
            key_alt_tab: 'Used Alt + Tab to switch away from the interview',
            key_meta: 'Pressed the Windows / ⌘ (Meta) key',
            left_screen_fullscreen_exit: 'Exited fullscreen mode',
            left_screen_tab_hidden: 'Switched to another tab or minimized the window',
            left_screen_focus_lost: 'Moved focus away from the interview window',
            left_screen: 'Left the interview screen',
            picture_in_picture: 'Opened a video in Picture-in-Picture',
            microphone_disconnected_timeout: 'Microphone stayed disconnected for over 3 minutes',
            camera_disconnected_timeout: 'Camera stayed disconnected for over 3 minutes',
            camera_and_microphone_disconnected_timeout: 'Camera and microphone stayed disconnected for over 3 minutes',
            headset_disconnected_limit: 'Disconnected the microphone 3 times (only 2 are allowed)',
          };
          const reason = typeof d.reason === 'string' ? d.reason : '';
          const what = (typeof d.message === 'string' && d.message)
            || REASON_LABELS[reason]
            || '';
          return (
            <div className="mb-4 flex items-start gap-2 px-4 py-3 bg-destructive-subtle border border-destructive-line ring-1 ring-destructive-line rounded-xl text-sm text-destructive-strong shadow-sm">
              <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Interview terminated — candidate left the screen</div>
                {what ? (
                  <div className="text-destructive/90 mt-0.5">
                    What the candidate did: <b>{what}</b>{term.timestamp ? <> at <b>{formatTs(term.timestamp)}</b></> : null}. Per the proctoring policy the session was ended automatically and cannot be resumed.
                  </div>
                ) : (
                  <div className="text-destructive/90 mt-0.5">
                    The candidate switched tabs, minimized, lost window focus, or exited fullscreen during the interview. Per the proctoring policy the session was ended automatically and cannot be resumed.
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* The "Multiple speakers detected" banner was removed: it claimed the
            affected answers were "marked, not scored", but nothing marks or
            skips them. The events still appear in the Violations tab. */}

        {/* Partial warning banner — only for a GENUINELY cut-short / stuck-partial
            interview. Suppressed while the full evaluation is still being produced
            in the background (evaluationPending → "Generating results" spinner) and
            for any interview that reached its end normally (reachedEnd) — those are
            not disconnections. */}
        {isPartial && !isCompleted && !evaluationPending && !reachedEnd && (
          <div className="mb-4 flex items-center justify-between gap-3 px-4 py-3 bg-brand-orange/10 border border-brand-orange/30 ring-1 ring-brand-orange/15 rounded-xl text-sm text-brand-orange-deep shadow-sm shadow-brand-orange/5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              Interview disconnected — showing partial results
            </div>
            {/* Re-Evaluate — ONLY when the candidate reached the END of the
                interview (answered every question) but the result is stuck
                partial. Runs the full evaluation once and finalizes the row.
                Hidden for genuinely cut-short interviews; disabled while running;
                disappears permanently once the interview is fully evaluated. */}
            {reevalCrossedEnd && (
              <Button
                variant="primary"
                size="sm"
                type="button"
                onClick={handleReEvaluate}
                disabled={reEvaluating || jdDisabled}
                title={jdDisabled ? JD_DISABLED_ACTION_MESSAGE : 'The candidate answered all questions — re-run the full evaluation. This can be done only once.'}
                className="shrink-0"
              >
                {reEvaluating ? 'Re-Evaluating…' : 'Re-Evaluate'}
              </Button>
            )}
          </div>
        )}

        {/* Auto-close reason banner — tells the recruiter *why* the interview
            ended when it wasn't a normal wrap-up. The closing_reason string is
            set by the backend in app/ai_engine/connection_manager.py
            check_closing_conditions() and persisted to ai_evaluation.closing_reason. */}
        {(() => {
          const rawReason: string = (eval_.closing_reason || '').toString();
          if (!rawReason) return null;

          // Normal completions — no banner needed.
          // Backend emits several distinct strings for "interview finished normally":
          //   - max_questions_reached    → hard cap in add_assistant_message (timed mode, q_count >= max)
          //   - max_questions: <n>       → check_closing_conditions soft path
          //   - all_rounds_completed     → all planned rounds done
          //   - all_rounds_completed_in_buffer → same but detected during audio buffer flush
          //   - candidate_ended          → candidate clicked End Interview
          // Anything else is an anomaly worth surfacing (silence cap, time limit, proctor, disconnect).
          const normal = new Set([
            'all_rounds_completed',
            'all_rounds_completed_in_buffer',
            'candidate_ended',
            'max_questions',
            'max_questions_reached',
            '',
          ]);
          if (normal.has(rawReason.toLowerCase().split(':')[0].trim())) return null;
          // If the session is fully completed (status=completed, evaluation present)
          // a disconnect that happened at the very end is not worth surfacing —
          // the interview finished with a full evaluation. Don't show an error
          // banner that implies something went wrong.
          if (isCompleted) return null;

          // Auto-close reasons we want to surface prominently.
          const lower = rawReason.toLowerCase();
          let title = 'Interview auto-closed';
          let detail = rawReason;
          let tone: 'amber' | 'red' = 'amber';

          if (lower.startsWith('consecutive_silence')) {
            // Reason format: "consecutive_silence: 3 skipped questions"
            const match = rawReason.match(/(\d+)/);
            const count = match ? match[1] : '3';
            title = 'Auto-closed — candidate was silent';
            detail = `The interview ended because the candidate did not respond to ${count} consecutive questions. This is distinct from clicking "Next Q" — only complete silence triggers this auto-close.`;
            tone = 'amber';
          } else if (lower.startsWith('proctor_auto_terminate') || lower.includes('proctoring')) {
            title = 'Auto-terminated — proctoring violation';
            detail = 'The interview was cut short because proctoring detected a severe integrity violation.';
            tone = 'red';
          } else if (lower.startsWith('time_limit')) {
            title = 'Auto-closed — time limit reached';
            detail = rawReason;
            tone = 'amber';
          } else if (lower.startsWith('disconnect') || lower.includes('disconnected')) {
            title = 'Interview disconnected mid-way';
            detail = rawReason;
            tone = 'amber';
          }

          const toneClasses = tone === 'red'
            ? 'bg-destructive-subtle border-destructive-line ring-1 ring-destructive-line text-destructive-strong'
            : 'bg-brand-orange/10 border-brand-orange/30 ring-1 ring-brand-orange/15 text-brand-orange-deep';

          return (
            <div className={`mb-4 flex items-start gap-2 px-4 py-3 border rounded-xl text-sm shadow-sm ${toneClasses}`}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">{title}</div>
                <div className="mt-0.5">{detail}</div>
              </div>
            </div>
          );
        })()}

        {/* Detail layout: vertical navigation on the left, the selected tab's
            content on the right — the same grid, aside chrome and button states
            as the AI Interview Details page (`AIInterviewDetailsView.tsx`), so
            the two detail pages read as one screen. The strip this replaced was
            horizontal and scrolled sideways with nine tabs. */}
        <div className="space-y-3 sm:space-y-4 lg:space-y-0 lg:grid lg:grid-cols-[210px_minmax(0,1fr)] lg:items-start lg:gap-6">
          {/* Tablet/mobile: horizontal pill tab bar (shared `tabPill` chrome,
              wrapping onto further rows; alert tabs flip to solid red when
              active). Desktop (lg+): a sticky vertical rail on the left with the
              content on the right. top-12 clears the sticky breadcrumb. */}
          <div className="lg:sticky lg:top-12 lg:self-start tf-card-soft">
            <nav className="p-2 sm:p-3" aria-label="Candidate result sections">
              <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:flex-nowrap lg:items-stretch lg:gap-1.5">
                {tabs.map(tab => {
                  const isActive = activeTab === tab.key;
                  const isAlertTab = tab.key === 'violations' || tab.key === 'verification';
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => { setActiveTab(tab.key); setViolationPage(1); }}
                      aria-current={isActive ? 'page' : undefined}
                      className={`${
                        isAlertTab
                          ? `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-all ${
                              isActive
                                ? 'bg-destructive text-white shadow-sm shadow-destructive/25'
                                : 'bg-destructive-subtle/50 text-gray-600 dark:text-slate-300 hover:bg-destructive-subtle hover:text-destructive'
                            }`
                          : `${tabPill(isActive)} whitespace-nowrap`
                      /* Below lg: each pill grows to share its row, so the
                         wrapped rows fill the width whatever the phone's size. */
                      } max-lg:flex-auto max-lg:justify-center lg:flex lg:w-full lg:gap-2 lg:px-3 lg:py-2.5 lg:text-left lg:whitespace-normal lg:shadow-none ${
                        isActive
                          ? isAlertTab
                            ? 'lg:bg-destructive-subtle lg:text-destructive lg:font-medium lg:ring-1 lg:ring-destructive-line'
                            : 'lg:bg-brand-blue/5 lg:text-brand-blue lg:font-medium lg:ring-1 lg:ring-brand-blue/20'
                          : 'lg:bg-transparent lg:text-gray-600 lg:dark:text-slate-400 lg:hover:bg-brand-blue/5 lg:hover:text-brand-blue'
                      }`}
                    >
                      <span className="shrink-0 [&>svg]:w-3.5 [&>svg]:h-3.5 sm:[&>svg]:w-4 sm:[&>svg]:h-4">{tab.icon}</span>
                      <span className="leading-snug lg:min-w-0 lg:flex-1">{tab.label}</span>
                      {tab.live && (
                        <span className="tf-badge flex bg-destructive text-white text-2xs ring-1 ring-destructive-line">
                          <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
                          LIVE
                        </span>
                      )}
                      {tab.badge !== undefined && (
                        <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${
                          isActive
                            // Solid pill on tablet/mobile; the desktop rail's
                            // active row is light, so the badge reverts there.
                            ? tab.badge > 0 && tab.badgeTone === 'critical'
                              ? 'bg-white/20 text-white lg:bg-destructive-subtle lg:text-destructive lg:ring-1 lg:ring-destructive-line'
                              : 'bg-white/20 text-white lg:bg-slate-100 lg:text-slate-500 lg:ring-1 lg:ring-slate-200'
                            : tab.badge > 0 && tab.badgeTone === 'critical'
                              ? 'bg-destructive-subtle text-destructive ring-1 ring-destructive-line'
                              : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200'
                        }`}>
                          {tab.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
                {/* View JD — below the result tabs, set off by a rule on the
                    desktop rail; one more pill on tablet / mobile. Opens the
                    interview's job description in the content pane. */}
                <div aria-hidden="true" className="hidden lg:block my-1 h-px bg-gray-100 dark:bg-slate-700/60" />
                <button
                  type="button"
                  onClick={() => setActiveTab('viewjd')}
                  aria-current={activeTab === 'viewjd' ? 'page' : undefined}
                  className={`${tabPill(activeTab === 'viewjd')} whitespace-nowrap lg:flex lg:w-full lg:gap-2 lg:px-3 lg:py-2.5 lg:text-left lg:whitespace-normal lg:shadow-none ${
                    activeTab === 'viewjd'
                      ? 'lg:bg-brand-blue/5 lg:text-brand-blue lg:font-medium lg:ring-1 lg:ring-brand-blue/20'
                      : 'lg:bg-transparent lg:text-gray-600 lg:dark:text-slate-400 lg:hover:bg-brand-blue/5 lg:hover:text-brand-blue'
                  }`}
                >
                  <span className="shrink-0 [&>svg]:w-3.5 [&>svg]:h-3.5 sm:[&>svg]:w-4 sm:[&>svg]:h-4"><Briefcase className="w-4 h-4" /></span>
                  <span className="leading-snug lg:min-w-0 lg:flex-1">View JD</span>
                </button>
              </div>
            </nav>
          </div>

        {/* Content — `min-w-0` so a wide table inside a tab scrolls in its own
            box instead of stretching the grid column. p-4 below sm: the
            standard card inset — p-6 stacked on the cards inside each tab. */}
        <div className="min-w-0 tf-card-soft">
          <div className="p-4 sm:p-6">
            {/* Evaluation pending spinner — shown for ALL tabs while batch eval
                runs, except View JD, which does not depend on the evaluation. */}
            {evaluationPending && activeTab !== 'viewjd' && renderEvaluationSpinner()}

            {/* View JD — the linked job description, read-only, with the same
                components (and so the same reading) as the AI Interview
                Details page's View JD tab. */}
            {activeTab === 'viewjd' && (
              <div className="space-y-4 sm:space-y-5">
                {!resultJdId ? (
                  <div className="px-3 sm:px-4 lg:px-6 py-8 text-center">
                    <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="tf-body-muted">No linked job description found</p>
                  </div>
                ) : resultJdError ? (
                  <div className="px-3 sm:px-4 lg:px-6 py-8 text-center">
                    <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-2" />
                    <p className="text-sm text-destructive">{resultJdError}</p>
                  </div>
                ) : !resultJdLoaded || !resultJd ? (
                  <div className="px-3 sm:px-4 lg:px-6 py-12 flex items-center justify-center tf-loader-center">
                    <Loader2 className="w-6 h-6 text-brand-blue animate-spin" />
                  </div>
                ) : (
                  <>
                    <JDIdentityHeader jd={resultJd} versionNumber={interview.jd_version ?? undefined} />
                    <JDOverviewSections jd={resultJd} />
                  </>
                )}
              </div>
            )}

            {/* Overview Tab — candidate profile + performance summary (new design) */}
            {!evaluationPending && activeTab === 'overview' && (() => {
              const placeholderMsg = getPlaceholderMessage('overview');
              if (placeholderMsg) return renderPlaceholder(placeholderMsg);
              const data = buildDashboardData({
                ai_evaluation: eval_,
                cluster_config: clusterConfig,
                candidate: {
                  name: interview.candidate_name || liveSession.candidate_name || 'Candidate',
                  role: (interview as any).job_title || (interview as any).role || interview.position || 'Candidate',
                  email: interview.candidate_email || liveSession.candidate_email,
                },
                interview: {
                  mode: (interview as any).special_instructions
                    ? (() => { try { const si = JSON.parse((interview as any).special_instructions); return si.interview_mode; } catch { return undefined; } })()
                    : undefined,
                  completed_at: liveSession.completed_at,
                  created_at: liveSession.created_at,
                },
                rounds_config: (interview as any).rounds_config || (liveSession as any).rounds_config,
                conversation_transcript: (liveSession as any).conversation_transcript || (interview as any).conversation_transcript,
              });
              // AI confidence: prefer backend-provided, fallback in component to scaled final
              const aiConfidence = typeof eval_.ai_confidence === 'number'
                ? eval_.ai_confidence
                : typeof eval_.confidence === 'number'
                  ? eval_.confidence
                  : null;
              return (
                <OverviewSectionV2
                  data={data}
                  livenessVerified={!!interview.identity_verified}
                  candidateImage={identityPhotoUrl}
                  aiConfidence={aiConfidence}
                />
              );
              /* Old Vite-pre design (kept for reference, can be restored):
              return (
                <OverviewSection
                  data={data}
                  livenessVerified={!!interview.identity_verified}
                  candidateImage={identityPhotoUrl}
                />
              );
              */
            })()}

            {/* Coverage Tab — Vite design (V2): per-cluster skill coverage cards */}
            {!evaluationPending && activeTab === 'coverage' && (() => {
              const placeholderMsg = getPlaceholderMessage('coverage');
              if (placeholderMsg) return renderPlaceholder(placeholderMsg);
              const data = buildDashboardData({
                ai_evaluation: eval_,
                cluster_config: clusterConfig,
                candidate: {
                  name: interview.candidate_name || liveSession.candidate_name || 'Candidate',
                  role: (interview as any).job_title || (interview as any).role || interview.position || 'Candidate',
                  email: interview.candidate_email || liveSession.candidate_email,
                },
                interview: {
                  mode: (interview as any).special_instructions
                    ? (() => { try { const si = JSON.parse((interview as any).special_instructions); return si.interview_mode; } catch { return undefined; } })()
                    : undefined,
                  completed_at: liveSession.completed_at,
                  created_at: liveSession.created_at,
                },
                rounds_config: (interview as any).rounds_config || (liveSession as any).rounds_config,
                conversation_transcript: (liveSession as any).conversation_transcript || (interview as any).conversation_transcript,
                // Pass special_instructions so Cluster Coverage can read the
                // Question Distribution plan (mth/nth_question_skill_map) and
                // credit EVERY skill each delivered slot was planned to probe —
                // the same source the Question Analysis tab shows per question.
                // Without it coverage fell back to the stored history's single
                // representative topic per question (+ a keyword scan), so a
                // 15-question / 35-skill interview in which all 35 skills were
                // assigned and scored reported 17/35 = 49%.
                special_instructions: (interview as any).special_instructions || (liveSession as any).special_instructions,
              });
              return <CoverageV2 data={data} />;
            })()}
            {/* Old CoverageTab (with live WS skill coverage + cluster insights) — kept for reference:
            {!evaluationPending && activeTab === 'coverage' && (
              <CoverageTab
                sessionId={liveSession.id}
                aiEvaluation={eval_}
                isInProgress={isInProgress}
                isCompleted={isCompleted || isPartial}
                clusterConfig={clusterConfig}
                liveSkillCoverage={liveSession.skill_coverage ?? bestSeenSkillCoverageRef.current ?? null}
                liveWsConnected={liveWsConnected}
                crossClusterEvents={crossClusterEvents}
                clusterInsights={eval_.cluster_insights || []}
                capabilityScore={eval_.capability_score ?? null}
                sectionScores={eval_.section_scores ?? null}
                capabilityScoreReasoning={eval_.capability_score_reasoning ?? null}
              />
            )}
            */}

            {/* Sentiment Tab — UNREACHABLE: 'sentiment' removed from tabs[] per Vite design.
              Kept as dead code so the data plumbing (sentimentTimeline, sentimentSummary)
              and chart layout can be restored if the tab is ever re-enabled. */}
            {!evaluationPending && activeTab === 'sentiment' && (
              placeholderMsg ? renderPlaceholder(placeholderMsg) : (
                <div className="space-y-6">
                  {sentimentTimeline.length > 0 ? (
                    <>
                      <div>
                        <h3 className="tf-row-title mb-3 tracking-tight">Sentiment Timeline</h3>
                        <div className="bg-brand-blue/5 rounded-xl border border-brand-blue/15 ring-1 ring-brand-blue/10 p-4" style={{ height: 300 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={sentimentTimeline} margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="turn" tick={{ fontSize: 11 }} />
                              <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} />
                              <Tooltip />
                              <Legend />
                              <Line type="monotone" dataKey="confidence" stroke="var(--raw-16a34a)" strokeWidth={2} name="Confidence" dot={{ r: 3 }} />
                              <Line type="monotone" dataKey="nervousness" stroke="var(--raw-ef4444)" strokeWidth={2} name="Nervousness" dot={{ r: 3 }} />
                              <Line type="monotone" dataKey="engagement" stroke="var(--raw-0f3c99)" strokeWidth={2} name="Engagement" dot={{ r: 3 }} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Emotion per turn */}
                      <div>
                        <h3 className="tf-row-title mb-3 tracking-tight">Emotion per Turn</h3>
                        <div className="flex flex-wrap gap-2">
                          {sentimentTimeline.map((t, i) => (
                            <div key={i} className="tf-card-soft px-3 py-2 text-center">
                              <div className="tf-micro-hint mb-0.5">{t.turn}</div>
                              <div className="tf-caption capitalize">
                                {t.dominant_emotion || 'neutral'}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Summary stats */}
                      {sentimentSummary.total_turns_analyzed != null && (
                        <div>
                          <h3 className="tf-row-title mb-3 tracking-tight">Summary Statistics</h3>
                          <div className="tf-grid-stats">
                            <div className="tf-card-soft p-3 text-center">
                              <div className="text-lg font-semibold text-success">
                                {(sentimentSummary.avg_confidence || 0).toFixed(1)}
                              </div>
                              <div className="tf-meta">Avg Confidence</div>
                            </div>
                            <div className="tf-card-soft p-3 text-center">
                              <div className="text-lg font-semibold text-destructive">
                                {(sentimentSummary.avg_nervousness || 0).toFixed(1)}
                              </div>
                              <div className="tf-meta">Avg Nervousness</div>
                            </div>
                            <div className="tf-card-soft p-3 text-center">
                              <div className="text-lg font-semibold text-brand-blue">
                                {(sentimentSummary.avg_engagement || 0).toFixed(1)}
                              </div>
                              <div className="tf-meta">Avg Engagement</div>
                            </div>
                            <div className="tf-card-soft p-3 text-center">
                              <div className="tf-section-title">
                                {sentimentSummary.total_turns_analyzed}
                              </div>
                              <div className="tf-meta">Turns Analyzed</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    renderPlaceholder('No sentiment data collected')
                  )}
                </div>
              )
            )}

            {/* Q&A Tab */}
            {!evaluationPending && activeTab === 'qa' && (
              placeholderMsg ? renderPlaceholder(placeholderMsg) : (() => {
                // Prefer question_history (richer — has round_type, response_type, timestamp)
                // Fall back to evaluations if history not present
                const qaItemsRaw: any[] = eval_.question_history?.length > 0
                  ? eval_.question_history
                  : (() => {
                      // Follow-ups in `evaluations` don't share a question_number with
                      // their parent the way question_history entries do. Assign numbers
                      // so follow-ups inherit the most recent main question's number —
                      // the downstream grouper then picks them up via the "same number
                      // as previous" branch even if intent tagging is missing.
                      let lastMainNum = 0;
                      return evaluations.map((e: any, i: number) => {
                        const intent = (e.question_intent || '').toLowerCase();
                        const isFu = !!e.is_follow_up || ['follow_up', 'probe', 'deep_dive'].includes(intent);
                        let qNum: number;
                        if (isFu && lastMainNum > 0) {
                          qNum = lastMainNum;
                        } else {
                          lastMainNum = i + 1;
                          qNum = lastMainNum;
                        }
                        return {
                          question_number: qNum,
                          question: e.question,
                          answer: e.response,
                          topic: e.evaluation?.topic,
                          round_type: null,
                          response_type: 'answered',
                          skip_source: null,
                          timestamp: null,
                          is_follow_up: e.is_follow_up,
                          question_intent: e.question_intent,
                        };
                      });
                    })();
                // ── Meta / non-question guard (display last-resort) ──────────
                // The opening "about the role" warm-up, redirect/deflection, and
                // farewell turns are NOT interview questions and must never appear
                // in Question Analysis (only in the Transcript tab). They are
                // excluded upstream (backend), but if an older/partial evaluation
                // still carries one in question_history, drop it here so the
                // report never shows it as a scored question. Matched by unique
                // meta lead-ins that never open a real interview question.
                const _isMetaTurn = (q: any): boolean => {
                  const t = String(q?.question || '').toLowerCase();
                  if (!t) return false;
                  const META = [
                    'your interviewer today', "here's a quick overview", 'here is a quick overview',
                    'here to conduct the interview', 'here to conduct this interview',
                    "i'm here to listen", 'im here to listen',
                    "let's focus on the interview", 'lets focus on the interview',
                    'completing the interview', 'responses have been recorded',
                    'wish you all the best', 'future endeavors',
                    'welcome back',
                  ];
                  // Meta turns are statements (no "?"). A real question that merely
                  // quotes one of these phrases still has a "?" and is kept.
                  return !t.includes('?') && META.some(m => t.includes(m));
                };
                const qaItemsFiltered: any[] = qaItemsRaw.filter((q) => !_isMetaTurn(q));
                // Some re-evaluated sessions store question_history with every
                // entry flagged as a main question even when the conversation
                // clearly contained follow-ups (intent="main_question",
                // is_follow_up=false across the board). The conversation_transcript
                // remains the source of truth for follow-up tagging on the
                // assistant side — mirror the Transcript tab's lookup so the Q/A
                // grouper can recover the structure.
                const _convoTranscript: any[] = (liveSession.conversation_transcript
                  || interview.conversation_transcript
                  || []) as any[];
                const _fuKeySet = new Set<string>();
                const _ddKeySet = new Set<string>();
                for (const m of _convoTranscript) {
                  if (m?.role !== 'assistant' || !m?.content) continue;
                  const key = String(m.content).trim().slice(0, 60);
                  const intent = String(m.question_intent || '').toLowerCase();
                  if (intent === 'deep_dive' || m.is_deep_dive) _ddKeySet.add(key);
                  else if (m.is_follow_up || intent === 'follow_up' || intent === 'probe') _fuKeySet.add(key);
                }
                const _matchKey = (q: string, set: Set<string>): boolean => {
                  if (!q || set.size === 0) return false;
                  const key = q.trim().slice(0, 60);
                  if (set.has(key)) return true;
                  for (const k of set) {
                    if (key.startsWith(k.slice(0, 40)) || k.startsWith(key.slice(0, 40))) return true;
                  }
                  return false;
                };

                // Group follow-ups with their parent main question. Follow-ups
                // are rendered as F1, F2… (deep-dives as D1, D2…) nested inside
                // the parent's Q box. Detection order:
                //   1. explicit is_follow_up / question_intent on the entry
                //   2. shared question_number with previous entry (live-mode)
                //   3. text match against conversation_transcript follow-up flags
                //      (fallback for re-evaluated sessions where question_history
                //      lost the tagging).
                // Dedupe synthetic skip duplicates. When a slot times out or
                // is auto-skipped after a candidate stops responding, the
                // backend records a question_history row that often inherits
                // `current_question` (the last spoken question text), so the
                // same Q text can appear 2-5 times in the UI with only the
                // first being the real ask. Collapse later skip rows that
                // share question text + round_type with an earlier row.
                // Follow-ups are exempt — sub-interactions of one slot are
                // expected to share their parent's main number.
                const _isSkipResponse = (rt?: string): boolean => {
                  const r = String(rt || '').toLowerCase();
                  return r === 'skipped' || r === 'not_asked' || r === 'timeout'
                    || r === 'low_coverage' || r === 'auto_skipped_offline'
                    || r === 'auto_skipped_by_coverage';
                };
                const _seenKeys = new Set<string>();
                const qaItems: any[] = [];
                for (const _it of qaItemsFiltered) {
                  const _intent = String(_it.question_intent || '').toLowerCase();
                  const _isFu = !!_it.is_follow_up
                    || ['follow_up', 'probe', 'deep_dive'].includes(_intent);
                  const _qText = String(_it.question || '').trim().toLowerCase();
                  const _rt = String(_it.round_type || '').toLowerCase();
                  const _key = `${_rt}::${_qText}`;
                  if (!_isFu && _qText) {
                    if (_isSkipResponse(_it.response_type) && _seenKeys.has(_key)) continue;
                    _seenKeys.add(_key);
                  }
                  qaItems.push(_it);
                }

                type QaGroup = { main: any; followUps: any[] };
                const groups: QaGroup[] = [];
                for (const it of qaItems) {
                  const prev = groups.length > 0 ? groups[groups.length - 1] : null;
                  const _intent = (it.question_intent || '').toLowerCase();
                  const _qText = String(it.question || '');
                  const _txtIsDd = _matchKey(_qText, _ddKeySet);
                  const _txtIsFu = _matchKey(_qText, _fuKeySet);
                  const isFu = !!it.is_follow_up
                    || ['follow_up', 'probe', 'deep_dive'].includes(_intent)
                    || (prev != null && it.question_number != null && prev.main.question_number != null && String(it.question_number) === String(prev.main.question_number))
                    || _txtIsDd
                    || _txtIsFu;
                  if (isFu && prev) {
                    if (_txtIsDd && !it.question_intent) it.question_intent = 'deep_dive';
                    else if (_txtIsFu && !it.question_intent) it.question_intent = 'follow_up';
                    prev.followUps.push(it);
                  } else {
                    groups.push({ main: it, followUps: [] });
                  }
                }

                if (groups.length === 0) return renderPlaceholder('No Q&A data available');

                // ── Q&A export helpers ────────────────────────────────────
                const qaBaseName = `qa_${interview.candidate_name || 'candidate'}_${liveSession.id.slice(0, 8)}`.replace(/\s+/g, '_');
                const candidateNameLabel = interview.candidate_name || 'Candidate';
                // Partial banner ONLY for a genuine early-end: a real
                // termination, or a truncated interview explicitly marked
                // `partial`. A non-terminated "eval did not run" stub is NOT
                // partial — it is handled by the generating spinner + auto-reeval
                // above (invariant: partial ⟺ terminated / truncated).
                const isPartialEvaluation =
                  eval_?.partial === true || (wasTerminated && eval_?.evaluation_incomplete === true);

                const roundLabelFor = (rt?: string) => {
                  const k = (rt || '').toLowerCase();
                  if (k === 'hr') return 'HR';
                  if (k === 'must_have_skills') return 'Must Have Skills';
                  if (k === 'nice_to_have_skills') return 'Nice To Have Skills';
                  return rt ? rt.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : '';
                };

                const exportQaPDF = async () => {
                  const html2pdf = (await import('html2pdf.js')).default;
                  const root = document.createElement('div');
                  root.style.cssText = 'padding:24px;font-family:Arial,sans-serif;color:var(--raw-111111);max-width:720px;';
                  let inner = `<h1 className="tf-page-title" style="font-size:20px;margin:0 0 4px 0">Q&amp;A Transcript</h1>
                    <div style="font-size:12px;color:var(--raw-666666);margin-bottom:16px">${candidateNameLabel} · ${groups.length} questions</div>`;
                  groups.forEach((g: any, i: number) => {
                    const it = g.main;
                    const rl = roundLabelFor(it.round_type);
                    const topic = it.topic && it.topic !== 'general' ? it.topic : '';
                    inner += `<div style="margin-bottom:14px;padding:10px 12px;border:1px solid var(--raw-e5e7eb);border-radius:6px;page-break-inside:avoid">
                      <div style="font-size:11px;color:var(--raw-6b7280);margin-bottom:4px">
                        <b>Q${it.question_number ?? i + 1}</b>${rl ? ` · ${rl}` : ''}${topic ? ` · ${topic}` : ''}
                      </div>
                      <div style="font-size:13px;font-weight:600;color:var(--raw-111111);margin-bottom:6px">${escapeHtml(it.question || '')}</div>
                      <div style="font-size:12px;color:var(--raw-374151)"><b>Candidate Answer:</b> ${escapeHtml(it.answer || '—')}</div>`;
                    (it.clarifications || []).forEach((cl: any, ci: number) => {
                      inner += `<div style="margin-top:8px;padding-left:10px;border-left:2px solid var(--raw-fcd34d)">
                        <div style="font-size:10px;color:var(--raw-b45309);margin-bottom:2px"><b>CL${cl.clarification_number ?? ci + 1}</b></div>
                        <div style="font-size:12px;font-weight:600;color:var(--raw-111111);margin-bottom:4px">${escapeHtml(cl.question || '')}</div>
                        <div style="font-size:12px;color:var(--raw-374151)"><b>Candidate Answer:</b> ${escapeHtml(cl.answer || '—')}</div>
                      </div>`;
                    });
                    g.followUps.forEach((fu: any, fi: number) => {
                      inner += `<div style="margin-top:8px;padding-left:10px;border-left:2px solid var(--raw-c4b5fd)">
                        <div style="font-size:10px;color:var(--raw-7c3aed);margin-bottom:2px"><b>F${fi + 1}</b></div>
                        <div style="font-size:12px;font-weight:600;color:var(--raw-111111);margin-bottom:4px">${escapeHtml(fu.question || '')}</div>
                        <div style="font-size:12px;color:var(--raw-374151)"><b>Candidate Answer:</b> ${escapeHtml(fu.answer || '—')}</div>
                      </div>`;
                    });
                    inner += `</div>`;
                  });
                  root.innerHTML = inner;
                  document.body.appendChild(root);
                  try {
                    await html2pdf().set({
                      margin: [10, 10, 10, 10],
                      filename: `${qaBaseName}.pdf`,
                      image: { type: 'jpeg', quality: 0.95 },
                      html2canvas: { scale: 2 },
                      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                    }).from(root).save();
                  } finally {
                    document.body.removeChild(root);
                    setQaExportMenuOpen(false);
                  }
                };

                const exportQaDOCX = async () => {
                  const docx = await import('docx');
                  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = docx;
                  const children: any[] = [
                    new Paragraph({
                      heading: HeadingLevel.HEADING_1,
                      children: [new TextRun({ text: 'Q&A Transcript', bold: true })],
                    }),
                    new Paragraph({
                      children: [new TextRun({ text: `${candidateNameLabel} · ${groups.length} questions`, color: '666666', size: 20 })],
                      spacing: { after: 240 },
                    }),
                  ];
                  groups.forEach((g: any, i: number) => {
                    const it = g.main;
                    const rl = roundLabelFor(it.round_type);
                    const topic = it.topic && it.topic !== 'general' ? it.topic : '';
                    const meta = [`Q${it.question_number ?? i + 1}`, rl, topic].filter(Boolean).join(' · ');
                    children.push(new Paragraph({
                      spacing: { before: 160, after: 60 },
                      children: [new TextRun({ text: meta, bold: true, color: '6b7280', size: 18 })],
                    }));
                    children.push(new Paragraph({
                      children: [new TextRun({ text: it.question || '', bold: true, size: 22 })],
                      spacing: { after: 60 },
                    }));
                    children.push(new Paragraph({
                      children: [
                        new TextRun({ text: 'Candidate Answer: ', bold: true, size: 22 }),
                        new TextRun({ text: it.answer || '—', size: 22 }),
                      ],
                      spacing: { after: 120 },
                    }));
                    (it.clarifications || []).forEach((cl: any, ci: number) => {
                      children.push(new Paragraph({
                        indent: { left: 360 },
                        children: [new TextRun({ text: `CL${cl.clarification_number ?? ci + 1}`, bold: true, color: 'b45309', size: 18 })],
                      }));
                      children.push(new Paragraph({
                        indent: { left: 360 },
                        children: [new TextRun({ text: cl.question || '', bold: true, size: 22 })],
                        spacing: { after: 40 },
                      }));
                      children.push(new Paragraph({
                        indent: { left: 360 },
                        children: [
                          new TextRun({ text: 'Candidate Answer: ', bold: true, size: 22 }),
                          new TextRun({ text: cl.answer || '—', size: 22 }),
                        ],
                        spacing: { after: 120 },
                      }));
                    });
                    g.followUps.forEach((fu: any, fi: number) => {
                      children.push(new Paragraph({
                        indent: { left: 360 },
                        children: [new TextRun({ text: `F${fi + 1}`, bold: true, color: '7c3aed', size: 18 })],
                      }));
                      children.push(new Paragraph({
                        indent: { left: 360 },
                        children: [new TextRun({ text: fu.question || '', bold: true, size: 22 })],
                        spacing: { after: 40 },
                      }));
                      children.push(new Paragraph({
                        indent: { left: 360 },
                        children: [
                          new TextRun({ text: 'Candidate Answer: ', bold: true, size: 22 }),
                          new TextRun({ text: fu.answer || '—', size: 22 }),
                        ],
                        spacing: { after: 120 },
                      }));
                    });
                  });
                  const doc = new Document({ sections: [{ properties: {}, children }] });
                  const blob = await Packer.toBlob(doc);
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${qaBaseName}.docx`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                  setQaExportMenuOpen(false);
                };

                const renderAnswer = (item: any, key: string) => {
                  const isSkipped = item.response_type === 'skipped' || item.response_type === 'not_asked';
                  const isNotAsked = item.response_type === 'not_asked';
                  const answerText = item.answer || '';
                  if (!answerText) return null;
                  const isExpanded = expandedQuestions.has(key);
                  const truncated = answerText.length > 200;
                  return (
                    <div className="mt-1.5">
                      <div className={`text-sm leading-relaxed ${isSkipped ? 'text-gray-400 italic' : 'text-gray-700'}`}>
                        <span className="font-semibold text-gray-900">Candidate Answer: </span>
                        {isExpanded || !truncated ? answerText : `${answerText.slice(0, 200)}...`}
                      </div>
                      {truncated && (
                        <button
                          onClick={() => toggleQuestion(key)}
                          className="flex items-center gap-1 mt-1.5 text-xs text-brand-blue hover:text-brand-blue-2"
                        >
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          {isExpanded ? 'Show less' : 'Show more'}
                        </button>
                      )}
                    </div>
                  );
                };

                // ── Build skill → priority/cluster lookup from clusterConfig ──
                const skillPriority: Record<string, number> = {};
                const skillCluster: Record<string, string> = {};
                [...clusterConfig.mth, ...clusterConfig.nth].forEach((c: any) => {
                  (c.skills || []).forEach((s: string) => {
                    if (s) {
                      skillPriority[s.toLowerCase()] = c.priority;
                      skillCluster[s.toLowerCase()] = c.name;
                    }
                  });
                });
                // Cluster config stores `priority` such that 3 = highest
                // (P1), 2 = mid (P2), 1 = lowest (P3) — mirrors the backend
                // _PRIO_MAP convention (see interview_evaluation.py:134).
                // The Coverage panel inverts this via priorityNumToLevel in
                // adapter.ts; this view used to render the raw number, which
                // is why P1 skills showed up as "P3" chips with the wrong
                // weight. Normalize at the boundary so all downstream code
                // here works in "1 = highest, 3 = lowest" form.
                const configToDisplayPrio = (p: number): number =>
                  p >= 3 ? 1 : p === 2 ? 2 : p === 1 ? 3 : 0;
                const getPrio = (skill?: string) =>
                  skill ? configToDisplayPrio(skillPriority[skill.toLowerCase()] || 0) : 0;
                // Spec: P1=10, P2=7, P3=4. No default: a skill with no
                // priority (0) weighs 0 and is left out of the formula,
                // matching the backend's _compute_question_scores.
                const priorityWeight = (p: number) => p === 1 ? 10 : p === 2 ? 7 : p === 3 ? 4 : 0;

                // ── Build evaluations lookup by question_number ──
                // Used to surface per-skill rows + one_line_note for the AI Analysis Summary.
                const evalsByQ: Record<number, any[]> = {};
                (eval_.evaluations || []).forEach((e: any) => {
                  const q = e.question_number ?? 0;
                  (evalsByQ[q] = evalsByQ[q] || []).push(e);
                });

                // ── Group questions by section (mth / nth / hr) ──
                type GroupT = typeof groups[number];
                const mthGroups: GroupT[] = [];
                const nthGroups: GroupT[] = [];
                const hrGroups: GroupT[] = [];
                groups.forEach((g, idx) => {
                  let rt = (g.main.round_type || '').toLowerCase();
                  if (!rt || rt === 'general') {
                    for (let k = idx + 1; k < groups.length; k++) {
                      const nxt = groups[k].main;
                      if (nxt.round_type) { rt = String(nxt.round_type).toLowerCase(); break; }
                    }
                    if (!rt) rt = 'must_have_skills';
                  }
                  if (rt === 'hr') hrGroups.push(g);
                  else if (rt === 'nice_to_have_skills') nthGroups.push(g);
                  else mthGroups.push(g);
                });

                const renderFollowUps = (followUps: any[], parentKey: string) => {
                  if (followUps.length === 0) return null;
                  let _fuC = 0, _ddC = 0;
                  return (
                    <div className="ml-2 mt-3 space-y-3 pl-3 border-l-2 border-brand-cyan/30">
                      {followUps.map((fu: any, fIdx: number) => {
                        const fuSkipped = fu.response_type === 'skipped';
                        const isDd = fu.question_intent === 'deep_dive';
                        let badge: string, badgeCls: string;
                        if (isDd) { _ddC += 1; badge = `D${_ddC}`; badgeCls = 'text-brand-teal bg-brand-teal/10 ring-1 ring-brand-teal/20'; }
                        else { _fuC += 1; badge = `F${_fuC}`; badgeCls = 'text-brand-cyan bg-brand-cyan/10 ring-1 ring-brand-cyan/20'; }
                        return (
                          <div key={fIdx} className="flex items-start gap-2">
                            <span className={`flex-shrink-0 text-2xs font-semibold rounded px-1.5 py-0.5 mt-0.5 ${badgeCls}`}>{badge}</span>
                            <div className="flex-1 min-w-0">
                              {fuSkipped && (
                                <span className="tf-badge inline-block bg-slate-100 text-slate-500 ring-1 ring-slate-200 mb-1">
                                  Skipped{fu.skip_source === 'user' ? ' by candidate' : ''}
                                </span>
                              )}
                              <p className="tf-label leading-snug">{fu.question}</p>
                              {renderAnswer(fu, `${parentKey}-f-${fIdx}`)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                };

                const renderClarifications = (item: any, parentKey: string) => {
                  if (!Array.isArray(item.clarifications) || item.clarifications.length === 0) return null;
                  return (
                    <div className="ml-2 mt-3 space-y-3 pl-3 border-l-2 border-brand-orange/30">
                      {item.clarifications.map((cl: any, cIdx: number) => {
                        const clKey = `${parentKey}-cl-${cIdx}`;
                        return (
                          <div key={clKey} className="flex items-start gap-2">
                            <span className="flex-shrink-0 text-2xs font-semibold rounded px-1.5 py-0.5 mt-0.5 text-brand-orange-deep bg-brand-orange/10 ring-1 ring-brand-orange/20">
                              CL{cl.clarification_number ?? cIdx + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="tf-label leading-snug">{cl.question}</p>
                              {renderAnswer({ answer: cl.answer, response_type: 'answered' }, clKey)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                };

                // ── Scored card (Must-Have / Nice-to-Have) ──
                const renderScoredCard = (g: GroupT, idx: number, sectionKey: 'mth' | 'nth') => {
                  const item = g.main;
                  const cardKey = `${sectionKey}-${idx}-${item.question_number ?? idx}`;
                  const isExpanded = expandedQuestions.has(cardKey);
                  const isSkipped = item.response_type === 'skipped' || item.response_type === 'not_asked';
                  const isNotAsked = item.response_type === 'not_asked';

                  // Collect skills for this question. Source priority:
                  //   1. evaluations[].topic — what the LLM evaluator actually
                  //      scored on this question (coherent with the question
                  //      text and the per-skill scores).
                  //   2. secondary_skills from history (extra planner-tagged).
                  //   3. item.topic — only as a last resort. The backend
                  //      pre-fills this with the first uncovered skill BEFORE
                  //      the LLM runs (transcript_evaluation_service.py:6003),
                  //      so when the candidate skipped or the evaluator never
                  //      tagged a topic, item.topic shows the next slot's
                  //      planned skill rather than what the question asked.
                  type SkillRow = { skill: string; score: number; priority: number };
                  const skillsForQ: SkillRow[] = [];
                  const seen = new Set<string>();
                  const pushSkill = (skill?: string, score?: number) => {
                    if (!skill) return;
                    const k = skill.toLowerCase().trim();
                    if (!k || seen.has(k)) return;
                    seen.add(k);
                    skillsForQ.push({ skill, score: Number(score) || 0, priority: getPrio(skill) });
                  };
                  (evalsByQ[item.question_number] || []).forEach((e: any) => pushSkill(e.topic, e.score));
                  (item.secondary_skills || []).forEach((s: any) => pushSkill(s.skill, s.score));
                  if (skillsForQ.length === 0) pushSkill(item.topic, item.score);

                  // Question score comes from the backend only — never
                  // recomputed here. `question_score` (null = not scored) wins;
                  // older evaluations only carry `score`. totalW is used just
                  // for the explanatory formula below.
                  const totalW = skillsForQ.reduce((acc, s) => acc + priorityWeight(s.priority), 0);
                  const backendQS = 'question_score' in item ? item.question_score : item.score;
                  const finalScore = typeof backendQS === 'number' ? truncate1(backendQS) : 0;

                  // AI summary: take the rep evaluation's one_line_note
                  const repEval = (evalsByQ[item.question_number] || []).reduce<any | null>(
                    (best, e) => (best == null || (e.score || 0) > (best.score || 0) ? e : best), null
                  );
                  const aiSummary = repEval?.one_line_note || '';

                  const duration = item.duration_seconds;
                  const finalScoreColor = finalScore >= 8 ? 'text-success' : finalScore >= 6 ? 'text-blue-600' : finalScore >= 4 ? 'text-warning' : 'text-orange-600';

                  return (
                    <div key={cardKey} className={`bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 ${isSkipped ? 'bg-slate-50/50' : ''}`}>
                      <button
                        onClick={() => toggleQuestion(cardKey)}
                        className="w-full text-left p-4 hover:bg-gray-50/50 rounded-xl transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <span className="text-xs font-semibold text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 rounded px-1.5 py-0.5">
                                Question {item.question_number ?? idx + 1}
                              </span>
                              {duration != null && (
                                <span className="inline-flex items-center gap-1 tf-meta">
                                  <Clock className="w-3 h-3" />
                                  {duration} seconds
                                </span>
                              )}
                              {isSkipped && (
                                <span className="tf-badge bg-slate-100 text-slate-500 ring-1 ring-slate-200">
                                  {isNotAsked ? 'Not Asked' : `Skipped${item.skip_source === 'user' ? ' by candidate' : ''}`}
                                </span>
                              )}
                            </div>
                            <p className="tf-row-name leading-snug mb-2">{item.question}</p>
                            {skillsForQ.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {skillsForQ.map((s, i) => (
                                  <span key={i} className="tf-badge bg-slate-100 text-slate-700 ring-1 ring-slate-200">
                                    {s.skill}
                                    {s.priority > 0 && (
                                      <span className="text-2xs text-slate-500">(P{s.priority})</span>
                                    )}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-start gap-2 flex-shrink-0">
                            {!isSkipped && (
                              <div className="text-right">
                                <div className={`text-2xl font-bold ${finalScoreColor}`}>{formatScore1(finalScore)}</div>
                                <div className="tf-micro-hint uppercase tracking-wider">Final Score</div>
                              </div>
                            )}
                            {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400 mt-1" /> : <ChevronDown className="w-5 h-5 text-gray-400 mt-1" />}
                          </div>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-4 space-y-4 border-t border-gray-100">
                          {/* Candidate Answer */}
                          <div className="pt-4">
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                              <div className="tf-caption uppercase tracking-wider">Candidate Answer</div>
                              {item.response_type !== 'not_asked' && watchQuestion(item.question, item.timestamp)}
                            </div>
                            <div className={`text-sm leading-relaxed ${isSkipped ? 'text-gray-400 italic' : 'text-gray-700'}`}>
                              {item.answer || '—'}
                            </div>
                          </div>

                          {/* AI Analysis Summary */}
                          {aiSummary && (
                            <div className="bg-brand-blue/5 ring-1 ring-brand-blue/15 rounded-lg p-3">
                              <div className="flex items-center gap-1.5 mb-1">
                                <Sparkles className="w-3.5 h-3.5 text-brand-blue" />
                                <span className="text-xs font-semibold text-brand-blue">AI Analysis Summary</span>
                              </div>
                              <p className="tf-body leading-relaxed">{aiSummary}</p>
                            </div>
                          )}

                          {/* Skill Scoring Breakdown */}
                          {skillsForQ.length > 0 && !isSkipped && (
                            <div>
                              <div className="tf-caption uppercase tracking-wider mb-2">Skill Scoring Breakdown</div>
                              <div className="space-y-2">
                                {skillsForQ.map((s, i) => {
                                  const w = priorityWeight(s.priority);
                                  const contribution = s.score * w;
                                  const pct = Math.min(100, Math.max(0, (s.score / 10) * 100));
                                  return (
                                    <div key={i} className="bg-slate-50 rounded-lg p-3">
                                      <div className="flex flex-wrap items-center justify-between gap-y-1 mb-1.5">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          <span className="tf-row-name truncate">{s.skill}</span>
                                          {s.priority > 0 && (
                                            <span className="text-2xs text-slate-500 bg-white px-1.5 py-0.5 rounded ring-1 ring-slate-200 flex-shrink-0">P{s.priority}</span>
                                          )}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                                          <div><span className="text-gray-500">Score</span> <span className="font-semibold text-gray-900">{formatScore1(s.score)}</span></div>
                                          <div><span className="text-gray-500">Weight</span> <span className="font-semibold text-gray-900">{w}</span></div>
                                          <div><span className="text-gray-500">Contribution</span> <span className="font-semibold text-gray-900">{formatScore1(contribution)}</span></div>
                                        </div>
                                      </div>
                                      <div className="h-1.5 bg-white rounded-full overflow-hidden ring-1 ring-slate-200">
                                        <div className="h-full bg-success transition-all" style={{ width: `${pct}%` }} />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Weighted Formula */}
                          {skillsForQ.length > 0 && !isSkipped && totalW > 0 && (
                            <div className="bg-brand-blue/5 ring-1 ring-dashed ring-brand-blue/30 rounded-lg p-3">
                              <div className="text-xs font-semibold text-brand-blue mb-1.5">Weighted Calculation Formula</div>
                              <div className="font-mono tf-meta space-y-0.5 break-words">
                                <div>Question Score = Σ(Skill Score × Weight) / ΣWeights</div>
                                <div>= ({skillsForQ.map(s => `${formatScore1(s.score)}×${priorityWeight(s.priority)}`).join(' + ')}) / {totalW} = {formatScore1(finalScore)}</div>
                              </div>
                            </div>
                          )}

                          {/* Clarifications + Follow-ups */}
                          {renderClarifications(item, cardKey)}
                          {renderFollowUps(g.followUps, cardKey)}

                          {/* View Full Transcript */}
                          <div className="flex justify-center pt-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); setActiveTab('transcript'); }}
                              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-brand-blue bg-brand-blue/5 hover:bg-brand-blue/10 ring-1 ring-brand-blue/20 rounded-full transition-colors"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              View Full Transcript
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                };

                // ── HR card (no scoring — answer only) ──
                const renderHRCard = (g: GroupT, idx: number) => {
                  const item = g.main;
                  const cardKey = `hr-${idx}-${item.question_number ?? idx}`;
                  const isExpanded = expandedQuestions.has(cardKey);
                  const isSkipped = item.response_type === 'skipped' || item.response_type === 'not_asked';
                  const isNotAsked = item.response_type === 'not_asked';
                  const duration = item.duration_seconds;

                  return (
                    <div key={cardKey} className="tf-card-soft">
                      <button
                        onClick={() => toggleQuestion(cardKey)}
                        className="w-full text-left p-4 hover:bg-gray-50/50 rounded-xl transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <span className="text-xs font-semibold text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 rounded px-1.5 py-0.5">
                                Question {item.question_number ?? idx + 1}
                              </span>
                              {duration != null && (
                                <span className="inline-flex items-center gap-1 tf-meta">
                                  <Clock className="w-3 h-3" />
                                  {duration} seconds
                                </span>
                              )}
                              {/* HR questions are behavioural / cultural / situational.
                                  When the planner auto-skips an uncovered slot it stamps
                                  the next uncovered TECHNICAL skill onto the synthetic
                                  HR row, which then reads like a cloud / NLP question.
                                  Allow only real HR sub-categories through; otherwise
                                  collapse to a generic "HR" pill. */}
                              {(() => {
                                const HR_TOPICS = new Set(['behavioural', 'behavioral', 'cultural fit', 'situational']);
                                const t = String(item.topic || '').trim();
                                const label = HR_TOPICS.has(t.toLowerCase()) ? t : 'HR';
                                return (
                                  <span className="tf-badge bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">{label}</span>
                                );
                              })()}
                              {isSkipped && (
                                <span className="tf-badge bg-slate-100 text-slate-500 ring-1 ring-slate-200">
                                  {isNotAsked ? 'Not Asked' : `Skipped${item.skip_source === 'user' ? ' by candidate' : ''}`}
                                </span>
                              )}
                            </div>
                            <p className="tf-row-name leading-snug">{item.question}</p>
                          </div>
                          <div className="flex-shrink-0">
                            {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                          </div>
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="px-4 pb-4 border-t border-gray-100 pt-4 space-y-3">
                          <div>
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                              <div className="tf-caption uppercase tracking-wider">Candidate Answer</div>
                              {item.response_type !== 'not_asked' && watchQuestion(item.question, item.timestamp)}
                            </div>
                            <div className={`text-sm leading-relaxed ${isSkipped ? 'text-gray-400 italic' : 'text-gray-700'}`}>
                              {item.answer || '—'}
                            </div>
                          </div>
                          {renderClarifications(item, cardKey)}
                          {renderFollowUps(g.followUps, cardKey)}
                        </div>
                      )}
                    </div>
                  );
                };

                const SectionHeader = ({ title, badge, badgeCls }: { title: string; badge: string; badgeCls: string }) => (
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="tf-section-title">{title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${badgeCls}`}>{badge}</span>
                  </div>
                );

                return (
                  <div className="space-y-6">
                    {isPartialEvaluation && (
                      <div className="rounded-xl border border-warning-line bg-warning-subtle px-4 py-3 text-sm text-warning-strong">
                        This interview ended early. The scores below are for attended questions only; no final pass/fail or overall match score is generated here.
                      </div>
                    )}
                    {/* Export toolbar */}
                    <div className="flex justify-end relative">
                      <Button
                        variant="primary"
                        size="sm"
                        // Q&A export (PDF / DOCX) is a report download (2026-11-10).
                        onClick={() => { if (canDownloadReports) setQaExportMenuOpen(v => !v); }}
                        aria-disabled={!canDownloadReports}
                        title={canDownloadReports ? undefined : "You can view this interview, but your role can't download reports"}
                        className={!canDownloadReports ? 'opacity-50 cursor-not-allowed' : undefined}
                      >
                        <Download className="w-3.5 h-3.5" />
                        Export
                        <ChevronDown className="w-3 h-3" />
                      </Button>
                      {qaExportMenuOpen && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setQaExportMenuOpen(false)} />
                          <div className="absolute right-0 top-9 z-20 w-32 max-w-[calc(100vw-1.5rem)] bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-lg shadow-brand-blue/10 py-1">
                            <button onClick={exportQaPDF} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue">
                              <FileText className="w-3.5 h-3.5 text-destructive" /> PDF
                            </button>
                            <button onClick={exportQaDOCX} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue">
                              <FileText className="w-3.5 h-3.5 text-brand-blue" /> DOCX
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    {mthGroups.length > 0 && (
                      <section>
                        <SectionHeader
                          title="Must-Have Section"
                          badge={isPartialEvaluation ? 'Evaluated from Attended Questions' : 'Scored for Pass/Fail'}
                          badgeCls="bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20"
                        />
                        <div className="space-y-3">
                          {mthGroups.map((g, i) => renderScoredCard(g, i, 'mth'))}
                        </div>
                      </section>
                    )}

                    {nthGroups.length > 0 && (
                      <section>
                        <SectionHeader
                          title="Nice-to-Have Section"
                          badge="Informative Only"
                          badgeCls="bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20"
                        />
                        <div className="space-y-3">
                          {nthGroups.map((g, i) => renderScoredCard(g, i, 'nth'))}
                        </div>
                      </section>
                    )}

                    {hrGroups.length > 0 && (
                      <section>
                        <SectionHeader
                          title="HR Section"
                          badge="Not scored — review only"
                          badgeCls="bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20"
                        />
                        <div className="space-y-3">
                          {hrGroups.map((g, i) => renderHRCard(g, i))}
                        </div>
                      </section>
                    )}
                  </div>
                );
              })()
            )}

            {/* Recording Tab — pass liveSession so hasFile reflects the latest
                recording_file_path even when it was set after the initial prop fetch */}
            {!evaluationPending && activeTab === 'recording' && (
              getPlaceholderMessage('recording') ? renderPlaceholder(getPlaceholderMessage('recording')!) : (
                <RecordingTabContent
                  interview={liveSession}
                  videoBlobUrl={videoBlobUrl}
                  videoBlobSize={videoBlobSize}
                  videoDownloadUrl={videoDownloadUrl}
                  videoLoading={videoLoading}
                  videoError={videoError}
                  setVideoError={setVideoError}
                  screenBlobUrl={screenBlobUrl}
                  screenBlobSize={screenBlobSize}
                  screenDownloadUrl={screenDownloadUrl}
                  screenLoading={screenLoading}
                  screenError={screenError}
                  onCandidatePlaybackError={() => { void fallbackToBackend('candidate'); }}
                  onScreenPlaybackError={() => { void fallbackToBackend('screen'); }}
                  seekRequest={recordingSeek}
                  markers={[...recordingQuestionMarkers(), ...recordingViolationMarkers()]}
                />
              )
            )}

            {/* QR Verification Tab — mobile environment-verification attempts for
                this interview, sourced from the environment_verifications DB
                table directly (GET /ai-interview/{id}/environment-verifications),
                not from proctoring_violations. See the fetch effect above for why. */}
            {!evaluationPending && activeTab === 'verification' && (
              envVerificationsLoading && envVerifications === null ? (
                <div className="space-y-4">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="tf-card-soft overflow-hidden">
                      <div className="px-4 sm:px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <Skeleton className="w-4 h-4 rounded" />
                          <Skeleton className="h-4 w-44" />
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Skeleton className="h-5 w-24 rounded-full" />
                          <Skeleton className="h-5 w-24 rounded-full" />
                        </div>
                      </div>
                      <div className="p-4 sm:p-5 space-y-4">
                        <Skeleton className="h-3 w-48" />
                        <Skeleton className="w-full max-w-lg h-48 rounded-lg" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : !envVerifications || envVerifications.length === 0 ? (
                envVerificationsError
                  ? renderPlaceholder('Could not load QR verification data — please refresh and try again.')
                  : (
                    <QrVerificationEmptyState
                      message={liveSession.environment_verification_enabled
                        ? 'No QR verification was triggered during this interview.'
                        : 'QR Verification was not enabled for this interview.'}
                    />
                  )
              ) : (
                <div className="space-y-4">
                  {envVerifications.map((v, attemptIdx) => {
                    const videoSrc = v.video_url || envVideoBlobUrls[v.verification_id] || null;
                    const videoStillLoading = v.video_uploaded && !videoSrc && !envVideoBlobUrls[v.verification_id] && !v.video_url;
                    return (
                      <EnvVerificationStudio
                        key={v.verification_id}
                        v={v}
                        videoSrc={videoSrc}
                        videoStillLoading={videoStillLoading}
                        frames={envFrames[v.verification_id]}
                        framesLoading={!!envFramesLoading[v.verification_id]}
                        framesError={!!envFramesError[v.verification_id]}
                        openViewer={(urls, index) => setEnvFrameViewer({ urls, index })}
                        registerVideo={(el) => { envVideoRefs.current[v.verification_id] = el; }}
                        formatTs={formatTs}
                        isInProgress={isInProgress}
                        attemptLabel={envVerifications.length > 1 ? `Attempt ${attemptIdx + 1}` : undefined}
                        onRetryAnalysis={() => retryEnvAnalysis(v.verification_id)}
                        reanalyzing={!!envReanalyzing[v.verification_id]}
                        reanalyzeError={envReanalyzeError[v.verification_id]}
                        watchInRecording={renderWatchInRecording(v.triggered_at)}
                        interviewRef={{
                          candidate: interview.candidate_name || liveSession.candidate_name || 'Candidate',
                          role: (interview as any).job_title || (interview as any).role || interview.position || '',
                          sessionId: liveSession.id,
                        }}
                      />
                    );
                  })}
                </div>
              )
            )}

            {envFrameViewer && (
              <div
                className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
                onClick={() => setEnvFrameViewer(null)}
              >
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setEnvFrameViewer(null); }}
                  aria-label="Close"
                  className="absolute top-4 right-4 sm:top-6 sm:right-6 text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setEnvFrameViewer(prev => prev && prev.index > 0 ? { ...prev, index: prev.index - 1 } : prev); }}
                  disabled={envFrameViewer.index === 0}
                  title="Previous frame"
                  className="absolute left-2 sm:left-6 text-white/80 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed p-2"
                >
                  <ChevronLeft className="w-8 h-8" />
                </button>
                <div className="flex flex-col items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <img src={envFrameViewer.urls[envFrameViewer.index]} alt="Frame preview" className="max-w-full max-h-[80vh] rounded-lg" />
                  <span className="text-white/70 text-xs font-mono">{envFrameViewer.index + 1} / {envFrameViewer.urls.length}</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setEnvFrameViewer(prev => prev && prev.index < prev.urls.length - 1 ? { ...prev, index: prev.index + 1 } : prev); }}
                  disabled={envFrameViewer.index === envFrameViewer.urls.length - 1}
                  title="Next frame"
                  className="absolute right-2 sm:right-6 text-white/80 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed p-2"
                >
                  <ChevronRight className="w-8 h-8" />
                </button>
              </div>
            )}

            {/* Transcript Tab — use liveSession so evaluation_ready refresh populates
                the transcript even when the recruiter opened the view mid-interview */}
            {!evaluationPending && activeTab === 'transcript' && (
              getPlaceholderMessage('transcript') ? renderPlaceholder(getPlaceholderMessage('transcript')!) : (() => {
                // Closing thank-yous are meta-messages from Bina that we keep out
                // of the transcript list. The silence "Are you there?" nudge is
                // NOT filtered here anymore: it is a real utterance the candidate
                // heard and belongs in the transcript. It still won't inflate Q#/F#
                // numbering — the labeling loop below classifies it as an
                // 'interstitial' (via interstitial:true / kind="silence_*" / text
                // match in isInterstitialMsg) and renders it with NO question label,
                // exactly like the "I didn't get any response…" move-on line (which
                // was already shown). This fixes the reported inconsistency where the
                // move-on appeared in the Transcript tab but the "Are you there?"
                // nudge did not.
                const _isMetaAssistant = (msg: any) => {
                  if (msg.role !== 'assistant') return false;
                  const c = (msg.content || '').toLowerCase().trim();
                  return c.startsWith('thank you for taking the time')
                    || c.startsWith('thanks for taking the time')
                    || c.startsWith('thank you for speaking')
                    || c.startsWith('it was great chatting');
                };
                const rawMessages = (liveSession.conversation_transcript || interview.conversation_transcript || []);
                const messages = rawMessages
                  .filter((msg: any) => msg.role !== 'system' && !_isMetaAssistant(msg) && (
                    (msg.content && msg.content.trim())
                    // Non-English discard: no English content, but the candidate DID
                    // respond — keep it so the verbatim Original ASR shows in the tab.
                    || (msg.role === 'user' && msg.discarded_non_english && (msg.original_asr || msg.raw_content))
                  ));

                if (messages.length === 0) return renderPlaceholder('No transcript available');

                const candidateName = interview.candidate_name || 'Candidate';
                const formatTs = (ts: string) => {
                  if (!ts) return '';
                  try {
                    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                  } catch { return ''; }
                };

                // Build Q/F/D numbering using question_history intent data.
                // Strategy: build an intent lookup from ALL question_history entries
                // (keyed by question text prefix), then classify each assistant message.
                type QType = 'followup' | 'deepdive' | 'main' | 'closing' | 'interstitial';
                const _chatQh = (eval_.question_history || []) as any[];

                // Map: first-60-chars of question → intent ('follow_up'|'probe'|'deep_dive'|'explore')
                const _intentMap = new Map<string, string>();
                for (const qh of _chatQh) {
                  if (qh.question) {
                    const key = (qh.question as string).trim().slice(0, 60);
                    const intent = (qh.question_intent || '').toLowerCase();
                    if (intent) _intentMap.set(key, intent);
                    // Also detect via is_follow_up flag or shared question_number
                    if (!intent && (qh.is_follow_up)) {
                      _intentMap.set(key, 'follow_up');
                    }
                  }
                }
                // Also detect by shared question_number (timed mode)
                for (let _i = 1; _i < _chatQh.length; _i++) {
                  const cur = _chatQh[_i];
                  const prv = _chatQh[_i - 1];
                  if (cur.question && cur.question_number != null && prv.question_number != null
                      && String(cur.question_number) === String(prv.question_number)) {
                    const key = (cur.question as string).trim().slice(0, 60);
                    if (!_intentMap.has(key)) _intentMap.set(key, 'follow_up');
                  }
                }

                const _lookupIntent = (content: string): string => {
                  if (!content) return '';
                  const key = content.trim().slice(0, 60);
                  if (_intentMap.has(key)) return _intentMap.get(key)!;
                  // Fuzzy: check if any key starts the same way
                  for (const [k, v] of _intentMap) {
                    if (key.startsWith(k.slice(0, 40)) || k.startsWith(key.slice(0, 40))) return v;
                  }
                  return '';
                };

                // Skip-status detection: a skipped question shows in the chat as
                // a Bina bubble with NO candidate reply after it, so the viewer
                // can't tell HOW it was skipped. Shared with the Question Analysis
                // answer block via buildSkipReasoner (transcript-sequence first —
                // reliable; skip_source enhancement). "answered" is decided by the
                // caller (a real user reply follows it in the chat).
                const _skipReason = buildSkipReasoner(rawMessages, _chatQh);

                type Labeled = { msg: any; label: string; isFollowUp: boolean; qtype: QType };
                const labeled: Labeled[] = [];
                let mainCount = 0;
                let currentLabel = '';
                let currentQtype: QType = 'main';
                let fuCounter = 0;
                let ddCounter = 0;
                let clCounter = 0;  // Clarifications under current main Q
                // Detect clarifications by either explicit flag (backend) or
                // the recognizable rephrase opener Bina uses.
                const isClarificationMsg = (m: any): boolean => {
                  if (m.is_clarification === true) return true;
                  const t = (m.content || '').toLowerCase().trim();
                  return (
                    t.startsWith("let's stick to this question") ||
                    t.startsWith("let me put it another way") ||
                    t.startsWith("to put it differently") ||
                    t.startsWith("let me rephrase")
                  );
                };
                // Detect the closing / wrap-up message — should not get a Q label.
                const isClosingMsg = (m: any): boolean => {
                  if (m.is_closing === true || m.kind === 'closing') return true;
                  const t = (m.content || '').toLowerCase();
                  return (
                    t.includes('thank you for completing the interview') ||
                    t.includes('thank you for your time today') ||
                    (t.includes('your responses have been recorded') && t.includes('wish you all the best')) ||
                    // Bina's LLM-generated sendoff varies in wording. These phrases
                    // only appear in the wrap-up turn (often prefixed by an
                    // acknowledgment of the last answer, e.g. "That's a compelling
                    // case… This concludes our interview…"), never in a real question.
                    t.includes('this concludes our interview') ||
                    t.includes('this concludes the interview') ||
                    t.includes('that concludes our interview') ||
                    t.includes('it was a pleasure speaking with you') ||
                    t.includes('wish you the best of luck with the next steps') ||
                    t.includes('best of luck with the next steps') ||
                    t.includes('best of luck in the next steps')
                  );
                };
                // Detect informative / silence-ladder utterances ("Are you there?",
                // "I couldn't get any response…", "…let's move on…"). These are spoken
                // by Bina outside the question pipeline and must NOT be counted as
                // questions — otherwise a silence nudge inflates the Q number (e.g. the
                // nudge showed as "Q5" and stole the candidate's answer). Backend tags
                // them interstitial:true / kind="silence_*"; we also match text as a
                // fallback in case those flags don't survive the transcript pipeline.
                const isInterstitialMsg = (m: any): boolean => {
                  if (m.interstitial === true) return true;
                  if (String(m.kind || '').toLowerCase().startsWith('silence')) return true;
                  const t = (m.content || '').toLowerCase();
                  return (
                    t.startsWith('are you there') ||
                    t.includes("couldn't get any response from you") ||
                    t.includes('couldn’t get any response from you') ||
                    t.includes("didn't get any response from you") ||
                    t.includes('didn’t get any response from you') ||
                    t.includes("haven't been able to hear any response") ||
                    t.includes('haven’t been able to hear any response') ||
                    t.includes("if you're there, please start speaking") ||
                    t.includes('if you’re there, please start speaking')
                  );
                };
                for (const m of messages) {
                  if (m.role === 'assistant') {
                    // Interstitial → show in transcript but with NO Q label, and leave
                    // the running question label untouched so the candidate's next
                    // answer stays attributed to the real question.
                    if (isInterstitialMsg(m)) {
                      labeled.push({ msg: m, label: '', isFollowUp: false, qtype: 'interstitial' });
                      continue;
                    }
                    const intent = _lookupIntent(m.content);
                    const isDd = intent === 'deep_dive';
                    const isFu = !isDd && (intent === 'follow_up' || intent === 'probe' || !!m.is_follow_up);
                    const isCl = !isDd && !isFu && isClarificationMsg(m);
                    const isClosing = !isDd && !isFu && !isCl && isClosingMsg(m);
                    if (isClosing) {
                      currentLabel = 'End';
                      currentQtype = 'closing';
                    } else if (isDd) {
                      ddCounter += 1;
                      currentLabel = `D${ddCounter}`;
                      currentQtype = 'deepdive';
                    } else if (isFu) {
                      fuCounter += 1;
                      currentLabel = `F${fuCounter}`;
                      currentQtype = 'followup';
                    } else if (isCl) {
                      clCounter += 1;
                      currentLabel = `CL${clCounter}`;
                      currentQtype = 'main'; // clarification stays inside its parent Q's group
                    } else {
                      mainCount += 1;
                      currentLabel = m.question_id || `Q${mainCount}`;
                      currentQtype = 'main';
                      fuCounter = 0;
                      ddCounter = 0;
                      clCounter = 0;
                    }
                  }
                  labeled.push({ msg: m, label: currentLabel, isFollowUp: currentQtype !== 'main', qtype: currentQtype });
                }

                // Plain render helper (not a component) — the white indicator
                // behind the buttons slides between them.
                const toggleBtn = (value: 'chat' | 'table', label: string, icon: React.ReactNode) => (
                  <button
                    onClick={() => setTranscriptView(value)}
                    aria-pressed={transcriptView === value}
                    className={`relative z-10 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-300 ${
                      transcriptView === value ? 'text-brand-blue' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {icon}
                    {label}
                  </button>
                );

                // What each chat bubble shows — shared by the Chat view and the
                // chat download so the file says exactly what the screen says.
                const chatItems = labeled.map(({ msg, qtype }, idx) => {
                  const isAssistant = msg.role === 'assistant';
                  const ts = formatTs(msg.timestamp);
                  const content = msg.content as string;
                  // Prefer the VERBATIM Original ASR (untouched STT output —
                  // keeps fillers + any non-English the engine produced). Fall
                  // back to the salvaged raw, then content, for older records.
                  const rawContent: string | undefined = !isAssistant ? (msg.original_asr || msg.raw_content) : undefined;
                  const language: string | undefined = !isAssistant ? msg.language : undefined;
                  // Non-English discard: candidate responded but there was no
                  // scorable English → Original ASR shows verbatim, Corrected empty.
                  const noScorableEnglish = !isAssistant && !!msg.discarded_non_english && !(content || '').trim() && !!(rawContent || '').trim();
                  const hasCorrection = !isAssistant && !noScorableEnglish && rawContent && rawContent !== content;
                  const diff = hasCorrection ? diffWords(rawContent || '', content) : null;
                  // For a Bina question that was skipped, show WHY. A
                  // question is "answered" when the NEXT chat message is a
                  // real candidate reply; otherwise it was skipped and
                  // _skipReason explains how. Only on assistant question
                  // bubbles (never closing / clarification rephrases).
                  // Skip past interstitial nudges to find the real next turn,
                  // so a question answered only after "Are you there?" still
                  // reads as answered (not skipped).
                  let _niIdx = idx + 1;
                  while (_niIdx < labeled.length && labeled[_niIdx]?.qtype === 'interstitial') _niIdx++;
                  const _nextMsg = labeled[_niIdx]?.msg;
                  // A non-English discard turn IS a response (just not scorable),
                  // so the question shows the Original ASR below it, not "No response".
                  const _answered = !!_nextMsg && _nextMsg.role === 'user' && (
                    !!(_nextMsg.content || '').trim()
                    || (_nextMsg.discarded_non_english && !!(_nextMsg.original_asr || _nextMsg.raw_content || '').trim())
                  );
                  const skipNote = isAssistant && qtype !== 'closing' && qtype !== 'interstitial' && !isClarificationMsg(msg)
                    ? _skipReason(content, _answered)
                    : null;
                  return { isAssistant, ts, content, rawContent, language, noScorableEnglish, hasCorrection, diff, skipNote };
                });

                // Full chat download (PDF / TXT) — every message in order (Bina +
                // candidate), independent of the Table view's grouped Q/A export.
                const downloadChat = async (format: ExportFileFormat) => {
                  // Candidate details — same sources as the header card above.
                  const details: [label: string, value: string][] = [];
                  const addDetail = (label: string, value: unknown) => {
                    if (value !== null && value !== undefined && String(value).trim()) details.push([label, String(value)]);
                  };
                  addDetail('Candidate', interview.candidate_name || 'Unknown Candidate');
                  addDetail('CID', interview.candidate_cid || liveSession.candidate_cid || fetchedCid);
                  addDetail('Email', interview.candidate_email || liveSession.candidate_email);
                  addDetail('Job', interview.position || (interview as any).jd_title || (liveSession as any).jd_title);
                  addDetail('Status', getStatusLabel(interview.status));
                  addDetail('Mode', isFlexibleMode ? 'Conversational Mode' : 'Timed Mode');
                  if (interview.completed_at) {
                    addDetail('Completed', `${formatISTDate(interview.completed_at)}, ${formatISTTime(interview.completed_at).toLowerCase()}`);
                  }
                  addDetail('Time Taken', formatDuration(eval_.duration_minutes || interview.duration_minutes));
                  {
                    const start = liveSession.started_at || interview.started_at;
                    const end = liveSession.completed_at || interview.completed_at;
                    let secs = start && end ? Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000) : NaN;
                    if (!Number.isFinite(secs) || secs <= 0) {
                      const mins = Number(eval_.duration_minutes);
                      secs = Number.isFinite(mins) && mins > 0 ? Math.round(mins * 60) : NaN;
                    }
                    if (Number.isFinite(secs) && secs > 0) {
                      const h = Math.floor(secs / 3600);
                      const m = Math.floor((secs % 3600) / 60);
                      const sec = secs % 60;
                      addDetail('Duration', h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m${sec ? ` ${sec}s` : ''}` : `${sec}s`);
                    }
                  }
                  // Result — only when the header card shows a final verdict.
                  let result: { passed: boolean; score: number } | undefined;
                  if ((isCompleted || isPartial) && !evaluationPending && !getPlaceholderMessage('eval')) {
                    const d = buildQuestionAnalysisData();
                    if (!d.isPartialEvaluation) {
                      const passed = d.finalResult ? d.finalResult === 'Pass' : d.scores.mustHave >= MHS_THRESHOLD;
                      result = { passed, score: Math.round(d.scores.mustHave * 10) };
                      addDetail('Result', `${passed ? 'Pass' : 'Fail'} (Match Score ${result.score}%)`);
                    }
                  }
                  addDetail('Messages', String(labeled.length));

                  const fileName = `chat_transcript_${candidateName}_${liveSession.id.slice(0, 8)}`.replace(/\s+/g, '_');
                  // Each bubble exactly as the Chat view renders it.
                  const messages: ChatPdfMessage[] = labeled.map(({ label, isFollowUp, qtype }, idx) => {
                    const it = chatItems[idx];
                    const kind = qtype === 'deepdive' ? 'deepdive' as const : isFollowUp ? 'followup' as const : 'main' as const;
                    if (it.isAssistant) {
                      return {
                        speaker: 'bina' as const, label, kind, text: it.content || '', time: it.ts,
                        skipNote: it.skipNote ? { text: it.skipNote.text, amber: it.skipNote.tone === 'amber' } : undefined,
                      };
                    }
                    return {
                      speaker: 'candidate' as const, label, kind, language: it.language, time: it.ts,
                      original: it.rawContent || it.content || '',
                      corrected: it.content || '',
                      noScorableEnglish: it.noScorableEnglish,
                      fullSentenceRewrite: !!(it.hasCorrection && it.diff && it.diff.mode === 'sentence'),
                    };
                  });

                  if (format === 'pdf') {
                    const detail = (label: string) => details.find(([l]) => l === label)?.[1] || '';
                    await downloadChatTranscriptPdf({
                      candidateName,
                      status: detail('Status'),
                      mode: detail('Mode'),
                      identity: [detail('CID'), detail('Email'), detail('Job')],
                      timing: [
                        detail('Completed') && `Completed ${detail('Completed')}`,
                        detail('Time Taken') && `Time taken: ${detail('Time Taken')}`,
                        detail('Duration') && `Duration: ${detail('Duration')}`,
                      ],
                      result,
                      messages,
                    }, fileName);
                    // Audit the browser-built PDF; fire-and-forget so the download never breaks.
                    api.post(`/ai-interview/${liveSession.id}/log-client-download`, { kind: 'transcript_pdf' }).catch(() => {});
                    return;
                  }

                  // TXT — details block, then each bubble in order.
                  const width = Math.max(...details.map(([l]) => l.length));
                  const rule = '='.repeat(60);
                  const text = [
                    'CHAT TRANSCRIPT',
                    rule,
                    ...details.map(([l, v]) => `${l.padEnd(width)} : ${v}`),
                    rule,
                    '',
                    ...messages.flatMap(m => {
                      const who = m.speaker === 'bina' ? 'Bina (AI Interviewer)' : candidateName;
                      const head = [m.label && `[${m.label}]`, who, m.speaker === 'candidate' && m.language && `(${m.language})`, m.time && `— ${m.time}`]
                        .filter(Boolean).join(' ');
                      const lines = m.speaker === 'bina'
                        ? [m.text, ...(m.skipNote ? [`>> ${m.skipNote.text}`] : [])]
                        : [
                            `Original (ASR): ${m.original}`,
                            `Corrected: ${m.noScorableEnglish ? '— no scorable English (not scored)' : m.corrected}`,
                            ...(m.fullSentenceRewrite ? ['(full-sentence rewrite)'] : []),
                          ];
                      return [head, ...lines, ''];
                    }),
                  ].join('\r\n');
                  exportTextFile(text, fileName);
                };

                return (
                  <div className="w-full">
                    {/* Header with view toggle */}
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b border-gray-100">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-brand-blue ring-1 ring-white/20 shadow-sm shadow-brand-blue/20 flex items-center justify-center text-white font-semibold text-2xs">
                            B
                          </div>
                          <span className="tf-meta">Bina (AI Interviewer)</span>
                        </div>
                        <span className="text-gray-200">·</span>
                        <div className="flex items-center gap-2">
                          <NameAvatar name={candidateName} size="sm" />
                          <span className="tf-meta">{candidateName}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="tf-hint">{messages.length} messages</span>
                        <div className="relative inline-grid grid-cols-2 bg-slate-100 rounded-lg p-0.5 ring-1 ring-slate-200">
                          <span
                            aria-hidden
                            className={`absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%-0.125rem)] rounded-md bg-white shadow-sm ring-1 ring-brand-blue/15 transition-transform duration-300 ease-out motion-reduce:transition-none ${
                              transcriptView === 'table' ? 'translate-x-full' : 'translate-x-0'
                            }`}
                          />
                          {toggleBtn('chat', 'Chat', <MessageSquare className="w-3.5 h-3.5" />)}
                          {toggleBtn('table', 'Table', <Layers className="w-3.5 h-3.5" />)}
                        </div>
                        {transcriptView === 'chat' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            // Chat transcript download is a report download (2026-11-10).
                            onClick={() => { if (canDownloadReports) setChatDownloadOpen(true); }}
                            aria-disabled={!canDownloadReports}
                            title={canDownloadReports ? 'Download full chat transcript' : "You can view this interview, but your role can't download reports"}
                            className={!canDownloadReports ? 'opacity-50 cursor-not-allowed' : undefined}
                          >
                            <Download className="w-3.5 h-3.5" />
                            Chat Download
                          </Button>
                        )}
                        {/* The AI Interview Results Export popup's look (white
                            header, format cards), with no columns to pick. */}
                        {chatDownloadOpen && (
                          <ExportColumnsModal<'pdf' | 'txt'>
                            title="Download Chat Transcript"
                            recordCount={labeled.length}
                            recordNoun={['message', 'messages']}
                            formats={CHAT_DOWNLOAD_FORMATS}
                            format={chatDownloadFormat}
                            onFormatChange={setChatDownloadFormat}
                            exporting={chatDownloading}
                            onExport={async () => {
                              setChatDownloading(true);
                              try {
                                await downloadChat(chatDownloadFormat);
                                setChatDownloadOpen(false);
                              } catch (error) {
                                console.error('Chat download failed:', error);
                                toast.error(`Failed to download the chat as ${chatDownloadFormat === 'pdf' ? 'PDF' : 'text'}`);
                              } finally {
                                setChatDownloading(false);
                              }
                            }}
                            onClose={() => setChatDownloadOpen(false)}
                          />
                        )}
                      </div>
                    </div>

                    {transcriptView === 'chat' && (
                      <div className="space-y-4 w-full animate-in fade-in duration-300 motion-reduce:animate-none">
                        {labeled.map(({ msg, label, isFollowUp, qtype }, idx) => {
                          const { isAssistant, ts, content, rawContent, language, noScorableEnglish, hasCorrection, diff, skipNote } = chatItems[idx];

                          return (
                            <div
                              key={idx}
                              className={`flex gap-2.5 ${isAssistant ? '' : 'flex-row-reverse'} ${isFollowUp ? `pl-6 border-l-2 ml-3 ${qtype === 'deepdive' ? 'border-brand-teal/30' : 'border-brand-cyan/30'}` : ''}`}
                            >
                              {isAssistant ? (
                                <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold mt-0.5 ring-1 ring-white/20 shadow-sm bg-brand-blue text-white shadow-brand-blue/20">
                                  B
                                </div>
                              ) : (
                                <NameAvatar name={candidateName} size="sm" className="mt-0.5" />
                              )}

                              <div className={`max-w-[75%] ${isAssistant ? '' : 'items-end flex flex-col'}`}>
                                {(label || language) && (
                                  <div className={`flex items-center gap-1.5 mb-1 ${isAssistant ? '' : 'flex-row-reverse'}`}>
                                    {label && (
                                      <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded leading-none ring-1 ${
                                        qtype === 'deepdive' ? 'bg-brand-teal/10 text-brand-teal ring-brand-teal/20' : isFollowUp ? 'bg-brand-cyan/10 text-brand-cyan ring-brand-cyan/20' : 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20'
                                      }`}>
                                        {label}
                                      </span>
                                    )}
                                    {language && !isAssistant && (
                                      <span className="text-2xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 ring-1 ring-slate-200 leading-none">
                                        {language}
                                      </span>
                                    )}
                                  </div>
                                )}

                                {isAssistant ? (
                                  <>
                                    <div className="px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed bg-[#08132e]/5 text-[#08132e] rounded-tl-sm whitespace-pre-line">
                                      {content}
                                    </div>
                                    {skipNote && (
                                      <div
                                        className={`mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-2xs font-medium ring-1 ${
                                          skipNote.tone === 'amber'
                                            ? 'bg-warning-subtle text-warning ring-warning-line'
                                            : 'bg-slate-50 text-slate-500 ring-slate-200'
                                        }`}
                                      >
                                        <SkipForward className="w-3 h-3" />
                                        {skipNote.text}
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    {/* Original (raw ASR) — ALWAYS shown, even when the
                                        enhancer made no change, so the recruiter can always
                                        see exactly what the ASR engine produced. */}
                                    <div className="px-4 py-3 rounded-2xl rounded-tr-sm text-sm leading-relaxed bg-sky-50 border border-sky-200 text-gray-800">
                                      <div className="flex items-center gap-1.5 mb-1.5 text-xs font-bold text-sky-700 uppercase tracking-wide">
                                        <AudioLines className="w-4 h-4" /> Original (ASR)
                                      </div>
                                      {hasCorrection && diff && diff.mode === 'word'
                                        ? <DiffText parts={diff.raw} tone="raw" />
                                        : <span>{rawContent || content}</span>}
                                    </div>
                                    {/* Corrected — ALWAYS shown below. When identical to the
                                        raw ASR it simply repeats the same text (no correction).
                                        For a non-English discard there is no scorable English,
                                        so it shows a muted "not scored" marker instead of text. */}
                                    <div className="mt-2 px-4 py-3 rounded-2xl text-sm leading-relaxed bg-success-subtle/70 border border-success-line text-gray-800">
                                      <div className="flex items-center gap-1.5 mb-1.5 text-xs font-bold text-success uppercase tracking-wide">
                                        <span className="grid place-items-center w-4 h-4 rounded-full bg-success text-white">
                                          <Check className="w-2.5 h-2.5" strokeWidth={3.5} />
                                        </span>
                                        Corrected
                                      </div>
                                      {noScorableEnglish
                                        ? <span className="italic text-gray-500">— no scorable English (not scored)</span>
                                        : hasCorrection && diff && diff.mode === 'word'
                                          ? <DiffText parts={diff.corrected} tone="corrected" />
                                          : <span>{content}</span>}
                                    </div>
                                    {hasCorrection && diff && diff.mode === 'sentence' && (
                                      <div className="text-2xs text-brand-orange-deep mt-1 pr-1 text-right italic">full-sentence rewrite</div>
                                    )}
                                  </>
                                )}

                                {ts && (
                                  <div className={`text-2xs text-gray-400 mt-1 ${isAssistant ? 'pl-1' : 'pr-1 text-right'}`}>
                                    {ts}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {transcriptView === 'table' && (() => {
                      // Group messages into { mainQ + mainAnswer + [follow-ups] } blocks.
                      // Each group becomes ONE table row. Follow-ups render as nested
                      // Q/A sub-blocks inside the parent row's raw/corrected cells.
                      //
                      // Build intent lookup from question_history (same approach as chat view).
                      const _tblIntentMap = new Map<string, string>();
                      const _tblQh = (eval_.question_history || []) as any[];
                      for (const qh of _tblQh) {
                        if (qh.question) {
                          const key = (qh.question as string).trim().slice(0, 60);
                          const intent = (qh.question_intent || '').toLowerCase();
                          if (intent) _tblIntentMap.set(key, intent);
                          if (!intent && qh.is_follow_up) _tblIntentMap.set(key, 'follow_up');
                        }
                      }
                      for (let i = 1; i < _tblQh.length; i++) {
                        const cur = _tblQh[i];
                        const prv = _tblQh[i - 1];
                        if (cur.question && cur.question_number != null && prv.question_number != null
                            && String(cur.question_number) === String(prv.question_number)) {
                          const key = (cur.question as string).trim().slice(0, 60);
                          if (!_tblIntentMap.has(key)) _tblIntentMap.set(key, 'follow_up');
                        }
                      }
                      const _tblLookup = (content: string): string => {
                        if (!content) return '';
                        const key = content.trim().slice(0, 60);
                        if (_tblIntentMap.has(key)) return _tblIntentMap.get(key)!;
                        for (const [k, v] of _tblIntentMap) {
                          if (key.startsWith(k.slice(0, 40)) || k.startsWith(key.slice(0, 40))) return v;
                        }
                        return '';
                      };

                      type SubType = 'followup' | 'deepdive' | 'clarification';
                      type FU = {
                        label: string;
                        question: string;
                        raw: string;
                        corrected: string;
                        language: string;
                        timestamp: string;
                        subType: SubType;
                      };
                      type Group = {
                        mainLabel: string;
                        mainQuestion: string;
                        mainRaw: string;
                        mainCorrected: string;
                        language: string;
                        timestamp: string;
                        followUps: FU[];
                      };
                      const groups: Group[] = [];
                      let current: Group | null = null;
                      let pendingAI: { label: string; text: string; isSub: boolean; subType: SubType } | null = null;
                      let _tblFuCtr = 0;
                      let _tblDdCtr = 0;
                      let _tblClCtr = 0;
                      const _tblIsClarif = (m: any): boolean => {
                        if (m.is_clarification === true) return true;
                        const t = (m.content || '').toLowerCase().trim();
                        return (
                          t.startsWith("let's stick to this question") ||
                          t.startsWith("let me put it another way") ||
                          t.startsWith("to put it differently") ||
                          t.startsWith("let me rephrase")
                        );
                      };
                      const _tblIsClosing = (m: any): boolean => {
                        if (m.is_closing === true || m.kind === 'closing') return true;
                        const t = (m.content || '').toLowerCase();
                        return (
                          t.includes('thank you for completing the interview') ||
                          t.includes('thank you for your time today') ||
                          (t.includes('your responses have been recorded') && t.includes('wish you all the best'))
                        );
                      };
                      // Informative / silence-ladder utterances — not questions.
                      // Skipped entirely in the table view so they never occupy a Q row
                      // (mirrors the chat view's isInterstitialMsg).
                      const _tblIsInterstitial = (m: any): boolean => {
                        if (m.interstitial === true) return true;
                        if (String(m.kind || '').toLowerCase().startsWith('silence')) return true;
                        const t = (m.content || '').toLowerCase();
                        return (
                          t.startsWith('are you there') ||
                          t.includes("couldn't get any response from you") ||
                          t.includes('couldn’t get any response from you') ||
                          t.includes("didn't get any response from you") ||
                          t.includes('didn’t get any response from you') ||
                          t.includes("haven't been able to hear any response") ||
                          t.includes('haven’t been able to hear any response') ||
                          t.includes("if you're there, please start speaking") ||
                          t.includes('if you’re there, please start speaking')
                        );
                      };

                      for (const m of messages) {
                        if (m.role === 'assistant') {
                          // Interstitial nudge → leave current group + pendingAI intact
                          // so the candidate's answer attaches to the real question.
                          if (_tblIsInterstitial(m)) continue;
                          const _tblMsgIntent = _tblLookup(m.content);
                          const isDd = _tblMsgIntent === 'deep_dive';
                          const isFu = !isDd && (_tblMsgIntent === 'follow_up' || _tblMsgIntent === 'probe' || !!m.is_follow_up);
                          const isCl = !isDd && !isFu && _tblIsClarif(m);
                          const isClosing = !isDd && !isFu && !isCl && _tblIsClosing(m);
                          if (isClosing) {
                            // Close out the previous Q group, then start a standalone
                            // 'End' group so the closing message renders as its own
                            // row in the table with type='End' (not a Q number).
                            if (current) groups.push(current);
                            current = {
                              mainLabel: 'End',
                              mainQuestion: m.content || '',
                              mainRaw: '',
                              mainCorrected: '',
                              language: '',
                              timestamp: m.timestamp || '',
                              followUps: [],
                            };
                            pendingAI = { label: 'End', text: m.content || '', isSub: false, subType: 'followup' };
                            _tblFuCtr = 0;
                            _tblDdCtr = 0;
                            _tblClCtr = 0;
                            continue;
                          }
                          if (isDd) {
                            _tblDdCtr += 1;
                            if (!current) {
                              current = { mainLabel: 'Q?', mainQuestion: '', mainRaw: '', mainCorrected: '', language: '', timestamp: m.timestamp || '', followUps: [] };
                            }
                            pendingAI = { label: `D${_tblDdCtr}`, text: m.content || '', isSub: true, subType: 'deepdive' };
                          } else if (isFu) {
                            _tblFuCtr += 1;
                            if (!current) {
                              current = { mainLabel: 'Q?', mainQuestion: '', mainRaw: '', mainCorrected: '', language: '', timestamp: m.timestamp || '', followUps: [] };
                            }
                            pendingAI = { label: `F${_tblFuCtr}`, text: m.content || '', isSub: true, subType: 'followup' };
                          } else if (isCl) {
                            _tblClCtr += 1;
                            if (!current) {
                              current = { mainLabel: 'Q?', mainQuestion: '', mainRaw: '', mainCorrected: '', language: '', timestamp: m.timestamp || '', followUps: [] };
                            }
                            pendingAI = { label: `CL${_tblClCtr}`, text: m.content || '', isSub: true, subType: 'clarification' };
                          } else {
                            if (current) groups.push(current);
                            const lbl = m.question_id || `Q${groups.length + 1}`;
                            current = {
                              mainLabel: lbl,
                              mainQuestion: m.content || '',
                              mainRaw: '',
                              mainCorrected: '',
                              language: '',
                              timestamp: m.timestamp || '',
                              followUps: [],
                            };
                            pendingAI = { label: lbl, text: m.content || '', isSub: false, subType: 'followup' };
                            _tblFuCtr = 0;
                            _tblDdCtr = 0;
                            _tblClCtr = 0;
                          }
                        } else if (m.role === 'user' && current) {
                          const raw = (m.original_asr || m.raw_content || m.content || '') as string;
                          const corrected = (m.content || '') as string;
                          if (pendingAI && pendingAI.isSub) {
                            current.followUps.push({
                              label: pendingAI.label,
                              question: pendingAI.text,
                              raw,
                              corrected,
                              language: m.language || 'English',
                              timestamp: m.timestamp || '',
                              subType: pendingAI.subType,
                            });
                          } else {
                            current.mainRaw = raw;
                            current.mainCorrected = corrected;
                            current.language = m.language || 'English';
                            // Timestamp = when the candidate response was stored,
                            // not when the AI question was asked. Always overwrite.
                            current.timestamp = m.timestamp || current.timestamp;
                          }
                          pendingAI = null;
                        }
                      }
                      if (current) groups.push(current);

                      // ── Export helpers ────────────────────────────────────────
                      // Flatten groups into sequential rows: one main row + one row per follow-up.
                      // Follow-ups keep the parent's Question ID (e.g. Q1) and are tagged Type="Follow-up".
                      type RowType = 'Main' | 'Followup' | 'Deep Dive' | 'Clarification' | 'End';
                      type FlatRow = {
                        sno: number;
                        questionId: string;
                        type: RowType;
                        question: string;
                        raw: string;
                        corrected: string;
                        language: string;
                        timestamp: string;
                      };
                      const flatRows: FlatRow[] = [];
                      let sno = 0;
                      for (const g of groups) {
                        sno += 1;
                        flatRows.push({
                          sno,
                          questionId: g.mainLabel,
                          type: g.mainLabel === 'End' ? 'End' : 'Main',
                          question: g.mainQuestion,
                          raw: g.mainRaw,
                          corrected: g.mainCorrected,
                          language: g.language,
                          timestamp: g.timestamp,
                        });
                        for (const fu of g.followUps) {
                          sno += 1;
                          flatRows.push({
                            sno,
                            questionId: g.mainLabel,
                            type: fu.subType === 'deepdive' ? 'Deep Dive'
                                : fu.subType === 'clarification' ? 'Clarification'
                                : 'Followup',
                            question: fu.question,
                            raw: fu.raw,
                            corrected: fu.corrected,
                            language: fu.language,
                            timestamp: fu.timestamp,
                          });
                        }
                      }
                      const TRANSCRIPT_EXPORT_HEADERS = ['S.No', 'Question ID', 'Type', 'Question', 'Raw Transcript', 'Corrected Transcript', 'Language', 'Timestamp'];
                      const buildRows = () => flatRows.map(r => [
                        String(r.sno),
                        r.questionId,
                        r.type,
                        r.question,
                        r.raw,
                        r.corrected,
                        r.language,
                        formatTs(r.timestamp),
                      ]);
                      const baseName = `transcript_${interview.candidate_name || 'candidate'}_${liveSession.id.slice(0, 8)}`.replace(/\s+/g, '_');
                      const exportTranscript = async (format: ExportFileFormat) => {
                        const rows = buildRows();
                        if (rows.length === 0) return;
                        await exportRows(format, TRANSCRIPT_EXPORT_HEADERS, rows, baseName, { sheetName: 'Transcript' });
                      };

                      return (
                        <div className="space-y-3 animate-in fade-in duration-300 motion-reduce:animate-none">
                          {/* Toolbar — Expand all (Question + Raw Transcript), then Export */}
                          <div className="flex justify-end items-center gap-2 relative">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setTranscriptExpanded(v => !v)}
                              disabled={flatRows.length === 0}
                              aria-pressed={transcriptExpanded}
                              title={transcriptExpanded ? 'Collapse all questions and transcripts' : 'Expand all questions and transcripts'}
                            >
                              {transcriptExpanded
                                ? <ChevronsDownUp className="w-3.5 h-3.5" />
                                : <ChevronsUpDown className="w-3.5 h-3.5" />}
                              {transcriptExpanded ? 'Collapse all' : 'Expand all'}
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => setExportMenuOpen(true)}
                              disabled={groups.length === 0}
                            >
                              <Download className="w-3.5 h-3.5" />
                              Export
                            </Button>
                            <ExportFormatModal
                              open={exportMenuOpen}
                              onClose={() => setExportMenuOpen(false)}
                              title="Export Transcript"
                              recordCount={flatRows.length}
                              columns={TRANSCRIPT_EXPORT_HEADERS}
                              onExport={exportTranscript}
                            />
                          </div>

                          {/* Scrolls on its own (max 70vh) so the header row can
                              stay pinned to the top while the rows scroll. */}
                          <div className={`overflow-auto max-h-[70vh] tf-card-soft tf-table-shell ${DESKTOP_TABLE_ONLY}`}>
                            <table className="w-full text-sm">
                              <thead className="bg-white tf-meta">
                                <tr>
                                  {/* Every header cell sticks to the top. Question ID (left)
                                      and Timestamp (right) also stay pinned sideways, so
                                      they sit above the rest (z-30). The inset shadows
                                      draw the borders, which sticky cells don't keep. */}
                                  <th className="tf-th-cell text-left font-semibold w-20 sticky top-0 left-0 z-30 bg-white shadow-[inset_-1px_-1px_0_#e5e7eb]">Question ID</th>
                                  <th className="tf-th-cell text-left font-semibold w-24 sticky top-0 z-20 bg-white shadow-[inset_0_-1px_0_#e5e7eb]">Type</th>
                                  <th className="tf-th-cell text-left font-semibold sticky top-0 z-20 bg-white shadow-[inset_0_-1px_0_#e5e7eb]">Question</th>
                                  <th className="tf-th-cell text-left font-semibold sticky top-0 z-20 bg-white shadow-[inset_0_-1px_0_#e5e7eb]">Raw Transcript</th>
                                  <th className="tf-th-cell text-left font-semibold sticky top-0 z-20 bg-white shadow-[inset_0_-1px_0_#e5e7eb]">Corrected Transcript</th>
                                  <th className="tf-th-cell text-left font-semibold w-20 sticky top-0 z-20 bg-white shadow-[inset_0_-1px_0_#e5e7eb]">Language</th>
                                  <th className="tf-th-cell text-left font-semibold w-20 sticky top-0 right-0 z-30 bg-white shadow-[inset_1px_-1px_0_#e5e7eb]">Timestamp</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {flatRows.map((r, idx) => {
                                  const diff = r.raw && r.corrected ? diffWords(r.raw, r.corrected) : null;
                                  const isFu = r.type === 'Followup';
                                  const isDd = r.type === 'Deep Dive';
                                  const isSub = isFu || isDd;
                                  // No transcript for this row → it was skipped;
                                  // surface WHY (candidate "Next Question" vs the
                                  // "Are you there?" silence flow vs timeout). The
                                  // empty raw+corrected IS the "not answered" signal.
                                  const _rowAnswered = !!(r.raw?.trim() || r.corrected?.trim());
                                  const rowSkip = _skipReason(r.question, _rowAnswered);
                                  // Sticky cells need an opaque fill — the row tints are
                                  // translucent (brand-teal/5, brand-cyan/5), so these are
                                  // the same tints pre-blended over white.
                                  const stickyBg = isDd ? 'bg-[#f3fafb]' : isFu ? 'bg-[#f3fafc]' : 'bg-white';
                                  return (
                                    <tr key={idx} className={`align-top ${isDd ? 'bg-brand-teal/5' : isFu ? 'bg-brand-cyan/5' : 'bg-white'}`}>
                                      <td className={`px-3 py-3 align-top sticky left-0 z-10 ${stickyBg} shadow-[inset_-1px_0_0_#e5e7eb]`}>
                                        <span className="text-2xs font-semibold px-1.5 py-0.5 rounded bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">
                                          {r.questionId}
                                        </span>
                                      </td>
                                      <td className="tf-td align-top">
                                        <span className={`text-2xs font-medium px-1.5 py-0.5 rounded ring-1 ${
                                          isDd ? 'bg-brand-teal/10 text-brand-teal ring-brand-teal/20' : isFu ? 'bg-brand-cyan/10 text-brand-cyan ring-brand-cyan/20' : 'bg-slate-100 text-slate-600 ring-slate-200'
                                        }`}>
                                          {r.type}
                                        </span>
                                      </td>
                                      <td className={`px-3 py-3 align-top text-xs text-gray-700 leading-snug ${transcriptExpanded ? 'min-w-[280px]' : ''}`}>
                                        <TruncatedTextCell
                                          text={r.question}
                                          expanded={transcriptExpanded}
                                          textClassName="italic"
                                        />
                                      </td>
                                      <td className={`px-3 py-3 align-top text-brand-orange-deep leading-snug ${transcriptExpanded ? 'min-w-[280px]' : ''}`}>
                                        {rowSkip && !(diff && diff.mode === 'word')
                                          ? <span className="text-gray-400">—</span>
                                          : (
                                            // Collapsed: 4-word pill + hover box. Expanded (or
                                            // short): the existing diff / plain rendering.
                                            <TruncatedTextCell text={r.raw} expanded={transcriptExpanded}>
                                              {diff && diff.mode === 'word'
                                                ? <DiffText parts={diff.raw} tone="raw" />
                                                : <span className="text-gray-700">{r.raw || '—'}</span>}
                                            </TruncatedTextCell>
                                          )}
                                      </td>
                                      <td className="tf-td align-top text-gray-800 leading-snug">
                                        {diff && diff.mode === 'word'
                                          ? <DiffText parts={diff.corrected} tone="corrected" />
                                          : rowSkip
                                            ? <span className={`inline-flex items-center gap-1.5 text-2xs font-medium ${rowSkip.tone === 'amber' ? 'text-warning' : 'text-slate-500'}`}>
                                                <SkipForward className="w-3 h-3" />{rowSkip.text}
                                              </span>
                                            : <span>{r.corrected || '—'}</span>}
                                      </td>
                                      <td className="tf-td align-top tf-meta">{r.language || 'English'}</td>
                                      <td className={`px-3 py-3 align-top text-xs text-gray-500 whitespace-nowrap sticky right-0 z-10 ${stickyBg} shadow-[inset_1px_0_0_#e5e7eb]`}>{formatTs(r.timestamp)}</td>
                                    </tr>
                                  );
                                })}
                                {flatRows.length === 0 && (
                                  <tr><td colSpan={7} className="tf-td text-center tf-hint">No candidate responses recorded.</td></tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                          <MobileRecordList empty={<p className="tf-td text-center tf-hint">No candidate responses recorded.</p>}>
                            {flatRows.map((r, idx) => {
                              const diff = r.raw && r.corrected ? diffWords(r.raw, r.corrected) : null;
                              const isFu = r.type === 'Followup';
                              const isDd = r.type === 'Deep Dive';
                              const _rowAnswered = !!(r.raw?.trim() || r.corrected?.trim());
                              const rowSkip = _skipReason(r.question, _rowAnswered);
                              return (
                                <MobileRecordCard
                                  key={idx}
                                  className={isDd ? 'bg-brand-teal/5' : isFu ? 'bg-brand-cyan/5' : undefined}
                                  idBadge={
                                    <span className="text-2xs font-semibold px-1.5 py-0.5 rounded bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">
                                      {r.questionId}
                                    </span>
                                  }
                                  badges={
                                    <span className={`text-2xs font-medium px-1.5 py-0.5 rounded ring-1 ${
                                      isDd ? 'bg-brand-teal/10 text-brand-teal ring-brand-teal/20' : isFu ? 'bg-brand-cyan/10 text-brand-cyan ring-brand-cyan/20' : 'bg-slate-100 text-slate-600 ring-slate-200'
                                    }`}>
                                      {r.type}
                                    </span>
                                  }
                                  wrapTitle
                                  title={
                                    <span className="block whitespace-normal text-sm font-normal italic text-gray-700 leading-snug">
                                      <TruncatedTextCell text={r.question} expanded={transcriptExpanded} textClassName="italic" />
                                    </span>
                                  }
                                  fields={[
                                    {
                                      label: 'Raw Transcript',
                                      value: rowSkip && !(diff && diff.mode === 'word')
                                        ? '—'
                                        : (
                                          <span className="text-brand-orange-deep">
                                            <TruncatedTextCell text={r.raw} expanded={transcriptExpanded}>
                                              {diff && diff.mode === 'word'
                                                ? <DiffText parts={diff.raw} tone="raw" />
                                                : <span className="text-gray-700">{r.raw || '—'}</span>}
                                            </TruncatedTextCell>
                                          </span>
                                        ),
                                    },
                                    {
                                      label: 'Corrected Transcript',
                                      value: diff && diff.mode === 'word'
                                        ? <DiffText parts={diff.corrected} tone="corrected" />
                                        : rowSkip
                                          ? <span className={`inline-flex items-center gap-1.5 text-2xs font-medium ${rowSkip.tone === 'amber' ? 'text-warning' : 'text-slate-500'}`}>
                                              <SkipForward className="w-3 h-3" />{rowSkip.text}
                                            </span>
                                          : <span className="text-gray-800">{r.corrected || '—'}</span>,
                                    },
                                    { label: 'Language', value: r.language || 'English' },
                                    { label: 'Timestamp', value: formatTs(r.timestamp) },
                                  ]}
                                />
                              );
                            })}
                          </MobileRecordList>
                        </div>
                      );
                    })()}
                  </div>
                );
              })()
            )}
            {/* Evaluation Tab */}
            {!evaluationPending && activeTab === 'evaluation' && (
              <EvaluationTab
                sessionId={liveSession.id}
                aiEvaluation={eval_}
                isCompleted={liveSession.status === 'completed'}
              />
            )}

            {/* Evaluation Report Tab — Vite design (V2). Wired to live DashboardData. */}
            {/* Eval Tab — combined Overview + Evaluation Report (deduped) + PDF export */}
            {!evaluationPending && activeTab === 'eval' && (() => {
              const placeholderMsg = getPlaceholderMessage('eval');
              if (placeholderMsg) return renderPlaceholder(placeholderMsg);
              const data = buildDashboardData({
                ai_evaluation: eval_,
                cluster_config: clusterConfig,
                candidate: {
                  name: interview.candidate_name || liveSession.candidate_name || 'Candidate',
                  role: (interview as any).job_title || (interview as any).role || interview.position || 'Candidate',
                  email: interview.candidate_email || liveSession.candidate_email,
                },
                interview: {
                  mode: (interview as any).special_instructions
                    ? (() => { try { const si = JSON.parse((interview as any).special_instructions); return si.interview_mode; } catch { return undefined; } })()
                    : undefined,
                  completed_at: liveSession.completed_at,
                  created_at: liveSession.created_at,
                },
                rounds_config: (interview as any).rounds_config || (liveSession as any).rounds_config,
                conversation_transcript: (liveSession as any).conversation_transcript || (interview as any).conversation_transcript,
                special_instructions: (interview as any).special_instructions || (liveSession as any).special_instructions,
              });
              const aiConfidence = typeof eval_.ai_confidence === 'number'
                ? eval_.ai_confidence
                : typeof eval_.confidence === 'number' ? eval_.confidence : null;
              return (
                <EvalReportCombined
                  data={data}
                  aiConfidence={aiConfidence}
                  candidateImage={identityPhotoUrl}
                  evaluationId={liveSession.display_id || null}
                  sessionId={liveSession.id}
                />
              );
            })()}

            {!evaluationPending && activeTab === 'eval_report' && (() => {
              const placeholderMsg = getPlaceholderMessage('eval_report');
              if (placeholderMsg) return renderPlaceholder(placeholderMsg);
              const data = buildDashboardData({
                ai_evaluation: eval_,
                cluster_config: clusterConfig,
                candidate: {
                  name: interview.candidate_name || liveSession.candidate_name || 'Candidate',
                  role: (interview as any).job_title || (interview as any).role || interview.position || 'Candidate',
                  email: interview.candidate_email || liveSession.candidate_email,
                },
                interview: {
                  mode: (interview as any).special_instructions
                    ? (() => { try { const si = JSON.parse((interview as any).special_instructions); return si.interview_mode; } catch { return undefined; } })()
                    : undefined,
                  completed_at: liveSession.completed_at,
                  created_at: liveSession.created_at,
                },
                rounds_config: (interview as any).rounds_config || (liveSession as any).rounds_config,
                conversation_transcript: (liveSession as any).conversation_transcript || (interview as any).conversation_transcript,
              });
              const aiConfidence = typeof eval_.ai_confidence === 'number'
                ? eval_.ai_confidence
                : typeof eval_.confidence === 'number'
                  ? eval_.confidence
                  : null;
              return (
                <EvaluationReportV2
                  data={data}
                  aiConfidence={aiConfidence}
                  evaluationId={liveSession.display_id || null}
                />
              );
            })()}
            {/* Old EvaluationReportTab (with PDF/Excel/JSON exports) — kept for reference:
            {!evaluationPending && activeTab === 'eval_report' && (
              <EvaluationReportTab
                sessionId={liveSession.id}
                aiEvaluation={eval_}
                isCompleted={liveSession.status === 'completed'}
                clusterConfig={clusterConfig}
                candidate={{
                  name: interview.candidate_name || liveSession.candidate_name || 'Candidate',
                  role: (interview as any).job_title || (interview as any).role || interview.position || 'Candidate',
                  email: interview.candidate_email || liveSession.candidate_email,
                }}
                interview={{
                  mode: (interview as any).special_instructions
                    ? (() => { try { const si = JSON.parse((interview as any).special_instructions); return si.interview_mode; } catch { return undefined; } })()
                    : undefined,
                  completed_at: liveSession.completed_at,
                  created_at: liveSession.created_at,
                }}
              />
            )}
            */}

            {/* Skill Breakdown Tab — Vite SkillBreakdown.tsx as its own tab */}
            {!evaluationPending && activeTab === 'skill_breakdown' && (() => {
              const placeholderMsg = getPlaceholderMessage('skill_breakdown');
              if (placeholderMsg) return renderPlaceholder(placeholderMsg);
              const data = buildDashboardData({
                ai_evaluation: eval_,
                cluster_config: clusterConfig,
                candidate: {
                  name: interview.candidate_name || liveSession.candidate_name || 'Candidate',
                  role: (interview as any).job_title || (interview as any).role || interview.position || 'Candidate',
                  email: interview.candidate_email || liveSession.candidate_email,
                },
                interview: {
                  mode: (interview as any).special_instructions
                    ? (() => { try { const si = JSON.parse((interview as any).special_instructions); return si.interview_mode; } catch { return undefined; } })()
                    : undefined,
                  completed_at: liveSession.completed_at,
                  created_at: liveSession.created_at,
                },
                rounds_config: (interview as any).rounds_config || (liveSession as any).rounds_config,
                conversation_transcript: (liveSession as any).conversation_transcript || (interview as any).conversation_transcript,
              });
              return <SkillsView data={data} />;
            })()}

            {/* Question Analysis Tab — Vite QuestionAnalysis.tsx as its own tab */}
            {!evaluationPending && activeTab === 'question_analysis' && (() => {
              const placeholderMsg = getPlaceholderMessage('question_analysis');
              if (placeholderMsg) return renderPlaceholder(placeholderMsg);
              const data = buildQuestionAnalysisData();
              return (
                <QuestionsView
                  data={data}
                  // Never-asked questions have no moment in the recording.
                  renderAnswerAction={(q) => (q.notDelivered || q.responseType === 'not_asked') ? null : watchQuestion(q.question)}
                />
              );
            })()}

            {/* Example Scenarios Tab — Vite ExampleScenarios.tsx (scoring formula reference) */}
            {!evaluationPending && activeTab === 'example_scenarios' && (
              <FormulaView />
            )}

            {/* Old merged 'eval_dashboard' tab — kept for reference:
            {!evaluationPending && activeTab === 'eval_dashboard' && (() => {
              const data = buildDashboardData({ ... });
              return <EvaluationDashboardV2 data={data} />;
            })()}
            */}
            {/* Old EvaluationDashboardTab (Analysis / Timeline / Table) — kept for reference:
            {!evaluationPending && activeTab === 'eval_dashboard' && (
              <EvaluationDashboardTab
                sessionId={liveSession.id}
                aiEvaluation={eval_}
                isCompleted={liveSession.status === 'completed'}
                clusterConfig={clusterConfig}
                candidate={{
                  name: interview.candidate_name || liveSession.candidate_name || 'Candidate',
                  role: (interview as any).job_title || (interview as any).role || interview.position || 'Candidate',
                  email: interview.candidate_email || liveSession.candidate_email,
                }}
                interview={{
                  mode: (interview as any).special_instructions
                    ? (() => { try { const si = JSON.parse((interview as any).special_instructions); return si.interview_mode; } catch { return undefined; } })()
                    : undefined,
                  completed_at: liveSession.completed_at,
                  created_at: liveSession.created_at,
                }}
              />
            )}
            */}

            {/* Legacy evaluation block removed — replaced by EvaluationTab above.
              Original inline block handled: capability_score hero, section_scores,
              cluster_insights drill-down, per-skill table without formula transparency.
              Now all handled by EvaluationTab with v2 scoring_formula + skill_score_cards.
            */}
            {false && (() => {
              const evalPlaceholder = getPlaceholderMessage();
              if (evalPlaceholder) return renderPlaceholder(evalPlaceholder);

              // No evaluation data at all
              if (!eval_.capability_score && !eval_.cluster_insights?.length && !eval_.section_scores) {
                return renderPlaceholder('Evaluation data not yet available — the AI evaluator may still be processing this interview');
              }

              const capScore: number = eval_.capability_score ?? 0;
              const sectionScores: Record<string, { score: number | null; band: string; section_pct: number; section_name: string }> = eval_.section_scores ?? {};
              const clusterInsights: Array<{
                cluster_name: string; priority: number; weight: number;
                band_score: number | null; band: string;
                skill_scores: Array<{ skill: string; score: number | null; band: string; note?: string }>;
                evaluated: number; total: number; cluster_note?: string;
                category: string; section_name: string; section_pct: number;
              }> = eval_.cluster_insights ?? [];

              const bandColor = (band: string) => {
                if (band === 'Strong')     return { bg: 'bg-success-subtle',  border: 'border-success-line',  text: 'text-success',  bar: 'bg-success',  dot: 'bg-success' };
                if (band === 'Proficient') return { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   bar: 'bg-blue-500',   dot: 'bg-blue-500' };
                if (band === 'Developing') return { bg: 'bg-warning-subtle', border: 'border-warning-line', text: 'text-warning', bar: 'bg-warning', dot: 'bg-warning' };
                if (band === 'Weak')       return { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', bar: 'bg-orange-400', dot: 'bg-orange-400' };
                return                           { bg: 'bg-gray-50',    border: 'border-gray-200',   text: 'text-gray-500',   bar: 'bg-gray-200',   dot: 'bg-gray-300' };
              };

              const scoreColor = (score: number | null) => {
                if (score == null) return 'text-gray-400';
                if (score >= 80) return 'text-success';
                if (score >= 60) return 'text-blue-600';
                if (score >= 40) return 'text-warning';
                return 'text-orange-600';
              };

              // Group clusters by category
              const mthClusters = clusterInsights.filter(c => c.category === 'mth');
              const nthClusters = clusterInsights.filter(c => c.category === 'nth');
              const hrClusters  = clusterInsights.filter(c => c.category === 'hr');

              const sectionOrder: Array<{ key: string; clusters: typeof clusterInsights; color: string; accent: string }> = [
                { key: 'mth', clusters: mthClusters, color: 'indigo', accent: 'border-indigo-300 bg-indigo-600' },
                { key: 'nth', clusters: nthClusters, color: 'violet', accent: 'border-violet-300 bg-violet-600' },
                { key: 'hr',  clusters: hrClusters,  color: 'teal',   accent: 'border-teal-300 bg-teal-600' },
              ].filter(s => s.clusters.length > 0 || sectionScores[s.key]);

              return (
                <div className="space-y-6">

                  {/* ── Final Score Banner ── */}
                  <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
                    <div className="flex items-center justify-between bg-gray-900 text-white px-6 py-5">
                      <div className="flex items-center gap-3">
                        <Award className="w-6 h-6 text-warning" />
                        <div>
                          <div className="text-base font-semibold">Overall Capability Score</div>
                          <div className="tf-hint mt-0.5">Final weighted score — MTH + NTH + HR</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-5xl font-bold text-white">{capScore}</div>
                        <div className="tf-hint mt-1">out of 100</div>
                      </div>
                    </div>
                    {/* Score bar */}
                    <div className="h-2 bg-gray-100">
                      <div
                        className={`h-2 transition-all duration-700 ${capScore >= 80 ? 'bg-success' : capScore >= 60 ? 'bg-blue-500' : capScore >= 40 ? 'bg-warning' : 'bg-orange-400'}`}
                        style={{ width: `${capScore}%` }}
                      />
                    </div>
                  </div>

                  {/* ── Section Score Cards ── */}
                  {Object.keys(sectionScores).length > 0 && (
                    <div className="tf-grid-3">
                      {(['mth', 'nth', 'hr'] as const).map(key => {
                        const sec = sectionScores[key];
                        if (!sec) return null;
                        const bc = bandColor(sec.band);
                        const sectionLabel = sec.section_name || key.toUpperCase();
                        return (
                          <div key={key} className={`rounded-xl border ${bc.border} overflow-hidden`}>
                            <div className={`px-4 py-3 ${bc.bg} border-b ${bc.border}`}>
                              <div className="flex items-center justify-between">
                                <span className="tf-caption uppercase tracking-wide">{sectionLabel}</span>
                                <span className={`text-2xs font-bold px-2 py-0.5 rounded-full border ${bc.border} ${bc.bg} ${bc.text}`}>{sec.band}</span>
                              </div>
                            </div>
                            <div className="px-4 py-4 bg-white">
                              <div className="flex items-end gap-2">
                                <span className={`text-3xl font-bold ${scoreColor(sec.score)}`}>
                                  {sec.score != null ? sec.score : '—'}
                                </span>
                                <span className="tf-body-muted mb-1">/ 100</span>
                                <span className="ml-auto tf-hint mb-1">{sec.section_pct}% weight</span>
                              </div>
                              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className={`h-1.5 rounded-full ${bc.bar}`} style={{ width: `${sec.score ?? 0}%` }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ── Cluster Breakdown by Section ── */}
                  {sectionOrder.map(({ key, clusters, color }) => {
                    const sec = sectionScores[key];
                    const sectionLabel = sec?.section_name || (key === 'mth' ? 'Must Have Skills' : key === 'nth' ? 'Nice to Have Skills' : 'HR');
                    return (
                      <div key={key} className="space-y-3">
                        {/* Section header */}
                        <div className="flex items-center gap-2">
                          <Target className="w-4 h-4 text-gray-600" />
                          <h3 className="tf-row-title">{sectionLabel}</h3>
                          {sec && <span className="tf-hint">({sec.section_pct}% of final score)</span>}
                        </div>

                        {clusters.length === 0 && (
                          <div className="tf-hint px-2">No clusters evaluated for this section.</div>
                        )}

                        {clusters.map(cluster => {
                          const bc = bandColor(cluster.band);
                          return (
                            <div key={cluster.cluster_name} className={`rounded-xl border ${bc.border} overflow-hidden`}>
                              {/* Cluster header */}
                              <div className={`flex items-center justify-between px-4 py-3 ${bc.bg}`}>
                                <div className="flex items-center gap-2 min-w-0">
                                  <TrendingUp className={`w-4 h-4 flex-shrink-0 ${bc.text}`} />
                                  <span className="tf-row-title truncate">{cluster.cluster_name}</span>
                                  <span className="tf-micro-hint flex-shrink-0">Priority {cluster.priority} · {cluster.weight}% weight</span>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                                  <span className={`text-2xs font-bold px-2 py-0.5 rounded-full border ${bc.border} ${bc.bg} ${bc.text}`}>{cluster.band}</span>
                                  <span className={`text-lg font-bold ${scoreColor(cluster.band_score)}`}>
                                    {cluster.band_score != null ? cluster.band_score : '—'}
                                  </span>
                                  <span className="tf-hint">/100</span>
                                </div>
                              </div>

                              {/* Cluster progress bar */}
                              <div className="h-1 bg-gray-100">
                                <div className={`h-1 ${bc.bar}`} style={{ width: `${cluster.band_score ?? 0}%` }} />
                              </div>

                              {/* Skills table */}
                              {cluster.skill_scores && cluster.skill_scores.length > 0 && (
                                <div className="divide-y divide-gray-50 bg-white">
                                  {cluster.skill_scores.map((ss, si) => {
                                    const sbc = bandColor(ss.band);
                                    return (
                                      <div key={si} className="flex items-center gap-3 px-4 py-2.5">
                                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${sbc.dot}`} />
                                        <span className="tf-meta flex-1 min-w-0">{ss.skill}</span>
                                        <span className={`text-2xs font-medium px-1.5 py-0.5 rounded border flex-shrink-0 ${sbc.bg} ${sbc.border} ${sbc.text}`}>{ss.band}</span>
                                        <span className={`text-sm font-semibold w-10 text-right flex-shrink-0 ${scoreColor(ss.score)}`}>
                                          {ss.score != null ? ss.score : '—'}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Cluster note */}
                              {cluster.cluster_note && (
                                <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 tf-micro-hint italic">
                                  {cluster.cluster_note}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}

                  {/* No data fallback */}
                  {clusterInsights.length === 0 && Object.keys(sectionScores).length === 0 && (
                    renderPlaceholder('Detailed evaluation breakdown not available for this session')
                  )}

                </div>
              );
            })()}

            {/* Integrity Check (violations) tab — recruiter-friendly redesign */}
            {!evaluationPending && activeTab === 'violations' && (
              <IntegrityCheckTab
                violations={violations}
                startTs={videoAnchor}
                completedAt={liveSession.completed_at}
                interviewId={liveSession.id}
                shareBarCheck={liveSession.system_check_results?.share_bar_check}
                shareBarCheckAttempts={liveSession.system_check_results?.share_bar_check_attempts}
                hasRecording={!!(liveSession.recording_file_path || liveSession.screen_recording_file_path)}
                onJumpToRecording={(seconds) => {
                  seekNonceRef.current += 1;
                  setRecordingSeek({ seconds, key: seekNonceRef.current });
                  setActiveTab('recording');
                }}
              />
            )}
            {/* Legacy inline violations UI — superseded by IntegrityCheckTab above.
                Guarded off (never rendered); kept for quick rollback, delete in a follow-up. */}
            {showLegacyViolations && (
              <div className="space-y-6">

                {/* Total Violations Banner */}
                <div className={`rounded-xl border ${risk.bg} ${risk.border} ring-1 ring-black/[0.02] shadow-sm overflow-hidden`}>
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <ShieldAlert className={`w-5 h-5 ${risk.color}`} />
                      <div>
                        <p className={`text-sm font-semibold tracking-tight ${risk.color}`}>
                          Integrity Status: {risk.label}
                        </p>
                        <p className="tf-meta mt-0.5">
                          {totalViolations === 0
                            ? 'No violations detected during this interview.'
                            : `${totalViolations} total violation${totalViolations !== 1 ? 's' : ''} detected`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-2xl font-bold ${risk.color}`}>{totalViolations}</span>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowThresholdEditor(p => !p)}
                        aria-label="Configure risk thresholds" title="Configure risk thresholds"
                        className=""
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </Button>
                    </div>
                  </div>

                  {/* Threshold Editor — configures per-box risk levels */}
                  {showThresholdEditor && (
                    <div className="px-4 pb-3 border-t border-gray-200 pt-3 bg-white/60 backdrop-blur-sm">
                      <p className="tf-caption mb-2 tracking-tight">Configure Per-Violation Risk Thresholds</p>
                      <div className="flex items-center gap-4 flex-wrap">
                        <label className="flex items-center gap-2 tf-meta">
                          <span className="text-brand-blue font-medium">Low Risk</span>
                          <span>0 –</span>
                          <input
                            type="number" min={1} max={violationThresholds.medMax - 1}
                            value={violationThresholds.lowMax}
                            onChange={e => setViolationThresholds(t => ({ ...t, lowMax: Math.max(1, Math.min(t.medMax - 1, Number(e.target.value))) }))}
                            className="tf-input h-auto w-14 px-2 py-1 rounded-md text-xs text-center"
                          />
                          <span className="text-gray-400">violations</span>
                        </label>
                        <label className="flex items-center gap-2 tf-meta">
                          <span className="text-brand-orange-deep font-medium">Medium Risk</span>
                          <span>{violationThresholds.lowMax + 1} –</span>
                          <input
                            type="number" min={violationThresholds.lowMax + 1}
                            value={violationThresholds.medMax}
                            onChange={e => setViolationThresholds(t => ({ ...t, medMax: Math.max(t.lowMax + 1, Number(e.target.value)) }))}
                            className="tf-input h-auto w-14 px-2 py-1 rounded-md text-xs text-center"
                          />
                          <span className="text-gray-400">violations</span>
                        </label>
                        <span className="text-xs text-destructive font-medium">{violationThresholds.medMax + 1}+ = High Risk</span>
                        <button
                          onClick={() => { setViolationThresholds(DEFAULT_VIOLATION_THRESHOLDS); }}
                          className="text-xs text-brand-blue hover:underline"
                        >
                          Reset defaults
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* All Violation Type Boxes — always shown, default count 0 */}
                {(() => {
                  const ALL_TYPES = [
                    'face_missing', 'multiple_faces', 'gaze_away',
                    'tab_switch', 'window_blur', 'fullscreen_exit',
                    'camera_disabled', 'camera_obstructed', 'microphone_disabled',
                    'copy_attempt', 'paste_attempt',
                    'voice_detected', 'multiple_voices',
                    'face_mismatch', 'face_identity_changed', 'face_unverifiable', 'face_verification_unavailable',
                    'voice_mismatch', 'voice_identity_changed',
                    'screenshot_attempt', 'screen_recording_attempt', 'screen_share_stopped',
                  ];
                  return (
                <div>
                  <h3 className="tf-row-title mb-3 tracking-tight">Violation Breakdown</h3>
                  <div className="tf-grid-stats">
                    {ALL_TYPES.map(type => {
                      const cfg = EVENT_CONFIG[type];
                      const count = violationCounts[type] ?? 0;
                      if (!cfg) return null;
                      const boxRisk = violationBoxRisk(count, violationThresholds);
                      return (
                        <div
                          key={type}
                          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border ring-1 shadow-sm ${
                            count > 0 ? `${cfg.bg} ${cfg.border} ring-black/[0.02] shadow-brand-blue/5` : 'bg-white border-gray-100 ring-black/[0.02] shadow-brand-blue/5'
                          }`}
                        >
                          <span className={count > 0 ? cfg.color : 'text-gray-300'}>{cfg.icon}</span>
                          <div className="min-w-0 flex-1">
                            <p className={`text-xs font-medium truncate ${count > 0 ? cfg.color : 'text-gray-400'}`}>
                              {cfg.label}
                            </p>
                            <div className="flex items-center gap-2">
                              <span className={`text-lg font-bold ${
                                count > 0 ? 'text-gray-900' : 'text-gray-300'
                              }`}>
                                {count}
                              </span>
                              {count > 0 && boxRisk.label && (
                                <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded-full ${boxRisk.cls}`}>
                                  {boxRisk.label}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                  );
                })()}

                {/* Event Log Table */}
                <div>
                  <h3 className="tf-row-title mb-3 tracking-tight">Event Log</h3>
                  {groupedViolations.length === 0 ? (
                    <div className="text-center py-12 bg-success-subtle rounded-xl border border-success-line ring-1 ring-success-line">
                      <ShieldAlert className="w-8 h-8 text-success mx-auto mb-2" />
                      <p className="text-sm font-medium text-success">No violations recorded</p>
                      <p className="text-xs text-success/80 mt-1">This interview completed with a clean integrity status.</p>
                    </div>
                  ) : (
                    <>
                      <div className={`tf-card-soft overflow-hidden tf-table-shell ${DESKTOP_TABLE_ONLY}`}>
                        <table className="w-full text-sm">
                          <thead className="bg-white border-b border-gray-100">
                            <tr>
                              <th className="tf-th-cell text-left tf-th w-10">#</th>
                              <th className="tf-th-cell text-left tf-th">Event</th>
                              <th className="tf-th-cell text-left tf-th">Time</th>
                              <th className="tf-th-cell text-left tf-th">Video Time</th>
                              <th className="tf-th-cell text-left tf-th">Severity</th>
                              <th className="tf-th-cell text-right tf-th">Count</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {pagedViolations.map((row, idx) => {
                              const cfg = EVENT_CONFIG[row.event_type];
                              const sev = normaliseSeverity(row.severity);
                              const sevStyle =
                                sev === 'severe'   ? 'bg-destructive-subtle text-destructive ring-1 ring-destructive-line' :
                                sev === 'moderate' ? 'bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20' :
                                                     'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20';
                              const countStyle =
                                row.count >= 5 ? 'text-destructive font-bold' :
                                row.count >= 3 ? 'text-brand-orange-deep font-semibold' :
                                                 'text-gray-600';
                              const globalIdx = (safeViolationPage - 1) * ROWS_PER_PAGE + idx + 1;
                              // Video Time is clickable only when we can compute
                              // an offset AND a recording exists to seek into.
                              const offsetSec = videoOffsetSeconds(row.timestamp, videoAnchor);
                              const hasRecording = !!(liveSession.recording_file_path || liveSession.screen_recording_file_path);
                              const seekable = offsetSec != null && hasRecording;
                              const jumpToRecording = () => {
                                if (offsetSec == null) return;
                                seekNonceRef.current += 1;
                                setRecordingSeek({ seconds: offsetSec, key: seekNonceRef.current });
                                setActiveTab('recording');
                              };
                              return (
                                <tr key={idx} className="hover:bg-brand-blue/[0.02] transition-colors">
                                  <td className="tf-td tf-hint">{globalIdx}</td>
                                  <td className="tf-td">
                                    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ring-1 ${
                                      cfg ? `${cfg.bg} ${cfg.color} ring-black/[0.04]` : 'bg-slate-100 text-slate-600 ring-slate-200'
                                    }`}>
                                      {cfg?.icon}
                                      {cfg?.label ?? row.event_type.replace(/_/g, ' ')}
                                    </div>
                                  </td>
                                  <td className="tf-td tf-meta font-mono">{formatTs(row.timestamp)}</td>
                                  <td className="tf-td text-xs font-mono">
                                    {seekable ? (
                                      <button
                                        type="button"
                                        onClick={jumpToRecording}
                                        title="Jump to this moment in the recording"
                                        className="inline-flex items-center gap-1 text-brand-blue hover:text-brand-blue-2 hover:underline underline-offset-2 focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-blue/40 rounded"
                                      >
                                        <Play className="w-3 h-3" />
                                        {formatVideoOffset(row.timestamp, videoAnchor)}
                                      </button>
                                    ) : (
                                      <span className="text-gray-500">{formatVideoOffset(row.timestamp, videoAnchor)}</span>
                                    )}
                                  </td>
                                  <td className="tf-td">
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${sevStyle}`}>
                                      {sev}
                                    </span>
                                  </td>
                                  <td className={`px-4 py-2.5 text-right text-xs ${countStyle}`}>{row.count}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <MobileRecordList>
                        {pagedViolations.map((row, idx) => {
                          const cfg = EVENT_CONFIG[row.event_type];
                          const sev = normaliseSeverity(row.severity);
                          const sevStyle =
                            sev === 'severe'   ? 'bg-destructive-subtle text-destructive ring-1 ring-destructive-line' :
                            sev === 'moderate' ? 'bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20' :
                                                 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20';
                          const countTone = row.count >= 5 ? 'danger' : row.count >= 3 ? 'warning' : 'neutral';
                          const globalIdx = (safeViolationPage - 1) * ROWS_PER_PAGE + idx + 1;
                          const offsetSec = videoOffsetSeconds(row.timestamp, videoAnchor);
                          const hasRecording = !!(liveSession.recording_file_path || liveSession.screen_recording_file_path);
                          const seekable = offsetSec != null && hasRecording;
                          const jumpToRecording = () => {
                            if (offsetSec == null) return;
                            seekNonceRef.current += 1;
                            setRecordingSeek({ seconds: offsetSec, key: seekNonceRef.current });
                            setActiveTab('recording');
                          };
                          return (
                            <MobileRecordCard
                              key={idx}
                              idBadge={<span className="tf-hint">#{globalIdx}</span>}
                              badges={
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${sevStyle}`}>
                                  {sev}
                                </span>
                              }
                              title={
                                <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ring-1 ${
                                  cfg ? `${cfg.bg} ${cfg.color} ring-black/[0.04]` : 'bg-slate-100 text-slate-600 ring-slate-200'
                                }`}>
                                  {cfg?.icon}
                                  {cfg?.label ?? row.event_type.replace(/_/g, ' ')}
                                </span>
                              }
                              fields={[
                                { label: 'Time', value: <span className="font-mono">{formatTs(row.timestamp)}</span> },
                                {
                                  label: 'Video Time',
                                  value: seekable ? (
                                    <button
                                      type="button"
                                      onClick={jumpToRecording}
                                      title="Jump to this moment in the recording"
                                      className="inline-flex items-center gap-1 font-mono text-brand-blue hover:text-brand-blue-2 hover:underline underline-offset-2 focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-blue/40 rounded"
                                    >
                                      <Play className="w-3 h-3" />
                                      {formatVideoOffset(row.timestamp, videoAnchor)}
                                    </button>
                                  ) : (
                                    <span className="font-mono text-gray-500">{formatVideoOffset(row.timestamp, videoAnchor)}</span>
                                  ),
                                },
                              ]}
                              footer={<MobileStatChip tone={countTone}>Count: {row.count}</MobileStatChip>}
                            />
                          );
                        })}
                      </MobileRecordList>

                      {/* Pagination — shared ListPagination (consistent with other pages) */}
                      <ListPagination
                        currentPage={safeViolationPage}
                        itemsPerPage={violationsPerPage}
                        totalItems={groupedViolations.length}
                        onPageChange={setViolationPage}
                        onItemsPerPageChange={setViolationsPerPage}
                        itemLabel="events"
                      />
                    </>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
        </div>
        </div>
      </div>
        </div>
      </div>
    </main>
  );
}
