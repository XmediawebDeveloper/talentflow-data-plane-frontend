# TalentFlow Data Plane — Playwright Automation Test Plan

**Source:** `Jira Points - RMS SAAS .xlsx` (master tracking workbook)
**Extracted master list:** `e2e/data/master-test-cases.xlsx` — **2,772 rows**
(regenerate with `node e2e/scripts/extract-master-test-cases.mjs`)
**Goal:** Automate with Playwright → run in GitLab CI → green tests gate the deploy.

---

## 1. Where the tests run

```
developer ──► dev              no pipeline (no .gitlab-ci.yml on this branch)
      merge ──► staging        no pipeline (rules never match this branch)
      merge ──► ci/cd-staging  ► THIS pipeline ─► Contabo server, port 3100
      merge ──► aws            ► separate pipeline, separate test set ─► AWS, port 3000
```

Everything in this document is the **`ci/cd-staging`** pipeline. The `aws`
pipeline gets its own test set — not yet written. Note that the `e2e` job's
rule currently also matches `aws`, so today the same suite runs there; that is
deliberate (an ungated production deploy is worse) and gets split when the aws
set is written.

## 2. What was actually measured

Every row of the master sheet was classified by
`e2e/scripts/classify-test-cases.mjs`, which writes `automatable`, `tier`,
`reason` and `rule` back into the workbook. Not estimated — computed, then
checked by hand.

| | Rows | Share |
|---|---|---|
| Total extracted | 2,772 | |
| Header/filler rows (`n/a`) | 29 | |
| **Real test cases** | **2,743** | 100% |
| `yes` — automatable | 1,731 | 63.1% |
| `partial` — UI half automatable, rest manual | 841 | 30.7% |
| `no` — human judgement, real audio, real hardware | 171 | 6.2% |

The 1,731 `yes` rows split by tier: **465 Tier-1** (mocked backend, runs in CI)
and **1,266 Tier-2** (needs a real backend).

**Classifier accuracy: 89%**, measured by hand-reading three independent
holdout samples (80% → 78% → 89% as rules were corrected). 313 rows still carry
`rule = unclassified` and fell through to `partial` — they are the first place
to look when improving the numbers.

## 3. Tier 1 — what is automated today

`e2e/scripts/map-tier1-routes.mjs` maps each of the 465 Tier-1 rows to a route.
465 rows collapse into 169 distinct (sheet + title) groups, so the mapping is
169 reviewable decisions, not 465. Output: `e2e/data/tier1-cases.xlsx`.

| | Rows |
|---|---|
| Tier-1 rows mapped | 465 |
| **Active — run and pass** | **319** |
| Blocked — skipped with a reason, never counted as passing | 146 |

Mapping provenance: 26 by literal grep of a quoted UI string, 293 by group
decision, 146 unmapped. Confidence on the active rows: 194 high, 91 medium,
34 low. The 34 low-confidence rows are the ones to re-check first.

**Blocked, by reason:**

| Rows | Why it cannot run against mocks |
|---|---|
| 94 | Live interview runtime — real session, audio and WebSocket |
| 20 | Proctoring — real camera, fullscreen and focus events |
| 17 | Candidate assessment runtime — live instance from a real invite token |
| 14 | Asserts a database row or backend contract, not anything the UI renders |
| 1 | No route mapping — needs a human read |

**Active rows, by source sheet:** JD 66, ResumeDB 70, Assessment 34, RBAC 44,
Audit 35, AI Interview T1 17, AI Interview T2 15, Enhancements 20, Team 7,
Sprint 12 6, BUGS 4, API 1.

### What these 319 tests actually assert

| `assert_kind` | Rows | What it checks |
|---|---|---|
| `text_visible` | 145 | a specific string the feature renders |
| `all_text_visible` | 83 | several strings together (e.g. every table column) |
| `control_visible` | 57 | a named button or link is present |
| `placeholder_visible` | 29 | a specific input exists (search, skill entry) |
| `element_absent` | 1 | a control the role must **not** see |
| `page_loads` | 4 | shell renders, no error boundary, no feature gate, URL held |
| | **319** | of which **315 assert real behaviour**, 4 are still shell-only |

