import type { ReactNode } from 'react';
import {
  ILLUSTRATION_ACCENT as ACCENT,
  ILLUSTRATION_DEEP as DEEP,
  Illustration,
  type IllustrationIds,
} from '@/components/ui/illustrated-empty-state';

/* Illustrations for the Job Details results tabs' empty states: a blue folder
   with a dashed draft page behind it, and a badge saying which tab it is. */

function Sparkles() {
  return (
    <>
      <circle cx="30" cy="70" r="3.5" fill="none" stroke="#7FB0FF" strokeWidth="2" />
      <circle cx="208" cy="70" r="3.5" fill="none" stroke="#7FB0FF" strokeWidth="2" />
      <path d="M180 18v10M175 23h10M186 92v9M181.5 96.5h9M50 112v8M46 116h8" stroke="#7FB0FF" strokeWidth="2.5" strokeLinecap="round" />
    </>
  );
}

/** The dashed draft page sticking out of the folder, with optional content. */
function DraftPage({ children }: { children?: ReactNode }) {
  return (
    <g>
      <path d="M90 6h36l14 14v52H90z" fill="#fff" stroke="#A9CBFF" strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round" />
      <path d="M126 6v14h14" fill="#DCE9FF" stroke="#A9CBFF" strokeWidth="2" strokeLinejoin="round" />
      {children}
    </g>
  );
}

function Folder({ ids }: { ids: IllustrationIds }) {
  return (
    <path
      d="M66 48a6 6 0 016-6h28l6 6h54a6 6 0 016 6v60a6 6 0 01-6 6H72a6 6 0 01-6-6z"
      fill={`url(#${ids.blue})`}
    />
  );
}

function Magnifier({ cx, cy }: { cx: number; cy: number }) {
  return (
    <>
      <path d={`M${cx + 11} ${cy + 11}l12 12`} stroke={DEEP} strokeWidth="6" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="16" fill="#DCE9FF" fillOpacity="0.7" stroke={ACCENT} strokeWidth="5" />
    </>
  );
}

/** AI Talent Match: a group of people on the folder, magnifier beside it. */
export function TalentMatchIllustration() {
  return (
    <Illustration>
      {ids => (
        <>
          <Sparkles />
          <DraftPage />
          <Folder ids={ids} />
          <g fill="#fff">
            <circle cx="104" cy="74" r="5" />
            <circle cx="128" cy="74" r="5" />
            <circle cx="116" cy="71" r="6" />
            <path d="M94 96c0-7 4-11 10-11s10 4 10 11zM118 96c0-7 4-11 10-11s10 4 10 11z" opacity="0.9" />
            <path d="M104 98c0-9 5-14 12-14s12 5 12 14z" />
          </g>
          <Magnifier cx={170} cy={84} />
        </>
      )}
    </Illustration>
  );
}

/** Assessment: a checklist page and a target with an arrow. */
export function AssessmentIllustration() {
  return (
    <Illustration>
      {ids => (
        <>
          <Sparkles />
          <DraftPage>
            <path d="M97 22l4 4 7-8M97 38l4 4 7-8" fill="none" stroke={DEEP} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M114 22h18M114 38h18" stroke="#A9CBFF" strokeWidth="3" strokeLinecap="round" />
          </DraftPage>
          <Folder ids={ids} />
          <circle cx="160" cy="100" r="20" fill="#fff" stroke={ACCENT} strokeWidth="5" />
          <circle cx="160" cy="100" r="10" fill="none" stroke={ACCENT} strokeWidth="4" />
          <circle cx="160" cy="100" r="3.5" fill={DEEP} />
          <path d="M162 98l18-18" stroke={DEEP} strokeWidth="3.5" strokeLinecap="round" />
          <path d="M176 76l8-2-2 8z" fill={DEEP} stroke={DEEP} strokeWidth="2" strokeLinejoin="round" />
        </>
      )}
    </Illustration>
  );
}

/** Scored resumes: a résumé card on the folder, magnifier beside it. */
export function ScoredResumesIllustration() {
  return (
    <Illustration>
      {ids => (
        <>
          <Sparkles />
          <DraftPage />
          <Folder ids={ids} />
          <rect x="86" y="62" width="62" height="46" rx="5" fill="#fff" />
          <circle cx="100" cy="76" r="5" fill={ACCENT} />
          <path d="M92 89c0-5 3.5-8 8-8s8 3 8 8z" fill={ACCENT} />
          <path d="M114 74h24M114 82h18M94 97h40" stroke="#A9CBFF" strokeWidth="3" strokeLinecap="round" />
          <Magnifier cx={166} cy={90} />
        </>
      )}
    </Illustration>
  );
}

