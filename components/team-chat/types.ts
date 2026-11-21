/* Team Chat — the UI's types. The chat page maps the live API (channels,
   messages, users) into these. */

export type Presence = 'online' | 'away' | 'offline';

export interface Person {
  id: string;
  name: string;
  /** RBAC role name, as User Management shows it. */
  roleName: string;
  email: string;
  /** Tenant admin — manages every team. */
  isAdmin: boolean;
  avatarUrl?: string;
  /** 'online' from the chat members' is_online. */
  presence?: Presence;
  /** When they were last seen (ms) — User Management's last login. */
  lastSeen?: number;
}

export type AttachmentKind = 'image' | 'pdf' | 'doc' | 'xls' | 'file';
export interface Attachment {
  id: string;
  kind: AttachmentKind;
  name: string;
  size: string;
  /** Image placeholder gradient (when there is no URL). */
  tint?: string;
  /** The image / file URL (a local preview while picked in the composer). */
  url?: string;
  /** The picked file itself (live chat uploads it). */
  file?: File;
}

export interface Reaction { emoji: string; userIds: string[] }

export interface Message {
  id: string;
  /** 'system' for centred notices ("Priya added Arun"). */
  authorId: string | 'system';
  text: string;
  at: number;
  reactions: Reaction[];
  attachments?: Attachment[];
  replyToId?: string;
  editedAt?: number;
  forwardedFrom?: string;
  pinned?: boolean;
  deleted?: boolean;
  status?: 'sending' | 'sent' | 'failed';
  /** Who has read it (read receipts). */
  readBy?: string[];
}

export type ConversationKind = 'team' | 'direct';

/** The icon a team shows (picked when it is created or edited). */
export type TeamIcon = 'users' | 'briefcase' | 'handshake' | 'receipt' | 'search' | 'calendar' | 'graduation' | 'megaphone' | 'code' | 'building';

export interface Conversation {
  id: string;
  kind: ConversationKind;
  /** Team: its name ("People Integra", "Billing Team"). */
  name?: string;
  /** Team: its icon. */
  icon?: TeamIcon;
  description?: string;
  /** Team: who created it. */
  createdBy?: string;
  memberIds: string[];
  /** Team admins (besides tenant admins). The creator is one. */
  adminIds?: string[];
  /** Direct: the two people. */
  participantIds?: [string, string];
  archived?: boolean;
  mutedBy?: string[];
  unreadFor?: Record<string, number>;
  typingIds?: string[];
  messages: Message[];
  createdAt: number;
}
