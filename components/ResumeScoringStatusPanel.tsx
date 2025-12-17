import { CheckCircle2, Loader2, XCircle, Target, TrendingUp, Clock } from 'lucide-react';
import { useState, useEffect } from 'react';

interface ScoringResume {
  id: string;
  name: string;
  status: 'pending' | 'scoring' | 'completed' | 'error';
  score?: number;
}

interface ResumeScoringStatusPanelProps {
  resumes: Array<{ id: string; name: string }>;
  onComplete: (scoredResumes: any[]) => void;
  jobTitle: string;
}

export default function ResumeScoringStatusPanel({ 
  resumes, 
  onComplete,
  jobTitle 
}: ResumeScoringStatusPanelProps) {
  const [scoringResumes, setScoringResumes] = useState<ScoringResume[]>(
    resumes.map(r => ({ ...r, status: 'pending' as const }))
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [startTime] = useState(Date.now());
  const [elapsedTime, setElapsedTime] = useState(0);

  // Update elapsed time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  // Simulate scoring process
  useEffect(() => {
    if (currentIndex >= resumes.length) {
      // All resumes scored, complete the process
      const scoredResults = scoringResumes.map(resume => ({
        ...resume,
        matchScore: resume.score || 0,
        skillMatches: ['React', 'TypeScript', 'Node.js'].slice(0, Math.floor(Math.random() * 3) + 1),
        matchReason: resume.score && resume.score >= 85 
          ? 'Excellent match with strong alignment on key skills and experience requirements. Highly recommended candidate.'
          : resume.score && resume.score >= 70 
          ? 'Good match with relevant skills and experience. Solid candidate for consideration.'
          : 'Moderate match with some relevant skills. May require additional evaluation.',
        scoreBreakdown: {
          skillsMatch: Math.floor(Math.random() * 30) + 70,
          experienceMatch: Math.floor(Math.random() * 30) + 70,
          educationMatch: Math.floor(Math.random() * 30) + 70,
          overallFit: Math.floor(Math.random() * 30) + 70,
        }
      }));

      // Wait a bit before completing
      setTimeout(() => {
        onComplete(scoredResults);
      }, 1000);
      return;
    }

    // Score current resume
    const timer = setTimeout(() => {
      const score = Math.floor(Math.random() * 40) + 60; // 60-100
      
      // Update to scoring
      setScoringResumes(prev => prev.map((r, idx) => 
        idx === currentIndex 
          ? { ...r, status: 'scoring' as const }
          : r
      ));

      // Complete after a delay
      setTimeout(() => {
        setScoringResumes(prev => prev.map((r, idx) => 
          idx === currentIndex 
            ? { ...r, status: 'completed' as const, score }
            : r
        ));
        setCurrentIndex(prev => prev + 1);
      }, 1500);
    }, 500);

    return () => clearTimeout(timer);
  }, [currentIndex, resumes.length, onComplete, scoringResumes]);

  const completedCount = scoringResumes.filter(r => r.status === 'completed').length;
  const progressPercentage = (completedCount / resumes.length) * 100;
  const avgScore = scoringResumes.filter(r => r.score).length > 0
    ? Math.round(scoringResumes.reduce((sum, r) => sum + (r.score || 0), 0) / scoringResumes.filter(r => r.score).length)
    : 0;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-green-600';
    if (score >= 70) return 'text-blue-600';
    return 'text-yellow-600';
  };

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-in fade-in duration-200" />

      {/* Status Panel */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden pointer-events-auto animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-blue-700 px-6 py-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <Target className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl text-white font-semibold">AI Resume Scoring in Progress</h2>
                <p className="text-sm text-blue-100">Analyzing candidates for: {jobTitle}</p>
              </div>
              <div className="text-right">
                <div className="text-2xl text-white font-bold">{completedCount}/{resumes.length}</div>
                <div className="text-xs text-blue-100">Resumes Scored</div>
              </div>
            </div>

            {/* Overall Progress Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-white">
                <span className="font-medium">Overall Progress</span>
                <span className="font-semibold">{Math.round(progressPercentage)}%</span>
              </div>
              <div className="h-3 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm">
                <div 
                  className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full transition-all duration-500 ease-out shadow-lg"
                  style={{ width: `${progressPercentage}%` }}
                >
                  <div className="h-full w-full bg-white/30 animate-pulse rounded-full"></div>
                </div>
              </div>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 px-6 py-4 border-b border-gray-200">
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-lg px-4 py-3 border border-gray-200 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-gray-600 mb-1">Average Score</div>
                    <div className={`text-2xl font-bold ${getScoreColor(avgScore)}`}>
                      {completedCount > 0 ? `${avgScore}%` : '--'}
                    </div>
                  </div>
                  <TrendingUp className="w-8 h-8 text-blue-600 opacity-30" />
                </div>
              </div>

              <div className="bg-white rounded-lg px-4 py-3 border border-gray-200 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-gray-600 mb-1">Time Elapsed</div>
                    <div className="text-2xl font-bold text-gray-900">{formatTime(elapsedTime)}</div>
                  </div>
                  <Clock className="w-8 h-8 text-purple-600 opacity-30" />
                </div>
              </div>

              <div className="bg-white rounded-lg px-4 py-3 border border-gray-200 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-gray-600 mb-1">Est. Remaining</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {completedCount > 0 
                        ? formatTime(Math.ceil(((resumes.length - completedCount) * elapsedTime) / completedCount))
                        : '--:--'
                      }
                    </div>
                  </div>
                  <Target className="w-8 h-8 text-green-600 opacity-30" />
                </div>
              </div>
            </div>
          </div>

          {/* Resume List */}
          <div className="p-6 overflow-y-auto max-h-[calc(85vh-320px)]">
            <div className="space-y-2">
              {scoringResumes.map((resume, index) => (
                <div
                  key={resume.id}
                  className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-300 ${
                    resume.status === 'completed'
                      ? 'bg-green-50 border-green-300 shadow-sm'
                      : resume.status === 'scoring'
                      ? 'bg-blue-50 border-blue-400 shadow-md scale-105'
                      : resume.status === 'error'
                      ? 'bg-red-50 border-red-300'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  {/* Status Icon */}
                  <div className="flex-shrink-0">
                    {resume.status === 'completed' ? (
                      <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center shadow-lg animate-in zoom-in duration-200">
                        <CheckCircle2 className="w-6 h-6 text-white" />
                      </div>
                    ) : resume.status === 'scoring' ? (
                      <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center shadow-lg">
                        <Loader2 className="w-6 h-6 text-white animate-spin" />
                      </div>
                    ) : resume.status === 'error' ? (
                      <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center shadow-lg">
                        <XCircle className="w-6 h-6 text-white" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
                        <span className="text-gray-600 font-semibold text-sm">{index + 1}</span>
                      </div>
                    )}
                  </div>

                  {/* Resume Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <h4 className="font-medium text-gray-900 truncate">{resume.name}</h4>
                      {resume.status === 'scoring' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-600 text-white rounded-full text-xs font-medium animate-pulse">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Analyzing...
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 mt-0.5">
                      {resume.status === 'completed' && resume.score && (
                        <span>
                          AI Analysis Complete • Score: <span className={`font-semibold ${getScoreColor(resume.score)}`}>{resume.score}%</span>
                        </span>
                      )}
                      {resume.status === 'scoring' && 'Evaluating skills, experience, and job fit...'}
                      {resume.status === 'pending' && 'Waiting in queue...'}
                      {resume.status === 'error' && 'Failed to analyze'}
                    </div>
                  </div>

                  {/* Score Badge */}
                  {resume.status === 'completed' && resume.score && (
                    <div className={`flex-shrink-0 text-right animate-in fade-in slide-in-from-right duration-300`}>
                      <div className={`text-3xl font-bold ${getScoreColor(resume.score)}`}>
                        {resume.score}%
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        {resume.score >= 85 ? 'Excellent' : resume.score >= 70 ? 'Good' : 'Moderate'}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                <span>
                  {completedCount === resumes.length 
                    ? 'Finalizing results...' 
                    : `Scoring ${currentIndex + 1} of ${resumes.length} resumes...`
                  }
                </span>
              </div>
              <div className="text-sm text-gray-500">
                Please wait while AI analyzes each candidate
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
