/**
 * Records what a test actually did, so a tester can check that it tests the
 * right thing rather than only that it went green.
 *
 * Nothing in the pipeline carries this today. JUnit gives a name, a status, a
 * duration and a failure message; the endpoint that was called, the body that
 * was sent and the body that came back appear nowhere. Playwright's trace holds
 * some of it, but only on a retry, only as a ~2 MB zip, and only for browser
 * tests — so it answers "why did this break" for one run and never "what does
 * this test check".
 *
 * The evidence is attached to the test via `testInfo.attach`, which the JSON
 * reporter carries (JUnit does not). `e2e/scripts/build-report.mjs` folds it
 * into qa-cases.json, and the dashboard renders it as the row detail.
 *
 * Two rules this file exists to enforce, both easy to get wrong once and never
 * notice:
 *
 *   1. REDACT. Tier 2 creates real users with real passwords and carries a real
 *      bearer token. A recorder that just serialises what it sees publishes
 *      `Authorization`, `password` and `access_token` onto a web page.
 *   2. TRUNCATE. A resume payload or an LLM response is not a useful artifact at
 *      full length, and 1,268 tests multiply anything.
 */
import { test } from "@playwright/test";

/**
 * Bodies are cut here. Long enough to see the shape, short enough to store.
 *
 * Measured on a full Tier-2 run (817 tests, 2,793 bodies): median body 1.1 KB,
 * p95 4.1 KB, 366 bodies (13%) hit the cap — all of them list responses that
 * repeat the same object shape, where the tail adds nothing a reader wants.
 * Total evidence 4.9 MB per run, against an 890 KB HTML report already in the
 * same artifact. Halving this would save ~1 MB and cost the interesting part of
 * every list response, so 4 KB stays.
 */
const MAX_BODY = 4096;

/**
 * Key names whose values never appear in evidence.
 *
 * Matched case-insensitively against the whole key, and as a substring so
 * `admin_password`, `x-api-key` and `refreshToken` are all caught. Kept as a
 * constant rather than config on purpose: this is a safety property, and a
 * safety property that can be switched off in a YAML file will be.
 */
const REDACT = [
  "authorization",
  "password",
  "passwd",
  "secret",
  "token",
  "api_key",
  "apikey",
  "cookie",
  "set-cookie",
];

const REDACTED = "«redacted»";

function isSecret(key: string): boolean {
  const k = key.toLowerCase();
  return REDACT.some((needle) => k.includes(needle));
}

/**
 * Walk a value and blank out anything under a secret-looking key.
 *
 * Depth-limited because a cyclic or pathologically nested body should degrade
 * to a note, not hang the test run.
 */
function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return "«too deep»";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSecret(k) ? REDACTED : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * Normalise a body into something storable.
 *
 * JSON is redacted key-by-key. Anything else is treated as opaque text and
 * truncated — no attempt to find secrets inside an unparsed blob, because a
 * half-working redactor on unknown text is worse than an honest refusal.
 */
function summarise(body: unknown): unknown {
  if (body == null) return undefined;
  if (typeof body === "string") {
    // A JSON string still deserves key-level redaction.
    try {
      return summarise(JSON.parse(body));
    } catch {
      return body.length > MAX_BODY ? `${body.slice(0, MAX_BODY)}… «truncated»` : body;
    }
  }
  const redacted = redact(body);
  const text = JSON.stringify(redacted);
  if (text.length <= MAX_BODY) return redacted;
  return `${text.slice(0, MAX_BODY)}… «truncated»`;
}

/** One HTTP call a Tier-2 assertion made. */
export interface Exchange {
  kind: "http";
  n: number;
  method: string;
  url: string;
  requestBody?: unknown;
  status: number;
  responseBody?: unknown;
  ms: number;
}

/** Something a Tier-1 test did in the browser. */
export interface Step {
  kind: "route" | "mock" | "action" | "expect" | "note";
  text: string;
  detail?: string;
}

export interface Evidence {
  /** What the row claims to prove, in the runner's own vocabulary. */
  assertion?: string;
  exchanges: Exchange[];
  steps: Step[];
}

/**
 * Per-test storage.
 *
 * Keyed by `testId` rather than held in a module-level variable because
 * Playwright runs tests concurrently inside a worker; a single shared buffer
 * would interleave two tests' evidence and quietly attribute one's request to
 * the other.
 */
const buffers = new Map<string, Evidence>();

function current(): Evidence {
  const id = test.info().testId;
  let ev = buffers.get(id);
  if (!ev) {
    ev = { exchanges: [], steps: [] };
    buffers.set(id, ev);
  }
  return ev;
}

/** Record the assertion this row is making, in plain words. */
export function recordAssertion(text: string): void {
  current().assertion = text;
}

/** Record a browser-side step: the route, a mock that answered, a click, a check. */
export function recordStep(kind: Step["kind"], text: string, detail?: string): void {
  current().steps.push(detail === undefined ? { kind, text } : { kind, text, detail });
}

/** Record one HTTP exchange. Bodies are redacted and truncated on the way in. */
export function recordExchange(e: {
  method: string;
  url: string;
  requestBody?: unknown;
  status: number;
  responseBody?: unknown;
  ms: number;
}): void {
  const ev = current();
  ev.exchanges.push({
    kind: "http",
    n: ev.exchanges.length + 1,
    method: e.method.toUpperCase(),
    // Strip the origin: it is the same for every row and is noise in a table.
    url: e.url.replace(/^https?:\/\/[^/]+/, ""),
    requestBody: summarise(e.requestBody),
    status: e.status,
    responseBody: summarise(e.responseBody),
    ms: Math.round(e.ms),
  });
}

/**
 * Attach whatever was recorded and clear the buffer.
 *
 * Call once per test from an `afterEach`. Silent when nothing was recorded, so
 * hand-written specs that never opted in do not gain an empty attachment.
 */
export async function attachEvidence(): Promise<void> {
  const info = test.info();
  const ev = buffers.get(info.testId);
  buffers.delete(info.testId);
  if (!ev || (!ev.exchanges.length && !ev.steps.length && !ev.assertion)) return;

  await info.attach("evidence", {
    contentType: "application/json",
    body: Buffer.from(JSON.stringify(ev, null, 2)),
  });
}

/**
 * Exposed for the redaction test.
 *
 * The verification step for this feature is "grep the published evidence for
 * Authorization and password and find nothing", and that check is worth having
 * as a unit-level assertion too — it is the one bug here that ships secrets.
 */
export const __testing = { redact, summarise, isSecret, MAX_BODY };
