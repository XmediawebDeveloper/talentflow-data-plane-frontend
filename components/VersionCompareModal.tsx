'use client';

import { useState } from 'react';
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
 * The résumé version diff — extracted from the resume detail page so the same
 * comparison opens from anywhere a version list is shown (the detail page, and
 * the version history popup on the resume lists).
 *
 * Two readings of one diff: side by side, older left / newer right with only
 * that side's changes tinted; or unified, one column with additions and
 * removals inline.
 */
export default function VersionCompareModal({ older, newer, onClose, title, subtitle, contentFormat = 'plain' }: VersionCompareModalProps) {
  const olderLabel = older.label || `Version ${older.version || '?'}`;
  const newerLabel = newer.label || `Version ${newer.version || '?'}`;
  const [viewMode, setViewMode] = useState<'side-by-side' | 'unified'>('side-by-side');
  const shouldRenderMarkdown = contentFormat === 'markdown';

  const olderText = older.text || '';
  const newerText = newer.text || '';
  const diff = buildUnifiedDiff(olderText, newerText);
  const sidePairs = buildDiffSidePairs(diff.lines);

  const diffHighlightClass = (line: DiffLine, side: 'left' | 'right' | 'unified') => {
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
        className={`markdown-content prose prose-sm max-w-none text-gray-700 leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 ${diffHighlightClass(line, side)}`}
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

    let bgClass = '';
    let textColor = 'text-gray-800';
    let borderClass = '';

    if (line.type === 'removed' && side === 'left') {
      bgClass = 'bg-red-50';
      textColor = 'text-red-800';
      borderClass = 'border-l-4 border-red-400 pl-2';
    } else if (line.type === 'added' && side === 'right') {
      bgClass = 'bg-green-50';
      textColor = 'text-green-800';
      borderClass = 'border-l-4 border-green-400 pl-2';
    }

    if (isSectionHeader(trimmed)) {
      return (
        <h3 key={idx} className={`text-xs font-bold mt-4 mb-1.5 pb-1 border-b border-gray-300 uppercase tracking-wide ${bgClass} ${borderClass} ${textColor}`}>
          {trimmed}
        </h3>
      );
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${viewMode === 'side-by-side' ? 'max-w-7xl' : 'max-w-4xl'} h-[85dvh] flex flex-col overflow-hidden transition-all duration-300`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-blue flex items-center justify-center shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
              <History className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 tracking-tight">{title || 'Version Comparison'}</h2>
              <p className="text-sm text-gray-500">
                {subtitle || `${olderLabel} vs ${newerLabel}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex bg-slate-100 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('side-by-side')}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors font-medium ${
                  viewMode === 'side-by-side'
                    ? 'bg-white text-brand-blue shadow-sm shadow-brand-blue/10 ring-1 ring-brand-blue/15'
                    : 'text-gray-500 hover:text-brand-blue'
                }`}
              >
                Side by Side
              </button>
              <button
                onClick={() => setViewMode('unified')}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors font-medium ${
                  viewMode === 'unified'
                    ? 'bg-white text-brand-blue shadow-sm shadow-brand-blue/10 ring-1 ring-brand-blue/15'
                    : 'text-gray-500 hover:text-brand-blue'
                }`}
              >
                Unified
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 border border-green-200 rounded-full text-green-700">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                +{diff.addedCount}
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 bg-red-50 border border-red-200 rounded-full text-red-700">
                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                −{diff.removedCount}
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden bg-gray-100">
          {!olderText && !newerText ? (
            <div className="text-center text-gray-500 py-12">
              <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>Extracted text not available for comparison.</p>
            </div>
          ) : diff.addedCount === 0 && diff.removedCount === 0 ? (
            <div className="text-center text-gray-500 py-12">
              <Check className="w-12 h-12 mx-auto mb-3 text-green-400" />
              <p className="font-medium">No changes detected</p>
              <p className="text-sm mt-1">Content is identical between these versions.</p>
            </div>
          ) : viewMode === 'side-by-side' ? (
            <div className="flex h-full gap-0">
              {/* Older */}
              <div className="flex-1 flex flex-col border-r border-gray-300 min-w-0">
                <div className="px-4 py-2.5 bg-red-50 border-b border-gray-200 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-red-400 rounded-full"></span>
                    <span className="text-sm font-semibold text-red-800">{olderLabel}</span>
                    <span className="text-xs text-red-600 ml-1">(older)</span>
                  </div>
                  <p className="text-xs text-red-600 mt-0.5 truncate">{older.name}</p>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="bg-white rounded-lg border border-gray-200 p-5">
                    {sidePairs.map((pair, idx) => renderDiffLine(pair.left, idx, 'left'))}
                  </div>
                </div>
              </div>
              {/* Newer */}
              <div className="flex-1 flex flex-col min-w-0">
                <div className="px-4 py-2.5 bg-green-50 border-b border-gray-200 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                    <span className="text-sm font-semibold text-green-800">{newerLabel}</span>
                    <span className="text-xs text-green-600 ml-1">(newer)</span>
                  </div>
                  <p className="text-xs text-green-600 mt-0.5 truncate">{newer.name}</p>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="bg-white rounded-lg border border-gray-200 p-5">
                    {sidePairs.map((pair, idx) => renderDiffLine(pair.right, idx, 'right'))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Unified */
            <div className="h-full overflow-y-auto p-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 max-w-3xl mx-auto">
                {shouldRenderMarkdown ? diff.lines.map((line, idx) => (
                  renderMarkdownDiffLine(line, idx, 'unified')
                )) : diff.lines.map((line, idx) => {
                  const trimmed = line.text.trim();
                  if (!trimmed) return <div key={idx} className="h-3" />;

                  const highlightClass = line.type === 'added'
                    ? 'bg-green-100 border-l-4 border-green-500 pl-3'
                    : line.type === 'removed'
                      ? 'bg-red-50 border-l-4 border-red-400 pl-3 line-through opacity-70'
                      : '';

                  const textColor = line.type === 'added'
                    ? 'text-green-900'
                    : line.type === 'removed'
                      ? 'text-red-700'
                      : 'text-gray-800';

                  if (isSectionHeader(trimmed)) {
                    return (
                      <h3 key={idx} className={`text-base font-bold mt-5 mb-2 pb-1 border-b border-gray-300 uppercase tracking-wide rounded ${highlightClass} ${textColor}`}>
                        {trimmed}
                      </h3>
                    );
                  }

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

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3 border-t border-gray-100 bg-slate-50 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-all text-sm font-medium shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
