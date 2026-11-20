'use client';

/* Chat test page — the message list: own right / others left, sender name +
   avatar in channels, centred system notices and date separators, replies,
   edits, forwards, @mentions, attachments, reactions, read receipts and the
   per-message actions. TEST ONLY. */

import { forwardRef, type ReactNode } from 'react';
import {
  AlertCircle, Check, CheckCheck, Clock, Copy, CornerUpLeft, Download, Forward, MoreHorizontal, Pencil, Pin, PinOff,
  Smile, SquareCheck, Trash2,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { Attachment, Conversation, Message, Person } from './types';
import { PEOPLE } from './testData';
import { AttachmentIcon, Avatar, IconBtn, MIN, dayKey, dayLabel, kindLabel, timeOf } from './ui';
import { personById } from './useChatPreview';
import { can } from './permissions';

export const QUICK_EMOJIS = ['👍', '❤️', '😄', '🎉', '👀', '✅'];

/** @Mentions (and a search match) inside a message. */
function renderText(text: string, meId: string, find: string): ReactNode {
  const names = PEOPLE.map(p => p.name.split(' ')[0]).sort((a, b) => b.length - a.length);
  const re = new RegExp(`(@(?:${names.join('|')})\\b)`, 'g');
  return text.split(re).map((part, i) => {
    if (re.test(part)) {
      re.lastIndex = 0;
      const mentioned = PEOPLE.find(p => `@${p.name.split(' ')[0]}` === part);
      const isMe = mentioned?.id === meId;
      return <span key={i} className={`rounded px-0.5 font-semibold ${isMe ? 'bg-amber-200/80 text-amber-900' : 'bg-brand-blue/10 text-brand-blue'}`}>{part}</span>;
    }
    re.lastIndex = 0;
    const q = find.trim().toLowerCase();
    const at = q ? part.toLowerCase().indexOf(q) : -1;
    if (at < 0) return <span key={i}>{part}</span>;
    return <span key={i}>{part.slice(0, at)}<mark className="rounded bg-amber-200 px-0.5 text-inherit">{part.slice(at, at + q.length)}</mark>{part.slice(at + q.length)}</span>;
  });
}

function AttachmentCard({ a, mine, onOpen }: { a: Attachment; mine: boolean; onOpen: (a: Attachment) => void }) {
  if (a.kind === 'image') {
    return (
      <button type="button" onClick={() => onOpen(a)} className="block w-60 max-w-full overflow-hidden rounded-xl border border-gray-200 bg-white text-left dark:border-slate-700 dark:bg-slate-900">
        {a.url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={a.url} alt={a.name} className="h-36 w-full object-cover" />
          : <span className={`block h-36 bg-gradient-to-br ${a.tint ?? 'from-sky-200 to-indigo-200'}`} />}
        <span className="flex items-center gap-2 px-3 py-2"><span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-800 dark:text-slate-200">{a.name}</span><span className="shrink-0 text-[11px] text-gray-500">{a.size}</span></span>
      </button>
    );
  }
  return (
    <div className={`flex w-64 max-w-full items-center gap-3 rounded-xl border px-3 py-2.5 ${mine ? 'border-brand-blue/20 bg-white' : 'border-gray-200 bg-white'} dark:border-slate-700 dark:bg-slate-900`}>
      <AttachmentIcon kind={a.kind} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-gray-900 dark:text-slate-100">{a.name}</span>
        <span className="block text-[11px] text-gray-500">{kindLabel(a.kind)} · {a.size}</span>
      </span>
      <IconBtn label={`Download ${a.name} (simulated)`} onClick={() => onOpen(a)}><Download className="h-4 w-4" /></IconBtn>
    </div>
  );
}

export interface MessageActions {
  onReact: (m: Message, emoji: string) => void;
  onReply: (m: Message) => void;
  onEdit: (m: Message) => void;
  onForward: (m: Message) => void;
  onPin: (m: Message, value: boolean) => void;
  onCopy: (m: Message) => void;
  onDelete: (m: Message) => void;
  onToggleSelect: (m: Message) => void;
  onRetry: (m: Message) => void;
  onOpenAttachment: (a: Attachment) => void;
  onJumpTo: (id: string) => void;
}

const MessageList = forwardRef<HTMLDivElement, {
  c: Conversation;
  me: Person;
  messages: Message[];
  find: string;
  selected: Set<string>;
  /** First unread message (the "New messages" divider). */
  unreadStartId?: string | null;
  reactFor: string | null;
  setReactFor: (id: string | null) => void;
  copiedId: string | null;
  highlightId: string | null;
  onScroll: (atBottom: boolean) => void;
  actions: MessageActions;
}>(function MessageList({ c, me, messages, find, selected, unreadStartId, reactFor, setReactFor, copiedId, highlightId, onScroll, actions }, ref) {
  const selecting = selected.size > 0;
  const byId = new Map(c.messages.map(m => [m.id, m]));
  const othersCount = c.memberIds.filter(id => id !== me.id).length;
  const lastOwnId = [...messages].reverse().find(m => m.authorId === me.id && !m.deleted)?.id;

  return (
    <div ref={ref} onScroll={e => { const el = e.currentTarget; onScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 80); }}
      className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 @min-[768px]:px-5" aria-live="polite">
      {messages.length === 0 && (
        <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
          <span className="text-3xl">💬</span>
          <p className="text-sm font-medium text-gray-700">{find ? 'No messages match your search' : 'No messages yet'}</p>
          {!find && <p className="tf-meta">{c.kind === 'candidate' ? 'Start the conversation with a short, friendly note.' : 'Say hello 👋'}</p>}
        </div>
      )}

      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const next = messages[i + 1];
        const newDay = !prev || dayKey(prev.at) !== dayKey(m.at);
        const sep = newDay && (
          <div className="my-4 flex items-center gap-3" role="separator">
            <span className="h-px flex-1 bg-gray-200 dark:bg-slate-700" />
            <span className="rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-gray-600 dark:border-slate-700 dark:bg-slate-900">{dayLabel(m.at)}</span>
            <span className="h-px flex-1 bg-gray-200 dark:bg-slate-700" />
          </div>
        );
        const unreadDivider = m.id === unreadStartId && !find && (
          <div className="my-3 flex items-center gap-3" role="separator" aria-label="New messages">
            <span className="h-px flex-1 bg-brand-orange/50" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-orange-deep">New messages</span>
            <span className="h-px flex-1 bg-brand-orange/50" />
          </div>
        );

        /* System notice — centred. */
        if (m.authorId === 'system') {
          return (
            <div key={m.id}>
              {sep}{unreadDivider}
              <p className="my-3 text-center"><span className="inline-block max-w-full rounded-full bg-gray-100 px-3 py-1 text-[11px] text-gray-600 dark:bg-slate-800 dark:text-slate-300">{m.text} · {timeOf(m.at)}</span></p>
            </div>
          );
        }

        const mine = m.authorId === me.id;
        const author = personById(m.authorId);
        const runPrev = !!prev && !newDay && prev.authorId === m.authorId && m.at - prev.at < 5 * MIN && m.id !== unreadStartId;
        const runNext = !!next && dayKey(next.at) === dayKey(m.at) && next.authorId === m.authorId && next.at - m.at < 5 * MIN && next.id !== unreadStartId;
        const first = !runPrev;
        const last = !runNext;
        const sel = selected.has(m.id);
        const reply = m.replyToId ? byId.get(m.replyToId) : undefined;
        const readers = m.readBy ?? [];
        const readAll = readers.length >= othersCount && othersCount > 0;

        const receipt = mine && (
          m.status === 'sending' ? <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />Sending…</span>
            : m.status === 'failed' ? (
              <span className="inline-flex items-center gap-1 text-destructive"><AlertCircle className="h-3 w-3" />Not sent ·
                <button type="button" className="font-medium underline" onClick={() => actions.onRetry(m)}>Retry</button></span>
            ) : readers.length === 0 ? <Check className="h-3.5 w-3.5" aria-label="Sent" />
              : <CheckCheck className={`h-3.5 w-3.5 ${readAll ? 'text-brand-blue' : ''}`} aria-label={readAll ? 'Read' : 'Delivered'} />
        );

        return (
          <div key={m.id} id={`msg-${m.id}`}>
            {sep}{unreadDivider}
            <div
              tabIndex={0}
              onClick={() => { if (selecting && !m.deleted) actions.onToggleSelect(m); }}
              className={`group relative flex gap-2.5 rounded-lg px-1 outline-none transition-colors ${first ? 'mt-3' : 'mt-0.5'} ${mine ? 'flex-row-reverse' : ''} ${selecting && !m.deleted ? 'cursor-pointer' : ''} ${sel ? 'bg-brand-blue/[0.06]' : ''} ${highlightId === m.id ? 'bg-amber-100/70' : ''}`}
            >
              {selecting && (
                <span className={`mt-2 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${sel ? 'border-brand-blue bg-brand-blue text-white' : 'border-gray-300 bg-white'}`}>{sel && <Check className="h-3 w-3" />}</span>
              )}
              {!mine && <span className="w-8 shrink-0">{first && <Avatar person={author} size="sm" />}</span>}

              <div className={`flex min-w-0 max-w-[82%] flex-col @min-[768px]:max-w-[72%] ${mine ? 'items-end' : 'items-start'}`}>
                {/* Sender line — channels show who; everyone shows when. */}
                {first && !mine && (
                  <span className="mb-1 flex flex-wrap items-baseline gap-x-1.5 text-xs">
                    {c.kind === 'channel' && <span className="font-semibold text-gray-900 dark:text-slate-100">{author.name}</span>}
                    {c.kind === 'channel' && <span className="text-gray-500">{author.title}</span>}
                    <span className="text-gray-500">{c.kind === 'channel' ? '· ' : ''}{timeOf(m.at)}</span>
                  </span>
                )}

                {m.forwardedFrom && <span className="mb-0.5 inline-flex items-center gap-1 text-[11px] italic text-gray-500"><Forward className="h-3 w-3" />Forwarded from {m.forwardedFrom}</span>}

                {m.deleted ? (
                  <span className="rounded-2xl border border-dashed border-gray-300 px-3 py-2 text-sm italic text-gray-500">This message was deleted</span>
                ) : (
                  <>
                    {(m.text || reply) && (
                      <div className={`max-w-full break-words px-3.5 py-2 text-sm leading-relaxed ${
                        mine ? `bg-brand-blue text-white ${first ? 'rounded-2xl rounded-tr-md' : 'rounded-2xl rounded-r-md'}`
                          : `border border-gray-200 bg-white text-gray-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${first ? 'rounded-2xl rounded-tl-md' : 'rounded-2xl rounded-l-md'}`
                      } ${m.pinned ? 'ring-2 ring-amber-300/70' : ''}`}>
                        {reply && (
                          <button type="button" onClick={e => { e.stopPropagation(); actions.onJumpTo(reply.id); }}
                            className={`mb-1.5 block w-full rounded-lg border-l-2 px-2 py-1 text-left text-xs ${mine ? 'border-white/70 bg-white/15 text-white/90' : 'border-brand-blue bg-brand-blue/5 text-gray-600'}`}>
                            <span className="block font-semibold">{reply.authorId === me.id ? 'You' : reply.authorId === 'system' ? 'System' : personById(reply.authorId).name}</span>
                            <span className="line-clamp-2">{reply.deleted ? 'Message deleted' : reply.text || reply.attachments?.[0]?.name}</span>
                          </button>
                        )}
                        {m.text && <span className="whitespace-pre-wrap">{renderText(m.text, me.id, find)}</span>}
                      </div>
                    )}
                    {m.attachments?.length ? (
                      <div className={`mt-1 flex flex-col gap-1 ${mine ? 'items-end' : 'items-start'}`}>
                        {m.attachments.map(a => <AttachmentCard key={a.id} a={a} mine={mine} onOpen={actions.onOpenAttachment} />)}
                      </div>
                    ) : null}
                  </>
                )}

                {m.reactions.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {m.reactions.map(r => {
                      const minePick = r.userIds.includes(me.id);
                      return (
                        <button key={r.emoji} type="button" onClick={e => { e.stopPropagation(); actions.onReact(m, r.emoji); }}
                          title={r.userIds.map(id => (id === me.id ? 'You' : personById(id).name)).join(', ')}
                          className={`inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs ${minePick ? 'border-brand-blue/40 bg-brand-blue/10 text-brand-blue' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'}`}>
                          <span>{r.emoji}</span><span className="tabular-nums">{r.userIds.length}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Meta on the last of a run: You · time ✓✓, edited, pinned */}
                {last && !m.deleted && (
                  <span className={`mt-1 flex flex-wrap items-center gap-1 text-[11px] text-gray-500 ${mine ? 'justify-end' : ''}`}>
                    {mine && <span>You · {timeOf(m.at)}</span>}
                    {!mine && !first && <span>{timeOf(m.at)}</span>}
                    {m.editedAt && <span>· edited</span>}
                    {m.pinned && <Pin className="h-3 w-3 text-amber-500" aria-label="Pinned" />}
                    {receipt}
                    {mine && m.id === lastOwnId && c.kind === 'channel' && readers.length > 0 && (
                      <span title={readers.map(id => personById(id).name).join(', ')}>· Seen by {readAll ? 'everyone' : readers.length}</span>
                    )}
                  </span>
                )}
              </div>

              {/* Actions — on hover / focus (tap on phones) */}
              {!selecting && !m.deleted && (
                <div className={`invisible absolute -top-3 z-10 flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm group-hover:visible group-focus-within:visible dark:border-slate-700 dark:bg-slate-900 ${mine ? 'left-1' : 'right-1'}`}>
                  <div className="relative">
                    <IconBtn label="Add reaction" onClick={() => setReactFor(reactFor === m.id ? null : m.id)}><Smile className="h-4 w-4" /></IconBtn>
                    {reactFor === m.id && (
                      <div className={`absolute top-9 z-20 flex gap-0.5 rounded-full border border-gray-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900 ${mine ? 'left-0' : 'right-0'}`}>
                        {QUICK_EMOJIS.map(e => (
                          <button key={e} type="button" onClick={() => { actions.onReact(m, e); setReactFor(null); }} className="flex h-8 w-8 items-center justify-center rounded-full text-lg hover:scale-110 hover:bg-gray-100">{e}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  {can.send(me, c) && <IconBtn label="Reply" onClick={() => actions.onReply(m)}><CornerUpLeft className="h-4 w-4" /></IconBtn>}
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <button type="button" aria-label="More actions" title="More actions" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"><MoreHorizontal className="h-4 w-4" /></button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align={mine ? 'start' : 'end'} className="w-48">
                      {can.edit(me, m) && !c.archived && m.text && <DropdownMenuItem onSelect={() => actions.onEdit(m)}><Pencil className="h-4 w-4" />Edit</DropdownMenuItem>}
                      {can.forward(me) && <DropdownMenuItem onSelect={() => actions.onForward(m)}><Forward className="h-4 w-4" />Forward</DropdownMenuItem>}
                      {can.pin(me) && <DropdownMenuItem onSelect={() => actions.onPin(m, !m.pinned)}>{m.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}{m.pinned ? 'Unpin' : 'Pin'}</DropdownMenuItem>}
                      {m.text && <DropdownMenuItem onSelect={() => actions.onCopy(m)}>{copiedId === m.id ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}{copiedId === m.id ? 'Copied' : 'Copy text'}</DropdownMenuItem>}
                      {me.role !== 'candidate' && <DropdownMenuItem onSelect={() => actions.onToggleSelect(m)}><SquareCheck className="h-4 w-4" />Select</DropdownMenuItem>}
                      {can.delete(me, c, m) && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onSelect={() => actions.onDelete(m)}><Trash2 className="h-4 w-4" />{m.authorId === me.id ? 'Delete' : 'Delete (admin)'}</DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Typing */}
      {(c.typingIds ?? []).filter(id => id !== me.id).length > 0 && !find && (() => {
        const who = personById(c.typingIds!.find(id => id !== me.id)!);
        return (
          <div className="mt-3 flex items-center gap-2.5 px-1">
            <span className="w-8 shrink-0"><Avatar person={who} size="sm" /></span>
            <span className="inline-flex items-center gap-1 rounded-2xl border border-gray-200 bg-white px-3 py-2.5">
              {[0, 150, 300].map(d => <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: `${d}ms` }} />)}
            </span>
            <span className="text-xs text-gray-500">{who.name.split(' ')[0]} is typing…</span>
          </div>
        );
      })()}
    </div>
  );
});

export default MessageList;
