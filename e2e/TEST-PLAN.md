# TalentFlow Data Plane — Playwright Automation Test Plan

**Source:** `Jira Points - RMS SAAS .xlsx` (master tracking workbook)
**Extracted master list:** `e2e/data/master-test-cases.xlsx` — **2,772 test cases**
(regenerate anytime with `node e2e/scripts/extract-master-test-cases.mjs`)
**Goal:** Automate with Playwright → run in GitLab CI → green tests gate every deploy.

---

## 1. Test case inventory (extracted from the workbook)

| # | Source sheet | Cases | Area |
|---|---|---|---|
| 1 | Sprint 2 (JD) | 152 | Job Description CRUD, publish, config |
| 2 | Sprint - 3 (ResumeDB) | 251 | Resume upload, My Resumes, search, AI Talent Match preconditions |
| 3 | Sprint - 4 (Assessment) | 480 | Assessment creation, taking, scoring |
| 4 | Sprint - 5 (RBAC) | 133 | Roles, permissions, access control |
| 5 | Sprint - 6 (API, MVP-2) | 83 | Public API behaviours |
| 6 | Sprint 7 (Audit Logs) | 236 | Audit log capture & views |
| 7 | Sprint 8 AI Interview Type 1 | 595 | AI interview flow (fixed mode) |
| 8 | Sprint 8 AI Interview Type 2 | 386 | AI interview flow (dynamic mode) |
| 9 | Sprint - 10 (Enhancement) | 224 | UI/UX and behaviour enhancements |
| 10 | Sprint - 11 (Team) | 88 | Team management |
| 11 | Sprint 12 | 69 | Latest sprint items |
| 12 | BUGS | 68 | Known bugs → regression tests |
| 13 | Jira Issue | 7 | Misc verified issues (e.g. case-insensitive email) |
| | **Total** | **2,772** | |

Not every row is automatable. Triage rule (fill the `automatable` column in the master sheet):

- **yes** — deterministic UI/behaviour check (form validation, navigation, permission block, list rendering). Target for Playwright.
- **partial** — needs backend state or media (upload processing, AI scoring). Automate the UI half with mocked APIs; verify the rest in staging smoke tests.
- **no** — visual judgement, AI answer quality, audio quality, exploratory. Stays manual QC.

Realistic expectation: **~55–65% automatable** (≈1,500–1,800 cases), many collapsing into
data-driven tests (one spec + many Excel rows), so the actual spec count stays manageable.

## 2. Two test tiers

**Tier 1 — CI tests (mocked backend).** Run on every push in the GitLab `e2e` job.
All API calls intercepted with `page.route()` (same pattern as `ai-interview-pipeline.spec.ts`
and `excel-data-driven.spec.ts`). Fast, deterministic, no live services needed.

**Tier 2 — Staging smoke (real backend).** Small suite (~30–50 critical paths: login,
JD create, resume upload, assessment start, AI interview join) run against the staging
deployment (`BASE_URL=https://<staging-url>`) after `deploy:staging`, before anyone
presses the manual production deploy button.

## 3. Phases (order of implementation)

| Phase | Scope | Source cases | ~Playwright specs | Notes |
|---|---|---|---|---|
| **0 ✅ done** | Framework: Excel-driven runner, global-setup, CI `e2e` job | — | 1 | Login demo suite passing 6/6 |
| **1** | **Smoke suite**: auth (incl. case-insensitive email — Scrum 1031), dashboard load, JD list/create happy path | ~40 | 3–4 | Flip CI job `allow_failure: false` after this — deploys now gated |
| **2** | JD Management | 152 | 6–8 | JD create wizard, publish/draft, disabled-JD rules (Scrum 1034), config |
| **3** | Resume DB + My Resumes | 251 | 6–8 | Upload validations, storage limits, search actions; file-upload via Playwright `setInputFiles` |
| **4** | RBAC (pulled ahead — it multiplies through every module) | 133 | 3–4 | Pure data-driven: permission matrix in Excel → one spec loops roles × actions |
| **5** | Assessment | 480 | 10–12 | Creation, question types, taking flow, timers |
| **6** | Audit Logs + Team + API | 236+88+83 | 6–8 | API sheet partly via Playwright `request` fixture (no browser) |
| **7** | AI Interview Type 1 & 2 | 595+386 | extend existing | `ai-interview-pipeline.spec.ts` + timer specs already cover core; add remaining deterministic checks; audio/AI-quality rows stay manual |
| **8** | Enhancements + Sprint 12 | 224+69 | 4–6 | Many are one-line UI checks — batch into data-driven specs |
| **R** | Regression from BUGS sheet | 68 | rolling | Every fixed bug gets a pinned regression test; add new bugs as they close |

Each phase follows the same loop:
1. Filter that sheet's rows from `master-test-cases.xlsx`, mark `automatable`.
2. Convert "yes" rows into the data-driven Excel format (or direct specs where flow-based).
3. Write/extend specs with mocked APIs; run locally (`BASE_URL=http://localhost:3001`).
4. Push → CI green → cases marked automated in the master sheet.

## 4. CI/CD gating (already wired, tighten as phases land)

```
push (staging / aws branch)
  ├─ lint
  ├─ e2e  ← Tier 1 Playwright suite (currently allow_failure: true)
  ├─ build-image        (only if tests pass, once allow_failure is false)
  ├─ deploy:staging     (automatic on staging branch)
  ├─ e2e:staging-smoke  ← Tier 2, to add in Phase 1 (BASE_URL=staging URL)
  └─ deploy:production  (manual button, aws branch — press only when all green)
```

## 5. Conventions

- Data files: `e2e/data/<module>.xlsx` — one workbook per module, one row per case,
  carrying the source `tc_id` from the master sheet for traceability.
- Spec naming: `e2e/<module>-<flow>.spec.ts` (e.g. `jd-create.spec.ts`, `rbac-matrix.spec.ts`).
- Every test title includes the master `tc_id` / Scrum id → failures map straight back to the tracking sheet.
- Local runs: `BASE_URL=http://localhost:3001 npx playwright test` (port 3000 hosts the control-plane app on the dev VM).
- `/login` requires `?org=<tenant>` (multi-tenant redirect rule).
