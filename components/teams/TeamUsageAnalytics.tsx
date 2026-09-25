'use client';

import {
  Users, BarChart3, ChevronDown, ChevronRight,
  Loader2, Download, Calendar, FileText, ClipboardCheck, Upload,
} from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
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
import { MENU_ITEM_SCALE_CLASS } from '@/lib/constants/menuAnimation';
import { Skeleton } from '@/components/ui/skeleton';
import { TABLE_EMPTY_PANEL_CLASS } from '@/lib/constants/tableEmptyPanel';

// ─── Constants ────────────────────────────────────────────────────────────────

const UNIT_COLORS: Record<string, string> = {
  RS:  'text-blue-600   bg-blue-50   border-blue-200',
  AS:  'text-purple-600 bg-purple-50 border-purple-200',
  AIU: 'text-success  bg-success-subtle  border-success-line',
  RU:  'text-orange-600 bg-orange-50 border-orange-200',
};

const UNIT_DOT: Record<string, string> = {
  RS: 'bg-blue-500', AS: 'bg-purple-500', AIU: 'bg-success', RU: 'bg-orange-500',
};

const STATUS_STYLES: Record<string, string> = {
  SUCCESS:            'bg-success-subtle text-success',
  FAILED:             'bg-destructive-subtle text-destructive',
  INSUFFICIENT_UNITS: 'bg-orange-100 text-orange-700',
  ABANDONED:          'bg-warning-subtle text-warning',
  INTERRUPTED:        'bg-orange-100 text-orange-700',
  TENANT_SUSPENDED:   'bg-destructive-subtle text-destructive',
  TENANT_EXPIRED:     'bg-destructive-subtle text-destructive',
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
  AIU:       'bg-success-subtle text-success',
  RU:        'bg-orange-100 text-orange-700',
  max_seats: 'bg-slate-100 text-slate-600',
};

// ─── Consumption log entries (member drill-down detail) ───────────────────────

