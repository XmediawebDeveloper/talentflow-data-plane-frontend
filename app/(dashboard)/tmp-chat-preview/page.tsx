'use client';

/* TEMP — Hiring Portal Chat test page (/tmp-chat-preview).
   Frontend-only: temporary test data and simulated events, isolated in
   components/chat-preview/. Nothing here calls an API or touches the live
   /chat page. Layout follows the container (the preview frame), so the
   Desktop / Laptop / Tablet / Mobile / 320 buttons show each breakpoint:
     < 768   one panel at a time + bottom navigation
     768+    two panels (list with section tabs · chat)
     1024+   compact three panels (icon rail · list · chat)
     1280+   full three panels (sidebar · list · chat) */

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, MessageSquareText, Search, Trash2, X } from 'lucide-react';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import AppModal from '@/components/ui/app-modal';
import type { Attachment, Message } from '@/components/chat-preview/types';
import { useChatPreview, titleOf, personById, jobById } from '@/components/chat-preview/useChatPreview';
import { can, isChannelAdmin } from '@/components/chat-preview/permissions';
import ChatNav, { type NavCounts, type NavSection } from '@/components/chat-preview/ChatNav';
import ConversationList from '@/components/chat-preview/ConversationList';
import ChatHeader from '@/components/chat-preview/ChatHeader';
import MessageList from '@/components/chat-preview/MessageList';
import Composer, { type ComposerHandle } from '@/components/chat-preview/Composer';
import TestControls, { DEVICE_WIDTH, type Device, type ListState } from '@/components/chat-preview/TestControls';
import {
  AttachmentDialog, ChannelDetailsDialog, FilesDialog, ForwardDialog, MembersDialog, NewChatDialog, PinnedDialog, ProfileDialog,
} from '@/components/chat-preview/Dialogs';
import { IconBtn } from '@/components/chat-preview/ui';

const SECTION_TITLE: Record<NavSection, string> = {
  all: 'Messages', channels: 'Job channels', employees: 'Employees', candidates: 'Candidates', archived: 'Archived',
};

type Dialog = null | 'members' | 'details' | 'profile' | 'pinned' | 'files' | 'new-employee' | 'new-candidate';

