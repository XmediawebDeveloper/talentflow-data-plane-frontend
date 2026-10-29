'use client';

import { BarChart3, TrendingUp, TrendingDown, Users, Briefcase, Clock, Target, Award, Calendar, Download, Filter, Eye, CheckCircle, XCircle, Activity, AlertCircle, ThumbsUp, MessageSquare, Zap, TrendingDown as Down } from 'lucide-react';
import { useState } from 'react';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import { Button } from '@/components/ui/button';
import FilterSelect from '@/components/ui/filter-select';
import { useAuth } from '@/components/providers/AuthProvider';

export default function Analytics() {
  const { isTenantAdmin, hasPermissionCode } = useAuth();
  const canExportAnalytics = isTenantAdmin || hasPermissionCode('analytics:export');
  const [timeRange, setTimeRange] = useState('30days');
  const [selectedMetric, setSelectedMetric] = useState('overview');

  // This is a static analytics view — only the time-range selector meaningfully
  // changes what's shown, so persist just that plus the scroll position.
  const rootRef = useScrollRestoration<HTMLElement>('reports-performance', true);
  useListStatePersistence(
    'reports-performance',
    { timeRange },
    (s) => {
      if (typeof s.timeRange === 'string') setTimeRange(s.timeRange);
    },
  );

  // Mock data - Recruiter-focused metrics
  const stats = {
    myActiveJobs: 8,
    totalApplicantsReceived: 342,
    avgResponseTime: 4.2,
    interviewsScheduled: 24,
    offersExtended: 6,
    hiredCandidates: 5,
  };

  const trends = {
    activeJobs: 14.3,
    applicants: 12.5,
    responseTime: -18.2, // negative is good (faster)
    interviews: 8.7,
    offers: 20.0,
    hired: 25.0,
  };

  // Period comparison
  const comparison = {
    previousPeriod: timeRange === '7days' ? 'vs last week' : 
                    timeRange === '30days' ? 'vs last month' : 
                    timeRange === '90days' ? 'vs last quarter' : 'vs last year',
  };

  return (
    <main ref={rootRef} className="flex-1 overflow-x-clip bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
      <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Reports' }, { label: 'Performance Reports' }]} />
      {/* Header */}
      <div className="mb-8">
        {/* flex-col below sm: at 390px the icon+title block and the
            select+button block used to share one row, leaving "Export
            Report" squeezed down to "Exp" before it hit the viewport edge. */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-gray-800 to-gray-800 rounded-xl flex items-center justify-center shadow-lg">
              <BarChart3 className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-gray-900 dark:text-slate-50">My Recruitment Analytics</h1>
              <p className="text-sm text-gray-600 dark:text-slate-400">Track your personal recruitment performance and insights</p>
            </div>
          </div>

          {/* Time Range Selector */}
          <div className="flex items-center gap-3">
            <FilterSelect
              value={timeRange}
              onChange={(v) => setTimeRange(v)}
              ariaLabel="Time range"
              options={[
                { value: '7days', label: 'Last 7 days' },
                { value: '30days', label: 'Last 30 days' },
                { value: '90days', label: 'Last 90 days' },
                { value: '1year', label: 'Last year' },
              ]}
              className="w-auto sm:w-auto flex-1 sm:flex-initial min-w-0 pl-4 sm:pl-4 pr-4 sm:pr-4 py-2 sm:py-2 rounded-lg sm:rounded-lg border-gray-300"
            />
            <Button
              variant="primary"
              icon={<Download className="w-4 h-4" />}
              onClick={() => {
                if (!canExportAnalytics) return;
              }}
              aria-disabled={!canExportAnalytics}
              title={!canExportAnalytics ? 'You do not have permission to export analytics reports' : undefined}
              className={!canExportAnalytics ? 'opacity-50 cursor-not-allowed' : ''}
            >
              Export Report
            </Button>
          </div>
        </div>
      </div>

      {/* Performance Summary Alert */}
      <div className="mb-6 bg-gradient-to-r from-green-50 to-gray-50 border border-success-line rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-success-subtle rounded-lg flex items-center justify-center">
            <ThumbsUp className="w-5 h-5 text-success" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-900 dark:text-slate-50 mb-1">Great Performance This Month! 🎉</div>
            <div className="text-sm text-gray-700 dark:text-slate-300">
              You've received <span className="font-semibold text-success">12.5% more applications</span> and your response time improved by <span className="font-semibold text-success">18.2%</span> compared to last month.
            </div>
          </div>
        </div>
      </div>

      {/* Key Metrics Grid - Recruiter Focused */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
        {/* My Active Jobs */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6 hover:shadow-xl transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-gray-100 dark:bg-slate-800 rounded-lg flex items-center justify-center">
              <Briefcase className="w-6 h-6 text-gray-800 dark:text-slate-100" />
            </div>
            <div className={`flex items-center gap-1 text-sm ${trends.activeJobs > 0 ? 'text-success' : 'text-destructive'}`}>
              {trends.activeJobs > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span>{Math.abs(trends.activeJobs)}%</span>
            </div>
          </div>
          <div className="text-3xl font-bold text-gray-900 dark:text-slate-50 mb-1">{stats.myActiveJobs}</div>
          <div className="text-sm text-gray-600 dark:text-slate-400 mb-3">My Active Jobs</div>
          <div className="text-xs text-gray-500 dark:text-slate-500">{comparison.previousPeriod}</div>
        </div>

        {/* Applicants Received */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6 hover:shadow-xl transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-gray-100 dark:bg-slate-800 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-gray-800 dark:text-slate-100" />
            </div>
            <div className={`flex items-center gap-1 text-sm ${trends.applicants > 0 ? 'text-success' : 'text-destructive'}`}>
              {trends.applicants > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span>{Math.abs(trends.applicants)}%</span>
            </div>
          </div>
          <div className="text-3xl font-bold text-gray-900 dark:text-slate-50 mb-1">{stats.totalApplicantsReceived}</div>
          <div className="text-sm text-gray-600 dark:text-slate-400 mb-3">Applicants Received</div>
          <div className="text-xs text-gray-500 dark:text-slate-500">Avg {Math.round(stats.totalApplicantsReceived / stats.myActiveJobs)} per job</div>
        </div>

        {/* Avg Response Time */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-success-line p-6 hover:shadow-xl transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-success-subtle rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6 text-success" />
            </div>
            <div className={`flex items-center gap-1 text-sm ${trends.responseTime < 0 ? 'text-success' : 'text-destructive'}`}>
              {trends.responseTime < 0 ? <Down className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
              <span>{Math.abs(trends.responseTime)}%</span>
            </div>
          </div>
          <div className="text-3xl font-bold text-gray-900 dark:text-slate-50 mb-1">{stats.avgResponseTime}h</div>
          <div className="text-sm text-gray-600 dark:text-slate-400 mb-3">Avg Response Time</div>
          <div className="text-xs text-success flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            Faster than team avg (6.2h)
          </div>
        </div>
      </div>

      {/* Secondary Metrics - Recruiter Pipeline */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-gray-100 dark:bg-slate-800 rounded-lg flex items-center justify-center">
              <Calendar className="w-5 h-5 text-gray-800 dark:text-slate-100" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900 dark:text-slate-50">{stats.interviewsScheduled}</div>
              <div className="text-sm text-gray-600 dark:text-slate-400">Interviews Scheduled</div>
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-success">
            <TrendingUp className="w-3 h-3" />
            <span>{trends.interviews}% {comparison.previousPeriod}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <Target className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900 dark:text-slate-50">{stats.offersExtended}</div>
              <div className="text-sm text-gray-600 dark:text-slate-400">Offers Extended</div>
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-success">
            <TrendingUp className="w-3 h-3" />
            <span>{trends.offers}% {comparison.previousPeriod}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-success-subtle rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-success" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900 dark:text-slate-50">{stats.hiredCandidates}</div>
              <div className="text-sm text-gray-600 dark:text-slate-400">Successfully Hired</div>
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-success">
            <TrendingUp className="w-3 h-3" />
            <span>{trends.hired}% {comparison.previousPeriod}</span>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
        {/* My Applications Over Time */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg text-gray-900 dark:text-slate-50 font-medium">My Applications Over Time</h3>
              <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">Applications received for your jobs</p>
            </div>
            <Button variant="secondary" size="sm" icon={<Filter className="w-4 h-4" />}>
              Filter
            </Button>
          </div>
          
          {/* Mock Line Chart with trend */}
          <div className="h-64 flex items-end justify-between gap-2">
            {[12, 18, 15, 24, 28, 32, 29, 35, 42, 38, 45, 48].map((value, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center gap-2">
                <div className="relative w-full flex items-end justify-center" style={{ height: '100%' }}>
                  <div 
                    className="w-full bg-gradient-to-t from-gray-800 to-gray-800 rounded-t-lg hover:from-gray-700 hover:to-gray-900 transition-all cursor-pointer group relative"
                    style={{ height: `${(value / 48) * 100}%` }}
                  >
                    <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-700 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      {value} applications
                    </div>
                  </div>
                </div>
                <div className="text-xs text-gray-500 dark:text-slate-500">
                  {['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9', 'W10', 'W11', 'W12'][idx]}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between text-sm">
            <div className="text-gray-600 dark:text-slate-400">Total: <span className="font-semibold text-gray-900 dark:text-slate-50">342 applications</span></div>
            <div className="text-success flex items-center gap-1">
              <TrendingUp className="w-4 h-4" />
              <span className="font-semibold">+12.5%</span>
            </div>
          </div>
        </div>

        {/* My Hiring Funnel */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg text-gray-900 dark:text-slate-50 font-medium">My Hiring Funnel</h3>
              <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">Conversion rates at each stage</p>
            </div>
            <Button variant="secondary" size="sm" icon={<Eye className="w-4 h-4" />}>
              Details
            </Button>
          </div>
          
          {/* Funnel Visualization with Conversion Rates */}
          <div className="space-y-4">
            {[
              { stage: 'Applications', count: 342, percentage: 100, color: 'bg-gray-800', conversion: null },
              { stage: 'Screened', count: 247, percentage: 72, color: 'bg-gray-800', conversion: 72 },
              { stage: 'Assessment Sent', count: 186, percentage: 54, color: 'bg-gray-800', conversion: 75 },
              { stage: 'Assessment Passed', count: 142, percentage: 42, color: 'bg-gray-600', conversion: 76 },
              { stage: 'Interviews', count: 89, percentage: 26, color: 'bg-fuchsia-600', conversion: 63 },
              { stage: 'Offers', count: 32, percentage: 9, color: 'bg-orange-600', conversion: 36 },
              { stage: 'Hired', count: 28, percentage: 8, color: 'bg-success', conversion: 88 },
            ].map((stage, idx) => (
              <div key={idx}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-700 dark:text-slate-300">{stage.stage}</span>
                    {stage.conversion && (
                      <span className="text-xs text-gray-500 dark:text-slate-500 bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                        {stage.conversion}% conversion
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-slate-50">{stage.count}</span>
                </div>
                <div className="w-full h-8 bg-gray-100 dark:bg-slate-800 rounded-lg overflow-hidden">
                  <div 
                    className={`h-full ${stage.color} flex items-center justify-end pr-3 text-white text-xs font-medium transition-all`}
                    style={{ width: `${stage.percentage}%` }}
                  >
                    {stage.percentage}%
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-slate-400">Overall Conversion Rate:</span>
              <span className="text-lg font-bold text-success">8.2%</span>
            </div>
          </div>
        </div>
      </div>

      {/* My Top Performing Jobs */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6 mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg text-gray-900 dark:text-slate-50 font-medium">My Top Performing Jobs</h3>
            <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">Jobs posted by you, ranked by success metrics</p>
          </div>
          <button className="text-sm text-gray-800 dark:text-slate-100 hover:text-gray-900">View All My Jobs</button>
        </div>

        <div className="overflow-x-auto tf-table-shell">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-700">
                <th className="text-left text-xs font-semibold text-gray-600 dark:text-slate-300 pb-3">Job Title</th>
                <th className="text-left text-xs font-semibold text-gray-600 dark:text-slate-300 pb-3">Applications</th>
                <th className="text-left text-xs font-semibold text-gray-600 dark:text-slate-300 pb-3">Interviews</th>
                <th className="text-left text-xs font-semibold text-gray-600 dark:text-slate-300 pb-3">Offers</th>
                <th className="text-left text-xs font-semibold text-gray-600 dark:text-slate-300 pb-3">Hired</th>
                <th className="text-left text-xs font-semibold text-gray-600 dark:text-slate-300 pb-3">Conversion</th>
                <th className="text-left text-xs font-semibold text-gray-600 dark:text-slate-300 pb-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {[
                { title: 'Senior Full Stack Developer', apps: 64, interviews: 18, offers: 4, hired: 3, conversion: 4.7, status: 'Active', quality: 'high' },
                { title: 'Backend Engineer (Python)', apps: 52, interviews: 14, offers: 3, hired: 2, conversion: 3.8, status: 'Active', quality: 'high' },
                { title: 'DevOps Specialist', apps: 38, interviews: 11, offers: 2, hired: 2, conversion: 5.3, status: 'Filled', quality: 'high' },
                { title: 'Frontend Developer (React)', apps: 71, interviews: 16, offers: 3, hired: 3, conversion: 4.2, status: 'Active', quality: 'high' },
                { title: 'Product Manager', apps: 45, interviews: 10, offers: 2, hired: 1, conversion: 2.2, status: 'Active', quality: 'medium' },
                { title: 'UI/UX Designer', apps: 48, interviews: 12, offers: 2, hired: 1, conversion: 2.1, status: 'Active', quality: 'medium' },
                { title: 'Data Analyst', apps: 24, interviews: 8, offers: 1, hired: 1, conversion: 4.2, status: 'Filled', quality: 'high' },
              ].map((job, idx) => (
                <tr key={idx} className="border-b border-gray-100 dark:border-slate-700/60 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors cursor-pointer">
                  <td className="py-4 text-sm text-gray-900 dark:text-slate-50">{job.title}</td>
                  <td className="py-4 text-sm text-gray-700 dark:text-slate-300">{job.apps}</td>
                  <td className="py-4 text-sm text-gray-700 dark:text-slate-300">{job.interviews}</td>
                  <td className="py-4 text-sm text-gray-700 dark:text-slate-300">{job.offers}</td>
                  <td className="py-4 text-sm font-medium text-gray-900 dark:text-slate-50">{job.hired}</td>
                  <td className="py-4">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${
                        job.conversion >= 4 ? 'text-success' :
                        job.conversion >= 3 ? 'text-gray-800 dark:text-slate-100' :
                        'text-orange-600'
                      }`}>
                        {job.conversion}%
                      </span>
                      {job.quality === 'high' && (
                        <Zap className="w-4 h-4 text-success" />
                      )}
                    </div>
                  </td>
                  <td className="py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      job.status === 'Active' ? 'bg-success-subtle text-success' :
                      'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300'
                    }`}>
                      {job.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700 text-sm text-gray-600 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-success" />
            <span>High performer = Conversion rate above 4%</span>
          </div>
        </div>
      </div>

      {/* Performance Insights */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
        {/* Response Time Analysis */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6">
          <h3 className="text-lg text-gray-900 dark:text-slate-50 font-medium mb-6">Response Time Analysis</h3>
          <div className="space-y-4">
            {[
              { timeframe: '< 2 hours', count: 142, percentage: 42, color: 'bg-success', label: 'Excellent' },
              { timeframe: '2-6 hours', count: 124, percentage: 36, color: 'bg-gray-800', label: 'Good' },
              { timeframe: '6-24 hours', count: 58, percentage: 17, color: 'bg-warning', label: 'Fair' },
              { timeframe: '> 24 hours', count: 18, percentage: 5, color: 'bg-destructive', label: 'Needs Improvement' },
            ].map((metric, idx) => (
              <div key={idx}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-700 dark:text-slate-300">{metric.timeframe}</span>
                    <span className="text-xs text-gray-500 dark:text-slate-500 bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                      {metric.label}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-slate-50">{metric.count} responses</span>
                </div>
                <div className="w-full h-6 bg-gray-100 dark:bg-slate-800 rounded-lg overflow-hidden">
                  <div 
                    className={`h-full ${metric.color} flex items-center justify-end pr-3 text-white text-xs font-medium`}
                    style={{ width: `${metric.percentage}%` }}
                  >
                    {metric.percentage}%
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
            <div className="flex items-center gap-2 text-sm text-success">
              <CheckCircle className="w-4 h-4" />
              <span>78% of responses within 6 hours - Great job! 🎯</span>
            </div>
          </div>
        </div>

        {/* Assessment Performance */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6">
          <h3 className="text-lg text-gray-900 dark:text-slate-50 font-medium mb-6">Assessment Performance</h3>
          <div className="space-y-6">
            {[
              { type: 'Coding Assessment', sent: 124, completed: 98, passed: 84, rate: 86 },
              { type: 'Technical Quiz', sent: 156, completed: 134, passed: 117, rate: 87 },
              { type: 'Behavioral Test', sent: 89, completed: 82, passed: 74, rate: 90 },
            ].map((assessment, idx) => (
              <div key={idx} className="pb-4 border-b border-gray-200 dark:border-slate-700 last:border-0 last:pb-0">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-slate-50">{assessment.type}</div>
                    <div className="text-xs text-gray-600 dark:text-slate-400 mt-1">
                      {assessment.sent} sent • {assessment.completed} completed ({Math.round((assessment.completed/assessment.sent)*100)}%) • {assessment.passed} passed
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-gray-900 dark:text-slate-50">{assessment.rate}%</div>
                    <div className="text-xs text-gray-500 dark:text-slate-500">pass rate</div>
                  </div>
                </div>
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-gray-800 to-gray-800 rounded-full"
                    style={{ width: `${assessment.rate}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-slate-400">Overall Assessment Completion:</span>
              <span className="text-lg font-bold text-gray-800 dark:text-slate-100">86%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Application Sources for My Jobs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6">
          <div className="mb-6">
            <h3 className="text-lg text-gray-900 dark:text-slate-50 font-medium">Application Sources</h3>
            <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">Where candidates found your jobs</p>
          </div>
          <div className="space-y-4">
            {[
              { source: 'LinkedIn', count: 142, percentage: 42, color: 'bg-gray-800', conversion: 9.2 },
              { source: 'Indeed', count: 89, percentage: 26, color: 'bg-orange-600', conversion: 7.8 },
              { source: 'Company Website', count: 68, percentage: 20, color: 'bg-gray-800', conversion: 11.8 },
              { source: 'Referrals', count: 28, percentage: 8, color: 'bg-success', conversion: 21.4 },
              { source: 'Other', count: 15, percentage: 4, color: 'bg-gray-600', conversion: 6.7 },
            ].map((source, idx) => (
              <div key={idx}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-700 dark:text-slate-300">{source.source}</span>
                    <span className="text-xs text-gray-500 dark:text-slate-500">({source.conversion}% conversion)</span>
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-slate-50">{source.count}</span>
                </div>
                <div className="w-full h-6 bg-gray-100 dark:bg-slate-800 rounded-lg overflow-hidden">
                  <div 
                    className={`h-full ${source.color} flex items-center justify-end pr-3 text-white text-xs font-medium`}
                    style={{ width: `${source.percentage}%` }}
                  >
                    {source.percentage}%
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
            <div className="flex items-center gap-2 text-sm">
              <Zap className="w-4 h-4 text-success" />
              <span className="text-gray-600 dark:text-slate-400">Best source: <span className="font-semibold text-success">Referrals (21.4% conversion)</span></span>
            </div>
          </div>
        </div>

        {/* Time to Hire Breakdown */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6">
          <div className="mb-6">
            <h3 className="text-lg text-gray-900 dark:text-slate-50 font-medium">Time to Hire Breakdown</h3>
            <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">Average days spent in each stage</p>
          </div>
          <div className="space-y-4">
            {[
              { stage: 'Application to Screening', days: 1.2, color: 'bg-gray-800', percentage: 7 },
              { stage: 'Screening to Assessment', days: 2.8, color: 'bg-gray-800', percentage: 16 },
              { stage: 'Assessment to Interview', days: 3.5, color: 'bg-gray-800', percentage: 20 },
              { stage: 'Interview to Offer', days: 6.2, color: 'bg-gray-600', percentage: 35 },
              { stage: 'Offer to Acceptance', days: 3.9, color: 'bg-fuchsia-600', percentage: 22 },
            ].map((stage, idx) => (
              <div key={idx}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-700 dark:text-slate-300">{stage.stage}</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-slate-50">{stage.days} days</span>
                </div>
                <div className="w-full h-6 bg-gray-100 dark:bg-slate-800 rounded-lg overflow-hidden">
                  <div 
                    className={`h-full ${stage.color} flex items-center justify-end pr-3 text-white text-xs font-medium`}
                    style={{ width: `${stage.percentage * 3}%` }}
                  >
                    {stage.percentage}%
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-slate-400">Total Average Time to Hire:</span>
              <span className="text-lg font-bold text-gray-800 dark:text-slate-100">17.6 days</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg text-gray-900 dark:text-slate-50 font-medium">My Recent Activity</h3>
            <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">Latest updates from your jobs and candidates</p>
          </div>
          <button className="text-sm text-gray-800 dark:text-slate-100 hover:text-gray-900">View All Activity</button>
        </div>

        <div className="space-y-4">
          {[
            { icon: CheckCircle, color: 'text-success', bg: 'bg-success-subtle', text: 'Sarah Johnson accepted your offer for Senior Full Stack Developer', time: '12 min ago', action: 'Offer Accepted' },
            { icon: Users, color: 'text-gray-800', bg: 'bg-gray-100', text: '8 new applications received for Backend Engineer position', time: '45 min ago', action: 'New Applications' },
            { icon: Award, color: 'text-gray-800', bg: 'bg-gray-100', text: 'Michael Chen scored 94% in your coding assessment', time: '2 hours ago', action: 'Assessment Completed' },
            { icon: Calendar, color: 'text-orange-600', bg: 'bg-orange-100', text: 'Interview scheduled with Emily Rodriguez for tomorrow at 2:00 PM', time: '3 hours ago', action: 'Interview Scheduled' },
            { icon: MessageSquare, color: 'text-gray-800', bg: 'bg-gray-100', text: 'David Kim sent you a message regarding the DevOps position', time: '5 hours ago', action: 'Candidate Message' },
            { icon: XCircle, color: 'text-destructive', bg: 'bg-destructive-subtle', text: 'Alex Thompson withdrew application for Product Manager', time: '6 hours ago', action: 'Application Withdrawn' },
          ].map((activity, idx) => {
            const Icon = activity.icon;
            return (
              <div key={idx} className="flex items-start gap-4 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors cursor-pointer">
                <div className={`w-10 h-10 rounded-lg ${activity.bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-5 h-5 ${activity.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-gray-500 dark:text-slate-500 uppercase tracking-wider">{activity.action}</span>
                    <span className="text-xs text-gray-400 dark:text-slate-500">•</span>
                    <span className="text-xs text-gray-500 dark:text-slate-500">{activity.time}</span>
                  </div>
                  <p className="text-sm text-gray-900 dark:text-slate-50">{activity.text}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      </div>
      </div>
    </main>
  );
}