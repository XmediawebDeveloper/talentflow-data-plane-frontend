'use client';

import { ArrowLeft, MapPin, Calendar, Clock, DollarSign, Briefcase, CheckCircle2, FileText, Users, Edit2, Archive, Loader2, Building2, GraduationCap, Award } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { jdService, JDResponse } from '@/lib/services/jdService';
import { toast } from 'sonner';

export default function JDDetailsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jdId = searchParams.get('id');

  const [jd, setJd] = useState<JDResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (jdId) {
      fetchJD();
    }
  }, [jdId]);

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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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
              <div className="flex items-center gap-3 mb-2">
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
                {/* Location hidden for now */}
                {false && jd.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    {jd.location}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  Created {formatDate(jd.created_at)}
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
              <button
                onClick={() => router.push(`/recruitment/jd-creation?id=${jd.id}`)}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <Edit2 className="w-4 h-4" />
                Edit
              </button>
              {jd.status !== 'archived' && (
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

        <div className="grid grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="col-span-2 space-y-6">
            {/* Description */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Job Description</h2>
              <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
                {jd.description}
              </div>
            </div>

            {/* Skills */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Required Skills</h2>

              {jd.must_have_skills && jd.must_have_skills.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Must Have</h3>
                  <div className="flex flex-wrap gap-2">
                    {jd.must_have_skills.map((skill, i) => (
                      <span key={i} className="px-3 py-1 bg-red-50 text-red-700 rounded-full text-sm">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {jd.nice_to_have_skills && jd.nice_to_have_skills.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Nice to Have</h3>
                  <div className="flex flex-wrap gap-2">
                    {jd.nice_to_have_skills.map((skill, i) => (
                      <span key={i} className="px-3 py-1 bg-gray-50 text-gray-900 rounded-full text-sm">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
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
                      Type
                    </span>
                    <span className="text-gray-900 capitalize">{jd.employment_type.replace('_', ' ')}</span>
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
                      Salary
                    </span>
                    <span className="text-gray-900">
                      ${jd.salary_min?.toLocaleString() || 0} - ${jd.salary_max?.toLocaleString() || '∞'}
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
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">ID</span>
                  <span className="text-gray-900 font-mono text-xs">{jd.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Created</span>
                  <span className="text-gray-900">{formatDate(jd.created_at)}</span>
                </div>
                {jd.published_at && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Published</span>
                    <span className="text-gray-900">{formatDate(jd.published_at)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">Method</span>
                  <span className="text-gray-900 capitalize">{jd.creation_method?.replace('_', ' ') || 'Manual'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
