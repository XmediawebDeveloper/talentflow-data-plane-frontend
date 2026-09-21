'use client';

/**
 * IntegrityCheckTab — recruiter-facing proctoring results.
 *
 * Replaces the old flat 20-box "Violations" grid. Presents the same
 * `proctoring_violations` data through a plain-language semantic layer
 * (see violationTaxonomy.ts): a verdict, an at-a-glance severity split, plain
 * category cards (with confidence tags for the identity checks), a timeline,
 * and a filterable/expandable event log that finally surfaces the raw
 * `details` (voice match scores, face distance, durations, reasons).
 *
 * Presentation only — no detection, scoring, or backend changes. Recruiter
 * severity comes from the backend-recomputed `severity` on each record.
 */

import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ShieldAlert, ShieldCheck, Users, Eye, Camera, Clipboard,
  Play, ChevronDown, ChevronRight, AudioLines, Smartphone, QrCode,
  X, Download,
} from 'lucide-react';
import api from '@/lib/services/api';
import {
  type ViolationRecord, type RecruiterSeverity, type CategoryKey,
  CATEGORIES, CATEGORY_ORDER,
  recruiterSeverity, categoryOf, labelOfViolation, groupKeyOf, confidenceOfViolation,
  describeViolation, summarizeViolations,
} from './violationTaxonomy';

interface IntegrityCheckTabProps {
  violations: ViolationRecord[];
  /** Session start ≈ recording start; anchor for "video time" offsets. */
  startTs?: string;
  /** Session end, for the timeline's total duration. */
  completedAt?: string;
  /** Whether a recording exists to seek into. */
  hasRecording: boolean;
  /** Seek the recording tab to `seconds` into the interview. */
  onJumpToRecording: (seconds: number) => void;
  /**
   * AI interview session id — needed to fetch evidence screenshots through the
   * authenticated GET /ai-interview/{interviewId}/proctor-event-screenshot
   * endpoint for the "Violation evidence" section below the Event log.
   */
  interviewId: string;
  /**
   * The pre-interview "hide the sharing bar" vision check's last recorded
   * result (system_check_results.share_bar_check on the session row) — the
   * two images it sent to the LLM (original + locally enhanced) plus the
   * verdict flags. Undefined when the candidate never reached that step, or
   * when persisting it failed (best-effort on the backend). Powers the
   * "Screen-share verification" section placed right after the Event log.
   */
  shareBarCheck?: {
    hidden?: boolean;
    pip_detected?: boolean;
    recorder_overlay_detected?: boolean;
    foreign_app_detected?: boolean;
    foreign_app_label?: string;
    interview_screen_present?: boolean;
    checked_at?: string;
  };
  /**
   * Every "I've hidden it — Continue" attempt the candidate made on the
   * share-bar step, oldest first (system_check_results.share_bar_check_attempts
   * on the session row) — lets a recruiter see how many tries it took and
   * inspect the screenshots from each one, not just the final successful try.
   * Falls back to just `shareBarCheck` (as a single implicit attempt) when
   * absent, for sessions recorded before this history was tracked.
   */
  shareBarCheckAttempts?: Array<{
    hidden?: boolean;
    pip_detected?: boolean;
    recorder_overlay_detected?: boolean;
    foreign_app_detected?: boolean;
    foreign_app_label?: string;
    interview_screen_present?: boolean;
    checked_at?: string;
  }>;
}

/* ── local time helpers (kept self-contained) ─────────────────────────────── */
function formatClock(ts?: string): string {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch { return '—'; }
}
function offsetSeconds(ts?: string, startTs?: string): number | null {
  if (!ts || !startTs) return null;
  const e = new Date(ts).getTime(); const s = new Date(startTs).getTime();
  if (Number.isNaN(e) || Number.isNaN(s)) return null;
  const off = Math.floor((e - s) / 1000);
  return off < 0 ? null : off;
}
function formatOffset(sec: number | null): string {
  if (sec == null) return '—';
  const mm = Math.floor(sec / 60); const ss = sec % 60;
  return `${mm}:${String(ss).padStart(2, '0')}`;
}

/* ── severity styling ─────────────────────────────────────────────────────── */
type Tone = 'critical' | 'warning' | 'info' | 'neutral' | 'clean';

const SEV_TONE: Record<RecruiterSeverity, Tone> = {
  serious: 'critical', moderate: 'warning', minor: 'info', advisory: 'neutral',
};
const SEV_LABEL: Record<RecruiterSeverity, string> = {
  serious: 'Serious', moderate: 'Moderate', minor: 'Minor', advisory: 'Advisory',
};
const SEV_PILL: Record<Tone, string> = {
  critical: 'bg-destructive-subtle text-destructive ring-1 ring-destructive-line',
  warning: 'bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20',
  info: 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20',
  neutral: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
  clean: 'bg-success-subtle text-success ring-1 ring-success-line',
};
const TONE_DOT: Record<Tone, string> = {
  critical: 'bg-destructive', warning: 'bg-brand-orange', info: 'bg-brand-blue',
  neutral: 'bg-slate-300', clean: 'bg-success',
};

const CATEGORY_ICON: Record<CategoryKey, ReactNode> = {
  ended: <ShieldAlert className="w-5 h-5" />,
  someone_else: <Users className="w-5 h-5" />,
  prohibited_item: <Smartphone className="w-5 h-5" />,
  device: <Camera className="w-5 h-5" />,
  capture: <Clipboard className="w-5 h-5" />,
  attention: <Eye className="w-5 h-5" />,
  environment: <QrCode className="w-5 h-5" />,
  advisory: <AudioLines className="w-5 h-5" />,
};

