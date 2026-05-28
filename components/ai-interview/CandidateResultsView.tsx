'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import {
  ArrowLeft, Clock, MessageSquare, ThumbsUp, ThumbsDown,
  AlertTriangle, VideoOff, ChevronDown, ChevronUp, Video,
  BarChart3, Brain, FileText, Layers, Bot,
  ShieldAlert, Monitor, Clipboard, MousePointer, Eye, UserX,
  Volume2, Users, Maximize2, Camera, Mic, User, ChevronLeft, ChevronRight,
  Shield, CheckCircle2, XCircle, Activity, RefreshCw, Award, TrendingUp, Target,
  Download, Loader2, Sparkles,
} from 'lucide-react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend,
} from 'recharts';
import EvaluationTab from './tabs/EvaluationTab';
import EvaluationDashboardTab from './tabs/EvaluationDashboardTab';
import EvaluationReportTab from './tabs/EvaluationReportTab';
import CoverageTab from './tabs/CoverageTab';
// import { OverviewSection } from './evaluation-dashboard/OverviewSection'; // replaced by OverviewSectionV2 (Vite design)
import { OverviewSectionV2 } from './evaluation-dashboard/OverviewSectionV2';
import { EvaluationReportV2 } from './evaluation-dashboard/EvaluationReportV2';
// EvaluationDashboardV2 default export no longer used; sub-views are mounted as their own tabs.
// import { EvaluationDashboardV2 } from './evaluation-dashboard/EvaluationDashboardV2';
import { SkillsView, QuestionsView, FormulaView } from './evaluation-dashboard/EvaluationDashboardV2';
import { CoverageV2 } from './evaluation-dashboard/CoverageV2';
import { buildDashboardData } from './evaluation-dashboard/adapter';
import type { AIInterviewResponse } from '@/lib/services/aiInterviewService';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import api from '@/lib/services/api';
import { formatISTDate } from '@/lib/utils/dateUtils';
import PageBreadcrumb from '@/components/PageBreadcrumb';

interface CandidateResultsViewProps {
  interview: AIInterviewResponse;
  onBack: () => void;
}

type TabKey = 'overview' | 'evaluation' | 'eval_report' | 'eval_dashboard' | 'sentiment' | 'qa' | 'recording' | 'transcript' | 'coverage' | 'violations' | 'skill_breakdown' | 'question_analysis' | 'example_scenarios';

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
  return { label: 'High Risk', cls: 'text-red-600 bg-red-50 ring-1 ring-red-200' };
}

