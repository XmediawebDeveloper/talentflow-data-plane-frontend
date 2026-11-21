'use client';

/* Chat test page — popups: members, channel details, profile, forward,
   new chat, pinned messages, shared files, attachment preview. TEST ONLY. */

import { useState } from 'react';
import { Archive, ArchiveRestore, Briefcase, Calendar, Check, Download, FolderOpen, Hash, Mail, MapPin, Pin, Search, Shield, ShieldOff, UserMinus, UserPlus, Users, MessageSquareText, UserRound, Forward } from 'lucide-react';
import AppModal from '@/components/ui/app-modal';
import { Button } from '@/components/ui/button';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { VersionPill } from '@/components/assessments/AllAssessmentsTable';
import type { Attachment, Conversation, Message, Person } from './types';
import { ROLE_LABEL } from './types';
import { APPLICATIONS, PEOPLE } from './testData';
import { ApplicationStatusBadge, AttachmentIcon, Avatar, ChannelTile, PRESENCE_DOT, PRESENCE_LABEL, SimTag, kindLabel, listTime } from './ui';
import { jobById, otherOf, personById, titleOf } from './useChatPreview';
import { can, isChannelAdmin } from './permissions';

const searchBox = (value: string, onChange: (v: string) => void, placeholder: string) => (
  <div className="relative">
    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30 dark:border-slate-700 dark:bg-slate-900" />
  </div>
);
const sectionTitle = (t: string) => <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{t}</p>;

