'use client';

import { ArrowLeft, Briefcase, Clock, Plus, X, Sparkles, CheckCircle2, Loader2, Users, Brain, Shield, TrendingUp, MessageSquare, Lightbulb, Trash2, Save, Globe, Video, Upload, MessageCircle } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import type { PublishedJD, AIInterviewRoundConfig } from '@/lib/services/aiInterviewService';
import { toast } from 'sonner';

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
  { value: 'must_have_skills', label: 'Must-To-Have', icon: Shield, color: 'bg-red-100 text-red-700' },
  { value: 'nice_to_have_skills', label: 'Nice-To-Have', icon: Lightbulb, color: 'bg-amber-100 text-amber-700' },
  { value: 'hr', label: 'HR', icon: Users, color: 'bg-blue-100 text-blue-700' },
  { value: 'technical', label: 'Technical', icon: Brain, color: 'bg-purple-100 text-purple-700' },
  { value: 'behavioral', label: 'Behavioral', icon: MessageSquare, color: 'bg-green-100 text-green-700' },
  { value: 'culture_fit', label: 'Culture Fit', icon: TrendingUp, color: 'bg-yellow-100 text-yellow-700' },
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

  // Load published JDs
  const loadJDs = useCallback(async () => {
    try {
      setLoadingJds(true);
      const result = await aiInterviewService.getPublishedJDs();
      setJds(result.items);
    } catch (error) {
      console.error('Failed to load JDs:', error);
      toast.error('Failed to load job descriptions');
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

  const handleAddTopic = (roundIndex: number, topic: string) => {
    if (!topic.trim()) return;
    const trimmed = topic.trim();
    setRounds(prev => prev.map((r, i) => {
      if (i !== roundIndex || r.topics.includes(trimmed)) return r;
      const newTopics = [...r.topics, trimmed];
      return { ...r, topics: newTopics, topicWeights: distributeWeights(newTopics) };
    }));
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
      toast.error('Failed to save draft');
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
      toast.error('Failed to publish configuration');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="flex-1 p-8 overflow-y-auto bg-slate-50">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button onClick={onBack} className="p-2 hover:bg-brand-blue/5 hover:text-brand-blue rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="w-11 h-11 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
            <Brain className="w-5 h-5 text-brand-blue" />
          </div>
          <div>
            <h1 className="text-gray-900 text-xl font-semibold tracking-tight">AI Interview Configuration</h1>
            <p className="text-sm text-gray-500">
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
                ['select-jd', 'configure'].indexOf(step) > i ? 'bg-green-100 text-green-700' :
                'bg-slate-100 text-gray-400'
              }`}>
                {['select-jd', 'configure'].indexOf(step) > i ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  i + 1
                )}
              </div>
              <span className={`text-sm ${step === s ? 'text-brand-blue font-medium' : 'text-gray-400'}`}>
                {s === 'select-jd' ? 'Select JD' : 'Configure & Publish'}
              </span>
              {i < 1 && <div className="w-12 h-px bg-gray-200 mx-1" />}
            </div>
          ))}
        </div>

        {/* Step 1: Select JD */}
        {step === 'select-jd' && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <input
                type="text"
                placeholder="Search job descriptions..."
                value={jdSearch}
                onChange={e => setJdSearch(e.target.value)}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
              />
              <button
                onClick={() => router.push('/recruitment/jd-creation?from=ai-interview')}
                className="flex items-center gap-2 px-4 py-2.5 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Create New JD
              </button>
            </div>

            {loadingJds ? (
              <div className="flex items-center justify-center py-16 tf-loader-center">
                <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
                <span className="ml-2 text-sm text-gray-500">Loading job descriptions...</span>
              </div>
            ) : filteredJds.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
                <Briefcase className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-gray-500 mb-2">No published job descriptions found</p>
                <p className="text-sm text-gray-400 mb-4">Create and publish a JD first to configure an AI interview</p>
                <button
                  onClick={() => router.push('/recruitment/jd-creation?from=ai-interview')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Create Job Description
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {filteredJds.map(jd => (
                  <button
                    key={jd.id}
                    onClick={() => handleSelectJd(jd)}
                    className="w-full text-left p-5 bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 hover:border-brand-blue/40 hover:ring-brand-blue/20 hover:shadow-md hover:shadow-brand-blue/10 transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold tracking-tight text-gray-900">{jd.title}</h3>
                          <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">Published</span>
                        </div>
                        <div className="flex items-center gap-4 mt-1.5 text-sm text-gray-500">
                          {jd.department && <span>{jd.department}</span>}
                          {jd.job_level && <span className="capitalize">{jd.job_level}</span>}
                          {jd.location && <span>{jd.location}</span>}
                          {jd.experience_min != null && (
                            <span>
                              {jd.experience_min}{jd.experience_max ? `-${jd.experience_max}` : '+'} yrs
                            </span>
                          )}
                        </div>
                        {jd.must_have_skills.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {jd.must_have_skills.slice(0, 6).map(skill => (
                              <span key={skill} className="px-2 py-0.5 bg-brand-blue/5 text-brand-blue text-xs rounded-full ring-1 ring-brand-blue/20">
                                {skill}
                              </span>
                            ))}
                            {jd.must_have_skills.length > 6 && (
                              <span className="text-xs text-gray-400">+{jd.must_have_skills.length - 6} more</span>
                            )}
                          </div>
                        )}
                      </div>
                      <ArrowLeft className="w-4 h-4 text-gray-400 rotate-180 flex-shrink-0 mt-1" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Configure Rounds */}
        {step === 'configure' && selectedJd && (
          <div className="grid grid-cols-3 gap-6">
            {/* Left column: Round configuration */}
            <div className="col-span-2 space-y-4">
              {/* Selected JD info */}
              <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Selected Job Description</div>
                    <div className="font-semibold tracking-tight text-gray-900">{selectedJd.title}</div>
                    {selectedJd.must_have_skills.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {selectedJd.must_have_skills.slice(0, 5).map(s => (
                          <span key={s} className="px-2 py-0.5 bg-brand-blue/5 text-brand-blue text-xs rounded-full ring-1 ring-brand-blue/20">{s}</span>
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
                                    min={10}
                                    max={100}
                                    step={5}
                                    value={round.percentage}
                                    onChange={e => handleRoundPercentage(index, parseInt(e.target.value))}
                                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-blue"
                                  />
                                  <span className={`text-sm font-medium w-10 text-right ${roundWeightErrors[index] ? 'text-red-500' : 'text-gray-900'}`}>{round.percentage}%</span>
                                </div>
                                {roundWeightErrors[index] && (
                                  <p className="text-[11px] text-red-500 mt-0.5">Minimum weight is 10%</p>
                                )}
                              </div>

                              {/* Skills / Topics */}
                              <div>
                                <div className="flex items-center justify-between mb-1.5">
                                  <label className="text-xs text-gray-500">
                                    Skills
                                    {round.topics.length > 0 && (
                                      <span className="ml-1 text-gray-400">({round.topics.length})</span>
                                    )}
                                  </label>
                                  <div className="flex items-center gap-3">
                                    {round.topics.length > 0 && (() => {
                                      const totalSkillWeight = round.topics.reduce((s, t) => s + (round.topicWeights[t] || 0), 0);
                                      return (
                                        <span className={`text-xs font-medium ${totalSkillWeight === 100 ? 'text-green-600' : 'text-amber-600'}`}>
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
                                            <span className="text-xs text-gray-700 flex-1 min-w-0 truncate" title={topic}>{topic}</span>
                                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                              <input
                                                type="number"
                                                min={10}
                                                max={100}
                                                value={skillWeight}
                                                onChange={e => handleTopicWeight(index, topic, parseInt(e.target.value) || 0)}
                                                className={`w-12 px-1.5 py-0.5 text-xs text-center border rounded focus:outline-none focus:ring-1 ${
                                                  hasTopicWeightError ? 'border-red-400 focus:ring-red-400' : 'border-gray-200 focus:ring-brand-blue/40 focus:border-brand-blue'
                                                }`}
                                              />
                                              <span className={`text-xs w-4 ${hasTopicWeightError ? 'text-red-500' : 'text-gray-400'}`}>%</span>
                                              <span className="text-xs text-gray-400 w-14 text-right">{skillTime} min</span>
                                              <button
                                                onClick={() => toggleComment(round.type, topic)}
                                                className={`p-0.5 rounded transition-colors ${
                                                  round.topicComments[topic] ? 'text-brand-blue' : 'text-gray-300 hover:text-gray-500'
                                                }`}
                                                aria-label="Add comment" title="Add comment"
                                              >
                                                <MessageCircle className="w-3.5 h-3.5" />
                                              </button>
                                              <button
                                                onClick={() => handleRemoveTopic(index, topic)}
                                                className="p-0.5 text-gray-300 hover:text-red-500 transition-colors"
                                               aria-label="Close">
                                                <X className="w-3.5 h-3.5" />
                                              </button>
                                            </div>
                                          </div>
                                          {hasTopicWeightError && (
                                            <p className="text-[11px] text-red-500 mt-0.5 text-right">Minimum weight is 10%</p>
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
                                    <div className="text-xs text-gray-400 mb-1">Suggestions (click to add):</div>
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
                                  className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
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
                <label className="block text-sm font-medium text-gray-900 mb-2">Special Instructions</label>
                <textarea
                  rows={3}
                  placeholder="e.g., Focus on system design skills. Candidate has 5 years of experience in microservices."
                  value={specialInstructions}
                  onChange={e => setSpecialInstructions(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue resize-none"
                />
              </div>

              {/* Options */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={recordingEnabled}
                  onChange={e => setRecordingEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-brand-blue focus:ring-brand-blue/40"
                />
                <span className="text-sm text-gray-700">Auto-record interview</span>
              </label>

              {/* Introduction Video (Optional) */}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  <div className="flex items-center gap-2">
                    <Video className="w-4 h-4" />
                    Introduction Video
                    <span className="text-xs text-gray-400 font-normal">(Optional)</span>
                  </div>
                </label>
                {introVideoFile || introVideoUrl ? (
                  <div className="flex items-center gap-3 p-3 bg-brand-blue/5 border border-brand-blue/20 ring-1 ring-brand-blue/20 rounded-lg">
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
                      <button onClick={handleRemoveVideo} className="p-1 text-gray-400 hover:text-red-500 transition-colors" aria-label="Close">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-brand-blue/30 rounded-lg cursor-pointer hover:border-brand-blue hover:bg-brand-blue/5 transition-colors">
                    <Upload className="w-4 h-4 text-brand-blue" />
                    <span className="text-sm text-gray-600">Click to upload an introduction video</span>
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
                <p className="text-xs text-gray-400 mt-1">
                  Candidates will see this video before the interview starts
                </p>
              </div>
            </div>

            {/* Right column: Summary sidebar */}
            <div className="space-y-4">
              {/* Interview Duration - Slider */}
              <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4">
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
                      className="w-14 px-2 py-1.5 border border-gray-200 rounded-lg text-center text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                    />
                    <span className="text-sm text-gray-500">min</span>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-2">Time is split across rounds based on percentage</p>
              </div>

              {/* Summary */}
              <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4 sticky top-8">
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
                    <span className={`font-medium ${percentageValid ? 'text-green-600' : 'text-red-500'}`}>
                      {totalPercentage}%
                    </span>
                  </div>

                  {!percentageValid && (
                    <div className="bg-red-50 border border-red-200 rounded-md p-2 text-xs text-red-600">
                      Enabled round percentages must total 100%. Currently: {totalPercentage}%
                    </div>
                  )}

                  <div className="border-t border-gray-100 pt-3">
                    <div className="text-xs text-gray-500 mb-2">Time Allocation:</div>
                    {enabledRounds.map(r => {
                      const info = getRoundInfo(r.type);
                      const roundMin = getRoundDuration(r.percentage);
                      return (
                        <div key={r.type} className="py-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-600">{info?.label || r.type}</span>
                            <span className="text-xs font-medium text-gray-900">{r.percentage}% &rarr; {roundMin} min</span>
                          </div>
                          {r.topics.length > 0 && (
                            <div className="mt-0.5 ml-2 space-y-0.5">
                              {r.topics.slice(0, 3).map(t => {
                                const w = r.topicWeights[t] || 0;
                                const tMin = ((w / 100) * roundMin).toFixed(1);
                                return (
                                  <div key={t} className="flex items-center justify-between text-[10px] text-gray-400">
                                    <span className="truncate max-w-[120px]">{t}</span>
                                    <span>{w}% / {tMin}m</span>
                                  </div>
                                );
                              })}
                              {r.topics.length > 3 && (
                                <div className="text-[10px] text-gray-400">+{r.topics.length - 3} more skills</div>
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
                  <button
                    onClick={handlePublish}
                    disabled={!percentageValid || enabledRounds.length === 0 || publishing}
                    className={`w-full flex items-center justify-center gap-2 py-2.5 text-sm rounded-lg transition-colors ${
                      percentageValid && enabledRounds.length > 0 && !publishing
                        ? 'bg-brand-blue hover:bg-brand-blue-2 text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10'
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
                    disabled={!percentageValid || enabledRounds.length === 0 || savingDraft}
                    className={`w-full flex items-center justify-center gap-2 py-2.5 text-sm rounded-lg transition-colors border bg-white ${
                      percentageValid && enabledRounds.length > 0 && !savingDraft
                        ? 'border-gray-200 text-gray-700 hover:bg-slate-100'
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
        )}
      </div>
    </div>
  );
}
