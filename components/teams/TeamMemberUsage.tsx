'use client';

import { useState, useEffect } from 'react';
import {
  Users,
  FileText,
  ClipboardCheck,
  Upload,
  Briefcase,
  Loader2,
  AlertCircle,
  Calendar,
  TrendingUp,
  Clock,
  ChevronDown,
  ChevronUp,
  Download,
} from 'lucide-react';
import {
  exportToCSV,
  formatMemberUsageForExport,
  MEMBER_USAGE_COLUMNS,
} from '@/lib/utils/exportUtils';
import teamService, { TeamMembersUsageSummary, TeamMemberUsage as MemberUsage } from '@/lib/services/teamService';
import { Skeleton } from '@/components/ui/skeleton';
import { Team } from '@/lib/services/teamService';
import { formatISTDate } from '@/lib/utils/dateUtils';

interface TeamMemberUsageProps {
  team: Team;
  userRole: string;
  onClose?: () => void;
}

const UNIT_TYPE_CONFIG = {
  RS: { label: 'Resume Scoring', icon: FileText, color: 'bg-blue-500', textColor: 'text-blue-600' },
  AS: { label: 'Assessment', icon: ClipboardCheck, color: 'bg-green-500', textColor: 'text-green-600' },
  AIU: { label: 'AI Interview', icon: Users, color: 'bg-purple-500', textColor: 'text-purple-600' },
  RU: { label: 'Resume Upload', icon: Upload, color: 'bg-orange-500', textColor: 'text-orange-600' },
};

