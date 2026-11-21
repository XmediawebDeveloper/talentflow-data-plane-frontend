'use client';

/* Team Chat — the conversation header: team and direct variants, plus the
   selection bar. */

import type { ReactNode } from 'react';
import { ArrowLeft, Archive, ArchiveRestore, Bell, BellOff, CheckSquare, FolderOpen, Info, MoreVertical, Pin, Search, Trash2, UserPlus, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { Conversation, Person } from './types';
import { Avatar, TeamTile, IconBtn, lastSeenLabel } from './ui';
import { otherOf, titleOf } from './people';
import { can } from './permissions';

export default function ChatHeader({
  c, me, onBack, findOpen, onFind, pinnedCount, onPinned, filesCount, onFiles, onDetails, onMembers,
  onMute, onArchive, onSelect, selection, hideArchive, extraMenu, statusExtra,
}: {
  /** Live chat: no archive (the API has none). */
  hideArchive?: boolean;
  /** More items at the end of the ⋮ menu (DropdownMenuItem elements). */
  extraMenu?: ReactNode;
  /** Shown before the status line (e.g. "Reconnecting…"). */
  statusExtra?: ReactNode;
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
  /** Team details / contact profile. */
  onDetails: () => void;
  onMembers: () => void;
  onMute: () => void;
  onArchive: (archived: boolean) => void;
  onSelect: () => void;
  /** While messages are ticked: the selection bar replaces the header. */
  selection?: { count: number; onClear: () => void; onPin?: () => void; onDelete?: () => void };
}) {
  const muted = !!c.mutedBy?.includes(me.id);
  const other = c.kind !== 'team' ? otherOf(c, me.id) : null;
  const canArchive = !hideArchive && (c.kind === 'team' ? can.archiveTeam(me, c) : can.archiveDirect(me, c));

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
      {c.kind === 'team' ? <TeamTile archived={c.archived} icon={c.icon} /> : <Avatar person={other!} />}
      <button type="button" onClick={onDetails} className="min-w-0 flex-1 text-left" title={c.kind === 'team' ? 'Team details' : 'View profile'}>
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-gray-900 dark:text-slate-50">{titleOf(c, me.id)}</span>
          {c.archived && <span className="shrink-0 rounded-full bg-gray-100 px-1.5 text-[10px] font-semibold uppercase text-gray-600">Archived</span>}
          {muted && <BellOff className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-label="Muted" />}
        </span>
        <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-gray-500">
          {statusExtra}
          {c.kind === 'team' && <span className="truncate">{c.memberIds.length} members{c.description ? ` · ${c.description}` : ''}</span>}
          {c.kind === 'direct' && other && (() => {
            const seen = lastSeenLabel(other, me.id);
            return <span className={`truncate ${seen === 'Online' ? 'font-medium text-emerald-600' : ''}`} title={seen === 'Online' ? undefined : 'From the last login in User Management'}>{seen}</span>;
          })()}
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-0.5">
        <IconBtn label="Search messages" active={findOpen} onClick={onFind}><Search className="h-4 w-4" /></IconBtn>
        <IconBtn label="Pinned messages" onClick={onPinned} badge={pinnedCount} className="max-[360px]:hidden"><Pin className="h-4 w-4" /></IconBtn>
        {c.kind === 'team' && <IconBtn label="Members" onClick={onMembers} className="max-[420px]:hidden"><Users className="h-4 w-4" /></IconBtn>}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Chat settings" title="Chat settings" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800"><MoreVertical className="h-4 w-4" /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={onDetails}><Info className="h-4 w-4" />{c.kind === 'team' ? 'Team details' : 'Contact profile'}</DropdownMenuItem>
            {c.kind === 'team' && <DropdownMenuItem onSelect={onMembers}>{can.manageMembers(me, c) ? <UserPlus className="h-4 w-4" /> : <Users className="h-4 w-4" />}{can.manageMembers(me, c) ? 'Manage members' : 'View members'}</DropdownMenuItem>}
            <DropdownMenuItem onSelect={onPinned}><Pin className="h-4 w-4" />Pinned messages{pinnedCount ? ` (${pinnedCount})` : ''}</DropdownMenuItem>
            <DropdownMenuItem onSelect={onFiles}><FolderOpen className="h-4 w-4" />Shared files{filesCount ? ` (${filesCount})` : ''}</DropdownMenuItem>
            <DropdownMenuItem onSelect={onFind}><Search className="h-4 w-4" />Search messages</DropdownMenuItem>
            <DropdownMenuItem onSelect={onSelect}><CheckSquare className="h-4 w-4" />Select messages</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onMute}>{muted ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}{muted ? 'Unmute notifications' : 'Mute notifications'}</DropdownMenuItem>
            {canArchive && (
              <DropdownMenuItem onSelect={() => onArchive(!c.archived)}>
                {c.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                {c.archived ? (c.kind === 'team' ? 'Restore team' : 'Restore conversation') : (c.kind === 'team' ? 'Archive team' : 'Archive conversation')}
              </DropdownMenuItem>
            )}
            {extraMenu}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
