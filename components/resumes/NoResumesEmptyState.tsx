'use client';

import { Plus } from 'lucide-react';

interface NoResumesEmptyStateProps {
  /** Headline. Defaults to the standard "No Resumes Found". */
  title?: string;
  /** Body copy. Rendered as-is, so a caller can pass its own two-line wording. */
  description?: string;
  /** Omit `onAction` and the button is left out — used where the viewer has no
   *  upload permission, or where the empty state is purely informational. */
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

/**
 * The illustrated empty state for resume lists — a folder waiting on its first
 * document, the headline, the explanation and the one action that resolves it.
 *
 * Deliberately not the generic `EmptyState`: that one is an icon in a circle,
 * which reads as an error notice on a page whose whole body is the empty state.
 * A first-time user landing on My Resumes sees this instead, and the CTA is the
 * only upload entry point on screen when there are no rows to hang menus off.
 */
export default function NoResumesEmptyState({
  title = 'No Resumes Found',
  description = 'No resumes are available in this folder yet. Add a resume to get started.',
  actionLabel = 'Add Resume',
  onAction,
  className = '',
}: NoResumesEmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center px-4 py-14 text-center sm:py-20 ${className}`}>
      <ResumeFolderIllustration />

      <h3 className="mt-7 text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">
        {title}
      </h3>

      {/* max-w keeps the copy breaking into the two balanced lines the design
          calls for instead of one long measure on wide screens. An explicit
          empty string (the Archived Resumes folder) drops the paragraph
          entirely rather than leaving a blank line. */}
      {description && (
        <p className="mt-2.5 max-w-sm text-sm leading-relaxed text-gray-500 sm:text-base">
          {description}
        </p>
      )}

      {onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-7 inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand-blue px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 transition-all hover:bg-brand-blue-2 hover:shadow-md hover:shadow-brand-blue/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2"
        >
          <Plus className="h-4 w-4" />
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/**
 * Inline SVG rather than an asset: it ships with the component, inherits no
 * network cost, and the tints stay in step with the brand palette.
 */
function ResumeFolderIllustration() {
  return (
    <svg
      viewBox="0 0 260 180"
      role="img"
      aria-label="An empty folder waiting for a resume"
      className="h-auto w-[190px] sm:w-[230px]"
    >
      <defs>
        <linearGradient id="tf-empty-folder-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#93b0f8" />
          <stop offset="100%" stopColor="#6c92f0" />
        </linearGradient>
        <linearGradient id="tf-empty-folder-back" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5b86ea" />
          <stop offset="100%" stopColor="#7ba1f4" />
        </linearGradient>
      </defs>

      {/* Soft backdrop — overlapping blobs, barely there, so the folder sits on
          something rather than floating on bare white. Wider than the folder on
          both flanks: the point is the halo around it, not a shape behind it. */}
      <g fill="#eef2fd">
        <circle cx="88" cy="92" r="50" />
        <circle cx="172" cy="92" r="50" />
        <rect x="78" y="92" width="104" height="50" rx="22" />
        <circle cx="130" cy="56" r="34" />
      </g>

      {/* The document the folder is waiting for: dashed outline with a folded
          corner, drawn behind the folder so it reads as "not filed yet". It
          clears the folder tab by a good margin — half-hidden, it just looked
          like a smudge above the folder. */}
      <g>
        <path
          d="M102 12h36l20 20v70h-56z"
          fill="#f7f9ff"
          stroke="#b9caf6"
          strokeWidth="1.6"
          strokeDasharray="5 4"
          strokeLinejoin="round"
        />
        <path d="M138 12l20 20h-20z" fill="#cfdcfa" />
      </g>

      {/* Folder — back tab, then the front panel over the document. */}
      <path
        d="M91 52h27l9 11h42a7 7 0 017 7v12H84V59a7 7 0 017-7z"
        fill="url(#tf-empty-folder-back)"
      />
      <path
        d="M91 74h78a7 7 0 017 7v54a7 7 0 01-7 7H91a7 7 0 01-7-7V81a7 7 0 017-7z"
        fill="url(#tf-empty-folder-front)"
      />

      {/* Document glyph on the folder face. */}
      <circle cx="130" cy="108" r="18" fill="#ffffff" fillOpacity="0.22" />
      <g stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M124 99h8l4 4v13a1.5 1.5 0 01-1.5 1.5h-10.5a1.5 1.5 0 01-1.5-1.5V100.5A1.5 1.5 0 01124 99z" />
        <path d="M132 99v4h4" />
        <path d="M126 110h8M126 114h5" />
      </g>

      {/* Sparkle marks — the small asymmetries that keep the composition from
          looking like a centred logo. */}
      <g stroke="#b9caf6" strokeWidth="1.6" strokeLinecap="round">
        <path d="M206 32v8M202 36h8" />
        <path d="M210 106v6M207 109h6" />
        <path d="M56 136v6M53 139h6" />
      </g>
      <g fill="none" stroke="#b9caf6" strokeWidth="1.6">
        <circle cx="42" cy="78" r="3.2" />
        <circle cx="222" cy="80" r="3.2" />
      </g>
    </svg>
  );
}