8 rows drive a backend pre-condition first (see below).

Every asserted string was taken from **what the page actually renders**,
captured by driving each route with the standard mocks and dumping its
headings, button names, table headers, labels and placeholders. Not from the
sheet's prose and not from grepping source — both were wrong in practice: the
sheet says the button reads "Create New JD" while the app renders
"Create New Job", and a source grep for "Job Title" matches the help page
rather than the JD form.

#### Pre-conditions: driving the state instead of hoping for it

`/recruitment/jd-creation` sits behind `GET /jd/access-check`. A row can name
a `precondition` (e.g. `jd_access:SUBSCRIPTION_INACTIVE`) and the runner
installs that mock variant before navigating, so the row asserts the exact wall
its case describes. TC-0002/3/4/5 and TC-0007/8/9/10 use this.

This also fixed a **false green**. Before the endpoint was mocked, the generic
fallback had no `all_checks_passed`, the page rendered "Access Denied", and all
29 jd-creation tests still passed — an access wall is a perfectly well-rendered
page, and `page_loads` cannot tell the difference.

#### Proof the assertions can fail

`smoke-tier1-discrimination.spec.ts` pins this directly: the happy path must
render the form and **none** of the four blocked titles; the blocked path must
render the wall and **not** the form; and a locator for the sheet's wording
("Create New JD") must resolve to zero elements. If a later change weakens a
mock or loosens a locator, these turn red rather than letting real coverage
quietly become theatre.

#### Seeded list data — what took `page_loads` from 171 to 28

`e2e/helpers/fixtures.ts` serves populated responses for `/audits`, `/resumes`,
`/jd`, `/scoring/all`, `/assessments`, `/ai-interview` and their `/stats`
siblings. Empty lists were the single biggest reason a row could not assert
anything: a table with no rows renders no columns, no per-row action menu and
no column-customisation control.

Two things about this are easy to get wrong, and both were measured:

- **`total` is load-bearing.** Several pages probe with `page_size: 1` only to
  read `total`, then refetch with `page_size: total`
  (`resume-scoring/page.tsx:355`, `resume-database/page.tsx:189`). Seeding
  `items` while leaving `total: 0` makes the page skip the real fetch and
  render empty anyway.
- **Registration order.** These go in *after* `mockApiFallback`, since
  Playwright resolves routes in reverse registration order.

The `/jd/<id>` handler is anchored on the fixture id prefix on purpose — a
looser pattern would also swallow `/jd/access-check` and silently disable the
pre-condition variants above.

This also caught a live mapping bug: `job-details` reads `id`, not `jd_id`
(`job-details/page.tsx:36`), so those rows had been navigating to a page that
rendered nothing at all.

#### Proof the seeded assertions discriminate

Column assertions are only worth something if an empty list makes them fail.
`smoke-tier1-discrimination.spec.ts` pins both directions: with no seeded rows
`Score %` must resolve to **zero** elements, and with them the three asserted
columns must all be visible. A regression that stopped serving fixtures would
otherwise turn ~140 column assertions back into "the page rendered" without
anything going red.

#### The 4 still on `page_loads`

TC-0233, TC-0234, TC-0236 and TC-0238 — "Pre-Condition Validation for Resume
Scoring". No mockable endpoint drives the blocked states they describe, so
there is nothing to assert beyond the shell. Weak assertions are worse than
none; these stay shell-only until that state can actually be driven.

#### Where the route-level fallback is used, and what it is worth

Rows with no case- or title-specific assertion fall back to the module's own
landing content (`ASSERT_BY_ROUTE`), or to its table columns when the row also
opens a list view (`ASSERT_BY_ROUTE_CARD`). This is weaker than a row-specific
assertion but strictly stronger than `page_loads`, which passes on an access
wall — as the jd-creation false green proved.

