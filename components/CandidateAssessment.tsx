import { CheckCircle2, Shield, Lock, FileText, Clock, Sparkles, Mic, Video, MessageSquare, Send, AlertCircle, ThumbsUp, Play, Code2, Terminal } from 'lucide-react';
import { useState, useEffect } from 'react';
import { formatISTDate } from '@/lib/utils/dateUtils';

interface AssessmentData {
  id: string;
  title: string;
  companyName: string;
  jobTitle: string;
  duration: number;
  sections: {
    name: string;
    percentage: number;
    estimatedTime: number;
  }[];
}

interface CandidateAssessmentProps {
  assessmentId: string;
  candidateName?: string;
}

interface Question {
  section: string;
  question: string;
  scenario?: string;
  type: 'behavioral' | 'technical' | 'coding';
  programmingLanguage?: 'python' | 'java' | 'c' | 'cpp' | 'php' | 'javascript'; // Auto-detected by AI
}

export default function CandidateAssessment({ assessmentId, candidateName = 'John Doe' }: CandidateAssessmentProps) {
  const [step, setStep] = useState<'consent' | 'ready' | 'assessment' | 'completed'>('consent');
  const [consentChecks, setConsentChecks] = useState({
    terms: false,
    dataUse: false,
    recording: false,
    честность: false
  });
  const [currentSection, setCurrentSection] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answer, setAnswer] = useState('');
  const [codeAnswer, setCodeAnswer] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('python');
  const [timeRemaining, setTimeRemaining] = useState(1800); // 30 minutes in seconds
  const [isRecording, setIsRecording] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const [codeOutput, setCodeOutput] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  // Mock assessment data
  const assessment: AssessmentData = {
    id: assessmentId,
    title: 'Senior Software Engineer Assessment',
    companyName: 'TalentFlow Inc.',
    jobTitle: 'Senior Software Engineer',
    duration: 30,
    sections: [
      { name: 'HR', percentage: 20, estimatedTime: 6 },
      { name: 'Technical', percentage: 70, estimatedTime: 21 },
      { name: 'Coding', percentage: 10, estimatedTime: 3 }
    ]
  };

  // Mock AI questions
  const aiQuestions: Question[] = [
    {
      section: 'HR',
      question: 'Tell me about a time when you had to work with a difficult team member. How did you handle the situation?',
      type: 'behavioral'
    },
    {
      section: 'HR',
      question: 'What motivates you in your work, and how do you stay productive when facing challenging projects?',
      type: 'behavioral'
    },
    {
      section: 'Technical',
      question: 'What is the difference between REST and GraphQL APIs?',
      scenario: 'You are designing an API for a mobile application that needs to fetch user profile data, posts, and comments. The mobile team wants to minimize network requests and only fetch required fields.',
      type: 'technical'
    },
    {
      section: 'Technical',
      question: 'Explain the CAP theorem and its implications in distributed systems.',
      scenario: 'Your company is building a globally distributed e-commerce platform. The product team wants real-time inventory updates, while the infrastructure team is concerned about network partitions.',
      type: 'technical'
    },
    {
      section: 'Coding',
      question: 'Write a function to find the longest palindromic substring in a given string.',
      scenario: 'Given a string s, return the longest palindromic substring in s.\n\nExample 1:\nInput: s = "babad"\nOutput: "bab" or "aba"\n\nExample 2:\nInput: s = "cbbd"\nOutput: "bb"\n\nConstraints:\n• 1 <= s.length <= 1000\n• s consist of only digits and English letters',
      type: 'coding',
      programmingLanguage: 'python' // AI-detected language - Auto-loads Python compiler
    }
  ];

  const currentQ = aiQuestions[currentQuestion] || aiQuestions[0];

  // Auto-load compiler based on AI-detected programming language
  useEffect(() => {
    if (currentQ.type === 'coding' && currentQ.programmingLanguage) {
      setSelectedLanguage(currentQ.programmingLanguage);
      setCodeAnswer(''); // Reset code when switching questions
    }
  }, [currentQuestion, currentQ.type, currentQ.programmingLanguage]);

  // Timer countdown
  useEffect(() => {
    if (step === 'assessment' && timeRemaining > 0) {
      const timer = setInterval(() => {
        setTimeRemaining(prev => prev - 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [step, timeRemaining]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const allConsentsGiven = Object.values(consentChecks).every(v => v);

  const handleStartAssessment = () => {
    setStep('ready');
  };

  const handleBeginAssessment = () => {
    setStep('assessment');
    setIsRecording(true);
  };

  const handleSubmitAnswer = () => {
    const currentQType = aiQuestions[currentQuestion]?.type;
    
    // Check if answer is provided based on question type
    if (currentQType === 'coding') {
      if (!codeAnswer.trim()) return;
    } else {
      if (!answer.trim()) return;
    }
    
    setAiTyping(true);
    setAnswer('');
    setCodeAnswer('');
    
    // Simulate AI processing
    setTimeout(() => {
      setAiTyping(false);
      if (currentQuestion < aiQuestions.length - 1) {
        setCurrentQuestion(prev => prev + 1);
      } else {
        handleCompleteAssessment();
      }
    }, 2000);
  };

  const handleCompleteAssessment = () => {
    setIsRecording(false);
    setStep('completed');
  };

  // Handle Run Code functionality
  const handleRunCode = () => {
    if (!codeAnswer.trim()) return;
    
    setIsRunning(true);
    setCodeOutput('');
    
    // Simulate code execution (in production, this would call a backend API)
    setTimeout(() => {
      // Mock output based on language
      const mockOutputs: Record<string, string> = {
        python: `>>> Running Python code...\\n\\nOutput:\\n\"bab\"\\n\\nExecution completed successfully!\\nTime: 0.042s | Memory: 2.1MB`,
        java: `Compiling Java code...\\nRunning...\\n\\nOutput:\\n\"bab\"\\n\\nBuild successful\\nTime: 0.156s | Memory: 3.8MB`,
        javascript: `>>> Node.js v18.0.0\\n\\nOutput:\\n\"bab\"\\n\\nExecution completed\\nTime: 0.038s | Memory: 1.9MB`,
        cpp: `Compiling C++ code...\\n\\nOutput:\\n\"bab\"\\n\\nCompilation successful\\nTime: 0.092s | Memory: 2.4MB`,
        c: `Compiling C code...\\n\\nOutput:\\n\"bab\"\\n\\nCompilation successful\\nTime: 0.084s | Memory: 1.8MB`,
        php: `PHP 8.1.0\\n\\nOutput:\\nstring(3) \"bab\"\\n\\nExecution completed\\nTime: 0.051s | Memory: 2.2MB`
      };
      
      setCodeOutput(mockOutputs[selectedLanguage] || mockOutputs.python);
      setIsRunning(false);
      setHasRun(true);
    }, 1500);
  };

  // Consent Screen
  if (step === 'consent') {
    return (
      <div className="min-h-[100dvh] max-h-[100dvh] overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-50 flex items-center justify-center p-6">
        <div className="max-w-3xl w-full bg-white rounded-2xl shadow-xl border border-gray-200 my-6">
          {/* Header */}
          <div className="bg-gradient-to-r from-gray-800 to-gray-800 text-white p-8 rounded-t-2xl">
            <div className="flex items-center gap-3 mb-4">
              <Shield className="w-10 h-10" />
              <div>
                <h1 className="text-2xl">Assessment Consent & Terms</h1>
                <p className="text-gray-100 text-sm">Please review and accept before proceeding</p>
              </div>
            </div>
          </div>

          <div className="p-6">
            {/* Candidate Info */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
              <div className="text-sm text-gray-800 mb-2">Assessment Details</div>
              <div className="text-gray-900 mb-1">{assessment.title}</div>
              <div className="text-sm text-gray-600">
                {assessment.jobTitle} • {assessment.companyName} • {assessment.duration} minutes
              </div>
            </div>

            {/* Consent Items */}
            <div className="space-y-3 mb-6">
              <div className="border border-gray-200 rounded-lg p-3 hover:border-gray-300 transition-colors">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consentChecks.terms}
                    onChange={(e) => setConsentChecks({ ...consentChecks, terms: e.target.checked })}
                    className="w-5 h-5 text-gray-800 rounded mt-1 cursor-pointer flex-shrink-0"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className="w-4 h-4 text-gray-800" />
                      <span className="text-sm text-gray-900">Terms & Conditions</span>
                    </div>
                    <p className="text-xs text-gray-600">
                      I agree to the assessment terms and conditions. I understand this is a formal evaluation and my responses will be recorded and reviewed by {assessment.companyName}.
                    </p>
                  </div>
                </label>
              </div>

              <div className="border border-gray-200 rounded-lg p-3 hover:border-gray-300 transition-colors">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consentChecks.dataUse}
                    onChange={(e) => setConsentChecks({ ...consentChecks, dataUse: e.target.checked })}
                    className="w-5 h-5 text-gray-800 rounded mt-1 cursor-pointer flex-shrink-0"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Lock className="w-4 h-4 text-gray-800" />
                      <span className="text-sm text-gray-900">Data Use & Privacy</span>
                    </div>
                    <p className="text-xs text-gray-600">
                      I consent to {assessment.companyName} collecting, processing, and storing my assessment data including responses, performance metrics, and AI analysis results for recruitment purposes. Data will be handled in accordance with GDPR and data protection laws.
                    </p>
                  </div>
                </label>
              </div>

              <div className="border border-gray-200 rounded-lg p-3 hover:border-gray-300 transition-colors">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consentChecks.recording}
                    onChange={(e) => setConsentChecks({ ...consentChecks, recording: e.target.checked })}
                    className="w-5 h-5 text-gray-800 rounded mt-1 cursor-pointer flex-shrink-0"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Video className="w-4 h-4 text-success" />
                      <span className="text-sm text-gray-900">AI Interview Recording</span>
                    </div>
                    <p className="text-xs text-gray-600">
                      I understand this assessment uses AI-powered interview technology. My text responses will be analyzed by AI and reviewed by human recruiters. No video/audio recording, only text-based interactions.
                    </p>
                  </div>
                </label>
              </div>

              <div className="border border-gray-200 rounded-lg p-3 hover:border-gray-300 transition-colors">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consentChecks.честность}
                    onChange={(e) => setConsentChecks({ ...consentChecks, честность: e.target.checked })}
                    className="w-5 h-5 text-gray-800 rounded mt-1 cursor-pointer flex-shrink-0"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle2 className="w-4 h-4 text-gray-800" />
                      <span className="text-sm text-gray-900">Honesty & Integrity</span>
                    </div>
                    <p className="text-xs text-gray-600">
                      I commit to completing this assessment independently without external assistance. I understand that dishonest practices may result in disqualification from the recruitment process.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Warning */}
            <div className="bg-warning-subtle border border-warning-line rounded-lg p-3 mb-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                <div className="text-xs text-warning-strong">
                  <p className="mb-1">⚠️ Important Notes:</p>
                  <ul className="space-y-0.5 ml-3 list-disc">
                    <li>Once started, the assessment must be completed in one session</li>
                    <li>The timer will start immediately upon beginning</li>
                    <li>You cannot pause or restart the assessment</li>
                    <li>Ensure stable internet connection before starting</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4">
              <button
                onClick={handleStartAssessment}
                disabled={!allConsentsGiven}
                className="flex-1 bg-gray-800 text-white px-6 py-3 rounded-lg hover:bg-gray-900 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-5 h-5" />
                I Accept - Continue to Assessment
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Ready Screen
  if (step === 'ready') {
    return (
      <div className="min-h-[100dvh] max-h-[100dvh] overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-50 flex items-center justify-center p-6">
        <div className="max-w-4xl w-full bg-white rounded-2xl shadow-xl border border-gray-200 my-6">
          {/* Header */}
          <div className="bg-gradient-to-r from-green-600 to-gray-800 text-white p-6 rounded-t-2xl">
            <div className="flex items-center gap-3">
              <Sparkles className="w-8 h-8" />
              <div>
                <h1 className="text-xl">Ready to Begin!</h1>
                <p className="text-success text-sm">You're all set for your AI-powered interview</p>
              </div>
            </div>
          </div>

          <div className="p-6">
            {/* Welcome Message */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
              <h3 className="text-base text-gray-900 mb-1">Welcome, {candidateName}!</h3>
              <p className="text-sm text-gray-700">
                You're about to begin your assessment for <strong>{assessment.jobTitle}</strong> at {assessment.companyName}. 
                This AI-powered interview will adapt to your responses and ask relevant follow-up questions.
              </p>
            </div>

            {/* Assessment Overview */}
            <div className="mb-4">
              <h3 className="text-base text-gray-900 mb-3">Assessment Overview</h3>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <Clock className="w-5 h-5 text-gray-800 mb-1" />
                  <div className="text-xl text-gray-900">{assessment.duration} min</div>
                  <div className="text-xs text-gray-600">Total Duration</div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <MessageSquare className="w-5 h-5 text-gray-800 mb-1" />
                  <div className="text-xl text-gray-900">{assessment.sections.length}</div>
                  <div className="text-xs text-gray-600">Sections</div>
                </div>
                <div className="p-3 bg-success-subtle rounded-lg border border-success-line">
                  <Sparkles className="w-5 h-5 text-success mb-1" />
                  <div className="text-xl text-gray-900">AI-Driven</div>
                  <div className="text-xs text-gray-600">Interview Type</div>
                </div>
              </div>

              {/* Sections */}
              <div className="space-y-2">
                {assessment.sections.map((section, idx) => (
                  <div key={idx} className="p-3 border border-gray-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm text-gray-900">{section.name} Section</div>
                        <div className="text-xs text-gray-600">~{section.estimatedTime} minutes</div>
                      </div>
                      <div className="text-lg text-gray-800">{section.percentage}%</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-gradient-to-r from-gray-50 to-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
              <h4 className="text-sm text-gray-900 mb-2">How It Works</h4>
              <div className="space-y-1 text-xs text-gray-700">
                <p>✓ The AI will ask you questions one at a time</p>
                <p>✓ Type your answers in the text field provided</p>
                <p>✓ The AI may ask follow-up questions based on your responses</p>
                <p>✓ Answer thoughtfully and thoroughly for best results</p>
                <p>✓ Watch the timer - manage your time wisely across all sections</p>
              </div>
            </div>

            {/* Start Button */}
            <button
              onClick={handleBeginAssessment}
              className="w-full bg-success text-white px-6 py-3 rounded-lg hover:bg-success transition-colors shadow-lg shadow-green-500/25 flex items-center justify-center gap-2"
            >
              <Play className="w-5 h-5" />
              Begin Assessment
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Assessment In Progress
  if (step === 'assessment') {
    const progress = ((currentQuestion + 1) / aiQuestions.length) * 100;

    return (
      <div className="h-[100dvh] bg-gray-50 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-gray-800" />
                <span className="text-gray-900">Assessment</span>
              </div>
              <div className="px-3 py-1 bg-gray-100 text-gray-900 rounded-full text-sm">
                Question {currentQuestion + 1} of {aiQuestions.length}
              </div>
            </div>
            <div className="flex items-center gap-6">
              {isRecording && (
                <div className="flex items-center gap-2 text-destructive">
                  <div className="w-3 h-3 bg-destructive rounded-full animate-pulse"></div>
                  <span className="text-sm">Recording</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-gray-600" />
                <span className={`text-lg ${timeRemaining < 300 ? 'text-destructive' : 'text-gray-900'}`}>
                  {formatTime(timeRemaining)}
                </span>
              </div>
            </div>
          </div>
          {/* Progress Bar */}
          <div className="max-w-5xl mx-auto mt-3">
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-gray-800 to-gray-800 transition-all duration-500"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden">
          <div className="h-full flex flex-col">
            {/* Current Section - Only for non-coding questions */}
            {currentQ.type !== 'coding' && (
              <div className="px-6 pt-6 pb-4">
                <div className="max-w-5xl mx-auto">
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-900 rounded-full">
                    <span className="text-sm">{currentQ.section} Section</span>
                  </div>
                </div>
              </div>
            )}

            {/* AI Question - Only for Behavioral & Technical questions */}
            {currentQ.type !== 'coding' && (
              <div className="px-6 pb-6">
                <div className="max-w-5xl mx-auto">
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-700 to-gray-500 flex items-center justify-center flex-shrink-0">
                        <Sparkles className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm text-gray-800 mb-2">AI Interviewer</div>
                        <p className="text-base text-gray-900 leading-relaxed mb-3">{currentQ.question}</p>
                        
                        {/* Scenario for Technical Questions */}
                        {currentQ.type === 'technical' && currentQ.scenario && (
                          <div className="mt-4 p-4 bg-gradient-to-r from-gray-50 to-gray-50 border border-gray-200 rounded-lg">
                            <div className="flex items-start gap-2 mb-2">
                              <FileText className="w-4 h-4 text-gray-800 mt-0.5 flex-shrink-0" />
                              <span className="text-sm text-gray-800">Scenario:</span>
                            </div>
                            <p className="text-sm text-gray-700 whitespace-pre-line ml-6">{currentQ.scenario}</p>
                          </div>
                        )}
                        
                        <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">
                          {currentQ.type === 'behavioral' && '💭 Behavioral'}
                          {currentQ.type === 'technical' && '🔧 Technical'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* AI Typing Indicator */}
            {aiTyping && (
              <div className="px-6 pb-6">
                <div className="max-w-5xl mx-auto">
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 mb-6">
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-gray-800 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-800 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        <div className="w-2 h-2 bg-gray-800 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                      </div>
                      <span className="text-sm text-gray-900">AI is processing your response...</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Answer Input */}
            {!aiTyping && (
              <div className={currentQ.type === 'coding' ? 'flex-1 px-6 pb-6' : 'px-6 pb-6'}>
                <div className={currentQ.type === 'coding' ? 'h-full' : 'max-w-5xl mx-auto'}>
                  {/* For Coding Questions - Show Code Editor */}
                  {currentQ.type === 'coding' ? (
                    <>
                      {/* SPLIT VIEW LAYOUT FOR CODING QUESTIONS - Centered & Elegant */}
                      <div className="h-full flex items-center justify-center">
                        <div className="w-full max-w-6xl mx-auto flex flex-col" style={{ height: 'calc(100vh - 240px)' }}>
                          {/* Top Section: Split View - Question (Left) + Code Editor (Right) */}
                          <div className="flex-1 flex gap-6 min-h-0 mb-4">
                            {/* LEFT SIDE: Question & Scenario */}
                            <div className="w-1/2 flex flex-col rounded-xl shadow-lg overflow-hidden border border-gray-200 bg-white">
                              <div className="bg-gradient-to-r from-gray-800 to-gray-800 text-white px-5 py-3.5 flex items-center gap-3">
                                <FileText className="w-5 h-5" />
                                <span className="font-medium">Problem Statement</span>
                              </div>
                              <div className="flex-1 overflow-y-auto p-6 bg-gradient-to-br from-gray-50 to-white">
                                <h3 className="text-xl text-gray-900 mb-4 leading-relaxed">{currentQ.question}</h3>
                                
                                {currentQ.scenario && (
                                  <div className="mt-4 p-5 bg-white border border-gray-200 rounded-xl shadow-sm">
                                    <div className="flex items-center gap-2 mb-3">
                                      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                                        <FileText className="w-4 h-4 text-gray-800" />
                                      </div>
                                      <span className="text-sm font-semibold text-gray-800">Problem Description</span>
                                    </div>
                                    <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{currentQ.scenario}</p>
                                  </div>
                                )}
                                
                                {/* AI-Detected Language Info */}
                                <div className="mt-6 flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-gray-100 to-gray-100 border border-gray-300 rounded-lg shadow-sm">
                                  <Sparkles className="w-4 h-4 text-gray-800" />
                                  <span className="text-sm text-gray-700">Detected Language:</span>
                                  <span className="text-sm font-bold text-gray-900 uppercase">
                                    {currentQ.programmingLanguage || 'python'}
                                  </span>
                                  <Terminal className="w-4 h-4 text-gray-800 ml-auto" />
                                </div>
                              </div>
                            </div>

                            {/* RIGHT SIDE: Code Editor (Compiler) */}
                            <div className="w-1/2 flex flex-col rounded-xl shadow-lg overflow-hidden border border-gray-200">
                              {/* Editor Header */}
                              <div className="bg-gray-900 px-5 py-3 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Code2 className="w-4 h-4 text-green-400" />
                                  <span className="text-sm text-gray-400 uppercase font-medium">{selectedLanguage}</span>
                                </div>
                              </div>
                              
                              {/* Code Textarea */}
                              <textarea
                                value={codeAnswer}
                                onChange={(e) => setCodeAnswer(e.target.value)}
                                placeholder={`# Write your ${selectedLanguage} solution here\n\ndef solution(s):\n    # Your implementation\n    pass`}
                                className="flex-1 px-5 py-4 bg-gray-900 text-green-400 font-mono text-base focus:outline-none resize-none leading-relaxed"
                                spellCheck={false}
                              />
                              
                              {/* Editor Footer with Stats */}
                              <div className="bg-gray-800 px-5 py-2.5 border-t border-gray-700 flex items-center justify-between">
                                <div className="text-xs text-gray-400 flex items-center gap-4">
                                  <span>{codeAnswer.split('\n').length} lines</span>
                                  <span>•</span>
                                  <span>{codeAnswer.length} chars</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                  <span className="text-xs text-gray-400">Ready</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* BOTTOM SECTION: Output Console - Reduced Height */}
                          <div className="rounded-xl overflow-hidden bg-white shadow-lg border border-gray-200" style={{ height: '140px' }}>
                            <div className="bg-gray-900 px-5 py-2.5 flex items-center gap-2">
                              <Terminal className="w-4 h-4 text-green-400" />
                              <span className="text-sm text-gray-300 font-medium">Output</span>
                            </div>
                            <div className="h-[calc(100%-40px)] overflow-y-auto bg-gray-50 p-4">
                              {!hasRun ? (
                                <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                                  <div className="text-center">
                                    <Terminal className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                                    <p>Run your code to see output</p>
                                  </div>
                                </div>
                              ) : isRunning ? (
                                <div className="flex items-center gap-2 text-gray-600">
                                  <div className="flex gap-1">
                                    <div className="w-2 h-2 bg-gray-800 rounded-full animate-bounce"></div>
                                    <div className="w-2 h-2 bg-gray-800 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                                    <div className="w-2 h-2 bg-gray-800 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                                  </div>
                                  <span className="text-sm">Executing...</span>
                                </div>
                              ) : (
                                <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono leading-relaxed">{codeOutput}</pre>
                              )}
                            </div>
                          </div>

                          {/* FIXED ACTION BUTTONS - Simplified & Elegant */}
                          <div className="mt-5 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                              <span>Compiler ready</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <button
                                onClick={handleRunCode}
                                disabled={!codeAnswer.trim() || isRunning}
                                className="flex items-center gap-2.5 bg-success text-white px-10 py-3.5 rounded-xl hover:bg-success transition-all disabled:bg-gray-300 disabled:cursor-not-allowed shadow-lg hover:shadow-xl font-medium text-base"
                              >
                                <Play className="w-5 h-5" />
                                {isRunning ? 'Running...' : 'Run Code'}
                              </button>
                              <button
                                onClick={handleSubmitAnswer}
                                disabled={!codeAnswer.trim()}
                                className="flex items-center gap-2.5 bg-gray-800 text-white px-10 py-3.5 rounded-xl hover:bg-gray-900 transition-all disabled:bg-gray-300 disabled:cursor-not-allowed shadow-lg hover:shadow-xl font-medium text-base"
                              >
                                <Send className="w-5 h-5" />
                                Submit
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    /* For Behavioral & Technical Questions - Show Text Area */
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                      <label className="block text-gray-900 mb-3">Your Answer</label>
                      <textarea
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        placeholder="Type your answer here... Be specific and provide examples where possible."
                        className="w-full h-48 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent resize-none text-gray-900"
                      />
                      <div className="flex items-center justify-between mt-4">
                        <div className="text-sm text-gray-500">
                          {answer.length} characters
                        </div>
                        <button
                          onClick={handleSubmitAnswer}
                          disabled={!answer.trim()}
                          className="flex items-center gap-2 bg-gray-800 text-white px-6 py-3 rounded-lg hover:bg-gray-900 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed shadow-lg shadow-blue-500/25"
                        >
                          <Send className="w-5 h-5" />
                          Submit Answer
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Completed Screen
  if (step === 'completed') {
    return (
      <div className="min-h-[100dvh] max-h-[100dvh] overflow-y-auto bg-gradient-to-br from-green-50 via-white to-gray-50 flex items-center justify-center p-6">
        <div className="max-w-3xl w-full bg-white rounded-2xl shadow-xl border border-gray-200 my-6">
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-success-subtle rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-10 h-10 text-success" />
            </div>
            <h1 className="text-2xl text-gray-900 mb-3">Assessment Completed!</h1>
            <p className="text-base text-gray-600 mb-6">
              Thank you for completing the {assessment.title}. Your responses have been recorded and submitted successfully.
            </p>

            {/* Results Info */}
            <div className="bg-gradient-to-r from-gray-50 to-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
              <h3 className="text-base text-gray-900 mb-3">What Happens Next?</h3>
              <div className="text-left space-y-2 text-gray-700">
                <div className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full bg-gray-800 text-white flex items-center justify-center flex-shrink-0 text-xs">1</div>
                  <p className="text-xs">Your assessment results are being analyzed by our AI system</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full bg-gray-800 text-white flex items-center justify-center flex-shrink-0 text-xs">2</div>
                  <p className="text-xs">Our recruitment team will review your performance and responses</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full bg-gray-800 text-white flex items-center justify-center flex-shrink-0 text-xs">3</div>
                  <p className="text-xs">You'll receive an email update within 3-5 business days</p>
                </div>
              </div>
            </div>

            {/* Thank You Message */}
            <div className="bg-success-subtle border border-success-line rounded-lg p-4 mb-6">
              <div className="flex items-center justify-center gap-2 text-success mb-1">
                <ThumbsUp className="w-4 h-4" />
                <span className="text-sm">Thank You!</span>
              </div>
              <p className="text-xs text-success-strong">
                We appreciate the time and effort you put into this assessment. Good luck with your application!
              </p>
            </div>

            {/* Assessment Summary */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="text-gray-500 text-xs mb-1">Questions</div>
                <div className="text-xl text-gray-900">{aiQuestions.length}</div>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="text-gray-500 text-xs mb-1">Duration</div>
                <div className="text-xl text-gray-900">{assessment.duration}m</div>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="text-gray-500 text-xs mb-1">Status</div>
                <div className="text-xl text-gray-900">✓</div>
              </div>
            </div>

            <div className="text-xs text-gray-500">
              Assessment ID: {assessmentId} • Submitted on {formatISTDate(new Date().toISOString())}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}