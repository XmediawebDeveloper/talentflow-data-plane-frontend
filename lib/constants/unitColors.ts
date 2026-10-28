/**
 * One colour per unit type, shared by the Team Usage and Team Analytics tabs —
 * they used to disagree (AS was purple in one, teal and green in the other).
 * Same hues as Team Usage's dots: blue-500, purple-500, success, orange-500.
 */
import { Upload, FileSearch, ClipboardCheck, Video, BarChart3, type LucideIcon } from 'lucide-react';

export type UnitKey = 'RS' | 'AS' | 'AIU' | 'RU';

/** Display order on the team usage screens. */
export const UNIT_KEYS: readonly UnitKey[] = ['RU', 'RS', 'AS', 'AIU'];

export const UNIT_LABELS: Record<UnitKey, string> = {
  RS: 'Resume Scoring',
  AS: 'AI Assessment',
  AIU: 'AI Interview',
  RU: 'Resume Units',
};

/** Fill colour for charts (CSS colour values, so they work as SVG fills). */
export const UNIT_CHART_COLOR: Record<UnitKey, string> = {
  RS: 'var(--raw-3b82f6)',
  AS: '#a855f7',
  AIU: 'var(--success)',
  RU: 'var(--raw-f97316)',
};

/** One icon per unit type (and the total) — the same on every team usage screen. */
export const UNIT_ICON: Record<UnitKey, LucideIcon> = {
  RU: Upload,
  RS: FileSearch,
  AS: ClipboardCheck,
  AIU: Video,
};
export const TOTAL_UNITS_ICON: LucideIcon = BarChart3;

/** Text colour classes for the same hues. */
export const UNIT_TEXT_CLASS: Record<UnitKey, string> = {
  RS: 'text-blue-600 dark:text-blue-400',
  AS: 'text-purple-600 dark:text-purple-400',
  AIU: 'text-success',
  RU: 'text-orange-600 dark:text-orange-400',
};
