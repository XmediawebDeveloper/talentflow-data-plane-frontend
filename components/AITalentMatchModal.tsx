'use client';

import { X, Loader2, CheckCircle2, Database, Sparkles, ArrowRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import { usePlanFeature } from '@/lib/hooks/usePlanFeature';
import { toast } from 'sonner';

interface AITalentMatchModalProps {
  job: any;
  onClose: () => void;
  onComplete: (results: any[]) => void;
}

type ProcessStep = 'embedding' | 'matching' | 'complete';

export default function AITalentMatchModal({ job, onClose, onComplete }: AITalentMatchModalProps) {
  const { available: aiTalentMatchAvailable } = usePlanFeature('ai_talent_match');
  const [currentStep, setCurrentStep] = useState<ProcessStep>('embedding');
  const [jdEmbeddingExists, setJdEmbeddingExists] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processDetails, setProcessDetails] = useState<string>('');

  useEffect(() => {
    if (!aiTalentMatchAvailable) {
      toast.error('AI Talent Match is not available in your plan');
      onClose();
      return;
    }
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

    // Step 3: Generate Results
    setCurrentStep('complete');
    const results = generateMatchResults(job);
    
    await sleep(800);
    onComplete(results);
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const generateMatchResults = (job: any) => {
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-gray-800" />
            </div>
            <div>
              <h2 className="text-xl text-gray-900">AI Talent Match</h2>
              <p className="text-sm text-gray-500">{job.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 rounded-md hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8">
          {/* Step 1: JD Embedding */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              {currentStep === 'embedding' ? (
                <Loader2 className="w-6 h-6 text-gray-800 animate-spin" />
              ) : (
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              )}
              <div className="flex-1">
                <h3 className="text-gray-900 mb-1">Step 1: JD Embedding Check</h3>
                <p className="text-sm text-gray-600">
                  {jdEmbeddingExists && currentStep !== 'embedding'
                    ? 'JD vector found in database'
                    : currentStep !== 'embedding'
                    ? 'JD vector generated and stored'
                    : 'Checking and generating JD vector...'}
                </p>
              </div>
            </div>

            {currentStep === 'embedding' && (
              <div className="ml-9">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <Database className="w-5 h-5 text-gray-800 mt-0.5" />
                    <p className="text-sm text-gray-800">{processDetails}</p>
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
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
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
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              {currentStep === 'matching' ? (
                <Loader2 className="w-6 h-6 text-gray-800 animate-spin" />
              ) : currentStep === 'complete' ? (
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              ) : (
                <div className="w-6 h-6 rounded-full border-2 border-gray-300" />
              )}
              <div className="flex-1">
                <h3 className={`mb-1 ${currentStep === 'embedding' ? 'text-gray-400' : 'text-gray-900'}`}>
                  Step 2: Cosine Similarity Matching
                </h3>
                <p className="text-sm text-gray-600">
                  {currentStep === 'complete'
                    ? 'Matching complete - candidates ranked by relevance'
                    : currentStep === 'matching'
                    ? 'Comparing JD with resume vectors...'
                    : 'Waiting for embedding to complete'}
                </p>
              </div>
            </div>

            {currentStep === 'matching' && (
              <div className="ml-9">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <Sparkles className="w-5 h-5 text-gray-800 mt-0.5" />
                    <p className="text-sm text-gray-800">{processDetails}</p>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-gray-800 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-900 mt-2 text-right">{progress}%</div>
                </div>

                <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <h4 className="text-xs text-gray-700 mb-2">Matching Algorithm:</h4>
                  <div className="text-xs text-gray-600 space-y-2">
                    <div className="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
                      <span>Algorithm:</span>
                      <span className="font-mono text-gray-800">Cosine Similarity</span>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
                      <span>Resume Database:</span>
                      <span className="font-mono text-gray-800">1,247 vectors</span>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
                      <span>Embedding Model:</span>
                      <span className="font-mono text-gray-800">text-embedding-3</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Step 3: Complete */}
          {currentStep === 'complete' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-3" />
              <h3 className="text-lg text-gray-900 mb-2">Matching Complete!</h3>
              <p className="text-sm text-gray-600 mb-4">
                Found top matching candidates ranked by AI relevance score
              </p>
              <div className="flex items-center justify-center gap-2 text-sm text-green-700">
                <span>Redirecting to results</span>
                <ArrowRight className="w-4 h-4 animate-pulse" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
