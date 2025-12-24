import { Clock, Calendar, User, BarChart3, CheckSquare, CheckCircle, XCircle, Briefcase, Award, Target, GraduationCap, MapPin, Building2, MessageSquare, TrendingUp } from 'lucide-react';

interface DetailedScores {
  titleMatch: number;
  experienceMatch: number;
  skillsMatch: number;
  educationMatch: number;
  locationMatch: number;
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

  // Mock data for the new criteria (in a real app, this would come from resume data)
  const criteriaScores = [
    {
      name: 'Title',
      rating: convertToRating(resume.detailedScores.titleMatch),
      icon: Briefcase,
      criteriaType: 'Required',
      aiReasoning: resume.detailedScores.titleMatch >= 85 
        ? 'Candidate\'s title perfectly aligns with the position requirements. The role progression shows excellent match with expected seniority level.'
        : resume.detailedScores.titleMatch >= 60
        ? 'Good title alignment with minor differences in specialization. The candidate has relevant role experience with some variance.'
        : 'Title shows significant differences. Candidate may be transitioning from a different specialization or seniority level.'
    },
    {
      name: 'Experience Level',
      rating: convertToRating(resume.detailedScores.experienceMatch),
      icon: Award,
      criteriaType: 'Required',
      aiReasoning: resume.detailedScores.experienceMatch >= 85 
        ? 'Outstanding career progression with the right amount of experience. Candidate demonstrates consistent growth in relevant domains with strong track record.'
        : resume.detailedScores.experienceMatch >= 60
        ? 'Appropriate experience level with good progression. Some gaps in specific technical areas but overall solid background in the domain.'
        : 'Experience level below requirements. Candidate shows potential but needs further development in key areas before fully matching the role.'
    },
    {
      name: 'Education Level',
      rating: convertToRating(resume.detailedScores.educationMatch),
      icon: GraduationCap,
      criteriaType: 'Preferred',
      aiReasoning: resume.detailedScores.educationMatch >= 85 
        ? 'Exceptional educational background with advanced degrees from reputed institutions. Academic credentials exceed the position requirements significantly.'
        : resume.detailedScores.educationMatch >= 60
        ? 'Meets educational baseline with standard qualifications. Additional certifications would strengthen the overall profile for this position.'
        : 'Educational qualifications fall below preferred standards. However, practical experience and skills may compensate for academic gaps.'
    },
    {
      name: 'Industry Type',
      rating: 8,
      icon: Building2,
      criteriaType: 'Preferred',
      aiReasoning: 'Strong industry alignment with comprehensive domain knowledge. Candidate has worked in similar sectors and understands the business context well. Industry-specific expertise is evident.'
    },
    {
      name: 'Must Have Skills',
      rating: convertToRating(resume.detailedScores.skillsMatch),
      icon: Target,
      criteriaType: 'Required',
      aiReasoning: resume.detailedScores.skillsMatch >= 85 
        ? 'All critical must-have skills are present with strong proficiency levels. Technical stack matches perfectly with role requirements.'
        : resume.detailedScores.skillsMatch >= 60
        ? 'Core must-have skills are present with good proficiency. Some gaps in advanced areas but the foundation is strong and trainable.'
        : 'Significant skills gap identified in critical areas. Candidate would require substantial training and development to meet role requirements.'
    },
    {
      name: 'Nice to Have Skills',
      rating: 7,
      icon: Target,
      criteriaType: 'Preferred',
      aiReasoning: 'Good coverage of supplementary skills that would enhance role performance. Candidate demonstrates versatility with several nice-to-have competencies that add value beyond core requirements.'
    },
    {
      name: 'Must Have Comments',
      rating: 9,
      icon: MessageSquare,
      criteriaType: 'Required',
      aiReasoning: 'Excellent comprehension of role requirements demonstrated through detailed responses. Candidate shows deep understanding of critical aspects and articulates relevant experience clearly.'
    },
    {
      name: 'Location',
      rating: convertToRating(resume.detailedScores.locationMatch),
      icon: MapPin,
      criteriaType: 'Preferred',
      aiReasoning: resume.detailedScores.locationMatch >= 85 
        ? 'Perfect location match with no relocation required. Candidate is already based in the target geography and ready to start immediately.'
        : resume.detailedScores.locationMatch >= 60
        ? 'Location is workable with remote/hybrid options. Some travel may be required but candidate has indicated flexibility for the arrangement.'
        : 'Location mismatch requires consideration. Significant relocation needed or full remote arrangement would be necessary for this candidate.'
    },
    {
      name: 'Job Hopping',
      rating: 8,
      icon: TrendingUp,
      criteriaType: 'Preferred',
      aiReasoning: 'Reasonable employment tenure showing stability and commitment. Career moves appear strategic with logical progression. No concerning patterns of frequent job changes.'
    }
  ];

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
                {new Date(resume.scoredDate).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-800" />
            <div>
              <div className="text-xs text-gray-600">Time</div>
              <div className="text-sm font-medium text-gray-900">
                {new Date(resume.scoredDate).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-green-600" />
            <div>
              <div className="text-xs text-gray-600">Scored By</div>
              <div className="text-sm font-medium text-gray-900">{resume.scoredBy}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Scoring Table */}
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

      {/* Summary Stats */}
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
    </div>
  );
}
