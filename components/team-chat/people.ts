/* Team Chat — who is who. The chat page registers its people (active users
   from User Management plus every chat member) once per render; the chat
   components look names, avatars and presence up here by id. */

import type { Conversation, Person } from './types';

let PEOPLE: Person[] = [];
export const allPeople = () => PEOPLE;
/** The chat page hands the registry its people. */
export const registerPeople = (list: Person[]) => { PEOPLE = list; };
export const personById = (id: string): Person =>
  PEOPLE.find(p => p.id === id) ?? { id, name: 'Former user', roleName: '', email: '', isAdmin: false };

/** A team's name, or the other person's name in a direct chat. */
export function titleOf(c: Conversation, meId: string): string {
  if (c.kind === 'team') return c.name ?? 'Team';
  const other = c.participantIds?.find(id => id !== meId) ?? c.participantIds?.[1];
  return other ? personById(other).name : 'Direct';
}
export const otherOf = (c: Conversation, meId: string) => personById(c.participantIds?.find(id => id !== meId) ?? c.participantIds?.[1] ?? '');
export const lastMessageOf = (c: Conversation) => [...c.messages].reverse().find(m => !m.deleted) ?? c.messages[c.messages.length - 1];
