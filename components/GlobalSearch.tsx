'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Loader2, FileText, Briefcase, ClipboardList, Video, X, Folder as FolderIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { resumeService, folderService, Resume, Folder } from '@/lib/services/resumeService';
import { jdService, JDResponse } from '@/lib/services/jdService';
import { assessmentService, AssessmentResponse } from '@/lib/services/assessmentService';
import VersionBadge from '@/components/VersionBadge';
import { aiInterviewService, AIInterviewResponse } from '@/lib/services/aiInterviewService';

interface GlobalSearchProps {
  className?: string;
}

export default function GlobalSearch({ className }: GlobalSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [folders, setFolders] = useState<{ folder: Folder; path: string }[]>([]);
  const [jds, setJds] = useState<JDResponse[]>([]);
  const [assessments, setAssessments] = useState<AssessmentResponse[]>([]);
  const [aiInterviews, setAiInterviews] = useState<AIInterviewResponse[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const hasResults =
    folders.length > 0 || resumes.length > 0 || jds.length > 0 || assessments.length > 0 || aiInterviews.length > 0;

  const flattenFolders = useCallback((items: Folder[], query: string) => {
    const matches: { folder: Folder; path: string }[] = [];
    const normalized = query.trim().toLowerCase();
    const walk = (foldersToWalk: Folder[], parentPath: string[] = []) => {
      for (const folder of foldersToWalk) {
        const pathParts = [...parentPath, folder.name];
        const path = pathParts.join(' / ');
        if (`${folder.name} ${path}`.toLowerCase().includes(normalized)) {
          matches.push({ folder, path });
        }
        if (folder.children?.length) walk(folder.children, pathParts);
      }
    };
    walk(items);
    return matches.slice(0, 5);
  }, []);

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResumes([]);
      setFolders([]);
      setJds([]);
      setAssessments([]);
      setAiInterviews([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [resumeRes, folderRes, jdRes, assessmentRes, aiInterviewRes] = await Promise.allSettled([
        resumeService.list({ search: searchQuery, page_size: 5 }),
        folderService.list(),
        jdService.list({ search: searchQuery, page_size: 5 }),
        assessmentService.list({ search: searchQuery, page_size: 5 }),
        aiInterviewService.list({ search: searchQuery, page_size: 5 }),
      ]);

      setResumes(resumeRes.status === 'fulfilled' ? resumeRes.value.items : []);
      setFolders(folderRes.status === 'fulfilled' ? flattenFolders(folderRes.value, searchQuery) : []);
      setJds(jdRes.status === 'fulfilled' ? jdRes.value.items : []);
      setAssessments(assessmentRes.status === 'fulfilled' ? assessmentRes.value.items : []);
      setAiInterviews(aiInterviewRes.status === 'fulfilled' ? aiInterviewRes.value.items : []);
    } catch {
      // Silently handle errors - partial results are fine
    } finally {
      setIsLoading(false);
    }
  }, [flattenFolders]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResumes([]);
      setFolders([]);
      setJds([]);
      setAssessments([]);
      setAiInterviews([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    debounceRef.current = setTimeout(() => {
      performSearch(query);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, performSearch]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  function handleSelect(path: string) {
    setIsOpen(false);
    setQuery('');
    router.push(path);
  }

  function clearSearch() {
    setQuery('');
    setResumes([]);
    setFolders([]);
    setJds([]);
    setAssessments([]);
    setAiInterviews([]);
    inputRef.current?.focus();
  }

  return (
    <div ref={containerRef} className={`relative ${className || ''}`}>
      <div className="relative w-full">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
        <input
          ref={inputRef}
          type="search"
          name="global-search"
          autoComplete="off"
          role="searchbox"
          aria-autocomplete="list"
          data-form-type="other"
          data-lpignore="true"
          data-1p-ignore="true"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (query.trim()) setIsOpen(true);
          }}
          placeholder="Search folders, resumes, jobs, assessments, interviews or IDs..."
          className="w-full pl-8 pr-8 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 dark:focus:ring-gray-400 focus:border-transparent bg-gray-50 dark:bg-gray-800 hover:bg-white dark:hover:bg-gray-700 transition-colors text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 [&::-webkit-search-cancel-button]:hidden"
        />
        {isLoading && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 animate-spin" />
        )}
        {!isLoading && query && (
          <button
            onClick={clearSearch}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
           aria-label="Close">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Dropdown results */}
      {isOpen && query.trim() && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 max-h-[420px] overflow-y-auto">
          {isLoading && !hasResults ? (
            <div className="flex items-center justify-center py-8 text-gray-500 dark:text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Searching...
            </div>
          ) : !hasResults ? (
            <div className="py-8 text-center text-gray-500 dark:text-gray-400 text-sm">
              No results found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            <>
              {/* Folders */}
              {folders.length > 0 && (
                <div>
                  <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-750 border-b border-gray-100 dark:border-gray-700">
                    <FolderIcon className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                    Folders ({folders.length})
                  </div>
                  {folders.map(({ folder, path }) => (
                    <button
                      key={folder.id}
                      onClick={() => handleSelect(`/recruitment/my-resumes?folder_id=${folder.id}`)}
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-50 dark:border-gray-750 last:border-b-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-full bg-brand-blue/10 px-2 py-0.5 text-[11px] font-medium text-brand-blue ring-1 ring-brand-blue/15">
                          Folder
                        </span>
                        <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                          {folder.name}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                        {path}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Resumes */}
              {resumes.length > 0 && (
                <div>
                  <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-750 border-b border-gray-100 dark:border-gray-700">
                    <FileText className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                    Resumes ({resumes.length})
                  </div>
                  {resumes.map((resume) => (
                    <button
                      key={resume.id}
                      onClick={() => handleSelect(`/recruitment/resume-view/${resume.id}`)}
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-50 dark:border-gray-750 last:border-b-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700 ring-1 ring-green-200">
                          Resume
                        </span>
                        <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                          {resume.candidate_name || resume.file_name}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {[resume.current_title, resume.current_company, resume.location].filter(Boolean).join(' · ') || resume.candidate_email || resume.file_name}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Job Descriptions */}
              {jds.length > 0 && (
                <div>
                  <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-750 border-b border-gray-100 dark:border-gray-700">
                    <Briefcase className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                    Job Descriptions ({jds.length})
                  </div>
                  {jds.map((jd) => (
                    <button
                      key={jd.id}
                      onClick={() => handleSelect(`/recruitment/job-details?id=${jd.id}`)}
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-50 dark:border-gray-750 last:border-b-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-gray-900 dark:text-gray-100">{jd.title}</span>
                        {jd.job_id && (
                          <span className="text-xs text-gray-400 dark:text-gray-500">{jd.job_id}</span>
                        )}
                        {!!(jd as any).version_number && (
                          <VersionBadge version={(jd as any).version_number} size="sm" variant="secondary" />
                        )}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {[jd.department, jd.location, jd.status].filter(Boolean).join(' · ')}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Assessments */}
              {assessments.length > 0 && (
                <div>
                  <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-750 border-b border-gray-100 dark:border-gray-700">
                    <ClipboardList className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                    Assessments ({assessments.length})
                  </div>
                  {assessments.map((assessment) => (
                    <button
                      key={assessment.id}
                      onClick={() => handleSelect(`/recruitment/assessments/${assessment.id}`)}
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-50 dark:border-gray-750 last:border-b-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-gray-900 dark:text-gray-100">{assessment.title}</span>
                        {assessment.short_id && (
                          <span className="text-xs text-gray-400 dark:text-gray-500">{assessment.short_id}</span>
                        )}
                        {/* Every version of an assessment shares one AS-XXX, so
                            the version is what tells two results apart here. */}
                        {assessment.version > 1 && (
                          <span className="text-xs text-gray-400 dark:text-gray-500">V{assessment.version}</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {assessment.jd_title} · {assessment.status}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* AI Interviews */}
              {aiInterviews.length > 0 && (
                <div>
                  <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-750 border-b border-gray-100 dark:border-gray-700">
                    <Video className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                    AI Interviews ({aiInterviews.length})
                  </div>
                  {aiInterviews.map((interview) => (
                    <button
                      key={interview.id}
                      onClick={() => handleSelect(`/recruitment/ai-interviews/${interview.id}`)}
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-50 dark:border-gray-750 last:border-b-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                          {interview.candidate_name || interview.position || 'AI Interview'}
                        </span>
                        {interview.display_id && (
                          <span className="text-xs text-gray-400 dark:text-gray-500">{interview.display_id}</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {[interview.position, interview.jd_title, interview.status].filter(Boolean).join(' · ')}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
