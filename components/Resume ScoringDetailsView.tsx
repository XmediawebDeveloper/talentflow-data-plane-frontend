import { Target, FileText, Mail, Phone, MapPin, CheckCircle, FolderOpen, Database, TrendingUp, Download, Clock, ArrowLeft, Send, MousePointer, PlayCircle, CheckCircle2, XCircle, Filter, X } from 'lucide-react';

interface ScoredResumeData {
  id: string;
  jobId: string;
  jobTitle: string;
  scoredAt: Date;
  source: 'my-resumes' | 'database';
  totalScored: number;
  scoredResumes: any[];
}

interface ResumeScoringDetailsViewProps {
  selectedHistoryItem: ScoredResumeData;
  onBack: () => void;
  onScoreNew: () => void;
}

export default function ResumeScoringDetailsView({
  selectedHistoryItem,
  onBack,
  onScoreNew,
}: ResumeScoringDetailsViewProps) {
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');

  // Add status to scored resumes for tracking
  const addStatusToResumes = (resumes: any[]) => {
    return resumes.map((resume, index) => ({
      ...resume,
      status: index < 2 ? 'completed' :
              index < 4 ? 'test_started' :
              index < 6 ? 'link_opened' :
              index < 8 ? 'invitation_sent' :
              'failed'
    }));
  };

  const resumesWithStatus = addStatusToResumes(selectedHistoryItem.scoredResumes);
  
  // Calculate status counts
  const statusCounts = {
    invitation_sent: resumesWithStatus.filter(r => r.status === 'invitation_sent').length,
    link_opened: resumesWithStatus.filter(r => r.status === 'link_opened').length,
    test_started: resumesWithStatus.filter(r => r.status === 'test_started').length,
    completed: resumesWithStatus.filter(r => r.status === 'completed').length,
    failed: resumesWithStatus.filter(r => r.status === 'failed').length,
  };

  // Filter resumes by selected status
  const filteredStatusResumes = selectedStatusFilter === 'all' 
    ? resumesWithStatus 
    : resumesWithStatus.filter(r => r.status === selectedStatusFilter);

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-green-600';
    if (score >= 70) return 'text-blue-600';
    return 'text-yellow-600';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 85) return 'bg-green-100 border-green-300 text-green-700';
    if (score >= 70) return 'bg-blue-100 border-blue-300 text-blue-700';
    return 'bg-yellow-100 border-yellow-300 text-yellow-700';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 85) return 'Excellent Match';
    if (score >= 70) return 'Good Match';
    return 'Moderate Match';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'invitation_sent':
        return (
          <div className=\"flex items-center gap-2 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-medium\">
            <Send className=\"w-3.5 h-3.5\" />
            Invitation Sent
          </div>
        );
      case 'link_opened':
        return (
          <div className=\"flex items-center gap-2 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-xs font-medium\">
            <MousePointer className=\"w-3.5 h-3.5\" />
            Link Opened
          </div>
        );
      case 'test_started':
        return (
          <div className=\"flex items-center gap-2 px-3 py-1.5 bg-yellow-100 text-yellow-700 rounded-lg text-xs font-medium\">
            <PlayCircle className=\"w-3.5 h-3.5\" />
            Test Started
          </div>
        );
      case 'completed':
        return (
          <div className=\"flex items-center gap-2 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-medium\">
            <CheckCircle2 className=\"w-3.5 h-3.5\" />
            Completed
          </div>
        );
      case 'failed':
        return (
          <div className=\"flex items-center gap-2 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-medium\">
            <XCircle className=\"w-3.5 h-3.5\" />
            Failed / Abandoned
          </div>
        );
    }
  };

  return (
    <main className=\"flex-1 p-8 overflow-y-auto bg-gradient-to-br from-blue-50 via-purple-50 to-white\">
      {/* Header with Back Button */}
      <div className=\"mb-6\">
        <button
          onClick={onBack}
          className=\"flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-4 font-medium\"
        >
          <ArrowLeft className=\"w-5 h-5\" />
          Back to Scored Candidates
        </button>

        <div className=\"bg-white rounded-xl shadow-lg border-2 border-blue-300 p-6\">
          <div className=\"flex items-start justify-between\">
            <div className=\"flex items-center gap-4\">
              <div className=\"w-14 h-14 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg\">
                <Target className=\"w-7 h-7 text-white\" />
              </div>
              <div>
                <h1 className=\"text-2xl text-gray-900 mb-1\">{selectedHistoryItem.jobTitle}</h1>
                <div className=\"flex items-center gap-4 text-sm text-gray-600\">
                  <span className=\"flex items-center gap-1\">
                    <Clock className=\"w-4 h-4\" />
                    {new Date(selectedHistoryItem.scoredAt).toLocaleDateString('en-US', { 
                      month: 'short', 
                      day: 'numeric', 
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                  <span className=\"flex items-center gap-1\">
                    <FileText className=\"w-4 h-4\" />
                    {selectedHistoryItem.totalScored} candidates scored
                  </span>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${
                    selectedHistoryItem.source === 'my-resumes' 
                      ? 'bg-blue-100 text-blue-700' 
                      : 'bg-purple-100 text-purple-700'
                  }`}>
                    {selectedHistoryItem.source === 'my-resumes' ? (
                      <>
                        <FolderOpen className=\"w-3 h-3\" />
                        My Resumes
                      </>
                    ) : (
                      <>
                        <Database className=\"w-3 h-3\" />
                        Resume Database
                      </>
                    )}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={onScoreNew}
              className=\"px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-2\"
            >
              <Target className=\"w-4 h-4\" />
              Score New Resumes
            </button>
          </div>
        </div>
      </div>

      {/* Real-Time Status Panels */}
      <div className=\"grid grid-cols-5 gap-4 mb-6\">
        {/* Invitation Sent */}
        <button
          onClick={() => setSelectedStatusFilter(selectedStatusFilter === 'invitation_sent' ? 'all' : 'invitation_sent')}
          className={`bg-white rounded-xl shadow-sm border-2 transition-all p-4 text-left hover:shadow-lg ${
            selectedStatusFilter === 'invitation_sent' ? 'border-blue-500 bg-blue-50' : 'border-blue-200 hover:border-blue-300'
          }`}
        >
          <div className=\"flex items-center justify-between mb-3\">
            <div className=\"w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center\">
              <Send className=\"w-5 h-5 text-blue-600\" />
            </div>
            <div className=\"text-2xl text-gray-900\">{statusCounts.invitation_sent}</div>
          </div>
          <div className=\"text-sm text-gray-900 font-medium mb-1\">Invitation Sent</div>
          <div className=\"text-xs text-gray-500\">Email sent to candidates</div>
        </button>

        {/* Link Opened */}
        <button
          onClick={() => setSelectedStatusFilter(selectedStatusFilter === 'link_opened' ? 'all' : 'link_opened')}
          className={`bg-white rounded-xl shadow-sm border-2 transition-all p-4 text-left hover:shadow-lg ${
            selectedStatusFilter === 'link_opened' ? 'border-purple-500 bg-purple-50' : 'border-purple-200 hover:border-purple-300'
          }`}
        >
          <div className=\"flex items-center justify-between mb-3\">
            <div className=\"w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center\">
              <MousePointer className=\"w-5 h-5 text-purple-600\" />
            </div>
            <div className=\"text-2xl text-gray-900\">{statusCounts.link_opened}</div>
          </div>
          <div className=\"text-sm text-gray-900 font-medium mb-1\">Link Opened</div>
          <div className=\"text-xs text-gray-500\">Candidates viewed invitation</div>
        </button>

        {/* Test Started */}
        <button
          onClick={() => setSelectedStatusFilter(selectedStatusFilter === 'test_started' ? 'all' : 'test_started')}
          className={`bg-white rounded-xl shadow-sm border-2 transition-all p-4 text-left hover:shadow-lg ${
            selectedStatusFilter === 'test_started' ? 'border-yellow-500 bg-yellow-50' : 'border-yellow-200 hover:border-yellow-300'
          }`}
        >
          <div className=\"flex items-center justify-between mb-3\">
            <div className=\"w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center\">
              <PlayCircle className=\"w-5 h-5 text-yellow-600\" />
            </div>
            <div className=\"text-2xl text-gray-900\">{statusCounts.test_started}</div>
          </div>
          <div className=\"text-sm text-gray-900 font-medium mb-1\">Test Started</div>
          <div className=\"text-xs text-gray-500\">In progress</div>
        </button>

        {/* Completed */}
        <button
          onClick={() => setSelectedStatusFilter(selectedStatusFilter === 'completed' ? 'all' : 'completed')}
          className={`bg-white rounded-xl shadow-sm border-2 transition-all p-4 text-left hover:shadow-lg ${
            selectedStatusFilter === 'completed' ? 'border-green-500 bg-green-50' : 'border-green-200 hover:border-green-300'
          }`}
        >
          <div className=\"flex items-center justify-between mb-3\">
            <div className=\"w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center\">
              <CheckCircle2 className=\"w-5 h-5 text-green-600\" />
            </div>
            <div className=\"text-2xl text-gray-900\">{statusCounts.completed}</div>
          </div>
          <div className=\"text-sm text-gray-900 font-medium mb-1\">Completed</div>
          <div className=\"text-xs text-gray-500\">Scoring finished</div>
        </button>

        {/* Failed / Abandoned */}
        <button
          onClick={() => setSelectedStatusFilter(selectedStatusFilter === 'failed' ? 'all' : 'failed')}
          className={`bg-white rounded-xl shadow-sm border-2 transition-all p-4 text-left hover:shadow-lg ${
            selectedStatusFilter === 'failed' ? 'border-red-500 bg-red-50' : 'border-red-200 hover:border-red-300'
          }`}
        >
          <div className=\"flex items-center justify-between mb-3\">
            <div className=\"w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center\">
              <XCircle className=\"w-5 h-5 text-red-600\" />
            </div>
            <div className=\"text-2xl text-gray-900\">{statusCounts.failed}</div>
          </div>
          <div className=\"text-sm text-gray-900 font-medium mb-1\">Failed / Abandoned</div>
          <div className=\"text-xs text-gray-500\">Incomplete or error</div>
        </button>
      </div>

      {/* Filter Info Banner */}
      {selectedStatusFilter !== 'all' && (
        <div className=\"bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-center justify-between\">
          <div className=\"flex items-center gap-3\">
            <Filter className=\"w-5 h-5 text-blue-600\" />
            <span className=\"text-sm text-gray-700\">
              Showing <span className=\"font-medium\">{filteredStatusResumes.length}</span> candidate{filteredStatusResumes.length !== 1 ? 's' : ''} with status: <span className=\"font-medium capitalize\">{selectedStatusFilter.replace('_', ' ')}</span>
            </span>
          </div>
          <button
            onClick={() => setSelectedStatusFilter('all')}
            className=\"text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1\"
          >
            <X className=\"w-4 h-4\" />
            Clear Filter
          </button>
        </div>
      )}

      {/* Candidates List with Status */}
      <div className=\"space-y-4\">
        {filteredStatusResumes.map((resume, index) => (
          <div
            key={resume.id}
            className=\"bg-white rounded-xl border-2 border-gray-200 hover:border-blue-300 hover:shadow-lg transition-all p-6\"
          >
            <div className=\"flex items-start gap-6\">
              {/* Rank */}
              <div className=\"flex flex-col items-center gap-2\">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-base font-medium ${
                  resumesWithStatus.findIndex(r => r.id === resume.id) === 0 ? 'bg-yellow-100 text-yellow-700 border-2 border-yellow-300' :
                  resumesWithStatus.findIndex(r => r.id === resume.id) === 1 ? 'bg-gray-100 text-gray-700 border-2 border-gray-300' :
                  resumesWithStatus.findIndex(r => r.id === resume.id) === 2 ? 'bg-orange-100 text-orange-700 border-2 border-orange-300' :
                  'bg-gray-50 text-gray-600'
                }`}>
                  #{resumesWithStatus.findIndex(r => r.id === resume.id) + 1}
                </div>
              </div>

              {/* Resume Info */}
              <div className=\"flex-1 min-w-0\">
                <div className=\"flex items-start justify-between mb-3\">
                  <div className=\"flex-1 min-w-0\">
                    <div className=\"flex items-center gap-3 mb-1\">
                      <h3 className=\"text-xl text-gray-900\">{resume.name}</h3>
                      {getStatusBadge(resume.status)}
                    </div>
                    <div className=\"flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600 mb-2\">
                      <span className=\"flex items-center gap-1\">
                        <Mail className=\"w-4 h-4\" />
                        {resume.email}
                      </span>
                      <span className=\"flex items-center gap-1\">
                        <Phone className=\"w-4 h-4\" />
                        {resume.phone}
                      </span>
                      <span className=\"flex items-center gap-1\">
                        <MapPin className=\"w-4 h-4\" />
                        {resume.location}
                      </span>
                    </div>
                  </div>

                  {/* Match Score */}
                  <div className=\"text-right ml-6 flex-shrink-0\">
                    <div className={`text-4xl font-bold mb-1 ${getScoreColor(resume.matchScore)}`}>
                      {resume.matchScore}%
                    </div>
                    <div className={`inline-block px-3 py-1 rounded-full text-xs border ${getScoreBgColor(resume.matchScore)}`}>
                      {getScoreLabel(resume.matchScore)}
                    </div>
                  </div>
                </div>

                {/* AI Analysis */}
                <div className=\"bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4\">
                  <div className=\"flex items-start gap-2\">
                    <TrendingUp className=\"w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0\" />
                    <div>
                      <div className=\"text-sm font-medium text-blue-900 mb-1\">Score Analysis</div>
                      <p className=\"text-sm text-gray-700\">{resume.matchReason}</p>
                    </div>
                  </div>
                </div>

                {/* Score Breakdown */}
                {resume.scoreBreakdown && (
                  <div className=\"bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-4 mb-4\">
                    <div className=\"text-sm font-medium text-gray-900 mb-3\">Detailed Score Breakdown</div>
                    <div className=\"grid grid-cols-2 gap-3\">
                      <div>
                        <div className=\"flex items-center justify-between mb-1\">
                          <span className=\"text-xs text-gray-600\">Skills Match</span>
                          <span className=\"text-sm font-medium text-gray-900\">{resume.scoreBreakdown.skillsMatch}%</span>
                        </div>
                        <div className=\"h-2 bg-white rounded-full overflow-hidden\">
                          <div 
                            className=\"h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full\"
                            style={{ width: `${resume.scoreBreakdown.skillsMatch}%` }}
                          ></div>
                        </div>
                      </div>
                      <div>
                        <div className=\"flex items-center justify-between mb-1\">
                          <span className=\"text-xs text-gray-600\">Experience Match</span>
                          <span className=\"text-sm font-medium text-gray-900\">{resume.scoreBreakdown.experienceMatch}%</span>
                        </div>
                        <div className=\"h-2 bg-white rounded-full overflow-hidden\">
                          <div 
                            className=\"h-full bg-gradient-to-r from-purple-500 to-purple-600 rounded-full\"
                            style={{ width: `${resume.scoreBreakdown.experienceMatch}%` }}
                          ></div>
                        </div>
                      </div>
                      <div>
                        <div className=\"flex items-center justify-between mb-1\">
                          <span className=\"text-xs text-gray-600\">Education Match</span>
                          <span className=\"text-sm font-medium text-gray-900\">{resume.scoreBreakdown.educationMatch}%</span>
                        </div>
                        <div className=\"h-2 bg-white rounded-full overflow-hidden\">
                          <div 
                            className=\"h-full bg-gradient-to-r from-green-500 to-green-600 rounded-full\"
                            style={{ width: `${resume.scoreBreakdown.educationMatch}%` }}
                          ></div>
                        </div>
                      </div>
                      <div>
                        <div className=\"flex items-center justify-between mb-1\">
                          <span className=\"text-xs text-gray-600\">Overall Fit</span>
                          <span className=\"text-sm font-medium text-gray-900\">{resume.scoreBreakdown.overallFit}%</span>
                        </div>
                        <div className=\"h-2 bg-white rounded-full overflow-hidden\">
                          <div 
                            className=\"h-full bg-gradient-to-r from-yellow-500 to-yellow-600 rounded-full\"
                            style={{ width: `${resume.scoreBreakdown.overallFit}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Skills */}
                {resume.skills && resume.skills.length > 0 && (
                  <div className=\"mb-4\">
                    <div className=\"text-xs text-gray-500 mb-2\">Skills Matched</div>
                    <div className=\"flex flex-wrap gap-2\">
                      {resume.skills.map((skill: string, idx: number) => {
                        const isMatch = resume.skillMatches.includes(skill);
                        return (
                          <span
                            key={idx}
                            className={`px-3 py-1 rounded-full text-sm ${
                              isMatch
                                ? 'bg-green-100 text-green-700 border border-green-300 font-medium'
                                : 'bg-gray-100 text-gray-600 border border-gray-200'
                            }`}
                          >
                            {isMatch && <CheckCircle className=\"w-3 h-3 inline mr-1\" />}
                            {skill}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className=\"flex items-center gap-2 pt-4 border-t border-gray-200\">
                  <button className=\"px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm flex items-center gap-2\">
                    <FileText className=\"w-4 h-4\" />
                    View Resume
                  </button>
                  <button className=\"px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm flex items-center gap-2\">
                    <Download className=\"w-4 h-4\" />
                    Download
                  </button>
                  <button className=\"px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm flex items-center gap-2\">
                    <Mail className=\"w-4 h-4\" />
                    Contact
                  </button>
                  {resume.status === 'invitation_sent' && (
                    <button className=\"px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm flex items-center gap-2\">
                      <Send className=\"w-4 h-4\" />
                      Resend Invitation
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State for Filtered View */}
      {filteredStatusResumes.length === 0 && selectedStatusFilter !== 'all' && (
        <div className=\"bg-white rounded-xl border-2 border-dashed border-gray-300 p-12 text-center\">
          <Filter className=\"w-16 h-16 mx-auto mb-4 text-gray-400\" />
          <h3 className=\"text-gray-900 mb-2\">No Candidates Found</h3>
          <p className=\"text-gray-600 text-sm mb-4\">
            No candidates with status: <span className=\"font-medium capitalize\">{selectedStatusFilter.replace('_', ' ')}</span>
          </p>
          <button
            onClick={() => setSelectedStatusFilter('all')}
            className=\"px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium\"
          >
            Show All Candidates
          </button>
        </div>
      )}
    </main>
  );
}

import { useState } from 'react';
