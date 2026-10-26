import { useState } from 'react';
import { FileDown, FileText, Users, Briefcase, ClipboardList, Calendar, Filter, Download, CheckSquare, Square, BarChart3, FileSpreadsheet, FileJson, Mail, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { DateField } from '@/components/ui/date-field';
import FilterSelect from '@/components/ui/filter-select';

export default function ReportsExports() {
  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [selectedFormat, setSelectedFormat] = useState<'excel' | 'pdf' | 'csv' | 'json'>('excel');
  const [isGenerating, setIsGenerating] = useState(false); // FIX-005: Add loading state

  const reportCategories = [
    {
      id: 'recruitment',
      name: 'Recruitment Reports',
      icon: Briefcase,
      color: 'blue',
      reports: [
        {
          id: 'jd-summary',
          name: 'Job Descriptions Summary',
          description: 'Complete list of all JDs with status, applications, and hiring metrics',
          icon: FileText,
          lastGenerated: '2025-12-03',
          size: '2.4 MB'
        },
        {
          id: 'applications-report',
          name: 'Applications Report',
          description: 'All job applications with candidate details and application timeline',
          icon: Users,
          lastGenerated: '2025-12-02',
          size: '5.1 MB'
        },
        {
          id: 'hiring-pipeline',
          name: 'Hiring Pipeline Analysis',
          description: 'Stage-wise breakdown of candidates across all active jobs',
          icon: BarChart3,
          lastGenerated: '2025-12-01',
          size: '1.8 MB'
        }
      ]
    },
    {
      id: 'resumes',
      name: 'Resume Reports',
      icon: Users,
      color: 'green',
      reports: [
        {
          id: 'scored-resumes',
          name: 'Scored Resumes Export',
          description: 'All resumes with AI match scores, rankings, and detailed analysis',
          icon: FileText,
          lastGenerated: '2025-12-03',
          size: '8.7 MB'
        },
        {
          id: 'my-resumes-db',
          name: 'My Resumes Database',
          description: 'Complete export of My Resumes folder with metadata and tags',
          icon: Users,
          lastGenerated: '2025-12-02',
          size: '12.3 MB'
        },
        {
          id: 'internal-db-export',
          name: 'Internal Database Export',
          description: 'Full internal candidate database with all profiles and history',
          icon: Users,
          lastGenerated: '2025-12-01',
          size: '15.6 MB'
        }
      ]
    },
    {
      id: 'assessments',
      name: 'Assessment Reports',
      icon: ClipboardList,
      color: 'gray',
      reports: [
        {
          id: 'assessment-results',
          name: 'Assessment Results',
          description: 'Complete assessment outcomes with scores, pass/fail, and AI summaries',
          icon: ClipboardList,
          lastGenerated: '2025-12-03',
          size: '4.2 MB'
        },
        {
          id: 'assessment-audit-trail',
          name: 'Assessment Audit Trail',
          description: 'Compliance log with tenant, consent, unit consumption, and error tracking',
          icon: FileText,
          lastGenerated: '2025-12-03',
          size: '1.5 MB'
        },
        {
          id: 'unit-consumption',
          name: 'Unit Consumption Report',
          description: 'Assessment units usage, billing history, and refund records',
          icon: BarChart3,
          lastGenerated: '2025-12-02',
          size: '0.8 MB'
        }
      ]
    },
    {
      id: 'analytics',
      name: 'Analytics & Insights',
      icon: BarChart3,
      color: 'yellow',
      reports: [
        {
          id: 'recruitment-analytics',
          name: 'Recruitment Analytics',
          description: 'KPIs, trends, time-to-hire, and performance metrics',
          icon: BarChart3,
          lastGenerated: '2025-12-01',
          size: '2.1 MB'
        },
        {
          id: 'ai-match-insights',
          name: 'AI Talent Match Insights',
          description: 'AI matching performance, accuracy metrics, and recommendation analysis',
          icon: BarChart3,
          lastGenerated: '2025-11-30',
          size: '3.4 MB'
        },
        {
          id: 'user-activity',
          name: 'User Activity Report',
          description: 'Recruiter activity, action logs, and team performance',
          icon: Users,
          lastGenerated: '2025-11-29',
          size: '1.2 MB'
        }
      ]
    }
  ];

  const handleSelectReport = (reportId: string) => {
    if (selectedReports.includes(reportId)) {
      setSelectedReports(selectedReports.filter(id => id !== reportId));
    } else {
      setSelectedReports([...selectedReports, reportId]);
    }
  };

  const handleSelectAll = () => {
    const allReportIds = reportCategories.flatMap(cat => cat.reports.map(r => r.id));
    if (selectedReports.length === allReportIds.length) {
      setSelectedReports([]);
    } else {
      setSelectedReports(allReportIds);
    }
  };

  // FIX-005: Replace alert() with toast notifications
  const handleGenerateReports = async () => {
    if (selectedReports.length === 0) {
      toast.error('No reports selected', {
        description: 'Please select at least one report to generate',
      });
      return;
    }

    setIsGenerating(true);
    const reportCount = selectedReports.length;
    const formatLabel = selectedFormat.toUpperCase();

    // Show progress toast
    const toastId = toast.loading(`Generating ${reportCount} report${reportCount !== 1 ? 's' : ''}...`, {
      description: `Preparing ${formatLabel} export`,
    });

    console.log('Generating reports:', {
      reports: selectedReports,
      format: selectedFormat,
      dateRange
    });

    // Simulate report generation (replace with actual API call)
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));

      toast.success(`${reportCount} report${reportCount !== 1 ? 's' : ''} generated!`, {
        id: toastId,
        description: `${formatLabel} files are ready for download`,
        action: {
          label: 'Download',
          onClick: () => console.log('Downloading reports...'),
        },
      });

      // Clear selection after successful generation
      setSelectedReports([]);
    } catch (error) {
      toast.error('Failed to generate reports', {
        id: toastId,
        description: 'Please try again or contact support if the issue persists',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleScheduleReport = () => {
    toast.info('Schedule Reports', {
      description: 'Configure automated report delivery - Coming soon!',
    });
  };

  const getFormatIcon = () => {
    switch (selectedFormat) {
      case 'excel':
        return <FileSpreadsheet className="w-4 h-4" />;
      case 'pdf':
        return <FileText className="w-4 h-4" />;
      case 'csv':
        return <FileText className="w-4 h-4" />;
      case 'json':
        return <FileJson className="w-4 h-4" />;
    }
  };

  const getCategoryColor = (color: string) => {
    const colors = {
      blue: 'bg-gray-100 text-gray-800',
      green: 'bg-green-100 text-green-600',
      gray: 'bg-gray-100 text-gray-800',
      yellow: 'bg-yellow-100 text-yellow-600'
    };
    return colors[color as keyof typeof colors] || colors.blue;
  };

  return (
    <div className="flex-1 p-8 overflow-y-auto bg-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-gray-900 mb-2">Reports & Exports</h1>
          <p className="text-sm text-gray-600">
            Generate and download comprehensive reports across all recruitment activities
          </p>
        </div>

        {/* Top Controls */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="grid grid-cols-4 gap-4 mb-4">
            {/* Date Range */}
            <div>
              <label className="block text-sm text-gray-700 mb-2">Date From</label>
              <DateField
                value={dateRange.from}
                onChange={(v) => setDateRange({ ...dateRange, from: v })}
                aria-label="Date From"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Date To</label>
              <DateField
                value={dateRange.to}
                onChange={(v) => setDateRange({ ...dateRange, to: v })}
                aria-label="Date To"
              />
            </div>

            {/* Format Selection */}
            <div>
              <label className="block text-sm text-gray-700 mb-2">Export Format</label>
              <FilterSelect
                value={selectedFormat}
                onChange={(v) => setSelectedFormat(v as any)}
                ariaLabel="Export Format"
                options={[
                  { value: 'excel', label: 'Excel (.xlsx)' },
                  { value: 'pdf', label: 'PDF (.pdf)' },
                  { value: 'csv', label: 'CSV (.csv)' },
                  { value: 'json', label: 'JSON (.json)' },
                ]}
                className="w-full sm:w-full pl-3 sm:pl-3 pr-3 sm:pr-3 py-2 sm:py-2 rounded-md sm:rounded-md border-gray-300"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-end gap-2">
              <button
                onClick={handleGenerateReports}
                disabled={selectedReports.length === 0 || isGenerating}
                className="flex-1 px-4 py-2 text-sm bg-gray-800 text-white rounded-md hover:bg-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    {getFormatIcon()}
                    Generate ({selectedReports.length})
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Selection Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-200">
            <button
              onClick={handleSelectAll}
              className="text-sm text-gray-800 hover:text-gray-900 flex items-center gap-2"
            >
              {selectedReports.length === reportCategories.flatMap(c => c.reports).length ? (
                <CheckSquare className="w-4 h-4" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              {selectedReports.length === reportCategories.flatMap(c => c.reports).length ? 'Deselect All' : 'Select All'}
            </button>

            <button
              onClick={handleScheduleReport}
              className="text-sm text-gray-800 hover:text-gray-900 flex items-center gap-2"
            >
              <Calendar className="w-4 h-4" />
              Schedule Automated Reports
            </button>
          </div>
        </div>

        {/* Report Categories */}
        <div className="space-y-6">
          {reportCategories.map((category) => {
            const CategoryIcon = category.icon;
            const categorySelectedCount = category.reports.filter(r => selectedReports.includes(r.id)).length;

            return (
              <div key={category.id} className="bg-white rounded-lg shadow-sm border border-gray-200">
                {/* Category Header */}
                <div className="p-6 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg ${getCategoryColor(category.color)} flex items-center justify-center`}>
                        <CategoryIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <h2 className="text-gray-900">{category.name}</h2>
                        <p className="text-sm text-gray-600">
                          {category.reports.length} report{category.reports.length !== 1 ? 's' : ''} available
                        </p>
                      </div>
                    </div>

                    {categorySelectedCount > 0 && (
                      <span className="px-3 py-1 bg-gray-100 text-gray-900 rounded-full text-sm">
                        {categorySelectedCount} selected
                      </span>
                    )}
                  </div>
                </div>

                {/* Reports List */}
                <div className="divide-y divide-gray-100">
                  {category.reports.map((report) => {
                    const ReportIcon = report.icon;
                    const isSelected = selectedReports.includes(report.id);

                    return (
                      <div
                        key={report.id}
                        className={`p-6 hover:bg-gray-50 transition-colors cursor-pointer ${
                          isSelected ? 'bg-gray-50' : ''
                        }`}
                        onClick={() => handleSelectReport(report.id)}
                      >
                        <div className="flex items-start gap-4">
                          {/* Checkbox */}
                          <button
                            className="mt-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectReport(report.id);
                            }}
                          >
                            {isSelected ? (
                              <CheckSquare className="w-5 h-5 text-gray-800" />
                            ) : (
                              <Square className="w-5 h-5 text-gray-400" />
                            )}
                          </button>

                          {/* Icon */}
                          <div className={`w-12 h-12 rounded-lg ${isSelected ? 'bg-gray-100' : 'bg-gray-100'} flex items-center justify-center flex-shrink-0`}>
                            <ReportIcon className={`w-6 h-6 ${isSelected ? 'text-gray-800' : 'text-gray-600'}`} />
                          </div>

                          {/* Content */}
                          <div className="flex-1">
                            <h3 className={`text-sm mb-1 ${isSelected ? 'text-gray-800' : 'text-gray-900'}`}>
                              {report.name}
                            </h3>
                            <p className="text-sm text-gray-600 mb-3">
                              {report.description}
                            </p>
                            <div className="flex items-center gap-4 text-xs text-gray-500">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5" />
                                Last: {report.lastGenerated}
                              </span>
                              <span className="flex items-center gap-1">
                                <FileDown className="w-3.5 h-3.5" />
                                {report.size}
                              </span>
                            </div>
                          </div>

                          {/* Quick Download */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              console.log('Quick download:', report.id);
                              toast.info(`Downloading ${report.name} in ${selectedFormat.toUpperCase()} format`);
                            }}
                            className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors flex items-center gap-2"
                          >
                            <Download className="w-4 h-4" />
                            Download
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Scheduled Reports Section */}
        <div className="mt-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-gray-900 mb-1">Scheduled Reports</h2>
              <p className="text-sm text-gray-600">
                Automated report generation and email delivery
              </p>
            </div>
            <button
              onClick={handleScheduleReport}
              className="px-4 py-2 text-sm bg-gray-800 text-white rounded-md hover:bg-gray-900 transition-colors flex items-center gap-2"
            >
              <Calendar className="w-4 h-4" />
              New Schedule
            </button>
          </div>

          {/* Sample Scheduled Reports */}
          <div className="space-y-3">
            <div className="p-4 border border-gray-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-gray-800" />
                  <div>
                    <div className="text-sm text-gray-900">Weekly Recruitment Summary</div>
                    <div className="text-xs text-gray-500">Every Monday at 9:00 AM • Excel format</div>
                  </div>
                </div>
                <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">Active</span>
              </div>
            </div>

            <div className="p-4 border border-gray-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-gray-800" />
                  <div>
                    <div className="text-sm text-gray-900">Monthly Assessment Analytics</div>
                    <div className="text-xs text-gray-500">1st of every month • PDF format</div>
                  </div>
                </div>
                <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">Active</span>
              </div>
            </div>
          </div>
        </div>

        {/* Help Text */}
        <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="flex gap-3">
            <FileDown className="w-5 h-5 text-gray-800 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-gray-800">
              <p className="mb-2">
                <strong>Pro Tips for Reports:</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 text-gray-700">
                <li>Use date filters to generate reports for specific time periods</li>
                <li>Select multiple reports to download them as a ZIP archive</li>
                <li>Schedule automated reports for regular team updates</li>
                <li>Export to Excel for advanced data analysis and pivot tables</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
