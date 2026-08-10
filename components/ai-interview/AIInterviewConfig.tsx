'use client';

import {
  Clock, Plus, X, Sparkles, CheckCircle2, Loader2,
  Users, Brain, Shield, Globe, Save, ChevronDown, ChevronUp,
  MessageSquare, Info, AlertCircle, Timer, Zap,
  Video, Upload, Layers, ChevronRight, Camera, Play,
  Lock, ArrowRightLeft, Mic, QrCode,
} from 'lucide-react';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import type {
  PublishedJD,
  AIInterviewRoundConfig,
  AIInterviewResponse,
  AIInterviewHRQuestionStage,
} from '@/lib/services/aiInterviewService';
import api from '@/lib/services/api';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { getPriorityLabel } from '@/lib/constants/aiInterviewPriority';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { modeFromConfig, durationFromMode } from '@/lib/constants/aiInterviewMode';
import { STT_MODELS, DEFAULT_STT_MODEL } from '@/lib/constants/aiInterviewSttModels';
import { AIInterviewStepIndicator } from './AIInterviewStepIndicator';
import AIInterviewFlowLoader from './AIInterviewFlowLoader';

/* ─────────────────────────────────────────────────────────────────────── */
/*  Step indicator constants                                               */
/* ─────────────────────────────────────────────────────────────────────── */
const CURRENT_STEP = 2 as const;

/* ─────────────────────────────────────────────────────────────────────── */
/*  Types                                                                  */
/* ─────────────────────────────────────────────────────────────────────── */

type InterviewMode = 'fixed' | 'flexible';
type SkillType = 'Skill' | 'Command';
type HRQuestionStage = AIInterviewHRQuestionStage;

interface HRBankQuestion {
  id: string;
  question_text: string;
  answer_type: 'text' | 'yes_no';
  is_default: boolean;
}

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

const DEFAULT_PCT = { mth: 70, nth: 20, hr: 10 } as const; // scoring weights (MOM §default)

function mergeHRBankQuestions(existing: HRBankQuestion[], incoming: HRBankQuestion[]): HRBankQuestion[] {
  const merged = new Map<string, HRBankQuestion>();
  existing.forEach(question => merged.set(question.id, question));
  incoming.forEach(question => {
    const prev = merged.get(question.id);
    merged.set(question.id, prev ? { ...prev, ...question } : question);
  });
  return Array.from(merged.values());
}

/**
 * When sections are toggled on/off in flexible mode, proportionally redistribute
 * percentages so they always sum to 100. Disabled sections are set to 0.
 * Returns new [mthPct, nthPct, hrPct] tuple.
 */
function redistributeFlexPct(
  mthPct: number, nthEnabled: boolean, nthPct: number, hrEnabled: boolean, hrPct: number,
): [number, number, number] {
  const values = [mthPct, nthEnabled ? nthPct : 0, hrEnabled ? hrPct : 0];
  const total = values.reduce((s, v) => s + v, 0);

  if (total === 100) return [values[0], values[1], values[2]];

  if (total <= 0) {
    // Fallback: equal split among enabled sections
    const count = [true, nthEnabled, hrEnabled].filter(Boolean).length;
    const base = Math.floor(100 / count);
    const r: [number, number, number] = [base, nthEnabled ? base : 0, hrEnabled ? base : 0];
    r[0] += 100 - r.reduce((s, v) => s + v, 0);
    return r;
  }

  const scale = 100 / total;
  const scaled: [number, number, number] = [
    Math.round(values[0] * scale),
    Math.round(values[1] * scale),
    Math.round(values[2] * scale),
  ];
  // Fix rounding error by adjusting MHS (always enabled)
  scaled[0] += 100 - scaled.reduce((s, v) => s + v, 0);
  return scaled;
}

function getReenabledPctSeed(currentPct: number, fallbackPct: number): number {
  return currentPct > 0 ? currentPct : fallbackPct;
}

function redistributeFlexPctWithPinnedRound(
  mthPct: number,
  nthEnabled: boolean,
  nthPct: number,
  hrEnabled: boolean,
  hrPct: number,
  pinnedRound: 'nth' | 'hr',
): [number, number, number] {
  const pinnedPctRaw = pinnedRound === 'nth' ? nthPct : hrPct;
  const pinnedPct = Math.max(0, Math.min(100, pinnedPctRaw));
  const remaining = 100 - pinnedPct;

  const otherEntries = [
    { key: 'mth' as const, enabled: true, value: mthPct },
    { key: 'nth' as const, enabled: nthEnabled && pinnedRound !== 'nth', value: nthPct },
    { key: 'hr' as const, enabled: hrEnabled && pinnedRound !== 'hr', value: hrPct },
  ].filter(entry => entry.enabled);

  const totalOther = otherEntries.reduce((sum, entry) => sum + entry.value, 0);
  if (totalOther <= 0) {
    return [
      remaining,
      nthEnabled ? (pinnedRound === 'nth' ? pinnedPct : 0) : 0,
      hrEnabled ? (pinnedRound === 'hr' ? pinnedPct : 0) : 0,
    ];
  }

  const scaled: Record<'mth' | 'nth' | 'hr', number> = { mth: 0, nth: 0, hr: 0 };
  otherEntries.forEach((entry) => {
    scaled[entry.key] = Math.round((entry.value / totalOther) * remaining);
  });
  scaled.mth += remaining - otherEntries.reduce((sum, entry) => sum + scaled[entry.key], 0);

  if (pinnedRound === 'nth') scaled.nth = nthEnabled ? pinnedPct : 0;
  if (pinnedRound === 'hr') scaled.hr = hrEnabled ? pinnedPct : 0;

  return [scaled.mth, nthEnabled ? scaled.nth : 0, hrEnabled ? scaled.hr : 0];
}

function allocateFlexibleMinutes(
  totalMinutes: number,
  rounds: Array<{ key: 'mth' | 'nth' | 'hr'; enabled: boolean; percentage: number }>,
): Record<'mth' | 'nth' | 'hr', number> {
  const allocation: Record<'mth' | 'nth' | 'hr', number> = { mth: 0, nth: 0, hr: 0 };
  const activeRounds = rounds.filter(round => round.enabled && round.percentage > 0);
  const totalPercentage = activeRounds.reduce((sum, round) => sum + round.percentage, 0);

  if (totalMinutes <= 0 || totalPercentage <= 0) {
    return allocation;
  }

  const exactAllocations = activeRounds.map(round => {
    const exact = (round.percentage / totalPercentage) * totalMinutes;
    const floor = Math.floor(exact);
    return {
      key: round.key,
      floor,
      remainder: exact - floor,
    };
  });

  exactAllocations.forEach(round => {
    allocation[round.key] = round.floor;
  });

  let remainderMinutes = totalMinutes - exactAllocations.reduce((sum, round) => sum + round.floor, 0);
  exactAllocations
    .sort((a, b) => {
      if (b.remainder !== a.remainder) return b.remainder - a.remainder;
      if (a.key === 'mth') return -1;
      if (b.key === 'mth') return 1;
      return a.key.localeCompare(b.key);
    })
    .forEach(round => {
      if (remainderMinutes <= 0) return;
      allocation[round.key] += 1;
      remainderMinutes -= 1;
    });

  return allocation;
}

function getTimedModeAllocation(nthEnabled: boolean, hrEnabled: boolean) {
  if (!nthEnabled && !hrEnabled) {
    return {
      mthMinutes: 30,
      nthMinutes: 0,
      hrMinutes: 0,
      mthQuestions: 15,
      nthQuestions: 0,
      hrQuestions: 0,
      mthMaxClusters: 3,
      nthMaxClusters: 0,
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
      mthMaxClusters: 3,
      nthMaxClusters: 2,
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
      mthMaxClusters: 3,
      nthMaxClusters: 2,
    };
  }

  return {
    mthMinutes: 20,
    nthMinutes: 0,
    hrMinutes: 10,
    mthQuestions: 10,
    nthQuestions: 0,
    hrQuestions: 5,
    mthMaxClusters: 3,
    nthMaxClusters: 0,
  };
}

function getTimedModePercentages(nthEnabled: boolean, hrEnabled: boolean, hrPct: number = DEFAULT_PCT.hr) {
  const allocation = getTimedModeAllocation(nthEnabled, hrEnabled);
  const scoringQuestionTotal = allocation.mthQuestions + allocation.nthQuestions;

  if (scoringQuestionTotal <= 0) {
    return { mth: 0, nth: 0, hr: hrEnabled ? hrPct : 0 };
  }

  // When HR is enabled it gets hrPct of the total score;
  // MTH + NTH split the remaining (100 - hrPct) proportionally.
  const scoringBudget = hrEnabled ? 100 - hrPct : 100;
  const mth = Math.round((allocation.mthQuestions / scoringQuestionTotal) * scoringBudget);
  const nth = nthEnabled ? scoringBudget - mth : 0;

  return {
    mth,
    nth,
    hr: hrEnabled ? hrPct : 0,
  };
}

