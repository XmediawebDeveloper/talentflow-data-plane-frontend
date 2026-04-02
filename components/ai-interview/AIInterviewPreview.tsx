'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, CheckCircle2, Loader2, Clock, Shield, Users,
  Brain, Video, Globe, Zap, Timer, Layers, Settings,
  ChevronRight, FileText, BarChart3, CheckCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import type { AIInterviewResponse, AIInterviewRoundConfig } from '@/lib/services/aiInterviewService';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';

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

const PRIORITY_LABELS: Record<number, { label: string; color: string; dot: string }> = {
  5: { label: 'P5 – Critical',   color: 'bg-red-100 text-red-700 border-red-200',       dot: 'bg-red-500' },
  4: { label: 'P4 – High',       color: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  3: { label: 'P3 – Medium',     color: 'bg-yellow-100 text-yellow-700 border-yellow-200', dot: 'bg-yellow-500' },
  2: { label: 'P2 – Low',        color: 'bg-blue-100 text-blue-700 border-blue-200',     dot: 'bg-blue-500' },
  1: { label: 'P1 – Optional',   color: 'bg-gray-100 text-gray-600 border-gray-200',     dot: 'bg-gray-400' },
};

/* ─────────────────────────────────────────────────────────────────────── */
/*  Helper sub-components                                                   */
/* ─────────────────────────────────────────────────────────────────────── */

function PriorityBadge({ p }: { p: number }) {
  const { label, color } = PRIORITY_LABELS[p] ?? PRIORITY_LABELS[3];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full border ${color}`}>
      {label}
    </span>
  );
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100 bg-gray-50/50">
        <Icon className="w-4 h-4 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
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
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
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
        } catch {
          setInterviewMode(data.duration_minutes === 0 ? 'flexible' : 'fixed');
        }
      } else {
        setInterviewMode(data.duration_minutes === 0 ? 'flexible' : 'fixed');
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
  const timedPercentages = getTimedModePercentages(!!(nthRound && nthRound.enabled), !!(hrRound && hrRound.enabled));
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
  const roundPercentage = React.useCallback((round: AIInterviewRoundConfig) => {
    if (mode !== 'fixed') return round.percentage;
    if (round.type === 'must_have_skills' || round.type === 'must_to_have' || round.type === 'technical') return timedPercentages.mth;
    if (round.type === 'nice_to_have_skills' || round.type === 'nice_to_have') return timedPercentages.nth;
    if (round.type === 'hr') return timedPercentages.hr;
    return round.percentage;
  }, [mode, timedPercentages]);
  const totalPercentage = enabledRounds.reduce((sum, round) => sum + roundPercentage(round), 0);

  const languages = interview?.available_languages ?? (interview?.ai_voice_language ? [interview.ai_voice_language] : ['English']);

  /* Publish handler */
  const handlePublish = async () => {
    setPublishing(true);
    try {
      await aiInterviewService.publishConfig(id);
      setPublished(true);
      toast.success('AI Interview published!');
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
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
          <p className="text-sm text-gray-500">Loading preview...</p>
        </div>
      </div>
    );
  }

  if (!interview) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Interview configuration not found.</p>
          <button
            onClick={() => router.push('/recruitment/ai-interviews')}
            className="text-sm text-gray-900 underline"
          >
            Go to AI Interviews
          </button>
        </div>
      </div>
    );
  }

  /* ───────────── Success screen ───────────── */
  if (published) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="max-w-md w-full text-center">
          {/* Animated check icon with confetti dots */}
          <div className="relative inline-flex items-center justify-center mb-6">
            {/* Confetti dots */}
            <span className="absolute w-2 h-2 rounded-full bg-green-400 animate-ping" style={{ top: -4, left: 10 }} />
            <span className="absolute w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" style={{ top: 8, right: -2, animationDelay: '0.2s' }} />
            <span className="absolute w-2 h-2 rounded-full bg-gray-400 animate-ping" style={{ bottom: 0, left: -2, animationDelay: '0.4s' }} />
            <span className="absolute w-1.5 h-1.5 rounded-full bg-yellow-400 animate-ping" style={{ bottom: 8, right: 6, animationDelay: '0.6s' }} />
            <span className="absolute w-1 h-1 rounded-full bg-pink-400 animate-ping" style={{ top: 2, right: 14, animationDelay: '0.3s' }} />

            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center animate-bounce">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">AI Interview Published!</h1>
          <p className="text-gray-500 mb-8">
            Your interview configuration is now live and ready for candidates.
          </p>

          {/* Summary card */}
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 mb-8 text-left">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Position</span>
                <span className="text-sm font-medium text-gray-900">{position}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Mode</span>
                <span className="text-sm font-medium text-gray-900">
                  {mode === 'fixed' ? `Fixed ${duration}min` : 'Flexible'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Duration</span>
                <span className="text-sm font-medium text-gray-900">{duration} minutes</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Status</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  Published
                </span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => router.push('/recruitment/ai-interviews')}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700"
            >
              Go to AI Interviews
            </button>
            <button
              onClick={() => router.push('/recruitment/ai-interviews/' + id)}
              className="flex-1 px-4 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
            >
              Invite Candidates
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ───────────── Preview mode ───────────── */
  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto"><div className="w-full pb-28">
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
                  <div className="w-7 h-7 rounded-full flex items-center justify-center bg-green-100">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  </div>
                  <span className="text-sm text-gray-400">{label}</span>
                </>
              ) : isCurrent ? (
                <>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center bg-gray-900 text-white text-sm font-medium">{stepNum}</div>
                  <span className="text-sm text-gray-900 font-medium">{label}</span>
                </>
              ) : (
                <>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center bg-gray-100 text-gray-400 text-sm">{stepNum}</div>
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
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          title="Back to Clusters"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Review &amp; Publish</h1>
      </div>

      <div className="space-y-5">
        {/* ── JD Info Card ── */}
        <div className="rounded-xl overflow-hidden border border-gray-200">
          <div className="bg-gray-800 px-5 py-4">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-white/80" />
              <span className="text-xs font-medium text-white/80 uppercase tracking-wide">Job Description</span>
            </div>
            <h2 className="text-lg font-bold text-white">{position}</h2>
          </div>
          <div className="bg-white px-5 py-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Position</p>
                <p className="text-sm font-medium text-gray-900">{position}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">JD Title</p>
                <p className="text-sm font-medium text-gray-900">{interview.jd_title ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Experience Level</p>
                <p className="text-sm font-medium text-gray-900">{experienceLevel}</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Interview Mode Card ── */}
        <SectionCard title="Interview Mode" icon={Zap}>
          <div className="flex items-center gap-3">
            {mode === 'fixed' ? (
              <>
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                  <Timer className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Fixed — {duration} min</p>
                  <p className="text-xs text-gray-500">Structured interview with timed rounds</p>
                </div>
              </>
            ) : (
              <>
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Flexible</p>
                  <p className="text-xs text-gray-500">Adaptive interview with dynamic pacing</p>
                </div>
              </>
            )}
          </div>
        </SectionCard>

        {/* ── Scoring Distribution Card ── */}
        <SectionCard title="Scoring Distribution" icon={BarChart3}>
          <div className="space-y-4">
            {mthRound && mthRound.enabled && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-gray-700 font-medium">Must-To-Have</span>
                  <span className="text-sm font-semibold text-gray-900">{roundPercentage(mthRound)}%</span>
                </div>
                <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gray-700 rounded-full transition-all"
                    style={{ width: `${totalPercentage > 0 ? (roundPercentage(mthRound) / totalPercentage) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            {nthRound && nthRound.enabled && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-gray-700 font-medium">Nice-To-Have</span>
                  <span className="text-sm font-semibold text-gray-900">{roundPercentage(nthRound)}%</span>
                </div>
                <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all"
                    style={{ width: `${totalPercentage > 0 ? (roundPercentage(nthRound) / totalPercentage) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            {hrRound && hrRound.enabled && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-gray-700 font-medium">HR Round</span>
                  <span className="text-sm font-semibold text-gray-900">{roundPercentage(hrRound)}%</span>
                </div>
                <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${totalPercentage > 0 ? (roundPercentage(hrRound) / totalPercentage) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            {enabledRounds.length === 0 && (
              <p className="text-sm text-gray-400 italic">No rounds configured</p>
            )}
          </div>
        </SectionCard>

        {/* ── Time Allocation Table (fixed mode only) ── */}
        {mode === 'fixed' && enabledRounds.length > 0 && (
          <SectionCard title="Time Allocation" icon={Clock}>
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-2.5 font-medium text-gray-600">Round</th>
                    <th className="px-4 py-2.5 font-medium text-gray-600 text-right">Weight</th>
                    <th className="px-4 py-2.5 font-medium text-gray-600 text-right">Questions</th>
                    <th className="px-4 py-2.5 font-medium text-gray-600 text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {enabledRounds.map(r => {
                    const roundLabel =
                      r.type === 'must_have_skills' || r.type === 'must_to_have' || r.type === 'technical' ? 'Must-To-Have' :
                      r.type === 'nice_to_have_skills' || r.type === 'nice_to_have' ? 'Nice-To-Have' :
                      r.type === 'hr' ? 'HR Round' : r.type;
                    const previewMin = timedPreviewDurations[r.type] ?? r.duration_minutes;
                    const previewQuestions = timedPreviewQuestions[r.type] ?? r.planned_questions ?? 0;
                    return (
                      <tr key={r.type}>
                        <td className="px-4 py-2.5 text-gray-900">{roundLabel}</td>
                        <td className="px-4 py-2.5 text-gray-700 text-right">{roundPercentage(r)}%</td>
                        <td className="px-4 py-2.5 text-gray-700 text-right">{previewQuestions}</td>
                        <td className="px-4 py-2.5 text-gray-700 text-right">{previewMin} min</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold">
                    <td className="px-4 py-2.5 text-gray-900">Total</td>
                    <td className="px-4 py-2.5 text-gray-900 text-right">{totalPercentage}%</td>
                    <td className="px-4 py-2.5 text-gray-900 text-right">
                      {enabledRounds.reduce((s, r) => s + (timedPreviewQuestions[r.type] ?? r.planned_questions ?? 0), 0)}
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
                      <div key={cluster.id} className="border border-gray-200 rounded-lg p-4">
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
                              className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-xs text-gray-700"
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
                      <div key={cluster.id} className="border border-gray-200 rounded-lg p-4">
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
                              className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-xs text-gray-700"
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
          <div className="flex items-center gap-2">
            {hrRound && hrRound.enabled ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Enabled
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                Disabled
              </span>
            )}
          </div>
          {mode === 'fixed' && hrRound?.enabled && (
            <div className="mt-4 space-y-0 divide-y divide-gray-100">
              <InfoRow label="Questions" value={`${timedAllocation.hrQuestions}`} />
              <InfoRow label="Time" value={`${timedAllocation.hrMinutes} min`} />
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
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                    <Video className="w-3 h-3" /> Enabled
                  </span>
                ) : (
                  <span className="text-sm text-gray-400">Disabled</span>
                )
              }
            />
            <InfoRow
              label="Introduction Video"
              value={
                interview.introduction_video_url ? (
                  <span className="inline-flex items-center gap-1.5 text-sm text-green-700">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Uploaded
                  </span>
                ) : (
                  <span className="text-sm text-gray-400">None</span>
                )
              }
            />
            <InfoRow
              label="Languages"
              value={
                <div className="flex flex-wrap gap-1.5 justify-end">
                  {languages.map(lang => (
                    <span
                      key={lang}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100 text-xs text-gray-700"
                    >
                      <Globe className="w-3 h-3 text-gray-400" />
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
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40">
        <div className="px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={goBack}
              className="px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700 flex items-center gap-2"
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
              className="px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700"
            >
              Save as Draft
            </button>
            <button
              onClick={() => setShowConfirm(true)}
              disabled={publishing}
              className="px-6 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
  );
}
