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
  ClipboardList,
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
import { VersionPill } from '@/components/assessments/AllAssessmentsTable';
import { stripVersionFromTitle } from '@/lib/utils/assessmentUtils';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatScore } from '@/lib/utils/score';

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
    const map: Record<string, { variant: 'success' | 'info' | 'destructive' | 'muted'; label: string }> = {
      published: { variant: 'success', label: 'Published' },
      draft: { variant: 'info', label: 'Draft' },
      closed: { variant: 'muted', label: 'Closed' },
      archived: { variant: 'muted', label: 'Archived' },
    };
    const config = map[status] || map.draft;
    return <Badge variant={config.variant}>{config.label}</Badge>;
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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-44 max-w-full" />
              <Skeleton className="h-3.5 w-56 max-w-full" />
            </div>
          </div>
          <Skeleton className="h-10 w-44 rounded-lg" />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 sm:gap-4 border-b border-gray-100 overflow-x-auto scrollbar-hide">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-1.5 sm:gap-2 pb-2.5 sm:pb-3 shrink-0">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-5 w-6 rounded-full" />
            </div>
          ))}
        </div>

        {/* Assessments Table */}
        <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden tf-table-shell">
          <table className="w-full min-w-[880px]">
            <thead className="bg-slate-50 border-b border-gray-100">
              <tr>
                {['Assessment', 'Status', 'Candidates', 'Pass Rate', 'Avg Score', 'Created', 'Actions'].map((col, i) => (
                  <th key={col} className={`px-3 sm:px-4 py-2.5 sm:py-3 ${i === 6 ? 'text-right tf-sticky-col' : 'text-left'}`}>
                    <Skeleton className={`h-3 w-20 ${i === 6 ? 'ml-auto' : ''}`} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Array.from({ length: 7 }).map((_, r) => (
                <tr key={r}>
                  <td className="px-3 sm:px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="flex-shrink-0 w-10 h-10 rounded-xl" />
                      <div className="flex-1 min-w-0 space-y-2">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </div>
                  </td>
                  <td className="px-3 sm:px-4 py-3">
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </td>
                  <td className="px-3 sm:px-4 py-3">
                    <Skeleton className="h-4 w-28" />
                  </td>
                  <td className="px-3 sm:px-4 py-3">
                    <Skeleton className="h-4 w-10" />
                  </td>
                  <td className="px-3 sm:px-4 py-3">
                    <Skeleton className="h-4 w-10" />
                  </td>
                  <td className="px-3 sm:px-4 py-3">
                    <Skeleton className="h-4 w-20" />
                  </td>
                  <td className="px-3 sm:px-4 py-3 tf-sticky-col">
                    <div className="flex items-center justify-end gap-2">
                      <Skeleton className="h-8 w-8 rounded-md" />
                      <Skeleton className="h-8 w-8 rounded-md" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-brand-blue" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight truncate">Assessment Results</h2>
            <p className="text-xs sm:text-sm text-gray-500 mt-1 truncate">
              {jdTitle ? `Assessments for "${jdTitle}"` : 'Assessments for this job'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Create Assessment Button */}
          {canCreateAssessments && assessmentAvailable && (
            <Button variant="primary" size="md" onClick={handleCreateAssessment} icon={<Plus className="w-4 h-4" />}>
              Create Assessment
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 sm:gap-4 border-b border-gray-100 overflow-x-auto scrollbar-hide">
        {[
          { id: 'all', label: 'All', count: stats.total },
          { id: 'active', label: 'Active', count: stats.active },
          { id: 'draft', label: 'Draft', count: stats.draft },
          { id: 'archived', label: 'Archived', count: stats.archived },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`pb-2.5 sm:pb-3 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap flex items-center gap-1.5 sm:gap-2 shrink-0 transition-colors ${
              activeTab === tab.id
                ? 'text-brand-blue border-brand-blue'
                : 'text-gray-600 border-transparent hover:text-brand-blue'
            }`}
          >
            {tab.label}
            <span className={`inline-flex items-center shrink-0 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ring-1 ${
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
            <Button variant="primary" size="md" onClick={handleCreateAssessment} icon={<Plus className="w-4 h-4" />}>
              Create Assessment
            </Button>
          )}
        </div>
      )}

      {/* Assessments List */}
      {filteredAssessments.length > 0 && (
        <>
            <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden tf-table-shell">
              <table className="w-full min-w-[880px]">
                <thead className="bg-slate-50 border-b border-gray-100">
                  <tr>
                    <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      Assessment
                    </th>
                    <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      Status
                    </th>
                    <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      Candidates
                    </th>
                    <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      Pass Rate
                    </th>
                    <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      Avg Score
                    </th>
                    <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      Created
                    </th>
                    <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap tf-sticky-col">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredAssessments.map((assessment) => (
                    <tr key={assessment.id} className="hover:bg-brand-blue/5 transition-colors">
                      <td className="px-3 sm:px-4 py-3 max-w-[320px]">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex-shrink-0 w-10 h-10 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-xl flex items-center justify-center">
                            <ClipboardList className="w-5 h-5 text-brand-blue" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <p className="min-w-0 text-sm font-medium text-gray-900 truncate" title={stripVersionFromTitle(assessment.title)}>
                                {stripVersionFromTitle(assessment.title)}
                              </p>
                              {assessment.version > 1 && <VersionPill kind="assessment" version={assessment.version} />}
                            </div>
                            <p className="text-xs text-gray-500 truncate">{assessment.short_id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 sm:px-4 py-3 whitespace-nowrap">
                        {getStatusBadge(assessment.status)}
                      </td>
                      <td className="px-3 sm:px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-sm whitespace-nowrap">
                          <Users className="w-4 h-4 text-gray-400 shrink-0" />
                          <span className="text-gray-900">{assessment.candidates}</span>
                          <span className="text-gray-500">
                            ({assessment.completed} completed)
                          </span>
                        </div>
                      </td>
                      <td className="px-3 sm:px-4 py-3 whitespace-nowrap">
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
                      <td className="px-3 sm:px-4 py-3 whitespace-nowrap">
                        <div className="text-sm">
                          {assessment.average_score != null ? (
                            <span className="text-gray-900 font-medium">
                              {formatScore(assessment.average_score)}%
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 sm:px-4 py-3 whitespace-nowrap">
                        <div className="text-sm text-gray-500 whitespace-nowrap">
                          {formatISTDate(assessment.created_at)}
                        </div>
                      </td>
                      <td className="px-3 sm:px-4 py-3 text-right tf-sticky-col">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleViewResults(assessment)}
                            aria-label="View Results" title="View Results"
                            className="h-8 w-8 px-0 shrink-0"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <div className="relative">
                            <button
                              onClick={() => setOpenMenuId(openMenuId === assessment.id ? null : assessment.id)}
                              className="h-8 w-8 inline-flex items-center justify-center shrink-0 text-gray-600 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                            {openMenuId === assessment.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-10"
                                  onClick={() => setOpenMenuId(null)}
                                />
                                <div className="absolute right-0 mt-2 w-44 sm:w-48 max-w-[calc(100vw-1.5rem)] bg-white rounded-lg shadow-xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] py-1 z-20 max-h-[70dvh] overflow-y-auto">
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
                                            : 'text-destructive hover:bg-destructive-subtle'
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
        </>
      )}
    </div>
  );
}
