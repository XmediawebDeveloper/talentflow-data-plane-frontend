'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Users,
  FileText,
  ClipboardCheck,
  Upload,
  Briefcase,
  Loader2,
  AlertCircle,
  TrendingUp,
  Clock,
  ChevronDown,
  ChevronUp,
  Download,
} from 'lucide-react';
import {
  exportData,
  formatMemberUsageForExport,
  MEMBER_USAGE_COLUMNS,
  type ExportFileFormat,
} from '@/lib/utils/exportUtils';
import ExportFormatModal from '@/components/ExportFormatModal';
import teamService, { TeamMembersUsageSummary, TeamMemberUsage as MemberUsage } from '@/lib/services/teamService';
import { Skeleton } from '@/components/ui/skeleton';
import { DateField } from '@/components/ui/date-field';
import { Team } from '@/lib/services/teamService';
import { formatISTDate } from '@/lib/utils/dateUtils';
import { useAuth } from '@/components/providers/AuthProvider';

interface TeamMemberUsageProps {
  team: Team;
  userRole: string;
  onClose?: () => void;
}

const UNIT_TYPE_CONFIG = {
  RS: { label: 'Resume Scoring', icon: FileText, color: 'bg-blue-500', textColor: 'text-blue-600' },
  AS: { label: 'Assessment', icon: ClipboardCheck, color: 'bg-success', textColor: 'text-success' },
  AIU: { label: 'AI Interview', icon: Users, color: 'bg-purple-500', textColor: 'text-purple-600' },
  RU: { label: 'Resume Storage', icon: Upload, color: 'bg-orange-500', textColor: 'text-orange-600' },
};

