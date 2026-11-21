'use client';

/* Support tickets design preview (/tmp-support-preview) — the data.
   TEST ONLY. Reads the REAL tickets with GET calls only:
     - "support": My Support Tickets  → GET /support-tickets, /stats, /{id}
     - "team":    Team Support Tickets → GET /internal-tickets/admin/all, /admin/stats, /{id}
                  (non-admins: their own Help Desk requests → GET /internal-tickets, /stats)
   Nothing is ever created, changed or sent from the preview. Both sources are
   mapped into one shape so every design renders the same data. */

import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/services/api';
import { internalTicketService, type InternalTicket } from '@/lib/services';
import { forwardTeamLabel } from '@/lib/services/internalTicketService';

export type Scope = 'support' | 'team';
export type Status = 'open' | 'in-progress' | 'resolved' | 'closed';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export interface Reply {
  id: string;
  author: string;
  /** requester = the person who raised it; agent = support / team admin. */
  role: 'requester' | 'agent';
  message: string;
  at: string;
}

export interface Ticket {
  id: string;
  scope: Scope;
  number: string;
  title: string;
  description: string;
  category: string;
  priority: Priority;
  status: Status;
  createdAt: string;
  updatedAt: string;
  requester?: { name: string; email?: string };
  assignee?: string;
  replies: Reply[];
  attachments: { id: string; name: string; size?: string }[];
  forwarded?: { label: string; number?: string; team?: string; note?: string; by?: string; at?: string; requester?: string };
  /** Who owes the next message (from the replies). */
  waitingOn?: 'you' | 'team';
  /** Full detail loaded (list rows may carry only a summary). */
  full?: boolean;
}

export interface Stats {
  open: number;
  inProgress: number;
  resolved: number;
  closed: number;
  total: number;
  unassigned?: number;
  byCategory?: Record<string, number>;
}

/* ── Labels (same as the live page) ── */
export const SUPPORT_CATEGORIES = [
  { value: 'resume-upload', label: 'Resume Upload Issues' },
  { value: 'job-posting', label: 'Job Posting' },
  { value: 'candidate-management', label: 'Candidate Management' },
  { value: 'assessment', label: 'Assessment & Scoring' },
  { value: 'billing', label: 'Billing & Subscription' },
  { value: 'technical', label: 'Technical Issue' },
  { value: 'feature-request', label: 'Feature Request' },
  { value: 'other', label: 'Other' },
];
export const TEAM_CATEGORIES = [
  { value: 'account-access', label: 'Account Access' },
  { value: 'permission-request', label: 'Permission Request' },
  { value: 'feature-question', label: 'Feature Question' },
  { value: 'bug-report', label: 'Bug Report' },
  { value: 'general-inquiry', label: 'General Inquiry' },
  { value: 'other', label: 'Other' },
];
export const categoriesOf = (scope: Scope) => (scope === 'support' ? SUPPORT_CATEGORIES : TEAM_CATEGORIES);
export const categoryLabel = (scope: Scope, v: string) => categoriesOf(scope).find(c => c.value === v)?.label ?? v;

