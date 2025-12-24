'use client';

import { Target, Award, CheckCircle, XCircle, TrendingUp, Mail, Phone, MapPin, Briefcase, GraduationCap, Star, Calendar, Zap, FileText, AlertCircle, Download, Clock, Building2, ChevronRight, Code, Languages, ArrowLeft } from 'lucide-react';
import { useState } from 'react';

interface ScoredResume {
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
  aiSummary?: string;
  strengths?: string[];
  gaps?: string[];
  matchReason?: string;
  scoreBreakdown?: {
    skillsMatch: number;
    experienceMatch: number;
    educationMatch: number;
    overallFit: number;
  };
  title?: string;
  currentCompany?: string;
  location?: string;
}

interface CandidateScoringDetailPageProps {
  resume: ScoredResume;
  jobTitle: string;
  onBack: () => void;
}

export default function CandidateScoringDetailPage({ resume, jobTitle, onBack }: CandidateScoringDetailPageProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'comparison' | 'scoretable' | 'personalinfo'>('overview');

  // Generate enriched data from resume
  const detailedScores = {
    titleMatch: resume.scoreBreakdown?.overallFit || resume.scorePercentage,
    experienceMatch: resume.scoreBreakdown?.experienceMatch || resume.scorePercentage,
    skillsMatch: resume.scoreBreakdown?.skillsMatch || resume.scorePercentage,
    educationMatch: resume.scoreBreakdown?.educationMatch || resume.scorePercentage,
    locationMatch: resume.scorePercentage,
  };

  const matchedSkills = resume.strengths && resume.strengths.length > 0 ? resume.strengths : [];
  const missingSkills = resume.gaps && resume.gaps.length > 0 ? resume.gaps : [];

  const keyStrengths = resume.strengths && resume.strengths.length > 0
    ? resume.strengths.map(s => `Strong expertise in ${s}`)
    : resume.scorePercentage >= 85
      ? ['Strong alignment with job requirements', 'Excellent technical profile']
      : resume.scorePercentage >= 70
        ? ['Good technical foundation', 'Relevant experience']
        : ['Shows potential for growth'];

  const improvementAreas = resume.gaps && resume.gaps.length > 0
    ? resume.gaps.map(g => `Consider strengthening ${g} skills`)
    : [];

  const aiReasoning = resume.aiSummary || resume.matchReason || (
    resume.matchStatus === 'Exact Match'
      ? 'Outstanding candidate with exceptional alignment to job requirements. Strong technical skills, relevant experience, and proven track record in similar roles.'
      : resume.matchStatus === 'Partial Match'
        ? 'Solid candidate with good alignment to most job requirements. Possesses core technical skills and relevant experience with minor gaps in specialized areas.'
        : 'Limited alignment with current job requirements. While the candidate shows promise in certain areas, there are significant gaps in required technical skills and experience.'
  );

  const recommendations = resume.matchStatus === 'Exact Match'
    ? [
        'Schedule technical interview with senior engineering team',
        'Prepare coding challenge focused on key required skills',
        'Discuss system design capabilities and architectural decision-making',
        'Evaluate cultural fit and alignment with team values',
      ]
    : resume.matchStatus === 'Partial Match'
      ? [
          'Conduct initial screening call to assess motivation and learning agility',
          'Evaluate willingness to upskill in missing technical areas',
          'Consider for mid-level position with mentorship opportunities',
          'Assess problem-solving approach through technical assessment',
        ]
      : [
          'Provide constructive feedback on current skill gaps',
          'Suggest relevant training resources for skill development',
          'Consider for junior positions or internship programs',
          'Keep profile for future opportunities after skill development',
        ];

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
    if (status === 'Exact Match') return 'bg-green-100 text-green-700 border-green-300';
    if (status === 'Partial Match') return 'bg-yellow-100 text-yellow-700 border-yellow-300';
    return 'bg-red-100 text-red-700 border-red-300';
  };

  const handleDownloadScorecard = () => {
    alert(`Downloading scorecard for ${resume.candidateName}\n\nIncludes:\n- Overall match score: ${resume.scorePercentage}%\n- Detailed scoring breakdown\n- Skills analysis\n- AI recommendations\n\nFile will be downloaded as PDF.`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-white">
      {/* Back Button */}
      <div className="px-8 pt-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium transition-colors hover:gap-3"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Scored Resumes
        </button>
      </div>

      {/* Header */}
      <div className="px-8 py-6">
        <div className="bg-white rounded-xl shadow-lg border-2 border-blue-200 p-6">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-4 flex-1">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg">
                <Target className="w-10 h-10 text-white" />
              </div>
              <div className="flex-1">
                <h1 className="text-3xl text-gray-900 font-bold mb-2">{resume.candidateName}</h1>
                <p className="text-lg text-gray-700 mb-3 font-medium">{resume.title || resume.experience || 'Candidate'}</p>
                <div className="flex items-center gap-4 text-sm text-gray-600 flex-wrap">
                  <span className="flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-lg border border-gray-200">
                    <Mail className="w-4 h-4 text-blue-600" />
                    <span className="text-gray-900">{resume.email}</span>
                  </span>
                  <span className="flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-lg border border-gray-200">
                    <Phone className="w-4 h-4 text-green-600" />
                    <span className="text-gray-900">{resume.phone}</span>
                  </span>
                  {resume.location && (
                    <span className="flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-lg border border-gray-200">
                      <MapPin className="w-4 h-4 text-red-500" />
                      <span className="text-gray-900">{resume.location}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={handleDownloadScorecard}
              className="px-4 py-2 text-sm text-blue-700 border-2 border-blue-300 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download Scorecard
            </button>
          </div>

          {/* Score Display */}
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-6 border-2 border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600 mb-2 font-medium">Overall Match Score</div>
                <div className="flex items-center gap-4">
                  <div className={`text-6xl font-bold ${getScoreColor(resume.scorePercentage)}`}>{resume.scorePercentage}%</div>
                  <span className={`px-5 py-2.5 rounded-lg text-sm font-medium border-2 ${getMatchStatusColor(resume.matchStatus)}`}>
                    {resume.matchStatus}
                  </span>
                </div>
              </div>
              <div className="text-right bg-white px-6 py-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="text-sm text-gray-600 mb-1 font-medium">Position</div>
                <div className="text-xl font-bold text-gray-900">{jobTitle}</div>
                <div className="text-xs text-gray-600 mt-2 flex items-center gap-1.5 justify-end">
                  <Clock className="w-3.5 h-3.5" />
                  Scored on {resume.scoredDate}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-8">
        <div className="bg-white rounded-t-xl border-x-2 border-t-2 border-gray-200">
          <div className="flex gap-1 px-6 pt-2">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'comparison', label: 'JD Comparison' },
              { id: 'scoretable', label: 'Score Table' },
              { id: 'personalinfo', label: 'Personal Info' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-6 py-3 text-sm font-medium transition-colors rounded-t-lg ${
                  activeTab === tab.id
                    ? 'text-blue-600 bg-blue-50 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-8 pb-8">
        <div className="bg-white rounded-b-xl border-x-2 border-b-2 border-gray-200 p-6 min-h-[500px]">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* AI Analysis */}
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-200 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Zap className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">AI Match Analysis</h3>
                    <p className="text-gray-700 leading-relaxed">{aiReasoning}</p>
                  </div>
                </div>
              </div>

              {/* Skills Match */}
              {matchedSkills.length > 0 && (
                <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    Matched Skills ({matchedSkills.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {matchedSkills.map((skill, idx) => (
                      <span
                        key={idx}
                        className="px-4 py-2 bg-green-100 text-green-700 border border-green-300 rounded-lg text-sm font-medium flex items-center gap-1.5"
                      >
                        <CheckCircle className="w-4 h-4" />
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing Skills */}
              {missingSkills.length > 0 && (
                <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-red-600" />
                    Skills Gap ({missingSkills.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {missingSkills.map((skill, idx) => (
                      <span
                        key={idx}
                        className="px-4 py-2 bg-red-100 text-red-700 border border-red-300 rounded-lg text-sm font-medium flex items-center gap-1.5"
                      >
                        <XCircle className="w-4 h-4" />
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Key Strengths */}
              <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Star className="w-5 h-5 text-yellow-600" />
                  Key Strengths
                </h3>
                <ul className="space-y-3">
                  {keyStrengths.map((strength, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-gray-700">
                      <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <span>{strength}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Improvement Areas */}
              {improvementAreas.length > 0 && (
                <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-orange-600" />
                    Areas for Development
                  </h3>
                  <ul className="space-y-3">
                    {improvementAreas.map((area, idx) => (
                      <li key={idx} className="flex items-start gap-3 text-gray-700">
                        <AlertCircle className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
                        <span>{area}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recommendations */}
              <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Award className="w-5 h-5 text-blue-600" />
                  Next Steps
                </h3>
                <ul className="space-y-3">
                  {recommendations.map((rec, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-gray-700">
                      <ChevronRight className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'comparison' && (
            <div className="space-y-6">
              <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-6">Job Requirements Analysis</h3>
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <h4 className="font-medium text-gray-700 mb-4 text-lg">What We're Looking For</h4>
                    <ul className="space-y-3 text-gray-600">
                      <li className="flex items-start gap-3">
                        <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
                        <span>Senior-level experience (5+ years)</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
                        <span>Strong technical skills in required areas</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
                        <span>Proven track record in similar roles</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
                        <span>Relevant education and certifications</span>
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-700 mb-4 text-lg">Candidate Profile</h4>
                    <ul className="space-y-3 text-gray-600">
                      <li className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>{resume.experience || 'Experience level not specified'}</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>{matchedSkills.length} matched technical skills</span>
                      </li>
                      <li className="flex items-start gap-3">
                        {resume.currentCompany ? (
                          <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                        )}
                        <span>{resume.currentCompany || 'Current company not specified'}</span>
                      </li>
                      <li className="flex items-start gap-3">
                        {resume.education ? (
                          <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                        )}
                        <span>{resume.education || 'Education not specified'}</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Overall Recommendation */}
              <div className={`rounded-xl p-6 border-2 ${
                resume.scorePercentage >= 85
                  ? 'bg-green-50 border-green-300'
                  : resume.scorePercentage >= 70
                  ? 'bg-blue-50 border-blue-300'
                  : resume.scorePercentage >= 60
                  ? 'bg-yellow-50 border-yellow-300'
                  : 'bg-red-50 border-red-300'
              }`}>
                <h4 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Award className="w-5 h-5" />
                  Overall Recommendation
                </h4>
                <p className="text-gray-700">
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
            <div className="space-y-6">
              <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-6">Detailed Score Breakdown</h3>
                <div className="space-y-6">
                  {[
                    { label: 'Skills Match', score: detailedScores.skillsMatch },
                    { label: 'Experience Match', score: detailedScores.experienceMatch },
                    { label: 'Education Match', score: detailedScores.educationMatch },
                    { label: 'Title Match', score: detailedScores.titleMatch },
                    { label: 'Location Match', score: detailedScores.locationMatch },
                  ].map((item, idx) => (
                    <div key={idx}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-gray-700">{item.label}</span>
                        <span className={`text-lg font-bold ${getScoreColor(item.score)}`}>{item.score}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className={`h-3 rounded-full ${getProgressBarColor(item.score)} transition-all duration-500`}
                          style={{ width: `${item.score}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'personalinfo' && (
            <div className="space-y-6">
              {/* Professional Summary */}
              <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Star className="w-5 h-5 text-yellow-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Professional Summary</h3>
                </div>
                <p className="text-gray-700 leading-relaxed">
                  Experienced {resume.title?.toLowerCase() || 'professional'} with {resume.experience || 'extensive experience'} in the field.
                  {matchedSkills.length > 0 && ` Strong expertise in ${matchedSkills.slice(0, 3).join(', ')}, and more.`}
                  Proven track record of delivering results and driving excellence.
                </p>
              </div>

              {/* Work Experience */}
              <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-6">
                  <Briefcase className="w-5 h-5 text-blue-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Work Experience</h3>
                </div>
                <div className="relative pl-6 border-l-2 border-blue-200">
                  <div className="absolute -left-2 top-0 w-4 h-4 rounded-full bg-blue-600 border-2 border-white"></div>
                  <div className="mb-4">
                    <h4 className="font-semibold text-gray-900 mb-1">{resume.title || 'Current Position'}</h4>
                    <div className="flex items-center gap-2 text-gray-700 mb-1">
                      <Building2 className="w-4 h-4" />
                      <span>{resume.currentCompany || 'Company Not Specified'}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      {resume.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {resume.location}
                        </span>
                      )}
                      <span className="text-blue-600">({resume.experience || 'N/A'})</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Education */}
              <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-6">
                  <GraduationCap className="w-5 h-5 text-purple-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Education</h3>
                </div>
                <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                  <h4 className="font-semibold text-gray-900 mb-2">{resume.education || 'Education not specified'}</h4>
                </div>
              </div>

              {/* Skills */}
              {matchedSkills.length > 0 && (
                <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <Code className="w-5 h-5 text-green-600" />
                    <h3 className="text-lg font-semibold text-gray-900">Skills</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {matchedSkills.map((skill, index) => (
                      <span key={index} className="px-4 py-2 bg-green-50 text-green-700 rounded-lg text-sm border border-green-200">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Certifications */}
              {resume.certifications && resume.certifications.length > 0 && (
                <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <Award className="w-5 h-5 text-yellow-600" />
                    <h3 className="text-lg font-semibold text-gray-900">Certifications</h3>
                  </div>
                  <div className="space-y-3">
                    {resume.certifications.map((cert, index) => (
                      <div key={index} className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center justify-between">
                        <span className="font-medium text-gray-900">{cert}</span>
                        <Award className="w-5 h-5 text-yellow-600" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
