# UI load performance — checklist (2026-11-04)

Baseline measured on staging (xmedia.0sms.com), 8 dashboard tools.
Targets: hard reload ≤ 0.5 s to cards + 10 rows, in-app ≤ 0.3 s, card/filter click ≤ 0.3 s, ≤ 6 API calls on landing.

Standard per module: `GET /<module>/stats?<filters>` + `GET /<module>?page=1&page_size=10&sort&<filters>` in parallel
(`lib/hooks/usePagedList.ts`). Both use ONE shared backend filter builder, so card count == list `total`. Card click = filter change.

## Phase 0 — deploy (ops)
- [ ] Deploy backend + frontend to staging. Backend restart applies the new MIGRATION_INDEXES per tenant.
- [ ] Re-measure the 8 tools with the same browser harness

## Phase 1 — default landing + bugs
- [x] Job Descriptions, AI Assessments, AI Interviews land on Total card + list (pageView 'list'; a stale 'cards' snapshot is ignored)
- [x] AI Talent Match "first 100 JDs" — verified NOT a bug (JDs referenced by sessions are fetched by id)
- [x] User Management loaded only the first 20 users — now `/users/paged` (one call)

## Phase 2 — shared pattern + pilot
- [x] `usePagedList` hook (parallel stats+page, stale-drop, per-query cache, keep rows, prefetch next, re-read after writes)
- [x] Resume Database: Shared DB view server-paged; `GET /resumes/stats` replaces per-tab and up-to-30 per-folder probes (33 calls → 1 + prefetch)

## Phase 3 — slowest modules
- [x] AI Talent Match: `/ai-match/stats`, `/ai-match/jobs`, `/ai-match/candidates`; no full sessions / `/scoring/all` load (≈26 → 2)
- [x] Resume Scoring: `/scoring/stats` + `/scoring/jds`; full `/scoring/all` no longer loaded on landing (5–7 → 2)
- [ ] Resume Scoring "View by Job" still pages client-side over the light index — switch to `/scoring/jds` once its lineage key is reconciled with useJobVersionLineage's job_id
- [ ] View by Candidates / per-JD lists still page client-side (shared `ScoredResumesTable`, used by 4 modules) — load on demand only

## Phase 4 — remaining modules
- [x] Job Descriptions: `/jd?view=jobs` + `/jd/stats` + `/jd/candidate-counts`; batch version expansion; `/scoring/jd/counts` (19 → 2 + 1)
- [x] AI Assessments: server paging/sort/filters on flat tabs AND Total Jobs (`collapse=lineage`); filtered stats; no all-JD load
- [x] AI Interviews: same as Assessments (parity); `/invitation-overview` batch replaces 4 calls per config
- [ ] AI Interviews Invitation Status tab still loops per config
- [x] User Management: `/users/paged`, batch role permission codes, duplicate /auth/me removed (list stays client-side by design: seat-limited)
- [x] Teams: stats carry unassigned/no-lead/empty; `/teams/creators`; `/teams` 4 queries total (was 4 per team); `/unit-pool/teams/usage` batched

## Phase 5 — app shell + slow endpoints
- [x] `GET /bootstrap` (plan, pending plan change, quota, user settings, experience levels); providers fall back to own calls
- [x] Header bell uses `/notifications/count?exclude_chat=true`
- [x] Raw quota fetches moved to shared api client
- [x] quota-status: shared keep-alive HTTP client to Control Plane; 6 per-call ALTER TABLEs now once per schema per process
- [x] admin-assigned-plan / plan-changes/pending: 30 s per-tenant cache, dropped on writes
- [x] New indexes in MIGRATION_INDEXES for every new filter/sort

## Phase 6 — delivery
- [x] Dashboard layout eagerly bundled the whole invite/AI-interview report tree (recharts, jsPDF, evaluation report). InviteDialogProvider, track modals and scoring-progress modal now load on demand → layout 340 → 102 modules (6.4 MB → 1.5 MB source)
- [x] Assessments / AI Interviews: Create, Results, Details, Candidate Results load on demand (≈ −1 MB source each)
- [x] CSS 794 KB — checked: 95 KB gzipped, edge-cached 1 yr, all real utilities. Not worth trimming
- [ ] (ops) Cloudflare serves gzip even when the browser accepts Brotli → enable Brotli in the Cloudflare dashboard
- [ ] (ops) Same-origin API (`/api` on the app host → backend) to remove CORS preflights

## Verification (2026-11-04)
- [x] Frontend tsc: clean for all changed files (2 pre-existing `<style jsx>` errors in untouched proctoring files)
- [x] Backend suite: 5637 passed, 38 failed — all 38 also fail on clean HEAD (confirmed in a HEAD worktree); 0 new failures
- [x] New backend tests: resume stats, scoring stats/jds, JD listing, AI match listing, assessment/AI-interview list query, invitation-overview expired, shell slice
- [ ] Not run against a real Postgres — new SQL is parse-checked only. First real run is staging.

## Must not regress — check on staging
- [ ] Card count == list total for every filter (all modules)
- [ ] Export / "select all" cover every matching row, not just the visible page
- [ ] RBAC: a restricted role sees the same rows in stats and list
- [ ] Known behaviour changes listed in the hand-off summary
