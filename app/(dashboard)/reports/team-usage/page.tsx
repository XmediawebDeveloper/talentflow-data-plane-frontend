'use client';

import { Activity, Users, TrendingUp, BarChart3, Download, ChevronDown, ChevronRight, Loader2, FileSpreadsheet } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { unitPoolService, ConsumptionLogEntry, UnitType, UNIT_TYPE_NAMES } from '@/lib/services/unitPoolService';
import { toast } from '@/components/ui/enhanced-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserRow {
  user_id: string;
  user_name: string;
  user_email: string;
  rs: number;
  as_count: number;
  aiu: number;
  last_active: string | null;
  entries: ConsumptionLogEntry[];
}

const TIME_RANGE_DAYS: Record<string, number> = {
  '7days': 7,
  '30days': 30,
  '90days': 90,
};

const STATUS_STYLES: Record<string, string> = {
  SUCCESS: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
  INSUFFICIENT_UNITS: 'bg-orange-100 text-orange-700',
  ABANDONED: 'bg-yellow-100 text-yellow-700',
  INTERRUPTED: 'bg-orange-100 text-orange-700',
  TENANT_SUSPENDED: 'bg-red-100 text-red-700',
  TENANT_EXPIRED: 'bg-red-100 text-red-700',
  BLOCKED: 'bg-gray-100 text-gray-700',
};

