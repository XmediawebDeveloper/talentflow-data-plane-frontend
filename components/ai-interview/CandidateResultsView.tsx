'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import {
  ArrowLeft, Clock, MessageSquare, ThumbsUp, ThumbsDown,
  AlertTriangle, VideoOff, ChevronDown, ChevronUp, Video,
  BarChart3, Brain, FileText, Layers, Bot,
  ShieldAlert, Monitor, Clipboard, MousePointer, Eye, UserX,
  Volume2, Users, Maximize2, Camera, Mic, User, ChevronLeft, ChevronRight,
  Shield, CheckCircle2, XCircle, Activity, RefreshCw, Award, TrendingUp, Target,
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

type TabKey = 'overview' | 'evaluation' | 'sentiment' | 'qa' | 'recording' | 'transcript' | 'clusters' | 'violations' | 'skill_coverage';

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

function getRiskLevelWeighted(
  score: number,
  thresholds: RiskThresholds = DEFAULT_THRESHOLDS,
): { label: string; color: string; bg: string; border: string } {
  if (score === 0)                    return { label: 'Clean',       color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-300'  };
  if (score <= thresholds.low)        return { label: 'Low Risk',    color: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-200'  };
  if (score <= thresholds.medium)     return { label: 'Medium Risk', color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-300' };
  return                                     { label: 'High Risk',   color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-300'    };
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
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set());
  const [violationPage, setViolationPage] = useState(1);
  const [riskThresholds, setRiskThresholds] = useState<RiskThresholds>(DEFAULT_THRESHOLDS);
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

  // Batch-save new events to DB — debounced so rapid bursts don't flood the API
  const pendingEventsRef = useRef<LiveEvent[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushEvents = (sessionId: string) => {
    if (pendingEventsRef.current.length === 0) return;
    const toSave = pendingEventsRef.current;
    pendingEventsRef.current = [];
    aiInterviewService.appendCoverageEvents(sessionId, toSave);
  };
  const scheduleFlush = (sessionId: string) => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(() => flushEvents(sessionId), 3000);
  };

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
          if (msg.type === 'skill_coverage_update') {
            setLastUpdatedAt(new Date());
            setLiveSession(prev => ({ ...prev, skill_coverage: msg }));

            // Diff against previous snapshot to detect skill state changes
            // Update skill level ratchet — never downgrade a skill's best-seen level
            {
              const ratchet = skillLevelRatchetRef.current;
              const pr: Record<string, number> = { covered: 3, medium: 2, low: 1, skipped: 1 };
              for (const s of msg.covered || [])        { const k = s.toLowerCase(); if (!(k in ratchet) || pr[ratchet[k]] < 3) ratchet[k] = 'covered'; }
              for (const s of msg.medium_covered || []) { const k = s.toLowerCase(); if (!(k in ratchet) || pr[ratchet[k]] < 2) ratchet[k] = 'medium'; }
              for (const s of msg.low_covered || [])    { const k = s.toLowerCase(); if (!(k in ratchet) || pr[ratchet[k]] < 1) ratchet[k] = 'low'; }
              for (const s of msg.skipped || [])        { const k = s.toLowerCase(); if (!(k in ratchet)) ratchet[k] = 'skipped'; }
            }

            const prev = prevScRef.current;
            prevScRef.current = msg;
            if (prev) {
              const nowCovered   = new Set<string>((msg.covered        || []).map((s: string) => s.toLowerCase()));
              const nowMedium    = new Set<string>((msg.medium_covered || []).map((s: string) => s.toLowerCase()));
              const nowLow       = new Set<string>((msg.low_covered    || []).map((s: string) => s.toLowerCase()));
              const wasCovered   = new Set<string>((prev.covered        || []).map((s: string) => s.toLowerCase()));
              const wasMedium    = new Set<string>((prev.medium_covered || []).map((s: string) => s.toLowerCase()));
              const wasLow       = new Set<string>((prev.low_covered    || []).map((s: string) => s.toLowerCase()));
              const wasSkipped   = new Set<string>(((prev as any).skipped || []).map((s: string) => s.toLowerCase()));

              const newEvents: LiveEvent[] = [];
              const ts = Date.now();
              // Stamp the current question number from msg.questions_asked so we can
              // reliably map each skill to the exact question that covered it.
              const evQNum: number | undefined = msg.questions_asked || undefined;
              // Stamp isFollowUp from the ref (synchronously up-to-date) rather than
              // looking it up later from qFollowUpMap, which gets overwritten when a
              // follow-up fires for the same qNum as the main question.
              const evIsFollowUp: boolean = currentQuestionRef.current?.isFollowUp ?? false;
              // Newly strongly covered
              for (const s of msg.covered    || []) if (!wasCovered.has(s.toLowerCase())) newEvents.push({ kind: 'covered', skill: s, ts, qNum: evQNum, isFollowUp: evIsFollowUp });
              // Newly medium covered (wasn't medium or covered before)
              for (const s of msg.medium_covered || []) if (!wasMedium.has(s.toLowerCase()) && !wasCovered.has(s.toLowerCase())) newEvents.push({ kind: 'medium', skill: s, ts, qNum: evQNum, isFollowUp: evIsFollowUp });
              // Newly low covered (wasn't touched before)
              for (const s of msg.low_covered || []) if (!wasLow.has(s.toLowerCase()) && !wasMedium.has(s.toLowerCase()) && !wasCovered.has(s.toLowerCase())) newEvents.push({ kind: 'low', skill: s, ts, qNum: evQNum, isFollowUp: evIsFollowUp });
              // Newly skipped (IDK / silence — counts as low coverage, no follow-up)
              for (const s of msg.skipped || []) if (!wasSkipped.has(s.toLowerCase()) && !wasLow.has(s.toLowerCase()) && !wasMedium.has(s.toLowerCase()) && !wasCovered.has(s.toLowerCase())) newEvents.push({ kind: 'low', skill: s, ts, qNum: evQNum, isFollowUp: evIsFollowUp });

              if (newEvents.length > 0) {
                setLiveEvents(prev => [...newEvents, ...prev].slice(0, 50));
                pendingEventsRef.current.push(...newEvents);
                scheduleFlush(liveSession.id);
              }
            } else {
              prevScRef.current = msg;
            }
          } else if (msg.type === 'question_timer_started') {
            const qNum = msg.question_number ?? 0;
            const isFollowUp = !!msg.is_follow_up;
            currentQuestionRef.current = { qNum, isFollowUp };
            setCurrentQuestion({ qNum, isFollowUp });
            const qEvent: LiveEvent = { kind: 'question' as const, qNum, isFollowUp, ts: Date.now() };
            const newTimerEvts: LiveEvent[] = [qEvent];
            // If backend says which skill is being asked, stamp it directly (ground-truth mapping)
            if (msg.current_skill) {
              const assignEv: LiveEvent = {
                kind: 'assigned' as const,
                skill: (msg.current_skill as string).toLowerCase(),
                qNum,
                isFollowUp,
                ts: Date.now(),
              };
              newTimerEvts.push(assignEv);
            }
            setLiveEvents(prev => [...newTimerEvts, ...prev].slice(0, 50));
            pendingEventsRef.current.push(...newTimerEvts);
            scheduleFlush(liveSession.id);
          } else if (msg.type === 'interview_closing' || msg.type === 'interview_complete' || msg.type === 'interview_ended') {
            // Flush any pending events before fetching final state
            if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
            flushEvents(liveSession.id);
            // Interview finished — refresh from REST to update status display.
            // NOTE: ai_evaluation may not be saved yet (backend saves after this event).
            // The evaluation_ready event below triggers the definitive refresh once saved.
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

  // Flexible/conversational mode is identified by the presence of capability_score_reasoning,
  // which is generated only for flexible mode interviews (AC — Mode Indicator).
  const isFlexibleMode = !!eval_.capability_score_reasoning;

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
    // Fallback: legacy round_scores on 1-5 scale
    return (eval_.round_scores || []).map((r: any) => {
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
    { key: 'overview',       label: 'Overview',        icon: <BarChart3 className="w-4 h-4" /> },
    ...((isCompleted || isPartial)
      ? [{ key: 'evaluation' as TabKey, label: 'Evaluation', icon: <Award className="w-4 h-4" /> }]
      : []),
    { key: 'skill_coverage', label: 'Skill Coverage',  icon: <Activity className="w-4 h-4" />, live: isInProgress },
    { key: 'clusters',       label: 'Cluster Insights', icon: <Layers className="w-4 h-4" />, live: isInProgress },
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

  const getPlaceholderMessage = (tabKey?: string) => {
    // Skill Coverage and Clusters handle their own in-progress state — don't block them
    if (isInProgress && tabKey !== 'skill_coverage' && tabKey !== 'clusters') {
      return 'Interview in progress — data will appear once completed';
    }
    if (!isInProgress && !isCompleted && !isPartial) return 'Interview not yet started — no data available';
    return null;
  };

  // Generic placeholder (for tabs that don't pass a key)
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
              // Derive skill coverage from ai_evaluation.skill_coverage_map when:
              //   a) live field is absent, OR
              //   b) live field has questions_asked=0 (stale initial state) on a completed session
              const rawMap = eval_.skill_coverage_map as Record<string, string> | undefined;
              const buildFromEval = rawMap && Object.keys(rawMap).length > 0
                ? (() => {
                    const allSkills = Object.keys(rawMap);
                    return {
                      covered:             allSkills.filter(s => rawMap[s] === 'covered'),
                      medium_covered:      allSkills.filter(s => rawMap[s] === 'medium'),
                      low_covered:         allSkills.filter(s => rawMap[s] === 'low' || rawMap[s] === 'skipped'),
                      uncovered:           allSkills.filter(s => !rawMap[s] || rawMap[s] === 'not_started'),
                      nice_to_have_skills: (eval_.nice_to_have_skills as string[] | undefined) || [],
                      total_questions:     (eval_.total_questions as number | undefined) || liveSession.total_questions || 0,
                      questions_asked:     (liveSession.skill_coverage as any)?.questions_asked || (eval_.questions_asked as number | undefined) || 0,
                      hr_topics:           (eval_.hr_topics as Record<string, string> | undefined) || undefined,
                      round_name:          undefined as string | undefined,
                    };
                  })()
                : null;

              // Determine whether eval-derived data has any meaningful coverage.
              // If skill_coverage_map came back all-zero/not_started (backend eval issue),
              // fall back to the live skill_coverage field which the backend also persists.
              const hasMeaningfulCoverage = (sc: typeof buildFromEval) =>
                !!sc && (sc.covered.length + sc.medium_covered.length + sc.low_covered.length) > 0;
              const liveSkillCoverage = liveSession.skill_coverage ?? null;
              const rawSc = isInProgress
                ? (liveSkillCoverage || buildFromEval || null)
                : (hasMeaningfulCoverage(buildFromEval)
                    ? buildFromEval
                    : liveSkillCoverage || bestSeenSkillCoverageRef.current || buildFromEval || null);

              // If no coverage data yet during in-progress, build an initial state from
              // cluster config so the skill grid shows immediately instead of a placeholder.
              const clusterSkills = [...new Set([
                ...clusterConfig.mth.flatMap(c => c.skills),
                ...clusterConfig.nth.flatMap(c => c.skills),
              ])];
              const initialFromClusters = !rawSc && isInProgress && clusterSkills.length > 0
                ? {
                    covered: [] as string[], medium_covered: [] as string[],
                    low_covered: [] as string[], uncovered: clusterSkills,
                    nice_to_have_skills: [] as string[],
                    total_questions: liveSession.total_questions || clusterSkills.length,
                    questions_asked: 0,
                    round_name: undefined as string | undefined,
                    hr_topics: undefined as Record<string, string> | undefined,
                  }
                : null;

              const scBase = rawSc || initialFromClusters;
              const sc = scBase;
              const allSkills = [
                ...(sc?.covered || []),
                ...(sc?.medium_covered || []),
                ...(sc?.low_covered || []),
                ...(sc?.uncovered || []),
              ];
              const total = allSkills.length;
              // "Touched" = any level of coverage (strong + medium + low).
              // This matches what Cluster Insights counts as "addressed".
              const touchedCount = (sc?.covered.length || 0) + (sc?.medium_covered.length || 0) + (sc?.low_covered.length || 0);
              const touchedPct = total > 0 ? Math.round((touchedCount / total) * 100) : 0;
              // "Strong" = covered + medium_covered only (properly demonstrated)
              const strongCount = (sc?.covered.length || 0) + (sc?.medium_covered.length || 0);
              const strongPct = total > 0 ? Math.round((strongCount / total) * 100) : 0;
              // Ring shows "touched" so it matches Cluster Insights; goal tracks "strong"
              const coveragePct = touchedPct;

              if (!sc && !isInProgress) {
                return renderPlaceholder('Skill coverage data not available for this session');
              }

              const stronglyCoveredCount = sc?.covered.length || 0;
              const allCoveredGoalPct = total > 0 ? Math.round((stronglyCoveredCount / total) * 100) : 0;
              const remainingUncovered = (sc?.uncovered.length || 0);
              const remainingToStrengthen = (sc?.low_covered.length || 0) + (sc?.medium_covered.length || 0);
              const isGoalMet = total > 0 && stronglyCoveredCount === total;

              const getLastUpdatedLabel = () => {
                if (!lastUpdatedAt) return null;
                const secs = Math.floor((Date.now() - lastUpdatedAt.getTime()) / 1000);
                if (secs < 5) return 'just now';
                if (secs < 60) return `${secs}s ago`;
                return `${Math.floor(secs / 60)}m ago`;
              };

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
                          {liveWsConnected ? 'LIVE — WebSocket' : 'LIVE — polling'}
                        </span>
                      )}
                      {isInProgress && lastUpdatedAt && (
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <RefreshCw className="w-3 h-3" />
                          Updated {getLastUpdatedLabel()}
                        </span>
                      )}
                      {sc && (
                        <span className="text-sm text-gray-500">
                          <span className="font-semibold text-gray-800">
                            {/* During live interview, show max of answered count and current Q number
                                so the display updates immediately when a new question starts,
                                not only after the candidate's answer is evaluated. */}
                            {isInProgress && currentQuestion
                              ? Math.max(sc.questions_asked || 0, currentQuestion.qNum)
                              : (sc.questions_asked || 0)}
                          </span> / {sc.total_questions} questions asked
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Coverage summary banner */}
                  {sc && (
                    <div className={`rounded-xl border p-3.5 ${isGoalMet ? 'bg-green-50 border-green-300' : touchedCount === total ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
                      <div className="flex items-center gap-3 mb-2">
                        <div className="flex-shrink-0">
                          {isGoalMet ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <Activity className="w-5 h-5 text-blue-500" />}
                        </div>
                        <span className={`text-sm font-semibold flex-1 ${isGoalMet ? 'text-green-800' : 'text-gray-800'}`}>
                          {isGoalMet ? 'All skills strongly covered!' : touchedCount === total ? `All ${total} skills touched — depth varies` : `${touchedCount}/${total} skills touched`}
                        </span>
                      </div>
                      {/* Two-row progress: touched vs strongly covered */}
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 w-28 flex-shrink-0">Skills touched</span>
                          <div className="flex-1 h-1.5 bg-white rounded-full overflow-hidden">
                            <div className="h-1.5 bg-blue-400 rounded-full transition-[width] duration-700" style={{ width: `${touchedPct}%` }} />
                          </div>
                          <span className="text-xs font-bold text-blue-700 w-8 text-right">{touchedPct}%</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 w-28 flex-shrink-0">Strong coverage</span>
                          <div className="flex-1 h-1.5 bg-white rounded-full overflow-hidden">
                            <div className="h-1.5 bg-green-500 rounded-full transition-[width] duration-700" style={{ width: `${strongPct}%` }} />
                          </div>
                          <span className="text-xs font-bold text-green-700 w-8 text-right">{strongPct}%</span>
                        </div>
                      </div>
                      {!isGoalMet && isInProgress && remainingUncovered > 0 && (
                        <p className="text-xs text-amber-600 mt-1.5">
                          {remainingUncovered} skill{remainingUncovered !== 1 ? 's' : ''} not yet touched
                        </p>
                      )}
                      {!isGoalMet && isInProgress && remainingToStrengthen > 0 && remainingUncovered === 0 && (
                        <p className="text-xs text-blue-600 mt-1.5">
                          All skills touched — {remainingToStrengthen} need deeper coverage
                        </p>
                      )}
                    </div>
                  )}

                  {/* No data yet — only shows if no cluster config available to pre-populate */}
                  {!sc && isInProgress && (
                    <div className="border border-dashed border-gray-300 rounded-xl p-8 text-center">
                      <RefreshCw className="w-8 h-8 text-gray-400 mx-auto mb-3 animate-spin" />
                      <p className="text-gray-500 font-medium">Waiting for first answer…</p>
                      <p className="text-sm text-gray-400 mt-1">Coverage updates as the candidate answers each question</p>
                    </div>
                  )}

                  {/* Explanatory note — shown when completed with low strong coverage */}
                  {!isInProgress && sc && strongPct <= 30 && (
                    <div className="flex items-start gap-2.5 p-3 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-700">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>
                        <strong>Why low strong coverage?</strong> Skills move to "Strongly Covered" only when the candidate gives a detailed, correct answer. Brief or partial answers are recorded as Low Coverage (skill was touched but not demonstrated deeply).
                      </span>
                    </div>
                  )}

                  {sc && (() => {
                    // Build cluster + skill data structured by section (MTH first, then NTH)
                    const skillLevel: Record<string, 'covered' | 'medium' | 'low' | 'uncovered'> = {};
                    for (const s of sc.covered        || []) skillLevel[s.toLowerCase()] = 'covered';
                    for (const s of sc.medium_covered || []) skillLevel[s.toLowerCase()] = 'medium';
                    for (const s of sc.low_covered    || []) skillLevel[s.toLowerCase()] = 'low';
                    for (const s of sc.uncovered      || []) skillLevel[s.toLowerCase()] = 'uncovered';

                    // Apply ratchet: if a skill was covered in a previous round but the current
                    // sc snapshot (which may only contain the new round's skills) shows it as
                    // uncovered, restore the best-ever level so MTH skills don't disappear when
                    // the interview transitions to the NTH round.
                    if (isInProgress) {
                      const ratchet = skillLevelRatchetRef.current;
                      const pr: Record<string, number> = { covered: 3, medium: 2, low: 1, skipped: 1, uncovered: 0 };
                      for (const [k, bestLevel] of Object.entries(ratchet)) {
                        const cur = skillLevel[k];
                        // Map 'skipped' to 'low' for display purposes (both = low coverage tier)
                        const displayLevel = bestLevel === 'skipped' ? 'low' : bestLevel;
                        if (!cur || (pr[cur] ?? 0) < pr[bestLevel]) {
                          skillLevel[k] = displayLevel;
                        }
                      }
                    }

                    const levelCfg = {
                      covered:   { label: 'Strong', short: '✓', bar: 'bg-green-500', text: 'text-green-700', chip: 'bg-green-100 text-green-700 border-green-200', pct: 100 },
                      medium:    { label: 'Partial', short: '◑', bar: 'bg-yellow-400', text: 'text-yellow-700', chip: 'bg-yellow-100 text-yellow-700 border-yellow-200', pct: 65 },
                      low:       { label: 'Low', short: '◷', bar: 'bg-orange-400', text: 'text-orange-600', chip: 'bg-orange-100 text-orange-600 border-orange-200', pct: 30 },
                      uncovered: { label: 'Not Covered', short: '○', bar: 'bg-gray-200', text: 'text-gray-400', chip: 'bg-gray-100 text-gray-400 border-gray-200', pct: 0 },
                    };

                    // Build skill → question-number mapping from coverage_events.
                    //
                    // Strategy A+ (newest): 'assigned' events from question_timer_started.current_skill
                    //   — ground truth: backend explicitly says which skill Linda is asking.
                    //   isFollowUp is stamped directly at event creation.
                    // Strategy A  (intermediate): coverage events with qNum stamped at creation,
                    //   and isFollowUp stamped from currentQuestionRef (no assigned events present).
                    // Strategy B  (legacy): timestamp ordering (no qNum stamps at all).
                    const skillToQuestions: Record<string, Array<{qNum: number; isFollowUp: boolean}>> = {};
                    if (liveEvents.length > 0) {
                      // Strategy A+: 'assigned' events (question_timer_started.current_skill)
                      const hasAssignedEvents = liveEvents.some(ev => ev.kind === 'assigned');

                      // Strategy A: coverage events with qNum stamped at creation time
                      const hasStampedQNum = liveEvents.some(
                        ev => (ev.kind === 'covered' || ev.kind === 'medium' || ev.kind === 'low') && ev.qNum != null
                      );

                      if (hasAssignedEvents) {
                        // Primary: use assigned events (exact skill Linda was targeting each Q)
                        for (const ev of liveEvents) {
                          if (ev.kind === 'assigned') {
                            const key = ev.skill;  // already lowercased at creation
                            if (!skillToQuestions[key]) skillToQuestions[key] = [];
                            // Each {qNum, isFollowUp} combo is a distinct entry
                            if (!skillToQuestions[key].some(q => q.qNum === ev.qNum && q.isFollowUp === ev.isFollowUp)) {
                              skillToQuestions[key].push({ qNum: ev.qNum, isFollowUp: ev.isFollowUp });
                            }
                          }
                        }
                        // Supplemental: coverage events for skills not captured by assigned
                        // (e.g. second skill in a combined question that evaluator detected)
                        for (const ev of liveEvents) {
                          if ((ev.kind === 'covered' || ev.kind === 'medium' || ev.kind === 'low') && ev.qNum) {
                            const key = ev.skill.toLowerCase();
                            const qNum = ev.qNum;
                            // Only add if this qNum isn't already recorded for this skill via assigned
                            if (!skillToQuestions[key]?.some(q => q.qNum === qNum)) {
                              const isFollowUp = ev.isFollowUp ?? false;
                              if (!skillToQuestions[key]) skillToQuestions[key] = [];
                              skillToQuestions[key].push({ qNum, isFollowUp });
                            }
                          }
                        }
                        for (const key of Object.keys(skillToQuestions)) {
                          skillToQuestions[key].sort((a, b) => a.qNum - b.qNum);
                        }
                      } else if (hasStampedQNum) {
                        // Strategy A: use qNum + isFollowUp stamped directly on each skill event
                        for (const ev of liveEvents) {
                          if ((ev.kind === 'covered' || ev.kind === 'medium' || ev.kind === 'low') && ev.qNum) {
                            const key = ev.skill.toLowerCase();
                            const qNum = ev.qNum;
                            // isFollowUp was stamped at event creation — trust it directly
                            const isFollowUp = ev.isFollowUp ?? false;
                            if (!skillToQuestions[key]) skillToQuestions[key] = [];
                            if (!skillToQuestions[key].some(q => q.qNum === qNum)) {
                              skillToQuestions[key].push({ qNum, isFollowUp });
                            }
                          }
                        }
                        for (const key of Object.keys(skillToQuestions)) {
                          skillToQuestions[key].sort((a, b) => a.qNum - b.qNum);
                        }
                      } else {
                        // Strategy B: legacy — timestamp ordering, pair each skill with the
                        // question event that immediately precedes it.
                        const sorted = [...liveEvents].sort((a, b) => a.ts - b.ts);
                        const qEvents = sorted.filter(e => e.kind === 'question') as Array<{ kind: 'question'; qNum: number; isFollowUp: boolean; ts: number }>;
                        for (const ev of sorted) {
                          if (ev.kind === 'covered' || ev.kind === 'medium' || ev.kind === 'low') {
                            let matched = qEvents.filter(q => q.ts <= ev.ts).pop() ?? qEvents[0] ?? null;
                            if (matched) {
                              const key = ev.skill.toLowerCase();
                              if (!skillToQuestions[key]) skillToQuestions[key] = [];
                              if (!skillToQuestions[key].some(q => q.qNum === matched!.qNum)) {
                                skillToQuestions[key].push({ qNum: matched.qNum, isFollowUp: matched.isFollowUp });
                              }
                            }
                          }
                        }
                        for (const key of Object.keys(skillToQuestions)) {
                          skillToQuestions[key].sort((a, b) => a.qNum - b.qNum);
                        }
                      }
                    }

                    const toggleSkill = (name: string) => setExpandedSkills(prev => {
                      const next = new Set(prev);
                      next.has(name) ? next.delete(name) : next.add(name);
                      return next;
                    });

                    // Group by section, sort by priority (high → low)
                    const mthClusters = clusterConfig.mth
                      .map(c => ({ ...c, section: 'mth' as const, skills: c.skills.map(s => ({ name: s, level: (skillLevel[s.toLowerCase()] || 'uncovered') as keyof typeof levelCfg })) }))
                      .sort((a, b) => b.priority - a.priority);
                    const nthClusters = clusterConfig.nth
                      .map(c => ({ ...c, section: 'nth' as const, skills: c.skills.map(s => ({ name: s, level: (skillLevel[s.toLowerCase()] || 'uncovered') as keyof typeof levelCfg })) }))
                      .sort((a, b) => b.priority - a.priority);
                    const hasClusters = mthClusters.length + nthClusters.length > 0;

                    // Find "currently being asked" — reverse-lookup skillToQuestions using currentQuestion.qNum.
                    // Falls back to first uncovered/low skill only when no question mapping exists yet.
                    const currentlyAskedSkillSet = new Set<string>();
                    if (isInProgress && currentQuestion) {
                      for (const [skill, qs] of Object.entries(skillToQuestions)) {
                        if (qs.some(q => q.qNum === currentQuestion.qNum)) currentlyAskedSkillSet.add(skill);
                      }
                    }
                    const fallbackTarget = currentlyAskedSkillSet.size === 0
                      ? (sc.uncovered[0]?.toLowerCase() || sc.low_covered[0]?.toLowerCase() || null)
                      : null;

                    const renderSection = (label: string, color: string, clusters: Array<{ id: string; name: string; priority: number; section: 'mth' | 'nth'; skills: Array<{ name: string; level: keyof typeof levelCfg }> }>) => {
                      if (clusters.length === 0) return null;
                      const sectionTouched = clusters.reduce((sum, c) => sum + c.skills.filter(s => s.level !== 'uncovered').length, 0);
                      const sectionTotal = clusters.reduce((sum, c) => sum + c.skills.length, 0);
                      const sectionPct = sectionTotal > 0 ? Math.round((sectionTouched / sectionTotal) * 100) : 0;

                      return (
                        <div className="border border-gray-200 rounded-xl overflow-hidden">
                          {/* Section header */}
                          <div className={`flex items-center justify-between px-4 py-2.5 border-b border-gray-200 ${color}`}>
                            <span className="text-sm font-bold">{label}</span>
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-1.5">
                                <div className="w-16 h-1.5 bg-white/40 rounded-full overflow-hidden">
                                  <div className="h-1.5 rounded-full bg-white transition-[width] duration-700" style={{ width: `${sectionPct}%` }} />
                                </div>
                                <span className="text-xs font-bold">{sectionPct}%</span>
                              </div>
                              <span className="text-xs">{sectionTouched}/{sectionTotal} skills</span>
                            </div>
                          </div>

                          {/* Clusters */}
                          <div className="divide-y divide-gray-50">
                            {clusters.map(c => {
                              const cov = c.skills.filter(s => s.level !== 'uncovered').length;
                              return (
                                <div key={c.id} className="px-4 py-3">
                                  {/* Cluster name + priority */}
                                  <div className="flex items-center justify-between mb-2.5">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 flex-shrink-0">P{c.priority}</span>
                                      <span className="text-xs font-semibold text-gray-800 truncate">{c.name}</span>
                                    </div>
                                    <span className={`text-xs font-bold flex-shrink-0 ml-2 ${cov === c.skills.length ? 'text-green-600' : cov > 0 ? 'text-orange-500' : 'text-gray-400'}`}>
                                      {cov}/{c.skills.length}
                                    </span>
                                  </div>

                                  {/* Skills as rows with bars + question dropdown */}
                                  <div className="space-y-1.5">
                                    {c.skills.map(({ name, level }) => {
                                      const cfg = levelCfg[level];
                                      const isCurrent = isInProgress && (currentlyAskedSkillSet.has(name.toLowerCase()) || fallbackTarget === name.toLowerCase());
                                      const qs = skillToQuestions[name.toLowerCase()] || [];
                                      const isExpanded = expandedSkills.has(name);

                                      // Split into main questions and follow-ups for separate counts
                                      const mainQs = qs.filter(q => !q.isFollowUp);
                                      const fuQs   = qs.filter(q => q.isFollowUp);

                                      // Collapsed button label: "Q3" or "Q3, Q5" + "+2 FU" separately
                                      const mainLabel = mainQs.length > 0
                                        ? mainQs.map(q => `Q${q.qNum}`).join(', ')
                                        : null;

                                      return (
                                        <div key={name} className={`rounded-lg border transition-colors duration-300 ${isCurrent ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-300' : 'border-gray-100 hover:border-gray-200'}`}>
                                          {/* Header row */}
                                          <div className="flex items-center gap-2 px-2 py-1.5">
                                            {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse flex-shrink-0" />}
                                            {/* Full skill name — no truncation */}
                                            <span className={`text-[11px] font-medium flex-1 min-w-0 leading-snug ${isCurrent ? 'text-blue-700' : cfg.text}`}>
                                              {name}
                                            </span>
                                            {/* Status chip */}
                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border flex-shrink-0 ${cfg.chip}`}>
                                              {cfg.label}
                                            </span>
                                            {/* Question badges — main Q in blue, follow-up in violet */}
                                            {qs.length > 0 && (
                                              <button
                                                onClick={() => toggleSkill(name)}
                                                className="flex items-center gap-1 flex-shrink-0"
                                                title="Show questions asked for this skill"
                                              >
                                                {mainQs.map(q => (
                                                  <span key={q.qNum} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                                                    Q{q.qNum}
                                                  </span>
                                                ))}
                                                {fuQs.map(q => (
                                                  <span key={`fu-${q.qNum}`} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">
                                                    Q{q.qNum} ↩
                                                  </span>
                                                ))}
                                                <ChevronDown className={`w-2.5 h-2.5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                              </button>
                                            )}
                                          </div>
                                          {/* Progress bar */}
                                          <div className="px-2 pb-1.5">
                                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                              <div className={`h-1.5 rounded-full transition-[width] duration-700 ease-out ${cfg.bar}`} style={{ width: `${cfg.pct}%` }} />
                                            </div>
                                          </div>
                                          {/* Expanded: all Qs in order — main (blue) and follow-ups (violet) */}
                                          {isExpanded && qs.length > 0 && (
                                            <div className="px-2 pb-2 border-t border-gray-100 pt-1.5">
                                              <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="text-[9px] text-gray-400 font-medium flex-shrink-0">Asked at:</span>
                                                {[...qs].sort((a, b) => a.qNum - b.qNum).map(q => (
                                                  <span
                                                    key={`${q.qNum}-${q.isFollowUp}`}
                                                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                                      q.isFollowUp
                                                        ? 'bg-violet-50 text-violet-700 border-violet-200'
                                                        : 'bg-blue-50 text-blue-700 border-blue-200'
                                                    }`}
                                                    title={q.isFollowUp ? `Q${q.qNum} — follow-up question` : `Q${q.qNum} — main question`}
                                                  >
                                                    Q{q.qNum}{q.isFollowUp ? ' ↩' : ''}
                                                  </span>
                                                ))}
                                              </div>
                                              {fuQs.length > 0 && (
                                                <p className="text-[9px] text-violet-500 mt-1">↩ = follow-up question</p>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    };

                    return (
                      <>
                        {/* Must-Have Skills section */}
                        {renderSection('Must-Have Skills', 'bg-purple-600 text-white', mthClusters)}

                        {/* Nice-to-Have Skills section */}
                        {renderSection('Nice-to-Have Skills', 'bg-indigo-500 text-white', nthClusters)}

                        {/* Fallback: no cluster config — show flat skill list */}
                        {!hasClusters && (
                          <div className="border border-gray-200 rounded-xl p-4 space-y-2">
                            <h4 className="text-sm font-semibold text-gray-800 mb-3">All Skills</h4>
                            {[...sc.covered, ...sc.medium_covered, ...sc.low_covered, ...sc.uncovered].map(skill => {
                              const level = skillLevel[skill.toLowerCase()] || 'uncovered';
                              const cfg = levelCfg[level];
                              const isCurrent = isInProgress && (currentlyAskedSkillSet.has(skill.toLowerCase()) || fallbackTarget === skill.toLowerCase());
                              const qs = skillToQuestions[skill.toLowerCase()] || [];
                              const isExpanded = expandedSkills.has(skill);
                              return (
                                <div key={skill} className={`rounded-lg border transition-colors ${isCurrent ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-300' : 'border-gray-100 hover:border-gray-200'}`}>
                                  <div className="flex items-center gap-2 px-2 py-1.5">
                                    {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse flex-shrink-0" />}
                                    <span className={`text-[11px] font-medium flex-1 min-w-0 leading-snug ${isCurrent ? 'text-blue-700' : cfg.text}`}>{skill}</span>
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border flex-shrink-0 ${cfg.chip}`}>{cfg.label}</span>
                                    {qs.length > 0 && (
                                      <button
                                        onClick={() => toggleSkill(skill)}
                                        className="flex items-center gap-1 flex-shrink-0"
                                        title="Show questions asked for this skill"
                                      >
                                        {qs.filter(q => !q.isFollowUp).map(q => (
                                          <span key={q.qNum} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                                            Q{q.qNum}
                                          </span>
                                        ))}
                                        {qs.filter(q => q.isFollowUp).map(q => (
                                          <span key={`fu-${q.qNum}`} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">
                                            Q{q.qNum} ↩
                                          </span>
                                        ))}
                                        <ChevronDown className={`w-2.5 h-2.5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                      </button>
                                    )}
                                  </div>
                                  <div className="px-2 pb-1.5">
                                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                      <div className={`h-1.5 rounded-full transition-[width] duration-700 ease-out ${cfg.bar}`} style={{ width: `${cfg.pct}%` }} />
                                    </div>
                                  </div>
                                  {isExpanded && qs.length > 0 && (
                                    <div className="px-2 pb-2 border-t border-gray-100 pt-1.5">
                                      <div className="flex flex-wrap gap-1">
                                        {[...qs].sort((a, b) => a.qNum - b.qNum).map(q => (
                                          <span key={`${q.qNum}-${q.isFollowUp}`} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${q.isFollowUp ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                                            Q{q.qNum}{q.isFollowUp ? ' ↩' : ''}
                                          </span>
                                        ))}
                                      </div>
                                      {qs.some(q => q.isFollowUp) && <p className="text-[9px] text-violet-500 mt-1">↩ = follow-up question</p>}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* HR Topics */}
                        {sc.hr_topics && Object.keys(sc.hr_topics).length > 0 && (
                          <div className="border border-purple-200 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="w-2 h-2 rounded-full bg-purple-400" />
                              <h4 className="text-sm font-semibold text-purple-800">HR Topics</h4>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              {Object.entries(sc.hr_topics).map(([topic, status]) => (
                                <div key={topic} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-50 border border-purple-100">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
                                  <span className="text-xs font-medium text-purple-800 truncate">{topic}</span>
                                  <span className="ml-auto text-[10px] text-purple-500 font-medium">{String(status)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
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
            {activeTab === 'clusters' && (() => {
              const clusterPlaceholder = getPlaceholderMessage('clusters');
              if (clusterPlaceholder) return renderPlaceholder(clusterPlaceholder);

              // Show live/post-completion cluster coverage when cluster_insights is absent.
              // This covers: in-progress sessions AND completed timed-mode sessions (cluster_insights
              // is only generated for flexible mode — timed mode must derive it from skill_coverage).
              // Also fall back when cluster_insights are all-Weak/zero (backend eval returned bad data).
              const ciAllWeakOrZero = Array.isArray(eval_.cluster_insights) &&
                eval_.cluster_insights.length > 0 &&
                (eval_.cluster_insights as any[]).every((ci: any) =>
                  !ci.band_score || ci.band_score === 'Weak' || ci.band_score === 'Not Covered' ||
                  ci.band_score === 'Not Evaluated' || ci.band === 0);
              const hasClusterInsights = eval_.cluster_insights && eval_.cluster_insights.length > 0 && !ciAllWeakOrZero;
              const hasClusterConfig = clusterConfig.mth.length + clusterConfig.nth.length > 0;
              // Build eval-derived coverage (always, so we can check whether it exists)
              const clusterRawMap = eval_.skill_coverage_map as Record<string, string> | undefined;
              const scFromEvalRaw = clusterRawMap && Object.keys(clusterRawMap).length > 0 ? {
                covered:          Object.keys(clusterRawMap).filter(s => clusterRawMap[s] === 'covered'),
                medium_covered:   Object.keys(clusterRawMap).filter(s => clusterRawMap[s] === 'medium'),
                low_covered:      Object.keys(clusterRawMap).filter(s => clusterRawMap[s] === 'low'),
                uncovered:        Object.keys(clusterRawMap).filter(s => !clusterRawMap[s] || clusterRawMap[s] === 'not_started'),
                nice_to_have_skills: [],
                total_questions: eval_.total_questions ?? 0,
                questions_asked: eval_.total_questions ?? 0,
              } : null;
              // If eval coverage is all-zero, use live field or best-seen as fallback
              const evalCovMeaningful = scFromEvalRaw &&
                (scFromEvalRaw.covered.length + scFromEvalRaw.medium_covered.length + scFromEvalRaw.low_covered.length) > 0;
              const scFromEval = evalCovMeaningful
                ? scFromEvalRaw
                : (liveSession.skill_coverage || bestSeenSkillCoverageRef.current
                    ? { ...(liveSession.skill_coverage || bestSeenSkillCoverageRef.current)!, nice_to_have_skills: [], total_questions: eval_.total_questions ?? 0, questions_asked: eval_.total_questions ?? 0 }
                    : scFromEvalRaw);
              // If no coverage data yet during in-progress but cluster config exists,
              // bootstrap an empty state so cluster bars are immediately visible (all 0%).
              const clusterInitial = isInProgress && !scFromEval && !liveSession.skill_coverage && hasClusterConfig
                ? { covered: [] as string[], medium_covered: [] as string[], low_covered: [] as string[],
                    uncovered: [...clusterConfig.mth, ...clusterConfig.nth].flatMap(c => c.skills),
                    nice_to_have_skills: [] as string[], total_questions: 0, questions_asked: 0 }
                : null;
              const hasEvalCoverage = scFromEval !== null || clusterInitial !== null;
              // Enter the derived view when:
              //   • interview is in-progress (live), OR
              //   • completed but no cluster_insights — either cluster config or eval coverage data exists
              if (!hasClusterInsights && (isInProgress || hasClusterConfig || hasEvalCoverage)) {
                // For in-progress: prefer live WebSocket data, then scFromEval, then initial bootstrap.
                // For completed: scFromEval already resolves to live/best-seen if eval was zero.
                const sc = isInProgress
                  ? (liveSession.skill_coverage ?? scFromEval ?? clusterInitial)
                  : (scFromEval ?? liveSession.skill_coverage ?? bestSeenSkillCoverageRef.current ?? null);

                // Use resolved cluster config (session special_instructions → fetched config fallback)
                const allClusters = [
                  ...clusterConfig.mth.map(c => ({ ...c, section: 'mth' as const })),
                  ...clusterConfig.nth.map(c => ({ ...c, section: 'nth' as const })),
                ].sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));

                // Case-insensitive sets for skill matching
                const coveredLower = new Set([...(sc?.covered || []), ...(sc?.medium_covered || []), ...(sc?.low_covered || [])].map(s => s.toLowerCase()));
                const strongLower = new Set((sc?.covered || []).map(s => s.toLowerCase()));
                const medLower = new Set((sc?.medium_covered || []).map(s => s.toLowerCase()));

                // Per-cluster stats
                const clusterStats = allClusters.map(c => {
                  const covered = c.skills.filter(s => coveredLower.has(s.toLowerCase())).length;
                  const pct = c.skills.length > 0 ? Math.round((covered / c.skills.length) * 100) : 0;
                  return { ...c, skillTotal: c.skills.length, covered, pct };
                });

                const touchedClusters = clusterStats.filter(c => c.covered > 0);

                // Priority adherence: group clusters by priority level, compare group averages
                const priorityGroups = clusterStats.reduce((acc, c) => {
                  (acc[c.priority] = acc[c.priority] || []).push(c);
                  return acc;
                }, {} as Record<number, typeof clusterStats>);
                const sortedPris = Object.keys(priorityGroups).map(Number).sort((a, b) => b - a);
                let adherencePass = 0, adherenceTotal = 0;
                for (let i = 0; i < sortedPris.length - 1; i++) {
                  const hiAvg = priorityGroups[sortedPris[i]].reduce((s, c) => s + c.pct, 0) / priorityGroups[sortedPris[i]].length;
                  const loAvg = priorityGroups[sortedPris[i + 1]].reduce((s, c) => s + c.pct, 0) / priorityGroups[sortedPris[i + 1]].length;
                  adherenceTotal++;
                  if (hiAvg >= loAvg) adherencePass++;
                }
                const adherencePct = adherenceTotal > 0 ? Math.round((adherencePass / adherenceTotal) * 100) : 100;
                const isAdherent = adherencePct >= 70;

                const totalSkills = (sc?.covered.length ?? 0) + (sc?.medium_covered.length ?? 0) + (sc?.low_covered.length ?? 0) + (sc?.uncovered.length ?? 0);
                const overallPct = totalSkills > 0 ? Math.round(((sc?.covered.length ?? 0) + (sc?.medium_covered.length ?? 0)) / totalSkills * 100) : 0;
                const questionsAsked = sc?.questions_asked ?? 0;

                return (
                  <div className="space-y-4">
                    {/* Status banner */}
                    {isInProgress ? (
                      <div className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-xl">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                          <span className="text-sm font-semibold text-red-700">LIVE</span>
                          <span className="text-xs text-red-600">Full cluster insights available after completion</span>
                        </div>
                        <span className="text-xs text-gray-500 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                          {liveWsConnected ? 'WebSocket' : 'reconnecting…'}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        <span className="text-sm font-semibold text-gray-700">Completed</span>
                        <span className="text-xs text-gray-500">Skill coverage derived from evaluation results</span>
                      </div>
                    )}

                    {/* Stats row */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-white border border-gray-200 rounded-xl p-3 text-center">
                        <p className="text-2xl font-bold text-gray-900">{questionsAsked}</p>
                        <p className="text-xs text-gray-500 mt-0.5">Questions Asked</p>
                      </div>
                      <div className="bg-white border border-gray-200 rounded-xl p-3 text-center">
                        <p className="text-2xl font-bold text-blue-700">{touchedClusters.length}<span className="text-base text-gray-400">/{allClusters.length || '—'}</span></p>
                        <p className="text-xs text-gray-500 mt-0.5">Clusters Touched</p>
                      </div>
                      <div className={`rounded-xl p-3 text-center border ${isAdherent ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
                        <p className={`text-2xl font-bold ${isAdherent ? 'text-green-700' : 'text-yellow-700'}`}>{adherencePct}%</p>
                        <p className="text-xs text-gray-500 mt-0.5">Priority Adherence</p>
                      </div>
                    </div>

                    {/* Cross-cluster events — delta-based: only fires when a single answer touched 2+ clusters */}
                    {crossClusterEvents.length > 0 && (
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
                        <div className="flex items-center gap-2">
                          <Activity className="w-4 h-4 text-blue-600" />
                          <span className="text-xs font-semibold text-blue-800">Cross-Cluster Events Detected</span>
                          <span className="ml-auto text-xs text-blue-600">{crossClusterEvents.length} event{crossClusterEvents.length > 1 ? 's' : ''}</span>
                        </div>
                        {crossClusterEvents.slice(-3).map((ev, i) => (
                          <div key={i} className="bg-white rounded-lg px-3 py-2 border border-blue-100">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] text-gray-400">Q{ev.qNum}</span>
                              {ev.clusters.map(cn => (
                                <span key={cn} className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">{cn}</span>
                              ))}
                              <span className="text-[10px] text-gray-400 ml-auto">{ev.skills.length} skill{ev.skills.length > 1 ? 's' : ''} newly covered</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Also show "X clusters active" summary even without delta events */}
                    {crossClusterEvents.length === 0 && touchedClusters.length > 1 && (
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                        <div className="flex items-center gap-2 mb-2">
                          <Activity className="w-4 h-4 text-blue-600" />
                          <span className="text-xs font-semibold text-blue-800">Cross-Cluster Coverage Active</span>
                          <span className="ml-auto text-xs text-blue-600">{touchedClusters.length} clusters addressed</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {touchedClusters.map(c => (
                            <span key={c.id} className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                              {c.name} — {c.covered}/{c.skillTotal}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Per-cluster coverage bars */}
                    {allClusters.length > 0 ? (
                      <div className="space-y-2.5">
                        <p className="text-sm font-semibold text-gray-700">Cluster Coverage (Priority Order)</p>
                        {clusterStats.map(c => (
                          <div key={c.id} className="bg-white border border-gray-200 rounded-xl p-4">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${c.section === 'mth' ? 'bg-purple-100 text-purple-700' : 'bg-indigo-100 text-indigo-700'}`}>
                                  P{c.priority}
                                </span>
                                <span className="text-sm font-medium text-gray-900 truncate">{c.name}</span>
                                <span className="text-xs text-gray-400 flex-shrink-0">{c.section === 'mth' ? 'MTH' : 'NTH'}</span>
                              </div>
                              <span className={`text-sm font-bold flex-shrink-0 ml-2 ${c.pct >= 70 ? 'text-green-600' : c.pct >= 40 ? 'text-yellow-600' : c.pct > 0 ? 'text-orange-500' : 'text-gray-400'}`}>
                                {c.pct}%
                              </span>
                            </div>
                            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-2 rounded-full transition-[width] duration-700 ease-out ${c.pct >= 70 ? 'bg-green-500' : c.pct >= 40 ? 'bg-yellow-500' : c.pct > 0 ? 'bg-orange-400' : 'bg-gray-200'}`}
                                style={{ width: `${c.pct}%` }}
                              />
                            </div>
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-xs text-gray-400">{c.covered}/{c.skillTotal} skills addressed</span>
                              <div className="flex flex-wrap gap-1 justify-end">
                                {c.skills.slice(0, 5).map(s => {
                                  const sl = s.toLowerCase();
                                  const isStrong = strongLower.has(sl);
                                  const isMed = medLower.has(sl);
                                  const isCov = coveredLower.has(sl);
                                  return (
                                    <span key={s} className={`text-xs px-1.5 py-0.5 rounded-full ${isStrong ? 'bg-green-100 text-green-700' : isMed ? 'bg-yellow-100 text-yellow-700' : isCov ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-400'}`}>
                                      {s}
                                    </span>
                                  );
                                })}
                                {c.skills.length > 5 && <span className="text-xs text-gray-400">+{c.skills.length - 5}</span>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : sc ? (
                      /* Fallback when no cluster config — simple 4-quadrant grid */
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: 'Strongly Covered', skills: sc.covered, color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200' },
                          { label: 'Partially Covered', skills: sc.medium_covered, color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200' },
                          { label: 'Low Coverage', skills: sc.low_covered, color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
                          { label: 'Not Covered', skills: sc.uncovered, color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
                        ].map(({ label, skills, color, bg, border }) => (
                          <div key={label} className={`${bg} ${border} border rounded-xl p-4`}>
                            <p className={`text-xs font-semibold ${color} mb-2`}>{label} ({skills.length})</p>
                            <div className="flex flex-wrap gap-1">
                              {skills.map(s => <span key={s} className={`text-xs px-2 py-0.5 rounded-full ${bg} ${border} border ${color}`}>{s}</span>)}
                              {skills.length === 0 && <span className="text-xs text-gray-400">—</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="border border-dashed border-gray-300 rounded-xl p-8 text-center">
                        {isInProgress
                          ? <RefreshCw className="w-8 h-8 text-gray-400 mx-auto mb-3 animate-spin" />
                          : <Activity className="w-8 h-8 text-gray-400 mx-auto mb-3" />}
                        <p className="text-gray-500 font-medium">{isInProgress ? 'Interview in progress' : 'No coverage data yet'}</p>
                        <p className="text-sm text-gray-400 mt-1">{isInProgress ? 'Coverage will appear here as questions are asked' : 'Cluster coverage data will appear once scoring completes'}</p>
                      </div>
                    )}

                    <p className="text-xs text-gray-400 text-center">{questionsAsked}/{sc?.total_questions ?? 0} questions asked · {overallPct}% overall skill coverage</p>
                  </div>
                );
              }

              return (
                <ClusterInsightsTab
                  clusterInsights={eval_.cluster_insights || []}
                  capabilityScore={eval_.capability_score ?? null}
                  sectionScores={eval_.section_scores ?? null}
                  capabilityScoreReasoning={eval_.capability_score_reasoning ?? null}
                />
              );
            })()}

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

            {/* Recording Tab — pass liveSession so hasFile reflects the latest
                recording_file_path even when it was set after the initial prop fetch */}
            {activeTab === 'recording' && (
              placeholderMsg ? renderPlaceholder(placeholderMsg) : (
                <RecordingTabContent
                  interview={liveSession}
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

            {/* Transcript Tab — use liveSession so evaluation_ready refresh populates
                the transcript even when the recruiter opened the view mid-interview */}
            {activeTab === 'transcript' && (
              placeholderMsg ? renderPlaceholder(placeholderMsg) : (() => {
                const messages = (liveSession.conversation_transcript || interview.conversation_transcript || [])
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
                        // AIU71: candidate-only metadata
                        const rawContent: string | undefined = !isAssistant ? msg.raw_content : undefined;
                        const questionId: string | undefined = !isAssistant ? msg.question_id : undefined;
                        const language: string | undefined = !isAssistant ? msg.language : undefined;
                        const hasCorrection = !isAssistant && rawContent && rawContent !== content;

                        return (
                          <div key={idx} className={`flex gap-2.5 ${isAssistant ? '' : 'flex-row-reverse'}`}>
                            {/* Avatar */}
                            <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold mt-0.5 ${
                              isAssistant ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-600'
                            }`}>
                              {isAssistant ? <Bot className="w-3.5 h-3.5" /> : candidateName[0].toUpperCase()}
                            </div>

                            {/* Bubble + metadata */}
                            <div className={`max-w-[75%] ${isAssistant ? '' : 'items-end flex flex-col'}`}>
                              {/* AIU71: question-id + language badges for candidate turns */}
                              {!isAssistant && (questionId || language) && (
                                <div className="flex items-center gap-1.5 mb-1 flex-row-reverse">
                                  {questionId && (
                                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 leading-none">
                                      {questionId}
                                    </span>
                                  )}
                                  {language && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 leading-none">
                                      {language}
                                    </span>
                                  )}
                                </div>
                              )}

                              <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                                isAssistant
                                  ? 'bg-gray-100 text-gray-800 rounded-tl-sm'
                                  : 'bg-blue-500 text-white rounded-tr-sm'
                              }`}>
                                {content}
                              </div>

                              {/* AIU71: raw transcript shown when it differs from corrected */}
                              {hasCorrection && (
                                <div className="mt-1.5 max-w-full px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-right">
                                  <p className="text-[10px] font-medium text-amber-600 mb-0.5">ASR (original)</p>
                                  <p className="text-xs text-amber-800 leading-snug">{rawContent}</p>
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
                  </div>
                );
              })()
            )}
            {/* Evaluation Tab */}
            {activeTab === 'evaluation' && (() => {
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
            {activeTab === 'violations' && (
              <div className="space-y-6">

                {/* Risk Summary Banner */}
                <div className={`rounded-lg border ${risk.bg} ${risk.border} overflow-hidden`}>
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <ShieldAlert className={`w-5 h-5 ${risk.color}`} />
                      <div>
                        <p className={`text-sm font-semibold ${risk.color}`}>
                          Integrity Status: {risk.label}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {totalViolations === 0
                            ? 'No violations detected during this interview.'
                            : `Risk score: ${severityStats.score} pts — Low×${severityStats.minor} (×1) · Medium×${severityStats.moderate} (×2) · High×${severityStats.severe} (×3)`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-2xl font-bold ${risk.color}`}>{severityStats.score}</span>
                      <button
                        onClick={() => setShowThresholdEditor(p => !p)}
                        title="Configure risk thresholds"
                        className="p-1.5 rounded border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-white transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Severity Breakdown Pills */}
                  {totalViolations > 0 && (
                    <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-gray-500">Breakdown:</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        severityStats.minor > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'
                      }`}>
                        Low: {severityStats.minor}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        severityStats.moderate > 0 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-400'
                      }`}>
                        Medium: {severityStats.moderate}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        severityStats.severe > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-400'
                      }`}>
                        High: {severityStats.severe}
                      </span>
                    </div>
                  )}

                  {/* Threshold Editor */}
                  {showThresholdEditor && (
                    <div className="px-4 pb-3 border-t border-gray-200 pt-3 bg-white bg-opacity-60">
                      <p className="text-xs font-medium text-gray-600 mb-2">Configure Risk Thresholds (score points)</p>
                      <div className="flex items-center gap-4 flex-wrap">
                        <label className="flex items-center gap-2 text-xs text-gray-600">
                          <span className="w-24">Low Risk ≤</span>
                          <input
                            type="number" min={1} max={riskThresholds.medium - 1}
                            value={riskThresholds.low}
                            onChange={e => setRiskThresholds(t => ({ ...t, low: Math.max(1, Math.min(t.medium - 1, Number(e.target.value))) }))}
                            className="w-14 px-2 py-1 rounded border border-gray-300 text-xs text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                          <span className="text-gray-400">pts</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs text-gray-600">
                          <span className="w-24">Medium Risk ≤</span>
                          <input
                            type="number" min={riskThresholds.low + 1}
                            value={riskThresholds.medium}
                            onChange={e => setRiskThresholds(t => ({ ...t, medium: Math.max(t.low + 1, Number(e.target.value)) }))}
                            className="w-14 px-2 py-1 rounded border border-gray-300 text-xs text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                          <span className="text-gray-400">pts</span>
                        </label>
                        <span className="text-xs text-gray-400">High Risk = above Medium threshold</span>
                        <button
                          onClick={() => { setRiskThresholds(DEFAULT_THRESHOLDS); }}
                          className="text-xs text-blue-500 hover:underline"
                        >
                          Reset defaults
                        </button>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1.5">Low = 1 pt · Medium = 2 pts · High = 3 pts</p>
                    </div>
                  )}
                </div>

                {/* Violation Type Grid — only types with at least one occurrence */}
                {(() => {
                  const activeTypes = [
                    'face_missing', 'multiple_faces', 'gaze_away',
                    'tab_switch', 'window_blur', 'fullscreen_exit',
                    'camera_disabled', 'camera_obstructed', 'microphone_disabled',
                    'copy_attempt', 'paste_attempt',
                    'voice_detected', 'multiple_voices',
                    'face_mismatch', 'face_identity_changed',
                    'voice_mismatch', 'voice_identity_changed',
                    'screenshot_attempt', 'screen_recording_attempt', 'screen_share_stopped',
                  ].filter(type => (violationCounts[type] ?? 0) > 0);
                  return (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Violation Breakdown</h3>
                  {activeTypes.length === 0 ? (
                    <p className="text-sm text-gray-400">No violations recorded.</p>
                  ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {activeTypes.map(type => {
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
                  )}
                </div>
                  );
                })()}

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
                              const sev = normaliseSeverity(row.severity);
                              const sevStyle =
                                sev === 'severe'   ? 'bg-red-100 text-red-700' :
                                sev === 'moderate' ? 'bg-orange-100 text-orange-700' :
                                                     'bg-blue-50 text-blue-600';
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
