'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Mail, Lock, Eye, EyeOff, CheckCircle, ArrowLeft, Loader2, AlertCircle, KeyRound, Send, ShieldOff, UserX, Check, Clock, LogIn } from 'lucide-react';
import authService from '@/lib/services/authService';
import { detectSubdomain } from '@/lib/utils/subdomain';
import ResetPasswordArt from './ResetPasswordArt';
import VerifyCodeArt from './VerifyCodeArt';
import PasswordLockArt from './PasswordLockArt';
import ResetSuccessArt from './ResetSuccessArt';
import SuccessAnimation from '@/components/ui/success-animation';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ModalStep = 'email' | 'otp' | 'password' | 'success' | 'firstLogin' | 'accountSuspended' | 'userDeactivated';
type OtpPhase = 'idle' | 'grid' | 'swap1' | 'swap2' | 'merge' | 'done';

export default function ForgotPasswordModal({ isOpen, onClose }: ForgotPasswordModalProps) {
  const [step, setStep] = useState<ModalStep>('email');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  // First-time-login flow (invited user who hasn't set their own password yet)
  const [firstLoginMessage, setFirstLoginMessage] = useState('');
  const [tempSentAgain, setTempSentAgain] = useState(false);

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Seconds shown on the success step. Display only -- the redirect itself is
  // the 3s setTimeout in handlePasswordSubmit, which is unchanged.
  const [redirectIn, setRedirectIn] = useState(3);

  useEffect(() => {
    if (step !== 'success') return;
    const id = setInterval(() => setRedirectIn((n) => (n > 0 ? n - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [step]);

  // Success choreography for the OTP step. The phase drives .tf-otp-stage--*;
  // every visual is CSS, this only decides when each phase begins.
  const [otpPhase, setOtpPhase] = useState<OtpPhase>('idle');
  const otpTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearOtpTimers = () => {
    otpTimers.current.forEach(clearTimeout);
    otpTimers.current = [];
  };

  // Drop any pending phase changes if the dialog unmounts mid-sequence.
  useEffect(() => clearOtpTimers, []);

  /**
   * Runs row -> grid -> two rounds of cell-for-cell swaps -> merge -> tick,
   * then hands over to `onDone`. The offsets are cumulative milliseconds and
   * each one clears the CSS transition it follows, so no phase starts before
   * the last has settled (the swaps travel for 0.9s each).
   */
  const runOtpSuccess = (onDone: () => void) => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* The success Lottie's own running time. `public/animations/success.json`
       is 45 frames at 29.97fps, so it needs a shade over 1.5s from the moment
       the 'done' phase mounts it.

       This used to be 900ms (done 3300 -> handover 4200), which was sized for
       the CSS tick that preceded it — a scale-in that is over in a third of a
       second. The Lottie was therefore cut off around 60% and the password step
       arrived on top of a half-drawn animation. */
    const SUCCESS_LOTTIE_MS = 1502;
    // A beat after it finishes, so the completed tick registers as a result
    // rather than flicking straight to the next screen.
    const SETTLE_MS = 400;
    const DONE_AT = 3300;

    // Reduced motion: the theme already collapses every transition to ~0s, so
    // hold each phase just long enough to read rather than replaying the turn.
    // No Lottie plays on this path — it falls back to the static tick — so the
    // handover stays short and owes nothing to the durations above.
    const at = reduced
      ? { swap1: 0, swap2: 0, merge: 0, done: 0, handover: 700 }
      : {
          swap1: 700,
          swap2: 1700,
          merge: 2700,
          done: DONE_AT,
          handover: DONE_AT + SUCCESS_LOTTIE_MS + SETTLE_MS,
        };

    clearOtpTimers();
    setOtpPhase('grid');
    (['swap1', 'swap2', 'merge', 'done'] as const).forEach((phase) => {
      otpTimers.current.push(setTimeout(() => setOtpPhase(phase), at[phase]));
    });
    otpTimers.current.push(setTimeout(onDone, at.handover));
  };

  // The tenant this reset is scoped to — taken from the login page URL (subdomain / ?org=).
  const getTenantSubdomain = (): string | null =>
    detectSubdomain(typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : undefined);

  // Resend timer countdown
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setStep('email');
        setEmail('');
        setOtpCode(['', '', '', '', '', '']);
        setNewPassword('');
        setConfirmPassword('');
        setResetToken('');
        setError('');
        setResendTimer(0);
        setFirstLoginMessage('');
        setTempSentAgain(false);
        setOtpPhase('idle');
        setRedirectIn(3);
      }, 300);
    }
  }, [isOpen]);

  // Password strength validation
  const getPasswordStrength = (password: string) => {
    let strength = 0;
    const checks = {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password),
    };

    Object.values(checks).forEach(check => {
      if (check) strength++;
    });

    return { strength, checks };
  };

  const { strength, checks } = getPasswordStrength(newPassword);

  // Handle email submission
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await authService.forgotPassword(email, getTenantSubdomain());
      // Organization suspended by super admin — block reset entirely.
      if (res?.account_suspended) {
        setStep('accountSuspended');
        return;
      }
      // User deactivated by tenant admin — block reset entirely.
      if (res?.user_deactivated) {
        setStep('userDeactivated');
        return;
      }
      // Invited user who hasn't set their own password yet — block reset, guide to temp password.
      if (res?.requires_temp_password_login) {
        setFirstLoginMessage(res.message || '');
        setTempSentAgain(false);
        setStep('firstLogin');
        return;
      }
      setStep('otp');
      setResendTimer(60);
    } catch (err: any) {
      setError(err.message || 'Failed to send verification code');
    } finally {
      setIsLoading(false);
    }
  };

  // First-time-login: send a fresh temporary password (invalidates the old one)
  const handleSendAgain = async () => {
    setError('');
    setIsLoading(true);
    try {
      await authService.resendTempPassword(email, getTenantSubdomain());
      setTempSentAgain(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send a new temporary password');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle OTP input
  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otpCode];
    newOtp[index] = value;
    setOtpCode(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }

    // Auto-verify when all digits entered
    if (newOtp.every(digit => digit) && newOtp.join('').length === 6) {
      handleOtpSubmit(newOtp.join(''));
    }
  };

  // Handle OTP paste
  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const paste = e.clipboardData.getData('text').trim();
    if (!/^\d{6}$/.test(paste)) return;

    const newOtp = paste.split('');
    setOtpCode(newOtp);
    otpRefs.current[5]?.focus();
    handleOtpSubmit(paste);
  };

  // Handle OTP backspace
  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpCode[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  // Handle OTP submission
  const handleOtpSubmit = async (code?: string) => {
    const otpValue = code || otpCode.join('');
    if (otpValue.length !== 6) {
      setError('Please enter all 6 digits');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const response = await authService.verifyResetOTP(email, otpValue, getTenantSubdomain());
      setResetToken(response.reset_token);
      runOtpSuccess(() => setStep('password'));
    } catch (err: any) {
      setError(err.message || 'Invalid verification code');
      setOtpCode(['', '', '', '', '', '']);
      setOtpPhase('idle');
      otpRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  // Handle password reset
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (strength < 5) {
      setError('Please meet all password requirements');
      return;
    }

    setIsLoading(true);

    try {
      await authService.resetPassword(resetToken, newPassword);
      setRedirectIn(3);
      setStep('success');
      setTimeout(() => {
        onClose();
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle resend OTP
  const handleResendOtp = async () => {
    if (resendTimer > 0) return;

    setError('');
    setIsLoading(true);

    try {
      await authService.forgotPassword(email, getTenantSubdomain());
      setOtpCode(['', '', '', '', '', '']);
      setResendTimer(60);
      otpRefs.current[0]?.focus();
    } catch (err: any) {
      setError(err.message || 'Failed to resend code');
    } finally {
      setIsLoading(false);
    }
  };
  if (!isOpen) return null;

  // Copy for the header, kept in one place so the two lines never drift apart.
  const HEADINGS: Record<ModalStep, { title: string; subtitle: React.ReactNode }> = {
    email:            { title: 'Reset your password',   subtitle: 'We’ll send you a verification code to securely reset your password.' },
    otp:              { title: 'Enter verification code', subtitle: <>Code sent to <span className="tf-fp-subtitle-em">{email}</span></> },
    password:         { title: 'Create new password',    subtitle: 'Choose a strong password to keep your account secure.' },
    success:          { title: 'Password reset',         subtitle: 'You can now sign in with your new password' },
    firstLogin:       { title: 'Finish setting up your account', subtitle: 'This is your first sign-in' },
    accountSuspended: { title: 'Account suspended',      subtitle: 'Password reset is unavailable' },
    userDeactivated:  { title: 'Account deactivated',    subtitle: 'Password reset is unavailable' },
  };
  const heading = HEADINGS[step];

  return (
    <div className="tf-auth-scope tf-fp-overlay">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={heading.title}
        className="tf-fp-modal"
      >
        <button onClick={onClose} className="tf-fp-close" aria-label="Close">
          <X style={{ width: 20, height: 20 }} />
        </button>

        <div className="tf-fp-body">
          {/* Header */}
          <div
            className={`tf-fp-head${
              step === 'otp' || step === 'password' ? ' tf-fp-head--badge' : ''
            }`}
          >
            {step === 'otp' && (
              <span className="tf-fp-badge" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="32" height="32">
                  <path fill="currentColor" d="M12 2l7.5 2.7v6.1c0 4.9-3.2 8.4-7.5 9.6-4.3-1.2-7.5-4.7-7.5-9.6V4.7z" />
                  <path
                    d="M8.6 11.9l2.4 2.4 4.4-4.4"
                    fill="none"
                    stroke="#fff"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            )}
            {step === 'password' && (
              <span className="tf-fp-badge tf-fp-badge--lg" aria-hidden="true">
                <svg viewBox="0 0 40 40" width="40" height="40">
                  <path
                    className="fp-spark"
                    d="M6 8l1.1 2.8L9.9 12l-2.8 1.1L6 15.9l-1.1-2.8L2.1 12l2.8-1.1z"
                  />
                  <circle className="fp-spark" cx="34" cy="27" r="1.8" />
                  <path
                    fill="currentColor"
                    d="M20 5l10 3.6v8.1c0 6.6-4.3 11.2-10 12.8-5.7-1.6-10-6.2-10-12.8V8.6z"
                  />
                  <rect x="16.2" y="17.4" width="7.6" height="7" rx="1.6" fill="#fff" />
                  <path
                    d="M17.8 17.4v-2.3a2.2 2.2 0 0 1 4.4 0v2.3"
                    fill="none"
                    stroke="#fff"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            )}
            <div>
              <h2 className="tf-fp-title">{heading.title}</h2>
              <p className="tf-fp-subtitle">{heading.subtitle}</p>
            </div>
            {step === 'email' && <ResetPasswordArt />}
          </div>
          <div className="tf-fp-rule" />
          {/* Error Message */}
          {error && (
            <div className="tf-auth-alert tf-auth-alert--danger">
              <AlertCircle style={{ width: 17, height: 17 }} />
              <span>{error}</span>
            </div>
          )}

          {/* Step 1: Email Entry */}
          {step === 'email' && (
            <form onSubmit={handleEmailSubmit}>
              <div className="tf-fp-field">
                <label className="tf-fp-label" htmlFor="tf-fp-email">Email address</label>
                <div className="tf-fp-control">
                  <span className="tf-fp-control-icon">
                    <Mail style={{ width: 19, height: 19 }} />
                  </span>
                  <input
                    id="tf-fp-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="tf-fp-input"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || !email}
                className="tf-fp-btn tf-fp-btn--primary"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="tf-auth-spin" style={{ width: 19, height: 19 }} />
                    Sending code…
                  </>
                ) : (
                  <>
                    <Send style={{ width: 19, height: 19 }} />
                    Send verification code
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="tf-fp-btn tf-fp-btn--ghost"
              >
                <ArrowLeft style={{ width: 19, height: 19 }} />
                Back to sign in
              </button>

              <div className="tf-fp-hint">
                <span className="tf-fp-hint-icon" aria-hidden="true">i</span>
                <div>
                  <p className="tf-fp-hint-title">Didn&apos;t receive the code?</p>
                  <p className="tf-fp-hint-copy">
                    Check your spam or junk folder. The code will expire in{' '}
                    <span className="tf-fp-hint-strong">10 minutes</span>.
                  </p>
                </div>
              </div>
            </form>
          )}

          {/* Step 2: OTP Verification */}
          {step === 'otp' && (
            <div>
              <div className="tf-fp-prompt">
                <VerifyCodeArt />
                <div>
                  <p className="tf-fp-prompt-title">Enter the 6-digit code we sent to your email</p>
                  <p className="tf-fp-prompt-copy">Please check your inbox and enter the code below.</p>
                </div>
              </div>
              <div className={`tf-otp-stage tf-otp-stage--${otpPhase}`}>
                <div className="tf-otp-rotor" onPaste={handleOtpPaste}>
                  {otpCode.map((digit, index) => (
                    <input
                      key={index}
                      /* Block body so the callback returns undefined. React 19 treats a
                         ref callback's return value as a cleanup function, and the concise
                         arrow returned the assigned element. */
                      ref={(el) => { otpRefs.current[index] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      aria-label={`Digit ${index + 1} of 6`}
                      placeholder="–"
                      className="tf-auth-otp tf-otp-cell"
                      readOnly={otpPhase !== 'idle'}
                    />
                  ))}
                </div>
                <div
                  className="tf-otp-merged"
                  role="status"
                  aria-label={otpPhase === 'done' ? 'Verification code accepted' : undefined}
                >
                  {/* Mounted only at 'done', deliberately.
                      The merged bar is in the DOM the whole time (the phases
                      just fade it in), so a Lottie rendered alongside it would
                      autoplay while still invisible and be finished before the
                      user ever saw it. Mounting on the phase that reveals the
                      bar is what makes it play on arrival.

                      Reduced motion — and the frame before the player loads —
                      falls back to the tick that was here before, in the green
                      this bar expects. */}
                  {otpPhase === 'done' && (
                    <SuccessAnimation
                      className="tf-otp-lottie"
                      fallback={
                        <Check className="tf-otp-tick" style={{ width: 26, height: 26, opacity: 1, transform: 'none' }} />
                      }
                    />
                  )}
                </div>
              </div>

              <div className="tf-fp-resend">
                <span className="tf-fp-resend-icon" aria-hidden="true">
                  <Clock style={{ width: 18, height: 18 }} />
                </span>
                {resendTimer > 0 ? (
                  <span>
                    Resend code in <span className="tf-fp-resend-time">{resendTimer}s</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={isLoading}
                    className="tf-auth-link"
                    style={{ fontSize: 15 }}
                  >
                    Resend code
                  </button>
                )}
              </div>

              <div className="tf-fp-hint tf-fp-hint--inline">
                <span className="tf-fp-hint-icon" aria-hidden="true">i</span>
                <p className="tf-fp-hint-copy">
                  Didn&apos;t receive the code? Check your spam or junk folder.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setStep('email')}
                className="tf-fp-btn tf-fp-btn--ghost"
              >
                <ArrowLeft style={{ width: 19, height: 19 }} />
                Change email
              </button>
            </div>
          )}

          {/* Step 3: New Password */}
          {step === 'password' && (
            <form onSubmit={handlePasswordSubmit}>
              <div className="tf-fp-field">
                <label className="tf-fp-label" htmlFor="tf-fp-new">New password</label>
                <div className="tf-fp-control tf-fp-control--tile">
                  <span className="tf-fp-control-icon">
                    <Lock style={{ width: 19, height: 19 }} />
                  </span>
                  <input
                    id="tf-fp-new"
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="tf-fp-input"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="tf-fp-reveal"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff style={{ width: 19, height: 19 }} /> : <Eye style={{ width: 19, height: 19 }} />}
                  </button>
                </div>
              </div>

              <div className="tf-fp-field">
                <label className="tf-fp-label" htmlFor="tf-fp-confirm">Confirm password</label>
                <div className="tf-fp-control tf-fp-control--tile">
                  <span className="tf-fp-control-icon">
                    <Lock style={{ width: 19, height: 19 }} />
                  </span>
                  <input
                    id="tf-fp-confirm"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="tf-fp-input"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="tf-fp-reveal"
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff style={{ width: 19, height: 19 }} /> : <Eye style={{ width: 19, height: 19 }} />}
                  </button>
                </div>
              </div>

              <div className="tf-pw-req">
                <PasswordLockArt />
                <div className="tf-pw-req-head">
                  <span className="tf-pw-req-shield" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="30" height="30">
                      <path fill="currentColor" d="M12 2l7.5 2.7v6.1c0 4.9-3.2 8.4-7.5 9.6-4.3-1.2-7.5-4.7-7.5-9.6V4.7z" />
                      <path
                        d="M8.6 11.9l2.4 2.4 4.4-4.4"
                        fill="none"
                        stroke="#fff"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <div>
                    <p className="tf-pw-req-title">Password requirements</p>
                    <p className="tf-pw-req-sub">Your password must include:</p>
                  </div>
                </div>
                <div className="tf-pw-req-list">
                  {[
                    { label: 'At least 8 characters', check: checks.length },
                    { label: 'One uppercase letter (A-Z)', check: checks.uppercase },
                    { label: 'One lowercase letter (a-z)', check: checks.lowercase },
                    { label: 'One number (0-9)', check: checks.number },
                    { label: 'One special character (!@#$%^&*)', check: checks.special },
                  ].map((req) => (
                    <div
                      key={req.label}
                      className={`tf-pw-req-item${req.check ? ' is-met' : ''}`}
                    >
                      <span className="tf-pw-req-mark" aria-hidden="true">
                        <Check style={{ width: 14, height: 14 }} strokeWidth={3} />
                      </span>
                      <span>{req.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || strength < 5}
                className="tf-fp-btn tf-fp-btn--primary"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="tf-auth-spin" style={{ width: 19, height: 19 }} />
                    Resetting password…
                  </>
                ) : (
                  <>
                    <Lock style={{ width: 19, height: 19 }} />
                    Reset password
                  </>
                )}
              </button>

              <p className="tf-pw-note">
                <span className="tf-pw-note-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="16" height="16">
                    <path fill="currentColor" d="M12 2l7.5 2.7v6.1c0 4.9-3.2 8.4-7.5 9.6-4.3-1.2-7.5-4.7-7.5-9.6V4.7z" />
                    <path
                      d="M8.6 11.9l2.4 2.4 4.4-4.4"
                      fill="none"
                      stroke="#fff"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                Your password is encrypted and stored securely.
              </p>
            </form>
          )}

          {/* First-time login: block reset, guide to temporary password */}
          {step === 'firstLogin' && (
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 14, marginBottom: 18 }}>
                <div className="tf-auth-feature-icon" style={{ width: 48, height: 48 }}>
                  <KeyRound style={{ width: 22, height: 22 }} />
                </div>
                <p style={{ fontSize: 13.5, color: 'var(--tf-ink-muted)', lineHeight: 1.6, margin: 0 }}>
                  {firstLoginMessage ||
                    'This looks like your first time signing in. Please sign in with the temporary password from your invite email, then set your own password.'}
                </p>
              </div>

              {tempSentAgain ? (
                <div className="tf-auth-alert tf-auth-alert--success">
                  <CheckCircle style={{ width: 17, height: 17 }} />
                  <span>
                    A new temporary password is on its way to <strong style={{ fontWeight: 600 }}>{email}</strong>.
                    Your previous temporary password no longer works — use the newest one.
                  </span>
                </div>
              ) : (
                <>
                  <div className="tf-auth-alert">
                    <AlertCircle style={{ width: 16, height: 16 }} />
                    <span>
                      Clicking <strong style={{ fontWeight: 600 }}>Send again</strong> invalidates your previous
                      temporary password. Only the newest one will work.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSendAgain}
                    disabled={isLoading}
                    className={`tf-auth-btn${isLoading ? ' tf-auth-btn--busy' : ''}`}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="tf-auth-spin" style={{ width: 17, height: 17 }} />
                        Sending…
                      </>
                    ) : (
                      <>
                        <Send style={{ width: 15, height: 15 }} />
                        Send again
                      </>
                    )}
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={onClose}
                className="tf-auth-btn tf-auth-btn--outline"
                style={{ marginTop: 10, borderColor: 'var(--tf-border)', color: 'var(--tf-ink-muted)' }}
              >
                <ArrowLeft style={{ width: 15, height: 15 }} />
                Back to sign in
              </button>
            </div>
          )}

          {/* Account Suspended: tenant suspended by super admin */}
          {step === 'accountSuspended' && (
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 14, marginBottom: 18 }}>
                <div
                  className="tf-auth-feature-icon"
                  style={{ width: 48, height: 48, background: 'var(--tf-danger-tint)', color: 'var(--tf-danger)' }}
                >
                  <ShieldOff style={{ width: 22, height: 22 }} />
                </div>
                <div>
                  <p style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--tf-ink)', margin: '0 0 6px' }}>
                    Your organization&apos;s account has been suspended
                  </p>
                  <p style={{ fontSize: 13.5, color: 'var(--tf-ink-subtle)', lineHeight: 1.6, margin: 0 }}>
                    This account was suspended by the platform administrator. Password reset and sign-in
                    are currently unavailable for all users in this organization.
                  </p>
                </div>
              </div>

              <div className="tf-auth-alert tf-auth-alert--danger" style={{ display: 'block' }}>
                <div className="tf-auth-alert-title" style={{ marginBottom: 2 }}>What to do next</div>
                <div className="tf-auth-alert-body">
                  Please contact <strong style={{ fontWeight: 600 }}>TalentFlow support</strong> to resolve
                  the suspension and restore access to your account.
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="tf-auth-btn tf-auth-btn--outline"
                style={{ borderColor: 'var(--tf-border)', color: 'var(--tf-ink-muted)' }}
              >
                <ArrowLeft style={{ width: 15, height: 15 }} />
                Back to sign in
              </button>
            </div>
          )}

          {/* User Deactivated: user deactivated by tenant admin */}
          {step === 'userDeactivated' && (
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 14, marginBottom: 18 }}>
                <div
                  className="tf-auth-feature-icon"
                  style={{ width: 48, height: 48, background: 'var(--tf-surface-sunken)', color: 'var(--tf-warning)' }}
                >
                  <UserX style={{ width: 22, height: 22 }} />
                </div>
                <div>
                  <p style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--tf-ink)', margin: '0 0 6px' }}>
                    Your account has been deactivated
                  </p>
                  <p style={{ fontSize: 13.5, color: 'var(--tf-ink-subtle)', lineHeight: 1.6, margin: 0 }}>
                    A workspace administrator has deactivated your account. You won&apos;t be able to reset
                    your password until the account is reactivated.
                  </p>
                </div>
              </div>

              <div className="tf-auth-alert" style={{ display: 'block' }}>
                <div className="tf-auth-alert-title" style={{ marginBottom: 2 }}>What to do next</div>
                <div className="tf-auth-alert-body">
                  Please contact your <strong style={{ fontWeight: 600 }}>organization administrator</strong> to
                  reactivate your account. Once reactivated, you&apos;ll be able to reset your password.
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="tf-auth-btn tf-auth-btn--outline"
                style={{ borderColor: 'var(--tf-border)', color: 'var(--tf-ink-muted)' }}
              >
                <ArrowLeft style={{ width: 15, height: 15 }} />
                Back to sign in
              </button>
            </div>
          )}

          {/* Step 4: Success */}
          {step === 'success' && (
            <div className="tf-ok">
              <ResetSuccessArt />

              <h3 className="tf-ok-title">All set!</h3>
              <p className="tf-ok-copy">
                Your password has been reset successfully.
                <br />
                You will be redirected to sign in shortly.
              </p>

              <div className="tf-ok-panel">
                <span className="tf-ok-panel-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="24" height="24">
                    <path fill="currentColor" d="M12 2l7.5 2.7v6.1c0 4.9-3.2 8.4-7.5 9.6-4.3-1.2-7.5-4.7-7.5-9.6V4.7z" />
                    <rect x="9.6" y="11.4" width="4.8" height="4.4" rx="1" fill="#fff" />
                    <path
                      d="M10.6 11.4v-1.5a1.4 1.4 0 0 1 2.8 0v1.5"
                      fill="none"
                      stroke="#fff"
                      strokeWidth="1.1"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                Your account is now more secure.
              </div>

              <button onClick={onClose} className="tf-fp-btn tf-fp-btn--primary tf-ok-btn">
                <LogIn style={{ width: 20, height: 20 }} />
                Return to sign in
              </button>

              <p className="tf-ok-note">
                <span className="tf-ok-note-icon" aria-hidden="true">
                  <Clock style={{ width: 19, height: 19 }} />
                </span>
                Redirecting automatically in{' '}
                <span className="tf-ok-note-count">{redirectIn}</span> seconds...
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
