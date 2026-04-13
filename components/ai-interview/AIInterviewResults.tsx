'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Search, Filter, ChevronLeft, ChevronRight, Eye, Loader2,
  Users, CheckCircle, Clock, Mail, XCircle, AlertTriangle, CalendarDays,
  X, BarChart3,
} from 'lucide-react';
import { toast } from 'sonner';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import type { AIInterviewResponse } from '@/lib/services/aiInterviewService';
import { formatISTDate } from '@/lib/utils/dateUtils';

interface AIInterviewResultsProps {
  configId: string;
  configTitle?: string;
  jdTitle?: string;
  onBack: () => void;
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'invited', label: 'Invited' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
];

function getStatusBadge(status: string) {
  switch (status) {
    case 'completed': return 'bg-green-100 text-green-700';
    case 'in_progress': return 'bg-yellow-100 text-yellow-700';
    case 'invited': return 'bg-blue-100 text-blue-700';
    case 'expired': return 'bg-gray-100 text-gray-600';
    case 'cancelled': return 'bg-red-100 text-red-600';
    default: return 'bg-gray-100 text-gray-600';
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'completed': return 'Completed';
    case 'in_progress': return 'In Progress';
    case 'invited': return 'Invited';
    case 'expired': return 'Expired';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'completed': return <CheckCircle className="w-4 h-4 text-green-500" />;
    case 'in_progress': return <Clock className="w-4 h-4 text-yellow-500" />;
    case 'invited': return <Mail className="w-4 h-4 text-blue-500" />;
    case 'cancelled': return <XCircle className="w-4 h-4 text-red-500" />;
    case 'expired': return <XCircle className="w-4 h-4 text-gray-400" />;
    default: return <Mail className="w-4 h-4 text-gray-400" />;
  }
}

function getProctoringRisk(session: AIInterviewResponse): { level: string; badge: string } {
  // Prefer server-computed risk_level (persisted at completion time, AIU-82)
  const stored = session.risk_level;
  if (stored) {
    if (stored === 'high')   return { level: 'High',   badge: 'bg-red-100 text-red-700' };
    if (stored === 'medium') return { level: 'Medium', badge: 'bg-yellow-100 text-yellow-700' };
    if (stored === 'low')    return { level: 'Low',    badge: 'bg-blue-100 text-blue-700' };
    return { level: 'None', badge: 'bg-green-100 text-green-700' };
  }
  // Fallback: heuristic from raw violations (pre-AIU-82 sessions or incomplete data)
  const violations = session.proctoring_violations || [];
  const severe = violations.filter((v) => v.severity === 'high' || v.severity === 'critical').length;
  const medium = violations.filter((v) => v.severity === 'medium').length;
  if (severe >= 3 || (severe >= 1 && medium >= 2)) return { level: 'High',   badge: 'bg-red-100 text-red-700' };
  if (severe >= 1 || medium >= 2)                  return { level: 'Medium', badge: 'bg-yellow-100 text-yellow-700' };
  if (violations.length > 0)                       return { level: 'Low',    badge: 'bg-blue-100 text-blue-700' };
  return { level: 'None', badge: 'bg-green-100 text-green-700' };
}