export default function TeamMemberUsage({ team, userRole, onClose }: TeamMemberUsageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [membersUsage, setMembersUsage] = useState<TeamMembersUsageSummary | null>(null);
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [sortBy, setSortBy] = useState<'total' | 'name' | 'recent'>('total');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showExportModal, setShowExportModal] = useState(false);

  const { isTenantAdmin: authIsTenantAdmin, user } = useAuth();
  // Must match the backend's actual gate (current_user.is_tenant_admin) for the
  // team-members-usage endpoint — a raw role-string comparison drifts from the
  // backend (e.g. 'admin' is no longer an automatic tenant_admin bypass there).
  const isTenantAdmin = authIsTenantAdmin;
  const canExport = authIsTenantAdmin || !!user?.permissions?.canExport;

  useEffect(() => {
    if (isTenantAdmin) {
      fetchMembersUsage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate, team.id, isTenantAdmin]);

  const fetchMembersUsage = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await teamService.getTeamMembersUsage(team.id, fromDate, toDate);
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

  const handleExport = async (format: ExportFileFormat) => {
    if (!membersUsage?.members) return;

    const formattedData = formatMemberUsageForExport(membersUsage.members);
    const teamSlug = team.name.toLowerCase().replace(/\s+/g, '-');
    await exportData(format, formattedData, MEMBER_USAGE_COLUMNS, `${teamSlug}-member-usage-${fromDate}-to-${toDate}`, {
      sheetName: 'Member Usage',
    });
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
      <div className="bg-warning-subtle border border-warning-line rounded-xl p-6 text-center">
        <AlertCircle className="w-12 h-12 text-warning mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-warning-strong mb-2">Access Restricted</h3>
        <p className="text-warning">
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
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] overflow-hidden">
          <div className="bg-gray-50 dark:bg-slate-800/50 px-6 py-3">
            <div className="flex gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-4 w-20" />
              ))}
            </div>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-slate-700/60">
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
      <div className="bg-destructive-subtle border border-destructive-line rounded-xl p-6 text-center">
        <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-destructive-strong mb-2">Error Loading Data</h3>
        <p className="text-destructive">{error}</p>
        <button
          onClick={fetchMembersUsage}
          className="mt-4 px-4 py-2 bg-destructive text-white rounded-lg hover:bg-destructive transition-colors"
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
      <div className="flex flex-col gap-4 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 p-5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10">
            <TrendingUp className="w-5 h-5 text-brand-blue" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-50 truncate">{team.name} - Member Usage</h3>
            <p className="text-sm text-gray-600 dark:text-slate-400">Individual usage breakdown</p>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 min-w-0">
            <DateField
              aria-label="From date"
              value={fromDate}
              max={toDate}
              onChange={setFromDate}
              className="min-w-0 flex-1 sm:flex-none sm:w-[150px]"
            />
            <span className="shrink-0 text-xs font-medium text-gray-400 dark:text-slate-500">to</span>
            <DateField
              aria-label="To date"
              value={toDate}
              min={fromDate}
              max={new Date().toISOString().split('T')[0]}
              onChange={setToDate}
              className="min-w-0 flex-1 sm:flex-none sm:w-[150px]"
            />
          </div>
          {membersUsage?.members && membersUsage.members.length > 0 && (
            <button
              onClick={() => {
                if (!canExport) {
                  toast.error('You do not have permission to export');
                  return;
                }
                setShowExportModal(true);
              }}
              aria-disabled={!canExport}
              title={!canExport ? 'You do not have permission to export' : ''}
              className={`flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-900 border rounded-lg text-sm font-medium transition-colors ${
                canExport
                  ? 'border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800'
                  : 'border-gray-200 dark:border-slate-700 text-gray-400 dark:text-slate-500 cursor-not-allowed opacity-60'
              }`}
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          )}
          <ExportFormatModal
            open={showExportModal}
            onClose={() => setShowExportModal(false)}
            title={`Export ${team.name} Member Usage`}
            recordCount={membersUsage?.members?.length ?? 0}
            columns={MEMBER_USAGE_COLUMNS.map((c) => c.header)}
            onExport={handleExport}
          />
        </div>
      </div>

      {/* Members Table */}
      {members.length > 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] overflow-hidden tf-table-shell">
          <table className="w-full" role="table" aria-label="Team member usage statistics">
            <thead className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-700">
              <tr>
                <th
                  onClick={() => toggleSort('name')}
                  onKeyDown={(e) => e.key === 'Enter' && toggleSort('name')}
                  tabIndex={0}
                  role="columnheader"
                  aria-sort={sortBy === 'name' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-blue/40"
                >
                  <div className="flex items-center gap-1">
                    Member
                    {sortBy === 'name' && (sortOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                  </div>
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider">
                  Resume Scoring
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider">
                  Assessment
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider">
                  AI Interview
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider">
                  Resume Storage
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider">
                  JDs
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider">
                  Assessments
                </th>
                <th
                  onClick={() => toggleSort('total')}
                  onKeyDown={(e) => e.key === 'Enter' && toggleSort('total')}
                  tabIndex={0}
                  role="columnheader"
                  aria-sort={sortBy === 'total' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className="px-6 py-3 text-center text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-blue/40"
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
                  className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-blue/40"
                >
                  <div className="flex items-center justify-end gap-1">
                    Last Active
                    {sortBy === 'recent' && (sortOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-slate-700/60">
              {members.map((member, index) => (
                <tr key={member.user_id} className={index % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-gray-50 dark:bg-slate-800/50'}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15 text-brand-blue flex items-center justify-center text-sm font-semibold shrink-0">
                        {member.user_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-slate-50 truncate">{member.user_name}</p>
                        <p className="text-xs text-gray-500 dark:text-slate-500 truncate">{member.user_email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm font-medium text-blue-600 dark:text-blue-400 tabular-nums">
                      {Math.round(member.by_type.RS?.total_consumed || 0)}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-slate-500">
                      {member.by_type.RS?.consumption_count || 0} actions
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm font-medium text-success tabular-nums">
                      {(member.by_type.AS?.total_consumed || 0).toFixed(1)}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-slate-500">
                      {member.by_type.AS?.consumption_count || 0} actions
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm font-medium text-purple-600 dark:text-purple-400 tabular-nums">
                      {Math.round(member.by_type.AIU?.total_consumed || 0)}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-slate-500">
                      {member.by_type.AIU?.consumption_count || 0} actions
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm font-medium text-orange-600 dark:text-orange-400 tabular-nums">
                      {Math.round(member.by_type.RU?.total_consumed || 0)}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-slate-500">
                      {member.by_type.RU?.consumption_count || 0} actions
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm font-medium text-indigo-600 dark:text-indigo-400 tabular-nums">
                      {member.jds_created || 0}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-slate-500">created</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm font-medium text-teal-600 dark:text-teal-400 tabular-nums">
                      {member.assessments_created || 0}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-slate-500">created</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm font-semibold text-gray-900 dark:text-slate-50 tabular-nums">
                      {member.total_consumed.toFixed(1)}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-slate-500">
                      {member.total_actions} total
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-1 text-sm text-gray-600 dark:text-slate-400">
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
        <div className="rounded-xl border border-dashed border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 p-8 text-center">
          <Users className="w-12 h-12 text-gray-400 dark:text-slate-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 dark:text-slate-300 mb-2">No Team Members</h3>
          <p className="text-gray-600 dark:text-slate-400">
            This team has no members yet. Add members to see their usage data.
          </p>
        </div>
      )}
    </div>
  );
}
