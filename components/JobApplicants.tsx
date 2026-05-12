import { ArrowLeft, Search, Filter, Download, Mail, Phone, MapPin, Briefcase, GraduationCap, Calendar, Star, TrendingUp, Users, CheckCircle2, Clock, XCircle, ChevronDown, MoreVertical, Eye, MessageSquare, AlertTriangle, Target } from 'lucide-react';
import { useState } from 'react';
import ResumeAnalysis from './ResumeAnalysis';

interface Applicant {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  score: number;
  status: 'New' | 'Reviewing' | 'Shortlisted' | 'Rejected' | 'Interview';
  appliedDate: string;
  experience: string;
  education: string;
  skills: string[];
  matchStatus?: 'exact' | 'partial' | 'low';
}

interface JobApplicantsProps {
  jobTitle: string;
  applicants: Applicant[];
  onBack: () => void;
}

export default function JobApplicants({ jobTitle, applicants, onBack }: JobApplicantsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [scoreFilter, setScoreFilter] = useState<string>('all');
  const [matchFilter, setMatchFilter] = useState<string>('all');
  const [selectedApplicant, setSelectedApplicant] = useState<Applicant | null>(null);

  // Add match status to applicants based on score
  const applicantsWithMatch = applicants.map(app => ({
    ...app,
    matchStatus: app.score >= 85 ? 'exact' as const : app.score >= 70 ? 'partial' as const : 'low' as const
  }));

  const filteredApplicants = applicantsWithMatch.filter(applicant => {
    const matchesSearch = applicant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         applicant.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || applicant.status === statusFilter;
    const matchesScore = scoreFilter === 'all' ||
                        (scoreFilter === 'high' && applicant.score >= 85) ||
                        (scoreFilter === 'medium' && applicant.score >= 70 && applicant.score < 85) ||
                        (scoreFilter === 'low' && applicant.score < 70);
    const matchesMatchFilter = matchFilter === 'all' || applicant.matchStatus === matchFilter;
    return matchesSearch && matchesStatus && matchesScore && matchesMatchFilter;
  });

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'New':
        return { bg: 'bg-gray-100', text: 'text-gray-900', border: 'border-gray-300', icon: Clock };
      case 'Reviewing':
        return { bg: 'bg-gray-100', text: 'text-gray-900', border: 'border-gray-300', icon: Eye };
      case 'Shortlisted':
        return { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300', icon: CheckCircle2 };
      case 'Interview':
        return { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-300', icon: MessageSquare };
      case 'Rejected':
        return { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300', icon: XCircle };
      default:
        return { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300', icon: Clock };
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-green-600 bg-green-100';
    if (score >= 70) return 'text-gray-800 bg-gray-100';
    return 'text-yellow-600 bg-yellow-100';
  };

  const getMatchStatusConfig = (matchStatus: 'exact' | 'partial' | 'low') => {
    switch (matchStatus) {
      case 'exact':
        return { 
          label: 'Exact Match', 
          bg: 'bg-green-100', 
          text: 'text-green-700', 
          border: 'border-green-300',
          icon: CheckCircle2 
        };
      case 'partial':
        return { 
          label: 'Partial Match', 
          bg: 'bg-gray-100', 
          text: 'text-gray-900', 
          border: 'border-gray-300',
          icon: AlertTriangle 
        };
      case 'low':
        return { 
          label: 'Low Match', 
          bg: 'bg-yellow-100', 
          text: 'text-yellow-700', 
          border: 'border-yellow-300',
          icon: XCircle 
        };
    }
  };

  if (selectedApplicant) {
    return (
      <ResumeAnalysis
        applicant={selectedApplicant}
        jobTitle={jobTitle}
        onBack={() => setSelectedApplicant(null)}
      />
    );
  }

  const stats = {
    total: applicantsWithMatch.length,
    new: applicantsWithMatch.filter(a => a.status === 'New').length,
    shortlisted: applicantsWithMatch.filter(a => a.status === 'Shortlisted').length,
    interview: applicantsWithMatch.filter(a => a.status === 'Interview').length,
    exactMatch: applicantsWithMatch.filter(a => a.matchStatus === 'exact').length,
    partialMatch: applicantsWithMatch.filter(a => a.matchStatus === 'partial').length,
    lowMatch: applicantsWithMatch.filter(a => a.matchStatus === 'low').length,
  };

  return (
    <main className="flex-1 p-8 overflow-y-auto bg-gray-50">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Job Details
        </button>

        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-gray-900 mb-2">Job Applicants</h1>
            <p className="text-sm text-gray-600">
              Managing applicants for: <span className="text-gray-800">{jobTitle}</span>
            </p>
          </div>
          <div className="flex gap-3">
            <button className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
              <Download className="w-4 h-4" />
              Export
            </button>
            <button className="flex items-center gap-2 bg-gray-800 text-white px-6 py-2.5 rounded-lg hover:bg-gray-900 transition-colors shadow-lg shadow-blue-500/25">
              <Mail className="w-5 h-5" />
              Email Selected
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-gray-50 rounded-lg">
                <Users className="w-5 h-5 text-gray-800" />
              </div>
              <TrendingUp className="w-4 h-4 text-green-500" />
            </div>
            <div className="text-2xl text-gray-900 mb-1">{stats.total}</div>
            <div className="text-sm text-gray-600">Total Applicants</div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-green-50 rounded-lg">
                <Target className="w-5 h-5 text-green-600" />
              </div>
              <div className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">85+</div>
            </div>
            <div className="text-2xl text-gray-900 mb-1">{stats.exactMatch}</div>
            <div className="text-sm text-gray-600">Exact Match</div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-gray-50 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-gray-800" />
              </div>
              <div className="px-2 py-0.5 bg-gray-100 text-gray-900 rounded text-xs">70-84</div>
            </div>
            <div className="text-2xl text-gray-900 mb-1">{stats.partialMatch}</div>
            <div className="text-sm text-gray-600">Partial Match</div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-green-50 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <div className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Active</div>
            </div>
            <div className="text-2xl text-gray-900 mb-1">{stats.shortlisted}</div>
            <div className="text-sm text-gray-600">Shortlisted</div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-amber-50 rounded-lg">
                <MessageSquare className="w-5 h-5 text-amber-600" />
              </div>
              <div className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">Pending</div>
            </div>
            <div className="text-2xl text-gray-900 mb-1">{stats.interview}</div>
            <div className="text-sm text-gray-600">Interviews</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
        <div className="p-5">
          <div className="flex gap-3">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent text-sm"
              />
            </div>

            {/* Status Filter */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="appearance-none pl-4 pr-10 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent text-sm bg-white cursor-pointer min-w-[160px]"
              >
                <option value="all">All Status</option>
                <option value="New">New</option>
                <option value="Reviewing">Reviewing</option>
                <option value="Shortlisted">Shortlisted</option>
                <option value="Interview">Interview</option>
                <option value="Rejected">Rejected</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>

            {/* Score Filter */}
            <div className="relative">
              <select
                value={scoreFilter}
                onChange={(e) => setScoreFilter(e.target.value)}
                className="appearance-none pl-4 pr-10 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent text-sm bg-white cursor-pointer min-w-[160px]"
              >
                <option value="all">All Scores</option>
                <option value="high">High (85+)</option>
                <option value="medium">Medium (70-84)</option>
                <option value="low">Below 70</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>

            {/* Match Filter */}
            <div className="relative">
              <select
                value={matchFilter}
                onChange={(e) => setMatchFilter(e.target.value)}
                className="appearance-none pl-4 pr-10 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent text-sm bg-white cursor-pointer min-w-[160px]"
              >
                <option value="all">All Matches</option>
                <option value="exact">Exact Match</option>
                <option value="partial">Partial Match</option>
                <option value="low">Low Match</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>

            {/* Advanced Filters */}
            <button className="px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 text-sm">
              <Filter className="w-4 h-4 text-gray-600" />
              <span className="text-gray-700">More Filters</span>
            </button>
          </div>
        </div>
      </div>

      {/* Applicants List */}
      <div className="space-y-3">
        {filteredApplicants.map((applicant) => {
          const statusConfig = getStatusConfig(applicant.status);
          const StatusIcon = statusConfig.icon;
          const matchConfig = getMatchStatusConfig(applicant.matchStatus!);
          const MatchIcon = matchConfig.icon;

          return (
            <div
              key={applicant.id}
              onClick={() => setSelectedApplicant(applicant)}
              className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-lg hover:border-gray-300 transition-all overflow-hidden cursor-pointer group"
            >
              <div className="flex">
                {/* Left Color Bar */}
                <div className={`w-2 ${applicant.score >= 85 ? 'bg-green-500' : applicant.score >= 70 ? 'bg-gray-700' : 'bg-yellow-500'}`}></div>

                <div className="flex-1 p-5">
                  <div className="flex items-center justify-between gap-6">
                    {/* Candidate Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-4 mb-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-gray-900 mb-1 group-hover:text-gray-800 transition-colors">{applicant.name}</h3>
                          <div className="flex items-center gap-3 flex-wrap">
                            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${matchConfig.bg} ${matchConfig.text} ${matchConfig.border}`}>
                              <MatchIcon className="w-3 h-3" />
                              {matchConfig.label}
                            </div>
                            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${statusConfig.bg} ${statusConfig.text} ${statusConfig.border}`}>
                              <StatusIcon className="w-3 h-3" />
                              {applicant.status}
                            </div>
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              Applied {applicant.appliedDate}
                            </span>
                          </div>
                        </div>
                      </div>

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

                      <div className="flex items-center gap-6 text-sm text-gray-700 mt-3">
                        <div className="flex items-center gap-2">
                          <Briefcase className="w-4 h-4 text-gray-400" />
                          <span>{applicant.experience}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <GraduationCap className="w-4 h-4 text-gray-400" />
                          <span>{applicant.education}</span>
                        </div>
                      </div>

                      {/* Skills */}
                      <div className="flex flex-wrap gap-2 mt-3">
                        {applicant.skills.slice(0, 4).map((skill, idx) => (
                          <span
                            key={idx}
                            className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-md text-xs"
                          >
                            {skill}
                          </span>
                        ))}
                        {applicant.skills.length > 4 && (
                          <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-md text-xs">
                            +{applicant.skills.length - 4} more
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Score Section */}
                    <div className="flex items-center gap-4 px-6 border-l border-gray-200">
                      <div className="text-center">
                        <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${getScoreColor(applicant.score)}`}>
                          <span className="text-xl">{applicant.score}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                          <Star className="w-3 h-3" />
                          Match Score
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedApplicant(applicant);
                        }}
                        className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm flex items-center gap-2"
                      >
                        <Eye className="w-4 h-4" />
                        View Analysis
                      </button>
                      <button 
                        onClick={(e) => e.stopPropagation()}
                        className="px-4 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors text-sm"
                      >
                        Schedule Interview
                      </button>
                      <button 
                        onClick={(e) => e.stopPropagation()}
                        className="p-2.5 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <MoreVertical className="w-5 h-5 text-gray-400" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredApplicants.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-16 text-center">
          <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-gray-900 mb-2">No applicants found</h3>
          <p className="text-sm text-gray-500">
            {searchQuery || statusFilter !== 'all' || scoreFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'No applicants have applied for this job yet'}
          </p>
        </div>
      )}
    </main>
  );
}
