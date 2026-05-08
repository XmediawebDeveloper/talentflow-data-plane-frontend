import { X, Target, Award, CheckCircle, XCircle, TrendingUp, Mail, Phone, MapPin, Briefcase, GraduationCap, Star, Calendar, User, Zap, FileText, AlertCircle, Download, ArrowRight, Clock, BarChart3, CheckSquare, MinusCircle, Building2, ChevronRight, Code, Languages } from 'lucide-react';
import { useState } from 'react';
import DetailedScorecardTab from './DetailedScorecardTab';
import ContactCandidateModal from './ContactCandidateModal';
import ResumePreviewModal from './ResumePreviewModal';
import { formatISTDate } from '@/lib/utils/dateUtils';
import { toast } from 'sonner';

interface DetailedScores {
  titleMatch: number;
  experienceMatch: number;
  skillsMatch: number;
  educationMatch: number;
  locationMatch: number;
}

interface ExperienceDetail {
  title?: string;
  company?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  duration?: string;
  description?: string;
  achievements?: string[];
}

interface EducationDetail {
  degree?: string;
  school?: string;
  institution?: string;
  location?: string;
  year?: string;
  gpa?: string;
  honors?: string;
}

interface LanguageDetail {
  name?: string;
  language?: string;
  proficiency?: string;
  level?: string;
}

interface ScoredResumeDetail {
  id: string;
  candidateName: string;
  email: string;
  phone: string;
  matchStatus: string;
  scorePercentage: number;
  scoredDate: string;
  scoredBy: string;
  experience?: string;
  education?: string | any[];
  certifications?: string[] | any[];
  currentCompany?: string;
  location?: string;
  title?: string;

  // Detailed scoring information
  detailedScores: DetailedScores;
  matchedSkills: string[];
  missingSkills: string[];
  keyStrengths: string[];
  improvementAreas: string[];
  aiReasoning: string;
  recommendations: string[];

  // Extended data for all tabs
  scoreBreakdown?: any[];
  criteriaScores?: Record<string, any>;
  experienceDetails?: ExperienceDetail[];
  educationDetails?: EducationDetail[] | any[];
  technicalSkills?: string[];
  softSkills?: string[];
  languages?: LanguageDetail[] | string[];
  professionalSummary?: string;
}

interface ScoringResultDetailModalProps {
  resume: ScoredResumeDetail;
  jobTitle: string;
  onClose: () => void;
}

