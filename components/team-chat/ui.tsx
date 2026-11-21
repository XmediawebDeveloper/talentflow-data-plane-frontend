'use client';

/* Team Chat — small shared pieces. */

import type { ReactNode } from 'react';
import {
  FileSpreadsheet, FileText, FileType2, File as FileIcon, Image as ImageIcon, UsersRound, Archive,
  Briefcase, Handshake, Receipt, Search, CalendarDays, GraduationCap, Megaphone, Code2, Building2, type LucideIcon,
} from 'lucide-react';
import NameAvatar from '@/components/ui/name-avatar';
import type { AttachmentKind, Person, Presence, TeamIcon } from './types';

export const MIN = 60_000;

export const timeOf = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
export const dayKey = (t: number) => new Date(t).toDateString();
export function dayLabel(t: number) {
  const d = new Date(t);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' });
}
/** List timestamp: a time today, "Yesterday", else a short date. */
export function listTime(t: number) {
  const d = new Date(t);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return timeOf(t);
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export const PRESENCE_DOT: Record<Presence, string> = {
  online: 'bg-emerald-500',
  away: 'bg-amber-400',
  offline: 'bg-gray-300 dark:bg-slate-600',
};
export const PRESENCE_LABEL: Record<Presence, string> = { online: 'Online', away: 'Away', offline: 'Offline' };

export function Avatar({ person, size = 'md', presence = true }: { person: Person; size?: 'xs' | 'sm' | 'md' | 'lg'; presence?: boolean }) {
  return (
    <span className="relative inline-flex shrink-0">
      <NameAvatar name={person.name} size={size} userId={person.id} title={person.name} src={person.avatarUrl} />
      {presence && person.presence && (
        <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-slate-900 ${PRESENCE_DOT[person.presence]}`} />
      )}
    </span>
  );
}

/** Team icons — hiring / workplace themed; one is picked per team. */
export const TEAM_ICONS: { key: TeamIcon; label: string; Icon: LucideIcon }[] = [
  { key: 'users', label: 'People', Icon: UsersRound },
  { key: 'briefcase', label: 'Hiring', Icon: Briefcase },
  { key: 'handshake', label: 'HR / Onboarding', Icon: Handshake },
  { key: 'search', label: 'Sourcing', Icon: Search },
  { key: 'calendar', label: 'Interviews', Icon: CalendarDays },
  { key: 'graduation', label: 'Campus', Icon: GraduationCap },
  { key: 'receipt', label: 'Billing', Icon: Receipt },
  { key: 'megaphone', label: 'Employer brand', Icon: Megaphone },
  { key: 'code', label: 'Engineering', Icon: Code2 },
  { key: 'building', label: 'Office / Admin', Icon: Building2 },
];
export const teamIconOf = (key?: TeamIcon) => (TEAM_ICONS.find(t => t.key === key) ?? TEAM_ICONS[0]).Icon;
/* The tile glyphs, built once (a component picked during render would remount each time). */
const TEAM_GLYPH = Object.fromEntries(TEAM_ICONS.map(({ key, Icon }) => [key, <Icon key={key} className="h-4 w-4" />])) as Record<TeamIcon, ReactNode>;

export function TeamTile({ archived, size = 'md', active, icon }: { archived?: boolean; size?: 'sm' | 'md'; active?: boolean; icon?: TeamIcon }) {
  const box = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';
  return (
    <span className={`inline-flex ${box} shrink-0 items-center justify-center rounded-lg ${
      archived ? 'bg-gray-100 text-gray-500 dark:bg-slate-800' : active ? 'bg-brand-blue text-white' : 'bg-brand-blue/10 text-brand-blue'
    }`}>
      {archived ? <Archive className="h-4 w-4" /> : TEAM_GLYPH[icon ?? 'users']}
    </span>
  );
}

/** "Last seen today at 10:32 AM" — from the last login (no live presence API). */
export function lastSeenLabel(p: Person, meId?: string): string {
  if (p.id === meId || p.presence === 'online') return 'Online';
  if (!p.lastSeen) return 'Not logged in yet';
  const mins = Math.round((Date.now() - p.lastSeen) / MIN);
  if (mins < 5) return 'Online';
  if (mins < 60) return `Last seen ${mins} min ago`;
  const d = new Date(p.lastSeen);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return `Last seen today at ${timeOf(p.lastSeen)}`;
  if (d.toDateString() === y.toDateString()) return `Last seen yesterday at ${timeOf(p.lastSeen)}`;
  return `Last seen ${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} at ${timeOf(p.lastSeen)}`;
}

const KIND_ICON: Record<AttachmentKind, { Icon: typeof FileIcon; tone: string; label: string }> = {
  image: { Icon: ImageIcon, tone: 'bg-brand-blue/10 text-brand-blue', label: 'Image' },
  pdf: { Icon: FileType2, tone: 'bg-red-50 text-red-600', label: 'PDF' },
  doc: { Icon: FileText, tone: 'bg-blue-50 text-blue-600', label: 'Word' },
  xls: { Icon: FileSpreadsheet, tone: 'bg-emerald-50 text-emerald-600', label: 'Excel' },
  file: { Icon: FileIcon, tone: 'bg-gray-100 text-gray-600', label: 'File' },
};
export function AttachmentIcon({ kind, className = '' }: { kind: AttachmentKind; className?: string }) {
  const { Icon, tone } = KIND_ICON[kind];
  return <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone} ${className}`}><Icon className="h-4 w-4" /></span>;
}
export const kindLabel = (k: AttachmentKind) => KIND_ICON[k].label;
export function kindOf(fileName: string, mime = ''): AttachmentKind {
  const n = fileName.toLowerCase();
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/.test(n)) return 'image';
  if (n.endsWith('.pdf')) return 'pdf';
  if (/\.(docx?|rtf)$/.test(n)) return 'doc';
  if (/\.(xlsx?|csv)$/.test(n)) return 'xls';
  return 'file';
}
export const fileSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export function IconBtn({ label, onClick, active, children, badge, disabled, className = '' }: {
  label: string; onClick?: () => void; active?: boolean; children: ReactNode; badge?: number; disabled?: boolean; className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      className={`relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30 disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'bg-brand-blue/10 text-brand-blue' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-slate-400 dark:hover:bg-slate-800'
      } ${className}`}
    >
      {children}
      {!!badge && (
        <span className="absolute -right-1 -top-1 min-w-[1rem] rounded-full bg-brand-blue px-1 text-center text-[10px] font-semibold leading-4 text-white">{badge > 99 ? '99+' : badge}</span>
      )}
    </button>
  );
}
