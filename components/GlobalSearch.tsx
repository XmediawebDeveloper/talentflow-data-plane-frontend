'use client';

import { useState, useEffect, useRef, useCallback, useId, type ReactNode } from 'react';
import { Search, Loader2, FileText, Briefcase, ClipboardList, Video, X, Folder as FolderIcon, History, ChevronUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { resumeService, folderService, Resume, Folder } from '@/lib/services/resumeService';
import { jdService, JDResponse } from '@/lib/services/jdService';
import { assessmentService, AssessmentResponse } from '@/lib/services/assessmentService';
import VersionBadge from '@/components/VersionBadge';
import { aiInterviewService, AIInterviewResponse } from '@/lib/services/aiInterviewService';
import { formatDateTimeIST } from '@/lib/utils/timezone';
import { IconButton } from '@/components/ui/icon-button';
import { Tooltip } from '@/components/ui/tooltip';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { getStatusConfig, mapJDStatus } from '@/lib/utils/jobOpeningDisplay';

interface GlobalSearchProps {
  className?: string;
  /** 'bar' (default): the header search box, shown from lg.
   *  'icon': a 🔍 header button for phones / tablets that opens the same
   *  search in a panel under the header. */
  variant?: 'bar' | 'icon';
}

/* ── ID-style queries ("650", "JD-650") ─────────────────────────────────
   Each list endpoint's `search` also matches fields this dropdown never
   shows: a résumé's phone number, an assessment's internal AS-022 and an AI
   interview's internal AI-045 (neither is shown anywhere in the app — their
   tables identify them by the Job ID). So a typed number returned rows with
   no visible reason to be there. For an ID-style query a row is kept only
   when the number is in an ID the app shows (the Job ID) or in the name. */
const ID_QUERY = /^[a-z]{0,4}[-\s]?\d+$/i;
/** Phone-style input: digits with spaces, +, -, dots or brackets
 *  ("98765 43210", "+91 98765-43210"). */
const PHONE_QUERY = /^[\d\s+().-]+$/;
/** Rows a category shows at first, and how many each "Load more" adds. */
const SHOW_STEP = 10;
/** Page size for ID / phone-style queries: rows matched only by a hidden
 *  field are dropped, so a bigger page is fetched to keep enough visible. */
const FILTERED_PAGE_SIZE = 25;

/** Last few searches, per browser (a convenience, not shared or synced). */
const RECENT_KEY = 'tf-global-search-recent';
const RECENT_LIMIT = 5;

/** The header panels' shared opening reveal (Quick actions, plan, chat …). */
const REVEAL = 'animate-in fade-in zoom-in-90 slide-in-from-top-1 duration-200 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:animate-none';

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

/** The phone number with only the matching digits highlighted. */
function renderPhone(phone: string, query: string): ReactNode {
  const range = phoneMatchRange(phone, query);
  if (!range) return phone;
  const [start, end] = range;
  return (
    <>
      {phone.slice(0, start)}
      <mark className="rounded-sm bg-brand-blue/10 font-semibold text-inherit dark:bg-brand-blue/30">{phone.slice(start, end)}</mark>
      {phone.slice(end)}
    </>
  );
}

/** True for a number / ID-style or phone-style query. */
function classifyQuery(q: string) {
  const idQuery = ID_QUERY.test(q);
  const phoneQuery = /\d/.test(q) && PHONE_QUERY.test(q);
  return { idQuery, phoneQuery };
}

/** 0 exact · 1 starts with · 2 a word starts with · 3 contains · 4 no visible match. */
function matchRank(fields: (string | null | undefined)[], query: string): number {
  const q = query.trim().toLowerCase();
  // ID-style: "650" / "JD-650" is an exact hit on JD-650 (not on JD-6501).
  const qNumber = ID_QUERY.test(q) ? Number(q.replace(/\D/g, '')) : null;
  let best = 4;
  for (const f of fields) {
    if (!f) continue;
    const t = f.toLowerCase();
    if (t === q) return 0;
    if (qNumber !== null && (t.match(/\d+/g) ?? []).some((n) => Number(n) === qNumber)) return 0;
    if (t.startsWith(q)) best = Math.min(best, 1);
    else if (t.split(/[\s/·,()-]+/).some((w) => w.startsWith(q))) best = Math.min(best, 2);
    else if (t.includes(q)) best = Math.min(best, 3);
  }
  return best;
}

/** Bold the part of `text` that matches the query, so it's clear why a row is here. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q || !text) return <>{text}</>;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'ig'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark key={i} className="rounded-sm bg-brand-blue/10 font-semibold text-inherit dark:bg-brand-blue/30">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/** A job's status as the Job Openings pill draws it (same colours and dot). */
function JDStatusPill({ status }: { status: string }) {
  const label = mapJDStatus(status);
  const tone = getStatusConfig(label);
  return (
    <span className={`inline-flex flex-shrink-0 items-center gap-1 px-1.5 py-px rounded-full text-2xs font-medium whitespace-nowrap border ${tone.bg} ${tone.text} ${tone.border}`}>
      <span className={`w-1.5 h-1.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
      {label}
    </span>
  );
}

type Kind = 'folder' | 'resume' | 'jd' | 'assessment' | 'interview';
/** Categories searched on the server (folders are matched in the browser). */
type ServerKind = Exclude<Kind, 'folder'>;

interface PageResult<T> {
  items: T[];
  totalPages: number;
  /** The server's total for the query; null when rows are filtered here
   *  (ID / phone-style queries), since it would count the dropped ones too. */
  total: number | null;
}

/* One page of one category for a query, already filtered the way the
   dropdown needs it (see ID_QUERY / PHONE_QUERY above). */
const FETCHERS = {
  async resume(search: string, page: number): Promise<PageResult<Resume>> {
    const q = search.trim();
    const { idQuery, phoneQuery } = classifyQuery(q);
    const res = await resumeService.list({ search, page, page_size: idQuery || phoneQuery ? FILTERED_PAGE_SIZE : SHOW_STEP });
    // For a number / phone-style query a résumé must match by name, email or
    // the phone number (shown, with the matching digits highlighted).
    const items = idQuery || phoneQuery
      ? res.items.filter((r) => textMatches([r.candidate_name, r.candidate_email, r.email], q) || (!!r.phone && !!phoneMatchRange(r.phone, q)))
      : res.items;
    return { items, totalPages: res.total_pages ?? 1, total: idQuery || phoneQuery ? null : res.total ?? null };
  },
  async jd(search: string, page: number): Promise<PageResult<JDResponse>> {
    const q = search.trim();
    const { idQuery } = classifyQuery(q);
    const res = await jdService.list({ search, page, page_size: idQuery ? FILTERED_PAGE_SIZE : SHOW_STEP });
    const items = idQuery ? res.items.filter((jd) => idMatches(jd.job_id, q) || textMatches([jd.title], q)) : res.items;
    return { items, totalPages: res.total_pages ?? 1, total: idQuery ? null : res.total ?? null };
  },
  async assessment(search: string, page: number): Promise<PageResult<AssessmentResponse>> {
    const q = search.trim();
    const { idQuery } = classifyQuery(q);
    const res = await assessmentService.list({ search, page, page_size: idQuery ? FILTERED_PAGE_SIZE : SHOW_STEP });
    const items = idQuery ? res.items.filter((a) => idMatches(a.jd_short_id, q) || textMatches([a.title, a.jd_title], q)) : res.items;
    return { items, totalPages: res.total_pages ?? 1, total: idQuery ? null : res.total ?? null };
  },
  async interview(search: string, page: number): Promise<PageResult<AIInterviewResponse>> {
    const q = search.trim();
    const { idQuery } = classifyQuery(q);
    const res = await aiInterviewService.list({ search, page, page_size: idQuery ? FILTERED_PAGE_SIZE : SHOW_STEP, compact: true });
    const items = idQuery ? res.items.filter((i) => idMatches(i.jd_short_id, q) || textMatches([i.candidate_name, i.position, i.jd_title], q)) : res.items;
    return { items, totalPages: res.total_pages ?? 1, total: idQuery ? null : res.total ?? null };
  },
};

const FIRST_SHOWN: Record<Kind, number> = { folder: SHOW_STEP, resume: SHOW_STEP, jd: SHOW_STEP, assessment: SHOW_STEP, interview: SHOW_STEP };
const NO_PAGES: Record<ServerKind, { page: number; totalPages: number; total: number | null }> = {
  resume: { page: 0, totalPages: 0, total: null }, jd: { page: 0, totalPages: 0, total: null },
  assessment: { page: 0, totalPages: 0, total: null }, interview: { page: 0, totalPages: 0, total: null },
};

interface ResultItem {
  key: string;
  kind: Kind;
  href: string;
  title: string;
  /** The ID shown after the title (Job ID). */
  idText?: string;
  /** An ID drawn as a badge BEFORE the title (the JD ID on job rows). */
  leadId?: string;
  /** Shown right after the title as "Name - email" (résumé rows). */
  titleNote?: string;
  /** Replaces the highlighted title (résumé rows matched by phone number). */
  titleNode?: ReactNode;
  extra?: ReactNode;
  meta: string;
  /** Fields that rank this row inside its section. */
  rankFields: (string | null | undefined)[];
}

/* Each category's outline icon in its own colour: folders orange (the folder
   tree), résumés green, jobs brand blue, assessments
   orange-deep and AI interviews cyan (the units dropdown's rows). */
const SECTIONS: Record<Kind, { label: string; icon: typeof FileText; color: string }> = {
  folder: { label: 'Folders', icon: FolderIcon, color: 'text-brand-orange' },
  resume: { label: 'Resumes', icon: FileText, color: 'text-green-600 dark:text-green-400' },
  jd: { label: 'Job Descriptions', icon: Briefcase, color: 'text-brand-blue dark:text-blue-300' },
  assessment: { label: 'Assessments', icon: ClipboardList, color: 'text-brand-orange-deep' },
  interview: { label: 'AI Interviews', icon: Video, color: 'text-brand-cyan' },
};

/* Section order: an ID-style query is looking for a job (and its assessment /
   interview) first; any other query for a candidate first. */
const ORDER_ID: Kind[] = ['jd', 'assessment', 'interview', 'resume', 'folder'];
const ORDER_TEXT: Kind[] = ['resume', 'jd', 'assessment', 'interview', 'folder'];

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((s) => typeof s === 'string').slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
}

function writeRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Storage blocked (private mode etc.) — recent searches are optional.
  }
}

export default function GlobalSearch({ className, variant = 'bar' }: GlobalSearchProps) {
  const router = useRouter();
  const listboxId = useId();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  /** 'icon' variant: the panel under the header is open. */
  const [panelOpen, setPanelOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [folders, setFolders] = useState<{ folder: Folder; path: string }[]>([]);
  const [jds, setJds] = useState<JDResponse[]>([]);
  const [assessments, setAssessments] = useState<AssessmentResponse[]>([]);
  const [aiInterviews, setAiInterviews] = useState<AIInterviewResponse[]>([]);
  /** Rows shown per category (10, +10 per "Load more"). */
  const [shown, setShown] = useState<Record<Kind, number>>(FIRST_SHOWN);
  /** Last server page loaded per category, and how many there are. */
  const [pages, setPages] = useState(NO_PAGES);
  const [loadingMore, setLoadingMore] = useState<Kind | null>(null);
  // Read once on the client; only shown after the user opens the search.
  const [recent, setRecent] = useState<string[]>(() => (typeof window === 'undefined' ? [] : readRecent()));
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  /** Only the newest request may write results: a slow answer for "6" must
   *  not replace the answer for "65" that arrived before it. */
  const requestSeq = useRef(0);
  /** The highlight last moved by ↑ ↓ (not by hover): only then is the row
   *  scrolled into view — doing it on hover fought the ⌃ scroll-to-head. */
  const keyboardMove = useRef(false);

  const resetResults = useCallback(() => {
    setResumes([]);
    setFolders([]);
    setJds([]);
    setAssessments([]);
    setAiInterviews([]);
    setShown(FIRST_SHOWN);
    setPages(NO_PAGES);
    setLoadingMore(null);
  }, []);

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
    return matches; // all of them — the list shows 10 and "Load more" the rest
  }, []);

  const performSearch = useCallback(async (searchQuery: string) => {
    const seq = ++requestSeq.current;
    if (!searchQuery.trim()) {
      resetResults();
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [resumeRes, folderRes, jdRes, assessmentRes, aiInterviewRes] = await Promise.allSettled([
        FETCHERS.resume(searchQuery, 1),
        folderService.list(),
        FETCHERS.jd(searchQuery, 1),
        FETCHERS.assessment(searchQuery, 1),
        FETCHERS.interview(searchQuery, 1),
      ]);
      if (seq !== requestSeq.current) return; // a newer search has started
      setActiveIndex(-1);
      setShown(FIRST_SHOWN);
      setLoadingMore(null);

      const pageOf = (r: PromiseSettledResult<PageResult<unknown>>) =>
        r.status === 'fulfilled'
          ? { page: 1, totalPages: r.value.totalPages, total: r.value.total }
          : { page: 1, totalPages: 0, total: null };
      setPages({ resume: pageOf(resumeRes), jd: pageOf(jdRes), assessment: pageOf(assessmentRes), interview: pageOf(aiInterviewRes) });

      setResumes(resumeRes.status === 'fulfilled' ? resumeRes.value.items : []);
      setFolders(folderRes.status === 'fulfilled' ? flattenFolders(folderRes.value, searchQuery) : []);
      setJds(jdRes.status === 'fulfilled' ? jdRes.value.items : []);
      setAssessments(assessmentRes.status === 'fulfilled' ? assessmentRes.value.items : []);
      setAiInterviews(aiInterviewRes.status === 'fulfilled' ? aiInterviewRes.value.items : []);
    } catch {
      // Silently handle errors - partial results are fine
    } finally {
      if (seq === requestSeq.current) setIsLoading(false);
    }
  }, [flattenFolders, resetResults]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      requestSeq.current++; // drop any answer still on its way
      resetResults();
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
  }, [query, performSearch, resetResults]);

  const closePanel = useCallback(() => {
    setIsOpen(false);
    setPanelOpen(false);
  }, []);

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
        closePanel();
        inputRef.current?.blur();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closePanel]);

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
      setIsOpen(true);
    }
    document.addEventListener('keydown', handleShortcut);
    return () => document.removeEventListener('keydown', handleShortcut);
  }, []);

  const rememberQuery = (q: string) => {
    const term = q.trim();
    if (!term) return;
    const next = [term, ...recent.filter((s) => s.toLowerCase() !== term.toLowerCase())].slice(0, RECENT_LIMIT);
    setRecent(next);
    writeRecent(next);
  };

  function handleSelect(path: string) {
    rememberQuery(query);
    closePanel();
    setQuery('');
    router.push(path);
  }

  function clearSearch() {
    setQuery('');
    resetResults();
    inputRef.current?.focus();
  }

  function clearRecent() {
    setRecent([]);
    writeRecent([]);
    inputRef.current?.focus();
  }

  /** "Load more" at the end of a category: 10 more rows — from rows already
   *  loaded first; else `loadingMore` is set and the effect below fetches the
   *  category's next server page. */
  function loadMore(kind: Kind) {
    if (loadingMore) return;
    if (byKind[kind].length > shown[kind] || kind === 'folder') {
      setShown((s) => ({ ...s, [kind]: s[kind] + SHOW_STEP }));
      return;
    }
    setLoadingMore(kind);
  }

  /* Next page of the category in `loadingMore`, appended without duplicates.
     An ID / phone-style page can filter down to nothing, so up to five pages
     are read until something visible turns up. */
  useEffect(() => {
    if (!loadingMore || loadingMore === 'folder') return;
    const kind = loadingMore;
    const seq = requestSeq.current;
    const search = query;
    const start = pages[kind];

    async function next<T extends { id: string }>(
      fetchPage: (search: string, page: number) => Promise<PageResult<T>>,
      setItems: React.Dispatch<React.SetStateAction<T[]>>,
    ) {
      let { page, totalPages, total } = start;
      const found: T[] = [];
      for (let tries = 0; tries < 5 && found.length === 0 && page < totalPages; tries++) {
        const res = await fetchPage(search, page + 1);
        if (seq !== requestSeq.current) return; // the query changed meanwhile
        page += 1;
        totalPages = res.totalPages;
        total = res.total;
        found.push(...res.items);
      }
      setItems((prev) => {
        const seen = new Set(prev.map((x) => x.id));
        return [...prev, ...found.filter((x) => !seen.has(x.id))];
      });
      setPages((p) => ({ ...p, [kind]: { page, totalPages, total } }));
      if (found.length > 0) setShown((s) => ({ ...s, [kind]: s[kind] + SHOW_STEP }));
    }

    const run =
      kind === 'resume' ? next(FETCHERS.resume, setResumes)
      : kind === 'jd' ? next(FETCHERS.jd, setJds)
      : kind === 'assessment' ? next(FETCHERS.assessment, setAssessments)
      : next(FETCHERS.interview, setAiInterviews);
    run
      .catch(() => { /* keep what is shown; the button stays for another try */ })
      .finally(() => { if (seq === requestSeq.current) setLoadingMore(null); });
    // Runs once per "Load more" click; query / pages are read as they were then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingMore]);

  /* ── Results → one ordered list of rows ───────────────────────────────── */
  const trimmed = query.trim();
  const { idQuery } = classifyQuery(trimmed);

  const byKind: Record<Kind, ResultItem[]> = {
    folder: folders.map(({ folder, path }) => ({
      key: `folder-${folder.id}`,
      kind: 'folder',
      href: `/recruitment/resume-database?tab=my-resumes&folder_id=${folder.id}`,
      title: folder.name,
      meta: path,
      rankFields: [folder.name],
    })),
    resume: resumes.map((resume) => ({
      key: `resume-${resume.id}`,
      kind: 'resume',
      href: `/recruitment/resume-view/${resume.id}`,
      title: resume.candidate_name || resume.file_name,
      // Matched by phone: the mobile number is shown instead of the name.
      titleNode: resume.phone && phoneMatchRange(resume.phone, trimmed) ? renderPhone(resume.phone, trimmed) : undefined,
      // "Name - email" on the first line; role · company · location below.
      titleNote: resume.candidate_email || resume.email || undefined,
      meta: [resume.current_title, resume.current_company, resume.location].filter(Boolean).join(' · '),
      rankFields: [resume.candidate_name, resume.candidate_email, resume.phone],
    })),
    jd: jds.map((jd) => ({
      key: `jd-${jd.id}`,
      kind: 'jd',
      href: `/recruitment/job-details?id=${jd.id}`,
      title: jd.title,
      /* JD ID · title · version · status — the Job Openings order, with its
         own JD ID badge and status pill. */
      leadId: jd.job_id || undefined,
      extra: (
        // The shared VersionBadge's smallest size is 12px; one step down here.
        <span className="flex items-center gap-1 [&>span:first-child]:!text-2xs [&>span:first-child]:!px-1.5 [&>span:first-child]:!py-0">
          <VersionBadge version={(jd as any).version_number ?? 1} size="sm" variant="secondary" />
          {jd.status && <JDStatusPill status={jd.status} />}
        </span>
      ),
      meta: [jd.department, jd.location].filter(Boolean).join(' · '),
      rankFields: [jd.job_id, jd.title],
    })),
    assessment: assessments.map((assessment) => ({
      key: `assessment-${assessment.id}`,
      kind: 'assessment',
      href: `/recruitment/assessments/${assessment.id}`,
      title: assessment.title,
      // The Job ID, as the Assessments table shows it — the assessment's own
      // AS-xxx is not shown in the app.
      idText: assessment.jd_short_id || undefined,
      // Every version of an assessment shares one job, so the version is what
      // tells two results apart here.
      extra: assessment.version > 1 ? <span className="tf-hint !text-[0.6875rem]">V{assessment.version}</span> : undefined,
      meta: [assessment.jd_title, assessment.status].filter(Boolean).join(' · '),
      rankFields: [assessment.jd_short_id, assessment.title, assessment.jd_title],
    })),
    interview: aiInterviews.map((interview) => ({
      key: `interview-${interview.id}`,
      kind: 'interview',
      href: `/recruitment/ai-interviews/${interview.id}`,
      title: interview.candidate_name || interview.position || 'AI Interview',
      // "Name - JD-xxx - email", as on résumé rows. The Job ID is the one the
      // AI Interviews table shows — the interview's own AI-xxx isn't shown.
      titleNote: [interview.jd_short_id, interview.candidate_email].filter(Boolean).join(' - ') || undefined,
      meta: [interview.position, interview.jd_title, interview.status].filter(Boolean).join(' · '),
      rankFields: [interview.jd_short_id, interview.candidate_name, interview.candidate_email, interview.position, interview.jd_title],
    })),
  };

  const sections = (idQuery ? ORDER_ID : ORDER_TEXT)
    .map((kind) => {
      // Closest match first: exact, then starts-with, then contains.
      const sorted = [...byKind[kind]].sort((a, b) => matchRank(a.rankFields, trimmed) - matchRank(b.rankFields, trimmed));
      const hasMore =
        sorted.length > shown[kind] || (kind !== 'folder' && pages[kind].page < pages[kind].totalPages);
      return { kind, items: sorted.slice(0, shown[kind]), hasMore };
    })
    .filter((s) => s.items.length > 0);
  /** Every row ↑ ↓ Enter can reach, in order: results, plus each category's
   *  "Load more" after its last row. */
  type Option = { type: 'item'; item: ResultItem } | { type: 'more'; kind: Kind };
  const flatOptions: Option[] = sections.flatMap((s) => [
    ...s.items.map((item): Option => ({ type: 'item', item })),
    ...(s.hasMore ? [{ type: 'more', kind: s.kind } as Option] : []),
  ]);
  const hasResults = flatOptions.length > 0;

  const showRecent = !trimmed && recent.length > 0;
  /** What ↑ ↓ Enter move through: results, or recent searches when empty. */
  const optionCount = showRecent ? recent.length : flatOptions.length;
  const dropdownVisible = (variant === 'icon' ? panelOpen : isOpen) && (!!trimmed || showRecent);

  /** A category head's count: the total available, not just the rows shown. */
  const totalFor = (kind: Kind, shownCount: number, hasMore: boolean): string => {
    if (kind === 'folder') return String(byKind.folder.length);
    const { total, page, totalPages } = pages[kind];
    if (total != null) return total.toLocaleString();
    // Filtered search: exact once every page is in, else what's loaded + "+".
    const loaded = byKind[kind].length;
    return page >= totalPages ? String(loaded) : `${Math.max(loaded, shownCount)}${hasMore ? '+' : ''}`;
  };

  const optionId = (i: number) => `${listboxId}-opt-${i}`;

  /** Scroll the result list so a category's head sits at its top. */
  const scrollToHead = (kind: Kind) => {
    const head = document.getElementById(`${listboxId}-head-${kind}`);
    const list = head?.closest<HTMLElement>('.overflow-y-auto');
    if (!head || !list) return;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    list.scrollTo({
      top: list.scrollTop + head.getBoundingClientRect().top - list.getBoundingClientRect().top,
      behavior: smooth ? 'smooth' : 'auto',
    });
  };

  useEffect(() => {
    if (activeIndex < 0 || !keyboardMove.current) return;
    keyboardMove.current = false;
    document.getElementById(`${listboxId}-opt-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, listboxId]);

  function activate(i: number) {
    if (showRecent) {
      setQuery(recent[i]);
      setIsOpen(true);
      setActiveIndex(-1);
      return;
    }
    const option = flatOptions[i];
    if (option?.type === 'item') handleSelect(option.item.href);
    else if (option?.type === 'more') loadMore(option.kind);
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      // Stop the browser's own "Escape clears a search box", whose change
      // event would re-open the list; the document handler closes it.
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (optionCount === 0) return;
      e.preventDefault();
      setIsOpen(true);
      keyboardMove.current = true;
      setActiveIndex((i) => {
        if (e.key === 'ArrowDown') return i + 1 >= optionCount ? 0 : i + 1;
        return i - 1 < 0 ? optionCount - 1 : i - 1;
      });
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && activeIndex < optionCount) {
        e.preventDefault();
        activate(activeIndex);
      } else if (!showRecent && flatOptions[0]?.type === 'item') {
        // Enter with nothing highlighted opens the best match.
        e.preventDefault();
        activate(0);
      }
    }
  }

  /* ── Pieces ─────────────────────────────────────────────────────────── */
  const optionClass = (i: number) =>
    `w-full cursor-pointer text-left px-3 py-1.5 sm:py-2 transition-colors border-b border-gray-50 dark:border-gray-700/60 last:border-b-0 ${
      i === activeIndex ? 'bg-brand-blue/5 dark:bg-gray-700' : 'hover:bg-gray-50 dark:hover:bg-gray-700'
    }`;

  const renderInput = (inPanel: boolean) => (
    <div className="relative w-full">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 dark:text-gray-500" aria-hidden />
      <input
        ref={inputRef}
        type="search"
        name="global-search"
        autoComplete="off"
        role="combobox"
        aria-label="Search"
        aria-autocomplete="list"
        aria-expanded={dropdownVisible}
        aria-controls={listboxId}
        aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
        data-form-type="other"
        data-lpignore="true"
        data-1p-ignore="true"
        autoFocus={inPanel}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
          setActiveIndex(-1); // a new query starts the highlight from the top
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={onInputKeyDown}
        placeholder={inPanel ? 'Search resumes, jobs, IDs…' : 'Search folders, resumes, jobs, assessments, interviews or IDs...'}
        aria-keyshortcuts={inPanel ? undefined : isMac ? 'Meta+K' : 'Control+K'}
        className={`peer w-full pl-8 pr-14 ${inPanel ? 'h-10' : 'py-1.5'} tf-body border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 dark:focus:ring-gray-400 focus:border-transparent bg-gray-50 dark:bg-gray-800 hover:bg-white dark:hover:bg-gray-700 transition-colors placeholder:text-gray-500 dark:placeholder:text-gray-500 [&::-webkit-search-cancel-button]:hidden`}
      />
      {/* Shortcut hint — only while empty and unfocused */}
      {!inPanel && !isLoading && !query && (
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
        <IconButton bare label="Clear search"
          onClick={clearSearch}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
          <X className="w-3.5 h-3.5" />
        </IconButton>
      )}
    </div>
  );

  const renderResults = () => {
    if (showRecent) {
      return (
        <div role="listbox" id={listboxId} aria-label="Recent searches">
          <div className="flex items-center justify-between px-3 py-1.5 tf-eyebrow !text-2xs max-sm:!text-[10px] bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
            <span><History className="w-3 h-3 inline mr-1.5 -mt-0.5" aria-hidden />Recent searches</span>
            <button type="button" onClick={clearRecent} className="normal-case tracking-normal text-2xs font-medium text-brand-blue hover:underline">
              Clear
            </button>
          </div>
          {recent.map((term, i) => (
            <div
              key={term}
              id={optionId(i)}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => activate(i)}
              className={`${optionClass(i)} flex items-center gap-2 tf-row-name !text-[0.8125rem] max-sm:!text-[12px]`}
            >
              <Search className="w-3.5 h-3.5 shrink-0 text-gray-500" aria-hidden />
              <span className="truncate">{term}</span>
            </div>
          ))}
        </div>
      );
    }
    if (isLoading && !hasResults) {
      return (
        <div className="flex items-center justify-center py-6 text-xs text-gray-500 dark:text-gray-400" role="status">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          Searching...
        </div>
      );
    }
    if (!hasResults) {
      return (
        <div className="px-4 py-5 text-center" role="status">
          <p className="tf-body-muted !text-xs">No results found for &ldquo;{query}&rdquo;</p>
          <p className="tf-meta !text-[0.6875rem] mt-1">Try a name, an email, a job title, or a Job ID like JD-650.</p>
        </div>
      );
    }
    let index = -1;
    return (
      <div role="listbox" id={listboxId} aria-label="Search results">
        {sections.map(({ kind, items, hasMore }) => {
          const { label, icon: Icon, color } = SECTIONS[kind];
          return (
            <div key={kind} role="group" aria-label={label}>
              <div id={`${listboxId}-head-${kind}`} className="px-3 py-1.5 tf-eyebrow !text-2xs max-sm:!text-[10px] bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700" aria-hidden>
                <Icon className={`w-3 h-3 inline mr-1.5 -mt-0.5 ${color}`} />
                {/* Total available: every folder match, or the server's total.
                    ID / phone-style searches drop hidden-field matches, so the
                    server total would over-count — there it's "10+" until
                    everything is loaded. */}
                {label} ({totalFor(kind, items.length, hasMore)})
              </div>
              {items.map((item) => {
                index += 1;
                const i = index;
                return (
                  <div
                    key={item.key}
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === activeIndex}
                    // Keep focus in the input, so ↑ ↓ keep working after a hover.
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => handleSelect(item.href)}
                    className={optionClass(i)}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {item.kind === 'folder' && (
                        <span className="tf-badge !px-1.5 !py-0 bg-brand-blue/10 text-2xs text-brand-blue ring-1 ring-brand-blue/15 shrink-0">Folder</span>
                      )}
                      {item.leadId && (
                        <JobIdBadge className="flex-shrink-0 !px-1.5 !py-px !text-2xs"><Highlight text={item.leadId} query={trimmed} /></JobIdBadge>
                      )}
                      <span className={`tf-row-name !text-[0.8125rem] max-sm:!text-[12px] truncate ${item.titleNote ? 'shrink-0 max-w-[60%]' : ''}`}>{item.titleNode ?? <Highlight text={item.title} query={trimmed} />}</span>
                      {item.titleNote && (
                        // Both can shorten: the name keeps at least its share,
                        // the email takes the rest and ends in "…".
                        <span className="tf-meta !text-[0.6875rem] max-sm:!text-[10px] min-w-0 truncate" title={item.titleNote}>
                          <span aria-hidden>- </span><Highlight text={item.titleNote} query={trimmed} />
                        </span>
                      )}
                      {item.idText && (
                        <span className="tf-hint !text-[0.6875rem] shrink-0"><Highlight text={item.idText} query={trimmed} /></span>
                      )}
                      {item.extra && <span className="shrink-0">{item.extra}</span>}
                    </div>
                    {item.meta && (
                      <div className="tf-meta !text-[0.6875rem] max-sm:!text-[10px] mt-px truncate"><Highlight text={item.meta} query={trimmed} /></div>
                    )}
                  </div>
                );
              })}
              {hasMore && (() => {
                index += 1;
                const i = index;
                const busy = loadingMore === kind;
                return (
                  <div
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === activeIndex}
                    aria-busy={busy || undefined}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => loadMore(kind)}
                    className={`relative flex items-center justify-center gap-1.5 px-9 py-1.5 text-2xs max-sm:text-[10px] font-medium text-brand-blue dark:text-blue-300 cursor-pointer border-b border-gray-50 dark:border-gray-700/60 transition-colors ${
                      i === activeIndex ? 'bg-brand-blue/5 dark:bg-gray-700' : 'hover:bg-brand-blue/5 dark:hover:bg-gray-700'
                    }`}
                  >
                    {busy && <Loader2 className="w-3 h-3 animate-spin" aria-hidden />}
                    {busy ? 'Loading…' : `Load more ${label.toLowerCase()}`}
                    {/* ⌃ back up to this category's head. Mouse / touch only —
                        keyboard focus stays in the search box (↑ does the same). */}
                    <IconButton bare label={`Back to top of ${label}`} tooltipPosition="left"
                      tabIndex={-1}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => {
                        e.stopPropagation();
                        scrollToHead(kind);
                      }}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-md text-gray-500 hover:bg-brand-blue/10 hover:text-brand-blue dark:hover:bg-gray-600 dark:hover:text-blue-300"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </IconButton>
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
    );
  };

  /* ── Phones / tablets: 🔍 button + a panel under the header ─────────── */
  if (variant === 'icon') {
    return (
      <div ref={containerRef} className={className}>
        <Tooltip content="Search" position="bottom">
          <button
            type="button"
            onClick={() => { setPanelOpen((o) => !o); setIsOpen(true); }}
            data-active={panelOpen || undefined}
            aria-label="Search"
            aria-expanded={panelOpen}
            className={`tf-hbtn p-1.5 sm:p-2 rounded-lg transition-colors hover:bg-brand-blue/5 hover:text-brand-blue ${panelOpen ? 'bg-brand-blue/5 text-brand-blue' : 'text-gray-500'}`}
          >
            <Search className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </Tooltip>
        {panelOpen && (
          <>
            <div className="fixed inset-0 z-[80]" onClick={closePanel} aria-hidden />
            <div className={`${REVEAL} origin-top fixed left-3 right-3 top-[4.25rem] z-[85] mx-auto max-w-xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl shadow-slate-900/10 dark:border-gray-700 dark:bg-gray-800`}>
              <div className="p-2.5 border-b border-gray-100 dark:border-gray-700">{renderInput(true)}</div>
              {(trimmed || showRecent) && (
                <div className="max-h-[calc(100dvh-10rem)] overflow-y-auto overscroll-contain">{renderResults()}</div>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative ${className || ''}`}>
      {renderInput(false)}

      {/* Dropdown results */}
      {dropdownVisible && (
        <div className={`${REVEAL} origin-top absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 max-h-[420px] overflow-y-auto`}>
          {renderResults()}
        </div>
      )}
    </div>
  );
}
