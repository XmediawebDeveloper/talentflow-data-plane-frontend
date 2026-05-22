'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, CheckCircle2, Loader2, Shield, Star, Plus, X,
  Sparkles, GripVertical, ChevronDown, ChevronUp, Layers, Clock,
  Trash2, AlertTriangle, CheckCheck, Info, Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import type { AIInterviewResponse, AIInterviewRoundConfig } from '@/lib/services/aiInterviewService';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import {
  PRIORITY_LABELS as SHARED_PRIORITY_LABELS,
  normalizePriority as sharedNormalizePriority,
} from '@/lib/constants/aiInterviewPriority';
import { AIInterviewStepIndicator } from './AIInterviewStepIndicator';

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
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${info.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${info.dot}`} />
      {info.short}
    </span>
  );
}

/* ── Draggable Skill Badge ── */
function DraggableClusterSkill({
  skillName,
  clusterId,
  category,
  onRemove,
  isReadOnly = false,
  chipClass,
  isAiDerived = false,
}: {
  skillName: string;
  clusterId: string;
  category: 'mth' | 'nth';
  onRemove: (skillName: string, clusterId: string) => void;
  isReadOnly?: boolean;
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
      className={`group/chip inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-all duration-200 backdrop-blur-sm ${
        isReadOnly ? 'cursor-default' : 'cursor-grab active:cursor-grabbing hover:-translate-y-0.5 hover:shadow-sm'
      } ${isDragging ? 'opacity-40 scale-95' : 'opacity-100 scale-100'} ${chipClass ?? 'bg-white border-gray-200 text-gray-700'} ${isAiDerived ? 'italic' : ''}`}
    >
      {!isReadOnly && <GripVertical className="w-3 h-3 flex-shrink-0 opacity-40 group-hover/chip:opacity-70 transition-opacity" />}
      {isAiDerived && <Sparkles className="w-3 h-3 flex-shrink-0 opacity-70" />}
      <span className="font-medium">{skillName}</span>
      {!isReadOnly && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(skillName, clusterId); }}
          className="ml-0.5 opacity-50 hover:opacity-100 transition-all hover:text-red-500 hover:scale-110"
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
        className={`flex items-center gap-2 px-3.5 py-3 cursor-pointer transition-all duration-200 ${expanded ? 'hover:bg-brand-blue/[0.04]' : 'hover:bg-brand-blue/[0.025]'}`}
        onClick={() => onToggleExpand(cluster.id)}
      >
        {/* Hide drag handle when read-only (flexible finalized) */}
        {!isReadOnly && (
          <div ref={drag as unknown as React.Ref<HTMLDivElement>} className="cursor-grab active:cursor-grabbing p-0.5 opacity-30 hover:opacity-70 transition-opacity">
            <GripVertical className="w-4 h-4 text-gray-400" />
          </div>
        )}
        <PriorityBadge p={cluster.priority} />
        {visibleClusterSkills.length === 0 && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-semibold bg-red-50 text-red-600 border border-red-200/70 flex-shrink-0">
            <AlertTriangle className="w-2.5 h-2.5" /> Empty
          </span>
        )}
        <span className={`text-sm font-semibold flex-1 truncate transition-colors ${expanded ? 'text-brand-blue-deep' : 'text-gray-900'}`}>
          {cluster.name || 'Unnamed Cluster'}
        </span>
        {(() => {
          const aiCount = visibleClusterSkills.filter(isAiDerivedSkill).length;
          if (aiCount === 0) return null;
          return (
            <span
              title={`${aiCount} skill${aiCount !== 1 ? 's' : ''} merged or added by AI from your inputs`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold bg-gradient-to-r from-brand-blue/10 to-brand-blue/5 text-brand-blue border border-brand-blue/20 flex-shrink-0 shadow-sm shadow-brand-blue/5"
            >
              <Sparkles className="w-2.5 h-2.5" />
              {aiCount} AI
            </span>
          );
        })()}
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600 ring-1 ring-gray-200/60">
          {visibleClusterSkills.length} skill{visibleClusterSkills.length !== 1 ? 's' : ''}
        </span>
        <div className={`flex items-center justify-center w-6 h-6 rounded-full transition-all duration-300 ${expanded ? 'bg-brand-blue/15 text-brand-blue rotate-180' : 'text-gray-400 hover:bg-gray-100'}`}>
          <ChevronDown className="w-3.5 h-3.5" />
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 space-y-3 border-t border-brand-blue/10 relative">
          {/* Cluster name + Priority side-by-side for compactness */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="col-span-2">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Cluster Name</label>
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
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Priority</label>
              <select
                value={cluster.priority}
                onChange={(e) => onUpdate(cluster.id, { priority: Number(e.target.value) as Cluster['priority'] })}
                disabled={isReadOnly}
                className={`mt-1 w-full px-3 py-2 text-sm bg-white/80 backdrop-blur-sm border border-gray-200/80 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue/60 focus:bg-white transition-all ${isReadOnly ? 'text-gray-500 cursor-not-allowed' : ''}`}
              >
                {[3, 2, 1].map(p => (
                  <option key={p} value={p}>{PRIORITY_LABELS[p].label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Reason / description was removed per UX request. cluster.reason
              is still preserved on the data model so Linda's prompts can use
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
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">
                        Skills ({totalCount}{commandCount > 0 ? ` · ${commandCount} command${commandCount === 1 ? '' : 's'}` : ''})
                      </div>
                      {commandCount > 0 && (
                        <div className="flex items-center gap-2 text-[9px] text-gray-400">
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
            {!isReadOnly && <p className="text-[9px] text-gray-300 mt-1.5">Drag skills to move between clusters</p>}
          </div>

          {/* Remove cluster button — hidden when read-only */}
          {!isReadOnly && (
            <div className="flex justify-end pt-1">
              <button
                onClick={() => onRemove(cluster.id)}
                className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded-md transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                Remove Cluster
              </button>
            </div>
          )}
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
  skills = [],
  onAddSkill,
  onRemoveSkillFromPool,
  mainSkillSet,
  parentGroups,
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
  skills?: SkillEntry[];
  onAddSkill?: (skillName: string) => void;
  onRemoveSkillFromPool?: (skillName: string) => void;
  mainSkillSet?: Set<string>;
  parentGroups?: { parent: string; sub_skills: string[] }[];
}) {
  const [newSkillInput, setNewSkillInput] = useState('');
  const [skillInputError, setSkillInputError] = useState('');

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

  const handleAddSkill = () => {
    const trimmed = newSkillInput.trim();
    if (!trimmed) { setSkillInputError('Skill name cannot be empty'); return; }
    const duplicate = skills.some(s => s.name.toLowerCase() === trimmed.toLowerCase());
    if (duplicate) { setSkillInputError(`"${trimmed}" already exists`); return; }
    onAddSkill?.(trimmed);
    setNewSkillInput('');
    setSkillInputError('');
  };

  // Track which skills are assigned to at least one cluster
  const assignedSkillNames = new Set(
    clusters.flatMap(c => c.skills.map(s => s.toLowerCase().trim()))
  );
  const clusterMinuteMap = allocateClusterMinutes(clusters, timeMin);
  const atLimit = maxClusters > 0 && clusters.length >= maxClusters;

  return (
    <div className="relative bg-white rounded-2xl border border-gray-200/70 ring-1 ring-black/[0.02] shadow-[0_1px_3px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(59,130,246,0.08)] overflow-hidden">
      {/* Subtle ambient gradient on top edge */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-blue/30 to-transparent" />

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100/80 bg-gradient-to-br from-slate-50/80 via-white to-brand-blue/[0.02]">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-brand-blue/15 to-brand-blue/5 ring-1 ring-brand-blue/15 text-brand-blue shadow-sm shadow-brand-blue/10">
            {icon}
          </div>
          <div className="flex flex-col">
            <h2 className="text-base font-semibold text-gray-900 tracking-tight leading-tight">{title}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              {timeMin > 0 && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/15">
                  <Clock className="w-2.5 h-2.5" />
                  {timeMin} min
                </span>
              )}
              {maxClusters > 0 && (
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium ${
                  atLimit
                    ? 'bg-red-50 text-red-700 ring-1 ring-red-200'
                    : 'bg-slate-100 text-gray-600 ring-1 ring-gray-200/70'
                }`}>
                  {clusters.length}/{maxClusters} clusters
                </span>
              )}
            </div>
          </div>
        </div>
        {/* "Add Cluster" button removed per product feedback — cluster
            structure is finalized by the AI generator; manual cluster
            additions on this page are no longer offered. Use "Regenerate
            with AI" to rebuild the cluster set. */}
      </div>

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
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all hover:-translate-y-0.5 hover:shadow-sm ${chipClass}`}
            >
              {entry.name}
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={() => onRemoveSkillFromPool?.(entry.name)}
                  className="ml-0.5 opacity-50 hover:opacity-100 hover:text-red-500 transition-all hover:scale-110"
                  aria-label="Remove" title="Remove"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          );
        };

        return (
          <div className="px-4 pt-4 pb-3 border-b border-gray-100/70">
            {totalCount === 0 ? (
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Skills</span>
                <span className="text-xs text-gray-400">0</span>
              </div>
            ) : (
              <div className="mb-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Skills <span className="text-gray-400 font-normal">({totalCount}{commandCount > 0 ? ` · ${commandCount} command${commandCount === 1 ? '' : 's'}` : ''})</span>
                  </span>
                  {commandCount > 0 && (
                    <div className="flex items-center gap-2.5 text-[10px] text-gray-400">
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
                  {sorted.map(e => renderChip(e))}
                </div>
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
          <div className="py-10 text-center border-2 border-dashed border-brand-blue/20 rounded-xl bg-gradient-to-br from-brand-blue/5 via-white to-brand-cyan/5">
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
              skillTypeLookup={skillTypeLookup}
              mainSkillSet={mainSkillSet}
            />
          ))
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  Main Component                                                          */
/* ─────────────────────────────────────────────────────────────────────── */

export default function AIInterviewClusters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id') || '';

  /* Loading / saving states */
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  /* Config from server */
  const [config, setConfig] = useState<AIInterviewResponse | null>(null);

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

  /* ── Load draft ── */
  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        const draft = await aiInterviewService.get(id);
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
        if (si.mth_clusters?.length) {
          const mthMax = isFlexibleMode ? 3 : timedAllocation.mthMaxClusters;
          const mthTrimmed = trimAndRedistribute(si.mth_clusters as any[], mthMax);
          const mthRestored = mthTrimmed.map((c: any) => ({
            ...c,
            priority: normalizePriority(c.priority),
          }));
          setMthClusters(mthRestored);
          // Intentionally NOT auto-expanding — cluster cards stay collapsed by default per UX spec
        }
        if (si.nth_clusters?.length) {
          const nthMax = isFlexibleMode ? 2 : timedAllocation.nthMaxClusters;
          // nthEnabledForTimed=false means NHS is disabled — always clear saved clusters
          const nthTrimmed = !nthEnabledForTimed
            ? []
            : trimAndRedistribute(si.nth_clusters as any[], nthMax);
          const nthRestored = nthTrimmed.map((c: any) => ({
            ...c,
            priority: normalizePriority(c.priority),
          }));
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
    const setter = category === 'mth' ? setMthClusters : setNthClusters;
    setter(prev => prev.filter(c => c.id !== id));
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

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
      const preExpansionMth = mthSkillNames.slice();
      const preExpansionNth = nthSkillNames.slice();

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
          // Target = Q × 2 — matches backend CLUSTER_CAPACITY_FLOOR_FACTOR (2)
          // so the resulting skill pool lands inside the "within" capacity
          // band (floor=2Q, ceiling=3Q) rather than "below" (which would
          // trigger another expansion round or leave the distributor with
          // too few primaries to fill every Q without duplicates).
          // Floor enforced at backend `expand-skills` (line ~1330 in
          // ai_interview.py) tops up via deterministic placeholders if the
          // LLM under-delivers, so this target is a hard guarantee — not
          // a soft hint.
          const mthTarget = Math.max(mthQ * 2, mthExpandInput.length + 1);
          const nthTarget = Math.max(nthQ * 2, nthExpandInput.length + 1);
          // Pass the other bucket's already-typed skills so the LLM does
          // not pull them into THIS bucket (e.g. Git typed in NTH must not
          // be absorbed into MTH expansion).
          const mthOtherBucket = nthSkillNames;
          const nthOtherBucket = mthSkillNames;
          const [mthExpandRes, nthExpandRes] = await Promise.all([
            (mthShort || mthRecover)
              ? aiInterviewService.expandSkills({
                  mainSkills: mthExpandInput,
                  targetSkillCount: mthTarget,
                  bucket: 'MTH',
                  jdTitle: config?.position,
                  jdDescription: jdDescription || undefined,
                  otherBucketSkills: mthOtherBucket,
                })
              : Promise.resolve({ flat_skills: mthSkillNames, expanded_skills: [] as { parent: string; sub_skills: string[] }[] }),
            (nthShort || nthRecover)
              ? aiInterviewService.expandSkills({
                  mainSkills: nthExpandInput,
                  targetSkillCount: nthTarget,
                  bucket: 'NTH',
                  jdTitle: config?.position,
                  jdDescription: jdDescription || undefined,
                  otherBucketSkills: nthOtherBucket,
                })
              : Promise.resolve({ flat_skills: nthSkillNames, expanded_skills: [] as { parent: string; sub_skills: string[] }[] }),
          ]);
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
      );
      console.log('[CLUSTER-DEBUG] /generate-clusters response:', {
        mthClusterCount: result.mth_clusters?.length ?? 0,
        nthClusterCount: result.nth_clusters?.length ?? 0,
        mthSkillsTotal: (result.mth_clusters ?? []).reduce((s, c) => s + (c.skills?.length ?? 0), 0),
        nthSkillsTotal: (result.nth_clusters ?? []).reduce((s, c) => s + (c.skills?.length ?? 0), 0),
        mthClusters: (result.mth_clusters ?? []).map(c => ({ name: c.name, priority: c.priority, skillCount: c.skills?.length ?? 0 })),
        nthClusters: (result.nth_clusters ?? []).map(c => ({ name: c.name, priority: c.priority, skillCount: c.skills?.length ?? 0 })),
      });
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

          await aiInterviewService.update(id, {
            special_instructions: JSON.stringify(si),
            rounds_config: rounds,
          });
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
      toast.error('Failed to generate clusters');
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
    router.replace(`/recruitment/ai-interviews/jd-selection/ai-interview-config/clusters?id=${id}`);
    // forceExpand on the auto-trigger so /expand-skills always runs on first
    // entry from Configure — recruiter shouldn't need to click "Regenerate"
    // to see sub-skill expansion when arriving with e.g. 2 NTH skills.
    void handleGenerateClusters({ forceExpand: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, config, id, mthSkills.length, nthSkills.length]);

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
      // AI-driven skill→question mapping (only on finalize). Replaces the local
      // JS distribute() formula that capped secondaries at 2/Q and silently
      // dropped extra skills. Server guarantees every input skill appears at
      // least once (primary or secondary) — see /distribute-skills rule #5.
      if (finalize && isFixed) {
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
      await aiInterviewService.update(id, {
        special_instructions: JSON.stringify(si),
        rounds_config: buildUpdatedRoundsConfig(),
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
      `/recruitment/ai-interviews/jd-selection/ai-interview-config?jd_id=${config.jd_id || ''}&config_id=${id}`
    );
  };

  const handleContinue = () => {
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
      '/recruitment/ai-interviews/jd-selection/ai-interview-config/preview?id=' + id,
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
      await aiInterviewService.update(id, {
        special_instructions: JSON.stringify(si),
        rounds_config: buildUpdatedRoundsConfig(),
      });
      toast.success('Draft saved!');
      router.push('/recruitment/ai-interviews');
    } catch {
      toast.error('Failed to save draft');
    } finally {
      setSaving(false);
    }
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
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-brand-blue" />
          <p className="text-sm text-gray-500">Loading cluster configuration...</p>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
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
      <main className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50 dark:bg-slate-950">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="p-4 md:p-8 pb-24 w-full min-h-[calc(100vh-7rem)] bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
            <PageBreadcrumb
              className="mb-4 md:mb-6"
              items={[
                { label: 'Dashboard', href: '/dashboard' },
                { label: 'AI Interviews', href: '/recruitment/ai-interviews' },
                { label: 'Clusters' },
              ]}
            />
          {/* Header */}
          <div className="mb-6">
            {/* Step indicator */}
            <AIInterviewStepIndicator currentStep={CURRENT_STEP} />

            {/* Header row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleBack}
                  disabled={saving}
                  className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="w-11 h-11 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                  <Layers className="w-5 h-5 text-brand-blue" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h1 className="text-xl font-semibold text-gray-900 tracking-tight">Skill Clusters</h1>
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
                        return out;
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
                      const mthDist = distribute(mthClusters, timedAllocation.mthQuestions ?? 0, mthJdPool);
                      const nthDist = nthEnabled ? distribute(nthClusters, timedAllocation.nthQuestions ?? 0, nthJdPool) : [];
                      const totalQ = mthDist.length + nthDist.length;
                      const totalSkillsCovered = new Set([
                        ...mthDist.flatMap(r => [r.primary.toLowerCase(), ...r.secondaries.map(s => s.name.toLowerCase())]),
                        ...nthDist.flatMap(r => [r.primary.toLowerCase(), ...r.secondaries.map(s => s.name.toLowerCase())]),
                      ]).size;
                      // P1/P2/P3 tier labels (replaces High/Medium/Low + the
                      // primary-vs-secondary visual highlight). Every skill in
                      // a Q now renders identically — same chip style, same tag
                      // shape — so the recruiter sees a flat list per Q instead
                      // of one "important" skill + accessory chips.
                      const priorityLabel = (p: number) => p >= 3 ? 'P1' : p === 2 ? 'P2' : 'P3';
                      const priorityClass = (p: number) =>
                        p >= 3 ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                          : p === 2 ? 'bg-amber-50 text-amber-700 ring-amber-200'
                          : 'bg-rose-50 text-rose-700 ring-rose-200';
                      const renderRow = (row: DistRow, sectionKey: 'mth' | 'nth') => {
                        // Treat primary + secondaries as a single flat list of
                        // chips. Primary keeps its own priority (from the
                        // cluster); secondaries carry their own priority too
                        // (when borrowed from a different-priority cluster).
                        const chips = [
                          { name: row.primary, priority: row.priority },
                          ...row.secondaries,
                        ];
                        return (
                          <tr
                            key={`${sectionKey}-${row.q}`}
                            className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors"
                          >
                            <td className="align-top px-2 py-1.5 w-[40px]">
                              <span className={`text-[11px] font-mono font-semibold ${sectionKey === 'mth' ? 'text-brand-blue' : 'text-brand-cyan'}`}>
                                Q{row.q}
                              </span>
                            </td>
                            <td className="align-top px-2 py-1.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {chips.map((s, i) => (
                                  <span
                                    key={`${row.q}-chip-${i}`}
                                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ring-1 ${priorityClass(s.priority)}`}
                                  >
                                    {s.name}
                                    <span className="text-[9px] font-semibold opacity-80">{priorityLabel(s.priority)}</span>
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        );
                      };
                      return (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              aria-label=" "
                              title=""
                              className="inline-flex items-center justify-center w-1.5 h-1.5 rounded-full bg-gray-300 hover:bg-brand-blue transition-colors ml-1"
                            />
                          </PopoverTrigger>
                          <PopoverContent
                            side="bottom"
                            align="start"
                            className="w-[480px] max-h-[70vh] overflow-y-auto p-0"
                          >
                            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                              <div>
                                <div className="text-sm font-semibold text-gray-900">Question Distribution</div>
                                <div className="text-[11px] text-gray-500">
                                  {totalQ} questions · {totalSkillsCovered} skills covered
                                </div>
                              </div>
                            </div>
                            <div className="p-4 space-y-4">
                              {mthDist.length > 0 && (
                                <div>
                                  <div className="text-[10px] font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                                    Must-To-Have ({mthDist.length})
                                  </div>
                                  <div className="border border-gray-100 rounded-md overflow-hidden">
                                    <table className="w-full text-left">
                                      <thead className="bg-gray-50 border-b border-gray-100">
                                        <tr>
                                          <th className="px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider w-[40px]">Q#</th>
                                          <th className="px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Skills</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {mthDist.map(r => renderRow(r, 'mth'))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                              {nthDist.length > 0 && (
                                <div>
                                  <div className="text-[10px] font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                                    Nice-To-Have ({nthDist.length})
                                  </div>
                                  <div className="border border-gray-100 rounded-md overflow-hidden">
                                    <table className="w-full text-left">
                                      <thead className="bg-gray-50 border-b border-gray-100">
                                        <tr>
                                          <th className="px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider w-[40px]">Q#</th>
                                          <th className="px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Skills</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {nthDist.map(r => renderRow(r, 'nth'))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                              {mthDist.length === 0 && nthDist.length === 0 && (
                                <div className="text-xs text-gray-500 italic text-center py-4">
                                  Generate clusters first.
                                </div>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
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
                        className="w-[440px] max-h-[70vh] overflow-y-auto p-5 text-sm leading-relaxed"
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
                            <div className="space-y-0.5 font-mono text-[11px] text-gray-800">
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
                  <p className="text-sm text-gray-500 mt-0.5">
                    Organize skills into weighted clusters for focused interview coverage
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Skill Importance toggle REMOVED — per-skill High/Med/Low
                    selection is no longer surfaced on the cluster page. */}
                {/* Hide regenerate when flexible mode clusters are finalized */}
                {!(isFlexible && isFinalized) && (
                  <button
                    onClick={handleGenerateClusters}
                    disabled={generating || saving}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {generating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {generating ? 'Generating...' : 'Regenerate with AI'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── Two-column layout: main content + config summary sidebar ── */}
          <div className="flex gap-6 items-start">
          <div className="flex-1 min-w-0 space-y-6 pb-24">

          {/* Flexible mode: finalized lock banner */}
          {isFlexible && isFinalized && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 bg-gradient-to-r from-brand-orange/5 via-white to-brand-orange/10 border border-brand-orange/20 ring-1 ring-brand-orange/10 shadow-sm shadow-brand-orange/10 rounded-xl">
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

          {/* Generating overlay within content area */}
          {generating && (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-brand-blue" />
                <p className="text-sm text-gray-500">AI is analyzing skills and generating clusters...</p>
              </div>
            </div>
          )}

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
            const distribute = (clusters: Cluster[], qCount: number): DistRow[] => {
              if (qCount <= 0 || clusters.length === 0) return [];
              const sorted = [...clusters]
                .filter(c => (c.skills?.length ?? 0) > 0)
                .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
              const flat: { skill: string; cluster: Cluster }[] = [];
              for (const c of sorted) {
                for (const s of (c.skills ?? [])) {
                  if (typeof s === 'string' && s.trim()) flat.push({ skill: s, cluster: c });
                }
              }
              if (flat.length === 0) return [];
              const used = new Set<string>();
              const out: DistRow[] = [];
              let idx = 0;
              // Pass 1: primaries
              for (let q = 1; q <= qCount; q++) {
                let pick: { skill: string; cluster: Cluster } | null = null;
                for (let attempts = 0; attempts < flat.length; attempts++) {
                  const cand = flat[idx % flat.length];
                  idx++;
                  if (!used.has(cand.skill.toLowerCase())) { pick = cand; break; }
                }
                if (!pick) pick = flat[(q - 1) % flat.length];
                used.add(pick.skill.toLowerCase());
                out.push({
                  q,
                  primary: pick.skill,
                  secondaries: [],
                  cluster: pick.cluster.name ?? '',
                  priority: pick.cluster.priority ?? 1,
                });
              }
              // Pass 2: distribute ALL remaining unused skills as secondaries —
              // place each on the same-cluster Q with the fewest secondaries so
              // they spread evenly. No cap; every skill must appear.
              const remaining = flat.filter(({ skill }) => !used.has(skill.toLowerCase()));
              for (const { skill, cluster } of remaining) {
                const candidates = out
                  .filter(row => row.cluster === (cluster.name ?? ''))
                  .sort((a, b) => a.secondaries.length - b.secondaries.length);
                const target = candidates[0] ?? out
                  .slice()
                  .sort((a, b) => a.secondaries.length - b.secondaries.length)[0];
                if (target) {
                  target.secondaries.push(skill);
                  used.add(skill.toLowerCase());
                }
              }
              return out;
            };
            const mthDist = distribute(mthClusters, timedAllocation.mthQuestions ?? 0);
            const nthDist = nthEnabled
              ? distribute(nthClusters, timedAllocation.nthQuestions ?? 0)
              : [];
            const totalQ = mthDist.length + nthDist.length;
            const totalSkillsCovered = new Set([
              ...mthDist.flatMap(r => [r.primary.toLowerCase(), ...r.secondaries.map(s => s.toLowerCase())]),
              ...nthDist.flatMap(r => [r.primary.toLowerCase(), ...r.secondaries.map(s => s.toLowerCase())]),
            ]).size;
            const priorityLabel = (p: number) => p >= 3 ? 'High' : p === 2 ? 'Medium' : 'Low';
            const priorityClass = (p: number) =>
              p >= 3 ? 'bg-emerald-100 text-emerald-700 ring-emerald-200'
                : p === 2 ? 'bg-amber-100 text-amber-700 ring-amber-200'
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
                        <span key={`${row.q}-sec-${i}`} className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-700 ring-1 ring-gray-200">
                          {s}
                        </span>
                      ))}
                    </>
                  )}
                  <span className="text-[11px] text-gray-400 ml-1 truncate max-w-[180px]">· {row.cluster}</span>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 mt-0.5 whitespace-nowrap ${priorityClass(row.priority)}`}>
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
                        <div className="text-[11px] text-gray-500">
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
                  <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
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

                      <div className="text-[11px] text-gray-400 italic">
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
            <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4 sticky top-6">
              <h3 className="font-semibold text-gray-900 text-sm mb-4 tracking-tight">Configuration Summary</h3>

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
                    {(config as any).jd_location && (
                      <div className="px-3 py-2 flex items-start justify-between gap-2">
                        <span className="text-xs text-gray-500 flex-shrink-0">Location</span>
                        <span className="text-xs font-semibold text-gray-900 text-right">{(config as any).jd_location}</span>
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
              )}

              {/* Cluster progress */}
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                  <span className="text-xs font-medium text-brand-blue">Cluster Progress</span>
                </div>
                <div className="divide-y divide-gray-50">
                  <div className="px-3 py-2 flex items-center justify-between">
                    <span className="text-xs text-gray-500">Must-to-Have</span>
                    <span className={`text-xs font-semibold ${mthClusters.length > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                      {mthClusters.length} / {mthMaxClusters}
                    </span>
                  </div>
                  {nthEnabled && (
                    <div className="px-3 py-2 flex items-center justify-between">
                      <span className="text-xs text-gray-500">Nice-to-Have</span>
                      <span className={`text-xs font-semibold ${nthClusters.length > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                        {nthClusters.length} / {nthMaxClusters}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          </div>{/* closes two-column flex */}
        </div>{/* closes w-full */}
      </div>{/* closes flex-1 p-4 */}

      {/* ── Sticky footer ── */}
      <div className="fixed bottom-0 left-0 lg:left-64 right-0 bg-white border-t border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={handleBack}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors disabled:opacity-50"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Configure
            </button>
            <button
              onClick={handleDiscard}
              disabled={saving}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              Discard
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveAsDraft}
              disabled={saving || generating}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Save as Draft
            </button>
            <button
              onClick={handleContinue}
              disabled={saving || generating}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? 'Saving...' : 'Continue to Preview'}
              {!saving && (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

    </DndProvider>
  );
}
