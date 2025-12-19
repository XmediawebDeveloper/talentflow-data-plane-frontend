import { ArrowLeft, Sparkles, Mail, Phone, MapPin, Building2, Clock, CheckCircle2, Star, TrendingUp, Filter, Download, Share2, Search, ChevronDown, X } from 'lucide-react';
import { useState } from 'react';

interface AIMatchResultsProps {
  job: any;
  results: any[];
  onBack: () => void;
  onSelectCandidate: (candidate: any) => void;
}

export default function AIMatchResults({ job, results, onBack, onSelectCandidate }: AIMatchResultsProps) {
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [experienceFilter, setExperienceFilter] = useState('');
  const [noticePeriodFilter, setNoticePeriodFilter] = useState('');
  const [skillFilter, setSkillFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const getMatchColor = (score: number) => {
    if (score >= 85) return 'text-green-600';
    if (score >= 70) return 'text-blue-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-gray-600';
  };

  const getMatchBgColor = (score: number) => {
    if (score >= 85) return 'bg-green-100 border-green-300';
    if (score >= 70) return 'bg-blue-100 border-blue-300';
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

  const activeFiltersCount = [
    searchQuery !== '',
    locationFilter !== '',
    experienceFilter !== '',
    noticePeriodFilter !== '',
    skillFilter !== '',
  ].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-gray-50">
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
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-500 rounded-xl flex items-center justify-center">
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
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 border-t border-gray-200 px-6 py-4">
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
              <div className="text-2xl text-blue-600">
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
        </div>
      </div>

      {/* Results List */}
      <div className="p-6">
        {/* Search and Filter Bar */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by candidate name or job title..."
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
                />
              </div>
            </div>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-5 py-2.5 rounded-lg border-2 transition-all flex items-center gap-2 font-medium ${
                activeFiltersCount > 0
                  ? 'bg-purple-50 border-purple-600 text-purple-700 shadow-sm'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Filter className="w-5 h-5" />
              Filters
              {activeFiltersCount > 0 && (
                <span className="px-2 py-0.5 bg-purple-600 text-white rounded-full text-xs font-medium">
                  {activeFiltersCount}
                </span>
              )}
              <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>

            <div className="text-sm text-gray-700 bg-gray-100 px-4 py-2.5 rounded-lg whitespace-nowrap font-medium border border-gray-200">
              <span className="text-purple-600">{filteredResults.length}</span> of {results.length} candidates
            </div>
          </div>

          {/* Expanded Filters */}
          {showFilters && (
            <div className="mt-5 pt-5 border-t border-gray-200">
              <div className="grid grid-cols-5 gap-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Location
                  </label>
                  <select
                    value={locationFilter}
                    onChange={(e) => setLocationFilter(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 bg-white"
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
                    onChange={(e) => setExperienceFilter(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 bg-white"
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
                    onChange={(e) => setNoticePeriodFilter(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 bg-white"
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
                    onChange={(e) => setSkillFilter(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 bg-white"
                  >
                    <option value="">All Skills</option>
                    {allSkills.map(skill => (
                      <option key={skill} value={skill}>{skill}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setLocationFilter('');
                      setExperienceFilter('');
                      setNoticePeriodFilter('');
                      setSkillFilter('');
                    }}
                    disabled={activeFiltersCount === 0}
                    className="w-full px-4 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 font-medium"
                  >
                    <X className="w-4 h-4" />
                    Clear All
                  </button>
                </div>
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
              <button className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors">
                Apply to Job
              </button>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {filteredResults.map((candidate, index) => (
            <div
              key={candidate.id}
              className="bg-white rounded-lg border border-gray-200 hover:border-purple-300 hover:shadow-md transition-all cursor-pointer"
              onClick={() => onSelectCandidate(candidate)}
            >
              <div className="p-6">
                <div className="flex items-start gap-4">
                  {/* Rank Badge */}
                  <div className="flex-shrink-0">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-lg ${
                      index === 0 ? 'bg-yellow-100 text-yellow-700 border-2 border-yellow-300' :
                      index === 1 ? 'bg-gray-100 text-gray-700 border-2 border-gray-300' :
                      index === 2 ? 'bg-orange-100 text-orange-700 border-2 border-orange-300' :
                      'bg-gray-50 text-gray-600'
                    }`}>
                      #{index + 1}
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
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-3">
                      <div className="flex items-start gap-2">
                        <Sparkles className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="text-xs text-purple-700 mb-1">AI Analysis</div>
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
                      className="w-5 h-5 text-purple-600 rounded"
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredResults.length === 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <Filter className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg text-gray-900 mb-2">No candidates match your filters</h3>
            <p className="text-gray-600 mb-4">Try adjusting your search or filter criteria</p>
            <button
              onClick={() => {
                setSearchQuery('');
                setLocationFilter('');
                setExperienceFilter('');
                setNoticePeriodFilter('');
                setSkillFilter('');
              }}
              className="px-6 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
            >
              Clear All Filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}