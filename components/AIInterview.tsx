'use client';

import { Video, Calendar, Users, CheckCircle, Play, MoreVertical, Settings, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { recordAIInterview } from '@/lib/services/usageTrackingService';

export default function AIInterview() {
  const [activeTab, setActiveTab] = useState<'scheduled' | 'completed' | 'settings'>('scheduled');

  // Handler for scheduling an interview - tracks usage
  const handleScheduleInterview = () => {
    // In a real app, this would open a modal to schedule
    // For now, track the usage when scheduling
    recordAIInterview(`interview-${Date.now()}`, {
      action: 'schedule',
      type: 'new_interview'
    });
    alert('Interview scheduling feature coming soon!');
  };

  // Handler for starting an interview - tracks usage
  const handleStartInterview = (interviewId: number, candidateName: string) => {
    recordAIInterview(`interview-${interviewId}`, {
      action: 'start',
      candidate: candidateName
    });
    alert(`Starting AI interview with ${candidateName}...`);
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
            onClick={handleScheduleInterview}
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-md hover:bg-blue-700 transition-colors"
          >
            <Calendar className="w-5 h-5" />
            Schedule Interview
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-6 mb-6">
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <Video className="w-5 h-5 text-blue-600" />
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
              <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-purple-600" />
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
          <div className="border-b border-gray-200 px-6">
            <div className="flex gap-6">
              <button
                onClick={() => setActiveTab('scheduled')}
                className={`py-4 text-sm border-b-2 transition-colors ${
                  activeTab === 'scheduled'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Scheduled Interviews
              </button>
              <button
                onClick={() => setActiveTab('completed')}
                className={`py-4 text-sm border-b-2 transition-colors ${
                  activeTab === 'completed'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Completed Interviews
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`py-4 text-sm border-b-2 transition-colors ${
                  activeTab === 'settings'
                    ? 'border-blue-600 text-blue-600'
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
              <div className="space-y-4">
                {filteredInterviews.map((interview) => (
                  <div
                    key={interview.id}
                    className="flex items-center justify-between p-6 border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-md transition-all"
                  >
                    <div className="flex items-start gap-4 flex-1">
                      <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm text-gray-700">
                          {interview.candidateName.split(' ').map(n => n[0]).join('')}
                        </span>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-gray-900 mb-1">{interview.candidateName}</h3>
                        <div className="text-sm text-gray-600 mb-2">{interview.position}</div>
                        <div className="flex items-center gap-6 text-sm text-gray-600">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {interview.scheduledDate}
                          </span>
                          <span className="flex items-center gap-1">
                            <Video className="w-4 h-4" />
                            {interview.type}
                          </span>
                          <span>{interview.duration}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      {interview.status === 'Completed' && interview.score && (
                        <div className="text-right">
                          <div className="text-sm text-gray-500 mb-1">Score</div>
                          <div className="text-2xl text-green-600">{interview.score}%</div>
                        </div>
                      )}
                      <div>
                        <span
                          className={`px-3 py-1 rounded-full text-xs ${
                            interview.status === 'Scheduled'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-green-100 text-green-700'
                          }`}
                        >
                          {interview.status}
                        </span>
                      </div>
                      {interview.status === 'Scheduled' && (
                        <button className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
                          <Play className="w-4 h-4" />
                          Start
                        </button>
                      )}
                      {interview.status === 'Completed' && (
                        <button className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
                          View Report
                        </button>
                      )}
                      <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors">
                        <MoreVertical className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
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
                      <select className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600">
                        <option>30 minutes</option>
                        <option>45 minutes</option>
                        <option>60 minutes</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm text-gray-700 mb-2">
                        AI Voice Language
                      </label>
                      <select className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600">
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
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-600"
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
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-600"
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
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-600"
                      />
                      <label htmlFor="ai-analysis" className="text-sm text-gray-700">
                        Enable AI-powered sentiment analysis
                      </label>
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-gray-200">
                  <button className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
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
                  className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-md transition-all cursor-pointer"
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
    </div>
  );
}