export default function ChatTestPage() {
  const chat = useChatPreview();
  const { me } = chat;

  const [device, setDevice] = useState<Device>('desktop');
  const [listState, setListState] = useState<ListState>('ready');
  const [section, setSection] = useState<NavSection>('all');
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>('ch-py');
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const [unreadStart, setUnreadStart] = useState<Record<string, string | null>>({});
  const [findOpen, setFindOpen] = useState(false);
  const [find, setFind] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reactFor, setReactFor] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [forwarding, setForwarding] = useState<Message | null>(null);
  const [deleting, setDeleting] = useState<Message[] | null>(null);
  const [viewing, setViewing] = useState<Attachment | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const composer = useRef<ComposerHandle | null>(null);

  const isCandidate = me.role === 'candidate';
  const visible = chat.visible;
  const active = visible.find(c => c.id === activeId) ?? null;

  /* Sections: what each lists, and its unread. */
  const inSection = (s: NavSection) => visible.filter(c =>
    s === 'archived' ? c.archived
      : c.archived ? false
        : s === 'all' ? true
          : s === 'channels' ? c.kind === 'channel'
            : s === 'employees' ? c.kind === 'direct'
              : c.kind === 'candidate');
  const unreadIn = (s: NavSection) => inSection(s).reduce((n, c) => n + (c.mutedBy?.includes(me.id) ? 0 : c.unreadFor?.[me.id] ?? 0), 0);
  const counts: NavCounts = { all: unreadIn('all'), channels: unreadIn('channels'), employees: unreadIn('employees'), candidates: unreadIn('candidates'), archived: unreadIn('archived') };
  const hidden: NavSection[] = isCandidate ? ['channels', 'employees', 'archived'] : [];

  const q = query.trim().toLowerCase();
  const listed = (listState === 'empty' ? [] : inSection(section))
    .filter(c => !q || titleOf(c, me.id).toLowerCase().includes(q)
      || (jobById(c.jobId)?.code.toLowerCase().includes(q) ?? false)
      || (jobById(c.jobId)?.title.toLowerCase().includes(q) ?? false)
      || c.messages.some(m => m.text.toLowerCase().includes(q)))
    .sort((a, b) => (b.messages.at(-1)?.at ?? 0) - (a.messages.at(-1)?.at ?? 0));

  /* Switching role: start from a conversation that role can see. */
  useEffect(() => {
    if (activeId && !visible.some(c => c.id === activeId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveId(visible[0]?.id ?? null);
      setSection('all');
    }
  }, [visible, activeId]);

  /* Keep the newest message in view while the reader is at the bottom. */
  useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottom) el.scrollTop = el.scrollHeight;
  }, [activeId, active?.messages.length, atBottom, active?.typingIds?.length]);

  const open = (id: string) => {
    const c = visible.find(x => x.id === id);
    if (c) {
      const unread = c.unreadFor?.[me.id] ?? 0;
      const people = c.messages.filter(m => m.authorId !== 'system');
      setUnreadStart(s => ({ ...s, [id]: unread > 0 ? people[Math.max(0, people.length - unread)]?.id ?? null : null }));
      chat.markRead(id);
    }
    setActiveId(id);
    setMobileView('chat');
    setFindOpen(false); setFind(''); setSelected(new Set()); setReplyTo(null); setEditing(null); setAtBottom(true);
  };

  const jumpTo = (id: string) => {
    setDialog(null);
    setFind(''); setFindOpen(false);
    setTimeout(() => {
      document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightId(id);
      setTimeout(() => setHighlightId(null), 1600);
    }, 50);
  };

  const incoming = () => {
    const r = chat.simulateIncoming(activeId ?? undefined);
    if (!r) { toast.error('No conversation to receive a message in'); return; }
    const c = visible.find(x => x.id === r.cid);
    if (!c || c.mutedBy?.includes(me.id)) return;
    setTimeout(() => {
      if (r.cid === activeId) { chat.markRead(r.cid); return; }
      toast(`New message from ${r.from.name}`, {
        description: c.kind === 'channel' ? `in ${titleOf(c, me.id)}` : 'Direct message',
        action: { label: 'Open', onClick: () => open(r.cid) },
      });
    }, 1700);
  };

  const deletable = (m: Message) => !!active && can.delete(me, active, m);
  const confirmDelete = (scope: 'me' | 'everyone') => {
    if (!active || !deleting) return;
    chat.remove(active.id, deleting.map(m => m.id), scope);
    toast.success(deleting.length === 1 ? 'Message deleted' : `${deleting.length} messages deleted`);
    setDeleting(null); setSelected(new Set());
  };
  const allOwn = !!deleting && deleting.every(m => m.authorId === me.id);

  const messages = (active?.messages ?? []).filter(m => !find.trim() || m.text.toLowerCase().includes(find.trim().toLowerCase()));
  const pinnedCount = active?.messages.filter(m => m.pinned && !m.deleted).length ?? 0;
  const filesCount = active?.messages.reduce((n, m) => n + (m.deleted ? 0 : m.attachments?.length ?? 0), 0) ?? 0;
  const lockedReason = !active ? undefined
    : active.archived ? (active.kind === 'channel' && isChannelAdmin(me, active) ? 'This channel is archived. Restore it from ⋮ to send messages.' : 'This conversation is archived — read only.')
      : !can.send(me, active) ? 'You can’t send messages here.' : undefined;

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-x-clip bg-white xl:bg-slate-50 dark:bg-slate-900 xl:dark:bg-slate-950">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="w-full bg-white p-4 md:p-8 xl:my-5 xl:rounded-2xl xl:shadow-2xl dark:bg-slate-900">
          <PageBreadcrumb className="mb-4" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Chat test page' }]} />

          <TestControls
            role={chat.role} onRole={r => { chat.setRole(r); setSelected(new Set()); setReplyTo(null); setEditing(null); }}
            device={device} onDevice={setDevice}
            listState={listState} onListState={setListState}
            onIncoming={incoming}
            onTyping={() => { if (active) { const other = active.memberIds.find(id => id !== me.id); if (other) { chat.setTyping(active.id, [other]); setTimeout(() => chat.setTyping(active.id, []), 3000); } } }}
            onReset={() => { chat.reset(); setActiveId('ch-py'); setSection('all'); toast.success('Test data reset'); }}
          />

          {/* Preview frame — a container, so the layout follows its width. */}
          <div className="mx-auto max-w-full transition-[width] duration-300" style={{ width: DEVICE_WIDTH[device] }}>
            <div className="@container relative flex h-[720px] max-h-[calc(100dvh-6rem)] min-h-[520px] overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">

              {/* Sidebar: full (1280+) / icon rail (1024–1279) */}
              <div className="hidden @min-[1280px]:flex"><ChatNav variant="full" section={section} onChange={setSection} unread={counts} hide={hidden} /></div>
              <div className="hidden @min-[1024px]:flex @min-[1280px]:hidden"><ChatNav variant="rail" section={section} onChange={setSection} unread={counts} hide={hidden} /></div>

              {/* List — phones: full width while the list is the view */}
              <div className={`${mobileView === 'list' ? 'flex' : 'hidden'} min-w-0 flex-1 flex-col border-r border-gray-200 dark:border-slate-700 @min-[768px]:flex @min-[768px]:w-80 @min-[768px]:flex-none @min-[1024px]:w-72 @min-[1280px]:w-80`}>
                <div className="min-h-0 flex-1">
                  <ConversationList
                    title={SECTION_TITLE[section]}
                    conversations={listed}
                    me={me}
                    activeId={activeId}
                    onOpen={open}
                    query={query}
                    onQuery={setQuery}
                    state={listState === 'loading' ? 'loading' : listState === 'error' ? 'error' : 'ready'}
                    onRetry={() => setListState('ready')}
                    nav={<div className="hidden @min-[768px]:block @min-[1024px]:hidden"><ChatNav variant="tabs" section={section} onChange={setSection} unread={counts} hide={hidden} /></div>}
                    canNewEmployee={can.startEmployeeDirect(me)}
                    canNewCandidate={can.startCandidateDirect(me)}
                    onNewEmployee={() => setDialog('new-employee')}
                    onNewCandidate={() => setDialog('new-candidate')}
                  />
                </div>
                <div className="@min-[768px]:hidden"><ChatNav variant="bottom" section={section} onChange={s => { setSection(s); setMobileView('list'); }} unread={counts} hide={hidden} /></div>
              </div>

              {/* Conversation */}
              <section
                className={`${mobileView === 'chat' ? 'flex' : 'hidden'} relative min-w-0 flex-1 flex-col bg-slate-50/60 dark:bg-slate-950/40 @min-[768px]:flex`}
                onDragOver={e => { if (active && !lockedReason) { e.preventDefault(); setDragOver(true); } }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
                onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) composer.current?.addFiles(e.dataTransfer.files); }}
              >
                {listState === 'error' ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
                    <p className="text-sm font-semibold text-gray-900">Chat is offline</p>
                    <p className="tf-meta max-w-xs">We couldn’t reach the chat service. Messages you send will wait until it is back.</p>
                  </div>
                ) : !active || listState === 'empty' ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-blue/10 text-brand-blue"><MessageSquareText className="h-7 w-7" /></span>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-50">{isCandidate ? 'Your recruiter chats' : 'Hiring chat'}</h2>
                      <p className="mx-auto mt-1 max-w-sm tf-body-secondary">{isCandidate ? 'When a recruiter messages you about an application, it appears here.' : 'Pick a job channel or a conversation. Job channels are created automatically with each job.'}</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <ChatHeader
                      c={active} me={me}
                      onBack={() => setMobileView('list')}
                      findOpen={findOpen} onFind={() => { setFindOpen(v => !v); setFind(''); }}
                      pinnedCount={pinnedCount} onPinned={() => setDialog('pinned')}
                      filesCount={filesCount} onFiles={() => setDialog('files')}
                      onDetails={() => setDialog(active.kind === 'channel' ? 'details' : 'profile')}
                      onMembers={() => setDialog('members')}
                      onMute={() => { chat.toggleMute(active.id); toast.success(active.mutedBy?.includes(me.id) ? 'Notifications on' : 'Muted'); }}
                      onArchive={v => { chat.setArchived(active.id, v); toast.success(v ? 'Archived' : 'Restored'); }}
                      onSelect={() => { const m = active.messages.find(x => !x.deleted && x.authorId !== 'system'); if (m) setSelected(new Set([m.id])); }}
                      selection={{
                        count: selected.size,
                        onClear: () => setSelected(new Set()),
                        onPin: can.pin(me) ? () => { chat.pin(active.id, [...selected], true); toast.success(`${selected.size} pinned`); setSelected(new Set()); } : undefined,
                        onDelete: () => { const ms = active.messages.filter(m => selected.has(m.id) && deletable(m)); if (!ms.length) { toast.error('You can only delete your own messages'); return; } setDeleting(ms); },
                      }}
                    />

                    {findOpen && (
                      <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                        <Search className="h-4 w-4 text-gray-400" />
                        <input autoFocus value={find} onChange={e => setFind(e.target.value)} placeholder="Search messages in this chat" aria-label="Search messages" className="h-8 min-w-0 flex-1 bg-transparent text-sm focus:outline-none" />
                        {find && <span className="shrink-0 tf-meta tabular-nums">{messages.length} found</span>}
                        <IconBtn label="Close search" onClick={() => { setFindOpen(false); setFind(''); }}><X className="h-4 w-4" /></IconBtn>
                      </div>
                    )}

                    <div className="relative flex min-h-0 flex-1 flex-col">
                      <MessageList
                        ref={scrollRef}
                        c={active} me={me} messages={messages} find={find} selected={selected}
                        unreadStartId={unreadStart[active.id]}
                        reactFor={reactFor} setReactFor={setReactFor}
                        copiedId={copiedId} highlightId={highlightId}
                        onScroll={setAtBottom}
                        actions={{
                          onReact: (m, e) => chat.react(active.id, m.id, e),
                          onReply: m => { setEditing(null); setReplyTo(m); composer.current?.focus(); },
                          onEdit: m => { setReplyTo(null); setEditing(m); },
                          onForward: m => setForwarding(m),
                          onPin: (m, v) => { chat.pin(active.id, [m.id], v); toast.success(v ? 'Pinned' : 'Unpinned'); },
                          onCopy: m => { void navigator.clipboard?.writeText(m.text).catch(() => undefined); setCopiedId(m.id); setTimeout(() => setCopiedId(null), 1500); toast.success('Copied'); },
                          onDelete: m => setDeleting([m]),
                          onToggleSelect: m => setSelected(s => { const n = new Set(s); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n; }),
                          onRetry: m => chat.send(active.id, { text: m.text, attachments: m.attachments, replyToId: m.replyToId }, m.id),
                          onOpenAttachment: a => setViewing(a),
                          onJumpTo: jumpTo,
                        }}
                      />
                      {!atBottom && (
                        <button type="button" onClick={() => { const el = scrollRef.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); }}
                          className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-md hover:bg-gray-50">
                          <ArrowDown className="h-3.5 w-3.5" />Jump to latest
                        </button>
                      )}
                    </div>

                    <Composer
                      key={`${active.id}:${editing?.id ?? 'new'}`}
                      ref={composer}
                      placeholder={active.kind === 'channel' ? `Message ${titleOf(active, me.id)}` : `Message ${titleOf(active, me.id).split(' ')[0]}`}
                      members={active.memberIds.map(personById)}
                      meId={me.id}
                      lockedReason={lockedReason}
                      replyTo={replyTo} onCancelReply={() => setReplyTo(null)}
                      editing={editing} onCancelEdit={() => setEditing(null)}
                      onSend={input => { chat.send(active.id, { ...input, replyToId: replyTo?.id }); setReplyTo(null); setAtBottom(true); }}
                      onSaveEdit={text => { if (editing) chat.edit(active.id, editing.id, text); setEditing(null); toast.success('Message edited'); }}
                    />

                    {dragOver && (
                      <div className="pointer-events-none absolute inset-2 z-30 flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-brand-blue bg-brand-blue/5 text-center text-brand-blue">
                        <span className="text-sm font-semibold">Drop files to attach</span>
                        <span className="text-xs">Images (5 MB) · PDF, Word, Excel (10 MB)</span>
                      </div>
                    )}
                  </>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>

      {/* Delete */}
      <AppModal
        open={!!deleting}
        onCancel={() => setDeleting(null)}
        tone="warning" size="sm" density="compact"
        icon={<Trash2 className="h-5 w-5" />}
        title={deleting && deleting.length > 1 ? `Delete ${deleting.length} messages?` : 'Delete message?'}
        actions={[
          ...(allOwn ? [{ label: 'Delete for me', variant: 'secondary' as const, onClick: () => confirmDelete('me') }] : []),
          { label: 'Delete for everyone', onClick: () => confirmDelete('everyone') },
        ]}
      >
        <p className="tf-body-secondary">
          {allOwn
            ? '“Delete for everyone” leaves “This message was deleted” for all members. “Delete for me” only hides it for you.'
            : 'As a channel admin you are removing someone else’s message. Everyone will see “This message was deleted”.'}
        </p>
      </AppModal>

      {active && (
        <>
          {active.kind === 'channel' && (
            <>
              <MembersDialog key={`m-${active.id}`} c={active} me={me} open={dialog === 'members'} onClose={() => setDialog(null)}
                onAdd={ids => { chat.addMembers(active.id, ids); toast.success(`${ids.length} added`); }}
                onRemove={id => { chat.removeMember(active.id, id); toast.success(`${personById(id).name} removed`); }}
                onToggleAdmin={id => chat.toggleAdmin(active.id, id)} />
              <ChannelDetailsDialog c={active} me={me} open={dialog === 'details'} onClose={() => setDialog(null)}
                onMembers={() => setDialog('members')} onPinned={() => setDialog('pinned')} onFiles={() => setDialog('files')}
                onArchive={v => { chat.setArchived(active.id, v); setDialog(null); toast.success(v ? 'Channel archived' : 'Channel restored'); }} />
            </>
          )}
          {active.kind !== 'channel' && <ProfileDialog c={active} me={me} open={dialog === 'profile'} onClose={() => setDialog(null)} onFiles={() => setDialog('files')} />}
          <PinnedDialog c={active} me={me} open={dialog === 'pinned'} onClose={() => setDialog(null)} onJump={jumpTo} onUnpin={id => chat.pin(active.id, [id], false)} />
          <FilesDialog c={active} me={me} open={dialog === 'files'} onClose={() => setDialog(null)} onOpenFile={a => setViewing(a)} />
          <ForwardDialog key={`f-${forwarding?.id ?? 'none'}`} open={!!forwarding} onClose={() => setForwarding(null)} message={forwarding} conversations={visible} me={me}
            onForward={ids => { if (forwarding) chat.forward(active.id, forwarding.id, ids); toast.success(`Forwarded to ${ids.length}`); setForwarding(null); }} />
        </>
      )}
      <NewChatDialog key={`n-${dialog}`} mode={dialog === 'new-candidate' ? 'candidate' : 'employee'} open={dialog === 'new-employee' || dialog === 'new-candidate'} onClose={() => setDialog(null)} me={me}
        onStart={(pid, jobId) => { const id = chat.startDirect(pid, jobId); setDialog(null); setSection(jobId ? 'candidates' : 'employees'); setTimeout(() => open(id), 0); }} />
      <AttachmentDialog a={viewing} onClose={() => setViewing(null)} />
    </main>
  );
}
