'use client';

import {
  ArrowLeft, Clock, Plus, X, Sparkles, CheckCircle2, Loader2,
  Users, Brain, Shield, Globe, Save, ChevronDown, ChevronUp,
  MessageSquare, Info, AlertCircle, Timer, Zap,
  Video, Upload, Layers, ChevronRight,
} from 'lucide-react';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import type { PublishedJD, AIInterviewRoundConfig, AIInterviewResponse } from '@/lib/services/aiInterviewService';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';

/* ─────────────────────────────────────────────────────────────────────── */
/*  Step indicator constants                                               */
/* ─────────────────────────────────────────────────────────────────────── */
const STEPS = ['Select JD', 'Configure', 'Clusters', 'Preview & Publish'];
const CURRENT_STEP = 2;

/* ─────────────────────────────────────────────────────────────────────── */
/*  Types                                                                  */
/* ─────────────────────────────────────────────────────────────────────── */

type InterviewMode = 'fixed' | 'flexible';
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

const SUPPORTED_LANGUAGES = [
  'Afrikaans', 'Arabic', 'Armenian', 'Azerbaijani', 'Belarusian', 'Bosnian', 'Bulgarian',
  'Catalan', 'Chinese', 'Croatian', 'Czech', 'Danish', 'Dutch', 'English', 'Estonian',
  'Finnish', 'French', 'Galician', 'German', 'Greek', 'Hebrew', 'Hindi', 'Hungarian',
  'Icelandic', 'Indonesian', 'Italian', 'Japanese', 'Kannada', 'Kazakh', 'Korean',
  'Latvian', 'Lithuanian', 'Macedonian', 'Malay', 'Malayalam', 'Marathi', 'Maori',
  'Nepali', 'Norwegian', 'Persian', 'Polish', 'Portuguese', 'Romanian', 'Russian',
  'Serbian', 'Slovak', 'Slovenian', 'Spanish', 'Swahili', 'Swedish', 'Tamil', 'Telugu',
  'Thai', 'Turkish', 'Ukrainian', 'Urdu', 'Vietnamese', 'Welsh',
];

