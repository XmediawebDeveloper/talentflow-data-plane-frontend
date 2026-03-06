'use client';

import { useState, useEffect } from 'react';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, ArrowLeft, Target, Award, CheckCircle, XCircle, TrendingUp, Mail, Phone, MapPin, Briefcase, GraduationCap, Star, Calendar, User, FileText, Download, Building2, Code } from 'lucide-react';
import { toast } from 'sonner';
import ResumePreviewModal from '@/components/ResumePreviewModal';
import { handleUnauthorized } from '@/lib/services/api';
import FeatureGate from '@/components/shared/FeatureGate';
import { formatISTDate } from '@/lib/utils/dateUtils';

function ScoredResumeDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resumeId = searchParams.get('id');
  const jobId = searchParams.get('jobId');
  const jobTitle = searchParams.get('jobTitle') || 'Job Position';

  const [loading, setLoading] = useState(true);
  const [resumeData, setResumeData] = useState<any>(null);
  const [showResumePreview, setShowResumePreview] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'scorecard' | 'resume'>('overview');

  useEffect(() => {
    if (resumeId) {
      fetchResumeData();
    }
  }, [resumeId]);

  const fetchResumeData = async () => {
    setLoading(true);
    try {
      // Fetch scoring result data
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
      const token = localStorage.getItem('accessToken');

      const response = await fetch(`${API_URL}/scoring/${resumeId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      // Handle 401 - logout and redirect
      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (response.ok) {
        const data = await response.json();
        setResumeData({
          id: data.id,
          candidateName: data.candidate_name || 'Unknown',
          email: data.candidate_email || '',
          phone: data.phone || '',
          title: data.current_title || '',
          currentCompany: data.current_company || '',
          location: data.location || '',
          experience: data.experience_years ? `${data.experience_years} years` : '',
          education: data.education || '',
          matchStatus: data.match_status === 'exact_match' ? 'Exact Match' :
                       data.match_status === 'partial_match' ? 'Partial Match' : 'No Match',
          scorePercentage: Math.round(data.overall_score || 0),
          scoredDate: data.created_at,
          scoredBy: data.scored_by_name || 'System',
          aiSummary: data.ai_summary || '',
          strengths: data.strengths || [],
          gaps: data.gaps || [],
          skills: data.skills || [],
          certifications: data.certifications || [],
          resumeFileUrl: data.resume_file_url,
          detailedScores: {
            titleMatch: data.title_match_score || data.overall_score || 0,
            experienceMatch: data.experience_match_score || data.overall_score || 0,
            skillsMatch: data.skills_match_score || data.overall_score || 0,
            educationMatch: data.education_match_score || data.overall_score || 0,
            locationMatch: data.location_match_score || data.overall_score || 0,
          },
        });
      } else {
        toast.error('Failed to load resume details');
      }
    } catch (error) {
      console.error('Failed to fetch resume data:', error);
      toast.error('Failed to load resume details');
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-green-600';
    if (score >= 70) return 'text-gray-800';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 85) return 'bg-green-100 border-green-300 text-green-700';
    if (score >= 70) return 'bg-gray-100 border-gray-300 text-gray-900';
    if (score >= 60) return 'bg-yellow-100 border-yellow-300 text-yellow-700';
    return 'bg-red-100 border-red-300 text-red-700';
  };

  const getProgressBarColor = (score: number) => {
    if (score >= 85) return 'bg-green-600';
    if (score >= 70) return 'bg-gray-800';
    if (score >= 60) return 'bg-yellow-600';
    return 'bg-red-600';
  };

  const getMatchStatusColor = (status: string) => {
    if (status === 'Exact Match') return 'bg-green-100 text-green-700 border-green-300';
    if (status === 'Partial Match') return 'bg-yellow-100 text-yellow-700 border-yellow-300';
    return 'bg-red-100 text-red-700 border-red-300';
  };

  const handleBack = () => {
    if (jobId) {
      router.push(`/recruitment/job-details?id=${jobId}`);
    } else {
      router.back();
    }
  };

  const handleDownloadScorecard = () => {
    toast.info(`Downloading scorecard for ${resumeData?.candidateName}`);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-800" />
        <span className="ml-3 text-gray-600">Loading resume details...</span>
      </div>
    );
  }

  if (!resumeData) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Resume not found</p>
          <button
            onClick={handleBack}
            className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="flex-1 bg-gray-50 overflow-y-auto">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-8 py-6">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Job Details
          </button>

          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center flex-shrink-0">
                <Target className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl text-gray-900 font-bold mb-1">{resumeData.candidateName}</h1>
                <p className="text-gray-700 mb-2">{resumeData.title || 'Candidate'}</p>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  {resumeData.email && (
                    <span className="flex items-center gap-1.5">
                      <Mail className="w-4 h-4" />
                      {resumeData.email}
                    </span>
                  )}
                  {resumeData.phone && (
                    <span className="flex items-center gap-1.5">
                      <Phone className="w-4 h-4" />
                      {resumeData.phone}
                    </span>
                  )}
                  {resumeData.location && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="w-4 h-4" />
                      {resumeData.location}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Match Score */}
              <div className="text-center">
                <div className={`text-4xl font-bold ${getScoreColor(resumeData.scorePercentage)}`}>
                  {resumeData.scorePercentage}%
                </div>
                <span className={`inline-flex px-3 py-1 rounded-full text-sm border mt-2 ${getMatchStatusColor(resumeData.matchStatus)}`}>
                  {resumeData.matchStatus}
                </span>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setShowResumePreview(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  View Resume
                </button>
                <button
                  onClick={handleDownloadScorecard}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download Scorecard
                </button>
              </div>
            </div>
          </div>

          {/* Job Context */}
          <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-sm text-gray-600">
              Scored against: <span className="font-medium text-gray-900">{jobTitle}</span>
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-t border-gray-200">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-6 py-3 text-sm font-medium transition-colors relative ${
              activeTab === 'overview'
                ? 'text-gray-900 bg-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Overview
            {activeTab === 'overview' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-800"></div>
            )}
          </button>
          <button
            onClick={() => setActiveTab('scorecard')}
            className={`px-6 py-3 text-sm font-medium transition-colors relative ${
              activeTab === 'scorecard'
                ? 'text-gray-900 bg-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Detailed Scorecard
            {activeTab === 'scorecard' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-800"></div>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-8 py-6">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-3 gap-6">
            {/* Left Column - Candidate Info */}
            <div className="col-span-2 space-y-6">
              {/* AI Summary */}
              {resumeData.aiSummary && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Star className="w-5 h-5 text-yellow-500" />
                    AI Summary
                  </h3>
                  <p className="text-gray-700 leading-relaxed">{resumeData.aiSummary}</p>
                </div>
              )}

              {/* Key Strengths */}
              {resumeData.strengths && resumeData.strengths.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    Key Strengths
                  </h3>
                  <ul className="space-y-2">
                    {resumeData.strengths.map((strength: string, index: number) => (
                      <li key={index} className="flex items-start gap-2 text-gray-700">
                        <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        {strength}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Gaps/Improvement Areas */}
              {resumeData.gaps && resumeData.gaps.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-yellow-600" />
                    Areas for Consideration
                  </h3>
                  <ul className="space-y-2">
                    {resumeData.gaps.map((gap: string, index: number) => (
                      <li key={index} className="flex items-start gap-2 text-gray-700">
                        <XCircle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                        {gap}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Skills */}
              {resumeData.skills && resumeData.skills.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Code className="w-5 h-5 text-blue-600" />
                    Skills
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {resumeData.skills.map((skill: string, index: number) => (
                      <span
                        key={index}
                        className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm border border-blue-200"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column - Score Breakdown */}
            <div className="space-y-6">
              {/* Overall Score Card */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Match Score</h3>
                <div className="text-center">
                  <div className={`text-5xl font-bold ${getScoreColor(resumeData.scorePercentage)}`}>
                    {resumeData.scorePercentage}%
                  </div>
                  <p className="text-gray-600 mt-2">Overall Match</p>
                </div>
              </div>

              {/* Score Breakdown */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Score Breakdown</h3>
                <div className="space-y-4">
                  {[
                    { label: 'Title Match', score: resumeData.detailedScores.titleMatch },
                    { label: 'Experience', score: resumeData.detailedScores.experienceMatch },
                    { label: 'Skills', score: resumeData.detailedScores.skillsMatch },
                    { label: 'Education', score: resumeData.detailedScores.educationMatch },
                    { label: 'Location', score: resumeData.detailedScores.locationMatch },
                  ].map((item, index) => (
                    <div key={index}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">{item.label}</span>
                        <span className={`font-medium ${getScoreColor(item.score)}`}>{Math.round(item.score)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${getProgressBarColor(item.score)}`}
                          style={{ width: `${item.score}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Candidate Details */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Candidate Details</h3>
                <div className="space-y-3 text-sm">
                  {resumeData.currentCompany && (
                    <div className="flex items-center gap-2 text-gray-700">
                      <Building2 className="w-4 h-4 text-gray-500" />
                      {resumeData.currentCompany}
                    </div>
                  )}
                  {resumeData.experience && (
                    <div className="flex items-center gap-2 text-gray-700">
                      <Briefcase className="w-4 h-4 text-gray-500" />
                      {resumeData.experience}
                    </div>
                  )}
                  {resumeData.education && (
                    <div className="flex items-center gap-2 text-gray-700">
                      <GraduationCap className="w-4 h-4 text-gray-500" />
                      {resumeData.education}
                    </div>
                  )}
                  {resumeData.scoredDate && (
                    <div className="flex items-center gap-2 text-gray-700">
                      <Calendar className="w-4 h-4 text-gray-500" />
                      Scored: {formatISTDate(resumeData.scoredDate)}
                    </div>
                  )}
                  {resumeData.scoredBy && (
                    <div className="flex items-center gap-2 text-gray-700">
                      <User className="w-4 h-4 text-gray-500" />
                      By: {resumeData.scoredBy}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'scorecard' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Detailed Scorecard</h3>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Category</th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Score</th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      category: 'Job Title Match',
                      score: resumeData.detailedScores.titleMatch,
                      details: `Current title: ${resumeData.title || 'N/A'}`
                    },
                    {
                      category: 'Experience',
                      score: resumeData.detailedScores.experienceMatch,
                      details: `${resumeData.experience || 'N/A'}`
                    },
                    {
                      category: 'Skills Match',
                      score: resumeData.detailedScores.skillsMatch,
                      details: `${resumeData.skills?.length || 0} skills identified`
                    },
                    {
                      category: 'Education',
                      score: resumeData.detailedScores.educationMatch,
                      details: `${resumeData.education || 'N/A'}`
                    },
                    {
                      category: 'Location',
                      score: resumeData.detailedScores.locationMatch,
                      details: `${resumeData.location || 'N/A'}`
                    },
                  ].map((item, index) => (
                    <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-4 px-4 text-sm text-gray-900 font-medium">{item.category}</td>
                      <td className="py-4 px-4 text-center">
                        <span className={`text-lg font-bold ${getScoreColor(item.score)}`}>
                          {Math.round(item.score)}%
                        </span>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs border ${getScoreBgColor(item.score)}`}>
                          {item.score >= 85 ? 'Excellent' : item.score >= 70 ? 'Good' : item.score >= 60 ? 'Fair' : 'Needs Improvement'}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-sm text-gray-600">{item.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Resume Preview Modal */}
      {showResumePreview && (
        <ResumePreviewModal
          resumeUrl={resumeData.resumeFileUrl}
          candidateName={resumeData.candidateName}
          onClose={() => setShowResumePreview(false)}
        />
      )}
    </main>
  );
}

export default function ScoredResumeDetailPage() {
  return (
    <FeatureGate feature="resume_scoring">
      <Suspense fallback={
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <Loader2 className="w-8 h-8 animate-spin text-gray-800" />
          <span className="ml-3 text-gray-600">Loading...</span>
        </div>
      }>
        <ScoredResumeDetailContent />
      </Suspense>
    </FeatureGate>
  );
}
