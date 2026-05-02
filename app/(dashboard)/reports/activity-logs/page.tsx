'use client';

import { BarChart3, Search, Filter, Download, Clock, User, FileText, Target, Video, Settings, Calendar } from 'lucide-react';
import { useState } from 'react';

const mockActivityLogs = [
  { id: '1', user: 'John Admin', action: 'Created job posting', details: 'Senior Frontend Developer', timestamp: '2 min ago', category: 'jobs' },
  { id: '2', user: 'Sarah Recruiter', action: 'Scored resumes', details: '15 resumes for Product Manager', timestamp: '15 min ago', category: 'scoring' },
  { id: '3', user: 'Sarah Recruiter', action: 'Scheduled interview', details: 'AI Interview for Mike Johnson', timestamp: '1 hour ago', category: 'interview' },
  { id: '4', user: 'Emily HR', action: 'Created assessment', details: 'Technical Assessment - React', timestamp: '2 hours ago', category: 'assessment' },
  { id: '5', user: 'John Admin', action: 'Updated settings', details: 'Changed notification preferences', timestamp: '3 hours ago', category: 'settings' },
  { id: '6', user: 'Mike Viewer', action: 'Viewed resume', details: 'Sarah Johnson - UX Designer', timestamp: '4 hours ago', category: 'view' },
  { id: '7', user: 'Sarah Recruiter', action: 'Uploaded resumes', details: '8 resumes uploaded', timestamp: '5 hours ago', category: 'upload' },
  { id: '8', user: 'John Admin', action: 'Added team member', details: 'Added Emily HR to team', timestamp: '1 day ago', category: 'team' },
];

const categoryIcons: Record<string, React.ReactNode> = {
  jobs: <FileText className="w-4 h-4" />,
  scoring: <Target className="w-4 h-4" />,
  interview: <Video className="w-4 h-4" />,
  assessment: <BarChart3 className="w-4 h-4" />,
  settings: <Settings className="w-4 h-4" />,
  view: <User className="w-4 h-4" />,
  upload: <FileText className="w-4 h-4" />,
  team: <User className="w-4 h-4" />,
};

const categoryColors: Record<string, string> = {
  jobs: 'bg-gray-100 text-gray-800',
  scoring: 'bg-gray-100 text-gray-800',
  interview: 'bg-green-100 text-green-600',
  assessment: 'bg-orange-100 text-orange-600',
  settings: 'bg-gray-100 text-gray-600',
  view: 'bg-yellow-100 text-yellow-600',
  upload: 'bg-gray-100 text-gray-800',
  team: 'bg-pink-100 text-pink-600',
};

export default function ActivityLogsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');

  const categories = ['all', ...new Set(mockActivityLogs.map(log => log.category))];

  const filteredLogs = mockActivityLogs.filter(log => {
    const matchesSearch =
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.details.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === 'all' || log.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-5 sm:mb-6 lg:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
                <BarChart3 className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 tracking-tight">Activity Logs</h1>
                <p className="text-xs sm:text-sm text-gray-600">Track all activities across your organization</p>
              </div>
            </div>
            <button className="inline-flex items-center justify-center gap-2 h-10 px-3 sm:px-4 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors self-end sm:self-auto">
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export Logs</span>
              <span className="sm:hidden">Export</span>
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-5 sm:mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search activities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-9 sm:pl-10 pr-3 sm:pr-4 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 outline-none"
            />
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="h-10 px-3 sm:px-4 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 outline-none"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* Activity Timeline */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="divide-y divide-gray-200">
            {filteredLogs.map((log) => (
              <div key={log.id} className="p-3 sm:p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${categoryColors[log.category]}`}>
                    {categoryIcons[log.category]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm sm:text-base font-medium text-gray-900 truncate">{log.action}</p>
                        <p className="text-xs sm:text-sm text-gray-500 truncate">{log.details}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs sm:text-sm text-gray-500 whitespace-nowrap">{log.timestamp}</p>
                        <p className="text-[10px] sm:text-xs text-gray-400 whitespace-nowrap">{log.user}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {filteredLogs.length === 0 && (
          <div className="text-center py-12">
            <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No activities found</h3>
            <p className="text-sm text-gray-500">Try adjusting your search or filters.</p>
          </div>
        )}
      </div>
    </main>
  );
}
