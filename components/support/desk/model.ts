/* Support desk (/support-tickets) — the data model, labels and the calls to
   the live API, per area:
     support   My Support Tickets (tenant admin → TalentFlow support)  /support-tickets
     team      Team Support Tickets (tenant admin manages)            /internal-tickets/admin/*
     requests  My Requests (a non-admin's tickets to their admin)     /internal-tickets
   Every area is mapped into one Ticket shape so the views stay the same. */

import api from '@/lib/services/api';
import { internalTicketService, type InternalTicket, type InternalTicketFilterParams } from '@/lib/services';
import { forwardTeamLabel } from '@/lib/services/internalTicketService';
import { saveBlob } from '@/lib/supportAttachments';

export type Scope = 'support' | 'team' | 'requests';
export type Status = 'open' | 'in-progress' | 'resolved' | 'closed';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export interface Reply {
  id: string;
  author: string;
  /** requester = who raised it; agent = TalentFlow support / the admin. */
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
  /** Who owes the next message. */
  waitingOn?: 'you' | 'team';
  /** The team ticket as the API sent it (the Forward dialog needs it). */
  raw?: InternalTicket;
}

export interface Stats {
  open: number;
  inProgress: number;
  resolved: number;
  closed: number;
  total: number;
  unassigned?: number;
}

/* ── Labels ── */
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

/** What each area can do (the API's rules). */
export const can = {
  create: (s: Scope) => s !== 'team',
  assign: (s: Scope) => s === 'team',
  resolve: (s: Scope) => s === 'team',
  forward: (s: Scope) => s === 'team',
  close: (s: Scope) => s !== 'requests',
  reopen: (s: Scope) => s !== 'requests',
  priority: (s: Scope) => s !== 'requests',
  /** Server-side category filter / sort (the requester's own list has neither). */
  categoryFilter: (s: Scope) => s !== 'requests',
  sort: (s: Scope) => s !== 'requests',
};

/* ── Mapping ── */
const asStatus = (s: string): Status => (s === 'in_progress' ? 'in-progress' : (s as Status));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromSupport(t: any): Ticket {
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
          requester: [f.requester_name, f.requester_email].filter(Boolean).join(' · ') || undefined,
        }
      : undefined,
    waitingOn: (status === 'open' || status === 'in-progress') && last?.role === 'agent' ? 'you' : undefined,
  };
}

function fromInternal(t: InternalTicket, scope: 'team' | 'requests', meId?: string): Ticket {
  const replies: Reply[] = (t.responses ?? []).map(r => ({
    id: r.id,
    author: r.user_id === meId ? 'You' : r.user_name || (r.user_role === 'admin' ? 'Admin' : 'Requester'),
    role: r.user_role === 'admin' ? 'agent' : 'requester',
    message: r.message,
    at: r.created_at,
  }));
  const status = asStatus(t.status);
  const last = replies[replies.length - 1];
  const active = status === 'open' || status === 'in-progress';
  const fw = t.forwarding;
  return {
    id: t.id,
    scope,
    number: t.ticket_number,
    title: t.title,
    description: t.description ?? '',
    category: t.category,
    priority: t.priority,
    status,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    requester: t.created_by ? { name: t.created_by.id === meId ? 'You' : t.created_by.name, email: t.created_by.email } : undefined,
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
    // The admin owes a reply when the requester spoke last; the requester when the admin did.
    waitingOn: !active ? undefined
      : scope === 'team' ? (!last || last.role === 'requester' ? 'team' : undefined)
        : last?.role === 'agent' ? 'you' : undefined,
    raw: t,
  };
}

/* ── API ── */
export interface ListQuery {
  page: number;
  pageSize: number;
  status: string;
  priority: string;
  category: string;
  assignment: string;
  search: string;
  sort: string;
}

const opt = (v: string) => (v && v !== 'all' ? v : undefined);

