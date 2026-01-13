import { Clock, Calendar, User, BarChart3, CheckSquare, CheckCircle, XCircle, Briefcase, Award, Target, GraduationCap, MapPin, Building2, MessageSquare, TrendingUp } from 'lucide-react';

interface DetailedScores {
  titleMatch: number;
  experienceMatch: number;
  skillsMatch: number;
  educationMatch: number;
  locationMatch: number;
}

interface ScoreBreakdownItem {
  category: string;
  score: number;
  rating?: number;
  max_rating?: number;
  reasoning: string;
  match_status?: string;
  requirement?: string;
  eligible?: boolean;
}

interface ScoredResumeDetail {
  scorePercentage: number;
  scoredDate: string;
  scoredBy: string;
  detailedScores: DetailedScores;
  certifications?: string[];
  education?: string;
  location?: string;
  title?: string;
  scoreBreakdown?: ScoreBreakdownItem[];
  criteriaScores?: Record<string, { score: number; eligible: boolean; reasoning: string }>;
}

interface DetailedScorecardTabProps {
  resume: ScoredResumeDetail;
  jobTitle: string;
  getScoreColor: (score: number) => string;
  getScoreBgColor: (score: number) => string;
  getProgressBarColor: (score: number) => string;
}

export default function DetailedScorecardTab({ resume, jobTitle, getScoreColor, getScoreBgColor, getProgressBarColor }: DetailedScorecardTabProps) {
  // Convert percentage scores to rating out of 10
  const convertToRating = (percentage: number): number => {
    return Math.round((percentage / 100) * 10);
  };

  // Map icon names to components (handle both display names and API keys)
  const iconMap: Record<string, any> = {
    'Title': Briefcase,
    'Job Title': Briefcase,
    'Job_title': Briefcase,
    'Experience Level': Award,
    'Experience': Award,
    'Education Level': GraduationCap,
    'Education': GraduationCap,
    'Industry Type': Building2,
    'Industry': Building2,
    'Must Have Skills': Target,
    'Must_have_skills': Target,
    'Skills': Target,
    'Nice To Have Skills': Target,
    'Nice_to_have_skills': Target,
    'Must Have Comments': MessageSquare,
    'Must_have_comments': MessageSquare,
    'Comments': MessageSquare,
    'Nice To Have Comments': MessageSquare,
    'Nice_to_have_comments': MessageSquare,
    'Location': MapPin,
    'Job Hopping': TrendingUp,
    'Job_hobbing': TrendingUp,
    'Stability': TrendingUp,
  };

  // Generate reasoning based on score
  const generateReasoning = (category: string, score: number): string => {
    const reasoningMap: Record<string, { high: string; medium: string; low: string }> = {
      'Title': {
        high: 'Candidate\'s title perfectly aligns with the position requirements. The role progression shows excellent match with expected seniority level.',
        medium: 'Good title alignment with minor differences in specialization. The candidate has relevant role experience with some variance.',
        low: 'Title shows significant differences. Candidate may be transitioning from a different specialization or seniority level.'
      },
      'Experience Level': {
        high: 'Outstanding career progression with the right amount of experience. Candidate demonstrates consistent growth in relevant domains.',
        medium: 'Appropriate experience level with good progression. Some gaps in specific technical areas but overall solid background.',
        low: 'Experience level below requirements. Candidate shows potential but needs further development in key areas.'
      },
      'Education Level': {
        high: 'Exceptional educational background. Academic credentials exceed the position requirements.',
        medium: 'Meets educational baseline with standard qualifications.',
        low: 'Educational qualifications fall below preferred standards. Practical experience may compensate.'
      },
      'Skills': {
        high: 'All critical skills are present with strong proficiency levels. Technical stack matches well with role requirements.',
        medium: 'Core skills are present with good proficiency. Some gaps in advanced areas but foundation is strong.',
        low: 'Significant skills gap identified in critical areas. Would require training and development.'
      },
      'Location': {
        high: 'Perfect location match with no relocation required.',
        medium: 'Location is workable with remote/hybrid options.',
        low: 'Location mismatch requires consideration. Relocation or remote arrangement needed.'
      }
    };

    const reasoning = reasoningMap[category] || reasoningMap['Skills'];
    if (score >= 85) return reasoning?.high || 'Excellent match for this criterion.';
    if (score >= 60) return reasoning?.medium || 'Good match with some minor gaps.';
    return reasoning?.low || 'Below requirements for this criterion.';
  };

  // Build criteria scores from real data or fallback to detailedScores
  let criteriaScores: Array<{
    name: string;
    rating: number;
    icon: any;
    criteriaType: string;
    aiReasoning: string;
  }> = [];

  // Try to use scoreBreakdown from API first
  if (resume.scoreBreakdown && resume.scoreBreakdown.length > 0) {
    criteriaScores = resume.scoreBreakdown.map((item: ScoreBreakdownItem) => ({
      name: item.category,
      rating: item.rating || convertToRating(item.score),
      icon: iconMap[item.category] || Target,
      criteriaType: item.requirement || (item.eligible === false ? 'Required' : 'Preferred'),
      aiReasoning: item.reasoning || generateReasoning(item.category, item.score)
    }));
  }
  // Try to use criteriaScores object from API
  else if (resume.criteriaScores && Object.keys(resume.criteriaScores).length > 0) {
    criteriaScores = Object.entries(resume.criteriaScores).map(([key, value]: [string, any]) => {
      // Skip if value is null/undefined
      if (!value || typeof value !== 'object') return null;
      // API returns scores 0-10, convert to rating directly
      const rawScore = value.score ?? 0;
      const rating = rawScore <= 10 ? Math.round(rawScore) : convertToRating(rawScore);
      const displayName = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
      // Determine if essential based on key or is_essential flag
      const isEssential = value.is_essential === true || ['job_title', 'experience', 'must_have_skills', 'education', 'must_have_comments'].includes(key);
      return {
        name: displayName,
        rating: rating,
        icon: iconMap[displayName] || iconMap[key] || Target,
        criteriaType: isEssential ? 'Required' : 'Preferred',
        aiReasoning: value.reasoning || generateReasoning(key, rawScore <= 10 ? rawScore * 10 : rawScore)
      };
    }).filter((item): item is NonNullable<typeof item> => item !== null);
  }
  // Fallback to detailedScores - REMOVED static data, only show if real API data exists
  else {
    criteriaScores = [];
  }

  const getRatingRange = (rating: number): string => {
    if (rating === 10) return 'Excellent';
    if (rating === 9) return 'Very Good';
    if (rating === 8) return 'Good';
    if (rating === 7) return 'Average';
    return 'Below Average';
  };

  const getRatingBgColor = (rating: number): string => {
    if (rating === 10) return 'bg-green-100 border-green-300 text-green-700';
    if (rating === 9) return 'bg-green-100 border-green-300 text-green-700';
    if (rating === 8) return 'bg-gray-100 border-gray-300 text-gray-900';
    if (rating === 7) return 'bg-yellow-100 border-yellow-300 text-yellow-700';
    return 'bg-red-100 border-red-300 text-red-700';
  };

  const getEligibleStatus = (rating: number): { status: string; icon: JSX.Element; color: string } => {
    if (rating > 7) {
      return {
        status: 'Eligible',
        icon: <CheckCircle className="w-5 h-5 text-green-600" />,
        color: 'text-green-700'
      };
    }
    return {
      status: 'Not Eligible',
      icon: <XCircle className="w-5 h-5 text-red-600" />,
      color: 'text-red-700'
    };
  };

  const getRatingRangeColor = (rating: number): string => {
    if (rating === 10) return 'text-green-700 font-semibold';
    if (rating === 9) return 'text-green-700 font-semibold';
    if (rating === 8) return 'text-gray-900 font-semibold';
    if (rating === 7) return 'text-yellow-700 font-semibold';
    return 'text-red-700 font-semibold';
  };

  return (
    <div className="space-y-6">
      {/* Comprehensive Scorecard Header */}
      <div className="bg-gradient-to-r from-gray-50 to-gray-50 border-2 border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gray-800 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-gray-900">Comprehensive Scorecard</h3>
              <p className="text-sm text-gray-600">Detailed evaluation across all criteria</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-gray-800">{resume.scorePercentage}%</div>
            <div className="text-xs text-gray-600">Overall Score</div>
          </div>
        </div>
        
        {/* Timestamp Information */}
        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-200">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-800" />
            <div>
              <div className="text-xs text-gray-600">Scored On</div>
              <div className="text-sm font-medium text-gray-900">
                {resume.scoredDate && !isNaN(new Date(resume.scoredDate).getTime())
                  ? new Date(resume.scoredDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })
                  : 'N/A'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-800" />
            <div>
              <div className="text-xs text-gray-600">Time</div>
              <div className="text-sm font-medium text-gray-900">
                {resume.scoredDate && !isNaN(new Date(resume.scoredDate).getTime())
                  ? new Date(resume.scoredDate).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                  : 'N/A'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-green-600" />
            <div>
              <div className="text-xs text-gray-600">Scored By</div>
              <div className="text-sm font-medium text-gray-900">{resume.scoredBy || 'System'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Scoring Table - Only show if real API data exists */}
      {criteriaScores.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-200 px-6 py-3">
            <h4 className="text-gray-900 flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-gray-800" />
              Scoring Rubric & Evaluation
            </h4>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Evaluation Category
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Rating (out of 10)
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Rating Range
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Eligible Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Criteria
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    AI Reasoning
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {criteriaScores.map((criteria, index) => {
                  const Icon = criteria.icon;
                  const eligibility = getEligibleStatus(criteria.rating);
                  return (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-gray-500" />
                          <span className="text-sm font-medium text-gray-900">{criteria.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center justify-center w-14 h-14 rounded-lg font-bold border ${getRatingBgColor(criteria.rating)}`}>
                          {criteria.rating}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`text-sm ${getRatingRangeColor(criteria.rating)}`}>
                          {getRatingRange(criteria.rating)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {eligibility.icon}
                          <span className={`text-sm font-medium ${eligibility.color}`}>
                            {eligibility.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                          criteria.criteriaType === 'Required'
                            ? 'bg-red-100 text-red-700 border border-red-300'
                            : 'bg-gray-100 text-gray-900 border border-gray-300'
                        }`}>
                          {criteria.criteriaType}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-gray-600 leading-relaxed">{criteria.aiReasoning}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Summary Stats - Only show if real API data exists */}
      {criteriaScores.length > 0 && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-green-700">
              {criteriaScores.filter(c => c.rating > 7).length}
            </div>
            <div className="text-sm text-gray-700 mt-1">Eligible Criteria</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-red-700">
              {criteriaScores.filter(c => c.rating <= 7).length}
            </div>
            <div className="text-sm text-gray-700 mt-1">Not Eligible Criteria</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-900">
              {criteriaScores.filter(c => c.criteriaType === 'Required').length}
            </div>
            <div className="text-sm text-gray-700 mt-1">Required Criteria</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-900">
              {(criteriaScores.reduce((sum, c) => sum + c.rating, 0) / criteriaScores.length).toFixed(1)}
            </div>
            <div className="text-sm text-gray-700 mt-1">Average Rating</div>
          </div>
        </div>
      )}
    </div>
  );
}