The audit rows are the bulk of it. Their sheet-side expected results are
`audit_logs` column values, which is a database assertion and belongs in
Tier 2. What the UI can honestly prove is that the trail renders its documented
columns over real rows, and that is what those 31 rows assert — not that a
particular action was logged.

## 4. Suite composition and runtime

```
499 tests
  353 passed
  146 skipped   ← blocked rows, each carrying its reason as an annotation
    0 failed
runtime: ~2.2 min at 2 workers
```

`smoke-tier1-jd` · `-resume` · `-aiinterview` · `-admin` · `-assessment` ·
`-blocked` (146) · `-discrimination` (5), plus `smoke-auth`,
`smoke-dashboard`, `smoke-jd`, `excel-data-driven` and
`smoke-score-consistency` (which carries the KI-13 `test.fail()` pin).

### KI-13 is pinned, not fixed

`smoke-score-consistency.spec.ts` reproduces the recurring QC complaint that a
candidate's score differs between the results list and the detail page —
with mocks alone, no backend. Feed a session `capability_score: null` with
`section_question_avg.mth = 7.2` and the list shows 72% while the detail shows
0. KI-13b is marked `test.fail()`: it asserts the correct behaviour and is
expected to fail while the bug lives. Fix the derivation and the test starts
passing, which turns the run **red** and forces the annotation to be dropped —
so the bug cannot be quietly closed and the fix cannot go unnoticed.

## 5. CI gating (live on `ci/cd-staging`)

```
push to ci/cd-staging
  ├─ lint                 allow_failure: true
  ├─ e2e                  BLOCKING — allow_failure: false
  ├─ e2e:quarantine       non-blocking (ai-interview-pipeline, timer-* — red before this existed)
  ├─ build-image          needs: [e2e]            ← the real gate
  └─ deploy:staging       needs: [build-image]    ← Contabo, port 3100
```

`needs:` is what blocks, not stage order — stage order alone would let a later
job start after a failure in some configurations. A red `e2e` means nothing is
built and nothing is deployed.

`e2e:quarantine` holds specs that were already failing before this pipeline
existed (the repo ships a committed `test-results/.last-run.json` with status
`failed` for the timer specs). Move a spec into the blocking job as it is fixed.

**An empty suite fails loudly.** `loadRowsSync()` returns `[]` when the JSON
mirror is missing, which would otherwise let a broken run report green with
zero tests. `runTier1Cases()` registers a failing test in that case. Verified
by deleting `e2e/data/*.json` and re-running: global-setup regenerates them
from the workbooks before collection, and 37 tests were still found.

## 6. Tier 2 — not started

1,266 rows need a real backend. Intended shape: a smaller suite run against the
deployed Contabo staging instance after `deploy:staging`, before the merge to
`aws`. Those 14 "asserts a database row" Tier-1 blockers belong here too.

## 7. Conventions

- Data files: `e2e/data/*.xlsx`; the `.json` mirrors are gitignored and
  regenerated by `global-setup` on every run.
- Every test title starts with its `tc_id` (`TC-0404 [Scrum 1034] …`), so a CI
  failure names the sheet row with no lookup step.
- Mocks live in `e2e/helpers/auth.ts`. Register `mockApiFallback` **first** —
  Playwright resolves routes in reverse registration order, so the catch-all
  must go in before the specific handlers for them to win.
- Anchor API route patterns on `/api/v\d+/`. A bare glob like
  `**/hr-question-bank` also matches the page navigation and will serve raw
  JSON in place of the app.
- No `data-testid` exists anywhere in the repo — selectors are role+name,
  `aria-label`, or exact text.
- Local runs: `BASE_URL=http://localhost:3001 npx playwright test`
  (port 3000 hosts the control-plane app on the dev VM).
- `/login` requires `?org=<tenant>` — without it you get a 307 to `/signup`.
