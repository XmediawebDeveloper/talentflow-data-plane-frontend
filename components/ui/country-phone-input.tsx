'use client';

import { useSyncExternalStore } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from './utils';

/**
 * Phone number with a country-code picker. The value is one string,
 * "+<dial code> <digits>" (e.g. "+91 9876543210"), or '' when no number is
 * typed. Saved numbers without a "+" (older profiles) are read as Indian.
 *
 *   <CountryPhoneInput value={phone} onChange={setPhone} />
 */
export interface PhoneCountry {
  iso: string;
  name: string;
  dial: string;
  /** National number length(s) accepted; defaults to 6–14 digits. */
  len?: number[];
}

// India first (the default), then alphabetical.
export const PHONE_COUNTRIES: PhoneCountry[] = [
  { iso: 'IN', name: 'India', dial: '91', len: [10] },
  ...([
    ['AF', 'Afghanistan', '93'], ['AR', 'Argentina', '54'], ['AU', 'Australia', '61', [9]],
    ['AT', 'Austria', '43'], ['BH', 'Bahrain', '973', [8]], ['BD', 'Bangladesh', '880', [10]],
    ['BE', 'Belgium', '32'], ['BT', 'Bhutan', '975'], ['BR', 'Brazil', '55', [10, 11]],
    ['KH', 'Cambodia', '855'], ['CA', 'Canada', '1', [10]], ['CL', 'Chile', '56'],
    ['CN', 'China', '86', [11]], ['CO', 'Colombia', '57'], ['CZ', 'Czechia', '420'],
    ['DK', 'Denmark', '45', [8]], ['EG', 'Egypt', '20'], ['FI', 'Finland', '358'],
    ['FR', 'France', '33', [9]], ['DE', 'Germany', '49'], ['GH', 'Ghana', '233'],
    ['GR', 'Greece', '30', [10]], ['HK', 'Hong Kong', '852', [8]], ['HU', 'Hungary', '36'],
    ['ID', 'Indonesia', '62'], ['IE', 'Ireland', '353'], ['IL', 'Israel', '972'],
    ['IT', 'Italy', '39'], ['JP', 'Japan', '81', [10]], ['JO', 'Jordan', '962'],
    ['KE', 'Kenya', '254', [9]], ['KW', 'Kuwait', '965', [8]], ['MY', 'Malaysia', '60'],
    ['MV', 'Maldives', '960', [7]], ['MU', 'Mauritius', '230'], ['MX', 'Mexico', '52', [10]],
    ['NP', 'Nepal', '977'], ['NL', 'Netherlands', '31', [9]], ['NZ', 'New Zealand', '64'],
    ['NG', 'Nigeria', '234'], ['NO', 'Norway', '47', [8]], ['OM', 'Oman', '968', [8]],
    ['PK', 'Pakistan', '92', [10]], ['PH', 'Philippines', '63', [10]], ['PL', 'Poland', '48', [9]],
    ['PT', 'Portugal', '351', [9]], ['QA', 'Qatar', '974', [8]], ['RO', 'Romania', '40'],
    ['RU', 'Russia', '7', [10]], ['SA', 'Saudi Arabia', '966', [9]], ['SG', 'Singapore', '65', [8]],
    ['ZA', 'South Africa', '27', [9]], ['KR', 'South Korea', '82'], ['ES', 'Spain', '34', [9]],
    ['LK', 'Sri Lanka', '94', [9]], ['SE', 'Sweden', '46'], ['CH', 'Switzerland', '41', [9]],
    ['TW', 'Taiwan', '886'], ['TZ', 'Tanzania', '255'], ['TH', 'Thailand', '66'],
    ['TR', 'Turkey', '90', [10]], ['UG', 'Uganda', '256'], ['UA', 'Ukraine', '380', [9]],
    ['AE', 'United Arab Emirates', '971', [9]], ['GB', 'United Kingdom', '44', [10]],
    ['US', 'United States', '1', [10]], ['VN', 'Vietnam', '84'],
  ] as [string, string, string, number[]?][]).map(([iso, name, dial, len]) => ({ iso, name, dial, len })),
];

const DEFAULT_COUNTRY = PHONE_COUNTRIES[0];

/** Split a stored value into its country and national digits. */
export function parsePhone(value: string | null | undefined, preferIso?: string) {
  const raw = (value || '').trim();
  if (!raw.startsWith('+')) {
    const preferred = PHONE_COUNTRIES.find(c => c.iso === preferIso) || DEFAULT_COUNTRY;
    return { country: preferred, digits: raw.replace(/\D/g, '') };
  }
  const all = raw.replace(/\D/g, '');
  // Longest dial code that prefixes the number; the preferred country wins a tie (US/CA share +1).
  const matches = PHONE_COUNTRIES.filter(c => all.startsWith(c.dial));
  const longest = Math.max(0, ...matches.map(c => c.dial.length));
  const best = matches.filter(c => c.dial.length === longest);
  const country = best.find(c => c.iso === preferIso) || best.find(c => c.iso === 'US') || best[0] || DEFAULT_COUNTRY;
  return { country, digits: best.length ? all.slice(country.dial.length) : all };
}

