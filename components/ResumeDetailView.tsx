'use client'

import { X, Download, Mail, Phone, MapPin, Briefcase, Calendar, Award, Languages, Star, Edit2, Trash2, Send, Building2, GraduationCap, Code, ChevronRight, ExternalLink, Linkedin, Globe } from 'lucide-react';
import { useState } from 'react';
import { Resume } from '@/lib/types/types';
import { FileText, Clock, History, User, File, HardDrive } from 'lucide-react';
import ResumeVersionSelector from './ResumeVersionSelector';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
import { formatIST, formatISTDate } from '@/lib/utils/dateUtils';

interface ResumeDetailViewProps {
  resume: Resume;
  onClose: () => void;
  onEdit?: (resume: Resume) => void;
  onDelete?: (resumeId: string) => void;
  /** True when Delete applies here but the viewer's permission is off — the
   *  button stays visible but disabled with this reason instead of firing. */
  onDeleteDisabled?: boolean;
  onDeleteDisabledReason?: string;
  onApplyToJob?: (resume: Resume) => void;
  /** When true, render in the page flow (no backdrop / fixed overlay) so it can
   *  live under a breadcrumb instead of floating over the page. */
  embedded?: boolean;
}

export default function ResumeDetailView({ resume, onClose, onEdit, onDelete, onDeleteDisabled = false, onDeleteDisabledReason, onApplyToJob, embedded = false }: ResumeDetailViewProps) {
  const dialog = useGlobalDialog();
  const [showVersionSelector, setShowVersionSelector] = useState(false);
  
  const handleDownload = () => {
    toast.info('Resume download functionality would trigger here');
  };

  const handleShare = () => {
    toast.info('Share resume functionality would trigger here');
  };

  const handleDelete = async () => {
    if (onDeleteDisabled) {
      toast.error(onDeleteDisabledReason || 'You do not have permission to delete resumes');
      return;
    }
    if (await dialog.confirm({
      title: 'Delete Resume',
      message: 'Are you sure you want to delete this resume?\nThis action cannot be undone.',
      variant: 'delete',
      confirmText: 'Delete Resume',
      item: { label: 'RESUME', name: resume.name },
      warningNote: 'Deleting this resume will permanently remove it and cannot be restored.',
    })) {
      onDelete?.(resume.id);
      onClose();
    }
  };

  // Handle apply to job with version detection
  const handleApplyToJob = () => {
    if (resume.versions && resume.versions.length > 1) {
      setShowVersionSelector(true);
    } else {
      onApplyToJob?.(resume);
    }
  };

  // Handle version selection
  const handleVersionSelect = (versionId: string) => {
    toast.success(`Applying with ${resume.name}'s resume (${versionId})`);
    onApplyToJob?.(resume);
    setShowVersionSelector(false);
  };

  // Use real data from resume object - no more mock data
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
      technical: (resume.technicalSkills || resume.skills || []).map((skill, index) => ({
        name: skill,
        level: 90 - (index * 5) // Visual representation
      })),
      soft: resume.softSkills || []
    },
    certifications: resume.certifications || [],
    languages: resume.languages || [],
    links: {
      linkedin: '',
      portfolio: '',
      github: ''
    }
  };

  return (
    <div className={embedded
      ? 'w-full'
      : 'fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6'}>
      <div className={embedded
        ? 'bg-white rounded-xl border border-gray-200 shadow-sm w-full overflow-hidden flex flex-col'
        : 'bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-[95vw] sm:max-w-6xl max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col'}>
        {/* Header — brand blue, with Download / Share on the right of the name */}
        <div className="bg-brand-blue px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <Briefcase className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-white">Resume Details</h2>
              <p className="text-white/80 text-sm truncate">{resume.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              tone="onColor"
              variant="secondary"
              size="sm"
              onClick={handleDownload}
              icon={<Download className="w-4 h-4" />}
            >
              <span className="hidden sm:inline">Download</span>
            </Button>
            <Button
              tone="onColor"
              variant="secondary"
              size="sm"
              onClick={handleShare}
              icon={<Send className="w-4 h-4" />}
            >
              <span className="hidden sm:inline">Share</span>
            </Button>
            {/* Embedded view is reached via the breadcrumb, so no back control */}
            {!embedded && (
              <Button
                tone="onColor"
                variant="secondary"
                size="sm"
                onClick={onClose}
                aria-label="Close"
                className="px-2"
              >
                <X className="w-5 h-5" />
              </Button>
            )}
          </div>
        </div>

        {/* Action Bar — only when there is an action to show */}
        {(onEdit || onDelete || onApplyToJob) && (
        <div className="bg-gray-50 border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {onEdit && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onEdit(resume)}
                icon={<Edit2 className="w-4 h-4" />}
              >
                Edit
              </Button>
            )}
            {onDelete && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={onDeleteDisabled}
                title={onDeleteDisabled ? (onDeleteDisabledReason || 'You do not have permission to delete resumes') : undefined}
                icon={<Trash2 className="w-4 h-4" />}
              >
                Delete
              </Button>
            )}
          </div>
          {onApplyToJob && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleApplyToJob}
              icon={<Send className="w-4 h-4" />}
            >
              Apply to Job
            </Button>
          )}
        </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            
            {/* Personal Info Card */}
            <div className="bg-white border-2 border-blue-200 rounded-xl p-6 shadow-lg">
              <div className="flex items-start gap-6">
                <div className="w-24 h-24 rounded-full bg-brand-blue flex items-center justify-center text-white text-3xl flex-shrink-0">
                  {resume.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h1 className="text-gray-900 mb-2">{resume.name}</h1>
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
                        <div className="text-lg text-gray-900">
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
                    {detailedResume.links.linkedin && (
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <Linkedin className="w-4 h-4 text-blue-600" />
                        <a href={`https://${detailedResume.links.linkedin}`} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 flex items-center gap-1">
                          LinkedIn <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                    {detailedResume.links.portfolio && (
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <Globe className="w-4 h-4 text-blue-600" />
                        <a href={`https://${detailedResume.links.portfolio}`} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 flex items-center gap-1">
                          Portfolio <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
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
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <Star className="w-5 h-5 text-warning" />
                <h2 className="text-gray-900">Professional Summary</h2>
              </div>
              <p className="text-gray-700 leading-relaxed">{detailedResume.summary}</p>
            </div>

            {/* Work Experience */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-6">
                <Briefcase className="w-5 h-5 text-blue-600" />
                <h2 className="text-gray-900">Work Experience</h2>
              </div>
              <div className="space-y-6">
                {detailedResume.experience.map((exp, index) => (
                  <div key={index} className="relative pl-6 pb-6 border-l-2 border-blue-200 last:pb-0">
                    <div className="absolute -left-2 top-0 w-4 h-4 rounded-full bg-blue-600 border-2 border-white"></div>
                    <div className="mb-3">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="text-gray-900 mb-1">{exp.title}</h3>
                          <div className="flex items-center gap-2 text-gray-700 mb-1">
                            <Building2 className="w-4 h-4" />
                            <span>{exp.company}</span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {exp.location}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {exp.startDate} - {exp.endDate}
                            </span>
                            <span className="text-blue-600">({exp.duration})</span>
                          </div>
                        </div>
                      </div>
                      <p className="text-gray-700 mb-3">{exp.description}</p>
                      <div className="space-y-2">
                        {exp.achievements.map((achievement, achIndex) => (
                          <div key={achIndex} className="flex items-start gap-2 text-sm text-gray-700">
                            <ChevronRight className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                            <span>{achievement}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Education */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-6">
                <GraduationCap className="w-5 h-5 text-purple-600" />
                <h2 className="text-gray-900">Education</h2>
              </div>
              <div className="space-y-4">
                {detailedResume.education.map((edu, index) => (
                  <div key={index} className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                    <h3 className="text-gray-900 mb-2">{edu.degree}</h3>
                    <div className="text-gray-700 mb-1">{edu.school}</div>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {edu.location}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {edu.year}
                      </span>
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

            {/* Skills */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-6">
                <Code className="w-5 h-5 text-success" />
                <h2 className="text-gray-900">Skills</h2>
              </div>
              
              {/* Technical Skills */}
              <div className="mb-6">
                <h3 className="text-gray-900 mb-4">Technical Skills</h3>
                <div className="grid grid-cols-2 gap-4">
                  {detailedResume.skills.technical.map((skill, index) => (
                    <div key={index}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-700">{skill.name}</span>
                        <span className="text-xs text-gray-500">{skill.level}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            skill.level >= 90 ? 'bg-success' :
                            skill.level >= 75 ? 'bg-blue-600' :
                            skill.level >= 60 ? 'bg-warning' :
                            'bg-orange-600'
                          }`}
                          style={{ width: `${skill.level}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Soft Skills */}
              <div>
                <h3 className="text-gray-900 mb-4">Soft Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {detailedResume.skills.soft.map((skill, index) => (
                    <span key={index} className="px-4 py-2 bg-success-subtle text-success rounded-lg text-sm border border-success-line">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Certifications */}
            {detailedResume.certifications.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-6">
                  <Award className="w-5 h-5 text-warning" />
                  <h2 className="text-gray-900">Certifications</h2>
                </div>
                <div className="space-y-4">
                  {detailedResume.certifications.map((cert: any, index) => {
                    // Handle both string and object formats, and both camelCase and snake_case
                    const certName = typeof cert === 'string' ? cert : (cert.name || cert.title || 'Certification');
                    const certIssuer = typeof cert === 'object' ? (cert.issuer || cert.organization) : null;
                    const certDate = typeof cert === 'object' ? cert.date : null;
                    const certId = typeof cert === 'object' ? (cert.credentialId || cert.credential_id) : null;
                    return (
                    <div key={index} className="p-4 bg-warning-subtle border border-warning-line rounded-lg">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-gray-900 mb-1">{certName}</h3>
                          {certIssuer && <div className="text-sm text-gray-700 mb-1">{certIssuer}</div>}
                          <div className="flex items-center gap-4 text-xs text-gray-600">
                            {certDate && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              Issued {certDate}
                            </span>
                            )}
                            {certId && <span>ID: {certId}</span>}
                          </div>
                        </div>
                        <Award className="w-6 h-6 text-warning" />
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Languages */}
            {detailedResume.languages.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-6">
                  <Languages className="w-5 h-5 text-indigo-600" />
                  <h2 className="text-gray-900">Languages</h2>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {detailedResume.languages.map((lang, index) => (
                    <div key={index} className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg text-center">
                      <div className="text-gray-900 mb-1">{lang.name}</div>
                      <div className="text-sm text-indigo-700">{lang.proficiency}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Version Chain */}
            {resume.versions && resume.versions.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-6">
                  <History className="w-5 h-5 text-blue-600" />
                  <h2 className="text-gray-900">Version History</h2>
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
                              <span className="text-sm text-gray-900 truncate">{version.name}</span>
                              {index === 0 && (
                                <span className="px-2 py-0.5 bg-blue-600 text-white rounded text-xs flex-shrink-0">
                                  Latest
                                </span>
                              )}
                            </div>
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
                        <button
                          className={`p-2 rounded-md transition-colors ${
                            index === 0
                              ? 'text-blue-600 hover:bg-blue-100'
                              : 'text-gray-600 hover:bg-gray-200'
                          }`}
                          aria-label="Download this version" title="Download this version"
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
                <h2 className="text-gray-900">File Properties</h2>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <FileText className="w-4 h-4 text-gray-600" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">File Name</div>
                      <div className="text-sm text-gray-900">{resume.name.replace(' ', '_')}_Resume.pdf</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <HardDrive className="w-4 h-4 text-gray-600" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">File Size</div>
                      <div className="text-sm text-gray-900">
                        {resume.versions && resume.versions.length > 0 
                          ? resume.versions[0].size 
                          : '245 KB'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <File className="w-4 h-4 text-gray-600" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">File Type</div>
                      <div className="text-sm text-gray-900">PDF Document</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <Calendar className="w-4 h-4 text-gray-600" />
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
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <Clock className="w-4 h-4 text-gray-600" />
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
                        {resume.versions ? resume.versions.length : 1} version{resume.versions && resume.versions.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Upload History */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-6">
                <Clock className="w-5 h-5 text-orange-600" />
                <h2 className="text-gray-900">Upload History</h2>
              </div>
              <div className="space-y-3">
                {resume.versions && resume.versions.length > 0 ? (
                  resume.versions.sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime()).map((version, index) => {
                    const uploadDate = new Date(version.uploadDate);
                    const now = new Date();
                    const diffTime = Math.abs(now.getTime() - uploadDate.getTime());
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    
                    let timeAgo = '';
                    if (diffDays === 0) timeAgo = 'Today';
                    else if (diffDays === 1) timeAgo = 'Yesterday';
                    else if (diffDays < 7) timeAgo = `${diffDays} days ago`;
                    else if (diffDays < 30) timeAgo = `${Math.floor(diffDays / 7)} weeks ago`;
                    else if (diffDays < 365) timeAgo = `${Math.floor(diffDays / 30)} months ago`;
                    else timeAgo = `${Math.floor(diffDays / 365)} years ago`;

                    return (
                      <div key={version.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          index === 0 ? 'bg-success' : 'bg-gray-400'
                        }`} />
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-gray-900">
                              {index === 0 ? 'Current version uploaded' : `Version ${resume.versions!.length - index} uploaded`}
                            </span>
                            <span className="text-xs text-gray-500">{timeAgo}</span>
                          </div>
                          <div className="text-xs text-gray-600">
                            Uploaded by <span className="text-gray-900">{version.uploadedBy}</span> • {version.size} • {version.name}
                          </div>
                        </div>
                        {index === 0 && (
                          <span className="px-2 py-1 bg-success-subtle text-success rounded text-xs">
                            Active
                          </span>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="w-2 h-2 rounded-full flex-shrink-0 bg-success" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-900">Resume uploaded</span>
                        <span className="text-xs text-gray-500">
                          {formatISTDate(resume.uploadDate)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600">
                        Uploaded by <span className="text-gray-900">{resume.uploadedBy === 'current-user' ? 'You' : resume.uploadedBy}</span>
                      </div>
                    </div>
                    <span className="px-2 py-1 bg-success-subtle text-success rounded text-xs">
                      Active
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Metadata Summary */}
            <div className="bg-gradient-to-r from-gray-50 to-blue-50 border-2 border-gray-300 rounded-lg p-4">
              <div className="grid grid-cols-4 gap-4 text-sm">
                <div className="text-center">
                  <div className="text-xs text-gray-500 mb-1">Document ID</div>
                  <div className="text-gray-900">#{resume.id.substring(0, 8).toUpperCase()}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500 mb-1">Source</div>
                  <div className="text-gray-900">{resume.source}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500 mb-1">Folder</div>
                  <div className="text-gray-900">{resume.folderId || '—'}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500 mb-1">Status</div>
                  <div className="inline-flex items-center px-2 py-1 bg-success-subtle text-success rounded text-xs">
                    Active
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Version Selector Modal */}
      {showVersionSelector && resume.versions && resume.versions.length > 1 && (
        <ResumeVersionSelector
          resume={resume}
          onSelect={handleVersionSelect}
          onClose={() => setShowVersionSelector(false)}
        />
      )}
    </div>
  );
}