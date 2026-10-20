/**
 * Tests for lib/services/exchangeRateService.ts - the client-side cache and
 * stale-fallback wrapper around GET /jd/exchange-rate, used by the JD
 * extraction page's INR/USD currency toggle (components/JDCreation.tsx's
 * handleSalaryCurrencyChange). Covers currency switching (same-currency
 * short-circuit), cached rates (TTL hit/expiry), and API failures (stale
 * fallback, hard failure with nothing cached). Conversion accuracy/decimal
 * precision is covered separately in lib/utils/__tests__/salary.test.ts; the
 * server-side fetch/cache/TTL/fallback logic has its own pytest suite at
 * talentflow-data-plane-backend/tests/test_exchange_rate_service.py.
 *
 * The raw HTTP call and the clock are both injectable on getExchangeRate()
 * specifically so this file can test the cache/fallback logic without
 * touching axios or this project's `@/` path alias - neither of which the
 * plain `tsc`+`node` harness below (no jest/vitest is configured; see
 * package.json) can resolve. Production call sites never pass either arg.
 *
 * There is no unit-test runner configured in this project (package.json only
 * wires up Playwright e2e via `test:e2e`), so this file is not picked up by
 * any npm script. Run it directly, from the talentflow-data-plane-frontend
 * directory, with (the 'typescript' package is already a project dependency;
 * this transpiles both this file and exchangeRateService.ts into a temp dir,
 * preserving their relative path, then requires the result). Unlike
 * exchangeRateService.ts's real import graph, this harness never loads
 * lib/services/api.ts - the injected fetcher replaces it entirely, so axios/
 * js-cookie/the `@/` alias are never touched:
 *
 *   node -e "
 *     const ts=require('typescript'),fs=require('fs'),path=require('path');
 *     const opts={compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}};
 *     const outDir=fs.mkdtempSync('/tmp/exchange-rate-test-');
 *     for (const f of ['lib/services/exchangeRateService.ts','lib/services/__tests__/exchangeRateService.test.ts']) {
 *       const out=path.join(outDir,f.replace(/\.ts$/,'.js'));
 *       fs.mkdirSync(path.dirname(out),{recursive:true});
 *       fs.writeFileSync(out, ts.transpileModule(fs.readFileSync(f,'utf8'),opts).outputText);
 *     }
 *     require(path.join(outDir,'lib/services/__tests__/exchangeRateService.test.js'));
 *   "
 *
 * If jest/vitest is ever added to this project, this file needs no changes
 * to run under it as-is (the `require('../api')` it never takes is the only
 * reason a real jest run would need an axios mock - that path is simply never
 * exercised here).
 */
import assert from 'assert';
import { getExchangeRate, clearExchangeRateCache, CACHE_TTL_MS, RateFetcher } from '../exchangeRateService';

let failures = 0;
const check = (condition: boolean, message: string) => {
  if (!condition) {
    failures++;
    console.error(`FAIL: ${message}`);
  }
};

function countingFetcher(rate: number, asOf: string | null = '2026-10-16'): { fetcher: RateFetcher; calls: () => number } {
  let calls = 0;
  const fetcher: RateFetcher = async (from, to) => {
    calls++;
    return { rate, asOf, stale: false };
  };
  return { fetcher, calls: () => calls };
}

function failingFetcher(error: Error): RateFetcher {
  return async () => {
    throw error;
  };
}

async function run() {
  // --- Currency switching: same currency is a no-op, never hits the network ---
  {
    clearExchangeRateCache();
    const { fetcher, calls } = countingFetcher(999);
    const result = await getExchangeRate('INR', 'inr', fetcher);
    check(result.rate === 1, 'same-currency request returns rate 1');
    check(result.cached === true && result.stale === false, 'same-currency request is reported as cached/not stale');
    check(calls() === 0, 'same-currency request never calls the fetcher (case-insensitive match)');
  }

  // --- Conversion accuracy passthrough: the fetched rate is returned unchanged ---
  {
    clearExchangeRateCache();
    const { fetcher } = countingFetcher(0.012);
    const result = await getExchangeRate('INR', 'USD', fetcher);
    check(result.rate === 0.012, 'a fresh fetch returns the exact rate from the API');
    check(result.cached === false, 'a fresh fetch is reported as not cached');
  }

  // --- Cached rates: a second call within the TTL window is served from cache ---
  {
    clearExchangeRateCache();
    const { fetcher, calls } = countingFetcher(0.012);
    let now = 1_000_000;
    const clock = () => now;

    const first = await getExchangeRate('INR', 'USD', fetcher, clock);
    check(calls() === 1, 'first call hits the fetcher');
    check(first.cached === false, 'first call is not cached');

    now += 1000; // well inside the TTL
    const second = await getExchangeRate('INR', 'USD', fetcher, clock);
    check(calls() === 1, 'a call within the TTL window must not re-invoke the fetcher');
    check(second.rate === 0.012 && second.cached === true && second.stale === false, 'cached call returns the same rate, marked cached/not stale');
  }

  // --- Cached rates: an expired entry triggers a refetch ---
  {
    clearExchangeRateCache();
    let callCount = 0;
    const rates = [0.012, 0.0121];
    const fetcher: RateFetcher = async () => ({ rate: rates[callCount++], asOf: '2026-10-16', stale: false });
    let now = 1_000_000;
    const clock = () => now;

    const first = await getExchangeRate('INR', 'USD', fetcher, clock);
    check(first.rate === 0.012, 'first fetch returns the first rate');

    now += CACHE_TTL_MS + 1; // just past the TTL
    const second = await getExchangeRate('INR', 'USD', fetcher, clock);
    check(callCount === 2, 'an expired cache entry must trigger a refetch');
    check(second.rate === 0.0121 && second.cached === false, 'the refetched rate replaces the stale one');
  }

  // --- API failures: a failure with a valid (even if TTL-expired) cached rate falls back, doesn't throw ---
  {
    clearExchangeRateCache();
    const { fetcher } = countingFetcher(0.012);
    let now = 1_000_000;
    const clock = () => now;

    await getExchangeRate('INR', 'USD', fetcher, clock);

    now += CACHE_TTL_MS + 1; // force the next call past the cache's TTL
    const result = await getExchangeRate('INR', 'USD', failingFetcher(new Error('network down')), clock);

    check(result.rate === 0.012, 'a failed fetch falls back to the last known rate rather than throwing');
    check(result.cached === true && result.stale === true, 'the fallback is reported as cached AND stale, so the caller can warn the user');
  }

  // --- API failures: a failure with nothing cached yet must raise, never silently pass the amount through unconverted ---
  {
    clearExchangeRateCache();
    let threw = false;
    try {
      await getExchangeRate('INR', 'USD', failingFetcher(new Error('network down')));
    } catch {
      threw = true;
    }
    check(threw, 'a failed fetch with no cache at all must throw rather than return a fabricated/unconverted result');
  }

  assert.strictEqual(failures, 0, `${failures} exchange rate service case(s) failed`);
  console.log('exchangeRateService.test.ts: all cases passed');
}

run();