export default function TeamMemberUsage({ team, userRole, onClose }: TeamMemberUsageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [membersUsage, setMembersUsage] = useState<TeamMembersUsageSummary | null>(null);
  const [selectedDays, setSelectedDays] = useState(30);
  const [sortBy, setSortBy] = useState<'total' | 'name' | 'recent'>('total');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const isTenantAdmin = userRole === 'tenant_admin' || userRole === 'owner' || userRole === 'admin';

  useEffect(() => {
    if (isTenantAdmin) {
      fetchMembersUsage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDays, team.id, isTenantAdmin]);

  const fetchMembersUsage = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await teamService.getTeamMembersUsage(team.id, selectedDays);
      setMembersUsage(data);
    } catch (err: any) {
      console.error('Error fetching members usage:', err);
      setError(err.response?.data?.detail?.message || err.message || 'Failed to load member usage');
    } finally {
      setIsLoading(false);
    }
  };

  const sortedMembers = () => {
    if (!membersUsage?.members) return [];

    return [...membersUsage.members].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'total':
          comparison = a.total_consumed - b.total_consumed;
          break;
        case 'name':
          comparison = a.user_name.localeCompare(b.user_name);
          break;
        case 'recent':
          const aDate = a.last_activity ? new Date(a.last_activity).getTime() : 0;
          const bDate = b.last_activity ? new Date(b.last_activity).getTime() : 0;
          comparison = aDate - bDate;
          break;
      }

      return sortOrder === 'desc' ? -comparison : comparison;
    });
  };

  const toggleSort = (field: 'total' | 'name' | 'recent') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const handleExport = () => {
    if (!membersUsage?.members) return;

    const formattedData = formatMemberUsageForExport(membersUsage.members);
    const dateStr = new Date().toISOString().split('T')[0];
    const teamSlug = team.name.toLowerCase().replace(/\s+/g, '-');
    exportToCSV(formattedData, MEMBER_USAGE_COLUMNS, `${teamSlug}-member-usage-${dateStr}`);
  };

  const formatLastActivity = (dateStr: string | null) => {
    if (!dateStr) return 'Never';

    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatISTDate(dateStr);
  };

  if (!isTenantAdmin) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center">
        <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-yellow-800 mb-2">Access Restricted</h3>
        <p className="text-yellow-700">
          Only administrators can view individual member usage data.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-lg" />
            <div>
              <Skeleton className="h-5 w-48 mb-1" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <Skeleton className="h-8 w-32" />
        </div>

        {/* Table Skeleton */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-6 py-3">
            <div className="flex gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-4 w-20" />
              ))}
            </div>
          </div>
          <div className="divide-y divide-gray-200">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="px-6 py-4 flex items-center gap-4">
                <Skeleton className="w-8 h-8 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-32 mb-1" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-6 w-12" />
                <Skeleton className="h-6 w-12" />
                <Skeleton className="h-6 w-12" />
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-red-800 mb-2">Error Loading Data</h3>
        <p className="text-red-700">{error}</p>
        <button
          onClick={fetchMembersUsage}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const members = sortedMembers();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{team.name} - Member Usage</h3>
            <p className="text-sm text-gray-600">Individual usage breakdown</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-500" />
            <select
              value={selectedDays}
              onChange={(e) => setSelectedDays(Number(e.target.value))}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-800 focus:border-transparent outline-none"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={60}>Last 60 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </div>
          {membersUsage?.members && membersUsage.members.length > 0 && (
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Members Table */}
      {members.length > 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full" role="table" aria-label="Team member usage statistics">
            <thead className="bg-gray-50">
              <tr>
                <th
                  onClick={() => toggleSort('name')}
                  onKeyDown={(e) => e.key === 'Enter' && toggleSort('name')}
                  tabIndex={0}
                  role="columnheader"
                  aria-sort={sortBy === 'name' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-gray-800"
                >
                  <div className="flex items-center gap-1">
                    Member
                    {sortBy === 'name' && (sortOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                  </div>
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Resume Scoring
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Assessment
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  AI Interview
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Resume Upload
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  JDs
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Assessments
                </th>
                <th
                  onClick={() => toggleSort('total')}
                  onKeyDown={(e) => e.key === 'Enter' && toggleSort('total')}
                  tabIndex={0}
                  role="columnheader"
                  aria-sort={sortBy === 'total' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-gray-800"
                >
                  <div className="flex items-center justify-center gap-1">
                    Total
                    {sortBy === 'total' && (sortOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('recent')}
                  onKeyDown={(e) => e.key === 'Enter' && toggleSort('recent')}
                  tabIndex={0}
                  role="columnheader"
                  aria-sort={sortBy === 'recent' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-gray-800"
                >
                  <div className="flex items-center justify-end gap-1">
                    Last Active
                    {sortBy === 'recent' && (sortOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {members.map((member, index) => (
                <tr key={member.user_id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-800 text-white flex items-center justify-center text-sm font-medium">
                        {member.user_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{member.user_name}</p>
                        <p className="text-xs text-gray-500">{member.user_email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm font-medium text-blue-600">
                      {Math.round(member.by_type.RS?.total_consumed || 0)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {member.by_type.RS?.consumption_count || 0} actions
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm font-medium text-green-600">
                      {(member.by_type.AS?.total_consumed || 0).toFixed(1)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {member.by_type.AS?.consumption_count || 0} actions
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm font-medium text-purple-600">
                      {Math.round(member.by_type.AIU?.total_consumed || 0)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {member.by_type.AIU?.consumption_count || 0} actions
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm font-medium text-orange-600">
                      {Math.round(member.by_type.RU?.total_consumed || 0)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {member.by_type.RU?.consumption_count || 0} actions
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm font-medium text-indigo-600">
                      {member.jds_created || 0}
                    </div>
                    <div className="text-xs text-gray-500">created</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm font-medium text-teal-600">
                      {member.assessments_created || 0}
                    </div>
                    <div className="text-xs text-gray-500">created</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm font-bold text-gray-900">
                      {member.total_consumed.toFixed(1)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {member.total_actions} total
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-1 text-sm text-gray-600">
                      <Clock className="w-3.5 h-3.5" />
                      {formatLastActivity(member.last_activity)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-gray-50 rounded-xl p-8 text-center">
          <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">No Team Members</h3>
          <p className="text-gray-600">
            This team has no members yet. Add members to see their usage data.
          </p>
        </div>
      )}
    </div>
  );
}
