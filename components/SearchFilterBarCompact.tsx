'use client'

import { Search, X, ChevronDown, SlidersHorizontal, Calendar, MapPin, Building2, Clock, GraduationCap, Briefcase, ChevronRight, Upload, Users, Loader2 } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

interface SearchFilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filters: any;
  onFiltersChange: (filters: any) => void;
  sortBy: string;
  onSortChange: (sort: string) => void;
  hideSearch?: boolean;
  inline?: boolean;
  showClearAllFilters?: boolean;
}

export default function SearchFilterBarCompact({
  searchQuery,
  onSearchChange,
  filters,
  onFiltersChange,
  sortBy,
  onSortChange,
  hideSearch = false,
  inline = false,
  showClearAllFilters = true,
}: SearchFilterBarProps) {
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [tempFilters, setTempFilters] = useState(filters);
  const filterPanelRef = useRef<HTMLDivElement>(null);

  // Accordion states for collapsible sections
  const [expandedSections, setExpandedSections] = useState<string[]>([]);

  // No local copy and no debounce here any more: the owning page runs the search
  // through `useListSearch`, which holds the typed value and hands the settled
  // one to the fetch. Debouncing in both places just stacked the delays.

  useEffect(() => {
    setTempFilters(filters);
  }, [filters]);

  // Close filter panel on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterPanelRef.current && !filterPanelRef.current.contains(event.target as Node)) {
        setShowAdvancedFilters(false);
      }
    };

    if (showAdvancedFilters) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAdvancedFilters]);

    // `filters` is typed `any`, but Object.entries widens each value to `unknown`,
    // so the property reads below (.min/.max/.start/.end) failed to compile. The
    // explicit tuple annotation restores the `any` these values already had.
  const activeFilterCount = Object.entries(filters).filter(([key, value]: [string, any]) => {
    if (key === 'skills') return false; // Skills filter removed
    if (key === 'experienceRange') return value && (value.min !== undefined || value.max !== undefined);
    if (key === 'uploadDateRange') return value && (value.start || value.end);
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
    // Reset the search box too. job-openings' clearAllFilters() clears the search
    // as well; leaving it set here meant "Clear all" appeared to do nothing when
    // the results were actually still narrowed by the search text.
    onSearchChange('');
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev =>
      prev.includes(section)
        ? prev.filter(s => s !== section)
        : [...prev, section]
    );
  };

  const educationLevels = [
    'Any',
    'High School',
    'Associate Degree',
    "Bachelor's Degree",
    "Master's Degree",
    'Doctorate (PhD)',
    'Professional Certification'
  ];

  // Map display values to backend filter codes
  const mapEducationToBackendCode = (displayValue: string): string | null => {
    if (!displayValue || displayValue === 'Any') return null;

    const mapping: Record<string, string> = {
      "Bachelor's Degree": "bachelors",
      "Master's Degree": "masters",
      "Doctorate (PhD)": "doctorate",
      "Associate Degree": "associate",
      "High School": "diploma",
      "Professional Certification": "certification"
    };

    return mapping[displayValue] || displayValue;
  };

  // Map backend codes back to display values
  const mapBackendCodeToDisplay = (backendCode: string | null | undefined): string => {
    if (!backendCode) return 'Any';

    const reverseMapping: Record<string, string> = {
      "bachelors": "Bachelor's Degree",
      "masters": "Master's Degree",
      "doctorate": "Doctorate (PhD)",
      "associate": "Associate Degree",
      "diploma": "High School",
      "certification": "Professional Certification"
    };

    return reverseMapping[backendCode] || backendCode;
  };

  const noticePeriods = [
    'Any',
    'Immediate',
    '15 Days',
    '30 Days',
    '45 Days',
    '60 Days',
    '90 Days'
  ];

  const sourceTypes = [
    { value: '', label: 'Any Source' },
    { value: 'manual_upload', label: 'Manual Upload' },
    { value: 'bulk_upload', label: 'Bulk Upload' },
    { value: 'api_import', label: 'API Import' },
    { value: 'ai_match', label: 'AI Match' },
    { value: 'LinkedIn', label: 'LinkedIn' },
    { value: 'Job Board', label: 'Job Board' },
    { value: 'Referral', label: 'Referral' },
    { value: 'Career Site', label: 'Career Site' },
    { value: 'Employee Database', label: 'Employee Database' },
    { value: 'TalentFlow AI', label: 'TalentFlow AI' },
    { value: 'Other', label: 'Other' }
  ];

  // Active filter chips
  const getActiveFilterChips = () => {
    const chips: Array<{ label: string; key: string; onRemove: () => void }> = [];

    if (filters.experienceRange?.min !== undefined || filters.experienceRange?.max !== undefined) {
      const min = filters.experienceRange.min ?? 0;
      const max = filters.experienceRange.max ?? '∞';
      chips.push({
        label: `${min}-${max} years`,
        key: 'experience',
        onRemove: () => onFiltersChange({ ...filters, experienceRange: null })
      });
    }

    if (filters.education && filters.education !== 'Any') {
      chips.push({
        label: mapBackendCodeToDisplay(filters.education),
        key: 'education',
        onRemove: () => onFiltersChange({ ...filters, education: null })
      });
    }

    if (filters.location) {
      chips.push({
        label: filters.location,
        key: 'location',
        onRemove: () => onFiltersChange({ ...filters, location: null })
      });
    }

    if (filters.currentCompany) {
      chips.push({
        label: `Company: ${filters.currentCompany}`,
        key: 'currentCompany',
        onRemove: () => onFiltersChange({ ...filters, currentCompany: null })
      });
    }

    if (filters.noticePeriod && filters.noticePeriod !== 'Any') {
      chips.push({
        label: `Notice: ${filters.noticePeriod}`,
        key: 'noticePeriod',
        onRemove: () => onFiltersChange({ ...filters, noticePeriod: null })
      });
    }

    if (filters.sourceType) {
      const sourceLabel = sourceTypes.find(s => s.value === filters.sourceType)?.label || filters.sourceType;
      chips.push({
        label: sourceLabel,
        key: 'sourceType',
        onRemove: () => onFiltersChange({ ...filters, sourceType: null })
      });
    }

    if (filters.uploadedBy) {
      chips.push({
        label: `By: ${filters.uploadedBy}`,
        key: 'uploadedBy',
        onRemove: () => onFiltersChange({ ...filters, uploadedBy: null })
      });
    }

    if (filters.uploadDateRange?.start || filters.uploadDateRange?.end) {
      const start = filters.uploadDateRange?.start || '';
      const end = filters.uploadDateRange?.end || '';
      chips.push({
        label: `Date: ${start}${start && end ? ' - ' : ''}${end}`,
        key: 'uploadDateRange',
        onRemove: () => onFiltersChange({ ...filters, uploadDateRange: null })
      });
    }

    return chips;
  };

  return (
    <div className={inline ? "relative" : "bg-white border-b border-gray-200"}>
      {/* Main Search Bar */}
      <div className={inline ? "flex gap-2 items-center" : "p-3 flex gap-2 items-center"}>
        {/* Global Search Bar */}
        {!hideSearch ? (
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, email, phone, skills, title, or company..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full h-9 pl-9 pr-9 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-transparent transition-all bg-gray-50 hover:bg-white text-black placeholder:text-gray-400"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  onSearchChange('');
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 hover:bg-gray-200 rounded-full p-1 transition-colors"
               aria-label="Close">
                <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
              </button>
            )}
          </div>
        ) : !inline ? (
          <div className="hidden sm:block flex-1" />
        ) : null}

        {/* Filter Button */}
        <div className="relative" ref={filterPanelRef}>
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`flex items-center gap-1.5 ${inline ? 'h-10' : 'h-9'} px-3 rounded-lg font-medium text-sm transition-all ${
              activeFilterCount > 0
                ? 'bg-brand-blue hover:bg-brand-blue-2 text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10'
                : 'bg-slate-100 text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue border border-gray-200'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">{inline ? 'Filter' : 'Filters'}</span>
            {activeFilterCount > 0 && (
              <span className="bg-white text-brand-blue text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Filter Panel - Matching Screenshot Layout */}
          {showAdvancedFilters && (
            <div className="fixed inset-x-2 sm:inset-x-auto bottom-2 sm:bottom-auto sm:absolute sm:right-0 sm:top-12 sm:w-[500px] md:w-[700px] bg-white rounded-xl sm:rounded-lg shadow-2xl border border-gray-200 z-50 overflow-hidden max-h-[80dvh] sm:max-h-[600px] flex flex-col">
              <div className="flex-1 overflow-y-auto">
                {/* Experience Row */}
                <div className="p-3 sm:p-5 border-b border-gray-100">
                  <div>
                    {/* Experience */}
                    <div>
                      <label className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-900 mb-2 sm:mb-3">
                        <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-blue" />
                        Experience
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                            className={`px-3 py-2 text-xs sm:text-sm rounded-lg border transition-all ${
                              tempFilters.experienceRange?.min === range.min && tempFilters.experienceRange?.max === range.max
                                ? 'bg-brand-blue text-white border-brand-blue shadow-sm shadow-brand-blue/25 ring-1 ring-white/10'
                                : 'bg-white text-gray-700 border-gray-200 hover:border-brand-blue/40 hover:bg-brand-blue/[0.02]'
                            }`}
                          >
                            {range.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Location & Education Section */}
                <div className="border-b border-gray-100">
                  <button
                    onClick={() => toggleSection('location-education')}
                    className="w-full px-3 sm:px-5 py-2.5 sm:py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-900">
                      <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
                      <span>Location & Education</span>
                      {(tempFilters.location || (tempFilters.education && tempFilters.education !== 'Any')) && (
                        <span className="text-xs bg-brand-blue/10 text-brand-blue px-2 py-0.5 rounded-full ring-1 ring-brand-blue/20">Active</span>
                      )}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${expandedSections.includes('location-education') ? 'rotate-180' : ''}`} />
                  </button>
                  {expandedSections.includes('location-education') && (
                    <div className="px-3 sm:px-5 pb-3 sm:pb-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4">
                        <div>
                          <label className="block text-[10px] sm:text-xs text-gray-600 mb-1 sm:mb-1.5">Location</label>
                          <input
                            type="text"
                            placeholder="e.g., San Francisco"
                            value={tempFilters.location || ''}
                            onChange={(e) => setTempFilters({ ...tempFilters, location: e.target.value || null })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 bg-gray-50 text-black placeholder:text-gray-400"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] sm:text-xs text-gray-600 mb-1 sm:mb-1.5">Education</label>
                          <select
                            value={mapBackendCodeToDisplay(tempFilters.education)}
                            onChange={(e) => {
                              const backendCode = mapEducationToBackendCode(e.target.value);
                              setTempFilters({ ...tempFilters, education: backendCode });
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 bg-gray-50 text-black"
                          >
                            {educationLevels.map(level => (
                              <option key={level} value={level}>{level}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Current Company & Notice Period Section */}
                <div className="border-b border-gray-100">
                  <button
                    onClick={() => toggleSection('company-notice')}
                    className="w-full px-3 sm:px-5 py-2.5 sm:py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-900">
                      <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
                      <span>Company & Notice Period</span>
                      {(tempFilters.currentCompany || (tempFilters.noticePeriod && tempFilters.noticePeriod !== 'Any')) && (
                        <span className="text-xs bg-brand-blue/10 text-brand-blue px-2 py-0.5 rounded-full ring-1 ring-brand-blue/20">Active</span>
                      )}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${expandedSections.includes('company-notice') ? 'rotate-180' : ''}`} />
                  </button>
                  {expandedSections.includes('company-notice') && (
                    <div className="px-3 sm:px-5 pb-3 sm:pb-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4">
                        <div>
                          <label className="block text-[10px] sm:text-xs text-gray-600 mb-1 sm:mb-1.5">Current Company</label>
                          <input
                            type="text"
                            placeholder="e.g., Google"
                            value={tempFilters.currentCompany || ''}
                            onChange={(e) => setTempFilters({ ...tempFilters, currentCompany: e.target.value || null })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 bg-gray-50 text-black placeholder:text-gray-400"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] sm:text-xs text-gray-600 mb-1 sm:mb-1.5">Notice Period</label>
                          <select
                            value={tempFilters.noticePeriod || 'Any'}
                            onChange={(e) => setTempFilters({ ...tempFilters, noticePeriod: e.target.value === 'Any' ? null : e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 bg-gray-50 text-black"
                          >
                            {noticePeriods.map(period => (
                              <option key={period} value={period}>{period}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Date Filters Section */}
                <div className="border-b border-gray-100">
                  <button
                    onClick={() => toggleSection('dates')}
                    className="w-full px-3 sm:px-5 py-2.5 sm:py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-900">
                      <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
                      <span>Date Filters</span>
                      {(tempFilters.uploadDateRange?.start || tempFilters.uploadDateRange?.end) && (
                        <span className="text-xs bg-brand-blue/10 text-brand-blue px-2 py-0.5 rounded-full ring-1 ring-brand-blue/20">Active</span>
                      )}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${expandedSections.includes('dates') ? 'rotate-180' : ''}`} />
                  </button>
                  {expandedSections.includes('dates') && (
                    <div className="px-3 sm:px-5 pb-3 sm:pb-4">
                      <label className="block text-[10px] sm:text-xs text-gray-600 mb-1 sm:mb-1.5">Upload Date Range</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4">
                        <input
                          type="date"
                          value={tempFilters.uploadDateRange?.start || ''}
                          onChange={(e) => setTempFilters({
                            ...tempFilters,
                            uploadDateRange: { ...tempFilters.uploadDateRange, start: e.target.value || null }
                          })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 bg-gray-50 text-black"
                          placeholder="dd-mm-yyyy"
                        />
                        <input
                          type="date"
                          value={tempFilters.uploadDateRange?.end || ''}
                          onChange={(e) => setTempFilters({
                            ...tempFilters,
                            uploadDateRange: { ...tempFilters.uploadDateRange, end: e.target.value || null }
                          })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 bg-gray-50 text-black"
                          placeholder="dd-mm-yyyy"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Uploaded By & Source Type Section */}
                <div className="border-b border-gray-100">
                  <button
                    onClick={() => toggleSection('upload-source')}
                    className="w-full px-3 sm:px-5 py-2.5 sm:py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-900">
                      <Upload className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
                      <span>Uploaded By & Source</span>
                      {(tempFilters.uploadedBy || tempFilters.sourceType) && (
                        <span className="text-xs bg-brand-blue/10 text-brand-blue px-2 py-0.5 rounded-full ring-1 ring-brand-blue/20">Active</span>
                      )}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${expandedSections.includes('upload-source') ? 'rotate-180' : ''}`} />
                  </button>
                  {expandedSections.includes('upload-source') && (
                    <div className="px-3 sm:px-5 pb-3 sm:pb-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4">
                        <div>
                          <label className="block text-[10px] sm:text-xs text-gray-600 mb-1 sm:mb-1.5">Uploaded By</label>
                          <input
                            type="text"
                            placeholder="Enter name..."
                            value={tempFilters.uploadedBy || ''}
                            onChange={(e) => setTempFilters({ ...tempFilters, uploadedBy: e.target.value || null })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 bg-gray-50 text-black placeholder:text-gray-400"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] sm:text-xs text-gray-600 mb-1 sm:mb-1.5">Source Type</label>
                          <select
                            value={tempFilters.sourceType || ''}
                            onChange={(e) => setTempFilters({ ...tempFilters, sourceType: e.target.value || null })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 bg-gray-50 text-black"
                          >
                            {sourceTypes.map(source => (
                              <option key={source.value} value={source.value}>{source.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-5 py-3 sm:py-4 bg-slate-50 border-t border-gray-100">
                <div className="text-xs sm:text-sm text-brand-blue">
                  {activeFilterCount > 0 ? (
                    <span>{activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} applied</span>
                  ) : (
                    <span className="text-gray-500">No filters applied</span>
                  )}
                </div>
                {/* Commit button only — matches job-openings, where the panel
                    confirms and the Clear control lives outside it. The second
                    "Clear All" that used to sit here duplicated the "Clear all"
                    in the active-filter chips row below. */}
                <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
                  <button
                    onClick={handleApplyFilters}
                    className="flex-1 sm:flex-none px-4 sm:px-6 py-2 text-xs sm:text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-all font-medium shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
                  >
                    Apply Filters
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sort Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowSort(!showSort)}
            className={`flex items-center gap-1.5 ${inline ? 'h-10' : 'h-9'} px-3 bg-slate-100 border border-gray-200 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors`}
          >
            <span className="hidden sm:inline text-sm text-gray-700 font-medium">{inline ? 'Sort by' : 'Sort'}</span>
            <ChevronDown className="w-4 h-4 text-gray-500" />
          </button>

          {showSort && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowSort(false)}></div>
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] py-2 z-20">
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
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-brand-blue/5 transition-colors ${
                      sortBy === option.value ? 'text-brand-blue bg-brand-blue/10 font-medium' : 'text-gray-700'
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
      {activeFilterCount > 0 && (
        <div className={inline ? "mt-2 flex flex-wrap gap-1.5 sm:gap-2 items-center" : "px-3 sm:px-4 pb-3 sm:pb-4 flex flex-wrap gap-1.5 sm:gap-2 items-center"}>
          <span className="text-xs sm:text-sm text-gray-500 mr-1">Active filters:</span>
          {getActiveFilterChips().map((chip) => (
            <div
              key={chip.key}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-brand-blue/5 text-brand-blue rounded-full text-xs ring-1 ring-brand-blue/20"
            >
              <span className="truncate max-w-[120px] sm:max-w-none">{chip.label}</span>
              <button
                onClick={chip.onRemove}
                className="hover:bg-brand-blue/10 rounded-full p-0.5 transition-colors flex-shrink-0"
               aria-label="Close">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {showClearAllFilters && (
            <button
              onClick={handleClearFilters}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-red-600 hover:bg-red-50 rounded-full text-xs transition-colors ml-1 sm:ml-2"
            >
              <X className="w-3 h-3" />
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
