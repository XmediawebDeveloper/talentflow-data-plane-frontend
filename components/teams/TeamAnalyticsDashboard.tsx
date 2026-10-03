'use client';

import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import {
  BarChart3,
  TrendingUp,
  Users,
  FileText,
  ClipboardCheck,
  Upload,
  Briefcase,
  AlertCircle,
  Download,
} from 'lucide-react';
import {
  exportData,
  formatTeamUsageForExport,
  TEAM_USAGE_COLUMNS,
  type ExportFileFormat,
} from '@/lib/utils/exportUtils';
import { Button } from '@/components/ui/button';
import ExportFormatModal from '@/components/ExportFormatModal';
import { DateField } from '@/components/ui/date-field';
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
  RS: 'var(--raw-3b82f6)', // Blue for Resume Scoring
  AS: 'var(--raw-14b8a6)', // Teal for Assessment
  AIU: 'var(--raw-06b6d4)', // Cyan for AI Interview
  RU: 'var(--raw-f97316)', // Orange for Resume Upload
};

const UNIT_LABELS: Record<string, string> = {
  RS: 'Resume Scoring',
  AS: 'Assessment',
  AIU: 'AI Interview',
  RU: 'Resume Storage',
};

export default function TeamAnalyticsDashboard({ userRole }: TeamAnalyticsDashboardProps) {
  const { isTenantAdmin: authIsTenantAdmin, hasPermissionCode } = useAuth();
  const canExport = authIsTenantAdmin || hasPermissionCode('teams:export');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamsUsage, setTeamsUsage] = useState<AllTeamsUsageSummary | null>(null);
  // Drill-in: 'cards' shows only the 7 summary tiles; clicking one expands the
  // charts + tables below. activeCard highlights which tile was clicked.
  const [pageView, setPageView] = useState<'cards' | 'list'>('cards');
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const openList = (card: string) => { setActiveCard(card); setPageView('list'); };
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [showExportModal, setShowExportModal] = useState(false);

  // Must match the backend's actual gate (current_user.is_tenant_admin) for the
  // all-teams-usage endpoint — a raw role-string comparison drifts from the
  // backend (e.g. 'admin' is no longer an automatic tenant_admin bypass there).
  const isTenantAdmin = authIsTenantAdmin;

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

  // Export handler — runs from the format picker
  const handleExport = async (format: ExportFileFormat) => {
    if (!teamsUsage?.teams) return;

    const formattedData = formatTeamUsageForExport(teamsUsage.teams);
    await exportData(format, formattedData, TEAM_USAGE_COLUMNS, `team-analytics-${fromDate}-to-${toDate}`, {
      sheetName: 'Team Analytics',
    });
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
            <div key={i} className="rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-5 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
              <Skeleton className="w-10 h-10 rounded-lg mb-3" />
              <Skeleton className="h-8 w-20 mb-1" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </div>

        {/* Charts Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-6 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
            <Skeleton className="h-5 w-32 mb-4" />
            <Skeleton className="h-[300px] w-full rounded-lg" />
          </div>
          <div className="rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-6 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
            <Skeleton className="h-5 w-40 mb-4" />
            <Skeleton className="h-[300px] w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-destructive-subtle border border-destructive-line rounded-xl p-6 text-center">
        <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-destructive-strong mb-2">Error Loading Analytics</h3>
        <p className="text-destructive">{error}</p>
        <Button
          variant="primary"
          onClick={fetchAnalyticsData}
          className="mt-4"
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Period Selector */}
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 p-5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10">
            <TrendingUp className="w-5 h-5 text-brand-blue" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-50">Team Analytics</h3>
            <p className="text-sm text-gray-600 dark:text-slate-400">
              {isTenantAdmin ? 'Organization-wide usage analytics' : 'Your team usage analytics'}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <DateField
              aria-label="Analytics date from"
              value={fromDate}
              max={toDate}
              onChange={(v) => setFromDate(v)}
              className="sm:flex-1 sm:min-w-0"
            />
            <span className="text-xs text-gray-400 text-center sm:text-left sm:flex-shrink-0">to</span>
            <DateField
              aria-label="Analytics date to"
              value={toDate}
              min={fromDate}
              max={new Date().toISOString().split('T')[0]}
              onChange={(v) => setToDate(v)}
              className="sm:flex-1 sm:min-w-0"
            />
          </div>
          {teamsUsage?.teams && teamsUsage.teams.length > 0 && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (!canExport) {
                  toast.error('You do not have permission to export team analytics');
                  return;
                }
                setShowExportModal(true);
              }}
              aria-disabled={!canExport}
              className={!canExport ? 'opacity-50 cursor-not-allowed' : ''}
              title={!canExport ? 'You do not have permission to export team analytics' : ''}
              icon={<Download className="w-4 h-4" />}
            >
              Export
            </Button>
          )}
          <ExportFormatModal
            open={showExportModal}
            onClose={() => setShowExportModal(false)}
            title="Export Team Analytics"
            recordCount={teamsUsage?.teams?.length ?? 0}
            columns={TEAM_USAGE_COLUMNS.map((c) => c.header)}
            onExport={handleExport}
          />
        </div>
      </div>

      {/* Summary Cards - Unit Consumption — clicking any card drills into the
          charts/tables below (cards → list drill-in, matching /recruitment/job-openings). */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
        {([
          { key: 'RS',        label: 'Resume Scoring',      value: Math.round(totals.RS),        sub: `${actionCounts.RS} actions`,    Icon: FileText,        iconBg: 'bg-brand-blue/10 ring-1 ring-brand-blue/15',     iconColor: 'text-brand-blue',     shadow: 'shadow-brand-blue/5' },
          { key: 'AS',        label: 'Assessment',          value: totals.AS.toFixed(1),         sub: `${actionCounts.AS} actions`,    Icon: ClipboardCheck,  iconBg: 'bg-brand-teal/10 ring-1 ring-brand-teal/15',     iconColor: 'text-brand-teal',     shadow: 'shadow-brand-teal/5' },
          { key: 'AIU',       label: 'AI Interview',        value: Math.round(totals.AIU),       sub: `${actionCounts.AIU} actions`,   Icon: Users,           iconBg: 'bg-brand-cyan/10 ring-1 ring-brand-cyan/15',     iconColor: 'text-brand-cyan',     shadow: 'shadow-brand-cyan/5' },
          { key: 'RU',        label: 'Resume Storage',      value: Math.round(totals.RU),        sub: `${actionCounts.RU} actions`,    Icon: Upload,          iconBg: 'bg-orange-100',                                  iconColor: 'text-orange-600',     shadow: 'shadow-brand-orange/5' },
          { key: 'JDS',       label: 'JDs Created',         value: creationCounts.jds,           sub: '',                              Icon: Briefcase,       iconBg: 'bg-indigo-100',                                  iconColor: 'text-indigo-600',     shadow: 'shadow-brand-blue/5' },
          { key: 'ASSESSED',  label: 'Assessments Created', value: creationCounts.assessments,   sub: '',                              Icon: ClipboardCheck,  iconBg: 'bg-teal-100',                                    iconColor: 'text-teal-600',       shadow: 'shadow-brand-teal/5' },
          { key: 'TOTAL',     label: 'Total Units Used',    value: totals.total.toFixed(1),      sub: `${actionCounts.total} total actions`, Icon: BarChart3, iconBg: 'bg-gray-800',                                    iconColor: 'text-white',          shadow: 'shadow-brand-blue/5' },
        ] as const).map(({ key, label, value, sub, Icon, iconBg, iconColor, shadow }) => {
          const isActive = pageView === 'list' && activeCard === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => openList(key)}
              className={`text-left rounded-2xl border bg-white dark:bg-slate-900 p-5 shadow-sm ${shadow} ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-all hover:-translate-y-0.5 hover:shadow-md ${isActive ? 'border-brand-blue ring-2 ring-brand-blue/20' : 'border-gray-100 dark:border-slate-700/60'}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconBg}`}>
                  <Icon className={`w-5 h-5 ${iconColor}`} />
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-slate-50">{value}</p>
              <p className="text-sm text-gray-600 dark:text-slate-400">{label}</p>
              {sub && <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">{sub}</p>}
            </button>
          );
        })}
      </div>

      {pageView === 'list' && (
      <>
      {/* justify-end, not justify-between: the Back to overview button that
          used to hold the left slot is gone, and the tally belongs on the
          right. */}
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-gray-500 dark:text-slate-400">
          {teamsUsage?.teams?.length ?? 0} {(teamsUsage?.teams?.length ?? 0) === 1 ? 'team' : 'teams'}
        </span>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Team Comparison Bar Chart */}
        {teamComparisonData.length > 0 && (
          <div className="rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-6 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
            <h4 className="text-md font-semibold text-gray-900 dark:text-slate-50 mb-4">Usage by Team</h4>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={teamComparisonData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--raw-e5e7eb)" />
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
                      border: '1px solid var(--raw-e5e7eb)',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="RS" name="Resume Scoring" fill={COLORS.RS} stackId="stack" />
                  <Bar dataKey="AS" name="Assessment" fill={COLORS.AS} stackId="stack" />
                  <Bar dataKey="AIU" name="AI Interview" fill={COLORS.AIU} stackId="stack" />
                  <Bar dataKey="RU" name="Resume Storage" fill={COLORS.RU} stackId="stack" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Unit Distribution Pie Chart */}
        {unitDistributionData.length > 0 && (
          <div className="rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-6 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
            <h4 className="text-md font-semibold text-gray-900 dark:text-slate-50 mb-4">Unit Type Distribution</h4>
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
                      border: '1px solid var(--raw-e5e7eb)',
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
                  <span className="text-sm text-gray-600 dark:text-slate-400">{item.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Top Performing Teams */}
      {topTeams.length > 0 && (
        <div className="rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-6 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
          <h4 className="text-md font-semibold text-gray-900 dark:text-slate-50 mb-4">Top Performing Teams</h4>
          <div className="space-y-3">
            {topTeams.map((team, index) => (
              <div
                key={team.name}
                className="flex items-center gap-4 rounded-2xl bg-gradient-to-r from-white to-brand-blue/[0.02] p-3 ring-1 ring-gray-100 dark:ring-slate-700/60"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-blue-2 to-brand-blue text-sm font-bold text-white">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900 dark:text-slate-50">{team.name}</p>
                  <div className="flex gap-4 mt-1">
                    <span className="text-xs text-blue-600">RS: {Math.round(team.RS)}</span>
                    <span className="text-xs text-success">AS: {team.AS.toFixed(1)}</span>
                    <span className="text-xs text-purple-600">AIU: {Math.round(team.AIU)}</span>
                    <span className="text-xs text-orange-600">RU: {Math.round(team.RU)}</span>
                    <span className="text-xs text-indigo-600">JDs: {team.JDs}</span>
                    <span className="text-xs text-teal-600">AS Created: {team.Assessments}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900 dark:text-slate-50">{team.total.toFixed(1)}</p>
                  <p className="text-xs text-gray-500 dark:text-slate-500">total units</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {(!teamsUsage?.teams || teamsUsage.teams.length === 0) && (
        <div className="rounded-2xl border border-dashed border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 p-8 text-center">
          <BarChart3 className="w-12 h-12 text-gray-400 dark:text-slate-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 dark:text-slate-300 mb-2">No Usage Data</h3>
          <p className="text-gray-600 dark:text-slate-400">
            No team usage data available for the selected period.
          </p>
        </div>
      )}
      </>
      )}
    </div>
  );
}
