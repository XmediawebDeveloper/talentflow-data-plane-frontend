export type SupportedSalaryCurrency = 'INR' | 'USD';

const getSalaryLocale = (currency: SupportedSalaryCurrency): string =>
  currency === 'USD' ? 'en-US' : 'en-IN';

export const normalizeSalaryCurrency = (currency?: string | null): SupportedSalaryCurrency => {
  const normalized = currency?.trim().toUpperCase();

  if (!normalized) {
    return 'INR';
  }

  if (normalized === 'USD' || normalized === '$' || normalized === 'US$') {
    return 'USD';
  }

  return 'INR';
};

export const getSalaryCurrencySymbol = (currency?: string | null): string =>
  normalizeSalaryCurrency(currency) === 'USD' ? '$' : '₹';

// Keeps cents. This used to end in Math.trunc(), which is why "Pay Range: $20.34 -
// $30.39 / HOURLY" displayed as "$20 - $30" everywhere in the app even when the row
// held the exact figures. The column is NUMERIC(12,2) and an hourly or daily rate is
// precisely where the fractional part carries the meaning, so truncating here threw
// away real data on the way to the screen.
//
// Rounded to 2 decimal places rather than left raw, so this agrees with the backend's
// own quantization (validate_salary) instead of showing a longer fraction than the
// stored value.
const coerceSalaryNumber = (value?: number | string | null): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numericValue = typeof value === 'number'
    ? value
    : Number(String(value).replace(/[^0-9.-]/g, ''));

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return Math.round(numericValue * 100) / 100;
};

/**
 * Parse a salary the recruiter typed (or extraction produced) into the number we PERSIST.
 *
 * Exists because every save path in JDCreation did this inline with `parseInt`, which
 * floors: a JD stating "$20.34 - $30.39 / HOURLY" was stored as 20 and 30. Twelve copies
 * of that expression also meant twelve chances to fix one and miss the rest, so the
 * definition lives here and the call sites share it.
 *
 * Returns undefined for blank/unparseable input so an absent salary stays absent rather
 * than becoming 0 - "we were not told" and "this job pays nothing" are different facts.
 * Rounded to 2 decimals to match the NUMERIC(12,2) column and the backend's own
 * quantization, so the value sent is the value stored.
 */
export const parseSalaryInput = (raw?: string | number | null): number | undefined => {
  if (raw === null || raw === undefined || raw === '') {
    return undefined;
  }

  const cleaned = String(raw).replace(/[^0-9.]/g, '');
  if (cleaned === '') {
    return undefined;
  }

  const numericValue = Number(cleaned);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return undefined;
  }

  return Math.round(numericValue * 100) / 100;
};

/**
 * Convert a salary figure using an already-fetched exchange `rate` (from
 * lib/services/exchangeRateService, backed by GET /jd/exchange-rate), where
 * `rate` converts FROM the input's currency TO the target currency:
 * amount_in_target = amount * rate. Rounded to 2 decimals to match the
 * NUMERIC(12,2) column and the rest of this file's precision. Blank,
 * unparseable input, or an invalid rate stays blank - there is nothing
 * trustworthy to convert.
 */
export const convertSalaryAmount = (
  value: string | number | null | undefined,
  rate: number,
): string => {
  const numericValue = parseSalaryInput(value);
  if (numericValue === undefined || !Number.isFinite(rate) || rate <= 0) {
    return '';
  }

  return String(Math.round(numericValue * rate * 100) / 100);
};

export const formatSalaryAmount = (
  value?: number | string | null,
  currency?: string | null,
): string => {
  const numericValue = coerceSalaryNumber(value);

  if (numericValue === null) {
    return '';
  }

  const normalizedCurrency = normalizeSalaryCurrency(currency);

  // A whole amount keeps its old look - "$120,000", never "$120,000.00" - so the common
  // annual-salary case is untouched. Anything fractional gets BOTH places, because money
  // with one decimal reads as a mistake: $20.50, not $20.5.
  const fractionDigits = Number.isInteger(numericValue) ? 0 : 2;

  return `${getSalaryCurrencySymbol(normalizedCurrency)}${numericValue.toLocaleString(
    getSalaryLocale(normalizedCurrency),
    { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits },
  )}`;
};

/**
 * Render a salary for display. THE single definition - JD Creation, the Step 3 preview,
 * the JD list column, the published JD detail and the candidate scorecard all call this,
 * which is what keeps the four screens showing the same string for the same row (JD-21's
 * "Consistent Salary Representation").
 *
 * The three shapes JD-21 specifies:
 *   min only   -> "<amount>+"        an open-ended floor: 10 LPA+
 *   max only   -> "Up to <amount>"   a ceiling: Up to 10 LPA
 *   both       -> "<min> - <max>"    a true range: 8 - 12 LPA
 *
 * The min-only case used to read "From <amount>". Same meaning, but the ticket asks for
 * the trailing "+" because that is how the figure is written on a job posting.
 *
 * Absent stays absent. A blank salary returns '' and every call site guards on that, so a
 * JD that never stated a salary shows nothing rather than a fabricated 0 or a placeholder
 * range - "we were not told" and "this job pays nothing" are different facts.
 */
export const formatSalaryRange = ({
  min,
  max,
  currency,
}: {
  min?: number | string | null;
  max?: number | string | null;
  currency?: string | null;
}): string => {
  const minValue = coerceSalaryNumber(min);
  const maxValue = coerceSalaryNumber(max);

  if (minValue === null && maxValue === null) {
    return '';
  }

  if (minValue !== null && maxValue !== null) {
    // Both bounds present and identical is a FIXED salary, not JD-21's single-value
    // case: the recruiter typed the same figure into both boxes on purpose. Rendering
    // it as "<amount>+" would claim an open-ended top end nobody stated. JD-21's
    // "entered one value" case never reaches here - extraction now leaves salary_max
    // null (see extract_salary_details_from_text), so it lands in the min-only branch.
    if (minValue === maxValue) {
      return formatSalaryAmount(minValue, currency);
    }

    return `${formatSalaryAmount(minValue, currency)} - ${formatSalaryAmount(maxValue, currency)}`;
  }

  if (minValue !== null) {
    return `${formatSalaryAmount(minValue, currency)}+`;
  }

  return `Up to ${formatSalaryAmount(maxValue, currency)}`;
};

/**
 * The JD's pay period, worded for display next to a salary range — "/ year",
 * "/ month", "/ hour", "/ day". Mirrors the four `compensation_type` values
 * the backend stores (hourly | daily | monthly | yearly); an unrecognized or
 * absent value is returned as-is rather than guessed at.
 */
export const formatCompensationPeriod = (compensationType?: string | null): string => {
  switch (compensationType) {
    case 'yearly':
      return 'year';
    case 'monthly':
      return 'month';
    case 'hourly':
      return 'hour';
    case 'daily':
      return 'day';
    default:
      return compensationType || '';
  }
};
