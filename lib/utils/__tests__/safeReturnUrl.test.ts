/**
 * Tests for lib/utils/safeReturnUrl.ts (security sheet N4 open-redirect guard).
 * No unit-test runner is configured; run it like email.test.ts (transpile
 * lib/utils/safeReturnUrl.ts + this file with the typescript package, then
 * require the result). Exits non-zero on the first failure.
 */
import { safeReturnUrl } from '../safeReturnUrl';

const CASES: Array<[unknown, string | null]> = [
  ['/recruitment/assessments', '/recruitment/assessments'],
  ['/recruitment/job-details?id=1&tab=x', '/recruitment/job-details?id=1&tab=x'],
  ['/a#frag', '/a#frag'],
  ['//evil.com', null],
  ['/\\evil.com', null],
  ['/\t/evil.com', null],
  ['/\n/evil.com', null],
  ['/foo\\bar', null],
  ['https://evil.com', null],
  ['javascript:alert(1)', null],
  ['evil.com', null],
  ['', null],
  [null, null],
  [undefined, null],
  [42, null],
];

let failed = 0;
for (const [input, expected] of CASES) {
  const actual = safeReturnUrl(input);
  if (actual !== expected) {
    failed++;
    console.error(`FAIL: ${JSON.stringify(input)} -> got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}
if (safeReturnUrl('//evil.com', '/dashboard') !== '/dashboard') {
  failed++;
  console.error('FAIL: fallback not returned');
}
if (failed) {
  throw new Error(`${failed} safeReturnUrl case(s) failed`);
}
console.log(`safeReturnUrl.test.ts: all ${CASES.length + 1} cases passed`);
