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
import {
  PRIORITY_LABELS as SHARED_PRIORITY_LABELS,
  normalizePriority as sharedNormalizePriority,
} from '@/lib/constants/aiInterviewPriority';

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

const STEPS = ['Select JD', 'Configure', 'Clusters', 'Preview & Publish'];
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
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs border transition-all ${
        isReadOnly ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
      } ${isDragging ? 'opacity-40' : 'opacity-100'} ${chipClass ?? 'bg-white border-gray-200 text-gray-700'} ${isAiDerived ? 'italic' : ''}`}
    >
      {!isReadOnly && <GripVertical className="w-3 h-3 flex-shrink-0 text-gray-300" />}
      {isAiDerived && <Sparkles className="w-3 h-3 flex-shrink-0 opacity-70" />}
      {skillName}
      {!isReadOnly && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(skillName, clusterId); }}
          className="ml-0.5 text-gray-400 transition-colors hover:text-red-500"
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
      className={`border rounded-lg transition-all ${
        isDragging ? 'opacity-40' : ''
      } ${expanded ? 'border-brand-blue/30 bg-brand-blue/5 ring-1 ring-brand-blue/10' : 'border-gray-200 bg-white hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10'
      } ${isOver ? 'border-brand-blue bg-brand-blue/5' : ''
      } ${isSkillOver ? 'ring-2 ring-brand-blue/40 bg-brand-blue/10' : ''}`}
    >
      {/* Collapsed header */}
      <div
        className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors ${expanded ? 'hover:bg-brand-blue/10' : 'hover:bg-brand-blue/5'}`}
        onClick={() => onToggleExpand(cluster.id)}
      >
        {/* Hide drag handle when read-only (flexible finalized) */}
        {!isReadOnly && (
          <div ref={drag as unknown as React.Ref<HTMLDivElement>} className="cursor-grab active:cursor-grabbing p-0.5">
            <GripVertical className="w-4 h-4 text-gray-300" />
          </div>
        )}
        <PriorityBadge p={cluster.priority} />
        {visibleClusterSkills.length === 0 && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-red-100 text-red-600 border border-red-200 flex-shrink-0">
            <AlertTriangle className="w-2.5 h-2.5" /> Empty
          </span>
        )}
        <span className="text-sm font-medium text-gray-900 flex-1 truncate">
          {cluster.name || 'Unnamed Cluster'}
        </span>
        {(() => {
          const aiCount = visibleClusterSkills.filter(isAiDerivedSkill).length;
          if (aiCount === 0) return null;
          return (
            <span
              title={`${aiCount} skill${aiCount !== 1 ? 's' : ''} merged or added by AI from your inputs`}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-brand-blue/10 text-brand-blue border border-brand-blue/20 flex-shrink-0"
            >
              <Sparkles className="w-2.5 h-2.5" />
              {aiCount} AI
            </span>
          );
        })()}
        <span className="text-xs text-gray-500">
          {visibleClusterSkills.length} skill{visibleClusterSkills.length !== 1 ? 's' : ''}
        </span>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-brand-blue" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-gray-100">
          {/* Cluster name */}
          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Cluster Name</label>
            <input
              type="text"
              value={cluster.name}
              onChange={(e) => onUpdate(cluster.id, { name: e.target.value })}
              disabled={isReadOnly}
              className={`mt-1 w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue ${isReadOnly ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''}`}
              placeholder="e.g. Core Backend Skills"
            />
          </div>

          {/* Priority dropdown */}
          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Priority</label>
            <select
              value={cluster.priority}
              onChange={(e) => onUpdate(cluster.id, { priority: Number(e.target.value) as Cluster['priority'] })}
              disabled={isReadOnly}
              className={`mt-1 w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white ${isReadOnly ? 'text-gray-500 cursor-not-allowed' : ''}`}
            >
              {[3, 2, 1].map(p => (
                <option key={p} value={p}>{PRIORITY_LABELS[p].label}</option>
              ))}
            </select>
          </div>

          {/* Reason / description */}
          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Reason / Description</label>
            <textarea
              value={cluster.reason ?? ''}
              onChange={(e) => onUpdate(cluster.id, { reason: e.target.value })}
              disabled={isReadOnly}
              rows={2}
              className={`mt-1 w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue resize-none ${isReadOnly ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''}`}
              placeholder="Why is this cluster important?"
            />
          </div>

          {/* Skills — grouped by type (Skill / Command) */}
          <div>
            {visibleClusterSkills.length > 0 ? (
              (() => {
                const groups: Record<SkillType, string[]> = { Skill: [], Command: [] };
                for (const s of visibleClusterSkills) {
                  const rawType = skillTypeLookup?.get(s.toLowerCase().trim()) ?? 'Skill';
                  // Coerce any legacy 'Certification' entries (from older saved
                  // sessions) into 'Skill' so they still render somewhere.
                  const t: SkillType = rawType === 'Command' ? 'Command' : 'Skill';
                  groups[t].push(s);
                }
                // Order within each type: recruiter-typed main skills first,
                // AI-derived sub-skills / merged canonicals after. Stable sort
                // preserves original ordering within each segment.
                const sortMainFirst = (arr: string[]) =>
                  [...arr].sort((a, b) => {
                    const aDerived = isAiDerivedSkill(a) ? 1 : 0;
                    const bDerived = isAiDerivedSkill(b) ? 1 : 0;
                    return aDerived - bDerived;
                  });
                groups.Skill = sortMainFirst(groups.Skill);
                groups.Command = sortMainFirst(groups.Command);
                const groupOrder: { type: SkillType; label: string; chipClass: string }[] = [
                  { type: 'Skill', label: 'Skills', chipClass: 'bg-purple-50 border-purple-200 text-purple-700' },
                  { type: 'Command', label: 'Commands', chipClass: 'bg-blue-50 border-blue-200 text-blue-700' },
                ];
                const visible = groupOrder.filter(g => groups[g.type].length > 0);
                return (
                  <div className="space-y-2 mt-1.5">
                    {visible.map(g => (
                      <div key={g.type}>
                        {/* Always show the type sub-header so Skills and
                            Commands are visually separated within every
                            cluster card, even when only one type is present. */}
                        <div className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
                          {g.label} ({groups[g.type].length})
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {groups[g.type].map((s) => (
                            <DraggableClusterSkill
                              key={s}
                              skillName={s}
                              clusterId={cluster.id}
                              category={category}
                              onRemove={onRemoveSkill}
                              isReadOnly={isReadOnly}
                              chipClass={g.chipClass}
                              isAiDerived={isAiDerivedSkill(s)}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()
            ) : (
              <p className="text-xs text-gray-400 mt-1">No skills assigned. Drag skills here from other clusters.</p>
            )}
            {!isReadOnly && <p className="text-[9px] text-gray-300 mt-1">Drag skills to move between clusters</p>}
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
    <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-2.5">
          {icon}
          <h2 className="text-base font-semibold text-gray-900 tracking-tight">{title}</h2>
          {timeMin > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">
              <Clock className="w-3 h-3" />
              {timeMin} min
            </span>
          )}
          {maxClusters > 0 && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
              atLimit
                ? 'bg-red-50 text-red-700 border-red-200 ring-1 ring-red-200'
                : 'bg-slate-50 text-gray-600 border-gray-200'
            }`}>
              {clusters.length}/{maxClusters} clusters
            </span>
          )}
        </div>
        {/* Hide Add Cluster when read-only (flexible finalized) */}
        {!isReadOnly && (
          <button
            onClick={() => onAddCluster(category)}
            disabled={atLimit}
            title={atLimit ? `Maximum ${maxClusters} clusters allowed` : undefined}
            className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              atLimit
                ? 'text-gray-400 border border-gray-200 cursor-not-allowed bg-gray-50'
                : 'text-white bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue shadow-md shadow-brand-blue/25 ring-1 ring-white/10'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            Add Cluster
          </button>
        )}
      </div>

      {/* ── Pool section: split into Skills / Commands ── */}
      {(() => {
        // Show only recruiter-typed (main) entries. Auto-derived sub-skills
        // from /expand-skills are intentionally hidden here per spec.
        const visibleSkills = mainSkillSet && mainSkillSet.size > 0
          ? skills.filter(s => mainSkillSet.has(s.name.toLowerCase().trim()))
          : skills;
        const groups: Record<SkillType, SkillEntry[]> = { Skill: [], Command: [] };
        for (const e of visibleSkills) {
          const t: SkillType = (e.type === 'Command') ? 'Command' : 'Skill';
          groups[t].push(e);
        }
        const groupOrder: { type: SkillType; label: string; chipClass: string }[] = [
          { type: 'Skill',         label: 'Skills',         chipClass: 'bg-amber-50 text-amber-800 border-amber-300 ring-1 ring-amber-200' },
          { type: 'Command',       label: 'Commands',       chipClass: 'bg-blue-50 text-blue-700 border-blue-200' },
        ];
        const visibleGroups = groupOrder.filter(g => groups[g.type].length > 0);

        const renderChip = (name: string, chipClass: string) => (
          <span
            key={name}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${chipClass}`}
          >
            {name}
            {!isReadOnly && (
              <button
                type="button"
                onClick={() => onRemoveSkillFromPool?.(name)}
                className="ml-0.5 hover:text-red-500 transition-colors"
                aria-label="Remove" title="Remove"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        );

        return (
          <div className="px-4 pt-4 pb-2 border-b border-gray-100">
            {visibleGroups.length === 0 ? (
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Skills</span>
                <span className="text-xs text-gray-400">0</span>
              </div>
            ) : (
              <div className="space-y-3 mb-3">
                {visibleGroups.map(g => (
                  <div key={g.type}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{g.label}</span>
                      <span className="text-xs text-gray-400">
                        {groups[g.type].length} {g.label.toLowerCase()}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {groups[g.type].map(e => renderChip(e.name, g.chipClass))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add skill input */}
            {!isReadOnly && (
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <input
                    type="text"
                    value={newSkillInput}
                    onChange={e => { setNewSkillInput(e.target.value); if (skillInputError) setSkillInputError(''); }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddSkill(); } }}
                    placeholder={`Add a ${category === 'mth' ? 'must-have' : 'nice-to-have'} skill`}
                    className={`w-full px-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-1 ${
                      skillInputError ? 'border-red-300 focus:ring-red-400' : 'border-gray-200 focus:ring-gray-400'
                    }`}
                  />
                  {skillInputError && <p className="mt-1 text-[11px] text-red-500">{skillInputError}</p>}
                </div>
                <button
                  type="button"
                  onClick={handleAddSkill}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </button>
              </div>
            )}
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
          mthRestored.forEach((c: any) => { if (c.id) initialExpandIds.push(c.id); });
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
          nthRestored.forEach((c: any) => { if (c.id) initialExpandIds.push(c.id); });
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
    // Check both categories
    setMthClusters(prev => prev.map(c =>
      c.id === clusterId ? { ...c, skills: c.skills.filter(s => s !== skillName) } : c
    ));
    setNthClusters(prev => prev.map(c =>
      c.id === clusterId ? { ...c, skills: c.skills.filter(s => s !== skillName) } : c
    ));
  }, []);

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
  }, []);

  /* ── AI Generate ── */
  const handleGenerateClusters = async () => {
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
        const mthShort = mthSkillNames.length > 0 && mthQ > 0 && mthSkillNames.length < mthQ;
        const nthShort = nthSkillNames.length > 0 && nthQ > 0 && nthSkillNames.length < nthQ;
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
          const [mthExpandRes, nthExpandRes] = await Promise.all([
            (mthShort || mthRecover)
              ? aiInterviewService.expandSkills({
                  mainSkills: mthExpandInput,
                  // No fixed target — pass Q as the absolute floor (1 skill/Q
                  // minimum). Backend prompt tells LLM to extract however many
                  // JD-relevant skills make sense; we never push a numeric goal.
                  targetSkillCount: mthQ,
                  bucket: 'MTH',
                  jdTitle: config?.position,
                  jdDescription: jdDescription || undefined,
                })
              : Promise.resolve({ flat_skills: mthSkillNames, expanded_skills: [] as { parent: string; sub_skills: string[] }[] }),
            (nthShort || nthRecover)
              ? aiInterviewService.expandSkills({
                  mainSkills: nthExpandInput,
                  targetSkillCount: nthQ,
                  bucket: 'NTH',
                  jdTitle: config?.position,
                  jdDescription: jdDescription || undefined,
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
      // Auto-expand all generated clusters so AI-merged skills (with sparkle
      // markers) are visible immediately. Without this, users only see the
      // cluster headers and assume nothing changed.
      setExpandedIds(new Set([...newMthClusters, ...newNthClusters].map(c => c.id)));

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
    void handleGenerateClusters();
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
    // Flexible mode: block progression when cluster structure is invalid
    if (isFlexible && hasIssues) {
      if (emptyClusters.length > 0) {
        toast.error(
          `${emptyClusters.length} cluster${emptyClusters.length > 1 ? 's have' : ' has'} no skills. Each cluster must contain at least one skill.`,
        );
        return;
      }
      const unassignedCount = unassignedMth.length + unassignedNth.length;
      if (unassignedCount > 0) {
        toast.error(
          `${unassignedCount} skill${unassignedCount > 1 ? 's are' : ' is'} not assigned to any cluster. All skills must belong to a cluster.`,
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
      <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-slate-50">
        <div className="w-full">
          {/* Header */}
          <div className="mb-6">
            {/* Step indicator */}
            <div className="flex items-center gap-2 mb-6">
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
                        <span className="text-sm text-gray-500">{label}</span>
                      </>
                    ) : isCurrent ? (
                      <>
                        <div className="w-7 h-7 rounded-full flex items-center justify-center bg-brand-blue text-white text-sm font-medium shadow-md shadow-brand-blue/25 ring-1 ring-white/10">{stepNum}</div>
                        <span className="text-sm text-brand-blue font-medium">{label}</span>
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
                  <h1 className="text-xl font-semibold text-gray-900 tracking-tight">Skill Clusters</h1>
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
                isReadOnly={true}
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
                  isReadOnly={true}
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
