import { useId, type ReactNode } from 'react';
import { Plus } from 'lucide-react';

/* Illustrated empty states: a soft blue drawing on a pale cloud, over a title,
   a line of text and an optional button, in a bordered card. Colours are the
   mockups' own (a brighter blue than the brand token), so they are fixed hex
   values rather than theme classes. */

export const ILLUSTRATION_ACCENT = '#3B82F6';
export const ILLUSTRATION_DEEP = '#2F6FEB';

/** Gradient ids an illustration's shapes fill with: `url(#${ids.blue})`. */
export type IllustrationIds = { blue: string; light: string };

const CLOUD =
  'M66 116c-16 0-26-12-24-26 2-12 12-20 24-20 2-22 20-38 42-36 10-14 28-20 44-14 14 4 24 16 26 30 18 0 32 14 32 32s-14 34-32 34z';

/**
 * The shared 240×140 canvas: gradients, the cloud, and the sparkle dot and
 * plus every mockup puts around the drawing. `children` draws the subject.
 */
export function Illustration({ children }: { children: (ids: IllustrationIds) => ReactNode }) {
  const id = useId().replace(/:/g, '');
  const ids = { blue: `${id}-blue`, light: `${id}-light` };
  return (
    <svg viewBox="0 0 240 140" className="w-full max-w-[14rem] h-auto" aria-hidden>
      <defs>
        <linearGradient id={ids.blue} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6AA5FF" />
          <stop offset="1" stopColor={ILLUSTRATION_DEEP} />
        </linearGradient>
        <linearGradient id={ids.light} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#A9CBFF" />
          <stop offset="1" stopColor="#6AA5FF" />
        </linearGradient>
        <radialGradient id={`${id}-cloud`} cx="0.5" cy="0.45" r="0.6">
          <stop offset="0" stopColor="#D3E3FD" />
          <stop offset="1" stopColor="#E6EFFE" />
        </radialGradient>
      </defs>
      <path d={CLOUD} fill={`url(#${id}-cloud)`} className="dark:opacity-30" />
      {children(ids)}
    </svg>
  );
}

/** The small ring and plus sparkles placed around a drawing. */
export function Sparkles({ ring = [36, 70], plus = [184, 24] }: { ring?: [number, number]; plus?: [number, number] }) {
  return (
    <>
      <circle cx={ring[0]} cy={ring[1]} r="4" fill="none" stroke={ILLUSTRATION_ACCENT} strokeWidth="2.5" />
      <path
        d={`M${plus[0]} ${plus[1] - 6}v12M${plus[0] - 6} ${plus[1]}h12`}
        stroke={ILLUSTRATION_ACCENT}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </>
  );
}

export function IllustratedEmptyState({
  illustration,
  title,
  description,
  action,
  className = '',
}: {
  illustration: ReactNode;
  title?: string;
  description?: string;
  action?: { label: string; onClick: () => void; disabledReason?: string };
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center text-center rounded-2xl border border-[#DCE6F7] dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-8 sm:py-10 ${className}`}
    >
      {illustration}
      {title && (
        <h3 className="mt-4 text-base sm:text-lg font-bold tracking-tight text-[#0F1E3D] dark:text-slate-50">{title}</h3>
      )}
      {description && (
        <p className={`${title ? 'mt-1.5' : 'mt-4'} max-w-md text-sm sm:text-base leading-relaxed text-[#0F1E3D]/80 dark:text-slate-300`}>
          {description}
        </p>
      )}
      {action && (
        <button
          type="button"
          onClick={() => { if (!action.disabledReason) action.onClick(); }}
          aria-disabled={action.disabledReason ? true : undefined}
          title={action.disabledReason || undefined}
          className={`mt-5 inline-flex items-center gap-2 h-10 px-5 rounded-lg text-sm font-semibold ${
            action.disabledReason ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'tf-btn-primary'
          }`}
        >
          <Plus className="w-4 h-4" />
          {action.label}
        </button>
      )}
    </div>
  );
}
