'use client';

import { formatIST, formatISTDate } from '@/lib/utils/dateUtils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tooltip } from '@/components/ui/tooltip';
import { NoTicketsYetState, NoTicketsFoundState, NoTeamTicketsState, NothingAssignedState, NoUnassignedState } from '@/components/SupportEmptyStates';
import { useState, useEffect, useRef } from 'react';
import {
  HelpCircle, Send, Ticket, Clock, CheckCircle, MessageSquare, AlertCircle,
  FileText, Upload, Trash2, Search, X, ArrowLeft, Filter, Download, ExternalLink,
  CheckCircle2, Circle, Clock3, XCircle, ChevronDown, Mail, Phone, Globe, Book,
  Video, FileQuestion, Tag, User, Calendar, Paperclip, Loader2, Inbox,
  Users, UserCheck, RefreshCw, KeyRound, Bug, MessageCircleQuestion, MoreHorizontal, Lock,
  Headphones, CircleDashed, BarChart3, Eye, ChevronRight, Check, ChevronLeft, Copy, Flag, Settings2, Info, UploadCloud, History, Bold, Italic, List, ListOrdered, Link2, Smile, Forward, Shield
} from 'lucide-react';
import { toast } from 'sonner';
import { showErrorToast } from '@/lib/utils/errorToast';
import { PLAN_LOCKED_MESSAGE } from '@/lib/types/planFeatures';
import { internalTicketService, InternalTicket, InternalTicketAdminStats, InternalTicketPriority } from '@/lib/services';
import type { InternalTicketFilterParams } from '@/lib/services/internalTicketService';
import ListPagination from '@/components/ListPagination';
import FeatureGate from '@/components/shared/FeatureGate';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { AttachmentPicker as TeamAttachmentPicker, AttachmentList as TeamAttachmentList } from '@/components/support/TicketAttachments';
import { saveBlob } from '@/lib/supportAttachments';
import { useAuth } from '@/lib/hooks/useAuth';
import { useDebounce } from '@/lib/hooks/useDebounce';
import api, { ApiError, handleApiError, getTokens } from '@/lib/services/api';
import { PageHeader } from '@/components/ui/page-header';
import { StatValuePlaceholder } from '@/components/ui/stats-card';
import NameAvatar from '@/components/ui/name-avatar';
import { MobileRecordList, MobileRecordCard } from '@/components/ui/mobile-record-card';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import FilterSelect from '@/components/ui/filter-select';
import FilterChips, { type FilterChip } from '@/components/ui/filter-chips';
import ForwardTicketDialog from '@/components/support/ForwardTicketDialog';
import { forwardTeamLabel } from '@/lib/services/internalTicketService';
import UnitDisputesView from '@/components/subscription/unit-disputes/UnitDisputesView';
import { IconButton } from '@/components/ui/icon-button';

// Main API - Local backend handles everything including support tickets
// Character limits for the Create Support Ticket form.
const TICKET_TITLE_MAX = 100;
const TICKET_DESCRIPTION_MAX = 1500;

// Create-ticket drafts are saved per user under this prefix. clearTokens() in
// lib/services/api.ts removes every key with this prefix on logout.
const TICKET_DRAFT_PREFIX = 'tf-support-ticket-draft:';

// Marker for the optional "browser details" block appended to a description.
const ENV_BLOCK_MARKER = '\n\n--- Browser details ---\n';

// Description placeholder per category — tells the user what support needs.
const CATEGORY_DESCRIPTION_HINTS: Record<string, string> = {
  'resume-upload': 'Which file did you try to upload (type and size)? What happened — an error, or the upload never finished?',
  'job-posting': 'Which job is affected (title or ID)? What were you trying to do, and what happened instead?',
  'candidate-management': 'Which candidate or list is affected? What did you expect to see, and what did you see?',
  'assessment': 'Which assessment is affected (name or ID)? Is the issue when creating, sending, or reviewing results?',
  'billing': 'Please include the invoice number or payment date, the amount, and what looks wrong.',
  'technical': 'Describe the steps to reproduce, the expected result, the actual result, and any error message you see.',
  'feature-request': 'What would you like to do, and how would it help your hiring workflow?',
  'other': 'Please provide detailed information about your request.',
};

// What each priority means — shown next to the Priority field.
const PRIORITY_GUIDANCE: { label: string; text: string }[] = [
  { label: 'Low', text: 'General question or minor issue; no impact on your work.' },
  { label: 'Medium', text: 'Something is not working as expected, but you can continue working.' },
  { label: 'High', text: 'An important feature is blocked and it is affecting your work.' },
  { label: 'Urgent', text: 'Critical: you or your team cannot use TalentFlow at all.' },
];

// Starter descriptions for common ticket types.
const DESCRIPTION_TEMPLATES: { label: string; text: string }[] = [
  { label: 'Bug report', text: 'Steps to reproduce:\n1. \n2. \n3. \n\nExpected result:\n\nActual result:\n\nError message (if any):' },
  { label: 'Feature request', text: 'What I would like to do:\n\nWhy it would help:\n\nHow I do it today (workaround):' },
  { label: 'Billing question', text: 'Invoice number / payment date:\nAmount:\nWhat looks wrong:' },
  { label: 'Access or login issue', text: 'Affected user (name or email):\nWhat happens when signing in:\nWhen it started:' },
];

// Readable browser / OS summary from the user agent (best effort, no extra libraries).
function describeEnvironment(): string {
  if (typeof window === 'undefined') return '';
  const ua = navigator.userAgent;
  const browser =
    /Edg\/(\d+)/.exec(ua) ? `Edge ${/Edg\/(\d+)/.exec(ua)![1]}` :
    /OPR\/(\d+)/.exec(ua) ? `Opera ${/OPR\/(\d+)/.exec(ua)![1]}` :
    /Chrome\/(\d+)/.exec(ua) ? `Chrome ${/Chrome\/(\d+)/.exec(ua)![1]}` :
    /Firefox\/(\d+)/.exec(ua) ? `Firefox ${/Firefox\/(\d+)/.exec(ua)![1]}` :
    /Version\/(\d+).*Safari/.exec(ua) ? `Safari ${/Version\/(\d+).*Safari/.exec(ua)![1]}` :
    'Unknown browser';
  const os =
    /Windows NT 10/.test(ua) ? 'Windows 10/11' :
    /Windows/.test(ua) ? 'Windows' :
    /Android/.test(ua) ? 'Android' :
    /iPhone|iPad|iPod/.test(ua) ? 'iOS' :
    /Mac OS X/.test(ua) ? 'macOS' :
    /Linux/.test(ua) ? 'Linux' : 'Unknown OS';
  return [
    `- Browser: ${browser}`,
    `- Operating system: ${os}`,
    `- Screen: ${window.screen.width}×${window.screen.height}`,
    `- Window: ${window.innerWidth}×${window.innerHeight}`,
  ].join('\n');
}

// Lowercase words (3+ letters) used to spot possibly duplicate tickets.
function titleWords(text: string): string[] {
  return Array.from(new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3)));
}

// The backend's `detail` message for a failed api call, or the fallback.
function errorText(error: unknown, fallback: string): string {
  try {
    handleApiError(error);
  } catch (e) {
    if (e instanceof ApiError && e.message) return e.message;
  }
  return fallback;
}

