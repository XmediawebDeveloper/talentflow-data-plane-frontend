/**
 * IANA time zones for pickers, labelled with their current UTC offset, e.g.
 * "(UTC+05:30) Asia/Kolkata" with "India Standard Time" as the hint.
 * Built from the browser's own list, so no data file to keep up to date.
 */
export interface TimeZoneOption {
  value: string;
  label: string;
  hint?: string;
  /** Current offset in minutes, for sorting. */
  offset: number;
}

const FALLBACK_ZONES = [
  'UTC', 'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney',
  'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Los_Angeles',
];

// Browsers (CLDR) still report some zones by their old names; show the current ones.
const RENAMED_ZONES: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Thimbu': 'Asia/Thimphu',
  'Europe/Kiev': 'Europe/Kyiv',
  'America/Godthab': 'America/Nuuk',
  'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
  'Africa/Asmera': 'Africa/Asmara',
  'Atlantic/Faeroe': 'Atlantic/Faroe',
  'Pacific/Enderbury': 'Pacific/Kanton',
};
const currentName = (zone: string) => RENAMED_ZONES[zone] || zone;

export function browserTimeZone(): string {
  try {
    return currentName(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  } catch {
    return 'UTC';
  }
}

function offsetMinutes(zone: string, at: Date): number {
  // "GMT+5:30" / "GMT-4" / "GMT" from the shortOffset name.
  const part = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' })
    .formatToParts(at)
    .find(p => p.type === 'timeZoneName')?.value || 'GMT';
  const m = part.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return 0;
  const mins = Number(m[2]) * 60 + Number(m[3] || 0);
  return m[1] === '-' ? -mins : mins;
}

function formatOffset(mins: number): string {
  const sign = mins < 0 ? '-' : '+';
  const abs = Math.abs(mins);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

function longName(zone: string, at: Date): string | undefined {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'long' })
      .formatToParts(at)
      .find(p => p.type === 'timeZoneName')?.value;
  } catch {
    return undefined;
  }
}

export function timeZoneOptions(): TimeZoneOption[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
  let zones: string[];
  try {
    zones = intl.supportedValuesOf ? intl.supportedValuesOf('timeZone') : FALLBACK_ZONES;
  } catch {
    zones = FALLBACK_ZONES;
  }
  zones = [...new Set(zones.map(currentName))];
  if (!zones.includes('UTC')) zones = ['UTC', ...zones];
  const now = new Date();
  return zones
    .map(zone => {
      const offset = offsetMinutes(zone, now);
      return {
        value: zone,
        label: `(${formatOffset(offset)}) ${zone.replace(/_/g, ' ')}`,
        hint: longName(zone, now),
        offset,
      };
    })
    .sort((a, b) => a.offset - b.offset || a.value.localeCompare(b.value));
}
