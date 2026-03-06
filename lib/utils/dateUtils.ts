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
 * Parse a backend datetime string as IST.
 * If the string has no timezone suffix, treats it as IST (+05:30).
 */
export function parseIST(dateString: string): Date {
  if (!dateString) return new Date(NaN);
  // If already has timezone info (Z, +HH:MM, -HH:MM) — parse as-is
  const hasOffset = dateString.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dateString);
  return new Date(hasOffset ? dateString : dateString + '+05:30');
}

/**
 * Format a backend datetime string as "5 Mar 2026, 02:30 PM" (IST).
 * Returns 'N/A' for null/undefined/invalid.
 */
export function formatIST(dateString: string | null | undefined): string {
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
 * Format a backend datetime string as date only: "5 Mar 2026" (IST).
 */
export function formatISTDate(dateString: string | null | undefined): string {
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
export function formatISTTime(dateString: string | null | undefined): string {
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
export function formatISTRelative(dateString: string | null | undefined): string {
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
