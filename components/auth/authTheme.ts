/**
 * Shared design system for authentication surfaces.
 *
 * The brand colors intentionally come from app/globals.css:
 * --brand-blue, --brand-blue-2, --brand-cyan, --brand-teal and --brand-orange.
 * Keep auth-specific values as aliases or neutral/status tokens so the login
 * page stays aligned with the product palette and avoids decorative color blends.
 */
export const AUTH_THEME_CSS = `
.tf-auth, .tf-auth-scope {
  --tf-brand: var(--brand-blue);
  --tf-brand-hover: var(--brand-blue-2);
  --tf-brand-active: #0a2f7a;
  --tf-brand-cyan: var(--brand-cyan);
  --tf-brand-teal: var(--brand-teal);
  --tf-brand-orange: var(--brand-orange);
  --tf-brand-on: #ffffff;
  --tf-brand-ink: var(--brand-blue);
  --tf-brand-tint: color-mix(in srgb, var(--brand-blue) 7%, #ffffff);
  --tf-brand-tint-solid: color-mix(in srgb, var(--brand-blue) 11%, #ffffff);
  --tf-brand-border: color-mix(in srgb, var(--brand-blue) 20%, #ffffff);
  --tf-cyan-tint: color-mix(in srgb, var(--brand-cyan) 11%, #ffffff);
  --tf-orange-tint: color-mix(in srgb, var(--brand-orange) 13%, #ffffff);
  --tf-ring: color-mix(in srgb, var(--brand-blue) 22%, transparent);

  --tf-canvas: color-mix(in srgb, var(--brand-blue) 4%, #ffffff);
  --tf-surface: #ffffff;
  --tf-surface-soft: color-mix(in srgb, var(--brand-blue) 3%, #ffffff);
  --tf-surface-subtle: #fafbfd;
  --tf-surface-sunken: #f4f7fb;
  --tf-border: #e3e8f1;
  --tf-border-strong: #cfd8e6;
  --tf-ink: #07123d;
  --tf-ink-muted: #455479;
  --tf-ink-subtle: #687492;
  --tf-ink-faint: #8b96ad;

  --tf-danger: #b42318;
  --tf-danger-ink: #912018;
  --tf-danger-tint: #fef4f3;
  --tf-danger-border: #f5c7c2;
  --tf-success: #0b7047;
  --tf-success-ink: #0b7047;
  --tf-success-tint: #f2f9f5;
  --tf-success-border: #bfe0ce;
  --tf-warning: #b45b0c;

  --tf-shadow: 0 28px 72px -38px rgba(15, 60, 153, 0.36), 0 14px 34px -28px rgba(16, 24, 40, 0.2);
  --tf-shadow-sm: 0 10px 24px -20px rgba(16, 24, 40, 0.28);
  --tf-radius: 24px;
  --tf-radius-md: 14px;
  --tf-radius-sm: 10px;
  --tf-form-width: 560px;
}

.dark .tf-auth, .dark .tf-auth-scope {
  --tf-brand: #2563eb;
  --tf-brand-hover: #1d4ed8;
  --tf-brand-active: #1e40af;
  --tf-brand-ink: #93b4ff;
  --tf-brand-tint: rgba(37, 99, 235, 0.14);
  --tf-brand-tint-solid: rgba(37, 99, 235, 0.2);
  --tf-brand-border: rgba(147, 180, 255, 0.28);
  --tf-cyan-tint: rgba(6, 182, 212, 0.14);
  --tf-orange-tint: rgba(237, 136, 28, 0.14);
  --tf-ring: rgba(147, 180, 255, 0.24);

  --tf-canvas: #101827;
  --tf-surface: #151f31;
  --tf-surface-soft: #18243a;
  --tf-surface-subtle: #1a263b;
  --tf-surface-sunken: #111a2b;
  --tf-border: #283651;
  --tf-border-strong: #344563;
  --tf-ink: #f6f8fc;
  --tf-ink-muted: #c8d0df;
  --tf-ink-subtle: #99a6bc;
  --tf-ink-faint: #7e8ba2;

  --tf-danger: #f0837a;
  --tf-danger-ink: #f5b5af;
  --tf-danger-tint: rgba(180, 35, 24, 0.16);
  --tf-danger-border: rgba(240, 131, 122, 0.3);
  --tf-success: #63bf98;
  --tf-success-ink: #8fd3b5;
  --tf-success-tint: rgba(11, 112, 71, 0.18);
  --tf-success-border: rgba(99, 191, 152, 0.28);
  --tf-warning: #dfa05a;

  --tf-shadow: 0 28px 72px -40px rgba(0, 0, 0, 0.74), 0 14px 34px -28px rgba(0, 0, 0, 0.62);
  --tf-shadow-sm: 0 10px 24px -18px rgba(0, 0, 0, 0.55);
}

.tf-auth {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(16px, 2.6vw, 40px);
  background: var(--tf-canvas);
  color: var(--tf-ink);
  -webkit-font-smoothing: antialiased;
}
.tf-auth *, .tf-auth *::before, .tf-auth *::after,
.tf-auth-scope *, .tf-auth-scope *::before, .tf-auth-scope *::after {
  box-sizing: border-box;
}

.tf-auth-shell {
  width: 100%;
  max-width: 1376px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(420px, var(--tf-form-width));
  align-items: stretch;
  gap: clamp(42px, 6vw, 96px);
}
.tf-auth-aside {
  min-width: 0;
  max-width: 620px;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}
.tf-auth-main {
  width: 100%;
  max-width: var(--tf-form-width);
  min-width: 0;
  justify-self: end;
  align-self: center;
}

/* Brand gradient = the wordmark's own blue -> cyan ramp. Built only from
   --brand-* tokens; no hue is introduced that isn't already in the palette. */
.tf-auth, .tf-auth-scope {
  --tf-grad: linear-gradient(97deg, var(--brand-blue) 0%, var(--brand-blue-2) 40%, var(--brand-cyan) 100%);
}

/* Decorative global/network backdrop. Sits on a ::before behind the content so
   it never intercepts pointer events or affects layout. */
.tf-auth {
  position: relative;
  isolation: isolate;
}
/* position: fixed, never absolute + overflow:hidden -- a clipped container would
   cut off the tall Signup card instead of letting the page scroll. */
.tf-auth::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-repeat: no-repeat;
  background-image:
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 600'%3E%3Cg fill='none' stroke='%230f3c99' stroke-width='1.1'%3E%3Ccircle cx='300' cy='300' r='232'/%3E%3Cellipse cx='300' cy='300' rx='232' ry='80'/%3E%3Cellipse cx='300' cy='300' rx='232' ry='160'/%3E%3Cellipse cx='300' cy='300' rx='80' ry='232'/%3E%3Cellipse cx='300' cy='300' rx='160' ry='232'/%3E%3Cpath d='M68 300h464'/%3E%3C/g%3E%3Cg fill='%23079cc4'%3E%3Ccircle cx='300' cy='68' r='4.5'/%3E%3Ccircle cx='463' cy='196' r='3.5'/%3E%3Ccircle cx='140' cy='232' r='3.5'/%3E%3Ccircle cx='420' cy='420' r='4'/%3E%3Ccircle cx='196' cy='448' r='3'/%3E%3C/g%3E%3Cg stroke='%23079cc4' stroke-width='0.9' fill='none'%3E%3Cpath d='M300 68 463 196 420 420 196 448 140 232Z'/%3E%3C/g%3E%3C/svg%3E"),
    radial-gradient(circle at 12% 18%, color-mix(in srgb, var(--brand-blue) 13%, transparent) 0%, transparent 46%),
    radial-gradient(circle at 78% 8%, color-mix(in srgb, var(--brand-cyan) 11%, transparent) 0%, transparent 42%),
    radial-gradient(circle at 62% 92%, color-mix(in srgb, var(--brand-cyan) 9%, transparent) 0%, transparent 44%);
  background-position: -240px calc(100% + 330px), 0 0, 0 0, 0 0;
  background-size: 720px 720px, 100% 100%, 100% 100%, 100% 100%;
  opacity: 0.2;
}
.tf-auth-shell {
  position: relative;
  z-index: 1;
}

/* Logo at the top of the page, copy in the middle, trust row on the baseline.
   Two auto margins absorb the slack -- no absolute positioning, so nothing can
   overlap on a short viewport. */
.tf-auth-headline {
  margin-top: auto;
}
.tf-login-proof-row {
  margin-top: auto;
}
.tf-auth--login .tf-auth-main {
  --tf-form-width: 600px;
}
.tf-auth--login .tf-auth-card {
  padding: clamp(22px, 2vw, 30px);
}

.tf-auth-logo {
  display: block;
  width: min(314px, 72vw);
  height: auto;
  object-fit: contain;
}
.tf-auth-lockup {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 22px;
}
.tf-auth-lockup--card {
  display: none;
  justify-content: center;
  margin-bottom: 28px;
}
.tf-auth-brandmark {
  width: 44px;
  height: 44px;
  border-radius: var(--tf-radius-sm);
  background: var(--tf-brand);
  color: var(--tf-brand-on);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.tf-auth-brandmark--sm {
  width: 38px;
  height: 38px;
}
.tf-auth-wordmark {
  font-size: 21px;
  font-weight: 700;
  color: var(--tf-ink);
  line-height: 1.2;
}
.tf-auth-wordmark-sub {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--tf-ink-subtle);
  margin-top: 2px;
}

/* Positioning line above the headline. Carries the auto top margin so the
   headline group still sits mid-column (see .tf-auth-headline). */
.tf-auth-eyebrow {
  margin: auto 0 8px;
  font-size: clamp(13px, 1vw, 15px);
  font-weight: 700;
  letter-spacing: 0.01em;
  color: var(--tf-brand-ink);
}
.tf-auth-eyebrow + .tf-auth-headline {
  margin-top: 0;
}

.tf-auth-headline {
  max-width: 620px;
  font-size: clamp(32px, 3.3vw, 48px);
  font-weight: 800;
  line-height: 1.05;
  letter-spacing: 0;
  color: var(--tf-ink);
  margin: 0 0 18px;
}
.tf-auth-headline .tf-accent {
  background: var(--tf-grad);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
}
.tf-auth-lede {
  max-width: 560px;
  font-size: clamp(14.5px, 1.1vw, 16.5px);
  line-height: 1.55;
  color: var(--tf-ink-muted);
  margin: 0 0 16px;
}

/* AI-recruitment illustration. Scales with the column; the auto margins on
   .tf-auth-headline / .tf-login-proof-row do the vertical distribution. */
.tf-hero-art {
  width: min(560px, 100%, 54vh);
  margin: 2px 0 0;
}
.tf-hero-art img {
  display: block;
  width: 100%;
  height: auto;
  /* The artwork ships with a baked-in light background (its assistant is white,
     so the backdrop cannot be keyed out). Feathering the edges dissolves the
     rectangle into the page in both themes instead of showing a hard seam. */
  -webkit-mask-image:
    radial-gradient(ellipse 94% 94% at 50% 46%, #000 66%, transparent 100%),
    linear-gradient(to bottom, #000 70%, transparent 99%);
  mask-image:
    radial-gradient(ellipse 94% 94% at 50% 46%, #000 66%, transparent 100%),
    linear-gradient(to bottom, #000 70%, transparent 99%);
  -webkit-mask-composite: source-in;
  mask-composite: intersect;
}
/* On dark, feathering can't help: the artwork's background is light all the way
   through, so a faded edge just becomes a glowing blob. Present it as a framed
   illustration plate instead, which reads as deliberate. A transparent-background
   export of the same artwork would let this rule be deleted. */
.dark .tf-hero-art img {
  -webkit-mask-image: none;
  mask-image: none;
  border-radius: var(--tf-radius-md);
  border: 1px solid var(--tf-border);
  filter: saturate(0.94) brightness(0.96);
}

.tf-login-proof-row {
  width: min(560px, 100%);
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  margin-top: 20px;
  border: 1px solid var(--tf-border);
  border-radius: var(--tf-radius-md);
  overflow: hidden;
  background: var(--tf-border);
  box-shadow: var(--tf-shadow-sm);
}
.tf-login-proof {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
  padding: 16px 18px;
  background: color-mix(in srgb, var(--tf-surface) 84%, transparent);
}
.tf-login-proof-icon {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--tf-brand-on);
}
.tf-login-proof-icon--teal {
  background: var(--tf-brand-teal);
}
.tf-login-proof-icon--blue {
  background: var(--tf-brand);
}
.tf-login-proof-title {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.25;
  color: var(--tf-ink);
}
.tf-login-proof-copy {
  margin-top: 3px;
  font-size: 13px;
  line-height: 1.35;
  color: var(--tf-ink-subtle);
}

.tf-auth-features {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.tf-auth-feature {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}
.tf-auth-feature-icon {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: var(--tf-radius-sm);
  background: var(--tf-brand-tint-solid);
  color: var(--tf-brand-ink);
  display: flex;
  align-items: center;
  justify-content: center;
}
.tf-auth-feature-title {
  font-size: 14.5px;
  font-weight: 700;
  color: var(--tf-ink);
  line-height: 1.4;
}
.tf-auth-feature-desc {
  font-size: 13.5px;
  color: var(--tf-ink-subtle);
  line-height: 1.5;
  margin-top: 2px;
}

.tf-auth-card {
  background: var(--tf-surface);
  border: 1px solid var(--tf-border);
  border-radius: var(--tf-radius);
  box-shadow: var(--tf-shadow);
  padding: 28px;
  line-height: 1.6;
}
.tf-auth-title {
  font-size: clamp(21px, 1.6vw, 26px);
  font-weight: 800;
  line-height: 1.3;
  letter-spacing: 0;
  color: var(--tf-ink);
  margin: 0 0 8px;
}
.tf-auth-subtitle {
  font-size: 13.5px;
  color: var(--tf-ink-muted);
  margin: 0 0 18px;
  line-height: 1.65;
}
.tf-auth-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--tf-ink-subtle);
  background: none;
  border: none;
  padding: 0;
  margin: 0 0 16px;
  cursor: pointer;
  transition: color 0.15s ease;
}
.tf-auth-back:hover {
  color: var(--tf-ink);
}

.tf-login-card-top {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 18px;
}
.tf-login-workspace {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 12px;
  color: var(--tf-ink-muted);
  font-size: 14.5px;
  line-height: 1.4;
}
.tf-login-workspace-icon {
  width: 38px;
  height: 38px;
  border-radius: var(--tf-radius-sm);
  background: var(--tf-brand-tint);
  color: var(--tf-brand-ink);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.tf-login-workspace strong {
  color: var(--tf-brand-ink);
  font-weight: 700;
}
.tf-auth-field {
  margin-bottom: 13px;
}
.tf-auth-label {
  display: block;
  font-size: 12.5px;
  font-weight: 700;
  line-height: 1.5;
  color: var(--tf-ink);
  margin-bottom: 6px;
}
.tf-auth-label-note {
  font-weight: 400;
  color: var(--tf-ink-faint);
}
.tf-auth-control {
  position: relative;
  display: block;
}
.tf-auth-control-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--tf-ink-subtle);
  pointer-events: none;
  display: flex;
  transition: color 0.15s ease;
}
.tf-auth-input {
  width: 100%;
  height: 46px;
  padding: 0 14px 0 42px;
  font-size: 14px;
  font-family: inherit;
  color: var(--tf-ink);
  background: var(--tf-surface);
  border: 1px solid var(--tf-border-strong);
  border-radius: var(--tf-radius-md);
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
}
.tf-auth-input--plain {
  padding-left: 14px;
}
.tf-auth-input--reveal {
  padding-right: 40px;
}
.tf-auth-input::placeholder {
  color: var(--tf-ink-subtle);
}
.tf-auth-input:hover:not(:disabled):not(:focus) {
  border-color: var(--tf-brand-border);
}
.tf-auth-input:focus {
  border-color: var(--tf-brand);
  box-shadow: 0 0 0 4px var(--tf-ring);
}
.tf-auth-input:disabled {
  background: var(--tf-surface-sunken);
  color: var(--tf-ink-subtle);
  cursor: not-allowed;
}
.tf-auth-input.is-invalid {
  border-color: var(--tf-danger-border);
}
.tf-auth-input.is-invalid:focus {
  border-color: var(--tf-danger);
  box-shadow: 0 0 0 4px var(--tf-danger-tint);
}
.tf-auth-input.is-valid {
  border-color: var(--tf-success-border);
}
.tf-auth-control:focus-within .tf-auth-control-icon {
  color: var(--tf-brand-ink);
}
.tf-auth-reveal {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  background: none;
  border: none;
  border-radius: 8px;
  color: var(--tf-ink-subtle);
  cursor: pointer;
  transition: color 0.15s ease, background-color 0.15s ease;
}
.tf-auth-reveal:hover {
  color: var(--tf-ink);
  background: var(--tf-surface-sunken);
}
.tf-auth-field-error,
.tf-auth-field-success {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 7px 0 0;
  font-size: 12.5px;
}
.tf-auth-field-error {
  color: var(--tf-danger);
}
.tf-auth-field-success {
  color: var(--tf-success-ink);
}

/* Two-up field pair that collapses on a narrow card. */
.tf-auth-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.tf-auth-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 18px;
}
.tf-auth-check {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 14.5px;
  font-weight: 600;
  color: var(--tf-ink);
  cursor: pointer;
  user-select: none;
}
.tf-auth-check input[type="checkbox"] {
  width: 18px;
  height: 18px;
  margin: 0;
  accent-color: var(--tf-brand);
  cursor: pointer;
  flex-shrink: 0;
}

.tf-auth-btn {
  width: 100%;
  min-height: 46px;
  padding: 0 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-family: inherit;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0;
  color: var(--tf-brand-on);
  background: var(--tf-grad);
  border: 1px solid transparent;
  border-radius: var(--tf-radius-md);
  cursor: pointer;
  box-shadow: 0 18px 30px -22px rgba(15, 60, 153, 0.75);
  transition: background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.2s ease, opacity 0.15s ease, transform 0.15s ease;
}
.tf-auth-btn:hover:not(:disabled) {
  filter: saturate(1.06) brightness(1.06);
  box-shadow: 0 20px 34px -22px rgba(15, 60, 153, 0.82);
  transform: translateY(-1px);
}
.tf-auth-btn:active:not(:disabled) {
  filter: brightness(0.95);
  box-shadow: none;
  transform: translateY(0);
}
.tf-auth-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 4px var(--tf-ring);
}
.tf-auth-btn:disabled {
  background: var(--tf-surface-sunken);
  border-color: var(--tf-border);
  color: var(--tf-ink-faint);
  cursor: not-allowed;
  box-shadow: none;
  transform: none;
}
.tf-auth-btn--busy:disabled {
  background: var(--tf-grad);
  border-color: transparent;
  color: var(--tf-brand-on);
  opacity: 0.75;
}
.tf-auth-btn--outline {
  color: var(--tf-brand-ink);
  background: var(--tf-surface);
  filter: none;
  border-color: var(--tf-border-strong);
  box-shadow: none;
}
.tf-auth-btn--outline:hover:not(:disabled) {
  background: var(--tf-brand-tint);
  border-color: var(--tf-brand-border);
  box-shadow: none;
}
.tf-auth-btn--outline:active:not(:disabled) {
  background: var(--tf-brand-tint-solid);
}
.tf-auth-btn--auto {
  width: auto;
}
.tf-auth-btn--sm {
  min-height: 40px;
  font-size: 13.5px;
  padding: 0 14px;
}
.tf-auth-link {
  font-size: inherit;
  font-weight: 700;
  color: var(--tf-brand-ink);
  background: none;
  border: none;
  padding: 0;
  font-family: inherit;
  cursor: pointer;
  text-decoration: none;
  transition: color 0.15s ease;
}
.tf-auth-link:hover:not(:disabled) {
  color: var(--tf-brand-hover);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.tf-auth-link:disabled {
  color: var(--tf-ink-faint);
  cursor: default;
}

.tf-auth-alert {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  margin-bottom: 20px;
  border: 1px solid var(--tf-border);
  border-radius: var(--tf-radius-md);
  background: var(--tf-surface-subtle);
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--tf-ink-muted);
}
.tf-auth-alert svg {
  flex-shrink: 0;
  margin-top: 1px;
}
.tf-auth-alert--danger {
  background: var(--tf-danger-tint);
  border-color: var(--tf-danger-border);
  color: var(--tf-danger-ink);
}
.tf-auth-alert--brand {
  background: var(--tf-brand-tint);
  border-color: var(--tf-brand-border);
  color: var(--tf-brand-ink);
}
.tf-auth-alert--success {
  background: var(--tf-success-tint);
  border-color: var(--tf-success-border);
  color: var(--tf-success-ink);
}
.tf-auth-alert-title {
  font-weight: 700;
  color: inherit;
}
.tf-auth-alert-body {
  color: inherit;
  opacity: 0.85;
}
.tf-auth-panel {
  padding: 16px;
  background: var(--tf-surface-subtle);
  border: 1px solid var(--tf-border);
  border-radius: var(--tf-radius-md);
}
.tf-login-secure {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 16px;
  color: var(--tf-ink-muted);
  font-size: 13px;
  font-weight: 600;
}
.tf-auth-footer {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--tf-border);
  text-align: center;
  font-size: 13.5px;
  color: var(--tf-ink-muted);
}
.tf-auth-footer--outside {
  margin-top: 16px;
  padding-top: 0;
  border-top: 0;
}
.tf-auth-legal {
  margin-top: 10px;
  text-align: center;
  font-size: 12.5px;
  color: var(--tf-ink-subtle);
}

.tf-auth-otp-row {
  display: flex;
  justify-content: center;
  gap: 8px;
}
.tf-auth-otp {
  width: 48px;
  height: 56px;
  padding: 0;
  text-align: center;
  font-family: inherit;
  font-size: 22px;
  font-weight: 700;
  color: var(--tf-ink);
  background: var(--tf-surface);
  border: 1px solid var(--tf-border-strong);
  border-radius: var(--tf-radius-md);
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.tf-auth-otp:focus {
  border-color: var(--tf-brand);
  box-shadow: 0 0 0 4px var(--tf-ring);
}
.tf-auth-otp:disabled {
  background: var(--tf-surface-sunken);
  cursor: not-allowed;
}

@keyframes tf-auth-spin {
  to {
    transform: rotate(360deg);
  }
}
.tf-auth-spin {
  animation: tf-auth-spin 0.8s linear infinite;
}
@keyframes tf-auth-dot {
  0%, 80%, 100% {
    transform: translateY(0);
    opacity: 0.45;
  }
  40% {
    transform: translateY(-4px);
    opacity: 1;
  }
}
.tf-auth-dots {
  display: inline-flex;
  gap: 4px;
  align-items: center;
}
.tf-auth-dots > span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  animation: tf-auth-dot 1.2s infinite ease-in-out;
}
.tf-auth-dots > span:nth-child(2) {
  animation-delay: 0.15s;
}
.tf-auth-dots > span:nth-child(3) {
  animation-delay: 0.3s;
}

@media (max-width: 1120px) {
  .tf-auth-shell {
    gap: 34px;
    grid-template-columns: minmax(0, 1fr) minmax(420px, 540px);
  }
  .tf-auth-headline {
    font-size: 44px;
  }
}

/* Tightest two-column band: the column is narrow enough that the lede and the
   trust-card titles each wrap onto an extra line (~45px more than at 1120px).
   Give the illustration a smaller share so a 768px-tall window still fits. */
@media (min-width: 1024px) and (max-width: 1119px) {
  .tf-hero-art {
    width: min(560px, 100%, 46vh);
  }
}

@media (max-width: 1023px) {
  .tf-auth {
    padding: 24px 16px;
    align-items: flex-start;
  }
  .tf-auth-shell {
    display: block;
    max-width: 560px;
  }
  /* Screens with a brand panel keep it above the card: logo, a shortened
     headline and a reduced illustration. Screens without one (reset/set
     password) still get their in-card lockup from the base rule below. */
  .tf-auth--split .tf-auth-aside {
    display: flex;
    max-width: none;
    margin: 0 auto 16px;
    align-items: center;
    text-align: center;
  }
  .tf-auth--split .tf-auth-lockup {
    justify-content: center;
    margin-bottom: 12px;
  }
  .tf-auth--split .tf-auth-eyebrow {
    margin: 0 0 6px;
    font-size: 13px;
  }
  .tf-auth--split .tf-auth-headline {
    margin-top: 0;
    margin-bottom: 12px;
    font-size: 26px;
  }
  /* The lede repeats what the card already says once stacked; drop it and let
     the illustration carry the brand moment instead. */
  .tf-auth--split .tf-auth-lede,
  .tf-auth--split .tf-auth-features,
  .tf-auth--split .tf-login-proof-row {
    display: none;
  }
  .tf-auth--split .tf-hero-art {
    width: min(320px, 82vw);
    margin: 0 auto;
  }
  .tf-auth-main {
    max-width: 560px;
    margin: 0 auto;
    justify-self: auto;
  }
  .tf-auth-lockup--card {
    display: flex;
  }
  /* ...but not twice: the panel above already shows the logo. */
  .tf-auth--split .tf-auth-lockup--card {
    display: none;
  }
  .tf-auth::before {
    background-image:
      radial-gradient(circle at 8% 6%, color-mix(in srgb, var(--brand-blue) 12%, transparent) 0%, transparent 48%),
      radial-gradient(circle at 92% 96%, color-mix(in srgb, var(--brand-cyan) 10%, transparent) 0%, transparent 46%);
    background-position: 0 0, 0 0;
    background-size: 100% 100%, 100% 100%;
    opacity: 0.75;
  }
}

@media (max-width: 560px) {
  .tf-auth {
    padding: 16px;
  }
  .tf-auth-card,
  .tf-auth--login .tf-auth-card {
    padding: 20px 16px;
    border-radius: 18px;
  }
  .tf-login-card-top {
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 28px;
  }
  .tf-login-workspace {
    font-size: 13px;
    gap: 10px;
  }
  .tf-login-workspace-icon {
    width: 34px;
    height: 34px;
  }
  .tf-auth-title {
    font-size: 23px;
  }
  .tf-auth-subtitle {
    margin-bottom: 16px;
  }
  .tf-auth-input {
    height: 46px;
    font-size: 15px;
  }
  .tf-auth-btn {
    min-height: 46px;
    font-size: 15px;
  }
  .tf-auth-row {
    align-items: flex-start;
    margin-bottom: 18px;
  }
  .tf-auth-grid-2 {
    grid-template-columns: 1fr;
    gap: 0;
  }
  .tf-login-proof-row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 420px) {
  .tf-auth-card,
  .tf-auth--login .tf-auth-card {
    padding: 22px 16px;
  }
  .tf-login-card-top {
    flex-direction: column;
  }
  .tf-auth-row {
    flex-direction: column;
    gap: 12px;
  }
  .tf-auth-otp {
    width: 42px;
    height: 52px;
  }
  .tf-auth--split .tf-hero-art {
    width: min(260px, 80vw);
  }
  .tf-auth--split .tf-auth-headline {
    font-size: 23px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tf-auth *, .tf-auth *::before, .tf-auth *::after,
  .tf-auth-scope *, .tf-auth-scope *::before, .tf-auth-scope *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
`;
