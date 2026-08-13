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

import { Fragment, useMemo, useState, type ReactNode } from 'react';
import {
  ShieldAlert, ShieldCheck, Users, Eye, Camera, Clipboard,
  Play, ChevronDown, ChevronRight, AudioLines, Smartphone, QrCode,
} from 'lucide-react';
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
  critical: 'bg-red-100 text-red-700 ring-1 ring-red-200',
  warning: 'bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20',
  info: 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20',
  neutral: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
  clean: 'bg-green-100 text-green-700 ring-1 ring-green-200',
};
const TONE_DOT: Record<Tone, string> = {
  critical: 'bg-red-500', warning: 'bg-brand-orange', info: 'bg-brand-blue',
  neutral: 'bg-slate-300', clean: 'bg-green-500',
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
    <span className="text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 ring-1 ring-red-200">HIGH CONFIDENCE</span>
  ) : (
    <span className="text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded-full text-brand-orange-deep ring-1 ring-brand-orange/40">POSSIBLE</span>
  );
}

/* ── environment verification: video link + match badges ─────────────────── */
function EnvironmentVerificationDetail({ record }: { record: ViolationRecord }) {
  if (!record.event_type.startsWith('environment_verification_')) return null;
  const d = (record.details ?? {}) as Record<string, unknown>;
  const videoUrl = typeof d.video_url === 'string' ? d.video_url : null;
  const colorMatch = typeof d.color_match === 'boolean' ? d.color_match : null;
  const idMatch = typeof d.id_match === 'boolean' ? d.id_match : null;
  if (!videoUrl && colorMatch === null && idMatch === null) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap mt-1.5">
      {videoUrl && (
        <a
          href={videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-brand-blue hover:underline underline-offset-2 text-[11px] font-medium"
        >
          <Play className="w-3 h-3" />Watch verification video
        </a>
      )}
      {colorMatch !== null && (
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ring-1 ${colorMatch ? 'bg-green-50 text-green-700 ring-green-200' : 'bg-red-50 text-red-600 ring-red-200'}`}>
          Color {colorMatch ? 'matched' : 'mismatch'}
        </span>
      )}
      {idMatch !== null && (
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ring-1 ${idMatch ? 'bg-green-50 text-green-700 ring-green-200' : 'bg-red-50 text-red-600 ring-red-200'}`}>
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
  violations, startTs, completedAt, hasRecording, onJumpToRecording,
}: IntegrityCheckTabProps) {
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
  if (summary.raw === 0) {
    return (
      <div className="text-center py-16 bg-green-50 rounded-xl border border-green-200 ring-1 ring-green-100">
        <ShieldCheck className="w-9 h-9 text-green-500 mx-auto mb-3" />
        <p className="text-base font-semibold text-green-700">No integrity concerns detected</p>
        <p className="text-sm text-green-600/80 mt-1">This interview completed with a clean integrity status.</p>
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
                    <p className="text-[15px] font-semibold text-gray-900 tracking-tight">{def.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{def.description}</p>
                  </div>
                  <div className="text-right flex-none">
                    <div className={`text-xl font-bold leading-none ${tone === 'critical' ? 'text-red-600' : tone === 'warning' ? 'text-brand-orange-deep' : tone === 'info' ? 'text-brand-blue' : 'text-slate-400'}`}>{count}</div>
                    <div className="text-[10px] uppercase tracking-wide text-gray-400 mt-1">{key === 'advisory' ? 'hints' : 'flags'}</div>
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
                  <p className="px-4 pb-3.5 pl-16 text-[11px] text-gray-400 italic">
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
                <div className="absolute -top-0.5 -translate-x-1/2 text-[10px] font-semibold text-red-600 bg-red-50 ring-1 ring-red-200 px-2 py-0.5 rounded whitespace-nowrap"
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
            <div className="flex justify-between text-[11px] text-gray-400 tabular-nums mx-1.5">
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
                        <div className="text-[11px] text-gray-400 font-mono mt-0.5">{formatClock(g.firstTs)}</div>
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
                              <div className="text-[11px] text-gray-400 font-mono mt-0.5">{formatClock(r.timestamp)}</div>
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
        <p className="text-[11px] text-gray-400 mt-2.5">
          Grouped by type. {hasRecording
            ? 'Each time links to that moment in the recording; expand a row to see every occurrence.'
            : 'Expand a row to see every occurrence.'}
        </p>
      </div>
    </div>
  );
}

/* ── small presentational helpers ─────────────────────────────────────────── */
function GlanceTile({ label, value, tone, sub, dot }: {
  label: string; value: number; tone: Tone; sub: string; dot?: boolean;
}) {
  const valColor = tone === 'critical' ? 'text-red-600' : tone === 'warning' ? 'text-brand-orange-deep'
    : tone === 'info' ? 'text-brand-blue' : 'text-gray-900';
  return (
    <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm px-4 py-3.5">
      <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold flex items-center gap-1.5">
        {dot && <span className={`w-2 h-2 rounded-full ${TONE_DOT[tone]}`} />}{label}
      </div>
      <div className={`text-3xl font-extrabold tracking-tight mt-1.5 tabular-nums ${valColor}`}>{value}</div>
      <div className="text-[11px] text-gray-500 mt-1">{sub}</div>
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
    case 'critical': return { box: 'bg-red-50 border-red-200', iconWrap: 'bg-red-100 text-red-600', title: 'text-red-700' };
    case 'warning': return { box: 'bg-brand-orange/5 border-brand-orange/20', iconWrap: 'bg-brand-orange/10 text-brand-orange-deep', title: 'text-brand-orange-deep' };
    case 'clean': return { box: 'bg-green-50 border-green-200', iconWrap: 'bg-green-100 text-green-600', title: 'text-green-700' };
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
