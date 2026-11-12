'use client'

import { Search, X, ChevronDown, SlidersHorizontal, Calendar, MapPin, Building2, Clock, GraduationCap, Briefcase, ChevronRight, Upload, Users, Loader2 } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { DateField } from '@/components/ui/date-field';
import FilterSelect from '@/components/ui/filter-select';
import { ToolbarResetButton } from '@/components/ui/list-toolbar';
import { FilterChipsHover, FilterChipsPanelLine, type FilterChip } from '@/components/ui/filter-chips';

// Labels the filter panel shows for each stored value — shared by the panel
// and the active-filter tags so a tag reads exactly like the option picked.
const EDUCATION_CODE_LABELS: Record<string, string> = {
  bachelors: "Bachelor's Degree",
  masters: "Master's Degree",
  doctorate: 'Doctorate (PhD)',
  associate: 'Associate Degree',
  diploma: 'High School',
  certification: 'Professional Certification',
};
const SOURCE_TYPE_LABELS: Record<string, string> = {
  manual_upload: 'Manual Upload',
  bulk_upload: 'Bulk Upload',
  api_import: 'API Import',
  ai_match: 'AI Match',
};
const FILTER_KEY_LABELS: Record<string, string> = {
  experienceRange: 'Experience',
  education: 'Education',
  location: 'Location',
  currentCompany: 'Company',
  noticePeriod: 'Notice Period',
  sourceType: 'Source',
  uploadedBy: 'Uploaded By',
  uploadDateRange: 'Upload Date',
};
const formatChipDate = (v: string) => {
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

/**
 * One tag per filter the Filter button's badge counts (same rule as
 * `activeFilterCount` below), so the badge and the tags always agree. Exported
 * so a page that adds tags of its own can pass the full list as `filterChips`.
 */
export function getResumeFilterChips(filters: any, onFiltersChange: (filters: any) => void): FilterChip[] {
  const chips: FilterChip[] = [];
  Object.entries(filters || {}).forEach(([key, value]: [string, any]) => {
    if (key === 'skills') return;
    const onRemove = () => onFiltersChange({ ...filters, [key]: null });
    const label = FILTER_KEY_LABELS[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
    if (key === 'experienceRange') {
      if (!value || (value.min === undefined && value.max === undefined)) return;
      const min = value.min ?? 0;
      const max = value.max ?? '∞';
      chips.push({ key, label, value: `${min}-${max} years`, onRemove });
      return;
    }
    if (key === 'uploadDateRange') {
      if (!value || !(value.start || value.end)) return;
      const start = value.start ? formatChipDate(value.start) : '';
      const end = value.end ? formatChipDate(value.end) : '';
      chips.push({ key, label, value: start && end ? `${start} – ${end}` : start ? `From ${start}` : `Until ${end}`, onRemove });
      return;
    }
    if (value === null || value === undefined || value === '') return;
    let display: string;
    if (key === 'education') display = EDUCATION_CODE_LABELS[value] ?? String(value);
    else if (key === 'sourceType') display = SOURCE_TYPE_LABELS[value] ?? String(value);
    else if (typeof value === 'object') display = Array.isArray(value) ? value.join(', ') : JSON.stringify(value);
    else display = String(value);
    chips.push({ key, label, value: display, onRemove });
  });
  return chips;
}

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
  /** The active filter tags (hover popup on the Filter button at lg+, last line
   *  of the filter panel below lg). Defaults to `getResumeFilterChips`; a page
   *  with extra filters of its own passes the full list. */
  filterChips?: FilterChip[];
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
  filterChips,
}: SearchFilterBarProps) {
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  /* From sm up the panel hangs off the Filter button's right edge. Where that
     button sits at the LEFT of its toolbar (My Resumes) a 500–700px panel ran
     off the left of the screen, so on open it is measured and, if it would,
     anchored to the button's left instead (pulled back in if that overflows
     the right). null = default right anchoring; phones use the bottom sheet. */
  const [filterPanelLeft, setFilterPanelLeft] = useState<number | null>(null);
  const placeFilterPanel = () => {
    const anchor = filterPanelRef.current;
    const vw = window.innerWidth;
    if (!anchor || vw < 640) { setFilterPanelLeft(null); return; }
    const r = anchor.getBoundingClientRect();
    const w = Math.min(vw >= 768 ? 700 : 500, vw - 32);
    setFilterPanelLeft(r.right - w < 16 ? Math.min(0, vw - 16 - (r.left + w)) : null);
  };

  // Accordion states for collapsible sections
  const [expandedSections, setExpandedSections] = useState<string[]>([]);

  // No local copy and no debounce here any more: the owning page runs the search
  // through `useListSearch`, which holds the typed value and hands the settled
  // one to the fetch. Debouncing in both places just stacked the delays.

  // Close filter panel on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (filterPanelRef.current && filterPanelRef.current.contains(target)) return;
      // The date-range picker (DateField) renders its calendar through a Radix
      // portal attached to document.body, so it's outside filterPanelRef in the
      // real DOM even though it's logically part of this panel. Without this
      // check, mousedown-ing a calendar day reads as an outside click and closes
      // the whole filter panel before the date selection can register.
      if (target instanceof Element && target.closest('[data-radix-popper-content-wrapper]')) {
        return;
      }
      setShowAdvancedFilters(false);
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

  const handleClearFilters = () => {
    onFiltersChange({});
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

  // Active filter tags — one per counted filter (see getResumeFilterChips).
  const activeFilterChips = filterChips ?? getResumeFilterChips(filters, onFiltersChange);
  // The Filter button's number = the tags it shows (incl. a page's own extra tags,
  // e.g. My Resumes' Folder), so the badge and the tags always agree.
  const filterBadgeCount = activeFilterChips.length;

  return (
    <div className={inline ? "relative" : "bg-white border-b border-gray-200"}>
      {/* Main Search Bar */}
      <div className={inline ? "flex gap-2 items-center" : "py-3 flex gap-2 items-center"}>
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
        <div className="relative flex items-center gap-2" ref={filterPanelRef}>
          {/* Active filter tags: a popup on hovering Filter (laptop / desktop). */}
          <FilterChipsHover chips={activeFilterChips}>
          <button
            onClick={() => {
              if (!showAdvancedFilters) placeFilterPanel();
              setShowAdvancedFilters(!showAdvancedFilters);
            }}
            className={`flex items-center gap-1.5 ${inline ? 'h-10' : 'h-9'} px-3 rounded-lg font-medium text-sm transition-all ${
              filterBadgeCount > 0
                ? 'bg-brand-blue hover:bg-brand-blue-2 text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10'
                : 'bg-slate-100 text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue border border-gray-200'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">{inline ? 'Filter' : 'Filters'}</span>
            {filterBadgeCount > 0 && (
              <span className="bg-white text-brand-blue text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {filterBadgeCount}
              </span>
            )}
          </button>
          </FilterChipsHover>
          {/* Reset — beside Filter, as on Job Openings: the search, every panel filter
              and any extra tag the page adds (e.g. My Resumes' Folder). */}
          {(filterBadgeCount > 0 || !!searchQuery) && (
            <ToolbarResetButton
              onClick={() => {
                const own = new Set(getResumeFilterChips(filters, () => {}).map((c) => c.key));
                const extras = activeFilterChips.filter((c) => !own.has(c.key));
                handleClearFilters();
                extras.forEach((c) => c.onRemove());
              }}
            />
          )}

          {/* Filter Panel - Matching Screenshot Layout */}
          {showAdvancedFilters && (
            <div className="fixed inset-x-2 sm:inset-x-auto bottom-2 sm:bottom-auto sm:absolute sm:right-0 sm:top-12 sm:w-[500px] md:w-[700px] sm:max-w-[calc(100vw-2rem)] bg-white rounded-xl sm:rounded-lg shadow-2xl border border-gray-200 z-50 overflow-hidden max-h-[80dvh] sm:max-h-[600px] flex flex-col"
              style={filterPanelLeft !== null ? { left: filterPanelLeft, right: 'auto' } : undefined}>
              <div className="flex-1 overflow-y-auto">
                {/* Experience Row */}
                <div className="p-3 sm:p-5 border-b border-gray-100">
                  <div>
                    {/* Experience */}
                    <div>
                      <label className="flex items-center gap-2 tf-row-title mb-2 sm:mb-3">
                        <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-blue" />
                        Experience
                      </label>
                      <div className="tf-grid-stats">
                        {[
                          { label: '0-2y', min: 0, max: 2 },
                          { label: '2-5y', min: 2, max: 5 },
                          { label: '5-10y', min: 5, max: 10 },
                          { label: '10+y', min: 10, max: 50 },
                        ].map(range => (
                          <button
                            key={range.label}
                            onClick={() => onFiltersChange({
                              ...filters,
                              experienceRange: { min: range.min, max: range.max }
                            })}
                            className={`px-3 py-2 text-sm rounded-lg border transition-all ${
                              filters.experienceRange?.min === range.min && filters.experienceRange?.max === range.max
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
                    <div className="flex items-center gap-2 tf-row-title">
                      <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
                      <span>Location & Education</span>
                      {(filters.location || (filters.education && filters.education !== 'Any')) && (
                        <span className="tf-badge bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">Active</span>
                      )}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${expandedSections.includes('location-education') ? 'rotate-180' : ''}`} />
                  </button>
                  {expandedSections.includes('location-education') && (
                    <div className="px-3 sm:px-5 pb-3 sm:pb-4">
                      <div className="tf-grid-2">
                        <div>
                          <label className="block tf-meta mb-1 sm:mb-1.5">Location</label>
                          <input
                            type="text"
                            placeholder="e.g., San Francisco"
                            value={filters.location || ''}
                            onChange={(e) => onFiltersChange({ ...filters, location: e.target.value || null })}
                            className="w-full px-3 h-9 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 bg-gray-50 text-black placeholder:text-gray-400"
                          />
                        </div>
                        <div>
                          <label className="block tf-meta mb-1 sm:mb-1.5">Education</label>
                          <FilterSelect
                            value={mapBackendCodeToDisplay(filters.education)}
                            onChange={(v) => {
                              const backendCode = mapEducationToBackendCode(v);
                              onFiltersChange({ ...filters, education: backendCode });
                            }}
                            ariaLabel="Education"
                            options={educationLevels.map(level => ({ value: level, label: level }))}
                            className="w-full sm:w-full py-2 sm:py-2 pl-3 sm:pl-3 pr-3 sm:pr-3 rounded-lg sm:rounded-lg border-gray-300 bg-gray-50 text-sm text-black"
                          />
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
                    <div className="flex items-center gap-2 tf-row-title">
                      <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
                      <span>Company & Notice Period</span>
                      {(filters.currentCompany || (filters.noticePeriod && filters.noticePeriod !== 'Any')) && (
                        <span className="tf-badge bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">Active</span>
                      )}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${expandedSections.includes('company-notice') ? 'rotate-180' : ''}`} />
                  </button>
                  {expandedSections.includes('company-notice') && (
                    <div className="px-3 sm:px-5 pb-3 sm:pb-4">
                      <div className="tf-grid-2">
                        <div>
                          <label className="block tf-meta mb-1 sm:mb-1.5">Current Company</label>
                          <input
                            type="text"
                            placeholder="e.g., Google"
                            value={filters.currentCompany || ''}
                            onChange={(e) => onFiltersChange({ ...filters, currentCompany: e.target.value || null })}
                            className="w-full px-3 h-9 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 bg-gray-50 text-black placeholder:text-gray-400"
                          />
                        </div>
                        <div>
                          <label className="block tf-meta mb-1 sm:mb-1.5">Notice Period</label>
                          <FilterSelect
                            value={filters.noticePeriod || 'Any'}
                            onChange={(v) => onFiltersChange({ ...filters, noticePeriod: v === 'Any' ? null : v })}
                            ariaLabel="Notice Period"
                            options={noticePeriods.map(period => ({ value: period, label: period }))}
                            className="w-full sm:w-full py-2 sm:py-2 pl-3 sm:pl-3 pr-3 sm:pr-3 rounded-lg sm:rounded-lg border-gray-300 bg-gray-50 text-sm text-black"
                          />
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
                    <div className="flex items-center gap-2 tf-row-title">
                      <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
                      <span>Date Filters</span>
                      {(filters.uploadDateRange?.start || filters.uploadDateRange?.end) && (
                        <span className="tf-badge bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">Active</span>
                      )}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${expandedSections.includes('dates') ? 'rotate-180' : ''}`} />
                  </button>
                  {expandedSections.includes('dates') && (
                    <div className="px-3 sm:px-5 pb-3 sm:pb-4">
                      <label className="block tf-meta mb-1 sm:mb-1.5">Upload Date Range</label>
                      <div className="tf-grid-2">
                        <DateField
                          aria-label="Upload date from"
                          value={filters.uploadDateRange?.start || ''}
                          onChange={(v) => onFiltersChange({
                            ...filters,
                            uploadDateRange: { ...filters.uploadDateRange, start: v || null }
                          })}
                        />
                        <DateField
                          aria-label="Upload date to"
                          value={filters.uploadDateRange?.end || ''}
                          onChange={(v) => onFiltersChange({
                            ...filters,
                            uploadDateRange: { ...filters.uploadDateRange, end: v || null }
                          })}
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
                    <div className="flex items-center gap-2 tf-row-title">
                      <Upload className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
                      <span>Uploaded By & Source</span>
                      {(filters.uploadedBy || filters.sourceType) && (
                        <span className="tf-badge bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">Active</span>
                      )}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${expandedSections.includes('upload-source') ? 'rotate-180' : ''}`} />
                  </button>
                  {expandedSections.includes('upload-source') && (
                    <div className="px-3 sm:px-5 pb-3 sm:pb-4">
                      <div className="tf-grid-2">
                        <div>
                          <label className="block tf-meta mb-1 sm:mb-1.5">Uploaded By</label>
                          <input
                            type="text"
                            placeholder="Enter name..."
                            value={filters.uploadedBy || ''}
                            onChange={(e) => onFiltersChange({ ...filters, uploadedBy: e.target.value || null })}
                            className="w-full px-3 h-9 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 bg-gray-50 text-black placeholder:text-gray-400"
                          />
                        </div>
                        <div>
                          <label className="block tf-meta mb-1 sm:mb-1.5">Source Type</label>
                          <FilterSelect
                            value={filters.sourceType || ''}
                            onChange={(v) => onFiltersChange({ ...filters, sourceType: v || null })}
                            ariaLabel="Source Type"
                            options={sourceTypes}
                            className="w-full sm:w-full py-2 sm:py-2 pl-3 sm:pl-3 pr-3 sm:pr-3 rounded-lg sm:rounded-lg border-gray-300 bg-gray-50 text-sm text-black"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Active filter tags as the panel's last line — phones / tablets only. */}
                <FilterChipsPanelLine
                  chips={activeFilterChips}
                  className="mt-0 border-t-0 px-3 sm:px-5 pb-3 sm:pb-5"
                />
              </div>

              {/* Footer */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-5 py-3 sm:py-4 bg-slate-50 border-t border-gray-100">
                <div className="text-sm text-brand-blue">
                  {activeFilterCount > 0 ? (
                    <span>{activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} applied</span>
                  ) : (
                    <span className="text-gray-500">No filters applied</span>
                  )}
                </div>
                {/* No Apply / Clear buttons — as on Job Openings, every control
                    above commits as it changes and the Reset beside the Filter
                    button clears them. */}
              </div>
            </div>
          )}
        </div>

        {/* Sort Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowSort(!showSort)}
            aria-label={inline ? 'Sort by' : 'Sort'}
            title={inline ? 'Sort by' : 'Sort'}
            className={`flex items-center gap-1.5 ${inline ? 'h-10' : 'h-9'} px-3 bg-slate-100 border border-gray-200 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors`}
          >
            <span className="hidden sm:inline tf-label">{inline ? 'Sort by' : 'Sort'}</span>
            <ChevronDown className="w-4 h-4 text-gray-500" />
          </button>

          {showSort && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowSort(false)}></div>
              <div className="fixed inset-x-2 bottom-2 sm:inset-x-auto sm:bottom-auto sm:absolute sm:right-0 sm:mt-2 w-auto sm:w-56 max-w-[calc(100vw-1rem)] sm:max-w-[calc(100vw-1.5rem)] max-h-[60dvh] sm:max-h-[70dvh] overflow-y-auto bg-white rounded-xl sm:rounded-lg shadow-2xl sm:shadow-xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] py-2 z-50">
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
    </div>
  );
}
