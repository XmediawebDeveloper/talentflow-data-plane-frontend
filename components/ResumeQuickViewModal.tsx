import { X, Download, FileText, User, History, Clock, Eye, Loader2, Mail, Phone, MapPin, Briefcase, Star, Building2, Calendar, GraduationCap, Code, ChevronRight, Award, Languages } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Resume, ResumeVersion } from '@/lib/types/types';
import { resumeService } from '@/lib/services/resumeService';
import { toast } from 'sonner';

interface ResumeQuickViewModalProps {
  resume: Resume;
  onClose: () => void;
}

export default function ResumeQuickViewModal({ resume, onClose }: ResumeQuickViewModalProps) {
  const [activeTab, setActiveTab] = useState<'preview' | 'details' | 'history'>('details');
  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [fullResume, setFullResume] = useState<Resume>(resume);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Fetch full resume details on mount
  useEffect(() => {
    fetchFullDetails();
  }, [resume.id]);

  const fetchFullDetails = async () => {
    setLoadingDetails(true);
    try {
      const data = await resumeService.get(resume.id);
      if (data) {
        // Map API response to Resume type
        setFullResume({
          ...resume,
          professionalSummary: data.professional_summary,
          technicalSkills: data.technical_skills || [],
          softSkills: data.soft_skills || [],
          educationDetails: data.education?.map((edu: any) => ({
            degree: edu.degree || '',
            school: edu.school || edu.institution || '',
            location: edu.location || '',
            year: edu.year || edu.graduation_year || '',
            gpa: edu.gpa || '',
            honors: edu.honors || '',
          })),
          experienceDetails: data.experience?.map((exp: any) => ({
            title: exp.title || exp.position || exp.job_title || '',
            company: exp.company || '',
            location: exp.location || '',
            startDate: exp.start_date || '',
            endDate: exp.end_date || 'Present',
            duration: exp.duration || '',
            description: exp.description || '',
            achievements: exp.achievements || exp.responsibilities || [],
          })),
          certifications: data.certifications?.map((cert: any) => ({
            name: cert.name || cert.title || '',
            issuer: cert.issuer || cert.issuing_organization || cert.organization || '',
            date: cert.date || cert.date_obtained || cert.issued_date || '',
            credentialId: cert.credential_id || cert.credentialId || '',
          })),
          languages: data.languages?.map((lang: any) => ({
            name: typeof lang === 'string' ? lang : (lang.name || lang.language || ''),
            proficiency: typeof lang === 'string' ? 'Fluent' : (lang.proficiency || lang.level || 'Fluent'),
          })),
        });
      }
    } catch (error) {
      console.error('Failed to fetch full resume details:', error);
    } finally {
      setLoadingDetails(false);
    }
  };

  // Fetch versions when history tab is selected
  useEffect(() => {
    if (activeTab === 'history') {
      fetchVersions();
    }
  }, [activeTab, resume.id]);

  // Fetch PDF preview when preview tab is selected
  useEffect(() => {
    if (activeTab === 'preview') {
      fetchPdfPreview();
    }
    return () => {
      // Clean up blob URL when switching tabs or unmounting
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [activeTab, resume.id]);

  const fetchVersions = async () => {
    setLoadingVersions(true);
    try {
      const data = await resumeService.getVersions(resume.id);
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
      const blob = await resumeService.download(resume.id);
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
    } catch (error) {
      console.error('Failed to fetch PDF:', error);
      toast.error('Failed to load PDF preview');
    } finally {
      setLoadingPdf(false);
    }
  };

  const handleDownload = async () => {
    try {
      const blob = await resumeService.download(resume.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Use original filename to preserve file extension (pdf, doc, docx, rtf, txt, etc.)
      a.download = resume.fileName || `${resume.name || 'resume'}.${resume.fileType || 'pdf'}`;
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
      a.download = version.fileName || `${resume.name || 'resume'}_v${version.version || 'version'}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Version downloaded');
    } catch (error) {
      toast.error('Failed to download version');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl text-gray-900">{resume.name}</h2>
            <p className="text-sm text-gray-500">{resume.title}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 rounded-md hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
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

          <div className="flex-1 overflow-y-auto p-8">
            {activeTab === 'preview' && (
              <div className="h-full">
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
                    className="w-full h-full rounded-lg border border-gray-200"
                    title="Resume Preview"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full bg-gray-100 rounded-lg">
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
                {loadingDetails ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                      <Loader2 className="w-8 h-8 mx-auto mb-4 text-blue-600 animate-spin" />
                      <p className="text-gray-600">Loading resume details...</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Personal Info Card */}
                    <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-5">
                      <div className="flex items-start gap-4">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xl flex-shrink-0">
                          {fullResume.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg text-gray-900 mb-1">{fullResume.name}</h3>
                          <p className="text-gray-700 mb-2">{fullResume.title}</p>
                          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 mb-3">
                            {fullResume.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5" />
                                {fullResume.location}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Briefcase className="w-3.5 h-3.5" />
                              {fullResume.experience}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="flex items-center gap-2 text-gray-700">
                              <Mail className="w-3.5 h-3.5 text-blue-600" />
                              <span className="truncate">{fullResume.email}</span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-700">
                              <Phone className="w-3.5 h-3.5 text-blue-600" />
                              <span>{fullResume.phone}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Professional Summary */}
                    {fullResume.professionalSummary && (
                      <section className="bg-white border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Star className="w-4 h-4 text-yellow-600" />
                          <h3 className="text-gray-900">Professional Summary</h3>
                        </div>
                        <p className="text-sm text-gray-700 leading-relaxed">{fullResume.professionalSummary}</p>
                      </section>
                    )}

                    {/* Work Experience */}
                    <section className="bg-white border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-4">
                        <Briefcase className="w-4 h-4 text-blue-600" />
                        <h3 className="text-gray-900">Work Experience</h3>
                      </div>
                      {fullResume.experienceDetails && fullResume.experienceDetails.length > 0 ? (
                        <div className="space-y-4">
                          {fullResume.experienceDetails.map((exp, index) => (
                            <div key={index} className="relative pl-5 pb-4 border-l-2 border-blue-200 last:pb-0">
                              <div className="absolute -left-1.5 top-0 w-3 h-3 rounded-full bg-blue-600 border-2 border-white"></div>
                              <div>
                                <h4 className="text-sm text-gray-900 mb-1">{exp.title}</h4>
                                <div className="flex items-center gap-2 text-sm text-gray-700 mb-1">
                                  <Building2 className="w-3.5 h-3.5" />
                                  <span>{exp.company}</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 mb-2">
                                  {exp.location && (
                                    <span className="flex items-center gap-1">
                                      <MapPin className="w-3 h-3" />
                                      {exp.location}
                                    </span>
                                  )}
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {exp.startDate} - {exp.endDate}
                                  </span>
                                  {exp.duration && (
                                    <span className="text-blue-600">({exp.duration})</span>
                                  )}
                                </div>
                                {exp.description && (
                                  <p className="text-xs text-gray-600 mb-2">{exp.description}</p>
                                )}
                                {exp.achievements && exp.achievements.length > 0 && (
                                  <div className="space-y-1">
                                    {exp.achievements.map((achievement, achIndex) => (
                                      <div key={achIndex} className="flex items-start gap-1.5 text-xs text-gray-600">
                                        <ChevronRight className="w-3 h-3 text-green-600 flex-shrink-0 mt-0.5" />
                                        <span>{achievement}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-600">
                          <p className="mb-1">{fullResume.title}</p>
                          <p className="text-gray-500">{fullResume.experience}</p>
                        </div>
                      )}
                    </section>

                    {/* Education */}
                    <section className="bg-white border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-4">
                        <GraduationCap className="w-4 h-4 text-purple-600" />
                        <h3 className="text-gray-900">Education</h3>
                      </div>
                      {fullResume.educationDetails && fullResume.educationDetails.length > 0 ? (
                        <div className="space-y-3">
                          {fullResume.educationDetails.map((edu, index) => (
                            <div key={index} className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                              <h4 className="text-sm text-gray-900 mb-1">{edu.degree}</h4>
                              {edu.school && <div className="text-sm text-gray-700 mb-1">{edu.school}</div>}
                              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
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
                      ) : (
                        <div className="text-sm text-gray-600">
                          {fullResume.education || 'Education information not provided'}
                        </div>
                      )}
                    </section>

                    {/* Skills */}
                    <section className="bg-white border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-4">
                        <Code className="w-4 h-4 text-green-600" />
                        <h3 className="text-gray-900">Skills</h3>
                      </div>

                      {/* Technical Skills */}
                      <div className="mb-4">
                        <h4 className="text-sm text-gray-800 mb-3">Technical Skills</h4>
                        <div className="grid grid-cols-2 gap-3">
                          {(fullResume.technicalSkills || fullResume.skills || []).map((skill, index) => {
                            const level = 90 - (index * 5);
                            return (
                              <div key={index}>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs text-gray-700">{skill}</span>
                                  <span className="text-xs text-gray-500">{Math.max(60, level)}%</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-1.5">
                                  <div
                                    className={`h-1.5 rounded-full ${
                                      level >= 90 ? 'bg-green-600' :
                                      level >= 75 ? 'bg-blue-600' :
                                      level >= 60 ? 'bg-yellow-600' :
                                      'bg-orange-600'
                                    }`}
                                    style={{ width: `${Math.max(60, level)}%` }}
                                  ></div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Soft Skills */}
                      {fullResume.softSkills && fullResume.softSkills.length > 0 && (
                        <div>
                          <h4 className="text-sm text-gray-800 mb-3">Soft Skills</h4>
                          <div className="flex flex-wrap gap-2">
                            {fullResume.softSkills.map((skill, index) => (
                              <span key={index} className="px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs border border-green-200">
                                {skill}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </section>

                    {/* Certifications */}
                    {fullResume.certifications && fullResume.certifications.length > 0 && (
                      <section className="bg-white border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-4">
                          <Award className="w-4 h-4 text-yellow-600" />
                          <h3 className="text-gray-900">Certifications</h3>
                        </div>
                        <div className="space-y-3">
                          {fullResume.certifications.map((cert, index) => (
                            <div key={index} className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                              <div className="flex items-start justify-between">
                                <div>
                                  <h4 className="text-sm text-gray-900 mb-1">{cert.name}</h4>
                                  <div className="text-xs text-gray-700 mb-1">{cert.issuer}</div>
                                  <div className="flex items-center gap-3 text-xs text-gray-500">
                                    {cert.date && (
                                      <span className="flex items-center gap-1">
                                        <Calendar className="w-3 h-3" />
                                        Issued {cert.date}
                                      </span>
                                    )}
                                    {cert.credentialId && <span>ID: {cert.credentialId}</span>}
                                  </div>
                                </div>
                                <Award className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Languages */}
                    {fullResume.languages && fullResume.languages.length > 0 && (
                      <section className="bg-white border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-4">
                          <Languages className="w-4 h-4 text-indigo-600" />
                          <h3 className="text-gray-900">Languages</h3>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          {fullResume.languages.map((lang, index) => (
                            <div key={index} className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-center">
                              <div className="text-sm text-gray-900 mb-1">{lang.name}</div>
                              <div className="text-xs text-indigo-700">{lang.proficiency}</div>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Upload Information */}
                    <section className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <FileText className="w-4 h-4 text-gray-600" />
                        <h3 className="text-gray-900">Upload Information</h3>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Source</div>
                          <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs ${
                            fullResume.source === 'Manual' ? 'bg-gray-100 text-gray-700' : 'bg-blue-50 text-blue-700'
                          }`}>
                            {fullResume.source}
                          </span>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Upload Date</div>
                          <div className="text-gray-900">
                            {new Date(fullResume.uploadDate).toLocaleDateString('en-US', {
                              month: 'long',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Uploaded By</div>
                          <div className="text-gray-900">{fullResume.uploadedBy === 'current-user' ? 'You' : fullResume.uploadedBy}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Attachments</div>
                          <div className="text-gray-900">{fullResume.attachments} file(s)</div>
                        </div>
                      </div>
                    </section>
                  </>
                )}
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
                              {resume.name.replace(' ', '_')}_Resume.pdf
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
      </div>
    </div>
  );
}
