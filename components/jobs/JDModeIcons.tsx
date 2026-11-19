'use client';

/* Create JD's mode cards (AI-Generated JD / Manual Input): each icon sits in a
   rounded tile. Inactive: a quiet grey tile, still. Active: a brand-blue tile
   with a white icon that moves — the AI sparkles twinkle, the pencil writes a
   line. The motion is the `tf-mode-*` rules in globals.css, which only run
   under `[data-active=true]` and stop under reduced motion. */

const TILE =
  'flex-shrink-0 grid place-items-center w-10 h-10 sm:w-11 sm:h-11 rounded-xl transition-[background-color,box-shadow,color] duration-300 ease-[cubic-bezier(.22,1,.36,1)]';
const TILE_ON = 'bg-gradient-to-br from-[#4F8BFF] to-brand-blue text-white shadow-md shadow-brand-blue/25';
const TILE_OFF = 'bg-gray-100 text-gray-400 dark:bg-slate-800 dark:text-slate-500';

/** A four-point sparkle centred on (cx, cy) with radius r. */
function star(cx: number, cy: number, r: number) {
  const k = r * 0.18;
  return `M${cx} ${cy - r}C${cx + k} ${cy - k} ${cx + k} ${cy - k} ${cx + r} ${cy}C${cx + k} ${cy + k} ${cx + k} ${cy + k} ${cx} ${cy + r}C${cx - k} ${cy + k} ${cx - k} ${cy + k} ${cx - r} ${cy}C${cx - k} ${cy - k} ${cx - k} ${cy - k} ${cx} ${cy - r}z`;
}

export function AIModeIcon({ active }: { active: boolean }) {
  return (
    <span className={`${TILE} ${active ? TILE_ON : TILE_OFF}`} data-active={active} aria-hidden>
      <svg viewBox="0 0 24 24" className="w-5 h-5 sm:w-[22px] sm:h-[22px] overflow-visible">
        <path className="tf-mode-star-main" d={star(11, 13, 8)} fill="currentColor" />
        <path className="tf-mode-star-a" d={star(19, 5, 3.2)} fill="currentColor" />
        <path className="tf-mode-star-b" d={star(20, 17, 2.2)} fill="currentColor" />
      </svg>
    </span>
  );
}

export function ManualModeIcon({ active }: { active: boolean }) {
  return (
    <span className={`${TILE} ${active ? TILE_ON : TILE_OFF}`} data-active={active} aria-hidden>
      <svg viewBox="0 0 24 24" className="w-5 h-5 sm:w-[22px] sm:h-[22px] overflow-visible" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {/* Lines already written, and the one being written now. */}
        <path d="M3 5h10M3 9h7" opacity="0.55" />
        <path className="tf-mode-ink" d="M3 20h12" />
        {/* Pencil: its point rides along the line being written. */}
        <g className="tf-mode-pencil">
          <path d="M14 20l1-4 6-6 3 3-6 6z" fill="currentColor" fillOpacity="0.2" />
          <path d="M19.5 11.5l3 3" />
        </g>
      </svg>
    </span>
  );
}
