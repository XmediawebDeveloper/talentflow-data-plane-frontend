import { X, Loader2, CheckCircle2, Database, Sparkles, ArrowRight, Mail, Phone, MapPin, Building2, Clock, TrendingUp, Star, Filter, CheckCircle } from 'lucide-react';
import { useState, useEffect } from 'react';

interface AITalentMatchModalInlineProps {
  jobTitle: string;
  onClose: () => void;
  onResultsComplete?: (results: any[]) => void;
}

type ProcessStep = 'embedding' | 'matching' | 'results';

export default function AITalentMatchModalInline({ jobTitle, onClose, onResultsComplete }: AITalentMatchModalInlineProps) {
  const [currentStep, setCurrentStep] = useState<ProcessStep>('embedding');
  const [jdEmbeddingExists, setJdEmbeddingExists] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processDetails, setProcessDetails] = useState<string>('');
  const [matchResults, setMatchResults] = useState<any[]>([]);
  const [filterThreshold, setFilterThreshold] = useState(0);
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);

  useEffect(() => {
    runMatchingProcess();
  }, []);

  const runMatchingProcess = async () => {
    // Step 1: Check JD Embedding
    setCurrentStep('embedding');
    setProcessDetails('Checking if JD vector exists in database...');
    await sleep(800);

    // Simulate random chance that embedding exists
    const embeddingExists = Math.random() > 0.5;
    setJdEmbeddingExists(embeddingExists);

    if (!embeddingExists) {
      setProcessDetails('JD vector not found. Generating embedding...');
      setProgress(20);
      await sleep(1000);

      setProcessDetails('Extracting key requirements and skills...');
      setProgress(40);
      await sleep(800);

      setProcessDetails('Creating vector representation using embedding engine...');
      setProgress(60);
      await sleep(1200);

      setProcessDetails('Storing JD vector in vector database...');
      setProgress(80);
      await sleep(800);

      setProcessDetails('JD embedding complete!');
      setProgress(100);
      await sleep(600);
    } else {
      setProcessDetails('JD vector found in database!');
      setProgress(100);
      await sleep(800);
    }

    // Step 2: Cosine Similarity Matching
    setCurrentStep('matching');
    setProgress(0);
    setProcessDetails('Loading resume vectors from tenant database...');
    await sleep(800);

    setProcessDetails('Computing cosine similarity for 1,247 resumes...');
    setProgress(30);
    await sleep(1500);

    setProcessDetails('Analyzing semantic matches...');
    setProgress(60);
    await sleep(1200);

    setProcessDetails('Ranking candidates by relevance...');
    setProgress(90);
    await sleep(1000);

    setProcessDetails('Match complete!');
    setProgress(100);
    await sleep(600);

    // Step 3: Generate and Show Results
    const results = generateMatchResults();
    setMatchResults(results);
    setCurrentStep('results');
    if (onResultsComplete) {
      onResultsComplete(results);
    }
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const generateMatchResults = () => {
    // Simulate AI matching results with realistic similarity scores
    const candidates = [
      {
        id: '1',
        name: 'John Doe',
        title: 'Senior Java Developer',
        email: 'john.doe@email.com',
        phone: '+1 (555) 123-4567',
        location: 'New York, NY',
        experience: '5-7 years',
        skills: ['Java', 'Spring Boot', 'AWS', 'Docker', 'Kubernetes', 'PostgreSQL', 'Redis'],
        currentCompany: 'Google',
        noticePeriod: '30 Days',
        matchScore: 94.5,
        matchReason: 'Excellent match for all required skills. 5+ years Java experience, strong AWS and containerization expertise.',
        skillMatches: ['Java', 'Spring Boot', 'AWS', 'Docker', 'Kubernetes'],
        uploadDate: '2025-11-28',
      },
      {
        id: '3',
        name: 'Mike Johnson',
        title: 'DevOps Engineer',
        email: 'mike.j@email.com',
        phone: '+1 (555) 345-6789',
        location: 'Austin, TX',
        experience: '5-7 years',
        skills: ['AWS', 'Terraform', 'Kubernetes', 'CI/CD', 'Python', 'Bash'],
        currentCompany: 'Netflix',
        noticePeriod: '45 Days',
        matchScore: 88.3,
        matchReason: 'Excellent DevOps background with strong AWS and Kubernetes skills. Infrastructure expertise aligns well.',
        skillMatches: ['AWS', 'Kubernetes'],
        uploadDate: '2025-11-26',
      },
      {
        id: '5',
        name: 'David Chen',
        title: 'Full Stack Developer',
        email: 'david.chen@email.com',
        phone: '+1 (555) 567-8901',
        location: 'Seattle, WA',
        experience: '3-5 years',
        skills: ['React', 'Node.js', 'TypeScript', 'MongoDB', 'GraphQL', 'AWS'],
        currentCompany: 'Amazon',
        noticePeriod: 'Immediate',
        matchScore: 85.7,
        matchReason: 'Strong AWS experience and modern tech stack. Full-stack background with cloud expertise.',
        skillMatches: ['AWS', 'TypeScript'],
        uploadDate: '2025-11-24',
      },
      {
        id: '2',
        name: 'Jane Smith',
        title: 'Python Developer',
        email: 'jane.smith@email.com',
        phone: '+1 (555) 234-5678',
        location: 'San Francisco, CA',
        experience: '3-5 years',
        skills: ['Python', 'Django', 'FastAPI', 'PostgreSQL', 'MongoDB', 'Docker'],
        currentCompany: 'Microsoft',
        noticePeriod: '60 Days',
        matchScore: 78.2,
        matchReason: 'Good backend development experience with transferable skills. Strong database and Docker knowledge.',
        skillMatches: ['Docker', 'PostgreSQL'],
        uploadDate: '2025-11-27',
      },
      {
        id: '8',
        name: 'Lisa Anderson',
        title: 'UI/UX Designer',
        email: 'lisa.a@email.com',
        phone: '+1 (555) 890-1234',
        location: 'Los Angeles, CA',
        experience: '5-7 years',
        skills: ['Figma', 'Adobe XD', 'User Research', 'Prototyping', 'Design Systems'],
        currentCompany: 'Adobe',
        noticePeriod: '30 Days',
        matchScore: 42.1,
        matchReason: 'Limited technical skill overlap. Design background may not align with technical requirements.',
        skillMatches: [],
        uploadDate: '2025-11-21',
      },
      {
        id: '6',
        name: 'Emily Rodriguez',
        title: 'Registered Nurse',
        email: 'emily.r@email.com',
        phone: '+1 (555) 678-9012',
        location: 'Baltimore, MD',
        experience: '7-10 years',
        skills: ['Patient Care', 'EMR Systems', 'Critical Care', 'ACLS Certified'],
        currentCompany: 'Johns Hopkins Hospital',
        noticePeriod: '60 Days',
        matchScore: 15.3,
        matchReason: 'Different career domain. Skills and experience do not match technical requirements.',
        skillMatches: [],
        uploadDate: '2025-11-23',
      },
    ];

    // Sort by match score
    return candidates.sort((a, b) => b.matchScore - a.matchScore);
  };

  const getMatchColor = (score: number) => {
    if (score >= 85) return 'text-green-600';
    if (score >= 70) return 'text-gray-800';
    if (score >= 50) return 'text-yellow-600';
    return 'text-gray-600';
  };

  const getMatchBgColor = (score: number) => {
    if (score >= 85) return 'bg-green-100 border-green-300';
    if (score >= 70) return 'bg-gray-100 border-gray-300';
    if (score >= 50) return 'bg-yellow-100 border-yellow-300';
    return 'bg-gray-100 border-gray-300';
  };

  const getMatchLabel = (score: number) => {
    if (score >= 85) return 'Excellent Match';
    if (score >= 70) return 'Good Match';
    if (score >= 50) return 'Moderate Match';
    return 'Low Match';
  };

  const handleSelectCandidate = (id: string) => {
    setSelectedCandidates(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const filteredResults = matchResults.filter(r => r.matchScore >= filterThreshold);

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-6xl my-2 sm:my-0">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 sticky top-0 bg-white rounded-t-xl z-10">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-gray-800" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-xl text-gray-900">AI Talent Match</h2>
              <p className="text-xs sm:text-sm text-gray-500 truncate">{jobTitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 rounded-md hover:bg-gray-100"
           aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {currentStep !== 'results' ? (
          <div className="p-4 sm:p-8">
            {/* Step 1: JD Embedding */}
            <div className="mb-4 sm:mb-8">
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                {currentStep === 'embedding' ? (
                  <Loader2 className="w-6 h-6 text-gray-800 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-6 h-6 text-green-600" />
                )}
                <div className="flex-1">
                  <h3 className="text-sm sm:text-base text-gray-900 mb-1">Step 1: JD Embedding Check</h3>
                  <p className="text-xs sm:text-sm text-gray-600">
                    {jdEmbeddingExists && currentStep !== 'embedding'
                      ? 'JD vector found in database'
                      : currentStep !== 'embedding'
                      ? 'JD vector generated and stored'
                      : 'Checking and generating JD vector...'}
                  </p>
                </div>
              </div>

              {currentStep === 'embedding' && (
                <div className="ml-6 sm:ml-9">
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 sm:p-4">
                    <div className="flex items-start gap-2 sm:gap-3 mb-3">
                      <Database className="w-4 h-4 sm:w-5 sm:h-5 text-gray-800 mt-0.5 flex-shrink-0" />
                      <p className="text-xs sm:text-sm text-gray-800">{processDetails}</p>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-gray-800 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-900 mt-2 text-right">{progress}%</div>
                  </div>

                  {!jdEmbeddingExists && progress > 0 && (
                    <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <h4 className="text-xs text-gray-700 mb-2">Embedding Process:</h4>
                      <ul className="text-xs text-gray-600 space-y-1">
                        <li className="flex items-center gap-2">
                          {progress >= 20 ? <CheckCircle2 className="w-3 h-3 text-green-600" /> : <div className="w-3 h-3 rounded-full border-2 border-gray-300" />}
                          Extracting job requirements
                        </li>
                        <li className="flex items-center gap-2">
                          {progress >= 40 ? <CheckCircle2 className="w-3 h-3 text-green-600" /> : <div className="w-3 h-3 rounded-full border-2 border-gray-300" />}
                          Analyzing skills and qualifications
                        </li>
                        <li className="flex items-center gap-2">
                          {progress >= 60 ? <CheckCircle2 className="w-3 h-3 text-green-600" /> : <div className="w-3 h-3 rounded-full border-2 border-gray-300" />}
                          Creating vector representation
                        </li>
                        <li className="flex items-center gap-2">
                          {progress >= 80 ? <CheckCircle2 className="w-3 h-3 text-green-600" /> : <div className="w-3 h-3 rounded-full border-2 border-gray-300" />}
                          Storing in vector database
                        </li>
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Step 2: Cosine Similarity Matching */}
            <div className="mb-4 sm:mb-8">
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                {currentStep === 'matching' ? (
                  <Loader2 className="w-6 h-6 text-gray-800 animate-spin" />
                ) : (
                  <div className="w-6 h-6 rounded-full border-2 border-gray-300" />
                )}
                <div className="flex-1">
                  <h3 className={`text-sm sm:text-base mb-1 ${currentStep === 'embedding' ? 'text-gray-400' : 'text-gray-900'}`}>
                    Step 2: Cosine Similarity Matching
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-600">
                    {currentStep === 'matching'
                      ? 'Comparing JD with resume vectors...'
                      : 'Waiting for embedding to complete'}
                  </p>
                </div>
              </div>

              {currentStep === 'matching' && (
                <div className="ml-6 sm:ml-9">
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 sm:p-4">
                    <div className="flex items-start gap-2 sm:gap-3 mb-3">
                      <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-gray-800 mt-0.5 flex-shrink-0" />
                      <p className="text-xs sm:text-sm text-gray-800">{processDetails}</p>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-gray-800 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-900 mt-2 text-right">{progress}%</div>
                  </div>

                  <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <h4 className="text-xs text-gray-700 mb-2">Matching Algorithm:</h4>
                    <div className="text-xs text-gray-600 space-y-2">
                      <div className="flex items-center justify-between p-1.5 sm:p-2 bg-white rounded border border-gray-200">
                        <span>Algorithm:</span>
                        <span className="font-mono text-gray-800 text-[10px] sm:text-xs">Cosine Similarity</span>
                      </div>
                      <div className="flex items-center justify-between p-1.5 sm:p-2 bg-white rounded border border-gray-200">
                        <span>Resume Database:</span>
                        <span className="font-mono text-gray-800 text-[10px] sm:text-xs">1,247 vectors</span>
                      </div>
                      <div className="flex items-center justify-between p-1.5 sm:p-2 bg-white rounded border border-gray-200">
                        <span>Embedding Model:</span>
                        <span className="font-mono text-gray-800 text-[10px] sm:text-xs">text-embedding-3</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Results View */
          <div>
            {/* Stats Bar */}
            <div className="bg-gradient-to-r from-gray-50 to-gray-50 border-t border-b border-gray-200 px-3 sm:px-6 py-3 sm:py-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="grid grid-cols-4 gap-2 sm:flex sm:items-center sm:gap-8">
                  <div className="text-center sm:text-left">
                    <div className="text-lg sm:text-2xl text-gray-900">{matchResults.length}</div>
                    <div className="text-[10px] sm:text-sm text-gray-600">Total</div>
                  </div>
                  <div className="hidden sm:block w-px h-10 bg-gray-300" />
                  <div className="text-center sm:text-left">
                    <div className="text-lg sm:text-2xl text-green-600">
                      {matchResults.filter(r => r.matchScore >= 85).length}
                    </div>
                    <div className="text-[10px] sm:text-sm text-gray-600"><span className="hidden sm:inline">Excellent </span>85%+</div>
                  </div>
                  <div className="hidden sm:block w-px h-10 bg-gray-300" />
                  <div className="text-center sm:text-left">
                    <div className="text-lg sm:text-2xl text-gray-800">
                      {matchResults.filter(r => r.matchScore >= 70 && r.matchScore < 85).length}
                    </div>
                    <div className="text-[10px] sm:text-sm text-gray-600"><span className="hidden sm:inline">Good </span>70-84%</div>
                  </div>
                  <div className="hidden sm:block w-px h-10 bg-gray-300" />
                  <div className="text-center sm:text-left">
                    <div className="text-lg sm:text-2xl text-yellow-600">
                      {matchResults.filter(r => r.matchScore >= 50 && r.matchScore < 70).length}
                    </div>
                    <div className="text-[10px] sm:text-sm text-gray-600"><span className="hidden sm:inline">Moderate </span>50-69%</div>
                  </div>
                </div>

                {/* Filter */}
                <div className="flex items-center gap-2 sm:gap-3">
                  <Filter className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  <span className="text-xs sm:text-sm text-gray-700 whitespace-nowrap">Min Match:</span>
                  <select
                    value={filterThreshold}
                    onChange={(e) => setFilterThreshold(Number(e.target.value))}
                    className="px-2 sm:px-3 py-1.5 border border-gray-300 rounded-md text-xs sm:text-sm text-black focus:outline-none focus:ring-2 focus:ring-gray-600 w-full sm:w-auto"
                  >
                    <option value={0}>All (0%+)</option>
                    <option value={50}>50%+</option>
                    <option value={70}>70%+</option>
                    <option value={85}>85%+</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Results List */}
            <div className="p-3 sm:p-6 max-h-[600px] overflow-y-auto">
              <div className="mb-3 sm:mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="text-xs sm:text-sm text-gray-600">
                  Showing <span className="text-gray-900">{filteredResults.length}</span> candidates
                </div>
                {selectedCandidates.length > 0 && (
                  <div className="flex items-center gap-2 sm:gap-3">
                    <span className="text-xs sm:text-sm text-gray-600">
                      {selectedCandidates.length} selected
                    </span>
                    <button className="px-3 sm:px-4 py-1.5 sm:py-2 bg-gray-800 text-white text-xs sm:text-sm rounded-md hover:bg-gray-900 transition-colors">
                      <span className="hidden sm:inline">Add as Applicants</span>
                      <span className="sm:hidden">Add</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                {filteredResults.map((candidate, index) => (
                  <div
                    key={candidate.id}
                    className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all"
                  >
                    <div className="p-3 sm:p-5">
                      <div className="flex items-start gap-2 sm:gap-4">
                        {/* Rank Badge */}
                        <div className="flex-shrink-0">
                          <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-sm sm:text-base ${
                            index === 0 ? 'bg-yellow-100 text-yellow-700 border-2 border-yellow-300' :
                            index === 1 ? 'bg-gray-100 text-gray-700 border-2 border-gray-300' :
                            index === 2 ? 'bg-orange-100 text-orange-700 border-2 border-orange-300' :
                            'bg-gray-50 text-gray-600'
                          }`}>
                            #{index + 1}
                          </div>
                        </div>

                        {/* Candidate Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
                                <h3 className="text-sm sm:text-base text-gray-900 truncate">{candidate.name}</h3>
                                {index < 3 && (
                                  <Star className={`w-4 h-4 flex-shrink-0 ${
                                    index === 0 ? 'text-yellow-500 fill-yellow-500' :
                                    index === 1 ? 'text-gray-400 fill-gray-400' :
                                    'text-orange-500 fill-orange-500'
                                  }`} />
                                )}
                              </div>
                              <p className="text-xs sm:text-sm text-gray-600 mb-2">{candidate.title}</p>
                              <div className="flex flex-wrap items-center gap-x-2 sm:gap-x-4 gap-y-1 text-[10px] sm:text-xs text-gray-600">
                                <span className="flex items-center gap-1 hidden sm:flex">
                                  <Mail className="w-3 h-3" />
                                  {candidate.email}
                                </span>
                                <span className="flex items-center gap-1 hidden sm:flex">
                                  <Phone className="w-3 h-3" />
                                  {candidate.phone}
                                </span>
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3 flex-shrink-0" />
                                  {candidate.location}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Building2 className="w-3 h-3 flex-shrink-0" />
                                  {candidate.currentCompany}
                                </span>
                              </div>
                            </div>

                            {/* Match Score */}
                            <div className="text-right ml-2 sm:ml-4 flex-shrink-0">
                              <div className={`text-lg sm:text-2xl mb-1 ${getMatchColor(candidate.matchScore)}`}>
                                {candidate.matchScore}%
                              </div>
                              <div className={`inline-block px-2 py-0.5 rounded-full text-xs border ${getMatchBgColor(candidate.matchScore)}`}>
                                {getMatchLabel(candidate.matchScore)}
                              </div>
                            </div>
                          </div>

                          {/* AI Analysis */}
                          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3">
                            <div className="flex items-start gap-2">
                              <Sparkles className="w-3.5 h-3.5 text-gray-800 mt-0.5 flex-shrink-0" />
                              <div>
                                <div className="text-xs text-gray-900 mb-0.5">AI Analysis</div>
                                <p className="text-xs text-gray-700">{candidate.matchReason}</p>
                              </div>
                            </div>
                          </div>

                          {/* Skills */}
                          <div className="flex flex-wrap gap-1.5">
                            {candidate.skills.map((skill: string) => {
                              const isMatch = candidate.skillMatches.includes(skill);
                              return (
                                <span
                                  key={skill}
                                  className={`px-2 py-0.5 rounded-full text-xs ${
                                    isMatch
                                      ? 'bg-green-100 text-green-700 border border-green-300'
                                      : 'bg-gray-100 text-gray-600 border border-gray-200'
                                  }`}
                                >
                                  {isMatch && <CheckCircle className="w-2.5 h-2.5 inline mr-0.5" />}
                                  {skill}
                                </span>
                              );
                            })}
                          </div>
                        </div>

                        {/* Selection Checkbox */}
                        <div className="flex-shrink-0">
                          <input
                            type="checkbox"
                            checked={selectedCandidates.includes(candidate.id)}
                            onChange={() => handleSelectCandidate(candidate.id)}
                            className="w-4 h-4 text-gray-800 rounded"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {filteredResults.length === 0 && (
                <div className="bg-white rounded-lg border border-gray-200 p-6 sm:p-12 text-center">
                  <Filter className="w-10 h-10 sm:w-12 sm:h-12 text-gray-400 mx-auto mb-3 sm:mb-4" />
                  <h3 className="text-base sm:text-lg text-gray-900 mb-2">No candidates match this threshold</h3>
                  <p className="text-xs sm:text-base text-gray-600 mb-4">Try lowering the minimum match percentage</p>
                  <button
                    onClick={() => setFilterThreshold(0)}
                    className="px-4 sm:px-6 py-2 bg-gray-800 text-white text-sm rounded-md hover:bg-gray-900 transition-colors"
                  >
                    Show All Candidates
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}