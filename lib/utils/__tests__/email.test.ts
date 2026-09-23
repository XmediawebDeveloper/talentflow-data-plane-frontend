/**
 * Tests for lib/utils/email.ts — the shared email FORMAT validator used by
 * every place Invitation Tracking accepts or edits a candidate email
 * (invite create, bulk invite, Edit Invitation, Change Email), in both the
 * Assessment and AI Interview modules.
 *
 * There is no unit-test runner configured in this project (package.json only
 * wires up Playwright e2e via `test:e2e`), so this file is not picked up by
 * any npm script. Run it directly, from the talentflow-data-plane-frontend
 * directory, with (the 'typescript' package is already a project dependency;
 * this transpiles both this file and email.ts into a temp dir, preserving
 * their relative path, then requires the result):
 *
 *   node -e "
 *     const ts=require('typescript'),fs=require('fs'),path=require('path');
 *     const opts={compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}};
 *     const outDir=fs.mkdtempSync('/tmp/email-test-');
 *     for (const f of ['lib/utils/email.ts','lib/utils/__tests__/email.test.ts']) {
 *       const out=path.join(outDir,f.replace(/\.ts$/,'.js'));
 *       fs.mkdirSync(path.dirname(out),{recursive:true});
 *       fs.writeFileSync(out, ts.transpileModule(fs.readFileSync(f,'utf8'),opts).outputText);
 *     }
 *     require(path.join(outDir,'lib/utils/__tests__/email.test.js'));
 *   "
 *
 * If jest/vitest is ever added to this project, this file needs no changes
 * to run under it as-is.
 */
import assert from 'assert';
import { isValidEmailFormat, EMAIL_FORMAT_ERROR } from '../email';

type Case = [string | null | undefined, boolean, string];

const CASES: Case[] = [
  // Valid — must keep working.
  ['john@example.com', true, 'plain valid address'],
  ['john.doe@example.com', true, 'dotted local part'],
  ['john+test@example.com', true, 'plus-addressing'],
  ['john_doe@example.co.in', true, 'underscore + multi-label domain'],
  ['user@example.co', true, 'two-letter TLD boundary'],
  ['user@sub.example.com', true, 'subdomain'],

  // Invalid — the reported bug plus every other required scenario.
  ['efscsffc@example.c', false, 'one-letter TLD — the reported bug'],
  ['plainaddress', false, 'missing @'],
  ['a@b@c@example.com', false, 'multiple @'],
  ['@example.com', false, 'missing local part'],
  ['user@', false, 'missing domain'],
  ['user@example', false, 'missing TLD / no dot in domain'],
  ['user..name@example.com', false, 'consecutive dots in local part'],
  ['.username@example.com', false, 'leading dot in local part'],
  ['username.@example.com', false, 'trailing dot in local part'],
  ['user name@example.com', false, 'space inside local part'],
  ['user@example .com', false, 'space inside domain'],
  ['user@example..com', false, 'consecutive dots in domain'],
  ['user@-example.com', false, "domain label starting with '-'"],
  ['user@example-.com', false, "domain label ending with '-'"],
  [' user@example.com', false, 'leading whitespace'],
  ['user@example.com ', false, 'trailing whitespace'],
  ['user@exa_mple.com', false, "invalid domain character '_'"],
  ['', false, 'empty string'],
  [null, false, 'null'],
  [undefined, false, 'undefined'],
];

let failures = 0;
for (const [email, expected, reason] of CASES) {
  const actual = isValidEmailFormat(email);
  if (actual !== expected) {
    failures++;
    console.error(`FAIL: ${JSON.stringify(email)} (${reason}) -> got ${actual}, expected ${expected}`);
  }
}
assert.strictEqual(failures, 0, `${failures} of ${CASES.length} email format cases failed`);

assert.strictEqual(EMAIL_FORMAT_ERROR, 'Please enter a valid email address.');

console.log(`email.test.ts: all ${CASES.length} cases passed`);
