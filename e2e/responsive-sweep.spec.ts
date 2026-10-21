/**
 * Responsive visual-audit sweep (not part of the product; a dev tool).
 *
 * For each route in SWEEP_ROUTES it:
 *   - measures document-level horizontal overflow at every WIDTH, and
 *   - captures a FULL-PAGE screenshot at each SHOT_WIDTHS entry for visual review
 *     (overlap / clipping / cramping / off-screen content).
 *
 * Env:
 *   SWEEP_ROUTES  comma-separated routes (leading slash optional)
 *   SHOT_WIDTHS   comma-separated widths to screenshot (default 320,390,768)
 *   NOSHOT=1      skip screenshots (overflow numbers only)
 *   SKIP_LOGIN=1  don't log in (for pre-auth/public pages)
 *   BASE_URL      defaults to http://localhost:3000
 */
import { test, expect } from '@playwright/test';
import {
  loginViaUi,
  mockLoginApi,
  mockApiFallback,
  mockModuleStats,
  mockDashboardApis,
  mockQuotaStatus,
  mockAiInterviewFixtures,
  mockJdAccessCheck,
} from './helpers/auth';

const WIDTHS = [320, 360, 375, 414, 600, 768, 1024];
const SHOT_WIDTHS = (process.env.SHOT_WIDTHS || '320,390,768')
  .split(',')
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => Number.isFinite(n));

const ROUTES = (process.env.SWEEP_ROUTES || '/dashboard')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => '/' + s.replace(/^\/+/, ''));

const slug = (r: string) => r.replace(/[^a-z0-9]/gi, '_');

