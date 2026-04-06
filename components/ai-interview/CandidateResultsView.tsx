'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  ArrowLeft, Clock, MessageSquare, ThumbsUp, ThumbsDown,
  AlertTriangle, VideoOff, ChevronDown, ChevronUp, Video,
  BarChart3, Brain, FileText, Layers, Bot,
  ShieldAlert, Monitor, Clipboard, MousePointer, Eye, UserX,
  Volume2, Users, Maximize2, Camera, Mic, User, ChevronLeft, ChevronRight,
  Shield, CheckCircle2, XCircle, Activity, RefreshCw,
} from 'lucide-react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend,
} from 'recharts';
import type { AIInterviewResponse } from '@/lib/services/aiInterviewService';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import api from '@/lib/services/api';
import { formatISTDate } from '@/lib/utils/dateUtils';
import ClusterInsightsTab from './ClusterInsightsTab';

interface CandidateResultsViewProps {
  interview: AIInterviewResponse;
  onBack: () => void;
}

type TabKey = 'overview' | 'sentiment' | 'qa' | 'recording' | 'transcript' | 'clusters' | 'violations' | 'skill_coverage';

/* ─── Proctoring helpers ─────────────────────────────────────────── */
interface ViolationRecord {
  event_type: string;
  severity: string;
  timestamp?: string;
  details?: Record<string, unknown>;
}

