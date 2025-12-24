import { X, Download, Mail, Phone, MapPin, Briefcase, Calendar, Award, Languages, Star, Edit2, Trash2, Send, Building2, GraduationCap, Code, ChevronRight, ExternalLink, Linkedin, Globe } from 'lucide-react';
import { Resume } from '@/lib/types/types';

interface ResumeDetailViewProps {
  resume: Resume;
  onClose: () => void;
  onEdit?: (resume: Resume) => void;
  onDelete?: (resumeId: string) => void;
  onApplyToJob?: (resume: Resume) => void;
}

export default function ResumeDetailView({ resume, onClose, onEdit, onDelete, onApplyToJob }: ResumeDetailViewProps) {
  
  const handleDownload = () => {
    alert('Resume download functionality would trigger here');
  };

  const handleShare = () => {
    alert('Share resume functionality would trigger here');
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this resume?')) {
      onDelete?.(resume.id);
      onClose();
    }
  };

  // Mock detailed data - in production, this would come from the resume object or API
  const detailedResume = {
    ...resume,
    summary: `Experienced ${resume.title.toLowerCase()} with ${resume.experience} of expertise in ${resume.skills.slice(0, 3).join(', ')}, and more. Proven track record of delivering scalable solutions and driving technical excellence. Passionate about clean code, best practices, and continuous learning.`,
    experience: [
      {
        title: resume.title,
        company: 'Tech Corp Inc.',
        location: resume.location || 'Remote',
        startDate: 'Jan 2020',
        endDate: 'Present',
        duration: resume.experience.includes('-') ? resume.experience.split('-')[1].trim() + ' years' : resume.experience,
        description: `Leading development of enterprise applications using ${resume.skills.slice(0, 3).join(', ')}.`,
        achievements: [
          `Architected and implemented solutions using ${resume.skills[0]} and ${resume.skills[1]}, improving system performance by 40%`,
          'Led team of developers in agile environment, delivering features on schedule',
          'Implemented CI/CD pipeline reducing deployment time significantly',
          'Mentored junior developers and contributed to team growth'
        ]
      },
      {
        title: resume.title.replace('Senior ', '').replace('Lead ', ''),
        company: 'StartupXYZ',
        location: resume.location || 'Remote',
        startDate: 'Mar 2018',
        endDate: 'Dec 2019',
        duration: '1 year 10 months',
        description: 'Full-stack development of SaaS platform for project management.',
        achievements: [
          `Built features using ${resume.skills.slice(0, 2).join(' and ')}`,
          'Optimized database queries reducing load time by 60%',
          'Developed RESTful APIs consumed by web and mobile applications'
        ]
      }
    ],
    education: resume.education ? [
      {
        degree: resume.education,
        school: resume.education.split(',')[1]?.trim() || 'University',
        location: resume.location || 'United States',
        year: '2016',
        gpa: '3.8/4.0',
        honors: 'Magna Cum Laude'
      }
    ] : [
      {
        degree: 'Bachelor of Science in Computer Science',
        school: 'University',
        location: resume.location || 'United States',
        year: '2016',
        gpa: '3.8/4.0',
        honors: undefined
      }
    ],
    skills: {
      technical: resume.skills.map((skill, index) => ({
        name: skill,
        level: 95 - (index * 3) // Decreasing proficiency
      })),
      soft: [
        'Leadership & Team Management',
        'Agile/Scrum Methodologies',
        'Technical Documentation',
        'Problem Solving',
        'Communication',
        'Mentorship'
      ]
    },
    certifications: [
      {
        name: 'AWS Certified Solutions Architect - Professional',
        issuer: 'Amazon Web Services',
        date: 'Nov 2023',
        credentialId: 'AWS-12345'
      },
      {
        name: 'Certified Kubernetes Administrator (CKA)',
        issuer: 'Cloud Native Computing Foundation',
        date: 'Jun 2022',
        credentialId: 'CKA-67890'
      }
    ],
    languages: [
      { name: 'English', proficiency: 'Native' },
      { name: 'Spanish', proficiency: 'Professional Working' },
      { name: 'French', proficiency: 'Elementary' }
    ],
    links: {
      linkedin: 'linkedin.com/in/johndoe',
      portfolio: 'johndoe.dev',
      github: 'github.com/johndoe'
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-gray-800 to-gray-800 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-white">Resume Details</h2>
              <p className="text-gray-100 text-sm">{resume.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Bar */}
        <div className="bg-gray-50 border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-white transition-colors text-sm"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
            <button
              onClick={handleShare}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-white transition-colors text-sm"
            >
              <Send className="w-4 h-4" />
              Share
            </button>
            {onEdit && (
              <button
                onClick={() => onEdit(resume)}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-white transition-colors text-sm"
              >
                <Edit2 className="w-4 h-4" />
                Edit
              </button>
            )}
            {onDelete && (
              <button
                onClick={handleDelete}
                className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors text-sm"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            )}
          </div>
          {onApplyToJob && (
            <button
              onClick={() => onApplyToJob(resume)}
              className="flex items-center gap-2 px-6 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors text-sm shadow-md"
            >
              <Send className="w-4 h-4" />
              Apply to Job
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto space-y-6">
            
            {/* Personal Info Card */}
            <div className="bg-white border-2 border-gray-200 rounded-xl p-6 shadow-lg">
              <div className="flex items-start gap-6">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-white text-3xl flex-shrink-0">
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
                      <Mail className="w-4 h-4 text-gray-800" />
                      <a href={`mailto:${resume.email}`} className="hover:text-gray-800">{resume.email}</a>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <Phone className="w-4 h-4 text-gray-800" />
                      <a href={`tel:${resume.phone}`} className="hover:text-gray-800">{resume.phone}</a>
                    </div>
                    {detailedResume.links.linkedin && (
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <Linkedin className="w-4 h-4 text-gray-800" />
                        <a href={`https://${detailedResume.links.linkedin}`} target="_blank" rel="noopener noreferrer" className="hover:text-gray-800 flex items-center gap-1">
                          LinkedIn <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                    {detailedResume.links.portfolio && (
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <Globe className="w-4 h-4 text-gray-800" />
                        <a href={`https://${detailedResume.links.portfolio}`} target="_blank" rel="noopener noreferrer" className="hover:text-gray-800 flex items-center gap-1">
                          Portfolio <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-2">
                    {resume.skills?.slice(0, 8).map((skill, index) => (
                      <span key={index} className="px-3 py-1 bg-gray-50 text-gray-900 rounded-full text-xs border border-gray-200">
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
                <Star className="w-5 h-5 text-yellow-600" />
                <h2 className="text-gray-900">Professional Summary</h2>
              </div>
              <p className="text-gray-700 leading-relaxed">{detailedResume.summary}</p>
            </div>

            {/* Work Experience */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-6">
                <Briefcase className="w-5 h-5 text-gray-800" />
                <h2 className="text-gray-900">Work Experience</h2>
              </div>
              <div className="space-y-6">
                {detailedResume.experience.map((exp, index) => (
                  <div key={index} className="relative pl-6 pb-6 border-l-2 border-gray-200 last:pb-0">
                    <div className="absolute -left-2 top-0 w-4 h-4 rounded-full bg-gray-800 border-2 border-white"></div>
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
                            <span className="text-gray-800">({exp.duration})</span>
                          </div>
                        </div>
                      </div>
                      <p className="text-gray-700 mb-3">{exp.description}</p>
                      <div className="space-y-2">
                        {exp.achievements.map((achievement, achIndex) => (
                          <div key={achIndex} className="flex items-start gap-2 text-sm text-gray-700">
                            <ChevronRight className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
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
                <GraduationCap className="w-5 h-5 text-gray-800" />
                <h2 className="text-gray-900">Education</h2>
              </div>
              <div className="space-y-4">
                {detailedResume.education.map((edu, index) => (
                  <div key={index} className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
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
                        <span className="text-gray-900">GPA: {edu.gpa}</span>
                      )}
                      {edu.honors && (
                        <span className="px-2 py-0.5 bg-gray-800 text-white rounded text-xs">
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
                <Code className="w-5 h-5 text-green-600" />
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
                            skill.level >= 90 ? 'bg-green-600' :
                            skill.level >= 75 ? 'bg-gray-800' :
                            skill.level >= 60 ? 'bg-yellow-600' :
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
                    <span key={index} className="px-4 py-2 bg-green-50 text-green-700 rounded-lg text-sm border border-green-200">
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
                  <Award className="w-5 h-5 text-yellow-600" />
                  <h2 className="text-gray-900">Certifications</h2>
                </div>
                <div className="space-y-4">
                  {detailedResume.certifications.map((cert, index) => (
                    <div key={index} className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-gray-900 mb-1">{cert.name}</h3>
                          <div className="text-sm text-gray-700 mb-1">{cert.issuer}</div>
                          <div className="flex items-center gap-4 text-xs text-gray-600">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              Issued {cert.date}
                            </span>
                            <span>ID: {cert.credentialId}</span>
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
                  <Languages className="w-5 h-5 text-gray-800" />
                  <h2 className="text-gray-900">Languages</h2>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {detailedResume.languages.map((lang, index) => (
                    <div key={index} className="p-4 bg-gray-50 border border-indigo-200 rounded-lg text-center">
                      <div className="text-gray-900 mb-1">{lang.name}</div>
                      <div className="text-sm text-indigo-700">{lang.proficiency}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Metadata */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="grid grid-cols-3 gap-4 text-sm text-gray-600">
                <div>
                  <span className="text-gray-500">Uploaded:</span> {new Date(resume.uploadDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
                <div>
                  <span className="text-gray-500">Attachments:</span> {resume.attachments} file{resume.attachments !== 1 ? 's' : ''}
                </div>
                <div>
                  <span className="text-gray-500">Uploaded By:</span> {resume.uploadedBy === 'current-user' ? 'You' : resume.uploadedBy}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
