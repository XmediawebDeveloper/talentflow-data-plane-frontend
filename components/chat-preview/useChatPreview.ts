'use client';

/* Chat test page — every interaction, simulated in local state. TEST ONLY:
   no API, no websocket; timers stand in for the server. */

import { useCallback, useMemo, useRef, useState } from 'react';
import type { Attachment, Conversation, Message, Person, Role } from './types';
import { JOBS, PEOPLE, PERSONA_BY_ROLE, seedConversations } from './testData';
import { canView } from './permissions';

/** Wall clock — outside render (handlers / timers only). */
const stamp = () => Date.now();
let seq = 0;
const uid = (p: string) => `${p}-${stamp()}-${++seq}`;

export const personById = (id: string): Person =>
  PEOPLE.find(p => p.id === id) ?? { id, name: 'Unknown user', role: 'interviewer', title: '', email: '', presence: 'offline' };
export const jobById = (id?: string) => JOBS.find(j => j.id === id);

/** A conversation's display name for this viewer. */
export function titleOf(c: Conversation, meId: string): string {
  if (c.kind === 'channel') return jobById(c.jobId)?.title ?? 'Channel';
  const other = c.participantIds?.find(id => id !== meId) ?? c.participantIds?.[1];
  return other ? personById(other).name : 'Direct';
}
export const otherOf = (c: Conversation, meId: string) => personById(c.participantIds?.find(id => id !== meId) ?? c.participantIds?.[1] ?? '');
export const lastMessageOf = (c: Conversation) => [...c.messages].reverse().find(m => !m.deleted) ?? c.messages[c.messages.length - 1];

