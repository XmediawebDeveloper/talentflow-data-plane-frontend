'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import AssessmentDetailsView from '@/components/AssessmentDetailsView';
import ShareAssessmentModal from '@/components/ShareAssessmentModal';
import AssessmentPreviewModal from '@/components/AssessmentPreviewModal';
import AssessmentEditModal from '@/components/AssessmentEditModal';
import { assessmentService } from '@/lib/services';
import FeatureGate from '@/components/shared/FeatureGate';
import { useAuth } from '@/lib/hooks/useAuth';

export default function AssessmentDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const assessmentId = params.id as string;
  const { isTenantAdmin, isRecruiter } = useAuth();
  const canInvite = isTenantAdmin || isRecruiter;

  const [assessment, setAssessment] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allAssessmentIds, setAllAssessmentIds] = useState<string[]>([]);

  useEffect(() => {
    const fetchAllIds = async () => {
      try {
        const probe: any = await assessmentService.list({ page_size: 1, page: 1 });
        const probeItems: any[] = Array.isArray(probe) ? probe : (probe.items ?? []);
        const total: number = (probe && typeof probe === 'object' && 'total' in probe ? probe.total : probeItems.length) ?? probeItems.length;
        const res: any = total > 0
          ? await assessmentService.list({ page_size: total, page: 1 })
          : probe;
        const items: any[] = Array.isArray(res) ? res : (res.items ?? []);
        setAllAssessmentIds(items.map((a: any) => a.id));
      } catch { /* ignore */ }
    };
    fetchAllIds();
  }, []);

  // Modal states
  const [showShareModal, setShowShareModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const fetchAssessment = async () => {
    try {
      setIsLoading(true);
      const response = await assessmentService.get(assessmentId);

      if (response) {
        // Map API response to the format expected by AssessmentDetailsView
        const rawStatus = (response.status || 'draft').toLowerCase();
        const mapped = {
          id: response.id,
          title: response.title,
          description: response.description,
          type: response.technical_enabled ? 'Technical' : response.hr_enabled ? 'Behavioral' : 'Aptitude',
          duration: `${response.duration_minutes} min`,
          duration_minutes: response.duration_minutes,
          questions: (response.hr_enabled ? 10 : 0) + (response.technical_enabled ? 10 : 0) + (response.coding_enabled ? 5 : 0),
          candidates: response.invitations_count || 0,
          invitations_count: response.invitations_count || 0,
          completed_count: response.completed_count || 0,
          passed_count: response.passed_count || 0,
          average_score: response.average_score,
          pass_rate: response.pass_rate,
          status: rawStatus === 'published' ? 'Active' : rawStatus === 'closed' ? 'Completed' : rawStatus === 'archived' ? 'Archived' : 'Draft',
          passRate: response.completed_count > 0 ? `${Math.round((response.passed_count / response.completed_count) * 100)}%` : 'N/A',
          created: response.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
          job: { title: response.jd_title || 'General Assessment', department: 'Engineering' },
          jd_id: response.jd_id,
          jd_title: response.jd_title,
          jd_short_id: response.jd_short_id,
          jd_version: response.jd_version,
          sequence_number: response.sequence_number,
          short_id: response.short_id,
          // Section configuration
          hr_enabled: response.hr_enabled,
          hr_percentage: response.hr_percentage,
          hr_topics: response.hr_topics,
          technical_enabled: response.technical_enabled,
          technical_percentage: response.technical_percentage,
          technical_topics: response.technical_topics,
          coding_enabled: response.coding_enabled,
          coding_percentage: response.coding_percentage,
          coding_topics: response.coding_topics,
          coding_languages: response.coding_languages,
          proctoring_enabled: response.proctoring_enabled,
          created_by_name: response.created_by_name,
          published_at: response.published_at,
          created_at: response.created_at,
          updated_at: response.updated_at,
          // JD-extracted metadata
          jd_experience_level: response.jd_experience_level,
          jd_complexity: response.jd_complexity,
          jd_primary_domain: response.jd_primary_domain,
          jd_skill_depth: response.jd_skill_depth || [],
          jd_nice_to_have_skills: (response as any).jd_nice_to_have_skills || [],
        };
        setAssessment(mapped);
      } else {
        setError('Assessment not found');
      }
    } catch (err: any) {
      console.error('[TalentFlow] Failed to fetch assessment:', err);
      setError(err.message || 'Failed to load assessment');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (assessmentId) {
      fetchAssessment();
    }
  }, [assessmentId]);

  const handleBack = () => {
    router.push('/recruitment/assessments');
  };

  const handleViewResults = () => {
    router.push(`/recruitment/assessments/${assessmentId}/results`);
  };

  const handleEditSave = async (updatedData: any) => {
    try {
      await assessmentService.update(assessmentId, updatedData);
      setShowEditModal(false);
      fetchAssessment(); // Refresh data
    } catch (err) {
      console.error('[TalentFlow] Failed to update assessment:', err);
    }
  };

  if (isLoading) {
    return (
      <main className="flex-1 overflow-x-hidden bg-slate-50">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-6 w-6 text-brand-blue animate-spin" />
              <span className="ml-3 text-sm text-gray-600 dark:text-slate-400">Loading assessment...</span>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (error || !assessment) {
    return (
      <main className="flex-1 overflow-x-hidden bg-slate-50">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
            <div className="flex flex-col items-center justify-center h-64 space-y-3">
              <div className="text-red-500 dark:text-red-400 text-base">{error || 'Assessment not found'}</div>
              <button
                onClick={handleBack}
                className="px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg text-sm transition-all shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
              >
                Back to Assessments
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <FeatureGate feature="assessment">
      <main className="flex-1 overflow-x-hidden bg-slate-50">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
        <AssessmentDetailsView
          assessment={assessment}
          onBack={handleBack}
          onEdit={() => setShowEditModal(true)}
          onPreview={() => setShowPreviewModal(true)}
          onShare={canInvite ? () => setShowShareModal(true) : undefined}
          onViewResults={handleViewResults}
          onRefresh={fetchAssessment}
          currentIndex={allAssessmentIds.indexOf(assessmentId)}
          totalCount={allAssessmentIds.length}
          onPrev={allAssessmentIds.indexOf(assessmentId) > 0
            ? () => router.replace(`/recruitment/assessments/${allAssessmentIds[allAssessmentIds.indexOf(assessmentId) - 1]}`)
            : undefined}
          onNext={allAssessmentIds.indexOf(assessmentId) >= 0 && allAssessmentIds.indexOf(assessmentId) < allAssessmentIds.length - 1
            ? () => router.replace(`/recruitment/assessments/${allAssessmentIds[allAssessmentIds.indexOf(assessmentId) + 1]}`)
            : undefined}
        />

        {/* Modals */}
        {showShareModal && (
          <ShareAssessmentModal
            isOpen={showShareModal}
            onClose={() => setShowShareModal(false)}
            assessment={assessment}
            inviteSource="Assessment"
          />
        )}

        {showPreviewModal && (
          <AssessmentPreviewModal
            isOpen={showPreviewModal}
            onClose={() => setShowPreviewModal(false)}
            assessment={assessment}
          />
        )}

        {showEditModal && (
          <AssessmentEditModal
            isOpen={showEditModal}
            onClose={() => setShowEditModal(false)}
            assessment={assessment}
            onSave={handleEditSave}
          />
        )}
          </div>
        </div>
      </main>
    </FeatureGate>
  );
}