function formatDuration(session: AIInterviewResponse): string {
  if (!session.started_at || !session.completed_at) return '—';
  const start = new Date(session.started_at).getTime();
  const end = new Date(session.completed_at).getTime();
  const diffMs = end - start;
  if (diffMs <= 0) return '—';
  const mins = Math.floor(diffMs / 60000);
  const secs = Math.floor((diffMs % 60000) / 1000);
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

export default function AIInterviewResults({ configId, configTitle, jdTitle, onBack }: AIInterviewResultsProps) {
  const router = useRouter();
  const [sessions, setSessions] = useState<AIInterviewResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [scoreMin, setScoreMin] = useState('');
  const [scoreMax, setScoreMax] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await aiInterviewService.getConfigInvitations(configId);
      setSessions(result.items);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load candidate sessions');
    } finally {
      setIsLoading(false);
    }
  }, [configId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Auto-refresh every 5s while any session is in_progress (live monitoring)
  useEffect(() => {
    const hasLive = sessions.some((s) => s.status === 'in_progress');
    if (!hasLive) return;
    const id = setInterval(() => {
      aiInterviewService.getConfigInvitations(configId)
        .then((r) => setSessions(r.items))
        .catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, [sessions, configId]);

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, scoreMin, scoreMax, dateFrom, dateTo]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      // Search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const name = (s.candidate_name || '').toLowerCase();
        const email = (s.candidate_email || '').toLowerCase();
        const cid = (s.candidate_cid || '').toLowerCase();
        if (!name.includes(q) && !email.includes(q) && !cid.includes(q)) return false;
      }
      // Status
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      // Score range
      if (scoreMin !== '' && (s.score == null || s.score < parseFloat(scoreMin))) return false;
      if (scoreMax !== '' && (s.score == null || s.score > parseFloat(scoreMax))) return false;
      // Date range (completed_at)
      if (dateFrom && s.completed_at) {
        if (new Date(s.completed_at) < new Date(dateFrom)) return false;
      }
      if (dateTo && s.completed_at) {
        const to = new Date(dateTo);
        to.setDate(to.getDate() + 1);
        if (new Date(s.completed_at) > to) return false;
      }
      return true;
    });
  }, [sessions, searchQuery, statusFilter, scoreMin, scoreMax, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filteredSessions.length / PAGE_SIZE));
  const paginatedSessions = filteredSessions.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Stats
  const stats = useMemo(() => {
    const completed = sessions.filter((s) => s.status === 'completed');
    const total = sessions.length;
    const avgScore = completed.length > 0
      ? Math.round(completed.reduce((sum, s) => sum + (s.score || 0), 0) / completed.length)
      : null;
    const inProgress = sessions.filter((s) => s.status === 'in_progress').length;
    return { total, completed: completed.length, inProgress, avgScore };
  }, [sessions]);

  const hasActiveFilters = statusFilter !== 'all' || scoreMin || scoreMax || dateFrom || dateTo;

  const clearFilters = () => {
    setStatusFilter('all');
    setScoreMin('');
    setScoreMax('');
    setDateFrom('');
    setDateTo('');
  };

  const handleViewDetails = (session: AIInterviewResponse) => {
    router.push(`/recruitment/ai-interviews/${configId}/results/details?session_id=${session.id}`);
  };

  return (
    <div className="flex-1 p-8 overflow-y-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to AI Interviews
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{configTitle || 'AI Interview'}</h1>
            {jdTitle && <p className="text-sm text-gray-500 mt-1">{jdTitle}</p>}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-gray-400" />
            <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total Invited</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Completed</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{stats.completed}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-yellow-500" />
            <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">In Progress</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{stats.inProgress}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-4 h-4 text-purple-500" />
            <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Avg Score</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {stats.avgScore !== null ? `${stats.avgScore}%` : '—'}
          </div>
        </div>
      </div>

      {/* Search + Filter bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, email, or CID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 bg-white"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-2 px-3 py-2 text-sm border rounded-lg transition-colors ${
              hasActiveFilters
                ? 'border-purple-400 bg-purple-50 text-purple-700'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
            {hasActiveFilters && (
              <span className="w-5 h-5 bg-purple-600 text-white rounded-full text-xs flex items-center justify-center">
                {[scoreMin || scoreMax ? 1 : 0, dateFrom || dateTo ? 1 : 0].reduce((a, b) => a + b, 0)}
              </span>
            )}
          </button>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
              <X className="w-4 h-4" />
              Clear
            </button>
          )}
        </div>

        {/* Expanded filters */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Score Range (%)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  min={0}
                  max={100}
                  value={scoreMin}
                  onChange={(e) => setScoreMin(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
                />
                <span className="text-gray-400 text-sm">to</span>
                <input
                  type="number"
                  placeholder="Max"
                  min={0}
                  max={100}
                  value={scoreMax}
                  onChange={(e) => setScoreMax(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Completion Date</label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
                />
                <span className="text-gray-400 text-sm">to</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-gray-400" />
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="text-center py-16">
            <Users className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 font-medium">
              {sessions.length === 0 ? 'No candidates invited yet' : 'No results match your filters'}
            </p>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="mt-2 text-sm text-purple-600 hover:underline">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap">CID</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide">Candidate</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide">Email</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap">Score</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap">Duration</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap">Completed At</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap">Proctoring Risk</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedSessions.map((session) => {
                    const risk = getProctoringRisk(session);
                    return (
                      <tr key={session.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          {session.candidate_cid ? (
                            <span className="text-xs font-mono font-medium text-purple-700 bg-purple-50 px-2 py-1 rounded">
                              {session.candidate_cid}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-semibold text-xs flex-shrink-0">
                              {(session.candidate_name || 'U')[0].toUpperCase()}
                            </div>
                            <span className="font-medium text-gray-900 truncate max-w-[160px]">
                              {session.candidate_name || 'Unknown'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-gray-600 truncate max-w-[180px] block">
                            {session.candidate_email || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {getStatusIcon(session.status)}
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(session.status)}`}>
                              {getStatusLabel(session.status)}
                            </span>
                            {session.status === 'in_progress' && (
                              <span className="flex items-center gap-1 px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full">
                                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                LIVE
                              </span>
                            )}
                          </div>
                          {/* Mini skill coverage bar for live sessions */}
                          {session.status === 'in_progress' && session.skill_coverage && (() => {
                            const sc = session.skill_coverage;
                            const total = sc.covered.length + sc.medium_covered.length + sc.low_covered.length + sc.uncovered.length;
                            const coveredPct = total > 0 ? Math.round(((sc.covered.length + sc.medium_covered.length) / total) * 100) : 0;
                            return (
                              <div className="mt-1.5">
                                <div className="flex items-center gap-1 mb-0.5">
                                  <span className="text-[10px] text-gray-500">{sc.questions_asked}/{sc.total_questions} Q</span>
                                  <span className="text-[10px] text-green-600 font-medium ml-auto">{coveredPct}% covered</span>
                                </div>
                                <div className="flex h-1 rounded-full overflow-hidden bg-gray-200 w-28">
                                  <div className="bg-green-500" style={{ width: `${Math.round((sc.covered.length / (total || 1)) * 100)}%` }} />
                                  <div className="bg-yellow-400" style={{ width: `${Math.round((sc.medium_covered.length / (total || 1)) * 100)}%` }} />
                                  <div className="bg-orange-400" style={{ width: `${Math.round((sc.low_covered.length / (total || 1)) * 100)}%` }} />
                                </div>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {session.score != null ? (
                            <div className="flex items-center gap-2">
                              <div className="w-16 bg-gray-200 rounded-full h-1.5">
                                <div
                                  className={`h-1.5 rounded-full ${
                                    session.score >= 70 ? 'bg-green-500' :
                                    session.score >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                                  }`}
                                  style={{ width: `${Math.min(100, session.score)}%` }}
                                />
                              </div>
                              <span className="font-medium text-gray-900 text-xs">
                                {Math.round(session.score)}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                          {formatDuration(session)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                          {session.completed_at ? formatISTDate(session.completed_at) : '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {session.status === 'completed' ? (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${risk.badge}`}>
                              {risk.level}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            onClick={() => handleViewDetails(session)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            View Details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                <div className="text-sm text-gray-500">
                  Showing {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, filteredSessions.length)} of {filteredSessions.length}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-gray-700 font-medium px-2">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
