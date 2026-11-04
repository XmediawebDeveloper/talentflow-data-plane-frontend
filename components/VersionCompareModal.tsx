'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X, History, FileText, Check } from 'lucide-react';
import { buildUnifiedDiff, buildDiffSidePairs, type DiffLine } from '@/lib/utils/textDiff';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

export interface CompareVersion {
  /** Version number as shown to the user ("Version 2"). */
  version?: number;
  /** File name, printed under the version heading. */
  name?: string;
  /** Extracted text of the document — what actually gets diffed. */
  text?: string;
  /** Heading for this side. Defaults to "Version {version}" — set it where the
   *  two sides aren't versions of one record, e.g. a resume on file against an
   *  upload that was refused. */
  label?: string;
  /**
   * A card describing this side, shown above the diff.
   *
   * Opt-in and supplied whole by the host, so this modal needs to know nothing
   * about what is being compared: the JD version history passes its own version
   * header card, and the résumé surfaces pass nothing and render exactly as
   * before. Give both sides a card or neither — one alone reads as a missing
   * half rather than a deliberate asymmetry.
   */
  card?: ReactNode;
}

interface VersionCompareModalProps {
  older: CompareVersion;
  newer: CompareVersion;
  onClose: () => void;
  /** Dialog title. Defaults to "Version Comparison". */
  title?: string;
  /** Line under the title. Defaults to "Version X vs Version Y". */
  subtitle?: string;
  /** JD descriptions are markdown; render them with the same markdown path as the individual version view. */
  contentFormat?: 'plain' | 'markdown';
  /**
   * What the tint on each line means.
   * - 'changes' (default): the version-history reading — removed lines tint
   *   red on the older side, added lines tint green on the newer side,
   *   identical lines are plain. Answers "what changed between these two".
   * - 'matches': tints identical lines green on BOTH sides and differing
   *   lines amber, independently per side (no red/green edit framing).
   *   Answers "how much of this is the same resume, and what's different"
   *   — the question that matters when comparing an upload against the
   *   record already on file, where the two are different documents by
   *   definition, not two edits of one.
   */
  highlightMode?: 'changes' | 'matches';
  /** Lets a comparison opened from another modal stack above its parent. */
  zIndexClassName?: string;
}

/** Lines we treat as résumé section headings, so the diff keeps the document's
 *  shape instead of reading as a wall of text. */
const SECTION_HEADERS = [
  'experience', 'work experience', 'employment', 'professional experience',
  'education', 'academic', 'qualifications',
  'skills', 'technical skills', 'core competencies', 'expertise', 'key skills',
  'summary', 'professional summary', 'objective', 'profile', 'about',
  'certifications', 'certificates', 'licenses',
  'projects', 'key projects',
  'achievements', 'accomplishments', 'awards',
  'languages', 'contact', 'personal', 'references', 'hobbies', 'interests',
];

const isSectionHeader = (trimmed: string) => {
  const lower = trimmed.toLowerCase().replace(/[:\-_]/g, ' ').trim();
  return (
    SECTION_HEADERS.some((h) => lower === h || lower.startsWith(h + ' ') || lower.endsWith(' ' + h)) &&
    trimmed.length < 50
  );
};

/**
 * Each side's own lines, flagged against the other side's content — for
 * 'matches' mode, where the two documents are unrelated by definition and
 * there is nothing to align line-for-line.
 *
 * `buildDiffSidePairs` is LCS alignment: it pads whichever side has fewer
 * lines in a run with blank spacer rows so an edit lines up beside what it
 * replaced. That is the right read for two versions of one document, but for
 * an upload compared against the record on file it turned into long stretches
 * of empty space — the two résumés rarely have the same number of lines
 * between their matching anchors. Here, each side just renders its own text
 * top to bottom exactly as extracted; only the highlight is informed by the
 * other side.
 */
const buildMatchOnlyLines = (text: string, otherText: string): DiffLine[] => {
  const otherLines = new Set(
    otherText.split('\n').map(l => l.trim()).filter(l => l.length > 0),
  );
  return text.split('\n').map(line => {
    const trimmed = line.trim();
    return {
      text: line,
      type: trimmed && otherLines.has(trimmed) ? 'unchanged' : 'added',
    };
  });
};

