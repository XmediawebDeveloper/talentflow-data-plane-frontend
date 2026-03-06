'use client';

import { formatIST, formatISTDate } from '@/lib/utils/dateUtils';
import { ArrowLeft, MapPin, Calendar, Clock, DollarSign, Briefcase, CheckCircle2, FileText, Users, Edit2, Archive, Loader2, Building2, GraduationCap, User, History, ChevronDown, ChevronUp, Monitor, Search, ChevronLeft, ChevronRight, CheckCircle, XCircle, AlertCircle, Mail, Phone, Target } from 'lucide-react';
import { useState, useEffect, ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { jdService, JDResponse, JDVersion, JDAssessmentResultsResponse, AssessmentResultItem } from '@/lib/services/jdService';
import { toast } from 'sonner';
import { useModulePermissions } from '@/lib/hooks/usePermissions';

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

// Parse and render JD description with proper formatting
const renderJDDescription = (description: string): ReactNode => {
  if (!description) return null;

  // Split by lines
  const lines = description.split('\n');
  const elements: ReactNode[] = [];
  let currentList: string[] = [];
  let listKey = 0;
  let skipSkillsSection = false;

  const flushList = () => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`list-${listKey++}`} className="space-y-2 mb-4 ml-1">
          {currentList.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-gray-700">
              <span className="text-gray-400 mt-1">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
      currentList = [];
    }
  };

  lines.forEach((line, index) => {
    const trimmedLine = line.trim();

    // Skip empty lines but flush any pending list
    if (!trimmedLine) {
      flushList();
      skipSkillsSection = false;
      return;
    }

    // Skip Must-Have Skills and Nice-to-Have Skills sections (they're shown separately)
    if (/^(Must-Have Skills|Nice-to-Have Skills)$/i.test(trimmedLine)) {
      flushList();
      skipSkillsSection = true;
      return;
    }

    // Skip content in skills sections
    if (skipSkillsSection) {
      return;
    }

    // H2 Headers (## or lines ending with certain keywords)
    if (trimmedLine.startsWith('## ') ||
        /^(About the Role|Key Responsibilities|Requirements|What We Offer|Job Summary|Qualifications|Benefits|About Us|How to Apply)$/i.test(trimmedLine)) {
      flushList();
      const headerText = trimmedLine.replace(/^##\s*/, '');
      elements.push(
        <div key={`h3-${index}`} className="mt-6 mb-3 first:mt-0">
          <h3 className="text-base font-semibold text-gray-900">{headerText}</h3>
          <div className="h-px bg-gray-200 mt-2"></div>
        </div>
      );
      return;
    }

    // H3 Headers (### or Must Have / Nice to Have)
    if (trimmedLine.startsWith('### ') ||
        /^(Must Have|Nice to Have)$/i.test(trimmedLine)) {
      flushList();
      const headerText = trimmedLine.replace(/^###\s*/, '');
      elements.push(
        <h4 key={`h4-${index}`} className="text-sm font-medium text-gray-800 mt-4 mb-2">
          {headerText}
        </h4>
      );
      return;
    }

    // Bullet points
    if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ') || trimmedLine.startsWith('• ')) {
      currentList.push(trimmedLine.replace(/^[-*•]\s*/, ''));
      return;
    }

    // Regular paragraph
    flushList();
    elements.push(
      <p key={`p-${index}`} className="text-gray-700 mb-3 leading-relaxed">
        {trimmedLine}
      </p>
    );
  });

  // Flush any remaining list
  flushList();

  return <div className="space-y-1">{elements}</div>;
};

// Assessment Results Tab Component
function AssessmentResultsTab({ jdId }: { jdId: string }) {
  const [results, setResults] = useState<JDAssessmentResultsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'in_progress' | 'pending'>('all');
  const [passedFilter, setPassedFilter] = useState<'all' | 'passed' | 'failed'>('all');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    fetchResults();
  }, [jdId, page, statusFilter, passedFilter]);

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
      if (passed === true) {
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
            <CheckCircle className="w-3 h-3" />
            Passed
          </span>
        );
      } else if (passed === false) {
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
            <XCircle className="w-3 h-3" />
            Failed
          </span>
        );
      } else {
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
            <CheckCircle className="w-3 h-3" />
            Completed
          </span>
        );
      }
    } else if (status === 'in_progress') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
          <AlertCircle className="w-3 h-3" />
          In Progress
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
          <Clock className="w-3 h-3" />
          Pending
        </span>
      );
    }
  };

  const getScoreColor = (score: number | null): string => {
    if (score === null) return 'text-gray-400';
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading && !results) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        <span className="ml-3 text-gray-500">Loading assessment results...</span>
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

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-2xl font-bold text-gray-900">{results.assessments_count}</div>
          <div className="text-sm text-gray-500">Total Assessments</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-2xl font-bold text-blue-600">{results.completed_count}</div>
          <div className="text-sm text-gray-500">Completed</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-2xl font-bold text-green-600">{results.passed_count}</div>
          <div className="text-sm text-gray-500">Passed</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-2xl font-bold text-red-600">{results.failed_count}</div>
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
        <div className="flex items-center gap-4">
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
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Results</option>
            <option value="passed">Passed</option>
            <option value="failed">Failed</option>
          </select>

          <button
            onClick={handleSearch}
            className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900"
          >
            Search
          </button>
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : results.items.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Results Found</h3>
            <p className="text-gray-500">No assessment results match your filters.</p>
          </div>
        ) : (
          <>
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
                      <span className={`font-medium ${getScoreColor(item.hr_score)}`}>
                        {item.hr_score !== null ? `${item.hr_score}%` : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`font-medium ${getScoreColor(item.technical_score)}`}>
                        {item.technical_score !== null ? `${item.technical_score}%` : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`font-medium ${getScoreColor(item.coding_score)}`}>
                        {item.coding_score !== null ? `${item.coding_score}%` : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`font-semibold ${getScoreColor(item.overall_score)}`}>
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

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
                <div className="text-sm text-gray-500">
                  Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, results.total)} of {results.total} results
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-gray-600">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={page === totalPages}
                    className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
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

