import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType } from 'docx';
import { writeFileSync } from 'fs';

const BRAND = '0F3C99', GREY = '6B7690';
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 280, after: 120 }, children: [new TextRun({ text: t, color: BRAND, bold: true })] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 180, after: 80 }, children: [new TextRun({ text: t, bold: true })] });
const P = (runs, opts = {}) => new Paragraph({ spacing: { after: 80 }, ...opts, children: Array.isArray(runs) ? runs : [new TextRun(runs)] });
const bullet = (runs, level = 0) => new Paragraph({ bullet: { level }, spacing: { after: 40 }, children: Array.isArray(runs) ? runs : [new TextRun(runs)] });
const R = (t, o = {}) => new TextRun({ text: t, ...o });
const code = (t) => new TextRun({ text: t, font: 'Consolas', color: BRAND });

const statusColor = (s) => s.startsWith('DONE') ? '16A34A' : s.startsWith('AUDITED') ? 'B45309' : s.startsWith('PARTIAL') ? 'B45309' : 'DC2626';

// The 14 requirement categories from app/style-guide/page.tsx → [section, status, finished/checked, pending]
const STYLEGUIDE = [
  ['1 · Colors', 'DONE', 'Semantic tokens (success/warning/info/destructive: solid·subtle·line·strong, light+dark) in globals.css; ~3,500 palette classes → tokens across all product + admin/subscription/organization; inline hex eliminated; 9 malformed bg-*-subtle0 rendering bugs fixed.', 'Prune 138 legacy --raw-* hexes once unused. Marketing/auth excluded by design.'],
  ['2 · Typography', 'DONE', 'One font family (Inter) confirmed; fixed size scale + new text-2xs (10px) micro tier; ~1,196 arbitrary text-[Npx] snapped to the scale; weight outliers normalized.', 'None (marketing hero display sizes intentionally kept).'],
  ['3 · Buttons', 'DONE (product)', '3 variants (primary/secondary/destructive) + onColor tone across ALL product modules: AI Talent Match, Assessments, Resume Scoring, JD/Jobs, AI Interview, Dashboards, Candidate, Settings.', 'Admin/subscription/organization buttons still on ad-hoc markup — need the same pass. Add confirmations to a few direct delete/disconnect actions.'],
  ['4 · Badges', 'PARTIAL', 'Badge colors were tokenized during the color rollout (8 semantic variants exist in components/ui/badge.tsx).', 'No dedicated audit that the RIGHT badge variant is used for the right status across the app — badge-usage consistency pass pending.'],
  ['5 · Form controls', 'AUDITED (§5)', 'Shared Input/Textarea/Select/Checkbox/Switch/Tabs exist. §5 audited: short/sectioned forms COMPLIANT.', 'Inline validation PARTIAL (JDCreation/Assessment/auth submit-only; TeamFormModal none). Auto-save PARTIAL (Assessment on-exit only; AI-interview manual). Verify all forms use the shared controls.'],
  ['6 · Cards', 'NOT CHECKED', 'Shared Card + SurfaceCard components exist; card surfaces got token colors.', 'No audit that pages consistently use Card/SurfaceCard (padding, radius, border via tokens) vs hand-rolled panels.'],
  ['7 · Navigation & Layout', 'AUDITED — VIOLATION', 'Context-always-visible COMPLIANT (detail/results views pin JD/Assessment title).', 'Max-2-level nav VIOLATED — routes 3–4 deep (worst: .../ai-interview-config/clusters). Inline-CRUD PARTIAL — JD/Assessment/AI-Interview create flows are full-page routed wizards (also trips §15 "no multi-step wizard"). Redesign decision.'],
  ['8 · Popups', 'PARTIAL', 'Popup colors tokenized; modal close-X buttons standardized to secondary during the button pass; shared Dialog/AlertDialog/Popover/Dropdown/Sheet exist.', 'No consistency audit — some hand-rolled dropdowns/menu-items exist (flagged by button forks). Confirm all modals use the shared primitives.'],
  ['9 · Table', 'NOT CHECKED', 'Table colors tokenized; .tf-table-shell helper exists.', 'No audit that tables consistently use .tf-table-shell (sticky header, single scroll container, sticky-column).'],
  ['10 · Module Patterns (§6–10)', 'NOT AUDITED', '—', 'Resume DB two-zones/folders/bulk-ops, Scoring JD-wise + dynamic columns, Assessment single-config-screen, Coding split-view, Mobile tables→cards — none audited against §6–§10.'],
  ['11 · Feedback & Performance (§12/13)', 'AUDITED', 'Feedback COMPLIANT (1,189 toasts across 131 files). No-silent-failures COMPLIANT. Async non-blocking + background processing COMPLIANT (scoring in background + notifications).', 'Progress PARTIAL — bulk resume upload spinner-only. Skeletons PARTIAL — AIInterviewResults bare spinner; no recruitment/* loading.tsx.'],
  ['12 · Accessibility (§14)', 'NOT AUDITED', 'globals.css has focus-visible ring rules (partial baseline).', 'No audit of keyboard nav, focus order, color contrast (WCAG), and descriptive tooltips on icon buttons.'],
  ['13 · Empty states', 'NOT CHECKED', 'Shared EmptyState + SimpleEmptyState components exist.', 'No audit that lists/tables consistently render an empty state (vs blank) using the shared components.'],
  ['14 · Do / Don\'t (§15)', 'PARTIAL', 'Some prohibitions checked via §3 (no full-page nav for small tasks, no multi-step wizard) — and flagged as violations.', 'Full §15 checklist pass pending (no page reload for forms, no hidden primary actions, no inconsistent placement, no mixing Scoring/Match/Assessment on one screen).'],
];

