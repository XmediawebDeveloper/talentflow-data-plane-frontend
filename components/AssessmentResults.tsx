import { ArrowLeft, User, Clock, Award, CheckCircle, XCircle, ChevronDown, ChevronUp, FileText, TrendingUp, Calendar, Briefcase, AlertCircle, Info, Filter, Layers } from 'lucide-react';
import { useState, useEffect } from 'react';
import { assessmentService } from '@/lib/services';
import {
  calculateFinalResult,
  QuestionScore,
  FinalAssessmentResult,
  getScoringBreakdown
} from '@/lib/utils/assessmentScoring';

interface AssessmentResultsProps {
  onBack: () => void;
  assessmentId: string;
  assessmentTitle: string;
  jdTitle?: string;
}

interface CandidateResult {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  score: number;
  totalScore: number;
  percentage: number;
  status: 'Passed' | 'Failed' | 'Under Review';
  completedDate: string;
  duration: string;
  sections: SectionResult[];
  round: number; // Added round tracking
  roundName?: string; // Optional round name
}

interface SectionResult {
  name: string;
  score: number;
  totalScore: number;
  percentage: number;
  questions: QuestionResult[];
}

interface QuestionResult {
  question: string;
  candidateAnswer: string;
  correctAnswer?: string;
  score: number;
  maxScore: number;
  feedback: string;
  type: 'multiple-choice' | 'text' | 'coding';
}

