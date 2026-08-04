/**
 * Shared runner for the Tier-2 cases mapped out of the tracking sheet.
 *
 * e2e/scripts/map-tier2-cases.mjs turns each Tier-2 row into a row of
 * tier2-cases.xlsx carrying an endpoint and an assertion kind. This module
 * expands those rows into one test() each, titled with the tc_id so a CI
 * failure names the sheet row directly.
 *
 * Every assertion here talks to a real backend. That is the whole point: Tier 1
 * mocks the response, so it can prove a page rendered but never that a record
 * survived a reload, that an audit row was written, that units actually came
 * off the balance, or that the backend — not just the UI — refuses a recruiter.
 *
 * Rows the mapper could not place run as `test.skip` with their reason
 * attached — visible in the report, never counted as a pass.
 */
import { test, expect, APIRequestContext } from "@playwright/test";
import { loadRowsSync } from "./excel";
import {
  readTier2Env,
  loginProvisionedTenant,
  createUser,
  anonymousApi,
  authedApi,
  Tier2Tenant,
} from "./tier2-backend";

export interface Tier2Row {
  tc_id: string;
  scrum_id: string;
  source_sheet: string;
  title: string;
  what_to_check: string;
  expected_result: string;
  rule: string;
  /** API path the assertion exercises, e.g. /api/v1/jd */
  endpoint: string;
  role: string;
  assert_kind: string;
  /** Meaning depends on assert_kind — a field list, a field=value filter, a role. */
  assert_value: string;
  confidence: string;
  layer: string;
  status: string;
  note: string;
}

export function loadTier2Rows(): Tier2Row[] {
  return loadRowsSync<Tier2Row>("tier2-cases");
}

/**
 * A minimal valid body per endpoint, for the assertions that must create
 * something before they can check it survived.
 *
 * Kept deliberately small: the point is a record that exists, not a realistic
 * one. Anything richer becomes a second thing that can break.
 */
function validPayload(endpoint: string, marker: string): Record<string, unknown> | null {
  if (endpoint.startsWith("/api/v1/jd")) {
    return {
      title: `E2E JD ${marker}`,
      description: "Created by the Tier-2 suite to verify persistence.",
      must_have_skills: ["Python"],
      experience_min: 1,
      experience_max: 5,
    };
  }
  if (endpoint.startsWith("/api/v1/folders")) {
    return { name: `E2E Folder ${marker}` };
  }
  if (endpoint.startsWith("/api/v1/assessments")) {
    // `jd_id` is required and must be a real JD, so this payload is only
    // complete once seedJdId() has run — see makeAssessmentPayload.
    return null;
  }
  return null;
}

/**
 * An assessment body, which needs a JD that actually exists.
 *
 * `AssessmentCreate` requires `jd_id: UUID` and bounds `duration_minutes` to
 * 15..180, so the generic empty-ish payload the other endpoints accept is
 * rejected here. Kept separate from validPayload() because it needs the id of
 * something the suite created first.
 */
function makeAssessmentPayload(jdId: string, marker: string): Record<string, unknown> {
  return {
    jd_id: jdId,
    title: `E2E Assessment ${marker}`,
    description: "Created by the Tier-2 suite.",
    duration_minutes: 30,
    hr_enabled: true,
    hr_percentage: 40,
    hr_topics: ["Communication"],
    // Technical + coding must total exactly 100, and HR is scored separately —
    // the backend rejects anything else with
    //   400 "Technical + Coding percentages must sum to 100% (currently 60%)"
    // so the intuitive 60/0 split is not a valid assessment.
    technical_enabled: true,
    technical_percentage: 100,
    technical_topics: ["Python"],
    coding_enabled: false,
    coding_percentage: 0,
  };
}

/**
 * A body the backend must reject.
 *
 * The 125 hard-constraint rows all describe a limit the backend enforces. An
 * empty required field is the one violation every one of these endpoints has in
 * common, so it is what the generic assertion uses; rows needing a specific
 * limit (folder nesting depth, duration bounds) get a group mapping instead.
 */
