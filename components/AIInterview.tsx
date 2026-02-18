'use client';

import { Video, Calendar, Users, CheckCircle, Play, MoreVertical, Settings, TrendingUp, Mail, X, Clock, FileText, Copy, ExternalLink, Send, Plus, Trash2, AlertTriangle, Info, Loader2 } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { recordAIInterview } from '@/lib/services/usageTrackingService';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import type { AIInterviewResponse, AIInterviewStatsResponse, AIInterviewSettingsResponse } from '@/lib/services/aiInterviewService';
import { toast } from 'sonner';

interface Candidate {
  fullName: string;
  email: string;
}

interface SelectedInterview {
  id: string;
  candidateName: string;
  position: string;
  type: string;
  duration: string;
  questions?: number;
  interview_token?: string;
}

export default function AIInterview() {
  const [activeTab, setActiveTab] = useState<'scheduled' | 'completed' | 'settings'>('scheduled');
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [selectedInterview, setSelectedInterview] = useState<SelectedInterview | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([{ fullName: '', email: '' }]);
  const [emailMessage, setEmailMessage] = useState('');

  // API data state
  const [interviews, setInterviews] = useState<AIInterviewResponse[]>([]);
  const [stats, setStats] = useState<AIInterviewStatsResponse | null>(null);
  const [settings, setSettings] = useState<AIInterviewSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Schedule Interview modal state
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    candidate_name: '',
    candidate_email: '',
    position: '',
    interview_type: 'technical',
    duration_minutes: 30,
    total_questions: 15,
    scheduled_date: '',
    scheduled_time: '',
    ai_voice_language: 'English (US)',
    recording_enabled: true,
    send_email_reminder: true,
    enable_ai_analysis: true,
    custom_questions: '',
    special_instructions: '',
  });
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false);
  const [formTouched, setFormTouched] = useState(false);

  // Settings form state
  const [settingsDuration, setSettingsDuration] = useState(30);
  const [settingsLanguage, setSettingsLanguage] = useState('English (US)');
  const [settingsAutoRecord, setSettingsAutoRecord] = useState(true);
  const [settingsReminders, setSettingsReminders] = useState(true);
  const [settingsSentiment, setSettingsSentiment] = useState(true);

  // 3-dot menu state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // View Report modal state
  const [viewReportInterview, setViewReportInterview] = useState<AIInterviewResponse | null>(null);

  // Load data from API
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [interviewsRes, statsRes] = await Promise.all([
        aiInterviewService.list(),
        aiInterviewService.getStats(),
      ]);
      setInterviews(interviewsRes.items);
      setStats(statsRes);
    } catch (error) {
      console.error('Failed to load AI interview data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const settingsRes = await aiInterviewService.getSettings();
      setSettings(settingsRes);
      setSettingsDuration(settingsRes.default_duration);
      setSettingsLanguage(settingsRes.ai_voice_language);
      setSettingsAutoRecord(settingsRes.auto_record);
      setSettingsReminders(settingsRes.send_reminders);
      setSettingsSentiment(settingsRes.ai_sentiment_analysis);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (activeTab === 'settings') {
      loadSettings();
    }
  }, [activeTab, loadSettings]);

  // Click-outside handler for 3-dot menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    if (openMenuId) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenuId]);

  const interviewLink = selectedInterview
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/ai-interview/${selectedInterview.interview_token || selectedInterview.id}`
    : '';

  const isFormValid = candidates.some(c => c.fullName.trim() !== '' && c.email.trim() !== '' && c.email.includes('@'));
  const filledCandidateCount = candidates.filter(c => c.fullName.trim() !== '' && c.email.trim() !== '').length;

  const handleOpenEmailModal = (interview: SelectedInterview) => {
    setSelectedInterview(interview);
    setCandidates([{ fullName: '', email: '' }]);
    setEmailMessage('');
    setShowEmailModal(true);
  };

  const handleCloseEmailModal = () => {
    setShowEmailModal(false);
    setSelectedInterview(null);
  };

  const handleAddCandidate = () => {
    setCandidates([...candidates, { fullName: '', email: '' }]);
  };

  const handleRemoveCandidate = (index: number) => {
    if (candidates.length > 1) {
      setCandidates(candidates.filter((_, i) => i !== index));
    }
  };

  const handleCandidateChange = (index: number, field: keyof Candidate, value: string) => {
    const updated = [...candidates];
    updated[index][field] = value;
    setCandidates(updated);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(interviewLink);
    toast.success('AI-Interview link copied to clipboard!');
  };

  const handleOpenLink = () => {
    window.open(interviewLink, '_blank');
  };

  const handleCopyInterviewLink = (interview: AIInterviewResponse) => {
    const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/ai-interview/${interview.interview_token || interview.id}`;
    navigator.clipboard.writeText(link);
    toast.success('Interview link copied!');
  };

  const handleCancelInterview = async (interview: AIInterviewResponse) => {
    if (!confirm(`Cancel interview for ${interview.candidate_name}?`)) return;
    try {
      await aiInterviewService.cancelInterview(interview.id);
      toast.success('Interview cancelled');
      loadData();
    } catch (error) {
      console.error('Failed to cancel interview:', error);
      toast.error('Failed to cancel interview');
    }
    setOpenMenuId(null);
  };

  const handleDeleteInterview = async (interview: AIInterviewResponse) => {
    if (!confirm(`Delete interview for ${interview.candidate_name}? This cannot be undone.`)) return;
    try {
      await aiInterviewService.delete(interview.id);
      toast.success('Interview deleted');
      loadData();
    } catch (error) {
      console.error('Failed to delete interview:', error);
      toast.error('Failed to delete interview');
    }
    setOpenMenuId(null);
  };

  const handleSendInvitations = async () => {
    const validCandidates = candidates.filter(c => c.fullName.trim() && c.email.trim());
    if (!selectedInterview || validCandidates.length === 0) return;

    try {
      await aiInterviewService.sendInvite(selectedInterview.id, {
        candidates: validCandidates,
        message: emailMessage || undefined,
      });
      validCandidates.forEach(c => {
        recordAIInterview(`interview-${selectedInterview.id}`, {
          action: 'send_email',
          candidate: c.fullName,
          email: c.email,
        });
      });
      toast.success(`AI Interview invitation sent to ${validCandidates.length} candidate(s)!`);
      handleCloseEmailModal();
      loadData();
    } catch (error) {
      console.error('Failed to send invitations:', error);
      toast.error('Failed to send invitations');
    }
  };

  const handleOpenScheduleModal = (type?: string, questions?: number) => {
    setScheduleForm({
      candidate_name: '',
      candidate_email: '',
      position: '',
      interview_type: type || 'technical',
      duration_minutes: 30,
      total_questions: questions || 15,
      scheduled_date: '',
      scheduled_time: '',
      ai_voice_language: 'English (US)',
      recording_enabled: true,
      send_email_reminder: true,
      enable_ai_analysis: true,
      custom_questions: '',
      special_instructions: '',
    });
    setFormTouched(false);
    setShowScheduleModal(true);
  };

  const handleCloseScheduleModal = () => {
    setShowScheduleModal(false);
  };

  const handleScheduleFormChange = (field: string, value: any) => {
    setScheduleForm(prev => ({ ...prev, [field]: value }));
  };

  const isScheduleFormValid =
    scheduleForm.candidate_name.trim() !== '' &&
    scheduleForm.candidate_email.trim() !== '' &&
    scheduleForm.candidate_email.includes('@') &&
    scheduleForm.position.trim() !== '' &&
    scheduleForm.scheduled_date !== '' &&
    scheduleForm.scheduled_time !== '';

  const handleSubmitSchedule = async () => {
    setFormTouched(true);
    if (!isScheduleFormValid || scheduleSubmitting) return;

    setScheduleSubmitting(true);
    try {
      let scheduled_at: string | undefined;
      if (scheduleForm.scheduled_date && scheduleForm.scheduled_time) {
        scheduled_at = new Date(`${scheduleForm.scheduled_date}T${scheduleForm.scheduled_time}`).toISOString();
      } else if (scheduleForm.scheduled_date) {
        scheduled_at = new Date(`${scheduleForm.scheduled_date}T09:00:00`).toISOString();
      }

      const customQuestionsArray = scheduleForm.custom_questions
        .split('\n')
        .map(q => q.trim())
        .filter(q => q.length > 0);

      await aiInterviewService.create({
        candidate_name: scheduleForm.candidate_name.trim(),
        candidate_email: scheduleForm.candidate_email.trim(),
        position: scheduleForm.position.trim(),
        interview_type: scheduleForm.interview_type,
        duration_minutes: scheduleForm.duration_minutes,
        total_questions: scheduleForm.total_questions,
        scheduled_at,
        recording_enabled: scheduleForm.recording_enabled,
        send_email_reminder: scheduleForm.send_email_reminder,
        enable_ai_analysis: scheduleForm.enable_ai_analysis,
        ai_voice_language: scheduleForm.ai_voice_language,
        custom_questions: customQuestionsArray.length > 0 ? customQuestionsArray : undefined,
        special_instructions: scheduleForm.special_instructions.trim() || undefined,
      });

      recordAIInterview(`interview-${Date.now()}`, {
        action: 'schedule',
        type: scheduleForm.interview_type,
      });

      toast.success('Interview scheduled successfully!');
      setShowScheduleModal(false);
      loadData();
    } catch (error) {
      console.error('Failed to schedule interview:', error);
      toast.error('Failed to schedule interview');
    } finally {
      setScheduleSubmitting(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      const result = await aiInterviewService.saveSettings({
        default_duration: settingsDuration,
        ai_voice_language: settingsLanguage,
        auto_record: settingsAutoRecord,
        send_reminders: settingsReminders,
        ai_sentiment_analysis: settingsSentiment,
      });
      setSettings(result);
      toast.success('Settings saved successfully!');
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Failed to save settings');
    }
  };

  // Map API status to display status
  const getDisplayStatus = (status: string) => {
    const statusMap: Record<string, string> = {
      draft: 'Scheduled',
      scheduled: 'Scheduled',
      invited: 'Scheduled',
      consent_pending: 'Scheduled',
      system_check: 'Scheduled',
      in_progress: 'In Progress',
      completed: 'Completed',
      cancelled: 'Cancelled',
      expired: 'Expired',
    };
    return statusMap[status] || status;
  };

  const filteredInterviews = interviews.filter((interview) => {
    const displayStatus = getDisplayStatus(interview.status);
    if (activeTab === 'scheduled') return displayStatus === 'Scheduled';
    if (activeTab === 'completed') return displayStatus === 'Completed';
    return true;
  });

  // Template definitions
  const templates = [
    { name: 'Technical Round', icon: '\uD83D\uDCBB', type: 'technical', questions: 15 },
    { name: 'Behavioral Interview', icon: '\uD83E\uDDE0', type: 'behavioral', questions: 12 },
    { name: 'Culture Fit', icon: '\uD83E\uDD1D', type: 'culture_fit', questions: 10 },
    { name: 'Leadership Assessment', icon: '\uD83D\uDC54', type: 'leadership', questions: 8 },
    { name: 'Problem Solving', icon: '\uD83E\uDDE9', type: 'problem_solving', questions: 20 },
    { name: 'Custom Template', icon: '\u270F\uFE0F', type: 'custom', questions: 15 },
  ];

  // Loading state
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
          <p className="text-sm text-gray-500">Loading AI interviews...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-8 overflow-y-auto">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-gray-900 mb-2">AI Interview Platform</h1>
            <p className="text-sm text-gray-600">
              Conduct automated AI-powered interviews with candidates
            </p>
          </div>
          <button
            onClick={() => handleOpenScheduleModal()}
            className="flex items-center gap-2 bg-gray-800 text-white px-6 py-2.5 rounded-md hover:bg-gray-900 transition-colors"
          >
            <Calendar className="w-5 h-5" />
            Schedule Interview
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-6 mb-6">
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                <Video className="w-5 h-5 text-gray-800" />
              </div>
              <span className="text-sm text-gray-500">Total Interviews</span>
            </div>
            <div className="text-3xl text-gray-900">{stats?.total_interviews ?? 0}</div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-green-600" />
              </div>
              <span className="text-sm text-gray-500">Scheduled</span>
            </div>
            <div className="text-3xl text-gray-900">{stats?.scheduled ?? 0}</div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-gray-800" />
              </div>
              <span className="text-sm text-gray-500">Completed</span>
            </div>
            <div className="text-3xl text-gray-900">{stats?.completed ?? 0}</div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-yellow-100 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-yellow-600" />
              </div>
              <span className="text-sm text-gray-500">Avg. Score</span>
            </div>
            <div className="text-3xl text-gray-900">{stats?.average_score != null ? `${stats.average_score}%` : '-'}</div>
          </div>
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          {/* Tabs */}
          <div className="border-b border-gray-200 px-6">
            <div className="flex gap-6">
              <button
                onClick={() => setActiveTab('scheduled')}
                className={`py-4 text-sm border-b-2 transition-colors ${
                  activeTab === 'scheduled'
                    ? 'border-gray-800 text-gray-800'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Scheduled Interviews
              </button>
              <button
                onClick={() => setActiveTab('completed')}
                className={`py-4 text-sm border-b-2 transition-colors ${
                  activeTab === 'completed'
                    ? 'border-gray-800 text-gray-800'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Completed Interviews
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`py-4 text-sm border-b-2 transition-colors ${
                  activeTab === 'settings'
                    ? 'border-gray-800 text-gray-800'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Interview Settings
              </button>
            </div>
          </div>

          {/* Interview List */}
          {activeTab !== 'settings' && (
            <div className="p-6">
              {filteredInterviews.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Video className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-sm">No {activeTab} interviews yet</p>
                </div>
              ) : (
              <div className="space-y-4">
                {filteredInterviews.map((interview) => {
                  const displayStatus = getDisplayStatus(interview.status);
                  return (
                  <div
                    key={interview.id}
                    className="flex items-center justify-between p-6 border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-md transition-all"
                  >
                    <div className="flex items-start gap-4 flex-1">
                      <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm text-gray-700">
                          {interview.candidate_name.split(' ').map(n => n[0]).join('')}
                        </span>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-gray-900 mb-1">{interview.candidate_name}</h3>
                        <div className="text-sm text-gray-600 mb-2">{interview.position}</div>
                        <div className="flex items-center gap-6 text-sm text-gray-600">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {interview.scheduled_at
                              ? new Date(interview.scheduled_at).toLocaleString()
                              : new Date(interview.created_at).toLocaleString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <Video className="w-4 h-4" />
                            {interview.interview_type}
                          </span>
                          <span>{interview.duration_minutes} min</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      {displayStatus === 'Completed' && interview.score && (
                        <div className="text-right">
                          <div className="text-sm text-gray-500 mb-1">Score</div>
                          <div className="text-2xl text-green-600">{Number(interview.score)}%</div>
                        </div>
                      )}
                      <div>
                        <span
                          className={`px-3 py-1 rounded-full text-xs ${
                            displayStatus === 'Scheduled'
                              ? 'bg-gray-100 text-gray-900'
                              : displayStatus === 'Completed'
                              ? 'bg-green-100 text-green-700'
                              : displayStatus === 'In Progress'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {displayStatus}
                        </span>
                      </div>
                      {displayStatus === 'Scheduled' && (
                        <>
                          <button
                            onClick={() => handleOpenEmailModal({
                              id: interview.id,
                              candidateName: interview.candidate_name,
                              position: interview.position,
                              type: interview.interview_type,
                              duration: `${interview.duration_minutes} min`,
                              questions: interview.total_questions,
                              interview_token: interview.interview_token,
                            })}
                            className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-700 text-white rounded-md hover:bg-gray-800 transition-colors"
                          >
                            <Mail className="w-4 h-4" />
                            Send via Email
                          </button>
                          <button
                            onClick={() => handleCopyInterviewLink(interview)}
                            className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-800 text-white rounded-md hover:bg-gray-900 transition-colors"
                          >
                            <Copy className="w-4 h-4" />
                            Copy Link
                          </button>
                        </>
                      )}
                      {displayStatus === 'Completed' && (
                        <button
                          onClick={() => setViewReportInterview(interview)}
                          className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                        >
                          View Report
                        </button>
                      )}
                      {/* 3-dot menu */}
                      <div className="relative" ref={openMenuId === interview.id ? menuRef : undefined}>
                        <button
                          onClick={() => setOpenMenuId(openMenuId === interview.id ? null : interview.id)}
                          className="p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                        >
                          <MoreVertical className="w-5 h-5" />
                        </button>
                        {openMenuId === interview.id && (
                          <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                            <button
                              onClick={() => { handleCopyInterviewLink(interview); setOpenMenuId(null); }}
                              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                              <Copy className="w-4 h-4" />
                              Copy Link
                            </button>
                            {displayStatus === 'Scheduled' && (
                              <button
                                onClick={() => handleCancelInterview(interview)}
                                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                              >
                                <X className="w-4 h-4" />
                                Cancel Interview
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteInterview(interview)}
                              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete Interview
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
              )}
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="p-6">
              <div className="max-w-3xl space-y-6">
                <div>
                  <h3 className="text-gray-900 mb-4">Interview Configuration</h3>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-gray-700 mb-2">
                        Default Interview Duration
                      </label>
                      <select
                        value={settingsDuration}
                        onChange={(e) => setSettingsDuration(parseInt(e.target.value))}
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600"
                      >
                        <option value="30">30 minutes</option>
                        <option value="45">45 minutes</option>
                        <option value="60">60 minutes</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm text-gray-700 mb-2">
                        AI Voice Language
                      </label>
                      <select
                        value={settingsLanguage}
                        onChange={(e) => setSettingsLanguage(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600"
                      >
                        <option>English (US)</option>
                        <option>English (UK)</option>
                        <option>Spanish</option>
                        <option>French</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="auto-record"
                        checked={settingsAutoRecord}
                        onChange={(e) => setSettingsAutoRecord(e.target.checked)}
                        className="rounded border-gray-300 text-gray-800 focus:ring-gray-600"
                      />
                      <label htmlFor="auto-record" className="text-sm text-gray-700">
                        Automatically record all interviews
                      </label>
                    </div>

                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="send-reminders"
                        checked={settingsReminders}
                        onChange={(e) => setSettingsReminders(e.target.checked)}
                        className="rounded border-gray-300 text-gray-800 focus:ring-gray-600"
                      />
                      <label htmlFor="send-reminders" className="text-sm text-gray-700">
                        Send reminder emails to candidates
                      </label>
                    </div>

                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="ai-analysis"
                        checked={settingsSentiment}
                        onChange={(e) => setSettingsSentiment(e.target.checked)}
                        className="rounded border-gray-300 text-gray-800 focus:ring-gray-600"
                      />
                      <label htmlFor="ai-analysis" className="text-sm text-gray-700">
                        Enable AI-powered sentiment analysis
                      </label>
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-gray-200">
                  <button
                    onClick={handleSaveSettings}
                    className="px-6 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-900 transition-colors"
                  >
                    Save Settings
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Interview Templates */}
        {activeTab === 'scheduled' && (
          <div className="mt-8 bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <h2 className="text-gray-900 mb-4">Interview Templates</h2>
            <div className="grid grid-cols-3 gap-4">
              {templates.map((template, index) => (
                <div
                  key={index}
                  onClick={() => handleOpenScheduleModal(template.type, template.questions)}
                  className="p-4 border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-md transition-all cursor-pointer"
                >
                  <div className="text-3xl mb-2">{template.icon}</div>
                  <div className="text-sm text-gray-900 mb-1">{template.name}</div>
                  <div className="text-xs text-gray-500">{template.questions} questions</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Schedule Interview Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="bg-gray-900 px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gray-700 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-white font-semibold">Schedule AI Interview</h2>
                  <p className="text-gray-300 text-sm">Set up a new AI-powered interview session</p>
                </div>
              </div>
              <button onClick={handleCloseScheduleModal} className="text-gray-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Candidate Information */}
              <div>
                <h3 className="font-medium text-gray-900 mb-3">Candidate Information</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Candidate Name *</label>
                    <input
                      type="text"
                      placeholder="e.g., John Doe"
                      value={scheduleForm.candidate_name}
                      onChange={(e) => handleScheduleFormChange('candidate_name', e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
                    />
                    {formTouched && !scheduleForm.candidate_name.trim() && (
                      <p className="text-xs text-red-500 mt-1">Candidate name is required</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Email Address *</label>
                    <input
                      type="email"
                      placeholder="e.g., john.doe@email.com"
                      value={scheduleForm.candidate_email}
                      onChange={(e) => handleScheduleFormChange('candidate_email', e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
                    />
                    {formTouched && (!scheduleForm.candidate_email.trim() || !scheduleForm.candidate_email.includes('@')) && (
                      <p className="text-xs text-red-500 mt-1">Valid email is required</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Position *</label>
                    <input
                      type="text"
                      placeholder="e.g., Senior Software Engineer"
                      value={scheduleForm.position}
                      onChange={(e) => handleScheduleFormChange('position', e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
                    />
                    {formTouched && !scheduleForm.position.trim() && (
                      <p className="text-xs text-red-500 mt-1">Position is required</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Interview Template */}
              <div>
                <h3 className="font-medium text-gray-900 mb-3">Interview Template</h3>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: 'technical', label: 'Technical', icon: '\uD83D\uDCBB', questions: 15 },
                    { value: 'behavioral', label: 'Behavioral', icon: '\uD83E\uDDE0', questions: 12 },
                    { value: 'culture_fit', label: 'Culture Fit', icon: '\uD83E\uDD1D', questions: 10 },
                    { value: 'leadership', label: 'Leadership', icon: '\uD83D\uDC54', questions: 8 },
                    { value: 'problem_solving', label: 'Problem Solving', icon: '\uD83E\uDDE9', questions: 20 },
                    { value: 'custom', label: 'Custom', icon: '\u270F\uFE0F', questions: 15 },
                  ].map((template) => (
                    <button
                      key={template.value}
                      type="button"
                      onClick={() => {
                        handleScheduleFormChange('interview_type', template.value);
                        handleScheduleFormChange('total_questions', template.questions);
                      }}
                      className={`p-3 border rounded-lg text-left transition-all ${
                        scheduleForm.interview_type === template.value
                          ? 'border-gray-800 bg-gray-50 ring-1 ring-gray-800'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="text-2xl mb-1">{template.icon}</div>
                      <div className="text-sm font-medium text-gray-900">{template.label}</div>
                      <div className="text-xs text-gray-500">{template.questions} questions</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Schedule & Settings */}
              <div>
                <h3 className="font-medium text-gray-900 mb-3">Schedule & Settings</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Date *</label>
                    <input
                      type="date"
                      value={scheduleForm.scheduled_date}
                      onChange={(e) => handleScheduleFormChange('scheduled_date', e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
                    />
                    {formTouched && !scheduleForm.scheduled_date && (
                      <p className="text-xs text-red-500 mt-1">Date is required</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Time *</label>
                    <input
                      type="time"
                      value={scheduleForm.scheduled_time}
                      onChange={(e) => handleScheduleFormChange('scheduled_time', e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
                    />
                    {formTouched && !scheduleForm.scheduled_time && (
                      <p className="text-xs text-red-500 mt-1">Time is required</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Duration</label>
                    <select
                      value={scheduleForm.duration_minutes}
                      onChange={(e) => handleScheduleFormChange('duration_minutes', parseInt(e.target.value))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
                    >
                      <option value={15}>15 minutes</option>
                      <option value={30}>30 minutes</option>
                      <option value={45}>45 minutes</option>
                      <option value={60}>60 minutes</option>
                      <option value={90}>90 minutes</option>
                      <option value={120}>120 minutes</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">AI Voice Language</label>
                    <select
                      value={scheduleForm.ai_voice_language}
                      onChange={(e) => handleScheduleFormChange('ai_voice_language', e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
                    >
                      <option>English (US)</option>
                      <option>English (UK)</option>
                      <option>Spanish</option>
                      <option>French</option>
                      <option>German</option>
                      <option>Hindi</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Interview Options */}
              <div>
                <h3 className="font-medium text-gray-900 mb-3">Interview Options</h3>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={scheduleForm.send_email_reminder}
                      onChange={(e) => handleScheduleFormChange('send_email_reminder', e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-gray-800 focus:ring-gray-500"
                    />
                    <div>
                      <span className="text-sm text-gray-700">Send Email Reminder</span>
                      <p className="text-xs text-gray-400">Candidate receives reminder before interview</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={scheduleForm.recording_enabled}
                      onChange={(e) => handleScheduleFormChange('recording_enabled', e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-gray-800 focus:ring-gray-500"
                    />
                    <div>
                      <span className="text-sm text-gray-700">Auto-Record Interview</span>
                      <p className="text-xs text-gray-400">Automatically record video and audio</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={scheduleForm.enable_ai_analysis}
                      onChange={(e) => handleScheduleFormChange('enable_ai_analysis', e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-gray-800 focus:ring-gray-500"
                    />
                    <div>
                      <span className="text-sm text-gray-700">Enable AI Analysis</span>
                      <p className="text-xs text-gray-400">AI evaluates responses, sentiment, and engagement</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Custom Questions */}
              <div>
                <h3 className="font-medium text-gray-900 mb-2">Custom Questions</h3>
                <p className="text-xs text-gray-400 mb-2">Add custom questions (one per line). These will be included in addition to template questions.</p>
                <textarea
                  rows={4}
                  placeholder={"e.g., Tell me about a time you solved a complex problem\nWhat is your approach to code reviews?\nHow do you handle tight deadlines?"}
                  value={scheduleForm.custom_questions}
                  onChange={(e) => handleScheduleFormChange('custom_questions', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 resize-none"
                />
              </div>

              {/* Special Instructions */}
              <div>
                <h3 className="font-medium text-gray-900 mb-2">Special Instructions</h3>
                <p className="text-xs text-gray-400 mb-2">Optional notes for the AI interviewer about this session.</p>
                <textarea
                  rows={3}
                  placeholder="e.g., Focus on system design skills. Candidate has 5 years of experience in microservices."
                  value={scheduleForm.special_instructions}
                  onChange={(e) => handleScheduleFormChange('special_instructions', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 resize-none"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-between">
              <span className="text-sm text-gray-500">
                {scheduleForm.interview_type.replace('_', ' ')} interview &bull; {scheduleForm.duration_minutes} min &bull; {scheduleForm.total_questions} questions
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleCloseScheduleModal}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitSchedule}
                  disabled={(!isScheduleFormValid && formTouched) || scheduleSubmitting}
                  className={`flex items-center gap-2 px-5 py-2 text-sm rounded-md transition-colors ${
                    isScheduleFormValid && !scheduleSubmitting
                      ? 'bg-gray-800 text-white hover:bg-gray-900'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {scheduleSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Calendar className="w-4 h-4" />
                  )}
                  {scheduleSubmitting ? 'Scheduling...' : 'Schedule Interview'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Send via Email Modal */}
      {showEmailModal && selectedInterview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header - Black/Dark Grey */}
            <div className="bg-gray-900 px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gray-700 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-white font-semibold">Share AI Interview via Email</h2>
                  <p className="text-gray-300 text-sm">{selectedInterview.position} - AI Interview</p>
                </div>
              </div>
              <button onClick={handleCloseEmailModal} className="text-gray-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Interview Info Card */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <div className="font-medium text-gray-900">{selectedInterview.position} - AI Interview</div>
                  <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {selectedInterview.duration}
                    </span>
                    <span>
                      {selectedInterview.questions || 15} questions
                    </span>
                    <span>{selectedInterview.type}</span>
                  </div>
                </div>
              </div>

              {/* Select Candidates */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-gray-900">Select Candidates</h3>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-gray-500">Enter candidate details manually</p>
                    <button
                      onClick={handleAddCandidate}
                      className="flex items-center gap-1 text-sm text-gray-700 hover:text-gray-900 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Add Candidate
                    </button>
                  </div>
                  <div className="space-y-3">
                    {candidates.map((candidate, index) => (
                      <div key={index} className="flex items-center gap-3 border border-gray-200 rounded-lg p-3">
                        <div className="flex-1 grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Full Name</label>
                            <input
                              type="text"
                              placeholder="e.g., John Doe"
                              value={candidate.fullName}
                              onChange={(e) => handleCandidateChange(index, 'fullName', e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Email Address</label>
                            <input
                              type="email"
                              placeholder="e.g., john.doe@email.com"
                              value={candidate.email}
                              onChange={(e) => handleCandidateChange(index, 'email', e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
                            />
                          </div>
                        </div>
                        {candidates.length > 1 && (
                          <button
                            onClick={() => handleRemoveCandidate(index)}
                            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* AI-Interview Link */}
              <div>
                <h3 className="font-medium text-gray-900 mb-2">AI-Interview Link</h3>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={interviewLink}
                    className="flex-1 px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-md text-gray-600"
                  />
                  <button
                    onClick={handleCopyLink}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                    Copy
                  </button>
                  <button
                    onClick={handleOpenLink}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm bg-gray-800 text-white rounded-md hover:bg-gray-900 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1.5">
                  This unique link will be included in the email invitation and opens the interview in a new page
                </p>
              </div>

              {/* Email Message */}
              <div>
                <h3 className="font-medium text-gray-900 mb-2">Email Message</h3>
                <textarea
                  rows={3}
                  placeholder="Add a custom message to include in the invitation email (optional)"
                  value={emailMessage}
                  onChange={(e) => setEmailMessage(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 resize-none"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-between">
              <span className="text-sm text-gray-500">
                {filledCandidateCount} candidate{filledCandidateCount !== 1 ? 's' : ''} will receive this AI interview
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleCloseEmailModal}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendInvitations}
                  disabled={!isFormValid}
                  className={`flex items-center gap-2 px-5 py-2 text-sm rounded-md transition-colors ${
                    isFormValid
                      ? 'bg-gray-800 text-white hover:bg-gray-900'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <Send className="w-4 h-4" />
                  Send Invitations
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Report Modal */}
      {viewReportInterview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-gray-900 px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gray-700 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-white font-semibold">Interview Report</h2>
                  <p className="text-gray-300 text-sm">{viewReportInterview.candidate_name}</p>
                </div>
              </div>
              <button onClick={() => setViewReportInterview(null)} className="text-gray-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="text-xs text-gray-500 mb-1">Candidate</div>
                  <div className="font-medium text-gray-900">{viewReportInterview.candidate_name}</div>
                </div>
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="text-xs text-gray-500 mb-1">Position</div>
                  <div className="font-medium text-gray-900">{viewReportInterview.position}</div>
                </div>
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="text-xs text-gray-500 mb-1">Score</div>
                  <div className="font-medium text-gray-900 text-lg">
                    {viewReportInterview.score != null ? `${Number(viewReportInterview.score)}%` : 'N/A'}
                  </div>
                </div>
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="text-xs text-gray-500 mb-1">Status</div>
                  <div className="font-medium text-gray-900">{getDisplayStatus(viewReportInterview.status)}</div>
                </div>
                <div className="border border-gray-200 rounded-lg p-4 col-span-2">
                  <div className="text-xs text-gray-500 mb-1">Completed</div>
                  <div className="font-medium text-gray-900">
                    {viewReportInterview.completed_at
                      ? new Date(viewReportInterview.completed_at).toLocaleString()
                      : 'N/A'}
                  </div>
                </div>
              </div>
            </div>
            <div className="border-t border-gray-200 px-6 py-4 flex justify-end">
              <button
                onClick={() => setViewReportInterview(null)}
                className="px-5 py-2 text-sm bg-gray-800 text-white rounded-md hover:bg-gray-900 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