function MemberLogEntries({ entries }: { entries: ConsumptionLogEntry[] }) {
  // Show ALL entries sorted newest-first (including system ones like max_seats)
  const sorted = [...entries].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <tr>
      <td colSpan={8} className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-700/60 px-4 py-4">
        <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-3">
          Consumption History — {sorted.length} {sorted.length === 1 ? 'entry' : 'entries'}
        </p>
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {sorted.map(e => (
            <div key={e.id} className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-4 py-3 flex items-start gap-3 text-sm">
              <span className={`shrink-0 text-xs font-bold px-2 py-1 rounded-md ${ENTRY_UNIT_BADGE_EXTENDED[e.unit_type] ?? 'bg-gray-100 text-gray-600'}`}>
                {UNIT_TYPE_LABEL[e.unit_type] ?? e.unit_type}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 dark:text-slate-100 truncate">
                  {e.unit_type === 'max_seats'
                    ? 'Seat License'
                    : (e.entity_name || UNIT_TYPE_NAMES[e.unit_type] || e.unit_type)}
                </p>
                {e.entity_type && e.unit_type !== 'max_seats' && (
                  <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{e.entity_type.replace(/_/g, ' ')}</p>
                )}
                {e.unit_type === 'max_seats' && (
                  <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">User seat allocated</p>
                )}
                {e.overall_score != null && (
                  <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                    Score: <span className="font-semibold text-gray-700 dark:text-slate-300">{e.overall_score}%</span>
                  </p>
                )}
                {e.failure_reason && (
                  <p className="text-xs text-destructive mt-0.5">Reason: {e.failure_reason}</p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="font-semibold text-gray-900 dark:text-slate-50">
                  {e.units_consumed > 0 ? `−${e.units_consumed}` : '0'} units
                </p>
                {e.balance_before != null && e.balance_after != null && (
                  <p className="text-xs text-gray-400 dark:text-slate-500">{e.balance_before} → {e.balance_after}</p>
                )}
              </div>
              <span className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${STATUS_STYLES[e.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {e.status.replace(/_/g, ' ')}
              </span>
              <span className="shrink-0 text-xs text-gray-400 dark:text-slate-500 whitespace-nowrap">
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
        className="cursor-pointer hover:bg-indigo-50/40 transition-colors border-t border-gray-100 dark:border-slate-700/60 select-none"
      >
        {/* Member */}
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="flex items-center gap-2">
            <div className="text-gray-300 dark:text-slate-500 shrink-0">
              {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </div>
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-gray-600 to-gray-800 text-white flex items-center justify-center text-xs font-semibold shrink-0">
              {initials(member.user_name || member.user_email)}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-slate-50">{member.user_name || '—'}</p>
              <p className="text-xs text-gray-400 dark:text-slate-500">{member.user_email}</p>
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
            <p className="text-xs text-gray-400 dark:text-slate-500">{getMCount(member, 'RS')} actions</p>
          </div>
        </td>

        {/* AS */}
        <td className="px-3 py-3 whitespace-nowrap">
          <div className="flex flex-col items-center gap-1">
            <span className={`inline-flex items-center justify-center min-w-[2.25rem] px-2 py-0.5 rounded-md text-sm font-bold
              ${as_ > 0 ? 'bg-purple-100 text-purple-700 ring-1 ring-purple-200' : 'bg-gray-100 text-gray-400'}`}>
              {as_.toFixed(1)}
            </span>
            <p className="text-xs text-gray-400 dark:text-slate-500">units consumed</p>
          </div>
        </td>

        {/* AIU */}
        <td className="px-3 py-3 whitespace-nowrap">
          <div className="flex flex-col items-center gap-1">
            <span className={`inline-flex items-center justify-center min-w-[2.25rem] px-2 py-0.5 rounded-md text-sm font-bold
              ${aiu > 0 ? 'bg-success-subtle text-success ring-1 ring-success-line' : 'bg-gray-100 text-gray-400'}`}>
              {aiu}
            </span>
            <p className="text-xs text-gray-400 dark:text-slate-500">{getMCount(member, 'AIU')} actions</p>
          </div>
        </td>

        {/* RU */}
        <td className="px-3 py-3 whitespace-nowrap">
          <div className="flex flex-col items-center gap-1">
            <span className={`inline-flex items-center justify-center min-w-[2.25rem] px-2 py-0.5 rounded-md text-sm font-bold
              ${ru > 0 ? 'bg-orange-100 text-orange-700 ring-1 ring-orange-200' : 'bg-gray-100 text-gray-400'}`}>
              {ru}
            </span>
            <p className="text-xs text-gray-400 dark:text-slate-500">{getMCount(member, 'RU')} actions</p>
          </div>
        </td>

        {/* JDs created */}
        <td className="px-3 py-3 whitespace-nowrap">
          <div className="flex flex-col items-center gap-1">
            <span className={`inline-flex items-center justify-center min-w-[2.25rem] px-2 py-0.5 rounded-md text-sm font-bold
              ${member.jds_created > 0 ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200' : 'bg-gray-100 text-gray-400'}`}>
              {member.jds_created}
            </span>
            <p className="text-xs text-gray-400 dark:text-slate-500">created</p>
          </div>
        </td>

        {/* Assessments created */}
        <td className="px-3 py-3 whitespace-nowrap">
          <div className="flex flex-col items-center gap-1">
            <span className={`inline-flex items-center justify-center min-w-[2.25rem] px-2 py-0.5 rounded-md text-sm font-bold
              ${member.assessments_created > 0 ? 'bg-purple-100 text-purple-700 ring-1 ring-purple-200' : 'bg-gray-100 text-gray-400'}`}>
              {member.assessments_created}
            </span>
            <p className="text-xs text-gray-400 dark:text-slate-500">created</p>
          </div>
        </td>

        {/* Last active */}
        <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-500 dark:text-slate-500">
          {member.last_activity ? formatISTDate(member.last_activity) : 'Never'}
        </td>
      </tr>

      {/* Loading — mirrors MemberLogEntries: label + entry rows */}
      {expanded && loading && (
        <tr>
          <td colSpan={8} className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-700/60 px-4 py-4">
            <Skeleton className="h-3 w-56 mb-3" />
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-4 py-3 flex items-start gap-3">
                  <Skeleton className="shrink-0 h-6 w-10 rounded-md" />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <div className="shrink-0 space-y-1.5 flex flex-col items-end">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="shrink-0 h-6 w-16 rounded-full" />
                  <Skeleton className="shrink-0 h-3 w-20" />
                </div>
              ))}
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
          <td colSpan={8} className="px-6 py-4 bg-gray-50 dark:bg-slate-800/50 text-sm text-gray-400 dark:text-slate-500 italic border-b border-gray-100 dark:border-slate-700/60">
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
        className="cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors border-t border-gray-200 dark:border-slate-700 select-none"
      >
        <td className="px-4 py-4 whitespace-nowrap">
          <div className="flex items-center gap-3">
            <div className="text-gray-400 dark:text-slate-500">
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </div>
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-slate-50 text-sm">{team.team_name || 'Unnamed Team'}</p>
              {(team.jds_created > 0 || team.assessments_created > 0) && (
                <div className="flex items-center gap-3 mt-0.5">
                  {team.jds_created > 0 && (
                    <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-slate-500">
                      <FileText className="w-3 h-3" />{team.jds_created} JDs
                    </span>
                  )}
                  {team.assessments_created > 0 && (
                    <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-slate-500">
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
              : <span className="text-gray-300 dark:text-slate-500 text-sm">—</span>}
          </td>
        ))}
        <td className="px-4 py-4 whitespace-nowrap">
          <span className={`text-sm font-bold ${total > 0 ? 'text-gray-900 dark:text-slate-50' : 'text-gray-300 dark:text-slate-500'}`}>
            {total > 0 ? total : '—'}
          </span>
        </td>
        <td className="px-4 py-4 whitespace-nowrap">
          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full transition-colors
            ${expanded
              ? 'bg-gray-800 text-white'
              : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700'
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
          <td colSpan={7} className="p-0 border-t border-gray-100 dark:border-slate-700/60">
            <div className="bg-gray-50 dark:bg-slate-800/50">
              {loadingMembers ? (
                <div className="px-4 py-3 space-y-3">
                  {/* Mirrors member rows: avatar + name/email, then unit stat columns */}
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <div className="flex items-center gap-2 w-56 shrink-0">
                        <Skeleton className="w-7 h-7 rounded-full" />
                        <div className="space-y-1.5">
                          <Skeleton className="h-4 w-28" />
                          <Skeleton className="h-3 w-36" />
                        </div>
                      </div>
                      <div className="flex-1 grid grid-cols-7 gap-3">
                        {Array.from({ length: 7 }).map((_, j) => (
                          <Skeleton key={j} className="h-6 w-full max-w-[3rem] mx-auto rounded-md" />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : members && members.length > 0 ? (
                <div className="tf-table-shell">
                  <table className="w-full">
                    {/* Member table header — 9 cols */}
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-slate-700">
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider">
                          Member
                        </th>
                        <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wider">
                          <span className="flex flex-col items-center gap-0.5">
                            <span className={`w-2 h-2 rounded-full ${UNIT_DOT.RS}`} />
                            <span className="text-gray-500 dark:text-slate-500">Resume Scoring</span>
                          </span>
                        </th>
                        <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wider">
                          <span className="flex flex-col items-center gap-0.5">
                            <span className={`w-2 h-2 rounded-full ${UNIT_DOT.AS}`} />
                            <span className="text-gray-500 dark:text-slate-500">Assessment</span>
                          </span>
                        </th>
                        <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wider">
                          <span className="flex flex-col items-center gap-0.5">
                            <span className={`w-2 h-2 rounded-full ${UNIT_DOT.AIU}`} />
                            <span className="text-gray-500 dark:text-slate-500">AI Interview</span>
                          </span>
                        </th>
                        <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wider">
                          <span className="flex flex-col items-center gap-0.5">
                            <span className={`w-2 h-2 rounded-full ${UNIT_DOT.RU}`} />
                            <span className="text-gray-500 dark:text-slate-500">Resume Storage</span>
                          </span>
                        </th>
                        <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider">
                          <span className="flex flex-col items-center gap-0.5">
                            <FileText className="w-3 h-3 text-indigo-400" />
                            JDs
                          </span>
                        </th>
                        <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider">
                          <span className="flex flex-col items-center gap-0.5">
                            <ClipboardCheck className="w-3 h-3 text-purple-400" />
                            Assessments
                          </span>
                        </th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider">
                          Last Active
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-900 divide-y divide-gray-50 dark:divide-slate-700/60">
                      {members.map(m => (
                        <MemberRow key={m.user_id} member={m} fromDate={fromDate} />
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="px-6 py-4 text-sm text-gray-400 dark:text-slate-500 italic">
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

function StatCard({ label, value, dot, loading, onClick, active }: {
  label: string; value: number; dot: string; loading: boolean;
  // When supplied, the card renders as a button — drives the cards → list drill-in.
  onClick?: () => void;
  active?: boolean;
}) {
  const className = `bg-white dark:bg-slate-900 rounded-xl border shadow-sm px-5 py-4 flex items-center gap-4 text-left w-full ${
    onClick ? 'transition-all hover:-translate-y-0.5 hover:shadow-md cursor-pointer' : ''
  } ${active ? 'border-brand-blue ring-2 ring-brand-blue/20' : 'border-gray-200 dark:border-slate-700'}`;
  const content = (
    <>
      <span className={`w-3 h-3 rounded-full shrink-0 ${dot}`} />
      <div>
        <p className="text-xs text-gray-500 dark:text-slate-500">{label}</p>
        {loading
          ? <div className="h-6 w-10 bg-gray-100 dark:bg-slate-800 rounded animate-pulse mt-1" />
          : <p className="text-xl font-bold text-gray-900 dark:text-slate-50">{value}</p>}
      </div>
    </>
  );
  if (onClick) {
    return <button type="button" onClick={onClick} className={className}>{content}</button>;
  }
  return <div className={className}>{content}</div>;
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

async function exportUsersCSV(teams: TeamUsageSummary[], fromDate: string, toDate: string) {
  const rows: (string | number | null)[][] = [
    ['Team', 'Member Name', 'Member Email', 'RS Actions', 'AS Units', 'AIU Units', 'RU Actions', 'Total Actions', 'Last Active'],
  ];

  for (const team of teams) {
    try {
      const summary = await teamService.getTeamMembersUsage(team.team_id, fromDate, toDate);
      for (const m of summary.members ?? []) {
        const rs  = m.by_type['RS']?.consumption_count  ?? 0;
        const as_ = m.by_type['AS']?.total_consumed      ?? 0;
        const aiu = m.by_type['AIU']?.total_consumed     ?? 0;
        const ru  = m.by_type['RU']?.consumption_count  ?? 0;
        rows.push([
          team.team_name ?? 'Unknown',
          m.user_name ?? '',
          m.user_email ?? '',
          rs, as_, aiu, ru,
          rs + ru,
          // was `m.last_active`, which does not exist on TeamMemberUsage - the backend
          // emits `last_activity` (routers/unit_pool.py) and line ~272 above already
          // reads that. The `?? ''` masked it, so this CSV column exported blank.
          m.last_activity ?? '',
        ]);
      }
    } catch {
      // Skip teams we can't fetch
    }
  }

  const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `team-usage-by-user-${fromDate}-to-${toDate}.csv`;
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
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportingUsers, setExportingUsers] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  // Drill-in: 'cards' shows only the 5 summary tiles; clicking a card opens the
  // team usage table below. activeCard highlights which tile was clicked.
  const [pageView, setPageView] = useState<'cards' | 'list'>('cards');
  const [activeCard, setActiveCard] = useState<'rs' | 'as' | 'aiu' | 'ru' | 'all' | null>(null);
  const openList = (card: 'rs' | 'as' | 'aiu' | 'ru' | 'all') => {
    setActiveCard(card);
    setPageView('list');
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
          <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-50">Team Usage</h2>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${isTenantAdmin ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400'}`}>
            {isTenantAdmin ? 'All Teams' : 'Your Teams'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400 dark:text-slate-500" />
            <input
              type="date"
              value={fromDate}
              max={toDate}
              onChange={e => setFromDate(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-gray-500"
            />
            <span className="text-sm text-gray-500 dark:text-slate-500">to</span>
            <input
              type="date"
              value={toDate}
              min={fromDate}
              max={new Date().toISOString().split('T')[0]}
              onChange={e => setToDate(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-gray-500"
            />
          </div>
          {canExport && (
            <div className="relative" ref={exportMenuRef}>
              <button
                onClick={() => teams.length > 0 && !loading && setShowExportMenu(v => !v)}
                disabled={teams.length === 0 || loading}
                className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-40"
              >
                <Download className="w-4 h-4" />
                Export
                <ChevronDown className="w-3.5 h-3.5 text-gray-500 dark:text-slate-500" />
              </button>
              {showExportMenu && (
                <div className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg z-20 overflow-hidden">
                  <button
                    onClick={() => { exportCSV(teams, fromDate, toDate); setShowExportMenu(false); }}
                    className="group w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300 flex items-center gap-2"
                  >
                    <FileText className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                    <span className={MENU_ITEM_SCALE_CLASS}>Team Level</span>
                  </button>
                  <button
                    disabled={exportingUsers}
                    onClick={async () => {
                      setShowExportMenu(false);
                      setExportingUsers(true);
                      try {
                        await exportUsersCSV(teams, fromDate, toDate);
                      } finally {
                        setExportingUsers(false);
                      }
                    }}
                    className="group w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300 flex items-center gap-2 disabled:opacity-50"
                  >
                    {exportingUsers
                      ? <Loader2 className="w-4 h-4 text-gray-400 dark:text-slate-500 animate-spin" />
                      : <Users className="w-4 h-4 text-gray-400 dark:text-slate-500" />}
                    <span className={MENU_ITEM_SCALE_CLASS}>User Level (drill-down)</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        <StatCard label="Resume Scoring"  value={totals.rs}  dot="bg-blue-500"   loading={loading} onClick={() => openList('rs')}  active={pageView === 'list' && activeCard === 'rs'} />
        <StatCard label="Assessments"     value={totals.as_} dot="bg-purple-500" loading={loading} onClick={() => openList('as')}  active={pageView === 'list' && activeCard === 'as'} />
        <StatCard label="AI Interviews"   value={totals.aiu} dot="bg-success"  loading={loading} onClick={() => openList('aiu')} active={pageView === 'list' && activeCard === 'aiu'} />
        <StatCard label="Resume Storage"  value={totals.ru}  dot="bg-orange-500" loading={loading} onClick={() => openList('ru')}  active={pageView === 'list' && activeCard === 'ru'} />
        <StatCard label="Total Actions"   value={totals.all} dot="bg-gray-400"   loading={loading} onClick={() => openList('all')} active={pageView === 'list' && activeCard === 'all'} />
      </div>

      {pageView === 'list' && (
      <>
      {/* justify-end, not justify-between: the Back to overview button that
          used to hold the left slot is gone, and the tally belongs on the
          right. */}
      <div className="mb-4 flex items-center justify-end gap-2">
        <span className="text-xs text-gray-500 dark:text-slate-400">
          {teams.length} {teams.length === 1 ? 'team' : 'teams'}
        </span>
      </div>

      {/* Outer team table — 7 cols (Team, RS, AS, AIU, RU, Total, expand) */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden tf-table-shell">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider">Team</th>
              {(['RS', 'AS', 'AIU', 'RU'] as const).map(k => (
                <th key={k} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">
                  <span className="flex items-center gap-1.5 text-gray-500 dark:text-slate-500">
                    <span className={`w-2 h-2 rounded-full ${UNIT_DOT[k]}`} />{k}
                  </span>
                </th>
              ))}
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider">Total</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              /* Skeleton rows mirror the 7-col team row: Team, RS, AS, AIU, RU, Total, expand */
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-t border-gray-200 dark:border-slate-700">
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <Skeleton className="w-4 h-4 rounded" />
                      <Skeleton className="w-9 h-9 rounded-lg" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  </td>
                  {Array.from({ length: 4 }).map((_, j) => (
                    <td key={j} className="px-4 py-4 whitespace-nowrap">
                      <Skeleton className="h-6 w-10 rounded-md" />
                    </td>
                  ))}
                  <td className="px-4 py-4 whitespace-nowrap">
                    <Skeleton className="h-5 w-8" />
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <Skeleton className="h-6 w-24 rounded-full" />
                  </td>
                </tr>
              ))
            ) : teams.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-0">
                  {/* The shared empty-state panel — centred on both axes with
                      the same height and padding every other table's uses. */}
                  <div className={TABLE_EMPTY_PANEL_CLASS}>
                    <BarChart3 className="w-10 h-10 text-gray-200 dark:text-slate-500 mx-auto mb-3" />
                    <p className="text-sm text-gray-400 dark:text-slate-500">No team usage data for the selected period.</p>
                  </div>
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

      <p className="text-xs text-gray-400 dark:text-slate-500 mt-3">
        Click a team to see its members · Click a member to see their full consumption history
      </p>
      </>
      )}
    </div>
  );
}
