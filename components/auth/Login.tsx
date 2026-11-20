'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Mail, Lock, Eye, EyeOff, AlertCircle, ArrowRight, ArrowLeft, Shield, ShieldAlert, Building2, KeyRound } from 'lucide-react';
import { User } from '@/lib/types/tenant';
import { authService, isTwoFactorRequired, LoginResponse, clearTokens } from '@/lib/services';
import { useAuth } from '@/lib/hooks/useAuth';
import { mapApiUserToUser } from '@/components/providers/AuthProvider';
import { encodeParam, encodePlanId } from '@/lib/utils/planEncoder';
import { detectSubdomain } from '@/lib/utils/subdomain';
import ForgotPasswordModal from './ForgotPasswordModal';
import { AUTH_THEME_CSS } from './authTheme';
import AuthBrandPanel from './AuthBrandPanel';
import { safeReturnUrl } from '@/lib/utils/safeReturnUrl';

interface LoginProps {
  onBackToPublic?: () => void;
}

// Recognise the backend's "account inactive / restricted" signal on a *rejected*
// login. The backend can express a deactivated account either as a 200 response
// carrying is_active=false (handled inline in handleSubmit) or — more commonly —
// as a 403/401 rejection whose message mentions the restriction. We match on the
// message text so a plain wrong-password 401 ("Invalid email or password") is NOT
// mistaken for a restriction.
const RESTRICTION_KEYWORDS = ['restrict', 'inactive', 'deactivat', 'disabled', 'not active'];
const isAccountRestrictedError = (err: unknown): boolean => {
  const e = err as { status?: number; message?: string };
  const msg = (e?.message || '').toLowerCase();
  return RESTRICTION_KEYWORDS.some((k) => msg.includes(k));
};

const getAuthErrorMessage = (err: unknown, fallback: string): string => {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
};

