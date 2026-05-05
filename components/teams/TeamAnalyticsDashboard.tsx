'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  BarChart3,
  TrendingUp,
  Users,
  FileText,
  ClipboardCheck,
  Upload,
  Briefcase,
  Calendar,
  AlertCircle,
  Download,
} from 'lucide-react';
import {
  exportToCSV,
  formatTeamUsageForExport,
  TEAM_USAGE_COLUMNS,
} from '@/lib/utils/exportUtils';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import teamService, { AllTeamsUsageSummary } from '@/lib/services/teamService';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/components/providers/AuthProvider';

interface TeamAnalyticsDashboardProps {
  userRole: string;
}

const COLORS = {
  RS: '#3B82F6', // Blue for Resume Scoring
  AS: '#14B8A6', // Teal for Assessment
  AIU: '#06B6D4', // Cyan for AI Interview
  RU: '#F97316', // Orange for Resume Upload
};

const UNIT_LABELS: Record<string, string> = {
  RS: 'Resume Scoring',
  AS: 'Assessment',
  AIU: 'AI Interview',
  RU: 'Resume Upload',
};

export default function TeamAnalyticsDashboard({ userRole }: TeamAnalyticsDashboardProps) {
  const { isTenantAdmin: authIsTenantAdmin, user } = useAuth();
  const canExport = authIsTenantAdmin || !!user?.permissions?.canExport;
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamsUsage, setTeamsUsage] = useState<AllTeamsUsageSummary | null>(null);
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);

  const isTenantAdmin = userRole === 'tenant_admin' || userRole === 'owner' || userRole === 'admin';

  useEffect(() => {
    fetchAnalyticsData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate, userRole, isTenantAdmin]);

  const fetchAnalyticsData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (isTenantAdmin) {
        const currentData = await teamService.getAllTeamsUsage(fromDate, toDate);
        setTeamsUsage(currentData);
      } else {
        const data = await teamService.getMyTeamsUsage(fromDate, toDate);
        setTeamsUsage(data as unknown as AllTeamsUsageSummary);
      }
    } catch (err: unknown) {
      console.error('Error fetching analytics:', err);
      if (typeof err === 'object' && err !== null && 'response' in err) {
        const response = (err as { response?: { data?: { detail?: { message?: string } } } }).response;
        setError(response?.data?.detail?.message || 'Failed to load analytics');
      } else {
        setError('Failed to load analytics');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Prepare data for team comparison bar chart
  const teamComparisonData = useMemo(() => {
    if (!teamsUsage?.teams) return [];

    return teamsUsage.teams.map((team) => ({
      name: team.team_name || 'Unknown',
      RS: team.by_type?.RS?.total_consumed || 0,
      AS: team.by_type?.AS?.total_consumed || 0,
      AIU: team.by_type?.AIU?.total_consumed || 0,
      RU: team.by_type?.RU?.total_consumed || 0,
      JDs: team.jds_created || 0,
      Assessments: team.assessments_created || 0,
      total:
        (team.by_type?.RS?.total_consumed || 0) +
        (team.by_type?.AS?.total_consumed || 0) +
        (team.by_type?.AIU?.total_consumed || 0) +
        (team.by_type?.RU?.total_consumed || 0),
    }));
  }, [teamsUsage]);

  // Prepare data for unit type distribution pie chart
  const unitDistributionData = useMemo(() => {
    if (!teamsUsage?.teams) return [];

    const totals = { RS: 0, AS: 0, AIU: 0, RU: 0 };

    teamsUsage.teams.forEach((team) => {
      totals.RS += team.by_type?.RS?.total_consumed || 0;
      totals.AS += team.by_type?.AS?.total_consumed || 0;
      totals.AIU += team.by_type?.AIU?.total_consumed || 0;
      totals.RU += team.by_type?.RU?.total_consumed || 0;
    });

    return Object.entries(totals)
      .filter((entry) => entry[1] > 0)
      .map(([name, value]) => ({
        name: UNIT_LABELS[name],
        value: parseFloat(value.toFixed(2)),
        color: COLORS[name as keyof typeof COLORS],
      }));
  }, [teamsUsage]);

  // Calculate totals and trends
  const totals = useMemo(() => {
    if (!teamsUsage?.teams) return { RS: 0, AS: 0, AIU: 0, RU: 0, total: 0 };

    const result = { RS: 0, AS: 0, AIU: 0, RU: 0, total: 0 };

    teamsUsage.teams.forEach((team) => {
      result.RS += team.by_type?.RS?.total_consumed || 0;
      result.AS += team.by_type?.AS?.total_consumed || 0;
      result.AIU += team.by_type?.AIU?.total_consumed || 0;
      result.RU += team.by_type?.RU?.total_consumed || 0;
    });

    result.total = result.RS + result.AS + result.AIU + result.RU;
    return result;
  }, [teamsUsage]);

  // Calculate action counts
  const actionCounts = useMemo(() => {
    if (!teamsUsage?.teams) return { RS: 0, AS: 0, AIU: 0, RU: 0, total: 0 };

    const result = { RS: 0, AS: 0, AIU: 0, RU: 0, total: 0 };

    teamsUsage.teams.forEach((team) => {
      result.RS += team.by_type?.RS?.consumption_count || 0;
      result.AS += team.by_type?.AS?.consumption_count || 0;
      result.AIU += team.by_type?.AIU?.consumption_count || 0;
      result.RU += team.by_type?.RU?.consumption_count || 0;
    });

    result.total = result.RS + result.AS + result.AIU + result.RU;
    return result;
  }, [teamsUsage]);

  // Calculate creation counts (JDs and Assessments)
  const creationCounts = useMemo(() => {
    if (!teamsUsage?.teams) return { jds: 0, assessments: 0 };

    const result = { jds: 0, assessments: 0 };
    teamsUsage.teams.forEach((team) => {
      result.jds += team.jds_created || 0;
      result.assessments += team.assessments_created || 0;
    });
    return result;
  }, [teamsUsage]);

  // Top performing teams
  const topTeams = useMemo(() => {
    return [...teamComparisonData]
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [teamComparisonData]);

  // Export handler
  const handleExport = () => {
    if (!teamsUsage?.teams) return;

    const formattedData = formatTeamUsageForExport(teamsUsage.teams);
    exportToCSV(formattedData, TEAM_USAGE_COLUMNS, `team-analytics-${fromDate}-to-${toDate}`);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-lg" />
            <div>
              <Skeleton className="h-5 w-40 mb-1" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <Skeleton className="h-8 w-32" />
        </div>

        {/* Summary Cards Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
              <Skeleton className="w-10 h-10 rounded-lg mb-3" />
              <Skeleton className="h-8 w-20 mb-1" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </div>

        {/* Charts Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
            <Skeleton className="h-5 w-32 mb-4" />
            <Skeleton className="h-[300px] w-full rounded-lg" />
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
            <Skeleton className="h-5 w-40 mb-4" />
            <Skeleton className="h-[300px] w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-red-800 mb-2">Error Loading Analytics</h3>
        <p className="text-red-700">{error}</p>
        <button
          onClick={fetchAnalyticsData}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Period Selector */}
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-100 bg-gradient-to-r from-brand-blue/[0.04] via-brand-cyan/[0.03] to-transparent p-5 ring-1 ring-black/[0.02] lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-blue/15 to-brand-blue-2/10 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10">
            <TrendingUp className="w-5 h-5 text-brand-blue" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Team Analytics</h3>
            <p className="text-sm text-gray-600">
              {isTenantAdmin ? 'Organization-wide usage analytics' : 'Your team usage analytics'}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Calendar className="w-4 h-4 text-gray-500" />
            <input
              type="date"
              value={fromDate}
              max={toDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition-all focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
            />
            <span className="text-sm text-gray-500">to</span>
            <input
              type="date"
              value={toDate}
              min={fromDate}
              max={new Date().toISOString().split('T')[0]}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition-all focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
            />
          </div>
          {canExport && teamsUsage?.teams && teamsUsage.teams.length > 0 && (
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition-all hover:border-brand-cyan/20 hover:bg-brand-cyan/[0.04] hover:text-brand-blue"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards - Unit Consumption */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15">
              <FileText className="w-5 h-5 text-brand-blue" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{Math.round(totals.RS)}</p>
          <p className="text-sm text-gray-600">Resume Scoring</p>
          <p className="text-xs text-gray-500 mt-1">{actionCounts.RS} actions</p>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm shadow-brand-teal/5 ring-1 ring-black/[0.02]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-teal/10 ring-1 ring-brand-teal/15">
              <ClipboardCheck className="w-5 h-5 text-brand-teal" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{totals.AS.toFixed(1)}</p>
          <p className="text-sm text-gray-600">Assessment</p>
          <p className="text-xs text-gray-500 mt-1">{actionCounts.AS} actions</p>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm shadow-brand-cyan/5 ring-1 ring-black/[0.02]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/15">
              <Users className="w-5 h-5 text-brand-cyan" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{Math.round(totals.AIU)}</p>
          <p className="text-sm text-gray-600">AI Interview</p>
          <p className="text-xs text-gray-500 mt-1">{actionCounts.AIU} actions</p>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm shadow-brand-orange/5 ring-1 ring-black/[0.02]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <Upload className="w-5 h-5 text-orange-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{Math.round(totals.RU)}</p>
          <p className="text-sm text-gray-600">Resume Upload</p>
          <p className="text-xs text-gray-500 mt-1">{actionCounts.RU} actions</p>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-indigo-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{creationCounts.jds}</p>
          <p className="text-sm text-gray-600">JDs Created</p>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm shadow-brand-teal/5 ring-1 ring-black/[0.02]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
              <ClipboardCheck className="w-5 h-5 text-teal-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{creationCounts.assessments}</p>
          <p className="text-sm text-gray-600">Assessments Created</p>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{totals.total.toFixed(1)}</p>
          <p className="text-sm text-gray-600">Total Units Used</p>
          <p className="text-xs text-gray-500 mt-1">{actionCounts.total} total actions</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Team Comparison Bar Chart */}
        {teamComparisonData.length > 0 && (
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
            <h4 className="text-md font-semibold text-gray-900 mb-4">Usage by Team</h4>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={teamComparisonData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={100}
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => value.length > 15 ? `${value.slice(0, 15)}...` : value}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #E5E7EB',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="RS" name="Resume Scoring" fill={COLORS.RS} stackId="stack" />
                  <Bar dataKey="AS" name="Assessment" fill={COLORS.AS} stackId="stack" />
                  <Bar dataKey="AIU" name="AI Interview" fill={COLORS.AIU} stackId="stack" />
                  <Bar dataKey="RU" name="Resume Upload" fill={COLORS.RU} stackId="stack" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Unit Distribution Pie Chart */}
        {unitDistributionData.length > 0 && (
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
            <h4 className="text-md font-semibold text-gray-900 mb-4">Unit Type Distribution</h4>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={unitDistributionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={false}
                  >
                    {unitDistributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #E5E7EB',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number) => [`${value.toFixed(2)} units`, '']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {/* Legend */}
            <div className="flex justify-center gap-6 mt-4">
              {unitDistributionData.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm text-gray-600">{item.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Top Performing Teams */}
      {topTeams.length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
          <h4 className="text-md font-semibold text-gray-900 mb-4">Top Performing Teams</h4>
          <div className="space-y-3">
            {topTeams.map((team, index) => (
              <div
                key={team.name}
                className="flex items-center gap-4 rounded-2xl bg-gradient-to-r from-white to-brand-blue/[0.02] p-3 ring-1 ring-gray-100"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-blue-2 to-brand-blue text-sm font-bold text-white">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{team.name}</p>
                  <div className="flex gap-4 mt-1">
                    <span className="text-xs text-blue-600">RS: {Math.round(team.RS)}</span>
                    <span className="text-xs text-green-600">AS: {team.AS.toFixed(1)}</span>
                    <span className="text-xs text-purple-600">AIU: {Math.round(team.AIU)}</span>
                    <span className="text-xs text-orange-600">RU: {Math.round(team.RU)}</span>
                    <span className="text-xs text-indigo-600">JDs: {team.JDs}</span>
                    <span className="text-xs text-teal-600">AS Created: {team.Assessments}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900">{team.total.toFixed(1)}</p>
                  <p className="text-xs text-gray-500">total units</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {(!teamsUsage?.teams || teamsUsage.teams.length === 0) && (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center">
          <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">No Usage Data</h3>
          <p className="text-gray-600">
            No team usage data available for the selected period.
          </p>
        </div>
      )}
    </div>
  );
}