function allocateClusterMinutes(
  clusters: { id?: string; name?: string; priority: number }[],
  totalMinutes: number,
): Record<string, number> {
  const namedClusters = clusters.filter(cluster => cluster.name);
  if (namedClusters.length === 0 || totalMinutes <= 0) return {};

  const totalWeight = namedClusters.reduce((sum, cluster) => sum + cluster.priority, 0);
  if (totalWeight <= 0) {
    return Object.fromEntries(namedClusters.map(cluster => [cluster.name as string, 0]));
  }

  const baseAllocations = namedClusters.map((cluster, index) => {
    const exact = (cluster.priority / totalWeight) * totalMinutes;
    const base = Math.floor(exact);
    return {
      name: cluster.name as string,
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

  return Object.fromEntries(baseAllocations.map(item => [item.name, item.base]));
}

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

// Priority labels are imported from lib/constants/aiInterviewPriority (P1-P3 scale).
// Any legacy 1-5 values from the AI cluster generator are normalized via
// getPriorityLabel() so this component never has to know the underlying scale.

/* ─────────────────────────────────────────────────────────────────────── */
/*  Sub-components                                                          */
/* ─────────────────────────────────────────────────────────────────────── */

function PriorityBadge({ p }: { p: number }) {
  const { label, color } = getPriorityLabel(p);
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
  questionCount: number;
  flexibleMinutes: number;
  onChange: (updated: Partial<CategoryConfig>) => void;
  /** Flexible mode only: callback to transfer a skill to the opposite category */
  onMoveSkill?: (skillName: string) => void;
  /** Flexible mode only: true when clusters have been generated — locks add/remove */
  isLocked?: boolean;
  /** Flexible mode only: clears clusters so skills can be edited again */
  onResetClusters?: () => void;
  /** When true, always render the flat skills list even if clusters exist in state.
   *  Clusters are preserved in state (saveDraft keeps them for the clusters page)
   *  but are never rendered on this page. */
  hideClustersView?: boolean;
}

function SkillSection({ title, category, config, jdSkillNames, mode, questionCount, flexibleMinutes, onChange, onMoveSkill, isLocked = false, onResetClusters, hideClustersView = false }: SkillSectionProps) {
  const [commentOpen, setCommentOpen] = useState<string | null>(null);
  const [collapsedClusters, setCollapsedClusters] = useState<Set<string>>(new Set());
  const [skillToDelete, setSkillToDelete] = useState<string | null>(null);
  const [weightError, setWeightError] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');
  const [addSkillError, setAddSkillError] = useState('');

  const jdSet = new Set(jdSkillNames.map(s => s.toLowerCase()));
  const color = category === 'mth'
    ? { tag: 'bg-brand-blue/10 text-brand-blue border-brand-blue/20', accent: 'text-brand-blue' }
    : { tag: 'bg-brand-cyan/10 text-brand-cyan border-brand-cyan/20', accent: 'text-brand-cyan' };

  // hideClustersView: clusters are kept in state for save integrity but not rendered here
  const hasClusters = !hideClustersView && config.clusters.length > 0;

  // Find skills not assigned to any cluster
  const assignedSkillSet = new Set(config.clusters.flatMap(c => c.skills.map(s => s.toLowerCase())));
  const unclusteredSkills = config.skills.filter(s => !assignedSkillSet.has(s.name.toLowerCase()));
  const normalizeSkillName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

  const toggleCluster = (id: string) => {
    setCollapsedClusters(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
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

  const addSkill = () => {
    const trimmed = newSkillName.trim().replace(/\s+/g, ' ');
    if (!trimmed) {
      setAddSkillError('Enter a skill name');
      return;
    }

    const normalized = normalizeSkillName(trimmed);
    const exists = config.skills.some(skill => normalizeSkillName(skill.name) === normalized);
    if (exists) {
      setAddSkillError('This skill already exists');
      toast.error('Duplicate skills are not allowed');
      return;
    }

    onChange({
      skills: [...config.skills, { name: trimmed, comment: '', type: 'Skill' }],
    });
    setNewSkillName('');
    setAddSkillError('');
  };

  const SKILL_TYPE_COLORS: Record<SkillType, string> = {
    'Skill': 'bg-slate-100 text-gray-700 border-gray-200',
    'Command': 'bg-brand-blue/10 text-brand-blue border-brand-blue/20',
  };

  const renderSkillTag = (skill: SkillEntry) => {
    const fromJd = jdSet.has(skill.name.toLowerCase());
    const skillType = skill.type || 'Skill';
    return (
      <div key={skill.name} className="group">
        <div className="flex items-center gap-2">
          <span className={`flex-1 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border ${
            fromJd ? color.tag : 'bg-green-50 text-green-700 border-green-200'
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
          </select>
          {/* Flexible mode: move skill to the other category */}
          {mode === 'flexible' && onMoveSkill && !isLocked && (
            <button
              title={category === 'mth' ? 'Move to Nice-to-Have' : 'Move to Must-Have'}
              onClick={() => onMoveSkill(skill.name)}
              className="p-1 text-gray-300 hover:text-brand-blue transition-colors opacity-0 group-hover:opacity-100"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
            </button>
          )}
          {/* Hide delete when locked in flexible mode */}
          {!(mode === 'flexible' && isLocked) && (
            <button
              onClick={() => setSkillToDelete(skill.name)}
              className="p-1 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
             aria-label="Close">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {commentOpen === skill.name && (
          <div className="mt-1 ml-0.5 flex items-center gap-1.5">
            <input
              autoFocus
              value={skill.comment}
              onChange={e => updateComment(skill.name, e.target.value)}
              placeholder="Add interviewer note for this skill (not shown to candidate)…"
              className="flex-1 px-3 py-1.5 text-xs border border-brand-orange/30 rounded-lg bg-brand-orange/5 focus:outline-none focus:ring-2 focus:ring-brand-orange/40 placeholder-brand-orange/50"
            />
            <button
              onClick={() => { updateComment(skill.name, ''); setCommentOpen(null); }}
              aria-label="Clear & close" title="Clear & close"
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
    <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br ${
            category === 'mth' ? 'from-brand-blue/10 to-brand-cyan/10 ring-1 ring-brand-blue/15' : 'from-brand-cyan/10 to-brand-teal/10 ring-1 ring-brand-cyan/15'
          }`}>
            <Brain className={`w-5 h-5 ${color.accent}`} />
          </div>
          <span className="font-semibold text-gray-900 text-sm tracking-tight">{title}</span>
          {mode === 'fixed' && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-brand-blue/10 text-brand-blue border border-brand-blue/20">
              {questionCount} questions
            </span>
          )}
          {mode === 'flexible' && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-brand-cyan/10 text-brand-cyan border border-brand-cyan/20">
              ~{flexibleMinutes} min
            </span>
          )}
        </div>
        {mode === 'flexible' && (
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500">Weight</label>
            <div className="flex items-center">
              <input
                type="number"
                min={10}
                max={100}
                value={config.percentage}
                onChange={e => {
                  const raw = e.target.value;
                  if (raw === '') return;
                  const v = Math.min(100, parseInt(raw));
                  if (!isNaN(v) && v >= 0) {
                    setWeightError(v < 10);
                    onChange({ percentage: v });
                  }
                }}
                onBlur={() => { if (config.percentage < 10) setWeightError(true); }}
                className={`w-14 text-center text-sm font-semibold border rounded-l-md px-1 py-0.5 focus:outline-none focus:ring-2 ${
                  weightError ? 'border-red-400 focus:ring-red-400' : 'border-gray-200 focus:ring-brand-blue/40 focus:border-brand-blue'
                }`}
              />
              <span className={`px-2 py-0.5 text-sm border border-l-0 rounded-r-md bg-slate-50 ${
                weightError ? 'border-red-400 text-red-600' : 'border-gray-200 text-gray-600'
              }`}>%</span>
            </div>
            {weightError && <span className="text-[11px] text-red-500 ml-1">Min 10%</span>}
          </div>
        )}
      </div>

      <div className="p-4 space-y-4">

        {/* Inline warning when all entries are Command — the
            interview needs at least one type "Skill" to assess as a competency. */}
        {config.skills.length > 0 && !config.skills.some(s => (s.type ?? 'Skill') === 'Skill') && (
          <div className="flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">
              Add at least one entry of type <strong>Skill</strong> here.
              All current entries are Commands, which can&apos;t be assessed as a standalone competency.
            </p>
          </div>
        )}

        {/* Flexible mode: locked notice replaces the add-skill input */}
        {mode === 'flexible' && isLocked ? (
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-gradient-to-r from-brand-orange/5 via-white to-brand-orange/5 border border-brand-orange/20 ring-1 ring-brand-orange/10 rounded-lg shadow-sm shadow-brand-orange/5">
            <div className="flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-brand-orange flex-shrink-0" />
              <span className="text-xs text-brand-orange-deep">Skills locked after cluster generation.</span>
            </div>
            {onResetClusters && (
              <button
                type="button"
                onClick={onResetClusters}
                className="text-xs font-medium text-brand-orange-deep hover:text-brand-orange underline whitespace-nowrap"
              >
                Reset clusters to edit
              </button>
            )}
          </div>
        ) : (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Add Skill</span>
            <span className="text-xs text-gray-400">Free text only</span>
          </div>
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <input
                value={newSkillName}
                onChange={(e) => {
                  setNewSkillName(e.target.value);
                  if (addSkillError) setAddSkillError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addSkill();
                  }
                }}
                placeholder={category === 'mth' ? 'Add a must-have skill' : 'Add a nice-to-have skill'}
                className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 ${
                  addSkillError ? 'border-red-300 focus:ring-red-400' : 'border-gray-200 focus:ring-brand-blue/40 focus:border-brand-blue'
                }`}
              />
              {addSkillError && (
                <p className="mt-1 text-[11px] text-red-500">{addSkillError}</p>
              )}
            </div>
            <button
              type="button"
              onClick={addSkill}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-brand-blue hover:bg-brand-blue-2 rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>
        </div>
        )}

        {/* ── Clustered view: skills grouped by cluster topic ── */}
        {hasClusters && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-brand-blue" />
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Skill Clusters</span>
              </div>
              <span className="text-xs text-gray-400">
                {config.clusters.length} cluster{config.clusters.length !== 1 ? 's' : ''} · {config.skills.length} skill{config.skills.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="space-y-2.5">
              {config.clusters
                .slice()
                .sort((a, b) => b.priority - a.priority || (a.name ?? '').localeCompare(b.name ?? ''))
                .map(cluster => {
                  const isCollapsed = collapsedClusters.has(cluster.id);
                  const clusterSkills = config.skills.filter(s =>
                    cluster.skills.some(cs => cs.toLowerCase() === s.name.toLowerCase())
                  );

                  return (
                    <div key={cluster.id} className="border border-gray-100 rounded-lg overflow-hidden ring-1 ring-black/[0.02]">
                      {/* Cluster header */}
                      <button
                        onClick={() => toggleCluster(cluster.id)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 bg-slate-50 hover:bg-brand-blue/5 transition-colors text-left"
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
                <div className="border border-dashed border-brand-orange/40 rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-brand-orange/5">
                    <AlertCircle className="w-3.5 h-3.5 text-brand-orange flex-shrink-0" />
                    <span className="flex-1 text-sm font-medium text-brand-orange-deep">Unassigned Skills</span>
                    <span className="text-[11px] text-brand-orange">{unclusteredSkills.length} skill{unclusteredSkills.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="px-3 py-2.5 space-y-1.5 border-t border-brand-orange/20">
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
  mode: InterviewMode;
  enabled: boolean;
  questionCount: number;
  flexibleMinutes: number;
  percentage: number;
  onToggle: () => void;
  onPctChange: (v: number) => void;
  bankQuestions: HRBankQuestion[];
  selectedIds: string[];
  selectedStages: Record<string, HRQuestionStage>;
  onSelectedChange: (ids: string[]) => void;
  onSelectedStagesChange: (stages: Record<string, HRQuestionStage>) => void;
  onBankAdd: (q: HRBankQuestion) => void;
}

function HRSection({
  mode,
  enabled,
  questionCount,
  flexibleMinutes,
  percentage,
  onToggle,
  onPctChange,
  bankQuestions,
  selectedIds,
  selectedStages,
  onSelectedChange,
  onSelectedStagesChange,
  onBankAdd,
}: HRSectionProps) {
  const [hrWeightError, setHrWeightError] = useState(false);
  const [addingQuestion, setAddingQuestion] = useState(false);
  const [newQText, setNewQText] = useState('');
  const [newQType, setNewQType] = useState<'text' | 'yes_no'>('text');
  const [savingQ, setSavingQ] = useState(false);
  const [questionError, setQuestionError] = useState('');

  const FLEX_HR_MIN = 3;
  const effectiveCount = mode === 'fixed' ? questionCount : FLEX_HR_MIN;
  const atLimit = effectiveCount > 0 && selectedIds.length >= effectiveCount;

  useEffect(() => {
    if (!enabled || mode !== 'flexible') {
      setHrWeightError(false);
      return;
    }
    setHrWeightError(percentage < 10);
  }, [enabled, mode, percentage]);

  const setQuestionStage = (id: string, stage: HRQuestionStage) => {
    // Any number of questions may be tagged Opening or Closing — no limit.
    // Opening questions are asked before the technical rounds; Closing ones at
    // the end. (If every question is Opening, the whole HR section runs first.)
    onSelectedStagesChange({
      ...selectedStages,
      [id]: stage,
    });
  };

  const toggleQuestion = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectedChange(selectedIds.filter(x => x !== id));
    } else {
      if (atLimit) return; // hard cap — cannot select more than allowed
      onSelectedChange([...selectedIds, id]);
      onSelectedStagesChange({
        ...selectedStages,
        [id]: selectedStages[id] ?? 'closing',
      });
    }
  };

  const saveNewQuestion = async () => {
    const text = newQText.trim().replace(/\s+/g, ' ');
    if (!text) {
      setQuestionError('Enter a question');
      return;
    }
    setSavingQ(true);
    try {
      const res = await api.post('/hr-question-bank', { question_text: text, answer_type: 'text' });
      const newQ: HRBankQuestion = { id: res.data.id, question_text: res.data.question_text, answer_type: res.data.answer_type, is_default: false };
      onBankAdd(newQ);
      // Auto-select only if within limit
      if (mode !== 'fixed' || selectedIds.length < questionCount) {
        onSelectedChange([...selectedIds, newQ.id]);
        onSelectedStagesChange({
          ...selectedStages,
          [newQ.id]: 'closing',
        });
      }
      setNewQText('');
      setNewQType('text');
      setQuestionError('');
      setAddingQuestion(false);
      toast.success('Question added to bank');
    } catch (error: any) {
      const detail = error?.response?.data?.detail;
      if (typeof detail === 'string') setQuestionError(detail);
      toast.error(detail || 'Failed to add question');
    } finally {
      setSavingQ(false);
    }
  };

  return (
    <div className={`rounded-xl transition-all ${enabled ? 'bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5' : 'border border-gray-100 bg-slate-50 opacity-60'}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" checked={enabled} onChange={onToggle} className="sr-only peer" />
            <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-gradient-to-r peer-checked:from-brand-blue peer-checked:to-brand-blue-2 peer-checked:shadow-sm peer-checked:shadow-brand-blue/25 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
          </label>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-brand-blue/10 ring-1 ring-brand-blue/15">
            <Users className="w-5 h-5 text-brand-blue" />
          </div>
          <span className="font-semibold text-gray-900 text-sm tracking-tight">HR Round</span>
          <span className="px-2 py-0.5 text-[11px] rounded-full bg-brand-blue/10 text-brand-blue border border-brand-blue/20 font-medium">
            Qualitative Only — Non-Scoring
          </span>
          {enabled && mode === 'fixed' && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-brand-blue/10 text-brand-blue border border-brand-blue/20">
              {questionCount} questions
            </span>
          )}
          {enabled && mode === 'flexible' && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-brand-cyan/10 text-brand-cyan border border-brand-cyan/20">
              ~{flexibleMinutes} min
            </span>
          )}
        </div>
        {enabled && mode === 'flexible' && (
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500">Weight</label>
            <div className="flex items-center">
              <input
                type="number"
                min={10}
                max={100}
                value={percentage}
                onChange={e => {
                  const raw = e.target.value;
                  if (raw === '') return;
                  const parsed = parseInt(raw, 10);
                  const v = Math.min(100, parsed);
                  if (!Number.isNaN(v) && v >= 0) {
                    if (v < 10) {
                      setHrWeightError(true);
                      return;
                    }
                    setHrWeightError(false);
                    onPctChange(v);
                  }
                }}
                onBlur={() => { setHrWeightError(enabled && mode === 'flexible' && percentage < 10); }}
                className={`w-14 text-center text-sm font-semibold border rounded-l-md px-1 py-0.5 focus:outline-none focus:ring-2 ${
                  hrWeightError ? 'border-red-400 focus:ring-red-400' : 'border-gray-200 focus:ring-brand-blue/40 focus:border-brand-blue'
                }`}
              />
              <span className={`px-2 py-0.5 text-sm border border-l-0 rounded-r-md bg-slate-50 ${
                hrWeightError ? 'border-red-400 text-red-600' : 'border-gray-200 text-gray-600'
              }`}>%</span>
            </div>
            {hrWeightError && <span className="text-[11px] text-red-500 ml-1">HR round must be at least 10%</span>}
          </div>
        )}
      </div>

      {enabled && (
        <div className="p-4 space-y-3">

          {/* Question bank selection — both modes */}
          <>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="block text-xs font-medium text-gray-600">
                  {mode === 'fixed'
                    ? `Select exactly ${effectiveCount} question${effectiveCount !== 1 ? 's' : ''} for Bina to ask`
                    : `Select at least ${effectiveCount} question${effectiveCount !== 1 ? 's' : ''} for Bina to ask`}
                </span>
                <span className="block text-[11px] text-gray-400">
                  Closing is the default tag. Mark any question as Opening to ask it before the technical rounds; Closing questions are asked at the end.
                </span>
              </div>
              <span className={`text-xs font-semibold ${selectedIds.length >= effectiveCount ? 'text-green-600' : 'text-gray-500'}`}>
                {selectedIds.length} / {effectiveCount} selected
              </span>
            </div>

            {/* Limit reached banner */}
            {atLimit && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200">
                <AlertCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-green-700">
                  {effectiveCount} question{effectiveCount !== 1 ? 's' : ''} selected — limit reached. Deselect a question to choose a different one.
                </p>
              </div>
            )}

            {/* Question list */}
            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {bankQuestions.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">No questions in the bank yet. Add your first question below.</p>
              ) : (
                bankQuestions.map(q => {
                  const isSelected = selectedIds.includes(q.id);
                  const isDisabled = atLimit && !isSelected;
                  const selectedStage = selectedStages[q.id] ?? 'closing';
                  return (
                  <label
                    key={q.id}
                    className={`flex items-start gap-2.5 p-2.5 rounded-lg border transition-colors ${
                      isSelected
                        ? 'border-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue/20 cursor-pointer'
                        : isDisabled
                          ? 'border-gray-100 bg-slate-50 opacity-40 cursor-not-allowed'
                          : 'border-gray-100 hover:border-brand-blue/30 hover:bg-brand-blue/5 cursor-pointer'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isDisabled}
                      onChange={() => toggleQuestion(q.id)}
                      className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-brand-blue focus:ring-brand-blue/40 flex-shrink-0 disabled:cursor-not-allowed"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-800 leading-relaxed">{q.question_text}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Ask As</span>
                        <div className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white p-1">
                          <button
                            type="button"
                            aria-pressed={selectedStage === 'opening'}
                            onClick={e => {
                              e.preventDefault();
                              e.stopPropagation();
                              setQuestionStage(q.id, 'opening');
                            }}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                              selectedStage === 'opening'
                                ? 'bg-green-500 text-white shadow-sm'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            Opening
                          </button>
                          <button
                            type="button"
                            aria-pressed={selectedStage === 'closing'}
                            onClick={e => {
                              e.preventDefault();
                              e.stopPropagation();
                              setQuestionStage(q.id, 'closing');
                            }}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                              selectedStage === 'closing'
                                ? 'bg-green-500 text-white shadow-sm'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            Closing
                          </button>
                        </div>
                        {!isSelected && (
                          <span className="text-[10px] text-gray-400">Select the question to include it in the interview.</span>
                        )}
                      </div>
                    </div>
                  </label>
                );})
              )}
            </div>
          </>

          {/* Add Question — available in both modes, persists to HR Question Bank */}
          {addingQuestion ? (
            <div className="border border-gray-100 rounded-lg p-3 space-y-2 bg-slate-50 ring-1 ring-black/[0.02]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-700">Add Question To HR Question Bank</span>
                <span className="text-[11px] text-gray-400">Saved to database</span>
              </div>
              <textarea
                autoFocus
                rows={2}
                value={newQText}
                onChange={e => {
                  setNewQText(e.target.value);
                  if (questionError) setQuestionError('');
                }}
                placeholder="Enter question text…"
                className={`w-full text-xs border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 resize-none bg-white ${
                  questionError ? 'border-red-300 focus:ring-red-400' : 'border-gray-200 focus:ring-brand-blue/40 focus:border-brand-blue'
                }`}
              />
              {questionError && (
                <p className="text-[11px] text-red-500">{questionError}</p>
              )}
              <div className="flex items-center gap-2">
                <div className="flex-1" />
                <button
                  onClick={() => {
                    setAddingQuestion(false);
                    setNewQText('');
                    setNewQType('text');
                    setQuestionError('');
                  }}
                  className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
                >
                  Cancel
                </button>
                <button
                  onClick={saveNewQuestion}
                  disabled={savingQ || !newQText.trim()}
                  className="flex items-center gap-1 text-xs bg-brand-blue hover:bg-brand-blue-2 text-white px-3 py-1.5 rounded-md shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingQ ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  Save
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddingQuestion(true)}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-brand-blue border border-dashed border-gray-300 rounded-lg px-3 py-2 w-full hover:border-brand-blue/40 hover:bg-brand-blue/5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Question
            </button>
          )}

          {/* Info */}
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-brand-orange/5 via-white to-brand-orange/5 border border-brand-orange/20 ring-1 ring-brand-orange/10 shadow-sm shadow-brand-orange/5">
            <Info className="w-3.5 h-3.5 text-brand-orange flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-brand-orange-deep">
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
  const configId = searchParams.get('config_id'); // set when editing an existing config (any status)
  // Set when the flow was entered from a JD's Job Details page. Keeps the
  // breadcrumb anchored to that job instead of resetting to the AI Interviews
  // trail, and must be carried onto every later step in the flow.
  const fromJobDetails = searchParams.get('from') === 'job-details';

  const [selectedJd, setSelectedJd] = useState<PublishedJD | null>(null);
  const [loadingJd, setLoadingJd] = useState(true);
  // Set when loadJD decides to navigate elsewhere, so the loader stays on screen
  // through the handoff instead of flashing an empty page.
  const [redirecting, setRedirecting] = useState(false);
  const existingDraftIdRef = useRef<string | null>(null); // track draft id for auto-save updates
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedSiRef = useRef<Record<string, any>>({}); // parsed special_instructions snapshot from last load
  // Original rounds_config skill arrays from the saved draft. Captured at load
  // time so auto-save can preserve the AI-expanded skill list when the
  // recruiter's main_skills are unchanged. Without this, rebuilding rounds
  // from mth.skills (= 4 main only) would wipe the 12 expansion sub-skills.
  const loadedRoundsRef = useRef<{
    mthJd?: string[]; mthCustom?: string[];
    nthJd?: string[]; nthCustom?: string[];
  }>({});

  /* Interview mode */
  const [mode, setMode] = useState<InterviewMode>('fixed');
  /* Buffer time toggle (flexible mode only): adds 5 min to 30 min base */
  const [bufferEnabled, setBufferEnabled] = useState(false);
  /* Per-question time limit (timed mode only), in seconds */
  const [perQuestionSeconds, setPerQuestionSeconds] = useState<number>(120);
  /* Speech-to-Text model used to transcribe the candidate (both modes) */
  const [sttModel, setSttModel] = useState<string>(DEFAULT_STT_MODEL);

  /* Category configs */
  const [mth, setMth] = useState<CategoryConfig>({
    skills: [], clusters: [], percentage: DEFAULT_PCT.mth, enabled: true,
  });
  const [nth, setNth] = useState<CategoryConfig>({
    skills: [], clusters: [], percentage: DEFAULT_PCT.nth, enabled: false,
  });
  const [hrPct, setHrPct] = useState<number>(DEFAULT_PCT.hr);
  const [hrEnabled, setHrEnabled] = useState(true);
  const [hrBankQuestions, setHrBankQuestions] = useState<HRBankQuestion[]>([]);
  const [hrSelectedIds, setHrSelectedIds] = useState<string[]>([]);
  const [hrQuestionStages, setHrQuestionStages] = useState<Record<string, HRQuestionStage>>({});

  /* Other settings */
  const [recordingEnabled, setRecordingEnabled] = useState(true);
  const [environmentVerificationEnabled, setEnvironmentVerificationEnabled] = useState(false);
  const [availableLanguages, setAvailableLanguages] = useState<string[]>(['English']);
  const [languageInput, setLanguageInput] = useState('');

  /* Introduction video (optional) */
  const [introVideoFile, setIntroVideoFile] = useState<File | null>(null);
  const [introVideoUrl, setIntroVideoUrl] = useState<string>('');
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoMode, setVideoMode] = useState<'upload' | 'record'>('upload');
  const [videoDurationError, setVideoDurationError] = useState<string>('');
  const [showVideoPreview, setShowVideoPreview] = useState(false);
  const [videoPreviewSrc, setVideoPreviewSrc] = useState<string>('');

  /* Recording state */
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedPreviewUrl, setRecordedPreviewUrl] = useState<string>('');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startCamera = useCallback(async () => {
    setCameraError('');
    setCameraReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
      }
      setCameraReady(true);
    } catch {
      setCameraError('Unable to access camera. Please allow camera permissions.');
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoPreviewRef.current) videoPreviewRef.current.srcObject = null;
    setCameraReady(false);
  }, []);

  const stopRecordingAndSave = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    recordedChunksRef.current = [];
    setRecordingSeconds(0);
    setRecordedPreviewUrl('');

    const mr = new MediaRecorder(streamRef.current, { mimeType: 'video/webm' });
    mediaRecorderRef.current = mr;

    mr.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };

    mr.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
      const file = new File([blob], `intro-recording-${Date.now()}.webm`, { type: 'video/webm' });
      const previewUrl = URL.createObjectURL(blob);
      setRecordedPreviewUrl(previewUrl);
      stopCamera();
      // Auto-upload the recorded file (skip duration check — timer already enforces ≤60s)
      handleVideoUpload(file, true);
    };

    mr.start(100);
    setIsRecording(true);

    // Timer: count up and auto-stop at 60s
    let seconds = 0;
    timerRef.current = setInterval(() => {
      seconds += 1;
      setRecordingSeconds(seconds);
      if (seconds >= 60) {
        stopRecordingAndSave();
      }
    }, 1000);
  }, [stopCamera, stopRecordingAndSave]);

  // Cleanup camera on unmount or mode change
  useEffect(() => {
    return () => {
      stopCamera();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [stopCamera]);

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

        // Load JD; if editing a specific config, fetch it directly instead of
        // searching drafts. The live-config guard rides along in the same
        // Promise.all so it costs no extra round trip on the common path.
        const [jdResult, specificConfig, liveConfig] = await Promise.all([
          aiInterviewService.getPublishedJDs(),
          configId ? aiInterviewService.get(configId).catch(() => null) : Promise.resolve(null),
          // A failed lookup must not block configuring — fall through as "no
          // blocker" rather than stranding the recruiter on a transient error.
          configId ? Promise.resolve(null) : aiInterviewService.findLiveConfigForJd(jdId).catch(() => null),
        ]);

        const jd = jdResult.items.find(j => j.id === jdId);
        if (!jd) {
          setRedirecting(true);
          toast.error('Job description not found');
          router.replace('/recruitment/ai-interviews/jd-selection');
          return;
        }

        // Entering fresh (no config_id): a JD that already has a live interview
        // must not get a second one configured. This guard used to live on the
        // AI Interviews list page, which every "Create" click had to route
        // through just to run it. Doing it here keeps the click on a single
        // navigation and covers every entry point into this page.
        if (liveConfig) {
          setRedirecting(true);
          toast.info('An AI interview already exists for this job.');
          // Carry the origin through. Without it the details page falls back to
          // its own trail and the breadcrumb resets to
          // Dashboard › AI Interviews › {JD} — losing the job the recruiter
          // started from, even though they never left that job's flow.
          router.replace(
            `/recruitment/ai-interviews/${liveConfig.id}${fromJobDetails ? '?from=job-details' : ''}`
          );
          return;
        }

        setSelectedJd(jd);

        // Look for an existing config: specific config_id takes priority, then search drafts by jd_id
        let existingDraft: AIInterviewResponse | null = specificConfig;
        if (!existingDraft) {
          const draftResult = await aiInterviewService.listConfigs({ status: 'draft', page_size: 50, compact: true }).catch(() => null);
          existingDraft = draftResult?.items?.find(
            (c: AIInterviewResponse) => c.jd_id === jdId && c.status === 'draft'
          ) ?? null;
        }

        // Mode + SI-backed settings restore on ANY existing draft (even if
        // rounds_config is temporarily empty) — the Interview Mode toggle
        // must reflect what the user picked, not silently default to 'fixed'
        // when the user navigates back from the Clusters page.
        if (existingDraft) {
          existingDraftIdRef.current = existingDraft.id;
          setMode(modeFromConfig(
            (existingDraft as any).special_instructions,
            existingDraft.duration_minutes ?? 30,
          ));
          if ((existingDraft as any).available_languages?.length) {
            setAvailableLanguages((existingDraft as any).available_languages);
          }
          if ((existingDraft as any).introduction_video_url) {
            setIntroVideoUrl((existingDraft as any).introduction_video_url);
          }
        }

        if (existingDraft?.rounds_config?.length) {
          // Restore state from saved draft
          const mthRound = existingDraft.rounds_config.find((r: AIInterviewRoundConfig) => r.type === 'must_have_skills');
          const nthRound = existingDraft.rounds_config.find((r: AIInterviewRoundConfig) => r.type === 'nice_to_have_skills');
          const hrRound  = existingDraft.rounds_config.find((r: AIInterviewRoundConfig) => r.type === 'hr');

          // Parse special_instructions UPFRONT — needed to prefer recruiter-typed
          // main_skills over the (post-expansion) rounds_config skill list. The
          // Clusters page expands skills 4→16 and writes them into rounds_config;
          // the Configure page must keep showing only the original 4.
          let parsedSi: Record<string, any> = {};
          try {
            if ((existingDraft as any).special_instructions) {
              parsedSi = JSON.parse((existingDraft as any).special_instructions);
              loadedSiRef.current = parsedSi;
            }
          } catch {
            // Malformed special_instructions — non-critical, treat as empty
          }
          // Resolve which list to display as "main" (recruiter-typed) skills:
          //   1. Use saved si.mth_main_skills when present and not obviously polluted.
          //      Pollution heuristic: saved length equals the full expanded
          //      rounds_config skill count and that count is ≥1.5× the JD's
          //      original must_have count — this happens when the captured list
          //      was actually the post-expansion list from a legacy draft.
          //   2. Else when clusters exist (= expansion has happened), use the
          //      round's jd_skills as a safe legacy fallback (these are the
          //      original JD skills, never expansion sub-skills).
          //   3. Else (no expansion yet) fall through and show all rounds_config
          //      skills — they're all recruiter-typed pre-expansion.
          const totalMthRoundsSkills = (mthRound?.jd_skills?.length ?? 0) + (mthRound?.custom_skills?.length ?? 0);
          const totalNthRoundsSkills = (nthRound?.jd_skills?.length ?? 0) + (nthRound?.custom_skills?.length ?? 0);
          const jdMthCount = jd.must_have_skills?.length ?? 0;
          const jdNthCount = jd.nice_to_have_skills?.length ?? 0;
          const isPolluted = (saved?: string[], total = 0, jdCount = 0) =>
            Array.isArray(saved) && saved.length > 0 && saved.length === total && total > Math.max(2, Math.ceil(jdCount * 1.5));
          const mthMainPolluted = isPolluted(parsedSi.mth_main_skills, totalMthRoundsSkills, jdMthCount);
          const nthMainPolluted = isPolluted(parsedSi.nth_main_skills, totalNthRoundsSkills, jdNthCount);

          const mthMainSkills: string[] | null = (() => {
            const saved = parsedSi.mth_main_skills;
            if (Array.isArray(saved) && saved.length > 0 && !mthMainPolluted) return saved;
            if ((parsedSi.mth_clusters?.length ?? 0) > 0) return mthRound?.jd_skills ?? [];
            return null;
          })();
          const nthMainSkills: string[] | null = (() => {
            const saved = parsedSi.nth_main_skills;
            if (Array.isArray(saved) && saved.length > 0 && !nthMainPolluted) return saved;
            if ((parsedSi.nth_clusters?.length ?? 0) > 0) return nthRound?.jd_skills ?? [];
            return null;
          })();

          // Seed loadedSiRef with the resolved main_skills (covers both the
          // pollution-scrubbed case and the legacy fallback to jd_skills).
          // buildRounds' mainUnchanged check reads from loadedSiRef and must
          // see the resolved value, otherwise auto-save will rebuild rounds
          // from mth.skills (= main subset) and silently drop the expansion
          // sub-skills from the saved rounds_config.
          if (mthMainSkills) loadedSiRef.current.mth_main_skills = mthMainSkills;
          if (nthMainSkills) loadedSiRef.current.nth_main_skills = nthMainSkills;

          // Re-baseline mth_skills_snapshot when pollution scrub or legacy
          // fallback changed the displayed skill list. Otherwise the snapshot
          // (taken when the previous, larger set was visible) doesn't match
          // the new displayed set, mthSkillsChanged trips on every Continue
          // click, and the user gets a regeneration even with no edits.
          const snapshotMatches = (saved?: string[], main?: string[]): boolean => {
            if (!Array.isArray(saved) || !Array.isArray(main)) return false;
            if (saved.length !== main.length) return false;
            const setMain = new Set(main.map(s => s.toLowerCase().trim()));
            for (const s of saved) if (!setMain.has(s.toLowerCase().trim())) return false;
            return true;
          };
          if (mthMainSkills && !snapshotMatches(parsedSi.mth_skills_snapshot, mthMainSkills)) {
            loadedSiRef.current.mth_skills_snapshot = mthMainSkills;
          }
          if (nthMainSkills && !snapshotMatches(parsedSi.nth_skills_snapshot, nthMainSkills)) {
            loadedSiRef.current.nth_skills_snapshot = nthMainSkills;
          }

          const toSkillEntries = (skills: string[] = []) =>
            skills.map(s => ({ name: s, comment: '', type: 'Skill' as SkillType }));

          // Capture original rounds_config skills so auto-save can preserve
          // the AI-expanded list when main_skills haven't changed.
          loadedRoundsRef.current = {
            mthJd: mthRound?.jd_skills,
            mthCustom: mthRound?.custom_skills,
            nthJd: nthRound?.jd_skills,
            nthCustom: nthRound?.custom_skills,
          };

          if (mthRound) {
            // Prefer recruiter-typed main_skills when present — hides AI expansion sub-skills.
            const draftSkills = mthMainSkills ?? [...(mthRound.jd_skills || []), ...(mthRound.custom_skills || [])];
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
            const draftSkills = nthMainSkills ?? [...(nthRound.jd_skills || []), ...(nthRound.custom_skills || [])];
            setNth({
              skills: draftSkills.length > 0
                ? toSkillEntries(draftSkills)
                : (jd.nice_to_have_skills?.map(s => ({ name: s, comment: '', type: 'Skill' as SkillType })) ?? []),
              clusters: [],
              percentage: nthRound.percentage ?? DEFAULT_PCT.nth,
              enabled: nthRound.enabled !== false,
            });
          } else {
            // No NHS round in rounds_config — it was DISABLED at save time (the
            // round is only pushed when enabled). Still restore the recruiter's
            // typed skills from the persisted nth_main_skills so a manually-added
            // (non-JD) NHS skill survives disable → navigate → re-enable. Fall
            // back to JD nice-to-have skills only when no saved list exists.
            setNth(prev => ({
              ...prev,
              enabled: false,
              skills: (nthMainSkills && nthMainSkills.length > 0)
                ? toSkillEntries(nthMainSkills)
                : (jd.nice_to_have_skills?.map(s => ({ name: s, comment: '', type: 'Skill' as SkillType })) ?? []),
            }));
          }

          if (hrRound) {
            setHrEnabled(true);
            setHrPct(hrRound.percentage ?? DEFAULT_PCT.hr);
            if (hrRound.hr_questions?.length) {
              setHrSelectedIds(hrRound.hr_questions.map(q => q.id));
              setHrBankQuestions(prev => mergeHRBankQuestions(
                prev,
                hrRound.hr_questions.map(q => ({
                  id: q.id,
                  question_text: q.question_text,
                  answer_type: q.answer_type as 'text' | 'yes_no',
                  is_default: false,
                })),
              ));
              setHrQuestionStages(
                Object.fromEntries(
                  hrRound.hr_questions.map(q => [
                    q.id,
                    q.stage === 'opening' ? 'opening' : 'closing',
                  ]),
                ),
              );
            } else {
              setHrSelectedIds([]);
              setHrQuestionStages({});
            }
          } else {
            setHrEnabled(false);
            setHrSelectedIds([]);
            setHrQuestionStages({});
          }

          // Apply remaining special_instructions fields (clusters, comments, types, etc.)
          {
            const parsed = parsedSi;
            const mthComments: Record<string, string> = parsed.skill_comments?.mth || {};
            const nthComments: Record<string, string> = parsed.skill_comments?.nth || {};
            const mthTypes: Record<string, string> = parsed.skill_types?.mth || {};
            const nthTypes: Record<string, string> = parsed.skill_types?.nth || {};

            // Restore per-question time limit
            if (parsed.per_question_seconds) {
              setPerQuestionSeconds(Number(parsed.per_question_seconds));
            }

            // Restore Speech-to-Text model selection
            if (parsed.stt_model) {
              setSttModel(String(parsed.stt_model));
            }

            // Restore buffer time toggle
            if (parsed.buffer_enabled !== undefined) {
              setBufferEnabled(Boolean(parsed.buffer_enabled));
            }

            // Restore clusters (only restore NHS clusters if NHS round is present/enabled)
            if (parsed.mth_clusters?.length) {
              setMth(prev => ({ ...prev, clusters: parsed.mth_clusters }));
            }
            if (parsed.nth_clusters?.length && nthRound) {
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

        } else if (existingDraft) {
          // Config exists but has no rounds_config yet — populate skills from
          // JD defaults. Mode + SI-backed settings were already restored above.
          setMth(prev => ({
            ...prev,
            skills: jd.must_have_skills?.map(s => ({ name: s, comment: '', type: 'Skill' as SkillType })) ?? [],
          }));
          setNth(prev => ({
            ...prev,
            enabled: (jd.nice_to_have_skills?.length ?? 0) > 0,
            skills: jd.nice_to_have_skills?.map(s => ({ name: s, comment: '', type: 'Skill' as SkillType })) ?? [],
          }));
        } else {
          // No existing config at all — populate from JD defaults
          setMth(prev => ({
            ...prev,
            skills: jd.must_have_skills?.map(s => ({ name: s, comment: '', type: 'Skill' as SkillType })) ?? [],
          }));
          setNth(prev => ({
            ...prev,
            enabled: (jd.nice_to_have_skills?.length ?? 0) > 0,
            skills: jd.nice_to_have_skills?.map(s => ({ name: s, comment: '', type: 'Skill' as SkillType })) ?? [],
          }));
        }

      } catch {
        setRedirecting(true);
        toast.error('Failed to load job description');
        router.replace('/recruitment/ai-interviews/jd-selection');
      } finally {
        setLoadingJd(false);
      }
    };
    loadJD();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jdId]);

  /* ── Fetch HR question bank on mount ── */
  useEffect(() => {
    api.get('/hr-question-bank').then(res => {
      const data: any[] = res.data || [];
      setHrBankQuestions(prev => mergeHRBankQuestions(prev, data.map(q => ({
        id: q.id,
        question_text: q.question_text,
        answer_type: q.answer_type as 'text' | 'yes_no',
        is_default: q.is_default ?? false,
      }))));
    }).catch(() => {/* non-critical */});
  }, []);

  /* ── Navigation guards ── */
  useEffect(() => {
    if (!selectedJd) return;
    window.history.pushState(null, '', window.location.href);
    const handlePopState = () => {
      if (isNavigatingRef.current) return;
      window.history.pushState(null, '', window.location.href);
      setPendingNavigation('__back__');
      setShowUnsavedDialog(true);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
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
          // Flexible mode has a real 30-min budget (35 with buffer). Store
          // the real value, not the old 0-sentinel. Mode is determined by
          // special_instructions.interview_mode.
          duration_minutes: mode === 'flexible' ? 30 : totalFixed,
          rounds_config: rounds,
          recording_enabled: recordingEnabled,
          environment_verification_enabled: environmentVerificationEnabled,
          available_languages: availableLanguages,
          title: `${selectedJd.title} - AI Interview`,
          save_as_draft: true,
          special_instructions: buildClusterJson(),
          introduction_video_url: introVideoUrl || null,
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
  }, [mth, nth, hrPct, hrEnabled, hrSelectedIds, hrQuestionStages, mode, sttModel, recordingEnabled, environmentVerificationEnabled, availableLanguages, introVideoUrl, selectedJd, loadingJd]);

  /* ── Derived values ── */
  const nthAvailable = nth.skills.length > 0 || nth.enabled;

  /** Flexible mode: skills are never locked on the configure page — cluster editing
   *  happens exclusively on the clusters page, so adding/removing skills here must
   *  always be allowed regardless of whether clusters have been generated. */
  const flexSkillsLocked = false;

  /** Flexible mode: clear all clusters so the recruiter can edit skills again */
  const handleResetClusters = () => {
    setMth(prev => ({ ...prev, clusters: [] }));
    setNth(prev => ({ ...prev, clusters: [] }));
  };

  /** Flexible mode: move a skill from MHS → NHS.
   *  If NHS is currently disabled, it is auto-enabled and percentages are redistributed. */
  const moveMthToNth = (skillName: string) => {
    const skill = mth.skills.find(s => s.name === skillName);
    if (!skill) return;

    if (!nth.enabled) {
      // Auto-enable NHS and redistribute scoring weights
      const [newMthPct, newNthPct, newHrPct] = redistributeFlexPct(
        mth.percentage, true, nth.percentage, hrEnabled, hrPct,
      );
      setMth(prev => ({
        ...prev,
        percentage: newMthPct,
        skills: prev.skills.filter(s => s.name !== skillName),
        clusters: prev.clusters.map(c => ({
          ...c,
          skills: c.skills.filter(s => s.toLowerCase() !== skillName.toLowerCase()),
        })),
      }));
      setNth(prev => {
        const alreadyExists = prev.skills.some(s => s.name.toLowerCase() === skillName.toLowerCase());
        return {
          ...prev,
          enabled: true,
          percentage: newNthPct,
          skills: alreadyExists ? prev.skills : [...prev.skills, skill],
        };
      });
      setHrPct(newHrPct);
      toast.success(`"${skillName}" moved to Nice-to-Have. NHS section enabled.`);
    } else {
      setMth(prev => ({
        ...prev,
        skills: prev.skills.filter(s => s.name !== skillName),
        clusters: prev.clusters.map(c => ({
          ...c,
          skills: c.skills.filter(s => s.toLowerCase() !== skillName.toLowerCase()),
        })),
      }));
      setNth(prev => {
        const alreadyExists = prev.skills.some(s => s.name.toLowerCase() === skillName.toLowerCase());
        return alreadyExists ? prev : { ...prev, skills: [...prev.skills, skill] };
      });
    }
  };

  /** Flexible mode: move a skill from NHS → MHS */
  const moveNthToMth = (skillName: string) => {
    const skill = nth.skills.find(s => s.name === skillName);
    if (!skill) return;
    setNth(prev => ({
      ...prev,
      skills: prev.skills.filter(s => s.name !== skillName),
      clusters: prev.clusters.map(c => ({
        ...c,
        skills: c.skills.filter(s => s.toLowerCase() !== skillName.toLowerCase()),
      })),
    }));
    setMth(prev => ({
      ...prev,
      skills: [...prev.skills, skill],
    }));
  };

  const timedAllocation = getTimedModeAllocation(nth.enabled, hrEnabled);
  const timedPercentages = getTimedModePercentages(nth.enabled, hrEnabled, hrPct);
  const fixedMthMin = timedAllocation.mthMinutes;
  const fixedNthMin = timedAllocation.nthMinutes;
  const fixedHrMin  = timedAllocation.hrMinutes;
  const totalFixed  = fixedMthMin + fixedNthMin + fixedHrMin;

  // Flexible mode enforces fixed cluster limits (MHS ≤ 3, NHS ≤ 2) regardless of which
  // sections are enabled. Fixed mode uses scenario-based limits from timedAllocation.
  const effectiveMthMax = mode === 'flexible' ? 3 : timedAllocation.mthMaxClusters;
  const effectiveNthMax = mode === 'flexible' ? 2 : timedAllocation.nthMaxClusters;

  const totalPct = mth.percentage + (nth.enabled ? nth.percentage : 0) + (hrEnabled ? hrPct : 0);
  const pctValid = totalPct === 100;
  const hrPctInvalid = mode === 'flexible' && hrEnabled && hrPct < 10;

  // HR question selection validation — must be satisfied before continuing to clusters.
  // Keeps the same rules enforced inside handleContinueToClusters but surfaces them
  // as a disabled-state reason instead of a post-click toast.
  const HR_MIN_QUESTIONS = 3;
  const hrRequiredCount = mode === 'fixed' && hrEnabled ? (timedAllocation.hrQuestions ?? 0) : 0;
  const continueDisabledReason = (() => {
    if (savingDraft) return 'Saving draft…';
    if (mode === 'flexible' && !pctValid) return `Scoring weights must total 100% (currently ${totalPct}%).`;
    if (hrPctInvalid) return 'HR weight must be at least 10% in Flexible mode.';
    if (hrEnabled && hrSelectedIds.length === 0) {
      return 'HR round is enabled — please select HR questions to continue.';
    }
    if (hrEnabled && hrSelectedIds.length < HR_MIN_QUESTIONS) {
      return `Please select at least ${HR_MIN_QUESTIONS} HR questions (${hrSelectedIds.length} selected).`;
    }
    if (mode === 'fixed' && hrEnabled && hrRequiredCount > 0 && hrSelectedIds.length !== hrRequiredCount) {
      return `Please select exactly ${hrRequiredCount} HR question${hrRequiredCount !== 1 ? 's' : ''} (${hrSelectedIds.length} selected).`;
    }
    if (mth.skills.length === 0) {
      return 'At least one Must-Have skill is required before generating clusters.';
    }
    if (!mth.skills.some(s => (s.type ?? 'Skill') === 'Skill')) {
      return 'Must-Have must include at least one entry of type "Skill" (not just Commands).';
    }
    if (nth.enabled && nth.skills.length > 0 && !nth.skills.some(s => (s.type ?? 'Skill') === 'Skill')) {
      return 'Nice-to-Have must include at least one entry of type "Skill" (not just Commands).';
    }
    return '';
  })();
  const canContinueToClusters = !continueDisabledReason;
  const experienceRange =
    selectedJd?.experience_min != null && selectedJd?.experience_max != null
      ? `${selectedJd.experience_min}–${selectedJd.experience_max} yrs`
      : selectedJd?.experience_min != null
      ? `${selectedJd.experience_min}+ yrs`
      : selectedJd?.experience_max != null
      ? `Up to ${selectedJd.experience_max} yrs`
      : '';
  const experienceSummary = [experienceRange, selectedJd?.job_level].filter(Boolean).join(' • ');
  const clusterMaxCountSummary = [
    `Must-to-Have: ${timedAllocation.mthMaxClusters}`,
    ...(nth.enabled ? [`Nice-to-Have: ${timedAllocation.nthMaxClusters}`] : []),
  ].join(' | ');

  // Flexible mode: time split per section based on weight % × 30 min
  const FLEXIBLE_TOTAL_MIN = 30;
  const flexMinuteAllocation = pctValid
    ? allocateFlexibleMinutes(FLEXIBLE_TOTAL_MIN, [
        { key: 'mth', enabled: true, percentage: mth.percentage },
        { key: 'nth', enabled: nth.enabled, percentage: nth.percentage },
        { key: 'hr', enabled: hrEnabled, percentage: hrPct },
      ])
    : { mth: 0, nth: 0, hr: 0 };
  const flexMthMin = flexMinuteAllocation.mth;
  const flexNthMin = flexMinuteAllocation.nth;
  const flexHrMin  = flexMinuteAllocation.hr;

  // Static question distribution based on enabled sections (timed mode: total=15)
  const timedQDist = {
    mth: timedAllocation.mthQuestions,
    nth: timedAllocation.nthQuestions,
    hr: timedAllocation.hrQuestions,
  };

  /* ── Video handlers ── */
  const handleVideoUpload = async (file: File, skipDurationCheck = false) => {
    setVideoDurationError('');
    // Validate video duration (max 1 minute) — skip for recorded videos (timer already enforces limit)
    if (!skipDurationCheck) {
      const isValid = await new Promise<boolean>((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        // Timeout fallback: if metadata never loads (some formats), allow upload after 5s
        const timeout = setTimeout(() => {
          URL.revokeObjectURL(video.src);
          resolve(true);
        }, 5000);
        video.onloadedmetadata = () => {
          clearTimeout(timeout);
          URL.revokeObjectURL(video.src);
          if (isFinite(video.duration) && Math.ceil(video.duration) > 60) {
            setVideoDurationError('Video must be 1 minute or less');
            toast.error('Video must be 1 minute or less');
            resolve(false);
          } else {
            resolve(true);
          }
        };
        video.onerror = () => {
          clearTimeout(timeout);
          URL.revokeObjectURL(video.src);
          resolve(true); // Allow upload if duration can't be read
        };
        video.src = URL.createObjectURL(file);
      });
      if (!isValid) return;
    }

    setIntroVideoFile(file);
    setVideoPreviewSrc(URL.createObjectURL(file));
    setUploadingVideo(true);
    try {
      const result = await aiInterviewService.uploadIntroVideo(file);
      setIntroVideoUrl(result.url || result.file_url || '');
      toast.success('Video uploaded successfully');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to upload video';
      toast.error(msg);
      setIntroVideoFile(null);
      setVideoPreviewSrc('');
    } finally {
      setUploadingVideo(false);
    }
  };

  const handleRemoveVideo = () => {
    if (videoPreviewSrc) URL.revokeObjectURL(videoPreviewSrc);
    setVideoPreviewSrc('');
    setIntroVideoFile(null);
    setIntroVideoUrl('');
  };

  /* ── Build rounds config for API ── */
  const buildRounds = (
    isDraft = false,
    overrides?: { mth?: SkillEntry[]; nth?: SkillEntry[] },
  ): AIInterviewRoundConfig[] => {
    const mthSkillsSrc = overrides?.mth ?? mth.skills;
    const nthSkillsSrc = overrides?.nth ?? nth.skills;
    const rounds: AIInterviewRoundConfig[] = [];
    const dur = (cat: 'mth' | 'nth' | 'hr') => {
      if (mode === 'flexible') {
        if (cat === 'mth') return flexMthMin;
        if (cat === 'nth') return flexNthMin;
        return flexHrMin;
      }
      if (cat === 'mth') return fixedMthMin;
      if (cat === 'nth') return fixedNthMin;
      return fixedHrMin;
    };

    // When the recruiter's main_skills haven't changed since the last cluster
    // generation, preserve the original (AI-expanded) jd_skills + custom_skills
    // from the saved rounds_config. This stops auto-save from wiping the
    // expansion sub-skills when Configure is only displaying the main subset.
    const mainUnchanged = (current: SkillEntry[], main: string[] | undefined): boolean => {
      if (!Array.isArray(main) || main.length === 0) return false;
      const currentSet = new Set(current.map(s => s.name.toLowerCase().trim()));
      const mainSet = new Set(main.map(s => s.toLowerCase().trim()));
      if (currentSet.size !== mainSet.size) return false;
      for (const v of currentSet) if (!mainSet.has(v)) return false;
      return true;
    };
    const mthMainUnchanged = mainUnchanged(mthSkillsSrc, loadedSiRef.current.mth_main_skills);
    const nthMainUnchanged = mainUnchanged(nthSkillsSrc, loadedSiRef.current.nth_main_skills);

    // MTH round
    {
      const jdSet = new Set((selectedJd?.must_have_skills || []).map(s => s.toLowerCase()));
      let jdSkills = mthSkillsSrc.filter(s => jdSet.has(s.name.toLowerCase())).map(s => s.name);
      let customSkills = mthSkillsSrc.filter(s => !jdSet.has(s.name.toLowerCase())).map(s => s.name);
      if (mthMainUnchanged) {
        jdSkills = loadedRoundsRef.current.mthJd ?? jdSkills;
        customSkills = loadedRoundsRef.current.mthCustom ?? customSkills;
      }
      // Clusters → topics + topic_weights + topic_time_minutes + topic_skills
      const topics = mth.clusters.map(c => c.name).filter(Boolean);
      const topicWeights: Record<string, number> = {};
      const topicSkills: Record<string, string[]> = {};
      const topicTime = allocateClusterMinutes(mth.clusters, fixedMthMin);
      mth.clusters.forEach(c => {
        if (c.name) {
          topicWeights[c.name] = c.priority * 20;
          if (c.skills?.length) topicSkills[c.name] = c.skills.map((s: any) => typeof s === 'string' ? s : s.name).filter(Boolean);
        }
      });

      rounds.push({
        type: 'must_have_skills',
        percentage: mode === 'fixed' ? timedPercentages.mth : mth.percentage,
        duration_minutes: dur('mth'),
        topics,
        topic_weights: topics.length > 0 ? topicWeights : undefined,
        topic_skills: topics.length > 0 ? topicSkills : undefined,
        topic_time_minutes: topics.length > 0 ? topicTime : undefined,
        enabled: true,
        order: 2,
        jd_skills: jdSkills.length > 0 ? jdSkills : undefined,
        custom_skills: customSkills.length > 0 ? customSkills : undefined,
        ...(mode === 'fixed' ? { planned_questions: timedQDist.mth } : {}),
      });
    }

    // NTH round
    if (nth.enabled) {
      const jdSet = new Set((selectedJd?.nice_to_have_skills || []).map(s => s.toLowerCase()));
      let jdSkills = nthSkillsSrc.filter(s => jdSet.has(s.name.toLowerCase())).map(s => s.name);
      let customSkills = nthSkillsSrc.filter(s => !jdSet.has(s.name.toLowerCase())).map(s => s.name);
      if (nthMainUnchanged) {
        jdSkills = loadedRoundsRef.current.nthJd ?? jdSkills;
        customSkills = loadedRoundsRef.current.nthCustom ?? customSkills;
      }
      const topics = nth.clusters.map(c => c.name).filter(Boolean);
      const topicWeights: Record<string, number> = {};
      const topicSkills: Record<string, string[]> = {};
      const nthTopicTime = allocateClusterMinutes(nth.clusters, fixedNthMin);
      nth.clusters.forEach(c => {
        if (c.name) {
          topicWeights[c.name] = c.priority * 20;
          if (c.skills?.length) topicSkills[c.name] = c.skills.map((s: any) => typeof s === 'string' ? s : s.name).filter(Boolean);
        }
      });

      rounds.push({
        type: 'nice_to_have_skills',
        percentage: mode === 'fixed' ? timedPercentages.nth : nth.percentage,
        duration_minutes: dur('nth'),
        topics,
        topic_weights: topics.length > 0 ? topicWeights : undefined,
        topic_skills: topics.length > 0 ? topicSkills : undefined,
        topic_time_minutes: topics.length > 0 ? nthTopicTime : undefined,
        enabled: true,
        order: 3,
        jd_skills: jdSkills.length > 0 ? jdSkills : undefined,
        custom_skills: customSkills.length > 0 ? customSkills : undefined,
        ...(mode === 'fixed' ? { planned_questions: timedQDist.nth } : {}),
      });
    }

    // HR round — always first (introduction, background, cultural fit)
    if (hrEnabled) {
      // Build selected question objects (in selection order)
      const selectedHrQuestions = hrSelectedIds
        .map(id => hrBankQuestions.find(q => q.id === id))
        .filter(Boolean)
        .map(q => ({
          id: q!.id,
          question_text: q!.question_text,
          answer_type: q!.answer_type,
          stage: hrQuestionStages[q!.id] ?? 'closing',
        }));

      rounds.push({
        type: 'hr',
        percentage: mode === 'fixed' ? timedPercentages.hr : hrPct,
        duration_minutes: dur('hr'),
        topics: ['Behavioural', 'Cultural Fit', 'Situational'],
        enabled: true,
        order: 1,
        ...(selectedHrQuestions.length > 0 ? { hr_questions: selectedHrQuestions } : {}),
        ...(mode === 'fixed' ? { planned_questions: timedQDist.hr } : {}),
      });
    }

    return rounds;
  };

  /* Cluster config as JSON for special_instructions */
  const buildClusterJson = () => JSON.stringify({
    interview_mode: mode,
    per_question_seconds: mode === 'fixed' ? perQuestionSeconds : undefined,
    // Speech-to-Text model the backend uses to transcribe the candidate.
    // Applies to both modes; resolved per-interview in asr_factory.py.
    stt_model: sttModel,
    // Flexible mode: persist JD description so the Clusters page can send it to AI on re-generate
    jd_description: mode === 'flexible' ? (selectedJd?.description ?? '') : undefined,
    buffer_enabled: mode === 'flexible' ? bufferEnabled : undefined,
    mth_clusters: mth.clusters,
    nth_clusters: nth.enabled ? nth.clusters : [], // don't persist NHS clusters when NHS is disabled
    // Preserve skill snapshots (only updated on cluster generation — don't overwrite here)
    ...(loadedSiRef.current.mth_skills_snapshot !== undefined && { mth_skills_snapshot: loadedSiRef.current.mth_skills_snapshot }),
    ...(loadedSiRef.current.nth_skills_snapshot !== undefined && { nth_skills_snapshot: loadedSiRef.current.nth_skills_snapshot }),
    // Extended snapshots — Q values, skill types, NTH/HR enabled flags. Driven
    // by cluster generation; preserved here so they survive Configure's saves.
    ...(loadedSiRef.current.mth_questions_snapshot !== undefined && { mth_questions_snapshot: loadedSiRef.current.mth_questions_snapshot }),
    ...(loadedSiRef.current.nth_questions_snapshot !== undefined && { nth_questions_snapshot: loadedSiRef.current.nth_questions_snapshot }),
    ...(loadedSiRef.current.mth_skill_types_snapshot !== undefined && { mth_skill_types_snapshot: loadedSiRef.current.mth_skill_types_snapshot }),
    ...(loadedSiRef.current.nth_skill_types_snapshot !== undefined && { nth_skill_types_snapshot: loadedSiRef.current.nth_skill_types_snapshot }),
    ...(loadedSiRef.current.nth_enabled_snapshot !== undefined && { nth_enabled_snapshot: loadedSiRef.current.nth_enabled_snapshot }),
    ...(loadedSiRef.current.hr_enabled_snapshot !== undefined && { hr_enabled_snapshot: loadedSiRef.current.hr_enabled_snapshot }),
    // Recruiter-typed "main" skills — the set visible on the Configure page,
    // captured before AI expansion runs. Always save the CURRENT mth/nth.skills
    // because the user may have added/removed skills since the draft was loaded.
    // Reading from loadedSiRef.current here would drop newly added skills when
    // the user navigates back from the Clusters page.
    mth_main_skills: mth.skills.map(s => s.name),
    // ALWAYS persist the CURRENT nth.skills — even when NHS is DISABLED. The
    // toggle only hides/flags the round; it does NOT clear nth.skills, so a
    // manually-added (non-JD) NHS skill still lives in state. Previously, saving
    // while NHS was disabled discarded the current list and re-wrote the stale
    // loaded value — so disabling NHS, navigating to Clusters, coming back, and
    // re-enabling NHS silently DROPPED any hand-typed NHS skill (it isn't in the
    // JD, so the fallback couldn't recover it). Persisting the live list here
    // (mirroring mth_main_skills) preserves manual skills across disable →
    // navigate → re-enable. Harmless while disabled: nth_clusters is still []
    // (line above) and distribution ignores a disabled round.
    nth_main_skills: nth.skills.map(s => s.name),
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
  const saveDraft = async (
    silent = false,
    overrides?: { mth?: SkillEntry[]; nth?: SkillEntry[] },
  ): Promise<boolean> => {
    if (!selectedJd) return false;
    setSavingDraft(true);
    try {
      const payload = {
        position: selectedJd.title,
        jd_id: selectedJd.id,
        duration_minutes: mode === 'flexible' ? 30 : totalFixed,
        rounds_config: buildRounds(true, overrides),
        recording_enabled: recordingEnabled,
        environment_verification_enabled: environmentVerificationEnabled,
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
    if (!ok) return;
    // Started on a JD's Job Details page (including from its draft prompt) —
    // return there rather than to the AI Interviews list, matching the
    // breadcrumb this step already shows.
    router.push(
      fromJobDetails && selectedJd?.id
        ? `/recruitment/job-details?id=${encodeURIComponent(selectedJd.id)}`
        : '/recruitment/ai-interviews'
    );
  };

  const handleContinueToClusters = async () => {
    if (!selectedJd) return;
    if (mode === 'flexible' && !pctValid) return;

    // Validate HR round: must select at least 3 questions in both modes
    if (hrEnabled && hrSelectedIds.length === 0) {
      toast.error('HR round is enabled but no questions are selected. Please select the required HR questions or disable the HR round.');
      return;
    }
    const HR_MIN_QUESTIONS = 3;
    if (hrEnabled && hrSelectedIds.length < HR_MIN_QUESTIONS) {
      toast.error(`Please select at least ${HR_MIN_QUESTIONS} HR questions (${hrSelectedIds.length} selected).`);
      return;
    }
    // Timed mode: also enforce exact count from allocation
    const hrRequiredCount = mode === 'fixed' ? (timedAllocation.hrQuestions ?? 0) : 0;
    if (mode === 'fixed' && hrEnabled && hrRequiredCount > 0 && hrSelectedIds.length !== hrRequiredCount) {
      toast.error(`Please select exactly ${hrRequiredCount} HR question${hrRequiredCount !== 1 ? 's' : ''} (${hrSelectedIds.length} selected).`);
      return;
    }

    // Validate Must-Have: at least one skill required in both modes
    if (mth.skills.length === 0) {
      toast.error('At least one Must-Have skill is required before generating clusters.');
      return;
    }

    // Validate Nice-to-Have: if NTH is enabled, at least one skill must be present
    if (nth.enabled && nth.skills.length === 0) {
      toast.error('Nice-to-Have Skills is enabled but has no skills. Please add at least one skill or disable the Nice-to-Have round.');
      return;
    }

    // Validate skill-type mix: each enabled bucket must contain at least one
    // entry of type "Skill". If everything is marked Command, there's nothing
    // for the AI interview to assess as a competency.
    const hasMthSkillEntry = mth.skills.some(s => (s.type ?? 'Skill') === 'Skill');
    if (!hasMthSkillEntry) {
      toast.error('Must-Have Skills must include at least one entry of type "Skill" (not just Commands).');
      return;
    }
    if (nth.enabled) {
      const hasNthSkillEntry = nth.skills.some(s => (s.type ?? 'Skill') === 'Skill');
      if (!hasNthSkillEntry) {
        toast.error('Nice-to-Have Skills must include at least one entry of type "Skill" (not just Commands).');
        return;
      }
    }

    await proceedToClusters();
  };

  const proceedToClusters = async () => {
    if (!selectedJd) return;
    isNavigatingRef.current = true;

    // 1. Save draft first so the Clusters page reads the latest skills.
    const ok = await saveDraft(true);
    if (!ok || !existingDraftIdRef.current) {
      isNavigatingRef.current = false;
      toast.error('Please save your configuration first');
      return;
    }

    // 2. Determine if clusters need (re)generation.
    // Rule: regenerate when ANYTHING that affects cluster output changes since
    // the last cluster save — skill names, skill TYPES (Skill/Command/Cert),
    // question count Q (changes when NTH/HR rounds toggle), or NTH/HR enabled
    // state. Mere back-nav with no change must NOT re-trigger generation.
    const currentMthSet = new Set(
      mth.skills.map(s => s.name.toLowerCase().trim()).filter(Boolean)
    );
    const currentNthSet = new Set(
      nth.enabled ? nth.skills.map(s => s.name.toLowerCase().trim()).filter(Boolean) : []
    );
    const mthSnapshot: string[] = loadedSiRef.current.mth_skills_snapshot ?? [];
    const nthSnapshot: string[] = loadedSiRef.current.nth_skills_snapshot ?? [];
    const mthSnapshotSet = new Set(mthSnapshot.map(s => s.toLowerCase().trim()));
    const nthSnapshotSet = new Set(nthSnapshot.map(s => s.toLowerCase().trim()));
    const hasSnapshot = mthSnapshotSet.size > 0;

    const mthSkillsChanged = hasSnapshot
      ? currentMthSet.size !== mthSnapshotSet.size || [...currentMthSet].some(s => !mthSnapshotSet.has(s))
      : false;
    const nthSkillsChanged = nth.enabled && hasSnapshot
      ? currentNthSet.size !== nthSnapshotSet.size || [...currentNthSet].some(s => !nthSnapshotSet.has(s))
      : false;

    // Skill TYPE comparison — type change (Skill ↔ Command) affects
    // clustering even when names are unchanged.
    const buildTypesMap = (entries: { name: string; type?: string }[]): Record<string, string> => {
      const out: Record<string, string> = {};
      for (const e of entries) {
        if (e?.name) out[e.name.toLowerCase().trim()] = e.type ?? 'Skill';
      }
      return out;
    };
    const currentMthTypes = buildTypesMap(mth.skills);
    const currentNthTypes = nth.enabled ? buildTypesMap(nth.skills) : {};
    const snapMthTypes: Record<string, string> = loadedSiRef.current.mth_skill_types_snapshot ?? {};
    const snapNthTypes: Record<string, string> = loadedSiRef.current.nth_skill_types_snapshot ?? {};
    const typesEqual = (a: Record<string, string>, b: Record<string, string>): boolean => {
      const ka = Object.keys(a);
      const kb = Object.keys(b);
      if (ka.length !== kb.length) return false;
      for (const k of ka) if (a[k] !== b[k]) return false;
      return true;
    };
    const mthTypesChanged = hasSnapshot && !typesEqual(currentMthTypes, snapMthTypes);
    const nthTypesChanged = nth.enabled && hasSnapshot && !typesEqual(currentNthTypes, snapNthTypes);

    // Q (questions per bucket) change — toggling NTH/HR rounds shifts the
    // duration preset, which shifts mthQuestions/nthQuestions, which shifts
    // the cluster floor (2Q) and ceiling (3Q).
    const snapMthQ: number | undefined = loadedSiRef.current.mth_questions_snapshot;
    const snapNthQ: number | undefined = loadedSiRef.current.nth_questions_snapshot;
    const mthQChanged = hasSnapshot && typeof snapMthQ === 'number'
      && snapMthQ !== (timedAllocation.mthQuestions ?? 0);
    const nthQChanged = hasSnapshot && typeof snapNthQ === 'number'
      && snapNthQ !== (nth.enabled ? (timedAllocation.nthQuestions ?? 0) : 0);

    // NTH/HR toggle — directly forces regen (even when Q didn't capture, e.g.
    // older drafts without the questions snapshot).
    const snapNthEnabled: boolean | undefined = loadedSiRef.current.nth_enabled_snapshot;
    const snapHrEnabled: boolean | undefined = loadedSiRef.current.hr_enabled_snapshot;
    const nthEnabledChanged = hasSnapshot && typeof snapNthEnabled === 'boolean'
      && snapNthEnabled !== nth.enabled;
    const hrEnabledChanged = hasSnapshot && typeof snapHrEnabled === 'boolean'
      && snapHrEnabled !== hrEnabled;

    const mthClustersMatch =
      mth.clusters.length > 0 &&
      mth.clusters.length <= effectiveMthMax &&
      !mthSkillsChanged &&
      !mthTypesChanged &&
      !mthQChanged &&
      !nthEnabledChanged &&
      !hrEnabledChanged;
    const nthClustersMatch =
      !nth.enabled ||
      (nth.clusters.length > 0 &&
        nth.clusters.length <= effectiveNthMax &&
        !nthSkillsChanged &&
        !nthTypesChanged &&
        !nthQChanged &&
        !nthEnabledChanged &&
        !hrEnabledChanged);
    const needsRegeneration = !mthClustersMatch || !nthClustersMatch;

    // Backfill snapshot if missing so future visits use snapshot comparison.
    if (!hasSnapshot && !needsRegeneration && existingDraftIdRef.current) {
      const siBackfill = JSON.parse(buildClusterJson());
      siBackfill.mth_skills_snapshot = mth.skills.map(s => s.name);
      siBackfill.nth_skills_snapshot = nth.enabled ? nth.skills.map(s => s.name) : [];
      siBackfill.mth_questions_snapshot = timedAllocation.mthQuestions ?? 0;
      siBackfill.nth_questions_snapshot = nth.enabled ? (timedAllocation.nthQuestions ?? 0) : 0;
      siBackfill.mth_skill_types_snapshot = currentMthTypes;
      siBackfill.nth_skill_types_snapshot = currentNthTypes;
      siBackfill.nth_enabled_snapshot = nth.enabled;
      siBackfill.hr_enabled_snapshot = hrEnabled;
      loadedSiRef.current = { ...loadedSiRef.current, ...siBackfill };
      aiInterviewService.update(existingDraftIdRef.current, {
        special_instructions: JSON.stringify(siBackfill),
      }).catch(() => {});
    }

    // Capture recruiter-typed "main" skills before AI expansion runs on the
    // Clusters page. Always re-capture from the currently displayed mth.skills
    // / nth.skills — those are the recruiter's source of truth (the load
    // logic already filters out AI-expansion sub-skills). Re-capturing each
    // time also self-heals legacy drafts where main_skills got polluted with
    // the expanded list under earlier code.
    if (existingDraftIdRef.current) {
      loadedSiRef.current.mth_main_skills = mth.skills.map(s => s.name);
      // Capture the CURRENT nth.skills unconditionally (not [] when disabled) so
      // the baseline matches what buildSpecialInstructions now persists — a
      // manually-added NHS skill survives disable → navigate → re-enable, and
      // change-detection doesn't falsely trip on a stale empty baseline.
      loadedSiRef.current.nth_main_skills = nth.skills.map(s => s.name);
      const siWithMain = JSON.parse(buildClusterJson());
      // Fire-and-forget; Clusters page will read on load.
      aiInterviewService.update(existingDraftIdRef.current, {
        special_instructions: JSON.stringify(siWithMain),
      }).catch(() => {});
    }

    // 3. Navigate immediately. Pass autogen=1 only when something changed
    // (needsRegeneration = skill set diff). No changes → reuse cached clusters,
    // no wasted LLM call.
    const base = `/recruitment/ai-interviews/jd-selection/ai-interview-config/clusters?id=${existingDraftIdRef.current}${fromJobDetails ? '&from=job-details' : ''}`;
    router.push(needsRegeneration ? `${base}&autogen=1` : base);
  };

  const handleSaveAndNavigate = async () => {
    setShowUnsavedDialog(false);
    isNavigatingRef.current = true;
    await saveDraft(true);
    toast.success('Draft saved');
    if (pendingNavigation === '__back__') router.back();
    else if (pendingNavigation) router.push(pendingNavigation);
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
    if (pendingNavigation === '__back__') router.back();
    else if (pendingNavigation) router.push(pendingNavigation);
    setPendingNavigation(null);
  };

  /* ── Loading / null guards ── */
  // `redirecting` keeps the loader up while the router navigates away (JD not
  // found, or the JD already has a live interview). Without it `finally` clears
  // loadingJd, selectedJd is still null, and the old `return null` below painted
  // a blank screen for the frame or two before the new route mounted.
  if (loadingJd || redirecting) {
    return (
      <AIInterviewFlowLoader message="Loading configuration…" />
    );
  }

  if (!selectedJd) return null;

  /* ─────────────────────────────────────────────────────────────────── */
  /*  Render                                                             */
  /* ─────────────────────────────────────────────────────────────────── */

  return (
    <main className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full min-h-[calc(100vh-7rem)] bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
          <PageBreadcrumb
            className="mb-4 md:mb-6"
            items={
              fromJobDetails && jdId
                ? [
                    // Entered from Job Details — repeat that page's trail and link
                    // the JD crumb back to it so the user returns where they started.
                    { label: 'Dashboard', href: '/dashboard' },
                    { label: 'Job Descriptions', href: '/recruitment/job-openings' },
                    { label: selectedJd?.title || 'Job Details', href: `/recruitment/job-details?id=${encodeURIComponent(jdId)}` },
                    { label: 'AI Interview Config' },
                  ]
                : [
                    { label: 'Dashboard', href: '/dashboard' },
                    { label: 'AI Interviews', href: '/recruitment/ai-interviews' },
                    // Name the JD being configured so the trail identifies the record.
                    { label: selectedJd?.title || 'Configure Interview' },
                  ]
            }
          />

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
            <Brain className="w-5 h-5 text-brand-blue" />
          </div>
          <div>
            <h1 className="text-gray-900 text-xl font-semibold tracking-tight">AI Interview Configuration</h1>
            <p className="text-sm text-gray-500">Configure skills, clusters, and weightage for this interview</p>
          </div>
        </div>

        {/* Step indicators */}
        <AIInterviewStepIndicator
          currentStep={CURRENT_STEP}
          // Only step 1 is behind us. Route through the unsaved-changes dialog
          // rather than pushing directly — this page's click interceptor only
          // catches <a> elements, so a plain button would slip past the guard.
          onStepClick={() => {
            setPendingNavigation('/recruitment/ai-interviews/jd-selection');
            setShowUnsavedDialog(true);
          }}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Left: main config ── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Selected JD */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border border-brand-blue/15 ring-1 ring-brand-blue/10 rounded-xl shadow-sm shadow-brand-blue/10">
              <div>
                <p className="text-xs text-brand-blue mb-0.5 font-medium">Job Description</p>
                <p className="font-semibold text-gray-900 tracking-tight">{selectedJd.title}</p>
                {selectedJd.department && <p className="text-xs text-gray-500">{selectedJd.department}</p>}
              </div>
              <button onClick={() => router.push('/recruitment/ai-interviews/jd-selection')} className="text-sm text-gray-600 hover:text-brand-blue px-3 py-1.5 rounded-md hover:bg-brand-blue/5 transition-colors">
                Change
              </button>
            </div>

            {/* ── Interview Mode + Make Clusters ── */}
            <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4 space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-brand-blue/10 ring-1 ring-brand-blue/15">
                    <Clock className="w-5 h-5 text-brand-blue" />
                  </div>
                  <span className="font-semibold text-gray-900 text-sm tracking-tight">Interview Mode</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {/* Fixed */}
                  <button
                    onClick={() => { setMode('fixed'); setBufferEnabled(false); }}
                    className={`relative flex flex-col gap-1 p-4 rounded-xl border-2 text-left transition-all ${
                      mode === 'fixed' ? 'border-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue/20 shadow-sm shadow-brand-blue/10' : 'border-gray-200 bg-white hover:border-brand-blue/30 hover:bg-brand-blue/5'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Timer className={`w-4 h-4 ${mode === 'fixed' ? 'text-brand-blue' : 'text-gray-600'}`} />
                      <span className={`font-semibold text-sm tracking-tight ${mode === 'fixed' ? 'text-brand-blue' : 'text-gray-900'}`}>Timed Mode — 30 min</span>
                    </div>
                    <p className={`text-xs ${mode === 'fixed' ? 'text-gray-700' : 'text-gray-500'}`}>
                      Candidate response time is capped. AI narration excluded.
                    </p>
                    <div className={`mt-2 text-[11px] space-y-0.5 ${mode === 'fixed' ? 'text-gray-600' : 'text-gray-400'}`}>
                      <div>Must-to-Have → {timedQDist.mth} questions</div>
                      {nth.enabled && <div>Nice-to-Have → {timedQDist.nth} questions</div>}
                      {hrEnabled && <div>HR Round → {timedQDist.hr} questions</div>}
                    </div>
                  </button>

                  {/* Flexible */}
                  <button
                    onClick={() => setMode('flexible')}
                    className={`relative flex flex-col gap-1 p-4 rounded-xl border-2 text-left transition-all ${
                      mode === 'flexible' ? 'border-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue/20 shadow-sm shadow-brand-blue/10' : 'border-gray-200 bg-white hover:border-brand-blue/30 hover:bg-brand-blue/5'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Timer className={`w-4 h-4 ${mode === 'flexible' ? 'text-brand-blue' : 'text-gray-600'}`} />
                      <span className={`font-semibold text-sm tracking-tight ${mode === 'flexible' ? 'text-brand-blue' : 'text-gray-900'}`}>Conversational — 30 min</span>
                    </div>
                    <p className={`text-xs ${mode === 'flexible' ? 'text-gray-700' : 'text-gray-500'}`}>
                      No per-question timer. AI adapts based on candidate responses.
                    </p>
                    <div className={`mt-2 text-[11px] space-y-0.5 ${mode === 'flexible' ? 'text-gray-600' : 'text-gray-400'}`}>
                      <div>Must-to-Have → {mth.percentage}% weight</div>
                      {nth.enabled && <div>Nice-to-Have → {nth.percentage}% weight</div>}
                      {hrEnabled && <div>HR Round → {hrPct}% weight</div>}
                    </div>
                  </button>
                </div>

                {/* Buffer Time toggle — only in conversational mode */}
                {mode === 'flexible' && (
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">Buffer Time</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 font-medium">+5 min</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {bufferEnabled
                          ? 'Total interview time: 35 min (30 min + 5 min buffer)'
                          : 'Total interview time: 30 min — hard stop at limit'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setBufferEnabled(prev => !prev)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        bufferEnabled ? 'bg-brand-blue shadow-sm shadow-brand-blue/25' : 'bg-gray-200'
                      }`}
                      role="switch"
                      aria-checked={bufferEnabled}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          bufferEnabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                )}

              </div>
            </div>

            {/* ── Speech-to-Text Model ── */}
            <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-brand-blue/10 ring-1 ring-brand-blue/15">
                  <Mic className="w-5 h-5 text-brand-blue" />
                </div>
                <div>
                  <span className="font-semibold text-gray-900 text-sm tracking-tight">Speech-to-Text Model</span>
                  <p className="text-xs text-gray-500">Engine used to transcribe the candidate&apos;s spoken answers.</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <div className="relative">
                  <select
                    value={sttModel}
                    onChange={e => setSttModel(e.target.value)}
                    className="appearance-none text-sm font-medium pl-3 pr-8 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                  >
                    {STT_MODELS.map(m => (
                      <option key={m.value} value={m.value}>
                        {m.label}{m.recommended ? ' (Recommended)' : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
                {(() => {
                  const sel = STT_MODELS.find(m => m.value === sttModel) ?? STT_MODELS[0];
                  return (
                    <>
                      {sel.recommended && (
                        <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full bg-green-50 text-green-700 border border-green-200">
                          Recommended
                        </span>
                      )}
                      {sel.note && <span className="text-xs text-gray-500">{sel.note}</span>}
                    </>
                  );
                })()}
              </div>
            </div>

            {/* ── MTH ── */}
            <SkillSection
              title="Must-To-Have Skills"
              category="mth"
              config={mth}
              jdSkillNames={selectedJd.must_have_skills || []}
              mode={mode}
              questionCount={timedQDist.mth}
              flexibleMinutes={flexMthMin}
              onChange={patch => setMth(prev => ({ ...prev, ...patch }))}
              onMoveSkill={mode === 'flexible' ? moveMthToNth : undefined}
              isLocked={flexSkillsLocked}
              onResetClusters={handleResetClusters}
              hideClustersView
            />

            {/* ── NTH ── */}
            <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={nth.enabled} onChange={() => {
                      const newNthEnabled = !nth.enabled;
                      setNth(prev => ({ ...prev, enabled: newNthEnabled }));
                      if (mode === 'flexible') {
                        const nthSeedPct = newNthEnabled
                          ? getReenabledPctSeed(nth.percentage, DEFAULT_PCT.nth)
                          : nth.percentage;
                        const [newMth, newNth, newHr] = newNthEnabled
                          ? redistributeFlexPctWithPinnedRound(
                              mth.percentage, true, nthSeedPct, hrEnabled, hrPct, 'nth',
                            )
                          : redistributeFlexPct(
                              mth.percentage, false, nthSeedPct, hrEnabled, hrPct,
                            );
                        setMth(prev => ({ ...prev, percentage: newMth }));
                        if (newNthEnabled) setNth(prev => ({ ...prev, percentage: newNth }));
                        setHrPct(newHr);
                      }
                    }} className="sr-only peer" />
                    <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-gradient-to-r peer-checked:from-brand-blue peer-checked:to-brand-blue-2 peer-checked:shadow-sm peer-checked:shadow-brand-blue/25 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
                  </label>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-brand-cyan/10 ring-1 ring-brand-cyan/15">
                    <Sparkles className="w-5 h-5 text-brand-cyan" />
                  </div>
                  <span className="font-semibold text-gray-900 text-sm tracking-tight">Nice-To-Have Skills</span>
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
                    questionCount={timedQDist.nth}
                    flexibleMinutes={flexNthMin}
                    onChange={patch => setNth(prev => ({ ...prev, ...patch }))}
                    onMoveSkill={mode === 'flexible' ? moveNthToMth : undefined}
                    isLocked={flexSkillsLocked}
                    onResetClusters={handleResetClusters}
                    hideClustersView
                  />
                </div>
              )}
            </div>

            {/* ── HR ── */}
            <HRSection
              mode={mode}
              enabled={hrEnabled}
              questionCount={timedQDist.hr}
              flexibleMinutes={flexHrMin}
              percentage={hrPct}
              onToggle={() => {
                const newHrEnabled = !hrEnabled;
                setHrEnabled(newHrEnabled);
                if (mode === 'flexible') {
                  const hrSeedPct = newHrEnabled
                    ? Math.max(10, getReenabledPctSeed(hrPct, DEFAULT_PCT.hr))
                    : hrPct;
                  const [newMth, newNth, newHr] = newHrEnabled
                    ? redistributeFlexPctWithPinnedRound(
                        mth.percentage, nth.enabled, nth.percentage, true, hrSeedPct, 'hr',
                      )
                    : redistributeFlexPct(
                        mth.percentage, nth.enabled, nth.percentage, false, hrSeedPct,
                      );
                  setMth(prev => ({ ...prev, percentage: newMth }));
                  if (nth.enabled) setNth(prev => ({ ...prev, percentage: newNth }));
                  setHrPct(newHr);
                }
              }}
              onPctChange={value => {
                if (mode === 'flexible' && value < 10) return;
                setHrPct(value);
              }}
              bankQuestions={hrBankQuestions}
              selectedIds={hrSelectedIds}
              selectedStages={hrQuestionStages}
              onSelectedChange={setHrSelectedIds}
              onSelectedStagesChange={setHrQuestionStages}
              onBankAdd={q => setHrBankQuestions(prev => [...prev, q])}
            />


            {/* Introduction Video (Optional) */}
            <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-brand-blue/10 ring-1 ring-brand-blue/15">
                  <Video className="w-5 h-5 text-brand-blue" />
                </div>
                <span className="text-sm font-medium text-gray-900 tracking-tight">Introduction Video</span>
                <span className="text-xs text-gray-400">(Optional · max 1 min)</span>
              </div>
              <p className="text-xs text-gray-500">
                Upload or record a short video introducing the role. Candidates will see this before the interview starts.
              </p>

              {introVideoFile || introVideoUrl ? (
                <div className="flex items-center gap-3 p-3 bg-slate-50 border border-gray-100 rounded-lg ring-1 ring-black/[0.02]">
                  <Video className="w-5 h-5 text-brand-blue flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 truncate">{introVideoFile?.name || 'Uploaded video'}</p>
                    {introVideoFile && (
                      <p className="text-xs text-gray-400">{(introVideoFile.size / (1024 * 1024)).toFixed(1)} MB</p>
                    )}
                  </div>
                  {uploadingVideo ? (
                    <Loader2 className="w-4 h-4 animate-spin text-brand-blue" />
                  ) : (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={async () => {
                          if (videoPreviewSrc) {
                            setShowVideoPreview(true);
                          } else if (introVideoUrl) {
                            try {
                              const res = await api.get(`/ai-interview/intro-video/${introVideoUrl}`, { responseType: 'blob' });
                              const blobUrl = URL.createObjectURL(res.data);
                              setVideoPreviewSrc(blobUrl);
                              setShowVideoPreview(true);
                            } catch {
                              toast.error('Failed to load video preview');
                            }
                          }
                        }}
                        className="p-1 text-gray-400 hover:text-brand-blue transition-colors"
                        title="Preview video"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                      <button onClick={handleRemoveVideo} className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors" aria-label="Remove video" title="Remove video">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Upload / Record toggle */}
                  <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                    <button
                      onClick={() => setVideoMode('upload')}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
                        videoMode === 'upload'
                          ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25'
                          : 'bg-white text-gray-600 hover:bg-brand-blue/5 hover:text-brand-blue'
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Upload Video
                    </button>
                    <button
                      onClick={() => setVideoMode('record')}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors border-l border-gray-200 ${
                        videoMode === 'record'
                          ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25'
                          : 'bg-white text-gray-600 hover:bg-brand-blue/5 hover:text-brand-blue'
                      }`}
                    >
                      <Camera className="w-3.5 h-3.5" />
                      Record Video
                    </button>
                  </div>

                  {videoMode === 'upload' ? (
                    <div>
                      <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-brand-blue/40 hover:bg-brand-blue/5 transition-colors">
                        <Upload className="w-4 h-4 text-brand-blue" />
                        <span className="text-sm text-gray-500">Click to upload a video (max 1 min)</span>
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
                      {videoDurationError && (
                        <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {videoDurationError}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {/* Camera preview */}
                      <div className="relative rounded-lg overflow-hidden border border-gray-200 bg-black aspect-video">
                        <video
                          ref={videoPreviewRef}
                          autoPlay
                          muted
                          playsInline
                          className={`w-full h-full object-cover ${recordedPreviewUrl ? 'hidden' : ''}`}
                        />
                        {recordedPreviewUrl && (
                          <video
                            src={recordedPreviewUrl}
                            controls
                            className="w-full h-full object-cover"
                          />
                        )}

                        {/* Timer overlay */}
                        {isRecording && (
                          <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/60 backdrop-blur-sm">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-xs font-mono text-white">
                              {String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:{String(recordingSeconds % 60).padStart(2, '0')} / 01:00
                            </span>
                          </div>
                        )}

                        {/* Remaining time bar */}
                        {isRecording && (
                          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-700">
                            <div
                              className="h-full bg-red-500 transition-all duration-1000 ease-linear"
                              style={{ width: `${(recordingSeconds / 60) * 100}%` }}
                            />
                          </div>
                        )}

                        {/* Camera not started overlay */}
                        {!cameraReady && !recordedPreviewUrl && !cameraError && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900">
                            <Camera className="w-8 h-8 text-gray-500 mb-2" />
                            <p className="text-xs text-gray-400">Camera preview will appear here</p>
                          </div>
                        )}

                        {/* Camera error */}
                        {cameraError && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900">
                            <AlertCircle className="w-6 h-6 text-red-400 mb-1" />
                            <p className="text-xs text-red-400 text-center px-4">{cameraError}</p>
                          </div>
                        )}
                      </div>

                      {/* Controls */}
                      <div className="flex items-center justify-center gap-2">
                        {!cameraReady && !isRecording && !recordedPreviewUrl && (
                          <button
                            onClick={startCamera}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 transition-colors"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            Open Camera
                          </button>
                        )}
                        {cameraReady && !isRecording && (
                          <button
                            onClick={startRecording}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                          >
                            <span className="w-2.5 h-2.5 rounded-full bg-white" />
                            Start Recording
                          </button>
                        )}
                        {isRecording && (
                          <button
                            onClick={stopRecordingAndSave}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 transition-colors"
                          >
                            <span className="w-2.5 h-2.5 rounded-sm bg-white" />
                            Stop & Save
                          </button>
                        )}
                        {recordedPreviewUrl && !uploadingVideo && (
                          <button
                            onClick={() => {
                              setRecordedPreviewUrl('');
                              setRecordingSeconds(0);
                              startCamera();
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 bg-white text-gray-700 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors"
                          >
                            Re-record
                          </button>
                        )}
                        {cameraReady && !isRecording && (
                          <button
                            onClick={stopCamera}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 bg-white text-gray-700 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                            Cancel
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-400 text-center">Recording auto-stops at 1 minute</p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Candidate Languages */}
            <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-brand-blue/10 ring-1 ring-brand-blue/15">
                  <Globe className="w-5 h-5 text-brand-blue" />
                </div>
                <span className="text-sm font-medium text-gray-900 tracking-tight">Candidate Languages</span>
              </div>
              <p className="text-xs text-gray-500">
                Select which languages the candidate can choose for the interview. The AI will conduct the interview in their chosen language.
              </p>

              {/* Selected languages */}
              <div className="flex flex-wrap gap-1.5">
                {availableLanguages.map(lang => (
                  <span
                    key={lang}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20"
                  >
                    {lang}
                    {lang !== 'English' && (
                      <button
                        onClick={() => setAvailableLanguages(prev => prev.filter(l => l !== lang))}
                        className="text-brand-blue/60 hover:text-brand-blue"
                       aria-label="Close">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>

              {/* Add language – hidden */}
            </div>

            {/* Mobile Environment Verification */}
            <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-brand-blue/10 ring-1 ring-brand-blue/15">
                    <QrCode className="w-5 h-5 text-brand-blue" />
                  </div>
                  <span className="text-sm font-medium text-gray-900 tracking-tight">Mobile Environment Verification</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={environmentVerificationEnabled}
                    onChange={e => setEnvironmentVerificationEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-gradient-to-r peer-checked:from-brand-blue peer-checked:to-brand-blue-2 peer-checked:shadow-sm peer-checked:shadow-brand-blue/25 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
                </label>
              </div>
              <p className="text-xs text-gray-500">
                Pause the interview once, after the first must-have-skills question, to verify the candidate's physical environment via a QR code and their phone's camera.
              </p>
            </div>
          </div>

          {/* ── Right: Summary sidebar ── */}
          <div className="space-y-4">

            {/* Weightage distribution */}
            <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4 lg:sticky lg:top-6">
              <h3 className="font-semibold text-gray-900 text-sm mb-4 tracking-tight">Configuration Summary</h3>

              {/* Job Details */}
              <div className="border border-gray-100 rounded-lg overflow-hidden mb-4 ring-1 ring-black/[0.02]">
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                  <span className="text-xs font-medium text-brand-blue">Job Details</span>
                </div>
                <div className="divide-y divide-gray-50">
                  <div className="px-3 py-2 flex items-start justify-between gap-2">
                    <span className="text-xs text-gray-500 flex-shrink-0">Role Title</span>
                    <span className="text-xs font-semibold text-gray-900 text-right">{selectedJd.title}</span>
                  </div>
                  {experienceSummary && (
                    <div className="px-3 py-2 flex items-start justify-between gap-2">
                      <span className="text-xs text-gray-500 flex-shrink-0">Experience</span>
                      <span className="text-xs font-semibold text-gray-900 text-right">
                        {experienceSummary}
                      </span>
                    </div>
                  )}
                  {selectedJd.industry_type && (
                    <div className="px-3 py-2 flex items-start justify-between gap-2">
                      <span className="text-xs text-gray-500 flex-shrink-0">Industry</span>
                      <span className="text-xs font-semibold text-gray-900 text-right">{selectedJd.industry_type}</span>
                    </div>
                  )}
                  {selectedJd.domain_keywords && selectedJd.domain_keywords.length > 0 && (
                    <div className="px-3 py-2">
                      <span className="text-xs text-gray-500 block mb-1.5">Domain Context</span>
                      <div className="flex flex-wrap gap-1">
                        {selectedJd.domain_keywords.slice(0, 6).map(kw => (
                          <span key={kw} className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">{kw}</span>
                        ))}
                        {selectedJd.domain_keywords.length > 6 && (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-gray-500 ring-1 ring-gray-200">+{selectedJd.domain_keywords.length - 6}</span>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="px-3 py-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-gray-500 flex-shrink-0">Interview Mode</span>
                    <span className="text-xs font-semibold text-gray-900 text-right">
                      {mode === 'flexible' ? 'Conversational' : 'Timed'}
                    </span>
                  </div>
                  {mode === 'flexible' && (
                    <div className="px-3 py-2 flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-500 flex-shrink-0">Buffer Time</span>
                      <span className={`text-xs font-semibold text-right ${bufferEnabled ? 'text-brand-blue' : 'text-gray-400'}`}>
                        {bufferEnabled ? 'Enabled (+5 min)' : 'Disabled'}
                      </span>
                    </div>
                  )}
                  <div className="px-3 py-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-gray-500 flex-shrink-0">Total Duration</span>
                      <span className="text-xs font-semibold text-gray-900 text-right">
                      {mode === 'flexible'
                        ? '30 min'
                        : `${totalFixed} min`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Fixed mode: question budget + time allocation (combined) */}
              {mode === 'fixed' && (
                <div className="space-y-3 mb-4">
                  <div className="border border-gray-100 rounded-lg overflow-hidden ring-1 ring-black/[0.02]">
                    <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                      <span className="text-xs font-medium text-brand-blue">Question Budget (Total: 15)</span>
                      <span className="text-xs text-gray-400">{totalFixed} min</span>
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
                          <td className="px-3 py-2 text-right font-semibold text-gray-900">{timedQDist.mth}</td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-900">{timedAllocation.mthMaxClusters}</td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-900">{fixedMthMin}m</td>
                        </tr>
                        {nth.enabled && (
                          <tr className="border-b border-gray-50">
                            <td className="px-3 py-2 text-gray-600">Nice-to-Have</td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-900">{timedQDist.nth}</td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-900">{timedAllocation.nthMaxClusters}</td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-900">{fixedNthMin}m</td>
                          </tr>
                        )}
                        {hrEnabled && (
                          <tr>
                            <td className="px-3 py-2 text-gray-600">HR Round</td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-900">{timedQDist.hr}</td>
                            <td className="px-3 py-2 text-right text-gray-400">—</td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-900">{fixedHrMin}m</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Flexible mode: weight distribution + time allocation */}
              {mode === 'flexible' && (
                <div className="space-y-3 mb-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <span>Scoring Weight Distribution</span>
                      <span className={`font-semibold ${pctValid ? 'text-green-600' : 'text-red-500'}`}>
                        {totalPct}% / 100%
                      </span>
                    </div>
                    {[
                      { label: 'Must-to-Have', pct: mth.percentage, color: 'bg-brand-blue' },
                      ...(nth.enabled ? [{ label: 'Nice-to-Have', pct: nth.percentage, color: 'bg-brand-cyan' }] : []),
                      ...(hrEnabled ? [{ label: 'HR Round', pct: hrPct, color: 'bg-brand-orange' }] : []),
                    ].map(({ label, pct, color }) => (
                      <div key={label}>
                        <div className="flex items-center justify-between text-xs mb-0.5">
                          <span className="text-gray-600">{label}</span>
                          <span className="font-medium text-gray-900">{pct}%</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  {!pctValid && (
                    <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-100">
                      <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                      <p className="text-[11px] text-red-600">Weights must total 100%. Adjust the percentages above.</p>
                    </div>
                  )}
                  {pctValid && (
                    <div className="border border-gray-100 rounded-lg overflow-hidden ring-1 ring-black/[0.02]">
                      <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                        <span className="text-xs font-medium text-brand-blue">Time Allocation</span>
                        <span className="text-xs font-semibold text-gray-700">
                          {bufferEnabled ? '30 min base + 5 min buffer' : '30 min total'}
                        </span>
                      </div>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-100">
                            <th className="px-3 py-1.5 text-left font-medium text-gray-400">Round</th>
                            <th className="px-3 py-1.5 text-right font-medium text-gray-400">Clusters</th>
                            <th className="px-3 py-1.5 text-right font-medium text-gray-400">Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-gray-50">
                            <td className="px-3 py-2 text-gray-600">Must-to-Have</td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-900">{effectiveMthMax}</td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-900">~{flexMthMin} min</td>
                          </tr>
                          {nth.enabled && (
                            <tr className="border-b border-gray-50">
                              <td className="px-3 py-2 text-gray-600">Nice-to-Have</td>
                              <td className="px-3 py-2 text-right font-semibold text-gray-900">{effectiveNthMax}</td>
                              <td className="px-3 py-2 text-right font-semibold text-gray-900">~{flexNthMin} min</td>
                            </tr>
                          )}
                          {hrEnabled && (
                            <tr className={bufferEnabled ? 'border-b border-gray-50' : ''}>
                              <td className="px-3 py-2 text-gray-600">HR Round</td>
                              <td className="px-3 py-2 text-right text-gray-400">—</td>
                              <td className="px-3 py-2 text-right font-semibold text-gray-900">~{flexHrMin} min</td>
                            </tr>
                          )}
                          {bufferEnabled && (
                            <tr className="border-b border-gray-50 bg-brand-blue/5">
                              <td className="px-3 py-2 text-brand-blue font-medium">Buffer Time</td>
                              <td className="px-3 py-2 text-right text-gray-400">—</td>
                              <td className="px-3 py-2 text-right font-semibold text-brand-blue">+5 min</td>
                            </tr>
                          )}
                          {bufferEnabled && (
                            <tr className="bg-slate-50">
                              <td className="px-3 py-2 text-gray-700 font-semibold">Max</td>
                              <td className="px-3 py-2 text-right text-gray-400">—</td>
                              <td className="px-3 py-2 text-right font-bold text-gray-900">35 min</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="space-y-2">
                {/* No native `title` on the button — the styled bubble below
                    already shows `continueDisabledReason`, and setting both made
                    the browser draw a second plain tooltip over it. */}
                <div className="relative group">
                  <button
                    onClick={handleContinueToClusters}
                    disabled={!canContinueToClusters}
                    aria-disabled={!canContinueToClusters}
                    className={`w-full flex items-center justify-center gap-2 py-2.5 text-sm rounded-lg transition-colors ${
                      canContinueToClusters
                        ? 'bg-brand-blue hover:bg-brand-blue-2 text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10'
                        : 'bg-slate-200 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {savingDraft ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                    {savingDraft ? 'Saving…' : 'Continue to Clusters'}
                  </button>
                  {!canContinueToClusters && continueDisabledReason && (
                    <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 text-xs text-white bg-gray-900 rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-normal w-max max-w-xs z-10">
                      {continueDisabledReason}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900" />
                    </div>
                  )}
                </div>
                <button
                  onClick={handleSaveAsDraft}
                  disabled={savingDraft}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-sm border border-gray-200 bg-white text-gray-700 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingDraft ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {savingDraft ? 'Saving…' : 'Save as Draft'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Video Preview Dialog */}
      <Dialog open={showVideoPreview} onOpenChange={setShowVideoPreview}>
        <DialogContent className="sm:max-w-2xl p-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-2 bg-gray-50 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-brand-blue/10 ring-1 ring-brand-blue/15">
                <Video className="w-5 h-5 text-brand-blue" />
              </div>
              <div>
                <DialogTitle className="text-sm font-semibold tracking-tight">Video Preview</DialogTitle>
                <DialogDescription className="text-xs text-gray-500">Introduction video for candidates</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="px-4 pb-4">
            <div className="rounded-lg overflow-hidden bg-black aspect-video">
              {showVideoPreview && videoPreviewSrc && (
                <video
                  key={videoPreviewSrc}
                  controls
                  autoPlay
                  className="w-full h-full object-contain"
                  ref={el => { if (el) { el.src = videoPreviewSrc; el.load(); el.play().catch(() => {}); } }}
                />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Unsaved Changes Dialog */}
      <Dialog open={showUnsavedDialog} onOpenChange={open => !open && setShowUnsavedDialog(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="tracking-tight">Unsaved Changes</DialogTitle>
            <DialogDescription>Save your configuration as a draft before leaving?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button onClick={handleDiscardAndNavigate} className="px-4 py-2 border border-gray-200 bg-white text-gray-700 rounded-md hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors">
              Discard
            </button>
            <button onClick={handleSaveAndNavigate} disabled={savingDraft} className="px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-md shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors disabled:opacity-50 flex items-center gap-2">
              {savingDraft ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {savingDraft ? 'Saving…' : 'Save Draft'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      </div>
    </main>
  );
}
