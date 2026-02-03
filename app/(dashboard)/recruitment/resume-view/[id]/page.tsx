'use client'

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Download, Mail, Phone, MapPin, Briefcase, Calendar, Award,
  Languages, Star, Edit2, Trash2, Send, Building2, GraduationCap, Code,
  ChevronRight, ExternalLink, Linkedin, Globe, FileText, Clock, History,
  User, File, HardDrive, Loader2, Share2, Copy, Check, ChevronDown, ChevronUp,
  AlignLeft, Hash, X
} from 'lucide-react';

// Full Resume Content Component with better UI
function FullResumeContent({ text }: { text: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'formatted' | 'raw'>('formatted');

  // Parse text into sections
  const sections = useMemo(() => {
    const lines = text.split('\n');
    const result: { title: string; content: string[] }[] = [];
    let currentSection: { title: string; content: string[] } = { title: 'Overview', content: [] };

    // Common section headers in resumes
    const sectionHeaders = [
      'experience', 'work experience', 'employment', 'professional experience',
      'education', 'academic', 'qualifications',
      'skills', 'technical skills', 'core competencies', 'expertise',
      'summary', 'professional summary', 'objective', 'profile',
      'certifications', 'certificates', 'licenses',
      'projects', 'key projects',
      'achievements', 'accomplishments', 'awards',
      'languages', 'contact', 'personal', 'references'
    ];

    lines.forEach((line) => {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        if (currentSection.content.length > 0) {
          currentSection.content.push('');
        }
        return;
      }

      // Check if this line is a section header
      const lowerLine = trimmedLine.toLowerCase().replace(/[:\-_]/g, ' ').trim();
      const isHeader = sectionHeaders.some(header =>
        lowerLine === header ||
        lowerLine.startsWith(header + ' ') ||
        lowerLine.endsWith(' ' + header)
      );

      if (isHeader && trimmedLine.length < 50) {
        // Save previous section if it has content
        if (currentSection.content.length > 0 || currentSection.title !== 'Overview') {
          result.push(currentSection);
        }
        currentSection = { title: trimmedLine, content: [] };
      } else {
        currentSection.content.push(trimmedLine);
      }
    });

    // Add last section
    if (currentSection.content.length > 0) {
      result.push(currentSection);
    }

    return result.filter(s => s.content.some(c => c.trim()));
  }, [text]);

  // Stats
  const wordCount = text.split(/\s+/).filter(w => w).length;
  const charCount = text.length;
  const lineCount = text.split('\n').filter(l => l.trim()).length;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const maxHeight = isExpanded ? 'max-h-[2000px]' : 'max-h-96';

  return (
    <div className="bg-gray-50 border border-gray-300 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-100">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-gray-500" />
          <h3 className="text-lg font-semibold text-gray-800">Full Resume Content</h3>
          <div className="flex items-center gap-3 text-xs text-gray-500 ml-2">
            <span className="flex items-center gap-1">
              <Hash className="w-3 h-3" />
              {wordCount.toLocaleString()} words
            </span>
            <span>•</span>
            <span>{charCount.toLocaleString()} chars</span>
            <span>•</span>
            <span>{lineCount} lines</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Tab Toggle */}
          <div className="flex bg-gray-200 rounded-lg p-0.5">
            <button
              onClick={() => setActiveTab('formatted')}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                activeTab === 'formatted'
                  ? 'bg-white text-gray-800 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <AlignLeft className="w-3 h-3 inline mr-1" />
              Sections
            </button>
            <button
              onClick={() => setActiveTab('raw')}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                activeTab === 'raw'
                  ? 'bg-white text-gray-800 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <FileText className="w-3 h-3 inline mr-1" />
              Raw
            </button>
          </div>
          {/* Copy Button */}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors"
          >
            {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className={`${maxHeight} overflow-y-auto transition-all duration-300`}>
        {activeTab === 'formatted' ? (
          <div className="p-4 space-y-4">
            {sections.map((section, idx) => (
              <div key={idx} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                  <h4 className="font-medium text-gray-800 text-sm">{section.title}</h4>
                </div>
                <div className="p-4">
                  {section.content.map((line, lineIdx) => (
                    line ? (
                      <p key={lineIdx} className="text-sm text-gray-700 mb-2 last:mb-0 leading-relaxed">
                        {line}
                      </p>
                    ) : (
                      <div key={lineIdx} className="h-2" />
                    )
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4">
            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono leading-relaxed bg-white border border-gray-200 rounded-lg p-4">
              {text}
            </pre>
          </div>
        )}
      </div>

      {/* Expand/Collapse Button */}
      <div className="border-t border-gray-200 bg-gray-100 p-2">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-center gap-2 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition-colors"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-4 h-4" />
              Show Less
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" />
              Show More
            </>
          )}
        </button>
      </div>
    </div>
  );
}
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

  // Version selection state for Apply to Job
  const [showVersionSelectModal, setShowVersionSelectModal] = useState(false);
  const [selectedVersionForApply, setSelectedVersionForApply] = useState<string | null>(null);

  // Share modal state
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [shareSubject, setShareSubject] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  // Version changes visibility state
  const [expandedVersionId, setExpandedVersionId] = useState<string | null>(null);

  // Helper function to get version content summary
  const getVersionContent = (version: any) => {
    const content: { category: string; items: string[] }[] = [];

    // Skills
    if (version.skills && version.skills.length > 0) {
      content.push({ category: 'Skills', items: version.skills.slice(0, 10) });
    }

    // Technical Skills
    if (version.technicalSkills && version.technicalSkills.length > 0) {
      content.push({ category: 'Technical Skills', items: version.technicalSkills.slice(0, 10) });
    }

    // Job Title
    if (version.currentTitle) {
      content.push({ category: 'Job Title', items: [version.currentTitle] });
    }

    // Company
    if (version.currentCompany) {
      content.push({ category: 'Company', items: [version.currentCompany] });
    }

    // Location
    if (version.location) {
      content.push({ category: 'Location', items: [version.location] });
    }

    // Experience count
    if (version.experience && version.experience.length > 0) {
      content.push({ category: 'Experience', items: [`${version.experience.length} position(s)`] });
    }

    // Education count
    if (version.education && version.education.length > 0) {
      content.push({ category: 'Education', items: [`${version.education.length} entry(ies)`] });
    }

    // Certifications
    if (version.certifications && version.certifications.length > 0) {
      const certNames = version.certifications.map((c: any) => c.name || c).slice(0, 5);
      content.push({ category: 'Certifications', items: certNames });
    }

    return content.length > 0 ? content : null;
  };

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
    attachments: r.version_count || versionsData.length || 1,
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
      field: edu.field || '',
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
      version: v.version || 1,
      fileName: v.file_name,
      // Parsed content for comparison
      skills: v.skills || [],
      technicalSkills: v.technical_skills || [],
      experience: v.experience || [],
      education: v.education || [],
      certifications: v.certifications || [],
      currentTitle: v.current_title,
      currentCompany: v.current_company,
      location: v.location,
      professionalSummary: v.professional_summary,
    })),
    versionCount: r.version_count || versionsData.length || 1,
    extractedText: r.extracted_text,
    // NEW FIELDS - Projects, Awards, etc.
    projects: r.projects || [],
    awards: r.awards || [],
    hobbies: r.hobbies || [],
    achievements: r.achievements || [],
    volunteerExperience: r.volunteer_experience || [],
    references: r.references || [],
    linkedinUrl: r.linkedin_url,
    githubUrl: r.github_url,
    portfolioUrl: r.portfolio_url,
    objective: r.objective,
    additionalInfo: r.additional_info,
  });

  const handleDownload = async () => {
    try {
      const blob = await resumeService.download(resumeId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = resume?.fileName || `resume-${resumeId}.${resume?.fileType || 'pdf'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error('Failed to download resume');
    }
  };

  const handleShare = () => {
    if (resume) {
      setShareSubject(`Resume: ${resume.name} - ${resume.title || 'Candidate'}`);
      setShareMessage(`Hi,

I'm sharing the resume of ${resume.name} for your review.

Candidate Details:
- Name: ${resume.name}
- Title: ${resume.title || 'N/A'}
- Experience: ${resume.experience || 'N/A'}
- Location: ${resume.location || 'N/A'}
- Skills: ${resume.skills?.slice(0, 5).join(', ') || 'N/A'}

You can view the full resume at: ${window.location.href}

Best regards`);
      setIsShareModalOpen(true);
    }
  };

  const handleSendEmail = async () => {
    if (!shareEmail.trim()) {
      toast.error('Please enter an email address');
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(shareEmail.trim())) {
      toast.error('Please enter a valid email address');
      return;
    }

    setIsSendingEmail(true);

    try {
      // Call API to send email
      const result = await resumeService.share(resumeId, shareEmail.trim(), shareMessage);

      if (result.success) {
        toast.success('Resume shared successfully');
        setIsShareModalOpen(false);
        setShareEmail('');
        setShareMessage('');
      } else {
        toast.error(result.message || 'Failed to send email');
      }
    } catch (error: any) {
      console.error('Failed to share resume:', error);
      toast.error(error?.message || 'Failed to send email');
    } finally {
      setIsSendingEmail(false);
    }
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
        industry_type: jd.industry_type,
        applicants: jd.applicants_count || 0,
        description: jd.description,
        skills: jd.skills || jd.must_have_skills || [],
        postedDate: jd.published_at || jd.created_at,
        postedBy: jd.created_by_name,
        employmentType: jd.employment_type,
        workMode: jd.remote_type,
        created_at: jd.created_at,
        updated_at: jd.updated_at,
        creation_method: jd.creation_method,
      }));
      setPublishedJobs(convertedJobs);
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
      toast.error('Failed to load jobs');
    }
  };

  const handleApplyToJob = async () => {
    // If resume has multiple versions, show version selection first
    if (resume && resume.versions && resume.versions.length > 1) {
      setSelectedVersionForApply(resumeId); // Default to current version
      setShowVersionSelectModal(true);
    } else {
      // No versions or single version - proceed directly to job selection
      await fetchPublishedJobs();
      setIsApplyToJobModalOpen(true);
    }
  };

  const handleVersionSelectForApply = async (versionId: string) => {
    setSelectedVersionForApply(versionId);
    setShowVersionSelectModal(false);
    await fetchPublishedJobs();
    setIsApplyToJobModalOpen(true);
  };

  // Handle applying resume to selected job (scoring) - using async Celery
  const handleApplyToJobSubmit = async (resumeIds: string[], jobIds: string[]) => {
    if (jobIds.length === 0 || resumeIds.length === 0) return;

    setIsApplyToJobModalOpen(false);

    const jobId = jobIds[0];
    // Use selected version if available, otherwise use current resume
    const resumeIdToScore = selectedVersionForApply || resumeId;

    try {
      // Start async bulk scoring via Celery
      const response = await scoringService.startBulkScoringAsync(jobId, [resumeIdToScore]);

      // Get candidate name for fallback display
      const resumeItems = [{
        resumeId: resumeIdToScore,
        candidateName: resume?.candidateName || resume?.candidate_name || resume?.name || 'Unknown',
      }];

      // Store batch info for the resume-scoring page to poll (including resume items for fallback)
      const scoringData = {
        batchId: response.batch_id,
        jobId: response.jd_id,
        jobTitle: response.jd_title,
        totalResumes: response.total_resumes,
        resumeItems: resumeItems,
      };
      sessionStorage.setItem('pendingScoringBatch', JSON.stringify(scoringData));

      // Navigate to resume scoring page to show progress
      router.push(`/recruitment/resume-scoring?batch_id=${response.batch_id}`);
    } catch (error: any) {
      console.error('Failed to start scoring:', error);

      if (error?.message?.includes('QUOTA') || error?.response?.status === 403) {
        toast.error('Resume scoring quota exhausted. Please upgrade your plan.');
      } else {
        toast.error(error.message || 'Failed to start scoring');
      }
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-100 min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
        <span className="ml-3 text-gray-600">Loading resume...</span>
      </div>
    );
  }

  if (error || !resume) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-100 min-h-screen">
        <p className="text-gray-600 mb-4">{error || 'Resume not found'}</p>
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-gray-700 hover:text-gray-900"
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
        ? [{ degree: resume.education, field: '', school: '', location: resume.location || '', year: '', gpa: '', honors: '' }]
        : [],
    skills: {
      technical: (resume.technicalSkills || resume.skills || []),
      soft: resume.softSkills || []
    },
    certifications: (resume.certifications || []).filter(c => c.name),
    languages: (resume.languages || []).filter(l => l.name),
  };

  return (
    <div className="flex-1 bg-gray-100 min-h-screen">
      {/* Header */}
      <div className="bg-gray-200 border-b border-gray-300 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="text-gray-700 hover:bg-gray-300 p-2 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-400 rounded-lg flex items-center justify-center">
                <Briefcase className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-gray-800">Resume Details</h1>
                <p className="text-gray-600 text-sm">{resume.name}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="bg-gray-50 border-b border-gray-300 px-6 py-3 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 bg-gray-200 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
            <button
              onClick={handleShare}
              className="flex items-center gap-2 px-4 py-2 bg-gray-200 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm"
            >
              <Share2 className="w-4 h-4" />
              Share
            </button>
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 px-4 py-2 bg-gray-200 border border-gray-400 text-gray-600 rounded-lg hover:bg-gray-300 transition-colors text-sm"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
          <button
            onClick={handleApplyToJob}
            className="flex items-center gap-2 px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm shadow-sm"
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
          <div className="bg-gray-50 border border-gray-300 rounded-xl p-6 shadow-sm">
            <div className="flex items-start">
              <div className="flex-1">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">{resume.name || 'Unknown'}</h2>
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
                  {resume.email && resume.email !== 'No email' && (
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <Mail className="w-4 h-4 text-gray-500" />
                      <a href={`mailto:${resume.email}`} className="hover:text-gray-900">{resume.email}</a>
                    </div>
                  )}
                  {resume.phone && resume.phone !== 'No phone' && (
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <Phone className="w-4 h-4 text-gray-500" />
                      <a href={`tel:${resume.phone}`} className="hover:text-gray-900">{resume.phone}</a>
                    </div>
                  )}
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-2">
                  {resume.skills?.slice(0, 8).map((skill, index) => (
                    <span key={index} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs border border-gray-300">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Professional Summary */}
          {detailedResume.summary && (
            <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <Star className="w-5 h-5 text-gray-500" />
                <h3 className="text-lg font-semibold text-gray-800">Professional Summary</h3>
              </div>
              <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{detailedResume.summary}</p>
            </div>
          )}

          {/* Work Experience */}
          {detailedResume.experience.length > 0 && (
            <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-6">
                <Briefcase className="w-5 h-5 text-gray-500" />
                <h3 className="text-lg font-semibold text-gray-800">Work Experience</h3>
              </div>
              <div className="space-y-6">
                {detailedResume.experience.map((exp, index) => (
                  <div key={index} className="relative pl-6 pb-6 border-l-2 border-gray-400 last:pb-0">
                    <div className="absolute -left-2 top-0 w-4 h-4 rounded-full bg-gray-500 border-2 border-gray-50"></div>
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
                              <span className="text-gray-600">({exp.duration})</span>
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
                              <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
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
            <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-6">
                <GraduationCap className="w-5 h-5 text-gray-500" />
                <h3 className="text-lg font-semibold text-gray-800">Education</h3>
              </div>
              <div className="space-y-4">
                {detailedResume.education.map((edu, index) => (
                  <div key={index} className="p-4 bg-gray-100 border border-gray-300 rounded-lg">
                    <h4 className="font-semibold text-gray-800 mb-1">
                      {edu.degree}
                      {edu.field && ` in ${edu.field}`}
                    </h4>
                    {edu.school && <div className="text-gray-700 mb-1">{edu.school}</div>}
                    {edu.institution && !edu.school && <div className="text-gray-700 mb-1">{edu.institution}</div>}
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      {edu.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {edu.location}
                        </span>
                      )}
                      {(edu.year || edu.graduation_year) && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {edu.year || edu.graduation_year}
                        </span>
                      )}
                      {edu.gpa && (
                        <span className="text-gray-700">GPA: {edu.gpa}</span>
                      )}
                      {edu.honors && (
                        <span className="px-2 py-0.5 bg-gray-500 text-white rounded text-xs">
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
            <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-6">
                <Code className="w-5 h-5 text-gray-500" />
                <h3 className="text-lg font-semibold text-gray-800">Skills</h3>
              </div>

              {/* Technical Skills */}
              {detailedResume.skills.technical.length > 0 && (
                <div className="mb-6">
                  <h4 className="font-medium text-gray-900 mb-4">Technical Skills</h4>
                  <div className="flex flex-wrap gap-2">
                    {detailedResume.skills.technical.map((skill, index) => (
                      <span key={index} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm border border-gray-300">
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
                      <span key={index} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm border border-gray-300">
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
            <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-6">
                <Award className="w-5 h-5 text-gray-500" />
                <h3 className="text-lg font-semibold text-gray-800">Certifications</h3>
              </div>
              <div className="space-y-4">
                {detailedResume.certifications.map((cert, index) => (
                  <div key={index} className="p-4 bg-gray-100 border border-gray-300 rounded-lg">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold text-gray-800 mb-1">{cert.name}</h4>
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
                      <Award className="w-6 h-6 text-gray-500" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Languages */}
          {detailedResume.languages.length > 0 && (
            <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-6">
                <Languages className="w-5 h-5 text-gray-500" />
                <h3 className="text-lg font-semibold text-gray-800">Languages</h3>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {detailedResume.languages.map((lang, index) => (
                  <div key={index} className="p-4 bg-gray-100 border border-gray-300 rounded-lg text-center">
                    <div className="font-medium text-gray-800 mb-1">{lang.name}</div>
                    <div className="text-sm text-gray-600">{lang.proficiency}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Projects */}
          {resume.projects && resume.projects.length > 0 && (
            <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-6">
                <Code className="w-5 h-5 text-gray-500" />
                <h3 className="text-lg font-semibold text-gray-800">Projects</h3>
              </div>
              <div className="space-y-4">
                {resume.projects.map((project: any, index: number) => (
                  <div key={index} className="p-4 bg-gray-100 border border-gray-300 rounded-lg">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-semibold text-gray-800">{project.name}</h4>
                      {project.url && (
                        <a href={project.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                    {project.description && (
                      <p className="text-gray-700 text-sm mb-2">{project.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                      {project.duration && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {project.duration}
                        </span>
                      )}
                      {project.technologies && (
                        <span className="px-2 py-0.5 bg-gray-200 rounded">{project.technologies}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Awards */}
          {resume.awards && resume.awards.length > 0 && (
            <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-6">
                <Award className="w-5 h-5 text-yellow-500" />
                <h3 className="text-lg font-semibold text-gray-800">Awards & Honors</h3>
              </div>
              <div className="space-y-4">
                {resume.awards.map((award: any, index: number) => (
                  <div key={index} className="p-4 bg-gray-100 border border-gray-300 rounded-lg">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold text-gray-800 mb-1">{award.name}</h4>
                        {award.issuer && <div className="text-sm text-gray-700">{award.issuer}</div>}
                        {award.date && (
                          <div className="text-xs text-gray-600 flex items-center gap-1 mt-1">
                            <Calendar className="w-3 h-3" />
                            {award.date}
                          </div>
                        )}
                        {award.description && (
                          <p className="text-sm text-gray-600 mt-2">{award.description}</p>
                        )}
                      </div>
                      <Award className="w-6 h-6 text-yellow-500" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Achievements */}
          {resume.achievements && resume.achievements.length > 0 && (
            <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-6">
                <Star className="w-5 h-5 text-gray-500" />
                <h3 className="text-lg font-semibold text-gray-800">Achievements</h3>
              </div>
              <div className="space-y-2">
                {resume.achievements.map((achievement: string, index: number) => (
                  <div key={index} className="flex items-start gap-2 text-gray-700">
                    <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                    <span>{typeof achievement === 'string' ? achievement : achievement.description || achievement.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Volunteer Experience */}
          {resume.volunteerExperience && resume.volunteerExperience.length > 0 && (
            <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-6">
                <User className="w-5 h-5 text-gray-500" />
                <h3 className="text-lg font-semibold text-gray-800">Volunteer Experience</h3>
              </div>
              <div className="space-y-4">
                {resume.volunteerExperience.map((vol: any, index: number) => (
                  <div key={index} className="p-4 bg-gray-100 border border-gray-300 rounded-lg">
                    <h4 className="font-semibold text-gray-800 mb-1">{vol.role || vol.title}</h4>
                    {vol.organization && <div className="text-sm text-gray-700 mb-1">{vol.organization}</div>}
                    {vol.duration && (
                      <div className="text-xs text-gray-600 flex items-center gap-1 mb-2">
                        <Calendar className="w-3 h-3" />
                        {vol.duration}
                      </div>
                    )}
                    {vol.description && <p className="text-sm text-gray-600">{vol.description}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hobbies & Interests */}
          {resume.hobbies && resume.hobbies.length > 0 && (
            <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-6">
                <Star className="w-5 h-5 text-gray-500" />
                <h3 className="text-lg font-semibold text-gray-800">Hobbies & Interests</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {resume.hobbies.map((hobby: string, index: number) => (
                  <span key={index} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm border border-gray-300">
                    {typeof hobby === 'string' ? hobby : hobby.name || hobby}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Social Links */}
          {(resume.linkedinUrl || resume.githubUrl || resume.portfolioUrl) && (
            <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-6">
                <Globe className="w-5 h-5 text-gray-500" />
                <h3 className="text-lg font-semibold text-gray-800">Social & Portfolio Links</h3>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {resume.linkedinUrl && (
                  <a href={resume.linkedinUrl} target="_blank" rel="noopener noreferrer"
                     className="flex items-center gap-2 p-4 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
                    <Linkedin className="w-5 h-5 text-blue-600" />
                    <span className="text-blue-700 text-sm font-medium">LinkedIn</span>
                    <ExternalLink className="w-3 h-3 text-blue-500 ml-auto" />
                  </a>
                )}
                {resume.githubUrl && (
                  <a href={resume.githubUrl} target="_blank" rel="noopener noreferrer"
                     className="flex items-center gap-2 p-4 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 transition-colors">
                    <Code className="w-5 h-5 text-gray-700" />
                    <span className="text-gray-700 text-sm font-medium">GitHub</span>
                    <ExternalLink className="w-3 h-3 text-gray-500 ml-auto" />
                  </a>
                )}
                {resume.portfolioUrl && (
                  <a href={resume.portfolioUrl} target="_blank" rel="noopener noreferrer"
                     className="flex items-center gap-2 p-4 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors">
                    <Globe className="w-5 h-5 text-purple-600" />
                    <span className="text-purple-700 text-sm font-medium">Portfolio</span>
                    <ExternalLink className="w-3 h-3 text-purple-500 ml-auto" />
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Objective (if different from summary) */}
          {resume.objective && resume.objective !== resume.professionalSummary && (
            <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-5 h-5 text-gray-500" />
                <h3 className="text-lg font-semibold text-gray-800">Career Objective</h3>
              </div>
              <p className="text-gray-700 leading-relaxed">{resume.objective}</p>
            </div>
          )}

          {/* Additional Information */}
          {resume.additionalInfo && (
            <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-5 h-5 text-gray-500" />
                <h3 className="text-lg font-semibold text-gray-800">Additional Information</h3>
              </div>
              <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{resume.additionalInfo}</p>
            </div>
          )}

          {/* Full Resume Content - Hidden as per requirement, showing AI-extracted sections above instead */}
          {/* {resume.extractedText && (
            <FullResumeContent text={resume.extractedText} />
          )} */}

          {/* Version History */}
          {resume.versions && resume.versions.length > 0 && (
            <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-6">
                <History className="w-5 h-5 text-gray-500" />
                <h3 className="text-lg font-semibold text-gray-800">Version History</h3>
                <span className="px-2.5 py-0.5 bg-gray-300 text-gray-700 rounded-full text-xs">
                  {resume.versions.length} version{resume.versions.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="space-y-3">
                {(() => {
                  const sortedVersions = [...resume.versions].sort((a, b) => (b.version || 0) - (a.version || 0));
                  return sortedVersions.map((version, index) => {
                    const isLatest = index === 0;
                    const versionNumber = version.version || (resume.versions.length - index);
                    const content = getVersionContent(version);
                    const isExpanded = expandedVersionId === version.id;

                    return (
                      <div key={version.id} className={`rounded-lg border transition-all ${
                        isLatest
                          ? 'bg-blue-50 border-blue-300'
                          : 'bg-gray-100 border-gray-300'
                      }`}>
                        <div className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 flex-1">
                              <div className={`p-2 rounded-lg ${
                                isLatest ? 'bg-blue-100' : 'bg-gray-200'
                              }`}>
                                <FileText className={`w-4 h-4 ${
                                  isLatest ? 'text-blue-600' : 'text-gray-600'
                                }`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`text-sm font-semibold ${isLatest ? 'text-blue-800' : 'text-gray-800'}`}>
                                    Version {versionNumber}
                                  </span>
                                  {isLatest && (
                                    <span className="px-2 py-0.5 bg-blue-600 text-white rounded text-xs flex-shrink-0">
                                      Latest
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-gray-500 mb-1 truncate">{version.name}</div>
                                <div className="flex items-center gap-3 text-xs text-gray-600">
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {new Date(version.uploadDate + (version.uploadDate.includes('Z') ? '' : 'Z')).toLocaleString('en-IN', {
                                      timeZone: 'Asia/Kolkata',
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      hour12: true
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
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setExpandedVersionId(isExpanded ? null : version.id)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${
                                  isExpanded
                                    ? 'bg-gray-800 text-white'
                                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                }`}
                              >
                                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                {isExpanded ? 'Hide' : 'View'} Content
                              </button>
                              <button
                                onClick={async () => {
                                  try {
                                    const blob = await resumeService.downloadVersion(resumeId, version.id);
                                    const url = window.URL.createObjectURL(blob);
                                    const link = document.createElement('a');
                                    link.href = url;
                                    link.download = version.fileName || version.name || `resume-v${versionNumber}.pdf`;
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                    window.URL.revokeObjectURL(url);
                                  } catch (err) {
                                    toast.error('Failed to download version');
                                  }
                                }}
                                className={`p-2 rounded-md transition-colors ${
                                  isLatest
                                    ? 'text-blue-600 hover:bg-blue-100'
                                    : 'text-gray-600 hover:bg-gray-300'
                                }`}
                                title="Download this version"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Version Content - Expanded */}
                        {isExpanded && (
                          <div className={`px-4 pb-4 pt-2 border-t ${isLatest ? 'border-blue-200 bg-blue-50/50' : 'border-gray-200 bg-gray-50/50'}`}>
                            <div className="text-xs font-medium text-gray-700 mb-3 flex items-center gap-1">
                              <FileText className="w-3 h-3" />
                              Content in Version {versionNumber}
                            </div>
                            {content && content.length > 0 ? (
                              <div className="space-y-2">
                                {content.map((item, idx) => (
                                  <div key={idx} className="flex items-start gap-2">
                                    <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-gray-200 text-gray-700 min-w-[80px] text-center">
                                      {item.category}
                                    </span>
                                    <div className="flex-1 flex flex-wrap gap-1">
                                      {item.items.map((val, i) => (
                                        <span key={i} className={`text-xs px-2 py-0.5 rounded ${
                                          item.category === 'Skills' || item.category === 'Technical Skills'
                                            ? 'bg-blue-100 text-blue-700'
                                            : 'bg-gray-100 text-gray-700'
                                        }`}>
                                          {val}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-gray-500 italic">No parsed content available. Restart backend to enable.</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {/* File Properties */}
          <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
            <div className="flex items-center gap-2 mb-6">
              <File className="w-5 h-5 text-gray-500" />
              <h3 className="text-lg font-semibold text-gray-800">File Properties</h3>
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
                      {new Date(resume.uploadDate + (resume.uploadDate?.includes('Z') ? '' : 'Z')).toLocaleString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
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
                        ? new Date(resume.lastUpdated + (resume.lastUpdated?.includes('Z') ? '' : 'Z')).toLocaleString('en-IN', {
                            timeZone: 'Asia/Kolkata',
                            month: 'long',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true
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

        </div>
      </div>

      {/* Version Selection Modal for Apply to Job */}
      {showVersionSelectModal && resume && resume.versions && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-in">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center">
                  <History className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Select Resume Version</h2>
                  <p className="text-sm text-gray-600">Choose which version to apply for the job</p>
                </div>
              </div>
              <button
                onClick={() => setShowVersionSelectModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Version List */}
            <div className="p-6 max-h-96 overflow-y-auto">
              <div className="space-y-3">
                {/* Current Version */}
                <label
                  className={`block p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    selectedVersionForApply === resumeId
                      ? 'border-gray-800 bg-gray-50 ring-1 ring-gray-800'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="version"
                      checked={selectedVersionForApply === resumeId}
                      onChange={() => setSelectedVersionForApply(resumeId)}
                      className="w-4 h-4 text-gray-800 border-gray-300 focus:ring-gray-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <File className="w-4 h-4 text-gray-500" />
                        <span className="font-medium text-gray-900">{resume.fileName || 'Current Version'}</span>
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">Current</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {resume.uploadDate ? new Date(resume.uploadDate).toLocaleDateString() : 'N/A'}
                        </span>
                        {resume.fileSizeKb && (
                          <span className="flex items-center gap-1">
                            <HardDrive className="w-3 h-3" />
                            {resume.fileSizeKb} KB
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {resume.uploadedBy}
                        </span>
                      </div>
                    </div>
                  </div>
                </label>

                {/* Previous Versions */}
                {resume.versions.filter(v => v.id !== resumeId).map((version, index) => (
                  <label
                    key={version.id}
                    className={`block p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedVersionForApply === version.id
                        ? 'border-gray-800 bg-gray-50 ring-1 ring-gray-800'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="version"
                        checked={selectedVersionForApply === version.id}
                        onChange={() => setSelectedVersionForApply(version.id)}
                        className="w-4 h-4 text-gray-800 border-gray-300 focus:ring-gray-500"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <File className="w-4 h-4 text-gray-400" />
                          <span className="font-medium text-gray-700">Version {version.version || (resume.versions.length - index)}</span>
                          <span className="text-xs text-gray-500">({version.name})</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {version.uploadDate ? new Date(version.uploadDate).toLocaleDateString() : 'N/A'}
                          </span>
                          {version.size && (
                            <span className="flex items-center gap-1">
                              <HardDrive className="w-3 h-3" />
                              {version.size}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {version.uploadedBy}
                          </span>
                        </div>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setShowVersionSelectModal(false)}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => selectedVersionForApply && handleVersionSelectForApply(selectedVersionForApply)}
                disabled={!selectedVersionForApply}
                className="px-4 py-2 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                Continue to Job Selection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Apply to Job Modal */}
      {isApplyToJobModalOpen && resume && (
        <ApplyToJobModal
          resumes={[resume]}
          jobs={publishedJobs}
          onClose={() => {
            setIsApplyToJobModalOpen(false);
            setSelectedVersionForApply(null);
          }}
          onApply={handleApplyToJobSubmit}
        />
      )}

      {/* Share via Email Modal */}
      {isShareModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Mail className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Share Resume</h2>
                    <p className="text-sm text-gray-500">Send resume via email</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsShareModalOpen(false);
                    setShareEmail('');
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Email Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Recipient Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={shareEmail}
                    onChange={(e) => setShareEmail(e.target.value)}
                    placeholder="Enter email address"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  />
                </div>

                {/* Subject Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Subject
                  </label>
                  <input
                    type="text"
                    value={shareSubject}
                    onChange={(e) => setShareSubject(e.target.value)}
                    placeholder="Email subject"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  />
                </div>

                {/* Message Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Message
                  </label>
                  <textarea
                    value={shareMessage}
                    onChange={(e) => setShareMessage(e.target.value)}
                    placeholder="Enter your message"
                    rows={8}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all resize-none"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    setIsShareModalOpen(false);
                    setShareEmail('');
                  }}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendEmail}
                  disabled={isSendingEmail || !shareEmail.trim()}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSendingEmail ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Opening...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Send Email
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
