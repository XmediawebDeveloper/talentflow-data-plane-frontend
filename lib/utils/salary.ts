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

  return Math.trunc(numericValue);
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

  return `${getSalaryCurrencySymbol(normalizedCurrency)}${numericValue.toLocaleString(getSalaryLocale(normalizedCurrency))}`;
};

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
    if (minValue === maxValue) {
      return formatSalaryAmount(minValue, currency);
    }

    return `${formatSalaryAmount(minValue, currency)} - ${formatSalaryAmount(maxValue, currency)}`;
  }

  if (minValue !== null) {
    return `From ${formatSalaryAmount(minValue, currency)}`;
  }

  return `Up to ${formatSalaryAmount(maxValue, currency)}`;
};
