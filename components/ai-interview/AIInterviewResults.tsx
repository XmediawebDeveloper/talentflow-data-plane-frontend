'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, Filter, ChevronLeft, ChevronRight, Eye, Loader2,
  Users, CheckCircle, Clock, Mail, XCircle, AlertTriangle, CalendarDays,
  X, BarChart3, Ban,
} from 'lucide-react';
import { toast } from 'sonner';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import type { AIInterviewResponse, AIInterviewInvitationListResponse } from '@/lib/services/aiInterviewService';
import { formatISTDate, formatIST, parseIST } from '@/lib/utils/dateUtils';
import PageBreadcrumb from '@/components/PageBreadcrumb';

interface AIInterviewResultsProps {
  configId: string;
  configTitle?: string;
  jdTitle?: string;
  onBack: () => void;
  /** When true, render only the results content (stats + filters + table),
   *  without the page <main>/breadcrumb/back-button chrome. Used when the
   *  results view is embedded as a tab inside the interview details page. */
  embedded?: boolean;
  /** When provided (embedded case), clicking a candidate opens their details
   *  inline via this callback (passing the session id and the ordered list of
   *  currently-visible session ids for Prev/Next) instead of navigating to the
   *  standalone results-details route. Keeps the breadcrumb anchored to the
   *  interview details page the user came from. */
  onViewCandidate?: (sessionId: string, navIds: string[]) => void;
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'invited', label: 'Invited' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'terminated', label: 'Terminated' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
];

function getStatusBadge(status: string) {
  switch (status) {
    case 'completed': return 'bg-green-100 text-green-700 ring-1 ring-green-200';
    case 'in_progress': return 'bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20';
    case 'invited': return 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20';
    case 'expired': return 'bg-gray-100 text-gray-600 ring-1 ring-gray-200';
    case 'terminated': return 'bg-red-100 text-red-700 ring-1 ring-red-200';
    case 'cancelled': return 'bg-red-100 text-red-600 ring-1 ring-red-200';
    default: return 'bg-gray-100 text-gray-600 ring-1 ring-gray-200';
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'completed': return 'Completed';
    case 'in_progress': return 'In Progress';
    case 'invited': return 'Invited';
    case 'expired': return 'Expired';
    case 'terminated': return 'Terminated';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'completed': return <CheckCircle className="w-4 h-4 text-green-500" />;
    case 'in_progress': return <Clock className="w-4 h-4 text-brand-orange-deep" />;
    case 'invited': return <Mail className="w-4 h-4 text-brand-blue" />;
    case 'terminated': return <Ban className="w-4 h-4 text-red-600" />;
    case 'cancelled': return <XCircle className="w-4 h-4 text-red-500" />;
    case 'expired': return <XCircle className="w-4 h-4 text-gray-400" />;
    default: return <Mail className="w-4 h-4 text-gray-400" />;
  }
}

