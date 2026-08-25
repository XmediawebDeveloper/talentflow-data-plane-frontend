'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Clock,
  Users,
  CheckCircle,
  FileText,
  MoreVertical,
  Eye,
  Edit2,
  BarChart,
  Mail,
  Trash2,
  Copy,
  Archive,
  Download,
  Share2,
  LayoutGrid,
  List,
  Loader2,
  ClipboardList,
  Target,
  TrendingUp,
  Activity,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '@/lib/hooks/useAuth';
import { assessmentService } from '@/lib/services';
import { toast } from 'sonner';
import { usePlanFeature } from '@/lib/hooks/usePlanFeature';
// dateUtils exports neither of these names. formatDateTimeIST was imported but never
// used; formatDateOnlyIST is used below and resolved to undefined at runtime, so the
// call crashed. formatISTDate is dateUtils' own date-only formatter and is what the
// rest of the app uses for exactly this.
import { formatISTDate } from '@/lib/utils/dateUtils';
import VersionBadge from './VersionBadge';
import { stripVersionFromTitle } from '@/lib/utils/assessmentUtils';

interface AssessmentsForJDProps {
  jdId: string;
  jdTitle?: string;
}

export default function AssessmentsForJD({ jdId, jdTitle }: AssessmentsForJDProps) {
  const router = useRouter();
  const { user, hasPermission } = useAuth();
  const { available: assessmentAvailable } = usePlanFeature('assessment');
  const [isLoading, setIsLoading] = useState(true);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'draft' | 'archived'>('all');

  // Permissions
  const canCreateAssessments = hasPermission('canCreateAssessments');
  const canViewAssessments = hasPermission('canViewAssessments');

  useEffect(() => {
    fetchAssessments();
  }, [jdId, activeTab]);

  const fetchAssessments = async () => {
    setIsLoading(true);
    try {
      const response = await assessmentService.list({
        jd_id: jdId,
        status: activeTab === 'all' ? undefined : activeTab,
        page_size: 100,
      });

      const mapped = (response.items || []).map((a: any, index: number) => {
        const rawStatus = (a.status || 'draft').toLowerCase();
        const shortId = a.short_id || `AS-${String(a.sequence_number || index + 1).padStart(3, '0')}`;
        return {
          id: a.id,
          short_id: shortId,
          title: a.title,
          description: a.description,
          jd_id: a.jd_id,
          jd_title: a.jd_title,
          status: rawStatus,
          version: a.version || 1,
          duration: a.duration_minutes || 30,
          candidates: a.invitations_count || 0,
          completed: a.completed_count || 0,
          passed: a.passed_count || 0,
          inProgress: a.in_progress_count || 0,
          pending: a.pending_count || 0,
          average_score: a.average_score,
          pass_rate: a.pass_rate,
          created_at: a.created_at,
          published_at: a.published_at,
          hr_enabled: a.hr_enabled,
          technical_enabled: a.technical_enabled,
          coding_enabled: a.coding_enabled,
          proctoring_enabled: a.proctoring_enabled,
        };
      });

      setAssessments(mapped);
    } catch (error) {
      console.error('Failed to fetch assessments:', error);
      toast.error('Failed to load assessments');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateAssessment = () => {
    router.push(`/recruitment/assessments/create?jd_id=${jdId}`);
  };

  const handleViewResults = (assessment: any) => {
    router.push(`/recruitment/assessments/${assessment.id}/results`);
  };

  const handleViewDetails = (assessment: any) => {
    router.push(`/recruitment/assessments/${assessment.id}`);
  };

  const handleEdit = async (assessment: any) => {
    router.push(`/recruitment/assessments/${assessment.id}?edit=true`);
  };

  const handleDelete = async (assessment: any) => {
    if (!confirm(`Are you sure you want to delete "${assessment.title}"?`)) return;

    try {
      await assessmentService.delete(assessment.id);
      toast.success('Assessment deleted successfully');
      fetchAssessments();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete assessment');
    }
  };

  const handleArchive = async (assessment: any) => {
    try {
      // was assessmentService.updateStatus(...), which does not exist on the service -
      // every Archive click threw a TypeError and fell into the catch below, so the
      // button only ever showed "Failed to archive assessment". update() is the real
      // method and AssessmentUpdate already accepts status: 'archived'.
      await assessmentService.update(assessment.id, { status: 'archived' });
      toast.success('Assessment archived');
      fetchAssessments();
    } catch (error) {
      toast.error('Failed to archive assessment');
    }
  };

  const handlePublish = async (assessment: any) => {
    try {
      await assessmentService.publish(assessment.id);
      toast.success('Assessment published');
      fetchAssessments();
    } catch (error) {
      toast.error('Failed to publish assessment');
    }
  };

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { bg: string; text: string; label: string; ring: string }> = {
      published: { bg: 'bg-green-100', text: 'text-green-700', label: 'Published', ring: 'ring-green-200' },
      draft: { bg: 'bg-brand-orange/10', text: 'text-brand-orange-deep', label: 'Draft', ring: 'ring-brand-orange/20' },
      closed: { bg: 'bg-brand-blue/10', text: 'text-brand-blue', label: 'Closed', ring: 'ring-brand-blue/20' },
      archived: { bg: 'bg-slate-100', text: 'text-gray-500', label: 'Archived', ring: 'ring-gray-200' },
    };
    const config = configs[status] || configs.draft;
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ring-1 ${config.bg} ${config.text} ${config.ring}`}>
        {config.label}
      </span>
    );
  };

  const filteredAssessments = assessments.filter((a) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'active') return a.status === 'published';
    if (activeTab === 'draft') return a.status === 'draft';
    if (activeTab === 'archived') return a.status === 'archived';
    return true;
  });

  const stats = {
    total: assessments.length,
    active: assessments.filter((a) => a.status === 'published').length,
    draft: assessments.filter((a) => a.status === 'draft').length,
    archived: assessments.filter((a) => a.status === 'archived').length,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 tf-loader-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-blue" />
        <span className="ml-3 text-gray-600">Loading assessments...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-brand-blue" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 tracking-tight">Assessment Results</h2>
            <p className="text-sm text-gray-500 mt-1">
              {jdTitle ? `Assessments for "${jdTitle}"` : 'Assessments for this job'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded transition-colors ${
                viewMode === 'list' ? 'bg-white text-brand-blue shadow-sm shadow-brand-blue/10 ring-1 ring-brand-blue/15' : 'hover:text-brand-blue'
              }`}
              aria-label="List View" title="List View"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded transition-colors ${
                viewMode === 'grid' ? 'bg-white text-brand-blue shadow-sm shadow-brand-blue/10 ring-1 ring-brand-blue/15' : 'hover:text-brand-blue'
              }`}
              aria-label="Grid View" title="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>

          {/* Create Assessment Button */}
          {canCreateAssessments && assessmentAvailable && (
            <button
              onClick={handleCreateAssessment}
              className="flex items-center gap-2 px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg text-sm font-medium transition-all shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
            >
              <Plus className="w-4 h-4" />
              Create Assessment
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-100">
        {[
          { id: 'all', label: 'All', count: stats.total },
          { id: 'active', label: 'Active', count: stats.active },
          { id: 'draft', label: 'Draft', count: stats.draft },
          { id: 'archived', label: 'Archived', count: stats.archived },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'text-brand-blue border-brand-blue'
                : 'text-gray-600 border-transparent hover:text-brand-blue'
            }`}
          >
            {tab.label}
            <span className={`px-2 py-0.5 rounded-full text-xs ring-1 ${
              activeTab === tab.id
                ? 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20'
                : 'bg-slate-100 text-gray-600 ring-gray-200'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Empty State */}
      {filteredAssessments.length === 0 && (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
          <div className="w-20 h-20 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center mx-auto mb-4">
            <ClipboardList className="w-10 h-10 text-brand-blue" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2 tracking-tight">
            {activeTab === 'all' ? 'No assessments yet' : `No ${activeTab} assessments`}
          </h3>
          <p className="text-gray-500 mb-4">
            {canCreateAssessments
              ? 'Create an assessment to start testing candidates for this job'
              : 'Assessments will appear here once created'}
          </p>
          {canCreateAssessments && assessmentAvailable && activeTab !== 'archived' && (
            <button
              onClick={handleCreateAssessment}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-all shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
            >
              <Plus className="w-4 h-4" />
              Create Assessment
            </button>
          )}
        </div>
      )}

      {/* Assessments List */}
      {filteredAssessments.length > 0 && (
        <>
          {viewMode === 'list' ? (
            <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden tf-table-shell">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Assessment
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Candidates
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Pass Rate
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Avg Score
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredAssessments.map((assessment) => (
                    <tr key={assessment.id} className="hover:bg-brand-blue/5 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0 w-10 h-10 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-xl flex items-center justify-center">
                            <ClipboardList className="w-5 h-5 text-brand-blue" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {stripVersionFromTitle(assessment.title)}
                              </p>
                              {assessment.version > 1 && <VersionBadge version={assessment.version} />}
                            </div>
                            <p className="text-xs text-gray-500">{assessment.short_id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {getStatusBadge(assessment.status)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm">
                          <Users className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-900">{assessment.candidates}</span>
                          <span className="text-gray-500">
                            ({assessment.completed} completed)
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm">
                          {assessment.completed > 0 ? (
                            <span className="text-gray-900 font-medium">
                              {((assessment.passed / assessment.completed) * 100).toFixed(0)}%
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm">
                          {assessment.average_score != null ? (
                            <span className="text-gray-900 font-medium">
                              {Math.round(assessment.average_score)}%
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-500">
                          {formatISTDate(assessment.created_at)}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleViewResults(assessment)}
                            className="p-2 text-gray-600 hover:bg-brand-blue/5 hover:text-brand-blue rounded-lg transition-colors"
                            aria-label="View Results" title="View Results"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <div className="relative">
                            <button
                              onClick={() => setOpenMenuId(openMenuId === assessment.id ? null : assessment.id)}
                              className="p-2 text-gray-600 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                            {openMenuId === assessment.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-10"
                                  onClick={() => setOpenMenuId(null)}
                                />
                                <div className="absolute right-0 mt-2 w-44 sm:w-48 bg-white rounded-lg shadow-xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] py-1 z-20 max-h-[70dvh] overflow-y-auto">
                                  <button
                                    onClick={() => {
                                      handleViewDetails(assessment);
                                      setOpenMenuId(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue transition-colors"
                                  >
                                    <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                                    View Details
                                  </button>
                                  {assessment.status === 'draft' && (
                                    <button
                                      onClick={() => {
                                        handlePublish(assessment);
                                        setOpenMenuId(null);
                                      }}
                                      className="w-full flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue transition-colors"
                                    >
                                      <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                                      Publish
                                    </button>
                                  )}
                                  <button
                                    onClick={() => {
                                      handleEdit(assessment);
                                      setOpenMenuId(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue transition-colors"
                                  >
                                    <Edit2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                                    Edit
                                  </button>
                                  {assessment.status !== 'archived' && (
                                    <button
                                      onClick={() => {
                                        handleArchive(assessment);
                                        setOpenMenuId(null);
                                      }}
                                      className="w-full flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue transition-colors"
                                    >
                                      <Archive className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                                      Archive
                                    </button>
                                  )}
                                  {(() => {
                                    const hasCandidates = assessment.invitations_count > 0;
                                    return (
                                      <button
                                        onClick={() => {
                                          if (hasCandidates) {
                                            toast.error('Cannot delete — candidates have already been invited to this assessment');
                                            return;
                                          }
                                          handleDelete(assessment);
                                          setOpenMenuId(null);
                                        }}
                                        disabled={hasCandidates}
                                        title={hasCandidates ? 'Cannot delete — candidates have already been invited to this assessment' : ''}
                                        className={`w-full flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm ${
                                          hasCandidates
                                            ? 'text-gray-400 cursor-not-allowed opacity-60'
                                            : 'text-red-600 hover:bg-red-50'
                                        }`}
                                      >
                                        <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                                        Delete
                                      </button>
                                    );
                                  })()}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* Grid View */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredAssessments.map((assessment) => (
                <div
                  key={assessment.id}
                  className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] p-6 hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 transition-all shadow-sm shadow-brand-blue/5"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-semibold text-gray-900 truncate">
                          {stripVersionFromTitle(assessment.title)}
                        </h3>
                        {assessment.version > 1 && <VersionBadge version={assessment.version} />}
                      </div>
                      <p className="text-xs text-gray-500">{assessment.short_id}</p>
                    </div>
                    {getStatusBadge(assessment.status)}
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-brand-blue" />
                      <div>
                        <p className="text-xs text-gray-500">Candidates</p>
                        <p className="text-sm font-semibold text-gray-900">{assessment.candidates}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <div>
                        <p className="text-xs text-gray-500">Completed</p>
                        <p className="text-sm font-semibold text-gray-900">{assessment.completed}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-brand-cyan" />
                      <div>
                        <p className="text-xs text-gray-500">Pass Rate</p>
                        <p className="text-sm font-semibold text-gray-900">
                          {assessment.completed > 0
                            ? `${((assessment.passed / assessment.completed) * 100).toFixed(0)}%`
                            : '-'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-brand-orange" />
                      <div>
                        <p className="text-xs text-gray-500">Avg Score</p>
                        <p className="text-sm font-semibold text-gray-900">
                          {assessment.average_score != null
                            ? `${Math.round(assessment.average_score)}%`
                            : '-'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-4 border-t border-gray-100">
                    <button
                      onClick={() => handleViewResults(assessment)}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg text-sm transition-all shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
                    >
                      <Eye className="w-4 h-4" />
                      View Results
                    </button>
                    <div className="relative">
                      <button
                        onClick={() => setOpenMenuId(openMenuId === assessment.id ? null : assessment.id)}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {openMenuId === assessment.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setOpenMenuId(null)}
                          />
                          <div className="absolute right-0 bottom-full mb-2 w-48 bg-white rounded-lg shadow-xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] py-1 z-20">
                            <button
                              onClick={() => {
                                handleEdit(assessment);
                                setOpenMenuId(null);
                              }}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                              Edit
                            </button>
                            {assessment.status !== 'archived' && (
                              <button
                                onClick={() => {
                                  handleArchive(assessment);
                                  setOpenMenuId(null);
                                }}
                                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue transition-colors"
                              >
                                <Archive className="w-4 h-4" />
                                Archive
                              </button>
                            )}
                            {(() => {
                              const hasCandidates = assessment.invitations_count > 0;
                              return (
                                <button
                                  onClick={() => {
                                    if (hasCandidates) {
                                      toast.error('Cannot delete — candidates have already been invited to this assessment');
                                      return;
                                    }
                                    handleDelete(assessment);
                                    setOpenMenuId(null);
                                  }}
                                  disabled={hasCandidates}
                                  title={hasCandidates ? 'Cannot delete — candidates have already been invited to this assessment' : ''}
                                  className={`w-full flex items-center gap-2 px-4 py-2 text-sm ${
                                    hasCandidates
                                      ? 'text-gray-400 cursor-not-allowed opacity-60'
                                      : 'text-red-600 hover:bg-red-50'
                                  }`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Delete
                                </button>
                              );
                            })()}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