export default function Login({ onBackToPublic }: LoginProps) {
  const router = useRouter();
  const { login } = useAuth();
  const searchParams = useSearchParams();

  // Get plan and email from URL params (from signup redirect)
  const encodedPlanFromUrl = searchParams.get('plan');
  const emailFromUrl = searchParams.get('email');
  // ?force_relogin=1 — sent in the welcome email after an admin changes a
  // user's login email. The recipient may still be authenticated as their
  // OLD email in this browser; without clearing cookies/storage AuthProvider
  // would skip /login and redirect straight to /set-password, letting them
  // bypass the temp-password challenge.
  const forceRelogin = searchParams.get('force_relogin');

  useEffect(() => {
    if (!forceRelogin) return;
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      // Strip auth cookies so middleware sees an unauthenticated request.
      document.cookie = 'accessToken=; Path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      document.cookie = 'refreshToken=; Path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    } catch {/* noop */}
    // Drop the param so reloads don't keep clearing repeatedly.
    const url = new URL(window.location.href);
    url.searchParams.delete('force_relogin');
    window.history.replaceState({}, '', url.toString());
  }, [forceRelogin]);

  const [email, setEmail] = useState(emailFromUrl || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  // Set when the backend confirms the account is inactive/restricted. Renders a
  // dedicated red alert below the form (distinct from the generic `error` line)
  // and blocks any navigation to the dashboard.
  const [restricted, setRestricted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Live DOM handles for the credential inputs. Browser password managers can
  // autofill these after a soft client-side navigation (e.g. returning to /login
  // after logout) WITHOUT firing React's onChange, leaving the controlled state
  // empty even though the fields look filled. We read .value at submit time as a
  // fallback so we never POST an empty email/password.
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  // Subdomain (tenant) detection
  const [subdomain, setSubdomain] = useState<string | null>(null);

  useEffect(() => {
    const detected = detectSubdomain(new URLSearchParams(searchParams.toString()));
    if (!detected || typeof window === 'undefined') return;

    const timer = window.setTimeout(() => {
      setSubdomain(detected);
      // Persist immediately so getLoginUrl() can find it at logout time,
      // even if the user navigates away and the ?org= param is no longer in the URL.
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (isLocalhost) localStorage.setItem('talentflow_subdomain', detected);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [searchParams]);

  // 2FA State
  const [show2FA, setShow2FA] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
  const [userEmail2FA, setUserEmail2FA] = useState('');
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Load saved email from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const timer = window.setTimeout(() => {
      try {
        const savedEmail = localStorage.getItem('rememberedEmail');
        const savedRememberMe = localStorage.getItem('rememberMe') === 'true';

        if (savedEmail && savedRememberMe && !emailFromUrl) {
          setEmail(savedEmail);
          setRememberMe(true);
        }
      } catch (error) {
        console.error('Error loading saved credentials:', error);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [emailFromUrl]);

  const handleLoginSuccess = (response: LoginResponse) => {
    // Build the user via the SAME mapper the session-restore path uses
    // (AuthProvider.mapApiUserToUser). Previously this component hand-rolled the
    // User object and silently omitted several fields — permissionCodes, Teams
    // perms, canArchiveJD/canDisableJD, and the internal-DB create/update/delete
    // grants. That made permission-gated buttons stay hidden until a manual
    // refresh (which runs /auth/me → mapApiUserToUser and fills them in). Reusing
    // the single mapper guarantees the just-logged-in state matches the
    // post-refresh state exactly, so gated UI appears immediately.
    const user: User = mapApiUserToUser(response.user);

    // Save or clear email based on "Remember me" checkbox
    try {
      if (rememberMe) {
        // Use the authoritative email from the login response rather than the
        // `email` state, which may lag behind an autofilled value (see handleSubmit).
        localStorage.setItem('rememberedEmail', response.user.email);
        localStorage.setItem('rememberMe', 'true');
      } else {
        localStorage.removeItem('rememberedEmail');
        localStorage.removeItem('rememberMe');
      }
    } catch (error) {
      console.error('Error saving remember me preference:', error);
    }

    // Normal login — populate auth store (triggers WebSocket, dashboard, etc.)
    login(user, response.tenant_name);

    // Check if tenant has pending payment - redirect to payment page with encoded params
    if (response.pending_payment && response.pending_payment_redirect) {
      // Backend sends raw URL like /complete-payment?tenant_id=xxx&plan_id=63
      // Encode the params so they're not visible in the URL
      try {
        const url = new URL(response.pending_payment_redirect, window.location.origin);
        const rawTenantId = url.searchParams.get('tenant_id');
        const rawPlanId = url.searchParams.get('plan_id');
        if (rawTenantId && rawPlanId) {
          const encodedUrl = `/complete-payment?t=${encodeURIComponent(encodeParam(rawTenantId))}&p=${encodeURIComponent(encodePlanId(rawPlanId))}`;
          console.log('[LOGIN] Tenant has pending payment, redirecting to encoded URL');
          router.push(encodedUrl);
          return;
        }
      } catch {
        // Fallback to raw URL if parsing fails
      }
      // Backend-supplied: same-site paths only (security sheet N4).
      router.push(safeReturnUrl(response.pending_payment_redirect, '/complete-payment'));
      return;
    }

    // Redirect to current-plan page with selected plan if coming from pricing
    if (encodedPlanFromUrl) {
      router.push(`/subscription/current-plan?plan=${encodedPlanFromUrl}`);
    } else {
      router.push('/dashboard');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setRestricted(false);

    // Prefer React state, but fall back to the live DOM value in case the field
    // was autofilled without firing onChange (see emailInputRef comment above).
    const emailValue = (email || emailInputRef.current?.value || '').toLowerCase().trim();
    const passwordValue = password || passwordInputRef.current?.value || '';

    if (!emailValue || !passwordValue) {
      setError('Please enter your email and password.');
      return;
    }

    // Keep state in sync so the rest of the UI reflects the resolved values.
    if (emailValue !== email) setEmail(emailValue);
    if (passwordValue !== password) setPassword(passwordValue);

    // Re-detect synchronously instead of trusting `subdomain` state: that state is
    // only set by the mount effect above via a setTimeout(0), so a fast submit
    // (e.g. a password-manager autofill immediately followed by a click) can race
    // ahead of it and send the login request with no org context at all. Since
    // detectSubdomain() itself is synchronous, calling it again right here always
    // has the answer in time for submit.
    const resolvedSubdomain = detectSubdomain(new URLSearchParams(searchParams.toString())) || subdomain;

    setIsLoading(true);

    try {
      const response = await authService.login({ email: emailValue, password: passwordValue, subdomain: resolvedSubdomain || undefined });

      // Check if 2FA is required
      if (isTwoFactorRequired(response)) {
        console.log('[LOGIN] 2FA required, showing OTP input');
        setTempToken(response.temp_token);
        setUserEmail2FA(response.user_email);
        setShow2FA(true);
        setIsLoading(false);
        // Focus first OTP input
        setTimeout(() => otpInputRefs.current[0]?.focus(), 100);
        return;
      }

      // Account restriction gate — if the backend authenticated the request but
      // the account is inactive, stop here. We do NOT populate the auth store or
      // navigate, and we clear the just-stored tokens so a page reload can't use
      // them to restore a session and slip into the dashboard (acceptance #5).
      if (response.user && response.user.is_active === false) {
        clearTokens();
        setRestricted(true);
        setIsLoading(false);
        return;
      }

      // Normal login success — tokens are now stored.
      // must_reset_password is already in the login response; no need for a second /auth/me roundtrip.
      if (response.must_reset_password) {
        localStorage.setItem('pending_password_reset', 'true');
        window.location.href = '/set-password';
        return;
      }

      handleLoginSuccess(response);
    } catch (err: unknown) {
      console.error('Login error:', err);
      // The backend more commonly rejects an inactive account outright (403/401).
      // Show the dedicated restriction alert instead of the generic error line.
      if (isAccountRestrictedError(err)) {
        setError('');
        setRestricted(true);
      } else {
        setError(getAuthErrorMessage(err, 'Invalid email or password. Please check your credentials.'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return; // Only allow digits

    const newOtp = [...otpCode];
    newOtp[index] = value.slice(-1); // Only take last digit
    setOtpCode(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpCode[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newOtp = [...otpCode];
    for (let i = 0; i < pastedData.length; i++) {
      newOtp[i] = pastedData[i];
    }
    setOtpCode(newOtp);
    if (pastedData.length === 6) {
      otpInputRefs.current[5]?.focus();
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otpCode.join('');
    if (code.length !== 6) {
      setError('Please enter a 6-digit verification code');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const response = await authService.verify2FALogin(tempToken, code);

      // Tokens are now stored. must_reset_password comes directly from the 2FA response.
      if (response.must_reset_password) {
        localStorage.setItem('pending_password_reset', 'true');
        window.location.href = '/set-password';
        return;
      }

      handleLoginSuccess(response);
    } catch (err: unknown) {
      console.error('2FA verification error:', err);
      setError(getAuthErrorMessage(err, 'Invalid verification code. Please try again.'));
      setOtpCode(['', '', '', '', '', '']);
      otpInputRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack2FA = () => {
    setShow2FA(false);
    setTempToken('');
    setOtpCode(['', '', '', '', '', '']);
    setUserEmail2FA('');
    setError('');
  };

  const workspaceName = subdomain ? subdomain.charAt(0).toUpperCase() + subdomain.slice(1) : 'TalentFlow';
  const brandLogo = (
    <Image
      src="/logos/talent_flow_logo.png"
      alt="BION TalentFlow"
      width={314}
      height={70}
      className="tf-auth-logo"
    />
  );

  return (
    <div className="tf-auth tf-auth--login tf-auth--split">
      <style>{AUTH_THEME_CSS}</style>

      <div className="tf-auth-shell">
        {/* Left column — shared brand panel (logo, headline, AI illustration).
            Reduced but still present on mobile. */}
        <AuthBrandPanel
          onBackToPublic={onBackToPublic}
          label="TalentFlow sign in overview"
          eyebrow="AI-Powered Recruitment."
          headline={<>
            Smarter Hiring.<br />
            Better Outcomes.
          </>}
          lede={<>
            Our AI-driven platform helps you create jobs, screen, assess,
            interview, and match the best talent — faster and smarter.
          </>}
        />

        {/* Right column — the form */}
        <div className="tf-auth-main">
          <div className="tf-auth-card">
            {/* Back Button */}
            {/* Compact lockup — only rendered visibly on narrow viewports */}
            <div className="tf-auth-lockup tf-auth-lockup--card">
              {onBackToPublic ? (
                <button type="button" onClick={onBackToPublic} className="tf-auth-logo-link" aria-label="Back to home">
                  {brandLogo}
                </button>
              ) : brandLogo}
            </div>

            <div className="tf-login-card-top">
              <div className="tf-login-workspace">
                <span className="tf-login-workspace-icon">
                  <Building2 style={{ width: 18, height: 18 }} />
                </span>
                <span>
                  Signing in to <strong>{workspaceName}</strong> workspace
                </span>
              </div>
            </div>

            {/* 2FA Verification View / Regular Login */}
            {show2FA ? (
              <>
                <button type="button" onClick={handleBack2FA} className="tf-auth-back">
                  <ArrowLeft style={{ width: 15, height: 15 }} />
                  <span>Back</span>
                </button>

                <div style={{ marginBottom: 28 }}>
                  <div
                    className="tf-auth-feature-icon"
                    style={{ width: 40, height: 40, marginBottom: 16 }}
                  >
                    <Shield style={{ width: 20, height: 20 }} />
                  </div>
                  <h2 className="tf-auth-title">Two-factor authentication</h2>
                  <p className="tf-auth-subtitle" style={{ marginBottom: 0 }}>
                    Enter the 6-digit code from your authenticator app.
                  </p>
                  <p style={{ fontSize: 13.5, color: 'var(--tf-ink-faint)', margin: '6px 0 0' }}>
                    Signing in as{' '}
                    <strong style={{ color: 'var(--tf-ink-muted)', fontWeight: 600 }}>{userEmail2FA}</strong>
                  </p>
                </div>

                {error && (
                  <div className="tf-auth-alert tf-auth-alert--danger">
                    <AlertCircle style={{ width: 17, height: 17 }} />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleVerify2FA}>
                  <div className="tf-auth-otp-row" style={{ marginBottom: 28 }}>
                    {otpCode.map((digit, index) => (
                      <input
                        key={index}
                        ref={(el) => { otpInputRefs.current[index] = el; }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpChange(index, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(index, e)}
                        onPaste={index === 0 ? handleOtpPaste : undefined}
                        aria-label={`Digit ${index + 1} of 6`}
                        className="tf-auth-otp"
                      />
                    ))}
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading || otpCode.join('').length !== 6}
                    className={`tf-auth-btn${isLoading ? ' tf-auth-btn--busy' : ''}`}
                  >
                    {isLoading ? (
                      <>
                        Verifying
                        <span className="tf-auth-dots"><span /><span /><span /></span>
                      </>
                    ) : (
                      <>
                        <KeyRound style={{ width: 17, height: 17 }} />
                        Verify and sign in
                      </>
                    )}
                  </button>
                </form>

                <p style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: 'var(--tf-ink-subtle)', lineHeight: 1.55 }}>
                  Open your authenticator app (Google Authenticator, Authy, and similar)
                  to view your verification code.
                </p>
              </>
            ) : (
              <>
                <h2 className="tf-auth-title">Welcome back</h2>
                <p className="tf-auth-subtitle">Sign in to access your recruitment dashboard and manage your hiring journey.</p>

                {error && (
                  <div className="tf-auth-alert tf-auth-alert--danger">
                    <AlertCircle style={{ width: 17, height: 17 }} />
                    <span>{error}</span>
                  </div>
                )}

                {/*
                  Defence in depth against credential leakage in the URL:
                  - method="POST" — if anything ever bypasses handleSubmit's preventDefault,
                    the browser will submit via POST (body), not GET (query string), so
                    email/password cannot be appended to the address bar.
                  - action="#" — pins the native action to the current page anchor rather
                    than re-navigating to /login with serialised fields.
                  - noValidate — disables the browser's HTML5 validation popups so our own
                    handler is the single source of truth and can't be short-circuited.
                */}
                <form onSubmit={handleSubmit} method="POST" action="#" noValidate>
                  {/* Email */}
                  <div className="tf-auth-field">
                    <label className="tf-auth-label" htmlFor="tf-login-email">Email address</label>
                    <div className="tf-auth-control">
                      <span className="tf-auth-control-icon">
                        <Mail style={{ width: 17, height: 17 }} />
                      </span>
                      <input
                        id="tf-login-email"
                        ref={emailInputRef}
                        type="email"
                        // No `name` attribute — if a native form submit ever slipped past
                        // handleSubmit's preventDefault, a named field would get serialised
                        // into the URL (?email=…). `autoComplete` still works without it.
                        autoComplete="username"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter your email"
                        required
                        className="tf-auth-input"
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="tf-auth-field">
                    <label className="tf-auth-label" htmlFor="tf-login-password">Password</label>
                    <div className="tf-auth-control">
                      <span className="tf-auth-control-icon">
                        <Lock style={{ width: 17, height: 17 }} />
                      </span>
                      <input
                        id="tf-login-password"
                        ref={passwordInputRef}
                        type={showPassword ? 'text' : 'password'}
                        // No `name` attribute — see email input above. Critical for passwords:
                        // a serialised ?password=… in the URL would land in browser history,
                        // server access logs, and the Referer header on any outbound link.
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        required
                        className="tf-auth-input tf-auth-input--reveal"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="tf-auth-reveal"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff style={{ width: 17, height: 17 }} /> : <Eye style={{ width: 17, height: 17 }} />}
                      </button>
                    </div>
                  </div>

                  {/* Remember & Forgot */}
                  <div className="tf-auth-row">
                    <label className="tf-auth-check">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                      />
                      <span>Remember me</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowForgotPasswordModal(true)}
                      className="tf-auth-link"
                      style={{ fontSize: 13.5 }}
                    >
                      Forgot password?
                    </button>
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className={`tf-auth-btn${isLoading ? ' tf-auth-btn--busy' : ''}`}
                  >
                    {isLoading ? (
                      <>
                        Signing in
                        <span className="tf-auth-dots"><span /><span /><span /></span>
                      </>
                    ) : (
                      <>
                        Sign in to Dashboard
                        <ArrowRight style={{ width: 17, height: 17 }} />
                      </>
                    )}
                  </button>
                </form>

                {/* Account restricted alert — shown directly below the form only
                    after a login attempt confirms the account is inactive. */}
                {restricted && (
                  <div
                    className="tf-auth-alert tf-auth-alert--danger"
                    style={{ marginTop: 20, marginBottom: 0 }}
                    role="alert"
                    aria-live="assertive"
                  >
                    <ShieldAlert style={{ width: 18, height: 18 }} />
                    <div>
                      <div className="tf-auth-alert-title">Your account has been restricted</div>
                      <div className="tf-auth-alert-body">Please contact your administrator for more information.</div>
                    </div>
                  </div>
                )}

                <div className="tf-login-secure">
                  <Lock style={{ width: 17, height: 17 }} />
                  <span>Your data is secure and encrypted</span>
                </div>

              </>
            )}
          </div>

          {!show2FA && (
            <div className="tf-auth-footer tf-auth-footer--outside">
              Don&apos;t have an account?{' '}
              {/* No prefetch: on a tenant subdomain /contact is a marketing page the
                  proxy bounces to /login, so prefetching it from here only cost a
                  ~0.8 s request on every login visit. */}
              <Link href="/contact" prefetch={false} className="tf-auth-link">
                Contact your administrator
              </Link>
            </div>
          )}

          <div className="tf-auth-legal">© 2026 TalentFlow. All rights reserved.</div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      <ForgotPasswordModal
        isOpen={showForgotPasswordModal}
        onClose={() => setShowForgotPasswordModal(false)}
      />
    </div>
  );
}
