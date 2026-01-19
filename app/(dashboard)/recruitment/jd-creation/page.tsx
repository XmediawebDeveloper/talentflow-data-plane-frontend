'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import JDCreation from '@/components/JDCreation';
import { jdService, JDResponse } from '@/lib/services/jdService';

function JDCreationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jdId = searchParams.get('id');
  const stageFromUrl = searchParams.get('stage') as 'create' | 'extract' | 'review' | null;

  const [editingJD, setEditingJD] = useState<JDResponse | null>(null);
  const [loading, setLoading] = useState(!!jdId);

  useEffect(() => {
    if (jdId) {
      // Fetch the JD data to continue editing
      const fetchJD = async () => {
        try {
          const jd = await jdService.get(jdId);
          console.log('[TalentFlow] Loaded JD from database:', {
            id: jd.id,
            title: jd.title,
            creation_stage: jd.creation_stage,
            status: jd.status
          });
          setEditingJD(jd);
        } catch (error) {
          console.error('Failed to fetch JD:', error);
        } finally {
          setLoading(false);
        }
      };
      fetchJD();
    }
  }, [jdId]);

  const handleViewAllJobs = () => {
    router.push('/recruitment/job-openings');
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-800" />
        <span className="ml-3 text-gray-600">Loading job description...</span>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-64px)] overflow-hidden">
      <JDCreation
        onBack={handleViewAllJobs}
        editingJD={editingJD ? {
        id: editingJD.id,
        title: editingJD.title,
        description: editingJD.description,
        status: editingJD.status,  // Pass status to determine if draft or published
        creation_stage: stageFromUrl || editingJD.creation_stage || 'create',  // URL stage takes priority
        creation_method: editingJD.creation_method,
        ai_prompt: editingJD.ai_prompt,  // Original AI prompt for editing
        must_have_skills: editingJD.must_have_skills,
        nice_to_have_skills: editingJD.nice_to_have_skills,
        education_requirements: editingJD.education_requirements,
        experience_min: editingJD.experience_min,
        experience_max: editingJD.experience_max,
        industry_type: editingJD.industry_type,
        salary_min: editingJD.salary_min,
        salary_max: editingJD.salary_max,
        compensation_type: editingJD.compensation_type,
        employment_type: editingJD.employment_type,
        remote_type: editingJD.remote_type,
        assessment_guidance: editingJD.assessment_guidance,
        internal_comments: editingJD.internal_comments,
        must_have_comments: editingJD.must_have_comments,
        allow_overqualified: editingJD.allow_overqualified,
        locations: editingJD.locations?.map(loc => ({
          city: loc.city || '',
          radius_km: loc.radius_km,
          is_required: loc.is_required,
        })),
      } : null}
      />
    </div>
  );
}

export default function JDCreationPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-800" />
        <span className="ml-3 text-gray-600">Loading...</span>
      </div>
    }>
      <JDCreationContent />
    </Suspense>
  );
}
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import JDCreation from '@/components/JDCreation';
import { jdService, JDResponse } from '@/lib/services/jdService';

function JDCreationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jdId = searchParams.get('id');
  const stageFromUrl = searchParams.get('stage') as 'create' | 'extract' | 'review' | null;

  const [editingJD, setEditingJD] = useState<JDResponse | null>(null);
  const [loading, setLoading] = useState(!!jdId);

  useEffect(() => {
    if (jdId) {
      // Fetch the JD data to continue editing
      const fetchJD = async () => {
        try {
          const jd = await jdService.get(jdId);
          console.log('[TalentFlow] Loaded JD from database:', {
            id: jd.id,
            title: jd.title,
            creation_stage: jd.creation_stage,
            status: jd.status
          });
          setEditingJD(jd);
        } catch (error) {
          console.error('Failed to fetch JD:', error);
        } finally {
          setLoading(false);
        }
      };
      fetchJD();
    }
  }, [jdId]);

  const handleViewAllJobs = () => {
    router.push('/recruitment/job-openings');
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-800" />
        <span className="ml-3 text-gray-600">Loading job description...</span>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-64px)] overflow-hidden">
      <JDCreation
        onBack={handleViewAllJobs}
        editingJD={editingJD ? {
        id: editingJD.id,
        title: editingJD.title,
        description: editingJD.description,
        status: editingJD.status,  // Pass status to determine if draft or published
        creation_stage: stageFromUrl || editingJD.creation_stage || 'create',  // URL stage takes priority
        must_have_skills: editingJD.must_have_skills,
        nice_to_have_skills: editingJD.nice_to_have_skills,
        education_requirements: editingJD.education_requirements,
        experience_min: editingJD.experience_min,
        experience_max: editingJD.experience_max,
        industry_type: editingJD.industry_type,
        salary_min: editingJD.salary_min,
        salary_max: editingJD.salary_max,
        compensation_type: editingJD.compensation_type,
        employment_type: editingJD.employment_type,
        remote_type: editingJD.remote_type,
        assessment_guidance: editingJD.assessment_guidance,
        internal_comments: editingJD.internal_comments,
        must_have_comments: editingJD.must_have_comments,
        allow_overqualified: editingJD.allow_overqualified,
        locations: editingJD.locations?.map(loc => ({
          city: loc.city || '',
          radius_km: loc.radius_km,
          is_required: loc.is_required,
        })),
      } : null}
      />
    </div>
  );
}

export default function JDCreationPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-800" />
        <span className="ml-3 text-gray-600">Loading...</span>
      </div>
    }>
      <JDCreationContent />
    </Suspense>
  );
}