// per-module page changes appendix
const MODULES = [
  ['AI Talent Match', [['AI Talent Match', '/recruitment/ai-talent-match', 'Run AI Match CTAs → primary; icon actions → secondary; red "Reset" → secondary. Colors: 81 classes → tokens.']]],
  ['Assessments', [
    ['Assessments list', '/recruitment/assessments', 'Create/Configure/Invite → primary; modal close-X + view icons → secondary.'],
    ['Create Assessment', '/recruitment/assessments/create', 'Publish/Save/Add-section → primary; coding-disable confirm → destructive.'],
    ['Assessment detail', '/recruitment/assessments/[id]', 'Share/Bulk-resend → primary; Edit/Refresh icons → secondary.'],
    ['Results', '/recruitment/assessments/[id]/results', 'Export/Download PDFs → primary; row icons → secondary; "Clear filters" off-red.'],
  ]],
  ['Resume Scoring & Database', [
    ['Resume Scoring', '/recruitment/resume-scoring', 'Score/Download → primary; View/Preview → secondary. Colors: 163 classes → tokens.'],
    ['Scored resume detail', '/recruitment/scored-resume-detail', 'Invite/Send-email → primary; Download/Share/Compare → secondary.'],
    ['Resume Database', '/recruitment/resume-database', 'Delete → destructive (confirm); Apply-to-Job / Shortlist → primary.'],
  ]],
  ['JD & Jobs', [
    ['Job Openings', '/recruitment/job-openings', 'Create-New-Job (was grey) → primary; "Buy Units" (orange) → primary. Colors: ~431 classes → tokens.'],
    ['JD Creation', '/recruitment/jd-creation', 'Add + Confirm & Publish → primary; Back/Save-draft → secondary; "Yes, Cancel" → destructive.'],
    ['Job details', '/recruitment/job-details', 'Create Assessment/Invite/AI-Interview → primary; Disable/Archive confirm modals.'],
  ]],
  ['AI Interview', [
    ['AI Interviews', '/recruitment/ai-interviews', 'Modal close-X → secondary; legacy danger → destructive. Colors: ~580 classes → tokens.'],
    ['Interview config', '/recruitment/ai-interviews/jd-selection/ai-interview-config', 'Continue/Publish → primary; Save-as-Draft → secondary.'],
    ['Results', '/recruitment/ai-interviews/[id]/results', 'Retry/Re-evaluate/Export → primary; risk-config icon → secondary.'],
  ]],
  ['Dashboards', [
    ['Main dashboard', '/dashboard', 'Create JD / AI Match → primary; grey/outline CTAs unified. Colors: ~250 classes → tokens.'],
    ['Usage / quotas', '/subscription/usage-quotas', 'Upgrade/Renew/Buy → primary; non-destructive red/amber controls moved off red.'],
  ]],
  ['Candidate flow', [
    ['Exam flow (light)', 'candidate exam flow', 'Continue/Verify/Capture → primary; Back/Skip → secondary. Colors: ~665 classes → tokens.'],
    ['In-exam / on-video', 'immersive test UI', 'onColor where neutral; semantic exam controls (green Submit / red End) kept.'],
  ]],
  ['Settings', [
    ['Security', '/settings/security', 'Change-password/Verify-2FA → primary; Disable-2FA/Revoke → destructive. Colors: 52 classes → tokens.'],
    ['API / Integrations', '/settings/api-management · /settings/integrations', 'Create key/Connect → primary; delete key/Disconnect → destructive.'],
    ['Branding / Legal', '/settings/branding · /settings/legal', 'hero "Save" / gradient close → onColor. Preset hexes kept (user data).'],
  ]],
  ['Admin / Subscription / Organization (colors)', [
    ['Subscription · Audits · Users · Teams/Compliance/Support', '/subscription/* · /audits/* · /organization/*', 'Colors only: ~600 classes → tokens (buttons pass pending).'],
  ]],
];

