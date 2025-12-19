import { X, Target, Award, CheckCircle, XCircle, TrendingUp, Mail, Phone, MapPin, Briefcase, GraduationCap, Star, Calendar, User, Zap, FileText, AlertCircle, Download, ArrowRight, Clock, BarChart3, CheckSquare, MinusCircle, Building2, ChevronRight, Code, Languages } from 'lucide-react';
import { useState } from 'react';
import DetailedScorecardTab from './DetailedScorecardTab';
import ContactCandidateModal from './ContactCandidateModal';
import ResumePreviewModal from './ResumePreviewModal';

interface DetailedScores {
  titleMatch: number;
  experienceMatch: number;
  skillsMatch: number;
  educationMatch: number;
  locationMatch: number;
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
  education?: string;
  certifications?: string[];
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
    if (score >= 85) return 'text-green-600';
    if (score >= 70) return 'text-blue-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 85) return 'bg-green-100 border-green-300 text-green-700';
    if (score >= 70) return 'bg-blue-100 border-blue-300 text-blue-700';
    if (score >= 60) return 'bg-yellow-100 border-yellow-300 text-yellow-700';
    return 'bg-red-100 border-red-300 text-red-700';
  };

  const getProgressBarColor = (score: number) => {
    if (score >= 85) return 'bg-green-600';
    if (score >= 70) return 'bg-blue-600';
    if (score >= 60) return 'bg-yellow-600';
    return 'bg-red-600';
  };

  const getMatchStatusColor = (status: string) => {
    if (status === 'Excellent Match') return 'bg-green-100 text-green-700 border-green-300';
    if (status === 'Partial Match') return 'bg-yellow-100 text-yellow-700 border-yellow-300';
    return 'bg-red-100 text-red-700 border-red-300';
  };

  const handleDownloadScorecard = () => {
    alert(`Downloading scorecard for ${resume.candidateName}\n\nIncludes:\n• Overall match score: ${resume.scorePercentage}%\n• Detailed scoring breakdown\n• Skills analysis\n• AI recommendations\n\nFile will be downloaded as PDF.`);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-b-2 border-blue-200 p-6 flex-shrink-0">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-4 flex-1">
              <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                <Target className="w-8 h-8 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-2xl text-gray-900 font-bold mb-1">{resume.candidateName}</h2>
                <p className="text-gray-700 mb-2 font-medium">{resume.title || 'Candidate'}</p>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <span className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-lg border border-gray-200">
                    <Mail className="w-4 h-4 text-blue-600" />
                    <span className="text-gray-900">{resume.email}</span>
                  </span>
                  <span className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-lg border border-gray-200">
                    <Phone className="w-4 h-4 text-green-600" />
                    <span className="text-gray-900">{resume.phone}</span>
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-600 hover:bg-gray-200 rounded-lg p-2 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Score Display */}
          <div className="bg-white rounded-lg p-5 border-2 border-blue-200 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600 mb-2 font-medium">Overall Match Score</div>
                <div className="flex items-center gap-3">
                  <div className="text-5xl font-bold text-blue-600">{resume.scorePercentage}%</div>
                  <span className={`px-4 py-2 rounded-lg text-sm font-medium border-2 ${getMatchStatusColor(resume.matchStatus)}`}>
                    {resume.matchStatus}
                  </span>
                </div>
              </div>
              <div className="text-right bg-gray-50 px-6 py-4 rounded-lg border border-gray-200">
                <div className="text-sm text-gray-600 mb-1 font-medium">Position</div>
                <div className="text-lg font-bold text-gray-900">{jobTitle}</div>
                <div className="text-xs text-gray-600 mt-2 flex items-center gap-1.5 justify-end">
                  <Clock className="w-3.5 h-3.5" />
                  Scored on {new Date(resume.scoredDate).toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric', 
                    year: 'numeric' 
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 bg-gray-50 flex-shrink-0">
          <div className="flex gap-1 px-6">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === 'overview'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('comparison')}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === 'comparison'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              JD Comparison
            </button>
            <button
              onClick={() => setActiveTab('scoretable')}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === 'scoretable'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Score Table
            </button>
            <button
              onClick={() => setActiveTab('personalinfo')}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === 'personalinfo'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                  : 'text-gray-600 hover:text-gray-900'
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
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-200 rounded-lg p-6">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Zap className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-gray-900 mb-2">AI Match Analysis</h3>
                    <p className="text-gray-700 leading-relaxed">{resume.aiReasoning}</p>
                  </div>
                </div>
              </div>

              {/* Skills Match */}
              <div className="bg-white border border-gray-200 rounded-lg p-5">
                <h3 className="text-gray-900 mb-4 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  Matched Skills ({resume.matchedSkills.length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {resume.matchedSkills.map((skill, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1.5 bg-green-100 text-green-700 border border-green-300 rounded-lg text-sm font-medium flex items-center gap-1"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              {/* Missing Skills */}
              {resume.missingSkills.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-lg p-5">
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
              <div className="bg-white border border-gray-200 rounded-lg p-5">
                <h3 className="text-gray-900 mb-4 flex items-center gap-2">
                  <Star className="w-5 h-5 text-yellow-600" />
                  Key Strengths
                </h3>
                <ul className="space-y-2">
                  {resume.keyStrengths.map((strength, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-gray-700">
                      <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <span className="text-sm">{strength}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Improvement Areas */}
              {resume.improvementAreas.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-lg p-5">
                  <h3 className="text-gray-900 mb-4 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-orange-600" />
                    Areas for Development
                  </h3>
                  <ul className="space-y-2">
                    {resume.improvementAreas.map((area, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-gray-700">
                        <AlertCircle className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
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
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="text-gray-900 mb-4">Job Requirements Analysis</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-3">What We're Looking For</h4>
                      <ul className="space-y-2 text-sm text-gray-600">
                        <li className="flex items-start gap-2">
                          <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
                          <span>Senior-level experience (5+ years)</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
                          <span>Strong technical skills in required areas</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
                          <span>Proven track record in similar roles</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
                          <span>Relevant education and certifications</span>
                        </li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-3">Candidate Profile</h4>
                      <ul className="space-y-2 text-sm text-gray-600">
                        <li className="flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span>{resume.experience || 'Experience level not specified'}</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span>{resume.matchedSkills.length} matched technical skills</span>
                        </li>
                        <li className="flex items-start gap-2">
                          {resume.currentCompany ? (
                            <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                          )}
                          <span>{resume.currentCompany || 'Current company not specified'}</span>
                        </li>
                        <li className="flex items-start gap-2">
                          {resume.education ? (
                            <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                          )}
                          <span>{resume.education || 'Education not specified'}</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Overall Recommendation */}
              <div className={`rounded-lg p-5 border-2 ${
                resume.scorePercentage >= 85
                  ? 'bg-green-50 border-green-300'
                  : resume.scorePercentage >= 70
                  ? 'bg-blue-50 border-blue-300'
                  : resume.scorePercentage >= 60
                  ? 'bg-yellow-50 border-yellow-300'
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
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Star className="w-5 h-5 text-yellow-600" />
                  <h2 className="text-gray-900">Professional Summary</h2>
                </div>
                <p className="text-gray-700 leading-relaxed">
                  Experienced {resume.title?.toLowerCase() || 'professional'} with {resume.experience || 'extensive experience'} in the field. 
                  Strong expertise in {resume.matchedSkills.slice(0, 3).join(', ')}, and more. 
                  Proven track record of delivering results and driving excellence. Passionate about continuous learning and professional development.
                </p>
              </div>

              {/* Work Experience */}
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-6">
                  <Briefcase className="w-5 h-5 text-blue-600" />
                  <h2 className="text-gray-900">Work Experience</h2>
                </div>
                <div className="space-y-6">
                  {/* Current Position */}
                  <div className="relative pl-6 pb-6 border-l-2 border-blue-200">
                    <div className="absolute -left-2 top-0 w-4 h-4 rounded-full bg-blue-600 border-2 border-white"></div>
                    <div className="mb-3">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="text-gray-900 mb-1">{resume.title || 'Position Not Specified'}</h3>
                          <div className="flex items-center gap-2 text-gray-700 mb-1">
                            <Building2 className="w-4 h-4" />
                            <span>{resume.currentCompany || 'Company Not Specified'}</span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {resume.location || 'Location Not Specified'}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              Jan 2020 - Present
                            </span>
                            <span className="text-blue-600">({resume.experience || 'N/A'})</span>
                          </div>
                        </div>
                      </div>
                      <p className="text-gray-700 mb-3">
                        Leading development and implementation of enterprise solutions using {resume.matchedSkills.slice(0, 3).join(', ')}.
                      </p>
                      <div className="space-y-2">
                        <div className="flex items-start gap-2 text-sm text-gray-700">
                          <ChevronRight className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                          <span>Architected and implemented solutions improving system performance and efficiency</span>
                        </div>
                        <div className="flex items-start gap-2 text-sm text-gray-700">
                          <ChevronRight className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                          <span>Led team in agile environment, delivering features on schedule</span>
                        </div>
                        <div className="flex items-start gap-2 text-sm text-gray-700">
                          <ChevronRight className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                          <span>Implemented best practices and contributed to team growth</span>
                        </div>
                        <div className="flex items-start gap-2 text-sm text-gray-700">
                          <ChevronRight className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                          <span>Mentored team members and drove technical excellence</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Previous Position */}
                  <div className="relative pl-6 pb-0 border-l-2 border-blue-200">
                    <div className="absolute -left-2 top-0 w-4 h-4 rounded-full bg-blue-400 border-2 border-white"></div>
                    <div className="mb-3">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="text-gray-900 mb-1">{resume.title?.replace('Senior ', '').replace('Lead ', '') || 'Previous Position'}</h3>
                          <div className="flex items-center gap-2 text-gray-700 mb-1">
                            <Building2 className="w-4 h-4" />
                            <span>Previous Company</span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {resume.location || 'Location Not Specified'}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              Mar 2018 - Dec 2019
                            </span>
                            <span className="text-blue-600">(1 year 10 months)</span>
                          </div>
                        </div>
                      </div>
                      <p className="text-gray-700 mb-3">Full-stack development and implementation of enterprise solutions.</p>
                      <div className="space-y-2">
                        <div className="flex items-start gap-2 text-sm text-gray-700">
                          <ChevronRight className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                          <span>Built features using modern technology stack</span>
                        </div>
                        <div className="flex items-start gap-2 text-sm text-gray-700">
                          <ChevronRight className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                          <span>Optimized performance reducing load time significantly</span>
                        </div>
                        <div className="flex items-start gap-2 text-sm text-gray-700">
                          <ChevronRight className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                          <span>Developed APIs consumed by multiple applications</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Education */}
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-6">
                  <GraduationCap className="w-5 h-5 text-purple-600" />
                  <h2 className="text-gray-900">Education</h2>
                </div>
                <div className="space-y-4">
                  <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                    <h3 className="text-gray-900 mb-2">{resume.education || 'Bachelor of Science in Computer Science'}</h3>
                    <div className="text-gray-700 mb-1">
                      {resume.education?.split(',')[1]?.trim() || 'University'}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {resume.location || 'United States'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        2016
                      </span>
                      <span className="text-purple-700">GPA: 3.8/4.0</span>
                      <span className="px-2 py-0.5 bg-purple-600 text-white rounded text-xs">
                        Magna Cum Laude
                      </span>
                    </div>
                  </div>
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
                                level >= 90 ? 'bg-green-600' :
                                level >= 75 ? 'bg-blue-600' :
                                level >= 60 ? 'bg-yellow-600' :
                                'bg-orange-600'
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
                    {['Leadership & Team Management', 'Agile/Scrum Methodologies', 'Technical Documentation', 'Problem Solving', 'Communication', 'Mentorship'].map((skill, index) => (
                      <span key={index} className="px-4 py-2 bg-green-50 text-green-700 rounded-lg text-sm border border-green-200">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Certifications */}
              {resume.certifications && resume.certifications.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <Award className="w-5 h-5 text-yellow-600" />
                    <h2 className="text-gray-900">Certifications</h2>
                  </div>
                  <div className="space-y-4">
                    {resume.certifications.map((cert, index) => (
                      <div key={index} className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="text-gray-900 mb-1">{cert}</h3>
                            <div className="text-sm text-gray-700 mb-1">Issuing Organization</div>
                            <div className="flex items-center gap-4 text-xs text-gray-600">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                Issued Nov 2023
                              </span>
                              <span>ID: CERT-{index + 1}2345</span>
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
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-6">
                  <Languages className="w-5 h-5 text-indigo-600" />
                  <h2 className="text-gray-900">Languages</h2>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg text-center">
                    <div className="text-gray-900 mb-1">English</div>
                    <div className="text-sm text-indigo-700">Native</div>
                  </div>
                  <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg text-center">
                    <div className="text-gray-900 mb-1">Spanish</div>
                    <div className="text-sm text-indigo-700">Professional Working</div>
                  </div>
                  <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg text-center">
                    <div className="text-gray-900 mb-1">French</div>
                    <div className="text-sm text-indigo-700">Elementary</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-gray-200 bg-gray-50 p-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowResumePreview(true)}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-white transition-colors flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              View Full Resume
            </button>
            <button
              onClick={handleDownloadScorecard}
              className="px-4 py-2 text-sm text-blue-700 border border-blue-300 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download Scorecard
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-6 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
            >
              Close
            </button>
            <button
              onClick={() => setShowContactModal(true)}
              className="px-6 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center gap-2"
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