/** Job list, nothing created yet: a briefcase on the folder. */
export function NoJobsIllustration() {
  return (
    <Illustration>
      {ids => (
        <>
          <Sparkles />
          <DraftPage />
          <Folder ids={ids} />
          <path d="M108 70v-4a4 4 0 014-4h12a4 4 0 014 4v4" fill="none" stroke="#fff" strokeWidth="3.5" />
          <rect x="94" y="70" width="48" height="32" rx="5" fill="#fff" />
          <path d="M94 82c8 4 16 6 24 6s16-2 24-6" fill="none" stroke={ACCENT} strokeWidth="2.5" />
          <rect x="113" y="82" width="10" height="8" rx="2" fill="#fff" stroke={ACCENT} strokeWidth="2.5" />
        </>
      )}
    </Illustration>
  );
}

/** Job list, a search or filter matched nothing: a magnifier on the folder. */
export function NoJobsFoundIllustration() {
  return (
    <Illustration>
      {ids => (
        <>
          <Sparkles />
          <DraftPage />
          <Folder ids={ids} />
          <circle cx="112" cy="80" r="13" fill="none" stroke="#fff" strokeWidth="5" />
          <path d="M121.5 89.5l11 11" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
        </>
      )}
    </Illustration>
  );
}

/** AI interview: a video panel on the folder, with a person badge. */
export function InterviewIllustration() {
  return (
    <Illustration>
      {ids => (
        <>
          <Sparkles />
          <DraftPage />
          <Folder ids={ids} />
          <rect x="86" y="62" width="58" height="42" rx="7" fill="#fff" opacity="0.92" />
          <circle cx="115" cy="83" r="12" fill={ACCENT} />
          <path d="M111 77l10 6-10 6z" fill="#fff" />
          <circle cx="156" cy="108" r="16" fill={DEEP} stroke="#fff" strokeWidth="3" />
          <circle cx="156" cy="103" r="5" fill="#fff" />
          <path d="M147 117c0-5 4-8 9-8s9 3 9 8z" fill="#fff" />
        </>
      )}
    </Illustration>
  );
}

/** Create JD, nothing generated yet: AI writing a job description — text
 *  lines on a page, a cursor at the last one, and a magic wand with sparkles. */
export function GenerateJDIllustration() {
  /* x, y, width of each text line on the page. */
  const lines: [number, number, number][] = [
    [92, 52, 40], [92, 64, 52], [92, 74, 46], [92, 84, 52], [92, 94, 30],
  ];
  return (
    <Illustration>
      {ids => (
        <>
          {/* The page being written, with a soft shadow under it. */}
          <rect x="80" y="20" width="76" height="98" rx="8" fill={DEEP} opacity="0.12" transform="translate(3 4)" />
          <rect x="80" y="20" width="76" height="98" rx="8" fill="#fff" />
          <rect x="80" y="20" width="76" height="22" rx="8" fill={`url(#${ids.blue})`} />
          <rect x="80" y="34" width="76" height="8" fill={`url(#${ids.blue})`} />
          <circle cx="93" cy="31" r="5" fill="#fff" opacity="0.9" />
          <rect x="102" y="27" width="34" height="4" rx="2" fill="#fff" opacity="0.9" />
          <rect x="102" y="34" width="22" height="3" rx="1.5" fill="#fff" opacity="0.6" />
          {lines.map(([x, y, w], i) => (
            <rect
              key={i}
              x={x}
              y={y}
              width={w}
              height="4"
              rx="2"
              fill={i === 0 ? ACCENT : '#A9CBFF'}
            />
          ))}
          <rect x="125" y="91" width="2.5" height="10" rx="1" fill={DEEP} />
          {/* Magic wand, its tip glowing over the page's corner. */}
          <path d="M196 104l-34-34" stroke={DEEP} strokeWidth="7" strokeLinecap="round" />
          <path d="M196 104l-34-34" stroke="#6AA5FF" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
          <path d="M170 78l-8-8" stroke="#fff" strokeWidth="7" strokeLinecap="round" />
          <circle cx="160" cy="68" r="11" fill="#A9CBFF" opacity="0.5" />
          {/* AI sparkles: four-point stars around the wand and page. */}
          {([[160, 68, 9], [182, 40, 7], [60, 46, 6], [204, 80, 5], [62, 98, 4]] as const).map(([cx, cy, r], i) => (
            <path
              key={i}
              d={`M${cx} ${cy - r}C${cx + r * 0.15} ${cy - r * 0.15} ${cx + r * 0.15} ${cy - r * 0.15} ${cx + r} ${cy}C${cx + r * 0.15} ${cy + r * 0.15} ${cx + r * 0.15} ${cy + r * 0.15} ${cx} ${cy + r}C${cx - r * 0.15} ${cy + r * 0.15} ${cx - r * 0.15} ${cy + r * 0.15} ${cx - r} ${cy}C${cx - r * 0.15} ${cy - r * 0.15} ${cx - r * 0.15} ${cy - r * 0.15} ${cx} ${cy - r}z`}
              fill={i === 0 ? '#fff' : i % 2 ? ACCENT : '#7FB0FF'}
              stroke={i === 0 ? ACCENT : 'none'}
              strokeWidth={i === 0 ? 1.5 : 0}
            />
          ))}
          <circle cx="40" cy="72" r="3.5" fill="none" stroke="#7FB0FF" strokeWidth="2" />
          <circle cx="214" cy="56" r="3" fill="none" stroke="#7FB0FF" strokeWidth="2" />
        </>
      )}
    </Illustration>
  );
}