/* ── Members ── */
export function MembersDialog({ c, me, open, onClose, onAdd, onRemove, onToggleAdmin }: {
  c: Conversation; me: Person; open: boolean; onClose: () => void;
  onAdd: (ids: string[]) => void; onRemove: (id: string) => void; onToggleAdmin: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState<Set<string>>(new Set());
  const manage = can.manageMembers(me, c);
  const job = jobById(c.jobId);
  const members = c.memberIds.map(personById);
  // Only employees can join a job channel — assigned to the job first.
  const eligible = PEOPLE.filter(p => p.role !== 'candidate' && !c.memberIds.includes(p.id) && p.name.toLowerCase().includes(q.toLowerCase()));
  const assigned = eligible.filter(p => job && p.jobIds?.includes(job.id));
  const others = eligible.filter(p => !assigned.includes(p));
  const pickRow = (p: Person) => (
    <li key={p.id}>
      <button type="button" onClick={() => setAdding(s => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}
        className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-gray-50 ${adding.has(p.id) ? 'bg-brand-blue/[0.06]' : ''}`}>
        <Avatar person={p} size="sm" />
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-gray-900">{p.name}</span><span className="block truncate text-xs text-gray-500">{ROLE_LABEL[p.role]} · {p.title}</span></span>
        <span className={`flex h-4 w-4 items-center justify-center rounded border ${adding.has(p.id) ? 'border-brand-blue bg-brand-blue text-white' : 'border-gray-300'}`}>{adding.has(p.id) && <Check className="h-3 w-3" />}</span>
      </button>
    </li>
  );

  return (
    <AppModal open={open} onCancel={onClose} cancelLabel="Close" tone="plain" size="md" density="compact"
      icon={<Users className="h-4 w-4" />} title={manage ? 'Manage members' : 'Members'}
      subtitle={job ? `${job.code} · ${job.title} — ${c.memberIds.length} members` : undefined}
      actions={manage && adding.size ? [{ label: `Add ${adding.size}`, icon: <UserPlus className="h-4 w-4" />, onClick: () => { onAdd([...adding]); setAdding(new Set()); } }] : []}>
      <div className="space-y-4">
        {!manage && <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">Only HR Admins and this channel’s admins can add or remove members.</p>}
        <div>
          {sectionTitle(`In this channel · ${members.length}`)}
          <ul className="space-y-0.5">
            {members.map(p => {
              const admin = c.adminIds?.includes(p.id) || p.role === 'hr_admin' || p.role === 'super_admin';
              return (
                <li key={p.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-gray-50">
                  <Avatar person={p} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5"><span className="truncate text-sm font-medium text-gray-900">{p.id === me.id ? `${p.name} (you)` : p.name}</span>
                      {admin && <span className="shrink-0 rounded-full bg-brand-blue/10 px-1.5 text-[10px] font-semibold text-brand-blue">Admin</span>}</span>
                    <span className="block truncate text-xs text-gray-500">{ROLE_LABEL[p.role]} · {p.title}</span>
                  </span>
                  {manage && p.id !== me.id && p.role !== 'super_admin' && p.role !== 'hr_admin' && (
                    <span className="flex shrink-0 items-center gap-1">
                      <Button variant="secondary" size="sm" className="h-7 px-2 text-xs" onClick={() => onToggleAdmin(p.id)}
                        icon={c.adminIds?.includes(p.id) ? <ShieldOff className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}>
                        {c.adminIds?.includes(p.id) ? 'Remove admin' : 'Make admin'}
                      </Button>
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
            {searchBox(q, setQ, 'Search employees')}
            {eligible.length === 0 ? <p className="py-4 text-center tf-meta">No employees left to add.</p> : (
              <>
                {assigned.length > 0 && (<><p className="text-xs text-gray-500">Assigned to this job</p><ul className="space-y-0.5">{assigned.map(pickRow)}</ul></>)}
                {others.length > 0 && (<><p className="pt-1 text-xs text-gray-500">Other employees (not assigned to this job)</p><ul className="space-y-0.5">{others.map(pickRow)}</ul></>)}
              </>
            )}
            <p className="text-[11px] text-gray-500">Candidates can never join internal job channels.</p>
          </div>
        )}
      </div>
    </AppModal>
  );
}

/* ── Channel details ── */
export function ChannelDetailsDialog({ c, me, open, onClose, onMembers, onPinned, onFiles, onArchive }: {
  c: Conversation; me: Person; open: boolean; onClose: () => void;
  onMembers: () => void; onPinned: () => void; onFiles: () => void; onArchive: (v: boolean) => void;
}) {
  const job = jobById(c.jobId);
  const pinned = c.messages.filter(m => m.pinned && !m.deleted).length;
  const files = c.messages.flatMap(m => (m.deleted ? [] : m.attachments ?? [])).length;
  const admin = isChannelAdmin(me, c);
  const stat = (label: string, value: number, onClick: () => void, Icon: typeof Users) => (
    <button type="button" onClick={onClick} className="flex flex-1 flex-col items-center gap-1 rounded-lg border border-gray-200 px-2 py-3 hover:border-brand-blue/30 hover:bg-brand-blue/[0.03]">
      <Icon className="h-4 w-4 text-brand-blue" /><span className="text-base font-semibold tabular-nums text-gray-900">{value}</span><span className="text-[11px] text-gray-500">{label}</span>
    </button>
  );
  return (
    <AppModal open={open} onCancel={onClose} cancelLabel="Close" tone="plain" size="md" density="compact" icon={<Hash className="h-4 w-4" />} title="Channel details"
      actions={admin ? [{ label: c.archived ? 'Restore channel' : 'Archive channel', variant: 'secondary', icon: c.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />, onClick: () => onArchive(!c.archived) }] : []}>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <ChannelTile archived={c.archived} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">{job?.title}</p>
            {job && <div className="mt-1 flex flex-wrap items-center gap-1.5"><JobIdBadge>{job.code}</JobIdBadge><VersionPill kind="job" version={job.version} label="Job" />{c.archived && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">Archived</span>}</div>}
          </div>
        </div>
        {job && (
          <dl className="grid grid-cols-1 gap-2 rounded-lg bg-gray-50 p-3 text-sm sm:grid-cols-2">
            <div className="flex items-center gap-2"><Briefcase className="h-4 w-4 text-gray-400" /><dt className="sr-only">Department</dt><dd>{job.department}</dd></div>
            <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-gray-400" /><dt className="sr-only">Location</dt><dd>{job.location}</dd></div>
            <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-gray-400" /><dt className="sr-only">Created</dt><dd>Created {listTime(c.createdAt)} · with the job</dd></div>
          </dl>
        )}
        {c.description && <div>{sectionTitle('About')}<p className="text-sm text-gray-700">{c.description}</p></div>}
        <div className="flex gap-2">
          {stat('Members', c.memberIds.length, onMembers, Users)}
          {stat('Pinned', pinned, onPinned, Pin)}
          {stat('Files', files, onFiles, FolderOpen)}
        </div>
        <p className="text-xs text-gray-500">Access: assigned HR, recruiters, hiring managers and interviewers only. {admin ? 'You can manage members and archive this channel.' : ''}</p>
      </div>
    </AppModal>
  );
}

/* ── Contact / candidate profile ── */
export function ProfileDialog({ c, me, open, onClose, onFiles }: { c: Conversation; me: Person; open: boolean; onClose: () => void; onFiles: () => void }) {
  const p = otherOf(c, me.id);
  const job = jobById(c.jobId);
  const sharedJobs = p.role !== 'candidate' ? (p.jobIds ?? []).filter(j => me.jobIds?.includes(j)).map(jobById).filter(Boolean) : [];
  return (
    <AppModal open={open} onCancel={onClose} cancelLabel="Close" tone="plain" size="sm" density="compact" icon={p.role === 'candidate' ? <UserRound className="h-4 w-4" /> : <MessageSquareText className="h-4 w-4" />}
      title={p.role === 'candidate' ? 'Candidate' : 'Contact profile'} actions={[{ label: 'Shared files', variant: 'secondary', icon: <FolderOpen className="h-4 w-4" />, onClick: onFiles }]}>
      <div className="space-y-4">
        <div className="flex flex-col items-center text-center">
          <Avatar person={p} size="lg" />
          <p className="mt-2 text-sm font-semibold text-gray-900">{p.name}</p>
          <p className="text-xs text-gray-500">{p.role === 'candidate' ? 'Candidate' : `${ROLE_LABEL[p.role]} · ${p.title}`}</p>
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700"><span className={`h-2 w-2 rounded-full ${PRESENCE_DOT[p.presence]}`} />{PRESENCE_LABEL[p.presence]}</span>
        </div>
        <dl className="space-y-2 text-sm">
          <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-gray-400" /><dd className="truncate text-gray-800">{p.email}</dd></div>
        </dl>
        {p.role === 'candidate' && job && (
          <div className="rounded-lg border border-gray-200 p-3">
            {sectionTitle('Related job')}
            <p className="text-sm font-medium text-gray-900">{job.title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5"><JobIdBadge>{job.code}</JobIdBadge><VersionPill kind="job" version={job.version} label="Job" />{c.applicationStatus && <ApplicationStatusBadge status={c.applicationStatus} />}</div>
            <p className="mt-2 text-xs text-gray-500">This chat belongs to this application only. The candidate can reply but cannot start new chats.</p>
          </div>
        )}
        {sharedJobs.length > 0 && (
          <div>{sectionTitle('Jobs you both work on')}
            <ul className="space-y-1">{sharedJobs.map(j => <li key={j!.id} className="flex items-center gap-2 text-sm"><JobIdBadge>{j!.code}</JobIdBadge><span className="truncate">{j!.title}</span></li>)}</ul>
          </div>
        )}
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
  const list = conversations.filter(c => !c.archived && c.kind !== 'candidate' && titleOf(c, me.id).toLowerCase().includes(q.toLowerCase()));
  return (
    <AppModal open={open} onCancel={onClose} tone="plain" size="md" density="compact" icon={<Forward className="h-4 w-4" />} title="Forward message"
      subtitle="Candidate chats are excluded — internal messages are never forwarded to candidates."
      actions={[{ label: pick.size ? `Forward to ${pick.size}` : 'Forward', disabled: !pick.size, onClick: () => { onForward([...pick]); setPick(new Set()); } }]}>
      <div className="space-y-3">
        {message && <div className="rounded-lg border-l-2 border-brand-blue bg-brand-blue/5 px-3 py-2 text-sm text-gray-700"><span className="line-clamp-3">{message.text || message.attachments?.map(a => a.name).join(', ')}</span></div>}
        {searchBox(q, setQ, 'Search channels and people')}
        <ul className="max-h-72 space-y-0.5 overflow-y-auto">
          {list.map(c => (
            <li key={c.id}>
              <button type="button" onClick={() => setPick(s => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })}
                className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-gray-50 ${pick.has(c.id) ? 'bg-brand-blue/[0.06]' : ''}`}>
                {c.kind === 'channel' ? <ChannelTile size="sm" /> : <Avatar person={otherOf(c, me.id)} size="sm" />}
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

/* ── New chat: employee, or candidate (per application) ── */
export function NewChatDialog({ mode, open, onClose, me, onStart }: {
  mode: 'employee' | 'candidate'; open: boolean; onClose: () => void; me: Person; onStart: (personId: string, jobId?: string) => void;
}) {
  const [q, setQ] = useState('');
  const employees = PEOPLE.filter(p => p.role !== 'candidate' && p.id !== me.id && p.name.toLowerCase().includes(q.toLowerCase()));
  // A recruiter may only message candidates of jobs they can access.
  const apps = APPLICATIONS.filter(a => me.jobIds?.includes(a.jobId))
    .filter(a => `${personById(a.candidateId).name} ${jobById(a.jobId)?.title} ${jobById(a.jobId)?.code}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <AppModal open={open} onCancel={onClose} tone="plain" size="md" density="compact"
      icon={mode === 'candidate' ? <UserRound className="h-4 w-4" /> : <MessageSquareText className="h-4 w-4" />}
      title={mode === 'candidate' ? 'Message a candidate' : 'Message an employee'}
      subtitle={mode === 'candidate' ? 'Pick the application — each job application has its own chat.' : 'Start a private conversation.'}>
      <div className="space-y-3">
        {searchBox(q, setQ, mode === 'candidate' ? 'Search candidate, job or JD number' : 'Search employees')}
        <ul className="max-h-80 space-y-0.5 overflow-y-auto">
          {mode === 'employee' && employees.map(p => (
            <li key={p.id}><button type="button" onClick={() => onStart(p.id)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-gray-50">
              <Avatar person={p} size="sm" />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-gray-900">{p.name}</span><span className="block truncate text-xs text-gray-500">{ROLE_LABEL[p.role]} · {p.title} · {PRESENCE_LABEL[p.presence]}</span></span>
            </button></li>
          ))}
          {mode === 'candidate' && (apps.length === 0
            ? <li className="py-6 text-center tf-meta">No applications on jobs you can access.</li>
            : apps.map(a => {
              const p = personById(a.candidateId);
              const job = jobById(a.jobId)!;
              return (
                <li key={`${a.candidateId}-${a.jobId}`}><button type="button" onClick={() => onStart(a.candidateId, a.jobId)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-gray-50">
                  <Avatar person={p} size="sm" />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-gray-900">{p.name}</span><span className="block truncate text-xs text-gray-500">{job.code} · {job.title}</span></span>
                  <ApplicationStatusBadge status={a.status} />
                </button></li>
              );
            }))}
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
              <div className="mb-1 flex items-center gap-2 text-xs">
                <span className="font-medium text-gray-900">{m.authorId === me.id ? 'You' : personById(m.authorId).name}</span><span className="text-gray-500">{listTime(m.at)}</span>
                <span className="ml-auto flex gap-1">
                  <Button variant="secondary" size="sm" className="h-7 px-2 text-xs" onClick={() => onJump(m.id)}>Go to</Button>
                  {can.pin(me) && <Button variant="secondary" size="sm" className="h-7 px-2 text-xs" onClick={() => onUnpin(m.id)}>Unpin</Button>}
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
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-gray-900">{a.name}</span><span className="block text-[11px] text-gray-500">{kindLabel(a.kind)} · {a.size} · {m.authorId === me.id ? 'You' : personById(m.authorId).name} · {listTime(m.at)}</span></span>
                <Button variant="secondary" size="sm" className="h-7 px-2 text-xs" icon={<Download className="h-3.5 w-3.5" />} onClick={() => onOpenFile(a)}>Open</Button>
              </li>
            ))}</ul></div>)}
        </div>
      )}
    </AppModal>
  );
}

/* ── Attachment preview (simulated — test files have no content) ── */
export function AttachmentDialog({ a, onClose }: { a: Attachment | null; onClose: () => void }) {
  return (
    <AppModal open={!!a} onCancel={onClose} cancelLabel="Close" tone="plain" size="lg" density="compact" icon={<FolderOpen className="h-4 w-4" />} title={a?.name ?? ''} subtitle={a ? `${kindLabel(a.kind)} · ${a.size}` : ''}>
      {a && (a.kind === 'image' ? (
        // eslint-disable-next-line @next/next/no-img-element
        a.url ? <img src={a.url} alt={a.name} className="max-h-[60vh] w-full rounded-lg object-contain" /> : <div className={`h-72 rounded-lg bg-gradient-to-br ${a.tint ?? 'from-sky-200 to-indigo-200'}`} />
      ) : (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <AttachmentIcon kind={a.kind} className="h-14 w-14" />
          <p className="text-sm text-gray-700">The live app opens or downloads the file here.</p>
          <SimTag>Simulated preview</SimTag>
        </div>
      ))}
    </AppModal>
  );
}
