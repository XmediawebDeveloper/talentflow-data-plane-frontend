/**
 * Tests for lib/utils/salary.ts's convertSalaryAmount() - the currency
 * conversion math used by the JD extraction page's INR/USD toggle
 * (components/JDCreation.tsx's handleSalaryCurrencyChange) once a rate has
 * been fetched from GET /jd/exchange-rate. Covers conversion accuracy and
 * decimal precision; currency-switching/caching/API-failure behavior is
 * covered in lib/services/__tests__/exchangeRateService.test.ts, and the
 * server-side rate fetch/cache/TTL/fallback logic has its own pytest suite
 * at talentflow-data-plane-backend/tests/test_exchange_rate_service.py.
 *
 * There is no unit-test runner configured in this project (package.json only
 * wires up Playwright e2e via `test:e2e`), so this file is not picked up by
 * any npm script. Run it directly, from the talentflow-data-plane-frontend
 * directory, with (the 'typescript' package is already a project dependency;
 * this transpiles both this file and salary.ts into a temp dir, preserving
 * their relative path, then requires the result):
 *
 *   node -e "
 *     const ts=require('typescript'),fs=require('fs'),path=require('path');
 *     const opts={compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}};
 *     const outDir=fs.mkdtempSync('/tmp/salary-test-');
 *     for (const f of ['lib/utils/salary.ts','lib/utils/__tests__/salary.test.ts']) {
 *       const out=path.join(outDir,f.replace(/\.ts$/,'.js'));
 *       fs.mkdirSync(path.dirname(out),{recursive:true});
 *       fs.writeFileSync(out, ts.transpileModule(fs.readFileSync(f,'utf8'),opts).outputText);
 *     }
 *     require(path.join(outDir,'lib/utils/__tests__/salary.test.js'));
 *   "
 *
 * If jest/vitest is ever added to this project, this file needs no changes
 * to run under it as-is.
 */
import assert from 'assert';
import { convertSalaryAmount } from '../salary';

type Case = [string | number | null | undefined, number, string, string];

const CASES: Case[] = [
  // Accuracy — the reported bug: ₹20,000 selecting USD must not stay "20,000".
  ['20000', 0.012, '240', '₹20,000 at INR->USD example rate converts, not a no-op'],
  [20000, 0.012, '240', 'numeric input converts the same as string input'],
  ['100000', 0.012048, '1204.8', 'a non-round rate still converts correctly'],
  ['240', 83.3333, '19999.99', 'the inverse direction (USD->INR) at the matching rate'],

  // Decimal precision — rounds to 2 places (NUMERIC(12,2) / money convention),
  // never a longer float-precision tail.
  ['99.999', 1, '100', 'rounds a sub-cent remainder up to the nearest cent'],
  ['10', 0.33333333, '3.33', 'a repeating-decimal rate is truncated to cents, not left raw'],
  ['3', 0.335, '1.01', 'rounds half-cent up'],

  // Identity - rate of 1 (e.g. same currency) returns the amount unchanged
  // (still normalized to a plain numeric string).
  ['20000', 1, '20000', 'rate of 1 is a no-op conversion'],
];

let failures = 0;
for (const [value, rate, expected, reason] of CASES) {
  const actual = convertSalaryAmount(value, rate);
  if (actual !== expected) {
    failures++;
    console.error(`FAIL: convertSalaryAmount(${JSON.stringify(value)}, ${rate}) (${reason}) -> got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}

// Blank/unparseable input and an invalid rate must stay blank - there is
// nothing trustworthy to convert, and a silent 0 would read as "this job pays
// nothing" rather than "no salary was stated".
const blankCases: Array<[string | number | null | undefined, number, string]> = [
  [null, 0.012, 'null value'],
  [undefined, 0.012, 'undefined value'],
  ['', 0.012, 'empty string value'],
  ['not a number', 0.012, 'unparseable value'],
  ['20000', 0, 'zero rate'],
  ['20000', -1, 'negative rate'],
  ['20000', NaN, 'NaN rate'],
];
for (const [value, rate, reason] of blankCases) {
  const actual = convertSalaryAmount(value, rate);
  if (actual !== '') {
    failures++;
    console.error(`FAIL: convertSalaryAmount(${JSON.stringify(value)}, ${rate}) (${reason}) -> got ${JSON.stringify(actual)}, expected ''`);
  }
}

assert.strictEqual(failures, 0, `${failures} of ${CASES.length + blankCases.length} salary conversion cases failed`);

console.log(`salary.test.ts: all ${CASES.length + blankCases.length} cases passed`);