test('responsive sweep', async ({ page }) => {
  test.setTimeout(10 * 60_000);

  // Playwright gives the LAST-registered matching route priority, so register
  // the broad catch-all FIRST and the specific mocks after it (otherwise the
  // fallback's **/api/v1/** swallows /api/v1/auth/login and login never works).
  await mockApiFallback(page);
  await mockModuleStats(page);
  await mockDashboardApis(page);
  await mockQuotaStatus(page);
  await mockAiInterviewFixtures(page);
  await mockJdAccessCheck(page);
  await mockLoginApi(page);

  // Targeted list mocks (registered last = highest priority) so data-heavy pages
  // render their real empty-state layout instead of the error boundary, making
  // them visually auditable. Shapes match what each page reads.
  const j = (json: unknown) => (r: import('@playwright/test').Route) => r.fulfill({ status: 200, json });
  // user-management
  await page.route(/\/api\/v\d+\/users(\?|$)/, j([]));
  await page.route(/\/api\/v\d+\/users\/count(\?|$)/, j({ active_users: 0, inactive_users: 0, total_users: 0 }));
  await page.route(/\/api\/v\d+\/users\/available-roles(\?|$)/, j({ roles: [] }));
  await page.route(/\/api\/v\d+\/rbac\/permissions(\?|$)/, j({ permissions: [] }));
  // settings/integrations
  await page.route(/\/api\/v\d+\/integrations(\?|$)/, j({ integrations: [] }));
  // team-chat
  await page.route(/\/api\/v\d+\/chat\/channels(\?|$)/, j({ channels: [], direct_messages: [], total_unread: 0 }));
  await page.route(/\/api\/v\d+\/chat\/permissions(\?|$)/, j({ can_create_channel: false, role: 'user' }));
  // notifications
  await page.route(/\/api\/v\d+\/notifications(\?|$)/, j({ notifications: [], total: 0, unread_count: 0 }));
  await page.route(/\/api\/v\d+\/notifications\/count(\?|$)/, j({ count: 0, unread: 0, unread_count: 0 }));
  // audits/activity
  await page.route(/\/api\/v\d+\/audits\/recent(\?|$)/, j([]));
  // organization/usage (unit pool)
  const pool = (t: string) => ({ unit_type: t, total_allocated: 0, total_consumed: 0, available_units: 0, usage_percentage: 0, billing_cycle_start: null, billing_cycle_end: null });
  await page.route(/\/api\/v\d+\/unit-pool\/status(\?|$)/, j({ pools: { RS: pool('RS'), AS: pool('AS'), AIU: pool('AIU') } }));
  await page.route(/\/api\/v\d+\/unit-pool\/consumption-history(\?|$)/, j({ items: [], total: 0, page: 1, page_size: 50, total_pages: 0 }));
  await page.route(/\/api\/v\d+\/unit-pool\/usage-summary(\?|$)/, j({ total_consumed: 0, by_type: {}, days: 30 }));
  // recruitment/assessments/[id] detail (fixture id asm-001)
  await page.route(/\/api\/v\d+\/assessments\/asm-001(\?|$)/, j({ id: 'asm-001', title: 'Sample Assessment', description: '', status: 'draft', version: 1, duration_minutes: 60, hr_enabled: true, technical_enabled: true, coding_enabled: false, jd_id: 'jd-001', jd_title: 'Sample Job', invitations_count: 0, completed_count: 0, passed_count: 0, average_score: 0, pass_rate: 0, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }));
  // recruitment/resume-view/[id] detail (fixture id res-001)
  await page.route(/\/api\/v\d+\/resumes\/res-001(\?|$)/, j({ id: 'res-001', candidate_name: 'John Doe', email: 'john@example.com', phone: '+1234567890', current_title: 'Software Engineer', skills: [], education: [], experience: [], file_name: 'resume.pdf', file_type: 'pdf', file_size_kb: 100, extracted_text: 'Sample resume text', source: 'manual_upload', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', versions: [] }));
  await page.route(/\/api\/v\d+\/resumes\/res-001\/versions(\?|$)/, j([
    { id: 'res-001', file_name: 'Priya Sharma (09-09-2025 14_01).docx', created_at: '2026-10-01T04:17:00Z', file_size_kb: 36.4, uploaded_by_name: 'arunrajs', version: 1 },
  ]));
  await page.route(/\/api\/v\d+\/resumes\/res-001\/activity(\?|$)/, j({
    scores: { allowed: true, items: [] },
    talent_matches: { allowed: true, items: [] },
    assessments: { allowed: true, items: [] },
    interviews: { allowed: true, items: [] },
  }));

  if (!process.env.SKIP_LOGIN) {
    await loginViaUi(page);
  }
  const NOSHOT = !!process.env.NOSHOT;

  const errorMessages: string[] = [];
  if (process.env.DEBUG_CONSOLE) {
    page.on('pageerror', (e) => errorMessages.push(`PAGEERROR: ${String(e.message || e).split('\n').slice(0, 4).join(' | ')}`));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      for (const a of m.args()) {
        a.evaluate((v: unknown) => (v instanceof Error ? `${v.message}\n${v.stack || ''}` : typeof v === 'string' ? v : JSON.stringify(v)))
          .then((s: string) => { if (s && !/Failed to load resource|QuotaContext|\[Terms\]|session timeout/.test(s)) errorMessages.push(`ERR: ${s.split('\n').slice(0, 5).join(' | ').slice(0, 500)}`); })
          .catch(() => {});
      }
    });
  }

  console.log('=== SWEEP REPORT ===');
  for (const route of ROUTES) {
    try {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(route, { waitUntil: 'networkidle', timeout: 60_000 });
      await page.waitForTimeout(400);

      const overflow: Record<number, number> = {};
      for (const w of WIDTHS) {
        await page.setViewportSize({ width: w, height: 900 });
        await page.waitForTimeout(150);
        const over = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        overflow[w] = over;
        if (over > 1 && !NOSHOT) {
          await page.screenshot({
            path: `e2e/_shots/OVERFLOW${slug(route)}-${w}.png`,
            fullPage: false,
          });
        }
      }

      if (!NOSHOT) {
        const target = process.env.SCROLL_TARGET;
        for (const w of SHOT_WIDTHS) {
          await page.setViewportSize({ width: w, height: 900 });
          await page.waitForTimeout(200);
          if (target) {
            // This app's dashboard scrolls an inner container (h-[100dvh]), so
            // fullPage can't reach below-fold content — scroll the target into
            // view and shoot the viewport instead.
            try {
              await page.getByText(new RegExp(target)).first().scrollIntoViewIfNeeded({ timeout: 5000 });
              await page.waitForTimeout(400);
            } catch { /* target not present */ }
          }
          await page.screenshot({
            path: `e2e/_shots/shot${slug(route)}-${w}.png`,
            fullPage: !target,
          });
        }
      }

      const bad = WIDTHS.filter((w) => overflow[w] > 1).map((w) => `${w}:${overflow[w]}`);
      console.log(`ROUTE ${route} => ${bad.length ? 'OVERFLOW ' + bad.join(',') : 'OK'}`);
    } catch (e) {
      console.log(`ROUTE ${route} => CRASH ERR:${String(e).split('\n')[0]}`);
    }
  }
  if (process.env.DEBUG_CONSOLE) {
    await page.waitForTimeout(1000);
    console.log('=== ERRORS ===');
    for (const m of [...new Set(errorMessages)]) console.log(m);
  }
  console.log('=== END REPORT ===');
  expect(true).toBe(true);
});