export default function ScoringResultDetailModal({ resume, jobTitle, onClose }: ScoringResultDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'comparison' | 'scoretable' | 'personalinfo'>('overview');
  const [showResumePreview, setShowResumePreview] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-brand-cyan';
    if (score >= 70) return 'text-brand-blue';
    if (score >= 60) return 'text-brand-orange-deep';
    return 'text-red-600';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 85) return 'bg-brand-cyan/10 border-brand-cyan/30 text-brand-cyan';
    if (score >= 70) return 'bg-brand-blue/10 border-brand-blue/30 text-brand-blue';
    if (score >= 60) return 'bg-brand-orange/10 border-brand-orange/30 text-brand-orange-deep';
    return 'bg-red-100 border-red-300 text-red-700';
  };

  const getProgressBarColor = (score: number) => {
    if (score >= 85) return 'bg-brand-cyan';
    if (score >= 70) return 'bg-brand-blue';
    if (score >= 60) return 'bg-brand-orange';
    return 'bg-red-600';
  };

  const getMatchStatusColor = (status: string) => {
    if (status === 'Exact Match' || status === 'Excellent Match') return 'bg-brand-cyan/10 text-brand-cyan border-brand-cyan/30';
    if (status === 'Partial Match') return 'bg-brand-orange/10 text-brand-orange-deep border-brand-orange/30';
    return 'bg-red-100 text-red-700 border-red-300';
  };

  const handleDownloadScorecard = () => {
    toast.info(`Downloading scorecard for ${resume.candidateName}`);
  };

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
      <div className="bg-white rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] w-full max-w-6xl max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-slate-50 border-b border-gray-100 px-4 sm:px-6 py-4 flex-shrink-0">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-4 flex-1">
              <div className="h-9 w-9 sm:h-10 sm:w-10 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg flex items-center justify-center flex-shrink-0">
                <Target className="w-5 h-5 text-brand-blue" />
              </div>
              <div className="flex-1">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-1">{resume.candidateName}</h2>
                <p className="text-gray-700 mb-2 font-medium">{resume.title || 'Candidate'}</p>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <span className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-lg border border-gray-100 ring-1 ring-black/[0.02]">
                    <Mail className="w-4 h-4 text-brand-blue" />
                    <span className="text-gray-900">{resume.email}</span>
                  </span>
                  <span className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-lg border border-gray-100 ring-1 ring-black/[0.02]">
                    <Phone className="w-4 h-4 text-brand-cyan" />
                    <span className="text-gray-900">{resume.phone}</span>
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:bg-brand-blue/5 hover:text-brand-blue rounded-lg p-2 transition-colors"
             aria-label="Close">
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Score Display */}
          <div className="bg-white rounded-xl p-5 border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600 mb-2 font-medium">Overall Match Score</div>
                <div className="flex items-center gap-3">
                  <div className="text-5xl font-bold text-brand-blue">{resume.scorePercentage}%</div>
                  <span className={`px-4 py-2 rounded-lg text-sm font-medium border ${getMatchStatusColor(resume.matchStatus)}`}>
                    {resume.matchStatus}
                  </span>
                </div>
              </div>
              <div className="text-right bg-slate-50 px-6 py-4 rounded-lg border border-gray-100">
                <div className="text-sm text-gray-600 mb-1 font-medium">Position</div>
                <div className="text-lg font-bold text-gray-900">{jobTitle}</div>
                <div className="text-xs text-gray-600 mt-2 flex items-center gap-1.5 justify-end">
                  <Clock className="w-3.5 h-3.5" />
                  Scored on {formatISTDate(resume.scoredDate)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-100 bg-slate-50 flex-shrink-0">
          <div className="flex gap-1 px-6">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === 'overview'
                  ? 'text-brand-blue border-b-2 border-brand-blue bg-white'
                  : 'text-gray-600 hover:text-brand-blue'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('comparison')}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === 'comparison'
                  ? 'text-brand-blue border-b-2 border-brand-blue bg-white'
                  : 'text-gray-600 hover:text-brand-blue'
              }`}
            >
              JD Comparison
            </button>
            <button
              onClick={() => setActiveTab('scoretable')}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === 'scoretable'
                  ? 'text-brand-blue border-b-2 border-brand-blue bg-white'
                  : 'text-gray-600 hover:text-brand-blue'
              }`}
            >
              Score Table
            </button>
            <button
              onClick={() => setActiveTab('personalinfo')}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === 'personalinfo'
                  ? 'text-brand-blue border-b-2 border-brand-blue bg-white'
                  : 'text-gray-600 hover:text-brand-blue'
              }`}
            >
              Personal Info
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* AI Analysis */}
              <div className="bg-brand-blue/5 ring-1 ring-brand-blue/15 border border-brand-blue/20 rounded-xl p-6">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Zap className="w-5 h-5 text-brand-blue" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-gray-900 mb-2">AI Match Analysis</h3>
                    <p className="text-gray-700 leading-relaxed">{resume.aiReasoning}</p>
                  </div>
                </div>
              </div>

              {/* Skills Match */}
              <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-5">
                <h3 className="text-gray-900 mb-4 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-brand-cyan" />
                  Matched Skills ({resume.matchedSkills.length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {resume.matchedSkills.map((skill, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1.5 bg-brand-cyan/10 text-brand-cyan border border-brand-cyan/30 rounded-lg text-sm font-medium flex items-center gap-1"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              {/* Missing Skills */}
              {resume.missingSkills.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-5">
                  <h3 className="text-gray-900 mb-4 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-red-600" />
                    Skills Gap ({resume.missingSkills.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {resume.missingSkills.map((skill, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1.5 bg-red-100 text-red-700 border border-red-300 rounded-lg text-sm font-medium flex items-center gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Key Strengths */}
              <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-5">
                <h3 className="text-gray-900 mb-4 flex items-center gap-2">
                  <Star className="w-5 h-5 text-brand-orange-deep" />
                  Key Strengths
                </h3>
                <ul className="space-y-2">
                  {resume.keyStrengths.map((strength, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-gray-700">
                      <CheckCircle className="w-4 h-4 text-brand-cyan mt-0.5 flex-shrink-0" />
                      <span className="text-sm">{strength}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Improvement Areas */}
              {resume.improvementAreas.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-5">
                  <h3 className="text-gray-900 mb-4 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-brand-orange-deep" />
                    Areas for Development
                  </h3>
                  <ul className="space-y-2">
                    {resume.improvementAreas.map((area, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-gray-700">
                        <AlertCircle className="w-4 h-4 text-brand-orange-deep mt-0.5 flex-shrink-0" />
                        <span className="text-sm">{area}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {activeTab === 'comparison' && (
            <div className="space-y-6">
              {/* Job Requirements vs Candidate Profile */}
              <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-6">
                <h3 className="text-gray-900 mb-4">Job Requirements Analysis</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-3">What We're Looking For</h4>
                      <ul className="space-y-2 text-sm text-gray-600">
                        <li className="flex items-start gap-2">
                          <div className="w-1.5 h-1.5 bg-brand-blue rounded-full mt-2 flex-shrink-0"></div>
                          <span>Senior-level experience (5+ years)</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <div className="w-1.5 h-1.5 bg-brand-blue rounded-full mt-2 flex-shrink-0"></div>
                          <span>Strong technical skills in required areas</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <div className="w-1.5 h-1.5 bg-brand-blue rounded-full mt-2 flex-shrink-0"></div>
                          <span>Proven track record in similar roles</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <div className="w-1.5 h-1.5 bg-brand-blue rounded-full mt-2 flex-shrink-0"></div>
                          <span>Relevant education and certifications</span>
                        </li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-3">Candidate Profile</h4>
                      <ul className="space-y-2 text-sm text-gray-600">
                        <li className="flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-brand-cyan mt-0.5 flex-shrink-0" />
                          <span>{resume.experience || 'Experience level not specified'}</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-brand-cyan mt-0.5 flex-shrink-0" />
                          <span>{resume.matchedSkills.length} matched technical skills</span>
                        </li>
                        <li className="flex items-start gap-2">
                          {resume.currentCompany ? (
                            <CheckCircle className="w-4 h-4 text-brand-cyan mt-0.5 flex-shrink-0" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-brand-orange-deep mt-0.5 flex-shrink-0" />
                          )}
                          <span>{resume.currentCompany || 'Current company not specified'}</span>
                        </li>
                        <li className="flex items-start gap-2">
                          {resume.education ? (
                            <CheckCircle className="w-4 h-4 text-brand-cyan mt-0.5 flex-shrink-0" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-brand-orange-deep mt-0.5 flex-shrink-0" />
                          )}
                          <span>
                            {typeof resume.education === 'string'
                              ? resume.education
                              : Array.isArray(resume.education) && resume.education.length > 0
                                ? (resume.education[0]?.degree || resume.education[0]?.institution || 'Education available')
                                : 'Education not specified'}
                          </span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Overall Recommendation */}
              <div className={`rounded-xl p-5 border ${
                resume.scorePercentage >= 85
                  ? 'bg-brand-cyan/5 ring-1 ring-brand-cyan/20 border-brand-cyan/30'
                  : resume.scorePercentage >= 70
                  ? 'bg-brand-blue/5 ring-1 ring-brand-blue/15 border-brand-blue/20'
                  : resume.scorePercentage >= 60
                  ? 'bg-brand-orange/5 ring-1 ring-brand-orange/20 border-brand-orange/30'
                  : 'bg-red-50 border-red-300'
              }`}>
                <h4 className="text-gray-900 mb-2 flex items-center gap-2">
                  <Award className="w-5 h-5" />
                  Overall Recommendation
                </h4>
                <p className="text-sm text-gray-700">
                  {resume.scorePercentage >= 85
                    ? 'Highly recommended candidate. Strong alignment with job requirements across all key areas. Proceed to interview stage immediately.'
                    : resume.scorePercentage >= 70
                    ? 'Good candidate with solid qualifications. Some minor gaps that can be addressed. Recommended for interview consideration.'
                    : resume.scorePercentage >= 60
                    ? 'Moderate fit. Consider if pipeline is limited, but may require additional training and development.'
                    : 'Limited fit for this role. Significant gaps in required qualifications. Consider other opportunities.'}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'scoretable' && (
            <DetailedScorecardTab
              resume={resume}
              jobTitle={jobTitle}
              getScoreColor={getScoreColor}
              getScoreBgColor={getScoreBgColor}
              getProgressBarColor={getProgressBarColor}
            />
          )}

          {activeTab === 'personalinfo' && (
            <div className="space-y-6">
              {/* Professional Summary */}
              <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Star className="w-5 h-5 text-brand-orange-deep" />
                  <h2 className="text-gray-900">Professional Summary</h2>
                </div>
                <p className="text-gray-700 leading-relaxed">
                  {resume.professionalSummary || resume.aiReasoning || `Experienced ${resume.title?.toLowerCase() || 'professional'} with ${resume.experience || 'extensive experience'} in the field. Strong expertise in ${resume.matchedSkills?.slice(0, 3).join(', ') || 'various technologies'}. Proven track record of delivering results and driving excellence.`}
                </p>
              </div>

              {/* Work Experience */}
              <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-6">
                <div className="flex items-center gap-2 mb-6">
                  <Briefcase className="w-5 h-5 text-brand-blue" />
                  <h2 className="text-gray-900">Work Experience</h2>
                </div>
                <div className="space-y-6">
                  {resume.experienceDetails && Array.isArray(resume.experienceDetails) && resume.experienceDetails.length > 0 ? (
                    resume.experienceDetails.map((exp: ExperienceDetail, index: number) => (
                      <div key={index} className={`relative pl-6 ${index < resume.experienceDetails!.length - 1 ? 'pb-6' : 'pb-0'} border-l-2 border-gray-200`}>
                        <div className={`absolute -left-2 top-0 w-4 h-4 rounded-full ${index === 0 ? 'bg-brand-blue' : 'bg-brand-blue/60'} border-2 border-white`}></div>
                        <div className="mb-3">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <h3 className="text-gray-900 mb-1">{exp.title || 'Position'}</h3>
                              <div className="flex items-center gap-2 text-gray-700 mb-1">
                                <Building2 className="w-4 h-4" />
                                <span>{exp.company || 'Company'}</span>
                              </div>
                              <div className="flex items-center gap-4 text-sm text-gray-600">
                                {exp.location && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {exp.location}
                                  </span>
                                )}
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {exp.startDate || 'Start'} - {exp.endDate || 'Present'}
                                </span>
                                {exp.duration && <span className="text-brand-blue">({exp.duration})</span>}
                              </div>
                            </div>
                          </div>
                          {exp.description && <p className="text-gray-700 mb-3">{exp.description}</p>}
                          {exp.achievements && exp.achievements.length > 0 && (
                            <div className="space-y-2">
                              {exp.achievements.map((achievement: string, achIndex: number) => (
                                <div key={achIndex} className="flex items-start gap-2 text-sm text-gray-700">
                                  <ChevronRight className="w-4 h-4 text-brand-cyan flex-shrink-0 mt-0.5" />
                                  <span>{achievement}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="relative pl-6 pb-0 border-l-2 border-gray-200">
                      <div className="absolute -left-2 top-0 w-4 h-4 rounded-full bg-brand-blue border-2 border-white"></div>
                      <div className="mb-3">
                        <h3 className="text-gray-900 mb-1">{resume.title || 'Current Position'}</h3>
                        <div className="flex items-center gap-2 text-gray-700 mb-1">
                          <Building2 className="w-4 h-4" />
                          <span>{resume.currentCompany || 'Company'}</span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          {resume.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {resume.location}
                            </span>
                          )}
                          {resume.experience && <span className="text-brand-blue">({resume.experience})</span>}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Education */}
              <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-6">
                <div className="flex items-center gap-2 mb-6">
                  <GraduationCap className="w-5 h-5 text-brand-blue" />
                  <h2 className="text-gray-900">Education</h2>
                </div>
                <div className="space-y-4">
                  {resume.educationDetails && Array.isArray(resume.educationDetails) && resume.educationDetails.length > 0 ? (
                    resume.educationDetails.map((edu: EducationDetail, index: number) => (
                      <div key={index} className="p-4 bg-slate-50 border border-gray-100 rounded-lg">
                        <h3 className="text-gray-900 mb-2">{edu.degree || 'Degree'}</h3>
                        <div className="text-gray-700 mb-1">{edu.school || edu.institution || 'Institution'}</div>
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
                          {edu.gpa && <span className="text-gray-900">GPA: {edu.gpa}</span>}
                          {edu.honors && (
                            <span className="px-2 py-0.5 bg-brand-blue text-white rounded text-xs">
                              {edu.honors}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  ) : typeof resume.education === 'string' && resume.education ? (
                    <div className="p-4 bg-slate-50 border border-gray-100 rounded-lg">
                      <h3 className="text-gray-900 mb-2">{resume.education}</h3>
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-50 border border-gray-100 rounded-lg text-gray-500">
                      No education information available
                    </div>
                  )}
                </div>
              </div>

              {/* Skills */}
              <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-6">
                <div className="flex items-center gap-2 mb-6">
                  <Code className="w-5 h-5 text-brand-cyan" />
                  <h2 className="text-gray-900">Skills</h2>
                </div>

                {/* Technical Skills */}
                <div className="mb-6">
                  <h3 className="text-gray-900 mb-4">Technical Skills</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {resume.matchedSkills.slice(0, 8).map((skill, index) => {
                      const level = 95 - (index * 3);
                      return (
                        <div key={index}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-700">{skill}</span>
                            <span className="text-xs text-gray-500">{level}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                level >= 90 ? 'bg-brand-cyan' :
                                level >= 75 ? 'bg-brand-blue' :
                                level >= 60 ? 'bg-brand-orange' :
                                'bg-brand-orange-deep'
                              }`}
                              style={{ width: `${level}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Soft Skills */}
                <div>
                  <h3 className="text-gray-900 mb-4">Soft Skills</h3>
                  <div className="flex flex-wrap gap-2">
                    {(resume.softSkills && resume.softSkills.length > 0
                      ? resume.softSkills
                      : ['Leadership', 'Communication', 'Problem Solving', 'Teamwork']
                    ).map((skill: string, index: number) => (
                      <span key={index} className="px-4 py-2 bg-brand-cyan/5 text-brand-cyan rounded-lg text-sm border border-brand-cyan/20">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Certifications */}
              {resume.certifications && resume.certifications.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <Award className="w-5 h-5 text-brand-orange-deep" />
                    <h2 className="text-gray-900">Certifications</h2>
                  </div>
                  <div className="space-y-4">
                    {resume.certifications.map((cert: any, index: number) => {
                      const certName = typeof cert === 'string' ? cert : (cert.name || cert.title || 'Certification');
                      const certIssuer = typeof cert === 'string' ? null : (cert.issuer || cert.organization);
                      const certDate = typeof cert === 'string' ? null : (cert.date || cert.issued_date);
                      const certId = typeof cert === 'string' ? null : (cert.credential_id || cert.credentialId);

                      return (
                        <div key={index} className="p-4 bg-brand-orange/5 ring-1 ring-brand-orange/20 border border-brand-orange/20 rounded-lg">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="text-gray-900 mb-1">{certName}</h3>
                              {certIssuer && <div className="text-sm text-gray-700 mb-1">{certIssuer}</div>}
                              <div className="flex items-center gap-4 text-xs text-gray-600">
                                {certDate && (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {certDate}
                                  </span>
                                )}
                                {certId && <span>ID: {certId}</span>}
                              </div>
                            </div>
                            <Award className="w-6 h-6 text-brand-orange-deep" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Languages */}
              {resume.languages && resume.languages.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <Languages className="w-5 h-5 text-brand-blue" />
                    <h2 className="text-gray-900">Languages</h2>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    {resume.languages.map((lang: LanguageDetail | string, index: number) => {
                      const langName = typeof lang === 'string' ? lang : (lang.name || lang.language || 'Language');
                      const langProficiency = typeof lang === 'string' ? 'Fluent' : (lang.proficiency || lang.level || 'Fluent');

                      return (
                        <div key={index} className="p-4 bg-slate-50 border border-gray-100 rounded-lg text-center">
                          <div className="text-gray-900 mb-1">{langName}</div>
                          <div className="text-sm text-gray-700">{langProficiency}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-gray-100 bg-slate-50 px-4 sm:px-6 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowResumePreview(true)}
              className="px-4 py-2 text-sm bg-white border border-gray-200 text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              View Full Resume
            </button>
            <button
              onClick={handleDownloadScorecard}
              className="px-4 py-2 text-sm bg-white border border-gray-200 text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download Scorecard
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm bg-white border border-gray-200 text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors"
            >
              Close
            </button>
            <button
              onClick={() => setShowContactModal(true)}
              className="px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors flex items-center gap-2"
            >
              <Mail className="w-4 h-4" />
              Contact Candidate
            </button>
          </div>
        </div>
      </div>

      {/* Resume Preview Modal */}
      {showResumePreview && (
        <ResumePreviewModal
          candidateName={resume.candidateName}
          candidateEmail={resume.email}
          onClose={() => setShowResumePreview(false)}
        />
      )}

      {/* Contact Candidate Modal */}
      {showContactModal && (
        <ContactCandidateModal
          candidateName={resume.candidateName}
          candidateEmail={resume.email}
          candidatePhone={resume.phone}
          jobTitle={jobTitle}
          onClose={() => setShowContactModal(false)}
        />
      )}
    </div>
  );
}