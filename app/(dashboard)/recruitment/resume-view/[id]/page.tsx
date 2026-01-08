'use client'

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Download, Mail, Phone, MapPin, Briefcase, Calendar, Award,
  Languages, Star, Edit2, Trash2, Send, Building2, GraduationCap, Code,
  ChevronRight, ExternalLink, Linkedin, Globe, FileText, Clock, History,
  User, File, HardDrive, Loader2, Share2
} from 'lucide-react';
import { Resume, Job } from '@/lib/types/types';
import { resumeService, Resume as ApiResume } from '@/lib/services/resumeService';
import { jdService } from '@/lib/services/jdService';
import { scoringService } from '@/lib/services/scoringService';
import ApplyToJobModal from '@/components/ApplyToJobModal';
import { toast } from 'sonner';

export default function ResumeViewPage() {
  const params = useParams();
  const router = useRouter();
  const resumeId = params.id as string;

  const [resume, setResume] = useState<Resume | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Apply to Job modal state
  const [isApplyToJobModalOpen, setIsApplyToJobModalOpen] = useState(false);
  const [publishedJobs, setPublishedJobs] = useState<Job[]>([]);

  useEffect(() => {
    if (resumeId) {
      fetchResume();
    }
  }, [resumeId]);

  const fetchResume = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch resume and versions in parallel
      const [r, versionsData] = await Promise.all([
        resumeService.get(resumeId),
        resumeService.getVersions(resumeId).catch(() => [])
      ]);
      const converted = convertApiResume(r, versionsData);
      setResume(converted);
    } catch (err: any) {
      console.error('Failed to fetch resume:', err);
      setError(err?.message || 'Failed to load resume');
      toast.error('Failed to load resume');
    } finally {
      setLoading(false);
    }
  };

  const convertApiResume = (r: ApiResume, versionsData: any[] = []): Resume => ({
    id: r.id,
    name: r.candidate_name || r.file_name?.replace(/\.[^/.]+$/, '') || 'Unknown',
    email: r.email || 'No email',
    phone: r.phone || 'No phone',
    title: r.current_title || 'N/A',
    experience: r.experience_years ? `${r.experience_years} years` : 'N/A',
    education: r.education?.[0]?.degree || 'N/A',
    location: r.location || 'N/A',
    skills: r.skills || [],
    source: (r.source === 'ai_match' ? 'TalentFlow' : 'Manual') as 'Manual' | 'TalentFlow',
    folderId: r.folder_id || '',
    uploadDate: r.created_at,
    attachments: r.file_name ? 1 : 0,
    uploadedBy: r.uploaded_by_name || 'Unknown',
    fileName: r.file_name,
    fileType: r.file_type,
    fileSizeKb: r.file_size_kb || undefined,
    currentCompany: r.current_company,
    previousCompany: r.previous_company,
    noticePeriod: r.notice_period,
    lastUpdated: r.updated_at,
    professionalSummary: r.professional_summary,
    technicalSkills: r.technical_skills,
    softSkills: r.soft_skills,
    educationDetails: r.education?.map((edu: any) => ({
      degree: edu.degree || '',
      school: edu.school || edu.institution || '',
      location: edu.location || '',
      year: edu.year || edu.graduation_year || '',
      gpa: edu.gpa || '',
      honors: edu.honors || '',
    })),
    experienceDetails: r.experience?.map((exp: any) => ({
      title: exp.title || exp.position || '',
      company: exp.company || '',
      location: exp.location || '',
      startDate: exp.start_date || '',
      endDate: exp.end_date || 'Present',
      duration: exp.duration || '',
      description: exp.description || '',
      achievements: exp.achievements || exp.responsibilities || [],
    })),
    certifications: r.certifications?.map((cert: any) => ({
      name: cert.name || cert.title || '',
      issuer: cert.issuer || cert.organization || '',
      date: cert.date || cert.issued_date || '',
      credentialId: cert.credential_id || cert.credentialId || '',
    })),
    languages: r.languages?.map((lang: any) => ({
      name: typeof lang === 'string' ? lang : (lang.name || lang.language || ''),
      proficiency: typeof lang === 'string' ? 'Fluent' : (lang.proficiency || lang.level || 'Fluent'),
    })),
    versions: versionsData.map((v: any) => ({
      id: v.id,
      name: v.file_name || v.name,
      uploadDate: v.created_at || v.upload_date,
      size: v.file_size_kb ? `${v.file_size_kb} KB` : 'Unknown',
      uploadedBy: v.uploaded_by_name || 'Unknown',
    })),
    versionCount: r.version_count || versionsData.length || 1,
  });

  const handleDownload = () => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
    window.open(`${apiUrl}/resumes/${resumeId}/download`, '_blank');
  };

  const handleShare = () => {
    toast.info('Share functionality coming soon');
  };

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this resume?')) {
      try {
        await resumeService.delete(resumeId);
        toast.success('Resume deleted');
        router.push('/recruitment/my-resumes');
      } catch (err) {
        toast.error('Failed to delete resume');
      }
    }
  };

  // Fetch published jobs for the Apply to Job modal
  const fetchPublishedJobs = async () => {
    try {
      const response = await jdService.list({ status: 'published', page_size: 100 });
      const convertedJobs: Job[] = response.items.map((jd: any) => ({
        id: jd.id,
        job_id: jd.job_id,
        title: jd.title || 'Untitled',
        status: 'Published' as const,
        location: jd.location || '',
        daysActive: jd.created_at ? Math.ceil((new Date().getTime() - new Date(jd.created_at).getTime()) / (1000 * 60 * 60 * 24)) : 0,
        requiredMatch: jd.required_match || 70,
        department: jd.department,
        applicants: jd.applicants_count || 0,
        description: jd.description,
        skills: jd.skills || jd.must_have_skills || [],
        postedDate: jd.created_at,
      }));
      setPublishedJobs(convertedJobs);
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
      toast.error('Failed to load jobs');
    }
  };

  const handleApplyToJob = async () => {
    await fetchPublishedJobs();
    setIsApplyToJobModalOpen(true);
  };

  // Handle applying resume to selected job (scoring)
  const handleApplyToJobSubmit = async (resumeIds: string[], jobIds: string[]) => {
    if (jobIds.length === 0 || resumeIds.length === 0) return;

    setIsApplyToJobModalOpen(false);

    const jobId = jobIds[0];
    const toastId = toast.loading('Scoring resume against job...');

    try {
      await scoringService.scoreResume(jobId, resumeId);

      toast.success('Resume scored successfully!', { id: toastId });

      // Navigate to the job's scored resumes page
      router.push(`/recruitment/job-details?id=${jobId}&tab=scored`);

    } catch (error: any) {
      console.error('Scoring error:', error);

      if (error?.message?.includes('QUOTA') || error?.response?.status === 403) {
        toast.error('Resume scoring quota exhausted. Please upgrade your plan.', { id: toastId });
      } else {
        toast.error('Failed to score resume. Please try again.', { id: toastId });
      }
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-gray-800" />
        <span className="ml-3 text-gray-600">Loading resume...</span>
      </div>
    );
  }

  if (error || !resume) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 min-h-screen">
        <p className="text-gray-600 mb-4">{error || 'Resume not found'}</p>
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-blue-600 hover:text-blue-700"
        >
          <ArrowLeft className="w-4 h-4" />
          Go Back
        </button>
      </div>
    );
  }

  // Use real data from resume object
  const detailedResume = {
    ...resume,
    summary: resume.professionalSummary || '',
    experience: resume.experienceDetails && resume.experienceDetails.length > 0
      ? resume.experienceDetails
      : [],
    education: resume.educationDetails && resume.educationDetails.length > 0
      ? resume.educationDetails
      : resume.education
        ? [{ degree: resume.education, school: '', location: resume.location || '', year: '', gpa: '', honors: '' }]
        : [],
    skills: {
      technical: (resume.technicalSkills || resume.skills || []),
      soft: resume.softSkills || []
    },
    certifications: (resume.certifications || []).filter(c => c.name),
    languages: (resume.languages || []).filter(l => l.name),
  };

  return (
    <div className="flex-1 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
                <Briefcase className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-white">Resume Details</h1>
                <p className="text-blue-100 text-sm">{resume.name}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
            <button
              onClick={handleShare}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
            >
              <Share2 className="w-4 h-4" />
              Share
            </button>
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors text-sm"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
          <button
            onClick={handleApplyToJob}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm shadow-md"
          >
            <Send className="w-4 h-4" />
            Apply to Job
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* Personal Info Card */}
          <div className="bg-white border-2 border-blue-200 rounded-xl p-6 shadow-lg">
            <div className="flex items-start gap-6">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-3xl flex-shrink-0">
                {resume.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">{resume.name}</h2>
                    <p className="text-xl text-gray-700 mb-3">{resume.title}</p>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      {resume.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-4 h-4" />
                          {resume.location}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Briefcase className="w-4 h-4" />
                        {resume.experience}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <div className="text-sm text-gray-500">Source</div>
                      <div className="text-lg font-medium text-gray-900">
                        {resume.source}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Contact Info */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Mail className="w-4 h-4 text-blue-600" />
                    <a href={`mailto:${resume.email}`} className="hover:text-blue-600">{resume.email}</a>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Phone className="w-4 h-4 text-blue-600" />
                    <a href={`tel:${resume.phone}`} className="hover:text-blue-600">{resume.phone}</a>
                  </div>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-2">
                  {resume.skills?.slice(0, 8).map((skill, index) => (
                    <span key={index} className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs border border-blue-200">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Professional Summary */}
          {detailedResume.summary && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <Star className="w-5 h-5 text-yellow-600" />
                <h3 className="text-lg font-semibold text-gray-900">Professional Summary</h3>
              </div>
              <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{detailedResume.summary}</p>
            </div>
          )}

          {/* Work Experience */}
          {detailedResume.experience.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-6">
                <Briefcase className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900">Work Experience</h3>
              </div>
              <div className="space-y-6">
                {detailedResume.experience.map((exp, index) => (
                  <div key={index} className="relative pl-6 pb-6 border-l-2 border-blue-200 last:pb-0">
                    <div className="absolute -left-2 top-0 w-4 h-4 rounded-full bg-blue-600 border-2 border-white"></div>
                    <div className="mb-3">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="font-semibold text-gray-900 mb-1">{exp.title}</h4>
                          <div className="flex items-center gap-2 text-gray-700 mb-1">
                            <Building2 className="w-4 h-4" />
                            <span>{exp.company}</span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            {exp.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {exp.location}
                              </span>
                            )}
                            {(exp.startDate || exp.endDate) && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {exp.startDate} - {exp.endDate}
                              </span>
                            )}
                            {exp.duration && (
                              <span className="text-blue-600">({exp.duration})</span>
                            )}
                          </div>
                        </div>
                      </div>
                      {exp.description && (
                        <p className="text-gray-700 mb-3">{exp.description}</p>
                      )}
                      {exp.achievements && exp.achievements.length > 0 && (
                        <div className="space-y-2">
                          {exp.achievements.map((achievement, achIndex) => (
                            <div key={achIndex} className="flex items-start gap-2 text-sm text-gray-700">
                              <ChevronRight className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                              <span>{achievement}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Education */}
          {detailedResume.education.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-6">
                <GraduationCap className="w-5 h-5 text-purple-600" />
                <h3 className="text-lg font-semibold text-gray-900">Education</h3>
              </div>
              <div className="space-y-4">
                {detailedResume.education.map((edu, index) => (
                  <div key={index} className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                    <h4 className="font-semibold text-gray-900 mb-2">{edu.degree}</h4>
                    {edu.school && <div className="text-gray-700 mb-1">{edu.school}</div>}
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      {edu.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {edu.location}
                        </span>
                      )}
                      {edu.year && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {edu.year}
                        </span>
                      )}
                      {edu.gpa && (
                        <span className="text-purple-700">GPA: {edu.gpa}</span>
                      )}
                      {edu.honors && (
                        <span className="px-2 py-0.5 bg-purple-600 text-white rounded text-xs">
                          {edu.honors}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Skills */}
          {(detailedResume.skills.technical.length > 0 || detailedResume.skills.soft.length > 0) && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-6">
                <Code className="w-5 h-5 text-green-600" />
                <h3 className="text-lg font-semibold text-gray-900">Skills</h3>
              </div>

              {/* Technical Skills */}
              {detailedResume.skills.technical.length > 0 && (
                <div className="mb-6">
                  <h4 className="font-medium text-gray-900 mb-4">Technical Skills</h4>
                  <div className="flex flex-wrap gap-2">
                    {detailedResume.skills.technical.map((skill, index) => (
                      <span key={index} className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm border border-blue-200">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Soft Skills */}
              {detailedResume.skills.soft.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-4">Soft Skills</h4>
                  <div className="flex flex-wrap gap-2">
                    {detailedResume.skills.soft.map((skill, index) => (
                      <span key={index} className="px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-sm border border-green-200">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Certifications */}
          {detailedResume.certifications.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-6">
                <Award className="w-5 h-5 text-yellow-600" />
                <h3 className="text-lg font-semibold text-gray-900">Certifications</h3>
              </div>
              <div className="space-y-4">
                {detailedResume.certifications.map((cert, index) => (
                  <div key={index} className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-1">{cert.name}</h4>
                        {cert.issuer && <div className="text-sm text-gray-700 mb-1">{cert.issuer}</div>}
                        <div className="flex items-center gap-4 text-xs text-gray-600">
                          {cert.date && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              Issued {cert.date}
                            </span>
                          )}
                          {cert.credentialId && <span>ID: {cert.credentialId}</span>}
                        </div>
                      </div>
                      <Award className="w-6 h-6 text-yellow-600" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Languages */}
          {detailedResume.languages.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-6">
                <Languages className="w-5 h-5 text-indigo-600" />
                <h3 className="text-lg font-semibold text-gray-900">Languages</h3>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {detailedResume.languages.map((lang, index) => (
                  <div key={index} className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg text-center">
                    <div className="font-medium text-gray-900 mb-1">{lang.name}</div>
                    <div className="text-sm text-indigo-700">{lang.proficiency}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Version History */}
          {resume.versions && resume.versions.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-6">
                <History className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900">Version History</h3>
                <span className="px-2.5 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">
                  {resume.versions.length} version{resume.versions.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="space-y-3">
                {resume.versions.sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime()).map((version, index) => (
                  <div key={version.id} className={`p-4 rounded-lg border-2 transition-all ${
                    index === 0
                      ? 'bg-blue-50 border-blue-200'
                      : 'bg-gray-50 border-gray-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <div className={`p-2 rounded-lg ${
                          index === 0 ? 'bg-blue-100' : 'bg-gray-100'
                        }`}>
                          <FileText className={`w-4 h-4 ${
                            index === 0 ? 'text-blue-600' : 'text-gray-600'
                          }`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-gray-900 truncate">{version.name}</span>
                            {index === 0 && (
                              <span className="px-2 py-0.5 bg-blue-600 text-white rounded text-xs flex-shrink-0">
                                Latest
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-600">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(version.uploadDate).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                            <span>•</span>
                            <span>{version.size}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {version.uploadedBy}
                            </span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
                          window.open(`${apiUrl}/resumes/${resumeId}/versions/${version.id}/download`, '_blank');
                        }}
                        className={`p-2 rounded-md transition-colors ${
                          index === 0
                            ? 'text-blue-600 hover:bg-blue-100'
                            : 'text-gray-600 hover:bg-gray-200'
                        }`}
                        title="Download this version"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* File Properties */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center gap-2 mb-6">
              <File className="w-5 h-5 text-gray-600" />
              <h3 className="text-lg font-semibold text-gray-900">File Properties</h3>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <FileText className="w-4 h-4 text-gray-600" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">File Name</div>
                    <div className="text-sm text-gray-900">{resume.fileName || `${resume.name.replace(' ', '_')}_Resume.pdf`}</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <HardDrive className="w-4 h-4 text-gray-600" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">File Size</div>
                    <div className="text-sm text-gray-900">
                      {resume.fileSizeKb ? `${resume.fileSizeKb} KB` :
                        (resume.versions && resume.versions.length > 0
                          ? resume.versions[0].size
                          : 'Unknown')}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <File className="w-4 h-4 text-gray-600" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">File Type</div>
                    <div className="text-sm text-gray-900">{resume.fileType?.toUpperCase() || 'PDF'} Document</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <Calendar className="w-4 h-4 text-gray-600" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Upload Date</div>
                    <div className="text-sm text-gray-900">
                      {new Date(resume.uploadDate).toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <Clock className="w-4 h-4 text-gray-600" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Last Modified</div>
                    <div className="text-sm text-gray-900">
                      {resume.lastUpdated
                        ? new Date(resume.lastUpdated).toLocaleDateString('en-US', {
                            month: 'long',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })
                        : 'Never'}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <User className="w-4 h-4 text-gray-600" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Uploaded By</div>
                    <div className="text-sm text-gray-900">
                      {resume.uploadedBy === 'current-user' ? 'You' : resume.uploadedBy}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <FileText className="w-4 h-4 text-gray-600" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Total Attachments</div>
                    <div className="text-sm text-gray-900">
                      {resume.attachments} file{resume.attachments !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <History className="w-4 h-4 text-gray-600" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Version Count</div>
                    <div className="text-sm text-gray-900">
                      {resume.versionCount || (resume.versions ? resume.versions.length : 1)} version{(resume.versionCount || (resume.versions ? resume.versions.length : 1)) !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Metadata Summary */}
          <div className="bg-gradient-to-r from-gray-50 to-blue-50 border-2 border-gray-300 rounded-lg p-4">
            <div className="grid grid-cols-4 gap-4 text-sm">
              <div className="text-center">
                <div className="text-xs text-gray-500 mb-1">Document ID</div>
                <div className="font-medium text-gray-900">#{resume.id.substring(0, 8).toUpperCase()}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-500 mb-1">Source</div>
                <div className="font-medium text-gray-900">{resume.source}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-500 mb-1">Folder</div>
                <div className="font-medium text-gray-900">{resume.folderId || 'Uncategorized'}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-500 mb-1">Status</div>
                <div className="inline-flex items-center px-2 py-1 bg-green-100 text-green-700 rounded text-xs">
                  Active
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Apply to Job Modal */}
      {isApplyToJobModalOpen && resume && (
        <ApplyToJobModal
          resumes={[resume]}
          jobs={publishedJobs}
          onClose={() => setIsApplyToJobModalOpen(false)}
          onApply={handleApplyToJobSubmit}
        />
      )}
    </div>
  );
}
