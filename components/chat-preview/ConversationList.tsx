'use client';

/* Chat test page — the middle panel: search, the conversation list, unread,
   and the loading / error / empty states. TEST ONLY. */

import type { ReactNode } from 'react';
import { BellOff, Plus, RefreshCw, Search, WifiOff, X, MessageSquareText, UserRound, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { VersionPill } from '@/components/assessments/AllAssessmentsTable';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { Conversation, Person } from './types';
import { ApplicationStatusBadge, Avatar, ChannelTile, PrivateMark, listTime } from './ui';
import { jobById, lastMessageOf, otherOf, personById, titleOf } from './useChatPreview';

export default function ConversationList({
  title, conversations, me, activeId, onOpen, query, onQuery, nav, state, onRetry,
  canNewEmployee, canNewCandidate, onNewEmployee, onNewCandidate,
}: {
  title: string;
  conversations: Conversation[];
  me: Person;
  activeId: string | null;
  onOpen: (id: string) => void;
  query: string;
  onQuery: (q: string) => void;
  /** The section tabs (tablet width), shown above the search. */
  nav?: ReactNode;
  state: 'ready' | 'loading' | 'error';
  onRetry: () => void;
  canNewEmployee: boolean;
  canNewCandidate: boolean;
  onNewEmployee: () => void;
  onNewCandidate: () => void;
}) {
  const unreadTotal = conversations.reduce((n, c) => n + (c.mutedBy?.includes(me.id) ? 0 : c.unreadFor?.[me.id] ?? 0), 0);

  const row = (c: Conversation) => {
    const active = c.id === activeId;
    const unread = c.unreadFor?.[me.id] ?? 0;
    const muted = !!c.mutedBy?.includes(me.id);
    const last = lastMessageOf(c);
    const job = jobById(c.jobId);
    const typing = (c.typingIds ?? []).filter(id => id !== me.id);
    const other = c.kind !== 'channel' ? otherOf(c, me.id) : null;
    const preview = typing.length
      ? <span className="italic text-brand-blue">{personById(typing[0]).name.split(' ')[0]} is typing…</span>
      : !last ? <span className="italic">No messages yet</span>
        : last.authorId === 'system' ? <span className="italic">{last.text}</span>
          : <>{last.authorId === me.id ? 'You: ' : c.kind === 'channel' ? `${personById(last.authorId).name.split(' ')[0]}: ` : ''}{last.deleted ? 'Message deleted' : last.text || (last.attachments?.length ? `📎 ${last.attachments[0].name}` : '')}</>;
    return (
      <li key={c.id}>
        <button type="button" onClick={() => onOpen(c.id)} aria-current={active ? 'true' : undefined}
          className={`relative flex w-full items-start gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors ${active ? 'bg-brand-blue/[0.08]' : 'hover:bg-gray-50 dark:hover:bg-slate-800/60'}`}>
          {active && <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-brand-blue" />}
          {c.kind === 'channel' ? <ChannelTile archived={c.archived} active={active} /> : <Avatar person={other!} />}
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className={`truncate text-sm ${unread && !muted ? 'font-semibold text-gray-900 dark:text-slate-50' : 'font-medium text-gray-800 dark:text-slate-200'}`}>{titleOf(c, me.id)}</span>
              {c.kind === 'channel' && <PrivateMark />}
              {muted && <BellOff className="h-3 w-3 shrink-0 text-gray-400" aria-label="Muted" />}
              <span className="ml-auto shrink-0 text-[11px] tabular-nums text-gray-500">{last ? listTime(last.at) : ''}</span>
            </span>
            {/* Job context: channel → JD + version; candidate → job + status. */}
            {c.kind === 'channel' && job && (
              <span className="mt-1 flex items-center gap-1.5"><JobIdBadge>{job.code}</JobIdBadge><VersionPill kind="job" version={job.version} /></span>
            )}
            {c.kind === 'candidate' && job && (
              <span className="mt-1 flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[11px] text-gray-600">{job.code} · {job.title}</span>
                {c.applicationStatus && <ApplicationStatusBadge status={c.applicationStatus} />}
              </span>
            )}
            {c.kind === 'direct' && other && <span className="mt-0.5 block truncate text-[11px] text-gray-500">{other.title}</span>}
            <span className="mt-1 flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-xs text-gray-500 dark:text-slate-400">{preview}</span>
              {unread > 0 && (
                <span className={`min-w-5 shrink-0 rounded-full px-1.5 text-center text-[11px] font-semibold leading-5 ${muted ? 'bg-gray-200 text-gray-600' : 'bg-brand-blue text-white'}`}>{unread}</span>
              )}
            </span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-slate-900">
      <div className="space-y-2.5 border-b border-gray-100 p-3 dark:border-slate-700/60">
        <div className="flex items-center gap-2">
          <h2 className="truncate text-base font-semibold text-gray-900 dark:text-slate-50">{title}</h2>
          {unreadTotal > 0 && <span className="rounded-full bg-brand-blue px-1.5 text-[11px] font-semibold leading-5 text-white">{unreadTotal}</span>}
          {(canNewEmployee || canNewCandidate) && (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="primary" className="ml-auto h-8 px-2.5 text-xs" icon={<Plus className="h-3.5 w-3.5" />}>New</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                {canNewEmployee && (
                  <DropdownMenuItem onSelect={onNewEmployee}>
                    <MessageSquareText className="h-4 w-4 text-brand-blue" />
                    <span className="flex flex-col"><span className="text-sm">Message an employee</span><span className="text-xs text-gray-500">Private chat with a teammate</span></span>
                  </DropdownMenuItem>
                )}
                {canNewCandidate && (
                  <DropdownMenuItem onSelect={onNewCandidate}>
                    <UserRound className="h-4 w-4 text-brand-cyan" />
                    <span className="flex flex-col"><span className="text-sm">Message a candidate</span><span className="text-xs text-gray-500">One chat per job application</span></span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {nav}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input aria-label="Search conversations" value={query} onChange={e => onQuery(e.target.value)} placeholder="Search name, job or message"
            className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-8 text-sm placeholder:text-gray-500 hover:bg-white focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30 dark:border-slate-700 dark:bg-slate-800" />
          {query && <button type="button" onClick={() => onQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-700"><X className="h-3.5 w-3.5" /></button>}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {state === 'loading' ? (
          <ul className="space-y-1" aria-busy="true" aria-label="Loading conversations">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 px-2.5 py-2.5">
                <Skeleton className="h-9 w-9 rounded-full" />
                <span className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-2/3" /><Skeleton className="h-3 w-full" /></span>
              </li>
            ))}
          </ul>
        ) : state === 'error' ? (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive-subtle text-destructive"><WifiOff className="h-5 w-5" /></span>
            <div><p className="text-sm font-semibold text-gray-900">Couldn’t load conversations</p><p className="tf-meta mt-0.5">Check your connection and try again.</p></div>
            <Button size="sm" variant="secondary" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={onRetry}>Retry</Button>
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-blue/10 text-brand-blue"><Inbox className="h-5 w-5" /></span>
            <p className="text-sm font-semibold text-gray-900">{query ? `Nothing matches “${query}”` : 'No conversations here yet'}</p>
            <p className="tf-meta">{query ? 'Try a name, job title or JD number.' : 'Job channels appear when you are assigned to a job.'}</p>
          </div>
        ) : (
          <ul className="space-y-0.5">{conversations.map(row)}</ul>
        )}
      </div>
    </div>
  );
}
