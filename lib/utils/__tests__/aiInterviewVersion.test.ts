/**
 * Tests for lib/utils/aiInterviewVersion.ts — the version number and the Edit /
 * Duplicate gates the AI Interview screens share, which mirror the Assessments
 * rules and the backend's clone / lock rules.
 *
 * No unit-test runner is configured in this project (see email.test.ts), so run
 * it directly from the talentflow-data-plane-frontend directory:
 *
 *   node -e "
 *     const ts=require('typescript'),fs=require('fs'),path=require('path');
 *     const opts={compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}};
 *     const outDir=fs.mkdtempSync('/tmp/aiv-test-');
 *     for (const f of ['lib/utils/aiInterviewVersion.ts','lib/utils/__tests__/aiInterviewVersion.test.ts']) {
 *       const out=path.join(outDir,f.replace(/\.ts$/,'.js'));
 *       fs.mkdirSync(path.dirname(out),{recursive:true});
 *       fs.writeFileSync(out, ts.transpileModule(fs.readFileSync(f,'utf8'),opts).outputText);
 *     }
 *     require(path.join(outDir,'lib/utils/__tests__/aiInterviewVersion.test.js'));
 *   "
 */
import assert from 'assert';
import {
  MAX_INTERVIEW_VERSIONS,
  interviewDuplicateBlockedReason,
  interviewEditBlockedReason,
  interviewVersionOrdinal,
} from '../aiInterviewVersion';

let passed = 0;
const test = (name: string, fn: () => void) => {
  try {
    fn();
    passed += 1;
  } catch (e) {
    console.error(`FAIL: ${name}`);
    throw e;
  }
};

const cfg = (id: string, o: Record<string, unknown> = {}) => ({
  id, jd_id: 'jd1', status: 'published', invitations_count: 1, ...o,
});

// ── version number ──
test('stored version wins over creation order', () => {
  const a = { id: 'a', jd_id: 'jd1', created_at: '2026-01-01' };
  const b = { id: 'b', jd_id: 'jd1', created_at: '2026-02-01', interview_version: 7 };
  assert.strictEqual(interviewVersionOrdinal(b, [a, b]), 7);
});
test('falls back to creation order when no stored version', () => {
  const a = { id: 'a', jd_id: 'jd1', created_at: '2026-01-01' };
  const b = { id: 'b', jd_id: 'jd1', created_at: '2026-02-01' };
  const other = { id: 'x', jd_id: 'jd2', created_at: '2025-01-01' };
  assert.strictEqual(interviewVersionOrdinal(a, [b, a, other]), 1);
  assert.strictEqual(interviewVersionOrdinal(b, [b, a, other]), 2);
});
test('a null stored version falls back; no jd_id is V1', () => {
  assert.strictEqual(interviewVersionOrdinal({ id: 'a', jd_id: null, interview_version: null }, []), 1);
});
test('the cap matches the Assessments cap', () => assert.strictEqual(MAX_INTERVIEW_VERSIONS, 5));

// ── edit lock ──
test('edit allowed with no invitations', () => {
  assert.strictEqual(interviewEditBlockedReason(cfg('a', { invitations_count: 0 })), null);
  assert.strictEqual(interviewEditBlockedReason(cfg('a', { invitations_count: undefined })), null);
});
test('edit blocked once invited, and the reason says to duplicate', () => {
  const r = interviewEditBlockedReason(cfg('a', { invitations_count: 2 }));
  assert.ok(r && /duplicate/i.test(r));
});
test('edit blocked on an archived version', () => {
  assert.ok(interviewEditBlockedReason(cfg('a', { status: 'archived', invitations_count: 0 })));
});
test('the lock is per version', () => {
  assert.ok(interviewEditBlockedReason(cfg('v1', { invitations_count: 3 })));
  assert.strictEqual(interviewEditBlockedReason(cfg('v2', { invitations_count: 0 })), null);
});

// ── duplicate gate ──
test('duplicate allowed: sent, no draft, under the cap', () => {
  const v1 = cfg('v1');
  assert.strictEqual(interviewDuplicateBlockedReason(v1, [v1]), null);
});
test('duplicate disabled when nobody was invited', () => {
  const v1 = cfg('v1', { invitations_count: 0 });
  assert.match(interviewDuplicateBlockedReason(v1, [v1])!, /edit this version instead/i);
});
test('duplicate disabled for a draft', () => {
  const d = cfg('d', { status: 'draft', invitations_count: 0 });
  assert.match(interviewDuplicateBlockedReason(d, [d])!, /publish/i);
});
test('duplicate disabled while another draft is open in the lineage', () => {
  const v1 = cfg('v1');
  const draft = cfg('v2', { status: 'draft', invitations_count: 0 });
  assert.match(interviewDuplicateBlockedReason(v1, [v1, draft])!, /already in draft/i);
});
test('a draft in a DIFFERENT lineage does not block', () => {
  const v1 = cfg('v1');
  const draft = cfg('x', { jd_id: 'jd2', status: 'draft', invitations_count: 0 });
  assert.strictEqual(interviewDuplicateBlockedReason(v1, [v1, draft]), null);
});
test('duplicate disabled at the cap of 5, allowed at 4', () => {
  const four = Array.from({ length: 4 }, (_, i) => cfg(`v${i}`));
  assert.strictEqual(interviewDuplicateBlockedReason(four[0], four), null);
  const five = [...four, cfg('v4')];
  assert.match(interviewDuplicateBlockedReason(five[0], five)!, /Maximum 5 versions/);
});
test('archived versions do not count toward the draft rule or the cap', () => {
  const live = Array.from({ length: 4 }, (_, i) => cfg(`v${i}`));
  const archived = [cfg('a1', { status: 'archived' }), cfg('a2', { status: 'archived', invitations_count: 0 })];
  assert.strictEqual(interviewDuplicateBlockedReason(live[0], [...live, ...archived]), null);
  const archivedDraft = cfg('ad', { status: 'archived' });
  assert.strictEqual(interviewDuplicateBlockedReason(live[0], [...live, archivedDraft]), null);
});
test('duplicate disabled without create permission, reason first', () => {
  const v1 = cfg('v1', { invitations_count: 0 });
  assert.match(interviewDuplicateBlockedReason(v1, [v1], false)!, /permission/i);
});
test('an unsent version blocks duplicate while a sent one in the same lineage allows it', () => {
  const v1 = cfg('v1', { invitations_count: 4 });
  const v2 = cfg('v2', { invitations_count: 0 });
  assert.strictEqual(interviewDuplicateBlockedReason(v1, [v1, v2]), null);
  assert.ok(interviewDuplicateBlockedReason(v2, [v1, v2]));
});

console.log(`aiInterviewVersion: ${passed} tests passed`);
