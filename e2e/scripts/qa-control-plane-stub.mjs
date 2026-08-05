/**
 * A stand-in for the TalentFlow control plane, for the QA environment only.
 *
 * The shipped ADMIN_API_URL is https://rmscp.q2a.in — the control plane that
 * serves real customers. QA must never send traffic there, and the QA tenant
 * does not exist there in any case, so every call 404s or 500s and the product
 * degrades: entitlements empty, every module reporting "Feature Not Available".
 *
 * This answers the same calls locally with permissive, obviously-fake data. It
 * is a test double for an external system at its network boundary, not a mock
 * of the application's own API — the backend, the frontend and the database
 * under test are all still the real ones.
 */
import http from "node:http";

const PORT = Number(process.env.PORT || 8299);
const log = (...a) => console.log(new Date().toISOString(), ...a);

/**
 * The plan's feature list, in the shape PlanFeaturesProvider parses:
 * `{feature_key, is_enabled, quota_key}`. A plain array of strings is silently
 * read as "no features enabled" and every module renders "Feature Not
 * Available" — which is what happened the first time this was written.
 *
 * `quota_key` is left null throughout: a non-null key makes the frontend check
 * `quotas[key].status` and block on EXCEEDED, and an unmetered QA environment
 * should never block.
 */
const FEATURE_KEYS = [
  "seats", "resume_upload", "resume_scoring", "assessment", "ai_interview",
  "api_access", "sso", "priority_support", "ai_talent_match", "teams",
];
const FEATURES = FEATURE_KEYS.map((feature_key) => ({
  feature_key, is_enabled: true, quota_key: null,
}));

const UNLIMITED = { available: 999999, used: 0, limit: 999999, is_unlimited: true, sufficient: true };

function bodyFor(pathname) {
  if (/terms-and-conditions\/.*\/status/.test(pathname) || /terms.*status/.test(pathname)) {
    return { has_accepted_current: true, current_terms_id: null, grace_period_end: null,
             accepted_at: "2026-01-01T00:00:00Z", requires_acceptance: false };
  }
  if (/terms-and-conditions/.test(pathname)) {
    return { success: true, message: "accepted", id: "qa-terms-v1", version: "v1",
             content: "QA stub terms.", document_type: "terms_and_conditions" };
  }
  if (/quota|usage/.test(pathname)) {
    // `quota_source` and `plan_name` are both required: the backend treats a
    // response missing either as incomplete and turns it into a 503.
    const q = (code) => ({ ...UNLIMITED, code, total_purchased: 999999, total_consumed: 0,
                           total_remaining: "unlimited", percentage: 0, remain_percentage: 100,
                           status: "OK", addon: { total_purchased: 0, total_consumed: 0 } });
    return { status: "success", data: {
      quota_source: "qa_stub", plan_name: "QA Unlimited", is_trial: false,
      subscription_status: "active", isolation_type: "database",
      plan_info: { id: "qa-plan", name: "QA Unlimited", isolation_type: "database", features: FEATURES },
      features: FEATURES, enabled_features: FEATURE_KEYS,
      quotas: { RU: q("RU"), RS: q("RS"), AS: q("AS"), AIU: q("AIU"),
                max_seats: q("max_seats"), max_jobs: q("max_jobs") },
      RU: q("RU"), RS: q("RS"), AS: q("AS"), AIU: q("AIU"),
      job_quota: { used: 0, limit: 999999, is_unlimited: true },
    } };
  }
  if (/plan-change/.test(pathname)) return { pending: false, items: [], data: [] };
  return {
    success: true, is_active: true, status: "active",
    features: FEATURES, enabled_features: FEATURE_KEYS,
    plan: { id: "qa-plan", name: "QA Unlimited", code: "qa_unlimited", features: FEATURES },
    subscription: { status: "active", plan_name: "QA Unlimited", features: FEATURES },
    items: [], data: [],
  };
}

http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const { pathname } = new URL(req.url, "http://x");
    log(`${req.method} ${req.url}${raw ? ` body=${raw.slice(0, 200)}` : ""}`);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(bodyFor(pathname)));
  });
}).listen(PORT, "0.0.0.0", () => log(`qa control-plane stub on :${PORT}`));
