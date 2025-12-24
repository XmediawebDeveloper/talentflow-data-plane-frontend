import { ArrowLeft, Star, TrendingUp, TrendingDown, Minus, CheckCircle2, XCircle, AlertTriangle, Sparkles, Mail, Phone, MapPin, Briefcase, GraduationCap, Award, Download, FileText, Target, Brain, Code, Users } from 'lucide-react';
import { useState } from 'react';

interface Applicant {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  score: number;
  status: string;
  appliedDate: string;
  experience: string;
  education: string;
  skills: string[];
  matchStatus?: 'exact' | 'partial' | 'low';
}

interface ResumeAnalysisProps {
  applicant: Applicant;
  jobTitle: string;
  onBack: () => void;
}

interface ScoringCategory {
  category: string;
  score: number;
  maxScore: number;
  weight: number;
  icon: any;
  color: string;
  details: {
    criterion: string;
    score: number;
    maxScore: number;
    explanation: string;
    status: 'pass' | 'partial' | 'fail';
  }[];
}

export default function ResumeAnalysis({ applicant, jobTitle, onBack }: ResumeAnalysisProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'detailed' | 'resume'>('overview');

  // Generate detailed scoring breakdown
  const scoringCategories: ScoringCategory[] = [
    {
      category: 'Skills Match',
      score: 38,
      maxScore: 40,
      weight: 40,
      icon: Code,
      color: 'blue',
      details: [
        {
          criterion: 'Required Technical Skills',
          score: 18,
          maxScore: 20,
          explanation: 'Candidate has 9 out of 10 required technical skills. Missing: Kubernetes.',
          status: 'pass'
        },
        {
          criterion: 'Preferred Skills',
          score: 12,
          maxScore: 15,
          explanation: 'Possesses 4 out of 6 preferred skills including AWS, Docker, CI/CD, and GraphQL.',
          status: 'partial'
        },
        {
          criterion: 'Skill Proficiency Level',
          score: 8,
          maxScore: 5,
          explanation: 'Skills demonstrated at advanced level with 5+ years of hands-on experience.',
          status: 'pass'
        }
      ]
    },
    {
      category: 'Experience',
      score: 22,
      maxScore: 25,
      weight: 25,
      icon: Briefcase,
      color: 'purple',
      details: [
        {
          criterion: 'Years of Experience',
          score: 10,
          maxScore: 10,
          explanation: '6 years of professional experience matches the 5+ years requirement perfectly.',
          status: 'pass'
        },
        {
          criterion: 'Relevant Industry',
          score: 7,
          maxScore: 10,
          explanation: '4 years in SaaS industry, 2 years in related e-commerce sector.',
          status: 'partial'
        },
        {
          criterion: 'Role Similarity',
          score: 5,
          maxScore: 5,
          explanation: 'Previous roles align closely with the position requirements.',
          status: 'pass'
        }
      ]
    },
    {
      category: 'Education',
      score: 13,
      maxScore: 15,
      weight: 15,
      icon: GraduationCap,
      color: 'green',
      details: [
        {
          criterion: 'Degree Level',
          score: 8,
          maxScore: 10,
          explanation: 'Master\'s degree in Computer Science exceeds the Bachelor\'s requirement.',
          status: 'pass'
        },
        {
          criterion: 'Field of Study',
          score: 5,
          maxScore: 5,
          explanation: 'Computer Science directly aligns with the job requirements.',
          status: 'pass'
        }
      ]
    },
    {
      category: 'Cultural Fit',
      score: 16,
      maxScore: 20,
      weight: 20,
      icon: Users,
      details: [
        {
          criterion: 'Team Collaboration',
          score: 6,
          maxScore: 7,
          explanation: 'Strong evidence of collaborative work from previous roles and recommendations.',
          status: 'pass'
        },
        {
          criterion: 'Communication Skills',
          score: 5,
          maxScore: 7,
          explanation: 'Good written communication demonstrated. Verbal assessment pending.',
          status: 'partial'
        },
        {
          criterion: 'Leadership Potential',
          score: 5,
          maxScore: 6,
          explanation: 'Led 2 projects with teams of 4-5 members successfully.',
          status: 'pass'
        }
      ]
    }
  ];

  const totalScore = applicant.score;
  const maxTotalScore = 100;

  const getMatchStatus = (score: number): { label: string; color: string; bg: string; icon: any } => {
    if (score >= 85) {
      return { 
        label: 'Exact Match', 
        color: 'text-green-700', 
        bg: 'bg-green-100 border-green-300',
        icon: CheckCircle2
      };
    } else if (score >= 70) {
      return { 
        label: 'Partial Match', 
        color: 'text-gray-900', 
        bg: 'bg-gray-100 border-gray-300',
        icon: AlertTriangle
      };
    } else {
      return { 
        label: 'Low Match', 
        color: 'text-yellow-700', 
        bg: 'bg-yellow-100 border-yellow-300',
        icon: XCircle
      };
    }
  };

  const matchStatus = getMatchStatus(totalScore);
  const MatchIcon = matchStatus.icon;

  const getStatusIcon = (status: 'pass' | 'partial' | 'fail') => {
    switch (status) {
      case 'pass':
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'partial':
        return <Minus className="w-4 h-4 text-yellow-600" />;
      case 'fail':
        return <XCircle className="w-4 h-4 text-red-600" />;
    }
  };

  const strengths = [
    'Strong technical skills in required technologies (React, TypeScript, Node.js)',
    'Excellent educational background with Master\'s in Computer Science',
    'Proven leadership experience managing cross-functional teams',
    'Relevant industry experience in SaaS platforms',
    'Advanced proficiency demonstrated in core competencies'
  ];

  const improvements = [
    'Limited experience with Kubernetes (required skill)',
    'Could benefit from more public speaking/presentation experience',
    'Geographic relocation may be required for on-site work'
  ];

  const recommendations = [
    {
      type: 'Shortlist',
      description: 'Candidate meets 92% of job requirements. Recommended for technical interview.',
      priority: 'high',
      icon: CheckCircle2,
      color: 'green'
    },
    {
      type: 'Technical Assessment',
      description: 'Suggest coding assessment focusing on React and system design.',
      priority: 'medium',
      icon: Code,
      color: 'blue'
    },
    {
      type: 'Skill Gap Training',
      description: 'Kubernetes training could make this candidate a perfect fit.',
      priority: 'low',
      icon: TrendingUp,
      color: 'purple'
    }
  ];

  return (
    <main className="flex-1 p-8 overflow-y-auto bg-gray-50">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Applicants
        </button>

        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <h1 className="text-gray-900">{applicant.name}</h1>
              <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border ${matchStatus.bg} ${matchStatus.color}`}>
                <MatchIcon className="w-4 h-4" />
                {matchStatus.label}
              </div>
              <span className="px-3 py-1 bg-gray-100 text-gray-900 rounded-full text-xs flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                AI Analyzed
              </span>
            </div>
            <p className="text-gray-600 mb-4">
              Applied for: <span className="text-gray-800">{jobTitle}</span> • {applicant.appliedDate}
            </p>
            
            {/* Contact Info */}
            <div className="flex items-center gap-6 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-gray-400" />
                <span>{applicant.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-gray-400" />
                <span>{applicant.phone}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-gray-400" />
                <span>{applicant.location}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
              <Download className="w-4 h-4" />
              Download Resume
            </button>
            <button className="flex items-center gap-2 bg-green-600 text-white px-6 py-2.5 rounded-lg hover:bg-green-700 transition-colors shadow-lg shadow-green-500/25">
              <CheckCircle2 className="w-5 h-5" />
              Shortlist Candidate
            </button>
          </div>
        </div>
      </div>

      {/* Overall Score Card */}
      <div className="bg-gradient-to-br from-gray-800 to-gray-800 rounded-xl shadow-lg p-8 mb-8 text-white">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <Star className="w-8 h-8" />
              <h2 className="text-white text-2xl">Overall Match Score</h2>
            </div>
            <p className="text-gray-100 mb-6">
              AI-powered analysis based on job requirements and candidate profile
            </p>
            <div className="grid grid-cols-4 gap-4">
              {scoringCategories.map((cat, idx) => {
                const Icon = cat.icon;
                return (
                  <div key={idx} className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="w-4 h-4" />
                      <span className="text-sm text-white/90">{cat.category}</span>
                    </div>
                    <div className="text-2xl mb-1">{cat.score}/{cat.maxScore}</div>
                    <div className="text-xs text-gray-100">{cat.weight}% weight</div>
                  </div>
                );
              })}
            </div>
          </div>
          
          <div className="text-center px-8 border-l border-white/20">
            <div className="mb-4">
              <div className="text-7xl mb-2">{totalScore}</div>
              <div className="text-xl text-gray-100">out of {maxTotalScore}</div>
            </div>
            <div className="w-32 h-32 mx-auto relative">
              <svg className="transform -rotate-90 w-32 h-32">
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="12"
                  fill="none"
                />
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke="white"
                  strokeWidth="12"
                  fill="none"
                  strokeDasharray={`${(totalScore / maxTotalScore) * 352} 352`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-3xl">{Math.round((totalScore / maxTotalScore) * 100)}%</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
        <div className="border-b border-gray-200 px-6">
          <div className="flex gap-6">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-4 text-sm border-b-2 transition-colors ${
                activeTab === 'overview'
                  ? 'border-gray-800 text-gray-800'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Score Overview
            </button>
            <button
              onClick={() => setActiveTab('detailed')}
              className={`py-4 text-sm border-b-2 transition-colors ${
                activeTab === 'detailed'
                  ? 'border-gray-800 text-gray-800'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Detailed Analysis
            </button>
            <button
              onClick={() => setActiveTab('resume')}
              className={`py-4 text-sm border-b-2 transition-colors ${
                activeTab === 'resume'
                  ? 'border-gray-800 text-gray-800'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Resume Content
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Scoring Table */}
              <div>
                <h3 className="text-gray-900 mb-4">Scoring Breakdown</h3>
                <div className="space-y-3">
                  {scoringCategories.map((category, idx) => {
                    const Icon = category.icon;
                    const percentage = (category.score / category.maxScore) * 100;
                    
                    return (
                      <div key={idx} className="p-5 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 bg-${category.color}-50 rounded-lg`}>
                              <Icon className={`w-5 h-5 text-${category.color}-600`} />
                            </div>
                            <div>
                              <div className="text-gray-900">{category.category}</div>
                              <div className="text-sm text-gray-500">Weight: {category.weight}%</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl text-gray-900">{category.score}/{category.maxScore}</div>
                            <div className="text-sm text-gray-500">{Math.round(percentage)}%</div>
                          </div>
                        </div>
                        
                        <div className="relative w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`absolute top-0 left-0 h-full bg-${category.color}-600 rounded-full transition-all`}
                            style={{ width: `${percentage}%` }}
                          ></div>
                        </div>

                        <div className="mt-3 text-sm text-gray-600">
                          {category.details.length} criteria evaluated
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* AI Recommendations */}
              <div className="bg-gradient-to-r from-gray-50 to-gray-50 border border-gray-200 rounded-lg p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Sparkles className="w-6 h-6 text-gray-800" />
                  <h3 className="text-gray-900">AI Recommendations</h3>
                </div>
                <div className="space-y-3">
                  {recommendations.map((rec, idx) => {
                    const RecIcon = rec.icon;
                    return (
                      <div key={idx} className="flex items-start gap-3 p-4 bg-white rounded-lg border border-gray-100">
                        <div className={`p-2 bg-${rec.color}-50 rounded-lg flex-shrink-0`}>
                          <RecIcon className={`w-5 h-5 text-${rec.color}-600`} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-gray-900">{rec.type}</span>
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              rec.priority === 'high' ? 'bg-red-100 text-red-700' :
                              rec.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {rec.priority} priority
                            </span>
                          </div>
                          <p className="text-sm text-gray-600">{rec.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'detailed' && (
            <div className="space-y-6">
              {scoringCategories.map((category, catIdx) => {
                const Icon = category.icon;
                return (
                  <div key={catIdx} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className={`p-5 bg-${category.color}-50 border-b border-gray-200`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Icon className={`w-6 h-6 text-${category.color}-600`} />
                          <div>
                            <h3 className="text-gray-900">{category.category}</h3>
                            <p className="text-sm text-gray-600">
                              {category.details.length} criteria • {category.weight}% weight
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-3xl text-gray-900">{category.score}/{category.maxScore}</div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-5 space-y-4">
                      {category.details.map((detail, detailIdx) => (
                        <div key={detailIdx} className="pb-4 border-b border-gray-100 last:border-0 last:pb-0">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-start gap-2 flex-1">
                              {getStatusIcon(detail.status)}
                              <div className="flex-1">
                                <div className="text-gray-900 mb-1">{detail.criterion}</div>
                                <p className="text-sm text-gray-600">{detail.explanation}</p>
                              </div>
                            </div>
                            <div className="text-right ml-4">
                              <div className="text-lg text-gray-900">{detail.score}/{detail.maxScore}</div>
                              <div className="text-xs text-gray-500">
                                {Math.round((detail.score / detail.maxScore) * 100)}%
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Strengths & Areas for Improvement */}
              <div className="grid grid-cols-2 gap-6">
                <div className="border border-green-200 rounded-lg p-6 bg-green-50">
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                    <h3 className="text-gray-900">Key Strengths</h3>
                  </div>
                  <ul className="space-y-3">
                    {strengths.map((strength, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                        <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                        <span>{strength}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="border border-yellow-200 rounded-lg p-6 bg-yellow-50">
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingDown className="w-5 h-5 text-yellow-600" />
                    <h3 className="text-gray-900">Areas for Improvement</h3>
                  </div>
                  <ul className="space-y-3">
                    {improvements.map((improvement, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                        <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                        <span>{improvement}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'resume' && (
            <div className="space-y-6">
              {/* Resume Preview */}
              <div className="bg-gray-50 rounded-lg p-8 border border-gray-200">
                <div className="max-w-4xl mx-auto bg-white p-12 shadow-lg rounded-lg">
                  <div className="text-center mb-8">
                    <h2 className="text-3xl text-gray-900 mb-2">{applicant.name}</h2>
                    <div className="flex items-center justify-center gap-4 text-gray-600">
                      <span>{applicant.email}</span>
                      <span>•</span>
                      <span>{applicant.phone}</span>
                      <span>•</span>
                      <span>{applicant.location}</span>
                    </div>
                  </div>

                  <div className="mb-8">
                    <h3 className="text-xl text-gray-900 mb-3 pb-2 border-b-2 border-gray-300">Professional Summary</h3>
                    <p className="text-gray-700 leading-relaxed">
                      Results-driven software engineer with {applicant.experience} of experience in full-stack development. 
                      Proven track record of delivering scalable solutions using modern technologies. Strong expertise in 
                      {applicant.skills.slice(0, 3).join(', ')}, and more. Passionate about building high-quality products 
                      and mentoring team members.
                    </p>
                  </div>

                  <div className="mb-8">
                    <h3 className="text-xl text-gray-900 mb-3 pb-2 border-b-2 border-gray-300">Skills</h3>
                    <div className="flex flex-wrap gap-2">
                      {applicant.skills.map((skill, idx) => (
                        <span key={idx} className="px-3 py-1.5 bg-gray-100 text-gray-900 rounded-md text-sm">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mb-8">
                    <h3 className="text-xl text-gray-900 mb-3 pb-2 border-b-2 border-gray-300">Work Experience</h3>
                    <div className="space-y-6">
                      <div>
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="text-lg text-gray-900">Senior Software Engineer</div>
                            <div className="text-gray-600">TechCorp Inc.</div>
                          </div>
                          <div className="text-gray-500">2021 - Present</div>
                        </div>
                        <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
                          <li>Led development of microservices architecture serving 1M+ users</li>
                          <li>Mentored team of 5 junior developers</li>
                          <li>Implemented CI/CD pipelines reducing deployment time by 60%</li>
                        </ul>
                      </div>
                      <div>
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="text-lg text-gray-900">Software Engineer</div>
                            <div className="text-gray-600">StartupXYZ</div>
                          </div>
                          <div className="text-gray-500">2019 - 2021</div>
                        </div>
                        <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
                          <li>Built and maintained React-based web applications</li>
                          <li>Collaborated with design team to implement responsive UIs</li>
                          <li>Optimized application performance improving load time by 40%</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xl text-gray-900 mb-3 pb-2 border-b-2 border-gray-300">Education</h3>
                    <div>
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="text-lg text-gray-900">{applicant.education}</div>
                          <div className="text-gray-600">University of Technology</div>
                        </div>
                        <div className="text-gray-500">2015 - 2019</div>
                      </div>
                      <p className="text-gray-700">GPA: 3.8/4.0 • Dean's List • Computer Science Club President</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