const CATEGORY_TONE: Record<CategoryKey, Tone> = {
  ended: 'critical', someone_else: 'critical',
  // 'warning', not 'critical': most prohibited-item hits are the hedged
  // "possible phone" tier, and painting those red overstates a coin-flip
  // detection. A confirmed phone still shows a Serious pill on its own row and
  // still drives the critical verdict banner.
  prohibited_item: 'warning',
  device: 'warning', capture: 'warning', attention: 'info', environment: 'warning', advisory: 'neutral',
};

const CARD_ACCENT: Record<Tone, string> = {
  critical: 'border-l-red-500', warning: 'border-l-brand-orange',
  info: 'border-l-brand-blue', neutral: 'border-l-slate-300', clean: 'border-l-green-500',
};

/* ── confidence tag ───────────────────────────────────────────────────────── */
// Takes the RECORD, not the event type: object detections derive their tier from
// the stored detection score, so a 33% hit can never render "HIGH CONFIDENCE".
function ConfidenceTag({ record }: { record: ViolationRecord }) {
  const c = confidenceOfViolation(record);
  if (!c) return null;
  return c === 'high' ? (
    <span className="text-2xs font-bold tracking-wide px-1.5 py-0.5 rounded-full bg-destructive-subtle text-destructive ring-1 ring-destructive-line">HIGH CONFIDENCE</span>
  ) : (
    <span className="text-2xs font-bold tracking-wide px-1.5 py-0.5 rounded-full text-brand-orange-deep ring-1 ring-brand-orange/40">POSSIBLE</span>
  );
}