export default function AssessmentResults({ onBack, assessmentId, assessmentTitle, jdTitle }: AssessmentResultsProps) {
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('technical-knowledge'); // For section tabs
  const [selectedRound, setSelectedRound] = useState<number | 'all'>('all'); // Round filter
  const [selectedDetailRound, setSelectedDetailRound] = useState<number | 'all'>('all'); // Round filter for detail view
  const [candidateResults, setCandidateResults] = useState<CandidateResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [apiStats, setApiStats] = useState<{ completed_count: number; passed_count: number; failed_count: number; average_score: number | null }>({ completed_count: 0, passed_count: 0, failed_count: 0, average_score: null });

  // Fetch results from API
  useEffect(() => {
    const fetchResults = async () => {
      setIsLoading(true);
      try {
        const response = await assessmentService.listResults(assessmentId);
        if (response?.items) {
          // Map API response to component format
          const mapped: CandidateResult[] = response.items.map((item: any, index: number) => ({
            id: item.id,
            name: item.candidate_name || 'Unknown',
            email: item.candidate_email || '',
            score: Math.round(Number(item.overall_score) || 0),
            totalScore: 100,
            percentage: Math.round(Number(item.overall_score) || 0),
            status: item.passed === true ? 'Passed' : item.passed === false ? 'Failed' : 'Under Review',
            completedDate: item.completed_at?.split('T')[0] || 'N/A',
            duration: item.time_spent_seconds ? `${Math.round(item.time_spent_seconds / 60)} min` : 'N/A',
            sections: [
              {
                name: 'HR Section',
                score: Math.round(Number(item.hr_score) || 0),
                totalScore: 100,
                percentage: Math.round(Number(item.hr_score) || 0),
                questions: []
              },
              {
                name: 'Technical Section',
                score: Math.round(Number(item.technical_score) || 0),
                totalScore: 100,
                percentage: Math.round(Number(item.technical_score) || 0),
                questions: []
              },
              {
                name: 'Coding Section',
                score: Math.round(Number(item.coding_score) || 0),
                totalScore: 100,
                percentage: Math.round(Number(item.coding_score) || 0),
                questions: []
              }
            ].filter(s => s.score > 0 || s.percentage > 0),
            round: 1,
            roundName: 'Round 1'
          }));
          setCandidateResults(mapped);

          // Set stats from API
          setApiStats({
            completed_count: response.completed_count || mapped.length,
            passed_count: response.passed_count || mapped.filter((c: CandidateResult) => c.status === 'Passed').length,
            failed_count: response.failed_count || mapped.filter((c: CandidateResult) => c.status === 'Failed').length,
            average_score: response.average_score ? Math.round(Number(response.average_score)) : null
          });
        }
      } catch (error) {
        console.error('Failed to fetch assessment results:', error);
        // Keep empty results on error
        setCandidateResults([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchResults();
  }, [assessmentId]);

  // Fallback mock data for demonstration (only used when API returns empty)
  const mockCandidateResults: CandidateResult[] = [
    {
      id: '1',
      name: 'Sarah Johnson',
      email: 'sarah.johnson@email.com',
      score: 85,
      totalScore: 100,
      percentage: 85,
      status: 'Passed',
      completedDate: '2025-11-28',
      duration: '58 min',
      sections: [
        {
          name: 'Technical Knowledge',
          score: 42,
          totalScore: 50,
          percentage: 84,
          questions: [
            {
              question: 'Explain the differences between REST and GraphQL APIs.',
              candidateAnswer: 'REST uses multiple endpoints with standard HTTP methods while GraphQL uses a single endpoint with flexible queries. GraphQL allows clients to request exactly the data they need, reducing over-fetching.',
              score: 9,
              maxScore: 10,
              feedback: 'Excellent understanding. Could have mentioned schema definition and type safety.',
              type: 'text',
            },
            {
              question: 'What is the purpose of dependency injection?',
              candidateAnswer: 'Dependency injection is a design pattern that allows objects to receive their dependencies from external sources rather than creating them internally. This promotes loose coupling and makes testing easier.',
              score: 10,
              maxScore: 10,
              feedback: 'Perfect answer with clear understanding of benefits.',
              type: 'text',
            },
            {
              question: 'Which design pattern would you use for creating objects?',
              candidateAnswer: 'Factory Pattern',
              correctAnswer: 'Factory Pattern',
              score: 5,
              maxScore: 5,
              feedback: 'Correct!',
              type: 'multiple-choice',
            },
          ],
        },
        {
          name: 'Coding Challenge',
          score: 28,
          totalScore: 30,
          percentage: 93,
          questions: [
            {
              question: 'Implement a function to reverse a linked list.',
              candidateAnswer: 'function reverseList(head) {\n  let prev = null;\n  let curr = head;\n  while (curr) {\n    let next = curr.next;\n    curr.next = prev;\n    prev = curr;\n    curr = next;\n  }\n  return prev;\n}',
              score: 15,
              maxScore: 15,
              feedback: 'Clean implementation with good variable naming. Time complexity: O(n), Space complexity: O(1).',
              type: 'coding',
            },
            {
              question: 'Write a function to find the first non-repeating character in a string.',
              candidateAnswer: 'function firstNonRepeating(str) {\n  const counts = {};\n  for (let char of str) {\n    counts[char] = (counts[char] || 0) + 1;\n  }\n  for (let char of str) {\n    if (counts[char] === 1) return char;\n  }\n  return null;\n}',
              score: 13,
              maxScore: 15,
              feedback: 'Good solution. Could be optimized using a Map for better performance.',
              type: 'coding',
            },
          ],
        },
        {
          name: 'Problem Solving',
          score: 15,
          totalScore: 20,
          percentage: 75,
          questions: [
            {
              question: 'How would you optimize a slow database query?',
              candidateAnswer: 'Add proper indexes, use query optimization, implement caching, consider denormalization if needed, and use database profiling tools to identify bottlenecks.',
              score: 8,
              maxScore: 10,
              feedback: 'Good approach. Could have mentioned specific indexing strategies and query plan analysis.',
              type: 'text',
            },
            {
              question: 'Describe your approach to debugging a production issue.',
              candidateAnswer: 'Check logs, reproduce the issue, use monitoring tools, analyze error traces, and implement fixes with proper testing before deployment.',
              score: 7,
              maxScore: 10,
              feedback: 'Solid methodology. Consider mentioning rollback strategies and post-mortem analysis.',
              type: 'text',
            },
          ],
        },
      ],
      round: 1,
      roundName: 'Round 1',
    },
    {
      id: '2',
      name: 'Michael Chen',
      email: 'michael.chen@email.com',
      score: 72,
      totalScore: 100,
      percentage: 72,
      status: 'Passed',
      completedDate: '2025-11-27',
      duration: '62 min',
      sections: [
        {
          name: 'Technical Knowledge',
          score: 35,
          totalScore: 50,
          percentage: 70,
          questions: [
            {
              question: 'Explain the differences between REST and GraphQL APIs.',
              candidateAnswer: 'REST is an architectural style using HTTP methods, GraphQL is a query language that lets you request specific data.',
              score: 7,
              maxScore: 10,
              feedback: 'Basic understanding shown. Could elaborate on advantages and use cases.',
              type: 'text',
            },
          ],
        },
        {
          name: 'Coding Challenge',
          score: 22,
          totalScore: 30,
          percentage: 73,
          questions: [],
        },
        {
          name: 'Problem Solving',
          score: 15,
          totalScore: 20,
          percentage: 75,
          questions: [],
        },
      ],
      round: 1,
      roundName: 'Round 1',
    },
    {
      id: '3',
      name: 'Emily Rodriguez',
      email: 'emily.rodriguez@email.com',
      score: 58,
      totalScore: 100,
      percentage: 58,
      status: 'Failed',
      completedDate: '2025-11-26',
      duration: '45 min',
      sections: [
        {
          name: 'Technical Knowledge',
          score: 28,
          totalScore: 50,
          percentage: 56,
          questions: [],
        },
        {
          name: 'Coding Challenge',
          score: 18,
          totalScore: 30,
          percentage: 60,
          questions: [],
        },
        {
          name: 'Problem Solving',
          score: 12,
          totalScore: 20,
          percentage: 60,
          questions: [],
        },
      ],
      round: 1,
      roundName: 'Round 1',
    },
    {
      id: '4',
      name: 'John Doe',
      email: 'john.doe@email.com',
      score: 90,
      totalScore: 100,
      percentage: 90,
      status: 'Passed',
      completedDate: '2025-11-25',
      duration: '55 min',
      sections: [
        {
          name: 'Technical Knowledge',
          score: 45,
          totalScore: 50,
          percentage: 90,
          questions: [
            {
              question: 'Explain the differences between REST and GraphQL APIs.',
              candidateAnswer: 'REST uses multiple endpoints with standard HTTP methods while GraphQL uses a single endpoint with flexible queries. GraphQL allows clients to request exactly the data they need, reducing over-fetching.',
              score: 9,
              maxScore: 10,
              feedback: 'Excellent understanding. Could have mentioned schema definition and type safety.',
              type: 'text',
            },
            {
              question: 'What is the purpose of dependency injection?',
              candidateAnswer: 'Dependency injection is a design pattern that allows objects to receive their dependencies from external sources rather than creating them internally. This promotes loose coupling and makes testing easier.',
              score: 10,
              maxScore: 10,
              feedback: 'Perfect answer with clear understanding of benefits.',
              type: 'text',
            },
            {
              question: 'Which design pattern would you use for creating objects?',
              candidateAnswer: 'Factory Pattern',
              correctAnswer: 'Factory Pattern',
              score: 5,
              maxScore: 5,
              feedback: 'Correct!',
              type: 'multiple-choice',
            },
          ],
        },
        {
          name: 'Coding Challenge',
          score: 28,
          totalScore: 30,
          percentage: 93,
          questions: [
            {
              question: 'Implement a function to reverse a linked list.',
              candidateAnswer: 'function reverseList(head) {\n  let prev = null;\n  let curr = head;\n  while (curr) {\n    let next = curr.next;\n    curr.next = prev;\n    prev = curr;\n    curr = next;\n  }\n  return prev;\n}',
              score: 15,
              maxScore: 15,
              feedback: 'Clean implementation with good variable naming. Time complexity: O(n), Space complexity: O(1).',
              type: 'coding',
            },
            {
              question: 'Write a function to find the first non-repeating character in a string.',
              candidateAnswer: 'function firstNonRepeating(str) {\n  const counts = {};\n  for (let char of str) {\n    counts[char] = (counts[char] || 0) + 1;\n  }\n  for (let char of str) {\n    if (counts[char] === 1) return char;\n  }\n  return null;\n}',
              score: 13,
              maxScore: 15,
              feedback: 'Good solution. Could be optimized using a Map for better performance.',
              type: 'coding',
            },
          ],
        },
        {
          name: 'Problem Solving',
          score: 15,
          totalScore: 20,
          percentage: 75,
          questions: [
            {
              question: 'How would you optimize a slow database query?',
              candidateAnswer: 'Add proper indexes, use query optimization, implement caching, consider denormalization if needed, and use database profiling tools to identify bottlenecks.',
              score: 8,
              maxScore: 10,
              feedback: 'Good approach. Could have mentioned specific indexing strategies and query plan analysis.',
              type: 'text',
            },
            {
              question: 'Describe your approach to debugging a production issue.',
              candidateAnswer: 'Check logs, reproduce the issue, use monitoring tools, analyze error traces, and implement fixes with proper testing before deployment.',
              score: 7,
              maxScore: 10,
              feedback: 'Solid methodology. Consider mentioning rollback strategies and post-mortem analysis.',
              type: 'text',
            },
          ],
        },
      ],
      round: 2,
      roundName: 'Round 2',
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Passed': return 'bg-green-100 text-green-800 border-green-200';
      case 'Failed': return 'bg-red-100 text-red-800 border-red-200';
      case 'Under Review': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getScoreColor = (percentage: number) => {
    if (percentage >= 80) return 'text-green-600';
    if (percentage >= 60) return 'text-gray-800';
    if (percentage >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Use API results or fallback to mock data
  const displayResults = candidateResults.length > 0 ? candidateResults : mockCandidateResults;
  const selectedCandidateData = displayResults.find(c => c.id === selectedCandidate);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex-1 bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-300 border-t-gray-800 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading assessment results...</p>
        </div>
      </div>
    );
  }

  // Overview view
  if (!selectedCandidate) {
    // Filter candidates by round
    const filteredCandidates = selectedRound === 'all'
      ? displayResults
      : displayResults.filter(c => c.round === selectedRound);

    // Get unique rounds for filter
    const availableRounds = Array.from(new Set(displayResults.map(c => c.round))).sort();

    // Use API stats if available, otherwise calculate from data
    const avgScore = apiStats.average_score !== null
      ? apiStats.average_score
      : (filteredCandidates.length > 0
        ? Math.round(filteredCandidates.reduce((sum, c) => sum + c.percentage, 0) / filteredCandidates.length)
        : 0);
    const passedCount = candidateResults.length > 0 ? apiStats.passed_count : filteredCandidates.filter(c => c.status === 'Passed').length;
    const failedCount = candidateResults.length > 0 ? apiStats.failed_count : filteredCandidates.filter(c => c.status === 'Failed').length;

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
              Back to Assessments
            </button>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-gray-900 mb-2">{assessmentTitle}</h1>
                <p className="text-sm text-gray-600">
                  Assessment Results - {displayResults.length} candidates completed
                </p>
              </div>
              <button
                onClick={() => alert('Export functionality coming soon!')}
                className="px-6 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors flex items-center gap-2"
              >
                <FileText className="w-5 h-5" />
                Export Results
              </button>
            </div>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="px-8 py-6">
          {/* Round Filter */}
          {availableRounds.length > 1 && (
            <div className="bg-gradient-to-r from-gray-50 to-gray-50 border-2 border-gray-300 rounded-lg p-6 mb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gray-800 rounded-lg flex items-center justify-center">
                    <Layers className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-gray-900 mb-1">📊 View Results by Round</h3>
                    <p className="text-sm text-gray-600">
                      {selectedRound === 'all' 
                        ? `Showing all ${filteredCandidates.length} candidates across ${availableRounds.length} rounds`
                        : `Showing ${filteredCandidates.length} candidate(s) from Round ${selectedRound}`
                      }
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedRound('all')}
                    className={`px-6 py-3 rounded-lg transition-all flex items-center gap-2 ${
                      selectedRound === 'all'
                        ? 'bg-gray-800 text-white shadow-lg'
                        : 'bg-white text-gray-700 border border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                    }`}
                  >
                    <Layers className="w-4 h-4" />
                    <span>All Rounds</span>
                    <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
                      selectedRound === 'all'
                        ? 'bg-gray-500 text-white'
                        : 'bg-gray-200 text-gray-600'
                    }`}>
                      {displayResults.length}
                    </span>
                  </button>
                  {availableRounds.map(round => {
                    const roundCount = displayResults.filter(c => c.round === round).length;
                    return (
                      <button
                        key={round}
                        onClick={() => setSelectedRound(round)}
                        className={`px-6 py-3 rounded-lg transition-all flex items-center gap-2 ${
                          selectedRound === round
                            ? 'bg-gray-800 text-white shadow-lg'
                            : 'bg-white text-gray-700 border border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                        }`}
                      >
                        <span>Round {round}</span>
                        <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
                          selectedRound === round
                            ? 'bg-gray-500 text-white'
                            : 'bg-gray-200 text-gray-600'
                        }`}>
                          {roundCount}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-gray-600 text-sm mb-1">Total Candidates</div>
                  <div className="text-2xl text-gray-900">{displayResults.length}</div>
                </div>
                <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                  <User className="w-6 h-6 text-gray-800" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-gray-600 text-sm mb-1">Passed</div>
                  <div className="text-2xl text-gray-900">{passedCount}</div>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-gray-600 text-sm mb-1">Failed</div>
                  <div className="text-2xl text-gray-900">{failedCount}</div>
                </div>
                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                  <XCircle className="w-6 h-6 text-red-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-gray-600 text-sm mb-1">Avg. Score</div>
                  <div className="text-2xl text-gray-900">{avgScore}%</div>
                </div>
                <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-gray-800" />
                </div>
              </div>
            </div>
          </div>

          {/* Candidates Results Table */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-gray-900">Candidate Results</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs text-gray-600">Candidate</th>
                    <th className="text-center px-6 py-3 text-xs text-gray-600">Score</th>
                    <th className="text-center px-6 py-3 text-xs text-gray-600">Status</th>
                    <th className="text-left px-6 py-3 text-xs text-gray-600">Completed</th>
                    <th className="text-center px-6 py-3 text-xs text-gray-600">Duration</th>
                    <th className="text-center px-6 py-3 text-xs text-gray-600">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredCandidates.map((candidate) => (
                    <tr key={candidate.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-white text-sm">
                            {candidate.name.split(' ').map(n => n[0]).join('')}
                          </div>
                          <div>
                            <div className="text-sm text-gray-900">{candidate.name}</div>
                            <div className="text-xs text-gray-500">{candidate.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <span className={`text-lg ${getScoreColor(candidate.percentage)}`}>
                            {candidate.percentage}%
                          </span>
                          <span className="text-sm text-gray-500">
                            ({candidate.score}/{candidate.totalScore})
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs border ${getStatusColor(candidate.status)}`}>
                          {candidate.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Calendar className="w-4 h-4" />
                          {candidate.completedDate}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
                          <Clock className="w-4 h-4" />
                          {candidate.duration}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => setSelectedCandidate(candidate.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-800 text-white rounded-md hover:bg-gray-900 transition-colors"
                        >
                          <Award className="w-3 h-3" />
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Detailed candidate view
  return (
    <div className="flex-1 bg-gray-50 overflow-y-auto">
      {/* Sticky Header - Assessment & JD Title */}
      <div className="bg-gradient-to-r from-gray-800 to-gray-800 border-b-2 border-gray-600 sticky top-0 z-20 shadow-lg">
        <div className="px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="text-white/80 text-xs mb-1">Assessment</div>
                <h1 className="text-white text-xl">{assessmentTitle}</h1>
                {jdTitle && (
                  <div className="flex items-center gap-2 mt-1">
                    <Briefcase className="w-3.5 h-3.5 text-gray-200" />
                    <span className="text-gray-100 text-sm">Linked to: {jdTitle}</span>
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => alert('Export functionality coming soon!')}
              className="px-6 py-2.5 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white rounded-lg transition-colors flex items-center gap-2 border border-white/30"
            >
              <FileText className="w-5 h-5" />
              Export Results
            </button>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-[88px] z-10">
        <div className="px-8 py-6">
          <button
            onClick={() => setSelectedCandidate(null)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Results Overview
          </button>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-white text-xl">
                {selectedCandidateData?.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div>
                <h1 className="text-gray-900 mb-1">{selectedCandidateData?.name}</h1>
                <p className="text-sm text-gray-600">{selectedCandidateData?.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm text-gray-600">Overall Score</div>
                <div className={`text-3xl ${getScoreColor(selectedCandidateData?.percentage || 0)}`}>
                  {selectedCandidateData?.percentage}%
                </div>
              </div>
              <span className={`inline-flex items-center px-4 py-2 rounded-lg text-sm border ${getStatusColor(selectedCandidateData?.status || '')}`}>
                {selectedCandidateData?.status}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-8 py-6">
        {/* Assessment Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <div className="grid grid-cols-3 gap-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                <Briefcase className="w-6 h-6 text-gray-800" />
              </div>
              <div>
                <div className="text-sm text-gray-600">Assessment</div>
                <div className="text-gray-900">{assessmentTitle}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <Calendar className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <div className="text-sm text-gray-600">Completed</div>
                <div className="text-gray-900">{selectedCandidateData?.completedDate}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                <Clock className="w-6 h-6 text-gray-800" />
              </div>
              <div>
                <div className="text-sm text-gray-600">Time Taken</div>
                <div className="text-gray-900">{selectedCandidateData?.duration}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Section Scores */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-gray-900 mb-4">Section-wise Performance</h2>
          <div className="space-y-4">
            {selectedCandidateData?.sections.map((section, idx) => (
              <div key={idx} className={`border rounded-lg p-4 ${
                section.name.toLowerCase().includes('hr') 
                  ? 'border-gray-200 bg-gray-50/30' 
                  : 'border-green-200 bg-green-50/30'
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-900">{section.name}</span>
                      {section.name.toLowerCase().includes('hr') ? (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-900 rounded text-xs">
                          Not Scored
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                          Scored (0-10)
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">
                      {section.score}/{section.totalScore} points
                      {!section.name.toLowerCase().includes('hr') && (
                        <span className="text-gray-800 ml-2">• Pass: ≥7/10</span>
                      )}
                    </div>
                  </div>
                  <div className={`text-2xl ${getScoreColor(section.percentage)}`}>
                    {section.percentage}%
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full ${section.percentage >= 80 ? 'bg-green-600' : section.percentage >= 60 ? 'bg-gray-800' : section.percentage >= 40 ? 'bg-yellow-600' : 'bg-red-600'}`}
                    style={{ width: `${section.percentage}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Scoring Rules & Pass/Fail Criteria */}
        <div className="bg-gradient-to-br from-gray-50 to-gray-50 border-2 border-gray-300 rounded-lg p-6 mb-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0">
              <Info className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-gray-900 mb-1">Assessment Scoring Rules</h2>
              <p className="text-sm text-gray-600">Critical Evaluation Logic for PASS/FAIL determination</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* HR Section Rules */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-4 h-4 text-gray-600" />
                </div>
                <h3 className="text-gray-900">HR Section</h3>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-1.5 flex-shrink-0"></div>
                  <span className="text-gray-700">Responses are <strong>recorded</strong></span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-1.5 flex-shrink-0"></div>
                  <span className="text-gray-700">Displayed in reports</span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 mt-1.5 flex-shrink-0"></div>
                  <span className="text-gray-700"><strong className="text-yellow-700">NOT part of PASS/FAIL</strong> decision</span>
                </div>
              </div>
            </div>

            {/* Technical & Coding Rules */}
            <div className="bg-white rounded-lg border-2 border-green-300 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                </div>
                <h3 className="text-gray-900">Technical & Coding</h3>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-600 mt-1.5 flex-shrink-0"></div>
                  <span className="text-gray-700">Rating scale: <strong>0-10</strong> per question</span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-600 mt-1.5 flex-shrink-0"></div>
                  <span className="text-gray-700">Minimum passing: <strong>≥7 per question</strong></span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-600 mt-1.5 flex-shrink-0"></div>
                  <span className="text-gray-700"><strong className="text-green-700">Used for PASS/FAIL</strong> determination</span>
                </div>
              </div>
            </div>
          </div>

          {/* Pass Logic */}
          <div className="mt-4 bg-white rounded-lg border-2 border-gray-300 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Award className="w-5 h-5 text-gray-800" />
              <h3 className="text-gray-900">Pass Logic (Per Section)</h3>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 mb-3">
              <div className="text-sm text-gray-900 mb-2">A section PASSES if either condition is met:</div>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="text-gray-800 font-bold flex-shrink-0">1.</span>
                  <span className="text-gray-700">At least <strong>70% of questions</strong> score ≥7</span>
                </div>
                <div className="flex items-center gap-2 text-gray-500 text-xs">
                  <span className="px-2 py-0.5 bg-gray-200 rounded">Example:</span>
                  <span>10 questions → 7+ questions must score ≥7</span>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-sm text-gray-900 mb-2">OR:</div>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="text-gray-800 font-bold flex-shrink-0">2.</span>
                  <span className="text-gray-700">Overall average score ≥7</span>
                </div>
                <div className="flex items-center gap-2 text-gray-500 text-xs">
                  <span className="px-2 py-0.5 bg-gray-200 rounded">Example:</span>
                  <span>Total score: 75/100 → Average: 7.5 ≥ 7 → PASS</span>
                </div>
              </div>
            </div>
          </div>

          {/* Final Result Calculation */}
          <div className="mt-4 bg-gradient-to-r from-green-50 to-gray-50 border-2 border-green-300 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Award className="w-5 h-5 text-green-600" />
              <h3 className="text-gray-900">Final Assessment Result</h3>
            </div>
            <div className="text-sm text-gray-700">
              <strong>PASS</strong> if <strong>ALL</strong> evaluated sections (Technical + Coding) pass
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>Remember: HR section is excluded from final PASS/FAIL calculation</span>
            </div>
          </div>
        </div>

        {/* Detailed Answers */}
        <div className="bg-white rounded-lg border-2 border-gray-300 overflow-hidden shadow-lg">
          <div className="bg-gradient-to-r from-gray-800 to-gray-800 px-6 py-5">
            <h2 className="text-white">📝 Detailed Question Analysis</h2>
            <p className="text-gray-100 text-sm mt-1">Review questions and answers for each section</p>
          </div>

          {/* Tab Navigation */}
          <div className="border-b border-gray-200 bg-gray-50">
            <div className="flex gap-2 px-6 py-3">
              {selectedCandidateData?.sections.map((section, idx) => {
                const tabKey = section.name.toLowerCase().replace(/\s+/g, '-');
                const isActive = activeTab === tabKey;
                
                return (
                  <button
                    key={idx}
                    onClick={() => setActiveTab(tabKey)}
                    className={`px-6 py-3 rounded-t-lg transition-all flex items-center gap-2 ${
                      isActive
                        ? 'bg-white text-gray-800 border-t-2 border-x border-gray-800 shadow-sm'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <span className="font-medium">{section.name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      isActive ? 'bg-gray-100 text-gray-900' : 'bg-gray-200 text-gray-600'
                    }`}>
                      {section.questions.length}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {selectedCandidateData?.sections.map((section, sectionIdx) => {
              const tabKey = section.name.toLowerCase().replace(/\s+/g, '-');
              const isActiveTab = activeTab === tabKey;

              if (!isActiveTab) return null;

              return (
                <div key={sectionIdx} className="space-y-6">
                  {/* Section Header */}
                  <div className="flex items-center justify-between pb-4 border-b border-gray-200">
                    <div>
                      <h3 className="text-xl text-gray-900">{section.name}</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        {section.questions.length} question{section.questions.length !== 1 ? 's' : ''} • 
                        <span className="ml-1">{section.score}/{section.totalScore} points</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-600 mb-1">Section Score</div>
                      <div className={`text-3xl ${getScoreColor(section.percentage)}`}>
                        {section.percentage}%
                      </div>
                    </div>
                  </div>

                  {/* Questions */}
                  {section.questions.length > 0 ? (
                    <div className="space-y-6">
                      {section.questions.map((q, qIdx) => (
                        <div key={qIdx} className="border-2 border-gray-200 rounded-lg overflow-hidden hover:border-gray-300 transition-colors">
                          {/* Question Header */}
                          <div className="bg-gradient-to-r from-gray-50 to-gray-50 px-6 py-4 border-b border-gray-200">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <span className="px-3 py-1 bg-gray-800 text-white rounded-full text-xs font-medium">
                                    Q{qIdx + 1}
                                  </span>
                                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                    q.type === 'coding' 
                                      ? 'bg-gray-100 text-gray-900'
                                      : q.type === 'multiple-choice'
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-gray-100 text-gray-900'
                                  }`}>
                                    {q.type === 'coding' ? '💻 Coding' : q.type === 'multiple-choice' ? '✓ MCQ' : '✍️ Text'}
                                  </span>
                                </div>
                                <div className="text-gray-900 leading-relaxed">{q.question}</div>
                              </div>
                              <div className="ml-6 text-right flex-shrink-0">
                                <div className="text-xs text-gray-600 mb-1">Score</div>
                                <div className="flex items-center gap-2">
                                  <div className={`text-2xl font-bold ${getScoreColor((q.score / q.maxScore) * 100)}`}>
                                    {q.score}
                                  </div>
                                  <div className="text-gray-400">/</div>
                                  <div className="text-xl text-gray-600">{q.maxScore}</div>
                                </div>
                                <div className={`text-xs mt-1 ${getScoreColor((q.score / q.maxScore) * 100)}`}>
                                  {Math.round((q.score / q.maxScore) * 100)}%
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Question Content */}
                          <div className="p-6 space-y-4">
                            {/* Candidate's Answer */}
                            <div>
                              <div className="flex items-center gap-2 mb-3">
                                <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                  <User className="w-4 h-4 text-gray-800" />
                                </div>
                                <div className="text-sm font-medium text-gray-800">CANDIDATE'S ANSWER</div>
                              </div>
                              <div className={`rounded-lg p-4 ${
                                q.type === 'coding' 
                                  ? 'bg-gray-900 text-green-400 font-mono text-sm overflow-x-auto'
                                  : 'bg-gray-50 text-gray-800'
                              }`}>
                                <div className={q.type === 'coding' ? 'whitespace-pre-wrap' : ''}>
                                  {q.candidateAnswer}
                                </div>
                              </div>
                            </div>

                            {/* Correct Answer (if applicable) */}
                            {q.correctAnswer && (
                              <div>
                                <div className="flex items-center gap-2 mb-3">
                                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                    <CheckCircle className="w-4 h-4 text-green-600" />
                                  </div>
                                  <div className="text-sm font-medium text-green-900">CORRECT ANSWER</div>
                                </div>
                                <div className="bg-green-50 rounded-lg p-4">
                                  <div className="text-gray-800">{q.correctAnswer}</div>
                                </div>
                              </div>
                            )}

                            {/* AI Feedback */}
                            <div>
                              <div className="flex items-center gap-2 mb-3">
                                <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                  <FileText className="w-4 h-4 text-gray-800" />
                                </div>
                                <div className="text-sm font-medium text-gray-800">AI FEEDBACK & EVALUATION</div>
                              </div>
                              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                <div className="text-gray-800 leading-relaxed">{q.feedback}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                      <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-gray-600">No questions available for this section</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}