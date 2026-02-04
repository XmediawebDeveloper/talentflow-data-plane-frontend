'use client';

/**
 * Team-Level Usage Visibility Component
 *
 * Displays team usage summaries with role-based access:
 * - Owner: View all teams' usage
 * - Standard User/Viewer: View only their team's usage
 * - Billing Manager: No access (shows message)
 */

import { useState, useEffect } from 'react';
import { Users, BarChart3, FileText, ClipboardCheck, Loader2, AlertCircle, Calendar } from 'lucide-react';
import teamService, { TeamUsageSummary, AllTeamsUsageSummary, MyTeamsUsageSummary } from '@/lib/services/teamService';

// Unit type labels for display
const UNIT_TYPE_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  RS: {
    label: 'Resume Scoring',
    icon: <FileText className="w-4 h-4" />,
    color: 'bg-blue-500',
  },
  AS: {
    label: 'Assessment',
    icon: <ClipboardCheck className="w-4 h-4" />,
    color: 'bg-green-500',
  },
  AIU: {
    label: 'AI Interview',
    icon: <Users className="w-4 h-4" />,
    color: 'bg-purple-500',
  },
};

interface TeamUsageSummaryProps {
  userRole: string;
  teamId?: string; // If provided, shows single team usage
}

export default function TeamUsageSummaryComponent({ userRole, teamId }: TeamUsageSummaryProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allTeamsUsage, setAllTeamsUsage] = useState<AllTeamsUsageSummary | null>(null);
  const [myTeamsUsage, setMyTeamsUsage] = useState<MyTeamsUsageSummary | null>(null);
  const [singleTeamUsage, setSingleTeamUsage] = useState<TeamUsageSummary | null>(null);
  const [selectedDays, setSelectedDays] = useState(30);

  // Only tenant_admin and owner roles should have access to all teams' usage
  const isTenantAdmin = userRole === 'tenant_admin' || userRole === 'owner' || userRole === 'admin';
  const isBillingManager = userRole === 'billing_manager' || userRole === 'finance';

  useEffect(() => {
    fetchUsageData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDays, teamId, userRole, isTenantAdmin, isBillingManager]);

  const fetchUsageData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (teamId) {
        // Fetch single team usage
        const data = await teamService.getTeamUsage(teamId, selectedDays);
        setSingleTeamUsage(data);
      } else if (isTenantAdmin) {
        // Owner: Fetch all teams
        const data = await teamService.getAllTeamsUsage(selectedDays);
        setAllTeamsUsage(data);
      } else if (!isBillingManager) {
        // Standard User/Viewer: Fetch my teams
        const data = await teamService.getMyTeamsUsage(selectedDays);
        setMyTeamsUsage(data);
      }
    } catch (err: any) {
      console.error('Error fetching team usage:', err);
      setError(err.response?.data?.detail?.message || err.message || 'Failed to load team usage data');
    } finally {
      setIsLoading(false);
    }
  };

  // Billing Manager: No access
  if (isBillingManager) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center">
        <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-yellow-800 mb-2">Access Restricted</h3>
        <p className="text-yellow-700">
          Billing managers cannot view team-level usage details.
          Please use the Usage Summary for aggregated billing data.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
        <span className="ml-3 text-gray-600">Loading team usage data...</span>
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
          onClick={fetchUsageData}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // Render single team usage
  if (singleTeamUsage) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {singleTeamUsage.team_name || 'Team'} Usage
              </h3>
              <p className="text-sm text-gray-600">
                {singleTeamUsage.reporting_scope} - Last {selectedDays} days
              </p>
            </div>
          </div>
          <DaysPicker selectedDays={selectedDays} onChange={setSelectedDays} />
        </div>

        {/* Usage Stats */}
        <TeamUsageCard team={singleTeamUsage} />
      </div>
    );
  }

  // Render all teams (Owner) or my teams
  const teamsData = allTeamsUsage?.teams || myTeamsUsage?.teams || [];
  const reportingScope = allTeamsUsage?.reporting_scope || myTeamsUsage?.reporting_scope || '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {isTenantAdmin ? 'All Teams Usage' : 'My Teams Usage'}
            </h3>
            <p className="text-sm text-gray-600">
              {reportingScope === 'all_teams' ? 'Tenant-wide team usage' : 'Your team usage summary'} - Last {selectedDays} days
            </p>
          </div>
        </div>
        <DaysPicker selectedDays={selectedDays} onChange={setSelectedDays} />
      </div>

      {/* Teams Grid */}
      {teamsData.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {teamsData.map((team) => (
            <TeamUsageCard key={team.team_id} team={team} />
          ))}
        </div>
      ) : (
        <div className="bg-gray-50 rounded-xl p-8 text-center">
          <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">No Team Usage Data</h3>
          <p className="text-gray-600">
            {myTeamsUsage?.note || 'No team usage data available for the selected period.'}
          </p>
        </div>
      )}
    </div>
  );
}

// Days picker component
function DaysPicker({ selectedDays, onChange }: { selectedDays: number; onChange: (days: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Calendar className="w-4 h-4 text-gray-500" />
      <select
        value={selectedDays}
        onChange={(e) => onChange(Number(e.target.value))}
        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-800 focus:border-transparent outline-none"
      >
        <option value={7}>Last 7 days</option>
        <option value={30}>Last 30 days</option>
        <option value={60}>Last 60 days</option>
        <option value={90}>Last 90 days</option>
        <option value={180}>Last 6 months</option>
        <option value={365}>Last year</option>
      </select>
    </div>
  );
}

// Team usage card component
function TeamUsageCard({ team }: { team: TeamUsageSummary }) {
  const hasData = Object.keys(team.by_type).length > 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Team Header */}
      <div className="bg-gray-800 px-6 py-4 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium opacity-80">Team Usage</p>
            <h4 className="text-lg font-bold">{team.team_name || 'Unknown Team'}</h4>
          </div>
          <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
            <Users className="w-5 h-5 text-white" />
          </div>
        </div>
      </div>

      {/* Usage Stats */}
      <div className="p-6">
        {hasData ? (
          <div className="space-y-4">
            {Object.entries(team.by_type).map(([unitType, usage]) => {
              const typeInfo = UNIT_TYPE_LABELS[unitType] || {
                label: unitType,
                icon: <BarChart3 className="w-4 h-4" />,
                color: 'bg-gray-500',
              };

              return (
                <div key={unitType} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 ${typeInfo.color} rounded-lg flex items-center justify-center text-white`}>
                      {typeInfo.icon}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{typeInfo.label}</p>
                      <p className="text-xs text-gray-500">{usage?.consumption_count || 0} actions</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-gray-900">{usage?.total_consumed?.toFixed(1) || 0}</p>
                    <p className="text-xs text-gray-500">units used</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-6">
            <BarChart3 className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No usage recorded for this period</p>
          </div>
        )}

        {/* Note */}
        <p className="mt-4 text-xs text-gray-500 italic">{team.note}</p>
      </div>
    </div>
  );
}
