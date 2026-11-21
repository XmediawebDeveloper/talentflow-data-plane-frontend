'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Loader2, FileText, Briefcase, ClipboardList, Video, X, Folder as FolderIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { resumeService, folderService, Resume, Folder } from '@/lib/services/resumeService';
import { jdService, JDResponse } from '@/lib/services/jdService';
import { assessmentService, AssessmentResponse } from '@/lib/services/assessmentService';
import VersionBadge from '@/components/VersionBadge';
import { aiInterviewService, AIInterviewResponse } from '@/lib/services/aiInterviewService';
import { formatDateTimeIST } from '@/lib/utils/timezone';
import { IconButton } from '@/components/ui/icon-button';

interface GlobalSearchProps {
  className?: string;
}

/**
 * Finds the query's digits inside the phone number's digits and returns the
 * [start, end) character range in the original (possibly formatted) string,
 * so spaces/dashes/+ inside the match are highlighted but nothing outside it.
 */
function phoneMatchRange(phone: string, query: string): [number, number] | null {
  const q = query.replace(/\D/g, '');
  if (!q) return null;
  const digitPos: number[] = [];
  let digits = '';
  for (let i = 0; i < phone.length; i++) {
    if (/\d/.test(phone[i])) {
      digitPos.push(i);
      digits += phone[i];
    }
  }
  const idx = digits.indexOf(q);
  if (idx === -1) return null;
  return [digitPos[idx], digitPos[idx + q.length - 1] + 1];
}

function renderPhone(phone: string, query: string) {
  const range = phoneMatchRange(phone, query);
  if (!range) return phone;
  const [start, end] = range;
  return (
    <>
      {phone.slice(0, start)}
      <mark className="bg-yellow-200 dark:bg-yellow-500/40 text-inherit font-semibold rounded-sm px-px">
        {phone.slice(start, end)}
      </mark>
      {phone.slice(end)}
    </>
  );
}

/* ── ID-style queries ("650", "JD-650") ─────────────────────────────────
   Each list endpoint's `search` also matches fields this dropdown never
   shows: an assessment's internal AS-022 and an AI interview's internal
   AI-045 (neither is shown anywhere in the app — their tables identify them
   by the Job ID). So a typed number returned rows with no visible reason to
   be there. For an ID-style query a row is kept only when the number is in an
   ID the app shows (the Job ID) or in the name. Résumés are also kept when
   the digits are in their phone number, which is shown highlighted. */
const ID_QUERY = /^[a-z]{0,4}[-\s]?\d+$/i;
/** Phone-style input: digits with spaces, +, -, dots or brackets
 *  ("98765 43210", "+91 98765-43210"). */
const PHONE_QUERY = /^[\d\s+().-]+$/;
const RESULT_LIMIT = 5;

/** "650" or "JD-650" against an ID such as "JD-650" / "JD-003". */
function idMatches(id: string | null | undefined, query: string): boolean {
  if (!id) return false;
  const q = query.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (/[a-z]/.test(q)) return id.toLowerCase().replace(/[^a-z0-9]/g, '').includes(q);
  const digits = id.replace(/\D/g, '');
  return digits.includes(q) || (digits !== '' && Number(digits) === Number(q));
}

