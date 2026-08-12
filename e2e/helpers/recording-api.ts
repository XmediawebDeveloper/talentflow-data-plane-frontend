/**
 * Wraps an APIRequestContext so every call it makes lands in the test's
 * evidence record.
 *
 * Tier 2 builds one context in `beforeAll` and all 817 rows go through it, so
 * wrapping that single object captures every exchange without touching any of
 * the nine assertion branches in tier2.ts. That matters more than the code
 * saved: an assertion that has to remember to log is an assertion that will
 * eventually forget, and the row that forgets is the one someone needs.
 *
 * Only the verbs the runner actually uses are wrapped. `fetch`, `head`,
 * `patch`, `dispose` and the rest pass through untouched — a wrapper that
 * silently swallowed an unknown method would be worse than one that admits it
 * only knows five.
 */
import { APIRequestContext, APIResponse } from "@playwright/test";
import { recordExchange } from "./evidence";

type BodyOptions = { data?: unknown; [k: string]: unknown };

/** Verbs that carry a body, and the ones that do not. */
const WITH_BODY = ["post", "put", "patch"] as const;
const WITHOUT_BODY = ["get", "delete"] as const;

/**
 * Read the response body without consuming it for the caller.
 *
 * `APIResponse.json()` and `.text()` are re-readable in Playwright — the body
 * is buffered — so recording it here does not starve the assertion that reads
 * it next. A body that is not JSON is stored as text rather than dropped.
 */
async function readBody(res: APIResponse): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    try {
      return await res.text();
    } catch {
      return undefined;
    }
  }
}

export function recordingApi(api: APIRequestContext): APIRequestContext {
  return new Proxy(api, {
    get(target, prop, receiver) {
      const name = String(prop);
      const original = Reflect.get(target, prop, receiver);

      const carriesBody = (WITH_BODY as readonly string[]).includes(name);
      const noBody = (WITHOUT_BODY as readonly string[]).includes(name);
      if ((!carriesBody && !noBody) || typeof original !== "function") {
        return original;
      }

      return async (url: string, options?: BodyOptions): Promise<APIResponse> => {
        const started = Date.now();
        const res: APIResponse = await original.call(target, url, options);
        const ms = Date.now() - started;

        // Recording must never be the reason a test fails. If the body cannot
        // be read the exchange is still worth having — status and timing alone
        // answer most questions.
        let responseBody: unknown;
        try {
          responseBody = await readBody(res);
        } catch {
          responseBody = undefined;
        }

        recordExchange({
          method: name,
          url,
          requestBody: carriesBody ? options?.data : undefined,
          status: res.status(),
          responseBody,
          ms,
        });

        return res;
      };
    },
  });
}
