'use client';

import {
  ArrowLeft, Clock, Plus, X, Sparkles, CheckCircle2, Loader2,
  Users, Brain, Shield, Globe, Save, ChevronDown, ChevronUp,
  MessageSquare, Info, AlertCircle, Timer, Zap,
  Video, Upload, Layers, ChevronRight, Camera, Play,
  Lock, ArrowRightLeft,
} from 'lucide-react';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import type { PublishedJD, AIInterviewRoundConfig, AIInterviewResponse } from '@/lib/services/aiInterviewService';
import api from '@/lib/services/api';
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

function getTimedModeAllocation(nthEnabled: boolean, hrEnabled: boolean) {
  if (!nthEnabled && !hrEnabled) {
    return {
      mthMinutes: 30,
      nthMinutes: 0,
      hrMinutes: 0,
      mthQuestions: 15,
      nthQuestions: 0,
      hrQuestions: 0,
      mthMaxClusters: 5,
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
    ? { tag: 'bg-purple-50 text-purple-700 border-purple-200', accent: 'text-purple-700' }
    : { tag: 'bg-indigo-50 text-indigo-700 border-indigo-200', accent: 'text-indigo-700' };

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
          {/* Flexible mode: move skill to the other category */}
          {mode === 'flexible' && onMoveSkill && !isLocked && (
            <button
              title={category === 'mth' ? 'Move to Nice-to-Have' : 'Move to Must-Have'}
              onClick={() => onMoveSkill(skill.name)}
              className="p-1 text-gray-300 hover:text-indigo-500 transition-colors opacity-0 group-hover:opacity-100"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
            </button>
          )}
          {/* Hide delete when locked in flexible mode */}
          {!(mode === 'flexible' && isLocked) && (
            <button
              onClick={() => setSkillToDelete(skill.name)}
              className="p-1 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
            >
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
          {mode === 'fixed' && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-600 border border-blue-200">
              {questionCount} questions
            </span>
          )}
          {mode === 'flexible' && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-purple-50 text-purple-600 border border-purple-200">
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
                className={`w-14 text-center text-sm font-semibold border rounded-l-md px-1 py-0.5 focus:outline-none focus:ring-1 ${
                  weightError ? 'border-red-400 focus:ring-red-400' : 'border-gray-300 focus:ring-gray-400'
                }`}
              />
              <span className={`px-2 py-0.5 text-sm border border-l-0 rounded-r-md bg-gray-50 ${
                weightError ? 'border-red-400 text-red-600' : 'border-gray-300 text-gray-600'
              }`}>%</span>
            </div>
            {weightError && <span className="text-[11px] text-red-500 ml-1">Min 10%</span>}
          </div>
        )}
      </div>

      <div className="p-4 space-y-4">

        {/* Flexible mode: locked notice replaces the add-skill input */}
        {mode === 'flexible' && isLocked ? (
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
              <span className="text-xs text-amber-700">Skills locked after cluster generation.</span>
            </div>
            {onResetClusters && (
              <button
                type="button"
                onClick={onResetClusters}
                className="text-xs font-medium text-amber-700 hover:text-amber-900 underline whitespace-nowrap"
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
                className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-1 ${
                  addSkillError ? 'border-red-300 focus:ring-red-400' : 'border-gray-200 focus:ring-gray-400'
                }`}
              />
              {addSkillError && (
                <p className="mt-1 text-[11px] text-red-500">{addSkillError}</p>
              )}
            </div>
            <button
              type="button"
              onClick={addSkill}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors"
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
                .sort((a, b) => b.priority - a.priority || (a.name ?? '').localeCompare(b.name ?? ''))
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
  onSelectedChange: (ids: string[]) => void;
  onBankAdd: (q: HRBankQuestion) => void;
}

function HRSection({ mode, enabled, questionCount, flexibleMinutes, percentage, onToggle, onPctChange, bankQuestions, selectedIds, onSelectedChange, onBankAdd }: HRSectionProps) {
  const [hrWeightError, setHrWeightError] = useState(false);
  const [addingQuestion, setAddingQuestion] = useState(false);
  const [newQText, setNewQText] = useState('');
  const [newQType, setNewQType] = useState<'text' | 'yes_no'>('text');
  const [savingQ, setSavingQ] = useState(false);
  const [questionError, setQuestionError] = useState('');

  const FLEX_HR_MIN = 3;
  const effectiveCount = mode === 'fixed' ? questionCount : FLEX_HR_MIN;
  const atLimit = effectiveCount > 0 && selectedIds.length >= effectiveCount;

  const toggleQuestion = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectedChange(selectedIds.filter(x => x !== id));
    } else {
      if (atLimit) return; // hard cap — cannot select more than allowed
      onSelectedChange([...selectedIds, id]);
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
      const res = await api.post('/hr-question-bank', { question_text: text, answer_type: newQType });
      const newQ: HRBankQuestion = { id: res.data.id, question_text: res.data.question_text, answer_type: res.data.answer_type, is_default: false };
      onBankAdd(newQ);
      // Auto-select only if within limit
      if (mode !== 'fixed' || selectedIds.length < questionCount) {
        onSelectedChange([...selectedIds, newQ.id]);
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
          {enabled && mode === 'fixed' && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-600 border border-blue-200">
              {questionCount} questions
            </span>
          )}
          {enabled && mode === 'flexible' && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-purple-50 text-purple-600 border border-purple-200">
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
                  const v = Math.min(100, parseInt(raw));
                  if (!isNaN(v) && v >= 0) {
                    setHrWeightError(v < 10);
                    onPctChange(v);
                  }
                }}
                onBlur={() => { if (percentage < 10) setHrWeightError(true); }}
                className={`w-14 text-center text-sm font-semibold border rounded-l-md px-1 py-0.5 focus:outline-none focus:ring-1 ${
                  hrWeightError ? 'border-red-400 focus:ring-red-400' : 'border-gray-300 focus:ring-gray-400'
                }`}
              />
              <span className={`px-2 py-0.5 text-sm border border-l-0 rounded-r-md bg-gray-50 ${
                hrWeightError ? 'border-red-400 text-red-600' : 'border-gray-300 text-gray-600'
              }`}>%</span>
            </div>
            {hrWeightError && <span className="text-[11px] text-red-500 ml-1">Min 10%</span>}
          </div>
        )}
      </div>

      {enabled && (
        <div className="p-4 space-y-3">

          {/* Question bank selection — both modes */}
          <>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-600">
                {mode === 'fixed'
                  ? `Select exactly ${effectiveCount} question${effectiveCount !== 1 ? 's' : ''} for Linda to ask`
                  : `Select at least ${effectiveCount} question${effectiveCount !== 1 ? 's' : ''} for Linda to ask`}
              </span>
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
                  return (
                  <label
                    key={q.id}
                    className={`flex items-start gap-2.5 p-2.5 rounded-lg border transition-colors ${
                      isSelected
                        ? 'border-blue-200 bg-blue-50 cursor-pointer'
                        : isDisabled
                          ? 'border-gray-100 bg-gray-50 opacity-40 cursor-not-allowed'
                          : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50 cursor-pointer'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isDisabled}
                      onChange={() => toggleQuestion(q.id)}
                      className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0 disabled:cursor-not-allowed"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-800 leading-relaxed">{q.question_text}</p>
                    </div>
                  </label>
                );})
              )}
            </div>
          </>

          {/* Add Question — available in both modes, persists to HR Question Bank */}
          {addingQuestion ? (
            <div className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
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
                className={`w-full text-xs border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 resize-none bg-white ${
                  questionError ? 'border-red-300 focus:ring-red-400' : 'border-gray-200 focus:ring-gray-400'
                }`}
              />
              {questionError && (
                <p className="text-[11px] text-red-500">{questionError}</p>
              )}
              <div className="flex items-center gap-2">
                <select
                  value={newQType}
                  onChange={e => setNewQType(e.target.value as 'text' | 'yes_no')}
                  className="text-xs border border-gray-200 rounded-md px-2 py-1 focus:outline-none bg-white"
                >
                  <option value="text">Text answer</option>
                  <option value="yes_no">Yes / No</option>
                </select>
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
                  className="flex items-center gap-1 text-xs bg-gray-900 text-white px-3 py-1.5 rounded-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingQ ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  Save
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddingQuestion(true)}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-dashed border-gray-300 rounded-lg px-3 py-2 w-full hover:border-gray-400 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Question
            </button>
          )}

          {/* Info */}
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
  const configId = searchParams.get('config_id'); // set when editing an existing config (any status)

  const [selectedJd, setSelectedJd] = useState<PublishedJD | null>(null);
  const [loadingJd, setLoadingJd] = useState(true);
  const existingDraftIdRef = useRef<string | null>(null); // track draft id for auto-save updates
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Interview mode */
  const [mode, setMode] = useState<InterviewMode>('fixed');
  /* Per-question time limit (timed mode only), in seconds */
  const [perQuestionSeconds, setPerQuestionSeconds] = useState<number>(120);

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

  /* Other settings */
  const [recordingEnabled, setRecordingEnabled] = useState(true);
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
  const [generatingClusters, setGeneratingClusters] = useState(false);

  /* ── Load JD + restore draft if one exists ── */
  useEffect(() => {
    if (!jdId) { router.replace('/recruitment/ai-interviews/jd-selection'); return; }
    const loadJD = async () => {
      try {
        setLoadingJd(true);

        // Load JD; if editing a specific config, fetch it directly instead of searching drafts
        const [jdResult, specificConfig] = await Promise.all([
          aiInterviewService.getPublishedJDs(),
          configId ? aiInterviewService.get(configId).catch(() => null) : Promise.resolve(null),
        ]);

        const jd = jdResult.items.find(j => j.id === jdId);
        if (!jd) {
          toast.error('Job description not found');
          router.replace('/recruitment/ai-interviews/jd-selection');
          return;
        }
        setSelectedJd(jd);

        // Look for an existing config: specific config_id takes priority, then search drafts by jd_id
        let existingDraft: AIInterviewResponse | null = specificConfig;
        if (!existingDraft) {
          const draftResult = await aiInterviewService.listConfigs({ status: 'draft', page_size: 50 }).catch(() => null);
          existingDraft = draftResult?.items?.find(
            (c: AIInterviewResponse) => c.jd_id === jdId && c.status === 'draft'
          ) ?? null;
        }

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
              enabled: nthRound.enabled !== false,
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
            if (hrRound.hr_questions?.length) {
              setHrSelectedIds(hrRound.hr_questions.map((q: any) => q.id));
            }
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

              // Restore per-question time limit
              if (parsed.per_question_seconds) {
                setPerQuestionSeconds(Number(parsed.per_question_seconds));
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
          } catch {
            // Silent — malformed special_instructions is non-critical
          }

        } else if (existingDraft) {
          // Config exists but has no rounds_config yet — still register the ID
          // so subsequent saves update it rather than creating a duplicate.
          existingDraftIdRef.current = existingDraft.id;
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
      setHrBankQuestions(data.map(q => ({
        id: q.id,
        question_text: q.question_text,
        answer_type: q.answer_type as 'text' | 'yes_no',
        is_default: q.is_default ?? false,
      })));
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
          duration_minutes: mode === 'flexible' ? 0 : totalFixed,
          rounds_config: rounds,
          recording_enabled: recordingEnabled,
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
  }, [mth, nth, hrPct, hrEnabled, mode, recordingEnabled, availableLanguages, introVideoUrl, selectedJd, loadingJd]);

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
  const flexMthMin = pctValid ? Math.round(mth.percentage / 100 * FLEXIBLE_TOTAL_MIN) : 0;
  const flexNthMin = pctValid && nth.enabled ? Math.round(nth.percentage / 100 * FLEXIBLE_TOTAL_MIN) : 0;
  const flexHrMin  = pctValid && hrEnabled   ? Math.round(hrPct / 100 * FLEXIBLE_TOTAL_MIN) : 0;

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
  const buildRounds = (isDraft = false): AIInterviewRoundConfig[] => {
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

    // MTH round
    {
      const jdSet = new Set((selectedJd?.must_have_skills || []).map(s => s.toLowerCase()));
      const jdSkills = mth.skills.filter(s => jdSet.has(s.name.toLowerCase())).map(s => s.name);
      const customSkills = mth.skills.filter(s => !jdSet.has(s.name.toLowerCase())).map(s => s.name);
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
      const jdSkills = nth.skills.filter(s => jdSet.has(s.name.toLowerCase())).map(s => s.name);
      const customSkills = nth.skills.filter(s => !jdSet.has(s.name.toLowerCase())).map(s => s.name);
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
        .map(q => ({ id: q!.id, question_text: q!.question_text, answer_type: q!.answer_type }));

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
    // Flexible mode: persist JD description so the Clusters page can send it to AI on re-generate
    jd_description: mode === 'flexible' ? (selectedJd?.description ?? '') : undefined,
    mth_clusters: mth.clusters,
    nth_clusters: nth.enabled ? nth.clusters : [], // don't persist NHS clusters when NHS is disabled
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
        duration_minutes: mode === 'flexible' ? 0 : totalFixed,
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

    isNavigatingRef.current = true;

    // 1. Save draft first
    const ok = await saveDraft(true);
    if (!ok || !existingDraftIdRef.current) {
      isNavigatingRef.current = false;
      toast.error('Please save your configuration first');
      return;
    }

    // 2. Generate clusters via API when skill lists don't fully match existing clusters.
    // Always regenerate when: (a) no clusters yet, (b) user added/removed/renamed skills,
    // (c) scenario changed (NHS toggled, HR toggled) — any of these leave skills unassigned.
    const currentMthSet = new Set(
      mth.skills.map(s => s.name.toLowerCase().trim()).filter(Boolean)
    );
    const currentNthSet = new Set(
      nth.enabled ? nth.skills.map(s => s.name.toLowerCase().trim()).filter(Boolean) : []
    );
    const clusteredMthSet = new Set(
      (mth.clusters ?? []).flatMap(c => (c.skills ?? []).map((s: string) => s.toLowerCase().trim()))
    );
    const clusteredNthSet = new Set(
      nth.enabled
        ? (nth.clusters ?? []).flatMap(c => (c.skills ?? []).map((s: string) => s.toLowerCase().trim()))
        : []
    );
    // Clusters match config when every current skill is covered AND counts are within limits
    const mthClustersMatch =
      mth.clusters.length > 0 &&
      mth.clusters.length <= effectiveMthMax &&
      currentMthSet.size > 0 &&
      [...currentMthSet].every(s => clusteredMthSet.has(s));
    const nthClustersMatch =
      !nth.enabled ||
      (nth.clusters.length > 0 &&
        nth.clusters.length <= effectiveNthMax &&
        currentNthSet.size > 0 &&
        [...currentNthSet].every(s => clusteredNthSet.has(s)));
    const needsRegeneration = !mthClustersMatch || !nthClustersMatch;

    if (needsRegeneration) {
      setGeneratingClusters(true);
      try {
        const mthSkillNames = mth.skills
          .map(s => s.name.trim())
          .filter(Boolean);
        const nthSkillNames = nth.enabled
          ? nth.skills.map(s => s.name.trim()).filter(Boolean)
          : [];

        if (mthSkillNames.length > 0 || nthSkillNames.length > 0) {
          const result = await aiInterviewService.generateClusters(
            mthSkillNames,
            nthSkillNames,
            selectedJd.title,
            selectedJd.description,
            fixedMthMin,
            nthSkillNames.length > 0 ? fixedNthMin : 0,
            effectiveMthMax,
            nthSkillNames.length > 0 ? effectiveNthMax : 0,
          );

          // Save generated clusters to the draft.
          // Hard-cap to scenario limits in case backend returns more than allowed.
          const siObj = JSON.parse(buildClusterJson());
          const mthMax = effectiveMthMax;
          const nthMax = effectiveNthMax;
          const rawMth = mthSkillNames.length > 0 ? result.mth_clusters : [];
          const rawNth = nthSkillNames.length > 0 ? result.nth_clusters : [];
          siObj.mth_clusters = (mthMax > 0 ? rawMth.slice(0, mthMax) : rawMth).map(c => ({
            ...c,
            priority: c.priority as Cluster['priority'],
            reason: c.reason || '',
          }));
          siObj.nth_clusters = (nthMax > 0 ? rawNth.slice(0, nthMax) : rawNth).map(c => ({
            ...c,
            priority: c.priority as Cluster['priority'],
            reason: c.reason || '',
          }));
          await aiInterviewService.update(existingDraftIdRef.current, {
            special_instructions: JSON.stringify(siObj),
          });
        }
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
                      <span className="font-semibold text-sm">Timed Mode — 30 min</span>
                    </div>
                    <p className={`text-xs ${mode === 'fixed' ? 'text-gray-300' : 'text-gray-500'}`}>
                      Candidate response time is capped. AI narration excluded.
                    </p>
                    <div className={`mt-2 text-[11px] space-y-0.5 ${mode === 'fixed' ? 'text-gray-400' : 'text-gray-400'}`}>
                      <div>Must-to-Have → {timedQDist.mth} questions</div>
                      {nth.enabled && <div>Nice-to-Have → {timedQDist.nth} questions</div>}
                      {hrEnabled && <div>HR Round → {timedQDist.hr} questions</div>}
                    </div>
                  </button>

                  {/* Flexible */}
                  <button
                    onClick={() => setMode('flexible')}
                    className={`relative flex flex-col gap-1 p-4 rounded-lg border-2 text-left transition-all ${
                      mode === 'flexible' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Timer className={`w-4 h-4 ${mode === 'flexible' ? 'text-white' : 'text-gray-600'}`} />
                      <span className="font-semibold text-sm">Conversational — 30 min</span>
                    </div>
                    <p className={`text-xs ${mode === 'flexible' ? 'text-gray-300' : 'text-gray-500'}`}>
                      No per-question timer. AI adapts based on candidate responses.
                    </p>
                    <div className={`mt-2 text-[11px] space-y-0.5 ${mode === 'flexible' ? 'text-gray-400' : 'text-gray-400'}`}>
                      <div>Must-to-Have → {mth.percentage}% weight</div>
                      {nth.enabled && <div>Nice-to-Have → {nth.percentage}% weight</div>}
                      {hrEnabled && <div>HR Round → {hrPct}% weight</div>}
                    </div>
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
              questionCount={timedQDist.mth}
              flexibleMinutes={flexMthMin}
              onChange={patch => setMth(prev => ({ ...prev, ...patch }))}
              onMoveSkill={mode === 'flexible' ? moveMthToNth : undefined}
              isLocked={flexSkillsLocked}
              onResetClusters={handleResetClusters}
              hideClustersView
            />

            {/* ── NTH ── */}
            <div className="border border-gray-200 rounded-lg bg-white">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={nth.enabled} onChange={() => {
                      const newNthEnabled = !nth.enabled;
                      setNth(prev => ({ ...prev, enabled: newNthEnabled }));
                      if (mode === 'flexible') {
                        const [newMth, newNth, newHr] = redistributeFlexPct(
                          mth.percentage, newNthEnabled, nth.percentage, hrEnabled, hrPct,
                        );
                        setMth(prev => ({ ...prev, percentage: newMth }));
                        if (newNthEnabled) setNth(prev => ({ ...prev, percentage: newNth }));
                        setHrPct(newHr);
                      }
                    }} className="sr-only peer" />
                    <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-gray-800 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
                  </label>
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <span className="font-semibold text-gray-900 text-sm">Nice-To-Have Skills</span>
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
                  const [newMth, newNth, newHr] = redistributeFlexPct(
                    mth.percentage, nth.enabled, nth.percentage, newHrEnabled, hrPct,
                  );
                  setMth(prev => ({ ...prev, percentage: newMth }));
                  if (nth.enabled) setNth(prev => ({ ...prev, percentage: newNth }));
                  setHrPct(newHr);
                }
              }}
              onPctChange={setHrPct}
              bankQuestions={hrBankQuestions}
              selectedIds={hrSelectedIds}
              onSelectedChange={setHrSelectedIds}
              onBankAdd={q => setHrBankQuestions(prev => [...prev, q])}
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
                <span className="text-xs text-gray-400">(Optional · max 1 min)</span>
              </div>
              <p className="text-xs text-gray-500">
                Upload or record a short video introducing the role. Candidates will see this before the interview starts.
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
                        className="p-1 text-gray-400 hover:text-gray-700 transition-colors"
                        title="Preview video"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                      <button onClick={handleRemoveVideo} className="p-1 text-gray-400 hover:text-red-500 transition-colors" title="Remove video">
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
                          ? 'bg-gray-900 text-white'
                          : 'bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Upload Video
                    </button>
                    <button
                      onClick={() => setVideoMode('record')}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors border-l border-gray-200 ${
                        videoMode === 'record'
                          ? 'bg-gray-900 text-white'
                          : 'bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <Camera className="w-3.5 h-3.5" />
                      Record Video
                    </button>
                  </div>

                  {videoMode === 'upload' ? (
                    <div>
                      <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-colors">
                        <Upload className="w-4 h-4 text-gray-400" />
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
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
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
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
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
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                          >
                            Re-record
                          </button>
                        )}
                        {cameraReady && !isRecording && (
                          <button
                            onClick={stopCamera}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
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

              {/* Add language – hidden */}
            </div>
          </div>

          {/* ── Right: Summary sidebar ── */}
          <div className="space-y-4">

            {/* Weightage distribution */}
            <div className="bg-white border border-gray-200 rounded-lg p-4 lg:sticky lg:top-6">
              <h3 className="font-semibold text-gray-900 text-sm mb-4">Configuration Summary</h3>

              {/* Job Details */}
              <div className="border border-gray-100 rounded-lg overflow-hidden mb-4">
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                  <span className="text-xs font-medium text-gray-500">Job Details</span>
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
                          <span key={kw} className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-700">{kw}</span>
                        ))}
                        {selectedJd.domain_keywords.length > 6 && (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-500">+{selectedJd.domain_keywords.length - 6}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Fixed mode: question budget + time allocation (combined) */}
              {mode === 'fixed' && (
                <div className="space-y-3 mb-4">
                  <div className="border border-gray-100 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-500">Question Budget (Total: 15)</span>
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
                    <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-100">
                      <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                      <p className="text-[11px] text-red-600">Weights must total 100%. Adjust the percentages above.</p>
                    </div>
                  )}
                  {pctValid && (
                    <div className="border border-gray-100 rounded-lg overflow-hidden">
                      <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                        <span className="text-xs font-medium text-gray-500">Time Allocation (30 min total)</span>
                      </div>
                      <table className="w-full text-xs">
                        <tbody>
                          <tr className="border-b border-gray-50">
                            <td className="px-3 py-2 text-gray-600">Must-to-Have</td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-900">~{flexMthMin} min</td>
                          </tr>
                          {nth.enabled && (
                            <tr className="border-b border-gray-50">
                              <td className="px-3 py-2 text-gray-600">Nice-to-Have</td>
                              <td className="px-3 py-2 text-right font-semibold text-gray-900">~{flexNthMin} min</td>
                            </tr>
                          )}
                          {hrEnabled && (
                            <tr>
                              <td className="px-3 py-2 text-gray-600">HR Round</td>
                              <td className="px-3 py-2 text-right font-semibold text-gray-900">~{flexHrMin} min</td>
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
                <button
                  onClick={handleContinueToClusters}
                  disabled={(mode === 'flexible' && !pctValid) || savingDraft || generatingClusters}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 text-sm rounded-lg transition-colors ${
                    (mode === 'flexible' ? pctValid : true) && !savingDraft && !generatingClusters
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

      {/* Video Preview Dialog */}
      <Dialog open={showVideoPreview} onOpenChange={setShowVideoPreview}>
        <DialogContent className="sm:max-w-2xl p-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="text-sm font-semibold">Video Preview</DialogTitle>
            <DialogDescription className="text-xs text-gray-500">Introduction video for candidates</DialogDescription>
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