export function deskApi(scope: Scope, meId?: string) {
  const mapInternal = (t: InternalTicket) => fromInternal(t, scope === 'team' ? 'team' : 'requests', meId);
  const sp = (path = '') => `/support-tickets${path}`;

  return {
    async list(q: ListQuery): Promise<{ items: Ticket[]; total: number }> {
      if (scope === 'support') {
        const { data } = await api.get(sp(), {
          params: {
            page: q.page, page_size: q.pageSize, status: opt(q.status), priority: opt(q.priority),
            category: opt(q.category), search: q.search || undefined, sort: q.sort !== 'default' ? q.sort : undefined,
          },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { items: (data.items ?? []).map((t: any) => fromSupport(t)), total: data.total ?? 0 };
      }
      const params: InternalTicketFilterParams = {
        page: q.page, page_size: q.pageSize,
        status: opt(q.status) as InternalTicketFilterParams['status'],
        priority: opt(q.priority) as InternalTicketFilterParams['priority'],
        search: q.search || undefined,
      };
      if (scope === 'team') {
        Object.assign(params, {
          category: opt(q.category) as InternalTicketFilterParams['category'],
          sort: q.sort !== 'default' ? q.sort : undefined,
          assigned_to_me: q.assignment === 'mine' ? true : undefined,
          unassigned: q.assignment === 'unassigned' ? true : undefined,
        });
      }
      const res = scope === 'team' ? await internalTicketService.adminListAllTickets(params) : await internalTicketService.listTickets(params);
      return { items: res.items.map(mapInternal), total: res.total ?? res.items.length };
    },

    async stats(): Promise<Stats> {
      if (scope === 'support') {
        const { data: s } = await api.get(sp('/stats'));
        return { open: s.open_tickets, inProgress: s.in_progress_tickets, resolved: s.resolved_tickets, closed: s.closed_tickets, total: s.total_tickets };
      }
      if (scope === 'team') {
        const s = await internalTicketService.adminGetStats();
        return { open: s.open_tickets, inProgress: s.in_progress_tickets, resolved: s.resolved_tickets, closed: s.closed_tickets, total: s.total_tickets, unassigned: s.unassigned_tickets };
      }
      const s = await internalTicketService.getStats();
      return { open: s.open_tickets, inProgress: s.in_progress_tickets, resolved: s.resolved_tickets, closed: s.closed_tickets, total: s.total_tickets };
    },

    async get(id: string): Promise<Ticket> {
      if (scope === 'support') return fromSupport((await api.get(sp(`/${id}`))).data);
      return mapInternal(await internalTicketService.getTicket(id));
    },

    async uploadFiles(id: string, files: File[]): Promise<Ticket> {
      if (scope === 'support') {
        const form = new FormData();
        files.forEach(f => form.append('files', f));
        const { data } = await api.post(sp(`/${id}/attachments`), form, { headers: { 'Content-Type': 'multipart/form-data' } });
        return fromSupport(data);
      }
      return mapInternal(await internalTicketService.uploadAttachments(id, files));
    },

    async create(input: { title: string; description: string; category: string; priority: Priority }): Promise<Ticket> {
      if (scope === 'support') return fromSupport((await api.post(sp(), input)).data);
      return mapInternal(await internalTicketService.createTicket({
        title: input.title, description: input.description,
        category: input.category as InternalTicket['category'], priority: input.priority as InternalTicket['priority'],
      }));
    },

    /** A reply with optional files. Support: text, then files. Team / requests: files, then the text (as the old pages did). */
    async reply(id: string, text: string, files: File[]): Promise<Ticket> {
      if (scope === 'support') {
        let latest: Ticket | null = null;
        if (text) latest = fromSupport((await api.post(sp(`/${id}/responses`), { message: text })).data);
        if (files.length) latest = await this.uploadFiles(id, files);
        return latest ?? this.get(id);
      }
      if (files.length) await internalTicketService.uploadAttachments(id, files);
      const message = text || `Attached ${files.length} file${files.length > 1 ? 's' : ''}: ${files.map(f => f.name).join(', ')}`;
      return mapInternal(await internalTicketService.addResponse(id, { message }));
    },

    async close(id: string) {
      return scope === 'support' ? fromSupport((await api.post(sp(`/${id}/close`))).data) : mapInternal(await internalTicketService.closeTicket(id));
    },
    async reopen(id: string) {
      return scope === 'support' ? fromSupport((await api.post(sp(`/${id}/reopen`))).data) : mapInternal(await internalTicketService.reopenTicket(id));
    },
    async resolve(id: string) { return mapInternal(await internalTicketService.resolveTicket(id)); },
    async assign(id: string) { return mapInternal(await internalTicketService.assignTicket(id)); },
    async setPriority(id: string, priority: Priority) {
      return scope === 'support'
        ? fromSupport((await api.put(sp(`/${id}`), { priority })).data)
        : mapInternal(await internalTicketService.updateTicket(id, { priority: priority as InternalTicket['priority'] }));
    },
    /** Attachments are served through the API (auth required) — fetched as a blob. */
    async download(id: string, file: { id: string; name: string }) {
      if (scope === 'support') {
        const { data } = await api.get(sp(`/${id}/attachments/${file.id}/download`), { responseType: 'blob' });
        saveBlob(data as Blob, file.name);
        return;
      }
      saveBlob(await internalTicketService.downloadAttachment(id, file.id), file.name);
    },
    mapInternal,
  };
}
export type DeskApi = ReturnType<typeof deskApi>;
