'use client';

import { formatJdExperience } from '@/lib/utils/jobExperience';
import { ArrowLeft, Briefcase, Clock, Plus, X, Sparkles, CheckCircle2, Loader2, Users, Brain, Shield, TrendingUp, MessageSquare, Lightbulb, Trash2, Save, Globe, Video, Upload, MessageCircle } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import type { PublishedJD, AIInterviewRoundConfig } from '@/lib/services/aiInterviewService';
import { toast } from 'sonner';
import { showErrorToast } from '@/lib/utils/errorToast';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { findInvalidSkillPunctuation } from '@/lib/skillDuplicates';
import { IconButton } from '@/components/ui/icon-button';

interface RoundConfig {
  type: string;
  percentage: number;
  topics: string[];
  topicWeights: Record<string, number>;
  topicComments: Record<string, string>;
  suggestedTopics: string[];
  enabled: boolean;
  order: number;
}

interface AIInterviewCreationProps {
  onBack: () => void;
  onCreated: () => void;
}

const ROUND_TYPES = [
  { value: 'must_have_skills', label: 'Must-To-Have', icon: Shield, color: 'bg-destructive-subtle text-destructive' },
  { value: 'nice_to_have_skills', label: 'Nice-To-Have', icon: Lightbulb, color: 'bg-warning-subtle text-warning' },
  { value: 'hr', label: 'HR', icon: Users, color: 'bg-blue-100 text-blue-700' },
  { value: 'technical', label: 'Technical', icon: Brain, color: 'bg-purple-100 text-purple-700' },
  { value: 'behavioral', label: 'Behavioral', icon: MessageSquare, color: 'bg-success-subtle text-success' },
  { value: 'culture_fit', label: 'Culture Fit', icon: TrendingUp, color: 'bg-warning-subtle text-warning' },
  { value: 'leadership', label: 'Leadership', icon: TrendingUp, color: 'bg-indigo-100 text-indigo-700' },
  { value: 'problem_solving', label: 'Problem Solving', icon: Brain, color: 'bg-orange-100 text-orange-700' },
];

const DEFAULT_ROUNDS: RoundConfig[] = [
  { type: 'must_have_skills', percentage: 70, topics: [], topicWeights: {}, topicComments: {}, suggestedTopics: [], enabled: true, order: 1 },
  { type: 'nice_to_have_skills', percentage: 20, topics: [], topicWeights: {}, topicComments: {}, suggestedTopics: [], enabled: true, order: 2 },
  { type: 'hr', percentage: 10, topics: [], topicWeights: {}, topicComments: {}, suggestedTopics: [], enabled: true, order: 3 },
];

