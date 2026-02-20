'use client';

import { Video, Calendar, Users, CheckCircle, Play, MoreVertical, Settings, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { recordAIInterview } from '@/lib/services/usageTrackingService';
import { toast } from 'sonner';
import { useAuth } from '@/lib/hooks/useAuth';

export default function AIInterview() {
  const { user, isTenantAdmin } = useAuth();
  const canRunAiInterviews = isTenantAdmin || (user?.permissions?.canRunAiInterviews ?? false);

  const [activeTab, setActiveTab] = useState<'scheduled' | 'completed' | 'settings'>('scheduled');

  // Handler for scheduling an interview - tracks usage
  const handleScheduleInterview = () => {
    // In a real app, this would open a modal to schedule
    // For now, track the usage when scheduling
    recordAIInterview(`interview-${Date.now()}`, {
      action: 'schedule',
      type: 'new_interview'
    });
    toast.info('Interview scheduling feature coming soon!');
  };

  // Handler for starting an interview - tracks usage
  const handleStartInterview = (interviewId: number, candidateName: string) => {
    recordAIInterview(`interview-${interviewId}`, {
      action: 'start',
      candidate: candidateName
    });
    toast.info(`Starting AI interview with ${candidateName}...`);
  };

  const interviews = [
    {
      id: 1,
      candidateName: 'Sarah Williams',
      position: 'Senior Java Developer',
      scheduledDate: '2025-11-30 10:00 AM',
      status: 'Scheduled',
      type: 'Technical',
      duration: '45 min',
    },
    {
      id: 2,
      candidateName: 'Michael Chen',
      position: 'Product Manager',
      scheduledDate: '2025-11-30 02:00 PM',
      status: 'Scheduled',
      type: 'Behavioral',
      duration: '30 min',
    },
    {
      id: 3,
      candidateName: 'Emily Rodriguez',
      position: 'UI/UX Designer',
      scheduledDate: '2025-11-29 11:00 AM',
      status: 'Completed',
      type: 'Portfolio Review',
      duration: '40 min',
      score: 85,
    },
    {
      id: 4,
      candidateName: 'David Kim',
      position: 'DevOps Engineer',
      scheduledDate: '2025-11-28 03:30 PM',
      status: 'Completed',
      type: 'Technical',
      duration: '50 min',
      score: 92,
    },
  ];

  const filteredInterviews = interviews.filter((interview) => {
    if (activeTab === 'scheduled') return interview.status === 'Scheduled';
    if (activeTab === 'completed') return interview.status === 'Completed';
    return true;
  });

  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-2">AI Interview Platform</h1>
            <p className="text-sm text-gray-600">
              Conduct automated AI-powered interviews with candidates
            </p>
          </div>
          {canRunAiInterviews && (
            <button
              onClick={handleScheduleInterview}
              className="flex items-center gap-2 bg-gray-800 text-white px-6 py-2.5 rounded-md hover:bg-gray-900 transition-colors"
            >
              <Calendar className="w-5 h-5" />
              Schedule Interview
            </button>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 mb-6">
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                <Video className="w-5 h-5 text-gray-800" />
              </div>
              <span className="text-sm text-gray-500">Total Interviews</span>
            </div>
            <div className="text-3xl text-gray-900">342</div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-green-600" />
              </div>
              <span className="text-sm text-gray-500">Scheduled</span>
            </div>
            <div className="text-3xl text-gray-900">24</div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-gray-800" />
              </div>
              <span className="text-sm text-gray-500">Completed</span>
            </div>
            <div className="text-3xl text-gray-900">318</div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-yellow-100 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-yellow-600" />
              </div>
              <span className="text-sm text-gray-500">Avg. Score</span>
            </div>
            <div className="text-3xl text-gray-900">78%</div>
          </div>
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          {/* Tabs */}
          <div className="border-b border-gray-200 px-3 sm:px-6">
            <div className="flex gap-3 sm:gap-6 overflow-x-auto scrollbar-hide">
              <button
                onClick={() => setActiveTab('scheduled')}
                className={`py-3 sm:py-4 text-xs sm:text-sm border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'scheduled'
                    ? 'border-gray-800 text-gray-800'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                <span className="hidden sm:inline">Scheduled Interviews</span>
                <span className="sm:hidden">Scheduled</span>
              </button>
              <button
                onClick={() => setActiveTab('completed')}
                className={`py-3 sm:py-4 text-xs sm:text-sm border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'completed'
                    ? 'border-gray-800 text-gray-800'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                <span className="hidden sm:inline">Completed Interviews</span>
                <span className="sm:hidden">Completed</span>
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`py-3 sm:py-4 text-xs sm:text-sm border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'settings'
                    ? 'border-gray-800 text-gray-800'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                <span className="hidden sm:inline">Interview Settings</span>
                <span className="sm:hidden">Settings</span>
              </button>
            </div>
          </div>

          {/* Interview List */}
          {activeTab !== 'settings' && (
            <div className="p-3 sm:p-6">
              <div className="space-y-3 sm:space-y-4">
                {filteredInterviews.map((interview) => (
                  <div
                    key={interview.id}
                    className="flex flex-col lg:flex-row lg:items-center lg:justify-between p-4 sm:p-6 border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-md transition-all gap-3 lg:gap-4"
                  >
                    <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs sm:text-sm text-gray-700">
                          {interview.candidateName.split(' ').map(n => n[0]).join('')}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm sm:text-base text-gray-900 mb-1 truncate">{interview.candidateName}</h3>
                        <div className="text-xs sm:text-sm text-gray-600 mb-2 truncate">{interview.position}</div>
                        <div className="flex flex-wrap items-center gap-2 sm:gap-4 lg:gap-6 text-xs sm:text-sm text-gray-600">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                            {interview.scheduledDate}
                          </span>
                          <span className="flex items-center gap-1">
                            <Video className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                            {interview.type}
                          </span>
                          <span>{interview.duration}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 lg:gap-6 flex-shrink-0 pl-13 sm:pl-16 lg:pl-0">
                      {interview.status === 'Completed' && interview.score && (
                        <div className="text-right">
                          <div className="text-xs sm:text-sm text-gray-500 mb-1">Score</div>
                          <div className="text-lg sm:text-2xl text-green-600">{interview.score}%</div>
                        </div>
                      )}
                      <div>
                        <span
                          className={`px-2 sm:px-3 py-1 rounded-full text-xs whitespace-nowrap ${
                            interview.status === 'Scheduled'
                              ? 'bg-gray-100 text-gray-900'
                              : 'bg-green-100 text-green-700'
                          }`}
                        >
                          {interview.status}
                        </span>
                      </div>
                      {interview.status === 'Scheduled' && canRunAiInterviews && (
                        <button className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm bg-gray-800 text-white rounded-md hover:bg-gray-900 transition-colors whitespace-nowrap">
                          <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          Start
                        </button>
                      )}
                      {interview.status === 'Completed' && (
                        <button className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors whitespace-nowrap">
                          View Report
                        </button>
                      )}
                      <button className="p-1.5 sm:p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors flex-shrink-0">
                        <MoreVertical className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="p-3 sm:p-6">
              <div className="max-w-3xl space-y-6">
                <div>
                  <h3 className="text-gray-900 mb-4">Interview Configuration</h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-gray-700 mb-2">
                        Default Interview Duration
                      </label>
                      <select className="w-full px-4 py-2 text-gray-900 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white">
                        <option>30 minutes</option>
                        <option>45 minutes</option>
                        <option>60 minutes</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm text-gray-700 mb-2">
                        AI Voice Language
                      </label>
                      <select className="w-full px-4 py-2 text-gray-900 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white">
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
                        defaultChecked
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
                        defaultChecked
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
                        defaultChecked
                        className="rounded border-gray-300 text-gray-800 focus:ring-gray-600"
                      />
                      <label htmlFor="ai-analysis" className="text-sm text-gray-700">
                        Enable AI-powered sentiment analysis
                      </label>
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-gray-200">
                  <button className="px-6 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-900 transition-colors">
                    Save Settings
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Interview Templates */}
        {activeTab === 'scheduled' && (
          <div className="mt-6 sm:mt-8 bg-white rounded-lg border border-gray-200 shadow-sm p-4 sm:p-6">
            <h2 className="text-sm sm:text-base text-gray-900 mb-4">Interview Templates</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
              {[
                { name: 'Technical Round', icon: '💻', questions: 15 },
                { name: 'Behavioral Interview', icon: '🧠', questions: 12 },
                { name: 'Culture Fit', icon: '🤝', questions: 10 },
                { name: 'Leadership Assessment', icon: '👔', questions: 8 },
                { name: 'Problem Solving', icon: '🧩', questions: 20 },
                { name: 'Custom Template', icon: '✏️', questions: 0 },
              ].map((template, index) => (
                <div
                  key={index}
                  className="p-3 sm:p-4 border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-md transition-all cursor-pointer"
                >
                  <div className="text-2xl sm:text-3xl mb-2">{template.icon}</div>
                  <div className="text-xs sm:text-sm text-gray-900 mb-1">{template.name}</div>
                  <div className="text-xs text-gray-500">{template.questions} questions</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
