import type { ReactNode } from 'react';
import {
  ILLUSTRATION_ACCENT as ACCENT,
  ILLUSTRATION_DEEP as DEEP,
  IllustratedEmptyState,
  Illustration,
  type IllustrationIds,
} from '@/components/ui/illustrated-empty-state';

/* The Resume Database / My Resumes empty states, on the shared illustrated card. */

/** Ring on the left, plus sparkles top-right and right — every drawing in the sheet. */
function Sparkles() {
  return (
    <>
      <circle cx="34" cy="62" r="4" fill="none" stroke={ACCENT} strokeWidth="2.5" />
      <path d="M182 12v12M176 18h12M196 62v10M191 67h10" stroke={ACCENT} strokeWidth="3" strokeLinecap="round" />
    </>
  );
}

/** A résumé page: folded corner and text lines. `x`,`y` is its top-left. */
function ResumePage({ x, y, w = 58, h = 76, person = false }: { x: number; y: number; w?: number; h?: number; person?: boolean }) {
  const fold = 12;
  return (
    <g>
      <path
        d={`M${x + 4} ${y}h${w - fold - 4}l${fold} ${fold}v${h - fold - 4}a4 4 0 01-4 4H${x + 4}a4 4 0 01-4-4V${y + 4}a4 4 0 014-4z`}
        fill="#fff"
        stroke="#A9CBFF"
        strokeWidth="2"
      />
      <path d={`M${x + w - fold} ${y}v${fold - 3}a3 3 0 003 3h${fold - 3}`} fill="#DCE9FF" stroke="#A9CBFF" strokeWidth="2" />
      {person ? (
        <>
          <circle cx={x + 15} cy={y + 18} r="5" fill={ACCENT} />
          <path d={`M${x + 7} ${y + 34}c0-6 4-9 8-9s8 3 8 9z`} fill={ACCENT} />
          <path d={`M${x + 29} ${y + 18}h16M${x + 29} ${y + 28}h12M${x + 9} ${y + 44}h38`} stroke="#A9CBFF" strokeWidth="3" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d={`M${x + 10} ${y + 18}h14M${x + 10} ${y + 28}h14`} stroke={ACCENT} strokeWidth="4" strokeLinecap="round" />
          <path d={`M${x + 30} ${y + 18}h12M${x + 30} ${y + 28}h14M${x + 10} ${y + 40}h34M${x + 10} ${y + 52}h28M${x + 10} ${y + 63}h20`} stroke="#A9CBFF" strokeWidth="3.5" strokeLinecap="round" />
        </>
      )}
    </g>
  );
}

/** A blue folder (front pocket) — draw any page behind it first. */
function FolderFront({ ids, x = 66, y = 58, w = 104, h = 62 }: { ids: IllustrationIds; x?: number; y?: number; w?: number; h?: number }) {
  return (
    <path
      d={`M${x} ${y + 6}a6 6 0 016-6h26l6 6h${w - 44}a6 6 0 016 6v${h - 12}a6 6 0 01-6 6H${x + 6}a6 6 0 01-6-6z`}
      fill={`url(#${ids.blue})`}
    />
  );
}

/** White disc with a blue ring at the drawing's bottom-right. */
function Badge({ cx, cy, filled = false, children }: { cx: number; cy: number; filled?: boolean; children: ReactNode }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r="17" fill={filled ? DEEP : '#fff'} stroke={filled ? '#fff' : ACCENT} strokeWidth={filled ? 3 : 4} />
      {children}
    </g>
  );
}

function Magnifier({ cx, cy, r = 14 }: { cx: number; cy: number; r?: number }) {
  return (
    <>
      <path d={`M${cx + r * 0.7} ${cy + r * 0.7}l${r * 0.8} ${r * 0.8}`} stroke={DEEP} strokeWidth="6" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={r} fill="#fff" fillOpacity="0.85" stroke={ACCENT} strokeWidth="5" />
    </>
  );
}

