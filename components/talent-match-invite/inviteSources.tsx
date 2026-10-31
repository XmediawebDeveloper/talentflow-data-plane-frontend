'use client';

import { Database, Edit3, FileSpreadsheet, FolderOpen, Users, type LucideIcon } from 'lucide-react';
import { ResumeScoringIcon, TalentMatchIcon } from '@/components/icons/nav-icons';
import type { InviteCandidateSourceTab } from '@/lib/services/bulkInviteService';

/**
 * Where an invited candidate came from, drawn the way the rest of the app
 * draws it: Manual = Edit3 (the old Manual tab), brand blue · Excel =
 * FileSpreadsheet, emerald 600 (the Upload Excel button) · AI Talent Match =
 * TalentMatchIcon, brand cyan · Score Resume = ResumeScoringIcon, brand blue
 * (the dashboard tiles) · My Resumes = FolderOpen, brand orange · Shared
 * Database = Database, brand cyan (the Resume Database tabs).
 */
export type InviteSourceKey = 'manual' | 'excel' | 'page' | InviteCandidateSourceTab;

interface SourceMeta { label: string; Icon: LucideIcon | typeof TalentMatchIcon; tone: string }

export const SOURCE_META: Record<InviteSourceKey, SourceMeta> = {
  manual: { label: 'Manual', Icon: Edit3, tone: 'text-brand-blue' },
  excel: { label: 'Excel upload', Icon: FileSpreadsheet, tone: 'text-emerald-600 dark:text-emerald-400' },
  page: { label: 'From the page', Icon: Users, tone: 'text-gray-500 dark:text-slate-400' },
  'talent-match': { label: 'AI Talent Match', Icon: TalentMatchIcon, tone: 'text-brand-cyan' },
  'score-resume': { label: 'Score Resume', Icon: ResumeScoringIcon, tone: 'text-brand-blue' },
  'my-resumes': { label: 'My Resumes', Icon: FolderOpen, tone: 'text-brand-orange' },
  'internal-db': { label: 'Shared Database', Icon: Database, tone: 'text-brand-cyan' },
};

/** The order sources are listed in (summary, review chips). */
export const SOURCE_ORDER: InviteSourceKey[] = ['manual', 'excel', 'page', 'talent-match', 'score-resume', 'my-resumes', 'internal-db'];

/* The review's group labels, as the server writes them, back to a source. */
const BY_LABEL: Record<string, InviteSourceKey> = {
  manual: 'manual',
  'excel upload': 'excel',
  excel: 'excel',
  'ai talent match': 'talent-match',
  'score resume': 'score-resume',
  'resume scoring': 'score-resume',
  'my resumes': 'my-resumes',
  'shared database': 'internal-db',
  'internal db': 'internal-db',
};

/** A review group's source, from its label; null when it is none of ours. */
export const sourceFromLabel = (label: string): InviteSourceKey | null => {
  const l = label.trim().toLowerCase();
  if (BY_LABEL[l]) return BY_LABEL[l];
  if (/\.(xlsx|xls|csv)$/.test(l)) return 'excel';
  return null;
};

export function SourceIcon({ source, className = 'w-3.5 h-3.5' }: { source: InviteSourceKey | null; className?: string }) {
  const meta = source ? SOURCE_META[source] : SOURCE_META.page;
  const { Icon } = meta;
  return <Icon className={`${className} shrink-0 ${meta.tone}`} aria-hidden="true" />;
}