function invalidPayload(endpoint: string): Record<string, unknown> | null {
  if (endpoint.startsWith("/api/v1/jd")) return { title: "", description: "" };
  if (endpoint.startsWith("/api/v1/folders")) return { name: "" };
  return null;
}

/** Pull the list out of whichever envelope the endpoint uses. */
function itemsOf(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  const b = body as Record<string, unknown>;
  for (const key of ["items", "data", "results"]) {
    if (Array.isArray(b?.[key])) return b[key] as unknown[];
  }
  return [];
}

/** Read the tenant's unit balance, whatever the endpoint chooses to call it. */
async function unitBalance(api: APIRequestContext): Promise<number> {
  const res = await api.get("/api/v1/tenants/units");
  expect(res.ok(), `GET /tenants/units failed (${res.status()}) — cannot measure unit spend`).toBe(true);
  const body = await res.json();
  for (const key of ["available", "available_units", "balance", "remaining", "units_remaining"]) {
    if (typeof body?.[key] === "number") return body[key];
  }
  throw new Error(`no recognisable balance field in /tenants/units. Keys: ${Object.keys(body).join(", ")}`);
}

/**
 * Emit one test per row.
 *
 * @param suite  describe() title
 * @param rows   the slice of tier2-cases.xlsx this spec owns
 */
