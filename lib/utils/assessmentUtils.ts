/**
 * Utility functions for assessment display
 */

export interface ParsedAssessmentTitle {
  cleanTitle: string;  // Title without version text
  version: number | null;  // Extracted version number
  hasVersion: boolean;  // Whether version was found
}

/**
 * Parse assessment title to extract version number and clean title.
 *
 * Also strips any trailing "(Copy)" — historically the clone endpoint
 * appended this suffix; we no longer write it for new clones, but old
 * rows in the DB still carry it and should display cleanly. The "(Copy)"
 * suffix can appear before OR after the " - Version N" suffix depending
 * on which version of the backend created the row, so we peel both ends.
 *
 * Examples:
 *   "Java Developer - Assessment - Version 3"        → cleanTitle: "Java Developer - Assessment", version: 3
 *   "Java Developer - Assessment - Version 1 (Copy)" → cleanTitle: "Java Developer - Assessment", version: 1
 *   "Java Developer - Assessment (Copy)"             → cleanTitle: "Java Developer - Assessment", version: null
 */
export function parseAssessmentTitle(title: string): ParsedAssessmentTitle {
  const copyPattern = /\s*\(Copy\)\s*$/i;
  const versionPattern = / - Version (\d+)$/;

  // Peel "(Copy)" → then version → then "(Copy)" again (handles either order).
  let working = title.replace(copyPattern, '').trimEnd();
  const versionMatch = working.match(versionPattern);
  let version: number | null = null;
  if (versionMatch) {
    version = parseInt(versionMatch[1], 10);
    working = working.replace(versionPattern, '').trimEnd();
  }
  working = working.replace(copyPattern, '').trimEnd();

  return {
    cleanTitle: working,
    version,
    hasVersion: version !== null,
  };
}

/**
 * Get version badge text (e.g., "V1", "V2")
 */
export function getVersionBadge(version: number | null): string | null {
  return version ? `V${version}` : null;
}

/**
 * Remove version text from assessment title
 * Example: "Java Developer - Assessment - Version 3" -> "Java Developer - Assessment"
 */
export function stripVersionFromTitle(title: string): string {
  return parseAssessmentTitle(title).cleanTitle;
}

/**
 * Format date/time in IST (Indian Standard Time - UTC+5:30)
 *
 * IMPORTANT: IST (Indian Standard Time) = UTC + 5 hours 30 minutes
 * IANA Timezone: 'Asia/Kolkata'
 * Offset: +05:30 (no daylight saving time)
 *
 * Example:
 * - Backend stores: 2024-02-09 10:00:00 UTC
 * - Frontend displays: 2024-02-09 3:30:00 PM IST
 *
 * @param dateStr - Date string or Date object (assumed to be UTC from backend)
 * @param options - Formatting options
 * @returns Formatted date string in IST (UTC+5:30)
 */
export function formatDateTimeIST(
  dateStr: string | Date | null | undefined,
  options?: {
    includeTime?: boolean;
    includeSeconds?: boolean;
    dateStyle?: 'short' | 'medium' | 'long' | 'full';
  }
): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);

  const dateOptions: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Kolkata', // IST = UTC+5:30
    month: options?.dateStyle === 'long' ? 'long' : 'short',
    day: 'numeric',
    year: 'numeric',
  };

  if (options?.includeTime) {
    dateOptions.hour = '2-digit';
    dateOptions.minute = '2-digit';
    dateOptions.hour12 = true;
    if (options?.includeSeconds) {
      dateOptions.second = '2-digit';
    }
  }

  return date.toLocaleString('en-US', dateOptions);
}

/**
 * Format time only in IST (Indian Standard Time - UTC+5:30)
 * @param dateStr - Date string or Date object (assumed to be UTC from backend)
 * @returns Formatted time string in IST (e.g., "3:30 PM")
 */
export function formatTimeIST(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Kolkata', // IST = UTC+5:30
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format date only in IST (no time) - Indian Standard Time = UTC+5:30
 * @param dateStr - Date string or Date object (assumed to be UTC from backend)
 * @returns Formatted date string in IST (e.g., "Feb 9, 2024")
 */
export function formatDateOnlyIST(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    timeZone: 'Asia/Kolkata', // IST = UTC+5:30
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