export const STATUSES: { value: Status; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];
export const statusLabel = (s: string) => STATUSES.find(x => x.value === s)?.label ?? s;
export const priorityOptions = (scope: Scope): Priority[] => (scope === 'support' ? ['low', 'medium', 'high', 'urgent'] : ['low', 'medium', 'high']);
export const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
export const PRIORITY_GUIDANCE: Record<Priority, string> = {
  low: 'General question or minor issue; no impact on your work.',
  medium: 'Something is not working as expected, but you can continue working.',
  high: 'An important feature is blocked and it is affecting your work.',
  urgent: 'Critical: you or your team cannot use TalentFlow at all.',
};
export const SUPPORT_CONTACT = [
  { label: 'Email', value: 'support@talentflow.com', href: 'mailto:support@talentflow.com' },
  { label: 'Phone', value: '1-800-TALENT-1' },
  { label: 'Hours', value: 'Mon-Fri, 9AM-6PM EST' },
];
/* Reply templates — the live page's "Use Template" menu, grouped. */
export const REPLY_TEMPLATES: Record<Scope, { group: string; items: { label: string; text: string }[] }[]> = {
  support: [
    {
      group: 'Follow up',
      items: [
        { label: 'Request a status update', text: 'Hi team,\n\nFollowing up on this ticket — could you share an update on the status?\n\nThanks' },
        { label: 'Still facing the issue', text: 'Hi team,\n\nI am still facing this issue. It is affecting our work, so a quick update would be appreciated.\n\nThanks' },
        { label: 'Ask for an ETA', text: 'Hi team,\n\nCould you let me know the expected timeline for a fix?\n\nThanks' },
        { label: 'Request a call back', text: 'Hi team,\n\nIt would be easier to explain this on a call. Could someone from support reach out at a convenient time?\n\nThanks' },
      ],
    },
    {
      group: 'Share details',
      items: [
        { label: 'Steps to reproduce', text: 'Additional details:\n- Steps to reproduce:\n  1. \n  2. \n  3. \n- Expected result:\n- Actual result:' },
        { label: 'Error message', text: 'I am seeing the following error message:\n\n"<paste the error here>"\n\nIt appears when I:' },
        { label: 'Environment details', text: 'Environment details:\n- Browser and version:\n- Operating system:\n- Device (desktop / mobile):\n- Time the issue occurred:' },
        { label: 'Affected records', text: 'This issue affects the following records:\n- Job / candidate / assessment name or ID:\n- Number of records affected:' },
        { label: 'How often it happens', text: 'How often this happens:\n- Every time / sometimes / once:\n- Started on (date):\n- Anything that changed before it started:' },
      ],
    },
    {
      group: 'Wrap up',
      items: [
        { label: 'Issue resolved', text: 'Thanks for the help — the issue is resolved on my side. You can close this ticket.' },
        { label: 'Workaround is fine', text: 'Thanks — the suggested workaround works for now. Please keep this ticket open until a permanent fix is available.' },
        { label: 'Thank the team', text: 'Thank you for the quick support. Much appreciated!' },
      ],
    },
  ],
  team: [
    {
      group: 'Acknowledge',
      items: [
        { label: 'Looking into it', text: 'Hi,\n\nThanks for raising this. I am looking into it and will update you shortly.' },
        { label: 'Assigned to me', text: 'Hi,\n\nI have picked up this ticket and will be handling it from here.' },
        { label: 'Investigating', text: 'Hi,\n\nWe are still investigating this. I will share an update as soon as I have more information.' },
      ],
    },
    {
      group: 'Ask for details',
      items: [
        { label: 'Need more details', text: 'Hi,\n\nCould you share a few more details?\n- What were you trying to do?\n- What happened instead?\n- When did it start?' },
        { label: 'Steps to reproduce', text: 'Hi,\n\nCould you list the exact steps that lead to this issue?\n1. \n2. \n3. ' },
        { label: 'Error message', text: 'Hi,\n\nCould you paste the exact error message you see, if any?' },
      ],
    },
    {
      group: 'Access & permissions',
      items: [
        { label: 'Access granted', text: 'Hi,\n\nThe requested access has been granted. Please sign out and sign back in, then let me know if it works.' },
        { label: 'Needs approval', text: 'Hi,\n\nThis request needs approval from your manager. I will update you once it is approved.' },
      ],
    },
    {
      group: 'Wrap up',
      items: [
        { label: 'Resolved — please confirm', text: 'Hi,\n\nThis should now be resolved. Please confirm on your side, and reply here if anything is still not working.' },
        { label: 'Closing (no response)', text: 'Hi,\n\nI have not heard back for a while, so I will close this ticket. Feel free to reopen it if you still need help.' },
      ],
    },
  ],
};

/* ── Mapping ── */
const asStatus = (s: string): Status => (s === 'in_progress' ? 'in-progress' : (s as Status));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromSupport(t: any, full: boolean): Ticket {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const replies: Reply[] = (t.responses ?? []).map((r: any) => ({
    id: r.id,
    author: r.from_type === 'support' ? r.agent_name || 'TalentFlow Support' : 'You',
    role: r.from_type === 'support' ? 'agent' : 'requester',
    message: r.message ?? '',
    at: r.timestamp ?? r.created_at ?? t.updated_at,
  }));
  const status = asStatus(t.status);
  const last = replies[replies.length - 1];
  const f = t.forwarded_from;
  return {
    id: t.id,
    scope: 'support',
    number: t.ticket_number,
    title: t.title,
    description: t.description ?? '',
    category: t.category,
    priority: t.priority,
    status,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    assignee: t.assigned_agent || undefined,
    replies,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    attachments: (t.attachments ?? []).map((a: any) => ({ id: a.id, name: a.file_name, size: a.file_size })),
    forwarded: f
      ? {
          label: `Forwarded from team ticket${f.internal_ticket_number ? ` #${f.internal_ticket_number}` : ''}`,
          number: f.internal_ticket_number ?? undefined,
          team: f.team ? forwardTeamLabel(f.team) : undefined,
          note: f.note ?? undefined,
          by: f.forwarded_by ?? undefined,
          at: f.forwarded_at ?? undefined,
          requester: f.requester_name ?? undefined,
        }
      : undefined,
    waitingOn: (status === 'open' || status === 'in-progress') && last?.role === 'agent' ? 'you' : undefined,
    full,
  };
}

