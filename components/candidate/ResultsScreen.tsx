'use client';

import {
  CheckCircle,
  XCircle,
  Award,
  Clock,
  Target,
  TrendingUp,
  Star,
  AlertCircle,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { useState } from 'react';
import { AssessmentInfo, AssessmentResult } from '@/lib/services/candidateService';

interface ResultsScreenProps {
  results: AssessmentResult;
  assessmentInfo: AssessmentInfo;
}

export function ResultsScreen({ results, assessmentInfo }: ResultsScreenProps) {
  const [expandedRounds, setExpandedRounds] = useState<string[]>([]);
  const passed = results.pass_status === 'passed';

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m ${secs}s`;
  };

  const getRecommendationColor = (recommendation: string | undefined) => {
    switch (recommendation) {
      case 'strong_yes':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'yes':
        return 'bg-green-50 text-green-600 border-green-100';
      case 'maybe':
        return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      case 'no':
        return 'bg-red-50 text-red-600 border-red-100';
      case 'strong_no':
        return 'bg-red-100 text-red-700 border-red-200';
      default:
        return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  const formatRecommendation = (recommendation: string | undefined) => {
    if (!recommendation) return 'Pending';
    return recommendation.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const toggleRound = (roundType: string) => {
    setExpandedRounds(prev =>
      prev.includes(roundType)
        ? prev.filter(r => r !== roundType)
        : [...prev, roundType]
    );
  };

  const getRoundQuestions = (roundType: string) => {
    return (results.question_evaluations || []).filter(q => q.round_type === roundType);
  };

  // Safe accessors for arrays that might be undefined
  const questionEvaluations = results.question_evaluations || [];
  const roundScores = results.round_scores || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">TF</span>
            </div>
            <span className="text-xl font-semibold text-gray-800">TalentFlow</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Result Card */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden mb-6">
          {/* Status Banner */}
          <div className={`px-8 py-8 ${
            passed
              ? 'bg-gradient-to-r from-green-600 to-green-500'
              : 'bg-gradient-to-r from-gray-700 to-gray-600'
          } text-white`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-full ${
                  passed ? 'bg-white/20' : 'bg-white/10'
                } flex items-center justify-center`}>
                  {passed ? (
                    <CheckCircle className="w-8 h-8" />
                  ) : (
                    <XCircle className="w-8 h-8" />
                  )}
                </div>
                <div>
                  <h1 className="text-2xl font-bold mb-1">
                    {passed ? 'Congratulations!' : 'Assessment Completed'}
                  </h1>
                  <p className="text-white/80">
                    {passed
                      ? 'You have successfully passed the assessment.'
                      : 'Thank you for completing the assessment.'}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-5xl font-bold">{Math.round(results.overall_score)}%</div>
                <p className="text-white/80 text-sm mt-1">
                  Passing score: {results.passing_threshold}%
                </p>
              </div>
            </div>
          </div>

          {/* Candidate & Assessment Info */}
          <div className="px-8 py-6 border-b border-gray-100">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-gray-500 mb-1">Candidate</p>
                <p className="font-semibold text-gray-800">{results.candidate_name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Assessment</p>
                <p className="font-semibold text-gray-800">{results.assessment_title}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Position</p>
                <p className="font-semibold text-gray-800">{results.jd_title}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Completed At</p>
                <p className="font-semibold text-gray-800">
                  {new Date(results.completed_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="px-8 py-6 grid grid-cols-2 md:grid-cols-4 gap-4 border-b border-gray-100">
            <div className="text-center p-4 bg-gray-50 rounded-xl">
              <Award className="w-6 h-6 text-yellow-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-gray-800">{Math.round(results.overall_score)}%</p>
              <p className="text-sm text-gray-500">Overall Score</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-xl">
              <Clock className="w-6 h-6 text-blue-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-gray-800">
                {formatDuration(results.time_spent_seconds)}
              </p>
              <p className="text-sm text-gray-500">Time Taken</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-xl">
              <Target className="w-6 h-6 text-green-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-gray-800">
                {questionEvaluations.filter(q => q.is_correct).length} / {questionEvaluations.length}
              </p>
              <p className="text-sm text-gray-500">Correct Answers</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-xl">
              <TrendingUp className="w-6 h-6 text-purple-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-gray-800 capitalize">
                {results.time_analysis?.time_management_rating || 'N/A'}
              </p>
              <p className="text-sm text-gray-500">Time Management</p>
            </div>
          </div>

          {/* Round Scores */}
          <div className="px-8 py-6 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Round-wise Performance</h2>
            <div className="space-y-4">
              {roundScores.map(round => (
                <div key={round.round_type} className="bg-gray-50 rounded-xl overflow-hidden">
                  <button
                    onClick={() => toggleRound(round.round_type)}
                    className="w-full px-4 py-4 flex items-center justify-between hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        round.round_type === 'hr' ? 'bg-purple-500' :
                        round.round_type === 'technical' ? 'bg-blue-500' : 'bg-green-500'
                      }`}>
                        <span className="text-white font-medium text-sm">
                          {round.round_type.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-gray-800 capitalize">
                          {round.round_type} Round
                        </p>
                        <p className="text-sm text-gray-500">
                          {round.questions_correct} / {round.questions_total} correct | {round.weightage_percent}% weightage
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-xl font-bold text-gray-800">{Math.round(round.raw_score)}%</p>
                        <p className="text-xs text-gray-500">
                          {round.weighted_score.toFixed(1)} weighted
                        </p>
                      </div>
                      {expandedRounds.includes(round.round_type) ? (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                  </button>

                  {/* Expanded Questions */}
                  {expandedRounds.includes(round.round_type) && (
                    <div className="px-4 pb-4 space-y-3">
                      {getRoundQuestions(round.round_type).map((q, idx) => (
                        <div
                          key={q.question_id}
                          className={`p-4 rounded-lg border ${
                            q.is_correct
                              ? 'bg-green-50 border-green-200'
                              : 'bg-red-50 border-red-200'
                          }`}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {q.is_correct ? (
                                <CheckCircle className="w-5 h-5 text-green-600" />
                              ) : (
                                <XCircle className="w-5 h-5 text-red-600" />
                              )}
                              <span className="font-medium text-gray-800">
                                Question {idx + 1}
                              </span>
                            </div>
                            <span className={`text-sm font-medium ${
                              q.is_correct ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {q.points_earned}/{q.points_possible} pts
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 mb-2 line-clamp-2">
                            {q.question_text}
                          </p>
                          <p className="text-sm text-gray-600 italic">
                            {q.feedback}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Candidate Insights */}
          <div className="px-8 py-6 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Your Performance Insights</h2>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Strengths */}
              <div className="bg-green-50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Star className="w-5 h-5 text-green-600" />
                  <h3 className="font-medium text-green-800">Strengths</h3>
                </div>
                <ul className="space-y-2">
                  {(results.candidate_insights?.strengths || []).map((strength, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-green-700">
                      <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      {strength}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Areas for Improvement */}
              <div className="bg-amber-50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle className="w-5 h-5 text-amber-600" />
                  <h3 className="font-medium text-amber-800">Areas for Improvement</h3>
                </div>
                <ul className="space-y-2">
                  {(results.candidate_insights?.improvement_areas || []).map((area, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-amber-700">
                      <span className="text-amber-400">-</span>
                      {area}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Summary */}
            <div className="mt-6 p-4 bg-gray-50 rounded-xl">
              <p className="text-gray-700">{results.candidate_insights?.summary}</p>
            </div>
          </div>

          {/* Hiring Recommendation (visual only, no sensitive details) */}
          <div className="px-8 py-6">
            <div className={`p-4 rounded-xl border ${getRecommendationColor(results.hiring_recommendation)}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-80 mb-1">Assessment Result</p>
                  <p className="font-semibold">
                    {formatRecommendation(results.hiring_recommendation)}
                  </p>
                </div>
                <Award className="w-8 h-8 opacity-50" />
              </div>
            </div>
          </div>
        </div>

        {/* Next Steps */}
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">What's Next?</h2>
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-blue-600 font-medium">1</span>
              </div>
              <div>
                <p className="font-medium text-gray-800">Results Shared</p>
                <p className="text-sm text-gray-500">
                  Your results have been shared with the hiring team for review.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-blue-600 font-medium">2</span>
              </div>
              <div>
                <p className="font-medium text-gray-800">Await Response</p>
                <p className="text-sm text-gray-500">
                  The hiring team will review your performance and get back to you with next steps.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-blue-600 font-medium">3</span>
              </div>
              <div>
                <p className="font-medium text-gray-800">Stay Prepared</p>
                <p className="text-sm text-gray-500">
                  If shortlisted, you may be contacted for further interviews.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">
            Thank you for taking this assessment with TalentFlow.
          </p>
          <p className="text-sm text-gray-500 mt-1">
            Questions? Contact <a href="mailto:support@talentflow.app" className="text-gray-700 hover:underline">support@talentflow.app</a>
          </p>
        </div>
      </main>
    </div>
  );
}
