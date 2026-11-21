'use client';

/* Team Chat — popups: create team, members, team details, contact profile,
   forward, new direct message, pinned messages, shared files. People are
   the tenant's active users (User Management). */

import { useState } from 'react';
import { Archive, ArchiveRestore, Check, Download, FolderOpen, Forward, Mail, MessageSquareText, Pencil, Pin, Search, Shield, ShieldOff, UserMinus, UserPlus, Users, UsersRound } from 'lucide-react';
import AppModal from '@/components/ui/app-modal';
import { Button } from '@/components/ui/button';
import type { Attachment, Conversation, Message, Person, TeamIcon } from './types';
import { AttachmentIcon, Avatar, TeamTile, TEAM_ICONS, kindLabel, lastSeenLabel, listTime } from './ui';
import { otherOf, personById, titleOf } from './people';
import { can, isTeamAdmin } from './permissions';

const searchBox = (value: string, onChange: (v: string) => void, placeholder: string) => (
  <div className="relative">
    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30 dark:border-slate-700 dark:bg-slate-900" />
  </div>
);
const sectionTitle = (t: string) => <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{t}</p>;
/** Pick a team's icon. */
function IconPicker({ value, onChange }: { value: TeamIcon; onChange: (v: TeamIcon) => void }) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-gray-800">Icon</span>
      <div role="radiogroup" aria-label="Team icon" className="grid grid-cols-5 gap-1.5">
        {TEAM_ICONS.map(({ key, label, Icon }) => (
          <button key={key} type="button" role="radio" aria-checked={value === key} aria-label={label} title={label} onClick={() => onChange(key)}
            className={`flex h-10 items-center justify-center rounded-lg border transition-colors ${value === key ? 'border-brand-blue bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/30' : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-800'}`}>
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
    </div>
  );
}

const matches = (p: Person, q: string) => `${p.name} ${p.email} ${p.roleName}`.toLowerCase().includes(q.trim().toLowerCase());

/* ── Members ── */
export function MembersDialog({ c, me, people, open, onClose, onAdd, onRemove, onToggleAdmin, hideAdminToggle }: {
  c: Conversation; me: Person; people: Person[]; open: boolean; onClose: () => void;
  onAdd: (ids: string[]) => void; onRemove: (id: string) => void; onToggleAdmin: (id: string) => void;
  /** Live chat: no team-admin roles in the API. */
  hideAdminToggle?: boolean;
}) {
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState<Set<string>>(new Set());
  const manage = can.manageMembers(me, c);
  const members = c.memberIds.map(personById);
  const eligible = people.filter(p => !c.memberIds.includes(p.id) && matches(p, q));

  return (
    <AppModal open={open} onCancel={onClose} cancelLabel="Close" tone="plain" size="md" density="compact"
      icon={<Users className="h-4 w-4" />} title={manage ? 'Manage members' : 'Members'}
      subtitle={`${c.name ?? 'Team'} — ${c.memberIds.length} members`}
      actions={manage && adding.size ? [{ label: `Add ${adding.size}`, icon: <UserPlus className="h-4 w-4" />, onClick: () => { onAdd([...adding]); setAdding(new Set()); } }] : []}>
      <div className="space-y-4">
        {!manage && <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">Only tenant admins and this team’s admins can add or remove members.</p>}
        <div>
          {sectionTitle(`In this team · ${members.length}`)}
          <ul className="space-y-0.5">
            {members.map(p => {
              const admin = p.isAdmin || c.adminIds?.includes(p.id);
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-gray-50">
                  <Avatar person={p} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5"><span className="truncate text-sm font-medium text-gray-900">{p.id === me.id ? `${p.name} (you)` : p.name}</span>
                      {admin && <span className="shrink-0 rounded-full bg-brand-blue/10 px-1.5 text-[10px] font-semibold text-brand-blue">Admin</span>}
                      </span>
                    <span className="block truncate text-xs text-gray-500">{[p.roleName, p.email].filter(Boolean).join(' · ')}</span>
                  </span>
                  {manage && p.id !== me.id && !p.isAdmin && (
                    <span className="flex shrink-0 items-center gap-1">
                      {!hideAdminToggle && (
                        <Button variant="secondary" size="sm" className="h-7 px-2 text-xs" onClick={() => onToggleAdmin(p.id)}
                          icon={c.adminIds?.includes(p.id) ? <ShieldOff className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}>
                          {c.adminIds?.includes(p.id) ? 'Remove admin' : 'Make admin'}
                        </Button>
                      )}
                      <Button variant="secondary" size="sm" className="h-7 px-2 text-xs text-destructive" onClick={() => onRemove(p.id)} icon={<UserMinus className="h-3.5 w-3.5" />}>Remove</Button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        {manage && (
          <div className="space-y-2">
            {sectionTitle('Add members')}
            {searchBox(q, setQ, 'Search users by name, email or role')}
            {eligible.length === 0 ? <p className="py-4 text-center tf-meta">No other active users to add.</p> : (
              <ul className="max-h-64 space-y-0.5 overflow-y-auto">
                {eligible.map(p => (
                  <li key={p.id}>
                    <button type="button" onClick={() => setAdding(s => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}
                      className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-gray-50 ${adding.has(p.id) ? 'bg-brand-blue/[0.06]' : ''}`}>
                      <Avatar person={p} size="sm" />
                      <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5"><span className="truncate text-sm font-medium text-gray-900">{p.name}</span></span><span className="block truncate text-xs text-gray-500">{[p.roleName, p.email].filter(Boolean).join(' · ')}</span></span>
                      <span className={`flex h-4 w-4 items-center justify-center rounded border ${adding.has(p.id) ? 'border-brand-blue bg-brand-blue text-white' : 'border-gray-300'}`}>{adding.has(p.id) && <Check className="h-3 w-3" />}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-gray-500">Only active users from User Management can be added.</p>
          </div>
        )}
      </div>
    </AppModal>
  );
}

/* ── Create team ── */
export function CreateTeamDialog({ open, onClose, me, people, nameTaken, onCreate, showIcon = true }: {
  open: boolean; onClose: () => void; me: Person; people: Person[];
  /** Live chat: the API keeps no team icon. */
  showIcon?: boolean;
  nameTaken: (name: string) => boolean;
  onCreate: (input: { name: string; description: string; memberIds: string[]; icon: TeamIcon }) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [icon, setIcon] = useState<TeamIcon>('users');
  const trimmed = name.trim();
  const taken = !!trimmed && nameTaken(trimmed);
  const tooShort = trimmed.length > 0 && trimmed.length < 2;
  const list = people.filter(p => p.id !== me.id && matches(p, q));
  return (
    <AppModal open={open} onCancel={onClose} tone="plain" size="md" density="compact" icon={<UsersRound className="h-4 w-4" />}
      title="Create team" subtitle="Give it any name — e.g. People Integra, Hire Team, Billing Team. You will be its admin."
      actions={[{ label: pick.size ? `Create with ${pick.size + 1} members` : 'Create team', disabled: !trimmed || taken || tooShort, onClick: () => onCreate({ name: trimmed, description, memberIds: [...pick], icon }) }]}>
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-800">Team name</span>
          <input autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder="e.g. People Integra"
            className={`h-9 w-full rounded-lg border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 ${taken ? 'border-destructive focus-visible:ring-destructive/30' : 'border-gray-200 focus-visible:ring-brand-blue/30'}`} />
          {taken && <span className="mt-1 block text-xs text-destructive">A team called “{trimmed}” already exists.</span>}
          {tooShort && <span className="mt-1 block text-xs text-destructive">Use at least 2 characters.</span>}
        </label>
        {showIcon && <IconPicker value={icon} onChange={setIcon} />}
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-800">Description <span className="font-normal text-gray-500">(optional)</span></span>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} maxLength={200} placeholder="What is this team for?"
            className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30" />
        </label>
        <div className="space-y-2">
          <span className="block text-sm font-medium text-gray-800">Members <span className="font-normal text-gray-500">({pick.size} selected · you are added automatically)</span></span>
          {searchBox(q, setQ, 'Search users by name, email or role')}
          <ul className="max-h-56 space-y-0.5 overflow-y-auto">
            {list.length === 0 && <li className="py-4 text-center tf-meta">No users match your search.</li>}
            {list.map(p => (
              <li key={p.id}>
                <button type="button" onClick={() => setPick(s => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}
                  className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-gray-50 ${pick.has(p.id) ? 'bg-brand-blue/[0.06]' : ''}`}>
                  <Avatar person={p} size="sm" />
                  <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5"><span className="truncate text-sm font-medium text-gray-900">{p.name}</span></span><span className="block truncate text-xs text-gray-500">{[p.roleName, p.email].filter(Boolean).join(' · ')}</span></span>
                  <span className={`flex h-4 w-4 items-center justify-center rounded border ${pick.has(p.id) ? 'border-brand-blue bg-brand-blue text-white' : 'border-gray-300'}`}>{pick.has(p.id) && <Check className="h-3 w-3" />}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppModal>
  );
}

/* ── Team details (+ rename / description for team admins) ── */
export function TeamDetailsDialog({ c, me, open, onClose, onMembers, onPinned, onFiles, onArchive, nameTaken, onSave, showIcon = true, hideArchive }: {
  c: Conversation; me: Person; open: boolean; onClose: () => void;
  /** Live chat: no team icon / archive in the API. */
  showIcon?: boolean;
  hideArchive?: boolean;
  onMembers: () => void; onPinned: () => void; onFiles: () => void; onArchive: (v: boolean) => void;
  nameTaken: (name: string) => boolean;
  onSave: (input: { name: string; description: string; icon: TeamIcon }) => void;
}) {
  const admin = isTeamAdmin(me, c);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(c.name ?? '');
  const [description, setDescription] = useState(c.description ?? '');
  const [icon, setIcon] = useState<TeamIcon>(c.icon ?? 'users');
  const pinned = c.messages.filter(m => m.pinned && !m.deleted).length;
  const files = c.messages.flatMap(m => (m.deleted ? [] : m.attachments ?? [])).length;
  const trimmed = name.trim();
  const taken = editing && !!trimmed && nameTaken(trimmed);
  const creator = c.createdBy ? personById(c.createdBy) : null;
  const stat = (label: string, value: number, onClick: () => void, Icon: typeof Users) => (
    <button type="button" onClick={onClick} className="flex flex-1 flex-col items-center gap-1 rounded-lg border border-gray-200 px-2 py-3 hover:border-brand-blue/30 hover:bg-brand-blue/[0.03]">
      <Icon className="h-4 w-4 text-brand-blue" /><span className="text-base font-semibold tabular-nums text-gray-900">{value}</span><span className="text-[11px] text-gray-500">{label}</span>
    </button>
  );
  const actions = editing
    ? [{ label: 'Cancel', variant: 'secondary' as const, onClick: () => { setEditing(false); setName(c.name ?? ''); setDescription(c.description ?? ''); setIcon(c.icon ?? 'users'); } },
       { label: 'Save', disabled: trimmed.length < 2 || taken, onClick: () => { onSave({ name: trimmed, description, icon }); setEditing(false); } }]
    : admin
      ? [{ label: 'Edit', variant: 'secondary' as const, icon: <Pencil className="h-4 w-4" />, onClick: () => setEditing(true) },
         ...(hideArchive ? [] : [{ label: c.archived ? 'Restore team' : 'Archive team', variant: 'secondary' as const, icon: c.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />, onClick: () => onArchive(!c.archived) }])]
      : [];
  return (
    <AppModal open={open} onCancel={onClose} cancelLabel="Close" tone="plain" size="md" density="compact" icon={<UsersRound className="h-4 w-4" />} title="Team details" actions={actions}>
      <div className="space-y-4">
        {editing ? (
          <>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-800">Team name</span>
              <input autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={60}
                className={`h-9 w-full rounded-lg border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 ${taken ? 'border-destructive focus-visible:ring-destructive/30' : 'border-gray-200 focus-visible:ring-brand-blue/30'}`} />
              {taken && <span className="mt-1 block text-xs text-destructive">A team called “{trimmed}” already exists.</span>}
            </label>
            {showIcon && <IconPicker value={icon} onChange={setIcon} />}
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-800">Description</span>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} maxLength={200}
                className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30" />
            </label>
          </>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <TeamTile archived={c.archived} icon={c.icon} />
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900"><span className="truncate">{c.name}</span>{c.archived && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">Archived</span>}</p>
                <p className="mt-0.5 text-xs text-gray-500">{creator ? `Created by ${creator.id === me.id ? 'you' : creator.name}` : 'Team'} · {listTime(c.createdAt)}</p>
              </div>
            </div>
            <div>{sectionTitle('About')}<p className="text-sm text-gray-700">{c.description || 'No description yet.'}</p></div>
          </>
        )}
        <div className="flex gap-2">
          {stat('Members', c.memberIds.length, onMembers, Users)}
          {stat('Pinned', pinned, onPinned, Pin)}
          {stat('Files', files, onFiles, FolderOpen)}
        </div>
        <p className="text-xs text-gray-500">Only the team’s members can open it. {admin ? `As an admin you can rename it${hideArchive ? ' and manage members' : ', manage members and archive it'}.` : ''}</p>
      </div>
    </AppModal>
  );
}

/* ── Contact profile ── */
export function ProfileDialog({ c, me, open, onClose, onFiles }: { c: Conversation; me: Person; open: boolean; onClose: () => void; onFiles: () => void }) {
  const p = otherOf(c, me.id);
  return (
    <AppModal open={open} onCancel={onClose} cancelLabel="Close" tone="plain" size="sm" density="compact" icon={<MessageSquareText className="h-4 w-4" />}
      title="Contact profile" actions={[{ label: 'Shared files', variant: 'secondary', icon: <FolderOpen className="h-4 w-4" />, onClick: onFiles }]}>
      <div className="space-y-4">
        <div className="flex flex-col items-center text-center">
          <Avatar person={p} size="lg" />
          <p className="mt-2 text-sm font-semibold text-gray-900">{p.name}</p>
          {p.roleName && <p className="text-xs text-gray-500">{p.roleName}</p>}
          <p className="mt-1 text-xs font-medium text-emerald-600">{lastSeenLabel(p, me.id)}</p>
        </div>
        <dl className="space-y-2 text-sm">
          <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-gray-400" /><dt className="sr-only">Email</dt><dd className="truncate text-gray-800">{p.email || '—'}</dd></div>
        </dl>
      </div>
    </AppModal>
  );
}

/* ── Forward ── */
export function ForwardDialog({ open, onClose, message, conversations, me, onForward }: {
  open: boolean; onClose: () => void; message: Message | null; conversations: Conversation[]; me: Person; onForward: (ids: string[]) => void;
}) {
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<Set<string>>(new Set());
  const list = conversations.filter(c => !c.archived && titleOf(c, me.id).toLowerCase().includes(q.toLowerCase()));
  return (
    <AppModal open={open} onCancel={onClose} tone="plain" size="md" density="compact" icon={<Forward className="h-4 w-4" />} title="Forward message"
      actions={[{ label: pick.size ? `Forward to ${pick.size}` : 'Forward', disabled: !pick.size, onClick: () => { onForward([...pick]); setPick(new Set()); } }]}>
      <div className="space-y-3">
        {message && <div className="rounded-lg border-l-2 border-brand-blue bg-brand-blue/5 px-3 py-2 text-sm text-gray-700"><span className="line-clamp-3">{message.text || message.attachments?.map(a => a.name).join(', ')}</span></div>}
        {searchBox(q, setQ, 'Search teams and people')}
        <ul className="max-h-72 space-y-0.5 overflow-y-auto">
          {list.map(c => (
            <li key={c.id}>
              <button type="button" onClick={() => setPick(s => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })}
                className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-gray-50 ${pick.has(c.id) ? 'bg-brand-blue/[0.06]' : ''}`}>
                {c.kind === 'team' ? <TeamTile size="sm" icon={c.icon} /> : <Avatar person={otherOf(c, me.id)} size="sm" />}
                <span className="min-w-0 flex-1 truncate text-sm text-gray-900">{titleOf(c, me.id)}</span>
                <span className={`flex h-4 w-4 items-center justify-center rounded border ${pick.has(c.id) ? 'border-brand-blue bg-brand-blue text-white' : 'border-gray-300'}`}>{pick.has(c.id) && <Check className="h-3 w-3" />}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </AppModal>
  );
}

/* ── New direct message (User Management users only) ── */
export function NewDirectDialog({ open, onClose, me, people, onStart, subtitle = 'Start a private chat with an active user from User Management.' }: {
  open: boolean; onClose: () => void; me: Person; people: Person[]; onStart: (personId: string) => void;
  subtitle?: string;
}) {
  const [q, setQ] = useState('');
  const list = people.filter(p => p.id !== me.id && matches(p, q));
  return (
    <AppModal open={open} onCancel={onClose} tone="plain" size="md" density="compact" icon={<MessageSquareText className="h-4 w-4" />}
      title="New message" subtitle={subtitle}>
      <div className="space-y-3">
        {searchBox(q, setQ, 'Search by name, email or role')}
        <ul className="max-h-80 space-y-0.5 overflow-y-auto">
          {list.length === 0 && <li className="py-6 text-center tf-meta">{people.length <= 1 ? 'No other active users in User Management.' : 'No users match your search.'}</li>}
          {list.map(p => (
            <li key={p.id}><button type="button" onClick={() => onStart(p.id)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-gray-50">
              <Avatar person={p} size="sm" />
              <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5"><span className="truncate text-sm font-medium text-gray-900">{p.name}</span></span><span className="block truncate text-xs text-gray-500">{[p.roleName, p.email].filter(Boolean).join(' · ')}</span></span>
            </button></li>
          ))}
        </ul>
      </div>
    </AppModal>
  );
}

/* ── Pinned messages ── */
export function PinnedDialog({ c, me, open, onClose, onJump, onUnpin }: {
  c: Conversation; me: Person; open: boolean; onClose: () => void; onJump: (id: string) => void; onUnpin: (id: string) => void;
}) {
  const pinned = c.messages.filter(m => m.pinned && !m.deleted);
  return (
    <AppModal open={open} onCancel={onClose} cancelLabel="Close" tone="plain" size="md" density="compact" icon={<Pin className="h-4 w-4" />} title="Pinned messages" subtitle={titleOf(c, me.id)}>
      {pinned.length === 0 ? (
        <div className="py-8 text-center"><Pin className="mx-auto h-6 w-6 text-gray-300" /><p className="mt-2 text-sm text-gray-600">No pinned messages yet</p><p className="tf-meta">Open a message’s ⋯ menu and choose Pin.</p></div>
      ) : (
        <ul className="space-y-2">
          {pinned.map(m => (
            <li key={m.id} className="rounded-lg border border-gray-200 p-3">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium text-gray-900">{m.authorId === me.id ? 'You' : personById(m.authorId).name}</span><span className="text-gray-500">{listTime(m.at)}</span>
                <span className="ml-auto flex gap-1">
                  <Button variant="secondary" size="sm" className="h-7 px-2 text-xs" onClick={() => onJump(m.id)}>Go to</Button>
                  <Button variant="secondary" size="sm" className="h-7 px-2 text-xs" onClick={() => onUnpin(m.id)}>Unpin</Button>
                </span>
              </div>
              <p className="text-sm text-gray-700">{m.text || m.attachments?.map(a => a.name).join(', ')}</p>
            </li>
          ))}
        </ul>
      )}
    </AppModal>
  );
}

/* ── Shared files ── */
export function FilesDialog({ c, me, open, onClose, onOpenFile }: { c: Conversation; me: Person; open: boolean; onClose: () => void; onOpenFile: (a: Attachment) => void }) {
  const files = c.messages.flatMap(m => (m.deleted ? [] : (m.attachments ?? []).map(a => ({ a, m }))));
  const images = files.filter(f => f.a.kind === 'image');
  const docs = files.filter(f => f.a.kind !== 'image');
  return (
    <AppModal open={open} onCancel={onClose} cancelLabel="Close" tone="plain" size="md" density="compact" icon={<FolderOpen className="h-4 w-4" />} title="Shared files" subtitle={`${titleOf(c, me.id)} · ${files.length} files`}>
      {files.length === 0 ? <p className="py-8 text-center tf-meta">No files shared yet.</p> : (
        <div className="space-y-4">
          {images.length > 0 && (<div>{sectionTitle(`Images · ${images.length}`)}
            <div className="grid grid-cols-3 gap-2">{images.map(({ a }) => (
              <button key={a.id} type="button" onClick={() => onOpenFile(a)} className="overflow-hidden rounded-lg border border-gray-200" title={a.name}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {a.url ? <img src={a.url} alt={a.name} className="h-20 w-full object-cover" /> : <span className={`block h-20 bg-gradient-to-br ${a.tint ?? 'from-sky-200 to-indigo-200'}`} />}
              </button>
            ))}</div></div>)}
          {docs.length > 0 && (<div>{sectionTitle(`Documents · ${docs.length}`)}
            <ul className="space-y-1">{docs.map(({ a, m }) => (
              <li key={a.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-gray-50">
                <AttachmentIcon kind={a.kind} />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-gray-900">{a.name}</span><span className="block truncate text-[11px] text-gray-500">{kindLabel(a.kind)} · {a.size} · {m.authorId === me.id ? 'You' : personById(m.authorId).name} · {listTime(m.at)}</span></span>
                <Button variant="secondary" size="sm" className="h-7 px-2 text-xs" icon={<Download className="h-3.5 w-3.5" />} onClick={() => onOpenFile(a)}>Open</Button>
              </li>
            ))}</ul></div>)}
        </div>
      )}
    </AppModal>
  );
}