export function useChatPreview() {
  const [conversations, setConversations] = useState<Conversation[]>(() => seedConversations(stamp()));
  const [role, setRole] = useState<Role>('recruiter');
  const meId = PERSONA_BY_ROLE[role];
  const me = personById(meId);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };

  const patch = useCallback((id: string, fn: (c: Conversation) => Conversation) => {
    setConversations(prev => prev.map(c => (c.id === id ? fn(c) : c)));
  }, []);
  const patchMessage = (cid: string, mid: string, fn: (m: Message) => Message) =>
    patch(cid, c => ({ ...c, messages: c.messages.map(m => (m.id === mid ? fn(m) : m)) }));
  const system = (cid: string, text: string) =>
    patch(cid, c => ({ ...c, messages: [...c.messages, { id: uid('sys'), authorId: 'system', text, at: stamp(), reactions: [] }] }));

  const visible = useMemo(() => conversations.filter(c => canView(me, c)), [conversations, me]);

  /* ── Messages ── */
  const send = (cid: string, input: { text: string; attachments?: Attachment[]; replyToId?: string }, retryId?: string) => {
    const text = input.text.trim();
    if (!text && !input.attachments?.length) return;
    const id = retryId ?? uid('m');
    const msg: Message = { id, authorId: meId, text, at: stamp(), reactions: [], attachments: input.attachments, replyToId: input.replyToId, status: 'sending', readBy: [] };
    patch(cid, c => ({ ...c, messages: retryId ? c.messages.map(m => (m.id === retryId ? msg : m)) : [...c.messages, msg] }));
    const fail = !retryId && /\bfail\b/i.test(text);
    later(() => patchMessage(cid, id, m => ({ ...m, status: fail ? 'failed' : 'sent' })), 800);
    if (fail) return;
    // Read receipts: the others read it a moment later.
    later(() => {
      setConversations(prev => prev.map(c => {
        if (c.id !== cid) return c;
        const readers = c.memberIds.filter(x => x !== meId && personById(x).presence !== 'offline');
        return { ...c, messages: c.messages.map(m => (m.id === id ? { ...m, readBy: readers } : m)) };
      }));
    }, 2600);
  };
  const edit = (cid: string, mid: string, text: string) => patchMessage(cid, mid, m => ({ ...m, text: text.trim(), editedAt: stamp() }));
  const remove = (cid: string, mids: string[], scope: 'me' | 'everyone') =>
    patch(cid, c => ({
      ...c,
      messages: scope === 'me'
        ? c.messages.filter(m => !mids.includes(m.id))
        : c.messages.map(m => (mids.includes(m.id) ? { ...m, deleted: true, text: '', attachments: undefined, reactions: [], pinned: false } : m)),
    }));
  const react = (cid: string, mid: string, emoji: string) => patchMessage(cid, mid, m => {
    const r = m.reactions.find(x => x.emoji === emoji);
    let reactions = m.reactions;
    if (!r) reactions = [...m.reactions, { emoji, userIds: [meId] }];
    else if (r.userIds.includes(meId)) reactions = m.reactions.map(x => (x.emoji === emoji ? { ...x, userIds: x.userIds.filter(u => u !== meId) } : x)).filter(x => x.userIds.length);
    else reactions = m.reactions.map(x => (x.emoji === emoji ? { ...x, userIds: [...x.userIds, meId] } : x));
    return { ...m, reactions };
  });
  const pin = (cid: string, mids: string[], value: boolean) =>
    patch(cid, c => ({ ...c, messages: c.messages.map(m => (mids.includes(m.id) ? { ...m, pinned: value } : m)) }));
  const forward = (fromCid: string, mid: string, toCids: string[]) => {
    const from = conversations.find(c => c.id === fromCid);
    const src = from?.messages.find(m => m.id === mid);
    if (!src) return;
    const author = src.authorId === 'system' ? 'System' : personById(src.authorId).name;
    toCids.forEach(cid => patch(cid, c => ({
      ...c,
      messages: [...c.messages, { id: uid('fw'), authorId: meId, text: src.text, attachments: src.attachments, forwardedFrom: author, at: stamp(), reactions: [], status: 'sent', readBy: [] }],
    })));
  };

  /* ── Conversations ── */
  const markRead = (cid: string) => patch(cid, c => ({ ...c, unreadFor: { ...c.unreadFor, [meId]: 0 } }));
  const toggleMute = (cid: string) => patch(cid, c => {
    const muted = c.mutedBy?.includes(meId);
    return { ...c, mutedBy: muted ? c.mutedBy!.filter(x => x !== meId) : [...(c.mutedBy ?? []), meId] };
  });
  const setArchived = (cid: string, archived: boolean) => {
    patch(cid, c => ({ ...c, archived }));
    const c = conversations.find(x => x.id === cid);
    if (c?.kind === 'channel') system(cid, `${me.name} ${archived ? 'archived' : 'restored'} the channel`);
  };
  const addMembers = (cid: string, ids: string[]) => {
    patch(cid, c => ({ ...c, memberIds: Array.from(new Set([...c.memberIds, ...ids])) }));
    system(cid, `${me.name} added ${ids.map(id => personById(id).name).join(', ')}`);
  };
  const removeMember = (cid: string, id: string) => {
    patch(cid, c => ({ ...c, memberIds: c.memberIds.filter(x => x !== id), adminIds: (c.adminIds ?? []).filter(x => x !== id) }));
    system(cid, `${me.name} removed ${personById(id).name}`);
  };
  const toggleAdmin = (cid: string, id: string) => patch(cid, c => {
    const isAdmin = c.adminIds?.includes(id);
    return { ...c, adminIds: isAdmin ? c.adminIds!.filter(x => x !== id) : [...(c.adminIds ?? []), id] };
  });
  /** Open (or start) a direct chat; a candidate chat is per job application. */
  const startDirect = (otherId: string, jobId?: string): string => {
    const other = personById(otherId);
    const kind = other.role === 'candidate' ? 'candidate' : 'direct';
    const existing = conversations.find(c =>
      c.kind === kind && c.participantIds?.includes(meId) && c.participantIds?.includes(otherId) && (kind === 'direct' || c.jobId === jobId));
    if (existing) return existing.id;
    const c: Conversation = {
      id: uid('dm'), kind, jobId, participantIds: [meId, otherId], memberIds: [meId, otherId], createdAt: stamp(),
      applicationStatus: kind === 'candidate' ? 'Applied' : undefined, unreadFor: {}, messages: [],
    };
    setConversations(prev => [c, ...prev]);
    return c.id;
  };

  /* ── Simulation ── */
  /** A message from someone else, into a conversation this viewer can see. */
  const simulateIncoming = (preferNot?: string): { cid: string; from: Person } | null => {
    const pool = visible.filter(c => !c.archived && c.id !== preferNot);
    const c = pool[Math.floor(Math.random() * pool.length)] ?? visible.find(x => !x.archived);
    if (!c) return null;
    const others = c.memberIds.filter(x => x !== meId);
    const fromId = others[Math.floor(Math.random() * others.length)];
    if (!fromId) return null;
    const lines = ['Quick update — the panel confirmed Thursday 3 PM.', 'Shared the feedback form, please check.', 'Can you take a look when free? 🙏', 'Candidate accepted the interview slot.'];
    const text = lines[Math.floor(Math.random() * lines.length)];
    patch(c.id, x => ({ ...x, typingIds: [fromId] }));
    later(() => patch(c.id, x => ({
      ...x,
      typingIds: [],
      unreadFor: { ...x.unreadFor, [meId]: (x.unreadFor?.[meId] ?? 0) + 1 },
      messages: [...x.messages, { id: uid('in'), authorId: fromId, text, at: stamp(), reactions: [] }],
    })), 1600);
    return { cid: c.id, from: personById(fromId) };
  };
  const setTyping = (cid: string, ids: string[]) => patch(cid, c => ({ ...c, typingIds: ids }));
  const reset = () => { timers.current.forEach(clearTimeout); timers.current = []; setConversations(seedConversations(stamp())); };

  return {
    conversations, visible, role, setRole, me,
    send, edit, remove, react, pin, forward,
    markRead, toggleMute, setArchived, addMembers, removeMember, toggleAdmin, startDirect,
    simulateIncoming, setTyping, reset,
  };
}

export type ChatPreview = ReturnType<typeof useChatPreview>;
