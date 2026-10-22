'use client';

import { SCORE_CELL_TEXT } from '@/lib/utils/score';
import { formatIST, formatISTDate } from '@/lib/utils/dateUtils';
import { ArrowLeft, MapPin, Calendar, Clock, Briefcase, CheckCircle2, FileText, Users, Edit2, Archive, Building2, GraduationCap, User, History, ChevronDown, ChevronUp, Monitor, Search, ChevronLeft, ChevronRight, CheckCircle, XCircle, AlertCircle, Mail, Phone, ClipboardList } from 'lucide-react';
import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { useRouter, useSearchParams } from 'next/navigation';
import { jdService, JDResponse, JDVersion, JDAssessmentResultsResponse, AssessmentResultItem } from '@/lib/services/jdService';
import { toast } from 'sonner';
import { useModulePermissions } from '@/lib/hooks/usePermissions';
import { useAuth } from '@/components/providers/AuthProvider';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

// Utility function to format employment type for display
// Converts "full_time" -> "Full Time", "part_time" -> "Part Time", etc.
const formatEmploymentType = (type: string | undefined): string => {
  if (!type) return '';
  return type
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

type TabType = 'overview' | 'scored-resumes' | 'assessment-results';


// Assessment Results Tab Component
function AssessmentResultsTab({ jdId }: { jdId: string }) {
  const [results, setResults] = useState<JDAssessmentResultsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'in_progress' | 'pending'>('all');
  const [passedFilter, setPassedFilter] = useState<'all' | 'passed' | 'failed'>('all');
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [goToPage, setGoToPage] = useState('1');

  useEffect(() => {
    fetchResults();
  }, [jdId, page, statusFilter, passedFilter]);

  useEffect(() => {
    setGoToPage(String(page));
  }, [page]);

  const fetchResults = async () => {
    setLoading(true);
    try {
      const params: {
        status_filter?: 'completed' | 'in_progress' | 'pending';
        passed?: boolean;
        search?: string;
        page: number;
        page_size: number;
      } = {
        page,
        page_size: pageSize,
      };

      if (statusFilter !== 'all') {
        params.status_filter = statusFilter;
      }
      if (passedFilter === 'passed') {
        params.passed = true;
      } else if (passedFilter === 'failed') {
        params.passed = false;
      }
      if (searchQuery) {
        params.search = searchQuery;
      }

      const data = await jdService.getAssessmentResults(jdId, params);
      setResults(data);
    } catch (error) {
      console.error('Failed to fetch assessment results:', error);
      toast.error('Failed to load assessment results');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setPage(1);
    fetchResults();
  };

  const formatDuration = (seconds: number | null): string => {
    if (seconds === null) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };


  const getStatusBadge = (status: AssessmentResultItem['status'], passed: boolean | null) => {
    if (status === 'completed') {
      if (passed === true) return <Badge variant="success"><CheckCircle className="w-3 h-3" />Passed</Badge>;
      if (passed === false) return <Badge variant="destructive"><XCircle className="w-3 h-3" />Failed</Badge>;
      return <Badge variant="info"><CheckCircle className="w-3 h-3" />Completed</Badge>;
    } else if (status === 'in_progress') {
      return <Badge variant="info"><AlertCircle className="w-3 h-3" />In Progress</Badge>;
    } else {
      return <Badge variant="warning"><Clock className="w-3 h-3" />Pending</Badge>;
    }
  };

  const getScoreColor = (score: number | null): string => {
    if (score === null) return 'text-gray-400';
    if (score >= 80) return 'text-success';
    if (score >= 60) return 'text-warning';
    return 'text-destructive';
  };

  if (loading && !results) {
    // Structure-matched skeleton for the Assessment Results tab: the 5 stat
    // cards, the filter bar, then the results table with this tab's own columns.
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
              <Skeleton className="h-7 w-12" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 flex-1 rounded-lg" />
            <Skeleton className="h-10 w-36 rounded-lg" />
            <Skeleton className="h-10 w-36 rounded-lg" />
            <Skeleton className="h-10 w-24 rounded-lg" />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="tf-table-shell hidden md:block">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Candidate', 'Assessment', 'Status', 'HR', 'Technical', 'Coding', 'Overall', 'Duration', 'Completed'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left"><Skeleton className="h-3 w-20" /></th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {Array.from({ length: 8 }).map((_, r) => (
                  <tr key={r}>
                    <td className="px-4 py-4">
                      <div className="space-y-1.5">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-3 w-36" />
                      </div>
                    </td>
                    <td className="px-4 py-4"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-4 py-4"><Skeleton className="h-5 w-16 rounded-full" /></td>
                    <td className="px-4 py-4 text-center"><Skeleton className="h-4 w-10 mx-auto" /></td>
                    <td className="px-4 py-4 text-center"><Skeleton className="h-4 w-10 mx-auto" /></td>
                    <td className="px-4 py-4 text-center"><Skeleton className="h-4 w-10 mx-auto" /></td>
                    <td className="px-4 py-4 text-center"><Skeleton className="h-4 w-10 mx-auto" /></td>
                    <td className="px-4 py-4"><Skeleton className="h-4 w-14" /></td>
                    <td className="px-4 py-4"><Skeleton className="h-4 w-24" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile skeleton — §10: cards on phones */}
          <div className="md:hidden divide-y divide-gray-200">
            {Array.from({ length: 6 }).map((_, r) => (
              <div key={r} className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-8 w-full rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!results || results.assessments_count === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Assessments Found</h3>
        <p className="text-gray-500">No assessments have been created for this job description yet.</p>
      </div>
    );
  }

  const totalPages = Math.ceil(results.total / pageSize);

  const commitGoToPage = () => {
    const target = Math.round(Number(goToPage));
    if (Number.isFinite(target) && target >= 1 && target <= totalPages) {
      setPage(target);
    } else {
      setGoToPage(String(page));
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-2xl font-bold text-gray-900">{results.assessments_count}</div>
          <div className="text-sm text-gray-500">Total Assessments</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-2xl font-bold text-blue-600">{results.completed_count}</div>
          <div className="text-sm text-gray-500">Completed</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-2xl font-bold text-success">{results.passed_count}</div>
          <div className="text-sm text-gray-500">Passed</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-2xl font-bold text-destructive">{results.failed_count}</div>
          <div className="text-sm text-gray-500">Failed</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-2xl font-bold text-purple-600">
            {results.average_score !== null ? `${results.average_score}%` : '-'}
          </div>
          <div className="text-sm text-gray-500">Avg Score</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by candidate name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as typeof statusFilter);
              setPage(1);
            }}
            className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Status</option>
            <option value="completed">Completed</option>
            <option value="in_progress">In Progress</option>
            <option value="pending">Pending</option>
          </select>

          {/* Passed Filter */}
          <select
            value={passedFilter}
            onChange={(e) => {
              setPassedFilter(e.target.value as typeof passedFilter);
              setPage(1);
            }}
            className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Results</option>
            <option value="passed">Passed</option>
            <option value="failed">Failed</option>
          </select>

          <Button
            variant="secondary"
            onClick={handleSearch}
            className="w-full sm:w-auto"
          >
            Search
          </Button>
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="tf-table-shell hidden md:block">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Candidate', 'Assessment', 'Status', 'HR', 'Technical', 'Coding', 'Overall', 'Duration', 'Completed'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left"><Skeleton className="h-3 w-20" /></th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {Array.from({ length: 8 }).map((_, r) => (
                  <tr key={r}>
                    <td className="px-4 py-4">
                      <div className="space-y-1.5">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-3 w-36" />
                      </div>
                    </td>
                    <td className="px-4 py-4"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-4 py-4"><Skeleton className="h-5 w-16 rounded-full" /></td>
                    <td className="px-4 py-4 text-center"><Skeleton className="h-4 w-10 mx-auto" /></td>
                    <td className="px-4 py-4 text-center"><Skeleton className="h-4 w-10 mx-auto" /></td>
                    <td className="px-4 py-4 text-center"><Skeleton className="h-4 w-10 mx-auto" /></td>
                    <td className="px-4 py-4 text-center"><Skeleton className="h-4 w-10 mx-auto" /></td>
                    <td className="px-4 py-4"><Skeleton className="h-4 w-14" /></td>
                    <td className="px-4 py-4"><Skeleton className="h-4 w-24" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : results.items.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Results Found</h3>
            <p className="text-gray-500">No assessment results match your filters.</p>
          </div>
        ) : (
          <>
            <div className="tf-table-shell hidden md:block">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Candidate
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Assessment
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      HR
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Technical
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Coding
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Overall
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Duration
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Completed
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {results.items.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-900">{item.candidate_name}</span>
                          <span className="text-sm text-gray-500 flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {item.candidate_email}
                          </span>
                          {item.candidate_phone && (
                            <span className="text-sm text-gray-500 flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {item.candidate_phone}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm text-gray-700">{item.assessment_title}</span>
                      </td>
                      <td className="px-4 py-4">
                        {getStatusBadge(item.status, item.passed)}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`${SCORE_CELL_TEXT} ${getScoreColor(item.hr_score)}`}>
                          {item.hr_score !== null ? `${item.hr_score}%` : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`${SCORE_CELL_TEXT} ${getScoreColor(item.technical_score)}`}>
                          {item.technical_score !== null ? `${item.technical_score}%` : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`${SCORE_CELL_TEXT} ${getScoreColor(item.coding_score)}`}>
                          {item.coding_score !== null ? `${item.coding_score}%` : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`${SCORE_CELL_TEXT} ${getScoreColor(item.overall_score)}`}>
                          {item.overall_score !== null ? `${item.overall_score}%` : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm text-gray-600">
                          {formatDuration(item.time_spent_seconds)}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm text-gray-600">
                          {formatIST(item.completed_at)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards — §10: tables become cards on phones */}
            <div className="md:hidden divide-y divide-gray-200">
              {results.items.map((item) => (
                <div key={item.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 text-sm truncate">{item.candidate_name}</div>
                      <div className="text-xs text-gray-500 flex items-center gap-1 min-w-0">
                        <Mail className="w-3 h-3 shrink-0" />
                        <span className="truncate">{item.candidate_email}</span>
                      </div>
                    </div>
                    <div className="shrink-0">{getStatusBadge(item.status, item.passed)}</div>
                  </div>
                  <div className="text-xs text-gray-600 truncate">{item.assessment_title}</div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {([['HR', item.hr_score], ['Tech', item.technical_score], ['Code', item.coding_score], ['Overall', item.overall_score]] as [string, number | null][]).map(([label, score]) => (
                      <div key={label} className="rounded-lg bg-gray-50 border border-gray-100 px-1.5 py-1 text-center">
                        <div className="text-2xs uppercase tracking-wide text-gray-400">{label}</div>
                        <div className={`text-sm font-semibold ${getScoreColor(score)}`}>{score !== null ? `${score}%` : '-'}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{formatDuration(item.time_spent_seconds)}</span>
                    <span>{formatIST(item.completed_at)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
                <div className="text-sm text-gray-500">
                  Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, results.total)} of {results.total} results
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">Go to</span>
                    <input
                      type="number"
                      min={1}
                      max={totalPages}
                      value={goToPage}
                      onChange={(e) => setGoToPage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.currentTarget.blur();
                          commitGoToPage();
                        }
                      }}
                      onBlur={commitGoToPage}
                      aria-label="Go to page"
                      className="w-14 h-8 sm:h-9 px-2 text-sm text-center border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white text-gray-900"
                    />
                  </div>
                  <button
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-200 disabled:hover:text-gray-700 transition-colors"
                    aria-label="Previous page" title="Previous page"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>
                  <span className="text-sm font-medium text-gray-700 px-1 whitespace-nowrap">
                    <span className="text-brand-blue font-semibold">{page}</span> / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={page === totalPages}
                    className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-200 disabled:hover:text-gray-700 transition-colors"
                    aria-label="Next page" title="Next page"
                  >
                    <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
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

// Scored Resumes Tab Component
function ScoredResumesTab({ jdId }: { jdId: string }) {
  const [resumes, setResumes] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [goToPage, setGoToPage] = useState('1');

  useEffect(() => {
    fetchResumes();
  }, [jdId, page]);

  useEffect(() => {
    setGoToPage(String(page));
  }, [page]);

  const fetchResumes = async () => {
    setLoading(true);
    try {
      const data = await jdService.getScoredResumes(jdId, {
        search: searchQuery || undefined,
        page,
        page_size: pageSize,
        sort_by: 'latest',  // Sort by latest scored first
      });
      setResumes(data);
    } catch (error) {
      console.error('Failed to fetch scored resumes:', error);
      toast.error('Failed to load scored resumes');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setPage(1);
    fetchResumes();
  };

  const getMatchBadge = (status: string) => {
    const configs: Record<string, { bg: string; text: string }> = {
      good_match: { bg: 'bg-success-subtle', text: 'text-success' },
      partial_match: { bg: 'bg-brand-orange/10', text: 'text-brand-orange-deep' },
      no_match: { bg: 'bg-destructive-subtle', text: 'text-destructive' },
    };
    const config = configs[status] || { bg: 'bg-gray-100', text: 'text-gray-600' };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  if (loading && !resumes) {
    // Structure-matched skeleton for the Scored Resumes tab: the search bar,
    // then the results table with this tab's own columns.
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 flex-1 rounded-lg" />
            <Skeleton className="h-10 w-24 rounded-lg" />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="tf-table-shell hidden md:block">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Candidate', 'Match Status', 'Score', 'Scored At'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left"><Skeleton className="h-3 w-20" /></th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {Array.from({ length: 8 }).map((_, r) => (
                  <tr key={r}>
                    <td className="px-4 py-4"><Skeleton className="h-4 w-32" /></td>
                    <td className="px-4 py-4"><Skeleton className="h-5 w-20 rounded-full" /></td>
                    <td className="px-4 py-4 text-center"><Skeleton className="h-4 w-10 mx-auto" /></td>
                    <td className="px-4 py-4"><Skeleton className="h-4 w-24" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile skeleton — §10: cards on phones */}
          <div className="md:hidden divide-y divide-gray-200">
            {Array.from({ length: 6 }).map((_, r) => (
              <div key={r} className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-8 w-full rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!resumes || resumes.total === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Scored Resumes</h3>
        <p className="text-gray-500">No resumes have been scored against this job description yet.</p>
      </div>
    );
  }

  const totalPages = Math.ceil(resumes.total / pageSize);

  const commitGoToPage = () => {
    const target = Math.round(Number(goToPage));
    if (Number.isFinite(target) && target >= 1 && target <= totalPages) {
      setPage(target);
    } else {
      setGoToPage(String(page));
    }
  };

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by candidate name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <Button
            variant="secondary"
            onClick={handleSearch}
          >
            Search
          </Button>
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="tf-table-shell hidden md:block">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Candidate', 'Match Status', 'Score', 'Scored At'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left"><Skeleton className="h-3 w-20" /></th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {Array.from({ length: 8 }).map((_, r) => (
                  <tr key={r}>
                    <td className="px-4 py-4"><Skeleton className="h-4 w-32" /></td>
                    <td className="px-4 py-4"><Skeleton className="h-5 w-20 rounded-full" /></td>
                    <td className="px-4 py-4 text-center"><Skeleton className="h-4 w-10 mx-auto" /></td>
                    <td className="px-4 py-4"><Skeleton className="h-4 w-24" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : resumes.items.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Results Found</h3>
            <p className="text-gray-500">No scored resumes match your search.</p>
          </div>
        ) : (
          <>
            <div className="tf-table-shell hidden md:block">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Candidate
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Match Status
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Score
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Scored At
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {resumes.items.map((item: any) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <span className="font-medium text-gray-900">{item.candidate_name || 'Unknown'}</span>
                      </td>
                      <td className="px-4 py-4">
                        {getMatchBadge(item.match_status)}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`${SCORE_CELL_TEXT} text-gray-900`}>
                          {item.overall_score !== null ? `${item.overall_score}%` : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm text-gray-600">
                          {item.scored_at ? formatISTDate(item.scored_at) : '-'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards — §10: tables become cards on phones */}
            <div className="md:hidden divide-y divide-gray-200">
              {resumes.items.map((item: any) => (
                <div key={item.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 text-sm truncate">{item.candidate_name || 'Unknown'}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{item.scored_at ? formatISTDate(item.scored_at) : '-'}</div>
                    <div className="mt-1">{getMatchBadge(item.match_status)}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-lg font-semibold text-gray-900">{item.overall_score !== null ? `${item.overall_score}%` : '-'}</div>
                    <div className="text-2xs uppercase tracking-wide text-gray-400">Score</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
                <div className="text-sm text-gray-500">
                  Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, resumes.total)} of {resumes.total} results
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">Go to</span>
                    <input
                      type="number"
                      min={1}
                      max={totalPages}
                      value={goToPage}
                      onChange={(e) => setGoToPage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.currentTarget.blur();
                          commitGoToPage();
                        }
                      }}
                      onBlur={commitGoToPage}
                      aria-label="Go to page"
                      className="w-14 h-8 sm:h-9 px-2 text-sm text-center border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white text-gray-900"
                    />
                  </div>
                  <button
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-200 disabled:hover:text-gray-700 transition-colors"
                    aria-label="Previous page" title="Previous page"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>
                  <span className="text-sm font-medium text-gray-700 px-1 whitespace-nowrap">
                    <span className="text-brand-blue font-semibold">{page}</span> / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={page === totalPages}
                    className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-200 disabled:hover:text-gray-700 transition-colors"
                    aria-label="Next page" title="Next page"
                  >
                    <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
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

export default function JDDetailsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jdId = searchParams.get('id');
  const tabParam = searchParams.get('tab') as TabType | null;
  const jdPerms = useModulePermissions('jd');
  const { isTenantAdmin, user } = useAuth();
  const canRunScoring = isTenantAdmin || (user?.permissions?.canRunScoring ?? false);

  const [jd, setJd] = useState<JDResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [versions, setVersions] = useState<JDVersion[]>([]);
  const [currentVersion, setCurrentVersion] = useState<number>(0);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>(tabParam || 'overview');

  useEffect(() => {
    if (jdId) {
      fetchJD();
      fetchVersions();
    }
  }, [jdId]);

  // Update active tab when URL param changes
  useEffect(() => {
    if (tabParam && ['overview', 'scored-resumes', 'assessment-results'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const fetchJD = async () => {
    if (!jdId) return;
    setLoading(true);
    try {
      const data = await jdService.get(jdId);
      setJd(data);
    } catch (error) {
      console.error('Failed to fetch JD:', error);
      toast.error('Failed to load job description');
    } finally {
      setLoading(false);
    }
  };

  const fetchVersions = async () => {
    if (!jdId) return;
    try {
      const history = await jdService.getVersionHistory(jdId);
      setVersions(history.versions || []);
      setCurrentVersion(history.current_version || 0);
    } catch (error) {
      console.error('Failed to fetch version history:', error);
      // Don't show error toast - versions might not exist yet
    }
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    // Update URL without full reload
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('tab', tab);
    window.history.pushState({}, '', newUrl.toString());
  };

  const handlePublish = async () => {
    if (!jd) return;
    try {
      await jdService.publish(jd.id);
      toast.success('Job description published!');
      fetchJD();
    } catch (error) {
      toast.error('Failed to publish');
    }
  };

  const handleArchive = async () => {
    if (!jd) return;
    try {
      await jdService.archive(jd.id);
      toast.success('Job description archived');
      fetchJD();
    } catch (error) {
      toast.error('Failed to archive');
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'success' | 'info' | 'destructive' | 'muted'> = {
      draft: 'info', published: 'success', archived: 'muted', disabled: 'destructive',
    };
    return (
      <Badge variant={variants[status] || 'info'} className="px-3 py-1.5 text-sm">
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };


  if (loading) {
    // Structure-matched skeleton — mirrors this page's real overview layout:
    // the card wrapper + breadcrumb, header (back nav, job-id badge, title,
    // status, meta row, action buttons), the tabs bar, and the grid-cols-3
    // body (Description card + the sidebar's Statistics/Job Details/Metadata).
    return (
      <main className="flex-1 overflow-x-clip bg-slate-50 dark:bg-slate-950">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="p-4 md:p-8 w-full min-h-[calc(100dvh-7rem)] bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
            {/* Breadcrumb */}
            <div className="mb-4 md:mb-6 flex items-center gap-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-3" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-3" />
              <Skeleton className="h-3 w-20" />
            </div>

            {/* Header */}
            <div className="mb-6">
              <Skeleton className="h-4 w-44 mb-4" />
              <div className="flex items-start justify-between">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-8 w-20 rounded-lg" />
                    <Skeleton className="h-7 w-64" />
                    <Skeleton className="h-7 w-24 rounded-full" />
                  </div>
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-28 rounded-lg" />
                  <Skeleton className="h-10 w-20 rounded-lg" />
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="mb-6 border-b border-gray-200 flex gap-6 pb-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-28" />
              ))}
            </div>

            {/* Overview body */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
              {/* Description */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
                  <Skeleton className="h-6 w-40 mb-2" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </div>

              {/* Sidebar — Statistics, Job Details, Metadata */}
              <div className="space-y-6">
                {Array.from({ length: 3 }).map((_, card) => (
                  <div key={card} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
                    <Skeleton className="h-6 w-28 mb-2" />
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-4 w-12" />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!jd) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50">
        <FileText className="w-16 h-16 text-gray-300 mb-4" />
        <h2 className="text-xl font-medium text-gray-900 mb-2">Job Description Not Found</h2>
        <p className="text-gray-500 mb-6">The job description you're looking for doesn't exist.</p>
        <Button
          variant="primary"
          onClick={() => router.push('/recruitment/jd-list')}
        >
          Back to Job Descriptions
        </Button>
      </div>
    );
  }

  return (
    <main className="flex-1 overflow-x-clip bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full min-h-[calc(100dvh-7rem)] bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
          <PageBreadcrumb
            className="mb-4 md:mb-6"
            items={[
              { label: 'Dashboard', href: '/dashboard' },
              { label: 'Job Descriptions', href: '/recruitment/jd-list' },
              { label: 'JD Details' },
            ]}
          />
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => router.push('/recruitment/jd-list')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Job Descriptions
          </button>

          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3 mb-3">
                {jd.job_id && (
                  <span className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm font-semibold border border-blue-200">
                    {jd.job_id}
                  </span>
                )}
                <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">{jd.title}</h1>
                {getStatusBadge(jd.status)}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                {jd.department && (
                  <span className="flex items-center gap-1">
                    <Building2 className="w-4 h-4" />
                    {jd.department}
                  </span>
                )}
                {jd.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    {jd.location}
                  </span>
                )}
                {jd.employment_type && (
                  <span className="flex items-center gap-1">
                    <Briefcase className="w-4 h-4" />
                    <span>{formatEmploymentType(jd.employment_type)}</span>
                  </span>
                )}
                {jd.remote_type && (
                  <span className="flex items-center gap-1">
                    <Monitor className="w-4 h-4" />
                    <span>{formatEmploymentType(jd.remote_type)}</span>
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  Created {formatIST(jd.created_at)}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {jd.status === 'draft' && (
                <Button
                  variant="primary"
                  onClick={handlePublish}
                  icon={<CheckCircle2 className="w-4 h-4" />}
                >
                  Publish
                </Button>
              )}
              {jd.status === 'published' && canRunScoring && (
                <Button
                  variant="primary"
                  onClick={() => router.push(`/recruitment/resume-scoring?jd_id=${jd.id}&mode=new`)}
                  icon={<ClipboardList className="w-4 h-4" />}
                >
                  Score Resumes
                </Button>
              )}
              {jdPerms.canUpdate && (
                <Button
                  variant="secondary"
                  onClick={() => router.push(`/recruitment/jd-creation?id=${jd.id}`)}
                  icon={<Edit2 className="w-4 h-4" />}
                >
                  Edit
                </Button>
              )}
              {jdPerms.canArchive && jd.status !== 'archived' && (
                <Button
                  variant="secondary"
                  onClick={handleArchive}
                  icon={<Archive className="w-4 h-4" />}
                >
                  Archive
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="-mb-px flex gap-4 sm:gap-6 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => handleTabChange('overview')}
              className={`pb-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'overview'
                  ? 'border-gray-800 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => handleTabChange('scored-resumes')}
              className={`pb-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ${
                activeTab === 'scored-resumes'
                  ? 'border-gray-800 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Scored Resumes
              {jd.scored_resumes_count > 0 && (
                <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">
                  {jd.scored_resumes_count}
                </span>
              )}
            </button>
            <button
              onClick={() => handleTabChange('assessment-results')}
              className={`pb-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ${
                activeTab === 'assessment-results'
                  ? 'border-gray-800 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Assessment Results
              {jd.assessments_count > 0 && (
                <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">
                  {jd.assessments_count}
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Description */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Job Description</h2>
                <div className="markdown-content text-gray-700 text-sm leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                    {(jd.description || '')}
                  </ReactMarkdown>
                </div>
              </div>

              {/* Assessment Guidance */}
              {jd.assessment_guidance && (
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Assessment Guidance</h2>
                  <p className="text-gray-700">{jd.assessment_guidance}</p>
                </div>
              )}

              {/* Internal Comments */}
              {jd.internal_comments && (
                <div className="bg-warning-subtle rounded-xl border border-warning-line p-6">
                  <h2 className="text-lg font-semibold text-warning-strong mb-4">Internal Comments</h2>
                  <p className="text-warning">{jd.internal_comments}</p>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Stats */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Statistics</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-gray-600">
                      <Users className="w-4 h-4" />
                      Applicants
                    </span>
                    <span className="font-semibold text-gray-900">{jd.applicants_count || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-gray-600">
                      <FileText className="w-4 h-4" />
                      Scored Resumes
                    </span>
                    <span className="font-semibold text-gray-900">{jd.scored_resumes_count || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-gray-600">
                      <CheckCircle2 className="w-4 h-4" />
                      Assessments
                    </span>
                    <span className="font-semibold text-gray-900">{jd.assessments_count || 0}</span>
                  </div>
                </div>
              </div>

              {/* Job Details */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Job Details</h2>
                <div className="space-y-4">
                  {jd.employment_type && (
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-gray-600">
                        <Briefcase className="w-4 h-4" />
                        Employment Type
                      </span>
                      <span className="text-gray-900">{formatEmploymentType(jd.employment_type)}</span>
                    </div>
                  )}
                  {jd.remote_type && (
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-gray-600">
                        <Monitor className="w-4 h-4" />
                        Work Mode
                      </span>
                      <span className="text-gray-900">{formatEmploymentType(jd.remote_type)}</span>
                    </div>
                  )}
                  {(jd.experience_min || jd.experience_max) && (
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-gray-600">
                        <Clock className="w-4 h-4" />
                        Experience
                      </span>
                      <span className="text-gray-900">
                        {jd.experience_min || 0} - {jd.experience_max || '10+'} years
                      </span>
                    </div>
                  )}
                  {jd.education_requirements && (
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-gray-600">
                        <GraduationCap className="w-4 h-4" />
                        Education
                      </span>
                      <span className="text-gray-900">
                        {typeof jd.education_requirements === 'object'
                          ? jd.education_requirements.degree || 'Any'
                          : jd.education_requirements}
                      </span>
                    </div>
                  )}
                  {jd.industry_type && (
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-gray-600">
                        <Building2 className="w-4 h-4" />
                        Industry
                      </span>
                      <span className="text-gray-900">{jd.industry_type}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Metadata */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Metadata</h2>
                <div className="space-y-4 text-sm">
                  <div>
                    <span className="text-gray-500 block mb-1">Posted By</span>
                    <span className="text-gray-900 flex items-center gap-2">
                      <User className="w-4 h-4" />
                      <span className="font-medium">{jd.created_by_name || 'Unknown'}</span>
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block mb-1">Created On</span>
                    <div className="text-gray-900 space-y-1">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <span>{formatIST(jd.created_at)}</span>
                      </div>
                    </div>
                  </div>
                  {jd.published_at && (
                    <div>
                      <span className="text-gray-500 block mb-1">Published On</span>
                      <div className="text-gray-900 space-y-1">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span>{formatIST(jd.published_at)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="flex justify-between pt-2 border-t border-gray-100">
                    <span className="text-gray-500">Method</span>
                    <span className="text-gray-900 capitalize">{jd.creation_method?.replace('_', ' ') || 'Manual'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Version</span>
                    <span className="text-gray-900">{currentVersion > 0 ? currentVersion : 1}</span>
                  </div>
                </div>
              </div>

              {/* Version History */}
              {versions.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <button
                    onClick={() => setShowVersionHistory(!showVersionHistory)}
                    className="w-full flex items-center justify-between text-lg font-semibold text-gray-900"
                  >
                    <span className="flex items-center gap-2">
                      <History className="w-5 h-5" />
                      Version History ({versions.length})
                    </span>
                    {showVersionHistory ? (
                      <ChevronUp className="w-5 h-5 text-gray-500" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-500" />
                    )}
                  </button>

                  {showVersionHistory && (
                    <div className="mt-4 space-y-3">
                      {versions.map((version) => (
                        <div
                          key={version.id}
                          className="p-3 bg-gray-50 rounded-lg border border-gray-100"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-gray-900">
                              Version {version.version_number}
                              {version.version_number === currentVersion && (
                                <span className="ml-2 text-xs bg-success-subtle text-success px-2 py-0.5 rounded-full">
                                  Current
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 space-y-1">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {formatIST(version.published_at)}
                            </div>
                            <div className="text-gray-600 mt-1">
                              {version.title}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'scored-resumes' && jdId && (
          <ScoredResumesTab jdId={jdId} />
        )}

        {activeTab === 'assessment-results' && jdId && (
          <AssessmentResultsTab jdId={jdId} />
        )}
        </div>
      </div>
    </main>
  );
}