/* ── environment verification: video link + match badges ─────────────────── */
function EnvironmentVerificationDetail({ record }: { record: ViolationRecord }) {
  const [loadingVideo, setLoadingVideo] = useState(false);
  if (!record.event_type.startsWith('environment_verification_')) return null;
  const d = (record.details ?? {}) as Record<string, unknown>;
  // The backend never puts a raw storage path (s3://... or a bare disk path)
  // here — only the verification's id. A fresh, browser-playable URL is
  // minted on demand (see handleWatchVideo) exactly when the recruiter asks
  // to watch it, never baked into this event's stored details.
  const verificationId = typeof d.verification_id === 'string' ? d.verification_id : null;
  const colorMatch = typeof d.color_match === 'boolean' ? d.color_match : null;
  const idMatch = typeof d.id_match === 'boolean' ? d.id_match : null;
  if (!verificationId && colorMatch === null && idMatch === null) return null;

  const handleWatchVideo = async () => {
    if (!verificationId || loadingVideo) return;
    setLoadingVideo(true);
    try {
      const { data } = await api.get(`/ai-interview/environment-verification/${verificationId}/recording-url`);
      if (data?.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer');
      } else {
        // Local-filesystem storage — no presigned URL exists; fetch the
        // stream through the authenticated API client and open it as a blob,
        // same fallback CandidateResultsView uses for the screen recording.
        const res = await api.get(
          `/ai-interview/environment-verification/${verificationId}/recording`,
          { responseType: 'blob' },
        );
        window.open(URL.createObjectURL(res.data), '_blank', 'noopener,noreferrer');
      }
    } catch {
      // best-effort — recruiter can retry the click
    } finally {
      setLoadingVideo(false);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap mt-1.5">
      {verificationId && (
        <button
          type="button"
          onClick={handleWatchVideo}
          disabled={loadingVideo}
          className="inline-flex items-center gap-1 text-brand-blue hover:underline underline-offset-2 text-2xs font-medium disabled:opacity-50 disabled:no-underline"
        >
          <Play className="w-3 h-3" />{loadingVideo ? 'Loading…' : 'Watch verification video'}
        </button>
      )}
      {colorMatch !== null && (
        <span className={`text-2xs font-medium px-1.5 py-0.5 rounded-full ring-1 ${colorMatch ? 'bg-success-subtle text-success ring-success-line' : 'bg-destructive-subtle text-destructive ring-destructive-line'}`}>
          Color {colorMatch ? 'matched' : 'mismatch'}
        </span>
      )}
      {idMatch !== null && (
        <span className={`text-2xs font-medium px-1.5 py-0.5 rounded-full ring-1 ${idMatch ? 'bg-success-subtle text-success ring-success-line' : 'bg-destructive-subtle text-destructive ring-destructive-line'}`}>
          ID {idMatch ? 'matched' : 'mismatch'}
        </span>
      )}
    </div>
  );
}

/* ── aggregation types ────────────────────────────────────────────────────── */
interface TypeGroup {
  /** Grouping identity — event_type, or event_type:object_class for detections. */
  key: string;
  event_type: string;
  category: CategoryKey;
  label: string;
  severity: RecruiterSeverity;
  count: number;
  firstTs?: string;
  records: ViolationRecord[];
}

export default function IntegrityCheckTab({
  violations, startTs, completedAt, hasRecording, onJumpToRecording, interviewId, shareBarCheck,
  shareBarCheckAttempts,
}: IntegrityCheckTabProps) {
  // Fall back to a single implicit attempt (the legacy "only latest kept"
  // shape) for sessions recorded before per-attempt history was tracked.
  const shareBarAttempts = shareBarCheckAttempts && shareBarCheckAttempts.length > 0
    ? shareBarCheckAttempts
    : (shareBarCheck ? [shareBarCheck] : []);
  const summary = useMemo(() => summarizeViolations(violations), [violations]);

  // Group by event_type (which already distinguishes the confidence tiers) —
  // except object detections, which additionally split per detected class so a
  // phone, a book and a second monitor never collapse into one generic row.
  const groups = useMemo<TypeGroup[]>(() => {
    const map = new Map<string, TypeGroup>();
    for (const v of violations) {
      const gk = groupKeyOf(v);
      let g = map.get(gk);
      if (!g) {
        const sev = recruiterSeverity(v);
        g = {
          key: gk,
          event_type: v.event_type,
          // Advisory/info events (paused, resumed, background noise) always
          // sit in the advisory bucket, never in a default category.
          category: sev === 'advisory' ? 'advisory' : categoryOf(v.event_type),
          // labelOfViolation, not labelOf: object detections name the actual
          // item that was seen ("Mobile phone in view").
          label: labelOfViolation(v),
          severity: sev,
          count: 0, firstTs: v.timestamp, records: [],
        };
        map.set(gk, g);
      }
      g.count += 1;
      g.records.push(v);
      if (v.timestamp && (!g.firstTs || v.timestamp < g.firstTs)) g.firstTs = v.timestamp;
    }
    const SEV_RANK: Record<RecruiterSeverity, number> = { serious: 0, moderate: 1, minor: 2, advisory: 3 };
    return [...map.values()].sort((a, b) =>
      SEV_RANK[a.severity] - SEV_RANK[b.severity] || b.count - a.count);
  }, [violations]);

  // One card per violation TYPE that has a captured evidence screenshot
  // (object-detection violations only — phone_detected / unauthorized_object;
  // everything else never gets a screenshot at capture time, so this is
  // naturally empty for them). Reuses the SAME grouping as the Event log table
  // above so "one card per group" matches "one row per group" 1:1.
  const evidenceGroups = useMemo(() => {
    const out: { key: string; label: string; record: ViolationRecord }[] = [];
    for (const g of groups) {
      const withShot = g.records.find(r => !!r.screenshot_url);
      if (withShot) out.push({ key: g.key, label: g.label, record: withShot });
    }
    return out;
  }, [groups]);

  // Categories present, in display order, with their groups.
  const categoryBlocks = useMemo(() => {
    return CATEGORY_ORDER
      .map(key => ({ key, groups: groups.filter(g => g.category === key) }))
      .filter(b => b.groups.length > 0);
  }, [groups]);

  const verdict = useMemo(() => buildVerdict(summary, groups, startTs), [summary, groups, startTs]);

  // Timeline
  const durationSec = useMemo(() => {
    const fromEnd = offsetSeconds(completedAt, startTs);
    if (fromEnd && fromEnd > 0) return fromEnd;
    const maxOff = violations.reduce((m, v) => {
      const o = offsetSeconds(v.timestamp, startTs);
      return o != null && o > m ? o : m;
    }, 0);
    return maxOff > 0 ? maxOff : 0;
  }, [completedAt, startTs, violations]);

  const timelineMarks = useMemo(() => {
    if (durationSec <= 0) return [];
    return violations
      .map(v => {
        const off = offsetSeconds(v.timestamp, startTs);
        if (off == null) return null;
        const rs = recruiterSeverity(v);
        if (rs === 'advisory') return null;
        return { pct: Math.min(98, Math.max(2, (off / durationSec) * 100)), tone: SEV_TONE[rs], off };
      })
      .filter((m): m is { pct: number; tone: Tone; off: number } => m != null)
      .sort((a, b) => a.pct - b.pct);
  }, [violations, startTs, durationSec]);

  const firstSeriousMark = timelineMarks.find(m => m.tone === 'critical');

  // Filter state for the event log
  const [filter, setFilter] = useState<'all' | CategoryKey>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (t: string) => setExpanded(prev => {
    const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n;
  });

  const filterChips: { key: 'all' | CategoryKey; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: summary.counted },
    ...CATEGORY_ORDER
      .filter(k => k !== 'advisory')
      .map(k => ({ key: k, label: shortCat(k), count: groups.filter(g => g.category === k).reduce((n, g) => n + g.count, 0) }))
      .filter(c => c.count > 0),
  ];
  const shownGroups = filter === 'all' ? groups : groups.filter(g => g.category === filter);

  const seekOffset = (ts?: string) => {
    const off = offsetSeconds(ts, startTs);
    if (off != null && hasRecording) onJumpToRecording(off);
  };

  /* ── empty state ────────────────────────────────────────────────────────── */
  // Only short-circuit to the plain banner when there is truly nothing else to
  // show. A clean candidate (zero proctoring violations) can still have a
  // share-bar verification check on record — that section must still render,
  // so this early return is skipped whenever shareBarCheck is present.
  if (summary.raw === 0 && !shareBarCheck) {
    return (
      <div className="text-center py-16 bg-success-subtle rounded-xl border border-success-line ring-1 ring-success-line">
        <ShieldCheck className="w-9 h-9 text-success mx-auto mb-3" />
        <p className="text-base font-semibold text-success">No integrity concerns detected</p>
        <p className="text-sm text-success/80 mt-1">This interview completed with a clean integrity status.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── VERDICT ─────────────────────────────────────────────────────── */}
      <div className={`rounded-xl border ${verdict.box} border-l-4 ${CARD_ACCENT[verdict.tone]} ring-1 ring-black/[0.02] shadow-sm`}>
        <div className="flex items-start gap-3.5 px-5 py-4">
          <div className={`w-10 h-10 flex-none rounded-xl grid place-items-center ${verdict.iconWrap}`}>
            {verdict.tone === 'clean' ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <h2 className={`text-base font-semibold tracking-tight ${verdict.title}`}>{verdict.headline}</h2>
            <p className="text-sm text-gray-600 mt-1 max-w-3xl">{verdict.body}</p>
            {verdict.recommendation && (
              <span className={`inline-flex items-center gap-1.5 mt-3 text-xs font-semibold px-2.5 py-1 rounded-lg ${SEV_PILL[verdict.tone === 'clean' ? 'clean' : verdict.tone]}`}>
                <ShieldAlert className="w-3.5 h-3.5" />
                {verdict.recommendation}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── AT A GLANCE ─────────────────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3 tracking-tight">At a glance</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <GlanceTile
            label="Flags that count" value={summary.counted} tone="neutral"
            sub={summary.advisory > 0
              ? `From ${summary.raw} recorded · ${summary.advisory} advisory excluded`
              : `${summary.raw} recorded`}
          />
          <GlanceTile label="Serious" value={summary.serious} tone="critical" sub="Someone else / left screen" dot />
          <GlanceTile label="Moderate" value={summary.moderate} tone="warning" sub="Worth a look" dot />
          <GlanceTile label="Minor" value={summary.minor} tone="info" sub="Attention / typing" dot />
        </div>
      </div>

      {/* ── WHAT WE FOUND ───────────────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3 tracking-tight">What we found</h3>
        <div className="space-y-3">
          {categoryBlocks.map(({ key, groups: cg }) => {
            const def = CATEGORIES[key];
            const tone = CATEGORY_TONE[key];
            const count = cg.reduce((n, g) => n + g.count, 0);
            return (
              <div key={key} className={`bg-white rounded-xl border border-gray-100 border-l-4 ${CARD_ACCENT[tone]} ring-1 ring-black/[0.02] shadow-sm overflow-hidden`}>
                <div className="flex items-center gap-3.5 px-4 py-3.5">
                  <div className={`w-9 h-9 flex-none rounded-lg grid place-items-center ${key === 'advisory' ? 'bg-slate-50 text-slate-400 ring-1 ring-slate-200' : `${SEV_PILL[tone]}`}`}>
                    {CATEGORY_ICON[key]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 tracking-tight">{def.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{def.description}</p>
                  </div>
                  <div className="text-right flex-none">
                    <div className={`text-xl font-bold leading-none ${tone === 'critical' ? 'text-destructive' : tone === 'warning' ? 'text-brand-orange-deep' : tone === 'info' ? 'text-brand-blue' : 'text-slate-400'}`}>{count}</div>
                    <div className="text-2xs uppercase tracking-wide text-gray-400 mt-1">{key === 'advisory' ? 'hints' : 'flags'}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 px-4 pb-3.5 pl-16">
                  {cg.map(g => (
                    <span key={g.key} className="inline-flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg bg-slate-50 text-gray-600 ring-1 ring-gray-100">
                      <span className="font-semibold text-gray-800">{g.label}</span>
                      <span className="tabular-nums text-gray-500">{g.count}×</span>
                      <ConfidenceTag record={g.records[0]} />
                    </span>
                  ))}
                </div>
                {key === 'advisory' && (
                  <p className="px-4 pb-3.5 pl-16 text-2xs text-gray-400 italic">
                    Kept separate from the violation count so the number reflects real integrity flags.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── TIMELINE ────────────────────────────────────────────────────── */}
      {timelineMarks.length > 0 && durationSec > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 tracking-tight">When it happened</h3>
          <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm px-5 pt-5 pb-4">
            <div className="relative h-14 mx-1.5">
              <div className="absolute left-0 right-0 top-9 h-0.5 bg-gray-200 rounded" />
              {firstSeriousMark && (
                <div className="absolute -top-0.5 -translate-x-1/2 text-2xs font-semibold text-destructive bg-destructive-subtle ring-1 ring-destructive-line px-2 py-0.5 rounded whitespace-nowrap"
                  style={{ left: `${firstSeriousMark.pct}%` }}>
                  First serious flag
                </div>
              )}
              {timelineMarks.map((m, i) => (
                <div key={i}
                  className={`absolute top-9 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white ${TONE_DOT[m.tone]} ${m.tone === 'critical' ? 'w-3 h-3' : 'w-2.5 h-2.5'}`}
                  style={{ left: `${m.pct}%` }}
                  title={`${SEV_LABEL[toneToSev(m.tone)]} · ${formatOffset(m.off)}`}
                />
              ))}
            </div>
            <div className="flex justify-between text-2xs text-gray-400 tabular-nums mx-1.5">
              <span>0:00</span>
              <span>{formatOffset(durationSec)} · end</span>
            </div>
            <div className="flex flex-wrap gap-5 text-xs text-gray-500 mt-3 pt-3 border-t border-gray-100">
              <LegendDot tone="critical" label="Serious" />
              <LegendDot tone="warning" label="Moderate" />
              <LegendDot tone="info" label="Minor" />
            </div>
          </div>
        </div>
      )}

      {/* ── EVENT LOG ───────────────────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3 tracking-tight">Event log</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {filterChips.map(c => (
            <button key={c.key} onClick={() => setFilter(c.key)}
              className={`text-xs px-3 py-1.5 rounded-lg ring-1 transition-colors ${
                filter === c.key
                  ? 'bg-brand-blue/10 text-brand-blue ring-brand-blue/30 font-semibold'
                  : 'bg-white text-gray-500 ring-gray-200 hover:text-brand-blue hover:ring-brand-blue/30'
              }`}>
              {c.label} <span className="tabular-nums font-semibold">{c.count}</span>
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm overflow-x-auto tf-table-shell">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-slate-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-8"></th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">What happened</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">What we saw</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">When</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Severity</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Times</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shownGroups.map(g => {
                const tone = SEV_TONE[g.severity];
                const isOpen = expanded.has(g.key);
                const firstOff = offsetSeconds(g.firstTs, startTs);
                const canSeek = firstOff != null && hasRecording;
                const canExpand = g.count > 1 && g.records.some(r => r.timestamp);
                return (
                  <Fragment key={g.key}>
                    <tr className="hover:bg-brand-blue/[0.02] transition-colors">
                      <td className="px-4 py-3 align-top">
                        {canExpand ? (
                          <button onClick={() => toggle(g.key)} aria-label={isOpen ? 'Collapse' : 'Expand'}
                            className="text-gray-400 hover:text-brand-blue">
                            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${SEV_PILL[tone]}`}>
                            {CATEGORY_ICON[g.category]}
                            {g.label}
                          </span>
                          <ConfidenceTag record={g.records[0]} />
                        </div>
                      </td>
                      <td className="tf-wrap px-4 py-3 align-top text-xs text-gray-600 max-w-[34ch] whitespace-normal break-words">
                        {describeViolation(g.records[0]) || <span className="text-gray-300">—</span>}
                        <EnvironmentVerificationDetail record={g.records[0]} />
                      </td>
                      <td className="px-4 py-3 align-top">
                        {canSeek ? (
                          <button onClick={() => seekOffset(g.firstTs)}
                            title="Jump to this moment in the recording"
                            className="inline-flex items-center gap-1 text-brand-blue hover:underline underline-offset-2 text-xs font-mono">
                            <Play className="w-3 h-3" />{formatOffset(firstOff)}
                          </button>
                        ) : (
                          <span className="text-xs font-mono text-gray-500">{formatOffset(firstOff)}</span>
                        )}
                        <div className="text-2xs text-gray-400 font-mono mt-0.5">{formatClock(g.firstTs)}</div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SEV_PILL[tone]}`}>{SEV_LABEL[g.severity]}</span>
                      </td>
                      <td className="px-4 py-3 align-top text-right tabular-nums font-semibold text-gray-800">{g.count}</td>
                    </tr>
                    {isOpen && g.records
                      .filter(r => r.timestamp)
                      .sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? ''))
                      .slice(0, 100)
                      .map((r, ri) => {
                        const off = offsetSeconds(r.timestamp, startTs);
                        const seek = off != null && hasRecording;
                        return (
                          <tr key={`${g.key}-${ri}`} className="bg-slate-50/40">
                            <td className="px-4 py-2"></td>
                            <td className="px-4 py-2 text-xs text-gray-400 pl-10">Occurrence {ri + 1}</td>
                            <td className="tf-wrap px-4 py-2 text-xs text-gray-500 max-w-[34ch] whitespace-normal break-words">
                              {describeViolation(r) || '—'}
                              <EnvironmentVerificationDetail record={r} />
                            </td>
                            <td className="px-4 py-2">
                              {seek ? (
                                <button onClick={() => off != null && hasRecording && onJumpToRecording(off)}
                                  className="inline-flex items-center gap-1 text-brand-blue hover:underline underline-offset-2 text-xs font-mono">
                                  <Play className="w-3 h-3" />{formatOffset(off)}
                                </button>
                              ) : (
                                <span className="text-xs font-mono text-gray-400">{formatOffset(off)}</span>
                              )}
                              <div className="text-2xs text-gray-400 font-mono mt-0.5">{formatClock(r.timestamp)}</div>
                            </td>
                            <td className="px-4 py-2"></td>
                            <td className="px-4 py-2"></td>
                          </tr>
                        );
                      })}
                  </Fragment>
                );
              })}
              {shownGroups.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">No events in this category.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-2xs text-gray-400 mt-2.5">
          Grouped by type. {hasRecording
            ? 'Each time links to that moment in the recording; expand a row to see every occurrence.'
            : 'Expand a row to see every occurrence.'}
        </p>
      </div>

      {/* ── SCREEN-SHARE VERIFICATION ───────────────────────────────────── */}
      {shareBarAttempts.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 tracking-tight">Screen-share verification</h3>
          <p className="text-2xs text-gray-400 mb-3">
            {shareBarAttempts.length > 1
              ? `The candidate needed ${shareBarAttempts.length} attempts on the "hide the sharing bar" step before the interview was allowed to start. Each attempt below shows the original screen capture and a locally sharpened/contrast-boosted copy sent to the AI at that moment. Click a thumbnail to enlarge.`
              : 'The two images sent to the AI before this interview was allowed to start — the original screen capture and a locally sharpened/contrast-boosted copy of the same capture, used to catch small or collapsed icons. Click a thumbnail to enlarge.'}
          </p>
          <div className="space-y-5">
            {shareBarAttempts.map((attempt, i) => {
              const isLatest = i === shareBarAttempts.length - 1;
              const clean = attempt.hidden && !attempt.pip_detected && !attempt.recorder_overlay_detected
                && !attempt.foreign_app_detected && attempt.interview_screen_present !== false;
              return (
                <div key={i} className={shareBarAttempts.length > 1 ? 'pl-3 border-l-2 border-gray-100' : ''}>
                  {shareBarAttempts.length > 1 && (
                    <div className="text-xs font-semibold text-gray-600 mb-2">
                      Attempt {i + 1}{isLatest ? ' (final — interview started)' : ' (blocked)'}
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
                    <ShareBarScreenshotCard
                      interviewId={interviewId} which="original" label="Original capture"
                      attemptIndex={shareBarAttempts.length > 1 ? i : undefined}
                    />
                    <ShareBarScreenshotCard
                      interviewId={interviewId} which="enhanced" label="Enhanced (sharpened/contrast)"
                      attemptIndex={shareBarAttempts.length > 1 ? i : undefined}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {attempt.hidden === false && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-destructive-subtle text-destructive ring-1 ring-destructive-line">Sharing bar was still visible</span>
                    )}
                    {attempt.pip_detected && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-destructive-subtle text-destructive ring-1 ring-destructive-line">Picture-in-Picture detected</span>
                    )}
                    {attempt.recorder_overlay_detected && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-destructive-subtle text-destructive ring-1 ring-destructive-line">Screen-recorder overlay detected</span>
                    )}
                    {attempt.foreign_app_detected && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-destructive-subtle text-destructive ring-1 ring-destructive-line">
                        Foreign app/window detected{attempt.foreign_app_label ? `: ${attempt.foreign_app_label}` : ''}
                      </span>
                    )}
                    {attempt.interview_screen_present === false && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-destructive-subtle text-destructive ring-1 ring-destructive-line">Interview screen not detected</span>
                    )}
                    {clean && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-success-subtle text-success ring-1 ring-success-line">Clean — no issues found</span>
                    )}
                  </div>
                  {attempt.checked_at && (
                    <p className="text-2xs text-gray-400 mt-2">Checked at {formatClock(attempt.checked_at)}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── VIOLATION EVIDENCE ──────────────────────────────────────────── */}
      {evidenceGroups.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 tracking-tight">Violation evidence</h3>
          <p className="text-2xs text-gray-400 mb-3">
            One captured frame per flagged item, with a short AI-generated description. Click a thumbnail to enlarge.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {evidenceGroups.map(g => (
              <EvidenceCard key={g.key} interviewId={interviewId} record={g.record} label={g.label} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Shared full-screen image overlay used by both EvidenceCard and
 * ShareBarScreenshotCard below. Closes on Escape, on an explicit X button, or
 * on clicking the backdrop (clicking the image itself does not close, so the
 * download button is reachable). `downloadName` drives the saved filename.
 */
function ImageLightbox({ url, alt, downloadName, onClose }: {
  url: string; alt: string; downloadName: string; onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6 cursor-zoom-out"
      onClick={onClose}
    >
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <a
          href={url}
          download={downloadName}
          onClick={(e) => e.stopPropagation()}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          aria-label="Download image"
        >
          <Download className="w-5 h-5" />
        </a>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-w-full max-h-full rounded-lg shadow-2xl cursor-default"
      />
    </div>
  );
}

/**
 * One evidence card: fetches the screenshot through the authenticated
 * GET /ai-interview/{interviewId}/proctor-event-screenshot endpoint (mirrors
 * the identity-photo fetch-on-mount pattern elsewhere in this app — the
 * backend never hands back a raw/presigned URL, so this call is required),
 * shows the AI summary underneath, and click-to-enlarges into a shared
 * ImageLightbox overlay with close and download controls.
 */
function EvidenceCard({ interviewId, record, label }: {
  interviewId: string; record: ViolationRecord; label: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [enlarged, setEnlarged] = useState(false);
  const objectClass = typeof record.details?.object_class === 'string' ? record.details.object_class : '';

  useEffect(() => {
    if (url || failed) return;
    let cancelled = false;
    const params = new URLSearchParams({ event_type: record.event_type });
    if (objectClass) params.set('object_class', objectClass);
    api.get(`/ai-interview/${interviewId}/proctor-event-screenshot?${params.toString()}`, { responseType: 'blob' })
      .then((res) => { if (!cancelled) setUrl(URL.createObjectURL(res.data)); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [interviewId, record.event_type, objectClass, url, failed]);

  if (failed) return null;

  const summary = record.ai_summary
    ?? (typeof record.details?.ai_summary === 'string' ? record.details.ai_summary : undefined);

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => url && setEnlarged(true)}
          disabled={!url}
          className="block w-full aspect-video bg-slate-100"
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={label} className="w-full h-full object-cover hover:opacity-90 transition-opacity" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">Loading…</div>
          )}
        </button>
        <div className="px-3 py-2.5">
          <div className="text-xs font-semibold text-gray-700">{label}</div>
          {summary && <p className="text-2xs text-gray-500 mt-1 leading-relaxed">{summary}</p>}
        </div>
      </div>
      {enlarged && url && (
        <ImageLightbox
          url={url}
          alt={label}
          downloadName={`${record.event_type}-${interviewId}.jpg`}
          onClose={() => setEnlarged(false)}
        />
      )}
    </>
  );
}

/**
 * One of the two "Screen-share verification" thumbnails (original / enhanced)
 * for a single check attempt, fetched through the authenticated GET
 * /ai-interview/{interviewId}/share-bar-screenshot?which=...&attempt=...
 * endpoint. Omitting `attemptIndex` fetches the latest attempt (backward
 * compatible with the endpoint's pre-history default).
 */
function ShareBarScreenshotCard({ interviewId, which, label, attemptIndex }: {
  interviewId: string; which: 'original' | 'enhanced'; label: string; attemptIndex?: number;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [enlarged, setEnlarged] = useState(false);

  useEffect(() => {
    if (url || failed) return;
    let cancelled = false;
    const params = new URLSearchParams({ which });
    if (attemptIndex !== undefined) params.set('attempt', String(attemptIndex));
    api.get(`/ai-interview/${interviewId}/share-bar-screenshot?${params.toString()}`, { responseType: 'blob' })
      .then((res) => { if (!cancelled) setUrl(URL.createObjectURL(res.data)); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [interviewId, which, attemptIndex, url, failed]);

  if (failed) return null;

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => url && setEnlarged(true)}
          disabled={!url}
          className="block w-full aspect-video bg-slate-100"
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={label} className="w-full h-full object-cover hover:opacity-90 transition-opacity" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">Loading…</div>
          )}
        </button>
        <div className="px-3 py-2.5">
          <div className="text-xs font-semibold text-gray-700">{label}</div>
        </div>
      </div>
      {enlarged && url && (
        <ImageLightbox
          url={url}
          alt={label}
          downloadName={`sharebar-${which}-${attemptIndex ?? 'latest'}-${interviewId}.jpg`}
          onClose={() => setEnlarged(false)}
        />
      )}
    </>
  );
}

/* ── small presentational helpers ─────────────────────────────────────────── */
function GlanceTile({ label, value, tone, sub, dot }: {
  label: string; value: number; tone: Tone; sub: string; dot?: boolean;
}) {
  const valColor = tone === 'critical' ? 'text-destructive' : tone === 'warning' ? 'text-brand-orange-deep'
    : tone === 'info' ? 'text-brand-blue' : 'text-gray-900';
  return (
    <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm px-4 py-3.5">
      <div className="text-2xs uppercase tracking-wide text-gray-400 font-semibold flex items-center gap-1.5">
        {dot && <span className={`w-2 h-2 rounded-full ${TONE_DOT[tone]}`} />}{label}
      </div>
      <div className={`text-3xl font-bold tracking-tight mt-1.5 tabular-nums ${valColor}`}>{value}</div>
      <div className="text-2xs text-gray-500 mt-1">{sub}</div>
    </div>
  );
}

function LegendDot({ tone, label }: { tone: Tone; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-full ${TONE_DOT[tone]}`} />{label}</span>;
}

function toneToSev(t: Tone): RecruiterSeverity {
  return t === 'critical' ? 'serious' : t === 'warning' ? 'moderate' : t === 'info' ? 'minor' : 'advisory';
}

function shortCat(k: CategoryKey): string {
  switch (k) {
    case 'someone_else': return 'Someone else';
    case 'prohibited_item': return 'Phone / item';
    case 'attention': return 'Attention';
    case 'device': return 'Camera / mic';
    case 'capture': return 'Copy / capture';
    case 'ended': return 'Ended early';
    case 'environment': return 'Environment check';
    default: return k;
  }
}

/* ── verdict ──────────────────────────────────────────────────────────────── */
interface Verdict {
  tone: Tone; headline: string; body: string; recommendation?: string;
  box: string; iconWrap: string; title: string;
}

function toneChrome(tone: Tone): Pick<Verdict, 'box' | 'iconWrap' | 'title'> {
  switch (tone) {
    case 'critical': return { box: 'bg-destructive-subtle border-destructive-line', iconWrap: 'bg-destructive-subtle text-destructive', title: 'text-destructive' };
    case 'warning': return { box: 'bg-brand-orange/5 border-brand-orange/20', iconWrap: 'bg-brand-orange/10 text-brand-orange-deep', title: 'text-brand-orange-deep' };
    case 'clean': return { box: 'bg-success-subtle border-success-line', iconWrap: 'bg-success-subtle text-success', title: 'text-success' };
    default: return { box: 'bg-brand-blue/5 border-brand-blue/20', iconWrap: 'bg-brand-blue/10 text-brand-blue', title: 'text-brand-blue' };
  }
}

function buildVerdict(
  summary: ReturnType<typeof summarizeViolations>,
  groups: TypeGroup[],
  startTs?: string,
): Verdict {
  const find = (t: string) => groups.find(g => g.event_type === t);
  const firstTsAmong = (types: string[]) => {
    const ts = types.map(t => find(t)?.firstTs).filter((x): x is string => !!x).sort();
    return ts[0];
  };
  const atMoment = (ts?: string) => {
    if (!ts) return '';
    const off = offsetSeconds(ts, startTs);
    const clock = formatClock(ts);
    return off != null ? ` (first at ${clock}, ≈ ${formatOffset(off)} into the recording)` : ` (first at ${clock})`;
  };

  // 1. Interview terminated
  if (summary.terminated) {
    const term = find('interview_terminated');
    return {
      tone: 'critical',
      headline: 'Interview ended early — the candidate left the screen',
      body: `${describeViolation(term!.records[0])} Per the proctoring policy the session was ended automatically and cannot be resumed.${summary.someoneElse ? ' A different voice or face was also detected — see below.' : ''}`,
      recommendation: 'Review before deciding — session was cut short',
      ...toneChrome('critical'),
    };
  }

  // 2. Someone else present
  if (summary.someoneElse) {
    const voiceTypes = ['multiple_voices', 'voice_identity_changed'];
    const faceTypes = ['multiple_faces', 'face_identity_changed'];
    const voiceCount = voiceTypes.reduce((n, t) => n + (find(t)?.count ?? 0), 0);
    const faceCount = faceTypes.reduce((n, t) => n + (find(t)?.count ?? 0), 0);
    const parts: string[] = [];
    if (voiceCount) parts.push(`a voice other than the enrolled candidate was heard ${voiceCount} time${voiceCount !== 1 ? 's' : ''}`);
    if (faceCount) parts.push(`a different or additional face appeared on camera ${faceCount} time${faceCount !== 1 ? 's' : ''}`);
    const moment = atMoment(firstTsAmong([...voiceTypes, ...faceTypes]));
    return {
      tone: 'critical',
      headline: 'Another person was likely involved — manual review recommended',
      body: `During the interview, ${parts.join(', and ')}${moment}. Jump to each flagged moment in the log below to review it in the recording before deciding.`,
      recommendation: 'Review the flagged moments in the recording',
      ...toneChrome('critical'),
    };
  }

  // 3. A phone was seen on camera. Ranked directly below "someone else" and
  //    above the generic serious bucket: a phone is a specific, self-explanatory
  //    breach, so the verdict names the device instead of making the recruiter
  //    open the log to find out what was flagged.
  if (summary.phoneSeen) {
    const phone = find('phone_detected');
    const others = groups
      .filter(g => g.event_type === 'unauthorized_object')
      .map(g => g.label.replace(/ in view$/, '').toLowerCase());
    const n = phone?.count ?? 0;
    const moment = atMoment(phone?.firstTs);
    const alsoSaw = others.length
      ? ` The camera also picked up ${others.join(', ')}.`
      : '';
    return {
      tone: 'critical',
      headline: 'A mobile phone was visible during the interview',
      body: `A phone was detected on camera ${n} time${n !== 1 ? 's' : ''}${moment}.${alsoSaw} Jump to each flagged moment in the log below to confirm it in the recording before deciding.`,
      recommendation: 'Confirm in the recording before deciding',
      ...toneChrome('critical'),
    };
  }

  // 3b. Repeated device disconnects. Ranked above the generic serious bucket
  //     because the PATTERN is the finding, and the generic verdict would hide
  //     it behind a bare count: any single unplug reads as an accident, but each
  //     one pauses the interview, so repeatedly pulling a cable is the one lever
  //     a candidate has for buying unmonitored time. Named explicitly so the
  //     recruiter knows to check what happened during those gaps.
  if (summary.repeatDeviceDisconnects) {
    const cam = find('camera_disabled');
    const mic = find('microphone_disabled');
    const bits = [
      cam?.count ? `camera ${cam.count}×` : '',
      mic?.count ? `microphone ${mic.count}×` : '',
    ].filter(Boolean).join(', ');
    return {
      tone: 'critical',
      headline: 'The camera or microphone was disconnected repeatedly',
      body: `Devices were disconnected ${summary.deviceDisconnects} times during the interview${bits ? ` (${bits})` : ''}. Each disconnect pauses the interview, so review the recording around these gaps — a single unplug is usually accidental, but a repeated pattern is worth confirming.`,
      recommendation: 'Review the recording around each disconnect',
      ...toneChrome('critical'),
    };
  }

  // 4. Other serious flags (screen share stopped, camera off, etc.)
  if (summary.serious > 0) {
    return {
      tone: 'critical',
      headline: 'Serious integrity flags detected — review recommended',
      body: `${summary.serious} serious flag${summary.serious !== 1 ? 's' : ''} (such as the camera being turned off or screen sharing stopped) occurred during the interview. Review the log below.`,
      recommendation: 'Review the flagged moments',
      ...toneChrome('critical'),
    };
  }

  // 5. Moderate only
  if (summary.moderate > 0) {
    return {
      tone: 'warning',
      headline: 'Some activity worth a look',
      body: `${summary.moderate} moderate flag${summary.moderate !== 1 ? 's' : ''} were recorded (for example the face briefly not visible, or a voice that partly stopped matching). None rose to a confirmed integrity breach.${summary.minor ? ` The other ${summary.minor} are minor attention blips.` : ''}`,
      ...toneChrome('warning'),
    };
  }

  // 6. Minor only
  if (summary.minor > 0) {
    return {
      tone: 'info',
      headline: 'Minor attention flags only — likely clean',
      body: `The candidate briefly looked away or left the window ${summary.minor} time${summary.minor !== 1 ? 's' : ''}. No sign of anyone else, and no camera, microphone, or copy/capture issues.`,
      ...toneChrome('info'),
    };
  }

  // 7. Advisory only / nothing counted
  return {
    tone: 'clean',
    headline: 'No integrity concerns detected',
    body: 'Only advisory environment hints were recorded. These do not affect the candidate’s result.',
    ...toneChrome('clean'),
  };
}