const UNIT_BADGE: Record<UnitType, string> = {
  RS: 'bg-blue-100 text-blue-700',
  AS: 'bg-purple-100 text-purple-700',
  AIU: 'bg-green-100 text-green-700',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDateParam(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

function groupByUser(entries: ConsumptionLogEntry[]): UserRow[] {
  const map = new Map<string, UserRow>();
  for (const e of entries) {
    const key = e.user_id;
    if (!map.has(key)) {
      map.set(key, {
        user_id: e.user_id,
        user_name: e.user_name || e.user_email || 'Unknown',
        user_email: e.user_email || '',
        rs: 0,
        as_count: 0,
        aiu: 0,
        last_active: null,
        entries: [],
      });
    }
    const row = map.get(key)!;
    if (e.unit_type === 'RS') row.rs += 1;
    if (e.unit_type === 'AS') row.as_count += 1;
    if (e.unit_type === 'AIU') row.aiu += 1;
    if (!row.last_active || e.created_at > row.last_active) {
      row.last_active = e.created_at;
    }
    row.entries.push(e);
  }
  return Array.from(map.values()).sort((a, b) => {
    if (!a.last_active) return 1;
    if (!b.last_active) return -1;
    return b.last_active.localeCompare(a.last_active);
  });
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function initials(name: string): string {
  return (name || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

// ─── Export Modal ─────────────────────────────────────────────────────────────

function ExportModal({
  open, onClose, timeRange,
}: {
  open: boolean;
  onClose: () => void;
  timeRange: string;
}) {
  const [format, setFormat] = useState<'csv' | 'excel'>('csv');
  const [unitType, setUnitType] = useState<string>('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleExport = async () => {
    setLoading(true);
    try {
      const days = TIME_RANGE_DAYS[timeRange] ?? 30;
      const blob = await unitPoolService.exportConsumptionHistory({
        format,
        unit_type: unitType as UnitType || undefined,
        start_date: toDateParam(days),
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `team-usage-${timeRange}-${new Date().toISOString().split('T')[0]}.${format === 'excel' ? 'xlsx' : 'csv'}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success({ title: 'Export complete', description: `Downloaded as ${format.toUpperCase()}` });
      onClose();
    } catch {
      toast.error({ title: 'Export failed', description: 'Unable to download. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-gray-700" />
          Export Team Usage
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Format</label>
            <div className="flex gap-3">
              {(['csv', 'excel'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    format === f
                      ? 'border-gray-800 bg-gray-800 text-white'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {f === 'csv' ? 'CSV' : 'Excel (.xlsx)'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Unit Type</label>
            <select
              value={unitType}
              onChange={e => setUnitType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">All types</option>
              <option value="RS">Resume Scoring (RS)</option>
              <option value="AS">Assessment (AS)</option>
              <option value="AIU">AI Interview (AIU)</option>
            </select>
          </div>

          <p className="text-xs text-gray-500">
            Period: last {TIME_RANGE_DAYS[timeRange]} days
          </p>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={loading}
            className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {loading ? 'Exporting…' : 'Download'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Drill-Down Row ───────────────────────────────────────────────────────────

function UserDrillDown({ entries }: { entries: ConsumptionLogEntry[] }) {
  const sorted = [...entries].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <tr>
      <td colSpan={7} className="bg-gray-50 border-b border-gray-200 px-6 py-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Consumption History ({sorted.length} entries)
        </p>
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {sorted.map(e => (
            <div key={e.id} className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-start gap-4">
              {/* Unit type badge */}
              <span className={`shrink-0 text-xs font-bold px-2 py-1 rounded-md ${UNIT_BADGE[e.unit_type]}`}>
                {e.unit_type}
              </span>

              {/* Entity / action */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {e.entity_name || UNIT_TYPE_NAMES[e.unit_type]}
                </p>
                {e.entity_type && (
                  <p className="text-xs text-gray-500">{e.entity_type.replace(/_/g, ' ')}</p>
                )}
                {e.overall_score != null && (
                  <p className="text-xs text-gray-500 mt-0.5">Score: <span className="font-medium text-gray-700">{e.overall_score}%</span></p>
                )}
                {e.failure_reason && (
                  <p className="text-xs text-red-500 mt-0.5">Reason: {e.failure_reason}</p>
                )}
              </div>

              {/* Units + balance */}
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold text-gray-900">
                  {e.units_consumed > 0 ? `-${e.units_consumed}` : '0'} units
                </p>
                {e.balance_before != null && e.balance_after != null && (
                  <p className="text-xs text-gray-400">
                    {e.balance_before} → {e.balance_after}
                  </p>
                )}
              </div>

              {/* Status */}
              <span className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${STATUS_STYLES[e.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {e.status.replace(/_/g, ' ')}
              </span>

              {/* Date */}
              <span className="shrink-0 text-xs text-gray-400 whitespace-nowrap">
                {formatDateTime(e.created_at)}
              </span>
            </div>
          ))}
        </div>
      </td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TeamUsagePage() {
  const [timeRange, setTimeRange] = useState('30days');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setExpandedUserId(null);
    try {
      const days = TIME_RANGE_DAYS[timeRange] ?? 30;
      const res = await unitPoolService.getConsumptionHistory({
        start_date: toDateParam(days),
        limit: 500,
      });
      const entries: ConsumptionLogEntry[] = Array.isArray(res)
        ? res
        : (res as any).items ?? (res as any).data ?? [];
      setUsers(groupByUser(entries));
    } catch {
      toast.error({ title: 'Failed to load usage data', description: 'Please refresh and try again.' });
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totals = {
    rs: users.reduce((s, u) => s + u.rs, 0),
    as_count: users.reduce((s, u) => s + u.as_count, 0),
    aiu: users.reduce((s, u) => s + u.aiu, 0),
    activeUsers: users.filter(u => {
      if (!u.last_active) return false;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 1);
      return new Date(u.last_active) >= cutoff;
    }).length,
  };

  return (
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
                  onChange={e => setTimeRange(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 text-sm"
                >
                  <option value="7days">Last 7 days</option>
                  <option value="30days">Last 30 days</option>
                  <option value="90days">Last 90 days</option>
                </select>
                <button
                  onClick={() => setShowExport(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
                >
                  <Download className="w-4 h-4" />
                  Export
                </button>
              </div>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-4 gap-6 mb-8">
            {[
              { label: 'Resumes Scored', value: totals.rs, icon: BarChart3, color: 'text-gray-800', bg: 'bg-gray-100' },
              { label: 'Assessments', value: totals.as_count, icon: TrendingUp, color: 'text-gray-800', bg: 'bg-gray-100' },
              { label: 'AI Interviews', value: totals.aiu, icon: Activity, color: 'text-green-600', bg: 'bg-green-100' },
              { label: 'Active Users', value: totals.activeUsers, icon: Users, color: 'text-orange-600', bg: 'bg-orange-100' },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">{label}</p>
                    {loading
                      ? <div className="h-9 w-12 bg-gray-100 rounded animate-pulse mt-1" />
                      : <p className="text-3xl font-semibold text-gray-900 mt-1">{value}</p>
                    }
                  </div>
                  <div className={`w-12 h-12 ${bg} rounded-lg flex items-center justify-center`}>
                    <Icon className={`w-6 h-6 ${color}`} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Team Usage Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Individual Usage</h2>
              <p className="text-sm text-gray-500">Click a row to view consumption details</p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16 gap-3 text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Loading usage data…</span>
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-sm">
                No consumption activity in the selected period.
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-6"></th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Team Member</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span> RS
                      </span>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-purple-500 inline-block"></span> AS
                      </span>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span> AIU
                      </span>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {users.map(user => {
                    const expanded = expandedUserId === user.user_id;
                    const total = user.rs + user.as_count + user.aiu;
                    return [
                      <tr
                        key={user.user_id}
                        onClick={() => setExpandedUserId(expanded ? null : user.user_id)}
                        className="hover:bg-gray-50 cursor-pointer select-none"
                      >
                        <td className="pl-6 py-4 text-gray-400">
                          {expanded
                            ? <ChevronDown className="w-4 h-4" />
                            : <ChevronRight className="w-4 h-4" />
                          }
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-800 to-gray-900 text-white flex items-center justify-center text-xs font-semibold">
                              {initials(user.user_name)}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900 text-sm">{user.user_name}</p>
                              {user.user_email && (
                                <p className="text-xs text-gray-400">{user.user_email}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.rs}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.as_count}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.aiu}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{total}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(user.last_active)}</td>
                      </tr>,
                      expanded && <UserDrillDown key={`${user.user_id}-drilldown`} entries={user.entries} />,
                    ];
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

      <ExportModal open={showExport} onClose={() => setShowExport(false)} timeRange={timeRange} />
    </main>
  );
}