function getRiskLevelWeighted(
  score: number,
  thresholds: RiskThresholds = DEFAULT_THRESHOLDS,
): { label: string; color: string; bg: string; border: string } {
  if (score === 0)                    return { label: 'Clean',       color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-300'  };
  if (score <= thresholds.low)        return { label: 'Low Risk',    color: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-200'  };
  if (score <= thresholds.medium)     return { label: 'Medium Risk', color: 'text-brand-orange-deep', bg: 'bg-brand-orange/10', border: 'border-brand-orange/30' };
  return                                     { label: 'High Risk',   color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-300'    };
}

const EVENT_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string; border: string }> = {
  tab_switch:               { label: 'Tab Switch',           icon: <Monitor className="w-4 h-4" />,      color: 'text-brand-orange-deep', bg: 'bg-brand-orange/10',  border: 'border-brand-orange/20' },
  window_blur:              { label: 'Window Blur',          icon: <Eye className="w-4 h-4" />,           color: 'text-red-600',    bg: 'bg-red-50',     border: 'border-red-200'    },
  copy_attempt:             { label: 'Copy Attempt',         icon: <Clipboard className="w-4 h-4" />,     color: 'text-brand-orange-deep', bg: 'bg-brand-orange/10', border: 'border-brand-orange/20' },
  paste_attempt:            { label: 'Paste Attempt',        icon: <MousePointer className="w-4 h-4" />,  color: 'text-brand-orange-deep', bg: 'bg-brand-orange/10', border: 'border-brand-orange/20' },
  camera_disabled:          { label: 'Camera Disabled',      icon: <Camera className="w-4 h-4" />,        color: 'text-slate-600',  bg: 'bg-slate-50',  border: 'border-slate-200'  },
  camera_obstructed:        { label: 'Camera Obstructed',    icon: <Eye className="w-4 h-4" />,           color: 'text-brand-cyan', bg: 'bg-brand-cyan/10', border: 'border-brand-cyan/20' },
  microphone_disabled:      { label: 'Mic Disabled',         icon: <Mic className="w-4 h-4" />,           color: 'text-slate-600',  bg: 'bg-slate-50',  border: 'border-slate-200'  },
  voice_detected:           { label: 'Voice Detected',       icon: <Volume2 className="w-4 h-4" />,       color: 'text-brand-cyan', bg: 'bg-brand-cyan/10', border: 'border-brand-cyan/20' },
  multiple_voices:          { label: 'Multiple Voices',      icon: <Volume2 className="w-4 h-4" />,       color: 'text-brand-teal', bg: 'bg-brand-teal/10', border: 'border-brand-teal/20' },
  multiple_faces:           { label: 'Multiple Faces',       icon: <Users className="w-4 h-4" />,         color: 'text-brand-blue', bg: 'bg-brand-blue/10', border: 'border-brand-blue/20' },
  face_missing:             { label: 'Face Not Visible',     icon: <UserX className="w-4 h-4" />,         color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200'    },
  gaze_away:                { label: 'Gaze Away',            icon: <Eye className="w-4 h-4" />,           color: 'text-brand-orange', bg: 'bg-brand-orange/10', border: 'border-brand-orange/20' },
  fullscreen_exit:          { label: 'Fullscreen Exit',      icon: <Maximize2 className="w-4 h-4" />,     color: 'text-brand-blue', bg: 'bg-brand-blue/10', border: 'border-brand-blue/20' },
  screenshot_attempt:       { label: 'Screenshot Attempt',   icon: <Camera className="w-4 h-4" />,        color: 'text-brand-orange-deep', bg: 'bg-brand-orange/10', border: 'border-brand-orange/20' },
  screen_recording_attempt: { label: 'Screen Recording',     icon: <Video className="w-4 h-4" />,         color: 'text-brand-orange-deep', bg: 'bg-brand-orange/10', border: 'border-brand-orange/20' },
  face_mismatch:            { label: 'Face Mismatch',        icon: <User className="w-4 h-4" />,          color: 'text-brand-orange-deep', bg: 'bg-brand-orange/10', border: 'border-brand-orange/20' },
  face_identity_changed:    { label: 'Identity Changed',     icon: <UserX className="w-4 h-4" />,         color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200'    },
  voice_mismatch:           { label: 'Voice Mismatch',       icon: <Mic className="w-4 h-4" />,           color: 'text-brand-orange-deep', bg: 'bg-brand-orange/10', border: 'border-brand-orange/20' },
  voice_identity_changed:   { label: 'Voice ID Changed',     icon: <Mic className="w-4 h-4" />,           color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200'    },
  screen_share_stopped:     { label: 'Screen Share Stopped', icon: <Monitor className="w-4 h-4" />,       color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200'    },
};

function formatTs(ts?: string) {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch { return '—'; }
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
}: {
  label: string;
  hasFile: boolean;
  blobUrl: string | null;
  loading: boolean;
  error: boolean;
  onError: () => void;
  onDuration?: (seconds: number) => void;
}) {
  if (!hasFile) {
    return (
      <div className="text-center py-12">
        <div className="w-12 h-12 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center mx-auto mb-3">
          <VideoOff className="w-6 h-6 text-brand-blue/40" />
        </div>
        <p className="text-gray-500 text-sm">{label} not available</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="text-center py-12">
        <div className="w-12 h-12 rounded-full bg-red-50 ring-1 ring-red-200 flex items-center justify-center mx-auto mb-3">
          <VideoOff className="w-6 h-6 text-red-400" />
        </div>
        <p className="text-gray-500 text-sm">Could not load {label.toLowerCase()}</p>
        <p className="text-xs text-gray-400 mt-1">The file may have been moved or deleted</p>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="text-center py-12">
        <Loader2 className="w-8 h-8 text-brand-blue animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500">Loading {label.toLowerCase()}…</p>
      </div>
    );
  }
  if (blobUrl) {
    return (
      <VideoWithDuration blobUrl={blobUrl} onError={onError} onDuration={onDuration} />
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

function VideoWithDuration({ blobUrl, onError, onDuration }: { blobUrl: string; onError: () => void; onDuration?: (seconds: number) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState<number | null>(null);

  const applyDuration = (d: number) => {
    setDuration(d);
    if (onDuration && isFinite(d) && d > 0) onDuration(d);
  };

  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    if (isFinite(v.duration) && v.duration > 0) {
      applyDuration(v.duration);
      return;
    }
    const onTimeUpdate = () => {
      v.removeEventListener('timeupdate', onTimeUpdate);
      v.currentTime = 0;
      applyDuration(v.duration);
    };
    v.addEventListener('timeupdate', onTimeUpdate);
    v.currentTime = 1e9;
  };

  return (
    <div className="relative">
      <video
        ref={videoRef}
        controls
        className="w-full max-h-[500px] rounded-xl bg-slate-900 ring-1 ring-black/[0.04]"
        src={blobUrl}
        onLoadedMetadata={handleLoadedMetadata}
        onError={onError}
      >
        Your browser does not support video playback.
      </video>
      {duration !== null && (
        <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-md bg-slate-900/80 backdrop-blur-sm text-white text-xs font-medium ring-1 ring-white/10">
          <Clock className="w-3 h-3" /> {formatDuration(duration)}
        </div>
      )}
    </div>
  );
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
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value}</span>
    </div>
  );
  return (
    <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-2 tracking-tight">Recording Information</h3>
      <Row label="Status" value={<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 ring-1 ring-green-200 text-xs font-medium">{status}</span>} />
      <Row label="File Size" value={formatBytes(size)} />
      <Row label="Duration" value={duration != null ? formatDuration(duration) : '—'} />
      <Row label="Interview Date" value={formatInterviewDate(interviewDate)} />
    </div>
  );
}

function RecordingTabContent({
  interview,
  videoBlobUrl, videoBlobSize, videoLoading, videoError, setVideoError,
  screenBlobUrl, screenBlobSize, screenLoading, screenError,
}: {
  interview: AIInterviewResponse;
  videoBlobUrl: string | null;
  videoBlobSize: number | null;
  videoLoading: boolean;
  videoError: boolean;
  setVideoError: (v: boolean) => void;
  screenBlobUrl: string | null;
  screenBlobSize: number | null;
  screenLoading: boolean;
  screenError: boolean;
}) {
  const [recView, setRecView] = useState<'candidate' | 'screen'>('candidate');
  const [candidateDuration, setCandidateDuration] = useState<number | null>(null);
  const [screenDuration, setScreenDuration] = useState<number | null>(null);

  const isCandidate = recView === 'candidate';
  const blobUrl = isCandidate ? videoBlobUrl : screenBlobUrl;
  const blobSize = isCandidate ? videoBlobSize : screenBlobSize;
  const duration = isCandidate ? candidateDuration : screenDuration;
  const downloadName = isCandidate
    ? `candidate-view-${interview.id}.mp4`
    : `interview-view-${interview.id}.mp4`;
  const interviewDate = interview.started_at || interview.scheduled_at || interview.created_at;
  const statusLabel = interview.recording_file_path || interview.screen_recording_file_path
    ? 'Transcribed'
    : 'Unavailable';

  return (
    <div className="space-y-4">
      {/* Sub-tab pills */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit ring-1 ring-slate-200">
        <button
          onClick={() => setRecView('candidate')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            isCandidate ? 'bg-white text-brand-blue shadow-sm ring-1 ring-brand-blue/15' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Camera className="w-3.5 h-3.5" /> Candidate View
        </button>
        <button
          onClick={() => setRecView('screen')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            !isCandidate ? 'bg-white text-brand-blue shadow-sm ring-1 ring-brand-blue/15' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Monitor className="w-3.5 h-3.5" /> Interview View
        </button>
      </div>

      {/* Split layout: video left, info right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-2">
          {!isCandidate && (
            <p className="text-xs text-gray-500">Screen recording captured during the interview session.</p>
          )}
          {isCandidate ? (
            <VideoPane
              label="Candidate recording"
              hasFile={!!interview.recording_file_path}
              blobUrl={videoBlobUrl}
              loading={videoLoading}
              error={videoError}
              onError={() => setVideoError(true)}
              onDuration={setCandidateDuration}
            />
          ) : (
            <VideoPane
              label="Screen recording"
              hasFile={!!interview.screen_recording_file_path}
              blobUrl={screenBlobUrl}
              loading={screenLoading}
              error={screenError}
              onError={() => {}}
              onDuration={setScreenDuration}
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
          {blobUrl && (
            <a
              href={blobUrl}
              download={downloadName}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-brand-blue text-white hover:from-brand-blue-2 hover:to-brand-blue shadow-sm shadow-brand-blue/20 ring-1 ring-brand-blue/30 transition-colors"
            >
              <Download className="w-4 h-4" /> Download MP4
            </a>
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
    .replace(/'/g, '&#039;');
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
    : 'bg-green-200/80 text-green-900 rounded px-0.5 font-medium';
  return (
    <span>
      {parts.map((p, i) => p.changed
        ? <mark key={i} className={hl}>{p.text}</mark>
        : <span key={i}>{p.text}</span>
      )}
    </span>
  );
}

export default function CandidateResultsView({ interview, onBack }: CandidateResultsViewProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [transcriptView, setTranscriptView] = useState<'chat' | 'table'>('chat');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [qaExportMenuOpen, setQaExportMenuOpen] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [videoBlobUrl, setVideoBlobUrl] = useState<string | null>(null);
  const [videoBlobSize, setVideoBlobSize] = useState<number | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [screenBlobUrl, setScreenBlobUrl] = useState<string | null>(null);
  const [screenBlobSize, setScreenBlobSize] = useState<number | null>(null);
  const [screenLoading, setScreenLoading] = useState(false);
  const [screenError, setScreenError] = useState(false);
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set());
  const [violationPage, setViolationPage] = useState(1);
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
  const [identityPhotoError, setIdentityPhotoError] = useState(false);

  // liveSession must be declared before any useEffect that references it in its
  // dependency array, because dependency arrays are evaluated immediately during render.
  const [liveSession, setLiveSession] = useState(interview);
  const [liveWsConnected, setLiveWsConnected] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  useEffect(() => { setLiveSession(interview); }, [interview]);

  // Fetch recording with auth headers and create blob URL.
  // Uses liveSession (not the initial interview prop) so that when evaluation_ready
  // fires and liveSession is refreshed via REST, a newly-uploaded recording_file_path
  // triggers this effect and the video becomes playable without a manual page reload.
  useEffect(() => {
    if (activeTab !== 'recording' || !liveSession.recording_file_path || videoBlobUrl) return;
    let cancelled = false;
    setVideoLoading(true);
    api.get(`/ai-interview/${liveSession.id}/recording`, { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return;
        const url = URL.createObjectURL(res.data);
        setVideoBlobUrl(url);
        setVideoBlobSize(res.data?.size ?? null);
      })
      .catch(() => {
        if (!cancelled) setVideoError(true);
      })
      .finally(() => {
        if (!cancelled) setVideoLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeTab, liveSession.recording_file_path, liveSession.id, videoBlobUrl]);

  // Fetch screen recording when recording tab is active
  useEffect(() => {
    if (activeTab !== 'recording' || !liveSession.screen_recording_file_path || screenBlobUrl || screenError) return;
    let cancelled = false;
    setScreenLoading(true);
    api.get(`/ai-interview/${liveSession.id}/screen-recording`, { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return;
        setScreenBlobUrl(URL.createObjectURL(res.data));
        setScreenBlobSize(res.data?.size ?? null);
      })
      .catch(() => { if (!cancelled) setScreenError(true); })
      .finally(() => { if (!cancelled) setScreenLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, liveSession.screen_recording_file_path, liveSession.id, screenBlobUrl, screenError]);

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
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
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
  const evaluationReady = !!(
    eval_.evaluation_version ||
    eval_.capability_score ||
    eval_.cluster_insights?.length ||
    eval_.evaluations?.length
  );
  const evaluationPending = isCompleted && !evaluationReady;

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

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      completed: 'bg-green-100 text-green-700 ring-1 ring-green-200',
      in_progress: 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20',
      invited: 'bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20',
      cancelled: 'bg-red-100 text-red-700 ring-1 ring-red-200',
      draft: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
    };
    return map[status] || 'bg-slate-100 text-slate-600 ring-1 ring-slate-200';
  };

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      completed: 'Completed',
      in_progress: 'In Progress',
      invited: 'Invited',
      cancelled: 'Cancelled',
      draft: 'Draft',
    };
    return map[status] || status;
  };

  const getScoreColor = (score: number) => {
    if (score >= 4) return 'text-green-600 bg-green-50 border-green-200 ring-1 ring-green-200';
    if (score >= 3) return 'text-brand-orange-deep bg-brand-orange/10 border-brand-orange/30 ring-1 ring-brand-orange/20';
    return 'text-red-600 bg-red-50 border-red-200 ring-1 ring-red-200';
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

  const ROWS_PER_PAGE = 10;
  const totalPages = Math.max(1, Math.ceil(groupedViolations.length / ROWS_PER_PAGE));
  const pagedViolations = groupedViolations.slice((violationPage - 1) * ROWS_PER_PAGE, violationPage * ROWS_PER_PAGE);

  const tabs: { key: TabKey; label: string; icon: React.ReactNode; badge?: number; live?: boolean }[] = [
    { key: 'overview',         label: 'Overview',          icon: <BarChart3 className="w-4 h-4" /> },
    ...((isCompleted || isPartial)
      ? [
          { key: 'eval_report'        as TabKey, label: 'Evaluation Report',  icon: <FileText className="w-4 h-4" /> },
          { key: 'skill_breakdown'    as TabKey, label: 'Skill Breakdown',    icon: <Brain    className="w-4 h-4" /> },
          { key: 'question_analysis'  as TabKey, label: 'Question Analysis',  icon: <Target   className="w-4 h-4" /> },
        ]
      : []),
    { key: 'coverage',         label: 'Cluster Coverage', icon: <Activity className="w-4 h-4" />, live: isInProgress },
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
    { key: 'violations',       label: 'Violations',       icon: <ShieldAlert className="w-4 h-4" />, badge: totalViolations },
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
    return (
    <div className="flex flex-col items-center justify-center py-24">
      <div className="relative mb-6">
        <div className="w-16 h-16 rounded-full border-4 border-brand-blue/20" />
        <Loader2 className="absolute inset-0 w-16 h-16 text-brand-blue animate-spin" />
      </div>
      <h3 className="text-base font-semibold text-gray-900 mb-1 tracking-tight">Generating Evaluation Results</h3>
      <p className="text-sm text-gray-500 max-w-xs text-center">
        The AI is scoring every answer, analyzing sentiment, and verifying the
        results. This typically takes 1–3 minutes — you can keep this page open;
        it refreshes automatically when ready.
      </p>
      <div className="flex items-center gap-2 mt-4">
        <span className="w-2 h-2 rounded-full bg-brand-blue animate-pulse" />
        <span className="text-xs text-brand-blue font-medium tabular-nums">
          Processing… {mm}:{ss}
        </span>
      </div>
    </div>
    );
  };

  const getPlaceholderMessage = (tabKey?: string) => {
    // While evaluation is being generated, all tabs show the spinner
    if (evaluationPending) return null; // handled by renderEvaluationSpinner below
    // Coverage tab handles its own in-progress state — don't block it
    if (isInProgress && tabKey !== 'coverage') {
      return 'Interview in progress — data will appear once completed';
    }
    if (!isInProgress && !isCompleted && !isPartial) return 'Interview not yet started — no data available';
    return null;
  };

  // Generic placeholder (for tabs that don't pass a key)
  const placeholderMsg = getPlaceholderMessage();

  return (
    <main className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full min-h-[calc(100vh-7rem)] bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
          <PageBreadcrumb
            className="mb-4 md:mb-6"
            items={[
              { label: 'Dashboard', href: '/dashboard' },
              { label: 'AI Interviews', href: '/recruitment/ai-interviews' },
              { label: 'Candidate Results' },
            ]}
          />

      <div>
        <div className="w-full">
          {/* Candidate header banner */}
          <div className="mb-6 rounded-xl bg-gradient-to-br from-brand-blue/5 via-white to-brand-cyan/5 border border-brand-blue/15 ring-1 ring-brand-blue/10 shadow-sm shadow-brand-blue/10 p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-12 h-12 rounded-full bg-brand-blue shadow-md shadow-brand-blue/25 ring-1 ring-white/20 flex items-center justify-center text-white font-semibold text-base">
                    {(interview.candidate_name || 'U')[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h1 className="text-xl font-semibold text-gray-900 tracking-tight">
                        {interview.candidate_name || 'Unknown Candidate'}
                      </h1>
                      {interview.candidate_cid && (
                        <span className="inline-flex items-center px-2 py-0.5 bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 rounded text-xs font-mono font-medium">
                          {interview.candidate_cid}
                        </span>
                      )}
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(interview.status)}`}>
                        {getStatusLabel(interview.status)}
                      </span>
                      {/* Interview mode badge — reads from config (special_instructions.interview_mode) */}
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ${
                        isFlexibleMode
                          ? 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20'
                          : 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20'
                      }`}>
                        {isFlexibleMode ? 'Conversational Mode' : 'Timed Mode'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                      {interview.candidate_email && <span>{interview.candidate_email}</span>}
                      {interview.position && (
                        <>
                          <span className="text-gray-300">|</span>
                          <span>{interview.position}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-500 mt-2 ml-[60px]">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {formatDuration(eval_.duration_minutes || interview.duration_minutes)}
                  </span>
                  {interview.completed_at && (
                    <span>
                      Completed {formatISTDate(interview.completed_at)}
                    </span>
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

        {/* Partial warning banner */}
        {isPartial && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-brand-orange/10 border border-brand-orange/30 ring-1 ring-brand-orange/15 rounded-xl text-sm text-brand-orange-deep shadow-sm shadow-brand-orange/5">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            Interview disconnected — showing partial results
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
            ? 'bg-red-50 border-red-200 ring-1 ring-red-100 text-red-800'
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

        {/* Tabs card */}
        <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
          <div className="sticky top-[64px] sm:top-[80px] z-20 border-b border-gray-100 bg-slate-50/95 backdrop-blur supports-[backdrop-filter]:bg-slate-50/80 shadow-sm rounded-t-xl px-6 overflow-x-auto">
            <div className="flex gap-1 min-w-max">
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => { setActiveTab(tab.key); setViolationPage(1); }}
                  className={`flex items-center gap-1.5 py-4 px-3 text-sm border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === tab.key
                      ? tab.key === 'violations'
                        ? 'border-red-500 text-red-700 font-medium'
                        : 'border-brand-blue text-brand-blue font-medium'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                  {tab.live && (
                    <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full ml-0.5 ring-1 ring-red-300">
                      <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
                      LIVE
                    </span>
                  )}
                  {tab.badge !== undefined && (
                    <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium ${
                      tab.badge > 0
                        ? activeTab === 'violations'
                          ? 'bg-red-100 text-red-700 ring-1 ring-red-200'
                          : 'bg-red-100 text-red-600 ring-1 ring-red-200'
                        : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200'
                    }`}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="p-6">
            {/* Evaluation pending spinner — shown for ALL tabs while batch eval runs */}
            {evaluationPending && renderEvaluationSpinner()}

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
              // Compute avg response time from evaluations (seconds)
              const responseTimes = (eval_.evaluations || [])
                .map((e: any) => e?.response_time_seconds ?? e?.duration_seconds ?? null)
                .filter((v: number | null): v is number => typeof v === 'number' && v > 0);
              const avgResponseSeconds = responseTimes.length > 0
                ? responseTimes.reduce((a: number, b: number) => a + b, 0) / responseTimes.length
                : null;
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
                  avgResponseSeconds={avgResponseSeconds}
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
                        <h3 className="text-sm font-semibold text-gray-900 mb-3 tracking-tight">Sentiment Timeline</h3>
                        <div className="bg-gradient-to-br from-brand-blue/5 via-white to-brand-cyan/5 rounded-xl border border-brand-blue/15 ring-1 ring-brand-blue/10 p-4" style={{ height: 300 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={sentimentTimeline} margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="turn" tick={{ fontSize: 11 }} />
                              <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} />
                              <Tooltip />
                              <Legend />
                              <Line type="monotone" dataKey="confidence" stroke="#16a34a" strokeWidth={2} name="Confidence" dot={{ r: 3 }} />
                              <Line type="monotone" dataKey="nervousness" stroke="#ef4444" strokeWidth={2} name="Nervousness" dot={{ r: 3 }} />
                              <Line type="monotone" dataKey="engagement" stroke="#0f3c99" strokeWidth={2} name="Engagement" dot={{ r: 3 }} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Emotion per turn */}
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 mb-3 tracking-tight">Emotion per Turn</h3>
                        <div className="flex flex-wrap gap-2">
                          {sentimentTimeline.map((t, i) => (
                            <div key={i} className="px-3 py-2 bg-white rounded-lg border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 text-center">
                              <div className="text-[10px] text-gray-400 mb-0.5">{t.turn}</div>
                              <div className="text-xs font-medium text-gray-700 capitalize">
                                {t.dominant_emotion || 'neutral'}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Summary stats */}
                      {sentimentSummary.total_turns_analyzed != null && (
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900 mb-3 tracking-tight">Summary Statistics</h3>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-3 text-center">
                              <div className="text-lg font-semibold text-green-600">
                                {(sentimentSummary.avg_confidence || 0).toFixed(1)}
                              </div>
                              <div className="text-xs text-gray-500">Avg Confidence</div>
                            </div>
                            <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-3 text-center">
                              <div className="text-lg font-semibold text-red-600">
                                {(sentimentSummary.avg_nervousness || 0).toFixed(1)}
                              </div>
                              <div className="text-xs text-gray-500">Avg Nervousness</div>
                            </div>
                            <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-3 text-center">
                              <div className="text-lg font-semibold text-brand-blue">
                                {(sentimentSummary.avg_engagement || 0).toFixed(1)}
                              </div>
                              <div className="text-xs text-gray-500">Avg Engagement</div>
                            </div>
                            <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-3 text-center">
                              <div className="text-lg font-semibold text-gray-900">
                                {sentimentSummary.total_turns_analyzed}
                              </div>
                              <div className="text-xs text-gray-500">Turns Analyzed</div>
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
                for (const _it of qaItemsRaw) {
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
                  root.style.cssText = 'padding:24px;font-family:Arial,sans-serif;color:#111;max-width:720px;';
                  let inner = `<h1 style="font-size:20px;margin:0 0 4px 0">Q&amp;A Transcript</h1>
                    <div style="font-size:12px;color:#666;margin-bottom:16px">${candidateNameLabel} · ${groups.length} questions</div>`;
                  groups.forEach((g: any, i: number) => {
                    const it = g.main;
                    const rl = roundLabelFor(it.round_type);
                    const topic = it.topic && it.topic !== 'general' ? it.topic : '';
                    inner += `<div style="margin-bottom:14px;padding:10px 12px;border:1px solid #e5e7eb;border-radius:6px;page-break-inside:avoid">
                      <div style="font-size:11px;color:#6b7280;margin-bottom:4px">
                        <b>Q${it.question_number ?? i + 1}</b>${rl ? ` · ${rl}` : ''}${topic ? ` · ${topic}` : ''}
                      </div>
                      <div style="font-size:13px;font-weight:600;color:#111;margin-bottom:6px">${escapeHtml(it.question || '')}</div>
                      <div style="font-size:12px;color:#374151"><b>Candidate Answer:</b> ${escapeHtml(it.answer || '—')}</div>`;
                    (it.clarifications || []).forEach((cl: any, ci: number) => {
                      inner += `<div style="margin-top:8px;padding-left:10px;border-left:2px solid #fcd34d">
                        <div style="font-size:10px;color:#b45309;margin-bottom:2px"><b>CL${cl.clarification_number ?? ci + 1}</b></div>
                        <div style="font-size:12px;font-weight:600;color:#111;margin-bottom:4px">${escapeHtml(cl.question || '')}</div>
                        <div style="font-size:12px;color:#374151"><b>Candidate Answer:</b> ${escapeHtml(cl.answer || '—')}</div>
                      </div>`;
                    });
                    g.followUps.forEach((fu: any, fi: number) => {
                      inner += `<div style="margin-top:8px;padding-left:10px;border-left:2px solid #c4b5fd">
                        <div style="font-size:10px;color:#7c3aed;margin-bottom:2px"><b>F${fi + 1}</b></div>
                        <div style="font-size:12px;font-weight:600;color:#111;margin-bottom:4px">${escapeHtml(fu.question || '')}</div>
                        <div style="font-size:12px;color:#374151"><b>Candidate Answer:</b> ${escapeHtml(fu.answer || '—')}</div>
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
                // Spec: P1=10, P2=7, P3=4 (memory: timed eval spec). Unknown
                // skills fall back to P3 weight rather than the previous 3,
                // which wasn't a real priority level.
                const priorityWeight = (p: number) => p === 1 ? 10 : p === 2 ? 7 : 4;

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
                            <span className={`flex-shrink-0 text-[10px] font-semibold rounded px-1.5 py-0.5 mt-0.5 ${badgeCls}`}>{badge}</span>
                            <div className="flex-1 min-w-0">
                              {fuSkipped && (
                                <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-500 ring-1 ring-slate-200 text-xs rounded-full mb-1">
                                  Skipped{fu.skip_source === 'user' ? ' by candidate' : ''}
                                </span>
                              )}
                              <p className="text-sm font-medium text-gray-800 leading-snug">{fu.question}</p>
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
                            <span className="flex-shrink-0 text-[10px] font-semibold rounded px-1.5 py-0.5 mt-0.5 text-brand-orange-deep bg-brand-orange/10 ring-1 ring-brand-orange/20">
                              CL{cl.clarification_number ?? cIdx + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 leading-snug">{cl.question}</p>
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

                  // Weighted final score using priority-derived weights
                  const totalW = skillsForQ.reduce((acc, s) => acc + priorityWeight(s.priority || 3), 0);
                  const weightedSum = skillsForQ.reduce((acc, s) => acc + s.score * priorityWeight(s.priority || 3), 0);
                  const finalScore = totalW > 0 ? weightedSum / totalW : (item.score ?? 0);

                  // AI summary: take the rep evaluation's one_line_note
                  const repEval = (evalsByQ[item.question_number] || []).reduce<any | null>(
                    (best, e) => (best == null || (e.score || 0) > (best.score || 0) ? e : best), null
                  );
                  const aiSummary = repEval?.one_line_note || '';

                  const duration = item.duration_seconds;
                  const finalScoreColor = finalScore >= 8 ? 'text-green-600' : finalScore >= 6 ? 'text-blue-600' : finalScore >= 4 ? 'text-yellow-600' : 'text-orange-600';

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
                                <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                                  <Clock className="w-3 h-3" />
                                  {duration} seconds
                                </span>
                              )}
                              {isSkipped && (
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-500 ring-1 ring-slate-200 text-xs rounded-full">
                                  {isNotAsked ? 'Not Asked' : `Skipped${item.skip_source === 'user' ? ' by candidate' : ''}`}
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-medium text-gray-900 leading-snug mb-2">{item.question}</p>
                            {skillsForQ.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {skillsForQ.map((s, i) => (
                                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-700 ring-1 ring-slate-200">
                                    {s.skill}
                                    {s.priority > 0 && (
                                      <span className="text-[10px] text-slate-500">(P{s.priority})</span>
                                    )}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-start gap-2 flex-shrink-0">
                            {!isSkipped && (
                              <div className="text-right">
                                <div className={`text-2xl font-bold ${finalScoreColor}`}>{finalScore.toFixed(finalScore % 1 === 0 ? 0 : 2)}</div>
                                <div className="text-[10px] text-gray-500 uppercase tracking-wider">Final Score</div>
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
                            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Candidate Answer</div>
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
                              <p className="text-sm text-gray-700 leading-relaxed">{aiSummary}</p>
                            </div>
                          )}

                          {/* Skill Scoring Breakdown */}
                          {skillsForQ.length > 0 && !isSkipped && (
                            <div>
                              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Skill Scoring Breakdown</div>
                              <div className="space-y-2">
                                {skillsForQ.map((s, i) => {
                                  const w = priorityWeight(s.priority || 3);
                                  const contribution = s.score * w;
                                  const pct = Math.min(100, Math.max(0, (s.score / 10) * 100));
                                  return (
                                    <div key={i} className="bg-slate-50 rounded-lg p-3">
                                      <div className="flex items-center justify-between mb-1.5">
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-sm font-medium text-gray-900">{s.skill}</span>
                                          {s.priority > 0 && (
                                            <span className="text-[10px] text-slate-500 bg-white px-1.5 py-0.5 rounded ring-1 ring-slate-200">P{s.priority}</span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-4 text-xs">
                                          <div><span className="text-gray-500">Score</span> <span className="font-semibold text-gray-900">{s.score.toFixed(s.score % 1 === 0 ? 0 : 1)}</span></div>
                                          <div><span className="text-gray-500">Weight</span> <span className="font-semibold text-gray-900">{w}</span></div>
                                          <div><span className="text-gray-500">Contribution</span> <span className="font-semibold text-gray-900">{contribution.toFixed(contribution % 1 === 0 ? 0 : 0)}</span></div>
                                        </div>
                                      </div>
                                      <div className="h-1.5 bg-white rounded-full overflow-hidden ring-1 ring-slate-200">
                                        <div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
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
                              <div className="font-mono text-xs text-gray-700 space-y-0.5">
                                <div>Question Score = Σ(Skill Score × Weight) / ΣWeights</div>
                                <div>= ({skillsForQ.map(s => `${s.score.toFixed(s.score % 1 === 0 ? 0 : 1)}×${priorityWeight(s.priority || 3)}`).join(' + ')}) / {totalW} = {finalScore.toFixed(finalScore % 1 === 0 ? 0 : 2)}</div>
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
                    <div key={cardKey} className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
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
                                <span className="inline-flex items-center gap-1 text-xs text-gray-500">
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
                                  <span className="px-2 py-0.5 bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 text-xs rounded-full">{label}</span>
                                );
                              })()}
                              {isSkipped && (
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-500 ring-1 ring-slate-200 text-xs rounded-full">
                                  {isNotAsked ? 'Not Asked' : `Skipped${item.skip_source === 'user' ? ' by candidate' : ''}`}
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-medium text-gray-900 leading-snug">{item.question}</p>
                          </div>
                          <div className="flex-shrink-0">
                            {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                          </div>
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="px-4 pb-4 border-t border-gray-100 pt-4 space-y-3">
                          <div>
                            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Candidate Answer</div>
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
                    <h3 className="text-base font-semibold text-gray-900">{title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${badgeCls}`}>{badge}</span>
                  </div>
                );

                return (
                  <div className="space-y-6">
                    {/* Export toolbar */}
                    <div className="flex justify-end relative">
                      <button
                        onClick={() => setQaExportMenuOpen(v => !v)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-brand-blue text-white hover:from-brand-blue-2 hover:to-brand-blue shadow-sm shadow-brand-blue/20 ring-1 ring-brand-blue/30"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Export
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      {qaExportMenuOpen && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setQaExportMenuOpen(false)} />
                          <div className="absolute right-0 top-9 z-20 w-32 bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-lg shadow-brand-blue/10 py-1">
                            <button onClick={exportQaPDF} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue">
                              <FileText className="w-3.5 h-3.5 text-red-500" /> PDF
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
                          badge="Scored for Pass/Fail"
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
              placeholderMsg ? renderPlaceholder(placeholderMsg) : (
                <RecordingTabContent
                  interview={liveSession}
                  videoBlobUrl={videoBlobUrl}
                  videoBlobSize={videoBlobSize}
                  videoLoading={videoLoading}
                  videoError={videoError}
                  setVideoError={setVideoError}
                  screenBlobUrl={screenBlobUrl}
                  screenBlobSize={screenBlobSize}
                  screenLoading={screenLoading}
                  screenError={screenError}
                />
              )
            )}

            {/* Transcript Tab — use liveSession so evaluation_ready refresh populates
                the transcript even when the recruiter opened the view mid-interview */}
            {!evaluationPending && activeTab === 'transcript' && (
              placeholderMsg ? renderPlaceholder(placeholderMsg) : (() => {
                // Silence prompts ("Are you there?…") and closing thank-yous are
                // meta-messages from Linda, not real questions. They must not
                // count toward Q#/F# numbering or the message total — match
                // the backend's _is_silence_or_closing_prompt filter.
                const _isMetaAssistant = (msg: any) => {
                  if (msg.role !== 'assistant') return false;
                  const c = (msg.content || '').toLowerCase().trim();
                  return c.startsWith('are you there')
                    || c.startsWith('thank you for taking the time')
                    || c.startsWith('thanks for taking the time')
                    || c.startsWith('thank you for speaking')
                    || c.startsWith('it was great chatting');
                };
                const messages = (liveSession.conversation_transcript || interview.conversation_transcript || [])
                  .filter((msg: any) => msg.role !== 'system' && msg.content?.trim() && !_isMetaAssistant(msg));

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
                type QType = 'followup' | 'deepdive' | 'main' | 'closing';
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

                type Labeled = { msg: any; label: string; isFollowUp: boolean; qtype: QType };
                const labeled: Labeled[] = [];
                let mainCount = 0;
                let currentLabel = '';
                let currentQtype: QType = 'main';
                let fuCounter = 0;
                let ddCounter = 0;
                let clCounter = 0;  // Clarifications under current main Q
                // Detect clarifications by either explicit flag (backend) or
                // the recognizable rephrase opener Linda uses.
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
                    (t.includes('your responses have been recorded') && t.includes('wish you all the best'))
                  );
                };
                for (const m of messages) {
                  if (m.role === 'assistant') {
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

                const ToggleBtn = ({ value, label, icon }: { value: 'chat' | 'table'; label: string; icon: React.ReactNode }) => (
                  <button
                    onClick={() => setTranscriptView(value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      transcriptView === value ? 'bg-white text-brand-blue shadow-sm ring-1 ring-brand-blue/15' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {icon}
                    {label}
                  </button>
                );

                return (
                  <div className="w-full">
                    {/* Header with view toggle */}
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-brand-blue ring-1 ring-white/20 shadow-sm shadow-brand-blue/20 flex items-center justify-center">
                            <Bot className="w-3.5 h-3.5 text-white" />
                          </div>
                          <span className="text-xs text-gray-500">Linda (AI Interviewer)</span>
                        </div>
                        <span className="text-gray-200">·</span>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-brand-cyan ring-1 ring-white/20 shadow-sm shadow-brand-cyan/15 flex items-center justify-center text-white font-semibold text-[10px]">
                            {candidateName[0].toUpperCase()}
                          </div>
                          <span className="text-xs text-gray-500">{candidateName}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-400">{messages.length} messages</span>
                        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 ring-1 ring-slate-200">
                          <ToggleBtn value="chat" label="Chat" icon={<MessageSquare className="w-3.5 h-3.5" />} />
                          <ToggleBtn value="table" label="Table" icon={<Layers className="w-3.5 h-3.5" />} />
                        </div>
                      </div>
                    </div>

                    {transcriptView === 'chat' && (
                      <div className="space-y-4 w-full">
                        {labeled.map(({ msg, label, isFollowUp, qtype }, idx) => {
                          const isAssistant = msg.role === 'assistant';
                          const ts = formatTs(msg.timestamp);
                          const content = msg.content as string;
                          const rawContent: string | undefined = !isAssistant ? msg.raw_content : undefined;
                          const language: string | undefined = !isAssistant ? msg.language : undefined;
                          const hasCorrection = !isAssistant && rawContent && rawContent !== content;
                          const diff = hasCorrection ? diffWords(rawContent || '', content) : null;

                          return (
                            <div
                              key={idx}
                              className={`flex gap-2.5 ${isAssistant ? '' : 'flex-row-reverse'} ${isFollowUp ? `pl-6 border-l-2 ml-3 ${qtype === 'deepdive' ? 'border-brand-teal/30' : 'border-brand-cyan/30'}` : ''}`}
                            >
                              <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold mt-0.5 ring-1 ring-white/20 shadow-sm ${
                                isAssistant ? 'bg-brand-blue text-white shadow-brand-blue/20' : 'bg-brand-cyan text-white shadow-brand-cyan/15'
                              }`}>
                                {isAssistant ? <Bot className="w-3.5 h-3.5" /> : candidateName[0].toUpperCase()}
                              </div>

                              <div className={`max-w-[75%] ${isAssistant ? '' : 'items-end flex flex-col'}`}>
                                {(label || language) && (
                                  <div className={`flex items-center gap-1.5 mb-1 ${isAssistant ? '' : 'flex-row-reverse'}`}>
                                    {label && (
                                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded leading-none ring-1 ${
                                        qtype === 'deepdive' ? 'bg-brand-teal/10 text-brand-teal ring-brand-teal/20' : isFollowUp ? 'bg-brand-cyan/10 text-brand-cyan ring-brand-cyan/20' : 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20'
                                      }`}>
                                        {label}
                                      </span>
                                    )}
                                    {language && !isAssistant && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 ring-1 ring-slate-200 leading-none">
                                        {language}
                                      </span>
                                    )}
                                  </div>
                                )}

                                {isAssistant ? (
                                  <div className="px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed bg-slate-100 text-gray-800 rounded-tl-sm ring-1 ring-slate-200/60">
                                    {content}
                                  </div>
                                ) : hasCorrection && diff ? (
                                  <>
                                    {/* Original (raw ASR) — shown FIRST */}
                                    <div className="px-3.5 py-2.5 rounded-2xl rounded-tr-sm text-sm leading-relaxed bg-brand-orange/10 ring-1 ring-brand-orange/25 text-brand-orange-deep">
                                      <div className="text-[10px] font-semibold text-brand-orange-deep mb-1 uppercase tracking-wide">Original (ASR)</div>
                                      <DiffText parts={diff.raw} tone="raw" />
                                    </div>
                                    {/* Corrected — shown BELOW */}
                                    <div className="mt-1.5 px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed bg-brand-blue text-white ring-1 ring-brand-blue/30 shadow-sm shadow-brand-blue/15">
                                      <div className="text-[10px] font-semibold text-white/80 mb-1 uppercase tracking-wide">Corrected</div>
                                      <DiffText parts={diff.corrected} tone="corrected" />
                                    </div>
                                    {diff.mode === 'sentence' && (
                                      <div className="text-[10px] text-brand-orange-deep mt-1 pr-1 text-right italic">full-sentence rewrite</div>
                                    )}
                                  </>
                                ) : (
                                  <div className="px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed bg-brand-blue text-white rounded-tr-sm ring-1 ring-brand-blue/30 shadow-sm shadow-brand-blue/15">
                                    {content}
                                  </div>
                                )}

                                {ts && (
                                  <div className={`text-[10px] text-gray-400 mt-1 ${isAssistant ? 'pl-1' : 'pr-1 text-right'}`}>
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

                      for (const m of messages) {
                        if (m.role === 'assistant') {
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
                          const raw = (m.raw_content || m.content || '') as string;
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
                      const escapeCsv = (v: string) => {
                        const s = (v ?? '').toString();
                        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
                      };
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
                      const buildRows = () => flatRows.map(r => ({
                        'S.No': String(r.sno),
                        'Question ID': r.questionId,
                        'Type': r.type,
                        'Question': r.question,
                        'Raw Transcript': r.raw,
                        'Corrected Transcript': r.corrected,
                        'Language': r.language,
                        'Timestamp': formatTs(r.timestamp),
                      }));
                      const download = (blob: Blob, filename: string) => {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      };
                      const baseName = `transcript_${interview.candidate_name || 'candidate'}_${liveSession.id.slice(0, 8)}`.replace(/\s+/g, '_');
                      const exportCSV = () => {
                        const rows = buildRows();
                        if (rows.length === 0) return;
                        const headers = Object.keys(rows[0]);
                        const lines = [headers.join(',')];
                        for (const r of rows) lines.push(headers.map(h => escapeCsv(r[h])).join(','));
                        download(new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' }), `${baseName}.csv`);
                        setExportMenuOpen(false);
                      };
                      const exportXLSX = async () => {
                        const rows = buildRows();
                        if (rows.length === 0) return;
                        const ExcelJS = (await import('exceljs')).default;
                        const wb = new ExcelJS.Workbook();
                        const ws = wb.addWorksheet('Transcript');
                        const headers = Object.keys(rows[0]);
                        const widths = [6, 14, 10, 50, 50, 50, 10, 12];
                        ws.columns = headers.map((h, i) => ({ header: h, key: h, width: widths[i] ?? 15 }));
                        ws.addRows(rows);
                        const buf = await wb.xlsx.writeBuffer();
                        download(
                          new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
                          `${baseName}.xlsx`,
                        );
                        setExportMenuOpen(false);
                      };

                      return (
                        <div className="space-y-3">
                          {/* Export toolbar */}
                          <div className="flex justify-end relative">
                            <button
                              onClick={() => setExportMenuOpen(v => !v)}
                              disabled={groups.length === 0}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-brand-blue text-white hover:from-brand-blue-2 hover:to-brand-blue shadow-sm shadow-brand-blue/20 ring-1 ring-brand-blue/30 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Download className="w-3.5 h-3.5" />
                              Export
                              <ChevronDown className="w-3 h-3" />
                            </button>
                            {exportMenuOpen && (
                              <>
                                <div className="fixed inset-0 z-10" onClick={() => setExportMenuOpen(false)} />
                                <div className="absolute right-0 top-9 z-20 w-32 bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-lg shadow-brand-blue/10 py-1">
                                  <button onClick={exportCSV} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue">
                                    <FileText className="w-3.5 h-3.5 text-slate-400" /> CSV
                                  </button>
                                  <button onClick={exportXLSX} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue">
                                    <FileText className="w-3.5 h-3.5 text-green-600" /> XLSX
                                  </button>
                                </div>
                              </>
                            )}
                          </div>

                          <div className="overflow-x-auto rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 bg-white">
                            <table className="w-full text-sm">
                              <thead className="bg-slate-50 text-gray-600 text-xs uppercase tracking-wide border-b border-gray-100">
                                <tr>
                                  <th className="px-3 py-2.5 text-left font-semibold w-12">S.No</th>
                                  <th className="px-3 py-2.5 text-left font-semibold w-20">Question ID</th>
                                  <th className="px-3 py-2.5 text-left font-semibold w-24">Type</th>
                                  <th className="px-3 py-2.5 text-left font-semibold">Question</th>
                                  <th className="px-3 py-2.5 text-left font-semibold">Raw Transcript</th>
                                  <th className="px-3 py-2.5 text-left font-semibold">Corrected Transcript</th>
                                  <th className="px-3 py-2.5 text-left font-semibold w-20">Language</th>
                                  <th className="px-3 py-2.5 text-left font-semibold w-20">Timestamp</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {flatRows.map((r, idx) => {
                                  const diff = r.raw && r.corrected ? diffWords(r.raw, r.corrected) : null;
                                  const isFu = r.type === 'Followup';
                                  const isDd = r.type === 'Deep Dive';
                                  const isSub = isFu || isDd;
                                  return (
                                    <tr key={idx} className={`align-top ${isDd ? 'bg-brand-teal/5' : isFu ? 'bg-brand-cyan/5' : 'bg-white'}`}>
                                      <td className="px-3 py-3 align-top text-xs text-gray-500">{r.sno}</td>
                                      <td className="px-3 py-3 align-top">
                                        <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">
                                          {r.questionId}
                                        </span>
                                      </td>
                                      <td className="px-3 py-3 align-top">
                                        <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ring-1 ${
                                          isDd ? 'bg-brand-teal/10 text-brand-teal ring-brand-teal/20' : isFu ? 'bg-brand-cyan/10 text-brand-cyan ring-brand-cyan/20' : 'bg-slate-100 text-slate-600 ring-slate-200'
                                        }`}>
                                          {r.type}
                                        </span>
                                      </td>
                                      <td className="px-3 py-3 align-top text-[12px] text-gray-700 leading-snug italic">
                                        {r.question || '—'}
                                      </td>
                                      <td className="px-3 py-3 align-top text-brand-orange-deep leading-snug">
                                        {diff && diff.mode !== 'none'
                                          ? <DiffText parts={diff.raw} tone="raw" />
                                          : <span className="text-gray-700">{r.raw || '—'}</span>}
                                      </td>
                                      <td className="px-3 py-3 align-top text-gray-800 leading-snug">
                                        {diff && diff.mode !== 'none'
                                          ? <DiffText parts={diff.corrected} tone="corrected" />
                                          : <span>{r.corrected || '—'}</span>}
                                      </td>
                                      <td className="px-3 py-3 align-top text-xs text-gray-500">{r.language || 'English'}</td>
                                      <td className="px-3 py-3 align-top text-xs text-gray-500 whitespace-nowrap">{formatTs(r.timestamp)}</td>
                                    </tr>
                                  );
                                })}
                                {flatRows.length === 0 && (
                                  <tr><td colSpan={8} className="px-4 py-6 text-center text-xs text-gray-400">No candidate responses recorded.</td></tr>
                                )}
                              </tbody>
                            </table>
                          </div>
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
                // Pass special_instructions so the Analysis tab can read
                // the Question Distribution plan (mth/nth_question_skill_map)
                // and show EXACTLY the configured skills per slot — no
                // text-scan extras, no evaluator-topic extras.
                special_instructions: (interview as any).special_instructions || (liveSession as any).special_instructions,
              });
              return <QuestionsView data={data} />;
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
                if (band === 'Strong')     return { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700',  bar: 'bg-green-500',  dot: 'bg-green-500' };
                if (band === 'Proficient') return { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   bar: 'bg-blue-500',   dot: 'bg-blue-500' };
                if (band === 'Developing') return { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', bar: 'bg-yellow-400', dot: 'bg-yellow-400' };
                if (band === 'Weak')       return { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', bar: 'bg-orange-400', dot: 'bg-orange-400' };
                return                           { bg: 'bg-gray-50',    border: 'border-gray-200',   text: 'text-gray-500',   bar: 'bg-gray-200',   dot: 'bg-gray-300' };
              };

              const scoreColor = (score: number | null) => {
                if (score == null) return 'text-gray-400';
                if (score >= 80) return 'text-green-600';
                if (score >= 60) return 'text-blue-600';
                if (score >= 40) return 'text-yellow-600';
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
                        <Award className="w-6 h-6 text-yellow-400" />
                        <div>
                          <div className="text-base font-semibold">Overall Capability Score</div>
                          <div className="text-xs text-gray-400 mt-0.5">Final weighted score — MTH + NTH + HR</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-5xl font-bold text-white">{capScore}</div>
                        <div className="text-xs text-gray-400 mt-1">out of 100</div>
                      </div>
                    </div>
                    {/* Score bar */}
                    <div className="h-2 bg-gray-100">
                      <div
                        className={`h-2 transition-all duration-700 ${capScore >= 80 ? 'bg-green-500' : capScore >= 60 ? 'bg-blue-500' : capScore >= 40 ? 'bg-yellow-400' : 'bg-orange-400'}`}
                        style={{ width: `${capScore}%` }}
                      />
                    </div>
                  </div>

                  {/* ── Section Score Cards ── */}
                  {Object.keys(sectionScores).length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {(['mth', 'nth', 'hr'] as const).map(key => {
                        const sec = sectionScores[key];
                        if (!sec) return null;
                        const bc = bandColor(sec.band);
                        const sectionLabel = sec.section_name || key.toUpperCase();
                        return (
                          <div key={key} className={`rounded-xl border ${bc.border} overflow-hidden`}>
                            <div className={`px-4 py-3 ${bc.bg} border-b ${bc.border}`}>
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{sectionLabel}</span>
                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${bc.border} ${bc.bg} ${bc.text}`}>{sec.band}</span>
                              </div>
                            </div>
                            <div className="px-4 py-4 bg-white">
                              <div className="flex items-end gap-2">
                                <span className={`text-3xl font-bold ${scoreColor(sec.score)}`}>
                                  {sec.score != null ? sec.score : '—'}
                                </span>
                                <span className="text-sm text-gray-400 mb-1">/ 100</span>
                                <span className="ml-auto text-xs text-gray-400 mb-1">{sec.section_pct}% weight</span>
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
                          <h3 className="text-sm font-semibold text-gray-800">{sectionLabel}</h3>
                          {sec && <span className="text-xs text-gray-400">({sec.section_pct}% of final score)</span>}
                        </div>

                        {clusters.length === 0 && (
                          <div className="text-xs text-gray-400 px-2">No clusters evaluated for this section.</div>
                        )}

                        {clusters.map(cluster => {
                          const bc = bandColor(cluster.band);
                          return (
                            <div key={cluster.cluster_name} className={`rounded-xl border ${bc.border} overflow-hidden`}>
                              {/* Cluster header */}
                              <div className={`flex items-center justify-between px-4 py-3 ${bc.bg}`}>
                                <div className="flex items-center gap-2 min-w-0">
                                  <TrendingUp className={`w-4 h-4 flex-shrink-0 ${bc.text}`} />
                                  <span className="text-sm font-semibold text-gray-800 truncate">{cluster.cluster_name}</span>
                                  <span className="text-[10px] text-gray-400 flex-shrink-0">Priority {cluster.priority} · {cluster.weight}% weight</span>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${bc.border} ${bc.bg} ${bc.text}`}>{cluster.band}</span>
                                  <span className={`text-lg font-bold ${scoreColor(cluster.band_score)}`}>
                                    {cluster.band_score != null ? cluster.band_score : '—'}
                                  </span>
                                  <span className="text-xs text-gray-400">/100</span>
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
                                        <span className="text-xs text-gray-700 flex-1 min-w-0">{ss.skill}</span>
                                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border flex-shrink-0 ${sbc.bg} ${sbc.border} ${sbc.text}`}>{ss.band}</span>
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
                                <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-[11px] text-gray-500 italic">
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

            {/* Violations Tab */}
            {!evaluationPending && activeTab === 'violations' && (
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
                        <p className="text-xs text-gray-500 mt-0.5">
                          {totalViolations === 0
                            ? 'No violations detected during this interview.'
                            : `${totalViolations} total violation${totalViolations !== 1 ? 's' : ''} detected`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-2xl font-bold ${risk.color}`}>{totalViolations}</span>
                      <button
                        onClick={() => setShowThresholdEditor(p => !p)}
                        aria-label="Configure risk thresholds" title="Configure risk thresholds"
                        className="p-1.5 rounded-lg border border-gray-200 ring-1 ring-black/[0.02] bg-white text-gray-500 hover:text-brand-blue hover:border-brand-blue/40 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Threshold Editor — configures per-box risk levels */}
                  {showThresholdEditor && (
                    <div className="px-4 pb-3 border-t border-gray-200 pt-3 bg-white/60 backdrop-blur-sm">
                      <p className="text-xs font-medium text-gray-600 mb-2 tracking-tight">Configure Per-Violation Risk Thresholds</p>
                      <div className="flex items-center gap-4 flex-wrap">
                        <label className="flex items-center gap-2 text-xs text-gray-600">
                          <span className="text-brand-blue font-medium">Low Risk</span>
                          <span>0 –</span>
                          <input
                            type="number" min={1} max={violationThresholds.medMax - 1}
                            value={violationThresholds.lowMax}
                            onChange={e => setViolationThresholds(t => ({ ...t, lowMax: Math.max(1, Math.min(t.medMax - 1, Number(e.target.value))) }))}
                            className="w-14 px-2 py-1 rounded-md border border-gray-200 text-xs text-center focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                          />
                          <span className="text-gray-400">violations</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs text-gray-600">
                          <span className="text-brand-orange-deep font-medium">Medium Risk</span>
                          <span>{violationThresholds.lowMax + 1} –</span>
                          <input
                            type="number" min={violationThresholds.lowMax + 1}
                            value={violationThresholds.medMax}
                            onChange={e => setViolationThresholds(t => ({ ...t, medMax: Math.max(t.lowMax + 1, Number(e.target.value)) }))}
                            className="w-14 px-2 py-1 rounded-md border border-gray-200 text-xs text-center focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                          />
                          <span className="text-gray-400">violations</span>
                        </label>
                        <span className="text-xs text-red-600 font-medium">{violationThresholds.medMax + 1}+ = High Risk</span>
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
                    'face_mismatch', 'face_identity_changed',
                    'voice_mismatch', 'voice_identity_changed',
                    'screenshot_attempt', 'screen_recording_attempt', 'screen_share_stopped',
                  ];
                  return (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 tracking-tight">Violation Breakdown</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
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
                                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${boxRisk.cls}`}>
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
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 tracking-tight">Event Log</h3>
                  {groupedViolations.length === 0 ? (
                    <div className="text-center py-12 bg-green-50 rounded-xl border border-green-200 ring-1 ring-green-100">
                      <ShieldAlert className="w-8 h-8 text-green-500 mx-auto mb-2" />
                      <p className="text-sm font-medium text-green-700">No violations recorded</p>
                      <p className="text-xs text-green-600/80 mt-1">This interview completed with a clean integrity status.</p>
                    </div>
                  ) : (
                    <>
                      <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 border-b border-gray-100">
                            <tr>
                              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-10">#</th>
                              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Event</th>
                              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Time</th>
                              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Severity</th>
                              <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Count</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {pagedViolations.map((row, idx) => {
                              const cfg = EVENT_CONFIG[row.event_type];
                              const sev = normaliseSeverity(row.severity);
                              const sevStyle =
                                sev === 'severe'   ? 'bg-red-100 text-red-700 ring-1 ring-red-200' :
                                sev === 'moderate' ? 'bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20' :
                                                     'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20';
                              const countStyle =
                                row.count >= 5 ? 'text-red-600 font-bold' :
                                row.count >= 3 ? 'text-brand-orange-deep font-semibold' :
                                                 'text-gray-600';
                              const globalIdx = (violationPage - 1) * ROWS_PER_PAGE + idx + 1;
                              return (
                                <tr key={idx} className="hover:bg-brand-blue/[0.02] transition-colors">
                                  <td className="px-4 py-2.5 text-xs text-gray-400">{globalIdx}</td>
                                  <td className="px-4 py-2.5">
                                    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ring-1 ${
                                      cfg ? `${cfg.bg} ${cfg.color} ring-black/[0.04]` : 'bg-slate-100 text-slate-600 ring-slate-200'
                                    }`}>
                                      {cfg?.icon}
                                      {cfg?.label ?? row.event_type.replace(/_/g, ' ')}
                                    </div>
                                  </td>
                                  <td className="px-4 py-2.5 text-xs text-gray-500 font-mono">{formatTs(row.timestamp)}</td>
                                  <td className="px-4 py-2.5">
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

                      {/* Pagination */}
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between mt-3 px-4 py-3 bg-slate-50 border-t border-gray-100 rounded-b-xl">
                          <p className="text-xs text-gray-500">
                            Showing {(violationPage - 1) * ROWS_PER_PAGE + 1}–{Math.min(violationPage * ROWS_PER_PAGE, groupedViolations.length)} of {groupedViolations.length} events
                          </p>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setViolationPage(p => Math.max(1, p - 1))}
                              disabled={violationPage === 1}
                              className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-brand-blue hover:border-brand-blue/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <span className="text-xs text-gray-600 px-2">{violationPage} / {totalPages}</span>
                            <button
                              onClick={() => setViolationPage(p => Math.min(totalPages, p + 1))}
                              disabled={violationPage === totalPages}
                              className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-brand-blue hover:border-brand-blue/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
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
    </main>
  );
}
