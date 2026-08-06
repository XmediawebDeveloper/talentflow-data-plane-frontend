/**
 * Tier 3: the QA environment, a real browser, and nothing faked.
 *
 * Tier 1 mocks every response, so it proves the UI renders. Tier 2 calls the API
 * directly, so it proves the backend behaves. Neither proves they work
 * *together*, and that gap is not theoretical: the login response nests its
 * token at `tokens.access_token`, and a client reading `access_token` off the
 * root gets undefined and 401s on every later call. Both tiers stay green while
 * nobody can log in.
 *
 * This tier closes that. The browser loads the QA frontend, the frontend calls
 * the QA backend at the URL baked into its own bundle, and the backend writes to
 * a real database. Real DNS, real TLS, real CORS preflight, real session
 * handling. No `page.route`, no interception, no substitution of any kind.
 *
 *   frontend   https://tfa.mo.vc      →  tf-qa-frontend   (:3200)
 *   backend    https://tfaapi.mo.vc   →  tf-qa-api        (:8200, talentflow_e2e)
 *
 * The QA backend is the same image the staging backend runs; only its database
 * differs. So the code under test is the code that ships, and the data it
 * touches is disposable.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * What this tier still does not prove
 * ────────────────────────────────────────────────────────────────────────────
 * The QA frontend is a second build of the same commit with different
 * NEXT_PUBLIC_* values, because those are baked in at build time. The code is
 * identical to the shipped image; the API URL is not. A bug in the *staging*
 * URL configuration would not be caught here — that belongs to the deploy smoke
 * check, which currently only requests `/` and should be asked to make one
 * authenticated call.
 */
import { expect, Page, APIRequestContext, request as playwrightRequest } from "@playwright/test";

/**
 * Hosts that serve real customers.
 *
 * Asserted against on every test rather than assumed away. The QA frontend is
 * built to call tfaapi.mo.vc, but a stale image, a cached bundle or an absolute
 * URL hardcoded somewhere in the app would all quietly send traffic to
 * production — and the whole point of a tier that writes real data is that it
 * must never write it there.
 */
const CLIENT_HOSTS = [/(^|\.)q2a\.in$/i];

export interface Tier3Target {
  /** The QA frontend, e.g. https://tfa.mo.vc */
  appUrl: string;
  /** The QA backend, e.g. https://tfaapi.mo.vc */
  apiUrl: string;
}

export interface Tier3Tenant {
  subdomain: string;
  adminEmail: string;
  adminPassword: string;
}

/**
 * Read and validate the target.
 *
 * No defaults, for the same reason Tier 2 has none: every fallback on this VM is
 * something a customer is using.
 */
export function readTier3Env(): Tier3Target {
  const appUrl = process.env.TIER3_APP_URL;
  const apiUrl = process.env.TIER3_API_URL;
  if (!appUrl || !apiUrl) {
    throw new Error(
      "Tier 3 needs TIER3_APP_URL (the QA frontend) and TIER3_API_URL (the QA " +
        "backend). Neither has a default: the fallbacks on this VM are all live.",
    );
  }
  for (const [name, url] of [["TIER3_APP_URL", appUrl], ["TIER3_API_URL", apiUrl]] as const) {
    const { hostname, port } = new URL(url);
    if (CLIENT_HOSTS.some((re) => re.test(hostname))) {
      throw new Error(`${name}=${url} is a customer-facing host. Tier 3 must not touch it.`);
    }
    if (["8000", "8001", "8101"].includes(port)) {
      throw new Error(
        `${name}=${url} points at port ${port}. 8000/8001 are the systemd services ` +
          `clients use; 8101 is the staging backend, which writes to ` +
          `talentflow_landlord — the live database.`,
      );
    }
  }
  return { appUrl, apiUrl };
}

export function readTier3Tenant(): Tier3Tenant {
  const subdomain = process.env.TIER3_TENANT_SUBDOMAIN;
  const adminEmail = process.env.TIER3_ADMIN_EMAIL;
  const adminPassword = process.env.TIER3_ADMIN_PASSWORD;
  if (!subdomain || !adminEmail || !adminPassword) {
    throw new Error(
      "Tier 3 needs TIER3_TENANT_SUBDOMAIN, TIER3_ADMIN_EMAIL and " +
        "TIER3_ADMIN_PASSWORD. The QA tenant is provisioned once by " +
        "e2e/scripts/tier2-provision.py and reused; the pipeline reads it from " +
        "/opt/talentflow/qa/tenant.json.",
    );
  }
  return { subdomain, adminEmail, adminPassword };
}

