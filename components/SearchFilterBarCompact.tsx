'use client'

import { Search, Filter, X, ChevronDown, SlidersHorizontal, Calendar, MapPin, Building2, Clock, GraduationCap, Briefcase, HelpCircle, Info, ChevronRight, Upload, Users } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useDebounce } from '@/lib/hooks/useDebounce';

interface SearchFilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filters: any;
  onFiltersChange: (filters: any) => void;
  sortBy: string;
  onSortChange: (sort: string) => void;
}

export default function SearchFilterBarCompact({
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

  // Team mode disabled for now
  const teamMembers: any[] = [];
  const isTeamMode = false;
  
  // Accordion states for collapsible sections
  const [expandedSections, setExpandedSections] = useState<string[]>(['primary']);
  
  // Debounce search to improve performance
  const debouncedSearch = useDebounce(localSearchQuery, 300);

  useEffect(() => {
    onSearchChange(debouncedSearch);
  }, [debouncedSearch, onSearchChange]);

  useEffect(() => {
    setTempFilters(filters);
  }, [filters]);

  const activeFilterCount = Object.entries(filters).filter(([key, value]) => {
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

  const toggleSection = (section: string) => {
    setExpandedSections(prev => 
      prev.includes(section) 
        ? prev.filter(s => s !== section)
        : [...prev, section]
    );
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

  const sourceTypes = [
    'Manual Upload',
    'LinkedIn',
    'Job Board',
    'Referral',
    'Career Site',
    'Employee Database',
    'TalentFlow AI',
    'Other'
  ];

  // Active filter chips
  const getActiveFilterChips = () => {
    const chips: Array<{ label: string; onRemove: () => void }> = [];
    
    if (filters.skills?.length > 0) {
      chips.push({
        label: `${filters.skills.length} Skill${filters.skills.length !== 1 ? 's' : ''}`,
        onRemove: () => onFiltersChange({ ...filters, skills: [] })
      });
    }
    
    if (filters.experienceRange?.min || filters.experienceRange?.max) {
      const min = filters.experienceRange.min || 0;
      const max = filters.experienceRange.max || '∞';
      chips.push({
        label: `${min}-${max} years exp`,
        onRemove: () => onFiltersChange({ ...filters, experienceRange: null })
      });
    }
    
    if (filters.education) {
      chips.push({
        label: filters.education,
        onRemove: () => onFiltersChange({ ...filters, education: null })
      });
    }
    
    if (filters.location) {
      chips.push({
        label: `📍 ${filters.location}`,
        onRemove: () => onFiltersChange({ ...filters, location: null })
      });
    }
    
    if (filters.noticePeriod) {
      chips.push({
        label: `Notice: ${filters.noticePeriod}`,
        onRemove: () => onFiltersChange({ ...filters, noticePeriod: null })
      });
    }
    
    if (filters.uploadedBy) {
      chips.push({
        label: `👤 ${filters.uploadedBy}`,
        onRemove: () => onFiltersChange({ ...filters, uploadedBy: null })
      });
    }
    
    if (filters.sourceType) {
      chips.push({
        label: `📥 ${filters.sourceType}`,
        onRemove: () => onFiltersChange({ ...filters, sourceType: null })
      });
    }
    
    return chips;
  };

  return (
    <div className="bg-gray-50 p-4 rounded-t-lg">
      <div className="flex gap-3">
        {/* Global Search Bar */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search by name, email, phone, or skills..."
            value={localSearchQuery}
            onChange={(e) => setLocalSearchQuery(e.target.value)}
            className="w-full h-10 pl-10 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
          />
          {localSearchQuery && (
            <button
              onClick={() => {
                setLocalSearchQuery('');
                onSearchChange('');
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 hover:bg-gray-100 rounded-full p-1 transition-colors"
            >
              <X className="w-4 h-4 text-gray-500 hover:text-gray-700" />
            </button>
          )}
          {localSearchQuery && localSearchQuery !== debouncedSearch && (
            <div className="absolute right-12 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
        </div>

        {/* Advanced Filters Button */}
        <button
          onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
          className={`flex items-center gap-2 h-10 px-4 border rounded-md transition-colors ${
            activeFilterCount > 0
              ? 'border-blue-600 bg-blue-50 text-blue-600'
              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span className="hidden sm:inline">Filters</span>
          {activeFilterCount > 0 && (
            <span className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Sort Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowSort(!showSort)}
            className="flex items-center gap-2 h-10 px-4 border border-gray-300 bg-white rounded-md hover:bg-gray-50"
          >
            <span className="text-sm text-gray-700">Sort</span>
            <ChevronDown className="w-4 h-4 text-gray-500" />
          </button>

          {showSort && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowSort(false)}></div>
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20">
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
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${
                      sortBy === option.value ? 'text-blue-600 bg-blue-50' : 'text-gray-700'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Active Filter Chips */}
      {activeFilterCount > 0 && !showAdvancedFilters && (
        <div className="mt-3 flex flex-wrap gap-2">
          {getActiveFilterChips().map((chip, index) => (
            <div
              key={index}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-full text-sm"
            >
              <span>{chip.label}</span>
              <button
                onClick={chip.onRemove}
                className="hover:bg-blue-200 rounded-full p-0.5 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          <button
            onClick={handleClearFilters}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-full text-sm transition-colors"
          >
            <X className="w-3 h-3" />
            Clear all
          </button>
        </div>
      )}

      {/* Compact Advanced Filters Panel */}
      {showAdvancedFilters && (
        <div className="mt-4 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
          {/* Primary Filters - Always Visible */}
          <div className="p-4 bg-blue-50 border-b border-blue-100">
            <div className="grid grid-cols-2 gap-4">
              {/* Skills Filter - Compact */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-900 mb-2">
                  <Briefcase className="w-4 h-4 text-blue-600" />
                  Skills
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {availableSkills.slice(0, 8).map(skill => (
                    <button
                      key={skill}
                      onClick={() => handleSkillToggle(skill)}
                      className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                        (tempFilters.skills || []).includes(skill)
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-700 border border-gray-300 hover:border-blue-400'
                      }`}
                    >
                      {skill}
                    </button>
                  ))}
                  <button
                    onClick={() => toggleSection('more-skills')}
                    className="px-2.5 py-1 text-xs text-blue-600 hover:bg-blue-100 rounded-full border border-blue-300"
                  >
                    +{availableSkills.length - 8} more
                  </button>
                </div>
                {(tempFilters.skills || []).length > 0 && (
                  <div className="mt-1.5 text-xs text-blue-600">
                    {tempFilters.skills.length} selected
                  </div>
                )}
              </div>

              {/* Experience Range - Compact */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-900 mb-2">
                  <Clock className="w-4 h-4 text-blue-600" />
                  Experience
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: '0-2y', min: 0, max: 2 },
                    { label: '2-5y', min: 2, max: 5 },
                    { label: '5-10y', min: 5, max: 10 },
                    { label: '10+y', min: 10, max: 50 },
                  ].map(range => (
                    <button
                      key={range.label}
                      onClick={() => setTempFilters({
                        ...tempFilters,
                        experienceRange: { min: range.min, max: range.max }
                      })}
                      className={`px-2 py-1.5 text-xs rounded-md transition-colors ${
                        tempFilters.experienceRange?.min === range.min && tempFilters.experienceRange?.max === range.max
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-700 border border-gray-300 hover:border-blue-400'
                      }`}
                    >
                      {range.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* More Skills Section - Collapsible */}
          {expandedSections.includes('more-skills') && (
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <div className="flex flex-wrap gap-1.5">
                {availableSkills.slice(8).map(skill => (
                  <button
                    key={skill}
                    onClick={() => handleSkillToggle(skill)}
                    className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                      (tempFilters.skills || []).includes(skill)
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-700 border border-gray-300 hover:border-blue-400'
                    }`}
                  >
                    {skill}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Secondary Filters - Collapsible Accordion */}
          <div>
            {/* Location & Education Section */}
            <button
              onClick={() => toggleSection('location-education')}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors border-b border-gray-200"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                <MapPin className="w-4 h-4 text-gray-500" />
                <span>Location & Education</span>
                {(filters.location || filters.education) && (
                  <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">Active</span>
                )}
              </div>
              <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform ${expandedSections.includes('location-education') ? 'rotate-90' : ''}`} />
            </button>
            {expandedSections.includes('location-education') && (
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1.5">Location</label>
                    <input
                      type="text"
                      placeholder="e.g., San Francisco"
                      value={tempFilters.location || ''}
                      onChange={(e) => setTempFilters({ ...tempFilters, location: e.target.value })}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1.5">Education</label>
                    <select
                      value={tempFilters.education || ''}
                      onChange={(e) => setTempFilters({ ...tempFilters, education: e.target.value || null })}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      <option value="">Any</option>
                      {educationLevels.map(level => (
                        <option key={level} value={level}>{level}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Company & Notice Period Section */}
            <button
              onClick={() => toggleSection('company-notice')}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors border-b border-gray-200"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                <Building2 className="w-4 h-4 text-gray-500" />
                <span>Company & Notice Period</span>
                {(filters.currentCompany || filters.previousCompany || filters.noticePeriod) && (
                  <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">Active</span>
                )}
              </div>
              <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform ${expandedSections.includes('company-notice') ? 'rotate-90' : ''}`} />
            </button>
            {expandedSections.includes('company-notice') && (
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1.5">Current Company</label>
                    <input
                      type="text"
                      placeholder="e.g., Google"
                      value={tempFilters.currentCompany || ''}
                      onChange={(e) => setTempFilters({ ...tempFilters, currentCompany: e.target.value })}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1.5">Previous Company</label>
                    <input
                      type="text"
                      placeholder="e.g., Amazon"
                      value={tempFilters.previousCompany || ''}
                      onChange={(e) => setTempFilters({ ...tempFilters, previousCompany: e.target.value })}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-600 mb-1.5">Notice Period</label>
                    <select
                      value={tempFilters.noticePeriod || ''}
                      onChange={(e) => setTempFilters({ ...tempFilters, noticePeriod: e.target.value || null })}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      <option value="">Any</option>
                      {noticePeriods.map(period => (
                        <option key={period} value={period}>{period}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Date Filters Section */}
            <button
              onClick={() => toggleSection('dates')}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors border-b border-gray-200"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                <Calendar className="w-4 h-4 text-gray-500" />
                <span>Date Filters</span>
                {(filters.uploadDateRange || filters.lastUpdatedRange) && (
                  <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">Active</span>
                )}
              </div>
              <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform ${expandedSections.includes('dates') ? 'rotate-90' : ''}`} />
            </button>
            {expandedSections.includes('dates') && (
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1.5">Upload Date Range</label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={tempFilters.uploadDateRange?.start || ''}
                        onChange={(e) => setTempFilters({
                          ...tempFilters,
                          uploadDateRange: { ...tempFilters.uploadDateRange, start: e.target.value }
                        })}
                        className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                        placeholder="From"
                      />
                      <input
                        type="date"
                        value={tempFilters.uploadDateRange?.end || ''}
                        onChange={(e) => setTempFilters({
                          ...tempFilters,
                          uploadDateRange: { ...tempFilters.uploadDateRange, end: e.target.value }
                        })}
                        className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                        placeholder="To"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Uploaded By & Source Type Section */}
            <button
              onClick={() => toggleSection('upload-source')}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors border-b border-gray-200"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                <Upload className="w-4 h-4 text-gray-500" />
                <span>Uploaded By & Source Type</span>
                {(filters.uploadedBy || filters.sourceType) && (
                  <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">Active</span>
                )}
              </div>
              <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform ${expandedSections.includes('upload-source') ? 'rotate-90' : ''}`} />
            </button>
            {expandedSections.includes('upload-source') && (
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1.5">Uploaded By</label>
                    <select
                      value={tempFilters.uploadedBy || ''}
                      onChange={(e) => setTempFilters({ ...tempFilters, uploadedBy: e.target.value || null })}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      <option value="">Any Team Member</option>
                      {teamMembers.map(member => (
                        <option key={member.id} value={member.name}>{member.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1.5">Source Type</label>
                    <select
                      value={tempFilters.sourceType || ''}
                      onChange={(e) => setTempFilters({ ...tempFilters, sourceType: e.target.value || null })}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      <option value="">Any Source</option>
                      {sourceTypes.map(source => (
                        <option key={source} value={source}>{source}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
            <div className="text-sm text-gray-600">
              {activeFilterCount > 0 ? (
                <span className="text-blue-600 font-medium">
                  {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active
                </span>
              ) : (
                <span>No filters applied</span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleClearFilters}
                className="px-4 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
              >
                Clear All
              </button>
              <button
                onClick={handleApplyFilters}
                className="px-6 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}