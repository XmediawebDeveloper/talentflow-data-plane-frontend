'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Loader2, Clock, Users, Brain, Video, Globe, Timer, Layers, Settings,
  ChevronDown, ClipboardList, Mic, Play, Eye, CheckCircle, AlertCircle,
} from 'lucide-react';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import type {
  AIInterviewResponse,
  AIInterviewRoundConfig,
  AIInterviewHRQuestion,
} from '@/lib/services/aiInterviewService';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { getPriorityLabel } from '@/lib/constants/aiInterviewPriority';
import { modeFromDuration } from '@/lib/constants/aiInterviewMode';
import { SectionHeader, SummaryLocation } from './ConfigSummary';
import { QuestionDistributionPopover } from './QuestionDistributionPopover';
import { distributeSkillsLocally } from '@/lib/utils/questionDistribution';
import JobOpeningSummary from '@/components/jobs/JobOpeningSummary';
import JDFullViewModal from '@/components/jobs/JDFullViewModal';
import type { Job } from '@/lib/types/types';
import { formatIndustryType } from '@/lib/utils/jobOpeningDisplay';
import { getSttModelOption } from '@/lib/constants/aiInterviewSttModels';
import { getStatusVariant, getStatusLabel } from './AIInterviewResults';

/**
 * A read-only rendering of AIInterviewPreview.tsx's "Review & Publish" (step
 * 4) body, for peeking at a PAST version from the Version History panel's
 * eye icon rather than the live wizard. Layout and section markup are
 * deliberately kept in step with that page — same cards, same derivations —
 * so a version looks the same whether it's read here or reached by editing
 * up to step 4. Everything that implies an in-progress, editable flow (step
 * indicator, Edit-step buttons, Discard, Save as Draft, Publish, the
 * published/share screens) is left out; this never mutates anything.
 */

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
  interview_mode?: 'fixed' | 'flexible';
  buffer_enabled?: boolean;
  stt_model?: string;
  [key: string]: unknown;
}

function getTimedModeAllocation(nthEnabled: boolean, hrEnabled: boolean) {
  if (!nthEnabled && !hrEnabled) {
    return { mthMinutes: 30, nthMinutes: 0, hrMinutes: 0, mthQuestions: 15, nthQuestions: 0, hrQuestions: 0 };
  }
  if (nthEnabled && !hrEnabled) {
    return { mthMinutes: 20, nthMinutes: 10, hrMinutes: 0, mthQuestions: 10, nthQuestions: 5, hrQuestions: 0 };
  }
  if (nthEnabled && hrEnabled) {
    return { mthMinutes: 16, nthMinutes: 8, hrMinutes: 6, mthQuestions: 8, nthQuestions: 4, hrQuestions: 3 };
  }
  return { mthMinutes: 20, nthMinutes: 0, hrMinutes: 10, mthQuestions: 10, nthQuestions: 0, hrQuestions: 5 };
}

function PriorityBadge({ p }: { p: number }) {
  const { label, color } = getPriorityLabel(p);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-2xs font-medium rounded-full border ${color}`}>
      {label}
    </span>
  );
}

function SectionCard({
  title,
  icon: Icon,
  badge,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden">
      <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5 border-b border-gray-100 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-800/40">
        <div className="w-10 h-10 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-brand-blue" />
        </div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-100 tracking-tight">{title}</h3>
        {badge}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          title={open ? `Hide ${title}` : `Show ${title}`}
          className="ml-auto flex items-center justify-center w-7 h-7 rounded-lg text-gray-400 hover:text-brand-blue hover:bg-brand-blue/5 transition-colors flex-shrink-0"
        >
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {open && <div className="p-4 sm:p-5">{children}</div>}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2">
      <span className="text-sm text-gray-500 dark:text-slate-400">{label}</span>
      <span className="text-sm font-medium text-gray-900 dark:text-slate-100 text-right">{value}</span>
    </div>
  );
}

function HRQuestionStageBadge({ stage }: { stage?: string }) {
  const normalized = stage === 'opening' ? 'opening' : 'closing';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold uppercase tracking-wide ${
      normalized === 'opening'
        ? 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20'
        : 'bg-advice-positive-bg text-advice-positive ring-1 ring-advice-positive/25'
    }`}>
      {normalized}
    </span>
  );
}