function textMatches(fields: (string | null | undefined)[], query: string): boolean {
  const q = query.trim().toLowerCase();
  return fields.some((f) => !!f && f.toLowerCase().includes(q));
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
    const q = searchQuery.trim();
    const idQuery = ID_QUERY.test(q);
    const phoneQuery = /\d/.test(q) && PHONE_QUERY.test(q);
    // ID / phone style: ask for more, since hidden-field matches are dropped below.
    const pageSize = idQuery || phoneQuery ? 25 : RESULT_LIMIT;
    try {
      const [resumeRes, folderRes, jdRes, assessmentRes, aiInterviewRes] = await Promise.allSettled([
        resumeService.list({ search: searchQuery, page_size: pageSize }),
        folderService.list(),
        jdService.list({ search: searchQuery, page_size: pageSize }),
        assessmentService.list({ search: searchQuery, page_size: pageSize }),
        aiInterviewService.list({ search: searchQuery, page_size: pageSize, compact: true }),
      ]);

      const keep = <T,>(items: T[], visible: (item: T) => boolean, filter = idQuery) =>
        (filter ? items.filter(visible) : items).slice(0, RESULT_LIMIT);

      setResumes(resumeRes.status === 'fulfilled'
        // For a number / phone-style query a résumé must match by name, email
        // or the (highlighted) phone number.
        ? keep(resumeRes.value.items, (r) => textMatches([r.candidate_name, r.candidate_email, r.email], q) || (!!r.phone && !!phoneMatchRange(r.phone, q)), idQuery || phoneQuery)
        : []);
      setFolders(folderRes.status === 'fulfilled' ? flattenFolders(folderRes.value, searchQuery) : []);
      setJds(jdRes.status === 'fulfilled'
        ? keep(jdRes.value.items, (jd) => idMatches(jd.job_id, q) || textMatches([jd.title], q))
        : []);
      setAssessments(assessmentRes.status === 'fulfilled'
        ? keep(assessmentRes.value.items, (a) => idMatches(a.jd_short_id, q) || textMatches([a.title, a.jd_title], q))
        : []);
      setAiInterviews(aiInterviewRes.status === 'fulfilled'
        ? keep(aiInterviewRes.value.items, (i) => idMatches(i.jd_short_id, q) || textMatches([i.candidate_name, i.position, i.jd_title], q))
        : []);
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

  // Ctrl+K (Cmd+K on Mac) focuses the search from anywhere — listed in the
  // Keyboard Shortcuts help. Skipped while the bar is hidden (below lg), so the
  // browser's own Ctrl+K still works there.
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent));
    function handleShortcut(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== 'k' || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const input = inputRef.current;
      if (!input || input.offsetParent === null) return;
      e.preventDefault();
      input.focus();
      input.select();
      if (input.value.trim()) setIsOpen(true);
    }
    document.addEventListener('keydown', handleShortcut);
    return () => document.removeEventListener('keydown', handleShortcut);
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
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 dark:text-gray-500" />
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
          aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
          className="peer w-full pl-8 pr-14 py-1.5 tf-body border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 dark:focus:ring-gray-400 focus:border-transparent bg-gray-50 dark:bg-gray-800 hover:bg-white dark:hover:bg-gray-700 transition-colors placeholder-gray-400 dark:placeholder-gray-500 [&::-webkit-search-cancel-button]:hidden"
        />
        {/* Shortcut hint — only while empty and unfocused */}
        {!isLoading && !query && (
          <kbd
            aria-hidden
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-gray-300 bg-white px-1.5 py-px font-sans text-2xs font-semibold text-gray-500 shadow-[0_1px_0_#e5e7eb] peer-focus:hidden dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400 dark:shadow-none"
          >
            {isMac ? '⌘K' : 'Ctrl K'}
          </kbd>
        )}
        {isLoading && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 animate-spin" />
        )}
        {!isLoading && query && (
          <IconButton bare label="Close"
            onClick={clearSearch}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="w-3.5 h-3.5" />
          </IconButton>
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
            <div className="py-8 text-center tf-body-muted">
              No results found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            <>
              {/* Folders */}
              {folders.length > 0 && (
                <div>
                  <div className="px-3 py-2 tf-eyebrow bg-gray-50 dark:bg-gray-750 border-b border-gray-100 dark:border-gray-700">
                    <FolderIcon className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                    Folders ({folders.length})
                  </div>
                  {folders.map(({ folder, path }) => (
                    <button
                      key={folder.id}
                      onClick={() => handleSelect(`/recruitment/resume-database?tab=my-resumes&folder_id=${folder.id}`)}
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-50 dark:border-gray-750 last:border-b-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className="tf-badge bg-brand-blue/10 text-2xs text-brand-blue ring-1 ring-brand-blue/15">
                          Folder
                        </span>
                        <span className="tf-row-name truncate">
                          {folder.name}
                        </span>
                      </div>
                      <div className="tf-meta mt-0.5 truncate">
                        {path}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Resumes */}
              {resumes.length > 0 && (
                <div>
                  <div className="px-3 py-2 tf-eyebrow bg-gray-50 dark:bg-gray-750 border-b border-gray-100 dark:border-gray-700">
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
                        <span className="tf-badge bg-green-50 text-2xs text-green-700 ring-1 ring-green-200">
                          Resume
                        </span>
                        <span className="tf-row-name truncate">
                          {resume.phone && phoneMatchRange(resume.phone, query)
                            ? renderPhone(resume.phone, query)
                            : resume.candidate_name || resume.file_name}
                        </span>
                      </div>
                      <div className="tf-meta mt-0.5">
                        {[resume.current_title, resume.current_company, resume.location].filter(Boolean).join(' · ') || resume.candidate_email || resume.file_name}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Job Descriptions */}
              {jds.length > 0 && (
                <div>
                  <div className="px-3 py-2 tf-eyebrow bg-gray-50 dark:bg-gray-750 border-b border-gray-100 dark:border-gray-700">
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
                        <span className="tf-row-name">{jd.title}</span>
                        {jd.job_id && (
                          <span className="tf-hint">{jd.job_id}</span>
                        )}
                        {!!(jd as any).version_number && (
                          <VersionBadge version={(jd as any).version_number} size="sm" variant="secondary" />
                        )}
                      </div>
                      <div className="tf-meta mt-0.5">
                        {[jd.department, jd.location, jd.status].filter(Boolean).join(' · ')}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Assessments */}
              {assessments.length > 0 && (
                <div>
                  <div className="px-3 py-2 tf-eyebrow bg-gray-50 dark:bg-gray-750 border-b border-gray-100 dark:border-gray-700">
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
                        <span className="tf-row-name">{assessment.title}</span>
                        {/* The Job ID, as the Assessments table shows it — the
                            assessment's own AS-xxx is not shown in the app. */}
                        {assessment.jd_short_id && (
                          <span className="tf-hint">{assessment.jd_short_id}</span>
                        )}
                        {/* Every version of an assessment shares one AS-XXX, so
                            the version is what tells two results apart here. */}
                        {assessment.version > 1 && (
                          <span className="tf-hint">V{assessment.version}</span>
                        )}
                      </div>
                      <div className="tf-meta mt-0.5">
                        {assessment.jd_title} · {assessment.status}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* AI Interviews */}
              {aiInterviews.length > 0 && (
                <div>
                  <div className="px-3 py-2 tf-eyebrow bg-gray-50 dark:bg-gray-750 border-b border-gray-100 dark:border-gray-700">
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
                        <span className="tf-row-name">
                          {interview.candidate_name || interview.position || 'AI Interview'}
                        </span>
                        {/* The Job ID, as the AI Interviews table shows it — the
                            interview's own AI-xxx is not shown in the app. */}
                        {interview.jd_short_id && (
                          <span className="tf-hint">{interview.jd_short_id}</span>
                        )}
                      </div>
                      <div className="tf-meta mt-0.5">
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
