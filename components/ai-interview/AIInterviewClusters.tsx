'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, CheckCircle2, Loader2, Shield, Star, Plus, X,
  Sparkles, GripVertical, ChevronDown, ChevronUp, Layers, Clock,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import type { AIInterviewResponse, AIInterviewRoundConfig } from '@/lib/services/aiInterviewService';

/* ─────────────────────────────────────────────────────────────────────── */
/*  Types                                                                  */
/* ─────────────────────────────────────────────────────────────────────── */

type SkillType = 'Skill' | 'Command' | 'Certification';

interface Cluster {
  id: string;
  name: string;
  priority: 1 | 2 | 3 | 4 | 5;
  skills: string[];
  reason?: string;
}

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

const FIXED_TIME = { mth: 20, nth: 7, hr: 3 } as const;
const DEFAULT_PCT = { mth: 70, nth: 20, hr: 10 } as const;

const PRIORITY_LABELS: Record<number, { label: string; short: string; color: string; dot: string }> = {
  5: { label: 'P5 \u2013 Critical',   short: 'Critical',  color: 'bg-red-100 text-red-700 border-red-200',       dot: 'bg-red-500' },
  4: { label: 'P4 \u2013 High',       short: 'High',      color: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  3: { label: 'P3 \u2013 Medium',     short: 'Medium',    color: 'bg-yellow-100 text-yellow-700 border-yellow-200', dot: 'bg-yellow-500' },
  2: { label: 'P2 \u2013 Low',        short: 'Low',       color: 'bg-blue-100 text-blue-700 border-blue-200',     dot: 'bg-blue-500' },
  1: { label: 'P1 \u2013 Optional',   short: 'Optional',  color: 'bg-gray-100 text-gray-600 border-gray-200',     dot: 'bg-gray-400' },
};

const STEPS = ['Select JD', 'Configure', 'Clusters', 'Preview & Publish'];
const CURRENT_STEP = 3;

/* ─────────────────────────────────────────────────────────────────────── */
/*  Helpers                                                                 */
/* ─────────────────────────────────────────────────────────────────────── */

function uid() {
  return Math.random().toString(36).slice(2, 9);
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
}: {
  skillName: string;
  clusterId: string;
  category: 'mth' | 'nth';
  onRemove: (skillName: string, clusterId: string) => void;
}) {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: DND_TYPES.CLUSTER_SKILL,
    item: { skillName, fromClusterId: clusterId, fromCategory: category } as SkillDragItem,
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  }), [skillName, clusterId, category]);

  return (
    <span
      ref={drag as unknown as React.Ref<HTMLSpanElement>}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs border cursor-grab active:cursor-grabbing transition-opacity ${
        isDragging ? 'opacity-40' : 'opacity-100'
      } bg-white border-gray-200 text-gray-700 hover:border-gray-300`}
    >
      <GripVertical className="w-3 h-3 text-gray-300 flex-shrink-0" />
      {skillName}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(skillName, clusterId); }}
        className="ml-0.5 text-gray-400 hover:text-red-500 transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

/* ── Cluster Row ── */
function ClusterRow({
  cluster,
  index,
  category,
  categoryTimeMin,
  totalPriorityWeight,
  expanded,
  onToggleExpand,
  onUpdate,
  onRemove,
  onReorder,
  onMoveSkill,
  onRemoveSkill,
}: {
  cluster: Cluster;
  index: number;
  category: 'mth' | 'nth';
  categoryTimeMin: number;
  totalPriorityWeight: number;
  expanded: boolean;
  onToggleExpand: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Cluster>) => void;
  onRemove: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onMoveSkill: (skillName: string, fromClusterId: string, toClusterId: string) => void;
  onRemoveSkill: (skillName: string, clusterId: string) => void;
}) {
  const pInfo = PRIORITY_LABELS[cluster.priority] ?? PRIORITY_LABELS[3];
  const rowRef = useRef<HTMLDivElement>(null);
  const clusterTime = totalPriorityWeight > 0
    ? Math.round((cluster.priority / totalPriorityWeight) * categoryTimeMin)
    : 0;

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
      className={`border border-gray-200 rounded-lg transition-all ${
        isDragging ? 'opacity-40' : ''
      } ${isOver ? 'border-purple-400 bg-purple-50/30' : ''
      } ${isSkillOver ? 'ring-2 ring-purple-300 bg-purple-50/20' : ''}`}
    >
      {/* Collapsed header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => onToggleExpand(cluster.id)}
      >
        <div ref={drag as unknown as React.Ref<HTMLDivElement>} className="cursor-grab active:cursor-grabbing p-0.5">
          <GripVertical className="w-4 h-4 text-gray-300" />
        </div>
        <PriorityBadge p={cluster.priority} />
        <span className="text-sm font-medium text-gray-800 flex-1 truncate">
          {cluster.name || 'Unnamed Cluster'}
        </span>
        <span className="text-xs text-gray-400">
          {cluster.skills.length} skill{cluster.skills.length !== 1 ? 's' : ''}
        </span>
        {categoryTimeMin > 0 && (
          <span className="text-xs text-gray-400 flex items-center gap-0.5">
            <Clock className="w-3 h-3" />
            {clusterTime} min
          </span>
        )}
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
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
              className="mt-1 w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-purple-300"
              placeholder="e.g. Core Backend Skills"
            />
          </div>

          {/* Priority dropdown */}
          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Priority</label>
            <select
              value={cluster.priority}
              onChange={(e) => onUpdate(cluster.id, { priority: Number(e.target.value) as Cluster['priority'] })}
              className="mt-1 w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-purple-300 bg-white"
            >
              {[5, 4, 3, 2, 1].map(p => (
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
              rows={2}
              className="mt-1 w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-purple-300 resize-none"
              placeholder="Why is this cluster important?"
            />
          </div>

          {/* Skills (draggable between clusters) */}
          <div>
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
              Skills ({cluster.skills.length})
            </span>
            {cluster.skills.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {cluster.skills.map((s) => (
                  <DraggableClusterSkill
                    key={s}
                    skillName={s}
                    clusterId={cluster.id}
                    category={category}
                    onRemove={onRemoveSkill}
                  />
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 mt-1">No skills assigned. Drag skills here from other clusters.</p>
            )}
            <p className="text-[9px] text-gray-300 mt-1">Drag skills to move between clusters</p>
          </div>

          {/* Remove cluster button */}
          <div className="flex justify-end pt-1">
            <button
              onClick={() => onRemove(cluster.id)}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Remove Cluster
            </button>
          </div>
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
}) {
  const totalPriorityWeight = clusters.reduce((s, c) => s + c.priority, 0);

  return (
    <div className="border border-gray-200 rounded-xl bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          {icon}
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          {timeMin > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
              <Clock className="w-3 h-3" />
              {timeMin} min
            </span>
          )}
        </div>
        <button
          onClick={() => onAddCluster(category)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-50 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Cluster
        </button>
      </div>

      {/* Cluster list */}
      <div className="p-4 space-y-2.5">
        {clusters.length === 0 ? (
          <div className="py-10 text-center border-2 border-dashed border-gray-200 rounded-xl">
            <Layers className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">
              No clusters yet. Click <strong>&quot;Regenerate with AI&quot;</strong> or add manually.
            </p>
          </div>
        ) : (
          clusters.map((cluster, idx) => (
            <ClusterRow
              key={cluster.id}
              cluster={cluster}
              index={idx}
              category={category}
              categoryTimeMin={timeMin}
              totalPriorityWeight={totalPriorityWeight}
              expanded={expandedIds.has(cluster.id)}
              onToggleExpand={onToggleExpand}
              onUpdate={(id, updates) => onUpdateCluster(category, id, updates)}
              onRemove={(id) => onRemoveCluster(category, id)}
              onReorder={(from, to) => onReorderClusters(category, from, to)}
              onMoveSkill={(skillName, fromId, toId) => onMoveSkill(category, skillName, fromId, toId)}
              onRemoveSkill={onRemoveSkill}
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

  /* Skills lists (read-only from config) */
  const [mthSkills, setMthSkills] = useState<SkillEntry[]>([]);
  const [nthSkills, setNthSkills] = useState<SkillEntry[]>([]);
  const [nthEnabled, setNthEnabled] = useState(true);

  /* Time / mode */
  const [isFixed, setIsFixed] = useState(true);
  const [fixedMthMin, setFixedMthMin] = useState<number>(FIXED_TIME.mth);
  const [fixedNthMin, setFixedNthMin] = useState<number>(FIXED_TIME.nth);

  /* UI state */
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  /* ── Parse skill entries from round config ── */
  const toSkillEntries = useCallback((names: string[], comments?: Record<string, string>, types?: Record<string, string>): SkillEntry[] => {
    return names.map(n => ({
      name: n,
      comment: comments?.[n] ?? '',
      type: (types?.[n] as SkillType) ?? 'Skill',
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

        // Determine mode
        const durationMin = draft.duration_minutes ?? 30;
        const fixed = durationMin > 0;
        setIsFixed(fixed);
        setFixedMthMin(fixed ? FIXED_TIME.mth : 0);
        setFixedNthMin(fixed ? FIXED_TIME.nth : 0);

        // Parse rounds_config for skills
        const rounds = draft.rounds_config ?? [];
        const mthRound = rounds.find(r => r.type === 'must_have_skills' || r.type === 'must_have' || r.type === 'must-have');
        const nthRound = rounds.find(r => r.type === 'nice_to_have_skills' || r.type === 'nice_to_have' || r.type === 'nice-to-have');

        // Parse special_instructions
        let si: Record<string, any> = {};
        try {
          si = JSON.parse(draft.special_instructions || '{}');
        } catch { /* noop */ }

        const mthComments: Record<string, string> = si.skill_comments?.mth || {};
        const nthComments: Record<string, string> = si.skill_comments?.nth || {};
        const mthTypes: Record<string, string> = si.skill_types?.mth || {};
        const nthTypes: Record<string, string> = si.skill_types?.nth || {};

        // Build skills from round topics/jd_skills/custom_skills
        if (mthRound) {
          const allSkills = [
            ...(mthRound.jd_skills ?? []),
            ...(mthRound.custom_skills ?? []),
            ...(mthRound.topics ?? []).filter(
              t => !(mthRound.jd_skills ?? []).includes(t) && !(mthRound.custom_skills ?? []).includes(t)
            ),
          ];
          const unique = Array.from(new Set(allSkills));
          setMthSkills(toSkillEntries(unique, mthComments, mthTypes));
        } else if (draft.jd_must_have_skills?.length) {
          setMthSkills(toSkillEntries(draft.jd_must_have_skills, mthComments, mthTypes));
        }

        if (nthRound) {
          setNthEnabled(nthRound.enabled !== false);
          const allSkills = [
            ...(nthRound.jd_skills ?? []),
            ...(nthRound.custom_skills ?? []),
            ...(nthRound.topics ?? []).filter(
              t => !(nthRound.jd_skills ?? []).includes(t) && !(nthRound.custom_skills ?? []).includes(t)
            ),
          ];
          const unique = Array.from(new Set(allSkills));
          setNthSkills(toSkillEntries(unique, nthComments, nthTypes));
        } else {
          setNthEnabled(false);
          if (draft.jd_nice_to_have_skills?.length) {
            setNthSkills(toSkillEntries(draft.jd_nice_to_have_skills, nthComments, nthTypes));
          }
        }

        // Restore clusters from special_instructions
        if (si.mth_clusters?.length) {
          setMthClusters(si.mth_clusters.map((c: any) => ({
            ...c,
            priority: c.priority as Cluster['priority'],
          })));
        }
        if (si.nth_clusters?.length) {
          setNthClusters(si.nth_clusters.map((c: any) => ({
            ...c,
            priority: c.priority as Cluster['priority'],
          })));
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
    const newCluster: Cluster = {
      id: uid(),
      name: '',
      priority: 3,
      skills: [],
      reason: '',
    };
    const setter = category === 'mth' ? setMthClusters : setNthClusters;
    setter(prev => [...prev, newCluster]);
    setExpandedIds(prev => new Set(prev).add(newCluster.id));
  }, []);

  /* ── AI Generate ── */
  const handleGenerateClusters = async () => {
    setGenerating(true);
    try {
      const result = await aiInterviewService.generateClusters(
        mthSkills.map(s => s.name),
        nthSkills.map(s => s.name),
        config?.position,
        undefined,
        fixedMthMin,
        fixedNthMin,
      );
      if (result.mth_clusters) {
        setMthClusters(result.mth_clusters.map(c => ({
          ...c,
          priority: c.priority as Cluster['priority'],
          reason: c.reason || '',
        })));
      }
      if (result.nth_clusters) {
        setNthClusters(result.nth_clusters.map(c => ({
          ...c,
          priority: c.priority as Cluster['priority'],
          reason: c.reason || '',
        })));
      }
      toast.success('Clusters generated!');
    } catch {
      toast.error('Failed to generate clusters');
    } finally {
      setGenerating(false);
    }
  };

  /* ── Save & Navigate ── */
  const saveAndNavigate = async (target: string) => {
    if (!config || !id) return;
    setSaving(true);
    try {
      const si = JSON.parse(config.special_instructions || '{}');
      si.mth_clusters = mthClusters;
      si.nth_clusters = nthClusters;
      await aiInterviewService.update(id, {
        special_instructions: JSON.stringify(si),
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
    saveAndNavigate(
      '/recruitment/ai-interviews/jd-selection/ai-interview-config?jd_id=' + (config.jd_id || '')
    );
  };

  const handleContinue = () => {
    saveAndNavigate(
      '/recruitment/ai-interviews/jd-selection/ai-interview-config/preview?id=' + id
    );
  };

  const handleSaveAsDraft = async () => {
    if (!config || !id) return;
    setSaving(true);
    try {
      const si = JSON.parse(config.special_instructions || '{}');
      si.mth_clusters = mthClusters;
      si.nth_clusters = nthClusters;
      await aiInterviewService.update(id, {
        special_instructions: JSON.stringify(si),
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

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
          <p className="text-sm text-gray-500">Loading cluster configuration...</p>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <p className="text-sm text-gray-500">No interview configuration found.</p>
          <button
            onClick={() => router.back()}
            className="mt-3 text-sm text-purple-600 hover:text-purple-700 underline"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* ── Top bar ── */}
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5">
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

            {/* Header row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleBack}
                  disabled={saving}
                  className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                  <h1 className="text-xl font-semibold text-gray-900">Skill Clusters</h1>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Organize skills into weighted clusters for focused interview coverage
                  </p>
                </div>
              </div>
              <button
                onClick={handleGenerateClusters}
                disabled={generating || saving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {generating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {generating ? 'Generating...' : 'Regenerate with AI'}
              </button>
            </div>
          </div>
        </div>

        {/* ── Main content ── */}
        <div className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6 pb-24">
          {/* Generating overlay within content area */}
          {generating && (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
                <p className="text-sm text-gray-500">AI is analyzing skills and generating clusters...</p>
              </div>
            </div>
          )}

          {!generating && (
            <>
              {/* Must-To-Have Section */}
              <CategorySection
                title="Must-To-Have Skills"
                icon={<Shield className="w-5 h-5 text-red-500" />}
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
              />

              {/* Nice-To-Have Section */}
              {nthEnabled && nthSkills.length > 0 && (
                <CategorySection
                  title="Nice-To-Have Skills"
                  icon={<Star className="w-5 h-5 text-amber-500" />}
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
                />
              )}
            </>
          )}
        </div>

        {/* ── Sticky footer ── */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-10">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={handleBack}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
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
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Save as Draft
              </button>
              <button
                onClick={handleContinue}
                disabled={saving || generating}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
      </div>
    </DndProvider>
  );
}