function getProctoringRisk(session: AIInterviewResponse): { level: string; badge: string } {
  // Prefer server-computed risk_level (persisted at completion time, AIU-82)
  const stored = session.risk_level;
  if (stored) {
    if (stored === 'high')   return { level: 'High',   badge: 'bg-red-100 text-red-700 ring-1 ring-red-200' };
    if (stored === 'medium') return { level: 'Medium', badge: 'bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20' };
    if (stored === 'low')    return { level: 'Low',    badge: 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20' };
    return { level: 'None', badge: 'bg-green-100 text-green-700 ring-1 ring-green-200' };
  }
  // Fallback: heuristic from raw violations (pre-AIU-82 sessions or incomplete data)
  const violations = session.proctoring_violations || [];
  const severe = violations.filter((v) => v.severity === 'high' || v.severity === 'critical').length;
  const medium = violations.filter((v) => v.severity === 'medium').length;
  if (severe >= 3 || (severe >= 1 && medium >= 2)) return { level: 'High',   badge: 'bg-red-100 text-red-700 ring-1 ring-red-200' };
  if (severe >= 1 || medium >= 2)                  return { level: 'Medium', badge: 'bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20' };
  if (violations.length > 0)                       return { level: 'Low',    badge: 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20' };
  return { level: 'None', badge: 'bg-green-100 text-green-700 ring-1 ring-green-200' };
}

function formatDuration(session: AIInterviewResponse): string {
  if (!session.started_at || !session.completed_at) return '—';
  // Parse with parseIST so the duration uses the SAME absolute instants as the
  // Started At / Completed At columns. Raw `new Date()` treats a tz-less backend
  // string as browser-local, which desyncs the diff from the displayed times.
  const start = parseIST(session.started_at).getTime();
  const end = parseIST(session.completed_at).getTime();
  const diffMs = end - start;
  if (diffMs <= 0) return '—';
  const mins = Math.floor(diffMs / 60000);
  const secs = Math.floor((diffMs % 60000) / 1000);
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

export default function AIInterviewResults({ configId, configTitle, jdTitle, embedded = false, onViewCandidate }: AIInterviewResultsProps) {
  const router = useRouter();
  const [sessions, setSessions] = useState<AIInterviewResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalSessions, setTotalSessions] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [summary, setSummary] = useState({
    completed: 0,
    inProgress: 0,
    avgScore: null as number | null,
  });

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

  const requestParams = useMemo(() => ({
    search: searchQuery || undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    score_min: scoreMin !== '' ? parseFloat(scoreMin) : undefined,
    score_max: scoreMax !== '' ? parseFloat(scoreMax) : undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    page: currentPage,
    page_size: PAGE_SIZE,
    compact: true,
  }), [searchQuery, statusFilter, scoreMin, scoreMax, dateFrom, dateTo, currentPage]);

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const result: AIInterviewInvitationListResponse = await aiInterviewService.getConfigInvitations(configId, requestParams);
      setSessions(result.items);
      setTotalSessions(result.total);
      setTotalPages(Math.max(1, result.total_pages || 1));
      setSummary({
        completed: result.completed || 0,
        inProgress: result.in_progress || 0,
        avgScore: result.average_score != null ? Math.round(result.average_score) : null,
      });
    } catch (error: any) {
      toast.error(error.message || 'Failed to load candidate sessions');
    } finally {
      setIsLoading(false);
    }
  }, [configId, requestParams]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Auto-refresh every 5s while any session is in_progress (live monitoring)
  useEffect(() => {
    const hasLive = sessions.some((s) => s.status === 'in_progress');
    if (!hasLive) return;
    const id = setInterval(() => {
      aiInterviewService.getConfigInvitations(configId, requestParams)
        .then((r) => {
          setSessions(r.items);
          setTotalSessions(r.total);
          setTotalPages(Math.max(1, r.total_pages || 1));
          setSummary({
            completed: r.completed || 0,
            inProgress: r.in_progress || 0,
            avgScore: r.average_score != null ? Math.round(r.average_score) : null,
          });
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, [sessions, configId, requestParams]);

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, scoreMin, scoreMax, dateFrom, dateTo]);

  const paginatedSessions = sessions;

  const hasActiveFilters = statusFilter !== 'all' || scoreMin || scoreMax || dateFrom || dateTo;

  const clearFilters = () => {
    setStatusFilter('all');
    setScoreMin('');
    setScoreMax('');
    setDateFrom('');
    setDateTo('');
  };

  const handleViewDetails = (session: AIInterviewResponse) => {
    // Embedded (Results tab inside the interview details page): open the
    // candidate inline so the breadcrumb stays anchored to that page instead
    // of jumping to the standalone results-details route.
    if (onViewCandidate) {
      onViewCandidate(session.id, paginatedSessions.map((s) => s.id));
      return;
    }
    // Persist the currently-visible session order so the details view can offer
    // Previous/Next navigation between candidates (mirrors AssessmentResults).
    try {
      const navList = paginatedSessions.map((s) => ({ id: s.id }));
      sessionStorage.setItem('aiInterviewResultNavList', JSON.stringify(navList));
    } catch { /* ignore storage failures */ }
    router.push(`/recruitment/ai-interviews/${configId}/results/details?session_id=${session.id}`);
  };

  const body = (
    <>
      {/* Header — hidden when embedded as a tab (the details page already
          shows the interview title + breadcrumb + back navigation).
          The standalone page relies on the breadcrumb's "AI Interviews" link
          for back navigation, so no separate Back button is rendered. */}
      {!embedded && (
        <div className="mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{configTitle || 'AI Interview'}</h1>
              {jdTitle && <p className="text-sm text-gray-500 mt-1">{jdTitle}</p>}
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
              <Users className="w-4 h-4 text-brand-blue" />
            </div>
            <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total Invited</span>
          </div>
          <div className="text-2xl font-bold text-gray-900 tracking-tight">{totalSessions}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-green-100 to-green-50 ring-1 ring-green-200 flex items-center justify-center">
              <CheckCircle className="w-4 h-4 text-green-600" />
            </div>
            <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Completed</span>
          </div>
          <div className="text-2xl font-bold text-gray-900 tracking-tight">{summary.completed}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-9 h-9 rounded-lg bg-brand-orange/10 ring-1 ring-brand-orange/20 flex items-center justify-center">
              <Clock className="w-4 h-4 text-brand-orange-deep" />
            </div>
            <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">In Progress</span>
          </div>
          <div className="text-2xl font-bold text-gray-900 tracking-tight">{summary.inProgress}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-9 h-9 rounded-lg bg-brand-cyan/10 ring-1 ring-brand-cyan/20 flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-brand-cyan" />
            </div>
            <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Avg Score</span>
          </div>
          <div className="text-2xl font-bold text-gray-900 tracking-tight">
            {summary.avgScore !== null ? `${summary.avgScore}%` : '—'}
          </div>
        </div>
      </div>

      {/* Search + Filter bar */}
      <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-blue" />
            <input
              type="text"
              placeholder="Search by name, email, or CID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-2 px-3 py-2 text-sm border rounded-lg transition-colors ${
              hasActiveFilters
                ? 'border-brand-blue/30 bg-brand-blue/5 text-brand-blue'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
            {hasActiveFilters && (
              <span className="w-5 h-5 bg-brand-blue text-white rounded-full text-xs flex items-center justify-center shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                {[scoreMin || scoreMax ? 1 : 0, dateFrom || dateTo ? 1 : 0].reduce((a, b) => a + b, 0)}
              </span>
            )}
          </button>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1 text-sm text-gray-500 hover:text-brand-blue transition-colors">
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
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                />
                <span className="text-gray-400 text-sm">to</span>
                <input
                  type="number"
                  placeholder="Max"
                  min={0}
                  max={100}
                  value={scoreMax}
                  onChange={(e) => setScoreMax(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
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
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                />
                <span className="text-gray-400 text-sm">to</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-brand-blue" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center mx-auto mb-4">
              <Users className="w-10 h-10 text-brand-blue" />
            </div>
            <p className="text-gray-700 font-medium">
              {totalSessions === 0 && !hasActiveFilters ? 'No candidates invited yet' : 'No results match your filters'}
            </p>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10 rounded-lg transition-colors">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap">CID</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide">Candidate</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide">Email</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap">Score</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap">Duration</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap">Started At</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap">Completed At</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap">Proctoring Risk</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedSessions.map((session) => {
                    const risk = getProctoringRisk(session);
                    return (
                      <tr
                        key={session.id}
                        onClick={() => handleViewDetails(session)}
                        className="hover:bg-brand-blue/5 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          {session.candidate_cid ? (
                            <span className="text-xs font-mono font-medium text-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue/20 px-2 py-1 rounded">
                              {session.candidate_cid}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/20 flex items-center justify-center text-brand-blue font-semibold text-xs flex-shrink-0">
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
                                    session.score >= 50 ? 'bg-brand-orange' : 'bg-red-500'
                                  }`}
                                  style={{ width: `${Math.min(100, session.score)}%` }}
                                />
                              </div>
                              <span className={`font-medium text-xs ${
                                session.score >= 70 ? 'text-green-600' :
                                session.score >= 50 ? 'text-brand-orange-deep' : 'text-red-600'
                              }`}>
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
                          {session.started_at ? formatIST(session.started_at) : '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                          {session.completed_at ? formatIST(session.completed_at) : '—'}
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
                            onClick={(e) => { e.stopPropagation(); handleViewDetails(session); }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-blue bg-brand-blue/5 hover:bg-brand-blue/10 ring-1 ring-brand-blue/20 rounded-lg transition-colors"
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
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-slate-50">
                <div className="text-sm text-gray-500">
                  Showing {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, totalSessions)} of {totalSessions}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-brand-blue font-semibold px-2 tabular-nums">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        </div>
    </>
  );

  if (embedded) return body;

  return (
    <main className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full min-h-[calc(100vh-7rem)] bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
          <PageBreadcrumb
            className="mb-4 md:mb-6"
            items={[
              { label: 'Dashboard', href: '/dashboard' },
              { label: 'AI Interviews', href: '/recruitment/ai-interviews' },
              { label: 'Results' },
            ]}
          />
          {body}
        </div>
      </div>
    </main>
  );
}