// Attachment limits — mirrored by the backend (routers/support_tickets.py).
// Combined size of all files sent together (create form, or one reply).
const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const formatBytes = (n: number) =>
  n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`;
// At most 5 files per upload (one bulk pick / one reply), 25 on a ticket in total.
const ATTACHMENT_MAX_FILES = 5;
const ATTACHMENT_MAX_PER_TICKET = 25;
// Never accepted; named so the user gets a clear "no video" message.
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.flv', '.m4v', '.mpg', '.mpeg', '.3gp', '.3g2', '.ogv', '.ts', '.mts', '.m2ts', '.vob'];
// Shown under "Supported formats". The extra types are still accepted
// (same allowlist as the backend's ATTACHMENT_GROUPS).
const ATTACHMENT_SHOWN_EXTS = ['.pdf', '.doc', '.docx', '.txt', '.png', '.jpg', '.jpeg', '.webp'];
const ATTACHMENT_EXTRA_EXTS = ['.xlsx', '.csv', '.log', '.json', '.xml', '.yaml', '.yml', '.xls'];
const ATTACHMENT_EXTENSIONS = [...ATTACHMENT_SHOWN_EXTS, ...ATTACHMENT_EXTRA_EXTS];
const ATTACHMENT_ACCEPT = ATTACHMENT_EXTENSIONS.join(',');

interface SupportTicket {
  id: string;
  ticketNumber: string;
  title: string;
  description: string;
  category: 'resume-upload' | 'job-posting' | 'candidate-management' | 'assessment' | 'billing' | 'technical' | 'feature-request' | 'other';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in-progress' | 'resolved' | 'closed';
  createdAt: string;
  updatedAt: string;
  assignedAgent?: string;
  attachments?: { id: string; name: string; size: string; url: string }[];
  responses?: {
    id: string;
    from: 'user' | 'support';
    message: string;
    timestamp: string;
    agentName?: string;
  }[];
  /** Set when the ticket was forwarded from Team Support Tickets. */
  forwardedFrom?: {
    internalTicketId?: string;
    internalTicketNumber?: string;
    team?: string;
    note?: string;
    forwardedBy?: string;
    forwardedAt?: string;
    requesterName?: string;
    requesterEmail?: string;
  } | null;
}

interface TicketStats {
  open_tickets: number;
  in_progress_tickets: number;
  resolved_tickets: number;
  closed_tickets: number;
  total_tickets: number;
}

// Internal ticket categories for team support
const internalCategories = [
  { value: 'account-access', label: 'Account Access', icon: KeyRound },
  { value: 'permission-request', label: 'Permission Request', icon: User },
  { value: 'feature-question', label: 'Feature Question', icon: MessageCircleQuestion },
  { value: 'bug-report', label: 'Bug Report', icon: Bug },
  { value: 'general-inquiry', label: 'General Inquiry', icon: HelpCircle },
  { value: 'other', label: 'Other', icon: MoreHorizontal }
];

const internalPriorities = [
  { value: 'low', label: 'Low', color: 'text-[var(--text-secondary)] bg-[var(--surface-hover)] border-[var(--border)]' },
  { value: 'medium', label: 'Medium', color: 'text-[var(--text-primary)] bg-[var(--surface-hover)] border-[var(--border)]' },
  { value: 'high', label: 'High', color: 'text-warning bg-warning-subtle border-warning-line' },
];

// Transform API response to frontend format
function transformTicket(apiTicket: any): SupportTicket {
  return {
    id: apiTicket.id,
    ticketNumber: apiTicket.ticket_number,
    title: apiTicket.title,
    description: apiTicket.description,
    category: apiTicket.category,
    priority: apiTicket.priority,
    status: apiTicket.status,
    createdAt: apiTicket.created_at,
    updatedAt: apiTicket.updated_at,
    assignedAgent: apiTicket.assigned_agent,
    attachments: apiTicket.attachments?.map((a: any) => ({
      id: a.id,
      name: a.file_name,
      size: a.file_size,
      url: a.file_url,
    })),
    responses: apiTicket.responses?.map((r: any) => ({
      id: r.id,
      from: r.from_type as 'user' | 'support',
      message: r.message,
      timestamp: r.timestamp,
      agentName: r.agent_name,
    })),
    forwardedFrom: apiTicket.forwarded_from
      ? {
          internalTicketId: apiTicket.forwarded_from.internal_ticket_id ?? undefined,
          internalTicketNumber: apiTicket.forwarded_from.internal_ticket_number ?? undefined,
          team: apiTicket.forwarded_from.team ?? undefined,
          note: apiTicket.forwarded_from.note ?? undefined,
          forwardedBy: apiTicket.forwarded_from.forwarded_by ?? undefined,
          forwardedAt: apiTicket.forwarded_from.forwarded_at ?? undefined,
          requesterName: apiTicket.forwarded_from.requester_name ?? undefined,
          requesterEmail: apiTicket.forwarded_from.requester_email ?? undefined,
        }
      : null,
  };
}

// True when support has the last word on an active ticket — the user owes a reply.
function isAwaitingUserReply(ticket: SupportTicket): boolean {
  if (ticket.status !== 'open' && ticket.status !== 'in-progress') return false;
  const last = ticket.responses?.[ticket.responses.length - 1];
  return last?.from === 'support';
}

// Renders the light formatting the reply toolbar inserts (**bold**, _italic_,
// [text](https://…), "- " bullets, "1. " numbered lines) as React nodes.
// No HTML is injected; only http(s) links are turned into anchors.
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|(?<![A-Za-z0-9])_[^_\s][^_]*_(?![A-Za-z0-9])|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;
    if (token.startsWith('**')) {
      nodes.push(<strong key={key} className="font-semibold">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('_')) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else {
      const linkMatch = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(token);
      nodes.push(linkMatch
        ? <a key={key} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-blue underline underline-offset-2 hover:text-brand-blue-2">{linkMatch[1]}</a>
        : token);
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// Active team ticket where the team owes a response (nothing yet, or the employee spoke last).
function isAwaitingTeamResponse(ticket: InternalTicket): boolean {
  if (ticket.status !== 'open' && ticket.status !== 'in-progress') return false;
  const last = ticket.responses?.[ticket.responses.length - 1];
  return !last || last.user_role === 'user';
}

// Short relative time ("5m ago", "3h ago", "2d ago").
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '';
  const mins = Math.max(0, Math.floor((new Date().getTime() - then) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// Emoji picker set for reply boxes; rendered with colour-emoji fonts so they look the same on every OS.
const EMOJI_GROUPS: { group: string; items: string[] }[] = [
  { group: 'Smileys', items: ['😀', '😊', '🙂', '😉', '😅', '😂', '🤔', '😐', '😕', '😟', '😢', '😡'] },
  { group: 'Gestures', items: ['👍', '👎', '👏', '🙏', '👋', '🙌', '🤝', '💪'] },
  { group: 'Symbols', items: ['✅', '❌', '⚠️', '❗', '❓', '💡', '🔥', '⭐', '🎉', '🚀', '📌', '📎', '⏳', '🐞', '🔒', '❤️'] },
];
const EMOJI_FONT_STACK = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Segoe UI Symbol", sans-serif';

function AwaitingTeamTag() {
  return (
    <span className="tf-badge bg-brand-orange/10 text-brand-orange-deep">
      <MessageSquare className="h-3 w-3" />
      Awaiting response
    </span>
  );
}

// A Team ticket forwarded to platform support (`team`), or a My Support Ticket
// that came from a Team ticket (`from` = its INT- number).
function ForwardedTag({ team, from }: { team?: string | null; from?: string | null }) {
  const title = from ? `Forwarded from Team ticket ${from}` : `Forwarded to ${forwardTeamLabel(team)}`;
  return (
    <span className="tf-badge bg-brand-blue/10 text-brand-blue" title={title}>
      <Forward className="h-3 w-3" />
      {from ? `From ${from}` : 'Forwarded'}
    </span>
  );
}

function AwaitingReplyTag() {
  return (
    <span className="tf-badge bg-brand-orange/10 text-brand-orange-deep">
      <MessageSquare className="h-3 w-3" />
      Awaiting your reply
    </span>
  );
}

// Shown instead of "No tickets" when the list request failed.
function ListLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center sm:py-12">
      <AlertCircle className="h-10 w-10 text-destructive" />
      <div>
        <p className="tf-row-name">Couldn&apos;t load tickets</p>
        <p className="mt-1 tf-meta">{message}</p>
      </div>
      <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
        <RefreshCw className="h-4 w-4" />
        Retry
      </Button>
    </div>
  );
}

function renderFormattedMessage(message: string): React.ReactNode {
  const lines = message.split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*-\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*-\s+/, ''));
      blocks.push(<ul key={`b${i}`} className="ml-5 list-disc space-y-0.5">{items.map((it, j) => <li key={j}>{renderInline(it, `u${i}-${j}`)}</li>)}</ul>);
    } else if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+\.\s+/, ''));
      blocks.push(<ol key={`b${i}`} className="ml-5 list-decimal space-y-0.5">{items.map((it, j) => <li key={j}>{renderInline(it, `o${i}-${j}`)}</li>)}</ol>);
    } else {
      blocks.push(line.trim() === ''
        ? <div key={`b${i}`} className="h-2" />
        : <p key={`b${i}`} className="whitespace-pre-wrap break-words">{renderInline(line, `p${i}`)}</p>);
      i++;
    }
  }
  return blocks;
}

interface SupportCenterProps {
  isAdmin?: boolean;
}

export default function SupportCenter({ isAdmin = false }: SupportCenterProps) {
  // Active tab: 'external' for TalentFlow support, 'team' for internal team tickets,
  // 'unit-disputes' for the shared Unit Disputes screen (also under Subscription).
  const [activeTab, setActiveTab] = useState<'external' | 'team' | 'unit-disputes'>('external');
  const [view, setView] = useState<'overview' | 'submit' | 'tickets' | 'detail' | 'knowledge-base'>('overview');
  /* The overview's Help Resources + contact block, folded away by default. */
  const [helpOpen, setHelpOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  // My Tickets filters. The Team tab has its own set below — they used to be
  // shared, so "Urgent" picked here emptied the Team list (team has no Urgent).
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [myCategoryFilter, setMyCategoryFilter] = useState<string>('all');
  const [teamSearchQuery, setTeamSearchQuery] = useState('');
  const [teamFilterStatus, setTeamFilterStatus] = useState<string>('all');
  const [teamFilterPriority, setTeamFilterPriority] = useState<string>('all');
  // Search is sent to the server 300 ms after typing stops.
  const debouncedSearch = useDebounce(searchQuery.trim(), 300);
  const debouncedTeamSearch = useDebounce(teamSearchQuery.trim(), 300);
  const [replyMessage, setReplyMessage] = useState('');
  // Blocks a second send while a reply is in flight (double-click sent it twice).
  const [replySending, setReplySending] = useState(false);
  // Ticket detail view: Conversation / Attachments tab + dismissible reply tip.
  // Tab is remembered per ticket id, so opening another ticket starts on Conversation.
  const [detailTabState, setDetailTabState] = useState<{ id: string | null; tab: 'conversation' | 'activity' | 'attachments' }>({ id: null, tab: 'conversation' });
  // Ticket detail: staged priority (applied with Update), menus and reply editor ref.
  const [priorityDraft, setPriorityDraft] = useState<{ id: string | null; value: string }>({ id: null, value: '' });
  const [ticketMenuOpen, setTicketMenuOpen] = useState(false);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [emojiMenuOpen, setEmojiMenuOpen] = useState(false);
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const { user: authUser, isTenantAdmin, hasPermission } = useAuth();
  // Unit Disputes tab = same rule as Subscription → Unit Disputes (View Usage; the
  // API re-checks). Without it the tab stays visible, greyed, with a tooltip.
  const canViewUnitDisputes = isTenantAdmin || hasPermission('canViewUsage');
  // Last cursor/selection in the reply box. Null = not placed yet → insert at the end.
  const lastReplySel = useRef<{ start: number; end: number } | null>(null);

  // Reply editor helpers — insert plain-text formatting at the cursor.
  const editReply = (build: (value: string, start: number, end: number) => { text: string; selStart: number; selEnd: number }) => {
    const el = replyRef.current;
    const len = replyMessage.length;
    // Use the remembered cursor (clamped); if the user never placed one, append at the end.
    const start = Math.min(lastReplySel.current?.start ?? len, len);
    const end = Math.min(Math.max(lastReplySel.current?.end ?? len, start), len);
    const { text, selStart, selEnd } = build(replyMessage, start, end);
    setReplyMessage(text);
    lastReplySel.current = { start: selStart, end: selEnd };
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(selStart, selEnd);
    });
  };
  const wrapSelection = (before: string, after: string, placeholder: string) =>
    editReply((v, s, e) => {
      const sel = v.slice(s, e) || placeholder;
      return { text: v.slice(0, s) + before + sel + after + v.slice(e), selStart: s + before.length, selEnd: s + before.length + sel.length };
    });
  const prefixLines = (prefix: (i: number) => string) =>
    editReply((v, s, e) => {
      const lineStart = v.lastIndexOf('\n', s - 1) + 1;
      const block = v.slice(lineStart, e) || '';
      const updated = block.split('\n').map((line, i) => prefix(i) + line).join('\n');
      const text = v.slice(0, lineStart) + updated + v.slice(e);
      return { text, selStart: lineStart + updated.length, selEnd: lineStart + updated.length };
    });
  const insertAtCursor = (snippet: string) =>
    editReply((v, s, e) => ({ text: v.slice(0, s) + snippet + v.slice(e), selStart: s + snippet.length, selEnd: s + snippet.length }));
  const editDescription = (build: (value: string, start: number, end: number) => { text: string; selStart: number; selEnd: number }) => {
    const el = descriptionRef.current;
    const len = description.length;
    const start = Math.min(lastDescSel.current?.start ?? len, len);
    const end = Math.min(Math.max(lastDescSel.current?.end ?? len, start), len);
    const result = build(description, start, end);
    if (result.text.length > TICKET_DESCRIPTION_MAX) {
      toast.error(`Description can be at most ${TICKET_DESCRIPTION_MAX} characters`);
      return;
    }
    setDescription(result.text);
    lastDescSel.current = { start: result.selStart, end: result.selEnd };
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(result.selStart, result.selEnd);
    });
  };
  const wrapDescription = (before: string, after: string, placeholder: string) =>
    editDescription((v, s, e) => {
      const sel = v.slice(s, e) || placeholder;
      return { text: v.slice(0, s) + before + sel + after + v.slice(e), selStart: s + before.length, selEnd: s + before.length + sel.length };
    });
  const prefixDescriptionLines = (prefix: (i: number) => string) =>
    editDescription((v, s, e) => {
      const lineStart = v.lastIndexOf('\n', s - 1) + 1;
      const updated = v.slice(lineStart, e).split('\n').map((line, i) => prefix(i) + line).join('\n');
      return { text: v.slice(0, lineStart) + updated + v.slice(e), selStart: lineStart + updated.length, selEnd: lineStart + updated.length };
    });
  const handleDescEmojiPick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const snippet = e.currentTarget.dataset.emoji || '';
    editDescription((v, s, end) => ({ text: v.slice(0, s) + snippet + v.slice(end), selStart: s + snippet.length, selEnd: s + snippet.length }));
    setDescEmojiOpen(false);
  };
  const applyDescriptionTemplate = (text: string) => {
    const next = description.trim() ? `${description.trimEnd()}\n\n${text}` : text;
    if (next.length > TICKET_DESCRIPTION_MAX) {
      toast.error(`Description can be at most ${TICKET_DESCRIPTION_MAX} characters`);
      return;
    }
    setDescription(next);
    lastDescSel.current = null;
    setDescTemplateOpen(false);
    requestAnimationFrame(() => descriptionRef.current?.focus());
  };
  const handleDescTemplatePick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const tpl = DESCRIPTION_TEMPLATES[Number(e.currentTarget.dataset.templateIndex)];
    if (tpl) applyDescriptionTemplate(tpl.text);
  };
  const toggleEnvironmentDetails = (include: boolean) => {
    const markerAt = description.indexOf(ENV_BLOCK_MARKER);
    if (!include) {
      if (markerAt >= 0) setDescription(description.slice(0, markerAt));
      return;
    }
    if (markerAt >= 0) return;
    const next = description.trimEnd() + ENV_BLOCK_MARKER + describeEnvironment();
    if (next.length > TICKET_DESCRIPTION_MAX) {
      toast.error('Not enough room in the description to add browser details');
      return;
    }
    setDescription(next);
  };

  // ---- Drafts (per user, cleared on logout via clearTokens) ----
  const draftKey = authUser?.id ? `${TICKET_DRAFT_PREFIX}${authUser.id}` : null;
  // Opens the create form, restoring this user's saved draft into an empty form.
  const openSubmitView = () => {
    setSubmitAttempted(false);
    setShowDescriptionPreview(false);
    if (draftKey && !title.trim() && !description.trim()) {
      try {
        const saved = JSON.parse(localStorage.getItem(draftKey) || 'null');
        if (saved && (saved.title || saved.description)) {
          setTitle(String(saved.title || '').slice(0, TICKET_TITLE_MAX));
          setDescription(String(saved.description || '').slice(0, TICKET_DESCRIPTION_MAX));
          if (categories.some(c => c.value === saved.category)) setCategory(saved.category);
          if (priorities.some(p => p.value === saved.priority)) setPriority(saved.priority);
          setDraftRestored(true);
        } else {
          setDraftRestored(false);
        }
      } catch {
        setDraftRestored(false);
      }
    }
    setView('submit');
  };
  const discardDraft = () => {
    if (draftKey) {
      try { localStorage.removeItem(draftKey); } catch { /* storage unavailable */ }
    }
    setTitle('');
    setDescription('');
    setCategory('technical');
    setPriority('medium');
    setDraftRestored(false);
    setSubmitAttempted(false);
    lastDescSel.current = null;
  };
  const submitTicketFromForm = () => {
    setSubmitAttempted(true);
    if (!submitting) handleSubmitTicket();
  };

  const handleEmojiPick = (e: React.MouseEvent<HTMLButtonElement>) => {
    insertAtCursor(e.currentTarget.dataset.emoji || '');
    setEmojiMenuOpen(false);
  };
  const [showReplyTip, setShowReplyTip] = useState(true);
  // Ticket list sort ("default" keeps the API order) and the close-ticket confirmation.
  const [ticketSort, setTicketSort] = useState<'default' | 'newest' | 'updated' | 'priority'>('default');
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  // Create-ticket form helpers: inline validation, restored-draft note, preview,
  // template/emoji menus and the description editor's cursor.
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [showDescriptionPreview, setShowDescriptionPreview] = useState(false);
  const [descTemplateOpen, setDescTemplateOpen] = useState(false);
  const [descEmojiOpen, setDescEmojiOpen] = useState(false);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const lastDescSel = useRef<{ start: number; end: number } | null>(null);
  // Team tickets: client-side category filter + sort ("default" keeps the API order).
  const [teamCategoryFilter, setTeamCategoryFilter] = useState<string>('all');
  const [teamSort, setTeamSort] = useState<'default' | 'newest' | 'updated' | 'priority'>('default');

  // Pagination state — separate per tab
  const [myCurrentPage, setMyCurrentPage] = useState(1);
  const [myItemsPerPage, setMyItemsPerPage] = useState(10);
  const [teamCurrentPage, setTeamCurrentPage] = useState(1);
  const [teamItemsPerPage, setTeamItemsPerPage] = useState(10);

  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<SupportTicket['category']>('technical');
  const [priority, setPriority] = useState<SupportTicket['priority']>('medium');
  const [attachments, setAttachments] = useState<File[]>([]);
  // Files chosen in the reply box; uploaded to the ticket after the message.
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  // Files on a Team ticket reply (admin side).
  const [teamReplyFiles, setTeamReplyFiles] = useState<File[]>([]);
  const replyFileInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Data states. `tickets` / `internalTickets` hold only the current page; the
  // server does filtering, search, sort and paging and reports the total.
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [myTotal, setMyTotal] = useState(0);
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Team/Internal ticket states (for admin)
  const [internalTickets, setInternalTickets] = useState<InternalTicket[]>([]);
  const [teamTotal, setTeamTotal] = useState(0);
  const [internalTicketsError, setInternalTicketsError] = useState<string | null>(null);
  const [internalStats, setInternalStats] = useState<InternalTicketAdminStats | null>(null);
  const [selectedInternalTicket, setSelectedInternalTicket] = useState<InternalTicket | null>(null);
  const [internalLoading, setInternalLoading] = useState(false);
  const [internalActionLoading, setInternalActionLoading] = useState<string | null>(null);
  const [internalFilterAssignment, setInternalFilterAssignment] = useState<string>('all');

  // The last stats call failed — the cards show '—' instead of a number.
  const [statsFailed, setStatsFailed] = useState(false);
  const [internalStatsFailed, setInternalStatsFailed] = useState(false);

  // Prevent duplicate API calls
  const hasFetched = useRef(false);
  const hasInternalFetched = useRef(false);
  /* Bumped by every list fetch, so only the latest request's rows apply. The
     mount fetch runs with default filters before the saved ones are restored,
     then again with them; whichever lands last used to win. */
  const ticketsFetchSeqRef = useRef(0);
  const internalTicketsFetchSeqRef = useRef(0);

  // Persist scroll + list view state so returning to Support restores it.
  // 'detail'/'submit' are excluded from restore since they depend on a selected
  // ticket / in-progress form that don't survive the remount.
  const rootRef = useScrollRestoration('support-tickets', !loading);
  useListStatePersistence(
    'support-tickets',
    { activeTab, view, searchQuery, filterStatus, filterPriority, myCategoryFilter,
      teamSearchQuery, teamFilterStatus, teamFilterPriority, internalFilterAssignment,
      myCurrentPage, myItemsPerPage, teamCurrentPage, teamItemsPerPage },
    (s) => {
      if (s.activeTab === 'external' || s.activeTab === 'team' || s.activeTab === 'unit-disputes') setActiveTab(s.activeTab);
      if (s.view === 'overview' || s.view === 'tickets' || s.view === 'knowledge-base') setView(s.view);
      if (typeof s.searchQuery === 'string') setSearchQuery(s.searchQuery);
      if (typeof s.filterStatus === 'string') setFilterStatus(s.filterStatus);
      if (typeof s.filterPriority === 'string') setFilterPriority(s.filterPriority);
      if (typeof s.myCategoryFilter === 'string') setMyCategoryFilter(s.myCategoryFilter);
      if (typeof s.teamSearchQuery === 'string') setTeamSearchQuery(s.teamSearchQuery);
      if (typeof s.teamFilterStatus === 'string') setTeamFilterStatus(s.teamFilterStatus);
      if (typeof s.teamFilterPriority === 'string') setTeamFilterPriority(s.teamFilterPriority);
      if (typeof s.internalFilterAssignment === 'string') setInternalFilterAssignment(s.internalFilterAssignment);
      if (typeof s.myCurrentPage === 'number') setMyCurrentPage(s.myCurrentPage);
      if (typeof s.myItemsPerPage === 'number') setMyItemsPerPage(s.myItemsPerPage);
      if (typeof s.teamCurrentPage === 'number') setTeamCurrentPage(s.teamCurrentPage);
      if (typeof s.teamItemsPerPage === 'number') setTeamItemsPerPage(s.teamItemsPerPage);
    },
  );

  const openTab = (tab: 'external' | 'team' | 'unit-disputes') => {
    setActiveTab(tab);
    setView('overview');
    setSelectedTicket(null);
    setSelectedInternalTicket(null);
  };

  // Deep link: /support-tickets?tab=unit-disputes (wins over the restored tab).
  useEffect(() => {
    const url = new URL(window.location.href);
    const tab = url.searchParams.get('tab');
    if (tab === 'unit-disputes' || tab === 'team' || tab === 'external') setActiveTab(tab);
    // Applied — clear it, so switching tabs (or the "Support Tickets" crumb)
    // doesn't leave ?tab=unit-disputes in the address bar.
    if (tab !== null) {
      url.searchParams.delete('tab');
      window.history.replaceState(window.history.state, '', url.pathname + url.search);
    }
  }, []);

  // A restored / linked Unit Disputes tab the user can't see → back to My Support Tickets.
  useEffect(() => {
    if (activeTab === 'unit-disputes' && (!isAdmin || (authUser && !canViewUnitDisputes))) setActiveTab('external');
  }, [activeTab, isAdmin, authUser, canViewUnitDisputes]);

  const categories = [
    { value: 'resume-upload', label: 'Resume Upload Issues', icon: Upload },
    { value: 'job-posting', label: 'Job Posting', icon: Briefcase },
    { value: 'candidate-management', label: 'Candidate Management', icon: User },
    { value: 'assessment', label: 'Assessment & Scoring', icon: CheckCircle },
    { value: 'billing', label: 'Billing & Subscription', icon: FileText },
    { value: 'technical', label: 'Technical Issue', icon: AlertCircle },
    { value: 'feature-request', label: 'Feature Request', icon: Lightbulb },
    { value: 'other', label: 'Other', icon: HelpCircle }
  ];

  const priorities = [
    { value: 'low', label: 'Low', color: 'text-[var(--text-secondary)] bg-[var(--surface-hover)] border-[var(--border)]' },
    { value: 'medium', label: 'Medium', color: 'text-[var(--text-primary)] bg-[var(--surface-hover)] border-[var(--border)]' },
    { value: 'high', label: 'High', color: 'text-warning bg-warning-subtle border-warning-line' },
    { value: 'urgent', label: 'Urgent', color: 'text-destructive bg-destructive-subtle border-destructive-line' }
  ];

  // Support-ticket calls go through the shared `api` client (auth header, token
  // refresh and 401 → session-expired handling), not raw fetch.
  const supportPath = (endpoint: string = '') => `/support-tickets${endpoint}`;

  // Auto-save the create-ticket form as a per-user draft while it is open.
  useEffect(() => {
    if (activeTab !== 'external' || view !== 'submit' || !authUser?.id) return;
    const key = `${TICKET_DRAFT_PREFIX}${authUser.id}`;
    // Only ever saves. An empty form never deletes a draft (the page can reopen
    // straight onto this form before a draft is restored); drafts are removed
    // only by "Discard draft", a successful submit, or logout.
    if (!title.trim() && !description.trim()) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify({ title, description, category, priority, savedAt: new Date().toISOString() }));
      } catch { /* storage unavailable — drafts are best effort */ }
    }, 400);
    return () => clearTimeout(timer);
  }, [title, description, category, priority, view, activeTab, authUser?.id]);

  // Stats once on mount (the list loads from the effect below).
  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    if (!getTokens().accessToken) {
      setLoading(false);
      setStatsFailed(true);
      return;
    }
    fetchStats();
  }, []);

  // One page of My Tickets from the server, refetched whenever the page, page
  // size, filters, sort or (debounced) search change. Before, only the first
  // 20 tickets were ever loaded and search/paging ran inside those 20.
  useEffect(() => {
    if (!getTokens().accessToken) return;
    fetchTickets();
  }, [myCurrentPage, myItemsPerPage, filterStatus, filterPriority, myCategoryFilter, debouncedSearch, ticketSort]);

  const fetchTickets = async () => {
    const seq = ++ticketsFetchSeqRef.current;
    const isStale = () => seq !== ticketsFetchSeqRef.current;
    try {
      setLoading(true);
      setTicketsError(null);
      const { data } = await api.get(supportPath(), {
        params: {
          page: myCurrentPage,
          page_size: myItemsPerPage,
          status: filterStatus !== 'all' ? filterStatus : undefined,
          priority: filterPriority !== 'all' ? filterPriority : undefined,
          category: myCategoryFilter !== 'all' ? myCategoryFilter : undefined,
          search: debouncedSearch || undefined,
          sort: ticketSort !== 'default' ? ticketSort : undefined,
        },
      });
      if (isStale()) return;
      setTickets((data.items || []).map(transformTicket));
      setMyTotal(data.total ?? 0);
    } catch (error) {
      if (isStale()) return;
      setTickets([]);
      setMyTotal(0);
      setTicketsError(errorText(error, 'Could not load your tickets'));
    } finally {
      if (!isStale()) setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const { data } = await api.get(supportPath('/stats'));
      setStats(data);
      setStatsFailed(false);
    } catch {
      setStatsFailed(true);
    }
  };

  const fetchTicketDetail = async (ticketId: string) => {
    setDetailError(null);
    try {
      const { data } = await api.get(supportPath(`/${ticketId}`));
      setSelectedTicket(transformTicket(data));
    } catch (error) {
      // The row's summary stays on screen; say the full ticket didn't load.
      setDetailError(errorText(error, 'Could not load this ticket'));
    }
  };

  // Team tab: stats once when first opened; the list follows its own filters.
  useEffect(() => {
    if (activeTab === 'team' && isAdmin && !hasInternalFetched.current) {
      hasInternalFetched.current = true;
      fetchInternalStats();
    }
  }, [activeTab, isAdmin]);

  useEffect(() => {
    if (activeTab !== 'team' || !isAdmin) return;
    fetchInternalTickets();
  }, [activeTab, isAdmin, teamCurrentPage, teamItemsPerPage, teamFilterStatus, teamFilterPriority, teamCategoryFilter, internalFilterAssignment, debouncedTeamSearch, teamSort]);

  const fetchInternalTickets = async () => {
    const seq = ++internalTicketsFetchSeqRef.current;
    const isStale = () => seq !== internalTicketsFetchSeqRef.current;
    try {
      setInternalLoading(true);
      setInternalTicketsError(null);
      const response = await internalTicketService.adminListAllTickets({
        page: teamCurrentPage,
        page_size: teamItemsPerPage,
        status: teamFilterStatus !== 'all' ? teamFilterStatus as InternalTicketFilterParams['status'] : undefined,
        priority: teamFilterPriority !== 'all' ? teamFilterPriority as InternalTicketFilterParams['priority'] : undefined,
        category: teamCategoryFilter !== 'all' ? teamCategoryFilter as InternalTicketFilterParams['category'] : undefined,
        search: debouncedTeamSearch || undefined,
        sort: teamSort !== 'default' ? teamSort : undefined,
        assigned_to_me: internalFilterAssignment === 'mine' ? true : undefined,
        unassigned: internalFilterAssignment === 'unassigned' ? true : undefined,
      });
      if (isStale()) return;
      setInternalTickets(response.items);
      setTeamTotal(response.total ?? 0);
    } catch (error) {
      if (isStale()) return;
      setInternalTickets([]);
      setTeamTotal(0);
      setInternalTicketsError(errorText(error, 'Could not load team tickets'));
    } finally {
      if (!isStale()) setInternalLoading(false);
    }
  };

  const fetchInternalStats = async () => {
    try {
      const data = await internalTicketService.adminGetStats();
      setInternalStats(data);
      setInternalStatsFailed(false);
    } catch (error) {
      console.error('Error fetching internal stats:', error);
      setInternalStatsFailed(true);
    }
  };

  const fetchInternalTicketDetail = async (ticketId: string) => {
    try {
      const ticket = await internalTicketService.getTicket(ticketId);
      setSelectedInternalTicket(ticket);
    } catch (error) {
      showErrorToast(error, "Couldn't load the full ticket — showing the summary from the list", {
        id: `internal-ticket-detail-${ticketId}`,
        retry: () => fetchInternalTicketDetail(ticketId),
      });
    }
  };

  const handleAssignInternalTicket = async (ticketId: string) => {
    try {
      setInternalActionLoading(ticketId);
      const updatedTicket = await internalTicketService.assignTicket(ticketId);
      setInternalTickets(internalTickets.map(t => t.id === ticketId ? updatedTicket : t));
      if (selectedInternalTicket?.id === ticketId) {
        setSelectedInternalTicket(updatedTicket);
      }
      toast.success('Ticket assigned to you');
      fetchInternalStats();
    } catch (error) {
      console.error('Error assigning ticket:', error);
      showErrorToast(error, "Couldn't assign the ticket");
    } finally {
      setInternalActionLoading(null);
    }
  };

  const handleResolveInternalTicket = async (ticketId: string) => {
    try {
      setInternalActionLoading(ticketId);
      const updatedTicket = await internalTicketService.resolveTicket(ticketId);
      setInternalTickets(internalTickets.map(t => t.id === ticketId ? updatedTicket : t));
      if (selectedInternalTicket?.id === ticketId) {
        setSelectedInternalTicket(updatedTicket);
      }
      toast.success('Ticket marked as resolved');
      fetchInternalStats();
    } catch (error) {
      console.error('Error resolving ticket:', error);
      showErrorToast(error, "Couldn't resolve the ticket");
    } finally {
      setInternalActionLoading(null);
    }
  };

  const handleCloseInternalTicket = async (ticketId: string) => {
    try {
      setInternalActionLoading(ticketId);
      const updatedTicket = await internalTicketService.closeTicket(ticketId);
      setInternalTickets(internalTickets.map(t => t.id === ticketId ? updatedTicket : t));
      if (selectedInternalTicket?.id === ticketId) {
        setSelectedInternalTicket(updatedTicket);
      }
      toast.success('Ticket closed');
      fetchInternalStats();
    } catch (error) {
      console.error('Error closing ticket:', error);
      showErrorToast(error, "Couldn't close the ticket");
    } finally {
      setInternalActionLoading(null);
    }
  };

  const handleReopenInternalTicket = async (ticketId: string) => {
    try {
      setInternalActionLoading(ticketId);
      const updatedTicket = await internalTicketService.reopenTicket(ticketId);
      setInternalTickets(internalTickets.map(t => t.id === ticketId ? updatedTicket : t));
      if (selectedInternalTicket?.id === ticketId) {
        setSelectedInternalTicket(updatedTicket);
      }
      toast.success('Ticket reopened');
      fetchInternalStats();
    } catch (error) {
      console.error('Error reopening ticket:', error);
      showErrorToast(error, "Couldn't reopen the ticket");
    } finally {
      setInternalActionLoading(null);
    }
  };

  // Forward a Team ticket to platform support (dialog in components/support/ForwardTicketDialog).
  const [forwardTicket, setForwardTicket] = useState<InternalTicket | null>(null);
  const handleInternalTicketForwarded = (updatedTicket: InternalTicket) => {
    setInternalTickets(prev => prev.map(t => t.id === updatedTicket.id ? updatedTicket : t));
    if (selectedInternalTicket?.id === updatedTicket.id) {
      setSelectedInternalTicket(updatedTicket);
    }
    fetchInternalStats();
    // The forwarded copy is a new row in My Support Tickets.
    fetchTickets();
    fetchStats();
  };
  // Jump from a forwarded Team ticket to its copy in My Support Tickets.
  const openForwardedSupportTicket = (supportTicketId: string) => {
    setActiveTab('external');
    setDetailError(null);
    setSelectedTicket(null); // don't flash a previously opened ticket while this one loads
    fetchTicketDetail(supportTicketId);
    setView('detail');
  };

  const handleSendInternalReply = async () => {
    if ((!replyMessage.trim() && teamReplyFiles.length === 0) || !selectedInternalTicket || replySending) return;

    setReplySending(true);
    try {
      // Files first; on a forwarded ticket the backend also adds them to My Support Tickets / the Control Plane.
      if (teamReplyFiles.length) {
        await internalTicketService.uploadAttachments(selectedInternalTicket.id, teamReplyFiles);
      }
      const text = replyMessage.trim()
        || `Attached ${teamReplyFiles.length} file${teamReplyFiles.length > 1 ? 's' : ''}: ${teamReplyFiles.map(f => f.name).join(', ')}`;
      setTeamReplyFiles([]);
      const updatedTicket = await internalTicketService.addResponse(selectedInternalTicket.id, {
        message: text,
      });

      setSelectedInternalTicket(updatedTicket);
      setInternalTickets(prev => prev.map(t => t.id === updatedTicket.id ? updatedTicket : t));
      setReplyMessage('');
      toast.success('Reply sent successfully');
    } catch (error) {
      showErrorToast(error, "Couldn't send your reply");
    } finally {
      setReplySending(false);
    }
  };

  const downloadInternalAttachment = async (ticketId: string, file: { id: string; file_name: string }) => {
    try {
      saveBlob(await internalTicketService.downloadAttachment(ticketId, file.id), file.file_name);
    } catch (error) {
      showErrorToast(error, `Couldn't download ${file.file_name}`, { retry: () => downloadInternalAttachment(ticketId, file) });
    }
  };

  const handleUpdateInternalPriority = async (ticketId: string, newPriority: InternalTicketPriority) => {
    try {
      const updatedTicket = await internalTicketService.updateTicket(ticketId, { priority: newPriority });
      setInternalTickets(internalTickets.map(t => t.id === ticketId ? updatedTicket : t));
      if (selectedInternalTicket?.id === ticketId) {
        setSelectedInternalTicket(updatedTicket);
      }
      toast.success('Priority updated');
    } catch (error) {
      console.error('Error updating priority:', error);
      showErrorToast(error, "Couldn't update the priority");
    }
  };

  const getInternalStatusBadge = (status: string) => {
    const map = {
      'open': { variant: 'info' as const, icon: Circle },
      'in-progress': { variant: 'warning' as const, icon: Clock3 },
      'resolved': { variant: 'success' as const, icon: CheckCircle2 },
      'closed': { variant: 'muted' as const, icon: XCircle },
    };

    const { variant, icon: Icon } = map[status as keyof typeof map] || map['open'];

    return (
      <Badge variant={variant} className="gap-1.5 px-3 py-1.5">
        <Icon className="w-3.5 h-3.5" />
        {status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' ')}
      </Badge>
    );
  };

  const getInternalPriorityBadge = (priorityValue: string) => {
    const priorityData = internalPriorities.find(p => p.value === priorityValue);
    return (
      <span className={`px-2.5 py-1 rounded text-xs border ${priorityData?.color}`}>
        {priorityData?.label}
      </span>
    );
  };

  const getInternalCategoryLabel = (categoryValue: string) => {
    return internalCategories.find(c => c.value === categoryValue)?.label || categoryValue;
  };

  const getInternalCategoryIcon = (categoryValue: string) => {
    const cat = internalCategories.find(c => c.value === categoryValue);
    return cat?.icon || HelpCircle;
  };

  // The server already filtered, searched, sorted and paged this list.
  const filteredInternalTickets = internalTickets;
  const sortedInternalTickets = internalTickets;
  const paginatedInternalTickets = internalTickets;

  const handleSubmitTicket = async () => {
    if (!title.trim() || !description.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      setSubmitting(true);
      const { data } = await api.post(supportPath(), { title, description, category, priority });
      const newTicket = transformTicket(data);

      // Files go up after the ticket exists. They used to be dropped silently —
      // only title/description/category/priority were ever sent.
      let uploadProblem: string | null = null;
      if (attachments.length > 0) {
        try {
          await uploadAttachments(newTicket.id, attachments);
        } catch (error) {
          uploadProblem = errorText(error, 'the files could not be uploaded');
        }
      }

      if (uploadProblem) {
        toast.warning(`Ticket #${newTicket.ticketNumber} created, but its attachments were not uploaded: ${uploadProblem}. You can attach them from the ticket.`);
      } else {
        toast.success(`Ticket #${newTicket.ticketNumber} created. We'll respond within 24 hours.`);
      }

      // Reset form (and drop the saved draft — it has been submitted)
      if (authUser?.id) {
        try { localStorage.removeItem(`${TICKET_DRAFT_PREFIX}${authUser.id}`); } catch { /* storage unavailable */ }
      }
      setDraftRestored(false);
      setSubmitAttempted(false);
      setTitle('');
      setDescription('');
      setCategory('technical');
      setPriority('medium');
      setAttachments([]);
      setView('tickets');

      // Show it from the server's first page (the list is server-paged now).
      if (myCurrentPage === 1) fetchTickets(); else setMyCurrentPage(1);
      fetchStats();
    } catch (error) {
      showErrorToast(error, "Couldn't create the ticket");
    } finally {
      setSubmitting(false);
    }
  };

  // POST /support-tickets/{id}/attachments (multipart). Returns the updated ticket.
  const uploadAttachments = async (ticketId: string, files: File[]): Promise<SupportTicket> => {
    const form = new FormData();
    files.forEach(f => form.append('files', f));
    const { data } = await api.post(supportPath(`/${ticketId}/attachments`), form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return transformTicket(data);
  };

  // Attachments are served through the API (auth required), so fetch as a blob.
  const downloadAttachment = async (ticketId: string, file: { id: string; name: string }) => {
    try {
      const { data } = await api.get(supportPath(`/${ticketId}/attachments/${file.id}/download`), { responseType: 'blob' });
      const url = URL.createObjectURL(data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      showErrorToast(error, `Couldn't download ${file.name}`, { retry: () => downloadAttachment(ticketId, file) });
    }
  };

  // Checks type / combined size / count; returns the files that may be added.
  // The 10 MB limit is for all files sent together, not per file. `onTicket`
  // is how many files the ticket already has (25 max across all uploads).
  const acceptFiles = (incoming: File[], alreadyChosen: File[], onTicket = 0): File[] => {
    const accepted: File[] = [];
    let totalBytes = alreadyChosen.reduce((sum, f) => sum + f.size, 0);
    if (incoming.length > ATTACHMENT_MAX_FILES) {
      toast.error(`You can upload up to ${ATTACHMENT_MAX_FILES} files at a time — only the first ${ATTACHMENT_MAX_FILES} were considered`);
    }
    for (const f of incoming) {
      const ext = f.name.includes('.') ? `.${f.name.split('.').pop()!.toLowerCase()}` : '';
      const chosen = alreadyChosen.length + accepted.length;
      if (VIDEO_EXTENSIONS.includes(ext) || f.type.startsWith('video/')) {
        toast.error(`${f.name}: video files can't be attached`);
      } else if (!ATTACHMENT_EXTENSIONS.includes(ext)) {
        toast.error(`${f.name}: this file type can't be attached`);
      } else if (onTicket + chosen >= ATTACHMENT_MAX_PER_TICKET) {
        toast.error(`A ticket can have at most ${ATTACHMENT_MAX_PER_TICKET} attachments`);
        break;
      } else if (chosen >= ATTACHMENT_MAX_FILES) {
        // Per-upload limit; the oversized-pick case was announced above.
        if (incoming.length <= ATTACHMENT_MAX_FILES) {
          toast.error(`You can upload up to ${ATTACHMENT_MAX_FILES} files at a time`);
        }
        break;
      } else if (f.size > ATTACHMENT_MAX_BYTES) {
        // Same wording as the profile-picture limit (Settings.tsx).
        toast.error(`${f.name} is ${formatBytes(f.size)}. Attachments must be 10 MB or smaller — please choose a smaller file.`);
      } else if (totalBytes + f.size > ATTACHMENT_MAX_BYTES) {
        toast.error(`${f.name} (${formatBytes(f.size)}) wasn't added. Files in one upload must total 10 MB or less, and ${formatBytes(totalBytes)} is already chosen — remove a file or choose a smaller one.`);
      } else {
        accepted.push(f);
        totalBytes += f.size;
      }
    }
    return accepted;
  };

  const applyUpdatedTicket = (updatedTicket: SupportTicket) => {
    setSelectedTicket(updatedTicket);
    setTickets(prev => prev.map(t => t.id === updatedTicket.id ? updatedTicket : t));
  };

  const handleSendReply = async () => {
    if ((!replyMessage.trim() && replyFiles.length === 0) || !selectedTicket || replySending) return;

    setReplySending(true);
    try {
      let updatedTicket = selectedTicket;
      if (replyMessage.trim()) {
        const { data } = await api.post(supportPath(`/${selectedTicket.id}/responses`), { message: replyMessage });
        updatedTicket = transformTicket(data);
        applyUpdatedTicket(updatedTicket);
        setReplyMessage('');
      }
      if (replyFiles.length > 0) {
        try {
          updatedTicket = await uploadAttachments(selectedTicket.id, replyFiles);
          applyUpdatedTicket(updatedTicket);
          setReplyFiles([]);
        } catch (error) {
          // Keep the files chosen so the user can retry just the upload.
          showErrorToast(error, "Couldn't upload the attachments");
          return;
        }
      }
      toast.success('Reply sent successfully');
    } catch (error) {
      showErrorToast(error, "Couldn't send your reply");
    } finally {
      setReplySending(false);
    }
  };

  const handleCloseTicket = async () => {
    if (!selectedTicket) return;
    try {
      const { data } = await api.post(supportPath(`/${selectedTicket.id}/close`));
      applyUpdatedTicket(transformTicket(data));
      toast.success('Ticket closed');
      fetchStats();
    } catch (error) {
      showErrorToast(error, "Couldn't close the ticket");
    }
  };

  const handleReopenTicket = async () => {
    if (!selectedTicket) return;
    try {
      const { data } = await api.post(supportPath(`/${selectedTicket.id}/reopen`));
      applyUpdatedTicket(transformTicket(data));
      toast.success('Ticket reopened');
      fetchStats();
    } catch (error) {
      showErrorToast(error, "Couldn't reopen the ticket");
    }
  };

  // API 5: Update Ticket - PUT /api/v1/support-tickets/{ticket_id}
  const handleUpdateTicket = async (updates: {
    title?: string;
    description?: string;
    category?: string;
    priority?: string;
    status?: string;
  }) => {
    if (!selectedTicket) return;
    try {
      const { data } = await api.put(supportPath(`/${selectedTicket.id}`), updates);
      applyUpdatedTicket(transformTicket(data));
      toast.success('Ticket updated');
      fetchStats();
      return true;
    } catch (error) {
      showErrorToast(error, "Couldn't update the ticket");
      return false;
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = ''; // allow choosing the same file again after removing it
    const ok = acceptFiles(picked, attachments);
    if (ok.length) setAttachments(prev => [...prev, ...ok]);
  };

  const handleReplyFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    const ok = acceptFiles(picked, replyFiles, selectedTicket?.attachments?.length ?? 0);
    if (ok.length) setReplyFiles(prev => [...prev, ...ok]);
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const getStatusBadge = (status: SupportTicket['status']) => {
    const map = {
      'open': { variant: 'warning' as const, icon: Circle },
      'in-progress': { variant: 'info' as const, icon: Clock3 },
      'resolved': { variant: 'success' as const, icon: CheckCircle2 },
      'closed': { variant: 'muted' as const, icon: XCircle },
    };
    const { variant, icon: Icon } = map[status];
    return (
      <Badge variant={variant} className="gap-1.5 px-3 py-1.5">
        <Icon className="w-3.5 h-3.5" />
        {status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' ')}
      </Badge>
    );
  };

  const getPriorityBadge = (priority: SupportTicket['priority']) => {
    const priorityData = priorities.find(p => p.value === priority);
    return (
      <span className={`px-2.5 py-1 rounded text-xs border ${priorityData?.color}`}>
        {priorityData?.label}
      </span>
    );
  };

  const getCategoryLabel = (category: string) => {
    return categories.find(c => c.value === category)?.label || category;
  };

  const getCategoryIcon = (category: string) => {
    const cat = categories.find(c => c.value === category);
    return cat?.icon || HelpCircle;
  };

  // The server already filtered, searched, sorted and paged this list.
  const filteredTickets = tickets;
  const paginatedTickets = tickets;

  // Back to page 1 when a tab's own filters change.
  useEffect(() => {
    setMyCurrentPage(1);
  }, [debouncedSearch, filterStatus, filterPriority, myCategoryFilter, ticketSort, activeTab]);

  useEffect(() => {
    setTeamCurrentPage(1);
  }, [debouncedTeamSearch, teamFilterStatus, teamFilterPriority, internalFilterAssignment, activeTab, teamCategoryFilter, teamSort]);


  /* Card counts come only from the stats endpoints. They used to fall back to
     a tally of `tickets` — the filtered/searched list, so a different rule —
     and the internal cards to 0, then jump once stats landed. Placeholder
     until they arrive; '—' if the stats call failed. */
  const statCount = (value: number | undefined, failed: boolean) =>
    value !== undefined ? value : failed ? '—' : <StatValuePlaceholder />;
  const openTickets = statCount(stats?.open_tickets, statsFailed);
  const inProgressTickets = statCount(stats?.in_progress_tickets, statsFailed);
  const resolvedTickets = statCount(stats?.resolved_tickets, statsFailed);
  const totalTickets = statCount(stats?.total_tickets, statsFailed);

  // Internal ticket stats
  const internalOpenTickets = statCount(internalStats?.open_tickets, internalStatsFailed);
  const internalInProgressTickets = statCount(internalStats?.in_progress_tickets, internalStatsFailed);
  const internalResolvedTickets = statCount(internalStats?.resolved_tickets, internalStatsFailed);
  // Numeric for the "needs attention" badges, which simply stay hidden at 0.
  const internalUnassignedTickets = internalStats?.unassigned_tickets ?? 0;
  const internalUnassignedCount = statCount(internalStats?.unassigned_tickets, internalStatsFailed);
  const internalTotalTickets = statCount(internalStats?.total_tickets, internalStatsFailed);

  return (
    <div ref={rootRef} className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="tf-page-sheet">
      <PageBreadcrumb
        className="mb-4 md:mb-6"
        items={
          activeTab === 'external' && view === 'detail' && selectedTicket
            ? [{ label: 'Dashboard', href: '/dashboard' }, { label: 'Support Tickets', onClick: () => setView('tickets') }, { label: selectedTicket.ticketNumber }]
            : activeTab === 'team' && view === 'detail' && selectedInternalTicket
            ? [{ label: 'Dashboard', href: '/dashboard' }, { label: 'Team Tickets', onClick: () => setView('tickets') }, { label: selectedInternalTicket.ticket_number }]
            : activeTab === 'external' && view === 'submit'
              ? [{ label: 'Dashboard', href: '/dashboard' }, { label: 'Support Tickets', onClick: () => setView('overview') }, { label: 'New Ticket' }]
              : activeTab === 'unit-disputes'
                ? [{ label: 'Dashboard', href: '/dashboard' }, { label: 'Support Tickets', onClick: () => openTab('external') }, { label: 'Unit Disputes' }]
                : [{ label: 'Dashboard', href: '/dashboard' }, { label: 'Support Tickets' }]
        }
      />
      <div className="tf-card-soft mb-4 flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 text-brand-blue sm:h-12 sm:w-12">
            <Headphones className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="tf-page-title">Support Center</h1>
            <p className="mt-0.5 tf-body-secondary">{activeTab === 'external' ? 'Get help from the TalentFlow support team.' : activeTab === 'team' ? 'Manage help requests from your team in one place.' : 'Ask for units back when a session failed because of a platform problem.'}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Not in plan → the same pill, muted, with the plan-locked hover (never hidden). */}
          <FeatureGate
            feature="priority_support"
            mode="hidden"
            fallback={
              <span
                aria-disabled="true"
                title={PLAN_LOCKED_MESSAGE}
                className="inline-flex cursor-not-allowed max-w-full items-start justify-start whitespace-normal text-left leading-snug items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 tf-caption dark:bg-slate-800"
              >
                <Lock className="h-3.5 w-3.5 shrink-0 shrink-0 mt-0.5" />
                <span className="sm:hidden">Priority Support not in plan</span>
                <span className="hidden sm:inline">Priority Support is not included in your current plan.</span>
              </span>
            }
          >
            <span title="Priority Support enabled — tickets handled with higher priority and faster response times." className="inline-flex items-center gap-2 rounded-lg bg-success-subtle px-3 py-2 text-xs font-medium text-success-strong max-w-full items-start justify-start whitespace-normal text-left leading-snug">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success text-white">
                <Check className="h-3 w-3 shrink-0 mt-0.5" strokeWidth={3} />
              </span>
              <span className="sm:hidden">Priority Support enabled</span>
              <span className="hidden sm:inline">Priority Support enabled — tickets handled with higher priority and faster response times.</span>
            </span>
          </FeatureGate>
          <div className="flex items-center gap-2 sm:gap-3">
            {activeTab === 'team' && isAdmin && (
              <Button
                variant="secondary"
                onClick={() => { fetchInternalTickets(); fetchInternalStats(); }}
                icon={<RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />}
              >
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            )}
            {activeTab === 'external' && view !== 'overview' && view !== 'submit' && (
              <Button
                variant="primary"
                onClick={openSubmitView}
                icon={<Send className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />}
              >
                New Ticket
              </Button>
            )}
          </div>
        </div>
      </div>
      {/* Tab Switcher - Only show for admins */}
      {isAdmin && (
        <div role="tablist" aria-label="Support ticket views" className="mb-4 flex gap-1 border-b border-gray-200 dark:border-slate-700">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'external'}
            onClick={() => openTab('external')}
            className={`tf-tab-line -mb-px ${
              activeTab === 'external'
                ? 'tf-tab-line-active'
                : ''
            }`}
          >
            <div className="flex items-center gap-1.5 sm:gap-2">
              <User className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline">My Support Tickets</span>
              <span className="sm:hidden">My Tickets</span>
            </div>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'team'}
            onClick={() => openTab('team')}
            className={`tf-tab-line -mb-px ${
              activeTab === 'team'
                ? 'tf-tab-line-active'
                : ''
            }`}
          >
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Users className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline">Team Support Tickets</span>
              <span className="sm:hidden">Team</span>
              {internalUnassignedTickets > 0 && (
                <span className="tf-badge sm:px-2 bg-brand-orange/15 text-brand-orange ring-1 ring-brand-orange/20">
                  {internalUnassignedTickets}
                </span>
              )}
            </div>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'unit-disputes'}
            aria-disabled={!canViewUnitDisputes}
            title={canViewUnitDisputes ? undefined : 'You do not have permission to view unit disputes'}
            onClick={() => { if (canViewUnitDisputes) openTab('unit-disputes'); }}
            className={`tf-tab-line -mb-px ${
              activeTab === 'unit-disputes'
                ? 'tf-tab-line-active'
                : canViewUnitDisputes ? '' : 'cursor-not-allowed text-gray-400 opacity-60'
            }`}
          >
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Shield className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline">Unit Disputes</span>
              <span className="sm:hidden">Disputes</span>
              {!canViewUnitDisputes && <Lock className="h-3.5 w-3.5 flex-shrink-0" />}
            </div>
          </button>
        </div>
      )}

      {/* Unit Disputes — the shared screen, without its own page shell. */}
      {isAdmin && activeTab === 'unit-disputes' && canViewUnitDisputes && <UnitDisputesView embedded />}

      {/* Content */}
      <div>
        {/* ========== EXTERNAL SUPPORT TICKETS (TalentFlow Support) ========== */}

        {/* Overview */}
        {activeTab === 'external' && view === 'overview' && (
          <div className="space-y-4">
            {/* Stats Cards — clicking a card drills into the tickets list pre-filtered by that status */}
            <div className="tf-grid-4">
              {[
                { label: 'Open Tickets', value: openTickets, sub: 'Awaiting response', icon: FileText, tile: 'bg-brand-blue/10 text-brand-blue', badge: <Clock className="h-4 w-4 text-brand-orange" />, filter: 'open' },
                { label: 'In Progress', value: inProgressTickets, sub: 'Being worked on', icon: CircleDashed, tile: 'bg-brand-blue/10 text-brand-blue', badge: <Clock className="h-4 w-4 text-brand-orange" />, filter: 'in-progress' },
                { label: 'Resolved', value: resolvedTickets, sub: 'Successfully solved', icon: CheckCircle2, tile: 'bg-success-subtle text-success', badge: null, filter: 'resolved' },
                { label: 'Total Tickets', value: totalTickets, sub: 'All time', icon: BarChart3, tile: 'bg-brand-blue/10 text-brand-blue', badge: null, filter: 'all' },
              ].map(card => {
                const CardIcon = card.icon;
                return (
                  <button
                    key={card.label}
                    type="button"
                    onClick={() => { setFilterStatus(card.filter as typeof filterStatus); setView('tickets'); }}
                    className="group relative flex w-full items-start gap-3 overflow-hidden tf-panel p-4 text-left transition-all hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-md"
                  >
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${card.tile}`}>
                      <CardIcon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="tf-body-secondary">{card.label}</p>
                      <p className="mt-0.5 text-2xl font-bold tracking-tight tabular-nums text-gray-900 dark:text-slate-50">{card.value}</p>
                      <p className="mt-0.5 tf-meta">{card.sub}</p>
                      <p className="mt-1.5 inline-flex items-center gap-0.5 text-xs font-semibold text-brand-blue opacity-70 transition-opacity group-hover:opacity-100">
                        View tickets
                        <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                      </p>
                    </div>
                    {card.badge && <span className="shrink-0">{card.badge}</span>}
                  </button>
                );
              })}
            </div>

            {/* Quick Actions */}
            <div className="tf-grid-2">
              <button
                onClick={openSubmitView}
                className="group flex w-full flex-col gap-3 tf-panel p-4 text-left transition-all hover:border-brand-blue/30 hover:shadow-md sm:flex-row sm:items-center"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 text-brand-blue">
                  <Send className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="tf-section-title">Submit New Ticket</h3>
                  <p className="mt-0.5 tf-body-secondary">Report an issue or request help from our support team</p>
                </div>
                <span className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-brand-blue px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-blue/25 transition-colors group-hover:bg-brand-blue-2">
                  Submit New Ticket
                  <ChevronRight className="h-4 w-4" />
                </span>
              </button>

              <button
                onClick={() => setView('tickets')}
                className="group flex w-full flex-col gap-3 tf-panel p-4 text-left transition-all hover:border-brand-blue/30 hover:shadow-md sm:flex-row sm:items-center"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 text-brand-blue">
                  <Ticket className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="tf-section-title">View My Tickets</h3>
                  <p className="mt-0.5 tf-body-secondary">Track and manage all your support requests</p>
                </div>
                <span className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-brand-blue px-4 py-2 text-sm font-semibold text-brand-blue transition-colors group-hover:bg-brand-blue/5">
                  View My Tickets
                  <ChevronRight className="h-4 w-4" />
                </span>
              </button>
            </div>

            {/* Recent Tickets */}
            <div className="tf-panel p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="tf-section-title">Recent Tickets</h3>
                <button
                  onClick={() => setView('tickets')}
                  className="inline-flex items-center gap-1 text-sm font-medium text-brand-blue hover:text-brand-blue/80"
                >
                  View All
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 rounded-lg border border-gray-100 px-4 py-3 dark:border-slate-700/60">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-4 flex-1" />
                      <Skeleton className="hidden h-5 w-16 rounded-md sm:block" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : tickets.length === 0 ? (
                <NoTicketsYetState onCreate={openSubmitView} />
              ) : (
                <>
                  {/* Mobile: compact cards */}
                  <MobileRecordList>
                    {tickets.slice(0, 5).map(ticket => {
                      const openTicket = () => {
                        setSelectedTicket(ticket);
                        fetchTicketDetail(ticket.id);
                        setView('detail');
                      };
                      return (
                        <MobileRecordCard
                          key={ticket.id}
                          className="tf-jdv-actions-inline"
                          onClick={openTicket}
                          idBadge={<span className="inline-block max-w-full truncate tf-id-chip">{ticket.ticketNumber}</span>}
                          title={ticket.title}
                          badges={
                            <>
                              {getPriorityBadge(ticket.priority)}
                              {getStatusBadge(ticket.status)}
                              {ticket.forwardedFrom && <ForwardedTag from={ticket.forwardedFrom.internalTicketNumber} />}
{isAwaitingUserReply(ticket) && <AwaitingReplyTag />}
                            </>
                          }
                          meta={[
                            { icon: <Tag />, label: getCategoryLabel(ticket.category) },
                            { icon: <Calendar />, label: formatISTDate(ticket.createdAt) },
                          ]}
                          actions={
                            <IconButton bare label={`View ticket ${ticket.ticketNumber}`} tooltip="View" type="button" onClick={openTicket} className="tf-icon-btn-outline">
                              <Eye />
                            </IconButton>
                          }
                        />
                      );
                    })}
                  </MobileRecordList>

                  {/* Desktop: table */}
                  <div className="hidden overflow-x-auto lg:block">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-white text-left tf-caption dark:bg-slate-900">
                          <th className="tf-th-cell rounded-l-lg tf-th">Ticket ID</th>
                          <th className="tf-th-cell tf-th">Subject</th>
                          <th className="tf-th-cell tf-th">Category</th>
                          <th className="tf-th-cell tf-th">Priority</th>
                          <th className="tf-th-cell tf-th">Created On</th>
                          <th className="tf-th-cell tf-th">Status</th>
                          <th className="tf-th-cell rounded-r-lg text-right tf-th">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                        {tickets.slice(0, 5).map(ticket => (
                          <tr key={ticket.id} className="transition-colors hover:bg-gray-50/70 dark:hover:bg-slate-800/40">
                            <td className="tf-td whitespace-nowrap font-medium text-gray-900 dark:text-slate-100">{ticket.ticketNumber}</td>
                            <td className="tf-td max-w-[240px] truncate text-gray-900 dark:text-slate-100" title={ticket.title}>{ticket.title}</td>
                            <td className="tf-td whitespace-nowrap text-gray-600 dark:text-slate-400">{getCategoryLabel(ticket.category)}</td>
                            <td className="tf-td">{getPriorityBadge(ticket.priority)}</td>
                            <td className="tf-td whitespace-nowrap text-gray-600 dark:text-slate-400">{formatISTDate(ticket.createdAt)}</td>
                            <td className="tf-td">
                              <div className="flex flex-col items-start gap-1">
                                {getStatusBadge(ticket.status)}
                                {ticket.forwardedFrom && <ForwardedTag from={ticket.forwardedFrom.internalTicketNumber} />}
{isAwaitingUserReply(ticket) && <AwaitingReplyTag />}
                              </div>
                            </td>
                            <td className="tf-td text-right">
                              <button
                                onClick={() => {
                                  setSelectedTicket(ticket);
                                  fetchTicketDetail(ticket.id);
                                  setView('detail');
                                }}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-brand-blue/30 px-3 py-1.5 text-xs font-semibold text-brand-blue transition-colors hover:bg-brand-blue/5"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                View
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* Help Resources + Contact Information — one dropdown, collapsed by default */}
            <div className="tf-panel">
              <button
                type="button"
                onClick={() => setHelpOpen(o => !o)}
                aria-expanded={helpOpen}
                aria-controls="support-help-resources"
                className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left sm:px-5"
              >
                <span className="tf-section-title">Help &amp; Resources</span>
                <ChevronDown className={`h-5 w-5 shrink-0 text-gray-500 transition-transform duration-200 ${helpOpen ? 'rotate-180' : ''}`} />
              </button>
              {helpOpen && (
            <div id="support-help-resources" className="space-y-4 border-t border-gray-100 p-4 sm:p-5 dark:border-slate-700/60">
            {/* Help Resources */}
            <div className="tf-grid-3">
              {[
                { key: 'kb', title: 'Knowledge Base', desc: 'Browse articles and guides', icon: Book },
                { key: 'video', title: 'Video Tutorials', desc: 'Watch step-by-step guides', icon: Video },
                { key: 'faq', title: 'FAQs', desc: 'Find quick answers', icon: FileQuestion },
              ].map(item => {
                const ItemIcon = item.icon;
                const inner = (
                  <>
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 text-brand-blue">
                      <ItemIcon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h4 className="tf-row-title sm:text-base">{item.title}</h4>
                      <p className="tf-meta sm:text-sm">{item.desc}</p>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-gray-500 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-blue" />
                  </>
                );
                const cls = 'group flex w-full items-center gap-3 tf-panel p-4 text-left transition-all hover:border-brand-blue/30 hover:shadow-md';
                // Video tutorials and FAQs have no content yet — shown as "Coming soon" instead of a dead link.
                return item.key === 'kb' ? (
                  <button key={item.key} onClick={() => setView('knowledge-base')} className={cls}>{inner}</button>
                ) : (
                  <div key={item.key} aria-disabled="true" className="relative flex w-full cursor-default items-center gap-3 rounded-xl border border-dashed border-gray-200 bg-gray-50/60 p-4 text-left opacity-80 dark:border-slate-700 dark:bg-slate-800/30">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-500">
                      <item.icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h4 className="tf-row-title sm:text-base">{item.title}</h4>
                      <p className="tf-meta sm:text-sm">{item.desc}</p>
                    </div>
                    <span className="tf-badge shrink-0 bg-gray-200 tf-micro-hint uppercase tracking-wide dark:bg-slate-700">Coming soon</span>
                  </div>
                );
              })}
            </div>

            {/* Contact Information */}
            <div className="border-t border-gray-100 pt-4 dark:border-slate-700/60">
              <h3 className="mb-3 tf-section-title">Need Immediate Help?</h3>
              <div className="tf-grid-3 sm:divide-x sm:divide-gray-200 dark:sm:divide-slate-700">
                {[
                  { label: 'Email', value: 'support@talentflow.com', icon: Mail, href: 'mailto:support@talentflow.com' },
                  { label: 'Phone', value: '1-800-TALENT-1', icon: Phone, href: undefined },
                  { label: 'Hours', value: 'Mon-Fri, 9AM-6PM EST', icon: Clock, href: undefined },
                ].map((c, i) => {
                  const ContactIcon = c.icon;
                  return (
                    <div key={c.label} className={`flex min-w-0 items-center gap-3 ${i > 0 ? 'sm:pl-6' : ''}`}>
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-blue/10 text-brand-blue">
                        <ContactIcon className="h-[18px] w-[18px]" />
                      </span>
                      <div className="min-w-0">
                        <div className="tf-meta">{c.label}</div>
                        {c.href ? (
                          <a href={c.href} className="block truncate text-sm font-medium text-brand-blue hover:underline">{c.value}</a>
                        ) : (
                          <div className="truncate tf-row-name">{c.value}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            </div>
              )}
            </div>
          </div>
        )}

        {/* Submit Ticket Form */}
        {activeTab === 'external' && view === 'submit' && (() => {
          const titleMissing = submitAttempted && !title.trim();
          const descriptionMissing = submitAttempted && !description.trim();
          const envIncluded = description.includes(ENV_BLOCK_MARKER);
          // Possible duplicates among this user's already-loaded active tickets (no extra API call).
          const words = titleWords(title);
          const similarTickets = title.trim().length >= 4 && words.length > 0
            ? tickets
                .filter(tk => tk.status === 'open' || tk.status === 'in-progress')
                .map(tk => {
                  const tkWords = titleWords(tk.title);
                  return { tk, score: words.filter(w => tkWords.includes(w)).length };
                })
                .filter(({ score }) => score >= Math.min(2, words.length))
                .sort((a, b) => b.score - a.score)
                .slice(0, 3)
                .map(({ tk }) => tk)
            : [];
          const toolBtn = 'flex h-8 w-8 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100';

          return (
          <div>
            <button
              onClick={() => setView('overview')}
              className="mb-3 flex items-center gap-1.5 text-sm text-gray-600 hover:text-brand-blue dark:text-slate-400"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Overview
            </button>

            <div className="tf-grid-3">
              {/* Form — Ctrl/⌘ + Enter submits (same Submit as the button) */}
              <div
                className="tf-panel p-4 sm:p-6 lg:col-span-2"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    submitTicketFromForm();
                  }
                }}
              >
                <div className="border-b border-gray-100 pb-4 dark:border-slate-700/60">
                  <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-slate-50 sm:text-2xl">Create Support Ticket</h2>
                  <p className="mt-1 tf-body-secondary">Tell us about your issue or request. Our support team will get back to you as soon as possible.</p>
                </div>

                {/* Draft status */}
                {draftRestored ? (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-brand-blue/[0.05] px-3 py-2 tf-meta ring-1 ring-brand-blue/10 dark:bg-slate-800/60 dark:ring-slate-700 sm:text-sm">
                    <span className="inline-flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 shrink-0 text-brand-blue" />
                      We restored your unsent draft.
                    </span>
                    <button type="button" onClick={discardDraft} className="font-semibold text-brand-blue hover:underline">
                      Discard draft
                    </button>
                  </div>
                ) : (title.trim() || description.trim()) && authUser?.id ? (
                  <p className="mt-3 flex items-center gap-1.5 tf-hint">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Draft saved automatically on this device
                  </p>
                ) : null}

                <div className="mt-5 space-y-5">
                  {/* Title */}
                  <div>
                    <Label className="mb-1.5 font-semibold">
                      Title <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value.slice(0, TICKET_TITLE_MAX))}
                      maxLength={TICKET_TITLE_MAX}
                      aria-invalid={titleMissing || undefined}
                      aria-describedby={titleMissing ? 'ticket-title-error' : undefined}
                      placeholder="Brief description of your issue (e.g., Unable to upload resume)"
                    />
                    <div className="mt-1 flex items-center justify-between gap-2">
                      {titleMissing ? (
                        <p id="ticket-title-error" className="flex items-center gap-1 text-xs font-medium text-destructive">
                          <AlertCircle className="h-3.5 w-3.5" /> Title is required
                        </p>
                      ) : <span />}
                      <p className={`text-xs tabular-nums ${title.length >= TICKET_TITLE_MAX ? 'text-destructive' : 'text-gray-500 dark:text-slate-500'}`}>{title.length}/{TICKET_TITLE_MAX}</p>
                    </div>

                    {/* Possible duplicates */}
                    {similarTickets.length > 0 && (
                      <div className="mt-2 rounded-lg border border-warning-line bg-warning-subtle/60 p-3">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-warning-strong sm:text-sm">
                          <AlertCircle className="h-4 w-4 shrink-0" />
                          You may already have a ticket about this
                        </p>
                        <ul className="mt-2 space-y-1.5">
                          {similarTickets.map(tk => (
                            <li key={tk.id} className="flex items-center justify-between gap-2 rounded-md bg-white px-2.5 py-1.5 text-xs dark:bg-slate-900 sm:text-sm">
                              <span className="min-w-0 truncate">
                                <span className="text-gray-500 dark:text-slate-400">{tk.ticketNumber}</span>
                                <span className="mx-1.5 text-gray-300">·</span>
                                <span className="text-gray-900 dark:text-slate-100">{tk.title}</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => { setSelectedTicket(tk); fetchTicketDetail(tk.id); setView('detail'); }}
                                className="shrink-0 font-semibold text-brand-blue hover:underline"
                              >
                                View
                              </button>
                            </li>
                          ))}
                        </ul>
                        <p className="mt-2 tf-meta">Adding to an existing ticket gets you a faster answer. Your draft is kept if you go and check.</p>
                      </div>
                    )}
                  </div>

                  {/* Category + Priority */}
                  <div className="tf-grid-2">
                    <div>
                      <Label className="mb-1.5 font-semibold">
                        Category <span className="text-destructive">*</span>
                      </Label>
                      <FilterSelect
                        value={category}
                        onChange={(v) => setCategory(v as SupportTicket['category'])}
                        options={categories.map(cat => ({ value: cat.value, label: cat.label }))}
                        className="w-full sm:w-full px-3 sm:px-3 py-2.5 sm:py-2.5 rounded-lg sm:rounded-lg"
                      />
                    </div>

                    <div>
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <Label className="font-semibold">
                          Priority <span className="text-destructive">*</span>
                        </Label>
                        <Tooltip
                          content={
                            <div className="max-w-[260px] space-y-1 text-left text-xs">
                              {PRIORITY_GUIDANCE.map(g => (
                                <p key={g.label}><strong>{g.label}:</strong> {g.text}</p>
                              ))}
                            </div>
                          }
                        >
                          <span tabIndex={0} aria-label="What each priority means" className="inline-flex cursor-help text-gray-500 hover:text-brand-blue">
                            <Info className="h-4 w-4" />
                          </span>
                        </Tooltip>
                      </div>
                      <FilterSelect
                        value={priority}
                        onChange={(v) => setPriority(v as SupportTicket['priority'])}
                        options={priorities.map(p => ({ value: p.value, label: p.label }))}
                        className="w-full sm:w-full px-3 sm:px-3 py-2.5 sm:py-2.5 rounded-lg sm:rounded-lg"
                      />
                      <p className="mt-1 tf-meta">
                        {PRIORITY_GUIDANCE.find(g => g.label.toLowerCase() === priority)?.text}
                      </p>
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                      <Label className="font-semibold">
                        Description <span className="text-destructive">*</span>
                      </Label>
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => { setDescTemplateOpen(o => !o); setDescEmojiOpen(false); }}
                            aria-expanded={descTemplateOpen}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-blue hover:underline sm:text-sm"
                          >
                            <FileText className="h-4 w-4" />
                            Use Template
                          </button>
                          {descTemplateOpen && (
                            <>
                              <button type="button" aria-hidden="true" tabIndex={-1} className="fixed inset-0 z-10 cursor-default" onClick={() => setDescTemplateOpen(false)} />
                              <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                                {DESCRIPTION_TEMPLATES.map((tpl, tplIndex) => (
                                  <button
                                    key={tpl.label}
                                    type="button"
                                    title={tpl.text}
                                    data-template-index={tplIndex}
                                    onClick={handleDescTemplatePick}
                                    className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 hover:text-brand-blue dark:text-slate-300 dark:hover:bg-slate-800"
                                  >
                                    {tpl.label}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowDescriptionPreview(p => !p)}
                          aria-pressed={showDescriptionPreview}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-brand-blue dark:text-slate-400 sm:text-sm"
                        >
                          {showDescriptionPreview ? <><FileText className="h-4 w-4" /> Edit</> : <><Eye className="h-4 w-4" /> Preview</>}
                        </button>
                      </div>
                    </div>

                    {showDescriptionPreview ? (
                      <div className="min-h-[132px] rounded-md border border-gray-200 bg-gray-50 px-3 py-2 tf-body leading-relaxed dark:border-slate-700 dark:bg-slate-800/50">
                        {description.trim()
                          ? <div className="space-y-1">{renderFormattedMessage(description)}</div>
                          : <p className="text-gray-500 dark:text-slate-500">Nothing to preview yet.</p>}
                      </div>
                    ) : (
                      <Textarea
                        ref={descriptionRef}
                        value={description}
                        onChange={(e) => setDescription(e.target.value.slice(0, TICKET_DESCRIPTION_MAX))}
                        onSelect={(e) => { lastDescSel.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd }; }}
                        maxLength={TICKET_DESCRIPTION_MAX}
                        aria-invalid={descriptionMissing || undefined}
                        aria-describedby={descriptionMissing ? 'ticket-description-error' : undefined}
                        placeholder={CATEGORY_DESCRIPTION_HINTS[category] || 'Please provide detailed information about your issue.'}
                        rows={6}
                      />
                    )}

                    {/* Toolbar + counter */}
                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-0.5">
                        <IconButton bare label="Bold" type="button" disabled={showDescriptionPreview} onClick={() => wrapDescription('**', '**', 'bold text')} className={toolBtn}><Bold className="h-4 w-4" /></IconButton>
                        <IconButton bare label="Italic" type="button" disabled={showDescriptionPreview} onClick={() => wrapDescription('_', '_', 'italic text')} className={toolBtn}><Italic className="h-4 w-4" /></IconButton>
                        <IconButton bare label="Bulleted list" type="button" disabled={showDescriptionPreview} onClick={() => prefixDescriptionLines(() => '- ')} className={toolBtn}><List className="h-4 w-4" /></IconButton>
                        <IconButton bare label="Numbered list" type="button" disabled={showDescriptionPreview} onClick={() => prefixDescriptionLines(i => `${i + 1}. `)} className={toolBtn}><ListOrdered className="h-4 w-4" /></IconButton>
                        <IconButton bare label="Insert link" type="button" disabled={showDescriptionPreview} onClick={() => wrapDescription('[', '](https://)', 'link text')} className={toolBtn}><Link2 className="h-4 w-4" /></IconButton>
                        <div className="relative">
                          <IconButton bare label="Insert emoji" type="button" disabled={showDescriptionPreview} onClick={() => { setDescEmojiOpen(o => !o); setDescTemplateOpen(false); }} aria-expanded={descEmojiOpen} className={toolBtn}><Smile className="h-4 w-4" /></IconButton>
                          {descEmojiOpen && !showDescriptionPreview && (
                            <>
                              <button type="button" aria-hidden="true" tabIndex={-1} className="fixed inset-0 z-10 cursor-default" onClick={() => setDescEmojiOpen(false)} />
                              <div className="absolute left-0 top-full z-20 mt-1 max-h-64 w-[17.5rem] overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                                {EMOJI_GROUPS.map(group => (
                                  <div key={group.group} className="mb-1.5 last:mb-0">
                                    <p className="px-1 pb-1 text-2xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-500">{group.group}</p>
                                    <div className="grid grid-cols-8 gap-0.5">
                                      {group.items.map(em => (
                                        <button
                                          key={em}
                                          type="button"
                                          aria-label={`Insert ${em}`}
                                          data-emoji={em}
                                          onClick={handleDescEmojiPick}
                                          style={{ fontFamily: EMOJI_FONT_STACK }}
                                          className="flex h-8 w-8 items-center justify-center rounded-md text-xl leading-none hover:bg-gray-100 dark:hover:bg-slate-800"
                                        >
                                          {em}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {descriptionMissing && (
                          <p id="ticket-description-error" className="flex items-center gap-1 text-xs font-medium text-destructive">
                            <AlertCircle className="h-3.5 w-3.5" /> Description is required
                          </p>
                        )}
                        <p className={`text-xs tabular-nums ${description.length >= TICKET_DESCRIPTION_MAX ? 'text-destructive' : 'text-gray-500 dark:text-slate-500'}`}>{description.length}/{TICKET_DESCRIPTION_MAX}</p>
                      </div>
                    </div>

                    {/* Optional browser details — inserted visibly into the description */}
                    <label className="mt-3 flex cursor-pointer items-start gap-2.5 tf-body">
                      <input
                        type="checkbox"
                        checked={envIncluded}
                        onChange={(e) => toggleEnvironmentDetails(e.target.checked)}
                        className="tf-checkbox mt-0.5 focus:ring-brand-blue/30"
                      />
                      <span>
                        Include my browser details
                        <span className="block tf-meta">Adds your browser, operating system and screen size to the description so support can reproduce the issue. You can edit it before sending.</span>
                      </span>
                    </label>
                  </div>

                  {/* Attachments */}
                  <div>
                    <Label className="mb-1.5 font-semibold">
                      Attachments <span className="font-normal text-gray-500 dark:text-slate-400">(Optional)</span>
                    </Label>
                    {/* Uploaded right after the ticket is created (POST …/attachments). */}
                    <label
                      htmlFor="file-upload"
                      className="block cursor-pointer rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/60 p-5 text-center transition-colors hover:border-brand-blue/40 hover:bg-brand-blue/[0.03] dark:border-slate-700 dark:bg-slate-800/30 sm:p-6"
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        id="file-upload"
                        multiple
                        accept={ATTACHMENT_ACCEPT}
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                      <div className="flex flex-col items-center">
                        <UploadCloud className="mb-2 h-9 w-9 text-brand-blue/60" />
                        <span className="tf-label">Click to attach files</span>
                        {/* Explicit control: opens the picker directly, not via the label. */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            fileInputRef.current?.click();
                          }}
                          className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-blue px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-blue/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
                        >
                          <Paperclip className="h-4 w-4" />
                          Browse files
                        </button>
                        <span className="mt-3 text-xs text-gray-600 dark:text-slate-300">
                          <span className="font-medium text-gray-700 dark:text-slate-200">Supported formats:</span>{' '}
                          {ATTACHMENT_SHOWN_EXTS.join(', ')}
                        </span>
                        <span className="mt-1 tf-meta">
                          Up to {ATTACHMENT_MAX_FILES} files per upload (10 MB in total) · {ATTACHMENT_MAX_PER_TICKET} files per ticket · no videos
                        </span>
                      </div>
                    </label>

                    {attachments.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {attachments.map((file, index) => (
                          <div key={index} className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-2.5 dark:border-slate-700 dark:bg-slate-800/50">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <FileText className="h-4 w-4 flex-shrink-0 text-brand-blue" />
                              <div className="min-w-0">
                                <div className="truncate tf-body">{file.name}</div>
                                <div className="tf-meta">
                                  {(file.name.split('.').pop() || '').toUpperCase()} · {(file.size / 1024).toFixed(1)} KB
                                </div>
                              </div>
                            </div>
                            <Tooltip content="Remove attachment">
                              <button
                                onClick={() => removeAttachment(index)}
                                aria-label="Remove attachment"
                                className="flex-shrink-0 rounded-lg p-1.5 transition-colors hover:bg-gray-200 dark:hover:bg-slate-700"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </button>
                            </Tooltip>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-3 border-t border-gray-100 pt-4 dark:border-slate-700/60 sm:flex-row sm:items-center sm:justify-between">
                    <p className="hidden tf-hint sm:block">
                      Tip: press <kbd className="rounded border border-gray-200 bg-gray-50 px-1 py-0.5 font-sans text-2xs dark:border-slate-700 dark:bg-slate-800">Ctrl</kbd> + <kbd className="rounded border border-gray-200 bg-gray-50 px-1 py-0.5 font-sans text-2xs dark:border-slate-700 dark:bg-slate-800">Enter</kbd> to submit
                    </p>
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:gap-3">
                      <Button
                        variant="secondary"
                        onClick={() => setView('overview')}
                        disabled={submitting}
                        className="w-full sm:w-36"
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="primary"
                        onClick={submitTicketFromForm}
                        disabled={submitting}
                        className="w-full sm:w-48"
                        icon={submitting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      >
                        {submitting ? 'Submitting...' : 'Submit Ticket'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tips */}
              <aside className="h-fit tf-panel p-4 sm:p-5 lg:sticky lg:top-4">
                <div className="flex items-start gap-3 border-b border-gray-100 pb-4 dark:border-slate-700/60">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-blue/10 text-brand-blue">
                    <Lightbulb className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="tf-section-title">Tips for a better response</h3>
                    <p className="mt-0.5 tf-body-muted">Follow these guidelines to help us resolve your issue faster.</p>
                  </div>
                </div>
                <ul className="mt-4 space-y-4">
                  {[
                    { title: 'Use a clear and concise title', desc: 'Summarize your issue in a few words.' },
                    { title: 'Provide step-by-step details', desc: 'Include the exact steps to reproduce the issue.' },
                    { title: 'Include error messages', desc: 'Paste any error text you see, or attach a screenshot or log file.' },
                    { title: 'Mention expected and actual results', desc: 'Clearly explain what you expected and what actually happened.' },
                    { title: 'Select the correct category and priority', desc: 'Choose the category and priority that best matches your issue.' },
                  ].map(tip => (
                    <li key={tip.title} className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-blue/10 text-brand-blue">
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      </span>
                      <div className="min-w-0">
                        <p className="tf-row-title">{tip.title}</p>
                        <p className="mt-0.5 tf-meta sm:text-sm">{tip.desc}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </aside>
            </div>
          </div>
          );
        })()}

        {/* All Tickets List */}
        {activeTab === 'external' && view === 'tickets' && (
          <div>
            <button
              onClick={() => setView('overview')}
              className="flex items-center gap-1.5 sm:gap-2 text-sm text-gray-600 dark:text-slate-400 hover:text-brand-blue mb-4 sm:mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Overview
            </button>

            <div className="tf-card-soft">
              {/* Filters */}
              <div className="p-3 sm:p-4 md:p-6 border-b border-gray-100 dark:border-slate-700/60">
                <div className="flex flex-col gap-2 sm:gap-3 md:gap-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-blue/60 z-10" />
                    <Input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search tickets..."
                      className="pl-9 pr-4 w-full"
                    />
                  </div>

                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-3 md:gap-4">
                    <FilterSelect
                      value={filterStatus}
                      onChange={(v) => setFilterStatus(v)}
                      options={[
                        { value: 'all', label: 'All Status' },
                        { value: 'open', label: 'Open' },
                        { value: 'in-progress', label: 'In Progress' },
                        { value: 'resolved', label: 'Resolved' },
                        { value: 'closed', label: 'Closed' },
                      ]}
                      className="px-3 sm:px-3 py-2.5 sm:py-2.5 rounded-lg sm:rounded-lg"
                    />

                    <FilterSelect
                      value={filterPriority}
                      onChange={(v) => setFilterPriority(v)}
                      options={[
                        { value: 'all', label: 'All Priority' },
                        { value: 'low', label: 'Low' },
                        { value: 'medium', label: 'Medium' },
                        { value: 'high', label: 'High' },
                        { value: 'urgent', label: 'Urgent' },
                      ]}
                      className="px-3 sm:px-3 py-2.5 sm:py-2.5 rounded-lg sm:rounded-lg"
                    />

                    <FilterSelect
                      value={myCategoryFilter}
                      onChange={(v) => setMyCategoryFilter(v)}
                      ariaLabel="Filter by category"
                      options={[{ value: 'all', label: 'All Categories' }, ...categories.map(c => ({ value: c.value, label: c.label }))]}
                      className="px-3 sm:px-3 py-2.5 sm:py-2.5 rounded-lg sm:rounded-lg"
                    />

                    <FilterSelect
                      value={ticketSort}
                      onChange={(v) => setTicketSort(v as typeof ticketSort)}
                      ariaLabel="Sort tickets"
                      options={[
                        { value: 'default', label: 'Sort: Default' },
                        { value: 'newest', label: 'Sort: Newest first' },
                        { value: 'updated', label: 'Sort: Last updated' },
                        { value: 'priority', label: 'Sort: Priority (high → low)' },
                      ]}
                      className="px-3 sm:px-3 py-2.5 sm:py-2.5 rounded-lg sm:rounded-lg"
                    />
                  </div>

                  {/* Active filters — shared FilterChips, each removable, plus clear all
                      (kept: this card's only reset). */}
                  <FilterChips
                    chips={[
                      searchQuery && { key: 'search', label: 'Search', value: searchQuery, onRemove: () => setSearchQuery('') },
                      filterStatus !== 'all' && { key: 'status', label: 'Status', value: filterStatus.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), onRemove: () => setFilterStatus('all') },
                      filterPriority !== 'all' && { key: 'priority', label: 'Priority', value: filterPriority.charAt(0).toUpperCase() + filterPriority.slice(1), onRemove: () => setFilterPriority('all') },
                      myCategoryFilter !== 'all' && { key: 'category', label: 'Category', value: getCategoryLabel(myCategoryFilter), onRemove: () => setMyCategoryFilter('all') },
                    ].filter(Boolean) as FilterChip[]}
                    onClearAll={() => { setSearchQuery(''); setFilterStatus('all'); setFilterPriority('all'); setMyCategoryFilter('all'); }}
                  />
                </div>
              </div>

              {/* Tickets */}
              {loading ? (
                <div className="space-y-2 p-3 sm:p-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 rounded-lg border border-gray-100 px-4 py-3 dark:border-slate-700/60">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-4 flex-1" />
                      <Skeleton className="hidden h-5 w-16 rounded-md lg:block" />
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {/* Mobile Card Layout */}
                  <MobileRecordList className="p-3">
                    {paginatedTickets.map(ticket => {
                      const CategoryIcon = getCategoryIcon(ticket.category);
                      const openTicket = () => {
                        setSelectedTicket(ticket);
                        fetchTicketDetail(ticket.id);
                        setView('detail');
                      };
                      return (
                        <MobileRecordCard
                          key={ticket.id}
                          className="tf-jdv-actions-inline"
                          onClick={openTicket}
                          idBadge={<span className="inline-block max-w-full truncate tf-id-chip">{ticket.ticketNumber}</span>}
                          title={ticket.title}
                          badges={
                            <>
                              {getPriorityBadge(ticket.priority)}
                              {getStatusBadge(ticket.status)}
                              {ticket.forwardedFrom && <ForwardedTag from={ticket.forwardedFrom.internalTicketNumber} />}
{isAwaitingUserReply(ticket) && <AwaitingReplyTag />}
                            </>
                          }
                          meta={[
                            { icon: <CategoryIcon />, label: getCategoryLabel(ticket.category) },
                            { icon: <Clock />, label: formatISTDate(ticket.updatedAt) },
                          ]}
                          actions={
                            <IconButton bare label={`View ticket ${ticket.ticketNumber}`} tooltip="View" type="button" onClick={openTicket} className="tf-icon-btn-outline">
                              <Eye />
                            </IconButton>
                          }
                        />
                      );
                    })}
                  </MobileRecordList>

                  {/* Desktop Table — left out when empty: its min-height would
                      otherwise sit as a blank gap above the empty state. */}
                  <div className={`hidden overflow-x-auto tf-table-shell ${filteredTickets.length > 0 ? 'lg:block' : ''}`}>
                    <table className="w-full">
                      <thead className="bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-700/60">
                        <tr>
                          <th className="tf-th-cell text-left tf-th">Ticket #</th>
                          <th className="tf-th-cell text-left tf-th">Title</th>
                          <th className="tf-th-cell text-left tf-th">Category</th>
                          <th className="tf-th-cell text-left tf-th">Priority</th>
                          <th className="tf-th-cell text-left tf-th">Status</th>
                          <th className="tf-th-cell text-left tf-th">Updated</th>
                          <th className="tf-th-cell text-left tf-th tf-sticky-col">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                        {paginatedTickets.map(ticket => {
                          const CategoryIcon = getCategoryIcon(ticket.category);
                          return (
                            <tr key={ticket.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                              <td className="tf-td">
                                <span className="tf-body">{ticket.ticketNumber}</span>
                              </td>
                              <td className="tf-td">
                                <div className="tf-body max-w-md truncate">{ticket.title}</div>
                              </td>
                              <td className="tf-td">
                                <div className="flex items-center gap-2 min-w-0">
                                  <CategoryIcon className="w-4 h-4 text-gray-600 dark:text-slate-400 flex-shrink-0" />
                                  <span className="tf-body-secondary truncate">{getCategoryLabel(ticket.category)}</span>
                                </div>
                              </td>
                              <td className="tf-td">
                                {getPriorityBadge(ticket.priority)}
                              </td>
                              <td className="tf-td">
                                <div className="flex flex-col items-start gap-1">
                                  {getStatusBadge(ticket.status)}
                                  {ticket.forwardedFrom && <ForwardedTag from={ticket.forwardedFrom.internalTicketNumber} />}
{isAwaitingUserReply(ticket) && <AwaitingReplyTag />}
                                </div>
                              </td>
                              <td className="tf-td">
                                <span className="tf-body-secondary">{formatISTDate(ticket.updatedAt)}</span>
                              </td>
                              <td className="tf-td tf-sticky-col">
                                <button
                                  onClick={() => {
                                    setSelectedTicket(ticket);
                                    fetchTicketDetail(ticket.id);
                                    setView('detail');
                                  }}
                                  className="text-sm font-medium text-brand-blue hover:text-brand-blue/80"
                                >
                                  View Details
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {ticketsError ? (
                    <ListLoadError message={ticketsError} onRetry={fetchTickets} />
                  ) : filteredTickets.length === 0 && (
                    <div className="p-4"><NoTicketsFoundState /></div>
                  )}
                </>
              )}
            </div>

            {/* Pagination — My Support Tickets (server total, not just this page) */}
            {!loading && myTotal > 0 && (
              <ListPagination
                currentPage={myCurrentPage}
                itemsPerPage={myItemsPerPage}
                totalItems={myTotal}
                onPageChange={setMyCurrentPage}
                onItemsPerPageChange={setMyItemsPerPage}
                itemLabel="tickets"
              />
            )}
          </div>
        )}

        {/* Ticket Detail View */}
        {activeTab === 'external' && view === 'detail' && selectedTicket && (() => {
          const ticketIndex = tickets.findIndex(t => t.id === selectedTicket.id);
          const prevTicket = ticketIndex > 0 ? tickets[ticketIndex - 1] : null;
          const nextTicket = ticketIndex >= 0 && ticketIndex < tickets.length - 1 ? tickets[ticketIndex + 1] : null;
          const openTicket = (t: SupportTicket) => {
            setSelectedTicket(t);
            fetchTicketDetail(t.id);
            setTicketMenuOpen(false);
          };
          const copyTicketId = () => {
            navigator.clipboard?.writeText(selectedTicket.ticketNumber)
              .then(() => toast.success('Ticket ID copied'))
              .catch((err) => showErrorToast(err, "Couldn't copy the ticket ID"));
          };
          const detailTab = detailTabState.id === selectedTicket.id ? detailTabState.tab : 'conversation';
          const draftPriority = priorityDraft.id === selectedTicket.id ? priorityDraft.value : selectedTicket.priority;
          const attachments = selectedTicket.attachments || [];
          const responses = selectedTicket.responses || [];
          const responseCount = responses.length;
          // The chat thread starts with the ticket's original message (its description),
          // unless the API already returns that as the first reply.
          const descriptionText = (selectedTicket.description || '').trim();
          const descriptionAlreadyInReplies = responses[0]?.from === 'user' && responses[0].message.trim() === descriptionText;
          const thread: NonNullable<SupportTicket['responses']> = descriptionText && !descriptionAlreadyInReplies
            ? [{ id: `${selectedTicket.id}-description`, from: 'user', message: selectedTicket.description, timestamp: selectedTicket.createdAt }, ...responses]
            : responses;
          const myName = authUser?.name || 'You';
          const authorName = (r: NonNullable<SupportTicket['responses']>[number]) =>
            r.from === 'user' ? myName : (r.agentName || 'Support Team');
          const statusLabel = selectedTicket.status.charAt(0).toUpperCase() + selectedTicket.status.slice(1).replace('-', ' ');
          const priorityLabel = priorities.find(p => p.value === selectedTicket.priority)?.label || selectedTicket.priority;

          // Plain-text transcript of the ticket, generated in the browser.
          const downloadTranscript = () => {
            const lines = [
              `Ticket ${selectedTicket.ticketNumber}: ${selectedTicket.title}`,
              `Status: ${statusLabel}`,
              `Priority: ${priorityLabel}`,
              `Category: ${getCategoryLabel(selectedTicket.category)}`,
              `Created: ${formatIST(selectedTicket.createdAt)}`,
              `Last updated: ${formatIST(selectedTicket.updatedAt)}`,
              '',
              'Description:',
              selectedTicket.description || '-',
              '',
              'Conversation:',
              ...(responses.length
                ? responses.flatMap(r => [`[${formatIST(r.timestamp)}] ${authorName(r)}:`, r.message, ''])
                : ['No messages yet.']),
            ];
            const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${selectedTicket.ticketNumber}-transcript.txt`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            setTicketMenuOpen(false);
          };

          // Activity log derived from what the ticket already records.
          const activity = [
            { time: selectedTicket.createdAt, icon: Ticket, title: 'Ticket created', detail: `${getCategoryLabel(selectedTicket.category)} · ${priorityLabel} priority` },
            ...responses.map(r => ({
              time: r.timestamp,
              icon: MessageSquare,
              title: r.from === 'user' ? `${myName} replied` : `${authorName(r)} replied`,
              detail: r.message.length > 120 ? `${r.message.slice(0, 120)}…` : r.message,
            })),
            ...(selectedTicket.assignedAgent ? [{ time: '', icon: UserCheck, title: `Assigned to ${selectedTicket.assignedAgent}`, detail: '' }] : []),
            { time: selectedTicket.updatedAt, icon: Clock, title: `Current status: ${statusLabel}`, detail: 'As of last update' },
          ];


          const replyTemplates: { group: string; items: { label: string; text: string }[] }[] = [
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
          ];

          const cardCls = 'tf-panel';
          const toolBtn = 'flex h-8 w-8 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100';
          const infoRow = (Icon: typeof Ticket, label: string, value: React.ReactNode) => (
            <div className="flex items-center gap-3 py-2">
              <Icon className="h-4 w-4 shrink-0 text-gray-500 dark:text-slate-500" />
              <span className="w-24 shrink-0 tf-body-muted">{label}</span>
              <div className="min-w-0 flex-1 tf-row-name">{value}</div>
            </div>
          );

          return (
          <div>
            <ConfirmationDialog
              isOpen={confirmCloseOpen}
              onClose={() => setConfirmCloseOpen(false)}
              onConfirm={() => { setConfirmCloseOpen(false); handleCloseTicket(); }}
              title="Close this ticket?"
              description="The ticket will be marked as closed. You can reopen it later if the issue comes back."
              confirmText="Close Ticket"
              cancelText="Keep Open"
              variant="warning"
            />
            {detailError && (
              <div role="alert" className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-destructive-line bg-destructive-subtle px-3 py-2.5 text-sm text-destructive">
                <span className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {detailError} — showing the summary from the list.
                </span>
                <Button type="button" variant="secondary" size="sm" onClick={() => fetchTicketDetail(selectedTicket.id)}>
                  <RefreshCw className="h-4 w-4" />
                  Retry
                </Button>
              </div>
            )}
            {/* Back + previous / next */}
            <div className="mb-3 flex items-center justify-between gap-2">
              <button
                onClick={() => setView('tickets')}
                className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-brand-blue dark:text-slate-400"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to All Tickets
              </button>
              {tickets.length > 1 && ticketIndex >= 0 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => prevTicket && openTicket(prevTicket)}
                    disabled={!prevTicket}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => nextTicket && openTicket(nextTicket)}
                    disabled={!nextTicket}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Next
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            <div className="tf-grid-3">
              {/* Main Content */}
              <div className={`${cardCls} p-4 sm:p-5 lg:col-span-2`}>
                {/* Ticket Header */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 tf-meta">
                      <span>{selectedTicket.ticketNumber}</span>
                      <IconButton bare label="Copy ticket ID" type="button" onClick={copyTicketId} className="rounded p-0.5 hover:bg-gray-100 hover:text-brand-blue dark:hover:bg-slate-800">
                        <Copy className="h-3.5 w-3.5" />
                      </IconButton>
                    </div>
                    <h2 className="mt-1 break-words text-xl font-bold tracking-tight text-gray-900 dark:text-slate-50 sm:text-2xl">{selectedTicket.title}</h2>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      {getStatusBadge(selectedTicket.status)}
                      {getPriorityBadge(selectedTicket.priority)}
                      <span className="rounded-md bg-gray-100 px-2 py-0.5 tf-caption dark:bg-slate-800">
                        {getCategoryLabel(selectedTicket.category)}
                      </span>
                      {selectedTicket.forwardedFrom && <ForwardedTag from={selectedTicket.forwardedFrom.internalTicketNumber} />}
                      {isAwaitingUserReply(selectedTicket) && <AwaitingReplyTag />}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-start gap-3">
                    <div className="flex flex-row gap-4 sm:flex-col sm:gap-2 sm:border-l sm:border-gray-200 sm:pl-5 dark:sm:border-slate-700">
                      <div className="flex items-start gap-2">
                        <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-gray-500 dark:text-slate-500" />
                        <div>
                          <div className="tf-meta">Created</div>
                          <div className="tf-caption">{formatIST(selectedTicket.createdAt)}</div>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gray-500 dark:text-slate-500" />
                        <div>
                          <div className="tf-meta">Last Updated</div>
                          <div className="tf-caption">{formatIST(selectedTicket.updatedAt)}</div>
                        </div>
                      </div>
                    </div>
                    {/* More actions menu */}
                    <div className="relative">
                      <IconButton bare label="More actions"
                        type="button"
                        onClick={() => setTicketMenuOpen(o => !o)}
                        aria-expanded={ticketMenuOpen}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </IconButton>
                      {ticketMenuOpen && (
                        <>
                          <button type="button" aria-hidden="true" tabIndex={-1} className="fixed inset-0 z-10 cursor-default" onClick={() => setTicketMenuOpen(false)} />
                          <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                            <button type="button" onClick={() => { copyTicketId(); setTicketMenuOpen(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800">
                              <Copy className="h-4 w-4" /> Copy ticket ID
                            </button>
                            <button type="button" onClick={downloadTranscript} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800">
                              <Download className="h-4 w-4" /> Download transcript
                            </button>
                            {(selectedTicket.status === 'resolved' || selectedTicket.status === 'closed') && (
                              <button type="button" onClick={() => { setTicketMenuOpen(false); handleReopenTicket(); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800">
                                <ExternalLink className="h-4 w-4" /> Reopen ticket
                              </button>
                            )}
                            {selectedTicket.status !== 'closed' && (
                              <button type="button" onClick={() => { setTicketMenuOpen(false); setConfirmCloseOpen(true); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-destructive-subtle">
                                <Trash2 className="h-4 w-4" /> Close ticket
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {selectedTicket.forwardedFrom && (() => {
                  const fwd = selectedTicket.forwardedFrom;
                  return (
                    <div className="mt-4 flex flex-col gap-2 rounded-lg border border-brand-blue/20 bg-brand-blue/[0.05] p-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 items-start gap-2.5">
                        <Forward className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" />
                        <div className="min-w-0 tf-body">
                          <p>
                            Forwarded from Team ticket <strong>{fwd.internalTicketNumber}</strong> to <strong>{forwardTeamLabel(fwd.team)}</strong>
                            {fwd.forwardedBy && <> by {fwd.forwardedBy}</>}
                            {fwd.forwardedAt && <> · {formatIST(fwd.forwardedAt)}</>}
                          </p>
                          {fwd.requesterName && (
                            <p className="mt-1 tf-meta">
                              Raised by {fwd.requesterName}{fwd.requesterEmail ? ` (${fwd.requesterEmail})` : ''}
                            </p>
                          )}
                          {fwd.note && <p className="mt-1 break-words tf-meta">Note: {fwd.note}</p>}
                          <p className="mt-1 tf-meta">Status changes here are reflected on the Team ticket.</p>
                        </div>
                      </div>
                      {isAdmin && fwd.internalTicketId && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab('team');
                            setSelectedInternalTicket(null);
                            fetchInternalTicketDetail(fwd.internalTicketId!);
                            setView('detail');
                          }}
                          className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand-blue hover:underline"
                        >
                          View Team ticket
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })()}

                {/* Conversation / Activity Log / Attachments tabs */}
                <div className="mt-5 flex gap-1 border-b border-gray-200 dark:border-slate-700">
                  {[
                    { id: 'conversation' as const, label: 'Conversation', icon: MessageSquare },
                    { id: 'activity' as const, label: 'Activity Log', icon: History },
                    { id: 'attachments' as const, label: `Attachments (${attachments.length})`, icon: Paperclip },
                  ].map(tab => {
                    const TabIcon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setDetailTabState({ id: selectedTicket.id, tab: tab.id })}
                        className={`tf-tab-line -mb-px ${
                          detailTab === tab.id
                            ? 'tf-tab-line-active'
                            : ''
                        }`}
                      >
                        <TabIcon className="h-4 w-4" />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {detailTab === 'conversation' && (
                  <>
                    <div className="mt-4 space-y-3">
                      {thread.length === 0 && (
                        <p className="py-6 text-center tf-body-muted">No messages yet.</p>
                      )}
                      {thread.map((response) => (
                        <div
                          key={response.id}
                          className={`w-fit min-w-[240px] max-w-[90%] rounded-xl border p-3 sm:max-w-[75%] sm:p-4 ${
                            response.from === 'user'
                              ? 'ml-auto rounded-tr-sm border-brand-blue/15 bg-brand-blue/[0.06] dark:bg-brand-blue/10'
                              : 'mr-auto rounded-tl-sm border-gray-200 bg-gray-50 dark:border-slate-700/60 dark:bg-slate-800/50'
                          }`}
                        >
                          <div className={`flex items-start gap-3 ${response.from === 'user' ? 'flex-row-reverse' : ''}`}>
                            <NameAvatar name={authorName(response)} size="sm" />
                            <div className="min-w-0 flex-1">
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-2">
                                  <span className="truncate tf-row-title">{authorName(response)}</span>
                                  {response.from === 'user' ? (
                                    <span className="tf-badge bg-brand-blue/10 text-2xs text-brand-blue">You</span>
                                  ) : (
                                    <span className="tf-badge bg-gray-200 tf-micro-hint dark:bg-slate-700">Support</span>
                                  )}
                                </div>
                                <span className="shrink-0 whitespace-nowrap tf-meta">{formatIST(response.timestamp)}</span>
                              </div>
                              <div className="space-y-1 tf-body leading-relaxed">{renderFormattedMessage(response.message)}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Reply Box */}
                    {selectedTicket.status !== 'closed' && (
                      <>
                        {showReplyTip && (
                          <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-success-subtle px-3 py-2.5 text-xs text-success-strong sm:text-sm">
                            <Info className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                            <span className="flex-1">Keep the conversation updated with additional details to help us resolve the issue faster.</span>
                            <IconButton bare label="Dismiss tip" type="button" onClick={() => setShowReplyTip(false)} className="shrink-0 rounded p-0.5 hover:bg-success/10">
                              <X className="h-4 w-4" />
                            </IconButton>
                          </div>
                        )}
                        <div className="mt-4 border-t border-gray-100 pt-4 dark:border-slate-700/60">
                          <div className="mb-1.5 flex items-center justify-between">
                            <Label className="text-sm font-semibold">Add a Reply</Label>
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => { setTemplateMenuOpen(o => !o); setEmojiMenuOpen(false); }}
                                aria-expanded={templateMenuOpen}
                                className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-blue hover:underline sm:text-sm"
                              >
                                <FileText className="h-4 w-4" />
                                Use Template
                              </button>
                              {templateMenuOpen && (
                                <>
                                  <button type="button" aria-hidden="true" tabIndex={-1} className="fixed inset-0 z-10 cursor-default" onClick={() => setTemplateMenuOpen(false)} />
                                  <div className="absolute right-0 z-20 mt-1 max-h-80 w-64 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                                    {replyTemplates.map(group => (
                                      <div key={group.group} className="py-1">
                                        <p className="px-3 pb-1 pt-1.5 text-2xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-500">{group.group}</p>
                                        {group.items.map(tpl => (
                                          <button
                                            key={tpl.label}
                                            type="button"
                                            title={tpl.text}
                                            onClick={() => {
                                              setReplyMessage(prev => (prev.trim() ? `${prev.trimEnd()}\n\n${tpl.text}` : tpl.text));
                                              lastReplySel.current = null; // next insert goes to the end
                                              setTemplateMenuOpen(false);
                                              requestAnimationFrame(() => replyRef.current?.focus());
                                            }}
                                            className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 hover:text-brand-blue dark:text-slate-300 dark:hover:bg-slate-800"
                                          >
                                            {tpl.label}
                                          </button>
                                        ))}
                                      </div>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                          <Textarea
                            ref={replyRef}
                            value={replyMessage}
                            onChange={(e) => setReplyMessage(e.target.value)}
                            onSelect={(e) => { lastReplySel.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd }; }}
                            placeholder="Type your message..."
                            rows={4}
                          />
                          {replyFiles.length > 0 && (
                            <ul className="mt-2 flex flex-wrap gap-1.5">
                              {replyFiles.map((file, index) => (
                                <li key={`${file.name}-${index}`} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 py-1 pl-2.5 pr-1 tf-meta dark:border-slate-700 dark:bg-slate-800/60">
                                  <Paperclip className="h-3 w-3 shrink-0 text-brand-blue" />
                                  <span className="truncate" title={file.name}>{file.name}</span>
                                  <span className="shrink-0 rounded bg-indigo-50 px-1 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">{(file.name.split('.').pop() || '').toUpperCase()}</span>
                                  <span className="shrink-0 text-gray-500">{(file.size / 1024).toFixed(0)} KB</span>
                                  <IconButton bare label={`Remove ${file.name}`}
                                    type="button"
                                    onClick={() => setReplyFiles(prev => prev.filter((_, i) => i !== index))}
                                    disabled={replySending}
                                    className="rounded-full p-0.5 hover:bg-gray-200 dark:hover:bg-slate-700"
                                  >
                                    <X className="h-3 w-3" />
                                  </IconButton>
                                </li>
                              ))}
                            </ul>
                          )}
                          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            {/* Toolbar */}
                            <div className="flex flex-wrap items-center gap-0.5">
                              <input
                                ref={replyFileInputRef}
                                type="file"
                                multiple
                                accept={ATTACHMENT_ACCEPT}
                                onChange={handleReplyFileSelect}
                                className="hidden"
                              />
                              <Tooltip content={`Up to ${ATTACHMENT_MAX_FILES} files per upload (10 MB in total), ${ATTACHMENT_MAX_PER_TICKET} per ticket · no videos`}>
                                <button
                                  type="button"
                                  onClick={() => replyFileInputRef.current?.click()}
                                  disabled={replySending}
                                  className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800"
                                >
                                  <Paperclip className="h-4 w-4" />
                                  Attach file
                                </button>
                              </Tooltip>
                              <span className="mx-1 h-5 w-px bg-gray-200 dark:bg-slate-700" />
                              <IconButton bare label="Bold" type="button" onClick={() => wrapSelection('**', '**', 'bold text')} className={toolBtn}><Bold className="h-4 w-4" /></IconButton>
                              <IconButton bare label="Italic" type="button" onClick={() => wrapSelection('_', '_', 'italic text')} className={toolBtn}><Italic className="h-4 w-4" /></IconButton>
                              <IconButton bare label="Bulleted list" type="button" onClick={() => prefixLines(() => '- ')} className={toolBtn}><List className="h-4 w-4" /></IconButton>
                              <IconButton bare label="Numbered list" type="button" onClick={() => prefixLines(i => `${i + 1}. `)} className={toolBtn}><ListOrdered className="h-4 w-4" /></IconButton>
                              <IconButton bare label="Insert link" type="button" onClick={() => wrapSelection('[', '](https://)', 'link text')} className={toolBtn}><Link2 className="h-4 w-4" /></IconButton>
                              <div className="relative">
                                <IconButton bare label="Insert emoji" type="button" onClick={() => { setEmojiMenuOpen(o => !o); setTemplateMenuOpen(false); }} aria-expanded={emojiMenuOpen} className={toolBtn}><Smile className="h-4 w-4" /></IconButton>
                                {emojiMenuOpen && (
                                  <>
                                    <button type="button" aria-hidden="true" tabIndex={-1} className="fixed inset-0 z-10 cursor-default" onClick={() => setEmojiMenuOpen(false)} />
                                    <div className="absolute bottom-full left-0 z-20 mb-1 max-h-64 w-[17.5rem] overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                                      {EMOJI_GROUPS.map(group => (
                                        <div key={group.group} className="mb-1.5 last:mb-0">
                                          <p className="px-1 pb-1 text-2xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-500">{group.group}</p>
                                          <div className="grid grid-cols-8 gap-0.5">
                                            {group.items.map(em => (
                                              <button
                                                key={em}
                                                type="button"
                                                aria-label={`Insert ${em}`}
                                                data-emoji={em}
                                                onClick={handleEmojiPick}
                                                style={{ fontFamily: EMOJI_FONT_STACK }}
                                                className="flex h-8 w-8 items-center justify-center rounded-md text-xl leading-none hover:bg-gray-100 dark:hover:bg-slate-800"
                                              >
                                                {em}
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                            <Button
                              variant="primary"
                              onClick={handleSendReply}
                              disabled={replySending || (!replyMessage.trim() && replyFiles.length === 0)}
                              icon={replySending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                              className="w-full sm:w-auto"
                            >
                              {replySending ? 'Sending…' : 'Send Reply'}
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}

                {detailTab === 'activity' && (
                  <ol className="relative mt-4 space-y-4 border-l border-gray-200 pl-5 dark:border-slate-700">
                    {activity.map((item, idx) => {
                      const ItemIcon = item.icon;
                      return (
                        <li key={idx} className="relative">
                          <span className="absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full bg-white text-brand-blue ring-1 ring-gray-200 dark:bg-slate-900 dark:ring-slate-700">
                            <ItemIcon className="h-3.5 w-3.5" />
                          </span>
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                            <p className="tf-row-title">{item.title}</p>
                            {item.time && <span className="tf-meta">{formatIST(item.time)}</span>}
                          </div>
                          {item.detail && <p className="mt-0.5 break-words tf-meta">{item.detail}</p>}
                        </li>
                      );
                    })}
                  </ol>
                )}

                {detailTab === 'attachments' && (
                  <div className="mt-4">
                    {attachments.length === 0 ? (
                      <p className="py-6 text-center tf-body-muted">No attachments on this ticket.</p>
                    ) : (
                      <ul className="space-y-2">
                        {attachments.map(file => (
                          <li key={file.id} className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5 dark:border-slate-700">
                            <FileText className="h-4 w-4 shrink-0 text-brand-blue" />
                            <span className="min-w-0 flex-1 truncate tf-body" title={file.name}>{file.name}</span>
                            <span className="shrink-0 tf-meta">{file.size}</span>
                            <IconButton bare label={`Download ${file.name}`}
                              type="button"
                              onClick={() => downloadAttachment(selectedTicket.id, file)}
                              className="shrink-0 rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-brand-blue dark:hover:bg-slate-800"
                            >
                              <Download className="h-4 w-4" />
                            </IconButton>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              {/* Sidebar */}
              <div className="space-y-4">
                {/* Ticket Info */}
                <div className={`${cardCls} p-4`}>
                  <h4 className="mb-1 flex items-center gap-2 tf-row-title">
                    <Ticket className="h-4 w-4 text-brand-blue" />
                    Ticket Information
                  </h4>
                  <div className="divide-y divide-gray-100 dark:divide-slate-700/60">
                    {infoRow(Tag, 'Ticket ID', (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="truncate">{selectedTicket.ticketNumber}</span>
                        <IconButton bare label="Copy ticket ID" type="button" onClick={copyTicketId} className="rounded p-0.5 text-gray-500 hover:bg-gray-100 hover:text-brand-blue dark:hover:bg-slate-800">
                          <Copy className="h-3.5 w-3.5" />
                        </IconButton>
                      </span>
                    ))}
                    {infoRow(Circle, 'Status', getStatusBadge(selectedTicket.status))}
                    {infoRow(AlertCircle, 'Priority', getPriorityBadge(selectedTicket.priority))}
                    {infoRow(Inbox, 'Category', getCategoryLabel(selectedTicket.category))}
                    {infoRow(Calendar, 'Created', formatIST(selectedTicket.createdAt))}
                    {infoRow(Clock, 'Last Updated', formatIST(selectedTicket.updatedAt))}
                    {selectedTicket.forwardedFrom?.requesterName && infoRow(User, 'Requester', (
                      <span className="truncate">{selectedTicket.forwardedFrom.requesterName}</span>
                    ))}
                    {selectedTicket.assignedAgent && infoRow(UserCheck, 'Agent', (
                      <span className="flex min-w-0 items-center gap-2">
                        <NameAvatar name={selectedTicket.assignedAgent} size="xs" />
                        <span className="truncate">{selectedTicket.assignedAgent}</span>
                      </span>
                    ))}
                    {infoRow(MessageSquare, 'Responses', `${responseCount} message${responseCount === 1 ? '' : 's'}`)}
                  </div>
                  {selectedTicket.status !== 'closed' && selectedTicket.status !== 'resolved' && (
                    <div className="mt-3 flex items-start gap-2 rounded-lg bg-brand-blue/[0.05] px-3 py-2 tf-meta dark:bg-slate-800/60">
                      <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-blue" />
                      <span>
                        Typical first response within <strong className="font-semibold text-gray-900 dark:text-slate-100">24 hours</strong>.
                        <FeatureGate feature="priority_support" mode="hidden">
                          {' '}Priority Support is on, so your tickets are handled first.
                        </FeatureGate>
                      </span>
                    </div>
                  )}
                </div>

                {/* Update Priority */}
                {selectedTicket.status !== 'closed' && (
                  <div className={`${cardCls} p-4`}>
                    <h4 className="mb-3 flex items-center gap-2 tf-row-title">
                      <Flag className="h-4 w-4 text-brand-blue" />
                      Update Priority
                    </h4>
                    <div className="flex gap-2">
                      <FilterSelect
                        value={draftPriority}
                        onChange={(v) => setPriorityDraft({ id: selectedTicket.id, value: v })}
                        options={priorities.map(p => ({ value: p.value, label: p.label }))}
                        className="min-w-0 flex-1 px-3 sm:px-3 py-2 sm:py-2 rounded-lg sm:rounded-lg"
                      />
                      <Button
                        variant="primary"
                        onClick={() => handleUpdateTicket({ priority: draftPriority })}
                        disabled={draftPriority === selectedTicket.priority}
                      >
                        Update
                      </Button>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className={`${cardCls} p-4`}>
                  <h4 className="mb-3 flex items-center gap-2 tf-row-title">
                    <Settings2 className="h-4 w-4 text-brand-blue" />
                    Actions
                  </h4>
                  <div className="tf-grid-2">
                    <button
                      onClick={downloadTranscript}
                      className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      <Download className="h-4 w-4 flex-shrink-0" />
                      Download Transcript
                    </button>

                    {(selectedTicket.status === 'resolved' || selectedTicket.status === 'closed') && (
                      <button
                        onClick={handleReopenTicket}
                        className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                      >
                        <ExternalLink className="h-4 w-4 flex-shrink-0" />
                        Reopen Ticket
                      </button>
                    )}

                    {selectedTicket.status !== 'closed' && (
                      <button
                        onClick={() => setConfirmCloseOpen(true)}
                        className="flex items-center justify-center gap-2 rounded-lg border border-destructive-line bg-destructive-subtle px-3 py-2.5 text-sm font-medium text-destructive transition-colors hover:opacity-90"
                      >
                        <Trash2 className="h-4 w-4 flex-shrink-0" />
                        Close Ticket
                      </button>
                    )}
                  </div>
                </div>

                {/* Related Articles */}
                <div className={`${cardCls} p-4`}>
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="flex items-center gap-2 tf-row-title">
                      <Book className="h-4 w-4 text-brand-blue" />
                      Related Help Articles
                    </h4>
                    <button type="button" onClick={() => setView('knowledge-base')} className="inline-flex items-center gap-1 text-xs font-medium text-brand-blue hover:underline">
                      View All
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="flex items-start gap-2 tf-body-muted">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0" />
                    Articles for this topic are coming soon.
                  </p>
                </div>
              </div>
            </div>
          </div>
          );
        })()}

        {/* Knowledge Base */}
        {activeTab === 'external' && view === 'knowledge-base' && (
          <div>
            <button
              onClick={() => setView('overview')}
              className="flex items-center gap-1.5 sm:gap-2 text-sm text-gray-600 dark:text-slate-400 hover:text-brand-blue mb-4 sm:mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Overview
            </button>

            <div className="tf-card-soft p-4 sm:p-6 md:p-8">
              <h2 className="tf-row-title sm:text-base md:text-lg mb-4 sm:mb-6">Knowledge Base</h2>

              <div className="tf-grid-3">
                {categories.slice(0, 6).map(cat => {
                  const Icon = cat.icon;
                  return (
                    <div
                      key={cat.value}
                      aria-disabled="true"
                      className="p-3 sm:p-4 md:p-6 border border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 rounded-lg hover:border-brand-blue/30 hover:shadow-md transition-all"
                    >
                      <Icon className="w-6 h-6 sm:w-8 sm:h-8 text-brand-blue mb-2 sm:mb-3" />
                      <h4 className="tf-body sm:text-base mb-1 sm:mb-2">{cat.label}</h4>
                      <p className="tf-body-secondary">Articles coming soon</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ========== TEAM SUPPORT TICKETS (Admin Only) ========== */}

        {/* Team Tickets Overview */}
        {activeTab === 'team' && isAdmin && view === 'overview' && (
          <div className="space-y-4">
            {/* Stats Cards */}
            <div className="tf-grid-stats-5">
              {[
                { label: 'Open', value: internalOpenTickets, sub: 'Awaiting action', icon: FileText, tile: 'bg-brand-blue/10 text-brand-blue', status: 'open', assignment: 'all', attention: false },
                { label: 'In Progress', value: internalInProgressTickets, sub: 'Being handled', icon: Clock, tile: 'bg-brand-orange/10 text-brand-orange-deep', status: 'in-progress', assignment: 'all', attention: false },
                { label: 'Resolved', value: internalResolvedTickets, sub: 'Successfully resolved', icon: CheckCircle2, tile: 'bg-success-subtle text-success', status: 'resolved', assignment: 'all', attention: false },
                { label: 'Unassigned', value: internalUnassignedTickets, sub: 'Need assignment', icon: Users, tile: 'bg-brand-orange/10 text-brand-orange-deep', status: 'all', assignment: 'unassigned', attention: internalUnassignedTickets > 0 },
                { label: 'Total', value: internalTotalTickets, sub: 'All time', icon: BarChart3, tile: 'bg-brand-blue/10 text-brand-blue', status: 'all', assignment: 'all', attention: false },
              ].map(card => {
                const CardIcon = card.icon;
                return (
                  <button
                    key={card.label}
                    type="button"
                    onClick={() => { setTeamFilterStatus(card.status); setInternalFilterAssignment(card.assignment); setTeamCategoryFilter('all'); setView('tickets'); }}
                    className={`group flex w-full items-start gap-3 overflow-hidden rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${
                      card.attention
                        ? 'border-brand-orange/30 bg-brand-orange/[0.04] hover:border-brand-orange/50'
                        : 'border-gray-200 bg-white hover:border-brand-blue/30 dark:border-slate-700 dark:bg-slate-900'
                    }`}
                  >
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${card.tile}`}>
                      <CardIcon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="tf-body-secondary">{card.label}</p>
                        {card.attention && (
                          <span className="rounded-full bg-brand-orange/15 px-1.5 py-px text-2xs font-semibold text-brand-orange-deep">Needs attention</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-2xl font-bold tracking-tight tabular-nums text-gray-900 dark:text-slate-50">{card.value}</p>
                      <p className="mt-0.5 truncate tf-meta">{card.sub}</p>
                      <p className="mt-1.5 inline-flex items-center gap-0.5 text-xs font-semibold text-brand-blue opacity-70 transition-opacity group-hover:opacity-100">
                        View tickets
                        <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Category Breakdown */}
            {internalStats?.tickets_by_category && Object.keys(internalStats.tickets_by_category).length > 0 && (
              <div className="tf-panel p-4">
                <h3 className="mb-3 tf-section-title">Tickets by Category</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(internalStats.tickets_by_category).map(([cat, count]) => {
                    const CategoryIcon = getInternalCategoryIcon(cat);
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => { setTeamFilterStatus('all'); setInternalFilterAssignment('all'); setTeamCategoryFilter(cat); setView('tickets'); }}
                        className="group flex min-w-[180px] items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left transition-colors hover:border-brand-blue/30 hover:bg-white dark:border-slate-700 dark:bg-slate-800/50 dark:hover:bg-slate-800"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white text-brand-blue ring-1 ring-gray-200 dark:bg-slate-900 dark:ring-slate-700">
                          <CategoryIcon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1 truncate tf-label">{getInternalCategoryLabel(cat)}</span>
                        <span className="shrink-0 rounded-md bg-white px-2 py-0.5 tf-caption tabular-nums ring-1 ring-gray-200 dark:bg-slate-900 dark:ring-slate-700">{count}</span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-500 group-hover:text-brand-blue" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="tf-grid-3">
              {[
                { key: 'unassigned', title: 'Unassigned Tickets', desc: `${internalUnassignedTickets} tickets need attention`, icon: Users, accent: true, onClick: () => { setInternalFilterAssignment('unassigned'); setTeamCategoryFilter('all'); setView('tickets'); } },
                { key: 'mine', title: 'My Assigned Tickets', desc: 'View tickets assigned to you', icon: UserCheck, accent: false, onClick: () => { setInternalFilterAssignment('mine'); setTeamCategoryFilter('all'); setView('tickets'); } },
                { key: 'all', title: 'All Team Tickets', desc: 'View all team support requests', icon: Ticket, accent: false, onClick: () => { setInternalFilterAssignment('all'); setTeamCategoryFilter('all'); setView('tickets'); } },
              ].map(action => {
                const ActionIcon = action.icon;
                return (
                  <button
                    key={action.key}
                    onClick={action.onClick}
                    className={`group flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-all hover:shadow-md ${
                      action.accent
                        ? 'border-brand-orange/20 bg-brand-orange/[0.05] hover:border-brand-orange/40'
                        : 'border-gray-200 bg-white hover:border-brand-blue/30 dark:border-slate-700 dark:bg-slate-900'
                    }`}
                  >
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${action.accent ? 'bg-brand-orange/15 text-brand-orange-deep' : 'bg-brand-blue/10 text-brand-blue'}`}>
                      <ActionIcon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="tf-section-title">{action.title}</h3>
                      <p className="tf-body-secondary">{action.desc}</p>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-gray-500 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-blue" />
                  </button>
                );
              })}
            </div>

            {/* Recent Team Tickets */}
            <div className="tf-panel p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="tf-section-title">Recent Team Tickets</h3>
                <button
                  onClick={() => setView('tickets')}
                  className="inline-flex items-center gap-1 text-sm font-medium text-brand-blue hover:text-brand-blue/80"
                >
                  View All
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {internalLoading ? (
                <div className="flex items-center justify-center py-8 sm:py-12 tf-loader-center">
                  <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin text-brand-blue" />
                </div>
              ) : internalTickets.length === 0 ? (
                <NoTeamTicketsState />
              ) : (() => {
                const openInternal = (ticket: InternalTicket) => {
                  setSelectedInternalTicket(ticket);
                  fetchInternalTicketDetail(ticket.id);
                  setView('detail');
                };
                return (
                <>
                  {/* Mobile: compact cards */}
                  <MobileRecordList>
                    {internalTickets.slice(0, 5).map(ticket => (
                      <MobileRecordCard
                        key={ticket.id}
                        className="tf-jdv-actions-inline"
                        onClick={() => openInternal(ticket)}
                        idBadge={<span className="inline-block max-w-full truncate tf-id-chip">{ticket.ticket_number}</span>}
                        title={ticket.title}
                        badges={
                          <>
                            {getInternalPriorityBadge(ticket.priority)}
                            {getInternalStatusBadge(ticket.status)}
                            {!ticket.assigned_to && (
                              <span className="rounded border border-warning-line bg-warning-subtle px-1.5 py-0.5 text-2xs text-warning-strong">Unassigned</span>
                            )}
                            {ticket.forwarding && <ForwardedTag team={ticket.forwarding.team} />}
{isAwaitingTeamResponse(ticket) && <AwaitingTeamTag />}
                          </>
                        }
                        meta={[
                          { icon: <User />, label: ticket.created_by?.name ? `from ${ticket.created_by.name}` : null },
                          { icon: <Tag />, label: getInternalCategoryLabel(ticket.category) },
                          { icon: <Calendar />, label: formatISTDate(ticket.created_at) },
                        ]}
                        actions={
                          <IconButton bare label={`View ticket ${ticket.ticket_number}`} tooltip="View" type="button" onClick={() => openInternal(ticket)} className="tf-icon-btn-outline">
                            <Eye />
                          </IconButton>
                        }
                      />
                    ))}
                  </MobileRecordList>

                  {/* Desktop: table */}
                  <div className="hidden overflow-x-auto lg:block">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-white text-left tf-caption dark:bg-slate-900">
                          <th className="tf-th-cell rounded-l-lg tf-th">Ticket ID</th>
                          <th className="tf-th-cell tf-th">Subject</th>
                          <th className="tf-th-cell tf-th">Category</th>
                          <th className="tf-th-cell tf-th">Priority</th>
                          <th className="tf-th-cell tf-th">Created</th>
                          <th className="tf-th-cell tf-th">Status</th>
                          <th className="tf-th-cell rounded-r-lg text-right tf-th">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                        {internalTickets.slice(0, 5).map(ticket => (
                          <tr key={ticket.id} className="transition-colors hover:bg-gray-50/70 dark:hover:bg-slate-800/40">
                            <td className="tf-td whitespace-nowrap font-medium text-gray-900 dark:text-slate-100">{ticket.ticket_number}</td>
                            <td className="tf-td max-w-[240px]">
                              <div className="truncate text-gray-900 dark:text-slate-100" title={ticket.title}>{ticket.title}</div>
                              <div className="flex items-center gap-1.5 truncate tf-meta">
                                <span className="truncate">from {ticket.created_by?.name}</span>
                                {!ticket.assigned_to && (
                                  <span className="shrink-0 rounded border border-warning-line bg-warning-subtle px-1 py-px text-2xs font-medium text-warning-strong">Unassigned</span>
                                )}
                              </div>
                            </td>
                            <td className="tf-td whitespace-nowrap text-gray-600 dark:text-slate-400">{getInternalCategoryLabel(ticket.category)}</td>
                            <td className="tf-td">{getInternalPriorityBadge(ticket.priority)}</td>
                            <td className="tf-td whitespace-nowrap text-gray-600 dark:text-slate-400">{formatISTDate(ticket.created_at)}</td>
                            <td className="tf-td">
                              <div className="flex flex-col items-start gap-1">
                                {getInternalStatusBadge(ticket.status)}
                                {ticket.forwarding && <ForwardedTag team={ticket.forwarding.team} />}
{isAwaitingTeamResponse(ticket) && <AwaitingTeamTag />}
                              </div>
                            </td>
                            <td className="tf-td text-right">
                              <button
                                onClick={() => openInternal(ticket)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-brand-blue/30 px-3 py-1.5 text-xs font-semibold text-brand-blue transition-colors hover:bg-brand-blue/5"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                View
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
                );
              })()}
            </div>
          </div>
        )}

        {/* Team Tickets List */}
        {activeTab === 'team' && isAdmin && view === 'tickets' && (
          <div>
            <button
              onClick={() => { setInternalFilterAssignment('all'); setTeamCategoryFilter('all'); setView('overview'); }}
              className="mb-3 flex items-center gap-1.5 text-sm text-gray-600 hover:text-brand-blue dark:text-slate-400"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Overview
            </button>

            <div className="tf-panel">
              {/* Filters */}
              <div className="border-b border-gray-100 p-3 dark:border-slate-700/60 sm:p-4">
                <div className="flex flex-col gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-brand-blue/60" />
                    <Input
                      type="text"
                      value={teamSearchQuery}
                      onChange={(e) => setTeamSearchQuery(e.target.value)}
                      placeholder="Search by ticket, title, or user..."
                      className="w-full pl-9 pr-4"
                    />
                  </div>

                  <div className="tf-grid-stats-5">
                    <FilterSelect
                      value={teamFilterStatus}
                      onChange={(v) => setTeamFilterStatus(v)}
                      ariaLabel="Filter by status"
                      options={[
                        { value: 'all', label: 'All Status' },
                        { value: 'open', label: 'Open' },
                        { value: 'in-progress', label: 'In Progress' },
                        { value: 'resolved', label: 'Resolved' },
                        { value: 'closed', label: 'Closed' },
                      ]}
                      className="px-3 sm:px-3 py-2.5 sm:py-2.5 rounded-lg sm:rounded-lg"
                    />

                    <FilterSelect
                      value={internalFilterAssignment}
                      onChange={(v) => setInternalFilterAssignment(v)}
                      ariaLabel="Filter by assignment"
                      options={[
                        { value: 'all', label: 'All Tickets' },
                        { value: 'mine', label: 'Assigned to Me' },
                        { value: 'unassigned', label: 'Unassigned' },
                      ]}
                      className="px-3 sm:px-3 py-2.5 sm:py-2.5 rounded-lg sm:rounded-lg"
                    />

                    <FilterSelect
                      value={teamFilterPriority}
                      onChange={(v) => setTeamFilterPriority(v)}
                      ariaLabel="Filter by priority"
                      options={[
                        { value: 'all', label: 'All Priority' },
                        { value: 'low', label: 'Low' },
                        { value: 'medium', label: 'Medium' },
                        { value: 'high', label: 'High' },
                      ]}
                      className="px-3 sm:px-3 py-2.5 sm:py-2.5 rounded-lg sm:rounded-lg"
                    />

                    <FilterSelect
                      value={teamCategoryFilter}
                      onChange={(v) => setTeamCategoryFilter(v)}
                      ariaLabel="Filter by category"
                      options={[{ value: 'all', label: 'All Categories' }, ...internalCategories.map(c => ({ value: c.value, label: c.label }))]}
                      className="px-3 sm:px-3 py-2.5 sm:py-2.5 rounded-lg sm:rounded-lg"
                    />

                    <FilterSelect
                      value={teamSort}
                      onChange={(v) => setTeamSort(v as typeof teamSort)}
                      ariaLabel="Sort tickets"
                      options={[
                        { value: 'default', label: 'Sort: Default' },
                        { value: 'newest', label: 'Sort: Newest first' },
                        { value: 'updated', label: 'Sort: Last updated' },
                        { value: 'priority', label: 'Sort: Priority (high → low)' },
                      ]}
                      className="col-span-2 sm:col-span-1 px-3 sm:px-3 py-2.5 sm:py-2.5 rounded-lg sm:rounded-lg"
                    />
                  </div>

                  {/* Active filters — shared FilterChips, each removable, plus clear all
                      (kept: this card's only reset). */}
                  <FilterChips
                    chips={[
                      teamSearchQuery && { key: 'search', label: 'Search', value: teamSearchQuery, onRemove: () => setTeamSearchQuery('') },
                      teamFilterStatus !== 'all' && { key: 'status', label: 'Status', value: teamFilterStatus.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), onRemove: () => setTeamFilterStatus('all') },
                      internalFilterAssignment !== 'all' && { key: 'assignment', label: 'Assignment', value: internalFilterAssignment === 'mine' ? 'Assigned to me' : 'Unassigned', onRemove: () => setInternalFilterAssignment('all') },
                      teamFilterPriority !== 'all' && { key: 'priority', label: 'Priority', value: teamFilterPriority.charAt(0).toUpperCase() + teamFilterPriority.slice(1), onRemove: () => setTeamFilterPriority('all') },
                      teamCategoryFilter !== 'all' && { key: 'category', label: 'Category', value: getInternalCategoryLabel(teamCategoryFilter), onRemove: () => setTeamCategoryFilter('all') },
                    ].filter(Boolean) as FilterChip[]}
                    onClearAll={() => { setTeamSearchQuery(''); setTeamFilterStatus('all'); setTeamFilterPriority('all'); setInternalFilterAssignment('all'); setTeamCategoryFilter('all'); }}
                  />
                </div>
              </div>

              {/* Tickets */}
              {internalLoading ? (
                <div className="space-y-2 p-3 sm:p-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 rounded-lg border border-gray-100 px-4 py-3 dark:border-slate-700/60">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-4 flex-1" />
                      <Skeleton className="hidden h-6 w-6 rounded-full lg:block" />
                      <Skeleton className="hidden h-5 w-16 rounded-md lg:block" />
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {/* Mobile Card Layout */}
                  <MobileRecordList className="p-3">
                    {paginatedInternalTickets.map(ticket => {
                      const CategoryIcon = getInternalCategoryIcon(ticket.category);
                      const openTicket = () => {
                        setSelectedInternalTicket(ticket);
                        fetchInternalTicketDetail(ticket.id);
                        setView('detail');
                      };
                      return (
                        <MobileRecordCard
                          key={ticket.id}
                          className="tf-jdv-actions-inline"
                          onClick={openTicket}
                          idBadge={<span className="inline-block max-w-full truncate tf-id-chip">{ticket.ticket_number}</span>}
                          title={ticket.title}
                          badges={
                            <>
                              {getInternalPriorityBadge(ticket.priority)}
                              {getInternalStatusBadge(ticket.status)}
                              {!ticket.assigned_to && (
                                <span className="rounded border border-warning-line bg-warning-subtle px-1.5 py-0.5 text-2xs text-warning-strong">Unassigned</span>
                              )}
                              {ticket.forwarding && <ForwardedTag team={ticket.forwarding.team} />}
{isAwaitingTeamResponse(ticket) && <AwaitingTeamTag />}
                            </>
                          }
                          meta={[
                            { icon: <User />, label: ticket.created_by?.name ? `from ${ticket.created_by.name}` : null },
                            { icon: <CategoryIcon />, label: getInternalCategoryLabel(ticket.category) },
                            { icon: <Clock />, label: <span title={formatIST(ticket.updated_at)}>{timeAgo(ticket.updated_at)}</span> },
                            { icon: <UserCheck />, label: ticket.assigned_to ? ticket.assigned_to.name : null },
                          ]}
                          actions={
                            <IconButton bare label={`View ticket ${ticket.ticket_number}`} tooltip="View" type="button" onClick={openTicket} className="tf-icon-btn-outline">
                              <Eye />
                            </IconButton>
                          }
                        />
                      );
                    })}
                  </MobileRecordList>

                  {/* Desktop Table — left out when empty, as above. */}
                  <div className={`hidden overflow-x-auto tf-table-shell ${filteredInternalTickets.length > 0 ? 'lg:block' : ''}`}>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-white text-left tf-caption dark:bg-slate-900">
                          <th className="tf-th-cell tf-th">Ticket #</th>
                          <th className="tf-th-cell tf-th">Subject</th>
                          <th className="tf-th-cell tf-th">From</th>
                          <th className="tf-th-cell tf-th">Category</th>
                          <th className="tf-th-cell tf-th">Priority</th>
                          <th className="tf-th-cell tf-th">Status</th>
                          <th className="tf-th-cell tf-th">Assigned</th>
                          <th className="tf-th-cell tf-th">Updated</th>
                          <th className="tf-th-cell text-right tf-sticky-col tf-th">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                        {paginatedInternalTickets.map(ticket => {
                          const CategoryIcon = getInternalCategoryIcon(ticket.category);
                          const canAssign = !ticket.assigned_to && ticket.status !== 'closed';
                          return (
                            <tr key={ticket.id} className="transition-colors hover:bg-gray-50/70 dark:hover:bg-slate-800/40">
                              <td className="tf-td whitespace-nowrap font-medium text-gray-900 dark:text-slate-100">{ticket.ticket_number}</td>
                              <td className="tf-td max-w-[260px]">
                                <div className="truncate text-gray-900 dark:text-slate-100" title={ticket.title}>{ticket.title}</div>
                                {ticket.forwarding && <div className="mt-1"><ForwardedTag team={ticket.forwarding.team} /></div>}
{isAwaitingTeamResponse(ticket) && <div className="mt-1"><AwaitingTeamTag /></div>}
                              </td>
                              <td className="tf-td">
                                <div className="flex min-w-0 items-center gap-2">
                                  <NameAvatar name={ticket.created_by?.name} fallback={ticket.created_by?.email} size="xs" />
                                  <span className="truncate text-gray-700 dark:text-slate-300">{ticket.created_by?.name}</span>
                                </div>
                              </td>
                              <td className="tf-td">
                                <div className="flex min-w-0 items-center gap-2 text-gray-600 dark:text-slate-400">
                                  <CategoryIcon className="h-4 w-4 flex-shrink-0" />
                                  <span className="truncate">{getInternalCategoryLabel(ticket.category)}</span>
                                </div>
                              </td>
                              <td className="tf-td">{getInternalPriorityBadge(ticket.priority)}</td>
                              <td className="tf-td">{getInternalStatusBadge(ticket.status)}</td>
                              <td className="tf-td">
                                {ticket.assigned_to ? (
                                  <div className="flex min-w-0 items-center gap-2">
                                    <NameAvatar name={ticket.assigned_to.name} size="xs" />
                                    <span className="truncate text-gray-700 dark:text-slate-300">{ticket.assigned_to.name}</span>
                                  </div>
                                ) : (
                                  <span className="rounded border border-warning-line bg-warning-subtle px-2 py-0.5 text-xs text-warning-strong">Unassigned</span>
                                )}
                              </td>
                              <td className="tf-td whitespace-nowrap">
                                <div className="text-gray-700 dark:text-slate-300">{formatISTDate(ticket.updated_at)}</div>
                                <div className="tf-hint">{timeAgo(ticket.updated_at)}</div>
                              </td>
                              <td className="tf-td tf-sticky-col">
                                <div className="flex items-center justify-end gap-1.5">
                                  {canAssign && (
                                    <button
                                      onClick={() => handleAssignInternalTicket(ticket.id)}
                                      disabled={internalActionLoading === ticket.id}
                                      title="Assign this ticket to me"
                                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
                                    >
                                      {internalActionLoading === ticket.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
                                      Assign to me
                                    </button>
                                  )}
                                  <button
                                    onClick={() => {
                                      setSelectedInternalTicket(ticket);
                                      fetchInternalTicketDetail(ticket.id);
                                      setView('detail');
                                    }}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-brand-blue/30 px-3 py-1.5 text-xs font-semibold text-brand-blue transition-colors hover:bg-brand-blue/5"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                    View
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {internalTicketsError ? (
                    <ListLoadError message={internalTicketsError} onRetry={fetchInternalTickets} />
                  ) : filteredInternalTickets.length === 0 && (
                    <div className="p-4">
                      {internalFilterAssignment === 'unassigned' && teamFilterStatus === 'all' && !teamSearchQuery && teamCategoryFilter === 'all'
                        ? <NoUnassignedState />
                        : internalFilterAssignment === 'mine' && teamFilterStatus === 'all' && !teamSearchQuery && teamCategoryFilter === 'all'
                          ? <NothingAssignedState />
                          : <NoTicketsFoundState title="No tickets match these filters" />}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Pagination — Team Support Tickets */}
            {!internalLoading && teamTotal > 0 && (
              <ListPagination
                currentPage={teamCurrentPage}
                itemsPerPage={teamItemsPerPage}
                totalItems={teamTotal}
                onPageChange={setTeamCurrentPage}
                onItemsPerPageChange={setTeamItemsPerPage}
                itemLabel="tickets"
              />
            )}
          </div>
        )}

        {/* Team Ticket Detail View */}
        {activeTab === 'team' && isAdmin && view === 'detail' && selectedInternalTicket && (() => {
          const t = selectedInternalTicket;
          const listIndex = sortedInternalTickets.findIndex(x => x.id === t.id);
          const prevInternal = listIndex > 0 ? sortedInternalTickets[listIndex - 1] : null;
          const nextInternal = listIndex >= 0 && listIndex < sortedInternalTickets.length - 1 ? sortedInternalTickets[listIndex + 1] : null;
          const openInternal = (x: InternalTicket) => {
            setSelectedInternalTicket(x);
            fetchInternalTicketDetail(x.id);
          };
          const responses = t.responses || [];
          const descriptionText = (t.description || '').trim();
          const descriptionAlreadyInReplies = responses[0]?.user_role === 'user' && responses[0].message.trim() === descriptionText;
          const thread: InternalTicket['responses'] = descriptionText && !descriptionAlreadyInReplies
            ? [{ id: `${t.id}-description`, user_id: t.created_by?.id || '', user_name: t.created_by?.name, user_role: 'user', message: t.description, created_at: t.created_at }, ...responses]
            : responses;
          const detailTab = detailTabState.id === t.id && detailTabState.tab !== 'conversation' ? detailTabState.tab : 'conversation';
          const teamFiles = t.attachments || [];
          const statusLabel = t.status.charAt(0).toUpperCase() + t.status.slice(1).replace('-', ' ');
          const priorityLabel = internalPriorities.find(p => p.value === t.priority)?.label || t.priority;
          const busy = internalActionLoading === t.id;
          const nameOf = (r: InternalTicket['responses'][number]) => r.user_name || (r.user_role === 'admin' ? 'Admin' : 'User');

          const copyId = () => {
            navigator.clipboard?.writeText(t.ticket_number)
              .then(() => toast.success('Ticket ID copied'))
              .catch((err) => showErrorToast(err, "Couldn't copy the ticket ID"));
          };
          const downloadInternalTranscript = () => {
            const lines = [
              `Ticket ${t.ticket_number}: ${t.title}`,
              `Status: ${statusLabel}`,
              `Priority: ${priorityLabel}`,
              `Category: ${getInternalCategoryLabel(t.category)}`,
              `Submitted by: ${t.created_by?.name || '-'}${t.created_by?.email ? ` (${t.created_by.email})` : ''}`,
              `Assigned to: ${t.assigned_to?.name || 'Not assigned'}`,
              `Created: ${formatIST(t.created_at)}`,
              `Last updated: ${formatIST(t.updated_at)}`,
              '',
              'Conversation:',
              ...(thread.length ? thread.flatMap(r => [`[${formatIST(r.created_at)}] ${nameOf(r)}${r.user_role === 'admin' ? ' (Admin)' : ''}:`, r.message, '']) : ['No messages yet.']),
            ];
            const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${t.ticket_number}-transcript.txt`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
          };

          const activity = [
            { time: t.created_at, icon: Ticket, title: `Ticket created by ${t.created_by?.name || 'a team member'}`, detail: `${getInternalCategoryLabel(t.category)} · ${priorityLabel} priority` },
            ...responses.map(r => ({
              time: r.created_at,
              icon: MessageSquare,
              title: `${nameOf(r)}${r.user_role === 'admin' ? ' (Admin)' : ''} replied`,
              detail: r.message.length > 120 ? `${r.message.slice(0, 120)}…` : r.message,
            })),
            ...(t.assigned_to ? [{ time: '', icon: UserCheck, title: `Assigned to ${t.assigned_to.name}`, detail: '' }] : []),
            ...(t.forwarding ? [{
              time: t.forwarding.forwarded_at || '',
              icon: Forward,
              title: `Forwarded to ${forwardTeamLabel(t.forwarding.team)}${t.forwarding.forwarded_by?.name ? ` by ${t.forwarding.forwarded_by.name}` : ''}`,
              detail: t.forwarding.support_ticket_number ? `Support ticket ${t.forwarding.support_ticket_number}` : '',
            }] : []),
            { time: t.updated_at, icon: Clock, title: `Current status: ${statusLabel}`, detail: 'As of last update' },
          ];

          const adminTemplates: { group: string; items: { label: string; text: string }[] }[] = [
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
          ];

          const cardCls = 'tf-panel';
          const toolBtn = 'flex h-8 w-8 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100';
          const actionBtn = 'flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60';
          const infoRow = (Icon: typeof Ticket, label: string, value: React.ReactNode) => (
            <div className="flex items-center gap-3 py-2">
              <Icon className="h-4 w-4 shrink-0 text-gray-500 dark:text-slate-500" />
              <span className="w-24 shrink-0 tf-body-muted">{label}</span>
              <div className="min-w-0 flex-1 tf-row-name">{value}</div>
            </div>
          );

          return (
          <div>
            {/* Back + previous / next */}
            <div className="mb-3 flex items-center justify-between gap-2">
              <button
                onClick={() => setView('tickets')}
                className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-brand-blue dark:text-slate-400"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Tickets
              </button>
              {sortedInternalTickets.length > 1 && listIndex >= 0 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => prevInternal && openInternal(prevInternal)}
                    disabled={!prevInternal}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => nextInternal && openInternal(nextInternal)}
                    disabled={!nextInternal}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Next
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            <div className="tf-grid-3">
              {/* Main Content */}
              <div className={`${cardCls} p-4 sm:p-5 lg:col-span-2`}>
                {/* Ticket Header */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 tf-meta">
                      <span>{t.ticket_number}</span>
                      <IconButton bare label="Copy ticket ID" type="button" onClick={copyId} className="rounded p-0.5 hover:bg-gray-100 hover:text-brand-blue dark:hover:bg-slate-800">
                        <Copy className="h-3.5 w-3.5" />
                      </IconButton>
                    </div>
                    <h2 className="mt-1 break-words text-xl font-bold tracking-tight text-gray-900 dark:text-slate-50 sm:text-2xl">{t.title}</h2>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      {getInternalStatusBadge(t.status)}
                      {getInternalPriorityBadge(t.priority)}
                      <span className="rounded-md bg-gray-100 px-2 py-0.5 tf-caption dark:bg-slate-800">
                        {getInternalCategoryLabel(t.category)}
                      </span>
                      {!t.assigned_to && t.status !== 'closed' && (
                        <span className="rounded border border-warning-line bg-warning-subtle px-2 py-0.5 text-xs text-warning-strong">Unassigned</span>
                      )}
                      {t.forwarding && <ForwardedTag team={t.forwarding.team} />}
                      {isAwaitingTeamResponse(t) && <AwaitingTeamTag />}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5 tf-meta sm:text-sm">
                      <User className="h-4 w-4 shrink-0 text-brand-blue" />
                      <span>Submitted by <strong className="text-gray-900 dark:text-slate-100">{t.created_by?.name}</strong></span>
                      {t.created_by?.email && (
                        <span className="truncate tf-meta">({t.created_by.email})</span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-row gap-4 sm:flex-col sm:gap-2 sm:border-l sm:border-gray-200 sm:pl-5 dark:sm:border-slate-700">
                    <div className="flex items-start gap-2">
                      <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-gray-500 dark:text-slate-500" />
                      <div>
                        <div className="tf-meta">Created</div>
                        <div className="tf-caption">{formatIST(t.created_at)}</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gray-500 dark:text-slate-500" />
                      <div>
                        <div className="tf-meta">Last Updated</div>
                        <div className="tf-caption">{formatIST(t.updated_at)}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {t.forwarding && (
                  <div className="mt-4 flex flex-col gap-2 rounded-lg border border-brand-blue/20 bg-brand-blue/[0.05] p-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <Forward className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" />
                      <div className="min-w-0 tf-body">
                        <p>
                          Forwarded to <strong>{forwardTeamLabel(t.forwarding.team)}</strong>
                          {t.forwarding.support_ticket_number && <> as <strong>{t.forwarding.support_ticket_number}</strong></>}
                          {t.forwarding.forwarded_by?.name && <> by {t.forwarding.forwarded_by.name}</>}
                          {t.forwarding.forwarded_at && <> · {formatIST(t.forwarding.forwarded_at)}</>}
                        </p>
                        {t.forwarding.note && <p className="mt-1 break-words tf-meta">Note: {t.forwarding.note}</p>}
                        <p className="mt-1 tf-meta">Status and platform-support replies are kept in sync with this ticket.</p>
                      </div>
                    </div>
                    {t.forwarding.support_ticket_id && (
                      <button
                        type="button"
                        onClick={() => openForwardedSupportTicket(t.forwarding!.support_ticket_id!)}
                        className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand-blue hover:underline"
                      >
                        View in My Support Tickets
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}

                {/* Conversation / Activity Log tabs */}
                <div className="mt-5 flex gap-1 border-b border-gray-200 dark:border-slate-700">
                  {[
                    { id: 'conversation' as const, label: 'Conversation', icon: MessageSquare },
                    { id: 'activity' as const, label: 'Activity Log', icon: History },
                    { id: 'attachments' as const, label: `Attachments (${teamFiles.length})`, icon: Paperclip },
                  ].map(tab => {
                    const TabIcon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setDetailTabState({ id: t.id, tab: tab.id })}
                        className={`tf-tab-line -mb-px ${
                          detailTab === tab.id
                            ? 'tf-tab-line-active'
                            : ''
                        }`}
                      >
                        <TabIcon className="h-4 w-4" />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {detailTab === 'conversation' ? (
                  <>
                    <div className="mt-4 space-y-3">
                      {thread.length === 0 && (
                        <p className="py-6 text-center tf-body-muted">No messages yet.</p>
                      )}
                      {thread.map((response) => {
                        const fromAdmin = response.user_role === 'admin';
                        // Messages the signed-in admin sent sit on the right; everyone else on the left.
                        const mine = !!authUser?.id && response.user_id === authUser.id;
                        return (
                          <div
                            key={response.id}
                            className={`w-fit min-w-[240px] max-w-[90%] rounded-xl border p-3 sm:max-w-[75%] sm:p-4 ${
                              mine ? 'ml-auto rounded-tr-sm' : 'mr-auto rounded-tl-sm'
                            } ${
                              fromAdmin
                                ? 'border-gray-200 bg-gray-50 dark:border-slate-700/60 dark:bg-slate-800/50'
                                : 'border-brand-blue/15 bg-brand-blue/[0.06] dark:bg-brand-blue/10'
                            }`}
                          >
                            <div className={`flex items-start gap-3 ${mine ? 'flex-row-reverse' : ''}`}>
                              <NameAvatar name={nameOf(response)} size="sm" />
                              <div className="min-w-0 flex-1">
                                <div className="mb-1 flex items-center justify-between gap-2">
                                  <div className="flex min-w-0 items-center gap-2">
                                    <span className="truncate tf-row-title">{nameOf(response)}</span>
                                    {fromAdmin ? (
                                      <span className="tf-badge bg-gray-200 tf-micro-hint dark:bg-slate-700">Admin</span>
                                    ) : (
                                      <span className="tf-badge bg-brand-blue/10 text-2xs text-brand-blue">Requester</span>
                                    )}
                                  </div>
                                  <span className="shrink-0 whitespace-nowrap tf-meta">{formatIST(response.created_at)}</span>
                                </div>
                                <div className="space-y-1 tf-body leading-relaxed">{renderFormattedMessage(response.message)}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Reply Box */}
                    {t.status !== 'closed' && (
                      <div className="mt-4 border-t border-gray-100 pt-4 dark:border-slate-700/60">
                        <div className="mb-1.5 flex items-center justify-between">
                          <Label className="text-sm font-semibold">Reply to User</Label>
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => { setTemplateMenuOpen(o => !o); setEmojiMenuOpen(false); }}
                              aria-expanded={templateMenuOpen}
                              className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-blue hover:underline sm:text-sm"
                            >
                              <FileText className="h-4 w-4" />
                              Use Template
                            </button>
                            {templateMenuOpen && (
                              <>
                                <button type="button" aria-hidden="true" tabIndex={-1} className="fixed inset-0 z-10 cursor-default" onClick={() => setTemplateMenuOpen(false)} />
                                <div className="absolute right-0 z-20 mt-1 max-h-80 w-64 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                                  {adminTemplates.map(group => (
                                    <div key={group.group} className="py-1">
                                      <p className="px-3 pb-1 pt-1.5 text-2xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-500">{group.group}</p>
                                      {group.items.map(tpl => (
                                        <button
                                          key={tpl.label}
                                          type="button"
                                          title={tpl.text}
                                          onClick={() => {
                                            setReplyMessage(prev => (prev.trim() ? `${prev.trimEnd()}\n\n${tpl.text}` : tpl.text));
                                            lastReplySel.current = null;
                                            setTemplateMenuOpen(false);
                                            requestAnimationFrame(() => replyRef.current?.focus());
                                          }}
                                          className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 hover:text-brand-blue dark:text-slate-300 dark:hover:bg-slate-800"
                                        >
                                          {tpl.label}
                                        </button>
                                      ))}
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                        <Textarea
                          ref={replyRef}
                          value={replyMessage}
                          onChange={(e) => setReplyMessage(e.target.value)}
                          onSelect={(e) => { lastReplySel.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd }; }}
                          placeholder="Type your response..."
                          rows={4}
                        />
                        <div className="mt-2">
                          <TeamAttachmentPicker
                            compact
                            files={teamReplyFiles}
                            onChange={setTeamReplyFiles}
                            onTicket={teamFiles.length}
                            disabled={replySending}
                          />
                        </div>
                        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          {/* Toolbar */}
                          <div className="flex flex-wrap items-center gap-0.5">
                            <IconButton bare label="Bold" type="button" onClick={() => wrapSelection('**', '**', 'bold text')} className={toolBtn}><Bold className="h-4 w-4" /></IconButton>
                            <IconButton bare label="Italic" type="button" onClick={() => wrapSelection('_', '_', 'italic text')} className={toolBtn}><Italic className="h-4 w-4" /></IconButton>
                            <IconButton bare label="Bulleted list" type="button" onClick={() => prefixLines(() => '- ')} className={toolBtn}><List className="h-4 w-4" /></IconButton>
                            <IconButton bare label="Numbered list" type="button" onClick={() => prefixLines(i => `${i + 1}. `)} className={toolBtn}><ListOrdered className="h-4 w-4" /></IconButton>
                            <IconButton bare label="Insert link" type="button" onClick={() => wrapSelection('[', '](https://)', 'link text')} className={toolBtn}><Link2 className="h-4 w-4" /></IconButton>
                            <div className="relative">
                              <IconButton bare label="Insert emoji" type="button" onClick={() => { setEmojiMenuOpen(o => !o); setTemplateMenuOpen(false); }} aria-expanded={emojiMenuOpen} className={toolBtn}><Smile className="h-4 w-4" /></IconButton>
                              {emojiMenuOpen && (
                                <>
                                  <button type="button" aria-hidden="true" tabIndex={-1} className="fixed inset-0 z-10 cursor-default" onClick={() => setEmojiMenuOpen(false)} />
                                  <div className="absolute bottom-full left-0 z-20 mb-1 max-h-64 w-[17.5rem] overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                                    {EMOJI_GROUPS.map(group => (
                                      <div key={group.group} className="mb-1.5 last:mb-0">
                                        <p className="px-1 pb-1 text-2xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-500">{group.group}</p>
                                        <div className="grid grid-cols-8 gap-0.5">
                                          {group.items.map(em => (
                                            <button
                                              key={em}
                                              type="button"
                                              aria-label={`Insert ${em}`}
                                              data-emoji={em}
                                              onClick={handleEmojiPick}
                                              style={{ fontFamily: EMOJI_FONT_STACK }}
                                              className="flex h-8 w-8 items-center justify-center rounded-md text-xl leading-none hover:bg-gray-100 dark:hover:bg-slate-800"
                                            >
                                              {em}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="primary"
                            onClick={handleSendInternalReply}
                            disabled={replySending || (!replyMessage.trim() && teamReplyFiles.length === 0)}
                            icon={replySending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            className="w-full sm:w-auto"
                          >
                            {replySending ? 'Sending…' : 'Send Reply'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                ) : detailTab === 'attachments' ? (
                  <div className="mt-4">
                    {t.forwarding && teamFiles.length > 0 && (
                      <p className="mb-3 tf-meta">These files were also sent with the forwarded ticket {t.forwarding.support_ticket_number}.</p>
                    )}
                    <TeamAttachmentList files={teamFiles} onDownload={(file) => downloadInternalAttachment(t.id, file)} />
                  </div>
                ) : (
                  <ol className="relative mt-4 space-y-4 border-l border-gray-200 pl-5 dark:border-slate-700">
                    {activity.map((item, idx) => {
                      const ItemIcon = item.icon;
                      return (
                        <li key={idx} className="relative">
                          <span className="absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full bg-white text-brand-blue ring-1 ring-gray-200 dark:bg-slate-900 dark:ring-slate-700">
                            <ItemIcon className="h-3.5 w-3.5" />
                          </span>
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                            <p className="tf-row-title">{item.title}</p>
                            {item.time && <span className="tf-meta">{formatIST(item.time)}</span>}
                          </div>
                          {item.detail && <p className="mt-0.5 break-words tf-meta">{item.detail}</p>}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>

              {/* Sidebar */}
              <div className="space-y-4">
                {/* Ticket Info */}
                <div className={`${cardCls} p-4`}>
                  <h4 className="mb-1 flex items-center gap-2 tf-row-title">
                    <Ticket className="h-4 w-4 text-brand-blue" />
                    Ticket Information
                  </h4>
                  <div className="divide-y divide-gray-100 dark:divide-slate-700/60">
                    {infoRow(Tag, 'Ticket ID', (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="truncate">{t.ticket_number}</span>
                        <IconButton bare label="Copy ticket ID" type="button" onClick={copyId} className="rounded p-0.5 text-gray-500 hover:bg-gray-100 hover:text-brand-blue dark:hover:bg-slate-800">
                          <Copy className="h-3.5 w-3.5" />
                        </IconButton>
                      </span>
                    ))}
                    {infoRow(Circle, 'Status', getInternalStatusBadge(t.status))}
                    {infoRow(Inbox, 'Category', getInternalCategoryLabel(t.category))}
                    {infoRow(User, 'Requester', t.created_by?.name || '-')}
                    {infoRow(UserCheck, 'Assigned To', t.assigned_to ? (
                      <span className="flex min-w-0 items-center gap-2">
                        <NameAvatar name={t.assigned_to.name} size="xs" />
                        <span className="truncate">{t.assigned_to.name}</span>
                      </span>
                    ) : (
                      <span className="text-warning-strong">Not assigned</span>
                    ))}
                    {t.forwarding && infoRow(Forward, 'Forwarded To', (
                      <span className="truncate" title={t.forwarding.support_ticket_number || undefined}>
                        {forwardTeamLabel(t.forwarding.team)}
                      </span>
                    ))}
                    {infoRow(Calendar, 'Created', formatIST(t.created_at))}
                    {infoRow(Clock, 'Last Updated', formatIST(t.updated_at))}
                    {infoRow(MessageSquare, 'Responses', `${responses.length} message${responses.length === 1 ? '' : 's'}`)}
                  </div>
                </div>

                {/* Update Priority — saves on change, as before */}
                {t.status !== 'closed' && (
                  <div className={`${cardCls} p-4`}>
                    <h4 className="mb-3 flex items-center gap-2 tf-row-title">
                      <Flag className="h-4 w-4 text-brand-blue" />
                      Update Priority
                    </h4>
                    <FilterSelect
                      value={t.priority}
                      onChange={(v) => handleUpdateInternalPriority(t.id, v as InternalTicketPriority)}
                      options={internalPriorities.map(p => ({ value: p.value, label: p.label }))}
                      className="w-full sm:w-full px-3 sm:px-3 py-2.5 sm:py-2.5 rounded-lg sm:rounded-lg"
                    />
                  </div>
                )}

                {/* Actions — same actions and conditions as before */}
                <div className={`${cardCls} p-4`}>
                  <h4 className="mb-3 flex items-center gap-2 tf-row-title">
                    <Settings2 className="h-4 w-4 text-brand-blue" />
                    Actions
                  </h4>
                  <div className="space-y-2">
                    {!t.assigned_to && t.status !== 'closed' && (
                      <button
                        onClick={() => handleAssignInternalTicket(t.id)}
                        disabled={busy}
                        className={`${actionBtn} bg-brand-blue text-white shadow-sm shadow-brand-blue/25 hover:bg-brand-blue-2`}
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4 flex-shrink-0" />}
                        Assign to Me
                      </button>
                    )}

                    {/* Forwarded: platform support (admin) owns it now, so offer to move there instead of resolving here. */}
                    {t.forwarding && (t.status === 'open' || t.status === 'in-progress') && (
                      <button
                        onClick={() => t.forwarding?.support_ticket_id
                          ? openForwardedSupportTicket(t.forwarding.support_ticket_id)
                          : toast.info('The forwarded ticket is still syncing — try again in a moment.')}
                        disabled={busy}
                        className={`${actionBtn} bg-brand-blue text-white shadow-sm shadow-brand-blue/25 hover:bg-brand-blue-2`}
                      >
                        <Forward className="h-4 w-4 flex-shrink-0" />
                        Move to Admin
                      </button>
                    )}

                    {!t.forwarding && (t.status === 'open' || t.status === 'in-progress') && (
                      <button
                        onClick={() => handleResolveInternalTicket(t.id)}
                        disabled={busy}
                        className={`${actionBtn} ${t.assigned_to ? 'bg-success text-white hover:opacity-90' : 'border border-success-line bg-success-subtle text-success-strong hover:opacity-90'}`}
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4 flex-shrink-0" />}
                        Mark as Resolved
                      </button>
                    )}

                    {/* Can't resolve it here — hand it to platform support (once). */}
                    {!t.forwarding && (t.status === 'open' || t.status === 'in-progress') && (
                      <button
                        onClick={() => setForwardTicket(t)}
                        disabled={busy}
                        className={`${actionBtn} border border-brand-blue/30 bg-brand-blue/[0.06] text-brand-blue hover:bg-brand-blue/10`}
                      >
                        <Forward className="h-4 w-4 flex-shrink-0" />
                        Forward Ticket
                      </button>
                    )}

                    {(t.status === 'resolved' || t.status === 'closed') && (
                      <button
                        onClick={() => handleReopenInternalTicket(t.id)}
                        disabled={busy}
                        className={`${actionBtn} border border-gray-200 bg-gray-50 text-gray-800 hover:bg-gray-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700`}
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 flex-shrink-0" />}
                        Reopen Ticket
                      </button>
                    )}

                    <div className="tf-grid-2">
                      <button
                        onClick={downloadInternalTranscript}
                        className={`${actionBtn} border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700`}
                      >
                        <Download className="h-4 w-4 flex-shrink-0" />
                        Transcript
                      </button>
                      {t.status !== 'closed' && (
                        <button
                          onClick={() => handleCloseInternalTicket(t.id)}
                          disabled={busy}
                          className={`${actionBtn} border border-destructive-line bg-destructive-subtle text-destructive hover:opacity-90`}
                        >
                          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4 flex-shrink-0" />}
                          Close Ticket
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          );
        })()}
      </div>
      </div>
      </div>
      <ForwardTicketDialog
        ticket={forwardTicket}
        open={!!forwardTicket}
        onClose={() => setForwardTicket(null)}
        onForwarded={handleInternalTicketForwarded}
      />
    </div>
  );
}

// Helper icon component
function Lightbulb({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </svg>
  );
}

function Briefcase({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}