/** Create JD, manual input, nothing written yet: a pencil writing the job
 *  description page, with a clipboard behind it for "paste". The same page as
 *  GenerateJDIllustration, so the two modes read as a pair — pencil instead of
 *  wand, and no AI sparkles. */
export function ManualJDIllustration() {
  /* x, y, width of each text line; the last is mid-sentence at the pencil. */
  const lines: [number, number, number][] = [
    [92, 52, 40], [92, 64, 52], [92, 74, 46], [92, 84, 52], [92, 94, 38],
  ];
  return (
    <Illustration>
      {ids => (
        <>
          <Sparkles />
          {/* Clipboard tucked behind the page. */}
          <g transform="rotate(-10 78 72)">
            <rect x="52" y="32" width="50" height="78" rx="7" fill="#DCE9FF" stroke="#A9CBFF" strokeWidth="2" />
            <rect x="66" y="27" width="22" height="10" rx="3" fill={`url(#${ids.light})`} />
            <path d="M60 52h18M60 62h14M60 72h18" stroke="#A9CBFF" strokeWidth="3" strokeLinecap="round" />
          </g>
          {/* The page, with a soft shadow under it. */}
          <rect x="80" y="20" width="76" height="98" rx="8" fill={DEEP} opacity="0.12" transform="translate(3 4)" />
          <rect x="80" y="20" width="76" height="98" rx="8" fill="#fff" />
          <rect x="80" y="20" width="76" height="22" rx="8" fill={`url(#${ids.blue})`} />
          <rect x="80" y="34" width="76" height="8" fill={`url(#${ids.blue})`} />
          <circle cx="93" cy="31" r="5" fill="#fff" opacity="0.9" />
          <rect x="102" y="27" width="34" height="4" rx="2" fill="#fff" opacity="0.9" />
          <rect x="102" y="34" width="22" height="3" rx="1.5" fill="#fff" opacity="0.6" />
          {lines.map(([x, y, w], i) => (
            <rect key={i} x={x} y={y} width={w} height="4" rx="2" fill={i === 0 ? ACCENT : '#A9CBFF'} />
          ))}
          {/* Pencil, its point at the end of the last line. */}
          <g transform="translate(132 98) rotate(-45)">
            <path d="M0 0l10-5.5v11z" fill="#FCE3C4" />
            <path d="M0 0l3.6-2v4z" fill="#0F1E3D" />
            <rect x="10" y="-5.5" width="46" height="11" fill={`url(#${ids.blue})`} />
            <rect x="10" y="-1.2" width="46" height="2.4" fill="#fff" opacity="0.35" />
            <rect x="56" y="-5.5" width="5" height="11" fill="#E6EFFE" />
            <rect x="61" y="-5.5" width="10" height="11" rx="3" fill="#A9CBFF" />
          </g>
        </>
      )}
    </Illustration>
  );
}