/**
 * The résumé version diff — extracted from the resume detail page so the same
 * comparison opens from anywhere a version list is shown (the detail page, and
 * the version history popup on the resume lists).
 *
 * Two readings of one diff: side by side, older left / newer right with only
 * that side's changes tinted; or unified, one column with additions and
 * removals inline.
 */
export default function VersionCompareModal({ older, newer, onClose, title, subtitle, contentFormat = 'plain', highlightMode = 'changes', zIndexClassName = 'z-50' }: VersionCompareModalProps) {
  const olderLabel = older.label || `Version ${older.version || '?'}`;
  const newerLabel = newer.label || `Version ${newer.version || '?'}`;
  /* Phones open on Unified: two side-by-side columns are ~140px each at 320px,
     too narrow to read a line. Side by Side stays one tap away (and stacks
     the two versions on a phone — see the panes below). */
  const [viewMode, setViewMode] = useState<'side-by-side' | 'unified'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 640 ? 'unified' : 'side-by-side',
  );
  /* And whenever the window narrows to phone width while it is open (a
     rotated phone, a resized window) — back to Unified. Widening leaves the
     reader's choice alone. */
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639.98px)');
    if (mq.matches) setViewMode('unified');
    const onChange = (e: MediaQueryListEvent) => { if (e.matches) setViewMode('unified'); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const shouldRenderMarkdown = contentFormat === 'markdown';

  /* Side-by-side reads as one document split in two, so scrolling one pane
     scrolls both — otherwise lining a change up against its counterpart on
     the other side means scrolling each column separately to find it. The
     `syncing` ref is the re-entrancy guard: setting scrollTop on the other
     pane fires ITS onScroll, which would otherwise bounce back and forth. */
  const leftPaneRef = useRef<HTMLDivElement>(null);
  const rightPaneRef = useRef<HTMLDivElement>(null);
  const syncingScroll = useRef(false);
  const handlePaneScroll = (source: 'left' | 'right') => (e: React.UIEvent<HTMLDivElement>) => {
    if (syncingScroll.current) return;
    const other = (source === 'left' ? rightPaneRef : leftPaneRef).current;
    if (!other) return;
    syncingScroll.current = true;
    other.scrollTop = e.currentTarget.scrollTop;
    syncingScroll.current = false;
  };

  const olderText = older.text || '';
  const newerText = newer.text || '';
  const diff = buildUnifiedDiff(olderText, newerText);
  const sidePairs = buildDiffSidePairs(diff.lines);
  const isMatchesMode = highlightMode === 'matches';
  // Only built in 'matches' mode — buildMatchOnlyLines is an O(n) scan per
  // side, needless work for the far more common 'changes' comparisons.
  const olderMatchLines = isMatchesMode ? buildMatchOnlyLines(olderText, newerText) : [];
  const newerMatchLines = isMatchesMode ? buildMatchOnlyLines(newerText, olderText) : [];
  const matchedCount = isMatchesMode
    ? olderMatchLines.filter(l => l.type === 'unchanged').length
    : diff.unchangedCount;
  const countDiffering = (lines: DiffLine[]) =>
    lines.filter(l => l.type !== 'unchanged' && l.text.trim().length > 0).length;
  const differingCount = isMatchesMode
    ? countDiffering(olderMatchLines) + countDiffering(newerMatchLines)
    : 0;

  /* Identical versions still have a document to read, and it is the same
     document either way — every line unchanged, so the panes below render it
     with no tint on either side. "No changes" is therefore a NOTE ABOUT the
     comparison, not a replacement for it: it says so in a banner above the
     document rather than standing in place of it, which is what left a
     recruiter who opened v1 against v2 with nothing to read.

     Only meaningful where there is text at all — with neither side carrying
     any, the empty state below is the honest answer and a "no changes" banner
     over it would be a claim about content that was never there. */
  const hasContent = !!(olderText || newerText);
  const isUnchanged = hasContent && diff.addedCount === 0 && diff.removedCount === 0;

  const diffHighlightClass = (line: DiffLine, side: 'left' | 'right' | 'unified') => {
    if (highlightMode === 'matches') {
      // Two different documents by definition (an upload vs. the record on
      // file), so what the recruiter wants is "how much of this is the same
      // resume, and what changed" — tint matching lines green and differing
      // lines amber, on both sides, rather than a red/green edit framing
      // that implies one side is the "old" and the other the "new" edit.
      return line.type === 'unchanged'
        ? 'bg-green-50 border-l-4 border-green-400 pl-3 rounded'
        : 'bg-amber-50 border-l-4 border-amber-400 pl-3 rounded';
    }
    if (line.type === 'removed' && (side === 'left' || side === 'unified')) {
      return 'bg-red-50 border-l-4 border-red-400 pl-3 rounded';
    }
    if (line.type === 'added' && (side === 'right' || side === 'unified')) {
      return 'bg-green-50 border-l-4 border-green-500 pl-3 rounded';
    }
    return '';
  };

  const renderMarkdownDiffLine = (
    line: DiffLine | null,
    idx: number,
    side: 'left' | 'right' | 'unified',
  ) => {
    if (!line) {
      return <div key={idx} className="h-7 bg-gray-50" />;
    }

    const trimmed = line.text.trim();
    if (!trimmed) return <div key={idx} className="h-3" />;

    return (
      <div
        key={idx}
        /* Phones: markdown headings one step down — a JD's "# Title" at full
           h1 size broke into a word per line in a phone-width column. */
        className={`markdown-content prose prose-sm max-w-none text-gray-700 leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 max-sm:[overflow-wrap:anywhere] max-sm:[&_h1]:text-lg max-sm:[&_h2]:text-base max-sm:[&_h3]:text-sm max-sm:[&_h4]:text-sm ${diffHighlightClass(line, side)}`}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
          {trimmed}
        </ReactMarkdown>
      </div>
    );
  };

  const renderDiffLine = (line: DiffLine | null, idx: number, side: 'left' | 'right') => {
    if (shouldRenderMarkdown) {
      return renderMarkdownDiffLine(line, idx, side);
    }

    // A gap opposite an inserted/removed line, so both columns stay in step.
    if (!line) {
      return <div key={idx} className="h-7 bg-gray-50" />;
    }
    const trimmed = line.text.trim();
    if (!trimmed) return <div key={idx} className="h-3" />;

    // A heading is structure, not data — never tinted, even when it reads
    // identically (or not) on the other side, so the colour stays a signal
    // about content and doesn't fire on every "SKILLS"/"EXPERIENCE" label.
    if (isSectionHeader(trimmed)) {
      return (
        <h3 key={idx} className="text-xs font-bold mt-4 mb-1.5 pb-1 border-b border-gray-300 uppercase tracking-wide text-gray-900">
          {trimmed}
        </h3>
      );
    }

    let bgClass = '';
    let textColor = 'text-gray-800';
    let borderClass = '';

    if (highlightMode === 'matches') {
      if (line.type === 'unchanged') {
        bgClass = 'bg-green-50';
        textColor = 'text-green-800';
        borderClass = 'border-l-4 border-green-400 pl-2';
      } else {
        bgClass = 'bg-amber-50';
        textColor = 'text-amber-800';
        borderClass = 'border-l-4 border-amber-400 pl-2';
      }
    } else if (line.type === 'removed' && side === 'left') {
      bgClass = 'bg-red-50';
      textColor = 'text-red-800';
      borderClass = 'border-l-4 border-red-400 pl-2';
    } else if (line.type === 'added' && side === 'right') {
      bgClass = 'bg-green-50';
      textColor = 'text-green-800';
      borderClass = 'border-l-4 border-green-400 pl-2';
    }

    if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
      return (
        <p key={idx} className={`text-xs leading-relaxed pl-3 mb-0.5 ${bgClass} ${borderClass} ${textColor}`}>
          {trimmed}
        </p>
      );
    }

    return (
      <p key={idx} className={`text-xs leading-relaxed mb-0.5 py-0.5 ${bgClass} ${borderClass} ${textColor}`}>
        {trimmed}
      </p>
    );
  };

  return (
    <div className={`fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center ${zIndexClassName} p-3 sm:p-4`}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${viewMode === 'side-by-side' ? 'max-w-7xl' : 'max-w-4xl'} h-[85dvh] max-sm:h-[calc(100dvh-1.5rem)] flex flex-col overflow-hidden transition-all duration-300`}>
        {/* Header */}
        {/* Stacks below sm: title + view toggle + diff counts in one row
            pushed the close button off a phone screen. On phones the close
            button is pinned to the top-right corner (`relative` here). */}
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 bg-gray-50 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0 max-sm:pr-10">
            <div className="w-10 h-10 rounded-xl bg-brand-blue hidden sm:flex items-center justify-center shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
              <History className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="tf-section-title sm:text-lg tracking-tight">{title || 'Version Comparison'}</h2>
              <p className="tf-meta sm:text-sm">
                {subtitle || `${olderLabel} vs ${newerLabel}`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 max-sm:gap-2">
            <div className="flex bg-slate-100 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('side-by-side')}
                className={`px-3 max-sm:px-2.5 py-1.5 text-xs rounded-md transition-colors font-medium whitespace-nowrap ${
                  viewMode === 'side-by-side'
                    ? 'bg-white text-brand-blue shadow-sm shadow-brand-blue/10 ring-1 ring-brand-blue/15'
                    : 'text-gray-500 hover:text-brand-blue'
                }`}
              >
                Side by Side
              </button>
              <button
                onClick={() => setViewMode('unified')}
                className={`px-3 max-sm:px-2.5 py-1.5 text-xs rounded-md transition-colors font-medium whitespace-nowrap ${
                  viewMode === 'unified'
                    ? 'bg-white text-brand-blue shadow-sm shadow-brand-blue/10 ring-1 ring-brand-blue/15'
                    : 'text-gray-500 hover:text-brand-blue'
                }`}
              >
                Unified
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs">
              {highlightMode === 'matches' ? (
                <>
                  <span className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 border border-green-200 rounded-full text-green-700">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    {matchedCount} matching
                  </span>
                  <span className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-full text-amber-700">
                    <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                    {differingCount} different
                  </span>
                </>
              ) : (
                <>
                  <span className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 border border-green-200 rounded-full text-green-700">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    +{diff.addedCount}
                  </span>
                  <span className="flex items-center gap-1.5 px-2.5 py-1 bg-red-50 border border-red-200 rounded-full text-red-700">
                    <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                    −{diff.removedCount}
                  </span>
                </>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors max-sm:absolute max-sm:top-2 max-sm:right-2"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        {/* Phones: ONE scroll for the whole body. With the cards, the banner and
            the pane headers each in fixed slices of a phone-height popup, the
            document was left a strip a few lines tall. Below sm the body
            scrolls as a page instead — cards, banner, then the full document —
            and every inner scroller is released (`max-sm:overflow-visible`,
            `max-sm:h-auto`). From sm the panes scroll on their own as before. */}
        <div className="flex-1 overflow-hidden max-sm:overflow-y-auto bg-gray-100 flex flex-col min-h-0">
          {/* The two versions being compared, described in full — same cards the
              host shows when a single version is opened on its own. Older left,
              newer right, matching the diff panes below. */}
          {(older.card || newer.card) && (
            <div className="tf-grid-split flex-shrink-0 p-3 max-sm:p-2 border-b border-gray-200 bg-gray-50 dark:bg-slate-950 dark:border-slate-700 max-h-[35%] max-sm:max-h-none overflow-y-auto max-sm:overflow-visible">
              {older.card}
              {newer.card}
            </div>
          )}
          {/* Sits with the description cards, above the document and outside
              its scroller, so it stays in view while the document is read. */}
          {isUnchanged && (
            <div className="flex-shrink-0 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 px-4 py-2.5 max-sm:px-3 max-sm:py-2 max-sm:text-center border-b border-green-200 bg-green-50">
              <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
              <p className="text-sm font-medium text-green-800">No changes detected</p>
              <p className="text-xs text-green-700">Content is identical between these versions.</p>
            </div>
          )}
          <div className="flex-1 overflow-hidden max-sm:flex-none max-sm:overflow-visible">
          {!hasContent ? (
            <div className="text-center text-gray-500 py-12">
              <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>Extracted text not available for comparison.</p>
            </div>
          ) : viewMode === 'side-by-side' ? (
            /* Phones: the two versions stack (older above, newer below), each
               at full width, instead of two unreadably narrow columns. */
            <div className="flex max-sm:flex-col h-full max-sm:h-auto gap-0">
              {/* Older */}
              <div className="flex-1 max-sm:flex-none flex flex-col border-r max-sm:border-r-0 max-sm:border-b border-gray-300 min-w-0 min-h-0">
                <div className="px-4 max-sm:px-3 py-2.5 max-sm:py-2 bg-red-50 border-b border-gray-200 flex-shrink-0">
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <span className="w-2 h-2 bg-red-400 rounded-full flex-shrink-0"></span>
                    <span className="text-sm max-sm:text-xs font-semibold text-red-800">{olderLabel}</span>
                    <span className="text-xs text-red-600 ml-1">(older)</span>
                  </div>
                  <p className="text-xs text-red-600 mt-0.5 truncate">{older.name}</p>
                </div>
                <div ref={leftPaneRef} onScroll={handlePaneScroll('left')} className="flex-1 overflow-y-auto max-sm:overflow-visible p-4 max-sm:p-2">
                  <div className="tf-panel p-5 max-sm:p-3">
                    {isMatchesMode
                      ? olderMatchLines.map((line, idx) => renderDiffLine(line, idx, 'left'))
                      : sidePairs.map((pair, idx) => renderDiffLine(pair.left, idx, 'left'))}
                  </div>
                </div>
              </div>
              {/* Newer */}
              <div className="flex-1 max-sm:flex-none flex flex-col min-w-0 min-h-0">
                <div className="px-4 max-sm:px-3 py-2.5 max-sm:py-2 bg-green-50 border-b border-gray-200 flex-shrink-0">
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <span className="w-2 h-2 bg-green-400 rounded-full flex-shrink-0"></span>
                    <span className="text-sm max-sm:text-xs font-semibold text-green-800">{newerLabel}</span>
                    <span className="text-xs text-green-600 ml-1">(newer)</span>
                  </div>
                  <p className="text-xs text-green-600 mt-0.5 truncate">{newer.name}</p>
                </div>
                <div ref={rightPaneRef} onScroll={handlePaneScroll('right')} className="flex-1 overflow-y-auto max-sm:overflow-visible p-4 max-sm:p-2">
                  <div className="tf-panel p-5 max-sm:p-3">
                    {isMatchesMode
                      ? newerMatchLines.map((line, idx) => renderDiffLine(line, idx, 'right'))
                      : sidePairs.map((pair, idx) => renderDiffLine(pair.right, idx, 'right'))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Unified */
            <div className="h-full max-sm:h-auto overflow-y-auto max-sm:overflow-visible p-6 max-sm:p-2">
              <div className="tf-card-soft p-8 max-sm:p-3 max-w-3xl mx-auto">
                {shouldRenderMarkdown ? diff.lines.map((line, idx) => (
                  renderMarkdownDiffLine(line, idx, 'unified')
                )) : diff.lines.map((line, idx) => {
                  const trimmed = line.text.trim();
                  if (!trimmed) return <div key={idx} className="h-3" />;

                  if (isSectionHeader(trimmed)) {
                    return (
                      <h3 key={idx} className="tf-section-title mt-5 mb-2 pb-1 border-b border-gray-300 uppercase tracking-wide">
                        {trimmed}
                      </h3>
                    );
                  }

                  const highlightClass = highlightMode === 'matches'
                    ? (line.type === 'unchanged' ? 'bg-green-100 border-l-4 border-green-500 pl-3' : 'bg-amber-50 border-l-4 border-amber-400 pl-3')
                    : line.type === 'added'
                      ? 'bg-green-100 border-l-4 border-green-500 pl-3'
                      : line.type === 'removed'
                        ? 'bg-red-50 border-l-4 border-red-400 pl-3 line-through opacity-70'
                        : '';

                  const textColor = highlightMode === 'matches'
                    ? (line.type === 'unchanged' ? 'text-green-900' : 'text-amber-900')
                    : line.type === 'added'
                      ? 'text-green-900'
                      : line.type === 'removed'
                        ? 'text-red-700'
                        : 'text-gray-800';

                  if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
                    return (
                      <p key={idx} className={`text-sm leading-relaxed pl-4 mb-0.5 rounded ${highlightClass} ${textColor}`}>
                        {trimmed}
                      </p>
                    );
                  }

                  return (
                    <p key={idx} className={`text-sm leading-relaxed mb-0.5 rounded ${highlightClass} ${textColor}`}>
                      {trimmed}
                    </p>
                  );
                })}
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
