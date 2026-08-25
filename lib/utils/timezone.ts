/**
 * Timezone Utility - Indian Standard Time (IST)
 *
 * IST = UTC + 5 hours 30 minutes
 * IANA Timezone: Asia/Kolkata
 * No Daylight Saving Time
 */

export const INDIA_TIMEZONE = 'Asia/Kolkata';
export const IST_OFFSET_HOURS = 5;
export const IST_OFFSET_MINUTES = 30;
/** IST offset in milliseconds. Referenced by getCurrentIST()/addISTOffset() below,
 *  which used it without it ever being declared - so calling either threw a
 *  ReferenceError at runtime. Derived from the two constants above rather than
 *  hardcoded, so the three can never disagree. */
export const IST_OFFSET_MS =
  (IST_OFFSET_HOURS * 60 + IST_OFFSET_MINUTES) * 60 * 1000;

/**
 * Format date/time in IST (UTC+5:30)
 * @param dateStr - Date string from backend (in UTC)
 * @returns Formatted string in IST
 */
export function formatDateTimeIST(
  dateStr: string | Date | null | undefined,
  options?: {
    includeDate?: boolean;
    includeTime?: boolean;
    includeSeconds?: boolean;
    includeTimezone?: boolean;
  }
): string {
  if (!dateStr) return '';

  const date = new Date(dateStr);

  const formatOptions: Intl.DateTimeFormatOptions = {
    timeZone: INDIA_TIMEZONE, // IST = UTC+5:30
  };

  // Date options
  if (options?.includeDate !== false) {
    formatOptions.year = 'numeric';
    formatOptions.month = 'short';
    formatOptions.day = 'numeric';
  }

  // Time options
  if (options?.includeTime !== false) {
    formatOptions.hour = '2-digit';
    formatOptions.minute = '2-digit';
    formatOptions.hour12 = true;

    if (options?.includeSeconds) {
      formatOptions.second = '2-digit';
    }
  }

  const formatted = date.toLocaleString('en-US', formatOptions);

  // Add timezone suffix if requested
  if (options?.includeTimezone) {
    return `${formatted} IST`;
  }

  return formatted;
}

/**
 * Format only date in IST
 */
export function formatDateIST(dateStr: string | Date | null | undefined): string {
  return formatDateTimeIST(dateStr, { includeTime: false });
}

/**
 * Format only time in IST
 */
export function formatTimeIST(dateStr: string | Date | null | undefined): string {
  return formatDateTimeIST(dateStr, { includeDate: false });
}

/**
 * Get current IST time (current time + 5:30)
 */
export function getCurrentIST(): Date {
  return new Date(Date.now() + IST_OFFSET_MS);
}

/**
 * Add 5:30 to any date to get IST
 */
export function addISTOffset(date: Date): Date {
  return new Date(date.getTime() + IST_OFFSET_MS);
}

/**
 * Get IST offset string
 */
export function getISTOffset(): string {
  return '+05:30';
}

/**
 * Format with explicit timezone display
 * Example: "Feb 9, 2026 at 6:46 PM IST (UTC+5:30)"
 */
export function formatWithTimezone(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '';

  const formatted = formatDateTimeIST(dateStr, {
    includeDate: true,
    includeTime: true
  });

  return `${formatted} IST (UTC+5:30)`;
}