function FolderResumeIllustration() {
  return (
    <Illustration>
      {ids => (
        <>
          <Sparkles />
          <ResumePage x={94} y={10} w={58} h={70} person />
          <FolderFront ids={ids} />
          {/* folder outline mark on the pocket */}
          <path d="M104 78a3 3 0 013-3h9l4 4h13a3 3 0 013 3v16a3 3 0 01-3 3h-26a3 3 0 01-3-3z" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinejoin="round" />
        </>
      )}
    </Illustration>
  );
}

function FolderSearchIllustration() {
  return (
    <Illustration>
      {ids => (
        <>
          <Sparkles />
          <ResumePage x={92} y={12} w={60} h={64} />
          <FolderFront ids={ids} />
          <circle cx="116" cy="86" r="11" fill="none" stroke="#fff" strokeWidth="4" />
          <path d="M124 94l8 8" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
        </>
      )}
    </Illustration>
  );
}

function ResumeSearchIllustration() {
  return (
    <Illustration>
      {() => (
        <>
          <Sparkles />
          <ResumePage x={86} y={14} w={66} h={96} />
          <Magnifier cx={152} cy={96} r={15} />
        </>
      )}
    </Illustration>
  );
}

function ResumeNoMatchIllustration() {
  return (
    <Illustration>
      {() => (
        <>
          <Sparkles />
          <ResumePage x={86} y={14} w={66} h={96} />
          <Badge cx={152} cy={100} filled>
            <path d="M145 93l14 14M159 93l-14 14" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
          </Badge>
        </>
      )}
    </Illustration>
  );
}

function ResumeIllustration() {
  return (
    <Illustration>
      {() => (
        <>
          <Sparkles />
          <ResumePage x={88} y={14} w={66} h={96} />
        </>
      )}
    </Illustration>
  );
}

function FolderPlusIllustration() {
  return (
    <Illustration>
      {ids => (
        <>
          <Sparkles />
          <ResumePage x={94} y={14} w={56} h={60} />
          <FolderFront ids={ids} />
          <Badge cx={166} cy={110}>
            <path d="M166 101v18M157 110h18" stroke={DEEP} strokeWidth="4" strokeLinecap="round" />
          </Badge>
        </>
      )}
    </Illustration>
  );
}

type StateProps = { title?: string; description?: string; bordered?: boolean; className?: string };

/** "My Folders" — no folders created yet. */
export function NoFoldersState({ title = 'My Folders', description = 'No folders yet. Create one to organize your resumes.', ...rest }: StateProps) {
  return <IllustratedEmptyState illustration={<FolderResumeIllustration />} title={title} description={description} {...rest} />;
}

/** A folder search / filter matched nothing. */
export function NoFoldersMatchState({ title = 'No folders match', description = 'No folders match the current search or filter.', ...rest }: StateProps) {
  return <IllustratedEmptyState illustration={<FolderSearchIllustration />} title={title} description={description} {...rest} />;
}

/** The resume table's default: a search matched nothing. */
export function NoResumesFoundState({
  title = 'No resumes found',
  description = "We couldn't find any resumes matching your search criteria. Try adjusting your filters or search terms.",
  ...rest
}: StateProps) {
  return <IllustratedEmptyState illustration={<ResumeSearchIllustration />} title={title} description={description} {...rest} />;
}

/** A resume search / filter matched nothing. */
export function NoMatchingResumesState({ title = 'No matching resumes', description, ...rest }: StateProps) {
  return <IllustratedEmptyState illustration={<ResumeNoMatchIllustration />} title={title} description={description} {...rest} />;
}

/** Nothing uploaded yet. */
export function NoResumesYetState({
  title = 'No resumes yet',
  description = 'Resumes you upload are saved here, ready to search and score against your jobs.',
  ...rest
}: StateProps) {
  return <IllustratedEmptyState illustration={<ResumeIllustration />} title={title} description={description} {...rest} />;
}

/** The folder sidebar's compact "No folders yet." — drawing above one line, no card. */
export function SidebarNoFoldersState() {
  return (
    <div className="flex flex-col items-center px-3 py-4 text-center">
      <div className="w-full max-w-[9rem]">
        <FolderPlusIllustration />
      </div>
      <p className="mt-2 tf-meta">No folders yet.</p>
    </div>
  );
}
