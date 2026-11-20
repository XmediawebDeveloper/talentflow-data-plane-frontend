'use client';

/* Chat test page — the conversation header: Channel (job), Direct
   (employee) and Candidate variants, plus the selection bar. TEST ONLY. */

import { ArrowLeft, Archive, ArchiveRestore, Bell, BellOff, CheckSquare, FolderOpen, Info, MoreVertical, Pin, Search, Trash2, UserPlus, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { VersionPill } from '@/components/assessments/AllAssessmentsTable';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { Conversation, Person } from './types';
import { ApplicationStatusBadge, Avatar, ChannelTile, IconBtn, PRESENCE_LABEL } from './ui';
import { jobById, otherOf, titleOf } from './useChatPreview';
import { can } from './permissions';

export default function ChatHeader({
  c, me, onBack, findOpen, onFind, pinnedCount, onPinned, filesCount, onFiles, onDetails, onMembers,
  onMute, onArchive, onSelect, selection,
}: {
  c: Conversation;
  me: Person;
  /** Phones: back to the list. */
  onBack?: () => void;
  findOpen: boolean;
  onFind: () => void;
  pinnedCount: number;
  onPinned: () => void;
  filesCount: number;
  onFiles: () => void;
  /** Channel details / contact profile. */
  onDetails: () => void;
  onMembers: () => void;
  onMute: () => void;
  onArchive: (archived: boolean) => void;
  onSelect: () => void;
  /** While messages are ticked: the selection bar replaces the header. */
  selection?: { count: number; onClear: () => void; onPin?: () => void; onDelete?: () => void };
}) {
  const job = jobById(c.jobId);
  const muted = !!c.mutedBy?.includes(me.id);
  const other = c.kind !== 'channel' ? otherOf(c, me.id) : null;
  const canArchive = c.kind === 'channel' ? can.archiveChannel(me, c) : can.archiveDirect(me, c);

  if (selection && selection.count > 0) {
    return (
      <header className="flex h-16 shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-900">
        <IconBtn label="Clear selection (Esc)" onClick={selection.onClear}><X className="h-4 w-4" /></IconBtn>
        <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">{selection.count} selected</span>
        <div className="ml-auto flex items-center gap-1.5">
          {selection.onPin && <Button variant="secondary" size="sm" className="h-8 text-xs" icon={<Pin className="h-3.5 w-3.5" />} onClick={selection.onPin}>Pin</Button>}
          {selection.onDelete && <Button variant="secondary" size="sm" className="h-8 text-xs text-destructive" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={selection.onDelete}>Delete</Button>}
        </div>
      </header>
    );
  }

  return (
    <header className="flex min-h-16 shrink-0 items-center gap-2.5 border-b border-gray-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
      {/* Phones only (one panel at a time) — the container is the preview frame. */}
      {onBack && <IconBtn label="Back to conversations" onClick={onBack} className="-ml-1 @min-[768px]:hidden"><ArrowLeft className="h-4 w-4" /></IconBtn>}
      {c.kind === 'channel' ? <ChannelTile archived={c.archived} /> : <Avatar person={other!} />}
      <button type="button" onClick={onDetails} className="min-w-0 flex-1 text-left" title={c.kind === 'channel' ? 'Channel details' : 'View profile'}>
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-gray-900 dark:text-slate-50">{titleOf(c, me.id)}</span>
          {c.archived && <span className="shrink-0 rounded-full bg-gray-100 px-1.5 text-[10px] font-semibold uppercase text-gray-600">Archived</span>}
          {muted && <BellOff className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-label="Muted" />}
        </span>
        <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-gray-500">
          {c.kind === 'channel' && job && (<><JobIdBadge>{job.code}</JobIdBadge><VersionPill kind="job" version={job.version} /><span className="truncate">· {c.memberIds.length} members</span></>)}
          {c.kind === 'direct' && other && <span className="truncate">{other.title} · <span className={other.presence === 'online' ? 'text-emerald-600' : ''}>{PRESENCE_LABEL[other.presence]}</span></span>}
          {c.kind === 'candidate' && job && (<><span className="truncate">{job.code} · {job.title}</span>{c.applicationStatus && <ApplicationStatusBadge status={c.applicationStatus} />}</>)}
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-0.5">
        <IconBtn label="Search messages" active={findOpen} onClick={onFind}><Search className="h-4 w-4" /></IconBtn>
        <IconBtn label="Pinned messages" onClick={onPinned} badge={pinnedCount} className="max-[360px]:hidden"><Pin className="h-4 w-4" /></IconBtn>
        {c.kind === 'channel' && <IconBtn label="Members" onClick={onMembers} className="max-[420px]:hidden"><Users className="h-4 w-4" /></IconBtn>}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Chat settings" title="Chat settings" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800"><MoreVertical className="h-4 w-4" /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={onDetails}><Info className="h-4 w-4" />{c.kind === 'channel' ? 'Channel details' : c.kind === 'candidate' ? 'Candidate & job details' : 'Contact profile'}</DropdownMenuItem>
            {c.kind === 'channel' && <DropdownMenuItem onSelect={onMembers}>{can.manageMembers(me, c) ? <UserPlus className="h-4 w-4" /> : <Users className="h-4 w-4" />}{can.manageMembers(me, c) ? 'Manage members' : 'View members'}</DropdownMenuItem>}
            <DropdownMenuItem onSelect={onPinned}><Pin className="h-4 w-4" />Pinned messages{pinnedCount ? ` (${pinnedCount})` : ''}</DropdownMenuItem>
            <DropdownMenuItem onSelect={onFiles}><FolderOpen className="h-4 w-4" />Shared files{filesCount ? ` (${filesCount})` : ''}</DropdownMenuItem>
            <DropdownMenuItem onSelect={onFind}><Search className="h-4 w-4" />Search messages</DropdownMenuItem>
            {me.role !== 'candidate' && <DropdownMenuItem onSelect={onSelect}><CheckSquare className="h-4 w-4" />Select messages</DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onMute}>{muted ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}{muted ? 'Unmute notifications' : 'Mute notifications'}</DropdownMenuItem>
            {canArchive && (
              <DropdownMenuItem onSelect={() => onArchive(!c.archived)}>
                {c.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                {c.archived ? (c.kind === 'channel' ? 'Restore channel' : 'Restore conversation') : (c.kind === 'channel' ? 'Archive channel' : 'Archive conversation')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
