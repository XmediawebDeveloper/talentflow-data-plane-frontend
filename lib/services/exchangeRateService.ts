/**
 * Exchange rate lookup (INR<->USD) for the JD extraction page's currency
 * toggle. Calls GET /jd/exchange-rate (backed by its own server-side cache,
 * see the backend's app/services/exchange_rate_service.py) and additionally
 * caches the result for CACHE_TTL_MS in this browser tab, so repeatedly
 * toggling currency doesn't even cost a network round trip within the window.
 *
 * On a failed fetch, falls back to this tab's own cached rate - even past its
 * TTL - rather than leaving the caller with nothing; only throws when there is
 * no cached rate at all to fall back to. Mirrors the backend's own
 * stale-cache-on-failure behavior so a transient network blip on either side
 * degrades to "slightly stale rate" instead of "conversion silently skipped."
 *
 * The raw HTTP call is injectable (`fetchRate`) and the clock is injectable
 * (`now`) purely so this module's cache/TTL/fallback logic can be unit tested
 * (see __tests__/exchangeRateService.test.ts) without touching axios or this
 * project's `@/` path alias, neither of which the plain `tsc`+`node` harness
 * used here (no jest/vitest is configured) can resolve. Production call sites
 * never pass either argument. `./api` is loaded with a dynamic import rather
 * than a static one for the same reason: a static import is required eagerly
 * at module load regardless of whether it's ever called, which would force
 * that test harness to also resolve axios/js-cookie/the `@/` alias even
 * though the injected fetcher means the real one is never invoked.
 */
export interface ExchangeRateResult {
  rate: number;
  asOf: string | null;
  cached: boolean;
  stale: boolean;
}

interface RawRate {
  rate: number;
  asOf: string | null;
  stale: boolean;
}

interface CacheEntry {
  rate: number;
  asOf: string | null;
  fetchedAt: number;
}

export type RateFetcher = (fromCurrency: string, toCurrency: string) => Promise<RawRate>;

// Matches the backend's own default TTL (EXCHANGE_RATE_CACHE_TTL_SECONDS) -
// this is just saving the network round trip within the same tab/session, not
// a second source of truth for freshness.
export const CACHE_TTL_MS = 60 * 60 * 1000;

const rateCache = new Map<string, CacheEntry>();

const cacheKey = (from: string, to: string) => `${from.toUpperCase()}_${to.toUpperCase()}`;

const fetchRateFromApi: RateFetcher = async (fromCurrency, toCurrency) => {
  const { default: api, handleApiError } = await import('./api');
  try {
    const response = await api.get<{ rate: number; as_of: string | null; stale: boolean }>(
      '/jd/exchange-rate',
      { params: { from: fromCurrency, to: toCurrency } },
    );
    return { rate: response.data.rate, asOf: response.data.as_of, stale: Boolean(response.data.stale) };
  } catch (error) {
    throw new Error(handleApiError(error));
  }
};

export const getExchangeRate = async (
  fromCurrency: string,
  toCurrency: string,
  fetchRate: RateFetcher = fetchRateFromApi,
  now: () => number = Date.now,
): Promise<ExchangeRateResult> => {
  if (fromCurrency.toUpperCase() === toCurrency.toUpperCase()) {
    return { rate: 1, asOf: null, cached: true, stale: false };
  }

  const key = cacheKey(fromCurrency, toCurrency);
  const cached = rateCache.get(key);
  if (cached && now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { rate: cached.rate, asOf: cached.asOf, cached: true, stale: false };
  }

  try {
    const { rate, asOf, stale } = await fetchRate(fromCurrency, toCurrency);
    rateCache.set(key, { rate, asOf, fetchedAt: now() });
    return { rate, asOf, cached: false, stale };
  } catch (error) {
    if (cached) {
      return { rate: cached.rate, asOf: cached.asOf, cached: true, stale: true };
    }
    throw error;
  }
};

/** Test hook - the app itself never needs to clear this. */
export const clearExchangeRateCache = () => rateCache.clear();
