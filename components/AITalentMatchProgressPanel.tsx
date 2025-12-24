import { Sparkles, CheckCircle2, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';

interface MatchedCandidate {
  id: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  location: string;
  experience: string;
  skills: string[];
  currentCompany: string;
  noticePeriod: string;
  matchScore: number;
  matchReason: string;
  skillMatches: string[];
  uploadDate: string;
  education?: string;
  certifications?: string[];
  attachmentCount?: number;
  versions?: Array<{
    id: string;
    name: string;
    uploadDate: string;
    size: string;
  }>;
}

interface AITalentMatchProgressPanelProps {
  jobTitle: string;
  onComplete: (results: MatchedCandidate[]) => void;
}

export default function AITalentMatchProgressPanel({ 
  jobTitle,
  onComplete 
}: AITalentMatchProgressPanelProps) {
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(1);
  const [completedCandidates, setCompletedCandidates] = useState(0);
  
  const totalCandidates = 8;
  const steps = [
    'Analyzing job requirements',
    'Scanning candidate database',
    'Computing AI match scores',
    'Ranking candidates',
    'Finalizing results'
  ];

  useEffect(() => {
    // Simulate AI matching progress
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 2;
      });
    }, 80);

    // Update steps
    const stepInterval = setInterval(() => {
      setCurrentStep(prev => {
        if (prev >= steps.length) return prev;
        return prev + 1;
      });
    }, 1000);

    // Update completed candidates
    const candidateInterval = setInterval(() => {
      setCompletedCandidates(prev => {
        if (prev >= totalCandidates) return prev;
        return prev + 1;
      });
    }, 500);

    // Complete after 4 seconds
    const completeTimeout = setTimeout(() => {
      clearInterval(interval);
      clearInterval(stepInterval);
      clearInterval(candidateInterval);
      
      // Generate mock results
      const results = generateMockResults();
      onComplete(results);
    }, 4000);

    return () => {
      clearInterval(interval);
      clearInterval(stepInterval);
      clearInterval(candidateInterval);
      clearTimeout(completeTimeout);
    };
  }, [onComplete]);

  const generateMockResults = (): MatchedCandidate[] => {
    return [
      {
        id: '1',
        name: 'Sarah Johnson',
        title: 'Senior Full Stack Developer',
        email: 'sarah.johnson@email.com',
        phone: '+1 (555) 123-4567',
        location: 'San Francisco, CA',
        experience: '7 years',
        skills: ['React', 'TypeScript', 'Node.js', 'AWS', 'Docker', 'PostgreSQL', 'GraphQL'],
        currentCompany: 'Google',
        noticePeriod: '30 Days',
        matchScore: 95.5,
        matchReason: 'Exceptional match with extensive full-stack experience. Strong expertise in React, TypeScript, and cloud technologies. Leadership experience aligns perfectly with senior role requirements.',
        skillMatches: ['React', 'TypeScript', 'Node.js', 'AWS', 'Docker'],
        uploadDate: '2025-11-28',
        education: "Master's in Computer Science - Stanford University",
        certifications: ['AWS Solutions Architect', 'Google Cloud Professional'],
        attachmentCount: 3,
        versions: [
          { id: 'v1', name: 'Sarah_Johnson_Resume_2025.pdf', uploadDate: '2025-11-28', size: '245 KB' },
          { id: 'v2', name: 'Sarah_Johnson_Resume_Oct2025.pdf', uploadDate: '2025-10-15', size: '238 KB' },
          { id: 'v3', name: 'Sarah_Johnson_Resume_2024.pdf', uploadDate: '2024-12-10', size: '220 KB' }
        ]
      },
      {
        id: '2',
        name: 'Michael Chen',
        title: 'Senior Java Developer',
        email: 'michael.chen@email.com',
        phone: '+1 (555) 234-5678',
        location: 'New York, NY',
        experience: '6 years',
        skills: ['Java', 'Spring Boot', 'Microservices', 'AWS', 'Docker', 'Kubernetes', 'MongoDB'],
        currentCompany: 'Microsoft',
        noticePeriod: '60 Days',
        matchScore: 92.3,
        matchReason: 'Excellent Java expertise with strong cloud and containerization skills. Proven track record in building scalable microservices architectures.',
        skillMatches: ['Java', 'Spring Boot', 'AWS', 'Docker', 'Kubernetes'],
        uploadDate: '2025-11-27',
        education: "Bachelor's in Software Engineering - MIT",
        certifications: ['Oracle Certified Professional', 'Kubernetes Administrator'],
        attachmentCount: 2,
        versions: [
          { id: 'v1', name: 'Michael_Chen_Resume.pdf', uploadDate: '2025-11-27', size: '198 KB' },
          { id: 'v2', name: 'Michael_Chen_CV_2024.pdf', uploadDate: '2024-10-20', size: '185 KB' }
        ]
      },
      {
        id: '3',
        name: 'Emily Rodriguez',
        title: 'DevOps Engineer',
        email: 'emily.rodriguez@email.com',
        phone: '+1 (555) 345-6789',
        location: 'Austin, TX',
        experience: '5 years',
        skills: ['AWS', 'Terraform', 'Kubernetes', 'CI/CD', 'Python', 'Jenkins', 'Ansible'],
        currentCompany: 'Netflix',
        noticePeriod: '45 Days',
        matchScore: 88.7,
        matchReason: 'Strong DevOps background with comprehensive AWS and infrastructure automation experience. Excellent fit for cloud-native development practices.',
        skillMatches: ['AWS', 'Kubernetes', 'Python'],
        uploadDate: '2025-11-26',
        education: "Bachelor's in Information Technology",
        certifications: ['AWS DevOps Professional', 'Certified Kubernetes Administrator'],
        attachmentCount: 4,
        versions: [
          { id: 'v1', name: 'Emily_Rodriguez_Resume_Nov2025.pdf', uploadDate: '2025-11-26', size: '215 KB' },
          { id: 'v2', name: 'Emily_Rodriguez_Resume_Aug2025.pdf', uploadDate: '2025-08-15', size: '210 KB' },
          { id: 'v3', name: 'Emily_Rodriguez_Resume_2024.pdf', uploadDate: '2024-11-10', size: '205 KB' },
          { id: 'v4', name: 'Emily_Rodriguez_CV_2023.pdf', uploadDate: '2023-12-01', size: '195 KB' }
        ]
      },
      {
        id: '4',
        name: 'David Kim',
        title: 'Full Stack Developer',
        email: 'david.kim@email.com',
        phone: '+1 (555) 456-7890',
        location: 'Seattle, WA',
        experience: '4 years',
        skills: ['React', 'Node.js', 'TypeScript', 'MongoDB', 'GraphQL', 'AWS', 'Redis'],
        currentCompany: 'Amazon',
        noticePeriod: 'Immediate',
        matchScore: 86.2,
        matchReason: 'Solid full-stack capabilities with modern JavaScript stack. Cloud experience and immediate availability are strong advantages.',
        skillMatches: ['React', 'Node.js', 'TypeScript', 'AWS'],
        uploadDate: '2025-11-25',
        education: "Bachelor's in Computer Science",
        certifications: ['AWS Developer Associate'],
        attachmentCount: 1,
        versions: [
          { id: 'v1', name: 'David_Kim_Resume.pdf', uploadDate: '2025-11-25', size: '178 KB' }
        ]
      },
      {
        id: '5',
        name: 'Jessica Martinez',
        title: 'Frontend Developer',
        email: 'jessica.martinez@email.com',
        phone: '+1 (555) 567-8901',
        location: 'Remote',
        experience: '5 years',
        skills: ['React', 'Vue.js', 'TypeScript', 'CSS', 'Webpack', 'Jest', 'Storybook'],
        currentCompany: 'Meta',
        noticePeriod: '30 Days',
        matchScore: 82.4,
        matchReason: 'Excellent frontend expertise with React and modern tooling. Strong UI/UX focus and remote work experience.',
        skillMatches: ['React', 'TypeScript'],
        uploadDate: '2025-11-24',
        education: "Bachelor's in Web Design & Development",
        certifications: ['React Developer Certification'],
        attachmentCount: 2,
        versions: [
          { id: 'v1', name: 'Jessica_Martinez_Resume_2025.pdf', uploadDate: '2025-11-24', size: '195 KB' },
          { id: 'v2', name: 'Jessica_Martinez_Portfolio_CV.pdf', uploadDate: '2025-09-10', size: '220 KB' }
        ]
      },
      {
        id: '6',
        name: 'Robert Taylor',
        title: 'Backend Developer',
        email: 'robert.taylor@email.com',
        phone: '+1 (555) 678-9012',
        location: 'Boston, MA',
        experience: '6 years',
        skills: ['Python', 'Django', 'PostgreSQL', 'Redis', 'Celery', 'Docker', 'AWS'],
        currentCompany: 'Stripe',
        noticePeriod: '45 Days',
        matchScore: 79.8,
        matchReason: 'Strong backend development skills with Python expertise. Solid database and caching knowledge.',
        skillMatches: ['Python', 'Docker', 'AWS'],
        uploadDate: '2025-11-23',
        education: "Master's in Software Engineering",
        certifications: [],
        attachmentCount: 3,
        versions: [
          { id: 'v1', name: 'Robert_Taylor_Resume_Latest.pdf', uploadDate: '2025-11-23', size: '210 KB' },
          { id: 'v2', name: 'Robert_Taylor_Resume_2025.pdf', uploadDate: '2025-07-05', size: '205 KB' },
          { id: 'v3', name: 'Robert_Taylor_CV_2024.pdf', uploadDate: '2024-11-01', size: '198 KB' }
        ]
      },
      {
        id: '7',
        name: 'Amanda White',
        title: 'Software Engineer',
        email: 'amanda.white@email.com',
        phone: '+1 (555) 789-0123',
        location: 'Chicago, IL',
        experience: '3 years',
        skills: ['JavaScript', 'React', 'Node.js', 'Express', 'MySQL', 'Git'],
        currentCompany: 'Airbnb',
        noticePeriod: '30 Days',
        matchScore: 75.6,
        matchReason: 'Good foundation in full-stack JavaScript development. Growth potential with mentorship.',
        skillMatches: ['React', 'Node.js'],
        uploadDate: '2025-11-22',
        education: "Bachelor's in Computer Science",
        certifications: [],
        attachmentCount: 1,
        versions: [
          { id: 'v1', name: 'Amanda_White_Resume.pdf', uploadDate: '2025-11-22', size: '165 KB' }
        ]
      },
      {
        id: '8',
        name: 'Christopher Lee',
        title: 'Data Engineer',
        email: 'chris.lee@email.com',
        phone: '+1 (555) 890-1234',
        location: 'Denver, CO',
        experience: '5 years',
        skills: ['Python', 'Spark', 'Kafka', 'AWS', 'SQL', 'Airflow', 'Snowflake'],
        currentCompany: 'Uber',
        noticePeriod: '60 Days',
        matchScore: 71.2,
        matchReason: 'Strong data engineering background. Cloud and Python skills align with some requirements.',
        skillMatches: ['Python', 'AWS'],
        uploadDate: '2025-11-21',
        education: "Master's in Data Science",
        certifications: ['AWS Big Data Specialty'],
        attachmentCount: 2,
        versions: [
          { id: 'v1', name: 'Christopher_Lee_Resume_2025.pdf', uploadDate: '2025-11-21', size: '188 KB' },
          { id: 'v2', name: 'Christopher_Lee_CV.pdf', uploadDate: '2025-06-12', size: '182 KB' }
        ]
      }
    ];
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-gray-800 to-gray-800 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Sparkles className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl text-gray-900 mb-2">AI Matching in Progress</h2>
          <p className="text-gray-600">
            Analyzing candidates for: <span className="font-medium text-gray-900">{jobTitle}</span>
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 font-medium">Overall Progress</span>
            <span className="text-sm text-gray-800 font-bold">{progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-gray-800 to-gray-800 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>

        {/* Current Steps */}
        <div className="space-y-3 mb-8">
          {steps.map((step, index) => {
            const stepNumber = index + 1;
            const isComplete = currentStep > stepNumber;
            const isCurrent = currentStep === stepNumber;
            
            return (
              <div 
                key={index}
                className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                  isCurrent ? 'bg-gray-50 border-2 border-gray-300' :
                  isComplete ? 'bg-green-50 border border-green-200' :
                  'bg-gray-50 border border-gray-200'
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isCurrent ? 'bg-gray-800 text-white' :
                  isComplete ? 'bg-green-600 text-white' :
                  'bg-gray-300 text-gray-600'
                }`}>
                  {isComplete ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : isCurrent ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <span className="text-sm font-medium">{stepNumber}</span>
                  )}
                </div>
                <span className={`text-sm font-medium ${
                  isCurrent ? 'text-gray-900' :
                  isComplete ? 'text-green-700' :
                  'text-gray-600'
                }`}>
                  {step}
                </span>
              </div>
            );
          })}
        </div>

        {/* Stats */}
        <div className="bg-gradient-to-br from-gray-50 to-gray-50 border border-gray-200 rounded-xl p-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="text-center">
              <div className="text-sm text-gray-600 mb-1">Candidates Analyzed</div>
              <div className="text-3xl font-bold text-gray-800">{completedCandidates}</div>
              <div className="text-xs text-gray-500 mt-1">of {totalCandidates} total</div>
            </div>
            <div className="text-center">
              <div className="text-sm text-gray-600 mb-1">AI Match Engine</div>
              <div className="flex items-center justify-center gap-2">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-sm font-medium text-green-600">Active</span>
                </div>
              </div>
              <div className="text-xs text-gray-500 mt-1">Computing scores...</div>
            </div>
          </div>
        </div>

        {/* Info Text */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            This process analyzes each candidate's profile, skills, and experience against the job requirements.
            <br />
            Results will be ranked by match score for easy review.
          </p>
        </div>
      </div>
    </div>
  );
}