export interface AIInterviewReviewPreviewModalProps {
  /** null/undefined closes the dialog — matches this module's other
   *  controlled-visibility modals (ArchiveAIInterviewModal etc.). */
  configId: string | null | undefined;
  /**
   * The version ordinal the caller already derived (an AI interview config
   * carries no stored version number of its own — see
   * `interviewVersionRows`/`toInterviewVersionRow` in AIInterview.tsx).
   * Display-only; omitted if the caller doesn't have it handy.
   */
  versionNumber?: number;
  onClose: () => void;
}

export default function AIInterviewReviewPreviewModal({
  configId,
  versionNumber,
  onClose,
}: AIInterviewReviewPreviewModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interview, setInterview] = useState<AIInterviewResponse | null>(null);
  const [rounds, setRounds] = useState<AIInterviewRoundConfig[]>([]);
  const [mthClusters, setMthClusters] = useState<Cluster[]>([]);
  const [nthClusters, setNthClusters] = useState<Cluster[]>([]);
  const [interviewMode, setInterviewMode] = useState<'fixed' | 'flexible'>('fixed');
  const [bufferEnabled, setBufferEnabled] = useState(false);
  const [sttModel, setSttModel] = useState<string | undefined>(undefined);
  const [showVideoPreview, setShowVideoPreview] = useState(false);
  const [jdViewOpen, setJdViewOpen] = useState(false);

  const isOpen = !!configId;

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await aiInterviewService.get(id);
      setInterview(data);
      setRounds(data.rounds_config || []);

      if (data.special_instructions) {
        try {
          const parsed: ParsedInstructions = JSON.parse(data.special_instructions);
          setMthClusters(parsed.mth_clusters ?? []);
          setNthClusters(parsed.nth_clusters ?? []);
          setInterviewMode(parsed.interview_mode === 'flexible' ? 'flexible' : 'fixed');
          setBufferEnabled(!!parsed.buffer_enabled);
          if (typeof parsed.stt_model === 'string') setSttModel(parsed.stt_model);
        } catch {
          setInterviewMode(modeFromDuration(data.duration_minutes));
        }
      } else {
        setInterviewMode(modeFromDuration(data.duration_minutes));
      }
    } catch {
      setError('Failed to load this interview configuration.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!configId) return;
    // Reset so a stale version's content never flashes under a new id.
    setInterview(null);
    setError(null);
    load(configId);
  }, [configId, load]);

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  const mode = interviewMode;
  const duration = interview?.duration_minutes ?? 30;
  const position = interview?.position ?? interview?.jd_title ?? 'Untitled Position';

  const mthRound = rounds.find((r) => r.type === 'must_have_skills' || r.type === 'must_to_have' || r.type === 'technical');
  const nthRound = rounds.find((r) => r.type === 'nice_to_have_skills' || r.type === 'nice_to_have');
  const hrRound = rounds.find((r) => r.type === 'hr');
  const enabledRounds = rounds.filter((r) => r.enabled);
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
  const sttOption = getSttModelOption(sttModel);
  const jdAsJob: Job = {
    id: interview?.jd_id ?? configId ?? '',
    job_id: interview?.jd_short_id,
    title: interview?.jd_title ?? position,
    status: 'Published',
    location: interview?.jd_locations?.length
      ? interview.jd_locations.map((l: { city?: string | null }) => l?.city).filter(Boolean).join(', ')
      : (interview?.jd_location ?? ''),
    locations: (interview?.jd_locations ?? []) as Job['locations'],
    daysActive: 0,
    requiredMatch: 0,
    industry_type: interview?.jd_industry_type,
    experience: interview?.jd_experience_level
      ? interview.jd_experience_level.charAt(0).toUpperCase() + interview.jd_experience_level.slice(1)
      : undefined,
    versionNumber: interview?.jd_version ?? undefined,
  };
  const interviewTypeLabel = hrRound?.enabled ? 'Technical + HR' : 'Technical';
  const totalPreviewQuestions = enabledRounds.reduce(
    (sum, r) => sum + (timedPreviewQuestions[r.type] ?? r.planned_questions ?? 0), 0,
  );
  const totalPreviewMinutes = enabledRounds.reduce(
    (sum, r) => sum + (timedPreviewDurations[r.type] ?? r.duration_minutes), 0,
  );

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-[95vw] sm:max-w-5xl max-h-[90dvh] p-0 flex flex-col overflow-hidden">
          <DialogHeader className="px-5 sm:px-6 py-4 border-b border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 flex-shrink-0">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-5 h-5 text-brand-blue" />
              </div>
              <div className="min-w-0 flex-1 pr-6">
                <div className="flex items-center gap-2 flex-wrap">
                  <DialogTitle className="text-base sm:text-lg truncate">Review &amp; Publish</DialogTitle>
                  {interview && <Badge variant={getStatusVariant(interview.status)}>{getStatusLabel(interview.status)}</Badge>}
                  {versionNumber != null && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20">
                      V{versionNumber}
                    </span>
                  )}
                </div>
                <DialogDescription className="truncate">
                  {interview ? `${position} — a` : 'A'} read-only preview of this interview version&rsquo;s configuration.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50 dark:bg-slate-950 px-4 sm:px-6 py-4 sm:py-5">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 text-brand-blue animate-spin" />
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <AlertCircle className="w-8 h-8 text-destructive mb-2" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            ) : !interview ? null : (
              <div className="flex flex-col lg:flex-row gap-5 lg:items-start">
                <div className="flex-1 min-w-0 space-y-4">
                  {/* JD card — same row the wizard's own review draws. */}
                  <div className="rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 px-4 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <JobOpeningSummary job={jdAsJob} mergeInfoRows />
                      </div>
                      {interview.jd_id && (
                        <button
                          type="button"
                          onClick={() => setJdViewOpen(true)}
                          className="inline-flex items-center justify-center gap-1.5 text-sm text-brand-blue border border-brand-blue/40 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg hover:bg-brand-blue/10 hover:border-brand-blue transition-colors whitespace-nowrap flex-shrink-0"
                          title="Read this job description"
                        >
                          <Eye className="w-4 h-4" />
                          <span className="hidden sm:inline">View JD</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <SectionCard title="Interview Overview" icon={Brain}>
                    <div className="flex flex-col lg:flex-row gap-4 items-start">
                      <div className="flex flex-col gap-3 lg:w-64 lg:flex-shrink-0">
                        <div className="rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] p-3 flex items-start gap-3">
                          <div className="w-9 h-9 rounded-lg bg-brand-cyan/10 ring-1 ring-brand-cyan/20 flex items-center justify-center flex-shrink-0">
                            <Timer className="w-4 h-4 text-brand-cyan" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-2xs text-gray-500 dark:text-slate-500">Interview Mode</p>
                            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                              {mode === 'fixed' ? 'Timed Interview' : 'Conversational'}
                            </p>
                            <p className="text-2xs text-gray-500 dark:text-slate-500">
                              {mode === 'fixed'
                                ? `${duration} minutes`
                                : `${bufferEnabled ? 35 : 30} minutes${bufferEnabled ? ' · +5 min buffer' : ''}`}
                            </p>
                          </div>
                        </div>

                        <div className="rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] p-3 flex items-start gap-3">
                          <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                            <Mic className="w-4 h-4 text-brand-blue" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-2xs text-gray-500 dark:text-slate-500">AI Model</p>
                            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">{sttOption.label}</p>
                          </div>
                        </div>

                        <div className="rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] p-3 flex items-start gap-3">
                          <div className="w-9 h-9 rounded-lg bg-brand-orange/10 ring-1 ring-brand-orange/15 flex items-center justify-center flex-shrink-0">
                            <Layers className="w-4 h-4 text-brand-orange-deep" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-2xs text-gray-500 dark:text-slate-500">Interview Type</p>
                            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{interviewTypeLabel}</p>
                            <p className="text-2xs text-gray-500 dark:text-slate-500">
                              {enabledRounds.length} round{enabledRounds.length === 1 ? '' : 's'}
                            </p>
                          </div>
                        </div>
                      </div>

                      {mode === 'fixed' && enabledRounds.length > 0 && (
                        <div className="flex-1 min-w-0 w-full">
                          <div className="flex items-center gap-2 mb-3">
                            <Clock className="w-4 h-4 text-brand-blue" />
                            <h4 className="text-sm font-semibold text-gray-800 dark:text-slate-100 tracking-tight">Time Allocation</h4>
                          </div>
                          <div className="overflow-hidden rounded-lg border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02]">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-slate-50 dark:bg-slate-800 text-left">
                                  <th className="px-4 py-2.5 font-medium text-gray-600 dark:text-slate-400">Round</th>
                                  <th className="px-4 py-2.5 font-medium text-gray-600 dark:text-slate-400 text-right">Questions</th>
                                  <th className="px-4 py-2.5 font-medium text-gray-600 dark:text-slate-400 text-right">Clusters</th>
                                  <th className="px-4 py-2.5 font-medium text-gray-600 dark:text-slate-400 text-right">Time</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                                {enabledRounds.map((r) => {
                                  const isMth = r.type === 'must_have_skills' || r.type === 'must_to_have' || r.type === 'technical';
                                  const isNth = r.type === 'nice_to_have_skills' || r.type === 'nice_to_have';
                                  const roundLabel = isMth ? 'Must-To-Have' : isNth ? 'Nice-To-Have' : r.type === 'hr' ? 'HR Round' : r.type;
                                  const previewMin = timedPreviewDurations[r.type] ?? r.duration_minutes;
                                  const previewQuestions = timedPreviewQuestions[r.type] ?? r.planned_questions ?? 0;
                                  const clusterCount = isMth ? mthClusters.length : isNth ? nthClusters.length : null;
                                  return (
                                    <tr key={r.type}>
                                      <td className="px-4 py-2.5 text-gray-900 dark:text-slate-100">{roundLabel}</td>
                                      <td className="px-4 py-2.5 text-gray-700 dark:text-slate-300 text-right">
                                        <span className="inline-flex items-center justify-center min-w-[24px] px-2 py-0.5 rounded-md text-xs font-semibold bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">{previewQuestions}</span>
                                      </td>
                                      <td className="px-4 py-2.5 text-gray-700 dark:text-slate-300 text-right">{clusterCount !== null ? clusterCount : '—'}</td>
                                      <td className="px-4 py-2.5 text-gray-700 dark:text-slate-300 text-right">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20">{previewMin} min</span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot>
                                <tr className="bg-slate-50 dark:bg-slate-800 font-semibold">
                                  <td className="px-4 py-2.5 text-gray-900 dark:text-slate-100">Total</td>
                                  <td className="px-4 py-2.5 text-gray-900 dark:text-slate-100 text-right">{totalPreviewQuestions}</td>
                                  <td className="px-4 py-2.5 text-gray-900 dark:text-slate-100 text-right">{mthClusters.length + nthClusters.length}</td>
                                  <td className="px-4 py-2.5 text-gray-900 dark:text-slate-100 text-right">{totalPreviewMinutes} min</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  </SectionCard>

                  {(mthClusters.length > 0 || nthClusters.length > 0) && (
                    <SectionCard
                      title="Skill Clusters"
                      icon={Layers}
                      badge={
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-medium bg-slate-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 ring-1 ring-gray-200/70 dark:ring-slate-700">
                          {mthClusters.length + nthClusters.length} cluster{mthClusters.length + nthClusters.length === 1 ? '' : 's'}
                        </span>
                      }
                    >
                      <div className="space-y-6">
                        {mthClusters.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wide mb-3">Must-To-Have Clusters</h4>
                            <div className="space-y-3">
                              {mthClusters.map((cluster) => (
                                <div key={cluster.id} className="border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] rounded-lg p-4 bg-white dark:bg-slate-900">
                                  <div className="flex items-center gap-2 mb-2">
                                    <PriorityBadge p={cluster.priority} />
                                    <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">{cluster.name}</span>
                                    <span className="text-xs text-gray-400 dark:text-slate-500 ml-auto">
                                      {cluster.skills.length} skill{cluster.skills.length !== 1 ? 's' : ''}
                                    </span>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {cluster.skills.map((skill) => (
                                      <span key={skill} className="inline-flex items-center px-2 py-0.5 rounded-md bg-brand-blue/5 text-xs text-brand-blue ring-1 ring-brand-blue/20">
                                        {skill}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {nthClusters.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wide mb-3">Nice-To-Have Clusters</h4>
                            <div className="space-y-3">
                              {nthClusters.map((cluster) => (
                                <div key={cluster.id} className="border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] rounded-lg p-4 bg-white dark:bg-slate-900">
                                  <div className="flex items-center gap-2 mb-2">
                                    <PriorityBadge p={cluster.priority} />
                                    <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">{cluster.name}</span>
                                    <span className="text-xs text-gray-400 dark:text-slate-500 ml-auto">
                                      {cluster.skills.length} skill{cluster.skills.length !== 1 ? 's' : ''}
                                    </span>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {cluster.skills.map((skill) => (
                                      <span key={skill} className="inline-flex items-center px-2 py-0.5 rounded-md bg-brand-cyan/10 text-xs text-brand-cyan ring-1 ring-brand-cyan/20">
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

                  {hrRound?.enabled && (
                    <SectionCard
                      title="HR Round"
                      icon={Users}
                      badge={
                        hrRound.hr_questions?.length ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-medium bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">
                            {hrRound.hr_questions.length} question{hrRound.hr_questions.length === 1 ? '' : 's'}
                          </span>
                        ) : undefined
                      }
                    >
                      {mode === 'fixed' && (
                        <div className="mt-1 space-y-0 divide-y divide-gray-100 dark:divide-slate-700/60">
                          <InfoRow label="Questions" value={`${timedAllocation.hrQuestions}`} />
                          <InfoRow label="Time" value={`${timedAllocation.hrMinutes} min`} />
                        </div>
                      )}
                      {hrRound.hr_questions?.length > 0 && (
                        <div className="mt-4">
                          <p className="text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wide mb-2">Selected HR Questions</p>
                          <ol className="space-y-2">
                            {(hrRound.hr_questions as AIInterviewHRQuestion[]).map((q, idx) => (
                              <li key={q.id} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-gray-100 dark:border-slate-700/60">
                                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 text-2xs font-bold flex items-center justify-center mt-0.5">{idx + 1}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-gray-800 dark:text-slate-200">{q.question_text}</p>
                                  <div className="mt-1 flex flex-wrap items-center gap-2">
                                    <span className="text-2xs text-gray-400 dark:text-slate-500">{q.answer_type === 'yes_no' ? 'Yes / No' : 'Text answer'}</span>
                                    <HRQuestionStageBadge stage={q.stage} />
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}
                    </SectionCard>
                  )}

                  <SectionCard title="Settings" icon={Settings}>
                    <div className="rounded-lg border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] divide-y divide-gray-100 dark:divide-slate-700/60 overflow-hidden">
                      <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                        <span className="text-sm text-gray-600 dark:text-slate-400">Recording</span>
                        {interview.recording_enabled ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-advice-positive-bg text-advice-positive ring-1 ring-advice-positive/25">
                            <Video className="w-3 h-3" /> Enabled
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400 dark:text-slate-500">Disabled</span>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                        <span className="text-sm text-gray-600 dark:text-slate-400">Introduction Video</span>
                        {interview.introduction_video_url ? (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">
                              <Video className="w-3 h-3" /> Uploaded
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowVideoPreview(true)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-brand-blue border border-brand-blue/30 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue transition-colors"
                            >
                              <Play className="w-3.5 h-3.5" />
                              Preview
                            </button>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400 dark:text-slate-500">None</span>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                        <span className="text-sm text-gray-600 dark:text-slate-400">Languages</span>
                        <div className="flex flex-wrap items-center gap-1.5 justify-end">
                          {languages.map((lang) => (
                            <span key={lang} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-blue/5 text-xs text-brand-blue ring-1 ring-brand-blue/20">
                              <Globe className="w-3 h-3 text-brand-blue" />
                              {lang}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </SectionCard>
                </div>

                {/* Configuration Summary sidebar — same sticky card the wizard
                    shows, sized to the dialog rather than the full page. */}
                <div className="w-full lg:w-72 flex-shrink-0">
                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4">
                    <div className="mb-4 flex items-center justify-between gap-2">
                      <SectionHeader icon={ClipboardList} title="Configuration Summary" subtitle="What this interview looked like when reviewed." />
                      {(mthClusters.length > 0 || nthClusters.length > 0) && interview && (
                        <QuestionDistributionPopover
                          specialInstructions={interview.special_instructions}
                          clusters={[...mthClusters, ...nthClusters]}
                          hrQuestions={hrRound?.enabled ? ((hrRound.hr_questions as AIInterviewHRQuestion[] | undefined) ?? []) : []}
                          fallback={() => ({
                            mth: distributeSkillsLocally(mthClusters, timedAllocation.mthQuestions ?? 0),
                            nth: nthRound?.enabled ? distributeSkillsLocally(nthClusters, timedAllocation.nthQuestions ?? 0) : [],
                          })}
                        />
                      )}
                    </div>

                    <div className="border border-gray-100 dark:border-slate-700/60 rounded-lg overflow-hidden mb-4 ring-1 ring-black/[0.02]">
                      <div className="px-3 py-2 bg-gray-50 dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700/60">
                        <span className="text-xs font-medium text-brand-blue">Job Details</span>
                      </div>
                      <div className="divide-y divide-gray-50 dark:divide-slate-800">
                        <div className="px-3 py-2 flex items-start justify-between gap-2">
                          <span className="text-xs text-gray-500 dark:text-slate-500 flex-shrink-0">Role Title</span>
                          <span className="text-xs font-semibold text-gray-900 dark:text-slate-100 text-right">{position}</span>
                        </div>
                        {interview.jd_short_id && (
                          <div className="px-3 py-2 flex items-start justify-between gap-2">
                            <span className="text-xs text-gray-500 dark:text-slate-500 flex-shrink-0">JD ID</span>
                            <span className="text-xs font-semibold text-gray-900 dark:text-slate-100 text-right">{interview.jd_short_id}</span>
                          </div>
                        )}
                        {interview.jd_experience_level && (
                          <div className="px-3 py-2 flex items-start justify-between gap-2">
                            <span className="text-xs text-gray-500 dark:text-slate-500 flex-shrink-0">Level</span>
                            <span className="text-xs font-semibold text-gray-900 dark:text-slate-100 text-right">{interview.jd_experience_level}</span>
                          </div>
                        )}
                        {interview.jd_industry_type && (
                          <div className="px-3 py-2 flex items-start justify-between gap-2">
                            <span className="text-xs text-gray-500 dark:text-slate-500 flex-shrink-0">Industry</span>
                            <span className="text-xs font-semibold text-gray-900 dark:text-slate-100 text-right">{formatIndustryType(interview.jd_industry_type)}</span>
                          </div>
                        )}
                        {(interview.jd_location || (interview.jd_locations?.length ?? 0) > 0) && (
                          <div className="px-3 py-2 flex items-center justify-between gap-2">
                            <span className="text-xs text-gray-500 dark:text-slate-500 flex-shrink-0">Location</span>
                            <SummaryLocation value={interview.jd_location} locations={interview.jd_locations} />
                          </div>
                        )}
                        {interview.jd_version != null && (
                          <div className="px-3 py-2 flex items-start justify-between gap-2">
                            <span className="text-xs text-gray-500 dark:text-slate-500 flex-shrink-0">JD Version</span>
                            <span className="text-xs font-semibold text-gray-900 dark:text-slate-100 text-right">v{interview.jd_version}</span>
                          </div>
                        )}
                        <div className="px-3 py-2 flex items-center justify-between gap-2">
                          <span className="text-xs text-gray-500 dark:text-slate-500 flex-shrink-0">Interview Mode</span>
                          <span className="text-xs font-semibold text-gray-900 dark:text-slate-100 text-right">
                            {mode === 'fixed' ? 'Timed' : 'Conversational'}
                          </span>
                        </div>
                        <div className="px-3 py-2 flex items-center justify-between gap-2">
                          <span className="text-xs text-gray-500 dark:text-slate-500 flex-shrink-0">Total Duration</span>
                          <span className="text-xs font-semibold text-gray-900 dark:text-slate-100 text-right">
                            {mode === 'fixed' ? duration : bufferEnabled ? 35 : 30} min
                          </span>
                        </div>
                        {interview.created_by_name && (
                          <div className="px-3 py-2 flex items-start justify-between gap-2">
                            <span className="text-xs text-gray-500 dark:text-slate-500 flex-shrink-0">Created By</span>
                            <span className="text-xs font-semibold text-gray-900 dark:text-slate-100 text-right">{interview.created_by_name}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {mode === 'fixed' && enabledRounds.length > 0 && (
                      <div className="border border-gray-100 dark:border-slate-700/60 rounded-lg overflow-hidden mb-4 ring-1 ring-black/[0.02]">
                        <div className="px-3 py-2 bg-gray-50 dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700/60 flex items-center justify-between">
                          <span className="text-xs font-medium text-brand-blue">Question Budget (Total: {totalPreviewQuestions})</span>
                          <span className="text-xs text-gray-400 dark:text-slate-500">{totalPreviewMinutes} min</span>
                        </div>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-gray-100 dark:border-slate-700/60">
                              <th className="px-3 py-1.5 text-left font-medium text-gray-400 dark:text-slate-500">Round</th>
                              <th className="px-3 py-1.5 text-right font-medium text-gray-400 dark:text-slate-500">Q</th>
                              <th className="px-3 py-1.5 text-right font-medium text-gray-400 dark:text-slate-500">Clusters</th>
                              <th className="px-3 py-1.5 text-right font-medium text-gray-400 dark:text-slate-500">Time</th>
                            </tr>
                          </thead>
                          <tbody>
                            {enabledRounds.map((r) => {
                              const isMth = r.type === 'must_have_skills' || r.type === 'must_to_have' || r.type === 'technical';
                              const isNth = r.type === 'nice_to_have_skills' || r.type === 'nice_to_have';
                              const label = isMth ? 'Must-to-Have' : isNth ? 'Nice-to-Have' : r.type === 'hr' ? 'HR Round' : r.type;
                              const clusterCount = isMth ? mthClusters.length : isNth ? nthClusters.length : null;
                              return (
                                <tr key={r.type} className="border-b border-gray-50 dark:border-slate-800 last:border-0">
                                  <td className="px-3 py-2 text-gray-600 dark:text-slate-400">{label}</td>
                                  <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-slate-100">{timedPreviewQuestions[r.type] ?? r.planned_questions ?? 0}</td>
                                  <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-slate-100">{clusterCount !== null ? clusterCount : '—'}</td>
                                  <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-slate-100">{timedPreviewDurations[r.type] ?? r.duration_minutes}m</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {(mthClusters.length > 0 || nthClusters.length > 0) && (
                      <div className="border border-gray-100 dark:border-slate-700/60 rounded-lg overflow-hidden ring-1 ring-black/[0.02]">
                        <div className="px-3 py-2 bg-gray-50 dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700/60">
                          <span className="text-xs font-medium text-brand-blue">Clusters</span>
                        </div>
                        <div className="p-3 space-y-3">
                          {[
                            { label: 'Must-to-Have', count: mthClusters.length, show: mthClusters.length > 0 },
                            { label: 'Nice-to-Have', count: nthClusters.length, show: nthClusters.length > 0 },
                          ].filter((row) => row.show).map((row) => (
                            <div key={row.label} className="flex items-center justify-between">
                              <span className="text-xs text-gray-600 dark:text-slate-400">{row.label}</span>
                              <span className="text-xs font-semibold text-advice-positive">{row.count} cluster{row.count === 1 ? '' : 's'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {jdViewOpen && interview?.jd_id && (
        <JDFullViewModal
          jdId={interview.jd_id}
          jdTitle={interview.jd_title ?? position}
          onClose={() => setJdViewOpen(false)}
        />
      )}

      <Dialog open={showVideoPreview} onOpenChange={setShowVideoPreview}>
        <DialogContent className="sm:max-w-2xl p-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-2 bg-gray-50 dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700/60">
            <DialogTitle className="text-sm font-semibold tracking-tight">Introduction Video</DialogTitle>
            <DialogDescription className="text-xs text-gray-500 dark:text-slate-500">
              What the candidate sees before the interview starts.
            </DialogDescription>
          </DialogHeader>
          <div className="px-4 pb-4 pt-3">
            <div className="rounded-lg overflow-hidden bg-black aspect-video">
              {showVideoPreview && interview?.introduction_video_url && (
                <video src={interview.introduction_video_url} controls autoPlay className="w-full h-full object-contain">
                  Your browser does not support the video tag.
                </video>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
