import { ArrowLeft, Sparkles, Mail, Phone, MapPin, Building2, Clock, CheckCircle2, Star, TrendingUp, Filter, Download, Share2 } from 'lucide-react';
import { useState } from 'react';
import ListToolbar from '@/components/ui/list-toolbar';
import ListCountBadge from '@/components/ui/list-count-badge';
import ListEmptyState from '@/components/ui/list-empty-state';
import { useListSearch } from '@/lib/hooks/useListSearch';

interface AIMatchResultsProps {
  job: any;
  results: any[];
  onBack: () => void;
  onSelectCandidate: (candidate: any) => void;
}

export default function AIMatchResults({ job, results, onBack, onSelectCandidate }: AIMatchResultsProps) {
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  // Shared search/filter state. The selects commit as you pick, so this uses
  // `setFilter` and leaves the draft pair alone.
  const search = useListSearch({
    initialFilters: { location: '', experience: '', noticePeriod: '', skill: '' },
  });
  const searchQuery = search.appliedQuery;
  const {
    location: locationFilter,
    experience: experienceFilter,
    noticePeriod: noticePeriodFilter,
    skill: skillFilter,
  } = search.filters;

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

  const filteredResults = results
    .filter(r => searchQuery === '' || r.name.toLowerCase().includes(searchQuery.toLowerCase()) || r.title.toLowerCase().includes(searchQuery.toLowerCase()))
    .filter(r => locationFilter === '' || r.location.toLowerCase().includes(locationFilter.toLowerCase()))
    .filter(r => experienceFilter === '' || r.experience.toLowerCase().includes(experienceFilter.toLowerCase()))
    .filter(r => noticePeriodFilter === '' || r.noticePeriod.toLowerCase().includes(noticePeriodFilter.toLowerCase()))
    .filter(r => skillFilter === '' || r.skills.some((skill: string) => skill.toLowerCase().includes(skillFilter.toLowerCase())));

  // Get unique filter options
  const locations = Array.from(new Set(results.map(r => r.location)));
  const experiences = Array.from(new Set(results.map(r => r.experience)));
  const noticePeriods = Array.from(new Set(results.map(r => r.noticePeriod)));
  const allSkills = Array.from(new Set(results.flatMap(r => r.skills)));


  return (
    <div className="min-h-[100dvh] bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="p-6">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Jobs
          </button>

          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-gray-700 to-gray-500 rounded-xl flex items-center justify-center">
                <Sparkles className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl text-gray-900 mb-1">AI Talent Match Results</h1>
                <p className="text-gray-600 mb-3">{job.title}</p>
                <div className="flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1 text-gray-600">
                    <MapPin className="w-4 h-4" />
                    {job.location}
                  </span>
                  <span className="flex items-center gap-1 text-gray-600">
                    <Building2 className="w-4 h-4" />
                    {job.department}
                  </span>
                  <span className="flex items-center gap-1 text-gray-600">
                    <Clock className="w-4 h-4" />
                    {job.experience}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
                <Download className="w-4 h-4" />
                Export Results
              </button>
              <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
                <Share2 className="w-4 h-4" />
                Share
              </button>
            </div>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="bg-gradient-to-r from-gray-50 to-gray-50 border-t border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-8">
              <div>
                <div className="text-2xl text-gray-900">{results.length}</div>
                <div className="text-sm text-gray-600">Total Candidates</div>
              </div>
              <div className="w-px h-10 bg-gray-300" />
              <div>
                <div className="text-2xl text-green-600">
                  {results.filter(r => r.matchScore >= 85).length}
                </div>
                <div className="text-sm text-gray-600">Excellent Matches (85%+)</div>
              </div>
              <div className="w-px h-10 bg-gray-300" />
              <div>
                <div className="text-2xl text-gray-800">
                  {results.filter(r => r.matchScore >= 70 && r.matchScore < 85).length}
                </div>
                <div className="text-sm text-gray-600">Good Matches (70-84%)</div>
              </div>
              <div className="w-px h-10 bg-gray-300" />
              <div>
                <div className="text-2xl text-yellow-600">
                  {results.filter(r => r.matchScore >= 50 && r.matchScore < 70).length}
                </div>
                <div className="text-sm text-gray-600">Moderate Matches (50-69%)</div>
              </div>
            </div>
            {/* Units Consumed Note */}
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg border border-blue-200">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-medium">AI Talent Match • 0 units consumed</span>
            </div>
          </div>
        </div>
      </div>

      {/* Results List */}
      <div className="p-6">
        {/* Search and Filter Bar */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6">
          <ListToolbar
            searchValue={search.query}
            onSearchChange={search.setQuery}
            // The hook debounces into `appliedQuery`, so keystrokes pass through.
            searchDebounceMs={0}
            searchPlaceholder="Search by candidate name or job title..."
            onToggleFilters={() => setShowFilters(!showFilters)}
            filtersOpen={showFilters}
            activeFilterCount={search.activeFilterCount}
            filtersApplied={search.filtersApplied}
            onClearFilters={search.reset}
            className="mb-0"
            countBadge={
              <ListCountBadge
                filtered={filteredResults.length}
                total={results.length}
                noun="candidate"
                selected={selectedCandidates.length}
              />
            }
          />

          {/* Expanded Filters */}
          {showFilters && (
            <div className="mt-4 sm:mt-5 pt-4 sm:pt-5 border-t border-brand-blue/10">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Location
                  </label>
                  <select
                    value={locationFilter}
                    onChange={(e) => search.setFilter('location', e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white"
                  >
                    <option value="">All Locations</option>
                    {locations.map(loc => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Experience
                  </label>
                  <select
                    value={experienceFilter}
                    onChange={(e) => search.setFilter('experience', e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white"
                  >
                    <option value="">All Experience</option>
                    {experiences.map(exp => (
                      <option key={exp} value={exp}>{exp}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notice Period
                  </label>
                  <select
                    value={noticePeriodFilter}
                    onChange={(e) => search.setFilter('noticePeriod', e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white"
                  >
                    <option value="">All Periods</option>
                    {noticePeriods.map(np => (
                      <option key={np} value={np}>{np}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Skills
                  </label>
                  <select
                    value={skillFilter}
                    onChange={(e) => search.setFilter('skill', e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white"
                  >
                    <option value="">All Skills</option>
                    {allSkills.map(skill => (
                      <option key={skill} value={skill}>{skill}</option>
                    ))}
                  </select>
                </div>

              </div>

              {/* Panel footer: "Done" applies the selection and reveals the
                  toolbar Clear - same flow as job-openings. Clearing lives on
                  the toolbar so there is exactly one clear control. */}
              <div className="mt-4 pt-3 border-t border-brand-blue/10 flex items-center justify-end gap-2">
                <button
                  // The selects above commit as they change, so Done just closes.
                  onClick={() => setShowFilters(false)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-brand-blue transition-colors hover:bg-brand-blue-2 shadow-sm shadow-brand-blue/25"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Showing <span className="text-gray-900">{filteredResults.length}</span> candidates ranked by AI relevance
          </div>
          {selectedCandidates.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">
                {selectedCandidates.length} selected
              </span>
              <button className="px-4 py-2 bg-gray-800 text-white text-sm rounded-md hover:bg-gray-900 transition-colors">
                Apply to Job
              </button>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {filteredResults.map((candidate, index) => (
            <div
              key={candidate.id}
              className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all cursor-pointer"
              onClick={() => onSelectCandidate(candidate)}
            >
              <div className="p-6">
                <div className="flex items-start gap-4">
                  {/* Matched Rating Badge - circular like devrms */}
                  <div className="flex-shrink-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg ${
                      candidate.matchScore >= 90 ? 'bg-indigo-700' :
                      candidate.matchScore >= 80 ? 'bg-indigo-600' :
                      candidate.matchScore >= 70 ? 'bg-indigo-500' :
                      candidate.matchScore >= 60 ? 'bg-purple-500' :
                      candidate.matchScore >= 50 ? 'bg-purple-400' :
                      'bg-gray-400'
                    }`}>
                      {Math.round(candidate.matchScore / 10)}
                    </div>
                  </div>

                  {/* Candidate Info */}
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="text-lg text-gray-900">{candidate.name}</h3>
                          {index < 3 && (
                            <Star className={`w-5 h-5 ${
                              index === 0 ? 'text-yellow-500 fill-yellow-500' :
                              index === 1 ? 'text-gray-400 fill-gray-400' :
                              'text-orange-500 fill-orange-500'
                            }`} />
                          )}
                        </div>
                        <p className="text-gray-600 mb-2">{candidate.title}</p>
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          <span className="flex items-center gap-1">
                            <Mail className="w-4 h-4" />
                            {candidate.email}
                          </span>
                          <span className="flex items-center gap-1">
                            <Phone className="w-4 h-4" />
                            {candidate.phone}
                          </span>
                        </div>
                      </div>

                      {/* Match Score */}
                      <div className="text-right">
                        <div className={`text-3xl mb-1 ${getMatchColor(candidate.matchScore)}`}>
                          {candidate.matchScore}%
                        </div>
                        <div className={`inline-block px-3 py-1 rounded-full text-xs border ${getMatchBgColor(candidate.matchScore)}`}>
                          {getMatchLabel(candidate.matchScore)}
                        </div>
                      </div>
                    </div>

                    {/* Additional Details */}
                    <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        {candidate.location}
                      </span>
                      <span className="flex items-center gap-1">
                        <Building2 className="w-4 h-4" />
                        {candidate.currentCompany}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {candidate.experience}
                      </span>
                      <span className="flex items-center gap-1">
                        <TrendingUp className="w-4 h-4" />
                        {candidate.noticePeriod}
                      </span>
                    </div>

                    {/* Match Reason */}
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-3">
                      <div className="flex items-start gap-2">
                        <Sparkles className="w-4 h-4 text-gray-800 mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="text-xs text-gray-900 mb-1">AI Analysis</div>
                          <p className="text-sm text-gray-700">{candidate.matchReason}</p>
                        </div>
                      </div>
                    </div>

                    {/* Skill Matches */}
                    <div>
                      <div className="text-xs text-gray-600 mb-2">Skills Match:</div>
                      <div className="flex flex-wrap gap-2">
                        {candidate.skills.map((skill: string) => {
                          const isMatch = candidate.skillMatches.includes(skill);
                          return (
                            <span
                              key={skill}
                              className={`px-3 py-1 rounded-full text-xs ${
                                isMatch
                                  ? 'bg-green-100 text-green-700 border border-green-300'
                                  : 'bg-gray-100 text-gray-600 border border-gray-200'
                              }`}
                            >
                              {isMatch && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
                              {skill}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Selection Checkbox */}
                  <div className="flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={selectedCandidates.includes(candidate.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleSelectCandidate(candidate.id);
                      }}
                      className="w-5 h-5 text-gray-800 rounded"
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredResults.length === 0 && (
          <div className="bg-white rounded-lg border border-gray-200">
            <ListEmptyState
              icon={Filter}
              isNarrowed={search.isNarrowed}
              query={search.appliedQuery}
              entityLabel="candidate"
              emptyTitle="No matched candidates yet"
              emptyDescription="Run an AI match against this job to see candidates here."
              onReset={search.reset}
            />
          </div>
        )}
      </div>
    </div>
  );
}