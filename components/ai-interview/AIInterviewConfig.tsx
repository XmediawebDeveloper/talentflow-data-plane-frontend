'use client';

import {
  ArrowLeft, Clock, Plus, X, Sparkles, CheckCircle2, Loader2,
  Users, Brain, Shield, Globe, Save, ChevronDown, ChevronUp,
  MessageSquare, GripVertical, Info, AlertCircle, Timer, Zap,
} from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import type { PublishedJD, AIInterviewRoundConfig } from '@/lib/services/aiInterviewService';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/* ─────────────────────────────────────────────────────────────────────── */
/*  Types                                                                  */
/* ─────────────────────────────────────────────────────────────────────── */

type InterviewMode = 'fixed' | 'flexible';

interface Cluster {
  id: string;
  name: string;
  priority: 1 | 2 | 3 | 4 | 5;
  skills: string[];
}

interface SkillEntry {
  name: string;
  comment: string;
}

interface CategoryConfig {
  skills: SkillEntry[];      // ordered list of skills (from JD + custom)
  clusters: Cluster[];       // cluster groupings
  percentage: number;        // scoring weight %
  enabled: boolean;
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  Constants                                                               */
/* ─────────────────────────────────────────────────────────────────────── */

const FIXED_TIME = { mth: 20, nth: 7, hr: 3 } as const;   // minutes (MOM §5)
const DEFAULT_PCT = { mth: 70, nth: 20, hr: 10 } as const; // scoring weights (MOM §default)

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  5: { label: 'P5 – Critical',   color: 'bg-red-100 text-red-700 border-red-200' },
  4: { label: 'P4 – High',       color: 'bg-orange-100 text-orange-700 border-orange-200' },
  3: { label: 'P3 – Medium',     color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  2: { label: 'P2 – Low',        color: 'bg-blue-100 text-blue-700 border-blue-200' },
  1: { label: 'P1 – Optional',   color: 'bg-gray-100 text-gray-600 border-gray-200' },
};

/* ─────────────────────────────────────────────────────────────────────── */
/*  Small helpers                                                           */
/* ─────────────────────────────────────────────────────────────────────── */

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  Sub-components                                                          */
/* ─────────────────────────────────────────────────────────────────────── */

function PriorityBadge({ p }: { p: number }) {
  const { label, color } = PRIORITY_LABELS[p] ?? PRIORITY_LABELS[3];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full border ${color}`}>
      {label}
    </span>
  );
}

interface ClusterCardProps {
  cluster: Cluster;
  allSkillNames: string[];   // all skill names in this category (for "add skill" dropdown)
  onChange: (updated: Cluster) => void;
  onRemove: () => void;
}

function ClusterCard({ cluster, allSkillNames, onChange, onRemove }: ClusterCardProps) {
  const [addingSkill, setAddingSkill] = useState('');
  const availableSkills = allSkillNames.filter(s => !cluster.skills.includes(s));

  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100">
        <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />
        <input
          value={cluster.name}
          onChange={e => onChange({ ...cluster, name: e.target.value })}
          placeholder="Cluster name (e.g. Frontend Engineering)"
          className="flex-1 text-sm font-medium text-gray-900 bg-transparent focus:outline-none placeholder-gray-400"
        />
        <select
          value={cluster.priority}
          onChange={e => onChange({ ...cluster, priority: Number(e.target.value) as Cluster['priority'] })}
          className="text-xs border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white"
        >
          {[5, 4, 3, 2, 1].map(p => (
            <option key={p} value={p}>{PRIORITY_LABELS[p].label}</option>
          ))}
        </select>
        <button onClick={onRemove} className="p-1 text-gray-400 hover:text-red-500 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="px-3 py-2">
        {/* Skills in cluster */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {cluster.skills.length === 0 && (
            <span className="text-xs text-gray-400 italic">No skills assigned yet</span>
          )}
          {cluster.skills.map(skill => (
            <span key={skill} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700 border border-gray-200">
              {skill}
              <button
                onClick={() => onChange({ ...cluster, skills: cluster.skills.filter(s => s !== skill) })}
                className="hover:text-red-500 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>

        {/* Add skill to cluster */}
        {availableSkills.length > 0 && (
          <div className="flex items-center gap-2">
            <select
              value={addingSkill}
              onChange={e => setAddingSkill(e.target.value)}
              className="flex-1 text-xs border border-dashed border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white text-gray-600"
            >
              <option value="">Add skill to this cluster…</option>
              {availableSkills.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button
              onClick={() => {
                if (!addingSkill) return;
                onChange({ ...cluster, skills: [...cluster.skills, addingSkill] });
                setAddingSkill('');
              }}
              className="px-2.5 py-1 text-xs bg-gray-800 text-white rounded-md hover:bg-gray-900 transition-colors"
            >
              Add
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  Skill section (MTH or NTH)                                             */
/* ─────────────────────────────────────────────────────────────────────── */

interface SkillSectionProps {
  title: string;
  category: 'mth' | 'nth';
  config: CategoryConfig;
  jdSkillNames: string[];   // original from JD (read-only label)
  mode: InterviewMode;
  fixedMinutes: number;
  onChange: (updated: Partial<CategoryConfig>) => void;
}

function SkillSection({ title, category, config, jdSkillNames, mode, fixedMinutes, onChange }: SkillSectionProps) {
  const [customInput, setCustomInput] = useState('');
  const [showClusters, setShowClusters] = useState(true);
  const [commentOpen, setCommentOpen] = useState<string | null>(null);

  const jdSet = new Set(jdSkillNames.map(s => s.toLowerCase()));
  const color = category === 'mth'
    ? { tag: 'bg-purple-50 text-purple-700 border-purple-200', accent: 'text-purple-700' }
    : { tag: 'bg-indigo-50 text-indigo-700 border-indigo-200', accent: 'text-indigo-700' };

  const addCustomSkill = () => {
    const name = customInput.trim();
    if (!name) return;
    if (config.skills.some(s => s.name.toLowerCase() === name.toLowerCase())) {
      toast.error('Skill already added');
      return;
    }
    onChange({ skills: [...config.skills, { name, comment: '' }] });
    setCustomInput('');
  };

  const removeSkill = (name: string) => {
    onChange({
      skills: config.skills.filter(s => s.name !== name),
      // also remove from any cluster
      clusters: config.clusters.map(c => ({ ...c, skills: c.skills.filter(cs => cs !== name) })),
    });
  };

  const updateComment = (name: string, comment: string) => {
    onChange({ skills: config.skills.map(s => s.name === name ? { ...s, comment } : s) });
  };

  const addCluster = () => {
    const c: Cluster = { id: uid(), name: '', priority: 3, skills: [] };
    onChange({ clusters: [...config.clusters, c] });
  };

  const updateCluster = (id: string, updated: Cluster) => {
    onChange({ clusters: config.clusters.map(c => c.id === id ? updated : c) });
  };

  const removeCluster = (id: string) => {
    onChange({ clusters: config.clusters.filter(c => c.id !== id) });
  };

  const allSkillNames = config.skills.map(s => s.name);

  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Brain className={`w-4 h-4 ${color.accent}`} />
          <span className="font-semibold text-gray-900 text-sm">{title}</span>
          <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600 border border-gray-200">
            {config.percentage}% scoring weight
          </span>
          {mode === 'fixed' && (
            <span className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-600 border border-blue-200">
              <Timer className="w-3 h-3" />
              {fixedMinutes} min
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500">Weight</label>
            <div className="flex items-center">
              <input
                type="number"
                min={0}
                max={100}
                value={config.percentage}
                onChange={e => {
                  const v = parseInt(e.target.value);
                  if (!isNaN(v) && v >= 0 && v <= 100) onChange({ percentage: v });
                }}
                className="w-14 text-center text-sm font-semibold border border-gray-300 rounded-l-md px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-gray-400"
              />
              <span className="px-2 py-0.5 text-sm border border-l-0 border-gray-300 rounded-r-md bg-gray-50 text-gray-600">%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Skills list */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Skills</span>
            <span className="text-xs text-gray-400">{config.skills.length} skill{config.skills.length !== 1 ? 's' : ''}</span>
          </div>

          <div className="space-y-1.5">
            {config.skills.map(skill => {
              const fromJd = jdSet.has(skill.name.toLowerCase());
              return (
                <div key={skill.name} className="group">
                  <div className="flex items-center gap-2">
                    <span className={`flex-1 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border ${
                      fromJd ? color.tag : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}>
                      {skill.name}
                      {fromJd && <span className="text-[10px] opacity-60">JD</span>}
                    </span>
                    <button
                      onClick={() => setCommentOpen(commentOpen === skill.name ? null : skill.name)}
                      title="Add comment"
                      className={`p-1 rounded transition-colors ${skill.comment ? 'text-amber-500' : 'text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100'}`}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => removeSkill(skill.name)}
                      className="p-1 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {commentOpen === skill.name && (
                    <div className="mt-1 ml-0.5">
                      <input
                        autoFocus
                        value={skill.comment}
                        onChange={e => updateComment(skill.name, e.target.value)}
                        placeholder="Add interviewer note for this skill (not shown to candidate)…"
                        className="w-full px-3 py-1.5 text-xs border border-amber-200 rounded-lg bg-amber-50/50 focus:outline-none focus:ring-1 focus:ring-amber-300 placeholder-amber-300"
                      />
                    </div>
                  )}
                </div>
              );
            })}

            {config.skills.length === 0 && (
              <p className="text-xs text-gray-400 italic py-1">No skills yet — will be auto-populated from JD.</p>
            )}
          </div>

          {/* Add custom skill */}
          <div className="flex items-center gap-2 mt-2.5">
            <input
              value={customInput}
              onChange={e => setCustomInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomSkill())}
              placeholder="Add a skill (won't modify the JD)…"
              className="flex-1 px-3 py-1.5 text-xs border border-dashed border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 placeholder-gray-400"
            />
            <button
              onClick={addCustomSkill}
              className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
            <Info className="w-3 h-3 flex-shrink-0" />
            Added skills apply to this interview config only — the original JD is unchanged.
          </p>
        </div>

        {/* Clusters */}
        <div>
          <button
            onClick={() => setShowClusters(!showClusters)}
            className="flex items-center gap-2 w-full text-left mb-2"
          >
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Skill Clusters</span>
            <span className="text-xs text-gray-400">({config.clusters.length})</span>
            <span className="ml-auto text-gray-400">
              {showClusters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </span>
          </button>

          {showClusters && (
            <div className="space-y-2">
              {config.clusters.length === 0 && (
                <p className="text-xs text-gray-400 italic">
                  Group skills into clusters and set priority (1–5). Higher priority clusters get more questions.
                </p>
              )}
              {config.clusters.map(c => (
                <ClusterCard
                  key={c.id}
                  cluster={c}
                  allSkillNames={allSkillNames}
                  onChange={updated => updateCluster(c.id, updated)}
                  onRemove={() => removeCluster(c.id)}
                />
              ))}
              <button
                onClick={addCluster}
                className="flex items-center gap-1.5 w-full px-3 py-2 text-xs border border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-gray-400 hover:bg-gray-50 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Cluster
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  HR Section                                                              */
/* ─────────────────────────────────────────────────────────────────────── */

interface HRSectionProps {
  percentage: number;
  mode: InterviewMode;
  enabled: boolean;
  onToggle: () => void;
  onPctChange: (v: number) => void;
}

function HRSection({ percentage, mode, enabled, onToggle, onPctChange }: HRSectionProps) {
  const hrFocusAreas = [
    { icon: MessageSquare, label: 'Behavioural', desc: 'Past behaviour & situational responses' },
    { icon: Shield,        label: 'Cultural Fit', desc: 'Values, work-style & team alignment' },
    { icon: Users,         label: 'Situational',  desc: 'Hypothetical scenario judgement' },
  ];

  return (
    <div className={`border rounded-lg transition-all ${enabled ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" checked={enabled} onChange={onToggle} className="sr-only peer" />
            <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-gray-800 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
          </label>
          <Users className="w-4 h-4 text-blue-600" />
          <span className="font-semibold text-gray-900 text-sm">HR Round</span>
          <span className="px-2 py-0.5 text-[11px] rounded-full bg-blue-50 text-blue-600 border border-blue-200 font-medium">
            Qualitative Only — Non-Scoring
          </span>
          {mode === 'fixed' && enabled && (
            <span className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-600 border border-blue-200">
              <Timer className="w-3 h-3" />
              {FIXED_TIME.hr} min
            </span>
          )}
        </div>
        {enabled && (
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500">Weight</label>
            <div className="flex items-center">
              <input
                type="number"
                min={0}
                max={100}
                value={percentage}
                onChange={e => {
                  const v = parseInt(e.target.value);
                  if (!isNaN(v) && v >= 0 && v <= 100) onPctChange(v);
                }}
                className="w-14 text-center text-sm font-semibold border border-gray-300 rounded-l-md px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-gray-400"
              />
              <span className="px-2 py-0.5 text-sm border border-l-0 border-gray-300 rounded-r-md bg-gray-50 text-gray-600">%</span>
            </div>
          </div>
        )}
      </div>

      {enabled && (
        <div className="p-4">
          <div className="grid grid-cols-3 gap-3 mb-3">
            {hrFocusAreas.map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex flex-col gap-1 p-3 rounded-lg bg-blue-50/50 border border-blue-100">
                <div className="flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                  <span className="text-xs font-medium text-blue-700">{label}</span>
                </div>
                <p className="text-[11px] text-blue-500">{desc}</p>
              </div>
            ))}
          </div>
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-100">
            <Info className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-700">
              HR responses are stored separately for recruiter review only.
              They do <strong>not</strong> impact the technical evaluation score.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  Main component                                                          */
/* ─────────────────────────────────────────────────────────────────────── */

export default function AIInterviewConfig() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jdId = searchParams.get('jd_id');

  const [selectedJd, setSelectedJd] = useState<PublishedJD | null>(null);
  const [loadingJd, setLoadingJd] = useState(true);

  /* Interview mode */
  const [mode, setMode] = useState<InterviewMode>('fixed');

  /* Category configs */
  const [mth, setMth] = useState<CategoryConfig>({
    skills: [], clusters: [], percentage: DEFAULT_PCT.mth, enabled: true,
  });
  const [nth, setNth] = useState<CategoryConfig>({
    skills: [], clusters: [], percentage: DEFAULT_PCT.nth, enabled: true,
  });
  const [hrPct, setHrPct] = useState(DEFAULT_PCT.hr);
  const [hrEnabled, setHrEnabled] = useState(true);

  /* Other settings */
  const [recordingEnabled, setRecordingEnabled] = useState(true);

  /* Action states */
  const [publishing, setPublishing] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const isNavigatingRef = useRef(false);
  const isPublishedRef = useRef(false);

  /* ── Load JD ── */
  useEffect(() => {
    if (!jdId) { router.replace('/recruitment/ai-interviews/jd-selection'); return; }
    const loadJD = async () => {
      try {
        setLoadingJd(true);
        const result = await aiInterviewService.getPublishedJDs();
        const jd = result.items.find(j => j.id === jdId);
        if (jd) {
          setSelectedJd(jd);
        } else {
          toast.error('Job description not found');
          router.replace('/recruitment/ai-interviews/jd-selection');
        }
      } catch {
        toast.error('Failed to load job description');
        router.replace('/recruitment/ai-interviews/jd-selection');
      } finally {
        setLoadingJd(false);
      }
    };
    loadJD();
  }, [jdId, router]);

  /* ── Auto-populate skills from JD ── */
  useEffect(() => {
    if (!selectedJd) return;
    if (mth.skills.length === 0 && selectedJd.must_have_skills?.length) {
      setMth(prev => ({
        ...prev,
        skills: selectedJd.must_have_skills.map(s => ({ name: s, comment: '' })),
      }));
    }
    if (nth.skills.length === 0 && selectedJd.nice_to_have_skills?.length) {
      setNth(prev => ({
        ...prev,
        skills: selectedJd.nice_to_have_skills.map(s => ({ name: s, comment: '' })),
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJd]);

  /* ── Navigation guards ── */
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (selectedJd && !isPublishedRef.current && !isNavigatingRef.current) {
        e.preventDefault(); e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [selectedJd]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!selectedJd || isPublishedRef.current || isNavigatingRef.current) return;
      let target = e.target as HTMLElement;
      while (target && target !== document.body) {
        if (target.tagName === 'A' || target.getAttribute('role') === 'link') {
          const href = target.getAttribute('href');
          if (href && href.startsWith('/') && !href.startsWith('/#')) {
            e.preventDefault(); e.stopPropagation();
            setPendingNavigation(href); setShowUnsavedDialog(true);
            return;
          }
        }
        target = target.parentElement as HTMLElement;
      }
    };
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [selectedJd]);

  /* ── Derived values ── */
  const nthAvailable = nth.skills.length > 0 || nth.enabled;

  // Effective time for fixed mode (MOM: if NTH not available → all to MTH)
  const fixedMthMin = !nth.enabled ? FIXED_TIME.mth + FIXED_TIME.nth : FIXED_TIME.mth;
  const fixedNthMin = nth.enabled ? FIXED_TIME.nth : 0;
  const fixedHrMin  = hrEnabled ? FIXED_TIME.hr : 0;
  const totalFixed  = fixedMthMin + fixedNthMin + fixedHrMin;

  const totalPct = mth.percentage + (nth.enabled ? nth.percentage : 0) + (hrEnabled ? hrPct : 0);
  const pctValid = totalPct === 100;

  /* ── Build rounds config for API ── */
  const buildRounds = (isDraft = false): AIInterviewRoundConfig[] => {
    const rounds: AIInterviewRoundConfig[] = [];
    const dur = (cat: 'mth' | 'nth' | 'hr') => {
      if (mode === 'fixed') {
        if (cat === 'mth') return fixedMthMin;
        if (cat === 'nth') return fixedNthMin;
        return fixedHrMin;
      }
      // Flexible: duration_minutes = 0 (no restriction)
      return 0;
    };

    // MTH round
    {
      const jdSet = new Set((selectedJd?.must_have_skills || []).map(s => s.toLowerCase()));
      const jdSkills = mth.skills.filter(s => jdSet.has(s.name.toLowerCase())).map(s => s.name);
      const customSkills = mth.skills.filter(s => !jdSet.has(s.name.toLowerCase())).map(s => s.name);
      // Clusters → topics + topic_weights (priority as weight proxy: priority × 20)
      const topics = mth.clusters.map(c => c.name).filter(Boolean);
      const topicWeights: Record<string, number> = {};
      mth.clusters.forEach(c => { if (c.name) topicWeights[c.name] = c.priority * 20; });

      rounds.push({
        type: 'must_have_skills',
        percentage: mth.percentage,
        duration_minutes: dur('mth'),
        topics,
        topic_weights: topics.length > 0 ? topicWeights : undefined,
        enabled: true,
        order: 1,
        jd_skills: jdSkills.length > 0 ? jdSkills : undefined,
        custom_skills: customSkills.length > 0 ? customSkills : undefined,
      });
    }

    // NTH round
    if (nth.enabled) {
      const jdSet = new Set((selectedJd?.nice_to_have_skills || []).map(s => s.toLowerCase()));
      const jdSkills = nth.skills.filter(s => jdSet.has(s.name.toLowerCase())).map(s => s.name);
      const customSkills = nth.skills.filter(s => !jdSet.has(s.name.toLowerCase())).map(s => s.name);
      const topics = nth.clusters.map(c => c.name).filter(Boolean);
      const topicWeights: Record<string, number> = {};
      nth.clusters.forEach(c => { if (c.name) topicWeights[c.name] = c.priority * 20; });

      rounds.push({
        type: 'nice_to_have_skills',
        percentage: nth.percentage,
        duration_minutes: dur('nth'),
        topics,
        topic_weights: topics.length > 0 ? topicWeights : undefined,
        enabled: true,
        order: 2,
        jd_skills: jdSkills.length > 0 ? jdSkills : undefined,
        custom_skills: customSkills.length > 0 ? customSkills : undefined,
      });
    }

    // HR round
    if (hrEnabled) {
      rounds.push({
        type: 'hr',
        percentage: hrPct,
        duration_minutes: dur('hr'),
        topics: ['Behavioural', 'Cultural Fit', 'Situational'],
        enabled: true,
        order: 3,
      });
    }

    return rounds;
  };

  /* Cluster config as JSON for special_instructions */
  const buildClusterJson = () => JSON.stringify({
    interview_mode: mode,
    mth_clusters: mth.clusters,
    nth_clusters: nth.clusters,
    skill_comments: {
      mth: Object.fromEntries(mth.skills.filter(s => s.comment).map(s => [s.name, s.comment])),
      nth: Object.fromEntries(nth.skills.filter(s => s.comment).map(s => [s.name, s.comment])),
    },
  });

  /* ── Save / Publish ── */
  const saveDraft = async (silent = false): Promise<boolean> => {
    if (!selectedJd) return false;
    setSavingDraft(true);
    try {
      await aiInterviewService.create({
        position: selectedJd.title,
        jd_id: selectedJd.id,
        duration_minutes: mode === 'fixed' ? totalFixed : 0,
        rounds_config: buildRounds(true),
        recording_enabled: recordingEnabled,
        title: `${selectedJd.title} - AI Interview`,
        save_as_draft: true,
        special_instructions: buildClusterJson(),
      });
      if (!silent) toast.success('Draft saved!');
      return true;
    } catch {
      if (!silent) toast.error('Failed to save draft');
      return false;
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSaveAsDraft = async () => {
    const ok = await saveDraft();
    if (ok) router.push('/recruitment/ai-interviews');
  };

  const handlePublish = async () => {
    if (!selectedJd || !pctValid) return;
    setPublishing(true);
    try {
      const interview = await aiInterviewService.create({
        position: selectedJd.title,
        jd_id: selectedJd.id,
        duration_minutes: mode === 'fixed' ? totalFixed : 0,
        rounds_config: buildRounds(false),
        recording_enabled: recordingEnabled,
        title: `${selectedJd.title} - AI Interview`,
        special_instructions: buildClusterJson(),
      });
      await aiInterviewService.publishConfig(interview.id);
      isPublishedRef.current = true;
      toast.success('AI Interview configuration published!');
      router.push('/recruitment/ai-interviews');
    } catch {
      toast.error('Failed to publish configuration');
    } finally {
      setPublishing(false);
    }
  };

  const handleBackClick = async () => {
    if (isNavigatingRef.current || savingDraft) return;
    isNavigatingRef.current = true;
    if (selectedJd) { await saveDraft(true); toast.success('Draft saved automatically'); }
    router.push('/recruitment/ai-interviews/jd-selection');
  };

  const handleSaveAndNavigate = async () => {
    setShowUnsavedDialog(false);
    isNavigatingRef.current = true;
    await saveDraft(true);
    toast.success('Draft saved');
    if (pendingNavigation) router.push(pendingNavigation);
    setPendingNavigation(null);
  };

  const handleDiscardAndNavigate = () => {
    setShowUnsavedDialog(false);
    isNavigatingRef.current = true;
    if (pendingNavigation) router.push(pendingNavigation);
    setPendingNavigation(null);
  };

  /* ── Loading / null guards ── */
  if (loadingJd) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
          <p className="text-sm text-gray-500">Loading configuration…</p>
        </div>
      </div>
    );
  }

  if (!selectedJd) return null;

  /* ─────────────────────────────────────────────────────────────────── */
  /*  Render                                                             */
  /* ─────────────────────────────────────────────────────────────────── */

  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
      <div className="w-full max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={handleBackClick} disabled={savingDraft} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-gray-900 text-xl font-semibold">AI Interview Configuration</h1>
            <p className="text-sm text-gray-500">Configure skills, clusters, and weightage for this interview</p>
          </div>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-2 mb-8">
          <div className="w-7 h-7 rounded-full flex items-center justify-center bg-green-100">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
          </div>
          <span className="text-sm text-gray-400">Select JD</span>
          <div className="w-10 h-px bg-gray-200" />
          <div className="w-7 h-7 rounded-full flex items-center justify-center bg-gray-900 text-white text-sm font-medium">2</div>
          <span className="text-sm text-gray-900 font-medium">Configure & Publish</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Left: main config ── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Selected JD */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Job Description</p>
                <p className="font-semibold text-gray-900">{selectedJd.title}</p>
                {selectedJd.department && <p className="text-xs text-gray-500">{selectedJd.department}</p>}
              </div>
              <button onClick={() => router.push('/recruitment/ai-interviews/jd-selection')} className="text-sm text-gray-500 hover:text-gray-700">
                Change
              </button>
            </div>

            {/* ── Interview Mode ── */}
            <div className="border border-gray-200 rounded-lg bg-white p-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-gray-600" />
                <span className="font-semibold text-gray-900 text-sm">Interview Mode</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {/* Fixed */}
                <button
                  onClick={() => setMode('fixed')}
                  className={`relative flex flex-col gap-1 p-4 rounded-lg border-2 text-left transition-all ${
                    mode === 'fixed' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Timer className={`w-4 h-4 ${mode === 'fixed' ? 'text-white' : 'text-gray-600'}`} />
                    <span className="font-semibold text-sm">Fixed — 30 min</span>
                  </div>
                  <p className={`text-xs ${mode === 'fixed' ? 'text-gray-300' : 'text-gray-500'}`}>
                    Candidate response time is capped. AI narration excluded.
                  </p>
                  <div className={`mt-2 text-[11px] space-y-0.5 ${mode === 'fixed' ? 'text-gray-400' : 'text-gray-400'}`}>
                    <div>MTH → {fixedMthMin} min</div>
                    {nth.enabled && <div>NTH → {fixedNthMin} min</div>}
                    {hrEnabled && <div>HR → {fixedHrMin} min</div>}
                  </div>
                </button>

                {/* Flexible */}
                <button
                  onClick={() => setMode('flexible')}
                  className={`flex flex-col gap-1 p-4 rounded-lg border-2 text-left transition-all ${
                    mode === 'flexible' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Zap className={`w-4 h-4 ${mode === 'flexible' ? 'text-white' : 'text-gray-600'}`} />
                    <span className="font-semibold text-sm">Flexible</span>
                  </div>
                  <p className={`text-xs ${mode === 'flexible' ? 'text-gray-300' : 'text-gray-500'}`}>
                    No time restriction. Interview runs until all questions are covered.
                  </p>
                </button>
              </div>
            </div>

            {/* ── MTH ── */}
            <SkillSection
              title="Must-To-Have Skills (MTH)"
              category="mth"
              config={mth}
              jdSkillNames={selectedJd.must_have_skills || []}
              mode={mode}
              fixedMinutes={fixedMthMin}
              onChange={patch => setMth(prev => ({ ...prev, ...patch }))}
            />

            {/* ── NTH ── */}
            <div className="border border-gray-200 rounded-lg bg-white">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={nth.enabled} onChange={() => setNth(prev => ({ ...prev, enabled: !prev.enabled }))} className="sr-only peer" />
                    <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-gray-800 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
                  </label>
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <span className="font-semibold text-gray-900 text-sm">Nice-To-Have Skills (NTH)</span>
                  {!nth.enabled && mode === 'fixed' && (
                    <span className="text-[11px] text-gray-400 italic">Disabled — MTH gets full 30 min</span>
                  )}
                </div>
              </div>

              {nth.enabled && (
                <div className="p-0">
                  <SkillSection
                    title=""
                    category="nth"
                    config={nth}
                    jdSkillNames={selectedJd.nice_to_have_skills || []}
                    mode={mode}
                    fixedMinutes={fixedNthMin}
                    onChange={patch => setNth(prev => ({ ...prev, ...patch }))}
                  />
                </div>
              )}
            </div>

            {/* ── HR ── */}
            <HRSection
              percentage={hrPct}
              mode={mode}
              enabled={hrEnabled}
              onToggle={() => setHrEnabled(e => !e)}
              onPctChange={setHrPct}
            />

            {/* Recording */}
            <label className="flex items-center gap-3 cursor-pointer px-1">
              <input
                type="checkbox"
                checked={recordingEnabled}
                onChange={e => setRecordingEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-gray-800 focus:ring-gray-500"
              />
              <span className="text-sm text-gray-700">Auto-record interview sessions</span>
            </label>
          </div>

          {/* ── Right: Summary sidebar ── */}
          <div className="space-y-4">

            {/* Weightage distribution */}
            <div className="bg-white border border-gray-200 rounded-lg p-4 lg:sticky lg:top-6">
              <h3 className="font-semibold text-gray-900 text-sm mb-4">Configuration Summary</h3>

              {/* Weightage visual */}
              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>Scoring Weight Distribution</span>
                  <span className={`font-semibold ${pctValid ? 'text-green-600' : 'text-red-500'}`}>
                    {totalPct}% / 100%
                  </span>
                </div>
                {[
                  { label: 'MTH', pct: mth.percentage, color: 'bg-purple-500' },
                  ...(nth.enabled ? [{ label: 'NTH', pct: nth.percentage, color: 'bg-indigo-400' }] : []),
                  ...(hrEnabled ? [{ label: 'HR', pct: hrPct, color: 'bg-blue-400' }] : []),
                ].map(({ label, pct, color }) => (
                  <div key={label}>
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className="text-gray-600">{label}</span>
                      <span className="font-medium text-gray-900">{pct}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              {!pctValid && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-100 mb-4">
                  <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-red-600">Weights must total 100%. Adjust MTH, NTH, or HR percentages.</p>
                </div>
              )}

              {/* Time allocation (fixed mode) */}
              {mode === 'fixed' && (
                <div className="border border-gray-100 rounded-lg overflow-hidden mb-4">
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                    <span className="text-xs font-medium text-gray-500">Fixed Time Allocation</span>
                  </div>
                  <table className="w-full text-xs">
                    <tbody>
                      <tr className="border-b border-gray-50">
                        <td className="px-3 py-2 text-gray-600">MTH</td>
                        <td className="px-3 py-2 text-gray-400">70%</td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-900">{fixedMthMin} min</td>
                      </tr>
                      {nth.enabled && (
                        <tr className="border-b border-gray-50">
                          <td className="px-3 py-2 text-gray-600">NTH</td>
                          <td className="px-3 py-2 text-gray-400">20%</td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-900">{fixedNthMin} min</td>
                        </tr>
                      )}
                      {hrEnabled && (
                        <tr>
                          <td className="px-3 py-2 text-gray-600">HR</td>
                          <td className="px-3 py-2 text-gray-400">10%</td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-900">{fixedHrMin} min</td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 border-t border-gray-200">
                        <td className="px-3 py-2 font-semibold text-gray-900" colSpan={2}>Total</td>
                        <td className="px-3 py-2 text-right font-bold text-gray-900">{totalFixed} min</td>
                      </tr>
                    </tfoot>
                  </table>
                  <p className="px-3 py-2 text-[11px] text-gray-400 bg-gray-50 border-t border-gray-100">
                    AI narration time excluded from all counts
                  </p>
                </div>
              )}

              {/* Clusters summary */}
              <div className="space-y-1.5 mb-4">
                <p className="text-xs font-medium text-gray-500 mb-2">Clusters</p>
                {[...mth.clusters, ...nth.clusters].length === 0 ? (
                  <p className="text-xs text-gray-400 italic">No clusters configured yet</p>
                ) : (
                  [...mth.clusters.map(c => ({ ...c, cat: 'MTH' })), ...nth.clusters.map(c => ({ ...c, cat: 'NTH' }))].map(c => (
                    <div key={c.id} className="flex items-center justify-between text-xs">
                      <span className="text-gray-700 truncate mr-2">{c.name || <span className="italic text-gray-400">Unnamed</span>}</span>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-gray-400">{c.cat}</span>
                        <PriorityBadge p={c.priority} />
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Actions */}
              <div className="space-y-2">
                <button
                  onClick={handlePublish}
                  disabled={!pctValid || publishing || savingDraft}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 text-sm rounded-lg transition-colors ${
                    pctValid && !publishing && !savingDraft
                      ? 'bg-gray-900 text-white hover:bg-gray-800'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                  {publishing ? 'Publishing…' : 'Publish Configuration'}
                </button>
                <button
                  onClick={handleSaveAsDraft}
                  disabled={savingDraft || publishing}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingDraft ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {savingDraft ? 'Saving…' : 'Save as Draft'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Unsaved Changes Dialog */}
      <Dialog open={showUnsavedDialog} onOpenChange={open => !open && setShowUnsavedDialog(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsaved Changes</DialogTitle>
            <DialogDescription>Save your configuration as a draft before leaving?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button onClick={handleDiscardAndNavigate} className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
              Discard
            </button>
            <button onClick={handleSaveAndNavigate} disabled={savingDraft} className="px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-900 transition-colors disabled:opacity-50 flex items-center gap-2">
              {savingDraft ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {savingDraft ? 'Saving…' : 'Save Draft'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
