'use client';

import { handoffContinueLabel, resolveInviteHandoffOrigin, useHandoffCandidateCrumb } from '@/lib/utils/resumeScoringInviteHandoff';
import {
  Clock, Plus, X, Sparkles, CheckCircle2, Loader2,
  Users, Brain, Shield, Globe, Save, ChevronDown, ChevronUp,
  MessageSquare, Info, AlertCircle, Timer, Zap,
  Video, Upload, Layers, ChevronRight, Camera, Play,
  Lock, ArrowRightLeft, Mic, QrCode, Eye, ArrowLeft, ClipboardList,
  Trash2, Settings2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import LeaveInterviewDialog, { type LeaveInterviewBusy } from './LeaveInterviewDialog';
import InterviewEditLockGate from './InterviewEditLockGate';
import { useEmbeddedWizard, useWizardRouter, useWizardSearchParams, WizardLayer } from './embeddedWizardNav';
import { aiInterviewService, isJdDisabled, JD_DISABLED_ACTION_MESSAGE } from '@/lib/services/aiInterviewService';
import { loadAllInterviewConfigs } from '@/components/talent-match-invite/inviteVersions';
import { interviewVersionOrdinal } from '@/lib/utils/aiInterviewVersion';
import { Button } from '@/components/ui/button';
import type {
  PublishedJD,
  AIInterviewRoundConfig,
  AIInterviewResponse,
  AIInterviewHRQuestionStage,
  SkillDuplicateFinding,
} from '@/lib/services/aiInterviewService';
import api from '@/lib/services/api';
import { toast } from 'sonner';
import { useAuth } from '@/components/providers/AuthProvider';
import PermissionLockedOverlay from '@/components/shared/PermissionLockedOverlay';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import FilterSelect from '@/components/ui/filter-select';
import { getPriorityLabel } from '@/lib/constants/aiInterviewPriority';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { modeFromConfig, durationFromMode } from '@/lib/constants/aiInterviewMode';
import { STT_MODELS, DEFAULT_STT_MODEL } from '@/lib/constants/aiInterviewSttModels';
import { PROXY_INTEGRITY_VERIFICATION_ENABLED } from '@/lib/constants/featureFlags';
import { AIInterviewStepIndicator, useBreadcrumbOffset } from './AIInterviewStepIndicator';
import AIInterviewFlowLoader from './AIInterviewFlowLoader';
import { SectionHeader, SummaryLocation } from './ConfigSummary';
import WizardDiscardButton from './WizardDiscardButton';
import { markUnsavedVersion, isUnsavedVersion } from '@/lib/utils/aiInterviewDraftResume';
import {
  clearStaging, hasPendingThisVisit, markStaging, shouldAnnounceRestoredEdits,
} from '@/lib/utils/aiInterviewEditSession';
import { deleteWizardConfig, discardWizardChanges, keepWizardChanges } from '@/lib/utils/aiInterviewWizardExit';
import { formatIST } from '@/lib/utils/dateUtils';
import JobOpeningSummary from '@/components/jobs/JobOpeningSummary';
import JDFullViewModal from '@/components/jobs/JDFullViewModal';
import { publishedJdToJob } from '@/lib/utils/publishedJdToJob';
import { useJdLocations } from '@/hooks/useJdLocations';
import { formatEmploymentType, formatIndustryType } from '@/lib/utils/jobOpeningDisplay';
import {
  closestDuplicate,
  findInvalidSkillPunctuation,
  normalizeSkillName as normalizeSkillNameShared,
} from '@/lib/skillDuplicates';

/* ─────────────────────────────────────────────────────────────────────── */
/*  Step indicator constants                                               */
/* ─────────────────────────────────────────────────────────────────────── */
const CURRENT_STEP = 2 as const;

/* The languages the AI interviewer can run an interview in. English is the
   only one live today; the list is what a second language gets added to. */
const CANDIDATE_LANGUAGES = ['English'] as const;

/* The tabs of the Additional Settings card. Proxy verification is behind its
   feature flag, so the tab only exists where the panel does. */
type AdditionalSettingTab = 'video' | 'languages' | 'proxy';
const ADDITIONAL_SETTING_TABS: { key: AdditionalSettingTab; label: string; icon: LucideIcon }[] = [
  { key: 'video', label: 'Introduction Video', icon: Video },
  { key: 'languages', label: 'Candidate Languages', icon: Globe },
  ...(PROXY_INTEGRITY_VERIFICATION_ENABLED
    ? [{ key: 'proxy' as const, label: 'Proxy Integrity', icon: QrCode }]
    : []),
];

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
    <span className={`inline-flex items-center px-2 py-0.5 text-2xs font-medium rounded-full border ${color}`}>
      {label}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  Skill section (MTH or NTH)                                             */
/* ─────────────────────────────────────────────────────────────────────── */

interface SkillSectionProps {
  title: string;
  /** One line under the title saying what the bucket is for. */
  subtitle?: string;
  category: 'mth' | 'nth';
  config: CategoryConfig;
  jdSkillNames: string[];   // original from JD (read-only label)
  mode: InterviewMode;
  questionCount: number;
  flexibleMinutes: number;
  onChange: (updated: Partial<CategoryConfig>) => void;
  /** Skill names in the OTHER bucket (MTH↔NTH). Used to block adding a skill
   *  here that already exists (exactly or semantically) in the other section —
   *  a skill must live in exactly one bucket. */
  otherBucketSkills?: string[];
  /** JD id, so the duplicate check resolves the industry server-side and
   *  judges skills inside the right domain (multi-industry platform). */
  jdId?: string;
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

function SkillSection({ title, subtitle, category, config, jdSkillNames, mode, questionCount, flexibleMinutes, onChange, otherBucketSkills = [], onMoveSkill, isLocked = false, onResetClusters, hideClustersView = false, jdId }: SkillSectionProps) {
  const [commentOpen, setCommentOpen] = useState<string | null>(null);
  const [collapsedClusters, setCollapsedClusters] = useState<Set<string>>(new Set());
  const [skillToDelete, setSkillToDelete] = useState<string | null>(null);
  const [weightError, setWeightError] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');
  const [addSkillError, setAddSkillError] = useState('');
  // Skill name the recruiter has been warned about once, on a MEDIUM-confidence
  // duplicate match. Pressing Add again with the same text keeps both skills —
  // the escape hatch for pairs only the recruiter can adjudicate (e.g. whether
  // "Selenium" and "Selenium WebDriver" are one skill or two). Cleared on any
  // successful add and whenever the input text changes.
  const [pendingOverride, setPendingOverride] = useState<string | null>(null);

  const jdSet = new Set(jdSkillNames.map(s => s.toLowerCase()));
  const color = category === 'mth'
    ? { tag: 'bg-brand-blue/10 text-brand-blue border-brand-blue/20', accent: 'text-brand-blue' }
    : { tag: 'bg-brand-cyan/10 text-brand-cyan border-brand-cyan/20', accent: 'text-brand-cyan' };

  // hideClustersView: clusters are kept in state for save integrity but not rendered here
  const hasClusters = !hideClustersView && config.clusters.length > 0;

  // Find skills not assigned to any cluster
  const assignedSkillSet = new Set(config.clusters.flatMap(c => c.skills.map(s => s.toLowerCase())));
  const unclusteredSkills = config.skills.filter(s => !assignedSkillSet.has(s.name.toLowerCase()));
  // Skill-name normalisation + the duplicate matcher now live in
  // `lib/skillDuplicates.ts`, shared with the Clusters page. They used to be
  // component-local here, which is why the Clusters page had no semantic guard
  // at all and accepted "Software development life cycle" next to "SDLC and
  // STLC Knowledge". One implementation, verified against the backend's table.
  const normalizeSkillName = (name: string) => normalizeSkillNameShared(name);
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

  const addSkill = async () => {
    const trimmed = newSkillName.trim().replace(/\s+/g, ' ');
    if (!trimmed) {
      setAddSkillError('Enter a skill name');
      return;
    }

    // Reject decorative punctuation before anything else runs — a trailing
    // "." or "!" etc. doesn't change what skill is meant, but letting it
    // through made duplicate detection inconsistent (the same skill was
    // caught or missed purely based on whether it had one). Blocking it here
    // is clearer than silently stripping it: the recruiter sees why.
    const invalidChar = findInvalidSkillPunctuation(trimmed);
    if (invalidChar) {
      const msg = `"${invalidChar}" is not allowed in a skill name — use letters, numbers and spaces only`;
      setAddSkillError(msg);
      toast.error(msg);
      return;
    }

    const normalized = normalizeSkillName(trimmed);
    const exists = config.skills.some(skill => normalizeSkillName(skill.name) === normalized);
    if (exists) {
      setAddSkillError('This skill already exists');
      toast.error('Duplicate skills are not allowed');
      return;
    }

    // Semantic-duplicate guard (2026-08-01): block a skill that means the SAME
    // thing as an existing one worded differently — e.g. adding "Java Programming"
    // when "Java" is already present. Otherwise both would flow into cluster
    // generation as separate skills (duplicate skill mapping). Names the existing
    // skill so the recruiter knows why it was rejected.
    //
    // HIGH-confidence matches (identical / punctuation-only / acronym of the same
    // term / same tokens) are settled here and cost no round trip. MEDIUM used to
    // be settled here too, as a warning with an override — but a judgement the
    // recruiter could legitimately disagree with is exactly the case the backend
    // now has a proper answer for (2026-09-05), and it can see synonyms this
    // client cannot. So a medium match no longer short-circuits: it is held as the
    // FALLBACK question in case the backend cannot be reached, and the backend's
    // three-way verdict is used when it can.
    const overriding = !!pendingOverride && normalizeSkillName(pendingOverride) === normalized;
    const similar = closestDuplicate(config.skills, s => s.name, trimmed);
    if (similar && similar.tier !== 'medium' && !overriding) {
      const msg = `"${trimmed}" looks like the existing skill "${similar.item.name}" (${similar.reason})`;
      setAddSkillError(msg);
      setPendingOverride(null);
      toast.error(msg);
      return;
    }

    // CROSS-BUCKET guard (2026-08-01): a skill must live in exactly ONE section.
    // Block adding here a skill that already exists (exactly or semantically) in
    // the OTHER bucket — e.g. adding "Java" to Nice-to-Have when "Java" is a
    // Must-Have skill. Without this, both survive into cluster generation as a
    // cross-bucket duplicate.
    const otherLabel = category === 'mth' ? 'Nice-to-Have' : 'Must-Have';
    const crossHit = closestDuplicate(otherBucketSkills || [], s => s, trimmed);
    const crossDup = crossHit?.item
      ?? (otherBucketSkills || []).find(s => normalizeSkillName(s) === normalized);
    if (crossDup) {
      const msg = `"${trimmed}" is already in the ${otherLabel} section (as "${crossDup}") — a skill can only be in one section`;
      setAddSkillError(msg);
      toast.error(msg);
      return;
    }

    // No LLM call on add (2026-09-23). Meaning-level duplicates ("Data Analytics"
    // vs "Data Analysis") are removed once, on Continue, by /generate-clusters'
    // gpt-4o dedup pass over the whole list — so adding a skill here costs no
    // round trip. A MEDIUM-confidence local match is still put to the recruiter.
    if (similar && !overriding) {
      const msg = `"${trimmed}" looks like the existing skill "${similar.item.name}" (${similar.reason}). Add it as a separate skill?`;
      setAddSkillError(msg);
      setPendingOverride(trimmed);
      toast.warning(`${msg} Press Add again to keep both.`);
      return;
    }
    setPendingOverride(null);

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
        <div className="flex items-center gap-2 min-w-0">
          <span className={`flex-1 min-w-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border break-words ${
            fromJd ? color.tag : 'bg-advice-positive-bg text-advice-positive border-advice-positive/25'
          }`}>
            {skill.name}
            {fromJd && <span className="text-2xs opacity-60">JD</span>}
          </span>
          <FilterSelect
            value={skillType}
            onChange={v => updateSkillType(skill.name, v as SkillType)}
            ariaLabel={`${skill.name} type`}
            className={`w-auto sm:w-auto flex-shrink-0 gap-0.5 text-2xs font-medium px-1.5 sm:px-1.5 py-0.5 sm:py-0.5 rounded sm:rounded [&>svg]:size-3 ${SKILL_TYPE_COLORS[skillType]}`}
            options={[
              { value: 'Skill', label: 'Skill' },
              { value: 'Command', label: 'Command' },
            ]}
          />
          {/* Flexible mode: move skill to the other category */}
          {mode === 'flexible' && onMoveSkill && !isLocked && (
            <button
              title={category === 'mth' ? 'Move to Nice-to-Have' : 'Move to Must-Have'}
              onClick={() => onMoveSkill(skill.name)}
              className="p-1 text-gray-400 hover:text-brand-blue transition-colors flex-shrink-0"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
            </button>
          )}
          {/* Hide delete when locked in flexible mode.
              Always drawn, never hover-revealed: a control that appears only
              once the pointer is over its row is invisible to anyone scanning
              the list, and on touch there is no hover to reveal it with. */}
          {!(mode === 'flexible' && isLocked) && (
            <button
              onClick={() => setSkillToDelete(skill.name)}
              className="p-1 text-gray-400 hover:text-destructive transition-colors flex-shrink-0"
              title={`Remove ${skill.name}`}
              aria-label={`Remove ${skill.name}`}
            >
              <Trash2 className="w-4 h-4" />
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
              className="p-1 text-gray-400 hover:text-destructive transition-colors flex-shrink-0"
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
      {/* Header — skipped entirely when a host card draws its own (the
          Nice-to-Have wrapper does), so the card does not open with an empty
          bordered strip. */}
      <div className={`flex flex-wrap items-start justify-between gap-3 px-4 ${
        title || mode === 'flexible' ? 'py-3 border-b border-gray-100' : 'py-0'
      }`}>
        {/* `title` is empty when a host card draws its own heading (the
            Nice-to-Have wrapper does), and then this row carries only the
            chips — an icon tile beside a blank line read as a rendering bug. */}
        {title ? (
          <SectionHeader
            icon={Brain}
            title={title}
            subtitle={subtitle}
            tone={category === 'mth' ? 'blue' : 'cyan'}
            trailing={
              mode === 'fixed' ? (
                <span className="px-2 py-0.5 text-xs rounded-full bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">
                  {questionCount} questions
                </span>
              ) : (
                <span className="px-2 py-0.5 text-xs rounded-full bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20">
                  ~{flexibleMinutes} min
                </span>
              )
            }
          />
        ) : (
          <span />
        )}
        {mode === 'flexible' && (
          /* Own right-aligned line below sm: beside the title the Weight label
             crowded into the subtitle column on a phone. */
          <div className="flex flex-wrap items-center justify-end gap-1.5 flex-shrink-0 w-full sm:w-auto">
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
                  weightError ? 'border-destructive focus:ring-destructive-line' : 'border-gray-200 focus:ring-brand-blue/40 focus:border-brand-blue'
                }`}
              />
              <span className={`px-2 py-0.5 text-sm border border-l-0 rounded-r-md bg-slate-50 ${
                weightError ? 'border-destructive text-destructive' : 'border-gray-200 text-gray-600'
              }`}>%</span>
            </div>
            {weightError && <span className="text-2xs text-destructive ml-1">Min 10%</span>}
          </div>
        )}
      </div>

      <div className="p-4 space-y-4">

        {/* Inline warning when all entries are Command — the
            interview needs at least one type "Skill" to assess as a competency. */}
        {config.skills.length > 0 && !config.skills.some(s => (s.type ?? 'Skill') === 'Skill') && (
          <div className="flex items-start gap-2 px-3 py-2 bg-destructive-subtle border border-destructive-line rounded-lg">
            <AlertCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">
              Add at least one entry of type <strong>Skill</strong> here.
              All current entries are Commands, which can&apos;t be assessed as a standalone competency.
            </p>
          </div>
        )}

        {/* Flexible mode: locked notice replaces the add-skill input */}
        {mode === 'flexible' && isLocked ? (
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 bg-gradient-to-r from-brand-orange/5 via-white to-brand-orange/5 border border-brand-orange/20 ring-1 ring-brand-orange/10 rounded-lg shadow-sm shadow-brand-orange/5">
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
            <div className="flex-1 min-w-0">
              <input
                value={newSkillName}
                onChange={(e) => {
                  setNewSkillName(e.target.value);
                  if (addSkillError) setAddSkillError('');
                  // Editing the text invalidates a pending "press Add again"
                  // confirmation — it applied to the previous name only.
                  if (pendingOverride) setPendingOverride(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addSkill();
                  }
                }}
                placeholder={category === 'mth' ? 'Add a must-have skill' : 'Add a nice-to-have skill'}
                className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 ${
                  addSkillError
                    ? (pendingOverride
                        ? 'border-warning-line focus:ring-warning-line'
                        : 'border-destructive-line focus:ring-destructive-line')
                    : 'border-gray-200 focus:ring-brand-blue/40 focus:border-brand-blue'
                }`}
              />
              {addSkillError && (
                // Amber + an explicit instruction while an override is pending —
                // the toast vanishes, so the actionable hint has to live here.
                <p className={`mt-1 text-2xs ${pendingOverride ? 'text-warning' : 'text-destructive'}`}>
                  {addSkillError}
                  {pendingOverride && (
                    <span className="font-medium"> — press Add again to keep both.</span>
                  )}
                </p>
              )}
            </div>
            <Button
              variant="primary"
              size="md"
              onClick={addSkill}
              icon={<Plus className="w-4 h-4" />}
            >
              Add
            </Button>
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
                        <span className="flex-1 min-w-0 text-sm font-medium text-gray-800 break-words">{cluster.name || 'Unnamed Topic'}</span>
                        <PriorityBadge p={cluster.priority} />
                        <span className="text-2xs text-gray-400">{clusterSkills.length} skill{clusterSkills.length !== 1 ? 's' : ''}</span>
                      </button>

                      {/* Cluster body */}
                      {!isCollapsed && (
                        <div className="px-3 py-2.5 space-y-1.5 border-t border-gray-100">
                          {cluster.reason && (
                            <p className="text-2xs text-gray-500 italic mb-1">{cluster.reason}</p>
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
                    <span className="text-2xs text-brand-orange">{unclusteredSkills.length} skill{unclusteredSkills.length !== 1 ? 's' : ''}</span>
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
  selectedTypeOverrides: Record<string, 'text' | 'yes_no'>;
  onSelectedChange: (ids: string[]) => void;
  onSelectedStagesChange: (stages: Record<string, HRQuestionStage>) => void;
  onSelectedTypeOverridesChange: (overrides: Record<string, 'text' | 'yes_no'>) => void;
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
  selectedTypeOverrides,
  onSelectedChange,
  onSelectedStagesChange,
  onSelectedTypeOverridesChange,
  onBankAdd,
}: HRSectionProps) {
  // "HR Question Bank Add" under AI Interview (Roles & Permissions) — same
  // gate Assessment's builder uses with assessments:add_question.
  const { isTenantAdmin, hasPermissionCode } = useAuth();
  const canAddQuestion = isTenantAdmin || hasPermissionCode('ai_interview:add_question');
  // "HR Question Bank View" under AI Interview: shows the bank's questions to pick from.
  const canViewQuestionBank = isTenantAdmin || hasPermissionCode('ai_interview:view_question_bank');
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

  // Per-interview answer-type override — does NOT write to the HR Question
  // Bank. Only changes what gets saved into this interview's own config.
  const setQuestionTypeOverride = (id: string, type: 'text' | 'yes_no') => {
    onSelectedTypeOverridesChange({
      ...selectedTypeOverrides,
      [id]: type,
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
    if (!canAddQuestion) {
      toast.error('You do not have permission to add questions');
      return;
    }
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
    /* The same card on or off, as the Nice-To-Have Skills section — off is
       told by the switch and the hidden body, not by greying the card. */
    <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 border-b border-gray-100">
        <SectionHeader
          icon={Users}
          title="HR Round"
          subtitle="Non-technical questions Bina asks alongside the technical rounds."
          leading={
            /* The switch's knob is positioned against this label, so the label
               itself carries no padding — an offset here moved the knob out of
               its own track. Vertical alignment lives on the wrapper. */
            <span className="flex items-center h-10 flex-shrink-0">
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={enabled} onChange={onToggle} className="sr-only peer" />
                <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-gradient-to-r peer-checked:from-brand-blue peer-checked:to-brand-blue-2 peer-checked:shadow-sm peer-checked:shadow-brand-blue/25 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
              </label>
            </span>
          }
          trailing={
            <>
              <span className="px-2 py-0.5 text-2xs rounded-full bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 font-medium">
                Qualitative Only — Non-Scoring
              </span>
              {enabled && mode === 'fixed' && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">
                  {questionCount} questions
                </span>
              )}
              {enabled && mode === 'flexible' && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20">
                  ~{flexibleMinutes} min
                </span>
              )}
            </>
          }
        />
        {enabled && mode === 'flexible' && (
          <div className="flex flex-wrap items-center gap-1.5 flex-shrink-0">
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
                  hrWeightError ? 'border-destructive focus:ring-destructive-line' : 'border-gray-200 focus:ring-brand-blue/40 focus:border-brand-blue'
                }`}
              />
              <span className={`px-2 py-0.5 text-sm border border-l-0 rounded-r-md bg-slate-50 ${
                hrWeightError ? 'border-destructive text-destructive' : 'border-gray-200 text-gray-600'
              }`}>%</span>
            </div>
            {hrWeightError && <span className="text-2xs text-destructive ml-1">HR round must be at least 10%</span>}
          </div>
        )}
      </div>

      {enabled && (
        <div className="p-4 space-y-3">

          {/* Question bank selection — both modes */}
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5 min-w-0">
                <span className="block text-xs font-medium text-gray-600">
                  {mode === 'fixed'
                    ? `Select exactly ${effectiveCount} question${effectiveCount !== 1 ? 's' : ''} for Bina to ask`
                    : `Select at least ${effectiveCount} question${effectiveCount !== 1 ? 's' : ''} for Bina to ask`}
                </span>
                <span className="block text-2xs text-gray-400">
                  Closing is the default tag. Mark any question as Opening to ask it before the technical rounds; Closing questions are asked at the end.
                </span>
              </div>
              <span className={`text-xs font-semibold whitespace-nowrap flex-shrink-0 ${selectedIds.length >= effectiveCount ? 'text-advice-positive' : 'text-gray-500'}`}>
                {selectedIds.length} / {effectiveCount} selected
              </span>
            </div>

            {/* Limit reached banner */}
            {atLimit && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-advice-positive-bg border border-advice-positive/25">
                <AlertCircle className="w-3.5 h-3.5 text-advice-positive flex-shrink-0 mt-0.5" />
                <p className="text-2xs text-advice-positive">
                  {effectiveCount} question{effectiveCount !== 1 ? 's' : ''} selected — limit reached. Deselect a question to choose a different one.
                </p>
              </div>
            )}

            {/* Question list — without "HR Question Bank View" it stays visible
                but greyed and unclickable, with the reason on hover. */}
            <PermissionLockedOverlay locked={!canViewQuestionBank} message='You do not have permission to view the HR Question Bank'>
            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {bankQuestions.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">No questions in the bank yet. Add your first question below.</p>
              ) : (
                bankQuestions.map(q => {
                  const isSelected = selectedIds.includes(q.id);
                  const isDisabled = atLimit && !isSelected;
                  const selectedStage = selectedStages[q.id] ?? 'closing';
                  // Effective type for THIS interview: override wins, else the
                  // bank's own value (today's behavior, unchanged).
                  const effectiveType = selectedTypeOverrides[q.id] ?? q.answer_type;
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
                      <p className="text-xs text-gray-800 leading-relaxed break-words">{q.question_text}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-2xs font-semibold uppercase tracking-wide text-gray-400">Ask As</span>
                        <div className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white p-1">
                          <button
                            type="button"
                            aria-pressed={selectedStage === 'opening'}
                            onClick={e => {
                              e.preventDefault();
                              e.stopPropagation();
                              setQuestionStage(q.id, 'opening');
                            }}
                            className={`px-2.5 py-1 rounded-full text-2xs font-medium transition-colors ${
                              selectedStage === 'opening'
                                /* Dark mode flips --advice-positive to a light
                                   green, where white text would wash out — the
                                   label goes dark there instead. */
                                ? 'bg-advice-positive text-white dark:text-gray-900 shadow-sm ring-1 ring-advice-positive/40'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
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
                            className={`px-2.5 py-1 rounded-full text-2xs font-medium transition-colors ${
                              selectedStage === 'closing'
                                /* Dark mode flips --advice-positive to a light
                                   green, where white text would wash out — the
                                   label goes dark there instead. */
                                ? 'bg-advice-positive text-white dark:text-gray-900 shadow-sm ring-1 ring-advice-positive/40'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                          >
                            Closing
                          </button>
                        </div>
                        <span className="text-2xs font-semibold uppercase tracking-wide text-gray-400">Answer Type</span>
                        <div className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white p-1">
                          <button
                            type="button"
                            aria-pressed={effectiveType === 'text'}
                            title="Candidate answers in their own words (spoken)"
                            onClick={e => {
                              e.preventDefault();
                              e.stopPropagation();
                              setQuestionTypeOverride(q.id, 'text');
                            }}
                            className={`px-2.5 py-1 rounded-full text-2xs font-medium transition-colors ${
                              effectiveType === 'text'
                                ? 'bg-brand-blue text-white shadow-sm ring-1 ring-brand-blue/40'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                          >
                            Voice
                          </button>
                          <button
                            type="button"
                            aria-pressed={effectiveType === 'yes_no'}
                            title="Candidate picks Yes / No / Need to Explain More"
                            onClick={e => {
                              e.preventDefault();
                              e.stopPropagation();
                              setQuestionTypeOverride(q.id, 'yes_no');
                            }}
                            className={`px-2.5 py-1 rounded-full text-2xs font-medium transition-colors ${
                              effectiveType === 'yes_no'
                                ? 'bg-brand-blue text-white shadow-sm ring-1 ring-brand-blue/40'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                          >
                            Yes/No
                          </button>
                        </div>
                        {selectedTypeOverrides[q.id] && selectedTypeOverrides[q.id] !== q.answer_type && (
                          <span className="text-2xs text-brand-blue" title="Only applies to this interview — the shared HR Question Bank entry is unchanged">
                            Set for this interview only
                          </span>
                        )}
                        {!isSelected && (
                          <span className="text-2xs text-gray-400">Select the question to include it in the interview.</span>
                        )}
                      </div>
                    </div>
                  </label>
                );})
              )}
            </div>
            </PermissionLockedOverlay>
          </>

          {/* Add Question — available in both modes, persists to HR Question Bank */}
          {addingQuestion ? (
            <div className="border border-gray-100 rounded-lg p-3 space-y-2 bg-slate-50 ring-1 ring-black/[0.02]">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                <span className="text-xs font-medium text-gray-700">Add Question To HR Question Bank</span>
                <span className="text-2xs text-gray-400">Saved to database</span>
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
                  questionError ? 'border-destructive-line focus:ring-destructive-line' : 'border-gray-200 focus:ring-brand-blue/40 focus:border-brand-blue'
                }`}
              />
              {questionError && (
                <p className="text-2xs text-destructive">{questionError}</p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-2xs font-semibold uppercase tracking-wide text-gray-400">Answer Type</span>
                <div className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white p-1">
                  <button
                    type="button"
                    aria-pressed={newQType === 'text'}
                    onClick={() => setNewQType('text')}
                    title="Candidate answers in their own words (spoken)"
                    className={`px-2.5 py-1 rounded-full text-2xs font-medium transition-colors ${
                      newQType === 'text'
                        ? 'bg-brand-blue text-white shadow-sm ring-1 ring-brand-blue/40'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    Voice
                  </button>
                  <button
                    type="button"
                    aria-pressed={newQType === 'yes_no'}
                    onClick={() => setNewQType('yes_no')}
                    className={`px-2.5 py-1 rounded-full text-2xs font-medium transition-colors ${
                      newQType === 'yes_no'
                        ? 'bg-brand-blue text-white shadow-sm ring-1 ring-brand-blue/40'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    Yes/No
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1" />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setAddingQuestion(false);
                    setNewQText('');
                    setNewQType('text');
                    setQuestionError('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={saveNewQuestion}
                  disabled={savingQ || !newQText.trim()}
                  icon={savingQ ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                >
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => {
                if (!canAddQuestion) return;
                setAddingQuestion(true);
              }}
              aria-disabled={!canAddQuestion}
              title={!canAddQuestion ? 'You do not have permission to add questions' : undefined}
              className={`flex items-center gap-1.5 text-xs border border-dashed border-gray-300 rounded-lg px-3 py-2 w-full transition-colors ${canAddQuestion ? 'text-gray-500 hover:text-brand-blue hover:border-brand-blue/40 hover:bg-brand-blue/5' : 'text-gray-400 cursor-not-allowed opacity-60'}`}
            >
              <Plus className="w-3.5 h-3.5" />
              Add Question
            </button>
          )}

          {/* Info */}
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-brand-orange/5 via-white to-brand-orange/5 border border-brand-orange/20 ring-1 ring-brand-orange/10 shadow-sm shadow-brand-orange/5">
            <Info className="w-3.5 h-3.5 text-brand-orange flex-shrink-0 mt-0.5" />
            <p className="text-2xs text-brand-orange-deep">
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
  const router = useWizardRouter();
  const searchParams = useWizardSearchParams();
  /* Run inside the Create / Send AI Interview popup (AIInterviewWizardDialog). */
  const wizardNav = useEmbeddedWizard();
  const embedded = !!wizardNav;
  const jdId = searchParams.get('jd_id');
  const configId = searchParams.get('config_id'); // set when editing an existing config (any status)
  // Set when the flow was entered from a JD's Job Details page. Keeps the
  // breadcrumb anchored to that job instead of resetting to the AI Interviews
  // trail, and must be carried onto every later step in the flow.
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

  const [selectedJd, setSelectedJd] = useState<PublishedJD | null>(null);
  const selectedJdLocations = useJdLocations(selectedJd?.id);
  const [loadingJd, setLoadingJd] = useState(true);
  // Set when loadJD decides to navigate elsewhere, so the loader stays on screen
  // through the handoff instead of flashing an empty page.
  const [redirecting, setRedirecting] = useState(false);
  const loadedStatusRef = useRef<string | null>(null); // status of the config this page opened (published → editing a live version)
  /* The same facts about the config on screen, as state, for what the leave
     prompt renders (refs cannot be read while rendering): its id once one
     exists, status, V-number, and whether candidates were invited to it. */
  const [loadedConfig, setLoadedConfig] = useState<{
    id: string; status: string | null; version: number; invited: boolean;
  } | null>(null);
  /* Pending edits the config already had when this step loaded it (an earlier,
     unfinished edit — or this visit's, from Clusters). Leaving then asks. */
  const pendingOnLoadRef = useRef(false);
  const existingDraftIdRef = useRef<string | null>(null); // track draft id for auto-save updates
  /* True while editing a DUPLICATED version's draft (V2+, minted by Duplicate /
     New version). Its JD and job version were fixed when it was cloned, so the
     wizard's "Back to JD" — which leads to picking a different job — is not
     offered for it. A fresh interview's V1 draft and every other flow keep it. */
  const [editingDuplicatedDraft, setEditingDuplicatedDraft] = useState(false);
  /* The V-number of the draft on screen while it is still UNSAVED — the
     version Duplicate just minted, or a new interview's first draft reopened
     from Clusters — or null (see lib/utils/aiInterviewUnsavedVersion). Discard
     deletes an unsaved version, and the prompt says so. */
  const [unsavedVersionNumber, setUnsavedVersionNumber] = useState<number | null>(null);
  // True only when existingDraftIdRef was populated from a draft that already
  // existed before this page loaded (resumed via "Continue Editing" / found by
  // jd_id) — as opposed to one `ensureDraftId` creates fresh during this
  // session. Discard must delete the latter (nothing to go back to) but never
  // the former, or resuming a saved draft and discarding an in-session edit
  // deletes the recruiter's actual saved work, not just the edit.
  const draftExistedOnLoadRef = useRef(false);
  // In-flight POST /ai-interview/ for this wizard, shared by every path that
  // may need the draft to exist. See ensureDraftId.
  const draftCreateRef = useRef<Promise<string> | null>(null);
  /**
   * The id of this wizard's draft, creating it once if it does not exist yet.
   *
   * Three paths can need the draft: the `saveDraft()` callers (Save Draft,
   * Continue to clusters, and the unsaved-changes dialog). (A 2s debounced
   * auto-save used to be a fourth; it was removed so Discard can drop edits.) All of them used to do `if (existingDraftIdRef.current)
   * update() else create()` — but that ref is only assigned AFTER `await
   * create(...)` resolves, so the check and the assignment straddle an await.
   * Edit a field and click Continue within the same couple of seconds and both
   * paths read a null ref and both POST: two interview_configuration rows, two
   * AI_INTERVIEW_CREATED activity rows a second apart, and two Configuration
   * operations on the Control Plane for one configuration. Observed live on
   * 2026-09-04 at 15:25:23 and 15:25:24.
   *
   * Storing the in-flight promise makes the create single-flight: the first
   * caller issues it, every concurrent caller awaits the same one. `mine` is
   * assigned before any await, so exactly one caller is ever told it created
   * the draft; the others apply their own payload with `update` so no edit is
   * lost. Same number of round trips as before — one of them is just an update
   * now instead of a second create.
   */
  const ensureDraftId = async (payload: any): Promise<{ id: string; mine: boolean }> => {
    if (existingDraftIdRef.current) return { id: existingDraftIdRef.current, mine: false };
    let mine = false;
    if (!draftCreateRef.current) {
      mine = true;
      draftCreateRef.current = aiInterviewService
        .create(payload)
        .then((created) => {
          existingDraftIdRef.current = created.id;
          // A new interview stays "unsaved" until Save as Draft keeps it.
          markUnsavedVersion(created.id);
          setLoadedConfig({ id: created.id, status: 'draft', version: created.interview_version ?? 1, invited: false });
          return created.id;
        })
        .catch((err) => {
          // Let the next caller retry rather than stranding the wizard with a
          // permanently rejected promise.
          draftCreateRef.current = null;
          throw err;
        });
    }
    return { id: await draftCreateRef.current, mine };
  };

  const loadedSiRef = useRef<Record<string, any>>({}); // parsed special_instructions snapshot from last load
  // Original rounds_config skill arrays from the saved draft. Captured at load
  // time so auto-save can preserve the AI-expanded skill list when the
  // recruiter's main_skills are unchanged. Without this, rebuilding rounds
  // from mth.skills (= 4 main only) would wipe the 12 expansion sub-skills.
  const loadedRoundsRef = useRef<{
    mthJd?: string[]; mthCustom?: string[];
    nthJd?: string[]; nthCustom?: string[];
  }>({});

  /* Step indicator pins below the sticky breadcrumb rather than under it. */
  const [breadcrumbBarRef, breadcrumbHeight] = useBreadcrumbOffset();

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
  // Per-interview answer-type override (AII-20 follow-up): lets the recruiter
  // pick Text vs Yes/No for a selected HR question JUST for this interview,
  // without editing the shared HR Question Bank record. Keyed by bank
  // question id; a question with no entry here falls back to the bank's own
  // answer_type (today's behavior, unchanged). Only ever written into THIS
  // interview's own saved config (selectedHrQuestions below) — never POSTed
  // back to /hr-question-bank, so the bank and every other interview that
  // selects the same question are unaffected.
  const [hrQuestionTypeOverrides, setHrQuestionTypeOverrides] = useState<Record<string, 'text' | 'yes_no'>>({});

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
  /* Highlights the drop zone while a file is being dragged over it. */
  const [videoDragActive, setVideoDragActive] = useState(false);
  /* Which of the Additional Settings panels is open. */
  const [additionalTab, setAdditionalTab] = useState<AdditionalSettingTab>('video');
  /* The JD opens in a dialog from its card rather than on its own page:
     reading it is a check made WHILE configuring, and leaving drops the form. */
  const [jdViewOpen, setJdViewOpen] = useState(false);
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
  /* Which leave-prompt option is running, so the prompt shows it and blocks the rest. */
  const [leaveBusy, setLeaveBusy] = useState<LeaveInterviewBusy>(null);
  /** `pendingNavigation` value for "leave to the interview list" (Back to JD). */
  const LIST_TARGET = '__list__';
  const isNavigatingRef = useRef(false);
  // True once THIS visit has already written its exit checkpoint (the audit
  // row that records the recruiter leaving the wizard — "AI Interview Saved
  // as Draft" / "Draft Updated", chosen server-side). Every exit path sets
  // it, and the unmount safety net below checks it, so a visit can never
  // produce two checkpoint rows.
  const exitCheckpointedRef = useRef(false);

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
          // With pending edits overlaid: an existing config is edited as pending
          // edits (lib/utils/aiInterviewEditSession), and this is where they show.
          configId ? aiInterviewService.get(configId, { withPending: true }).catch(() => null) : Promise.resolve(null),
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

        // A disabled JD is view-only: no creating or editing its interview
        // until the job is enabled again. Editing an existing config lands on
        // its (read-only) details page instead.
        if (isJdDisabled(jd.status) || isJdDisabled(specificConfig?.jd_status)) {
          setRedirecting(true);
          toast.error(JD_DISABLED_ACTION_MESSAGE);
          if (wizardNav) {
            wizardNav.exit();
            return;
          }
          if (fromInviteOrigin) {
            router.replace(inviteOriginReturn);
            return;
          }
          router.replace(
            specificConfig
              ? `/recruitment/ai-interviews/${specificConfig.id}${fromJobDetails ? '?from=job-details' : ''}`
              : '/recruitment/ai-interviews/jd-selection'
          );
          return;
        }

        // Entering fresh (no config_id): a JD that already has a live interview
        // must not get a second one configured. This guard used to live on the
        // AI Interviews list page, which every "Create" click had to route
        // through just to run it. Doing it here keeps the click on a single
        // navigation and covers every entry point into this page.
        if (liveConfig) {
          setRedirecting(true);
          if (fromInviteOrigin) {
            // Nothing to create — go back and invite to the one it has.
            toast.info('This job already has an AI interview — taking you back to invite.');
            router.replace(inviteOriginReturn);
            return;
          }
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

        /* Nor may a job version whose AI interview is in any other status
           (archived, completed, cancelled) get a second fresh V1: an AI
           interview is one per job version, and its later versions are clones
           of it (Create / Send AI Interview's New version, the AI Interviews
           page's Duplicate), up to the 5-version cap. A draft is no blocker -
           it is restored below. A failed lookup does not block, like the live
           check above. */
        if (!configId) {
          const ofJob = (await loadAllInterviewConfigs().catch(() => [] as AIInterviewResponse[]))
            .filter((c) => c.jd_id === jdId);
          if (ofJob.length > 0 && !ofJob.some((c) => c.status === 'draft')) {
            const latest = ofJob.reduce((best, c) =>
              (interviewVersionOrdinal(c, ofJob) > interviewVersionOrdinal(best, ofJob) ? c : best));
            setRedirecting(true);
            toast.info(
              `This job version already has an AI interview (V${interviewVersionOrdinal(latest, ofJob)}). ` +
              (latest.status === 'archived' ? 'Unarchive it to continue.' : 'Duplicate it to create a new version.'),
            );
            if (fromInviteOrigin) {
              router.replace(inviteOriginReturn);
              return;
            }
            router.replace(`/recruitment/ai-interviews/${latest.id}${fromJobDetails ? '?from=job-details' : ''}`);
            return;
          }
        }

        setSelectedJd(jd);

        // Look for an existing config: specific config_id takes priority, then search drafts by jd_id
        let existingDraft: AIInterviewResponse | null = specificConfig;
        if (!existingDraft) {
          const draftResult = await aiInterviewService.listConfigs({ status: 'draft', page_size: 50, compact: true }).catch(() => null);
          existingDraft = draftResult?.items?.find(
            (c: AIInterviewResponse) => c.jd_id === jdId && c.status === 'draft'
          ) ?? null;
          // The list row is the stored draft; with pending edits on it, read
          // the wizard's view of it instead so those edits are what loads.
          if (existingDraft?.has_pending_edits) {
            const listed: AIInterviewResponse = existingDraft;
            existingDraft = await aiInterviewService.get(listed.id, { withPending: true }).catch(() => listed);
          }
        }

        // Mode + SI-backed settings restore on ANY existing draft (even if
        // rounds_config is temporarily empty) — the Interview Mode toggle
        // must reflect what the user picked, not silently default to 'fixed'
        // when the user navigates back from the Clusters page.
        if (existingDraft) {
          existingDraftIdRef.current = existingDraft.id;
          loadedStatusRef.current = existingDraft.status ?? null;
          setLoadedConfig({
            id: existingDraft.id,
            status: existingDraft.status ?? null,
            version: existingDraft.interview_version ?? 1,
            invited: (existingDraft.invitations_count ?? 0) > 0,
          });
          pendingOnLoadRef.current = !!existingDraft.has_pending_edits;
          // An existing config — not one created in this visit — is edited as
          // pending edits: Continue / Save on this step are staged, so a
          // published interview does not change mid-edit and Discard can drop
          // everything. A new or just-duplicated version is written directly.
          if (!isUnsavedVersion(existingDraft.id)) markStaging(existingDraft.id);
          if (shouldAnnounceRestoredEdits(existingDraft)) {
            toast.info(
              `Unsaved changes from ${formatIST(existingDraft.pending_edits_updated_at)} restored. Save as Draft to keep them, or Discard to drop them.`,
            );
          }
          setEditingDuplicatedDraft(
            existingDraft.status === 'draft' && (existingDraft.interview_version ?? 1) > 1,
          );
          setUnsavedVersionNumber(
            existingDraft.status === 'draft' && isUnsavedVersion(existingDraft.id)
              ? existingDraft.interview_version ?? 1
              : null,
          );
          draftExistedOnLoadRef.current = true;
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
          if (
            PROXY_INTEGRITY_VERIFICATION_ENABLED
            && (existingDraft as any).environment_verification_enabled !== undefined
          ) {
            // Restored ONLY while the feature is visible. With the flag off the
            // toggle is hidden, so rehydrating a saved `true` would leave the
            // recruiter re-saving a setting they can no longer see — and the
            // interview would still fire the QR. Staying false means the next
            // save through this wizard also clears it in the database.
            setEnvironmentVerificationEnabled(Boolean((existingDraft as any).environment_verification_enabled));
          }
        }

        // De-dupe a raw skill-name list before it ever becomes Configure state.
        // `addSkill()` below runs the same semantic check, but only for a skill
        // typed through "+ Add" — it was never reachable for skills that arrive
        // pre-populated from `jd.must_have_skills` / `jd.nice_to_have_skills`
        // (JD extraction can independently produce "REST API" and "RESTful API"
        // as separate bullets) or from a previously-saved `jd_skills`/
        // `custom_skills` list (legacy configs saved before this guard existed).
        // Order-preserving, first occurrence wins — same contract as the
        // backend's `_dedupe_skills_semantic`. Declared here, above the
        // rounds_config branch, so every branch below (fresh JD, draft without
        // rounds yet, and restored rounds) shares one definition.
        const dedupeSkillNames = (names: string[] = []) => {
          const kept: string[] = [];
          for (const raw of names) {
            if (typeof raw !== 'string' || !raw.trim()) continue;
            const name = raw.trim();
            if (closestDuplicate(kept.map(k => ({ name: k })), k => k.name, name)) continue;
            kept.push(name);
          }
          return kept;
        };
        const toSkillEntries = (skills: string[] = []) =>
          dedupeSkillNames(skills).map(s => ({ name: s, comment: '', type: 'Skill' as SkillType }));

        // CROSS-CATEGORY guard: the same semantic skill can independently land
        // in both `jd.must_have_skills` and `jd.nice_to_have_skills` (JD
        // extraction runs per-section with no shared view). Must-Have wins —
        // mirrors the backend's `_strip_cross_section_duplicates`. Every branch
        // below resolves MTH before NTH, so `mthClaimedNames` is always populated
        // by the time an NTH list is built.
        let mthClaimedNames: string[] = [];
        const toMthSkillEntries = (skills: string[] = []) => {
          const entries = toSkillEntries(skills);
          mthClaimedNames = entries.map(e => e.name);
          return entries;
        };
        const toNthSkillEntries = (skills: string[] = []) => {
          const deduped = dedupeSkillNames(skills).filter(
            name => !closestDuplicate(mthClaimedNames.map(n => ({ name: n })), k => k.name, name),
          );
          return deduped.map(s => ({ name: s, comment: '', type: 'Skill' as SkillType }));
        };

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
                ? toMthSkillEntries(draftSkills)
                : (toMthSkillEntries(jd.must_have_skills ?? [])),
              clusters: [],
              percentage: mthRound.percentage ?? DEFAULT_PCT.mth,
              enabled: true,
            });
          } else {
            setMth(prev => ({
              ...prev,
              skills: toMthSkillEntries(jd.must_have_skills ?? []),
            }));
          }

          if (nthRound) {
            const draftSkills = nthMainSkills ?? [...(nthRound.jd_skills || []), ...(nthRound.custom_skills || [])];
            setNth({
              skills: draftSkills.length > 0
                ? toNthSkillEntries(draftSkills)
                : (toNthSkillEntries(jd.nice_to_have_skills ?? [])),
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
                ? toNthSkillEntries(nthMainSkills)
                : (toNthSkillEntries(jd.nice_to_have_skills ?? [])),
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
              // Restore this interview's own saved answer_type as the override —
              // it may differ from the bank's current value if it was overridden
              // when this draft was last saved.
              setHrQuestionTypeOverrides(
                Object.fromEntries(
                  hrRound.hr_questions.map(q => [q.id, q.answer_type as 'text' | 'yes_no']),
                ),
              );
            } else {
              setHrSelectedIds([]);
              setHrQuestionStages({});
              setHrQuestionTypeOverrides({});
            }
          } else {
            setHrEnabled(false);
            setHrSelectedIds([]);
            setHrQuestionStages({});
            setHrQuestionTypeOverrides({});
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
            skills: toMthSkillEntries(jd.must_have_skills ?? []),
          }));
          setNth(prev => ({
            ...prev,
            enabled: (jd.nice_to_have_skills?.length ?? 0) > 0,
            skills: toNthSkillEntries(jd.nice_to_have_skills ?? []),
          }));
        } else {
          // No existing config at all — populate from JD defaults
          setMth(prev => ({
            ...prev,
            skills: toMthSkillEntries(jd.must_have_skills ?? []),
          }));
          setNth(prev => ({
            ...prev,
            enabled: (jd.nice_to_have_skills?.length ?? 0) > 0,
            skills: toNthSkillEntries(jd.nice_to_have_skills ?? []),
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

  /* ── Backend reconciliation of the seeded skill lists ──────────────────────
   *
   * The seeding above already de-dupes, but only with `lib/skillDuplicates.ts` —
   * the FRONTEND MIRROR of the backend matcher. That mirror implements the
   * structural rules only; it has no LLM layer, so a pair that is a true synonym
   * without a shared root ("Data Analytics" / "Data Analysis", "Source Control" /
   * "Version Control", "ECG" / "EKG") survives it and lands in Configure state as
   * two skills. Those are precisely the pairs no amount of client-side logic can
   * settle, because deciding them needs a model.
   *
   * So the mirror is now a FAST PATH, not the authority: it keeps typing
   * responsive and the obvious cases instant, and this pass asks the backend —
   * the single source of truth — to confirm what actually survived. Anything it
   * reports as a duplicate is dropped from state before the recruiter can build
   * clusters on top of it.
   *
   * Both lists are audited TOGETHER (must-have as the pool, nice-to-have as the
   * candidates) because a skill lives in one section or the other, so validating
   * them independently is what lets "REST API" in must-have coexist with
   * "RESTful API" in nice-to-have.
   *
   * Read-only and fail-open: `checkSkillDuplicates` already returns [] on any
   * error or timeout, and a JD whose skills are clean costs one cheap call. It
   * runs once per JD load, after seeding, and never fights the recruiter's own
   * edits — it only ever removes, never adds, and only from the seeded set.
   */
  const reconciledJdRef = useRef<string | null>(null);
  useEffect(() => {
    if (loadingJd || !jdId || reconciledJdRef.current === jdId) return;
    const mthNames = mth.skills.map(s => s.name);
    const nthNames = nth.skills.map(s => s.name);
    if (mthNames.length + nthNames.length === 0) return;
    reconciledJdRef.current = jdId;

    (async () => {
      try {
        const [mthFindings, nthFindings] = await Promise.all([
          // Word-level only: the gpt-4o dedup runs on Continue (/generate-clusters).
          aiInterviewService.checkSkillDuplicates({
            candidates: mthNames, existing: [], jdId, semantic: false,
          }).then(f => f ?? []),
          nthNames.length
            ? aiInterviewService.checkSkillDuplicates({
                candidates: nthNames,
                existing: [],
                otherBucket: mthNames,
                otherBucketLabel: 'Must-Have',
                jdId,
                semantic: false,
              }).then(f => f ?? [])
            : Promise.resolve([] as SkillDuplicateFinding[]),
        ]);

        const dropped: string[] = [];
        const toDrop = (findings: typeof mthFindings) =>
          new Set(
            findings
              .filter(f => f.duplicate && f.match)
              .map(f => { dropped.push(f.skill); return f.skill.toLowerCase(); }),
          );
        const dropMth = toDrop(mthFindings);
        const dropNth = toDrop(nthFindings);
        if (dropMth.size === 0 && dropNth.size === 0) return;

        if (dropMth.size) {
          setMth(prev => ({
            ...prev,
            skills: prev.skills.filter(s => !dropMth.has(s.name.toLowerCase())),
          }));
        }
        if (dropNth.size) {
          setNth(prev => ({
            ...prev,
            skills: prev.skills.filter(s => !dropNth.has(s.name.toLowerCase())),
          }));
        }
        // Say so. A skill vanishing from the list without explanation is the
        // failure mode this whole area exists to avoid.
        toast.info(
          dropped.length === 1
            ? `Removed 1 duplicate skill from this JD: "${dropped[0]}"`
            : `Removed ${dropped.length} duplicate skills from this JD: ${dropped
                .map(d => `"${d}"`).join(', ')}`,
        );
      } catch {
        /* fail open — a duplicate audit must never block Configure from loading */
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingJd, jdId, mth.skills.length, nth.skills.length]);

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
    /* In the popup the browser's history belongs to the page behind it. */
    if (!selectedJd || embedded) return;
    window.history.pushState(null, '', window.location.href);
    const handlePopState = () => {
      if (isNavigatingRef.current) return;
      if (!needsLeavePrompt()) {
        // Nothing to keep or lose: Back only consumed the trap entry pushed
        // above — take the real step back instead of asking.
        isNavigatingRef.current = true;
        window.history.back();
        return;
      }
      window.history.pushState(null, '', window.location.href);
      setPendingNavigation('__back__');
      setShowUnsavedDialog(true);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [selectedJd, embedded]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!selectedJd || isNavigatingRef.current) return;
      let target = e.target as HTMLElement;
      while (target && target !== document.body) {
        if (target.tagName === 'A' || target.getAttribute('role') === 'link') {
          const href = target.getAttribute('href');
          if (href && href.startsWith('/') && !href.startsWith('/#')) {
            // Nothing changed: let the link (a breadcrumb crumb, say) go
            // straight where it points, without asking — the AI Interviews
            // crumb opening that page on its list, as Discard / Save do.
            if (!needsLeavePrompt()) {
              if (href === '/recruitment/ai-interviews') openInterviewListView();
              return;
            }
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

  /* Reload / tab close with unsaved edits: the browser's own "Leave site?"
     prompt, since nothing is auto-saved any more. In-app navigation never
     fires this — the guards above handle it. */
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isNavigatingRef.current || !needsLeavePrompt()) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  /* No auto-save on this step. Only Save as Draft, Continue and the Unsaved
     Changes prompt's Save write the configuration, so Discard can genuinely
     drop this visit's edits — a draft or published version reopened here
     stays exactly as it was saved. Unsaved edits are guarded instead: the
     prompt on Back to JD / breadcrumbs / browser Back, and the browser's own
     "Leave site?" warning on reload or tab close (below). */

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
          // Per-interview override wins when set; otherwise inherit the bank's
          // type (today's behavior). Written only into this interview's own
          // config — the bank record itself is never touched here.
          answer_type: hrQuestionTypeOverrides[q!.id] ?? q!.answer_type,
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
    // The step this save was made from — a draft reopens here (see
    // aiInterviewDraftResume), even when clusters were generated earlier.
    wizard_step: CURRENT_STEP,
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
    // True only when this save represents the recruiter explicitly leaving
    // the wizard (Save as Draft / the unsaved-changes dialog's Save option),
    // as opposed to a silent autosave or a "Continue" save that stays
    // mid-wizard. Threaded to the backend purely as an audit-log hint — it
    // decides whether this config's audit trail gets a "Saved as Draft" /
    // "Draft Updated" row, not whether anything here is saved differently.
    isExiting = false,
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
        environment_verification_enabled: PROXY_INTEGRITY_VERIFICATION_ENABLED && environmentVerificationEnabled,
        available_languages: availableLanguages,
        title: `${selectedJd.title} - AI Interview`,
        save_as_draft: true,
        save_and_exit: isExiting,
        // No `status: 'draft'` for a published version any more: its edits are
        // kept as pending edits and it stays live until Publish applies them
        // (keepWizardChanges) — Save as Draft used to unpublish it.
        semantic_skill_check: false,
        special_instructions: buildClusterJson(),
        introduction_video_url: introVideoUrl || undefined,
      };
      if (existingDraftIdRef.current) {
        // Leaving a PUBLISHED config with nothing changed and nothing pending:
        // no write — staging an identical copy would only flag it with
        // "Unpublished changes" that change nothing.
        const unchangedPublished = isExiting && loadedStatusRef.current === 'published'
          && !hasUnsavedChanges() && !pendingOnLoadRef.current && !hasPendingThisVisit(existingDraftIdRef.current);
        if (!unchangedPublished) await aiInterviewService.update(existingDraftIdRef.current, payload);
      } else {
        // Create the draft once, even if the debounced auto-save is racing this.
        const { id, mine } = await ensureDraftId(payload);
        if (!mine) await aiInterviewService.update(id, payload);
      }
      // This save carried the exit flag, so the server has just written the
      // visit's checkpoint row — the unmount net must not write a second one.
      if (isExiting) exitCheckpointedRef.current = true;
      if (!silent) toast.success('Draft saved!');
      return true;
    } catch (err: any) {
      // Always surface the real reason, even for silent (background) saves —
      // "silent" only suppresses the success confirmation, not failures.
      // Swallowing errors here left callers unable to show anything but a
      // generic "please save first" with no clue why the save itself failed
      // (quota exceeded, validation error, network issue, etc).
      toast.error(err?.message || 'Failed to save draft');
      return false;
    } finally {
      setSavingDraft(false);
    }
  };

  /* Keep what saveDraft just wrote: on an existing draft its pending edits are
     applied; a published config keeps them pending and stays live; a config
     created this visit is only marked kept (keepWizardChanges). */
  const keepSavedDraft = async (): Promise<boolean> => {
    const id = existingDraftIdRef.current;
    if (!id) return true;
    try {
      toast.success(await keepWizardChanges(id, loadedStatusRef.current));
      return true;
    } catch (err) {
      toast.error((err as Error)?.message || 'Failed to save draft');
      return false;
    }
  };

  const handleSaveAsDraft = async () => {
    const ok = await saveDraft(true, undefined, true);
    if (!ok || !(await keepSavedDraft())) return;
    // Started on a JD's Job Details page (including from its draft prompt) —
    // return there rather than to the AI Interviews list, matching the
    // breadcrumb this step already shows.
    router.push(
      fromInviteOrigin
        ? inviteOriginReturn
        : fromJobDetails && selectedJd?.id
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

    // 0. Cluster generation on the next page needs AI_CONFIG_OPENAI_API_KEY.
    // Check availability BEFORE navigating — failing after the navigation
    // strands the recruiter on the Clusters page with nothing to fix there.
    const { available: aiAvailable } = await aiInterviewService.getAIConfigStatus();
    if (!aiAvailable) {
      toast.error(
        'AI is not configured for this workspace (missing OpenAI API key). Contact your admin to configure it before continuing.',
        { duration: 9000 }
      );
      return;
    }

    isNavigatingRef.current = true;

    // 1. Save draft first so the Clusters page reads the latest skills.
    const ok = await saveDraft(true);
    if (!ok) {
      // saveDraft already surfaced the real failure reason — avoid stacking
      // a second, less specific toast on top of it.
      isNavigatingRef.current = false;
      return;
    }
    if (!existingDraftIdRef.current) {
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
    const base = `/recruitment/ai-interviews/jd-selection/ai-interview-config/clusters?id=${existingDraftIdRef.current}${fromJobDetails ? '&from=job-details' : ''}${inviteOriginQuery}`;
    router.push(needsRegeneration ? `${base}&autogen=1` : base);
  };

  /**
   * Record that the recruiter left this config, WITHOUT sending any of the
   * page's current state.
   *
   * The audit trail is meant to show every visit to a config that ends in
   * the recruiter walking away — "AI Interview Saved as Draft" when they
   * changed nothing, "AI Interview Draft Updated" when they did. Only the
   * dialog's Save button used to produce one, so leaving any other way
   * (Discard, or an exit that never reaches the unsaved-changes guard at
   * all — the header's account/notification menus are <button>s driving
   * router.push, which the capture-phase link guard below cannot see) left
   * no trace of the visit.
   *
   * An empty payload is the point: `save_and_exit` is an audit hint the
   * server strips before the update, so nothing here overwrites the stored
   * config. The server snapshots what is already in the database and picks
   * the label by diffing it against the config's last checkpoint — the one
   * place that decision is made, for every module.
   */
  const checkpointExit = async () => {
    if (!existingDraftIdRef.current || exitCheckpointedRef.current) return;
    exitCheckpointedRef.current = true;
    try {
      await aiInterviewService.update(existingDraftIdRef.current, { save_and_exit: true });
    } catch {
      // Best-effort: an audit checkpoint must never block the recruiter from
      // leaving the page, and it has no visible result to report.
      exitCheckpointedRef.current = false;
    }
  };

  // The unmount net for exits the guards never see. Kept in a ref because a
  // cleanup registered once (on mount) would otherwise close over the very
  // first render's state and ids.
  const checkpointExitRef = useRef(checkpointExit);
  checkpointExitRef.current = checkpointExit;

  useEffect(() => {
    return () => {
      // `isNavigatingRef` marks a departure some handler is already driving:
      // Continue → Clusters (staying inside the wizard, where the checkpoint
      // belongs to the exit from THAT page), or a Save/Discard that has
      // already settled this visit's checkpoint.
      // Only while this step is open does the service stage this config's
      // saves (the next step marks it again when it loads).
      clearStaging(existingDraftIdRef.current);
      if (isNavigatingRef.current) return;
      void checkpointExitRef.current();
    };
  }, []);

  const handleSaveAndNavigate = async () => {
    setLeaveBusy('save');
    isNavigatingRef.current = true;
    const ok = await saveDraft(true, undefined, true) && await keepSavedDraft();
    setLeaveBusy(null);
    if (!ok) {
      isNavigatingRef.current = false;
      return;
    }
    setShowUnsavedDialog(false);
    // Same place Discard would have gone: Back to JD → the interview list,
    // a breadcrumb → the page it names.
    goTo(pendingNavigation ?? LIST_TARGET);
    setPendingNavigation(null);
  };

  /* Where Discard lands: the list this flow was started from — the invite
     origin or the Job Details page when the wizard was opened there, otherwise
     the AI Interviews list itself, opened straight on its Total Jobs list
     rather than the overview cards (never back on Step 1, Select JD). The
     sessionStorage flag is the one the AI Interviews page reads on mount
     (AIInterview.tsx, AI_INTERVIEWS_LIST_VIEW_REDIRECT_KEY); JD creation sets
     it the same way. */
  const openInterviewListView = () => {
    try { sessionStorage.setItem('ai_interviews_open_list_view', 'pending'); } catch { /* list opens on its cards instead */ }
  };
  const navigateToInterviewList = () => {
    if (fromInviteOrigin) {
      router.push(inviteOriginReturn);
    } else if (fromJobDetails && jdId) {
      router.push(`/recruitment/job-details?id=${encodeURIComponent(jdId)}`);
    } else {
      openInterviewListView();
      router.push('/recruitment/ai-interviews');
    }
  };

  /* Where a leave lands. `LIST_TARGET` is Back to JD and the footer Discard
     (the interview list above); `__back__` is the browser's Back; anything
     else is the address a breadcrumb or link pointed at — the recruiter goes
     where they clicked. */
  const goTo = (target: string) => {
    // Back: two entries — the trap re-pushed when Back was caught, then this
    // page's own; both are this URL, so one step would land here again.
    if (target === '__back__') window.history.go(-2);
    else if (target === LIST_TARGET) navigateToInterviewList();
    else {
      // The "AI Interviews" crumb: open that page on its list, like every
      // other way out of this step, not on its overview cards.
      if (target === '/recruitment/ai-interviews') openInterviewListView();
      router.push(target);
    }
  };

  /* Does Discard DELETE the version on screen, or only drop this visit's
     edits? Deleted: a version the recruiter never saved — a new interview
     (nothing is stored until Save; if Continue stored it this visit, that row
     goes too) or the version Duplicate has just minted. Kept: a draft they
     saved earlier and reopened (Continue Editing), and any published / live
     version — its stored configuration is left exactly as it was, since
     nothing on this step writes without Save. */
  const discardDeletesVersion = unsavedVersionNumber !== null || !draftExistedOnLoadRef.current;

  /* Discard — the footer button and the leave prompt's Discard do the same
     thing; only the destination differs (see `goTo`). A version this visit
     created is deleted; any other has its pending edits dropped — Continue on
     an existing config only ever staged them — so it is exactly as it was
     last saved / published. Every other version of the interview is untouched. */
  const discardCurrentVersion = async (target: string) => {
    setLeaveBusy('discard');
    isNavigatingRef.current = true;
    // A create still in flight (a Save racing this click) lands its id first,
    // so a version this visit created is removed rather than orphaned.
    if (draftCreateRef.current) await draftCreateRef.current.catch(() => null);
    const draftId = existingDraftIdRef.current;
    const createdThisVisit = !!draftId && !draftExistedOnLoadRef.current;
    const deleteIt = createdThisVisit || unsavedVersionNumber !== null;
    if (draftId) {
      // Best-effort — leaving is what was asked for; a failed delete leaves
      // the draft in the list, where it can be removed directly.
      const ok = await discardWizardChanges(draftId, deleteIt);
      if (deleteIt && ok) {
        existingDraftIdRef.current = null;
        toast.success('Draft discarded');
      }
    }
    setLeaveBusy(null);
    setShowUnsavedDialog(false);
    setPendingNavigation(null);
    // Back from a version just deleted could land on one of its own steps.
    goTo(deleteIt && target === '__back__' ? LIST_TARGET : target);
  };

  /* The leave prompt's Delete: a saved draft nobody was invited to, removed
     outright (the prompt offers it only then). */
  const deleteCurrentInterview = async (target: string) => {
    const draftId = existingDraftIdRef.current;
    if (!draftId) return;
    setLeaveBusy('delete');
    isNavigatingRef.current = true;
    try {
      await deleteWizardConfig(draftId);
      existingDraftIdRef.current = null;
      toast.success('AI interview deleted');
    } catch (err) {
      isNavigatingRef.current = false;
      toast.error((err as Error)?.message || 'Failed to delete AI interview');
      return;
    } finally {
      setLeaveBusy(null);
    }
    setShowUnsavedDialog(false);
    setPendingNavigation(null);
    goTo(target === '__back__' ? LIST_TARGET : target);
  };

  /* ── Inside the wizard popup: the footer's Cancel ──
     Asks to save or discard only when the form has changed. The baseline is
     the form as it stands when the recruiter first touches it, so the values
     the step settles into while it loads never count as a change. */
  const editSnapshot = useMemo(
    () => JSON.stringify([mth, nth, hrPct, hrEnabled, hrSelectedIds, hrQuestionStages, hrQuestionTypeOverrides, mode, sttModel, recordingEnabled, environmentVerificationEnabled, availableLanguages, introVideoUrl]),
    [mth, nth, hrPct, hrEnabled, hrSelectedIds, hrQuestionStages, hrQuestionTypeOverrides, mode, sttModel, recordingEnabled, environmentVerificationEnabled, availableLanguages, introVideoUrl],
  );
  const editSnapshotRef = useRef(editSnapshot);
  const editBaselineRef = useRef<string | null>(null);
  useEffect(() => {
    editSnapshotRef.current = editSnapshot;
  }, [editSnapshot]);
  const markEditStart = () => {
    if (editBaselineRef.current === null) editBaselineRef.current = editSnapshotRef.current;
  };
  /** Has the recruiter changed anything on this step since it loaded? Read by
   *  every leave path: no change means leave without the Unsaved Changes
   *  prompt. Refs only, so handlers registered once still see the latest. */
  function hasUnsavedChanges() {
    return editBaselineRef.current !== null && editBaselineRef.current !== editSnapshotRef.current;
  }
  /** Does leaving need the prompt? Edits on this step, pending edits on the
   *  config (this visit's, or earlier ones restored on load), or a version
   *  created this visit and never kept. Nothing of these → leave silently. */
  function needsLeavePrompt() {
    const id = existingDraftIdRef.current;
    return hasUnsavedChanges() || pendingOnLoadRef.current || hasPendingThisVisit(id) || isUnsavedVersion(id);
  }
  const requestCancel = async () => {
    const changed = needsLeavePrompt();
    if (changed) {
      // Any address outside the wizard ends the popup once saved / discarded.
      setPendingNavigation(jdId ? `/recruitment/job-details?id=${encodeURIComponent(jdId)}` : '/recruitment/ai-interviews');
      setShowUnsavedDialog(true);
      return;
    }
    // Nothing changed: leave without asking, as Discard would — a draft this
    // visit only auto-created goes; one that existed before stays.
    isNavigatingRef.current = true;
    if (existingDraftIdRef.current && !draftExistedOnLoadRef.current) {
      try {
        await aiInterviewService.delete(existingDraftIdRef.current);
        existingDraftIdRef.current = null;
      } catch {
        // Silent — leaving is what was asked for.
      }
    } else {
      await checkpointExit();
    }
    wizardNav?.exit();
  };
  const requestCancelRef = useRef(requestCancel);
  useEffect(() => {
    requestCancelRef.current = requestCancel;
  });
  useEffect(() => {
    if (!wizardNav) return;
    wizardNav.setCancelHandler(() => void requestCancelRef.current());
    return () => wizardNav.setCancelHandler(null);
  }, [wizardNav]);

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
    <main className="flex-1 overflow-x-clip bg-slate-50 dark:bg-slate-950" onPointerDownCapture={markEditStart} onKeyDownCapture={markEditStart}>
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
                    { label: 'Configure' },
                  ]
                : fromJobDetails && jdId
                ? [
                    // Entered from Job Details — repeat that page's trail and link
                    // the JD crumb back to it so the user returns where they started.
                    { label: 'Dashboard', href: '/dashboard' },
                    { label: 'Job Descriptions', href: '/recruitment/job-openings' },
                    { label: selectedJd?.title || 'Job Details', href: `/recruitment/job-details?id=${encodeURIComponent(jdId)}` },
                    { label: 'Create AI Interview' },
                    { label: 'Configure' },
                  ]
                : [
                    { label: 'Dashboard', href: '/dashboard' },
                    { label: 'AI Interviews', href: '/recruitment/ai-interviews' },
                    // Name the JD being configured so the trail identifies the record.
                    { label: selectedJd?.title || 'Configure Interview' },
                  ]
            }
          />

        {/* The page used to open with an "AI Interview Configuration" banner.
            The breadcrumb names the page, the step indicator names the step,
            and the JD card below names the record — the banner repeated all
            three and pushed the first real control below the fold. */}

        {/* Step indicators */}
        <AIInterviewStepIndicator currentStep={CURRENT_STEP} topOffset={breadcrumbHeight} />

        {/* ── The JD this configuration is being built against ──────────────
            The same row the JD picker draws, so the recruiter recognises the
            record they just chose instead of re-reading a bare title: JD id,
            status, version, then role / location / type and the dates. Full
            width above the columns, where it reads as the page's subject
            rather than as the first setting. */}
        <div className="mb-5 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 px-4 py-3.5">
          {/* Stacks on phones: the summary takes the full card width and the
              two actions sit in a row beneath it, instead of a column that
              squeezed the summary beside it. */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <JobOpeningSummary job={{ ...publishedJdToJob(selectedJd), locations: selectedJdLocations ?? undefined }} mergeInfoRows />
            </div>
            <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
              {jdId && (
                <button
                  type="button"
                  onClick={() => setJdViewOpen(true)}
                  className="inline-flex items-center justify-center gap-1.5 text-sm text-brand-blue border border-brand-blue/40 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg hover:bg-brand-blue/10 hover:border-brand-blue transition-colors whitespace-nowrap"
                  title="Read this job description"
                >
                  <Eye className="w-4 h-4" />
                  View JD
                </button>
              )}
              {/* The wizard popup is opened for one job, so it has no Change JD;
                  nor does a duplicated version's draft, whose JD was fixed
                  when it was cloned (see `editingDuplicatedDraft`). */}
              {!embedded && !editingDuplicatedDraft && (
              <button
                type="button"
                onClick={() => {
                  setPendingNavigation('/recruitment/ai-interviews/jd-selection');
                  setShowUnsavedDialog(true);
                }}
                className="inline-flex items-center justify-center gap-1.5 text-sm text-brand-blue border border-brand-blue/40 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg hover:bg-brand-blue/10 hover:border-brand-blue transition-colors whitespace-nowrap"
                title="Pick a different job description"
              >
                <ArrowRightLeft className="w-4 h-4" />
                Change JD
              </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Left: main config ── */}
          <div className="lg:col-span-2 space-y-5">

            {/* ── Interview Mode + Make Clusters ── */}
            <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4 space-y-4">
              <div>
                <SectionHeader
                  icon={Clock}
                  title="Interview Mode"
                  subtitle="Choose how the interview will be conducted"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  {/* The two modes read as one choice: a radio dot, the mode's
                      name, what it does, then the per-round breakdown that
                      mode actually produces — so the split is visible before
                      it is picked rather than only in the sidebar after. */}
                  {([
                    {
                      value: 'fixed' as const,
                      label: 'Timed Mode — 30 min',
                      recommended: true,
                      description: 'Candidate responds within the allotted time. AI narration excluded.',
                      lines: [
                        `Must-to-Have — ${timedQDist.mth} questions`,
                        ...(nth.enabled ? [`Nice-to-Have — ${timedQDist.nth} questions`] : []),
                        ...(hrEnabled ? [`HR Round — ${timedQDist.hr} questions`] : []),
                      ],
                    },
                    {
                      value: 'flexible' as const,
                      label: 'Conversational — 30 min',
                      recommended: false,
                      description: 'No per-question timer. AI adapts based on candidate responses.',
                      lines: [
                        `Must-to-Have — ${mth.percentage}% weight`,
                        ...(nth.enabled ? [`Nice-to-Have — ${nth.percentage}% weight`] : []),
                        ...(hrEnabled ? [`HR Round — ${hrPct}% weight`] : []),
                      ],
                    },
                  ]).map(option => {
                    const selected = mode === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => {
                          if (option.value === 'fixed') { setMode('fixed'); setBufferEnabled(false); }
                          else setMode('flexible');
                        }}
                        className={`relative flex flex-col gap-2 p-4 rounded-xl border-2 text-left transition-all ${
                          selected
                            ? 'border-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue/20 shadow-sm shadow-brand-blue/10'
                            : 'border-gray-200 bg-white hover:border-brand-blue/30 hover:bg-brand-blue/5'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              aria-hidden
                              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                selected ? 'border-brand-blue bg-brand-blue' : 'border-gray-300 bg-white'
                              }`}
                            >
                              {selected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </span>
                            <span className={`font-semibold text-sm tracking-tight ${selected ? 'text-brand-blue' : 'text-gray-900'}`}>
                              {option.label}
                            </span>
                          </div>
                          {option.recommended && (
                            <span className="inline-flex items-center px-2 py-0.5 text-2xs font-medium rounded-full bg-advice-positive-bg text-advice-positive ring-1 ring-advice-positive/25 flex-shrink-0">
                              Recommended
                            </span>
                          )}
                        </div>
                        <p className={`text-xs ${selected ? 'text-gray-700' : 'text-gray-500'}`}>
                          {option.description}
                        </p>
                        <div className="space-y-1 mt-0.5">
                          {option.lines.map(line => (
                            <div
                              key={line}
                              className={`flex items-center gap-1.5 text-2xs ${selected ? 'text-gray-700' : 'text-gray-500'}`}
                            >
                              <CheckCircle2 className={`w-3.5 h-3.5 flex-shrink-0 ${selected ? 'text-brand-blue' : 'text-gray-400'}`} />
                              {line}
                            </div>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Buffer Time toggle — only in conversational mode */}
                {mode === 'flexible' && (
                  <div className="flex items-center justify-between gap-3 pt-3 border-t border-gray-100">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
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
              <SectionHeader
                icon={Mic}
                title="Speech-to-Text Model"
                subtitle="Engine used to transcribe the candidate's spoken answers."
              />
              <div className="flex items-center gap-2.5 flex-wrap">
                <FilterSelect
                  value={sttModel}
                  onChange={v => setSttModel(v)}
                  ariaLabel="Speech-to-Text Model"
                  className="w-auto sm:w-auto max-w-full font-medium pl-3 sm:pl-3 pr-2.5 sm:pr-2.5 py-2 sm:py-2 rounded-lg sm:rounded-lg text-gray-900"
                  options={STT_MODELS.map(m => ({ value: m.value, label: `${m.label}${m.recommended ? ' (Recommended)' : ''}` }))}
                />
                {(() => {
                  const sel = STT_MODELS.find(m => m.value === sttModel) ?? STT_MODELS[0];
                  return (
                    <>
                      {sel.recommended && (
                        <span className="inline-flex items-center px-2 py-0.5 text-2xs font-medium rounded-full bg-advice-positive-bg text-advice-positive ring-1 ring-advice-positive/25">
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
              subtitle="The required skills for this role — the AI builds its technical questions from these."
              category="mth"
              config={mth}
              jdSkillNames={selectedJd.must_have_skills || []}
              mode={mode}
              questionCount={timedQDist.mth}
              flexibleMinutes={flexMthMin}
              onChange={patch => setMth(prev => ({ ...prev, ...patch }))}
              otherBucketSkills={nth.enabled ? nth.skills.map(s => s.name) : []}
              jdId={jdId || undefined}
              onMoveSkill={mode === 'flexible' ? moveMthToNth : undefined}
              isLocked={flexSkillsLocked}
              onResetClusters={handleResetClusters}
              hideClustersView
            />

            {/* ── NTH ── */}
            <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-4 py-3 border-b border-gray-100">
                <div className="flex flex-1 items-start gap-2.5 min-w-0 sm:min-w-[12rem]">
                  <span className="flex items-center h-10 flex-shrink-0">
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
                  </span>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex-shrink-0">
                    <Sparkles className="w-5 h-5 text-brand-cyan" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 text-sm tracking-tight">Nice-To-Have Skills</div>
                    <p className="text-xs text-gray-500 mt-0.5">Optional skills that add value to the role.</p>
                  </div>
                </div>
                {nth.enabled && (
                  <div className="flex items-center sm:h-10 flex-shrink-0">
                    {mode === 'fixed' ? (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">
                        {timedQDist.nth} questions
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20">
                        ~{flexNthMin} min
                      </span>
                    )}
                  </div>
                )}
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
                    otherBucketSkills={mth.skills.map(s => s.name)}
                    jdId={jdId || undefined}
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
              selectedTypeOverrides={hrQuestionTypeOverrides}
              onSelectedChange={setHrSelectedIds}
              onSelectedStagesChange={setHrQuestionStages}
              onSelectedTypeOverridesChange={setHrQuestionTypeOverrides}
              onBankAdd={q => setHrBankQuestions(prev => [...prev, q])}
            />


            {/* ── Additional settings ──────────────────────────────────────
                Three optional extras that each held a card of their own,
                which pushed the page's actual work further down for settings
                most interviews never touch. Tabs keep them to one card. */}
            <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
              <div className="p-4 pb-0">
                <SectionHeader
                  icon={Settings2}
                  title="Additional Settings"
                  subtitle="Optional extras: an introduction video, the interview language, and proxy checks."
                />
              </div>

              {/* Below sm the tabs share the row equally, icon over a wrapping
                  label: in one nowrap line the second tab was cut off at
                  "Candidate Langua" with the scrollbar hidden. */}
              <div role="tablist" aria-label="Additional settings" className="mt-3 px-4 flex items-stretch sm:items-center gap-1 border-b border-gray-100 overflow-x-auto scrollbar-hide">
                {ADDITIONAL_SETTING_TABS.map(tab => {
                  const active = additionalTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setAdditionalTab(tab.key)}
                      className={`flex-1 sm:flex-none flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 px-1.5 sm:px-3 py-2 text-sm font-medium text-center sm:whitespace-nowrap border-b-2 -mb-px transition-colors ${
                        active
                          ? 'border-brand-blue text-brand-blue'
                          : 'border-transparent text-gray-500 hover:text-brand-blue hover:border-brand-blue/30'
                      }`}
                    >
                      <tab.icon className="w-4 h-4 flex-shrink-0" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {additionalTab === 'video' && (
                <div role="tabpanel" className="p-4 space-y-2">
                  <p className="text-xs text-gray-500">
                    Upload or record a short video introducing the role — candidates see it before the interview starts. Optional, max 1 min.
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
                        <button onClick={handleRemoveVideo} className="p-1 text-gray-400 hover:text-destructive hover:bg-destructive-subtle rounded transition-colors" aria-label="Remove video" title="Remove video">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    </div>
                  ) : (
                    <>
                    {/* Two actions, side by side: the one in play is the filled
                        button, the other stays outlined — the segmented control
                        this replaced read as a filter, not as a choice of how to
                        supply the video. */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        onClick={() => setVideoMode('upload')}
                        className={`flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                          videoMode === 'upload'
                            ? 'bg-brand-blue text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10'
                            : 'bg-white text-gray-700 border border-gray-200 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue'
                        }`}
                      >
                        <Upload className="w-4 h-4" />
                        Upload Video
                      </button>
                      <button
                        onClick={() => setVideoMode('record')}
                        className={`flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                          videoMode === 'record'
                            ? 'bg-brand-blue text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10'
                            : 'bg-white text-gray-700 border border-gray-200 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue'
                        }`}
                      >
                        <Camera className="w-4 h-4" />
                        Record Video
                      </button>
                    </div>

                    {videoMode === 'upload' ? (
                      <div>
                        {/* Drop target as well as a file picker: a video is
                            normally sitting in a folder the recruiter already has
                            open, and dragging it here is the shorter path. */}
                        <label
                          onDragOver={e => { e.preventDefault(); setVideoDragActive(true); }}
                          onDragLeave={() => setVideoDragActive(false)}
                          onDrop={e => {
                            e.preventDefault();
                            setVideoDragActive(false);
                            const file = e.dataTransfer.files?.[0];
                            if (!file) return;
                            if (!file.type.startsWith('video/')) {
                              toast.error('Drop a video file (MP4, MOV or WEBM)');
                              return;
                            }
                            handleVideoUpload(file);
                          }}
                          className={`flex flex-col items-center justify-center gap-1.5 py-6 px-4 border-2 border-dashed rounded-lg cursor-pointer text-center transition-colors ${
                            videoDragActive
                              ? 'border-brand-blue bg-brand-blue/5'
                              : 'border-gray-300 hover:border-brand-blue/40 hover:bg-brand-blue/5'
                          }`}
                        >
                          <span className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                            <Upload className="w-4 h-4 text-brand-blue" />
                          </span>
                          <span className="text-sm text-gray-600">
                            Drag and drop a video here, or <span className="text-brand-blue font-medium">click to upload</span> (max 1 min)
                          </span>
                          <span className="text-xs text-gray-400">MP4, MOV or WEBM</span>
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
                          <p className="text-2xs text-destructive mt-1 flex items-center gap-1">
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
                            style={{ transform: 'scaleX(-1)' }}
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
                              <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                              <span className="text-xs font-mono text-white">
                                {String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:{String(recordingSeconds % 60).padStart(2, '0')} / 01:00
                              </span>
                            </div>
                          )}

                          {/* Remaining time bar */}
                          {isRecording && (
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-700">
                              <div
                                className="h-full bg-destructive transition-all duration-1000 ease-linear"
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
                              <AlertCircle className="w-6 h-6 text-destructive mb-1" />
                              <p className="text-xs text-destructive text-center px-4">{cameraError}</p>
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
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-destructive text-white rounded-lg hover:bg-destructive transition-colors"
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
                        <p className="text-2xs text-gray-400 text-center">Recording auto-stops at 1 minute</p>
                      </div>
                    )}
                    </>
                  )}
                </div>
              )}

              {additionalTab === 'languages' && (
                <div role="tabpanel" className="p-4 space-y-2">
                  <p className="text-xs text-gray-500">
                    The language the AI conducts the interview in.
                  </p>
                  {/* One dropdown rather than a row of chips: the interview runs
                      in a single language, and a chip that could not be removed
                      read as a status rather than as the setting it is. */}
                  <FilterSelect
                    value={availableLanguages[0] ?? CANDIDATE_LANGUAGES[0]}
                    onChange={v => setAvailableLanguages([v])}
                    ariaLabel="Interview language"
                    className="w-auto sm:w-auto max-w-full font-medium pl-3 sm:pl-3 pr-2.5 sm:pr-2.5 py-2 sm:py-2 rounded-lg sm:rounded-lg text-gray-900 min-w-0 sm:min-w-[180px]"
                    options={CANDIDATE_LANGUAGES.map(lang => ({ value: lang, label: lang }))}
                  />
                </div>
              )}

              {PROXY_INTEGRITY_VERIFICATION_ENABLED && additionalTab === 'proxy' && (
                <div role="tabpanel" className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-brand-blue/10 ring-1 ring-brand-blue/15 flex-shrink-0">
                        <QrCode className="w-5 h-5 text-brand-blue" />
                      </div>
                      <span className="text-sm font-medium text-gray-900 tracking-tight">Enable Proxy Integrity Verification</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
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
                    Pause the interview once, after the first must-have-skills question, to verify the candidate&apos;s physical environment via a QR code and their phone&apos;s camera.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ── Right: Summary sidebar ── */}
          <div className="space-y-4">

            {/* Weightage distribution */}
            <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto scrollbar-auto-hide">
              <div className="mb-4">
                <SectionHeader
                  icon={ClipboardList}
                  title="Configuration Summary"
                  subtitle="What this interview will look like once published."
                />
              </div>

              {/* Job Details */}
              <div className="border border-gray-100 rounded-lg overflow-hidden mb-4 ring-1 ring-black/[0.02]">
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                  <span className="text-xs font-medium text-brand-blue">Job Details</span>
                </div>
                <div className="divide-y divide-gray-50">
                  <div className="px-3 py-2 flex items-start justify-between gap-2">
                    <span className="text-xs text-gray-500 flex-shrink-0">Role Title</span>
                    <span className="text-xs font-semibold text-gray-900 text-right break-words min-w-0">{selectedJd.title}</span>
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
                      <span className="text-xs font-semibold text-gray-900 text-right">{formatIndustryType(selectedJd.industry_type)}</span>
                    </div>
                  )}
                  {selectedJd.location && (
                    <div className="px-3 py-2 flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-500 flex-shrink-0">Location</span>
                      <SummaryLocation value={selectedJd.location} locations={selectedJdLocations} />
                    </div>
                  )}
                  {selectedJd.employment_type && (
                    <div className="px-3 py-2 flex items-start justify-between gap-2">
                      <span className="text-xs text-gray-500 flex-shrink-0">Employment Type</span>
                      <span className="text-xs font-semibold text-gray-900 text-right">{formatEmploymentType(selectedJd.employment_type)}</span>
                    </div>
                  )}
                  {(selectedJd.version_number ?? selectedJd.current_version) != null && (
                    <div className="px-3 py-2 flex items-start justify-between gap-2">
                      <span className="text-xs text-gray-500 flex-shrink-0">JD Version</span>
                      <span className="text-xs font-semibold text-gray-900 text-right">v{selectedJd.version_number ?? 1}</span>
                    </div>
                  )}
                  {selectedJd.domain_keywords && selectedJd.domain_keywords.length > 0 && (
                    <div className="px-3 py-2">
                      <span className="text-xs text-gray-500 block mb-1.5">Domain Context</span>
                      <div className="flex flex-wrap gap-1">
                        {selectedJd.domain_keywords.slice(0, 6).map(kw => (
                          <span key={kw} className="inline-block px-1.5 py-0.5 rounded text-2xs bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">{kw}</span>
                        ))}
                        {selectedJd.domain_keywords.length > 6 && (
                          <span className="inline-block px-1.5 py-0.5 rounded text-2xs bg-slate-100 text-gray-500 ring-1 ring-gray-200">+{selectedJd.domain_keywords.length - 6}</span>
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
                    <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                      <span className="text-xs font-medium text-brand-blue">Question Budget (Total: 15)</span>
                      <span className="text-xs text-gray-400">{totalFixed} min</span>
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
                </div>
              )}

              {/* Flexible mode: weight distribution + time allocation */}
              {mode === 'flexible' && (
                <div className="space-y-3 mb-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <span>Scoring Weight Distribution</span>
                      <span className={`font-semibold ${pctValid ? 'text-advice-positive' : 'text-red-500'}`}>
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
                    <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-destructive-subtle border border-destructive-line">
                      <AlertCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0 mt-0.5" />
                      <p className="text-2xs text-destructive">Weights must total 100%. Adjust the percentages above.</p>
                    </div>
                  )}
                  {pctValid && (
                    <div className="border border-gray-100 rounded-lg overflow-hidden ring-1 ring-black/[0.02]">
                      <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                        <span className="text-xs font-medium text-brand-blue">Time Allocation</span>
                        <span className="text-xs font-semibold text-gray-700">
                          {bufferEnabled ? '30 min base + 5 min buffer' : '30 min total'}
                        </span>
                      </div>
                      <div>
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
                    </div>
                  )}
                </div>
              )}


            </div>
          </div>
        </div>

        {/* ── Wizard actions ────────────────────────────────────────────────
            One bar at the foot of the page instead of a stack buried in the
            sidebar: leaving (left) and advancing (right) are the page's two
            outcomes, and they now sit where the form ends rather than beside
            the summary the recruiter is still reading. Not sticky: it sits
            in normal flow at the end of the page, below the last section. */}
        {(() => {
          /* Leaving (start) and advancing (end). In the wizard popup they sit in
             its sticky footer, around its Cancel, and Back to JD is not offered:
             the popup is opened for one job. Nor is it on a duplicated
             version's draft (see `editingDuplicatedDraft`), whose JD is fixed. */
          const leaveActions = (
            <>
              {!embedded && !editingDuplicatedDraft && (
                <button
                  type="button"
                  onClick={() => {
                    // Leaves to the interview list (never Step 1, Select JD);
                    // the prompt only when there is something to save or lose.
                    if (!needsLeavePrompt()) {
                      navigateToInterviewList();
                      return;
                    }
                    setPendingNavigation(LIST_TARGET);
                    setShowUnsavedDialog(true);
                  }}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm border border-gray-200 bg-white text-gray-700 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Exit
                </button>
              )}
              <WizardDiscardButton
                onClick={() => void discardCurrentVersion(LIST_TARGET)}
                disabled={savingDraft}
                label={discardDeletesVersion ? 'Discard' : 'Discard changes'}
              />
            </>
          );
          const advanceActions = (
            <>
              <button
                onClick={handleSaveAsDraft}
                disabled={savingDraft}
                className="flex-1 sm:flex-none whitespace-nowrap inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 text-sm border border-gray-200 bg-white text-gray-700 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingDraft ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {savingDraft ? 'Saving…' : 'Save as Draft'}
              </button>

              {/* No native `title` on the button — the styled bubble below
                  already shows `continueDisabledReason`, and setting both made
                  the browser draw a second plain tooltip over it. */}
              <div className="relative group flex-1 sm:flex-none">
                <button
                  onClick={handleContinueToClusters}
                  disabled={!canContinueToClusters}
                  aria-disabled={!canContinueToClusters}
                  className={`w-full whitespace-nowrap inline-flex items-center justify-center gap-2 px-3 sm:px-5 py-2.5 text-sm rounded-lg transition-colors ${
                    canContinueToClusters
                      ? 'bg-brand-blue hover:bg-brand-blue-2 text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10'
                      : 'bg-slate-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {savingDraft ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {savingDraft ? 'Saving…' : (
                    <>
                      <span className="sm:hidden">Continue</span>
                      <span className="hidden sm:inline">Continue to Clusters</span>
                    </>
                  )}
                  {!savingDraft && <ChevronRight className="w-4 h-4" />}
                </button>
                {!canContinueToClusters && continueDisabledReason && (
                  <div className="pointer-events-none absolute bottom-full right-0 mb-2 px-3 py-2 text-xs text-white bg-gray-900 rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-normal w-max max-w-[calc(100vw-2rem)] sm:max-w-xs z-10">
                    {continueDisabledReason}
                    <div className="absolute top-full right-6 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900" />
                  </div>
                )}
              </div>
            </>
          );
          if (embedded) {
            return (
              <>
                {wizardNav?.footerStartEl && createPortal(leaveActions, wizardNav.footerStartEl)}
                {wizardNav?.footerEndEl && createPortal(advanceActions, wizardNav.footerEndEl)}
              </>
            );
          }
          return (
            <div className="mt-6 pt-4 border-t border-gray-100 dark:border-slate-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
              {/* On phones the bar is two rows (leave / advance) rather than four
                  stacked buttons. */}
              <div className="flex items-center justify-between sm:justify-start gap-2">
                {leaveActions}
              </div>
              <div className="flex flex-row items-stretch sm:items-center gap-2">
                {advanceActions}
              </div>
            </div>
          );
        })()}
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

      {/* ── Job description, in place ── */}
      {jdViewOpen && jdId && (
        <WizardLayer>
          <JDFullViewModal
            jdId={jdId}
            jdTitle={selectedJd?.title}
            onClose={() => setJdViewOpen(false)}
            /* In the popup, the job's card opens the JD, as on Job Details. */
            showJobCard={embedded}
            cancelInFooter={embedded}
          />
        </WizardLayer>
      )}

      {/* "Being edited by X" - View only / Take over (see InterviewEditLockGate). */}
      <InterviewEditLockGate configId={loadedConfig?.id} />

      {/* Leaving with something unsaved — the wizard's shared leave prompt
          (Clusters and Preview & Publish show the same one). */}
      <LeaveInterviewDialog
        open={showUnsavedDialog}
        jdCode={selectedJd?.job_id}
        title={selectedJd?.title}
        versionNumber={unsavedVersionNumber ?? loadedConfig?.version ?? 1}
        nothingSavedYet={!loadedConfig}
        createdThisVisit={!!loadedConfig && discardDeletesVersion}
        isPublished={loadedConfig?.status === 'published'}
        canDelete={!!loadedConfig && loadedConfig.status === 'draft' && !loadedConfig.invited && !discardDeletesVersion}
        currentStepLabel="Configure"
        busy={leaveBusy ?? (savingDraft ? 'save' : null)}
        onCancel={() => { setShowUnsavedDialog(false); setPendingNavigation(null); }}
        onDiscard={() => void discardCurrentVersion(pendingNavigation ?? LIST_TARGET)}
        onDelete={() => void deleteCurrentInterview(pendingNavigation ?? LIST_TARGET)}
        onSave={() => void handleSaveAndNavigate()}
      />

      </div>
    </main>
  );
}