export function runTier2Cases(suite: string, rows: Tier2Row[]) {
  test.describe(suite, () => {
    // Same hazard as Tier 1: loadRowsSync() returns [] when the JSON mirror is
    // missing, which would make this suite contribute zero tests and let a
    // broken pipeline report green. One failing test is the only honest outcome.
    //
    // But an empty *slice* is not the same as an empty *workbook*. Every billing
    // row is currently blocked on the /tenants/units 500, so the billing spec
    // legitimately owns nothing — checking `rows.length` alone turned that into a
    // hard failure and would have pushed the next person to weaken the guard.
    // The question worth asking is whether the workbook loaded at all.
    if (rows.length === 0) {
      const workbookLoaded = loadTier2Rows().length > 0;
      test(
        workbookLoaded
          ? `${suite} — every row is blocked, nothing to run`
          : `${suite} — NO CASES LOADED`,
        () => {
          if (workbookLoaded) {
            test.info().annotations.push({
              type: "blocked",
              description:
                `${suite} has no active rows: the workbook loaded, but every row this ` +
                `spec owns is currently blocked. See the blocked reasons in ` +
                `e2e/data/tier2-cases.xlsx.`,
            });
            return;
          }
          throw new Error(
            `${suite} loaded 0 rows from tier2-cases. e2e/data/tier2-cases.json was not ` +
              `generated — check that global-setup ran and e2e/data/tier2-cases.xlsx exists. ` +
              `Failing loudly: an empty suite must never be mistaken for a passing one.`,
          );
        },
      );
      return;
    }

    let tenant: Tier2Tenant;
    let api: APIRequestContext;

    test.beforeAll(async () => {
      // Throws unless TIER2_API_URL / TIER2_DB_NAME are set and point somewhere
      // disposable. Runs before anything else so a misconfigured job fails on
      // the first line rather than after writing to a live database.
      readTier2Env();
      const anon = await anonymousApi();
      try {
        tenant = await loginProvisionedTenant(anon);
      } finally {
        await anon.dispose();
      }
      api = await authedApi(tenant);
    });

    test.afterAll(async () => {
      await api?.dispose();
    });

    /**
     * A JD id, created once per worker and reused.
     *
     * Assessments cannot exist without one, and creating a fresh JD for each of
     * the assessment rows would add a POST per test for no extra coverage — the
     * JD rows already assert JD creation.
     */
    let sharedJdId: string | null = null;
    async function seedJdId(): Promise<string> {
      if (sharedJdId) return sharedJdId;
      // Published, not the default draft: the backend refuses to build an
      // assessment on an unpublished JD —
      //   400 "Cannot create assessment for JD '…' (status: draft). Only
      //        published Job Descriptions can be used for assessments."
      const res = await api.post("/api/v1/jd", {
        data: {
          ...validPayload("/api/v1/jd", `seed-${Date.now().toString(36)}`)!,
          status: "published",
        },
      });
      expect(
        res.ok(),
        `could not create the JD that assessment rows hang off (${res.status()}): ` +
          `${(await res.text()).slice(0, 200)}`,
      ).toBe(true);
      sharedJdId = (await res.json()).id as string;
      return sharedJdId;
    }

    /**
     * Put one record where an assertion expects to find one.
     *
     * The `api_fields` and `list_only` checks read the first item of a list. On a
     * freshly provisioned tenant every list is empty, so both were passing — or
     * failing — for reasons that had nothing to do with the behaviour under test:
     * an empty list carries no offending item and also no expected field. Seeding
     * first makes the check mean what the row says it means.
     *
     * Returns false when the endpoint has no create path the suite can drive; the
     * caller then knows the assertion is unprovable rather than merely unproven.
     */
    async function seedOne(
      endpoint: string,
      marker: string,
      overrides: Record<string, unknown> = {},
    ): Promise<boolean> {
      const bare = endpoint.split("?")[0];
      if (bare.startsWith("/api/v1/assessments")) {
        const payload = makeAssessmentPayload(await seedJdId(), marker);
        const res = await api.post(bare, { data: { ...payload, ...overrides } });
        return res.ok();
      }
      const payload = validPayload(bare, marker);
      if (!payload) return false;
      const res = await api.post(bare, { data: { ...payload, ...overrides } });
      return res.ok();
    }

    for (const row of rows) {
      const name = `${row.tc_id} [${row.scrum_id || "—"}] ${row.title}`.trim();

      if (row.status !== "active") {
        test.skip(name, () => {
          test.info().annotations.push({ type: "blocked", description: row.note });
        });
        continue;
      }

      test(name, async () => {
        test.info().annotations.push({
          type: "case",
          description: `${row.source_sheet} — ${row.what_to_check} => ${row.expected_result}`,
        });
        if (row.layer === "rule") {
          test.info().annotations.push({ type: "provenance", description: row.note });
        }

        const why = `${row.tc_id}: ${row.expected_result || row.what_to_check}`;
        const marker = `${row.tc_id}-${Date.now().toString(36)}`;

        switch (row.assert_kind) {
          case "api_ok": {
            const res = await api.get(row.endpoint);
            expect(res.ok(), `${why} — GET ${row.endpoint} returned ${res.status()}`).toBe(true);
            break;
          }

          case "api_fields": {
            // Seed first where we can. Without a record in the list, "the
            // response or its first item carries X" degenerates into "the
            // envelope carries X", which passes for the wrong reason on some
            // endpoints and fails for the wrong reason on the rest.
            await seedOne(row.endpoint, marker);

            const res = await api.get(row.endpoint);
            expect(res.ok(), `${why} — GET ${row.endpoint} returned ${res.status()}`).toBe(true);
            const body = await res.json();
            for (const field of row.assert_value.split("|").filter(Boolean)) {
              // A field may live on the envelope or on the first item.
              const onBody = body != null && field in body;
              const first = itemsOf(body)[0] as Record<string, unknown> | undefined;
              const onItem = first != null && field in first;
              expect(onBody || onItem, `${why} — neither the response nor its first item carries "${field}"`).toBe(true);
            }
            break;
          }

          case "list_only": {
            const [field, expected] = row.assert_value.split("=");

            // Seed one record that *should* come back, so the assertion cannot
            // pass by returning nothing. Without this the check is vacuous: an
            // empty list trivially contains no offenders, and a filter that
            // silently drops everything would look identical to a correct one.
            //
            // `status: "published"` on create is honoured — measured; the
            // response comes back with status "published" rather than the
            // default "draft", so no separate POST /jd/{id}/publish is needed.
            const planted = await seedOne(row.endpoint, marker, { [field]: expected });
            expect(
              planted,
              `${why} — could not seed a ${field}=${expected} record for ${row.endpoint} ` +
                `to filter for, so the assertion has nothing to prove`,
            ).toBe(true);

            const res = await api.get(row.endpoint);
            expect(res.ok(), `${why} — GET ${row.endpoint} returned ${res.status()}`).toBe(true);
            const items = itemsOf(await res.json());
            expect(
              items.length,
              `${why} — ${row.endpoint} returned nothing, so "only ${field}=${expected}" proves nothing`,
            ).toBeGreaterThan(0);
            const offenders = items
              .filter((it) => String((it as Record<string, unknown>)?.[field]) !== expected)
              .map((it) => String((it as Record<string, unknown>)?.[field]));
            expect(offenders, `${why} — ${row.endpoint} returned items whose ${field} is not "${expected}"`).toEqual([]);
            break;
          }

          case "persisted": {
            const bare = row.endpoint.split("?")[0];
            const payload = bare.startsWith("/api/v1/assessments")
              ? makeAssessmentPayload(await seedJdId(), marker)
              : validPayload(bare, marker);
            expect(payload, `${why} — no create payload defined for ${row.endpoint}`).not.toBeNull();

            const created = await api.post(bare, { data: payload! });
            expect(created.ok(), `${why} — POST ${row.endpoint} returned ${created.status()}: ${(await created.text()).slice(0, 200)}`).toBe(true);
            const record = await created.json();
            expect(record?.id, `${why} — the created record has no id to fetch back`).toBeTruthy();

            // The whole point: fetch it again on a fresh request and confirm it
            // is really there. A mocked backend cannot fail this.
            const fetched = await api.get(`${bare}/${record.id}`);
            expect(fetched.ok(), `${why} — the record POST created could not be fetched back (${fetched.status()})`).toBe(true);
            const back = await fetched.json();
            const field = row.assert_value;
            expect(back?.[field], `${why} — "${field}" did not survive the round trip`).toBeDefined();
            break;
          }

          case "constraint_rejected": {
            const payload = invalidPayload(row.endpoint);
            expect(payload, `${why} — no invalid payload defined for ${row.endpoint}`).not.toBeNull();
            const res = await api.post(row.endpoint, { data: payload! });
            expect(res.status(), `${why} — the backend accepted an invalid payload instead of rejecting it`).toBeGreaterThanOrEqual(400);
            expect(res.status(), `${why} — expected a client error, got a server error`).toBeLessThan(500);
            break;
          }

          case "audit_logged": {
            const before = await api.get("/api/v1/audits?page=1&page_size=1");
            expect(before.ok(), `${why} — GET /audits returned ${before.status()}`).toBe(true);

            // Do something that must be audited, then look for the trace of it.
            const payload = validPayload("/api/v1/jd", marker);
            const acted = await api.post("/api/v1/jd", { data: payload! });
            expect(acted.ok(), `${why} — could not perform an auditable action (${acted.status()})`).toBe(true);

            const after = await api.get("/api/v1/audits?page=1&page_size=25");
            expect(after.ok(), `${why} — GET /audits returned ${after.status()}`).toBe(true);
            const rowsOut = itemsOf(await after.json()) as Record<string, unknown>[];
            expect(rowsOut.length, `${why} — an auditable action produced no audit rows at all`).toBeGreaterThan(0);

            for (const field of row.assert_value.split("|").filter(Boolean)) {
              const present = rowsOut.some((r) => r?.[field] !== undefined && r?.[field] !== null);
              expect(present, `${why} — no audit row carries "${field}"`).toBe(true);
            }
            break;
          }

          case "units_deducted": {
            const before = await unitBalance(api);
            const acted = await api.post("/api/v1/jd", { data: validPayload("/api/v1/jd", marker)! });
            expect(acted.ok(), `${why} — the billable action failed (${acted.status()})`).toBe(true);
            const after = await unitBalance(api);
            expect(after, `${why} — balance did not drop after a billable action (${before} -> ${after})`).toBeLessThan(before);
            break;
          }

          case "units_unchanged": {
            const before = await unitBalance(api);
            // Deliberately invalid, so the pre-condition fails and nothing runs.
            await api.post(row.endpoint, { data: {} });
            const after = await unitBalance(api);
            expect(after, `${why} — a rejected action still cost units (${before} -> ${after})`).toBe(before);
            break;
          }

          case "rbac_denied": {
            // Probe a *write*, with an empty body, as the narrower role.
            //
            // The first design deleted a non-existent id, and it was wrong twice
            // over. Measured against the real backend on 2026-08-04:
            //
            //   DELETE /api/v1/jd/does-not-exist          -> 422 uuid_parsing
            //   DELETE /api/v1/jd/<valid-but-absent-uuid> -> 404, for admin AND
            //                                               for recruiter alike
            //
            // The 422 is FastAPI rejecting the path param before any permission
            // check runs, so the test never reached the rule it claimed to
            // assert. And the 404 exposed the deeper error: `recruiter` is not a
            // narrower role here at all. The seeded matrix in the tenant database
            // gives it all ten jd:* permissions — identical to admin — against
            // admin's 197 overall. Only `viewer` (8 permissions) and
            // `billing_manager` (10) are genuinely restricted, so the rows now
            // ask for `viewer`.
            //
            // POST with `{}` is deliberate: the permission dependency resolves
            // ahead of body validation, so an unauthorised caller gets a clean
            // `403 {"detail":"Permission denied: jd:create"}` rather than a 422
            // about the payload. That keeps the assertion about authorisation
            // instead of about schemas.
            const narrower = await createUser(api, row.assert_value || "viewer", tenant);
            const { apiUrl } = readTier2Env();
            const { request } = await import("@playwright/test");
            const asNarrower = await request.newContext({
              baseURL: apiUrl,
              extraHTTPHeaders: { Authorization: `Bearer ${narrower.accessToken}` },
            });
            const res = await asNarrower.post(row.endpoint, { data: {} });
            const body = (await res.text()).slice(0, 160);
            await asNarrower.dispose();
            // 401/403 = the backend enforced the rule. Anything else means the
            // call got through — 404/422 would only prove the id or the payload
            // was bad, which is not the same thing and must not pass.
            expect(
              [401, 403],
              `${why} — a ${row.assert_value || "viewer"} was not refused on POST ${row.endpoint}; ` +
                `got ${res.status()}: ${body}`,
            ).toContain(res.status());
            break;
          }

          default:
            throw new Error(`unknown assert_kind "${row.assert_kind}" for ${row.tc_id}`);
        }
      });
    }
  });
}