/** Error message for an invalid number, or null when it is valid or empty. */
export function phoneError(value: string | null | undefined): string | null {
  const { country, digits } = parsePhone(value);
  if (!digits) return null;
  if (country.len) {
    return country.len.includes(digits.length)
      ? null
      : `Enter a valid ${country.name} phone number (${country.len.join(' or ')} digits)`;
  }
  return digits.length >= 6 && digits.length <= 14 ? null : 'Enter a valid phone number (6-14 digits)';
}

export default function CountryPhoneInput({
  value,
  onChange,
  disabled,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const { country, digits } = parsePhone(value);
  const maxLen = country.len ? Math.max(...country.len) : 14;
  const emit = (d: string) => onChange(d ? `+${country.dial} ${d}` : '');
  // Region names come from the runtime's ICU data, which can differ between the
  // server and the browser — list them only in the browser to keep hydration clean.
  const inBrowser = useSyncExternalStore(noopSubscribe, () => true, () => false);

  return (
    <div
      className={cn(
        // Same frame as <Input> so it lines up with the fields beside it.
        'flex h-9 w-full items-center overflow-hidden rounded-md border border-input bg-input-background text-sm transition-[color,box-shadow,border-color] dark:bg-input/30',
        'hover:border-[var(--border-dark)] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      {/* Flag + chevron; the invisible native select over it lists every country,
          with only the enabled ones (India) choosable — the rest are greyed out. */}
      <div className="relative flex h-full shrink-0 items-center gap-1 pl-3 pr-1">
        <CountryFlag iso={country.iso} />
        <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
        <select
          aria-label="Country"
          disabled={disabled}
          value={country.iso}
          onChange={() => { /* only the current country is enabled */ }}
          className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
        >
          {(inBrowser ? allRegions() : [{ iso: country.iso, name: country.name }]).map(r => (
            <option key={r.iso} value={r.iso} disabled={r.iso !== country.iso && !ENABLED_COUNTRIES.has(r.iso)}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <span className="shrink-0 pl-1 text-gray-900 dark:text-slate-100">+{country.dial}</span>
      <input
        type="tel"
        inputMode="numeric"
        disabled={disabled}
        value={digits}
        maxLength={maxLen}
        placeholder={placeholder ?? (country.iso === 'IN' ? '98765 43210' : 'Phone number')}
        onChange={(e) => emit(e.target.value.replace(/\D/g, '').slice(0, maxLen))}
        className="h-full min-w-0 flex-1 bg-transparent pl-1.5 pr-3 text-gray-900 placeholder:text-gray-400 outline-none disabled:cursor-not-allowed dark:text-slate-100 dark:placeholder:text-slate-500"
      />
    </div>
  );
}

const noopSubscribe = () => () => {};

/** Countries a user may pick. Everything else is listed but greyed out. */
const ENABLED_COUNTRIES = new Set(['IN']);

// Every region the browser can name, alphabetically (built once, on first use).
// Groupings, test codes and retired codes (which repeat a current country's name).
const NOT_COUNTRIES = new Set([
  'EU', 'EZ', 'UN', 'QO', 'ZZ', 'XA', 'XB',
  'AN', 'BU', 'CS', 'DD', 'FX', 'SU', 'TP', 'YD', 'YU', 'ZR', 'HV', 'DY', 'UK', 'NH', 'RH', 'VD',
  'AC', 'CP', 'DG', 'EA', 'IC', 'TA', 'CQ',
]);
let regionCache: { iso: string; name: string }[] | null = null;
function allRegions() {
  if (regionCache) return regionCache;
  const fromList = PHONE_COUNTRIES.map(c => ({ iso: c.iso, name: c.name }));
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
    const out: { iso: string; name: string }[] = [];
    for (let a = 65; a <= 90; a++) {
      for (let b = 65; b <= 90; b++) {
        const iso = String.fromCharCode(a, b);
        if (NOT_COUNTRIES.has(iso)) continue;
        const name = names.of(iso);
        if (name && name !== iso) out.push({ iso, name });
      }
    }
    regionCache = out.length ? out : fromList;
  } catch {
    regionCache = fromList;
  }
  regionCache = [...regionCache].sort((x, y) => x.name.localeCompare(y.name));
  return regionCache;
}

/** India's flag as inline SVG (emoji flags don't render on Windows); others show their code. */
function CountryFlag({ iso }: { iso: string }) {
  if (iso === 'IN') {
    return (
      <svg viewBox="0 0 30 20" className="h-4 w-6 shrink-0 rounded-[2px] ring-1 ring-black/10" aria-label="India">
        <rect width="30" height="20" fill="var(--raw-ffffff)" />
        <rect width="30" height="6.67" fill="var(--raw-ff9933)" />
        <rect y="13.33" width="30" height="6.67" fill="var(--raw-138808)" />
        <circle cx="15" cy="10" r="2.6" fill="none" stroke="var(--raw-000080)" strokeWidth="0.6" />
        <circle cx="15" cy="10" r="0.5" fill="var(--raw-000080)" />
      </svg>
    );
  }
  return <span className="tf-caption">{iso}</span>;
}
