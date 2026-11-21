import type { ReactNode } from 'react';
import { Ban, CheckCircle, Clock, Eye, Mail, Monitor, Play, RefreshCw, Undo2, X } from 'lucide-react';

/**
 * The one look for a candidate's invite / interview status in every tracker
 * and results table (AI Interview and Assessment alike), so a status reads the
 * same wherever it is shown. Each table still decides WHICH status a row is in;
 * this only draws it.
 *
 *   Completed     green, circle tick (+ "(Auto)" when auto-submitted)
 *   In Progress   yellow, play
 *   System Check  cyan, monitor
 *   Invited       blue, mail          Read  blue, eye
 *   Cancelled     red, x              Invite Failed  red, x
 *   Terminated    red, ban            Bounced        red, refresh
 *   Revoked       red, undo
 *   Expired       orange, clock
 *   Link created / anything else      slate
 */
export type InviteStatusKind =
  | 'completed'
  | 'in_progress'
  | 'system_check'
  | 'invited'
  | 'read'
  | 'cancelled'
  | 'terminated'
  | 'revoked'
  | 'expired'
  | 'invite_failed'
  | 'bounced'
  | 'link_created'
  | 'other';

const BASE = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 ring-1';
const RED = 'bg-destructive-subtle text-destructive ring-destructive-line';
const BLUE = 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20';
const SLATE = 'bg-slate-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 ring-gray-200 dark:ring-slate-700';

const LOOK: Record<InviteStatusKind, { className: string; Icon: typeof Clock; label: string }> = {
  completed: { className: 'bg-success-subtle text-success ring-success-line', Icon: CheckCircle, label: 'Completed' },
  in_progress: { className: 'bg-warning-subtle text-warning-strong ring-warning-line', Icon: Play, label: 'In Progress' },
  system_check: { className: 'bg-status-progress/10 text-status-progress ring-status-progress/20', Icon: Monitor, label: 'System Check' },
  invited: { className: BLUE, Icon: Mail, label: 'Invited' },
  read: { className: BLUE, Icon: Eye, label: 'Read' },
  cancelled: { className: RED, Icon: X, label: 'Cancelled' },
  terminated: { className: RED, Icon: Ban, label: 'Terminated' },
  revoked: { className: RED, Icon: Undo2, label: 'Revoked' },
  expired: { className: 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20', Icon: Clock, label: 'Expired' },
  invite_failed: { className: RED, Icon: X, label: 'Invite Failed' },
  // Status column reads "Failed"; the timeline still names the event "Bounced".
  bounced: { className: RED, Icon: RefreshCw, label: 'Failed' },
  link_created: { className: SLATE, Icon: Mail, label: 'Invited' },
  other: { className: SLATE, Icon: Clock, label: 'Pending' },
};

export default function InviteStatusChip({
  kind,
  auto = false,
  label,
  title,
}: {
  kind: InviteStatusKind;
  /** Completed: auto-submitted when the time ran out. */
  auto?: boolean;
  /** Overrides the kind's own wording (e.g. an unknown raw status). */
  label?: ReactNode;
  title?: string;
}) {
  const { className, Icon, label: own } = LOOK[kind];
  return (
    <span className={`${BASE} ${className}`} title={title}>
      <Icon className="w-3 h-3" />
      {label ?? own}
      {auto && kind === 'completed' && <span className="text-success/80">(Auto)</span>}
    </span>
  );
}
