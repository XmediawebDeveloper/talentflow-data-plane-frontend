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
