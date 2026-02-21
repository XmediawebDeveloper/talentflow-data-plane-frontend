'use client';

import { Activity, Users, TrendingUp, BarChart3, Download, Filter, Calendar } from 'lucide-react';
import { useState } from 'react';
import FeatureGate from '@/components/shared/FeatureGate';

const mockTeamUsage = [
  { id: '1', name: 'John Admin', role: 'Admin', resumesScored: 145, assessmentsCreated: 12, interviews: 8, lastActive: '2 min ago' },
  { id: '2', name: 'Sarah Recruiter', role: 'Recruiter', resumesScored: 234, assessmentsCreated: 18, interviews: 15, lastActive: '1 hour ago' },
  { id: '3', name: 'Mike Viewer', role: 'Viewer', resumesScored: 0, assessmentsCreated: 0, interviews: 0, lastActive: '3 hours ago' },
  { id: '4', name: 'Emily HR', role: 'Recruiter', resumesScored: 189, assessmentsCreated: 9, interviews: 12, lastActive: '2 days ago' },
];

export default function TeamUsagePage() {
  const [timeRange, setTimeRange] = useState('30days');

  const totalStats = {
    totalResumes: mockTeamUsage.reduce((sum, u) => sum + u.resumesScored, 0),
    totalAssessments: mockTeamUsage.reduce((sum, u) => sum + u.assessmentsCreated, 0),
    totalInterviews: mockTeamUsage.reduce((sum, u) => sum + u.interviews, 0),
    activeUsers: mockTeamUsage.filter(u => u.lastActive.includes('min') || u.lastActive.includes('hour')).length,
  };

  return (
    <FeatureGate feature="teams">
    <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl flex items-center justify-center shadow-lg">
                <Activity className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-gray-900">Team Usage Analytics</h1>
                <p className="text-sm text-gray-600">Monitor your team's platform activity</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500"
              >
                <option value="7days">Last 7 days</option>
                <option value="30days">Last 30 days</option>
                <option value="90days">Last 90 days</option>
              </select>
              <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                <Download className="w-4 h-4" />
                Export
              </button>
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Resumes Scored</p>
                <p className="text-3xl font-semibold text-gray-900 mt-1">{totalStats.totalResumes}</p>
              </div>
              <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-gray-800" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Assessments Created</p>
                <p className="text-3xl font-semibold text-gray-900 mt-1">{totalStats.totalAssessments}</p>
              </div>
              <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-gray-800" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">AI Interviews</p>
                <p className="text-3xl font-semibold text-gray-900 mt-1">{totalStats.totalInterviews}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <Activity className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active Users</p>
                <p className="text-3xl font-semibold text-gray-900 mt-1">{totalStats.activeUsers}</p>
              </div>
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Team Usage Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Individual Usage</h2>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Team Member</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Resumes Scored</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assessments</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Interviews</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {mockTeamUsage.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-800 to-gray-900 text-white flex items-center justify-center text-sm">
                        {(user.name || 'U').split(' ').map(n => n[0]).join('')}
                      </div>
                      <span className="font-medium text-gray-900">{user.name || 'Unknown'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{user.role}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{user.resumesScored}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{user.assessmentsCreated}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{user.interviews}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.lastActive}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
    </FeatureGate>
  );
}
