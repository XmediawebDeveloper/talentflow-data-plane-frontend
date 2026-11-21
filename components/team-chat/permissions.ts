/* Team Chat — who can see and do what: tenant admins manage every team; a
   team's own admins (its creator) manage that team. */

import type { Conversation, Message, Person } from './types';

/** Who may open a conversation. */
export function canView(me: Person, c: Conversation): boolean {
  if (c.kind === 'team') return me.isAdmin || c.memberIds.includes(me.id);
  return !!c.participantIds?.includes(me.id);
}

/** Team admin: a tenant admin, or one of the team's admins. */
export function isTeamAdmin(me: Person, c: Conversation): boolean {
  return c.kind === 'team' && (me.isAdmin || !!c.adminIds?.includes(me.id));
}

export const can = {
  manageMembers: (me: Person, c: Conversation) => isTeamAdmin(me, c),
  archiveTeam: (me: Person, c: Conversation) => isTeamAdmin(me, c),
  archiveDirect: (_me: Person, c: Conversation) => c.kind === 'direct',
  startDirect: () => true,
  /** Anyone can create a team (and becomes its admin). */
  createTeam: () => true,
  /** Archived conversations are read-only. */
  send: (me: Person, c: Conversation) => !c.archived && canView(me, c),
  edit: (me: Person, m: Message) => m.authorId === me.id && !m.deleted,
  /** Own messages anywhere; others' only by a team admin. */
  delete: (me: Person, c: Conversation, m: Message) =>
    !m.deleted && (m.authorId === me.id || (c.kind === 'team' && isTeamAdmin(me, c))),
  pin: () => true,
  forward: () => true,
};
