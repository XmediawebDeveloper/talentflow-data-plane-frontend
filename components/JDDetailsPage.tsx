'use client';

import { ArrowLeft, MapPin, Calendar, Clock, DollarSign, Briefcase, CheckCircle2, FileText, Users, Edit2, Archive, Loader2, Building2, GraduationCap, Award, User, History, ChevronDown, ChevronUp, Monitor } from 'lucide-react';
import { useState, useEffect, ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { jdService, JDResponse, JDVersion } from '@/lib/services/jdService';
import { toast } from 'sonner';

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

export default function JDDetailsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jdId = searchParams.get('id');

  const [jd, setJd] = useState<JDResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [versions, setVersions] = useState<JDVersion[]>([]);
  const [currentVersion, setCurrentVersion] = useState<number>(0);
  const [showVersionHistory, setShowVersionHistory] = useState(false);

  useEffect(() => {
    if (jdId) {
      fetchJD();
      fetchVersions();
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
    if (!dateString) return 'N/A';

    const date = new Date(dateString);

    // Check if date is valid
    if (isNaN(date.getTime())) return 'Invalid Date';

    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
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
                    <span className="capitalize">{jd.employment_type.replace('_', ' ')}</span>
                  </span>
                )}
                {jd.remote_type && (
                  <span className="flex items-center gap-1">
                    <Monitor className="w-4 h-4" />
                    <span className="capitalize">{jd.remote_type.replace('_', ' ')}</span>
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
              <div className="jd-content text-gray-700 text-sm leading-relaxed">
                {renderJDDescription(jd.description || '')}
              </div>
            </div>

            {/* Skills */}
            {((jd.must_have_skills && jd.must_have_skills.length > 0) || (jd.nice_to_have_skills && jd.nice_to_have_skills.length > 0)) && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Skills & Qualifications</h2>

                {jd.must_have_skills && jd.must_have_skills.length > 0 && (
                  <div className="mb-5">
                    <h3 className="text-sm font-medium text-gray-900 mb-3">Required Skills</h3>
                    <ul className="space-y-2 ml-1">
                      {jd.must_have_skills.map((skill, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                          <span className="text-gray-400 mt-0.5">•</span>
                          <span>{skill}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {jd.nice_to_have_skills && jd.nice_to_have_skills.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 mb-3">Preferred Skills</h3>
                    <ul className="space-y-2 ml-1">
                      {jd.nice_to_have_skills.map((skill, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                          <span className="text-gray-400 mt-0.5">•</span>
                          <span>{skill}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

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
                    <span className="text-gray-900 capitalize">{jd.employment_type.replace('_', ' ')}</span>
                  </div>
                )}
                {jd.remote_type && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-gray-600">
                      <Monitor className="w-4 h-4" />
                      Work Mode
                    </span>
                    <span className="text-gray-900 capitalize">{jd.remote_type.replace('_', ' ')}</span>
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
                      <span>{new Date(jd.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <span>{new Date(jd.created_at).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
                      })}</span>
                    </div>
                  </div>
                </div>
                {jd.published_at && (
                  <div>
                    <span className="text-gray-500 block mb-1">Published On</span>
                    <div className="text-gray-900 space-y-1">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <span>{new Date(jd.published_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gray-400" />
                        <span>{new Date(jd.published_at).toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true
                        })}</span>
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
                            {formatDate(version.published_at)}
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
      </div>
    </div>
  );
}
