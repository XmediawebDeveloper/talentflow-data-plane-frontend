'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Download, FileText, User, History, Clock, Loader2 } from 'lucide-react';
import { Resume, ResumeVersion } from '@/lib/types/types';
import { resumeService } from '@/lib/services/resumeService';
import { Resume as ApiResume } from '@/lib/services/resumeService';
import { toast } from 'sonner';

interface ResumeVersion {
  id: string;
  version: number;
  file_name: string;
  created_at: string;
}

export default function ResumeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const resumeId = params.id as string;

  const [resume, setResume] = useState<Resume | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'preview' | 'details' | 'history'>('preview');
  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);

  useEffect(() => {
    if (resumeId) {
      fetchResumeData();
    }
  }, [resumeId]);

  // Fetch PDF preview when preview tab is selected
  useEffect(() => {
    if (activeTab === 'preview' && resume) {
      fetchPdfPreview();
    }
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [activeTab, resume?.id]);

  // Fetch versions when history tab is selected
  useEffect(() => {
    if (activeTab === 'history' && resume) {
      fetchVersions();
    }
  }, [activeTab, resume?.id]);

  const fetchResumeData = async () => {
    setLoading(true);
    try {
      const resumeData = await resumeService.get(resumeId);
      const converted = convertApiResume(resumeData);
      setResume(converted);
    } catch (error) {
      console.error('Failed to fetch resume:', error);
      toast.error('Failed to load resume details');
    } finally {
      setLoading(false);
    }
  };

  const convertApiResume = (r: ApiResume): Resume => ({
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
    currentCompany: r.current_company,
    previousCompany: r.previous_company,
    noticePeriod: r.notice_period,
    lastUpdated: r.updated_at,
    professionalSummary: r.professional_summary,
    technicalSkills: r.technical_skills,
    softSkills: r.soft_skills,
    versionCount: r.version_count,
    fileName: r.file_name,
    fileType: r.file_type,
    fileSizeKb: r.file_size_kb,
  });

  const fetchVersions = async () => {
    setLoadingVersions(true);
    try {
      const data = await resumeService.getVersions(resumeId);
      setVersions(data || []);
    } catch (error) {
      console.error('Failed to fetch versions:', error);
      setVersions([]);
    } finally {
      setLoadingVersions(false);
    }
  };

  const fetchPdfPreview = async () => {
    setLoadingPdf(true);
    try {
      // Use preview endpoint which converts DOCX to PDF
      const blob = await resumeService.preview(resumeId);
      console.log('Preview blob received - type:', blob.type, 'size:', blob.size);

      // Verify it's a PDF
      const firstBytes = await blob.slice(0, 10).text();
      console.log('First bytes:', firstBytes);

      if (firstBytes.startsWith('%PDF')) {
        const pdfBlob = new Blob([blob], { type: 'application/pdf' });
        const url = URL.createObjectURL(pdfBlob);
        setPdfUrl(url);
      } else if (blob.type.includes('wordprocessingml') || blob.type.includes('msword')) {
        // LibreOffice not installed - received DOCX file, trigger download
        console.log('Received DOCX file instead of PDF - LibreOffice not installed on server');
        toast.info('Preview not available. Click Download to view the resume.');
        setPdfUrl(null);
      } else {
        console.error('Preview did not return PDF');
        toast.error('Failed to generate preview');
        setPdfUrl(null);
      }
    } catch (error) {
      console.error('Failed to fetch preview:', error);
      toast.error('Failed to load preview');
      setPdfUrl(null);
    } finally {
      setLoadingPdf(false);
    }
  };

  const handleDownload = async () => {
    try {
      const blob = await resumeService.download(resumeId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = resume?.fileName || `${resume?.name || 'resume'}.${resume?.fileType || 'pdf'}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Resume downloaded');
    } catch (error) {
      toast.error('Failed to download resume');
    }
  };

  const handleDownloadVersion = async (version: ResumeVersion) => {
    try {
      const blob = await resumeService.download(version.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Use original filename from version to preserve file extension
      a.download = version.fileName || `${resume?.name || 'resume'}_v${version.version || 'version'}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Version downloaded');
    } catch (error) {
      toast.error('Failed to download version');
    }
  };

  if (loading) {
    return (
      <main className="flex-1 bg-gray-50 min-h-screen">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-gray-800" />
          <span className="ml-3 text-gray-600">Loading resume details...</span>
        </div>
      </main>
    );
  }

  if (!resume) {
    return (
      <main className="flex-1 bg-gray-50 min-h-screen p-8">
        <div className="text-center py-12">
          <h2 className="text-xl text-gray-900 mb-2">Resume not found</h2>
          <p className="text-gray-600 mb-4">The resume you're looking for doesn't exist or has been deleted.</p>
          <button
            onClick={() => router.push('/recruitment/my-resumes')}
            className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900"
          >
            Back to My Resumes
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-gray-50 min-h-screen flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-6">
        <div className="max-w-7xl mx-auto">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl text-gray-900">{resume.name}</h1>
              <p className="text-sm text-gray-500">{resume.title}</p>
            </div>
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex max-w-7xl mx-auto w-full">
        {/* Sidebar */}
        <div className="w-60 border-r border-gray-200 bg-gray-50 p-4">
          <div className="space-y-1">
            <button
              onClick={() => setActiveTab('preview')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${
                activeTab === 'preview'
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <FileText className="w-4 h-4" />
              Preview
            </button>
            <button
              onClick={() => setActiveTab('details')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${
                activeTab === 'details'
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <User className="w-4 h-4" />
              Details
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${
                activeTab === 'history'
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <History className="w-4 h-4" />
              History
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-8 overflow-y-auto">
          {activeTab === 'preview' && (
            <div className="h-full min-h-[600px]">
              {loadingPdf ? (
                <div className="flex items-center justify-center h-full bg-gray-100 rounded-lg">
                  <div className="text-center">
                    <Loader2 className="w-8 h-8 mx-auto mb-4 text-gray-600 animate-spin" />
                    <p className="text-gray-600">Loading PDF preview...</p>
                  </div>
                </div>
              ) : pdfUrl ? (
                <iframe
                  src={pdfUrl}
                  className="w-full h-full min-h-[700px] rounded-lg border border-gray-200"
                  title="Resume Preview"
                  style={{ height: 'calc(100vh - 250px)' }}
                />
              ) : (
                <div className="flex items-center justify-center h-full bg-gray-100 rounded-lg min-h-[600px]">
                  <div className="text-center">
                    <FileText className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                    <p className="text-gray-600">PDF preview not available</p>
                    <button
                      onClick={fetchPdfPreview}
                      className="mt-4 px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-900 text-sm"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'details' && (
            <div className="space-y-6">
              <section>
                <h3 className="text-gray-900 mb-3 pb-2 border-b border-gray-200">Personal Profile</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Name</div>
                    <div className="text-sm text-gray-900">{resume.name}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Email</div>
                    <div className="text-sm text-gray-900">{resume.email}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Phone</div>
                    <div className="text-sm text-gray-900">{resume.phone}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Location</div>
                    <div className="text-sm text-gray-900">{resume.location || 'Not specified'}</div>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-gray-900 mb-3 pb-2 border-b border-gray-200">Education</h3>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-lg">*</span>
                  </div>
                  <div>
                    <div className="text-sm text-gray-900">{resume.education || 'Education information not provided'}</div>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-gray-900 mb-3 pb-2 border-b border-gray-200">Experience</h3>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-lg">*</span>
                  </div>
                  <div>
                    <div className="text-sm text-gray-900 mb-1">{resume.title}</div>
                    <div className="text-sm text-gray-500">{resume.experience}</div>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-gray-900 mb-3 pb-2 border-b border-gray-200">Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {resume.skills && resume.skills.length > 0 ? (
                    resume.skills.map((skill, index) => (
                      <span
                        key={index}
                        className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full text-sm border border-gray-300"
                      >
                        {skill}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-gray-500">No skills listed</span>
                  )}
                </div>
              </section>

              <section>
                <h3 className="text-gray-900 mb-3 pb-2 border-b border-gray-200">Upload Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Source</div>
                    <div className="text-sm">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded text-xs ${
                          resume.source === 'Manual'
                            ? 'bg-gray-100 text-gray-700'
                            : 'bg-gray-50 text-gray-800'
                        }`}
                      >
                        {resume.source}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Upload Date</div>
                    <div className="text-sm text-gray-900">
                      {new Date(resume.uploadDate).toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Attachments</div>
                    <div className="text-sm text-gray-900">{resume.attachments} file(s)</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Uploaded By</div>
                    <div className="text-sm text-gray-900">{resume.uploadedBy === 'current-user' ? 'You' : resume.uploadedBy}</div>
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-6">
              {/* Activity History */}
              <div>
                <h3 className="text-gray-900 mb-4 pb-2 border-b border-gray-200">Activity History</h3>
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="w-2 h-2 rounded-full bg-gray-800 mt-2" />
                    <div className="flex-1">
                      <div className="text-sm text-gray-900">Resume uploaded</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {new Date(resume.uploadDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                      <div className="text-xs text-gray-500">By {resume.uploadedBy === 'current-user' ? 'You' : resume.uploadedBy}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Version History Section */}
              <div>
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-200">
                  <h3 className="text-gray-900">Version History</h3>
                  {loadingVersions ? (
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Loading...
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500">{versions.length || 1} version{(versions.length || 1) !== 1 ? 's' : ''}</span>
                  )}
                </div>

                {loadingVersions ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 text-gray-600 animate-spin" />
                  </div>
                ) : versions.length > 0 ? (
                  <div className="space-y-3">
                    {versions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((version, index) => (
                      <div
                        key={version.id}
                        className={`rounded-lg border-2 p-4 ${
                          index === 0
                            ? 'bg-gradient-to-r from-gray-50 to-gray-100 border-gray-200'
                            : 'bg-white border-gray-200 hover:border-gray-300 transition-colors'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 flex-1">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                              index === 0 ? 'bg-gray-800' : 'bg-gray-100'
                            }`}>
                              <FileText className={`w-5 h-5 ${index === 0 ? 'text-white' : 'text-gray-600'}`} />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm text-gray-900">
                                  {index === 0 ? 'Current Version' : `Version ${version.version}`}
                                </span>
                                {index === 0 && (
                                  <span className="px-2 py-0.5 bg-gray-800 text-white text-xs rounded-full">Latest</span>
                                )}
                                {index !== 0 && (
                                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">Older</span>
                                )}
                              </div>
                              <div className="text-xs text-gray-600 mb-2">
                                {version.file_name}
                              </div>
                              <div className="flex items-center gap-4 text-xs text-gray-500">
                                <div className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {new Date(version.created_at).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleDownloadVersion(version)}
                              className={`p-2 rounded-lg transition-colors ${
                                index === 0 ? 'text-gray-800 hover:bg-gray-100' : 'text-gray-600 hover:bg-gray-100'
                              }`}
                              title="Download"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg border-2 border-gray-200 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0">
                          <FileText className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm text-gray-900">Current Version</span>
                            <span className="px-2 py-0.5 bg-gray-800 text-white text-xs rounded-full">Latest</span>
                          </div>
                          <div className="text-xs text-gray-600 mb-2">
                            {resume.fileName || `${resume.name.replace(' ', '_')}_Resume.pdf`}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(resume.uploadDate).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </div>
                            <div>Uploaded by {resume.uploadedBy === 'current-user' ? 'You' : resume.uploadedBy}</div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleDownload}
                          className="p-2 text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Download"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Info Banner */}
                <div className="mt-4 bg-gray-50 rounded-lg border border-gray-200 p-3 flex items-start gap-3">
                  <div className="w-5 h-5 bg-gray-800 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs">i</span>
                  </div>
                  <div>
                    <h4 className="text-sm text-gray-800 mb-1">Version history</h4>
                    <p className="text-xs text-gray-900">
                      All previous versions are stored securely and can be accessed anytime. Click download to get any version.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
