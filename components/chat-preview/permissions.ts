/* Chat test page — who can see and do what (spec §6). TEST ONLY. */

import type { Conversation, Message, Person } from './types';

const isAdminRole = (p: Person) => p.role === 'super_admin' || p.role === 'hr_admin';

/** Who may open a conversation at all. */
export function canView(me: Person, c: Conversation): boolean {
  if (me.role === 'candidate') return c.kind === 'candidate' && !!c.participantIds?.includes(me.id);
  if (c.kind === 'channel') return me.role === 'super_admin' || c.memberIds.includes(me.id);
  return !!c.participantIds?.includes(me.id);
}

/** Channel admin: Super Admin, HR Admin, or the channel's own admins. */
export function isChannelAdmin(me: Person, c: Conversation): boolean {
  return c.kind === 'channel' && (isAdminRole(me) || !!c.adminIds?.includes(me.id));
}

export const can = {
  manageMembers: (me: Person, c: Conversation) => isChannelAdmin(me, c),
  archiveChannel: (me: Person, c: Conversation) => isChannelAdmin(me, c),
  archiveDirect: (me: Person, c: Conversation) => c.kind !== 'channel' && me.role !== 'candidate',
  /** Recruiters start candidate chats; candidates only reply. */
  startCandidateDirect: (me: Person) => me.role === 'recruiter',
  startEmployeeDirect: (me: Person) => me.role !== 'candidate',
  /** Archived conversations are read-only. */
  send: (me: Person, c: Conversation) => !c.archived && canView(me, c),
  edit: (me: Person, m: Message) => m.authorId === me.id && !m.deleted,
  /** Own messages anywhere; others' only by a channel admin. */
  delete: (me: Person, c: Conversation, m: Message) =>
    !m.deleted && (m.authorId === me.id || (c.kind === 'channel' && isChannelAdmin(me, c))),
  pin: (me: Person) => me.role !== 'candidate',
  forward: (me: Person) => me.role !== 'candidate',
};

/** What a role is allowed, said plainly (the role switcher's summary). */
export const ROLE_SUMMARY: Record<Person['role'], string> = {
  super_admin: 'Sees every job channel; manages members; archives / restores.',
  hr_admin: 'Assigned job channels; manages members; archives / restores; deletes any message.',
  recruiter: 'Assigned job channels; starts candidate chats; channel admin where assigned.',
  hiring_manager: 'Assigned job channels; direct chats with employees.',
  interviewer: 'Assigned job channels; direct chats with employees.',
  candidate: 'Only replies in a chat a recruiter started — no channels, no new chats.',
};
