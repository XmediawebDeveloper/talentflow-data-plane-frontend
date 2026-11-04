import { ArrowLeft, Search, Filter, Download, Mail, Phone, MapPin, Briefcase, GraduationCap, Calendar, Star, TrendingUp, Users, CheckCircle2, Clock, XCircle, MoreVertical, Eye, MessageSquare, AlertTriangle, Target } from 'lucide-react';
import { useState } from 'react';
import ResumeAnalysis from './ResumeAnalysis';
import SkillsList from '@/components/ui/SkillsList';
import { Button } from '@/components/ui/button';
import FilterSelect from '@/components/ui/filter-select';

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
        return { bg: 'bg-success-subtle', text: 'text-success', border: 'border-success-line', icon: CheckCircle2 };
      case 'Interview':
        return { bg: 'bg-warning-subtle', text: 'text-warning', border: 'border-warning-line', icon: MessageSquare };
      case 'Rejected':
        return { bg: 'bg-destructive-subtle', text: 'text-destructive', border: 'border-destructive-line', icon: XCircle };
      default:
        return { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300', icon: Clock };
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-success bg-success-subtle';
    if (score >= 70) return 'text-gray-800 bg-gray-100';
    return 'text-warning bg-warning-subtle';
  };

  const getMatchStatusConfig = (matchStatus: 'exact' | 'partial' | 'low') => {
    switch (matchStatus) {
      case 'exact':
        return { 
          label: 'Exact Match', 
          bg: 'bg-success-subtle', 
          text: 'text-success', 
          border: 'border-success-line',
          icon: CheckCircle2 
        };
      case 'partial':
        return { 
          label: 'Partial Match', 
          bg: 'bg-brand-orange/10', 
          text: 'text-brand-orange-deep', 
          border: 'border-brand-orange/20',
          icon: AlertTriangle 
        };
      case 'low':
        return { 
          label: 'Low Match', 
          bg: 'bg-warning-subtle', 
          text: 'text-warning', 
          border: 'border-warning-line',
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
    <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-gray-50">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Job Details
        </button>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-6">
          <div>
            <h1 className="tf-page-title mb-2">Job Applicants</h1>
            <p className="tf-body-secondary">
              Managing applicants for: <span className="text-gray-800">{jobTitle}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <Button variant="secondary" size="md" icon={<Download className="w-4 h-4" />}>
              Export
            </Button>
            <Button variant="primary" size="md" icon={<Mail className="w-5 h-5" />}>
              Email Selected
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="tf-grid-stats-5">
          <div className="tf-card-soft p-4 sm:p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-gray-50 rounded-lg">
                <Users className="w-5 h-5 text-gray-800" />
              </div>
              <TrendingUp className="w-4 h-4 text-success" />
            </div>
            <div className="text-2xl text-gray-900 mb-1">{stats.total}</div>
            <div className="tf-body-secondary">Total Applicants</div>
          </div>

          <div className="tf-card-soft p-4 sm:p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-success-subtle rounded-lg">
                <Target className="w-5 h-5 text-success" />
              </div>
              <div className="px-2 py-0.5 bg-success-subtle text-success rounded text-xs">85+</div>
            </div>
            <div className="text-2xl text-gray-900 mb-1">{stats.exactMatch}</div>
            <div className="tf-body-secondary">Exact Match</div>
          </div>

          <div className="tf-card-soft p-4 sm:p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-gray-50 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-gray-800" />
              </div>
              <div className="px-2 py-0.5 bg-gray-100 text-gray-900 rounded text-xs">70-84</div>
            </div>
            <div className="text-2xl text-gray-900 mb-1">{stats.partialMatch}</div>
            <div className="tf-body-secondary">Partial Match</div>
          </div>

          <div className="tf-card-soft p-4 sm:p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-success-subtle rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-success" />
              </div>
              <div className="px-2 py-0.5 bg-success-subtle text-success rounded text-xs">Active</div>
            </div>
            <div className="text-2xl text-gray-900 mb-1">{stats.shortlisted}</div>
            <div className="tf-body-secondary">Shortlisted</div>
          </div>

          <div className="tf-card-soft p-4 sm:p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-warning-subtle rounded-lg">
                <MessageSquare className="w-5 h-5 text-warning" />
              </div>
              <div className="px-2 py-0.5 bg-warning-subtle text-warning rounded text-xs">Pending</div>
            </div>
            <div className="text-2xl text-gray-900 mb-1">{stats.interview}</div>
            <div className="tf-body-secondary">Interviews</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="tf-card-soft mb-6">
        <div className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="tf-input h-auto pl-12 pr-4 py-3"
              />
            </div>

            {/* Status Filter */}
            <FilterSelect
              value={statusFilter}
              onChange={(v) => setStatusFilter(v)}
              ariaLabel="Filter by status"
              className="w-auto min-w-[160px] pl-4 sm:pl-4 pr-3 sm:pr-3 py-3 sm:py-3 rounded-lg sm:rounded-lg border-gray-300"
              options={[
                { value: 'all', label: 'All Status' },
                { value: 'New', label: 'New' },
                { value: 'Reviewing', label: 'Reviewing' },
                { value: 'Shortlisted', label: 'Shortlisted' },
                { value: 'Interview', label: 'Interview' },
                { value: 'Rejected', label: 'Rejected' },
              ]}
            />

            {/* Score Filter */}
            <FilterSelect
              value={scoreFilter}
              onChange={(v) => setScoreFilter(v)}
              ariaLabel="Filter by score"
              className="w-auto min-w-[160px] pl-4 sm:pl-4 pr-3 sm:pr-3 py-3 sm:py-3 rounded-lg sm:rounded-lg border-gray-300"
              options={[
                { value: 'all', label: 'All Scores' },
                { value: 'high', label: 'High (85+)' },
                { value: 'medium', label: 'Medium (70-84)' },
                { value: 'low', label: 'Below 70' },
              ]}
            />

            {/* Match Filter */}
            <FilterSelect
              value={matchFilter}
              onChange={(v) => setMatchFilter(v)}
              ariaLabel="Filter by match"
              className="w-auto min-w-[160px] pl-4 sm:pl-4 pr-3 sm:pr-3 py-3 sm:py-3 rounded-lg sm:rounded-lg border-gray-300"
              options={[
                { value: 'all', label: 'All Matches' },
                { value: 'exact', label: 'Exact Match' },
                { value: 'partial', label: 'Partial Match' },
                { value: 'low', label: 'Low Match' },
              ]}
            />

            {/* Advanced Filters */}
            <Button variant="secondary" icon={<Filter className="w-4 h-4" />}>
              More Filters
            </Button>
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
              className="tf-card-soft hover:shadow-lg hover:border-gray-300 transition-all overflow-hidden cursor-pointer group"
            >
              <div className="flex">
                {/* Left Color Bar */}
                <div className={`w-2 ${applicant.score >= 85 ? 'bg-success' : applicant.score >= 70 ? 'bg-gray-700' : 'bg-warning'}`}></div>

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
                            <span className="tf-meta flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              Applied {applicant.appliedDate}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 tf-body-secondary">
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

                      <div className="flex items-center gap-6 tf-body mt-3">
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
                        <SkillsList
                          skills={applicant.skills}
                          chipClassName="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-md text-xs"
                          moreClassName="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-md text-xs hover:bg-gray-200 transition-colors cursor-pointer"
                        />
                      </div>
                    </div>

                    {/* Score Section */}
                    <div className="flex items-center gap-4 px-6 border-l border-gray-200">
                      <div className="text-center">
                        <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${getScoreColor(applicant.score)}`}>
                          <span className="text-xl">{applicant.score}</span>
                        </div>
                        <div className="tf-meta mt-2 flex items-center gap-1">
                          <Star className="w-3 h-3" />
                          Match Score
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedApplicant(applicant);
                        }}
                        icon={<Eye className="w-4 h-4" />}
                      >
                        View Analysis
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Schedule Interview
                      </Button>
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
        <div className="tf-card-soft p-16 text-center">
          <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-gray-900 mb-2">No applicants found</h3>
          <p className="tf-body-muted">
            {searchQuery || statusFilter !== 'all' || scoreFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'No applicants have applied for this job yet'}
          </p>
        </div>
      )}
    </main>
  );
}