/** One API call the page made, recorded so a failure names the call that broke. */
export interface ApiCall {
  method: string;
  path: string;
  status: number;
  host: string;
  /** Parsed JSON body, when the response had one. Null for sockets and blobs. */
  body?: unknown;
  /** The full request URL, kept so a token leaked into a query string is visible. */
  url: string;
  /** Whether the request carried an Authorization header. */
  authorized: boolean;
}

/**
 * Watch what the page actually talks to.
 *
 * Nothing is intercepted — this only observes. The returned array is asserted on
 * at the end of each test, which is what turns "we believe it points at QA" into
 * something checked.
 */
export function watchApiTraffic(page: Page): ApiCall[] {
  const calls: ApiCall[] = [];
  page.on("response", (res) => {
    const url = new URL(res.url());
    if (!/\/api\/v\d+\//.test(url.pathname)) return;
    const call: ApiCall = {
      method: res.request().method(),
      path: url.pathname,
      status: res.status(),
      host: url.hostname,
      // The query string is kept but never printed — see `describe`. A token in
      // a URL is a real finding, and the test that looks for one needs the raw
      // value; every other reader must not be able to leak it into a log.
      url: res.url(),
      authorized: Boolean(res.request().headers()["authorization"]),
    };
    calls.push(call);

    // Bodies are read lazily and failures swallowed: a WebSocket upgrade, a
    // redirect or a file download has no JSON body, and none of those is an
    // error. Tests that need a body wait for it via `settle()`.
    if (res.status() >= 400 || res.status() === 101) return;
    res
      .json()
      .then((b) => {
        call.body = b;
      })
      .catch(() => {});
  });
  return calls;
}

/**
 * Wait for the page to stop talking, then let the deferred body reads land.
 *
 * `networkidle` alone is not enough: the response bodies above are read in a
 * promise chain that resolves after the response event, so an assertion running
 * immediately on `networkidle` sees `body: undefined` on calls that plainly had
 * one. The extra tick is small and removes a whole class of flake.
 *
 * The notification WebSocket stays open for the life of the page, so
 * `networkidle` can never fire on a signed-in page and a failure here would be
 * a timeout, not a signal. `domcontentloaded` plus a settle delay is what
 * actually works.
 */
export async function settle(page: Page, ms = 2500): Promise<void> {
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await page.waitForTimeout(ms);
}

/** Nothing reached a customer-facing host, and something reached the QA one. */
export function assertTrafficStayedInQa(calls: ApiCall[], apiUrl: string): void {
  const expected = new URL(apiUrl).hostname;

  const leaked = calls.filter((c) => CLIENT_HOSTS.some((re) => re.test(c.host)));
  expect(
    leaked.map((c) => `${c.method} ${c.host}${c.path}`),
    "a request reached a customer-facing host — Tier 3 must never touch production",
  ).toEqual([]);

  // The negative alone would pass a test that made no calls at all.
  expect(
    calls.some((c) => c.host === expected),
    `no API call reached ${expected}. Calls seen: ${describe(calls)}`,
  ).toBe(true);
}

/** Readable call list for a failure message. */
export function describe(calls: ApiCall[]): string {
  if (!calls.length) return "(none)";
  return calls.map((c) => `${c.method} ${c.host}${c.path} → ${c.status}`).join("\n");
}

/**
 * Log in through the real form, the way a person does.
 *
 * No mocked auth, no injected token, no seeded storage. If login is broken, this
 * is the test that says so.
 */
export async function loginForReal(page: Page, tenant: Tier3Tenant): Promise<void> {
  // `org` is not optional: without it the backend resolves no tenant and the
  // credentials are correct for nobody.
  await page.goto(`/login?org=${encodeURIComponent(tenant.subdomain)}`);

  await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
  await page.getByPlaceholder(/enter your email/i).fill(tenant.adminEmail);
  await page.getByPlaceholder(/enter your password/i).fill(tenant.adminPassword);
  await page.getByRole("button", { name: /sign in/i }).click();
}

/**
 * Log in and wait until the app has actually arrived somewhere signed-in.
 *
 * Most journeys are not about login, they only need a session; this is the one
 * line they share. It fails loudly rather than letting a later assertion fail
 * for a reason that has nothing to do with what that test is checking.
 */
export async function signIn(
  page: Page,
  creds?: { email: string; password: string; subdomain?: string },
): Promise<void> {
  const tenant = readTier3Tenant();
  const who = creds
    ? { subdomain: creds.subdomain ?? tenant.subdomain, adminEmail: creds.email, adminPassword: creds.password }
    : tenant;
  await loginForReal(page, who);
  await expect(page, "sign-in did not leave /login").not.toHaveURL(/\/login/, { timeout: 30_000 });
  await expect(page.getByLabel("TalentFlow home")).toBeVisible({ timeout: 20_000 });

  // The overlay appears a beat after the dashboard renders, once the T&C status
  // has loaded. Clearing it here keeps every other journey about its own
  // subject instead of failing on an intercepted click.
  await page.waitForTimeout(2000);
  await acceptTermsIfBlocked(page);
}

/**
 * Sign out the way a person does — open the account menu, click Sign Out.
 *
 * Doing it by hand is not an option here, and the reason is worth recording:
 * `lib/utils/tokenRecovery.ts` mirrors the token into cookies, so clearing
 * localStorage logs nobody out. The next navigation restores the session and
 * the test passes for a completely wrong reason. Only the app's own logout
 * clears both.
 *
 * The account button carries no accessible name — it renders the avatar,
 * the user's name and a chevron — so it is located by the chevron. The plan
 * chip ("QA Unlimited · 0 units left") grew a chevron of its own, so the
 * chevron alone is no longer unique and picking the first match opened the plan
 * popover instead, which then swallowed the click. Excluding it by its text is
 * what keeps this pointing at the account menu.
 */
export const ACCOUNT_MENU = "header button:has(.lucide-chevron-down)";

export function accountMenu(page: Page) {
  return page.locator(ACCOUNT_MENU).filter({ hasNotText: /units left/i }).first();
}

export async function signOut(page: Page): Promise<void> {
  await accountMenu(page).click();
  const out = page.getByRole("button", { name: /^\s*sign out\s*$/i });
  await expect(out, "the account menu opened but had no Sign Out button").toBeVisible({
    timeout: 10_000,
  });
  await out.click();
}

/**
 * Accept the Terms & Conditions the way a new tenant admin has to.
 *
 * This is not a workaround, it is onboarding. A freshly provisioned tenant has
 * three unaccepted documents whose grace period has already lapsed, so the app
 * puts a full-screen blocking overlay over everything until an owner accepts
 * them. Every other journey in this tier is unreachable behind it.
 *
 * Idempotent: once accepted the overlay never returns, so this is a no-op on
 * every run after the first.
 */
export async function acceptTermsIfBlocked(page: Page): Promise<boolean> {
  const open = page.getByRole("button", { name: /review & accept terms/i });
  if (!(await open.isVisible().catch(() => false))) return false;
  await open.click();

  // "Accept & Continue (1/3)" — the count is in the label, so the loop reads it
  // rather than assuming three. A tenant with a different document set would
  // otherwise be half-accepted and still blocked.
  for (let guard = 0; guard < 10; guard++) {
    const accept = page.getByRole("button", { name: /accept & continue/i });
    if (!(await accept.isVisible().catch(() => false))) break;

    const consent = page.getByRole("checkbox").first();
    if (await consent.isVisible().catch(() => false)) await consent.check();

    await expect(accept, "the consent box was ticked but Accept stayed disabled").toBeEnabled({
      timeout: 10_000,
    });
    await accept.click();
    await page.waitForTimeout(1500);
  }

  await expect(
    page.getByRole("heading", { name: /terms & conditions update/i }),
    "the terms were accepted and the blocking overlay is still up",
  ).toHaveCount(0, { timeout: 20_000 });
  return true;
}

/**
 * Open the list a page hides behind a tile or tab.
 *
 * Several list pages land on a summary — Job Openings shows "Total Jobs 9 ·
 * Published 4 · Drafts 5 · Archived 0" and nothing else until one is clicked.
 * Asserting on the landing state alone would report "the JD is not on the page"
 * when the page is behaving exactly as designed, so the journey does what a
 * person does and clicks through.
 *
 * Returns whether anything was clicked, so a caller can tell "I opened the
 * list" from "the list was already open".
 */
export async function revealList(page: Page, label: RegExp): Promise<boolean> {
  for (const role of ["tab", "button", "link"] as const) {
    const el = page.getByRole(role, { name: label }).first();
    if (await el.isVisible().catch(() => false)) {
      await el.click().catch(() => {});
      await page.waitForTimeout(2500);
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Contract assertions
// ---------------------------------------------------------------------------

/**
 * 5xx responses this environment produces for a reason that is not the code's
 * fault, each one measured rather than assumed.
 *
 * This list is deliberately narrow and each entry states what it costs. A
 * blanket "ignore 5xx" would defeat the assertion; naming them keeps every
 * other 5xx fatal while stopping a known environment gap from failing every
 * single journey.
 */
const KNOWN_ENV_GAPS: { endpoint: RegExp; status: number; why: string }[] = [
  {
    // Everything the backend proxies to ADMIN_API_URL: quotas, terms, plan
    // changes, subscription and add-ons.
    endpoint: /\/(usage\/quota-status|terms-and-conditions|plan-changes|subscription|addons)\b/,
    status: 503,
    why:
      "these endpoints proxy to ADMIN_API_URL — the control plane — and this " +
      "environment deliberately cannot reach it. The shipped value is " +
      "https://rmscp.q2a.in, which serves real customers, and QA must never send " +
      "traffic there; it is pointed at a dead local port instead. The QA tenant " +
      "does not exist in the control plane either, so even reachable it would 404. " +
      "Everything downstream degrades correctly: the frontend's TermsProvider " +
      "fails open, so no blocking overlay appears. Worth recording separately " +
      "that a dependency outage turning into a 5xx on the dashboard, rather than " +
      "a degraded-but-usable response, is arguably a product issue in its own right.",
  },
];

/**
 * Every call the page made came back below 500.
 *
 * A 4xx can be legitimate — an unentitled feature, an empty optional resource —
 * but a 5xx is never the UI's fault and never acceptable on a page a user can
 * reach.
 */
export function assertNoServerErrors(calls: ApiCall[], where: string): void {
  const excused: string[] = [];
  const broken = calls.filter((c) => {
    if (c.status < 500) return false;
    const gap = KNOWN_ENV_GAPS.find((g) => g.status === c.status && g.endpoint.test(c.path));
    if (gap) {
      excused.push(`${c.method} ${c.path} → ${c.status} (known: ${gap.why})`);
      return false;
    }
    return true;
  });
  if (excused.length) console.log(`[tier3] ${where}: excused ${excused.length} known 5xx`);
  expect(
    broken.map((c) => `${c.method} ${c.path} → ${c.status}`),
    `${where} made calls that 5xx'd`,
  ).toEqual([]);
}

/**
 * The page rendered something a person can act on.
 *
 * Three failure shapes are all rendered "successfully" by React and all mean
 * the page is broken: the error boundary, a permanent loading state, and the
 * generic network-failure banner the login page showed when CORS was wrong.
 */
export async function assertPageHealthy(page: Page, where: string): Promise<void> {
  await expect(
    page.getByRole("heading", { name: /we couldn't load this page|something went wrong/i }),
    `${where} rendered an error boundary`,
  ).toHaveCount(0);
  await expect(page.getByText(/^network error$/i), `${where} shows "Network Error"`).toHaveCount(0);
  await expect(page.getByText(/session expired/i), `${where} shows "Session Expired"`).toHaveCount(0);

  // A spinner still on screen after the page has settled is a page that never
  // finished — indistinguishable from a healthy one to any assertion that only
  // checks for the absence of errors.
  const spinners = page.locator('[role="status"], .animate-spin');
  const stuck = await spinners.count();
  if (stuck > 0) {
    await expect(spinners.first(), `${where} is still loading after it settled`).toBeHidden({
      timeout: 15_000,
    });
  }
}

/** Fields a list item might reasonably be displayed by, most specific first. */
const DISPLAY_FIELDS = ["title", "name", "full_name", "job_id", "email", "subject", "action"];

/** Pull the array of items out of whatever envelope the endpoint returned. */
function itemsOf(body: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  if (!body || typeof body !== "object") return null;
  for (const key of ["items", "data", "results", "records"]) {
    const v = (body as Record<string, unknown>)[key];
    if (Array.isArray(v)) return v as Record<string, unknown>[];
  }
  return null;
}

/**
 * The single most valuable assertion in this tier.
 *
 * It takes the list the backend actually returned, picks the first item's
 * human-readable field, and requires that exact string to be on screen. That is
 * the UI and the API agreeing on a shape, checked rather than assumed — the one
 * thing neither other tier can do. Tier 1 renders whatever its own mock says,
 * so it agrees with itself by construction; Tier 2 sees the real shape but has
 * no DOM to compare it against.
 *
 * When the backend returned nothing, the requirement flips: the page must say
 * so. A blank panel and an empty list are the same DOM to a naive assertion,
 * and only one of them is correct.
 */
export async function assertListMatchesApi(
  page: Page,
  calls: ApiCall[],
  opts: { where: string; endpoint: RegExp; emptyText?: RegExp },
): Promise<void> {
  const listCalls = calls.filter(
    (c) => c.method === "GET" && opts.endpoint.test(c.path) && c.status < 400 && itemsOf(c.body),
  );
  expect(
    listCalls.length,
    `${opts.where}: no successful GET matching ${opts.endpoint} returned a list. ` +
      `Calls:\n${describe(calls)}`,
  ).toBeGreaterThan(0);

  // The largest response wins: several endpoints can match, and a page that
  // loads both a filter's options and its rows should be judged on the rows.
  const items = listCalls
    .map((c) => itemsOf(c.body)!)
    .reduce((best, cur) => (cur.length > best.length ? cur : best), [] as Record<string, unknown>[]);

  if (items.length === 0) {
    if (opts.emptyText) {
      await expect(
        page.getByText(opts.emptyText).first(),
        `${opts.where}: the API returned no items and the page does not say so — ` +
          `a user cannot tell "nothing here" from "failed to load"`,
      ).toBeVisible({ timeout: 15_000 });
    }
    return;
  }

  const first = items[0];
  const field = DISPLAY_FIELDS.find(
    (f) => typeof first[f] === "string" && (first[f] as string).trim().length > 2,
  );
  expect(
    field,
    `${opts.where}: the API returned ${items.length} item(s) but none of ` +
      `${DISPLAY_FIELDS.join("/")} is a displayable string. Keys: ${Object.keys(first).join(", ")}`,
  ).toBeTruthy();

  const value = (first[field!] as string).trim();
  await expect(
    page.getByText(value, { exact: false }).first(),
    `${opts.where}: the API returned an item whose ${field} is "${value}", and that ` +
      `text is nowhere on the page. The UI is reading a different shape from the ` +
      `one the backend writes.`,
  ).toBeVisible({ timeout: 15_000 });
}

/**
 * What a developer needs in order to see the defect for themselves.
 *
 * A dashboard row saying "TC-T401 failed" tells a developer that something is
 * wrong and nothing else — they still have to find the test, read it, work out
 * what it was doing and reproduce it by hand. Every one of those steps is work
 * the test already knows how to skip.
 *
 * So a pinned defect records the whole thing: the click path, what should
 * happen, what does happen, and where to look. It is attached to the test
 * result, folded into qa-cases.json by build-report, and shown in the
 * dashboard's Issues panel — so the person who has to fix it reads it there
 * rather than asking whoever wrote the test.
 *
 * Written by hand rather than recorded automatically. A recorded click trace
 * says "clicked button at (412, 208)"; a person needs "open My Resumes, click
 * Upload Resume".
 */
export interface Defect {
  /** One line: what is broken, in the words a person would use. */
  summary: string;
  /** Click by click, from a signed-in dashboard. */
  steps: string[];
  /** What should happen. */
  expected: string;
  /** What happens instead. */
  actual: string;
  /** Anything measured: status codes, request parameters, log lines. */
  evidence?: string[];
  /** Files or endpoints worth opening first. Not a diagnosis. */
  where?: string[];
  /** Who this is for: the app team, or whoever runs the infrastructure. */
  owner?: "developer" | "infrastructure";
}

export async function recordDefect(
  testInfo: { attach: (name: string, options: { body: string; contentType: string }) => Promise<void> },
  defect: Defect,
): Promise<void> {
  await testInfo.attach("defect", {
    body: JSON.stringify(defect, null, 2),
    contentType: "application/json",
  });
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

/** Distinct per test, and greppable in the QA database afterwards. */
export function uniqueSuffix(): string {
  return `t3${Math.random().toString(36).slice(2, 8)}${process.pid.toString(36)}`;
}

/** An authenticated API client for the QA backend, as the tenant admin. */
export async function adminApi(): Promise<APIRequestContext> {
  const { apiUrl } = readTier3Env();
  const tenant = readTier3Tenant();
  const ctx = await playwrightRequest.newContext({ baseURL: apiUrl });
  const auth = await ctx.post("/api/v1/auth/login", {
    data: { email: tenant.adminEmail, password: tenant.adminPassword, subdomain: tenant.subdomain },
  });
  if (!auth.ok()) {
    await ctx.dispose();
    throw new Error(`admin login failed (${auth.status()}): ${(await auth.text()).slice(0, 300)}`);
  }
  const token = (await auth.json())?.tokens?.access_token;
  await ctx.dispose();
  return playwrightRequest.newContext({
    baseURL: apiUrl,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Put a record in the database over HTTP so a UI journey has something to show.
 *
 * Seeding through the API rather than the UI is a deliberate split of
 * responsibility. `POST /jd` is already covered exhaustively by Tier 2 — 1,266
 * rows of it — so re-proving it through a wizard here would be slow and would
 * blame the wrong layer when it broke. What is *not* covered anywhere else, and
 * what this seeds for, is whether the UI renders the shape the backend actually
 * returned. The separate journeys that create a record through the real form
 * are about the form; these are about the render.
 */
export async function seed(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const api = await adminApi();
  try {
    const res = await api.post(endpoint, { data: body });
    if (!res.ok()) {
      throw new Error(
        `could not seed ${endpoint} (${res.status()}): ${(await res.text()).slice(0, 400)}`,
      );
    }
    return (await res.json()) as Record<string, unknown>;
  } finally {
    await api.dispose();
  }
}

/**
 * A job description with a title unique to this run, so it is findable on screen.
 *
 * Published, not draft. Job Openings counts drafts in its stat tiles but lists
 * only published roles, so a draft seed produces the confusing result of
 * "Total Jobs 5, Drafts 5" above a list with no titles in it — the page is
 * right and the fixture is wrong. `status: "published"` is honoured on create,
 * so no separate publish call is needed.
 */
export async function seedJd(marker = uniqueSuffix()): Promise<{ id: string; title: string }> {
  const title = `E2E T3 JD ${marker}`;
  const created = await seed("/api/v1/jd", {
    title,
    description: "Seeded by the Tier-3 suite so the UI has a real record to render.",
    must_have_skills: ["Python"],
    experience_min: 1,
    experience_max: 5,
    status: "published",
  });
  return { id: String(created.id ?? ""), title };
}

/**
 * Create a user through the API so a UI journey can log in as them.
 *
 * The creation itself is not what is under test — Tier 2 already covers
 * `POST /users` exhaustively. What is under test is what the *browser* does
 * once that user signs in, so getting them into existence over HTTP keeps the
 * journey short and the failure attributable.
 */
export async function createUserForUi(
  role: string,
): Promise<{ email: string; password: string; name: string }> {
  const { apiUrl } = readTier3Env();
  const tenant = readTier3Tenant();
  const suffix = uniqueSuffix();
  const email = `e2e-t3-${role}-${suffix}@example.com`;
  const password = `E2e!${suffix}Cc3`;
  const name = `E2E T3 ${role} ${suffix}`;

  const admin = await playwrightRequest.newContext({ baseURL: apiUrl });
  try {
    const auth = await admin.post("/api/v1/auth/login", {
      data: { email: tenant.adminEmail, password: tenant.adminPassword, subdomain: tenant.subdomain },
    });
    if (!auth.ok()) {
      throw new Error(`admin login failed (${auth.status()}): ${(await auth.text()).slice(0, 300)}`);
    }
    const token = (await auth.json())?.tokens?.access_token;
    const created = await admin.post("/api/v1/users", {
      headers: { Authorization: `Bearer ${token}` },
      data: { email, name, password, role },
    });
    if (!created.ok()) {
      throw new Error(
        `could not create a ${role} for the UI journey (${created.status()}): ` +
          `${(await created.text()).slice(0, 300)}`,
      );
    }
  } finally {
    await admin.dispose();
  }
  return { email, password, name };
}
