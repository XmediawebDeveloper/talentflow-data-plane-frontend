/**
 * Tier-2 fixture: a real backend, a throwaway database, and a tenant the CI job
 * provisioned for this run.
 *
 * Tier 1 mocks every API call, so it can prove the UI renders but never that
 * anything persisted. Tier 2 talks to a live backend — which means the single
 * most important thing this file does is refuse to run against the wrong one.
 *
 * The runner is a *shell* executor sharing its VM with the staging containers,
 * and the staging backend points at `talentflow_landlord` — the same database
 * real clients read. A Tier-2 run creates JDs, uploads resumes, consumes units
 * and writes audit rows. Pointed at the wrong host it would do all of that in
 * front of customers. Hence the guards below: they fail loudly and early rather
 * than trusting a job definition to have set the right variable.
 *
 * Everything here is shaped by what the backend actually returned when probed on
 * 2026-08-04 against a throwaway container on port 8199. Each surprise is
 * recorded at the line it affects, because every one of them would otherwise
 * have failed all 874 rows at once and looked like a harness bug.
 */
import { APIRequestContext, request as playwrightRequest } from "@playwright/test";

/** Ports that serve real data on this VM. Never a valid Tier-2 target. */
const FORBIDDEN_PORTS = new Set(["8000", "8001", "8101", "80", "443"]);

/** Database names that belong to live systems. */
const FORBIDDEN_DBS = new Set([
  "talentflow_landlord",
  "talentflow_shared",
  "talentflow_trail",
  "postgres",
  "machine",
]);

export interface Tier2Env {
  /** Base URL of the throwaway backend, e.g. http://localhost:8199 */
  apiUrl: string;
  /** Database the throwaway backend is pointed at — asserted, not assumed. */
  dbName: string;
}

/**
 * Read and validate the target. Throws unless every guard passes.
 *
 * Deliberately strict: a Tier-2 job that has not set these is a job that would
 * otherwise hit whatever the default is, and the default on this VM is live.
 */
export function readTier2Env(): Tier2Env {
  const apiUrl = process.env.TIER2_API_URL;
  const dbName = process.env.TIER2_DB_NAME;

  if (!apiUrl || !dbName) {
    throw new Error(
      "Tier 2 needs TIER2_API_URL and TIER2_DB_NAME. Neither has a default on " +
        "purpose — the fallbacks on this VM are the live backend and the live " +
        "database, and a silent default there writes test data in front of customers.",
    );
  }

  const port = new URL(apiUrl).port;
  if (FORBIDDEN_PORTS.has(port)) {
    throw new Error(
      `TIER2_API_URL points at port ${port}, which serves live data on this VM ` +
        `(8000/8001 are the systemd services real clients use, 8101 is the staging ` +
        `container, 80/443 are nginx). Tier 2 must target a throwaway backend.`,
    );
  }

  if (FORBIDDEN_DBS.has(dbName)) {
    throw new Error(
      `TIER2_DB_NAME is "${dbName}", which is a live database. Tier 2 creates, ` +
        `updates and deletes records and consumes billing units — it must run ` +
        `against a database that can be dropped.`,
    );
  }

  return { apiUrl, dbName };
}

/** The tenant this run was given, plus a token for its admin. */
export interface Tier2Tenant {
  tenantId: string;
  subdomain: string;
  adminEmail: string;
  adminPassword: string;
  accessToken: string;
}

/**
 * Unique per run so repeated runs never collide, and so a leaked record is
 * traceable back to the run that made it.
 *
 * The domain is `example.com` and not the more correct `example.test`: the
 * backend validates addresses with pydantic's `EmailStr`, which rejects
 * reserved TLDs outright —
 *
 *   "value is not a valid email address: The part after the @-sign is a
 *    special-use or reserved name that cannot be used with email"
 *
 * — so every `.test` address 422s before reaching any application code.
 */
function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Pull the access token out of a login response.
 *
 * `POST /auth/login` returns `LoginResponse`, which nests the tokens:
 *   {user, tenant_name, tokens: {access_token, refresh_token, …}, …}
 * Reading `access_token` off the root — the obvious guess — silently yields
 * undefined and every later call 401s for no visible reason. The flat variant is
 * only served by `/auth/login/swagger`, which exists precisely because Swagger
 * could not read the nested shape either.
 */
function extractToken(auth: Record<string, unknown>): string {
  const tokens = auth.tokens as Record<string, unknown> | undefined;
  const token =
    (tokens?.access_token as string | undefined) ??
    (auth.access_token as string | undefined) ??
    (auth.token as string | undefined);
  if (!token) {
    throw new Error(
      `login succeeded but carried no access token. Top-level keys: ` +
        `${Object.keys(auth).join(", ")}; tokens keys: ` +
        `${tokens ? Object.keys(tokens).join(", ") : "(no tokens object)"}`,
    );
  }
  return token;
}