const PRIORITY_LABELS: Record<number, { label: string; short: string; color: string; dot: string }> = {
  5: { label: 'P5 – Critical',   short: 'Critical',  color: 'bg-red-100 text-red-700 border-red-200',       dot: 'bg-red-500' },
  4: { label: 'P4 – High',       short: 'High',      color: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  3: { label: 'P3 – Medium',     short: 'Medium',    color: 'bg-yellow-100 text-yellow-700 border-yellow-200', dot: 'bg-yellow-500' },
  2: { label: 'P2 – Low',        short: 'Low',       color: 'bg-blue-100 text-blue-700 border-blue-200',     dot: 'bg-blue-500' },
  1: { label: 'P1 – Optional',   short: 'Optional',  color: 'bg-gray-100 text-gray-600 border-gray-200',     dot: 'bg-gray-400' },
};

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
  const [commentOpen, setCommentOpen] = useState<string | null>(null);
  const [collapsedClusters, setCollapsedClusters] = useState<Set<string>>(new Set());
  const [skillToDelete, setSkillToDelete] = useState<string | null>(null);

  const jdSet = new Set(jdSkillNames.map(s => s.toLowerCase()));
  const color = category === 'mth'
    ? { tag: 'bg-purple-50 text-purple-700 border-purple-200', accent: 'text-purple-700' }
    : { tag: 'bg-indigo-50 text-indigo-700 border-indigo-200', accent: 'text-indigo-700' };

  const hasClusters = config.clusters.length > 0;

  // Find skills not assigned to any cluster
  const assignedSkillSet = new Set(config.clusters.flatMap(c => c.skills.map(s => s.toLowerCase())));
  const unclusteredSkills = config.skills.filter(s => !assignedSkillSet.has(s.name.toLowerCase()));

  const toggleCluster = (id: string) => {
    setCollapsedClusters(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const addCustomSkill = () => {
    const name = customInput.trim();
    if (!name) return;
    if (config.skills.some(s => s.name.toLowerCase() === name.toLowerCase())) {
      toast.error('Skill already added');
      return;
    }
    onChange({ skills: [...config.skills, { name, comment: '', type: 'Skill' as SkillType }] });
    setCustomInput('');
  };

  const removeSkill = (name: string) => {
    // Also remove from clusters
    const updatedClusters = config.clusters.map(c => ({
      ...c,
      skills: c.skills.filter(s => s.toLowerCase() !== name.toLowerCase()),
    }));
    onChange({
      skills: config.skills.filter(s => s.name !== name),
      clusters: updatedClusters,
    });
  };

  const updateComment = (name: string, comment: string) => {
    onChange({ skills: config.skills.map(s => s.name === name ? { ...s, comment } : s) });
  };

  const updateSkillType = (name: string, type: SkillType) => {
    onChange({ skills: config.skills.map(s => s.name === name ? { ...s, type } : s) });
  };

  const SKILL_TYPE_COLORS: Record<SkillType, string> = {
    'Skill': 'bg-gray-100 text-gray-600 border-gray-200',
    'Command': 'bg-blue-50 text-blue-600 border-blue-200',
    'Certification': 'bg-green-50 text-green-600 border-green-200',
  };

  const renderSkillTag = (skill: SkillEntry) => {
    const fromJd = jdSet.has(skill.name.toLowerCase());
    const skillType = skill.type || 'Skill';
    return (
      <div key={skill.name} className="group">
        <div className="flex items-center gap-2">
          <span className={`flex-1 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border ${
            fromJd ? color.tag : 'bg-emerald-50 text-emerald-700 border-emerald-200'
          }`}>
            {skill.name}
            {fromJd && <span className="text-[10px] opacity-60">JD</span>}
          </span>
          <select
            value={skillType}
            onChange={e => updateSkillType(skill.name, e.target.value as SkillType)}
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded border cursor-pointer focus:outline-none ${SKILL_TYPE_COLORS[skillType]}`}
          >
            <option value="Skill">Skill</option>
            <option value="Command">Command</option>
            <option value="Certification">Certification</option>
          </select>
          <button
            onClick={() => setCommentOpen(commentOpen === skill.name ? null : skill.name)}
            title="Add comment"
            className={`p-1 rounded transition-colors ${skill.comment ? 'text-amber-500' : 'text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100'}`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setSkillToDelete(skill.name)}
            className="p-1 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        {commentOpen === skill.name && (
          <div className="mt-1 ml-0.5 flex items-center gap-1.5">
            <input
              autoFocus
              value={skill.comment}
              onChange={e => updateComment(skill.name, e.target.value)}
              placeholder="Add interviewer note for this skill (not shown to candidate)…"
              className="flex-1 px-3 py-1.5 text-xs border border-amber-200 rounded-lg bg-amber-50/50 focus:outline-none focus:ring-1 focus:ring-amber-300 placeholder-amber-300"
            />
            <button
              onClick={() => { updateComment(skill.name, ''); setCommentOpen(null); }}
              title="Clear & close"
              className="p-1 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    );
  };

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

        {/* ── Clustered view: skills grouped by cluster topic ── */}
        {hasClusters && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-purple-500" />
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Skill Clusters</span>
              </div>
              <span className="text-xs text-gray-400">
                {config.clusters.length} cluster{config.clusters.length !== 1 ? 's' : ''} · {config.skills.length} skill{config.skills.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="space-y-2.5">
              {config.clusters
                .slice()
                .sort((a, b) => b.priority - a.priority)
                .map(cluster => {
                  const isCollapsed = collapsedClusters.has(cluster.id);
                  const clusterSkills = config.skills.filter(s =>
                    cluster.skills.some(cs => cs.toLowerCase() === s.name.toLowerCase())
                  );

                  return (
                    <div key={cluster.id} className="border border-gray-200 rounded-lg overflow-hidden">
                      {/* Cluster header */}
                      <button
                        onClick={() => toggleCluster(cluster.id)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                      >
                        {isCollapsed
                          ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          : <ChevronUp className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        }
                        <span className="flex-1 text-sm font-medium text-gray-800">{cluster.name || 'Unnamed Topic'}</span>
                        <PriorityBadge p={cluster.priority} />
                        <span className="text-[11px] text-gray-400">{clusterSkills.length} skill{clusterSkills.length !== 1 ? 's' : ''}</span>
                      </button>

                      {/* Cluster body */}
                      {!isCollapsed && (
                        <div className="px-3 py-2.5 space-y-1.5 border-t border-gray-100">
                          {cluster.reason && (
                            <p className="text-[11px] text-gray-500 italic mb-1">{cluster.reason}</p>
                          )}
                          {clusterSkills.length === 0 && (
                            <p className="text-xs text-gray-400 italic">No matching skills</p>
                          )}
                          {clusterSkills.map(skill => renderSkillTag(skill))}
                        </div>
                      )}
                    </div>
                  );
                })}

              {/* Unclustered skills */}
              {unclusteredSkills.length > 0 && (
                <div className="border border-dashed border-amber-300 rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-50">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                    <span className="flex-1 text-sm font-medium text-amber-700">Unassigned Skills</span>
                    <span className="text-[11px] text-amber-500">{unclusteredSkills.length} skill{unclusteredSkills.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="px-3 py-2.5 space-y-1.5 border-t border-amber-200">
                    {unclusteredSkills.map(skill => renderSkillTag(skill))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Flat view: no clusters yet, show skills as flat list ── */}
        {!hasClusters && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Skills</span>
              <span className="text-xs text-gray-400">{config.skills.length} skill{config.skills.length !== 1 ? 's' : ''}</span>
            </div>

            <div className="space-y-1.5">
              {config.skills.map(skill => renderSkillTag(skill))}

              {config.skills.length === 0 && (
                <p className="text-xs text-gray-400 italic py-1">No skills yet — will be auto-populated from JD.</p>
              )}
            </div>
          </div>
        )}

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

      {/* Delete skill confirmation */}
      <ConfirmationDialog
        isOpen={!!skillToDelete}
        onClose={() => setSkillToDelete(null)}
        onConfirm={() => { if (skillToDelete) removeSkill(skillToDelete); }}
        title="Remove Skill"
        description={`Are you sure you want to remove "${skillToDelete}"? This will also remove it from any cluster it belongs to.`}
        confirmText="Remove"
        variant="danger"
      />
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
  const existingDraftIdRef = useRef<string | null>(null); // track draft id for auto-save updates
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Interview mode */
  const [mode, setMode] = useState<InterviewMode>('fixed');

  /* Category configs */
  const [mth, setMth] = useState<CategoryConfig>({
    skills: [], clusters: [], percentage: DEFAULT_PCT.mth, enabled: true,
  });
  const [nth, setNth] = useState<CategoryConfig>({
    skills: [], clusters: [], percentage: DEFAULT_PCT.nth, enabled: true,
  });
  const [hrPct, setHrPct] = useState<number>(DEFAULT_PCT.hr);
  const [hrEnabled, setHrEnabled] = useState(true);

  /* Other settings */
  const [recordingEnabled, setRecordingEnabled] = useState(true);
  const [availableLanguages, setAvailableLanguages] = useState<string[]>(['English']);
  const [languageInput, setLanguageInput] = useState('');

  /* Introduction video (optional) */
  const [introVideoFile, setIntroVideoFile] = useState<File | null>(null);
  const [introVideoUrl, setIntroVideoUrl] = useState<string>('');
  const [uploadingVideo, setUploadingVideo] = useState(false);

  /* Action states */
  const [savingDraft, setSavingDraft] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const isNavigatingRef = useRef(false);

  /* ── Load JD + restore draft if one exists ── */
  useEffect(() => {
    if (!jdId) { router.replace('/recruitment/ai-interviews/jd-selection'); return; }
    const loadJD = async () => {
      try {
        setLoadingJd(true);

        // Load JD and check for existing draft in parallel
        const [jdResult, draftResult] = await Promise.all([
          aiInterviewService.getPublishedJDs(),
          aiInterviewService.listConfigs({ status: 'draft', page_size: 50 }).catch(() => null),
        ]);

        const jd = jdResult.items.find(j => j.id === jdId);
        if (!jd) {
          toast.error('Job description not found');
          router.replace('/recruitment/ai-interviews/jd-selection');
          return;
        }
        setSelectedJd(jd);

        // Look for a draft config saved for this JD
        const existingDraft = draftResult?.items?.find(
          (c: AIInterviewResponse) => c.jd_id === jdId && c.status === 'draft'
        );

        if (existingDraft?.rounds_config?.length) {
          // Restore state from saved draft
          existingDraftIdRef.current = existingDraft.id;

          const mthRound = existingDraft.rounds_config.find((r: AIInterviewRoundConfig) => r.type === 'must_have_skills');
          const nthRound = existingDraft.rounds_config.find((r: AIInterviewRoundConfig) => r.type === 'nice_to_have_skills');
          const hrRound  = existingDraft.rounds_config.find((r: AIInterviewRoundConfig) => r.type === 'hr');

          const toSkillEntries = (skills: string[] = []) =>
            skills.map(s => ({ name: s, comment: '', type: 'Skill' as SkillType }));

          if (mthRound) {
            const draftSkills = [...(mthRound.jd_skills || []), ...(mthRound.custom_skills || [])];
            setMth({
              skills: draftSkills.length > 0
                ? toSkillEntries(draftSkills)
                : (jd.must_have_skills?.map(s => ({ name: s, comment: '', type: 'Skill' as SkillType })) ?? []),
              clusters: [],
              percentage: mthRound.percentage ?? DEFAULT_PCT.mth,
              enabled: true,
            });
          } else {
            setMth(prev => ({
              ...prev,
              skills: jd.must_have_skills?.map(s => ({ name: s, comment: '', type: 'Skill' as SkillType })) ?? [],
            }));
          }

          if (nthRound) {
            const draftSkills = [...(nthRound.jd_skills || []), ...(nthRound.custom_skills || [])];
            setNth({
              skills: draftSkills.length > 0
                ? toSkillEntries(draftSkills)
                : (jd.nice_to_have_skills?.map(s => ({ name: s, comment: '', type: 'Skill' as SkillType })) ?? []),
              clusters: [],
              percentage: nthRound.percentage ?? DEFAULT_PCT.nth,
              enabled: true,
            });
          } else {
            setNth(prev => ({
              ...prev,
              enabled: false,
              skills: jd.nice_to_have_skills?.map(s => ({ name: s, comment: '', type: 'Skill' as SkillType })) ?? [],
            }));
          }

          if (hrRound) {
            setHrEnabled(true);
            setHrPct(hrRound.percentage ?? DEFAULT_PCT.hr);
          } else {
            setHrEnabled(false);
          }

          // Detect mode from stored duration (0 = flexible)
          const storedDuration = existingDraft.duration_minutes ?? 30;
          setMode(storedDuration === 0 ? 'flexible' : 'fixed');

          // Restore available languages
          if ((existingDraft as any).available_languages?.length) {
            setAvailableLanguages((existingDraft as any).available_languages);
          }

          // Restore introduction video URL
          if ((existingDraft as any).introduction_video_url) {
            setIntroVideoUrl((existingDraft as any).introduction_video_url);
          }

          // Restore clusters, skill comments, and skill types from special_instructions
          try {
            const si = (existingDraft as any).special_instructions;
            if (si) {
              const parsed = JSON.parse(si);
              const mthComments: Record<string, string> = parsed.skill_comments?.mth || {};
              const nthComments: Record<string, string> = parsed.skill_comments?.nth || {};
              const mthTypes: Record<string, string> = parsed.skill_types?.mth || {};
              const nthTypes: Record<string, string> = parsed.skill_types?.nth || {};

              // Restore clusters
              if (parsed.mth_clusters?.length) {
                setMth(prev => ({ ...prev, clusters: parsed.mth_clusters }));
              }
              if (parsed.nth_clusters?.length) {
                setNth(prev => ({ ...prev, clusters: parsed.nth_clusters }));
              }

              // Restore comments and types onto skills
              if (Object.keys(mthComments).length || Object.keys(mthTypes).length) {
                setMth(prev => ({
                  ...prev,
                  skills: prev.skills.map(s => ({
                    ...s,
                    comment: mthComments[s.name] || s.comment,
                    type: (mthTypes[s.name] as SkillType) || s.type || 'Skill',
                  })),
                }));
              }
              if (Object.keys(nthComments).length || Object.keys(nthTypes).length) {
                setNth(prev => ({
                  ...prev,
                  skills: prev.skills.map(s => ({
                    ...s,
                    comment: nthComments[s.name] || s.comment,
                    type: (nthTypes[s.name] as SkillType) || s.type || 'Skill',
                  })),
                }));
              }
            }
          } catch {
            // Silent — malformed special_instructions is non-critical
          }

        } else {
          // No draft — populate from JD
          setMth(prev => ({
            ...prev,
            skills: jd.must_have_skills?.map(s => ({ name: s, comment: '', type: 'Skill' as SkillType })) ?? [],
          }));
          setNth(prev => ({
            ...prev,
            skills: jd.nice_to_have_skills?.map(s => ({ name: s, comment: '', type: 'Skill' as SkillType })) ?? [],
          }));
        }

      } catch {
        toast.error('Failed to load job description');
        router.replace('/recruitment/ai-interviews/jd-selection');
      } finally {
        setLoadingJd(false);
      }
    };
    loadJD();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jdId]);

  /* ── Navigation guards ── */
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (selectedJd && !isNavigatingRef.current) {
        e.preventDefault(); e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [selectedJd]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!selectedJd || isNavigatingRef.current) return;
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

  /* ── Auto-save draft (debounced 2s) whenever config changes ── */
  useEffect(() => {
    if (!selectedJd || loadingJd) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        const rounds = buildRounds(true);
        const payload = {
          position: selectedJd.title,
          jd_id: selectedJd.id,
          duration_minutes: mode === 'fixed' ? (FIXED_TIME.mth + (nth.enabled ? FIXED_TIME.nth : 0) + (hrEnabled ? FIXED_TIME.hr : 0)) : 0,
          rounds_config: rounds,
          recording_enabled: recordingEnabled,
          available_languages: availableLanguages,
          title: `${selectedJd.title} - AI Interview`,
          save_as_draft: true,
          special_instructions: buildClusterJson(),
          introduction_video_url: introVideoUrl || undefined,
        };

        if (existingDraftIdRef.current) {
          // Update existing draft
          await aiInterviewService.update(existingDraftIdRef.current, payload);
        } else {
          // Create new draft and remember its id
          const created = await aiInterviewService.create(payload);
          existingDraftIdRef.current = created.id;
        }
      } catch {
        // Silent — don't toast on auto-save failures
      }
    }, 2000);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mth, nth, hrPct, hrEnabled, mode, recordingEnabled, availableLanguages, introVideoUrl, selectedJd, loadingJd]);

  /* ── Derived values ── */
  const nthAvailable = nth.skills.length > 0 || nth.enabled;

  // Effective time for fixed mode (MOM: if NTH not available → all to MTH)
  const fixedMthMin = !nth.enabled ? FIXED_TIME.mth + FIXED_TIME.nth : FIXED_TIME.mth;
  const fixedNthMin = nth.enabled ? FIXED_TIME.nth : 0;
  const fixedHrMin  = hrEnabled ? FIXED_TIME.hr : 0;
  const totalFixed  = fixedMthMin + fixedNthMin + fixedHrMin;

  const totalPct = mth.percentage + (nth.enabled ? nth.percentage : 0) + (hrEnabled ? hrPct : 0);
  const pctValid = totalPct === 100;

  /* ── Video handlers ── */
  const handleVideoUpload = async (file: File) => {
    setIntroVideoFile(file);
    setUploadingVideo(true);
    try {
      const result = await aiInterviewService.uploadIntroVideo(file);
      setIntroVideoUrl(result.url || result.file_url || '');
      toast.success('Video uploaded successfully');
    } catch {
      toast.error('Failed to upload video');
      setIntroVideoFile(null);
    } finally {
      setUploadingVideo(false);
    }
  };

  const handleRemoveVideo = () => {
    setIntroVideoFile(null);
    setIntroVideoUrl('');
  };

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
      // Clusters → topics + topic_weights + topic_time_minutes
      const topics = mth.clusters.map(c => c.name).filter(Boolean);
      const topicWeights: Record<string, number> = {};
      const topicTime: Record<string, number> = {};
      const mthTotalW = mth.clusters.reduce((s, c) => s + c.priority, 0);
      mth.clusters.forEach(c => {
        if (c.name) {
          topicWeights[c.name] = c.priority * 20;
          topicTime[c.name] = mthTotalW > 0 ? Math.round((c.priority / mthTotalW) * fixedMthMin) : 0;
        }
      });

      rounds.push({
        type: 'must_have_skills',
        percentage: mth.percentage,
        duration_minutes: dur('mth'),
        topics,
        topic_weights: topics.length > 0 ? topicWeights : undefined,
        topic_time_minutes: topics.length > 0 ? topicTime : undefined,
        enabled: true,
        order: 2,
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
      const nthTopicTime: Record<string, number> = {};
      const nthTotalW = nth.clusters.reduce((s, c) => s + c.priority, 0);
      nth.clusters.forEach(c => {
        if (c.name) {
          topicWeights[c.name] = c.priority * 20;
          nthTopicTime[c.name] = nthTotalW > 0 ? Math.round((c.priority / nthTotalW) * fixedNthMin) : 0;
        }
      });

      rounds.push({
        type: 'nice_to_have_skills',
        percentage: nth.percentage,
        duration_minutes: dur('nth'),
        topics,
        topic_weights: topics.length > 0 ? topicWeights : undefined,
        topic_time_minutes: topics.length > 0 ? nthTopicTime : undefined,
        enabled: true,
        order: 3,
        jd_skills: jdSkills.length > 0 ? jdSkills : undefined,
        custom_skills: customSkills.length > 0 ? customSkills : undefined,
      });
    }

    // HR round — always first (introduction, background, cultural fit)
    if (hrEnabled) {
      rounds.push({
        type: 'hr',
        percentage: hrPct,
        duration_minutes: dur('hr'),
        topics: ['Behavioural', 'Cultural Fit', 'Situational'],
        enabled: true,
        order: 1,
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
    skill_types: {
      mth: Object.fromEntries(mth.skills.filter(s => s.type && s.type !== 'Skill').map(s => [s.name, s.type])),
      nth: Object.fromEntries(nth.skills.filter(s => s.type && s.type !== 'Skill').map(s => [s.name, s.type])),
    },
  });

  /* ── Save / Publish ── */
  const saveDraft = async (silent = false): Promise<boolean> => {
    if (!selectedJd) return false;
    setSavingDraft(true);
    try {
      const payload = {
        position: selectedJd.title,
        jd_id: selectedJd.id,
        duration_minutes: mode === 'fixed' ? totalFixed : 0,
        rounds_config: buildRounds(true),
        recording_enabled: recordingEnabled,
        available_languages: availableLanguages,
        title: `${selectedJd.title} - AI Interview`,
        save_as_draft: true,
        special_instructions: buildClusterJson(),
        introduction_video_url: introVideoUrl || undefined,
      };
      if (existingDraftIdRef.current) {
        await aiInterviewService.update(existingDraftIdRef.current, payload);
      } else {
        const created = await aiInterviewService.create(payload);
        existingDraftIdRef.current = created.id;
      }
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

  const [generatingClusters, setGeneratingClusters] = useState(false);

  const handleContinueToClusters = async () => {
    if (!selectedJd || !pctValid) return;
    isNavigatingRef.current = true;

    // 1. Save draft first
    const ok = await saveDraft(true);
    if (!ok || !existingDraftIdRef.current) {
      isNavigatingRef.current = false;
      toast.error('Please save your configuration first');
      return;
    }

    // 2. Generate clusters via API — only if none exist yet
    const hasExistingClusters = (mth.clusters && mth.clusters.length > 0) || (nth.clusters && nth.clusters.length > 0);

    if (!hasExistingClusters) {
      setGeneratingClusters(true);
      try {
        const result = await aiInterviewService.generateClusters(
          mth.skills.map(s => s.name),
          nth.enabled ? nth.skills.map(s => s.name) : [],
          selectedJd.title,
          selectedJd.description,
          fixedMthMin,
          nth.enabled ? fixedNthMin : 0,
        );

        // Save generated clusters to the draft
        const siObj = JSON.parse(buildClusterJson());
        siObj.mth_clusters = result.mth_clusters.map(c => ({
          ...c,
          priority: c.priority as Cluster['priority'],
          reason: c.reason || '',
        }));
        siObj.nth_clusters = result.nth_clusters.map(c => ({
          ...c,
          priority: c.priority as Cluster['priority'],
          reason: c.reason || '',
        }));
        await aiInterviewService.update(existingDraftIdRef.current, {
          special_instructions: JSON.stringify(siObj),
        });
      } catch {
        // Clusters generation failed — still navigate, user can generate on clusters page
        console.warn('Cluster generation failed, navigating without pre-generated clusters');
      } finally {
        setGeneratingClusters(false);
      }
    }

    // 3. Navigate to clusters page
    router.push(`/recruitment/ai-interviews/jd-selection/ai-interview-config/clusters?id=${existingDraftIdRef.current}`);
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

  const handleDiscardAndNavigate = async () => {
    setShowUnsavedDialog(false);
    isNavigatingRef.current = true;
    // Delete draft if it exists
    if (existingDraftIdRef.current) {
      try {
        await aiInterviewService.delete(existingDraftIdRef.current);
        existingDraftIdRef.current = null;
      } catch {
        // Silent — don't block navigation on delete failure
      }
    }
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
      <div className="w-full">

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
          {STEPS.map((step, i) => {
            const stepNum = i + 1;
            const isCompleted = stepNum < CURRENT_STEP;
            const isCurrent = stepNum === CURRENT_STEP;
            return (
              <React.Fragment key={step}>
                {i > 0 && <div className="w-8 h-px bg-gray-200" />}
                {isCompleted ? (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center bg-green-100">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  </div>
                ) : (
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium ${
                    isCurrent ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'
                  }`}>{stepNum}</div>
                )}
                <span className={`text-sm ${isCurrent ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>{step}</span>
              </React.Fragment>
            );
          })}
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

            {/* ── Interview Mode + Make Clusters ── */}
            <div className="border border-gray-200 rounded-lg bg-white p-4 space-y-4">
              <div>
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
                      {hrEnabled && <div>HR Round → {fixedHrMin} min</div>}
                      <div>Must-to-Have → {fixedMthMin} min</div>
                      {nth.enabled && <div>Nice-to-Have → {fixedNthMin} min</div>}
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
            </div>

            {/* ── MTH ── */}
            <SkillSection
              title="Must-To-Have Skills"
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
                  <span className="font-semibold text-gray-900 text-sm">Nice-To-Have Skills</span>
                  {!nth.enabled && mode === 'fixed' && (
                    <span className="text-[11px] text-gray-400 italic">Disabled — Must-to-Have gets full 30 min</span>
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

            {/* Introduction Video (Optional) */}
            <div className="px-1 space-y-2">
              <div className="flex items-center gap-2">
                <Video className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Introduction Video</span>
                <span className="text-xs text-gray-400">(Optional)</span>
              </div>
              <p className="text-xs text-gray-500">
                Upload a short video introducing the role. Candidates will see this before the interview starts.
              </p>
              {introVideoFile || introVideoUrl ? (
                <div className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <Video className="w-5 h-5 text-gray-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 truncate">{introVideoFile?.name || 'Uploaded video'}</p>
                    {introVideoFile && (
                      <p className="text-xs text-gray-400">{(introVideoFile.size / (1024 * 1024)).toFixed(1)} MB</p>
                    )}
                  </div>
                  {uploadingVideo ? (
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  ) : (
                    <button onClick={handleRemoveVideo} className="p-1 text-gray-400 hover:text-red-500 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-colors">
                  <Upload className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-500">Click to upload an introduction video</span>
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) handleVideoUpload(file);
                    }}
                  />
                </label>
              )}
            </div>

            {/* Candidate Languages */}
            <div className="px-1 space-y-2">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Candidate Languages</span>
              </div>
              <p className="text-xs text-gray-500">
                Select which languages the candidate can choose for the interview. The AI will conduct the interview in their chosen language.
              </p>

              {/* Selected languages */}
              <div className="flex flex-wrap gap-1.5">
                {availableLanguages.map(lang => (
                  <span
                    key={lang}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700 border border-gray-200"
                  >
                    {lang}
                    {lang !== 'English' && (
                      <button
                        onClick={() => setAvailableLanguages(prev => prev.filter(l => l !== lang))}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>

              {/* Add language */}
              <div className="relative">
                <select
                  value={languageInput}
                  onChange={e => {
                    const val = e.target.value;
                    if (val && !availableLanguages.includes(val)) {
                      setAvailableLanguages(prev => [...prev, val].sort());
                    }
                    setLanguageInput('');
                  }}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white text-gray-700"
                >
                  <option value="">Add a language...</option>
                  {SUPPORTED_LANGUAGES.filter(l => !availableLanguages.includes(l)).map(lang => (
                    <option key={lang} value={lang}>{lang}</option>
                  ))}
                </select>
              </div>
            </div>
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
                  { label: 'Must-to-Have', pct: mth.percentage, color: 'bg-purple-500' },
                  ...(nth.enabled ? [{ label: 'Nice-to-Have', pct: nth.percentage, color: 'bg-indigo-400' }] : []),
                  ...(hrEnabled ? [{ label: 'HR Round', pct: hrPct, color: 'bg-blue-400' }] : []),
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
                  <p className="text-[11px] text-red-600">Weights must total 100%. Adjust Must-to-Have, Nice-to-Have, or HR percentages.</p>
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
                      {hrEnabled && (
                        <tr className="border-b border-gray-50">
                          <td className="px-3 py-2 text-gray-600">HR Round</td>
                          <td className="px-3 py-2 text-gray-400">{hrPct}%</td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-900">{fixedHrMin} min</td>
                        </tr>
                      )}
                      <tr className="border-b border-gray-50">
                        <td className="px-3 py-2 text-gray-600">Must-to-Have</td>
                        <td className="px-3 py-2 text-gray-400">{mth.percentage}%</td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-900">{fixedMthMin} min</td>
                      </tr>
                      {nth.enabled && (
                        <tr>
                          <td className="px-3 py-2 text-gray-600">Nice-to-Have</td>
                          <td className="px-3 py-2 text-gray-400">{nth.percentage}%</td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-900">{fixedNthMin} min</td>
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

              {/* Actions */}
              <div className="space-y-2">
                <button
                  onClick={handleContinueToClusters}
                  disabled={!pctValid || savingDraft || generatingClusters}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 text-sm rounded-lg transition-colors ${
                    pctValid && !savingDraft && !generatingClusters
                      ? 'bg-gray-900 text-white hover:bg-gray-800'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {(savingDraft || generatingClusters) ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                  {savingDraft ? 'Saving…' : generatingClusters ? 'Generating Clusters…' : 'Continue to Clusters'}
                </button>
                <button
                  onClick={handleSaveAsDraft}
                  disabled={savingDraft}
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
