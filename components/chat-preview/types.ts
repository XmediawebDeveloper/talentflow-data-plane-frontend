/* Chat test page (/tmp-chat-preview) — types.
   TEST ONLY: used by the preview page and its components; nothing in the
   live app imports this folder. */

export type Role = 'super_admin' | 'hr_admin' | 'recruiter' | 'hiring_manager' | 'interviewer' | 'candidate';

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: 'Super Admin',
  hr_admin: 'HR Admin',
  recruiter: 'Recruiter',
  hiring_manager: 'Hiring Manager',
  interviewer: 'Interviewer',
  candidate: 'Candidate',
};

export type Presence = 'online' | 'away' | 'offline';

export interface Person {
  id: string;
  name: string;
  role: Role;
  title: string;
  email: string;
  presence: Presence;
  /** Employees only: the jobs they are assigned to (job channel access). */
  jobIds?: string[];
}

export interface Job {
  id: string;
  /** JD-123 */
  code: string;
  title: string;
  version: number;
  department: string;
  location: string;
}

export type ApplicationStatus = 'Applied' | 'Shortlisted' | 'Assessment' | 'AI Interview' | 'Offered' | 'Rejected';

export type AttachmentKind = 'image' | 'pdf' | 'doc' | 'xls' | 'file';
export interface Attachment {
  id: string;
  kind: AttachmentKind;
  name: string;
  size: string;
  /** Image placeholder gradient (test data has no real files). */
  tint?: string;
  /** A real local preview URL (files picked in the composer). */
  url?: string;
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

export type ConversationKind = 'channel' | 'direct' | 'candidate';

export interface Conversation {
  id: string;
  kind: ConversationKind;
  /** Channel: the job. Candidate direct: the application's job. */
  jobId?: string;
  /** Channel members (with their channel role). */
  memberIds: string[];
  /** Channel admins (besides HR / Super Admin). */
  adminIds?: string[];
  /** Direct / candidate: the two people. */
  participantIds?: [string, string];
  /** Candidate direct: application status at the time. */
  applicationStatus?: ApplicationStatus;
  description?: string;
  archived?: boolean;
  /** Per-viewer state (test data keeps one set). */
  mutedBy?: string[];
  unreadFor?: Record<string, number>;
  typingIds?: string[];
  messages: Message[];
  createdAt: number;
}
