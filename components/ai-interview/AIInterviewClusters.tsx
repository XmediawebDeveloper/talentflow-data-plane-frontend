'use client';

import { handoffContinueLabel, resolveInviteHandoffOrigin, useHandoffCandidateCrumb } from '@/lib/utils/resumeScoringInviteHandoff';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useEmbeddedWizard, useWizardRouter, useWizardSearchParams } from './embeddedWizardNav';
import {
  ArrowLeft, CheckCircle2, Loader2, Shield, Star, Plus, X,
  Sparkles, GripVertical, ChevronDown, ChevronUp, Layers, Clock,
  Trash2, AlertTriangle, CheckCheck, Info, Lock, ClipboardList, Search, Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { aiInterviewService, isJdDisabled, JD_DISABLED_ACTION_MESSAGE } from '@/lib/services/aiInterviewService';
import { Button } from '@/components/ui/button';
import type {
  AIInterviewResponse,
  AIInterviewRoundConfig,
  ClusterCapacityReport,
  SkillDuplicateFinding,
} from '@/lib/services/aiInterviewService';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import {
  PRIORITY_LABELS as SHARED_PRIORITY_LABELS,
  normalizePriority as sharedNormalizePriority,
} from '@/lib/constants/aiInterviewPriority';
import type { ClusterPriority } from '@/lib/constants/aiInterviewPriority';
import { AIInterviewStepIndicator, useBreadcrumbOffset } from './AIInterviewStepIndicator';
import { SectionHeader, SummaryLocation } from './ConfigSummary';
import WizardDiscardButton from './WizardDiscardButton';
import { isUnsavedVersion, clearUnsavedVersion } from '@/lib/utils/aiInterviewDraftResume';
import ClusterGeneratingState, { CLUSTER_GENERATING_ID } from './ClusterGeneratingState';
import { QuestionDistributionPopover } from './QuestionDistributionPopover';
import { closestDuplicate } from '@/lib/skillDuplicates';

/* ─────────────────────────────────────────────────────────────────────── */
/*  Types                                                                  */
/* ─────────────────────────────────────────────────────────────────────── */

type SkillType = 'Skill' | 'Command';

interface Cluster {
  id: string;
  name: string;
  priority: 1 | 2 | 3;
  skills: string[];
  reason?: string;
}

/** Re-export the shared normaliser under the local name so existing call sites
 *  (and any third-party imports) keep working. See lib/constants/aiInterviewPriority. */
const normalizePriority = sharedNormalizePriority;

interface SkillEntry {
  name: string;
  comment: string;
  type: SkillType;
}

interface CategoryConfig {
  skills: SkillEntry[];
  clusters: Cluster[];
  percentage: number;
  enabled: boolean;
}

/* DnD item types */
const DND_TYPES = { CLUSTER: 'CLUSTER', CLUSTER_SKILL: 'CLUSTER_SKILL' } as const;

interface ClusterDragItem {
  category: 'mth' | 'nth';
  index: number;
  clusterId: string;
}

interface SkillDragItem {
  skillName: string;
  fromClusterId: string;
  fromCategory: 'mth' | 'nth';
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  Constants                                                               */
/* ─────────────────────────────────────────────────────────────────────── */

const DEFAULT_PCT = { mth: 70, nth: 20, hr: 10 } as const;

function getTimedModeAllocation(nthEnabled: boolean, hrEnabled: boolean) {
  if (!nthEnabled && !hrEnabled) {
    return { mthMinutes: 30, nthMinutes: 0, hrMinutes: 0, mthMaxClusters: 3, nthMaxClusters: 0, mthQuestions: 15, nthQuestions: 0, hrQuestions: 0 };
  }
  if (nthEnabled && !hrEnabled) {
    return { mthMinutes: 20, nthMinutes: 10, hrMinutes: 0, mthMaxClusters: 3, nthMaxClusters: 2, mthQuestions: 10, nthQuestions: 5, hrQuestions: 0 };
  }
  if (nthEnabled && hrEnabled) {
    return { mthMinutes: 16, nthMinutes: 8, hrMinutes: 6, mthMaxClusters: 3, nthMaxClusters: 2, mthQuestions: 8, nthQuestions: 4, hrQuestions: 3 };
  }
  return { mthMinutes: 20, nthMinutes: 0, hrMinutes: 10, mthMaxClusters: 3, nthMaxClusters: 0, mthQuestions: 10, nthQuestions: 0, hrQuestions: 5 };
}

/**
 * Tell the recruiter what refinement judged and did (AIU99 AC 2 / AC 8).
 *
 * The backend has always returned this verdict and the frontend has always
 * discarded it, so a config whose 52 Must-Have skills were reduced to 28 looked
 * identical to one that needed no reduction. Three things are worth a message,
 * in descending order of how much they should worry the recruiter:
 *
 *   1. coverage_at_risk — skills dropped that we could NOT verify are still
 *      covered. This is the one that can cost an interview a competency.
 *   2. coverage_locked  — the bucket is over capacity and cannot be reduced
 *      without losing a competency outright. Needs a human decision: more
 *      questions, or fewer skills.
 *   3. a plain reduction — informational, but never silent again.
 */
function reportCapacityToRecruiter(cap: ClusterCapacityReport): void {
  const buckets: { key: 'mth' | 'nth'; label: string }[] = [
    { key: 'mth', label: 'Must-To-Have' },
    { key: 'nth', label: 'Nice-To-Have' },
  ];
  for (const { key, label } of buckets) {
    const after = cap[key];
    const before = cap.before?.[key];
    if (!after || !after.questions) continue;

    const atRisk = cap.coverage_at_risk?.[key] ?? [];
    const restored = cap.coverage_restored?.[key] ?? [];
    const typed = cap.recruiter_input?.[key];

    if (atRisk.length > 0) {
      const shown = atRisk.slice(0, 3).join(', ');
      toast.warning(
        `${label}: ${atRisk.length} skill(s) were removed without a clear replacement` +
          ` — ${shown}${atRisk.length > 3 ? `, +${atRisk.length - 3} more` : ''}.` +
          ` Review the clusters, or allow more questions to keep them.`,
        { duration: 12000 },
      );
    }
    // AIU99 AC 2/AC 5 — the recruiter typed fewer skills than their question
    // budget needs, so expansion filled the gap. There was no branch here for a
    // "below" verdict at all, so it was computed and discarded; and the verdict
    // that reached us described the already-expanded list, not the one they
    // typed. Read the pre-expansion verdict instead, which knows both numbers.
    // Takes precedence over the "left unchanged" line below: for this bucket the
    // interesting fact is that skills were ADDED, not that refinement was a no-op.
    if (typed?.status === 'below') {
      const added = typed.skills_added ?? 0;
      toast.info(
        `${label}: you configured ${typed.unique_skills} skill(s) for ${typed.questions} questions` +
          (added > 0
            ? ` — ${added} JD-based skill(s) were added so every question has its own skill.`
            : ' — too few for one skill per question. Add more skills or reduce the questions.'),
        { duration: 10000 },
      );
      continue;
    }
    if (after.status === 'exceeds' && after.coverage_locked) {
      toast.warning(
        `${label}: ${after.unique_skills} skills for ${after.questions} questions` +
          ` (recommended max ${after.ceiling}). Further reduction would drop a skill` +
          ` with no equivalent, so nothing more was removed. Add questions or trim skills.`,
        { duration: 12000 },
      );
    } else if (before && before.unique_skills > after.unique_skills) {
      toast.info(
        `${label}: ${before.unique_skills} skills refined to ${after.unique_skills}` +
          ` for ${after.questions} questions` +
          (restored.length ? ` (${restored.length} kept to protect coverage)` : ''),
        { duration: 8000 },
      );
    } else if (before?.status === 'within' && cap.refinement_applied?.[key] === false) {
      // AC 3 — say so explicitly, so "nothing changed" reads as a decision
      // rather than a failure.
      toast.info(`${label}: skills already fit ${after.questions} questions — left unchanged`);
    }
  }
}

// Priority labels come from lib/constants/aiInterviewPriority (P1-P3 scale).
const PRIORITY_LABELS = SHARED_PRIORITY_LABELS;

const CURRENT_STEP = 3;

/* ─────────────────────────────────────────────────────────────────────── */
/*  Helpers                                                                 */
/* ─────────────────────────────────────────────────────────────────────── */

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function allocateClusterMinutes(clusters: Cluster[], totalMinutes: number): Record<string, number> {
  if (clusters.length === 0 || totalMinutes <= 0) return {};

  const totalWeight = clusters.reduce((sum, cluster) => sum + cluster.priority, 0);
  if (totalWeight <= 0) {
    return Object.fromEntries(clusters.map(cluster => [cluster.id, 0]));
  }

  const baseAllocations = clusters.map((cluster, index) => {
    const exact = (cluster.priority / totalWeight) * totalMinutes;
    const base = Math.floor(exact);
    return {
      id: cluster.id,
      base,
      remainder: exact - base,
      index,
    };
  });

  let remaining = totalMinutes - baseAllocations.reduce((sum, item) => sum + item.base, 0);
  baseAllocations.sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder - a.remainder;
    return a.index - b.index;
  });

  for (let i = 0; i < baseAllocations.length && remaining > 0; i += 1) {
    baseAllocations[i].base += 1;
    remaining -= 1;
  }

  return Object.fromEntries(baseAllocations.map(item => [item.id, item.base]));
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  Sub-components                                                          */
/* ─────────────────────────────────────────────────────────────────────── */

function PriorityBadge({ p }: { p: number }) {
  const info = PRIORITY_LABELS[p] ?? PRIORITY_LABELS[3];
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-semibold border ${info.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${info.dot}`} />
      {info.short}
    </span>
  );
}

/**
 * The cluster's priority, as a menu of the three levels rather than a native
 * <select>.
 *
 * The select showed the level as plain text while the row beside it showed the
 * same level as a coloured badge, so the control and the value it set did not
 * look like the same thing. This is the badge, opened.
 */
function PrioritySelect({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (p: ClusterPriority) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const info = PRIORITY_LABELS[normalizePriority(value)];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative mt-1">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm bg-white border border-gray-200/80 rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue/60 ${
          disabled ? 'bg-gray-50/70 text-gray-500 cursor-not-allowed' : 'hover:border-brand-blue/40'
        }`}
      >
        <span className="flex items-center gap-1.5 min-w-0">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${info.dot}`} />
          <span className="truncate">{info.label}</span>
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && !disabled && (
        <div role="listbox" className="absolute z-20 mt-1 w-full rounded-lg border border-gray-100 bg-white shadow-xl shadow-brand-blue/10 ring-1 ring-black/[0.02] p-1">
          {([3, 2, 1] as ClusterPriority[]).map(p => {
            const opt = PRIORITY_LABELS[p];
            const selected = normalizePriority(value) === p;
            return (
              <button
                key={p}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => { onChange(p); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm text-left transition-colors ${
                  selected ? 'bg-brand-blue/5 text-brand-blue font-medium' : 'text-gray-700 hover:bg-brand-blue/5'
                }`}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${opt.dot}`} />
                {opt.label}
                {selected && <CheckCircle2 className="w-3.5 h-3.5 ml-auto text-brand-blue" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Draggable Skill Badge ── */
function DraggableClusterSkill({
  skillName,
  clusterId,
  category,
  onRemove,
  isReadOnly = false,
  removalLocked = false,
  chipClass,
  isAiDerived = false,
}: {
  skillName: string;
  clusterId: string;
  category: 'mth' | 'nth';
  onRemove: (skillName: string, clusterId: string) => void;
  isReadOnly?: boolean;
  /** True when the section is at its minimum skill count — the remove (X)
   * button is rendered disabled so the recruiter can't delete below the floor. */
  removalLocked?: boolean;
  /** Tailwind classes for the chip's background/border/text — used by
   * ClusterRow to color-code Skill / Command badges. */
  chipClass?: string;
  /** True when the skill name didn't come from the recruiter's typed list
   * (i.e. it was merged/renamed by /refine-clusters or expanded by
   * /expand-skills). Renders a sparkle marker so recruiters can see
   * exactly what AI added. */
  isAiDerived?: boolean;
}) {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: DND_TYPES.CLUSTER_SKILL,
    item: { skillName, fromClusterId: clusterId, fromCategory: category } as SkillDragItem,
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  }), [skillName, clusterId, category]);

  return (
    <span
      ref={isReadOnly ? undefined : drag as unknown as React.Ref<HTMLSpanElement>}
      title={isAiDerived ? 'Merged or added by AI from your skills' : undefined}
      className={`group/chip inline-flex items-center gap-1 max-w-full px-2.5 py-1 rounded-full text-xs border transition-all duration-200 backdrop-blur-sm ${
        isReadOnly ? 'cursor-default' : 'cursor-grab active:cursor-grabbing hover:-translate-y-0.5 hover:shadow-sm'
      } ${isDragging ? 'opacity-40 scale-95' : 'opacity-100 scale-100'} ${chipClass ?? 'bg-white border-gray-200 text-gray-700'} ${isAiDerived ? 'italic' : ''}`}
    >
      {!isReadOnly && <GripVertical className="w-3 h-3 flex-shrink-0 opacity-40 group-hover/chip:opacity-70 transition-opacity" />}
      {isAiDerived && <Sparkles className="w-3 h-3 flex-shrink-0 opacity-70" />}
      <span className="font-medium min-w-0 break-words">{skillName}</span>
      {!isReadOnly && (
        <button
          onClick={(e) => { e.stopPropagation(); if (removalLocked) return; onRemove(skillName, clusterId); }}
          disabled={removalLocked}
          title={removalLocked ? 'Minimum skill count reached — removal disabled' : undefined}
          className={`ml-0.5 transition-all ${removalLocked ? 'opacity-20 cursor-not-allowed' : 'opacity-50 hover:opacity-100 hover:text-destructive hover:scale-110'}`}
         aria-label="Close">
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}

/* ── Cluster Row ── */
function ClusterRow({
  cluster,
  index,
  category,
  expanded,
  onToggleExpand,
  onUpdate,
  onRemove,
  onReorder,
  onMoveSkill,
  onRemoveSkill,
  isReadOnly = false,
  removalLocked = false,
  skillTypeLookup,
  mainSkillSet,
}: {
  cluster: Cluster;
  index: number;
  category: 'mth' | 'nth';
  expanded: boolean;
  onToggleExpand: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Cluster>) => void;
  onRemove: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onMoveSkill: (skillName: string, fromClusterId: string, toClusterId: string) => void;
  onRemoveSkill: (skillName: string, clusterId: string) => void;
  isReadOnly?: boolean;
  /** True when this section is at its minimum skill count — disables the
   * skill-chip remove (X) and the "Remove Cluster" button. */
  removalLocked?: boolean;
  /** Lowercased skill name → 'Skill' | 'Command', so the cluster card can
   * group its badges by type and render a sub-header per group instead of
   * one flat list. */
  skillTypeLookup?: Map<string, SkillType>;
  /** Lowercased recruiter-typed skill names. When present, sub-skills
   * (auto-extracted from /expand-skills) are filtered out of the cluster
   * view so only main entries render. */
  mainSkillSet?: Set<string>;
}) {
  const pInfo = PRIORITY_LABELS[cluster.priority] ?? PRIORITY_LABELS[3];
  const rowRef = useRef<HTMLDivElement>(null);

  // Show ALL cluster skills — including merged/normalized names from
  // /refine-clusters (overflow path) and sub-skills from /expand-skills
  // (capacity-floor path). Previously this filtered to only recruiter-typed
  // entries, which hid refine's actual work and made it look like refine
  // never ran. AI-derived names render with a sparkle marker (isAiDerived).
  const visibleClusterSkills = cluster.skills;
  const isAiDerivedSkill = (name: string): boolean =>
    !!mainSkillSet && mainSkillSet.size > 0 && !mainSkillSet.has(name.toLowerCase().trim());

  /* Drag handle for reordering clusters */
  const [{ isDragging }, drag, dragPreview] = useDrag(() => ({
    type: DND_TYPES.CLUSTER,
    item: { category, index, clusterId: cluster.id } as ClusterDragItem,
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  }), [category, index, cluster.id]);

  /* Drop target for reordering clusters */
  const [{ isOver }, drop] = useDrop(() => ({
    accept: DND_TYPES.CLUSTER,
    hover: (item: ClusterDragItem) => {
      if (item.category !== category || item.index === index) return;
      onReorder(item.index, index);
      item.index = index;
    },
    collect: (monitor) => ({ isOver: monitor.isOver() }),
  }), [category, index, onReorder]);

  /* Drop target for receiving skills from other clusters */
  const [{ isSkillOver }, skillDrop] = useDrop(() => ({
    accept: DND_TYPES.CLUSTER_SKILL,
    drop: (item: SkillDragItem) => {
      if (item.fromCategory !== category) return;
      if (item.fromClusterId === cluster.id) return;
      onMoveSkill(item.skillName, item.fromClusterId, cluster.id);
    },
    canDrop: (item: SkillDragItem) => item.fromCategory === category && item.fromClusterId !== cluster.id,
    collect: (monitor) => ({ isSkillOver: monitor.isOver() && monitor.canDrop() }),
  }), [category, cluster.id, onMoveSkill]);

  // Combine refs
  const combinedRef = useCallback((node: HTMLDivElement | null) => {
    dragPreview(node);
    drop(node);
    skillDrop(node);
    (rowRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
  }, [dragPreview, drop, skillDrop]);

  return (
    <div
      ref={combinedRef}
      className={`relative rounded-xl transition-all duration-300 overflow-hidden ${
        isDragging ? 'opacity-40 scale-[0.98]' : ''
      } ${expanded
        ? 'border border-brand-blue/40 bg-gradient-to-br from-white via-brand-blue/[0.03] to-brand-blue/[0.06] shadow-lg shadow-brand-blue/10 ring-1 ring-brand-blue/10'
        : 'border border-gray-200/80 bg-white hover:border-brand-blue/40 hover:shadow-md hover:shadow-brand-blue/10 hover:-translate-y-0.5'
      } ${isOver ? 'border-brand-blue bg-brand-blue/5' : ''
      } ${isSkillOver ? 'ring-2 ring-brand-blue/40 bg-brand-blue/10' : ''}`}
    >
      {/* Accent strip on expanded state */}
      {expanded && (
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-brand-blue/60 via-brand-blue/40 to-transparent" />
      )}

      {/* Collapsed header */}
      <div
        className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-3 cursor-pointer transition-all duration-200 ${expanded ? 'hover:bg-brand-blue/[0.04]' : 'hover:bg-brand-blue/[0.025]'}`}
        onClick={() => onToggleExpand(cluster.id)}
      >
        {/* Hide drag handle when read-only (flexible finalized) */}
        {!isReadOnly && (
          <div ref={drag as unknown as React.Ref<HTMLDivElement>} className="hidden sm:block cursor-grab active:cursor-grabbing p-0.5 opacity-30 hover:opacity-70 transition-opacity">
            <GripVertical className="w-4 h-4 text-gray-400" />
          </div>
        )}
        <PriorityBadge p={cluster.priority} />
        {visibleClusterSkills.length === 0 && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-2xs font-semibold bg-destructive-subtle text-destructive border border-destructive-line/70 flex-shrink-0">
            <AlertTriangle className="w-2.5 h-2.5" /> Empty
          </span>
        )}
        <span className={`text-sm font-semibold flex-1 min-w-0 truncate transition-colors ${expanded ? 'text-brand-blue-deep' : 'text-gray-900'}`}>
          {cluster.name || 'Unnamed Cluster'}
        </span>
        {(() => {
          const aiCount = visibleClusterSkills.filter(isAiDerivedSkill).length;
          if (aiCount === 0) return null;
          return (
            <span
              title={`${aiCount} skill${aiCount !== 1 ? 's' : ''} merged or added by AI from your inputs`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-semibold bg-gradient-to-r from-brand-blue/10 to-brand-blue/5 text-brand-blue border border-brand-blue/20 flex-shrink-0 shadow-sm shadow-brand-blue/5"
            >
              <Sparkles className="w-2.5 h-2.5" />
              {aiCount}<span className="hidden sm:inline"> AI</span>
            </span>
          );
        })()}
        <span className="inline-flex items-center flex-shrink-0 px-2 py-0.5 rounded-full text-2xs font-medium bg-gray-100 text-gray-600 ring-1 ring-gray-200/60">
          {visibleClusterSkills.length}<span className="hidden sm:inline">&nbsp;skill{visibleClusterSkills.length !== 1 ? 's' : ''}</span>
        </span>
        {/* Rename and remove, on the row itself. Both used to live inside the
            expanded panel, so renaming a cluster meant opening it first and
            removing one meant opening it and scrolling past its skills. */}
        {!isReadOnly && (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); if (!expanded) onToggleExpand(cluster.id); }}
              title="Rename this cluster"
              aria-label={`Rename ${cluster.name || 'cluster'}`}
              className="p-1 text-gray-400 hover:text-brand-blue transition-colors flex-shrink-0"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); if (removalLocked) return; onRemove(cluster.id); }}
              disabled={removalLocked}
              title={removalLocked ? 'Minimum skill count reached — removal disabled' : 'Remove this cluster'}
              aria-label={`Remove ${cluster.name || 'cluster'}`}
              className={`p-1 transition-colors flex-shrink-0 ${
                removalLocked ? 'text-gray-300 cursor-not-allowed' : 'text-gray-400 hover:text-red-500'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
        <div className={`flex items-center justify-center w-6 h-6 rounded-full flex-shrink-0 transition-all duration-300 ${expanded ? 'bg-brand-blue/15 text-brand-blue rotate-180' : 'text-gray-400 hover:bg-gray-100'}`}>
          <ChevronDown className="w-3.5 h-3.5" />
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 sm:px-4 pb-4 pt-2 space-y-3 border-t border-brand-blue/10 relative">
          {/* Cluster name + Priority side-by-side for compactness */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="sm:col-span-2">
              <label className="text-2xs font-semibold text-gray-400 uppercase tracking-wider">Cluster Name</label>
              <input
                type="text"
                value={cluster.name}
                onChange={(e) => onUpdate(cluster.id, { name: e.target.value })}
                disabled={isReadOnly}
                className={`mt-1 w-full px-3 py-2 text-sm bg-white/80 backdrop-blur-sm border border-gray-200/80 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue/60 focus:bg-white transition-all ${isReadOnly ? 'bg-gray-50/70 text-gray-500 cursor-not-allowed' : ''}`}
                placeholder="e.g. Core Backend Skills"
              />
            </div>
            <div>
              <label className="text-2xs font-semibold text-gray-400 uppercase tracking-wider">Priority</label>
              <PrioritySelect
                value={cluster.priority}
                onChange={(p) => onUpdate(cluster.id, { priority: p as Cluster['priority'] })}
                disabled={isReadOnly}
              />
            </div>
          </div>

          {/* Reason / description was removed per UX request. cluster.reason
              is still preserved on the data model so Bina's prompts can use
              it. Edit it from the JD config page if needed. */}

          {/* Skills — single section, type-coded chip colors (Skill = violet, Command = sky-blue) */}
          <div>
            {visibleClusterSkills.length > 0 ? (
              (() => {
                // Sort recruiter-typed main skills first, AI-derived next; within each
                // segment, Skills before Commands so the eye groups by color naturally.
                const sorted = [...visibleClusterSkills].sort((a, b) => {
                  const aDerived = isAiDerivedSkill(a) ? 1 : 0;
                  const bDerived = isAiDerivedSkill(b) ? 1 : 0;
                  if (aDerived !== bDerived) return aDerived - bDerived;
                  const aType = skillTypeLookup?.get(a.toLowerCase().trim()) === 'Command' ? 1 : 0;
                  const bType = skillTypeLookup?.get(b.toLowerCase().trim()) === 'Command' ? 1 : 0;
                  return aType - bType;
                });
                const totalCount = sorted.length;
                const commandCount = sorted.filter(s =>
                  skillTypeLookup?.get(s.toLowerCase().trim()) === 'Command'
                ).length;
                return (
                  <div className="mt-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mb-1.5">
                      <div className="text-2xs font-semibold uppercase tracking-wide text-gray-400">
                        Skills ({totalCount}{commandCount > 0 ? ` · ${commandCount} command${commandCount === 1 ? '' : 's'}` : ''})
                      </div>
                      {commandCount > 0 && (
                        <div className="flex flex-wrap items-center gap-2 text-2xs text-gray-400 min-w-0">
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-violet-400" /> Skill
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-400" /> Command
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {sorted.map((s) => {
                        const isCmd = skillTypeLookup?.get(s.toLowerCase().trim()) === 'Command';
                        const chipClass = isCmd
                          ? 'bg-sky-50 border-sky-200 text-sky-700'
                          : 'bg-violet-50 border-violet-200 text-violet-700';
                        return (
                          <DraggableClusterSkill
                            key={s}
                            skillName={s}
                            clusterId={cluster.id}
                            category={category}
                            onRemove={onRemoveSkill}
                            isReadOnly={isReadOnly}
                            removalLocked={removalLocked}
                            chipClass={chipClass}
                            isAiDerived={isAiDerivedSkill(s)}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })()
            ) : (
              <p className="text-xs text-gray-400 mt-1">No skills assigned. Drag skills here from other clusters.</p>
            )}
            {!isReadOnly && <p className="text-2xs text-gray-300 mt-1.5">Drag skills to move between clusters</p>}
          </div>

          {/* Remove lives on the row's header now — see the trash there. */}
        </div>
      )}
    </div>
  );
}

/* ── Category Section (MTH or NTH) ── */
function CategorySection({
  title,
  icon,
  category,
  clusters,
  timeMin,
  expandedIds,
  onToggleExpand,
  onUpdateCluster,
  onRemoveCluster,
  onReorderClusters,
  onMoveSkill,
  onRemoveSkill,
  onAddCluster,
  maxClusters,
  isReadOnly = false,
  removalLocked = false,
  skills = [],
  onAddSkill,
  onRemoveSkillFromPool,
  mainSkillSet,
  parentGroups,
  jdId,
}: {
  title: string;
  icon: React.ReactNode;
  category: 'mth' | 'nth';
  clusters: Cluster[];
  timeMin: number;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onUpdateCluster: (category: 'mth' | 'nth', id: string, updates: Partial<Cluster>) => void;
  onRemoveCluster: (category: 'mth' | 'nth', id: string) => void;
  onReorderClusters: (category: 'mth' | 'nth', fromIndex: number, toIndex: number) => void;
  onMoveSkill: (category: 'mth' | 'nth', skillName: string, fromClusterId: string, toClusterId: string) => void;
  onRemoveSkill: (skillName: string, clusterId: string) => void;
  onAddCluster: (category: 'mth' | 'nth') => void;
  maxClusters: number;
  isReadOnly?: boolean;
  /** True when this section is at its minimum skill count — disables every
   * remove control (pool-skill X, cluster-skill X, "Remove Cluster"). */
  removalLocked?: boolean;
  skills?: SkillEntry[];
  onAddSkill?: (skillName: string) => void;
  onRemoveSkillFromPool?: (skillName: string) => void;
  mainSkillSet?: Set<string>;
  parentGroups?: { parent: string; sub_skills: string[] }[];
  /** JD id, so the duplicate check can resolve the industry server-side and judge
   *  skills inside the right domain (multi-industry platform). */
  jdId?: string;
}) {
  const [newSkillInput, setNewSkillInput] = useState('');
  const [skillInputError, setSkillInputError] = useState('');
  // True while the semantic (LLM) duplicate check is in flight, so the Add
  // button can show progress instead of appearing frozen.
  const [checkingSkill, setCheckingSkill] = useState(false);
  // Skill name already warned about once on a MEDIUM-confidence duplicate match;
  // pressing Add again with the same text keeps both. Cleared on a successful add.
  const [skillOverride, setSkillOverride] = useState<string | null>(null);

  // Lowercased skill name → type, derived from the recruiter's per-skill
  // dropdown choice. Used by each ClusterRow to render Skill / Command
  // badges in separate type-grouped sub-sections.
  const skillTypeLookup = useMemo(() => {
    const m = new Map<string, SkillType>();
    for (const e of skills) {
      if (e?.name) m.set(e.name.toLowerCase().trim(), e.type ?? 'Skill');
    }
    return m;
  }, [skills]);

  const handleAddSkill = async () => {
    const trimmed = newSkillInput.trim();
    if (!trimmed) { setSkillInputError('Skill name cannot be empty'); return; }
    const duplicate = skills.some(s => s.name.toLowerCase() === trimmed.toLowerCase());
    if (duplicate) { setSkillInputError(`"${trimmed}" already exists`); return; }
    // Semantic duplicate guard (2026-08-13). This screen used to compare EXACT
    // strings only, while the Configure page ran the semantic matcher — so
    // "Software development life cycle" was accepted here even though "SDLC and
    // STLC Knowledge" was already in the list, and both flowed into cluster
    // generation as separate skills. Same shared matcher as the Configure page.
    // HIGH is refused here and costs no round trip. MEDIUM is a judgement only
    // the recruiter can settle (e.g. whether a bundled "SDLC and STLC Knowledge"
    // should also carry a standalone entry) — which is precisely the question the
    // backend now asks properly (2026-09-05), so it no longer short-circuits and
    // is held as the fallback for an outage instead.
    const overriding = skillOverride?.toLowerCase() === trimmed.toLowerCase();
    const similar = closestDuplicate(skills, s => s.name, trimmed);
    if (similar && similar.tier !== 'medium' && !overriding) {
      setSkillInputError(
        `"${trimmed}" looks like the existing skill "${similar.item.name}" (${similar.reason})`,
      );
      setSkillOverride(null);
      return;
    }
    // ── Semantic layer: only reached when the deterministic matcher found nothing.
    // Structural rules cannot see a true synonym ("Data Analytics" vs "Data
    // Analysis", "Goods Inward" vs "Receiving") — those share no root, and every
    // industry has its own set, so this asks the backend (which is industry-aware)
    // rather than growing a word list. Advisory + overridable; fails open, so a
    // slow or unavailable check never stops the add.
    // THREE ANSWERS, same as the Configure page: the same skill is refused, a
    // related one is put to the recruiter, and a different one is added silently.
    if (!overriding) {
      setCheckingSkill(true);
      // null = the check could not run. [] = it ran and had nothing to say.
      let findings: SkillDuplicateFinding[] | null = [];
      try {
        findings = await aiInterviewService.checkSkillDuplicates({
          candidates: [trimmed],
          existing: skills.map(s => s.name),
          jdId,
          interactive: true,
        });
      } finally {
        setCheckingSkill(false);
      }
      const hit = (findings ?? []).find(
        f => f.match && (f.duplicate || f.action === 'ASK_RECRUITER'),
      );
      if (hit?.duplicate) {
        setSkillInputError(
          `"${trimmed}" is the same skill as "${hit.match}"${hit.reason ? ` — ${hit.reason}` : ''}`,
        );
        setSkillOverride(null);
        return;
      }
      if (hit) {
        setSkillInputError(
          hit.recruiterMessage
          ?? `"${trimmed}" is closely related to the existing skill "${hit.match}"${hit.reason ? ` — ${hit.reason}` : ''}. Add it as a separate skill?`,
        );
        setSkillOverride(trimmed);   // a question, not a veto — Add again means yes
        return;
      }
      if (findings === null && similar) {
        // Outage only. A check that ran and cleared the skill has seen more than
        // this matcher can, so its silence is an answer, not a gap to fill.
        setSkillInputError(
          `"${trimmed}" looks like the existing skill "${similar.item.name}" (${similar.reason}). Add it as a separate skill?`,
        );
        setSkillOverride(trimmed);
        return;
      }
    }
    setSkillOverride(null);
    onAddSkill?.(trimmed);
    setNewSkillInput('');
    setSkillInputError('');
  };

  /* Section collapse, and the two controls over the skills pool. Local to the
     section: each bucket is filtered and folded on its own. */
  const [collapsed, setCollapsed] = useState(false);
  const [skillQuery, setSkillQuery] = useState('');
  const [skillFilter, setSkillFilter] = useState<'all' | 'skill' | 'command'>('all');

  const clusterMinuteMap = allocateClusterMinutes(clusters, timeMin);
  const atLimit = maxClusters > 0 && clusters.length >= maxClusters;

  return (
    <div className="relative bg-white rounded-2xl border border-gray-200/70 ring-1 ring-black/[0.02] shadow-[0_1px_3px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(59,130,246,0.08)] overflow-hidden">
      {/* Subtle ambient gradient on top edge */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-blue/30 to-transparent" />

      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 sm:px-5 py-4 border-b border-gray-100/80 bg-gradient-to-br from-slate-50/80 via-white to-brand-blue/[0.02]">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-brand-blue/15 to-brand-blue/5 ring-1 ring-brand-blue/15 text-brand-blue shadow-sm shadow-brand-blue/10 flex-shrink-0">
            {icon}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-gray-900 tracking-tight leading-tight">{title}</h2>
              {maxClusters > 0 && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-medium ${
                  atLimit
                    ? 'bg-destructive-subtle text-destructive ring-1 ring-destructive-line'
                    : 'bg-slate-100 text-gray-600 ring-1 ring-gray-200/70'
                }`}>
                  {clusters.length}/{maxClusters} clusters
                </span>
              )}
              {timeMin > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-medium bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/15">
                  <Clock className="w-2.5 h-2.5" />
                  {timeMin} min
                </span>
              )}
            </div>
            {/* What the bucket is for, said once in the header rather than left
                for the recruiter to infer from the cluster names inside it. */}
            <p className="text-xs text-gray-500 mt-0.5">
              {category === 'mth'
                ? 'Core skills required for the role. These are critical for candidate evaluation.'
                : 'Additional skills that add value to the role.'}
            </p>
          </div>
        </div>
        {/* Collapse — a long bucket is a lot of page to scroll past when the
            recruiter is working in the other one. */}
        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          aria-expanded={!collapsed}
          title={collapsed ? `Show ${title}` : `Hide ${title}`}
          className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-400 hover:text-brand-blue hover:bg-brand-blue/5 transition-colors flex-shrink-0"
        >
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`} />
        </button>
        {/* "Add Cluster" button removed per product feedback — cluster
            structure is finalized by the AI generator; manual cluster
            additions on this page are no longer offered. Use "Regenerate
            with AI" to rebuild the cluster set. */}
      </div>

      {!collapsed && (
      <>

      {/* ── Pool section: unified Skills (Commands color-coded inline) ── */}
      {(() => {
        // Show only recruiter-typed (main) entries. Auto-derived sub-skills
        // from /expand-skills are intentionally hidden here per spec.
        const visibleSkills = mainSkillSet && mainSkillSet.size > 0
          ? skills.filter(s => mainSkillSet.has(s.name.toLowerCase().trim()))
          : skills;
        // Single unified list — Commands are no longer rendered under a
        // separate header. Skills first, Commands after, distinguishable
        // by chip color (violet vs sky).
        const sorted = [...visibleSkills].sort((a, b) => {
          const aCmd = a.type === 'Command' ? 1 : 0;
          const bCmd = b.type === 'Command' ? 1 : 0;
          return aCmd - bCmd;
        });
        const totalCount = sorted.length;
        const commandCount = sorted.filter(e => e.type === 'Command').length;

        const renderChip = (entry: SkillEntry) => {
          const isCmd = entry.type === 'Command';
          const chipClass = isCmd
            ? 'bg-sky-50 text-sky-700 border-sky-200'
            : 'bg-violet-50 text-violet-700 border-violet-200';
          return (
            <span
              key={entry.name}
              className={`inline-flex items-center gap-1 max-w-full px-2.5 py-1 rounded-full text-xs font-medium border transition-all hover:-translate-y-0.5 hover:shadow-sm ${chipClass}`}
            >
              <span className="min-w-0 break-words">{entry.name}</span>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={() => { if (removalLocked) return; onRemoveSkillFromPool?.(entry.name); }}
                  disabled={removalLocked}
                  className={`ml-0.5 transition-all ${removalLocked ? 'opacity-20 cursor-not-allowed' : 'opacity-50 hover:opacity-100 hover:text-destructive hover:scale-110'}`}
                  aria-label="Remove" title={removalLocked ? 'Minimum skill count reached — removal disabled' : 'Remove'}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          );
        };

        /* What the two controls above the chips actually do. A bucket can
           carry thirty skills, and "is X still in here, and is it in a
           cluster?" was a question the recruiter had to answer by eye. */
        const query = skillQuery.trim().toLowerCase();
        const matches = sorted.filter(e => {
          if (query && !e.name.toLowerCase().includes(query)) return false;
          if (skillFilter === 'skill') return e.type !== 'Command';
          if (skillFilter === 'command') return e.type === 'Command';
          return true;
        });
        const filtering = query.length > 0 || skillFilter !== 'all';

        return (
          <div className="px-4 pt-4 pb-3 border-b border-gray-100/70">
            {totalCount === 0 ? (
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Skills</span>
                <span className="text-xs text-gray-400">0</span>
              </div>
            ) : (
              <div className="mb-3">
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Skills <span className="text-gray-400 font-normal">({totalCount}{commandCount > 0 ? ` · ${commandCount} command${commandCount === 1 ? '' : 's'}` : ''})</span>
                  </span>
                  {commandCount > 0 && (
                    <div className="flex items-center gap-2.5 text-2xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-400" /> Skill
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-400" /> Command
                      </span>
                    </div>
                  )}
                </div>

                {/* Search + filter. Both narrow the chips below; neither
                    changes the bucket, which is finalised on Configure. */}
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="relative flex-1 min-w-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      value={skillQuery}
                      onChange={e => setSkillQuery(e.target.value)}
                      placeholder="Search skills…"
                      aria-label={`Search ${title}`}
                      className="w-full pl-8 pr-8 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue/60 transition-all"
                    />
                    {skillQuery && (
                      <button
                        type="button"
                        onClick={() => setSkillQuery('')}
                        aria-label="Clear search"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="relative flex-shrink-0">
                    <select
                      value={skillFilter}
                      onChange={e => setSkillFilter(e.target.value as typeof skillFilter)}
                      aria-label="Filter skills"
                      className="appearance-none pl-3 pr-7 py-1.5 text-xs font-medium bg-white border border-gray-200 rounded-lg text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue/60"
                    >
                      <option value="all">All</option>
                      <option value="skill">Skills only</option>
                      <option value="command">Commands only</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  </div>
                </div>

                {matches.length === 0 ? (
                  <p className="text-xs text-gray-400 py-3 text-center">
                    {filtering ? 'No skills match this search.' : 'No skills in this section.'}
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {matches.map(e => renderChip(e))}
                    </div>
                    {filtering && (
                      <p className="mt-1.5 text-2xs text-gray-400">
                        Showing {matches.length} of {totalCount}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Add-skill input + button removed per product feedback —
                skills are now finalized on the previous JD config page; the
                clusters page is for grouping/refining the existing skill set,
                not for adding new ones. Use "Back to Configure" to add. */}
          </div>
        );
      })()}

      {/* Cluster list */}
      <div className="p-4 space-y-2.5">
        {clusters.length === 0 ? (
          <div className="py-10 px-4 text-center border-2 border-dashed border-brand-blue/20 rounded-xl bg-gradient-to-br from-brand-blue/5 via-white to-brand-cyan/5">
            <div className="w-14 h-14 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center mx-auto mb-3">
              <Layers className="w-7 h-7 text-brand-blue" />
            </div>
            <p className="text-sm text-gray-600">
              No clusters yet. Click <strong className="text-brand-blue">&quot;Regenerate with AI&quot;</strong> or add manually.
            </p>
          </div>
        ) : (
          clusters.map((cluster, idx) => (
            <ClusterRow
              key={cluster.id}
              cluster={cluster}
              index={idx}
              category={category}
              expanded={expandedIds.has(cluster.id)}
              onToggleExpand={onToggleExpand}
              onUpdate={(id, updates) => onUpdateCluster(category, id, updates)}
              onRemove={(id) => onRemoveCluster(category, id)}
              onReorder={(from, to) => onReorderClusters(category, from, to)}
              onMoveSkill={(skillName, fromId, toId) => onMoveSkill(category, skillName, fromId, toId)}
              onRemoveSkill={onRemoveSkill}
              isReadOnly={isReadOnly}
              removalLocked={removalLocked}
              skillTypeLookup={skillTypeLookup}
              mainSkillSet={mainSkillSet}
            />
          ))
        )}
      </div>
      </>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  Main Component                                                          */
/* ─────────────────────────────────────────────────────────────────────── */

export default function AIInterviewClusters() {
  const router = useWizardRouter();
  /* Run inside the Create / Send AI Interview popup (AIInterviewWizardDialog). */
  const wizardNav = useEmbeddedWizard();
  const embedded = !!wizardNav;
  /* Step indicator pins below the sticky breadcrumb rather than under it. */
  const [breadcrumbBarRef, breadcrumbHeight] = useBreadcrumbOffset();
  const searchParams = useWizardSearchParams();
  const id = searchParams.get('id') || '';
  // Carried from the Configure step when the flow started on a JD's Job Details
  // page — keeps the breadcrumb anchored to that job across the whole flow.
  const fromJobDetails = searchParams.get('from') === 'job-details';
  // Entered from Resume Scoring's / AI Talent Match's Actions › "Create AI
  // Interview" (the job had none to invite to): the trail starts at that
  // page, the origin rides every step, and publishing leads straight back
  // there to invite.
  const inviteOrigin = resolveInviteHandoffOrigin(searchParams.get('from'), searchParams.get('returnUrl'));
  const fromInviteOrigin = !!inviteOrigin;
  const inviteOriginReturn = inviteOrigin?.returnUrl ?? '';
  const inviteOriginLabel = inviteOrigin?.label ?? '';
  const inviteOriginPath = inviteOrigin?.path ?? '';
  // Started from one candidate's page: the trail names that candidate.
  const candidateCrumb = useHandoffCandidateCrumb();
  const inviteOriginQuery = inviteOrigin?.query ?? '';
  const originParam = (fromJobDetails ? '&from=job-details' : '') + inviteOriginQuery;

  /* Loading / saving states */
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  /* Config from server */
  const [config, setConfig] = useState<AIInterviewResponse | null>(null);

  /* Where leaving the flow lands. Started from a JD's Job Details page — the
     draft prompt there included — means the recruiter came to finish one job's
     interview, so saving or discarding returns them to that job instead of the
     AI Interviews list they never asked for. */
  const exitHref = fromInviteOrigin
    ? inviteOriginReturn
    : fromJobDetails && config?.jd_id
      ? `/recruitment/job-details?id=${encodeURIComponent(config.jd_id)}`
      : '/recruitment/ai-interviews';

  /* Cluster state */
  const [mthClusters, setMthClusters] = useState<Cluster[]>([]);
  const [nthClusters, setNthClusters] = useState<Cluster[]>([]);

  /* Skills lists (editable — user can add/remove skills on this page) */
  const [mthSkills, setMthSkills] = useState<SkillEntry[]>([]);
  const [nthSkills, setNthSkills] = useState<SkillEntry[]>([]);
  /* Recruiter-typed "main" skills (lowercased), captured before AI expansion.
     Used to render a distinct chip style + "Main" label on this page. */
  const [mthMainSkillSet, setMthMainSkillSet] = useState<Set<string>>(new Set());
  const [nthMainSkillSet, setNthMainSkillSet] = useState<Set<string>>(new Set());
  /* Parent → sub_skills bindings (from /expand-skills). When present, the
     Skills pool renders hierarchically (main + nested sub-skills). */
  const [mthParentGroupsState, setMthParentGroupsState] = useState<{ parent: string; sub_skills: string[] }[]>([]);
  const [nthParentGroupsState, setNthParentGroupsState] = useState<{ parent: string; sub_skills: string[] }[]>([]);
  /* Original JD skill names — used to separate new custom skills on save */
  const jdMthSkillNamesRef = useRef<Set<string>>(new Set());
  const jdNthSkillNamesRef = useRef<Set<string>>(new Set());
  const [nthEnabled, setNthEnabled] = useState(true);
  // Question Distribution panel — collapsed by default; expands on click
  const [showQuestionDistribution, setShowQuestionDistribution] = useState(false);

  /* Time / mode */
  const [isFixed, setIsFixed] = useState(true);
  const [fixedMthMin, setFixedMthMin] = useState<number>(30);
  const [fixedNthMin, setFixedNthMin] = useState<number>(0);
  const [mthMaxClusters, setMthMaxClusters] = useState<number>(3);
  const [nthMaxClusters, setNthMaxClusters] = useState<number>(0);
  const [hrEnabled, setHrEnabled] = useState(false);
  const [fixedHrMin, setFixedHrMin] = useState<number>(0);

  const timedAllocation = getTimedModeAllocation(nthEnabled, hrEnabled);

  /* UI state */
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  /* Flexible mode state */
  const [isFlexible, setIsFlexible] = useState(false);
  const [isFinalized, setIsFinalized] = useState(false);
  const [jdDescription, setJdDescription] = useState('');

  /* Skill importance weights */
  const [skillWeights, setSkillWeights] = useState<Record<string, 'high' | 'medium' | 'low'>>({});

  const setSkillWeight = useCallback((skill: string, w: 'high' | 'medium' | 'low') => {
    setSkillWeights(prev => ({ ...prev, [skill]: w }));
  }, []);

  /* ── Parse skill entries from round config ── */
  const toSkillEntries = useCallback((names: string[], comments?: Record<string, string>, types?: Record<string, string>): SkillEntry[] => {
    // Build a normalized lookup so the recruiter's saved type survives the
    // LLM's name normalization on regeneration (e.g. "Database design" vs
    // "Database design (PostgreSQL, MySQL, MongoDB)" vs different casing).
    const typeByNorm = new Map<string, SkillType>();
    if (types) {
      for (const [k, v] of Object.entries(types)) {
        if (!k || !v) continue;
        typeByNorm.set(k.toLowerCase().trim(), v as SkillType);
      }
    }
    const lookupType = (n: string): SkillType => {
      const key = n.toLowerCase().trim();
      // Exact match
      const exact = typeByNorm.get(key);
      if (exact) return exact;
      // Try matching by stripping parenthetical detail: "Database design (PostgreSQL, ...)" → "database design"
      const noParen = key.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
      if (noParen !== key) {
        const v = typeByNorm.get(noParen);
        if (v) return v;
      }
      // Try the other direction: any saved key whose noParen form equals our key
      for (const [savedKey, v] of typeByNorm.entries()) {
        const savedNoParen = savedKey.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
        if (savedNoParen === key || savedNoParen === noParen) return v;
      }
      // Try prefix match: any saved key that starts with our key (or vice versa)
      // — guards against LLM appending/dropping qualifiers.
      for (const [savedKey, v] of typeByNorm.entries()) {
        if (savedKey.startsWith(key + ' ') || key.startsWith(savedKey + ' ')) return v;
      }
      return 'Skill';
    };

    const comments_norm = new Map<string, string>();
    if (comments) {
      for (const [k, v] of Object.entries(comments)) {
        if (k && v) comments_norm.set(k.toLowerCase().trim(), v);
      }
    }
    return names.map(n => ({
      name: n,
      comment: comments?.[n] ?? comments_norm.get(n.toLowerCase().trim()) ?? '',
      type: lookupType(n),
    }));
  }, []);

  /* Bring the generating state into view when a run starts.
     The card it replaces can sit well below the fold — the recruiter presses
     "Regenerate with AI" in the header and the progress it triggers was
     rendering off-screen, which read as nothing having happened. Scrolled on
     the frame after the flag flips, so the element exists to scroll to. */
  useEffect(() => {
    if (!generating) return;
    const frame = requestAnimationFrame(() => {
      /* Aligned to its TOP, not centered: the block is taller than it looks —
         rail, four cards and the Tip strip — and centering a block that tall
         pushes its last row (the Tip) under the fold or behind the footer. */
      document.getElementById(CLUSTER_GENERATING_ID)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [generating]);

  /* ── Load draft ── */
  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        const draft = await aiInterviewService.get(id);
        // A disabled JD's interview is view-only — no editing its clusters
        // until the job is enabled again; show its read-only details instead.
        if (isJdDisabled(draft.jd_status)) {
          toast.error(JD_DISABLED_ACTION_MESSAGE);
          if (wizardNav) wizardNav.exit();
          else router.replace(`/recruitment/ai-interviews/${draft.id}`);
          return;
        }
        setConfig(draft);

        // Parse rounds_config for skills
        const rounds = draft.rounds_config ?? [];
        const mthRound = rounds.find(r => r.type === 'must_have_skills' || r.type === 'must_have' || r.type === 'must-have');
        const nthRound = rounds.find(r => r.type === 'nice_to_have_skills' || r.type === 'nice_to_have' || r.type === 'nice-to-have');
        const hrRound = rounds.find(r => r.type === 'hr');

        // Parse special_instructions
        let si: Record<string, any> = {};
        try {
          si = JSON.parse(draft.special_instructions || '{}');
        } catch { /* noop */ }

        const isFlexibleMode = si.interview_mode === 'flexible';
        const nthEnabledForTimed = nthRound ? nthRound.enabled !== false : false;
        const hrEnabledForTimed = hrRound ? hrRound.enabled !== false : false;
        const timedAllocation = getTimedModeAllocation(nthEnabledForTimed, hrEnabledForTimed);

        setIsFixed(!isFlexibleMode);
        setIsFlexible(isFlexibleMode);
        setMthMaxClusters(isFlexibleMode ? 3 : timedAllocation.mthMaxClusters);
        setNthMaxClusters(isFlexibleMode ? 2 : timedAllocation.nthMaxClusters);
        setHrEnabled(hrEnabledForTimed);
        setFixedMthMin(
          isFlexibleMode
            ? (mthRound?.duration_minutes ?? 0)
            : timedAllocation.mthMinutes,
        );
        setFixedNthMin(
          isFlexibleMode
            ? (nthEnabledForTimed ? (nthRound?.duration_minutes ?? 0) : 0)
            : timedAllocation.nthMinutes,
        );
        setFixedHrMin(
          isFlexibleMode
            ? (hrEnabledForTimed ? (hrRound?.duration_minutes ?? 0) : 0)
            : timedAllocation.hrMinutes,
        );

        const mthComments: Record<string, string> = si.skill_comments?.mth || {};
        const nthComments: Record<string, string> = si.skill_comments?.nth || {};
        const mthTypes: Record<string, string> = si.skill_types?.mth || {};
        const nthTypes: Record<string, string> = si.skill_types?.nth || {};

        // Build skills from jd_skills + custom_skills.
        // Only fall back to topics[] when both jd_skills and custom_skills are absent —
        // that covers legacy configs that stored skills in topics before the split was added.
        // IMPORTANT: after buildUpdatedRoundsConfig() runs, topics[] holds cluster NAMES
        // (e.g. "Backend Architecture"), NOT raw skills. Including them here would cause
        // cluster names to appear as unassigned skills on the next load.
        const buildSkillList = (round: any) => {
          const jd = round.jd_skills ?? [];
          const custom = round.custom_skills ?? [];
          if (jd.length > 0 || custom.length > 0) {
            return Array.from(new Set([...jd, ...custom]));
          }
          // Legacy fallback: skills were stored in topics before jd_skills/custom_skills existed
          return Array.from(new Set(round.topics ?? []));
        };

        if (mthRound) {
          const mthList = buildSkillList(mthRound);
          setMthSkills(toSkillEntries(mthList, mthComments, mthTypes));
          jdMthSkillNamesRef.current = new Set((mthRound.jd_skills ?? []).map((s: string) => s.toLowerCase()));
        } else if (draft.jd_must_have_skills?.length) {
          setMthSkills(toSkillEntries(draft.jd_must_have_skills, mthComments, mthTypes));
          jdMthSkillNamesRef.current = new Set(draft.jd_must_have_skills.map((s: string) => s.toLowerCase()));
        }

        if (nthRound) {
          setNthEnabled(nthRound.enabled !== false);
          const skills = buildSkillList(nthRound);
          setNthSkills(nthRound.enabled !== false ? toSkillEntries(skills, nthComments, nthTypes) : []);
          jdNthSkillNamesRef.current = new Set((nthRound.jd_skills ?? []).map((s: string) => s.toLowerCase()));
        } else {
          setNthEnabled(false);
          setNthSkills([]);
        }

        // Restore clusters from special_instructions — trim to current scenario max.
        // When trimming drops clusters, redistribute their skills to the surviving
        // cluster with the fewest skills so no skill is silently lost.
        const trimAndRedistribute = (raw: any[], max: number): any[] => {
          if (!raw?.length || max <= 0) return [];
          if (raw.length <= max) return raw;
          const survivors = raw.slice(0, max).map((c: any) => ({ ...c, skills: [...(c.skills || [])] }));
          const dropped = raw.slice(max);
          const orphans: string[] = [];
          for (const c of dropped) {
            for (const s of (c.skills || [])) {
              if (typeof s === 'string' && s.trim()) orphans.push(s);
            }
          }
          for (const s of orphans) {
            const target = survivors.reduce((min, c) =>
              (c.skills?.length ?? 0) < (min.skills?.length ?? 0) ? c : min, survivors[0]);
            if (!(target.skills as string[]).some(x => x.toLowerCase() === s.toLowerCase())) {
              (target.skills as string[]).push(s);
            }
          }
          return survivors;
        };
        const initialExpandIds: string[] = [];
        // Fold the SAVED distribution's skills back into the restored clusters so
        // the cluster card shows every skill the interview actually asks. The
        // saved skill_distribution can carry JD-pool skills that were never
        // written into nth_clusters/mth_clusters, so without this the card showed
        // e.g. 2 NHS skills while the Question Distribution popover (which reads
        // the distribution) correctly showed 8. Matched by cluster_id → name →
        // first cluster; case-insensitive dedupe; never drops an existing skill.
        const _distRows = (si.skill_distribution && typeof si.skill_distribution === 'object')
          ? si.skill_distribution as { mth_questions?: any[]; nth_questions?: any[] }
          : {};
        const foldDistOnLoad = (clustersArr: any[], rows?: any[]): any[] => {
          if (!Array.isArray(clustersArr) || clustersArr.length === 0) return clustersArr;
          if (!Array.isArray(rows) || rows.length === 0) return clustersArr;
          const next = clustersArr.map(c => ({ ...c, skills: [...(c.skills || [])] }));
          const byId = new Map(next.map(c => [String(c.id), c]));
          const byName = new Map(next.map(c => [String(c.name).toLowerCase().trim(), c]));
          // BUCKET-WIDE dedup (not per-cluster): clusters partition skills 1:1, but
          // the slot distribution is many-to-many — the same skill is often a
          // secondary across multiple clusters' question rows. A per-cluster set
          // let such a skill be folded into TWO clusters (e.g. "Test case design"
          // in both "Testing Tools" and "Defect Tracking"). Scope dedup to the
          // whole bucket so a skill already present in ANY cluster is never added
          // to another. First cluster to own it wins.
          const seenBucket = new Set<string>(
            next.flatMap(c => (c.skills as string[]).map(s => s.toLowerCase().trim())),
          );
          for (const r of rows) {
            const target = byId.get(String(r?.cluster_id))
              ?? byName.get(String(r?.cluster_name || '').toLowerCase().trim())
              ?? next[0];
            if (!target) continue;
            const names = [
              String(r?.primary_skill || r?.primary || '').trim(),
              ...((r?.secondary_skills || r?.secondaries || []) as any[]).map((x: any) => String(x || '').trim()),
            ].filter(Boolean);
            for (const nm of names) {
              const k = nm.toLowerCase().trim();
              if (k && !seenBucket.has(k)) { (target.skills as string[]).push(nm); seenBucket.add(k); }
            }
          }
          return next;
        };
        let mthRestored: any[] = [];
        if (si.mth_clusters?.length) {
          const mthMax = isFlexibleMode ? 3 : timedAllocation.mthMaxClusters;
          const mthTrimmed = trimAndRedistribute(si.mth_clusters as any[], mthMax);
          mthRestored = foldDistOnLoad(
            mthTrimmed.map((c: any) => ({ ...c, priority: normalizePriority(c.priority) })),
            _distRows.mth_questions,
          );
        }
        let nthRestored: any[] = [];
        if (si.nth_clusters?.length) {
          const nthMax = isFlexibleMode ? 2 : timedAllocation.nthMaxClusters;
          // nthEnabledForTimed=false means NHS is disabled — always clear saved clusters
          const nthTrimmed = !nthEnabledForTimed
            ? []
            : trimAndRedistribute(si.nth_clusters as any[], nthMax);
          nthRestored = foldDistOnLoad(
            nthTrimmed.map((c: any) => ({ ...c, priority: normalizePriority(c.priority) })),
            _distRows.nth_questions,
          );
        }
        // LOAD-TIME DUPLICATE BACKSTOP: these clusters come straight from the
        // database, not from a fresh /generate-clusters or /refine-clusters
        // call, so they never passed through the guarantee those endpoints
        // give their own output — this can be historical data saved before a
        // dedup fix even existed. Re-run the same deterministic check (fails
        // open — returns the input unchanged on any error) before the
        // recruiter ever sees a stale duplicate re-appear on every visit.
        if (mthRestored.length > 0 || nthRestored.length > 0) {
          const cleaned = await aiInterviewService.dedupeClusters({
            mthClusters: mthRestored,
            nthClusters: nthRestored,
          });
          mthRestored = cleaned.mthClusters;
          nthRestored = cleaned.nthClusters;
        }
        if (mthRestored.length > 0) {
          setMthClusters(mthRestored);
          // Intentionally NOT auto-expanding — cluster cards stay collapsed by default per UX spec
        }
        if (nthRestored.length > 0) {
          setNthClusters(nthRestored);
          // Intentionally NOT auto-expanding — cluster cards stay collapsed by default per UX spec
        }
        // Open all clusters by default so AI-derived (sparkle) skills are
        // visible immediately. Otherwise users see only headers and think
        // refine produced nothing new.
        if (initialExpandIds.length > 0) {
          setExpandedIds(new Set(initialExpandIds));
        }
        // Restore skill weights
        if (si.skill_weights) {
          setSkillWeights(si.skill_weights as Record<string, 'high' | 'medium' | 'low'>);
        }

        // Restore recruiter-typed main-skill set (lowercase for matching).
        if (Array.isArray(si.mth_main_skills)) {
          setMthMainSkillSet(new Set(si.mth_main_skills.map((s: string) => s.toLowerCase().trim())));
        }
        if (Array.isArray(si.nth_main_skills)) {
          setNthMainSkillSet(new Set(si.nth_main_skills.map((s: string) => s.toLowerCase().trim())));
        }
        // Restore parent → sub_skills bindings — drives the hierarchical
        // (parent above, sub-skills nested) layout in the Skills pool.
        if (Array.isArray(si.mth_parent_groups)) {
          setMthParentGroupsState(si.mth_parent_groups);
        }
        if (Array.isArray(si.nth_parent_groups)) {
          setNthParentGroupsState(si.nth_parent_groups);
        }

        // Flexible mode: read interview_mode, finalization state, and JD description
        if (isFlexibleMode) {
          setIsFinalized(!!si.flexible_finalized);
        }
        if (si.jd_description) {
          setJdDescription(si.jd_description as string);
        }
      } catch (err) {
        toast.error('Failed to load interview configuration');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id, toSkillEntries]);

  /* ── Cluster management ── */
  const toggleExpand = useCallback((clusterId: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(clusterId)) next.delete(clusterId);
      else next.add(clusterId);
      return next;
    });
  }, []);

  const updateCluster = useCallback((category: 'mth' | 'nth', id: string, updates: Partial<Cluster>) => {
    const setter = category === 'mth' ? setMthClusters : setNthClusters;
    setter(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }, []);

  const removeCluster = useCallback((category: 'mth' | 'nth', id: string) => {
    // Floor validation: deleting a whole cluster strips every skill it holds, so
    // it can drop the section below its minimum just like a per-skill removal.
    // Enforce the same floor here (Fixed/timed mode only) — 15 for MHS alone,
    // 10/5 for MHS+NHS, 8/4 for MHS+NHS+HR (HR is never skill-validated).
    if (isFixed) {
      const clusters = category === 'mth' ? mthClusters : nthClusters;
      const questionCount = category === 'mth'
        ? (timedAllocation.mthQuestions ?? 0)
        : (nthEnabled ? (timedAllocation.nthQuestions ?? 0) : 0);
      const projectedUnique = new Set(
        clusters.flatMap(c => c.id === id ? [] : c.skills.map(s => s.toLowerCase()))
      ).size;
      if (questionCount > 0 && projectedUnique < questionCount) {
        const label = category === 'mth' ? 'Must-To-Have' : 'Nice-To-Have';
        toast.error(`Cannot delete — ${label} needs at least ${questionCount} unique skill(s) for ${questionCount} question(s).`);
        return;
      }
    }
    const setter = category === 'mth' ? setMthClusters : setNthClusters;
    setter(prev => prev.filter(c => c.id !== id));
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, [mthClusters, nthClusters, isFixed, timedAllocation, nthEnabled]);

  const reorderClusters = useCallback((category: 'mth' | 'nth', fromIndex: number, toIndex: number) => {
    const setter = category === 'mth' ? setMthClusters : setNthClusters;
    setter(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const moveSkillBetweenClusters = useCallback((category: 'mth' | 'nth', skillName: string, fromClusterId: string, toClusterId: string) => {
    const setter = category === 'mth' ? setMthClusters : setNthClusters;
    setter(prev => prev.map(c => {
      if (c.id === fromClusterId) {
        return { ...c, skills: c.skills.filter(s => s !== skillName) };
      }
      if (c.id === toClusterId) {
        if (c.skills.includes(skillName)) return c;
        return { ...c, skills: [...c.skills, skillName] };
      }
      return c;
    }));
  }, []);

  const removeSkillFromCluster = useCallback((skillName: string, clusterId: string) => {
    // Floor validation: each question needs at least 1 unique skill. If the
    // removal would drop unique-skill count below the question count for the
    // affected category, block it. Without this, a recruiter with 1 NTH skill
    // (expanded to 4) could delete back down to 1 — leaving 4 questions with
    // only 1 skill to cover them.
    const isInMth = mthClusters.some(c => c.id === clusterId);
    const isInNth = nthClusters.some(c => c.id === clusterId);
    if (isFixed) {
      if (isInMth) {
        const mthQ = timedAllocation.mthQuestions ?? 0;
        const projectedUnique = new Set(
          mthClusters.flatMap(c =>
            c.id === clusterId
              ? c.skills.filter(s => s !== skillName).map(s => s.toLowerCase())
              : c.skills.map(s => s.toLowerCase())
          )
        ).size;
        if (mthQ > 0 && projectedUnique < mthQ) {
          toast.error(`Cannot remove — Must-To-Have needs at least ${mthQ} unique skill(s) for ${mthQ} question(s).`);
          return;
        }
      }
      if (isInNth) {
        const nthQ = nthEnabled ? (timedAllocation.nthQuestions ?? 0) : 0;
        const projectedUnique = new Set(
          nthClusters.flatMap(c =>
            c.id === clusterId
              ? c.skills.filter(s => s !== skillName).map(s => s.toLowerCase())
              : c.skills.map(s => s.toLowerCase())
          )
        ).size;
        if (nthQ > 0 && projectedUnique < nthQ) {
          toast.error(`Cannot remove — Nice-To-Have needs at least ${nthQ} unique skill(s) for ${nthQ} question(s).`);
          return;
        }
      }
    }
    setMthClusters(prev => prev.map(c =>
      c.id === clusterId ? { ...c, skills: c.skills.filter(s => s !== skillName) } : c
    ));
    setNthClusters(prev => prev.map(c =>
      c.id === clusterId ? { ...c, skills: c.skills.filter(s => s !== skillName) } : c
    ));
  }, [mthClusters, nthClusters, isFixed, timedAllocation, nthEnabled]);

  const addCluster = useCallback((category: 'mth' | 'nth') => {
    const maxAllowed = category === 'mth' ? mthMaxClusters : nthMaxClusters;
    const current = category === 'mth' ? mthClusters : nthClusters;
    if (maxAllowed > 0 && current.length >= maxAllowed) {
      toast.error(`Maximum ${maxAllowed} clusters allowed for ${category === 'mth' ? 'Must-To-Have' : 'Nice-To-Have'} Skills`);
      return;
    }
    const newCluster: Cluster = {
      id: uid(),
      name: '',
      priority: 2,
      skills: [],
      reason: '',
    };
    const setter = category === 'mth' ? setMthClusters : setNthClusters;
    setter(prev => [...prev, newCluster]);
    setExpandedIds(prev => new Set(prev).add(newCluster.id));
  }, [mthMaxClusters, nthMaxClusters, mthClusters, nthClusters]);

  /* ── Skill pool management ── */
  const addSkillToCategory = useCallback((category: 'mth' | 'nth', skillName: string) => {
    const trimmed = skillName.trim();
    if (!trimmed) return;
    const setter = category === 'mth' ? setMthSkills : setNthSkills;
    const current = category === 'mth' ? mthSkills : nthSkills;
    const duplicate = current.some(s => s.name.toLowerCase() === trimmed.toLowerCase());
    if (duplicate) {
      toast.error(`"${trimmed}" is already in the ${category === 'mth' ? 'Must-To-Have' : 'Nice-To-Have'} skills list`);
      return;
    }
    setter(prev => [...prev, { name: trimmed, comment: '', type: 'Skill' }]);
    toast.success(`"${trimmed}" added`);
  }, [mthSkills, nthSkills]);

  const removeSkillFromPool = useCallback((category: 'mth' | 'nth', skillName: string) => {
    // Same floor validation as removeSkillFromCluster — pool removal also
    // strips the skill from every cluster in the category, so it's an even
    // bigger drop than a single-cluster removal.
    if (isFixed) {
      const clusters = category === 'mth' ? mthClusters : nthClusters;
      const questionCount = category === 'mth'
        ? (timedAllocation.mthQuestions ?? 0)
        : (nthEnabled ? (timedAllocation.nthQuestions ?? 0) : 0);
      const lower = skillName.toLowerCase();
      const projectedUnique = new Set(
        clusters.flatMap(c => c.skills.filter(s => s.toLowerCase() !== lower).map(s => s.toLowerCase()))
      ).size;
      if (questionCount > 0 && projectedUnique < questionCount) {
        const label = category === 'mth' ? 'Must-To-Have' : 'Nice-To-Have';
        toast.error(`Cannot remove — ${label} needs at least ${questionCount} unique skill(s) for ${questionCount} question(s).`);
        return;
      }
    }
    // Remove from skills list
    if (category === 'mth') {
      setMthSkills(prev => prev.filter(s => s.name !== skillName));
      // Also remove from all MTH clusters
      setMthClusters(prev => prev.map(c => ({
        ...c,
        skills: c.skills.filter(s => s.toLowerCase() !== skillName.toLowerCase()),
      })));
    } else {
      setNthSkills(prev => prev.filter(s => s.name !== skillName));
      setNthClusters(prev => prev.map(c => ({
        ...c,
        skills: c.skills.filter(s => s.toLowerCase() !== skillName.toLowerCase()),
      })));
    }
  }, [mthClusters, nthClusters, isFixed, timedAllocation, nthEnabled]);

  // Per-section "removal locked" flag. A section is locked once its unique
  // skill count is at (or below) its floor — at that point removing ANY skill
  // would drop it under the minimum, and since this page no longer lets you
  // add skills back (add is done on the Configure page), we hard-disable the
  // remove controls rather than letting the user delete into an invalid state.
  // Floor = the section's timed-mode question budget: 15 for MHS alone,
  // 10/5 for MHS+NHS, 8/4 for MHS+NHS+HR. HR is never skill-validated.
  const isSectionRemovalLocked = (category: 'mth' | 'nth'): boolean => {
    if (!isFixed) return false; // flexible mode has no fixed question budget → no floor
    const clusters = category === 'mth' ? mthClusters : nthClusters;
    const floor = category === 'mth'
      ? (timedAllocation.mthQuestions ?? 0)
      : (nthEnabled ? (timedAllocation.nthQuestions ?? 0) : 0);
    if (floor <= 0) return false;
    const uniqueCount = new Set(
      clusters.flatMap(c => c.skills.map(s => s.toLowerCase()))
    ).size;
    return uniqueCount <= floor;
  };
  const mthRemovalLocked = isSectionRemovalLocked('mth');
  const nthRemovalLocked = isSectionRemovalLocked('nth');

  /* ── AI Generate ── */
  const handleGenerateClusters = async (opts: { forceExpand?: boolean } = {}) => {
    const { forceExpand = false } = opts;
    setGenerating(true);
    try {
      // Sort skills by importance weight so AI prioritizes them in clustering
      const weightOrder = { high: 0, medium: 1, low: 2 };
      const sortedMth = [...mthSkills].sort(
        (a, b) => (weightOrder[skillWeights[a.name] ?? 'medium']) - (weightOrder[skillWeights[b.name] ?? 'medium'])
      );
      const sortedNth = [...nthSkills].sort(
        (a, b) => (weightOrder[skillWeights[a.name] ?? 'medium']) - (weightOrder[skillWeights[b.name] ?? 'medium'])
      );
      let mthSkillNames = sortedMth.map(s => s.name.trim()).filter(Boolean);
      let nthSkillNames = sortedNth.map(s => s.name.trim()).filter(Boolean);

      // Snapshot the recruiter-typed "main" skills BEFORE any AI expansion.
      // Used by the chip rendering to highlight original recruiter intent.
      let preExpansionMth = mthSkillNames.slice();
      let preExpansionNth = nthSkillNames.slice();

      if (mthSkillNames.length === 0 && nthSkillNames.length === 0) {
        toast.error('Add at least one skill before generating clusters');
        return;
      }

      // [DEBUG] Inputs at start of Generate flow
      console.log('[CLUSTER-DEBUG] === Generate Clusters START ===', {
        isFixed,
        isFlexible,
        nthEnabled,
        mthInputSkillsCount: mthSkillNames.length,
        nthInputSkillsCount: nthSkillNames.length,
        mthQuestions: timedAllocation.mthQuestions,
        nthQuestions: timedAllocation.nthQuestions,
        mthMaxClusters,
        nthMaxClusters,
        timedAllocation,
      });

      // Capacity bands per spec: each interview question covers 2-3 related skills.
      //   below   (input < 2Q)   → expand (Phase 0) + refine in preserve-names mode
      //   within  (2Q ≤ input ≤ 3Q) → no refinement
      //   exceeds (input > 3Q)  → refine WITHOUT preserve-names (allow merging
      //                            via equivalent-skill normalization)
      let mthExpanded: SkillEntry[] | null = null;
      let nthExpanded: SkillEntry[] | null = null;
      // AIU99 AC 8 — persisted alongside the clusters so the verdict survives a
      // reload and the recruiter can still see why their skill list shrank.
      let capacityReport: ClusterCapacityReport | undefined;
      let applyRefine = false;
      // When true, refine is allowed to MERGE/RENAME skills (overflow case).
      // When false (expansion case), refine must preserve recruiter input verbatim.
      let allowMerge = false;
      // Capture parent → sub_skills bindings from /expand-skills so the
      // backend can keep each parent's family in a single cluster (and
      // repair any LLM mis-routing deterministically). Seed from previously
      // saved special_instructions so subsequent "Regenerate" clicks (which
      // skip expansion because skills are already at target count) still
      // pass the parent grouping to the backend.
      const savedSi = (() => {
        try { return JSON.parse(config?.special_instructions || '{}'); }
        catch { return {}; }
      })();
      let mthParentGroups: { parent: string; sub_skills: string[] }[] | undefined =
        Array.isArray(savedSi.mth_parent_groups) && savedSi.mth_parent_groups.length > 0
          ? savedSi.mth_parent_groups
          : undefined;
      let nthParentGroups: { parent: string; sub_skills: string[] }[] | undefined =
        Array.isArray(savedSi.nth_parent_groups) && savedSi.nth_parent_groups.length > 0
          ? savedSi.nth_parent_groups
          : undefined;
      if (isFixed) {
        const mthQ = timedAllocation.mthQuestions ?? 0;
        const nthQ = nthEnabled ? (timedAllocation.nthQuestions ?? 0) : 0;
        const mthMainList = Array.isArray(savedSi.mth_main_skills) ? (savedSi.mth_main_skills as string[]) : [];
        const nthMainList = Array.isArray(savedSi.nth_main_skills) ? (savedSi.nth_main_skills as string[]) : [];

        // Floor = 2 × Q (below → expand). Ceiling = 3 × Q (above → merge/refine).
        // Trigger expand when recruiter input is below the absolute minimum
        // (1 skill per question). LLM decides actual count from JD; we no
        // longer use a hardcoded 2Q floor target — that was forcing a fixed
        // math relationship the spec rejects.
        // forceExpand=true (initial autogen on entry from Configure) bypasses
        // the gate so the expansion API runs even when the closure state still
        // shows old skill counts. Without this, recruiters arriving at the
        // Clusters page with e.g. 2 NTH skills can hit the page-load race and
        // see the cluster generated without sub-skill expansion — they would
        // then have to click "Regenerate with AI" manually to expand.
        const mthShort = forceExpand
          ? (mthSkillNames.length > 0 && mthQ > 0)
          : (mthSkillNames.length > 0 && mthQ > 0 && mthSkillNames.length < mthQ);
        // NTH expands whenever there is 1+ NTH skill (regardless of nthQ).
        // MTH keeps the stricter "skills < questions" rule.
        const nthShort = forceExpand
          ? (nthSkillNames.length >= 1 && nthEnabled)
          : (nthSkillNames.length >= 1 && nthQ > 0);
        const mthOverflow = mthSkillNames.length > 0 && mthQ > 0 && mthSkillNames.length > mthQ * 3;
        const nthOverflow = nthSkillNames.length > 0 && nthQ > 0 && nthSkillNames.length > nthQ * 3;

        // Recovery trigger: we already have current skills at target (so mthShort
        // is false), BUT we lack saved parent_groups AND have a smaller main_skills
        // list. That's the legacy state — re-expand from main_skills to recover
        // the parent → sub_skills bindings, otherwise the backend can't repair
        // cross-family mis-routing.
        const mthRecover = !mthShort && !mthParentGroups && mthMainList.length > 0
          && mthQ > 0 && mthMainList.length < mthQ;
        const nthRecover = !nthShort && !nthParentGroups && nthMainList.length > 0
          && nthQ > 0 && nthMainList.length < nthQ;

        // [DEBUG] Capacity gate evaluation
        console.log('[CLUSTER-DEBUG] Capacity gate (Fixed mode):', {
          mthQ,
          nthQ,
          mthFloor_1Q: mthQ,
          nthFloor_1Q: nthQ,
          mthInputCount: mthSkillNames.length,
          nthInputCount: nthSkillNames.length,
          mthShort,
          nthShort,
          mthOverflow,
          nthOverflow,
          mthRecover,
          nthRecover,
          willExpand: mthShort || nthShort || mthRecover || nthRecover,
          willOverflowRefine: !(mthShort || nthShort || mthRecover || nthRecover) && (mthOverflow || nthOverflow),
        });

        // Pick the right input for each bucket: main_skills for recovery,
        // current names for fresh expansion.
        const mthExpandInput = mthRecover ? mthMainList : mthSkillNames;
        const nthExpandInput = nthRecover ? nthMainList : nthSkillNames;

        if (mthShort || nthShort || mthRecover || nthRecover) {
          console.log('[CLUSTER-DEBUG] → Taking EXPAND path (applyRefine=true, allowMerge=false)');
          // Target = Q (1 skill-per-question FLOOR). Respect recruiter input:
          // the backend early-returns WITHOUT expanding when input >= target
          // (ai_interview.py:1231), so a recruiter who already typed >= Q skills
          // is left untouched. Expansion now only fills genuinely under-skilled
          // buckets (input < Q) up to 1 skill/question.
          //
          // Previously this was max(Q*2, input+1), which over-expanded two ways:
          //   (a) the Q*2 term set a 2-skill/Q floor, and
          //   (b) the `input + 1` term forced target > input, so the backend's
          //       "already enough" early-return could NEVER fire — expansion
          //       always grew the pool.
          // Net effect (logged): 15 MTH skills / 8 Q ballooned to 31 (refine
          // "exceeds" ceiling=24), and 8 NTH skills / 4 Q grew to 10. With a
          // bare Q target, 15 >= 8 and 8 >= 4, so both pass through unchanged.
          const mthTarget = mthQ;
          const nthTarget = nthQ;
          // Pass the other bucket's already-typed skills so the LLM does
          // not pull them into THIS bucket (e.g. Git typed in NTH must not
          // be absorbed into MTH expansion).
          const mthOtherBucket = nthSkillNames;
          // Symmetric: NHS's other bucket is the MTH seed skills. (This was
          // referenced below as `nthOtherBucket` but never defined → the
          // "nthOtherBucket is not defined" ReferenceError that crashed
          // handleGenerateClusters.)
          const nthOtherBucket = mthSkillNames;
          // SEQUENTIAL expansion (2026-08-01) — NOT Promise.all. Expanding both
          // buckets in parallel let each one only see the OTHER bucket's ORIGINAL
          // seed skills, so MHS coined "Familiarity with API testing" while NHS
          // independently coined "API Testing" — the same skill, worded two ways,
          // in both buckets (recruiter-reported after Regenerate). We now expand
          // MHS FIRST, then feed MHS's FULL EXPANDED list into NHS's exclusion set
          // so NHS never generates a variant of a skill MHS already produced.
          const mthExpandRes = (mthShort || mthRecover)
            ? await aiInterviewService.expandSkills({
                mainSkills: mthExpandInput,
                targetSkillCount: mthTarget,
                bucket: 'MTH',
                jdTitle: config?.position,
                jdDescription: jdDescription || undefined,
                otherBucketSkills: mthOtherBucket,
              })
            : { flat_skills: mthSkillNames, expanded_skills: [] as { parent: string; sub_skills: string[] }[] };
          // NHS exclusion = the OTHER bucket's now-EXPANDED MHS skills (not just
          // the seed), deduped, so a paraphrase can't be re-invented here.
          const nthOtherBucketExpanded = Array.from(new Set([
            ...nthOtherBucket,
            ...(mthExpandRes.flat_skills || []),
          ].map(s => s.trim()).filter(Boolean)));
          const nthExpandRes = (nthShort || nthRecover)
            ? await aiInterviewService.expandSkills({
                mainSkills: nthExpandInput,
                targetSkillCount: nthTarget,
                bucket: 'NTH',
                jdTitle: config?.position,
                jdDescription: jdDescription || undefined,
                otherBucketSkills: nthOtherBucketExpanded,
              })
            : { flat_skills: nthSkillNames, expanded_skills: [] as { parent: string; sub_skills: string[] }[] };
          const buildEntries = (existing: SkillEntry[], names: string[]): SkillEntry[] => {
            const byName = new Map(existing.map(e => [e.name.toLowerCase(), e]));
            return names.map(n => byName.get(n.toLowerCase()) ?? { name: n, comment: '', type: 'Skill' as SkillType });
          };
          if ((mthShort || mthRecover) && mthExpandRes.flat_skills.length > 0) {
            mthExpanded = buildEntries(mthSkills, mthExpandRes.flat_skills);
            mthSkillNames = mthExpanded.map(s => s.name.trim()).filter(Boolean);
            if (mthExpandRes.expanded_skills?.length) {
              mthParentGroups = mthExpandRes.expanded_skills;
            }
          }
          if ((nthShort || nthRecover) && nthExpandRes.flat_skills.length > 0) {
            nthExpanded = buildEntries(nthSkills, nthExpandRes.flat_skills);
            nthSkillNames = nthExpanded.map(s => s.name.trim()).filter(Boolean);
            if (nthExpandRes.expanded_skills?.length) {
              nthParentGroups = nthExpandRes.expanded_skills;
            }
          }
          applyRefine = true;
          allowMerge = false;
        }

        // Always call refine in Fixed mode so the LLM gets a chance to decide
        // (Within / Exceeds / Below). If we already triggered expansion above,
        // keep preserve-names semantics. Otherwise let LLM merge if it judges
        // Scenario 2 applies.
        applyRefine = true;
        if (!(mthShort || nthShort || mthRecover || nthRecover)) {
          allowMerge = true;
        }
        // Override: any bucket over ceiling MUST be merged, even when the
        // other bucket triggered expansion. Backend merge loop is per-bucket
        // (only the over-ceiling bucket gets compressed); the expanded bucket
        // is unaffected because its _over flag stays false.
        if (mthOverflow || nthOverflow) {
          allowMerge = true;
        }
      }
      console.log('[CLUSTER-DEBUG] Final gate result (LLM-decided scenario):', { applyRefine, allowMerge, isFixed });

      // Build {skillName: type} maps so the backend can keep [Command]
      // skills in separate clusters. Source of truth is the per-row
      // dropdown the recruiter set on the Skills step.
      const buildTypesMap = (entries: SkillEntry[]): Record<string, string> => {
        const out: Record<string, string> = {};
        for (const e of entries) {
          if (e?.name) out[e.name] = e.type ?? 'Skill';
        }
        return out;
      };
      const mthTypesMap = buildTypesMap(mthSkills);
      const nthTypesMap = nthSkillNames.length > 0 ? buildTypesMap(nthSkills) : undefined;

      console.log('[CLUSTER-DEBUG] Calling /generate-clusters with:', {
        mthSkillCount: mthSkillNames.length,
        nthSkillCount: nthSkillNames.length,
        mthMaxClusters,
        nthMaxClusters: nthSkillNames.length > 0 ? nthMaxClusters : 0,
      });
      const result = await aiInterviewService.generateClusters(
        mthSkillNames,
        nthSkillNames,
        config?.position,
        jdDescription || undefined,
        fixedMthMin,
        nthSkillNames.length > 0 ? fixedNthMin : 0,
        mthMaxClusters,
        nthSkillNames.length > 0 ? nthMaxClusters : 0,
        mthParentGroups,
        nthSkillNames.length > 0 ? nthParentGroups : undefined,
        mthTypesMap,
        nthTypesMap,
        // Domain context: the backend resolves job_descriptions.industry_type from
        // this id so the clustering + dedup prompts judge skills inside the right
        // industry instead of defaulting to a software rubric.
        { jdId: config?.jd_id || undefined },
      );
      console.log('[CLUSTER-DEBUG] /generate-clusters response:', {
        mthClusterCount: result.mth_clusters?.length ?? 0,
        nthClusterCount: result.nth_clusters?.length ?? 0,
        mthSkillsTotal: (result.mth_clusters ?? []).reduce((s, c) => s + (c.skills?.length ?? 0), 0),
        nthSkillsTotal: (result.nth_clusters ?? []).reduce((s, c) => s + (c.skills?.length ?? 0), 0),
        mthClusters: (result.mth_clusters ?? []).map(c => ({ name: c.name, priority: c.priority, skillCount: c.skills?.length ?? 0 })),
        nthClusters: (result.nth_clusters ?? []).map(c => ({ name: c.name, priority: c.priority, skillCount: c.skills?.length ?? 0 })),
      });
      // The backend's gpt-4o dedup pass dropped these as meaning-duplicates.
      // Remove them from the recruiter's main-skill list and snapshot too, so
      // Configure stops showing (and re-sending) the pair — otherwise every
      // regeneration re-judged it, and the model could drop the other side.
      const removedDupes = result.removed_duplicates ?? [];
      const removedMthKeys = new Set(
        removedDupes.filter(d => d.bucket === 'mth').map(d => d.skill.toLowerCase().trim()),
      );
      const removedNthKeys = new Set(
        removedDupes.filter(d => d.bucket === 'nth').map(d => d.skill.toLowerCase().trim()),
      );
      const keepMth = (name: string) => !removedMthKeys.has(name.toLowerCase().trim());
      const keepNth = (name: string) => !removedNthKeys.has(name.toLowerCase().trim());
      if (removedDupes.length > 0) {
        preExpansionMth = preExpansionMth.filter(keepMth);
        preExpansionNth = preExpansionNth.filter(keepNth);
        mthSkillNames = mthSkillNames.filter(keepMth);
        nthSkillNames = nthSkillNames.filter(keepNth);
        if (mthExpanded) mthExpanded = mthExpanded.filter(e => keepMth(e.name));
        if (nthExpanded) nthExpanded = nthExpanded.filter(e => keepNth(e.name));
        toast.info(
          removedDupes.length === 1
            ? `Removed duplicate skill "${removedDupes[0].skill}" (same as "${removedDupes[0].kept}")`
            : `Removed ${removedDupes.length} duplicate skills: ${removedDupes
                .map(d => `"${d.skill}" (same as "${d.kept}")`).join(', ')}`,
        );
      }

      let newMthClusters: Cluster[] = mthSkillNames.length > 0 && result.mth_clusters
        ? (() => {
            const mthRaw = result.mth_clusters;
            const mthFinal = mthMaxClusters > 0 ? mthRaw.slice(0, mthMaxClusters) : mthRaw;
            return mthFinal.map(c => ({
              ...c,
              priority: normalizePriority(c.priority),
              reason: c.reason || '',
            }));
          })()
        : [];

      let newNthClusters: Cluster[] = nthSkillNames.length > 0 && result.nth_clusters
        ? (() => {
            const nthRaw = result.nth_clusters;
            const nthFinal = nthMaxClusters > 0 ? nthRaw.slice(0, nthMaxClusters) : nthRaw;
            return nthFinal.map(c => ({
              ...c,
              priority: normalizePriority(c.priority),
              reason: c.reason || '',
            }));
          })()
        : [];

      // Phase 2: Refine in PRESERVE-NAMES mode — applies the relevance +
      // question-limit rules without renaming/merging skills. Triggered
      // after expansion or input overflow. Best-effort: keep raw clusters
      // on failure.
      console.log('[CLUSTER-DEBUG] Refine gate check:', {
        applyRefine,
        newMthClusterCount: newMthClusters.length,
        newNthClusterCount: newNthClusters.length,
        willCallRefine: applyRefine && (newMthClusters.length > 0 || newNthClusters.length > 0),
      });
      if (applyRefine && (newMthClusters.length > 0 || newNthClusters.length > 0)) {
        console.log('[CLUSTER-DEBUG] → Calling /refine-clusters', {
          preserveSkillNames: !allowMerge,
          mthQuestions: timedAllocation.mthQuestions ?? 0,
          nthQuestions: nthEnabled ? (timedAllocation.nthQuestions ?? 0) : 0,
        });
        try {
          // Pull recruiter-set per-Q seconds from saved special_instructions
          // (Configure page writes it as `per_question_seconds`). Refine uses
          // this instead of a hardcoded "2 minutes" string in its LLM prompt.
          let _perQSeconds: number | undefined;
          try {
            const _si = JSON.parse(config?.special_instructions || '{}');
            if (typeof _si.per_question_seconds === 'number') {
              _perQSeconds = _si.per_question_seconds;
            }
          } catch { /* noop */ }
          const refineResult = await aiInterviewService.refineClusters({
            mthClusters: newMthClusters,
            nthClusters: nthEnabled ? newNthClusters : [],
            mthQuestions: timedAllocation.mthQuestions ?? 0,
            nthQuestions: nthEnabled ? (timedAllocation.nthQuestions ?? 0) : 0,
            mthMaxClusters,
            nthMaxClusters: nthEnabled ? nthMaxClusters : 0,
            jdTitle: config?.position,
            jdDescription: jdDescription || undefined,
            // Expansion path → preserve recruiter-typed names verbatim.
            // Overflow path → allow merging via equivalent-skill normalization.
            preserveSkillNames: !allowMerge,
            mthParentGroups,
            nthParentGroups: nthEnabled ? nthParentGroups : undefined,
            // Per-skill type so refine keeps Commands separate.
            mthSkillTypes: mthTypesMap,
            nthSkillTypes: nthTypesMap,
            // Real time-budget signals so the LLM judges capacity against
            // the recruiter's actual configuration, not a baked-in 2min/Q.
            perQuestionSeconds: _perQSeconds,
            mthTimeMin: fixedMthMin,
            nthTimeMin: nthEnabled ? fixedNthMin : 0,
            // Same domain context as generate-clusters.
            jdId: config?.jd_id || undefined,
            // AIU99 AC 2 — the recruiter's own lists, captured before expansion
            // ran. Without these the backend can only judge the topped-up list
            // and "Below Capacity" could never be reported to anyone.
            mthInputSkills: preExpansionMth,
            nthInputSkills: nthEnabled ? preExpansionNth : [],
          });
          console.log('[CLUSTER-DEBUG] /refine-clusters response:', {
            mthClusterCount: refineResult.mth_clusters?.length ?? 0,
            nthClusterCount: refineResult.nth_clusters?.length ?? 0,
            mthSkillsTotal: (refineResult.mth_clusters ?? []).reduce((s, c) => s + (c.skills?.length ?? 0), 0),
            nthSkillsTotal: (refineResult.nth_clusters ?? []).reduce((s, c) => s + (c.skills?.length ?? 0), 0),
            mthClusters: (refineResult.mth_clusters ?? []).map(c => ({ name: c.name, priority: c.priority, skillCount: c.skills?.length ?? 0 })),
            nthClusters: (refineResult.nth_clusters ?? []).map(c => ({ name: c.name, priority: c.priority, skillCount: c.skills?.length ?? 0 })),
          });
          if (refineResult.mth_clusters?.length) {
            newMthClusters = refineResult.mth_clusters.map(c => ({
              ...c,
              priority: normalizePriority(c.priority),
              reason: c.reason || '',
            }));
          }
          if (nthEnabled && refineResult.nth_clusters?.length) {
            newNthClusters = refineResult.nth_clusters.map(c => ({
              ...c,
              priority: normalizePriority(c.priority),
              reason: c.reason || '',
            }));
          }
          // AIU99 AC 2 / AC 8 — the verdict was always computed server-side and
          // always thrown away here, so a recruiter whose 52 skills became 28
          // was never told. Keep it for persistence and tell them what happened.
          if (refineResult.capacity) {
            capacityReport = refineResult.capacity;
            reportCapacityToRecruiter(refineResult.capacity);
          }
        } catch (refineErr) {
          // Non-fatal — keep raw generated clusters
          console.error('[CLUSTER-DEBUG] /refine-clusters FAILED — keeping raw generate output', refineErr);
        }
      } else {
        console.log('[CLUSTER-DEBUG] → Refine SKIPPED');
      }

      // Frontend skill-ceiling trim REMOVED per spec — LLM decides the count
      // based on JD complexity; no hard 3Q cap is enforced. The backend's
      // refine endpoint owns capacity judgment now. Recruiter trusts the AI's
      // decision to preserve all input skills when JD warrants it.
      const mthQ = isFixed ? (timedAllocation.mthQuestions ?? 0) : 0;
      const nthQ = isFixed && nthEnabled ? (timedAllocation.nthQuestions ?? 0) : 0;
      const mthAfterTrim = newMthClusters.reduce((s, c) => s + c.skills.length, 0);
      const nthAfterTrim = newNthClusters.reduce((s, c) => s + c.skills.length, 0);
      console.log('[CLUSTER-DEBUG] enforceSkillCeiling: REMOVED (LLM-decided)', {
        mthQ,
        nthQ,
        mthFinalSkills: mthAfterTrim,
        nthFinalSkills: nthAfterTrim,
        note: 'No frontend trim — backend refine owns capacity judgment',
      });
      console.log('[CLUSTER-DEBUG] === FINAL clusters being committed to UI ===', {
        mthClusterCount: newMthClusters.length,
        nthClusterCount: newNthClusters.length,
        mthSkillsTotal: mthAfterTrim,
        nthSkillsTotal: nthAfterTrim,
        mthClusters: newMthClusters.map(c => ({ name: c.name, priority: c.priority, skillCount: c.skills.length })),
        nthClusters: newNthClusters.map(c => ({ name: c.name, priority: c.priority, skillCount: c.skills.length })),
      });

      // Commit expanded skills to UI state so the user sees them on the page
      if (mthExpanded) setMthSkills(mthExpanded);
      if (nthExpanded) setNthSkills(nthExpanded);
      if (removedMthKeys.size) setMthSkills(prev => prev.filter(e => keepMth(e.name)));
      if (removedNthKeys.size) setNthSkills(prev => prev.filter(e => keepNth(e.name)));
      setMthClusters(newMthClusters);
      setNthClusters(newNthClusters);
      // Cluster cards stay collapsed by default per UX spec — recruiter
      // opens individual clusters they want to inspect. Generated AI-merged
      // skills are still discoverable via the cluster header counts.
      setExpandedIds(new Set());

      // Auto-save generated clusters immediately so they survive a page refresh.
      // We use the local vars (not state) because setState is async and hasn't updated yet.
      if (config && id) {
        try {
          const si = JSON.parse(config.special_instructions || '{}');
          si.mth_clusters = newMthClusters;
          si.nth_clusters = nthEnabled ? newNthClusters : [];
          // Backfill recruiter-typed "main" skills if Configure didn't already
          // capture them. Set ONCE — preserves the original recruiter intent
          // across regenerations.
          if (!Array.isArray(si.mth_main_skills) || si.mth_main_skills.length === 0) {
            si.mth_main_skills = preExpansionMth;
            setMthMainSkillSet(new Set(preExpansionMth.map(s => s.toLowerCase().trim())));
          }
          if (!Array.isArray(si.nth_main_skills) || si.nth_main_skills.length === 0) {
            si.nth_main_skills = nthEnabled ? preExpansionNth : [];
            setNthMainSkillSet(new Set((nthEnabled ? preExpansionNth : []).map(s => s.toLowerCase().trim())));
          }
          // Main skills saved by Configure still hold the pair the dedup just
          // resolved — strip the removed side so it doesn't come back.
          if (removedDupes.length > 0) {
            if (Array.isArray(si.mth_main_skills)) {
              si.mth_main_skills = (si.mth_main_skills as string[]).filter(keepMth);
              setMthMainSkillSet(new Set((si.mth_main_skills as string[]).map(s => s.toLowerCase().trim())));
            }
            if (Array.isArray(si.nth_main_skills)) {
              si.nth_main_skills = (si.nth_main_skills as string[]).filter(keepNth);
              setNthMainSkillSet(new Set((si.nth_main_skills as string[]).map(s => s.toLowerCase().trim())));
            }
          }
          // Persist parent → sub_skills bindings so subsequent "Regenerate"
          // clicks (which skip expansion when skills are already at target)
          // can still hand the grouping to the backend for cross-family repair.
          // Also push to component state so the hierarchical Skills pool
          // re-renders without a page reload.
          if (mthParentGroups && mthParentGroups.length > 0) {
            si.mth_parent_groups = mthParentGroups;
            setMthParentGroupsState(mthParentGroups);
          }
          if (nthEnabled && nthParentGroups && nthParentGroups.length > 0) {
            si.nth_parent_groups = nthParentGroups;
            setNthParentGroupsState(nthParentGroups);
          }

          // Snapshot the inputs that drove THIS generation so Configure can
          // detect any meaningful change on next visit and trigger regen.
          //
          // CRITICAL: snapshot stores MAIN skills (recruiter-typed) only —
          // NOT the post-expansion list. Configure only displays main skills,
          // so its diff check sees only main skills. If we snapshot the full
          // expanded list (e.g. 30 skills after expansion), Configure's 2
          // recruiter-typed skills won't match → false regen on every visit.
          si.mth_questions_snapshot = isFixed ? (timedAllocation.mthQuestions ?? 0) : 0;
          si.nth_questions_snapshot = isFixed && nthEnabled ? (timedAllocation.nthQuestions ?? 0) : 0;
          // Use preExpansionMth/Nth — captured before any expansion API call.
          si.mth_skills_snapshot = preExpansionMth;
          si.nth_skills_snapshot = nthEnabled ? preExpansionNth : [];
          // Types map only for main skills (lookup comes from current state,
          // which still has the original type tags from the recruiter UI).
          const buildTypesForMains = (mainList: string[], allEntries: SkillEntry[]): Record<string, string> => {
            const byName = new Map(allEntries.map(e => [e.name.toLowerCase().trim(), e.type ?? 'Skill']));
            const out: Record<string, string> = {};
            for (const name of mainList) {
              out[name.toLowerCase().trim()] = byName.get(name.toLowerCase().trim()) ?? 'Skill';
            }
            return out;
          };
          si.mth_skill_types_snapshot = buildTypesForMains(preExpansionMth, mthSkills);
          si.nth_skill_types_snapshot = nthEnabled
            ? buildTypesForMains(preExpansionNth, nthSkills)
            : {};
          si.nth_enabled_snapshot = nthEnabled;
          si.hr_enabled_snapshot = hrEnabled;
          // AIU99 AC 8 — persist the refinement verdict. Without this the only
          // record that 52 skills became 28 is a server log line.
          if (capacityReport) si.cluster_capacity = capacityReport;

          // Also update rounds_config topics/weights using the new cluster data
          const PRIORITY_WEIGHT: Record<number, number> = { 3: 60, 2: 40, 1: 20 };
          const buildTopicTimeMap = (clusters: Cluster[], totalMin: number): Record<string, number> => {
            if (clusters.length === 0 || totalMin <= 0) return {};
            const totalWeight = clusters.reduce((s, c) => s + c.priority, 0);
            if (totalWeight <= 0) return {};
            const res: Record<string, number> = {};
            let remaining = totalMin;
            const sorted = [...clusters].sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));
            sorted.forEach((c, i) => {
              const mins = i === sorted.length - 1
                ? remaining
                : Math.round((c.priority / totalWeight) * totalMin);
              res[c.name] = Math.max(1, mins);
              remaining -= res[c.name];
            });
            return res;
          };
          // Persist expanded skills into rounds_config (jd_skills stays as
          // original recruiter input; new sub-skills go into custom_skills).
          const splitForRound = (entries: SkillEntry[], jdSet: Set<string>) => {
            const jd: string[] = [];
            const custom: string[] = [];
            entries.forEach(s => {
              if (jdSet.has(s.name.toLowerCase())) jd.push(s.name);
              else custom.push(s.name);
            });
            return { jd_skills: jd, custom_skills: custom };
          };
          const rounds = [...(config.rounds_config ?? [])];
          const mthIdx = rounds.findIndex((r: any) => r.type === 'must_have_skills' || r.type === 'must_have');
          if (mthIdx >= 0 && newMthClusters.length > 0) {
            const topics = newMthClusters.map(c => c.name);
            const topic_weights: Record<string, number> = {};
            newMthClusters.forEach(c => { topic_weights[c.name] = PRIORITY_WEIGHT[c.priority] || 40; });
            const mthExtra = mthExpanded
              ? splitForRound(mthExpanded, jdMthSkillNamesRef.current)
              : null;
            rounds[mthIdx] = {
              ...rounds[mthIdx],
              topics,
              topic_weights,
              topic_time_minutes: buildTopicTimeMap(newMthClusters, fixedMthMin),
              ...(mthExtra ? { jd_skills: mthExtra.jd_skills, custom_skills: mthExtra.custom_skills } : {}),
            };
          }
          const nthIdx = rounds.findIndex((r: any) => r.type === 'nice_to_have_skills' || r.type === 'nice_to_have');
          if (nthIdx >= 0 && nthEnabled && newNthClusters.length > 0) {
            const topics = newNthClusters.map(c => c.name);
            const topic_weights: Record<string, number> = {};
            newNthClusters.forEach(c => { topic_weights[c.name] = PRIORITY_WEIGHT[c.priority] || 40; });
            const nthExtra = nthExpanded
              ? splitForRound(nthExpanded, jdNthSkillNamesRef.current)
              : null;
            rounds[nthIdx] = {
              ...rounds[nthIdx],
              topics,
              topic_weights,
              topic_time_minutes: buildTopicTimeMap(newNthClusters, fixedNthMin),
              ...(nthExtra ? { jd_skills: nthExtra.jd_skills, custom_skills: nthExtra.custom_skills } : {}),
            };
          }
          // Without expansion the round keeps its old skill lists — drop the
          // dedup's removed side there as well.
          const stripRound = (idx: number, keep: (n: string) => boolean) => {
            if (idx < 0) return;
            const r: any = rounds[idx];
            rounds[idx] = {
              ...r,
              ...(Array.isArray(r.jd_skills) ? { jd_skills: r.jd_skills.filter((n: any) => typeof n !== 'string' || keep(n)) } : {}),
              ...(Array.isArray(r.custom_skills) ? { custom_skills: r.custom_skills.filter((n: any) => typeof n !== 'string' || keep(n)) } : {}),
            };
          };
          if (removedMthKeys.size) stripRound(mthIdx, keepMth);
          if (removedNthKeys.size) stripRound(nthIdx, keepNth);

          // ── Compute the AI skill→question distribution ONCE, here at
          // generation time, and persist it to si.skill_distribution. This is
          // the SINGLE source of truth the distribution preview (this page),
          // the post-publish "View Skill Clusters" popover, the details page,
          // AND the runtime all read. Previously this ran only at finalize, so
          // the generation-time preview showed a DIVERGENT local distribute()
          // layout — the create-vs-publish mismatch recruiters reported.
          // saveAndNavigate(finalize) now REUSES whatever we save here.
          if (isFixed) {
            try {
              const _mthQs = timedAllocation.mthQuestions ?? 0;
              const _nthQs = (nthEnabled ? (timedAllocation.nthQuestions ?? 0) : 0);
              if (_mthQs > 0 || _nthQs > 0) {
                const _mthExclude = new Set(
                  newNthClusters.flatMap(c => c.skills ?? [])
                    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
                    .map(s => s.toLowerCase()),
                );
                const _nthExclude = new Set(
                  newMthClusters.flatMap(c => c.skills ?? [])
                    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
                    .map(s => s.toLowerCase()),
                );
                // SELF-exclusion (distinct from `_mthExclude`/`_nthExclude` above,
                // which guard against the OTHER bucket): `mthSkills`/`nthSkills`
                // and the JD's own skill lists are the RAW, pre-dedup Configure
                // state — they still contain whatever generate/refine's backstop
                // just correctly dropped (e.g. a bundle phrase once its members
                // are confirmed present). Pooling them unfiltered handed
                // /distribute-skills' LLM the removed duplicate as a candidate,
                // which then re-entered via `foldDistIntoClusters` below —
                // reintroducing exactly what the backend just cleaned up. Filter
                // each raw candidate against the bucket's OWN already-deduped
                // cluster skills (semantic check, not exact string) before it
                // ever reaches the pool.
                const _mthOwnSkills = newMthClusters.flatMap(c => c.skills ?? [])
                  .filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
                const _nthOwnSkills = newNthClusters.flatMap(c => c.skills ?? [])
                  .filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
                const _mthJdPool = Array.from(new Set([
                  ..._mthOwnSkills,
                  ...mthSkills.map(s => s.name),
                  ...(((config as any).jd_must_have_skills as string[] | undefined) || []),
                ].filter((s): s is string =>
                  typeof s === 'string' && s.trim().length > 0 && !_mthExclude.has(s.toLowerCase())
                  // `mthSkills` is still the pre-dedup state here; a meaning-
                  // duplicate /generate-clusters removed shares no words with
                  // its survivor, so closestDuplicate can't catch it — drop it
                  // by name or the distributor re-assigns it to a question.
                  && keepMth(s)
                  && (_mthOwnSkills.includes(s) || !closestDuplicate(_mthOwnSkills.map(n => ({ name: n })), k => k.name, s))
                )));
                const _nthJdPool = Array.from(new Set([
                  ..._nthOwnSkills,
                  ...nthSkills.map(s => s.name),
                  ...(((config as any).jd_nice_to_have_skills as string[] | undefined) || []),
                ].filter((s): s is string =>
                  typeof s === 'string' && s.trim().length > 0 && !_nthExclude.has(s.toLowerCase())
                  && keepNth(s)
                  && (_nthOwnSkills.includes(s) || !closestDuplicate(_nthOwnSkills.map(n => ({ name: n })), k => k.name, s))
                )));
                const dist = await aiInterviewService.distributeSkills({
                  mthClusters: newMthClusters.map(c => ({ id: c.id, name: c.name, priority: c.priority, skills: c.skills })),
                  nthClusters: nthEnabled ? newNthClusters.map(c => ({ id: c.id, name: c.name, priority: c.priority, skills: c.skills })) : [],
                  mthQuestions: _mthQs,
                  nthQuestions: _nthQs,
                  jdTitle: config.jd_title,
                  jdDescription: (config as any).jd_description,
                  mthJdSkillPool: _mthJdPool,
                  nthJdSkillPool: nthEnabled ? _nthJdPool : [],
                });
                si.skill_distribution = {
                  mth_questions: dist.mth_questions || [],
                  nth_questions: dist.nth_questions || [],
                  generated_at: new Date().toISOString(),
                };

                // ── Sync clusters ⇐ distribution ──────────────────────────
                // The distribution can introduce JD-pool skills (e.g. Canva,
                // WordPress) that were NOT in the clusters the recruiter typed.
                // Those skills are what the interview actually asks, but the
                // cluster CARD renders `cluster.skills` — so without this sync it
                // showed only the 2 original skills while the Question
                // Distribution popover correctly showed all 8. Fold every
                // distribution skill back into its own cluster (matched by
                // cluster_id, else cluster_name, else the first cluster) so the
                // card and the popover agree. Case-insensitive dedupe; never
                // drops an existing skill.
                const foldDistIntoClusters = (
                  clustersArr: Cluster[],
                  rows: any[],
                  keep: (name: string) => boolean,
                ): Cluster[] => {
                  if (!clustersArr.length || !Array.isArray(rows) || rows.length === 0) {
                    return clustersArr;
                  }
                  // Work on fresh cluster objects (new skills arrays) so React
                  // re-renders when we setState with the result.
                  const next: Cluster[] = clustersArr.map(c => ({ ...c, skills: [...c.skills] }));
                  const byId = new Map(next.map(c => [String(c.id), c]));
                  const byName = new Map(next.map(c => [String(c.name).toLowerCase().trim(), c]));
                  // BUCKET-WIDE dedup (not per-cluster): a skill already present in
                  // ANY cluster of this bucket must not be folded into another —
                  // the many-to-many slot rows otherwise duplicate a cross-cluster
                  // secondary into a second cluster card.
                  //
                  // SEMANTIC, not just exact-string: `rows` comes from the
                  // /distribute-skills LLM call, which can echo back a skill in
                  // different wording (or one leaked in via the JD pool) that the
                  // generate/refine backstop had already correctly dropped as a
                  // duplicate/bundle of something already in these clusters —
                  // e.g. "Strong Understanding SDLC and STLC" re-appearing beside
                  // an already-present "SDLC" + "STLC". An exact lowercase match
                  // never catches a reworded re-entry, so every candidate is also
                  // checked against everything folded in so far via the same
                  // semantic verdict used everywhere else in this app.
                  const seenBucket = new Set<string>(
                    next.flatMap(c => c.skills.map(s => s.toLowerCase().trim())),
                  );
                  const keptNames: string[] = next.flatMap(c => c.skills);
                  for (const r of rows) {
                    const target =
                      byId.get(String(r?.cluster_id)) ??
                      byName.get(String(r?.cluster_name || '').toLowerCase().trim()) ??
                      next[0];
                    if (!target) continue;
                    const skillNames: string[] = [
                      String(r?.primary_skill || r?.primary || '').trim(),
                      ...((r?.secondary_skills || r?.secondaries || []) as any[])
                        .map((s: any) => String(s || '').trim()),
                    ].filter(Boolean);
                    for (const nm of skillNames) {
                      const k = nm.toLowerCase().trim();
                      if (!k || seenBucket.has(k)) continue;
                      if (!keep(nm)) continue;   // removed as a duplicate by /generate-clusters
                      if (closestDuplicate(keptNames.map(n => ({ name: n })), n => n.name, nm)) continue;
                      target.skills.push(nm);
                      seenBucket.add(k);
                      keptNames.push(nm);
                    }
                  }
                  return next;
                };
                newMthClusters = foldDistIntoClusters(newMthClusters, dist.mth_questions || [], keepMth);
                if (nthEnabled) {
                  newNthClusters = foldDistIntoClusters(newNthClusters, dist.nth_questions || [], keepNth);
                }
                // Re-sync state + SI so the cluster CARD shows the full set.
                setMthClusters(newMthClusters);
                if (nthEnabled) setNthClusters(newNthClusters);
                si.mth_clusters = newMthClusters;
                si.nth_clusters = nthEnabled ? newNthClusters : [];
              }
            } catch (distErr) {
              // Non-fatal — clusters still persist; finalize will compute the
              // distribution as a fallback if none was saved here.
              console.warn('[Clusters] AI skill distribution at generation failed; deferring to publish', distErr);
            }
          }

          si.wizard_step = CURRENT_STEP;
          const _updated = await aiInterviewService.update(id, {
            special_instructions: JSON.stringify(si),
            rounds_config: rounds,
            // Skills were already deduped on gpt-4o by /generate-clusters.
            semantic_skill_check: false,
          });
          // Adopt the BACKEND-CORRECTED special_instructions from the update
          // response. The server-side over-allocation backstop expands a bucket
          // whose unique skills < question count (e.g. recruiter left just 1 MHS
          // + 1 NHS skill) with JD-grounded skills and RECOMPUTES the
          // distribution with a unique skill per question. If we instead kept the
          // LOCAL `si` (as before), the preview showed the frontend's
          // pre-backstop distribution — the single seed skill CYCLED/duplicated
          // across all questions — even though the DB now holds the correct,
          // deduped, expanded plan. Re-deriving the cluster cards from the
          // returned SI makes the preview match what actually got stored.
          const _serverSi = (_updated && typeof (_updated as any).special_instructions === 'string')
            ? (_updated as any).special_instructions as string
            : JSON.stringify(si);
          let _serverParsed: any = null;
          try { _serverParsed = JSON.parse(_serverSi); } catch { _serverParsed = null; }
          if (_serverParsed && typeof _serverParsed === 'object') {
            // Re-derive cluster cards from the backend clusters (already expanded
            // by the backstop), folding the backend distribution so the card and
            // the Question Distribution popover agree.
            const _foldServer = (clArr: any[], rws?: any[]): any[] => {
              if (!Array.isArray(clArr) || clArr.length === 0) return clArr || [];
              if (!Array.isArray(rws) || rws.length === 0) return clArr;
              const nx = clArr.map(c => ({ ...c, skills: [...(c.skills || [])] }));
              const byId = new Map(nx.map(c => [String(c.id), c]));
              const byName = new Map(nx.map(c => [String(c.name).toLowerCase().trim(), c]));
              // BUCKET-WIDE dedup (see foldDistOnLoad): a skill already present in
              // ANY cluster of this bucket must not be folded into another — the
              // many-to-many slot rows otherwise duplicate a cross-cluster
              // secondary into a second cluster card.
              const snBucket = new Set<string>(nx.flatMap(c => (c.skills as string[]).map(s => s.toLowerCase().trim())));
              for (const r of rws) {
                const t = byId.get(String(r?.cluster_id)) ?? byName.get(String(r?.cluster_name || '').toLowerCase().trim()) ?? nx[0];
                if (!t) continue;
                const names = [String(r?.primary_skill || r?.primary || '').trim(), ...((r?.secondary_skills || r?.secondaries || []) as any[]).map((x: any) => String(x || '').trim())].filter(Boolean);
                for (const nm of names) { const k = nm.toLowerCase().trim(); if (k && !snBucket.has(k)) { (t.skills as string[]).push(nm); snBucket.add(k); } }
              }
              return nx;
            };
            const _sd = (_serverParsed.skill_distribution && typeof _serverParsed.skill_distribution === 'object') ? _serverParsed.skill_distribution : {};
            if (Array.isArray(_serverParsed.mth_clusters)) {
              const mthC = _foldServer(_serverParsed.mth_clusters.map((c: any) => ({ ...c, priority: normalizePriority(c.priority) })), _sd.mth_questions);
              setMthClusters(mthC);
            }
            if (nthEnabled && Array.isArray(_serverParsed.nth_clusters)) {
              const nthC = _foldServer(_serverParsed.nth_clusters.map((c: any) => ({ ...c, priority: normalizePriority(c.priority) })), _sd.nth_questions);
              setNthClusters(nthC);
            }
          }
          setConfig(prev => prev
            ? ({ ...prev, special_instructions: _serverSi, rounds_config: (_updated as any)?.rounds_config ?? rounds } as AIInterviewResponse)
            : prev);
        } catch {
          // Non-fatal — clusters are visible in UI; user can still save manually
        }
      }

      toast.success(
        mthExpanded || nthExpanded
          ? 'Clusters generated! Skills expanded to fill the question budget.'
          : 'Clusters generated!'
      );
    } catch (err) {
      console.error('[CLUSTER-DEBUG] handleGenerateClusters FAILED:', err);
      // Surface the REAL backend reason (e.g. the OpenAI 429 / quota message from
      // /expand-skills) instead of a generic "failed" — so the recruiter knows to
      // top up the OpenAI account or add skills manually, rather than silently
      // getting fabricated "<skill> – Concept N" placeholder clones.
      const _reason = (err instanceof Error && err.message && err.message.trim())
        ? err.message.trim()
        : 'Failed to generate clusters. Please try again, or add skills manually.';
      toast.error(_reason, { duration: 9000 });
    } finally {
      setGenerating(false);
    }
  };

  /* ── Auto-trigger generation when arrived from Configure page with autogen=1.
     Configure page hands off here so the user doesn't wait on a blocked
     "Generating Clusters…" button — generation runs on this page with its own
     loading UI. Fires once per mount; the URL param is stripped immediately
     so refresh / bookmarks don't re-trigger. ─── */
  const autogenFiredRef = useRef(false);
  useEffect(() => {
    if (searchParams.get('autogen') !== '1') return;
    if (autogenFiredRef.current) return;
    if (loading || !config || !id) return;
    // Wait until skills are populated; otherwise generate would just toast.
    if (mthSkills.length === 0 && nthSkills.length === 0) return;

    autogenFiredRef.current = true;
    // Strip the autogen flag so a refresh after generation doesn't loop.
    router.replace(`/recruitment/ai-interviews/jd-selection/ai-interview-config/clusters?id=${id}${originParam}`);
    // forceExpand on the auto-trigger so /expand-skills always runs on first
    // entry from Configure — recruiter shouldn't need to click "Regenerate"
    // to see sub-skill expansion when arriving with e.g. 2 NTH skills.
    void handleGenerateClusters({ forceExpand: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, config, id, mthSkills.length, nthSkills.length]);

  /* ─── Auto-heal under-filled saved clusters ───────────────────────────────
     Page load restores saved clusters from special_instructions VERBATIM — it
     does NOT re-run expansion. So a config whose clusters were saved while a
     bucket was under-filled (the autogen page-load race, or a pre-expansion
     generation) permanently shows more questions than skills (e.g. 5 NTH
     questions / 2 NTH skills) until the recruiter clicks "Regenerate with AI".
     Removal is locked at the floor, so they can't fix it here either.

     When a restored, enabled bucket has fewer UNIQUE skills than its question
     budget, re-run generation once with forceExpand so /expand-skills fills the
     pool to ≥1 skill/question (backend floors to the question count and even
     tops up with placeholders, so this converges and never loops). Timed mode
     only — flexible mode has no fixed question floor. The autogen path already
     regenerates, so skip when that flag is present. ─────────────────────── */
  const autoHealFiredRef = useRef(false);
  useEffect(() => {
    if (autoHealFiredRef.current) return;
    if (loading || generating || !config || !id) return;
    if (!isFixed) return;                              // no fixed floor in flexible mode
    if (searchParams.get('autogen') === '1') return;   // autogen effect handles this entry
    // Only heal a config that was already generated — leave a fresh, never-
    // generated config to the autogen path / the recruiter's Generate click.
    if (mthClusters.length === 0 && nthClusters.length === 0) return;
    // Need input skills to expand from.
    if (mthSkills.length === 0 && nthSkills.length === 0) return;

    const mthFloor = timedAllocation.mthQuestions ?? 0;
    const nthFloor = nthEnabled ? (timedAllocation.nthQuestions ?? 0) : 0;
    const uniqueCount = (clusters: Cluster[]) =>
      new Set(clusters.flatMap(c => c.skills.map(s => s.toLowerCase()))).size;
    const mthShort = mthFloor > 0 && uniqueCount(mthClusters) < mthFloor;
    const nthShort = nthFloor > 0 && uniqueCount(nthClusters) < nthFloor;
    if (!mthShort && !nthShort) return;

    autoHealFiredRef.current = true;
    console.log('[CLUSTER-DEBUG] Auto-heal: under-filled bucket detected, re-expanding', {
      mthFloor, nthFloor,
      mthUnique: uniqueCount(mthClusters), nthUnique: uniqueCount(nthClusters),
      mthShort, nthShort,
    });
    toast.info('Expanding skills to match the question budget…');
    void handleGenerateClusters({ forceExpand: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, generating, config, id, isFixed, nthEnabled,
      mthClusters, nthClusters, mthSkills.length, nthSkills.length]);

  /* ─── Generate for a saved config that has skills but NO clusters ─────────
     autogen only fires on the hand-off from Configure (?autogen=1) and the
     auto-heal above deliberately skips zero clusters, so reopening a saved
     config whose clusters were never generated (or whose generation failed)
     left the page empty — and Continue let it through to publish with no
     priorities and no question plan (prod config 0d0e78f3). Generate once. */
  const missingClustersFiredRef = useRef(false);
  useEffect(() => {
    if (missingClustersFiredRef.current) return;
    if (loading || generating || !config || !id) return;
    if (searchParams.get('autogen') === '1') return;   // autogen effect handles this entry
    if (isFlexible && isFinalized) return;
    const mthMissing = mthSkills.length > 0 && mthClusters.length === 0;
    const nthMissing = nthEnabled && nthSkills.length > 0 && nthClusters.length === 0;
    if (!mthMissing && !nthMissing) return;
    missingClustersFiredRef.current = true;
    console.log('[CLUSTER-DEBUG] Saved config has skills but no clusters — generating', {
      mthMissing, nthMissing,
    });
    toast.info('This configuration has no clusters yet — generating them…');
    void handleGenerateClusters({ forceExpand: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, generating, config, id, isFlexible, isFinalized, nthEnabled,
      mthClusters.length, nthClusters.length, mthSkills.length, nthSkills.length]);

  /* ── Save & Navigate ── */
  /** Build updated rounds_config with topics/topic_weights from clusters */
  const buildUpdatedRoundsConfig = () => {
    // Priority 1-5 → weight (higher priority = higher weight for time allocation)
    const PRIORITY_WEIGHT: Record<number, number> = { 5: 60, 4: 50, 3: 40, 2: 30, 1: 20 };
    const rounds = [...(config?.rounds_config ?? [])];

    // Helper: build name-keyed topic_time_minutes from cluster list + total minutes
    const buildTopicTimeMap = (clusters: Cluster[], totalMin: number): Record<string, number> => {
      if (clusters.length === 0 || totalMin <= 0) return {};
      const totalWeight = clusters.reduce((s, c) => s + c.priority, 0);
      if (totalWeight <= 0) return {};
      const result: Record<string, number> = {};
      let remaining = totalMin;
      const sorted = [...clusters].sort((a, b) => b.priority - a.priority || (a.name ?? '').localeCompare(b.name ?? ''));
      sorted.forEach((c, i) => {
        const mins = i === sorted.length - 1
          ? remaining
          : Math.round((c.priority / totalWeight) * totalMin);
        result[c.name] = Math.max(1, mins);
        remaining -= result[c.name];
      });
      return result;
    };

    // Helper: split current skills into jd_skills (original) and custom_skills (added here)
    const splitSkills = (skills: SkillEntry[], jdSet: Set<string>) => {
      const jd: string[] = [];
      const custom: string[] = [];
      skills.forEach(s => {
        if (jdSet.has(s.name.toLowerCase())) jd.push(s.name);
        else custom.push(s.name);
      });
      return { jd_skills: jd, custom_skills: custom };
    };

    // Update must-have round with mth cluster topics + updated skill lists
    const mthIdx = rounds.findIndex(
      (r: any) => r.type === 'must_have_skills' || r.type === 'must_have'
    );
    if (mthIdx >= 0) {
      const { jd_skills, custom_skills } = splitSkills(mthSkills, jdMthSkillNamesRef.current);
      const topics = mthClusters.map((c) => c.name);
      const topic_weights: Record<string, number> = {};
      mthClusters.forEach((c) => { topic_weights[c.name] = PRIORITY_WEIGHT[c.priority] || 40; });
      const topic_time_minutes = buildTopicTimeMap(mthClusters, fixedMthMin);
      rounds[mthIdx] = { ...rounds[mthIdx], jd_skills, custom_skills, topics, topic_weights, topic_time_minutes };
    }

    // Update nice-to-have round with nth cluster topics + updated skill lists (only when NHS enabled)
    const nthIdx = rounds.findIndex(
      (r: any) => r.type === 'nice_to_have_skills' || r.type === 'nice_to_have'
    );
    if (nthIdx >= 0 && nthEnabled) {
      const { jd_skills, custom_skills } = splitSkills(nthSkills, jdNthSkillNamesRef.current);
      const topics = nthClusters.map((c) => c.name);
      const topic_weights: Record<string, number> = {};
      nthClusters.forEach((c) => { topic_weights[c.name] = PRIORITY_WEIGHT[c.priority] || 40; });
      const topic_time_minutes = buildTopicTimeMap(nthClusters, fixedNthMin);
      rounds[nthIdx] = { ...rounds[nthIdx], jd_skills, custom_skills, topics, topic_weights, topic_time_minutes };
    }

    return rounds;
  };

  const saveAndNavigate = async (target: string, finalize = false) => {
    if (!config || !id) return;
    setSaving(true);
    try {
      const si = JSON.parse(config.special_instructions || '{}');
      si.mth_clusters = mthClusters;
      si.nth_clusters = nthEnabled ? nthClusters : []; // don't persist NHS clusters when disabled
      si.skill_weights = skillWeights;
      // Save skill snapshot so Configure step knows what was present at last
      // save and won't falsely trigger cluster regeneration on back-nav.
      //
      // CRITICAL: snapshot uses MAIN skills only (recruiter-typed) — not the
      // post-expansion list. Configure displays only main skills, so any
      // expanded extras would always look "missing" → false regen.
      const mthMainList: string[] = Array.isArray(si.mth_main_skills) && si.mth_main_skills.length > 0
        ? si.mth_main_skills
        : mthSkills.map(s => s.name);
      const nthMainList: string[] = nthEnabled
        ? (Array.isArray(si.nth_main_skills) && si.nth_main_skills.length > 0
            ? si.nth_main_skills
            : nthSkills.map(s => s.name))
        : [];
      si.mth_skills_snapshot = mthMainList;
      si.nth_skills_snapshot = nthMainList;
      // Extended snapshot — Q + types + enabled flags. Types map only for
      // main skills (matches what Configure compares against).
      si.mth_questions_snapshot = isFixed ? (timedAllocation.mthQuestions ?? 0) : 0;
      si.nth_questions_snapshot = isFixed && nthEnabled ? (timedAllocation.nthQuestions ?? 0) : 0;
      const buildTypesForMains = (mainList: string[], allEntries: SkillEntry[]): Record<string, string> => {
        const byName = new Map(allEntries.map(e => [e.name.toLowerCase().trim(), e.type ?? 'Skill']));
        const out: Record<string, string> = {};
        for (const name of mainList) {
          out[name.toLowerCase().trim()] = byName.get(name.toLowerCase().trim()) ?? 'Skill';
        }
        return out;
      };
      si.mth_skill_types_snapshot = buildTypesForMains(mthMainList, mthSkills);
      si.nth_skill_types_snapshot = nthEnabled
        ? buildTypesForMains(nthMainList, nthSkills)
        : {};
      si.nth_enabled_snapshot = nthEnabled;
      si.hr_enabled_snapshot = hrEnabled;
      // Flexible mode: always write flexible_finalized from current React state,
      // not from stale config.special_instructions — this ensures handleReopenClusters
      // (which sets isFinalized=false) is not overwritten by a subsequent Back/save.
      if (isFlexible) {
        si.flexible_finalized = finalize ? true : isFinalized;
      }
      // AI-driven skill→question mapping. Replaces the local JS distribute()
      // formula that capped secondaries at 2/Q and silently dropped extra
      // skills. Server guarantees every input skill appears at least once
      // (primary or secondary) — see /distribute-skills rule #5.
      //
      // REUSE the distribution already computed + saved at cluster-generation
      // time (handleGenerateClusters). Recomputing here would call the
      // non-deterministic LLM AGAIN and produce a DIFFERENT layout than the
      // generation-time preview the recruiter already saw — that is the exact
      // create-vs-publish mismatch. Only compute here as a fallback when no
      // distribution was saved (e.g. generation-time call failed).
      const _hasSavedSD = !!(si as any)?.skill_distribution
        && Array.isArray((si as any).skill_distribution.mth_questions)
        && (si as any).skill_distribution.mth_questions.length > 0;
      if (finalize && isFixed && !_hasSavedSD) {
        try {
          const mthQs = timedAllocation.mthQuestions ?? 0;
          const nthQs = (nthEnabled ? (timedAllocation.nthQuestions ?? 0) : 0);
          if (mthQs > 0 || nthQs > 0) {
            // Pool the configured cluster skills + the broader JD-extracted
            // skill list so the backend can widen primaries beyond the trimmed
            // cluster pool. Without this, a bucket configured with 1 skill
            // and 4 Qs ends up showing the same primary in all 4 rows.
            // Exclude skills that belong to the OTHER bucket's clusters so
            // we don't pull MTH skills into NTH (cross-bucket pollution).
            const _mthExclude = new Set(
              nthClusters.flatMap(c => c.skills ?? [])
                .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
                .map(s => s.toLowerCase()),
            );
            const _nthExclude = new Set(
              mthClusters.flatMap(c => c.skills ?? [])
                .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
                .map(s => s.toLowerCase()),
            );
            const _mthJdPool = Array.from(new Set([
              ...mthClusters.flatMap(c => c.skills),
              ...mthSkills.map(s => s.name),
              ...((config as any).jd_must_have_skills || []),
            ].filter((s): s is string => typeof s === 'string' && s.trim().length > 0 && !_mthExclude.has(s.toLowerCase()))));
            const _nthJdPool = Array.from(new Set([
              ...nthClusters.flatMap(c => c.skills),
              ...nthSkills.map(s => s.name),
              ...((config as any).jd_nice_to_have_skills || []),
            ].filter((s): s is string => typeof s === 'string' && s.trim().length > 0 && !_nthExclude.has(s.toLowerCase()))));
            const dist = await aiInterviewService.distributeSkills({
              mthClusters: mthClusters.map(c => ({ id: c.id, name: c.name, priority: c.priority, skills: c.skills })),
              nthClusters: nthEnabled ? nthClusters.map(c => ({ id: c.id, name: c.name, priority: c.priority, skills: c.skills })) : [],
              mthQuestions: mthQs,
              nthQuestions: nthQs,
              jdTitle: config.jd_title,
              jdDescription: (config as any).jd_description,
              mthJdSkillPool: _mthJdPool,
              nthJdSkillPool: nthEnabled ? _nthJdPool : [],
            });
            si.skill_distribution = {
              mth_questions: dist.mth_questions || [],
              nth_questions: dist.nth_questions || [],
              generated_at: new Date().toISOString(),
            };
          }
        } catch (distErr) {
          // Non-fatal — clusters still persist, the panel falls back to local distribute()
          console.warn('[Clusters] AI skill distribution failed; falling back to local preview', distErr);
        }
      }
      si.wizard_step = CURRENT_STEP;
      await aiInterviewService.update(id, {
        special_instructions: JSON.stringify(si),
        rounds_config: buildUpdatedRoundsConfig(),
        semantic_skill_check: false,
      });
      router.push(target);
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (!config) return;
    // Include config_id so Config can load the exact draft directly (avoids jd_id search miss)
    saveAndNavigate(
      `/recruitment/ai-interviews/jd-selection/ai-interview-config?jd_id=${config.jd_id || ''}&config_id=${id}${originParam}`
    );
  };

  const handleContinue = () => {
    // A section with skills but NO clusters at all used to pass every check
    // below (nothing to find empty / duplicated), so the config was saved with
    // mth_clusters: [] and published with no priorities and no question plan
    // (prod config 0d0e78f3, 2026-09-18) — its interviews could never be scored.
    const mthMissing = mthSkills.length > 0 && mthClusters.length === 0;
    const nthMissing = nthEnabled && nthSkills.length > 0 && nthClusters.length === 0;
    if (mthMissing || nthMissing) {
      const which = [mthMissing && 'Must-To-Have', nthMissing && 'Nice-To-Have'].filter(Boolean).join(' and ');
      toast.error(`${which} skills have no clusters yet. Click "Regenerate with AI" before continuing.`);
      return;
    }
    // Every cluster must contain at least one skill — empty clusters break
    // question distribution regardless of interview mode (timed or flexible)
    // and regardless of section (MTH or NTH-when-enabled).
    const emptyMth = mthClusters.filter(c => !Array.isArray(c.skills) || c.skills.length === 0);
    const emptyNth = nthEnabled
      ? nthClusters.filter(c => !Array.isArray(c.skills) || c.skills.length === 0)
      : [];
    const emptyTotal = emptyMth.length + emptyNth.length;
    if (emptyTotal > 0) {
      const sections: string[] = [];
      if (emptyMth.length > 0) sections.push(`${emptyMth.length} Must-To-Have`);
      if (emptyNth.length > 0) sections.push(`${emptyNth.length} Nice-To-Have`);
      toast.error(
        `${sections.join(' and ')} cluster${emptyTotal > 1 ? 's have' : ' has'} no skills. Each cluster must contain at least one skill.`,
      );
      return;
    }
    // Flexible mode: also block when skills are unassigned to any cluster.
    if (isFlexible && hasIssues) {
      const unassignedCount = unassignedMth.length + unassignedNth.length;
      if (unassignedCount > 0) {
        toast.error(
          `${unassignedCount} skill${unassignedCount > 1 ? 's are' : ' is'} not assigned to any cluster. All skills must belong to a cluster.`,
        );
        return;
      }
    }
    // Block when two or more clusters in the same section share a priority.
    // Each priority slot (High / Medium / Low) is a distinct weight in the
    // question-distribution algorithm — duplicate priorities make the
    // weighting ambiguous and produce uneven question allocation across
    // the section.
    const labelFor = (p: number) => (p >= 3 ? 'High' : p === 2 ? 'Medium' : 'Low');
    const findDup = (clusters: { name: string; priority: number }[]) => {
      const seen = new Map<number, string>();
      for (const c of clusters) {
        const prev = seen.get(c.priority);
        if (prev) return { priority: c.priority, names: [prev, c.name] };
        seen.set(c.priority, c.name);
      }
      return null;
    };
    const dupMth = findDup(mthClusters);
    if (dupMth) {
      toast.error(
        `Two Must-Have clusters share ${labelFor(dupMth.priority)} priority (${dupMth.names.join(' & ')}). Each priority can be assigned to only one cluster per section.`,
      );
      return;
    }
    if (nthEnabled) {
      const dupNth = findDup(nthClusters);
      if (dupNth) {
        toast.error(
          `Two Nice-to-Have clusters share ${labelFor(dupNth.priority)} priority (${dupNth.names.join(' & ')}). Each priority can be assigned to only one cluster per section.`,
        );
        return;
      }
    }
    saveAndNavigate(
      '/recruitment/ai-interviews/jd-selection/ai-interview-config/preview?id=' + id + originParam,
      true, // finalize = true → sets flexible_finalized in flexible mode
    );
  };

  /* Flexible mode: re-open finalized clusters for editing */
  const handleReopenClusters = async () => {
    if (!config || !id) return;
    setIsFinalized(false);
    try {
      const si = JSON.parse(config.special_instructions || '{}');
      si.flexible_finalized = false;
      await aiInterviewService.update(id, { special_instructions: JSON.stringify(si) });
    } catch {
      toast.error('Failed to re-open clusters for editing');
    }
  };

  const handleSaveAsDraft = async () => {
    if (!config || !id) return;
    setSaving(true);
    try {
      const si = JSON.parse(config.special_instructions || '{}');
      si.mth_clusters = mthClusters;
      si.nth_clusters = nthEnabled ? nthClusters : []; // don't persist NHS clusters when disabled
      si.skill_weights = skillWeights;
      // Flexible mode: keep flexible_finalized in sync with current React state
      if (isFlexible) {
        si.flexible_finalized = isFinalized;
      }
      // A draft saved here reopens here, not on Configure.
      si.wizard_step = CURRENT_STEP;
      await aiInterviewService.update(id, {
        special_instructions: JSON.stringify(si),
        rounds_config: buildUpdatedRoundsConfig(),
        semantic_skill_check: false,
        // Audit-log hint: this IS the recruiter explicitly saving and leaving
        // (as opposed to the silent saves elsewhere on this page), so the
        // trail should show "Saved as Draft" / "Draft Updated" once — see
        // update_interview in routers/ai_interview.py.
        save_and_exit: true,
        // Editing a published (uninvited) version: saving it as a draft takes
        // it off "published" instead of leaving it live.
        ...(config.status === 'published' && { status: 'draft' }),
      });
      clearUnsavedVersion(id);
      toast.success('Draft saved!');
      router.push(exitHref);
    } catch {
      toast.error('Failed to save draft');
    } finally {
      setSaving(false);
    }
  };

  /* Discard — the wizard's one rule (lib/utils/aiInterviewUnsavedVersion):
     an UNSAVED draft (a new interview, or the version Duplicate just minted)
     is deleted; a draft the recruiter saved earlier, or a published / live
     version, is left as last saved — Discard never deletes it. */
  const discardDeletesVersion = !!id && config?.status === 'draft' && isUnsavedVersion(id);
  const handleDiscard = async () => {
    if (id && discardDeletesVersion) {
      try {
        await aiInterviewService.delete(id);
        clearUnsavedVersion(id);
        toast.success('Draft discarded');
      } catch {
        // Silent
      }
    }
    router.push(exitHref);
  };

  /* ── Validation computed values (only meaningful when clusters exist) ── */
  const activeNthClusters = nthEnabled ? nthClusters : [];
  const hasClusters = mthClusters.length > 0 || activeNthClusters.length > 0;
  // Case-insensitive matching: LLM may return skill names with different casing
  const allAssignedMth = new Set(mthClusters.flatMap(c => c.skills.map(s => s.toLowerCase().trim())));
  const allAssignedNth = new Set(activeNthClusters.flatMap(c => c.skills.map(s => s.toLowerCase().trim())));
  // Unassigned-skill detection is intentionally disabled — refine renames skills
  // ("JUnit" → "Testing Frameworks"), so exact-name comparison against the
  // bucket list produces noisy false positives. The interview engine uses the
  // cluster's own skill list, so the mismatch is cosmetic.
  const unassignedMth: SkillEntry[] = [];
  const unassignedNth: SkillEntry[] = [];
  const emptyClusters = [...mthClusters, ...activeNthClusters].filter(c => c.skills.length === 0);
  const hasIssues = unassignedMth.length > 0 || unassignedNth.length > 0 || emptyClusters.length > 0;

  /* ── Loading state ── */
  if (loading) {
    // Neutral-gray skeleton mirroring the clusters editor: breadcrumb, step
    // indicator, header (icon + title + subtitle), then the two category
    // section cards (Must-To-Have / Nice-To-Have), each with a skills pool row
    // and a couple of cluster rows.
    return (
      <main className="flex-1 overflow-x-clip bg-slate-50">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="p-4 md:p-8 w-full min-h-[calc(100dvh-7rem)] bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
            {/* Breadcrumb */}
            <div className="mb-4 md:mb-6 flex items-center gap-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-3" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-3" />
              <Skeleton className="h-3 w-28" />
            </div>

            {/* Step indicator */}
            <div className="flex items-center justify-center sm:justify-start gap-3 mb-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <Skeleton className="hidden sm:block h-3 w-16" />
                </div>
              ))}
            </div>

            {/* Header: icon + title + subtitle */}
            <div className="flex items-center gap-3 mb-6">
              <Skeleton className="h-11 w-11 rounded-xl shrink-0" />
              <div className="space-y-2 min-w-0 flex-1">
                <Skeleton className="h-6 w-48 max-w-full" />
                <Skeleton className="h-4 w-64 max-w-full" />
              </div>
            </div>

            {/* Category section cards */}
            <div className="space-y-5">
              {Array.from({ length: 2 }).map((_, s) => (
                <div key={s} className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
                  {/* Section header */}
                  <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-9 w-9 rounded-xl" />
                      <div className="space-y-2">
                        <Skeleton className="h-5 w-40" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                  </div>
                  {/* Skills pool */}
                  <div className="px-4 pt-4 pb-3 border-b border-gray-100">
                    <Skeleton className="h-3 w-16 mb-3" />
                    <div className="flex flex-wrap gap-1.5">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} className="h-6 w-24 rounded-full" />
                      ))}
                    </div>
                  </div>
                  {/* Cluster rows */}
                  <div className="p-4 space-y-2.5">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-xl border border-gray-100 px-3.5 py-3">
                        <Skeleton className="h-4 w-4 rounded" />
                        <Skeleton className="h-5 w-12 rounded" />
                        <Skeleton className="h-4 flex-1 max-w-[40%]" />
                        <Skeleton className="h-5 w-16 rounded-full" />
                        <Skeleton className="h-6 w-6 rounded-full" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!config) {
    return (
      <div className="tf-loader-page bg-slate-50">
        <div className="text-center">
          <p className="text-sm text-gray-500">No interview configuration found.</p>
          <button
            onClick={() => router.back()}
            className="mt-3 text-sm text-brand-blue hover:text-brand-blue-2 underline"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <main className="flex-1 overflow-x-clip bg-slate-50 dark:bg-slate-950">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="p-4 md:p-8 w-full min-h-[calc(100dvh-7rem)] bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
            <PageBreadcrumb
              barRef={breadcrumbBarRef}
              /* Inside the wizard popup the popup's header names the flow. */
              className={`mb-4 md:mb-6${embedded ? ' hidden' : ''}`}
              items={
                fromInviteOrigin
                  ? [
                      { label: 'Dashboard', href: '/dashboard' },
                      { label: inviteOriginLabel, href: candidateCrumb ? inviteOriginPath : inviteOriginReturn },
                      ...(candidateCrumb ? [candidateCrumb] : []),
                      { label: 'Create AI Interview' },
                      { label: 'Clusters' },
                    ]
                  : fromJobDetails && config?.jd_id
                  ? [
                      // Entered from Job Details — repeat that page's trail and link
                      // the JD crumb back to it so the user returns where they started.
                      { label: 'Dashboard', href: '/dashboard' },
                      { label: 'Job Descriptions', href: '/recruitment/job-openings' },
                      { label: config?.jd_title || config?.position || 'Job Details', href: `/recruitment/job-details?id=${encodeURIComponent(config.jd_id)}` },
                      { label: 'AI Interview Clusters' },
                    ]
                  : [
                      { label: 'Dashboard', href: '/dashboard' },
                      { label: 'AI Interviews', href: '/recruitment/ai-interviews' },
                      // Name the JD whose clusters are being edited.
                      { label: config?.jd_title || config?.position || 'Clusters' },
                    ]
              }
            />
          {/* Step indicator — a direct child of the card, so it can stick. */}
          <AIInterviewStepIndicator currentStep={CURRENT_STEP} topOffset={breadcrumbHeight} />

          {/* Header */}
          <div className="mb-6">
            {/* Header row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                  <Layers className="w-5 h-5 text-brand-blue" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h1 className="text-lg sm:text-xl font-semibold text-gray-900 tracking-tight">Skill Clusters</h1>
                    {/* Stealth dot — only the admin knows it's there. Click opens the
                      Question Distribution popover. Tiny (6×6), neutral gray, no hover ring,
                      sits flush with the heading so casual users don't register it. */}
                    {isFixed && (mthClusters.length > 0 || (nthEnabled && nthClusters.length > 0)) && (() => {
                      // Each secondary carries its own priority so the UI can
                      // render per-skill High/Med/Low badges (secondaries may
                      // come from a 0-alloc orphan cluster with a different
                      // priority than the primary's cluster).
                      type DistRow = { q: number; primary: string; secondaries: { name: string; priority: number }[]; cluster: string; priority: number };
                      // Distribute skills across N questions deterministically.
                      // Spec-fixes vs the naive version:
                      //   - Primary eligibility uses ONLY the "used-as-primary" set.
                      //     Being a secondary in an earlier Q never blocks a skill
                      //     from getting its own primary slot later. (This is what
                      //     caused Q4=SQL and Q8=SQL collision before.)
                      //   - Forced duplication kicks in only when EVERY skill has
                      //     already been primary at least once. Then we round-robin
                      //     primaries by appearance count (least-used first).
                      //   - Secondary picks prefer "never used as secondary" within
                      //     the same cluster; fall back to other same-cluster mates,
                      //     and finally skip rather than dup the primary.
                      const distribute = (clusters: Cluster[], qCount: number, jdPool: string[] = []): DistRow[] => {
                        if (qCount <= 0 || clusters.length === 0) return [];
                        // Normalize JD widening pool — dedupe (case-insensitive),
                        // keep original casing for display.
                        const _jdPoolSeen = new Set<string>();
                        const jdPoolClean: string[] = [];
                        for (const s of jdPool) {
                          if (typeof s !== 'string') continue;
                          const t = s.trim();
                          if (!t) continue;
                          const k = t.toLowerCase();
                          if (_jdPoolSeen.has(k)) continue;
                          _jdPoolSeen.add(k);
                          jdPoolClean.push(t);
                        }
                        // Filter empty + sort by priority desc.
                        const sorted = [...clusters]
                          .filter(c => (c.skills?.length ?? 0) > 0)
                          .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
                        if (sorted.length === 0) return [];

                        // ── STEP 1: per-cluster Q allocation ─────────────────────────
                        // Weight = priority × skill_count. Each cluster gets a share of
                        // qCount proportional to its weight, capped at its skill count
                        // (a cluster with 3 skills never needs more than 3 primary slots).
                        // Guarantees every non-empty cluster gets at least 1 slot when
                        // qCount >= cluster count (so no cluster goes orphaned with all
                        // its skills lost). Any leftover skills become secondaries.
                        // Allocate Qs by skill_count so a cluster with many skills
                        // gets enough Qs to evaluate them (~5 skills/Q max).
                        // Priority is used only for SORT order (high-priority Qs come
                        // first), not for allocation count — otherwise low-priority
                        // clusters with many skills get only 1 Q and pile 16 skills
                        // onto a single question.
                        const skillCounts = sorted.map(c => (c.skills?.length ?? 0));
                        const totalSkills = skillCounts.reduce((s, n) => s + n, 0);
                        const rawAlloc = sorted.map((_, i) =>
                          totalSkills > 0
                            ? (qCount * skillCounts[i]) / totalSkills
                            : 0,
                        );
                        // Initial: round down. The previous cap of min(skillCounts[i], floor)
                        // silently dropped Qs when skills < qCount — recruiter asked for 5,
                        // got 2-3. Per spec we now honor the requested Q count even when
                        // skills are scarce: STEP 2 cycles primaries round-robin instead
                        // of leaving slots unfilled.
                        const allocations = rawAlloc.map(r => Math.floor(r));
                        // If qCount < cluster_count, give the TOP `qCount` priority clusters 1 each.
                        if (qCount < sorted.length) {
                          for (let i = 0; i < allocations.length; i++) {
                            allocations[i] = i < qCount ? 1 : 0;
                          }
                        } else {
                          // Ensure min-1 for every cluster that has skills
                          for (let i = 0; i < allocations.length; i++) {
                            if (allocations[i] === 0 && skillCounts[i] > 0) allocations[i] = 1;
                          }
                        }
                        // Reconcile to total qCount.
                        let diff = qCount - allocations.reduce((a, b) => a + b, 0);
                        // Over-allocated → trim from the cluster with the largest slack first.
                        while (diff < 0) {
                          let trimIdx = -1;
                          let trimSlack = -1;
                          for (let i = 0; i < allocations.length; i++) {
                            if (allocations[i] > 1) {
                              const slack = allocations[i] - (qCount < sorted.length ? 1 : 0);
                              if (slack > trimSlack) { trimSlack = slack; trimIdx = i; }
                            }
                          }
                          if (trimIdx < 0) break;
                          allocations[trimIdx] -= 1;
                          diff += 1;
                        }
                        // Under-allocated → distribute by fractional remainder. No longer
                        // skip clusters at skill-count cap; cycling primaries in STEP 2
                        // covers the duplication safely. Prefer clusters with HIGHER
                        // priority (and richer skill pools) so duplicates land where the
                        // recruiter expects depth coverage.
                        while (diff > 0) {
                          const fracs = rawAlloc
                            .map((r, i) => ({
                              frac: r - Math.floor(r),
                              priority: sorted[i].priority ?? 1,
                              skillCount: skillCounts[i],
                              i,
                            }))
                            .filter(({ skillCount }) => skillCount > 0)
                            .sort((a, b) =>
                              b.frac - a.frac
                              || b.priority - a.priority
                              || b.skillCount - a.skillCount,
                            );
                          if (fracs.length === 0) break;
                          allocations[fracs[0].i] += 1;
                          diff -= 1;
                        }

                        // ── STEP 2: build per-Q rows ─────────────────────────────────
                        // Track every skill already used across ALL Qs in this
                        // bucket (as primary OR secondary). Secondaries never
                        // reuse a skill — if the pool is exhausted, leave the
                        // slot empty rather than repeating. This is what makes
                        // the NTH preview show "Q1 Agile / Q2 Containerization
                        // / Q3 Cloud / Q4 CI/CD" with at most ONE JD-pool
                        // secondary per Q instead of every Q showing the same
                        // 2 JD skills.
                        const bucketUsedLower = new Set<string>();
                        const out: DistRow[] = [];
                        let qNum = 0;
                        // Track orphan skills (from clusters with alloc=0) for later assignment
                        const orphanSkills: { skill: string; cluster: Cluster }[] = [];
                        for (let ci = 0; ci < sorted.length; ci++) {
                          const cluster = sorted[ci];
                          const alloc = allocations[ci];
                          const skills = (cluster.skills ?? []).filter(
                            s => typeof s === 'string' && s.trim()
                          );
                          if (alloc === 0 || skills.length === 0) {
                            // Orphan cluster — all its skills go to be placed as secondaries elsewhere.
                            for (const s of skills) orphanSkills.push({ skill: s, cluster });
                            continue;
                          }
                          // When alloc > skills.length the recruiter asked for more
                          // questions than this cluster has unique skills. Pull
                          // extra primaries from the JD pool (skills extracted from
                          // the JD description that aren't already in this cluster)
                          // BEFORE falling back to cycling — that keeps each Q on
                          // a different primary instead of probing the same skill
                          // multiple times. Only cycle when both pools are exhausted.
                          const primaries: string[] = [];
                          if (alloc <= skills.length) {
                            primaries.push(...skills.slice(0, alloc));
                          } else {
                            primaries.push(...skills);
                            const usedLower = new Set(skills.map(s => s.toLowerCase()));
                            for (const jdSkill of jdPoolClean) {
                              if (primaries.length >= alloc) break;
                              if (usedLower.has(jdSkill.toLowerCase())) continue;
                              primaries.push(jdSkill);
                              usedLower.add(jdSkill.toLowerCase());
                            }
                            // Final fallback if JD pool also exhausted — cycle cluster skills
                            for (let p = primaries.length; p < alloc; p++) {
                              primaries.push(skills[p % skills.length]);
                            }
                          }
                          // Register every primary in this cluster as "used" so
                          // the secondary picker below never re-emits them as
                          // secondaries on another Q.
                          for (const p of primaries) bucketUsedLower.add(p.toLowerCase());
                          const leftover = alloc <= skills.length ? skills.slice(alloc) : [];
                          // Distribute leftover evenly across primaries (only meaningful
                          // when alloc <= skills.length; otherwise leftover is empty
                          // and secondaries are picked per-Q as same-cluster siblings).
                          for (let i = 0; i < primaries.length; i++) {
                            qNum += 1;
                            const start = Math.floor((i * leftover.length) / primaries.length);
                            const end = Math.floor(((i + 1) * leftover.length) / primaries.length);
                            let secs: { name: string; priority: number }[];
                            if (leftover.length > 0) {
                              const slice = leftover.slice(start, end);
                              for (const s of slice) bucketUsedLower.add(s.toLowerCase());
                              secs = slice.map(s => ({
                                name: s,
                                priority: cluster.priority ?? 1,
                              }));
                            } else {
                              // Empty-leftover branch — two distinct sub-cases:
                              //
                              //  (a) alloc == skills.length: cluster is EXACTLY
                              //      sized for primaries. User expectation:
                              //      "cluster has 4 skills, 4 Qs → each Q gets
                              //      1 skill, no extras". Leave secondaries
                              //      EMPTY — do NOT widen from JD pool here.
                              //
                              //  (b) alloc > skills.length (cycled-primary mode):
                              //      cluster is short. Widen secondaries from
                              //      the JD pool, never reusing a skill that's
                              //      already appeared in this bucket.
                              const cycled = alloc > skills.length;
                              const picked: string[] = [];
                              if (cycled) {
                                const tryPick = (cand: string) => {
                                  const k = cand.toLowerCase();
                                  if (bucketUsedLower.has(k)) return;
                                  bucketUsedLower.add(k);
                                  picked.push(cand);
                                };
                                for (let j = 0; j < jdPoolClean.length && picked.length < 2; j++) {
                                  tryPick(jdPoolClean[j]);
                                }
                                if (picked.length < 2) {
                                  for (let j = 0; j < skills.length && picked.length < 2; j++) {
                                    tryPick(skills[j]);
                                  }
                                }
                              }
                              secs = picked.map(s => ({
                                name: s,
                                priority: cluster.priority ?? 1,
                              }));
                            }
                            out.push({
                              q: qNum,
                              primary: primaries[i],
                              secondaries: secs,
                              cluster: cluster.name ?? '',
                              priority: cluster.priority ?? 1,
                            });
                          }
                        }

                        // ── STEP 3: place orphan-cluster skills as cross-cluster secondaries ──
                        // No cap — every orphan skill lands on the Q with the fewest secondaries
                        // so the spread stays balanced. (Rare edge case when q_count < cluster_count.)
                        for (const o of orphanSkills) {
                          const target = out
                            .slice()
                            .sort((a, b) => a.secondaries.length - b.secondaries.length)[0];
                          if (!target) break;
                          target.secondaries.push({
                            name: o.skill,
                            priority: o.cluster.priority ?? 1,
                          });
                        }

                        // ── STEP 4 — 2026-05-22 cross-priority remix ─────────
                        // Rebuild secondaries to mix priorities within each Q
                        // and round-robin primary priorities across Q#s.
                        // Mirror of backend _apply_cross_priority_mix so the
                        // preview matches what runtime + DB will store.
                        type Pool = { skill: string; priority: number };
                        const allSkillsPool: Pool[] = [];
                        const _seenPool = new Set<string>();
                        for (const c of clusters) {
                          for (const s of (c.skills ?? [])) {
                            if (typeof s !== 'string' || !s.trim()) continue;
                            const sl = s.toLowerCase();
                            if (_seenPool.has(sl)) continue;
                            _seenPool.add(sl);
                            allSkillsPool.push({ skill: s, priority: c.priority ?? 1 });
                          }
                        }
                        const primariesLower = new Set(out.map(r => r.primary.toLowerCase()));
                        const remixByPri = new Map<number, string[]>();
                        for (const p of allSkillsPool) {
                          if (primariesLower.has(p.skill.toLowerCase())) continue;
                          const arr = remixByPri.get(p.priority) ?? [];
                          arr.push(p.skill);
                          remixByPri.set(p.priority, arr);
                        }
                        const remixPriDesc = [...remixByPri.keys()].sort((a, b) => b - a);
                        const usedSecRemix = new Set<string>();
                        // Wipe existing secondaries.
                        for (const r of out) r.secondaries = [];
                        // Pass 1: OTHER-priority skills first.
                        for (const r of out) {
                          for (const op of remixPriDesc) {
                            if (op === r.priority) continue;
                            if (r.secondaries.length >= 2) break;
                            const bucket = remixByPri.get(op) ?? [];
                            const pick = bucket.find(s => !usedSecRemix.has(s.toLowerCase()));
                            if (pick) {
                              r.secondaries.push({ name: pick, priority: op });
                              usedSecRemix.add(pick.toLowerCase());
                            }
                          }
                        }
                        // Pass 2: same-priority leftovers.
                        for (const r of out) {
                          if (r.secondaries.length >= 2) continue;
                          for (const s of (remixByPri.get(r.priority) ?? [])) {
                            if (r.secondaries.length >= 2) break;
                            if (usedSecRemix.has(s.toLowerCase())) continue;
                            if (s.toLowerCase() === r.primary.toLowerCase()) continue;
                            r.secondaries.push({ name: s, priority: r.priority });
                            usedSecRemix.add(s.toLowerCase());
                          }
                        }
                        // Pass 3: every still-unused skill goes to the Q with fewest secondaries.
                        const stillUnusedRemix: { name: string; priority: number }[] = [];
                        for (const p of remixPriDesc) {
                          for (const s of (remixByPri.get(p) ?? [])) {
                            if (!usedSecRemix.has(s.toLowerCase())) {
                              stillUnusedRemix.push({ name: s, priority: p });
                            }
                          }
                        }
                        for (const u of stillUnusedRemix) {
                          const target = out
                            .filter(r => r.primary.toLowerCase() !== u.name.toLowerCase())
                            .sort((a, b) => a.secondaries.length - b.secondaries.length)[0];
                          if (target) {
                            target.secondaries.push({ name: u.name, priority: u.priority });
                            usedSecRemix.add(u.name.toLowerCase());
                          }
                        }
                        // Round-robin Q order by primary priority.
                        const remixGroups = new Map<number, DistRow[]>();
                        for (const r of out) {
                          const arr = remixGroups.get(r.priority) ?? [];
                          arr.push(r);
                          remixGroups.set(r.priority, arr);
                        }
                        const remixKeysDesc = [...remixGroups.keys()].sort((a, b) => b - a);
                        const remixInterleaved: DistRow[] = [];
                        while (remixKeysDesc.some(k => (remixGroups.get(k)?.length ?? 0) > 0)) {
                          for (const k of remixKeysDesc) {
                            const arr = remixGroups.get(k);
                            if (arr && arr.length > 0) remixInterleaved.push(arr.shift()!);
                          }
                        }
                        return remixInterleaved.map((r, i) => ({ ...r, q: i + 1 }));
                      };
                      // Build JD pools per bucket, then strip out skills that
                      // belong to the OTHER bucket's clusters. Without this
                      // exclusion, NTH secondaries can pick up MTH cluster
                      // skills (e.g. "Microservices architecture") via the
                      // JD-extracted lists, polluting the NTH bucket.
                      const _otherBucketLower = (bucket: 'mth' | 'nth') => {
                        const otherClusters = bucket === 'mth' ? nthClusters : mthClusters;
                        return new Set(
                          otherClusters
                            .flatMap(c => c.skills ?? [])
                            .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
                            .map(s => s.toLowerCase()),
                        );
                      };
                      const mthExclude = _otherBucketLower('mth');
                      const nthExclude = _otherBucketLower('nth');
                      const mthJdPool = Array.from(new Set([
                        ...mthClusters.flatMap(c => c.skills),
                        ...mthSkills.map(s => s.name),
                        ...(((config as any)?.jd_must_have_skills as string[] | undefined) ?? []),
                      ].filter((s): s is string => typeof s === 'string' && s.trim().length > 0 && !mthExclude.has(s.toLowerCase()))));
                      const nthJdPool = Array.from(new Set([
                        ...nthClusters.flatMap(c => c.skills),
                        ...nthSkills.map(s => s.name),
                        ...(((config as any)?.jd_nice_to_have_skills as string[] | undefined) ?? []),
                      ].filter((s): s is string => typeof s === 'string' && s.trim().length > 0 && !nthExclude.has(s.toLowerCase()))));
                      // The saved plan, its precedence rules and the popover
                      // chrome live in QuestionDistributionPopover, shared with
                      // the Preview, invite-details and results pages, so the
                      // four cannot drift. Only the unsaved-draft PREVIEW is
                      // local: handed over as a thunk, it runs only when nothing
                      // has been saved yet.
                      const hrRoundCfg = (config?.rounds_config ?? []).find(r => r.type === 'hr');
                      return (
                        <QuestionDistributionPopover
                          specialInstructions={config?.special_instructions}
                          clusters={[...mthClusters, ...nthClusters]}
                          hrQuestions={hrEnabled ? (hrRoundCfg?.hr_questions ?? []) : []}
                          fallback={() => ({
                            mth: distribute(mthClusters, timedAllocation.mthQuestions ?? 0, mthJdPool),
                            nth: nthEnabled
                              ? distribute(nthClusters, timedAllocation.nthQuestions ?? 0, nthJdPool)
                              : [],
                          })}
                        />
                      );
                    })()}
                    {/* Skill Distribution info popover removed per product feedback — user-facing
                      recruiters should not see the distribution concept. Backend still stores
                      mth_question_skill_map / nth_question_skill_map for internal inspection.
                      Original block kept commented for revert.
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          aria-label="What is skill distribution?"
                          className="inline-flex items-center justify-center w-5 h-5 rounded-full text-gray-400 hover:text-brand-blue hover:bg-brand-blue/5 transition-colors"
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        side="bottom"
                        align="start"
                        className="w-[440px] max-h-[70dvh] overflow-y-auto p-5 text-sm leading-relaxed"
                      >
                        <div className="space-y-3 text-gray-700">
                          <div className="text-sm font-semibold text-gray-900">Skill Distribution</div>
                          <p className="italic text-gray-600">
                            Intelligently distribute refined skills across the allocated interview
                            questions so all important skills are evaluated efficiently within the
                            given time.
                          </p>
                          <p>
                            After cluster refinement completes, the system maps refined skills to
                            the allocated number of questions. Skills are spread evenly and
                            logically across questions; each question may evaluate multiple related
                            skills.
                          </p>
                          <div>
                            <div className="font-semibold text-gray-900 mb-1.5">User flow</div>
                            <ol className="list-decimal pl-5 space-y-1 text-gray-700">
                              <li><span className="font-medium">Input from refinement:</span> optimized clusters, refined skill list, question allocation.</li>
                              <li><span className="font-medium">Cluster prioritization applied:</span> clusters already sorted by priority.</li>
                              <li><span className="font-medium">Skill mapping to questions:</span> distribute skills across available questions with a balanced load.</li>
                              <li><span className="font-medium">Multi-skill question structuring:</span> each question gets a primary skill (high priority) plus secondary skills (supporting).</li>
                              <li><span className="font-medium">Final output:</span> each question carries its assigned skills and cluster reference.</li>
                            </ol>
                          </div>
                          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs">
                            <div className="font-semibold text-gray-900 mb-1">Example</div>
                            <div className="text-gray-700 mb-2">
                              <span className="font-medium">Refined MHS:</span> Java (High), Spring Boot (High), Microservices (Medium), REST API (Medium), Docker (Low). <span className="font-medium">Allocated:</span> 3 questions.
                            </div>
                            <div className="space-y-0.5 font-mono text-2xs text-gray-800">
                              <div>Q1 → Java (High) · Spring Boot (Medium)</div>
                              <div>Q2 → Microservices (Medium) · REST API (High)</div>
                              <div>Q3 → Docker (Low) + integration with backend</div>
                            </div>
                          </div>
                          <div>
                            <div className="font-semibold text-gray-900 mb-1.5">Acceptance criteria</div>
                            <ol className="list-decimal pl-5 space-y-1 text-gray-700">
                              <li><span className="font-medium">Distribute skills across questions</span> — given refined skills and a question allocation, the system maps skills across the allocated questions.</li>
                              <li><span className="font-medium">Support multi-skill questions</span> — assign more than one skill per question where related skills exist.</li>
                              <li><span className="font-medium">Output question-skill mapping</span> — return a mapping of each question to its assigned skills.</li>
                            </ol>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                    */}
                  </div>
                  <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                    Organize skills into weighted clusters for focused interview coverage
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 [&>button]:w-full sm:[&>button]:w-auto">
                {/* Skill Importance toggle REMOVED — per-skill High/Med/Low
                    selection is no longer surfaced on the cluster page. */}
                {/* Hide regenerate when flexible mode clusters are finalized */}
                {!(isFlexible && isFinalized) && (
                  <Button
                    variant="primary"
                    /* Wrapped: as a bare handler React passes the MouseEvent as `opts`,
                       and destructuring forceExpand off it yields undefined -> false, the
                       same result as calling with no argument. */
                    onClick={() => handleGenerateClusters()}
                    disabled={generating || saving}
                  >
                    {generating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {generating ? 'Generating...' : 'Regenerate with AI'}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* ── Two-column layout: main content + config summary sidebar ── */}
          {/* Stretching columns, so the sticky summary can travel the whole
              height of the content beside it — see the Preview step. */}
          <div className="flex gap-6 items-stretch">
          <div className="flex-1 min-w-0 space-y-4 sm:space-y-6">

          {/* Flexible mode: finalized lock banner */}
          {isFlexible && isFinalized && (
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 bg-gradient-to-r from-brand-orange/5 via-white to-brand-orange/10 border border-brand-orange/20 ring-1 ring-brand-orange/10 shadow-sm shadow-brand-orange/10 rounded-xl">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-brand-orange-deep flex-shrink-0" />
                <p className="text-xs font-semibold text-brand-orange-deep">
                  Clusters are finalized and locked for editing.
                </p>
              </div>
              <button
                onClick={handleReopenClusters}
                disabled={saving}
                className="text-xs font-medium text-brand-orange-deep hover:text-brand-orange underline whitespace-nowrap disabled:opacity-50"
              >
                Re-open for editing
              </button>
            </div>
          )}

          {/* Validation warning banner */}
          {!generating && hasIssues && hasClusters && (
            <div className="flex items-start gap-3 px-4 py-3 bg-gradient-to-r from-brand-orange/5 via-white to-brand-orange/10 border border-brand-orange/20 ring-1 ring-brand-orange/10 shadow-sm shadow-brand-orange/10 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-brand-orange-deep flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-brand-orange-deep">Attention needed</p>
                <div className="flex flex-wrap gap-x-4 mt-0.5">
                  {emptyClusters.length > 0 && (
                    <span className="text-xs text-brand-orange-deep/90">
                      {emptyClusters.length} empty cluster{emptyClusters.length > 1 ? 's' : ''}
                    </span>
                  )}
                  {unassignedMth.length > 0 && (
                    <span className="text-xs text-brand-orange-deep/90">
                      {unassignedMth.length} unassigned MTH skill{unassignedMth.length > 1 ? 's' : ''}
                    </span>
                  )}
                  {unassignedNth.length > 0 && (
                    <span className="text-xs text-brand-orange-deep/90">
                      {unassignedNth.length} unassigned NTH skill{unassignedNth.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Generating state within the content area */}
          {generating && <ClusterGeneratingState />}

          {!generating && (() => {
            // Pool now shows ONLY the refined cluster contents (post-Generate +
            // Refine + enforceSkillCeiling). Raw input pool of 101+50 skills is
            // hidden — recruiter sees only the 24+12 skills that survived.
            // Falls back to recruiter input when no clusters exist yet (initial
            // load before generation has run).
            const buildPoolFromClusters = (clusters: Cluster[], allSkills: SkillEntry[]): SkillEntry[] => {
              const byName = new Map<string, SkillEntry>();
              for (const e of allSkills) byName.set(e.name.toLowerCase().trim(), e);
              const seen = new Set<string>();
              const out: SkillEntry[] = [];
              for (const c of clusters) {
                for (const s of c.skills) {
                  const key = s.toLowerCase().trim();
                  if (!key || seen.has(key)) continue;
                  seen.add(key);
                  // Preserve original type when matched; default to 'Skill' for
                  // AI-merged canonical names (e.g. 'Relational Databases').
                  out.push(byName.get(key) ?? { name: s, comment: '', type: 'Skill' });
                }
              }
              return out;
            };
            const mthDisplaySkills = mthClusters.length > 0
              ? buildPoolFromClusters(mthClusters, mthSkills)
              : mthSkills;
            const nthDisplaySkills = nthClusters.length > 0
              ? buildPoolFromClusters(nthClusters, nthSkills)
              : nthSkills;
            return (
            <>
              {/* Must-To-Have Section */}
              <CategorySection
                title="Must-To-Have Skills"
                icon={(
                  <div className="w-9 h-9 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                    <Shield className="w-4 h-4 text-brand-blue" />
                  </div>
                )}
                category="mth"
                clusters={mthClusters}
                timeMin={fixedMthMin}
                expandedIds={expandedIds}
                onToggleExpand={toggleExpand}
                onUpdateCluster={updateCluster}
                onRemoveCluster={removeCluster}
                onReorderClusters={reorderClusters}
                onMoveSkill={moveSkillBetweenClusters}
                onRemoveSkill={removeSkillFromCluster}
                onAddCluster={addCluster}
                maxClusters={mthMaxClusters}
                isReadOnly={isFlexible && isFinalized}
                removalLocked={mthRemovalLocked}
                skills={mthDisplaySkills}
                onAddSkill={name => addSkillToCategory('mth', name)}
                onRemoveSkillFromPool={name => removeSkillFromPool('mth', name)}
                // Skip mainSkillSet filter when pool is already cluster-derived —
                // AI-merged canonical names (e.g. 'Relational Databases') aren't
                // in mthMainSkillSet and would otherwise be filtered out.
                mainSkillSet={mthClusters.length > 0 ? undefined : mthMainSkillSet}
                parentGroups={mthParentGroupsState}
              />

              {/* Nice-To-Have Section */}
              {nthEnabled && (
                <CategorySection
                  title="Nice-To-Have Skills"
                  icon={(
                    <div className="w-9 h-9 rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center">
                      <Star className="w-4 h-4 text-brand-cyan" />
                    </div>
                  )}
                  category="nth"
                  clusters={nthClusters}
                  timeMin={fixedNthMin}
                  expandedIds={expandedIds}
                  onToggleExpand={toggleExpand}
                  onUpdateCluster={updateCluster}
                  onRemoveCluster={removeCluster}
                  onReorderClusters={reorderClusters}
                  onMoveSkill={moveSkillBetweenClusters}
                  onRemoveSkill={removeSkillFromCluster}
                  onAddCluster={addCluster}
                  maxClusters={nthMaxClusters}
                  isReadOnly={isFlexible && isFinalized}
                  removalLocked={nthRemovalLocked}
                  skills={nthDisplaySkills}
                  onAddSkill={name => addSkillToCategory('nth', name)}
                  onRemoveSkillFromPool={name => removeSkillFromPool('nth', name)}
                  mainSkillSet={nthClusters.length > 0 ? undefined : nthMainSkillSet}
                  parentGroups={nthParentGroupsState}
                />
              )}
            </>
            );
          })()}

          {/* ── Question Distribution panel REMOVED from UI per product feedback ─
              User-facing recruiters should not see the per-question skill mapping.
              Backend storage (special_instructions.mth_question_skill_map /
              nth_question_skill_map) is untouched — inspect via SQL only.
              Original render block is preserved below (wrapped in `false &&`) so
              it can be re-enabled by flipping the guard if the requirement changes.
          */}
          {false && isFixed && (mthClusters.length > 0 || (nthEnabled && nthClusters.length > 0)) && (() => {
            // Deterministic distribution — mirrors backend _fallback_distribute.
            type DistRow = { q: number; primary: string; secondaries: string[]; cluster: string; priority: number };
            // Local preview: distributes skills round-robin across Qs (primaries)
            // and spreads ALL remaining unused skills as secondaries on Qs of
            // the same cluster — no fixed cap, so 60 skills in = 60 covered out.
            // The authoritative mapping is the AI-generated one persisted in
            // si.skill_distribution at save time (see saveAndNavigate). The
            // panel below renders that when present, falling back to this
            // local function for the live in-progress preview.
            // 2026-05-22 cross-priority mix (mirrors backend
            // _apply_cross_priority_mix). Every Q gets a mix of P1+P2+P3
            // skills when the pool allows, primary priorities round-
            // robin across Q#s. Replaces the old priority-block layout
            // (Q1-Q4 all P1, Q5-Q6 all P2, Q7-Q8 all P3).
            const distribute = (clusters: Cluster[], qCount: number): DistRow[] => {
              if (qCount <= 0 || clusters.length === 0) return [];
              const valid = clusters.filter(c => (c.skills?.length ?? 0) > 0);
              if (valid.length === 0) return [];

              // Group all skills by priority (P3=High=3, P2=Medium=2, P1=Low=1)
              type PoolEntry = { skill: string; cluster: Cluster; priority: number };
              const byPriority = new Map<number, PoolEntry[]>();
              for (const c of valid) {
                const pri = c.priority ?? 1;
                for (const s of (c.skills ?? [])) {
                  if (typeof s !== 'string' || !s.trim()) continue;
                  const arr = byPriority.get(pri) ?? [];
                  arr.push({ skill: s, cluster: c, priority: pri });
                  byPriority.set(pri, arr);
                }
              }
              const priDesc = [...byPriority.keys()].sort((a, b) => b - a);
              if (priDesc.length === 0) return [];

              // Pass 1: pick primaries round-robin across priorities — Q1=highest
              // available, Q2=next priority, Q3=next, cycle. If a bucket is
              // exhausted, the slot falls to the next non-empty bucket.
              const used = new Set<string>();
              const cursor = new Map<number, number>();
              priDesc.forEach(p => cursor.set(p, 0));
              const out: DistRow[] = [];
              let priIdx = 0;
              while (out.length < qCount) {
                let placed = false;
                // Try priorities in round-robin order starting from priIdx.
                for (let attempt = 0; attempt < priDesc.length; attempt++) {
                  const p = priDesc[(priIdx + attempt) % priDesc.length];
                  const bucket = byPriority.get(p) ?? [];
                  const startCur = cursor.get(p) ?? 0;
                  for (let i = startCur; i < bucket.length; i++) {
                    const cand = bucket[i];
                    if (used.has(cand.skill.toLowerCase())) continue;
                    out.push({
                      q: out.length + 1,
                      primary: cand.skill,
                      secondaries: [],
                      cluster: cand.cluster.name ?? '',
                      priority: cand.priority,
                    });
                    used.add(cand.skill.toLowerCase());
                    cursor.set(p, i + 1);
                    priIdx = (priIdx + attempt + 1) % priDesc.length;
                    placed = true;
                    break;
                  }
                  if (placed) break;
                }
                if (!placed) break;  // all buckets exhausted
              }

              // Pass 2: rebuild secondaries — every Q tries OTHER-priority
              // skills first, then same-priority leftovers.
              const usedSec = new Set<string>();
              const remainingByPriority = new Map<number, string[]>();
              priDesc.forEach(p => {
                const bucket = byPriority.get(p) ?? [];
                remainingByPriority.set(p, bucket
                  .filter(e => !used.has(e.skill.toLowerCase()))
                  .map(e => e.skill));
              });

              for (const row of out) {
                // Pick one OTHER-priority skill from each bucket first.
                for (const op of priDesc) {
                  if (op === row.priority) continue;
                  if (row.secondaries.length >= 2) break;
                  const bucket = remainingByPriority.get(op) ?? [];
                  const pick = bucket.find(s => !usedSec.has(s.toLowerCase()));
                  if (pick) {
                    row.secondaries.push(pick);
                    usedSec.add(pick.toLowerCase());
                  }
                }
                // Same-priority fallback if still under 2.
                if (row.secondaries.length < 2) {
                  const bucket = remainingByPriority.get(row.priority) ?? [];
                  for (const s of bucket) {
                    if (row.secondaries.length >= 2) break;
                    if (usedSec.has(s.toLowerCase())) continue;
                    if (s.toLowerCase() === row.primary.toLowerCase()) continue;
                    row.secondaries.push(s);
                    usedSec.add(s.toLowerCase());
                  }
                }
              }

              // Pass 3: any still-unused skill → row with fewest secondaries.
              // Guarantees every skill appears at least once in coverage.
              const stillUnused: string[] = [];
              for (const p of priDesc) {
                for (const s of (remainingByPriority.get(p) ?? [])) {
                  if (!usedSec.has(s.toLowerCase())) stillUnused.push(s);
                }
              }
              for (const skill of stillUnused) {
                const candidates = out
                  .filter(r => r.primary.toLowerCase() !== skill.toLowerCase())
                  .sort((a, b) => a.secondaries.length - b.secondaries.length);
                const target = candidates[0];
                if (target) {
                  target.secondaries.push(skill);
                  usedSec.add(skill.toLowerCase());
                }
              }

              return out;
            };
            // 2026-05-22 fix: Distribution panel must mirror the saved
            // skill_distribution that the runtime actually follows. The
            // older local `distribute()` recomputed a DIFFERENT layout
            // (priority-block layout) which never matched what Bina
            // asked. Read from saved si.skill_distribution when present;
            // fall back to local distribute() only for fresh sessions
            // that haven't generated/saved yet.
            const savedSD = (() => {
              try {
                const raw = (config as any)?.special_instructions;
                if (!raw) return null;
                const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
                return s?.skill_distribution || null;
              } catch { return null; }
            })();
            const sdToRow = (q: any, idx: number): DistRow => {
              const primary = String(q?.primary_skill || '').trim();
              const secs = Array.isArray(q?.secondary_skills)
                ? q.secondary_skills.filter((s: any) => typeof s === 'string' && s.trim()).map((s: string) => s.trim())
                : [];
              return {
                q: Number(q?.question_number) || (idx + 1),
                primary,
                secondaries: secs,
                cluster: String(q?.cluster_name || ''),
                priority: Number(q?.cluster_priority) || 1,
              };
            };
            const mthDist: DistRow[] = (savedSD?.mth_questions?.length)
              ? savedSD.mth_questions.map(sdToRow)
              : distribute(mthClusters, timedAllocation.mthQuestions ?? 0);
            const nthDist: DistRow[] = (savedSD?.nth_questions?.length)
              ? savedSD.nth_questions.map(sdToRow)
              : (nthEnabled ? distribute(nthClusters, timedAllocation.nthQuestions ?? 0) : []);
            const totalQ = mthDist.length + nthDist.length;
            const totalSkillsCovered = new Set([
              ...mthDist.flatMap(r => [r.primary.toLowerCase(), ...r.secondaries.map(s => s.toLowerCase())]),
              ...nthDist.flatMap(r => [r.primary.toLowerCase(), ...r.secondaries.map(s => s.toLowerCase())]),
            ]).size;
            const priorityLabel = (p: number) => p >= 3 ? 'High' : p === 2 ? 'Medium' : 'Low';
            const priorityClass = (p: number) =>
              p >= 3 ? 'bg-success-subtle text-success ring-success-line'
                : p === 2 ? 'bg-warning-subtle text-warning ring-warning-line'
                : 'bg-rose-100 text-rose-700 ring-rose-200';

            const renderRow = (row: DistRow, sectionKey: 'mth' | 'nth') => (
              <div
                key={`${sectionKey}-${row.q}`}
                className="grid grid-cols-[44px_1fr_auto] items-start gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors"
              >
                <span className={`text-xs font-mono font-semibold mt-0.5 ${sectionKey === 'mth' ? 'text-brand-blue' : 'text-brand-cyan'}`}>
                  Q{row.q}
                </span>
                <div className="min-w-0 flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium text-gray-900">{row.primary}</span>
                  {row.secondaries.length > 0 && (
                    <>
                      <span className="text-gray-300">+</span>
                      {row.secondaries.map((s, i) => (
                        <span key={`${row.q}-sec-${i}`} className="px-1.5 py-0.5 rounded text-2xs font-medium bg-gray-100 text-gray-700 ring-1 ring-gray-200">
                          {s}
                        </span>
                      ))}
                    </>
                  )}
                  <span className="text-2xs text-gray-400 ml-1 truncate max-w-[180px]">· {row.cluster}</span>
                </div>
                <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full ring-1 mt-0.5 whitespace-nowrap ${priorityClass(row.priority)}`}>
                  {priorityLabel(row.priority)}
                </span>
              </div>
            );

            return (
              <div className="mt-6">
                {/* Collapsed card — click to expand */}
                {!showQuestionDistribution ? (
                  <button
                    type="button"
                    onClick={() => setShowQuestionDistribution(true)}
                    className="w-full bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 px-5 py-3 flex items-center justify-between hover:border-brand-blue/30 hover:shadow-brand-blue/10 transition-all"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                        <Layers className="w-3.5 h-3.5 text-brand-blue" />
                      </div>
                      <div className="text-left">
                        <div className="text-sm font-semibold text-gray-900">Question Distribution</div>
                        <div className="text-2xs text-gray-500">
                          {totalQ} question{totalQ !== 1 ? 's' : ''} · {totalSkillsCovered} skill{totalSkillsCovered !== 1 ? 's' : ''} covered
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-brand-blue">
                      Show
                      <ChevronDown className="w-3.5 h-3.5" />
                    </div>
                  </button>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 tf-round-edges">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                          <Layers className="w-4 h-4 text-brand-blue" />
                        </div>
                        <div>
                          <h2 className="text-base font-semibold text-gray-900 tracking-tight">Question Distribution</h2>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {totalQ} planned questions · {totalSkillsCovered} skills covered (primary + secondary)
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowQuestionDistribution(false)}
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium text-gray-500 hover:text-brand-blue hover:bg-brand-blue/5 transition-colors"
                        aria-label="Hide question distribution"
                      >
                        Hide
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="p-5 space-y-5">
                      {mthDist.length > 0 && (
                        <div>
                          <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                            Must-To-Have ({mthDist.length} questions)
                          </div>
                          <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
                            {mthDist.map(r => renderRow(r, 'mth'))}
                          </div>
                        </div>
                      )}

                      {nthDist.length > 0 && (
                        <div>
                          <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                            Nice-To-Have ({nthDist.length} questions)
                          </div>
                          <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
                            {nthDist.map(r => renderRow(r, 'nth'))}
                          </div>
                        </div>
                      )}

                      {mthDist.length === 0 && nthDist.length === 0 && (
                        <div className="text-sm text-gray-500 italic text-center py-6">
                          Generate clusters above to see how questions will be distributed.
                        </div>
                      )}

                      <div className="text-2xs text-gray-400 italic">
                        Each question evaluates a primary skill plus up to 2 secondary skills from the same cluster.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Time Allocation Summary REMOVED per spec — recruiters didn't
              want a per-cluster minute breakdown shown on the cluster page. */}
          </div>{/* closes flex-1 min-w-0 main content */}

          {/* ── Configuration Summary sidebar ── */}
          <div className="hidden lg:block w-64 xl:w-72 flex-shrink-0">
            <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4 sticky top-6 max-h-[calc(100dvh-8rem)] overflow-y-auto scrollbar-auto-hide">
              <div className="mb-4">
                <SectionHeader
                  icon={ClipboardList}
                  title="Configuration Summary"
                  subtitle="What this interview will look like once published."
                />
              </div>

              {/* Job Details */}
              {config && (
                <div className="border border-gray-100 rounded-lg overflow-hidden mb-4">
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                    <span className="text-xs font-medium text-brand-blue">Job Details</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    <div className="px-3 py-2 flex items-start justify-between gap-2">
                      <span className="text-xs text-gray-500 flex-shrink-0">Role Title</span>
                      <span className="text-xs font-semibold text-gray-900 text-right">{config.jd_title || config.position || '—'}</span>
                    </div>
                    {config.jd_experience_level && (
                      <div className="px-3 py-2 flex items-start justify-between gap-2">
                        <span className="text-xs text-gray-500 flex-shrink-0">Level</span>
                        <span className="text-xs font-semibold text-gray-900 text-right">{config.jd_experience_level}</span>
                      </div>
                    )}
                    {config.jd_location && (
                      <div className="px-3 py-2 flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-500 flex-shrink-0">Location</span>
                        <SummaryLocation value={config.jd_location} />
                      </div>
                    )}
                    {config.jd_version != null && (
                      <div className="px-3 py-2 flex items-start justify-between gap-2">
                        <span className="text-xs text-gray-500 flex-shrink-0">JD Version</span>
                        <span className="text-xs font-semibold text-gray-900 text-right">v{config.jd_version}</span>
                      </div>
                    )}
                    <div className="px-3 py-2 flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-500 flex-shrink-0">Interview Mode</span>
                      <span className="text-xs font-semibold text-gray-900 text-right">
                        {isFixed ? 'Timed' : 'Conversational'}
                      </span>
                    </div>
                    {config.duration_minutes != null && (
                      <div className="px-3 py-2 flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-500 flex-shrink-0">Total Duration</span>
                        <span className="text-xs font-semibold text-gray-900 text-right">{config.duration_minutes} min</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Question Budget + Clusters */}
              {isFixed && (
                <div className="border border-gray-100 rounded-lg overflow-hidden mb-4">
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                    <span className="text-xs font-medium text-brand-blue">Question Budget (Total: {timedAllocation.mthQuestions + timedAllocation.nthQuestions + timedAllocation.hrQuestions})</span>
                    <span className="text-xs text-gray-500">{fixedMthMin + fixedNthMin + fixedHrMin} min</span>
                  </div>
                  <div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="px-3 py-1.5 text-left font-medium text-gray-400">Round</th>
                          <th className="px-3 py-1.5 text-right font-medium text-gray-400">Q</th>
                          <th className="px-3 py-1.5 text-right font-medium text-gray-400">Clusters</th>
                          <th className="px-3 py-1.5 text-right font-medium text-gray-400">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-gray-50">
                          <td className="px-3 py-2 text-gray-600">Must-to-Have</td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-900">{timedAllocation.mthQuestions}</td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-900">{mthClusters.length > 0 ? mthClusters.length : mthMaxClusters}</td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-900">{fixedMthMin}m</td>
                        </tr>
                        {nthEnabled && (
                          <tr className="border-b border-gray-50">
                            <td className="px-3 py-2 text-gray-600">Nice-to-Have</td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-900">{timedAllocation.nthQuestions}</td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-900">{nthClusters.length > 0 ? nthClusters.length : nthMaxClusters}</td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-900">{fixedNthMin}m</td>
                          </tr>
                        )}
                        {hrEnabled && (
                          <tr>
                            <td className="px-3 py-2 text-gray-600">HR Round</td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-900">{timedAllocation.hrQuestions}</td>
                            <td className="px-3 py-2 text-right text-gray-400">—</td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-900">{fixedHrMin}m</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Cluster progress — a bar per bucket, because "2 / 3" is a
                  fraction the eye has to read where a bar is seen. */}
              <div className="border border-gray-100 rounded-lg overflow-hidden ring-1 ring-black/[0.02]">
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                  <span className="text-xs font-medium text-brand-blue">Cluster Progress</span>
                </div>
                <div className="p-3 space-y-3">
                  {[
                    { label: 'Must-to-Have', done: mthClusters.length, total: mthMaxClusters, show: true },
                    { label: 'Nice-to-Have', done: nthClusters.length, total: nthMaxClusters, show: nthEnabled },
                  ]
                    .filter(row => row.show)
                    .map(row => {
                      const complete = row.total > 0 && row.done >= row.total;
                      const pct = row.total > 0 ? Math.min(100, Math.round((row.done / row.total) * 100)) : 0;
                      return (
                        <div key={row.label}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-600">{row.label}</span>
                            <span className={`text-xs font-semibold ${
                              complete ? 'text-advice-positive' : row.done > 0 ? 'text-gray-900' : 'text-gray-400'
                            }`}>
                              {row.done} / {row.total}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                complete ? 'bg-advice-positive' : 'bg-brand-blue'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>

          </div>{/* closes two-column flex */}

            {/* ── Wizard actions ── */}
            {/* In normal flow at the end of the page (not sticky), matching
                the Configure step. */}
            <div className="mt-6 pt-4 border-t border-gray-100 dark:border-slate-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              {/* Mobile: two rows — leave (Back + Discard) over advance (Save +
                  Continue), each button sharing its row — instead of four buttons
                  in one line that overflowed the viewport. */}
              <div className="flex items-center justify-between sm:justify-start gap-2">
                <Button variant="secondary" size="md" onClick={handleBack} disabled={saving || generating} icon={<ArrowLeft className="w-4 h-4" />}>
                  <span className="sm:hidden">Back</span>
                  <span className="hidden sm:inline">Back to Configure</span>
                </Button>
                <WizardDiscardButton onClick={handleDiscard} disabled={saving || generating} label={discardDeletesVersion ? 'Discard' : 'Discard changes'} />
              </div>
              <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
                <Button
                  variant="secondary"
                  size="md"
                  onClick={handleSaveAsDraft}
                  disabled={saving || generating}
                  icon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
                >
                  Save as Draft
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleContinue}
                  disabled={saving || generating}
                  icon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
                >
                  {saving ? 'Saving...' : (
                    <>
                      <span className="sm:hidden">Continue</span>
                      <span className="hidden sm:inline">Continue to Preview</span>
                    </>
                  )}
                  {!saving && (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </Button>
              </div>
            </div>
          </div>{/* closes p-4 inner wrapper */}
        </div>{/* closes mx-auto max-w wrapper */}
      </main>{/* closes flex-1 main */}


    </DndProvider>
  );
}