const cell = (text, opts = {}, w) => new TableCell({ width: w ? { size: w, type: WidthType.PERCENTAGE } : undefined, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text, ...opts })] })] });

const children = [];
children.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: 'TalentFlow — UI Standardization Report', bold: true, size: 40, color: BRAND })] }));
children.push(P([R('Requirements measured against the design-system spec at ', { italics: true, color: GREY }), code('app/style-guide/page.tsx'), R('. Each of its 14 sections below → what is finished/checked vs pending. Verified: tsc 0 errors + production build passing.', { italics: true, color: GREY })]));

children.push(H1('1 · Requirements checklist (vs app/style-guide/page.tsx)'));
children.push(new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  rows: [
    new TableRow({ tableHeader: true, children: [cell('Requirement', { bold: true }, 22), cell('Status', { bold: true }, 16), cell('Finished / checked', { bold: true }, 31), cell('Pending', { bold: true }, 31)] }),
    ...STYLEGUIDE.map(([s, st, done, pend]) => new TableRow({ children: [cell(s, { bold: true }), cell(st, { bold: true, color: statusColor(st) }), cell(done), cell(pend)] })),
  ],
}));

children.push(H1('2 · Legend'));
[['DONE', 'Standardized + verified (tsc + build).'], ['AUDITED', 'Checked against the doc; findings noted (compliant/partial/violation).'], ['PARTIAL', 'Partly done; specific gaps remain.'], ['NOT CHECKED / NOT AUDITED', 'Component exists but no consistency pass run yet.']]
  .forEach(([k, v]) => children.push(bullet([R(k + ' — ', { bold: true, color: statusColor(k) }), R(v)])));

children.push(H1('3 · Pages, URLs & changes (appendix)'));
MODULES.forEach(([mod, pages]) => {
  children.push(H2(mod));
  pages.forEach(([page, url, changes]) => {
    children.push(bullet([R(page + '  ', { bold: true }), code(url)]));
    children.push(new Paragraph({ bullet: { level: 1 }, spacing: { after: 60 }, children: [R(changes, { color: '333333' })] }));
  });
});

children.push(H1('4 · Pending — consolidated'));
[['Buttons — admin surfaces', 'Admin/subscription/organization buttons not yet on the 3-variant component.'],
 ['Navigation (§3/§7)', 'Flatten 3–4 level routes; convert routed create/edit wizards → inline modals/panels.'],
 ['Form validation & autosave (§5)', 'Inline validation for JD/Assessment/auth/TeamFormModal; autosave for Assessment + AI-interview.'],
 ['Feedback/Performance (§12/13)', 'Bulk-upload live progress; AIInterviewResults skeleton; recruitment/* loading.tsx.'],
 ['Not-yet-audited requirements', 'Cards, Popups, Table, Module Patterns (§6–10), Accessibility (§14), Empty states, full §15 checklist, Badge usage.'],
 ['Cleanup / decisions', 'Prune 138 legacy --raw-* hexes; candidate-portal gray→blue namespace decision; confirmations on direct deletes.'],
 ['Housekeeping', 'Nothing committed — ~150+ files in the working tree; needs a branch/commit/PR.']]
  .forEach(([k, v]) => children.push(bullet([R(k + ' — ', { bold: true }), R(v)])));

const doc = new Document({ sections: [{ properties: {}, children }] });
const buf = await Packer.toBuffer(doc);
writeFileSync(process.argv[2], buf);
console.log('wrote', process.argv[2], buf.length, 'bytes');
