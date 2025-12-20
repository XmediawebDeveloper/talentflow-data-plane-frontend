import { ArrowLeft, Star, TrendingUp, Award, Briefcase, CheckCircle, AlertCircle, ChevronDown, ChevronUp, FileText, Eye } from 'lucide-react';
import { Resume, Job } from '@/lib/types/types';
import { useState } from 'react';
import { toast } from '@/components/ui/enhanced-toast';

interface ResumeScoringProps {
  resumes: Resume[];
  jobs: Job[];
  onBack: () => void;
  onComplete: () => void;
}

interface ScoringResult {
  resumeId: string;
  jobId: string;
  score: number;
  matchType: 'excellent' | 'good' | 'fair' | 'poor';
  keyMatches: string[];
  missingSkills: string[];
}

interface DetailedScoreCategory {
  category: string;
  rating: number;
  maxRating: number;
  matchStatus: 'Excellent' | 'Good' | 'Partial' | 'Poor';
  requirement: 'Required' | 'Preferred';
  score: number;
  reasoning: string;
}

export default function ResumeScoring({ resumes, jobs, onBack, onComplete }: ResumeScoringProps) {
  const [scoringResults, setScoringResults] = useState<ScoringResult[]>(() => {
    // Generate mock scoring results
    const results: ScoringResult[] = [];
    resumes.forEach(resume => {
      jobs.forEach(job => {
        const score = Math.floor(Math.random() * 40) + 60; // 60-100
        let matchType: 'excellent' | 'good' | 'fair' | 'poor';
        if (score >= 90) matchType = 'excellent';
        else if (score >= 75) matchType = 'good';
        else if (score >= 60) matchType = 'fair';
        else matchType = 'poor';

        results.push({
          resumeId: resume.id,
          jobId: job.id,
          score,
          matchType,
          keyMatches: ['React', 'TypeScript', 'Node.js'].slice(0, Math.floor(Math.random() * 2) + 2),
          missingSkills: ['AWS', 'Docker'].slice(0, Math.floor(Math.random() * 2)),
        });
      });
    });
    return results.sort((a, b) => b.score - a.score);
  });

  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [selectedResultForDetail, setSelectedResultForDetail] = useState<string | null>(null);

  // Generate detailed score breakdown for a specific result
  const getDetailedScores = (resultKey: string): DetailedScoreCategory[] => {
    return [
      {
        category: 'Job Title Match',
        rating: 9,
        maxRating: 10,
        matchStatus: 'Excellent',
        requirement: 'Required',
        score: 90,
        reasoning: 'The candidate\'s current role as "Senior Software Engineer" closely aligns with the job requirement. Strong technical leadership experience demonstrated through project ownership and mentoring responsibilities.',
      },
      {
        category: 'Total Experience',
        rating: 10,
        maxRating: 10,
        matchStatus: 'Excellent',
        requirement: 'Required',
        score: 100,
        reasoning: 'Candidate has 8+ years of professional experience, exceeding the required 5+ years. Progressive career growth shown through increasing responsibilities and technical complexity.',
      },
      {
        category: 'Education',
        rating: 9,
        maxRating: 10,
        matchStatus: 'Excellent',
        requirement: 'Required',
        score: 90,
        reasoning: 'Bachelor\'s degree in Computer Science from accredited university. Additional certifications in cloud architecture and agile methodologies demonstrate continued learning.',
      },
      {
        category: 'Must have Skills',
        rating: 9,
        maxRating: 10,
        matchStatus: 'Excellent',
        requirement: 'Required',
        score: 90,
        reasoning: 'Strong proficiency in React, TypeScript, and Node.js with 5+ years experience. Demonstrated expertise through multiple production deployments and architectural decisions.',
      },
      {
        category: 'Nice to have Skills',
        rating: 7,
        maxRating: 10,
        matchStatus: 'Good',
        requirement: 'Preferred',
        score: 70,
        reasoning: 'Has experience with AWS and Docker but limited exposure to Kubernetes. Strong foundation in cloud technologies with room for growth in container orchestration.',
      },
      {
        category: 'Must have Competencies',
        rating: 9,
        maxRating: 10,
        matchStatus: 'Excellent',
        requirement: 'Required',
        score: 90,
        reasoning: 'Excellent problem-solving skills, strong communication abilities, and proven track record of working in agile teams. Leadership qualities evident in mentoring and code review activities.',
      },
      {
        category: 'Location',
        rating: 10,
        maxRating: 10,
        matchStatus: 'Excellent',
        requirement: 'Required',
        score: 100,
        reasoning: 'Currently based in San Francisco with flexibility for hybrid work. No relocation required. Previous experience working in similar timezone and cultural context.',
      },
      {
        category: 'Leadership Experience',
        rating: 8,
        maxRating: 10,
        matchStatus: 'Excellent',
        requirement: 'Preferred',
        score: 80,
        reasoning: 'Led team of 4 developers on critical projects. Strong mentoring experience with junior developers. Some gap in formal people management but excellent technical leadership demonstrated.',
      },
      {
        category: 'Industry Experience',
        rating: 8,
        maxRating: 10,
        matchStatus: 'Partial',
        requirement: 'Preferred',
        score: 80,
        reasoning: 'Has worked in SaaS and fintech sectors, bringing relevant domain knowledge. Limited exposure to healthcare industry specifically but strong transferable skills and quick learning ability.',
      },
      {
        category: 'Job Hopping',
        rating: 8,
        maxRating: 10,
        matchStatus: 'Good',
        requirement: 'Preferred',
        score: 80,
        reasoning: 'Average tenure of 2.5 years per role, showing stability. Most recent role for 3+ years indicates maturity and commitment. Job changes driven by career growth rather than instability.',
      },
    ];
  };

  const getMatchColor = (type: string) => {
    switch (type) {
      case 'excellent': return 'bg-green-100 text-green-800 border-green-200';
      case 'good': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'fair': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'poor': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getScoreIcon = (type: string) => {
    switch (type) {
      case 'excellent': return <Award className="w-5 h-5 text-green-600" />;
      case 'good': return <CheckCircle className="w-5 h-5 text-blue-600" />;
      case 'fair': return <TrendingUp className="w-5 h-5 text-yellow-600" />;
      case 'poor': return <AlertCircle className="w-5 h-5 text-red-600" />;
      default: return <Star className="w-5 h-5 text-gray-600" />;
    }
  };

  return (
    <div className="flex-1 bg-gray-50 overflow-y-auto">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-8 py-6">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-gray-900 mb-2">Resume Scoring Analysis</h1>
              <p className="text-sm text-gray-600">
                AI-powered match scoring for {resumes.length} resume{resumes.length > 1 ? 's' : ''} across {jobs.length} job opening{jobs.length > 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={onComplete}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Complete & Apply
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="px-8 py-6">
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-gray-600 text-sm mb-1">Total Matches</div>
                <div className="text-2xl text-gray-900">{scoringResults.length}</div>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Briefcase className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-gray-600 text-sm mb-1">Excellent Matches</div>
                <div className="text-2xl text-gray-900">
                  {scoringResults.filter(r => r.matchType === 'excellent').length}
                </div>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <Award className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-gray-600 text-sm mb-1">Good Matches</div>
                <div className="text-2xl text-gray-900">
                  {scoringResults.filter(r => r.matchType === 'good').length}
                </div>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-gray-600 text-sm mb-1">Avg. Score</div>
                <div className="text-2xl text-gray-900">
                  {Math.round(scoringResults.reduce((acc, r) => acc + r.score, 0) / scoringResults.length)}%
                </div>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Scoring Results Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-6 py-3 text-xs text-gray-600">Candidate</th>
                  <th className="text-left px-6 py-3 text-xs text-gray-600">Job Position</th>
                  <th className="text-center px-6 py-3 text-xs text-gray-600">Match Score</th>
                  <th className="text-left px-6 py-3 text-xs text-gray-600">Key Matches</th>
                  <th className="text-left px-6 py-3 text-xs text-gray-600">Missing Skills</th>
                  <th className="text-center px-6 py-3 text-xs text-gray-600">Status</th>
                  <th className="text-center px-6 py-3 text-xs text-gray-600">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {scoringResults.map((result, index) => {
                  const resume = resumes.find(r => r.id === result.resumeId);
                  const job = jobs.find(j => j.id === result.jobId);
                  const resultKey = `${result.resumeId}-${result.jobId}`;
                  
                  if (!resume || !job) return null;

                  return (
                    <tr key={resultKey} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm">
                            {resume.name.split(' ').map(n => n[0]).join('')}
                          </div>
                          <div>
                            <div className="text-sm text-gray-900">{resume.name}</div>
                            <div className="text-xs text-gray-500">{resume.title}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">{job.title}</div>
                        <div className="text-xs text-gray-500">{job.location}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          {getScoreIcon(result.matchType)}
                          <span className="text-lg text-gray-900">{result.score}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {result.keyMatches.map((skill, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center px-2 py-1 rounded-md bg-green-50 text-green-700 text-xs border border-green-200"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {result.missingSkills.length > 0 ? (
                            result.missingSkills.map((skill, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center px-2 py-1 rounded-md bg-gray-100 text-gray-600 text-xs border border-gray-200"
                              >
                                {skill}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-gray-400">None</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs border ${getMatchColor(result.matchType)}`}>
                          {result.matchType.charAt(0).toUpperCase() + result.matchType.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => setSelectedResultForDetail(resultKey)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                        >
                          <Eye className="w-3 h-3" />
                          View Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detailed Analysis Section */}
        {selectedResultForDetail && (() => {
          const result = scoringResults.find(r => `${r.resumeId}-${r.jobId}` === selectedResultForDetail);
          const resume = resumes.find(r => r.id === result?.resumeId);
          const job = jobs.find(j => j.id === result?.jobId);
          const detailedScores = getDetailedScores(selectedResultForDetail);

          if (!result || !resume || !job) return null;

          return (
            <div className="bg-white rounded-lg border-2 border-blue-300 overflow-hidden shadow-lg mb-6">
              <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-5 border-b-4 border-blue-700">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-white mb-2">📊 Detailed Score Breakdown</h3>
                    <p className="text-blue-100 text-sm">
                      <span className="bg-white bg-opacity-20 px-2 py-1 rounded">{resume.name}</span> → <span className="bg-white bg-opacity-20 px-2 py-1 rounded">{job.title}</span>
                    </p>
                    <p className="text-blue-200 text-xs mt-2">
                      💡 Click any row to expand and view detailed AI reasoning
                    </p>
                  </div>
                  <button
                    onClick={() => alert('PDF export functionality coming soon!')}
                    className="flex items-center gap-2 px-5 py-2.5 bg-white text-blue-600 rounded-lg hover:bg-blue-50 transition-all shadow-md hover:shadow-lg"
                  >
                    <FileText className="w-4 h-4" />
                    Export as PDF
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="text-left px-6 py-4 text-xs text-gray-700 border-b-2 border-gray-300 w-8"></th>
                      <th className="text-left px-6 py-4 text-xs text-gray-700 border-b-2 border-gray-300">CATEGORY</th>
                      <th className="text-center px-6 py-4 text-xs text-gray-700 border-b-2 border-gray-300">RATING</th>
                      <th className="text-center px-6 py-4 text-xs text-gray-700 border-b-2 border-gray-300">MATCH STATUS</th>
                      <th className="text-center px-6 py-4 text-xs text-gray-700 border-b-2 border-gray-300">REQUIREMENT</th>
                      <th className="text-center px-6 py-4 text-xs text-gray-700 border-b-2 border-gray-300">SCORE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailedScores.map((category, index) => {
                      const isExpanded = expandedRow === `${selectedResultForDetail}-${index}`;
                      const getStatusColor = (status: string) => {
                        switch (status) {
                          case 'Excellent': return 'bg-green-100 text-green-800 border-green-200';
                          case 'Good': return 'bg-blue-100 text-blue-800 border-blue-200';
                          case 'Partial': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
                          case 'Poor': return 'bg-red-100 text-red-800 border-red-200';
                          default: return 'bg-gray-100 text-gray-800 border-gray-200';
                        }
                      };

                      const getRequirementColor = (req: string) => {
                        return req === 'Required' 
                          ? 'bg-red-50 text-red-700 border-red-200' 
                          : 'bg-blue-50 text-blue-700 border-blue-200';
                      };

                      return (
                        <>
                          <tr 
                            key={index}
                            onClick={() => setExpandedRow(isExpanded ? null : `${selectedResultForDetail}-${index}`)}
                            className={`border-b border-gray-200 hover:bg-blue-50 cursor-pointer transition-colors ${isExpanded ? 'bg-blue-50' : 'bg-white'}`}
                          >
                            <td className="px-6 py-5 border-r border-gray-200">
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 text-blue-600" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-gray-400" />
                              )}
                            </td>
                            <td className="px-6 py-5 border-r border-gray-200">
                              <span className="text-sm text-gray-900">{category.category}</span>
                            </td>
                            <td className="px-6 py-5 text-center border-r border-gray-200">
                              <div className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-100 rounded-md">
                                <span className="text-sm text-gray-900">
                                  {category.rating}/{category.maxRating}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-5 text-center border-r border-gray-200">
                              <span className={`inline-flex items-center px-3 py-1.5 rounded-md text-xs border ${getStatusColor(category.matchStatus)}`}>
                                {category.matchStatus}
                              </span>
                            </td>
                            <td className="px-6 py-5 text-center border-r border-gray-200">
                              <span className={`inline-flex items-center px-3 py-1.5 rounded-md text-xs border ${getRequirementColor(category.requirement)}`}>
                                {category.requirement}
                              </span>
                            </td>
                            <td className="px-6 py-5 text-center">
                              <div className="inline-flex items-center gap-2">
                                <div className="w-16 bg-gray-200 rounded-full h-2">
                                  <div 
                                    className={`h-2 rounded-full ${category.score >= 90 ? 'bg-green-600' : category.score >= 70 ? 'bg-blue-600' : category.score >= 50 ? 'bg-yellow-600' : 'bg-red-600'}`}
                                    style={{ width: `${category.score}%` }}
                                  ></div>
                                </div>
                                <span className="text-sm text-gray-900 min-w-[3rem]">{category.score}%</span>
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b-2 border-blue-200">
                              <td className="border-r border-gray-200"></td>
                              <td colSpan={5} className="px-6 py-5">
                                <div className="flex items-start gap-4">
                                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-lg">
                                    <Star className="w-5 h-5 text-white" />
                                  </div>
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                      <div className="text-xs text-blue-900 px-2 py-1 bg-blue-200 rounded-md">AI REASONING</div>
                                    </div>
                                    <p className="text-sm text-gray-800 leading-relaxed bg-white px-4 py-3 rounded-lg border border-blue-200 shadow-sm">
                                      {category.reasoning}
                                    </p>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-5 border-t-2 border-gray-300">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="text-sm text-gray-600">
                      Overall Match Score:
                    </div>
                    <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-lg border-2 border-blue-600 shadow-sm">
                      {getScoreIcon(result.matchType)}
                      <span className="text-xl text-gray-900">{result.score}%</span>
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs border ${getMatchColor(result.matchType)}`}>
                        {result.matchType.charAt(0).toUpperCase() + result.matchType.slice(1)} Match
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedResultForDetail(null)}
                    className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-md"
                  >
                    Close Detailed View
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Action Footer */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-gray-900 mb-1">Ready to Proceed?</h3>
              <p className="text-sm text-gray-600">
                Review the scoring analysis above and click "Complete & Apply" to finalize the applications.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="px-6 py-2.5 border border-gray-300 rounded-lg hover:bg-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // ✅ SCORING COMPLETED FEEDBACK
                  toast.success({
                    title: 'AI scoring completed!',
                    description: `${resumes.length} resume${resumes.length > 1 ? 's' : ''} scored across ${jobs.length} job${jobs.length > 1 ? 's' : ''}. Applications ready to submit.`,
                    action: {
                      label: 'View Results',
                      onClick: () => {
                        toast.info('Opening detailed results...');
                      }
                    }
                  });
                  onComplete();
                }}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Complete & Apply
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
