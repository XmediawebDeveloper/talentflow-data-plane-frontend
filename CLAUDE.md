# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

# Project rules — TalentFlow frontend

Read `AGENTS.md` too: this Next.js version differs from training data — check `node_modules/next/dist/docs/` before using a Next API.

## 5. Verify every change

- `npx tsc --noEmit` must report 0 errors.
- ESLint count for each touched file must not go up (compare against the file before your edit).
- Keep each file's line endings: most files are CRLF, some (e.g. `components/HeaderChatMenu.tsx`) are LF. Never mix them.
- Visual check through a temporary page under `app/tmp-*`, then delete it. Never leave test pages or screenshots in the repo. Never delete tracked files in `.playwright-mcp/`.
- If a change was not seen in a browser (pages behind login), say so.

## 6. Colours — `app/globals.css` is the only source

Every colour must resolve to a variable defined in `app/globals.css`, so changing it there changes every component that uses it.

- **Tailwind palette** (`text-gray-500`, `bg-slate-900`, `ring-emerald-500/20` …) comes from the `@theme` block "Tailwind colour palette (owned here)". Values are identical to Tailwind v4.3.2 defaults — do not change a value unless you mean to recolour the whole app.
- **Brand / semantic colours**: use the theme utilities (`bg-brand-blue`, `text-brand-teal`, `text-success-strong`, `bg-destructive`, `border-border` …) mapped in `@theme inline` to `:root` / `.dark` variables (`--brand-blue`, `--text-primary`, `--text-muted`, `--surface` …).
- **One-off hex values**: never write a hex literal in a component. Use or add a `--raw-<hex>` token in the "Migrated raw hex color tokens" `:root` block (`--raw-0f3c99`, rgba as `--raw-rgba-7-156-196-0p14`) and reference it as `var(--raw-…)` / `bg-[var(--raw-…)]`. Tokens are fixed values (same in both themes).
- **Alpha on a variable colour**: use `color-mix(in srgb, var(--x) 6%, transparent)` — never string-append hex alpha (`${color}0F`).
- **Variables already hold full colours**: write `var(--x)`, never `hsl(var(--x))`.
- **Dark mode** is the `.dark` class (next-themes). globals.css repaints common utilities in dark (`.dark .text-gray-500 → var(--text-muted)`, `.dark .bg-white → var(--surface)` …). These unlayered rules beat plain utilities; an important utility (`!text-…`) beats them. Add `dark:` variants only where the repaint layer does not already cover it.

## 7. Text, type and component classes

- Use the shared role classes instead of ad-hoc text styles: `tf-row-title`, `tf-row-name`, `tf-meta`, `tf-hint`, `tf-micro-hint`, `tf-caption`, `tf-th`, `tf-body-secondary`, `tf-badge`, `tf-input`, `tf-checkbox`, `tf-table-shell`.
- Muted/helper text is `text-gray-500` (`--text-muted: #6b7280`) — the lightest grey allowed for readable text (contrast). Do not use `text-gray-400` for text people must read; placeholders use `placeholder:text-gray-500`.
- `text-2xs` (10px) is the smallest text size.
- Don't change a shared class to fix one screen — override at the call site (e.g. `!text-[0.8125rem]`) and keep the change local.

## 8. Layout and responsive

- Mobile first, checked at 320/375px, tablet (`sm` 640, `md` 768) and desktop (`lg` 1024). No horizontal page scroll; 12px (`left-3 right-3`) side gutter for fixed panels on phones.
- Lists: table from `lg` (`DESKTOP_TABLE_ONLY`), `MobileRecordCard` below. Card details follow the AI Interview Results card: a role with an icon in `meta`, labelled lines (`Email:`, `Experience:`) in `fields`.
- Long names truncate with `truncate` + `title={fullText}`; badges that must stay visible get `shrink-0`.
- Header dropdowns/popovers (Quick actions, plan/units, notifications, chat) open with one reveal:
  `animate-in fade-in zoom-in-90 slide-in-from-top-1 duration-200 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:animate-none origin-top md:origin-top-right` — Tailwind only, no new CSS.
- Every animation must stop under reduced motion (`motion-reduce:animate-none` or a `prefers-reduced-motion` block).
- Empty-state illustrations use `components/ui/illustrated-empty-state.tsx` (blue folder, dashed draft page, sparkle marks) — don't invent a new illustration style.
- Quota/units bars: `total_remaining` is the source of truth; never show 100% while units are left (`percentLabel` in `components/Header.tsx`).

## 9. Accessibility (phases 1–6 — keep these intact)

1. **Contrast** — the colour rules in §6–7 (`--text-muted` greys, no `gray-400` body text).
2. **Focus indicators** — the global `:focus-visible` rules in globals.css. Don't add `outline-none` / `focus:outline-none` without a visible replacement (`focus-visible:ring-…`). `html[data-input="pointer"|"keyboard"]` (inline script in `app/layout.tsx`) hides rings that appear after a mouse click but keeps them for keyboard users; menu items get a keyboard-only highlight.
3. **Keyboard access** — anything clickable is a `<button>` / `<a>`. If a `div`/`tr`/card must be clickable, spread `clickableProps` / `clickableLinkProps` / `clickableRowProps` from `lib/a11y/clickableProps.ts` (role, `tabIndex`, Enter/Space via `activateOnKey`). Nested controls call `e.stopPropagation()`.
4. **Modals** — wrap every custom overlay in `<ModalA11y>` (or `useModalA11y`) from `components/ui/modal-a11y.tsx`: Escape closes the top modal only, Tab is trapped, focus returns to the opener, `aria-labelledby` points at the first heading. Pass `onClose` when there is no overlay click / Close button for Escape to use.
5. **Icon-only buttons** — use `IconButton` (`components/ui/icon-button.tsx`) with a required `label` (becomes `aria-label` + tooltip); `bare` for a raw `<button>`. Other icon triggers get `aria-label` and the shared `<Tooltip>` (shows on hover and keyboard focus). Header icons (notifications, chat, quick actions, theme) all have a `<Tooltip position="bottom">`. Hide decorative icons/badges with `aria-hidden`; keep visible-text labels as `sr-only` when a label is hidden on phones.
6. **Skip link** — `<SkipLink />` is the first element in `app/(dashboard)/layout.tsx` and targets `#main-content` (`tabIndex={-1}` on the page scroll container). Keep both.

Don't change behaviour beyond what a task asks, and don't regress any of the above while doing other work.
