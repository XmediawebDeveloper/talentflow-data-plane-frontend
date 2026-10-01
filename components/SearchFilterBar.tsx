import { Search, Filter, X, ChevronDown, SlidersHorizontal, MapPin, Building2, Clock, GraduationCap, Briefcase, HelpCircle, Info, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { DateField } from '@/components/ui/date-field';

interface SearchFilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filters: any;
  onFiltersChange: (filters: any) => void;
  sortBy: string;
  onSortChange: (sort: string) => void;
}

export default function SearchFilterBar({
  searchQuery,
  onSearchChange,
  filters,
  onFiltersChange,
  sortBy,
  onSortChange,
}: SearchFilterBarProps) {
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [showSearchTips, setShowSearchTips] = useState(false);
  const [tempFilters, setTempFilters] = useState(filters);
  const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery);
  
  // Debounce search to improve performance (✅ Low latency optimization)
  const debouncedSearch = useDebounce(localSearchQuery, 300);

  // Update parent when debounced search changes
  useEffect(() => {
    onSearchChange(debouncedSearch);
  }, [debouncedSearch, onSearchChange]);

  // Sync temp filters with props
  useEffect(() => {
    setTempFilters(filters);
  }, [filters]);

    // `filters` is typed `any`, but Object.entries widens each value to `unknown`,
    // so the property reads below (.min/.max/.start/.end) failed to compile. The
    // explicit tuple annotation restores the `any` these values already had.
  const activeFilterCount = Object.entries(filters).filter(([key, value]: [string, any]) => {
    if (key === 'skills' && Array.isArray(value)) return value.length > 0;
    if (key === 'experienceRange') return value && (value.min !== undefined || value.max !== undefined);
    if (key === 'uploadDateRange') return value && (value.start || value.end);
    if (key === 'lastUpdatedRange') return value && (value.start || value.end);
    return value !== null && value !== undefined && value !== '';
  }).length;

  const handleApplyFilters = () => {
    onFiltersChange(tempFilters);
    setShowAdvancedFilters(false);
  };

  const handleClearFilters = () => {
    const emptyFilters = {};
    setTempFilters(emptyFilters);
    onFiltersChange(emptyFilters);
    setShowAdvancedFilters(false);
  };

  const handleSkillToggle = (skill: string) => {
    const currentSkills = tempFilters.skills || [];
    if (currentSkills.includes(skill)) {
      setTempFilters({
        ...tempFilters,
        skills: currentSkills.filter((s: string) => s !== skill)
      });
    } else {
      setTempFilters({
        ...tempFilters,
        skills: [...currentSkills, skill]
      });
    }
  };

  const availableSkills = [
    'React', 'JavaScript', 'TypeScript', 'Python', 'Java',
    'Node.js', 'Angular', 'Vue.js', 'AWS', 'Docker',
    'Kubernetes', 'SQL', 'MongoDB', 'REST API', 'GraphQL'
  ];

  const educationLevels = [
    'High School',
    'Associate Degree',
    'Bachelor\'s Degree',
    'Master\'s Degree',
    'Doctorate (PhD)',
    'Professional Certification'
  ];

  const noticePeriods = [
    'Immediate',
    '15 Days',
    '30 Days',
    '45 Days',
    '60 Days',
    '90 Days'
  ];

  return (
    <div className="bg-muted/40 p-3 sm:p-4 rounded-t-xl border border-border border-b-0">
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        {/* Global Search Bar */}
        <div className="flex-1 relative min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name, email, phone, or skills..."
            value={localSearchQuery}
            onChange={(e) => setLocalSearchQuery(e.target.value)}
            className="w-full h-10 pl-10 pr-20 border border-border rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1 focus-visible:border-transparent transition-all bg-background text-foreground placeholder:text-muted-foreground text-sm"
          />
          {localSearchQuery && (
            <button
              onClick={() => {
                setLocalSearchQuery('');
                onSearchChange('');
              }}
              className="absolute right-10 top-1/2 -translate-y-1/2 hover:bg-accent/60 rounded-full p-1 transition-colors"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
          {localSearchQuery && localSearchQuery !== debouncedSearch && (
            <div className="absolute right-[4.5rem] top-1/2 -translate-y-1/2">
              <Loader2 className="w-3.5 h-3.5 text-[var(--primary)] animate-spin" />
            </div>
          )}
          <button
            onClick={() => setShowSearchTips(!showSearchTips)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 hover:bg-accent/60 rounded-full p-1 transition-colors"
            aria-label="Search tips"
          >
            <HelpCircle className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="flex gap-2 sm:gap-3">
          {/* Advanced Filters Button */}
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`inline-flex items-center justify-center gap-2 h-10 px-3 sm:px-4 text-sm font-medium border rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1 ${
              activeFilterCount > 0
                ? 'border-[var(--primary)] bg-background text-[var(--primary)] shadow-sm'
                : 'border-border bg-background text-foreground hover:bg-accent/50'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">Advanced Filters</span>
            <span className="sm:hidden">Filters</span>
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center justify-center bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-semibold rounded-full min-w-5 h-5 px-1">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Sort Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowSort(!showSort)}
              className="inline-flex items-center justify-center gap-2 h-10 px-3 sm:px-4 text-sm font-medium border border-border bg-background text-foreground rounded-lg hover:bg-accent/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1"
            >
              <span>Sort</span>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showSort ? 'rotate-180' : ''}`} />
            </button>

            {showSort && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowSort(false)} />
                <div className="absolute right-0 mt-2 w-56 max-w-[calc(100vw-1.5rem)] max-h-[70dvh] overflow-y-auto bg-popover text-popover-foreground rounded-lg shadow-2xl border border-border py-1.5 z-20">
                {[
                  { value: 'latest', label: 'Latest Upload' },
                  { value: 'lastUpdated', label: 'Recently Updated' },
                  { value: 'name-asc', label: 'Name A-Z' },
                  { value: 'name-desc', label: 'Name Z-A' },
                  { value: 'experience-high', label: 'Experience (High to Low)' },
                  { value: 'experience-low', label: 'Experience (Low to High)' },
                ].map(option => (
                  <button
                    key={option.value}
                    onClick={() => {
                      onSortChange(option.value);
                      setShowSort(false);
                    }}
                    className={`w-full text-left px-3 mx-1 py-2 text-sm rounded-md transition-colors ${
                      sortBy === option.value ? 'text-foreground bg-accent/60 font-medium' : 'text-foreground hover:bg-accent/50'
                    }`}
                    style={{ width: 'calc(100% - 8px)' }}
                  >
                    {option.label}
                  </button>
                ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Advanced Filters Panel */}
      {showAdvancedFilters && (
        <div className="mt-3 sm:mt-4 bg-card rounded-lg shadow-sm border border-border p-4 sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {/* Skills Filter */}
            <div>
              <label className="flex items-center gap-2 text-sm text-gray-900 mb-3">
                <Briefcase className="w-4 h-4 text-gray-500" />
                Skills
              </label>
              <div className="max-h-64 overflow-y-auto space-y-2 border border-gray-200 rounded-md p-3">
                {availableSkills.map(skill => (
                  <label key={skill} className="flex items-center gap-2 hover:bg-gray-50 p-1 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(tempFilters.skills || []).includes(skill)}
                      onChange={() => handleSkillToggle(skill)}
                      className="text-gray-800 rounded"
                    />
                    <span className="text-sm text-gray-700">{skill}</span>
                  </label>
                ))}
              </div>
              {(tempFilters.skills || []).length > 0 && (
                <div className="mt-2 text-xs text-gray-800">
                  {tempFilters.skills.length} skill{tempFilters.skills.length !== 1 ? 's' : ''} selected
                </div>
              )}
            </div>

            {/* Experience Range */}
            <div>
              <label className="flex items-center gap-2 text-sm text-gray-900 mb-3">
                <Clock className="w-4 h-4 text-gray-500" />
                Total Experience
              </label>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Minimum Years</label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    placeholder="Min"
                    value={tempFilters.experienceRange?.min || ''}
                    onChange={(e) => setTempFilters({
                      ...tempFilters,
                      experienceRange: {
                        ...tempFilters.experienceRange,
                        min: e.target.value ? parseInt(e.target.value) : undefined
                      }
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-600"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Maximum Years</label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    placeholder="Max"
                    value={tempFilters.experienceRange?.max || ''}
                    onChange={(e) => setTempFilters({
                      ...tempFilters,
                      experienceRange: {
                        ...tempFilters.experienceRange,
                        max: e.target.value ? parseInt(e.target.value) : undefined
                      }
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-600"
                  />
                </div>
                <div className="pt-2 border-t border-gray-200">
                  <label className="block text-xs text-gray-600 mb-2">Or select range:</label>
                  <div className="space-y-2">
                    {[
                      { label: '0-2 years', min: 0, max: 2 },
                      { label: '2-5 years', min: 2, max: 5 },
                      { label: '5-10 years', min: 5, max: 10 },
                      { label: '10+ years', min: 10, max: 50 },
                    ].map(range => (
                      <button
                        key={range.label}
                        onClick={() => setTempFilters({
                          ...tempFilters,
                          experienceRange: { min: range.min, max: range.max }
                        })}
                        className={`w-full text-left px-3 py-2 text-xs rounded-md transition-colors ${
                          tempFilters.experienceRange?.min === range.min && tempFilters.experienceRange?.max === range.max
                            ? 'bg-gray-100 text-gray-900 border border-gray-300'
                            : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                        }`}
                      >
                        {range.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Education Level */}
            <div>
              <label className="flex items-center gap-2 text-sm text-gray-900 mb-3">
                <GraduationCap className="w-4 h-4 text-gray-500" />
                Education Level
              </label>
              <div className="space-y-2">
                {educationLevels.map(level => (
                  <label key={level} className="flex items-center gap-2 hover:bg-gray-50 p-2 rounded cursor-pointer">
                    <input
                      type="radio"
                      name="education"
                      checked={tempFilters.education === level}
                      onChange={() => setTempFilters({ ...tempFilters, education: level })}
                      className="text-gray-800"
                    />
                    <span className="text-sm text-gray-700">{level}</span>
                  </label>
                ))}
                {tempFilters.education && (
                  <button
                    onClick={() => setTempFilters({ ...tempFilters, education: null })}
                    className="text-xs text-red-600 hover:text-red-700 ml-6"
                  >
                    Clear selection
                  </button>
                )}
              </div>
            </div>

            {/* Location */}
            <div>
              <label className="flex items-center gap-2 text-sm text-gray-900 mb-3">
                <MapPin className="w-4 h-4 text-gray-500" />
                Current Location
              </label>
              <input
                type="text"
                placeholder="e.g., San Francisco, CA"
                value={tempFilters.location || ''}
                onChange={(e) => setTempFilters({ ...tempFilters, location: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-600"
              />
            </div>

            {/* Current Company */}
            <div>
              <label className="flex items-center gap-2 text-sm text-gray-900 mb-3">
                <Building2 className="w-4 h-4 text-gray-500" />
                Current Company
              </label>
              <input
                type="text"
                placeholder="e.g., Google, Microsoft"
                value={tempFilters.currentCompany || ''}
                onChange={(e) => setTempFilters({ ...tempFilters, currentCompany: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-600"
              />
            </div>

            {/* Previous Company */}
            <div>
              <label className="flex items-center gap-2 text-sm text-gray-900 mb-3">
                <Building2 className="w-4 h-4 text-gray-500" />
                Previous Company
              </label>
              <input
                type="text"
                placeholder="e.g., Amazon, Facebook"
                value={tempFilters.previousCompany || ''}
                onChange={(e) => setTempFilters({ ...tempFilters, previousCompany: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-600"
              />
            </div>

            {/* Notice Period */}
            <div>
              <label className="flex items-center gap-2 text-sm text-gray-900 mb-3">
                <Clock className="w-4 h-4 text-gray-500" />
                Notice Period
              </label>
              <div className="space-y-2">
                {noticePeriods.map(period => (
                  <label key={period} className="flex items-center gap-2 hover:bg-gray-50 p-2 rounded cursor-pointer">
                    <input
                      type="radio"
                      name="noticePeriod"
                      checked={tempFilters.noticePeriod === period}
                      onChange={() => setTempFilters({ ...tempFilters, noticePeriod: period })}
                      className="text-gray-800"
                    />
                    <span className="text-sm text-gray-700">{period}</span>
                  </label>
                ))}
                {tempFilters.noticePeriod && (
                  <button
                    onClick={() => setTempFilters({ ...tempFilters, noticePeriod: null })}
                    className="text-xs text-red-600 hover:text-red-700 ml-6"
                  >
                    Clear selection
                  </button>
                )}
              </div>
            </div>

            {/* Upload Date Range */}
            <div>
              <label className="flex items-center gap-2 text-sm text-gray-900 mb-3">
                Upload Date
              </label>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <DateField
                  aria-label="Upload date from"
                  value={tempFilters.uploadDateRange?.start || ''}
                  onChange={(v) => setTempFilters({
                    ...tempFilters,
                    uploadDateRange: {
                      ...tempFilters.uploadDateRange,
                      start: v
                    }
                  })}
                  className="sm:flex-1 sm:min-w-0"
                />
                <span className="text-xs text-gray-400 text-center sm:text-left sm:flex-shrink-0">to</span>
                <DateField
                  aria-label="Upload date to"
                  value={tempFilters.uploadDateRange?.end || ''}
                  onChange={(v) => setTempFilters({
                    ...tempFilters,
                    uploadDateRange: {
                      ...tempFilters.uploadDateRange,
                      end: v
                    }
                  })}
                  className="sm:flex-1 sm:min-w-0"
                />
              </div>
            </div>

            {/* Last Updated Date Range */}
            <div>
              <label className="flex items-center gap-2 text-sm text-gray-900 mb-3">
                Last Updated
              </label>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <DateField
                  aria-label="Last updated from"
                  value={tempFilters.lastUpdatedRange?.start || ''}
                  onChange={(v) => setTempFilters({
                    ...tempFilters,
                    lastUpdatedRange: {
                      ...tempFilters.lastUpdatedRange,
                      start: v
                    }
                  })}
                  className="sm:flex-1 sm:min-w-0"
                />
                <span className="text-xs text-gray-400 text-center sm:text-left sm:flex-shrink-0">to</span>
                <DateField
                  aria-label="Last updated to"
                  value={tempFilters.lastUpdatedRange?.end || ''}
                  onChange={(v) => setTempFilters({
                    ...tempFilters,
                    lastUpdatedRange: {
                      ...tempFilters.lastUpdatedRange,
                      end: v
                    }
                  })}
                  className="sm:flex-1 sm:min-w-0"
                />
              </div>
            </div>

            {/* Resume Source */}
            <div>
              <label className="flex items-center gap-2 text-sm text-gray-900 mb-3">
                <Filter className="w-4 h-4 text-gray-500" />
                Resume Source
              </label>
              <div className="space-y-2">
                {['Manual', 'TalentFlow'].map(source => (
                  <label key={source} className="flex items-center gap-2 hover:bg-gray-50 p-2 rounded cursor-pointer">
                    <input
                      type="radio"
                      name="source"
                      checked={tempFilters.source === source}
                      onChange={() => setTempFilters({ ...tempFilters, source: source })}
                      className="text-gray-800"
                    />
                    <span className="text-sm text-gray-700">{source}</span>
                  </label>
                ))}
                {tempFilters.source && (
                  <button
                    onClick={() => setTempFilters({ ...tempFilters, source: null })}
                    className="text-xs text-red-600 hover:text-red-700 ml-6"
                  >
                    Clear selection
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 mt-5 sm:mt-6 pt-4 sm:pt-6 border-t border-border">
            <div className="text-sm text-muted-foreground">
              {activeFilterCount > 0 ? (
                <span className="text-foreground font-medium">
                  {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active
                </span>
              ) : (
                <span>No filters applied</span>
              )}
            </div>
            <div className="flex gap-2 sm:gap-3">
              <button
                onClick={handleClearFilters}
                className="inline-flex items-center justify-center h-10 px-5 text-sm font-medium border border-border bg-background text-foreground rounded-lg hover:bg-accent/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1"
              >
                Clear All
              </button>
              <button
                onClick={handleApplyFilters}
                className="inline-flex items-center justify-center h-10 px-6 text-sm font-medium bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:bg-[var(--primary-hover)] shadow-sm hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search Tips Panel */}
      {showSearchTips && (
        <div className="mt-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg shadow-lg border-2 border-gray-200 p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-800 rounded-lg">
                <HelpCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-gray-900 mb-1">Search Accuracy & Performance Guide</h3>
                <p className="text-xs text-gray-600">Supports partial, exact, and multiple keyword searches</p>
              </div>
            </div>
            <button
              onClick={() => setShowSearchTips(false)}
              className="text-gray-500 hover:text-gray-700 p-1 hover:bg-white rounded transition-colors"
             aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {/* Partial Text Match */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                  <span className="text-green-700">✓</span>
                </div>
                <h4 className="text-sm text-gray-900">Partial Text Match</h4>
              </div>
              <p className="text-xs text-gray-600 mb-3">Search with partial keywords to find candidates</p>
              <div className="space-y-2">
                <div className="bg-gray-50 rounded p-2 border border-gray-200">
                  <code className="text-xs text-gray-800">react</code>
                  <p className="text-xs text-gray-500 mt-1">Finds: React, ReactJS, React Native</p>
                </div>
                <div className="bg-gray-50 rounded p-2 border border-gray-200">
                  <code className="text-xs text-gray-800">john</code>
                  <p className="text-xs text-gray-500 mt-1">Finds: John, Johnson, Johnathan</p>
                </div>
              </div>
            </div>

            {/* Exact Match */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                  <span className="text-gray-900">""</span>
                </div>
                <h4 className="text-sm text-gray-900">Exact Match</h4>
              </div>
              <p className="text-xs text-gray-600 mb-3">Use quotes for exact phrase matching</p>
              <div className="space-y-2">
                <div className="bg-gray-50 rounded p-2 border border-gray-200">
                  <code className="text-xs text-gray-800">"Senior Developer"</code>
                  <p className="text-xs text-gray-500 mt-1">Finds only: Senior Developer</p>
                </div>
                <div className="bg-gray-50 rounded p-2 border border-gray-200">
                  <code className="text-xs text-gray-800">"5+ years"</code>
                  <p className="text-xs text-gray-500 mt-1">Finds exact: 5+ years experience</p>
                </div>
              </div>
            </div>

            {/* Multiple Keywords */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                  <span className="text-orange-700">+</span>
                </div>
                <h4 className="text-sm text-gray-900">Multiple Keywords</h4>
              </div>
              <p className="text-xs text-gray-600 mb-3">Combine keywords with spaces (AND logic)</p>
              <div className="space-y-2">
                <div className="bg-gray-50 rounded p-2 border border-gray-200">
                  <code className="text-xs text-orange-600">react python aws</code>
                  <p className="text-xs text-gray-500 mt-1">Finds: Candidates with ALL 3 skills</p>
                </div>
                <div className="bg-gray-50 rounded p-2 border border-gray-200">
                  <code className="text-xs text-orange-600">john senior</code>
                  <p className="text-xs text-gray-500 mt-1">Finds: John + Senior level candidates</p>
                </div>
              </div>
            </div>
          </div>

          {/* Search Fields */}
          <div className="mt-4 bg-white rounded-lg border border-gray-200 p-4">
            <h4 className="text-sm text-gray-900 mb-3">Searchable Fields (High Accuracy)</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
              {[
                { label: 'Candidate Name', icon: '👤' },
                { label: 'Email Address', icon: '✉️' },
                { label: 'Phone Number', icon: '📱' },
                { label: 'Job Title', icon: '💼' },
                { label: 'Skills & Tech', icon: '⚡' },
                { label: 'Experience', icon: '📊' },
                { label: 'Resume Source', icon: '📁' },
                { label: 'All Fields', icon: '🔍' },
              ].map((field) => (
                <div key={field.label} className="flex items-center gap-2 text-xs text-gray-600">
                  <span>{field.icon}</span>
                  <span>{field.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Performance Note */}
          <div className="mt-4 bg-green-50 rounded-lg border border-green-200 p-3 flex items-start gap-3">
            <div className="w-6 h-6 bg-green-600 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs">⚡</span>
            </div>
            <div>
              <h4 className="text-sm text-green-900 mb-1">⚡ Low Latency Performance</h4>
              <p className="text-xs text-green-700">
                Search is debounced (300ms) for optimal performance even with large resume volumes (1000+ candidates).
                Results are returned instantly with high accuracy across all fields.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}