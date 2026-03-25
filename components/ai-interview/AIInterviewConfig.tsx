'use client';

import {
  ArrowLeft, Clock, Plus, X, Sparkles, CheckCircle2, Loader2,
  Users, Brain, Shield, Globe, Save, ChevronDown, ChevronUp,
  MessageSquare, Info, AlertCircle, Timer, Zap,
  Video, Upload, Layers, ChevronRight, Camera, Play,
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
  questionCount: number;
  onChange: (updated: Partial<CategoryConfig>) => void;
}

function SkillSection({ title, category, config, jdSkillNames, mode, questionCount, onChange }: SkillSectionProps) {
  const [customInput, setCustomInput] = useState('');
  const [commentOpen, setCommentOpen] = useState<string | null>(null);
  const [collapsedClusters, setCollapsedClusters] = useState<Set<string>>(new Set());
  const [skillToDelete, setSkillToDelete] = useState<string | null>(null);
  const [weightError, setWeightError] = useState(false);

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
          </select>
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
      <div className="flex items-center px-4 py-3 border-b border-gray-100">
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
              flexible questions
            </span>
          )}
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
  mode: InterviewMode;
  enabled: boolean;
  questionCount: number;
  onToggle: () => void;
}

function HRSection({ mode, enabled, questionCount, onToggle }: HRSectionProps) {
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
          {enabled && mode === 'fixed' && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-600 border border-blue-200">
              {questionCount} questions
            </span>
          )}
          {enabled && mode === 'flexible' && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-purple-50 text-purple-600 border border-purple-200">
              flexible questions
            </span>
          )}
        </div>
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
  /* Per-question time limit (timed mode only), in seconds */
  const [perQuestionSeconds, setPerQuestionSeconds] = useState<number>(120);

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

              // Restore per-question time limit
              if (parsed.per_question_seconds) {
                setPerQuestionSeconds(Number(parsed.per_question_seconds));
              }

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
          duration_minutes: FIXED_TIME.mth + (nth.enabled ? FIXED_TIME.nth : 0) + (hrEnabled ? FIXED_TIME.hr : 0),
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

  // Static question distribution based on enabled sections (timed mode: total=15)
  const timedQDist = (() => {
    const mhs = true;
    const nhs = nth.enabled;
    const hr  = hrEnabled;
    if (mhs && nhs && hr)  return { mth: 8, nth: 4, hr: 3 };
    if (mhs && nhs)        return { mth: 9, nth: 6, hr: 0 };
    if (mhs && hr)         return { mth: 10, nth: 0, hr: 5 };
    if (nhs && hr)         return { mth: 0, nth: 9, hr: 6 };
    if (mhs)               return { mth: 15, nth: 0, hr: 0 };
    if (nhs)               return { mth: 0, nth: 15, hr: 0 };
    return                        { mth: 0, nth: 0, hr: 15 };
  })();

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
          if (isFinite(video.duration) && Math.floor(video.duration) > 60) {
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
      if (cat === 'mth') return fixedMthMin;
      if (cat === 'nth') return fixedNthMin;
      return fixedHrMin;
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
    per_question_seconds: mode === 'fixed' ? perQuestionSeconds : undefined,
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
        duration_minutes: totalFixed,
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
    if (!selectedJd) return;
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
                      <span className="font-semibold text-sm">Flexible — 30 min</span>
                    </div>
                    <p className={`text-xs ${mode === 'flexible' ? 'text-gray-300' : 'text-gray-500'}`}>
                      Candidate response time is capped. AI narration excluded.
                    </p>
                    <div className={`mt-2 text-[11px] space-y-0.5 ${mode === 'flexible' ? 'text-gray-400' : 'text-gray-400'}`}>
                      <div>Must-to-Have → flexible questions</div>
                      {nth.enabled && <div>Nice-to-Have → flexible questions</div>}
                      {hrEnabled && <div>HR Round → flexible questions</div>}
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
                    onChange={patch => setNth(prev => ({ ...prev, ...patch }))}
                  />
                </div>
              )}
            </div>

            {/* ── HR ── */}
            <HRSection
              mode={mode}
              enabled={hrEnabled}
              questionCount={timedQDist.hr}
              onToggle={() => setHrEnabled(e => !e)}
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

              {/* Question distribution */}
              <div className="border border-gray-100 rounded-lg overflow-hidden mb-4">
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                  <span className="text-xs font-medium text-gray-500">
                    {mode === 'fixed' ? 'Question Budget (Total: 15)' : 'Question Coverage'}
                  </span>
                </div>
                <table className="w-full text-xs">
                  <tbody>
                    <tr className="border-b border-gray-50">
                      <td className="px-3 py-2 text-gray-600">Must-to-Have</td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-900">
                        {mode === 'fixed' ? `${timedQDist.mth} questions` : 'flexible'}
                      </td>
                    </tr>
                    {nth.enabled && (
                      <tr className="border-b border-gray-50">
                        <td className="px-3 py-2 text-gray-600">Nice-to-Have</td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-900">
                          {mode === 'fixed' ? `${timedQDist.nth} questions` : 'flexible'}
                        </td>
                      </tr>
                    )}
                    {hrEnabled && (
                      <tr>
                        <td className="px-3 py-2 text-gray-600">HR Round</td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-900">
                          {mode === 'fixed' ? `${timedQDist.hr} questions` : 'flexible'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Actions */}
              <div className="space-y-2">
                <button
                  onClick={handleContinueToClusters}
                  disabled={savingDraft || generatingClusters}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 text-sm rounded-lg transition-colors ${
                    !savingDraft && !generatingClusters
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