export default function AIInterviewCreation({ onBack, onCreated }: AIInterviewCreationProps) {
  const router = useRouter();
  const [step, setStep] = useState<'select-jd' | 'configure'>('select-jd');
  const [jds, setJds] = useState<PublishedJD[]>([]);
  const [loadingJds, setLoadingJds] = useState(true);
  const [selectedJd, setSelectedJd] = useState<PublishedJD | null>(null);
  const [jdSearch, setJdSearch] = useState('');

  // Round config state
  const [rounds, setRounds] = useState<RoundConfig[]>(DEFAULT_ROUNDS);
  const [totalDuration, setTotalDuration] = useState(30);
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [recordingEnabled, setRecordingEnabled] = useState(true);

  // Introduction video (optional)
  const [introVideoFile, setIntroVideoFile] = useState<File | null>(null);
  const [introVideoUrl, setIntroVideoUrl] = useState<string>('');
  const [uploadingVideo, setUploadingVideo] = useState(false);

  const [publishing, setPublishing] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [suggestingTopics, setSuggestingTopics] = useState<string | null>(null);
  const [topicWeightErrors, setTopicWeightErrors] = useState<Record<string, boolean>>({});
  const [topicInputErrors, setTopicInputErrors] = useState<Record<number, string>>({});

  // Load published JDs
  const loadJDs = useCallback(async (): Promise<void> => {
    try {
      setLoadingJds(true);
      const result = await aiInterviewService.getPublishedJDs();
      setJds(result.items);
    } catch (error) {
      console.error('Failed to load JDs:', error);
      showErrorToast(error, "Couldn't load job descriptions", { id: 'ai-interview-creation-jds-load', retry: () => { void loadJDs(); } });
    } finally {
      setLoadingJds(false);
    }
  }, []);

  useEffect(() => {
    loadJDs();
  }, [loadJDs]);

  const filteredJds = jds.filter(jd =>
    jd.title.toLowerCase().includes(jdSearch.toLowerCase()) ||
    (jd.department || '').toLowerCase().includes(jdSearch.toLowerCase())
  );

  const distributeWeights = (skills: string[]): Record<string, number> => {
    if (skills.length === 0) return {};
    const base = Math.floor(100 / skills.length);
    const remainder = 100 - base * skills.length;
    const weights: Record<string, number> = {};
    skills.forEach((s, i) => { weights[s] = base + (i < remainder ? 1 : 0); });
    return weights;
  };

  const handleSelectJd = (jd: PublishedJD) => {
    setSelectedJd(jd);
    setRounds(prev => prev.map(r => {
      if (r.type === 'must_have_skills') {
        const skills = jd.must_have_skills || [];
        return { ...r, topics: skills, topicWeights: distributeWeights(skills), topicComments: {} };
      }
      if (r.type === 'nice_to_have_skills') {
        const skills = jd.nice_to_have_skills || [];
        return { ...r, topics: skills, topicWeights: distributeWeights(skills), topicComments: {} };
      }
      return r;
    }));
    setStep('configure');
  };

  const handleVideoUpload = async (file: File) => {
    setIntroVideoFile(file);
    setUploadingVideo(true);
    try {
      const result = await aiInterviewService.uploadIntroVideo(file);
      setIntroVideoUrl(result.url || result.file_url || '');
      toast.success('Video uploaded successfully');
    } catch (err) {
      showErrorToast(err, "Couldn't upload the video");
      setIntroVideoFile(null);
    } finally {
      setUploadingVideo(false);
    }
  };

  const handleRemoveVideo = () => {
    setIntroVideoFile(null);
    setIntroVideoUrl('');
  };

  // Round management
  const enabledRounds = rounds.filter(r => r.enabled);
  const totalPercentage = enabledRounds.reduce((sum, r) => sum + r.percentage, 0);
  const percentageValid = totalPercentage === 100;

  // Auto-calculate per-round duration from overall duration and percentage
  const getRoundDuration = (percentage: number) => Math.round(percentage * totalDuration / 100);

  const handleToggleRound = (index: number) => {
    setRounds(prev => prev.map((r, i) => i === index ? { ...r, enabled: !r.enabled } : r));
  };

  const [roundWeightErrors, setRoundWeightErrors] = useState<Record<number, boolean>>({});
  const handleRoundPercentage = (index: number, value: number) => {
    const clamped = Math.min(100, Math.max(0, value));
    setRoundWeightErrors(prev => ({ ...prev, [index]: clamped < 10 }));
    setRounds(prev => prev.map((r, i) => i === index ? { ...r, percentage: clamped } : r));
  };

  // Returns whether the topic was accepted, so the input that called this can
  // decide whether to clear itself (an Enter that got rejected should leave
  // the recruiter's text in place so they can see what to fix).
  const handleAddTopic = (roundIndex: number, topic: string): boolean => {
    if (!topic.trim()) return false;
    const trimmed = topic.trim();
    // Reject decorative punctuation before anything else — a trailing "." or
    // "!" etc. doesn't change what skill is meant, so letting it through here
    // (unlike the Configure page's must/nice-to-have list, this list has no
    // duplicate check at all) would silently let two differently-punctuated
    // spellings of the same topic both survive.
    const invalidChar = findInvalidSkillPunctuation(trimmed);
    if (invalidChar) {
      setTopicInputErrors(prev => ({
        ...prev,
        [roundIndex]: `"${invalidChar}" is not allowed in a skill name — use letters, numbers and spaces only`,
      }));
      return false;
    }
    setTopicInputErrors(prev => {
      if (!(roundIndex in prev)) return prev;
      const next = { ...prev };
      delete next[roundIndex];
      return next;
    });
    setRounds(prev => prev.map((r, i) => {
      if (i !== roundIndex || r.topics.includes(trimmed)) return r;
      const newTopics = [...r.topics, trimmed];
      return { ...r, topics: newTopics, topicWeights: distributeWeights(newTopics) };
    }));
    return true;
  };

  const handleRemoveTopic = (roundIndex: number, topic: string) => {
    setRounds(prev => prev.map((r, i) => {
      if (i !== roundIndex) return r;
      const newTopics = r.topics.filter(t => t !== topic);
      const { [topic]: _w, ...restWeights } = r.topicWeights;
      const { [topic]: _c, ...restComments } = r.topicComments;
      return { ...r, topics: newTopics, topicWeights: distributeWeights(newTopics), topicComments: restComments };
    }));
  };

  const handleTopicWeight = (roundIndex: number, topic: string, weight: number) => {
    const clamped = Math.max(0, Math.min(100, weight));
    const errorKey = `${roundIndex}:${topic}`;
    setTopicWeightErrors(prev => ({ ...prev, [errorKey]: clamped < 10 }));
    setRounds(prev => prev.map((r, i) =>
      i === roundIndex
        ? { ...r, topicWeights: { ...r.topicWeights, [topic]: clamped } }
        : r
    ));
  };

  const handleTopicComment = (roundIndex: number, topic: string, comment: string) => {
    setRounds(prev => prev.map((r, i) =>
      i === roundIndex
        ? { ...r, topicComments: { ...r.topicComments, [topic]: comment } }
        : r
    ));
  };

  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const toggleComment = (roundType: string, topic: string) => {
    const key = `${roundType}:${topic}`;
    setExpandedComments(prev => ({ ...prev, [key]: !prev[key] }));
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
      showErrorToast(error, "Couldn't get topic suggestions", { retry: () => { void handleSuggestTopics(roundIndex); } });
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
      topicComments: {},
      suggestedTopics: [],
      enabled: true,
      order: prev.length + 1,
    }]);
  };

  const handleRemoveRound = (index: number) => {
    setRounds(prev => prev.filter((_, i) => i !== index));
  };

  // Get round type info
  const getRoundInfo = (type: string) => ROUND_TYPES.find(rt => rt.value === type);
  const availableRoundTypes = ROUND_TYPES.filter(rt => !rounds.some(r => r.type === rt.value));

  const buildRoundsConfig = (): AIInterviewRoundConfig[] => {
    return enabledRounds.map(r => ({
      type: r.type,
      percentage: r.percentage,
      duration_minutes: getRoundDuration(r.percentage),
      topics: r.topics,
      topic_weights: Object.keys(r.topicWeights).length > 0 ? r.topicWeights : undefined,
      topic_comments: Object.keys(r.topicComments).filter(k => r.topicComments[k]).length > 0
        ? Object.fromEntries(Object.entries(r.topicComments).filter(([, v]) => v))
        : undefined,
      enabled: true,
      order: r.order,
    }));
  };

  const handleSaveAsDraft = async () => {
    if (!selectedJd || !percentageValid) return;
    setSavingDraft(true);
    try {
      await aiInterviewService.create({
        position: selectedJd.title,
        jd_id: selectedJd.id,
        duration_minutes: totalDuration,
        rounds_config: buildRoundsConfig(),
        recording_enabled: recordingEnabled,
        special_instructions: specialInstructions || undefined,
        title: `${selectedJd.title} - AI Interview`,
        introduction_video_url: introVideoUrl || undefined,
      });
      toast.success('AI Interview configuration saved as draft!');
      onCreated();
    } catch (error) {
      console.error('Failed to save draft:', error);
      showErrorToast(error, "Couldn't save draft");
    } finally {
      setSavingDraft(false);
    }
  };

  const handlePublish = async () => {
    if (!selectedJd || !percentageValid) return;
    setPublishing(true);
    try {
      // Create then immediately publish
      const interview = await aiInterviewService.create({
        position: selectedJd.title,
        jd_id: selectedJd.id,
        duration_minutes: totalDuration,
        rounds_config: buildRoundsConfig(),
        recording_enabled: recordingEnabled,
        special_instructions: specialInstructions || undefined,
        title: `${selectedJd.title} - AI Interview`,
        introduction_video_url: introVideoUrl || undefined,
      });
      await aiInterviewService.publishConfig(interview.id);
      toast.success('AI Interview configuration published!');
      onCreated();
    } catch (error) {
      console.error('Failed to publish:', error);
      showErrorToast(error, "Couldn't publish AI interview configuration");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="tf-page tf-page-pad overflow-y-auto">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <IconButton label="Back" variant="secondary" size="sm" onClick={onBack}>
            <ArrowLeft className="w-5 h-5" />
          </IconButton>
          <div className="w-11 h-11 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
            <Brain className="w-5 h-5 text-brand-blue" />
          </div>
          <div>
            <h1 className="tf-page-title">AI Interview Configuration</h1>
            <p className="tf-body-muted">
              {step === 'select-jd' && 'Step 1: Select a published Job Description'}
              {step === 'configure' && 'Step 2: Configure interview rounds'}
            </p>
          </div>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-2 mb-8">
          {['select-jd', 'configure'].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step === s ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10' :
                ['select-jd', 'configure'].indexOf(step) > i ? 'bg-success-subtle text-success' :
                'bg-slate-100 text-gray-500'
              }`}>
                {['select-jd', 'configure'].indexOf(step) > i ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  i + 1
                )}
              </div>
              <span className={`text-sm ${step === s ? 'text-brand-blue font-medium' : 'text-gray-500'}`}>
                {s === 'select-jd' ? 'Select JD' : 'Configure & Publish'}
              </span>
              {i < 1 && <div className="w-12 h-px bg-gray-200 mx-1" />}
            </div>
          ))}
        </div>

        {/* Step 1: Select JD */}
        {step === 'select-jd' && (
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
              <input
                type="text"
                placeholder="Search job descriptions..."
                value={jdSearch}
                onChange={e => setJdSearch(e.target.value)}
                className="tf-input w-auto flex-1 px-4"
              />
              <Button
                variant="primary"
                size="md"
                onClick={() => router.push('/recruitment/jd-creation?from=ai-interview')}
                icon={<Plus className="w-4 h-4" />}
                className="whitespace-nowrap"
              >
                Create New JD
              </Button>
            </div>

            {loadingJds ? (
              <div className="grid grid-cols-1 gap-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="p-5 tf-card-soft"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <Skeleton className="h-5 w-48" />
                          <Skeleton className="h-5 w-20 rounded-full" />
                        </div>
                        <div className="flex items-center gap-4 mt-1.5">
                          <Skeleton className="h-3.5 w-20" />
                          <Skeleton className="h-3.5 w-16" />
                          <Skeleton className="h-3.5 w-24" />
                          <Skeleton className="h-3.5 w-14" />
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {Array.from({ length: 5 }).map((_, j) => (
                            <Skeleton key={j} className="h-5 w-16 rounded-full" />
                          ))}
                        </div>
                      </div>
                      <Skeleton className="h-4 w-4 rounded flex-shrink-0 mt-1" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredJds.length === 0 ? (
              <div className="text-center py-16 tf-card-soft">
                <Briefcase className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-gray-500 mb-2">No published job descriptions found</p>
                <p className="tf-body-muted mb-4">Create and publish a JD first to configure an AI interview</p>
                <Button variant="primary" size="md" onClick={() => router.push('/recruitment/jd-creation?from=ai-interview')} icon={<Plus className="w-4 h-4" />}>
                  Create Job Description
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {filteredJds.map(jd => (
                  <button
                    key={jd.id}
                    onClick={() => handleSelectJd(jd)}
                    className="w-full text-left p-5 tf-card-soft hover:border-brand-blue/40 hover:ring-brand-blue/20 hover:shadow-md hover:shadow-brand-blue/10 transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <h3 className="font-semibold tracking-tight text-gray-900 truncate min-w-0" title={jd.title}>{jd.title}</h3>
                          <span className="tf-badge bg-success-subtle text-success">Published</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 tf-body-muted">
                          {jd.department && <span>{jd.department}</span>}
                          {jd.location && <span>{jd.location}</span>}
                          {(() => {
                            const exp = formatJdExperience(
                              { jobLevel: jd.job_level, experienceMin: jd.experience_min, experienceMax: jd.experience_max },
                              { includeLevel: true },
                            );
                            return exp ? <span>{exp}</span> : null;
                          })()}
                        </div>
                        {jd.must_have_skills.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {jd.must_have_skills.slice(0, 6).map(skill => (
                              <span key={skill} className="tf-badge bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20">
                                {skill}
                              </span>
                            ))}
                            {jd.must_have_skills.length > 6 && (
                              <span className="tf-hint">+{jd.must_have_skills.length - 6} more</span>
                            )}
                          </div>
                        )}
                      </div>
                      <ArrowLeft className="w-4 h-4 text-gray-500 rotate-180 flex-shrink-0 mt-1" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Configure Rounds */}
        {step === 'configure' && selectedJd && (
          <div className="tf-grid-3">
            {/* Left column: Round configuration */}
            <div className="space-y-4 lg:col-span-2">
              {/* Selected JD info */}
              <div className="tf-card-soft p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="tf-meta mb-1">Selected Job Description</div>
                    <div className="font-semibold tracking-tight text-gray-900">{selectedJd.title}</div>
                    {selectedJd.must_have_skills.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {selectedJd.must_have_skills.slice(0, 5).map(s => (
                          <span key={s} className="tf-badge bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20">{s}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={() => { setStep('select-jd'); setSelectedJd(null); }} className="text-sm text-brand-blue hover:text-brand-blue-2">
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
                      <div key={round.type} className={`rounded-xl ring-1 transition-all ${
                        round.enabled ? 'border border-gray-100 ring-black/[0.02] bg-white shadow-sm shadow-brand-blue/5' : 'border border-gray-100 ring-black/[0.02] bg-slate-50 opacity-60'
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
                                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand-blue/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-gradient-to-r peer-checked:from-brand-blue peer-checked:to-brand-blue-2 peer-checked:shadow-sm peer-checked:shadow-brand-blue/25 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
                              </label>
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${info?.color || 'bg-gray-100 text-gray-700'}`}>
                                <Icon className="w-4 h-4" />
                              </div>
                              <span className="font-medium text-gray-900">{info?.label || round.type}</span>
                              <span className="tf-hint">Round {round.order}</span>
                            </div>
                            {rounds.length > 1 && (
                              <IconButton bare label="Remove round"
                                onClick={() => handleRemoveRound(index)}
                                className="p-1 text-gray-500 hover:text-destructive transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </IconButton>
                            )}
                          </div>

                          {round.enabled && (
                            <>
                              {/* Percentage Weight */}
                              <div className="mb-3">
                                <div className="flex items-center justify-between mb-1">
                                  <label className="tf-meta">Percentage Weight</label>
                                  <span className="tf-hint">{getRoundDuration(round.percentage)} min</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="range"
                                    min={10}
                                    max={100}
                                    step={5}
                                    value={round.percentage}
                                    onChange={e => handleRoundPercentage(index, parseInt(e.target.value))}
                                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-blue"
                                  />
                                  <span className={`text-sm font-medium w-10 text-right ${roundWeightErrors[index] ? 'text-destructive' : 'text-gray-900'}`}>{round.percentage}%</span>
                                </div>
                                {roundWeightErrors[index] && (
                                  <p className="text-2xs text-destructive mt-0.5">Minimum weight is 10%</p>
                                )}
                              </div>

                              {/* Skills / Topics */}
                              <div>
                                <div className="flex items-center justify-between mb-1.5">
                                  <label className="tf-meta">
                                    Skills
                                    {round.topics.length > 0 && (
                                      <span className="ml-1 text-gray-500">({round.topics.length})</span>
                                    )}
                                  </label>
                                  <div className="flex items-center gap-3">
                                    {round.topics.length > 0 && (() => {
                                      const totalSkillWeight = round.topics.reduce((s, t) => s + (round.topicWeights[t] || 0), 0);
                                      return (
                                        <span className={`text-xs font-medium ${totalSkillWeight === 100 ? 'text-success' : 'text-warning'}`}>
                                          Skill weights: {totalSkillWeight}%
                                        </span>
                                      );
                                    })()}
                                    <button
                                      onClick={() => handleSuggestTopics(index)}
                                      disabled={suggestingTopics === round.type}
                                      className="flex items-center gap-1 text-xs text-brand-blue hover:text-brand-blue-2 transition-colors"
                                    >
                                      {suggestingTopics === round.type ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <Sparkles className="w-3 h-3" />
                                      )}
                                      Suggest from JD
                                    </button>
                                  </div>
                                </div>

                                {/* Skill rows with weight + comment */}
                                {round.topics.length > 0 && (
                                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 mb-2">
                                    {round.topics.map(topic => {
                                      const commentKey = `${round.type}:${topic}`;
                                      const isCommentOpen = expandedComments[commentKey];
                                      const skillWeight = round.topicWeights[topic] || 0;
                                      const skillTime = round.percentage > 0
                                        ? ((skillWeight / 100) * getRoundDuration(round.percentage)).toFixed(1)
                                        : '0.0';
                                      const topicErrorKey = `${index}:${topic}`;
                                      const hasTopicWeightError = topicWeightErrors[topicErrorKey];
                                      return (
                                        <div key={topic} className="px-3 py-2">
                                          <div className="flex items-center gap-2">
                                            <span className="tf-meta flex-1 min-w-0 truncate" title={topic}>{topic}</span>
                                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                              <input
                                                type="number"
                                                min={10}
                                                max={100}
                                                value={skillWeight}
                                                onChange={e => handleTopicWeight(index, topic, parseInt(e.target.value) || 0)}
                                                className={`w-12 px-1.5 py-0.5 text-xs text-center border rounded focus:outline-none focus:ring-1 ${
                                                  hasTopicWeightError ? 'border-destructive focus:ring-destructive-line' : 'border-gray-200 focus:ring-brand-blue/40 focus:border-brand-blue'
                                                }`}
                                              />
                                              <span className={`text-xs w-4 ${hasTopicWeightError ? 'text-destructive' : 'text-gray-500'}`}>%</span>
                                              <span className="tf-hint w-14 text-right">{skillTime} min</span>
                                              <IconButton bare label="Add comment"
                                                onClick={() => toggleComment(round.type, topic)}
                                                className={`p-0.5 rounded transition-colors ${
                                                  round.topicComments[topic] ? 'text-brand-blue' : 'text-muted-foreground dark:text-gray-300 hover:text-gray-500'
                                                }`}
                                              >
                                                <MessageCircle className="w-3.5 h-3.5" />
                                              </IconButton>
                                              <IconButton bare label="Close"
                                                onClick={() => handleRemoveTopic(index, topic)}
                                                className="p-0.5 text-muted-foreground dark:text-gray-300 hover:text-destructive transition-colors">
                                                <X className="w-3.5 h-3.5" />
                                              </IconButton>
                                            </div>
                                          </div>
                                          {hasTopicWeightError && (
                                            <p className="text-2xs text-destructive mt-0.5 text-right">Minimum weight is 10%</p>
                                          )}
                                          {isCommentOpen && (
                                            <div className="mt-1.5">
                                              <input
                                                type="text"
                                                placeholder="Add a note or guidance for this skill..."
                                                value={round.topicComments[topic] || ''}
                                                onChange={e => handleTopicComment(index, topic, e.target.value)}
                                                className="w-full px-2.5 py-1 text-xs border border-brand-blue/20 rounded focus:outline-none focus:ring-1 focus:ring-brand-blue/40 focus:border-brand-blue bg-brand-blue/5"
                                              />
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* Suggested topics */}
                                {round.suggestedTopics.length > 0 && (
                                  <div className="mb-2">
                                    <div className="tf-hint mb-1">Suggestions (click to add):</div>
                                    <div className="flex flex-wrap gap-1">
                                      {round.suggestedTopics
                                        .filter(st => !round.topics.includes(st))
                                        .map(st => (
                                          <button
                                            key={st}
                                            onClick={() => handleAddTopic(index, st)}
                                            className="px-2 py-0.5 text-xs bg-brand-blue/5 text-brand-blue rounded-full hover:bg-brand-blue/10 transition-colors ring-1 ring-brand-blue/20"
                                          >
                                            + {st}
                                          </button>
                                        ))}
                                    </div>
                                  </div>
                                )}

                                {/* Add skill input */}
                                <input
                                  type="text"
                                  placeholder="Type a skill name and press Enter to add..."
                                  className={`w-full px-3 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-2 ${
                                    topicInputErrors[index]
                                      ? 'border-destructive-line focus:ring-destructive-line'
                                      : 'border-gray-200 focus:ring-brand-blue/40 focus:border-brand-blue'
                                  }`}
                                  onChange={() => {
                                    if (topicInputErrors[index]) {
                                      setTopicInputErrors(prev => {
                                        const next = { ...prev };
                                        delete next[index];
                                        return next;
                                      });
                                    }
                                  }}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                      const input = e.target as HTMLInputElement;
                                      if (handleAddTopic(index, input.value)) {
                                        input.value = '';
                                      }
                                    }
                                  }}
                                />
                                {topicInputErrors[index] && (
                                  <p className="text-2xs text-destructive mt-0.5">{topicInputErrors[index]}</p>
                                )}
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
                    <div className="tf-meta mb-2">Add another round:</div>
                    <div className="flex flex-wrap gap-2">
                      {availableRoundTypes.map(rt => {
                        const Icon = rt.icon;
                        return (
                          <button
                            key={rt.value}
                            onClick={() => handleAddRound(rt.value)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-dashed border-brand-blue/30 rounded-lg text-brand-blue hover:border-brand-blue hover:bg-brand-blue/5 transition-colors"
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

              {/* Special Instructions */}
              <div>
                <label className="block tf-row-name mb-2">Special Instructions</label>
                <textarea
                  rows={3}
                  placeholder="e.g., Focus on system design skills. Candidate has 5 years of experience in microservices."
                  value={specialInstructions}
                  onChange={e => setSpecialInstructions(e.target.value)}
                  className="tf-textarea resize-none"
                />
              </div>

              {/* Options */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={recordingEnabled}
                  onChange={e => setRecordingEnabled(e.target.checked)}
                  className="tf-checkbox focus:ring-brand-blue/40"
                />
                <span className="tf-body">Auto-record interview</span>
              </label>

              {/* Introduction Video (Optional) */}
              <div>
                <label className="block tf-row-name mb-2">
                  <div className="flex items-center gap-2">
                    <Video className="w-4 h-4" />
                    Introduction Video
                    <span className="text-xs text-gray-500 font-normal">(Optional)</span>
                  </div>
                </label>
                {introVideoFile || introVideoUrl ? (
                  <div className="flex items-center gap-3 p-3 bg-brand-blue/5 border border-brand-blue/20 ring-1 ring-brand-blue/20 rounded-lg">
                    <Video className="w-5 h-5 text-brand-blue flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="tf-body truncate">{introVideoFile?.name || 'Uploaded video'}</p>
                      {introVideoFile && (
                        <p className="tf-hint">{(introVideoFile.size / (1024 * 1024)).toFixed(1)} MB</p>
                      )}
                    </div>
                    {uploadingVideo ? (
                      <Loader2 className="w-4 h-4 animate-spin text-brand-blue" />
                    ) : (
                      <IconButton bare label="Close" onClick={handleRemoveVideo} className="p-1 text-gray-500 hover:text-destructive transition-colors">
                        <X className="w-4 h-4" />
                      </IconButton>
                    )}
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-brand-blue/30 rounded-lg cursor-pointer hover:border-brand-blue hover:bg-brand-blue/5 transition-colors">
                    <Upload className="w-4 h-4 text-brand-blue" />
                    <span className="tf-body-secondary">Click to upload an introduction video</span>
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
                <p className="tf-hint mt-1">
                  Candidates will see this video before the interview starts
                </p>
              </div>
            </div>

            {/* Right column: Summary sidebar */}
            <div className="space-y-4">
              {/* Interview Duration - Slider */}
              <div className="tf-card-soft p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-brand-blue" />
                  <h3 className="font-semibold tracking-tight text-gray-900">Interview Duration</h3>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="15"
                    max="90"
                    step="5"
                    value={totalDuration}
                    onChange={e => setTotalDuration(parseInt(e.target.value))}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-blue"
                  />
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={15}
                      max={90}
                      step={5}
                      value={totalDuration}
                      onChange={e => {
                        const v = parseInt(e.target.value);
                        if (v >= 15 && v <= 90) setTotalDuration(v);
                      }}
                      className="w-14 px-2 py-1.5 border border-gray-200 rounded-lg text-center tf-body focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                    />
                    <span className="tf-body-muted">min</span>
                  </div>
                </div>
                <p className="tf-hint mt-2">Time is split across rounds based on percentage</p>
              </div>

              {/* Summary */}
              <div className="tf-card-soft p-4 sticky top-8">
                <h3 className="font-semibold tracking-tight text-gray-900 mb-3">Interview Summary</h3>

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
                    <span className={`font-medium ${percentageValid ? 'text-success' : 'text-destructive'}`}>
                      {totalPercentage}%
                    </span>
                  </div>

                  {!percentageValid && (
                    <div className="bg-destructive-subtle border border-destructive-line rounded-md p-2 tf-error">
                      Enabled round percentages must total 100%. Currently: {totalPercentage}%
                    </div>
                  )}

                  <div className="border-t border-gray-100 pt-3">
                    <div className="tf-meta mb-2">Time Allocation:</div>
                    {enabledRounds.map(r => {
                      const info = getRoundInfo(r.type);
                      const roundMin = getRoundDuration(r.percentage);
                      return (
                        <div key={r.type} className="py-1.5">
                          <div className="flex items-center justify-between">
                            <span className="tf-meta">{info?.label || r.type}</span>
                            <span className="tf-caption">{r.percentage}% &rarr; {roundMin} min</span>
                          </div>
                          {r.topics.length > 0 && (
                            <div className="mt-0.5 ml-2 space-y-0.5">
                              {r.topics.slice(0, 3).map(t => {
                                const w = r.topicWeights[t] || 0;
                                const tMin = ((w / 100) * roundMin).toFixed(1);
                                return (
                                  <div key={t} className="flex items-center justify-between tf-micro-hint">
                                    <span className="truncate max-w-[120px]">{t}</span>
                                    <span>{w}% / {tMin}m</span>
                                  </div>
                                );
                              })}
                              {r.topics.length > 3 && (
                                <div className="tf-micro-hint">+{r.topics.length - 3} more skills</div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="mt-4 space-y-2">
                  <Button
                    variant="primary"
                    onClick={handlePublish}
                    disabled={!percentageValid || enabledRounds.length === 0 || publishing}
                    icon={publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                    className="w-full"
                  >
                    {publishing ? 'Publishing...' : 'Publish Configuration'}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={handleSaveAsDraft}
                    disabled={!percentageValid || enabledRounds.length === 0 || savingDraft}
                    icon={savingDraft ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    className="w-full"
                  >
                    {savingDraft ? 'Saving...' : 'Save as Draft'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
