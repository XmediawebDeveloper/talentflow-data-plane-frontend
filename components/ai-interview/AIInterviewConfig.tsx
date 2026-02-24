'use client';

import { ArrowLeft, Clock, Plus, X, Sparkles, CheckCircle2, Loader2, Users, Brain, Shield, TrendingUp, MessageSquare, Lightbulb, Trash2, Save, Globe } from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import type { PublishedJD, AIInterviewRoundConfig } from '@/lib/services/aiInterviewService';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface RoundConfig {
  type: string;
  percentage: number;
  topics: string[];
  topicWeights: Record<string, number>;
  suggestedTopics: string[];
  enabled: boolean;
  order: number;
}

const ROUND_TYPES = [
  { value: 'hr', label: 'HR', icon: Users, color: 'bg-blue-100 text-blue-700' },
  { value: 'must_have_skills', label: 'Must-Have Skills', icon: Brain, color: 'bg-purple-100 text-purple-700' },
  { value: 'nice_to_have_skills', label: 'Nice-to-Have Skills', icon: Lightbulb, color: 'bg-indigo-100 text-indigo-700' },
  { value: 'behavioral', label: 'Behavioral', icon: MessageSquare, color: 'bg-green-100 text-green-700' },
  { value: 'culture_fit', label: 'Culture Fit', icon: Shield, color: 'bg-yellow-100 text-yellow-700' },
  { value: 'leadership', label: 'Leadership', icon: TrendingUp, color: 'bg-red-100 text-red-700' },
  { value: 'problem_solving', label: 'Problem Solving', icon: Lightbulb, color: 'bg-orange-100 text-orange-700' },
];

const DEFAULT_ROUNDS: RoundConfig[] = [
  { type: 'hr', percentage: 30, topics: [], topicWeights: {}, suggestedTopics: [], enabled: true, order: 1 },
  { type: 'must_have_skills', percentage: 35, topics: [], topicWeights: {}, suggestedTopics: [], enabled: true, order: 2 },
  { type: 'nice_to_have_skills', percentage: 35, topics: [], topicWeights: {}, suggestedTopics: [], enabled: true, order: 3 },
];

