'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, CheckCircle2, Loader2, Clock, Shield, Users,
  Brain, Video, Globe, Zap, Timer, Layers, Settings,
  ChevronRight, FileText, CheckCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import type { AIInterviewResponse, AIInterviewRoundConfig } from '@/lib/services/aiInterviewService';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { getPriorityLabel } from '@/lib/constants/aiInterviewPriority';
import { modeFromDuration } from '@/lib/constants/aiInterviewMode';
import PageBreadcrumb from '@/components/PageBreadcrumb';

/* ─────────────────────────────────────────────────────────────────────── */
/*  Types                                                                  */
/* ─────────────────────────────────────────────────────────────────────── */

interface Cluster {
  id: string;
  name: string;
  priority: 1 | 2 | 3 | 4 | 5;
  skills: string[];
  reason?: string;
}

interface ParsedInstructions {
  mth_clusters?: Cluster[];
  nth_clusters?: Cluster[];
  skill_weights?: Record<string, 'high' | 'medium' | 'low'>;
  interview_mode?: 'fixed' | 'flexible';
  buffer_enabled?: boolean;
  [key: string]: unknown;
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  Constants                                                               */
/* ─────────────────────────────────────────────────────────────────────── */

const STEPS = ['Select JD', 'Configure', 'Clusters', 'Preview & Publish'];
const CURRENT_STEP = 4;

function getTimedModeAllocation(nthEnabled: boolean, hrEnabled: boolean) {
  if (!nthEnabled && !hrEnabled) {
    return {
      mthMinutes: 30,
      nthMinutes: 0,
      hrMinutes: 0,
      mthQuestions: 15,
      nthQuestions: 0,
      hrQuestions: 0,
    };
  }

  if (nthEnabled && !hrEnabled) {
    return {
      mthMinutes: 20,
      nthMinutes: 10,
      hrMinutes: 0,
      mthQuestions: 10,
      nthQuestions: 5,
      hrQuestions: 0,
    };
  }

  if (nthEnabled && hrEnabled) {
    return {
      mthMinutes: 16,
      nthMinutes: 8,
      hrMinutes: 6,
      mthQuestions: 8,
      nthQuestions: 4,
      hrQuestions: 3,
    };
  }

  return {
    mthMinutes: 20,
    nthMinutes: 0,
    hrMinutes: 10,
    mthQuestions: 10,
    nthQuestions: 0,
    hrQuestions: 5,
  };
}

function getTimedModePercentages(nthEnabled: boolean, hrEnabled: boolean) {
  const allocation = getTimedModeAllocation(nthEnabled, hrEnabled);
  const total = allocation.mthQuestions + allocation.nthQuestions + allocation.hrQuestions;

  if (total <= 0) {
    return { mth: 0, nth: 0, hr: 0 };
  }

  const mth = Math.round((allocation.mthQuestions / total) * 100);
  const nth = nthEnabled ? Math.round((allocation.nthQuestions / total) * 100) : 0;
  const hr = hrEnabled ? 100 - mth - nth : 0;

  return { mth, nth, hr };
}

// Priority labels are imported from lib/constants/aiInterviewPriority (P1-P3 scale).

/* ─────────────────────────────────────────────────────────────────────── */
/*  Helper sub-components                                                   */
/* ─────────────────────────────────────────────────────────────────────── */

function PriorityBadge({ p }: { p: number }) {
  const { label, color } = getPriorityLabel(p);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full border ${color}`}>
      {label}
    </span>
  );
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100 bg-slate-50/60">
        <div className="w-10 h-10 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
          <Icon className="w-5 h-5 text-brand-blue" />
        </div>
        <h3 className="text-sm font-semibold text-gray-800 tracking-tight">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right">{value}</span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  Main component                                                          */
/* ─────────────────────────────────────────────────────────────────────── */

export default function AIInterviewPreview() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id') || '';

  /* State */
  const [loading, setLoading] = useState(true);
  const [interview, setInterview] = useState<AIInterviewResponse | null>(null);
  const [rounds, setRounds] = useState<AIInterviewRoundConfig[]>([]);
  const [mthClusters, setMthClusters] = useState<Cluster[]>([]);
  const [nthClusters, setNthClusters] = useState<Cluster[]>([]);
  const [skillWeights, setSkillWeights] = useState<Record<string, 'high' | 'medium' | 'low'>>({});
  const [interviewMode, setInterviewMode] = useState<'fixed' | 'flexible'>('fixed');
  const [bufferEnabled, setBufferEnabled] = useState<boolean>(false);
  const [publishing, setPublishing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  /* Load data */
  const loadInterview = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await aiInterviewService.get(id);
      setInterview(data);

      // Parse rounds_config
      if (data.rounds_config) {
        setRounds(data.rounds_config);
      }

      // Parse special_instructions JSON for clusters
      if (data.special_instructions) {
        try {
          const parsed: ParsedInstructions = JSON.parse(data.special_instructions);
          setMthClusters(parsed.mth_clusters ?? []);
          setNthClusters(parsed.nth_clusters ?? []);
          setSkillWeights(parsed.skill_weights ?? {});
          setInterviewMode(parsed.interview_mode === 'flexible' ? 'flexible' : 'fixed');
          setBufferEnabled(!!parsed.buffer_enabled);
        } catch {
          setInterviewMode(modeFromDuration(data.duration_minutes));
        }
      } else {
        setInterviewMode(modeFromDuration(data.duration_minutes));
      }
    } catch {
      toast.error('Failed to load interview configuration');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadInterview();
  }, [loadInterview]);

  /* Derived values */
  const mode: 'fixed' | 'flexible' = interviewMode;
  const duration = interview?.duration_minutes ?? 30;
  const position = interview?.position ?? interview?.jd_title ?? 'Untitled Position';
  const experienceLevel = interview?.jd_experience_level ?? '—';

  const mthRound = rounds.find(r => r.type === 'must_have_skills' || r.type === 'must_to_have' || r.type === 'technical');
  const nthRound = rounds.find(r => r.type === 'nice_to_have_skills' || r.type === 'nice_to_have');
  const hrRound = rounds.find(r => r.type === 'hr');

  const enabledRounds = rounds.filter(r => r.enabled);
  const timedAllocation = getTimedModeAllocation(!!(nthRound && nthRound.enabled), !!(hrRound && hrRound.enabled));
  const timedPreviewDurations = React.useMemo<Record<string, number>>(() => {
    if (mode !== 'fixed') return {};
    const map: Record<string, number> = {};
    if (mthRound?.enabled) map[mthRound.type] = timedAllocation.mthMinutes;
    if (nthRound?.enabled) map[nthRound.type] = timedAllocation.nthMinutes;
    if (hrRound?.enabled) map[hrRound.type] = timedAllocation.hrMinutes;
    return map;
  }, [mode, mthRound, nthRound, hrRound, timedAllocation]);
  const timedPreviewQuestions = React.useMemo<Record<string, number>>(() => {
    if (mode !== 'fixed') return {};
    const map: Record<string, number> = {};
    if (mthRound?.enabled) map[mthRound.type] = timedAllocation.mthQuestions;
    if (nthRound?.enabled) map[nthRound.type] = timedAllocation.nthQuestions;
    if (hrRound?.enabled) map[hrRound.type] = timedAllocation.hrQuestions;
    return map;
  }, [mode, mthRound, nthRound, hrRound, timedAllocation]);
  const languages = interview?.available_languages ?? (interview?.ai_voice_language ? [interview.ai_voice_language] : ['English']);

  /* Publish handler */
  const handlePublish = async () => {
    setPublishing(true);
    try {
      await aiInterviewService.publishConfig(id);
      setShowConfirm(false);
      toast.success('AI Interview published!');
      const params = new URLSearchParams({
        published: '1',
        title: position,
      });
      router.push(`/recruitment/ai-interviews?${params.toString()}`);
    } catch {
      toast.error('Failed to publish');
    } finally {
      setPublishing(false);
    }
  };

  /* Navigation */
  const goBack = () => {
    router.push('/recruitment/ai-interviews/jd-selection/ai-interview-config/clusters?id=' + id);
  };

  const handleSaveAsDraft = async () => {
    toast.success('Draft saved!');
    router.push('/recruitment/ai-interviews');
  };

  const handleDiscard = async () => {
    if (!id) return;
    try {
      await aiInterviewService.delete(id);
      toast.success('Draft discarded');
    } catch {
      // Silent
    }
    router.push('/recruitment/ai-interviews');
  };

  /* ───────────── Loading state ───────────── */
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-brand-blue animate-spin" />
          <p className="text-sm text-gray-500">Loading preview...</p>
        </div>
      </div>
    );
  }

  if (!interview) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] bg-slate-50">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Interview configuration not found.</p>
          <button
            onClick={() => router.push('/recruitment/ai-interviews')}
            className="text-sm text-brand-blue underline"
          >
            Go to AI Interviews
          </button>
        </div>
      </div>
    );
  }

  /* ───────────── Preview mode ───────────── */
  return (
    <main className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full min-h-[calc(100vh-7rem)] bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl pb-28">
          <PageBreadcrumb
            className="mb-4 md:mb-6"
            items={[
              { label: 'Dashboard', href: '/dashboard' },
              { label: 'AI Interviews', href: '/recruitment/ai-interviews' },
              { label: 'Preview' },
            ]}
          />
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((label, i) => {
          const stepNum = i + 1;
          const isCompleted = stepNum < CURRENT_STEP;
          const isCurrent = stepNum === CURRENT_STEP;
          return (
            <React.Fragment key={label}>
              {isCompleted ? (
                <>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center bg-green-100 ring-1 ring-green-200">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  </div>
                  <span className="text-sm text-gray-400">{label}</span>
                </>
              ) : isCurrent ? (
                <>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center bg-brand-blue text-white text-sm font-medium shadow-md shadow-brand-blue/25 ring-1 ring-white/10">{stepNum}</div>
                  <span className="text-sm text-gray-900 font-medium">{label}</span>
                </>
              ) : (
                <>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center bg-slate-100 text-gray-400 text-sm ring-1 ring-gray-200">{stepNum}</div>
                  <span className="text-sm text-gray-400">{label}</span>
                </>
              )}
              {i < STEPS.length - 1 && <div className="w-10 h-px bg-gray-200" />}
            </React.Fragment>
          );
        })}
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={goBack}
          className="p-1.5 rounded-lg hover:bg-brand-blue/5 transition-colors"
          aria-label="Back to Clusters" title="Back to Clusters"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="w-11 h-11 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
          <CheckCircle className="w-5 h-5 text-brand-blue" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 tracking-tight">Review &amp; Publish</h1>
      </div>

      <div className="space-y-5">
        {/* ── JD Info Card ── */}
        <div className="rounded-xl overflow-hidden border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
          <div className="bg-brand-blue px-5 py-4 ring-1 ring-white/10">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-white/80" />
              <span className="text-xs font-medium text-white/80 uppercase tracking-wide">Job Description</span>
            </div>
            <h2 className="text-lg font-bold text-white tracking-tight">{position}</h2>
          </div>
          <div className="bg-white px-5 py-4">
            <div className="grid grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">JD ID</p>
                {interview.jd_short_id ? (
                  <span className="inline-flex items-center px-2 py-0.5 text-xs font-mono font-semibold bg-brand-blue text-white rounded shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                    {interview.jd_short_id}
                  </span>
                ) : (
                  <p className="text-sm font-medium text-gray-900">—</p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">JD Title</p>
                <p className="text-sm font-medium text-gray-900">{interview.jd_title ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Experience Level</p>
                <p className="text-sm font-medium text-gray-900">{experienceLevel}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Industry</p>
                <p className="text-sm font-medium text-gray-900">{interview.jd_industry_type ?? '—'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Interview Mode Card ── */}
        <SectionCard title="Interview Mode" icon={Zap}>
          <div className="flex items-center gap-3">
            {mode === 'fixed' ? (
              <>
                <div className="w-10 h-10 rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/20 flex items-center justify-center">
                  <Timer className="w-5 h-5 text-brand-cyan" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Fixed — {duration} min</p>
                  <p className="text-xs text-gray-500">Structured interview with timed rounds</p>
                </div>
              </>
            ) : (
              <>
                <div className="w-10 h-10 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-brand-blue" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900">Flexible — {bufferEnabled ? 35 : 30} min</p>
                    {bufferEnabled && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20">
                        <Timer className="w-3 h-3" />
                        +5 min buffer
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    Adaptive interview with dynamic pacing{bufferEnabled ? ' · buffer time enabled' : ''}
                  </p>
                </div>
              </>
            )}
          </div>
        </SectionCard>

        {/* ── Time Allocation Table (fixed mode only) ── */}
        {mode === 'fixed' && enabledRounds.length > 0 && (
          <SectionCard title="Time Allocation" icon={Clock}>
            <div className="overflow-hidden rounded-lg border border-gray-100 ring-1 ring-black/[0.02]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-4 py-2.5 font-medium text-gray-600">Round</th>
                    <th className="px-4 py-2.5 font-medium text-gray-600 text-right">Questions</th>
                    <th className="px-4 py-2.5 font-medium text-gray-600 text-right">Clusters</th>
                    <th className="px-4 py-2.5 font-medium text-gray-600 text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {enabledRounds.map(r => {
                    const isMth = r.type === 'must_have_skills' || r.type === 'must_to_have' || r.type === 'technical';
                    const isNth = r.type === 'nice_to_have_skills' || r.type === 'nice_to_have';
                    const roundLabel = isMth ? 'Must-To-Have' : isNth ? 'Nice-To-Have' : r.type === 'hr' ? 'HR Round' : r.type;
                    const previewMin = timedPreviewDurations[r.type] ?? r.duration_minutes;
                    const previewQuestions = timedPreviewQuestions[r.type] ?? r.planned_questions ?? 0;
                    const clusterCount = isMth ? mthClusters.length : isNth ? nthClusters.length : null;
                    return (
                      <tr key={r.type}>
                        <td className="px-4 py-2.5 text-gray-900">{roundLabel}</td>
                        <td className="px-4 py-2.5 text-gray-700 text-right">
                          <span className="inline-flex items-center justify-center min-w-[24px] px-2 py-0.5 rounded-md text-xs font-semibold bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">{previewQuestions}</span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-700 text-right">{clusterCount !== null ? clusterCount : '—'}</td>
                        <td className="px-4 py-2.5 text-gray-700 text-right">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20">{previewMin} min</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-semibold">
                    <td className="px-4 py-2.5 text-gray-900">Total</td>
                    <td className="px-4 py-2.5 text-gray-900 text-right">
                      {enabledRounds.reduce((s, r) => s + (timedPreviewQuestions[r.type] ?? r.planned_questions ?? 0), 0)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-900 text-right">
                      {mthClusters.length + nthClusters.length}
                    </td>
                    <td className="px-4 py-2.5 text-gray-900 text-right">
                      {enabledRounds.reduce((s, r) => s + (timedPreviewDurations[r.type] ?? r.duration_minutes), 0)} min
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </SectionCard>
        )}

        {/* ── Skill Clusters Card ── */}
        {(mthClusters.length > 0 || nthClusters.length > 0) && (
          <SectionCard title="Skill Clusters" icon={Layers}>
            <div className="space-y-6">
              {/* Must-To-Have Clusters */}
              {mthClusters.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Must-To-Have Clusters</h4>
                  <div className="space-y-3">
                    {mthClusters.map(cluster => (
                      <div key={cluster.id} className="border border-gray-100 ring-1 ring-black/[0.02] rounded-lg p-4 bg-white hover:border-brand-blue/30 hover:shadow-sm hover:shadow-brand-blue/10 transition-all">
                        <div className="flex items-center gap-2 mb-2">
                          <PriorityBadge p={cluster.priority} />
                          <span className="text-sm font-semibold text-gray-900">{cluster.name}</span>
                          <span className="text-xs text-gray-400 ml-auto">
                            {cluster.skills.length} skill{cluster.skills.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {cluster.skills.map(skill => (
                            <span
                              key={skill}
                              className="inline-flex items-center px-2 py-0.5 rounded-md bg-brand-blue/5 text-xs text-brand-blue ring-1 ring-brand-blue/20"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Nice-To-Have Clusters */}
              {nthClusters.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Nice-To-Have Clusters</h4>
                  <div className="space-y-3">
                    {nthClusters.map(cluster => (
                      <div key={cluster.id} className="border border-gray-100 ring-1 ring-black/[0.02] rounded-lg p-4 bg-white hover:border-brand-cyan/30 hover:shadow-sm hover:shadow-brand-cyan/10 transition-all">
                        <div className="flex items-center gap-2 mb-2">
                          <PriorityBadge p={cluster.priority} />
                          <span className="text-sm font-semibold text-gray-900">{cluster.name}</span>
                          <span className="text-xs text-gray-400 ml-auto">
                            {cluster.skills.length} skill{cluster.skills.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {cluster.skills.map(skill => (
                            <span
                              key={skill}
                              className="inline-flex items-center px-2 py-0.5 rounded-md bg-brand-cyan/10 text-xs text-brand-cyan ring-1 ring-brand-cyan/20"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </SectionCard>
        )}

        {/* ── HR Round Card ── */}
        <SectionCard title="HR Round" icon={Users}>
          {mode === 'fixed' && hrRound?.enabled && (
            <div className="mt-4 space-y-0 divide-y divide-gray-100">
              <InfoRow label="Questions" value={`${timedAllocation.hrQuestions}`} />
              <InfoRow label="Time" value={`${timedAllocation.hrMinutes} min`} />
            </div>
          )}
          {hrRound?.enabled && (hrRound as any).hr_questions?.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Selected HR Questions</p>
              <ol className="space-y-2">
                {((hrRound as any).hr_questions as { id: string; question_text: string; answer_type: string }[]).map((q, idx) => (
                  <li key={q.id} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-50 border border-gray-100">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 text-[10px] font-bold flex items-center justify-center mt-0.5">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800">{q.question_text}</p>
                      <span className="text-[10px] text-gray-400 mt-0.5 inline-block">{q.answer_type === 'yes_no' ? 'Yes / No' : 'Text answer'}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </SectionCard>

        {/* ── Settings Card ── */}
        <SectionCard title="Settings" icon={Settings}>
          <div className="space-y-0 divide-y divide-gray-100">
            <InfoRow
              label="Recording"
              value={
                interview.recording_enabled ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 ring-1 ring-green-200">
                    <Video className="w-3 h-3" /> Enabled
                  </span>
                ) : (
                  <span className="text-sm text-gray-400">Disabled</span>
                )
              }
            />
            {interview.introduction_video_url ? (
              <div className="py-3 border-b border-gray-100">
                <p className="text-sm text-gray-500 mb-2">Introduction Video</p>
                <video
                  src={interview.introduction_video_url}
                  controls
                  className="w-full max-w-md rounded-lg border border-gray-200 bg-black"
                  style={{ maxHeight: '240px' }}
                >
                  Your browser does not support the video tag.
                </video>
              </div>
            ) : (
              <InfoRow
                label="Introduction Video"
                value={<span className="text-sm text-gray-400">None</span>}
              />
            )}
            <InfoRow
              label="Languages"
              value={
                <div className="flex flex-wrap gap-1.5 justify-end">
                  {languages.map(lang => (
                    <span
                      key={lang}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-blue/5 text-xs text-brand-blue ring-1 ring-brand-blue/20"
                    >
                      <Globe className="w-3 h-3 text-brand-blue" />
                      {lang}
                    </span>
                  ))}
                </div>
              }
            />
          </div>
        </SectionCard>
      </div>

      {/* ── Sticky Footer ── */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 z-40">
        <div className="px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={goBack}
              className="px-4 py-2.5 border border-gray-200 bg-white text-gray-700 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors text-sm font-medium flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Clusters
            </button>
            <button
              onClick={handleDiscard}
              className="px-3 py-2.5 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
            >
              Discard
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveAsDraft}
              className="px-4 py-2.5 border border-gray-200 bg-white text-gray-700 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors text-sm font-medium"
            >
              Save as Draft
            </button>
            <button
              onClick={() => setShowConfirm(true)}
              disabled={publishing}
              className="px-6 py-2.5 bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {publishing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Publishing...
                </>
              ) : (
                <>
                  Publish Interview
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Confirmation Dialog ── */}
      <ConfirmationDialog
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handlePublish}
        title="Publish Interview?"
        description="Once published, the interview will be live and available for candidate invitations. You can still make changes later."
        confirmText="Yes, Publish"
        cancelText="Cancel"
        variant="info"
      />

      </div>
      </div>
    </main>
  );
}
