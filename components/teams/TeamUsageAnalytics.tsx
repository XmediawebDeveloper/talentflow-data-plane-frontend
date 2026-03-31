'use client';

import {
  Users, BarChart3, ChevronDown, ChevronRight,
  Loader2, Download, Calendar, FileText, ClipboardCheck, Upload,
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import teamService, {
  TeamUsageSummary,
  TeamMemberUsage,
} from '@/lib/services/teamService';
import {
  unitPoolService,
  ConsumptionLogEntry,
  UNIT_TYPE_NAMES,
} from '@/lib/services/unitPoolService';
import { toast } from '@/components/ui/enhanced-toast';
import { formatISTDate, formatIST } from '@/lib/utils/dateUtils';
import { useAuth } from '@/components/providers/AuthProvider';

// ─── Constants ────────────────────────────────────────────────────────────────

const UNIT_COLORS: Record<string, string> = {
  RS:  'text-blue-600   bg-blue-50   border-blue-200',
  AS:  'text-purple-600 bg-purple-50 border-purple-200',
  AIU: 'text-green-600  bg-green-50  border-green-200',
  RU:  'text-orange-600 bg-orange-50 border-orange-200',
};

const UNIT_DOT: Record<string, string> = {
  RS: 'bg-blue-500', AS: 'bg-purple-500', AIU: 'bg-green-500', RU: 'bg-orange-500',
};

const STATUS_STYLES: Record<string, string> = {
  SUCCESS:            'bg-green-100 text-green-700',
  FAILED:             'bg-red-100 text-red-700',
  INSUFFICIENT_UNITS: 'bg-orange-100 text-orange-700',
  ABANDONED:          'bg-yellow-100 text-yellow-700',
  INTERRUPTED:        'bg-orange-100 text-orange-700',
  TENANT_SUSPENDED:   'bg-red-100 text-red-700',
  TENANT_EXPIRED:     'bg-red-100 text-red-700',
  BLOCKED:            'bg-gray-100 text-gray-700',
};


// ─── Helpers ─────────────────────────────────────────────────────────────────

function getCount(team: TeamUsageSummary, key: 'RS' | 'AS' | 'AIU' | 'RU') {
  return team.by_type[key]?.consumption_count ?? 0;
}

function getMCount(m: TeamMemberUsage, key: 'RS' | 'AS' | 'AIU' | 'RU') {
  return m.by_type[key]?.consumption_count ?? 0;
}

function getMUnits(m: TeamMemberUsage, key: 'RS' | 'AS' | 'AIU' | 'RU') {
  return m.by_type[key]?.total_consumed ?? 0;
}

function teamTotal(t: TeamUsageSummary) {
  return getCount(t, 'RS') + getCount(t, 'AS') + getCount(t, 'AIU') + getCount(t, 'RU');
}

function initials(name: string) {
  return (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

// Human-readable labels for all unit types (including system ones)
const UNIT_TYPE_LABEL: Record<string, string> = {
  RS:         'RS',
  AS:         'AS',
  AIU:        'AIU',
  RU:         'RU',
  max_seats:  'SEAT',
};

const ENTRY_UNIT_BADGE_EXTENDED: Record<string, string> = {
  RS:        'bg-blue-100 text-blue-700',
  AS:        'bg-purple-100 text-purple-700',
  AIU:       'bg-green-100 text-green-700',
  RU:        'bg-orange-100 text-orange-700',
  max_seats: 'bg-slate-100 text-slate-600',
};

// ─── Consumption log entries (member drill-down detail) ───────────────────────

function MemberLogEntries({ entries }: { entries: ConsumptionLogEntry[] }) {
  // Show ALL entries sorted newest-first (including system ones like max_seats)
  const sorted = [...entries].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <tr>
      <td colSpan={8} className="bg-gray-50 border-b border-gray-100 px-4 py-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Consumption History — {sorted.length} {sorted.length === 1 ? 'entry' : 'entries'}
        </p>
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {sorted.map(e => (
            <div key={e.id} className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-start gap-3 text-sm">
              <span className={`shrink-0 text-xs font-bold px-2 py-1 rounded-md ${ENTRY_UNIT_BADGE_EXTENDED[e.unit_type] ?? 'bg-gray-100 text-gray-600'}`}>
                {UNIT_TYPE_LABEL[e.unit_type] ?? e.unit_type}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 truncate">
                  {e.unit_type === 'max_seats'
                    ? 'Seat License'
                    : (e.entity_name || UNIT_TYPE_NAMES[e.unit_type] || e.unit_type)}
                </p>
                {e.entity_type && e.unit_type !== 'max_seats' && (
                  <p className="text-xs text-gray-400 mt-0.5">{e.entity_type.replace(/_/g, ' ')}</p>
                )}
                {e.unit_type === 'max_seats' && (
                  <p className="text-xs text-gray-400 mt-0.5">User seat allocated</p>
                )}
                {e.overall_score != null && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Score: <span className="font-semibold text-gray-700">{e.overall_score}%</span>
                  </p>
                )}
                {e.failure_reason && (
                  <p className="text-xs text-red-500 mt-0.5">Reason: {e.failure_reason}</p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="font-semibold text-gray-900">
                  {e.units_consumed > 0 ? `−${e.units_consumed}` : '0'} units
                </p>
                {e.balance_before != null && e.balance_after != null && (
                  <p className="text-xs text-gray-400">{e.balance_before} → {e.balance_after}</p>
                )}
              </div>
              <span className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${STATUS_STYLES[e.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {e.status.replace(/_/g, ' ')}
              </span>
              <span className="shrink-0 text-xs text-gray-400 whitespace-nowrap">
                {formatIST(e.created_at)}
              </span>
            </div>
          ))}
        </div>
      </td>
    </tr>
  );
}

// ─── Single member row ────────────────────────────────────────────────────────

function MemberRow({ member, fromDate }: { member: TeamMemberUsage; fromDate: string }) {
  const [expanded, setExpanded] = useState(false);
  const [entries, setEntries] = useState<ConsumptionLogEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (entries !== null) return;
    setLoading(true);
    try {
      const res = await unitPoolService.getConsumptionHistory({
        user_id: member.user_id,
        start_date: fromDate,
        limit: 200,
      });
      const items: ConsumptionLogEntry[] = Array.isArray(res)
        ? res
        : (res as any).items ?? (res as any).data ?? [];
      setEntries(items);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  // Reset on date change
  useEffect(() => { setEntries(null); setExpanded(false); }, [fromDate]);

  const rs   = getMCount(member, 'RS');
  const as_  = getMUnits(member, 'AS');   // float for assessments
  const aiu  = getMCount(member, 'AIU');
  const ru   = getMCount(member, 'RU');

  return (
    <>
      <tr
        onClick={toggle}
        className="cursor-pointer hover:bg-indigo-50/40 transition-colors border-t border-gray-100 select-none"
      >
        {/* Member */}
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="flex items-center gap-2">
            <div className="text-gray-300 shrink-0">
              {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </div>
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-gray-600 to-gray-800 text-white flex items-center justify-center text-xs font-semibold shrink-0">
              {initials(member.user_name || member.user_email)}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{member.user_name || '—'}</p>
              <p className="text-xs text-gray-400">{member.user_email}</p>
            </div>
          </div>
        </td>

        {/* RS */}
        <td className="px-3 py-3 whitespace-nowrap">
          <div className="flex flex-col items-center gap-1">
            <span className={`inline-flex items-center justify-center min-w-[2.25rem] px-2 py-0.5 rounded-md text-sm font-bold
              ${rs > 0 ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-200' : 'bg-gray-100 text-gray-400'}`}>
              {rs}
            </span>
            <p className="text-xs text-gray-400">{getMCount(member, 'RS')} actions</p>
          </div>
        </td>

        {/* AS */}
        <td className="px-3 py-3 whitespace-nowrap">
          <div className="flex flex-col items-center gap-1">
            <span className={`inline-flex items-center justify-center min-w-[2.25rem] px-2 py-0.5 rounded-md text-sm font-bold
              ${as_ > 0 ? 'bg-purple-100 text-purple-700 ring-1 ring-purple-200' : 'bg-gray-100 text-gray-400'}`}>
              {as_.toFixed(1)}
            </span>
            <p className="text-xs text-gray-400">units consumed</p>
          </div>
        </td>

        {/* AIU */}
        <td className="px-3 py-3 whitespace-nowrap">
          <div className="flex flex-col items-center gap-1">
            <span className={`inline-flex items-center justify-center min-w-[2.25rem] px-2 py-0.5 rounded-md text-sm font-bold
              ${aiu > 0 ? 'bg-green-100 text-green-700 ring-1 ring-green-200' : 'bg-gray-100 text-gray-400'}`}>
              {aiu}
            </span>
            <p className="text-xs text-gray-400">{getMCount(member, 'AIU')} actions</p>
          </div>
        </td>

        {/* RU */}
        <td className="px-3 py-3 whitespace-nowrap">
          <div className="flex flex-col items-center gap-1">
            <span className={`inline-flex items-center justify-center min-w-[2.25rem] px-2 py-0.5 rounded-md text-sm font-bold
              ${ru > 0 ? 'bg-orange-100 text-orange-700 ring-1 ring-orange-200' : 'bg-gray-100 text-gray-400'}`}>
              {ru}
            </span>
            <p className="text-xs text-gray-400">{getMCount(member, 'RU')} actions</p>
          </div>
        </td>

        {/* JDs created */}
        <td className="px-3 py-3 whitespace-nowrap">
          <div className="flex flex-col items-center gap-1">
            <span className={`inline-flex items-center justify-center min-w-[2.25rem] px-2 py-0.5 rounded-md text-sm font-bold
              ${member.jds_created > 0 ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200' : 'bg-gray-100 text-gray-400'}`}>
              {member.jds_created}
            </span>
            <p className="text-xs text-gray-400">created</p>
          </div>
        </td>

        {/* Assessments created */}
        <td className="px-3 py-3 whitespace-nowrap">
          <div className="flex flex-col items-center gap-1">
            <span className={`inline-flex items-center justify-center min-w-[2.25rem] px-2 py-0.5 rounded-md text-sm font-bold
              ${member.assessments_created > 0 ? 'bg-purple-100 text-purple-700 ring-1 ring-purple-200' : 'bg-gray-100 text-gray-400'}`}>
              {member.assessments_created}
            </span>
            <p className="text-xs text-gray-400">created</p>
          </div>
        </td>

        {/* Last active */}
        <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-500">
          {member.last_activity ? formatISTDate(member.last_activity) : 'Never'}
        </td>
      </tr>

      {/* Loading */}
      {expanded && loading && (
        <tr>
          <td colSpan={8} className="px-6 py-4 bg-gray-50">
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading consumption history…
            </div>
          </td>
        </tr>
      )}

      {/* Log entries */}
      {expanded && !loading && entries !== null && entries.length > 0 && (
        <MemberLogEntries entries={entries} />
      )}

      {/* Empty */}
      {expanded && !loading && entries !== null && entries.length === 0 && (
        <tr>
          <td colSpan={8} className="px-6 py-4 bg-gray-50 text-sm text-gray-400 italic border-b border-gray-100">
            No consumption entries for this member in the selected period.
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Team row (outer table — 7 cols) + nested member table (10 cols) ──────────

function TeamRow({
  team,
  fromDate,
  toDate,
  expanded,
  onToggle,
}: {
  team: TeamUsageSummary;
  fromDate: string;
  toDate: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [members, setMembers] = useState<TeamMemberUsage[] | null>(null);
  const [loadingMembers, setLoadingMembers] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    setLoadingMembers(true);
    setMembers(null);
    teamService.getTeamMembersUsage(team.team_id, fromDate, toDate)
      .then(res => { if (!cancelled) setMembers(res.members); })
      .catch(() => { if (!cancelled) setMembers([]); })
      .finally(() => { if (!cancelled) setLoadingMembers(false); });
    return () => { cancelled = true; };
  }, [expanded, team.team_id, fromDate, toDate]);

  const rs  = getCount(team, 'RS');
  const as_ = getCount(team, 'AS');
  const aiu = getCount(team, 'AIU');
  const ru  = getCount(team, 'RU');
  const total = teamTotal(team);

  return (
    <>
      {/* Team summary row — outer table 7 cols */}
      <tr
        onClick={onToggle}
        className="cursor-pointer hover:bg-gray-50 transition-colors border-t border-gray-200 select-none"
      >
        <td className="px-4 py-4 whitespace-nowrap">
          <div className="flex items-center gap-3">
            <div className="text-gray-400">
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </div>
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">{team.team_name || 'Unnamed Team'}</p>
              {(team.jds_created > 0 || team.assessments_created > 0) && (
                <div className="flex items-center gap-3 mt-0.5">
                  {team.jds_created > 0 && (
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <FileText className="w-3 h-3" />{team.jds_created} JDs
                    </span>
                  )}
                  {team.assessments_created > 0 && (
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <ClipboardCheck className="w-3 h-3" />{team.assessments_created} Assessments
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </td>
        {([['RS', rs], ['AS', as_], ['AIU', aiu], ['RU', ru]] as [string, number][]).map(([key, val]) => (
          <td key={key} className="px-4 py-4 whitespace-nowrap">
            {val > 0
              ? <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-md border ${UNIT_COLORS[key]}`}>{val}</span>
              : <span className="text-gray-300 text-sm">—</span>}
          </td>
        ))}
        <td className="px-4 py-4 whitespace-nowrap">
          <span className={`text-sm font-bold ${total > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
            {total > 0 ? total : '—'}
          </span>
        </td>
        <td className="px-4 py-4 whitespace-nowrap">
          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full transition-colors
            ${expanded
              ? 'bg-gray-800 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {expanded ? (
              <><ChevronDown className="w-3 h-3" /> Collapse</>
            ) : (
              <><ChevronRight className="w-3 h-3" /> Members</>
            )}
          </span>
        </td>
      </tr>

      {/* Member expansion — full-width nested table with 10 columns */}
      {expanded && (
        <tr>
          <td colSpan={7} className="p-0 border-t border-gray-100">
            <div className="bg-gray-50">
              {loadingMembers ? (
                <div className="flex items-center gap-2 text-gray-400 text-sm px-6 py-4">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading members…
                </div>
              ) : members && members.length > 0 ? (
                <table className="w-full">
                  {/* Member table header — 9 cols */}
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Member
                      </th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wider">
                        <span className="flex flex-col items-center gap-0.5">
                          <span className={`w-2 h-2 rounded-full ${UNIT_DOT.RS}`} />
                          <span className="text-gray-500">Resume Scoring</span>
                        </span>
                      </th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wider">
                        <span className="flex flex-col items-center gap-0.5">
                          <span className={`w-2 h-2 rounded-full ${UNIT_DOT.AS}`} />
                          <span className="text-gray-500">Assessment</span>
                        </span>
                      </th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wider">
                        <span className="flex flex-col items-center gap-0.5">
                          <span className={`w-2 h-2 rounded-full ${UNIT_DOT.AIU}`} />
                          <span className="text-gray-500">AI Interview</span>
                        </span>
                      </th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wider">
                        <span className="flex flex-col items-center gap-0.5">
                          <span className={`w-2 h-2 rounded-full ${UNIT_DOT.RU}`} />
                          <span className="text-gray-500">Resume Upload</span>
                        </span>
                      </th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        <span className="flex flex-col items-center gap-0.5">
                          <FileText className="w-3 h-3 text-indigo-400" />
                          JDs
                        </span>
                      </th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        <span className="flex flex-col items-center gap-0.5">
                          <ClipboardCheck className="w-3 h-3 text-purple-400" />
                          Assessments
                        </span>
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Last Active
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-50">
                    {members.map(m => (
                      <MemberRow key={m.user_id} member={m} fromDate={fromDate} />
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="px-6 py-4 text-sm text-gray-400 italic">
                  No members with usage in this period.
                </p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Summary stat card ────────────────────────────────────────────────────────

function StatCard({ label, value, dot, loading }: {
  label: string; value: number; dot: string; loading: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 flex items-center gap-4">
      <span className={`w-3 h-3 rounded-full shrink-0 ${dot}`} />
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        {loading
          ? <div className="h-6 w-10 bg-gray-100 rounded animate-pulse mt-1" />
          : <p className="text-xl font-bold text-gray-900">{value}</p>}
      </div>
    </div>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

function exportCSV(teams: TeamUsageSummary[], fromDate: string, toDate: string) {
  const rows = [
    ['Team', 'RS', 'AS', 'AIU', 'Total', 'JDs Created', 'Assessments Created'],
    ...teams.map(t => [
      t.team_name ?? 'Unknown',
      getCount(t, 'RS'), getCount(t, 'AS'), getCount(t, 'AIU'),
      teamTotal(t), t.jds_created, t.assessments_created,
    ]),
  ];
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `team-usage-${fromDate}-to-${toDate}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TeamUsageAnalytics() {
  const { isTenantAdmin, user } = useAuth();
  const canExport = isTenantAdmin || !!user?.permissions?.canExport;
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [teams, setTeams] = useState<TeamUsageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);

  const fetchTeams = useCallback(async () => {
    setLoading(true);
    setExpandedTeamId(null);
    try {
      const res = isTenantAdmin
        ? await teamService.getAllTeamsUsage(fromDate, toDate)
        : await teamService.getMyTeamsUsage(fromDate, toDate);
      setTeams(res.teams ?? []);
    } catch {
      toast.error({ title: 'Failed to load team usage', description: 'Please refresh and try again.' });
      setTeams([]);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, isTenantAdmin]);

  useEffect(() => { fetchTeams(); }, [fetchTeams]);

  const totals = {
    rs:  teams.reduce((s, t) => s + getCount(t, 'RS'), 0),
    as_: teams.reduce((s, t) => s + getCount(t, 'AS'), 0),
    aiu: teams.reduce((s, t) => s + getCount(t, 'AIU'), 0),
    ru:  teams.reduce((s, t) => s + getCount(t, 'RU'), 0),
    all: teams.reduce((s, t) => s + teamTotal(t), 0),
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-900">Team Usage</h2>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${isTenantAdmin ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
            {isTenantAdmin ? 'All Teams' : 'Your Teams'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <input
              type="date"
              value={fromDate}
              max={toDate}
              onChange={e => setFromDate(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-500"
            />
            <span className="text-sm text-gray-500">to</span>
            <input
              type="date"
              value={toDate}
              min={fromDate}
              max={new Date().toISOString().split('T')[0]}
              onChange={e => setToDate(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-500"
            />
          </div>
          {canExport && (
            <button
              onClick={() => teams.length > 0 && exportCSV(teams, fromDate, toDate)}
              disabled={teams.length === 0 || loading}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-40"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          )}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        <StatCard label="Resume Scoring"  value={totals.rs}  dot="bg-blue-500"   loading={loading} />
        <StatCard label="Assessments"     value={totals.as_} dot="bg-purple-500" loading={loading} />
        <StatCard label="AI Interviews"   value={totals.aiu} dot="bg-green-500"  loading={loading} />
        <StatCard label="Resume Uploads"  value={totals.ru}  dot="bg-orange-500" loading={loading} />
        <StatCard label="Total Actions"   value={totals.all} dot="bg-gray-400"   loading={loading} />
      </div>

      {/* Outer team table — 7 cols (Team, RS, AS, AIU, RU, Total, expand) */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Team</th>
              {(['RS', 'AS', 'AIU', 'RU'] as const).map(k => (
                <th key={k} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">
                  <span className="flex items-center gap-1.5 text-gray-500">
                    <span className={`w-2 h-2 rounded-full ${UNIT_DOT[k]}`} />{k}
                  </span>
                </th>
              ))}
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="py-16">
                  <div className="flex items-center justify-center gap-3 text-gray-500">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Loading team usage…</span>
                  </div>
                </td>
              </tr>
            ) : teams.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-16 text-center">
                  <BarChart3 className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-sm text-gray-400">No team usage data for the selected period.</p>
                </td>
              </tr>
            ) : (
              teams.map(team => (
                <TeamRow
                  key={team.team_id}
                  team={team}
                  fromDate={fromDate}
                  toDate={toDate}
                  expanded={expandedTeamId === team.team_id}
                  onToggle={() => setExpandedTeamId(
                    expandedTeamId === team.team_id ? null : team.team_id
                  )}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-3">
        Click a team to see its members · Click a member to see their full consumption history
      </p>
    </div>
  );
}