export default function AIInterviewConfig() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jdId = searchParams.get('jd_id');

  const [selectedJd, setSelectedJd] = useState<PublishedJD | null>(null);
  const [loadingJd, setLoadingJd] = useState(true);

  // Round config state
  const [rounds, setRounds] = useState<RoundConfig[]>(DEFAULT_ROUNDS);
  const [totalDuration, setTotalDuration] = useState(30);
  const [recordingEnabled, setRecordingEnabled] = useState(true);

  const [publishing, setPublishing] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [suggestingTopics, setSuggestingTopics] = useState<string | null>(null);

  // Auto-save draft state
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const isNavigatingRef = useRef(false);
  const isPublishedRef = useRef(false);

  // Load selected JD
  useEffect(() => {
    if (!jdId) {
      router.replace('/recruitment/ai-interviews/jd-selection');
      return;
    }

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
      } catch (error) {
        console.error('Failed to load JD:', error);
        toast.error('Failed to load job description');
        router.replace('/recruitment/ai-interviews/jd-selection');
      } finally {
        setLoadingJd(false);
      }
    };

    loadJD();
  }, [jdId, router]);

  // Auto-populate topics from JD skills
  useEffect(() => {
    if (!selectedJd) return;
    setRounds(prev => prev.map(r => {
      if (r.type === 'must_have_skills' && r.topics.length === 0 && selectedJd.must_have_skills.length > 0) {
        const topics = [...selectedJd.must_have_skills];
        return { ...r, topics, topicWeights: distributeWeights(topics, {}) };
      }
      if (r.type === 'nice_to_have_skills' && r.topics.length === 0 && selectedJd.nice_to_have_skills.length > 0) {
        const topics = [...selectedJd.nice_to_have_skills];
        return { ...r, topics, topicWeights: distributeWeights(topics, {}) };
      }
      return r;
    }));
  }, [selectedJd]);

  // Warn before closing browser tab/window if JD is selected
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (selectedJd && !isPublishedRef.current && !isNavigatingRef.current) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [selectedJd]);

  // Intercept navigation clicks (sidebar, links) if JD is selected
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!selectedJd || isPublishedRef.current || isNavigatingRef.current) return;

      let target = e.target as HTMLElement;
      while (target && target !== document.body) {
        if (target.tagName === 'A' || target.getAttribute('role') === 'link') {
          const href = target.getAttribute('href');
          if (href && href.startsWith('/') && !href.startsWith('/#')) {
            e.preventDefault();
            e.stopPropagation();
            setPendingNavigation(href);
            setShowUnsavedDialog(true);
            return;
          }
        }
        target = target.parentElement as HTMLElement;
      }
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [selectedJd]);

  // Handle back button - auto-save draft and navigate
  const handleBackClick = async () => {
    if (isNavigatingRef.current || savingDraft) return;
    isNavigatingRef.current = true;

    if (selectedJd) {
      await saveDraft(true);
      toast.success('Draft saved automatically');
    }
    router.push('/recruitment/ai-interviews/jd-selection');
  };

  // Unsaved dialog handlers
  const handleSaveAndNavigate = async () => {
    setShowUnsavedDialog(false);
    isNavigatingRef.current = true;
    await saveDraft(true);
    toast.success('Draft saved automatically');
    if (pendingNavigation) router.push(pendingNavigation);
    setPendingNavigation(null);
  };

  const handleDiscardAndNavigate = () => {
    setShowUnsavedDialog(false);
    isNavigatingRef.current = true;
    if (pendingNavigation) router.push(pendingNavigation);
    setPendingNavigation(null);
  };

  const handleCancelDialog = () => {
    setShowUnsavedDialog(false);
    setPendingNavigation(null);
  };

  // Round management
  const enabledRounds = rounds.filter(r => r.enabled);
  const totalPercentage = enabledRounds.reduce((sum, r) => sum + r.percentage, 0);
  const percentageValid = totalPercentage === 100;
  const roundDurationsValid = enabledRounds.every(r => Math.round(r.percentage * totalDuration / 100) >= 5);
  const getRoundDuration = (percentage: number) => Math.round(percentage * totalDuration / 100);

  const handleToggleRound = (index: number) => {
    setRounds(prev => {
      const round = prev[index];
      const newEnabled = !round.enabled;

      // Block disabling the last enabled round
      const currentlyEnabled = prev.filter(r => r.enabled);
      if (!newEnabled && currentlyEnabled.length <= 1) {
        toast.error('At least one round should be enabled');
        return prev;
      }

      const updated = prev.map((r, i) => i === index ? { ...r, enabled: newEnabled } : r);

      // Auto-redistribute percentages
      const skillTypes = ['must_have_skills', 'nice_to_have_skills'];
      if (round.type === 'hr') {
        if (!newEnabled) {
          // HR disabled: split its % equally to skill rounds
          const hrPct = round.percentage;
          const enabledSkillRounds = updated.filter(r => r.enabled && skillTypes.includes(r.type));
          if (enabledSkillRounds.length > 0) {
            const splitPct = Math.round(hrPct / enabledSkillRounds.length);
            return updated.map(r => {
              if (r.enabled && skillTypes.includes(r.type)) {
                return { ...r, percentage: r.percentage + splitPct };
              }
              return r;
            });
          }
        } else {
          // HR re-enabled: set to 30%, take equally from skill rounds
          const enabledSkillRounds = updated.filter(r => r.enabled && skillTypes.includes(r.type));
          const takeEach = enabledSkillRounds.length > 0 ? Math.round(30 / enabledSkillRounds.length) : 0;
          return updated.map(r => {
            if (r.type === 'hr') return { ...r, percentage: 30 };
            if (r.enabled && skillTypes.includes(r.type)) {
              return { ...r, percentage: Math.max(0, r.percentage - takeEach) };
            }
            return r;
          });
        }
      }

      return updated;
    });
  };

  const handleRoundPercentage = (index: number, value: number) => {
    setRounds(prev => prev.map((r, i) => i === index ? { ...r, percentage: value } : r));
  };

  const distributeWeights = (topics: string[], currentWeights: Record<string, number>): Record<string, number> => {
    if (topics.length === 0) return {};
    const equal = Math.floor(100 / topics.length);
    const remainder = 100 - equal * topics.length;
    const weights: Record<string, number> = {};
    topics.forEach((t, i) => {
      weights[t] = equal + (i < remainder ? 1 : 0);
    });
    return weights;
  };

  const handleAddTopic = (roundIndex: number, topic: string) => {
    if (!topic.trim()) return;
    setRounds(prev => prev.map((r, i) => {
      if (i !== roundIndex || r.topics.includes(topic.trim())) return r;
      const newTopics = [...r.topics, topic.trim()];
      return { ...r, topics: newTopics, topicWeights: distributeWeights(newTopics, r.topicWeights) };
    }));
  };

  const handleRemoveTopic = (roundIndex: number, topic: string) => {
    setRounds(prev => prev.map((r, i) => {
      if (i !== roundIndex) return r;
      const newTopics = r.topics.filter(t => t !== topic);
      const { [topic]: _, ...rest } = r.topicWeights;
      return { ...r, topics: newTopics, topicWeights: distributeWeights(newTopics, rest) };
    }));
  };

  const handleTopicWeight = (roundIndex: number, topic: string, value: number) => {
    setRounds(prev => prev.map((r, i) =>
      i === roundIndex ? { ...r, topicWeights: { ...r.topicWeights, [topic]: value } } : r
    ));
  };

  const handleSuggestTopics = async (roundIndex: number) => {
    if (!selectedJd) return;
    const round = rounds[roundIndex];
    setSuggestingTopics(round.type);
    try {
      const result = await aiInterviewService.suggestTopics(selectedJd.id, round.type);
      setRounds(prev => prev.map((r, i) =>
        i === roundIndex ? { ...r, suggestedTopics: result.suggested_topics } : r
      ));
    } catch (error) {
      console.error('Failed to suggest topics:', error);
      toast.error('Failed to get topic suggestions');
    } finally {
      setSuggestingTopics(null);
    }
  };

  const handleAddRound = (type: string) => {
    if (rounds.some(r => r.type === type)) {
      toast.error('This round type already exists');
      return;
    }
    setRounds(prev => [...prev, {
      type,
      percentage: 0,
      topics: [],
      topicWeights: {},
      suggestedTopics: [],
      enabled: true,
      order: prev.length + 1,
    }]);
  };

  const handleRemoveRound = (index: number) => {
    setRounds(prev => prev.filter((_, i) => i !== index));
  };

  const getRoundInfo = (type: string) => ROUND_TYPES.find(rt => rt.value === type);
  const availableRoundTypes = ROUND_TYPES.filter(rt => !rounds.some(r => r.type === rt.value));

  const buildRoundsConfig = (): AIInterviewRoundConfig[] => {
    return enabledRounds.map(r => ({
      type: r.type,
      percentage: r.percentage,
      duration_minutes: getRoundDuration(r.percentage),
      topics: r.topics,
      topic_weights: r.topics.length > 0 ? r.topicWeights : undefined,
      enabled: true,
      order: r.order,
    }));
  };

  // Build rounds config for draft (no strict validation)
  const buildDraftRoundsConfig = (): AIInterviewRoundConfig[] => {
    return enabledRounds.map(r => ({
      type: r.type,
      percentage: r.percentage,
      duration_minutes: Math.max(0, getRoundDuration(r.percentage)),
      topics: r.topics,
      topic_weights: r.topics.length > 0 ? r.topicWeights : undefined,
      enabled: true,
      order: r.order,
    }));
  };

  // Core draft save function (used by button, auto-save, and dialog)
  const saveDraft = async (silent = false): Promise<boolean> => {
    if (!selectedJd) return false;
    setSavingDraft(true);
    try {
      await aiInterviewService.create({
        position: selectedJd.title,
        jd_id: selectedJd.id,
        duration_minutes: totalDuration,
        rounds_config: buildDraftRoundsConfig(),
        recording_enabled: recordingEnabled,
        title: `${selectedJd.title} - AI Interview`,
        save_as_draft: true,
      });
      if (!silent) toast.success('AI Interview configuration saved as draft!');
      return true;
    } catch (error) {
      console.error('Failed to save draft:', error);
      if (!silent) toast.error('Failed to save draft');
      return false;
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSaveAsDraft = async () => {
    if (!selectedJd) return;
    const saved = await saveDraft();
    if (saved) router.push('/recruitment/ai-interviews');
  };

  const handlePublish = async () => {
    if (!selectedJd || !percentageValid || !roundDurationsValid) return;
    setPublishing(true);
    try {
      const interview = await aiInterviewService.create({
        position: selectedJd.title,
        jd_id: selectedJd.id,
        duration_minutes: totalDuration,
        rounds_config: buildRoundsConfig(),
        recording_enabled: recordingEnabled,
        title: `${selectedJd.title} - AI Interview`,
      });
      await aiInterviewService.publishConfig(interview.id);
      isPublishedRef.current = true;
      toast.success('AI Interview configuration published!');
      router.push('/recruitment/ai-interviews');
    } catch (error) {
      console.error('Failed to publish:', error);
      toast.error('Failed to publish configuration');
    } finally {
      setPublishing(false);
    }
  };

  if (loadingJd) {
    return (
      <div className="flex-1 flex items-center justify-center overflow-y-auto">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
          <p className="text-sm text-gray-500">Loading configuration...</p>
        </div>
      </div>
    );
  }

  if (!selectedJd) return null;

  return (
    <div className="flex-1 p-8 overflow-y-auto">
      <div className="w-full">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={handleBackClick}
            disabled={savingDraft}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-gray-900 text-xl font-semibold">AI Interview Configuration</h1>
            <p className="text-sm text-gray-500">Step 2: Configure interview rounds</p>
          </div>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-2 mb-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium bg-green-100 text-green-700">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <span className="text-sm text-gray-400">Select JD</span>
            <div className="w-12 h-px bg-gray-200 mx-1" />
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium bg-gray-900 text-white">
              2
            </div>
            <span className="text-sm text-gray-900 font-medium">Configure & Publish</span>
          </div>
        </div>

        {/* Configure Rounds */}
        <div className="grid grid-cols-3 gap-6">
          {/* Left column: Round configuration */}
          <div className="col-span-2 space-y-4">
            {/* Selected JD info */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-500 mb-1">Selected Job Description</div>
                  <div className="font-medium text-gray-900">{selectedJd.title}</div>
                  {/* JD metadata row */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-gray-500">
                    {(selectedJd.experience_min != null || selectedJd.experience_max != null) && (
                      <span>
                        Experience: {selectedJd.experience_min ?? 0}–{selectedJd.experience_max ?? selectedJd.experience_min ?? 0} yrs
                      </span>
                    )}
                    {selectedJd.education_requirements && (selectedJd.education_requirements as any).degree && (
                      <span>
                        Education: {((selectedJd.education_requirements as any).degree || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                        {(selectedJd.education_requirements as any).field ? ` in ${(selectedJd.education_requirements as any).field}` : ''}
                      </span>
                    )}
                    {selectedJd.current_version && (
                      <span>Version: v{selectedJd.current_version}</span>
                    )}
                    {selectedJd.job_id && (
                      <span className="font-mono">ID: {selectedJd.job_id}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => router.push('/recruitment/ai-interviews/jd-selection')}
                  className="text-sm text-gray-500 hover:text-gray-700 ml-3 shrink-0"
                >
                  Change
                </button>
              </div>
            </div>

            {/* Rounds */}
            <div>
              <h3 className="font-medium text-gray-900 mb-3">Interview Rounds</h3>
              <div className="space-y-3">
                {rounds.map((round, index) => {
                  const info = getRoundInfo(round.type);
                  const Icon = info?.icon || Brain;
                  return (
                    <div key={round.type} className={`border rounded-lg transition-all ${
                      round.enabled ? 'border-gray-300 bg-white' : 'border-gray-200 bg-gray-50 opacity-60'
                    }`}>
                      <div className="p-4">
                        {/* Round header */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={round.enabled}
                                onChange={() => handleToggleRound(index)}
                                className="sr-only peer"
                              />
                              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-gray-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-gray-800 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
                            </label>
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${info?.color || 'bg-gray-100 text-gray-700'}`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <span className="font-medium text-gray-900">{info?.label || round.type}</span>
                            <span className="text-xs text-gray-400">Round {round.order}</span>
                          </div>
                          {rounds.length > 1 && (
                            <button
                              onClick={() => handleRemoveRound(index)}
                              className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        {round.enabled && (
                          <>
                            {/* Percentage Weight */}
                            <div className="mb-3">
                              <div className="flex items-center justify-between mb-1">
                                <label className="text-xs text-gray-500">Percentage Weight</label>
                                <span className="text-xs text-gray-400">{getRoundDuration(round.percentage)} min</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  type="range"
                                  min={0}
                                  max={100}
                                  step={1}
                                  value={round.percentage}
                                  onChange={e => handleRoundPercentage(index, parseInt(e.target.value))}
                                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-800"
                                />
                                <div className="flex items-center">
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={round.percentage}
                                    onChange={e => {
                                      const v = parseInt(e.target.value);
                                      if (!isNaN(v) && v >= 0 && v <= 100) handleRoundPercentage(index, v);
                                    }}
                                    className="w-12 px-1 py-0.5 border border-gray-300 rounded text-center text-sm font-medium text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-400"
                                  />
                                  <span className="text-sm text-gray-500 ml-0.5">%</span>
                                </div>
                              </div>
                            </div>

                            {/* JD Skills display for must-have / nice-to-have rounds */}
                            {round.type === 'must_have_skills' && selectedJd && selectedJd.must_have_skills.length > 0 && (
                              <div className="mb-3">
                                <label className="text-xs text-gray-500 mb-1.5 block">Skills from JD</label>
                                <div className="flex flex-wrap gap-1.5">
                                  {selectedJd.must_have_skills.map(skill => (
                                    <span key={skill} className="px-2 py-1 bg-purple-50 text-purple-700 text-xs rounded-full border border-purple-200">{skill}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {round.type === 'nice_to_have_skills' && selectedJd && selectedJd.nice_to_have_skills.length > 0 && (
                              <div className="mb-3">
                                <label className="text-xs text-gray-500 mb-1.5 block">Skills from JD</label>
                                <div className="flex flex-wrap gap-1.5">
                                  {selectedJd.nice_to_have_skills.map(skill => (
                                    <span key={skill} className="px-2 py-1 bg-indigo-50 text-indigo-700 text-xs rounded-full border border-indigo-200">{skill}</span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Topics */}
                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <label className="text-xs text-gray-500">Topics</label>
                                <button
                                  onClick={() => handleSuggestTopics(index)}
                                  disabled={suggestingTopics === round.type}
                                  className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 transition-colors"
                                >
                                  {suggestingTopics === round.type ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Sparkles className="w-3 h-3" />
                                  )}
                                  Suggest from JD
                                </button>
                              </div>

                              {/* Topic chips with weights */}
                              {round.topics.length > 0 && (
                                <div className="space-y-1.5 mb-2">
                                  {round.topics.map(topic => (
                                    <div key={topic} className="flex items-center gap-2">
                                      <span className="flex-1 inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full truncate">
                                        {topic}
                                      </span>
                                      <div className="flex items-center shrink-0">
                                        <input
                                          type="number"
                                          min={0}
                                          max={100}
                                          value={round.topicWeights[topic] ?? 0}
                                          onChange={e => {
                                            const v = parseInt(e.target.value);
                                            if (!isNaN(v) && v >= 0 && v <= 100) handleTopicWeight(index, topic, v);
                                          }}
                                          className="w-10 px-1 py-0.5 border border-gray-300 rounded text-center text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-400"
                                        />
                                        <span className="text-xs text-gray-400 ml-0.5">%</span>
                                      </div>
                                      <button onClick={() => handleRemoveTopic(index, topic)} className="text-gray-400 hover:text-red-500 shrink-0">
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ))}
                                  {(() => {
                                    const total = round.topics.reduce((sum, t) => sum + (round.topicWeights[t] ?? 0), 0);
                                    return total !== 100 && round.topics.length > 0 ? (
                                      <div className="text-xs text-red-500 mt-1">Topic weights total {total}% (should be 100%)</div>
                                    ) : null;
                                  })()}
                                </div>
                              )}

                              {/* Suggested topics */}
                              {round.suggestedTopics.filter(st => !round.topics.includes(st)).length > 0 && (
                                <div className="mb-2">
                                  <div className="flex items-center justify-between mb-1">
                                    <div className="text-xs text-gray-400">Suggestions (click to add):</div>
                                    <button
                                      onClick={() => setRounds(prev => prev.map((r, i) =>
                                        i === index ? { ...r, suggestedTopics: [] } : r
                                      ))}
                                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
                                    >
                                      <X className="w-3 h-3" />
                                      Clear
                                    </button>
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    {round.suggestedTopics
                                      .filter(st => !round.topics.includes(st))
                                      .map(st => (
                                        <button
                                          key={st}
                                          onClick={() => handleAddTopic(index, st)}
                                          className="px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors border border-blue-200"
                                        >
                                          + {st}
                                        </button>
                                      ))}
                                  </div>
                                </div>
                              )}

                              {/* Add topic input */}
                              <input
                                type="text"
                                placeholder="Type a topic and press Enter..."
                                className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    handleAddTopic(index, (e.target as HTMLInputElement).value);
                                    (e.target as HTMLInputElement).value = '';
                                  }
                                }}
                              />
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add round button */}
              {availableRoundTypes.length > 0 && (
                <div className="mt-3">
                  <div className="text-xs text-gray-500 mb-2">Add another round:</div>
                  <div className="flex flex-wrap gap-2">
                    {availableRoundTypes.map(rt => {
                      const Icon = rt.icon;
                      return (
                        <button
                          key={rt.value}
                          onClick={() => handleAddRound(rt.value)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-gray-400 hover:bg-gray-50 transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          <Icon className="w-3 h-3" />
                          {rt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Options */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={recordingEnabled}
                onChange={e => setRecordingEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-gray-800 focus:ring-gray-500"
              />
              <span className="text-sm text-gray-700">Auto-record interview</span>
            </label>
          </div>

          {/* Right column: Summary sidebar */}
          <div className="space-y-4">
            {/* Interview Duration - Fixed */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-700" />
                <h3 className="font-medium text-gray-900">Interview Duration</h3>
                <span className="ml-auto text-sm font-medium text-gray-900">{totalDuration} min</span>
              </div>
              <p className="text-xs text-gray-400 mt-2">Time is split across rounds based on percentage</p>
            </div>

            {/* Summary */}
            <div className="bg-white border border-gray-200 rounded-lg p-4 sticky top-8">
              <h3 className="font-medium text-gray-900 mb-3">Interview Summary</h3>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">JD</span>
                  <span className="text-gray-900 font-medium text-right max-w-[180px] truncate">{selectedJd.title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Rounds</span>
                  <span className="text-gray-900">{enabledRounds.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Total Duration</span>
                  <span className="text-gray-900 font-medium">{totalDuration} min</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Total Weight</span>
                  <span className={`font-medium ${percentageValid ? 'text-green-600' : 'text-red-500'}`}>
                    {totalPercentage}%
                  </span>
                </div>

                {!percentageValid && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-2 text-xs text-red-600">
                    Enabled round percentages must total 100%. Currently: {totalPercentage}%
                  </div>
                )}
                {percentageValid && !roundDurationsValid && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-2 text-xs text-red-600">
                    Each round must be at least 5 minutes. Increase total duration or adjust percentages.
                  </div>
                )}

                <div className="border-t border-gray-100 pt-3">
                  <div className="text-xs text-gray-500 mb-2">Rounds breakdown:</div>
                  {enabledRounds.map(r => {
                    const info = getRoundInfo(r.type);
                    return (
                      <div key={r.type} className="py-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-600">{info?.label || r.type}</span>
                          <span className="text-xs text-gray-900">{r.percentage}% / {getRoundDuration(r.percentage)} min</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action buttons */}
              <div className="mt-4 space-y-2">
                <button
                  onClick={handlePublish}
                  disabled={!percentageValid || !roundDurationsValid || enabledRounds.length === 0 || publishing}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 text-sm rounded-lg transition-colors ${
                    percentageValid && roundDurationsValid && enabledRounds.length > 0 && !publishing
                      ? 'bg-gray-800 text-white hover:bg-gray-900'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {publishing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Globe className="w-4 h-4" />
                  )}
                  {publishing ? 'Publishing...' : 'Publish Configuration'}
                </button>
                <button
                  onClick={handleSaveAsDraft}
                  disabled={savingDraft}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 text-sm rounded-lg transition-colors border ${
                    !savingDraft
                      ? 'border-gray-300 text-gray-700 hover:bg-gray-50'
                      : 'border-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {savingDraft ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {savingDraft ? 'Saving...' : 'Save as Draft'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Unsaved Changes Dialog */}
      <Dialog open={showUnsavedDialog} onOpenChange={(open) => !open && handleCancelDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsaved Changes</DialogTitle>
            <DialogDescription>
              You have unsaved changes. Would you like to save them as a draft before leaving?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={handleDiscardAndNavigate}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Discard Changes
            </button>
            <button
              onClick={handleSaveAndNavigate}
              disabled={savingDraft}
              className="px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {savingDraft ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Draft'
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
