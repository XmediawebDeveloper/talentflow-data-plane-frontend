'use client';

import { BarChart3, Search, Filter, Download, Clock, User, FileText, Target, Video, Settings, Calendar } from 'lucide-react';
import { useState } from 'react';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import ExportFormatModal from '@/components/ExportFormatModal';
import { exportRows } from '@/lib/utils/exportUtils';
import { toast } from 'sonner';
import FilterSelect from '@/components/ui/filter-select';

const mockActivityLogs = [
  { id: '1', user: 'John Admin', action: 'Created job posting', details: 'Senior Frontend Developer', timestamp: '2 min ago', category: 'jobs' },
  { id: '2', user: 'Sarah Recruiter', action: 'Scored resumes', details: '15 resumes for Product Manager', timestamp: '15 min ago', category: 'scoring' },
  { id: '3', user: 'Sarah Recruiter', action: 'Scheduled interview', details: 'AI Interview for Mike Johnson', timestamp: '1 hour ago', category: 'interview' },
  { id: '4', user: 'Emily HR', action: 'Created assessment', details: 'Technical Assessment - React', timestamp: '2 hours ago', category: 'assessment' },
  { id: '5', user: 'John Admin', action: 'Updated settings', details: 'Changed notification preferences', timestamp: '3 hours ago', category: 'settings' },
  { id: '6', user: 'Mike Viewer', action: 'Viewed resume', details: 'Sarah Johnson - UX Designer', timestamp: '4 hours ago', category: 'view' },
  { id: '7', user: 'Sarah Recruiter', action: 'Uploaded resumes', details: '8 resumes uploaded', timestamp: '5 hours ago', category: 'upload' },
  { id: '8', user: 'John Admin', action: 'Added team member', details: 'Added Emily HR to team', timestamp: '1 day ago', category: 'team' },
];

const categoryIcons: Record<string, React.ReactNode> = {
  jobs: <FileText className="w-4 h-4" />,
  scoring: <Target className="w-4 h-4" />,
  interview: <Video className="w-4 h-4" />,
  assessment: <BarChart3 className="w-4 h-4" />,
  settings: <Settings className="w-4 h-4" />,
  view: <User className="w-4 h-4" />,
  upload: <FileText className="w-4 h-4" />,
  team: <User className="w-4 h-4" />,
};

const categoryColors: Record<string, string> = {
  jobs: 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/15 dark:bg-brand-blue/20 dark:ring-brand-blue/30',
  scoring: 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/15 dark:bg-brand-blue/20 dark:ring-brand-blue/30',
  interview: 'bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20 dark:bg-cyan-500/15 dark:ring-cyan-400/30',
  assessment: 'bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20 dark:bg-orange-500/15 dark:ring-orange-400/30 dark:text-orange-300',
  settings: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700',
  view: 'bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20 dark:bg-orange-500/15 dark:ring-orange-400/30 dark:text-orange-300',
  upload: 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/15 dark:bg-brand-blue/20 dark:ring-brand-blue/30',
  team: 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/15 dark:bg-brand-blue/20 dark:ring-brand-blue/30',
};

export default function ActivityLogsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [showExportModal, setShowExportModal] = useState(false);

  // Persist the search + category filter and scroll position so returning to
  // this page restores exactly where the user left off.
  const rootRef = useScrollRestoration<HTMLElement>('reports-activity-logs', true);
  useListStatePersistence(
    'reports-activity-logs',
    { searchQuery, filterCategory },
    (s) => {
      if (typeof s.searchQuery === 'string') setSearchQuery(s.searchQuery);
      if (typeof s.filterCategory === 'string') setFilterCategory(s.filterCategory);
    },
  );

  const categories = ['all', ...new Set(mockActivityLogs.map(log => log.category))];

  const filteredLogs = mockActivityLogs.filter(log => {
    const matchesSearch =
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.details.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === 'all' || log.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  // Export Logs — the currently filtered rows, in the format picked in the
  // shared CSV / Excel picker.
  const exportHeaders = ['User', 'Action', 'Details', 'Category', 'Time'];
  const handleExportLogs = async (format: 'csv' | 'xlsx') => {
    const rows = filteredLogs.map(log => [log.user, log.action, log.details, log.category, log.timestamp]);
    await exportRows(format, exportHeaders, rows, `Activity_Logs_${new Date().toISOString().slice(0, 10)}`, {
      sheetName: 'Activity Logs',
      title: 'Activity Logs',
    });
    toast.success(`Exported ${rows.length} log${rows.length !== 1 ? 's' : ''} to ${format === 'xlsx' ? 'Excel' : 'CSV'}`);
  };

  return (
    <main ref={rootRef} className="flex-1 overflow-x-clip bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
        <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Activity Logs' }]} />
        <ExportFormatModal
          open={showExportModal}
          onClose={() => setShowExportModal(false)}
          title="Export Activity Logs"
          recordCount={filteredLogs.length}
          columns={exportHeaders}
          onExport={handleExportLogs}
        />

        {/* Header */}
        <div className="mb-5 sm:mb-6 lg:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 dark:bg-brand-blue/20 dark:ring-brand-blue/30 flex items-center justify-center flex-shrink-0">
                <BarChart3 className="w-4 h-4 text-brand-blue" />
              </div>
              <div className="min-w-0">
                <h1 className="tf-page-title">Activity Logs</h1>
                <p className="tf-card-desc">Track all activities across your organization</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (filteredLogs.length === 0) {
                  toast.error('No logs to export');
                  return;
                }
                setShowExportModal(true);
              }}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg font-medium transition-colors self-end sm:self-auto">
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export Logs</span>
              <span className="sm:hidden">Export</span>
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-5 sm:mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Search activities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-9 sm:pl-10 pr-3 sm:pr-4 text-sm bg-white dark:bg-slate-800 text-black dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue outline-none"
            />
          </div>
          <FilterSelect
            value={filterCategory}
            onChange={(v) => setFilterCategory(v)}
            ariaLabel="Filter by category"
            options={categories.map((cat) => ({ value: cat, label: cat.charAt(0).toUpperCase() + cat.slice(1) }))}
            className="h-10 data-[size=default]:h-10 sm:data-[size=default]:h-10 py-0 sm:py-0 pl-3 sm:pl-4 pr-3 sm:pr-4 rounded-lg sm:rounded-lg dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        {/* Activity Timeline */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5">
          <div className="divide-y divide-gray-100 dark:divide-slate-700/60">
            {filteredLogs.map((log) => (
              <div key={log.id} className="p-3 sm:p-4 hover:bg-brand-blue/[0.04] dark:hover:bg-brand-blue/10 transition-colors">
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${categoryColors[log.category]}`}>
                    {categoryIcons[log.category]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-slate-50 truncate">{log.action}</p>
                        <p className="tf-body-muted truncate">{log.details}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="tf-body-muted whitespace-nowrap">{log.timestamp}</p>
                        <p className="text-xs text-gray-400 dark:text-slate-500 whitespace-nowrap">{log.user}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {filteredLogs.length === 0 && (
          <div className="text-center py-12">
            <BarChart3 className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-slate-50 mb-2">No activities found</h3>
            <p className="tf-body-muted">Try adjusting your search or filters.</p>
          </div>
        )}
      </div>
      </div>
    </main>
  );
}