/**
 * Log in as the tenant the CI job provisioned for this run.
 *
 * The suite does *not* register its own tenant, though that was the original
 * design. `POST /api/v1/tenants/register` is broken — measured, not inferred:
 *
 *   File "/app/app/routers/tenants.py", line 33, in register_tenant
 *       return await tenant_service.create_tenant(request)
 *   TypeError: TenantService.create_tenant() missing 1 required positional
 *              argument: 'password'
 *
 * It returns 500 for every well-formed body, so there is no HTTP path to a new
 * tenant that does not go through the remote control plane. Instead the job runs
 * `e2e/scripts/tier2-provision.py` inside the backend container, which drives
 * `ProvisioningService` directly, and passes the result in through these three
 * variables. That keeps the harness honest: if provisioning fails, the suite
 * refuses to start rather than falling back to some pre-existing tenant.
 */
export async function loginProvisionedTenant(api: APIRequestContext): Promise<Tier2Tenant> {
  const subdomain = process.env.TIER2_TENANT_SUBDOMAIN;
  const adminEmail = process.env.TIER2_ADMIN_EMAIL;
  const adminPassword = process.env.TIER2_ADMIN_PASSWORD;

  if (!subdomain || !adminEmail || !adminPassword) {
    throw new Error(
      "Tier 2 needs TIER2_TENANT_SUBDOMAIN, TIER2_ADMIN_EMAIL and " +
        "TIER2_ADMIN_PASSWORD, which e2e/scripts/tier2-provision.py emits. The " +
        "suite cannot register a tenant itself: POST /api/v1/tenants/register " +
        "raises TypeError in the backend and 500s on every request.",
    );
  }

  // `subdomain` is not optional in practice. Login falls back to parsing it out
  // of the Host header, and `localhost:8199` yields nothing, so without it the
  // lookup runs against no tenant at all.
  const loggedIn = await api.post("/api/v1/auth/login", {
    data: { email: adminEmail, password: adminPassword, subdomain },
  });
  if (!loggedIn.ok()) {
    throw new Error(
      `login failed for the provisioned tenant "${subdomain}" ` +
        `(${loggedIn.status()}): ${(await loggedIn.text()).slice(0, 400)}`,
    );
  }
  const auth = await loggedIn.json();

  return {
    tenantId: auth.user?.tenant_id ?? "",
    subdomain,
    adminEmail,
    adminPassword,
    accessToken: extractToken(auth),
  };
}

/** An unauthenticated client against the validated Tier-2 backend. */
export async function anonymousApi(): Promise<APIRequestContext> {
  const { apiUrl } = readTier2Env();
  return playwrightRequest.newContext({ baseURL: apiUrl });
}

/** A client carrying the tenant admin's bearer token. */
export async function authedApi(tenant: Tier2Tenant): Promise<APIRequestContext> {
  const { apiUrl } = readTier2Env();
  return playwrightRequest.newContext({
    baseURL: apiUrl,
    extraHTTPHeaders: { Authorization: `Bearer ${tenant.accessToken}` },
  });
}

/**
 * Create a second user in the tenant with a narrower role, and log it in.
 *
 * The 190 rbac_denied rows all have the same shape: one role may do a thing and
 * another may not. Asserting that needs two real principals, not two mocked
 * permission payloads — a mock proves the UI hides a button, not that the
 * backend refuses the call. Probed end to end: a `viewer` gets
 * `403 {"detail":"Permission denied: jd:create"}` on POST /jd while still
 * reading it with 200, which is exactly the distinction the rows assert.
 *
 * `UserCreate` calls the field `name`, not `full_name`. Sending `full_name`
 * fails validation on a required field rather than being ignored.
 */
export async function createUser(
  api: APIRequestContext,
  role: string,
  tenant: Tier2Tenant,
): Promise<{ email: string; password: string; accessToken: string }> {
  const suffix = uniqueSuffix();
  const email = `e2e-${role}-${suffix}@example.com`;
  const password = `E2e!${suffix}Bb2`;

  const created = await api.post("/api/v1/users", {
    data: { email, name: `E2E ${role}`, password, role },
  });
  if (!created.ok()) {
    throw new Error(
      `could not create a ${role} (${created.status()}): ${(await created.text()).slice(0, 300)}`,
    );
  }

  const { apiUrl } = readTier2Env();
  const anon = await playwrightRequest.newContext({ baseURL: apiUrl });
  try {
    const loggedIn = await anon.post("/api/v1/auth/login", {
      data: { email, password, subdomain: tenant.subdomain },
    });
    if (!loggedIn.ok()) {
      throw new Error(
        `could not log in as the ${role} just created (${loggedIn.status()}): ` +
          `${(await loggedIn.text()).slice(0, 300)}`,
      );
    }
    return { email, password, accessToken: extractToken(await loggedIn.json()) };
  } finally {
    await anon.dispose();
  }
}