function fromTeam(t: InternalTicket, full: boolean): Ticket {
  const replies: Reply[] = (t.responses ?? []).map(r => ({
    id: r.id,
    author: r.user_name || (r.user_role === 'admin' ? 'Admin' : 'Requester'),
    role: r.user_role === 'admin' ? 'agent' : 'requester',
    message: r.message,
    at: r.created_at,
  }));
  const status = asStatus(t.status);
  const last = replies[replies.length - 1];
  const fw = t.forwarding;
  return {
    id: t.id,
    scope: 'team',
    number: t.ticket_number,
    title: t.title,
    description: t.description ?? '',
    category: t.category,
    priority: t.priority,
    status,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    requester: t.created_by ? { name: t.created_by.name, email: t.created_by.email } : undefined,
    assignee: t.assigned_to?.name,
    replies,
    attachments: (t.attachments ?? []).map(a => ({ id: a.id, name: a.file_name, size: a.file_size ?? undefined })),
    forwarded: fw?.support_ticket_number || fw?.team
      ? {
          label: `Forwarded to ${forwardTeamLabel(fw.team)}`,
          number: fw.support_ticket_number ?? undefined,
          team: forwardTeamLabel(fw.team),
          note: fw.note ?? undefined,
          by: fw.forwarded_by?.name,
          at: fw.forwarded_at ?? undefined,
        }
      : undefined,
    waitingOn: (status === 'open' || status === 'in-progress') && (!last || last.role === 'requester') ? 'team' : undefined,
    full,
  };
}

/* ── Loading (GET only) ── */
const PAGE = 100;

export function useSupportData(scope: Scope, isAdmin: boolean) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [error, setError] = useState('');
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState('loading');
      try {
        if (scope === 'support') {
          const [list, st] = await Promise.all([
            api.get('/support-tickets', { params: { page: 1, page_size: PAGE } }),
            api.get('/support-tickets/stats').catch(() => null),
          ]);
          if (cancelled) return;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setTickets((list.data.items ?? []).map((t: any) => fromSupport(t, false)));
          setTotal(list.data.total ?? 0);
          const s = st?.data;
          setStats(s ? { open: s.open_tickets, inProgress: s.in_progress_tickets, resolved: s.resolved_tickets, closed: s.closed_tickets, total: s.total_tickets } : null);
        } else {
          const [list, s] = await Promise.all([
            isAdmin ? internalTicketService.adminListAllTickets({ page: 1, page_size: PAGE }) : internalTicketService.listTickets({ page: 1, page_size: PAGE }),
            (isAdmin ? internalTicketService.adminGetStats() : internalTicketService.getStats()).catch(() => null),
          ]);
          if (cancelled) return;
          setTickets(list.items.map(t => fromTeam(t, false)));
          setTotal(list.total ?? list.items.length);
          setStats(s
            ? {
                open: s.open_tickets, inProgress: s.in_progress_tickets, resolved: s.resolved_tickets, closed: s.closed_tickets, total: s.total_tickets,
                unassigned: 'unassigned_tickets' in s ? (s as { unassigned_tickets: number }).unassigned_tickets : undefined,
                byCategory: 'tickets_by_category' in s ? (s as { tickets_by_category: Record<string, number> }).tickets_by_category : undefined,
              }
            : null);
        }
        setState('ready');
      } catch (e) {
        if (cancelled) return;
        setTickets([]);
        setError(e instanceof Error ? e.message : 'Could not load tickets');
        setState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [scope, isAdmin, nonce]);

  /** The full ticket (replies, attachments) — GET only. */
  const loadDetail = useCallback(async (id: string): Promise<Ticket> => {
    if (scope === 'support') {
      const { data } = await api.get(`/support-tickets/${id}`);
      return fromSupport(data, true);
    }
    return fromTeam(await internalTicketService.getTicket(id), true);
  }, [scope]);

  // Stats from the API, or counted from the loaded rows if the stats call failed.
  const effectiveStats: Stats = stats ?? {
    open: tickets.filter(t => t.status === 'open').length,
    inProgress: tickets.filter(t => t.status === 'in-progress').length,
    resolved: tickets.filter(t => t.status === 'resolved').length,
    closed: tickets.filter(t => t.status === 'closed').length,
    total: tickets.length,
  };

  return { tickets, total, stats: effectiveStats, state, error, loadDetail, retry: () => setNonce(n => n + 1) };
}

/** Opens a ticket: the list row at once, then the full ticket. */
export function useTicketDetail(id: string | null, tickets: Ticket[], loadDetail: (id: string) => Promise<Ticket>) {
  const [full, setFull] = useState<Record<string, Ticket>>({});
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (!id || full[id]) return;
    let cancelled = false;
    loadDetail(id)
      .then(t => { if (!cancelled) setFull(f => ({ ...f, [id]: t })); })
      .catch(() => { if (!cancelled) setFailed(id); });
    return () => { cancelled = true; };
  }, [id, full, loadDetail]);
  if (!id) return { ticket: null, loading: false, failed: false };
  const ticket = full[id] ?? tickets.find(t => t.id === id) ?? null;
  return { ticket, loading: !full[id] && failed !== id, failed: failed === id };
}