/** Which spec owns which endpoints. Mirrors ROUTE_GROUPS in tier1.ts. */
export const ENDPOINT_GROUPS = {
  jd: ["/api/v1/jd"],
  resume: ["/api/v1/resumes", "/api/v1/folders", "/api/v1/scoring"],
  assessment: ["/api/v1/assessments"],
  audit: ["/api/v1/audits"],
  billing: ["/api/v1/tenants/units", "/api/v1/subscription"],
};

/** Guard: every active row must be claimed by exactly one spec. */
export function assertEveryTier2RowClaimed(rows: Tier2Row[]) {
  const prefixes = Object.values(ENDPOINT_GROUPS).flat();
  const orphans = rows.filter(
    (r) => r.status === "active" && !prefixes.some((p) => r.endpoint.startsWith(p)),
  );
  test("every active Tier-2 row is claimed by a spec", () => {
    const detail = orphans.map((r) => `${r.tc_id} -> ${r.endpoint}`).slice(0, 20).join(", ");
    expect(orphans.length, `unclaimed rows would run nowhere and report nothing: ${detail}`).toBe(0);
  });
}

/** Rows whose endpoint starts with any of the given prefixes. */
export function byEndpoint(rows: Tier2Row[], ...prefixes: string[]): Tier2Row[] {
  return rows.filter((r) => r.status === "active" && prefixes.some((p) => r.endpoint.startsWith(p)));
}
