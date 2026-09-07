/**
 * Centralized date/time formatting utility for TalentFlow.
 *
 * The backend stores all datetimes as naive IST strings (e.g. "2026-03-05T14:30:00")
 * via tz_now() in app/utils/tz.py (ZoneInfo("Asia/Kolkata")).
 *
 * These functions correctly interpret backend strings as IST and format them
 * for display — no manual +5:30 offset addition needed.
 *
 * Usage:
 *   import { formatIST, formatISTDate, formatISTTime, formatISTRelative } from '@/lib/utils/dateUtils';
 */

/**
 * NOTE: these formatters accept `Date` as well as `string` - parseIST below has always
 * had an explicit `instanceof Date` branch, so callers passing a Date already worked at
 * runtime; only these signatures were too narrow.
 */

/**
 * Parse a backend datetime string as IST.
 * If the string has no timezone suffix, treats it as IST (+05:30).
 */
export function parseIST(dateString: unknown): Date {
  if (!dateString) return new Date(NaN);
  // If already a Date object, return it directly
  if (dateString instanceof Date) return dateString;
  // Coerce to string to handle numbers or other primitives
  const s = String(dateString);
  // If already has timezone info (Z, +HH:MM, -HH:MM) — parse as-is
  const hasOffset = s.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(s);
  return new Date(hasOffset ? s : s + '+05:30');
}

/**
 * Format a backend datetime string as "5 Mar 2026, 02:30 PM" (IST).
 * Returns 'N/A' for null/undefined/invalid.
 */
export function formatIST(dateString: string | Date | null | undefined): string {
  if (!dateString) return 'N/A';
  const date = parseIST(dateString);
  if (isNaN(date.getTime())) return 'N/A';

  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/**
 * Format a backend datetime string as "5 Mar 2026, 02:30:45 PM" (IST) — same as
 * formatIST but with seconds. Used where the exact second matters (e.g. the
 * assessment Start/Submission timeline) so recruiters can see precise timing.
 * Returns 'N/A' for null/undefined/invalid.
 */
export function formatISTWithSeconds(dateString: string | Date | null | undefined): string {
  if (!dateString) return 'N/A';
  const date = parseIST(dateString);
  if (isNaN(date.getTime())) return 'N/A';

  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date);
}

/**
 * Format a backend datetime string as a FIXED-WIDTH stamp: "05 Mar 2026, 02:30 PM" (IST).
 *
 * Identical to `formatIST` but with a zero-padded day, which is the whole
 * point: in a table column "5 Mar" and "05 Mar" start the month in different
 * places, and a date column is read by scanning DOWN it. `formatIST` keeps its
 * natural `day: 'numeric'` for prose and detail panels, where padding would
 * read as a typo.
 *
 * Same `parseIST` as every other formatter here, so the IST handling is not
 * duplicated - only the day field differs.
 */
/** Three-letter month names, fixed rather than localised. See below. */
const STAMP_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

export function formatISTStamp(dateString: string | Date | null | undefined): string {
  if (!dateString) return 'N/A';
  const date = parseIST(dateString);
  if (isNaN(date.getTime())) return 'N/A';

  /* Assembled from parts rather than handed to a locale pattern, because NO
     locale produces this format and the ones that come close are not stable:
     `month: 'short'` yields "Sept" (four letters) for September under current
     ICU in en-IN and en-GB alike, en-US reorders the date to "Sep 03, 2026",
     en-CA renders the meridiem "a.m.", and the meridiem's CASE differs between
     locales and between ICU versions of the same locale. A column of dates has
     to be one width and one spelling, so the month comes from the table above
     and the meridiem is upper-cased here.

     Intl is still what does the work that matters — the IST conversion and the
     12-hour clock — via numeric parts, which are locale-stable in a way the
     names are not. */
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  const month = STAMP_MONTHS[Number(get('month')) - 1] ?? get('month');
  // Strip any dots ("a.m.") before upper-casing, so every locale's spelling
  // lands on the same two characters.
  const meridiem = get('dayPeriod').replace(/\./g, '').toUpperCase();

  return `${get('day')} ${month} ${get('year')}, ${get('hour')}:${get('minute')} ${meridiem}`;
}

/**
 * Format a backend datetime string as date only: "5 Mar 2026" (IST).
 */
export function formatISTDate(dateString: string | Date | null | undefined): string {
  if (!dateString) return 'N/A';
  const date = parseIST(dateString);
  if (isNaN(date.getTime())) return 'N/A';

  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/**
 * Format a backend datetime string as time only: "02:30 PM" (IST).
 */
export function formatISTTime(dateString: string | Date | null | undefined): string {
  if (!dateString) return 'N/A';
  const date = parseIST(dateString);
  if (isNaN(date.getTime())) return 'N/A';

  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/**
 * Format a backend datetime string as relative time: "today", "1 day ago", "3 days ago".
 * Falls back to formatISTDate for dates older than 30 days.
 */
export function formatISTRelative(dateString: string | Date | null | undefined): string {
  if (!dateString) return 'N/A';
  const date = parseIST(dateString);
  if (isNaN(date.getTime())) return 'N/A';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? 's' : ''} ago`;
  return `${Math.floor(diffDays / 365)} year${Math.floor(diffDays / 365) > 1 ? 's' : ''} ago`;
}
