'use client';

import { Plus } from 'lucide-react';

interface UploadHistoryEmptyStateProps {
  title: string;
  /** Each entry is its own line, so the copy breaks where the design wants it
   *  to rather than wherever the container happens to wrap. */
  lines: string[];
  actionLabel?: string;
  /** Omitted when the viewer can't upload — the CTA would be a dead end. */
  onAction?: () => void;
}

/**
 * The empty state for the Upload History modal's tabs — a filing tray still
 * waiting on its first batch, and the one action that fills it.
 *
 * The dashed frame is deliberate: it reads as a drop zone waiting for content,
 * which is what an empty history is, and it separates the state from the solid
 * cards a populated tab shows.
 */
export default function UploadHistoryEmptyState({
  title,
  lines,
  actionLabel = 'Upload Resumes',
  onAction,
}: UploadHistoryEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-brand-blue/20 bg-white px-4 py-10 text-center sm:py-14">
      <TrayIllustration />

      <h3 className="mt-6 text-lg font-bold tracking-tight text-gray-900 sm:text-xl">
        {title}
      </h3>

      <div className="mt-2 space-y-0.5">
        {lines.map((line, i) => (
          <p key={i} className="text-xs leading-relaxed text-gray-500 sm:text-sm">
            {line}
          </p>
        ))}
      </div>

      {onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-6 inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand-blue px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 transition-all hover:bg-brand-blue-2 hover:shadow-md hover:shadow-brand-blue/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2"
        >
          <Plus className="h-4 w-4" />
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/** A four-point sparkle — concave sides, so it reads as a glint rather than a plus. */
function Sparkle({ cx, cy, s }: { cx: number; cy: number; s: number }) {
  return (
    <path
      d={`M${cx} ${cy - s}Q${cx} ${cy} ${cx + s} ${cy}Q${cx} ${cy} ${cx} ${cy + s}Q${cx} ${cy} ${cx - s} ${cy}Q${cx} ${cy} ${cx} ${cy - s}z`}
      fill="var(--raw-b4c8f5)"
    />
  );
}

function TrayIllustration() {
  return (
    <svg
      viewBox="0 0 260 180"
      role="img"
      aria-label="A filing tray waiting for its first upload"
      className="h-auto w-[200px] sm:w-[240px]"
    >
      <defs>
        <linearGradient id="tf-tray-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--raw-8fb0f7)" />
          <stop offset="100%" stopColor="var(--raw-6288ee)" />
        </linearGradient>
        <linearGradient id="tf-tray-back" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--raw-5b81ea)" />
          <stop offset="100%" stopColor="var(--raw-7ba1f4)" />
        </linearGradient>
      </defs>

      {/* Cloud drifts flanking the tray — they give the object a horizon to sit
          on without drawing a ground line. */}
      <g fill="var(--raw-eef2fd)">
        <circle cx="66" cy="116" r="26" />
        <circle cx="94" cy="106" r="32" />
        <rect x="44" y="116" width="72" height="30" rx="15" />
        <circle cx="194" cy="114" r="26" />
        <circle cx="168" cy="106" r="30" />
        <rect x="156" y="114" width="70" height="30" rx="15" />
      </g>

      {/* The document rising out of the tray: the report that isn't there yet. */}
      <g>
        <path
          d="M100 18h40l16 16v78h-56z"
          fill="var(--raw-ffffff)"
          stroke="var(--raw-c7d6f8)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="M140 18l16 16h-16z" fill="var(--raw-dbe5fb)" />
        <rect x="110" y="44" width="22" height="8" rx="2" fill="var(--raw-93b0f8)" />
        <g stroke="var(--raw-cfdcfa)" strokeWidth="3" strokeLinecap="round">
          <path d="M110 64h36" />
          <path d="M110 76h24" />
        </g>
      </g>

      {/* Tray — the back rim reads as the far wall, the front panel closes over
          the document so it sits inside rather than in front. */}
      <path d="M86 94h88l12 14H74z" fill="url(#tf-tray-back)" />
      <path
        d="M74 108h112l-14 46a8 8 0 01-7.7 6H95.7a8 8 0 01-7.7-6z"
        fill="url(#tf-tray-front)"
      />
      <rect x="112" y="128" width="36" height="9" rx="4.5" fill="var(--raw-ffffff)" fillOpacity="0.75" />

      <Sparkle cx={88} cy={44} s={5} />
      <Sparkle cx={198} cy={54} s={4} />
      <Sparkle cx={54} cy={86} s={3.5} />
      <Sparkle cx={212} cy={98} s={4} />
      <Sparkle cx={70} cy={158} s={3.5} />
    </svg>
  );
}
