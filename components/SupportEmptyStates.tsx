import type { ReactNode } from 'react';
import {
  ILLUSTRATION_ACCENT as ACCENT,
  ILLUSTRATION_DEEP as DEEP,
  IllustratedEmptyState,
  Illustration,
  Sparkles,
  type IllustrationIds,
} from '@/components/ui/illustrated-empty-state';

/* The support ticket lists' empty states, on the shared illustrated card. */

/** A ticket stub — notched on both sides — with a note panel on its face. */
function TicketShape({ ids }: { ids: IllustrationIds }) {
  return (
    <>
      <path
        d="M70 36h92a8 8 0 018 8v16a9 9 0 000 18v16a8 8 0 01-8 8H70a8 8 0 01-8-8V78a9 9 0 000-18V44a8 8 0 018-8z"
        fill={`url(#${ids.blue})`}
      />
      <rect x="82" y="48" width="66" height="42" rx="4" fill="#fff" opacity="0.92" />
      <path d="M92 61h40M92 72h24" stroke="#7FB0FF" strokeWidth="3.5" strokeLinecap="round" />
    </>
  );
}

/** An inbox tray holding one document. */
function InboxShape({ ids }: { ids: IllustrationIds }) {
  return (
    <>
      <path d="M86 60h68l18 34H68z" fill={`url(#${ids.light})`} />
      <path d="M94 26h52v62H94z" fill="#fff" stroke="#A9CBFF" strokeWidth="2" strokeLinejoin="round" />
      <path d="M103 40h34M103 50h34M103 60h22" stroke="#7FB0FF" strokeWidth="3" strokeLinecap="round" />
      <path
        d="M66 92h32a4 4 0 014 4 8 8 0 008 8h20a8 8 0 008-8 4 4 0 014-4h32v24a6 6 0 01-6 6H72a6 6 0 01-6-6z"
        fill={`url(#${ids.blue})`}
      />
    </>
  );
}

/** White disc with a blue ring, bottom-right of the drawing, for a badge. */
function Badge({ cx, cy, children }: { cx: number; cy: number; children: ReactNode }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r="18" fill="#fff" stroke={ACCENT} strokeWidth="4" />
      {children}
    </g>
  );
}

function TicketPlusIllustration() {
  return (
    <Illustration>
      {ids => (
        <>
          <Sparkles />
          <TicketShape ids={ids} />
          <Badge cx={166} cy={100}>
            <path d="M166 91v18M157 100h18" stroke={DEEP} strokeWidth="4" strokeLinecap="round" />
          </Badge>
        </>
      )}
    </Illustration>
  );
}

function TicketSearchIllustration() {
  return (
    <Illustration>
      {ids => (
        <>
          <Sparkles />
          <TicketShape ids={ids} />
          <path d="M174 108l14 14" stroke={DEEP} strokeWidth="7" strokeLinecap="round" />
          <circle cx="162" cy="96" r="16" fill="#fff" stroke={ACCENT} strokeWidth="5" />
        </>
      )}
    </Illustration>
  );
}

function InboxIllustration() {
  return (
    <Illustration>
      {ids => (
        <>
          <Sparkles />
          <InboxShape ids={ids} />
        </>
      )}
    </Illustration>
  );
}

function InboxBurstIllustration() {
  return (
    <Illustration>
      {ids => (
        <>
          <Sparkles />
          <path d="M120 4v11M100 10l6 7M140 10l-6 7" stroke={ACCENT} strokeWidth="3" strokeLinecap="round" />
          <InboxShape ids={ids} />
        </>
      )}
    </Illustration>
  );
}

function InboxTeamIllustration() {
  return (
    <Illustration>
      {ids => (
        <>
          <Sparkles />
          <InboxShape ids={ids} />
          <Badge cx={172} cy={112}>
            {/* Two people side by side: the right one a lighter blue so they
                read as two figures, not a face. */}
            <g fill="#7FB0FF">
              <circle cx="178" cy="105" r="4.5" />
              <path d="M170 122c0-6 3.6-10 8-10s8 4 8 10z" />
            </g>
            <g fill={DEEP}>
              <circle cx="166" cy="106" r="5" />
              <path d="M157 122c0-6 4-10 9-10s9 4 9 10z" />
            </g>
          </Badge>
        </>
      )}
    </Illustration>
  );
}

/** "No tickets yet" — the user has never raised one. */
export function NoTicketsYetState({ onCreate }: { onCreate: () => void }) {
  return (
    <IllustratedEmptyState
      illustration={<TicketPlusIllustration />}
      title="No tickets yet"
      description="You haven't created any support tickets yet. Create your first ticket to get help from our support team."
      action={{ label: 'Create your first ticket', onClick: onCreate }}
    />
  );
}

/** A search or filter left nothing to show. */
export function NoTicketsFoundState({ title = 'No tickets found' }: { title?: string }) {
  return (
    <IllustratedEmptyState
      illustration={<TicketSearchIllustration />}
      title={title}
      description="Try adjusting your search or filters to find what you're looking for."
    />
  );
}

/** The team queue has never had a ticket. */
export function NoTeamTicketsState() {
  return <IllustratedEmptyState illustration={<InboxIllustration />} title="No team tickets yet" />;
}

/** The "Assigned to me" view is empty. */
export function NothingAssignedState() {
  return (
    <IllustratedEmptyState
      illustration={<InboxBurstIllustration />}
      title="Nothing is assigned to you right now"
      description="New requests from your team will show up here."
    />
  );
}

/** The "Unassigned" view is empty. */
export function NoUnassignedState() {
  return (
    <IllustratedEmptyState
      illustration={<InboxTeamIllustration />}
      title="No unassigned tickets"
      description="New requests from your team will show up here."
    />
  );
}