const EVENT_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string; border: string }> = {
  tab_switch:               { label: 'Tab Switch',           icon: <Monitor className="w-4 h-4" />,      color: 'text-orange-600', bg: 'bg-orange-50',  border: 'border-orange-200' },
  window_blur:              { label: 'Window Blur',          icon: <Eye className="w-4 h-4" />,           color: 'text-red-600',    bg: 'bg-red-50',     border: 'border-red-200'    },
  copy_attempt:             { label: 'Copy Attempt',         icon: <Clipboard className="w-4 h-4" />,     color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200' },
  paste_attempt:            { label: 'Paste Attempt',        icon: <MousePointer className="w-4 h-4" />,  color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200' },
  camera_disabled:          { label: 'Camera Disabled',      icon: <Camera className="w-4 h-4" />,        color: 'text-gray-600',   bg: 'bg-gray-50',   border: 'border-gray-200'   },
  camera_obstructed:        { label: 'Camera Obstructed',    icon: <Eye className="w-4 h-4" />,           color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
  microphone_disabled:      { label: 'Mic Disabled',         icon: <Mic className="w-4 h-4" />,           color: 'text-gray-600',   bg: 'bg-gray-50',   border: 'border-gray-200'   },
  voice_detected:           { label: 'Voice Detected',       icon: <Volume2 className="w-4 h-4" />,       color: 'text-pink-600',   bg: 'bg-pink-50',   border: 'border-pink-200'   },
  multiple_voices:          { label: 'Multiple Voices',      icon: <Volume2 className="w-4 h-4" />,       color: 'text-pink-700',   bg: 'bg-pink-50',   border: 'border-pink-200'   },
  multiple_faces:           { label: 'Multiple Faces',       icon: <Users className="w-4 h-4" />,         color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-200' },
  face_missing:             { label: 'Face Not Visible',     icon: <UserX className="w-4 h-4" />,         color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200'    },
  gaze_away:                { label: 'Gaze Away',            icon: <Eye className="w-4 h-4" />,           color: 'text-orange-500', bg: 'bg-orange-50', border: 'border-orange-200' },
  fullscreen_exit:          { label: 'Fullscreen Exit',      icon: <Maximize2 className="w-4 h-4" />,     color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200'   },
  screenshot_attempt:       { label: 'Screenshot Attempt',   icon: <Camera className="w-4 h-4" />,        color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200'  },
  screen_recording_attempt: { label: 'Screen Recording',     icon: <Video className="w-4 h-4" />,         color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200'  },
  face_mismatch:            { label: 'Face Mismatch',        icon: <User className="w-4 h-4" />,          color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
  face_identity_changed:    { label: 'Identity Changed',     icon: <UserX className="w-4 h-4" />,         color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200'    },
  voice_mismatch:           { label: 'Voice Mismatch',       icon: <Mic className="w-4 h-4" />,           color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
  voice_identity_changed:   { label: 'Voice ID Changed',     icon: <Mic className="w-4 h-4" />,           color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200'    },
};

function getRiskLevel(count: number): { label: string; color: string; bg: string; border: string } {
  if (count === 0)  return { label: 'Clean',       color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-300' };
  if (count <= 2)   return { label: 'Low Risk',    color: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-200' };
  if (count <= 5)   return { label: 'Medium Risk', color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-300' };
  return              { label: 'High Risk',    color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-300'   };
}

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
}: {
  label: string;
  hasFile: boolean;
  blobUrl: string | null;
  loading: boolean;
  error: boolean;
  onError: () => void;
}) {
  if (!hasFile) {
    return (
      <div className="text-center py-12">
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
          <VideoOff className="w-6 h-6 text-gray-400" />
        </div>
        <p className="text-gray-500 text-sm">{label} not available</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="text-center py-12">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
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
        <div className="w-8 h-8 border-4 border-gray-300 border-t-gray-600 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500">Loading {label.toLowerCase()}…</p>
      </div>
    );
  }
  if (blobUrl) {
    return (
      <video controls className="w-full max-h-[500px] rounded-lg bg-black" src={blobUrl} onError={onError}>
        Your browser does not support video playback.
      </video>
    );
  }
  return null;
}

function RecordingTabContent({
  interview,
  videoBlobUrl, videoLoading, videoError, setVideoError,
  screenBlobUrl, screenLoading, screenError,
}: {
  interview: AIInterviewResponse;
  videoBlobUrl: string | null;
  videoLoading: boolean;
  videoError: boolean;
  setVideoError: (v: boolean) => void;
  screenBlobUrl: string | null;
  screenLoading: boolean;
  screenError: boolean;
}) {
  const [recView, setRecView] = useState<'candidate' | 'screen'>('candidate');

  return (
    <div className="space-y-4">
      {/* Sub-tab pills */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setRecView('candidate')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            recView === 'candidate' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Camera className="w-3.5 h-3.5" /> Candidate View
        </button>
        <button
          onClick={() => setRecView('screen')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            recView === 'screen' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Monitor className="w-3.5 h-3.5" /> Interview View
        </button>
      </div>

      {recView === 'candidate' ? (
        <VideoPane
          label="Candidate recording"
          hasFile={!!interview.recording_file_path}
          blobUrl={videoBlobUrl}
          loading={videoLoading}
          error={videoError}
          onError={() => setVideoError(true)}
        />
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            Screen recording captured during the interview session.
          </p>
          <VideoPane
            label="Screen recording"
            hasFile={!!interview.screen_recording_file_path}
            blobUrl={screenBlobUrl}
            loading={screenLoading}
            error={screenError}
            onError={() => {}}
          />
        </div>
      )}
    </div>
  );
}

export default function CandidateResultsView({ interview, onBack }: CandidateResultsViewProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [videoError, setVideoError] = useState(false);
  const [videoBlobUrl, setVideoBlobUrl] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [screenBlobUrl, setScreenBlobUrl] = useState<string | null>(null);
  const [screenLoading, setScreenLoading] = useState(false);
  const [screenError, setScreenError] = useState(false);
  const [expandedQuestions, setExpandedQuestions] = useState<Set<number>>(new Set());
  const [violationPage, setViolationPage] = useState(1);
  const [identityPhotoUrl, setIdentityPhotoUrl] = useState<string | null>(null);
  const [identityPhotoError, setIdentityPhotoError] = useState(false);

  // Fetch recording with auth headers and create blob URL
  useEffect(() => {
    if (activeTab !== 'recording' || !interview.recording_file_path || videoBlobUrl) return;
    let cancelled = false;
    setVideoLoading(true);
    api.get(`/ai-interview/${interview.id}/recording`, { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return;
        const url = URL.createObjectURL(res.data);
        setVideoBlobUrl(url);
      })
      .catch(() => {
        if (!cancelled) setVideoError(true);
      })
      .finally(() => {
        if (!cancelled) setVideoLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeTab, interview.recording_file_path, interview.id, videoBlobUrl]);

  // Fetch screen recording when recording tab is active
  useEffect(() => {
    if (activeTab !== 'recording' || !interview.screen_recording_file_path || screenBlobUrl || screenError) return;
    let cancelled = false;
    setScreenLoading(true);
    api.get(`/ai-interview/${interview.id}/screen-recording`, { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return;
        setScreenBlobUrl(URL.createObjectURL(res.data));
      })
      .catch(() => { if (!cancelled) setScreenError(true); })
      .finally(() => { if (!cancelled) setScreenLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, interview.screen_recording_file_path, interview.id, screenBlobUrl, screenError]);

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

  // Live skill coverage — WebSocket monitor + REST fallback for in_progress sessions
  const [liveSession, setLiveSession] = useState(interview);
  const [liveWsConnected, setLiveWsConnected] = useState(false);
  useEffect(() => { setLiveSession(interview); }, [interview]);

  useEffect(() => {
    if (liveSession.status !== 'in_progress') return;

    // Try a monitor WebSocket for push-based updates
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const apiBase = process.env.NEXT_PUBLIC_API_URL?.replace(/^https?:\/\//, '').replace(/\/api\/v1$/, '') || 'localhost:8000';
    const wsUrl = `${protocol}//${apiBase}/api/v1/ws/ai-interview/${liveSession.id}/monitor`;

    let ws: WebSocket | null = null;
    let pollId: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (pollId) return;
      pollId = setInterval(() => {
        aiInterviewService.get(liveSession.id)
          .then((updated) => setLiveSession(updated))
          .catch(() => {});
      }, 3000);
    };

    try {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => { setLiveWsConnected(true); };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          // Backend pushes full session updates or skill_coverage patches
          if (msg.type === 'session_update' && msg.data) {
            setLiveSession((prev) => ({ ...prev, ...msg.data }));
          } else if (msg.type === 'skill_coverage' && msg.data) {
            setLiveSession((prev) => ({ ...prev, skill_coverage: msg.data }));
          } else if (msg.type === 'status_update' && msg.data?.status) {
            setLiveSession((prev) => ({ ...prev, ...msg.data }));
          }
        } catch { /* non-JSON frame, ignore */ }
      };
      ws.onerror = () => { setLiveWsConnected(false); startPolling(); };
      ws.onclose = () => { setLiveWsConnected(false); startPolling(); };
    } catch {
      startPolling();
    }

    return () => {
      if (ws) { ws.onopen = null; ws.onmessage = null; ws.onerror = null; ws.onclose = null; ws.close(); }
      if (pollId) clearInterval(pollId);
      setLiveWsConnected(false);
    };
  }, [liveSession.status, liveSession.id]);

  const eval_ = liveSession.ai_evaluation || {};
  const isCompleted = liveSession.status === 'completed';
  const isInProgress = liveSession.status === 'in_progress';
  const isPartial = eval_.partial === true;
  const hasData = isCompleted || isPartial;

  // Flexible/conversational mode is identified by the presence of capability_score_reasoning,
  // which is generated only for flexible mode interviews (AC — Mode Indicator).
  const isFlexibleMode = !!eval_.capability_score_reasoning;

  // Convert raw 1-5 evaluator score → 0-100 performance percentage for display
  const roundScores: { name: string; score: number; percentage: number; weight: number }[] = useMemo(() => {
    return (eval_.round_scores || []).map((r: any) => {
      const raw = r.score ?? 0;
      // raw is on 1-5 scale; convert to 0-100
      const pct = raw > 0 ? Math.round((raw / 5) * 100) : 0;
      return {
        name: r.type?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || 'Unknown',
        score: raw,
        percentage: pct,
        weight: r.percentage ?? 0,
      };
    });
  }, [eval_.round_scores]);

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
      completed: 'bg-green-100 text-green-700',
      in_progress: 'bg-yellow-100 text-yellow-700',
      invited: 'bg-purple-100 text-purple-700',
      cancelled: 'bg-red-100 text-red-700',
      draft: 'bg-gray-100 text-gray-600',
    };
    return map[status] || 'bg-gray-100 text-gray-600';
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
    if (score >= 4) return 'text-green-600 bg-green-50 border-green-200';
    if (score >= 3) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-red-600 bg-red-50 border-red-200';
  };

  const toggleQuestion = (idx: number) => {
    setExpandedQuestions(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
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

  // Proctoring violations from the interview object
  const violations: ViolationRecord[] = useMemo(
    () => interview.proctoring_violations ?? [],
    [interview],
  );
  const totalViolations = violations.length;
  const risk = getRiskLevel(totalViolations);

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
      if (!map[key]) map[key] = { event_type: v.event_type, severity: v.severity, timestamp: v.timestamp, count: 0 };
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
    { key: 'overview',       label: 'Overview',        icon: <BarChart3 className="w-4 h-4" /> },
    { key: 'skill_coverage', label: 'Skill Coverage',  icon: <Activity className="w-4 h-4" />, live: isInProgress },
    { key: 'clusters',       label: 'Cluster Insights', icon: <Layers className="w-4 h-4" /> },
    { key: 'sentiment',      label: 'Sentiment',        icon: <Brain className="w-4 h-4" /> },
    { key: 'qa',             label: 'Q&A',              icon: <MessageSquare className="w-4 h-4" /> },
    { key: 'recording',      label: 'Recording',        icon: <Video className="w-4 h-4" /> },
    { key: 'transcript',     label: 'Transcript',       icon: <FileText className="w-4 h-4" /> },
    { key: 'violations',     label: 'Violations',       icon: <ShieldAlert className="w-4 h-4" />, badge: totalViolations },
  ];

  const renderPlaceholder = (message: string) => (
    <div className="text-center py-16">
      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
        <Clock className="w-6 h-6 text-gray-400" />
      </div>
      <p className="text-gray-500">{message}</p>
    </div>
  );

  const getPlaceholderMessage = () => {
    if (isInProgress) return 'Interview in progress — data will appear once completed';
    if (!isCompleted && !isPartial) return 'Interview not yet started — no data available';
    return null;
  };

  const placeholderMsg = getPlaceholderMessage();

  return (
    <div className="flex-1 p-8 overflow-y-auto">
      <div className="w-full">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Config Details
          </button>

          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-semibold text-sm">
                  {(interview.candidate_name || 'U')[0].toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl font-semibold text-gray-900">
                      {interview.candidate_name || 'Unknown Candidate'}
                    </h1>
                    {interview.candidate_cid && (
                      <span className="inline-flex items-center px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-xs font-mono font-medium">
                        {interview.candidate_cid}
                      </span>
                    )}
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(interview.status)}`}>
                      {getStatusLabel(interview.status)}
                    </span>
                    {/* Interview mode badge — only shown for flexible/conversational mode */}
                    {isFlexibleMode && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700 border border-indigo-200">
                        Conversational Mode
                      </span>
                    )}
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
              <div className="flex items-center gap-4 text-sm text-gray-500 mt-2 ml-[52px]">
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

        {/* Partial warning banner */}
        {isPartial && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            Interview disconnected — showing partial results
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="border-b border-gray-200 px-6 overflow-x-auto">
            <div className="flex gap-1 min-w-max">
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => { setActiveTab(tab.key); setViolationPage(1); }}
                  className={`flex items-center gap-1.5 py-4 px-3 text-sm border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === tab.key
                      ? tab.key === 'violations'
                        ? 'border-red-500 text-red-700 font-medium'
                        : 'border-gray-800 text-gray-800 font-medium'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                  {tab.live && (
                    <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full ml-0.5">
                      <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
                      LIVE
                    </span>
                  )}
                  {tab.badge !== undefined && (
                    <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium ${
                      tab.badge > 0
                        ? activeTab === 'violations'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-red-100 text-red-600'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="p-6">
            {/* Skill Coverage Tab */}
            {activeTab === 'skill_coverage' && (() => {
              // Prefer live skill_coverage; fall back to ai_evaluation.skill_coverage_map
              // for completed sessions where the live field was never persisted.
              const rawMap = eval_.skill_coverage_map as Record<string, string> | undefined;
              const sc = liveSession.skill_coverage || (rawMap && Object.keys(rawMap).length > 0 ? (() => {
                const allSkills = Object.keys(rawMap);
                return {
                  covered:          allSkills.filter(s => rawMap[s] === 'covered'),
                  medium_covered:   allSkills.filter(s => rawMap[s] === 'medium'),
                  low_covered:      allSkills.filter(s => rawMap[s] === 'low'),
                  uncovered:        allSkills.filter(s => !rawMap[s] || rawMap[s] === 'not_started'),
                  nice_to_have_skills: (eval_.nice_to_have_skills as string[] | undefined) || [],
                  total_questions:  (eval_.total_questions as number | undefined) || liveSession.total_questions || 0,
                  questions_asked:  (eval_.questions_asked as number | undefined) || 0,
                  hr_topics:        (eval_.hr_topics as Record<string, string> | undefined) || undefined,
                };
              })() : null);
              const allSkills = [
                ...(sc?.covered || []),
                ...(sc?.medium_covered || []),
                ...(sc?.low_covered || []),
                ...(sc?.uncovered || []),
              ];
              const total = allSkills.length;
              const coveredCount = (sc?.covered.length || 0) + (sc?.medium_covered.length || 0);
              const coveragePct = total > 0 ? Math.round((coveredCount / total) * 100) : 0;

              if (!sc && !isInProgress) {
                return renderPlaceholder('Skill coverage data not available for this session');
              }

              return (
                <div className="space-y-5">
                  {/* Header with live indicator */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Skill Coverage</h3>
                      {sc?.round_name && (
                        <p className="text-sm text-gray-500 mt-0.5">{sc.round_name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {isInProgress && (
                        <span className="flex items-center gap-1.5 px-2.5 py-1 bg-red-500 text-white text-xs font-bold rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                          {liveWsConnected ? 'LIVE — WebSocket' : 'LIVE — polling 3s'}
                        </span>
                      )}
                      {sc && (
                        <span className="text-sm text-gray-500">
                          <span className="font-semibold text-gray-800">{sc.questions_asked}</span> / {sc.total_questions} questions asked
                        </span>
                      )}
                    </div>
                  </div>

                  {/* No data yet (in_progress but coverage not received) */}
                  {!sc && isInProgress && (
                    <div className="border border-dashed border-gray-300 rounded-xl p-8 text-center">
                      <RefreshCw className="w-8 h-8 text-gray-400 mx-auto mb-3 animate-spin" />
                      <p className="text-gray-500 font-medium">Interview in progress</p>
                      <p className="text-sm text-gray-400 mt-1">Skill coverage will appear here as questions are asked</p>
                    </div>
                  )}

                  {sc && (
                    <>
                      {/* Overall coverage ring */}
                      <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-6">
                        {/* Circle */}
                        <div className="relative flex-shrink-0">
                          <svg width="88" height="88" viewBox="0 0 88 88">
                            <circle cx="44" cy="44" r="36" fill="none" stroke="#e5e7eb" strokeWidth="8" />
                            <circle
                              cx="44" cy="44" r="36" fill="none"
                              stroke={coveragePct >= 70 ? '#22c55e' : coveragePct >= 40 ? '#f59e0b' : '#ef4444'}
                              strokeWidth="8" strokeLinecap="round"
                              strokeDasharray={`${2 * Math.PI * 36}`}
                              strokeDashoffset={`${2 * Math.PI * 36 * (1 - coveragePct / 100)}`}
                              style={{ transform: 'rotate(-90deg)', transformOrigin: '44px 44px', transition: 'stroke-dashoffset 0.6s ease' }}
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-xl font-bold text-gray-900">{coveragePct}%</span>
                          </div>
                        </div>
                        {/* Legend */}
                        <div className="flex-1 grid grid-cols-2 gap-2">
                          {[
                            { label: 'Strongly Covered', count: sc.covered.length, color: 'bg-green-500' },
                            { label: 'Partially Covered', count: sc.medium_covered.length, color: 'bg-yellow-400' },
                            { label: 'Low Coverage', count: sc.low_covered.length, color: 'bg-orange-400' },
                            { label: 'Not Covered', count: sc.uncovered.length, color: 'bg-red-400' },
                          ].map(({ label, count, color }) => (
                            <div key={label} className="flex items-center gap-2">
                              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${color}`} />
                              <span className="text-sm text-gray-600">{label}</span>
                              <span className="ml-auto text-sm font-semibold text-gray-800">{count}</span>
                            </div>
                          ))}
                        </div>
                        {/* Progress bar */}
                        <div className="flex-shrink-0 w-48">
                          <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
                            <div className="bg-green-500 transition-all duration-500" style={{ width: `${(sc.covered.length / (total || 1)) * 100}%` }} />
                            <div className="bg-yellow-400 transition-all duration-500" style={{ width: `${(sc.medium_covered.length / (total || 1)) * 100}%` }} />
                            <div className="bg-orange-400 transition-all duration-500" style={{ width: `${(sc.low_covered.length / (total || 1)) * 100}%` }} />
                            <div className="bg-red-400 transition-all duration-500" style={{ width: `${(sc.uncovered.length / (total || 1)) * 100}%` }} />
                          </div>
                        </div>
                      </div>

                      {/* Skill chips grid */}
                      {[
                        { title: 'Strongly Covered', skills: sc.covered, bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', dot: 'bg-green-500' },
                        { title: 'Partially Covered', skills: sc.medium_covered, bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800', dot: 'bg-yellow-400' },
                        { title: 'Low Coverage', skills: sc.low_covered, bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-800', dot: 'bg-orange-400' },
                        { title: 'Not Yet Covered', skills: sc.uncovered, bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', dot: 'bg-red-400' },
                      ].filter(g => g.skills.length > 0).map(({ title, skills, bg, border, text, dot }) => (
                        <div key={title} className={`border ${border} rounded-xl p-4`}>
                          <div className="flex items-center gap-2 mb-3">
                            <span className={`w-2 h-2 rounded-full ${dot}`} />
                            <h4 className={`text-sm font-semibold ${text}`}>{title}</h4>
                            <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${bg} ${text}`}>{skills.length}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {skills.map((skill) => (
                              <span key={skill} className={`px-2.5 py-1 rounded-full text-xs font-medium border ${bg} ${border} ${text}`}>
                                {skill}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}

                      {/* Nice-to-have skills */}
                      {sc.nice_to_have_skills.length > 0 && (
                        <div className="border border-blue-200 rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="w-2 h-2 rounded-full bg-blue-400" />
                            <h4 className="text-sm font-semibold text-blue-800">Nice-to-Have Skills</h4>
                            <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{sc.nice_to_have_skills.length}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {sc.nice_to_have_skills.map((skill) => (
                              <span key={skill} className="px-2.5 py-1 rounded-full text-xs font-medium border bg-blue-50 border-blue-200 text-blue-700">
                                {skill}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* HR Topics */}
                      {sc.hr_topics && Object.keys(sc.hr_topics).length > 0 && (
                        <div className="border border-purple-200 rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="w-2 h-2 rounded-full bg-purple-400" />
                            <h4 className="text-sm font-semibold text-purple-800">HR Topics Covered</h4>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {Object.entries(sc.hr_topics).map(([topic, status]) => (
                              <div key={topic} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-50 border border-purple-100">
                                <CheckCircle2 className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
                                <span className="text-xs font-medium text-purple-800 truncate">{topic}</span>
                                <span className="ml-auto text-[10px] text-purple-500 font-medium">{status}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })()}

            {/* Overview Tab */}
            {activeTab === 'overview' && (
              placeholderMsg ? renderPlaceholder(placeholderMsg) : (
                <div className="space-y-6">
                  {/* Final Capability Score — flexible mode only (Report Section 5) */}
                  {isFlexibleMode && eval_.capability_score != null && eval_.capability_score > 0 && (
                    <div className="border border-indigo-200 rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between bg-indigo-600 text-white px-5 py-4">
                        <div>
                          <div className="text-sm font-semibold">Overall Capability Score</div>
                          <div className="text-xs text-indigo-200 mt-0.5">Final weighted score across all sections</div>
                        </div>
                        <div className="text-right">
                          <div className="text-4xl font-bold">{eval_.capability_score}</div>
                          <div className="text-xs text-indigo-300">out of 100</div>
                        </div>
                      </div>
                      {eval_.capability_score_reasoning && (
                        <div className="px-5 py-3 bg-indigo-50 border-t border-indigo-100">
                          <p className="text-[11px] text-indigo-700 leading-relaxed">{eval_.capability_score_reasoning}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Stat Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="bg-gray-50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-semibold text-gray-900">
                        {eval_.total_questions ?? (evaluations.length || 'N/A')}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">Questions Asked</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-semibold text-gray-900">
                        {formatDuration(eval_.duration_minutes)}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">Duration</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 text-center">
                      <div className={`text-2xl font-semibold ${
                        summary.hiring_recommendation === 'yes' || summary.hiring_recommendation === 'strong_yes'
                          ? 'text-green-600'
                          : summary.hiring_recommendation === 'no' || summary.hiring_recommendation === 'strong_no'
                          ? 'text-red-600'
                          : 'text-yellow-600'
                      }`}>
                        {summary.hiring_recommendation
                          ? summary.hiring_recommendation.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
                          : 'N/A'}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">Hiring Recommendation</div>
                      {/* AI confidence in recommendation — flexible mode only (AC8 Explainability) */}
                      {isFlexibleMode && summary.confidence != null && (
                        <div className="mt-1.5 flex items-center justify-center gap-1">
                          {Array.from({ length: 5 }, (_, i) => (
                            <span
                              key={i}
                              className={`w-2 h-2 rounded-full ${i < summary.confidence ? 'bg-indigo-500' : 'bg-gray-200'}`}
                            />
                          ))}
                          <span className="text-[10px] text-gray-400 ml-1">confidence</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Identity Verification Card */}
                  {(interview.identity_name || interview.identity_verified != null) && (
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
                        <Shield className="w-4 h-4 text-gray-600" />
                        <h3 className="text-sm font-semibold text-gray-900">Candidate Identity Verification</h3>
                        <span className={`ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          interview.identity_verified
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-50 text-red-600'
                        }`}>
                          {interview.identity_verified
                            ? <><CheckCircle2 className="w-3 h-3" /> Verified</>
                            : <><XCircle className="w-3 h-3" /> Not Verified</>
                          }
                        </span>
                      </div>
                      <div className="p-4 flex items-start gap-4">
                        {/* Photo */}
                        <div className="flex-shrink-0">
                          {identityPhotoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={identityPhotoUrl}
                              alt="Candidate identity photo"
                              className="w-20 h-20 rounded-lg object-cover border border-gray-200 shadow-sm"
                            />
                          ) : interview.identity_photo_path && !identityPhotoError ? (
                            <div className="w-20 h-20 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center">
                              <Camera className="w-6 h-6 text-gray-400" />
                            </div>
                          ) : interview.identity_photo_path && identityPhotoError ? (
                            <div className="w-20 h-20 rounded-lg bg-red-50 border border-red-100 flex flex-col items-center justify-center gap-1">
                              <Camera className="w-5 h-5 text-red-300" />
                              <span className="text-[10px] text-red-400">Load failed</span>
                            </div>
                          ) : (
                            <div className="w-20 h-20 rounded-lg bg-gray-50 border border-dashed border-gray-200 flex items-center justify-center">
                              <User className="w-6 h-6 text-gray-300" />
                            </div>
                          )}
                        </div>
                        {/* Details */}
                        <div className="flex-1 min-w-0 space-y-2">
                          <div>
                            <p className="text-xs text-gray-500">Submitted Name</p>
                            <p className="text-sm font-semibold text-gray-900">
                              {interview.identity_name || <span className="text-gray-400 font-normal">Not provided</span>}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Email</p>
                            <p className="text-sm text-gray-700">{interview.candidate_email || '—'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Photo Captured</p>
                            <p className="text-sm text-gray-700">
                              {interview.identity_photo_path ? 'Yes — liveness verified' : 'No photo captured'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Round Performance Bar Chart */}
                  {roundScores.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-900 mb-3">Round Performance</h3>
                      <div className="space-y-3">
                        {roundScores.map((r, idx) => (
                          <div key={idx}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm text-gray-700">{r.name}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-400">weight {r.weight}%</span>
                                <span className={`text-sm font-semibold ${
                                  r.percentage >= 70 ? 'text-green-600' :
                                  r.percentage >= 50 ? 'text-yellow-600' : 'text-red-600'
                                }`}>{r.percentage}%</span>
                              </div>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2.5">
                              <div
                                className={`h-2.5 rounded-full ${
                                  r.percentage >= 70 ? 'bg-green-500' :
                                  r.percentage >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${r.percentage}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Skill Coverage */}
                  {eval_.skill_coverage_map && Object.keys(eval_.skill_coverage_map).length > 0 && (() => {
                    const coverageMap: Record<string, string> = eval_.skill_coverage_map;
                    const priorityMap: Record<string, string> = eval_.skill_priority_map || {};
                    const allSkills = Object.keys(coverageMap).sort((a, b) => a.localeCompare(b));
                    const covered   = allSkills.filter(s => coverageMap[s] === 'covered');
                    const medium    = allSkills.filter(s => coverageMap[s] === 'medium');
                    const low       = allSkills.filter(s => coverageMap[s] === 'low');
                    const notStarted = allSkills.filter(s => coverageMap[s] === 'not_started' || !coverageMap[s]);
                    const total = allSkills.length;
                    const coveredCount = covered.length + medium.length + low.length;

                    const TAG_STYLE: Record<string, string> = {
                      covered:     'bg-green-50 border-green-200 text-green-700',
                      medium:      'bg-amber-50 border-amber-200 text-amber-700',
                      low:         'bg-orange-50 border-orange-200 text-orange-700',
                      not_started: 'bg-gray-50 border-gray-200 text-gray-500',
                    };
                    const TAG_LABEL: Record<string, string> = {
                      covered: '✓', medium: '~', low: '≈', not_started: '·',
                    };

                    return (
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                          <div className="flex items-center gap-2">
                            <Bot className="w-4 h-4 text-gray-600" />
                            <h3 className="text-sm font-semibold text-gray-900">Skill Coverage</h3>
                          </div>
                          <span className="text-xs text-gray-500 font-medium">
                            {coveredCount}/{total} skills covered
                          </span>
                        </div>
                        <div className="p-4 space-y-4">
                          {/* Progress bar */}
                          <div>
                            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden flex">
                              <div className="h-full bg-green-500 transition-[width] duration-700" style={{ width: total > 0 ? `${(covered.length / total) * 100}%` : '0%' }} />
                              <div className="h-full bg-amber-400 transition-[width] duration-700" style={{ width: total > 0 ? `${(medium.length / total) * 100}%` : '0%' }} />
                              <div className="h-full bg-orange-400 transition-[width] duration-700" style={{ width: total > 0 ? `${(low.length / total) * 100}%` : '0%' }} />
                            </div>
                            <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                              {covered.length > 0 && <span className="flex items-center gap-1 text-xs text-green-700"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />High ({covered.length})</span>}
                              {medium.length > 0 && <span className="flex items-center gap-1 text-xs text-amber-700"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Medium ({medium.length})</span>}
                              {low.length > 0 && <span className="flex items-center gap-1 text-xs text-orange-700"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />Low ({low.length})</span>}
                              {notStarted.length > 0 && <span className="flex items-center gap-1 text-xs text-gray-500"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />Not covered ({notStarted.length})</span>}
                            </div>
                          </div>

                          {/* Skill tags */}
                          <div className="flex flex-wrap gap-1.5">
                            {allSkills.map(skill => {
                              const level = coverageMap[skill] || 'not_started';
                              const isPriority = priorityMap[skill] === 'must_have';
                              return (
                                <span
                                  key={skill}
                                  title={`${isPriority ? 'Must-have · ' : 'Nice-to-have · '}${level.replace(/_/g, ' ')}`}
                                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs font-medium ${TAG_STYLE[level] || TAG_STYLE.not_started}`}
                                >
                                  <span className="font-bold">{TAG_LABEL[level] || '·'}</span>
                                  {skill}
                                  {isPriority && <span className="ml-0.5 text-[9px] opacity-60">★</span>}
                                </span>
                              );
                            })}
                          </div>

                          <p className="text-[11px] text-gray-400">★ = must-have skill &nbsp;·&nbsp; ✓ high &nbsp;·&nbsp; ~ medium &nbsp;·&nbsp; ≈ low &nbsp;·&nbsp; · not covered</p>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Sentiment Overview */}
                  {sentimentSummary.avg_confidence != null && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-900 mb-3">Sentiment Overview</h3>
                      <div className="space-y-3">
                        {[
                          { label: 'Confidence', value: sentimentSummary.avg_confidence, color: 'bg-green-500' },
                          { label: 'Nervousness', value: sentimentSummary.avg_nervousness, color: 'bg-red-500' },
                          { label: 'Engagement', value: sentimentSummary.avg_engagement, color: 'bg-blue-500' },
                        ].map(item => (
                          <div key={item.label} className="flex items-center gap-3">
                            <span className="text-sm text-gray-600 w-28">{item.label}</span>
                            <div className="flex-1 bg-gray-200 rounded-full h-2.5">
                              <div
                                className={`h-2.5 rounded-full ${item.color}`}
                                style={{ width: `${((item.value || 0) / 5) * 100}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium text-gray-700 w-10 text-right">
                              {(item.value || 0).toFixed(1)}/5
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Key Strengths & Concerns */}
                  {(summary.key_strengths?.length > 0 || summary.key_concerns?.length > 0) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {summary.key_strengths?.length > 0 && (
                        <div className="border border-green-200 rounded-lg p-4 bg-green-50/50">
                          <div className="flex items-center gap-2 mb-3">
                            <ThumbsUp className="w-4 h-4 text-green-600" />
                            <h4 className="text-sm font-medium text-green-800">Key Strengths</h4>
                          </div>
                          <ul className="space-y-1.5">
                            {summary.key_strengths.map((s: string, i: number) => (
                              <li key={i} className="text-sm text-green-700 flex items-start gap-2">
                                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                                {s}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {summary.key_concerns?.length > 0 && (
                        <div className="border border-red-200 rounded-lg p-4 bg-red-50/50">
                          <div className="flex items-center gap-2 mb-3">
                            <ThumbsDown className="w-4 h-4 text-red-600" />
                            <h4 className="text-sm font-medium text-red-800">Key Concerns</h4>
                          </div>
                          <ul className="space-y-1.5">
                            {summary.key_concerns.map((c: string, i: number) => (
                              <li key={i} className="text-sm text-red-700 flex items-start gap-2">
                                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                                {c}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Summary */}
                  {summary.summary && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-900 mb-2">AI Summary</h3>
                      <p className="text-sm text-gray-600 leading-relaxed">{summary.summary}</p>
                      {/* Interview quality note — flexible mode only (AC8 Explainability) */}
                      {isFlexibleMode && summary.interview_quality_note && (
                        <p className="text-xs text-gray-400 mt-2 italic border-t border-gray-100 pt-2">
                          {summary.interview_quality_note}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Training Suggestions */}
                  {summary.training_suggestions?.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-900 mb-2">Training Suggestions</h3>
                      <ul className="space-y-1.5">
                        {summary.training_suggestions.map((s: string, i: number) => (
                          <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Closing reason note */}
                  {eval_.closing_reason && eval_.closing_reason !== 'normal' && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
                      <span className="text-xs text-gray-500">
                        Interview ended: <span className="font-medium text-gray-700">{eval_.closing_reason.replace(/_/g, ' ')}</span>
                      </span>
                    </div>
                  )}

                  {/* No evaluation data */}
                  {!eval_.round_scores && !summary.key_strengths && interview.score == null && (
                    renderPlaceholder('No evaluation data available')
                  )}
                </div>
              )
            )}

            {/* Cluster Insights Tab */}
            {activeTab === 'clusters' && (
              placeholderMsg ? renderPlaceholder(placeholderMsg) : (
                <ClusterInsightsTab
                  clusterInsights={eval_.cluster_insights || []}
                  capabilityScore={eval_.capability_score ?? null}
                  sectionScores={eval_.section_scores ?? null}
                  capabilityScoreReasoning={eval_.capability_score_reasoning ?? null}
                />
              )
            )}

            {/* Sentiment Tab */}
            {activeTab === 'sentiment' && (
              placeholderMsg ? renderPlaceholder(placeholderMsg) : (
                <div className="space-y-6">
                  {sentimentTimeline.length > 0 ? (
                    <>
                      <div>
                        <h3 className="text-sm font-medium text-gray-900 mb-3">Sentiment Timeline</h3>
                        <div className="bg-gray-50 rounded-lg p-4" style={{ height: 300 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={sentimentTimeline} margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="turn" tick={{ fontSize: 11 }} />
                              <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} />
                              <Tooltip />
                              <Legend />
                              <Line type="monotone" dataKey="confidence" stroke="#22c55e" strokeWidth={2} name="Confidence" dot={{ r: 3 }} />
                              <Line type="monotone" dataKey="nervousness" stroke="#ef4444" strokeWidth={2} name="Nervousness" dot={{ r: 3 }} />
                              <Line type="monotone" dataKey="engagement" stroke="#3b82f6" strokeWidth={2} name="Engagement" dot={{ r: 3 }} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Emotion per turn */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-900 mb-3">Emotion per Turn</h3>
                        <div className="flex flex-wrap gap-2">
                          {sentimentTimeline.map((t, i) => (
                            <div key={i} className="px-3 py-2 bg-gray-50 rounded-lg border border-gray-200 text-center">
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
                          <h3 className="text-sm font-medium text-gray-900 mb-3">Summary Statistics</h3>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-gray-50 rounded-lg p-3 text-center">
                              <div className="text-lg font-semibold text-green-600">
                                {(sentimentSummary.avg_confidence || 0).toFixed(1)}
                              </div>
                              <div className="text-xs text-gray-500">Avg Confidence</div>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3 text-center">
                              <div className="text-lg font-semibold text-red-600">
                                {(sentimentSummary.avg_nervousness || 0).toFixed(1)}
                              </div>
                              <div className="text-xs text-gray-500">Avg Nervousness</div>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3 text-center">
                              <div className="text-lg font-semibold text-blue-600">
                                {(sentimentSummary.avg_engagement || 0).toFixed(1)}
                              </div>
                              <div className="text-xs text-gray-500">Avg Engagement</div>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3 text-center">
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
            {activeTab === 'qa' && (
              placeholderMsg ? renderPlaceholder(placeholderMsg) : (() => {
                // Prefer question_history (richer — has round_type, response_type, timestamp)
                // Fall back to evaluations if history not present
                const qaItems: any[] = eval_.question_history?.length > 0
                  ? eval_.question_history
                  : evaluations.map((e: any, i: number) => ({
                      question_number: i + 1,
                      question: e.question,
                      answer: e.response,
                      topic: e.evaluation?.topic,
                      round_type: null,
                      response_type: 'answered',
                      skip_source: null,
                      timestamp: null,
                    }));

                if (qaItems.length === 0) return renderPlaceholder('No Q&A data available');

                return (
                  <div className="space-y-3">
                    {qaItems.map((item: any, idx: number) => {
                      const isSkipped = item.response_type === 'skipped';
                      const answerText = item.answer || '';
                      const isExpanded = expandedQuestions.has(idx);
                      const truncated = answerText.length > 200;
                      const roundLabel = item.round_type
                        ? item.round_type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
                        : null;

                      return (
                        <div key={idx} className={`border rounded-lg p-4 ${isSkipped ? 'border-gray-100 bg-gray-50/50' : 'border-gray-200'}`}>
                          <div className="flex items-start gap-3 mb-2">
                            <span className="flex-shrink-0 text-xs font-semibold text-gray-400 bg-gray-100 rounded px-1.5 py-0.5 mt-0.5">
                              Q{item.question_number ?? idx + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                                {roundLabel && (
                                  <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded-full">{roundLabel}</span>
                                )}
                                {item.topic && item.topic !== 'general' && (
                                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">{item.topic}</span>
                                )}
                                {isSkipped && (
                                  <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                                    Skipped{item.skip_source === 'user' ? ' by candidate' : ''}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm font-medium text-gray-900 leading-snug">{item.question}</p>
                            </div>
                          </div>
                          {answerText && (
                            <div className="ml-9">
                              <div className={`text-sm leading-relaxed ${isSkipped ? 'text-gray-400 italic' : 'text-gray-600'}`}>
                                {isExpanded || !truncated ? answerText : `${answerText.slice(0, 200)}...`}
                              </div>
                              {truncated && (
                                <button
                                  onClick={() => toggleQuestion(idx)}
                                  className="flex items-center gap-1 mt-1.5 text-xs text-gray-400 hover:text-gray-600"
                                >
                                  {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                  {isExpanded ? 'Show less' : 'Show more'}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            )}

            {/* Recording Tab */}
            {activeTab === 'recording' && (
              placeholderMsg ? renderPlaceholder(placeholderMsg) : (
                <RecordingTabContent
                  interview={interview}
                  videoBlobUrl={videoBlobUrl}
                  videoLoading={videoLoading}
                  videoError={videoError}
                  setVideoError={setVideoError}
                  screenBlobUrl={screenBlobUrl}
                  screenLoading={screenLoading}
                  screenError={screenError}
                />
              )
            )}

            {/* Transcript Tab */}
            {activeTab === 'transcript' && (
              placeholderMsg ? renderPlaceholder(placeholderMsg) : (() => {
                const messages = (interview.conversation_transcript || [])
                  .filter((msg: any) => msg.role !== 'system' && msg.content?.trim());

                if (messages.length === 0) return renderPlaceholder('No transcript available');

                const candidateName = interview.candidate_name || 'Candidate';
                const formatTs = (ts: string) => {
                  if (!ts) return '';
                  try {
                    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                  } catch { return ''; }
                };

                return (
                  <div className="max-w-3xl mx-auto">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                            <Bot className="w-3.5 h-3.5 text-blue-600" />
                          </div>
                          <span className="text-xs text-gray-500">Linda (AI Interviewer)</span>
                        </div>
                        <span className="text-gray-200">·</span>
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-semibold text-[10px]">
                            {candidateName[0].toUpperCase()}
                          </div>
                          <span className="text-xs text-gray-500">{candidateName}</span>
                        </div>
                      </div>
                      <span className="text-xs text-gray-400">{messages.length} messages</span>
                    </div>

                    <div className="space-y-4">
                      {messages.map((msg: any, idx: number) => {
                        const isAssistant = msg.role === 'assistant';
                        const ts = formatTs(msg.timestamp);
                        const content = msg.content as string;

                        return (
                          <div key={idx} className={`flex gap-2.5 ${isAssistant ? '' : 'flex-row-reverse'}`}>
                            {/* Avatar */}
                            <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold mt-0.5 ${
                              isAssistant ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-600'
                            }`}>
                              {isAssistant ? <Bot className="w-3.5 h-3.5" /> : candidateName[0].toUpperCase()}
                            </div>

                            {/* Bubble */}
                            <div className={`max-w-[75%] ${isAssistant ? '' : 'items-end flex flex-col'}`}>
                              <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                                isAssistant
                                  ? 'bg-gray-100 text-gray-800 rounded-tl-sm'
                                  : 'bg-blue-500 text-white rounded-tr-sm'
                              }`}>
                                {content}
                              </div>
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
                  </div>
                );
              })()
            )}
            {/* Violations Tab */}
            {activeTab === 'violations' && (
              <div className="space-y-6">

                {/* Risk Level Banner */}
                <div className={`flex items-center justify-between px-4 py-3 rounded-lg border ${risk.bg} ${risk.border}`}>
                  <div className="flex items-center gap-3">
                    <ShieldAlert className={`w-5 h-5 ${risk.color}`} />
                    <div>
                      <p className={`text-sm font-semibold ${risk.color}`}>
                        Integrity Status: {risk.label}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {totalViolations === 0
                          ? 'No violations detected during this interview.'
                          : `${totalViolations} violation event${totalViolations !== 1 ? 's' : ''} recorded — 0–2 Low, 3–5 Medium, 6+ High`}
                      </p>
                    </div>
                  </div>
                  <span className={`text-2xl font-bold ${risk.color}`}>{totalViolations}</span>
                </div>

                {/* Violation Type Grid */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Violation Breakdown</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {[
                      'face_missing', 'multiple_faces', 'gaze_away',
                      'tab_switch', 'window_blur', 'fullscreen_exit',
                      'camera_disabled', 'camera_obstructed', 'microphone_disabled',
                      'copy_attempt', 'paste_attempt',
                      'voice_detected', 'multiple_voices',
                      'face_mismatch', 'face_identity_changed',
                      'voice_mismatch', 'voice_identity_changed',
                      'screenshot_attempt', 'screen_recording_attempt',
                    ].map(type => {
                      const cfg = EVENT_CONFIG[type];
                      const count = violationCounts[type] ?? 0;
                      if (!cfg) return null;
                      return (
                        <div
                          key={type}
                          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border ${
                            count > 0 ? `${cfg.bg} ${cfg.border}` : 'bg-gray-50 border-gray-100'
                          }`}
                        >
                          <span className={count > 0 ? cfg.color : 'text-gray-300'}>{cfg.icon}</span>
                          <div className="min-w-0 flex-1">
                            <p className={`text-xs font-medium truncate ${count > 0 ? cfg.color : 'text-gray-400'}`}>
                              {cfg.label}
                            </p>
                            <p className={`text-xs font-bold ${
                              count >= 5 ? 'text-red-600' : count >= 3 ? 'text-orange-500' : count > 0 ? 'text-gray-700' : 'text-gray-300'
                            }`}>
                              {count}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Event Log Table */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Event Log</h3>
                  {groupedViolations.length === 0 ? (
                    <div className="text-center py-12 bg-green-50 rounded-lg border border-green-200">
                      <ShieldAlert className="w-8 h-8 text-green-400 mx-auto mb-2" />
                      <p className="text-sm font-medium text-green-700">No violations recorded</p>
                      <p className="text-xs text-green-500 mt-1">This interview completed with a clean integrity status.</p>
                    </div>
                  ) : (
                    <>
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 w-10">#</th>
                              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Event</th>
                              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Time</th>
                              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Severity</th>
                              <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Count</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {pagedViolations.map((row, idx) => {
                              const cfg = EVENT_CONFIG[row.event_type];
                              const sev = row.severity?.toLowerCase() ?? 'low';
                              const sevStyle =
                                sev === 'high'   ? 'bg-red-100 text-red-700' :
                                sev === 'medium' ? 'bg-orange-100 text-orange-700' :
                                                   'bg-gray-100 text-gray-600';
                              const countStyle =
                                row.count >= 5 ? 'text-red-600 font-bold' :
                                row.count >= 3 ? 'text-orange-500 font-semibold' :
                                                 'text-gray-600';
                              const globalIdx = (violationPage - 1) * ROWS_PER_PAGE + idx + 1;
                              return (
                                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                  <td className="px-4 py-2.5 text-xs text-gray-400">{globalIdx}</td>
                                  <td className="px-4 py-2.5">
                                    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${
                                      cfg ? `${cfg.bg} ${cfg.color}` : 'bg-gray-100 text-gray-600'
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
                        <div className="flex items-center justify-between mt-3">
                          <p className="text-xs text-gray-500">
                            Showing {(violationPage - 1) * ROWS_PER_PAGE + 1}–{Math.min(violationPage * ROWS_PER_PAGE, groupedViolations.length)} of {groupedViolations.length} events
                          </p>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setViolationPage(p => Math.max(1, p - 1))}
                              disabled={violationPage === 1}
                              className="p-1.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <span className="text-xs text-gray-600 px-2">{violationPage} / {totalPages}</span>
                            <button
                              onClick={() => setViolationPage(p => Math.min(totalPages, p + 1))}
                              disabled={violationPage === totalPages}
                              className="p-1.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
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
  );
}
