'use client'

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { formatIST, formatISTDate } from '@/lib/utils/dateUtils';
import {
  ArrowLeft, Download, Mail, Phone, MapPin, Briefcase, Calendar, Award,
  Languages, Star, Edit2, Trash2, Send, Building2, GraduationCap, Code,
  ChevronRight, ChevronLeft, ExternalLink, Linkedin, Globe, FileText, Clock, History,
  User, File, HardDrive, Loader2, Share2, Copy, Check, ChevronDown, ChevronUp,
  AlignLeft, Hash, X, Eye
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
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
import FeatureGate from '@/components/shared/FeatureGate';
import { useAuth } from '@/lib/hooks/useAuth';
import { usePlanFeatures } from '@/lib/hooks/usePlanFeature';
import PageBreadcrumb from '@/components/PageBreadcrumb';

export default function ResumeViewPage() {
  const params = useParams();
  const router = useRouter();
  const dialog = useGlobalDialog();
  const { isTenantAdmin, hasPermission, hasPermissionCode } = useAuth();
  const { hasPlanFeature } = usePlanFeatures();
  const resumeId = params.id as string;

  const [resume, setResume] = useState<Resume | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Prev/Next navigation from My Resumes list
  const [navList, setNavList] = useState<string[]>([]);
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('resumeNavList');
      if (stored) setNavList(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);
  const navIndex = navList.indexOf(resumeId);
  const prevId = navIndex > 0 ? navList[navIndex - 1] : null;
  const nextId = navIndex >= 0 && navIndex < navList.length - 1 ? navList[navIndex + 1] : null;

  // Which list the user opened this resume from, so the breadcrumb points back
  // to the right place ("My Resumes" vs "Internal Database"). The originating
  // list stores this in sessionStorage as `resumeNavSource`.
  const [viewSource, setViewSource] = useState<'my-resumes' | 'resume-database' | 'ai-talent-match' | 'job-details'>('resume-database');
  useEffect(() => {
    try {
      const s = sessionStorage.getItem('resumeNavSource');
      if (s === 'my-resumes' || s === 'resume-database' || s === 'ai-talent-match' || s === 'job-details') {
        setViewSource(s);
      }
    } catch { /* ignore */ }
  }, []);
  const sourceCrumb =
    viewSource === 'my-resumes' ? { label: 'My Resumes', href: '/recruitment/my-resumes' }
    : viewSource === 'ai-talent-match' ? { label: 'AI Talent Match', href: '/recruitment/ai-talent-match' }
    : viewSource === 'job-details' ? { label: 'Job Descriptions', href: '/recruitment/job-openings' }
    : { label: 'Internal Database', href: '/recruitment/resume-database' };

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

  // Version comparison state
  const [compareLeftId, setCompareLeftId] = useState<string | null>(null);
  const [compareRightId, setCompareRightId] = useState<string | null>(null);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareChecked, setCompareChecked] = useState<string[]>([]);
  const [compareViewMode, setCompareViewMode] = useState<'side-by-side' | 'unified'>('side-by-side');

  // Version preview state
  const [versionPreviewUrl, setVersionPreviewUrl] = useState<string | null>(null);
  const [versionPreviewLabel, setVersionPreviewLabel] = useState<string>('');

  const canShareResume = isTenantAdmin || hasPermissionCode('my_resumes:share');
  const canDeleteResume = isTenantAdmin || hasPermission('canDeleteResumes') || hasPermissionCode('my_resumes:delete');
  const canApplyResumeToJob =
    hasPlanFeature('resume_scoring') &&
    (isTenantAdmin || (hasPermission('canRunScoring') && hasPermissionCode('my_resumes:apply_job')));

  const handleCompareCheck = (versionId: string) => {
    setCompareChecked(prev => {
      if (prev.includes(versionId)) {
        return prev.filter(id => id !== versionId);
      }
      if (prev.length >= 2) {
        return [prev[1], versionId];
      }
      return [...prev, versionId];
    });
  };

  // Open compare modal - used by both "View Changes" (single version vs previous) and "Compare Selected" (2 checkboxes)
  const openCompareModal = (leftId?: string, rightId?: string) => {
    if (leftId && rightId && resume?.versions) {
      setCompareLeftId(leftId);
      setCompareRightId(rightId);
      setShowCompareModal(true);
    } else if (compareChecked.length === 2 && resume?.versions) {
      const sorted = [...resume.versions].sort((a, b) => (a.version || 0) - (b.version || 0));
      const v1 = sorted.find(v => v.id === compareChecked[0]);
      const v2 = sorted.find(v => v.id === compareChecked[1]);
      if (v1 && v2) {
        if ((v1.version || 0) <= (v2.version || 0)) {
          setCompareLeftId(v1.id);
          setCompareRightId(v2.id);
        } else {
          setCompareLeftId(v2.id);
          setCompareRightId(v1.id);
        }
      }
      setShowCompareModal(true);
    }
  };

  // State for fetched preview text (when extractedText not pre-loaded)
  const [fetchedPreviewText, setFetchedPreviewText] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Preview a specific version or resume in modal
  const handleVersionPreview = async (versionId: string, label: string) => {
    // Check if extracted text is already available
    const version = resume?.versions?.find(v => v.id === versionId);
    const existingText = version?.extractedText || (versionId === resumeId ? resume?.extractedText : null);

    if (existingText) {
      setFetchedPreviewText(null);
      setVersionPreviewLabel(label);
      setVersionPreviewUrl(versionId);
      return;
    }

    // Not available - fetch from API
    setPreviewLoading(true);
    setVersionPreviewLabel(label);
    try {
      const data = await resumeService.get(versionId);
      if (data?.extracted_text) {
        setFetchedPreviewText(data.extracted_text);
        setVersionPreviewUrl(versionId);
      } else {
        toast.info('Preview not available. Use the download button.');
      }
    } catch (err) {
      console.error('Failed to fetch preview text:', err);
      toast.error('Failed to load preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  // Build unified diff: interleave added/removed/unchanged lines preserving reading order
  const buildUnifiedDiff = (olderText: string, newerText: string) => {
    const normalize = (text: string) =>
      text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    const olderLines = normalize(olderText);
    const newerLines = normalize(newerText);

    if (!olderText && !newerText) return { lines: [] as { text: string; type: 'added' | 'removed' | 'unchanged' }[], addedCount: 0, removedCount: 0, unchangedCount: 0 };

    // Simple LCS-based diff for proper interleaving
    const olderLen = olderLines.length;
    const newerLen = newerLines.length;

    // Build LCS table
    const dp: number[][] = Array.from({ length: olderLen + 1 }, () => Array(newerLen + 1).fill(0));
    for (let i = 1; i <= olderLen; i++) {
      for (let j = 1; j <= newerLen; j++) {
        if (olderLines[i - 1] === newerLines[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Backtrack to build diff
    type DiffLine = { text: string; type: 'added' | 'removed' | 'unchanged' };
    const result: DiffLine[] = [];
    let i = olderLen, j = newerLen;

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && olderLines[i - 1] === newerLines[j - 1]) {
        result.unshift({ text: olderLines[i - 1], type: 'unchanged' });
        i--; j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        result.unshift({ text: newerLines[j - 1], type: 'added' });
        j--;
      } else {
        result.unshift({ text: olderLines[i - 1], type: 'removed' });
        i--;
      }
    }

    const addedCount = result.filter(l => l.type === 'added').length;
    const removedCount = result.filter(l => l.type === 'removed').length;
    const unchangedCount = result.filter(l => l.type === 'unchanged').length;

    return { lines: result, addedCount, removedCount, unchangedCount };
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

      // Fetch full details for each version to get extracted_text for comparison
      // This is needed because the versions endpoint doesn't return the full text
      let versionsWithFullData = versionsData;
      if (versionsData && versionsData.length > 0) {
        try {
          // Fetch full data for each version (limit to last 5 versions to avoid too many requests)
          const versionsToFetch = versionsData.slice(0, 5);
          const fullVersionsData = await Promise.all(
            versionsToFetch.map((v: any) =>
              resumeService.get(v.id).catch(() => v) // Fallback to original if fetch fails
            )
          );

          // Merge full data with original version data
          versionsWithFullData = versionsData.map((v: any, index: number) => {
            if (index < fullVersionsData.length && fullVersionsData[index]) {
              return {
                ...v,
                extracted_text: fullVersionsData[index].extracted_text,
                skills: fullVersionsData[index].skills || v.skills,
                technical_skills: fullVersionsData[index].technical_skills || v.technical_skills,
                experience: fullVersionsData[index].experience || v.experience,
                education: fullVersionsData[index].education || v.education,
                certifications: fullVersionsData[index].certifications || v.certifications,
                current_title: fullVersionsData[index].current_title || v.current_title,
                current_company: fullVersionsData[index].current_company || v.current_company,
                location: fullVersionsData[index].location || v.location,
                professional_summary: fullVersionsData[index].professional_summary || v.professional_summary,
              };
            }
            return v;
          });
        } catch (err) {
          console.warn('Failed to fetch full version data:', err);
          // Continue with original versions data
        }
      }

      const converted = convertApiResume(r, versionsWithFullData);
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
      // Full extracted text for line-by-line comparison
      extractedText: v.extracted_text || '',
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
    if (await dialog.confirm({ title: 'Delete Resume', message: 'Are you sure you want to delete this resume? This action cannot be undone.', variant: 'error', confirmText: 'Delete' })) {
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
      const response = await jdService.list({ status: 'published', page_size: 100, source: 'my-jds' });
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
      <div className="flex-1 flex items-center justify-center bg-slate-50 min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-brand-blue" />
        <span className="ml-3 text-gray-600">Loading resume...</span>
      </div>
    );
  }

  if (error || !resume) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 min-h-screen">
        <p className="text-gray-600 mb-4">{error || 'Resume not found'}</p>
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-brand-blue hover:text-brand-blue-2"
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
    <FeatureGate feature="resume_upload">
    <main className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full min-h-[calc(100vh-7rem)] bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
          <PageBreadcrumb
            className="mb-4 md:mb-6"
            items={[
              { label: 'Dashboard', href: '/dashboard' },
              sourceCrumb,
              { label: 'Resume Details' },
            ]}
          />
      {/* Header */}
      <div className="border-b border-gray-100 py-3 sm:py-4 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-brand-blue rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
              <Briefcase className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg lg:text-xl font-semibold text-gray-900 tracking-tight truncate">Resume Details</h1>
              <p className="text-xs sm:text-sm text-gray-600 truncate">{resume.name}</p>
            </div>
          </div>
          {navList.length > 0 && navIndex >= 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => prevId && router.replace(`/recruitment/resume-view/${prevId}`)}
                disabled={!prevId}
                className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <span className="text-sm text-gray-600 font-medium px-1">
                {navIndex + 1} / {navList.length}
              </span>
              <button
                onClick={() => nextId && router.replace(`/recruitment/resume-view/${nextId}`)}
                disabled={!nextId}
                className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Action Bar */}
      <div className="border-b border-gray-100 py-2.5 sm:py-3 mb-4 overflow-x-auto scrollbar-hide">
        <div className="flex items-center justify-between gap-3 min-w-max sm:min-w-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleVersionPreview(resumeId, resume?.name || 'Resume')}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors text-sm"
            >
              <Eye className="w-4 h-4" />
              View
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors text-sm"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
            {canShareResume && (
              <button
                onClick={handleShare}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors text-sm"
              >
                <Share2 className="w-4 h-4" />
                Share
              </button>
            )}
            {canDeleteResume && (
              <button
                onClick={handleDelete}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 hover:border-red-300 transition-colors text-sm"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            )}
          </div>
          {canApplyResumeToJob && (
            <button
              onClick={handleApplyToJob}
              className="flex items-center gap-2 px-6 py-2 bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white rounded-lg transition-all text-sm shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
            >
              <Send className="w-4 h-4" />
              Apply to Job
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div>
        <div className="space-y-6">

          {/* Personal Info Card */}
          <div className="bg-gradient-to-br from-brand-blue/5 via-white to-brand-cyan/5 border border-brand-blue/15 rounded-xl p-6 shadow-sm shadow-brand-blue/10 ring-1 ring-brand-blue/10">
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

              </div>
            </div>
          </div>

          {/* Professional Summary */}
          {detailedResume.summary && (
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                  <Star className="w-4 h-4 text-brand-blue" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Professional Summary</h3>
              </div>
              <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{detailedResume.summary}</p>
            </div>
          )}

          {/* Work Experience */}
          {detailedResume.experience.length > 0 && (
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                  <Briefcase className="w-4 h-4 text-brand-blue" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Work Experience</h3>
              </div>
              <div className="space-y-6">
                {detailedResume.experience.map((exp, index) => (
                  <div key={index} className="relative pl-6 pb-6 border-l-2 border-brand-blue/30 last:pb-0">
                    <div className="absolute -left-2 top-0 w-4 h-4 rounded-full bg-brand-blue border-2 border-white shadow-sm shadow-brand-blue/30"></div>
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
                        <div className="space-y-1.5 mb-3">
                          {exp.description
                            .split(/(?<=[.!?])\s+|\n+/)
                            .map((point: string) => point.trim())
                            .filter((point: string) => point.length > 0)
                            .map((point: string, pointIndex: number) => (
                              <div key={pointIndex} className="flex items-start gap-2 text-sm text-gray-700">
                                <ChevronRight className="w-4 h-4 text-brand-blue flex-shrink-0 mt-0.5" />
                                <span>{point}</span>
                              </div>
                            ))}
                        </div>
                      )}
                      {exp.achievements && exp.achievements.length > 0 && (
                        <div className="space-y-1.5">
                          {exp.achievements.map((achievement, achIndex) => (
                            <div key={achIndex} className="flex items-start gap-2 text-sm text-gray-700">
                              <ChevronRight className="w-4 h-4 text-brand-cyan flex-shrink-0 mt-0.5" />
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
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                  <GraduationCap className="w-4 h-4 text-brand-blue" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Education</h3>
              </div>
              <div className="space-y-4">
                {detailedResume.education.map((edu, index) => (
                  <div key={index} className="p-4 bg-slate-50 border border-gray-100 ring-1 ring-black/[0.02] rounded-lg">
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
                        <span className="px-2 py-0.5 bg-brand-blue text-white rounded text-xs shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
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
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                  <Code className="w-4 h-4 text-brand-blue" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Skills</h3>
              </div>

              {/* Technical Skills */}
              {detailedResume.skills.technical.length > 0 && (
                <div className="mb-6">
                  <h4 className="font-medium text-gray-900 mb-4">Technical Skills</h4>
                  <div className="flex flex-wrap gap-2">
                    {detailedResume.skills.technical.map((skill, index) => (
                      <span key={index} className="px-3 py-1.5 bg-brand-blue/5 text-brand-blue rounded-lg text-sm ring-1 ring-brand-blue/20">
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
                      <span key={index} className="px-3 py-1.5 bg-brand-blue/5 text-brand-blue rounded-lg text-sm ring-1 ring-brand-blue/20">
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
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-9 h-9 rounded-lg bg-brand-orange/10 ring-1 ring-brand-orange/15 flex items-center justify-center">
                  <Award className="w-4 h-4 text-brand-orange" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Certifications</h3>
              </div>
              <div className="space-y-4">
                {detailedResume.certifications.map((cert, index) => (
                  <div key={index} className="p-4 bg-slate-50 border border-gray-100 ring-1 ring-black/[0.02] rounded-lg">
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
                      <Award className="w-6 h-6 text-brand-orange" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Languages */}
          {detailedResume.languages.length > 0 && (
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-9 h-9 rounded-lg bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center">
                  <Languages className="w-4 h-4 text-brand-cyan" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Languages</h3>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {detailedResume.languages.map((lang, index) => (
                  <div key={index} className="p-4 bg-slate-50 border border-gray-100 ring-1 ring-black/[0.02] rounded-lg text-center">
                    <div className="font-medium text-gray-900 mb-1">{lang.name}</div>
                    <div className="text-sm text-gray-600">{lang.proficiency}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Projects */}
          {resume.projects && resume.projects.length > 0 && (
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                  <Code className="w-4 h-4 text-brand-blue" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Projects</h3>
              </div>
              <div className="space-y-4">
                {resume.projects.map((project: any, index: number) => (
                  <div key={index} className="p-4 bg-slate-50 border border-gray-100 ring-1 ring-black/[0.02] rounded-lg">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-semibold text-gray-900">{project.name}</h4>
                      {project.url && (
                        <a href={project.url} target="_blank" rel="noopener noreferrer" className="text-brand-blue hover:text-brand-blue-2">
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
                        <span className="px-2 py-0.5 bg-brand-blue/10 text-brand-blue rounded ring-1 ring-brand-blue/20">{project.technologies}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Awards */}
          {resume.awards && resume.awards.length > 0 && (
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-9 h-9 rounded-lg bg-brand-orange/10 ring-1 ring-brand-orange/15 flex items-center justify-center">
                  <Award className="w-4 h-4 text-brand-orange" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Awards & Honors</h3>
              </div>
              <div className="space-y-4">
                {resume.awards.map((award: any, index: number) => (
                  <div key={index} className="p-4 bg-slate-50 border border-gray-100 ring-1 ring-black/[0.02] rounded-lg">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-1">{award.name}</h4>
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
                      <Award className="w-6 h-6 text-brand-orange" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Achievements */}
          {resume.achievements && resume.achievements.length > 0 && (
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                  <Star className="w-4 h-4 text-brand-blue" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Achievements</h3>
              </div>
              <div className="space-y-2">
                {resume.achievements.map((achievement: string, index: number) => (
                  <div key={index} className="flex items-start gap-2 text-gray-700">
                    <ChevronRight className="w-4 h-4 text-brand-blue flex-shrink-0 mt-0.5" />
                    <span>{typeof achievement === 'string' ? achievement : achievement.description || achievement.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Volunteer Experience */}
          {resume.volunteerExperience && resume.volunteerExperience.length > 0 && (
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-9 h-9 rounded-lg bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center">
                  <User className="w-4 h-4 text-brand-cyan" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Volunteer Experience</h3>
              </div>
              <div className="space-y-4">
                {resume.volunteerExperience.map((vol: any, index: number) => (
                  <div key={index} className="p-4 bg-slate-50 border border-gray-100 ring-1 ring-black/[0.02] rounded-lg">
                    <h4 className="font-semibold text-gray-900 mb-1">{vol.role || vol.title}</h4>
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
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-9 h-9 rounded-lg bg-brand-orange/10 ring-1 ring-brand-orange/15 flex items-center justify-center">
                  <Star className="w-4 h-4 text-brand-orange" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Hobbies & Interests</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {resume.hobbies.map((hobby: string, index: number) => (
                  <span key={index} className="px-3 py-1.5 bg-brand-blue/5 text-brand-blue rounded-lg text-sm ring-1 ring-brand-blue/20">
                    {typeof hobby === 'string' ? hobby : hobby.name || hobby}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Social Links */}
          {(resume.linkedinUrl || resume.githubUrl || resume.portfolioUrl) && (
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                  <Globe className="w-4 h-4 text-brand-blue" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Social & Portfolio Links</h3>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {resume.linkedinUrl && (
                  <a href={resume.linkedinUrl} target="_blank" rel="noopener noreferrer"
                     className="flex items-center gap-2 p-4 bg-brand-blue/5 border border-brand-blue/20 rounded-lg hover:bg-brand-blue/10 hover:border-brand-blue/30 transition-colors">
                    <Linkedin className="w-5 h-5 text-brand-blue" />
                    <span className="text-brand-blue text-sm font-medium">LinkedIn</span>
                    <ExternalLink className="w-3 h-3 text-brand-blue ml-auto" />
                  </a>
                )}
                {resume.githubUrl && (
                  <a href={resume.githubUrl} target="_blank" rel="noopener noreferrer"
                     className="flex items-center gap-2 p-4 bg-slate-50 border border-gray-200 rounded-lg hover:bg-slate-100 transition-colors">
                    <Code className="w-5 h-5 text-gray-700" />
                    <span className="text-gray-700 text-sm font-medium">GitHub</span>
                    <ExternalLink className="w-3 h-3 text-gray-500 ml-auto" />
                  </a>
                )}
                {resume.portfolioUrl && (
                  <a href={resume.portfolioUrl} target="_blank" rel="noopener noreferrer"
                     className="flex items-center gap-2 p-4 bg-brand-cyan/5 border border-brand-cyan/20 rounded-lg hover:bg-brand-cyan/10 hover:border-brand-cyan/30 transition-colors">
                    <Globe className="w-5 h-5 text-brand-cyan" />
                    <span className="text-brand-cyan text-sm font-medium">Portfolio</span>
                    <ExternalLink className="w-3 h-3 text-brand-cyan ml-auto" />
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Objective (if different from summary) */}
          {resume.objective && resume.objective !== resume.professionalSummary && (
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-brand-blue" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Career Objective</h3>
              </div>
              <p className="text-gray-700 leading-relaxed">{resume.objective}</p>
            </div>
          )}

          {/* Additional Information */}
          {resume.additionalInfo && (
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-brand-blue" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Additional Information</h3>
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
            <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                  <History className="w-4 h-4 text-brand-blue" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Version History</h3>
                <span className="px-2.5 py-0.5 bg-brand-blue/10 text-brand-blue rounded-full text-xs ring-1 ring-brand-blue/20">
                  {resume.versions.length} version{resume.versions.length !== 1 ? 's' : ''}
                </span>
                {resume.versions.length > 1 && (
                  <button
                    onClick={openCompareModal}
                    disabled={compareChecked.length !== 2}
                    className={`ml-auto px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      compareChecked.length === 2
                        ? 'bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10'
                        : 'bg-slate-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {compareChecked.length === 2
                      ? 'Compare Selected'
                      : compareChecked.length === 1
                        ? 'Select 1 more to compare'
                        : 'Select 2 versions to compare'}
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {(() => {
                  const sortedVersions = [...resume.versions].sort((a, b) => (b.version || 0) - (a.version || 0));
                  return sortedVersions.map((version, index) => {
                    const isLatest = index === 0;
                    const versionNumber = version.version || (resume.versions.length - index);
                    const previousVersion = index < sortedVersions.length - 1 ? sortedVersions[index + 1] : null;

                    return (
                      <div key={version.id} className={`rounded-lg border transition-all ${
                        isLatest
                          ? 'bg-brand-blue/5 border-brand-blue/30 ring-1 ring-brand-blue/10'
                          : 'bg-slate-50 border-gray-100 ring-1 ring-black/[0.02]'
                      }`}>
                        <div className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 flex-1">
                              {/* Compare checkbox */}
                              {resume.versions.length > 1 && (
                                <label className="flex items-center cursor-pointer flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={compareChecked.includes(version.id)}
                                    onChange={() => handleCompareCheck(version.id)}
                                    className="w-4 h-4 rounded border-gray-300 text-brand-blue focus:ring-brand-blue/40 cursor-pointer"
                                  />
                                </label>
                              )}
                              <div className={`p-2 rounded-lg ${
                                isLatest ? 'bg-brand-blue/10 ring-1 ring-brand-blue/20' : 'bg-white ring-1 ring-gray-200'
                              }`}>
                                <FileText className={`w-4 h-4 ${
                                  isLatest ? 'text-brand-blue' : 'text-gray-600'
                                }`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`text-sm font-semibold ${isLatest ? 'text-brand-blue' : 'text-gray-900'}`}>
                                    Version {versionNumber}
                                  </span>
                                  {isLatest && (
                                    <span className="px-2 py-0.5 bg-brand-blue text-white rounded text-xs flex-shrink-0 shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                                      Latest
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-gray-500 mb-1 truncate">{version.name}</div>
                                <div className="flex items-center gap-3 text-xs text-gray-600">
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {formatIST(version.uploadDate)}
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
                              {/* View Changes - opens popup comparing to previous version */}
                              {previousVersion && (
                                <button
                                  onClick={() => openCompareModal(previousVersion.id, version.id)}
                                  className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 bg-white border border-gray-200 text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue"
                                >
                                  <History className="w-3 h-3" />
                                  View Changes
                                </button>
                              )}
                              {!previousVersion && (
                                <span className="px-3 py-1.5 text-xs text-gray-400 italic">First version</span>
                              )}
                              {/* View (preview) button */}
                              <button
                                onClick={() => handleVersionPreview(version.id, `Version ${versionNumber}`)}
                                className={`p-2 rounded-md transition-colors ${
                                  isLatest
                                    ? 'text-brand-blue hover:bg-brand-blue/10'
                                    : 'text-gray-600 hover:bg-brand-blue/5 hover:text-brand-blue'
                                }`}
                                aria-label="View resume" title="View resume"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              {/* Download button */}
                              <button
                                onClick={async () => {
                                  try {
                                    const blob = await resumeService.download(version.id);
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
                                    ? 'text-brand-blue hover:bg-brand-blue/10'
                                    : 'text-gray-600 hover:bg-brand-blue/5 hover:text-brand-blue'
                                }`}
                                title="Download this version"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {/* File Properties */}
          <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                <File className="w-4 h-4 text-brand-blue" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 tracking-tight">File Properties</h3>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg">
                    <FileText className="w-4 h-4 text-brand-blue" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">File Name</div>
                    <div className="text-sm text-gray-900">{resume.fileName || `${resume.name.replace(' ', '_')}_Resume.pdf`}</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg">
                    <HardDrive className="w-4 h-4 text-brand-blue" />
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
                  <div className="p-2 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg">
                    <File className="w-4 h-4 text-brand-blue" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">File Type</div>
                    <div className="text-sm text-gray-900">{resume.fileType?.toUpperCase() || 'PDF'} Document</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg">
                    <Calendar className="w-4 h-4 text-brand-blue" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Upload Date</div>
                    <div className="text-sm text-gray-900">
                      {formatIST(resume.uploadDate)}
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg">
                    <Clock className="w-4 h-4 text-brand-blue" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Last Modified</div>
                    <div className="text-sm text-gray-900">
                      {resume.lastUpdated
                        ? formatIST(resume.lastUpdated)
                        : 'Never'}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg">
                    <User className="w-4 h-4 text-brand-blue" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Uploaded By</div>
                    <div className="text-sm text-gray-900">
                      {resume.uploadedBy === 'current-user' ? 'You' : resume.uploadedBy}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg">
                    <FileText className="w-4 h-4 text-brand-blue" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Total Attachments</div>
                    <div className="text-sm text-gray-900">
                      {resume.attachments} file{resume.attachments !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg">
                    <History className="w-4 h-4 text-brand-blue" />
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

      {/* Version Compare Modal - Side-by-side or Unified diff */}
      {showCompareModal && compareLeftId && compareRightId && resume?.versions && (() => {
        const leftVersion = resume.versions.find(v => v.id === compareLeftId);
        const rightVersion = resume.versions.find(v => v.id === compareRightId);
        if (!leftVersion || !rightVersion) return null;

        const olderText = leftVersion.extractedText || '';
        const newerText = rightVersion.extractedText || '';
        const diff = buildUnifiedDiff(olderText, newerText);

        // Build side-by-side aligned pairs from diff lines
        type SidePair = { left: { text: string; type: 'added' | 'removed' | 'unchanged' } | null; right: { text: string; type: 'added' | 'removed' | 'unchanged' } | null };
        const sidePairs: SidePair[] = [];
        {
          let i = 0;
          while (i < diff.lines.length) {
            if (diff.lines[i].type === 'unchanged') {
              sidePairs.push({ left: diff.lines[i], right: diff.lines[i] });
              i++;
            } else {
              const removed: typeof diff.lines = [];
              const added: typeof diff.lines = [];
              while (i < diff.lines.length && diff.lines[i].type === 'removed') {
                removed.push(diff.lines[i]);
                i++;
              }
              while (i < diff.lines.length && diff.lines[i].type === 'added') {
                added.push(diff.lines[i]);
                i++;
              }
              const maxLen = Math.max(removed.length, added.length);
              for (let j = 0; j < maxLen; j++) {
                sidePairs.push({
                  left: j < removed.length ? removed[j] : null,
                  right: j < added.length ? added[j] : null,
                });
              }
            }
          }
        }

        const compareSectionHeaders = [
          'experience', 'work experience', 'employment', 'professional experience',
          'education', 'academic', 'qualifications',
          'skills', 'technical skills', 'core competencies', 'expertise', 'key skills',
          'summary', 'professional summary', 'objective', 'profile', 'about',
          'certifications', 'certificates', 'licenses',
          'projects', 'key projects',
          'achievements', 'accomplishments', 'awards',
          'languages', 'contact', 'personal', 'references', 'hobbies', 'interests'
        ];

        const renderDiffLine = (line: { text: string; type: 'added' | 'removed' | 'unchanged' } | null, idx: number, side: 'left' | 'right') => {
          if (!line) {
            return <div key={idx} className="h-7 bg-gray-50" />;
          }
          const trimmed = line.text.trim();
          if (!trimmed) return <div key={idx} className="h-3" />;

          const lowerLine = trimmed.toLowerCase().replace(/[:\-_]/g, ' ').trim();
          const isHeader = compareSectionHeaders.some(h =>
            lowerLine === h || lowerLine.startsWith(h + ' ') || lowerLine.endsWith(' ' + h)
          ) && trimmed.length < 50;

          let bgClass = '';
          let textColor = 'text-gray-800';
          let borderClass = '';

          if (line.type === 'removed' && side === 'left') {
            bgClass = 'bg-red-50';
            textColor = 'text-red-800';
            borderClass = 'border-l-4 border-red-400 pl-2';
          } else if (line.type === 'added' && side === 'right') {
            bgClass = 'bg-green-50';
            textColor = 'text-green-800';
            borderClass = 'border-l-4 border-green-400 pl-2';
          }

          if (isHeader) {
            return (
              <h3 key={idx} className={`text-xs font-bold mt-4 mb-1.5 pb-1 border-b border-gray-300 uppercase tracking-wide ${bgClass} ${borderClass} ${textColor}`}>
                {trimmed}
              </h3>
            );
          }

          if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
            return (
              <p key={idx} className={`text-xs leading-relaxed pl-3 mb-0.5 ${bgClass} ${borderClass} ${textColor}`}>
                {trimmed}
              </p>
            );
          }

          return (
            <p key={idx} className={`text-xs leading-relaxed mb-0.5 py-0.5 ${bgClass} ${borderClass} ${textColor}`}>
              {trimmed}
            </p>
          );
        };

        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className={`bg-white rounded-2xl shadow-2xl w-full ${compareViewMode === 'side-by-side' ? 'max-w-7xl' : 'max-w-4xl'} h-[85vh] flex flex-col overflow-hidden transition-all duration-300`}>
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-blue flex items-center justify-center shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                    <History className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 tracking-tight">
                      Version Comparison
                    </h2>
                    <p className="text-sm text-gray-500">
                      Version {leftVersion.version || '?'} vs Version {rightVersion.version || '?'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/* View mode toggle */}
                  <div className="flex bg-slate-100 rounded-lg p-0.5">
                    <button
                      onClick={() => setCompareViewMode('side-by-side')}
                      className={`px-3 py-1.5 text-xs rounded-md transition-colors font-medium ${
                        compareViewMode === 'side-by-side'
                          ? 'bg-white text-brand-blue shadow-sm shadow-brand-blue/10 ring-1 ring-brand-blue/15'
                          : 'text-gray-500 hover:text-brand-blue'
                      }`}
                    >
                      Side by Side
                    </button>
                    <button
                      onClick={() => setCompareViewMode('unified')}
                      className={`px-3 py-1.5 text-xs rounded-md transition-colors font-medium ${
                        compareViewMode === 'unified'
                          ? 'bg-white text-brand-blue shadow-sm shadow-brand-blue/10 ring-1 ring-brand-blue/15'
                          : 'text-gray-500 hover:text-brand-blue'
                      }`}
                    >
                      Unified
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 border border-green-200 rounded-full text-green-700">
                      <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                      +{diff.addedCount}
                    </span>
                    <span className="flex items-center gap-1.5 px-2.5 py-1 bg-red-50 border border-red-200 rounded-full text-red-700">
                      <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                      −{diff.removedCount}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setShowCompareModal(false);
                      setCompareChecked([]);
                    }}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                   aria-label="Close">
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-hidden bg-gray-100">
                {!olderText && !newerText ? (
                  <div className="text-center text-gray-500 py-12">
                    <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p>Extracted text not available for comparison.</p>
                  </div>
                ) : diff.addedCount === 0 && diff.removedCount === 0 ? (
                  <div className="text-center text-gray-500 py-12">
                    <Check className="w-12 h-12 mx-auto mb-3 text-green-400" />
                    <p className="font-medium">No changes detected</p>
                    <p className="text-sm mt-1">Content is identical between these versions.</p>
                  </div>
                ) : compareViewMode === 'side-by-side' ? (
                  /* Side-by-side view */
                  <div className="flex h-full gap-0">
                    {/* Left panel - Older version */}
                    <div className="flex-1 flex flex-col border-r border-gray-300 min-w-0">
                      <div className="px-4 py-2.5 bg-red-50 border-b border-gray-200 flex-shrink-0">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 bg-red-400 rounded-full"></span>
                          <span className="text-sm font-semibold text-red-800">Version {leftVersion.version || '?'}</span>
                          <span className="text-xs text-red-600 ml-1">(older)</span>
                        </div>
                        <p className="text-xs text-red-600 mt-0.5 truncate">{leftVersion.name}</p>
                      </div>
                      <div className="flex-1 overflow-y-auto p-4">
                        <div className="bg-white rounded-lg border border-gray-200 p-5">
                          {sidePairs.map((pair, idx) => renderDiffLine(pair.left, idx, 'left'))}
                        </div>
                      </div>
                    </div>
                    {/* Right panel - Newer version */}
                    <div className="flex-1 flex flex-col min-w-0">
                      <div className="px-4 py-2.5 bg-green-50 border-b border-gray-200 flex-shrink-0">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                          <span className="text-sm font-semibold text-green-800">Version {rightVersion.version || '?'}</span>
                          <span className="text-xs text-green-600 ml-1">(newer)</span>
                        </div>
                        <p className="text-xs text-green-600 mt-0.5 truncate">{rightVersion.name}</p>
                      </div>
                      <div className="flex-1 overflow-y-auto p-4">
                        <div className="bg-white rounded-lg border border-gray-200 p-5">
                          {sidePairs.map((pair, idx) => renderDiffLine(pair.right, idx, 'right'))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Unified view */
                  <div className="h-full overflow-y-auto p-6">
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 max-w-3xl mx-auto">
                      {diff.lines.map((line, idx) => {
                        const trimmed = line.text.trim();
                        if (!trimmed) return <div key={idx} className="h-3" />;

                        const lowerLine = trimmed.toLowerCase().replace(/[:\-_]/g, ' ').trim();
                        const isHeader = compareSectionHeaders.some(h =>
                          lowerLine === h || lowerLine.startsWith(h + ' ') || lowerLine.endsWith(' ' + h)
                        ) && trimmed.length < 50;

                        const highlightClass = line.type === 'added'
                          ? 'bg-green-100 border-l-4 border-green-500 pl-3'
                          : line.type === 'removed'
                          ? 'bg-red-50 border-l-4 border-red-400 pl-3 line-through opacity-70'
                          : '';

                        const textColor = line.type === 'added'
                          ? 'text-green-900'
                          : line.type === 'removed'
                          ? 'text-red-700'
                          : 'text-gray-800';

                        if (isHeader) {
                          return (
                            <h3 key={idx} className={`text-base font-bold mt-5 mb-2 pb-1 border-b border-gray-300 uppercase tracking-wide rounded ${highlightClass} ${textColor}`}>
                              {trimmed}
                            </h3>
                          );
                        }

                        if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
                          return (
                            <p key={idx} className={`text-sm leading-relaxed pl-4 mb-0.5 rounded ${highlightClass} ${textColor}`}>
                              {trimmed}
                            </p>
                          );
                        }

                        return (
                          <p key={idx} className={`text-sm leading-relaxed mb-0.5 rounded ${highlightClass} ${textColor}`}>
                            {trimmed}
                          </p>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end px-6 py-3 border-t border-gray-100 bg-slate-50 flex-shrink-0">
                <button
                  onClick={() => {
                    setShowCompareModal(false);
                    setCompareChecked([]);
                  }}
                  className="px-5 py-2 bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white rounded-lg transition-all text-sm font-medium shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Version Preview Modal - shows extracted text content */}
      {/* Loading overlay for preview fetch */}
      {previewLoading && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 flex items-center gap-3 shadow-2xl shadow-brand-blue/20 ring-1 ring-brand-blue/10">
            <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
            <span className="text-gray-700">Loading preview...</span>
          </div>
        </div>
      )}

      {versionPreviewUrl && (() => {
        const previewVersion = resume?.versions?.find(v => v.id === versionPreviewUrl);
        const previewText = previewVersion?.extractedText || resume?.extractedText || fetchedPreviewText || '';
        if (!previewText) return null;

        // Parse text into sections for document-like display
        const lines = previewText.split('\n');
        const sectionHeaders = [
          'experience', 'work experience', 'employment', 'professional experience',
          'education', 'academic', 'qualifications',
          'skills', 'technical skills', 'core competencies', 'expertise', 'key skills',
          'summary', 'professional summary', 'objective', 'profile', 'about',
          'certifications', 'certificates', 'licenses',
          'projects', 'key projects',
          'achievements', 'accomplishments', 'awards',
          'languages', 'contact', 'personal', 'references', 'hobbies', 'interests'
        ];

        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl h-[90vh] flex flex-col overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-blue flex items-center justify-center shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                    <Eye className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 tracking-tight">{versionPreviewLabel}</h2>
                    <p className="text-sm text-gray-500">{previewVersion?.name || resume?.fileName}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setVersionPreviewUrl(null);
                    setVersionPreviewLabel('');
                    setFetchedPreviewText(null);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                 aria-label="Close">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* Resume content - document style */}
              <div className="flex-1 overflow-y-auto bg-gray-100 p-6">
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 max-w-2xl mx-auto min-h-full">
                  {lines.map((line, idx) => {
                    const trimmed = line.trim();
                    if (!trimmed) return <div key={idx} className="h-3" />;

                    const lowerLine = trimmed.toLowerCase().replace(/[:\-_]/g, ' ').trim();
                    const isHeader = sectionHeaders.some(h =>
                      lowerLine === h || lowerLine.startsWith(h + ' ') || lowerLine.endsWith(' ' + h)
                    ) && trimmed.length < 50;

                    if (isHeader) {
                      return (
                        <h3 key={idx} className="text-base font-bold text-gray-900 mt-5 mb-2 pb-1 border-b border-gray-300 uppercase tracking-wide">
                          {trimmed}
                        </h3>
                      );
                    }

                    // First non-empty line could be the name
                    const firstNonEmpty = lines.findIndex(l => l.trim().length > 0);
                    if (idx === firstNonEmpty) {
                      return (
                        <h2 key={idx} className="text-xl font-bold text-gray-900 mb-1">{trimmed}</h2>
                      );
                    }

                    // Bullet points
                    if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
                      return (
                        <p key={idx} className="text-sm text-gray-700 leading-relaxed pl-4 mb-0.5">{trimmed}</p>
                      );
                    }

                    return (
                      <p key={idx} className="text-sm text-gray-700 leading-relaxed mb-0.5">{trimmed}</p>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Version Selection Modal for Apply to Job */}
      {showVersionSelectModal && resume && resume.versions && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-in">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-blue flex items-center justify-center shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                  <History className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 tracking-tight">Select Resume Version</h2>
                  <p className="text-sm text-gray-600">Choose which version to apply for the job</p>
                </div>
              </div>
              <button
                onClick={() => setShowVersionSelectModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
               aria-label="Close">
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
                      ? 'border-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue/20'
                      : 'border-gray-200 hover:border-brand-blue/30 hover:bg-brand-blue/[0.02]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="version"
                      checked={selectedVersionForApply === resumeId}
                      onChange={() => setSelectedVersionForApply(resumeId)}
                      className="w-4 h-4 text-brand-blue border-gray-300 focus:ring-brand-blue/40"
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
                          {resume.uploadDate ? formatISTDate(resume.uploadDate) : 'N/A'}
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
                        ? 'border-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue/20'
                        : 'border-gray-200 hover:border-brand-blue/30 hover:bg-brand-blue/[0.02]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="version"
                        checked={selectedVersionForApply === version.id}
                        onChange={() => setSelectedVersionForApply(version.id)}
                        className="w-4 h-4 text-brand-blue border-gray-300 focus:ring-brand-blue/40"
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
                            {version.uploadDate ? formatISTDate(version.uploadDate) : 'N/A'}
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
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100 bg-slate-50">
              <button
                onClick={() => setShowVersionSelectModal(false)}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-200 bg-white rounded-lg hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => selectedVersionForApply && handleVersionSelectForApply(selectedVersionForApply)}
                disabled={!selectedVersionForApply}
                className="px-4 py-2 text-sm bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
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
                  <div className="w-10 h-10 bg-brand-blue rounded-xl flex items-center justify-center shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                    <Mail className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 tracking-tight">Share Resume</h2>
                    <p className="text-sm text-gray-500">Send resume via email</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsShareModalOpen(false);
                    setShareEmail('');
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                 aria-label="Close">
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
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue outline-none transition-all"
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
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue outline-none transition-all"
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
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue outline-none transition-all resize-none"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                <button
                  onClick={() => {
                    setIsShareModalOpen(false);
                    setShareEmail('');
                  }}
                  className="px-4 py-2 text-gray-700 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendEmail}
                  disabled={isSendingEmail || !shareEmail.trim()}
                  className="flex items-center gap-2 px-6 py-2 bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
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
      </div>
    </main>
    </FeatureGate>
  );
}