// Scored Resumes Tab Component
function ScoredResumesTab({ jdId }: { jdId: string }) {
  const [resumes, setResumes] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    fetchResumes();
  }, [jdId, page]);

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
      good_match: { bg: 'bg-green-100', text: 'text-green-700' },
      partial_match: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
      no_match: { bg: 'bg-red-100', text: 'text-red-700' },
    };
    const config = configs[status] || { bg: 'bg-gray-100', text: 'text-gray-600' };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  if (loading && !resumes) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        <span className="ml-3 text-gray-500">Loading scored resumes...</span>
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
          <button
            onClick={handleSearch}
            className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900"
          >
            Search
          </button>
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : resumes.items.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Results Found</h3>
            <p className="text-gray-500">No scored resumes match your search.</p>
          </div>
        ) : (
          <>
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
                      <span className="font-semibold text-gray-900">
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

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
                <div className="text-sm text-gray-500">
                  Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, resumes.total)} of {resumes.total} results
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-gray-600">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={page === totalPages}
                    className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
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

export default function JDDetailsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jdId = searchParams.get('id');
  const tabParam = searchParams.get('tab') as TabType | null;
  const jdPerms = useModulePermissions('jd');

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
    const configs: Record<string, { bg: string; text: string; dot: string }> = {
      draft: { bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' },
      published: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
      archived: { bg: 'bg-gray-50', text: 'text-gray-600', dot: 'bg-gray-400' },
      disabled: { bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-400' },
    };
    const config = configs[status] || configs.draft;
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${config.bg} ${config.text}`}>
        <span className={`w-2 h-2 rounded-full ${config.dot}`}></span>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };


  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-800" />
        <span className="ml-3 text-gray-600">Loading job description...</span>
      </div>
    );
  }

  if (!jd) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50">
        <FileText className="w-16 h-16 text-gray-300 mb-4" />
        <h2 className="text-xl font-medium text-gray-900 mb-2">Job Description Not Found</h2>
        <p className="text-gray-500 mb-6">The job description you're looking for doesn't exist.</p>
        <button
          onClick={() => router.push('/recruitment/jd-list')}
          className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900"
        >
          Back to Job Descriptions
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 p-8 overflow-y-auto bg-gray-50">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => router.push('/recruitment/jd-list')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Job Descriptions
          </button>

          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-3">
                {jd.job_id && (
                  <span className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm font-semibold border border-blue-200">
                    {jd.job_id}
                  </span>
                )}
                <h1 className="text-2xl font-semibold text-gray-900">{jd.title}</h1>
                {getStatusBadge(jd.status)}
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-500">
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

            <div className="flex items-center gap-3">
              {jd.status === 'draft' && (
                <button
                  onClick={handlePublish}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Publish
                </button>
              )}
              {jd.status === 'published' && (
                <button
                  onClick={() => router.push(`/recruitment/resume-scoring?jd_id=${jd.id}&mode=new`)}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900"
                >
                  <Target className="w-4 h-4" />
                  Score Resumes
                </button>
              )}
              {jdPerms.canUpdate && (
                <button
                  onClick={() => router.push(`/recruitment/jd-creation?id=${jd.id}`)}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit
                </button>
              )}
              {jdPerms.canArchive && jd.status !== 'archived' && (
                <button
                  onClick={handleArchive}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  <Archive className="w-4 h-4" />
                  Archive
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="-mb-px flex gap-6">
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
              className={`pb-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
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
              className={`pb-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
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
          <div className="grid grid-cols-3 gap-6">
            {/* Main Content */}
            <div className="col-span-2 space-y-6">
              {/* Description */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Job Description</h2>
                <div className="jd-content text-gray-700 text-sm leading-relaxed">
                  {renderJDDescription(jd.description || '')}
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
                <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-6">
                  <h2 className="text-lg font-semibold text-yellow-800 mb-4">Internal Comments</h2>
                  <p className="text-yellow-700">{jd.internal_comments}</p>
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
                  {(jd.salary_min || jd.salary_max) && (
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-gray-600">
                        <DollarSign className="w-4 h-4" />
                        Compensation
                      </span>
                      <span className="text-gray-900">
                        ${jd.salary_min?.toLocaleString() || 0} - ${jd.salary_max?.toLocaleString() || '∞'}
                        {jd.compensation_type && (
                          <span className="text-gray-500 text-xs ml-1">
                            ({jd.compensation_type})
                          </span>
                        )}
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
                                <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
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
  );
}
