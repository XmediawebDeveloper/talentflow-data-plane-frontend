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
  is_summary?: boolean;
  percentage?: number;
  key?: string;
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
  aiReasoning?: string;
  getScoreColor: (score: number) => string;
  getScoreBgColor: (score: number) => string;
  getProgressBarColor: (score: number) => string;
}

export default function DetailedScorecardTab({ resume, jobTitle, aiReasoning, getScoreColor, getScoreBgColor, getProgressBarColor }: DetailedScorecardTabProps) {
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

  // Extract summary rows (Required Total, Preferred Total, Final Score)
  let summaryData: {
    requiredPercentage: number;
    preferredPercentage: number;
    finalPercentage: number;
    requiredTotal: number;
    requiredMax: number;
    preferredTotal: number;
    preferredMax: number;
  } | null = null;

  // Try to use scoreBreakdown from API first
  if (resume.scoreBreakdown && resume.scoreBreakdown.length > 0) {
    // Filter out summary rows and extract summary data
    const regularItems: ScoreBreakdownItem[] = [];
    let requiredSummary: ScoreBreakdownItem | undefined;
    let preferredSummary: ScoreBreakdownItem | undefined;
    let finalSummary: ScoreBreakdownItem | undefined;

    resume.scoreBreakdown.forEach((item: ScoreBreakdownItem) => {
      if (item.is_summary) {
        if (item.key === 'required_total') requiredSummary = item;
        else if (item.key === 'preferred_total') preferredSummary = item;
        else if (item.key === 'final_score') finalSummary = item;
      } else {
        regularItems.push(item);
      }
    });

    // Extract summary data if available
    if (requiredSummary || preferredSummary || finalSummary) {
      summaryData = {
        requiredPercentage: requiredSummary?.percentage || 0,
        preferredPercentage: preferredSummary?.percentage || 0,
        finalPercentage: finalSummary?.percentage || resume.scorePercentage,
        requiredTotal: requiredSummary?.rating || 0,
        requiredMax: requiredSummary?.max_rating || 20,
        preferredTotal: preferredSummary?.rating || 0,
        preferredMax: preferredSummary?.max_rating || 80,
      };
    } else {
      // Fallback: Calculate summary from regular items if summary rows not found
      const requiredItems = regularItems.filter(item =>
        item.requirement === 'Required' ||
        item.category?.toLowerCase().includes('must have')
      );
      const preferredItems = regularItems.filter(item =>
        item.requirement === 'Preferred' ||
        (!item.category?.toLowerCase().includes('must have'))
      );

      const requiredTotal = requiredItems.reduce((sum, item) => sum + (item.rating || 0), 0);
      const preferredTotal = preferredItems.reduce((sum, item) => sum + (item.rating || 0), 0);
      const requiredMax = requiredItems.length * 10 || 20;
      const preferredMax = preferredItems.length * 10 || 80;

      const requiredPct = requiredMax > 0 ? Math.round((requiredTotal / requiredMax) * 100) : 0;
      const preferredPct = preferredMax > 0 ? Math.round((preferredTotal / preferredMax) * 100) : 0;
      const finalPct = Math.round((requiredPct + preferredPct) / 2);

      summaryData = {
        requiredPercentage: requiredPct,
        preferredPercentage: preferredPct,
        finalPercentage: finalPct || resume.scorePercentage,
        requiredTotal: requiredTotal,
        requiredMax: requiredMax,
        preferredTotal: preferredTotal,
        preferredMax: preferredMax,
      };
    }

    criteriaScores = regularItems.map((item: ScoreBreakdownItem) => ({
      name: item.category,
      rating: item.rating || convertToRating(item.score),
      icon: iconMap[item.category] || Target,
      criteriaType: item.requirement || (item.eligible === false ? 'Required' : 'Preferred'),
      aiReasoning: item.reasoning || generateReasoning(item.category, item.score)
    }));
  }
  // Try to use criteriaScores object from API
  else if (resume.criteriaScores && Object.keys(resume.criteriaScores).length > 0) {
    // Required criteria keys
    const requiredKeys = ['must_have_skills', 'must_have_comments'];

    // Calculate summary from criteriaScores
    let requiredTotal = 0;
    let preferredTotal = 0;

    criteriaScores = Object.entries(resume.criteriaScores).map(([key, value]: [string, any]) => {
      // Skip if value is null/undefined
      if (!value || typeof value !== 'object') return null;
      // API returns scores 0-10, convert to rating directly
      const rawScore = value.score ?? 0;
      const rating = rawScore <= 10 ? Math.round(rawScore) : convertToRating(rawScore);
      const displayName = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
      // Use is_essential flag from backend API
      const isEssential = value.is_essential === true || requiredKeys.includes(key);

      // Accumulate totals
      if (isEssential) {
        requiredTotal += rating;
      } else {
        preferredTotal += rating;
      }

      return {
        name: displayName,
        rating: rating,
        icon: iconMap[displayName] || iconMap[key] || Target,
        criteriaType: isEssential ? 'Required' : 'Preferred',
        aiReasoning: value.reasoning || generateReasoning(key, rawScore <= 10 ? rawScore * 10 : rawScore)
      };
    }).filter((item): item is NonNullable<typeof item> => item !== null);

    // Calculate percentages for summary - use dynamic counts based on actual is_essential flags
    const requiredItems = criteriaScores.filter(item => item.criteriaType === 'Required');
    const preferredItems = criteriaScores.filter(item => item.criteriaType === 'Preferred');
    const requiredMax = requiredItems.length * 10 || 20;  // Dynamic based on actual required criteria count
    const preferredMax = preferredItems.length * 10 || 80; // Dynamic based on actual preferred criteria count
    const requiredPct = requiredMax > 0 ? Math.round((requiredTotal / requiredMax) * 100) : 0;
    const preferredPct = preferredMax > 0 ? Math.round((preferredTotal / preferredMax) * 100) : 0;
    const finalPct = Math.round((requiredPct + preferredPct) / 2);

    summaryData = {
      requiredPercentage: requiredPct,
      preferredPercentage: preferredPct,
      finalPercentage: finalPct || resume.scorePercentage,
      requiredTotal: requiredTotal,
      requiredMax: requiredMax,
      preferredTotal: preferredTotal,
      preferredMax: preferredMax,
    };
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
    if (rating >= 7) {
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
    <div className="space-y-4">
      {/* Score Summary Header - Compact */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-gray-700">Overall Score:</span>
        <span className={`text-2xl font-bold ${resume.scorePercentage >= 70 ? 'text-green-600' : resume.scorePercentage >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
          {resume.scorePercentage}%
        </span>
        <span className="text-gray-400">|</span>
        {summaryData && (
          <>
            <span className="text-gray-700">Required: <span className="font-semibold text-gray-900">{summaryData.requiredPercentage.toFixed(0)}%</span></span>
            <span className="text-gray-700">Preferred: <span className="font-semibold text-gray-900">{summaryData.preferredPercentage.toFixed(0)}%</span></span>
            <span className="text-gray-600">|</span>
          </>
        )}
        <span className="text-gray-600">
          {resume.scoredDate && !isNaN(new Date(resume.scoredDate).getTime())
            ? new Date(resume.scoredDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : 'N/A'}
        </span>
        <span className="text-gray-600">by {resume.scoredBy || 'System'}</span>
      </div>

      {/* AI Analysis */}
      {aiReasoning && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-800 uppercase tracking-wide mb-2">AI Analysis</h4>
          <p className="text-gray-900 text-sm leading-relaxed">{aiReasoning}</p>
        </div>
      )}

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
                        <p className="text-sm text-gray-800 leading-relaxed">{criteria.aiReasoning}</p>
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
              {criteriaScores.filter(c => c.rating >= 7).length}
            </div>
            <div className="text-sm font-medium text-gray-800 mt-1">Eligible Criteria</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-red-700">
              {criteriaScores.filter(c => c.rating < 7).length}
            </div>
            <div className="text-sm font-medium text-gray-800 mt-1">Not Eligible Criteria</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-900">
              {criteriaScores.filter(c => c.criteriaType === 'Required').length}
            </div>
            <div className="text-sm font-medium text-gray-800 mt-1">Required Criteria</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-900">
              {(criteriaScores.reduce((sum, c) => sum + c.rating, 0) / criteriaScores.length).toFixed(1)}
            </div>
            <div className="text-sm font-medium text-gray-800 mt-1">Average Rating</div>
          </div>
        </div>
      )}
    </div>
  );
}
